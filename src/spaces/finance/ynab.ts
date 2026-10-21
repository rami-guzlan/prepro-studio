/* YNAB-style zero-based budget ("give every dollar a job"). Pure functions only:
   the Budget screen, the overview, the printed budget sheet, the agent tool
   and the insights all read the same numbers from here.

   The rules implemented
   ---------------------
   Accounts
   - On-budget accounts (checking, savings, cash and credit cards unless the
     account says otherwise) feed the budget; tracking accounts (loans,
     investments, or any account switched off) are ignored entirely.
   - Transactions without an account count as on-budget.

   Money in → Ready to Assign (RTA)
   - Inflows on on-budget accounts categorised with an income-kind category
     ("Inflow: Ready to Assign"), and uncategorised inflows, go to RTA in their
     month. Optionally the on-budget cash balances from before the first
     transaction ("Starting balances", settings.budgetOpeningBalances, default on).

   Categories
   - Budget rows = categories of kind expense or saving (grouped by their group),
     plus one virtual "Credit card payment" category per on-budget card
     (id 'ccpay:<accountId>'), plus a read-only "Uncategorised" row.
   - Assigned  = the month's assignment for the category.
   - Activity  = the sum of the month's categorised on-budget transactions
     (outflows negative, refunds positive). Transfers between your own accounts
     are ignored, except a payment received on a card (see below).
   - Available = positive Available rolled over from last month + Assigned + Activity.

   Overspending (modern YNAB rule)
   - A negative Available never rolls over: the category starts the next month at 0.
   - Cash overspending (spent from checking / cash) is deducted from the NEXT
     month's Ready to Assign.
   - Credit overspending (card purchases that were not funded) does not touch
     RTA: it becomes new card debt (the card's payment category does not
     receive that part). When a category is overspent with both, the card part
     counts as credit overspending first.
   - Uncategorised outflows are treated as cash overspending (categorise them).

   Credit cards
   - Funded card spending in a category moves the same amount to the card's
     payment category (refunds move it back). A payment received on the card
     (a positive transfer on the card account) is that category's activity.
     Assign extra to the payment category to pay down older debt.

   Ready to Assign for month m (the banner)
     RTA(m) = inflows up to max(m, current month)
            − everything assigned in every month (future months included)
            − cash overspending of the months before max(m, current month)
   so it is the same number on the current month and any past month, and a
   future month already accounts for this month's overspending.

   Age of Money
   - The average age, in days, of the money in the last 10 cash outflows
     (purchases on on-budget accounts and cards, outflows to tracking
     accounts), matching outflows to inflows first-in-first-out; each outflow's
     age is weighted by the dollars it used. Outflows nothing could fund are skipped.

   Targets (one per category; see TARGET_TYPES)
   - monthly: needed this month = amount − assigned this month.
   - refill:  needed = amount − (rolled over + assigned).
   - by_date: needed = (amount − rolled over) ÷ months left to the due month
              (inclusive) − assigned; repeating targets move their due month
              forward by repeatMonths once it has passed.
   - balance: with a month, like by_date without repeat; without, progress only. */
import { todayISO } from '@/lib/dates';
import type { FinAccount, FinAssignment, FinanceData, FinCategory, FinTarget, FinTransaction } from './types';
import { CATEGORY_GROUPS, isOnBudget } from './types';
import { monthLabel, monthOf, round2, shiftMonth } from './calc';

/* ---------------------------------------------------------------- ids & categories */

/** Pseudo id of Ready to Assign when moving money. */
export const RTA_ID = 'rta';
/** Pseudo row of uncategorised outflows. */
export const UNCATEGORIZED_ID = '__uncategorized';
export const CC_PREFIX = 'ccpay:';
export const ccPaymentId = (accountId: string) => `${CC_PREFIX}${accountId}`;
export const isCcPaymentId = (id: string) => id.startsWith(CC_PREFIX);
export const CC_GROUP = 'cc_payments';

export interface BudgetGroupDef {
  id: string;
  label: string;
}

/** Group order on the Budget screen (Credit Card Payments first, like YNAB). */
export const BUDGET_GROUPS: BudgetGroupDef[] = [{ id: CC_GROUP, label: 'Credit Card Payments' }, ...CATEGORY_GROUPS.filter((g) => g.value !== 'income').map((g) => ({ id: g.value as string, label: g.label }))];

