/* Print documents of the business sales sections: pipeline report, sales
   enablement kit, testimonials sheet and portfolio / case studies. */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { PBadge, PSection, PTable, Pre } from '@/print/components';
import { DEAL_ACTIVITY_KINDS, DEAL_STAGES, ENABLEMENT_CATEGORIES, PERIODS, PORTFOLIO_KINDS, RESOURCE_KINDS, TESTIMONIAL_PERMISSIONS, type PeriodId } from './constants';
import { bizOf, clientLabel, inRange, periodRange } from './derive';
import { dealContact, dealProbability, isOpenDeal, pipelineSummary, stageInfo, weightedValue } from './derive-work';
import type { BizResource, Deal, Testimonial } from './types';

/** The print center groups documents by group; 'Sales' must be listed in SpacePrintDocDef['group'] / SPACE_PRINT_GROUPS. */
const GROUP = 'Sales' as const;

const periodChoices = PERIODS.map((p) => ({ value: p.value, label: p.label }));
const optLabel = (opts: { value: string; label: string }[], v?: string) => opts.find((o) => o.value === v)?.label ?? v ?? '';
const catLabel = (id?: string) => ENABLEMENT_CATEGORIES.find((c) => c.value === (id || 'other'))?.label ?? id ?? 'Other';
const catColor = (id?: string) => ENABLEMENT_CATEGORIES.find((c) => c.value === (id || 'other'))?.color;

function ytThumb(url?: string) {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : '';
}

const SALES_CSS = `
.sl-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 6pt; }
.sl-kpi { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 6pt 8pt; }
.sl-kpi .k { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #777; }
.sl-kpi .v { font-size: 13pt; font-weight: 700; margin-top: 2pt; font-variant-numeric: tabular-nums; }
.sl-kpi .s { font-size: 7pt; color: #777; }
.sl-late { color: #c92a2a; font-weight: 700; }
.sl-bar { display: inline-block; height: 6pt; border-radius: 2pt; vertical-align: middle; }
.sl-res { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 7pt 9pt; margin: 0 0 7pt; break-inside: avoid; page-break-inside: avoid; }
.sl-res.long { break-inside: auto; page-break-inside: auto; }
.sl-res h3 { font-size: 10.5pt; margin: 0 0 2pt; }
.sl-res .d { color: #666; font-size: 8pt; margin-bottom: 4pt; }
.sl-res .u { font-size: 8.5pt; word-break: break-all; color: #2b4acb; }
.sl-res .t { font-size: 9pt; line-height: 1.5; white-space: pre-wrap; background: #f6f6f8; border-radius: 3pt; padding: 6pt 8pt; margin-top: 4pt; }
.sl-res .f { font-size: 8pt; color: #555; margin-top: 3pt; }
.sl-process { white-space: pre-wrap; font-size: 9.5pt; line-height: 1.5; }
.sl-offers td { vertical-align: top; }
.sl-quotes { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
.sl-q { border: 0.75pt solid #d4d4dc; border-radius: 5pt; padding: 9pt 11pt; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; gap: 6pt; }
.sl-q blockquote { margin: 0; font-size: 10pt; line-height: 1.5; font-style: italic; white-space: pre-wrap; }
.sl-q .who { display: flex; align-items: center; gap: 7pt; }
.sl-q .who img { width: 26pt; height: 26pt; border-radius: 50%; object-fit: cover; }
.sl-q .who b { display: block; font-size: 9pt; }
.sl-q .who span { display: block; font-size: 8pt; color: #666; }
.sl-q .meta { font-size: 7.5pt; color: #888; display: flex; gap: 6pt; align-items: center; }
.sl-stars { color: #f5a524; letter-spacing: 1pt; font-size: 9pt; }
.sl-pf { display: grid; grid-template-columns: 38% 1fr; gap: 12pt; padding: 10pt 0; border-bottom: 0.75pt solid #e2e2e8; break-inside: avoid; page-break-inside: avoid; }
.sl-pf:last-child { border-bottom: 0; }
.sl-pf .img { width: 100%; aspect-ratio: 16 / 9; border-radius: 4pt; overflow: hidden; background: #eee; }
.sl-pf .img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sl-pf .ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #999; font-size: 8pt; }
.sl-pf h3 { font-size: 12pt; margin: 0 0 2pt; }
.sl-pf .sub { color: #666; font-size: 8.5pt; margin-bottom: 5pt; }
.sl-pf .lbl { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-top: 5pt; }
.sl-pf .txt { font-size: 9pt; line-height: 1.5; white-space: pre-wrap; }
.sl-pf .u { font-size: 8.5pt; color: #2b4acb; word-break: break-all; margin-top: 5pt; }
`;

