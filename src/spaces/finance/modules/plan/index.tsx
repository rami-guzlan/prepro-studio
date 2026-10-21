/* Plan: goals with progress and projected completion, a debt payoff planner
   (avalanche vs snowball), and a savings projection with "what if" sliders. */
import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Flag, LineChart as LineIcon, Plus, Target, Trophy } from 'lucide-react';
import { navigateSpace, useApp } from '@/store/app';
import { plural } from '@/lib/text';
import { LineChart, Meter, StatTile, compact } from '@/ui/charts';
import { Button, EmptyState, ExportMenu, Field, Menu, ModuleHeader, NumberInput, Select, Toolbar, UnderlineTabs } from '@/ui';
import type { GoalType } from '../../types';
import { GOAL_TYPES } from '../../types';
import { addMonthsISO, averageMonth, debtPayoff, debtsOf, defaultMinPayment, goalProgress, netWorth, round2, savingsProjection } from '../../calc';
import { updateFinance } from '../../ops';
import { GoalModal, goalTemplate } from '../../GoalModal';
import { Amount, FinCard, FinPage, NotAdviceNote, useFinance, useFmt, useToday } from '../../ui';

type Tab = 'goals' | 'debt' | 'savings';

export default function PlanModule() {
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [tab, setTab] = useState<Tab>('goals');
  useEffect(() => {
    if (params?.tab === 'goals' || params?.tab === 'debt' || params?.tab === 'savings') setTab(params.tab);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="module">
      <ModuleHeader title="Plan" icon={Target} subtitle="Goals, debt payoff and savings projections" actions={<ExportMenu docs={[{ id: 'space-fin-networth', label: 'Net worth & goals' }]} />} />
      <Toolbar>
        <div className="fin-tabscroll">
          <UnderlineTabs
            tabs={[
              { id: 'goals', label: 'Goals', icon: Flag },
              { id: 'debt', label: 'Debt payoff', icon: CreditCard },
              { id: 'savings', label: 'Savings projection', icon: LineIcon },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Toolbar>
      <div className="module-body">
        <FinPage>
          {tab === 'goals' ? <Goals /> : tab === 'debt' ? <DebtPlanner /> : <Savings />}
          <NotAdviceNote />
        </FinPage>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- goals */

function Goals() {
  const f = useFinance();
  const fmt = useFmt();
  const { today } = useToday();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof goalTemplate> | null>(null);
  const money0 = (n: number) => fmt.money(n, { cents: false });
  const goals = [...f.goals].sort((a, b) => Number(!!a.done) - Number(!!b.done));
  const addMenu = (
    <Menu
      align="end"
      trigger={
        <Button variant="primary" icon={Plus}>
          Add goal
        </Button>
      }
      items={GOAL_TYPES.map((t) => ({ label: t.label, onClick: () => setDraft(goalTemplate(t.value as GoalType)) }))}
    />
  );
  return (
    <>
      {!goals.length ? (
        <EmptyState
          icon={Flag}
          title="No goals yet"
          description="Goals turn a monthly amount into a date: an emergency fund, paying off a card, saving for gear or a deposit. Link a savings account and progress updates with its balance."
          action={
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" icon={Plus} onClick={() => setDraft(goalTemplate('emergency_fund'))}>
                Emergency fund
              </Button>
              <Button onClick={() => setDraft(goalTemplate('debt_payoff'))}>Pay off debt</Button>
              <Button onClick={() => setDraft(goalTemplate('purchase'))}>Big purchase</Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted small">
              {plural(goals.filter((g) => !g.done).length, 'active goal')} · {money0(goals.filter((g) => !g.done).reduce((s, g) => s + (g.monthly ?? 0), 0))} a month planned
            </span>
            {addMenu}
          </div>
          <div className="fin-goals">
            {goals.map((g) => {
              const p = goalProgress(g, f.accounts, today);
              const type = GOAL_TYPES.find((t) => t.value === g.type)?.label;
              return (
                <button key={g.id} type="button" className="fin-goal" onClick={() => setOpen(g.id)} style={g.done ? { opacity: 0.65 } : undefined}>
                  <div className="fin-goal-top">
                    <b>{g.name}</b>
                    {g.done || p.remaining <= 0 ? (
                      <span className="fin-badge good">
                        <Trophy size={11} /> Reached
                      </span>
                    ) : p.onTrack === true ? (
                      <span className="fin-badge good">On track</span>
                    ) : p.onTrack === false ? (
                      <span className="fin-badge warning">Behind</span>
                    ) : (
                      <span className="fin-badge">{type}</span>
                    )}
                  </div>
                  <div className="fin-goal-nums">
                    <strong>{money0(p.current)}</strong>
                    <span className="muted small">
                      of {money0(g.target)} · {Math.round(p.pct * 100)}%
                    </span>
                  </div>
                  <Meter value={p.current} max={g.target} tone={p.remaining <= 0 ? 'good' : p.onTrack === false ? 'warning' : undefined} label={`${g.name} progress`} />
                  <div className="fin-goal-facts">
                    <div>
                      <span>Monthly</span>
                      {g.monthly ? money0(g.monthly) : '—'}
                    </div>
                    <div>
                      <span>Projected</span>
                      {p.remaining <= 0 ? 'Done' : p.projectedDate ? fmt.dateMedium(p.projectedDate) : 'set a monthly amount'}
                    </div>
                    <div>
                      <span>Target date</span>
                      {g.targetDate ? fmt.dateMedium(g.targetDate) : '—'}
                    </div>
                    <div>
                      <span>Needed / month</span>
                      {p.requiredMonthly != null ? money0(p.requiredMonthly) : '—'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {open && <GoalModal id={open} onClose={() => setOpen(null)} />}
      {draft && <GoalModal initial={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

/* ---------------------------------------------------------------- debt payoff */

function DebtPlanner() {
  const f = useFinance();
  const fmt = useFmt();
  const { today } = useToday();
  const money0 = (n: number) => fmt.money(n, { cents: false });
  const debts = useMemo(() => debtsOf(f.accounts), [f.accounts]);
  const extra = f.settings.extraDebtPayment;
  const avg = useMemo(() => averageMonth(f, today), [f, today]);
  const setExtra = (n: number) =>
    updateFinance(
      (fd) => {
        fd.settings.extraDebtPayment = Math.max(0, Math.round(n));
      },
      { coalesce: 'fin-extra' },
    );
  const setAcct = (id: string, patch: { apr?: number; minPayment?: number }) =>
    updateFinance(
      (fd) => {
        const a = fd.accounts.find((x) => x.id === id);
        if (!a) return;
        for (const [k, v] of Object.entries(patch)) if (v == null) delete (a as any)[k];
          else (a as any)[k] = v;
      },
      { coalesce: `fin-acct:${id}:${Object.keys(patch).join(',')}` },
    );
  const av = useMemo(() => debtPayoff(debts, extra, 'avalanche', today), [debts, extra, today]);
  const sn = useMemo(() => debtPayoff(debts, extra, 'snowball', today), [debts, extra, today]);
  const base = useMemo(() => debtPayoff(debts, 0, 'avalanche', today), [debts, today]);

  if (!debts.length)
    return (
      <EmptyState
        icon={CreditCard}
        title="No debts to plan"
        description="Credit cards and loans with a balance show up here. Add them in Accounts with the balance owed, the APR and the minimum payment."
        action={
          <Button variant="primary" onClick={() => navigateSpace('accounts', { add: true })}>
            Go to Accounts
          </Button>
        }
      />
    );

  const max = Math.max(500, Math.ceil((Math.max(avg.net, 0) * 1.5) / 50) * 50, Math.ceil(extra / 50) * 50);
  const best = av.feasible && sn.feasible ? (av.totalInterest <= sn.totalInterest ? 'avalanche' : 'snowball') : av.feasible ? 'avalanche' : 'snowball';
  const toDate = (m: number) => addMonthsISO(today, m);
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const step = (series: { month: number; balance: number }[]) => (series.length > 120 ? series.filter((_, i) => i % 3 === 0 || i === series.length - 1) : series);

  return (
    <>
      <div className="fin-tiles">
        <StatTile label="Total debt" value={money0(total)} sub={plural(debts.length, 'account')} />
        <StatTile label="Minimum payments" value={money0(debts.reduce((s, d) => s + d.minPayment, 0))} sub="a month" />
        <StatTile label="Interest now" value={money0(debts.reduce((s, d) => s + (d.balance * d.apr) / 1200, 0))} sub="a month" />
        <StatTile label="Debt-free" value={av.debtFreeDate ? fmt.dateMedium(av.debtFreeDate) : 'Never'} sub={av.months ? `${plural(av.months, 'month')} with ${money0(extra)} extra` : 'payments don’t cover the interest'} deltaGood={!!av.feasible} />
      </div>
      <FinCard title="Your debts" sub="APR and minimum payment are saved on the account" flush>
        <div className="fin-table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Balance</th>
                <th className="num">APR %</th>
                <th className="num">Min. payment</th>
                <th className="num">Interest / month</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((d) => {
                const a = f.accounts.find((x) => x.id === d.id);
                return (
                  <tr key={d.id}>
                    <td>
                      <button type="button" className="fin-link" style={{ color: 'var(--text)' }} onClick={() => navigateSpace('accounts', { accountId: d.id })}>
                        {d.name}
                      </button>
                    </td>
                    <td className="num">{fmt.money(d.balance)}</td>
                    <td className="num" style={{ width: 110 }}>
                      <NumberInput size="sm" bare value={a?.apr} onChange={(apr) => setAcct(d.id, { apr })} placeholder="0" />
                    </td>
                    <td className="num" style={{ width: 130 }}>
                      <NumberInput size="sm" bare value={a?.minPayment} onChange={(minPayment) => setAcct(d.id, { minPayment })} placeholder={String(defaultMinPayment(d.balance, d.apr))} />
                    </td>
                    <td className="num">{fmt.money((d.balance * d.apr) / 1200)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FinCard>
      <FinCard title="Extra payment each month" sub={avg.months ? `Your average monthly surplus is ${money0(Math.max(0, avg.net))}` : undefined}>
        <div className="fin-sliders">
          <div className="fin-slider">
            <div className="fin-slider-top">
              <span>On top of the minimums</span>
              <b>{money0(extra)}</b>
            </div>
            <input type="range" min={0} max={max} step={10} value={Math.min(extra, max)} onChange={(e) => setExtra(Number(e.target.value))} aria-label="Extra monthly payment" />
          </div>
          <Field label="Exact amount">
            <NumberInput value={extra} onChange={(n) => setExtra(n ?? 0)} decimals={0} />
          </Field>
          <Field label="Plan I follow">
            <Select
              value={f.settings.payoffStrategy}
              options={[
                { value: 'avalanche', label: 'Avalanche — highest APR first' },
                { value: 'snowball', label: 'Snowball — smallest balance first' },
              ]}
              onChange={(v) =>
                updateFinance((fd) => {
                  fd.settings.payoffStrategy = v === 'snowball' ? 'snowball' : 'avalanche';
                })
              }
            />
          </Field>
        </div>
        {base.feasible && av.feasible && extra > 0 && (
          <p className="fin-footnote">
            Paying {money0(extra)} extra saves about <b>{money0(Math.max(0, base.totalInterest - av.totalInterest))}</b> in interest and <b>{plural(Math.max(0, (base.months ?? 0) - (av.months ?? 0)), 'month')}</b> compared with minimum payments only.
          </p>
        )}
      </FinCard>
      <div className="fin-compare">
        {[av, sn].map((r) => (
          <div key={r.strategy} className={`fin-strategy ${best === r.strategy && av.feasible ? 'best' : ''}`}>
            <h4>
              {r.strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}
              {best === r.strategy && r.feasible && <span className="fin-badge good">Least interest</span>}
              {f.settings.payoffStrategy === r.strategy && <span className="fin-badge accent">Your plan</span>}
            </h4>
            <span className="muted small">{r.strategy === 'avalanche' ? 'Pay the highest interest rate first — cheapest overall.' : 'Pay the smallest balance first — quick wins keep you motivated.'}</span>
            {r.feasible ? (
              <>
                <div className="fin-tiles">
                  <StatTile label="Debt-free in" value={plural(r.months ?? 0, 'month')} sub={fmt.dateMedium(r.debtFreeDate)} />
                  <StatTile label="Interest paid" value={money0(r.totalInterest)} sub={`${money0(r.monthlyPayment)} a month`} />
                </div>
                <ol>
                  {r.order.map((o) => (
                    <li key={o.id}>
                      {o.name} — paid off {o.month ? `in ${plural(o.month, 'month')} (${fmt.dateMedium(toDate(o.month))})` : 'now'}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="fin-notice">
                <span>The payments don’t cover the monthly interest, so the balance never reaches zero. Raise the minimum payments or the extra amount.</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <FinCard title="Balance over time">
        <LineChart
          ariaLabel="Total debt balance over time by strategy"
          yZero
          series={[
            { id: 'avalanche', label: 'Avalanche', points: step(av.series).map((p) => ({ x: toDate(p.month), y: p.balance })) },
            { id: 'snowball', label: 'Snowball', points: step(sn.series).map((p) => ({ x: toDate(p.month), y: p.balance })) },
            ...(extra > 0 && base.feasible ? [{ id: 'min', label: 'Minimums only', dashed: true, points: step(base.series).map((p) => ({ x: toDate(p.month), y: p.balance })) }] : []),
          ]}
          xFormat={(x) => String(x).slice(2, 7)}
          yFormat={compact}
          height={240}
        />
      </FinCard>
    </>
  );
}

/* ---------------------------------------------------------------- savings projection */

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; format: (n: number) => string }) {
  return (
    <div className="fin-slider">
      <div className="fin-slider-top">
        <span>{label}</span>
        <b>{format(value)}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(Math.max(value, min), max)} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

function Savings() {
  const f = useFinance();
  const fmt = useFmt();
  const { today } = useToday();
  const money0 = (n: number) => fmt.money(n, { cents: false });
  const avg = useMemo(() => averageMonth(f, today), [f, today]);
  const nw = useMemo(() => netWorth(f.accounts), [f.accounts]);
  const invested = f.accounts.filter((a) => !a.archived && (a.type === 'savings' || a.type === 'investment')).reduce((s, a) => s + (a.balance ?? 0), 0);
  const [start, setStart] = useState<number>(() => round2(invested));
  const [monthly, setMonthly] = useState<number>(() => Math.max(0, Math.round((avg.net + avg.saving) / 10) * 10));
  const [cut, setCut] = useState(0);
  const [earn, setEarn] = useState(0);
  const rate = f.settings.expectedReturn;
  const [whatRate, setWhatRate] = useState(rate);
  const setRate = (n: number) =>
    updateFinance(
      (fd) => {
        fd.settings.expectedReturn = n;
      },
      { coalesce: 'fin-rate' },
    );
  const base = useMemo(() => savingsProjection(start, monthly, rate, 10), [start, monthly, rate]);
  const what = useMemo(() => savingsProjection(start, monthly + cut + earn, whatRate, 10), [start, monthly, cut, earn, whatRate]);
  const changed = cut > 0 || earn > 0 || whatRate !== rate;
  const yearsShown = [1, 3, 5, 10];
  const yearDate = (y: number) => addMonthsISO(today, y * 12);

  return (
    <>
      <div className="fin-grid-2">
        <FinCard title="Your starting point" sub={avg.months ? `Based on your last ${plural(avg.months, 'month')}: ${money0(avg.income)} in, ${money0(avg.spending)} spent, ${money0(avg.saving)} moved to savings` : 'Import statements to fill these in from your history'}>
          <div className="fin-sliders">
            <Field label="Already saved / invested">
              <NumberInput value={start} onChange={(n) => setStart(n ?? 0)} decimals={0} />
            </Field>
            <Field label="Saved each month" hint="Average surplus + transfers to savings">
              <NumberInput value={monthly} onChange={(n) => setMonthly(Math.max(0, n ?? 0))} decimals={0} />
            </Field>
            <Slider label="Expected yearly return" value={rate} min={0} max={12} step={0.5} onChange={(n) => {
              setRate(n);
              if (!changed) setWhatRate(n);
            }} format={(n) => `${n}%`} />
          </div>
          <p className="fin-footnote">Net worth today: {money0(nw.net)}. Returns are an assumption (savings accounts ~3–5%, long-term stock indexes have averaged more but can fall). Inflation is not included.</p>
        </FinCard>
        <FinCard title="What if…" sub="Move the sliders to compare">
          <div className="col" style={{ gap: 14 }}>
            <Slider label="Spend less each month" value={cut} min={0} max={Math.max(500, Math.ceil((avg.spending * 0.4) / 50) * 50)} step={10} onChange={setCut} format={money0} />
            <Slider label="Earn more each month" value={earn} min={0} max={3000} step={50} onChange={setEarn} format={money0} />
            <Slider label="Yearly return" value={whatRate} min={0} max={12} step={0.5} onChange={setWhatRate} format={(n) => `${n}%`} />
            {changed && (
              <div className="fin-notice info">
                <span>
                  Saving {money0(monthly + cut + earn)} a month at {whatRate}% gives <b>{money0(what[5].value)}</b> in 5 years and <b>{money0(what[10].value)}</b> in 10 — {money0(what[10].value - base[10].value)} more than today’s plan.
                </span>
              </div>
            )}
            {changed && (
              <Button size="sm" onClick={() => { setCut(0); setEarn(0); setWhatRate(rate); }}>
                Reset
              </Button>
            )}
          </div>
        </FinCard>
      </div>
      <FinCard title="Projection" sub={`${money0(monthly)} a month at ${rate}%${changed ? ` vs ${money0(monthly + cut + earn)} at ${whatRate}%` : ''}`}>
        <LineChart
          ariaLabel="Projected savings over 10 years"
          yZero
          series={[
            { id: 'base', label: 'Current plan', points: base.map((p) => ({ x: yearDate(p.year), y: p.value })) },
            ...(changed ? [{ id: 'what', label: 'What if', points: what.map((p) => ({ x: yearDate(p.year), y: p.value })) }] : []),
            { id: 'contrib', label: 'Money put in', dashed: true, slot: 2, points: base.map((p) => ({ x: yearDate(p.year), y: p.contributed })) },
          ]}
          xFormat={(x) => String(x).slice(0, 4)}
          yFormat={compact}
          height={250}
        />
        <div className="fin-table-wrap" style={{ marginTop: 12 }}>
          <table className="fin-table fin-proj">
            <thead>
              <tr>
                <th>In</th>
                <th className="num">Current plan</th>
                <th className="num">Of which growth</th>
                {changed && <th className="num">What if</th>}
                {changed && <th className="num">Difference</th>}
              </tr>
            </thead>
            <tbody>
              {yearsShown.map((y) => (
                <tr key={y}>
                  <td>
                    {plural(y, 'year')} <span className="muted small">({yearDate(y).slice(0, 4)})</span>
                  </td>
                  <td className="num big">{money0(base[y].value)}</td>
                  <td className="num">{money0(base[y].value - base[y].contributed)}</td>
                  {changed && <td className="num big">{money0(what[y].value)}</td>}
                  {changed && (
                    <td className="num">
                      <Amount value={Math.round(what[y].value - base[y].value)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FinCard>
    </>
  );
}
