/* Resolves a call sheet for one shoot day: stored values + computed defaults.
   Used by the editor (to show defaults) and the printed call sheet, so both
   always agree. Pure functions only. */
import type { BreakdownCategory, BreakdownElement, CallSheet, CastMember, Character, CrewMember, Hospital, ID, Location, ProjectData } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { crewByDepartment, locationForScene } from '@/derived/project';
import { CATEGORY_BY_ID, DEPARTMENTS } from '@/lib/constants';
import { addMinutesToTime, timeToMinutes } from '@/lib/dates';
import { sunTimes } from '@/lib/sun';
import {
  castNumbers,
  castStatusOnDay,
  compareCharacters,
  computeDays,
  sceneSynopsis,
  stripColor,
  type CastNum,
  type DayRow,
  type DoodCode,
} from '@/modules/schedule/logic';

export const DEPT_NOTE_KEYS = ['Camera', 'Grip & Electric', 'Sound', 'Art/Props', 'Wardrobe', 'Hair & Makeup', 'Locations', 'Transportation', 'Catering', 'VFX'] as const;

/** Departments that are not called to set unless they have a default call. */
export const OFF_SET_DEPTS = ['Post-production', 'Music'];

/** Special crew call values (stored in CrewCall.call). */
export const CREW_SPECIAL: Record<string, string> = { 'N/C': 'Not called', 'O/C': 'On call' };

export const STANDARD_WALKIES = 'Ch 1 — Production (all)\nCh 2 — Open / private conversations\nCh 3 — Camera\nCh 4 — Grip & Electric\nCh 5 — Locations & Transpo\nCh 6 — Art / Props / Wardrobe / HMU';

export function emptyCallSheet(dayId: ID): CallSheet {
  return { dayId, castCalls: {}, crewCalls: {}, deptNotes: {} };
}

/* ---------------------------------------------------------------- types */

export interface ResolvedScene {
  kind: 'scene';
  id: string;
  scene: SceneInfo;
  cast: CastNum[];
  location?: Location;
  synopsis: string;
  bg: string;
  fg: string;
}
export interface ResolvedBanner {
  kind: 'banner';
  id: string;
  text: string;
  color?: string;
}
export type ResolvedItem = ResolvedScene | ResolvedBanner;

export interface CastRow {
  cast: CastMember;
  characters: Character[];
  numbers: string;
  status: DoodCode;
  working: boolean;
  pickup?: string;
  call?: string;
  callDefault: boolean;
  hmu?: string;
  hmuDefault: boolean;
  onSet?: string;
  notes?: string;
}

export interface CrewRow {
  crew: CrewMember;
  /** 'HH:MM', 'N/C', 'O/C' or undefined */
  call?: string;
  isDefault: boolean;
  /** the default value (shown when no explicit call is stored) */
  defaultCall?: string;
  notes?: string;
}

export interface DeptNote {
  key: string;
  text: string;
  suggestion: string;
}