function Kpis({ items }: { items: { k: string; v: string; s?: string }[] }) {
  return (
    <div className="sl-kpis pp-avoid">
      {items.map((x, i) => (
        <div key={i} className="sl-kpi">
          <div className="k">{x.k}</div>
          <div className="v">{x.v}</div>
          {x.s && <div className="s">{x.s}</div>}
        </div>
      ))}
    </div>
  );
}

const money = (ctx: SpacePrintContext, n: number) => ctx.fmt.money(n, { cents: false });
const stars = (n?: number) => (n ? '★'.repeat(Math.max(0, Math.min(5, Math.round(n)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(n)))) : '');

export const salesPrintDocs: SpacePrintDocDef[] = [
  /* ---------------------------------------------------------------- pipeline */
  {
    id: 'space-biz-pipeline',
    title: 'Sales Pipeline Report',
    group: GROUP,
    kinds: ['business'],
    description: 'Open pipeline and weighted forecast by stage, open deals with next steps and follow-ups due, deals won and lost in a period',
    orientation: 'landscape',
    options: [
      { key: 'period', label: 'Won / lost in', type: 'select', default: 'ytd', choices: periodChoices },
      { key: 'activities', label: 'Latest activity per deal', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (bizOf(s).deals.length ? false : 'Add deals in Sales Pipeline first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const today = ctx.todayISO;
      const r = periodRange(ctx.options.period as PeriodId, today);
      const sum = pipelineSummary(b, today, r);
      const open = b.deals.filter(isOpenDeal).sort((a, z) => DEAL_STAGES.findIndex((s) => s.value === a.stage) - DEAL_STAGES.findIndex((s) => s.value === z.stage) || (a.nextStepDate ?? '9999').localeCompare(z.nextStepDate ?? '9999'));
      const closed = (st: 'won' | 'lost') => b.deals.filter((d) => d.stage === st && inRange(d.closedDate || d.createdAt, r)).sort((a, z) => (a.closedDate ?? '').localeCompare(z.closedDate ?? ''));
      const won = closed('won');
      const lost = closed('lost');
      const maxStage = Math.max(1, ...sum.byStage.map((s) => s.value));
      const lastAct = (d: Deal) => [...d.activities].sort((a, z) => z.date.localeCompare(a.date))[0];
      const offer = (d: Deal) => b.strategy.offers.find((o) => o.id === d.offerId)?.name ?? '';
      return {
        css: SALES_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Sales Pipeline" subtitle={`Won / lost: ${r.label}`} />
            <Kpis
              items={[
                { k: 'Open pipeline', v: money(ctx, sum.openValue), s: `${sum.openCount} open deals` },
                { k: 'Weighted forecast', v: money(ctx, sum.weighted), s: 'value × win chance' },
                { k: `Won · ${r.label}`, v: money(ctx, sum.wonValue), s: `${sum.wonCount} deals${sum.avgDealSize ? ` · avg ${money(ctx, sum.avgDealSize)}` : ''}` },
                { k: 'Win rate', v: sum.winRate == null ? '—' : `${Math.round(sum.winRate * 100)}%`, s: `${sum.wonCount} won · ${sum.lostCount} lost · ${sum.followUpsDue.length} follow-ups due` },
              ]}
            />
            <PSection title="By stage">
              <PTable
                rows={sum.byStage}
                columns={[
                  { header: 'Stage', width: '22%', cell: (s) => <PBadge color={s.color}>{s.label}</PBadge> },
                  { header: 'Deals', width: '10%', num: true, cell: (s) => s.count },
                  { header: 'Value', width: '16%', num: true, cell: (s) => money(ctx, s.value) },
                  { header: 'Win chance', width: '12%', num: true, cell: (s) => `${stageInfo(s.stage).probability}%` },
                  { header: '', cell: (s) => <span className="sl-bar" style={{ width: `${Math.round((s.value / maxStage) * 100)}%`, background: s.color }} /> },
                ]}
              />
            </PSection>
            {sum.followUpsDue.length > 0 && (
              <PSection title="Follow-ups due" right={`${sum.followUpsDue.length}`} className="pp-avoid">
                <PTable
                  rows={sum.followUpsDue}
                  columns={[
                    { header: 'Date', width: '11%', cell: (d) => <span className={d.nextStepDate! < today ? 'sl-late' : ''}>{ctx.fmt.date(d.nextStepDate!)}</span> },
                    { header: 'Deal', width: '28%', cell: (d) => <b>{d.title}</b> },
                    { header: 'Contact', width: '24%', cell: (d) => dealContact(b, d) },
                    { header: 'Next step', cell: (d) => d.nextStep ?? '' },
                  ]}
                />
              </PSection>
            )}
            <PSection title="Open deals" right={`${open.length} · ${money(ctx, sum.openValue)}`}>
              <PTable
                zebra
                rows={open}
                empty="No open deals."
                groupBy={(d) => stageInfo(d.stage).label}
                groupLabel={(g, gr) => `${g} · ${gr.length} · ${money(ctx, gr.reduce((n, d) => n + (d.value ?? 0), 0))}`}
                columns={[
                  { header: 'Deal', width: '19%', cell: (d) => <b>{d.title || 'Untitled'}</b> },
                  { header: 'Contact', width: '16%', cell: (d) => dealContact(b, d) },
                  { header: 'Source / offer', width: '12%', cell: (d) => [d.source, offer(d)].filter(Boolean).join(' · ') },
                  { header: 'Value', width: '9%', num: true, cell: (d) => (d.value != null ? money(ctx, d.value) : '') },
                  { header: '%', width: '5%', num: true, cell: (d) => dealProbability(d) },
                  { header: 'Weighted', width: '9%', num: true, cell: (d) => (d.value != null ? money(ctx, weightedValue(d)) : '') },
                  { header: 'Next step', cell: (d) => (
                      <>
                        {d.nextStep ?? ''}
                        {d.nextStepDate && <span className={d.nextStepDate < today ? 'sl-late' : 'pp-muted'}> · {ctx.fmt.dateShort(d.nextStepDate)}</span>}
                        {ctx.options.activities && lastAct(d) && (
                          <div className="pp-muted pp-small">
                            Last: {optLabel(DEAL_ACTIVITY_KINDS, lastAct(d)!.kind)} {ctx.fmt.dateShort(lastAct(d)!.date)} — {lastAct(d)!.text}
                          </div>
                        )}
                      </>
                    ) },
                  { header: 'Close', width: '8%', cell: (d) => (d.expectedClose ? ctx.fmt.dateShort(d.expectedClose) : '') },
                ]}
                footer={['Total', '', '', money(ctx, sum.openValue), '', money(ctx, sum.weighted), '', '']}
              />
            </PSection>
            <div className="pp-avoid">
              <PSection title={`Won · ${r.label}`} right={money(ctx, sum.wonValue)}>
                <PTable
                  rows={won}
                  empty="No deals won in this period."
                  columns={[
                    { header: 'Won on', width: '11%', cell: (d) => (d.closedDate ? ctx.fmt.date(d.closedDate) : '') },
                    { header: 'Deal', cell: (d) => <b>{d.title}</b> },
                    { header: 'Client', width: '24%', cell: (d) => dealContact(b, d) },
                    { header: 'Source', width: '13%', cell: (d) => d.source ?? '' },
                    { header: 'Project', width: '18%', cell: (d) => b.projects.find((p) => p.id === d.bizProjectId)?.name ?? '' },
                    { header: 'Value', width: '11%', num: true, cell: (d) => (d.value != null ? money(ctx, d.value) : '') },
                  ]}
                />
              </PSection>
            </div>
            <div className="pp-avoid">
              <PSection title={`Lost · ${r.label}`} right={String(lost.length)}>
                <PTable
                  rows={lost}
                  empty="No deals lost in this period."
                  columns={[
                    { header: 'Lost on', width: '11%', cell: (d) => (d.closedDate ? ctx.fmt.date(d.closedDate) : '') },
                    { header: 'Deal', width: '26%', cell: (d) => <b>{d.title}</b> },
                    { header: 'Contact', width: '20%', cell: (d) => dealContact(b, d) },
                    { header: 'Reason', cell: (d) => d.lostReason ?? '' },
                    { header: 'Value', width: '11%', num: true, cell: (d) => (d.value != null ? money(ctx, d.value) : '') },
                  ]}
                />
              </PSection>
            </div>
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- sales kit */
  {
    id: 'space-biz-sales-kit',
    title: 'Sales Enablement Kit',
    group: GROUP,
    kinds: ['business'],
    description: 'Your sales process, offers and every sales resource — email templates, call scripts, objection handling and FAQs printed in full, plus files and links',
    options: [
      { key: 'category', label: 'Category', type: 'select', default: '', choices: [{ value: '', label: 'All categories' }, ...ENABLEMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))] },
      { key: 'process', label: 'Sales process and offers', type: 'boolean', default: true },
      { key: 'proof', label: 'Featured testimonials and work', type: 'boolean', default: true },
    ],
    emptyReason: (s) => {
      const b = bizOf(s);
      return b.resources.some((r) => r.section === 'enablement') || b.strategy.salesProcess ? false : 'Add resources in Sales Enablement first';
    },
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const cat = String(ctx.options.category ?? '');
      const list = b.resources.filter((r) => r.section === 'enablement' && (!cat || (r.category || 'other') === cat));
      const order = ENABLEMENT_CATEGORIES.map((c) => c.value);
      const cats = [...new Set([...order, ...list.map((r) => r.category || 'other')])].filter((c) => list.some((r) => (r.category || 'other') === c));
      const offers = b.strategy.offers.filter((o) => o.active);
      const process = b.strategy.salesProcess?.trim();
      const showProcess = !!ctx.options.process && !cat;
      const featuredT = b.testimonials.filter((t) => t.featured && t.permission === 'granted');
      const featuredP = b.portfolio.filter((p) => p.featured);
      const showProof = !!ctx.options.proof && !cat && (featuredT.length > 0 || featuredP.length > 0);
      const Res = ({ r }: { r: BizResource }) => (
        <div className={`sl-res ${(r.text ?? '').length > 1500 ? 'long' : ''}`}>
          <h3>
            {r.title || 'Untitled'} {r.pinned ? '★' : ''}
          </h3>
          <div className="d">
            {optLabel(RESOURCE_KINDS, r.kind)}
            {r.description ? ` · ${r.description}` : ''}
            {r.tags?.length ? ` · ${r.tags.map((t) => `#${t}`).join(' ')}` : ''}
          </div>
          {r.url && <div className="u">{r.url}</div>}
          {r.kind === 'text' && r.text?.trim() && <div className="t">{r.text.trim()}</div>}
          {(r.files ?? []).length > 0 && <div className="f">Files: {(r.files ?? []).map((f) => f.fileName).join(' · ')}</div>}
        </div>
      );
      return {
        css: SALES_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Sales Enablement Kit" subtitle={cat ? catLabel(cat) : `${list.length} resources`} />
            {showProcess && process && (
              <PSection title="Sales process">
                <div className="sl-process">{process}</div>
              </PSection>
            )}
            {showProcess && offers.length > 0 && (
              <PSection title="Offers" className="pp-avoid">
                <PTable
                  className="sl-offers"
                  rows={offers}
                  columns={[
                    { header: 'Offer', width: '26%', cell: (o) => <b>{o.name}</b> },
                    { header: 'What it is', cell: (o) => <Pre>{o.description ?? ''}</Pre> },
                    { header: 'Ideal for', width: '22%', cell: (o) => o.idealFor ?? '' },
                    { header: 'Price', width: '16%', num: true, cell: (o) => (o.price != null ? `${money(ctx, o.price)}${o.priceNote ? ` ${o.priceNote}` : ''}` : o.priceNote ?? '') },
                  ]}
                />
              </PSection>
            )}
            {list.length === 0 && <p className="pp-muted">{cat ? `No resources in ${catLabel(cat)}.` : 'No sales enablement resources yet.'}</p>}
            {cats.map((c) => (
              <PSection key={c} title={<span><span className="sl-bar" style={{ width: '6pt', background: catColor(c), marginRight: '5pt' }} />{catLabel(c)}</span>} right={String(list.filter((r) => (r.category || 'other') === c).length)}>
                {list
                  .filter((r) => (r.category || 'other') === c)
                  .sort((a, z) => Number(!!z.pinned) - Number(!!a.pinned) || a.title.localeCompare(z.title))
                  .map((r) => (
                    <Res key={r.id} r={r} />
                  ))}
              </PSection>
            ))}
            {showProof && (
              <PSection title="Proof">
                {featuredP.length > 0 && (
                  <PTable
                    rows={featuredP}
                    columns={[
                      { header: 'Work', width: '34%', cell: (p) => <b>{p.title}</b> },
                      { header: 'Client', width: '22%', cell: (p) => clientLabel(b, p.clientId) },
                      { header: 'Link', cell: (p) => <span style={{ wordBreak: 'break-all' }}>{p.url ?? ''}</span> },
                    ]}
                  />
                )}
                {featuredT.length > 0 && (
                  <div className="sl-quotes" style={{ marginTop: '8pt' }}>
                    {featuredT.map((t) => (
                      <Quote key={t.id} ctx={ctx} t={t} />
                    ))}
                  </div>
                )}
              </PSection>
            )}
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- testimonials */
  {
    id: 'space-biz-testimonials',
    title: 'Testimonials',
    group: GROUP,
    kinds: ['business'],
    description: 'Client testimonials with ratings, names and photos — for proposals, pitch decks and your website',
    options: [
      { key: 'onlyApproved', label: 'Only testimonials OK to use publicly', type: 'boolean', default: true, hint: 'Turn off for an internal list including ones without permission' },
      { key: 'featuredOnly', label: 'Featured only', type: 'boolean', default: false },
      { key: 'photos', label: 'Photos', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (bizOf(s).testimonials.length ? false : 'Add testimonials first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const approved = !!ctx.options.onlyApproved;
      const list = b.testimonials
        .filter((t) => t.quote.trim() && (!approved || t.permission === 'granted') && (!ctx.options.featuredOnly || t.featured))
        .sort((a, z) => Number(!!z.featured) - Number(!!a.featured) || (z.rating ?? 0) - (a.rating ?? 0) || (z.date ?? '').localeCompare(a.date ?? ''));
      const rated = list.filter((t) => t.rating);
      const avg = rated.length ? rated.reduce((n, t) => n + (t.rating ?? 0), 0) / rated.length : null;
      return {
        css: SALES_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="What clients say" subtitle={[`${list.length} testimonials`, avg ? `★ ${avg.toFixed(1)} average` : ''].filter(Boolean).join(' · ')} />
            {list.length === 0 ? (
              <p className="pp-muted">{approved ? 'No testimonials with permission to use them publicly yet — turn off “Only testimonials OK to use publicly” for an internal list.' : 'No testimonials yet.'}</p>
            ) : (
              <div className="sl-quotes">
                {list.map((t) => (
                  <Quote key={t.id} ctx={ctx} t={t} internal={!approved} />
                ))}
              </div>
            )}
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- portfolio */
  {
    id: 'space-biz-portfolio',
    title: 'Portfolio & Case Studies',
    group: GROUP,
    kinds: ['business'],
    description: 'Showreel, work samples and case studies with stills, client, your role, results and links',
    options: [
      { key: 'kind', label: 'Kind', type: 'select', default: '', choices: [{ value: '', label: 'All kinds' }, ...PORTFOLIO_KINDS.map((k) => ({ value: k.value, label: k.label }))] },
      { key: 'featuredOnly', label: 'Featured only', type: 'boolean', default: false },
      { key: 'results', label: 'Description and results', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (bizOf(s).portfolio.length ? false : 'Add work in Portfolio & Reels first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const kind = String(ctx.options.kind ?? '');
      const list = b.portfolio
        .filter((x) => (!kind || x.kind === kind) && (!ctx.options.featuredOnly || x.featured))
        .sort((a, z) => Number(z.kind === 'showreel') - Number(a.kind === 'showreel') || Number(!!z.featured) - Number(!!a.featured) || (z.date ?? '').localeCompare(a.date ?? ''));
      const p = b.profile;
      return {
        css: SALES_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title={kind === 'case_study' ? 'Case Studies' : 'Portfolio'} subtitle={[p.website, p.email].filter(Boolean).join(' · ') || `${list.length} pieces`} />
            {list.length === 0 && <p className="pp-muted">Nothing to show with these options.</p>}
            {list.map((x) => {
              const img = x.image ? ctx.asset(x.image) : ytThumb(x.url);
              const client = clientLabel(b, x.clientId);
              return (
                <div key={x.id} className="sl-pf">
                  <div className="img">{img ? <img src={img} alt="" /> : <div className="ph">{optLabel(PORTFOLIO_KINDS, x.kind)}</div>}</div>
                  <div>
                    <h3>{x.title || 'Untitled'}</h3>
                    <div className="sub">{[optLabel(PORTFOLIO_KINDS, x.kind), client, x.date ? ctx.fmt.dateMedium(x.date) : '', x.role].filter(Boolean).join(' · ')}</div>
                    {ctx.options.results && x.description && <div className="txt">{x.description}</div>}
                    {ctx.options.results && x.results && (
                      <>
                        <div className="lbl">Results</div>
                        <div className="txt">{x.results}</div>
                      </>
                    )}
                    {x.url && <div className="u">{x.url}</div>}
                  </div>
                </div>
              );
            })}
          </>
        ),
      };
    },
  },
];

function Quote({ ctx, t, internal }: { ctx: SpacePrintContext; t: Testimonial; internal?: boolean }) {
  const b = bizOf(ctx.space);
  const photo = ctx.options.photos !== false && t.photo ? ctx.asset(t.photo) : '';
  const project = t.bizProjectId ? b.projects.find((p) => p.id === t.bizProjectId)?.name : '';
  return (
    <div className="sl-q">
      {t.rating ? <div className="sl-stars">{stars(t.rating)}</div> : null}
      <blockquote>“{t.quote.trim()}”</blockquote>
      <div className="who">
        {photo && <img src={photo} alt="" />}
        <div>
          <b>{t.author}</b>
          <span>{[t.role, t.company].filter(Boolean).join(', ')}</span>
        </div>
      </div>
      {(internal || project) && (
        <div className="meta">
          {internal && <PBadge color={TESTIMONIAL_PERMISSIONS.find((p) => p.value === t.permission)?.color}>{optLabel(TESTIMONIAL_PERMISSIONS, t.permission)}</PBadge>}
          {project && <span>{project}</span>}
          {internal && t.source && <span>{t.source}</span>}
          {internal && t.date && <span>{ctx.fmt.dateShort(t.date)}</span>}
        </div>
      )}
    </div>
  );
}