export interface BudgetCategory {
  id: string;
  name: string;
  group: string;
  slot: number;
  /** expense / saving category, or a credit card payment category */
  kind: 'expense' | 'saving' | 'payment';
  hidden: boolean;
  order: number;
  /** payment categories: the card */
  accountId?: string;
  category?: FinCategory;
}

/** Every budget category (expense + saving categories and card payment categories), in screen order. */
export function budgetCategories(f: Pick<FinanceData, 'categories' | 'accounts' | 'assignments'>): BudgetCategory[] {
  const out: BudgetCategory[] = [];
  const assignedTo = new Set(f.assignments.map((a) => a.categoryId));
  f.accounts.forEach((a, i) => {
    if (a.type !== 'credit_card' || !isOnBudget(a)) return;
    const id = ccPaymentId(a.id);
    if (a.archived && !assignedTo.has(id)) return;
    out.push({ id, name: a.name, group: CC_GROUP, slot: a.slot ?? 1, kind: 'payment', hidden: !!a.archived, order: i, accountId: a.id });
  });
  f.categories.forEach((c, i) => {
    if (c.kind !== 'expense' && c.kind !== 'saving') return;
    out.push({ id: c.id, name: c.name, group: c.group === 'income' ? 'other' : c.group, slot: c.slot, kind: c.kind, hidden: !!c.hidden, order: c.order ?? 1000 + i, category: c });
  });
  const gi = (g: string) => BUDGET_GROUPS.findIndex((x) => x.id === g);
  return out.sort((a, b) => gi(a.group) - gi(b.group) || a.order - b.order || a.name.localeCompare(b.name));
}

/* ---------------------------------------------------------------- months */

