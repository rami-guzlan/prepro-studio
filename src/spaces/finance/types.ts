/* ==========================================================================
   Personal Finances — data model (space kind 'finance', stored in SpaceData.finance)

   Conventions
   - Amounts are in the space currency (settings.currency). Transactions are
     signed: negative = money out, positive = money in.
   - Account balances: for checking / savings / investment / cash the balance is
     what the account holds; for credit cards and loans it is the amount OWED
     (a positive number). Net worth = assets − debts.
   - Categories have a stable id (the default ones use readable ids such as
     'groceries'); transactions, budgets and rules refer to that id.
   - Dates 'YYYY-MM-DD', months 'YYYY-MM'.
   ========================================================================== */
import type { ID, ISODate } from '@/types';

export const FINANCE_VERSION = 2;

/* ---------------------------------------------------------------- accounts */

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'loan' | 'investment' | 'cash';

export const ACCOUNT_TYPES: { value: AccountType; label: string; debt: boolean; short: string }[] = [
  { value: 'checking', label: 'Checking / current', debt: false, short: 'Checking' },
  { value: 'savings', label: 'Savings', debt: false, short: 'Savings' },
  { value: 'credit_card', label: 'Credit card', debt: true, short: 'Credit card' },
  { value: 'loan', label: 'Loan / mortgage', debt: true, short: 'Loan' },
  { value: 'investment', label: 'Investment / retirement', debt: false, short: 'Investment' },
  { value: 'cash', label: 'Cash / wallet', debt: false, short: 'Cash' },
];
export const ACCOUNT_TYPE_BY_ID = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t])) as Record<AccountType, (typeof ACCOUNT_TYPES)[number]>;
export const isDebtType = (t: AccountType | undefined) => !!t && !!ACCOUNT_TYPE_BY_ID[t]?.debt;

/** CSV column mapping remembered per account (column indexes + the header row it was made for). */
export interface CsvMapping {
  date: number;
  description: number;
  /** one signed amount column … */
  amount?: number;
  /** … or separate money-out / money-in columns */
  debit?: number;
  credit?: number;
  balance?: number;
  /** extra description columns appended to the description (e.g. "Memo") */
  extra?: number[];
  dateFormat: 'auto' | 'MDY' | 'DMY' | 'YMD';
  /** flip signs (card exports where purchases are positive) */
  invert: boolean;
  headerRow: boolean;
  /** header names the mapping was made for (to reuse it next time) */
  headers?: string[];
}

export interface FinAccount {
  id: ID;
  name: string;
  type: AccountType;
  institution?: string;
  /** last 4 digits of the card / account number (never the full number) */
  last4?: string;
  /** current balance (amount owed for credit cards and loans) */
  balance?: number;
  /** date of the balance */
  balanceDate?: ISODate;
  /** credit cards */
  creditLimit?: number;
  /** annual interest rate in % (cards, loans; savings interest too) */
  apr?: number;
  /** minimum / scheduled monthly payment (cards, loans) */
  minPayment?: number;
  /** day of month the statement closes (1–31) */
  statementDay?: number;
  /** categorical colour slot 0–7 */
  slot?: number;
  archived?: boolean;
  notes?: string;
  csvMapping?: CsvMapping;
  /** YNAB-style budget: on-budget account (its money is assigned to categories) or tracking only.
      Unset = default by type (checking, savings, cash and credit cards are on budget). */
  onBudget?: boolean;
}

/** Account types that are on the budget unless the account says otherwise. */
export const ON_BUDGET_BY_DEFAULT: AccountType[] = ['checking', 'savings', 'cash', 'credit_card'];
export const isOnBudget = (a: Pick<FinAccount, 'type' | 'onBudget'> | undefined) => !!a && (a.onBudget ?? ON_BUDGET_BY_DEFAULT.includes(a.type));

/* ---------------------------------------------------------------- transactions */

export interface FinTransaction {
  id: ID;
  date: ISODate;
  /** description as on the statement */
  description: string;
  /** clean merchant / payee name (from a rule or edited) */
  merchant?: string;
  /** signed: negative = money out, positive = money in */
  amount: number;
  accountId?: ID;
  /** category id */
  category?: string;
  notes?: string;
  tags?: string[];
  /** a move between your own accounts (card payment, transfer to savings): not income or spending */
  transfer?: boolean;
  /** a repeating charge / income (subscriptions, rent, salary) */
  recurring?: boolean;
  /** statement it was imported from */
  statementId?: ID;
  /** import fingerprint used to skip duplicates */
  hash?: string;
  /** when it was added */
  createdAt?: string;
}

