/* Agent (MCP) collections, single fields and tools of 'business' spaces
   (Business Management: income, clients, contractors, invoices, expenses,
   time and legal documents). The generic data tools (describe_data,
   list_items, add_items, update_items, delete_items, get_fields / set_fields)
   work on the collections and single fields below; the biz_* tools cover the
   flows with side effects (invoice numbers / totals / paid → income, contractor
   payments → expenses, the timer, document generation, reports). */
import type { Draft } from 'immer';
import type { BusinessData, ContractorPayment, Invoice, InvoiceLine, InvoiceStatus, LegalDoc, LegalTemplateId, PaymentMethod, PaymentStatus, RateType, TimeEntry } from '@/spaces/business/types';
import { BUSINESS_TYPES, INVOICE_STATUSES, LEGAL_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, PERIODS, RATE_TYPES, STREAM_TYPES, TAX_FORM_STATUSES, type PeriodId } from '@/spaces/business/constants';
import { DEFAULT_EXPENSE_CATEGORIES } from '@/spaces/business/types';
import {
  arAging,
  bizOf,
  categoryOf,
  clientLabel,
  clientName,
  contractorBalance,
  entryRate,
  entryValue,
  expenseRows,
  expensesByCategory,
  findInvoice,
  formatDuration,
  inRange,
  incomeByClient,
  incomeByStream,
  incomeRows,
  invoiceStatus,
  invoiceTotals,
  minutesIn,
  monthKey,
  periodRange,
  profitLoss,
  round2,
  sumAmount,
  timerMinutes,
  unbilledEntries,
  upcoming,
  weekStartOf,
} from '@/spaces/business/derive';
import { addDoc, applyInvoiceStatus, applyPaymentStatus, bizUpdate, draftInvoice, linesForTime, makeLine, makePayment, startTimer, stopTimer, discardTimer, syncPaidInvoice } from '@/spaces/business/ops';
import { LEGAL_TEMPLATES, TEMPLATE_BY_ID, buildLegal, draftDoc, legalText, missingRequired } from '@/spaces/business/templates';
import { createSpaceAndOpen } from '@/shell/spaceActions';
import { backend } from '@/backend';
import { makeFormatters } from '@/lib/format';
import { addDays, todayISO } from '@/lib/dates';
import { modulesFor } from '@/spaces/registry';
import type { SpaceData } from '@/spaces/types';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import type { ToolDef } from '../tool';
import { defineTool } from '../tool';
import { anyObj, arr, bool, enm, num, obj, opt, str } from '../schema';
import { clean, fail, normDate, plural, spaceOf } from '../ctx';

const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const req = { required: true };
const NOTES = F('notes', 'text');

/** Typed loosely: the getters receive a SpaceData. */
type S = any;
const B = (s: S) => s.business as BusinessData | undefined;

const METHODS = v(PAYMENT_METHODS);

/* ================================================================ collections */

