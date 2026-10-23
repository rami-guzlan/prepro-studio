/* ==========================================================================
   Business Management data model (space kind 'business'). Stored in
   SpaceData.business. One business space = one side hustle, company, freelance
   practice or income stream you are part of.

   Money rules (see derive.ts):
   - income  = income entries + paid invoices that have no linked income entry
   - expenses = expense entries + paid contractor payments that have no linked expense
   so marking an invoice paid (which creates a linked income entry) or a contractor
   payment paid (which creates a linked expense) never counts twice.

   Conventions as everywhere: stable ids (uid()), dates 'YYYY-MM-DD', times 'HH:MM',
   optional fields may be missing, ids may point to deleted items.
   ========================================================================== */
import type { ID } from '@/types';

export type BusinessType = 'side_hustle' | 'freelance' | 'company' | 'creator' | 'partner' | 'other';

export interface BusinessProfile {
  type: BusinessType;
  /** registered / legal name (documents, invoices) */
  legalName?: string;
  /** owner / signer name */
  ownerName?: string;
  /** role in the business when it isn't yours alone (partner, co-founder, employee with equity …) */
  role?: string;
  /** signer's title on documents, e.g. "Owner", "Managing Member" */
  signerTitle?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  /** state / country of formation, used in legal documents */
  jurisdiction?: string;
  /** EIN / VAT / tax id (printed on invoices only when set) */
  taxId?: string;
  /** e.g. "LLC", "Sole proprietorship", "Ltd" */
  entityType?: string;
}

/** A stored file (receipt, signed copy, sent invoice PDF …) in the space's asset folder. */
export interface BizFile {
  id: ID;
  /** stored asset name */
  file: string;
  fileName: string;
  fileSize?: number;
  /** YYYY-MM-DD */
  addedAt?: string;
}

/* ---------------------------------------------------------------- income */

export type StreamType = 'client_work' | 'product' | 'sponsorship' | 'royalties' | 'salary_equity' | 'other';

export interface IncomeStream {
  id: ID;
  name: string;
  type: StreamType;
  /** expected income per month (plan) */
  expectedMonthly?: number;
  active: boolean;
  notes?: string;
}

export interface IncomeEntry {
  id: ID;
  date: string;
  amount: number;
  description?: string;
  streamId?: ID;
  clientId?: ID;
  /** created when an invoice was marked paid */
  invoiceId?: ID;
  /** where the money came in (bank, PayPal, Stripe …) */
  method?: PaymentMethod;
  /** business project (Projects) */
  bizProjectId?: ID;
  notes?: string;
}

/* ---------------------------------------------------------------- people */

export interface Client {
  id: ID;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  /** default hourly rate for time and invoices */
  defaultRate?: number;
  /** payment terms in days (overrides the business default) */
  termsDays?: number;
  notes?: string;
  archived?: boolean;
}

export type RateType = 'hourly' | 'day' | 'fixed' | 'deliverable' | 'rev_share';

export type TaxFormStatus = 'none' | 'requested' | 'w9' | 'w8ben' | 'needs_1099' | 'filed_1099' | 'not_needed';

export interface Contractor {
  id: ID;
  name: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  rateType: RateType;
  /** amount per hour / day / project / deliverable; percent for revenue share */
  rate?: number;
  /** what the rate covers, e.g. "per edited 60 s short" */
  rateNote?: string;
  /** e.g. "Net 15", "50% upfront, 50% on delivery" */
  paymentTerms?: string;
  /** date the pay was agreed */
  agreedOn?: string;
  /** scope / what was agreed in plain words */
  scope?: string;
  taxForm?: TaxFormStatus;
  startDate?: string;
  endDate?: string;
  active: boolean;
  notes?: string;
}

export type PaymentMethod = 'bank' | 'card' | 'paypal' | 'stripe' | 'wise' | 'venmo' | 'cash' | 'check' | 'crypto' | 'other';

export type PaymentStatus = 'owed' | 'scheduled' | 'paid';

export interface ContractorPayment {
  id: ID;
  contractorId: ID;
  date: string;
  amount: number;
  /** what it's for */
  description?: string;
  method?: PaymentMethod;
  status: PaymentStatus;
  /** date it was paid (status paid) */
  paidDate?: string;
  /** the contractor's own invoice number */
  reference?: string;
  /** created when the payment was marked paid */
  expenseId?: ID;
  /** business project (Projects) */
  bizProjectId?: ID;
  attachments?: BizFile[];
}

