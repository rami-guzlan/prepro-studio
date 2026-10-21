/* Generic data tools: describe / list / get / add / update / delete / move for
   every collection, plus get_fields / set_fields for single values. They work
   on whatever is open: a project, or a Marketing Space (activeDoc()). */
import type { Draft } from 'immer';
import type { ProjectData } from '@/types';
import { uid } from '@/lib/id';
import { locationForScene, dayDates } from '@/derived/project';
import { syncCharactersDraft } from '@/derived/script';
import { addShots, moveShotsToScene, UNASSIGNED } from '@/modules/shots/shotData';
import { activeBoardId, boardDraftFor, nextSlots } from '@/modules/script/mind/ops';
import { catTotal, insertIndex as budgetInsertIndex, lineTotal as budgetLineTotal, nextCode } from '@/modules/budget/calc';
import { lineTotal as gearLineTotal, shootDayCount } from '@/modules/gear/logic';
import { PLATFORM_BY_ID } from '@/spaces/constants';
import { defaultChecklist, makeChecklistItem, makeContent, makePost, makeShot } from '@/spaces/defaults';
import { goalProgress } from '@/spaces/derive';
import { COLLECTION_NAMES, type CollectionDef, type FieldSpec } from '../collections';
import { SPACE_COLLECTIONS, SPACE_COLLECTION_BY_NAME } from '../spaceCollections';
import { asCollection, type SingletonDef } from '../singletons';
import { activeDoc, clean, coerceField, fail, itemsOf, model, plural, resolveParent, resolveRef, sceneLabel, type ActiveDoc } from '../ctx';
import { liveDoc, stripMarks, writeDoc } from '../docops';
import { defineTool } from '../tool';
import { anyObj, arr, enm, int, obj, opt, str } from '../schema';

type D = Draft<ProjectData>;

const ALL_COLLECTION_NAMES = [...new Set([...COLLECTION_NAMES, ...SPACE_COLLECTIONS.map((c) => c.name)])];

function coll(a: ActiveDoc, name: string): CollectionDef {
  const c = a.byName[name];
  if (!c) {
    const other = a.kind === 'project' ? SPACE_COLLECTION_BY_NAME[name] : undefined;
    fail(
      `Unknown collection "${name}" for the open ${a.kind}.${other ? ' That collection belongs to Marketing Spaces (open_space first).' : ''} Collections: ${a.collections.map((x) => x.name).join(', ')}`,
    );
  }
  return c;
}

export function fieldDocs(fields: FieldSpec[]) {
  return fields.map((f) =>
    clean({
      name: f.name,
      type: f.type,
      required: f.required || undefined,
      values: f.values,
      suggest: f.suggest && f.suggest.length > 40 ? [...f.suggest.slice(0, 40), '…'] : f.suggest,
      ref: f.ref,
      keys: f.keys,
      readOnly: f.readOnly || undefined,
      desc: f.desc,
    }),
  );
}

function findSingleton(singletons: SingletonDef[], path: string): { s: SingletonDef; f: FieldSpec } | null {
  const i = path.lastIndexOf('.');
  const objPath = i < 0 ? '' : path.slice(0, i);
  const key = i < 0 ? path : path.slice(i + 1);
  const s = singletons.find((x) => x.path === objPath);
  const f = s?.fields.find((x) => x.name === key);
  return s && f ? { s, f } : null;
}

/** All items of a collection; nested collections across every parent (with parentId). */
function allItems(a: ActiveDoc, c: CollectionDef, parentId?: string): any[] {
  const p = a.doc;
  if (!c.parent) return itemsOf(c, p);
  if (parentId) return itemsOf(c, p, parentId).map((x) => ({ ...x, parentId }));
  return itemsOf(a.byName[c.parent], p).flatMap((par) => itemsOf(c, p, par.id).map((x) => ({ ...x, parentId: par.id })));
}

function parentOf(a: ActiveDoc, c: CollectionDef, id: string): string | undefined {
  if (!c.parent) return undefined;
  return itemsOf(a.byName[c.parent], a.doc).find((par) => itemsOf(c, a.doc, par.id).some((x) => x.id === id))?.id;
}

/* ---------------------------------------------------------------- derived info shown with items */

