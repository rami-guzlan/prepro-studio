/* Sign-in, sessions and who-sees-what.

   - Accounts and passwords live in Identity Platform (self sign-up is off).
   - The owner is OWNER_EMAIL (set at deploy time, not changeable in the app).
   - Everyone else is invited by the owner: an invite link lets them set a
     password once. Their access is stored in _system/access.json:
       users[uid] = { email, name, disabled, epoch, tabs: { productions, marketing, business } }
       tab = null | { level: 'edit', items: 'all' | [docId, …] }
   - Personal Finances and Training are owner only, always.
   - Sessions are signed cookies (HMAC, SESSION_SECRET). Turning a person off
     or changing their access bumps their epoch, which ends their sessions. */
import crypto from 'node:crypto';
import { identity } from './gcp.mjs';
import { readJson, updateJson } from './storage.mjs';

export const TABS = ['productions', 'marketing', 'business', 'finance', 'training'];
export const SHAREABLE_TABS = ['productions', 'marketing', 'business'];
export const OWNER_ONLY_TABS = ['finance', 'training'];

const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'pps';
const SESSION_DAYS = 14;
const INVITE_DAYS = 7;
const ACCESS_KEY = '_system/access.json';

if (!SECRET || SECRET.length < 32) {
  if (process.env.STORAGE === 'gcs') throw new Error('SESSION_SECRET must be set (32+ characters)');
  console.warn('[auth] SESSION_SECRET not set: using a random one (sessions end on restart)');
}
const secret = SECRET || crypto.randomBytes(32).toString('hex');

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const hmac = (s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');

export function sign(value) {
  return `${value}.${hmac(value)}`;
}
export function unsign(signed) {
  const i = String(signed || '').lastIndexOf('.');
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const want = hmac(value);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return value;
}

/* ------------------------------------------------------------ access file */

export function createAccess(store) {
  let cache = null;
  let cacheAt = 0;

  async function load(force = false) {
    if (!force && cache && Date.now() - cacheAt < 5000) return cache;
    cache = (await readJson(store, ACCESS_KEY, { users: {}, invites: {} })).value;
    cache.users ??= {};
    cache.invites ??= {};
    cacheAt = Date.now();
    return cache;
  }

  async function update(fn) {
    cache = await updateJson(store, ACCESS_KEY, { users: {}, invites: {} }, (a) => {
      a.users ??= {};
      a.invites ??= {};
      return fn(a) ?? a;
    });
    cacheAt = Date.now();
    return cache;
  }

  const isOwnerEmail = (email) => !!OWNER_EMAIL && String(email || '').toLowerCase() === OWNER_EMAIL;

  /** Public view of a person (what /api/me and the Team page use). */
  function account(uid, rec) {
    const owner = isOwnerEmail(rec.email);
    const tabs = owner ? Object.fromEntries(TABS.map((t) => [t, { level: 'edit', items: 'all' }])) : Object.fromEntries(SHAREABLE_TABS.map((t) => [t, rec.tabs?.[t] ?? null]));
    return { uid, email: rec.email, name: rec.name || rec.email, owner, tabs, epoch: rec.epoch || 0 };
  }

  async function userById(uid) {
    const a = await load();
    const rec = a.users[uid];
    if (!rec || rec.disabled) return null;
    return account(uid, rec);
  }

  /* ---------------- sessions */

  function sessionCookie(uid, epoch, secure) {
    const exp = Date.now() + SESSION_DAYS * 86400000;
    const v = sign(`${uid}~${epoch}~${exp}`);
    return `${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
  }

  function clearCookie(secure) {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  }

  /** The signed-in person for a request, or null. */
  async function fromRequest(req) {
    const raw = parseCookies(req.headers.cookie)[COOKIE];
    const v = raw && unsign(raw);
    if (!v) return null;
    const [uid, epoch, exp] = v.split('~');
    if (!uid || Number(exp) < Date.now()) return null;
    const user = await userById(uid);
    if (!user || String(user.epoch) !== epoch) return null;
    return user;
  }

  async function login(email, password) {
    email = String(email || '').trim().toLowerCase();
    const { uid } = await identity.signIn(email, password);
    const a = await load(true);
    let rec = a.users[uid];
    if (!rec && isOwnerEmail(email)) {
      await update((x) => {
        x.users[uid] = { email, name: 'Owner', epoch: 0, createdAt: new Date().toISOString() };
      });
      rec = cache.users[uid];
    }
    if (!rec || rec.disabled) throw new Error('This login has no access to PrePro Studio. Ask the owner to invite you.');
    return account(uid, rec);
  }

  /* ---------------- invites (owner) */

  async function invite(origin, { email, name, tabs }) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email address.');
    const existing = await identity.lookupEmail(email);
    const uid = existing?.uid ?? (await identity.create(email, name || ''));
    if (existing?.disabled) await identity.update(uid, { disabled: false });
    const token = randomToken();
    await update((a) => {
      const prev = a.users[uid];
      a.users[uid] = {
        email,
        name: name || prev?.name || '',
        epoch: prev?.epoch ?? 0,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
        tabs: isOwnerEmail(email) ? undefined : cleanTabs(tabs ?? prev?.tabs),
        disabled: false,
      };
      for (const [h, inv] of Object.entries(a.invites)) if (inv.uid === uid || inv.expires < Date.now()) delete a.invites[h];
      a.invites[sha256(token)] = { uid, expires: Date.now() + INVITE_DAYS * 86400000 };
    });
    return { uid, link: `${origin}/invite?token=${token}` };
  }

  async function inviteInfo(token) {
    const a = await load(true);
    const inv = a.invites[sha256(token)];
    if (!inv || inv.expires < Date.now()) return null;
    const rec = a.users[inv.uid];
    return rec ? { uid: inv.uid, email: rec.email, name: rec.name } : null;
  }

  async function acceptInvite(token, password) {
    if (String(password || '').length < 10) throw httpError(400, 'Use at least 10 characters.');
    const info = await inviteInfo(token);
    if (!info) throw httpError(400, 'This link has expired or was already used. Ask the owner for a new one.');
    await identity.update(info.uid, { password });
    await update((a) => {
      delete a.invites[sha256(token)];
    });
    return userById(info.uid);
  }

  async function setAccess(uid, patch) {
    await update((a) => {
      const rec = a.users[uid];
      if (!rec) throw httpError(404, 'No such person');
      if (isOwnerEmail(rec.email)) throw httpError(400, 'The owner always has full access.');
      if (patch.tabs) rec.tabs = cleanTabs(patch.tabs);
      if (patch.name != null) rec.name = String(patch.name).slice(0, 80);
      if (patch.disabled != null) rec.disabled = !!patch.disabled;
      rec.epoch = (rec.epoch || 0) + 1; // ends their sessions so the change applies now
    });
    if (patch.disabled != null) await identity.update(uid, { disabled: !!patch.disabled });
  }

  async function removePerson(uid) {
    const a = await load(true);
    const rec = a.users[uid];
    if (!rec) return;
    if (isOwnerEmail(rec.email)) throw httpError(400, 'The owner cannot be removed.');
    await identity.remove(uid).catch(() => {});
    await update((x) => {
      delete x.users[uid];
      for (const [h, inv] of Object.entries(x.invites)) if (inv.uid === uid) delete x.invites[h];
    });
  }

  async function people() {
    const a = await load(true);
    const pending = new Set(Object.values(a.invites).filter((i) => i.expires > Date.now()).map((i) => i.uid));
    return Object.entries(a.users)
      .map(([uid, rec]) => ({ ...account(uid, rec), disabled: !!rec.disabled, invitePending: pending.has(uid), createdAt: rec.createdAt }))
      .sort((x, y) => Number(y.owner) - Number(x.owner) || x.email.localeCompare(y.email));
  }

  /** Give a person access to a document they just created (when they have a chosen-items list). */
  async function grantCreated(user, tab, docId) {
    if (user.owner) return;
    const t = user.tabs[tab];
    if (!t || t.items === 'all' || t.items.includes(docId)) return;
    await update((a) => {
      const rec = a.users[user.uid];
      const tt = rec?.tabs?.[tab];
      if (tt && Array.isArray(tt.items) && !tt.items.includes(docId)) tt.items.push(docId);
    });
  }

  /** Remove a deleted document from everyone's chosen-items lists. */
  async function forgetDoc(docId) {
    await update((a) => {
      for (const rec of Object.values(a.users)) for (const t of Object.values(rec.tabs || {})) if (t && Array.isArray(t.items)) t.items = t.items.filter((i) => i !== docId);
    });
  }

  /** Per-person app preferences (e.g. hidden demo cards). */
  async function setPrefs(uid, patch) {
    await update((a) => {
      const rec = a.users[uid];
      if (rec) rec.prefs = { ...(rec.prefs || {}), ...(patch && typeof patch === 'object' ? patch : {}) };
    });
    return cache.users[uid]?.prefs ?? {};
  }

  return { load, userById, fromRequest, login, sessionCookie, clearCookie, invite, inviteInfo, acceptInvite, setAccess, removePerson, people, grantCreated, forgetDoc, isOwnerEmail, setPrefs };
}

function cleanTabs(tabs) {
  const out = {};
  for (const t of SHAREABLE_TABS) {
    const v = tabs?.[t];
    if (!v) out[t] = null;
    else out[t] = { level: 'edit', items: v.items === 'all' || !Array.isArray(v.items) ? 'all' : v.items.filter((x) => typeof x === 'string').slice(0, 500) };
  }
  return out;
}

/* ------------------------------------------------------------ checks */

/** Which tab a stored document belongs to. */
export function tabOf(entry) {
  if (entry.type === 'project') return 'productions';
  const k = entry.kind || 'marketing';
  return k === 'marketing' ? 'marketing' : k;
}

export function canSee(user, entry) {
  if (!user) return false;
  if (user.owner) return true;
  const tab = tabOf(entry);
  if (OWNER_ONLY_TABS.includes(tab)) return false;
  const t = user.tabs[tab];
  if (!t) return false;
  return t.items === 'all' || t.items.includes(entry.id) || entry.createdBy === user.uid;
}

export const canEdit = (user, entry) => canSee(user, entry);

export function canCreate(user, tab) {
  if (!user) return false;
  if (user.owner) return true;
  if (OWNER_ONLY_TABS.includes(tab)) return false;
  return !!user.tabs[tab];
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