/* ---------------------------------------------------------------- invoices */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export interface InvoiceLine {
  id: ID;
  description: string;
  qty: number;
  unitPrice: number;
  /** time entries billed on this line */
  timeEntryIds?: ID[];
}

export interface Invoice {
  id: ID;
  /** e.g. "INV-0007" */
  number: string;
  clientId?: ID;
  streamId?: ID;
  /** short reference / project name shown under the number */
  title?: string;
  issueDate: string;
  dueDate?: string;
  status: InvoiceStatus;
  sentDate?: string;
  paidDate?: string;
  /** how it was paid */
  method?: PaymentMethod;
  lines: InvoiceLine[];
  /** fixed discount amount */
  discount?: number;
  /** tax / VAT percent applied after the discount */
  taxPct?: number;
  notes?: string;
  paymentInstructions?: string;
  /** linked production (PrePro project) */
  projectId?: ID;
  /** linked Marketing Space */
  spaceId?: ID;
  /** business project (Projects) */
  bizProjectId?: ID;
  attachments?: BizFile[];
}

/* ---------------------------------------------------------------- expenses */

export interface ExpenseCategory {
  id: string;
  label: string;
  color: string;
}

export interface Expense {
  id: ID;
  date: string;
  vendor?: string;
  description?: string;
  /** ExpenseCategory id */
  category: string;
  amount: number;
  method?: PaymentMethod;
  deductible?: boolean;
  recurring?: 'monthly' | 'yearly';
  /** linked production project */
  projectId?: ID;
  /** linked Marketing Space */
  spaceId?: ID;
  contractorId?: ID;
  /** created from this contractor payment */
  paymentId?: ID;
  /** business project (Projects) */
  bizProjectId?: ID;
  /** growth initiative (Growth) */
  initiativeId?: ID;
  /** vendor's invoice / receipt number */
  reference?: string;
  receipts?: BizFile[];
  notes?: string;
}

/* ---------------------------------------------------------------- time */

export interface TimeEntry {
  id: ID;
  date: string;
  start?: string;
  end?: string;
  /** duration in minutes */
  minutes: number;
  clientId?: ID;
  description?: string;
  billable: boolean;
  /** hourly rate (default: client rate, then business rate) */
  rate?: number;
  /** billed on this invoice */
  invoiceId?: ID;
  /** linked production (PrePro project) */
  projectId?: ID;
  /** business project (Projects) */
  bizProjectId?: ID;
}

/** The running timer (survives app restarts). */
export interface RunningTimer {
  /** ISO date-time the timer started */
  startedAt: string;
  clientId?: ID;
  description?: string;
  billable?: boolean;
  /** business project the logged entry goes to */
  bizProjectId?: ID;
}

/* ---------------------------------------------------------------- legal */

export type LegalTemplateId = 'contractor' | 'nda' | 'sow' | 'services' | 'collab' | 'release' | 'sponsorship' | 'payment_plan';

export type LegalStatus = 'draft' | 'sent' | 'signed' | 'expired';

export interface LegalParty {
  name: string;
  company?: string;
  address?: string;
  email?: string;
  /** signer title */
  title?: string;
}

export interface LegalDoc {
  id: ID;
  templateId: LegalTemplateId;
  title: string;
  /** who the other party is in the app */
  partyKind: 'client' | 'contractor' | 'other';
  partyId?: ID;
  /** snapshot of the other party (editable) */
  party: LegalParty;
  /** template variables (fees, dates, scope, governing law …) incl. snapshot of your side */
  vars: Record<string, string>;
  status: LegalStatus;
  createdAt: string;
  sentDate?: string;
  signedDate?: string;
  /** agreement end / expiry */
  expiresDate?: string;
  /** business project (Projects) */
  bizProjectId?: ID;
  attachments?: BizFile[];
  notes?: string;
}

/* ---------------------------------------------------------------- sales */

export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export type DealActivityKind = 'call' | 'email' | 'meeting' | 'proposal' | 'follow_up' | 'note';

export interface DealActivity {
  id: ID;
  date: string;
  kind: DealActivityKind;
  text: string;
}