export const BUSINESS_COLLECTIONS: CollectionDef[] = [
  {
    name: 'clients',
    label: 'Clients (who pays the business)',
    module: 'clients' as any,
    navParam: 'clientId',
    description: 'Clients with contact details, default hourly rate and payment terms. Invoices, time entries, income and documents reference them. Billed / paid / outstanding totals: biz_report.',
    kind: 'array',
    get: (s: S) => B(s)?.clients,
    draft: (d: S) => d.business?.clients,
    idPrefix: 'cli',
    nameField: 'name',
    fields: [
      F('name', 'string', { ...req, desc: 'contact person or client name' }),
      F('company', 'string'),
      F('email', 'string'),
      F('phone', 'string'),
      F('address', 'text', { desc: 'billing address (printed on invoices)' }),
      F('defaultRate', 'number', { desc: 'hourly rate for time and invoice lines (space currency)' }),
      F('termsDays', 'integer', { desc: 'payment terms in days (overrides the business default)' }),
      F('archived', 'boolean'),
      NOTES,
    ],
  },
  {
    name: 'contractors',
    label: 'Contractors (who the business pays)',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      return items.map((c) => {
        const bal = contractorBalance(b, c.id);
        return { ...c, _owed: bal.owed || undefined, _paid: bal.paid || undefined };
      });
    },
    module: 'contractors' as any,
    navParam: 'contractorId',
    description:
      'Freelancers / contractors with the pay you agreed (rateType + rate; rev_share rate is a percent), payment terms, scope, tax form status (W-9 / W-8BEN / 1099) and dates. Record an agreement on pay with biz_contractor_pay {action:"agree"}; log what you owe or paid with biz_contractor_pay {action:"log"}; generate the contract with biz_generate_document {template:"contractor"}.',
    kind: 'array',
    get: (s: S) => B(s)?.contractors,
    draft: (d: S) => d.business?.contractors,
    idPrefix: 'ctr',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('role', 'string', { suggest: ['Video editor', 'Motion designer', 'Camera operator', 'Sound designer', 'Thumbnail designer', 'Writer', 'Virtual assistant', 'Developer'] }),
      F('company', 'string'),
      F('email', 'string'),
      F('phone', 'string'),
      F('address', 'text'),
      F('rateType', 'enum', { ...req, values: v(RATE_TYPES) }),
      F('rate', 'number', { desc: 'amount per hour / day / project / deliverable; percent for rev_share' }),
      F('rateNote', 'string', { desc: 'what the rate covers, e.g. "per edited 60 s short"' }),
      F('paymentTerms', 'string', { desc: 'e.g. "within 15 days of receipt of an invoice" or "50% upfront"' }),
      F('agreedOn', 'date', { desc: 'date the pay was agreed' }),
      F('scope', 'text', { desc: 'what they do (pre-fills the contractor agreement)' }),
      F('taxForm', 'enum', { values: v(TAX_FORM_STATUSES) }),
      F('startDate', 'date'),
      F('endDate', 'date'),
      F('active', 'boolean'),
      NOTES,
    ],
    defaults: () => ({ rateType: 'hourly', active: true, taxForm: 'none' }),
  },
  {
    name: 'contractor_payments',
    label: 'Contractor pay log',
    module: 'contractors' as any,
    navParam: 'contractorId',
    description:
      'What the business owes or paid each contractor (their invoices and your payments). Owed + scheduled = balance owed. Status changes have side effects (paid creates a Contractors expense), so change status only with biz_contractor_pay {action:"status"}; add_items creates "owed" entries. Deleting a contractor with delete_items keeps their pay log entries without a contractor — delete those too.',
    kind: 'array',
    get: (s: S) => B(s)?.payments,
    draft: (d: S) => d.business?.payments,
    idPrefix: 'cpay',
    nameField: 'description',
    fields: [
      F('contractorId', 'ref', { ...req, ref: 'contractors', desc: 'contractor id or name' }),
      F('date', 'date', { ...req, desc: 'invoice / due date' }),
      F('amount', 'number', req),
      F('description', 'string', { desc: 'what it is for' }),
      F('reference', 'string', { desc: 'the contractor’s invoice number' }),
      F('method', 'enum', { values: METHODS }),
      F('status', 'enum', { values: v(PAYMENT_STATUSES), readOnly: true, desc: 'owed | scheduled | paid — change with biz_contractor_pay' }),
      F('paidDate', 'date', { readOnly: true }),
      F('expenseId', 'ref', { ref: 'expenses', readOnly: true, desc: 'the expense recorded when it was paid' }),
      F('bizProjectId', 'ref', { ref: 'biz_projects', desc: 'business project (biz_projects id or name)' }),
    ],
    defaults: () => ({ status: 'owed', date: todayISO() }),
  },
  {
    name: 'income_streams',
    label: 'Income streams',
    module: 'income' as any,
    navParam: 'tab',
    description: 'Where money comes from (client work, products / courses, sponsorships, royalties / licensing, salary / equity, other) with the expected monthly amount. Income entries and invoices can point to a stream.',
    kind: 'array',
    get: (s: S) => B(s)?.streams,
    draft: (d: S) => d.business?.streams,
    idPrefix: 'str',
    nameField: 'name',
    fields: [F('name', 'string', req), F('type', 'enum', { ...req, values: v(STREAM_TYPES) }), F('expectedMonthly', 'number', { desc: 'planned income per month' }), F('active', 'boolean'), NOTES],
    defaults: () => ({ type: 'client_work', active: true }),
  },
  {
    name: 'income',
    label: 'Income entries (money received)',
    module: 'income' as any,
    description:
      'Money received that is not (or not only) an invoice: sales, sponsorship payouts, AdSense, royalties, distributions. Invoices marked paid with biz_invoice create a linked entry automatically (invoiceId) — never add another entry for a paid invoice. Paid invoices without an entry still count, so income is never double counted.',
    kind: 'array',
    get: (s: S) => B(s)?.income,
    draft: (d: S) => d.business?.income,
    idPrefix: 'inc',
    nameField: 'description',
    fields: [
      F('date', 'date', req),
      F('amount', 'number', req),
      F('description', 'string'),
      F('streamId', 'ref', { ref: 'income_streams' }),
      F('clientId', 'ref', { ref: 'clients' }),
      F('method', 'enum', { values: METHODS, desc: 'how it was received' }),
      F('invoiceId', 'ref', { ref: 'invoices', readOnly: true, desc: 'set when created by a paid invoice' }),
      F('bizProjectId', 'ref', { ref: 'biz_projects', desc: 'business project (biz_projects id or name); entries of paid invoices use the invoice’s project' }),
      NOTES,
    ],
    defaults: () => ({ date: todayISO() }),
  },
  {
    name: 'invoices',
    label: 'Invoices (sent to clients)',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      const today = todayISO();
      return items.map((inv) => ({ ...inv, _total: invoiceTotals(inv).total, _status: invoiceStatus(inv, today), _client: clientLabel(b, inv.clientId) || undefined }));
    },
    module: 'invoices' as any,
    navParam: 'invoiceId',
    description:
      'Numbered invoices (prefix + sequence from business.settings). Status draft → sent → paid (overdue is computed from dueDate) or void. Create, change status (paid creates income), add lines or unbilled time and read totals with biz_invoice. update_items may change dates, client, reference, notes, payment instructions, discount and tax %; line items are the invoice_lines collection.',
    kind: 'array',
    get: (s: S) => B(s)?.invoices,
    draft: (d: S) => d.business?.invoices,
    idPrefix: 'inv',
    nameField: 'number',
    addVia: 'Create invoices with biz_invoice {action:"create", client, lines:[{description, qty, unitPrice}], includeUnbilledTime} — it assigns the next number, due date and totals.',
    fields: [
      F('number', 'string', { desc: 'invoice number, e.g. "INV-0007"' }),
      F('clientId', 'ref', { ref: 'clients' }),
      F('streamId', 'ref', { ref: 'income_streams' }),
      F('title', 'string', { desc: 'reference / project / PO shown under the number' }),
      F('issueDate', 'date'),
      F('dueDate', 'date'),
      F('status', 'enum', { values: ['draft', 'sent', 'paid', 'void'], readOnly: true, desc: 'change with biz_invoice {action:"status"}' }),
      F('sentDate', 'date'),
      F('paidDate', 'date', { readOnly: true }),
      F('method', 'enum', { values: METHODS, desc: 'how it was paid' }),
      F('discount', 'number', { desc: 'fixed discount amount' }),
      F('taxPct', 'number', { desc: 'tax / VAT percent applied after the discount' }),
      F('notes', 'text'),
      F('paymentInstructions', 'text'),
      F('projectId', 'string', { desc: 'linked production project id (list_projects)' }),
      F('spaceId', 'string', { desc: 'linked Marketing Space id (list_spaces)' }),
      F('bizProjectId', 'ref', { ref: 'biz_projects', desc: 'business project (biz_projects id or name)' }),
    ],
  },
  {
    name: 'invoice_lines',
    label: 'Invoice line items',
    module: 'invoices' as any,
    description: 'Nested in invoices: pass parentId = invoice id or number. Amount = qty × unitPrice. To bill time entries use biz_invoice {action:"add_time"} (marks them invoiced).',
    kind: 'array',
    parent: 'invoices',
    get: (s: S, pid?: string) => B(s)?.invoices.find((i) => i.id === pid)?.lines,
    draft: (d: S, pid?: string) => d.business?.invoices.find((i: Invoice) => i.id === pid)?.lines,
    idPrefix: 'invl',
    nameField: 'description',
    fields: [F('description', 'text', req), F('qty', 'number'), F('unitPrice', 'number', { desc: 'price per unit (space currency)' }), F('timeEntryIds', 'string[]', { readOnly: true })],
    defaults: () => ({ qty: 1, unitPrice: 0 }),
  },
  {
    name: 'expenses',
    label: 'Expenses',
    module: 'expenses' as any,
    navParam: 'expenseId',
    description:
      `Business costs. category is a category id: ${DEFAULT_EXPENSE_CATEGORIES.map((c) => c.id).join(', ')} (plus any the user added — see get_fields business.settings or describe in the app). Received invoices from vendors / contractors are expenses too (reference = their invoice number). recurring marks subscriptions & bills. Contractor payments marked paid create their expense automatically — do not add a second one.`,
    kind: 'array',
    get: (s: S) => B(s)?.expenses,
    draft: (d: S) => d.business?.expenses,
    idPrefix: 'exp',
    nameField: 'vendor',
    hideInList: ['receipts'],
    fields: [
      F('date', 'date', req),
      F('amount', 'number', req),
      F('vendor', 'string'),
      F('description', 'string'),
      F('category', 'string', { ...req, suggest: DEFAULT_EXPENSE_CATEGORIES.map((c) => c.id), desc: 'expense category id' }),
      F('method', 'enum', { values: METHODS }),
      F('deductible', 'boolean', { desc: 'tax-deductible business expense' }),
      F('recurring', 'enum', { values: ['monthly', 'yearly'] }),
      F('reference', 'string', { desc: 'receipt / vendor invoice number' }),
      F('contractorId', 'ref', { ref: 'contractors' }),
      F('projectId', 'string', { desc: 'linked production project id' }),
      F('spaceId', 'string', { desc: 'linked Marketing Space id' }),
      F('paymentId', 'ref', { ref: 'contractor_payments', readOnly: true, desc: 'set when created by a paid contractor payment' }),
      F('bizProjectId', 'ref', { ref: 'biz_projects', desc: 'business project (biz_projects id or name)' }),
      F('initiativeId', 'string', { desc: 'growth initiative id it was spent on (counts toward the initiative’s spend)' }),
      NOTES,
    ],
    defaults: () => ({ date: todayISO(), category: 'other', deductible: true }),
  },
  {
    name: 'time_entries',
    label: 'Time entries',
    module: 'time' as any,
    navParam: 'entryId',
    description:
      'Logged work time. minutes is the duration (compute it from start / end when you have them). rate empty = the client’s rate, then the business default hourly rate. Billable entries without invoiceId are unbilled — bill them with biz_invoice. The running timer is biz_timer.',
    kind: 'array',
    get: (s: S) => B(s)?.time,
    draft: (d: S) => d.business?.time,
    idPrefix: 'time',
    nameField: 'description',
    fields: [
      F('date', 'date', req),
      F('minutes', 'integer', { ...req, desc: 'duration in minutes' }),
      F('start', 'time'),
      F('end', 'time'),
      F('clientId', 'ref', { ref: 'clients' }),
      F('description', 'string'),
      F('billable', 'boolean'),
      F('rate', 'number', { desc: 'hourly rate override' }),
      F('invoiceId', 'ref', { ref: 'invoices', readOnly: true }),
      F('projectId', 'string', { desc: 'linked production project id' }),
      F('bizProjectId', 'ref', { ref: 'biz_projects', desc: 'business project (biz_projects id or name)' }),
    ],
    defaults: () => ({ date: todayISO(), billable: true }),
  },
  {
    name: 'legal_docs',
    label: 'Legal documents',
    module: 'legal' as any,
    navParam: 'docId',
    description:
      'Generated agreements (contractor agreement, mutual NDA, SOW, client services agreement, collaboration / revenue share, content & likeness release, sponsorship / brand deal, payment plan letter) with status draft / sent / signed / expired. Create or change their content with biz_generate_document; update_items may change title, status, dates and notes. Templates are not legal advice — tell the user to have a lawyer review before signing.',
    kind: 'array',
    get: (s: S) => B(s)?.docs,
    draft: (d: S) => d.business?.docs,
    idPrefix: 'doc',
    nameField: 'title',
    hideInList: ['vars'],
    addVia: 'Generate documents with biz_generate_document {template, party, variables}.',
    fields: [
      F('title', 'string'),
      F('status', 'enum', { values: v(LEGAL_STATUSES) }),
      F('sentDate', 'date'),
      F('signedDate', 'date'),
      F('expiresDate', 'date', { desc: 'agreement end / expiry' }),
      F('templateId', 'string', { readOnly: true }),
      F('partyKind', 'string', { readOnly: true }),
      F('party', 'object', { keys: ['name', 'company', 'address', 'email', 'title'], desc: 'the other party as printed (replaces the whole object)' }),
      F('vars', 'object', { readOnly: true, desc: 'template values — change with biz_generate_document {action:"update"}' }),
      F('bizProjectId', 'ref', { ref: 'biz_projects', desc: 'business project (biz_projects id or name)' }),
      NOTES,
    ],
  },
];

