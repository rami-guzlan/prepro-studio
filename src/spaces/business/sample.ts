/* Sample business data for the self-test and demos: a small video studio with
   two clients, two contractors (pay logs), invoices in every state, a year of
   income and expenses, time entries and generated agreements. All fictional
   (example.com domains, 555 numbers). Dates are relative to today. */
import { addDays, parseISODate, todayISO } from '@/lib/dates';
import type { BusinessData, ContractorPayment, Expense, IncomeEntry, Invoice, TimeEntry } from './types';
import { normalizeBusiness } from './types';
import { addMonths, invoiceTotal } from './derive';
import { draftDoc, longDate } from './templates';
import { sampleSales } from './sample-sales';
import { sampleWork } from './sample-work';
import { sampleLibrary } from './sample-library';

export function sampleBusiness(): BusinessData {
  const today = todayISO();
  const d = (n: number) => addDays(today, n);
  const short = (iso: string) => parseISODate(iso)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? iso;
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const b = normalizeBusiness({
    profile: {
      type: 'creator',
      legalName: 'Northlight Media LLC',
      entityType: 'limited liability company',
      ownerName: 'Jordan Avery',
      signerTitle: 'Managing Member',
      email: 'hello@northlight.example.com',
      phone: '(555) 010-2244',
      website: 'https://northlight.example.com',
      address: '1450 Harbor Avenue, Suite 3\nOakland, CA 94607',
      jurisdiction: 'California',
      taxId: '88-1234567',
    },
    settings: {
      invoicePrefix: 'NL-',
      nextInvoiceNumber: 1,
      paymentTermsDays: 14,
      hourlyRate: 85,
      paymentInstructions: 'Bank transfer to Northlight Media LLC\nFirst Coastal Bank · Routing 000000000 · Account 0000000000\nOr pay by card: https://pay.northlight.example.com',
      invoiceNotes: 'Thank you for working with Northlight!',
    },
  });

  b.streams = [
    { id: 'str_client', name: 'Client video production', type: 'client_work', expectedMonthly: 6000, active: true, notes: 'Brand films, social cut-downs and product shoots.' },
    { id: 'str_spons', name: 'Brand sponsorships', type: 'sponsorship', expectedMonthly: 2500, active: true, notes: 'Integrations on the YouTube channel and Instagram.' },
    { id: 'str_ads', name: 'YouTube AdSense', type: 'royalties', expectedMonthly: 550, active: true, notes: 'Paid around the 9th for the previous month.' },
  ];

  b.clients = [
    { id: 'cli_bright', name: 'Maya Chen', company: 'Brightline Coffee Co.', email: 'maya@brightline.example.com', phone: '(555) 014-8890', address: '88 Mission Street\nSan Francisco, CA 94105', defaultRate: 95, termsDays: 14, notes: 'Marketing lead. Approves invoices herself; prefers one consolidated invoice per month.' },
    { id: 'cli_lumen', name: 'Diego Ramos', company: 'Lumen Gear', email: 'partnerships@lumengear.example.com', phone: '(555) 019-3301', address: '2200 Industrial Way, Unit 12\nPortland, OR 97210', defaultRate: 110, termsDays: 30, notes: 'Camera lighting brand. Sponsorships go through the partnerships inbox; PO number required on invoices.' },
  ];

  b.contractors = [
    {
      id: 'ctr_sam',
      name: 'Sam Okafor',
      role: 'Video editor',
      email: 'sam@okafor-edits.example.com',
      phone: '(555) 017-4420',
      address: '310 Lake Park Avenue\nOakland, CA 94610',
      rateType: 'deliverable',
      rate: 350,
      rateNote: 'per edited long-form video, incl. 2 revision rounds',
      paymentTerms: 'within 15 days of receipt of an invoice',
      agreedOn: d(-92),
      scope: 'Editing of long-form YouTube videos and client brand films from provided footage: assembly, rough cut, fine cut, color, sound mix and captions.',
      taxForm: 'w9',
      startDate: d(-90),
      active: true,
    },
    {
      id: 'ctr_priya',
      name: 'Priya Nair',
      role: 'Motion designer',
      company: 'Nair Motion Studio',
      email: 'priya@nairmotion.example.com',
      rateType: 'hourly',
      rate: 55,
      paymentTerms: 'Net 30',
      scope: 'Animated titles, lower thirds and end cards for client videos.',
      taxForm: 'requested',
      startDate: d(-45),
      active: true,
    },
  ];

  /* contractor pay log; paid ones get their linked expense like the app does */
  const pays: ContractorPayment[] = [
    { id: 'cpay_1', contractorId: 'ctr_sam', date: d(-78), amount: 350, description: 'Edit — Brightline brand film', reference: 'SO-101', method: 'bank', status: 'paid', paidDate: d(-74) },
    { id: 'cpay_2', contractorId: 'ctr_sam', date: d(-48), amount: 700, description: 'Edits — channel episodes 14 & 15', reference: 'SO-104', method: 'bank', status: 'paid', paidDate: d(-44) },
    { id: 'cpay_3', contractorId: 'ctr_sam', date: d(-18), amount: 350, description: 'Edit — Lumen Gear integration', reference: 'SO-107', method: 'bank', status: 'paid', paidDate: d(-15) },
    { id: 'cpay_4', contractorId: 'ctr_sam', date: d(-3), amount: 700, description: 'Edits — channel episodes 16 & 17', reference: 'SO-109', method: 'bank', status: 'owed' },
    { id: 'cpay_5', contractorId: 'ctr_priya', date: d(-40), amount: 440, description: 'Title package — 8 h', reference: 'NM-2207', method: 'wise', status: 'paid', paidDate: d(-12) },
    { id: 'cpay_6', contractorId: 'ctr_priya', date: d(5), amount: 330, description: 'End cards & lower thirds — 6 h', reference: 'NM-2214', method: 'wise', status: 'scheduled' },
  ];
  const payExpenses: Expense[] = pays
    .filter((p) => p.status === 'paid')
    .map((p) => {
      const id = `exp_${p.id}`;
      p.expenseId = id;
      return { id, date: p.paidDate!, vendor: p.contractorId === 'ctr_sam' ? 'Sam Okafor' : 'Priya Nair', description: p.description, category: 'contractors', amount: p.amount, method: p.method, deductible: true, contractorId: p.contractorId, paymentId: p.id, reference: p.reference };
    });
  b.payments = pays;

  /* invoices in every state */
  const inv = (x: Partial<Invoice> & Pick<Invoice, 'id' | 'number' | 'issueDate' | 'status' | 'lines'>): Invoice => ({
    paymentInstructions: b.settings.paymentInstructions,
    notes: b.settings.invoiceNotes,
    dueDate: addDays(x.issueDate, 14),
    ...x,
  });
  b.invoices = [
    inv({
      id: 'inv_1',
      number: 'NL-0001',
      clientId: 'cli_bright',
      streamId: 'str_client',
      title: 'Spring brand film',
      issueDate: d(-72),
      dueDate: d(-58),
      status: 'paid',
      sentDate: d(-72),
      paidDate: d(-60),
      method: 'bank',
      lines: [
        { id: 'invl_1a', description: 'Pre-production: creative treatment, script and shot list', qty: 1, unitPrice: 1800 },
        { id: 'invl_1b', description: 'Shoot day — director/DP + camera assistant, camera and lighting package', qty: 1, unitPrice: 2400 },
        { id: 'invl_1c', description: 'Edit, color and sound mix (2 revision rounds)', qty: 1, unitPrice: 1500 },
      ],
    }),
    inv({
      id: 'inv_2',
      number: 'NL-0002',
      clientId: 'cli_lumen',
      streamId: 'str_spons',
      title: 'PO 4471 · X2 launch sponsorship',
      issueDate: d(-36),
      dueDate: d(-6),
      status: 'paid',
      sentDate: d(-36),
      paidDate: d(-21),
      method: 'stripe',
      lines: [
        { id: 'invl_2a', description: 'Dedicated YouTube integration (60–90 s)', qty: 1, unitPrice: 3000 },
        { id: 'invl_2b', description: 'Instagram Stories with link sticker', qty: 3, unitPrice: 250 },
      ],
    }),
    inv({
      id: 'inv_3',
      number: 'NL-0003',
      clientId: 'cli_bright',
      streamId: 'str_client',
      title: 'Social cut-downs',
      issueDate: d(-41),
      dueDate: d(-27),
      status: 'sent',
      sentDate: d(-41),
      discount: 100,
      lines: [
        { id: 'invl_3a', description: 'Social cut-downs from the brand film (9:16, captions)', qty: 6, unitPrice: 220 },
        { id: 'invl_3b', description: 'Rush delivery (48 h)', qty: 1, unitPrice: 150 },
      ],
    }),
    inv({
      id: 'inv_4',
      number: 'NL-0004',
      clientId: 'cli_lumen',
      streamId: 'str_client',
      title: 'PO 4502 · Product photography',
      issueDate: d(-6),
      dueDate: d(24),
      status: 'sent',
      sentDate: d(-6),
      taxPct: 8.5,
      lines: [
        { id: 'invl_4a', description: 'Product photography — 20 edited images (web + print)', qty: 20, unitPrice: 45 },
        { id: 'invl_4b', description: 'Studio rental and lighting', qty: 1, unitPrice: 300 },
      ],
    }),
    inv({
      id: 'inv_5',
      number: 'NL-0005',
      clientId: 'cli_bright',
      streamId: 'str_client',
      title: 'Holiday campaign — pre-production',
      issueDate: today,
      status: 'draft',
      lines: [
        { id: 'invl_5a', description: `${short(d(-9))} — Holiday campaign concepts & mood board`, qty: 3, unitPrice: 95, timeEntryIds: ['time_inv5a'] },
        { id: 'invl_5b', description: `${short(d(-8))} — Client workshop`, qty: 1.5, unitPrice: 95, timeEntryIds: ['time_inv5b'] },
      ],
    }),
  ];

  /* income: linked entries for paid invoices + AdSense + older client work */
  const income: IncomeEntry[] = [];
  for (const i of b.invoices.filter((x) => x.status === 'paid')) income.push({ id: `inc_${i.id}`, date: i.paidDate!, amount: invoiceTotal(i), invoiceId: i.id, clientId: i.clientId, streamId: i.streamId, description: `Invoice ${i.number}`, method: i.method });
  const adsense = [412, 455, 438, 501, 489, 530, 562, 548, 601, 577, 640, 618];
  adsense.forEach((amt, i) => {
    const m = 11 - i;
    const date = addMonths(`${today.slice(0, 7)}-09`, -m);
    if (date <= today) income.push({ id: `inc_ads_${i}`, date, amount: amt + 0.37 * i, streamId: 'str_ads', description: 'YouTube AdSense payout', method: 'bank' });
  });
  const older: [number, number, string, string, string][] = [
    [-330, 3200, 'cli_bright', 'str_client', 'Café opening promo video'],
    [-290, 1850, 'cli_bright', 'str_client', 'Menu photography'],
    [-255, 2500, 'cli_lumen', 'str_spons', 'Sponsored review — LED panel'],
    [-210, 4100, 'cli_bright', 'str_client', 'Summer social campaign'],
    [-170, 2750, 'cli_lumen', 'str_spons', 'Sponsored tutorial series (2 videos)'],
    [-130, 3600, 'cli_lumen', 'str_client', 'Trade-show booth video'],
    [-100, 2300, 'cli_bright', 'str_client', 'Barista training videos'],
    [-4, 1200, 'cli_lumen', 'str_spons', 'Sponsored Reel — tripod launch (paid via platform)'],
  ];
  older.forEach(([off, amount, clientId, streamId, description], i) => income.push({ id: `inc_old_${i}`, date: d(off), amount, clientId, streamId, description, method: 'bank' }));
  b.income = income;

  /* expenses */
  const ex = (id: string, off: number, vendor: string, category: string, amount: number, extra: Partial<Expense> = {}): Expense => ({ id, date: d(off), vendor, category, amount, deductible: true, method: 'card', ...extra });
  b.expenses = [
    ...[-62, -32, -2].map((o, i) => ex(`exp_adobe_${i}`, o, 'Adobe', 'software', 59.99, { description: 'Creative Cloud — all apps', recurring: 'monthly' })),
    ...[-70, -40].map((o, i) => ex(`exp_music_${i}`, o, 'Epidemic Sound', 'software', 15.99, { description: 'Music licence — personal/commercial', recurring: 'monthly' })),
    ex('exp_gws', -8, 'Google Workspace', 'software', 14, { description: 'Email & drive', recurring: 'monthly' }),
    ex('exp_desk', -12, 'Harbor Cowork', 'office', 250, { description: 'Coworking desk', recurring: 'monthly', method: 'bank' }),
    ex('exp_cards', -50, 'B&H Photo', 'equipment', 289.5, { description: 'Batteries and CFexpress cards for FX3', reference: 'BH-88213' }),
    ex('exp_mic', -101, 'Rode', 'equipment', 299, { description: 'Wireless GO II mic kit' }),
    ex('exp_train', -73, 'Amtrak', 'travel', 64.5, { description: 'Train to Brightline shoot (crew of 2)' }),
    ex('exp_lunch', -73, 'Plaza Deli', 'meals', 118.4, { description: 'Crew lunch on the shoot day' }),
    ex('exp_ads', -20, 'Meta', 'marketing', 150, { description: 'Instagram ads — showreel promotion' }),
    ex('exp_stripe', -20, 'Stripe', 'fees', 109.05, { description: 'Card processing fees', method: 'other' }),
    ex('exp_license', -200, 'City of Oakland', 'taxes', 95, { description: 'Business licence renewal', recurring: 'yearly', method: 'bank' }),
    ex('exp_lens', -160, 'KEH Camera', 'equipment', 640, { description: 'Used 35mm lens' }),
    ex('exp_hdd', -240, 'B&H Photo', 'equipment', 219.99, { description: '2 × 8 TB archive drives' }),
    ex('exp_flight', -185, 'Alaska Airlines', 'travel', 278.4, { description: 'Flight to Portland — Lumen trade-show shoot' }),
    ex('exp_hotel', -184, 'Hotel Lucia', 'travel', 342, { description: '2 nights — Lumen trade-show shoot' }),
    ex('exp_acct', -120, 'Pine & Co. Accounting', 'fees', 450, { description: 'Quarterly bookkeeping and tax estimate', method: 'bank', deductible: true }),
    ex('exp_coffee', -5, 'Blue Door Café', 'meals', 18.75, { description: 'Coffee with prospective client', deductible: false }),
    ...payExpenses,
  ];

  /* time */
  const t = (id: string, off: number, start: string, end: string, minutes: number, clientId: string | undefined, description: string, billable = true, invoiceId?: string): TimeEntry => ({ id, date: d(off), start, end, minutes, clientId, description, billable, invoiceId });
  b.time = [
    t('time_1', 0, '09:30', '11:30', 120, 'cli_bright', 'Holiday campaign storyboard'),
    t('time_2', 0, '14:00', '14:45', 45, 'cli_lumen', 'Call: Q1 sponsorship planning'),
    t('time_3', -1, '10:00', '13:15', 195, 'cli_lumen', 'Product shoot prep — shot list & lighting plan'),
    t('time_4', -1, '16:00', '17:00', 60, undefined, 'Bookkeeping and invoices', false),
    t('time_5', -2, '09:00', '12:00', 180, 'cli_bright', 'Holiday campaign script draft'),
    t('time_6', -3, '13:00', '14:30', 90, undefined, 'Channel planning & thumbnails', false),
    t('time_7', -5, '10:00', '12:30', 150, 'cli_lumen', 'Photo retouching round 2'),
    t('time_8', -6, '11:00', '12:00', 60, 'cli_bright', 'Feedback call on cut-downs'),
    t('time_inv5a', -9, '09:00', '12:00', 180, 'cli_bright', 'Holiday campaign concepts & mood board', true, 'inv_5'),
    t('time_inv5b', -8, '15:00', '16:30', 90, 'cli_bright', 'Client workshop', true, 'inv_5'),
    t('time_9', -12, '13:00', '15:00', 120, undefined, 'Pitch deck for a new client', false),
    t('time_10', -15, '10:00', '11:00', 60, 'cli_lumen', 'Sponsorship script review', true),
  ];

  /* legal documents */
  const sam = draftDoc(b, 'Northlight Studio', 'contractor', 'contractor', 'ctr_sam', money);
  sam.id = 'doc_sam';
  sam.createdAt = d(-92);
  sam.vars.effectiveDate = d(-92);
  sam.vars.startDate = d(-90);
  sam.vars.deliverables = 'Final masters (4K, H.264 and ProRes), project files on request, captions (SRT) and thumbnails stills.';
  sam.vars.invoicing = 'milestone';
  sam.status = 'signed';
  sam.sentDate = d(-92);
  sam.signedDate = d(-90);

  const lumen = draftDoc(b, 'Northlight Studio', 'sponsorship', 'client', 'cli_lumen', money);
  lumen.id = 'doc_lumen';
  lumen.createdAt = d(-12);
  lumen.vars.effectiveDate = d(-10);
  lumen.vars.product = 'the Lumen X3 portable light';
  lumen.vars.deliverables = '1 × dedicated YouTube integration (60–90 s) in a lighting tutorial, 3 × Instagram Stories with link sticker, 1 × TikTok / Reel';
  lumen.vars.postDates = `between ${longDate(d(12))} and ${longDate(d(26))}`;
  lumen.vars.fee = '4200';
  lumen.vars.exclusivity = 'portable LED lighting';
  lumen.vars.exclusivityDays = '30';
  lumen.vars.paidDays = '30';
  lumen.status = 'sent';
  lumen.sentDate = d(-10);
  lumen.expiresDate = d(60);

  const nda = draftDoc(b, 'Northlight Studio', 'nda', 'client', 'cli_bright', money);
  nda.id = 'doc_nda';
  nda.createdAt = d(-2);
  nda.vars.purpose = 'discussing Brightline’s unreleased holiday product line and a related video campaign';
  b.docs = [sam, lumen, nda];

  sampleWork(b, today);
  sampleSales(b, today);
  sampleLibrary(b, today);
  return b;
}