function enrichProject(c: CollectionDef, items: any[], p: ProjectData): any[] {
  const m = model(p);
  switch (c.name) {
    case 'shots':
      return items.map((s) => ({ ...s, _scene: s.sceneId ? sceneLabel(m.sceneById.get(s.sceneId)) || '(scene deleted)' : '(unassigned)' }));
    case 'characters':
      return items.map((ch) => ({
        ...ch,
        _actor: p.cast.find((x) => x.id === ch.castId)?.name,
        _scenes: m.scenes.filter((s) => s.characterIds.includes(ch.id)).map((s) => s.number),
      }));
    case 'cast':
      return items.map((a) => ({ ...a, _roles: p.characters.filter((ch) => ch.castId === a.id).map((ch) => ch.name) }));
    case 'elements':
      return items.map((e) => ({ ...e, _scenes: m.scenes.filter((s) => s.elementIds.includes(e.id)).map((s) => s.number) }));
    case 'locations':
      return items.map((l) => ({ ...l, _scenes: m.scenes.filter((s) => locationForScene(p, s)?.id === l.id).map((s) => s.number) }));
    case 'shoot_days': {
      const dates = dayDates(p);
      return items.map((d) => {
        const i = p.schedule.days.findIndex((x) => x.id === d.id);
        const scenes = (p.schedule.days[i]?.items ?? []).filter((it) => it.type === 'scene').map((it: any) => m.sceneById.get(it.sceneId)?.number ?? '?');
        return { ...d, _label: d.label || `Day ${i + 1}`, _date: dates[i], _scenes: scenes };
      });
    }
    case 'budget_categories':
      return items.map((cat) => ({ ...cat, _total: Math.round(catTotal(cat) * 100) / 100, _lines: cat.lines?.length ?? 0 }));
    case 'budget_lines':
      return items.map((l) => ({ ...l, _total: Math.round(budgetLineTotal(l) * 100) / 100 }));
    case 'gear': {
      const days = shootDayCount(p);
      return items.map((g) => ({ ...g, _total: Math.round(gearLineTotal(g, days) * 100) / 100 }));
    }
    case 'diagrams':
      return items.map((d) => ({ ...d, _items: d.items?.length ?? 0, _lights: (d.items ?? []).filter((it: any) => String(it.kind).startsWith('light.')).length }));
    default:
      return items;
  }
}

function enrichSpace(c: CollectionDef, items: any[], s: any): any[] {
  const ch = new Map<string, any>(s.channels.map((x: any) => [x.id, x]));
  const name = (list: any[], id?: string, key = 'name') => (id ? list.find((x) => x.id === id)?.[key] : undefined);
  switch (c.name) {
    case 'content':
      return items.map((x) => ({
        ...x,
        posts: undefined,
        shots: undefined,
        checklist: undefined,
        _posts: (x.posts ?? []).map((p: any) => clean({ id: p.id, channel: ch.get(p.channelId)?.name ?? '(deleted channel)', date: p.date, time: p.time, status: p.status })),
        _shots: x.shots?.length || undefined,
        _checklist: x.checklist?.length ? `${x.checklist.filter((k: any) => k.done).length}/${x.checklist.length}` : undefined,
        _pillar: name(s.pillars, x.pillarId),
        _campaign: name(s.campaigns, x.campaignId),
        _hasScript: x.script ? true : undefined,
        _hasCopy: x.copy ? true : undefined,
      }));
    case 'posts':
      return items.map((p) => ({ ...p, _channel: ch.get(p.channelId)?.name ?? '(deleted channel)', _content: name(s.content, p.parentId, 'title') }));
    case 'shoots':
      return items.map((sh) => ({ ...sh, _content: (sh.contentIds ?? []).map((id: string) => name(s.content, id, 'title') ?? '(deleted)') }));
    case 'goals':
      return items.map((g) => {
        const pr = goalProgress(g);
        return { ...g, _progress: pr == null ? undefined : `${Math.round(pr * 100)}%` };
      });
    case 'channels':
      return items.map((x) => ({ ...x, _posts: s.content.reduce((n: number, c: any) => n + c.posts.filter((p: any) => p.channelId === x.id).length, 0) }));
    case 'pillars':
      return items.map((x) => ({ ...x, _content: s.content.filter((c: any) => c.pillarId === x.id).length }));
    case 'campaigns':
      return items.map((x) => ({ ...x, _content: s.content.filter((c: any) => c.campaignId === x.id).length, _resources: s.assets.filter((a: any) => a.campaignId === x.id).length || undefined }));
    case 'assets':
      return items.map((x) => ({ ...x, file: undefined, _campaign: name(s.campaigns, x.campaignId), _hasFile: x.file ? true : undefined }));
    default:
      return items;
  }
}

function enrich(a: ActiveDoc, c: CollectionDef, items: any[]): any[] {
  if (c.name === 'mind_boards') {
    const active = activeBoardId();
    const words = (t?: string) => ((t ?? '').trim() ? (t as string).trim().split(/\s+/).length : undefined);
    return items.map((b) => ({ ...b, _active: b.id === active || undefined, _notes: b.notes?.length ?? 0, _groups: b.groups?.length || undefined, _words: words(b.text) }));
  }
  return a.kind === 'space' ? enrichSpace(c, items, a.doc) : enrichProject(c, items, a.doc);
}

function project_out(c: CollectionDef, items: any[], fields?: string[]): any[] {
  return items.map((it) => {
    let o: any = { ...it };
    for (const h of c.hideInList ?? []) if (o[h] !== undefined) o[h] = typeof o[h] === 'string' ? `(${o[h].length} characters — get_items for the full text)` : `(${(o[h] as any[]).length} rows)`;
    if (fields?.length) {
      const keep = new Set(['id', 'parentId', ...fields]);
      o = Object.fromEntries(Object.entries(o).filter(([k]) => keep.has(k) || k.startsWith('_')));
    }
    return clean(o);
  });
}

