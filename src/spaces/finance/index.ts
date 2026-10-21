/* Kind definition of 'finance' spaces (Personal Finances): sidebar modules,
   print documents, the coach summary and show_in_app parameters. */
import { lazy } from 'react';
import { FileUp, Gauge, Landmark, Lightbulb, ListChecks, PiggyBank, Tags, Target } from 'lucide-react';
import type { SpaceKindDef } from '../kinds';
import type { SpaceData } from '../types';
import { normalizeFinance } from './types';
import { budgetRows, byCategory, catMap, debtsOf, goalProgress, monthElapsed, monthOf, netWorth, round2, shiftMonth, totals, txOfMonth } from './calc';
import { financePrintDocs } from './print';
import { budgetMonth } from './ynab';

/** Compact numbers for the holistic coach (only called while the finances are unlocked). */
function coachSummary(s: SpaceData, today: string): Record<string, unknown> {
  const f = normalizeFinance(s.finance);
  if (!f.transactions.length && !f.accounts.length) return { status: 'not set up yet (no accounts or transactions)' };
  const cats = catMap(f);
  const sd = f.settings.monthStartDay;
  const cur = monthOf(today, sd);
  const prev = shiftMonth(cur, -1);
  const t = totals(txOfMonth(f.transactions, cur, sd), cats);
  const p = totals(txOfMonth(f.transactions, prev, sd), cats);
  const nw = netWorth(f.accounts);
  const over = budgetRows(f, cur, monthElapsed(cur, today, sd)).filter((b) => b.tone === 'critical');
  const debts = debtsOf(f.accounts);
  const r = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  return {
    currency: s.settings?.currency,
    month: cur,
    thisMonth: { income: t.income, spending: t.spending, net: t.net, savingsRate: r(t.savingsRate), daysIn: Math.round(monthElapsed(cur, today, sd) * 100) + '%' },
    lastMonth: { income: p.income, spending: p.spending, net: p.net, savingsRate: r(p.savingsRate) },
    topCategories: byCategory(txOfMonth(f.transactions, cur, sd), cats)
      .slice(0, 3)
      .map((c) => ({ category: c.name, spent: c.amount })),
    budgetOverruns: over.map((b) => ({ category: b.category.name, budget: b.budget.amount, spent: b.spent })),
    budget: (() => {
      const v = budgetMonth(f, cur, today);
      return { readyToAssign: v.rta, ageOfMoneyDays: v.ageOfMoney, assigned: v.assigned, underfundedTargets: v.underfunded, overspent: v.overspent.map((x) => ({ category: x.name, available: x.available })) };
    })(),
    goals: f.goals
      .filter((g) => !g.done)
      .map((g) => {
        const gp = goalProgress(g, f.accounts, today);
        return { name: g.name, progress: `${Math.round(gp.pct * 100)}%`, remaining: gp.remaining, projected: gp.projectedDate, onTrack: gp.onTrack };
      }),
    netWorth: nw.net,
    debtTotal: round2(debts.reduce((s2, d) => s2 + d.balance, 0)),
    uncategorized: f.transactions.filter((x) => !x.category && !x.transfer).length,
  };
}

export const financeKind: SpaceKindDef = {
  groups: ['Money', 'Plan', 'Setup'],
  modules: [
    { id: 'overview', label: 'Overview', group: 'Money', icon: Gauge, description: 'This month, trends, budgets, insights', component: lazy(() => import('./modules/overview')) },
    { id: 'budgets', label: 'Budget', group: 'Money', icon: PiggyBank, description: 'Give every dollar a job: assign, targets, Ready to Assign', component: lazy(() => import('./modules/budgets')) },
    { id: 'transactions', label: 'Transactions', group: 'Money', icon: ListChecks, description: 'Search, filter and categorise', component: lazy(() => import('./modules/transactions')) },
    { id: 'import', label: 'Import statements', group: 'Money', icon: FileUp, description: 'CSV, OFX / QFX and PDF statements', component: lazy(() => import('./modules/import')) },

    { id: 'plan', label: 'Plan', group: 'Plan', icon: Target, description: 'Goals, debt payoff, savings projections', component: lazy(() => import('./modules/plan')) },
    { id: 'advice', label: 'Advice & insights', group: 'Plan', icon: Lightbulb, description: 'Insights and advice from your agents', component: lazy(() => import('./modules/advice')) },
    { id: 'accounts', label: 'Accounts', group: 'Setup', icon: Landmark, description: 'Balances, credit use and net worth', component: lazy(() => import('./modules/accounts')) },
    { id: 'categories', label: 'Categories & rules', group: 'Setup', icon: Tags, description: 'Categories, keywords and auto-categorise rules', component: lazy(() => import('./modules/categories')) },
  ],
  printDocs: financePrintDocs,
  coachSummary,
  navParams: {
    overview: 'month (YYYY-MM)',
    transactions: 'category (category id), month (YYYY-MM), from / to (YYYY-MM), accountId, search, direction ("in" | "out"), uncategorized (true), statementId, transactionId',
    import: 'accountId, tab ("statements")',
    budgets: 'month (YYYY-MM), categoryId (category id or "ccpay:<accountId>" for a card payment category) — the YNAB-style Budget',
    plan: 'tab ("goals" | "debt" | "savings")',
    advice: '',
    accounts: 'accountId, add (true)',
    categories: 'tab ("categories" | "rules")',
  },
};
