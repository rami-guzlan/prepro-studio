/* Pure parsing of design-system files (a Claude Design design-system zip, any
   other design-system zip, loose Markdown / CSS / tokens JSON / images / fonts /
   HTML cards) into a neutral description that importer.ts merges into the open
   space. No store, no backend, no DOM — safe to unit-test and to run on
   untrusted input: nothing is executed, sizes are capped and zip paths are
   normalised (no "..", no absolute paths). */
import { unzipSync } from 'fflate';
import type { DSLayoutKind, DSTextCase, DSTokenGroup, DSTypeStyle, DSColorRole } from './types';

export const DS_MAX_FILE = 25 * 1024 * 1024;
const MAX_ENTRIES = 3000;
const MAX_TOTAL = 300 * 1024 * 1024;
const MAX_DOC_CHARS = 200_000;
const MAX_DOCS_TOTAL = 1_500_000;
const MAX_IMAGES = 80;
const MAX_OTHER_TOKENS = 80;
const ICON_SET = 24;

export const DS_ACCEPT_EXT = ['zip', 'md', 'markdown', 'mdx', 'txt', 'css', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ttf', 'otf', 'woff', 'woff2', 'html', 'htm'];

export interface DSInputFile {
  name: string;
  data: Uint8Array;
}

export interface ParsedColor {
  name: string;
  value: string;
  cssVar?: string;
  group?: string;
  role?: DSColorRole;
  notes?: string;
}

export interface ParsedTheme {
  key: string;
  name: string;
  mode: 'light' | 'dark';
  isDefault?: boolean;
}

export interface ParsedFamily {
  family: string;
  /** e.g. "Display", "Body" (from --font-display) */
  role?: string;
  weights: number[];
  stack?: string;
}

export interface ParsedFile {
  /** normalised path inside the zip (or the file name) */
  path: string;
  kind: 'logo' | 'image' | 'font' | 'card';
  ext: string;
  data: Uint8Array;
  name: string;
  tags: string[];
  /** fonts */
  family?: string;
  weight?: number;
  /** cards */
  title?: string;
  category?: string;
}

export interface ParsedComponent {
  name: string;
  category?: string;
  description?: string;
  /** card path (stored html) */
  cardPath?: string;
  /** image path used as preview */
  previewPath?: string;
  code?: string;
}

export interface ParsedLayout {
  name: string;
  kind: DSLayoutKind;
  description?: string;
  cardPath?: string;
  previewPath?: string;
}

export interface DSParsed {
  name?: string;
  summary?: string;
  docs: { path: string; title: string; text: string }[];
  colors: ParsedColor[];
  themes: ParsedTheme[];
  /** name ("--accent") → theme key → value */
  semantic: { name: string; values: Record<string, string>; description?: string }[];
  typeStyles: Omit<DSTypeStyle, 'id'>[];
  tokens: { group: DSTokenGroup; name: string; value: string; notes?: string }[];
  families: ParsedFamily[];
  files: ParsedFile[];
  components: ParsedComponent[];
  layouts: ParsedLayout[];
  warnings: string[];
  /** text files (css / json) that were read, for the summary */
  read: string[];
}

/* ================================================================ small helpers */

const dec = new TextDecoder('utf-8', { fatal: false });
export const textOf = (b: Uint8Array) => dec.decode(b).replace(/^﻿/, '');
export const extOf = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? '').toLowerCase();
const baseOf = (path: string) => path.split('/').pop() ?? path;
const stem = (path: string) => baseOf(path).replace(/\.[^.]+$/, '');
const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

/** "brand-purple_500" → "Brand purple 500"; camelCase split. */
export function pretty(s: string, titleCase = false): string {
  const words = s
    .replace(/^-+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_.\s/]+/)
    .filter(Boolean);
  if (!words.length) return s;
  return words.map((w, i) => (titleCase || i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

const pascal = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || s;

/** Normalise a zip entry path; null when it is unsafe or junk. */
export function safePath(raw: string): string | null {
  const parts = raw.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') return null;
    if (/^[a-z]:$/i.test(p)) return null;
    out.push(p);
  }
  if (!out.length) return null;
  if (out.some((p) => p === '__MACOSX' || p === '.git' || p === 'node_modules' || p.startsWith('._'))) return null;
  const last = out[out.length - 1];
  if (last.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(last)) return null;
  return out.join('/');
}

/* ================================================================ colours */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FN = /^(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix)\(/i;

export function isColorValue(v: string | undefined): boolean {
  const s = (v ?? '').trim();
  return HEX_RE.test(s) || COLOR_FN.test(s);
}

const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** '#ABC' / 'rgb(…)' / 'hsl(…)' → '#aabbcc' when opaque; otherwise the value unchanged. */
export function normalizeColor(v: string): string {
  const s = v.trim();
  const m = HEX_RE.exec(s);
  if (m) {
    let h = m[1].toLowerCase();
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) return h.endsWith('ff') ? `#${h.slice(0, 6)}` : `#${h}`;
    return `#${h}`;
  }
  const num = (x: string, scale = 255) => (x.endsWith('%') ? (parseFloat(x) / 100) * scale : parseFloat(x));
  const rgb = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (rgb) {
    const a = rgb[4] == null ? 1 : num(rgb[4], 1);
    if (a < 1) return s;
    return `#${h2(num(rgb[1]))}${h2(num(rgb[2]))}${h2(num(rgb[3]))}`;
  }
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (hsl) {
    const a = hsl[4] == null ? 1 : num(hsl[4], 1);
    if (a < 1) return s;
    const hh = (parseFloat(hsl[1]) % 360) / 360;
    const ss = parseFloat(hsl[2]) / 100;
    const ll = parseFloat(hsl[3]) / 100;
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const f = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return `#${h2(f(hh + 1 / 3) * 255)}${h2(f(hh) * 255)}${h2(f(hh - 1 / 3) * 255)}`;
  }
  return s;
}

const ROLE_RULES: [RegExp, DSColorRole][] = [
  [/(^|[-_])(success|positive|ok|valid)([-_]|$)/, 'success'],
  [/(^|[-_])(warning|warn|caution|attention)([-_]|$)/, 'warning'],
  [/(^|[-_])(danger|error|negative|destructive|critical|alert)([-_]|$)/, 'danger'],
  [/(^|[-_])(info|notice|informative)([-_]|$)/, 'info'],
  [/(^|[-_])(chart|data|series|viz|dataviz|spectrum)([-_]|$)/, 'data'],
  [/(^|[-_])(text|fg|foreground|ink|heading|copy|on)([-_]|$)/, 'text'],
  [/(^|[-_])(border|stroke|rule|divider|outline|hairline|line)([-_]|$)/, 'border'],
  [/(^|[-_])(surface|card|panel|slab|tile|raised|sunken|overlay)([-_]|$)/, 'surface'],
  [/(^|[-_])(bg|background|canvas|backdrop|page|base)([-_]|$)/, 'background'],
  [/(^|[-_])(primary|brand)([-_]|$)/, 'primary'],
  [/(^|[-_])(secondary)([-_]|$)/, 'secondary'],
  [/(^|[-_])(accent|highlight|pop|cta)([-_]|$)/, 'accent'],
  [/(^|[-_])(neutral|gray|grey|slate|stone|zinc|mute|muted|black|white)([-_]|$)/, 'neutral'],
];

export function inferColorRole(name: string): DSColorRole | undefined {
  const n = name.toLowerCase().replace(/^-+/, '');
  for (const [re, role] of ROLE_RULES) if (re.test(n)) return role;
  return undefined;
}

/* ================================================================ tokens: groups */

export function tokenGroupOf(name: string): DSTokenGroup | null {
  const n = name.toLowerCase().replace(/^-+/, '');
  if (/^(space|spacing|spacer|gap|gutter|inset|stack|pad|padding|margin)([-_]|$)/.test(n)) return 'spacing';
  if (/^(radius|radii|rounded|round|corner|border-radius)([-_]|$)/.test(n) || /[-_]radius$/.test(n)) return 'radius';
  if (/^(shadow|shadows|elevation|box-shadow|drop-shadow)([-_]|$)/.test(n) || /[-_]shadow$/.test(n)) return 'shadow';
  if (/^(border|borders|stroke|rule|hairline|outline)([-_]|$)/.test(n)) return 'border';
  if (/^(breakpoint|breakpoints|bp|screen|media)([-_]|$)/.test(n)) return 'breakpoint';
  if (/^(duration|ease|easing|transition|motion|timing|delay|anim|animation)([-_]|$)/.test(n)) return 'motion';
  if (/^(opacity|alpha)([-_]|$)/.test(n)) return 'opacity';
  if (/^(grid|container|col|cols|column|columns|max-width|content-width|layout|page-width|measure)([-_]|$)/.test(n)) return 'grid';
  return null;
}

const TYPE_PREFIX = /^(font|ff|fs|fw|lh|type|typo|typography|text|t|leading|tracking|letter-spacing|line-height|family|typeface)([-_]|$)/;

/* ================================================================ typography */

const WEIGHT_WORDS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra[-_ ]?light|ultra[-_ ]?light/i, 200],
  [/semi[-_ ]?bold|demi[-_ ]?bold/i, 600],
  [/extra[-_ ]?bold|ultra[-_ ]?bold/i, 800],
  [/black|heavy/i, 900],
  [/light/i, 300],
  [/medium/i, 500],
  [/bold/i, 700],
  [/regular|normal|book|roman/i, 400],
];

