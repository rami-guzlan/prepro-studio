/* ==========================================================================
   Legal document templates of business spaces.

   Each template declares its form fields (with defaults computed from the
   business profile, the chosen client / contractor and settings) and builds a
   structured document: title, preamble, numbered sections of clauses and
   signature blocks. The same structure renders on screen, in print / PDF
   (LegalDocView) and as plain text for agents (legalText).

   A generated document stores every value in LegalDoc.vars (including a
   snapshot of your own details), so later profile edits never change a
   document that was already sent or signed.

   These are plain-English, balanced starting points — not legal advice.
   ========================================================================== */
import { parseISODate, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import type { BusinessData, Client, Contractor, LegalDoc, LegalParty, LegalTemplateId } from './types';
import { RATE_TYPES } from './constants';
import { clientName, invoiceTotal } from './derive';

export const LEGAL_DISCLAIMER = 'Template, not legal advice — have a lawyer review before signing.';

export type FieldType = 'text' | 'longtext' | 'money' | 'percent' | 'number' | 'date' | 'select';

export interface DefaultsCtx {
  b: BusinessData;
  partyKind: LegalDoc['partyKind'];
  client?: Client;
  contractor?: Contractor;
  today: string;
  money: (n: number) => string;
}

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** shown only when this returns true */
  when?: (v: Record<string, string>) => boolean;
  default?: (c: DefaultsCtx) => string | undefined;
}

export interface BuiltSection {
  heading: string;
  clauses: string[];
}

export interface SignatureBlock {
  role: string;
  name: string;
  company?: string;
  title?: string;
}

export interface BuiltLegal {
  title: string;
  subtitle?: string;
  /** letters: date + recipient block + salutation */
  letter?: { date: string; to: string[]; re: string; salutation: string };
  preamble: string[];
  sections: BuiltSection[];
  closing: string[];
  signatures: SignatureBlock[];
}

export interface LegalTemplate {
  id: LegalTemplateId;
  name: string;
  description: string;
  partyKinds: LegalDoc['partyKind'][];
  defaultPartyKind: LegalDoc['partyKind'];
  /** labels of the two sides */
  roles(partyKind: LegalDoc['partyKind']): { us: string; them: string };
  fields: TemplateField[];
  build(c: BuildCtx): Omit<BuiltLegal, 'signatures' | 'title'> & { title?: string; signatures?: SignatureBlock[] };
}

export interface BuildCtx {
  v: Record<string, string>;
  us: LegalParty & { entity?: string };
  them: LegalParty;
  U: string;
  T: string;
  /** value or a blank line to fill in by hand */
  t(key: string, blank?: string): string;
  money(key: string): string;
  date(key: string): string;
  yes(key: string): boolean;
}

/* ---------------------------------------------------------------- helpers */

const BLANK = '____________________';

export function longDate(iso?: string): string {
  const d = parseISODate(iso ?? '');
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
}

/** "Name, a company …, with its address at …" */
function partyIntro(p: LegalParty & { entity?: string }): string {
  const bits = [p.company && p.company !== p.name ? `${p.name} of ${p.company}` : p.name || BLANK];
  if (p.entity) bits.push(p.entity);
  if (p.address?.trim()) bits.push(`with an address at ${p.address.trim().replace(/\s*\n\s*/g, ', ')}`);
  return bits.join(', ');
}

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

function governingLaw(c: DefaultsCtx) {
  return c.b.settings.governingLaw || c.b.profile.jurisdiction || undefined;
}

function contractorRate(c: DefaultsCtx): string | undefined {
  const k = c.contractor;
  if (!k || k.rate == null) return undefined;
  if (k.rateType === 'rev_share') return `${k.rate}% of net revenue`;
  const unit = RATE_TYPES.find((r) => r.value === k.rateType)?.unit ?? '';
  return `${c.money(k.rate)} ${unit}${k.rateNote ? ` (${k.rateNote})` : ''}`.trim();
}

/** Standard closing clauses (governing law, entire agreement …). */
function general(c: BuildCtx, extra: string[] = []): BuiltSection {
  const law = c.t('governingLaw', 'the state / country of ' + BLANK);
  return {
    heading: 'General',
    clauses: [
      `Governing Law and Disputes. This Agreement is governed by the laws of ${law}, without regard to its conflict-of-laws rules. The Parties will first try in good faith to resolve any dispute informally. Any dispute that cannot be resolved informally within 30 days will be brought exclusively in the courts located in ${law}, and each Party consents to their jurisdiction.`,
      'Entire Agreement and Amendments. This Agreement is the entire agreement between the Parties about its subject matter and supersedes all prior proposals, discussions and agreements. It may be amended only in a writing signed (including electronically) by both Parties.',
      'Assignment. Neither Party may assign this Agreement without the other Party’s prior written consent, except that either Party may assign it to a successor to substantially all of its business on written notice.',
      'Severability and Waiver. If any provision is held unenforceable, it will be modified to the minimum extent necessary to make it enforceable and the remaining provisions stay in effect. A failure or delay in enforcing any right is not a waiver of it.',
      'Notices. Notices must be in writing and delivered by hand, by courier, or by email to the addresses listed in this Agreement (or later updated by notice). Email notices are effective when sent, unless a delivery failure is received.',
      ...extra,
      'Counterparts and Electronic Signatures. This Agreement may be signed in counterparts and with electronic signatures, each of which is an original and all of which together are one agreement.',
    ],
  };
}

function confidentialitySection(c: BuildCtx, mutual: boolean, years = '2'): BuiltSection {
  const who = mutual ? 'Each Party (the “Recipient”) will keep confidential all non-public business, technical, financial and creative information disclosed by the other Party (the “Discloser”)' : `${c.T} will keep confidential all non-public business, technical, financial and creative information of ${c.U}`;
  return {
    heading: 'Confidentiality',
    clauses: [
      `${who} in connection with this Agreement, including unreleased content, plans, pricing and client information (“Confidential Information”). ${mutual ? 'The Recipient' : c.T} will use Confidential Information only to perform this Agreement, will not disclose it except to personnel and advisers who need to know it and are bound by similar obligations, and will return or destroy it on request.`,
      `These obligations do not apply to information that is or becomes public through no fault of the recipient, was lawfully known to the recipient before disclosure, is received from a third party without a duty of confidentiality, or is independently developed. Disclosure required by law is permitted after prompt notice to the other Party where legally allowed. These obligations survive for ${years} years after this Agreement ends.`,
    ],
  };
}

function liabilitySection(c: BuildCtx, capText = 'the total fees paid or payable under this Agreement'): BuiltSection {
  void c;
  return {
    heading: 'Limitation of Liability',
    clauses: [
      `Except for a Party’s confidentiality or indemnification obligations, or liability arising from gross negligence, fraud or wilful misconduct: (a) neither Party is liable to the other for any indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue or data, even if advised of their possibility; and (b) each Party’s total liability arising out of or relating to this Agreement will not exceed ${capText}.`,
    ],
  };
}

const commonFields: TemplateField[] = [
  { key: 'effectiveDate', label: 'Effective date', type: 'date', required: true, default: (c) => c.today },
  { key: 'governingLaw', label: 'Governing law (state / country)', type: 'text', placeholder: 'e.g. the State of California', hint: 'Defaults to your jurisdiction in the business profile', default: governingLaw },
];

/* ---------------------------------------------------------------- templates */

