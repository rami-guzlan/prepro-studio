/* Google Cloud REST helpers (no SDKs): access tokens, Cloud Storage objects and
   Identity Platform accounts.

   Access tokens come from the Cloud Run metadata server, or locally from
   `gcloud auth print-access-token` (the developer's own sign-in). */
import { execFile } from 'node:child_process';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || '';
const API_KEY = process.env.IDENTITY_API_KEY || '';

let cached = { token: '', until: 0 };

async function metadataToken() {
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(2000),
  });
  if (!r.ok) throw new Error(`metadata token ${r.status}`);
  const j = await r.json();
  return { token: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
}

function gcloudToken() {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
    execFile(cmd, ['auth', 'print-access-token'], { shell: process.platform === 'win32', timeout: 30000 }, (err, out) => {
      if (err) reject(new Error('Could not get a Google access token. Run: gcloud auth login'));
      else resolve({ token: String(out).trim(), until: Date.now() + 40 * 60 * 1000 });
    });
  });
}

export async function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token;
  try {
    cached = await metadataToken();
  } catch {
    cached = await gcloudToken();
  }
  return cached.token;
}

async function gfetch(url, init = {}) {
  const headers = { Authorization: `Bearer ${await accessToken()}`, ...(PROJECT ? { 'x-goog-user-project': PROJECT } : {}), ...(init.headers || {}) };
  return fetch(url, { ...init, headers });
}

async function fail(r, what) {
  let msg = '';
  try {
    const j = await r.json();
    msg = j.error?.message || JSON.stringify(j);
  } catch {
    msg = await r.text().catch(() => '');
  }
  const e = new Error(`${what}: ${r.status} ${msg}`);
  e.status = r.status;
  e.gmessage = msg;
  return e;
}

/* ------------------------------------------------------------ Cloud Storage */

const GCS = 'https://storage.googleapis.com/storage/v1';
const GCS_UP = 'https://storage.googleapis.com/upload/storage/v1';
const enc = encodeURIComponent;

export const gcs = {
  /** { data: Buffer, generation: string } or null */
  async get(bucket, name) {
    const r = await gfetch(`${GCS}/b/${bucket}/o/${enc(name)}?alt=media`);
    if (r.status === 404) return null;
    if (!r.ok) throw await fail(r, `read ${name}`);
    return { data: Buffer.from(await r.arrayBuffer()), generation: r.headers.get('x-goog-generation') || '0' };
  },
  /** ifGeneration: '0' = only create; a generation = only if unchanged. Returns the new generation, or null on a precondition failure. */
  async put(bucket, name, data, { ifGeneration, contentType = 'application/octet-stream' } = {}) {
    const q = new URLSearchParams({ uploadType: 'media', name });
    if (ifGeneration != null) q.set('ifGenerationMatch', String(ifGeneration));
    const r = await gfetch(`${GCS_UP}/b/${bucket}/o?${q}`, { method: 'POST', headers: { 'Content-Type': contentType }, body: data });
    if (r.status === 412) return null;
    if (!r.ok) throw await fail(r, `write ${name}`);
    return String((await r.json()).generation);
  },
  async list(bucket, prefix) {
    const out = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ prefix, fields: 'items(name,generation,size,updated),nextPageToken' });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await gfetch(`${GCS}/b/${bucket}/o?${q}`);
      if (!r.ok) throw await fail(r, `list ${prefix}`);
      const j = await r.json();
      for (const it of j.items || []) out.push({ name: it.name, generation: String(it.generation), size: Number(it.size), updated: it.updated });
      pageToken = j.nextPageToken || '';
    } while (pageToken);
    return out;
  },
  async del(bucket, name) {
    const r = await gfetch(`${GCS}/b/${bucket}/o/${enc(name)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw await fail(r, `delete ${name}`);
  },
  async copy(bucket, from, to) {
    let token = '';
    do {
      const q = token ? `?rewriteToken=${enc(token)}` : '';
      const r = await gfetch(`${GCS}/b/${bucket}/o/${enc(from)}/rewriteTo/b/${bucket}/o/${enc(to)}${q}`, { method: 'POST' });
      if (!r.ok) throw await fail(r, `copy ${from}`);
      const j = await r.json();
      token = j.done ? '' : j.rewriteToken;
    } while (token);
  },
};

/* ------------------------------------------------------------ Identity Platform */

const IDT = 'https://identitytoolkit.googleapis.com/v1';

export const identity = {
  configured: () => !!(PROJECT && API_KEY),
  /** Password sign-in. Returns { uid, email } or throws with a friendly message. */
  async signIn(email, password) {
    const r = await fetch(`${IDT}/accounts:signInWithPassword?key=${enc(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!r.ok) {
      const e = await fail(r, 'sign in');
      const m = e.gmessage || '';
      if (/TOO_MANY_ATTEMPTS/.test(m)) throw new Error('Too many attempts. Wait a few minutes and try again.');
      if (/USER_DISABLED/.test(m)) throw new Error('This login has been turned off.');
      throw new Error('That email and password do not match.');
    }
    const j = await r.json();
    return { uid: j.localId, email: String(j.email || email).toLowerCase() };
  },
  async lookupEmail(email) {
    const r = await gfetch(`${IDT}/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) });
    if (!r.ok) throw await fail(r, 'look up account');
    const u = (await r.json()).users?.[0];
    return u ? { uid: u.localId, email: u.email, disabled: !!u.disabled } : null;
  },
  async create(email, displayName) {
    const r = await gfetch(`${IDT}/projects/${PROJECT}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, displayName, emailVerified: false }) });
    if (!r.ok) throw await fail(r, 'create account');
    return (await r.json()).localId;
  },
  async update(uid, patch) {
    const body = { localId: uid };
    if (patch.password != null) body.password = patch.password;
    if (patch.disabled != null) body.disableUser = patch.disabled;
    if (patch.displayName != null) body.displayName = patch.displayName;
    const r = await gfetch(`${IDT}/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const e = await fail(r, 'update account');
      if (/WEAK_PASSWORD/.test(e.gmessage || '')) throw new Error('Use a longer password (at least 10 characters).');
      throw e;
    }
  },
  async remove(uid) {
    const r = await gfetch(`${IDT}/projects/${PROJECT}/accounts:delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
    if (!r.ok) throw await fail(r, 'delete account');
  },
};