export function weightOf(v: string | number | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return v >= 1 && v <= 1000 ? v : undefined;
  const s = v.trim();
  if (/^\d{3}$/.test(s)) return Number(s);
  if (/^bold(er)?$/i.test(s)) return 700;
  if (/^normal$/i.test(s)) return 400;
  for (const [re, w] of WEIGHT_WORDS) if (re.test(s)) return w;
  return undefined;
}

/** First family of a font-family list, without quotes. */
export function firstFamily(stack: string): string {
  const f = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '').trim() ?? '';
  return /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|inherit|initial|ui-sans-serif|ui-serif|ui-monospace|-apple-system)$/i.test(f) ? '' : f;
}

function familyLike(v: string): boolean {
  const s = v.trim();
  if (!/[a-z]/i.test(s) || /^\d/.test(s) || /\d(px|rem|em|%|pt)\b/.test(s) || /^var\(/.test(s)) return false;
  if (/^(normal|bold|italic|uppercase|lowercase|none|inherit|initial)$/i.test(s)) return false;
  return !!firstFamily(s) || /,\s*(serif|sans-serif|monospace)/i.test(s);
}

/** Parse the CSS `font` shorthand: [style] [weight] size[/line-height] family. */
export function parseFontShorthand(v: string): Partial<DSTypeStyle> | null {
  const m = /^\s*((?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|[1-9]00|[a-z-]*(?:condensed|expanded))\s+)*)([\d.]+(?:px|rem|em|pt|%|vw|vh)|clamp\([^)]*\)|calc\([^)]*\))(?:\s*\/\s*([\d.]+(?:px|rem|em|%)?|normal))?\s+(.+)$/i.exec(v);
  if (!m) return null;
  const pre = m[1] ?? '';
  const family = firstFamily(m[4]);
  if (!family) return null;
  const w = /\b([1-9]00|bold|bolder|lighter)\b/i.exec(pre);
  return { family, size: m[2], lineHeight: m[3] && m[3] !== 'normal' ? m[3] : undefined, weight: w ? weightOf(w[1]) : undefined, italic: /italic|oblique/i.test(pre) || undefined };
}

const CASE: Record<string, DSTextCase> = { uppercase: 'upper', lowercase: 'lower', capitalize: 'title', none: 'none' };

/** Class names that look like type styles. */
const TYPE_CLASS = /^(display|hero|h[1-6]|heading|headline|title|subtitle|subhead|eyebrow|overline|kicker|lead|lede|intro|body|text|paragraph|copy|caption|label|small|micro|stat|stats|numeral|numerals|number|figure|quote|pullquote|blockquote|button|code|mono|tag|meta|footnote|legal|tagline|large|xl|xxl)([-_].*)?$/i;
const TYPE_CLASS_PREFIX = /^(type|text|t|typo|font|ts)[-_](.+)$/i;

function typeNameOf(sel: string): string | null {
  const s = sel.trim();
  if (/^h[1-6]$/i.test(s)) return s.toUpperCase();
  const m = /^\.([\w-]+)$/.exec(s);
  if (!m) return null;
  const c = m[1];
  const pre = TYPE_CLASS_PREFIX.exec(c);
  if (pre && !/^(center|left|right|muted|bold|italic|upper|lower|wrap|nowrap|truncate|balance)$/i.test(pre[2])) return /^h[1-6]$/i.test(pre[2]) ? pre[2].toUpperCase() : pretty(pre[2]);
  if (TYPE_CLASS.test(c)) return /^h[1-6]$/i.test(c) ? c.toUpperCase() : pretty(c);
  return null;
}

/* ================================================================ CSS */

interface CssDecl {
  prop: string;
  value: string;
  heading?: string;
  note?: string;
}

interface CssRule {
  selector: string;
  media?: string;
  fontFace?: boolean;
  decls: CssDecl[];
}

function skipString(s: string, i: number): number {
  const q = s[i];
  let j = i + 1;
  while (j < s.length && s[j] !== q) j += s[j] === '\\' ? 2 : 1;
  return Math.min(j + 1, s.length);
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      i = skipString(s, i) - 1;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      i = e < 0 ? s.length : e + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length;
}

