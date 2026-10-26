/* ==========================================================================
   Design system of a Marketing Space (SpaceData.designSystem), shown in Brand
   Kit & Assets → Design system. Written to be read by people AND agents (Claude
   Design, image models, coding agents): compile.ts turns it into a portable
   guide (Markdown), tokens (JSON / CSS) and a zip bundle.

   Two layers:
   - FOUNDATIONS (what a Claude Design design system holds): themes, semantic
     tokens per theme, type styles, spacing / radius / border / shadow / grid
     tokens, components with props, layouts (pages, slides, UI kits). Colours,
     logos, fonts and images stay BrandAssets (Assets tab) — colour assets carry
     their palette group, role and CSS variable; the design system points at
     assets by id.
   - ART DIRECTION (what an image model needs): brand intent, imagery,
     composition, how elements relate, signature treatments, colour behaviour,
     typography in images, rules with a level (required / preferred / open) and
     a scope (brand / campaign), annotated references with their role and
     verdict (on brand / near miss / off brand), output formats, reusable
     generation briefs, a review standard and a finishing workflow.

   Conventions as everywhere: stable ids, optional fields may be missing, ids may
   point at deleted items. normalizeDesignSystem() must never throw.
   ========================================================================== */
import type { ID } from '@/types';

/** required = never break it; preferred = default, deviate with a reason; open = up to the maker */
export type DSLevel = 'required' | 'preferred' | 'open';
/** brand = permanent identity; campaign = only for one campaign / series (campaignId) */
export type DSScope = 'brand' | 'campaign';

export interface DSTheme {
  id: ID;
  /** e.g. "IKN", "Intuition Light", "Intuition Dark" */
  name: string;
  mode: 'light' | 'dark';
  isDefault?: boolean;
  /** what changes in this theme beyond swapping colours (e.g. "the year sits in a cyan block") */
  notes?: string;
}

/** A role-named token whose value changes per theme, e.g. --accent, --surface-slab. */
export interface DSSemanticToken {
  id: ID;
  /** CSS custom property name incl. "--", e.g. "--accent" */
  name: string;
  description?: string;
  /** theme id → value (hex, css colour, gradient, or any CSS value) */
  values: Record<ID, string>;
}

export type DSTextCase = 'none' | 'upper' | 'lower' | 'title' | 'sentence';

export interface DSTypeStyle {
  id: ID;
  /** e.g. "Display", "H1", "Eyebrow", "Body", "Stat" */
  name: string;
  family: string;
  /** 100–900 */
  weight?: number;
  /** CSS size, e.g. "48px", "1.25rem", "clamp(...)" */
  size?: string;
  lineHeight?: string;
  letterSpacing?: string;
  case?: DSTextCase;
  italic?: boolean;
  usage?: string;
  /** CSS custom property, e.g. "--type-h1" */
  cssVar?: string;
}

export type DSTokenGroup = 'spacing' | 'radius' | 'border' | 'shadow' | 'grid' | 'breakpoint' | 'motion' | 'opacity' | 'other';

export interface DSToken {
  id: ID;
  group: DSTokenGroup;
  /** e.g. "space-3", "--radius-card" */
  name: string;
  /** e.g. "8px", "0 2px 8px rgba(0,0,0,.12)" */
  value: string;
  notes?: string;
}

export interface DSComponent {
  id: ID;
  /** PascalCase, e.g. "StatCard" */
  name: string;
  /** e.g. "Cards", "Document blocks", "Brand motifs" */
  category?: string;
  description?: string;
  /** props / slots, one per line: "value — the big number" */
  props?: string;
  variants?: string;
  states?: string;
  /** how it differs per theme */
  themeNotes?: string;
  usage?: string;
  /** preview image (BrandAsset id) */
  previewAssetId?: ID;
  /** imported specimen (stored html asset name) */
  file?: string;
  /** reference markup / code snippet */
  code?: string;
}

export type DSLayoutKind = 'page' | 'slide' | 'social' | 'web' | 'print' | 'ui_kit' | 'other';

