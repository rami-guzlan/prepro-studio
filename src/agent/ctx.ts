/* Shared helpers for the AI agent tools: access to the open project or
   Marketing Space, references by id or name, field validation, compact JSON
   output and the agent change journal. */
import type { ProjectData } from '@/types';
import type { SpaceData } from '@/spaces/types';
import { getScriptModel, type SceneInfo, type ScriptModel } from '@/derived/script';
import { update as projectUpdate, useProjectStore, type UpdateOptions } from '@/store/project';
import { updateSpace, useSpaceStore } from '@/store/space';
import { useApp } from '@/store/app';
import { makeFormatters } from '@/lib/format';
import { COLLECTIONS, COLLECTION_BY_NAME, type CollectionDef, type FieldSpec } from './collections';
import { SINGLETONS, type SingletonDef } from './singletons';
import { SPACE_COLLECTIONS, SPACE_COLLECTION_BY_NAME, SPACE_SINGLETONS } from './spaceCollections';
import { BUSINESS_COLLECTIONS, BUSINESS_SINGLETONS } from './kinds/business';
import { BUSINESS_SALES_COLLECTIONS, BUSINESS_SALES_SINGLETONS } from './kinds/business-sales';
import { BUSINESS_WORK_COLLECTIONS, BUSINESS_WORK_SINGLETONS } from './kinds/business-work';
import { BUSINESS_LIBRARY_COLLECTIONS, BUSINESS_LIBRARY_SINGLETONS } from './kinds/business-library';
import { FINANCE_COLLECTIONS, FINANCE_SINGLETONS } from './kinds/finance';
import { TRAINING_COLLECTIONS, TRAINING_SINGLETONS } from './kinds/training';
import type { SpaceKind } from '@/spaces/types';
import { isFinanceUnlocked } from '@/spaces/finance/lock';

export class AgentError extends Error {}

export function fail(msg: string): never {
  throw new AgentError(msg);
}

/** What is open in the app: a project, a Marketing Space, or nothing. */
export function openKind(): 'project' | 'space' | null {
  const view = useApp.getState().view;
  const hasProject = !!useProjectStore.getState().project;
  const hasSpace = !!useSpaceStore.getState().space;
  if (view === 'space' && hasSpace) return 'space';
  if (hasProject) return 'project';
  if (hasSpace) return 'space';
  return null;
}

export function project(): ProjectData {
  const p = useProjectStore.getState().project;
  if (!p) {
    if (useSpaceStore.getState().space)
      fail('A Marketing Space is open; this tool works on production projects (script, shots, lighting, schedule, call sheets …). Call list_projects and open_project first.');
    fail('No project is open. Call list_projects and open_project (or create_project / open_demo_project) first.');
  }
  return p;
}

export function space(): SpaceData {
  const s = useSpaceStore.getState().space;
  if (!s || openKind() !== 'space') fail('No Marketing Space is open. Call list_spaces and open_space (or create_space / open_demo_space) first.');
  return s;
}

const KIND_HINT: Record<SpaceKind, string> = {
  marketing: 'a Marketing Space (list_spaces / open_space)',
  business: 'a business (list_spaces {kind:"business"} / open_space, or create_business)',
  finance: 'Personal Finances (open_finances)',
  training: 'Training (open_training)',
};

/** The open space when it is of this kind (finance also requires the finances to be unlocked). */
export function spaceOf(kind: SpaceKind): SpaceData {
  const s = useSpaceStore.getState().space;
  if (!s || openKind() !== 'space' || (s.meta.kind ?? 'marketing') !== kind) fail(`This tool works in ${KIND_HINT[kind]}. Open it first.`);
  if (kind === 'finance') requireFinanceUnlocked();
  return s;
}

export function requireFinanceUnlocked() {
  if (!isFinanceUnlocked()) fail('Personal Finances are locked. Ask the user to unlock them in PrePro Studio (Library → Personal Finances, enter the PIN); agents can read them only while they are unlocked.');
}

/** Collections and single fields of a kind of space. */
export function spaceRegistry(kind: SpaceKind): { collections: CollectionDef[]; byName: Record<string, CollectionDef>; singletons: SingletonDef[] } {
  const pick = (collections: CollectionDef[], singletons: SingletonDef[]) => ({ collections, byName: Object.fromEntries(collections.map((c) => [c.name, c])), singletons });
  if (kind === 'business') return BUSINESS_REG ?? (BUSINESS_REG = pick([...BUSINESS_COLLECTIONS, ...BUSINESS_SALES_COLLECTIONS, ...BUSINESS_WORK_COLLECTIONS, ...BUSINESS_LIBRARY_COLLECTIONS], [...BUSINESS_SINGLETONS, ...BUSINESS_SALES_SINGLETONS, ...BUSINESS_WORK_SINGLETONS, ...BUSINESS_LIBRARY_SINGLETONS]));
  if (kind === 'finance') return FINANCE_REG ?? (FINANCE_REG = pick(FINANCE_COLLECTIONS, FINANCE_SINGLETONS));
  if (kind === 'training') return TRAINING_REG ?? (TRAINING_REG = pick(TRAINING_COLLECTIONS, TRAINING_SINGLETONS));
  return { collections: SPACE_COLLECTIONS, byName: SPACE_COLLECTION_BY_NAME, singletons: SPACE_SINGLETONS };
}
let BUSINESS_REG: ReturnType<typeof spaceRegistry> | undefined;
let FINANCE_REG: ReturnType<typeof spaceRegistry> | undefined;
let TRAINING_REG: ReturnType<typeof spaceRegistry> | undefined;

