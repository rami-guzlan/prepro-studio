/* Printable Personal Finances documents: monthly report, spending by category,
   monthly budget sheet (YNAB-style), budget vs spending, net worth & goals, transaction list. */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Dot, PSection, PTable } from '@/print/components';
import { budgetMonth, YNAB_RULES } from './ynab';
import { ACCOUNT_TYPES, GOAL_TYPES, isDebtType, normalizeFinance, type FinanceData } from './types';
import {
  accountLabel,
  budgetRows,
  byCategory,
  byMerchant,
  catMap,
  computeInsights,
  debtPayoff,
  debtsOf,
  goalProgress,
  inRange,
  merchantOf,
  monthElapsed,
  monthLabel,
  monthOf,
  monthRange,
  monthlySeries,
  monthsBack,
  netWorth,
  periodRange,
  round2,
  shiftMonth,
  totals,
  type PeriodId,
} from './calc';

/** Categorical palette (light steps of --viz-1…8) for print. */
const VIZP = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const vizp = (slot?: number) => (slot == null ? '#9a9aa4' : VIZP[((slot % 8) + 8) % 8]);

const CSS = `
.fp-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6pt; margin-bottom: 10pt; }
.fp-kpi { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 5pt 7pt; break-inside: avoid; }
.fp-kpi .k { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; }
.fp-kpi .v { font-size: 14pt; font-weight: 700; font-variant-numeric: tabular-nums; }
.fp-kpi .s { font-size: 7pt; color: #707078; }
.fp-bar { display: inline-block; height: 5pt; border-radius: 2pt; vertical-align: middle; margin-right: 4pt; }
.fp-track { display: inline-block; width: 1in; height: 5pt; background: #e8e8ee; border-radius: 2pt; overflow: hidden; vertical-align: middle; margin-right: 4pt; }
.fp-track > span { display: block; height: 100%; border-radius: 2pt; }
.fp-in { color: #1f8f4e; }
.fp-out { color: #1d1d22; }
.fp-over { color: #c9303e; font-weight: 700; }
.fp-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12pt; }
.fp-note { font-size: 7.4pt; color: #707078; margin-top: 6pt; }
.fp-ins { border-left: 2pt solid #6250d6; padding: 2pt 0 2pt 6pt; margin-bottom: 5pt; break-inside: avoid; }
.fp-ins b { font-size: 8.5pt; }
.fp-ins div { font-size: 7.8pt; color: #44444c; white-space: pre-wrap; }
.fp-matrix td, .fp-matrix th { font-size: 7.2pt; }
`;

const fin = (ctx: SpacePrintContext): FinanceData => normalizeFinance(ctx.space.finance);
const m0 = (ctx: SpacePrintContext, n: number) => ctx.fmt.money(n, { cents: false });
const signedMoney = (ctx: SpacePrintContext, n: number) => (n > 0 ? `+${ctx.fmt.money(n)}` : n < 0 ? `−${ctx.fmt.money(-n)}` : ctx.fmt.money(0));
const pctText = (x: number | null | undefined) => (x == null || !isFinite(x) ? '—' : `${Math.round(x * 100)}%`);
const NOT_ADVICE = 'Not financial advice: figures and suggestions are educational estimates from your own records. Talk to a qualified professional before making financial decisions.';

function Kpis({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="fp-kpis">
      {items.map(([k, v, s]) => (
        <div key={k} className="fp-kpi">
          <div className="k">{k}</div>
          <div className="v">{v}</div>
          {s && <div className="s">{s}</div>}
        </div>
      ))}
    </div>
  );
}