const contractor: LegalTemplate = {
  id: 'contractor',
  name: 'Independent Contractor Agreement',
  description: 'Hire a freelancer or contractor: scope, agreed pay, payment terms, IP / work-for-hire, confidentiality and contractor status.',
  partyKinds: ['contractor', 'other'],
  defaultPartyKind: 'contractor',
  roles: () => ({ us: 'Company', them: 'Contractor' }),
  fields: [
    ...commonFields,
    { key: 'services', label: 'Services', type: 'longtext', required: true, placeholder: 'e.g. Editing of weekly YouTube videos and three short-form cut-downs per video', default: (c) => c.contractor?.scope || (c.contractor?.role ? `${c.contractor.role} services as requested by Company` : undefined) },
    { key: 'deliverables', label: 'Deliverables', type: 'longtext', placeholder: 'e.g. Final 4K master, project file, captions (SRT)' },
    { key: 'startDate', label: 'Start date', type: 'date', default: (c) => c.contractor?.startDate || c.today },
    { key: 'endDate', label: 'End date', type: 'date', hint: 'Empty = until the services are completed or the agreement is terminated', default: (c) => c.contractor?.endDate },
    { key: 'compensation', label: 'Compensation', type: 'text', required: true, placeholder: 'e.g. $45 per hour', default: contractorRate },
    { key: 'invoicing', label: 'Invoicing', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'milestone', label: 'Per milestone / deliverable' }, { value: 'completion', label: 'On completion' }, { value: 'biweekly', label: 'Every two weeks' }], default: () => 'monthly' },
    { key: 'paymentTerms', label: 'Payment terms', type: 'text', placeholder: 'e.g. within 15 days of receipt of an invoice', default: (c) => (c.contractor?.paymentTerms ? c.contractor.paymentTerms : 'within 15 days of receipt of an invoice') },
    { key: 'expenses', label: 'Expenses', type: 'select', options: [{ value: 'reimbursed', label: 'Pre-approved expenses reimbursed' }, { value: 'contractor', label: 'Contractor covers own expenses' }], default: () => 'reimbursed' },
    { key: 'ip', label: 'Who owns the work', type: 'select', options: [{ value: 'assign', label: 'Company (work for hire / assignment)' }, { value: 'license', label: 'Contractor keeps it, Company gets a licence' }], default: () => 'assign' },
    { key: 'portfolio', label: 'Contractor may show the work in a portfolio', type: 'select', options: yesNo, default: () => 'yes' },
    { key: 'noticeDays', label: 'Termination notice (days)', type: 'number', default: () => '14' },
  ],
  build: (c) => {
    const start = c.v.startDate && c.v.startDate !== c.v.effectiveDate ? c.date('startDate') : 'the Effective Date';
    const inv: Record<string, string> = { monthly: 'monthly, in arrears', milestone: 'on completion of each milestone or Deliverable', completion: 'on completion of the Services', biweekly: 'every two weeks, in arrears' };
    const ipClauses =
      c.v.ip === 'license'
        ? [
            `Contractor retains ownership of all deliverables and work product created under this Agreement (“Work Product”). Effective on Company’s payment in full of the fees for the relevant Work Product, Contractor grants Company an exclusive, perpetual, irrevocable, worldwide, royalty-free licence to use, reproduce, modify, distribute, publicly display and perform the Work Product for any purpose, including the right to sublicense to Company’s service providers and distribution partners.`,
            'Contractor will not license the Work Product to any third party while Company’s licence is exclusive.',
          ]
        : [
            'All deliverables and other work product that Contractor creates specifically for Company under this Agreement (“Work Product”) are “works made for hire” for Company to the extent permitted by law. To the extent any Work Product is not a work made for hire, Contractor assigns to Company all right, title and interest in it, including all intellectual property rights, effective on Company’s payment in full of the fees for that Work Product.',
            'Contractor keeps ownership of the tools, templates, presets, know-how and materials it owned before this Agreement or develops independently of it (“Pre-Existing Materials”). To the extent Pre-Existing Materials are incorporated into the Work Product, Contractor grants Company a non-exclusive, perpetual, worldwide, royalty-free licence to use them as part of the Work Product.',
            'Contractor will sign any documents reasonably needed to confirm Company’s rights in the Work Product.',
          ];
    if (c.yes('portfolio')) ipClauses.push('Unless Company objects in writing, Contractor may display the final, publicly released Work Product in its portfolio and credit itself for its contribution.');
    return {
      preamble: [
        `This Independent Contractor Agreement (the “Agreement”) is entered into as of ${c.date('effectiveDate')} (the “Effective Date”) by and between ${partyIntro(c.us)} (“Company”), and ${partyIntro(c.them)} (“Contractor”). Company and Contractor are each a “Party” and together the “Parties”.`,
      ],
      sections: [
        {
          heading: 'Services',
          clauses: [
            `Contractor will perform the following services for Company (the “Services”): ${c.t('services')}`,
            ...(c.v.deliverables?.trim() ? [`Contractor will deliver the following (the “Deliverables”): ${c.v.deliverables.trim()}`] : []),
            'Contractor will perform the Services in a professional and workmanlike manner, consistent with generally accepted industry standards and in compliance with applicable laws.',
            'Any change to the scope, timing or fees must be agreed in writing (email is sufficient) before the additional work begins.',
          ],
        },
        { heading: 'Term', clauses: [`This Agreement starts on ${start} and continues until ${c.v.endDate ? c.date('endDate') : 'the Services are completed'}, unless terminated earlier under the Termination section.`] },
        {
          heading: 'Compensation and Payment',
          clauses: [
            `Company will pay Contractor ${c.t('compensation')} for the Services. No other compensation is owed unless agreed in writing.`,
            `Contractor will invoice Company ${inv[c.v.invoicing] ?? inv.monthly}. Company will pay each undisputed invoice ${c.t('paymentTerms', 'within 15 days of receipt of an invoice')}. Company will notify Contractor of any disputed amount within 10 days of receiving the invoice, and the Parties will work in good faith to resolve it.`,
            c.v.expenses === 'contractor' ? 'Contractor is responsible for all expenses it incurs in performing the Services.' : 'Company will reimburse reasonable out-of-pocket expenses that Company approved in writing in advance, supported by receipts and included on Contractor’s invoice.',
            'Contractor is responsible for all taxes on amounts paid under this Agreement. Company will not withhold taxes or provide benefits on Contractor’s behalf. Contractor will provide a completed tax form (such as IRS Form W-9 or W-8BEN) on request.',
          ],
        },
        {
          heading: 'Independent Contractor Relationship',
          clauses: [
            'Contractor is an independent contractor. Nothing in this Agreement creates an employment, partnership, agency or joint-venture relationship, and Contractor has no authority to bind Company.',
            'Contractor controls the manner, means, location and hours of its work and provides its own equipment, except for materials Company supplies. Contractor may work for others, provided that doing so does not conflict with its obligations under this Agreement.',
            'Contractor is not eligible for any employee benefits. Contractor may use subcontractors only with Company’s prior written consent and remains responsible for their work and for their compliance with this Agreement.',
          ],
        },
        { heading: 'Intellectual Property', clauses: ipClauses },
        confidentialitySection(c, false),
        {
          heading: 'Warranties and Indemnity',
          clauses: [
            'Each Party represents that it has the right to enter into and perform this Agreement.',
            'Contractor warrants that the Work Product will be its original work (except for Pre-Existing Materials and third-party materials disclosed to Company) and, to Contractor’s knowledge, will not infringe any third party’s rights. Contractor will indemnify Company against third-party claims arising from a breach of this warranty. Company will indemnify Contractor against third-party claims arising from materials Company provides for use in the Work Product.',
          ],
        },
        {
          heading: 'Termination',
          clauses: [
            `Either Party may terminate this Agreement for any reason with ${c.t('noticeDays', '14')} days’ written notice.`,
            'Either Party may terminate this Agreement immediately by written notice if the other Party materially breaches it and does not cure the breach within 10 days after receiving written notice of it.',
            'On termination, Company will pay for Services performed and approved expenses incurred up to the termination date, and Contractor will deliver all completed and in-progress Work Product that Company has paid for. The sections on payment of amounts owed, Intellectual Property, Confidentiality, Warranties and Indemnity, Limitation of Liability and General survive termination.',
          ],
        },
        liabilitySection(c),
        general(c),
      ],
      closing: ['IN WITNESS WHEREOF, the Parties have signed this Agreement as of the Effective Date.'],
    };
  },
};