/** The open document (project or space) with its collections, single fields and writer. */
export interface ActiveDoc {
  kind: 'project' | 'space';
  /** kind of the open space ('marketing' for projects too, unused there) */
  spaceKind: SpaceKind;
  doc: any;
  collections: CollectionDef[];
  byName: Record<string, CollectionDef>;
  singletons: SingletonDef[];
  update(recipe: (d: any) => void, opts?: UpdateOptions): void;
}

export function activeDoc(): ActiveDoc {
  const kind = openKind();
  if (kind === 'space') {
    const doc = useSpaceStore.getState().space!;
    const sk: SpaceKind = doc.meta.kind ?? 'marketing';
    if (sk === 'finance') requireFinanceUnlocked();
    return { kind, spaceKind: sk, doc, ...spaceRegistry(sk), update: (r, o) => updateSpace(r as any, o) };
  }
  if (kind === 'project')
    return { kind, spaceKind: 'marketing', doc: useProjectStore.getState().project!, collections: COLLECTIONS, byName: COLLECTION_BY_NAME, singletons: SINGLETONS, update: (r, o) => projectUpdate(r as any, o) };
  fail('Nothing is open. Open a project (list_projects / open_project) or a Marketing Space (list_spaces / open_space) first.');
}

function registryFor(doc: any): Record<string, CollectionDef> {
  return doc && doc.kind === 'space' ? spaceRegistry((doc.meta?.kind ?? 'marketing') as SpaceKind).byName : COLLECTION_BY_NAME;
}

export function model(p: ProjectData = project()): ScriptModel {
  return getScriptModel(p);
}

export function fmt(p: ProjectData = project()) {
  return makeFormatters(p.settings);
}

export function sceneLabel(s: SceneInfo | undefined): string {
  if (!s) return '';
  return `${s.number}. ${s.heading || '(untitled scene)'}`;
}

/** Remove undefined / empty-string values (keeps arrays, false and 0). */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined || x === '' || x === null) continue;
      out[k] = clean(x);
    }
    return out as T;
  }
  return v;
}

export function plural(n: number, s: string, p = `${s}s`) {
  return `${n} ${n === 1 ? s : p}`;
}

/* ---------------------------------------------------------------- references */

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Find a scene by id, scene number ('12', '12A') or heading text. */
export function findScene(m: ScriptModel, value: unknown): SceneInfo | undefined {
  const s = String(value ?? '').trim();
  if (!s) return undefined;
  const byId = m.sceneById.get(s);
  if (byId) return byId;
  const n = s.replace(/^(scene|sc\.?)\s*/i, '').replace(/\.$/, '');
  const byNum = m.scenes.find((x) => x.number.toLowerCase() === n.toLowerCase());
  if (byNum) return byNum;
  const h = norm(s);
  return m.scenes.find((x) => norm(x.heading) === h) ?? m.scenes.find((x) => norm(x.heading).includes(h) && h.length > 4);
}

export function requireScene(value: unknown, m = model()): SceneInfo {
  const s = findScene(m, value);
  if (!s) fail(`Unknown scene "${value}". Use list_scenes to see scene ids and numbers.`);
  return s;
}

/** Items of a collection (array form). */
export function itemsOf(c: CollectionDef, p: ProjectData, parentId?: string): any[] {
  const raw = c.get(p, parentId);
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.entries(raw).map(([id, x]) => ({ id, ...(x as object) }));
}

/** Resolve a parent id (by id or name). */
export function resolveParent(c: CollectionDef, parentId: unknown, p: any = activeDoc().doc): string {
  if (!c.parent) return '';
  if (parentId == null || parentId === '') fail(`${c.name} needs parentId (a ${c.parent} id or name).`);
  return resolveRef(c.parent, parentId, p);
}