export interface DSLayout {
  id: ID;
  /** e.g. "Cover", "Agenda", "Content: card grid", "Proposal viewer" */
  name: string;
  kind: DSLayoutKind;
  description?: string;
  /** structure, top to bottom / left to right, e.g. "eyebrow · title · spectrum tick · 3-column card grid · footer" */
  structure?: string;
  /** format it is built for (DSFormat id) */
  formatId?: ID;
  previewAssetId?: ID;
  file?: string;
}

export interface DSIntentWord {
  id: ID;
  /** adjective, e.g. "confident" */
  word: string;
  /** what it looks like in practice, e.g. "oversized type, few elements, lots of black" */
  looksLike: string;
}

export interface DSIntent {
  audience?: string;
  /** the impression people should leave with */
  impression?: string;
  /** what the visuals have to achieve */
  purpose?: string;
  personality: DSIntentWord[];
}

export interface DSArtDirection {
  imagery: {
    /** approved subjects */
    subjects?: string;
    /** photography / illustration / 3D / collage … */
    style?: string;
    lighting?: string;
    camera?: string;
    cropping?: string;
    /** realism level */
    realism?: string;
    /** how people appear (or don't) */
    people?: string;
    /** subjects and looks to avoid */
    avoid?: string;
  };
  /** hierarchy, focal points, negative space, text-to-image balance, alignment, overlaps */
  composition?: string;
  /** how the elements work together — the single most useful paragraph for a generator */
  relationships?: string;
  colorBehavior: {
    /** dominant colours and roughly how much of the frame they cover */
    dominant?: string;
    accents?: string;
    /** e.g. "70 % black, 20 % white, 10 % cyan" */
    coverage?: string;
    /** how photos are graded (monochrome, warm, high contrast …) */
    photoTreatment?: string;
    backgrounds?: string;
    /** what changes between light and dark versions */
    lightDark?: string;
  };
  /** type inside images: weights, widths, case, spacing, line breaks, hierarchy */
  typographyInImages?: string;
  /** acceptable font substitutions when the real fonts are unavailable */
  substitutions?: string;
}

export interface DSTreatment {
  id: ID;
  /** e.g. "Angular photo crops", "Film grain", "Cyan block behind numbers" */
  name: string;
  description?: string;
  whereToUse?: string;
  avoid?: string;
  level: DSLevel;
  exampleAssetId?: ID;
}

export type DSRuleArea =
  | 'brand'
  | 'logo'
  | 'color'
  | 'typography'
  | 'imagery'
  | 'composition'
  | 'treatment'
  | 'layout'
  | 'components'
  | 'voice'
  | 'accessibility'
  | 'production'
  | 'other';

export interface DSRule {
  id: ID;
  area: DSRuleArea;
  /** rule = a statement; do / dont = an example behaviour */
  kind: 'rule' | 'do' | 'dont';
  text: string;
  level: DSLevel;
  scope: DSScope;
  /** scope 'campaign': the campaign it applies to */
  campaignId?: ID;
  why?: string;
}

/** What a reference controls (prevents "inspiration" from meaning "copy everything"). */
export type DSReferenceRole = 'style' | 'composition' | 'asset' | 'campaign' | 'mood' | 'color' | 'typography';

export interface DSReference {
  id: ID;
  /** the image (BrandAsset id, kind image / logo) */
  assetId?: ID;
  title: string;
  roles: DSReferenceRole[];
  /** what to take from it */
  borrow?: string;
  /** what NOT to take from it */
  ignore?: string;
  verdict: 'on_brand' | 'near_miss' | 'off_brand';
  /** why it is (or isn't) on brand */
  why?: string;
  mode?: 'light' | 'dark' | 'any';
  campaignId?: ID;
}

