/* Live editing for the hosted version.

   One WebSocket per tab (/api/live) carries:
   - presence: who else has this Production / Space open
   - "changed": someone saved the open document. We fetch it and merge it
     into ours with merge3 (base = the last version we both had). The undo
     history is rebased the same way, so Ctrl+Z never wipes their work.
     If we had unsaved edits, the merged result is saved by autosave.
   - the MCP relay: an AI agent's tool calls for this person run in this tab,
     exactly like the desktop app runs them in its window.

   Saves that lose a race (409) are merged by the same code (setConflictResolver). */
import { create } from 'zustand';
import { useProjectStore } from '@/store/project';
import { useSpaceStore } from '@/store/space';
import { flushSave, runPreSaveHooks } from '@/store/autosave';
import { normalizeProject } from '@/store/defaults';
import { normalizeSpace } from '@/spaces/defaults';
import { merge3 } from '@/lib/merge3';
import { toast } from '@/ui';
import { clientId, fetchDoc, getRev, setConflictResolver, setRev, setSavedListener } from './cloud';

export interface Person {
  uid: string;
  name: string;
  email: string;
}
export const usePresence = create<{ people: Person[]; connected: boolean }>(() => ({ people: [], connected: false }));

type Kind = 'project' | 'space';

/* ------------------------------------------------------------ open document */

/** The last version of each open document that we and the server agreed on. */
const base = new Map<string, unknown>();

function openDoc(): { kind: Kind; id: string } | null {
  const sp = useSpaceStore.getState().space;
  if (sp) return { kind: 'space', id: sp.id };
  const p = useProjectStore.getState().project;
  return p ? { kind: 'project', id: p.id } : null;
}

/** Merge a remote version into the open store; returns the merged document. */
function applyRemote(kind: Kind, id: string, remoteRaw: unknown, rev: number): unknown | null {
  if (kind === 'project') runPreSaveHooks();
  const st = kind === 'space' ? useSpaceStore.getState() : useProjectStore.getState();
  const cur = (kind === 'space' ? (st as ReturnType<typeof useSpaceStore.getState>).space : (st as ReturnType<typeof useProjectStore.getState>).project) as { id: string } | null;
  if (!cur || cur.id !== id) return null;
  const remote = kind === 'space' ? normalizeSpace(remoteRaw as any) : normalizeProject(remoteRaw as any);
  const b = base.get(id) ?? cur;
  const merged = merge3<typeof cur>(b, cur, remote);
  const rebase = (list: unknown[]) => list.map((h) => merge3(b, h, remote));
  const dirty = st.version !== st.savedVersion;
  const next = {
    version: st.version + 1,
    // nothing of ours was pending: the merged result IS the saved version
    savedVersion: dirty ? st.savedVersion : st.version + 1,
    past: rebase(st.past as unknown[]),
    future: rebase(st.future as unknown[]),
    lastCoalesce: null,
  };
  if (kind === 'space') useSpaceStore.setState({ ...next, space: merged as any, past: next.past as any, future: next.future as any });
  else useProjectStore.setState({ ...next, project: merged as any, past: next.past as any, future: next.future as any });
  base.set(id, remote);
  setRev(id, rev);
  return merged;
}

const pulling = new Set<string>();
/** changes announced while a pull was already running: fetched right after it */
const pullAgain = new Map<string, number>();
async function pull(id: string, rev: number, by?: string) {
  const o = openDoc();
  if (!o || o.id !== id || rev <= getRev(id)) return;
  if (pulling.has(id)) {
    pullAgain.set(id, Math.max(pullAgain.get(id) ?? 0, rev));
    return;
  }
  pulling.add(id);
  try {
    const latest = await fetchDoc<unknown>(id);
    if (latest.rev > getRev(id)) {
      applyRemote(o.kind, id, latest.doc, latest.rev);
      if (by) lastEditor = by;
    }
  } catch (e) {
    console.warn('live pull failed', e);
  } finally {
    pulling.delete(id);
    const again = pullAgain.get(id);
    pullAgain.delete(id);
    if (again != null) void pull(id, again);
  }
}

/** Fetch the open document if it changed while this tab wasn't listening (sleep, background, network drop). */
function catchUp() {
  const o = openDoc();
  if (o) void pull(o.id, Number.MAX_SAFE_INTEGER);
}
let lastEditor = '';

/* ------------------------------------------------------------ socket */

/** A tab the server opened for an AI agent while its person has none open (server/headless.mjs). */
const isAgentTab = new URLSearchParams(location.search).get('agent') === '1';