/* ================================================================ single fields */

export const BUSINESS_SINGLETONS: SingletonDef[] = [
  {
    path: 'business.profile',
    label: 'Business profile (legal name, signer, contact, address, jurisdiction, tax id) — used on invoices and documents',
    get: (s: S) => bizOf(s).profile,
    draft: (d: S) => d.business.profile,
    fields: [
      F('type', 'enum', { values: v(BUSINESS_TYPES) }),
      F('legalName', 'string', { desc: 'registered name, e.g. "Northlight Media LLC"' }),
      F('entityType', 'string', { desc: 'e.g. "limited liability company", "sole proprietorship"' }),
      F('ownerName', 'string', { desc: 'who signs documents' }),
      F('signerTitle', 'string', { desc: 'e.g. Owner, Managing Member' }),
      F('role', 'string', { desc: 'the user’s role when the business is not theirs alone' }),
      F('email', 'string'),
      F('phone', 'string'),
      F('website', 'string'),
      F('address', 'text'),
      F('jurisdiction', 'string', { desc: 'state / country of formation; default governing law' }),
      F('taxId', 'string', { desc: 'EIN / VAT number (printed on invoices)' }),
    ],
  },
  {
    path: 'business.settings',
    label: 'Invoice & time settings (number prefix and next number, payment terms, tax %, hourly rate, payment instructions, governing law)',
    get: (s: S) => bizOf(s).settings,
    draft: (d: S) => d.business.settings,
    fields: [
      F('invoicePrefix', 'string', { desc: 'e.g. "INV-"' }),
      F('nextInvoiceNumber', 'integer', { desc: 'used when higher than the last invoice number' }),
      F('paymentTermsDays', 'integer', { desc: 'days until an invoice is due' }),
      F('taxPct', 'number', { desc: 'default tax / VAT % on new invoices' }),
      F('hourlyRate', 'number', { desc: 'default hourly rate' }),
      F('paymentInstructions', 'text', { desc: 'bank details / payment links printed on invoices' }),
      F('invoiceNotes', 'text', { desc: 'default note on new invoices' }),
      F('governingLaw', 'string', { desc: 'default governing law for documents, e.g. "the State of New York"' }),
    ],
  },
  {
    path: 'meta',
    label: 'Business space info (name in the app, description, colour, logo)',
    get: (s: S) => s.meta,
    draft: (d: S) => d.meta,
    fields: [F('title', 'string', req), F('description', 'text'), F('color', 'color'), F('emoji', 'string'), F('logo', 'image', { desc: 'asset name (printed on invoices)' }), F('tags', 'string[]')],
  },
  {
    path: 'settings',
    label: 'Formats: currency, dates, paper',
    get: (s: S) => s.settings,
    draft: (d: S) => d.settings,
    fields: [
      F('currency', 'string', { desc: "ISO 4217 code, e.g. 'USD', 'EUR', 'GBP'" }),
      F('dateFormat', 'enum', { values: ['MDY', 'DMY', 'YMD'] }),
      F('timeFormat', 'enum', { values: ['12h', '24h'] }),
      F('paperSize', 'enum', { values: ['letter', 'a4'] }),
      F('weekStartsMonday', 'boolean'),
    ],
  },
];

/* ================================================================ helpers */

function biz(): { s: SpaceData; b: BusinessData } {
  const s = spaceOf('business');
  return { s, b: bizOf(s) };
}

const norm = (x: unknown) => String(x ?? '').trim().toLowerCase();

function findClient(b: BusinessData, ref: string | undefined, required = true) {
  if (!ref?.trim()) {
    if (required) fail('Pass client (id, name or company).');
    return undefined;
  }
  const r = norm(ref);
  const hits = b.clients.filter((c) => c.id === ref || norm(c.name) === r || norm(c.company) === r);
  const hit = hits[0] ?? b.clients.find((c) => norm(clientName(c)).includes(r) || norm(c.company).includes(r));
  if (hits.length > 1) fail(`"${ref}" matches ${hits.length} clients; pass the id (${hits.map((h) => h.id).join(', ')}).`);
  if (!hit) fail(`No client "${ref}". Clients: ${b.clients.map((c) => `${clientName(c)} (${c.id})`).join(', ') || 'none yet — add one with add_items {collection:"clients"}'}.`);
  return hit;
}

function findContractor(b: BusinessData, ref: string | undefined) {
  if (!ref?.trim()) fail('Pass contractor (id or name).');
  const r = norm(ref);
  const hit = b.contractors.find((c) => c.id === ref) ?? b.contractors.find((c) => norm(c.name) === r) ?? b.contractors.find((c) => norm(c.name).includes(r));
  if (!hit) fail(`No contractor "${ref}". Contractors: ${b.contractors.map((c) => `${c.name} (${c.id})`).join(', ') || 'none yet — add one with add_items {collection:"contractors"}'}.`);
  return hit;
}

function findBizProject(b: BusinessData, ref: string | undefined) {
  if (!ref?.trim()) return undefined;
  const r = norm(ref);
  const hit = b.projects.find((x) => x.id === ref) ?? b.projects.find((x) => norm(x.name) === r) ?? b.projects.find((x) => norm(x.name).includes(r));
  if (!hit) fail(`No business project "${ref}". Projects: ${b.projects.map((x) => `${x.name} (${x.id})`).join(', ') || 'none yet — add one with add_items {collection:"biz_projects"}'}.`);
  return hit;
}

