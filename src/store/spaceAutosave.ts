/* Autosave for the open Marketing Space (~1 s after the last change, and on
   flushSave(): Ctrl+S, closing the window, leaving the space). */
import { backend } from '@/backend';
import { useSpaceStore } from './space';
import { useApp } from './app';
import { registerFlusher, registerUnsavedCheck } from './autosave';

let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;

async function doSave(): Promise<void> {
  const s = useSpaceStore.getState();
  const sp = s.space;
  if (!sp || s.version === s.savedVersion) return;
  const version = s.version;
  useApp.setState({ saveStatus: 'saving' });
  const toSave = { ...sp, meta: { ...sp.meta, updatedAt: new Date().toISOString() } };
  try {
    await backend.saveSpace(toSave);
    const cur = useSpaceStore.getState();
    if (cur.space?.id === sp.id) useSpaceStore.setState({ savedVersion: Math.max(cur.savedVersion, version), space: cur.space === sp ? toSave : cur.space });
    useApp.setState({ saveStatus: 'saved', lastSavedAt: Date.now(), saveError: undefined });
  } catch (e) {
    console.error('Space save failed', e);
    useApp.setState({ saveStatus: 'error', saveError: e instanceof Error ? e.message : String(e) });
  }
}

export async function flushSpaceSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (saving) await saving;
  saving = doSave().finally(() => (saving = null));
  await saving;
  const s = useSpaceStore.getState();
  if (s.space && s.version !== s.savedVersion) {
    saving = doSave().finally(() => (saving = null));
    await saving;
  }
}

let started = false;

export function startSpaceAutosave() {
  if (started) return;
  started = true;
  registerFlusher(flushSpaceSave);
  registerUnsavedCheck(() => {
    const s = useSpaceStore.getState();
    return !!s.space && s.version !== s.savedVersion;
  });
  useSpaceStore.subscribe((s, prev) => {
    if (!s.space || s.version === prev.version || s.version === s.savedVersion) return;
    if (s.space.id !== prev.space?.id) return;
    if (useApp.getState().saveStatus !== 'saving') useApp.setState({ saveStatus: 'idle' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flushSpaceSave();
    }, 900);
  });
}
