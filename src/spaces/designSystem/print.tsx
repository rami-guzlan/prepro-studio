/* Printable design-system book (docId 'space-design-system'): cover, how to
   use it, intent, colour (palettes + theme token table), type specimens,
   spacing / radius / shadow visuals, components & layouts, art direction,
   treatments, rules by level, references, formats, briefs, review checklist and
   (optionally) the imported guidance. Fonts that were uploaded as files are
   embedded with @font-face so the specimens render in the real typeface. */
import type { CSSProperties, ReactNode } from 'react';
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import type { BrandAsset, SpaceData } from '@/spaces/types';
import { PSection, PTable, Pre } from '@/print/components';
import { inkOn, normalizeHex } from '@/spaces/modules/assets/util';
import { compileBrief, dsOf, dsReadiness, formatSize, LEVEL_LABEL, REFERENCE_ROLE_HINT, typeSpec } from './compile';
import type { DSLevel, DSReference, DSRule, DSToken, DSTypeStyle } from './types';

const CSS = `
.ds-cover { min-height: 8.2in; display: flex; flex-direction: column; justify-content: space-between; break-after: page; page-break-after: always; }
.ds-cover-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16pt; }
.ds-cover-logo { max-height: 0.8in; max-width: 2.4in; object-fit: contain; }
.ds-cover-kicker { font-size: 8pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6a74; }
.ds-cover h1 { font-size: 40pt; line-height: 1.02; letter-spacing: -0.02em; margin: 10pt 0 12pt; font-weight: 800; }
.ds-cover .ds-sum { font-size: 12pt; line-height: 1.45; color: #33333c; max-width: 5.6in; }
.ds-cover-band { display: flex; height: 0.9in; border-radius: 6pt; overflow: hidden; margin: 18pt 0 10pt; }
.ds-cover-band div { flex: 1; }
.ds-cover-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8pt; }
.ds-cover-stat { border-top: 1.5pt solid #16161a; padding-top: 4pt; }
.ds-cover-stat b { display: block; font-size: 18pt; font-weight: 800; }
.ds-cover-stat span { font-size: 7.5pt; color: #6a6a74; text-transform: uppercase; letter-spacing: 0.06em; }
.ds-meter { height: 5pt; background: #e6e6ec; border-radius: 3pt; overflow: hidden; margin-top: 4pt; }
.ds-meter div { height: 100%; background: #16161a; }
.ds-lead { font-size: 9.5pt; line-height: 1.5; color: #2a2a33; }
.ds-callout { border-left: 3pt solid #16161a; background: #f4f4f7; padding: 8pt 10pt; border-radius: 0 4pt 4pt 0; font-size: 9.5pt; line-height: 1.5; break-inside: avoid; }
.ds-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8pt; margin-top: 8pt; }
.ds-legend > div { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 6pt 8pt; font-size: 8pt; }
.ds-k { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #7a7a84; margin-bottom: 2pt; }
.ds-words { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8pt; }
.ds-word { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 7pt 8pt; break-inside: avoid; }
.ds-word b { font-size: 12pt; display: block; margin-bottom: 2pt; }
.ds-word span { font-size: 8pt; color: #44444c; }
.ds-swatches { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8pt; margin-bottom: 10pt; }
.ds-swatch { border: 0.75pt solid #d4d4dc; border-radius: 4pt; overflow: hidden; break-inside: avoid; }
.ds-chip { height: 0.7in; display: flex; justify-content: space-between; align-items: flex-end; padding: 4pt 6pt; font-size: 12pt; font-weight: 700; }
.ds-chip small { font-size: 6.5pt; font-weight: 600; opacity: 0.85; }
.ds-swatch .m { padding: 4pt 6pt 5pt; font-size: 7pt; color: #44444c; }
.ds-swatch .m b { display: block; font-size: 8pt; color: #16161a; }
.ds-mono { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 7pt; }
.ds-group { font-size: 8pt; font-weight: 700; margin: 6pt 0 4pt; color: #2a2a33; }
.ds-dot { display: inline-block; width: 9pt; height: 9pt; border-radius: 2pt; border: 0.5pt solid rgba(0,0,0,0.2); vertical-align: -1.5pt; margin-right: 4pt; }
.ds-spec { display: grid; grid-template-columns: 1.6in minmax(0, 1fr); gap: 12pt; padding: 8pt 0; border-bottom: 0.5pt solid #dcdce2; break-inside: avoid; align-items: baseline; }
.ds-spec:last-child { border-bottom: 0; }
.ds-spec .n { font-size: 9pt; font-weight: 700; }
.ds-spec .s { font-size: 7pt; color: #6a6a74; margin-top: 2pt; }
.ds-spec .sample { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #16161a; }
.ds-face { display: grid; grid-template-columns: 1.6in minmax(0, 1fr); gap: 12pt; padding: 6pt 0; border-bottom: 0.5pt solid #dcdce2; break-inside: avoid; }
.ds-face .big { font-size: 26pt; line-height: 1.1; }
.ds-face .alpha { font-size: 9pt; color: #44444c; margin-top: 2pt; }
.ds-scale { display: grid; grid-template-columns: 1.4in 0.8in minmax(0, 1fr); gap: 8pt; align-items: center; padding: 3pt 0; font-size: 8pt; break-inside: avoid; }
.ds-bar { height: 9pt; background: #16161a; border-radius: 1.5pt; }
.ds-radii { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10pt; }
.ds-radius { text-align: center; font-size: 7.5pt; break-inside: avoid; }
.ds-radius div { height: 0.6in; border: 1.5pt solid #16161a; background: #f4f4f7; margin-bottom: 4pt; }
.ds-shadows { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14pt; padding: 6pt; }
.ds-shadow { text-align: center; font-size: 7.5pt; break-inside: avoid; }
.ds-shadow div { height: 0.6in; background: #fff; border-radius: 4pt; margin-bottom: 6pt; }
.ds-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10pt; }
.ds-card { border: 0.75pt solid #d4d4dc; border-radius: 4pt; overflow: hidden; break-inside: avoid; }
.ds-card .ph { height: 1.4in; background: #f1f1f4; display: flex; align-items: center; justify-content: center; }
.ds-card .ph img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.ds-card .b { padding: 6pt 8pt; font-size: 8pt; }
.ds-card .t { font-size: 10pt; font-weight: 700; }
.ds-card .c { font-size: 6.8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; font-weight: 700; }
.ds-card .p { white-space: pre-wrap; color: #44444c; margin-top: 3pt; }
.ds-kv { display: grid; grid-template-columns: 1.3in minmax(0, 1fr); gap: 3pt 10pt; font-size: 8.5pt; }
.ds-kv dt { font-weight: 700; color: #44444c; }
.ds-kv dd { margin: 0; white-space: pre-wrap; }
.ds-badge { display: inline-block; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 1pt 4pt; border-radius: 2pt; vertical-align: 1pt; }
.ds-lv-required { background: #16161a; color: #fff; }
.ds-lv-preferred { background: #dcdce6; color: #16161a; }
.ds-lv-open { background: #fff; color: #44444c; border: 0.5pt solid #b4b4be; }
.ds-rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6pt 14pt; }
.ds-area { break-inside: avoid; }
.ds-rule { font-size: 8.5pt; padding: 2.5pt 0 2.5pt 13pt; position: relative; line-height: 1.4; }
.ds-rule::before { content: '•'; position: absolute; left: 2pt; color: #6a6a74; }
.ds-rule.do::before { content: '✓'; color: #2b8a3e; font-weight: 700; }
.ds-rule.dont::before { content: '✕'; color: #c92a2a; font-weight: 700; }
.ds-rule .why { color: #6a6a74; }
.ds-rule .camp { color: #7048e8; font-size: 7.5pt; }
.ds-refs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10pt; }
.ds-ref { border: 0.75pt solid #d4d4dc; border-radius: 4pt; overflow: hidden; break-inside: avoid; }
.ds-ref .ph { aspect-ratio: 4 / 3; background: #ececf1; }
.ds-ref .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ds-ref .b { padding: 5pt 7pt; font-size: 7.6pt; line-height: 1.4; }
.ds-ref .t { font-weight: 700; font-size: 8.5pt; margin: 2pt 0; }
.ds-v-on_brand { background: #d3f9d8; color: #2b8a3e; }
.ds-v-near_miss { background: #fff3bf; color: #a35d00; }
.ds-v-off_brand { background: #ffe3e3; color: #c92a2a; }
.ds-ref.near_miss { border-color: #f0c36d; }
.ds-ref.off_brand { border-color: #f1a1a1; }
.ds-roles { color: #44444c; }
.ds-formats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10pt; align-items: end; margin-bottom: 8pt; }
.ds-format { text-align: center; font-size: 7.5pt; break-inside: avoid; }
.ds-format .r { margin: 0 auto 4pt; border: 1pt solid #16161a; background: #f4f4f7; }
.ds-brief { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 8pt 10pt; margin-bottom: 8pt; break-inside: avoid; }
.ds-brief h3 { font-size: 10.5pt; margin: 0 0 4pt; }
.ds-brief .x { font-size: 8pt; white-space: pre-wrap; line-height: 1.45; }
.ds-check { font-size: 9pt; padding: 3pt 0 3pt 16pt; position: relative; }
.ds-check::before { content: ''; position: absolute; left: 0; top: 4pt; width: 8pt; height: 8pt; border: 0.9pt solid #16161a; border-radius: 1.5pt; }
.ds-doc { font-size: 7.6pt; }
.ds-doc .pp-pre { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 7pt; line-height: 1.4; }
`;