/** A sales opportunity moving lead → qualified → proposal → negotiation → won / lost. */
export interface Deal {
  id: ID;
  title: string;
  /** existing client, or the contact fields below for a new prospect */
  clientId?: ID;
  contactName?: string;
  company?: string;
  email?: string;
  phone?: string;
  /** where it came from: referral, LinkedIn, website, cold outreach … */
  source?: string;
  /** expected deal value */
  value?: number;
  /** win chance 0–100 (default from the stage, see DEAL_STAGES) */
  probability?: number;
  stage: DealStage;
  /** YYYY-MM-DD the deal was created */
  createdAt: string;
  expectedClose?: string;
  /** date it was won or lost */
  closedDate?: string;
  nextStep?: string;
  nextStepDate?: string;
  lostReason?: string;
  /** strategy offer / service sold */
  offerId?: ID;
  /** project created when the deal was won */
  bizProjectId?: ID;
  /** linked Marketing Space (e.g. the campaign that brought the lead) */
  spaceId?: ID;
  /** linked production */
  projectId?: ID;
  activities: DealActivity[];
  notes?: string;
}

/* ---------------------------------------------------------------- resources (sales enablement + library) */

/** enablement = Sales Enablement screen; library = Resources screen */
export type ResourceSection = 'enablement' | 'library';

export type ResourceKind = 'file' | 'link' | 'text';

/** A reusable resource: stored files, a link, or text you copy (email template, call script, boilerplate). */
export interface BizResource {
  id: ID;
  title: string;
  section: ResourceSection;
  /** see ENABLEMENT_CATEGORIES / LIBRARY_CATEGORIES (free text allowed) */
  category?: string;
  kind: ResourceKind;
  url?: string;
  /** body of a text resource (Markdown / plain) */
  text?: string;
  files?: BizFile[];
  description?: string;
  tags?: string[];
  pinned?: boolean;
  /** YYYY-MM-DD */
  updatedAt?: string;
}

/* ---------------------------------------------------------------- testimonials & portfolio */

export type TestimonialPermission = 'not_asked' | 'requested' | 'granted' | 'declined';

export interface Testimonial {
  id: ID;
  quote: string;
  author: string;
  role?: string;
  company?: string;
  clientId?: ID;
  bizProjectId?: ID;
  date?: string;
  /** 1–5 */
  rating?: number;
  /** where it was given: email, LinkedIn, Google, video … */
  source?: string;
  url?: string;
  /** headshot / logo asset name */
  photo?: string;
  /** permission to use it publicly */
  permission: TestimonialPermission;
  featured?: boolean;
  tags?: string[];
}

export type PortfolioKind = 'showreel' | 'video' | 'image' | 'case_study' | 'link' | 'document';

/** A showreel, piece of work or case study. */
export interface PortfolioItem {
  id: ID;
  title: string;
  kind: PortfolioKind;
  /** YouTube / Vimeo / website link */
  url?: string;
  /** thumbnail / still asset name */
  image?: string;
  files?: BizFile[];
  clientId?: ID;
  bizProjectId?: ID;
  /** linked production */
  projectId?: ID;
  date?: string;
  /** your role, e.g. "Director & editor" */
  role?: string;
  description?: string;
  /** results / outcomes (case studies) */
  results?: string;
  tags?: string[];
  featured?: boolean;
}

/* ---------------------------------------------------------------- projects (client work) */

export type BizProjectStatus = 'planning' | 'active' | 'on_hold' | 'review' | 'done' | 'cancelled';

export interface BizTask {
  id: ID;
  title: string;
  done: boolean;
  due?: string;
  /** 'me' or a contractor id */
  assignee?: string;
  /** shown on the timeline as a milestone */
  milestone?: boolean;
  notes?: string;
}

/** A piece of client work or an internal project. Invoices, income, expenses, time,
    contractor payments and legal documents point at it with bizProjectId. */
export interface BizProject {
  id: ID;
  name: string;
  status: BizProjectStatus;
  clientId?: ID;
  /** the deal it came from */
  dealId?: ID;
  startDate?: string;
  dueDate?: string;
  completedDate?: string;
  /** agreed price to the client */
  fee?: number;
  feeType?: 'fixed' | 'hourly' | 'retainer';
  /** cost budget (contractors, expenses) */
  budget?: number;
  /** contractors on this project */
  contractorIds: ID[];
  /** extra legal documents (documents with bizProjectId count automatically) */
  docIds: ID[];
  /** linked Marketing Space */
  spaceId?: ID;
  /** linked production */
  projectId?: ID;
  color?: string;
  description?: string;
  deliverables?: string;
  tasks: BizTask[];
  notes?: string;
}

/* ---------------------------------------------------------------- strategy */

