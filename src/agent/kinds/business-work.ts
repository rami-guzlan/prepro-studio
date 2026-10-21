/* Agent (MCP) collections, single fields and tools of the business work sections:
   business projects (client work with tasks & milestones) and the money, time,
   contractor pay and documents linked to them. Linked Marketing Spaces and
   productions of the whole business are the space's spaceIds / projectIds
   (link_projects, open_space). */
import type { BizProject, BizTask, BusinessData } from '@/spaces/business/types';
import { FEE_TYPES, PROJECT_STATUSES } from '@/spaces/business/constants';
import { bizOf, clientLabel, formatDuration, invoiceStatus, invoiceTotal } from '@/spaces/business/derive';
import { contractorOnProject, isOpenProject, projectFinancials, projectLinks, projectsSummary } from '@/spaces/business/derive-work';
import { bizUpdate } from '@/spaces/business/ops';
import { todayISO } from '@/lib/dates';
import type { SpaceData } from '@/spaces/types';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import type { ToolDef } from '../tool';
import { defineTool } from '../tool';
import { arr, enm, obj, opt, str } from '../schema';
import { clean, fail, plural, spaceOf } from '../ctx';

const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });

/** Typed loosely: the getters receive a SpaceData. */
type S = any;
const B = (s: S) => s.business as BusinessData | undefined;

/* ================================================================ collections */

export const BUSINESS_WORK_COLLECTIONS: CollectionDef[] = [
  {
    name: 'biz_projects',
    label: 'Business projects (client work)',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      const today = todayISO();
      return items.map((p: BizProject) => {
        const f = projectFinancials(b, p, today);
        return clean({ ...p, tasks: undefined, _client: clientLabel(b, p.clientId) || undefined, _fee: f.fee || undefined, _invoiced: f.invoiced || undefined, _received: f.received || undefined, _costs: f.costs || undefined, _expectedProfit: f.expectedProfit, _progress: `${Math.round(f.progress * 100)}%`, _tasks: p.tasks.length ? `${f.tasksDone}/${f.tasksTotal}` : undefined, _overdue: f.overdue || undefined });
      });
    },
    module: 'projects' as any,
    navParam: 'projectId',
    description:
      'Client work or internal projects of the business: status planning → active → review / on_hold → done (or cancelled), client, dates, agreed fee (feeType fixed | hourly | retainer), cost budget, contractors on it, the deal it came from, linked Marketing Space (spaceId) and production (projectId). Tasks & milestones are the project_tasks collection (parentId = project). Invoices, income, expenses, time entries, contractor payments and legal documents point at a project with bizProjectId — attach existing ones with biz_project {action:"link"}; money and progress per project: biz_project {action:"summary"}. Deleting a project keeps its records but unlinks them.',
    kind: 'array',
    get: (s: S) => B(s)?.projects,
    draft: (d: S) => d.business?.projects,
    idPrefix: 'bproj',
    nameField: 'name',
    hideInList: ['tasks', 'description', 'deliverables'],
    fields: [
      F('name', 'string', { required: true }),
      F('status', 'enum', { values: v(PROJECT_STATUSES), desc: 'planning | active | review | on_hold | done | cancelled' }),
      F('clientId', 'ref', { ref: 'clients', desc: 'client id or name (empty = internal project)' }),
      F('dealId', 'ref', { ref: 'deals', desc: 'the sales deal it came from' }),
      F('startDate', 'date'),
      F('dueDate', 'date'),
      F('completedDate', 'date'),
      F('fee', 'number', { desc: 'agreed price to the client (space currency); hourly projects without a fee use the billable time value' }),
      F('feeType', 'enum', { values: v(FEE_TYPES) }),
      F('budget', 'number', { desc: 'cost budget (contractors + expenses)' }),
      F('contractorIds', 'ref[]', { ref: 'contractors', desc: 'contractors working on it' }),
      F('docIds', 'ref[]', { ref: 'legal_docs', desc: 'extra legal documents (documents with bizProjectId count automatically)' }),
      F('spaceId', 'string', { desc: 'linked Marketing Space id (list_spaces)' }),
      F('projectId', 'string', { desc: 'linked production project id (list_projects)' }),
      F('color', 'color'),
      F('description', 'text'),
      F('deliverables', 'text', { desc: 'scope & deliverables, one per line' }),
      F('notes', 'text'),
    ],
    defaults: () => ({ status: 'planning', contractorIds: [], docIds: [], tasks: [], startDate: todayISO() }),
  },
  {
    name: 'project_tasks',
    label: 'Project tasks & milestones',
    module: 'projects' as any,
    navParam: 'projectId',
    description: 'Nested in biz_projects: pass parentId = project id or name. Checklist of a project in order; milestone:true shows it on the projects timeline. assignee is "me" or a contractor id. Progress = done / all tasks.',
    kind: 'array',
    parent: 'biz_projects',
    get: (s: S, pid?: string) => B(s)?.projects.find((p) => p.id === pid)?.tasks,
    draft: (d: S, pid?: string) => d.business?.projects.find((p: BizProject) => p.id === pid)?.tasks,
    idPrefix: 'task',
    nameField: 'title',
    fields: [
      F('title', 'string', { required: true }),
      F('done', 'boolean'),
      F('due', 'date'),
      F('assignee', 'string', { desc: '"me" or a contractor id' }),
      F('milestone', 'boolean', { desc: 'key date (shoot day, first cut, delivery …) shown on the timeline' }),
      F('notes', 'text'),
    ],
    defaults: () => ({ done: false }),
  },
];

