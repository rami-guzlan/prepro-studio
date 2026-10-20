/* Pure scheduling helpers shared by the Shooting Schedule and Call Sheets
   modules and their printed documents (no React, no store access). */
import type { BreakdownElement, CastMember, Character, ID, Location, ProjectData, Schedule, ShootDay, StripItem } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { dayDates, locationForScene } from '@/derived/project';
import { BREAKDOWN_CATEGORIES, CAST_STATUSES, LOCATION_STATUSES, STRIP_COLORS, optionLabel, type CategoryDef } from '@/lib/constants';
import { formatEighths, formatMinutes } from '@/lib/format';
import { isWeekend } from '@/lib/dates';
import { naturalCompare } from '@/lib/text';

export const BONEYARD = 'boneyard';
/** A day longer than this (minutes) gets a warning. */
export const LONG_DAY_MINUTES = 12 * 60;

export type SceneItem = Extract<StripItem, { type: 'scene' }>;
export type BannerItem = Extract<StripItem, { type: 'banner' }>;

export const BANNER_PRESETS: { label: string; text: string; color: string }[] = [
  { label: 'Company move', text: 'COMPANY MOVE', color: '#f5a524' },
  { label: 'Meal break', text: 'LUNCH — 1 HOUR', color: '#2fb36d' },
  { label: 'Note', text: 'NOTE', color: '#3e8ef7' },
];

/* ---------------------------------------------------------------- days */

export interface DayRow {
  day: ShootDay;
  /** 0-based */
  index: number;
  /** 1-based day number */
  number: number;
  /** total number of shoot days */
  total: number;
  /** effective date (explicit or computed) */
  date?: string;
  /** true when the date is computed from the schedule start / previous day */
  autoDate: boolean;
  scenes: SceneInfo[];
  eighths: number;
  minutes: number;
  characterIds: ID[];
  locationIds: ID[];
  sets: string[];
}

export function computeDays(p: Pick<ProjectData, 'schedule' | 'locations'>, model: ScriptModel): DayRow[] {
  const days = p.schedule?.days ?? [];
  const dates = dayDates({ schedule: { ...p.schedule, days } });
  return days.map((day, index) => {
    const scenes: SceneInfo[] = [];
    for (const it of day.items ?? []) {
      if (it.type !== 'scene') continue;
      const s = model.sceneById.get(it.sceneId);
      if (s) scenes.push(s);
    }
    const characterIds: ID[] = [];
    const locationIds: ID[] = [];
    const sets: string[] = [];
    let eighths = 0;
    let minutes = 0;
    for (const s of scenes) {
      eighths += s.eighths;
      minutes += s.meta?.estMinutes ?? 0;
      for (const c of s.characterIds) if (!characterIds.includes(c)) characterIds.push(c);
      const loc = locationForScene(p, s);
      if (loc && !locationIds.includes(loc.id)) locationIds.push(loc.id);
      if (s.set && !sets.includes(s.set)) sets.push(s.set);
    }
    return {
      day,
      index,
      number: index + 1,
      total: days.length,
      date: dates[index],
      autoDate: !day.date && !!dates[index],
      scenes,
      eighths,
      minutes,
      characterIds,
      locationIds,
      sets,
    };
  });
}

/** Ids of all scenes placed on a shoot day. */
export function scheduledSceneIds(schedule: Schedule | undefined): Set<ID> {
  const out = new Set<ID>();
  for (const d of schedule?.days ?? []) for (const it of d.items ?? []) if (it.type === 'scene') out.add(it.sceneId);
  return out;
}

/** Unscheduled scenes: schedule.boneyardOrder first, then the rest in script order. */
export function boneyardScenes(schedule: Schedule | undefined, model: ScriptModel): SceneInfo[] {
  const scheduled = scheduledSceneIds(schedule);
  const out: SceneInfo[] = [];
  const seen = new Set<ID>();
  for (const id of schedule?.boneyardOrder ?? []) {
    const s = model.sceneById.get(id);
    if (s && !scheduled.has(id) && !seen.has(id)) {
      out.push(s);
      seen.add(id);
    }
  }
  for (const s of model.scenes) if (!scheduled.has(s.id) && !seen.has(s.id)) out.push(s);
  return out;
}

