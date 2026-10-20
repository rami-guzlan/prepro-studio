/* Gear helpers: costs, lighting-diagram import and kit presets (pure). */
import type { DiagramItem, GearItem, ProjectData } from '@/types';
import { GEAR_CATEGORIES } from '@/lib/constants';
import { uid } from '@/lib/id';
import { naturalCompare, titleCase } from '@/lib/text';

export const GEAR_SOURCES: { value: GearItem['source']; label: string }[] = [
  { value: 'owned', label: 'Owned' },
  { value: 'rental', label: 'Rental' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'borrow', label: 'Borrow' },
];

/** Shoot days in the schedule (used as the default rental length). */
export function shootDayCount(p: Pick<ProjectData, 'schedule'>): number {
  return p.schedule?.days?.length ?? 0;
}

/** Rental days for an item: explicit value, else the number of shoot days (min 1). */
export function effectiveDays(g: Pick<GearItem, 'days'>, defaultDays: number): number {
  return g.days != null && !isNaN(g.days) && g.days >= 0 ? g.days : Math.max(1, defaultDays);
}

/** flat cost + day rate × days × qty */
export function lineTotal(g: GearItem, defaultDays: number): number {
  const qty = g.qty ?? 1;
  return (g.flatCost ?? 0) + (g.dayRate ?? 0) * effectiveDays(g, defaultDays) * qty;
}

export function gearTotal(items: GearItem[], defaultDays: number): number {
  return items.reduce((n, g) => n + lineTotal(g, defaultDays), 0);
}

/** Category order: standard categories first, then custom ones alphabetically. */
export function categoryOrder(items: Pick<GearItem, 'category'>[]): string[] {
  const extra = [...new Set(items.map((g) => g.category || 'Other'))].filter((c) => !GEAR_CATEGORIES.includes(c)).sort(naturalCompare);
  return [...GEAR_CATEGORIES, ...extra];
}

export function sortByCategory<T extends Pick<GearItem, 'category'>>(items: T[]): T[] {
  const order = categoryOrder(items);
  return [...items].sort((a, b) => order.indexOf(a.category || 'Other') - order.indexOf(b.category || 'Other'));
}

/* ---------------------------------------------------------------- lighting diagrams */

const ROLE_RE = /^(key|fill|back|backlight|hair|rim|kick|kicker|bounce|edge|background|bg|practical|top|side|eye ?light|motivated)( ?light)?\s*\d*$/i;

function prettyKind(kind: string): string {
  const parts = kind.split('.');
  const raw = parts.length > 1 ? parts.slice(1).join(' ') : kind;
  let name = titleCase(raw.replace(/[-_]+/g, ' ').trim());
  name = name.replace(/\bLed\b/g, 'LED').replace(/\bHmi\b/g, 'HMI').replace(/\bRgb\b/g, 'RGB').replace(/\bPar\b/g, 'PAR').replace(/\bCob\b/g, 'COB');
  if (parts.length === 1 || !name) return 'Light';
  return /light|lamp|panel|tube|fresnel|par|hmi|led|kino|softbox|lantern|bulb/i.test(name) ? name : `${name} light`;
}

/** Labels of the lighting library's light kinds (kept in sync by name so imports match the Lighting module's own "Add to gear"). */
const KIND_LABELS: Record<string, string> = {
  'light.fresnel': 'Fresnel',
  'light.panel': 'LED panel 1x1',
  'light.mat': 'LED mat',
  'light.softbox': 'Softbox',
  'light.lantern': 'Octabox / lantern',
  'light.chinaball': 'China ball',
  'light.tube': 'Tube light',
  'light.ring': 'Ring light',
  'light.par': 'PAR / spot / Leko',
  'light.hmi': 'HMI',
  'light.practical': 'Practical lamp',
  'light.screen': 'Screen glow',
};

/** Natural / non-rentable sources drawn on diagrams. */
const NATURAL_KINDS = new Set(['light.sun', 'light.window']);

export function isLightItem(it: DiagramItem): boolean {
  return typeof it.kind === 'string' && it.kind.toLowerCase().startsWith('light');
}

/** Gear name for a light on a diagram: fixture, else the kind's name, else the label (unless it is just a role like "Key"). */
export function lightName(it: DiagramItem): { name: string; role?: string } {
  const props = (it.props ?? {}) as Record<string, unknown>;
  const fixture = typeof props.fixture === 'string' ? props.fixture.trim() : '';
  const label = (it.label ?? '').trim();
  if (fixture) return { name: fixture, role: label || undefined };
  const known = KIND_LABELS[it.kind];
  if (known) return { name: known, role: label || undefined };
  if (label && !ROLE_RE.test(label)) return { name: label };
  return { name: prettyKind(it.kind), role: label || undefined };
}