/** Months from a to b (b − a; negative when b is before a). */
export function monthDiff(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

/* ---------------------------------------------------------------- classify transactions */

export type BudgetFlow = 'off' | 'ignore' | 'rta' | 'cat' | 'uncat' | 'payment';

/** How a transaction affects the budget. */
export function budgetFlow(t: FinTransaction, acct: FinAccount | undefined, cats: Map<string, FinCategory>): BudgetFlow {
  if (acct && !isOnBudget(acct)) return 'off';
  const c = t.category ? cats.get(t.category) : undefined;
  if (t.transfer || c?.kind === 'transfer') return acct?.type === 'credit_card' && t.amount > 0 ? 'payment' : 'ignore';
  if (c) return c.kind === 'income' ? 'rta' : 'cat';
  if (t.amount > 0) return 'rta';
  if (t.amount < 0) return 'uncat';
  return 'ignore';
}

/** Cash balance of each on-budget, non-debt account before its first transaction (balance − transactions up to the balance date). */
export function openingBalances(f: Pick<FinanceData, 'accounts' | 'transactions'>): { accountId: string; amount: number; date: string }[] {
  const out: { accountId: string; amount: number; date: string }[] = [];
  for (const a of f.accounts) {
    if (!isOnBudget(a) || a.type === 'credit_card' || a.type === 'loan' || a.balance == null) continue;
    const upto = a.balanceDate ?? '9999-12-31';
    let sum = 0;
    let first = '';
    for (const t of f.transactions) {
      if (t.accountId !== a.id) continue;
      if (!first || t.date < first) first = t.date;
      if (t.date <= upto) sum += t.amount;
    }
    const amount = round2(a.balance - sum);
    if (Math.abs(amount) > 0.004) out.push({ accountId: a.id, amount, date: first || a.balanceDate || todayISO() });
  }
  return out;
}

/* ---------------------------------------------------------------- the budget engine */

export interface CatCalc {
  id: string;
  /** positive Available rolled over from last month */
  carryIn: number;
  assigned: number;
  activity: number;
  available: number;
  /** overspent from cash (deducted from next month's Ready to Assign) */
  cashOverspent: number;
  /** overspent on a credit card (becomes card debt) */
  creditOverspent: number;
}

export interface MonthCalc {
  month: string;
  /** inflows to Ready to Assign this month (incl. starting balances in the first month) */
  inflow: number;
  startingBalances: number;
  /** total assigned this month */
  assigned: number;
  /** total activity of budget categories this month */
  activity: number;
  /** total available at the end of the month (budget rows) */
  available: number;
  cashOverspent: number;
  creditOverspent: number;
  cats: Map<string, CatCalc>;
}

export interface BudgetState {
  first: string;
  last: string;
  current: string;
  months: string[];
  byMonth: Map<string, MonthCalc>;
  categories: BudgetCategory[];
  /** total assigned in every month */
  assignedAll: number;
}

interface Bucket {
  rta: number;
  starting: number;
  cat: Map<string, number>;
  /** card activity per category per card (signed) */
  card: Map<string, Map<string, number>>;
  payments: Map<string, number>;
  uncat: number;
}

const cache = new WeakMap<object, Map<string, { deps: unknown[]; state: BudgetState }>>();

/** Run the budget from its first month through `upto` (at least the current month). Cached per data object (and its lists). */
export function computeBudget(f: FinanceData, upto?: string, today: string = todayISO()): BudgetState {
  const sd = f.settings.monthStartDay;
  const current = monthOf(today, sd);
  const key = `${upto ?? ''}|${current}`;
  const deps: unknown[] = [f.transactions, f.assignments, f.targets, f.accounts, f.categories, f.settings, f.transactions.length, f.assignments.length, f.settings.budgetOpeningBalances];
  const hit = cache.get(f)?.get(key);
  if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.state;

  const cats = new Map(f.categories.map((c) => [c.id, c]));
  const accts = new Map(f.accounts.map((a) => [a.id, a]));
  const categories = budgetCategories(f);
  const buckets = new Map<string, Bucket>();
  const bucket = (m: string) => {
    let b = buckets.get(m);
    if (!b) buckets.set(m, (b = { rta: 0, starting: 0, cat: new Map(), card: new Map(), payments: new Map(), uncat: 0 }));
    return b;
  };
  for (const t of f.transactions) {
    const acct = t.accountId ? accts.get(t.accountId) : undefined;
    const flow = budgetFlow(t, acct, cats);
    if (flow === 'off' || flow === 'ignore') continue;
    const b = bucket(monthOf(t.date, sd));
    if (flow === 'rta') b.rta += t.amount;
    else if (flow === 'uncat') b.uncat += t.amount;
    else if (flow === 'payment') b.payments.set(acct!.id, (b.payments.get(acct!.id) ?? 0) + t.amount);
    else {
      const id = t.category!;
      b.cat.set(id, (b.cat.get(id) ?? 0) + t.amount);
      if (acct?.type === 'credit_card') {
        const m = b.card.get(id) ?? new Map<string, number>();
        m.set(acct.id, (m.get(acct.id) ?? 0) + t.amount);
        b.card.set(id, m);
      }
    }
  }
  const assign = new Map<string, Map<string, number>>();
  let assignedAll = 0;
  for (const a of f.assignments) {
    const m = assign.get(a.month) ?? new Map<string, number>();
    m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + a.assigned);
    assign.set(a.month, m);
    assignedAll += a.assigned;
  }
  const monthsSeen = [...buckets.keys(), ...assign.keys()].sort();
  const first = monthsSeen[0] && monthsSeen[0] < current ? monthsSeen[0] : current;
  if (f.settings.budgetOpeningBalances !== false) {
    const open = openingBalances(f);
    if (open.length) bucket(first).starting += open.reduce((s, o) => s + o.amount, 0);
  }
  let last = [current, upto ?? current, monthsSeen[monthsSeen.length - 1] ?? current].sort().pop()!;
  if (monthDiff(first, last) > 600) last = shiftMonth(first, 600);

  const regular = categories.filter((c) => c.kind !== 'payment');
  const payment = categories.filter((c) => c.kind === 'payment');
  const byMonth = new Map<string, MonthCalc>();
  const months: string[] = [];
  let prev: MonthCalc | undefined;
  for (let m = first; m <= last; m = shiftMonth(m, 1)) {
    months.push(m);
    const b = buckets.get(m);
    const asg = assign.get(m);
    const mc: MonthCalc = { month: m, inflow: round2((b?.rta ?? 0) + (b?.starting ?? 0)), startingBalances: round2(b?.starting ?? 0), assigned: 0, activity: 0, available: 0, cashOverspent: 0, creditOverspent: 0, cats: new Map() };
    const movedToCard = new Map<string, number>();
    const settle = (id: string, activity: number, cardSpend: Map<string, number> | undefined) => {
      const carryIn = Math.max(0, prev?.cats.get(id)?.available ?? 0);
      const assigned = round2(asg?.get(id) ?? 0);
      const available = round2(carryIn + assigned + activity);
      let cash = 0;
      let credit = 0;
      // card spending moves to the payment category; the unfunded part is credit overspending
      const cardOut = new Map<string, number>();
      let cardOutTotal = 0;
      for (const [acct, amt] of cardSpend ?? []) {
        movedToCard.set(acct, (movedToCard.get(acct) ?? 0) - amt);
        if (amt < 0) {
          cardOut.set(acct, -amt);
          cardOutTotal -= amt;
        }
      }
      if (available < -0.004) {
        const over = -available;
        credit = Math.min(over, cardOutTotal);
        cash = round2(over - credit);
        if (credit > 0) for (const [acct, out] of cardOut) movedToCard.set(acct, (movedToCard.get(acct) ?? 0) - (credit * out) / cardOutTotal);
      }
      const c: CatCalc = { id, carryIn: round2(carryIn), assigned, activity: round2(activity), available, cashOverspent: round2(cash), creditOverspent: round2(credit) };
      mc.cats.set(id, c);
      return c;
    };
    for (const c of regular) settle(c.id, b?.cat.get(c.id) ?? 0, b?.card.get(c.id));
    for (const c of payment) {
      const moved = movedToCard.get(c.accountId!) ?? 0;
      const paid = b?.payments.get(c.accountId!) ?? 0;
      settle(c.id, moved - paid, undefined);
    }
    // uncategorised outflows: shown as their own row; never roll over; count as cash overspending
    const unc = round2(b?.uncat ?? 0);
    mc.cats.set(UNCATEGORIZED_ID, { id: UNCATEGORIZED_ID, carryIn: 0, assigned: 0, activity: unc, available: unc, cashOverspent: round2(Math.max(0, -unc)), creditOverspent: 0 });
    let assignedTotal = 0;
    for (const v of asg?.values() ?? []) assignedTotal += v;
    mc.assigned = round2(assignedTotal);
    for (const c of mc.cats.values()) {
      mc.activity += c.activity;
      if (c.id !== UNCATEGORIZED_ID) mc.available += c.available;
      mc.cashOverspent += c.cashOverspent;
      mc.creditOverspent += c.creditOverspent;
    }
    mc.activity = round2(mc.activity);
    mc.available = round2(mc.available);
    mc.cashOverspent = round2(mc.cashOverspent);
    mc.creditOverspent = round2(mc.creditOverspent);
    byMonth.set(m, mc);
    prev = mc;
  }
  const state: BudgetState = { first, last, current, months, byMonth, categories, assignedAll: round2(assignedAll) };
  const map = cache.get(f) ?? new Map<string, { deps: unknown[]; state: BudgetState }>();
  map.set(key, { deps, state });
  cache.set(f, map);
  return state;
}

