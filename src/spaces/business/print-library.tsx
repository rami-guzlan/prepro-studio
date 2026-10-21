/* Print documents of the business library sections: business plan (Strategy),
   growth initiatives report, SOP manual and resource index. */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Check, KV, PBadge, PSection, PTable, Pre } from '@/print/components';
import { BUSINESS_TYPES, ENABLEMENT_CATEGORIES, GOAL_METRICS, LIBRARY_CATEGORIES, RESOURCE_KINDS, SOP_KINDS } from './constants';
import { bizOf } from './derive';
import { goalProgress, initiativeProgress, initiativeStatusInfo } from './derive-work';
import type { BizResource, BusinessData, Initiative, Sop } from './types';
import { STRATEGY_TEXT_FIELDS, goalValue } from './modules/strategy/ops';
import { isOnTrack } from './modules/growth/ops';
import { findSop } from './modules/sops/ops';

const CSS = `
.bl-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 6pt; }
.bl-kpi { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 6pt 8pt; }
.bl-kpi .k { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #777; }
.bl-kpi .v { font-size: 13pt; font-weight: 700; margin-top: 2pt; font-variant-numeric: tabular-nums; }
.bl-kpi .s { font-size: 7pt; color: #777; }
.bl-plan { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt 16pt; }
.bl-plan .wide { grid-column: 1 / -1; }
.bl-plan h3, .bl-h { font-size: 7.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pp-accent, #555); margin: 0 0 2pt; }
.bl-lead { font-size: 11pt; line-height: 1.45; font-weight: 600; }
.bl-offers { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
.bl-offer { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 7pt 9pt; break-inside: avoid; page-break-inside: avoid; }
.bl-offer .t { display: flex; justify-content: space-between; gap: 8pt; font-weight: 700; font-size: 10pt; }
.bl-offer .p { font-variant-numeric: tabular-nums; white-space: nowrap; }
.bl-offer .n { color: #777; font-weight: 500; font-size: 8pt; }
.bl-offer .d { color: #444; margin-top: 3pt; white-space: pre-wrap; }
.bl-offer .f { color: #777; font-size: 8pt; margin-top: 3pt; }
.bl-bar { position: relative; height: 5pt; border-radius: 3pt; background: #e9e9ef; overflow: hidden; min-width: 60pt; }
.bl-bar span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3pt; background: var(--pp-accent, #4c6ef5); }
.bl-bar.good span { background: #2fb36d; }
.bl-bar.bad span { background: #e03131; }
.bl-swot { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
.bl-swot > div { border: 0.75pt solid #d4d4dc; border-top: 2.5pt solid var(--c); border-radius: 4pt; padding: 6pt 8pt; min-height: 60pt; break-inside: avoid; page-break-inside: avoid; }
.bl-swot b { color: var(--c); font-size: 7.4pt; text-transform: uppercase; letter-spacing: 0.06em; }
.bl-prio { display: flex; gap: 6pt; align-items: baseline; padding: 1.5pt 0; }
.bl-prio.done span { color: #888; text-decoration: line-through; }
.bl-init { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 8pt 10pt; margin-bottom: 9pt; break-inside: avoid; page-break-inside: avoid; }
.bl-init-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; }
.bl-init-head h2 { font-size: 11.5pt; margin: 0; }
.bl-init-sub { color: #666; font-size: 8pt; margin: 2pt 0 6pt; }
.bl-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 16pt; }
.bl-num { font-variant-numeric: tabular-nums; }
.bl-steps { margin: 2pt 0 0; padding: 0; list-style: none; }
.bl-steps li { display: flex; gap: 5pt; align-items: baseline; padding: 1pt 0; }
.bl-sop { margin-bottom: 14pt; }
.bl-sop h2 { font-size: 13pt; margin: 0 0 2pt; }
.bl-sop-meta { color: #666; font-size: 8pt; margin-bottom: 6pt; }
.bl-sop ol { margin: 0; padding: 0; list-style: none; counter-reset: s; }
.bl-sop li { display: grid; grid-template-columns: 18pt 1fr; gap: 2pt 6pt; padding: 4pt 0; border-bottom: 0.5pt solid #ececf1; break-inside: avoid; page-break-inside: avoid; }
.bl-sop li .n { font-weight: 700; color: var(--pp-accent, #444); font-variant-numeric: tabular-nums; }
.bl-sop li .x { grid-column: 2; color: #555; font-size: 8.5pt; white-space: pre-wrap; }
.bl-sop .box { display: inline-block; width: 8pt; height: 8pt; border: 0.8pt solid #888; border-radius: 1.5pt; vertical-align: -1pt; margin-right: 4pt; }
.bl-toc { columns: 2; column-gap: 18pt; margin-bottom: 8pt; }
.bl-toc div { break-inside: avoid; padding: 1pt 0; }
.bl-res { padding: 5pt 0; border-bottom: 0.5pt solid #ececf1; break-inside: avoid; page-break-inside: avoid; }
.bl-res .t { display: flex; justify-content: space-between; gap: 10pt; font-weight: 700; }
.bl-res .m { color: #666; font-size: 8pt; overflow-wrap: anywhere; }
.bl-res .txt { margin-top: 4pt; padding: 6pt 8pt; background: #f6f6f9; border-radius: 3pt; white-space: pre-wrap; font-size: 8.5pt; }
`;

