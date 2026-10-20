/* Autosave: writes the open project ~1s after the last change, and on demand
   (Ctrl+S, closing the window, leaving the project). */
import { backend } from '@/backend';
import { useProjectStore } from './project';
import { useApp } from './app';

let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;

/* Editors that buffer changes (e.g. the screenplay editor) register a hook
   that pushes pending edits into the store right before a save. */
const preSaveHooks = new Set<() => void>();
export function registerPreSave(fn: () => void): () => void {
  preSaveHooks.add(fn);
  return () => preSaveHooks.delete(fn);
}

/** Push buffered editor changes into the store now (before reading or replacing them). */
export function runPreSaveHooks() {
  for (const fn of preSaveHooks) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}

async function doSave(): Promise<void> {
  runPreSaveHooks();
  const s = useProjectStore.getState();
  const p = s.project;
  if (!p || s.version === s.savedVersion) return;
  const version = s.version;
  useApp.setState({ saveStatus: 'saving' });
  const now = new Date().toISOString();
  const toSave = { ...p, meta: { ...p.meta, updatedAt: now } };
  try {
    await backend.saveProject(toSave);
    const cur = useProjectStore.getState();
    if (cur.project?.id === p.id) {
      // keep updatedAt in memory without creating a new "change"
      useProjectStore.setState({
        savedVersion: Math.max(cur.savedVersion, version),
        project: cur.project === p ? toSave : cur.project,
      });
    }
    useApp.setState({ saveStatus: 'saved', lastSavedAt: Date.now(), saveError: undefined });
  } catch (e) {
    console.error('Save failed', e);
    useApp.setState({ saveStatus: 'error', saveError: e instanceof Error ? e.message : String(e) });
  }
}

/* Other documents (Marketing Spaces) register their own save so flushSave() saves everything. */
const flushers = new Set<() => Promise<void>>();
export function registerFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}
const unsavedChecks = new Set<() => boolean>();
export function registerUnsavedCheck(fn: () => boolean) {
  unsavedChecks.add(fn);
}

/** Save now (waits for an in-flight save first). Also saves an open Marketing Space. */
export async function flushSave(): Promise<void> {
  await flushProjectSave();
  for (const f of flushers) {
    try {
      await f();
    } catch (e) {
      console.error(e);
    }
  }
}

async function flushProjectSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (saving) await saving;
  saving = doSave().finally(() => {
    saving = null;
  });
  await saving;
  // a change may have happened during the save
  const s = useProjectStore.getState();
  if (s.project && s.version !== s.savedVersion) {
    saving = doSave().finally(() => {
      saving = null;
    });
    await saving;
  }
}

export function hasUnsavedChanges(): boolean {
  const s = useProjectStore.getState();
  return (!!s.project && s.version !== s.savedVersion) || [...unsavedChecks].some((f) => f());
}

let started = false;

export function startAutosave() {
  if (started) return;
  started = true;
  useProjectStore.subscribe((s, prev) => {
    if (!s.project || s.version === prev.version || s.version === s.savedVersion) return;
    if (s.project.id !== prev.project?.id) return; // project just opened
    if (useApp.getState().saveStatus !== 'saving') useApp.setState({ saveStatus: 'idle' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flushSave();
    }, 900);
  });
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
      void flushSave();
      if (backend.kind === 'web') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
  });
}