/** Ready to Assign shown for month m (see the rules at the top of the file), with its parts. */
export function readyToAssign(state: BudgetState, m: string) {
  const M = m > state.current ? m : state.current;
  let inflowCum = 0;
  let overBefore = 0;
  let assignedFuture = 0;
  for (const k of state.months) {
    const mc = state.byMonth.get(k)!;
    if (k <= M) inflowCum += mc.inflow;
    if (k < M) overBefore += mc.cashOverspent;
    if (k > m) assignedFuture += mc.assigned;
  }
  const mc = state.byMonth.get(m);
  const rta = round2(inflowCum - state.assignedAll - overBefore);
  const inflow = mc?.inflow ?? 0;
  const overspentLastMonth = state.byMonth.get(shiftMonth(m, -1))?.cashOverspent ?? 0;
  const assignedThisMonth = mc?.assigned ?? 0;
  return {
    rta,
    inflow: round2(inflow),
    startingBalances: mc?.startingBalances ?? 0,
    overspentLastMonth: round2(overspentLastMonth),
    assignedThisMonth: round2(assignedThisMonth),
    assignedInFuture: round2(assignedFuture),
    /** what is left after the parts above (money from earlier months) */
    leftOver: round2(rta - inflow + overspentLastMonth + assignedThisMonth + assignedFuture),
  };
}

/* ---------------------------------------------------------------- targets */

export interface TargetInfo {
  /** still to assign this month to meet the target */
  need: number;
  /** what the target asks for this month */
  perMonth: number;
  /** 0–1 */
  progress: number;
  met: boolean;
  /** due month (by_date, dated balance) */
  due?: string;
  monthsLeft?: number;
  /** "$400 by Mar 2027", "Refill up to $260" … (amount filled in by the caller's formatter) */
  label: (money: (n: number) => string) => string;
}

/** Due month of a by_date target for month m (repeating targets roll forward). */
export function targetDue(t: FinTarget, m: string): string | undefined {
  if (!t.date) return undefined;
  let due = t.date;
  const rep = t.type === 'by_date' ? t.repeatMonths ?? 0 : 0;
  if (rep > 0) {
    let guard = 0;
    while (due < m && guard++ < 1200) due = shiftMonth(due, rep);
  }
  return due;
}