const nda: LegalTemplate = {
  id: 'nda',
  name: 'Mutual Non-Disclosure Agreement',
  description: 'Both sides protect what they share while exploring a project, partnership or deal.',
  partyKinds: ['client', 'contractor', 'other'],
  defaultPartyKind: 'client',
  roles: (k) => ({ us: 'Company', them: k === 'client' ? 'Client' : k === 'contractor' ? 'Contractor' : 'Counterparty' }),
  fields: [
    ...commonFields,
    { key: 'purpose', label: 'Purpose of sharing', type: 'longtext', required: true, placeholder: 'e.g. evaluating a potential video production and marketing engagement', default: () => 'evaluating and discussing a potential business relationship between the Parties' },
    { key: 'disclosureYears', label: 'Disclosures covered for (years)', type: 'number', default: () => '1' },
    { key: 'years', label: 'Confidentiality lasts (years)', type: 'number', default: () => '3' },
  ],
  build: (c) => ({
    preamble: [
      `This Mutual Non-Disclosure Agreement (the “Agreement”) is entered into as of ${c.date('effectiveDate')} (the “Effective Date”) by and between ${partyIntro(c.us)} (“${c.U}”), and ${partyIntro(c.them)} (“${c.T}”). ${c.U} and ${c.T} are each a “Party” and together the “Parties”.`,
      `The Parties wish to share confidential information with each other for the purpose of ${c.t('purpose')} (the “Purpose”) and agree as follows.`,
    ],
    sections: [
      {
        heading: 'Confidential Information',
        clauses: [
          '“Confidential Information” means any non-public business, technical, financial, creative or personal information that one Party (the “Discloser”) discloses to the other (the “Recipient”), in any form, that is marked as confidential or that a reasonable person would understand to be confidential given its nature and the circumstances of disclosure — including unreleased content, scripts, concepts, product plans, pricing, client and audience data, and the terms of any proposed deal.',
        ],
      },
      {
        heading: 'Exclusions',
        clauses: [
          'Confidential Information does not include information that the Recipient can show: (a) is or becomes publicly available through no fault of the Recipient; (b) was lawfully known to the Recipient before disclosure, without a duty of confidentiality; (c) is lawfully received from a third party without a duty of confidentiality; or (d) is independently developed by the Recipient without use of the Discloser’s Confidential Information.',
        ],
      },
      {
        heading: 'Obligations',
        clauses: [
          'The Recipient will: (a) use Confidential Information only for the Purpose; (b) not disclose it to anyone other than its employees, contractors and professional advisers who need to know it for the Purpose and are bound by confidentiality obligations at least as protective as this Agreement; and (c) protect it using at least the same care it uses for its own similar information, and no less than reasonable care.',
          'The Recipient is responsible for any breach of this Agreement by the people to whom it discloses Confidential Information.',
        ],
      },
      {
        heading: 'Required Disclosure',
        clauses: ['If the Recipient is required by law, regulation or court order to disclose Confidential Information, it will (where legally permitted) give the Discloser prompt written notice, reasonably cooperate with any effort to obtain protective treatment, and disclose only the portion that is legally required.'],
      },
      {
        heading: 'Term',
        clauses: [
          `This Agreement covers disclosures made within ${c.t('disclosureYears', '1')} year(s) after the Effective Date. The Recipient’s obligations for each disclosure last for ${c.t('years', '3')} years after that disclosure, except that obligations for trade secrets continue for as long as the information remains a trade secret under applicable law.`,
        ],
      },
      {
        heading: 'Return or Destruction',
        clauses: ['On the Discloser’s written request, the Recipient will promptly return or destroy the Discloser’s Confidential Information. The Recipient may keep copies required by law or kept in routine backups, which remain subject to this Agreement.'],
      },
      {
        heading: 'No Licence or Obligation',
        clauses: [
          'All Confidential Information remains the property of the Discloser. No licence or other right is granted except the limited right to use Confidential Information for the Purpose. Neither Party is obligated to enter into any further agreement or transaction.',
          'Confidential Information is provided “as is”, without any warranty of accuracy or completeness.',
        ],
      },
      { heading: 'Remedies', clauses: ['Unauthorised use or disclosure of Confidential Information may cause irreparable harm. The Discloser may seek injunctive relief to prevent or stop a breach, in addition to any other remedies available at law or in equity.'] },
      general(c),
    ],
    closing: ['IN WITNESS WHEREOF, the Parties have signed this Agreement as of the Effective Date.'],
  }),
};

const sow: LegalTemplate = {
  id: 'sow',
  name: 'Statement of Work',
  description: 'One project under a services or contractor agreement: scope, deliverables, timeline, fees, acceptance and revisions.',
  partyKinds: ['client', 'contractor'],
  defaultPartyKind: 'client',
  roles: (k) => (k === 'contractor' ? { us: 'Client', them: 'Provider' } : { us: 'Provider', them: 'Client' }),
  fields: [
    ...commonFields,
    { key: 'project', label: 'Project name', type: 'text', required: true, placeholder: 'e.g. Spring product launch video' },
    { key: 'masterAgreement', label: 'Governing agreement', type: 'text', placeholder: 'e.g. the Client Services Agreement dated March 3, 2026', hint: 'Leave empty to make this SOW self-contained' },
    { key: 'overview', label: 'Project overview', type: 'longtext', placeholder: 'What the project is and why' },
    { key: 'scope', label: 'Scope of work', type: 'longtext', required: true, placeholder: 'The work that will be done' },
    { key: 'deliverables', label: 'Deliverables', type: 'longtext', required: true, placeholder: 'e.g. 1 × 90 s hero video (16:9), 3 × 30 s cut-downs (9:16), captions' },
    { key: 'startDate', label: 'Start date', type: 'date', default: (c) => c.today },
    { key: 'endDate', label: 'Target completion', type: 'date' },
    { key: 'timeline', label: 'Milestones', type: 'longtext', placeholder: 'e.g. Script approved – week 1; Shoot – week 2; First cut – week 3; Final delivery – week 4' },
    { key: 'fee', label: 'Total fee', type: 'money', required: true },
    { key: 'schedule', label: 'Payment schedule', type: 'text', default: () => '50% on signing, 50% on final delivery' },
    { key: 'termsDays', label: 'Invoices due within (days)', type: 'number', default: (c) => String(c.client?.termsDays ?? c.b.settings.paymentTermsDays ?? 14) },
    { key: 'hourlyRate', label: 'Out-of-scope rate (per hour)', type: 'money', default: (c) => (c.client?.defaultRate ?? c.b.settings.hourlyRate) != null ? String(c.client?.defaultRate ?? c.b.settings.hourlyRate) : undefined },
    { key: 'revisions', label: 'Revision rounds included', type: 'number', default: () => '2' },
    { key: 'acceptanceDays', label: 'Review period (business days)', type: 'number', default: () => '5' },
    { key: 'assumptions', label: 'Assumptions & exclusions', type: 'longtext', placeholder: 'e.g. Client provides product samples and brand assets; music licensing not included' },
  ],
  build: (c) => {
    const P = c.U === 'Provider' ? c.U : c.T;
    const C = c.U === 'Provider' ? c.T : c.U;
    const self = !c.v.masterAgreement?.trim();
    const sections: BuiltSection[] = [];
    if (c.v.overview?.trim()) sections.push({ heading: 'Project Overview', clauses: [c.v.overview.trim()] });
    sections.push(
      { heading: 'Scope of Work', clauses: [c.t('scope')] },
      { heading: 'Deliverables', clauses: [c.t('deliverables')] },
      {
        heading: 'Timeline and Milestones',
        clauses: [
          `Work starts on ${c.v.startDate ? c.date('startDate') : 'the Effective Date'}${c.v.endDate ? ` with target completion by ${c.date('endDate')}` : ''}.`,
          ...(c.v.timeline?.trim() ? [`Milestones: ${c.v.timeline.trim()}`] : []),
          `Dates depend on ${C} providing information, materials and approvals on time. Delays caused by late inputs move the timeline by a corresponding period.`,
        ],
      },
      {
        heading: 'Fees and Payment',
        clauses: [
          `The total fee for this SOW is ${c.money('fee')}, payable as follows: ${c.t('schedule', '50% on signing, 50% on final delivery')}.`,
          `Invoices are due within ${c.t('termsDays', '14')} days of the invoice date.`,
          `Work outside the scope of this SOW is billed ${c.v.hourlyRate ? `at ${c.money('hourlyRate')} per hour` : 'at rates agreed in writing'}, and only after ${C} approves it in writing.`,
        ],
      },
      {
        heading: 'Acceptance and Revisions',
        clauses: [
          `${C} will review each deliverable within ${c.t('acceptanceDays', '5')} business days of delivery and either approve it or provide consolidated written feedback. A deliverable is accepted if no feedback is received within that period.`,
          `This SOW includes ${c.t('revisions', '2')} round(s) of revisions per deliverable. Further revisions, or changes to an approved stage, are out of scope.`,
        ],
      },
    );
    if (c.v.assumptions?.trim()) sections.push({ heading: 'Assumptions and Exclusions', clauses: [c.v.assumptions.trim()] });
    sections.push({ heading: 'Change Requests', clauses: ['Either Party may request changes to this SOW. A change takes effect only when both Parties approve a written change order (email is sufficient) describing the change and any adjustment to fees and timeline.'] });
    if (self) {
      sections.push(
        {
          heading: 'Ownership',
          clauses: [
            `On payment in full, ${P} assigns to ${C} all rights in the final deliverables created specifically for ${C} under this SOW. ${P} keeps its pre-existing materials, tools, drafts and unused concepts, and grants ${C} a perpetual, non-exclusive licence to any pre-existing materials incorporated in the final deliverables. Third-party assets (stock footage, music, fonts) are licensed under their own terms.`,
          ],
        },
        confidentialitySection(c, true),
        { heading: 'Relationship', clauses: [`${P} performs this SOW as an independent contractor and is responsible for its own taxes, equipment and personnel.`] },
        liabilitySection(c, 'the fees paid or payable under this SOW'),
        general(c),
      );
    }
    return {
      subtitle: c.v.project?.trim() || undefined,
      preamble: [
        `This Statement of Work (“SOW”) is entered into as of ${c.date('effectiveDate')} (the “Effective Date”) by and between ${partyIntro(c.us)} (“${c.U}”), and ${partyIntro(c.them)} (“${c.T}”) for the project “${c.t('project')}”.`,
        self
          ? 'This SOW is a complete agreement for the project described below.'
          : `This SOW is governed by ${c.v.masterAgreement.trim()} (the “Agreement”). Capitalised terms not defined here have the meanings given in the Agreement. If this SOW conflicts with the Agreement, the Agreement controls unless this SOW expressly says otherwise.`,
      ],
      sections,
      closing: ['Agreed by the Parties as of the Effective Date.'],
    };
  },
};

