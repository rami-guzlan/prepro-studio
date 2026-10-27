/* Opening, creating, duplicating and deleting spaces of every kind (Marketing Spaces,
   Business Management, Personal Finances, Training). */
import type { SpaceData, SpaceKind } from '@/spaces/types';
import { KIND_INFO } from '@/spaces/kinds';
import { backend } from '@/backend';
import { closeProject, useProjectStore } from '@/store/project';
import { closeSpaceData, openSpaceData, useSpaceStore } from '@/store/space';
import { flushSave } from '@/store/autosave';
import { goHome, navigateSpace, readLS, setHomeTab, writeLS, type HomeTab, type SpaceModuleId } from '@/store/app';
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

const HOME_TAB: Record<SpaceKind, HomeTab> = { marketing: 'spaces', business: 'business', finance: 'finance', training: 'training' };

export async function leaveSpace() {
  const kind = useSpaceStore.getState().space?.meta.kind ?? 'marketing';
  await flushSave();
  closeContent();
  closeSpaceData();
  (window as any).__preproSpaceId = undefined;
  writeLS('prepro.lastSpace', null);
  backend.setWindowTitle?.('');
  setHomeTab(HOME_TAB[kind]);
  goHome();
}

/** The one Personal Finances / Training space (created the first time). */
export async function singletonSpaceId(kind: 'finance' | 'training', create = true): Promise<string | null> {
  const hit = (await backend.listSpaces()).find((x) => (x.kind ?? 'marketing') === kind);
  if (hit) return hit.id;
  if (!create) return null;
  const s = createSpace({ title: KIND_INFO[kind].label, kind, type: 'other' });
  await backend.createSpace(s);
  return s.id;
}

/** Open Personal Finances or Training. Finances may open while locked (agents use
   them): the workspace then covers the screen until the user enters the PIN. */
export async function openSingleton(kind: 'finance' | 'training', moduleId?: SpaceModuleId): Promise<boolean> {
  const id = await singletonSpaceId(kind);
  if (!id) return false;
  await openSpaceById(id, moduleId);
  return useSpaceStore.getState().space?.id === id;
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
  // finance / training are one-per-user
  await flushSave();
  await backend.duplicateSpace(id, uid('spc'), `${title} (copy)`);
  toast('Space duplicated');
}

export async function deleteSpace(id: string) {
  if (useSpaceStore.getState().space?.id === id) await leaveSpace();
  await backend.deleteSpace(id);
  toast(backend.kind === 'electron' ? 'Space moved to the Recycle Bin' : 'Space deleted');
}
