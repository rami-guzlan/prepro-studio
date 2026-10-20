/* Opening, creating, duplicating and deleting Marketing Spaces. */
import type { SpaceData } from '@/spaces/types';
import { backend } from '@/backend';
import { closeProject, useProjectStore } from '@/store/project';
import { closeSpaceData, openSpaceData, useSpaceStore } from '@/store/space';
import { flushSave } from '@/store/autosave';
import { goHome, navigateSpace, readLS, setHomeTab, writeLS, type SpaceModuleId } from '@/store/app';
import { createSpace, normalizeSpace, type NewSpaceOptions } from '@/spaces/defaults';
import { closeContent, refreshProjectList } from '@/spaces/ui';
import { uid } from '@/lib/id';
import { toast } from '@/ui/Toast';
import { confirmDialog } from '@/ui/Modal';

export async function openSpaceById(id: string, moduleId?: SpaceModuleId) {
  try {
    await flushSave();
    const s = normalizeSpace(await backend.loadSpace(id));
    if (useProjectStore.getState().project) {
      closeProject();
      (window as any).__preproProjectId = undefined;
    }
    await backend.prepareAssets(s.id);
    (window as any).__preproSpaceId = s.id;
    closeContent();
    openSpaceData(s);
    backend.setWindowTitle?.(s.meta.title);
    void refreshProjectList();
    const last = readLS<SpaceModuleId | null>(`prepro.lastSpaceModule.${s.id}`, null);
    navigateSpace(moduleId ?? last ?? 'overview');
    writeLS('prepro.lastSpace', s.id);
    writeLS('prepro.lastProject', null);
  } catch (e) {
    console.error(e);
    toast(`Could not open the space: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

export async function leaveSpace() {
  await flushSave();
  closeContent();
  closeSpaceData();
  (window as any).__preproSpaceId = undefined;
  writeLS('prepro.lastSpace', null);
  backend.setWindowTitle?.('');
  setHomeTab('spaces');
  goHome();
}

/** Close an open space without navigating (used when a project is opened). */
export function closeOpenSpace() {
  if (!useSpaceStore.getState().space) return;
  closeContent();
  closeSpaceData();
  (window as any).__preproSpaceId = undefined;
  writeLS('prepro.lastSpace', null);
}

export interface NewSpaceExtras {
  /** copy the poster of this project as the space cover */
  coverFromProjectId?: string;
}

export async function createSpaceAndOpen(opts: NewSpaceOptions, extras: NewSpaceExtras = {}): Promise<SpaceData | null> {
  try {
    const s = createSpace(opts);
    await backend.createSpace(s);
    if (extras.coverFromProjectId) {
      try {
        const list = await backend.listProjects();
        const src = list.find((p) => p.id === extras.coverFromProjectId);
        if (src?.poster) {
          const bytes = await backend.readAsset(src.id, src.poster);
          if (bytes) {
            s.meta.cover = await backend.importAsset(s.id, bytes, src.poster.split('.').pop() || 'png');
            await backend.saveSpace(s);
          }
        }
      } catch (e) {
        console.warn('cover copy failed', e);
      }
    }
    await openSpaceById(s.id, 'overview');
    return s;
  } catch (e) {
    toast(`Could not create the space: ${e instanceof Error ? e.message : e}`, 'error');
    return null;
  }
}

/** Open the built-in demo space (built the first time). */
export async function openDemoSpace(): Promise<void> {
  try {
    const existing = (await backend.listSpaces()).find((s) => s.demo);
    if (existing) {
      await openSpaceById(existing.id, 'overview');
      return;
    }
    toast('Building the demo space…', 'info', { duration: 2500 });
    const { createSampleSpace } = await import('@/spaces/sample');
    const s = await createSampleSpace();
    await openSpaceById(s.id, 'overview');
    toast('Demo space ready — a film release campaign with every screen filled in. Reset it any time from Help.', 'success', { duration: 6000 });
  } catch (e) {
    toast(`Could not open the demo space: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

/** Help → Reset Demo Marketing Space…: asks, then rebuilds the demo space. */
export async function confirmResetDemoSpace(): Promise<void> {
  const ok = await confirmDialog({ title: 'Reset the demo space?', message: 'Your changes to the demo space are discarded and a fresh copy is built.', confirmLabel: 'Reset demo' });
  if (ok) await resetDemoSpace();
}

export async function resetDemoSpace(): Promise<void> {
  for (const s of (await backend.listSpaces()).filter((x) => x.demo)) await deleteSpace(s.id);
  await openDemoSpace();
}

export async function duplicateSpace(id: string, title: string) {
  await flushSave();
  await backend.duplicateSpace(id, uid('spc'), `${title} (copy)`);
  toast('Space duplicated');
}

export async function deleteSpace(id: string) {
  if (useSpaceStore.getState().space?.id === id) await leaveSpace();
  await backend.deleteSpace(id);
  toast(backend.kind === 'electron' ? 'Space moved to the Recycle Bin' : 'Space deleted');
}
