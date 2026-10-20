/* Opening, creating, importing and archiving projects. */
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import type { ProjectData } from '@/types';
import { backend, setCurrentProjectId } from '@/backend';
import { closeProject, getProject, openProject, useProjectStore } from '@/store/project';
import { createProject, normalizeProject, type NewProjectOptions } from '@/store/defaults';
import { flushSave } from '@/store/autosave';
import { goHome, navigate, readLS, setHomeTab, writeLS, useApp, type ModuleId } from '@/store/app';
import { syncCharactersDraft } from '@/derived/script';
import { uid } from '@/lib/id';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui/Toast';
import { confirmDialog } from '@/ui/Modal';
import { importScriptFile } from '@/script-core/importers';
import { closeOpenSpace, openSpaceById } from './spaceActions';

export async function openProjectById(id: string, moduleId?: ModuleId) {
  try {
    await flushSave();
    const raw = await backend.loadProject(id);
    const p = normalizeProject(raw);
    syncCharactersDraft(p as any);
    closeOpenSpace();
    await backend.prepareAssets(p.id);
    (window as any).__preproProjectId = p.id;
    openProject(p);
    backend.setWindowTitle?.(p.meta.title);
    const last = readLS<ModuleId | null>(`prepro.lastModule.${p.id}`, null);
    navigate(moduleId ?? last ?? 'overview');
    writeLS('prepro.lastProject', p.id);
    writeLS('prepro.lastSpace', null);
  } catch (e) {
    console.error(e);
    toast(`Could not open project: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

export async function leaveProject() {
  await flushSave();
  closeProject();
  writeLS('prepro.lastProject', null);
  (window as any).__preproProjectId = undefined;
  backend.setWindowTitle?.('');
  setHomeTab('projects');
  goHome();
}

export interface CopyFromOptions {
  sourceId: string;
  /** colour, logo, client, company, director, producer, writer */
  branding: boolean;
  cast: boolean;
  /** crew + contacts & vendors */
  crew: boolean;
  locations: boolean;
}

/** Copy people, locations and branding (with their images) from another project into p (already created on disk). */
async function copyFromProject(p: ProjectData, c: CopyFromOptions) {
  const src = normalizeProject(await backend.loadProject(c.sourceId));
  const assetMap = new Map<string, string | undefined>();
  const copyAsset = async (name?: string): Promise<string | undefined> => {
    if (!name) return undefined;
    if (assetMap.has(name)) return assetMap.get(name);
    let out: string | undefined;
    try {
      const bytes = await backend.readAsset(src.id, name);
      if (bytes) out = await backend.importAsset(p.id, bytes, name.split('.').pop() || 'png');
    } catch {
      out = undefined;
    }
    assetMap.set(name, out);
    return out;
  };
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  if (c.branding) {
    p.meta.color = src.meta.color;
    p.meta.logo = await copyAsset(src.meta.logo);
    for (const k of ['client', 'productionCompany', 'director', 'producer', 'writer'] as const) if (src.meta[k]) p.meta[k] = src.meta[k];
    p.settings.paperSize = src.settings.paperSize;
    p.settings.currency = src.settings.currency;
    p.settings.dateFormat = src.settings.dateFormat;
    p.settings.timeFormat = src.settings.timeFormat;
  }
  if (c.cast) {
    p.cast = clone(src.cast);
    for (const m of p.cast) m.photo = await copyAsset(m.photo);
    // characters are not in this project's script yet: keep them as manual entries
    p.characters = clone(src.characters).map((ch) => ({ ...ch, manual: true }));
  }
  if (c.crew) {
    p.crew = clone(src.crew);
    for (const m of p.crew) m.photo = await copyAsset(m.photo);
    p.contacts = clone(src.contacts);
  }
  if (c.locations) {
    p.locations = clone(src.locations);
    for (const l of p.locations) {
      const photos: string[] = [];
      for (const ph of l.photos) {
        const n = await copyAsset(ph);
        if (n) photos.push(n);
      }
      l.photos = photos;
    }
  }
}

export async function createAndOpen(opts: NewProjectOptions, copyFrom?: CopyFromOptions): Promise<ProjectData | null> {
  try {
    const p = createProject(opts);
    await backend.createProject(p);
    if (copyFrom) {
      try {
        await copyFromProject(p, copyFrom);
        await backend.saveProject(p);
      } catch (e) {
        toast(`Created the project, but copying from the other project failed: ${e instanceof Error ? e.message : e}`, 'error');
      }
    }
    await openProjectById(p.id, 'overview');
    return p;
  } catch (e) {
    toast(`Could not create project: ${e instanceof Error ? e.message : e}`, 'error');
    return null;
  }
}

/** Create a new project from a Fountain / FDX / TXT script file. */
export async function importScriptAsNewProject() {
  const files = await backend.openFiles({
    title: 'Import a screenplay',
    filters: [
      { name: 'Screenplays', extensions: ['fountain', 'spmd', 'fdx', 'txt', 'md'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (!files.length) return;
  const f = files[0];
  try {
    const imported = importScriptFile(f.name, f.data);
    const title = imported.titlePage.title?.trim() || f.name.replace(/\.[^.]+$/, '');
    const p = createProject({ title: titleCase(title), projectType: 'short', scriptMode: 'screenplay' });
    p.script.doc = imported.doc;
    p.script.titlePage = { ...p.script.titlePage, ...imported.titlePage };
    p.scenes = { ...imported.scenes };
    syncCharactersDraft(p as any);
    await backend.createProject(p);
    await openProjectById(p.id, 'script');
    toast(`Imported “${f.name}”`);
  } catch (e) {
    toast(`Import failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : s;
}

/** Open the built-in demo project (builds it the first time). */
export async function openDemo(): Promise<void> {
  try {
    const list = await backend.listProjects();
    const existing = list.find((p) => p.demo);
    if (existing) {
      await openProjectById(existing.id, 'overview');
      return;
    }
    toast('Building the demo project…', 'info', { duration: 2500 });
    const { createSampleProject } = await import('@/sample');
    const p = await createSampleProject();
    await openProjectById(p.id, 'overview');
    toast('Demo project ready — explore every module. Reset it any time from Help → Reset Demo Project.', 'success', { duration: 6000 });
  } catch (e) {
    toast(`Could not open the demo: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

/** Remove a demo card from the home screen (optionally deleting the demo) and say where to find it. */
export async function removeDemoFromHome(kind: 'project' | 'space', opts: { deleteId?: string } = {}): Promise<boolean> {
  const what = kind === 'project' ? 'demo project' : 'demo marketing space';
  const help = kind === 'project' ? 'Help → Open Demo Project' : 'Help → Open Demo Marketing Space';
  if (opts.deleteId) {
    const ok = await confirmDialog({
      title: `Delete the ${what}?`,
      message: `${backend.kind === 'electron' ? 'Its folder goes to the Recycle Bin. ' : ''}You can build a fresh copy any time from ${help}.`,
      confirmLabel: 'Delete demo',
      danger: true,
    });
    if (!ok) return false;
    if (kind === 'project') await deleteProject(opts.deleteId);
    else {
      const { deleteSpace } = await import('./spaceActions');
      await deleteSpace(opts.deleteId);
    }
  }
  await backend.setDemosHidden({ [kind]: true });
  toast(`The ${what} is off your home screen. It is always in the Help menu: ${help}.`, 'info', { duration: 9000 });
  return true;
}

/** Help → Reset Demo Project…: asks, then rebuilds the demo. */
export async function confirmResetDemo(): Promise<void> {
  const ok = await confirmDialog({
    title: 'Reset the demo project?',
    message: 'Your changes to the demo are discarded and a fresh copy is built.' + (backend.kind === 'electron' ? ' The old demo folder goes to the Recycle Bin.' : ''),
    confirmLabel: 'Reset demo',
  });
  if (ok) await resetDemo();
}

/** Replace the demo with a fresh copy (old demo goes to the Recycle Bin on desktop). */
export async function resetDemo(): Promise<void> {
  const list = await backend.listProjects();
  for (const d of list.filter((p) => p.demo)) await deleteProject(d.id);
  await openDemo();
}

export async function duplicateProject(id: string, title: string) {
  const newId = uid('prj');
  await backend.duplicateProject(id, newId, `${title} (copy)`);
  toast('Project duplicated');
}

export async function deleteProject(id: string) {
  if (useProjectStore.getState().project?.id === id) await leaveProject();
  await backend.deleteProject(id);
  toast(backend.kind === 'electron' ? 'Project moved to the Recycle Bin' : 'Project deleted');
}

/** Save the project folder (project.json + assets) as a .zip archive. */
export async function exportArchive(id: string, title: string) {
  try {
    if (useProjectStore.getState().project?.id === id) await flushSave();
    const files = await backend.readAllProjectFiles(id);
    const tree: Record<string, Uint8Array> = {};
    for (const f of files) tree[f.path] = f.data;
    tree['prepro-archive.json'] = strToU8(JSON.stringify({ format: 'prepro-studio-archive', version: 1, exportedAt: new Date().toISOString() }));
    const zip = zipSync(tree, { level: 6 });
    const path = await backend.saveFile({ fileName: `${safeFileName(title)}.prepro.zip`, data: zip, filters: [{ name: 'PrePro Studio archive', extensions: ['zip'] }] });
    if (path) toast('Archive saved', 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
  } catch (e) {
    toast(`Archive failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

/** Import a .zip archive created by exportArchive (always imported as a new copy). */
export async function importArchive(): Promise<string | null> {
  const files = await backend.openFiles({ title: 'Import project archive', filters: [{ name: 'PrePro Studio archive', extensions: ['zip'] }] });
  if (!files.length) return null;
  try {
    const entries = unzipSync(files[0].data);
    const pj = entries['project.json'];
    if (!pj) throw new Error('This zip does not contain a project.json');
    const data = normalizeProject(JSON.parse(strFromU8(pj)));
    const newId = uid('prj');
    data.id = newId;
    const out: { path: string; data: Uint8Array }[] = [{ path: 'project.json', data: strToU8(JSON.stringify(data, null, 1)) }];
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.startsWith('assets/') && !path.endsWith('/')) out.push({ path, data: bytes });
    }
    await backend.writeProjectFiles(newId, data.meta.title, out);
    toast(`Imported “${data.meta.title}”`);
    return newId;
  } catch (e) {
    toast(`Import failed: ${e instanceof Error ? e.message : e}`, 'error');
    return null;
  }
}

export async function revealCurrentProject() {
  const p = useProjectStore.getState().project;
  if (!p) return;
  if (backend.openProjectFolder) await backend.openProjectFolder(p.id);
  else toast('Project folders are only available in the desktop app', 'info');
}

export function currentProjectTitle(): string {
  try {
    return getProject().meta.title;
  } catch {
    return '';
  }
}

export function isProjectOpen(): boolean {
  return useApp.getState().view === 'project' && !!useProjectStore.getState().project;
}

export { setCurrentProjectId };

/** Reopen the project (or Marketing Space) that was open when the app was last closed. */
export async function reopenLastProject() {
  const spaceId = readLS<string | null>('prepro.lastSpace', null);
  if (spaceId) {
    try {
      const spaces = await backend.listSpaces();
      if (spaces.some((x) => x.id === spaceId)) await openSpaceById(spaceId);
    } catch {
      /* ignore */
    }
    return;
  }
  const id = readLS<string | null>('prepro.lastProject', null);
  if (!id) return;
  try {
    const list = await backend.listProjects();
    if (list.some((p) => p.id === id)) await openProjectById(id);
  } catch {
    /* ignore */
  }
}
