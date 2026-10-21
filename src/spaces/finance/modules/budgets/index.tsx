/* Budget (module id 'budgets'): a YNAB-style zero-based budget. Month selector,
   Ready to Assign banner, category groups with inline-editable Assigned,
   Activity and Available pills, target progress, a Move-money popover, an
   inspector (selected category or the whole month) with target editor and
   auto-assign helpers, and the four Rules of YNAB as contextual tips.
   The numbers come from ../../ynab.ts. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, ArrowRightLeft, ChevronDown, ChevronRight, CircleDollarSign, Eye, EyeOff, Lightbulb, ListChecks, PiggyBank, Sparkles, Target, Trash2, Wand2, X } from 'lucide-react';
import { navigateSpace, useApp } from '@/store/app';
import { plural, safeFileName } from '@/lib/text';
import { todayISO } from '@/lib/dates';
import { backend, exportCsv } from '@/backend';
import { Sparkline } from '@/ui/charts';
import { Button, ExportMenu, IconButton, Menu, ModuleHeader, NumberInput, Popover, Select, toast, Toolbar, type AnchorRect, type MenuItem } from '@/ui';
import type { FinTarget, TargetType } from '../../types';
import { TARGET_TYPES } from '../../types';
import { byCategory, catMap, merchantOf, monthLabel, monthOf, round2, shiftMonth, txOfMonth } from '../../calc';
import { applyAssignChanges, autoAssign, getFinance, moveMoney, patchCategory, setAssigned, setTarget, updateFinance } from '../../ops';
import { AUTO_ASSIGN, autoAssignPlan, budgetMonth, budgetTips, categoryHistory, isCcPaymentId, RTA_ID, YNAB_RULES, type AutoAssignMode, type CatRow, type MonthView } from '../../ynab';
import { Amount, CategoryDot, FinPage, MonthStepper, useFinance, useFmt, useToday } from '../../ui';
import { uid } from '@/lib/id';

/* ---------------------------------------------------------------- helpers */

/** Monthly targets for spending categories without one: the 3-month average, rounded up to 10. Returns how many were added. */
export function suggestTargets(): number {
  const f = getFinance();
  const cats = catMap(f);
  const cur = monthOf(todayISO(), f.settings.monthStartDay);
  const months = [1, 2, 3].map((i) => byCategory(txOfMonth(f.transactions, shiftMonth(cur, -i), f.settings.monthStartDay), cats));
  const have = new Set(f.targets.map((t) => t.categoryId));
  const withData = months.filter((m) => m.length).length || 1;
  const avg = new Map<string, number>();
  for (const m of months) for (const r of m) if (r.id) avg.set(r.id, (avg.get(r.id) ?? 0) + r.amount / withData);
  const add: FinTarget[] = [];
  for (const [id, a] of avg) {
    const c = cats.get(id);
    if (!c || have.has(id) || c.kind !== 'expense' || a < 10) continue;
    add.push({ id: uid('tgt'), categoryId: id, type: 'monthly', amount: Math.ceil(a / 10) * 10 });
  }
  if (add.length)
    updateFinance((fd) => {
      fd.targets.push(...add);
    });
  return add.length;
}