const services: LegalTemplate = {
  id: 'services',
  name: 'Client Services Agreement',
  description: 'Your standard terms with a client: services, fees, deposit, late payment, revisions, IP on payment and liability.',
  partyKinds: ['client', 'other'],
  defaultPartyKind: 'client',
  roles: () => ({ us: 'Provider', them: 'Client' }),
  fields: [
    ...commonFields,
    { key: 'services', label: 'Services', type: 'longtext', required: true, placeholder: 'e.g. Video production, editing and social media content creation, as described in Statements of Work agreed from time to time' },
    { key: 'fee', label: 'Fees', type: 'text', required: true, placeholder: 'e.g. $4,500 per month, or as set out in each Statement of Work', default: (c) => (c.client?.defaultRate != null ? `${c.money(c.client.defaultRate)} per hour, or as set out in each Statement of Work` : undefined) },
    { key: 'deposit', label: 'Deposit (% of project fee)', type: 'percent', default: () => '50' },
    { key: 'termsDays', label: 'Invoices due within (days)', type: 'number', default: (c) => String(c.client?.termsDays ?? c.b.settings.paymentTermsDays ?? 14) },
    { key: 'lateFee', label: 'Late interest (% per month)', type: 'percent', default: () => '1.5' },
    { key: 'revisions', label: 'Revision rounds included', type: 'number', default: () => '2' },
    { key: 'hourlyRate', label: 'Rate for extra work (per hour)', type: 'money', default: (c) => (c.client?.defaultRate ?? c.b.settings.hourlyRate) != null ? String(c.client?.defaultRate ?? c.b.settings.hourlyRate) : undefined },
    { key: 'endDate', label: 'End date', type: 'date', hint: 'Empty = ongoing until terminated' },
    { key: 'noticeDays', label: 'Termination notice (days)', type: 'number', default: () => '30' },
    { key: 'portfolio', label: 'You may show the work in your portfolio', type: 'select', options: yesNo, default: () => 'yes' },
  ],
  build: (c) => ({
    preamble: [
      `This Client Services Agreement (the “Agreement”) is entered into as of ${c.date('effectiveDate')} (the “Effective Date”) by and between ${partyIntro(c.us)} (“Provider”), and ${partyIntro(c.them)} (“Client”). Provider and Client are each a “Party” and together the “Parties”.`,
    ],
    sections: [
      {
        heading: 'Services',
        clauses: [
          `Provider will provide the following services to Client (the “Services”): ${c.t('services')}`,
          'Specific projects may be described in statements of work signed by both Parties (each an “SOW”). Each SOW is governed by this Agreement. If an SOW conflicts with this Agreement, this Agreement controls unless the SOW expressly says otherwise.',
          'Provider will perform the Services in a professional manner consistent with industry standards.',
        ],
      },
      { heading: 'Term', clauses: [`This Agreement starts on the Effective Date and continues ${c.v.endDate ? `until ${c.date('endDate')}` : 'until terminated under the Termination section'}.`] },
      {
        heading: 'Fees and Payment',
        clauses: [
          `Client will pay Provider ${c.t('fee')}.`,
          ...(Number(c.v.deposit) > 0 ? [`For project-based work, a deposit of ${c.v.deposit}% of the project fee is due on signing the relevant SOW, before work begins, and is credited against the final invoice.`] : []),
          `Invoices are due within ${c.t('termsDays', '14')} days of the invoice date. Overdue amounts accrue interest at ${c.t('lateFee', '1.5')}% per month, or the maximum rate permitted by law if lower. If any invoice is more than 15 days overdue, Provider may pause work after giving written notice until the account is brought current.`,
          'Client will reimburse reasonable expenses that Client approves in writing in advance, at cost. Fees exclude taxes, which Client will pay where applicable (other than taxes on Provider’s income).',
        ],
      },
      {
        heading: 'Client Responsibilities',
        clauses: [
          'Client will provide accurate information, materials, access and timely feedback and approvals. Timelines depend on these inputs, and delays caused by late inputs move deadlines by a corresponding period.',
          'Client represents that it owns or has permission to use all materials it provides to Provider, and that Provider’s use of them as directed by Client will not infringe any third party’s rights.',
        ],
      },
      {
        heading: 'Revisions and Changes',
        clauses: [`Each deliverable includes ${c.t('revisions', '2')} round(s) of revisions. Additional revisions or changes to the agreed scope are billed ${c.v.hourlyRate ? `at ${c.money('hourlyRate')} per hour` : 'at Provider’s then-current rates'} or as quoted in writing, and only after Client approves them.`],
      },
      {
        heading: 'Intellectual Property',
        clauses: [
          'On Client’s payment in full of all fees for a deliverable, Provider assigns to Client all rights in the final deliverable created specifically for Client. Until payment in full, Client has a limited licence to review the deliverables only.',
          'Provider keeps ownership of its pre-existing materials, tools, templates, know-how, drafts and unused concepts. Provider grants Client a perpetual, non-exclusive, worldwide licence to use any pre-existing materials that are incorporated into the final deliverables, as part of those deliverables.',
          'Third-party assets (such as stock footage, music, fonts and images) are licensed under their own terms, which Provider will disclose to Client.',
          ...(c.yes('portfolio') ? ['Unless Client asks otherwise in writing, Provider may display the final work publicly in its portfolio and marketing after Client has released it.'] : []),
        ],
      },
      confidentialitySection(c, true),
      { heading: 'Independent Contractor', clauses: ['Provider is an independent contractor and controls the methods, tools and personnel used to perform the Services. Provider is responsible for its own taxes and benefits. Nothing in this Agreement creates an employment, partnership or agency relationship.'] },
      {
        heading: 'Warranties and Disclaimer',
        clauses: [
          'Each Party represents that it has the authority to enter into this Agreement. Provider warrants that the Services will be performed in a professional and workmanlike manner.',
          'Except as expressly stated in this Agreement, the Services and deliverables are provided “as is”. Provider does not guarantee specific business results such as views, followers, rankings, leads or sales.',
        ],
      },
      liabilitySection(c, 'the fees paid by Client under this Agreement in the 12 months before the event giving rise to the claim'),
      {
        heading: 'Termination',
        clauses: [
          `Either Party may terminate this Agreement or any SOW for convenience with ${c.t('noticeDays', '30')} days’ written notice, or immediately by written notice if the other Party materially breaches this Agreement and does not cure the breach within 10 days of written notice.`,
          'On termination, Client will pay for all Services performed and expenses incurred up to the termination date, plus any non-cancellable commitments made for Client. Any deposit is applied to those amounts. The sections on Fees and Payment (for amounts owed), Intellectual Property, Confidentiality, Limitation of Liability and General survive termination.',
        ],
      },
      general(c),
    ],
    closing: ['IN WITNESS WHEREOF, the Parties have signed this Agreement as of the Effective Date.'],
  }),
};