function findStream(b: BusinessData, ref: string | undefined) {
  if (!ref?.trim()) return undefined;
  const r = norm(ref);
  const hit = b.streams.find((x) => x.id === ref) ?? b.streams.find((x) => norm(x.name) === r) ?? b.streams.find((x) => norm(x.name).includes(r));
  if (!hit) fail(`No income stream "${ref}". Streams: ${b.streams.map((x) => x.name).join(', ') || 'none'}.`);
  return hit;
}

function requireInvoice(b: BusinessData, ref: string | undefined): Invoice {
  if (!ref?.trim()) fail('Pass invoice (id or number).');
  const hit = findInvoice(b, ref);
  if (!hit) fail(`No invoice "${ref}". Invoices: ${b.invoices.map((i) => i.number).join(', ') || 'none yet'}.`);
  return hit;
}

function fmtOf(s: SpaceData) {
  return makeFormatters(s.settings as any);
}

function invoiceOut(b: BusinessData, inv: Invoice, today: string) {
  const t = invoiceTotals(inv);
  return clean({
    id: inv.id,
    number: inv.number,
    client: clientLabel(b, inv.clientId) || undefined,
    clientId: inv.clientId,
    title: inv.title,
    status: invoiceStatus(inv, today),
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    sentDate: inv.sentDate,
    paidDate: inv.paidDate,
    stream: b.streams.find((x) => x.id === inv.streamId)?.name,
    project: inv.bizProjectId ? b.projects.find((x) => x.id === inv.bizProjectId)?.name : undefined,
    bizProjectId: inv.bizProjectId,
    lines: inv.lines.map((l) => clean({ id: l.id, description: l.description, qty: l.qty, unitPrice: l.unitPrice, amount: round2(l.qty * l.unitPrice), timeEntries: l.timeEntryIds?.length })),
    subtotal: t.subtotal,
    discount: t.discount || undefined,
    taxPct: inv.taxPct,
    tax: t.tax || undefined,
    total: t.total,
    files: inv.attachments?.length || undefined,
  });
}

const lineSchema = obj({ description: str(), qty: opt(num('default 1')), unitPrice: num('price per unit') });

/* ================================================================ tools */