/** Resolve one reference (id or name) to an id of `target` ('scenes' = script scenes) in a project or space. */
export function resolveRef(target: string, value: unknown, p: any = activeDoc().doc): string {
  if (target === 'scenes') return requireScene(value, model(p)).id;
  const reg = registryFor(p);
  const c = reg[target];
  if (!c) return String(value);
  const s = String(value ?? '').trim();
  if (target === 'shoot_days') {
    const days: any[] = p.schedule.days;
    const byId = days.find((d) => d.id === s);
    if (byId) return byId.id;
    const m = /^day\s*(\d+)$/i.exec(s);
    if (m && days[Number(m[1]) - 1]) return days[Number(m[1]) - 1].id;
    const byLabel = days.find((d) => norm(d.label) === norm(s) || d.date === s);
    if (byLabel) return byLabel.id;
    fail(`Unknown shoot day "${value}". Use get_schedule to see day ids (or pass "Day 2").`);
  }
  if (c.parent) {
    // nested items: search every parent
    const parents = itemsOf(reg[c.parent], p);
    for (const par of parents) {
      const hit = itemsOf(c, p, par.id).find((x) => x.id === s);
      if (hit) return hit.id;
    }
    fail(`Unknown ${c.name} id "${value}".`);
  }
  const items = itemsOf(c, p);
  const byId = items.find((x) => x.id === s);
  if (byId) return byId.id;
  if (c.nameField) {
    const hits = items.filter((x) => norm(x[c.nameField!]) === norm(s) || (target === 'characters' && (x.aliases ?? []).some((a: string) => norm(a) === norm(s))));
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1) fail(`"${value}" matches ${hits.length} ${c.name}; pass the id instead (${hits.map((h) => h.id).join(', ')}).`);
  }
  fail(`Unknown ${c.name} "${value}". Use list_items { collection: "${c.name}" } to see ids${c.nameField ? ' and names' : ''}.`);
}

/* ---------------------------------------------------------------- field values */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function to12(t: string): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'p') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

export function normTime(value: unknown, field = 'time'): string | undefined {
  if (value == null || value === '') return undefined;
  const s = String(value).trim();
  if (s === 'N/C' || s === 'O/C') return s;
  if (TIME_RE.test(s)) return s.padStart(5, '0');
  const t = to12(s);
  if (t) return t;
  fail(`${field}: "${value}" is not a time. Use 24h 'HH:MM' (e.g. "07:30").`);
}

export function normDate(value: unknown, field = 'date'): string | undefined {
  if (value == null || value === '') return undefined;
  const s = String(value).trim();
  if (!DATE_RE.test(s) || isNaN(Date.parse(s))) fail(`${field}: "${value}" is not a date. Use 'YYYY-MM-DD'.`);
  return s;
}

/** Validate & convert one field value for a collection item. `null` clears the field. */
export function coerceField(c: CollectionDef, f: FieldSpec, value: unknown, p: any): unknown {
  const where = `${c.name}.${f.name}`;
  if (value === null || value === undefined) return undefined;
  switch (f.type) {
    case 'string':
    case 'text':
    case 'color':
    case 'image': {
      if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
      if (typeof value !== 'string') fail(`${where}: expected text`);
      return f.upper ? (value as string).toUpperCase() : value;
    }
    case 'number':
    case 'integer': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value.replace(/[$,€£\s]/g, '')) : value;
      if (typeof n !== 'number' || !isFinite(n)) fail(`${where}: expected a number`);
      return f.type === 'integer' ? Math.round(n) : n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      fail(`${where}: expected true or false`);
    case 'date':
      return normDate(value, where);
    case 'time':
      return normTime(value, where);
    case 'enum': {
      const s = String(value);
      const hit = f.values!.find((x) => x === s) ?? f.values!.find((x) => x.toLowerCase() === s.toLowerCase().replace(/[\s-]+/g, '_')) ?? f.values!.find((x) => x.toLowerCase() === s.toLowerCase());
      if (!hit) fail(`${where}: "${s}" is not allowed. Use one of: ${f.values!.join(', ')}`);
      return hit;
    }
    case 'string[]':
    case 'image[]': {
      const a = Array.isArray(value) ? value : [value];
      return a.map((x) => (f.upper ? String(x).toUpperCase() : String(x))).filter((x) => x.trim() !== '');
    }
    case 'ref':
      return resolveRef(f.ref!, value, p);
    case 'ref[]': {
      const a = Array.isArray(value) ? value : [value];
      return [...new Set(a.map((x) => resolveRef(f.ref!, x, p)))];
    }
    case 'object[]': {
      if (!Array.isArray(value)) fail(`${where}: expected an array`);
      return value;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) fail(`${where}: expected an object with keys ${f.keys?.join(', ')}`);
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(value as object)) {
        if (f.keys && !f.keys.includes(k)) fail(`${where}.${k}: unknown key (allowed: ${f.keys.join(', ')})`);
        if (x === null || x === undefined || x === '') continue;
        if (f.numericValues) {
          const n = typeof x === 'string' ? Number(x.replace(/[,%\s]/g, '')) : x;
          if (typeof n !== 'number' || !isFinite(n)) fail(`${where}.${k}: expected a number`);
          out[k] = n;
        } else out[k] = typeof x === 'number' ? String(x) : x;
      }
      return out;
    }
  }
}

/* ---------------------------------------------------------------- agent journal (for undo) */

export interface JournalEntry {
  tool: string;
  summary: string;
  /** project or space id */
  projectId: string;
  kind: 'project' | 'space';
  /** store version right after the change */
  version: number;
  /** screenplay document before the change (when the tool changed it) */
  scriptBefore?: unknown;
}

export const journal: JournalEntry[] = [];
