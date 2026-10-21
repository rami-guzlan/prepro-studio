/* Pure calculations for sales, projects and strategy of business spaces (screens,
   overview, print documents, agent tools, coach summary). No store, no React. */
import { DEAL_STAGES, INITIATIVE_STATUSES, PROJECT_STATUSES } from './constants';
import { contractorBalance, entryValue, expenseRows, inRange, incomeRows, invoiceTotal, minutesIn, periodRange, profitLoss, round2, sumAmount } from './derive';
import type { BizGoal, BizProject, BusinessData, Deal, DealStage, Initiative } from './types';

/* ---------------------------------------------------------------- sales */

export const stageInfo = (stage: DealStage) => DEAL_STAGES.find((s) => s.value === stage) ?? DEAL_STAGES[0];
export const isOpenDeal = (d: Deal) => stageInfo(d.stage).open;
/** Win chance in % (the deal's own, else the stage default). */
export const dealProbability = (d: Deal) => (d.stage === 'won' ? 100 : d.stage === 'lost' ? 0 : d.probability ?? stageInfo(d.stage).probability);
export const weightedValue = (d: Deal) => round2(((d.value ?? 0) * dealProbability(d)) / 100);

export interface PipelineSummary {
  openCount: number;
  /** sum of open deal values */
  openValue: number;
  /** probability-weighted open value (forecast) */
  weighted: number;
  /** per open + closed stage */
  byStage: { stage: DealStage; label: string; color?: string; count: number; value: number }[];
  wonCount: number;
  wonValue: number;
  lostCount: number;
  /** won / (won + lost) in the period, 0–1; null when nothing closed */
  winRate: number | null;
  /** open deals whose next step date is today or earlier */
  followUpsDue: Deal[];
  /** open deals expected to close within 30 days */
  closingSoon: Deal[];
  avgDealSize: number | null;
}

/** Pipeline numbers; won / lost / win rate count deals closed inside `r` (all time when omitted). */
export function pipelineSummary(b: BusinessData, today: string, r?: { from: string; to: string }): PipelineSummary {
  const open = b.deals.filter(isOpenDeal);
  const closedIn = (d: Deal) => !r || inRange(d.closedDate || d.createdAt, r);
  const won = b.deals.filter((d) => d.stage === 'won' && closedIn(d));
  const lost = b.deals.filter((d) => d.stage === 'lost' && closedIn(d));
  const in30 = (() => {
    const t = new Date(`${today}T00:00:00`);
    t.setDate(t.getDate() + 30);
    return t.toISOString().slice(0, 10);
  })();
  return {
    openCount: open.length,
    openValue: sumAmount(open.map((d) => ({ amount: d.value ?? 0 }))),
    weighted: round2(open.reduce((n, d) => n + weightedValue(d), 0)),
    byStage: DEAL_STAGES.map((s) => {
      const list = b.deals.filter((d) => d.stage === s.value && (s.open || closedIn(d)));
      return { stage: s.value, label: s.label, color: s.color, count: list.length, value: sumAmount(list.map((d) => ({ amount: d.value ?? 0 }))) };
    }),
    wonCount: won.length,
    wonValue: sumAmount(won.map((d) => ({ amount: d.value ?? 0 }))),
    lostCount: lost.length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    followUpsDue: open.filter((d) => d.nextStepDate && d.nextStepDate <= today).sort((a, z) => (a.nextStepDate ?? '').localeCompare(z.nextStepDate ?? '')),
    closingSoon: open.filter((d) => d.expectedClose && d.expectedClose >= today && d.expectedClose <= in30).sort((a, z) => (a.expectedClose ?? '').localeCompare(z.expectedClose ?? '')),
    avgDealSize: won.length ? round2(sumAmount(won.map((d) => ({ amount: d.value ?? 0 }))) / won.length) : null,
  };
}

export function dealContact(b: BusinessData, d: Deal): string {
  const c = d.clientId ? b.clients.find((x) => x.id === d.clientId) : undefined;
  if (c) return c.company ? `${c.name || c.company}${c.name && c.company ? ` · ${c.company}` : ''}` : c.name;
  return [d.contactName, d.company].filter(Boolean).join(' · ');
}

/* ---------------------------------------------------------------- projects */

export const projectStatusInfo = (s: BizProject['status']) => PROJECT_STATUSES.find((x) => x.value === s) ?? PROJECT_STATUSES[0];
export const isOpenProject = (p: BizProject) => projectStatusInfo(p.status).open;