/** Insert a scene id into a boneyard order list at its script-order position. */
export function insertInScriptOrder(order: ID[], sceneId: ID, model: ScriptModel): ID[] {
  const list = order.filter((x) => x !== sceneId);
  const idx = model.sceneById.get(sceneId)?.index ?? Number.MAX_SAFE_INTEGER;
  const at = list.findIndex((x) => (model.sceneById.get(x)?.index ?? -1) > idx);
  if (at < 0) list.push(sceneId);
  else list.splice(at, 0, sceneId);
  return list;
}

/* ---------------------------------------------------------------- scene display helpers */

export function sceneSynopsis(s: SceneInfo | undefined): string {
  if (!s) return '';
  return (s.synopsis || s.meta?.synopsis || s.firstAction || '').trim();
}

export function stripColor(s: SceneInfo | undefined): { bg: string; fg: string; label: string } {
  if (s?.meta?.color) return { bg: s.meta.color, fg: readableText(s.meta.color), label: 'Custom' };
  return STRIP_COLORS[s?.stripKey ?? ''] ?? STRIP_COLORS.OTHER;
}

export function intExtLabel(s: SceneInfo | undefined): string {
  if (!s) return '';
  return s.intExt === 'INT/EXT' ? 'I/E' : s.intExt || '';
}

export function dayNightLabel(s: SceneInfo | undefined): string {
  if (!s) return '';
  return s.dayNight || s.time || '';
}

export interface CastNum {
  id: ID;
  /** board number or a short label */
  label: string;
  name: string;
  actor?: string;
  number?: number;
}

export function compareCharacters(a: Pick<Character, 'number' | 'name'>, b: Pick<Character, 'number' | 'name'>): number {
  const na = a.number ?? Number.MAX_SAFE_INTEGER;
  const nb = b.number ?? Number.MAX_SAFE_INTEGER;
  return na - nb || naturalCompare(a.name, b.name);
}

/** Characters of a scene as board-number boxes (sorted by number). */
export function castNumbers(s: SceneInfo, charById: Map<ID, Character>, castById?: Map<ID, CastMember>): CastNum[] {
  const out: CastNum[] = [];
  for (const id of s.characterIds) {
    const c = charById.get(id);
    if (!c) continue;
    out.push({
      id,
      label: c.number != null ? String(c.number) : c.name.slice(0, 3),
      name: c.name,
      actor: c.castId ? castById?.get(c.castId)?.name : undefined,
      number: c.number,
    });
  }
  return out.sort((a, b) => compareCharacters({ number: a.number, name: a.name }, { number: b.number, name: b.name }));
}

/** Breakdown elements of a scene grouped by category (category order of BREAKDOWN_CATEGORIES). */
export function elementsByCategory(s: SceneInfo, elements: BreakdownElement[]): { cat: CategoryDef; items: BreakdownElement[] }[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const groups = new Map<string, BreakdownElement[]>();
  for (const id of s.elementIds) {
    const el = byId.get(id);
    if (!el) continue;
    groups.set(el.category, [...(groups.get(el.category) ?? []), el]);
  }
  const out: { cat: CategoryDef; items: BreakdownElement[] }[] = [];
  for (const cat of BREAKDOWN_CATEGORIES) {
    const items = groups.get(cat.id);
    if (items?.length) out.push({ cat, items });
  }
  return out;
}

