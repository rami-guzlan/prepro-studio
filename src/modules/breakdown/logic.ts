/* Breakdown helpers shared by the Script Breakdown and Elements modules
   (pure functions + draft mutations to call inside update()). */
import type { Draft } from 'immer';
import type { BreakdownCategory, BreakdownElement, Character, ID, ProjectData, SceneMeta } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { BREAKDOWN_CATEGORIES, STRIP_COLORS, type CategoryDef } from '@/lib/constants';
import { uid } from '@/lib/id';
import { naturalCompare } from '@/lib/text';

export type ElCategory = Exclude<BreakdownCategory, 'cast'>;

/** Every category except cast (cast members are characters, not elements). */
export const ELEMENT_CATEGORIES: CategoryDef[] = BREAKDOWN_CATEGORIES.filter((c) => c.id !== 'cast');

export const ELEMENT_CATEGORY_OPTIONS = ELEMENT_CATEGORIES.map((c) => ({ value: c.id, label: c.label, color: c.color }));

export const ELEMENT_SOURCES: { value: NonNullable<BreakdownElement['source']>; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'rent', label: 'Rent' },
  { value: 'borrow', label: 'Borrow' },
  { value: 'make', label: 'Make' },
  { value: 'own', label: 'Owned' },
  { value: 'other', label: 'Other' },
];

/* ---------------------------------------------------------------- lookups */

export function elementMap(elements: BreakdownElement[] | undefined): Map<ID, BreakdownElement> {
  return new Map((elements ?? []).map((e) => [e.id, e]));
}

export function characterMap(characters: Character[] | undefined): Map<ID, Character> {
  return new Map((characters ?? []).map((c) => [c.id, c]));
}

/** Existing elements of a scene (ids pointing to deleted elements are skipped). */
export function sceneElements(scene: SceneInfo, byId: Map<ID, BreakdownElement>): BreakdownElement[] {
  const out: BreakdownElement[] = [];
  for (const id of scene.elementIds ?? []) {
    const el = byId.get(id);
    if (el) out.push(el);
  }
  return out;
}

/** Existing characters of a scene, sorted by board number then name. */
export function sceneCharacters(scene: SceneInfo, byId: Map<ID, Character>): Character[] {
  const out: Character[] = [];
  for (const id of scene.characterIds ?? []) {
    const c = byId.get(id);
    if (c) out.push(c);
  }
  return sortCharacters(out);
}

export function sortCharacters(list: Character[]): Character[] {
  return [...list].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999) || naturalCompare(a.name, b.name));
}

/** Elements of a scene grouped by category. */
export function elementsByCategory(els: BreakdownElement[]): Map<ElCategory, BreakdownElement[]> {
  const m = new Map<ElCategory, BreakdownElement[]>();
  for (const el of els) {
    const list = m.get(el.category) ?? [];
    list.push(el);
    m.set(el.category, list);
  }
  for (const list of m.values()) list.sort((a, b) => naturalCompare(a.name, b.name));
  return m;
}

/** element id -> scenes it appears in (script order). */
export function scenesByElement(model: ScriptModel): Map<ID, SceneInfo[]> {
  const m = new Map<ID, SceneInfo[]>();
  for (const s of model.scenes) {
    for (const id of s.elementIds ?? []) {
      const list = m.get(id) ?? [];
      list.push(s);
      m.set(id, list);
    }
  }
  return m;
}

/** element / character id -> number of scenes in which it is tagged in the script text. */
export function taggedCounts(model: ScriptModel): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const s of model.scenes) {
    for (const t of s.tagged ?? []) m.set(t.id, (m.get(t.id) ?? 0) + 1);
  }
  return m;
}

/** character name (and aliases, uppercase) -> id */
export function characterNameIndex(characters: Character[]): Map<string, ID> {
  const m = new Map<string, ID>();
  for (const c of characters) {
    m.set(c.name.toUpperCase(), c.id);
    for (const a of c.aliases ?? []) m.set(a.toUpperCase(), c.id);
  }
  return m;
}

/** How an element is attached to a scene. */
export function elementLinks(scene: SceneInfo, el: BreakdownElement) {
  const tagged = (scene.tagged ?? []).some((t) => t.id === el.id);
  const manual = (scene.meta?.elementIds ?? []).includes(el.id);
  const linked = (el.sceneIds ?? []).includes(scene.id);
  return { tagged, manual, linked };
}

export function sceneCounts(scene: SceneInfo, els: Map<ID, BreakdownElement>, chars: Map<ID, Character>) {
  let elements = 0;
  for (const id of scene.elementIds ?? []) if (els.has(id)) elements++;
  let cast = 0;
  for (const id of scene.characterIds ?? []) if (chars.has(id)) cast++;
  return { elements, cast };
}

