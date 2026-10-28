/* Cloud backend: the hosted version (server/), used when the page was served
   by the PrePro Studio cloud server (window.__PREPRO_CLOUD__ is set).

   Documents carry a revision number (rev). Saves send the rev they started
   from; if someone else saved in between, the server answers 409 and the
   live-sync layer (./live) merges their version with ours and we save again.
   Printing, downloads and file pickers are the browser ones (./web). */
import type { Backend } from './types';
import type { ProjectData, ProjectSummary } from '@/types';
import type { SpaceData, SpaceSummary } from '@/spaces/types';
import { createWebBackend } from './web';

export type TabId = 'productions' | 'marketing' | 'business' | 'finance' | 'training';
export interface CloudAccount {
  uid: string;
  email: string;
  name: string;
  owner: boolean;
  tabs: Record<TabId, null | { level: string; items: 'all' | string[] }>;
}
interface CloudBoot {
  version: string;
  account: CloudAccount;
}

export const cloudBoot: CloudBoot | undefined = typeof window !== 'undefined' ? (window as any).__PREPRO_CLOUD__ : undefined;

/** Identifies this tab, so the server doesn't echo our own saves back to us. */
export const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

const revs = new Map<string, number>();
export const getRev = (id: string) => revs.get(id) ?? 0;
export const setRev = (id: string, rev: number) => void revs.set(id, rev);

type DocKind = 'project' | 'space';
/** Merge someone else's version into the open document; returns what to save now (or null to stop). */
type ConflictResolver = (id: string, kind: DocKind, remote: unknown, rev: number, mine: unknown) => unknown | null;
let resolver: ConflictResolver | null = null;
export function setConflictResolver(fn: ConflictResolver) {
  resolver = fn;
}
type SavedListener = (id: string, kind: DocKind, doc: unknown, rev: number) => void;
let onSaved: SavedListener | null = null;
export function setSavedListener(fn: SavedListener) {
  onSaved = fn;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { 'X-Client-Id': clientId, ...((init.headers as Record<string, string>) ?? {}) };
  if (typeof init.body === 'string') headers['Content-Type'] ??= 'application/json';
  const r = await fetch(path, { credentials: 'same-origin', ...init, headers });
  if (r.status === 401) {
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new Error('Signed out');
  }
  if (!r.ok && r.status !== 409) {
    let msg = '';
    try {
      msg = (await r.json()).error;
    } catch {
      /* not json */
    }
    throw new Error(msg || `Server error ${r.status}`);
  }
  return r;
}
const getJson = async <T>(path: string) => (await (await api(path)).json()) as T;
const sendJson = (path: string, body: unknown, method = 'POST') => api(path, { method, body: JSON.stringify(body) });
const enc = encodeURIComponent;
/** Files bigger than this upload straight to Cloud Storage. */
const DIRECT_UPLOAD_FROM = 24 * 1024 * 1024;

export async function fetchDoc<T>(id: string): Promise<{ doc: T; rev: number }> {
  const r = await api(`/api/docs/${enc(id)}`);
  const rev = Number(r.headers.get('X-Rev') || '1');
  return { doc: (await r.json()) as T, rev };
}

async function loadDoc<T>(id: string): Promise<T> {
  const { doc, rev } = await fetchDoc<T>(id);
  setRev(id, rev);
  return doc;
}

