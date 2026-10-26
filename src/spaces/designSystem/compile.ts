/* Compiles a space's design system into what agents and other tools read:
   - compileGuide → one Markdown guide (README.md of the bundle; what an agent reads first)
   - compileTokens → design tokens as JSON (W3C-style $value / $type)
   - compileCss → CSS custom properties (:root + one block per theme)
   - compileBrief → a ready-to-use generation brief for an image model / designer
   - bundlePath → where an asset sits inside the exported zip (the guide links to it)
   Pure: no store, no React, no backend. */
import type { SpaceData, BrandAsset } from '@/spaces/types';
import { slugify } from '@/lib/text';
import { emptyDesignSystem, normalizeDesignSystem, type DesignSystem, type DSBrief, type DSFormat, type DSLevel, type DSReference, type DSRule, type DSTypeStyle } from './types';

export const LEVEL_LABEL: Record<DSLevel, string> = { required: 'Required', preferred: 'Preferred', open: 'Open to interpretation' };
export const REFERENCE_ROLE_HINT: Record<string, string> = {
  style: 'borrow the rendering / treatment (grade, contrast, texture), not the subject',
  composition: 'borrow the hierarchy, placement and negative space, not the content',
  asset: 'preserve this exact item (logo, product, person) unchanged',
  campaign: 'follow these choices only for this campaign / series',
  mood: 'borrow the feeling only',
  color: 'borrow the palette balance only',
  typography: 'borrow the type treatment only',
};

export function dsOf(s: Pick<SpaceData, 'designSystem'> | null | undefined): DesignSystem {
  return s?.designSystem ? normalizeDesignSystem(s.designSystem) : emptyDesignSystem();
}

const ext = (name: string | undefined) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name ?? '');
  return m ? m[1].toLowerCase() : '';
};

/** Folder of an asset in the bundle. */
export function bundleFolder(a: BrandAsset): string {
  switch (a.kind) {
    case 'logo':
      return 'logos';
    case 'font':
      return 'fonts';
    case 'image':
      return 'images';
    case 'template':
      return 'templates';
    default:
      return 'files';
  }
}

/** Path of an asset's stored file inside the exported bundle ('' when it has no file). */
export function bundlePath(a: BrandAsset): string {
  const stored = a.file || a.image;
  if (!stored) return '';
  const e = ext(a.fileName) || ext(stored) || 'bin';
  return `${bundleFolder(a)}/${slugify(a.name || a.fileName || a.id, 60) || a.id}-${a.id.slice(-4)}.${e}`;
}

