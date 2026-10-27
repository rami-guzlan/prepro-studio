/* The design system of a Marketing Space (Brand Kit & Assets → Design system)
   for agents: collections for the generic data tools (ds_*), single fields for
   get_fields / set_fields (designSystem.*), and the design_system tool that
   returns the compiled guide / JSON / briefs and imports / exports files.
   Colours, logos, fonts and images stay in the "assets" collection. */
import { GUIDE_SECTIONS, compileBrief, compileGuide, dsOf, dsReadiness, type GuideSection } from '@/spaces/designSystem/compile';
import { normalizeDesignSystem, type DSBrief } from '@/spaces/designSystem/types';
import { designSystemJson } from '@/spaces/designSystem/structured';
import { importDesignSystemFiles } from '@/spaces/designSystem/importer';
import { buildDesignSystemBundle, buildDesignSystemZip, designSystemText, dsExportName } from '@/spaces/designSystem/exporters';
import { backend } from '@/backend';
import { useSpaceStore } from '@/store/space';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import { AgentError, clean, fail, openKind, resolveRef } from '../ctx';
import { defineTool } from '../tool';
import { arr, bool, enm, obj, opt, str } from '../schema';

const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const req = { required: true };

export const DS_COLOR_ROLES = ['primary', 'secondary', 'accent', 'neutral', 'background', 'surface', 'text', 'border', 'success', 'warning', 'danger', 'info', 'data', 'other'];
const LEVELS = ['required', 'preferred', 'open'];
const RULE_AREAS = ['brand', 'logo', 'color', 'typography', 'imagery', 'composition', 'treatment', 'layout', 'components', 'voice', 'accessibility', 'production', 'other'];
const REF_ROLES = ['style', 'composition', 'asset', 'campaign', 'mood', 'color', 'typography'];
const LAYOUT_KINDS = ['page', 'slide', 'social', 'web', 'print', 'ui_kit', 'other'];
const TOKEN_GROUPS = ['spacing', 'radius', 'border', 'shadow', 'grid', 'breakpoint', 'motion', 'opacity', 'other'];

/** Extra fields of colour / font assets (added to the "assets" collection). */
export const DS_ASSET_FIELDS: FieldSpec[] = [
  F('group', 'string', { desc: 'colours: palette group, e.g. "Core", "Neutrals", "Status", "Spectrum"' }),
  F('role', 'enum', { values: DS_COLOR_ROLES, desc: 'colours: what the colour is for' }),
  F('cssVar', 'string', { desc: 'colours: CSS custom property incl. "--", e.g. "--color-magic-hour"' }),
  F('onColor', 'color', { desc: 'colours: text colour to use on it (hex)' }),
  F('coverage', 'string', { desc: 'colours: rough share of a composition, e.g. "10 %"' }),
  F('weights', 'string', { desc: 'fonts: weights in use, e.g. "400, 700, 800"' }),
];

type S = any;

/** The design system inside a draft, created / normalised on first write. */
function dsDraft(d: S) {
  if (!d.designSystem || !Array.isArray(d.designSystem.rules)) d.designSystem = normalizeDesignSystem(d.designSystem);
  d.designSystem.updatedAt = new Date().toISOString();
  return d.designSystem;
}

/** The stored design system when it is already normalised (so clean-ups mutate the draft), else a normalised copy. */
const rawDs = (s: S): any => (s?.designSystem && Array.isArray(s.designSystem.rules) && s.designSystem.intent?.personality ? s.designSystem : dsOf(s));

const list = (key: string) => ({
  get: (s: S) => rawDs(s)[key] ?? [],
  draft: (d: S) => dsDraft(d)[key],
});

const ASSET = F('_', 'ref', { ref: 'assets' });
const assetRef = (name: string, desc: string) => ({ ...ASSET, name, desc });

