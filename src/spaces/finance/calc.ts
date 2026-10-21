/* Pure finance calculations shared by the screens, the printed documents, the
   agent tools and the coach summary: months, totals, categories, merchants,
   budgets, recurring charges, net worth, insights and projections.
   Nothing here touches the store. */
import { addDays, diffDays, MONTHS_LONG, MONTHS_SHORT, pad2, parseISODate, toISODate } from '@/lib/dates';
import type { CategoryKind, FinAccount, FinanceData, FinBudget, FinCategory, FinGoal, FinTransaction } from './types';
import { ACCOUNT_TYPE_BY_ID, isDebtType } from './types';
import { budgetMonth, computeBudget } from './ynab';

/* ---------------------------------------------------------------- months & periods */

export function shiftMonth(key: string, n: number): string {
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return `${y}-${pad2(m + 1)}`;
}

/** Budget month ('YYYY-MM') a date belongs to; with a start day > 1 the month runs from that day. */
export function monthOf(date: string, startDay = 1): string {
  const key = date.slice(0, 7);
  if (startDay > 1 && Number(date.slice(8, 10)) < startDay) return shiftMonth(key, -1);
  return key;
}

export function monthRange(key: string, startDay = 1): { from: string; to: string } {
  const from = `${key}-${pad2(startDay)}`;
  return { from, to: addDays(`${shiftMonth(key, 1)}-${pad2(startDay)}`, -1) };
}