export const BUSINESS_WORK_SINGLETONS: SingletonDef[] = [];

/* ================================================================ helpers */

const norm = (x: unknown) => String(x ?? '').trim().toLowerCase();

function biz(): { s: SpaceData; b: BusinessData } {
  const s = spaceOf('business');
  return { s, b: bizOf(s) };
}

function findProject(b: BusinessData, ref: string | undefined): BizProject {
  if (!ref?.trim()) fail('Pass project (id or name).');
  const r = norm(ref);
  const exact = b.projects.filter((p) => p.id === ref || norm(p.name) === r);
  if (exact.length > 1) fail(`"${ref}" matches ${exact.length} projects; pass the id (${exact.map((p) => p.id).join(', ')}).`);
  const hit = exact[0] ?? b.projects.find((p) => norm(p.name).includes(r));
  if (!hit) fail(`No business project "${ref}". Projects: ${b.projects.map((p) => `${p.name} (${p.id})`).join(', ') || 'none yet — add one with add_items {collection:"biz_projects"}'}.`);
  return hit;
}

type LinkList = 'invoices' | 'expenses' | 'time' | 'income' | 'payments' | 'docs';
const LINK_KEYS: { key: string; list: LinkList; collection: string }[] = [
  { key: 'invoiceIds', list: 'invoices', collection: 'invoices' },
  { key: 'expenseIds', list: 'expenses', collection: 'expenses' },
  { key: 'timeEntryIds', list: 'time', collection: 'time_entries' },
  { key: 'incomeIds', list: 'income', collection: 'income' },
  { key: 'paymentIds', list: 'payments', collection: 'contractor_payments' },
  { key: 'docIds', list: 'docs', collection: 'legal_docs' },
];