export function targetInfo(t: FinTarget, c: Pick<CatCalc, 'carryIn' | 'assigned' | 'available'>, m: string): TargetInfo {
  const amt = Math.max(0, t.amount);
  const ceil2 = (n: number) => Math.ceil(Math.max(0, n) * 100 - 1e-6) / 100;
  if (t.type === 'monthly') {
    const need = ceil2(amt - c.assigned);
    return { need, perMonth: amt, progress: amt > 0 ? Math.min(1, Math.max(0, c.assigned / amt)) : 1, met: need <= 0, label: (fm) => `${fm(amt)} every month` };
  }
  if (t.type === 'refill') {
    const need = ceil2(amt - c.carryIn - c.assigned);
    return { need, perMonth: ceil2(amt - c.carryIn), progress: amt > 0 ? Math.min(1, Math.max(0, (c.carryIn + c.assigned) / amt)) : 1, met: need <= 0, label: (fm) => `Refill up to ${fm(amt)}` };
  }
  const due = targetDue(t, m);
  if (!due) {
    // balance without a date: progress only
    return { need: 0, perMonth: 0, progress: amt > 0 ? Math.min(1, Math.max(0, c.available / amt)) : 1, met: c.available >= amt, label: (fm) => `Save ${fm(amt)}` };
  }
  const monthsLeft = Math.max(1, monthDiff(m, due) + 1);
  const remaining = Math.max(0, amt - c.carryIn);
  const perMonth = ceil2(remaining / monthsLeft);
  const need = ceil2(perMonth - c.assigned);
  const rep = t.type === 'by_date' && (t.repeatMonths ?? 0) > 0 ? t.repeatMonths! : 0;
  return {
    need,
    perMonth,
    progress: amt > 0 ? Math.min(1, Math.max(0, (c.carryIn + c.assigned) / amt)) : 1,
    met: need <= 0,
    due,
    monthsLeft,
    label: (fm) => `${fm(amt)} by ${monthLabel(due)}${rep ? (rep === 12 ? ', yearly' : `, every ${rep} months`) : ''}`,
  };
}

/* ---------------------------------------------------------------- the month view */

export type CatStatus = 'overspent' | 'underfunded' | 'funded' | 'zero';

export interface CatRow extends CatCalc {
  name: string;
  group: string;
  slot: number;
  kind: BudgetCategory['kind'];
  hidden: boolean;
  accountId?: string;
  status: CatStatus;
  target?: FinTarget;
  info?: TargetInfo;
  /** payment categories: what the card owes now */
  cardBalance?: number;
}

export interface GroupRow {
  id: string;
  label: string;
  assigned: number;
  activity: number;
  available: number;
  need: number;
  rows: CatRow[];
}

export interface MonthView {
  month: string;
  current: string;
  rta: number;
  parts: ReturnType<typeof readyToAssign>;
  assigned: number;
  activity: number;
  available: number;
  /** money still needed this month by targets */
  underfunded: number;
  overspent: CatRow[];
  underfundedRows: CatRow[];
  cashOverspent: number;
  creditOverspent: number;
  groups: GroupRow[];
  rows: CatRow[];
  /** uncategorised outflows this month */
  uncategorized: { amount: number; count: number };
  ageOfMoney: number | null;
  /** the first month of the budget */
  first: string;
}

export function statusOf(c: Pick<CatCalc, 'available' | 'assigned'>, info?: TargetInfo): CatStatus {
  if (c.available < -0.004) return 'overspent';
  if (info && info.need > 0.004) return 'underfunded';
  if (c.available > 0.004 || (info && info.met && c.assigned > 0)) return 'funded';
  return 'zero';
}

