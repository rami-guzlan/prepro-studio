/* PrePro Studio cloud server.

   Serves the built app (dist/) to signed-in people, the documents API with
   per-person access checks, live editing over WebSocket, the Team and
   Connect pages, OAuth for AI agents and the MCP endpoint (/mcp).

   Environment:
     PORT              (Cloud Run sets it; default 8080)
     STORAGE           gcs | disk (default disk)
     DATA_BUCKET       bucket name when STORAGE=gcs
     DATA_DIR          folder when STORAGE=disk (default ./cloud-data)
     OWNER_EMAIL       the owner's sign-in email
     SESSION_SECRET    32+ random characters
     GOOGLE_CLOUD_PROJECT, IDENTITY_API_KEY   Identity Platform
     PUBLIC_URL        e.g. https://prepro-studio-xxxx.run.app (optional; taken from the request otherwise) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createStore, readJson, updateJson } from './storage.mjs';
import { createAccess, canSee, canEdit, canCreate, tabOf, httpError, sign, unsign, parseCookies, OWNER_ONLY_TABS } from './auth.mjs';
import { createDocs, isSafeId, isSafeName, kindOf } from './docs.mjs';
import { createLive } from './live.mjs';
import { createOAuth } from './oauth.mjs';
import { loginPage, invitePage, consentPage, errorPage, teamPage, connectPage, safeNext } from './pages.mjs';

const require = createRequire(import.meta.url);
const { createMcpServer } = require('../electron/mcp.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const MAX_JSON = 40 * 1024 * 1024;
const log = { info: console.log, warn: console.warn, error: console.error };

const store = createStore();
const auth = createAccess(store);
const docs = createDocs(store, log);
const live = createLive({ auth, log });
const oauth = createOAuth(store);

/* ------------------------------------------------------------ helpers */

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
const isSecure = (req) => baseUrl(req).startsWith('https://');

const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' };

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = body == null ? '' : isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...headers });
  res.end(data);
}
const html = (res, status, body, headers = {}) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
const redirect = (res, to, headers = {}) => send(res, 302, '', { Location: to, ...headers });

function readBody(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(httpError(413, 'Too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw httpError(400, 'Invalid JSON');
  }
}

/** State-changing browser requests must come from this site. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(baseUrl(req)).host;
  } catch {
    return false;
  }
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', pdf: 'application/pdf', json: 'application/json', txt: 'text/plain; charset=utf-8', csv: 'text/csv', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip', html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', ico: 'image/x-icon', webmanifest: 'application/manifest+json', map: 'application/json' };
const mimeOf = (name) => MIME[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

/* ------------------------------------------------------------ app page */

let indexHtml = null;
function appPage(user) {
  if (!indexHtml) indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const cloud = { version: VERSION, account: { uid: user.uid, email: user.email, name: user.name, owner: user.owner, tabs: user.tabs } };
  const json = JSON.stringify(cloud).replace(/</g, '\\u003c');
  return indexHtml.replace('</head>', `<script>window.__PREPRO_CLOUD__=${json}</script></head>`);
}

function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel || rel === 'index.html') return false;
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const immutable = rel.startsWith('assets/');
  res.writeHead(200, { 'Content-Type': mimeOf(file), 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300', ...SEC_HEADERS });
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ------------------------------------------------------------ MCP (per person) */

const DESCRIBE_KEY = '_system/mcp-describe.json';
const mcpServers = new Map(); // uid -> server

function describeFor(user, d) {
  if (!d) return null;
  if (user.owner) return d;
  return { ...d, tools: d.tools.filter((t) => !OWNER_ONLY_TABS.includes(t._meta?.['prepro/area'])) };
}

function mcpFor(user) {
  let m = mcpServers.get(user.uid);
  if (!m) {
    m = createMcpServer({
      appVersion: VERSION,
      getWebContents: () => live.webContentsFor(user.uid),
      onActivity: (ev) => live.activity(user.uid, ev),
      log: log.error,
      notOpenMessage: 'PrePro Studio is not open for this person. Open it in a browser tab (signed in), then try again. The agent works in that tab.',
    });
    live.onResult(user.uid, (msg) => m.handleResult(msg));
    mcpServers.set(user.uid, m);
  }
  m.owner = user.owner;
  const d = describeFor(user, live.getDescribe());
  if (d) m.setDescribe(d);
  return m;
}

live.onDescribe((d) => {
  for (const [uid, m] of mcpServers) m.setDescribe(describeFor({ owner: m.owner }, d));
  updateJson(store, DESCRIBE_KEY, null, () => d).catch((e) => log.error('describe save failed', e));
});

async function handleMcp(req, res) {
  const base = baseUrl(req);
  const challenge = { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` };
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const who = bearer && (await oauth.resolve(bearer));
  const user = who && (await auth.userById(who.uid));
  if (!user) return send(res, 401, { error: 'Sign in required' }, challenge);
  if (req.method === 'GET') return send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
  if (req.method === 'DELETE') return send(res, 200, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
  let payload;
  try {
    payload = JSON.parse((await readBody(req, 60 * 1024 * 1024)).toString('utf8'));
  } catch (e) {
    return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${e.message}` } });
  }
  const m = mcpFor(user);
  if (Array.isArray(payload)) {
    const out = (await Promise.all(payload.map((p) => m.handle(p)))).filter(Boolean);
    return out.length ? send(res, 200, out) : send(res, 202, null);
  }
  const out = await m.handle(payload);
  return out ? send(res, 200, out) : send(res, 202, null);
}