export const DS_COLLECTIONS: CollectionDef[] = [
  {
    name: 'ds_themes',
    label: 'Design system: themes',
    module: 'assets' as any,
    description: 'Themes of the design system (e.g. "Light", "Dark", "Brand"). Semantic tokens (ds_semantic_tokens) have one value per theme.',
    kind: 'array',
    ...list('themes'),
    idPrefix: 'dsth',
    nameField: 'name',
    fields: [F('name', 'string', req), F('mode', 'enum', { ...req, values: ['light', 'dark'] }), F('isDefault', 'boolean'), F('notes', 'text', { desc: 'what changes in this theme beyond colours' })],
    defaults: () => ({ mode: 'light' }),
  },
  {
    name: 'ds_semantic_tokens',
    label: 'Design system: semantic tokens (one value per theme)',
    module: 'assets' as any,
    description:
      'Role-named CSS custom properties whose value changes per theme, e.g. --surface-slab, --accent, --text-heading. `values` is an object keyed by theme name or id: {"Light": "#ffffff", "Dark": "#16161a"} (update_items merges it; null clears one theme). _values shows them by theme name.',
    kind: 'array',
    ...list('semanticTokens'),
    idPrefix: 'dsst',
    nameField: 'name',
    fields: [F('name', 'string', { ...req, desc: 'CSS custom property incl. "--", e.g. "--accent"' }), F('description', 'text', { desc: 'what it means / where it is used' }), F('values', 'object', { keysRef: 'ds_themes', desc: 'theme name or id → CSS value (hex, gradient …)' })],
    defaults: () => ({ values: {} }),
    enrich: (items, s) => {
      const themes = dsOf(s).themes;
      return items.map((t) => ({ ...t, _values: Object.fromEntries(Object.entries(t.values ?? {}).filter(([k]) => themes.some((th) => th.id === k)).map(([k, v]) => [themes.find((th) => th.id === k)!.name, v])) }));
    },
  },
  {
    name: 'ds_type_styles',
    label: 'Design system: type styles',
    module: 'assets' as any,
    description: 'Named text styles (Display, H1, Eyebrow, Body, Stat …) with family, weight, size, line height, tracking and case.',
    kind: 'array',
    ...list('typeStyles'),
    idPrefix: 'dsty',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('family', 'string', { ...req, desc: 'font family, e.g. "Montserrat"' }),
      F('weight', 'integer', { desc: '100–900' }),
      F('size', 'string', { desc: 'CSS size, e.g. "48px", "1.25rem"' }),
      F('lineHeight', 'string', { desc: 'e.g. "1.1" or "56px"' }),
      F('letterSpacing', 'string', { desc: 'e.g. "-0.02em", "0.12em"' }),
      F('case', 'enum', { values: ['none', 'upper', 'lower', 'title', 'sentence'] }),
      F('italic', 'boolean'),
      F('usage', 'text', { desc: 'where to use it' }),
      F('cssVar', 'string', { desc: 'e.g. "--type-h1"' }),
    ],
  },
  {
    name: 'ds_tokens',
    label: 'Design system: spacing, radius, border, shadow, grid, motion … tokens',
    module: 'assets' as any,
    description: 'Non-colour tokens by group: spacing (space-1..space-8 = 4, 6, 8, 12 … px), radius (card 8px, badge 4px), border, shadow, grid, breakpoint, motion, opacity, other.',
    kind: 'array',
    ...list('tokens'),
    idPrefix: 'dstk',
    nameField: 'name',
    fields: [F('group', 'enum', { ...req, values: TOKEN_GROUPS }), F('name', 'string', { ...req, desc: 'e.g. "space-3" or "--radius-card"' }), F('value', 'string', { ...req, desc: 'CSS value, e.g. "8px", "0 2px 8px rgba(0,0,0,.12)"' }), F('notes', 'text')],
  },
  {
    name: 'ds_components',
    label: 'Design system: components',
    module: 'assets' as any,
    description: 'Reusable components (PascalCase: StatCard, Callout, DataTable …) with props one per line ("value — the big number"), variants, states, per-theme notes and usage. file = an imported HTML specimen (read-only).',
    kind: 'array',
    ...list('components'),
    idPrefix: 'dscm',
    nameField: 'name',
    hideInList: ['code'],
    fields: [
      F('name', 'string', { ...req, desc: 'PascalCase' }),
      F('category', 'string', { suggest: ['Cards', 'Document blocks', 'Data', 'Navigation', 'Forms', 'Brand motifs', 'Slides'] }),
      F('description', 'text'),
      F('props', 'text', { desc: 'one per line: "name — meaning"' }),
      F('variants', 'text'),
      F('states', 'text'),
      F('themeNotes', 'text', { desc: 'how it differs per theme' }),
      F('usage', 'text'),
      assetRef('previewAssetId', 'preview image (asset id or name)'),
      F('file', 'string', { readOnly: true, desc: 'imported specimen (stored html)' }),
      F('code', 'text', { desc: 'reference markup / code' }),
    ],
  },
  {
    name: 'ds_layouts',
    label: 'Design system: layouts (pages, slides, social, UI kits)',
    module: 'assets' as any,
    description: 'Layouts such as "Cover", "Agenda", "Content: card grid", "Stats", "Closing" with their structure top to bottom.',
    kind: 'array',
    ...list('layouts'),
    idPrefix: 'dsly',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('kind', 'enum', { ...req, values: LAYOUT_KINDS }),
      F('description', 'text'),
      F('structure', 'text', { desc: 'e.g. "eyebrow · title · spectrum tick · 3-column card grid · footer"' }),
      F('formatId', 'ref', { ref: 'ds_formats' }),
      assetRef('previewAssetId', 'preview image (asset id or name)'),
      F('file', 'string', { readOnly: true }),
    ],
    defaults: () => ({ kind: 'page' }),
  },
  {
    name: 'ds_personality',
    label: 'Design system: brand personality words',
    module: 'assets' as any,
    description: 'Adjectives of the brand intent with what each looks like in practice ("confident" → "oversized type, few elements, lots of black").',
    kind: 'array',
    get: (s: S) => rawDs(s).intent.personality,
    draft: (d: S) => dsDraft(d).intent.personality,
    idPrefix: 'dsw',
    nameField: 'word',
    fields: [F('word', 'string', req), F('looksLike', 'text', req)],
  },
  {
    name: 'ds_treatments',
    label: 'Design system: signature treatments',
    module: 'assets' as any,
    description: 'Recognisable visual moves (angular photo crops, film grain, a cyan block behind numbers …) with where to use / avoid them and a level.',
    kind: 'array',
    ...list('treatments'),
    idPrefix: 'dstr',
    nameField: 'name',
    fields: [F('name', 'string', req), F('description', 'text'), F('whereToUse', 'text'), F('avoid', 'text'), F('level', 'enum', { ...req, values: LEVELS }), assetRef('exampleAssetId', 'example image (asset id or name)')],
    defaults: () => ({ level: 'preferred' }),
  },
  {
    name: 'ds_rules',
    label: 'Design system: rules (required / preferred / open; brand or campaign)',
    module: 'assets' as any,
    description:
      'Rules by area. kind "rule" = a statement, "do" / "dont" = example behaviour. level: required (never break), preferred (default, deviate with a reason), open (up to the maker). scope: brand (everywhere) or campaign (only that campaignId — never carry into other work).',
    kind: 'array',
    ...list('rules'),
    idPrefix: 'dsr',
    nameField: 'text',
    fields: [
      F('area', 'enum', { ...req, values: RULE_AREAS }),
      F('kind', 'enum', { ...req, values: ['rule', 'do', 'dont'] }),
      F('text', 'text', req),
      F('level', 'enum', { ...req, values: LEVELS }),
      F('scope', 'enum', { ...req, values: ['brand', 'campaign'] }),
      F('campaignId', 'ref', { ref: 'campaigns', desc: 'scope "campaign": the campaign it applies to' }),
      F('why', 'text'),
    ],
    defaults: () => ({ area: 'brand', kind: 'rule', level: 'preferred', scope: 'brand' }),
  },
  {
    name: 'ds_references',
    label: 'Design system: annotated references',
    module: 'assets' as any,
    description:
      'Reference images (assetId = an image / logo asset) with what they control (roles: style, composition, asset, campaign, mood, color, typography), what to borrow / ignore and a verdict: on_brand, near_miss (attractive, but not us — say why) or off_brand. Generators must borrow only what the roles say.',
    kind: 'array',
    ...list('references'),
    idPrefix: 'dsrf',
    nameField: 'title',
    fields: [
      F('title', 'string', req),
      assetRef('assetId', 'the image (asset id or name)'),
      F('roles', 'string[]', { values: REF_ROLES, desc: `what it controls: ${REF_ROLES.join(', ')}` }),
      F('borrow', 'text'),
      F('ignore', 'text'),
      F('verdict', 'enum', { ...req, values: ['on_brand', 'near_miss', 'off_brand'] }),
      F('why', 'text'),
      F('mode', 'enum', { values: ['light', 'dark', 'any'] }),
      F('campaignId', 'ref', { ref: 'campaigns' }),
    ],
    defaults: () => ({ roles: [], verdict: 'on_brand' }),
  },
  {
    name: 'ds_formats',
    label: 'Design system: output formats',
    module: 'assets' as any,
    description: 'Formats generated work must fit (LinkedIn post 1080×1350, YouTube thumbnail 1280×720, 16:9 slide, A4 one-pager …) with safe areas, minimum text size, background, resolution.',
    kind: 'array',
    ...list('formats'),
    idPrefix: 'dsf',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('width', 'number'),
      F('height', 'number'),
      F('unit', 'enum', { values: ['px', 'pt', 'mm'] }),
      F('aspect', 'string', { desc: 'e.g. "4:5"' }),
      F('safeArea', 'text'),
      F('minText', 'string', { desc: 'smallest readable text, e.g. "24px"' }),
      F('background', 'string'),
      F('transparent', 'boolean'),
      F('resolution', 'string', { desc: 'e.g. "2x", "300 dpi"' }),
      F('notes', 'text'),
    ],
  },
  {
    name: 'ds_briefs',
    label: 'Design system: generation briefs',
    module: 'assets' as any,
    description: 'Reusable requests for an image model / designer: objective, format, exact copy (placed in finishing), rules (ruleIds) and references (referenceIds) that apply, what may vary, review points, finishing. design_system {action:"brief", briefId} compiles one into ready-to-use text.',
    kind: 'array',
    ...list('briefs'),
    idPrefix: 'dsb',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('objective', 'text'),
      F('audience', 'text'),
      F('formatId', 'ref', { ref: 'ds_formats' }),
      F('copy', 'text', { desc: 'exact copy that must appear (placed afterwards, not generated)' }),
      F('ruleIds', 'ref[]', { ref: 'ds_rules', desc: 'rule ids (or rule texts)' }),
      F('referenceIds', 'ref[]', { ref: 'ds_references', desc: 'reference ids or titles' }),
      F('variation', 'text', { desc: 'what may vary' }),
      F('review', 'text'),
      F('finishing', 'text', { desc: 'what is placed over the generated art afterwards' }),
      F('campaignId', 'ref', { ref: 'campaigns' }),
    ],
    defaults: () => ({ ruleIds: [], referenceIds: [] }),
  },
  {
    name: 'ds_sources',
    label: 'Design system: imported files',
    module: 'assets' as any,
    description: 'Files imported into the design system (e.g. a Claude Design design-system zip) with their docs (README.md, SKILL.md … verbatim) and preview cards. Import with design_system {action:"import"}; get_items returns the full docs.',
    kind: 'array',
    ...list('sources'),
    idPrefix: 'dss',
    nameField: 'fileName',
    hideInList: ['docs', 'cards'],
    addVia: 'Import design-system files with design_system {action:"import", path | fileName + text | fileName + base64}.',
    fields: [
      F('fileName', 'string', { readOnly: true }),
      F('importedAt', 'string', { readOnly: true }),
      F('summary', 'text'),
      F('docs', 'object[]', { readOnly: true }),
      F('cards', 'object[]', { readOnly: true }),
      F('file', 'string', { readOnly: true }),
    ],
  },
];