export function monthLabel(key: string, long = false): string {
  const m = Number(key.slice(5, 7)) - 1;
  if (!(m >= 0 && m < 12)) return key;
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m]} ${key.slice(0, 4)}`;
}

/** n month keys ending with `key` (oldest first). */
export function monthsBack(key: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(key, i - n + 1));
}

export function addMonthsISO(iso: string, n: number): string {
  const d = parseISODate(iso) ?? new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export type PeriodId = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'ytd' | 'all' | 'custom';
export const PERIODS: { value: PeriodId; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
  /** budget months covered (oldest first) */
  months: string[];
}

/** Date range of a named period ('last_3_months' = the 3 full months before this one). */
export function periodRange(period: PeriodId, today: string, startDay = 1, from?: string, to?: string, txs?: FinTransaction[]): PeriodRange {
  const cur = monthOf(today, startDay);
  const span = (first: string, last: string, label: string): PeriodRange => {
    const months: string[] = [];
    for (let k = first; k <= last && months.length < 600; k = shiftMonth(k, 1)) months.push(k);
    return { from: monthRange(first, startDay).from, to: monthRange(last, startDay).to, label, months };
  };
  switch (period) {
    case 'this_month':
      return span(cur, cur, monthLabel(cur, true));
    case 'last_month':
      return span(shiftMonth(cur, -1), shiftMonth(cur, -1), monthLabel(shiftMonth(cur, -1), true));
    case 'last_3_months':
      return span(shiftMonth(cur, -3), shiftMonth(cur, -1), 'Last 3 months');
    case 'last_6_months':
      return span(shiftMonth(cur, -6), shiftMonth(cur, -1), 'Last 6 months');
    case 'last_12_months':
      return span(shiftMonth(cur, -12), shiftMonth(cur, -1), 'Last 12 months');
    case 'ytd':
      return span(`${today.slice(0, 4)}-01`, cur, `${today.slice(0, 4)} to date`);
    case 'custom': {
      const f = from || today;
      const t = to && to >= f ? to : today;
      const months: string[] = [];
      for (let k = monthOf(f, startDay); k <= monthOf(t, startDay) && months.length < 600; k = shiftMonth(k, 1)) months.push(k);
      return { from: f, to: t, label: `${f} – ${t}`, months };
    }
    case 'all':
    default: {
      const dates = (txs ?? []).map((t) => t.date).sort();
      if (!dates.length) return span(cur, cur, 'All time');
      const r = span(monthOf(dates[0], startDay), monthOf(dates[dates.length - 1], startDay), 'All time');
      return r;
    }
  }
}

export const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

/* ---------------------------------------------------------------- categories & merchants */

export type CatMap = Map<string, FinCategory>;
export const catMap = (f: Pick<FinanceData, 'categories'>): CatMap => new Map(f.categories.map((c) => [c.id, c]));

/** How a transaction counts: income, spending, saving or transfer (ignored). */
export function flowOf(t: FinTransaction, cats: CatMap): CategoryKind {
  if (t.transfer) return 'transfer';
  const c = t.category ? cats.get(t.category) : undefined;
  if (c) return c.kind;
  return t.amount > 0 ? 'income' : 'expense';
}

const PROCESSORS = new Set(['sq', 'tst', 'paypal', 'pp', 'sp', 'py', 'ckc', 'dd', 'google', 'apple', 'pos', 'ic', 'lev', 'bt', 'fs', 'sms', 'clv', 'pym', 'ppl']);

/** A readable merchant name from a bank description ("SQ *BLUE BOTTLE 0423 OAKLAND CA" → "Blue Bottle Oakland"). */
export function cleanDescription(desc: string): string {
  let s = (desc ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Unknown';
  for (let i = 0; i < 3; i++)
    s = s.replace(/^(pos|debit card|debit|dbt|purchase|card purchase|recurring payment|recurring|ach( debit| credit)?|checkcard|check card|visa|mastercard|pre-?authorized|preauth|online|electronic|withdrawal|payment to|bill pay|web pmt|pmt)\b[\s:-]*/i, '');
  const star = s.indexOf('*');
  if (star > 0) {
    const before = s.slice(0, star).trim();
    const after = s.slice(star + 1).trim();
    s = PROCESSORS.has(before.toLowerCase()) && after ? after : before || after;
  }
  s = s
    .replace(/\b(x{2,}|\*{2,}|#)\d+\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b(ref|id|conf|trace|auth)[#:]?\s*\w+/gi, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s#\s*\d*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // trailing "CITY ST" state codes on all-caps descriptions
  if (s === s.toUpperCase()) s = s.replace(/\s[A-Z]{2}$/, '');
  if (s === s.toUpperCase() || s === s.toLowerCase())
    s = s
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Llc|Inc|Usa|Us|Uk|Atm|Ach|Ira|Hbo|Amc|Ups|Usps|Aws|Bp|Cvs)\b/g, (m) => m.toUpperCase());
  return (s || desc.trim()).slice(0, 48);
}

export function merchantOf(t: Pick<FinTransaction, 'merchant' | 'description'>): string {
  return t.merchant?.trim() || cleanDescription(t.description);
}

export const merchantKey = (t: Pick<FinTransaction, 'merchant' | 'description'>) => merchantOf(t).toLowerCase();

/* ---------------------------------------------------------------- totals */

export interface Totals {
  income: number;
  spending: number;
  saving: number;
  /** income − spending */
  net: number;
  /** (income − spending) / income, null without income */
  savingsRate: number | null;
  count: number;
}

export function totals(txs: FinTransaction[], cats: CatMap): Totals {
  let income = 0;
  let spending = 0;
  let saving = 0;
  let count = 0;
  for (const t of txs) {
    const k = flowOf(t, cats);
    if (k === 'transfer') continue;
    count++;
    if (k === 'income') income += t.amount;
    else if (k === 'saving') saving -= t.amount;
    else spending -= t.amount;
  }
  income = round2(income);
  spending = round2(spending);
  saving = round2(saving);
  const net = round2(income - spending);
  return { income, spending, saving, net, savingsRate: income > 0 ? net / income : null, count };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CategoryRow {
  id: string;
  name: string;
  slot: number;
  amount: number;
  count: number;
}

/** Spending (or saving / income) per category, largest first. Uncategorised spending has id ''. */
export function byCategory(txs: FinTransaction[], cats: CatMap, kind: CategoryKind = 'expense'): CategoryRow[] {
  const map = new Map<string, CategoryRow>();
  for (const t of txs) {
    if (flowOf(t, cats) !== kind) continue;
    const c = t.category ? cats.get(t.category) : undefined;
    const id = c?.id ?? '';
    const row = map.get(id) ?? { id, name: c?.name ?? 'Uncategorised', slot: c?.slot ?? 7, amount: 0, count: 0 };
    row.amount += kind === 'income' ? t.amount : -t.amount;
    row.count++;
    map.set(id, row);
  }
  return [...map.values()].map((r) => ({ ...r, amount: round2(r.amount) })).filter((r) => Math.abs(r.amount) > 0.004).sort((a, b) => b.amount - a.amount);
}

export interface MerchantRow {
  key: string;
  name: string;
  amount: number;
  count: number;
  category?: string;
}

export function byMerchant(txs: FinTransaction[], cats: CatMap, kind: CategoryKind = 'expense'): MerchantRow[] {
  const map = new Map<string, MerchantRow>();
  for (const t of txs) {
    if (flowOf(t, cats) !== kind) continue;
    const key = merchantKey(t);
    const row = map.get(key) ?? { key, name: merchantOf(t), amount: 0, count: 0, category: t.category };
    row.amount += kind === 'income' ? t.amount : -t.amount;
    row.count++;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, amount: round2(r.amount) })).filter((r) => r.amount > 0.004).sort((a, b) => b.amount - a.amount);
}

export interface MonthRow extends Totals {
  key: string;
}

export function monthlySeries(txs: FinTransaction[], cats: CatMap, keys: string[], startDay = 1): MonthRow[] {
  const by = new Map<string, FinTransaction[]>(keys.map((k) => [k, []]));
  for (const t of txs) by.get(monthOf(t.date, startDay))?.push(t);
  return keys.map((key) => ({ key, ...totals(by.get(key) ?? [], cats) }));
}

export function txOfMonth(txs: FinTransaction[], key: string, startDay = 1): FinTransaction[] {
  return txs.filter((t) => monthOf(t.date, startDay) === key);
}

/** Average income / spending / net of the last `n` full months before `today`'s month (only months with data). */
export function averageMonth(f: FinanceData, today: string, n = 3): Totals & { months: number } {
  const cats = catMap(f);
  const cur = monthOf(today, f.settings.monthStartDay);
  const keys = monthsBack(shiftMonth(cur, -1), n);
  const rows = monthlySeries(f.transactions, cats, keys, f.settings.monthStartDay).filter((r) => r.count > 0);
  const m = rows.length;
  if (!m) return { income: 0, spending: 0, saving: 0, net: 0, savingsRate: null, count: 0, months: 0 };
  const avg = (k: 'income' | 'spending' | 'saving') => round2(rows.reduce((s, r) => s + r[k], 0) / m);
  const income = avg('income');
  const spending = avg('spending');
  return { income, spending, saving: avg('saving'), net: round2(income - spending), savingsRate: income > 0 ? (income - spending) / income : null, count: Math.round(rows.reduce((s, r) => s + r.count, 0) / m), months: m };
}

/* ---------------------------------------------------------------- budgets */

export interface BudgetRow {
  /** the category's money for the month: amount = rolled over + assigned (YNAB budget, see ynab.ts) */
  budget: FinBudget;
  category: FinCategory;
  spent: number;
  /** Available at the end of the month (negative = overspent) */
  left: number;
  /** spent / budget */
  pct: number;
  tone: 'good' | 'warning' | 'critical';
  /** average spent in the 3 months before */
  avg3: number;
}

/** Budget status per category for a month, from the YNAB-style budget (categories with money assigned,
    a target, or spending that overspent them). `elapsed` (0–1) = how far into the month we are (pace warnings). */
export function budgetRows(f: FinanceData, key: string, elapsed = 1): BudgetRow[] {
  const cats = catMap(f);
  const st = computeBudget(f, key);
  const mc = st.byMonth.get(key);
  if (!mc) return [];
  const targets = new Set(f.targets.map((t) => t.categoryId));
  const out: BudgetRow[] = [];
  for (const c of mc.cats.values()) {
    const cat = cats.get(c.id);
    if (!cat) continue;
    const money = round2(c.carryIn + c.assigned);
    const spent = round2(Math.max(0, -c.activity));
    if (money <= 0 && !(targets.has(c.id) && spent > 0) && c.available >= 0) continue;
    const pct = money > 0 ? spent / money : spent > 0 ? Infinity : 0;
    const pace = elapsed > 0.05 ? pct / elapsed : pct;
    const tone: BudgetRow['tone'] = c.available < -0.004 ? 'critical' : pct > 0.9 || (elapsed < 0.9 && pace > 1.15 && pct > 0.5) ? 'warning' : 'good';
    const prev = [1, 2, 3].map((i) => Math.max(0, -(st.byMonth.get(shiftMonth(key, -i))?.cats.get(c.id)?.activity ?? 0)));
    out.push({ budget: { id: c.id, category: c.id, amount: money }, category: cat, spent, left: c.available, pct, tone, avg3: round2(prev.reduce((s2, x) => s2 + x, 0) / 3) });
  }
  return out;
}

/** How far through a budget month `today` is (0–1; 1 for past months). */
export function monthElapsed(key: string, today: string, startDay = 1): number {
  const { from, to } = monthRange(key, startDay);
  if (today > to) return 1;
  if (today < from) return 0;
  return (diffDays(from, today) + 1) / (diffDays(from, to) + 1);
}

/* ---------------------------------------------------------------- recurring charges */

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
const CADENCE_DAYS: Record<Cadence, number> = { weekly: 7, biweekly: 14, monthly: 30.44, quarterly: 91.3, yearly: 365.25 };

export interface Recurring {
  key: string;
  merchant: string;
  /** typical amount (signed like the transactions) */
  amount: number;
  cadence: Cadence;
  /** cost per month (positive for charges, negative for income) */
  monthly: number;
  firstDate: string;
  lastDate: string;
  nextDate: string;
  count: number;
  category?: string;
  accountId?: string;
  /** first seen in the last 75 days */
  isNew: boolean;
  /** charge (money out) */
  charge: boolean;
  ids: string[];
}

function cadenceOf(days: number): Cadence | null {
  if (days >= 5 && days <= 9) return 'weekly';
  if (days >= 12 && days <= 17) return 'biweekly';
  if (days >= 25 && days <= 36) return 'monthly';
  if (days >= 80 && days <= 100) return 'quarterly';
  if (days >= 340 && days <= 390) return 'yearly';
  return null;
}

/** Repeating charges and income detected from history (plus anything marked recurring). Next due date first. */
export function detectRecurring(f: Pick<FinanceData, 'transactions' | 'categories'>, today: string): Recurring[] {
  const cats = catMap(f);
  const groups = new Map<string, FinTransaction[]>();
  for (const t of f.transactions) {
    if (flowOf(t, cats) === 'transfer' || !t.amount) continue;
    const key = `${merchantKey(t)}|${t.amount < 0 ? 'out' : 'in'}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const flagged = sorted.some((t) => t.recurring);
    if (sorted.length < 2 && !flagged) continue;
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const g = diffDays(sorted[i - 1].date, sorted[i].date);
      if (g > 2) gaps.push(g);
    }
    gaps.sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 30;
    const cadence = cadenceOf(median) ?? (flagged ? 'monthly' : null);
    if (!cadence) continue;
    // ≥ 3 regular hits, or 2 + flagged / subscription category
    const regular = gaps.filter((g) => cadenceOf(g) === cadence).length;
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const lo = Math.min(...amounts);
    const hi = Math.max(...amounts);
    const steady = hi <= lo * 1.35 + 2;
    const last = sorted[sorted.length - 1];
    const subCat = last.category ? cats.get(last.category) : undefined;
    const likely = flagged || (steady && (regular >= 2 || (regular >= 1 && (last.category === 'subscriptions' || last.category === 'housing' || last.category === 'utilities' || subCat?.kind === 'income'))));
    if (!likely) continue;
    const step = CADENCE_DAYS[cadence];
    const lastDate = last.date;
    // stale: missed two cycles
    if (diffDays(lastDate, today) > step * 2.2 + 5) continue;
    let nextDate = cadence === 'monthly' ? addMonthsISO(lastDate, 1) : cadence === 'quarterly' ? addMonthsISO(lastDate, 3) : cadence === 'yearly' ? addMonthsISO(lastDate, 12) : addDays(lastDate, Math.round(step));
    let guard = 0;
    while (nextDate < today && guard++ < 24) nextDate = cadence === 'monthly' ? addMonthsISO(nextDate, 1) : cadence === 'quarterly' ? addMonthsISO(nextDate, 3) : cadence === 'yearly' ? addMonthsISO(nextDate, 12) : addDays(nextDate, Math.round(step));
    const recent = sorted.slice(-3);
    const amount = round2(recent.reduce((s, t) => s + t.amount, 0) / recent.length);
    out.push({
      key,
      merchant: merchantOf(last),
      amount,
      cadence,
      monthly: round2((-amount * 30.44) / step),
      firstDate: sorted[0].date,
      lastDate,
      nextDate,
      count: sorted.length,
      category: last.category,
      accountId: last.accountId,
      isNew: diffDays(sorted[0].date, today) <= 75,
      charge: amount < 0,
      ids: sorted.map((t) => t.id),
    });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/* ---------------------------------------------------------------- accounts & net worth */