/* ------------------------------------------------------------ OAuth */

async function handleOAuth(req, res, url) {
  const base = baseUrl(req);
  const p = url.pathname;
  if (p.startsWith('/.well-known/oauth-protected-resource')) return send(res, 200, oauth.resourceMetadata(base), { 'Access-Control-Allow-Origin': '*' });
  if (p.startsWith('/.well-known/oauth-authorization-server') || p.startsWith('/.well-known/openid-configuration')) return send(res, 200, oauth.metadata(base), { 'Access-Control-Allow-Origin': '*' });
  if (p === '/oauth/register' && req.method === 'POST') return send(res, 201, await oauth.register(await readJsonBody(req)), { 'Access-Control-Allow-Origin': '*' });
  if (p === '/oauth/token' && req.method === 'POST') return send(res, 200, await oauth.token(await readJsonBody(req), req.headers.authorization), { 'Access-Control-Allow-Origin': '*' });
  if (p === '/oauth/revoke' && req.method === 'POST') {
    await oauth.revoke((await readJsonBody(req)).token);
    return send(res, 200, {});
  }
  if (p === '/oauth/authorize') {
    const params = req.method === 'POST' ? await readJsonBody(req) : Object.fromEntries(url.searchParams);
    const q = { response_type: params.response_type, client_id: params.client_id, redirect_uri: params.redirect_uri, code_challenge: params.code_challenge, code_challenge_method: params.code_challenge_method, state: params.state ?? '', scope: params.scope ?? '', resource: params.resource ?? '' };
    let client;
    try {
      client = await oauth.checkAuthorize(q);
    } catch (e) {
      return html(res, 400, errorPage('Cannot connect', e.message));
    }
    const user = await auth.fromRequest(req);
    if (!user) return redirect(res, `/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(q)}`)}`);
    const back = (extra) => {
      const u = new URL(q.redirect_uri);
      for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
      if (q.state) u.searchParams.set('state', q.state);
      return redirect(res, u.toString());
    };
    if (req.method === 'POST') {
      if (!sameOrigin(req) || unsign(params.csrf || '') !== `consent~${user.uid}~${q.client_id}`) return html(res, 400, errorPage('Cannot connect', 'This approval form expired. Start the connection again.'));
      if (params.decision !== 'allow') return back({ error: 'access_denied' });
      return back({ code: oauth.issueCode(q, user.uid) });
    }
    return html(res, 200, consentPage({ client, user, params: q, csrf: sign(`consent~${user.uid}~${q.client_id}`) }));
  }
  return send(res, 404, { error: 'Not found' });
}

/* ------------------------------------------------------------ documents API */

async function visibleDocs(user, type) {
  const all = await docs.list(type);
  return all.filter((e) => canSee(user, e)).map((e) => e.summary).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function requireDoc(user, id, edit = false) {
  if (!isSafeId(id)) throw httpError(400, 'Invalid id');
  const e = await docs.entry(id);
  if (!e || !(edit ? canEdit(user, e) : canSee(user, e))) throw httpError(404, 'Not found or no access');
  return e;
}

async function createDoc(user, type, data, clientId) {
  if (!data || !isSafeId(data.id)) throw httpError(400, 'Invalid document');
  const entry = { id: data.id, type, kind: type === 'space' ? kindOf(data) : undefined, createdBy: user.uid };
  const tab = tabOf(entry);
  if (!canCreate(user, tab)) throw httpError(403, 'You do not have access to create this.');
  const r = await docs.create(type, data, user.uid);
  if (!r.ok) throw httpError(409, 'That document already exists');
  await auth.grantCreated(user, tab, data.id);
  live.library();
  return r;
}

async function handleDocs(req, res, url, user) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'docs', id, ...]
  const m = req.method;
  const clientId = String(req.headers['x-client-id'] || '');

  if (url.pathname === '/api/projects' && m === 'GET') return send(res, 200, await visibleDocs(user, 'project'));
  if (url.pathname === '/api/spaces' && m === 'GET') return send(res, 200, await visibleDocs(user, 'space'));
  if (url.pathname === '/api/docs' && m === 'POST') {
    const { type, doc } = await readJsonBody(req);
    if (type !== 'project' && type !== 'space') throw httpError(400, 'type must be project or space');
    return send(res, 200, await createDoc(user, type, doc, clientId));
  }
  if (url.pathname === '/api/archive' && m === 'POST') {
    // import a project archive: { id, title, files: [{ path, data(base64) }] }
    const { id, files } = await readJsonBody(req);
    const pj = files.find((f) => f.path === 'project.json');
    if (!pj) throw httpError(400, 'project.json missing');
    const data = JSON.parse(Buffer.from(pj.data, 'base64').toString('utf8'));
    data.id = id;
    await createDoc(user, 'project', data, clientId);
    for (const f of files) {
      const name = f.path.startsWith('assets/') ? f.path.slice(7) : '';
      if (name && isSafeName(name)) await docs.putAsset(id, name, Buffer.from(f.data, 'base64'), mimeOf(name));
    }
    return send(res, 200, { ok: true });
  }

  const id = parts[2];
  const sub = parts[3];
  if (!sub) {
    if (m === 'GET') {
      await requireDoc(user, id);
      const d = await docs.read(id);
      if (!d) throw httpError(404, 'Not found');
      return send(res, 200, d.json, { 'Content-Type': 'application/json', 'X-Rev': String(d.rev) });
    }
    if (m === 'PUT') {
      const e = await requireDoc(user, id, true);
      const data = await readJsonBody(req);
      if (data.id !== id) throw httpError(400, 'id mismatch');
      // the kind decides who may see it: it can never change through a save
      if (e.type === 'space' && kindOf(data) !== (e.kind || 'marketing')) throw httpError(400, 'A space cannot change its kind');
      if (e.type === 'project' && !data.script) throw httpError(400, 'Not a project');
      const baseRev = req.headers['x-base-rev'];
      const r = await docs.save(id, data, baseRev);
      if (r.conflict) return send(res, 409, { error: 'Changed by someone else', rev: r.rev });
      live.changed(id, r.rev, user, clientId);
      return send(res, 200, { rev: r.rev });
    }
    if (m === 'DELETE') {
      await requireDoc(user, id, true);
      await docs.remove(id);
      await auth.forgetDoc(id);
      live.library();
      return send(res, 200, { ok: true });
    }
  }
  if (sub === 'duplicate' && m === 'POST') {
    const e = await requireDoc(user, id);
    const { newId, newTitle } = await readJsonBody(req);
    if (!isSafeId(newId)) throw httpError(400, 'Invalid id');
    if (!canCreate(user, tabOf(e))) throw httpError(403, 'No access');
    const r = await docs.duplicate(id, newId, String(newTitle || 'Copy').slice(0, 200), user.uid);
    if (!r.ok) throw httpError(409, 'Already exists');
    await auth.grantCreated(user, tabOf(e), newId);
    live.library();
    return send(res, 200, r);
  }
  if (sub === 'files' && m === 'GET') {
    const e = await requireDoc(user, id);
    const files = await docs.allFiles(id);
    const main = e.type === 'project' ? 'project.json' : 'space.json';
    return send(res, 200, files.map((f) => ({ path: f.path ?? main, data: f.data.toString('base64') })));
  }
  if (sub === 'assets') {
    const name = parts[4];
    if (m === 'POST' && !name) {
      await requireDoc(user, id, true);
      const ext = String(url.searchParams.get('ext') || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
      const asset = `a_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}.${ext}`;
      await docs.putAsset(id, asset, await readBody(req, 31 * 1024 * 1024), mimeOf(asset));
      return send(res, 200, { name: asset });
    }
    if (m === 'GET' && isSafeName(name)) {
      await requireDoc(user, id);
      const r = await docs.getAsset(id, name);
      if (!r) throw httpError(404, 'Not found');
      // asset names are unique and never rewritten
      return send(res, 200, r.data, { 'Content-Type': mimeOf(name), 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" });
    }
  }
  if (sub === 'backups' && m === 'GET') {
    await requireDoc(user, id);
    const name = parts[4];
    if (!name) return send(res, 200, await docs.backups(id));
    if (!isSafeName(name)) throw httpError(400, 'Invalid backup');
    const b = await docs.readBackup(id, name);
    if (!b) throw httpError(404, 'Not found');
    return send(res, 200, b);
  }
  throw httpError(404, 'Not found');
}

/* ------------------------------------------------------------ settings */

const SETTINGS_KEY = '_system/settings.json';
const pinHash = (pin, salt) => crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256').toString('hex');
const pinTries = { fails: 0, until: 0 };

async function handleFinancePin(req, res, user, sub) {
  if (!user.owner) throw httpError(403, 'Owner only');
  const s = (await readJson(store, SETTINGS_KEY, {})).value;
  if (req.method === 'GET') return send(res, 200, { set: !!s.financePin?.hash });
  const body = await readJsonBody(req);
  const matches = (pin) => !!s.financePin?.hash && crypto.timingSafeEqual(Buffer.from(pinHash(pin, s.financePin.salt), 'hex'), Buffer.from(s.financePin.hash, 'hex'));
  if (sub === 'verify') {
    if (!s.financePin?.hash) return send(res, 200, { ok: false, error: 'No PIN set' });
    if (Date.now() < pinTries.until) return send(res, 200, { ok: false, error: `Too many attempts. Try again in ${Math.ceil((pinTries.until - Date.now()) / 1000)} s.` });
    const ok = matches(body.pin);
    if (ok) pinTries.fails = 0;
    else if (++pinTries.fails >= 5) {
      pinTries.until = Date.now() + 30000;
      pinTries.fails = 0;
    }
    return send(res, 200, { ok });
  }
  const next = String(body.next || '');
  if (!/^\d{4,12}$/.test(next)) return send(res, 200, { ok: false, error: 'Use 4 to 12 digits' });
  if (s.financePin?.hash && !matches(body.current)) return send(res, 200, { ok: false, error: 'The current PIN is wrong' });
  const salt = crypto.randomBytes(16).toString('hex');
  await updateJson(store, SETTINGS_KEY, {}, (x) => ({ ...x, financePin: { salt, hash: pinHash(next, salt) } }));
  return send(res, 200, { ok: true });
}

/* ------------------------------------------------------------ router */

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;

  if (p === '/health') return send(res, 200, { ok: true, version: VERSION });
  if (p.startsWith('/.well-known/oauth-') || p.startsWith('/.well-known/openid-configuration') || p.startsWith('/oauth/')) return handleOAuth(req, res, url);
  if (p === '/mcp' || p === '/mcp/') return handleMcp(req, res);

  if ((m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') && !sameOrigin(req)) throw httpError(403, 'Cross-site request refused');

  /* ---- signing in */
  if (p === '/login' && m === 'GET') {
    if (await auth.fromRequest(req)) return redirect(res, safeNext(url.searchParams.get('next')));
    return html(res, 200, loginPage(url.searchParams.get('next')));
  }
  if (p === '/api/login' && m === 'POST') {
    const { email, password } = await readJsonBody(req);
    try {
      const user = await auth.login(email, password);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(user.uid, user.epoch, isSecure(req)) });
    } catch (e) {
      return send(res, 401, { error: e.message });
    }
  }
  if ((p === '/logout' && m === 'GET') || (p === '/api/logout' && m === 'POST')) {
    const cookie = auth.clearCookie(isSecure(req));
    return m === 'GET' ? redirect(res, '/login', { 'Set-Cookie': cookie }) : send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }
  if (p === '/invite' && m === 'GET') {
    const token = url.searchParams.get('token') || '';
    return html(res, 200, invitePage(token, token ? await auth.inviteInfo(token) : null));
  }
  if (p === '/api/invite' && m === 'POST') {
    const { token, password } = await readJsonBody(req);
    const user = await auth.acceptInvite(token, password);
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(user.uid, user.epoch, isSecure(req)) });
  }

  /* ---- everything below needs a signed-in person */
  const user = await auth.fromRequest(req);
  if (p === '/api/live') return send(res, 426, { error: 'WebSocket only' });
  if (!user) {
    if (p.startsWith('/api/')) return send(res, 401, { error: 'Signed out. Reload the page to sign in again.' });
    if (m === 'GET' && serveStatic(req, res, p)) return;
    return redirect(res, `/login?next=${encodeURIComponent(p + url.search)}`);
  }

  if (p === '/api/me' && m === 'GET') return send(res, 200, { uid: user.uid, email: user.email, name: user.name, owner: user.owner, tabs: user.tabs, prefs: (await auth.load()).users[user.uid]?.prefs ?? {} });
  if (p === '/api/prefs' && m === 'POST') {
    const patch = await readJsonBody(req);
    const a = await auth.setPrefs(user.uid, patch);
    return send(res, 200, a);
  }
  if (p.startsWith('/api/finance-pin')) return handleFinancePin(req, res, user, p.split('/')[3]);
  if (p === '/api/projects' || p === '/api/spaces' || p === '/api/archive' || p.startsWith('/api/docs')) return handleDocs(req, res, url, user);

  /* ---- AI agent tokens (the Connect page) */
  if (p === '/connect' && m === 'GET') return html(res, 200, connectPage({ user, base: baseUrl(req), pats: await oauth.listPats(user.uid), apps: await oauth.listApps(user.uid) }));
  if (p === '/api/tokens' && m === 'POST') return send(res, 200, await oauth.createPat(user.uid, (await readJsonBody(req)).name));
  if (p.startsWith('/api/tokens/') && m === 'DELETE') {
    await oauth.revokePat(user.uid, decodeURIComponent(p.split('/')[3]));
    return send(res, 200, { ok: true });
  }
  if (p.startsWith('/api/apps/') && m === 'DELETE') {
    await oauth.revokeApp(user.uid, decodeURIComponent(p.split('/')[3]));
    return send(res, 200, { ok: true });
  }

  /* ---- Team (owner only) */
  if (p === '/team' || p.startsWith('/api/team')) {
    if (!user.owner) return p === '/team' ? html(res, 403, errorPage('Owner only', 'Only the owner manages the team.')) : send(res, 403, { error: 'Owner only' });
    if (p === '/team' && m === 'GET') {
      const pick = (list) => list.map((e) => ({ id: e.id, title: e.summary?.title || e.id }));
      const projects = await docs.list('project');
      const spaces = await docs.list('space');
      const docsByTab = { productions: pick(projects), marketing: pick(spaces.filter((e) => (e.kind || 'marketing') === 'marketing')), business: pick(spaces.filter((e) => e.kind === 'business')) };
      return html(res, 200, teamPage({ user, people: await auth.people(), docs: docsByTab }));
    }
    if (p === '/api/team' && m === 'GET') return send(res, 200, { people: await auth.people() });
    if (p === '/api/team' && m === 'POST') return send(res, 200, await auth.invite(baseUrl(req), await readJsonBody(req)));
    const uid = p.split('/')[3];
    if (p.endsWith('/link') && m === 'POST') {
      const person = (await auth.people()).find((x) => x.uid === uid);
      if (!person || person.owner) throw httpError(404, 'No such person');
      return send(res, 200, await auth.invite(baseUrl(req), { email: person.email, name: person.name, tabs: person.tabs }));
    }
    if (m === 'PATCH') {
      const body = await readJsonBody(req);
      await auth.setAccess(uid, body);
      if (body.disabled) await oauth.revokeAllFor(uid);
      live.accessChanged(uid);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      await auth.removePerson(uid);
      await oauth.revokeAllFor(uid);
      live.accessChanged(uid);
      return send(res, 200, { ok: true });
    }
  }

  if (p.startsWith('/api/')) throw httpError(404, 'Not found');

  /* ---- the app */
  if (m !== 'GET' && m !== 'HEAD') throw httpError(405, 'Method not allowed');
  if (serveStatic(req, res, p)) return;
  return html(res, 200, appPage(user), { 'Cache-Control': 'no-store' });
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) log.error(req.method, req.url, e);
    if (res.headersSent) return res.end();
    if (e.oauth) return send(res, status, e.oauth);
    send(res, status, { error: status >= 500 ? 'Server error' : e.message });
  }
});
server.keepAliveTimeout = 65000;
server.requestTimeout = 0;
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/api/live' || !sameOrigin(req)) return socket.destroy();
  live.handleUpgrade(req, socket, head).catch(() => socket.destroy());
});

async function start() {
  await docs.loadIndex();
  const d = (await readJson(store, DESCRIBE_KEY, null)).value;
  if (d) live.setDescribe(d);
  const port = Number(process.env.PORT || 8080);
  server.listen(port, () => log.info(`PrePro Studio cloud listening on :${port} (storage: ${process.env.STORAGE || 'disk'})`));
}

let stopping = false;
async function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log.info(`${sig}: saving open documents`);
  try {
    await docs.flushAll();
  } catch (e) {
    log.error('flush on shutdown failed', e);
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((e) => {
  log.error('start failed', e);
  process.exit(1);
});