/* ---------------------------------------------------------------- categories & rules */

export type CategoryGroup = 'income' | 'essentials' | 'lifestyle' | 'financial' | 'other';
/** how a category counts: income, spending (expense), money set aside (saving) or neither (transfer) */
export type CategoryKind = 'income' | 'expense' | 'saving' | 'transfer';

export const CATEGORY_GROUPS: { value: CategoryGroup; label: string; slot: number }[] = [
  { value: 'income', label: 'Income', slot: 2 },
  { value: 'essentials', label: 'Essentials', slot: 0 },
  { value: 'lifestyle', label: 'Lifestyle', slot: 1 },
  { value: 'financial', label: 'Financial', slot: 6 },
  { value: 'other', label: 'Other', slot: 3 },
];
export const CATEGORY_KINDS: { value: CategoryKind; label: string; hint: string }[] = [
  { value: 'expense', label: 'Spending', hint: 'counts as spending' },
  { value: 'income', label: 'Income', hint: 'counts as income' },
  { value: 'saving', label: 'Saving / investing', hint: 'money set aside — not spending' },
  { value: 'transfer', label: 'Transfer', hint: 'between your own accounts — ignored in totals' },
];

export interface FinCategory {
  id: string;
  name: string;
  group: CategoryGroup;
  kind: CategoryKind;
  /** categorical colour slot 0–7 */
  slot: number;
  /** words that auto-categorise imported transactions (case-insensitive, matched in the description) */
  keywords?: string[];
  /** built-in category */
  builtIn?: boolean;
  /** position inside its group on the Budget screen */
  order?: number;
  /** hidden on the Budget screen (keeps its history) */
  hidden?: boolean;
  /** a short note shown in the budget inspector */
  note?: string;
}