const collab: LegalTemplate = {
  id: 'collab',
  name: 'Collaboration / Revenue Share Agreement',
  description: 'Make something together and split what it earns: contributions, net revenue split, reporting, ownership and credit.',
  partyKinds: ['other', 'contractor', 'client'],
  defaultPartyKind: 'other',
  roles: () => ({ us: 'Company', them: 'Collaborator' }),
  fields: [
    ...commonFields,
    { key: 'project', label: 'Project', type: 'longtext', required: true, placeholder: 'e.g. A 6-episode documentary podcast series titled “Night Shift”' },
    { key: 'ourContribution', label: 'Your contribution', type: 'longtext', required: true, placeholder: 'e.g. Production, editing, distribution on our channels' },
    { key: 'theirContribution', label: 'Their contribution', type: 'longtext', required: true, placeholder: 'e.g. Hosting, research, promotion to their audience' },
    { key: 'ourShare', label: 'Your share of net revenue (%)', type: 'percent', required: true, default: () => '50' },
    { key: 'collector', label: 'Who collects the revenue', type: 'select', options: [{ value: 'us', label: 'You' }, { value: 'them', label: 'The collaborator' }], default: () => 'us' },
    { key: 'period', label: 'Statements and payouts', type: 'select', options: [{ value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }], default: () => 'month' },
    { key: 'payDays', label: 'Pay within (days after period end)', type: 'number', default: () => '30' },
    { key: 'ownership', label: 'Ownership of the project', type: 'select', options: [{ value: 'joint', label: 'Owned jointly' }, { value: 'us', label: 'You own it; they share revenue' }, { value: 'each', label: 'Each keeps their own contribution' }], default: () => 'joint' },
    { key: 'credit', label: 'Credit', type: 'text', placeholder: 'e.g. “Created by A and B” in descriptions and end cards' },
    { key: 'noticeDays', label: 'Notice to stop future work (days)', type: 'number', default: () => '30' },
  ],
  build: (c) => {
    const ours = Math.max(0, Math.min(100, Number(c.v.ourShare) || 0));
    const collector = c.v.collector === 'them' ? c.T : c.U;
    const other = c.v.collector === 'them' ? c.U : c.T;
    const own: Record<string, string> = {
      joint: 'The Parties jointly own all rights in the Project and the materials created for it (“Project Materials”). Neither Party may grant an exclusive licence, sell or transfer rights in the Project Materials without the other Party’s written consent. Each Party may make non-exclusive uses consistent with this Agreement.',
      us: `${c.U} owns all rights in the Project and the materials created for it (“Project Materials”). ${c.T} assigns to ${c.U} any rights it has in the Project Materials it contributes, in exchange for the revenue share in this Agreement.`,
      each: `Each Party keeps ownership of the materials it contributes. Each Party grants the other a non-exclusive, worldwide, royalty-free licence to use its contributions as part of the Project (the Project and those contributions, “Project Materials”) for as long as the Project is exploited, subject to the revenue share in this Agreement.`,
    };
    return {
      preamble: [
        `This Collaboration and Revenue Share Agreement (the “Agreement”) is entered into as of ${c.date('effectiveDate')} (the “Effective Date”) by and between ${partyIntro(c.us)} (“${c.U}”), and ${partyIntro(c.them)} (“${c.T}”). ${c.U} and ${c.T} are each a “Party” and together the “Parties”.`,
      ],
      sections: [
        { heading: 'The Project', clauses: [`The Parties will collaborate on the following project (the “Project”): ${c.t('project')}`] },
        {
          heading: 'Contributions',
          clauses: [
            `${c.U} will contribute: ${c.t('ourContribution')}`,
            `${c.T} will contribute: ${c.t('theirContribution')}`,
            'Each Party bears its own costs unless both Parties approve an expense in writing in advance as a shared Project expense (“Shared Expense”).',
          ],
        },
        {
          heading: 'Revenue Share',
          clauses: [
            '“Net Revenue” means all revenue actually received from the Project (including sales, platform payouts, licensing fees and sponsorships attributable to the Project), minus platform and payment-processing fees, refunds and chargebacks, sales taxes collected, and approved Shared Expenses.',
            `Net Revenue is split ${ours}% to ${c.U} and ${Math.round((100 - ours) * 100) / 100}% to ${c.T}.`,
          ],
        },
        {
          heading: 'Statements and Payment',
          clauses: [
            `${collector} will collect Project revenue and, within ${c.t('payDays', '30')} days after the end of each calendar ${c.v.period === 'quarter' ? 'quarter' : 'month'}, provide ${other} with a statement of revenue and deductions for that period and pay ${other}’s share.`,
            `${other} may review the records supporting the statements once per year on 15 days’ notice. If a review shows an underpayment, ${collector} will promptly pay the difference.`,
          ],
        },
        { heading: 'Ownership', clauses: [own[c.v.ownership] ?? own.joint] },
        {
          heading: 'Credit and Decisions',
          clauses: [
            c.v.credit?.trim() ? `Each Party will be credited as follows wherever credits are customarily given: ${c.v.credit.trim()}` : 'Each Party will be credited for its contribution wherever credits are customarily given.',
            'Major decisions — pricing, licensing, sponsorships, use of the Project to promote third parties, and ending the Project — require both Parties’ written approval (email is sufficient). Neither Party will unreasonably withhold or delay approval.',
          ],
        },
        {
          heading: 'Term and Termination',
          clauses: [
            `This Agreement starts on the Effective Date and continues for as long as the Project generates revenue, unless the Parties end it by mutual written agreement. Either Party may stop contributing new work with ${c.t('noticeDays', '30')} days’ written notice.`,
            'The revenue share continues to apply to all Project Materials created before termination, for as long as they generate revenue, unless the Parties agree to a buy-out in writing.',
          ],
        },
        { heading: 'Relationship', clauses: ['The Parties are independent. This Agreement does not create a partnership, joint venture, employment or agency relationship, and neither Party may bind the other. Each Party is responsible for its own taxes on its share.'] },
        confidentialitySection(c, true),
        liabilitySection(c, 'the amounts paid to that Party under this Agreement in the 12 months before the claim'),
        general(c),
      ],
      closing: ['IN WITNESS WHEREOF, the Parties have signed this Agreement as of the Effective Date.'],
    };
  },
};