let ws: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** last time anything arrived on the socket; the server answers pings, so silence means it is dead */
let lastHeard = Date.now();
const HEARTBEAT_MS = 20000;
const DEAD_AFTER_MS = 50000;
let sentOpen: string | null = null;
let agentReady: unknown = null;
const callHandlers = new Set<(req: any) => void>();
const activityHandlers = new Set<(ev: any) => void>();

function sendMsg(msg: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/api/live?client=${encodeURIComponent(clientId)}${isAgentTab ? '&agent=1' : ''}`);
  ws.onopen = () => {
    retry = 0;
    lastHeard = Date.now();
    usePresence.setState({ connected: true });
    sentOpen = null;
    syncOpen();
    if (agentReady) sendMsg({ t: 'mcp:ready', describe: agentReady });
    // catch up on anything saved while we were disconnected
    const o = openDoc();
    if (o) void pull(o.id, Number.MAX_SAFE_INTEGER);
  };
  ws.onmessage = (ev) => {
    lastHeard = Date.now();
    let msg: any;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    switch (msg.t) {
      case 'changed':
        void pull(msg.id, msg.rev, msg.by);
        break;
      case 'presence': {
        const o = openDoc();
        if (o && o.id === msg.id) {
          const before = new Set(usePresence.getState().people.map((p) => p.uid));
          usePresence.setState({ people: msg.people });
          for (const p of msg.people as Person[]) if (!before.has(p.uid)) toast(`${p.name} is here too`, 'info', { duration: 3000 });
        }
        break;
      }
      case 'library':
        window.dispatchEvent(new Event('prepro:library'));
        break;
      case 'access':
        toast('Your access changed. Reloading…', 'info');
        setTimeout(() => location.reload(), 1200);
        break;
      case 'mcp:call':
        for (const fn of callHandlers) fn({ reqId: msg.reqId, name: msg.name, args: msg.args });
        break;
      case 'mcp:activity':
        for (const fn of activityHandlers) fn(msg.ev);
        break;
    }
  };
  ws.onclose = () => {
    usePresence.setState({ connected: false, people: [] });
    ws = null;
    const wait = Math.min(15000, 500 * 2 ** retry++);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, wait);
  };
}

function syncOpen() {
  const o = openDoc();
  const id = o?.id ?? null;
  if (id === sentOpen) return;
  sentOpen = id;
  usePresence.setState({ people: [] });
  sendMsg({ t: 'open', id });
}

/* ------------------------------------------------------------ MCP relay */

/** Same shape as the desktop bridge (window.prepro.mcp) used by src/agent. */
export const cloudAgentBridge = {
  onCall(fn: (req: { reqId: string; name: string; args: unknown }) => void) {
    callHandlers.add(fn);
    return () => callHandlers.delete(fn);
  },
  async respond(msg: unknown) {
    // save the agent's change before answering, so it is stored even if no one keeps this tab open
    await flushSave().catch((e) => console.warn('save before agent reply failed', e));
    sendMsg({ t: 'mcp:result', ...(msg as object) });
  },
  ready(describe: unknown) {
    agentReady = describe;
    sendMsg({ t: 'mcp:ready', describe });
  },
  onActivity(fn: (ev: any) => void) {
    activityHandlers.add(fn);
    return () => activityHandlers.delete(fn);
  },
};

/* ------------------------------------------------------------ start */

let started = false;
export function startLive() {
  if (started) return;
  started = true;
  (window as any).__preproFlush = () => flushSave();

  // remember the agreed version of each document as it opens and saves
  const track = (kind: Kind, doc: { id: string } | null, prevId: string | undefined) => {
    if (doc && doc.id !== prevId) base.set(doc.id, doc);
    if (doc?.id !== prevId) syncOpen();
  };
  useSpaceStore.subscribe((s, prev) => track('space', s.space, prev.space?.id));
  useProjectStore.subscribe((s, prev) => track('project', s.project, prev.project?.id));
  setSavedListener((id, _kind, doc) => base.set(id, doc));
  setConflictResolver((id, kind, remote, rev) => applyRemote(kind, id, remote, rev));

  // back on this tab (or the network): reconnect now if needed and fetch what changed meanwhile
  const wake = () => {
    sendMsg({ t: 'active' });
    if (!ws && retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
      retry = 0;
      connect();
    } else if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastHeard > DEAD_AFTER_MS) ws.close();
    catchUp();
  };
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
  // heartbeat: a socket can die silently (laptop sleep, phone in a pocket, Wi-Fi change)
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastHeard > DEAD_AFTER_MS) ws.close();
    else sendMsg({ t: 'ping' });
  }, HEARTBEAT_MS);
  connect();
}

export function lastRemoteEditor() {
  return lastEditor;
}