export interface BizOffer {
  id: ID;
  name: string;
  description?: string;
  price?: number;
  /** e.g. "from", "per month", "per video" */
  priceNote?: string;
  idealFor?: string;
  active: boolean;
}

export type GoalMetric = 'revenue' | 'profit' | 'clients' | 'deals_won' | 'pipeline' | 'custom';

export interface BizGoal {
  id: ID;
  title: string;
  metric: GoalMetric;
  target?: number;
  /** progress of custom goals (the others are computed, see goalProgress) */
  current?: number;
  /** PeriodId for computed metrics, default 'ytd' */
  period?: string;
  due?: string;
  done?: boolean;
}

export interface BizPriority {
  id: ID;
  text: string;
  /** e.g. "2026 Q4" */
  quarter?: string;
  done: boolean;
}

export interface BizCompetitor {
  id: ID;
  name: string;
  url?: string;
  strengths?: string;
  weaknesses?: string;
  notes?: string;
}

export interface BizStrategy {
  /** the overarching strategy in your own words (big text at the top of Strategy) */
  narrative?: string;
  mission?: string;
  vision?: string;
  /** one-sentence positioning statement */
  positioning?: string;
  idealClient?: string;
  uniqueValue?: string;
  pricingStrategy?: string;
  marketingPlan?: string;
  salesProcess?: string;
  swot: { strengths?: string; weaknesses?: string; opportunities?: string; threats?: string };
  offers: BizOffer[];
  goals: BizGoal[];
  priorities: BizPriority[];
  competitors: BizCompetitor[];
  notes?: string;
}

/* ---------------------------------------------------------------- growth initiatives */

export type InitiativeStatus = 'idea' | 'planned' | 'in_progress' | 'paused' | 'done' | 'dropped';

/** A dated check-in on an initiative's KPI. */
export interface InitiativeUpdate {
  id: ID;
  date: string;
  /** KPI value at this date */
  value?: number;
  note?: string;
}

/** A business growth initiative (new offer, outreach push, partnership, ads test, hiring …)
    with a KPI from baseline to target, budget vs spend, steps and dated check-ins. */
export interface Initiative {
  id: ID;
  title: string;
  status: InitiativeStatus;
  /** e.g. Marketing, Sales, Product, Operations, Partnerships, Hiring */
  area?: string;
  /** strategy goal it serves */
  goalId?: ID;
  /** what we expect to happen */
  hypothesis?: string;
  owner?: string;
  startDate?: string;
  dueDate?: string;
  /** KPI tracked, e.g. "Inbound leads / month" */
  kpi?: string;
  baseline?: number;
  target?: number;
  /** latest value (also the last update's value) */
  current?: number;
  /** money planned */
  budget?: number;
  /** extra money spent outside Expenses (expenses with initiativeId are added) */
  spend?: number;
  /** 1–5 */
  impact?: number;
  /** 1–5 */
  effort?: number;
  steps: BizTask[];
  updates: InitiativeUpdate[];
  /** linked Marketing Space (campaign) */
  spaceId?: ID;
  results?: string;
  notes?: string;
}

/* ---------------------------------------------------------------- workflows & SOPs */

export type SopKind = 'sop' | 'workflow' | 'checklist';

export interface SopStep {
  id: ID;
  text: string;
  detail?: string;
}

/** One run through a checklist / workflow (e.g. onboarding a specific client). */
export interface SopRun {
  id: ID;
  label?: string;
  startedAt: string;
  finishedAt?: string;
  /** done step ids */
  done: ID[];
}

export interface Sop {
  id: ID;
  title: string;
  kind: SopKind;
  category?: string;
  /** when to use it, e.g. "A new client signs" */
  trigger?: string;
  owner?: string;
  /** e.g. "every Friday", "per project" */
  frequency?: string;
  steps: SopStep[];
  /** related resources (BizResource ids) */
  resourceIds: ID[];
  runs: SopRun[];
  updatedAt?: string;
  notes?: string;
}

function normalizeStrategy(raw: unknown): BizStrategy {
  const st = obj(raw);
  return {
    ...st,
    swot: obj(st.swot),
    offers: arr<BizOffer>(st.offers).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('offer'), name: x.name ?? '', active: x.active !== false })),
    goals: arr<BizGoal>(st.goals).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('goal'), title: x.title ?? '', metric: x.metric ?? 'custom' })),
    priorities: arr<BizPriority>(st.priorities).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('prio'), text: x.text ?? '', done: !!x.done })),
    competitors: arr<BizCompetitor>(st.competitors).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('comp'), name: x.name ?? '' })),
  } as BizStrategy;
}