/** A short comment used as a section heading ("Brand core", "— Neutrals —"); '' for prose. */
function cleanHeading(text: string): string {
  const first = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^[-=*#/\s]+$/.test(l)) ?? '';
  const h = first
    .replace(/^[-=*#/\s|>]+|[-=*#/\s|:<]+$/g, '')
    .replace(/^(colou?rs?|palette|tokens?)\s*[:/—–-]\s*/i, '')
    .trim();
  if (!h || h.length > 48 || /[.;!?]$/.test(h) || h.split(/\s+/).length > 6) return '';
  return h;
}

function parseDecls(body: string, heading0 = ''): CssDecl[] {
  const out: CssDecl[] = [];
  let heading = heading0;
  let cur = '';
  let depth = 0;
  let newlineSinceSemi = true;
  const push = () => {
    const t = cur.trim();
    cur = '';
    if (!t) return;
    const k = t.indexOf(':');
    if (k <= 0) return;
    const prop = t.slice(0, k).trim();
    const value = t.slice(k + 1).replace(/!important\s*$/i, '').trim();
    if (!prop || !value) return;
    out.push({ prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, heading: heading || undefined });
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '/' && body[i + 1] === '*') {
      const e = body.indexOf('*/', i + 2);
      const text = body.slice(i + 2, e < 0 ? body.length : e);
      i = e < 0 ? body.length : e + 1;
      if (!cur.trim()) {
        if (!newlineSinceSemi && out.length) out[out.length - 1].note = text.trim().slice(0, 200) || undefined;
        else heading = cleanHeading(text) || heading;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      const j = skipString(body, i);
      cur += body.slice(i, j);
      i = j - 1;
      continue;
    }
    if (c === '\n' && !cur.trim()) newlineSinceSemi = true;
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) {
      push();
      newlineSinceSemi = false;
      continue;
    }
    if (c === '{') {
      i = matchBrace(body, i);
      cur = '';
      continue;
    }
    cur += c;
  }
  push();
  return out;
}

function parseRules(css: string, media: string | undefined, out: CssRule[], heading: { v: string }) {
  let sel = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      const text = css.slice(i + 2, e < 0 ? css.length : e);
      if (!sel.trim()) heading.v = cleanHeading(text) || heading.v;
      i = e < 0 ? css.length : e + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const j = skipString(css, i);
      sel += css.slice(i, j);
      i = j - 1;
      continue;
    }
    if (c === ';') {
      sel = '';
      continue;
    }
    if (c === '{') {
      const j = matchBrace(css, i);
      const body = css.slice(i + 1, j);
      const s = sel.trim().replace(/\s+/g, ' ');
      if (/^@(media|supports|layer|container|scope)\b/i.test(s)) parseRules(body, /^@media/i.test(s) ? s : media, out, heading);
      else if (/^@font-face/i.test(s)) out.push({ selector: s, media, fontFace: true, decls: parseDecls(body) });
      else if (!s.startsWith('@')) out.push({ selector: s, media, decls: parseDecls(body, heading.v) });
      sel = '';
      i = j;
      continue;
    }
    sel += c;
  }
  return out;
}

function splitTop(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Which contexts a selector sets variables for: the default (:root) and / or named themes. */
function contextsOf(selector: string, media?: string): { root: boolean; themes: string[] } {
  const darkMedia = !!media && /prefers-color-scheme\s*:\s*dark/i.test(media);
  const lightMedia = !!media && /prefers-color-scheme\s*:\s*light/i.test(media);
  let root = false;
  const themes: string[] = [];
  for (const part of splitTop(selector)) {
    const p = part.trim();
    const attr = /\[data-(?:theme|mode|color-scheme|scheme|brand|appearance)\s*[~|^]?=\s*["']?([\w-]+)["']?\s*\]/i.exec(p);
    const cls = /\.theme[-_]([\w-]+)/i.exec(p) ?? /\.([\w-]+)[-_]theme\b/i.exec(p);
    const mode = /(?:^|[\s.:>])\.(dark|light)(?![\w-])/i.exec(p) ?? /^(?::root|html|body)\.(dark|light)\b/i.exec(p);
    if (attr) themes.push(attr[1]);
    else if (cls) themes.push(cls[1]);
    else if (mode) themes.push(mode[1].toLowerCase());
    else if (/^(:root|html|:host|body|\*)$/i.test(p)) {
      if (darkMedia) themes.push('dark');
      else if (lightMedia) themes.push('light');
      else root = true;
    }
  }
  return { root, themes: [...new Set(themes)] };
}

/** Replace var(--x, fallback) with values (up to 6 levels). */
function resolveVars(v: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 6 || !v.includes('var(')) return v;
  const out = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_m, name: string, fb?: string) => vars.get(name) ?? fb?.trim() ?? `var(${name})`);
  return out === v ? v : resolveVars(out, vars, depth + 1);
}

/* ================================================================ JSON tokens */

interface FlatToken {
  path: string[];
  value: unknown;
  type?: string;
  description?: string;
  extra?: Record<string, unknown>;
}

const META_KEYS = new Set(['$value', 'value', '$type', 'type', '$description', 'description', 'comment', '$extensions', 'extensions', 'role', 'cssVar', 'attributes']);

function isLeaf(o: Record<string, unknown>): boolean {
  if ('$value' in o) return true;
  if (!('value' in o)) return false;
  const v = o.value;
  if (v == null) return false;
  if (typeof v !== 'object') return Object.keys(o).every((k) => META_KEYS.has(k) || k.startsWith('$'));
  return 'type' in o || '$type' in o || 'fontFamily' in (v as object) || 'fontSize' in (v as object);
}

function flattenTokens(node: unknown, path: string[], type: string | undefined, out: FlatToken[], themes: { name: string; mode?: string; isDefault?: boolean; tokens: Record<string, unknown> }[]) {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) {
    if (path.length && (typeof node === 'string' || typeof node === 'number')) out.push({ path, value: node, type });
    return;
  }
  const o = node as Record<string, unknown>;
  if (isLeaf(o)) {
    out.push({ path, value: '$value' in o ? o.$value : o.value, type: (o.$type as string) ?? (o.type as string) ?? type, description: (o.$description as string) ?? (o.description as string) ?? (o.comment as string), extra: o });
    return;
  }
  // PrePro export: themes: { Name: { mode, default, tokens: { --x: v } } }
  if (o.tokens && typeof o.tokens === 'object' && !Array.isArray(o.tokens) && (o.mode === 'light' || o.mode === 'dark')) {
    themes.push({ name: path[path.length - 1] ?? 'Theme', mode: o.mode as string, isDefault: o.default === true, tokens: o.tokens as Record<string, unknown> });
    return;
  }
  const t = (o.$type as string) ?? type;
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('$')) continue;
    flattenTokens(v, [...path, k], t, out, themes);
  }
}

