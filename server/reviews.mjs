/* Review links: a no-sign-in page that shows chosen Brand Kit & Assets
   sections of one Marketing Space (images, videos, logos …) and takes
   feedback (approve / needs changes, a comment per item, an overall note).

   Stored in _system/reviews.json: { links: { [token]: record } }. The page
   always shows the space's current assets in those sections, and only the
   files those assets point to can be fetched with the token. */
import { readJson, updateJson } from './storage.mjs';
import { httpError, randomToken } from './auth.mjs';

const KEY = '_system/reviews.json';

/** Brand Kit sections and the asset kinds in each (src/spaces/modules/assets/util.ts). */
export const REVIEW_SECTIONS = {
  logos: { title: 'Logos', kinds: ['logo'] },
  colors: { title: 'Colours', kinds: ['color'] },
  fonts: { title: 'Fonts', kinds: ['font'] },
  images: { title: 'Images & references', kinds: ['image'] },
  templates: { title: 'Templates', kinds: ['template'] },
  video: { title: 'Video / footage', kinds: ['video'] },
  audio: { title: 'Music / sound', kinds: ['audio'] },
  links: { title: 'Links & documents', kinds: ['link', 'doc', 'resource', 'other'] },
};
const KNOWN_KINDS = Object.values(REVIEW_SECTIONS).flatMap((s) => s.kinds);
const sectionOf = (a) => Object.keys(REVIEW_SECTIONS).find((id) => REVIEW_SECTIONS[id].kinds.includes(a.kind)) ?? (KNOWN_KINDS.includes(a.kind) ? null : 'links');

const DECISIONS = ['approve', 'changes', 'comment'];
const MAX_RESPONSES = 200;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const isToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);

export function createReviews(store) {
  const load = async () => (await readJson(store, KEY, { links: {} })).value.links ?? {};
  const update = (fn) => updateJson(store, KEY, { links: {} }, (v) => ({ links: fn(v.links ?? {}) ?? v.links }));

  const live = (r) => !!r && !r.revoked && (!r.expiresAt || r.expiresAt > new Date().toISOString());

  function cleanSections(list) {
    const s = [...new Set((Array.isArray(list) ? list : []).filter((id) => REVIEW_SECTIONS[id]))];
    if (!s.length) throw httpError(400, 'Choose at least one section');
    return s;
  }
  const expiry = (days) => (Number(days) > 0 ? new Date(Date.now() + Number(days) * 86400000).toISOString() : null);

  /** Links of one space, newest first (for the people who can open the space). */
  async function listFor(docId) {
    const links = await load();
    return Object.values(links)
      .filter((r) => r.docId === docId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async function create(docId, user, body) {
    const token = randomToken(24);
    const rec = {
      token,
      docId,
      title: clip(body.title, 160) || 'Review',
      message: clip(body.message, 4000),
      sections: cleanSections(body.sections),
      showNotes: body.showNotes !== false,
      createdBy: user.uid,
      createdByName: user.name || user.email,
      createdAt: new Date().toISOString(),
      expiresAt: expiry(body.days ?? 30),
      revoked: false,
      views: 0,
      responses: [],
    };
    await update((links) => ({ ...links, [token]: rec }));
    return rec;
  }

  async function change(docId, token, body) {
    let out = null;
    await update((links) => {
      const r = links[token];
      if (!r || r.docId !== docId) throw httpError(404, 'No such review link');
      if (body.title != null) r.title = clip(body.title, 160) || r.title;
      if (body.message != null) r.message = clip(body.message, 4000);
      if (body.sections != null) r.sections = cleanSections(body.sections);
      if (body.showNotes != null) r.showNotes = !!body.showNotes;
      if (body.revoked != null) r.revoked = !!body.revoked;
      if (body.days !== undefined) r.expiresAt = expiry(body.days);
      out = r;
      return links;
    });
    return out;
  }

  async function remove(docId, token) {
    await update((links) => {
      if (links[token]?.docId !== docId) throw httpError(404, 'No such review link');
      delete links[token];
      return links;
    });
  }

  /** The record behind a public token, or a 404 (expired and turned-off links look the same as unknown ones). */
  async function open(token) {
    if (!isToken(token)) throw httpError(404, 'This review link does not exist.');
    const r = (await load())[token];
    if (!r) throw httpError(404, 'This review link does not exist.');
    if (!live(r)) throw httpError(410, r.revoked ? 'This review link was turned off.' : 'This review link has expired.');
    return r;
  }

  /** What the reviewer sees: the chosen sections of the space's current assets. */
  function view(r, space) {
    const assets = Array.isArray(space?.assets) ? space.assets : [];
    const sections = r.sections.map((id) => ({
      id,
      title: REVIEW_SECTIONS[id].title,
      items: assets
        .filter((a) => a && sectionOf(a) === id)
        .map((a) => ({
          id: a.id,
          name: a.name || '',
          kind: a.kind,
          notes: r.showNotes ? a.notes || '' : '',
          url: /^https?:\/\//i.test(a.url || '') ? a.url : '',
          // colours and fonts show their value; elsewhere it can be a path on someone's computer
          value: a.kind === 'color' || a.kind === 'font' ? a.value || '' : '',
          tags: a.tags ?? [],
          image: a.image || '',
          file: a.file || '',
          fileName: a.fileName || '',
          fileSize: a.fileSize || 0,
        })),
    }));
    return {
      title: r.title,
      message: r.message,
      from: r.createdByName,
      space: space?.meta?.title || '',
      expiresAt: r.expiresAt,
      sections,
    };
  }

  /** Files the reviewer may fetch: those of the assets on the page. */
  function allowedFiles(v) {
    const s = new Set();
    for (const sec of v.sections) for (const it of sec.items) for (const n of [it.image, it.file]) if (n) s.add(n);
    return s;
  }

  async function seen(token) {
    await update((links) => {
      const r = links[token];
      if (r) {
        r.views = (r.views || 0) + 1;
        r.lastViewedAt = new Date().toISOString();
      }
      return links;
    }).catch(() => {});
  }

  async function respond(token, v, body) {
    const ids = new Set(v.sections.flatMap((s) => s.items.map((i) => i.id)));
    const items = {};
    for (const [id, x] of Object.entries(body.items && typeof body.items === 'object' ? body.items : {})) {
      if (!ids.has(id) || !x || typeof x !== 'object') continue;
      const decision = DECISIONS.includes(x.decision) ? x.decision : '';
      const comment = clip(x.comment, 4000);
      if (decision || comment) items[id] = { decision, comment };
    }
    const name = clip(body.name, 80);
    if (!name) throw httpError(400, 'Add your name so they know who it is from.');
    const overall = clip(body.overall, 8000);
    const decision = DECISIONS.includes(body.decision) ? body.decision : '';
    if (!overall && !decision && !Object.keys(items).length) throw httpError(400, 'Add a decision or a comment first.');
    const resp = { id: randomToken(9), name, at: new Date().toISOString(), decision, overall, items };
    let rec = null;
    await update((links) => {
      const r = links[token];
      if (!live(r)) throw httpError(410, 'This review link is no longer open.');
      r.responses ??= [];
      if (r.responses.length >= MAX_RESPONSES) throw httpError(429, 'This review link has reached its limit of responses.');
      r.responses.push(resp);
      rec = r;
      return links;
    });
    return { rec, resp };
  }

  return { listFor, create, change, remove, open, view, allowedFiles, seen, respond };
}