/* ---------------------------------------------------------------- settings & root */

export interface BusinessSettings {
  invoicePrefix: string;
  /** next invoice number (used when higher than the last invoice's number) */
  nextInvoiceNumber: number;
  /** default days until an invoice is due */
  paymentTermsDays: number;
  /** default tax / VAT percent on invoices */
  taxPct?: number;
  /** default hourly rate for time entries */
  hourlyRate?: number;
  /** printed on invoices (bank details, PayPal, Stripe link …) */
  paymentInstructions?: string;
  /** default note on invoices ("Thank you for your business!") */
  invoiceNotes?: string;
  /** default governing law for documents (falls back to the profile's jurisdiction) */
  governingLaw?: string;
  expenseCategories: ExpenseCategory[];
}

export interface BusinessData {
  /** schema version of this kind's data */
  version: number;
  profile: BusinessProfile;
  settings: BusinessSettings;
  streams: IncomeStream[];
  income: IncomeEntry[];
  clients: Client[];
  contractors: Contractor[];
  payments: ContractorPayment[];
  invoices: Invoice[];
  expenses: Expense[];
  time: TimeEntry[];
  timer?: RunningTimer;
  docs: LegalDoc[];
  deals: Deal[];
  projects: BizProject[];
  resources: BizResource[];
  testimonials: Testimonial[];
  portfolio: PortfolioItem[];
  strategy: BizStrategy;
  initiatives: Initiative[];
  sops: Sop[];
}

export const emptyStrategy = (): BizStrategy => ({ swot: {}, offers: [], goals: [], priorities: [], competitors: [] });

export const emptyProfile = (): BusinessProfile => ({ type: 'side_hustle' });

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'software', label: 'Software & subscriptions', color: '#4c6ef5' },
  { id: 'equipment', label: 'Equipment', color: '#7950f2' },
  { id: 'contractors', label: 'Contractors', color: '#e8590c' },
  { id: 'travel', label: 'Travel', color: '#15aabf' },
  { id: 'meals', label: 'Meals', color: '#f59f00' },
  { id: 'marketing', label: 'Marketing & ads', color: '#e64980' },
  { id: 'office', label: 'Office & supplies', color: '#40c057' },
  { id: 'fees', label: 'Fees & bank charges', color: '#868e96' },
  { id: 'taxes', label: 'Taxes & licences', color: '#c92a2a' },
  { id: 'other', label: 'Other', color: '#adb5bd' },
];

export const defaultBusinessSettings = (): BusinessSettings => ({
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1,
  paymentTermsDays: 14,
  invoiceNotes: 'Thank you for your business!',
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c })),
});

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d);
let seq = 0;
const fid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const files = (v: unknown): BizFile[] => arr<BizFile>(v).filter((f) => f && typeof f.file === 'string').map((f) => ({ ...f, id: f.id || fid('bf'), fileName: f.fileName || f.file }));

