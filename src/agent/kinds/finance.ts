/* Agent (MCP) collections, single fields and tools of 'finance' spaces
   (Personal Finances). Every finance tool goes through spaceOf('finance'), which
   refuses while the finances are locked; the generic data tools refuse too
   (activeDoc → requireFinanceUnlocked). The YNAB-style budget (assignments,
   targets, Ready to Assign) is read and changed with finance_budget. */
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import type { ToolDef } from '../tool';
import { defineTool } from '../tool';
import { arr, bool, enm, int, num, obj, opt, str } from '../schema';
import { clean, fail, plural, spaceOf } from '../ctx';
import { makeFormatters } from '@/lib/format';
import { todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import type { AccountType, CategoryGroup, CategoryKind, CsvMapping, FinAccount, FinanceData, FinCategory, InsightKind, RuleMatch, StatementFormat } from '@/spaces/finance/types';
import { ACCOUNT_TYPES, CATEGORY_GROUPS, CATEGORY_KINDS, GOAL_TYPES, INSIGHT_KINDS, normalizeFinance, RULE_MATCHES, STATEMENT_FORMATS, TARGET_TYPES, type TargetType } from '@/spaces/finance/types';
import {
  accountLabel,
  averageMonth,
  budgetRows,
  byCategory,
  byMerchant,
  catMap,
  computeInsights,
  debtPayoff,
  debtsOf,
  detectRecurring,
  goalProgress,
  inRange,
  merchantOf,
  monthElapsed,
  monthLabel,
  monthOf,
  monthRange,
  monthlySeries,
  netWorth,
  periodRange,
  PERIODS,
  round2,
  savingsProjection,
  shiftMonth,
  totals,
  type PeriodId,
} from '@/spaces/finance/calc';
import { bytesToText, detectCsv, fileKind, parseDate, parseOfx, parseStatementText, prepareImport, rowsFromCsv, csvHeaders, type ParsedRow, type SignMode } from '@/spaces/finance/importers';
import { addAdvice, addCategory, addRule, addStatementFile, applyAssignChanges, applyRules, commitImport, getFinance, patchInsight, setTarget, updateFinance } from '@/spaces/finance/ops';
import { AUTO_ASSIGN, autoAssignPlan, budgetCategories, budgetMonth as budgetMonthView, budgetTips, isCcPaymentId, moveMoneyIn, RTA_ID, setAssignedIn, assignedIn, type AutoAssignMode, type BudgetCategory, type CatRow } from '@/spaces/finance/ynab';

const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const req = { required: true };
const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
/** Typed loosely: the getters receive a SpaceData. */
type S = any;
const finOf = (s: S): FinanceData => s.finance ?? normalizeFinance({});
const finDraft = (d: S): FinanceData => (d.finance ??= normalizeFinance({}));

/* ---------------------------------------------------------------- collections */

export const FINANCE_COLLECTIONS: CollectionDef[] = [
  {
    name: 'accounts',
    label: 'Accounts (checking, savings, credit cards, loans, investments, cash)',
    module: 'accounts' as any,
    navParam: 'accountId',
    description:
      'Bank and card accounts. balance = what the account holds; for credit_card and loan it is the amount OWED as a positive number (net worth = assets − debts). Store only last4, never full card / account numbers. apr in %, minPayment per month, statementDay 1–31.',
    kind: 'array',
    get: (s: S) => finOf(s).accounts,
    draft: (d: S) => finDraft(d).accounts,
    idPrefix: 'acct',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('type', 'enum', { ...req, values: v(ACCOUNT_TYPES) }),
      F('institution', 'string', { desc: 'bank / card issuer' }),
      F('last4', 'string', { desc: 'last 4 digits only' }),
      F('balance', 'number', { desc: 'current balance (amount owed for credit cards / loans)' }),
      F('balanceDate', 'date'),
      F('creditLimit', 'number'),
      F('apr', 'number', { desc: 'annual interest rate in %' }),
      F('minPayment', 'number', { desc: 'minimum monthly payment (cards, loans)' }),
      F('statementDay', 'integer', { desc: 'day of month the statement closes' }),
      F('slot', 'integer', { desc: 'colour slot 0–7' }),
      F('archived', 'boolean'),
      F('onBudget', 'boolean', { desc: 'YNAB-style budget: true = on budget, false = tracking only; unset = checking / savings / cash / credit cards on budget, loans and investments tracking' }),
      F('notes', 'text'),
    ],
    defaults: (s: S) => ({ type: 'checking', balanceDate: todayISO(), slot: finOf(s).accounts.length % 8 }),
  },
  {
    name: 'transactions',
    label: 'Transactions (signed: negative = money out)',
    module: 'transactions' as any,
    navParam: 'transactionId',
    description:
      'Every transaction. amount is signed in the space currency: negative = money out, positive = money in. category = a category id or name (describe with list_items {collection:"categories"}). transfer = a move between the user’s own accounts (card payments, savings transfers) and is ignored in income / spending. To import statements use finance_import_transactions (it de-duplicates and auto-categorises); to (re)categorise many at once use finance_categorize. add_items is for single manual entries.',
    kind: 'array',
    get: (s: S) => finOf(s).transactions,
    draft: (d: S) => finDraft(d).transactions,
    idPrefix: 'tx',
    nameField: 'description',
    hideInList: ['hash'],
    fields: [
      F('date', 'date', req),
      F('description', 'string', { ...req, desc: 'as on the statement' }),
      F('merchant', 'string', { desc: 'clean merchant / payee name' }),
      F('amount', 'number', { ...req, desc: 'negative = money out, positive = money in' }),
      F('accountId', 'ref', { ref: 'accounts' }),
      F('category', 'ref', { ref: 'categories' }),
      F('notes', 'text'),
      F('tags', 'string[]'),
      F('transfer', 'boolean', { desc: 'between own accounts — not income or spending' }),
      F('recurring', 'boolean', { desc: 'bill, subscription or salary' }),
      F('statementId', 'ref', { ref: 'statements', readOnly: true }),
      F('hash', 'string', { readOnly: true }),
      F('createdAt', 'string', { readOnly: true }),
    ],
    defaults: (s: S) => ({ date: todayISO(), accountId: finOf(s).settings.defaultAccountId, createdAt: new Date().toISOString() }),
  },
  {
    name: 'categories',
    label: 'Spending / income categories',
    module: 'categories' as any,
    description:
      'Categories with a group (income, essentials, lifestyle, financial, other) and kind: expense (counts as spending), income, saving (money set aside — not spending) or transfer (ignored in totals). keywords auto-categorise imported transactions (matched at the start of a word in the description). Built-in ids: income, housing, utilities, groceries, dining, transport, subscriptions, shopping, health, travel, entertainment, education, business, savings, transfers, fees, other.',
    kind: 'array',
    get: (s: S) => finOf(s).categories,
    draft: (d: S) => finDraft(d).categories,
    idPrefix: 'cat',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('group', 'enum', { ...req, values: v(CATEGORY_GROUPS) }),
      F('kind', 'enum', { ...req, values: v(CATEGORY_KINDS) }),
      F('slot', 'integer', { desc: 'colour slot 0–7' }),
      F('keywords', 'string[]', { desc: 'lower-case words that auto-categorise' }),
      F('order', 'number', { desc: 'position inside its group on the Budget screen' }),
      F('hidden', 'boolean', { desc: 'hidden on the Budget screen' }),
      F('note', 'text'),
      F('builtIn', 'boolean', { readOnly: true }),
    ],
    defaults: () => ({ group: 'lifestyle', kind: 'expense', slot: 1, keywords: [] }),
  },
  {
    name: 'targets',
    label: 'Budget targets (YNAB-style, one per category)',
    module: 'budgets' as any,
    navParam: 'categoryId',
    description:
      'What each budget category needs. type: monthly (set aside `amount` every month), refill (refill up to `amount`), by_date (needed for spending: `amount` by month `date` YYYY-MM, optionally repeating every `repeatMonths`, 12 = yearly — use it for true expenses like insurance or holidays), balance (savings balance of `amount`, by `date` when set). categoryId = a category id or "ccpay:<accountId>" for a card payment category. Prefer finance_budget {action:"set_target"}, which resolves names and returns what the target needs this month.',
    kind: 'array',
    get: (s: S) => finOf(s).targets,
    draft: (d: S) => finDraft(d).targets,
    idPrefix: 'tgt',
    nameField: 'categoryId',
    fields: [
      F('categoryId', 'string', { ...req, desc: 'category id or ccpay:<accountId>' }),
      F('type', 'enum', { ...req, values: v(TARGET_TYPES) }),
      F('amount', 'number', req),
      F('date', 'string', { desc: 'YYYY-MM due / target month (by_date, optional for balance)' }),
      F('repeatMonths', 'integer', { desc: 'by_date: repeat every N months (12 = yearly)' }),
      F('notes', 'text'),
    ],
    defaults: () => ({ type: 'monthly' }),
  },
  {
    name: 'goals',
    label: 'Financial goals',
    module: 'plan' as any,
    description:
      'Goals: emergency_fund, debt_payoff, savings, purchase, retirement, other. target amount, current (saved so far; ignored when accountId is linked — savings goals then use the account balance, debt goals use target − amount owed), monthly contribution, targetDate. Projections: finance_plan.',
    kind: 'array',
    get: (s: S) => finOf(s).goals,
    draft: (d: S) => finDraft(d).goals,
    idPrefix: 'goal',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('type', 'enum', { ...req, values: v(GOAL_TYPES) }),
      F('target', 'number', req),
      F('current', 'number'),
      F('monthly', 'number', { desc: 'planned monthly contribution' }),
      F('targetDate', 'date'),
      F('startDate', 'date'),
      F('accountId', 'ref', { ref: 'accounts' }),
      F('slot', 'integer'),
      F('done', 'boolean'),
      F('notes', 'text'),
    ],
    defaults: () => ({ type: 'savings', current: 0, startDate: todayISO() }),
  },
  {
    name: 'rules',
    label: 'Categorisation rules',
    module: 'categories' as any,
    description:
      'Rules run on every import before category keywords: when the description contains / starts_with / exact / regex `match` → set category, rename the merchant, mark transfer or recurring; optional accountId limits it to one account. Creating a rule does not change existing transactions — use finance_categorize {createRule} for that.',
    kind: 'array',
    get: (s: S) => finOf(s).rules,
    draft: (d: S) => finDraft(d).rules,
    idPrefix: 'rule',
    nameField: 'match',
    fields: [
      F('match', 'string', req),
      F('matchType', 'enum', { ...req, values: v(RULE_MATCHES) }),
      F('category', 'ref', { ref: 'categories' }),
      F('rename', 'string'),
      F('transfer', 'boolean'),
      F('recurring', 'boolean'),
      F('accountId', 'ref', { ref: 'accounts' }),
    ],
    defaults: () => ({ matchType: 'contains' }),
  },
  {
    name: 'statements',
    label: 'Imported statements (read-mostly)',
    module: 'import' as any,
    navParam: 'statementId',
    description: 'One record per imported statement with its period, format, imported / duplicate counts and the stored file. Created by finance_import_transactions. Deleting a statement here keeps its transactions.',
    kind: 'array',
    get: (s: S) => finOf(s).statements,
    draft: (d: S) => finDraft(d).statements,
    idPrefix: 'stmt',
    nameField: 'name',
    addVia: 'Statements are created by finance_import_transactions (rows, csvText, ofxText, text, path or base64).',
    fields: [
      F('name', 'string'),
      F('accountId', 'ref', { ref: 'accounts' }),
      F('periodStart', 'date'),
      F('periodEnd', 'date'),
      F('format', 'enum', { values: v(STATEMENT_FORMATS), readOnly: true }),
      F('importedCount', 'integer', { readOnly: true }),
      F('duplicateCount', 'integer', { readOnly: true }),
      F('closingBalance', 'number'),
      F('fileName', 'string', { readOnly: true }),
      F('file', 'string', { readOnly: true }),
      F('importedAt', 'string', { readOnly: true }),
      F('source', 'string'),
      F('notes', 'text'),
    ],
  },
  {
    name: 'insights',
    label: 'Saved insights & advice notes',
    module: 'advice' as any,
    description:
      'Advice and notes shown under Advice & insights (pinned ones also on the Overview). source: agent | app | user. Prefer finance_add_advice to save advice. Advice is educational, not professional financial advice.',
    kind: 'array',
    get: (s: S) => finOf(s).insights,
    draft: (d: S) => finDraft(d).insights,
    idPrefix: 'ins',
    nameField: 'title',
    fields: [
      F('title', 'string', req),
      F('body', 'text'),
      F('source', 'enum', { values: ['agent', 'app', 'user'] }),
      F('kind', 'enum', { values: v(INSIGHT_KINDS) }),
      F('author', 'string', { desc: 'agent name' }),
      F('date', 'date'),
      F('pinned', 'boolean'),
      F('dismissed', 'boolean'),
      F('key', 'string', { readOnly: true }),
    ],
    defaults: () => ({ source: 'agent', date: todayISO() }),
  },
];

