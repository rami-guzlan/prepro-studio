/* Business Management option lists. */
import type { Option } from '@/lib/constants';
import type { BizProjectStatus, BusinessType, DealActivityKind, DealStage, GoalMetric, InitiativeStatus, InvoiceStatus, LegalStatus, PaymentMethod, PaymentStatus, PortfolioKind, RateType, ResourceKind, SopKind, StreamType, TaxFormStatus, TestimonialPermission } from './types';

export const BUSINESS_TYPES: (Option<BusinessType> & { description: string; emoji: string })[] = [
  { value: 'side_hustle', label: 'Side hustle', emoji: '🚀', description: 'Something you run next to your job' },
  { value: 'freelance', label: 'Freelance / consulting', emoji: '🧑‍💻', description: 'You sell your time and expertise to clients' },
  { value: 'company', label: 'Company / LLC', emoji: '🏢', description: 'A registered business you own' },
  { value: 'creator', label: 'Creator business', emoji: '🎬', description: 'Sponsorships, products, courses, licensing' },
  { value: 'partner', label: 'A business I’m part of', emoji: '🤝', description: 'Partner, co-founder or equity holder' },
  { value: 'other', label: 'Other income stream', emoji: '💡', description: 'Anything else that earns or costs money' },
];

export const STREAM_TYPES: Option<StreamType>[] = [
  { value: 'client_work', label: 'Client work', color: '#4c6ef5' },
  { value: 'product', label: 'Product / course', color: '#7950f2' },
  { value: 'sponsorship', label: 'Sponsorship / brand deals', color: '#e64980' },
  { value: 'royalties', label: 'Royalties / licensing', color: '#15aabf' },
  { value: 'salary_equity', label: 'Salary / equity / distributions', color: '#2fb36d' },
  { value: 'other', label: 'Other', color: '#868e96' },
];

export const RATE_TYPES: (Option<RateType> & { unit: string })[] = [
  { value: 'hourly', label: 'Hourly', unit: '/ hour' },
  { value: 'day', label: 'Day rate', unit: '/ day' },
  { value: 'fixed', label: 'Fixed fee (project)', unit: 'per project' },
  { value: 'deliverable', label: 'Per deliverable', unit: '/ deliverable' },
  { value: 'rev_share', label: 'Revenue share', unit: '% of revenue' },
];

export const TAX_FORM_STATUSES: Option<TaxFormStatus>[] = [
  { value: 'none', label: 'Not collected', color: '#868e96' },
  { value: 'requested', label: 'Requested', color: '#f59f00' },
  { value: 'w9', label: 'W-9 received', color: '#2fb36d' },
  { value: 'w8ben', label: 'W-8BEN received', color: '#2fb36d' },
  { value: 'needs_1099', label: '1099 needed', color: '#e8590c' },
  { value: 'filed_1099', label: '1099 filed', color: '#4c6ef5' },
  { value: 'not_needed', label: 'Not needed', color: '#adb5bd' },
];

export const PAYMENT_METHODS: Option<PaymentMethod>[] = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'wise', label: 'Wise' },
  { value: 'venmo', label: 'Venmo / Zelle' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_STATUSES: Option<PaymentStatus>[] = [
  { value: 'owed', label: 'Owed', color: '#e8590c' },
  { value: 'scheduled', label: 'Scheduled', color: '#f59f00' },
  { value: 'paid', label: 'Paid', color: '#2fb36d' },
];

/** Shown statuses (overdue is computed from the due date). */
export type InvoiceShownStatus = InvoiceStatus | 'overdue';

export const INVOICE_STATUSES: Option<InvoiceShownStatus>[] = [
  { value: 'draft', label: 'Draft', color: '#868e96' },
  { value: 'sent', label: 'Sent', color: '#4c6ef5' },
  { value: 'overdue', label: 'Overdue', color: '#e03131' },
  { value: 'paid', label: 'Paid', color: '#2fb36d' },
  { value: 'void', label: 'Void', color: '#adb5bd' },
];

export const LEGAL_STATUSES: Option<LegalStatus>[] = [
  { value: 'draft', label: 'Draft', color: '#868e96' },
  { value: 'sent', label: 'Sent for signature', color: '#4c6ef5' },
  { value: 'signed', label: 'Signed', color: '#2fb36d' },
  { value: 'expired', label: 'Expired', color: '#e8590c' },
];

export const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'last_year', label: 'Last year' },
  { value: 'last_12', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
] as const;

export type PeriodId = (typeof PERIODS)[number]['value'];

export const CATEGORY_COLORS = ['#4c6ef5', '#7950f2', '#e8590c', '#15aabf', '#f59f00', '#e64980', '#40c057', '#868e96', '#c92a2a', '#0ca678', '#1098ad', '#ae3ec9'];

/* ---------------------------------------------------------------- sales, projects, library */

/** Pipeline stages with their default win probability (%). */
export const DEAL_STAGES: (Option<DealStage> & { probability: number; open: boolean })[] = [
  { value: 'lead', label: 'Lead', color: '#868e96', probability: 10, open: true },
  { value: 'qualified', label: 'Qualified', color: '#15aabf', probability: 25, open: true },
  { value: 'proposal', label: 'Proposal sent', color: '#4c6ef5', probability: 50, open: true },
  { value: 'negotiation', label: 'Negotiation', color: '#7950f2', probability: 75, open: true },
  { value: 'won', label: 'Won', color: '#2fb36d', probability: 100, open: false },
  { value: 'lost', label: 'Lost', color: '#e03131', probability: 0, open: false },
];