export interface NetWorth {
  assets: number;
  debts: number;
  net: number;
  /** total credit used / total limit of cards with a limit */
  utilization: number | null;
  creditUsed: number;
  creditLimit: number;
  liquid: number;
}

export function netWorth(accounts: FinAccount[]): NetWorth {
  let assets = 0;
  let debts = 0;
  let creditUsed = 0;
  let creditLimit = 0;
  let liquid = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const b = a.balance ?? 0;
    if (isDebtType(a.type)) {
      debts += b;
      if (a.type === 'credit_card' && a.creditLimit && a.creditLimit > 0) {
        creditUsed += Math.max(0, b);
        creditLimit += a.creditLimit;
      }
    } else {
      assets += b;
      if (a.type === 'checking' || a.type === 'savings' || a.type === 'cash') liquid += b;
    }
  }
  return { assets: round2(assets), debts: round2(debts), net: round2(assets - debts), utilization: creditLimit > 0 ? creditUsed / creditLimit : null, creditUsed: round2(creditUsed), creditLimit: round2(creditLimit), liquid: round2(liquid) };
}

export const accountLabel = (a: FinAccount | undefined) => (a ? `${a.name}${a.last4 ? ` ··${a.last4}` : ''}` : 'No account');
export const accountTypeLabel = (a: FinAccount) => ACCOUNT_TYPE_BY_ID[a.type]?.short ?? a.type;