export const DEFAULT_CATEGORIES: FinCategory[] = [
  { id: 'income', name: 'Income', group: 'income', kind: 'income', slot: 2, keywords: ['payroll', 'salary', 'direct dep', 'dir dep', 'paycheck', 'wages', 'invoice', 'stripe transfer', 'paypal transfer', 'interest paid', 'dividend', 'refund from irs', 'tax refund', 'deposit'] },
  { id: 'housing', name: 'Rent / mortgage', group: 'essentials', kind: 'expense', slot: 0, keywords: ['rent', 'mortgage', 'landlord', 'property mgmt', 'hoa', 'apartments'] },
  { id: 'utilities', name: 'Utilities', group: 'essentials', kind: 'expense', slot: 0, keywords: ['electric', 'energy', 'power', 'water', 'gas co', 'utility', 'comcast', 'xfinity', 'verizon', 'at&t', 't-mobile', 'spectrum', 'internet', 'broadband', 'pg&e', 'con ed', 'phone bill'] },
  { id: 'groceries', name: 'Groceries', group: 'essentials', kind: 'expense', slot: 0, keywords: ['grocery', 'market', 'whole foods', 'trader joe', 'safeway', 'kroger', 'aldi', 'lidl', 'tesco', 'sainsbury', 'costco', 'walmart', 'publix', 'wegmans', 'heb ', 'supermarket', 'albertsons', 'sprouts'] },
  { id: 'dining', name: 'Dining & coffee', group: 'lifestyle', kind: 'expense', slot: 1, keywords: ['restaurant', 'cafe', 'coffee', 'starbucks', 'doordash', 'uber eats', 'ubereats', 'grubhub', 'deliveroo', 'mcdonald', 'chipotle', 'pizza', 'sushi', 'bar ', 'grill', 'bistro', 'taco', 'burger', 'bakery', 'diner', 'kitchen', 'sweetgreen', 'blue bottle'] },
  { id: 'transport', name: 'Transport', group: 'essentials', kind: 'expense', slot: 0, keywords: ['uber', 'lyft', 'shell', 'chevron', 'exxon', 'bp ', 'fuel', 'gas station', 'parking', 'transit', 'metro', 'mta', 'train', 'toll', 'car wash', 'auto', 'dmv', 'clipper'] },
  { id: 'subscriptions', name: 'Subscriptions', group: 'lifestyle', kind: 'expense', slot: 1, keywords: ['netflix', 'spotify', 'hulu', 'disney', 'apple.com/bill', 'icloud', 'youtube premium', 'google storage', 'adobe', 'dropbox', 'patreon', 'substack', 'audible', 'prime video', 'amazon prime', 'hbo', 'max.com', 'notion', 'chatgpt', 'openai', 'anthropic', 'claude.ai', 'canva', 'membership', 'subscription'] },
  { id: 'shopping', name: 'Shopping', group: 'lifestyle', kind: 'expense', slot: 1, keywords: ['amazon', 'amzn', 'target', 'ikea', 'best buy', 'etsy', 'ebay', 'zara', 'h&m', 'uniqlo', 'nike', 'apple store', 'home depot', 'lowe', 'nordstrom', 'shop'] },
  { id: 'health', name: 'Health & fitness', group: 'essentials', kind: 'expense', slot: 0, keywords: ['pharmacy', 'cvs', 'walgreens', 'doctor', 'dental', 'dentist', 'clinic', 'hospital', 'medical', 'health', 'gym', 'fitness', 'yoga', 'peloton', 'classpass', 'insurance'] },
  { id: 'travel', name: 'Travel', group: 'lifestyle', kind: 'expense', slot: 1, keywords: ['airline', 'airlines', 'delta', 'united', 'american air', 'southwest', 'jetblue', 'ryanair', 'easyjet', 'airbnb', 'hotel', 'marriott', 'hilton', 'hyatt', 'expedia', 'booking.com', 'amtrak'] },
  { id: 'entertainment', name: 'Entertainment', group: 'lifestyle', kind: 'expense', slot: 1, keywords: ['cinema', 'movie', 'amc', 'theater', 'theatre', 'ticketmaster', 'concert', 'steam', 'playstation', 'xbox', 'nintendo', 'museum', 'bowling'] },
  { id: 'education', name: 'Education', group: 'lifestyle', kind: 'expense', slot: 1, keywords: ['tuition', 'udemy', 'coursera', 'masterclass', 'skillshare', 'school', 'university', 'books', 'kindle'] },
  { id: 'business', name: 'Business expenses', group: 'other', kind: 'expense', slot: 3, keywords: ['b&h', 'bhphoto', 'adorama', 'frame.io', 'vimeo', 'squarespace', 'godaddy', 'wix', 'aws', 'google workspace', 'gsuite', 'zoom', 'slack', 'coworking', 'wework', 'fedex', 'ups', 'usps'] },
  { id: 'savings', name: 'Savings & investing', group: 'financial', kind: 'saving', slot: 6, keywords: ['vanguard', 'fidelity', 'schwab', 'robinhood', 'betterment', 'wealthfront', 'ira contribution', '401k', 'brokerage', 'to savings', 'savings transfer'] },
  { id: 'transfers', name: 'Transfers & card payments', group: 'financial', kind: 'transfer', slot: 6, keywords: ['transfer to', 'transfer from', 'online transfer', 'payment thank you', 'autopay', 'card payment', 'credit card payment', 'payment received', 'zelle to self', 'internal transfer'] },
  { id: 'fees', name: 'Fees & interest', group: 'financial', kind: 'expense', slot: 6, keywords: ['fee', 'interest charge', 'finance charge', 'overdraft', 'late payment', 'atm fee', 'annual fee', 'foreign transaction'] },
  { id: 'other', name: 'Other', group: 'other', kind: 'expense', slot: 3, keywords: [] },
];

export type RuleMatch = 'contains' | 'starts_with' | 'exact' | 'regex';
export const RULE_MATCHES: { value: RuleMatch; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'exact', label: 'is exactly' },
  { value: 'regex', label: 'matches regex' },
];

/** "When the description matches → set category / rename / mark as transfer." Rules win over keywords. */
export interface FinRule {
  id: ID;
  match: string;
  matchType: RuleMatch;
  /** category id to set */
  category?: string;
  /** clean merchant name to set */
  rename?: string;
  transfer?: boolean;
  recurring?: boolean;
  /** only for this account */
  accountId?: ID;
}

/* ---------------------------------------------------------------- statements */