export interface ProjectFinancials {
  /** agreed fee (or billed time value for hourly projects without a fee) */
  fee: number;
  /** invoiced (sent + paid, not void) */
  invoiced: number;
  /** money received (income rows) */
  received: number;
  /** invoices sent but unpaid */
  outstanding: number;
  /** fee not yet invoiced */
  toInvoice: number;
  /** expenses + paid contractor payments */
  costs: number;
  /** contractor payments still owed / scheduled */
  owedToContractors: number;
  budget?: number;
  /** received − costs */
  profit: number;
  /** fee − costs − owed (expected at completion) */
  expectedProfit: number;
  minutes: number;
  /** value of billable time logged */
  timeValue: number;
  tasksDone: number;
  tasksTotal: number;
  /** 0–1 */
  progress: number;
  /** due date passed and not done */
  overdue: boolean;
  nextTask?: { title: string; due?: string };
}

export function projectFinancials(b: BusinessData, p: BizProject, today: string): ProjectFinancials {
  const invs = b.invoices.filter((i) => i.bizProjectId === p.id && i.status !== 'void' && i.status !== 'draft');
  const invoiced = sumAmount(invs.map((i) => ({ amount: invoiceTotal(i) })));
  const outstanding = sumAmount(invs.filter((i) => i.status === 'sent').map((i) => ({ amount: invoiceTotal(i) })));
  const received = sumAmount(incomeRows(b).filter((x) => x.bizProjectId === p.id));
  const costs = sumAmount(expenseRows(b).filter((x) => x.bizProjectId === p.id));
  const owed = sumAmount(b.payments.filter((x) => x.bizProjectId === p.id && x.status !== 'paid'));
  const time = b.time.filter((t) => t.bizProjectId === p.id);
  const minutes = time.reduce((n, t) => n + t.minutes, 0);
  const timeValue = round2(time.filter((t) => t.billable).reduce((n, t) => n + entryValue(b, t), 0));
  const fee = p.fee ?? (p.feeType === 'hourly' ? timeValue : 0);
  const tasksDone = p.tasks.filter((t) => t.done).length;
  const next = p.tasks.filter((t) => !t.done).sort((a, z) => (a.due ?? '9999').localeCompare(z.due ?? '9999'))[0];
  return {
    fee,
    invoiced,
    received,
    outstanding,
    toInvoice: round2(Math.max(0, fee - invoiced)),
    costs,
    owedToContractors: owed,
    budget: p.budget,
    profit: round2(received - costs),
    expectedProfit: round2(fee - costs - owed),
    minutes,
    timeValue,
    tasksDone,
    tasksTotal: p.tasks.length,
    progress: p.status === 'done' ? 1 : p.tasks.length ? tasksDone / p.tasks.length : 0,
    overdue: !!p.dueDate && p.dueDate < today && isOpenProject(p),
    nextTask: next ? { title: next.title, due: next.due } : undefined,
  };
}

export interface ProjectsSummary {
  open: number;
  active: number;
  overdue: number;
  /** fees of open projects */
  openFees: number;
  /** fees not yet invoiced on open projects */
  toInvoice: number;
  /** due within 14 days (open) */
  dueSoon: BizProject[];
  byStatus: { status: BizProject['status']; label: string; color?: string; count: number }[];
}

export function projectsSummary(b: BusinessData, today: string): ProjectsSummary {
  const open = b.projects.filter(isOpenProject);
  const fin = new Map(open.map((p) => [p.id, projectFinancials(b, p, today)]));
  const in14 = (() => {
    const t = new Date(`${today}T00:00:00`);
    t.setDate(t.getDate() + 14);
    return t.toISOString().slice(0, 10);
  })();
  return {
    open: open.length,
    active: open.filter((p) => p.status === 'active').length,
    overdue: open.filter((p) => fin.get(p.id)!.overdue).length,
    openFees: sumAmount(open.map((p) => ({ amount: fin.get(p.id)!.fee }))),
    toInvoice: sumAmount(open.map((p) => ({ amount: fin.get(p.id)!.toInvoice }))),
    dueSoon: open.filter((p) => p.dueDate && p.dueDate <= in14).sort((a, z) => (a.dueDate ?? '').localeCompare(z.dueDate ?? '')),
    byStatus: PROJECT_STATUSES.map((s) => ({ status: s.value, label: s.label, color: s.color, count: b.projects.filter((p) => p.status === s.value).length })),
  };
}