const dsGet = (path: string) => (s: S) => path.split('.').reduce((o: any, k) => o?.[k] ?? {}, { designSystem: dsOf(s) });
const dsSetDraft = (path: string) => (d: S) => {
  let o: any = dsDraft(d);
  for (const k of path.split('.').slice(1)) o = o[k] ??= {};
  return o;
};

export const DS_SINGLETONS: SingletonDef[] = [
  {
    path: 'designSystem',
    label: 'Design system: name, summary, version and how agents should use it',
    get: dsGet('designSystem'),
    draft: dsSetDraft('designSystem'),
    fields: [F('name', 'string'), F('summary', 'text'), F('version', 'string'), F('agentNotes', 'text', { desc: 'how an agent should use this system (shown first in the guide)' })],
  },
  {
    path: 'designSystem.intent',
    label: 'Design system: brand intent (personality words are the ds_personality collection)',
    get: dsGet('designSystem.intent'),
    draft: dsSetDraft('designSystem.intent'),
    fields: [F('audience', 'text'), F('impression', 'text', { desc: 'the impression people should leave with' }), F('purpose', 'text', { desc: 'what the visuals have to achieve' })],
  },
  {
    path: 'designSystem.artDirection',
    label: 'Design system: art direction (composition, how elements relate, type in images, substitutions)',
    get: dsGet('designSystem.artDirection'),
    draft: dsSetDraft('designSystem.artDirection'),
    fields: [
      F('relationships', 'text', { desc: 'how the elements work together — the single most useful paragraph for an image generator' }),
      F('composition', 'text', { desc: 'hierarchy, focal points, negative space, text-to-image balance, alignment' }),
      F('typographyInImages', 'text'),
      F('substitutions', 'text', { desc: 'acceptable font substitutions' }),
    ],
  },
  {
    path: 'designSystem.artDirection.imagery',
    label: 'Design system: imagery',
    get: dsGet('designSystem.artDirection.imagery'),
    draft: dsSetDraft('designSystem.artDirection.imagery'),
    fields: [F('subjects', 'text'), F('style', 'text'), F('lighting', 'text'), F('camera', 'text'), F('cropping', 'text'), F('realism', 'text'), F('people', 'text'), F('avoid', 'text')],
  },
  {
    path: 'designSystem.artDirection.colorBehavior',
    label: 'Design system: colour behaviour',
    get: dsGet('designSystem.artDirection.colorBehavior'),
    draft: dsSetDraft('designSystem.artDirection.colorBehavior'),
    fields: [F('dominant', 'text'), F('accents', 'text'), F('coverage', 'string', { desc: 'e.g. "70 % black, 20 % white, 10 % cyan"' }), F('photoTreatment', 'text'), F('backgrounds', 'text'), F('lightDark', 'text', { desc: 'what changes between light and dark' })],
  },
  {
    path: 'designSystem.review',
    label: 'Design system: review checklist & finishing workflow',
    get: dsGet('designSystem.review'),
    draft: dsSetDraft('designSystem.review'),
    fields: [F('criteria', 'string[]', { desc: 'checklist lines' }), F('finishing', 'text', { desc: 'how exact logos / fonts / small text are placed over generated art' })],
  },
];

