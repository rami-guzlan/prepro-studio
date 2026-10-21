/* What a business refers to in a linked Marketing Space or production, and the
   money tagged to it. Pure (no React), shared by the screen, print and agents.
   Names of other spaces / productions are remembered locally (print documents
   cannot load the lists themselves). */
import { readLS, writeLS } from '@/store/app';
import { invoiceTotal, round2, sumAmount } from '../../derive';
import { isOpenProject, projectFinancials } from '../../derive-work';
import type { BizProject, BusinessData, Deal, Expense, Invoice } from '../../types';

export type LinkedKind = 'space' | 'production';

export interface LinkedUsage {
  invoices: Invoice[];
  expenses: Expense[];
  projects: BizProject[];
  deals: Deal[];
  /** sent + paid invoices (not draft / void) */
  invoiced: number;
  /** paid invoices */
  received: number;
  /** tagged expenses */
  costs: number;
  /** received − costs */
  net: number;
  /** received − costs of the business projects linked to it (shown separately, may overlap) */
  projectProfit: number;
  openProjects: number;
}

const field = (kind: LinkedKind) => (kind === 'space' ? 'spaceId' : 'projectId');

export function linkedUsage(b: BusinessData, kind: LinkedKind, id: string, today: string): LinkedUsage {
  const f = field(kind);
  const invoices = b.invoices.filter((x) => x[f] === id);
  const expenses = b.expenses.filter((x) => x[f] === id);
  const projects = b.projects.filter((x) => x[f] === id);
  const deals = b.deals.filter((x) => x[f] === id);
  const invoiced = sumAmount(invoices.filter((i) => i.status === 'sent' || i.status === 'paid').map((i) => ({ amount: invoiceTotal(i) })));
  const received = sumAmount(invoices.filter((i) => i.status === 'paid').map((i) => ({ amount: invoiceTotal(i) })));
  const costs = sumAmount(expenses);
  const projectProfit = round2(projects.reduce((n, p) => n + projectFinancials(b, p, today).profit, 0));
  return { invoices, expenses, projects, deals, invoiced, received, costs, net: round2(received - costs), projectProfit, openProjects: projects.filter(isOpenProject).length };
}

/** Ids referenced by records in the business that are not linked at space level. */
export function unlinkedReferences(b: BusinessData, linkedSpaces: string[], linkedProductions: string[]) {
  const spaces = new Set<string>();
  const productions = new Set<string>();
  for (const list of [b.invoices, b.expenses, b.projects, b.deals] as { spaceId?: string; projectId?: string }[][]) {
    for (const x of list) {
      if (x.spaceId && !linkedSpaces.includes(x.spaceId)) spaces.add(x.spaceId);
      if (x.projectId && !linkedProductions.includes(x.projectId)) productions.add(x.projectId);
    }
  }
  for (const x of b.time) if (x.projectId && !linkedProductions.includes(x.projectId)) productions.add(x.projectId);
  return { spaces: [...spaces], productions: [...productions] };
}

/* ---------------------------------------------------------------- remembered names */

const KEY = 'prepro.biz.linkedNames';
type NameCache = Record<string, { title: string; color?: string; sub?: string }>;

export function rememberNames(items: { id: string; title: string; color?: string; sub?: string }[]) {
  if (!items.length) return;
  const cache = readLS<NameCache>(KEY, {});
  let changed = false;
  for (const it of items) {
    const prev = cache[it.id];
    if (!prev || prev.title !== it.title || prev.color !== it.color || prev.sub !== it.sub) {
      cache[it.id] = { title: it.title, color: it.color, sub: it.sub };
      changed = true;
    }
  }
  if (changed) writeLS(KEY, cache);
}

export function rememberedName(id: string): { title: string; color?: string; sub?: string } | undefined {
  return readLS<NameCache>(KEY, {})[id];
}