export const DEAL_ACTIVITY_KINDS: Option<DealActivityKind>[] = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'note', label: 'Note' },
];

export const DEAL_SOURCES = ['Referral', 'LinkedIn', 'Instagram', 'YouTube', 'Website', 'Cold outreach', 'Repeat client', 'Event', 'Marketplace', 'Other'];

export const PROJECT_STATUSES: (Option<BizProjectStatus> & { open: boolean })[] = [
  { value: 'planning', label: 'Planning', color: '#868e96', open: true },
  { value: 'active', label: 'Active', color: '#4c6ef5', open: true },
  { value: 'review', label: 'In review', color: '#7950f2', open: true },
  { value: 'on_hold', label: 'On hold', color: '#f59f00', open: true },
  { value: 'done', label: 'Done', color: '#2fb36d', open: false },
  { value: 'cancelled', label: 'Cancelled', color: '#adb5bd', open: false },
];

export const FEE_TYPES: Option<'fixed' | 'hourly' | 'retainer'>[] = [
  { value: 'fixed', label: 'Fixed fee' },
  { value: 'hourly', label: 'Hourly (billed time)' },
  { value: 'retainer', label: 'Retainer' },
];

export const ENABLEMENT_CATEGORIES: Option[] = [
  { value: 'pitch_deck', label: 'Pitch deck', color: '#4c6ef5' },
  { value: 'one_pager', label: 'One-pager', color: '#7950f2' },
  { value: 'case_study', label: 'Case study', color: '#e64980' },
  { value: 'pricing', label: 'Pricing & packages', color: '#2fb36d' },
  { value: 'proposal_template', label: 'Proposal template', color: '#15aabf' },
  { value: 'email_template', label: 'Email template', color: '#f59f00' },
  { value: 'call_script', label: 'Call / discovery script', color: '#e8590c' },
  { value: 'objections', label: 'Objection handling', color: '#c92a2a' },
  { value: 'faq', label: 'FAQ', color: '#0ca678' },
  { value: 'other', label: 'Other', color: '#868e96' },
];

export const LIBRARY_CATEGORIES: Option[] = [
  { value: 'brand', label: 'Brand assets', color: '#e64980' },
  { value: 'template', label: 'Templates', color: '#4c6ef5' },
  { value: 'contract', label: 'Contracts & forms', color: '#7950f2' },
  { value: 'checklist', label: 'Checklists', color: '#2fb36d' },
  { value: 'guide', label: 'Guides & how-tos', color: '#15aabf' },
  { value: 'tool', label: 'Tools & accounts', color: '#f59f00' },
  { value: 'finance', label: 'Finance & tax', color: '#c92a2a' },
  { value: 'other', label: 'Other', color: '#868e96' },
];

export const RESOURCE_KINDS: Option<ResourceKind>[] = [
  { value: 'text', label: 'Text (copy & paste)' },
  { value: 'file', label: 'File(s)' },
  { value: 'link', label: 'Link' },
];

export const TESTIMONIAL_PERMISSIONS: Option<TestimonialPermission>[] = [
  { value: 'not_asked', label: 'Not asked', color: '#868e96' },
  { value: 'requested', label: 'Requested', color: '#f59f00' },
  { value: 'granted', label: 'OK to use publicly', color: '#2fb36d' },
  { value: 'declined', label: 'Private only', color: '#e03131' },
];

export const PORTFOLIO_KINDS: Option<PortfolioKind>[] = [
  { value: 'showreel', label: 'Showreel', color: '#e8590c' },
  { value: 'video', label: 'Video', color: '#4c6ef5' },
  { value: 'image', label: 'Image / stills', color: '#e64980' },
  { value: 'case_study', label: 'Case study', color: '#7950f2' },
  { value: 'link', label: 'Link / website', color: '#15aabf' },
  { value: 'document', label: 'Document / deck', color: '#868e96' },
];

export const SOP_KINDS: Option<SopKind>[] = [
  { value: 'sop', label: 'SOP', color: '#4c6ef5' },
  { value: 'workflow', label: 'Workflow', color: '#7950f2' },
  { value: 'checklist', label: 'Checklist', color: '#2fb36d' },
];

export const GOAL_METRICS: Option<GoalMetric>[] = [
  { value: 'revenue', label: 'Revenue (income)' },
  { value: 'profit', label: 'Profit' },
  { value: 'clients', label: 'New clients' },
  { value: 'deals_won', label: 'Deals won' },
  { value: 'pipeline', label: 'Open pipeline value' },
  { value: 'custom', label: 'Custom (update by hand)' },
];

export const INITIATIVE_STATUSES: (Option<InitiativeStatus> & { open: boolean })[] = [
  { value: 'idea', label: 'Idea', color: '#868e96', open: true },
  { value: 'planned', label: 'Planned', color: '#15aabf', open: true },
  { value: 'in_progress', label: 'In progress', color: '#4c6ef5', open: true },
  { value: 'paused', label: 'Paused', color: '#f59f00', open: true },
  { value: 'done', label: 'Done', color: '#2fb36d', open: false },
  { value: 'dropped', label: 'Dropped', color: '#adb5bd', open: false },
];

export const INITIATIVE_AREAS = ['Marketing', 'Sales', 'Offers & pricing', 'Product', 'Partnerships', 'Operations', 'Hiring', 'Brand', 'Other'];