/** Lights worth putting on the gear list (visible, not the sun / a window / a "Natural …" source). */
export function isRentableLight(it: DiagramItem): boolean {
  if (!isLightItem(it) || it.hidden || NATURAL_KINDS.has(it.kind)) return false;
  const fixture = typeof it.props?.fixture === 'string' ? (it.props.fixture as string) : '';
  return !/^natural\s/i.test(fixture.trim());
}

export interface DiagramLight {
  name: string;
  /** most units needed in any single diagram */
  qty: number;
  diagrams: string[];
}

/** Lights used on lighting diagrams, merged by name. Quantity = most units of a fixture needed in a single diagram. */
export function lightsFromDiagrams(p: Pick<ProjectData, 'diagrams'>): DiagramLight[] {
  const out = new Map<string, DiagramLight>();
  for (const d of p.diagrams ?? []) {
    const perDiagram = new Map<string, { name: string; n: number }>();
    for (const it of d.items ?? []) {
      if (!isRentableLight(it)) continue;
      const { name } = lightName(it);
      const key = name.toUpperCase();
      const cur = perDiagram.get(key) ?? { name, n: 0 };
      cur.n++;
      perDiagram.set(key, cur);
    }
    for (const [key, v] of perDiagram) {
      const cur = out.get(key) ?? { name: v.name, qty: 0, diagrams: [] };
      cur.qty = Math.max(cur.qty, v.n);
      if (d.name && !cur.diagrams.includes(d.name)) cur.diagrams.push(d.name);
      out.set(key, cur);
    }
  }
  return [...out.values()].sort((a, b) => naturalCompare(a.name, b.name));
}

/** Split diagram lights into those to add and those already on the gear list (same name, from a diagram or in Lighting). */
export function planLightImport(p: Pick<ProjectData, 'diagrams' | 'gear'>) {
  const lights = lightsFromDiagrams(p);
  const existing = new Set(
    (p.gear ?? []).filter((g) => g.fromDiagram || (g.category || '').toLowerCase() === 'lighting').map((g) => g.name.trim().toUpperCase()),
  );
  const add = lights.filter((l) => !existing.has(l.name.toUpperCase()));
  const skip = lights.filter((l) => existing.has(l.name.toUpperCase()));
  return { lights, add, skip };
}

export function gearFromLight(l: DiagramLight): GearItem {
  return {
    id: uid('gear'),
    category: 'Lighting',
    name: l.name,
    qty: Math.max(1, l.qty),
    source: 'rental',
    status: 'needed',
    fromDiagram: true,
    notes: l.diagrams.length ? `From lighting diagram${l.diagrams.length === 1 ? '' : 's'}: ${l.diagrams.join(', ')}` : 'From lighting diagrams',
  };
}

/* ---------------------------------------------------------------- presets */

type PresetLine = [category: string, name: string, qty?: number];

export interface GearPreset {
  id: string;
  label: string;
  description: string;
  source: GearItem['source'];
  items: PresetLine[];
}