function Kpis({ items }: { items: { k: string; v: string; s?: string }[] }) {
  return (
    <div className="bl-kpis pp-avoid">
      {items.map((x, i) => (
        <div key={i} className="bl-kpi">
          <div className="k">{x.k}</div>
          <div className="v">{x.v}</div>
          {x.s && <div className="s">{x.s}</div>}
        </div>
      ))}
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone?: 'good' | 'bad' }) {
  return (
    <div className={`bl-bar ${tone ?? ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
    </div>
  );
}

const kpiNum = (n: number | undefined) => (n == null ? '—' : String(Math.round(n * 100) / 100));
const money = (ctx: SpacePrintContext, n: number) => ctx.fmt.money(n);

/* ---------------------------------------------------------------- business plan */

const SWOT = [
  { key: 'strengths', label: 'Strengths', color: '#2fb36d' },
  { key: 'weaknesses', label: 'Weaknesses', color: '#e8590c' },
  { key: 'opportunities', label: 'Opportunities', color: '#4c6ef5' },
  { key: 'threats', label: 'Threats', color: '#e03131' },
] as const;

function strategyEmpty(b: BusinessData) {
  const st = b.strategy;
  return !STRATEGY_TEXT_FIELDS.some((f) => String(st[f.key] ?? '').trim()) && !st.offers.length && !st.goals.length && !st.priorities.length && !st.competitors.length && !Object.values(st.swot).some((x) => x?.trim());
}

function StrategyBody({ ctx }: { ctx: SpacePrintContext }) {
  const b = bizOf(ctx.space);
  const st = b.strategy;
  const p = b.profile;
  const m = (n: number) => ctx.fmt.money(n, { cents: false });
  const goals = st.goals.map((g) => ({ g, pr: goalProgress(b, g, ctx.todayISO) }));
  const fields = STRATEGY_TEXT_FIELDS.filter((f) => String(st[f.key] ?? '').trim());
  const lead = fields.filter((f) => f.key === 'mission' || f.key === 'vision' || f.key === 'positioning');
  const rest = fields.filter((f) => !lead.includes(f));
  const showPriorities = ctx.options.priorities !== false;
  const quarterGroups = [...new Set(st.priorities.map((x) => x.quarter || 'No quarter'))].sort().reverse();
  return (
    <>
      <SpaceDocHeader ctx={ctx} title="Business Plan" subtitle={p.legalName || undefined} />
      <KV
        cols={4}
        items={[
          ['Type', BUSINESS_TYPES.find((t) => t.value === p.type)?.label],
          ['Entity', p.entityType],
          ['Owner', [p.ownerName, p.signerTitle].filter(Boolean).join(', ')],
          ['Location', p.jurisdiction],
          ['Website', p.website],
          ['Email', p.email],
          ['Phone', p.phone],
        ]}
      />
      {lead.length > 0 && (
        <PSection>
          <div className="bl-plan">
            {lead.map((f) => (
              <div key={f.key} className={f.key === 'positioning' ? 'wide' : undefined}>
                <h3>{f.label}</h3>
                <div className={f.key === 'mission' ? 'bl-lead' : undefined}>
                  <Pre>{String(st[f.key])}</Pre>
                </div>
              </div>
            ))}
          </div>
        </PSection>
      )}
      {rest.length > 0 && (
        <PSection title="Plan">
          <div className="bl-plan">
            {rest.map((f) => (
              <div key={f.key}>
                <h3>{f.label}</h3>
                <Pre>{String(st[f.key])}</Pre>
              </div>
            ))}
          </div>
        </PSection>
      )}
      {st.offers.length > 0 && (
        <PSection title="Offers & services">
          <div className="bl-offers">
            {st.offers
              .filter((o) => o.active || ctx.options.inactiveOffers)
              .map((o) => (
                <div key={o.id} className="bl-offer">
                  <div className="t">
                    <span>
                      {o.name || 'Untitled'}
                      {!o.active && <span className="n"> (inactive)</span>}
                    </span>
                    {o.price != null && (
                      <span className="p">
                        {o.priceNote && /^from$/i.test(o.priceNote.trim()) ? <span className="n">from </span> : null}
                        {money(ctx, o.price)}
                        {o.priceNote && !/^from$/i.test(o.priceNote.trim()) ? <span className="n"> {o.priceNote}</span> : null}
                      </span>
                    )}
                  </div>
                  {o.description && <div className="d">{o.description}</div>}
                  {o.idealFor && <div className="f">Ideal for: {o.idealFor}</div>}
                </div>
              ))}
          </div>
        </PSection>
      )}
      {goals.length > 0 && (
        <PSection title="Goals">
          <PTable
            zebra
            rows={goals}
            columns={[
              { header: 'Goal', cell: ({ g }) => <b>{g.title || 'Untitled'}</b> },
              { header: 'Measured by', width: '18%', cell: ({ g, pr }) => [GOAL_METRICS.find((x) => x.value === g.metric)?.label, pr.periodLabel].filter(Boolean).join(' · ') },
              { header: 'Current', width: '12%', num: true, cell: ({ g, pr }) => goalValue(g.metric, pr.current, m) },
              { header: 'Target', width: '12%', num: true, cell: ({ g }) => goalValue(g.metric, g.target, m) },
              { header: 'Progress', width: '16%', cell: ({ g, pr }) => (pr.pct != null ? <div className="pp-row" style={{ gap: 5, alignItems: 'center' }}><Bar pct={pr.pct} tone={g.done || pr.pct >= 1 ? 'good' : undefined} /><span className="bl-num">{Math.round(pr.pct * 100)}%</span></div> : '') },
              { header: 'Due', width: '10%', cell: ({ g }) => (g.done ? 'Reached' : ctx.fmt.date(g.due)) },
            ]}
          />
        </PSection>
      )}
      {showPriorities && st.priorities.length > 0 && (
        <PSection title="Quarterly priorities">
          <div className="bl-cols">
            {quarterGroups.map((q) => (
              <div key={q} className="pp-avoid">
                <div className="bl-h">{q}</div>
                {st.priorities
                  .filter((x) => (x.quarter || 'No quarter') === q)
                  .map((x) => (
                    <div key={x.id} className={`bl-prio ${x.done ? 'done' : ''}`}>
                      <Check on={x.done} />
                      <span>{x.text}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </PSection>
      )}
      {Object.values(st.swot).some((x) => x?.trim()) && (
        <PSection title="SWOT">
          <div className="bl-swot">
            {SWOT.map((x) => (
              <div key={x.key} style={{ ['--c' as string]: x.color }}>
                <b>{x.label}</b>
                <Pre>{st.swot[x.key] || ' '}</Pre>
              </div>
            ))}
          </div>
        </PSection>
      )}
      {st.competitors.length > 0 && (
        <PSection title="Competitors">
          <PTable
            zebra
            rows={st.competitors}
            columns={[
              { header: 'Competitor', width: '18%', cell: (c) => (<><b>{c.name}</b>{c.url && <div className="pp-small pp-muted">{c.url}</div>}</>) },
              { header: 'Strengths', cell: (c) => <Pre>{c.strengths}</Pre> },
              { header: 'Weaknesses', cell: (c) => <Pre>{c.weaknesses}</Pre> },
              { header: 'Notes', cell: (c) => <Pre>{c.notes}</Pre> },
            ]}
          />
        </PSection>
      )}
      {st.notes?.trim() && (
        <PSection title="Notes">
          <Pre>{st.notes}</Pre>
        </PSection>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- growth */

function InitiativeBlock({ ctx, b, i, updates }: { ctx: SpacePrintContext; b: BusinessData; i: Initiative; updates: number }) {
  const pr = initiativeProgress(b, i, ctx.todayISO);
  const st = initiativeStatusInfo(i.status);
  const goal = b.strategy.goals.find((g) => g.id === i.goalId);
  const exps = b.expenses.filter((e) => e.initiativeId === i.id);
  const recent = [...i.updates].sort((a, z) => z.date.localeCompare(a.date)).slice(0, updates);
  const on = isOnTrack(i, pr, ctx.todayISO);
  return (
    <div className="bl-init">
      <div className="bl-init-head">
        <h2>{i.title || 'Untitled'}</h2>
        <span>
          <PBadge color={st.color}>{st.label}</PBadge>
          {i.status === 'in_progress' && <span className="pp-small" style={{ marginLeft: 5, color: on ? '#1e8a4c' : '#c77700' }}>{on ? 'On track' : pr.overdue ? 'Overdue' : 'Behind'}</span>}
        </span>
      </div>
      <div className="bl-init-sub">
        {[i.area, i.owner && `Owner: ${i.owner}`, goal && `Goal: ${goal.title}`, (i.startDate || i.dueDate) && `${ctx.fmt.dateMedium(i.startDate) || '…'} – ${ctx.fmt.dateMedium(i.dueDate) || '…'}`, i.impact && i.effort && `Impact ${i.impact}/5 · Effort ${i.effort}/5`].filter(Boolean).join(' · ')}
      </div>
      {i.hypothesis && (
        <div style={{ marginBottom: '5pt' }}>
          <span className="bl-h">Hypothesis </span>
          <Pre>{i.hypothesis}</Pre>
        </div>
      )}
      <div className="bl-cols">
        <div>
          <div className="bl-h">{i.kpi || 'KPI'}</div>
          <div className="bl-num">
            Baseline {kpiNum(i.baseline)} · Current <b>{kpiNum(pr.current)}</b> · Target {kpiNum(i.target)}
          </div>
          {pr.pct != null && (
            <div className="pp-row" style={{ gap: 5, alignItems: 'center', marginTop: '2pt' }}>
              <Bar pct={pr.pct} tone={pr.pct >= 1 ? 'good' : undefined} />
              <span className="bl-num">{Math.round(pr.pct * 100)}%</span>
            </div>
          )}
        </div>
        <div>
          <div className="bl-h">Spend vs budget</div>
          <div className="bl-num">
            <b>{money(ctx, pr.spent)}</b>
            {i.budget ? ` of ${money(ctx, i.budget)}` : ' (no budget)'}
            {exps.length ? <span className="pp-muted"> · {exps.length} expense{exps.length === 1 ? '' : 's'}</span> : null}
          </div>
          {i.budget ? <div style={{ marginTop: '2pt' }}><Bar pct={pr.spent / i.budget} tone={pr.spent > i.budget ? 'bad' : undefined} /></div> : null}
        </div>
      </div>
      {(i.steps.length > 0 || recent.length > 0) && (
        <div className="bl-cols" style={{ marginTop: '6pt' }}>
          <div>
            {i.steps.length > 0 && (
              <>
                <div className="bl-h">
                  Steps {pr.stepsDone}/{pr.stepsTotal}
                </div>
                <ul className="bl-steps">
                  {i.steps.map((s) => (
                    <li key={s.id}>
                      <Check on={s.done} />
                      <span>
                        {s.title}
                        {s.due && <span className="pp-muted"> · {ctx.fmt.dateShort(s.due)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            {recent.length > 0 && (
              <>
                <div className="bl-h">Recent check-ins</div>
                {recent.map((u) => (
                  <div key={u.id} className="pp-small" style={{ padding: '1pt 0' }}>
                    <b>{ctx.fmt.dateShort(u.date)}</b>
                    {u.value != null && <span className="bl-num"> · {kpiNum(u.value)}</span>}
                    {u.note && <span> — {u.note}</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      {i.results && (
        <div style={{ marginTop: '6pt' }}>
          <div className="bl-h">Results & learnings</div>
          <Pre>{i.results}</Pre>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- SOPs */

function SopBlock({ ctx, b, s, checkboxes, hideTitle }: { ctx: SpacePrintContext; b: BusinessData; s: Sop; checkboxes: boolean; hideTitle?: boolean }) {
  const kind = SOP_KINDS.find((k) => k.value === s.kind);
  const res = s.resourceIds.map((id) => b.resources.find((r) => r.id === id)).filter(Boolean) as BizResource[];
  return (
    <div className="bl-sop">
      {!hideTitle && <h2>{s.title || 'Untitled'}</h2>}
      <div className="bl-sop-meta">
        <PBadge color={kind?.color}>{kind?.label ?? s.kind}</PBadge> {[s.category, s.trigger && `When: ${s.trigger}`, s.owner && `Owner: ${s.owner}`, s.frequency && `How often: ${s.frequency}`, s.updatedAt && `Updated ${ctx.fmt.dateMedium(s.updatedAt)}`].filter(Boolean).join(' · ')}
      </div>
      {s.steps.length === 0 ? (
        <p className="pp-muted">No steps yet.</p>
      ) : (
        <ol>
          {s.steps.map((st, i) => (
            <li key={st.id}>
              <span className="n">{i + 1}.</span>
              <span>
                {checkboxes && <span className="box" />}
                {st.text}
              </span>
              {st.detail?.trim() && <span className="x">{st.detail.trim()}</span>}
            </li>
          ))}
        </ol>
      )}
      {res.length > 0 && (
        <div style={{ marginTop: '5pt' }} className="pp-small">
          <b>Resources: </b>
          {res.map((r) => `${r.title}${r.kind === 'link' && r.url ? ` (${r.url})` : ''}`).join(' · ')}
        </div>
      )}
      {s.notes?.trim() && (
        <div style={{ marginTop: '5pt' }}>
          <div className="bl-h">Notes</div>
          <Pre>{s.notes}</Pre>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- resources */

function catLabel(r: BizResource) {
  const list = r.section === 'enablement' ? ENABLEMENT_CATEGORIES : LIBRARY_CATEGORIES;
  return list.find((c) => c.value === r.category)?.label ?? (r.category || 'Other');
}

/* ---------------------------------------------------------------- docs */

export const libraryPrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-biz-strategy',
    title: 'Business Plan',
    group: 'Strategy',
    kinds: ['business'],
    description: 'One-page business plan: profile, mission, vision, positioning, ideal client, pricing, marketing and sales; offers with prices, goals with progress, quarterly priorities, SWOT and competitors',
    options: [
      { key: 'priorities', label: 'Quarterly priorities', type: 'boolean', default: true },
      { key: 'inactiveOffers', label: 'Include inactive offers', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (strategyEmpty(bizOf(s)) ? 'Fill in the Strategy page first (mission, offers, goals …)' : false),
    render: (ctx) => ({ css: CSS, body: <StrategyBody ctx={ctx} /> }),
  },
  {
    id: 'space-biz-growth',
    title: 'Growth Initiatives Report',
    group: 'Strategy',
    kinds: ['business'],
    description: 'Every growth initiative with its KPI (baseline, current, target), spend vs budget, steps, recent check-ins and learnings',
    options: [
      { key: 'includeDone', label: 'Include done & dropped', type: 'boolean', default: false },
      { key: 'initiative', label: 'Initiative', type: 'text', default: '', hint: 'title or id — empty = all' },
      { key: 'updates', label: 'Check-ins per initiative', type: 'number', default: 4, min: 0, max: 20 },
    ],
    emptyReason: (s) => (bizOf(s).initiatives.length ? false : 'Add an initiative in Growth first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const ref = String(ctx.options.initiative ?? '').trim().toLowerCase();
      const order = ['in_progress', 'planned', 'paused', 'idea', 'done', 'dropped'];
      const list = b.initiatives
        .filter((i) => (ref ? i.id === ctx.options.initiative || i.title.toLowerCase().includes(ref) : ctx.options.includeDone || (i.status !== 'done' && i.status !== 'dropped')))
        .sort((a, z) => order.indexOf(a.status) - order.indexOf(z.status) || (a.dueDate ?? '9999').localeCompare(z.dueDate ?? '9999'));
      const prs = list.map((i) => ({ i, p: initiativeProgress(b, i, ctx.todayISO) }));
      const budget = list.reduce((n, i) => n + (i.budget ?? 0), 0);
      const spent = prs.reduce((n, x) => n + x.p.spent, 0);
      const active = list.filter((i) => i.status === 'in_progress');
      const onTrack = prs.filter((x) => isOnTrack(x.i, x.p, ctx.todayISO)).length;
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Growth Initiatives" subtitle={ref ? list[0]?.title : ctx.options.includeDone ? 'All initiatives' : 'Open initiatives'} />
            {!ref && (
              <Kpis
                items={[
                  { k: 'Initiatives', v: String(list.length), s: `${active.length} in progress` },
                  { k: 'On track', v: `${onTrack}/${active.length}` },
                  { k: 'Spent', v: money(ctx, spent), s: budget ? `of ${money(ctx, budget)} budget` : undefined },
                  { k: 'Done', v: String(b.initiatives.filter((i) => i.status === 'done').length) },
                ]}
              />
            )}
            {list.length === 0 ? <p className="pp-muted">{ref ? `No initiative “${String(ctx.options.initiative)}”.` : 'No open initiatives.'}</p> : list.map((i) => <InitiativeBlock key={i.id} ctx={ctx} b={b} i={i} updates={Math.max(0, Number(ctx.options.updates ?? 4))} />)}
          </>
        ),
      };
    },
  },
  {
    id: 'space-biz-sops',
    title: 'SOP Manual',
    group: 'Library',
    kinds: ['business'],
    description: 'Workflows, SOPs and checklists with numbered steps and details — the whole manual, one category or a single procedure (printable checklist)',
    options: [
      { key: 'sop', label: 'Procedure', type: 'text', default: '', hint: 'title or id — empty = all' },
      { key: 'category', label: 'Category', type: 'text', default: '', hint: 'e.g. Clients — empty = all' },
      { key: 'checkboxes', label: 'Tick boxes next to steps', type: 'boolean', default: false },
      { key: 'pageBreaks', label: 'Each procedure on a new page', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (bizOf(s).sops.length ? false : 'Add a workflow or SOP in Workflows & SOPs first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const one = String(ctx.options.sop ?? '').trim() ? findSop(b, String(ctx.options.sop)) : undefined;
      const cat = String(ctx.options.category ?? '').trim().toLowerCase();
      const list = one ? [one] : b.sops.filter((s) => !cat || (s.category ?? '').toLowerCase().includes(cat)).sort((a, z) => (a.category ?? '~').localeCompare(z.category ?? '~') || a.title.localeCompare(z.title));
      const checkboxes = !!ctx.options.checkboxes || (one?.kind === 'checklist' && ctx.options.checkboxes !== false);
      const missing = String(ctx.options.sop ?? '').trim() && !one;
      return {
        css: CSS,
        title: one ? one.title : 'SOP Manual',
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title={one ? one.title || 'Untitled' : 'Workflows & SOPs'} subtitle={one ? SOP_KINDS.find((k) => k.value === one.kind)?.label : cat ? String(ctx.options.category) : `${list.length} procedure${list.length === 1 ? '' : 's'}`} />
            {missing ? (
              <p className="pp-muted">No procedure “{String(ctx.options.sop)}”.</p>
            ) : list.length === 0 ? (
              <p className="pp-muted">No procedures in this category.</p>
            ) : (
              <>
                {list.length > 2 && (
                  <PSection title="Contents">
                    <div className="bl-toc">
                      {list.map((s, i) => (
                        <div key={s.id}>
                          {i + 1}. {s.title || 'Untitled'} <span className="pp-muted pp-small">{s.category ? `· ${s.category}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </PSection>
                )}
                {list.map((s, i) => (
                  <div key={s.id} className={ctx.options.pageBreaks && i > 0 ? 'pp-break-before' : undefined}>
                    <SopBlock ctx={ctx} b={b} s={s} checkboxes={checkboxes} hideTitle={!!one} />
                  </div>
                ))}
              </>
            )}
          </>
        ),
      };
    },
  },
  {
    id: 'space-biz-resources',
    title: 'Resource Index',
    group: 'Library',
    kinds: ['business'],
    description: 'Index of the business resources by category — links, files and the full text of templates and snippets',
    options: [
      {
        key: 'section',
        label: 'Section',
        type: 'select',
        default: 'library',
        choices: [
          { value: 'library', label: 'Resources (library)' },
          { value: 'enablement', label: 'Sales enablement' },
          { value: 'all', label: 'Both' },
        ],
      },
      { key: 'fullText', label: 'Full text of text resources', type: 'boolean', default: true },
      { key: 'pinnedOnly', label: 'Pinned only', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (bizOf(s).resources.length ? false : 'Add a resource in Resources first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const sec = String(ctx.options.section ?? 'library');
      const list = b.resources.filter((r) => (sec === 'all' || r.section === sec) && (!ctx.options.pinnedOnly || r.pinned));
      const groupOf = (r: BizResource) => `${sec === 'all' ? (r.section === 'enablement' ? 'Sales · ' : 'Library · ') : ''}${catLabel(r)}`;
      const groups = [...new Set(list.map(groupOf))].sort();
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Resource Index" subtitle={sec === 'all' ? 'Library and sales enablement' : sec === 'enablement' ? 'Sales enablement' : 'Resources'} />
            {list.length === 0 && <p className="pp-muted">No resources{ctx.options.pinnedOnly ? ' pinned' : ''} in this section.</p>}
            {groups.map((g) => (
              <PSection key={g} title={g}>
                {list
                  .filter((r) => groupOf(r) === g)
                  .sort((a, z) => Number(!!z.pinned) - Number(!!a.pinned) || a.title.localeCompare(z.title))
                  .map((r) => (
                    <div key={r.id} className="bl-res">
                      <div className="t">
                        <span>
                          {r.pinned ? '★ ' : ''}
                          {r.title || 'Untitled'}
                        </span>
                        <span className="pp-small pp-muted">{RESOURCE_KINDS.find((k) => k.value === r.kind)?.label}</span>
                      </div>
                      {r.description && <div>{r.description}</div>}
                      <div className="m">
                        {[r.kind === 'link' && r.url, r.kind === 'file' && (r.files ?? []).map((f) => f.fileName).join(', '), r.tags?.length && `Tags: ${r.tags.join(', ')}`, r.updatedAt && `Updated ${ctx.fmt.dateMedium(r.updatedAt)}`].filter(Boolean).join(' · ')}
                      </div>
                      {ctx.options.fullText !== false && r.kind === 'text' && r.text?.trim() && <div className="txt">{r.text.trim()}</div>}
                    </div>
                  ))}
              </PSection>
            ))}
          </>
        ),
      };
    },
  },
];
