/* Write operations of business spaces. Every function is ONE updateSpace() call
   (one undo step) unless noted. Shared by the screens and the agent tools. */
import type { Draft } from 'immer';
import type { SpaceData } from '@/spaces/types';
import { getSpace, updateSpace } from '@/store/space';
import { uid } from '@/lib/id';
import { addDays, todayISO, toISODate } from '@/lib/dates';
import { addMonths, bizOf, clientName, entryRate, invoiceTotal, nextInvoiceNumber, round2, timerMinutes, unbilledEntries } from './derive';
import {
  normalizeBusiness,
  type BizProject,
  type BizResource,
  type BizStrategy,
  type BizTask,
  type Deal,
  type Initiative,
  type PortfolioItem,
  type Sop,
  type Testimonial,
  type BizFile,
  type BusinessData,
  type BusinessProfile,
  type BusinessSettings,
  type Client,
  type Contractor,
  type ContractorPayment,
  type Expense,
  type IncomeEntry,
  type IncomeStream,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
  type LegalDoc,
  type PaymentStatus,
  type RunningTimer,
  type TimeEntry,
} from './types';

type B = Draft<BusinessData>;

/** The live business data (event handlers / agent tools). */
export function getBiz(): BusinessData {
  return bizOf(getSpace());
}

/** Change the business data in one undo step. */
export function bizUpdate(recipe: (b: B, d: Draft<SpaceData>) => void, opts?: { coalesce?: string }) {
  updateSpace((d) => {
    if (!d.business) d.business = normalizeBusiness({}) as Draft<BusinessData>;
    recipe(d.business as B, d);
  }, opts);
}

/* ---------------------------------------------------------------- profile & settings */

export function setProfile(patch: Partial<BusinessProfile>, coalesce = true) {
  bizUpdate((b) => void Object.assign(b.profile, patch), coalesce ? { coalesce: `biz:profile:${Object.keys(patch).join(',')}` } : undefined);
}

export function setSettings(patch: Partial<BusinessSettings>, coalesce = true) {
  bizUpdate((b) => void Object.assign(b.settings, patch), coalesce ? { coalesce: `biz:settings:${Object.keys(patch).join(',')}` } : undefined);
}

/* ---------------------------------------------------------------- generic lists */

export type ListKey = 'streams' | 'income' | 'clients' | 'contractors' | 'payments' | 'invoices' | 'expenses' | 'time' | 'docs' | 'deals' | 'projects' | 'resources' | 'testimonials' | 'portfolio' | 'sops' | 'initiatives';
type ItemOf<K extends ListKey> = BusinessData[K][number];

const PREFIX: Record<ListKey, string> = { streams: 'str', income: 'inc', clients: 'cli', contractors: 'ctr', payments: 'cpay', invoices: 'inv', expenses: 'exp', time: 'time', docs: 'doc', deals: 'deal', projects: 'bproj', resources: 'res', testimonials: 'tst', portfolio: 'pf', sops: 'sop', initiatives: 'init' };

export function newId(key: ListKey) {
  return uid(PREFIX[key]);
}

export function addItem<K extends ListKey>(key: K, item: ItemOf<K>, index?: number): string {
  bizUpdate((b) => {
    const list = b[key] as unknown as ItemOf<K>[];
    if (index == null || index < 0 || index > list.length) list.push(item);
    else list.splice(index, 0, item);
  });
  return item.id;
}

