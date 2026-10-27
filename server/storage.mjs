/* Object storage with generations (optimistic concurrency), two drivers:
   - gcs:  a Cloud Storage bucket (production)
   - disk: a local folder (local runs and tests)

   Keys look like "docs/<id>/doc.json". Every object has a generation that
   changes on each write; put() with ifGeneration only writes when the object
   is still at that generation ('0' = only if it doesn't exist yet). */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { gcs } from './gcp.mjs';

function diskStore(root) {
  fs.mkdirSync(root, { recursive: true });
  const file = (key) => {
    const p = path.normalize(path.join(root, key));
    if (!p.startsWith(path.normalize(root))) throw new Error('Bad key');
    return p;
  };
  // generations live in a "<file>.gen" sidecar (a counter), so they are exact
  const genOf = (f) => {
    try {
      return fs.readFileSync(`${f}.gen`, 'utf8').trim() || '1';
    } catch {
      return fs.existsSync(f) ? '1' : '0';
    }
  };
  const write = (f, data) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, f);
    const next = String(Number(genOf(f)) + 1);
    fs.writeFileSync(`${f}.gen`, next);
    return next;
  };
  return {
    async get(key) {
      const f = file(key);
      try {
        return { data: await fsp.readFile(f), generation: genOf(f) };
      } catch {
        return null;
      }
    },
    async put(key, data, { ifGeneration } = {}) {
      const f = file(key);
      if (ifGeneration != null && genOf(f) !== String(ifGeneration)) return null;
      return write(f, data);
    },
    async list(prefix) {
      const out = [];
      const walk = async (dir) => {
        const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (!e.name.endsWith('.tmp') && !e.name.endsWith('.gen')) {
            const name = path.relative(root, p).split(path.sep).join('/');
            if (!name.startsWith(prefix)) continue;
            const st = await fsp.stat(p);
            out.push({ name, generation: genOf(p), size: st.size, updated: st.mtime.toISOString() });
          }
        }
      };
      const base = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
      await walk(path.join(root, base));
      return out;
    },
    async del(key) {
      await fsp.rm(file(key), { force: true });
      await fsp.rm(`${file(key)}.gen`, { force: true });
    },
    async copy(from, to) {
      write(file(to), await fsp.readFile(file(from)));
    },
  };
}

function gcsStore(bucket) {
  return {
    get: (key) => gcs.get(bucket, key),
    put: (key, data, opts) => gcs.put(bucket, key, data, opts),
    list: (prefix) => gcs.list(bucket, prefix),
    del: (key) => gcs.del(bucket, key),
    copy: (from, to) => gcs.copy(bucket, from, to),
  };
}

export function createStore() {
  const driver = process.env.STORAGE || 'disk';
  if (driver === 'gcs') {
    if (!process.env.DATA_BUCKET) throw new Error('DATA_BUCKET is not set');
    return gcsStore(process.env.DATA_BUCKET);
  }
  return diskStore(path.resolve(process.env.DATA_DIR || 'cloud-data'));
}

/* JSON helpers with a small read-modify-write loop for shared system files. */
export async function readJson(store, key, fallback) {
  const r = await store.get(key);
  if (!r) return { value: fallback, generation: '0' };
  return { value: JSON.parse(r.data.toString('utf8')), generation: r.generation };
}

/** Apply fn(value) and write it back, retrying when someone else wrote in between. */
export async function updateJson(store, key, fallback, fn) {
  for (let i = 0; i < 8; i++) {
    const { value, generation } = await readJson(store, key, fallback);
    const next = (await fn(value)) ?? value;
    const gen = await store.put(key, Buffer.from(JSON.stringify(next, null, 1)), { ifGeneration: generation, contentType: 'application/json' });
    if (gen) return next;
  }
  throw new Error(`Could not update ${key}: too many concurrent writes`);
}