function projectOut(b: BusinessData, p: BizProject, today: string, detail: boolean) {
  const f = projectFinancials(b, p, today);
  const base = clean({
    id: p.id,
    name: p.name,
    status: p.status,
    client: clientLabel(b, p.clientId) || undefined,
    clientId: p.clientId,
    startDate: p.startDate,
    dueDate: p.dueDate,
    completedDate: p.completedDate,
    overdue: f.overdue || undefined,
    feeType: p.feeType,
    money: clean({ fee: f.fee, invoiced: f.invoiced, received: f.received, outstanding: f.outstanding || undefined, toInvoice: f.toInvoice || undefined, costs: f.costs, owedToContractors: f.owedToContractors || undefined, budget: f.budget, budgetUsed: f.budget ? `${Math.round(((f.costs + f.owedToContractors) / f.budget) * 100)}%` : undefined, profitSoFar: f.profit, expectedProfit: f.expectedProfit }),
    time: f.minutes ? clean({ logged: formatDuration(f.minutes), billableValue: f.timeValue || undefined }) : undefined,
    progress: `${Math.round(f.progress * 100)}%`,
    tasks: f.tasksTotal ? `${f.tasksDone}/${f.tasksTotal} done` : undefined,
    nextTask: f.nextTask,
  });
  if (!detail) return base;
  const l = projectLinks(b, p);
  return clean({
    ...base,
    description: p.description,
    deliverables: p.deliverables,
    taskList: p.tasks.map((t: BizTask) => clean({ id: t.id, title: t.title, done: t.done || undefined, due: t.due, milestone: t.milestone || undefined, assignee: t.assignee === 'me' ? 'me' : b.contractors.find((c) => c.id === t.assignee)?.name })),
    linked: clean({
      invoices: l.invoices.length ? l.invoices.map((i) => ({ id: i.id, number: i.number, status: invoiceStatus(i, today), total: invoiceTotal(i) })) : undefined,
      income: l.income.length ? l.income.map((e) => clean({ id: e.id, date: e.date, amount: e.amount, description: e.description })) : undefined,
      expenses: l.expenses.length ? l.expenses.map((e) => clean({ id: e.id, date: e.date, amount: e.amount, vendor: e.vendor, description: e.description })) : undefined,
      timeEntries: l.time.length ? { count: l.time.length, ids: l.time.map((t) => t.id) } : undefined,
      contractorPayments: l.payments.length ? l.payments.map((x) => clean({ id: x.id, contractor: b.contractors.find((c) => c.id === x.contractorId)?.name, amount: x.amount, status: x.status })) : undefined,
      documents: l.docs.length ? l.docs.map((d) => ({ id: d.id, title: d.title, status: d.status })) : undefined,
      testimonials: l.testimonials.length || undefined,
      portfolio: l.portfolio.length || undefined,
      deal: l.deal ? { id: l.deal.id, title: l.deal.title, stage: l.deal.stage, value: l.deal.value } : undefined,
    }),
    contractors: l.contractors.map((c) => {
      const on = contractorOnProject(b, c.id, p.id);
      return clean({ id: c.id, name: c.name, role: c.role, rate: c.rate, rateType: c.rateType, paidOnProject: on.paid, owedOnProject: on.owed || undefined });
    }),
    spaceId: p.spaceId,
    productionId: p.projectId,
  });
}

/* ================================================================ tools */

