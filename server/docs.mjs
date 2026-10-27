/* Productions and Spaces in object storage.

   Layout:
     docs/<id>/doc.json          the project or space
     docs/<id>/assets/<name>     its images and files
     docs/<id>/backups/<stamp>.json
     _trash/<id>-<stamp>/...     deleted documents (never erased by the app)
     _system/index.json          { docs: { id: { type, kind, title, createdBy, rev, summary } } }

   Live editing writes a document about once a second per person. Cloud
   Storage allows roughly one write per second to the same object, so the
   server keeps open documents in memory (the source of truth, versioned by
   `rev`) and writes them to storage at most every FLUSH_MS. This needs ONE
   server instance (Cloud Run --max-instances 1). Pending writes are flushed
   on shutdown. */
import { readJson, updateJson } from './storage.mjs';

const FLUSH_MS = 2500;
const BACKUP_EVERY_MS = 10 * 60 * 1000;
const KEEP_BACKUPS = 40;
const INDEX_KEY = '_system/index.json';

export const isSafeId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(s);
export const isSafeName = (s) => typeof s === 'string' && s.length > 0 && s.length < 200 && !/[\\/]|\.\./.test(s);

export function projectSummary(data) {
  const m = data.meta || {};
  return {
    id: data.id,
    title: m.title || 'Untitled Project',
    subtitle: m.subtitle,
    projectType: m.projectType || 'other',
    status: m.status || 'development',
    color: m.color || '#7c5cff',
    poster: m.poster,
    updatedAt: m.updatedAt || new Date(0).toISOString(),
    createdAt: m.createdAt || new Date(0).toISOString(),
    demo: !!m.demo,
  };
}

const KINDS = ['marketing', 'business', 'finance', 'training'];
export const kindOf = (data) => (KINDS.includes(data?.meta?.kind) ? data.meta.kind : 'marketing');

export function spaceSummary(data) {
  const m = data.meta || {};
  const content = Array.isArray(data.content) ? data.content : [];
  const today = new Date().toISOString().slice(0, 10);
  let nextPost;
  for (const c of content)
    for (const p of c.posts || []) if (p.date && p.date >= today && p.status !== 'published' && p.status !== 'skipped' && (!nextPost || p.date < nextPost)) nextPost = p.date;
  return {
    id: data.id,
    title: m.title || 'Untitled Space',
    kind: kindOf(data),
    subtype: data.business?.profile?.type || undefined,
    type: m.type || 'other',
    color: m.color || '#e64980',
    emoji: m.emoji,
    cover: m.cover,
    description: m.description,
    updatedAt: m.updatedAt || new Date(0).toISOString(),
    createdAt: m.createdAt || new Date(0).toISOString(),
    demo: !!m.demo,
    contentCount: content.length,
    publishedCount: content.filter((c) => c.stage === 'published').length,
    nextPost,
  };
}

const summaryOf = (type, data) => (type === 'project' ? projectSummary(data) : spaceSummary(data));

