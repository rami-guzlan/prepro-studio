/* Browser fallback backend: projects + assets in IndexedDB, PDFs via the
   browser print dialog ("Save as PDF"), files via downloads. Used when the
   UI runs outside Electron (e.g. `npm run dev` in a browser). */
import type { Backend, PdfJob } from './types';
import type { ProjectData, ProjectSummary } from '@/types';
import type { SpaceData, SpaceSummary } from '@/spaces/types';
import { extToMime } from '@/lib/images';

const DB_NAME = 'prepro-studio';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects');
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets');
        if (!d.objectStoreNames.contains('backups')) d.createObjectStore('backups');
        if (!d.objectStoreNames.contains('spaces')) d.createObjectStore('spaces');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  const t = d.transaction(store, mode);
  const res = await reqP(fn(t.objectStore(store)));
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return res;
}

async function keysWithPrefix(store: string, prefix: string): Promise<string[]> {
  const range = IDBKeyRange.bound(prefix, prefix + '￿');
  return (await tx(store, 'readonly', (s) => s.getAllKeys(range))) as string[];
}

const urlCache = new Map<string, string>();

function summary(p: ProjectData): ProjectSummary {
  return {
    id: p.id,
    title: p.meta.title,
    subtitle: p.meta.subtitle,
    projectType: p.meta.projectType,
    status: p.meta.status,
    color: p.meta.color,
    poster: p.meta.poster,
    updatedAt: p.meta.updatedAt,
    createdAt: p.meta.createdAt,
    demo: !!p.meta.demo,
  };
}

function spaceSummary(s: SpaceData): SpaceSummary {
  const today = new Date().toISOString().slice(0, 10);
  const dates = s.content.flatMap((c) => c.posts.filter((p) => p.date && p.date >= today && p.status !== 'published' && p.status !== 'skipped').map((p) => p.date!)).sort();
  return {
    id: s.id,
    title: s.meta.title,
    type: s.meta.type,
    color: s.meta.color,
    emoji: s.meta.emoji,
    cover: s.meta.cover,
    description: s.meta.description,
    updatedAt: s.meta.updatedAt,
    createdAt: s.meta.createdAt,
    demo: !!s.meta.demo,
    contentCount: s.content.length,
    publishedCount: s.content.filter((c) => c.stage === 'published').length,
    nextPost: dates[0],
  };
}

function download(data: string | Uint8Array, fileName: string, mime = 'application/octet-stream') {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function printHtmlInIframe(job: PdfJob): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    iframe.srcdoc = job.html;
    iframe.onload = async () => {
      const w = iframe.contentWindow as (Window & { __printReady?: () => Promise<unknown> }) | null;
      try {
        if (w?.__printReady) await Promise.race([w.__printReady(), new Promise((r) => setTimeout(r, 15000))]);
        const prevTitle = document.title;
        document.title = job.fileName.replace(/\.pdf$/i, '');
        w?.focus();
        w?.print();
        document.title = prevTitle;
      } finally {
        setTimeout(() => {
          iframe.remove();
          resolve();
        }, 1000);
      }
    };
    document.body.appendChild(iframe);
  });
}

function readHiddenDemos(): { project?: boolean; space?: boolean } {
  try {
    return JSON.parse(localStorage.getItem('prepro.hiddenDemos') || '{}') || {};
  } catch {
    return {};
  }
}