/** Everything the Budget screen shows for one month. */
export function budgetMonth(f: FinanceData, month: string, today: string = todayISO()): MonthView {
  const st = computeBudget(f, month, today);
  const mc = st.byMonth.get(month);
  const targets = new Map(f.targets.map((t) => [t.categoryId, t]));
  const accts = new Map(f.accounts.map((a) => [a.id, a]));
  const empty = (id: string): CatCalc => ({ id, carryIn: 0, assigned: 0, activity: 0, available: 0, cashOverspent: 0, creditOverspent: 0 });
  const rows: CatRow[] = st.categories.map((bc) => {
    const c = mc?.cats.get(bc.id) ?? empty(bc.id);
    const t = targets.get(bc.id);
    const info = t ? targetInfo(t, c, month) : undefined;
    return {
      ...c,
      name: bc.name,
      group: bc.group,
      slot: bc.slot,
      kind: bc.kind,
      hidden: bc.hidden,
      accountId: bc.accountId,
      status: statusOf(c, info),
      target: t,
      info,
      cardBalance: bc.accountId ? accts.get(bc.accountId)?.balance : undefined,
    };
  });
  const groups: GroupRow[] = BUDGET_GROUPS.map((g) => {
    const rs = rows.filter((r) => r.group === g.id);
    return {
      id: g.id,
      label: g.label,
      rows: rs,
      assigned: round2(rs.reduce((s, r) => s + r.assigned, 0)),
      activity: round2(rs.reduce((s, r) => s + r.activity, 0)),
      available: round2(rs.reduce((s, r) => s + r.available, 0)),
      need: round2(rs.reduce((s, r) => s + (r.info?.need ?? 0), 0)),
    };
  }).filter((g) => g.rows.length);
  const unc = mc?.cats.get(UNCATEGORIZED_ID);
  const sd = f.settings.monthStartDay;
  const accts2 = accts;
  const catMap2 = new Map(f.categories.map((c) => [c.id, c]));
  const uncCount = f.transactions.filter((t) => monthOf(t.date, sd) === month && budgetFlow(t, t.accountId ? accts2.get(t.accountId) : undefined, catMap2) === 'uncat').length;
  const parts = readyToAssign(st, month);
  const visible = rows.filter((r) => !r.hidden || Math.abs(r.available) > 0.004 || Math.abs(r.activity) > 0.004 || Math.abs(r.assigned) > 0.004);
  return {
    month,
    current: st.current,
    rta: parts.rta,
    parts,
    assigned: mc?.assigned ?? 0,
    activity: mc?.activity ?? 0,
    available: mc?.available ?? 0,
    underfunded: round2(visible.reduce((s, r) => s + (r.info?.need ?? 0), 0)),
    overspent: visible.filter((r) => r.status === 'overspent'),
    underfundedRows: visible.filter((r) => r.status === 'underfunded'),
    cashOverspent: mc?.cashOverspent ?? 0,
    creditOverspent: mc?.creditOverspent ?? 0,
    groups,
    rows,
    uncategorized: { amount: round2(-(unc?.activity ?? 0)), count: uncCount },
    ageOfMoney: ageOfMoney(f, month < st.current ? monthEndDate(month, sd) : today).days,
    first: st.first,
  };
}