export function createDocs(store, log = console) {
  let index = null; // { docs: {} }
  const live = new Map(); // id -> { data, json, rev, dirty, timer, gen, lastBackup }
  let indexDirty = false;
  let indexTimer = null;

  async function loadIndex() {
    if (index) return index;
    const r = await readJson(store, INDEX_KEY, null);
    if (r.value) index = r.value;
    else {
      // first start (or lost index): rebuild from the documents themselves
      index = { docs: {} };
      for (const o of await store.list('docs/')) {
        const m = o.name.match(/^docs\/([^/]+)\/doc\.json$/);
        if (!m) continue;
        try {
          const data = JSON.parse((await store.get(o.name)).data.toString('utf8'));
          const type = data.script || data.scenes ? 'project' : 'space';
          index.docs[m[1]] = { type, kind: type === 'space' ? kindOf(data) : undefined, createdBy: null, rev: 1, summary: summaryOf(type, data) };
        } catch (e) {
          log.error('index rebuild: could not read', o.name, e);
        }
      }
      await writeIndex();
    }
    index.docs ??= {};
    return index;
  }

  async function writeIndex() {
    await updateJson(store, INDEX_KEY, { docs: {} }, () => index);
    indexDirty = false;
  }

  function scheduleIndex() {
    indexDirty = true;
    if (indexTimer) return;
    indexTimer = setTimeout(async () => {
      indexTimer = null;
      try {
        await writeIndex();
      } catch (e) {
        log.error('index write failed', e);
        scheduleIndex();
      }
    }, FLUSH_MS);
  }

  /** Entry for access checks: { id, type, kind, createdBy } or null. */
  async function entry(id) {
    const ix = await loadIndex();
    const e = ix.docs[id];
    return e ? { id, ...e } : null;
  }

  async function list(type) {
    const ix = await loadIndex();
    return Object.entries(ix.docs)
      .filter(([, e]) => e.type === type)
      .map(([id, e]) => ({ id, ...e }));
  }

  async function open(id) {
    let d = live.get(id);
    if (d) return d;
    const e = (await loadIndex()).docs[id];
    if (!e) return null;
    const r = await store.get(`docs/${id}/doc.json`);
    if (!r) return null;
    d = { json: r.data.toString('utf8'), rev: e.rev || 1, dirty: false, timer: null, gen: r.generation, lastBackup: 0 };
    d.data = JSON.parse(d.json);
    live.set(id, d);
    return d;
  }

  async function flush(id) {
    const d = live.get(id);
    if (!d || !d.dirty) return;
    if (d.timer) {
      clearTimeout(d.timer);
      d.timer = null;
    }
    d.dirty = false;
    const json = d.json;
    try {
      if (Date.now() - d.lastBackup > BACKUP_EVERY_MS) {
        d.lastBackup = Date.now();
        await backup(id).catch((e) => log.error('backup failed', id, e));
      }
      const gen = await store.put(`docs/${id}/doc.json`, Buffer.from(json), { ifGeneration: d.gen, contentType: 'application/json' });
      if (gen) d.gen = gen;
      else {
        // someone else (another instance) wrote it: keep ours, the newest edit, but log it
        log.warn(`doc ${id} changed in storage outside this server; overwriting with the live copy`);
        d.gen = await store.put(`docs/${id}/doc.json`, Buffer.from(json), { contentType: 'application/json' });
      }
    } catch (e) {
      log.error('flush failed', id, e);
      d.dirty = true;
      schedule(id);
    }
  }

  function schedule(id) {
    const d = live.get(id);
    if (!d || d.timer) return;
    d.timer = setTimeout(() => {
      d.timer = null;
      void flush(id);
    }, FLUSH_MS);
  }

  async function backup(id) {
    const r = await store.get(`docs/${id}/doc.json`);
    if (!r) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await store.put(`docs/${id}/backups/${stamp}.json`, r.data, { contentType: 'application/json' });
    const all = (await store.list(`docs/${id}/backups/`)).map((o) => o.name).sort();
    for (const name of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await store.del(name).catch(() => {});
  }

  /** Read a document: { data, json, rev } */
  async function read(id) {
    const d = await open(id);
    if (!d) return null;
    return { data: d.data, json: d.json, rev: d.rev };
  }

  /** Save with a rev check. Returns { ok, rev } or { ok:false, rev, conflict:true }. */
  async function save(id, data, baseRev) {
    const d = await open(id);
    if (!d) return { ok: false, missing: true };
    if (baseRev != null && Number(baseRev) !== d.rev) return { ok: false, conflict: true, rev: d.rev };
    d.data = data;
    d.json = JSON.stringify(data, null, 1);
    d.rev += 1;
    d.dirty = true;
    const ix = await loadIndex();
    const e = ix.docs[id];
    e.rev = d.rev;
    e.summary = summaryOf(e.type, data);
    scheduleIndex();
    schedule(id);
    return { ok: true, rev: d.rev };
  }

  async function create(type, data, createdBy) {
    const ix = await loadIndex();
    if (ix.docs[data.id]) return { ok: false, exists: true };
    const json = JSON.stringify(data, null, 1);
    const gen = await store.put(`docs/${data.id}/doc.json`, Buffer.from(json), { ifGeneration: '0', contentType: 'application/json' });
    if (!gen) return { ok: false, exists: true };
    ix.docs[data.id] = { type, kind: type === 'space' ? kindOf(data) : undefined, createdBy, rev: 1, summary: summaryOf(type, data) };
    live.set(data.id, { data, json, rev: 1, dirty: false, timer: null, gen, lastBackup: Date.now() });
    await writeIndex();
    return { ok: true, rev: 1 };
  }

  async function remove(id) {
    await flush(id);
    const stamp = Date.now().toString(36);
    for (const o of await store.list(`docs/${id}/`)) {
      await store.copy(o.name, `_trash/${id}-${stamp}/${o.name.slice(`docs/${id}/`.length)}`);
      await store.del(o.name);
    }
    live.delete(id);
    const ix = await loadIndex();
    delete ix.docs[id];
    await writeIndex();
  }

  async function duplicate(id, newId, newTitle, createdBy) {
    const src = await read(id);
    const e = (await loadIndex()).docs[id];
    const data = JSON.parse(src.json);
    data.id = newId;
    const now = new Date().toISOString();
    data.meta = { ...(data.meta || {}), title: newTitle, createdAt: now, updatedAt: now };
    if (e.type === 'space') data.meta.demo = false;
    const res = await create(e.type, data, createdBy);
    if (!res.ok) return res;
    for (const o of await store.list(`docs/${id}/assets/`)) await store.copy(o.name, `docs/${newId}/assets/${o.name.split('/').pop()}`);
    return res;
  }

  async function putAsset(id, name, bytes, contentType) {
    await store.put(`docs/${id}/assets/${name}`, bytes, { contentType });
  }
  async function getAsset(id, name) {
    return store.get(`docs/${id}/assets/${name}`);
  }
  /** Stream an asset (with an optional byte range), so big videos never sit in memory. */
  async function streamAsset(id, name, range) {
    return store.stream(`docs/${id}/assets/${name}`, range);
  }
  /** An upload address the browser PUTs a big file to (null: send it to the server instead). */
  async function uploadUrl(id, name, opts) {
    return store.startUpload(`docs/${id}/assets/${name}`, opts);
  }

  async function allFiles(id) {
    await flush(id);
    const out = [];
    for (const o of await store.list(`docs/${id}/`)) {
      const rel = o.name.slice(`docs/${id}/`.length);
      if (rel.startsWith('backups/')) continue;
      const r = await store.get(o.name);
      out.push({ path: rel === 'doc.json' ? null : rel, data: r.data });
    }
    return out;
  }

  async function backups(id) {
    await flush(id);
    return (await store.list(`docs/${id}/backups/`))
      .map((o) => ({ name: o.name.split('/').pop(), date: o.updated, size: o.size }))
      .sort((a, b) => (a.name < b.name ? 1 : -1));
  }

  async function readBackup(id, name) {
    const r = await store.get(`docs/${id}/backups/${name}`);
    return r ? JSON.parse(r.data.toString('utf8')) : null;
  }

  async function flushAll() {
    await Promise.all([...live.keys()].map((id) => flush(id)));
    if (indexDirty || indexTimer) {
      if (indexTimer) clearTimeout(indexTimer);
      indexTimer = null;
      await writeIndex();
    }
  }

  return { loadIndex, entry, list, read, save, create, remove, duplicate, putAsset, getAsset, streamAsset, uploadUrl, allFiles, backups, readBackup, flushAll };
}