export const FINANCE_SINGLETONS: SingletonDef[] = [
  {
    path: 'finance.settings',
    label: 'Finance settings: default account, budget month start day, projection assumptions, debt plan',
    get: (s: S) => finOf(s).settings,
    draft: (d: S) => finDraft(d).settings,
    fields: [
      F('defaultAccountId', 'ref', { ref: 'accounts', desc: 'account used for manual entries and imports without an account' }),
      F('monthStartDay', 'integer', { desc: 'day the budget month starts (1–28, e.g. payday)' }),
      F('expectedReturn', 'number', { desc: 'assumed yearly return % for projections' }),
      F('emergencyMonths', 'number', { desc: 'months of spending an emergency fund should cover' }),
      F('largeTransaction', 'number', { desc: 'flag payments above this (0 = automatic)' }),
      F('payoffStrategy', 'enum', { values: ['avalanche', 'snowball'] }),
      F('extraDebtPayment', 'number', { desc: 'extra paid towards debt each month' }),
    ],
  },
  {
    path: 'settings',
    label: 'Formats: currency, dates',
    get: (s: S) => s.settings,
    draft: (d: S) => d.settings,
    fields: [F('currency', 'string', { desc: "ISO 4217 code, e.g. 'USD', 'EUR', 'GBP'" }), F('dateFormat', 'enum', { values: ['MDY', 'DMY', 'YMD'] }), F('paperSize', 'enum', { values: ['letter', 'a4'] })],
  },
  {
    path: 'meta',
    label: 'Name of this space',
    get: (s: S) => s.meta,
    draft: (d: S) => d.meta,
    fields: [F('title', 'string', { required: true })],
  },
];

/* ---------------------------------------------------------------- helpers */

const NOT_ADVICE = 'Educational estimates from the user’s own data, not professional financial advice.';
const norm = (x: unknown) => String(x ?? '').trim().toLowerCase();

function finance(): { f: FinanceData; money: (n: number) => string; currency: string } {
  const s = spaceOf('finance');
  const fmt = makeFormatters(s.settings as never);
  return { f: s.finance ?? normalizeFinance({}), money: (n: number) => fmt.money(n), currency: s.settings?.currency ?? 'USD' };
}

function findAccount(f: FinanceData, ref: string | undefined): FinAccount | undefined {
  if (!ref?.trim()) return undefined;
  const r = norm(ref);
  return (
    f.accounts.find((a) => a.id === ref) ??
    f.accounts.find((a) => norm(a.name) === r) ??
    f.accounts.find((a) => norm(accountLabel(a)) === r) ??
    f.accounts.find((a) => a.last4 && r.replace(/\D/g, '').endsWith(a.last4) && r.replace(/\D/g, '').length >= 4) ??
    f.accounts.find((a) => norm(a.name).includes(r) && r.length >= 3)
  );
}

function requireAccount(f: FinanceData, ref: string | undefined): FinAccount {
  const a = findAccount(f, ref);
  if (!a) fail(`Unknown account "${ref ?? ''}". Accounts: ${f.accounts.map((x) => `${accountLabel(x)} (${x.id}, ${x.type})`).join('; ') || 'none yet — pass createAccount {name, type, last4} or add one with add_items {collection:"accounts"}'}.`);
  return a;
}

function findCategory(f: FinanceData, ref: string | undefined): FinCategory | undefined {
  if (!ref?.trim()) return undefined;
  const r = norm(ref);
  return f.categories.find((c) => c.id === ref) ?? f.categories.find((c) => norm(c.name) === r) ?? f.categories.find((c) => norm(c.id) === r.replace(/[\s/-]+/g, '_'));
}