/** A scene counts as broken down once it has at least one element or cast member. */
export function isBrokenDown(scene: SceneInfo, els: Map<ID, BreakdownElement>, chars: Map<ID, Character>): boolean {
  const c = sceneCounts(scene, els, chars);
  return c.elements + c.cast > 0;
}

/* ---------------------------------------------------------------- formatting */

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Loose key used to detect duplicates ("Red coat", "RED COAT ", "red-coat" -> "REDCOAT"). */
export function duplicateKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function intExtLabel(ie: string): string {
  if (ie === 'INT/EXT') return 'I/E';
  return ie || '—';
}

export function stripStyle(stripKey: string): { bg: string; fg: string; label: string } {
  return STRIP_COLORS[stripKey] ?? STRIP_COLORS.OTHER;
}

/** Parse a page length typed as '1 3/8', '3/8', '1.5' or '2' (pages) into eighths. */
export function parseEighths(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  let m = /^(\d+)\s+(\d+)\s*\/\s*8$/.exec(t);
  if (m) return Number(m[1]) * 8 + Number(m[2]);
  m = /^(\d+)\s*\/\s*8$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 8);
  return undefined;
}

export function sceneSortKey(s: SceneInfo): number {
  return s.index;
}

/* ---------------------------------------------------------------- draft mutations */

type D = Draft<ProjectData>;

export function sceneMetaDraft(d: D, sceneId: ID): Draft<SceneMeta> {
  return (d.scenes[sceneId] ??= { id: sceneId });
}

export function addElementToSceneDraft(d: D, sceneId: ID, elementId: ID) {
  const meta = sceneMetaDraft(d, sceneId);
  const list = (meta.elementIds ??= []);
  if (!list.includes(elementId)) list.push(elementId);
}

/** Remove the manual / element-side link between an element and a scene (tags in the text stay). */
export function removeElementFromSceneDraft(d: D, sceneId: ID, elementId: ID) {
  const meta = d.scenes[sceneId];
  if (meta?.elementIds) meta.elementIds = meta.elementIds.filter((x) => x !== elementId);
  const el = d.elements.find((e) => e.id === elementId);
  if (el?.sceneIds) el.sceneIds = el.sceneIds.filter((x) => x !== sceneId);
}

export function createElementDraft(d: D, category: ElCategory, name: string, extra: Partial<BreakdownElement> = {}): ID {
  const id = uid('el');
  d.elements.push({ id, category, name: normalizeName(name) || 'NEW ELEMENT', status: 'needed', ...extra } as Draft<BreakdownElement>);
  return id;
}

/** Delete an element and every manual link to it. */
export function deleteElementDraft(d: D, elementId: ID) {
  d.elements = d.elements.filter((e) => e.id !== elementId);
  for (const meta of Object.values(d.scenes)) {
    if (meta?.elementIds?.includes(elementId)) meta.elementIds = meta.elementIds.filter((x) => x !== elementId);
  }
}

/** Merge `sourceId` into `targetId`: links are re-pointed, empty fields filled, the source is deleted.
    Callers must make sure the source is not tagged in the script text. */
export function mergeElementsDraft(d: D, sourceId: ID, targetId: ID) {
  if (sourceId === targetId) return;
  const src = d.elements.find((e) => e.id === sourceId);
  const dst = d.elements.find((e) => e.id === targetId);
  if (!src || !dst) return;
  // scene links on the element side
  const sceneIds = new Set([...(dst.sceneIds ?? []), ...(src.sceneIds ?? [])]);
  if (sceneIds.size) dst.sceneIds = [...sceneIds];
  // manual links on scenes
  for (const meta of Object.values(d.scenes)) {
    if (!meta?.elementIds?.includes(sourceId)) continue;
    const next: ID[] = [];
    for (const id of meta.elementIds) {
      const v = id === sourceId ? targetId : id;
      if (!next.includes(v)) next.push(v);
    }
    meta.elementIds = next;
  }
  // fill empty fields of the target
  const fill = <K extends keyof BreakdownElement>(k: K) => {
    if ((dst[k] == null || dst[k] === '') && src[k] != null && src[k] !== '') (dst as any)[k] = src[k];
  };
  (['description', 'photo', 'quantity', 'status', 'source', 'cost', 'vendor', 'owner', 'characterId'] as const).forEach(fill);
  if (src.notes && src.notes !== dst.notes) dst.notes = dst.notes ? `${dst.notes}\n${src.notes}` : src.notes;
  d.elements = d.elements.filter((e) => e.id !== sourceId);
}

export function nextCharacterNumber(characters: Character[]): number {
  return characters.reduce((m, c) => Math.max(m, c.number ?? 0), 0) + 1;
}