function monthEndDate(m: string, sd: number): string {
  const next = shiftMonth(m, 1);
  const d = new Date(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, sd - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One category's history (assigned / activity / available) for the months up to `month`. */
export function categoryHistory(f: FinanceData, id: string, month: string, n = 6, today: string = todayISO()) {
  const st = computeBudget(f, month, today);
  const out: { month: string; assigned: number; activity: number; available: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = shiftMonth(month, -i);
    const c = st.byMonth.get(k)?.cats.get(id);
    out.push({ month: k, assigned: c?.assigned ?? 0, activity: c?.activity ?? 0, available: c?.available ?? 0 });
  }
  return out;
}

/* ---------------------------------------------------------------- auto-assign & moving money */

export type AutoAssignMode = 'underfunded' | 'assigned_last_month' | 'spent_last_month' | 'average_assigned' | 'average_spent' | 'reset_available' | 'reset_assigned';
export const AUTO_ASSIGN: { value: AutoAssignMode; label: string; hint: string }[] = [
  { value: 'underfunded', label: 'Underfunded', hint: 'Assign what each target still needs this month' },
  { value: 'assigned_last_month', label: 'Assigned last month', hint: 'Assign the same as last month' },
  { value: 'spent_last_month', label: 'Spent last month', hint: 'Assign what you spent last month' },
  { value: 'average_assigned', label: 'Average assigned', hint: 'Average assigned over the last 12 months' },
  { value: 'average_spent', label: 'Average spent', hint: 'Average spent over the last 12 months' },
  { value: 'reset_available', label: 'Reset available', hint: 'Change assigned so Available is 0 (returns money to Ready to Assign)' },
  { value: 'reset_assigned', label: 'Reset assigned', hint: 'Set assigned to 0' },
];

export interface AssignChange {
  categoryId: string;
  name: string;
  from: number;
  to: number;
}

/** What an auto-assign would change in `month` (all visible categories, or `ids`). Pure: apply with setAssignedIn. */
export function autoAssignPlan(f: FinanceData, month: string, mode: AutoAssignMode, ids?: string[], today: string = todayISO()): AssignChange[] {
  const view = budgetMonth(f, month, today);
  const st = computeBudget(f, month, today);
  const only = ids?.length ? new Set(ids) : null;
  const prev = st.byMonth.get(shiftMonth(month, -1));
  const hist: MonthCalc[] = [];
  for (let i = 1; i <= 12; i++) {
    const mc = st.byMonth.get(shiftMonth(month, -i));
    if (mc) hist.push(mc);
  }
  const out: AssignChange[] = [];
  for (const r of view.rows) {
    if (only ? !only.has(r.id) : r.hidden) continue;
    let to: number | null = null;
    const spentOf = (mc: MonthCalc | undefined) => Math.max(0, -(mc?.cats.get(r.id)?.activity ?? 0));
    switch (mode) {
      case 'underfunded':
        if (r.info && r.info.need > 0) to = r.assigned + r.info.need;
        break;
      case 'assigned_last_month':
        to = prev?.cats.get(r.id)?.assigned ?? 0;
        break;
      case 'spent_last_month':
        if (r.kind !== 'payment') to = spentOf(prev);
        break;
      case 'average_assigned':
        if (hist.length) to = hist.reduce((s, mc) => s + (mc.cats.get(r.id)?.assigned ?? 0), 0) / hist.length;
        break;
      case 'average_spent':
        if (hist.length && r.kind !== 'payment') to = hist.reduce((s, mc) => s + spentOf(mc), 0) / hist.length;
        break;
      case 'reset_available':
        to = r.assigned - r.available;
        break;
      case 'reset_assigned':
        to = 0;
        break;
    }
    if (to == null) continue;
    to = round2(to);
    if (Math.abs(to - r.assigned) < 0.005) continue;
    out.push({ categoryId: r.id, name: r.name, from: r.assigned, to });
  }
  return out;
}

/** Set a month's assigned amount in an assignments list (works on immer drafts). */
export function setAssignedIn(list: FinAssignment[], month: string, categoryId: string, value: number) {
  const v = round2(value);
  const i = list.findIndex((a) => a.month === month && a.categoryId === categoryId);
  if (Math.abs(v) < 0.005) {
    if (i >= 0) list.splice(i, 1);
  } else if (i >= 0) list[i].assigned = v;
  else list.push({ month, categoryId, assigned: v });
}

export function assignedIn(list: FinAssignment[], month: string, categoryId: string): number {
  return list.find((a) => a.month === month && a.categoryId === categoryId)?.assigned ?? 0;
}

/** Move `amount` from one category to another in `month` (either may be RTA_ID = Ready to Assign). */
export function moveMoneyIn(list: FinAssignment[], month: string, from: string, to: string, amount: number) {
  if (!(amount > 0) || from === to) return;
  if (from !== RTA_ID) setAssignedIn(list, month, from, assignedIn(list, month, from) - amount);
  if (to !== RTA_ID) setAssignedIn(list, month, to, assignedIn(list, month, to) + amount);
}

/* ---------------------------------------------------------------- age of money */

export interface AgeOfMoney {
  days: number | null;
  /** outflows the figure is based on */
  outflows: number;
}

/** YNAB Age of Money as of `asOf`: average age of the money in the last `n` cash outflows (FIFO over inflows). */
export function ageOfMoney(f: FinanceData, asOf: string = todayISO(), n = 10): AgeOfMoney {
  const cats = new Map(f.categories.map((c) => [c.id, c]));
  const accts = new Map(f.accounts.map((a) => [a.id, a]));
  type Ev = { date: string; amount: number; inflow: boolean };
  const evs: Ev[] = [];
  if (f.settings.budgetOpeningBalances !== false) for (const o of openingBalances(f)) if (o.amount > 0) evs.push({ date: o.date, amount: o.amount, inflow: true });
  for (const t of f.transactions) {
    if (t.date > asOf || !t.amount) continue;
    const flow = budgetFlow(t, t.accountId ? accts.get(t.accountId) : undefined, cats);
    if (flow === 'rta' && t.amount > 0) evs.push({ date: t.date, amount: t.amount, inflow: true });
    else if ((flow === 'cat' || flow === 'uncat') && t.amount < 0) evs.push({ date: t.date, amount: -t.amount, inflow: false });
  }
  evs.sort((a, b) => a.date.localeCompare(b.date) || Number(b.inflow) - Number(a.inflow));
  const queue: { date: string; left: number }[] = [];
  let head = 0;
  const ages: number[] = [];
  const dayNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
  for (const e of evs) {
    if (e.inflow) {
      queue.push({ date: e.date, left: e.amount });
      continue;
    }
    let need = e.amount;
    let used = 0;
    let weighted = 0;
    while (need > 1e-9 && head < queue.length) {
      const q = queue[head];
      const take = Math.min(q.left, need);
      q.left -= take;
      need -= take;
      used += take;
      weighted += take * Math.max(0, dayNum(e.date) - dayNum(q.date));
      if (q.left <= 1e-9) head++;
    }
    if (used > 0) ages.push(weighted / used);
  }
  const lastN = ages.slice(-n);
  return { days: lastN.length ? Math.round(lastN.reduce((s, x) => s + x, 0) / lastN.length) : null, outflows: lastN.length };
}

/* ---------------------------------------------------------------- the four rules */

export interface YnabTip {
  rule: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  tone: 'good' | 'info' | 'warning' | 'critical';
}

export const YNAB_RULES: { rule: 1 | 2 | 3 | 4; title: string; body: string }[] = [
  { rule: 1, title: 'Give every dollar a job', body: 'Assign all the money you have right now until Ready to Assign is zero.' },
  { rule: 2, title: 'Embrace your true expenses', body: 'Break big, irregular costs into monthly amounts with "needed by date" targets.' },
  { rule: 3, title: 'Roll with the punches', body: 'Overspent? Move money from another category. Changing the plan is the plan.' },
  { rule: 4, title: 'Age your money', body: 'Spend money that is at least 30 days old: build a buffer and live on last month’s income.' },
];

/** Rule-of-YNAB tips that fit this month. */
export function budgetTips(v: MonthView, f: Pick<FinanceData, 'targets'>, money: (n: number) => string): YnabTip[] {
  const out: YnabTip[] = [];
  if (v.rta > 0.004) out.push({ rule: 1, tone: 'good', title: `${money(v.rta)} needs a job`, body: v.underfunded > 0 ? `Your targets still need ${money(v.underfunded)} this month — try Auto-assign → Underfunded, then give the rest a job (next month’s bills, savings, true expenses).` : 'Every target is funded. Give the rest a job: next month’s bills, a buffer or a savings category.' });
  else if (v.rta < -0.004) out.push({ rule: 1, tone: 'critical', title: `You assigned ${money(-v.rta)} more than you have`, body: 'Take money back from categories that can wait until Ready to Assign is zero again.' });
  if (v.overspent.length) {
    const cash = v.overspent.filter((r) => r.cashOverspent > 0);
    out.push({ rule: 3, tone: 'warning', title: `${v.overspent.length} ${v.overspent.length === 1 ? 'category is' : 'categories are'} overspent`, body: `Cover ${v.overspent.map((r) => r.name).slice(0, 3).join(', ')} by moving money from a category with some left.${cash.length ? ' Cash overspending left uncovered comes out of next month’s Ready to Assign.' : ' Uncovered card overspending becomes card debt.'}` });
  }
  const dated = f.targets.filter((t) => t.type === 'by_date' || (t.type === 'balance' && t.date));
  if (!dated.length) out.push({ rule: 2, tone: 'info', title: 'Plan for the bills that aren’t monthly', body: 'Car insurance, holidays, gifts, annual subscriptions: give each a "needed by date" target so the money is there when the bill arrives.' });
  else {
    const behind = v.rows.filter((r) => r.target && dated.includes(r.target) && r.info && r.info.need > 0);
    if (behind.length) out.push({ rule: 2, tone: 'info', title: `${behind.length} true ${behind.length === 1 ? 'expense needs' : 'expenses need'} money this month`, body: behind.slice(0, 3).map((r) => `${r.name}: ${money(r.info!.need)}`).join(' · ') });
  }
  if (v.ageOfMoney != null) {
    if (v.ageOfMoney < 30) out.push({ rule: 4, tone: 'info', title: `Your money is ${v.ageOfMoney} days old`, body: 'Aim for 30+ days: keep some money assigned for next month so today’s spending uses last month’s income.' });
    else out.push({ rule: 4, tone: 'good', title: `Your money is ${v.ageOfMoney} days old`, body: 'You are living on money that is over a month old — a real buffer.' });
  }
  return out;
}