export const GEAR_PRESETS: GearPreset[] = [
  {
    id: 'interview',
    label: 'Interview kit',
    description: 'Two-camera sit-down interview with 3-point lighting and lavs',
    source: 'owned',
    items: [
      ['Camera', 'Camera body (A cam)'],
      ['Camera', 'Camera body (B cam)'],
      ['Lenses', '24-70mm f/2.8 zoom'],
      ['Lenses', '85mm prime (B cam close-up)'],
      ['Camera Support', 'Tripod + fluid head', 2],
      ['Monitoring', 'On-camera monitor 7"', 2],
      ['Media & Storage', 'Media cards', 6],
      ['Media & Storage', 'Backup SSDs', 2],
      ['Power', 'Camera batteries', 8],
      ['Power', 'Battery chargers', 2],
      ['Lighting', 'Key light (300W LED) + softbox'],
      ['Lighting', 'Fill light (bi-colour LED panel)'],
      ['Lighting', 'Hair / back light (small LED)'],
      ['Lighting', 'Background practicals / RGB tubes', 2],
      ['Grip', 'C-stands', 4],
      ['Grip', 'Sandbags', 6],
      ['Grip', 'Black flags 24x36', 2],
      ['Grip', '5-in-1 reflector'],
      ['Sound', 'Wireless lav kit', 2],
      ['Sound', 'Shotgun mic + boom pole'],
      ['Sound', 'Audio recorder (32-bit float)'],
      ['Sound', 'Headphones', 2],
      ['Teleprompter', 'Teleprompter + tablet'],
      ['Production', 'Interview chairs / stool', 2],
      ['Expendables', 'Gaffer tape, clips, gels, AA batteries'],
    ],
  },
  {
    id: 'rungun',
    label: 'Run & gun kit',
    description: 'One-person documentary / social package that fits in a backpack',
    source: 'owned',
    items: [
      ['Camera', 'Camera body (mirrorless / FX)'],
      ['Lenses', '24-105mm f/4 zoom'],
      ['Lenses', '35mm f/1.4 prime'],
      ['Lenses', 'Variable ND filter'],
      ['Camera Support', 'Gimbal'],
      ['Camera Support', 'Monopod with fluid base'],
      ['Monitoring', 'On-camera monitor 5"'],
      ['Sound', 'On-camera shotgun mic'],
      ['Sound', 'Wireless lav kit (2 TX / 1 RX)'],
      ['Lighting', 'Bi-colour LED panel (battery)'],
      ['Lighting', 'Pocket RGB light', 2],
      ['Power', 'Camera batteries', 6],
      ['Power', 'USB-C power bank'],
      ['Media & Storage', 'Media cards', 4],
      ['Media & Storage', 'Rugged SSD for offloads'],
      ['Production', 'Camera backpack + rain cover'],
    ],
  },
  {
    id: 'narrative',
    label: 'Narrative camera package',
    description: 'Cinema camera, prime set, focus pulling, wireless video and DIT',
    source: 'rental',
    items: [
      ['Camera', 'ARRI Alexa Mini (body + accessories)'],
      ['Camera', 'Matte box + follow focus'],
      ['Camera', 'Wireless follow focus (Teradek RT)'],
      ['Lenses', 'Cooke S4/i prime set (18, 25, 32, 50, 75, 100mm)'],
      ['Lenses', 'Filter kit: ND 0.3–1.2, Pola, Black Pro-Mist 1/8'],
      ['Monitoring', 'Wireless video (Teradek Bolt 6) TX + RX'],
      ['Monitoring', 'Director’s monitor 17" + stand'],
      ['Monitoring', 'On-board monitor (SmallHD 7")'],
      ['Camera Support', 'O’Connor 2575 head + standard / baby legs + hi-hat'],
      ['Camera Support', 'Easyrig'],
      ['Camera Support', 'Doorway dolly + 12 ft track'],
      ['Power', 'V-mount batteries 150Wh', 8],
      ['Power', 'Dual V-mount chargers', 2],
      ['Media & Storage', 'CFast 2.0 cards 256GB', 4],
      ['Media & Storage', 'DIT laptop + RAID + card readers'],
      ['Sound', 'Timecode boxes', 2],
    ],
  },
  {
    id: 'lighting3',
    label: 'Lighting 3-point kit',
    description: 'Key, fill and back light with stands, flags and diffusion',
    source: 'rental',
    items: [
      ['Lighting', 'Aputure LS 600d Pro (key)'],
      ['Lighting', 'Light Dome II softbox'],
      ['Lighting', 'Aputure Nova P300c (fill)'],
      ['Lighting', 'Aputure 300x + Fresnel (back light)'],
      ['Grip', 'C-stands', 4],
      ['Grip', 'Combo stands (rolling)', 2],
      ['Grip', 'Sandbags', 8],
      ['Grip', 'Flag kit (24x36, 18x24, cutters)'],
      ['Grip', '4x4 frame + 1/2 grid diffusion'],
      ['Power', 'Stingers 25 ft', 6],
      ['Power', 'Cube taps / power distro', 4],
      ['Expendables', 'Black wrap, C-47s, gel pack'],
    ],
  },
  {
    id: 'audio',
    label: 'Audio kit',
    description: 'Production sound package: recorder, boom, lavs, IFB and timecode',
    source: 'rental',
    items: [
      ['Sound', 'Sound Devices 833 mixer-recorder'],
      ['Sound', 'Shotgun mic (Sennheiser MKH 416)'],
      ['Sound', 'Boom pole + shock mount + blimp / dead cat'],
      ['Sound', 'Wireless lav kits', 4],
      ['Sound', 'IFB / Comtek receivers (director, script)', 2],
      ['Sound', 'Timecode boxes', 2],
      ['Sound', 'Headphones', 2],
      ['Sound', 'Sound cart / bag'],
      ['Expendables', 'AA batteries, moleskin, topstick, lav tape'],
    ],
  },
];

/** Items of a preset that are not already on the list (same category + name). */
export function planPreset(preset: GearPreset, gear: GearItem[]) {
  const have = new Set(gear.map((g) => `${(g.category || '').toUpperCase()}|${g.name.trim().toUpperCase()}`));
  const add: GearItem[] = [];
  let skipped = 0;
  for (const [category, name, qty] of preset.items) {
    if (have.has(`${category.toUpperCase()}|${name.toUpperCase()}`)) {
      skipped++;
      continue;
    }
    add.push({ id: uid('gear'), category, name, qty: qty ?? 1, source: preset.source, status: 'needed' });
  }
  return { add, skipped };
}
