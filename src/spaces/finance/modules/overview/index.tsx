/* Finances overview: this month vs last, spending by category, 12-month income
   vs spending, budgets, top merchants, upcoming recurring charges, net worth,
   insights and pinned advice, and prompts for connected agents. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bot, CalendarClock, FileUp, Landmark, Lightbulb, PiggyBank, Plus, Wallet } from 'lucide-react';
import { navigateSpace, useApp } from '@/store/app';
import { plural } from '@/lib/text';
import { addDays } from '@/lib/dates';
import { BarList, LineChart, StatTile, VIZ, compact } from '@/ui/charts';
import { Button, ExportMenu, ModuleHeader, Toolbar } from '@/ui';
import { byCategory, byMerchant, computeInsights, detectRecurring, monthElapsed, monthLabel, monthOf, monthlySeries, monthsBack, netWorth, shiftMonth, totals, txOfMonth } from '../../calc';
import { budgetMonth } from '../../ynab';
import { ComputedInsightItem, SavedInsightItem } from '../../parts';
import { Amount, AskAgentCard, FinCard, FinPage, MonthStepper, NotAdviceNote, pct, useCatMap, useFinance, useFmt, useToday } from '../../ui';

function deltaText(cur: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const d = (cur - prev) / Math.abs(prev);
  if (!isFinite(d) || Math.abs(d) < 0.005) return '±0%';
  return `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`;
}

function Welcome() {
  return (
    <FinPage narrow>
      <div className="fin-hero">
        <div className="fin-hero-icon">
          <Wallet size={24} />
        </div>
        <div>
          <h2>Your money, in one private place</h2>
          <p>Import your bank and card statements to see where your money goes, set budgets, plan goals and debt payoff, and get suggestions — from the app and from your connected AI agents. Everything stays on this computer behind your PIN.</p>
        </div>
      </div>
      <div className="fin-welcome">
        <div className="fin-step">
          <span className="fin-step-n">1</span>
          <h4>Add your accounts</h4>
          <p>Checking, savings, credit cards, loans and investments with their balances — only a name and the last 4 digits, never full numbers.</p>
          <Button icon={Landmark} onClick={() => navigateSpace('accounts', { add: true })}>
            Add an account
          </Button>
        </div>
        <div className="fin-step">
          <span className="fin-step-n">2</span>
          <h4>Import statements</h4>
          <p>Download CSV, OFX/QFX or PDF statements from your bank and drop them in. Duplicates are skipped and transactions are categorised for you.</p>
          <Button variant="primary" icon={FileUp} onClick={() => navigateSpace('import')}>
            Import statements
          </Button>
        </div>
        <div className="fin-step">
          <span className="fin-step-n">3</span>
          <h4>Plan and get advice</h4>
          <p>Set monthly budgets and goals, compare debt payoff strategies, and let your agent review your month while your finances are unlocked.</p>
          <Button icon={PiggyBank} onClick={() => navigateSpace('plan')}>
            Open the planner
          </Button>
        </div>
      </div>
      <AskAgentCard limit={2} />
      <NotAdviceNote />
    </FinPage>
  );
}

export default function FinanceOverview() {
  const f = useFinance();
  const fmt = useFmt();
  const cats = useCatMap();
  const { today, month: current } = useToday();
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [month, setMonth] = useState(current);
  useEffect(() => {
    if (typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)) setMonth(params.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
  const sd = f.settings.monthStartDay;

  const txM = useMemo(() => txOfMonth(f.transactions, month, sd), [f.transactions, month, sd]);
  const txP = useMemo(() => txOfMonth(f.transactions, shiftMonth(month, -1), sd), [f.transactions, month, sd]);
  const tM = useMemo(() => totals(txM, cats), [txM, cats]);
  const tP = useMemo(() => totals(txP, cats), [txP, cats]);
  const catRows = useMemo(() => byCategory(txM, cats), [txM, cats]);
  const merchants = useMemo(() => byMerchant(txM, cats).slice(0, 8), [txM, cats]);
  const series = useMemo(() => {
    const first = f.transactions.reduce((m, t) => (t.date < m ? t.date : m), '9999');
    const rows = monthlySeries(f.transactions, cats, monthsBack(month, 12), sd);
    const firstKey = first === '9999' ? month : monthOf(first, sd);
    return rows.filter((r) => r.key >= firstKey);
  }, [f.transactions, cats, month, sd]);
  const budget = useMemo(() => budgetMonth(f, month, today), [f, month, today]);
  const recurring = useMemo(() => detectRecurring(f, today), [f, today]);
  const upcoming = useMemo(() => recurring.filter((r) => r.charge && r.nextDate <= addDays(today, 30)), [recurring, today]);
  const subsMonthly = useMemo(() => recurring.filter((r) => r.charge).reduce((s, r) => s + r.monthly, 0), [recurring]);
  const nw = useMemo(() => netWorth(f.accounts), [f.accounts]);
  const insights = useMemo(() => computeInsights(f, today, (n) => fmt.money(n, { cents: false })), [f, today, fmt]);
  const pinned = f.insights.filter((i) => i.pinned && !i.dismissed);
  const uncategorised = useMemo(() => f.transactions.filter((t) => !t.category && !t.transfer).length, [f.transactions]);

  if (!f.transactions.length && !f.accounts.length) {
    return (
      <div className="module">
        <ModuleHeader title="Overview" icon={Wallet} subtitle="Personal Finances" />
        <div className="module-body">
          <Welcome />
        </div>
      </div>
    );
  }

  const money0 = (n: number) => fmt.money(n, { cents: false });
  const isCurrent = month === current;
  const docs = [
    { id: 'space-fin-monthly-report', label: 'Monthly finance report', options: { period: 'month', month } },
    { id: 'space-fin-spending', label: 'Spending by category' },
    { id: 'space-fin-budget-month', label: 'Monthly budget sheet', options: { month } },
    { id: 'space-fin-budget', label: 'Budget vs spending report', options: { month } },
    { id: 'space-fin-networth', label: 'Net worth & goals' },
  ];

  return (
    <div className="module">
      <ModuleHeader
        title="Overview"
        icon={Wallet}
        subtitle={`${monthLabel(month, true)}${isCurrent ? ' so far' : ''} · ${plural(txM.length, 'transaction')}`}
        actions={
          <>
            <ExportMenu docs={docs} />
            <Button variant="primary" icon={FileUp} onClick={() => navigateSpace('import')}>
              Import
            </Button>
          </>
        }
      />
      <Toolbar>
        <MonthStepper value={month} onChange={setMonth} />
        <div className="spacer" />
        {uncategorised > 0 && (
          <button type="button" className="fin-link" onClick={() => navigateSpace('transactions', { uncategorized: true })}>
            {plural(uncategorised, 'uncategorised transaction')} <ArrowRight size={11} style={{ verticalAlign: '-1px' }} />
          </button>
        )}
      </Toolbar>
      <div className="module-body">
        <FinPage>
          <div className="fin-tiles">
            <StatTile label="Income" value={money0(tM.income)} delta={deltaText(tM.income, tP.income)} deltaGood={tM.income >= tP.income} sub={tP.income ? `vs ${money0(tP.income)} last month` : undefined} onClick={() => navigateSpace('transactions', { month, direction: 'in' })} />
            <StatTile label="Spending" value={money0(tM.spending)} delta={deltaText(tM.spending, tP.spending)} deltaGood={tM.spending <= tP.spending} sub={tP.spending ? `vs ${money0(tP.spending)} last month` : undefined} onClick={() => navigateSpace('transactions', { month, direction: 'out' })} />
            <StatTile label="Net" value={<Amount value={tM.net} />} sub={tP.count ? `last month ${tP.net >= 0 ? '+' : '−'}${money0(Math.abs(tP.net))}` : undefined} />
            <StatTile label="Savings rate" value={pct(tM.savingsRate)} sub={tM.saving > 0 ? `${money0(tM.saving)} moved to savings` : tP.savingsRate != null ? `last month ${pct(tP.savingsRate)}` : 'of income kept'} deltaGood={tM.savingsRate != null && tM.savingsRate >= 0.2} />
            <StatTile label="Ready to Assign" value={<span style={{ color: budget.rta < -0.004 ? 'var(--danger)' : budget.rta > 0.004 ? 'var(--success)' : undefined }}>{budget.rta < 0 ? `−${money0(-budget.rta)}` : money0(budget.rta)}</span>} sub={budget.overspent.length ? `${plural(budget.overspent.length, 'category', 'categories')} overspent` : budget.underfunded > 0 ? `${money0(budget.underfunded)} of targets unfunded` : budget.ageOfMoney != null ? `Age of Money ${plural(budget.ageOfMoney, 'day')}` : 'give every dollar a job'} onClick={() => navigateSpace('budgets', { month })} />
            <StatTile label="Net worth" value={money0(nw.net)} sub={`${money0(nw.assets)} assets · ${money0(nw.debts)} debts`} onClick={() => navigateSpace('accounts')} />
          </div>

          <div className="fin-grid-2">
            <FinCard title="Income vs spending" sub={series.length > 1 ? `Last ${plural(series.length, 'month')}` : 'Monthly totals'}>
              <LineChart
                ariaLabel="Monthly income and spending"
                yZero
                height={230}
                series={[
                  { id: 'income', label: 'Income', points: series.map((r) => ({ x: `${r.key}-01`, y: r.income })) },
                  { id: 'spending', label: 'Spending', points: series.map((r) => ({ x: `${r.key}-01`, y: r.spending })) },
                ]}
                xFormat={(x) => monthLabel(String(x).slice(0, 7)).slice(0, 3)}
                yFormat={compact}
                empty="Import a few months of statements to see the trend."
              />
            </FinCard>
            <FinCard
              title="Spending by category"
              sub={money0(tM.spending)}
              actions={
                <button type="button" className="fin-link" onClick={() => navigateSpace('transactions', { month, direction: 'out' })}>
                  All
                </button>
              }
            >
              <BarList
                rows={catRows.slice(0, 9).map((r) => ({ id: r.id || '__none', label: r.name, value: r.amount, color: r.id ? VIZ(r.slot) : 'var(--text-3)', sub: tM.spending > 0 ? `${Math.round((r.amount / tM.spending) * 100)}% · ${plural(r.count, 'transaction')}` : undefined }))}
                format={money0}
                onSelect={(id) => navigateSpace('transactions', id === '__none' ? { month, uncategorized: true } : { month, category: id })}
                empty={`No spending in ${monthLabel(month, true)}.`}
              />
            </FinCard>
          </div>

          <div className="fin-grid">
            <FinCard
              title={
                <span className="row" style={{ gap: 6 }}>
                  <PiggyBank size={14} /> Budget
                </span>
              }
              sub={budget.assigned > 0 || f.assignments.length ? `Age of Money ${budget.ageOfMoney == null ? '—' : plural(budget.ageOfMoney, 'day')}` : undefined}
              actions={
                <button type="button" className="fin-link" onClick={() => navigateSpace('budgets', { month })}>
                  {f.assignments.length ? 'Open budget' : 'Start budgeting'}
                </button>
              }
            >
              <div className="fin-list">
                <button type="button" className={`yb-rta ${budget.rta > 0.004 ? 'pos' : budget.rta < -0.004 ? 'neg' : 'zero'}`} style={{ gridTemplateColumns: 'minmax(0,1fr)', padding: '10px 12px', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => navigateSpace('budgets', { month })}>
                  <span className="yb-rta-main">
                    <span className="yb-rta-amt" style={{ fontSize: 22 }}>
                      {budget.rta < 0 ? `−${money0(-budget.rta)}` : money0(budget.rta)}
                    </span>
                    <span className="yb-rta-label">{budget.rta < -0.004 ? 'Assigned more than you have' : 'Ready to Assign'}</span>
                  </span>
                </button>
                {budget.overspent.slice(0, 4).map((r) => (
                  <button key={r.id} type="button" className="fin-li" onClick={() => navigateSpace('budgets', { month, categoryId: r.id })}>
                    <span className="fin-li-main">
                      <b>{r.name}</b>
                      <span>Overspent{r.creditOverspent > 0 && r.cashOverspent <= 0 ? ' on a card' : ''} — move money to cover it</span>
                    </span>
                    <span className="fin-li-side">
                      <span className={`yb-pill overspent ${r.creditOverspent > 0 && r.cashOverspent <= 0 ? 'credit' : ''}`}>−{money0(-r.available)}</span>
                    </span>
                  </button>
                ))}
                {budget.underfundedRows.slice(0, 4).map((r) => (
                  <button key={r.id} type="button" className="fin-li" onClick={() => navigateSpace('budgets', { month, categoryId: r.id })}>
                    <span className="fin-li-main">
                      <b>{r.name}</b>
                      <span>{r.info ? r.info.label(money0) : 'Target'}</span>
                    </span>
                    <span className="fin-li-side">
                      <span className="yb-pill underfunded">{money0(r.info?.need ?? 0)} needed</span>
                    </span>
                  </button>
                ))}
                {!budget.overspent.length && !budget.underfundedRows.length && (
                  <p className="fin-muted-note" style={{ margin: 0 }}>
                    {f.assignments.length ? 'No overspending and every target is funded this month.' : 'Give every dollar a job: assign the money you have to categories, set targets for your bills and true expenses, and watch Ready to Assign reach zero.'}
                  </p>
                )}
              </div>
            </FinCard>

            <FinCard title="Top merchants" sub={monthLabel(month, true)}>
              <BarList rows={merchants.map((m, i) => ({ id: m.key, label: m.name, value: m.amount, color: VIZ(0), sub: i < 8 ? plural(m.count, 'payment') : undefined }))} format={money0} onSelect={(key) => navigateSpace('transactions', { month, search: merchants.find((m) => m.key === key)?.name ?? '' })} empty="No spending yet this month." />
            </FinCard>

            <FinCard
              title={
                <span className="row" style={{ gap: 6 }}>
                  <CalendarClock size={14} /> Upcoming recurring
                </span>
              }
              sub={recurring.length ? `≈ ${money0(subsMonthly)} a month in repeating charges` : undefined}
            >
              {upcoming.length ? (
                <div className="fin-list">
                  {upcoming.slice(0, 8).map((r) => (
                    <button key={r.key} type="button" className="fin-li" onClick={() => navigateSpace('transactions', { search: r.merchant })}>
                      <span className="fin-li-main">
                        <b>{r.merchant}</b>
                        <span>
                          {fmt.dateMedium(r.nextDate)} · {r.cadence}
                          {r.isNew && r.count <= 3 ? ' · new' : ''}
                        </span>
                      </span>
                      <span className="fin-li-side">
                        <Amount value={r.amount} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="fin-muted-note" style={{ margin: 0 }}>
                  Subscriptions and bills are detected once they appear in two or more months of statements (or when you mark a transaction as recurring).
                </p>
              )}
            </FinCard>

            <FinCard
              title="Net worth"
              actions={
                <button type="button" className="fin-link" onClick={() => navigateSpace('accounts')}>
                  Accounts
                </button>
              }
            >
              {f.accounts.length ? (
                <div className="fin-list">
                  {f.accounts
                    .filter((a) => !a.archived)
                    .map((a) => (
                      <button key={a.id} type="button" className="fin-li" onClick={() => navigateSpace('accounts', { accountId: a.id })}>
                        <span className="fin-li-main">
                          <b>{a.name}</b>
                          <span>
                            {a.institution ? `${a.institution} · ` : ''}
                            {a.balanceDate ? `as of ${fmt.dateMedium(a.balanceDate)}` : 'no balance date'}
                          </span>
                        </span>
                        <span className="fin-li-side">{a.type === 'credit_card' || a.type === 'loan' ? <Amount value={-(a.balance ?? 0)} /> : <Amount value={a.balance ?? 0} signed={false} />}</span>
                      </button>
                    ))}
                  <div className="fin-li">
                    <span className="fin-li-main">
                      <b>Net worth</b>
                      {nw.utilization != null && <span>Credit used {pct(nw.utilization)}</span>}
                    </span>
                    <span className="fin-li-side">
                      <Amount value={nw.net} signed={false} strong />
                    </span>
                  </div>
                </div>
              ) : (
                <div className="col" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <p className="fin-muted-note" style={{ margin: 0 }}>
                    Add your accounts with their balances to track net worth and credit use.
                  </p>
                  <Button size="sm" icon={Plus} onClick={() => navigateSpace('accounts', { add: true })}>
                    Add an account
                  </Button>
                </div>
              )}
            </FinCard>
          </div>

          <div className="fin-grid-2">
            <FinCard
              title={
                <span className="row" style={{ gap: 6 }}>
                  <Lightbulb size={14} /> Insights & advice
                </span>
              }
              sub={insights.length || pinned.length ? `${plural(insights.length, 'insight')} from your data${pinned.length ? ` · ${pinned.length} pinned` : ''}` : undefined}
              actions={
                <button type="button" className="fin-link" onClick={() => navigateSpace('advice')}>
                  All advice
                </button>
              }
            >
              <div className="fin-insights">
                {pinned.slice(0, 3).map((i) => (
                  <SavedInsightItem key={i.id} i={i} />
                ))}
                {insights.slice(0, pinned.length ? 4 : 6).map((i) => (
                  <ComputedInsightItem key={i.key} i={i} />
                ))}
                {!insights.length && !pinned.length && (
                  <p className="fin-muted-note" style={{ margin: 0 }}>
                    <Bot size={13} style={{ verticalAlign: '-2px' }} /> Nothing stands out right now. Insights appear as more months are imported; advice your agents save shows up here when pinned.
                  </p>
                )}
                <NotAdviceNote>Educational estimates from your own data — not financial advice.</NotAdviceNote>
              </div>
            </FinCard>
            <AskAgentCard limit={3} compact />
          </div>
        </FinPage>
      </div>
    </div>
  );
}