/* ---------------------------------------------------------------- goals */

export interface GoalProgress {
  current: number;
  remaining: number;
  pct: number;
  /** months to reach the target at the monthly contribution (0 = reached, null = no contribution) */
  monthsLeft: number | null;
  projectedDate: string | null;
  /** monthly amount needed to hit the target date */
  requiredMonthly: number | null;
  /** reaches the target by the target date */
  onTrack: boolean | null;
}

export function goalProgress(g: FinGoal, accounts: FinAccount[], today: string): GoalProgress {
  const acct = g.accountId ? accounts.find((a) => a.id === g.accountId) : undefined;
  let current = g.current ?? 0;
  if (acct && acct.balance != null) current = isDebtType(acct.type) ? Math.max(0, g.target - acct.balance) : acct.balance;
  current = round2(current);
  const remaining = round2(Math.max(0, g.target - current));
  const pct = g.target > 0 ? Math.min(1, Math.max(0, current / g.target)) : 0;
  const monthly = g.monthly ?? 0;
  const monthsLeft = remaining <= 0 ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null;
  const projectedDate = monthsLeft == null ? null : addMonthsISO(today, monthsLeft);
  let requiredMonthly: number | null = null;
  if (g.targetDate && remaining > 0) {
    const months = Math.max(1, Math.round(diffDays(today, g.targetDate) / 30.44));
    requiredMonthly = g.targetDate > today ? round2(remaining / months) : remaining;
  }
  const onTrack = g.targetDate ? (remaining <= 0 ? true : projectedDate != null && projectedDate <= g.targetDate) : null;
  return { current, remaining, pct, monthsLeft, projectedDate, requiredMonthly, onTrack };
}