/** Black or white text for a background colour. */
export function readableText(bg: string | undefined): string {
  const hex = (bg ?? '').trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#111111';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

/* ---------------------------------------------------------------- sorting */

const DN_ORDER: Record<string, number> = { DAWN: 0, DAY: 1, DUSK: 2, NIGHT: 3 };

/** Sort the scene strips of a day; banners keep their slot positions. */
export function sortDayItems(items: StripItem[], by: 'location' | 'script', p: Pick<ProjectData, 'locations'>, model: ScriptModel): StripItem[] {
  const scenes = items.filter((it): it is SceneItem => it.type === 'scene');
  const key = (it: SceneItem) => {
    const s = model.sceneById.get(it.sceneId);
    return { s, loc: locationForScene(p, s)?.name ?? '￿' };
  };
  const sorted = [...scenes].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const ia = ka.s?.index ?? 1e9;
    const ib = kb.s?.index ?? 1e9;
    if (by === 'script') return ia - ib;
    return (
      ka.loc.localeCompare(kb.loc) ||
      (ka.s?.set ?? '').localeCompare(kb.s?.set ?? '') ||
      (DN_ORDER[ka.s?.dayNight ?? ''] ?? 9) - (DN_ORDER[kb.s?.dayNight ?? ''] ?? 9) ||
      ia - ib
    );
  });
  let k = 0;
  return items.map((it) => (it.type === 'scene' ? sorted[k++] : it));
}

/* ---------------------------------------------------------------- day out of days */

export type DoodCode = '' | 'SW' | 'W' | 'WF' | 'SWF' | 'H';

export const DOOD_LEGEND: { code: Exclude<DoodCode, ''>; label: string; bg: string; fg: string }[] = [
  { code: 'SW', label: 'Start work', bg: '#b2f2bb', fg: '#0b4a1a' },
  { code: 'W', label: 'Work', bg: '#e7f5ff', fg: '#0b3d66' },
  { code: 'WF', label: 'Work finish', bg: '#ffd8a8', fg: '#6b3500' },
  { code: 'SWF', label: 'Start-work-finish', bg: '#d0bfff', fg: '#35206b' },
  { code: 'H', label: 'Hold', bg: '#e9ecef', fg: '#495057' },
];

export const DOOD_STYLE: Record<string, { bg: string; fg: string; label: string }> = Object.fromEntries(DOOD_LEGEND.map((l) => [l.code, l]));

/** Codes for every shoot day given the indices of work days. */
export function doodCodes(workDays: Set<number>, dayCount: number): DoodCode[] {
  const idx = [...workDays].sort((a, b) => a - b);
  const codes: DoodCode[] = new Array(dayCount).fill('');
  if (!idx.length) return codes;
  const first = idx[0];
  const last = idx[idx.length - 1];
  for (let i = 0; i < dayCount; i++) {
    if (workDays.has(i)) codes[i] = first === last ? 'SWF' : i === first ? 'SW' : i === last ? 'WF' : 'W';
    else if (i > first && i < last) codes[i] = 'H';
  }
  return codes;
}

export interface DoodRow {
  character: Character;
  cast?: CastMember;
  codes: DoodCode[];
  work: number;
  hold: number;
  total: number;
  startIndex: number;
  finishIndex: number;
  start?: string;
  finish?: string;
}

export function computeDood(rows: DayRow[], characters: Character[], cast: CastMember[]): DoodRow[] {
  const work = new Map<ID, Set<number>>();
  for (const r of rows) for (const cid of r.characterIds) work.set(cid, (work.get(cid) ?? new Set()).add(r.index));
  const castById = new Map(cast.map((c) => [c.id, c]));
  const out: DoodRow[] = [];
  for (const ch of characters) {
    const days = work.get(ch.id);
    if (!days?.size) continue;
    const codes = doodCodes(days, rows.length);
    const idx = [...days].sort((a, b) => a - b);
    const hold = codes.filter((c) => c === 'H').length;
    out.push({
      character: ch,
      cast: ch.castId ? castById.get(ch.castId) : undefined,
      codes,
      work: days.size,
      hold,
      total: days.size + hold,
      startIndex: idx[0],
      finishIndex: idx[idx.length - 1],
      start: rows[idx[0]]?.date,
      finish: rows[idx[idx.length - 1]]?.date,
    });
  }
  return out.sort((a, b) => compareCharacters(a.character, b.character));
}