/* ---------------------------------------------------------------- building items */

function checkField(c: CollectionDef, k: string): FieldSpec {
  const f = c.fields.find((x) => x.name === k);
  if (!f) fail(`${c.name}: unknown field "${k}". Writable fields: ${c.fields.filter((x) => !x.readOnly).map((x) => x.name).join(', ')}`);
  if (f.readOnly) fail(`${c.name}.${k} is read-only.`);
  return f;
}

const VIRTUAL = new Set(['roles']);
const SPACE_CONTENT_VIRTUAL = new Set(['posts', 'shots', 'checklist']);

function buildItem(a: ActiveDoc, c: CollectionDef, input: Record<string, unknown>, parentId?: string) {
  const p = a.doc;
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(`${c.name}: each item must be an object`);
  const item: Record<string, any> = { ...(c.defaults?.(p, parentId) ?? {}) };
  const extra: Record<string, any> = {};
  for (const [k, val] of Object.entries(input)) {
    if (k === 'id' || k === 'parentId' || k.startsWith('_')) continue;
    const f = checkField(c, k);
    if (a.kind === 'space' && c.name === 'content' && SPACE_CONTENT_VIRTUAL.has(k)) {
      extra[k] = val;
      continue;
    }
    const cv = coerceField(c, f, val, p);
    if (VIRTUAL.has(k)) {
      extra[k] = cv ?? [];
      continue;
    }
    if (cv === undefined) delete item[k];
    else item[k] = cv;
  }
  for (const f of c.fields) if (f.required && item[f.name] === undefined && !VIRTUAL.has(f.name)) fail(`${c.name}: "${f.name}" is required.`);
  item.id = uid(c.idPrefix);
  return { item, extra };
}

/** Coerce nested objects (posts / shots of a content piece) with their collection's rules. */
function buildNested(a: ActiveDoc, collection: string, rows: unknown, make: (patch: any) => any): any[] {
  if (rows == null) return [];
  if (!Array.isArray(rows)) fail(`${collection}: expected an array`);
  const c = a.byName[collection];
  return rows.map((r) => {
    const { item } = buildItem(a, c, (typeof r === 'string' ? { description: r } : r) as Record<string, unknown>);
    const { id: _id, ...patch } = item;
    return make(patch);
  });
}

function setRoles(d: D, castId: string, roles: string[]) {
  for (const ch of d.characters) {
    if (roles.includes(ch.id)) ch.castId = castId;
    else if (ch.castId === castId) delete ch.castId;
  }
}

/* ---------------------------------------------------------------- deleting: references */

/** Clear references to deleted items everywhere in the open document. */
function scrubRefs(a: ActiveDoc, d: any, target: string, ids: Set<string>) {
  // arrows lose their meaning without both notes: remove them first
  if (target === 'mind_notes') {
    const board = boardDraftFor(a.kind === 'space' ? d.mind : d.script.mind, d.id);
    board.links = board.links.filter((l: any) => !ids.has(l.from) && !ids.has(l.to));
  }
  if (a.kind === 'space' && target === 'channels') for (const c of d.content) c.posts = c.posts.filter((p: any) => !ids.has(p.channelId));
  for (const c of a.collections) {
    const refFields = c.fields.filter((f) => (f.type === 'ref' || f.type === 'ref[]') && f.ref === target && !VIRTUAL.has(f.name));
    if (!refFields.length) continue;
    const lists: any[][] = c.parent ? itemsOf(a.byName[c.parent], d).map((par) => (c.draft(d, par.id) as any[]) ?? []) : [itemsOf(c, d)];
    for (const list of lists) {
      for (const it of list) {
        for (const f of refFields) {
          if (f.type === 'ref' && ids.has(it[f.name])) delete it[f.name];
          if (f.type === 'ref[]' && Array.isArray(it[f.name])) it[f.name] = it[f.name].filter((x: string) => !ids.has(x));
        }
      }
    }
  }
  if (a.kind !== 'project') return;
  for (const meta of Object.values(d.scenes) as any[]) {
    if (!meta) continue;
    if (target === 'locations' && meta.locationId && ids.has(meta.locationId)) delete meta.locationId;
    if (target === 'elements' && meta.elementIds) meta.elementIds = meta.elementIds.filter((x: string) => !ids.has(x));
    if (target === 'characters' && meta.characterIds) meta.characterIds = meta.characterIds.filter((x: string) => !ids.has(x));
  }
  for (const [dayId, cs] of Object.entries(d.callSheets) as [string, any][]) {
    if (target === 'shoot_days' && ids.has(dayId)) delete d.callSheets[dayId];
    if (target === 'cast') for (const id of ids) delete cs.castCalls?.[id];
    if (target === 'crew') for (const id of ids) delete cs.crewCalls?.[id];
    if (target === 'locations' && cs.locationIds) cs.locationIds = cs.locationIds.filter((x: string) => !ids.has(x));
  }
}