function requireCategory(f: FinanceData, ref: string): FinCategory {
  const c = findCategory(f, ref);
  if (!c) fail(`Unknown category "${ref}". Categories: ${f.categories.map((x) => `${x.name} (${x.id})`).join(', ')}. Pass createCategory to make a new one.`);
  return c;
}

function decodeBase64(b64: string): Uint8Array {
  const clean64 = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const bin = atob(clean64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------------------------------------------------------- tools */

const ROW = obj({
  date: str('YYYY-MM-DD (other formats like 10/03/2026 or "Oct 3, 2026" are accepted)'),
  description: str('as printed on the statement'),
  amount: num('signed: negative = money out (purchase, fee, payment out), positive = money in (salary, refund, card payment received)'),
  category: opt(str('optional category id or name; otherwise rules + keywords decide')),
  merchant: opt(str('optional clean merchant name')),
  notes: opt(str()),
  balance: opt(num('running balance after this transaction, if printed')),
});


/* ---------------------------------------------------------------- YNAB-style budget */

function resolveBudgetCat(f: FinanceData, ref: string | undefined, allowRta = false): BudgetCategory | typeof RTA_ID {
  const r = norm(ref);
  if (allowRta && (r === 'rta' || r === 'ready to assign' || r === 'ready_to_assign' || r === 'tbb' || r === 'to be budgeted')) return RTA_ID;
  const all = budgetCategories(f);
  const hit =
    all.find((c) => c.id === ref) ??
    all.find((c) => norm(c.name) === r) ??
    all.find((c) => c.kind === 'payment' && (r === norm(`${c.name} payment`) || findAccount(f, ref)?.id === c.accountId)) ??
    all.find((c) => c.kind !== 'payment' && norm(c.id) === r.replace(/[\s/-]+/g, '_'));
  if (!hit)
    fail(
      `Unknown budget category "${ref ?? ''}". Budget categories: ${all.map((c) => `${c.name} (${c.id})`).join(', ')}${allowRta ? '; or "rta" for Ready to Assign' : ''}. Income and transfer categories are not budget categories (income goes to Ready to Assign).`,
    );
  return hit;
}

const monthArg = (m: string | undefined, f: FinanceData) => {
  if (m != null && !/^\d{4}-\d{2}$/.test(m)) fail('month: use YYYY-MM.');
  return m ?? monthOf(todayISO(), f.settings.monthStartDay);
};

function rowOut(r: CatRow, money: (n: number) => string) {
  return clean({
    id: r.id,
    name: r.name,
    assigned: r.assigned,
    activity: r.activity,
    available: r.available,
    rolledOver: r.carryIn || undefined,
    status: r.status,
    overspent: r.status === 'overspent' ? (r.creditOverspent > 0 && r.cashOverspent <= 0 ? 'credit' : 'cash') : undefined,
    target: r.target ? clean({ type: r.target.type, amount: r.target.amount, date: r.target.date, repeatMonths: r.target.repeatMonths, summary: r.info?.label(money), neededThisMonth: r.info?.need || undefined, perMonth: r.info?.perMonth, progressPct: r.info ? Math.round(r.info.progress * 100) : undefined }) : undefined,
    cardBalance: r.cardBalance,
    hidden: r.hidden || undefined,
  });
}

const BUDGET_ACTIONS = ['read', 'assign', 'move', 'set_target', 'remove_target', 'auto_assign'] as const;
type BudgetAction = (typeof BUDGET_ACTIONS)[number];

export const financeBudgetTool: ToolDef = defineTool({
  name: 'finance_budget',
  title: 'YNAB-style budget (Personal Finances)',
  description:
    'Reads and changes the user’s zero-based, YNAB-style budget in Personal Finances (only while unlocked; open_finances first). Every dollar that comes in (income on on-budget accounts) lands in Ready to Assign (RTA); the user gives it a job by ASSIGNING it to categories per month. Per category and month: assigned, activity (that month’s categorised spending, negative), available (positive available rolls over; cash overspending comes out of next month’s RTA; card overspending becomes card debt). Credit cards have payment categories ("ccpay:<accountId>"). Actions: ' +
    'read {month} → RTA and its parts, Age of Money, groups with every category (assigned / activity / available / status / target), uncategorised spending and Rule-of-YNAB tips; ' +
    'assign {month, category, amount, add?} or {month, assignments:[{category, amount}]} → set (or add to) assigned amounts; ' +
    'move {month, from, to, amount} → move money between categories ("rta" = Ready to Assign; use it to cover overspending); ' +
    'set_target {category, target:{type: monthly | refill | by_date | balance, amount, date YYYY-MM, repeatMonths}} / remove_target {category}; ' +
    'auto_assign {month, mode: underfunded | assigned_last_month | spent_last_month | average_assigned | average_spent | reset_available | reset_assigned, categories?, dryRun?}. ' +
    'Each change is one undo step. Categories accept ids or names. Suggest, don’t lecture: it is the user’s plan (educational, not financial advice).',
  global: true,
  input: obj({
    action: enm(BUDGET_ACTIONS),
    month: opt(str('YYYY-MM (default: the current budget month)')),
    category: opt(str('category id or name (card payment: "ccpay:<accountId>" or the card name)')),
    amount: opt(num('assign: the assigned amount (or the amount to add with add:true); move: amount to move')),
    add: opt(bool('assign: add `amount` to what is assigned instead of replacing it')),
    assignments: opt(arr(obj({ category: str(), amount: num('assigned amount for the month') }), 'assign: several categories at once (set)')),
    from: opt(str('move: category id / name or "rta"')),
    to: opt(str('move: category id / name or "rta"')),
    target: opt(obj({ type: enm(TARGET_TYPES.map((t) => t.value)), amount: num(), date: opt(str('YYYY-MM')), repeatMonths: opt(int('by_date: repeat every N months (12 = yearly)', 0)), notes: opt(str()) })),
    mode: opt(enm(AUTO_ASSIGN.map((a) => a.value))),
    categories: opt(arr(str(), 'auto_assign: only these categories (ids or names)')),
    dryRun: opt(bool('auto_assign: only show what would change')),
    includeHidden: opt(bool('read: include hidden categories')),
  }),
  run(a: {
    action: BudgetAction;
    month?: string;
    category?: string;
    amount?: number;
    add?: boolean;
    assignments?: { category: string; amount: number }[];
    from?: string;
    to?: string;
    target?: { type: TargetType; amount: number; date?: string; repeatMonths?: number; notes?: string };
    mode?: AutoAssignMode;
    categories?: string[];
    dryRun?: boolean;
    includeHidden?: boolean;
  }) {
    const { f, money, currency } = finance();
    const month = monthArg(a.month, f);
    const after = (ids: string[]) => {
      const v = budgetMonthView(getFinance(), month);
      return { readyToAssign: v.rta, rows: v.rows.filter((r) => ids.includes(r.id)).map((r) => rowOut(r, money)) };
    };
    switch (a.action) {
      case 'read': {
        const v = budgetMonthView(f, month);
        return {
          data: clean({
            currency,
            month,
            readyToAssign: v.rta,
            rtaParts: { inflowThisMonth: v.parts.inflow, startingBalances: v.parts.startingBalances || undefined, overspentLastMonth: v.parts.overspentLastMonth, assignedThisMonth: v.parts.assignedThisMonth, assignedInFutureMonths: v.parts.assignedInFuture, leftOverFromBefore: v.parts.leftOver },
            totals: { assigned: v.assigned, activity: v.activity, available: v.available, underfundedTargets: v.underfunded, cashOverspent: v.cashOverspent, creditOverspent: v.creditOverspent },
            ageOfMoneyDays: v.ageOfMoney,
            groups: v.groups.map((g) => ({ group: g.label, assigned: g.assigned, activity: g.activity, available: g.available, categories: g.rows.filter((r) => a.includeHidden || !r.hidden || r.available !== 0).map((r) => rowOut(r, money)) })),
            uncategorized: v.uncategorized.count ? { transactions: v.uncategorized.count, spent: v.uncategorized.amount, note: 'Counts as cash overspending until categorised (finance_categorize).' } : undefined,
            tips: budgetTips(v, f, money).map((t) => `Rule ${t.rule}: ${t.title}. ${t.body}`),
            note: NOT_ADVICE,
          }),
          summary: `Read the ${monthLabel(month, true)} budget`,
        };
      }
      case 'assign': {
        const list = a.assignments?.length ? a.assignments : a.category != null && a.amount != null ? [{ category: a.category, amount: a.amount }] : fail('assign needs category + amount, or assignments [{category, amount}].');
        const resolved = list.map((x) => {
          if (typeof x.amount !== 'number' || !isFinite(x.amount)) fail(`amount for "${x.category}" must be a number.`);
          return { c: resolveBudgetCat(f, x.category) as BudgetCategory, amount: round2(x.amount) };
        });
        updateFinance((fd) => {
          for (const { c, amount } of resolved) setAssignedIn(fd.assignments, month, c.id, a.add && !a.assignments?.length ? assignedIn(fd.assignments, month, c.id) + amount : amount);
        });
        return { data: after(resolved.map((x) => x.c.id)), summary: `Assigned money to ${plural(resolved.length, 'category', 'categories')} in ${monthLabel(month, true)}` };
      }
      case 'move': {
        if (!(typeof a.amount === 'number' && a.amount > 0)) fail('move needs a positive amount.');
        const from = resolveBudgetCat(f, a.from, true);
        const to = resolveBudgetCat(f, a.to, true);
        const fid = from === RTA_ID ? RTA_ID : from.id;
        const tid = to === RTA_ID ? RTA_ID : to.id;
        if (fid === tid) fail('from and to are the same.');
        updateFinance((fd) => moveMoneyIn(fd.assignments, month, fid, tid, a.amount!));
        const name = (x: BudgetCategory | typeof RTA_ID) => (x === RTA_ID ? 'Ready to Assign' : x.name);
        return { data: after([fid, tid]), summary: `Moved ${money(a.amount)} from ${name(from)} to ${name(to)}` };
      }
      case 'set_target': {
        const c = resolveBudgetCat(f, a.category) as BudgetCategory;
        if (!a.target) fail('set_target needs target {type, amount, date?, repeatMonths?}.');
        if (!(a.target.amount > 0)) fail('target.amount must be positive.');
        if (a.target.date && !/^\d{4}-\d{2}/.test(a.target.date)) fail('target.date: use YYYY-MM.');
        if (a.target.type === 'by_date' && !a.target.date) fail('by_date targets need a date (YYYY-MM).');
        setTarget(c.id, { type: a.target.type, amount: a.target.amount, date: a.target.date?.slice(0, 7), repeatMonths: a.target.repeatMonths, notes: a.target.notes });
        return { data: after([c.id]), summary: `Set a ${a.target.type} target on ${c.name}` };
      }
      case 'remove_target': {
        const c = resolveBudgetCat(f, a.category) as BudgetCategory;
        if (!f.targets.some((t) => t.categoryId === c.id)) fail(`${c.name} has no target.`);
        setTarget(c.id, null);
        return { data: { removed: c.id }, summary: `Removed the target on ${c.name}` };
      }
      case 'auto_assign': {
        if (!a.mode) fail(`auto_assign needs mode: ${AUTO_ASSIGN.map((m) => m.value).join(', ')}.`);
        const ids = a.categories?.map((x) => (resolveBudgetCat(f, x) as BudgetCategory).id);
        const plan = autoAssignPlan(f, month, a.mode, ids);
        if (!a.dryRun) applyAssignChanges(month, plan);
        const v = budgetMonthView(a.dryRun ? f : getFinance(), month);
        return {
          data: clean({ month, mode: a.mode, dryRun: a.dryRun || undefined, changes: plan.map((p) => ({ category: p.name, id: p.categoryId, from: p.from, to: p.to })), readyToAssign: v.rta, note: a.dryRun ? 'Nothing changed.' : undefined }),
          summary: `${a.dryRun ? 'Previewed' : 'Ran'} auto-assign (${a.mode}) on ${plural(plan.length, 'category', 'categories')}`,
        };
      }
    }
    return fail(`Unknown action "${a.action}".`);
  },
});

export const financeTools: ToolDef[] = [
  defineTool({
    name: 'finance_import_transactions',
    title: 'Import statement transactions (Personal Finances)',
    description:
      'Imports bank / credit card statement transactions into an account of the user’s Personal Finances (works only while the user has unlocked them; open_finances first). Pass exactly ONE source: `rows` (transactions you read yourself, e.g. from a PDF statement), `csvText` (CSV / TSV export; columns are auto-detected, or pass csvMapping), `ofxText` (OFX / QFX / QBO file contents — these file types cannot be read by path), `text` (statement lines copied from a PDF: date … description … amount), `path` (absolute path to a .csv / .tsv / .txt / .pdf file on this computer) or `base64` + fileName. Duplicates already in the account are skipped (safe to re-import), rules and category keywords categorise the rows, a statement record keeps the file (CSV / OFX / text / PDF) and the closing balance can update the account. PDF files (path or base64) are only STORED as a statement: read the PDF yourself, then call again with `rows` and the returned statementId. Finding statements: you can search the user’s email with your own email connector (Gmail, Outlook …) for statement emails from their banks, download the attachments and import each one here. Amount sign convention: negative = money out. Use dryRun to preview.',
    global: true,
    input: obj({
      accountId: opt(str('account id, name or last 4 digits (list_items {collection:"accounts"})')),
      createAccount: opt(obj({ name: str(), type: enm(ACCOUNT_TYPES.map((t) => t.value)), institution: opt(str()), last4: opt(str('last 4 digits only')) }, 'create the account first when it does not exist yet')),
      rows: opt(arr(ROW, 'transactions you extracted (e.g. from a PDF)')),
      csvText: opt(str('CSV / TSV file contents')),
      ofxText: opt(str('OFX / QFX / QBO file contents')),
      text: opt(str('statement lines as text (one transaction per line with a date and an amount)')),
      path: opt(str('absolute path of a .csv, .tsv, .txt or .pdf statement on this computer')),
      base64: opt(str('file contents as base64 (with fileName)')),
      fileName: opt(str('file name with extension, e.g. "chase-2026-09.csv"')),
      csvMapping: opt(
        obj(
          {
            date: int('0-based column index of the date'),
            description: int('0-based column index of the description'),
            amount: opt(int('signed amount column')),
            debit: opt(int('money-out column (when there is no single amount column)')),
            credit: opt(int('money-in column')),
            balance: opt(int()),
            dateFormat: opt(enm(['auto', 'MDY', 'DMY', 'YMD'] as const)),
            invert: opt(bool('flip signs (card exports listing purchases as positive)')),
            headerRow: opt(bool()),
          },
          'override the detected CSV columns',
        ),
      ),
      signMode: opt(enm(['signed', 'charges', 'unsigned'] as const, 'for `text`: signed = negative is money out; charges = card statement (positive = purchase); unsigned = guess from words')),
      statementId: opt(str('add the rows to this existing statement (e.g. a stored PDF)')),
      statementName: opt(str('e.g. "Chase Sapphire — Sep 2026"')),
      periodStart: opt(str('YYYY-MM-DD')),
      periodEnd: opt(str('YYYY-MM-DD')),
      closingBalance: opt(num('statement closing balance (amount owed for cards)')),
      updateBalance: opt(bool('set the account balance from the closing balance (default true)')),
      includeDuplicates: opt(bool('import rows that look like duplicates too (default false)')),
      source: opt(str('where it came from, e.g. "email", "bank download"')),
      dryRun: opt(bool('only preview: counts, duplicates and categories, nothing saved')),
    }),
    async run(a: {
      accountId?: string;
      createAccount?: { name: string; type: AccountType; institution?: string; last4?: string };
      rows?: { date: string; description: string; amount: number; category?: string; merchant?: string; notes?: string; balance?: number }[];
      csvText?: string;
      ofxText?: string;
      text?: string;
      path?: string;
      base64?: string;
      fileName?: string;
      csvMapping?: Partial<CsvMapping>;
      signMode?: SignMode;
      statementId?: string;
      statementName?: string;
      periodStart?: string;
      periodEnd?: string;
      closingBalance?: number;
      updateBalance?: boolean;
      includeDuplicates?: boolean;
      source?: string;
      dryRun?: boolean;
    }) {
      let { f } = finance();
      const sources = [a.rows, a.csvText, a.ofxText, a.text, a.path, a.base64].filter((x) => x != null && x !== '').length;
      if (sources !== 1) fail('Pass exactly one source: rows, csvText, ofxText, text, path or base64 (+ fileName).');

      // account
      let account = findAccount(f, a.accountId);
      if (!account && a.createAccount) {
        const id = uid('acct');
        const ca = a.createAccount;
        if (!a.dryRun)
          updateFinance((fd) => {
            fd.accounts.push({ id, name: ca.name.trim() || 'Account', type: ca.type, institution: ca.institution?.trim() || undefined, last4: ca.last4?.replace(/\D/g, '').slice(-4) || undefined, slot: fd.accounts.length % 8 });
            if (!fd.settings.defaultAccountId) fd.settings.defaultAccountId = id;
          });
        f = getFinance();
        account = f.accounts.find((x) => x.id === id) ?? ({ id, name: ca.name, type: ca.type } as FinAccount);
      }
      if (!account) account = a.accountId ? requireAccount(f, a.accountId) : f.settings.defaultAccountId ? f.accounts.find((x) => x.id === f.settings.defaultAccountId) : undefined;
      if (!account) requireAccount(f, a.accountId);
      const acct = account!;

      // read the source
      let parsed: ParsedRow[] = [];
      let skipped = 0;
      let format: StatementFormat = 'agent';
      let file: { name: string; data: Uint8Array } | undefined;
      let mapping: CsvMapping | undefined;
      let ofxClose: { balance: number; date: string } | undefined;
      let period: { from?: string; to?: string } = {};
      let content: { kind: 'csv' | 'ofx' | 'pdf' | 'text'; text?: string } | undefined;

      if (a.path || a.base64) {
        let name = a.fileName?.trim() || '';
        let data: Uint8Array;
        if (a.path) {
          if (/\.(ofx|qfx|qbo)$/i.test(a.path)) fail('OFX / QFX / QBO files cannot be read from a path. Read the file yourself and pass its contents as ofxText.');
          const mcp = window.prepro?.mcp;
          if (!mcp) fail('Reading files needs the desktop app. Pass csvText / rows instead.');
          const r = await mcp.readFile(a.path);
          data = r.data;
          name = name || r.name;
        } else {
          if (!name.includes('.')) fail('Pass fileName with an extension (.csv, .ofx, .qfx, .pdf or .txt) together with base64.');
          data = decodeBase64(a.base64!);
        }
        const kind = fileKind(name);
        if (!kind) fail(`"${name}" is not a statement file. Use CSV / TSV, OFX / QFX / QBO, PDF or TXT.`);
        file = { name, data };
        content = { kind, text: kind === 'pdf' ? undefined : bytesToText(data) };
      } else if (a.csvText) {
        content = { kind: 'csv', text: a.csvText };
        file = { name: `${a.statementName?.trim() || 'statement'}.csv`, data: new TextEncoder().encode(a.csvText) };
      } else if (a.ofxText) {
        content = { kind: 'ofx', text: a.ofxText };
        file = { name: `${a.statementName?.trim() || 'statement'}.ofx`, data: new TextEncoder().encode(a.ofxText) };
      } else if (a.text) {
        content = { kind: 'text', text: a.text };
        file = { name: `${a.statementName?.trim() || 'statement'}.txt`, data: new TextEncoder().encode(a.text) };
      }

      if (content?.kind === 'pdf') {
        if (a.dryRun) return { data: { pdf: true, note: 'A PDF would be stored as a statement. Read it yourself and pass rows.' } };
        const statementId = await addStatementFile(file!, acct.id, a.source ?? 'agent');
        return {
          data: {
            statementId,
            account: accountLabel(acct),
            stored: file!.name,
            imported: 0,
            next: `PDF statements are not parsed inside the app. Read the PDF yourself, then call finance_import_transactions again with accountId "${acct.id}", rows [{date, description, amount (negative = money out)}] and statementId "${statementId}" to attach the transactions to this statement.`,
          },
          summary: `Stored PDF statement “${file!.name}” for ${acct.name}`,
        };
      }
      if (content?.kind === 'csv') {
        format = 'csv';
        const d = detectCsv(content.text ?? '', acct.type, acct.csvMapping);
        mapping = { ...d.mapping, ...(a.csvMapping ?? {}) } as CsvMapping;
        if (d.problems.length && !a.csvMapping) {
          const headers = csvHeaders(d.rows, d.mapping.headerRow);
          fail(`Could not detect the CSV columns (${d.problems.join(' ')}). Columns: ${headers.map((h, i) => `${i}: ${h}`).join(', ')}. First row: ${JSON.stringify(d.rows[d.mapping.headerRow ? 1 : 0] ?? [])}. Pass csvMapping {date, description, amount | debit + credit} with 0-based indexes.`);
        }
        const r = rowsFromCsv(d.rows, mapping);
        parsed = r.rows;
        skipped = r.skipped;
        if (!parsed.length) fail(`No transactions could be read with the columns date=${mapping.date}, description=${mapping.description}, amount=${mapping.amount ?? `debit ${mapping.debit} / credit ${mapping.credit}`}. Headers: ${csvHeaders(d.rows, mapping.headerRow).join(', ')}. Pass csvMapping.`);
      } else if (content?.kind === 'ofx') {
        format = 'ofx';
        const o = parseOfx(content.text ?? '');
        parsed = o.rows;
        if (!parsed.length) fail('No <STMTTRN> transactions found in the OFX text.');
        if (o.balance != null) ofxClose = { balance: o.balance, date: o.balanceDate ?? o.periodEnd ?? todayISO() };
        period = { from: o.periodStart, to: o.periodEnd };
      } else if (content?.kind === 'text') {
        format = 'text';
        const r = parseStatementText(content.text ?? '', { signMode: a.signMode ?? (acct.type === 'credit_card' ? 'charges' : undefined) });
        parsed = r.rows;
        skipped = r.skipped;
        if (!parsed.length) fail('No lines with a date and an amount were found. Pass rows [{date, description, amount}] instead.');
      } else if (a.rows) {
        format = 'agent';
        a.rows.forEach((r, i) => {
          const date = parseDate(String(r.date ?? ''), 'auto');
          if (!date) fail(`rows[${i}].date: "${r.date}" is not a date. Use YYYY-MM-DD.`);
          if (typeof r.amount !== 'number' || !isFinite(r.amount)) fail(`rows[${i}].amount must be a number (negative = money out).`);
          if (!String(r.description ?? '').trim()) fail(`rows[${i}].description is empty.`);
          parsed.push(clean({ date, description: String(r.description).trim(), amount: round2(r.amount), category: r.category, merchant: r.merchant, notes: r.notes, balance: r.balance }) as ParsedRow);
        });
      }

      const review = prepareImport(parsed, acct.id, getFinance()).map((r) => (a.includeDuplicates ? { ...r, include: true } : r));
      const included = review.filter((r) => r.include);
      const cats = catMap(getFinance());
      const byCat = new Map<string, number>();
      for (const r of included) byCat.set(r.category ? cats.get(r.category)?.name ?? r.category : 'Uncategorised', (byCat.get(r.category ? cats.get(r.category)?.name ?? r.category : 'Uncategorised') ?? 0) + 1);
      const preview = {
        account: accountLabel(acct),
        rowsRead: parsed.length,
        new: review.filter((r) => !r.duplicate).length,
        duplicates: review.filter((r) => r.duplicate).length,
        willImport: included.length,
        unreadableRows: skipped || undefined,
        uncategorized: included.filter((r) => !r.category).length,
        categories: Object.fromEntries(byCat),
        period: { from: period.from ?? (parsed.length ? parsed.map((r) => r.date).sort()[0] : undefined), to: period.to ?? (parsed.length ? parsed.map((r) => r.date).sort().slice(-1)[0] : undefined) },
      };
      if (a.dryRun)
        return {
          data: clean({ ...preview, dryRun: true, sample: review.slice(0, 25).map((r) => clean({ date: r.date, description: r.description, amount: r.amount, category: r.category, duplicate: r.duplicate || undefined })) }),
          summary: `Previewed ${plural(parsed.length, 'row')} for ${acct.name}`,
        };
      if (a.statementId && !getFinance().statements.some((s) => s.id === a.statementId)) fail(`Unknown statementId "${a.statementId}".`);
      if (!included.length)
        return {
          data: clean({ ...preview, imported: 0, note: preview.duplicates ? 'Every row is already in this account — nothing imported (pass includeDuplicates to force).' : 'No rows to import.' }),
          summary: `Nothing new to import into ${acct.name}`,
        };
      const close = a.closingBalance != null ? { balance: a.closingBalance, date: a.periodEnd ?? preview.period.to ?? todayISO() } : ofxClose;
      const res = await commitImport({
        accountId: acct.id,
        rows: review,
        format,
        file: a.statementId ? undefined : file,
        name: a.statementName?.trim() || `${acct.name}${preview.period.to ? ` — ${monthLabel(preview.period.to.slice(0, 7))}` : ''}`,
        periodStart: a.periodStart ?? period.from,
        periodEnd: a.periodEnd ?? period.to,
        source: a.source ?? 'agent',
        mapping: format === 'csv' ? mapping : undefined,
        updateBalance: a.updateBalance !== false,
        closingBalance: close?.balance,
        closingDate: close?.date,
        statementId: a.statementId,
      });
      return {
        data: clean({ ...preview, imported: res.imported, statementId: res.statementId, balanceUpdated: a.updateBalance !== false && !!(close ?? parsed.some((r) => r.balance != null)) ? true : undefined, next: preview.uncategorized ? `${preview.uncategorized} imported transactions have no category — finance_categorize can fix them (and create rules).` : undefined }),
        summary: `Imported ${plural(res.imported, 'transaction')} into ${acct.name}${res.duplicates ? ` (${plural(res.duplicates, 'duplicate')} skipped)` : ''}`,
      };
    },
  }),

  defineTool({
    name: 'finance_report',
    title: 'Finance report (Personal Finances)',
    description:
      'Reads the user’s Personal Finances (only while unlocked) and returns totals for a period — income, spending, net, money moved to savings, savings rate — compared with the previous period of the same length, grouped by category, merchant, month or account, plus top / largest items, budget status, monthly trend, detected recurring charges & subscriptions, net worth and the app’s computed insights. Amounts are in the space currency; spending figures are positive numbers. Periods: this_month, last_month, last_3_months, last_6_months, last_12_months, ytd, all, custom (from / to YYYY-MM-DD). Anything you conclude for the user is educational, not professional financial advice.',
    global: true,
    readOnly: true,
    input: obj({
      period: opt(enm(PERIODS.map((p) => p.value), 'default this_month')),
      from: opt(str('custom: YYYY-MM-DD')),
      to: opt(str('custom: YYYY-MM-DD')),
      month: opt(str('a single month YYYY-MM (overrides period)')),
      groupBy: opt(enm(['category', 'merchant', 'month', 'account'] as const, 'default category')),
      accountId: opt(str('limit to one account (id, name or last 4)')),
      category: opt(str('limit to one category (id or name)')),
      top: opt(int('items per list (default 10)', 1)),
      transactions: opt(int('also return up to N matching transactions (newest first)', 0)),
    }),
    run(a: { period?: PeriodId; from?: string; to?: string; month?: string; groupBy?: 'category' | 'merchant' | 'month' | 'account'; accountId?: string; category?: string; top?: number; transactions?: number }) {
      const { f, currency } = finance();
      const today = todayISO();
      const sd = f.settings.monthStartDay;
      const cats = catMap(f);
      const top = Math.min(50, a.top ?? 10);
      let range: { from: string; to: string; label: string; months: string[] };
      if (a.month) {
        if (!/^\d{4}-\d{2}$/.test(a.month)) fail('month: use YYYY-MM.');
        range = { ...monthRange(a.month, sd), label: monthLabel(a.month, true), months: [a.month] };
      } else range = periodRange(a.period ?? 'this_month', today, sd, a.from, a.to, f.transactions);
      const acct = a.accountId ? requireAccount(f, a.accountId) : undefined;
      const cat = a.category ? requireCategory(f, a.category) : undefined;
      const scope = (t: (typeof f.transactions)[number]) => (!acct || t.accountId === acct.id) && (!cat || t.category === cat.id);
      const txs = f.transactions.filter((t) => scope(t) && inRange(t.date, range.from, range.to));
      const span = range.months.length;
      const prevMonths = range.months.map((k) => shiftMonth(k, -span));
      const prevTx = f.transactions.filter((t) => scope(t) && prevMonths.includes(monthOf(t.date, sd)));
      const t = totals(txs, cats);
      const p = totals(prevTx, cats);
      const pctChange = (x: number, y: number) => (y ? Math.round(((x - y) / Math.abs(y)) * 1000) / 10 : null);
      const r2 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);

      let groups: unknown[] = [];
      const by = a.groupBy ?? 'category';
      if (by === 'category') {
        const prevMap = new Map(byCategory(prevTx, cats).map((r) => [r.id, r.amount]));
        groups = byCategory(txs, cats).map((r) => clean({ category: r.name, id: r.id || undefined, spending: r.amount, count: r.count, share: t.spending ? r2(r.amount / t.spending) : null, previous: prevMap.get(r.id), changePct: prevMap.get(r.id) ? pctChange(r.amount, prevMap.get(r.id)!) : undefined }));
        const inc = byCategory(txs, cats, 'income');
        if (inc.length) groups.push(...inc.map((r) => ({ category: r.name, id: r.id || undefined, income: r.amount, count: r.count })));
      } else if (by === 'merchant') {
        groups = byMerchant(txs, cats)
          .slice(0, Math.max(top, 25))
          .map((m) => clean({ merchant: m.name, spending: m.amount, count: m.count, category: m.category ? cats.get(m.category)?.name : undefined }));
      } else if (by === 'month') {
        groups = monthlySeries(txs, cats, range.months, sd).map((r) => ({ month: r.key, income: r.income, spending: r.spending, net: r.net, saving: r.saving, savingsRate: r2(r.savingsRate), count: r.count }));
      } else {
        const m = new Map<string, typeof txs>();
        for (const x of txs) m.set(x.accountId ?? '', [...(m.get(x.accountId ?? '') ?? []), x]);
        groups = [...m.entries()].map(([id, list]) => {
          const tt = totals(list, cats);
          return { account: id ? accountLabel(f.accounts.find((x) => x.id === id)) : 'No account', id: id || undefined, income: tt.income, spending: tt.spending, net: tt.net, count: list.length };
        });
      }
      const largest = [...txs]
        .filter((x) => x.amount < 0 && !x.transfer)
        .sort((x, y) => x.amount - y.amount)
        .slice(0, top)
        .map((x) => clean({ id: x.id, date: x.date, merchant: merchantOf(x), amount: x.amount, category: x.category ? cats.get(x.category)?.name : 'Uncategorised' }));
      const budgetMonth = span === 1 ? range.months[0] : monthOf(today, sd);
      const budgets = budgetRows(f, budgetMonth, monthElapsed(budgetMonth, today, sd)).map((b) => ({ category: b.category.name, budget: b.budget.amount, spent: b.spent, left: b.left, status: b.tone === 'critical' ? 'over' : b.tone === 'warning' ? 'close' : 'ok', avg3Months: b.avg3 }));
      const recurring = detectRecurring(f, today)
        .filter((r) => !acct || r.accountId === acct.id)
        .map((r) => clean({ merchant: r.merchant, amount: r.amount, cadence: r.cadence, perMonth: r.monthly, nextDate: r.nextDate, category: r.category ? cats.get(r.category)?.name : undefined, isNew: r.isNew || undefined }));
      const nw = netWorth(f.accounts);
      const list = a.transactions
        ? [...txs]
            .sort((x, y) => y.date.localeCompare(x.date))
            .slice(0, Math.min(500, a.transactions))
            .map((x) => clean({ id: x.id, date: x.date, description: x.description, merchant: x.merchant, amount: x.amount, category: x.category, account: x.accountId, transfer: x.transfer || undefined, recurring: x.recurring || undefined, notes: x.notes }))
        : undefined;
      return {
        data: clean({
          currency,
          period: { label: range.label, from: range.from, to: range.to },
          filter: clean({ account: acct ? accountLabel(acct) : undefined, category: cat?.name }),
          totals: { income: t.income, spending: t.spending, net: t.net, movedToSavings: t.saving, savingsRate: r2(t.savingsRate), transactions: txs.length },
          previous: p.count ? { months: prevMonths, income: p.income, spending: p.spending, net: p.net, savingsRate: r2(p.savingsRate), incomeChangePct: pctChange(t.income, p.income), spendingChangePct: pctChange(t.spending, p.spending) } : undefined,
          groupBy: by,
          groups,
          largestPayments: largest,
          monthly: span > 1 && by !== 'month' ? monthlySeries(txs, cats, range.months, sd).map((r) => ({ month: r.key, income: r.income, spending: r.spending, net: r.net })) : undefined,
          budgets: budgets.length ? { month: budgetMonth, rows: budgets, note: 'budget = rolled over + assigned this month; left = Available. Full YNAB-style month: finance_budget {action:"read"}.' } : undefined,
          budget: (() => {
            const bv = budgetMonthView(f, budgetMonth, today);
            return { month: budgetMonth, readyToAssign: bv.rta, ageOfMoneyDays: bv.ageOfMoney, assigned: bv.assigned, underfundedTargets: bv.underfunded, overspent: bv.overspent.map((r) => r.name) };
          })(),
          recurring: recurring.slice(0, 30),
          netWorth: { net: nw.net, assets: nw.assets, debts: nw.debts, cash: nw.liquid, creditUtilization: r2(nw.utilization) },
          accounts: f.accounts.filter((x) => !x.archived).map((x) => clean({ id: x.id, name: accountLabel(x), type: x.type, balance: x.balance, asOf: x.balanceDate, apr: x.apr, creditLimit: x.creditLimit })),
          insights: computeInsights(f, today, (n) => String(Math.round(n))).map((i) => ({ title: i.title, detail: i.body, tone: i.tone })),
          uncategorized: f.transactions.filter((x) => !x.category && !x.transfer).length,
          transactions: list,
          note: NOT_ADVICE,
        }),
        summary: `Finance report: ${range.label}`,
      };
    },
  }),

  defineTool({
    name: 'finance_categorize',
    title: 'Categorise transactions (Personal Finances)',
    description:
      'Sets the category (and optionally merchant name, transfer / recurring flags, tags) of transactions chosen by ids or by a filter, optionally creating a rule so future imports are categorised the same way. Use autoCategorize instead of category to re-run the rules and keywords. Filter fields combine (AND). Works only while the finances are unlocked. Typical flow: finance_report {transactions: 200} or list_items {collection:"transactions"} → finance_categorize {filter:{search:"STARBUCKS"}, category:"dining", createRule:{match:"STARBUCKS", rename:"Starbucks"}}.',
    global: true,
    input: obj({
      ids: opt(arr(str(), 'transaction ids')),
      filter: opt(
        obj({
          search: opt(str('text in the description / merchant (case-insensitive)')),
          accountId: opt(str()),
          month: opt(str('YYYY-MM')),
          from: opt(str('YYYY-MM-DD')),
          to: opt(str('YYYY-MM-DD')),
          uncategorizedOnly: opt(bool()),
          currentCategory: opt(str('only transactions in this category')),
          direction: opt(enm(['in', 'out'] as const)),
        }),
      ),
      category: opt(str('category id or name to set')),
      createCategory: opt(obj({ name: str(), group: enm(CATEGORY_GROUPS.map((g) => g.value)), kind: enm(CATEGORY_KINDS.map((k) => k.value)), keywords: opt(arr(str())) }, 'create this category when `category` does not exist')),
      autoCategorize: opt(bool('re-run rules + keywords on the matches instead of setting one category')),
      merchant: opt(str('set this clean merchant name')),
      transfer: opt(bool()),
      recurring: opt(bool()),
      addTags: opt(arr(str())),
      createRule: opt(obj({ match: opt(str('text to match (default: the search text)')), matchType: opt(enm(RULE_MATCHES.map((m) => m.value))), rename: opt(str()), accountOnly: opt(bool('limit the rule to the filtered account')) }, 'also save a rule for future imports')),
    }),
    run(a: {
      ids?: string[];
      filter?: { search?: string; accountId?: string; month?: string; from?: string; to?: string; uncategorizedOnly?: boolean; currentCategory?: string; direction?: 'in' | 'out' };
      category?: string;
      createCategory?: { name: string; group: CategoryGroup; kind: CategoryKind; keywords?: string[] };
      autoCategorize?: boolean;
      merchant?: string;
      transfer?: boolean;
      recurring?: boolean;
      addTags?: string[];
      createRule?: { match?: string; matchType?: RuleMatch; rename?: string; accountOnly?: boolean };
    }) {
      let { f } = finance();
      if (!a.ids?.length && !a.filter) fail('Pass ids or a filter.');
      if (!a.category && !a.autoCategorize && a.merchant == null && a.transfer == null && a.recurring == null && !a.addTags?.length && !a.createRule) fail('Nothing to change: pass category, autoCategorize, merchant, transfer, recurring, addTags or createRule.');
      let catId: string | undefined;
      let created: string | undefined;
      if (a.category) {
        const c = findCategory(f, a.category);
        if (c) catId = c.id;
        else if (a.createCategory) {
          const slot = CATEGORY_GROUPS.find((g) => g.value === a.createCategory!.group)?.slot ?? 3;
          catId = addCategory({ name: a.createCategory.name.trim() || a.category, group: a.createCategory.group, kind: a.createCategory.kind, slot, keywords: (a.createCategory.keywords ?? []).map((k) => k.toLowerCase()) });
          created = catId;
          f = getFinance();
        } else requireCategory(f, a.category);
      } else if (a.createCategory) {
        const slot = CATEGORY_GROUPS.find((g) => g.value === a.createCategory!.group)?.slot ?? 3;
        catId = addCategory({ name: a.createCategory.name.trim(), group: a.createCategory.group, kind: a.createCategory.kind, slot, keywords: (a.createCategory.keywords ?? []).map((k) => k.toLowerCase()) });
        created = catId;
        f = getFinance();
      }
      const fl = a.filter ?? {};
      const acct = fl.accountId ? requireAccount(f, fl.accountId) : undefined;
      const cur = fl.currentCategory ? requireCategory(f, fl.currentCategory) : undefined;
      const q = norm(fl.search);
      const idSet = a.ids?.length ? new Set(a.ids) : null;
      if (idSet) for (const id of idSet) if (!f.transactions.some((t) => t.id === id)) fail(`Unknown transaction id "${id}".`);
      const sd = f.settings.monthStartDay;
      const hits = f.transactions.filter((t) => {
        if (idSet && !idSet.has(t.id)) return false;
        if (acct && t.accountId !== acct.id) return false;
        if (cur && t.category !== cur.id) return false;
        if (fl.uncategorizedOnly && (t.category || t.transfer)) return false;
        if (fl.month && monthOf(t.date, sd) !== fl.month) return false;
        if (fl.from && t.date < fl.from) return false;
        if (fl.to && t.date > fl.to) return false;
        if (fl.direction === 'in' && t.amount <= 0) return false;
        if (fl.direction === 'out' && t.amount >= 0) return false;
        if (q && !`${t.description} ${t.merchant ?? ''}`.toLowerCase().includes(q)) return false;
        return true;
      });
      const ids = hits.map((t) => t.id);
      let changed = 0;
      if (a.autoCategorize && ids.length) changed = applyRules('all', ids);
      if (ids.length && (catId || a.merchant != null || a.transfer != null || a.recurring != null || a.addTags?.length)) {
        const set = new Set(ids);
        const kind = catId ? getFinance().categories.find((c) => c.id === catId)?.kind : undefined;
        updateFinance((fd) => {
          for (const t of fd.transactions) {
            if (!set.has(t.id)) continue;
            if (catId) {
              t.category = catId;
              if (kind === 'transfer') t.transfer = true;
              else if (t.transfer && a.transfer == null) delete t.transfer;
            }
            if (a.merchant != null) a.merchant.trim() ? (t.merchant = a.merchant.trim()) : delete t.merchant;
            if (a.transfer != null) a.transfer ? (t.transfer = true) : delete t.transfer;
            if (a.recurring != null) a.recurring ? (t.recurring = true) : delete t.recurring;
            if (a.addTags?.length) t.tags = [...new Set([...(t.tags ?? []), ...a.addTags.map((x) => x.trim()).filter(Boolean)])];
          }
        });
        changed = ids.length;
      }
      let rule: { id: string; changed: number } | undefined;
      if (a.createRule) {
        const match = (a.createRule.match ?? fl.search ?? '').trim();
        if (!match) fail('createRule needs match (or filter.search).');
        rule = addRule(
          clean({
            match,
            matchType: a.createRule.matchType ?? 'contains',
            category: catId,
            rename: a.createRule.rename ?? a.merchant,
            transfer: a.transfer || undefined,
            recurring: a.recurring || undefined,
            accountId: a.createRule.accountOnly && acct ? acct.id : undefined,
          }) as never,
          'uncategorized',
        );
      }
      const catName = catId ? getFinance().categories.find((c) => c.id === catId)?.name : undefined;
      return {
        data: clean({
          matched: ids.length,
          changed,
          category: catName,
          createdCategory: created,
          ruleId: rule?.id,
          ruleAlsoCategorized: rule?.changed || undefined,
          examples: hits.slice(0, 8).map((t) => `${t.date} ${merchantOf(t)} ${t.amount}`),
          remainingUncategorized: getFinance().transactions.filter((t) => !t.category && !t.transfer).length,
        }),
        summary: `${a.autoCategorize ? 'Auto-categorised' : 'Categorised'} ${plural(ids.length, 'transaction')}${catName ? ` as ${catName}` : ''}${rule ? ' and added a rule' : ''}`,
      };
    },
  }),

  defineTool({
    name: 'finance_add_advice',
    title: 'Save advice (Personal Finances)',
    description:
      'Saves a piece of advice or an observation for the user under Personal Finances → Advice & insights (pin it to also show it on the Overview). Keep it short, concrete and based on their numbers (e.g. "Cancel the two unused streaming services: $27/month"). It is shown with a visible "Not financial advice" note: frame it as educational suggestions, never as professional financial, tax or investment advice. Pass replaceId to update an earlier note instead of adding a new one.',
    global: true,
    input: obj({
      title: str('one line'),
      body: str('a few sentences: what to do and why, with the numbers'),
      kind: opt(enm(INSIGHT_KINDS.map((k) => k.value), 'tip | warning | opportunity | summary')),
      pin: opt(bool('show on the Overview (default false)')),
      author: opt(str('your name, e.g. "Claude"')),
      replaceId: opt(str('id of an earlier note to update')),
    }),
    run(a: { title: string; body: string; kind?: InsightKind; pin?: boolean; author?: string; replaceId?: string }) {
      const { f } = finance();
      if (!a.title.trim()) fail('title is empty.');
      if (a.replaceId) {
        const old = f.insights.find((i) => i.id === a.replaceId);
        if (!old) fail(`No saved note "${a.replaceId}". list_items {collection:"insights"} shows them.`);
        patchInsight(old.id, clean({ title: a.title.trim(), body: a.body, kind: a.kind, pinned: a.pin ?? old.pinned, dismissed: false, author: a.author, date: todayISO() }));
        return { data: { id: old.id, updated: true }, summary: `Updated advice “${a.title.trim()}”` };
      }
      const id = addAdvice({ title: a.title.trim(), body: a.body, kind: a.kind ?? 'tip', source: 'agent', author: a.author?.trim() || undefined, pinned: a.pin || undefined });
      return { data: { id, pinned: !!a.pin, note: 'Shown under Advice & insights with a “not financial advice” note.' }, summary: `Saved advice “${a.title.trim()}”` };
    },
  }),

  defineTool({
    name: 'finance_plan',
    title: 'Goal, debt payoff and savings projections (Personal Finances)',
    description:
      'Projections from the user’s Personal Finances (only while unlocked): (1) goals — progress, months left and projected completion date at the monthly contribution, whether the target date is met and the monthly amount needed; (2) debt payoff — avalanche (highest APR first) vs snowball (smallest balance first) vs minimum payments only for every credit card / loan with a balance: months to debt-free, debt-free date, total interest and payoff order, with an optional extra monthly payment; (3) savings — what a monthly saving grows to after 1/3/5/10 (or N) years at an assumed yearly return, plus the user’s average monthly income / spending / surplus. Use it to compare scenarios ("what if I paid $300 extra?"). Results are educational estimates, not professional financial advice.',
    global: true,
    readOnly: true,
    input: obj({
      goalId: opt(str('only this goal (id or name)')),
      extraMonthly: opt(num('extra debt payment per month on top of minimums (default: the saved setting)')),
      strategy: opt(enm(['avalanche', 'snowball', 'both'] as const, 'default both')),
      monthlySavings: opt(num('monthly amount to project (default: average monthly surplus + transfers to savings)')),
      annualReturn: opt(num('% per year (default: the expected return setting)')),
      startingAmount: opt(num('default: savings + investment balances')),
      years: opt(int('projection horizon (default 10)', 1)),
    }),
    run(a: { goalId?: string; extraMonthly?: number; strategy?: 'avalanche' | 'snowball' | 'both'; monthlySavings?: number; annualReturn?: number; startingAmount?: number; years?: number }) {
      const { f, currency } = finance();
      const today = todayISO();
      const avg = averageMonth(f, today);
      const goals = a.goalId ? f.goals.filter((g) => g.id === a.goalId || norm(g.name) === norm(a.goalId)) : f.goals;
      if (a.goalId && !goals.length) fail(`No goal "${a.goalId}". Goals: ${f.goals.map((g) => `${g.name} (${g.id})`).join(', ') || 'none yet'}.`);
      const goalOut = goals.map((g) => {
        const p = goalProgress(g, f.accounts, today);
        return clean({ id: g.id, name: g.name, type: g.type, target: g.target, current: p.current, remaining: p.remaining, progress: Math.round(p.pct * 1000) / 10, monthly: g.monthly, monthsLeft: p.monthsLeft, projectedDate: p.projectedDate, targetDate: g.targetDate, onTrack: p.onTrack, neededPerMonthForTargetDate: p.requiredMonthly, done: g.done || undefined });
      });
      const debts = debtsOf(f.accounts);
      const extra = Math.max(0, a.extraMonthly ?? f.settings.extraDebtPayment);
      const strat = a.strategy ?? 'both';
      const summarize = (r: ReturnType<typeof debtPayoff>) =>
        clean({ strategy: r.strategy, feasible: r.feasible, months: r.months, debtFreeDate: r.debtFreeDate, totalInterest: r.totalInterest, monthlyPayment: r.monthlyPayment, order: r.order.map((o) => clean({ debt: o.name, paidOffInMonth: o.month, interest: o.interest })), balanceAfter: [6, 12, 24, 36].map((m) => ({ month: m, balance: r.series[Math.min(m, r.series.length - 1)]?.balance ?? 0 })) });
      const debt = debts.length
        ? clean({
            debts: debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance, apr: d.apr, minPayment: d.minPayment, interestPerMonth: round2((d.balance * d.apr) / 1200) })),
            extraMonthly: extra,
            avalanche: strat !== 'snowball' ? summarize(debtPayoff(debts, extra, 'avalanche', today)) : undefined,
            snowball: strat !== 'avalanche' ? summarize(debtPayoff(debts, extra, 'snowball', today)) : undefined,
            minimumsOnly: summarize(debtPayoff(debts, 0, 'avalanche', today)),
            userPlan: f.settings.payoffStrategy,
          })
        : { note: 'No credit card or loan with a balance.' };
      const rate = a.annualReturn ?? f.settings.expectedReturn;
      const years = Math.min(50, a.years ?? 10);
      const start = a.startingAmount ?? f.accounts.filter((x) => !x.archived && (x.type === 'savings' || x.type === 'investment')).reduce((s, x) => s + (x.balance ?? 0), 0);
      const monthly = Math.max(0, a.monthlySavings ?? Math.round(avg.net + avg.saving));
      const proj = savingsProjection(start, monthly, rate, years);
      const marks = [...new Set([1, 3, 5, 10, years].filter((y) => y <= years))];
      return {
        data: clean({
          currency,
          averages: avg.months ? { months: avg.months, income: avg.income, spending: avg.spending, surplus: avg.net, movedToSavings: avg.saving, savingsRate: avg.savingsRate == null ? null : Math.round(avg.savingsRate * 1000) / 1000 } : { note: 'Not enough full months of transactions yet.' },
          netWorth: netWorth(f.accounts),
          goals: goalOut,
          debt,
          savings: { startingAmount: round2(start), monthly, annualReturnPct: rate, points: marks.map((y) => ({ years: y, value: proj[y].value, contributed: proj[y].contributed, growth: round2(proj[y].value - proj[y].contributed) })) },
          note: NOT_ADVICE,
        }),
        summary: 'Calculated finance projections',
      };
    },
  }),
  financeBudgetTool,
];
