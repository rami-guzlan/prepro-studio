/* Colour helpers for lighting plots: colour temperature → display colour,
   gels (correction gels shift CCT in mireds, colour gels tint the beam)
   and the two drawing palettes (light paper for print/export, dark for the
   editor in dark theme). All colours are literal (usable in print). */

export interface Palette {
  dark: boolean;
  paper: string;
  /** area outside the canvas in the editor */
  desk: string;
  grid: string;
  gridMajor: string;
  gridText: string;
  /** outlines & primary text */
  ink: string;
  ink2: string;
  ink3: string;
  /** fixture bodies */
  body: string;
  body2: string;
  body3: string;
  /** camera / metal parts */
  metal: string;
  metal2: string;
  metalInk: string;
  /** text halo (same as paper) */
  halo: string;
  wood: string;
  woodInk: string;
  wall: string;
  select: string;
  camera: string;
}

export const PAL_LIGHT: Palette = {
  dark: false,
  paper: '#ffffff',
  desk: '#e6e6ec',
  grid: '#eef0f4',
  gridMajor: '#d6d9e2',
  gridText: '#8e91a0',
  ink: '#25262d',
  ink2: '#5b5e6c',
  ink3: '#a3a6b4',
  body: '#ffffff',
  body2: '#eceef3',
  body3: '#d5d8e1',
  metal: '#3a3e4a',
  metal2: '#5b606f',
  metalInk: '#d4d7e0',
  halo: '#ffffff',
  wood: '#eedfc8',
  woodInk: '#9a7a52',
  wall: '#5c6070',
  select: '#6d4aff',
  camera: '#2f7be6',
};

export const PAL_DARK: Palette = {
  dark: true,
  paper: '#1b1c22',
  desk: '#0e0e12',
  grid: '#24262e',
  gridMajor: '#32353f',
  gridText: '#717586',
  ink: '#e2e3ea',
  ink2: '#a4a7b7',
  ink3: '#5d6070',
  body: '#2c2e37',
  body2: '#373a45',
  body3: '#464a57',
  metal: '#b7bbc8',
  metal2: '#8b90a1',
  metalInk: '#2a2c34',
  halo: '#1b1c22',
  wood: '#4f4232',
  woodInk: '#b8976b',
  wall: '#9aa0b2',
  select: '#8a6dff',
  camera: '#5aa2ff',
};

/* ---------------------------------------------------------------- hex helpers */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix two hex colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return a;
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

export function darken(hex: string, t: number): string {
  return mix(hex, '#000000', t);
}

/** Readable text colour on top of a background colour. */
export function textOn(hex: string): string {
  const c = hexToRgb(hex);
  if (!c) return '#ffffff';
  const l = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  return l > 0.62 ? '#1b1c22' : '#ffffff';
}

/* ---------------------------------------------------------------- colour temperature */

/* Display colours chosen to read on white paper AND dark backgrounds:
   tungsten = amber, daylight = pale cool, high CCT = blue. */
const CCT_STOPS: [number, string][] = [
  [1700, '#ff6a14'],
  [2200, '#ff8a2a'],
  [2700, '#ffa03c'],
  [3200, '#ffb24e'],
  [3800, '#ffc871'],
  [4300, '#ffdb98'],
  [5000, '#eee6cf'],
  [5600, '#d3e2ff'],
  [6500, '#b7cfff'],
  [7500, '#9bbcff'],
  [10000, '#76a2ff'],
];

export function cctToHex(k: number | undefined): string {
  const v = k && isFinite(k) ? k : 5600;
  if (v <= CCT_STOPS[0][0]) return CCT_STOPS[0][1];
  for (let i = 1; i < CCT_STOPS.length; i++) {
    const [k1, c1] = CCT_STOPS[i];
    if (v <= k1) {
      const [k0, c0] = CCT_STOPS[i - 1];
      return mix(c0, c1, (v - k0) / (k1 - k0));
    }
  }
  return CCT_STOPS[CCT_STOPS.length - 1][1];
}

/* ---------------------------------------------------------------- gels */

export interface GelDef {
  name: string;
  /** mired shift (correction gels) */
  mired?: number;
  /** beam tint (colour gels) */
  color?: string;
}

export const GELS: GelDef[] = [
  { name: 'Full CTO', mired: 159 },
  { name: '1/2 CTO', mired: 81 },
  { name: '1/4 CTO', mired: 42 },
  { name: '1/8 CTO', mired: 20 },
  { name: 'Full CTB', mired: -131 },
  { name: '1/2 CTB', mired: -68 },
  { name: '1/4 CTB', mired: -30 },
  { name: '1/8 CTB', mired: -12 },
  { name: 'Full Plus Green', color: '#b6e58a' },
  { name: '1/2 Plus Green', color: '#d2efb2' },
  { name: 'Full Minus Green', color: '#f0a8d6' },
  { name: '1/2 Minus Green', color: '#f6c6e4' },
  { name: 'Straw', color: '#ffd468' },
  { name: 'Bastard Amber', color: '#ffb488' },
  { name: 'Chocolate', color: '#c48a5c' },
  { name: 'Steel Blue', color: '#8fb6e6' },
  { name: 'Moonlight Blue', color: '#6f9be0' },
  { name: 'Medium Blue', color: '#3f7fe0' },
  { name: 'Congo Blue', color: '#4b3bd8' },
  { name: 'Cyan / Teal', color: '#33c4c4' },
  { name: 'Lavender', color: '#b9a3e8' },
  { name: 'Magenta', color: '#df43b0' },
  { name: 'Primary Red', color: '#e23a3a' },
  { name: 'Primary Green', color: '#3cb84a' },
];

const FRACTIONS: [RegExp, number][] = [
  [/\b1\s*\/\s*8\b|eighth/, 0.125],
  [/\b1\s*\/\s*4\b|quarter/, 0.25],
  [/\b1\s*\/\s*2\b|half/, 0.5],
  [/\b3\s*\/\s*4\b/, 0.75],
];

/** Interpret a free-text gel name. */
export function parseGel(text: string | undefined): GelDef | null {
  const t = (text ?? '').trim().toLowerCase();
  if (!t || t === 'none') return null;
  const exact = GELS.find((g) => g.name.toLowerCase() === t);
  if (exact) return exact;
  const hex = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(t);
  if (hex) return { name: text!, color: hex[0] };
  const frac = FRACTIONS.find(([re]) => re.test(t))?.[1] ?? 1;
  if (/\bcto\b|orange/.test(t)) return { name: text!, mired: Math.round(159 * frac) };
  if (/\bctb\b/.test(t)) return { name: text!, mired: Math.round(-131 * frac) };
  const partial = GELS.find((g) => t.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(t));
  return partial ?? null;
}

/** Effective colour temperature after a correction gel. */
export function effectiveCct(cct: number | undefined, gel: string | undefined): number {
  const k = cct && cct > 0 ? cct : 5600;
  const g = parseGel(gel);
  if (!g?.mired) return k;
  const m = 1e6 / k + g.mired;
  return m > 0 ? Math.round(1e6 / m) : k;
}

/** Display colour of a light beam: explicit colour > colour gel > colour temperature (+ correction gel). */
export function beamColor(cct: number | undefined, gel: string | undefined, override?: string): string {
  if (override && hexToRgb(override)) return override;
  const g = parseGel(gel);
  if (g?.color) return g.color;
  return cctToHex(effectiveCct(cct, gel));
}