export const businessWorkTools: ToolDef[] = [
  defineTool({
    name: 'biz_project',
    title: 'Business project money, links and progress',
    description:
      'Business projects of the open business (create / edit them with add_items / update_items {collection:"biz_projects"}, tasks with collection "project_tasks"). "summary": with project (id or name) → its money (fee, invoiced, received, outstanding, to invoice, costs, owed to contractors, budget used, profit so far, expected profit), time, progress, tasks and every linked record (ids); without project → all open projects (status filter: open | all | a status) with totals. "link": attach existing records to a project by id — invoiceIds, expenseIds, timeEntryIds, incomeIds, paymentIds (contractor pay log), docIds (legal documents); a record can belong to one project, linking moves it. "unlink": remove those records from the project. Paid invoices count as received via their income entry, and paid contractor payments count as costs, so link the invoice / payment, not its generated income entry / expense.',
    global: true,
    input: obj({
      action: enm(['summary', 'link', 'unlink'] as const),
      project: opt(str('project id or name (required for link / unlink)')),
      status: opt(str('summary without project: open (default) | all | planning | active | review | on_hold | done | cancelled')),
      invoiceIds: opt(arr(str(), 'invoice ids or numbers')),
      expenseIds: opt(arr(str())),
      timeEntryIds: opt(arr(str())),
      incomeIds: opt(arr(str())),
      paymentIds: opt(arr(str(), 'contractor pay log entry ids')),
      docIds: opt(arr(str(), 'legal document ids')),
    }),
    run(a: Record<string, any>) {
      const { s, b } = biz();
      const today = todayISO();
      if (a.action === 'summary') {
        if (a.project) {
          const p = findProject(b, a.project);
          return { data: projectOut(b, p, today, true) };
        }
        const st = norm(a.status || 'open');
        if (st !== 'open' && st !== 'all' && !PROJECT_STATUSES.some((x) => x.value === st)) fail(`Unknown status "${a.status}". Use open, all or ${v(PROJECT_STATUSES).join(' | ')}.`);
        const list = b.projects.filter((p) => (st === 'all' ? true : st === 'open' ? isOpenProject(p) : p.status === st));
        const sum = projectsSummary(b, today);
        return {
          data: clean({
            business: s.meta.title,
            filter: st,
            count: list.length,
            open: sum.open,
            active: sum.active,
            overdue: sum.overdue || undefined,
            openFees: sum.openFees,
            stillToInvoice: sum.toInvoice,
            dueNext14Days: sum.dueSoon.length ? sum.dueSoon.map((p) => ({ id: p.id, name: p.name, due: p.dueDate })) : undefined,
            projects: list.map((p) => projectOut(b, p, today, false)),
          }),
        };
      }
      // link / unlink
      const p = findProject(b, a.project);
      const plan: { list: LinkList; ids: string[]; label: string }[] = [];
      for (const k of LINK_KEYS) {
        const refs: string[] = a[k.key] ?? [];
        if (!refs.length) continue;
        const items = b[k.list] as { id: string; number?: string; bizProjectId?: string }[];
        const ids = refs.map((r) => {
          const hit = items.find((x) => x.id === r) ?? (k.list === 'invoices' ? items.find((x) => norm(x.number) === norm(r)) : undefined);
          if (!hit) fail(`No ${k.collection.replace(/_/g, ' ')} "${r}" (list_items {collection:"${k.collection}"} shows ids).`);
          if (a.action === 'unlink' && hit.bizProjectId !== p.id && !(k.list === 'docs' && p.docIds.includes(hit.id))) fail(`${k.collection.replace(/_/g, ' ')} "${r}" is not linked to “${p.name}”.`);
          return hit.id;
        });
        plan.push({ list: k.list, ids, label: k.collection.replace(/_/g, ' ') });
      }
      if (!plan.length) fail('Pass at least one of invoiceIds, expenseIds, timeEntryIds, incomeIds, paymentIds, docIds.');
      const moved: string[] = [];
      bizUpdate((d) => {
        for (const step of plan) {
          const set = new Set(step.ids);
          for (const x of d[step.list] as { id: string; bizProjectId?: string }[]) {
            if (!set.has(x.id)) continue;
            if (a.action === 'link') {
              if (x.bizProjectId && x.bizProjectId !== p.id) moved.push(x.id);
              x.bizProjectId = p.id;
            } else delete x.bizProjectId;
          }
          if (step.list === 'docs' && a.action === 'unlink') {
            const pr = d.projects.find((y) => y.id === p.id);
            if (pr) pr.docIds = pr.docIds.filter((id) => !set.has(id));
          }
          if (step.list === 'payments' && a.action === 'link') {
            const pr = d.projects.find((y) => y.id === p.id);
            const cids = d.payments.filter((x) => set.has(x.id)).map((x) => x.contractorId);
            if (pr) for (const c of cids) if (c && !pr.contractorIds.includes(c)) pr.contractorIds.push(c);
          }
        }
      });
      const after = bizOf(spaceOf('business'));
      const n = plan.reduce((m, x) => m + x.ids.length, 0);
      return {
        data: clean({ project: p.name, [a.action === 'link' ? 'linked' : 'unlinked']: Object.fromEntries(plan.map((x) => [x.label, x.ids.length])), movedFromAnotherProject: moved.length ? moved : undefined, now: projectOut(after, after.projects.find((x) => x.id === p.id)!, today, false) }),
        summary: `${a.action === 'link' ? 'Linked' : 'Unlinked'} ${plural(n, 'record')} ${a.action === 'link' ? 'to' : 'from'} “${p.name}”`,
      };
    },
  }),
];