export type StatementFormat = 'csv' | 'ofx' | 'pdf' | 'text' | 'agent';
export const STATEMENT_FORMATS: { value: StatementFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'ofx', label: 'OFX / QFX' },
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: 'Pasted text' },
  { value: 'agent', label: 'From an AI agent' },
];

export interface FinStatement {
  id: ID;
  accountId?: ID;
  /** a short label, e.g. "Chase Sapphire — Sep 2026" */
  name?: string;
  periodStart?: ISODate;
  periodEnd?: ISODate;
  format: StatementFormat;
  /** stored file (asset name) */
  file?: string;
  fileName?: string;
  fileSize?: number;
  importedCount: number;
  duplicateCount?: number;
  closingBalance?: number;
  importedAt: string;
  /** where it came from ('upload', 'agent', 'email' …) */
  source?: string;
  notes?: string;
}

/* ---------------------------------------------------------------- budgets & goals */

/** Legacy (version 1) monthly limit per category. Migrated to a 'monthly' target on load; kept for old files. */
export interface FinBudget {
  id: ID;
  /** category id */
  category: string;
  /** monthly amount */
  amount: number;
  notes?: string;
}

/* ---------------------------------------------------------------- YNAB-style budget */

/** Money given a job: `assigned` to a category in a budget month ('YYYY-MM'). One row per month + category. */
export interface FinAssignment {
  month: string;
  /** category id (or a credit card payment category 'ccpay:<accountId>') */
  categoryId: string;
  assigned: number;
}

/** YNAB "targets":
    - monthly  — needed for spending / set aside `amount` every month
    - refill   — refill up to `amount` every month (counts what rolled over)
    - by_date  — needed for spending: `amount` by month `date`, optionally repeating every `repeatMonths`
    - balance  — have a savings balance of `amount` (by `date` when set, otherwise just progress) */
export type TargetType = 'monthly' | 'refill' | 'by_date' | 'balance';
export const TARGET_TYPES: { value: TargetType; label: string; hint: string }[] = [
  { value: 'monthly', label: 'Monthly amount', hint: 'Needed for spending: set aside this much every month' },
  { value: 'refill', label: 'Refill up to', hint: 'Top the category back up to this amount every month' },
  { value: 'by_date', label: 'Needed by date', hint: 'A true expense: this much by a month (optionally repeating)' },
  { value: 'balance', label: 'Savings balance', hint: 'Build up to a balance (by a month, or whenever)' },
];

export interface FinTarget {
  id: ID;
  categoryId: string;
  type: TargetType;
  amount: number;
  /** due / target month 'YYYY-MM' (by_date; optional for balance) */
  date?: string;
  /** by_date: repeat every N months after the due month (12 = yearly; 0 / unset = once) */
  repeatMonths?: number;
  notes?: string;
}

export type GoalType = 'emergency_fund' | 'debt_payoff' | 'savings' | 'purchase' | 'retirement' | 'other';
export const GOAL_TYPES: { value: GoalType; label: string; hint: string }[] = [
  { value: 'emergency_fund', label: 'Emergency fund', hint: '3–6 months of essential spending set aside' },
  { value: 'debt_payoff', label: 'Pay off debt', hint: 'clear a card or loan (target = what you owe)' },
  { value: 'savings', label: 'Savings target', hint: 'a pot of money for anything' },
  { value: 'purchase', label: 'Big purchase', hint: 'a car, gear, a deposit, a trip' },
  { value: 'retirement', label: 'Retirement / investing', hint: 'long-term investing' },
  { value: 'other', label: 'Other', hint: '' },
];

export interface FinGoal {
  id: ID;
  name: string;
  type: GoalType;
  target: number;
  /** saved so far (or, for debt payoff, already paid off); ignored when an account is linked */
  current: number;
  /** planned monthly contribution */
  monthly?: number;
  targetDate?: ISODate;
  startDate?: ISODate;
  /** linked account: savings goals use its balance, debt goals use target − amount owed */
  accountId?: ID;
  slot?: number;
  done?: boolean;
  notes?: string;
}

/* ---------------------------------------------------------------- insights & advice */

export type InsightSource = 'agent' | 'app' | 'user';
export type InsightKind = 'tip' | 'warning' | 'opportunity' | 'summary';
export const INSIGHT_KINDS: { value: InsightKind; label: string }[] = [
  { value: 'tip', label: 'Tip' },
  { value: 'warning', label: 'Warning' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'summary', label: 'Summary' },
];