export interface DSFormat {
  id: ID;
  /** e.g. "LinkedIn post", "YouTube thumbnail", "16:9 slide", "A4 one-pager" */
  name: string;
  width?: number;
  height?: number;
  /** px (default), pt or mm */
  unit?: 'px' | 'pt' | 'mm';
  /** e.g. "4:5" */
  aspect?: string;
  /** e.g. "60px on every side; keep the bottom 120px free for UI" */
  safeArea?: string;
  /** smallest readable text size */
  minText?: string;
  background?: string;
  transparent?: boolean;
  /** e.g. "2x", "300 dpi" */
  resolution?: string;
  /** room for copy, small-screen readability, print bleed … */
  notes?: string;
}

/** A reusable request for an image model / designer. */
export interface DSBrief {
  id: ID;
  name: string;
  objective?: string;
  audience?: string;
  formatId?: ID;
  /** the exact copy that must appear (placed in finishing when exactness matters) */
  copy?: string;
  /** rules that apply (DSRule ids) */
  ruleIds: ID[];
  /** references and their roles (DSReference ids) */
  referenceIds: ID[];
  /** what may vary */
  variation?: string;
  /** extra review points for this brief */
  review?: string;
  /** what is placed over the generated art afterwards (logo, exact text) */
  finishing?: string;
  campaignId?: ID;
}

/** A file imported into the design system (e.g. a Claude Design design-system zip). */
export interface DSSource {
  id: ID;
  fileName: string;
  /** stored original (asset name) */
  file?: string;
  importedAt: string;
  /** what was imported, one line */
  summary?: string;
  /** text documents found inside (README.md, SKILL.md, guidelines …), kept verbatim for agents */
  docs: { path: string; title: string; text: string }[];
  /** preview cards / specimens (stored html or image asset names) */
  cards: { path: string; title: string; file: string; category?: string }[];
}

export interface DesignSystem {
  /** e.g. "Intuition Proposal Studio" */
  name?: string;
  /** one paragraph: what this system is for */
  summary?: string;
  version?: string;
  updatedAt?: string;
  /** how an agent should use this system (written by the user; shown first in the guide) */
  agentNotes?: string;
  intent: DSIntent;
  themes: DSTheme[];
  semanticTokens: DSSemanticToken[];
  typeStyles: DSTypeStyle[];
  tokens: DSToken[];
  components: DSComponent[];
  layouts: DSLayout[];
  artDirection: DSArtDirection;
  treatments: DSTreatment[];
  rules: DSRule[];
  references: DSReference[];
  formats: DSFormat[];
  briefs: DSBrief[];
  review: {
    /** review checklist (hierarchy, imagery, palette, typography, logo integrity, readability …) */
    criteria: string[];
    /** how exact logos / fonts / small text are placed over generated art */
    finishing?: string;
  };
  sources: DSSource[];
}

/** Extra design-system fields on colour assets (BrandAsset kind 'color'). */
export type DSColorRole = 'primary' | 'secondary' | 'accent' | 'neutral' | 'background' | 'surface' | 'text' | 'border' | 'success' | 'warning' | 'danger' | 'info' | 'data' | 'other';

/* ---------------------------------------------------------------- normalize */

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
let seq = 0;
const fid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const LEVELS: DSLevel[] = ['required', 'preferred', 'open'];
const level = (v: unknown, d: DSLevel = 'preferred'): DSLevel => (LEVELS.includes(v as DSLevel) ? (v as DSLevel) : d);
const ids = (v: unknown) => arr<unknown>(v).filter((x): x is string => typeof x === 'string');

export function emptyDesignSystem(): DesignSystem {
  return {
    intent: { personality: [] },
    themes: [],
    semanticTokens: [],
    typeStyles: [],
    tokens: [],
    components: [],
    layouts: [],
    artDirection: { imagery: {}, colorBehavior: {} },
    treatments: [],
    rules: [],
    references: [],
    formats: [],
    briefs: [],
    review: { criteria: [] },
    sources: [],
  };
}