export function updateItem<K extends ListKey>(key: K, id: string, patch: Partial<ItemOf<K>>, coalesce = true) {
  bizUpdate(
    (b) => {
      const it = (b[key] as unknown as ItemOf<K>[]).find((x) => x.id === id);
      if (!it) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (it as any)[k];
        else (it as any)[k] = v;
      }
    },
    coalesce ? { coalesce: `biz:${key}:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/** Remove items and clean every reference to them. */
export function removeItems(key: ListKey, ids: string[]) {
  const set = new Set(ids);
  if (!set.size) return;
  bizUpdate((b) => removeDraft(b, key, set));
}

export function removeDraft(b: B, key: ListKey, set: Set<string>) {
  const list = b[key] as unknown as { id: string }[];
  for (let i = list.length - 1; i >= 0; i--) if (set.has(list[i].id)) list.splice(i, 1);
  const clear = <T extends object>(arr: T[], field: keyof T) => {
    for (const x of arr) if (set.has((x as any)[field])) delete (x as any)[field];
  };
  switch (key) {
    case 'clients':
      clear(b.deals, 'clientId');
      clear(b.projects, 'clientId');
      clear(b.testimonials, 'clientId');
      clear(b.portfolio, 'clientId');
      clear(b.invoices, 'clientId');
      clear(b.income, 'clientId');
      clear(b.time, 'clientId');
      if (b.timer && b.timer.clientId && set.has(b.timer.clientId)) delete b.timer.clientId;
      for (const d of b.docs) if (d.partyKind === 'client' && d.partyId && set.has(d.partyId)) delete d.partyId;
      break;
    case 'contractors': {
      const pays = new Set(b.payments.filter((p) => set.has(p.contractorId)).map((p) => p.id));
      for (let i = b.payments.length - 1; i >= 0; i--) if (pays.has(b.payments[i].id)) b.payments.splice(i, 1);
      for (const e of b.expenses) {
        if (e.contractorId && set.has(e.contractorId)) delete e.contractorId;
        if (e.paymentId && pays.has(e.paymentId)) delete e.paymentId;
      }
      for (const d of b.docs) if (d.partyKind === 'contractor' && d.partyId && set.has(d.partyId)) delete d.partyId;
      for (const p of b.projects) {
        p.contractorIds = p.contractorIds.filter((x) => !set.has(x));
        for (const t of p.tasks) if (t.assignee && set.has(t.assignee)) delete t.assignee;
      }
      break;
    }
    case 'projects':
      for (const list of [b.invoices, b.income, b.expenses, b.time, b.payments, b.docs, b.deals, b.testimonials, b.portfolio] as { bizProjectId?: string }[][]) clear(list, 'bizProjectId');
      break;
    case 'deals':
      clear(b.projects, 'dealId');
      break;
    case 'docs':
      for (const p of b.projects) p.docIds = p.docIds.filter((x) => !set.has(x));
      break;
    case 'initiatives':
      clear(b.expenses, 'initiativeId');
      break;
    case 'resources':
      for (const x of b.sops) x.resourceIds = x.resourceIds.filter((r) => !set.has(r));
      break;
    case 'streams':
      clear(b.income, 'streamId');
      clear(b.invoices, 'streamId');
      break;
    case 'invoices':
      for (const t of b.time) if (t.invoiceId && set.has(t.invoiceId)) delete t.invoiceId;
      for (let i = b.income.length - 1; i >= 0; i--) if (b.income[i].invoiceId && set.has(b.income[i].invoiceId!)) b.income.splice(i, 1);
      break;
    case 'payments':
      for (let i = b.expenses.length - 1; i >= 0; i--) if (b.expenses[i].paymentId && set.has(b.expenses[i].paymentId!)) b.expenses.splice(i, 1);
      break;
    case 'expenses':
      for (const p of b.payments) if (p.expenseId && set.has(p.expenseId)) delete p.expenseId;
      break;
    case 'income':
      break;
    default:
      break;
  }
}

/* ---------------------------------------------------------------- factories */

export function makeDeal(patch: Partial<Deal> = {}): Deal {
  return { id: newId('deals'), title: '', stage: 'lead', createdAt: todayISO(), activities: [], ...patch };
}

export function makeProject(patch: Partial<BizProject> = {}): BizProject {
  return { id: newId('projects'), name: '', status: 'planning', contractorIds: [], docIds: [], tasks: [], ...patch };
}

export function makeTask(patch: Partial<BizTask> = {}): BizTask {
  return { id: uid('task'), title: '', done: false, ...patch };
}

export function makeResource(patch: Partial<BizResource> = {}): BizResource {
  return { id: newId('resources'), title: '', section: 'library', kind: 'text', updatedAt: todayISO(), ...patch };
}

export function makeTestimonial(patch: Partial<Testimonial> = {}): Testimonial {
  return { id: newId('testimonials'), quote: '', author: '', permission: 'not_asked', date: todayISO(), ...patch };
}

export function makePortfolioItem(patch: Partial<PortfolioItem> = {}): PortfolioItem {
  return { id: newId('portfolio'), title: '', kind: 'video', ...patch };
}

export function makeInitiative(patch: Partial<Initiative> = {}): Initiative {
  return { id: newId('initiatives'), title: '', status: 'idea', steps: [], updates: [], ...patch };
}

export function makeSop(patch: Partial<Sop> = {}): Sop {
  return { id: newId('sops'), title: '', kind: 'sop', steps: [], resourceIds: [], runs: [], updatedAt: todayISO(), ...patch };
}

/** Change the strategy (one undo step; typing coalesces per field). */
export function setStrategy(patch: Partial<BizStrategy>, coalesce = true) {
  bizUpdate((b) => void Object.assign(b.strategy, patch), coalesce ? { coalesce: `biz:strategy:${Object.keys(patch).join(',')}` } : undefined);
}

/** Win a deal: stage won, closed today, and (unless it has one) a new planning project
    for the same client with the deal value as fee. Returns the project id. */
export function winDeal(dealId: string, opts: { createProject?: boolean } = {}): string | undefined {
  let projectId: string | undefined;
  bizUpdate((b) => {
    const deal = b.deals.find((x) => x.id === dealId);
    if (!deal) return;
    deal.stage = 'won';
    deal.closedDate = deal.closedDate ?? todayISO();
    deal.probability = 100;
    if (opts.createProject === false || deal.bizProjectId) {
      projectId = deal.bizProjectId;
      return;
    }
    let clientId = deal.clientId;
    if (!clientId && (deal.contactName || deal.company)) {
      const c = makeClient({ name: deal.contactName || deal.company || '', company: deal.contactName ? deal.company : undefined, email: deal.email, phone: deal.phone });
      b.clients.push(c);
      clientId = c.id;
      deal.clientId = c.id;
    }
    const p = makeProject({ name: deal.title, clientId, dealId: deal.id, fee: deal.value, feeType: 'fixed', startDate: todayISO(), spaceId: deal.spaceId, projectId: deal.projectId });
    b.projects.push(p);
    deal.bizProjectId = p.id;
    projectId = p.id;
  });
  return projectId;
}

export function makeClient(patch: Partial<Client> = {}): Client {
  return { id: newId('clients'), name: '', ...patch };
}

export function makeContractor(patch: Partial<Contractor> = {}): Contractor {
  return { id: newId('contractors'), name: '', rateType: 'hourly', active: true, taxForm: 'none', ...patch };
}

export function makeStream(patch: Partial<IncomeStream> = {}): IncomeStream {
  return { id: newId('streams'), name: '', type: 'client_work', active: true, ...patch };
}

export function makeIncome(patch: Partial<IncomeEntry> = {}): IncomeEntry {
  return { id: newId('income'), date: todayISO(), amount: 0, ...patch };
}

export function makeExpense(patch: Partial<Expense> = {}): Expense {
  return { id: newId('expenses'), date: todayISO(), category: 'other', amount: 0, deductible: true, ...patch };
}

export function makePayment(contractorId: string, patch: Partial<ContractorPayment> = {}): ContractorPayment {
  return { id: newId('payments'), contractorId, date: todayISO(), amount: 0, status: 'owed', ...patch };
}

export function makeTimeEntry(patch: Partial<TimeEntry> = {}): TimeEntry {
  return { id: newId('time'), date: todayISO(), minutes: 60, billable: true, ...patch };
}

export function makeLine(patch: Partial<InvoiceLine> = {}): InvoiceLine {
  return { id: uid('invl'), description: '', qty: 1, unitPrice: 0, ...patch };
}

export function makeFile(file: string, fileName: string, fileSize?: number): BizFile {
  return { id: uid('bf'), file, fileName, fileSize, addedAt: todayISO() };
}

/* ---------------------------------------------------------------- invoices */

/** New invoice with the next number and default terms (not yet in the store). */
export function draftInvoice(b: BusinessData, patch: Partial<Invoice> = {}): Invoice {
  const today = todayISO();
  const client = patch.clientId ? b.clients.find((c) => c.id === patch.clientId) : undefined;
  const issue = patch.issueDate ?? today;
  return {
    id: newId('invoices'),
    number: nextInvoiceNumber(b),
    issueDate: issue,
    dueDate: addDays(issue, client?.termsDays ?? b.settings.paymentTermsDays ?? 14),
    status: 'draft',
    lines: [],
    taxPct: b.settings.taxPct || undefined,
    notes: b.settings.invoiceNotes || undefined,
    paymentInstructions: b.settings.paymentInstructions || undefined,
    ...patch,
  };
}

export function createInvoice(patch: Partial<Invoice> = {}): Invoice {
  const inv = draftInvoice(getBiz(), patch);
  addItem('invoices', inv);
  return inv;
}

/** Status change with its side effects (sent / paid dates, income entry on paid). */
export function applyInvoiceStatus(b: B, id: string, status: InvoiceStatus, date = todayISO(), method?: Invoice['method']) {
  const inv = b.invoices.find((x) => x.id === id);
  if (!inv) return;
  inv.status = status;
  if (status === 'sent' || status === 'paid') inv.sentDate ??= status === 'sent' ? date : inv.issueDate;
  if (status === 'paid') {
    inv.paidDate = date;
    if (method) inv.method = method;
    const total = invoiceTotal(inv as Invoice);
    const entry = b.income.find((e) => e.invoiceId === id);
    if (entry) {
      entry.amount = total;
      entry.date = date;
      entry.clientId = inv.clientId;
      entry.streamId = inv.streamId ?? entry.streamId;
      entry.bizProjectId = inv.bizProjectId ?? entry.bizProjectId;
    } else {
      b.income.push({ id: newId('income'), date, amount: total, invoiceId: id, clientId: inv.clientId, streamId: inv.streamId, description: `Invoice ${inv.number}`, method: inv.method, ...(inv.bizProjectId ? { bizProjectId: inv.bizProjectId } : {}) });
    }
  } else {
    delete inv.paidDate;
    for (let i = b.income.length - 1; i >= 0; i--) if (b.income[i].invoiceId === id) b.income.splice(i, 1);
    if (status === 'draft') delete inv.sentDate;
  }
}

export function setInvoiceStatus(id: string, status: InvoiceStatus, date?: string, method?: Invoice['method']) {
  bizUpdate((b) => applyInvoiceStatus(b, id, status, date, method));
}

/** Keep the income entry of a paid invoice in sync after its lines change. */
export function syncPaidInvoice(b: B, id: string) {
  const inv = b.invoices.find((x) => x.id === id);
  if (!inv || inv.status !== 'paid') return;
  const entry = b.income.find((e) => e.invoiceId === id);
  if (entry) entry.amount = invoiceTotal(inv as Invoice);
}

export function updateInvoice(id: string, patch: Partial<Invoice>, coalesce = true) {
  bizUpdate(
    (b) => {
      const inv = b.invoices.find((x) => x.id === id);
      if (!inv) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (inv as any)[k];
        else (inv as any)[k] = v;
      }
      syncPaidInvoice(b, id);
    },
    coalesce ? { coalesce: `biz:invoice:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function updateLine(invoiceId: string, lineId: string, patch: Partial<InvoiceLine>) {
  bizUpdate(
    (b) => {
      const l = b.invoices.find((x) => x.id === invoiceId)?.lines.find((x) => x.id === lineId);
      if (l) Object.assign(l, patch);
      syncPaidInvoice(b, invoiceId);
    },
    { coalesce: `biz:invl:${lineId}:${Object.keys(patch).join(',')}` },
  );
}

export function addLines(invoiceId: string, lines: InvoiceLine[]) {
  bizUpdate((b) => {
    b.invoices.find((x) => x.id === invoiceId)?.lines.push(...lines);
    syncPaidInvoice(b, invoiceId);
  });
}

export function removeLine(invoiceId: string, lineId: string) {
  bizUpdate((b) => {
    const inv = b.invoices.find((x) => x.id === invoiceId);
    if (!inv) return;
    const i = inv.lines.findIndex((l) => l.id === lineId);
    if (i < 0) return;
    const [l] = inv.lines.splice(i, 1);
    const ids = new Set(l.timeEntryIds ?? []);
    for (const t of b.time) if (ids.has(t.id) && t.invoiceId === invoiceId) delete t.invoiceId;
    syncPaidInvoice(b, invoiceId);
  });
}

/** Move a line before another line (null = to the end). */
export function reorderLine(invoiceId: string, lineId: string, beforeId: string | null) {
  bizUpdate((b) => {
    const inv = b.invoices.find((x) => x.id === invoiceId);
    if (!inv) return;
    const i = inv.lines.findIndex((l) => l.id === lineId);
    if (i < 0) return;
    const [l] = inv.lines.splice(i, 1);
    const j = beforeId ? inv.lines.findIndex((x) => x.id === beforeId) : -1;
    if (j < 0) inv.lines.push(l);
    else inv.lines.splice(j, 0, l);
  });
}

/** Lines for time entries: one line per entry (date, description, hours × rate). */
export function linesForTime(b: BusinessData, entries: TimeEntry[], fmtDate: (iso: string) => string): InvoiceLine[] {
  return [...entries]
    .sort((a, z) => a.date.localeCompare(z.date))
    .map((e) => makeLine({ description: `${fmtDate(e.date)} — ${e.description?.trim() || 'Time'}`, qty: Math.round((e.minutes / 60) * 100) / 100, unitPrice: entryRate(b, e), timeEntryIds: [e.id] }));
}

/** Add billable, not-yet-invoiced time of the invoice's client (or the given entries) and mark it invoiced. Returns the number of entries. */
export function addUnbilledTime(invoiceId: string, fmtDate: (iso: string) => string, entryIds?: string[]): number {
  const b = getBiz();
  const inv = b.invoices.find((x) => x.id === invoiceId);
  if (!inv) return 0;
  const pool = unbilledEntries(b, inv.clientId ?? undefined).filter((e) => (inv.clientId ? true : !e.clientId));
  const entries = entryIds ? pool.filter((e) => entryIds.includes(e.id)) : pool;
  if (!entries.length) return 0;
  const lines = linesForTime(b, entries, fmtDate);
  bizUpdate((d) => {
    const target = d.invoices.find((x) => x.id === invoiceId);
    if (!target) return;
    target.lines.push(...lines);
    const ids = new Set(entries.map((e) => e.id));
    for (const t of d.time) if (ids.has(t.id)) t.invoiceId = invoiceId;
    syncPaidInvoice(d, invoiceId);
  });
  return entries.length;
}

export function duplicateInvoice(id: string): Invoice | undefined {
  const b = getBiz();
  const src = b.invoices.find((x) => x.id === id);
  if (!src) return;
  const today = todayISO();
  const copy = draftInvoice(b, {
    clientId: src.clientId,
    streamId: src.streamId,
    title: src.title,
    lines: src.lines.map((l) => makeLine({ description: l.description, qty: l.qty, unitPrice: l.unitPrice })),
    discount: src.discount,
    taxPct: src.taxPct,
    notes: src.notes,
    paymentInstructions: src.paymentInstructions,
    projectId: src.projectId,
    spaceId: src.spaceId,
    bizProjectId: src.bizProjectId,
    issueDate: today,
  });
  bizUpdate((d) => {
    const i = d.invoices.findIndex((x) => x.id === id);
    d.invoices.splice(i + 1, 0, copy);
  });
  return copy;
}

/* ---------------------------------------------------------------- contractor payments */

export function applyPaymentStatus(b: B, id: string, status: PaymentStatus, date = todayISO()) {
  const p = b.payments.find((x) => x.id === id);
  if (!p) return;
  p.status = status;
  if (status === 'paid') {
    p.paidDate = date;
    const c = b.contractors.find((x) => x.id === p.contractorId);
    const existing = b.expenses.find((e) => e.paymentId === id);
    if (existing) {
      existing.amount = p.amount;
      existing.date = date;
      existing.bizProjectId = p.bizProjectId ?? existing.bizProjectId;
    } else {
      const eid = newId('expenses');
      b.expenses.push({ id: eid, date, vendor: c?.name || 'Contractor', description: p.description, category: 'contractors', amount: p.amount, method: p.method, deductible: true, contractorId: p.contractorId, paymentId: id, reference: p.reference, ...(p.bizProjectId ? { bizProjectId: p.bizProjectId } : {}) });
      p.expenseId = eid;
    }
  } else {
    delete p.paidDate;
    for (let i = b.expenses.length - 1; i >= 0; i--) if (b.expenses[i].paymentId === id) b.expenses.splice(i, 1);
    delete p.expenseId;
  }
}

export function setPaymentStatus(id: string, status: PaymentStatus, date?: string) {
  bizUpdate((b) => applyPaymentStatus(b, id, status, date));
}

export function updatePayment(id: string, patch: Partial<ContractorPayment>, coalesce = true) {
  bizUpdate(
    (b) => {
      const p = b.payments.find((x) => x.id === id);
      if (!p) return;
      Object.assign(p, patch);
      const e = p.expenseId ? b.expenses.find((x) => x.id === p.expenseId) : undefined;
      if (e && p.status === 'paid') {
        e.amount = p.amount;
        if (patch.description !== undefined) e.description = p.description;
        if (patch.method !== undefined) e.method = p.method;
      }
    },
    coalesce ? { coalesce: `biz:payment:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/* ---------------------------------------------------------------- expenses */

/** Log the next occurrence of a recurring expense. Returns the new id. */
export function logNextRecurring(id: string): string | undefined {
  const e = getBiz().expenses.find((x) => x.id === id);
  if (!e) return;
  const next = makeExpense({ ...e, id: newId('expenses'), date: addMonths(e.date, e.recurring === 'yearly' ? 12 : 1), receipts: [], paymentId: undefined });
  delete (next as Partial<Expense>).paymentId;
  addItem('expenses', next);
  return next.id;
}

/* ---------------------------------------------------------------- time & timer */

export function startTimer(t: Omit<RunningTimer, 'startedAt'> = {}) {
  bizUpdate((b) => {
    b.timer = { startedAt: new Date().toISOString(), billable: true, ...t };
  });
}

export function updateTimer(patch: Partial<RunningTimer>) {
  bizUpdate(
    (b) => {
      if (b.timer) Object.assign(b.timer, patch);
    },
    { coalesce: `biz:timer:${Object.keys(patch).join(',')}` },
  );
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Stop the timer and log the entry (at least 1 minute). Returns the entry or undefined. */
export function stopTimer(): TimeEntry | undefined {
  const b = getBiz();
  const t = b.timer;
  if (!t) return;
  const start = new Date(t.startedAt);
  const now = new Date();
  const mins = Math.max(1, timerMinutes(t, now.getTime()));
  const entry = makeTimeEntry({
    date: isNaN(start.getTime()) ? todayISO() : toISODate(start),
    start: isNaN(start.getTime()) ? undefined : hhmm(start),
    end: hhmm(now),
    minutes: mins,
    clientId: t.clientId,
    description: t.description,
    billable: t.billable !== false,
    bizProjectId: t.bizProjectId,
  });
  if (!entry.bizProjectId) delete entry.bizProjectId;
  bizUpdate((d) => {
    d.time.unshift(entry);
    delete d.timer;
  });
  return entry;
}

export function discardTimer() {
  bizUpdate((d) => void delete d.timer);
}

/* ---------------------------------------------------------------- files */

export type FileTarget = { list: 'invoices' | 'docs' | 'payments'; id: string; field: 'attachments' } | { list: 'expenses'; id: string; field: 'receipts' } | { list: 'resources' | 'portfolio'; id: string; field: 'files' };

export function addFiles(target: FileTarget, files: BizFile[]) {
  if (!files.length) return;
  bizUpdate((b) => {
    const it = (b[target.list] as unknown as any[]).find((x) => x.id === target.id);
    if (!it) return;
    it[target.field] = [...(it[target.field] ?? []), ...files];
  });
}

export function removeFile(target: FileTarget, fileId: string) {
  bizUpdate((b) => {
    const it = (b[target.list] as unknown as any[]).find((x) => x.id === target.id);
    if (!it) return;
    it[target.field] = (it[target.field] ?? []).filter((f: BizFile) => f.id !== fileId);
  });
}

export function renameFile(target: FileTarget, fileId: string, fileName: string) {
  bizUpdate((b) => {
    const it = (b[target.list] as unknown as any[]).find((x) => x.id === target.id);
    const f = (it?.[target.field] ?? []).find((x: BizFile) => x.id === fileId);
    if (f) f.fileName = fileName;
  });
}

/* ---------------------------------------------------------------- legal docs */

export function addDoc(doc: LegalDoc) {
  addItem('docs', doc);
}

export function updateDocVars(id: string, patch: Record<string, string | undefined>) {
  bizUpdate(
    (b) => {
      const d = b.docs.find((x) => x.id === id);
      if (!d) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete d.vars[k];
        else d.vars[k] = v;
      }
    },
    { coalesce: `biz:docvars:${id}:${Object.keys(patch).join(',')}` },
  );
}

export function updateDocParty(id: string, patch: Partial<LegalDoc['party']>) {
  bizUpdate(
    (b) => {
      const d = b.docs.find((x) => x.id === id);
      if (d) Object.assign(d.party, patch);
    },
    { coalesce: `biz:docparty:${id}:${Object.keys(patch).join(',')}` },
  );
}

/* ---------------------------------------------------------------- misc */

export function clientDisplay(b: BusinessData, id?: string) {
  return clientName(b.clients.find((c) => c.id === id));
}

export { round2 };