/** Everything that points at a project (for the project page, reports and agents). */
export function projectLinks(b: BusinessData, p: BizProject) {
  return {
    invoices: b.invoices.filter((x) => x.bizProjectId === p.id),
    income: b.income.filter((x) => x.bizProjectId === p.id),
    expenses: b.expenses.filter((x) => x.bizProjectId === p.id),
    time: b.time.filter((x) => x.bizProjectId === p.id),
    payments: b.payments.filter((x) => x.bizProjectId === p.id),
    docs: b.docs.filter((x) => x.bizProjectId === p.id || p.docIds.includes(x.id)),
    contractors: b.contractors.filter((c) => p.contractorIds.includes(c.id) || b.payments.some((x) => x.bizProjectId === p.id && x.contractorId === c.id)),
    testimonials: b.testimonials.filter((x) => x.bizProjectId === p.id),
    portfolio: b.portfolio.filter((x) => x.bizProjectId === p.id),
    deal: p.dealId ? b.deals.find((d) => d.id === p.dealId) : undefined,
  };
}

/** Contractor balance limited to one project. */
export function contractorOnProject(b: BusinessData, contractorId: string, projectId: string) {
  const pays = b.payments.filter((x) => x.contractorId === contractorId && x.bizProjectId === projectId);
  return { paid: sumAmount(pays.filter((x) => x.status === 'paid')), owed: sumAmount(pays.filter((x) => x.status !== 'paid')), total: contractorBalance(b, contractorId) };
}

/* ---------------------------------------------------------------- strategy goals */

export interface GoalProgress {
  current: number;
  target?: number;
  /** 0–1 (null without a target) */
  pct: number | null;
  /** label of the period used for computed metrics */
  periodLabel?: string;
}

export function goalProgress(b: BusinessData, g: BizGoal, today: string): GoalProgress {
  const r = periodRange(g.period || 'ytd', today);
  let current = 0;
  switch (g.metric) {
    case 'revenue':
      current = profitLoss(b, r).income;
      break;
    case 'profit':
      current = profitLoss(b, r).profit;
      break;
    case 'clients': {
      // clients whose first income / invoice falls in the period
      const first = new Map<string, string>();
      for (const row of incomeRows(b)) if (row.clientId && (!first.has(row.clientId) || row.date < first.get(row.clientId)!)) first.set(row.clientId, row.date);
      current = [...first.values()].filter((d) => inRange(d, r)).length;
      break;
    }
    case 'deals_won':
      current = b.deals.filter((d) => d.stage === 'won' && inRange(d.closedDate || d.createdAt, r)).length;
      break;
    case 'pipeline':
      current = pipelineSummary(b, today).openValue;
      break;
    default:
      current = g.current ?? 0;
  }
  current = round2(current);
  return { current, target: g.target, pct: g.target ? Math.max(0, Math.min(1, current / g.target)) : null, periodLabel: g.metric === 'custom' || g.metric === 'pipeline' ? undefined : r.label };
}

/** Hours logged per project in a range (overview / reports). */
export function projectMinutes(b: BusinessData, projectId: string, r: { from: string; to: string }) {
  return minutesIn(b, r, (t) => t.bizProjectId === projectId);
}

/* ---------------------------------------------------------------- growth initiatives */

export const initiativeStatusInfo = (s: Initiative['status']) => INITIATIVE_STATUSES.find((x) => x.value === s) ?? INITIATIVE_STATUSES[0];
export const isOpenInitiative = (i: Initiative) => initiativeStatusInfo(i.status).open;

export interface InitiativeProgress {
  /** latest KPI value (last update, else current, else baseline) */
  current?: number;
  /** 0–1 from baseline to target; null without a target */
  pct: number | null;
  /** spend outside Expenses + expenses with this initiativeId */
  spent: number;
  stepsDone: number;
  stepsTotal: number;
  overdue: boolean;
}

export function initiativeProgress(b: BusinessData, i: Initiative, today: string): InitiativeProgress {
  const last = [...i.updates].filter((u) => u.value != null).sort((a, z) => a.date.localeCompare(z.date)).pop();
  const current = last?.value ?? i.current ?? i.baseline;
  const base = i.baseline ?? 0;
  const pct = i.target != null && i.target !== base && current != null ? Math.max(0, Math.min(1, (current - base) / (i.target - base))) : null;
  const spent = round2((i.spend ?? 0) + sumAmount(b.expenses.filter((e) => e.initiativeId === i.id)));
  return { current, pct, spent, stepsDone: i.steps.filter((t) => t.done).length, stepsTotal: i.steps.length, overdue: !!i.dueDate && i.dueDate < today && isOpenInitiative(i) };
}
