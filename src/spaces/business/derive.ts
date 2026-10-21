/* Pure calculations for business spaces (used by screens, print documents,
   agent tools and the coach summary). No store access, no React. */
import type { SpaceData } from '@/spaces/types';
import { addDays, diffDays, parseISODate, toISODate } from '@/lib/dates';
import type { InvoiceShownStatus, PeriodId } from './constants';
import { PERIODS } from './constants';
import { normalizeBusiness, type BusinessData, type Client, type ContractorPayment, type Expense, type ExpenseCategory, type Invoice, type RunningTimer, type TimeEntry } from './types';

export const EMPTY_BIZ: BusinessData = normalizeBusiness({});

/** The business data of a space (never undefined). */
export function bizOf(s: Pick<SpaceData, 'business'> | null | undefined): BusinessData {
  const b = s?.business;
  if (!b) return EMPTY_BIZ;
  // files read straight from disk (coach) may predate a field: normalise a copy
  return Array.isArray(b.invoices) && Array.isArray(b.time) && Array.isArray(b.docs) && b.settings?.expenseCategories ? b : normalizeBusiness(JSON.parse(JSON.stringify(b)));
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------------------------------------------------------------- dates */

export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export const monthKey = (iso: string) => iso.slice(0, 7);

export function monthLabel(key: string, long = false): string {
  const d = parseISODate(`${key}-01`);
  if (!d) return key;
  return d.toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' });
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function periodRange(period: PeriodId | string, today: string): DateRange {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const label = PERIODS.find((p) => p.value === period)?.label ?? 'All time';
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthEnd = (yy: number, mm: number) => toISODate(new Date(yy, mm, 0));
  switch (period) {
    case 'this_month':
      return { from: `${y}-${pad(m)}-01`, to: monthEnd(y, m), label };
    case 'last_month': {
      const yy = m === 1 ? y - 1 : y;
      const mm = m === 1 ? 12 : m - 1;
      return { from: `${yy}-${pad(mm)}-01`, to: monthEnd(yy, mm), label };
    }
    case 'this_quarter': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${pad(q0)}-01`, to: monthEnd(y, q0 + 2), label };
    }
    case 'last_quarter': {
      let q0 = Math.floor((m - 1) / 3) * 3 + 1 - 3;
      let yy = y;
      if (q0 < 1) {
        q0 += 12;
        yy -= 1;
      }
      return { from: `${yy}-${pad(q0)}-01`, to: monthEnd(yy, q0 + 2), label };
    }
    case 'ytd':
      return { from: `${y}-01-01`, to: today, label };
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label };
    case 'last_12':
      return { from: addDays(addMonths(today, -12), 1), to: today, label };
    default:
      return { from: '0000-01-01', to: '9999-12-31', label: 'All time' };
  }
}

export const inRange = (date: string | undefined, r: { from: string; to: string }) => !!date && date >= r.from && date <= r.to;

/** First day of the week containing `today`. */
export function weekStartOf(today: string, mondayFirst: boolean): string {
  const d = parseISODate(today);
  if (!d) return today;
  const dow = d.getDay();
  const back = mondayFirst ? (dow + 6) % 7 : dow;
  return addDays(today, -back);
}

/* ---------------------------------------------------------------- invoices */

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'discount' | 'taxPct'>): InvoiceTotals {
  const subtotal = round2((inv.lines ?? []).reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0));
  const discount = round2(Math.min(Math.max(0, inv.discount ?? 0), Math.max(0, subtotal)));
  const tax = round2(((subtotal - discount) * (inv.taxPct ?? 0)) / 100);
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
}

export const invoiceTotal = (inv: Invoice) => invoiceTotals(inv).total;

export function invoiceStatus(inv: Invoice, today: string): InvoiceShownStatus {
  if (inv.status === 'sent' && inv.dueDate && inv.dueDate < today) return 'overdue';
  return inv.status;
}

export const isOpenInvoice = (inv: Invoice) => inv.status === 'sent';

export function daysOverdue(inv: Invoice, today: string): number {
  if (inv.status !== 'sent' || !inv.dueDate || inv.dueDate >= today) return 0;
  return diffDays(inv.dueDate, today);
}

/** Next invoice number: prefix + max(settings.next, last number + 1), zero-padded to 4. */
export function nextInvoiceNumber(b: BusinessData): string {
  const prefix = b.settings.invoicePrefix ?? '';
  let max = 0;
  for (const inv of b.invoices) {
    if (!inv.number.startsWith(prefix)) continue;
    const n = Number(inv.number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  const n = Math.max(b.settings.nextInvoiceNumber || 1, max + 1);
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export function findInvoice(b: BusinessData, ref: string | undefined): Invoice | undefined {
  if (!ref) return undefined;
  const r = ref.trim().toLowerCase();
  return b.invoices.find((x) => x.id === ref) ?? b.invoices.find((x) => x.number.toLowerCase() === r) ?? b.invoices.find((x) => x.number.toLowerCase().endsWith(r) && r.length >= 2);
}

/* ---------------------------------------------------------------- money rows */

export interface IncomeRow {
  id: string;
  date: string;
  amount: number;
  source: 'entry' | 'invoice';
  streamId?: string;
  clientId?: string;
  invoiceId?: string;
  /** business project (own or the linked invoice's) */
  bizProjectId?: string;
  description?: string;
}

/** Income entries + paid invoices that have no linked entry (no double counting). */
export function incomeRows(b: BusinessData): IncomeRow[] {
  const linked = new Set(b.income.map((e) => e.invoiceId).filter(Boolean));
  const invProject = (id?: string) => (id ? b.invoices.find((i) => i.id === id)?.bizProjectId : undefined);
  const rows: IncomeRow[] = b.income.map((e) => ({ id: e.id, date: e.date, amount: e.amount || 0, source: 'entry', streamId: e.streamId, clientId: e.clientId, invoiceId: e.invoiceId, bizProjectId: e.bizProjectId ?? invProject(e.invoiceId), description: e.description }));
  for (const inv of b.invoices) {
    if (inv.status !== 'paid' || linked.has(inv.id)) continue;
    rows.push({ id: inv.id, date: inv.paidDate || inv.issueDate, amount: invoiceTotal(inv), source: 'invoice', streamId: inv.streamId, clientId: inv.clientId, invoiceId: inv.id, bizProjectId: inv.bizProjectId, description: `Invoice ${inv.number}` });
  }
  return rows;
}

export interface ExpenseRow {
  id: string;
  date: string;
  amount: number;
  source: 'entry' | 'payment';
  category: string;
  vendor?: string;
  description?: string;
  deductible?: boolean;
  contractorId?: string;
  /** business project (own or the linked contractor payment's) */
  bizProjectId?: string;
}

/** Expenses + paid contractor payments that have no linked expense. */
export function expenseRows(b: BusinessData): ExpenseRow[] {
  const linked = new Set(b.expenses.map((e) => e.paymentId).filter(Boolean));
  const rows: ExpenseRow[] = b.expenses.map((e) => ({ id: e.id, date: e.date, amount: e.amount || 0, source: 'entry', category: e.category, vendor: e.vendor, description: e.description, deductible: e.deductible, contractorId: e.contractorId, bizProjectId: e.bizProjectId ?? (e.paymentId ? b.payments.find((p) => p.id === e.paymentId)?.bizProjectId : undefined) }));
  for (const p of b.payments) {
    if (p.status !== 'paid' || linked.has(p.id)) continue;
    const c = b.contractors.find((x) => x.id === p.contractorId);
    rows.push({ id: p.id, date: p.paidDate || p.date, amount: p.amount || 0, source: 'payment', category: 'contractors', vendor: c?.name, description: p.description, deductible: true, contractorId: p.contractorId, bizProjectId: p.bizProjectId });
  }
  return rows;
}

export const sumAmount = (rows: { amount: number }[]) => round2(rows.reduce((n, r) => n + (r.amount || 0), 0));

export interface PL {
  income: number;
  expenses: number;
  profit: number;
}

export function profitLoss(b: BusinessData, r: { from: string; to: string }): PL {
  const income = sumAmount(incomeRows(b).filter((x) => inRange(x.date, r)));
  const expenses = sumAmount(expenseRows(b).filter((x) => inRange(x.date, r)));
  return { income, expenses, profit: round2(income - expenses) };
}

export interface MonthPoint extends PL {
  month: string;
}

/** The last `months` months ending with today's month. */
export function monthSeries(b: BusinessData, today: string, months = 12): MonthPoint[] {
  const inc = incomeRows(b);
  const exp = expenseRows(b);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) keys.push(monthKey(addMonths(`${today.slice(0, 7)}-01`, -i)));
  return keys.map((k) => {
    const income = sumAmount(inc.filter((x) => x.date.startsWith(k)));
    const expenses = sumAmount(exp.filter((x) => x.date.startsWith(k)));
    return { month: k, income, expenses, profit: round2(income - expenses) };
  });
}

export function categoryOf(b: BusinessData, id: string | undefined): ExpenseCategory {
  return b.settings.expenseCategories.find((c) => c.id === id) ?? { id: id || 'other', label: id ? id.replace(/_/g, ' ') : 'Other', color: '#adb5bd' };
}

export interface Bucket {
  id: string;
  label: string;
  color: string;
  amount: number;
  count: number;
}

export function expensesByCategory(b: BusinessData, r: { from: string; to: string }): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const x of expenseRows(b)) {
    if (!inRange(x.date, r)) continue;
    const c = categoryOf(b, x.category);
    const cur = map.get(c.id) ?? { id: c.id, label: c.label, color: c.color, amount: 0, count: 0 };
    cur.amount = round2(cur.amount + x.amount);
    cur.count++;
    map.set(c.id, cur);
  }
  return [...map.values()].sort((a, z) => z.amount - a.amount);
}

export function incomeByStream(b: BusinessData, r: { from: string; to: string }): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const x of incomeRows(b)) {
    if (!inRange(x.date, r)) continue;
    const st = b.streams.find((s) => s.id === x.streamId);
    const id = st?.id ?? '_none';
    const cur = map.get(id) ?? { id, label: st?.name || 'No stream', color: '', amount: 0, count: 0 };
    cur.amount = round2(cur.amount + x.amount);
    cur.count++;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, z) => z.amount - a.amount);
}

export function incomeByClient(b: BusinessData, r: { from: string; to: string }): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const x of incomeRows(b)) {
    if (!inRange(x.date, r)) continue;
    const c = b.clients.find((s) => s.id === x.clientId);
    const id = c?.id ?? '_none';
    const cur = map.get(id) ?? { id, label: c ? clientName(c) : 'No client', color: '', amount: 0, count: 0 };
    cur.amount = round2(cur.amount + x.amount);
    cur.count++;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, z) => z.amount - a.amount);
}

/* ---------------------------------------------------------------- receivables */

export interface Aging {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90: number;
  total: number;
  overdue: number;
  overdueCount: number;
  openCount: number;
}

export function arAging(b: BusinessData, today: string): Aging {
  const a: Aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0, overdue: 0, overdueCount: 0, openCount: 0 };
  for (const inv of b.invoices) {
    if (inv.status !== 'sent') continue;
    const t = invoiceTotal(inv);
    const late = daysOverdue(inv, today);
    a.total += t;
    a.openCount++;
    if (late <= 0) a.current += t;
    else {
      a.overdue += t;
      a.overdueCount++;
      if (late <= 30) a.d1_30 += t;
      else if (late <= 60) a.d31_60 += t;
      else if (late <= 90) a.d61_90 += t;
      else a.d90 += t;
    }
  }
  for (const k of ['current', 'd1_30', 'd31_60', 'd61_90', 'd90', 'total', 'overdue'] as const) a[k] = round2(a[k]);
  return a;
}

/* ---------------------------------------------------------------- people */

export const clientName = (c: Pick<Client, 'name' | 'company'> | undefined) => (c ? c.name || c.company || 'Unnamed client' : '');

export function clientLabel(b: BusinessData, id: string | undefined): string {
  if (!id) return '';
  const c = b.clients.find((x) => x.id === id);
  return c ? (c.company && c.name ? `${c.name} · ${c.company}` : clientName(c)) : '(deleted client)';
}

export interface ClientTotals {
  billed: number;
  paid: number;
  outstanding: number;
  invoices: number;
  hours: number;
  unbilled: number;
}

export function clientTotals(b: BusinessData, clientId: string, today: string): ClientTotals {
  let billed = 0;
  let outstanding = 0;
  let invoices = 0;
  for (const inv of b.invoices) {
    if (inv.clientId !== clientId || inv.status === 'void' || inv.status === 'draft') continue;
    const t = invoiceTotal(inv);
    billed += t;
    invoices++;
    if (inv.status === 'sent') outstanding += t;
  }
  const paid = sumAmount(incomeRows(b).filter((r) => r.clientId === clientId));
  const mins = b.time.filter((t) => t.clientId === clientId).reduce((n, t) => n + t.minutes, 0);
  const unbilled = sumAmount(unbilledEntries(b, clientId).map((e) => ({ amount: entryValue(b, e) })));
  void today;
  return { billed: round2(billed), paid, outstanding: round2(outstanding), invoices, hours: Math.round((mins / 60) * 10) / 10, unbilled };
}

export interface ContractorBalance {
  owed: number;
  paid: number;
  count: number;
}

export function contractorBalance(b: BusinessData, contractorId: string): ContractorBalance {
  let owed = 0;
  let paid = 0;
  let count = 0;
  for (const p of b.payments) {
    if (p.contractorId !== contractorId) continue;
    count++;
    if (p.status === 'paid') paid += p.amount || 0;
    else owed += p.amount || 0;
  }
  return { owed: round2(owed), paid: round2(paid), count };
}

export function unpaidPayments(b: BusinessData): ContractorPayment[] {
  return b.payments.filter((p) => p.status !== 'paid');
}

export const totalOwedToContractors = (b: BusinessData) => sumAmount(unpaidPayments(b));

/* ---------------------------------------------------------------- time */

export function entryRate(b: BusinessData, e: Pick<TimeEntry, 'rate' | 'clientId'>): number {
  if (e.rate != null) return e.rate;
  const c = e.clientId ? b.clients.find((x) => x.id === e.clientId) : undefined;
  return c?.defaultRate ?? b.settings.hourlyRate ?? 0;
}

export function entryValue(b: BusinessData, e: TimeEntry): number {
  if (!e.billable) return 0;
  return round2((e.minutes / 60) * entryRate(b, e));
}

export function unbilledEntries(b: BusinessData, clientId?: string): TimeEntry[] {
  return b.time.filter((t) => t.billable && !t.invoiceId && (clientId === undefined || t.clientId === clientId));
}

export function minutesBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  if ([h1, m1, h2, m2].some((x) => isNaN(x))) return null;
  let d = h2 * 60 + m2 - (h1 * 60 + m1);
  if (d < 0) d += 24 * 60;
  return d;
}

/** "1:30", "1h 30m", "90m", "1.5", "90" (minutes when > 12) → minutes. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/.exec(t);
  if (m && (m[1] || m[2])) return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  const n = Number(t.replace(',', '.'));
  if (isFinite(n) && n > 0) return n <= 12 ? Math.round(n * 60) : Math.round(n);
  return null;
}

export function timerMinutes(t: RunningTimer | undefined, now = Date.now()): number {
  if (!t) return 0;
  const start = Date.parse(t.startedAt);
  if (isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 60000));
}

export function formatDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
}

export const hours = (mins: number) => Math.round((mins / 60) * 100) / 100;

export function minutesIn(b: BusinessData, r: { from: string; to: string }, filter?: (t: TimeEntry) => boolean): number {
  return b.time.filter((t) => inRange(t.date, r) && (!filter || filter(t))).reduce((n, t) => n + t.minutes, 0);
}

/* ---------------------------------------------------------------- expenses */

/** Latest expense of each recurring series (same vendor + category + interval) and its next date. */
export function recurringSeries(b: BusinessData): { last: Expense; next: string }[] {
  const latest = new Map<string, Expense>();
  for (const e of b.expenses) {
    if (!e.recurring || !e.date) continue;
    const key = `${(e.vendor || e.description || '').toLowerCase()}|${e.category}|${e.recurring}`;
    const cur = latest.get(key);
    if (!cur || e.date > cur.date) latest.set(key, e);
  }
  return [...latest.values()].map((last) => ({ last, next: addMonths(last.date, last.recurring === 'yearly' ? 12 : 1) }));
}

/* ---------------------------------------------------------------- upcoming */

export interface DueItem {
  id: string;
  date: string;
  kind: 'invoice' | 'payment' | 'recurring' | 'document';
  label: string;
  sub?: string;
  amount?: number;
  overdue?: boolean;
  module: string;
  params: Record<string, string>;
}

/** Overdue and upcoming money / document dates (next `days` days). */
export function upcoming(b: BusinessData, today: string, days = 30): DueItem[] {
  const until = addDays(today, days);
  const out: DueItem[] = [];
  for (const inv of b.invoices) {
    if (inv.status !== 'sent' || !inv.dueDate || inv.dueDate > until) continue;
    out.push({ id: inv.id, date: inv.dueDate, kind: 'invoice', label: `Invoice ${inv.number} due`, sub: clientLabel(b, inv.clientId), amount: invoiceTotal(inv), overdue: inv.dueDate < today, module: 'invoices', params: { invoiceId: inv.id } });
  }
  for (const p of b.payments) {
    if (p.status === 'paid' || !p.date || p.date > until) continue;
    const c = b.contractors.find((x) => x.id === p.contractorId);
    out.push({ id: p.id, date: p.date, kind: 'payment', label: `Pay ${c?.name || 'contractor'}`, sub: p.description, amount: p.amount, overdue: p.date < today, module: 'contractors', params: { contractorId: p.contractorId } });
  }
  for (const { last, next } of recurringSeries(b)) {
    if (next > until) continue;
    out.push({ id: last.id, date: next, kind: 'recurring', label: last.vendor || last.description || 'Recurring expense', sub: last.recurring === 'yearly' ? 'Yearly' : 'Monthly', amount: last.amount, overdue: next < today, module: 'expenses', params: { expenseId: last.id } });
  }
  for (const d of b.docs) {
    if (d.status === 'sent' && d.sentDate && diffDays(d.sentDate, today) >= 7) out.push({ id: d.id, date: d.sentDate, kind: 'document', label: `Signature pending: ${d.title}`, sub: d.party.name, module: 'legal', params: { docId: d.id } });
    if (d.status === 'signed' && d.expiresDate && d.expiresDate <= until) out.push({ id: `${d.id}-exp`, date: d.expiresDate, kind: 'document', label: `${d.title} ends`, sub: d.party.name, overdue: d.expiresDate < today, module: 'legal', params: { docId: d.id } });
  }
  return out.sort((a, z) => a.date.localeCompare(z.date));
}