/* ================================================================ tool */

function marketing() {
  const s = useSpaceStore.getState().space;
  if (!s || openKind() !== 'space' || (s.meta.kind ?? 'marketing') !== 'marketing')
    throw new AgentError('design_system works on the design system of a Marketing Space (Brand Kit & Assets → Design system). Open one first: list_spaces / open_space, or open_demo_space.');
  return s;
}

const joinPath = (folder: string, name: string) => `${folder.replace(/[\\/]+$/, '')}\\${name.replace(/\//g, '\\')}`;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

type Args = {
  action: 'get' | 'brief' | 'import' | 'export' | 'readiness';
  format?: 'markdown' | 'json' | 'zip' | 'folder' | 'md' | 'css';
  sections?: GuideSection[];
  includeSources?: boolean;
  images?: boolean;
  briefId?: string;
  name?: string;
  objective?: string;
  audience?: string;
  formatId?: string;
  copy?: string;
  ruleIds?: string[];
  referenceIds?: string[];
  variation?: string;
  finishing?: string;
  path?: string;
  fileName?: string;
  text?: string;
  base64?: string;
  dir?: string;
};

export const designSystemTools = [
  defineTool({
    name: 'design_system',
    title: 'Design system & art direction of a Marketing Space',
    description:
      'The brand design system of the open Marketing Space (Brand Kit & Assets → Design system), written for agents: Claude Design, image models, coding agents. ALWAYS call design_system {action:"get"} before you design, prompt or generate ANY visual for the space (images, thumbnails, carousels, slides, pages, UI) and follow it: Required rules must hold, Preferred rules are the default (deviate only with a reason), Open is up to you; campaign-scoped rules apply only to that campaign; each reference controls only its roles (style / composition / asset / campaign / mood / color / typography) — near_miss and off_brand references show what NOT to do; never redraw logos or render exact text inside generated images (place the real files afterwards).\n' +
      'Actions: "get" → the compiled guide (format "markdown", default; optional sections, includeSources for imported README/SKILL docs, images:true adds reference & logo images) or "json" (tokens, themes, type, components, art direction, rules, references with file names); "brief" → a ready-to-use generation brief (briefId = a ds_briefs id or name, or ad-hoc fields objective / formatId / copy / ruleIds / referenceIds / variation / finishing); "readiness" → completeness score and what is missing; "import" → import design-system files (a Claude Design design-system .zip, README/SKILL .md, tokens .css / .json, images, fonts, .html cards) from path (desktop; zip, md, txt, html and images) or fileName + text / base64 (any type, also in the hosted app); "export" → format zip | folder | md | json | css written to dir (desktop; default the space\'s exports folder) — md / json / css also return the text.\n' +
      'Edit the system with the generic data tools: collections ds_themes, ds_semantic_tokens, ds_type_styles, ds_tokens, ds_components, ds_layouts, ds_personality, ds_treatments, ds_rules, ds_references, ds_formats, ds_briefs, ds_sources; colours / logos / fonts / images are the "assets" collection (colours carry group, role, cssVar, onColor, coverage); single fields designSystem.*, designSystem.intent.*, designSystem.artDirection(.imagery / .colorBehavior).*, designSystem.review.* via set_fields. Show it with show_in_app {module:"assets", params:{tab:"system"}}.',
    global: true,
    input: obj({
      action: enm(['get', 'brief', 'import', 'export', 'readiness'] as const),
      format: opt(enm(['markdown', 'json', 'zip', 'folder', 'md', 'css'] as const, 'get: markdown | json; export: zip | folder | md | json | css')),
      sections: opt(arr(enm(GUIDE_SECTIONS), 'get (markdown): only these sections')),
      includeSources: opt(bool('get (markdown): include imported guidance documents verbatim (default: only when short)')),
      images: opt(bool('get: also return reference and logo images (raster files, up to 8)')),
      briefId: opt(str('brief: a ds_briefs id or name')),
      name: opt(str('brief (ad hoc): title')),
      objective: opt(str('brief (ad hoc)')),
      audience: opt(str('brief (ad hoc)')),
      formatId: opt(str('brief (ad hoc): ds_formats id or name')),
      copy: opt(str('brief (ad hoc): exact copy to place afterwards')),
      ruleIds: opt(arr(str(), 'brief (ad hoc): ds_rules ids (default: every required brand rule)')),
      referenceIds: opt(arr(str(), 'brief (ad hoc): ds_references ids or titles')),
      variation: opt(str('brief (ad hoc): what may vary')),
      finishing: opt(str('brief (ad hoc)')),
      path: opt(str('import: absolute path of a file on this computer (zip, md, txt, html, images)')),
      fileName: opt(str('import: file name with extension when passing text or base64, e.g. "tokens.css"')),
      text: opt(str('import: file contents as text (md, css, json, html)')),
      base64: opt(str('import: file contents as base64 (zip, fonts, images)')),
      dir: opt(str('export: absolute output folder')),
    }),
    async run(a: Args) {
      const s = marketing();
      if (a.action === 'readiness') {
        const r = dsReadiness(s);
        return { data: { score: `${Math.round(r.score * 100)}%`, missing: r.missing } };
      }

      if (a.action === 'get') {
        if (a.format && a.format !== 'markdown' && a.format !== 'json') fail('get: format is "markdown" or "json".');
        const images = a.images ? await imagesOf(s) : [];
        if (a.format === 'json') return { data: designSystemJson(s), images };
        const ds = dsOf(s);
        const docChars = ds.sources.reduce((n, x) => n + x.docs.reduce((m, d) => m + d.text.length, 0), 0);
        const include = a.includeSources ?? docChars <= 40_000;
        let md = compileGuide(s, { sections: a.sections, includeSources: include });
        if (!include && docChars) md += `\n_Imported guidance (${Math.round(docChars / 1000)}k characters from ${ds.sources.map((x) => x.fileName).join(', ')}) was left out — call design_system {action:"get", includeSources:true, sections:["sources"]} to read it._\n`;
        md += `\n_Files: logos, fonts and images live in the app; design_system {action:"export", format:"folder"} writes them next to this guide (paths as referenced above)._\n`;
        return { text: md, images };
      }

      if (a.action === 'brief') {
        const ds = dsOf(s);
        let b: Partial<DSBrief> | undefined;
        if (a.briefId) {
          const r = a.briefId.trim().toLowerCase();
          b = ds.briefs.find((x) => x.id === a.briefId) ?? ds.briefs.find((x) => x.name.toLowerCase() === r) ?? ds.briefs.find((x) => x.name.toLowerCase().includes(r));
          if (!b) fail(`No brief "${a.briefId}". Briefs: ${ds.briefs.map((x) => x.name).join(', ') || 'none yet — add one with add_items {collection:"ds_briefs"} or pass ad-hoc fields'}.`);
        } else {
          b = clean({
            name: a.name,
            objective: a.objective,
            audience: a.audience,
            formatId: a.formatId ? resolveRef('ds_formats', a.formatId, s) : undefined,
            copy: a.copy,
            ruleIds: a.ruleIds?.map((x) => resolveRef('ds_rules', x, s)),
            referenceIds: a.referenceIds?.map((x) => resolveRef('ds_references', x, s)) ?? [],
            variation: a.variation,
            finishing: a.finishing,
          });
        }
        return { text: compileBrief(s, b!) };
      }

      if (a.action === 'import') {
        const sources = [a.path, a.text, a.base64].filter((x) => x != null && x !== '').length;
        if (sources !== 1) fail('import: pass exactly one of path, text or base64 (text / base64 need fileName).');
        let file: { name: string; data: Uint8Array };
        if (a.path) {
          const mcp = window.prepro?.mcp;
          if (!mcp) fail('Reading files from a path needs the desktop app. Pass fileName + base64 (or text) instead.');
          try {
            file = await mcp.readFile(a.path);
          } catch (e) {
            fail(`${e instanceof Error ? e.message : String(e)}. For .css, .json or font files pass fileName + text / base64 instead.`);
          }
        } else {
          if (!a.fileName || !a.fileName.includes('.')) fail('Pass fileName with an extension, e.g. "tokens.css" or "design-system.zip".');
          if (a.text != null) file = { name: a.fileName, data: new TextEncoder().encode(a.text) };
          else {
            const bin = atob(a.base64!.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''));
            const data = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
            file = { name: a.fileName, data };
          }
        }
        const r = await importDesignSystemFiles([file!]);
        return { data: clean({ imported: file!.name, summary: r.summary, counts: r.counts, warnings: r.warnings.length ? r.warnings : undefined, sourceId: r.sourceId }), summary: `Imported ${file!.name} into the design system` };
      }

      // export
      const format = a.format ?? 'zip';
      if (format === 'markdown') fail('export: format is zip, folder, md, json or css.');
      const mcp = window.prepro?.mcp;
      if (!mcp) {
        if (format === 'md' || format === 'json' || format === 'css') {
          const t = designSystemText(s, format);
          return { text: t.text, data: { fileName: t.fileName, note: 'Hosted app: files cannot be written to disk; the content is returned instead.' } };
        }
        fail('Writing the zip / folder needs the desktop app. In the hosted app use export md / json / css (returned as text), or ask the user to use Export in Brand Kit & Assets → Design system.');
      }
      const dir = a.dir || `${(await window.prepro!.projectDir(s.id)) ?? fail('No space folder (desktop app only).')}\\exports`;
      const base = dsExportName(s);
      if (format === 'zip') {
        const { bytes, missing } = await buildDesignSystemZip(s);
        const path = await mcp.writeFile(joinPath(dir, `${base}.zip`), bytes);
        return { data: clean({ files: [path], missing: missing.length ? missing : undefined }), summary: 'Exported the design system bundle' };
      }
      if (format === 'folder') {
        const { files, missing } = await buildDesignSystemBundle(s);
        const root = joinPath(dir, base);
        const paths: string[] = [];
        for (const [p, bytes] of Object.entries(files)) paths.push(await mcp.writeFile(joinPath(root, p), bytes));
        return { data: clean({ folder: root, readFirst: joinPath(root, 'README.md'), files: paths.length, list: Object.keys(files), missing: missing.length ? missing : undefined }), summary: 'Exported the design system folder' };
      }
      const t = designSystemText(s, format);
      const path = await mcp.writeFile(joinPath(dir, t.fileName), t.text);
      return { data: { files: [path] }, summary: `Exported the design system (${format})` };
    },
  }),
];

/** Reference & logo images as MCP image content (raster only, ≤ 1.5 MB, max 8). */
async function imagesOf(s: S): Promise<{ data: string; mimeType: string }[]> {
  const ds = dsOf(s);
  const ids = [...ds.references.map((r) => r.assetId), ...s.assets.filter((x: any) => x.kind === 'logo').map((x: any) => x.id)].filter(Boolean) as string[];
  const out: { data: string; mimeType: string }[] = [];
  for (const id of [...new Set(ids)]) {
    if (out.length >= 8) break;
    const a = s.assets.find((x: any) => x.id === id);
    const name: string | undefined = a?.image;
    const ext = (name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (!name || !MIME[ext]) continue;
    try {
      const bytes = await backend.readAsset(s.id, name);
      if (bytes && bytes.length <= 1.5 * 1024 * 1024) out.push({ data: b64(bytes), mimeType: MIME[ext] });
    } catch {
      /* skip unreadable files */
    }
  }
  return out;
}