/** Fill in every field (new spaces, older or hand-edited files, imports). Never throws. */
export function normalizeDesignSystem(raw: unknown): DesignSystem {
  const d = obj(raw);
  const intent = obj(d.intent);
  const ad = obj(d.artDirection);
  const review = obj(d.review);
  return {
    ...d,
    name: str(d.name),
    summary: str(d.summary),
    intent: { ...intent, personality: arr<DSIntentWord>(intent.personality).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsw'), word: str(x.word) ?? '', looksLike: str(x.looksLike) ?? '' })) },
    themes: arr<DSTheme>(d.themes).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsth'), name: str(x.name) ?? '', mode: x.mode === 'dark' ? 'dark' : 'light' })),
    semanticTokens: arr<DSSemanticToken>(d.semanticTokens).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsst'), name: str(x.name) ?? '', values: Object.fromEntries(Object.entries(obj(x.values)).map(([k, v]) => [k, str(v) ?? ''])) })),
    typeStyles: arr<DSTypeStyle>(d.typeStyles).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsty'), name: str(x.name) ?? '', family: str(x.family) ?? '', weight: typeof x.weight === 'number' ? x.weight : x.weight != null && isFinite(Number(x.weight)) ? Number(x.weight) : undefined })),
    tokens: arr<DSToken>(d.tokens).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dstk'), group: x.group ?? 'other', name: str(x.name) ?? '', value: str(x.value) ?? '' })),
    components: arr<DSComponent>(d.components).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dscm'), name: str(x.name) ?? '' })),
    layouts: arr<DSLayout>(d.layouts).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsly'), name: str(x.name) ?? '', kind: x.kind ?? 'other' })),
    artDirection: { ...ad, imagery: obj(ad.imagery), colorBehavior: obj(ad.colorBehavior) },
    treatments: arr<DSTreatment>(d.treatments).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dstr'), name: str(x.name) ?? '', level: level(x.level) })),
    rules: arr<DSRule>(d.rules).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsr'), area: x.area ?? 'other', kind: x.kind === 'do' || x.kind === 'dont' ? x.kind : 'rule', text: str(x.text) ?? '', level: level(x.level), scope: x.scope === 'campaign' ? 'campaign' : 'brand' })),
    references: arr<DSReference>(d.references).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsrf'), title: str(x.title) ?? '', roles: arr<DSReferenceRole>(x.roles).filter((r) => typeof r === 'string'), verdict: x.verdict === 'near_miss' || x.verdict === 'off_brand' ? x.verdict : 'on_brand' })),
    formats: arr<DSFormat>(d.formats).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsf'), name: str(x.name) ?? '' })),
    briefs: arr<DSBrief>(d.briefs).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('dsb'), name: str(x.name) ?? '', ruleIds: ids(x.ruleIds), referenceIds: ids(x.referenceIds) })),
    review: { ...review, criteria: arr<unknown>(review.criteria).map((c) => str(c) ?? '').filter(Boolean) },
    sources: arr<DSSource>(d.sources).filter(Boolean).map((x) => ({
      ...x,
      id: x.id || fid('dss'),
      fileName: str(x.fileName) ?? 'import',
      importedAt: str(x.importedAt) ?? '',
      docs: arr<DSSource['docs'][number]>(x.docs).filter((y) => y && typeof y.text === 'string').map((y) => ({ path: str(y.path) ?? '', title: str(y.title) ?? str(y.path) ?? '', text: y.text })),
      cards: arr<DSSource['cards'][number]>(x.cards).filter((y) => y && typeof y.file === 'string').map((y) => ({ ...y, path: str(y.path) ?? '', title: str(y.title) ?? str(y.path) ?? '' })),
    })),
  } as DesignSystem;
}

/** Default review checklist (used by "Add the standard checklist"). */
export const DEFAULT_REVIEW_CRITERIA = [
  'Hierarchy: one clear focal point; the most important message reads first',
  'Imagery: approved subjects, style, lighting and crop',
  'Palette: dominant / accent balance matches the colour behaviour',
  'Typography: approved families, weights and case; nothing generated where exact text is required',
  'Logo integrity: the real file, unmodified, with clear space',
  'Readability: text legible at the smallest intended size and on small screens',
  'Format: right size, safe areas respected, room for copy',
  'Required rules all met; deviations from preferred rules have a reason',
];