export interface KeyContact {
  role: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface ResolvedCallSheet {
  row: DayRow;
  rows: DayRow[];
  cs: CallSheet;
  exists: boolean;
  crewCall?: string;
  shootingCall?: string;
  breakfast?: string;
  lunch?: string;
  estWrap?: string;
  weather: { summary?: string; high?: string; low?: string; precip?: string };
  sun: {
    sunrise?: string;
    sunset?: string;
    computedSunrise?: string;
    computedSunset?: string;
    dawn?: string;
    dusk?: string;
    goldenEvening?: string;
    source?: Location;
    overridden: boolean;
  };
  locations: Location[];
  locationsOverridden: boolean;
  hospital: Hospital;
  hospitalDefault: Hospital;
  hospitalSource?: Location;
  basecamp?: string;
  parking?: string;
  parkingDefault?: string;
  items: ResolvedItem[];
  castRows: CastRow[];
  uncast: Character[];
  extras: string;
  extrasDefault: string;
  extrasIsDefault: boolean;
  crewGroups: { dept: string; rows: CrewRow[] }[];
  deptNotes: DeptNote[];
  safetySuggestion: string;
  keyContacts: KeyContact[];
  next?: DayRow;
  nextItems: ResolvedItem[];
  missing: string[];
}

/* ---------------------------------------------------------------- helpers */

function resolveItems(p: ProjectData, model: ScriptModel, row: DayRow | undefined, charById: Map<ID, Character>, castById: Map<ID, CastMember>): ResolvedItem[] {
  if (!row) return [];
  const out: ResolvedItem[] = [];
  for (const it of row.day.items) {
    if (it.type === 'banner') {
      out.push({ kind: 'banner', id: it.id, text: it.text, color: it.color });
      continue;
    }
    const s = model.sceneById.get(it.sceneId);
    if (!s) continue;
    const c = stripColor(s);
    out.push({ kind: 'scene', id: it.id, scene: s, cast: castNumbers(s, charById, castById), location: locationForScene(p, s), synopsis: sceneSynopsis(s), bg: c.bg, fg: c.fg });
  }
  return out;
}

function elementLines(scenes: SceneInfo[], elements: BreakdownElement[], cats: BreakdownCategory[], charById: Map<ID, Character>): string[] {
  const elById = new Map(elements.map((e) => [e.id, e]));
  const found = new Map<ID, { el: BreakdownElement; scenes: string[] }>();
  for (const s of scenes) {
    for (const id of s.elementIds) {
      const el = elById.get(id);
      if (!el || !cats.includes(el.category)) continue;
      const entry = found.get(id) ?? { el, scenes: [] };
      if (!entry.scenes.includes(s.number)) entry.scenes.push(s.number);
      found.set(id, entry);
    }
  }
  const lines: string[] = [];
  for (const cat of cats) {
    const list = [...found.values()].filter((f) => f.el.category === cat);
    if (!list.length) continue;
    const label = CATEGORY_BY_ID[cat]?.label ?? cat;
    const items = list.map(({ el, scenes: sc }) => {
      const who = el.characterId ? charById.get(el.characterId)?.name : undefined;
      const qty = el.quantity && el.quantity > 1 ? ` ×${el.quantity}` : '';
      return `${el.name}${qty}${who ? ` (${who})` : ''} — Sc ${sc.join(', ')}`;
    });
    lines.push(`${label}: ${items.join('; ')}`);
  }
  return lines;
}

function uniq(values: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = v?.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function keyContacts(p: ProjectData): KeyContact[] {
  const crew = p.crew.filter((c) => c.status !== 'declined');
  const out: KeyContact[] = [];
  const pick = (role: string, tests: RegExp[], fallbackName?: string) => {
    for (const re of tests) {
      const hits = crew.filter((c) => re.test(c.position ?? ''));
      if (hits.length) {
        for (const h of hits) if (!out.some((o) => o.name === h.name && o.role === role)) out.push({ role, name: h.name, phone: h.phone, email: h.email });
        return;
      }
    }
    if (fallbackName?.trim()) out.push({ role, name: fallbackName.trim() });
  };
  pick('Producer', [/^producer$/i, /\bproducer\b/i], p.meta.producer);
  pick('Director', [/^director$/i], p.meta.director);
  pick('1st AD', [/\b(1st|first)\s+(assistant director|a\.?d\.?)\b/i]);
  pick('Production Manager', [/\b(production manager|unit production manager|upm)\b/i]);
  pick('Production Coordinator', [/\bproduction coordinator\b/i]);
  return out;
}

/** Default crew call for a crew member (before any per-day override). */
export function crewDefaultCall(c: CrewMember, generalCall: string | undefined): string | undefined {
  if (c.defaultCall) return c.defaultCall;
  if (OFF_SET_DEPTS.includes(c.department)) return 'N/C';
  return generalCall;
}

/* ---------------------------------------------------------------- resolve */

export function resolveCallSheet(
  p: ProjectData,
  model: ScriptModel,
  dayIndex: number,
  opts?: { rows?: DayRow[]; time?: (t?: string) => string },
): ResolvedCallSheet | null {
  const rows = opts?.rows ?? computeDays(p, model);
  const tm = (t?: string) => (opts?.time ? opts.time(t) : (t ?? ''));
  const row = rows[dayIndex];
  if (!row) return null;
  const stored = p.callSheets?.[row.day.id];
  const cs: CallSheet = {
    ...emptyCallSheet(row.day.id),
    ...(stored ?? {}),
    castCalls: stored?.castCalls ?? {},
    crewCalls: stored?.crewCalls ?? {},
    deptNotes: stored?.deptNotes ?? {},
  };
  const charById = new Map(p.characters.map((c) => [c.id, c]));
  const castById = new Map(p.cast.map((c) => [c.id, c]));
  const locById = new Map(p.locations.map((l) => [l.id, l]));

  /* locations */
  const override = (cs.locationIds ?? []).map((id) => locById.get(id)).filter((l): l is Location => !!l);
  const locationsOverridden = override.length > 0;
  const locations = locationsOverridden ? override : row.locationIds.map((id) => locById.get(id)).filter((l): l is Location => !!l);

  /* sun */
  const source = locations.find((l) => l.lat != null && l.lng != null && !isNaN(l.lat) && !isNaN(l.lng));
  const st = source ? sunTimes(row.date, source.lat, source.lng) : {};
  const sunrise = cs.weather?.sunrise || st.sunrise;
  const sunset = cs.weather?.sunset || st.sunset;

  /* hospital */
  const hospitalSource = locations.find((l) => l.hospital?.name || l.hospital?.address || l.hospital?.phone);
  const hospitalDefault: Hospital = { ...(hospitalSource?.hospital ?? {}) };
  const hospital: Hospital = {
    name: cs.hospital?.name || hospitalDefault.name,
    address: cs.hospital?.address || hospitalDefault.address,
    phone: cs.hospital?.phone || hospitalDefault.phone,
  };

  /* cast */
  const characters = p.characters;
  const castIds = new Set<ID>();
  for (const cid of row.characterIds) {
    const ch = charById.get(cid);
    if (ch?.castId && castById.has(ch.castId)) castIds.add(ch.castId);
  }
  // held cast: between their first and last work day but not working today
  for (const m of p.cast) if (!castIds.has(m.id) && castStatusOnDay(rows, characters, m.id, row.index) === 'H') castIds.add(m.id);
  const castRows: CastRow[] = [];
  for (const id of castIds) {
    const m = castById.get(id)!;
    const chars = characters.filter((c) => c.castId === id).sort(compareCharacters);
    const today = chars.filter((c) => row.characterIds.includes(c.id));
    const shown = today.length ? today : chars;
    const status = castStatusOnDay(rows, characters, id, row.index);
    const working = status !== 'H' && status !== '';
    const call = cs.castCalls[id] ?? {};
    const defCall = working && cs.crewCall ? addMinutesToTime(cs.crewCall, 30) : undefined;
    const defHmu = working ? cs.crewCall : undefined;
    castRows.push({
      cast: m,
      characters: shown,
      numbers: shown.map((c) => (c.number != null ? String(c.number) : '')).filter(Boolean).join(', '),
      status,
      working,
      pickup: call.pickup,
      call: call.call || defCall,
      callDefault: !call.call && !!defCall,
      hmu: call.hmu || defHmu,
      hmuDefault: !call.hmu && !!defHmu,
      onSet: call.onSet,
      notes: call.notes,
    });
  }
  castRows.sort((a, b) => {
    if (a.working !== b.working) return a.working ? -1 : 1;
    const ca = a.characters[0];
    const cb = b.characters[0];
    return ca && cb ? compareCharacters(ca, cb) : a.cast.name.localeCompare(b.cast.name);
  });
  const uncast = row.characterIds
    .map((id) => charById.get(id))
    .filter((c): c is Character => !!c && (!c.castId || !castById.has(c.castId)))
    .sort(compareCharacters);

  /* extras */
  const extrasDefault = row.scenes
    .filter((s) => s.meta?.extras?.trim())
    .map((s) => `Sc ${s.number}: ${s.meta!.extras!.trim()}`)
    .join('\n');
  const extrasIsDefault = cs.extras == null;
  const extras = cs.extras ?? extrasDefault;

  /* crew */
  const crewGroups = crewByDepartment(
    p.crew.filter((c) => c.status !== 'declined'),
    DEPARTMENTS,
  ).map(([dept, list]) => ({
    dept,
    rows: list.map((c): CrewRow => {
      const stored = cs.crewCalls[c.id];
      const def = crewDefaultCall(c, cs.crewCall);
      return { crew: c, call: stored?.call || def, isDefault: !stored?.call, defaultCall: def, notes: stored?.notes };
    }),
  }));

  /* department note suggestions */
  const scenes = row.scenes;
  const lines = (cats: BreakdownCategory[]) => elementLines(scenes, p.elements, cats, charById);
  const sceneIds = new Set(scenes.map((s) => s.id));
  const shots = (p.shots ?? []).filter((s) => s.sceneId && sceneIds.has(s.sceneId) && s.status !== 'omitted');
  const camera: string[] = [];
  if (shots.length) {
    const per = scenes
      .map((s) => [s.number, shots.filter((x) => x.sceneId === s.id).length] as const)
      .filter(([, n]) => n > 0)
      .map(([n, k]) => `Sc ${n}: ${k}`);
    camera.push(`${shots.length} shot${shots.length === 1 ? '' : 's'} planned (${per.join(' · ')})`);
    const lenses = uniq(shots.map((s) => s.lens));
    if (lenses.length) camera.push(`Lenses: ${lenses.join(', ')}`);
    const support = uniq(shots.map((s) => s.equipment));
    if (support.length) camera.push(`Support: ${support.join(', ')}`);
    const cams = uniq(shots.map((s) => s.camera));
    if (cams.length > 1) camera.push(`Cameras: ${cams.join(', ')}`);
    const rates = uniq(shots.map((s) => s.frameRate)).filter((r) => r !== p.meta.frameRate);
    if (rates.length) camera.push(`Off-speed: ${rates.join(', ')} fps`);
  }
  const grip: string[] = [...lines(['special_equipment', 'sfx'])];
  const diagrams = (p.diagrams ?? []).filter((d) => d.sceneIds?.some((id) => sceneIds.has(id)));
  if (diagrams.length) grip.unshift(`Lighting diagrams: ${diagrams.map((d) => d.name).join(', ')}`);
  const sound: string[] = [...lines(['sound', 'music'])];
  const playback = shots.filter((s) => s.sound === 'playback' || s.sound === 'mos' || s.sound === 'wild');
  if (playback.length) sound.push(`Special sound: ${uniq(playback.map((s) => `${s.number} ${s.sound?.toUpperCase()}`)).join(', ')}`);
  const loc: string[] = [];
  for (const l of locations) {
    const bits = [l.loadIn && `Load-in: ${l.loadIn}`, l.restrooms && `Restrooms: ${l.restrooms}`, l.wifi && `Wi-Fi: ${l.wifi}`].filter(Boolean);
    if (bits.length) loc.push(`${l.name} — ${bits.join(' · ')}`);
  }
  loc.push(...lines(['security']));
  const transport: string[] = [...lines(['vehicles'])];
  const pickups = castRows.filter((r) => r.pickup).map((r) => `${r.cast.name} ${tm(r.pickup)}`);
  if (pickups.length) transport.push(`Cast pickups: ${pickups.join(', ')}`);
  const catering: string[] = [];
  const workingCast = castRows.filter((r) => r.working);
  const calledCrew = crewGroups.flatMap((g) => g.rows).filter((r) => r.call && !CREW_SPECIAL[r.call]);
  if (workingCast.length || calledCrew.length) {
    catering.push(`Headcount: ${workingCast.length} cast + ${calledCrew.length} crew = ${workingCast.length + calledCrew.length}`);
  }
  const diet = [
    ...workingCast.map((r) => ({ name: r.cast.name, dietary: r.cast.dietary, allergies: r.cast.allergies })),
    ...calledCrew.map((r) => ({ name: r.crew.name, dietary: r.crew.dietary, allergies: r.crew.allergies })),
  ]
    .filter((x) => x.dietary?.trim() || x.allergies?.trim())
    .map((x) => `${x.name} — ${[x.dietary?.trim(), x.allergies?.trim() && `allergies: ${x.allergies.trim()}`].filter(Boolean).join(', ')}`);
  if (diet.length) catering.push(`Dietary: ${diet.join('; ')}`);
  if (cs.breakfast) catering.push(`Breakfast ready by ${tm(cs.breakfast)}`);
  if (cs.lunch) catering.push(`Lunch at ${tm(cs.lunch)}`);
  const vfx: string[] = [...lines(['vfx'])];
  const vfxShots = shots.filter((s) => s.vfx);
  if (vfxShots.length) vfx.push(`VFX shots: ${vfxShots.map((s) => s.number).join(', ')}`);

  const suggestions: Record<string, string[]> = {
    Camera: camera,
    'Grip & Electric': grip,
    Sound: sound,
    'Art/Props': lines(['props', 'set_dressing', 'greenery']),
    Wardrobe: lines(['wardrobe']),
    'Hair & Makeup': lines(['makeup']),
    Locations: loc,
    Transportation: transport,
    Catering: catering,
    VFX: vfx,
  };
  const deptNotes: DeptNote[] = DEPT_NOTE_KEYS.map((key) => ({ key, text: cs.deptNotes[key] ?? '', suggestion: (suggestions[key] ?? []).join('\n') }));
  // department notes stored under other keys (e.g. imported) are kept too
  for (const [key, text] of Object.entries(cs.deptNotes)) {
    if (!(DEPT_NOTE_KEYS as readonly string[]).includes(key) && text?.trim()) deptNotes.push({ key, text, suggestion: '' });
  }

  const safety = lines(['stunts', 'animals']);
  const sfx = lines(['sfx']);
  if (sfx.length) safety.push(...sfx.map((l) => `${l} — brief cast & crew before rolling.`));
  const safetySuggestion = safety.join('\n');

  /* readiness */
  const missing: string[] = [];
  if (!row.date) missing.push('shoot date');
  if (!row.scenes.length) missing.push('scenes');
  if (!cs.crewCall) missing.push('general crew call');
  if (!locations.length) missing.push('location');
  if (!hospital.name && !hospital.address) missing.push('nearest hospital');
  if (!cs.weather?.summary) missing.push('weather');
  if (!sunrise || !sunset) missing.push('sunrise / sunset');
  if (uncast.length) missing.push(`actor for ${uncast.map((c) => c.name).join(', ')}`);

  const next = rows[dayIndex + 1];
  return {
    row,
    rows,
    cs,
    exists: !!stored,
    crewCall: cs.crewCall,
    shootingCall: cs.shootingCall,
    breakfast: cs.breakfast,
    lunch: cs.lunch,
    estWrap: cs.estWrap,
    weather: { summary: cs.weather?.summary, high: cs.weather?.high, low: cs.weather?.low, precip: cs.weather?.precip },
    sun: {
      sunrise,
      sunset,
      computedSunrise: st.sunrise,
      computedSunset: st.sunset,
      dawn: st.dawn,
      dusk: st.dusk,
      goldenEvening: st.goldenEveningStart,
      source,
      overridden: !!(cs.weather?.sunrise || cs.weather?.sunset),
    },
    locations,
    locationsOverridden,
    hospital,
    hospitalDefault,
    hospitalSource,
    basecamp: cs.basecamp,
    parking: cs.parking ?? undefined,
    parkingDefault: uniq(locations.map((l) => l.parking)).join('\n') || undefined,
    items: resolveItems(p, model, row, charById, castById),
    castRows,
    uncast,
    extras,
    extrasDefault,
    extrasIsDefault,
    crewGroups,
    deptNotes,
    safetySuggestion,
    keyContacts: keyContacts(p),
    next,
    nextItems: resolveItems(p, model, next, charById, castById),
    missing,
  };
}

/** Sort key for times ('N/C' etc. last). */
export function timeSortKey(t: string | undefined): number {
  return timeToMinutes(t) ?? 99999;
}