const line = (label: string, v: string | number | undefined | null) => (v == null || v === '' ? '' : `- **${label}:** ${String(v).trim()}\n`);
const para = (v: string | undefined) => (v?.trim() ? `${v.trim()}\n\n` : '');
const esc = (v: string | undefined) => (v ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const table = (head: string[], rows: (string | number | undefined)[][]) =>
  rows.length ? `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.map((c) => esc(c == null ? '' : String(c))).join(' | ')} |`).join('\n')}\n\n` : '';

export function typeSpec(t: DSTypeStyle): string {
  return [t.family, t.weight, t.size && `${t.size}${t.lineHeight ? `/${t.lineHeight}` : ''}`, t.letterSpacing && `tracking ${t.letterSpacing}`, t.case && t.case !== 'none' ? t.case : '', t.italic ? 'italic' : ''].filter(Boolean).join(' · ');
}

export function formatSize(f: DSFormat): string {
  const wh = f.width && f.height ? `${f.width}×${f.height}${f.unit && f.unit !== 'px' ? ` ${f.unit}` : ' px'}` : '';
  return [wh, f.aspect].filter(Boolean).join(' · ');
}

function ruleLine(r: DSRule, campaignName: (id?: string) => string | undefined): string {
  const tag = r.kind === 'do' ? 'DO: ' : r.kind === 'dont' ? "DON'T: " : '';
  const scope = r.scope === 'campaign' ? ` _(campaign: ${campaignName(r.campaignId) ?? 'one campaign only'})_` : '';
  return `- ${tag}${r.text.trim()}${scope}${r.why?.trim() ? ` — ${r.why.trim()}` : ''}\n`;
}

/** The full guide. `sections` limits it (ids below); default everything. */
export const GUIDE_SECTIONS = ['usage', 'intent', 'color', 'type', 'tokens', 'assets', 'components', 'art', 'rules', 'references', 'formats', 'briefs', 'review', 'voice', 'sources'] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export function compileGuide(s: SpaceData, opts: { sections?: GuideSection[]; includeSources?: boolean } = {}): string {
  const ds = dsOf(s);
  const want = (id: GuideSection) => !opts.sections || opts.sections.includes(id);
  const campaignName = (id?: string) => (id ? s.campaigns.find((c) => c.id === id)?.name : undefined);
  const asset = (id?: string) => (id ? s.assets.find((a) => a.id === id) : undefined);
  const title = ds.name || `${s.meta.title} design system`;
  let md = `# ${title}\n\n`;
  md += para(ds.summary || s.meta.description);
  if (ds.version || ds.updatedAt) md += `_${[ds.version && `Version ${ds.version}`, ds.updatedAt && `updated ${ds.updatedAt.slice(0, 10)}`].filter(Boolean).join(' · ')}_\n\n`;

  if (want('usage')) {
    md += `## How to use this design system\n\n`;
    md += para(ds.agentNotes);
    md += `- **Required** rules must always hold. **Preferred** rules are the default — deviate only with a reason. **Open** means it is up to you.\n`;
    md += `- **Brand** rules apply everywhere; **campaign** rules apply only to the campaign named — never carry them into other work.\n`;
    md += `- References say what they control (style, composition, asset, campaign, mood, colour, typography). Borrow only that; "near miss" and "off brand" references show what NOT to do and why.\n`;
    md += `- Never redraw logos or generate exact text, fonts or small copy inside an image: leave room and place the real files afterwards (see Review & finishing).\n`;
    md += `- Files referenced below (logos/, fonts/, images/) are in this bundle next to this guide; tokens are in tokens.json and tokens.css.\n\n`;
  }

  if (want('intent')) {
    const i = ds.intent;
    const words = i.personality.filter((w) => w.word.trim());
    if (i.audience || i.impression || i.purpose || words.length) {
      md += `## Brand intent\n\n${line('Audience', i.audience)}${line('Impression to leave', i.impression)}${line('Purpose of the visuals', i.purpose)}\n`;
      if (words.length) md += `### Personality → what it looks like\n\n${words.map((w) => `- **${w.word.trim()}**${w.looksLike.trim() ? ` — ${w.looksLike.trim()}` : ''}`).join('\n')}\n\n`;
    }
  }

  if (want('color')) {
    const colors = s.assets.filter((a) => a.kind === 'color');
    if (colors.length || ds.semanticTokens.length) {
      md += `## Colour\n\n`;
      const groups = [...new Set(colors.map((c) => c.group || 'Palette'))];
      for (const g of groups) {
        const list = colors.filter((c) => (c.group || 'Palette') === g);
        md += `### ${g}\n\n${table(['Name', 'Value', 'Role', 'CSS variable', 'Text on it', 'Coverage', 'Usage'], list.map((c) => [c.name, c.value, c.role, c.cssVar, c.onColor, c.coverage, c.notes]))}`;
      }
      if (ds.themes.length) {
        md += `### Themes\n\n${ds.themes.map((t) => `- **${t.name}** (${t.mode}${t.isDefault ? ', default' : ''})${t.notes ? ` — ${t.notes}` : ''}`).join('\n')}\n\n`;
      }
      if (ds.semanticTokens.length) {
        md += `### Semantic tokens (same names, one value per theme)\n\n${table(['Token', ...ds.themes.map((t) => t.name), 'Meaning'], ds.semanticTokens.map((t) => [t.name, ...ds.themes.map((th) => t.values[th.id]), t.description]))}`;
      }
    }
  }

  if (want('type')) {
    const fonts = s.assets.filter((a) => a.kind === 'font');
    if (fonts.length || ds.typeStyles.length) {
      md += `## Typography\n\n`;
      if (fonts.length) md += `### Typefaces\n\n${fonts.map((f) => `- **${f.value || f.name}**${f.weights ? ` (weights ${f.weights})` : ''}${f.notes ? ` — ${f.notes}` : ''}${bundlePath(f) ? ` · file: \`${bundlePath(f)}\`` : f.url ? ` · ${f.url}` : ''}`).join('\n')}\n\n`;
      if (ds.typeStyles.length) md += `### Type styles\n\n${table(['Style', 'Family', 'Weight', 'Size / line', 'Tracking', 'Case', 'CSS variable', 'Use for'], ds.typeStyles.map((t) => [t.name, t.family, t.weight, [t.size, t.lineHeight].filter(Boolean).join(' / '), t.letterSpacing, t.case && t.case !== 'none' ? t.case : '', t.cssVar, t.usage]))}`;
      if (ds.artDirection.substitutions) md += `**Substitutions:** ${ds.artDirection.substitutions.trim()}\n\n`;
    }
  }

  if (want('tokens') && ds.tokens.length) {
    md += `## Spacing, shape & other tokens\n\n`;
    const groups = [...new Set(ds.tokens.map((t) => t.group))];
    for (const g of groups) md += `### ${g[0].toUpperCase()}${g.slice(1)}\n\n${table(['Token', 'Value', 'Notes'], ds.tokens.filter((t) => t.group === g).map((t) => [t.name, t.value, t.notes]))}`;
  }

  if (want('assets')) {
    const logos = s.assets.filter((a) => a.kind === 'logo');
    if (logos.length) md += `## Logos\n\nUse these files exactly as supplied — never redraw, recolour or distort them.\n\n${logos.map((l) => `- **${l.name}**${l.notes ? ` — ${l.notes}` : ''}${bundlePath(l) ? ` · \`${bundlePath(l)}\`` : ''}`).join('\n')}\n\n`;
  }

  if (want('components') && (ds.components.length || ds.layouts.length)) {
    md += `## Components & layouts\n\n`;
    const cats = [...new Set(ds.components.map((c) => c.category || 'Components'))];
    for (const cat of cats) {
      md += `### ${cat}\n\n`;
      for (const c of ds.components.filter((x) => (x.category || 'Components') === cat)) {
        md += `#### ${c.name}\n\n${para(c.description)}${line('Props', c.props?.replace(/\n/g, '; '))}${line('Variants', c.variants)}${line('States', c.states)}${line('Per theme', c.themeNotes)}${line('Use', c.usage)}`;
        if (c.code?.trim()) md += `\n\`\`\`html\n${c.code.trim()}\n\`\`\`\n`;
        md += '\n';
      }
    }
    if (ds.layouts.length) {
      md += `### Layouts\n\n`;
      for (const l of ds.layouts) {
        const f = ds.formats.find((x) => x.id === l.formatId);
        md += `#### ${l.name} _(${l.kind.replace('_', ' ')}${f ? `, ${f.name}` : ''})_\n\n${para(l.description)}${line('Structure', l.structure)}\n`;
      }
    }
  }

  if (want('art')) {
    const ad = ds.artDirection;
    const im = ad.imagery;
    const cb = ad.colorBehavior;
    const has = Object.values(im).some(Boolean) || ad.composition || ad.relationships || Object.values(cb).some(Boolean) || ad.typographyInImages || ds.treatments.length;
    if (has) {
      md += `## Art direction (for new imagery)\n\n`;
      if (ad.relationships) md += `### How the elements work together\n\n${para(ad.relationships)}`;
      if (Object.values(im).some(Boolean)) md += `### Imagery\n\n${line('Subjects', im.subjects)}${line('Style', im.style)}${line('Lighting', im.lighting)}${line('Camera & angles', im.camera)}${line('Cropping', im.cropping)}${line('Realism', im.realism)}${line('People', im.people)}${line('Avoid', im.avoid)}\n`;
      if (ad.composition) md += `### Composition\n\n${para(ad.composition)}`;
      if (Object.values(cb).some(Boolean)) md += `### Colour behaviour\n\n${line('Dominant', cb.dominant)}${line('Accents', cb.accents)}${line('Approximate coverage', cb.coverage)}${line('Photo treatment', cb.photoTreatment)}${line('Backgrounds', cb.backgrounds)}${line('Light vs dark', cb.lightDark)}\n`;
      if (ad.typographyInImages) md += `### Typography in images\n\n${para(ad.typographyInImages)}`;
      if (ds.treatments.length) {
        md += `### Signature treatments\n\n`;
        for (const t of ds.treatments) md += `- **${t.name}** (${LEVEL_LABEL[t.level].toLowerCase()})${t.description ? ` — ${t.description}` : ''}${t.whereToUse ? ` **Use:** ${t.whereToUse}.` : ''}${t.avoid ? ` **Avoid:** ${t.avoid}.` : ''}${asset(t.exampleAssetId) && bundlePath(asset(t.exampleAssetId)!) ? ` Example: \`${bundlePath(asset(t.exampleAssetId)!)}\`` : ''}\n`;
        md += '\n';
      }
    }
  }

  if (want('rules') && ds.rules.length) {
    md += `## Rules\n\n`;
    for (const lv of ['required', 'preferred', 'open'] as DSLevel[]) {
      const list = ds.rules.filter((r) => r.level === lv && r.text.trim());
      if (!list.length) continue;
      md += `### ${LEVEL_LABEL[lv]}\n\n`;
      const areas = [...new Set(list.map((r) => r.area))];
      for (const a of areas) md += `**${a[0].toUpperCase()}${a.slice(1)}**\n\n${list.filter((r) => r.area === a).map((r) => ruleLine(r, campaignName)).join('')}\n`;
    }
  }

  if (want('references') && ds.references.some((r) => r.title.trim() || r.assetId)) {
    md += `## References\n\nEach reference says what it controls — borrow only that.\n\n`;
    const verdicts: [DSReference['verdict'], string][] = [
      ['on_brand', 'On brand'],
      ['near_miss', 'Near misses (attractive, but not us — learn why)'],
      ['off_brand', 'Off brand'],
    ];
    for (const [v, label] of verdicts) {
      const list = ds.references.filter((r) => r.verdict === v && (r.title.trim() || r.assetId));
      if (!list.length) continue;
      md += `### ${label}\n\n`;
      for (const r of list) {
        const a = asset(r.assetId);
        md += `#### ${r.title || a?.name || 'Reference'}\n\n${a && bundlePath(a) ? `![${esc(r.title || a.name)}](${bundlePath(a)})\n\n` : ''}${line('Controls', r.roles.map((x) => `${x} (${REFERENCE_ROLE_HINT[x] ?? x})`).join('; '))}${line('Borrow', r.borrow)}${line('Ignore', r.ignore)}${line('Why', r.why)}${line('Mode', r.mode && r.mode !== 'any' ? r.mode : '')}${line('Campaign', campaignName(r.campaignId))}\n`;
      }
    }
  }

  if (want('formats') && ds.formats.some((f) => f.name.trim())) {
    md += `## Formats & production\n\n${table(['Format', 'Size', 'Safe area', 'Min. text', 'Background', 'Resolution', 'Notes'], ds.formats.filter((f) => f.name.trim()).map((f) => [f.name, formatSize(f), f.safeArea, f.minText, f.transparent ? 'transparent' : f.background, f.resolution, f.notes]))}`;
  }

  if (want('briefs') && ds.briefs.length) {
    md += `## Generation briefs\n\n`;
    for (const b of ds.briefs) md += `### ${b.name || 'Brief'}\n\n${compileBrief(s, b, { heading: false })}\n`;
  }

  if (want('review') && (ds.review.criteria.length || ds.review.finishing)) {
    md += `## Review & finishing\n\n`;
    if (ds.review.criteria.length) md += `Check every result against:\n\n${ds.review.criteria.map((c) => `- [ ] ${c}`).join('\n')}\n\n`;
    if (ds.review.finishing) md += `### Finishing workflow\n\n${para(ds.review.finishing)}`;
  }

  if (want('voice')) {
    const st = s.strategy;
    if (st?.tagline || st?.voice || st?.keyMessages) md += `## Voice (from Strategy)\n\n${line('Tagline', st.tagline)}${line('Tone of voice', st.voice)}${st.keyMessages?.trim() ? `\n**Key messages**\n\n${st.keyMessages.trim()}\n` : ''}\n`;
  }

  if (want('sources') && opts.includeSources !== false) {
    const docs = ds.sources.flatMap((x) => x.docs.map((d) => ({ ...d, from: x.fileName })));
    if (docs.length) {
      md += `## Imported guidance\n\nVerbatim documents from imported design-system files. Where they disagree with the sections above, the sections above win.\n\n`;
      // the document's own headings are nested under its title so they never read as sections of this guide
      for (const d of docs) md += `### ${d.title} _(${d.from} › ${d.path})_\n\n${nestHeadings(d.text.trim())}\n\n`;
    }
  }
  return md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Push Markdown headings down so the shallowest becomes ####; fenced code is left alone. */
function nestHeadings(text: string): string {
  const lines = text.split('\n');
  const levels = lines.filter((l) => /^#{1,6}\s/.test(l)).map((l) => /^#+/.exec(l)![0].length);
  const shift = levels.length ? Math.max(0, 4 - Math.min(...levels)) : 0;
  if (!shift) return text;
  let fence = false;
  return lines
    .map((l) => {
      if (/^\s*(```|~~~)/.test(l)) fence = !fence;
      const m = fence ? null : /^(#{1,6})(\s.*)$/.exec(l);
      return m ? `${'#'.repeat(Math.min(6, m[1].length + shift))}${m[2]}` : l;
    })
    .join('\n');
}

/** A brief as text for an image model / designer. Pass a stored brief or an ad-hoc one. */
export function compileBrief(s: SpaceData, b: Partial<DSBrief> & { formatId?: string }, opts: { heading?: boolean } = {}): string {
  const ds = dsOf(s);
  const f = ds.formats.find((x) => x.id === b.formatId);
  const rules = (b.ruleIds?.length ? ds.rules.filter((r) => b.ruleIds!.includes(r.id)) : ds.rules.filter((r) => r.level === 'required' && r.scope === 'brand')).filter((r) => r.text.trim());
  const refs = ds.references.filter((r) => b.referenceIds?.includes(r.id));
  const asset = (id?: string) => (id ? s.assets.find((a) => a.id === id) : undefined);
  const ad = ds.artDirection;
  let out = opts.heading === false ? '' : `## ${b.name || 'Generation brief'}\n\n`;
  out += `${line('Objective', b.objective)}${line('Audience', b.audience || ds.intent.audience)}`;
  if (f) out += line('Format', `${f.name}${formatSize(f) ? ` (${formatSize(f)})` : ''}${f.safeArea ? `; safe area: ${f.safeArea}` : ''}${f.minText ? `; min. text ${f.minText}` : ''}${f.transparent ? '; transparent background' : ''}`);
  if (b.copy?.trim()) out += line('Exact copy (place in finishing, do not render as generated text)', b.copy.trim().replace(/\n/g, ' / '));
  if (ad.relationships) out += line('Composition logic', ad.relationships);
  else if (ad.composition) out += line('Composition', ad.composition);
  const im = ad.imagery;
  const imagery = [im.subjects && `subjects: ${im.subjects}`, im.style && `style: ${im.style}`, im.lighting && `lighting: ${im.lighting}`, im.camera && `camera: ${im.camera}`, im.realism && `realism: ${im.realism}`].filter(Boolean).join('; ');
  if (imagery) out += line('Imagery', imagery);
  if (im.avoid) out += line('Avoid', im.avoid);
  const cb = ad.colorBehavior;
  const colour = [cb.dominant && `dominant ${cb.dominant}`, cb.accents && `accents ${cb.accents}`, cb.coverage, cb.photoTreatment && `photos: ${cb.photoTreatment}`].filter(Boolean).join('; ');
  if (colour) out += line('Colour', colour);
  if (rules.length) out += `\n**Rules**\n\n${rules.map((r) => `- [${LEVEL_LABEL[r.level]}] ${r.kind === 'dont' ? "Don't: " : r.kind === 'do' ? 'Do: ' : ''}${r.text.trim()}`).join('\n')}\n`;
  if (refs.length) out += `\n**References**\n\n${refs.map((r) => { const a = asset(r.assetId); return `- ${r.title || a?.name || 'reference'}${a && bundlePath(a) ? ` (\`${bundlePath(a)}\`)` : ''} — controls ${r.roles.join(', ') || 'mood'}${r.borrow ? `; borrow: ${r.borrow}` : ''}${r.ignore ? `; ignore: ${r.ignore}` : ''}${r.verdict !== 'on_brand' ? ` (${r.verdict.replace('_', ' ')}: what NOT to do)` : ''}`; }).join('\n')}\n`;
  if (b.variation) out += `\n${line('May vary', b.variation)}`;
  if (b.review) out += line('Review', b.review);
  if (b.finishing || ds.review.finishing) out += line('Finishing', b.finishing || ds.review.finishing);
  return out;
}

/* ---------------------------------------------------------------- tokens */

const cssName = (raw: string, prefix: string) => {
  const n = raw.trim();
  if (n.startsWith('--')) return n;
  return `--${prefix}${slugify(n, 40)}`;
};

export function colorVar(a: BrandAsset): string {
  return a.cssVar?.trim() || cssName(a.name || 'colour', 'color-');
}

export function compileTokens(s: SpaceData): Record<string, unknown> {
  const ds = dsOf(s);
  const colors: Record<string, unknown> = {};
  for (const c of s.assets.filter((a) => a.kind === 'color' && a.value)) {
    const g = slugify(c.group || 'palette', 30) || 'palette';
    (colors[g] ??= {}) as Record<string, unknown>;
    (colors[g] as Record<string, unknown>)[slugify(c.name || c.value!, 40) || c.id] = { $value: c.value, $type: 'color', ...(c.role ? { role: c.role } : {}), cssVar: colorVar(c), ...(c.notes ? { $description: c.notes } : {}) };
  }
  const themes: Record<string, unknown> = {};
  for (const th of ds.themes) themes[th.name || th.id] = { mode: th.mode, ...(th.isDefault ? { default: true } : {}), tokens: Object.fromEntries(ds.semanticTokens.filter((t) => t.values[th.id]).map((t) => [t.name, t.values[th.id]])) };
  const typography = Object.fromEntries(
    ds.typeStyles.map((t) => [
      slugify(t.name, 40) || t.id,
      { $type: 'typography', $value: { fontFamily: t.family, fontWeight: t.weight, fontSize: t.size, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, textCase: t.case }, ...(t.usage ? { $description: t.usage } : {}) },
    ]),
  );
  const groups: Record<string, unknown> = {};
  for (const t of ds.tokens) ((groups[t.group] ??= {}) as Record<string, unknown>)[t.name.replace(/^--/, '')] = { $value: t.value, ...(t.notes ? { $description: t.notes } : {}) };
  return { $schema: 'https://design-tokens.github.io/community-group/format/', name: ds.name || s.meta.title, color: colors, themes, typography, ...groups };
}

export function compileCss(s: SpaceData): string {
  const ds = dsOf(s);
  const root: string[] = [];
  for (const c of s.assets.filter((a) => a.kind === 'color' && a.value)) root.push(`  ${colorVar(c)}: ${c.value};${c.role ? ` /* ${c.role} */` : ''}`);
  for (const t of ds.typeStyles) {
    const n = t.cssVar?.trim() || cssName(t.name, 'type-');
    root.push(`  ${n}: ${[t.italic ? 'italic' : '', t.weight, t.size ? `${t.size}${t.lineHeight ? `/${t.lineHeight}` : ''}` : '', t.family ? `"${t.family}"` : ''].filter(Boolean).join(' ')};`);
    if (t.letterSpacing) root.push(`  ${n}-tracking: ${t.letterSpacing};`);
  }
  for (const t of ds.tokens) root.push(`  ${cssName(t.name, `${t.group}-`)}: ${t.value};`);
  const def = ds.themes.find((t) => t.isDefault) ?? ds.themes[0];
  if (def) for (const t of ds.semanticTokens) if (t.values[def.id]) root.push(`  ${cssName(t.name, '')}: ${t.values[def.id]};`);
  let css = `/* ${ds.name || s.meta.title} — design tokens (generated by PrePro Studio) */\n:root {\n${root.join('\n')}\n}\n`;
  for (const th of ds.themes) {
    const lines = ds.semanticTokens.filter((t) => t.values[th.id]).map((t) => `  ${cssName(t.name, '')}: ${t.values[th.id]};`);
    if (lines.length) css += `\n[data-theme="${slugify(th.name, 40) || th.id}"] {\n${lines.join('\n')}\n}\n`;
  }
  return css;
}

/** How complete the design system is, for the readiness meter (0–1) and its to-do list. */
export function dsReadiness(s: SpaceData): { score: number; missing: string[] } {
  const ds = dsOf(s);
  const checks: [boolean, string][] = [
    [!!(ds.summary || ds.agentNotes), 'Summary and how agents should use it'],
    [!!(ds.intent.audience || ds.intent.impression || ds.intent.personality.length), 'Brand intent'],
    [s.assets.some((a) => a.kind === 'logo'), 'Logo files'],
    [s.assets.filter((a) => a.kind === 'color').length >= 2, 'Colour palette'],
    [s.assets.some((a) => a.kind === 'color' && a.role), 'Colour roles'],
    [s.assets.some((a) => a.kind === 'font') || ds.typeStyles.length > 0, 'Typefaces'],
    [ds.typeStyles.length >= 3, 'Type styles (at least 3)'],
    [ds.tokens.some((t) => t.group === 'spacing'), 'Spacing scale'],
    [ds.components.length + ds.layouts.length > 0, 'Components or layouts'],
    [!!(ds.artDirection.relationships || ds.artDirection.composition), 'Composition / how elements relate'],
    [Object.values(ds.artDirection.imagery).some(Boolean), 'Imagery direction'],
    [Object.values(ds.artDirection.colorBehavior).some(Boolean), 'Colour behaviour'],
    [ds.rules.some((r) => r.level === 'required'), 'Required rules'],
    [ds.references.some((r) => r.verdict === 'on_brand'), 'On-brand references'],
    [ds.references.some((r) => r.verdict !== 'on_brand'), 'Near misses / counterexamples'],
    [ds.formats.length > 0, 'Output formats'],
    [ds.briefs.length > 0, 'A generation brief'],
    [ds.review.criteria.length > 0, 'Review checklist'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { score: done / checks.length, missing: checks.filter(([ok]) => !ok).map(([, l]) => l) };
}