/** Work status of a cast member (all characters they play) on a given day. */
export function castStatusOnDay(rows: DayRow[], characters: Character[], castId: ID, dayIndex: number): DoodCode {
  const mine = new Set(characters.filter((c) => c.castId === castId).map((c) => c.id));
  const days = new Set<number>();
  for (const r of rows) if (r.characterIds.some((id) => mine.has(id))) days.add(r.index);
  return doodCodes(days, rows.length)[dayIndex] ?? '';
}

/* ---------------------------------------------------------------- warnings */

export interface DayWarning {
  level: 'danger' | 'warning';
  text: string;
}

export function dayWarnings(
  row: DayRow,
  rows: DayRow[],
  p: Pick<ProjectData, 'characters' | 'cast' | 'locations' | 'schedule'>,
): DayWarning[] {
  const out: DayWarning[] = [];
  if (row.minutes > LONG_DAY_MINUTES) out.push({ level: 'danger', text: `Estimated ${formatMinutes(row.minutes)} of shooting — over a 12-hour day.` });

  if (row.date) {
    const same = rows.filter((r) => r !== row && r.date === row.date);
    if (same.length) out.push({ level: 'danger', text: `Same date as ${same.map((r) => `Day ${r.number}`).join(', ')} — cast, crew and locations are double-booked.` });
    if (p.schedule?.skipWeekends && !row.autoDate && isWeekend(row.date)) out.push({ level: 'warning', text: 'Falls on a weekend although weekends are skipped.' });
  }

  const charById = new Map(p.characters.map((c) => [c.id, c]));
  const castById = new Map(p.cast.map((c) => [c.id, c]));
  const uncast: string[] = [];
  for (const id of row.characterIds) {
    const ch = charById.get(id);
    if (!ch) continue;
    const actor = ch.castId ? castById.get(ch.castId) : undefined;
    if (!actor) uncast.push(ch.name);
    else if (actor.status === 'declined') out.push({ level: 'danger', text: `${actor.name} (${ch.name}) has declined the role.` });
    else if (actor.status !== 'confirmed') out.push({ level: 'warning', text: `${actor.name} (${ch.name}) is not confirmed yet (${optionLabel(CAST_STATUSES, actor.status)}).` });
  }
  if (uncast.length) out.push({ level: 'warning', text: `No actor cast for ${uncast.join(', ')}.` });

  for (const s of row.scenes) {
    const byActor = new Map<ID, string[]>();
    for (const id of s.characterIds) {
      const ch = charById.get(id);
      if (ch?.castId) byActor.set(ch.castId, [...(byActor.get(ch.castId) ?? []), ch.name]);
    }
    for (const [aid, names] of byActor) {
      if (names.length > 1) out.push({ level: 'danger', text: `Sc ${s.number}: ${castById.get(aid)?.name ?? 'One actor'} plays ${names.join(' and ')} in the same scene.` });
    }
  }

  const missing: string[] = [];
  for (const s of row.scenes) if (!locationForScene(p, s) && s.set && !missing.includes(s.set)) missing.push(s.set);
  if (missing.length) out.push({ level: 'warning', text: `No location linked for ${missing.join(', ')}.` });
  for (const id of row.locationIds) {
    const loc = p.locations.find((l) => l.id === id);
    if (!loc) continue;
    if (loc.status === 'declined') out.push({ level: 'danger', text: `Location “${loc.name}” is marked as declined.` });
    else if (loc.status !== 'confirmed') out.push({ level: 'warning', text: `Location “${loc.name}” is not confirmed (${optionLabel(LOCATION_STATUSES, loc.status)}).` });
  }
  return out;
}

/* ---------------------------------------------------------------- misc */

export function locationsById(locations: Location[]): Map<ID, Location> {
  return new Map(locations.map((l) => [l.id, l]));
}

/** '7/8 page', '1 page', '1 2/8 pages' */
export function pagesLabel(eighths: number): string {
  return `${formatEighths(eighths)} ${eighths > 8 ? 'pages' : 'page'}`;
}

export function dayTitle(row: Pick<DayRow, 'number' | 'total'>): string {
  return `Day ${row.number} of ${row.total}`;
}