/** Fill in every field (new spaces, older or hand-edited files). Must not throw. */
export function normalizeBusiness(raw: unknown): BusinessData {
  const d = obj(raw) as Partial<BusinessData> & Record<string, any>;
  const st = obj(d.settings);
  const cats = arr<ExpenseCategory>(st.expenseCategories).filter((c) => c && typeof c.id === 'string');
  const settings: BusinessSettings = {
    ...defaultBusinessSettings(),
    ...st,
    invoicePrefix: typeof st.invoicePrefix === 'string' ? st.invoicePrefix : 'INV-',
    nextInvoiceNumber: Math.max(1, Math.round(num(st.nextInvoiceNumber, 1))),
    paymentTermsDays: Math.max(0, Math.round(num(st.paymentTermsDays, 14))),
    expenseCategories: cats.length ? cats.map((c) => ({ id: c.id, label: c.label || c.id, color: c.color || '#adb5bd' })) : DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c })),
  };
  return {
    ...d,
    version: 1,
    profile: { ...emptyProfile(), ...obj(d.profile) } as BusinessProfile,
    settings,
    streams: arr<IncomeStream>(d.streams).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('str'), name: x.name ?? '', type: x.type ?? 'other', active: x.active !== false })),
    income: arr<IncomeEntry>(d.income).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('inc'), date: x.date || '', amount: num(x.amount) })),
    clients: arr<Client>(d.clients).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('cli'), name: x.name ?? '' })),
    contractors: arr<Contractor>(d.contractors).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('ctr'), name: x.name ?? '', rateType: x.rateType ?? 'hourly', active: x.active !== false })),
    payments: arr<ContractorPayment>(d.payments).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('cpay'), contractorId: x.contractorId ?? '', date: x.date || '', amount: num(x.amount), status: x.status ?? 'owed', attachments: files(x.attachments) })),
    invoices: arr<Invoice>(d.invoices).filter(Boolean).map((x) => ({
      ...x,
      id: x.id || fid('inv'),
      number: x.number ?? '',
      issueDate: x.issueDate || '',
      status: x.status ?? 'draft',
      lines: arr<InvoiceLine>(x.lines).filter(Boolean).map((l) => ({ ...l, id: l.id || fid('invl'), description: l.description ?? '', qty: num(l.qty, 1), unitPrice: num(l.unitPrice) })),
      attachments: files(x.attachments),
    })),
    expenses: arr<Expense>(d.expenses).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('exp'), date: x.date || '', category: x.category || 'other', amount: num(x.amount), receipts: files(x.receipts) })),
    time: arr<TimeEntry>(d.time).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('time'), date: x.date || '', minutes: Math.max(0, num(x.minutes)), billable: x.billable !== false })),
    timer: d.timer && typeof d.timer.startedAt === 'string' ? d.timer : undefined,
    deals: arr<Deal>(d.deals).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('deal'), title: x.title ?? '', stage: x.stage ?? 'lead', createdAt: x.createdAt || '', activities: arr<DealActivity>(x.activities).filter(Boolean).map((a) => ({ ...a, id: a.id || fid('act'), date: a.date || '', kind: a.kind ?? 'note', text: a.text ?? '' })) })),
    projects: arr<BizProject>(d.projects).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('bproj'), name: x.name ?? '', status: x.status ?? 'planning', contractorIds: arr<string>(x.contractorIds).filter((i) => typeof i === 'string'), docIds: arr<string>(x.docIds).filter((i) => typeof i === 'string'), tasks: arr<BizTask>(x.tasks).filter(Boolean).map((t) => ({ ...t, id: t.id || fid('task'), title: t.title ?? '', done: !!t.done })) })),
    resources: arr<BizResource>(d.resources).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('res'), title: x.title ?? '', section: x.section === 'enablement' ? 'enablement' : 'library', kind: x.kind ?? (x.url ? 'link' : x.text ? 'text' : 'file'), files: files(x.files) })),
    testimonials: arr<Testimonial>(d.testimonials).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('tst'), quote: x.quote ?? '', author: x.author ?? '', permission: x.permission ?? 'not_asked' })),
    portfolio: arr<PortfolioItem>(d.portfolio).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('pf'), title: x.title ?? '', kind: x.kind ?? 'video', files: files(x.files) })),
    strategy: normalizeStrategy(d.strategy),
    initiatives: arr<Initiative>(d.initiatives).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('init'), title: x.title ?? '', status: x.status ?? 'idea', steps: arr<BizTask>(x.steps).filter(Boolean).map((t) => ({ ...t, id: t.id || fid('task'), title: t.title ?? '', done: !!t.done })), updates: arr<InitiativeUpdate>(x.updates).filter(Boolean).map((u) => ({ ...u, id: u.id || fid('upd'), date: u.date || '' })) })),
    sops: arr<Sop>(d.sops).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('sop'), title: x.title ?? '', kind: x.kind ?? 'sop', steps: arr<SopStep>(x.steps).filter(Boolean).map((t) => ({ ...t, id: t.id || fid('step'), text: t.text ?? '' })), resourceIds: arr<string>(x.resourceIds).filter((i) => typeof i === 'string'), runs: arr<SopRun>(x.runs).filter(Boolean).map((r) => ({ ...r, id: r.id || fid('run'), startedAt: r.startedAt || '', done: arr<string>(r.done) })) })),
    docs: arr<LegalDoc>(d.docs).filter(Boolean).map((x) => ({ ...x, id: x.id || fid('doc'), templateId: x.templateId ?? 'nda', title: x.title ?? '', partyKind: x.partyKind ?? 'other', party: { name: '', ...obj(x.party) } as LegalParty, vars: obj(x.vars) as Record<string, string>, status: x.status ?? 'draft', createdAt: x.createdAt || '', attachments: files(x.attachments) })),
  } as BusinessData;
}

export type { ID };