const LEVELS: DSLevel[] = ['required', 'preferred', 'open'];
const VERDICT: Record<DSReference['verdict'], string> = { on_brand: 'On brand', near_miss: 'Near miss', off_brand: 'Off brand' };
const AREA_LABEL = (a: string) => a[0].toUpperCase() + a.slice(1);
const has = (o: object) => Object.values(o).some((v) => typeof v === 'string' && v.trim());

/** px value of a CSS length (rem/em = 16px); null when not a plain length. */
function px(v: string): number | null {
  const m = /^\s*(-?[\d.]+)\s*(px|rem|em|pt)?\s*$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] ?? 'px').toLowerCase();
  return u === 'rem' || u === 'em' ? n * 16 : u === 'pt' ? n * (4 / 3) : n;
}

function swatchOf(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  if (normalizeHex(s) || /^(rgb|hsl|oklch|color|linear-gradient|radial-gradient)/i.test(s)) return s;
  return undefined;
}

function Badge({ level }: { level: DSLevel }) {
  return <span className={`ds-badge ds-lv-${level}`}>{LEVEL_LABEL[level].replace(' to interpretation', '')}</span>;
}

function KVList({ items }: { items: [string, string | undefined][] }) {
  const shown = items.filter(([, v]) => v?.trim());
  if (!shown.length) return null;
  return (
    <dl className="ds-kv">
      {shown.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v!.trim()}</dd>
        </div>
      ))}
    </dl>
  );
}