async function saveDoc(kind: DocKind, doc: { id: string }): Promise<void> {
  let cur: { id: string } = doc;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await api(`/api/docs/${enc(cur.id)}`, { method: 'PUT', body: JSON.stringify(cur), headers: { 'X-Base-Rev': String(getRev(cur.id)) } });
    if (r.status !== 409) {
      const { rev } = await r.json();
      setRev(cur.id, rev);
      onSaved?.(cur.id, kind, cur, rev);
      return;
    }
    // someone else saved first: take their version, merge ours in, try again
    const latest = await fetchDoc<unknown>(cur.id);
    setRev(cur.id, latest.rev);
    const merged = resolver?.(cur.id, kind, latest.doc, latest.rev, cur);
    if (!merged) return;
    cur = merged as { id: string };
  }
  throw new Error('Could not save: the document keeps changing. Try again in a moment.');
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function createCloudBackend(): Backend {
  const web = createWebBackend();
  let prefs: { hiddenDemos?: { project?: boolean; space?: boolean } } | null = null;
  const loadPrefs = async () => (prefs ??= ((await getJson<{ prefs?: typeof prefs }>('/api/me')).prefs ?? {}) as NonNullable<typeof prefs>);
  return {
    kind: 'cloud',
    async info() {
      const p = await loadPrefs();
      return { version: cloudBoot?.version ?? '1.0.0', platform: 'cloud', hiddenDemos: p.hiddenDemos ?? {}, account: cloudBoot?.account };
    },
    financePin: {
      async status() {
        if (!cloudBoot?.account.owner) return { set: false };
        return getJson('/api/finance-pin');
      },
      async verify(pin) {
        return (await sendJson('/api/finance-pin/verify', { pin })).json();
      },
      async set(current, next) {
        return (await sendJson('/api/finance-pin', { current, next })).json();
      },
    },
    async setDemosHidden(patch) {
      const p = await loadPrefs();
      const hiddenDemos = { ...(p.hiddenDemos ?? {}), ...patch };
      prefs = (await (await sendJson('/api/prefs', { hiddenDemos })).json()) as NonNullable<typeof prefs>;
      return prefs.hiddenDemos ?? hiddenDemos;
    },

    listProjects: () => getJson<ProjectSummary[]>('/api/projects'),
    loadProject: (id) => loadDoc<ProjectData>(id),
    async createProject(p) {
      await sendJson('/api/docs', { type: 'project', doc: p });
      setRev(p.id, 1);
    },
    saveProject: (p) => saveDoc('project', p),
    async deleteProject(id) {
      await api(`/api/docs/${enc(id)}`, { method: 'DELETE' });
    },
    async duplicateProject(id, newId, newTitle) {
      await sendJson(`/api/docs/${enc(id)}/duplicate`, { newId, newTitle });
    },

    listSpaces: () => getJson<SpaceSummary[]>('/api/spaces'),
    loadSpace: (id) => loadDoc<SpaceData>(id),
    async createSpace(s) {
      await sendJson('/api/docs', { type: 'space', doc: s });
      setRev(s.id, 1);
    },
    saveSpace: (s) => saveDoc('space', s),
    async deleteSpace(id) {
      await api(`/api/docs/${enc(id)}`, { method: 'DELETE' });
    },
    async duplicateSpace(id, newId, newTitle) {
      await sendJson(`/api/docs/${enc(id)}/duplicate`, { newId, newTitle });
    },

    async importAsset(docId, bytes, ext) {
      // big files (videos) go straight to the bucket: requests through the server stop at 32 MB
      if (bytes.length > DIRECT_UPLOAD_FROM) {
        const up = await (await sendJson(`/api/docs/${enc(docId)}/assets/upload`, { ext, size: bytes.length })).json();
        if (up.uploadUrl) {
          const put = await fetch(up.uploadUrl, { method: 'PUT', body: bytes as BodyInit, headers: { 'Content-Type': up.contentType } });
          if (!put.ok) throw new Error(`Upload failed (${put.status})`);
          return up.name as string;
        }
      }
      const r = await api(`/api/docs/${enc(docId)}/assets?ext=${enc(ext)}`, { method: 'POST', body: bytes as BodyInit, headers: { 'Content-Type': 'application/octet-stream' } });
      return (await r.json()).name as string;
    },
    async readAsset(docId, name) {
      const r = await fetch(this.assetUrl(docId, name), { credentials: 'same-origin' });
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    },
    assetUrl(docId, name) {
      return `/api/docs/${enc(docId)}/assets/${enc(name)}`;
    },
    async prepareAssets() {
      /* assets load straight from the server */
    },

    exportPdf: (job) => web.exportPdf(job),
    printPdf: (job) => web.printPdf(job),
    saveFile: (opts) => web.saveFile(opts),
    openFiles: (opts) => web.openFiles(opts),
    openExternal: (url) => web.openExternal?.(url),

    async readAllProjectFiles(id) {
      const files = await getJson<{ path: string; data: string }[]>(`/api/docs/${enc(id)}/files`);
      return files.map((f) => ({ path: f.path, data: fromB64(f.data) }));
    },
    async writeProjectFiles(id, title, files) {
      await sendJson('/api/archive', { id, title, files: files.map((f) => ({ path: f.path, data: toB64(f.data) })) });
    },

    listBackups: (id) => getJson(`/api/docs/${enc(id)}/backups`),
    restoreBackup: (id, name) => getJson(`/api/docs/${enc(id)}/backups/${enc(name)}`),
  };
}

/* ------------------------------------------------------------ review links (server/reviews.mjs) */

export interface ReviewItemFeedback {
  decision: '' | 'approve' | 'changes' | 'comment';
  comment: string;
}
export interface ReviewResponse {
  id: string;
  name: string;
  at: string;
  decision: ReviewItemFeedback['decision'];
  overall: string;
  items: Record<string, ReviewItemFeedback>;
}
export interface ReviewLink {
  token: string;
  docId: string;
  title: string;
  message: string;
  sections: string[];
  /** items picked per section; a section without picks shares all of its items */
  picks?: Record<string, string[]>;
  showNotes: boolean;
  createdByName: string;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  views: number;
  lastViewedAt?: string;
  responses: ReviewResponse[];
}
export interface NewReviewLink {
  title: string;
  message: string;
  sections: string[];
  picks?: Record<string, string[]>;
  showNotes: boolean;
  /** days until it stops working; 0 = never */
  days: number;
}

/** Review links of a Marketing Space: no-sign-in pages for feedback on Brand Kit sections. */
export const reviewApi = {
  list: (docId: string) => getJson<ReviewLink[]>(`/api/docs/${enc(docId)}/reviews`),
  create: async (docId: string, body: NewReviewLink) => (await (await sendJson(`/api/docs/${enc(docId)}/reviews`, body)).json()) as ReviewLink,
  change: async (docId: string, token: string, patch: Partial<NewReviewLink> & { revoked?: boolean }) => (await (await sendJson(`/api/docs/${enc(docId)}/reviews/${enc(token)}`, patch, 'PATCH')).json()) as ReviewLink,
  remove: async (docId: string, token: string) => void (await api(`/api/docs/${enc(docId)}/reviews/${enc(token)}`, { method: 'DELETE' })),
  url: (token: string) => `${location.origin}/review/${token}`,
};
