/* Pure helpers over LightingDiagram / DiagramItem: geometry, numbering,
   legend rows, unit formatting, item factories and gear aggregation. */
import type { DiagramItem, LightingDiagram } from '@/types';
import { uid } from '@/lib/id';
import { kindDef, isCameraKind, isLightKind, FIXTURE_BY_NAME, SENSOR_BY_ID, type KindDef } from './library';
import { beamColor, effectiveCct } from './color';

export type P = [number, number];

/* ---------------------------------------------------------------- prop access */

export function pnum(item: Pick<DiagramItem, 'props'>, key: string, fallback?: number): number | undefined {
  const v = item.props?.[key];
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return fallback;
}

export function pstr(item: Pick<DiagramItem, 'props'>, key: string, fallback = ''): string {
  const v = item.props?.[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return fallback;
}

export function pbool(item: Pick<DiagramItem, 'props'>, key: string, fallback = false): boolean {
  const v = item.props?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

/** Kind default prop merged with the item's own value. */
export function lnum(item: DiagramItem, key: string, fallback: number): number {
  return pnum(item, key) ?? pnum({ props: kindDef(item.kind).props }, key) ?? fallback;
}

/* ---------------------------------------------------------------- diagram defaults */

export const DEFAULT_PPU_FT = 40;

/** Safe numeric diagram settings (older files may lack fields). */
export function dims(d: Pick<LightingDiagram, 'width' | 'height' | 'pxPerUnit' | 'units'>) {
  const ppu = d.pxPerUnit > 0 ? d.pxPerUnit : DEFAULT_PPU_FT;
  return {
    w: d.width > 0 ? d.width : 1200,
    h: d.height > 0 ? d.height : 800,
    ppu,
    units: (d.units === 'm' ? 'm' : 'ft') as 'ft' | 'm',
  };
}

/** Canvas px per foot (for symbol scale defaults). */
export function pxPerFoot(d: Pick<LightingDiagram, 'pxPerUnit' | 'units'>): number {
  const ppu = d.pxPerUnit > 0 ? d.pxPerUnit : DEFAULT_PPU_FT;
  return d.units === 'm' ? ppu / 3.28084 : ppu;
}

/** Grid snapping step in px (6 in / 25 cm). */
export function snapStep(d: Pick<LightingDiagram, 'pxPerUnit' | 'units'>): number {
  const ppu = d.pxPerUnit > 0 ? d.pxPerUnit : DEFAULT_PPU_FT;
  return d.units === 'm' ? ppu / 4 : ppu / 2;
}

export function newDiagram(name: string, units: 'ft' | 'm' = 'ft'): LightingDiagram {
  const ppu = units === 'm' ? 120 : DEFAULT_PPU_FT;
  const w = units === 'm' ? 10 : 30;
  const h = units === 'm' ? 7 : 20;
  return {
    id: uid('dgm'),
    name,
    sceneIds: [],
    shotIds: [],
    notes: '',
    width: Math.round(w * ppu),
    height: Math.round(h * ppu),
    pxPerUnit: ppu,
    units,
    showGrid: true,
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------- unit formatting */

export function round(v: number, step = 0.1): number {
  return Math.round(v / step) * step;
}

/** 12.5 → "12.5" (trailing zeros trimmed). */
export function num(v: number, digits = 1): string {
  return Number(v.toFixed(digits)).toString();
}

export function unitLabel(units: 'ft' | 'm'): string {
  return units === 'm' ? 'm' : 'ft';
}

/** Length in units, e.g. "12.5 ft" / "3.8 m". */
export function fmtUnits(v: number | undefined, units: 'ft' | 'm', digits = 1): string {
  if (v == null || !isFinite(v)) return '';
  return `${num(v, digits)} ${unitLabel(units)}`;
}

/** Architectural length: 12' 6" (ft) or 3.80 m. */
export function fmtLength(units: number, u: 'ft' | 'm'): string {
  if (u === 'm') return `${units.toFixed(2)} m`;
  const totalIn = Math.round(units * 12);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  if (ft === 0) return `${inch}"`;
  return inch ? `${ft}' ${inch}"` : `${ft}'`;
}

/* ---------------------------------------------------------------- geometry */

export const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotate(p: P, deg: number): P {
  const a = rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/** Unit vector of the facing direction (rotation 0 = up / -y, clockwise). */
export function facing(deg: number): P {
  const a = rad(deg);
  return [Math.sin(a), -Math.cos(a)];
}

/** Rotation (deg) that faces from a towards b. */
export function angleTo(a: P, b: P): number {
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90;
  return normDeg(deg);
}

export function normDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

export function dist(a: P, b: P): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function itemScale(item: DiagramItem): number {
  return typeof item.scale === 'number' && item.scale > 0 ? item.scale : 1;
}

export function itemRot(item: DiagramItem): number {
  return typeof item.rotation === 'number' && isFinite(item.rotation) ? item.rotation : 0;
}

export function itemPoints(item: DiagramItem): P[] {
  const pts = Array.isArray(item.points) ? item.points.filter((p) => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) : [];
  if (pts.length >= 2) return pts as P[];
  return [
    [0, 0],
    [80, 0],
  ];
}

/** Box size in px (uses kind default when missing). */
export function boxSize(item: DiagramItem, def: KindDef, ppu: number): { w: number; h: number } {
  const dw = (def.size?.[0] ?? 2) * ppu;
  const dh = (def.size?.[1] ?? 2) * ppu;
  return {
    w: typeof item.w === 'number' && item.w > 0 ? item.w : dw,
    h: typeof item.h === 'number' && item.h > 0 ? item.h : dh,
  };
}

export function textLines(item: DiagramItem): string[] {
  const t = item.label ?? '';
  return (t || ' ').split('\n');
}

/** Half extents of the item in its local (unrotated) frame, centred on x/y. */
export function localHalf(item: DiagramItem, ppu: number): { hw: number; hh: number; ox: number; oy: number } {
  const def = kindDef(item.kind);
  if (def.shape === 'box') {
    const s = boxSize(item, def, ppu);
    return { hw: s.w / 2, hh: s.h / 2, ox: 0, oy: 0 };
  }
  if (def.shape === 'path') {
    const pts = itemPoints(item);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return { hw: Math.max(4, (x1 - x0) / 2), hh: Math.max(4, (y1 - y0) / 2), ox: (x0 + x1) / 2, oy: (y0 + y1) / 2 };
  }
  if (def.shape === 'text') {
    const size = pnum(item, 'size', 16)! * itemScale(item);
    const lines = textLines(item);
    const longest = Math.max(1, ...lines.map((l) => l.length));
    return { hw: Math.max(10, longest * size * 0.29), hh: (lines.length * size * 1.25) / 2, ox: 0, oy: 0 };
  }
  const s = itemScale(item);
  return { hw: (def.w * s) / 2, hh: (def.h * s) / 2, ox: 0, oy: 0 };
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Axis-aligned bounds of an item in canvas coordinates. */
export function itemAABB(item: DiagramItem, ppu: number): Box {
  const { hw, hh, ox, oy } = localHalf(item, ppu);
  const r = itemRot(item);
  const corners: P[] = [
    [ox - hw, oy - hh],
    [ox + hw, oy - hh],
    [ox + hw, oy + hh],
    [ox - hw, oy + hh],
  ].map((p) => rotate(p as P, r));
  const xs = corners.map((c) => c[0] + item.x);
  const ys = corners.map((c) => c[1] + item.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/** Approximate caption text drawn under an item (used for bounds only). */
function captionText(item: DiagramItem): string {
  const def = kindDef(item.kind);
  if (def.shape === 'path' || def.shape === 'text') return item.label?.trim() ?? '';
  if (def.category === 'light') return item.label?.trim() || pstr(item, 'fixture');
  if (def.category === 'camera') return `${pnum(item, 'lens') ?? ''}mm · ${pstr(item, 'support')}`;
  if (def.shape === 'box' && def.category !== 'grip') return '';
  return item.label?.trim() ?? '';
}

/** Item bounds including its caption and number badge (for print/export cropping). */
export function itemVisualBox(item: DiagramItem, ppu: number, ts = 1): Box {
  const b = itemAABB(item, ppu);
  const def = kindDef(item.kind);
  const text = captionText(item);
  const out = { ...b };
  if (text && def.shape !== 'path' && def.shape !== 'text') {
    const half = (text.length * 6.2 * ts + 10) / 2;
    const cx = (b.x0 + b.x1) / 2;
    out.x0 = Math.min(out.x0, cx - half);
    out.x1 = Math.max(out.x1, cx + half);
    out.y1 = b.y1 + 18 * ts;
  }
  if (def.category === 'light' || def.category === 'camera') {
    out.x1 = Math.max(out.x1, b.x1 + 16 * ts);
    out.y0 = Math.min(out.y0, b.y0 - 6 * ts);
  }
  return out;
}

/** View box for print/export: the content bounds plus a margin (or the whole canvas). */
export function contentBox(d: LightingDiagram, crop: boolean, ts = 1): Box {
  const { w, h, ppu } = dims(d);
  const canvas: Box = { x0: 0, y0: 0, x1: w, y1: h };
  const items = d.items.filter((i) => !i.hidden);
  const bb = unionBox(items.map((i) => itemVisualBox(i, ppu, ts)));
  if (!bb) return canvas;
  const outer = unionBox([canvas, bb])!;
  if (!crop) return outer;
  const m = Math.max(ppu * 1.5, 40);
  return {
    x0: Math.max(outer.x0, bb.x0 - m),
    y0: Math.max(outer.y0, bb.y0 - m),
    x1: Math.min(outer.x1, bb.x1 + m),
    y1: Math.min(outer.y1, bb.y1 + m),
  };
}

/* ---------------------------------------------------------------- numbering */

/** Light numbers (L1, L2…): explicit props.n wins, others numbered after in array order. */
export function lightNumbers(items: DiagramItem[]): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  const lights = items.filter((i) => isLightKind(i.kind));
  for (const l of lights) {
    const n = pnum(l, 'n');
    if (n != null && n > 0 && !used.has(Math.round(n))) {
      out.set(l.id, Math.round(n));
      used.add(Math.round(n));
    }
  }
  let next = 1;
  for (const l of lights) {
    if (out.has(l.id)) continue;
    while (used.has(next)) next++;
    out.set(l.id, next);
    used.add(next);
  }
  return out;
}

export function nextLightNumber(items: DiagramItem[]): number {
  const nums = [...lightNumbers(items).values()];
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Camera letters: the item label when set, otherwise A, B, C… */
export function cameraLetters(items: DiagramItem[]): Map<string, string> {
  const out = new Map<string, string>();
  const cams = items.filter((i) => isCameraKind(i.kind));
  const used = new Set(cams.map((c) => (c.label ?? '').trim().toUpperCase()).filter(Boolean));
  let k = 0;
  for (const c of cams) {
    const l = (c.label ?? '').trim();
    if (l) {
      out.set(c.id, l);
      continue;
    }
    while (k < LETTERS.length && used.has(LETTERS[k])) k++;
    const letter = LETTERS[k] ?? String(k + 1);
    used.add(letter);
    out.set(c.id, letter);
    k++;
  }
  return out;
}

export function nextCameraLetter(items: DiagramItem[]): string {
  const used = new Set([...cameraLetters(items).values()].map((s) => s.toUpperCase()));
  for (const l of LETTERS) if (!used.has(l)) return l;
  return String(used.size + 1);
}

/* ---------------------------------------------------------------- legend rows */

export interface LightRow {
  item: DiagramItem;
  n: number;
  type: string;
  purpose: string;
  fixture: string;
  watts?: number;
  cct?: number;
  effCct: number;
  gel: string;
  color: string;
  modifier: string;
  intensity: number;
  height?: number;
  channel: string;
  beam: number;
  throw: number;
  notes: string;
}

export function lightRow(item: DiagramItem, n: number): LightRow {
  const def = kindDef(item.kind);
  const cct = pnum(item, 'cct') ?? pnum({ props: def.props }, 'cct');
  const gel = pstr(item, 'gel');
  return {
    item,
    n,
    type: def.label,
    purpose: pstr(item, 'purpose'),
    fixture: pstr(item, 'fixture').trim(),
    watts: pnum(item, 'watts'),
    cct,
    effCct: effectiveCct(cct, gel),
    gel,
    color: beamColor(cct, gel, item.color),
    modifier: pstr(item, 'modifier', pstr({ props: def.props }, 'modifier')),
    intensity: lnum(item, 'intensity', 100),
    height: pnum(item, 'height'),
    channel: pstr(item, 'channel'),
    beam: lnum(item, 'beam', 60),
    throw: lnum(item, 'throw', 10),
    notes: pstr(item, 'notes'),
  };
}

/** Lights of a diagram with their numbers, sorted by number (hidden excluded unless asked). */
export function lightRows(d: Pick<LightingDiagram, 'items'>, includeHidden = false): LightRow[] {
  const nums = lightNumbers(d.items);
  return d.items
    .filter((i) => isLightKind(i.kind) && (includeHidden || !i.hidden))
    .map((i) => lightRow(i, nums.get(i.id) ?? 0))
    .sort((a, b) => a.n - b.n);
}

/** Display name of a fixture: the fixture/model field, else the kind label. */
/** False for sources you don't rent or order: the sun, window daylight, on-set screens. */
export function isOrderable(r: Pick<LightRow, 'fixture' | 'item'>): boolean {
  if (['light.sun', 'light.window', 'light.screen'].includes(kindDef(r.item.kind).kind)) return false;
  return !/^natural/i.test(r.fixture.trim());
}

export function fixtureName(r: Pick<LightRow, 'fixture' | 'type'>): string {
  return r.fixture || r.type;
}

export function wattsFor(fixture: string): number | undefined {
  return FIXTURE_BY_NAME.get(fixture.trim().toLowerCase())?.watts;
}

export interface CameraRow {
  item: DiagramItem;
  letter: string;
  type: string;
  body: string;
  lens?: number;
  sensor: string;
  hfov?: number;
  height?: number;
  support: string;
  notes: string;
}

/** Horizontal field of view (degrees) for a focal length on a sensor. */
export function hfov(lensMm: number | undefined, sensor: string | undefined): number | undefined {
  if (!lensMm || lensMm <= 0) return undefined;
  const w = SENSOR_BY_ID[sensor ?? 's35']?.width ?? 24.89;
  return (2 * Math.atan(w / (2 * lensMm)) * 180) / Math.PI;
}

export function cameraRows(d: Pick<LightingDiagram, 'items'>, includeHidden = false): CameraRow[] {
  const letters = cameraLetters(d.items);
  return d.items
    .filter((i) => isCameraKind(i.kind) && (includeHidden || !i.hidden))
    .map((i) => {
      const def = kindDef(i.kind);
      const lens = pnum(i, 'lens') ?? pnum({ props: def.props }, 'lens');
      const sensor = pstr(i, 'sensor', pstr({ props: def.props }, 'sensor', 's35'));
      return {
        item: i,
        letter: letters.get(i.id) ?? '',
        type: def.label,
        body: pstr(i, 'body'),
        lens,
        sensor,
        hfov: hfov(lens, sensor),
        height: pnum(i, 'height'),
        support: pstr(i, 'support'),
        notes: pstr(i, 'notes'),
      };
    })
    .sort((a, b) => a.letter.localeCompare(b.letter, undefined, { numeric: true }));
}

/* ---------------------------------------------------------------- item factory */

/** Default symbol scale for a diagram so icons stay proportional to the room. */
export function defaultSymbolScale(d: Pick<LightingDiagram, 'pxPerUnit' | 'units'>): number {
  const s = pxPerFoot(d) / DEFAULT_PPU_FT;
  return Math.round(Math.max(0.6, Math.min(1.6, s)) * 20) / 20;
}

/** Create a new item of a kind centred at (x, y). */
export function makeItem(kind: string, d: Pick<LightingDiagram, 'pxPerUnit' | 'units' | 'items'>, x: number, y: number, extra: Partial<DiagramItem> = {}): DiagramItem {
  const def = kindDef(kind);
  const { ppu } = dims({ width: 1, height: 1, ...d });
  const item: DiagramItem = {
    id: uid('li'),
    kind: def.kind === 'unknown' ? kind : def.kind,
    x: Math.round(x),
    y: Math.round(y),
    rotation: 0,
    scale: def.shape === 'symbol' || def.shape === 'text' ? (def.shape === 'text' ? 1 : defaultSymbolScale(d)) : 1,
  };
  if (def.shape === 'box') {
    item.w = Math.round((def.size?.[0] ?? 2) * ppu);
    item.h = Math.round((def.size?.[1] ?? 2) * ppu);
  }
  if (def.shape === 'path') {
    const len = Math.round(ppu * 4);
    item.points = [
      [0, 0],
      [len, 0],
    ];
  }
  if (def.color) item.color = def.color;
  if (def.label0) item.label = def.label0;
  if (def.props) item.props = { ...def.props };
  if (def.category === 'light') item.props = { ...(item.props ?? {}), n: nextLightNumber(d.items) };
  if (def.category === 'camera') item.label = nextCameraLetter(d.items);
  return { ...item, ...extra, props: { ...(item.props ?? {}), ...(extra.props ?? {}) } };
}

/** Insert index so floor < set < equipment < annotations stacking is kept by default. */
export function insertIndex(items: DiagramItem[], kind: string): number {
  const layer = kindDef(kind).layer;
  let idx = 0;
  for (let i = 0; i < items.length; i++) if (kindDef(items[i].kind).layer <= layer) idx = i + 1;
  return idx;
}

/** Deep copy items with new ids (and fresh light numbers / camera letters). */
export function cloneItems(src: DiagramItem[], existing: DiagramItem[], dx: number, dy: number): DiagramItem[] {
  let all = [...existing];
  const out: DiagramItem[] = [];
  for (const s of src) {
    const c: DiagramItem = JSON.parse(JSON.stringify(s));
    c.id = uid('li');
    c.x = Math.round(s.x + dx);
    c.y = Math.round(s.y + dy);
    c.locked = false;
    if (isLightKind(c.kind)) c.props = { ...(c.props ?? {}), n: nextLightNumber(all) };
    if (isCameraKind(c.kind) && existing.some((e) => isCameraKind(e.kind) && (e.label ?? '').trim().toUpperCase() === (c.label ?? '').trim().toUpperCase())) {
      c.label = nextCameraLetter(all);
    }
    all = [...all, c];
    out.push(c);
  }
  return out;
}

/* ---------------------------------------------------------------- gear aggregation */

export interface FixtureAgg {
  name: string;
  type: string;
  /** most units used in a single diagram (what you need to order) */
  maxQty: number;
  /** total placements across diagrams */
  total: number;
  watts?: number;
  diagrams: { id: string; name: string; qty: number; nums: number[] }[];
  modifiers: Set<string>;
}

export function aggregateFixtures(diagrams: LightingDiagram[], orderableOnly = false): FixtureAgg[] {
  const map = new Map<string, FixtureAgg>();
  for (const d of diagrams) {
    const perDiagram = new Map<string, { qty: number; nums: number[] }>();
    for (const r of lightRows(d)) {
      if (orderableOnly && !isOrderable(r)) continue;
      const name = fixtureName(r);
      const key = name.toLowerCase();
      let agg = map.get(key);
      if (!agg) {
        agg = { name, type: r.type, maxQty: 0, total: 0, watts: r.watts, diagrams: [], modifiers: new Set() };
        map.set(key, agg);
      }
      if (agg.watts == null && r.watts != null) agg.watts = r.watts;
      if (r.modifier && r.modifier !== 'None') agg.modifiers.add(r.modifier);
      agg.total++;
      const pd = perDiagram.get(key) ?? { qty: 0, nums: [] };
      pd.qty++;
      pd.nums.push(r.n);
      perDiagram.set(key, pd);
    }
    for (const [key, pd] of perDiagram) {
      const agg = map.get(key)!;
      agg.maxQty = Math.max(agg.maxQty, pd.qty);
      agg.diagrams.push({ id: d.id, name: d.name, qty: pd.qty, nums: pd.nums });
    }
  }
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export interface CountAgg {
  name: string;
  maxQty: number;
  total: number;
  diagrams: string[];
}

/** Aggregate non-light items (grip, modifiers) by a key function. */
export function aggregateBy(diagrams: LightingDiagram[], keyOf: (i: DiagramItem) => string | null): CountAgg[] {
  const map = new Map<string, CountAgg>();
  for (const d of diagrams) {
    const per = new Map<string, number>();
    for (const i of d.items) {
      if (i.hidden) continue;
      const k = keyOf(i);
      if (!k) continue;
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    for (const [k, qty] of per) {
      const agg = map.get(k) ?? { name: k, maxQty: 0, total: 0, diagrams: [] };
      agg.maxQty = Math.max(agg.maxQty, qty);
      agg.total += qty;
      agg.diagrams.push(d.name);
      map.set(k, agg);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Total wattage of the (visible) lights in a diagram. */
export function totalWatts(d: Pick<LightingDiagram, 'items'>): number {
  return lightRows(d).reduce((s, r) => s + (r.watts ?? 0), 0);
}

/* ---------------------------------------------------------------- lookups */

export function countLights(d: Pick<LightingDiagram, 'items'>): number {
  return d.items.filter((i) => isLightKind(i.kind)).length;
}

export function countCameras(d: Pick<LightingDiagram, 'items'>): number {
  return d.items.filter((i) => isCameraKind(i.kind)).length;
}

/** Display name of an item for lists. */
export function itemTitle(item: DiagramItem, nums?: Map<string, number>): string {
  const def = kindDef(item.kind);
  if (def.category === 'light') {
    const n = nums?.get(item.id);
    const name = pstr(item, 'fixture') || item.label || def.label;
    return n ? `L${n} · ${name}` : name;
  }
  if (def.category === 'camera') return `Camera ${item.label || ''}`.trim();
  if (def.shape === 'text') return `“${(item.label ?? '').split('\n')[0].slice(0, 40)}”`;
  return item.label?.trim() ? `${item.label} (${def.label})` : def.label;
}