function fontFaces(s: SpaceData, ctx: SpacePrintContext): string {
  return s.assets
    .filter((a) => a.kind === 'font' && a.file && a.value)
    .map((a) => {
      const w = /^\d{3}$/.test((a.weights ?? '').trim()) ? a.weights!.trim() : '100 900';
      return `@font-face { font-family: "${a.value!.replace(/"/g, '')}"; src: url("${ctx.asset(a.file)}"); font-weight: ${w}; font-display: block; }`;
    })
    .join('\n');
}

function specStyle(t: DSTypeStyle): CSSProperties {
  const size = px(t.size ?? '');
  const pt = size ? Math.min(Math.max(size * 0.75, 7), 34) : 14;
  return {
    fontFamily: t.family ? `"${t.family.replace(/"/g, '')}", Inter, Arial, sans-serif` : undefined,
    fontWeight: t.weight,
    fontSize: `${pt}pt`,
    lineHeight: 1.15,
    letterSpacing: t.letterSpacing,
    textTransform: t.case === 'upper' ? 'uppercase' : t.case === 'lower' ? 'lowercase' : t.case === 'title' ? 'capitalize' : undefined,
    fontStyle: t.italic ? 'italic' : undefined,
  };
}

function sampleText(t: DSTypeStyle, s: SpaceData): string {
  const n = t.name.toLowerCase();
  if (/stat|numeral|number|figure/.test(n)) return '1,284 · 72% · $4.9M';
  if (/eyebrow|overline|kicker|label|caption|tag|meta/.test(n)) return t.usage?.trim() || 'Section label · 2026';
  if (/body|text|paragraph|copy|lead|small/.test(n)) return s.strategy?.valueProp?.trim() || 'The quick brown fox jumps over the lazy dog and keeps reading the line.';
  return s.strategy?.tagline?.trim() || s.meta.title;
}