/* ---------------------------------------------------------------- debt payoff */

export interface Debt {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
}

export interface PayoffResult {
  strategy: 'avalanche' | 'snowball';
  feasible: boolean;
  months: number | null;
  totalInterest: number;
  debtFreeDate: string | null;
  monthlyPayment: number;
  order: { id: string; name: string; month: number | null; interest: number }[];
  /** total balance at the start of each month */
  series: { month: number; balance: number }[];
}

/** Assumed minimum payment when none is set: 2% of the balance or the interest + 1%, at least 25. */
export function defaultMinPayment(balance: number, apr: number): number {
  return Math.ceil(Math.max(25, balance * 0.02, (balance * apr) / 1200 + balance * 0.01));
}

export function debtsOf(accounts: FinAccount[]): Debt[] {
  return accounts
    .filter((a) => !a.archived && isDebtType(a.type) && (a.balance ?? 0) > 0)
    .map((a) => ({ id: a.id, name: accountLabel(a), balance: a.balance ?? 0, apr: a.apr ?? 0, minPayment: a.minPayment && a.minPayment > 0 ? a.minPayment : defaultMinPayment(a.balance ?? 0, a.apr ?? 0) }));
}

/** Month-by-month simulation: pay every minimum, put the extra (and freed-up minimums) on the target debt. */
export function debtPayoff(debts: Debt[], extra: number, strategy: 'avalanche' | 'snowball', today: string): PayoffResult {
  const bal = debts.map((d) => d.balance);
  const budget = debts.reduce((s, d) => s + d.minPayment, 0) + Math.max(0, extra);
  const interest = debts.map(() => 0);
  const paidMonth: (number | null)[] = debts.map((d) => (d.balance <= 0 ? 0 : null));
  const series = [{ month: 0, balance: round2(bal.reduce((s, b) => s + b, 0)) }];
  let month = 0;
  const firstInterest = debts.reduce((s, d) => s + (d.balance * d.apr) / 1200, 0);
  let feasible = budget > firstInterest + 0.01 && debts.length > 0;
  while (feasible && bal.some((b) => b > 0.005) && month < 600) {
    month++;
    for (let i = 0; i < debts.length; i++) {
      if (bal[i] <= 0) continue;
      const it = (bal[i] * debts[i].apr) / 1200;
      interest[i] += it;
      bal[i] += it;
    }
    let left = budget;
    for (let i = 0; i < debts.length; i++) {
      if (bal[i] <= 0) continue;
      const p = Math.min(debts[i].minPayment, bal[i]);
      bal[i] -= p;
      left -= p;
    }
    const order = debts.map((_, i) => i).filter((i) => bal[i] > 0.005);
    order.sort((a, b) => (strategy === 'avalanche' ? debts[b].apr - debts[a].apr || bal[a] - bal[b] : bal[a] - bal[b] || debts[b].apr - debts[a].apr));
    for (const i of order) {
      if (left <= 0) break;
      const p = Math.min(left, bal[i]);
      bal[i] -= p;
      left -= p;
    }
    for (let i = 0; i < debts.length; i++) if (bal[i] <= 0.005 && paidMonth[i] == null) {
      bal[i] = 0;
      paidMonth[i] = month;
    }
    series.push({ month, balance: round2(Math.max(0, bal.reduce((s, b) => s + b, 0))) });
  }
  if (month >= 600) feasible = false;
  const total = interest.reduce((s, x) => s + x, 0);
  return {
    strategy,
    feasible,
    months: feasible ? month : null,
    totalInterest: round2(total),
    debtFreeDate: feasible ? addMonthsISO(today, month) : null,
    monthlyPayment: round2(budget),
    order: debts
      .map((d, i) => ({ id: d.id, name: d.name, month: paidMonth[i], interest: round2(interest[i]) }))
      .sort((a, b) => (a.month ?? 9999) - (b.month ?? 9999)),
    series,
  };
}