/** A saved insight or piece of advice (from an agent, pinned from the app's insights, or written by the user). */
export interface FinInsight {
  id: ID;
  title: string;
  body: string;
  source: InsightSource;
  kind?: InsightKind;
  /** agent / assistant name when source = 'agent' */
  author?: string;
  date: ISODate;
  pinned?: boolean;
  dismissed?: boolean;
  /** key of the computed insight it was pinned from */
  key?: string;
}

/* ---------------------------------------------------------------- settings */

export interface FinSettings {
  defaultAccountId?: ID;
  /** day of the month your budgeting month starts (1–28; e.g. payday) */
  monthStartDay: number;
  /** assumed yearly return for projections, % */
  expectedReturn: number;
  /** months of spending an emergency fund should cover */
  emergencyMonths: number;
  /** transactions above this amount are flagged as unusual (0 = automatic) */
  largeTransaction: number;
  /** debt payoff planner */
  payoffStrategy: 'avalanche' | 'snowball';
  extraDebtPayment: number;
  /** computed insights the user dismissed (keys) */
  dismissedInsights: string[];
  /** count on-budget cash balances from before the first transaction as "Starting balances" in Ready to Assign (default true) */
  budgetOpeningBalances?: boolean;
}

export interface FinanceData {
  /** schema version of this kind's data */
  version: number;
  accounts: FinAccount[];
  transactions: FinTransaction[];
  categories: FinCategory[];
  rules: FinRule[];
  statements: FinStatement[];
  /** legacy limits (version 1); migrated to targets — always empty after normalize */
  budgets: FinBudget[];
  /** YNAB-style money assigned per month and category */
  assignments: FinAssignment[];
  /** YNAB-style category targets (one per category) */
  targets: FinTarget[];
  goals: FinGoal[];
  insights: FinInsight[];
  settings: FinSettings;
}

export const DEFAULT_FIN_SETTINGS: FinSettings = {
  monthStartDay: 1,
  expectedReturn: 5,
  emergencyMonths: 6,
  largeTransaction: 0,
  payoffStrategy: 'avalanche',
  extraDebtPayment: 0,
  dismissedInsights: [],
};

/* ---------------------------------------------------------------- normalize */

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : []);
const numOr = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

const TARGET_IDS = new Set<string>(TARGET_TYPES.map((t) => t.value));
const MONTH_RE = /^\d{4}-\d{2}$/;

function normTargets(raw: unknown): FinTarget[] {
  const seen = new Set<string>();
  return arr<FinTarget>(raw)
    .filter((t) => t.id && typeof t.categoryId === 'string' && t.categoryId)
    .filter((t) => (seen.has(t.categoryId) ? false : (seen.add(t.categoryId), true)))
    .map((t) => {
      const out: FinTarget = { ...t, type: TARGET_IDS.has(t.type) ? t.type : 'monthly', amount: Math.max(0, numOr(t.amount, 0)) };
      const d = out.date == null ? '' : String(out.date).slice(0, 7);
      if (MONTH_RE.test(d)) out.date = d;
      else delete out.date;
      if (out.repeatMonths != null) out.repeatMonths = Math.max(0, Math.min(120, Math.round(numOr(out.repeatMonths, 0))));
      return out;
    });
}

function normAssignments(raw: unknown): FinAssignment[] {
  const map = new Map<string, FinAssignment>();
  for (const a of arr<FinAssignment>(raw)) {
    if (!MONTH_RE.test(String(a.month)) || typeof a.categoryId !== 'string' || !a.categoryId) continue;
    const v = Math.round(numOr(a.assigned, 0) * 100) / 100;
    const k = `${a.month}|${a.categoryId}`;
    const prev = map.get(k);
    if (prev) prev.assigned = Math.round((prev.assigned + v) * 100) / 100;
    else map.set(k, { month: a.month, categoryId: a.categoryId, assigned: v });
  }
  return [...map.values()].filter((a) => a.assigned !== 0);
}

function migrateBudgets(budgets: FinBudget[]): FinTarget[] {
  const seen = new Set<string>();
  const out: FinTarget[] = [];
  for (const b of budgets) {
    if (!b.id || typeof b.category !== 'string' || seen.has(b.category)) continue;
    seen.add(b.category);
    out.push({ id: `tgt_${b.id}`, categoryId: b.category, type: 'monthly', amount: Math.max(0, numOr(b.amount, 0)), ...(b.notes ? { notes: b.notes } : {}) });
  }
  return out;
}