/** Keep ContentPiece.shootId and ShootSession.contentIds in sync (spaces). */
function syncShoots(d: any, shootId: string | undefined, contentIds: string[] | undefined, contentId?: string) {
  if (contentIds) {
    const set = new Set(contentIds);
    for (const c of d.content) {
      if (set.has(c.id)) {
        for (const sh of d.shoots) if (sh.id !== shootId) sh.contentIds = sh.contentIds.filter((x: string) => x !== c.id);
        c.shootId = shootId;
        const sh = d.shoots.find((x: any) => x.id === shootId);
        if (sh?.date && !c.shootDate) c.shootDate = sh.date;
      } else if (c.shootId === shootId) delete c.shootId;
    }
  }
  if (contentId) {
    for (const sh of d.shoots) {
      const has = sh.contentIds.includes(contentId);
      if (sh.id === shootId && !has) sh.contentIds.push(contentId);
      if (sh.id !== shootId && has) sh.contentIds = sh.contentIds.filter((x: string) => x !== contentId);
    }
  }
}

/* ================================================================ tools */

const collectionArg = enm(ALL_COLLECTION_NAMES, 'collection name (depends on whether a project or a Marketing Space is open — see describe_data)');

export const dataTools = [
  defineTool({
    name: 'describe_data',
    title: 'Describe the data model',
    description:
      'Explains what data the open project or Marketing Space holds. Without arguments: every collection (list of items) with counts, and the single-value fields. With `collection`: its fields (types, allowed values, references, suggestions) and an example item. Use collection "fields" for the single values edited with set_fields.',
    readOnly: true,
    global: true,
    input: obj({ collection: opt(str('collection name, or "fields"')) }),
    run({ collection }: { collection?: string }) {
      let a: ActiveDoc | null = null;
      try {
        a = activeDoc();
      } catch {
        a = null;
      }
      if (!a) return { text: 'Nothing is open. Projects (productions) and Marketing Spaces have different data: open one first (open_project / open_space), then call describe_data.' };
      if (!collection) {
        return {
          data: {
            open: a.kind,
            collections: a.collections.map((c) => clean({ name: c.name, label: c.label, count: allItems(a!, c).length, parent: c.parent ? `nested in ${c.parent} (pass parentId)` : undefined, about: c.description })),
            fields: a.singletons.map((s) => ({ path: s.path || '(root)', about: s.label, fields: s.fields.map((f) => f.name) })),
            ...(a.kind === 'project'
              ? {
                  notSeparateCollections: {
                    scenes: 'scenes come from the screenplay: list_scenes, get_script, write_script, update_scenes',
                    schedule: 'get_schedule, schedule_scenes, schedule_action; days are the shoot_days collection',
                    callSheets: 'get_call_sheet / update_call_sheet (one per shoot day)',
                    lightingItems: 'lighting_get_diagram / lighting_add_items / lighting_update_items',
                  },
                }
              : {
                  alsoSee: {
                    calendar: 'get_space_calendar for everything scheduled in a date range',
                    reports: 'get_space_report (overview, pipeline, cadence, results)',
                    ideas: 'mind_add_notes / mind_organize / mind_send_notes work on the Ideas board',
                    peopleAndBrands: 'crm_read / crm_sheet / crm_rows: CRM sheets (relationships, leads, brand deals, collaborators, press)',
                    resources: 'add_resource uploads or writes downloadable files (playbooks, one-pagers, sequence maps …) into Brand Kit & Assets, optionally per campaign',
                    linkedProjects: 'link_projects',
                  },
                }),
          },
        };
      }
      if (collection === 'fields' || collection === 'project') {
        return { data: { about: 'Single values, read with get_fields and written with set_fields using "<path>.<field>" keys.', objects: a.singletons.map((s) => ({ path: s.path || '(root)', about: s.label, fields: fieldDocs(s.fields) })) } };
      }
      const c = coll(a, collection);
      const items = allItems(a, c);
      return {
        data: clean({
          name: c.name,
          label: c.label,
          about: c.description,
          parent: c.parent ? `nested in ${c.parent}: pass parentId (id or name) to list_items / add_items` : undefined,
          adding: c.addVia,
          count: items.length,
          fields: fieldDocs(c.fields),
          notes: [
            'References (type ref / ref[]) accept ids or names' + (a.kind === 'project' ? '; scenes accept a scene id, number ("12") or heading.' : '.'),
            'Dates are YYYY-MM-DD, times HH:MM (24h). Images are asset names from import_image.',
            'update_items: send only the fields to change; null clears a field.',
          ],
          example: items[0] ? project_out(c, enrich(a, c, [items[0]]))[0] : undefined,
        }),
      };
    },
  }),

  defineTool({
    name: 'list_items',
    title: 'List items of a collection',
    description:
      'Lists items of a collection of the open project (cast, crew, shots, locations, gear, budget_lines, tasks …) or Marketing Space (content, posts, channels, pillars, goals, campaigns, milestones, shoots, assets …). Supports text search, field filters and choosing fields. Fields starting with "_" are computed for convenience and read-only.',
    readOnly: true,
    global: true,
    input: obj({
      collection: collectionArg,
      parentId: opt(str('for nested collections (budget_lines, posts, content_shots, content_checklist): the parent id or name; omit to list across all parents')),
      search: opt(str('case-insensitive text search across all text fields')),
      where: opt(anyObj('equality filter, e.g. {"status":"confirmed"} or {"stage":"editing"}; array fields match when they contain the value')),
      fields: opt(arr(str(), 'only return these fields (id and computed "_" fields are always included)')),
      limit: opt(int('max items (default 200)', 1)),
      offset: opt(int('skip this many items', 0)),
    }),
    run(args: { collection: string; parentId?: string; search?: string; where?: Record<string, unknown>; fields?: string[]; limit?: number; offset?: number }) {
      const a = activeDoc();
      const c = coll(a, args.collection);
      const pid = c.parent && args.parentId ? resolveParent(c, args.parentId, a.doc) : undefined;
      let items = allItems(a, c, pid);
      if (args.where) {
        for (const [k, val] of Object.entries(args.where)) {
          const want = String(val).toLowerCase();
          items = items.filter((it) => {
            const x = it[k];
            if (Array.isArray(x)) return x.some((y) => String(y).toLowerCase() === want);
            return String(x ?? '').toLowerCase() === want || (val === false && x == null);
          });
        }
      }
      items = enrich(a, c, items);
      if (args.search) {
        const q = args.search.toLowerCase();
        items = items.filter((it) => JSON.stringify(it).toLowerCase().includes(q));
      }
      const total = items.length;
      const off = args.offset ?? 0;
      const lim = args.limit ?? 200;
      const page = items.slice(off, off + lim);
      return { data: { collection: c.name, total, returned: page.length, ...(off + page.length < total ? { nextOffset: off + page.length } : {}), items: project_out(c, page, args.fields) } };
    },
  }),

  defineTool({
    name: 'get_items',
    title: 'Get items by id',
    description: 'Returns full items (all fields, including long text like scripts and copy) of a collection by id (or by name for collections that have one).',
    readOnly: true,
    global: true,
    input: obj({ collection: collectionArg, ids: arr(str(), 'ids (or names)') }),
    run({ collection, ids }: { collection: string; ids: string[] }) {
      const a = activeDoc();
      const c = coll(a, collection);
      const all = allItems(a, c);
      const out = ids.map((ref) => {
        const id = all.some((x) => x.id === ref) ? ref : resolveRef(c.name, ref, a.doc);
        return all.find((x) => x.id === id);
      });
      const full = a.kind === 'space' && c.name === 'content' ? out : enrich(a, c, out);
      return { data: { items: full.map((x) => clean(x)) } };
    },
  }),

  defineTool({
    name: 'add_items',
    title: 'Add items to a collection',
    description:
      'Creates one or more items in a collection of the open project or space. Missing optional fields get sensible defaults and ids are generated (returned). Project examples: cast {name, status}, crew {name, department, position}, shots {sceneId, description, shotSize, lens}, budget_lines (parentId = category). Space examples: content {title, format, stage, pillarId, campaignId, concept, hook, script, posts: [{channelId: "Instagram", date, time, caption}]}, channels {platform, name, cadence}, goals {title, metric, target}, posts (parentId = content). Call describe_data { collection } to see every field.',
    global: true,
    input: obj({
      collection: collectionArg,
      items: { ...arr(anyObj('item fields'), 'items to create'), minItems: 1 },
      parentId: opt(str('nested collections only: parent id or name')),
      beforeId: opt(str('insert before this item (default: at the end)')),
    }),
    run(args: { collection: string; items: Record<string, unknown>[]; parentId?: string; beforeId?: string }) {
      const a = activeDoc();
      const p = a.doc;
      const c = coll(a, args.collection);
      if (c.addVia) fail(c.addVia);
      const pid = c.parent ? resolveParent(c, args.parentId, p) : undefined;
      const built = args.items.map((it) => buildItem(a, c, it, pid));

      if (a.kind === 'project' && c.name === 'shots') {
        const m = model(p);
        const ids: string[] = [];
        for (const { item } of built) {
          const { id: _ignore, ...patch } = item;
          if (!patch.number) delete patch.number;
          ids.push(...addShots(patch.sceneId ?? UNASSIGNED, [patch], m));
        }
        return { data: { created: ids.length, ids }, summary: `Added ${plural(ids.length, 'shot')}` };
      }
      if (c.name === 'mind_notes') {
        const need = built.filter((b) => b.item.x == null || b.item.y == null);
        const slots = nextSlots(need.length);
        need.forEach((b, i) => {
          b.item.x ??= slots[i].x;
          b.item.y ??= slots[i].y;
        });
      }
      if (a.kind === 'project' && c.name === 'characters') {
        for (const { item } of built) if (p.characters.some((x: any) => x.name.toUpperCase() === item.name)) fail(`A character named ${item.name} already exists.`);
      }
      if (c.name === 'mind_links') {
        for (const { item } of built) if (item.from === item.to) fail('An arrow needs two different notes.');
      }
      // spaces: full content pieces with posts, shots and a checklist
      if (a.kind === 'space' && c.name === 'content') {
        for (const b of built) {
          const { id, ...patch } = b.item;
          const piece = makeContent({ ...patch, id });
          piece.posts = buildNested(a, 'posts', b.extra.posts, (x) => makePost(x.channelId, x));
          piece.shots = buildNested(a, 'content_shots', b.extra.shots, (x) => makeShot(x));
          if (b.extra.checklist != null) {
            if (!Array.isArray(b.extra.checklist)) fail('content.checklist: expected an array of strings');
            piece.checklist = b.extra.checklist.map((t: any) => ({ ...makeChecklistItem(String(typeof t === 'string' ? t : t?.text ?? '')), done: typeof t === 'object' ? !!t?.done : undefined }));
          } else piece.checklist = defaultChecklist(piece.format);
          b.item = piece as any;
        }
      }
      if (a.kind === 'space' && c.name === 'channels') {
        for (const { item } of built) if (!item.name) item.name = PLATFORM_BY_ID[item.platform as keyof typeof PLATFORM_BY_ID]?.label ?? item.platform;
      }
      a.update((d) => {
        const list = c.draft(d, pid) as any[];
        if (!list) fail(`Parent not found for ${c.name}`);
        for (const { item, extra } of built) {
          if (a.kind === 'project' && c.name === 'budget_categories') item.code ??= nextCode(d.budget, item.section);
          let at = args.beforeId ? list.findIndex((x) => x.id === args.beforeId) : -1;
          if (at < 0 && a.kind === 'project' && c.name === 'budget_categories' && !args.beforeId) at = budgetInsertIndex(d.budget, item.section);
          if (at >= 0) list.splice(at, 0, item);
          else list.push(item);
          if (a.kind === 'project' && c.name === 'cast' && extra.roles) setRoles(d, item.id, extra.roles);
          if (a.kind === 'space' && c.name === 'shoots') syncShoots(d, item.id, item.contentIds);
          if (a.kind === 'space' && c.name === 'content' && item.shootId) syncShoots(d, item.shootId, undefined, item.id);
        }
      });
      const ids = built.map((b) => b.item.id);
      return { data: { created: ids.length, ids }, summary: `Added ${plural(ids.length, 'item')} to ${c.label}` };
    },
  }),

  defineTool({
    name: 'update_items',
    title: 'Update items',
    description:
      'Changes fields of existing items. Each update is { id, ...fields }; only the given fields change, null clears a field. Object fields (measurements, hospital, metrics) are merged. For project shots, changing sceneId moves the shot to that scene. For space content, change posts / shots / checklist through their own collections (posts, content_shots, content_checklist).',
    global: true,
    input: obj({ collection: collectionArg, updates: { ...arr(anyObj('{ "id": "...", "field": value, ... }')), minItems: 1 } }),
    run(args: { collection: string; updates: Record<string, unknown>[] }) {
      const a = activeDoc();
      const p = a.doc;
      const c = coll(a, args.collection);
      const all = allItems(a, c);
      type Plan = { id: string; parentId?: string; set: Record<string, unknown>; unset: string[]; merge: Record<string, Record<string, unknown>>; roles?: string[]; moveTo?: string };
      const plans: Plan[] = args.updates.map((u) => {
        if (!u || typeof u.id !== 'string') fail('Each update needs an "id".');
        const id = all.some((x) => x.id === u.id) ? (u.id as string) : resolveRef(c.name, u.id, p);
        const current = all.find((x) => x.id === id)!;
        const plan: Plan = { id, parentId: c.parent ? parentOf(a, c, id) : undefined, set: {}, unset: [], merge: {} };
        for (const [k, val] of Object.entries(u)) {
          if (k === 'id' || k === 'parentId' || k.startsWith('_')) continue;
          const f = checkField(c, k);
          if (a.kind === 'space' && c.name === 'content' && SPACE_CONTENT_VIRTUAL.has(k))
            fail(`Edit ${k} with the ${k === 'posts' ? 'posts' : k === 'shots' ? 'content_shots' : 'content_checklist'} collection (parentId = the content id).`);
          if (k === 'roles') {
            plan.roles = (coerceField(c, f, val ?? [], p) as string[]) ?? [];
            continue;
          }
          if (val === null) {
            if (f.required) fail(`${c.name}.${k} is required and cannot be cleared.`);
            plan.unset.push(k);
            continue;
          }
          const cv = coerceField(c, f, val, p);
          if (a.kind === 'project' && c.name === 'shots' && k === 'sceneId') {
            if (cv !== current.sceneId) plan.moveTo = (cv as string) ?? UNASSIGNED;
            continue;
          }
          if (f.type === 'object') {
            const nulls = Object.entries(val as object).filter(([, x]) => x === null).map(([kk]) => kk);
            plan.merge[k] = { ...(cv as object), ...Object.fromEntries(nulls.map((kk) => [kk, null])) };
            continue;
          }
          plan.set[k] = cv;
        }
        return plan;
      });
      a.update((d) => {
        for (const pl of plans) {
          const raw = c.draft(d, pl.parentId);
          const it: any = Array.isArray(raw) ? raw.find((x) => x.id === pl.id) : (raw as any)?.[pl.id];
          if (!it) continue;
          Object.assign(it, pl.set);
          for (const k of pl.unset) delete it[k];
          for (const [k, patch] of Object.entries(pl.merge)) {
            const merged = { ...(it[k] ?? {}) };
            for (const [kk, x] of Object.entries(patch)) {
              if (x === null) delete merged[kk];
              else merged[kk] = x;
            }
            it[k] = merged;
          }
          if (a.kind === 'project' && c.name === 'cast' && pl.roles) setRoles(d, pl.id, pl.roles);
          if (a.kind === 'space' && c.name === 'shoots' && ('contentIds' in pl.set || pl.unset.includes('contentIds'))) syncShoots(d, pl.id, it.contentIds ?? []);
          if (a.kind === 'space' && c.name === 'content' && ('shootId' in pl.set || pl.unset.includes('shootId'))) syncShoots(d, it.shootId, undefined, pl.id);
        }
      });
      if (a.kind === 'project') {
        const m = model();
        for (const pl of plans) if (pl.moveTo) moveShotsToScene([pl.id], pl.moveTo, m);
      }
      return { data: { updated: plans.length, ids: plans.map((x) => x.id) }, summary: `Updated ${plural(plans.length, 'item')} in ${c.label}` };
    },
  }),

  defineTool({
    name: 'delete_items',
    title: 'Delete items',
    description:
      'Deletes items from a collection and clears every reference to them (scene links, call sheet calls, breakdown tags, shoot days, campaign links …; deleting a space channel also deletes its posts). Ctrl+Z / the undo tool brings them back. Project characters who still speak in the script are re-created automatically.',
    destructive: true,
    global: true,
    input: obj({ collection: collectionArg, ids: { ...arr(str(), 'ids (or names)'), minItems: 1 } }),
    run({ collection, ids }: { collection: string; ids: string[] }) {
      const a = activeDoc();
      const p = a.doc;
      const c = coll(a, collection);
      const all = allItems(a, c);
      const resolved = ids.map((r) => (all.some((x) => x.id === r) ? r : resolveRef(c.name, r, p)));
      const set = new Set(resolved);
      const isProject = a.kind === 'project';
      const doc = isProject && (c.name === 'elements' || c.name === 'characters' || c.name === 'script_notes') ? stripMarks(liveDoc(), set) : null;
      const names = isProject && c.name === 'characters' ? p.characters.filter((x: any) => set.has(x.id)).map((x: any) => x.name.toUpperCase()) : [];
      const postsLost = a.kind === 'space' && c.name === 'channels' ? p.content.reduce((n: number, x: any) => n + x.posts.filter((q: any) => set.has(q.channelId)).length, 0) : 0;
      a.update((d) => {
        if (c.kind === 'record') {
          const rec = c.draft(d) as Record<string, unknown>;
          for (const id of set) delete rec[id];
        } else if (c.parent) {
          for (const par of itemsOf(a.byName[c.parent], d)) {
            const list = c.draft(d, par.id) as any[];
            for (let i = list.length - 1; i >= 0; i--) if (set.has(list[i].id)) list.splice(i, 1);
          }
        } else {
          const list = c.draft(d) as any[];
          for (let i = list.length - 1; i >= 0; i--) if (set.has(list[i].id)) list.splice(i, 1);
        }
        scrubRefs(a, d, c.name, set);
        if (doc) writeDoc(d, doc);
        else if (isProject && c.name === 'characters') syncCharactersDraft(d);
      });
      const back = isProject ? names.filter((n: string) => (activeDoc().doc.characters as any[]).some((x) => x.name.toUpperCase() === n)) : [];
      return {
        data: clean({
          deleted: set.size,
          note: back.length ? `${back.join(', ')} still speak in the script, so they were re-created (with empty details).` : undefined,
          postsDeleted: postsLost || undefined,
        }),
        summary: `Deleted ${plural(set.size, 'item')} from ${c.label}`,
      };
    },
  }),

  defineTool({
    name: 'move_items',
    title: 'Reorder items',
    description: 'Changes the order of items in a collection (e.g. A/V rows, tasks, content pieces, channels, shoot days). Moves the given items (keeping their relative order) before `beforeId`, or to the start / end.',
    global: true,
    input: obj({ collection: collectionArg, ids: { ...arr(str()), minItems: 1 }, beforeId: opt(str('move before this item')), position: opt(enm(['start', 'end'] as const, 'when no beforeId (default end)')) }),
    run(args: { collection: string; ids: string[]; beforeId?: string; position?: 'start' | 'end' }) {
      const a = activeDoc();
      const c = coll(a, args.collection);
      if (c.kind === 'record') fail(`${c.name} has no order.`);
      const pid = c.parent ? parentOf(a, c, args.ids[0]) : undefined;
      const set = new Set(args.ids);
      a.update((d) => {
        const list = c.draft(d, pid) as any[];
        const moving = list.filter((x) => set.has(x.id));
        if (moving.length !== set.size) fail(`Some ids were not found in ${c.name}${c.parent ? ' (all items must share the same parent)' : ''}.`);
        const rest = list.filter((x) => !set.has(x.id));
        let at = args.beforeId ? rest.findIndex((x) => x.id === args.beforeId) : -1;
        if (args.beforeId && at < 0) fail(`beforeId ${args.beforeId} not found.`);
        if (at < 0) at = args.position === 'start' ? 0 : rest.length;
        rest.splice(at, 0, ...moving);
        list.splice(0, list.length, ...rest);
      });
      return { data: { moved: set.size }, summary: `Reordered ${c.label}` };
    },
  }),

  defineTool({
    name: 'get_fields',
    title: 'Read single fields',
    description:
      'Reads single values. Projects: meta (title, logline, synopsis, type, status, client, director, aspect ratio, shoot dates …), settings, settings.script, settings.print, script (mode), script.titlePage, script.av, script.mind, schedule, budget, post, notes. Spaces: meta (name, type, description, colour, dates), strategy (positioning, value prop, tagline, voice, key messages, competitors, notes), settings, settings.print, mind (ideas text), notes. Without paths returns them all.',
    readOnly: true,
    global: true,
    input: obj({ paths: opt(arr(str(), 'e.g. ["meta", "strategy.voice", "settings.print"]')) }),
    run({ paths }: { paths?: string[] }) {
      const a = activeDoc();
      const pick = (s: SingletonDef) => {
        const src = s.get(a.doc);
        return clean(Object.fromEntries(s.fields.map((f) => [f.name, src?.[f.name]])));
      };
      if (!paths?.length) return { data: Object.fromEntries(a.singletons.map((s) => [s.path || 'notes', s.path ? pick(s) : a.doc.notes])) };
      const out: Record<string, unknown> = {};
      for (const path of paths) {
        const s = a.singletons.find((x) => x.path === path);
        if (s) {
          out[path || 'notes'] = s.path ? pick(s) : a.doc.notes;
          continue;
        }
        const hit = findSingleton(a.singletons, path);
        if (!hit) fail(`Unknown path "${path}". Objects: ${a.singletons.map((x) => x.path || 'notes').join(', ')} (call describe_data {collection:"fields"}).`);
        out[path] = hit.s.get(a.doc)?.[hit.f.name];
      }
      return { data: out };
    },
  }),

  defineTool({
    name: 'set_fields',
    title: 'Change single fields',
    description:
      'Sets single values in one step, keyed by "<object>.<field>". Project: {"meta.logline": "…", "meta.shootStart": "2026-11-07", "settings.print.watermark": "DRAFT", "script.titlePage.authors": "…", "schedule.startDate": "2026-11-07", "budget.contingencyPct": 10}. Space: {"meta.description": "…", "strategy.positioning": "…", "strategy.voice": "…", "strategy.tagline": "…", "notes": "…"}. null clears a value. describe_data {collection:"fields"} lists them all.',
    global: true,
    input: obj({ values: anyObj('map of "path": value') }),
    run({ values }: { values: Record<string, unknown> }) {
      const a = activeDoc();
      const entries = Object.entries(values ?? {});
      if (!entries.length) fail('Nothing to set.');
      const planned = entries.map(([path, val]) => {
        const hit = findSingleton(a.singletons, path);
        if (!hit) fail(`Unknown field "${path}" for the open ${a.kind}. Call describe_data {collection:"fields"} for the list.`);
        if (val === null && hit.f.required) fail(`${path} cannot be cleared.`);
        const cv = val === null ? undefined : coerceField(asCollection(hit.s), hit.f, val, a.doc);
        if (path === 'settings.script.sceneHeadingSpacing' && cv !== 1 && cv !== 2) fail('sceneHeadingSpacing must be 1 or 2.');
        return { hit, cv };
      });
      a.update((d) => {
        for (const { hit, cv } of planned) {
          const target = hit.s.draft(d);
          if (cv === undefined) delete target[hit.f.name];
          else target[hit.f.name] = cv;
        }
      });
      return { data: { updated: entries.map(([k]) => k) }, summary: `Updated ${entries.map(([k]) => k).join(', ')}` };
    },
  }),
];