const PERIOD_CHOICES: { value: string; label: string }[] = [
  { value: 'month', label: 'One month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
];

function resolvePeriod(ctx: SpacePrintContext, f: FinanceData) {
  const sd = f.settings.monthStartDay;
  const p = String(ctx.options.period ?? 'month');
  const month = /^\d{4}-\d{2}$/.test(String(ctx.options.month ?? '')) ? String(ctx.options.month) : monthOf(ctx.todayISO, sd);
  if (p === 'month') return { ...monthRange(month, sd), label: monthLabel(month, true), months: [month], single: month as string | undefined };
  const r = periodRange(p as PeriodId, ctx.todayISO, sd);
  return { ...r, single: undefined as string | undefined };
}

export const financePrintDocs: SpacePrintDocDef[] = [
  /* ---------------------------------------------------------------- monthly report */
  {
    id: 'space-fin-monthly-report',
    title: 'Monthly Finance Report',
    group: 'Finances',
    orientation: 'portrait',
    description: 'Income, spending, savings rate, categories, budgets, top merchants, largest payments and insights for a month or period',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: 'month', choices: PERIOD_CHOICES },
      { key: 'month', label: 'Month (YYYY-MM, for “One month”)', type: 'text', default: '', hint: 'empty = this month' },
      { key: 'insights', label: 'Insights & pinned advice', type: 'boolean', default: true },
      { key: 'largest', label: 'Largest payments', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.finance?.transactions?.length ? false : 'Import statements first'),
    render: (ctx) => {
      const f = fin(ctx);
      const cats = catMap(f);
      const p = resolvePeriod(ctx, f);
      const txs = f.transactions.filter((t) => inRange(t.date, p.from, p.to));
      const t = totals(txs, cats);
      const prevMonths = p.months.map((k) => shiftMonth(k, -p.months.length));
      const prevTx = f.transactions.filter((x) => prevMonths.includes(monthOf(x.date, f.settings.monthStartDay)));
      const tp = totals(prevTx, cats);
      const catsRows = byCategory(txs, cats);
      const prevCats = new Map(byCategory(prevTx, cats).map((r) => [r.id, r.amount]));
      const merchants = byMerchant(txs, cats).slice(0, 10);
      const largest = [...txs].filter((x) => x.amount < 0 && !x.transfer).sort((a, b) => a.amount - b.amount).slice(0, 10);
      const series = monthlySeries(f.transactions, cats, p.months, f.settings.monthStartDay);
      const budgets = p.single ? budgetRows(f, p.single, monthElapsed(p.single, ctx.todayISO, f.settings.monthStartDay)) : [];
      const insights = computeInsights(f, ctx.todayISO, (n) => m0(ctx, n)).slice(0, 8);
      const pinned = f.insights.filter((i) => i.pinned && !i.dismissed);
      const maxCat = Math.max(1, ...catsRows.map((r) => r.amount));
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Finance Report" subtitle={`${p.label} · ${txs.length} transactions`} />
            <Kpis
              items={[
                ['Income', m0(ctx, t.income), tp.count ? `prev. ${m0(ctx, tp.income)}` : undefined],
                ['Spending', m0(ctx, t.spending), tp.count ? `prev. ${m0(ctx, tp.spending)}` : undefined],
                ['Net', signedMoney(ctx, t.net), tp.count ? `prev. ${signedMoney(ctx, tp.net)}` : undefined],
                ['Savings rate', pctText(t.savingsRate), tp.savingsRate != null ? `prev. ${pctText(tp.savingsRate)}` : undefined],
                ['Moved to savings', m0(ctx, t.saving)],
              ]}
            />
            {p.months.length > 1 && (
              <PSection title="By month">
                <PTable
                  zebra
                  rows={series}
                  columns={[
                    { header: 'Month', cell: (r) => monthLabel(r.key, true) },
                    { header: 'Income', num: true, cell: (r) => ctx.fmt.money(r.income) },
                    { header: 'Spending', num: true, cell: (r) => ctx.fmt.money(r.spending) },
                    { header: 'Net', num: true, cell: (r) => <span className={r.net < 0 ? 'fp-over' : 'fp-in'}>{signedMoney(ctx, r.net)}</span> },
                    { header: 'Savings rate', num: true, cell: (r) => pctText(r.savingsRate) },
                  ]}
                />
              </PSection>
            )}
            <PSection title="Spending by category" right={m0(ctx, t.spending)}>
              <PTable
                zebra
                rows={catsRows}
                empty="No spending in this period."
                columns={[
                  { header: 'Category', width: '30%', cell: (r) => (<span><Dot color={vizp(r.id ? r.slot : undefined)} />{r.name}</span>) },
                  { header: 'Amount', num: true, cell: (r) => <b>{ctx.fmt.money(r.amount)}</b> },
                  { header: 'Share', width: '22%', cell: (r) => (<span className="pp-nowrap"><span className="fp-bar" style={{ width: `${Math.max(2, (r.amount / maxCat) * 70)}%`, background: vizp(r.id ? r.slot : undefined) }} />{pctText(t.spending ? r.amount / t.spending : null)}</span>) },
                  { header: 'Previous', num: true, cell: (r) => (prevCats.get(r.id) != null ? ctx.fmt.money(prevCats.get(r.id)!) : '—') },
                  { header: 'Change', num: true, cell: (r) => { const pv = prevCats.get(r.id); if (!pv) return '—'; const d = (r.amount - pv) / pv; return <span className={d > 0.2 ? 'fp-over' : undefined}>{`${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`}</span>; } },
                  { header: 'Payments', num: true, cell: (r) => r.count },
                ]}
              />
            </PSection>
            {budgets.length > 0 && (
              <PSection title={`Budgets · ${monthLabel(p.single!, true)}`}>
                <PTable
                  zebra
                  rows={budgets}
                  columns={[
                    { header: 'Category', cell: (r) => r.category.name },
                    { header: 'Budget', num: true, cell: (r) => m0(ctx, r.budget.amount) },
                    { header: 'Spent', num: true, cell: (r) => ctx.fmt.money(r.spent) },
                    { header: 'Progress', width: '24%', cell: (r) => (<span className="pp-nowrap"><span className="fp-track"><span style={{ width: `${Math.min(100, r.pct * 100)}%`, background: r.tone === 'critical' ? '#dc3545' : r.tone === 'warning' ? '#e8960c' : '#23a35a' }} /></span>{pctText(r.pct)}</span>) },
                    { header: 'Left', num: true, cell: (r) => <span className={r.left < 0 ? 'fp-over' : undefined}>{signedMoney(ctx, r.left)}</span> },
                  ]}
                />
              </PSection>
            )}
            <div className="fp-two">
              <PSection title="Top merchants">
                <PTable rows={merchants} empty="—" columns={[{ header: 'Merchant', cell: (r) => r.name }, { header: 'Payments', num: true, cell: (r) => r.count }, { header: 'Total', num: true, cell: (r) => ctx.fmt.money(r.amount) }]} />
              </PSection>
              {ctx.options.largest !== false && (
                <PSection title="Largest payments">
                  <PTable rows={largest} empty="—" columns={[{ header: 'Date', cell: (r) => ctx.fmt.date(r.date) }, { header: 'Merchant', cell: (r) => merchantOf(r) }, { header: 'Amount', num: true, cell: (r) => ctx.fmt.money(-r.amount) }]} />
                </PSection>
              )}
            </div>
            {ctx.options.insights !== false && (insights.length > 0 || pinned.length > 0) && (
              <PSection title="Insights & advice" className="pp-avoid">
                {pinned.map((i) => (
                  <div key={i.id} className="fp-ins">
                    <b>{i.title}</b>
                    <div>{i.body}</div>
                    <div>{i.source === 'agent' ? `From ${i.author || 'an AI agent'}` : i.source === 'user' ? 'Your note' : 'Pinned insight'} · {ctx.fmt.dateMedium(i.date)}</div>
                  </div>
                ))}
                {insights.map((i) => (
                  <div key={i.key} className="fp-ins" style={{ borderLeftColor: i.tone === 'critical' ? '#dc3545' : i.tone === 'warning' ? '#e8960c' : i.tone === 'good' ? '#23a35a' : '#2a78d6' }}>
                    <b>{i.title}</b>
                    <div>{i.body}</div>
                  </div>
                ))}
              </PSection>
            )}
            <div className="fp-note">{NOT_ADVICE}</div>
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- spending by category */
  {
    id: 'space-fin-spending',
    title: 'Spending by Category',
    group: 'Finances',
    orientation: 'landscape',
    description: 'Every category month by month with totals and averages',
    options: [{ key: 'months', label: 'Months', type: 'number', default: 6, min: 2, max: 12 }],
    emptyReason: (s) => (s.finance?.transactions?.length ? false : 'Import statements first'),
    render: (ctx) => {
      const f = fin(ctx);
      const cats = catMap(f);
      const sd = f.settings.monthStartDay;
      const n = Math.max(2, Math.min(12, Number(ctx.options.months) || 6));
      const keys = monthsBack(monthOf(ctx.todayISO, sd), n);
      const per = keys.map((k) => new Map(byCategory(f.transactions.filter((t) => monthOf(t.date, sd) === k), cats).map((r) => [r.id, r])));
      const ids = [...new Set(per.flatMap((m) => [...m.keys()]))];
      // average over the months that have data (a new user has fewer than n months)
      const active = Math.max(1, per.filter((m) => m.size > 0).length);
      const rows = ids
        .map((id) => {
          const c = id ? cats.get(id) : undefined;
          const values = per.map((m) => m.get(id)?.amount ?? 0);
          const total = round2(values.reduce((s, v) => s + v, 0));
          return { id, name: c?.name ?? 'Uncategorised', slot: c?.slot, values, total, avg: total / active };
        })
        .sort((a, b) => b.total - a.total);
      const colTotals = keys.map((_, i) => round2(rows.reduce((s, r) => s + r.values[i], 0)));
      const grand = round2(colTotals.reduce((s, v) => s + v, 0));
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Spending by Category" subtitle={`${monthLabel(keys[0], true)} – ${monthLabel(keys[keys.length - 1], true)}`} />
            <PTable
              zebra
              className="fp-matrix"
              rows={rows}
              empty="No spending in these months."
              columns={[
                { header: 'Category', width: '18%', cell: (r) => (<span><Dot color={vizp(r.id ? r.slot : undefined)} />{r.name}</span>) },
                ...keys.map((k, i) => ({ header: monthLabel(k).slice(0, 3), num: true, cell: (r: (typeof rows)[number]) => (r.values[i] ? m0(ctx, r.values[i]) : '—') })),
                { header: 'Total', num: true, cell: (r) => <b>{m0(ctx, r.total)}</b> },
                { header: 'Avg / month', num: true, cell: (r) => m0(ctx, r.avg) },
              ]}
              footer={['Total', ...colTotals.map((v) => m0(ctx, v)), m0(ctx, grand), m0(ctx, grand / active)]}
            />
            <div className="fp-note">Spending = categories that count as spending (refunds reduce them). Transfers and money moved to savings are not included.</div>
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- budget report */
  {
    id: 'space-fin-budget',
    title: 'Budget vs Spending',
    group: 'Finances',
    orientation: 'portrait',
    description: 'Money for the month (rolled over + assigned) vs spent per category, with 3-month averages and spending with no money assigned. For the YNAB-style sheet use the Monthly Budget Sheet.',
    options: [{ key: 'month', label: 'Month (YYYY-MM)', type: 'text', default: '', hint: 'empty = this month' }],
    emptyReason: (s) => (s.finance?.assignments?.length || s.finance?.targets?.length || s.finance?.budgets?.length ? false : 'Assign money on the Budget screen first'),
    render: (ctx) => {
      const f = fin(ctx);
      const cats = catMap(f);
      const sd = f.settings.monthStartDay;
      const month = /^\d{4}-\d{2}$/.test(String(ctx.options.month ?? '')) ? String(ctx.options.month) : monthOf(ctx.todayISO, sd);
      const elapsed = monthElapsed(month, ctx.todayISO, sd);
      const rows = budgetRows(f, month, elapsed);
      const budget = round2(rows.reduce((s, r) => s + r.budget.amount, 0));
      const spent = round2(rows.reduce((s, r) => s + r.spent, 0));
      const un = byCategory(f.transactions.filter((t) => monthOf(t.date, sd) === month), cats).filter((r) => !rows.some((b) => b.category.id === r.id));
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Budget Report" subtitle={`${monthLabel(month, true)}${elapsed < 1 ? ` · ${Math.round(elapsed * 100)}% of the month gone` : ''}`} />
            <Kpis
              items={[
                ['Budgeted', m0(ctx, budget)],
                ['Spent', m0(ctx, spent), budget ? `${pctText(spent / budget)} of budget` : undefined],
                [budget - spent >= 0 ? 'Left' : 'Over', m0(ctx, Math.abs(budget - spent))],
                ['Over budget', String(rows.filter((r) => r.tone === 'critical').length), 'categories'],
                ['Not budgeted', m0(ctx, un.reduce((s, r) => s + r.amount, 0))],
              ]}
            />
            <PTable
              zebra
              rows={rows}
              columns={[
                { header: 'Category', width: '24%', cell: (r) => (<span><Dot color={vizp(r.category.slot)} />{r.category.name}</span>) },
                { header: 'Money', num: true, cell: (r) => m0(ctx, r.budget.amount) },
                { header: 'Spent', num: true, cell: (r) => ctx.fmt.money(r.spent) },
                { header: 'Progress', width: '22%', cell: (r) => (<span className="pp-nowrap"><span className="fp-track"><span style={{ width: `${Math.min(100, r.pct * 100)}%`, background: r.tone === 'critical' ? '#dc3545' : r.tone === 'warning' ? '#e8960c' : '#23a35a' }} /></span>{pctText(r.pct)}</span>) },
                { header: 'Left', num: true, cell: (r) => <span className={r.left < 0 ? 'fp-over' : undefined}>{signedMoney(ctx, r.left)}</span> },
                { header: '3-mo avg', num: true, cell: (r) => m0(ctx, r.avg3) },
              ]}
              footer={['Total', m0(ctx, budget), ctx.fmt.money(spent), pctText(budget ? spent / budget : null), signedMoney(ctx, round2(budget - spent)), '']}
            />
            {un.length > 0 && (
              <PSection title="Spending without a budget">
                <PTable rows={un} columns={[{ header: 'Category', cell: (r) => r.name }, { header: 'Payments', num: true, cell: (r) => r.count }, { header: 'Spent', num: true, cell: (r) => ctx.fmt.money(r.amount) }]} />
              </PSection>
            )}
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- YNAB-style monthly budget sheet */
  {
    id: 'space-fin-budget-month',
    title: 'Monthly Budget Sheet',
    group: 'Finances',
    orientation: 'portrait',
    description: 'The YNAB-style budget for a month: Ready to Assign, Age of Money, every category group with assigned / activity / available, targets and overspending',
    options: [
      { key: 'month', label: 'Month (YYYY-MM)', type: 'text', default: '', hint: 'empty = this month' },
      { key: 'hidden', label: 'Include hidden and empty categories', type: 'boolean', default: false },
      { key: 'rules', label: 'The four rules', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.finance?.transactions?.length || s.finance?.assignments?.length ? false : 'Import statements or assign money first'),
    render: (ctx) => {
      const f = fin(ctx);
      const sd = f.settings.monthStartDay;
      const month = /^\d{4}-\d{2}$/.test(String(ctx.options.month ?? '')) ? String(ctx.options.month) : monthOf(ctx.todayISO, sd);
      const v = budgetMonth(f, month, ctx.todayISO);
      const all = ctx.options.hidden === true;
      const money = (n: number) => ctx.fmt.money(n);
      const money0 = (n: number) => m0(ctx, n);
      const avail = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));
      const groups = v.groups
        .map((g) => ({ ...g, rows: g.rows.filter((r) => all || ((!r.hidden || r.available !== 0) && (r.assigned !== 0 || r.activity !== 0 || r.available !== 0 || !!r.target))) }))
        .filter((g) => g.rows.length);
      const rows = groups.flatMap((g) => g.rows.map((r) => ({ g: g.label, r })));
      const color = (st: string) => (st === 'overspent' ? '#c9303e' : st === 'underfunded' ? '#b77900' : st === 'funded' ? '#1f8f4e' : '#7a7a84');
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Monthly Budget" subtitle={`${monthLabel(month, true)} · give every dollar a job`} />
            <Kpis
              items={[
                ['Ready to Assign', avail(v.rta), v.rta < 0 ? 'assigned more than you have' : v.rta > 0 ? 'still needs a job' : 'every dollar has a job'],
                ['Assigned', money0(v.assigned), `${money0(v.parts.inflow)} came in`],
                ['Activity', signedMoney(ctx, v.activity)],
                ['Available', money0(v.available), v.overspent.length ? `${v.overspent.length} overspent` : undefined],
                ['Age of Money', v.ageOfMoney == null ? '—' : `${v.ageOfMoney} days`, v.underfunded > 0 ? `${money0(v.underfunded)} underfunded` : 'targets funded'],
              ]}
            />
            <PTable
              zebra
              rows={rows}
              groupBy={(x) => x.g}
              empty="Nothing assigned or spent this month."
              columns={[
                { header: 'Category', width: '30%', cell: (x) => (<span><Dot color={vizp(x.r.slot)} />{x.r.name}{x.r.kind === 'payment' ? ' (card payment)' : ''}</span>) },
                { header: 'Assigned', num: true, cell: (x) => money(x.r.assigned) },
                { header: 'Activity', num: true, cell: (x) => signedMoney(ctx, x.r.activity) },
                { header: 'Available', num: true, cell: (x) => <b style={{ color: color(x.r.status) }}>{avail(x.r.available)}</b> },
                { header: 'Target', width: '26%', cell: (x) => (x.r.info ? (<span className="pp-nowrap"><span className="fp-track"><span style={{ width: `${Math.round(x.r.info.progress * 100)}%`, background: color(x.r.status === 'overspent' ? 'overspent' : x.r.info.met ? 'funded' : 'underfunded') }} /></span>{x.r.info.label(money0)}{x.r.info.need > 0 ? ` · ${money0(x.r.info.need)} more` : ''}</span>) : '') },
              ]}
              footer={['Total', money(v.assigned), signedMoney(ctx, v.activity), avail(v.available), v.underfunded > 0 ? `${money0(v.underfunded)} underfunded` : '']}
            />
            {v.uncategorized.count > 0 && <div className="fp-note fp-over">{v.uncategorized.count} uncategorised transactions ({money(v.uncategorized.amount)}) count as overspending until they are categorised.</div>}
            <div className="fp-note">
              Ready to Assign: {money0(v.parts.inflow)} in this month{v.parts.overspentLastMonth ? `, −${money0(v.parts.overspentLastMonth)} overspent last month` : ''}, −{money0(v.parts.assignedThisMonth)} assigned{v.parts.assignedInFuture ? `, −${money0(v.parts.assignedInFuture)} assigned in future months` : ''}. Positive Available rolls over; cash overspending comes out of next month’s Ready to Assign, card overspending becomes card debt.
            </div>
            {ctx.options.rules !== false && (
              <PSection title="The four rules" className="pp-avoid">
                {YNAB_RULES.map((r) => (
                  <div key={r.rule} className="fp-ins">
                    <b>
                      {r.rule}. {r.title}
                    </b>
                    <div>{r.body}</div>
                  </div>
                ))}
              </PSection>
            )}
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- net worth & goals */
  {
    id: 'space-fin-networth',
    title: 'Net Worth & Goals',
    group: 'Finances',
    orientation: 'portrait',
    description: 'Accounts and balances, net worth, credit use, goals with projections and the debt payoff plan',
    options: [{ key: 'debt', label: 'Debt payoff plan', type: 'boolean', default: true }],
    emptyReason: (s) => (s.finance?.accounts?.length || s.finance?.goals?.length ? false : 'Add accounts or goals first'),
    render: (ctx) => {
      const f = fin(ctx);
      const nw = netWorth(f.accounts);
      const accounts = f.accounts.filter((a) => !a.archived);
      const debts = debtsOf(f.accounts);
      const plan = debts.length ? debtPayoff(debts, f.settings.extraDebtPayment, f.settings.payoffStrategy, ctx.todayISO) : null;
      const other = debts.length ? debtPayoff(debts, f.settings.extraDebtPayment, f.settings.payoffStrategy === 'avalanche' ? 'snowball' : 'avalanche', ctx.todayISO) : null;
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Net Worth & Goals" subtitle={`${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${f.goals.length} goal${f.goals.length === 1 ? '' : 's'}`} />
            <Kpis
              items={[
                ['Net worth', m0(ctx, nw.net)],
                ['Assets', m0(ctx, nw.assets)],
                ['Debts', m0(ctx, nw.debts)],
                ['Cash', m0(ctx, nw.liquid)],
                ['Credit used', pctText(nw.utilization), nw.creditLimit ? `of ${m0(ctx, nw.creditLimit)}` : undefined],
              ]}
            />
            <PSection title="Accounts">
              <PTable
                zebra
                rows={accounts}
                groupBy={(a) => ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                empty="No accounts."
                columns={[
                  { header: 'Account', width: '30%', cell: (a) => (<span><Dot color={vizp(a.slot)} />{accountLabel(a)}</span>) },
                  { header: 'Institution', cell: (a) => a.institution ?? '' },
                  { header: 'Balance', num: true, cell: (a) => (a.balance == null ? '—' : isDebtType(a.type) ? <span className="fp-over">{ctx.fmt.money(a.balance)} owed</span> : <b>{ctx.fmt.money(a.balance)}</b>) },
                  { header: 'As of', cell: (a) => ctx.fmt.date(a.balanceDate) },
                  { header: 'APR', num: true, cell: (a) => (a.apr != null ? `${a.apr}%` : '') },
                  { header: 'Limit / used', num: true, cell: (a) => (a.creditLimit ? `${m0(ctx, a.creditLimit)} · ${pctText((a.balance ?? 0) / a.creditLimit)}` : '') },
                ]}
              />
            </PSection>
            <PSection title="Goals">
              <PTable
                zebra
                rows={f.goals}
                empty="No goals yet."
                columns={[
                  { header: 'Goal', width: '26%', cell: (g) => <b>{g.name}</b> },
                  { header: 'Type', cell: (g) => GOAL_TYPES.find((t) => t.value === g.type)?.label ?? g.type },
                  { header: 'Progress', width: '22%', cell: (g) => { const p = goalProgress(g, f.accounts, ctx.todayISO); return (<span className="pp-nowrap"><span className="fp-track"><span style={{ width: `${p.pct * 100}%`, background: vizp(g.slot ?? 2) }} /></span>{m0(ctx, p.current)} / {m0(ctx, g.target)}</span>); } },
                  { header: 'Monthly', num: true, cell: (g) => (g.monthly ? m0(ctx, g.monthly) : '—') },
                  { header: 'Projected', cell: (g) => { const p = goalProgress(g, f.accounts, ctx.todayISO); return g.done || p.remaining <= 0 ? 'Reached' : p.projectedDate ? ctx.fmt.dateMedium(p.projectedDate) : '—'; } },
                  { header: 'Target date', cell: (g) => { const p = goalProgress(g, f.accounts, ctx.todayISO); return g.targetDate ? <span className={p.onTrack === false ? 'fp-over' : undefined}>{ctx.fmt.dateMedium(g.targetDate)}{p.onTrack === false && p.requiredMonthly ? ` (needs ${m0(ctx, p.requiredMonthly)}/mo)` : ''}</span> : '—'; } },
                ]}
              />
            </PSection>
            {ctx.options.debt !== false && plan && (
              <PSection title={`Debt payoff · ${plan.strategy} with ${m0(ctx, f.settings.extraDebtPayment)} extra a month`} className="pp-avoid">
                <PTable
                  rows={plan.order}
                  columns={[
                    { header: 'Order', cell: (_, i) => i + 1 },
                    { header: 'Debt', cell: (o) => o.name },
                    { header: 'Paid off', cell: (o) => (o.month != null ? `month ${o.month}` : 'not within 50 years') },
                    { header: 'Interest', num: true, cell: (o) => ctx.fmt.money(o.interest) },
                  ]}
                />
                <div className="fp-note">
                  {plan.feasible ? `Debt-free ${ctx.fmt.dateMedium(plan.debtFreeDate)} (${plan.months} months), ${ctx.fmt.money(plan.totalInterest)} interest, paying ${m0(ctx, plan.monthlyPayment)} a month.` : 'Payments do not cover the interest; raise the payments.'}
                  {other?.feasible && plan.feasible ? ` ${other.strategy === 'avalanche' ? 'Avalanche' : 'Snowball'} instead: ${other.months} months, ${ctx.fmt.money(other.totalInterest)} interest.` : ''}
                </div>
              </PSection>
            )}
            <div className="fp-note">{NOT_ADVICE}</div>
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- transaction list */
  {
    id: 'space-fin-transactions',
    title: 'Transaction List',
    group: 'Finances',
    orientation: 'portrait',
    description: 'Transactions for a month range grouped by month, with categories and totals',
    options: [
      { key: 'from', label: 'From month (YYYY-MM)', type: 'text', default: '', hint: 'empty = this month' },
      { key: 'to', label: 'To month (YYYY-MM)', type: 'text', default: '' },
      { key: 'transfers', label: 'Include transfers', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.finance?.transactions?.length ? false : 'Import statements first'),
    render: (ctx) => {
      const f = fin(ctx);
      const cats = catMap(f);
      const sd = f.settings.monthStartDay;
      const cur = monthOf(ctx.todayISO, sd);
      const ok = (v: unknown) => /^\d{4}-\d{2}$/.test(String(v ?? ''));
      const from = ok(ctx.options.from) ? String(ctx.options.from) : cur;
      const to = ok(ctx.options.to) && String(ctx.options.to) >= from ? String(ctx.options.to) : from;
      const accts = new Map(f.accounts.map((a) => [a.id, accountLabel(a)]));
      const rows = f.transactions
        .filter((t) => {
          const m = monthOf(t.date, sd);
          return m >= from && m <= to && (ctx.options.transfers !== false || !t.transfer);
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      const t = totals(rows, cats);
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Transactions" subtitle={`${from === to ? monthLabel(from, true) : `${monthLabel(from, true)} – ${monthLabel(to, true)}`} · ${rows.length} transactions`} />
            <PTable
              zebra
              rows={rows}
              groupBy={(r) => monthLabel(monthOf(r.date, sd), true)}
              empty="No transactions in this range."
              columns={[
                { header: 'Date', width: '11%', cell: (r) => ctx.fmt.date(r.date) },
                { header: 'Description', width: '38%', cell: (r) => (<span><b>{merchantOf(r)}</b>{r.notes ? <span className="pp-muted"> · {r.notes}</span> : null}</span>) },
                { header: 'Category', cell: (r) => (r.transfer ? 'Transfer' : r.category ? cats.get(r.category)?.name ?? '' : 'Uncategorised') },
                { header: 'Account', cell: (r) => (r.accountId ? accts.get(r.accountId) ?? '' : '') },
                { header: 'Amount', num: true, cell: (r) => <span className={r.amount > 0 ? 'fp-in' : 'fp-out'}>{signedMoney(ctx, r.amount)}</span> },
              ]}
            />
            <div className="fp-note">
              Income {ctx.fmt.money(t.income)} · spending {ctx.fmt.money(t.spending)} · net {signedMoney(ctx, t.net)}
            </div>
          </>
        ),
      };
    },
  },
];