const COLOR_ROOTS = new Set(['color', 'colors', 'colour', 'colours', 'palette', 'palettes', 'brand']);
const THEME_ROOTS = new Set(['themes', 'theme', 'modes', 'mode', 'schemes']);
const MODE_SEGS = new Set(['light', 'dark']);

function shadowCss(v: unknown): string {
  const one = (s: any) => (s && typeof s === 'object' ? [s.inset ? 'inset' : '', s.offsetX ?? s.x ?? 0, s.offsetY ?? s.y ?? 0, s.blur ?? 0, s.spread ?? 0, s.color ?? ''].map((x) => (typeof x === 'number' ? `${x}px` : String(x))).filter(Boolean).join(' ') : String(s));
  return Array.isArray(v) ? v.map(one).join(', ') : one(v);
}

/* ================================================================ HTML */

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", mdash: '—', ndash: '–', middot: '·', hellip: '…' };
const decodeEnt = (s: string) => s.replace(/&(#?\w+);/g, (m, e: string) => ENT[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m));
const stripTags = (s: string) => decodeEnt(s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function htmlTitle(html: string): string | undefined {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)?.[1];
  const s = stripTags(t ?? '') || stripTags(h ?? '');
  return s ? s.slice(0, 120) : undefined;
}

function htmlDescription(html: string): string | undefined {
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1];
  const s = decodeEnt(meta ?? '') || stripTags(p ?? '');
  return s ? s.slice(0, 300) : undefined;
}

/* ================================================================ Markdown */

function mdTitle(text: string, path: string): string {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const h = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(body)?.[1];
  return (h ?? pretty(stem(path))).replace(/[*_`]/g, '').trim().slice(0, 120);
}

function frontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/** First prose paragraph after the title (for the summary). */
function mdSummary(text: string): string | undefined {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const b = block.trim();
    if (!b || /^(#|```|\||[-*+] |\d+\. |>|<|!\[|---)/.test(b)) continue;
    const s = b
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length >= 20) return s.slice(0, 600);
  }
  return undefined;
}

/* ================================================================ main */

interface Entry {
  path: string;
  data: Uint8Array;
}