export const businessTools: ToolDef[] = [
  defineTool({
    name: 'create_business',
    title: 'Create a business (Business Management)',
    description:
      'Creates and opens a new Business Management space for a side hustle, freelance practice, company, creator business, a business the user is part of, or any income stream. Optionally fills the business profile (used on invoices and legal documents) and links Marketing Spaces and production projects (ids or titles). Afterwards use add_items (clients, contractors, income_streams, expenses, time_entries) and the biz_* tools.',
    global: true,
    noStep: true,
    input: obj({
      title: str('name shown in the app, e.g. "Northlight Studio"'),
      type: enm(v(BUSINESS_TYPES), 'side_hustle | freelance | company | creator | partner (a business the user is part of) | other'),
      description: opt(str('what it does / how it makes money')),
      legalName: opt(str('registered name for invoices and documents')),
      ownerName: opt(str('who signs documents')),
      signerTitle: opt(str()),
      role: opt(str('the user’s role when it isn’t theirs alone')),
      email: opt(str()),
      phone: opt(str()),
      address: opt(str()),
      jurisdiction: opt(str('state / country of formation')),
      taxId: opt(str()),
      color: opt(str('#rrggbb')),
      marketingSpaces: opt(arr(str(), 'Marketing Spaces to link (ids or titles)')),
      projects: opt(arr(str(), 'production projects to link (ids or titles)')),
    }),
    async run(a: Record<string, any>) {
      const spaces = (await backend.listSpaces()).filter((x) => (x.kind ?? 'marketing') === 'marketing');
      const projects = await backend.listProjects();
      const pick = <T extends { id: string; title: string }>(list: T[], refs: string[] | undefined, what: string) =>
        (refs ?? []).map((r) => {
          const hit = list.find((x) => x.id === r) ?? list.find((x) => norm(x.title) === norm(r)) ?? list.find((x) => norm(x.title).includes(norm(r)));
          if (!hit) fail(`No ${what} "${r}". ${what === 'Marketing Space' ? 'list_spaces {kind:"marketing"}' : 'list_projects'} shows them.`);
          return hit.id;
        });
      const spaceIds = pick(spaces, a.marketingSpaces, 'Marketing Space');
      const projectIds = pick(projects, a.projects, 'project');
      const t = BUSINESS_TYPES.find((x) => x.value === a.type)!;
      const profile = clean({ type: a.type, legalName: a.legalName, ownerName: a.ownerName, signerTitle: a.signerTitle, role: a.role, email: a.email, phone: a.phone, address: a.address, jurisdiction: a.jurisdiction, taxId: a.taxId });
      const s = await createSpaceAndOpen({ title: a.title, kind: 'business', type: 'business', description: a.description ?? '', color: a.color, emoji: t.emoji, spaceIds, projectIds, kindData: { profile } });
      if (!s) fail('Could not create the business.');
      return {
        data: { id: s.id, title: s.meta.title, modules: modulesFor('business').map((m) => m.id), linkedMarketingSpaces: spaceIds.length, linkedProjects: projectIds.length, next: 'Add clients / contractors / income_streams with add_items, set business.settings (invoicePrefix, paymentTermsDays, hourlyRate, paymentInstructions) with set_fields.' },
        summary: `Created the business “${s.meta.title}”`,
      };
    },
  }),

  defineTool({
    name: 'biz_invoice',
    title: 'Create, update and track invoices',
    description:
      'Invoices of the open business. Actions: "list" (all invoices with status and totals); "get" (one invoice with lines and totals); "create" (client + lines [{description, qty, unitPrice}] and/or includeUnbilledTime: bills the client’s billable, not-yet-invoiced time entries and marks them invoiced; gets the next number, issue date today and due date from payment terms; optional status "sent"); "update" (dates, client, title, discount, taxPct, notes, paymentInstructions, stream; addLines; removeLineIds); "add_time" (bill unbilled time of the invoice’s client, or timeEntryIds); "status" (draft | sent | paid | void; paid records the payment date + method and creates the income entry, un-paying removes it). Overdue is computed: a sent invoice past its due date.',
    global: true,
    input: obj({
      action: enm(['list', 'get', 'create', 'update', 'add_time', 'status'] as const),
      invoice: opt(str('invoice id or number (get / update / add_time / status)')),
      client: opt(str('client id, name or company (create; update to change)')),
      project: opt(str('business project id or name (create / update): links the invoice to it; on create the client and title default to the project’s')),
      title: opt(str('reference / project / PO shown on the invoice')),
      issueDate: opt(str('YYYY-MM-DD (default today)')),
      dueDate: opt(str('YYYY-MM-DD (default issue date + payment terms)')),
      lines: opt(arr(lineSchema, 'create: line items')),
      addLines: opt(arr(lineSchema, 'update: line items to append')),
      removeLineIds: opt(arr(str(), 'update: line ids to remove (billed time becomes unbilled again)')),
      includeUnbilledTime: opt(bool('create: also bill the client’s unbilled billable time')),
      timeEntryIds: opt(arr(str(), 'add_time: only these time entries')),
      discount: opt(num('fixed discount amount')),
      taxPct: opt(num('tax / VAT %')),
      notes: opt(str()),
      paymentInstructions: opt(str()),
      stream: opt(str('income stream id or name')),
      status: opt(enm(['draft', 'sent', 'paid', 'void'] as const, 'create (optional) / status')),
      date: opt(str('status: sent / paid date YYYY-MM-DD (default today)')),
      method: opt(enm(METHODS as PaymentMethod[], 'status paid: how it was paid')),
      filter: opt(enm(['all', 'draft', 'open', 'overdue', 'paid', 'void'] as const, 'list: which invoices (default all)')),
    }),
    run(a: Record<string, any>) {
      const { s, b } = biz();
      const today = todayISO();
      const fmt = fmtOf(s);
      const fdate = (x: string) => fmt.dateShort(x);
      if (a.action === 'list') {
        const f = a.filter ?? 'all';
        const list = b.invoices.filter((i) => {
          const st = invoiceStatus(i, today);
          return f === 'all' || st === f || (f === 'open' && (st === 'sent' || st === 'overdue'));
        });
        const ar = arAging(b, today);
        return { data: { count: list.length, outstanding: ar.total, overdue: ar.overdue, invoices: list.map((i) => clean({ id: i.id, number: i.number, client: clientLabel(b, i.clientId) || undefined, title: i.title, status: invoiceStatus(i, today), issueDate: i.issueDate, dueDate: i.dueDate, paidDate: i.paidDate, total: invoiceTotals(i).total })) } };
      }
      if (a.action === 'get') return { data: invoiceOut(b, requireInvoice(b, a.invoice), today) };

      const stream = findStream(b, a.stream);
      const mkLines = (rows?: { description: string; qty?: number; unitPrice: number }[]): InvoiceLine[] => (rows ?? []).map((r) => makeLine({ description: r.description, qty: r.qty ?? 1, unitPrice: r.unitPrice }));

      const bproj = findBizProject(b, a.project);
      if (a.action === 'create') {
        const client = findClient(b, a.client, false) ?? (bproj?.clientId ? b.clients.find((c) => c.id === bproj.clientId) : undefined);
        const issue = normDate(a.issueDate, 'issueDate') ?? today;
        const inv = draftInvoice(b, clean({ clientId: client?.id, bizProjectId: bproj?.id, title: a.title ?? bproj?.name, issueDate: issue, streamId: stream?.id, discount: a.discount, notes: a.notes, paymentInstructions: a.paymentInstructions }) as Partial<Invoice>);
        if (a.dueDate) inv.dueDate = normDate(a.dueDate, 'dueDate');
        if (a.taxPct != null) inv.taxPct = a.taxPct || undefined;
        inv.lines = mkLines(a.lines);
        let billed: TimeEntry[] = [];
        if (a.includeUnbilledTime) {
          billed = unbilledEntries(b, client?.id).filter((e) => (client ? true : !e.clientId));
          inv.lines.push(...linesForTime(b, billed, fdate));
        }
        if (!inv.lines.length) fail('An invoice needs lines (or includeUnbilledTime with unbilled time for the client).');
        bizUpdate((d) => {
          d.invoices.push(inv as Draft<Invoice>);
          const ids = new Set(billed.map((e) => e.id));
          for (const t of d.time) if (ids.has(t.id)) t.invoiceId = inv.id;
          if (a.status && a.status !== 'draft') applyInvoiceStatus(d, inv.id, a.status as InvoiceStatus, normDate(a.date, 'date') ?? today, a.method);
        });
        const out = bizOf(spaceOf('business')).invoices.find((x) => x.id === inv.id)!;
        return { data: { ...invoiceOut(bizOf(spaceOf('business')), out, today), billedTimeEntries: billed.length || undefined }, summary: `Created invoice ${inv.number} (${fmt.money(invoiceTotals(out).total)})` };
      }

      const inv = requireInvoice(b, a.invoice);
      if (a.action === 'status') {
        if (!a.status) fail('Pass status: draft | sent | paid | void.');
        const date = normDate(a.date, 'date') ?? today;
        bizUpdate((d) => applyInvoiceStatus(d, inv.id, a.status as InvoiceStatus, date, a.method));
        const after = bizOf(spaceOf('business'));
        return { data: invoiceOut(after, after.invoices.find((x) => x.id === inv.id)!, today), summary: `Invoice ${inv.number} → ${a.status}` };
      }
      if (a.action === 'add_time') {
        const pool = unbilledEntries(b, inv.clientId).filter((e) => (inv.clientId ? true : !e.clientId));
        const entries = a.timeEntryIds?.length ? pool.filter((e) => a.timeEntryIds.includes(e.id)) : pool;
        if (a.timeEntryIds?.length && entries.length < a.timeEntryIds.length) fail(`Some time entries are not unbilled billable time of ${clientLabel(b, inv.clientId) || 'this invoice’s client'}: ${a.timeEntryIds.filter((id: string) => !entries.some((e) => e.id === id)).join(', ')}`);
        if (!entries.length) fail(`No unbilled billable time for ${clientLabel(b, inv.clientId) || 'entries without a client'}.`);
        const lines = linesForTime(b, entries, fdate);
        bizUpdate((d) => {
          const target = d.invoices.find((x) => x.id === inv.id)!;
          target.lines.push(...(lines as Draft<InvoiceLine>[]));
          const ids = new Set(entries.map((e) => e.id));
          for (const t of d.time) if (ids.has(t.id)) t.invoiceId = inv.id;
          syncPaidInvoice(d, inv.id);
        });
        const after = bizOf(spaceOf('business'));
        return { data: invoiceOut(after, after.invoices.find((x) => x.id === inv.id)!, today), summary: `Added ${plural(entries.length, 'time entry', 'time entries')} to ${inv.number}` };
      }
      // update
      const client = a.client ? findClient(b, a.client) : undefined;
      const add = mkLines(a.addLines);
      const removeIds = new Set<string>(a.removeLineIds ?? []);
      for (const id of removeIds) if (!inv.lines.some((l) => l.id === id)) fail(`Invoice ${inv.number} has no line "${id}" (lines: ${inv.lines.map((l) => l.id).join(', ')}).`);
      bizUpdate((d) => {
        const x = d.invoices.find((i) => i.id === inv.id)!;
        if (client) x.clientId = client.id;
        if (bproj) x.bizProjectId = bproj.id;
        if (a.title !== undefined) x.title = a.title || undefined;
        if (a.issueDate) x.issueDate = normDate(a.issueDate, 'issueDate')!;
        if (a.dueDate) x.dueDate = normDate(a.dueDate, 'dueDate');
        if (a.discount !== undefined) x.discount = a.discount || undefined;
        if (a.taxPct !== undefined) x.taxPct = a.taxPct || undefined;
        if (a.notes !== undefined) x.notes = a.notes || undefined;
        if (a.paymentInstructions !== undefined) x.paymentInstructions = a.paymentInstructions || undefined;
        if (stream) x.streamId = stream.id;
        if (removeIds.size) {
          const unlink = new Set(x.lines.filter((l) => removeIds.has(l.id)).flatMap((l) => l.timeEntryIds ?? []));
          x.lines = x.lines.filter((l) => !removeIds.has(l.id));
          for (const t of d.time) if (unlink.has(t.id) && t.invoiceId === inv.id) delete t.invoiceId;
        }
        x.lines.push(...(add as Draft<InvoiceLine>[]));
        syncPaidInvoice(d, inv.id);
        const inc = d.income.find((e) => e.invoiceId === inv.id);
        if (inc && client) inc.clientId = client.id;
      });
      const after = bizOf(spaceOf('business'));
      return { data: invoiceOut(after, after.invoices.find((x) => x.id === inv.id)!, today), summary: `Updated invoice ${inv.number}` };
    },
  }),

  defineTool({
    name: 'biz_contractor_pay',
    title: 'Agree on pay and log contractor payments',
    description:
      'Contractor money in the open business. "agree": record the pay agreed with a contractor (rateType hourly | day | fixed | deliverable | rev_share, rate — percent for rev_share — rateNote, paymentTerms, scope; sets agreedOn) — then generate the contract with biz_generate_document {template:"contractor", party:{kind:"contractor", id}}. "log": add a pay log entry (what you owe — e.g. their invoice — or already paid). "status": set payments to owed | scheduled | paid (paid records a Contractors expense on the paid date; un-paying removes it). Balance owed = owed + scheduled.',
    global: true,
    input: obj({
      action: enm(['agree', 'log', 'status'] as const),
      contractor: opt(str('contractor id or name (agree / log)')),
      rateType: opt(enm(v(RATE_TYPES) as RateType[])),
      rate: opt(num('amount, or percent for rev_share')),
      rateNote: opt(str('what the rate covers')),
      paymentTerms: opt(str('e.g. "within 15 days of receipt of an invoice"')),
      scope: opt(str('what they will do')),
      agreedOn: opt(str('YYYY-MM-DD (default today)')),
      amount: opt(num('log: amount')),
      description: opt(str('log: what it is for')),
      date: opt(str('log: date of their invoice / due date; status paid: payment date (default today)')),
      reference: opt(str('log: their invoice number')),
      method: opt(enm(METHODS as PaymentMethod[])),
      status: opt(enm(v(PAYMENT_STATUSES) as PaymentStatus[], 'log (default owed) / status')),
      paymentIds: opt(arr(str(), 'status: pay log entry ids')),
    }),
    run(a: Record<string, any>) {
      const { s, b } = biz();
      const fmt = fmtOf(s);
      const today = todayISO();
      if (a.action === 'agree') {
        const c = findContractor(b, a.contractor);
        if (a.rate == null && !a.rateType && !a.paymentTerms && !a.scope) fail('Pass at least rate / rateType / paymentTerms / scope.');
        bizUpdate((d) => {
          const x = d.contractors.find((k) => k.id === c.id)!;
          if (a.rateType) x.rateType = a.rateType;
          if (a.rate != null) x.rate = a.rate;
          if (a.rateNote !== undefined) x.rateNote = a.rateNote || undefined;
          if (a.paymentTerms !== undefined) x.paymentTerms = a.paymentTerms || undefined;
          if (a.scope !== undefined) x.scope = a.scope || undefined;
          x.agreedOn = normDate(a.agreedOn, 'agreedOn') ?? today;
          x.active = true;
        });
        const x = bizOf(spaceOf('business')).contractors.find((k) => k.id === c.id)!;
        return {
          data: clean({ contractor: x.name, rateType: x.rateType, rate: x.rate, rateNote: x.rateNote, paymentTerms: x.paymentTerms, agreedOn: x.agreedOn, next: `biz_generate_document {template:"contractor", party:{kind:"contractor", id:"${x.id}"}} writes the Independent Contractor Agreement with these terms.` }),
          summary: `Recorded the agreed pay with ${x.name}`,
        };
      }
      if (a.action === 'log') {
        const c = findContractor(b, a.contractor);
        if (a.amount == null) fail('Pass amount.');
        const p: ContractorPayment = makePayment(c.id, clean({ amount: a.amount, description: a.description, reference: a.reference, method: a.method, date: normDate(a.date, 'date') ?? today }) as Partial<ContractorPayment>);
        bizUpdate((d) => {
          d.payments.unshift(p as Draft<ContractorPayment>);
          if (a.status && a.status !== 'owed') applyPaymentStatus(d, p.id, a.status, a.status === 'paid' ? normDate(a.date, 'date') ?? today : undefined);
        });
        const bal = contractorBalance(bizOf(spaceOf('business')), c.id);
        return { data: { id: p.id, contractor: c.name, status: a.status ?? 'owed', balanceOwed: bal.owed, paidAllTime: bal.paid }, summary: `Logged ${fmt.money(a.amount)} for ${c.name}` };
      }
      // status
      if (!a.status) fail('Pass status: owed | scheduled | paid.');
      const ids: string[] = a.paymentIds ?? [];
      if (!ids.length) fail('Pass paymentIds (list_items {collection:"contractor_payments"} shows them).');
      for (const id of ids) if (!b.payments.some((p) => p.id === id)) fail(`No pay log entry "${id}".`);
      const date = normDate(a.date, 'date') ?? today;
      bizUpdate((d) => {
        for (const id of ids) applyPaymentStatus(d, id, a.status, date);
      });
      const after = bizOf(spaceOf('business'));
      return {
        data: { updated: ids.length, balances: after.contractors.filter((c) => ids.some((id) => after.payments.find((p) => p.id === id)?.contractorId === c.id)).map((c) => ({ contractor: c.name, owed: contractorBalance(after, c.id).owed })) },
        summary: `Marked ${plural(ids.length, 'payment')} ${a.status}`,
      };
    },
  }),

  defineTool({
    name: 'biz_timer',
    title: 'Start / stop the time tracker',
    description:
      'The running timer of the open business (it keeps running when the app is closed). "start" (optional client, description, billable — fails if one is running unless restart:true, which logs the running one first), "stop" (logs a time entry with start / end / minutes and returns it), "discard" (drop the running timer without logging), "status" (running?, elapsed minutes, plus hours today / this week and unbilled value).',
    global: true,
    input: obj({
      action: enm(['start', 'stop', 'status', 'discard'] as const),
      client: opt(str('client id or name')),
      project: opt(str('start: business project id or name (the logged entry is linked to it; its client is used when no client is given)')),
      description: opt(str('what is being worked on')),
      billable: opt(bool('default true')),
      restart: opt(bool('start: stop & log a running timer first')),
    }),
    run(a: Record<string, any>) {
      const { s, b } = biz();
      const fmt = fmtOf(s);
      const today = todayISO();
      const status = () => {
        const bb = bizOf(spaceOf('business'));
        const ws = weekStartOf(today, s.settings.weekStartsMonday);
        const un = unbilledEntries(bb);
        return clean({
          running: !!bb.timer,
          startedAt: bb.timer?.startedAt,
          elapsedMinutes: bb.timer ? timerMinutes(bb.timer) : undefined,
          elapsed: bb.timer ? formatDuration(timerMinutes(bb.timer)) : undefined,
          client: bb.timer?.clientId ? clientLabel(bb, bb.timer.clientId) : undefined,
          description: bb.timer?.description,
          today: formatDuration(minutesIn(bb, { from: today, to: today })),
          thisWeek: formatDuration(minutesIn(bb, { from: ws, to: addDays(ws, 6) })),
          unbilledValue: sumAmount(un.map((e) => ({ amount: entryValue(bb, e) }))),
        });
      };
      if (a.action === 'status') return { data: status() };
      if (a.action === 'discard') {
        if (!b.timer) fail('No timer is running.');
        discardTimer();
        return { data: status(), summary: 'Discarded the running timer' };
      }
      if (a.action === 'stop') {
        if (!b.timer) fail('No timer is running.');
        const e = stopTimer()!;
        return { data: { logged: clean({ id: e.id, date: e.date, start: e.start, end: e.end, minutes: e.minutes, client: clientLabel(bizOf(spaceOf('business')), e.clientId) || undefined, description: e.description, billable: e.billable, value: entryValue(bizOf(spaceOf('business')), e) || undefined }), ...status() }, summary: `Logged ${formatDuration(e.minutes)}` };
      }
      // start
      let logged: TimeEntry | undefined;
      if (b.timer) {
        if (!a.restart) fail(`A timer is already running (${formatDuration(timerMinutes(b.timer))}${b.timer.description ? `: ${b.timer.description}` : ''}). Stop it first or pass restart:true.`);
        logged = stopTimer();
      }
      const tproj = findBizProject(b, a.project);
      const client = a.client ? findClient(b, a.client) : tproj?.clientId ? b.clients.find((c) => c.id === tproj.clientId) : undefined;
      const timer: Parameters<typeof startTimer>[0] = clean({ clientId: client?.id, description: a.description, billable: a.billable !== false, bizProjectId: tproj?.id });
      startTimer(timer);
      return { data: clean({ ...status(), loggedPrevious: logged ? `${formatDuration(logged.minutes)}${logged.description ? ` — ${logged.description}` : ''}` : undefined, rate: client || b.settings.hourlyRate ? fmt.money(entryRate(b, { clientId: client?.id })) : undefined }), summary: `Started the timer${client ? ` for ${clientName(client)}` : ''}` };
    },
  }),

  defineTool({
    name: 'biz_generate_document',
    title: 'Generate a legal document',
    description:
      'Writes personalised, correctly formatted legal documents in the open business from templates: contractor (Independent Contractor Agreement), nda (Mutual NDA), sow (Statement of Work), services (Client Services Agreement), collab (Collaboration / Revenue Share), release (Content & Likeness Release), sponsorship (Sponsorship / Brand Deal), payment_plan (Payment Plan / Invoice Terms letter). "templates" lists each template’s variables (keys, types, options, required). "generate" creates a stored document (status draft) for a party — a client or contractor of the business by id or name (their details, rate and terms are filled in) or someone else by name — with your business profile and the variables you pass (dates YYYY-MM-DD, money as numbers); returns its full text and any missing required values. "update" changes variables / party / status of an existing document (docId). "get" returns the text. Always remind the user these are templates, not legal advice, and to have a lawyer review before signing. Print / PDF: export_pdf with docId "space-biz-legal" and options {doc: id}.',
    global: true,
    input: obj({
      action: opt(enm(['generate', 'update', 'get', 'templates'] as const, 'default generate')),
      template: opt(enm(LEGAL_TEMPLATES.map((t) => t.id) as LegalTemplateId[])),
      party: opt(
        obj({
          kind: enm(['client', 'contractor', 'other'] as const),
          id: opt(str('client / contractor id or name')),
          name: opt(str('name (other parties, or to override)')),
          company: opt(str()),
          address: opt(str()),
          email: opt(str()),
          title: opt(str('their signer’s title')),
        }),
      ),
      variables: opt(anyObj('template values by key (see action "templates"), plus your side: ourName, ourEntity, ourAddress, ourSigner, ourTitle, ourEmail')),
      title: opt(str('document title (default: template name — party)')),
      docId: opt(str('update / get: document id or title')),
      status: opt(enm(v(LEGAL_STATUSES) as LegalDoc['status'][])),
      signedDate: opt(str('YYYY-MM-DD')),
      sentDate: opt(str('YYYY-MM-DD')),
      expiresDate: opt(str('YYYY-MM-DD')),
      includeText: opt(bool('return the full document text (default true)')),
    }),
    run(a: Record<string, any>) {
      const action = a.action ?? 'generate';
      if (action === 'templates') {
        return {
          data: {
            note: 'Templates, not legal advice — have a lawyer review before signing.',
            templates: LEGAL_TEMPLATES.filter((t) => !a.template || t.id === a.template).map((t) => ({
              id: t.id,
              name: t.name,
              about: t.description,
              parties: t.partyKinds,
              roles: t.roles(t.defaultPartyKind),
              variables: t.fields.map((f) => clean({ key: f.key, label: f.label, type: f.type, required: f.required || undefined, options: f.options?.map((o) => o.value), hint: f.hint, example: f.placeholder })),
            })),
          },
        };
      }
      const { s, b } = biz();
      const fmt = fmtOf(s);
      const money = (n: number) => fmt.money(n);
      const allowed = (t: (typeof LEGAL_TEMPLATES)[number]) => new Set([...t.fields.map((f) => f.key), 'ourName', 'ourEntity', 'ourAddress', 'ourSigner', 'ourTitle', 'ourEmail']);
      const coerceVars = (t: (typeof LEGAL_TEMPLATES)[number], vars: Record<string, unknown> | undefined) => {
        const ok = allowed(t);
        const out: Record<string, string | undefined> = {};
        for (const [k, val] of Object.entries(vars ?? {})) {
          if (!ok.has(k)) fail(`${t.id} has no variable "${k}". Variables: ${[...ok].join(', ')}.`);
          const f = t.fields.find((x) => x.key === k);
          if (val == null || val === '') {
            out[k] = undefined;
            continue;
          }
          if (f?.type === 'date') out[k] = normDate(val, k);
          else if (f && (f.type === 'money' || f.type === 'number' || f.type === 'percent')) {
            const n = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.\-]/g, ''));
            if (!isFinite(n)) fail(`${k}: expected a number`);
            out[k] = String(n);
          } else if (f?.type === 'select') {
            const sv = String(val);
            if (!f.options!.some((o) => o.value === sv)) fail(`${k}: use one of ${f.options!.map((o) => o.value).join(', ')}`);
            out[k] = sv;
          } else out[k] = String(val);
        }
        return out;
      };
      const out = (doc: LegalDoc, created: boolean) => {
        const t = TEMPLATE_BY_ID[doc.templateId];
        const built = buildLegal(doc, money);
        return clean({
          id: doc.id,
          title: doc.title,
          template: t.name,
          status: doc.status,
          party: doc.party,
          missing: missingRequired(t, doc.vars, doc.party),
          variables: doc.vars,
          text: a.includeText === false ? undefined : legalText(built),
          pdf: { docId: 'space-biz-legal', options: { doc: doc.id } },
          note: created ? 'Stored in Legal Documents as a draft. Template, not legal advice — have a lawyer review before signing.' : undefined,
        });
      };
      const findDoc = (ref: string | undefined) => {
        if (!ref?.trim()) fail('Pass docId.');
        const r = norm(ref);
        const hit = b.docs.find((d) => d.id === ref) ?? b.docs.find((d) => norm(d.title) === r) ?? b.docs.find((d) => norm(d.title).includes(r));
        if (!hit) fail(`No document "${ref}". Documents: ${b.docs.map((d) => `${d.title} (${d.id})`).join(', ') || 'none yet'}.`);
        return hit;
      };
      if (action === 'get') return { data: out(findDoc(a.docId), false) };

      if (action === 'update') {
        const doc = findDoc(a.docId);
        const t = TEMPLATE_BY_ID[doc.templateId];
        const vars = coerceVars(t, a.variables);
        bizUpdate((d) => {
          const x = d.docs.find((k) => k.id === doc.id)!;
          for (const [k, val] of Object.entries(vars)) {
            if (val === undefined) delete x.vars[k];
            else x.vars[k] = val;
          }
          if (a.party) for (const k of ['name', 'company', 'address', 'email', 'title'] as const) if (a.party[k] !== undefined) (x.party as any)[k] = a.party[k] || undefined;
          if (a.title) x.title = a.title;
          if (a.status) x.status = a.status;
          if (a.sentDate) x.sentDate = normDate(a.sentDate, 'sentDate');
          if (a.signedDate) x.signedDate = normDate(a.signedDate, 'signedDate');
          if (a.expiresDate) x.expiresDate = normDate(a.expiresDate, 'expiresDate');
          if (a.status === 'sent' && !x.sentDate) x.sentDate = todayISO();
          if (a.status === 'signed' && !x.signedDate) x.signedDate = todayISO();
        });
        return { data: out(bizOf(spaceOf('business')).docs.find((k) => k.id === doc.id)!, false), summary: `Updated “${doc.title}”` };
      }

      // generate
      if (!a.template) fail('Pass template (call with action "templates" to see them).');
      const t = TEMPLATE_BY_ID[a.template as LegalTemplateId];
      const kind = (a.party?.kind ?? t.defaultPartyKind) as LegalDoc['partyKind'];
      if (!t.partyKinds.includes(kind)) fail(`${t.name} is made with a ${t.partyKinds.join(' / ')} party.`);
      let partyId: string | undefined;
      if (kind === 'client') partyId = findClient(b, a.party?.id ?? a.party?.name)!.id;
      if (kind === 'contractor') partyId = findContractor(b, a.party?.id ?? a.party?.name).id;
      if (kind === 'other' && !a.party?.name?.trim()) fail('Pass party.name for someone who is not a client or contractor.');
      const doc = draftDoc(b, s.meta.title, t.id, kind, partyId, money, kind === 'other' ? a.party.name.trim() : undefined);
      if (a.party) for (const k of ['name', 'company', 'address', 'email', 'title'] as const) if (a.party[k]) (doc.party as any)[k] = a.party[k];
      for (const [k, val] of Object.entries(coerceVars(t, a.variables))) {
        if (val === undefined) delete doc.vars[k];
        else doc.vars[k] = val;
      }
      if (a.title) doc.title = a.title;
      if (a.status) doc.status = a.status;
      if (a.sentDate) doc.sentDate = normDate(a.sentDate, 'sentDate');
      if (a.signedDate) doc.signedDate = normDate(a.signedDate, 'signedDate');
      if (a.expiresDate) doc.expiresDate = normDate(a.expiresDate, 'expiresDate');
      addDoc(doc);
      return { data: out(doc, true), summary: `Generated “${doc.title}”` };
    },
  }),

  defineTool({
    name: 'biz_report',
    title: 'Business report (P&L, receivables, time, contractors)',
    description:
      'Numbers of the open business for a period (default year to date; or from / to dates): income total, by stream and by client; expenses total and by category (deductible share); profit and margin; month-by-month; receivables aging and overdue invoices; hours (total, billable, unbilled value); contractor balances owed; upcoming due dates (30 days). Cash basis. Printable versions: export_pdf space-biz-pl / space-biz-expenses / space-biz-time / space-biz-contractors with {period}.',
    readOnly: true,
    global: true,
    input: obj({
      period: opt(enm(PERIODS.map((p) => p.value) as PeriodId[])),
      from: opt(str('YYYY-MM-DD (overrides period)')),
      to: opt(str('YYYY-MM-DD')),
      sections: opt(arr(enm(['pl', 'months', 'receivables', 'time', 'contractors', 'upcoming'] as const), 'default: all')),
    }),
    run(a: { period?: PeriodId; from?: string; to?: string; sections?: string[] }) {
      const { s, b } = biz();
      const today = todayISO();
      const base = periodRange(a.period ?? 'ytd', today);
      const r = a.from || a.to ? { from: normDate(a.from, 'from') ?? '0000-01-01', to: normDate(a.to, 'to') ?? today, label: `${a.from ?? 'start'} – ${a.to ?? today}` } : base;
      const want = (k: string) => !a.sections?.length || a.sections.includes(k);
      const pl = profitLoss(b, r);
      const exp = expenseRows(b).filter((x) => inRange(x.date, r));
      const out: Record<string, unknown> = { business: s.meta.title, currency: s.settings.currency, period: { label: r.label, from: r.from === '0000-01-01' ? undefined : r.from, to: r.to } };
      if (want('pl')) {
        out.profitAndLoss = {
          income: pl.income,
          expenses: pl.expenses,
          profit: pl.profit,
          margin: pl.income ? `${Math.round((pl.profit / pl.income) * 100)}%` : undefined,
          incomeByStream: incomeByStream(b, r).map((x) => ({ stream: x.label, amount: x.amount })),
          incomeByClient: incomeByClient(b, r).map((x) => ({ client: x.label, amount: x.amount })),
          expensesByCategory: expensesByCategory(b, r).map((x) => ({ category: x.label, amount: x.amount, entries: x.count })),
          deductibleExpenses: sumAmount(exp.filter((x) => x.deductible)),
        };
      }
      if (want('months')) {
        const inc = incomeRows(b).filter((x) => inRange(x.date, r));
        const months = [...new Set([...inc, ...exp].map((x) => monthKey(x.date)))].sort();
        out.months = months.map((m) => {
          const i = sumAmount(inc.filter((x) => x.date.startsWith(m)));
          const e = sumAmount(exp.filter((x) => x.date.startsWith(m)));
          return { month: m, income: i, expenses: e, profit: round2(i - e) };
        });
      }
      if (want('receivables')) {
        const ar = arAging(b, today);
        out.receivables = {
          outstanding: ar.total,
          open: ar.openCount,
          aging: { notDue: ar.current, '1-30': ar.d1_30, '31-60': ar.d31_60, '61-90': ar.d61_90, '90+': ar.d90 },
          overdue: b.invoices.filter((i) => invoiceStatus(i, today) === 'overdue').map((i) => ({ number: i.number, client: clientLabel(b, i.clientId), total: invoiceTotals(i).total, dueDate: i.dueDate })),
          drafts: b.invoices.filter((i) => i.status === 'draft').map((i) => ({ number: i.number, client: clientLabel(b, i.clientId), total: invoiceTotals(i).total })),
        };
      }
      if (want('time')) {
        const mins = minutesIn(b, r);
        const bill = minutesIn(b, r, (t) => t.billable);
        const un = unbilledEntries(b);
        out.time = {
          hours: round2(mins / 60),
          billableHours: round2(bill / 60),
          billableValue: sumAmount(b.time.filter((t) => inRange(t.date, r)).map((t) => ({ amount: entryValue(b, t) }))),
          unbilledAllTime: { hours: round2(un.reduce((n, e) => n + e.minutes, 0) / 60), value: sumAmount(un.map((e) => ({ amount: entryValue(b, e) }))) },
          timerRunning: b.timer ? formatDuration(timerMinutes(b.timer)) : undefined,
        };
      }
      if (want('contractors')) {
        out.contractors = b.contractors.map((c) => {
          const bal = contractorBalance(b, c.id);
          return clean({ name: c.name, rate: c.rate != null ? `${c.rate}${c.rateType === 'rev_share' ? '%' : ''} ${c.rateType}` : undefined, owed: bal.owed, paidInPeriod: sumAmount(b.payments.filter((p) => p.contractorId === c.id && p.status === 'paid' && inRange(p.paidDate || p.date, r))), taxForm: c.taxForm, agreed: c.agreedOn });
        });
      }
      if (want('upcoming')) out.upcoming = upcoming(b, today, 30).map((d) => clean({ date: d.date, what: d.label, who: d.sub, amount: d.amount, overdue: d.overdue || undefined }));
      out.categoriesInUse = [...new Set(b.expenses.map((e) => e.category))].map((id) => ({ id, label: categoryOf(b, id).label }));
      out.statuses = { invoices: v(INVOICE_STATUSES) };
      return { data: clean(out) };
    },
  }),
];