const release: LegalTemplate = {
  id: 'release',
  name: 'Content & Likeness Release',
  description: 'Permission to film, record and publish a person’s name, image, voice and likeness in your content.',
  partyKinds: ['other', 'contractor', 'client'],
  defaultPartyKind: 'other',
  roles: () => ({ us: 'Producer', them: 'Participant' }),
  fields: [
    { key: 'effectiveDate', label: 'Date', type: 'date', required: true, default: (c) => c.today },
    { key: 'project', label: 'Content / project', type: 'longtext', required: true, placeholder: 'e.g. the YouTube video series “Studio Diaries” and related social media content' },
    { key: 'recordingDate', label: 'Recording date', type: 'date', default: (c) => c.today },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Los Angeles, California' },
    { key: 'compensation', label: 'Compensation', type: 'text', hint: 'Empty = no payment', placeholder: 'e.g. $250, paid within 14 days' },
    { key: 'review', label: 'Participant may review for factual errors', type: 'select', options: yesNo, default: () => 'no' },
    { key: 'restrictions', label: 'Restrictions (optional)', type: 'longtext', placeholder: 'e.g. Participant’s home address and children will not be shown' },
    { key: 'minor', label: 'Participant is under 18', type: 'select', options: yesNo, default: () => 'no' },
    { key: 'governingLaw', label: 'Governing law (state / country)', type: 'text', default: governingLaw },
  ],
  build: (c) => {
    const sections: BuiltSection[] = [
      {
        heading: 'Grant of Rights',
        clauses: [
          `Participant grants ${c.U} and its licensees, successors and assigns the irrevocable right to record, photograph, edit, reproduce, publish, distribute, display and otherwise use Participant’s name, image, likeness, voice, biographical information and performance (together, the “Likeness”) in the Content and in advertising, publicity and promotion for the Content and for ${c.U}, in all media now known or later developed, throughout the world, in perpetuity.`,
        ],
      },
      {
        heading: 'Compensation',
        clauses: [
          c.v.compensation?.trim()
            ? `${c.U} will pay Participant ${c.v.compensation.trim()} as full consideration for this Release.`
            : `Participant agrees that the opportunity to appear in the Content is full and sufficient consideration for this Release and that no other payment is owed.`,
        ],
      },
      {
        heading: 'Ownership and Editing',
        clauses: [
          `${c.U} owns all rights in the Content, including the recordings of Participant. ${c.U} may edit, cut, rearrange, translate and combine the recordings with other material, and is not obliged to use them.`,
          c.yes('review')
            ? `Before first publication, ${c.U} will give Participant a reasonable opportunity to review the portions of the Content featuring Participant solely to identify factual errors, which ${c.U} will consider in good faith.`
            : 'Participant has no right to approve the Content or any use of it.',
        ],
      },
      ...(c.v.restrictions?.trim() ? [{ heading: 'Agreed Restrictions', clauses: [c.v.restrictions.trim()] }] : []),
      {
        heading: 'Release',
        clauses: [
          `Participant releases ${c.U} and its licensees, successors and assigns from any claims for invasion of privacy, violation of the right of publicity, defamation (other than intentional misrepresentation of fact) or similar claims arising from uses of the Likeness permitted by this Release.`,
        ],
      },
      {
        heading: 'Participant’s Representations',
        clauses: [
          `Participant ${c.yes('minor') ? 'is under 18, and Participant’s parent or legal guardian signs below to consent to this Release on Participant’s behalf and to confirm that they have the authority to do so' : 'is at least 18 years old'}, has the right to enter into this Release, and is not bound by any agreement that conflicts with it.`,
        ],
      },
      {
        heading: 'General',
        clauses: [
          `This Release is governed by the laws of ${c.t('governingLaw', BLANK)}. It is the entire agreement between Participant and ${c.U} about its subject matter, may be changed only in writing signed by both, and may be signed electronically. If any part is unenforceable, the rest remains in effect.`,
        ],
      },
    ];
    const sig: SignatureBlock[] = [
      { role: 'Participant', name: c.them.name, company: c.them.company, title: c.them.title },
      ...(c.yes('minor') ? [{ role: 'Parent or legal guardian', name: '' }] : []),
      { role: c.U, name: c.us.name, company: c.us.company, title: c.us.title },
    ];
    return {
      preamble: [
        `This Content and Likeness Release (the “Release”) is given on ${c.date('effectiveDate')} by ${partyIntro(c.them)} (“Participant”) to ${partyIntro(c.us)} (“${c.U}”) in connection with ${c.t('project')} (the “Content”)${c.v.recordingDate ? `, recorded on or about ${c.date('recordingDate')}` : ''}${c.v.location?.trim() ? ` at ${c.v.location.trim()}` : ''}.`,
      ],
      sections,
      closing: ['Participant has read this Release, understands it, and signs it voluntarily.'],
      signatures: sig,
    };
  },
};

const sponsorship: LegalTemplate = {
  id: 'sponsorship',
  name: 'Sponsorship / Brand Deal Agreement',
  description: 'Sponsored content for a brand: deliverables, posting dates, approvals, fee and kill fee, usage rights, exclusivity and disclosure.',
  partyKinds: ['client', 'other'],
  defaultPartyKind: 'client',
  roles: () => ({ us: 'Creator', them: 'Brand' }),
  fields: [
    ...commonFields,
    { key: 'product', label: 'Product / campaign', type: 'text', required: true, placeholder: 'e.g. the Lumen X2 camera light launch campaign' },
    { key: 'deliverables', label: 'Deliverables', type: 'longtext', required: true, placeholder: 'e.g. 1 × dedicated YouTube integration (60–90 s), 3 × Instagram Stories with link sticker, 1 × TikTok' },
    { key: 'postDates', label: 'Posting dates / window', type: 'text', placeholder: 'e.g. between November 10 and November 24, 2026' },
    { key: 'liveDays', label: 'Content stays live for at least (days)', type: 'number', default: () => '90' },
    { key: 'fee', label: 'Fee', type: 'money', required: true },
    { key: 'schedule', label: 'Payment schedule', type: 'text', default: () => '50% on signing and 50% within 15 days after the content is published' },
    { key: 'termsDays', label: 'Invoices due within (days)', type: 'number', default: (c) => String(c.client?.termsDays ?? c.b.settings.paymentTermsDays ?? 15) },
    { key: 'approvalRounds', label: 'Revision rounds for the brand', type: 'number', default: () => '1' },
    { key: 'reviewDays', label: 'Brand review time (business days)', type: 'number', default: () => '3' },
    { key: 'killFee', label: 'Kill fee if cancelled after work starts (%)', type: 'percent', default: () => '50' },
    { key: 'organicDays', label: 'Organic reposting by the brand (days, 0 = none)', type: 'number', default: () => '90' },
    { key: 'paidDays', label: 'Paid ads / whitelisting (days, 0 = not included)', type: 'number', default: () => '0' },
    { key: 'exclusivity', label: 'Exclusive category (optional)', type: 'text', placeholder: 'e.g. portable LED lighting' },
    { key: 'exclusivityDays', label: 'Exclusivity window (days after posting)', type: 'number', when: (v) => !!v.exclusivity?.trim(), default: () => '30' },
  ],
  build: (c) => {
    const organic = Number(c.v.organicDays) || 0;
    const paid = Number(c.v.paidDays) || 0;
    return {
      preamble: [
        `This Sponsorship Agreement (the “Agreement”) is entered into as of ${c.date('effectiveDate')} (the “Effective Date”) by and between ${partyIntro(c.us)} (“Creator”), and ${partyIntro(c.them)} (“Brand”). Creator and Brand are each a “Party” and together the “Parties”.`,
      ],
      sections: [
        { heading: 'Campaign', clauses: [`Brand engages Creator to create and publish sponsored content promoting ${c.t('product')} (the “Campaign”).`] },
        {
          heading: 'Deliverables and Schedule',
          clauses: [
            `Creator will create and publish the following content (the “Deliverables”): ${c.t('deliverables')}`,
            `Creator will publish the Deliverables ${c.v.postDates?.trim() ? c.v.postDates.trim() : 'on dates agreed by the Parties in writing'}. Creator will keep each Deliverable live on its channel for at least ${c.t('liveDays', '90')} days after publication.`,
          ],
        },
        {
          heading: 'Creative Control and Approval',
          clauses: [
            'Creator keeps creative control, consistent with the brief and talking points Brand provides. Creator will not make claims about the product that Brand has not provided or approved.',
            `Brand may review a draft of each Deliverable and request up to ${c.t('approvalRounds', '1')} round(s) of reasonable revisions within ${c.t('reviewDays', '3')} business days of receiving it. If Brand does not respond within that time, the draft is approved.`,
          ],
        },
        {
          heading: 'Fee and Payment',
          clauses: [
            `Brand will pay Creator a total fee of ${c.money('fee')}, payable ${c.t('schedule', '50% on signing and 50% after publication')}. Invoices are due within ${c.t('termsDays', '15')} days.`,
            `If Brand cancels the Campaign after Creator has started production, Brand will pay ${c.t('killFee', '50')}% of the fee, or the full fee if the Deliverables have already been delivered for review.`,
            'Products provided for the Campaign are supplied at no cost and may be kept by Creator unless agreed otherwise in writing.',
          ],
        },
        {
          heading: 'Ownership and Usage Rights',
          clauses: [
            'Creator owns the Deliverables and all content it creates.',
            organic > 0 ? `Brand may repost and share the published Deliverables on Brand’s own organic social channels and website, with credit to Creator, for ${organic} days after publication.` : 'Brand may share links to the published Deliverables but may not repost or reupload them without Creator’s written consent.',
            paid > 0
              ? `Brand may use the Deliverables in paid advertising, including whitelisting / branded-content ads through Creator’s account, for ${paid} days after publication.`
              : 'Paid usage (paid ads, whitelisting, use in Brand’s own ads) is not included and requires a separate written agreement and fee.',
            'After the usage period ends, Brand will stop new uses of the Deliverables. Posts already published organically by Brand may remain.',
          ],
        },
        {
          heading: 'Exclusivity',
          clauses: [
            c.v.exclusivity?.trim()
              ? `From the Effective Date until ${c.t('exclusivityDays', '30')} days after the last Deliverable is published, Creator will not publish sponsored content for a direct competitor of Brand in the category of ${c.v.exclusivity.trim()}.`
              : 'This Agreement is not exclusive. Creator may work with other brands, including in the same category.',
          ],
        },
        {
          heading: 'Disclosure and Compliance',
          clauses: [
            'Creator will clearly disclose the paid relationship in each Deliverable (for example, “#ad” or “Paid partnership with Brand” and the platform’s branded-content tools), in line with the FTC Endorsement Guides or other applicable advertising rules and platform policies.',
            'Brand is responsible for the accuracy of product information and claims it provides and for the safety and legality of its products.',
          ],
        },
        {
          heading: 'Termination',
          clauses: [
            'Either Party may terminate this Agreement by written notice if the other Party materially breaches it and does not cure the breach within 5 business days of written notice, or if the other Party engages in conduct that brings it into serious public disrepute and would reasonably harm the terminating Party’s reputation.',
            'Fees for Deliverables already published remain payable, and the kill fee applies if Brand terminates for convenience.',
          ],
        },
        {
          heading: 'Independent Contractor and Confidentiality',
          clauses: ['Creator is an independent contractor and responsible for its own taxes. Each Party will keep the financial terms of this Agreement confidential, except as required by law or disclosed to its professional advisers.'],
        },
        {
          heading: 'Indemnity and Liability',
          clauses: [
            'Brand will indemnify Creator against third-party claims arising from the product, its use, or the information and claims Brand provides. Creator will indemnify Brand against third-party claims that original content created by Creator infringes a third party’s intellectual property rights.',
            'Except for these indemnities and for gross negligence or wilful misconduct, neither Party is liable for indirect or consequential damages, and each Party’s total liability is limited to the total fee under this Agreement.',
          ],
        },
        general(c),
      ],
      closing: ['IN WITNESS WHEREOF, the Parties have signed this Agreement as of the Effective Date.'],
    };
  },
};