/* ---------------------------------------------------------------- savings projection */

export interface ProjectionPoint {
  year: number;
  value: number;
  contributed: number;
}

/** Yearly values of `start` + `monthly` contributions compounding monthly at `annualPct`. */
export function savingsProjection(start: number, monthly: number, annualPct: number, years: number): ProjectionPoint[] {
  const r = annualPct / 1200;
  const out: ProjectionPoint[] = [{ year: 0, value: round2(start), contributed: round2(start) }];
  let v = start;
  let c = start;
  for (let m = 1; m <= years * 12; m++) {
    v = v * (1 + r) + monthly;
    c += monthly;
    if (m % 12 === 0) out.push({ year: m / 12, value: round2(v), contributed: round2(c) });
  }
  return out;
}

/* ---------------------------------------------------------------- insights */

export interface ComputedInsight {
  key: string;
  title: string;
  body: string;
  tone: 'good' | 'info' | 'warning' | 'critical';
  kind: 'tip' | 'warning' | 'opportunity' | 'summary';
  /** where to look */
  module?: string;
  params?: Record<string, unknown>;
}

type Fmt = (n: number) => string;
const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** Insights computed from the data (not stored). Dismissed keys are left out unless `includeDismissed`. */
export function computeInsights(f: FinanceData, today: string, money: Fmt, includeDismissed = false): ComputedInsight[] {
  const out: ComputedInsight[] = [];
  const cats = catMap(f);
  const sd = f.settings.monthStartDay;
  const cur = monthOf(today, sd);
  const prev = shiftMonth(cur, -1);
  const elapsed = monthElapsed(cur, today, sd);
  const txNow = txOfMonth(f.transactions, cur, sd);
  const txPrev = txOfMonth(f.transactions, prev, sd);
  if (!f.transactions.length) return out;

  // budgets over the limit (and which categories they cover, to avoid double warnings)
  const budgets = budgetRows(f, cur, elapsed);
  const overBudget = new Set(budgets.filter((b) => b.tone === 'critical').map((b) => b.category.id));
  const rec = detectRecurring(f, today);
  const fixedIds = new Set(rec.flatMap((r) => r.ids));

  // 1. categories above their 3-month average (fixed / recurring charges are not "paced")
  const hist = [1, 2, 3].map((i) => byCategory(txOfMonth(f.transactions, shiftMonth(cur, -i), sd), cats));
  const monthsWithData = hist.filter((h) => h.length).length;
  if (monthsWithData >= 2) {
    for (const row of byCategory(txNow, cats)) {
      if (!row.id || overBudget.has(row.id)) continue;
      const avg = hist.reduce((s, h) => s + (h.find((x) => x.id === row.id)?.amount ?? 0), 0) / monthsWithData;
      if (avg < 20) continue;
      const fixed = -txNow.filter((t) => t.category === row.id && fixedIds.has(t.id)).reduce((s, t) => s + t.amount, 0);
      const variable = row.amount - fixed;
      const projected = fixed + (elapsed > 0.25 ? variable / elapsed : variable);
      if (row.amount > avg * 1.2 && row.amount - avg > 40)
        out.push({ key: `cat-up:${cur}:${row.id}`, tone: 'warning', kind: 'warning', title: `${row.name} is up ${pctText(row.amount / avg - 1)} on your average`, body: `You've spent ${money(row.amount)} on ${row.name.toLowerCase()} this month, against a 3-month average of ${money(avg)}.`, module: 'transactions', params: { category: row.id, month: cur } });
      else if (elapsed < 0.8 && elapsed > 0.3 && variable > 30 && projected > avg * 1.3 && projected - avg > 60)
        out.push({ key: `cat-pace:${cur}:${row.id}`, tone: 'info', kind: 'tip', title: `On pace to overspend on ${row.name.toLowerCase()}`, body: `${money(row.amount)} so far — at this pace about ${money(projected)} by the end of the month (average ${money(avg)}).`, module: 'transactions', params: { category: row.id, month: cur } });
    }
  }

  // 2. the YNAB budget: overspent categories, Ready to Assign, underfunded targets, age of money
  const bv = budgetMonth(f, cur, today);
  for (const r of bv.overspent) {
    if (r.kind === 'payment') continue;
    const b = budgets.find((x) => x.category.id === r.id);
    out.push({ key: `budget:${cur}:${r.id}`, tone: 'critical', kind: 'warning', title: `${r.name} is overspent by ${money(-r.available)}`, body: `${money(-r.activity)} spent this month${b && b.avg3 > 0 ? ` (you usually spend about ${money(b.avg3)})` : ''}. Roll with the punches: move money from another category to cover it${r.cashOverspent > 0 ? ' — otherwise it comes out of next month’s Ready to Assign' : ' — otherwise it becomes card debt'}.`, module: 'budgets', params: { month: cur, categoryId: r.id } });
  }
  const assignedEver = f.assignments.length > 0;
  if (assignedEver && bv.rta > 20) out.push({ key: `rta:${cur}:${Math.round(bv.rta / 100)}`, tone: 'info', kind: 'tip', title: `${money(bv.rta)} is ready to assign`, body: 'Give every dollar a job: fund your targets, next month’s bills or savings.', module: 'budgets', params: { month: cur } });
  else if (assignedEver && bv.rta < -0.5) out.push({ key: `rta-neg:${cur}`, tone: 'critical', kind: 'warning', title: `You assigned ${money(-bv.rta)} more than you have`, body: 'Take money back from categories that can wait until Ready to Assign is zero.', module: 'budgets', params: { month: cur } });
  if (bv.underfundedRows.length && elapsed > 0.2) out.push({ key: `underfunded:${cur}:${bv.underfundedRows.length}`, tone: 'info', kind: 'tip', title: `${bv.underfundedRows.length === 1 ? "1 target still needs" : `${bv.underfundedRows.length} targets still need`} ${money(bv.underfunded)}`, body: bv.underfundedRows.slice(0, 4).map((r) => `${r.name} ${money(r.info?.need ?? 0)}`).join(' · '), module: 'budgets', params: { month: cur } });

  // 3. new subscriptions / recurring charges
  for (const r of rec.filter((x) => x.isNew && x.charge && x.count >= 2).slice(0, 4))
    out.push({ key: `newsub:${r.key}`, tone: 'info', kind: 'tip', title: `New recurring charge: ${r.merchant}`, body: `${money(-r.amount)} ${r.cadence} since ${r.firstDate} (about ${money(r.monthly * 12)} a year). Keep it only if you use it.`, module: 'transactions', params: { search: r.merchant } });
  const subs = rec.filter((r) => r.charge && (r.category === 'subscriptions' || cats.get(r.category ?? '')?.name.toLowerCase().includes('subscri')));
  const subMonthly = subs.reduce((s, r) => s + r.monthly, 0);
  if (subs.length >= 4 && subMonthly > 40)
    out.push({ key: `subs:${cur}:${subs.length}`, tone: 'info', kind: 'opportunity', title: `${subs.length} subscriptions cost ${money(subMonthly)} a month`, body: `That's ${money(subMonthly * 12)} a year. Review the list on the Overview and cancel what you don't use.`, module: 'overview' });

  // 4. unusual large transactions in the last 30 days
  const expenses = f.transactions.filter((t) => flowOf(t, cats) === 'expense' && t.amount < 0 && t.date >= addDays(today, -180)).map((t) => -t.amount).sort((a, b) => a - b);
  const median = expenses.length ? expenses[Math.floor(expenses.length / 2)] : 0;
  const threshold = f.settings.largeTransaction > 0 ? f.settings.largeTransaction : Math.max(250, median * 6);
  const large = f.transactions
    .filter((t) => t.amount < 0 && -t.amount >= threshold && t.date >= addDays(today, -30) && t.date <= today && flowOf(t, cats) === 'expense' && !rec.some((r) => r.ids.includes(t.id)))
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 3);
  for (const t of large) out.push({ key: `large:${t.id}`, tone: 'info', kind: 'summary', title: `Large payment: ${merchantOf(t)} ${money(-t.amount)}`, body: `On ${t.date}. Larger than usual for you — check it's expected.`, module: 'transactions', params: { search: merchantOf(t) } });

  // 5. cash flow
  const tNow = totals(txNow, cats);
  const tPrev = totals(txPrev, cats);
  if (elapsed > 0.5 && tNow.spending > tNow.income && tNow.spending > 0)
    out.push({ key: `cashflow:${cur}`, tone: 'warning', kind: 'warning', title: 'Spending more than you earn this month', body: `${money(tNow.spending)} out vs ${money(tNow.income)} in so far (${money(tNow.net)}).`, module: 'overview' });
  else if (tPrev.count > 5 && tPrev.net < 0)
    out.push({ key: `cashflow:${prev}`, tone: 'warning', kind: 'warning', title: `${monthLabel(prev, true)} ended ${money(-tPrev.net)} short`, body: `You spent ${money(tPrev.spending)} against ${money(tPrev.income)} of income.`, module: 'overview' });
  else if (tPrev.savingsRate != null && tPrev.savingsRate >= 0.2 && tPrev.income > 0)
    out.push({ key: `rate:${prev}`, tone: 'good', kind: 'summary', title: `You kept ${pctText(tPrev.savingsRate)} of your income in ${monthLabel(prev, true)}`, body: `${money(tPrev.net)} left over after spending. A savings rate of 20% or more is a strong habit.`, module: 'plan', params: { tab: 'savings' } });

  // 6. upcoming charges vs cash
  const nw = netWorth(f.accounts);
  const checking = f.accounts.filter((a) => !a.archived && a.type === 'checking').reduce((s, a) => s + (a.balance ?? 0), 0);
  const due14 = rec.filter((r) => r.charge && r.nextDate <= addDays(today, 14)).reduce((s, r) => s - r.amount, 0);
  if (checking > 0 && due14 > checking)
    out.push({ key: `lowcash:${cur}`, tone: 'critical', kind: 'warning', title: 'Upcoming bills exceed your checking balance', body: `${money(due14)} of recurring charges are due in the next 14 days; checking holds ${money(checking)}.`, module: 'accounts' });

  // 7. credit utilisation & expensive debt
  for (const a of f.accounts.filter((x) => !x.archived && x.type === 'credit_card' && x.creditLimit && x.creditLimit > 0 && (x.balance ?? 0) > 0)) {
    const u = (a.balance ?? 0) / a.creditLimit!;
    if (u > 0.3) out.push({ key: `util:${a.id}:${cur}`, tone: u > 0.7 ? 'critical' : 'warning', kind: 'warning', title: `${a.name} is ${pctText(u)} used`, body: `Keeping card balances under 30% of the limit helps your credit score. Paying ${money((a.balance ?? 0) - a.creditLimit! * 0.3)} would get you there.`, module: 'accounts', params: { accountId: a.id } });
  }
  const pricey = f.accounts.filter((a) => !a.archived && isDebtType(a.type) && (a.apr ?? 0) >= 15 && (a.balance ?? 0) > 100).sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];
  if (pricey)
    out.push({ key: `apr:${pricey.id}:${cur}`, tone: 'info', kind: 'opportunity', title: `${pricey.name} costs about ${money(((pricey.balance ?? 0) * (pricey.apr ?? 0)) / 1200)} a month in interest`, body: `At ${pricey.apr}% APR it's your most expensive debt. Paying it first (avalanche) saves the most interest — see the debt planner.`, module: 'plan', params: { tab: 'debt' } });

  // 8. emergency fund
  const avg = averageMonth(f, today);
  const essentials = avg.months ? avg.spending : 0;
  if (essentials > 0 && nw.liquid >= 0) {
    const months = nw.liquid / essentials;
    if (months < f.settings.emergencyMonths && !f.goals.some((g) => g.type === 'emergency_fund' && !g.done))
      out.push({ key: `emergency:${cur}`, tone: 'info', kind: 'tip', title: `Cash covers ${months < 1 ? 'less than a month' : `${months.toFixed(1)} months`} of spending`, body: `A common target is ${f.settings.emergencyMonths} months (${money(essentials * f.settings.emergencyMonths)}). Add an emergency fund goal to plan for it.`, module: 'plan', params: { tab: 'goals' } });
  }

  // 9. housekeeping
  const uncategorised = f.transactions.filter((t) => !t.category && !t.transfer).length;
  if (uncategorised >= 5)
    out.push({ key: `uncat:${cur}:${Math.floor(uncategorised / 10)}`, tone: 'info', kind: 'tip', title: `${uncategorised} transactions need a category`, body: 'Categorise them (or create rules) so budgets and insights are accurate.', module: 'transactions', params: { uncategorized: true } });

  const dismissed = new Set(f.settings.dismissedInsights);
  const rank = { critical: 0, warning: 1, info: 2, good: 3 };
  return out.filter((i) => includeDismissed || !dismissed.has(i.key)).sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/* ---------------------------------------------------------------- misc */

export const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));

/** Signed amount as "+$1,200.00" / "−$45.10". */
export function signed(n: number, money: Fmt): string {
  if (n > 0) return `+${money(n)}`;
  if (n < 0) return `−${money(-n)}`;
  return money(0);
}