const LS_COLLAPSED = 'prepro.fin.budget.collapsed';
function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED) ?? '[]'));
  } catch {
    return new Set();
  }
}
function writeCollapsed(s: Set<string>) {
  try {
    localStorage.setItem(LS_COLLAPSED, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

const STATUS_LABEL: Record<CatRow['status'], string> = { overspent: 'Overspent', underfunded: 'Underfunded', funded: 'Funded', zero: 'Nothing assigned' };

function Pill({ row, money, onClick }: { row: Pick<CatRow, 'available' | 'status' | 'cashOverspent' | 'creditOverspent'>; money: (n: number) => string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const credit = row.status === 'overspent' && row.creditOverspent > 0 && row.cashOverspent <= 0;
  const text = row.available < 0 ? `−${money(-row.available)}` : money(row.available);
  const title = row.status === 'overspent' ? (credit ? 'Overspent on a credit card — move money here to cover it' : 'Overspent in cash — cover it or it comes out of next month’s Ready to Assign') : STATUS_LABEL[row.status];
  return (
    <button type="button" className={`yb-pill ${row.status} ${credit ? 'credit' : ''}`} onClick={onClick} title={`${title}${onClick ? ' · click to move money' : ''}`}>
      {text}
    </button>
  );
}

function TargetBar({ row }: { row: CatRow }) {
  if (!row.info) return null;
  const tone = row.status === 'overspent' ? 'critical' : row.info.met ? 'good' : 'warning';
  return (
    <span className={`yb-tbar ${tone}`} aria-hidden>
      <span style={{ width: `${Math.round(row.info.progress * 100)}%` }} />
    </span>
  );
}

/* ---------------------------------------------------------------- move money popover */

function MoveMoney({ view, row, anchor, onClose, money }: { view: MonthView; row: CatRow | null; anchor: AnchorRect | null; onClose: () => void; money: (n: number) => string }) {
  const over = row ? row.available < 0 : false;
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [other, setOther] = useState<string>(RTA_ID);
  useEffect(() => {
    if (!row) return;
    setAmount(round2(Math.abs(row.available)) || undefined);
    if (row.available < 0) {
      const src = [...view.rows].filter((r) => r.id !== row.id && r.available > 0 && !r.hidden).sort((a, b) => b.available - a.available)[0];
      setOther(view.rta > 0 || !src ? RTA_ID : src.id);
    } else setOther(RTA_ID);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!row) return null;
  const options = [
    { value: RTA_ID, label: `Ready to Assign (${money(view.rta)})` },
    ...view.rows.filter((r) => r.id !== row.id && (!r.hidden || r.available !== 0)).map((r) => ({ value: r.id, label: `${r.name} (${r.available < 0 ? '−' : ''}${money(Math.abs(r.available))})` })),
  ];
  const go = () => {
    if (!amount || amount <= 0) return;
    if (over) moveMoney(view.month, other, row.id, amount);
    else moveMoney(view.month, row.id, other, amount);
    toast(over ? `Covered ${row.name} with ${money(amount)}` : `Moved ${money(amount)} from ${row.name}`);
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} align="end" className="yb-move">
      <div className="yb-move-body" onKeyDown={(e) => e.key === 'Enter' && go()}>
        <b>{over ? `Cover overspending in ${row.name}` : `Move money from ${row.name}`}</b>
        <label className="yb-move-field">
          <span>Amount</span>
          <NumberInput size="sm" value={amount} onChange={setAmount} decimals={2} autoFocus />
        </label>
        <label className="yb-move-field">
          <span>{over ? 'From' : 'To'}</span>
          <Select size="sm" value={other} options={options} onChange={(v) => setOther(v || RTA_ID)} />
        </label>
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" icon={ArrowRightLeft} disabled={!amount || amount <= 0} onClick={go}>
            {over ? 'Cover' : 'Move'}
          </Button>
        </div>
      </div>
    </Popover>
  );
}

/* ---------------------------------------------------------------- target editor */

const REPEATS = [
  { value: '0', label: 'Once' },
  { value: '1', label: 'Every month' },
  { value: '3', label: 'Every 3 months' },
  { value: '6', label: 'Every 6 months' },
  { value: '12', label: 'Every year' },
];

function TargetEditor({ row, month }: { row: CatRow; month: string }) {
  const t = row.target;
  const [type, setType] = useState<TargetType>(t?.type ?? 'monthly');
  const [amount, setAmount] = useState<number | undefined>(t?.amount);
  const [date, setDate] = useState<string>(t?.date ?? shiftMonth(month, 6));
  const [repeat, setRepeat] = useState<string>(String(t?.repeatMonths ?? 0));
  const [editing, setEditing] = useState(!t);
  useEffect(() => {
    setType(t?.type ?? 'monthly');
    setAmount(t?.amount);
    setDate(t?.date ?? shiftMonth(month, 6));
    setRepeat(String(t?.repeatMonths ?? 0));
    setEditing(!t);
  }, [row.id, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const dated = type === 'by_date' || type === 'balance';
  const save = () => {
    if (!amount || amount <= 0) return;
    setTarget(row.id, { type, amount, date: dated && date ? date : undefined, repeatMonths: type === 'by_date' ? Number(repeat) || undefined : undefined });
    setEditing(false);
  };
  if (!editing && t)
    return (
      <div className="yb-target-view">
        <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
          <span className="yb-insp-label">
            <Target size={12} /> {TARGET_TYPES.find((x) => x.value === t.type)?.label}
          </span>
          <span className="row" style={{ gap: 2 }}>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <IconButton icon={Trash2} size="sm" label="Remove target" onClick={() => setTarget(row.id, null)} />
          </span>
        </div>
        {t.notes && <p className="fin-muted-note" style={{ margin: 0 }}>{t.notes}</p>}
      </div>
    );
  return (
    <div className="yb-target-edit">
      <div className="yb-insp-label">
        <Target size={12} /> {t ? 'Edit target' : 'Create a target'}
      </div>
      <div className="yb-target-types">
        {TARGET_TYPES.map((x) => (
          <button key={x.value} type="button" className={`yb-chip ${type === x.value ? 'on' : ''}`} onClick={() => setType(x.value)} title={x.hint}>
            {x.label}
          </button>
        ))}
      </div>
      <span className="fin-muted-note small">{TARGET_TYPES.find((x) => x.value === type)?.hint}</span>
      <div className="yb-target-fields">
        <label className="yb-move-field">
          <span>Amount</span>
          <NumberInput size="sm" value={amount} onChange={setAmount} decimals={2} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </label>
        {dated && (
          <label className="yb-move-field">
            <span>{type === 'balance' ? 'By (optional)' : 'By month'}</span>
            <input className="input sm" type="month" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        {type === 'by_date' && (
          <label className="yb-move-field">
            <span>Repeat</span>
            <Select size="sm" value={repeat} options={REPEATS} onChange={(v) => setRepeat(v || '0')} />
          </label>
        )}
      </div>
      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        {t && (
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button size="sm" variant="primary" disabled={!amount || amount <= 0} onClick={save}>
          Save target
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- inspectors */

function CategoryInspector({ row, view, onClose, money }: { row: CatRow; view: MonthView; onClose: () => void; money: (n: number) => string }) {
  const f = useFinance();
  const fmt = useFmt();
  const { today } = useToday();
  const month = view.month;
  const plans = useMemo(() => AUTO_ASSIGN.map((m) => ({ ...m, change: autoAssignPlan(f, month, m.value, [row.id], today)[0] })), [f, month, row.id, today]);
  const hist = useMemo(() => categoryHistory(f, row.id, month, 6, today), [f, row.id, month, today]);
  const sd = f.settings.monthStartDay;
  const txs = useMemo(() => {
    const list = row.kind === 'payment' ? f.transactions.filter((t) => t.accountId === row.accountId && t.transfer && t.amount > 0) : f.transactions.filter((t) => t.category === row.id);
    return list.filter((t) => monthOf(t.date, sd) === month).sort((a, b) => b.date.localeCompare(a.date));
  }, [f.transactions, row, month, sd]);
  const cat = f.categories.find((c) => c.id === row.id);
  return (
    <div className="yb-insp">
      <div className="yb-insp-head">
        <div className="yb-insp-title">
          <CategoryDot slot={row.slot} />
          <b>{row.name}</b>
          {row.kind === 'payment' && <span className="fin-badge">Card payment</span>}
        </div>
        <IconButton icon={X} size="sm" label="Close (show the month)" onClick={onClose} />
      </div>
      <div className="yb-insp-avail">
        <span className="muted small">Available</span>
        <Pill row={row} money={money} />
        <span className="small muted">{STATUS_LABEL[row.status]}{row.info && row.info.need > 0 ? ` · needs ${money(row.info.need)} more` : ''}</span>
      </div>
      {row.status === 'overspent' && (
        <p className="yb-callout critical">
          {row.creditOverspent > 0 && row.cashOverspent <= 0 ? `${money(row.creditOverspent)} overspent on a card: cover it, or it becomes card debt.` : `${money(row.cashOverspent)} overspent in cash: cover it, or it comes out of next month’s Ready to Assign.`} <b>Rule 3 — roll with the punches.</b>
        </p>
      )}
      {row.kind === 'payment' && row.cardBalance != null && (
        <p className={`yb-callout ${row.available + 0.005 >= row.cardBalance ? 'good' : 'warning'}`}>
          Card balance {money(row.cardBalance)}. {row.available + 0.005 >= row.cardBalance ? 'You can pay it in full.' : `${money(row.cardBalance - Math.max(0, row.available))} of it is debt not covered yet — assign extra here to pay it down.`}
        </p>
      )}

      <section className="yb-insp-sec">
        {row.info && (
          <div className="yb-target-progress">
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span className="small">{row.info.label(money)}</span>
              <span className="small muted">{Math.round(row.info.progress * 100)}%</span>
            </div>
            <TargetBar row={row} />
            <span className="small muted">
              {row.info.perMonth > 0 ? `${money(row.info.perMonth)} this month` : 'No monthly amount'}
              {row.info.monthsLeft ? ` · ${plural(row.info.monthsLeft, 'month')} left` : ''}
            </span>
          </div>
        )}
        <TargetEditor row={row} month={month} />
      </section>

      <section className="yb-insp-sec">
        <div className="yb-insp-label">
          <Wand2 size={12} /> Auto-assign
        </div>
        <div className="yb-quick">
          {plans.map((p) => (
            <button key={p.value} type="button" className="yb-quick-btn" disabled={!p.change} title={p.hint} onClick={() => p.change && applyAssignChanges(month, [p.change])}>
              <span>{p.label}</span>
              <b>{p.change ? money(p.change.to) : '—'}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="yb-insp-sec">
        <div className="yb-insp-label">{monthLabel(month, true)}</div>
        <div className="yb-stats">
          <span>Rolled over</span>
          <b>{money(row.carryIn)}</b>
          <span>Assigned</span>
          <b>{money(row.assigned)}</b>
          <span>Activity</span>
          <b>
            <Amount value={row.activity} />
          </b>
          <span>Available</span>
          <b>{row.available < 0 ? `−${money(-row.available)}` : money(row.available)}</b>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <Sparkline values={hist.map((h) => Math.max(0, -h.activity))} width={150} height={30} slot={row.slot} ariaLabel={`${row.name}: spending over the last 6 months`} />
          <span className="small muted">spent, last 6 months</span>
        </div>
      </section>

      <section className="yb-insp-sec">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="yb-insp-label">{row.kind === 'payment' ? 'Payments this month' : 'Transactions this month'}</span>
          {row.kind !== 'payment' && (
            <button type="button" className="fin-link" onClick={() => navigateSpace('transactions', { category: row.id, month })}>
              All <ArrowRight size={11} style={{ verticalAlign: '-1px' }} />
            </button>
          )}
        </div>
        {txs.length ? (
          <div className="yb-txs">
            {txs.slice(0, 8).map((t) => (
              <button key={t.id} type="button" className="yb-tx" onClick={() => navigateSpace('transactions', { transactionId: t.id })}>
                <span className="ellipsis">{merchantOf(t)}</span>
                <span className="muted small">{fmt.dateMedium(t.date)}</span>
                <Amount value={t.amount} />
              </button>
            ))}
            {txs.length > 8 && <span className="small muted">+ {txs.length - 8} more</span>}
          </div>
        ) : (
          <p className="fin-muted-note" style={{ margin: 0 }}>
            None yet.
          </p>
        )}
      </section>
      {cat && (
        <Button size="sm" variant="ghost" icon={cat.hidden ? Eye : EyeOff} onClick={() => patchCategory(cat.id, { hidden: !cat.hidden })}>
          {cat.hidden ? 'Show on the budget' : 'Hide from the budget'}
        </Button>
      )}
    </div>
  );
}

function MonthInspector({ view, money, onSelect, onCover }: { view: MonthView; money: (n: number) => string; onSelect: (id: string) => void; onCover: (row: CatRow, el: HTMLElement) => void }) {
  const f = useFinance();
  const tips = budgetTips(view, f, money);
  const ruleOn = new Set(tips.map((t) => t.rule));
  return (
    <div className="yb-insp">
      <div className="yb-insp-head">
        <div className="yb-insp-title">
          <b>{monthLabel(view.month, true)}</b>
        </div>
        <span className="small muted">All categories</span>
      </div>
      <div className="yb-stats">
        <span>Ready to Assign</span>
        <b className={view.rta < 0 ? 'neg' : ''}>{view.rta < 0 ? `−${money(-view.rta)}` : money(view.rta)}</b>
        <span>Assigned this month</span>
        <b>{money(view.assigned)}</b>
        <span>Activity</span>
        <b>
          <Amount value={view.activity} />
        </b>
        <span>Available</span>
        <b>{money(view.available)}</b>
        <span>Age of Money</span>
        <b>{view.ageOfMoney == null ? '—' : plural(view.ageOfMoney, 'day')}</b>
        <span>Underfunded</span>
        <b>{money(view.underfunded)}</b>
      </div>
      {view.overspent.length > 0 && (
        <section className="yb-insp-sec">
          <div className="yb-insp-label">Overspent</div>
          {view.overspent.map((r) => (
            <div key={r.id} className="yb-line">
              <button type="button" className="fin-link ellipsis" onClick={() => onSelect(r.id)}>
                {r.name}
              </button>
              <span className="yb-line-amt neg">−{money(-r.available)}</span>
              <Button size="sm" onClick={(e) => onCover(r, e.currentTarget)}>
                Cover
              </Button>
            </div>
          ))}
        </section>
      )}
      {view.underfundedRows.length > 0 && (
        <section className="yb-insp-sec">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="yb-insp-label">Underfunded targets</span>
            <Button size="sm" icon={Wand2} onClick={() => autoAssign(view.month, 'underfunded')}>
              Fund all {money(view.underfunded)}
            </Button>
          </div>
          {view.underfundedRows.map((r) => (
            <div key={r.id} className="yb-line">
              <button type="button" className="fin-link ellipsis" onClick={() => onSelect(r.id)}>
                {r.name}
              </button>
              <span className="yb-line-amt warn">{money(r.info?.need ?? 0)}</span>
            </div>
          ))}
        </section>
      )}
      <section className="yb-insp-sec">
        <div className="yb-insp-label">
          <Lightbulb size={12} /> The four rules
        </div>
        <ol className="yb-rules">
          {YNAB_RULES.map((r) => {
            const tip = tips.find((t) => t.rule === r.rule);
            return (
              <li key={r.rule} className={ruleOn.has(r.rule) ? `on ${tip?.tone ?? ''}` : ''}>
                <b>{r.title}</b>
                <span>{tip ? `${tip.title}. ${tip.body}` : r.body}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- CSV */

async function exportMonthCsv(view: MonthView, money: (n: number) => string) {
  const rows = view.groups.flatMap((g) => g.rows.filter((r) => !r.hidden || r.assigned || r.activity || r.available).map((r) => ({ g, r })));
  try {
    const path = await exportCsv(safeFileName(`Budget - ${monthLabel(view.month, true)}`), rows, [
      { header: 'Group', value: (x: (typeof rows)[number]) => x.g.label },
      { header: 'Category', value: (x) => x.r.name },
      { header: 'Rolled over', value: (x) => x.r.carryIn },
      { header: 'Assigned', value: (x) => x.r.assigned },
      { header: 'Activity', value: (x) => x.r.activity },
      { header: 'Available', value: (x) => x.r.available },
      { header: 'Status', value: (x) => STATUS_LABEL[x.r.status] },
      { header: 'Target', value: (x) => (x.r.info ? x.r.info.label(money) : '') },
      { header: 'Needed this month', value: (x) => x.r.info?.need ?? '' },
    ]);
    if (path) toast(`Exported the ${monthLabel(view.month, true)} budget to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind === 'web') toast('Budget CSV downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/* ---------------------------------------------------------------- the screen */

export default function BudgetModule() {
  const f = useFinance();
  const fmt = useFmt();
  const { today, month: current } = useToday();
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [month, setMonth] = useState(current);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [showHidden, setShowHidden] = useState(false);
  const [move, setMove] = useState<{ id: string; anchor: AnchorRect } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)) setMonth(params.month);
    if (typeof params?.categoryId === 'string') setSelected(params.categoryId);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n: number) => fmt.money(n);
  const view = useMemo(() => budgetMonth(f, month, today), [f, month, today]);
  const tips = useMemo(() => budgetTips(view, f, money), [view, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const selRow = selected ? view.rows.find((r) => r.id === selected) ?? null : null;
  const moveRow = move ? view.rows.find((r) => r.id === move.id) ?? null : null;
  const visibleRows = (rows: CatRow[]) => rows.filter((r) => showHidden || !r.hidden || Math.abs(r.available) > 0.004);
  const flat = view.groups.flatMap((g) => (collapsed.has(g.id) ? [] : visibleRows(g.rows)));
  const hiddenCount = view.rows.filter((r) => r.hidden).length;

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      writeCollapsed(n);
      return n;
    });
  const focusRow = (i: number) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-asg="${i}"] input`);
    if (el) el.focus();
  };
  const onAssignKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(e.shiftKey && e.key === 'Enter' ? i - 1 : i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(i - 1);
    } else if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
  };
  const openMove = (id: string, el: HTMLElement) => setMove({ id, anchor: el.getBoundingClientRect() });
  const runAuto = (mode: AutoAssignMode) => {
    const ch = autoAssign(month, mode);
    toast(ch.length ? `${AUTO_ASSIGN.find((a) => a.value === mode)?.label}: changed ${plural(ch.length, 'category', 'categories')}` : 'Nothing to change', ch.length ? 'success' : 'info');
  };
  const autoItems: MenuItem[] = [{ header: `Auto-assign · ${monthLabel(month)}` }, ...AUTO_ASSIGN.map((a) => ({ label: a.label, onClick: () => runAuto(a.value) }))];
  const suggest = () => {
    const n = suggestTargets();
    toast(n ? `Added ${plural(n, 'monthly target')} from your 3-month averages (rounded up)` : 'No new suggestions — every category you spend in already has a target, or there is not enough history yet', n ? 'success' : 'info');
  };

  const rtaTone = view.rta > 0.004 ? 'pos' : view.rta < -0.004 ? 'neg' : 'zero';
  let idx = -1;

  return (
    <div className="module">
      <ModuleHeader
        title="Budget"
        icon={PiggyBank}
        subtitle={`${monthLabel(month, true)} · give every dollar a job`}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-fin-budget-month', label: 'Monthly budget sheet', options: { month } }, { id: 'space-fin-budget', label: 'Budget vs spending report', options: { month } }]} csv={[{ label: `Budget ${monthLabel(month)} (CSV)`, onClick: () => void exportMonthCsv(view, money) }]} />
            <Menu align="end" trigger={<Button icon={Wand2}>Auto-assign</Button>} items={autoItems} />
          </>
        }
      />
      <Toolbar>
        <MonthStepper value={month} onChange={(m) => setMonth(m)} max={shiftMonth(current, 12)} />
        <div className="spacer" />
        {view.uncategorized.count > 0 && (
          <button type="button" className="fin-link" onClick={() => navigateSpace('transactions', { uncategorized: true, month })}>
            <ListChecks size={12} style={{ verticalAlign: '-2px' }} /> {plural(view.uncategorized.count, 'transaction')} to approve & categorise
          </button>
        )}
        {hiddenCount > 0 && (
          <Button size="sm" variant="ghost" icon={showHidden ? EyeOff : Eye} onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
          </Button>
        )}
      </Toolbar>
      <div className="module-body">
        <FinPage>
          <div className={`yb-rta ${rtaTone}`}>
            <div className="yb-rta-main">
              <span className="yb-rta-amt">{view.rta < 0 ? `−${money(-view.rta)}` : money(view.rta)}</span>
              <span className="yb-rta-label">{rtaTone === 'neg' ? 'Assigned more than you have' : rtaTone === 'pos' ? 'Ready to Assign' : 'All money assigned'}</span>
            </div>
            <div className="yb-rta-parts small">
              <span>+{money(view.parts.inflow)} in {monthLabel(month)}</span>
              {view.parts.overspentLastMonth > 0 && <span>−{money(view.parts.overspentLastMonth)} overspent in {monthLabel(shiftMonth(month, -1))}</span>}
              <span>−{money(view.parts.assignedThisMonth)} assigned</span>
              {view.parts.assignedInFuture !== 0 && <span>−{money(view.parts.assignedInFuture)} assigned in future months</span>}
            </div>
            <div className="yb-rta-act">
              {rtaTone === 'pos' && (
                <Menu align="end" trigger={<Button variant="primary" icon={CircleDollarSign}>Assign</Button>} items={autoItems} />
              )}
              {rtaTone === 'neg' && <span className="small">Take money back from categories that can wait.</span>}
            </div>
          </div>

          <div className="yb-kpis">
            <div className="yb-kpi" title="YNAB Age of Money: average age of the money in your last 10 outflows">
              <span>Age of Money</span>
              <b>{view.ageOfMoney == null ? '—' : plural(view.ageOfMoney, 'day')}</b>
            </div>
            <div className="yb-kpi">
              <span>Assigned</span>
              <b>{money(view.assigned)}</b>
            </div>
            <div className="yb-kpi">
              <span>Activity</span>
              <b>
                <Amount value={view.activity} />
              </b>
            </div>
            <div className="yb-kpi">
              <span>Available</span>
              <b>{money(view.available)}</b>
            </div>
            <div className={`yb-kpi ${view.underfunded > 0 ? 'warn' : ''}`}>
              <span>Underfunded</span>
              <b>{money(view.underfunded)}</b>
            </div>
          </div>

          {tips.length > 0 && (
            <div className="yb-tips">
              {tips.slice(0, 3).map((t) => (
                <div key={t.rule + t.title} className={`yb-tip ${t.tone}`}>
                  <span className="yb-tip-rule">Rule {t.rule}</span>
                  <span>
                    <b>{t.title}.</b> {t.body}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!f.targets.length && f.transactions.length > 0 && (
            <div className="yb-tip info">
              <span className="yb-tip-rule">
                <Sparkles size={12} />
              </span>
              <span>
                <b>Start from what you actually spend.</b> Add a monthly target to each category from your last 3 months, then use Auto-assign → Underfunded.{' '}
                <button type="button" className="fin-link" onClick={suggest}>
                  Suggest targets
                </button>
              </span>
            </div>
          )}

          <div className="yb-layout">
            <div className="card yb-table" ref={tableRef}>
              <div className="yb-row yb-head">
                <span>Category</span>
                <span className="num">Assigned</span>
                <span className="num yb-col-act">Activity</span>
                <span className="num">Available</span>
              </div>
              <button type="button" className={`yb-row yb-all ${!selRow ? 'sel' : ''}`} onClick={() => setSelected(null)}>
                <span>All categories</span>
                <span className="num">{money(view.assigned)}</span>
                <span className="num yb-col-act">
                  <Amount value={view.activity} />
                </span>
                <span className="num">{money(view.available)}</span>
              </button>
              {view.groups.map((g) => {
                const open = !collapsed.has(g.id);
                const rows = visibleRows(g.rows);
                if (!rows.length) return null;
                return (
                  <div key={g.id} className="yb-group">
                    <button type="button" className="yb-row yb-grow" onClick={() => toggle(g.id)} aria-expanded={open}>
                      <span className="yb-gname">
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {g.label}
                        {g.need > 0 && <span className="yb-need">needs {money(g.need)}</span>}
                      </span>
                      <span className="num">{money(g.assigned)}</span>
                      <span className="num yb-col-act">
                        <Amount value={g.activity} />
                      </span>
                      <span className="num">{money(g.available)}</span>
                    </button>
                    {open &&
                      rows.map((r) => {
                        idx++;
                        const i = idx;
                        return (
                          <div key={r.id} className={`yb-row yb-cat ${selected === r.id ? 'sel' : ''} ${r.hidden ? 'hidden' : ''}`} onClick={() => setSelected(r.id)}>
                            <span className="yb-cname">
                              <span className="yb-cname-top">
                                <CategoryDot slot={r.slot} />
                                <span className="ellipsis">{r.name}</span>
                                {r.status === 'underfunded' && r.info && <span className="yb-need">{money(r.info.need)} more needed</span>}
                              </span>
                              <TargetBar row={r} />
                            </span>
                            <span className="num yb-asg" data-asg={i} onClick={(e) => e.stopPropagation()} onFocusCapture={() => setSelected(r.id)}>
                              <NumberInput bare size="sm" value={r.assigned} decimals={2} onChange={(v) => setAssigned(month, r.id, v ?? 0)} onKeyDown={(e) => onAssignKey(e, i)} aria-label={`Assigned to ${r.name}`} />
                            </span>
                            <span className="num yb-col-act">
                              <button
                                type="button"
                                className="yb-act"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isCcPaymentId(r.id)) navigateSpace('transactions', { category: r.id, month });
                                }}
                                title={isCcPaymentId(r.id) ? 'Funded card spending minus payments' : 'Show the transactions'}
                              >
                                <Amount value={r.activity} />
                              </button>
                            </span>
                            <span className="num">
                              <Pill
                                row={r}
                                money={money}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(r.id);
                                  openMove(r.id, e.currentTarget);
                                }}
                              />
                            </span>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
              {view.uncategorized.count > 0 && (
                <div className="yb-row yb-cat yb-uncat">
                  <span className="yb-cname">
                    <span className="yb-cname-top">
                      <CategoryDot />
                      <span className="ellipsis">Uncategorised</span>
                    </span>
                  </span>
                  <span className="num">
                    <Button size="sm" onClick={() => navigateSpace('transactions', { uncategorized: true, month })}>
                      Approve & categorise
                    </Button>
                  </span>
                  <span className="num yb-col-act">
                    <Amount value={-view.uncategorized.amount} />
                  </span>
                  <span className="num">
                    <span className="yb-pill overspent" title="Uncategorised spending counts as overspending until you categorise it">
                      −{money(view.uncategorized.amount)}
                    </span>
                  </span>
                </div>
              )}
              {flat.length === 0 && <p className="fin-muted-note" style={{ padding: 14, margin: 0 }}>Every group is collapsed.</p>}
            </div>
            <aside className="card yb-side">
              {selRow ? <CategoryInspector row={selRow} view={view} onClose={() => setSelected(null)} money={money} /> : <MonthInspector view={view} money={money} onSelect={setSelected} onCover={(r, el) => openMove(r.id, el)} />}
            </aside>
          </div>
          <p className="fin-footnote">
            Assigned amounts are yours to change any time. Positive Available rolls over to next month; cash overspending comes out of next month’s Ready to Assign and card overspending becomes card debt. Keyboard: Enter / ↓ next category, ↑ previous, Esc to finish.
          </p>
        </FinPage>
      </div>
      <MoveMoney view={view} row={moveRow} anchor={move?.anchor ?? null} onClose={() => setMove(null)} money={money} />
    </div>
  );
}