export function createWebBackend(): Backend {
  return {
    kind: 'web',
    async info() {
      return { version: '1.0.0', platform: 'browser', hiddenDemos: readHiddenDemos() };
    },
    async setDemosHidden(patch) {
      const next = { ...readHiddenDemos(), ...patch };
      try {
        localStorage.setItem('prepro.hiddenDemos', JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    },
    async listProjects() {
      const all = (await tx('projects', 'readonly', (s) => s.getAll())) as ProjectData[];
      return all.map(summary).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async loadProject(id) {
      const p = (await tx('projects', 'readonly', (s) => s.get(id))) as ProjectData | undefined;
      if (!p) throw new Error('Project not found');
      return p;
    },
    async createProject(p) {
      await tx('projects', 'readwrite', (s) => s.put(p, p.id));
    },
    async saveProject(p) {
      // rolling backups (max one per 10 minutes, keep 20)
      try {
        const keys = (await keysWithPrefix('backups', `${p.id}/`)).sort();
        const last = keys[keys.length - 1];
        const lastTime = last ? Number(last.split('/')[1]) : 0;
        if (Date.now() - lastTime > 10 * 60 * 1000) {
          const current = await tx('projects', 'readonly', (s) => s.get(p.id));
          if (current) await tx('backups', 'readwrite', (s) => s.put(current, `${p.id}/${Date.now()}`));
          for (const k of keys.slice(0, Math.max(0, keys.length - 19))) await tx('backups', 'readwrite', (s) => s.delete(k));
        }
      } catch (e) {
        console.warn('backup failed', e);
      }
      await tx('projects', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(p)), p.id));
    },
    async deleteProject(id) {
      await tx('projects', 'readwrite', (s) => s.delete(id));
      for (const k of await keysWithPrefix('assets', `${id}/`)) await tx('assets', 'readwrite', (s) => s.delete(k));
      for (const k of await keysWithPrefix('backups', `${id}/`)) await tx('backups', 'readwrite', (s) => s.delete(k));
    },
    async duplicateProject(id, newId, newTitle) {
      const p = (await tx('projects', 'readonly', (s) => s.get(id))) as ProjectData;
      const copy: ProjectData = JSON.parse(JSON.stringify(p));
      copy.id = newId;
      copy.meta.title = newTitle;
      copy.meta.createdAt = copy.meta.updatedAt = new Date().toISOString();
      await tx('projects', 'readwrite', (s) => s.put(copy, newId));
      for (const k of await keysWithPrefix('assets', `${id}/`)) {
        const blob = await tx('assets', 'readonly', (s) => s.get(k));
        await tx('assets', 'readwrite', (s) => s.put(blob, `${newId}/${k.split('/')[1]}`));
      }
    },
    async listSpaces() {
      const all = (await tx('spaces', 'readonly', (s) => s.getAll())) as SpaceData[];
      return all.map(spaceSummary).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async loadSpace(id) {
      const sp = (await tx('spaces', 'readonly', (s) => s.get(id))) as SpaceData | undefined;
      if (!sp) throw new Error('Space not found');
      return sp;
    },
    async createSpace(sp) {
      await tx('spaces', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(sp)), sp.id));
    },
    async saveSpace(sp) {
      await tx('spaces', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(sp)), sp.id));
    },
    async deleteSpace(id) {
      await tx('spaces', 'readwrite', (s) => s.delete(id));
      for (const k of await keysWithPrefix('assets', `${id}/`)) await tx('assets', 'readwrite', (s) => s.delete(k));
    },
    async duplicateSpace(id, newId, newTitle) {
      const sp = (await tx('spaces', 'readonly', (s) => s.get(id))) as SpaceData;
      const copy: SpaceData = JSON.parse(JSON.stringify(sp));
      copy.id = newId;
      copy.meta.title = newTitle;
      copy.meta.demo = false;
      copy.meta.createdAt = copy.meta.updatedAt = new Date().toISOString();
      await tx('spaces', 'readwrite', (s) => s.put(copy, newId));
      for (const k of await keysWithPrefix('assets', `${id}/`)) {
        const blob = await tx('assets', 'readonly', (s) => s.get(k));
        await tx('assets', 'readwrite', (s) => s.put(blob, `${newId}/${k.split('/')[1]}`));
      }
    },
    async importAsset(projectId, bytes, ext) {
      const name = `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'}`;
      const blob = new Blob([bytes as BlobPart], { type: extToMime(ext) });
      await tx('assets', 'readwrite', (s) => s.put(blob, `${projectId}/${name}`));
      urlCache.set(`${projectId}/${name}`, URL.createObjectURL(blob));
      return name;
    },
    async readAsset(projectId, name) {
      const blob = (await tx('assets', 'readonly', (s) => s.get(`${projectId}/${name}`))) as Blob | undefined;
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
    assetUrl(projectId, name) {
      return urlCache.get(`${projectId}/${name}`) ?? '';
    },
    async prepareAssets(projectId) {
      const keys = await keysWithPrefix('assets', `${projectId}/`);
      for (const k of keys) {
        if (urlCache.has(k)) continue;
        const blob = (await tx('assets', 'readonly', (s) => s.get(k))) as Blob | undefined;
        if (blob) urlCache.set(k, URL.createObjectURL(blob));
      }
    },
    async exportPdf(job) {
      await printHtmlInIframe(job);
      return null;
    },
    async printPdf(job) {
      await printHtmlInIframe(job);
    },
    async saveFile({ fileName, data }) {
      const ext = fileName.split('.').pop() ?? '';
      download(data, fileName, typeof data === 'string' ? 'text/plain;charset=utf-8' : extToMime(ext));
      return null;
    },
    openFiles({ filters, multiple }) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = !!multiple;
        const exts = (filters ?? []).flatMap((f) => f.extensions).filter((e) => e !== '*');
        if (exts.length) input.accept = exts.map((e) => '.' + e).join(',');
        input.onchange = async () => {
          const files = Array.from(input.files ?? []);
          resolve(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
        };
        input.oncancel = () => resolve([]);
        input.click();
      });
    },
    async readAllProjectFiles(id) {
      const p = await tx('projects', 'readonly', (s) => s.get(id));
      const out = [{ path: 'project.json', data: new TextEncoder().encode(JSON.stringify(p, null, 1)) }];
      for (const k of await keysWithPrefix('assets', `${id}/`)) {
        const blob = (await tx('assets', 'readonly', (s) => s.get(k))) as Blob;
        out.push({ path: `assets/${k.split('/')[1]}`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      return out;
    },
    async writeProjectFiles(id, _title, files) {
      for (const f of files) {
        if (f.path === 'project.json') {
          const p = JSON.parse(new TextDecoder().decode(f.data));
          p.id = id;
          await tx('projects', 'readwrite', (s) => s.put(p, id));
        } else if (f.path.startsWith('assets/')) {
          const name = f.path.slice('assets/'.length);
          const blob = new Blob([f.data as BlobPart], { type: extToMime(name.split('.').pop() ?? '') });
          await tx('assets', 'readwrite', (s) => s.put(blob, `${id}/${name}`));
        }
      }
    },
    async listBackups(id) {
      const keys = (await keysWithPrefix('backups', `${id}/`)).sort().reverse();
      return keys.map((k) => ({ name: k.split('/')[1], date: new Date(Number(k.split('/')[1])).toISOString(), size: 0 }));
    },
    async restoreBackup(id, name) {
      return (await tx('backups', 'readonly', (s) => s.get(`${id}/${name}`))) as ProjectData;
    },
    openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
  };
}