function tokenVisual(t: DSToken): ReactNode {
  const p = px(t.value);
  if (t.group === 'spacing' && p != null) return <div className="ds-bar" style={{ width: `${Math.min(p * 1.4, 380)}pt` }} />;
  return null;
}

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-design-system',
    title: 'Design System',
    group: 'Strategy',
    orientation: 'portrait',
    description: 'The brand’s design system and art direction as a book: palettes and theme tokens, type specimens, spacing and shape, components and layouts, imagery, rules, references, formats, briefs and the review checklist',
    options: [
      { key: 'includeBriefs', label: 'Generation briefs', type: 'boolean', default: true },
      { key: 'includeGuidance', label: 'Imported guidance (README, SKILL.md … verbatim)', type: 'boolean', default: false },
    ],
    emptyReason: (s) => {
      const ds = dsOf(s);
      const any =
        s.assets.some((a) => a.kind === 'color' || a.kind === 'font' || a.kind === 'logo') ||
        ds.typeStyles.length + ds.tokens.length + ds.components.length + ds.layouts.length + ds.rules.length + ds.references.length + ds.semanticTokens.length > 0 ||
        has(ds.artDirection.imagery) ||
        !!ds.artDirection.relationships ||
        !!ds.summary;
      return any ? false : 'Fill in the design system in Brand Kit & Assets → Design system (or import a Claude Design design-system zip) first';
    },
    render: (ctx) => {
      const { space: s, options } = ctx;
      const ds = dsOf(s);
      const title = ds.name?.trim() || `${s.meta.title} design system`;
      const asset = (id?: string) => (id ? s.assets.find((a) => a.id === id) : undefined);
      const img = (a?: BrandAsset) => (a?.image ? ctx.asset(a.image) : '');
      const campaign = (id?: string) => (id ? s.campaigns.find((c) => c.id === id)?.name : undefined);
      const colors = s.assets.filter((a) => a.kind === 'color');
      const fonts = s.assets.filter((a) => a.kind === 'font');
      const logos = s.assets.filter((a) => a.kind === 'logo');
      const groups = [...new Set(colors.map((c) => c.group || 'Palette'))];
      const ready = dsReadiness(s);
      const ad = ds.artDirection;
      const tokenGroups = [...new Set(ds.tokens.map((t) => t.group))];
      const logo = logos.find((l) => l.image) ?? (s.meta.logo ? ({ image: s.meta.logo } as BrandAsset) : undefined);
      const band = colors.map((c) => normalizeHex(c.value)).filter(Boolean).slice(0, 12) as string[];
      const stat = (n: number, label: string) => (
        <div className="ds-cover-stat">
          <b>{n}</b>
          <span>{label}</span>
        </div>
      );
      const docs = ds.sources.flatMap((x) => x.docs.map((d) => ({ ...d, from: x.fileName })));

      return {
        css: CSS + fontFaces(s, ctx),
        title,
        fileName: `${title} - Design System`,
        body: (
          <>
            {/* ---------------- cover */}
            <div className="ds-cover">
              <div>
                <div className="ds-cover-top">
                  <div className="ds-cover-kicker">{s.meta.title} · Design system{ds.version ? ` · v${ds.version}` : ''}</div>
                  {logo?.image && <img className="ds-cover-logo" src={ctx.asset(logo.image)} alt="" />}
                </div>
                <h1>{title}</h1>
                {(ds.summary || s.meta.description) && <div className="ds-sum">{ds.summary || s.meta.description}</div>}
                {band.length > 0 && (
                  <div className="ds-cover-band">
                    {band.map((h, i) => (
                      <div key={i} style={{ background: h }} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="ds-cover-stats">
                  {stat(colors.length, 'colours')}
                  {stat(ds.typeStyles.length, 'type styles')}
                  {stat(ds.components.length + ds.layouts.length, 'components & layouts')}
                  {stat(ds.rules.length, 'rules')}
                </div>
                <div style={{ marginTop: '12pt', fontSize: '7.5pt', color: '#6a6a74' }}>
                  Completeness {Math.round(ready.score * 100)} %{ds.updatedAt ? ` · updated ${ctx.fmt.dateMedium(ds.updatedAt.slice(0, 10))}` : ''} · printed {ctx.today}
                  <div className="ds-meter">
                    <div style={{ width: `${Math.round(ready.score * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ---------------- how to use */}
            <PSection title="How to use this design system">
              {ds.agentNotes?.trim() && <div className="ds-callout" style={{ marginBottom: '8pt' }}>{ds.agentNotes.trim()}</div>}
              <div className="ds-lead">
                Every rule has a level and a scope. Brand rules apply everywhere; campaign rules apply only to the campaign named. References say what they control — borrow only that. Never redraw logos or generate exact text inside images: leave room and place the real files afterwards.
              </div>
              <div className="ds-legend">
                {LEVELS.map((l) => (
                  <div key={l}>
                    <Badge level={l} />
                    <div style={{ marginTop: '3pt' }}>{l === 'required' ? 'Must always hold.' : l === 'preferred' ? 'The default — deviate only with a reason.' : 'Up to the maker.'}</div>
                  </div>
                ))}
              </div>
            </PSection>

            {/* ---------------- intent */}
            {(ds.intent.audience || ds.intent.impression || ds.intent.purpose || ds.intent.personality.length > 0) && (
              <PSection title="Brand intent">
                <KVList items={[['Audience', ds.intent.audience], ['Impression to leave', ds.intent.impression], ['Purpose of the visuals', ds.intent.purpose]]} />
                {ds.intent.personality.length > 0 && (
                  <div className="ds-words" style={{ marginTop: '8pt' }}>
                    {ds.intent.personality.map((w) => (
                      <div key={w.id} className="ds-word">
                        <b>{w.word}</b>
                        <span>{w.looksLike}</span>
                      </div>
                    ))}
                  </div>
                )}
              </PSection>
            )}

            {/* ---------------- logos */}
            {logos.length > 0 && (
              <PSection title="Logos" right="use the files exactly as supplied">
                <div className="ds-cards" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                  {logos.map((l) => (
                    <div key={l.id} className="ds-card">
                      <div className="ph" style={{ height: '0.9in', padding: '6pt' }}>{img(l) ? <img src={img(l)} alt="" /> : <span className="pp-muted pp-small">No file</span>}</div>
                      <div className="b">
                        <div className="t" style={{ fontSize: '8.5pt' }}>{l.name || 'Logo'}</div>
                        {l.notes && <div className="p">{l.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </PSection>
            )}

            {/* ---------------- colour */}
            {colors.length > 0 && (
              <PSection title="Colour" className="pp-break-before">
                {groups.map((g) => (
                  <div key={g}>
                    <div className="ds-group">{g}</div>
                    <div className="ds-swatches">
                      {colors
                        .filter((c) => (c.group || 'Palette') === g)
                        .map((c) => {
                          const hex = normalizeHex(c.value);
                          const bg = hex ?? swatchOf(c.value) ?? '#f1f1f4';
                          const ink = normalizeHex(c.onColor) ?? inkOn(hex ?? undefined);
                          return (
                            <div key={c.id} className="ds-swatch">
                              <div className="ds-chip" style={{ background: bg, color: ink }}>
                                <span>Aa</span>
                                {c.coverage && <small>{c.coverage}</small>}
                              </div>
                              <div className="m">
                                <b>{c.name || 'Colour'}</b>
                                <span className="ds-mono">{(hex ?? c.value ?? '').toUpperCase()}</span>
                                {c.cssVar && <div className="ds-mono">{c.cssVar}</div>}
                                {c.role && <div>{c.role}</div>}
                                {c.notes && <div style={{ marginTop: '2pt' }}>{c.notes}</div>}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </PSection>
            )}
            {(ds.themes.length > 0 || ds.semanticTokens.length > 0) && (
              <PSection title="Themes & semantic tokens" right={ds.themes.map((t) => `${t.name} (${t.mode})`).join(' · ')}>
                {ds.themes.some((t) => t.notes) && (
                  <KVList items={ds.themes.map((t) => [t.name + (t.isDefault ? ' (default)' : ''), t.notes] as [string, string | undefined])} />
                )}
                {ds.semanticTokens.length > 0 && (
                  <PTable
                    zebra
                    rows={ds.semanticTokens}
                    columns={[
                      { header: 'Token', width: '24%', cell: (t) => <span className="ds-mono pp-strong">{t.name}</span> },
                      ...ds.themes.map((th) => ({
                        header: th.name,
                        cell: (t: (typeof ds.semanticTokens)[number]) => {
                          const v = t.values[th.id];
                          if (!v) return <span className="pp-muted">—</span>;
                          const sw = swatchOf(v);
                          return (
                            <span className="ds-mono">
                              {sw && <span className="ds-dot" style={{ background: sw }} />}
                              {v}
                            </span>
                          );
                        },
                      })),
                      { header: 'Meaning', width: '26%', cell: (t) => t.description },
                    ]}
                  />
                )}
              </PSection>
            )}

            {/* ---------------- typography */}
            {(fonts.length > 0 || ds.typeStyles.length > 0) && (
              <PSection title="Typography" className="pp-break-before">
                {fonts.map((f) => (
                  <div key={f.id} className="ds-face">
                    <div>
                      <div className="pp-strong" style={{ fontSize: '10pt' }}>{f.value || f.name}</div>
                      <div className="pp-small pp-muted">{[f.name !== f.value ? f.name : '', f.weights && `weights ${f.weights}`].filter(Boolean).join(' · ')}</div>
                      {f.notes && <div className="pp-tiny pp-muted" style={{ marginTop: '2pt' }}>{f.notes}</div>}
                    </div>
                    <div style={{ fontFamily: `"${(f.value || f.name || '').replace(/"/g, '')}", Inter, Arial, sans-serif` }}>
                      <div className="big">Aa Bb Cc 0123</div>
                      <div className="alpha">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &amp;!?</div>
                    </div>
                  </div>
                ))}
                {ds.typeStyles.length > 0 && (
                  <div style={{ marginTop: '8pt' }}>
                    {ds.typeStyles.map((t) => (
                      <div key={t.id} className="ds-spec">
                        <div>
                          <div className="n">{t.name}</div>
                          <div className="s">{typeSpec(t)}</div>
                          {t.cssVar && <div className="s ds-mono">{t.cssVar}</div>}
                          {t.usage && <div className="s">{t.usage}</div>}
                        </div>
                        <div className="sample" style={specStyle(t)}>
                          {sampleText(t, s)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {ad.substitutions?.trim() && (
                  <div className="ds-lead" style={{ marginTop: '6pt' }}>
                    <b>Substitutions:</b> {ad.substitutions.trim()}
                  </div>
                )}
              </PSection>
            )}

            {/* ---------------- tokens */}
            {ds.tokens.length > 0 && (
              <PSection title="Spacing, shape & other tokens">
                {tokenGroups.map((g) => {
                  const list = ds.tokens.filter((t) => t.group === g);
                  return (
                    <div key={g} style={{ marginBottom: '8pt' }}>
                      <div className="ds-group">{AREA_LABEL(g)}</div>
                      {g === 'spacing' ? (
                        list.map((t) => (
                          <div key={t.id} className="ds-scale">
                            <span className="ds-mono">{t.name}</span>
                            <span>{t.value}</span>
                            {tokenVisual(t) ?? <span className="pp-muted">{t.notes}</span>}
                          </div>
                        ))
                      ) : g === 'radius' ? (
                        <div className="ds-radii">
                          {list.map((t) => (
                            <div key={t.id} className="ds-radius">
                              <div style={{ borderRadius: px(t.value) != null ? `${Math.min(px(t.value)! * 0.9, 40)}pt` : t.value }} />
                              <span className="ds-mono">{t.name}</span>
                              <br />
                              {t.value}
                            </div>
                          ))}
                        </div>
                      ) : g === 'shadow' ? (
                        <div className="ds-shadows">
                          {list.map((t) => (
                            <div key={t.id} className="ds-shadow">
                              <div style={{ boxShadow: t.value }} />
                              <span className="ds-mono">{t.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <PTable zebra rows={list} columns={[{ header: 'Token', width: '30%', cell: (t) => <span className="ds-mono">{t.name}</span> }, { header: 'Value', width: '35%', cell: (t) => <span className="ds-mono">{t.value}</span> }, { header: 'Notes', cell: (t) => t.notes }]} />
                      )}
                    </div>
                  );
                })}
              </PSection>
            )}

            {/* ---------------- components & layouts */}
            {ds.components.length > 0 && (
              <PSection title="Components" className="pp-break-before">
                <div className="ds-cards">
                  {ds.components.map((c) => {
                    const a = asset(c.previewAssetId);
                    return (
                      <div key={c.id} className="ds-card">
                        {img(a) && (
                          <div className="ph">
                            <img src={img(a)} alt="" />
                          </div>
                        )}
                        <div className="b">
                          {c.category && <div className="c">{c.category}</div>}
                          <div className="t">{c.name}</div>
                          {c.description && <div className="p">{c.description}</div>}
                          <div style={{ marginTop: '4pt' }}>
                            <KVList items={[['Props', c.props], ['Variants', c.variants], ['States', c.states], ['Per theme', c.themeNotes], ['Use', c.usage]]} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PSection>
            )}
            {ds.layouts.length > 0 && (
              <PSection title="Layouts">
                <div className="ds-cards">
                  {ds.layouts.map((l) => {
                    const a = asset(l.previewAssetId);
                    const f = ds.formats.find((x) => x.id === l.formatId);
                    return (
                      <div key={l.id} className="ds-card">
                        {img(a) && (
                          <div className="ph">
                            <img src={img(a)} alt="" />
                          </div>
                        )}
                        <div className="b">
                          <div className="c">
                            {l.kind.replace('_', ' ')}
                            {f ? ` · ${f.name}` : ''}
                          </div>
                          <div className="t">{l.name}</div>
                          {l.description && <div className="p">{l.description}</div>}
                          {l.structure && (
                            <div className="p">
                              <b>Structure:</b> {l.structure}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PSection>
            )}

            {/* ---------------- art direction */}
            {(ad.relationships || ad.composition || has(ad.imagery) || has(ad.colorBehavior) || ad.typographyInImages || ds.treatments.length > 0) && (
              <PSection title="Art direction" className="pp-break-before">
                {ad.relationships?.trim() && (
                  <>
                    <div className="ds-k">How the elements work together</div>
                    <div className="ds-callout" style={{ marginBottom: '10pt' }}>
                      {ad.relationships.trim()}
                    </div>
                  </>
                )}
                {has(ad.imagery) && (
                  <div style={{ marginBottom: '8pt' }}>
                    <div className="ds-group">Imagery</div>
                    <KVList
                      items={[
                        ['Subjects', ad.imagery.subjects],
                        ['Style', ad.imagery.style],
                        ['Lighting', ad.imagery.lighting],
                        ['Camera & angles', ad.imagery.camera],
                        ['Cropping', ad.imagery.cropping],
                        ['Realism', ad.imagery.realism],
                        ['People', ad.imagery.people],
                        ['Avoid', ad.imagery.avoid],
                      ]}
                    />
                  </div>
                )}
                {ad.composition?.trim() && (
                  <div style={{ marginBottom: '8pt' }}>
                    <div className="ds-group">Composition</div>
                    <Pre>{ad.composition.trim()}</Pre>
                  </div>
                )}
                {has(ad.colorBehavior) && (
                  <div style={{ marginBottom: '8pt' }}>
                    <div className="ds-group">Colour behaviour</div>
                    <KVList
                      items={[
                        ['Dominant', ad.colorBehavior.dominant],
                        ['Accents', ad.colorBehavior.accents],
                        ['Coverage', ad.colorBehavior.coverage],
                        ['Photo treatment', ad.colorBehavior.photoTreatment],
                        ['Backgrounds', ad.colorBehavior.backgrounds],
                        ['Light vs dark', ad.colorBehavior.lightDark],
                      ]}
                    />
                  </div>
                )}
                {ad.typographyInImages?.trim() && (
                  <div style={{ marginBottom: '8pt' }}>
                    <div className="ds-group">Typography in images</div>
                    <Pre>{ad.typographyInImages.trim()}</Pre>
                  </div>
                )}
              </PSection>
            )}
            {ds.treatments.length > 0 && (
              <PSection title="Signature treatments">
                <div className="ds-cards">
                  {ds.treatments.map((t) => {
                    const a = asset(t.exampleAssetId);
                    return (
                      <div key={t.id} className="ds-card">
                        {img(a) && (
                          <div className="ph" style={{ height: '1.1in' }}>
                            <img src={img(a)} alt="" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                          </div>
                        )}
                        <div className="b">
                          <div className="t">
                            {t.name} <Badge level={t.level} />
                          </div>
                          {t.description && <div className="p">{t.description}</div>}
                          <div style={{ marginTop: '3pt' }}>
                            <KVList items={[['Use', t.whereToUse], ['Avoid', t.avoid]]} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PSection>
            )}

            {/* ---------------- rules */}
            {ds.rules.some((r) => r.text.trim()) && (
              <PSection title="Rules" className="pp-break-before">
                {LEVELS.map((lv) => {
                  const list = ds.rules.filter((r) => r.level === lv && r.text.trim());
                  if (!list.length) return null;
                  const areas = [...new Set(list.map((r) => r.area))];
                  return (
                    <div key={lv} style={{ marginBottom: '10pt' }}>
                      <div className="ds-group">
                        <Badge level={lv} /> {lv === 'required' ? 'Never break these' : lv === 'preferred' ? 'The default' : 'Up to the maker'}
                      </div>
                      <div className="ds-rules">
                        {areas.map((a) => (
                          <div key={a} className="ds-area">
                            <div className="ds-k" style={{ marginTop: '4pt' }}>{AREA_LABEL(a)}</div>
                            {list
                              .filter((r) => r.area === a)
                              .map((r: DSRule) => (
                                <div key={r.id} className={`ds-rule ${r.kind}`}>
                                  {r.kind === 'do' ? <b>Do: </b> : r.kind === 'dont' ? <b>Don’t: </b> : null}
                                  {r.text.trim()}
                                  {r.why?.trim() && <span className="why"> — {r.why.trim()}</span>}
                                  {r.scope === 'campaign' && <div className="camp">Campaign only: {campaign(r.campaignId) ?? 'one campaign'}</div>}
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </PSection>
            )}

            {/* ---------------- references */}
            {ds.references.length > 0 && (
              <PSection title="References" right="each reference controls only what it says">
                <div className="ds-refs">
                  {(['on_brand', 'near_miss', 'off_brand'] as const).flatMap((v) =>
                    ds.references
                      .filter((r) => r.verdict === v)
                      .map((r) => {
                        const a = asset(r.assetId);
                        return (
                          <div key={r.id} className={`ds-ref ${r.verdict}`}>
                            <div className="ph">{img(a) && <img src={img(a)} alt="" />}</div>
                            <div className="b">
                              <span className={`ds-badge ds-v-${r.verdict}`}>{VERDICT[r.verdict]}</span>
                              <div className="t">{r.title || a?.name || 'Reference'}</div>
                              {r.roles.length > 0 && <div className="ds-roles">Controls: {r.roles.map((x) => `${x}`).join(', ')}</div>}
                              {r.borrow && (
                                <div>
                                  <b>Borrow:</b> {r.borrow}
                                </div>
                              )}
                              {r.ignore && (
                                <div>
                                  <b>Ignore:</b> {r.ignore}
                                </div>
                              )}
                              {r.why && <div className="pp-muted">{r.why}</div>}
                              {campaign(r.campaignId) && <div className="pp-muted">Campaign: {campaign(r.campaignId)}</div>}
                            </div>
                          </div>
                        );
                      }),
                  )}
                </div>
                <div className="pp-tiny pp-muted" style={{ marginTop: '6pt' }}>
                  {Object.entries(REFERENCE_ROLE_HINT)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </div>
              </PSection>
            )}

            {/* ---------------- formats */}
            {ds.formats.length > 0 && (
              <PSection title="Formats & production" className="pp-avoid">
                <div className="ds-formats">
                  {ds.formats
                    .filter((f) => f.width && f.height)
                    .slice(0, 8)
                    .map((f) => {
                      const k = 0.9 / Math.max(f.width!, f.height!);
                      return (
                        <div key={f.id} className="ds-format">
                          <div className="r" style={{ width: `${f.width! * k}in`, height: `${f.height! * k}in`, background: f.background && swatchOf(f.background) ? f.background : undefined }} />
                          <b>{f.name}</b>
                          <br />
                          {formatSize(f)}
                        </div>
                      );
                    })}
                </div>
                <PTable
                  zebra
                  rows={ds.formats}
                  columns={[
                    { header: 'Format', width: '18%', cell: (f) => <span className="pp-strong">{f.name}</span> },
                    { header: 'Size', width: '16%', cell: (f) => formatSize(f) },
                    { header: 'Safe area', width: '20%', cell: (f) => f.safeArea },
                    { header: 'Min. text', width: '10%', cell: (f) => f.minText },
                    { header: 'Background', width: '12%', cell: (f) => (f.transparent ? 'transparent' : f.background) },
                    { header: 'Notes', cell: (f) => [f.resolution, f.notes].filter(Boolean).join(' · ') },
                  ]}
                />
              </PSection>
            )}

            {/* ---------------- briefs */}
            {options.includeBriefs && ds.briefs.length > 0 && (
              <PSection title="Generation briefs" className="pp-break-before">
                {ds.briefs.map((b) => (
                  <div key={b.id} className="ds-brief">
                    <h3>{b.name || 'Brief'}</h3>
                    <div className="x">{compileBrief(s, b, { heading: false }).replace(/\*\*/g, '').replace(/^- /gm, '• ').trim()}</div>
                  </div>
                ))}
              </PSection>
            )}

            {/* ---------------- review */}
            {(ds.review.criteria.length > 0 || ds.review.finishing) && (
              <PSection title="Review & finishing" className="pp-avoid">
                {ds.review.criteria.map((c, i) => (
                  <div key={i} className="ds-check">
                    {c}
                  </div>
                ))}
                {ds.review.finishing?.trim() && (
                  <div style={{ marginTop: '8pt' }}>
                    <div className="ds-group">Finishing workflow</div>
                    <Pre>{ds.review.finishing.trim()}</Pre>
                  </div>
                )}
              </PSection>
            )}

            {/* ---------------- imported guidance */}
            {options.includeGuidance && docs.length > 0 && (
              <PSection title="Imported guidance" className="pp-break-before">
                <div className="pp-small pp-muted" style={{ marginBottom: '6pt' }}>
                  Verbatim documents from imported design-system files. Where they disagree with the pages above, the pages above win.
                </div>
                {docs.map((d, i) => (
                  <div key={i} className="ds-doc" style={{ marginBottom: '10pt' }}>
                    <div className="ds-group">
                      {d.title} <span className="pp-muted">({d.from} › {d.path})</span>
                    </div>
                    <Pre>{d.text.trim()}</Pre>
                  </div>
                ))}
              </PSection>
            )}

            {ready.missing.length > 0 && (
              <div className="pp-tiny pp-muted" style={{ marginTop: '14pt' }}>
                Not filled in yet: {ready.missing.join(' · ')}
              </div>
            )}
          </>
        ),
      };
    },
  },
];