const paymentPlan: LegalTemplate = {
  id: 'payment_plan',
  name: 'Payment Plan / Invoice Terms Letter',
  description: 'A letter agreement for paying an outstanding balance in instalments, with late and default terms.',
  partyKinds: ['client', 'other'],
  defaultPartyKind: 'client',
  roles: () => ({ us: 'Company', them: 'Client' }),
  fields: [
    { key: 'effectiveDate', label: 'Letter date', type: 'date', required: true, default: (c) => c.today },
    {
      key: 'amount',
      label: 'Outstanding balance',
      type: 'money',
      required: true,
      default: (c) => {
        if (!c.client) return undefined;
        const open = c.b.invoices.filter((i) => i.clientId === c.client!.id && i.status === 'sent');
        const t = open.reduce((n, i) => n + invoiceTotal(i), 0);
        return t ? String(Math.round(t * 100) / 100) : undefined;
      },
    },
    {
      key: 'invoices',
      label: 'Invoice number(s)',
      type: 'text',
      default: (c) => (c.client ? c.b.invoices.filter((i) => i.clientId === c.client!.id && i.status === 'sent').map((i) => i.number).join(', ') || undefined : undefined),
    },
    { key: 'description', label: 'For', type: 'text', placeholder: 'e.g. video production services delivered in September 2026' },
    { key: 'installments', label: 'Number of instalments', type: 'number', required: true, default: () => '3' },
    { key: 'firstDate', label: 'First payment date', type: 'date', required: true },
    { key: 'frequency', label: 'Frequency', type: 'select', options: [{ value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every two weeks' }, { value: 'monthly', label: 'Monthly' }], default: () => 'monthly' },
    { key: 'method', label: 'Payment method', type: 'text', default: (c) => (c.b.settings.paymentInstructions ? 'the method described in the payment instructions on the invoice' : 'bank transfer') },
    { key: 'graceDays', label: 'Grace period (days)', type: 'number', default: () => '5' },
    { key: 'lateFee', label: 'Late fee per missed instalment', type: 'money', hint: 'Empty = no late fee' },
    { key: 'pauseWork', label: 'Further work paused until paid in full', type: 'select', options: yesNo, default: () => 'no' },
    { key: 'governingLaw', label: 'Governing law (state / country)', type: 'text', default: governingLaw },
  ],
  build: (c) => {
    const n = Math.max(1, Math.round(Number(c.v.installments) || 1));
    const total = Number(c.v.amount) || 0;
    const each = Math.floor((total / n) * 100) / 100;
    const last = Math.round((total - each * (n - 1)) * 100) / 100;
    const freq: Record<string, string> = { weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly' };
    const to = [c.them.name, c.them.company && c.them.company !== c.them.name ? c.them.company : '', ...(c.them.address ?? '').split(/\n/)].map((x) => x.trim()).filter(Boolean);
    return {
      title: 'Payment Plan Agreement',
      letter: {
        date: c.date('effectiveDate'),
        to,
        re: `Payment plan for the outstanding balance of ${c.money('amount')}${c.v.invoices?.trim() ? ` (invoice ${c.v.invoices.trim()})` : ''}`,
        salutation: `Dear ${c.them.name?.split(' ')[0] || 'Sir or Madam'},`,
      },
      preamble: [
        `This letter confirms the payment plan we agreed for the balance that ${c.them.company || c.them.name || 'you'} (“Client”) owes to ${c.us.name || BLANK} (“Company”). By signing below, Client agrees to the following terms.`,
      ],
      sections: [
        { heading: 'Balance', clauses: [`Client acknowledges that it owes Company ${c.money('amount')} as of ${c.date('effectiveDate')}${c.v.description?.trim() ? ` for ${c.v.description.trim()}` : ''}${c.v.invoices?.trim() ? `, as invoiced in ${c.v.invoices.trim()}` : ''} (the “Balance”), and that the Balance is not disputed.`] },
        {
          heading: 'Payment Schedule',
          clauses: [
            n === 1
              ? `Client will pay the Balance in one payment on ${c.date('firstDate')}, paid by ${c.t('method', 'bank transfer')}.`
              : last !== each
                ? `Client will pay the Balance in ${n} ${freq[c.v.frequency] ?? freq.monthly} instalments starting on ${c.date('firstDate')}: ${n - 1} instalment${n - 1 === 1 ? '' : 's'} of ${total ? c.v.__fmtEach : BLANK} and a final instalment of ${total ? c.v.__fmtLast : BLANK}, paid by ${c.t('method', 'bank transfer')}.`
                : `Client will pay the Balance in ${n} equal ${freq[c.v.frequency] ?? freq.monthly} instalments of ${total ? c.v.__fmtEach : BLANK} starting on ${c.date('firstDate')}, paid by ${c.t('method', 'bank transfer')}.`,
            'Client may pay all or part of the remaining Balance early at any time without penalty.',
          ],
        },
        {
          heading: 'Late or Missed Payments',
          clauses: [
            `If an instalment is more than ${c.t('graceDays', '5')} days late${c.v.lateFee ? `, a late fee of ${c.money('lateFee')} applies to that instalment, and` : ','} Company may, after giving written notice and 5 more days to pay, declare the entire remaining Balance immediately due.`,
            ...(c.yes('pauseWork') ? ['Company may pause further work and hold back new deliverables until the Balance is paid in full.'] : []),
          ],
        },
        {
          heading: 'Settlement',
          clauses: [
            'When all instalments have been paid, the Balance is settled in full. Except as set out in this letter, Company does not waive any of its rights, and the terms of the original agreement and invoices remain in effect.',
            `This letter is governed by the laws of ${c.t('governingLaw', BLANK)} and may be signed electronically and in counterparts.`,
          ],
        },
      ],
      closing: [`Please sign below to confirm your agreement and return a copy to ${c.us.email || 'us'}. Thank you for working with us to settle the account.`],
      signatures: [
        { role: 'Company', name: c.us.name, company: c.us.company, title: c.us.title },
        { role: 'Agreed and accepted by Client', name: c.them.name, company: c.them.company, title: c.them.title },
      ],
    };
  },
};

export const LEGAL_TEMPLATES: LegalTemplate[] = [contractor, nda, sow, services, collab, release, sponsorship, paymentPlan];

export const TEMPLATE_BY_ID = Object.fromEntries(LEGAL_TEMPLATES.map((t) => [t.id, t])) as Record<LegalTemplateId, LegalTemplate>;

/* ---------------------------------------------------------------- party + defaults */

/** Your side of a document from the business profile (stored as vars so documents stay stable). */
export function ourVars(b: BusinessData, spaceTitle: string): Record<string, string> {
  const p = b.profile;
  const entity = [p.jurisdiction && p.entityType ? `a ${p.jurisdiction} ${p.entityType}` : p.entityType ? `a ${p.entityType}` : ''].filter(Boolean).join('');
  return {
    ourName: p.legalName || spaceTitle,
    ourEntity: entity,
    ourAddress: p.address ?? '',
    ourSigner: p.ownerName ?? '',
    ourTitle: p.signerTitle || (p.type === 'partner' ? p.role ?? '' : 'Owner'),
    ourEmail: p.email ?? '',
  };
}

export function partyFrom(kind: LegalDoc['partyKind'], c?: Client, k?: Contractor): LegalParty {
  if (kind === 'client' && c) return { name: c.name || c.company || '', company: c.company, address: c.address, email: c.email };
  if (kind === 'contractor' && k) return { name: k.name, company: k.company, address: k.address, email: k.email };
  return { name: '' };
}

export function templateDefaults(t: LegalTemplate, ctx: DefaultsCtx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of t.fields) {
    const v = f.default?.(ctx);
    if (v != null && v !== '') out[f.key] = v;
  }
  return out;
}

export function missingRequired(t: LegalTemplate, vars: Record<string, string>, party: LegalParty): string[] {
  const miss = t.fields.filter((f) => f.required && (!f.when || f.when(vars)) && !String(vars[f.key] ?? '').trim()).map((f) => f.label);
  if (!party.name?.trim()) miss.unshift('Other party’s name');
  return miss;
}

/* ---------------------------------------------------------------- build */

export function buildLegal(doc: Pick<LegalDoc, 'templateId' | 'party' | 'vars' | 'partyKind' | 'title'>, money: (n: number) => string): BuiltLegal {
  const t = TEMPLATE_BY_ID[doc.templateId] ?? nda;
  const v = { ...(doc.vars ?? {}) };
  const roles = t.roles(doc.partyKind);
  const us = { name: v.ourName ?? '', entity: v.ourEntity || undefined, address: v.ourAddress, email: v.ourEmail, title: v.ourTitle, signer: v.ourSigner } as LegalParty & { entity?: string; signer?: string };
  // the signer signs for the business
  const usParty: LegalParty & { entity?: string } = { name: us.name, entity: us.entity, address: us.address, email: us.email, title: us.title };
  const them = doc.party ?? { name: '' };
  const fmtMoney = (key: string) => {
    const n = Number(String(v[key] ?? '').replace(/[^0-9.\-]/g, ''));
    return v[key] != null && String(v[key]).trim() !== '' && isFinite(n) ? money(n) : BLANK;
  };
  if (doc.templateId === 'payment_plan') {
    const n = Math.max(1, Math.round(Number(v.installments) || 1));
    const total = Number(v.amount) || 0;
    const each = Math.floor((total / n) * 100) / 100;
    v.__fmtEach = money(each);
    v.__fmtLast = money(Math.round((total - each * (n - 1)) * 100) / 100);
  }
  const ctx: BuildCtx = {
    v,
    us: usParty,
    them,
    U: roles.us,
    T: roles.them,
    t: (key, blank = BLANK) => (String(v[key] ?? '').trim() ? String(v[key]).trim() : blank),
    money: fmtMoney,
    date: (key) => longDate(v[key]) || BLANK,
    yes: (key) => v[key] === 'yes' || v[key] === 'true',
  };
  const built = t.build(ctx);
  const signatures: SignatureBlock[] = built.signatures ?? [
    { role: roles.us, name: us.name, company: undefined, title: us.title },
    { role: roles.them, name: them.company && them.company !== them.name ? them.company : them.name, title: them.title },
  ];
  // the business signs through its signer: show the signer's name with the company
  for (const s of signatures) {
    if (s.role === roles.us && (s.name === us.name || !s.name)) {
      s.company = us.name;
      s.name = us.signer ?? '';
    } else if (s.role === roles.them && them.company && them.company !== them.name) {
      s.company = them.company;
      s.name = them.name;
    }
  }
  return { title: built.title ?? t.name, subtitle: built.subtitle, letter: built.letter, preamble: built.preamble, sections: built.sections, closing: built.closing, signatures };
}

/** Plain-text rendering (agents, copy to clipboard). */
export function legalText(b: BuiltLegal): string {
  const out: string[] = [];
  if (b.letter) {
    out.push(b.letter.date, '', ...b.letter.to, '', `Re: ${b.letter.re}`, '', b.letter.salutation, '');
  } else {
    out.push(b.title.toUpperCase());
    if (b.subtitle) out.push(b.subtitle);
    out.push('');
  }
  out.push(...b.preamble.flatMap((p) => [p, '']));
  b.sections.forEach((s, i) => {
    out.push(`${i + 1}. ${s.heading.toUpperCase()}`);
    if (s.clauses.length === 1) out.push(s.clauses[0]);
    else s.clauses.forEach((c, j) => out.push(`${i + 1}.${j + 1} ${c}`));
    out.push('');
  });
  out.push(...b.closing.flatMap((p) => [p, '']));
  for (const s of b.signatures) {
    out.push(`${s.role.toUpperCase()}${s.company ? ` — ${s.company}` : ''}`, 'Signature: ______________________________', `Name: ${s.name || '______________________'}`, ...(s.title ? [`Title: ${s.title}`] : []), 'Date: ______________________', '');
  }
  out.push(`(${LEGAL_DISCLAIMER})`);
  return out.join('\n');
}

export function partyLabel(kind: LegalDoc['partyKind'], b: BusinessData, id?: string): string {
  if (kind === 'client') return clientName(b.clients.find((c) => c.id === id));
  if (kind === 'contractor') return b.contractors.find((c) => c.id === id)?.name ?? '';
  return '';
}

/** Create a document from a template (not yet stored). */
export function draftDoc(b: BusinessData, spaceTitle: string, templateId: LegalTemplateId, partyKind: LegalDoc['partyKind'], partyId: string | undefined, money: (n: number) => string, partyName?: string): LegalDoc {
  const t = TEMPLATE_BY_ID[templateId];
  const client = partyKind === 'client' ? b.clients.find((c) => c.id === partyId) : undefined;
  const contractor = partyKind === 'contractor' ? b.contractors.find((c) => c.id === partyId) : undefined;
  const today = todayISO();
  const party = partyFrom(partyKind, client, contractor);
  if (!party.name && partyName) party.name = partyName;
  const vars = { ...ourVars(b, spaceTitle), ...templateDefaults(t, { b, partyKind, client, contractor, today, money }) };
  const who = party.company || party.name;
  return { id: uid('doc'), templateId, title: `${t.name}${who ? ` — ${who}` : ''}`, partyKind, partyId: client?.id ?? contractor?.id, party, vars, status: 'draft', createdAt: today };
}