/** Expand zips and normalise paths; strips one shared top-level folder. */
export function expandInputs(files: DSInputFile[], warnings: string[]): Entry[] {
  const entries: Entry[] = [];
  let total = 0;
  for (const f of files) {
    const name = safePath(f.name.split(/[\\/]/).pop() ?? f.name) ?? 'file';
    if (extOf(name) !== 'zip') {
      if (f.data.length > DS_MAX_FILE) warnings.push(`Skipped ${name}: larger than ${mb(DS_MAX_FILE)}`);
      else entries.push({ path: name, data: f.data });
      continue;
    }
    let unz: Record<string, Uint8Array>;
    try {
      let count = 0;
      unz = unzipSync(f.data, {
        filter: (e) => {
          if (e.name.endsWith('/')) return false;
          if (++count > MAX_ENTRIES) return false;
          if (e.originalSize > DS_MAX_FILE) {
            warnings.push(`Skipped ${e.name}: larger than ${mb(DS_MAX_FILE)}`);
            return false;
          }
          if (total + e.originalSize > MAX_TOTAL) {
            warnings.push(`Skipped ${e.name}: the archive is larger than ${mb(MAX_TOTAL)} unpacked`);
            return false;
          }
          total += e.originalSize;
          return true;
        },
      });
      if (count > MAX_ENTRIES) warnings.push(`${name}: only the first ${MAX_ENTRIES} files were read`);
    } catch (e) {
      warnings.push(`${name} could not be unzipped (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    const inner: Entry[] = [];
    for (const [raw, data] of Object.entries(unz)) {
      const p = safePath(raw);
      if (!p) {
        if (raw.includes('..')) warnings.push(`Skipped unsafe path ${raw}`);
        continue;
      }
      if (extOf(p) === 'zip') {
        warnings.push(`Skipped nested archive ${p}`);
        continue;
      }
      inner.push({ path: p, data });
    }
    // a single top-level folder (zip of a folder): drop it
    const tops = new Set(inner.map((e) => (e.path.includes('/') ? e.path.split('/')[0] : '')));
    if (tops.size === 1 && !tops.has('')) {
      const top = [...tops][0];
      for (const e of inner) e.path = e.path.slice(top.length + 1);
    }
    entries.push(...inner);
  }
  return entries;
}

const LOGO_RE = /(logo|wordmark|logomark|lockup|monogram|favicon|brandmark|emblem|signet|symbol|(^|[-_ ])mark([-_ ]|$)|icon)/i;
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif']);
const FONT_EXT = new Set(['ttf', 'otf', 'woff', 'woff2']);
const DOC_EXT = new Set(['md', 'markdown', 'mdx', 'txt']);
const CODE_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte']);

function layoutKindOf(folders: string[]): DSLayoutKind | null {
  const f = folders.map((x) => x.toLowerCase());
  if (f.some((x) => /^slides?$|^decks?$|^presentations?$/.test(x))) return 'slide';
  if (f.some((x) => /^ui[-_ ]?kits?$|^kits?$/.test(x))) return 'ui_kit';
  if (f.some((x) => /^social$|^posts?$/.test(x))) return 'social';
  if (f.some((x) => /^(pages?|layouts?|templates?|screens?)$/.test(x))) return 'page';
  if (f.some((x) => /^(web|site|landing)$/.test(x))) return 'web';
  if (f.some((x) => /^(print|documents?|docs-print)$/.test(x))) return 'print';
  return null;
}

const isComponentFolder = (folders: string[]) => folders.some((x) => /^components?$|^blocks?$|^patterns?$/i.test(x));

/** Parse design-system files. `sourceTag` is added to every created asset's tags. */
export function parseDesignSystemFiles(files: DSInputFile[], sourceTag = ''): DSParsed {
  const warnings: string[] = [];
  const res: DSParsed = { docs: [], colors: [], themes: [], semantic: [], typeStyles: [], tokens: [], families: [], files: [], components: [], layouts: [], warnings, read: [] };
  const entries = expandInputs(files, warnings);
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);

  // css state
  const rootVars = new Map<string, string>();
  const rootMeta = new Map<string, { heading?: string; note?: string }>();
  const themeVars = new Map<string, Map<string, string>>();
  const themeOrder: string[] = [];
  const rootThemes = new Set<string>();
  const typeRules: { name: string; decls: CssDecl[] }[] = [];
  const fontFaces: { family: string; weight?: number; urls: string[]; italic?: boolean }[] = [];
  const jsonFlat: FlatToken[] = [];
  const jsonThemes: { name: string; mode?: string; isDefault?: boolean; tokens: Record<string, unknown> }[] = [];
  let docChars = 0;
  let readme: { name?: string; summary?: string } | undefined;
  let skill: { name?: string; summary?: string } | undefined;

  const images: Entry[] = [];
  const fonts: Entry[] = [];
  const cards: Entry[] = [];
  const code: Entry[] = [];

  for (const e of entries) {
    const ext = extOf(e.path);
    if (DOC_EXT.has(ext)) {
      let text = textOf(e.data);
      if (text.length > MAX_DOC_CHARS) {
        text = text.slice(0, MAX_DOC_CHARS) + '\n\n[… truncated on import]';
        warnings.push(`${e.path} was truncated to ${MAX_DOC_CHARS / 1000}k characters`);
      }
      if (docChars + text.length > MAX_DOCS_TOTAL) {
        warnings.push(`Skipped ${e.path}: too much text in one import`);
        continue;
      }
      docChars += text.length;
      res.docs.push({ path: e.path, title: mdTitle(text, e.path), text });
      const b = baseOf(e.path).toLowerCase();
      const depth = e.path.split('/').length;
      if (/^readme\.(md|markdown|txt)$/.test(b) && (!readme || depth === 1)) readme = { name: mdTitle(text, e.path), summary: mdSummary(text) };
      if (/^skill\.md$/.test(b)) {
        const fm = frontmatter(text);
        skill = { name: fm.name ? pretty(fm.name, true) : undefined, summary: fm.description || mdSummary(text) };
      }
    } else if (ext === 'css' || ext === 'scss') {
      res.read.push(e.path);
      const rules = parseRules(textOf(e.data), undefined, [], { v: '' });
      for (const r of rules) {
        if (r.fontFace) {
          const fam = r.decls.find((d) => d.prop === 'font-family')?.value;
          const family = fam ? firstFamily(fam) : '';
          if (!family) continue;
          const src = r.decls.find((d) => d.prop === 'src')?.value ?? '';
          const urls = [...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
          fontFaces.push({ family, weight: weightOf(r.decls.find((d) => d.prop === 'font-weight')?.value?.split(/\s+/)[0]), urls, italic: /italic|oblique/i.test(r.decls.find((d) => d.prop === 'font-style')?.value ?? '') || undefined });
          continue;
        }
        const ctx = contextsOf(r.selector, r.media);
        const vars = r.decls.filter((d) => d.prop.startsWith('--'));
        if (ctx.root) {
          for (const d of vars) {
            rootVars.set(d.prop, d.value);
            rootMeta.set(d.prop, { heading: d.heading, note: d.note });
          }
        }
        for (const th of ctx.themes) {
          if (!vars.length) continue;
          if (!themeVars.has(th)) {
            themeVars.set(th, new Map());
            themeOrder.push(th);
          }
          for (const d of vars) themeVars.get(th)!.set(d.prop, d.value);
          if (ctx.root) rootThemes.add(th);
        }
        if (!ctx.root && !ctx.themes.length) {
          const parts = splitTop(r.selector);
          const name = parts.length ? typeNameOf(parts[0]) : null;
          if (name && parts.every((p) => typeNameOf(p)) && r.decls.some((d) => d.prop === 'font-size' || d.prop === 'font')) typeRules.push({ name, decls: r.decls });
        }
      }
    } else if (ext === 'json') {
      const b = baseOf(e.path).toLowerCase();
      if (/^(package|package-lock|tsconfig|jsconfig|manifest|composer|vercel|netlify|\.?eslintrc|\.?prettierrc)(\..*)?\.json$/.test(b)) {
        skip('config JSON');
        continue;
      }
      try {
        const data = JSON.parse(textOf(e.data));
        const before = jsonFlat.length + jsonThemes.length;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          if (typeof data.name === 'string' && !res.name) res.name = data.name;
          const { name: _n, $schema: _s, ...rest } = data as Record<string, unknown>;
          flattenTokens(rest, [], undefined, jsonFlat, jsonThemes);
        }
        if (jsonFlat.length + jsonThemes.length > before) res.read.push(e.path);
        else warnings.push(`${e.path}: no design tokens found`);
      } catch {
        warnings.push(`${e.path} is not valid JSON`);
      }
    } else if (IMG_EXT.has(ext)) images.push(e);
    else if (FONT_EXT.has(ext)) fonts.push(e);
    else if (ext === 'html' || ext === 'htm') cards.push(e);
    else if (CODE_EXT.has(ext)) code.push(e);
    else skip(ext ? `.${ext}` : 'no extension');
  }

  /* ---------------- CSS variables → colours, themes, semantic tokens, tokens, type */
  const allVars = new Map(rootVars);
  const resolve = (v: string) => resolveVars(v, allVars);
  const themed = new Set<string>();
  for (const m of themeVars.values()) for (const k of m.keys()) themed.add(k);

  // themes: CSS blocks first, then JSON
  const themeKeys = [...themeOrder];
  const jsonThemeVars = new Map<string, Map<string, string>>();
  for (const t of jsonThemes) {
    const key = t.name;
    if (!themeKeys.includes(key)) themeKeys.push(key);
    const m = jsonThemeVars.get(key) ?? new Map<string, string>();
    for (const [k, v] of Object.entries(t.tokens)) if (typeof v === 'string' || typeof v === 'number') m.set(k.startsWith('--') ? k : `--${k}`, String(v));
    jsonThemeVars.set(key, m);
    if (t.isDefault) rootThemes.add(key);
  }
  // JSON tokens nested under themes / light / dark
  const jsonThemeTokens: FlatToken[] = [];
  const jsonPlain: FlatToken[] = [];
  for (const t of jsonFlat) {
    const lower = t.path.map((x) => x.toLowerCase());
    const ti = lower.findIndex((x) => THEME_ROOTS.has(x));
    const mi = lower.findIndex((x) => MODE_SEGS.has(x));
    let theme: string | undefined;
    let rest: string[] = t.path;
    if (ti >= 0 && t.path[ti + 1]) {
      theme = t.path[ti + 1];
      rest = [...t.path.slice(0, ti), ...t.path.slice(ti + 2)];
    } else if (mi >= 0) {
      theme = t.path[mi];
      rest = [...t.path.slice(0, mi), ...t.path.slice(mi + 1)];
    }
    if (theme && rest.length) {
      const key = theme;
      if (!themeKeys.includes(key)) themeKeys.push(key);
      jsonThemeTokens.push({ ...t, path: rest, extra: { ...(t.extra ?? {}), __theme: key } });
    } else jsonPlain.push(t);
  }
  // JSON alias resolution
  const jsonByPath = new Map(jsonPlain.map((t) => [t.path.join('.').toLowerCase(), t.value]));
  const jsonResolve = (v: unknown, depth = 0): unknown => {
    if (typeof v !== 'string' || depth > 6) return v;
    const m = /^\{([^}]+)\}$/.exec(v.trim());
    if (m) return jsonResolve(jsonByPath.get(m[1].toLowerCase()) ?? v, depth + 1);
    return v.replace(/\{([^}]+)\}/g, (all, p: string) => {
      const x = jsonByPath.get(p.toLowerCase());
      return typeof x === 'string' || typeof x === 'number' ? String(x) : all;
    });
  };
  for (const t of jsonThemeTokens) {
    const key = t.extra!.__theme as string;
    const m = jsonThemeVars.get(key) ?? new Map<string, string>();
    const v = jsonResolve(t.value);
    if (typeof v === 'string' || typeof v === 'number') m.set(`--${t.path.map((x) => x.replace(/[^\w-]+/g, '-')).join('-').toLowerCase()}`, String(v));
    jsonThemeVars.set(key, m);
  }
  for (const [k, m] of jsonThemeVars) {
    if (!themeVars.has(k)) themeVars.set(k, new Map());
    for (const [n, v] of m) {
      themeVars.get(k)!.set(n, v);
      themed.add(n);
    }
  }

  // theme list
  if (themeKeys.length) {
    const modeOf = (k: string): 'light' | 'dark' => (/dark|night|black|dim|midnight|noir|ink/i.test(k) ? 'dark' : 'light');
    let defKey = themeKeys.find((k) => rootThemes.has(k)) ?? themeKeys.find((k) => /^(light|default|base)$/i.test(k));
    for (const k of themeKeys) res.themes.push({ key: k, name: pretty(k, true), mode: modeOf(k), isDefault: k === defKey || undefined });
    if (!defKey && [...themed].some((n) => rootVars.has(n))) {
      // :root holds the default values but no theme is named after them
      const allDark = res.themes.every((t) => t.mode === 'dark');
      defKey = '__default';
      res.themes.unshift({ key: defKey, name: allDark ? 'Light' : 'Default', mode: 'light', isDefault: true });
    }
    for (const name of themed) {
      const values: Record<string, string> = {};
      for (const th of res.themes) {
        const raw = themeVars.get(th.key)?.get(name) ?? (th.isDefault ? rootVars.get(name) : undefined) ?? rootVars.get(name);
        if (raw == null) continue;
        const r = resolveVars(raw, new Map([...allVars, ...(themeVars.get(th.key) ?? new Map())]));
        values[th.key] = isColorValue(r) ? normalizeColor(r) : r;
      }
      const raw0 = rootVars.get(name) ?? [...themeVars.values()].find((m) => m.has(name))?.get(name) ?? '';
      const alias = /^var\(\s*(--[\w-]+)/.exec(raw0)?.[1];
      res.semantic.push({ name, values, description: alias ? `→ ${alias}` : rootMeta.get(name)?.note });
    }
  }

  // root variables
  const familyVars: ParsedFamily[] = [];
  const typeAgg = new Map<string, Partial<DSTypeStyle>>();
  const aggOrder: string[] = [];
  const agg = (key: string) => {
    if (!typeAgg.has(key)) {
      typeAgg.set(key, {});
      aggOrder.push(key);
    }
    return typeAgg.get(key)!;
  };
  let otherCount = 0;
  const prefixCount = new Map<string, number>();
  for (const name of rootVars.keys()) {
    const seg = name.replace(/^--/, '').replace(/^(colou?r|c|clr)[-_]/i, '').split(/[-_]/)[0]?.toLowerCase();
    if (seg) prefixCount.set(seg, (prefixCount.get(seg) ?? 0) + 1);
  }
  for (const [name, raw] of rootVars) {
    if (themed.has(name) && res.themes.length) continue;
    const value = resolve(raw);
    const n = name.replace(/^--/, '');
    const lower = n.toLowerCase();
    const meta = rootMeta.get(name) ?? {};
    if (isColorValue(value) && res.themes.length && /^var\(/.test(raw.trim())) {
      // a role alias (--accent: var(--purple)) in a themed system is a semantic token
      const values: Record<string, string> = {};
      for (const th of res.themes) values[th.key] = normalizeColor(resolveVars(raw, new Map([...allVars, ...(themeVars.get(th.key) ?? new Map())])));
      res.semantic.push({ name, values, description: `→ ${/^var\(\s*(--[\w-]+)/.exec(raw)?.[1]}` });
      continue;
    }
    if (isColorValue(value)) {
      const short = n.replace(/^(colou?r|c|clr)[-_]/i, '');
      const seg = short.split(/[-_]/)[0]?.toLowerCase();
      const group = meta.heading || ((prefixCount.get(seg) ?? 0) >= 2 && short.includes('-') ? pretty(seg, true) : undefined);
      const alias = /^var\(\s*(--[\w-]+)/.exec(raw)?.[1];
      res.colors.push({ name: pretty(short, true), value: normalizeColor(value), cssVar: name, group, role: inferColorRole(short), notes: meta.note ?? (alias ? `Same as ${alias}` : undefined) });
      continue;
    }
    if (TYPE_PREFIX.test(lower)) {
      const fs = parseFontShorthand(value);
      const m3 = /^(?:type|text|font|fs|t|typo|typography)[-_](.+?)[-_](size|font-size|weight|font-weight|line-height|lh|leading|tracking|letter-spacing|ls|family|font-family|case|transform)$/i.exec(n);
      const fam = /^(?:font|ff|font-family|family|typeface)(?:[-_](.+))?$/i.exec(n);
      if (fs) {
        Object.assign(agg(pretty(n.replace(/^(type|typo|typography|font|text|t)[-_]/i, ''))), fs, { cssVar: name });
      } else if (m3) {
        const st = agg(/^h[1-6]$/i.test(m3[1]) ? m3[1].toUpperCase() : pretty(m3[1]));
        const k = m3[2].toLowerCase();
        if (k.includes('size')) st.size = value;
        else if (k.includes('weight')) st.weight = weightOf(value);
        else if (k === 'line-height' || k === 'lh' || k === 'leading') st.lineHeight = value;
        else if (k.includes('tracking') || k.includes('letter') || k === 'ls') st.letterSpacing = value;
        else if (k.includes('family')) st.family = firstFamily(value) || value;
        else if (k === 'case' || k === 'transform') st.case = CASE[value.toLowerCase()];
      } else if (fam && familyLike(value) && !/(size|weight|height|spacing|tracking|leading)/i.test(fam[1] ?? '')) {
        const family = firstFamily(value);
        if (family) familyVars.push({ family, role: fam[1] ? pretty(fam[1]) : undefined, weights: [], stack: value });
      } else {
        if (otherCount++ < MAX_OTHER_TOKENS) res.tokens.push({ group: 'other', name, value, notes: meta.note });
      }
      continue;
    }
    const g = tokenGroupOf(n);
    if (g) {
      res.tokens.push({ group: g, name, value, notes: meta.note });
      continue;
    }
    if (otherCount++ < MAX_OTHER_TOKENS) res.tokens.push({ group: 'other', name, value, notes: meta.note });
  }
  if (otherCount > MAX_OTHER_TOKENS) warnings.push(`Only the first ${MAX_OTHER_TOKENS} uncategorised variables were imported as tokens (${otherCount} found)`);

  // class rules → type styles
  for (const r of typeRules) {
    const st = agg(r.name);
    for (const d of r.decls) {
      const v = resolve(d.value);
      if (d.prop === 'font') Object.assign(st, Object.fromEntries(Object.entries(parseFontShorthand(v) ?? {}).filter(([, x]) => x != null)));
      else if (d.prop === 'font-family') st.family = firstFamily(v) || st.family;
      else if (d.prop === 'font-weight') st.weight = weightOf(v) ?? st.weight;
      else if (d.prop === 'font-size') st.size = v;
      else if (d.prop === 'line-height') st.lineHeight = v;
      else if (d.prop === 'letter-spacing') st.letterSpacing = v;
      else if (d.prop === 'text-transform') st.case = CASE[v.toLowerCase()] ?? st.case;
      else if (d.prop === 'font-style') st.italic = /italic|oblique/i.test(v) || undefined;
    }
  }

  /* ---------------- JSON tokens (non-theme) */
  for (const t of jsonPlain) {
    const lower = t.path.map((x) => x.toLowerCase());
    const type = (t.type ?? '').toLowerCase();
    const v = jsonResolve(t.value);
    const extra = t.extra ?? {};
    if (type === 'typography' || (v && typeof v === 'object' && !Array.isArray(v) && ('fontFamily' in (v as object) || 'fontSize' in (v as object)))) {
      const o = (v ?? {}) as Record<string, unknown>;
      const st = agg(pretty(t.path[t.path.length - 1]));
      const fam = jsonResolve(o.fontFamily);
      st.family = (Array.isArray(fam) ? String(fam[0]) : typeof fam === 'string' ? firstFamily(fam) || fam : st.family) || st.family;
      st.weight = weightOf(jsonResolve(o.fontWeight) as string) ?? st.weight;
      const px = (x: unknown) => (typeof x === 'number' ? `${x}px` : typeof x === 'string' ? x : undefined);
      st.size = px(jsonResolve(o.fontSize)) ?? st.size;
      st.lineHeight = (typeof o.lineHeight === 'number' ? String(o.lineHeight) : px(jsonResolve(o.lineHeight))) ?? st.lineHeight;
      st.letterSpacing = px(jsonResolve(o.letterSpacing)) ?? st.letterSpacing;
      const tc = String(o.textCase ?? o.textTransform ?? '').toLowerCase();
      st.case = (['upper', 'lower', 'title', 'sentence', 'none'].includes(tc) ? tc : CASE[tc]) as DSTextCase | undefined ?? st.case;
      if (t.description) st.usage = t.description;
      continue;
    }
    if (typeof v !== 'string' && typeof v !== 'number') {
      if (type === 'shadow' || lower[0].includes('shadow')) res.tokens.push({ group: 'shadow', name: t.path.slice(1).join('-') || t.path[0], value: shadowCss(v), notes: t.description });
      continue;
    }
    const sv = String(v);
    if (type === 'color' || isColorValue(sv)) {
      const rest = COLOR_ROOTS.has(lower[0]) && t.path.length > 1 ? t.path.slice(1) : t.path;
      const group = rest.length > 1 ? pretty(rest[0], true) : COLOR_ROOTS.has(lower[0]) ? undefined : pretty(t.path[0], true);
      const nm = rest.length > 1 ? rest.slice(1).join(' ') : rest[0];
      const cssVar = typeof extra.cssVar === 'string' ? extra.cssVar : `--${t.path.join('-').toLowerCase().replace(/[^\w-]+/g, '-')}`;
      const role = typeof extra.role === 'string' ? (extra.role as DSColorRole) : inferColorRole(t.path.join('-'));
      res.colors.push({ name: pretty(nm, true), value: normalizeColor(sv), cssVar, group, role, notes: t.description });
      continue;
    }
    if (type === 'fontfamily' || /^(font|fonts|fontfamily|fontfamilies|family|families|typeface)$/.test(lower[0].replace(/[-_]/g, ''))) {
      if (familyLike(sv) || type === 'fontfamily') {
        const family = firstFamily(sv) || sv;
        familyVars.push({ family, role: t.path.length > 1 ? pretty(t.path[t.path.length - 1]) : undefined, weights: [], stack: sv });
        continue;
      }
    }
    const g = tokenGroupOf(t.path[0]) ?? tokenGroupOf(type) ?? (type === 'dimension' ? 'spacing' : type === 'duration' || type === 'cubicbezier' ? 'motion' : type === 'borderradius' ? 'radius' : type === 'borderwidth' ? 'border' : null);
    const name = (g && t.path.length > 1 ? t.path.slice(1) : t.path).join('-');
    const value = typeof v === 'number' && g && g !== 'opacity' && g !== 'motion' ? `${v}px` : sv;
    if (g) res.tokens.push({ group: g, name, value, notes: t.description });
    else if (otherCount++ < MAX_OTHER_TOKENS) res.tokens.push({ group: 'other', name: t.path.join('-'), value, notes: t.description });
  }

  /* ---------------- type styles */
  const familyFor = (key: string): string => {
    const k = key.toLowerCase();
    const pick = (re: RegExp) => familyVars.find((f) => re.test((f.role ?? '').toLowerCase()))?.family;
    if (/mono|code/.test(k)) return pick(/mono|code/) ?? '';
    if (/display|hero|h[1-6]|head|title|stat|numeral|number|figure/.test(k)) return pick(/display|head|title|brand/) ?? pick(/sans|body|base|text|primary/) ?? familyVars[0]?.family ?? '';
    return pick(/body|base|text|sans|primary/) ?? familyVars[0]?.family ?? '';
  };
  for (const key of aggOrder) {
    const st = typeAgg.get(key)!;
    if (!st.size && !st.weight && !st.family) continue;
    res.typeStyles.push({ ...st, name: key, family: st.family || familyFor(key) || fontFaces[0]?.family || '' });
  }

  /* ---------------- fonts */
  const faceByFile = new Map<string, { family: string; weight?: number }>();
  for (const f of fontFaces) for (const u of f.urls) faceByFile.set(baseOf(u.split('?')[0]).toLowerCase(), { family: f.family, weight: f.weight });
  const fams = new Map<string, ParsedFamily>();
  const addFam = (family: string, weight?: number, role?: string, stack?: string) => {
    const k = family.toLowerCase();
    const cur = fams.get(k) ?? { family, weights: [], role, stack };
    if (weight && !cur.weights.includes(weight)) cur.weights.push(weight);
    cur.role ??= role;
    cur.stack ??= stack;
    fams.set(k, cur);
  };
  for (const f of familyVars) addFam(f.family, undefined, f.role, f.stack);
  for (const f of fontFaces) addFam(f.family, f.weight);
  for (const t of res.typeStyles) if (t.family) addFam(t.family, t.weight);
  for (const e of fonts) {
    const face = faceByFile.get(baseOf(e.path).toLowerCase());
    const s = stem(e.path);
    const guess = s.replace(/[-_ ]?(variable[-_ ]?font.*|vf|\[.*\])$/i, '').split(/[-_]/)[0].replace(/([a-z])([A-Z])/g, '$1 $2');
    const family = face?.family ?? guess;
    const weight = face?.weight ?? weightOf(s.slice(guess.replace(/ /g, '').length));
    const folders = e.path.split('/').slice(0, -1);
    res.files.push({ path: e.path, kind: 'font', ext: extOf(e.path), data: e.data, name: pretty(s.replace(/[-_]/g, ' '), true), tags: [...folders, sourceTag].filter(Boolean), family, weight });
    addFam(family, weight);
  }
  res.families = [...fams.values()].map((f) => ({ ...f, weights: f.weights.sort((a, b) => a - b) }));

  /* ---------------- images */
  const byFolder = new Map<string, Entry[]>();
  for (const e of images) {
    const folder = e.path.split('/').slice(0, -1).join('/');
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), e]);
  }
  let imageCount = 0;
  for (const [folder, list] of byFolder) {
    if (/(^|\/)icons?$/i.test(folder) && list.length > ICON_SET) {
      warnings.push(`Skipped the icon set in ${folder}/ (${list.length} files) — it stays in the stored original`);
      continue;
    }
    for (const e of list) {
      if (imageCount >= MAX_IMAGES) {
        skip('image over the limit');
        continue;
      }
      imageCount++;
      const folders = e.path.split('/').slice(0, -1);
      const logo = LOGO_RE.test(stem(e.path)) || folders.some((f) => /^(logos?|marks?|brandmarks?|lockups?)$/i.test(f));
      res.files.push({ path: e.path, kind: logo ? 'logo' : 'image', ext: extOf(e.path), data: e.data, name: pretty(stem(e.path)), tags: [...folders, sourceTag].filter(Boolean) });
    }
  }

  /* ---------------- html cards, components, layouts */
  const imageAt = (path: string) => {
    const s = path.replace(/\.[^.]+$/, '').toLowerCase();
    return res.files.find((f) => (f.kind === 'image' || f.kind === 'logo') && f.path.replace(/\.[^.]+$/, '').toLowerCase() === s)?.path;
  };
  for (const e of cards) {
    const html = textOf(e.data);
    const folders = e.path.split('/').slice(0, -1);
    const title = htmlTitle(html) ?? pretty(stem(e.path));
    const category = folders.length ? folders.join('/') : 'cards';
    res.files.push({ path: e.path, kind: 'card', ext: 'html', data: e.data, name: title, tags: [...folders, sourceTag].filter(Boolean), title, category });
    if (/^index$/i.test(stem(e.path)) && !folders.length) continue;
    const lk = layoutKindOf(folders);
    if (isComponentFolder(folders)) {
      const ci = folders.findIndex((f) => /^components?$|^blocks?$|^patterns?$/i.test(f));
      const sub = folders[ci + 1];
      res.components.push({ name: pascal(stem(e.path)), category: sub ? pretty(sub, true) : undefined, description: htmlDescription(html) ?? (title !== pretty(stem(e.path)) ? title : undefined), cardPath: e.path, previewPath: imageAt(e.path) });
    } else if (lk) {
      const kitIdx = folders.findIndex((f) => /^ui[-_ ]?kits?$|^kits?$/i.test(f));
      const kit = lk === 'ui_kit' && folders[kitIdx + 1] ? `${pretty(folders[kitIdx + 1], true)}: ` : '';
      res.layouts.push({ name: `${kit}${title}`, kind: lk, description: htmlDescription(html), cardPath: e.path, previewPath: imageAt(e.path) });
    }
  }
  for (const e of code) {
    const folders = e.path.split('/').slice(0, -1);
    if (!isComponentFolder(folders) || !/^[A-Z]/.test(stem(e.path))) {
      skip('script / code file');
      continue;
    }
    const name = pascal(stem(e.path));
    if (res.components.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
    const text = textOf(e.data);
    const ci = folders.findIndex((f) => /^components?$|^blocks?$|^patterns?$/i.test(f));
    res.components.push({ name, category: folders[ci + 1] ? pretty(folders[ci + 1], true) : undefined, code: text.length > 6000 ? `${text.slice(0, 6000)}\n/* … truncated */` : text });
  }

  /* ---------------- name & summary */
  res.name = readme?.name || skill?.name || res.name;
  res.summary = readme?.summary || skill?.summary;
  for (const [why, n] of Object.entries(skipped)) warnings.push(`Skipped ${n} ${why}${n === 1 ? '' : ' files'}`);
  if (!entries.length) warnings.push('No files to import');
  return res;
}

/** One line: "21 colours, 2 themes × 8 semantic tokens, 9 type styles, 8 spacing tokens, 4 logos, 6 images, 12 cards, README". */
export function summarizeParsed(p: DSParsed): string {
  const n = (k: number, s: string, pl = `${s}s`) => (k ? `${k} ${k === 1 ? s : pl}` : '');
  const groups = new Map<string, number>();
  for (const t of p.tokens) groups.set(t.group, (groups.get(t.group) ?? 0) + 1);
  const docNames = p.docs.map((d) => baseOf(d.path).replace(/\.[^.]+$/, ''));
  const named = docNames.filter((d) => /^(readme|skill)$/i.test(d)).map((d) => d.toUpperCase());
  const otherDocs = docNames.length - named.length;
  const parts = [
    n(p.colors.length, 'colour'),
    p.themes.length ? `${n(p.themes.length, 'theme')}${p.semantic.length ? ` × ${n(p.semantic.length, 'semantic token')}` : ''}` : '',
    n(p.typeStyles.length, 'type style'),
    n(p.families.length, 'font family', 'font families'),
    ...[...groups].map(([g, k]) => n(k, `${g === 'other' ? 'other' : g} token`)),
    n(p.files.filter((f) => f.kind === 'logo').length, 'logo'),
    n(p.files.filter((f) => f.kind === 'image').length, 'image'),
    n(p.files.filter((f) => f.kind === 'font').length, 'font file'),
    n(p.files.filter((f) => f.kind === 'card').length, 'card'),
    n(p.components.length, 'component'),
    n(p.layouts.length, 'layout'),
    ...named,
    otherDocs ? n(otherDocs, named.length ? 'other doc' : 'doc') : '',
  ].filter(Boolean);
  return parts.join(', ') || 'nothing recognised';
}