/** Fill in every field (new spaces, older or hand-edited files). Must not throw. */
export function normalizeFinance(raw: unknown): FinanceData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<FinanceData>;
  const categories = arr<FinCategory>(d.categories)
    .filter((c) => typeof c.id === 'string' && c.id)
    .map((c) => ({
      ...c,
      name: str(c.name) || c.id,
      group: CATEGORY_GROUPS.some((g) => g.value === c.group) ? c.group : 'other',
      kind: CATEGORY_KINDS.some((k) => k.value === c.kind) ? c.kind : 'expense',
      slot: Math.max(0, Math.min(7, Math.round(numOr(c.slot, 3)))),
      keywords: Array.isArray(c.keywords) ? c.keywords.map(str).filter(Boolean) : [],
      ...(c.order != null ? { order: numOr(c.order, 0) } : {}),
    }));
  const s = (d.settings && typeof d.settings === 'object' ? d.settings : {}) as Partial<FinSettings>;
  return {
    version: FINANCE_VERSION,
    accounts: arr<FinAccount>(d.accounts)
      .filter((a) => a.id)
      .map((a) => ({ ...a, name: str(a.name) || 'Account', type: ACCOUNT_TYPE_BY_ID[a.type] ? a.type : 'checking' })),
    transactions: arr<FinTransaction>(d.transactions)
      .filter((t) => t.id && typeof t.date === 'string')
      .map((t) => ({ ...t, description: str(t.description), amount: numOr(t.amount, 0) })),
    // a brand-new space starts with the default categories; afterwards the list is the user's
    categories: d.categories === undefined ? DEFAULT_CATEGORIES.map((c) => ({ ...c, keywords: [...(c.keywords ?? [])], builtIn: true })) : categories,
    rules: arr<FinRule>(d.rules)
      .filter((r) => r.id)
      .map((r) => ({ ...r, match: str(r.match), matchType: RULE_MATCHES.some((m) => m.value === r.matchType) ? r.matchType : 'contains' })),
    statements: arr<FinStatement>(d.statements)
      .filter((x) => x.id)
      .map((x) => ({ ...x, format: STATEMENT_FORMATS.some((f) => f.value === x.format) ? x.format : 'csv', importedCount: numOr(x.importedCount, 0), importedAt: str(x.importedAt) || new Date().toISOString() })),
    // version 1 budgets become 'monthly' targets (once: while the file has no targets list yet)
    budgets: [],
    assignments: normAssignments(d.assignments),
    targets: Array.isArray(d.targets) ? normTargets(d.targets) : migrateBudgets(arr<FinBudget>(d.budgets)),
    goals: arr<FinGoal>(d.goals)
      .filter((g) => g.id)
      .map((g) => ({ ...g, name: str(g.name) || 'Goal', type: GOAL_TYPES.some((t) => t.value === g.type) ? g.type : 'savings', target: Math.max(0, numOr(g.target, 0)), current: numOr(g.current, 0) })),
    insights: arr<FinInsight>(d.insights)
      .filter((i) => i.id)
      .map((i) => ({ ...i, title: str(i.title), body: str(i.body), source: i.source === 'agent' || i.source === 'app' || i.source === 'user' ? i.source : 'agent', date: str(i.date).slice(0, 10) || new Date().toISOString().slice(0, 10) })),
    settings: {
      ...DEFAULT_FIN_SETTINGS,
      ...s,
      monthStartDay: Math.max(1, Math.min(28, Math.round(numOr(s.monthStartDay, 1)))),
      expectedReturn: numOr(s.expectedReturn, DEFAULT_FIN_SETTINGS.expectedReturn),
      emergencyMonths: Math.max(1, numOr(s.emergencyMonths, DEFAULT_FIN_SETTINGS.emergencyMonths)),
      largeTransaction: Math.max(0, numOr(s.largeTransaction, 0)),
      payoffStrategy: s.payoffStrategy === 'snowball' ? 'snowball' : 'avalanche',
      extraDebtPayment: Math.max(0, numOr(s.extraDebtPayment, 0)),
      dismissedInsights: Array.isArray(s.dismissedInsights) ? s.dismissedInsights.map(str) : [],
    },
  };
}
