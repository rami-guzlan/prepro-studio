/* Sample library data for the self-test and demos (fills the lists of an existing
   sample business): strategy (plan, offers, goals, priorities, SWOT, competitors),
   growth initiatives with check-ins, workflows / SOPs with runs, and library
   resources. All fictional (example.com). Dates are relative to today. */
import { addDays } from '@/lib/dates';
import type { BizResource, BusinessData, Initiative, Sop } from './types';
import { quarterOf } from './modules/strategy/ops';
import { STARTER_SOPS, sopFromStarter } from './modules/sops/ops';

export function sampleLibrary(b: BusinessData, today: string): void {
  const d = (n: number) => addDays(today, n);
  const q = quarterOf(today);
  const lastQ = quarterOf(addDays(`${today.slice(0, 7)}-01`, -80));

  /* ---------------------------------------------------------------- strategy */
  b.strategy = {
    ...b.strategy,
    mission: 'Help independent food, drink and gear brands tell their story with cinematic video that actually sells — without agency overhead.',
    vision: 'In three years: the go-to small studio on the West Coast for consumer brands, with a team of four, a waiting list and 40% of revenue from retainers.',
    positioning: 'For growing consumer brands who need scroll-stopping video every month, Northlight is the creator-run studio that plans, shoots and edits fast — unlike agencies, you work directly with the director and pay for footage, not meetings.',
    idealClient: 'Independent consumer brands (coffee, food & drink, outdoor / camera gear) with $1–20M revenue and a 1–3 person marketing team. They post weekly, have no in-house video team and a $2–10k monthly content budget. Found via Instagram, referrals and trade shows.',
    uniqueValue: 'Director-led shoots with a YouTube channel audience of 85k creators and gear nerds; brand films and the social cut-downs from one shoot day; 10-day turnaround.',
    pricingStrategy: 'Value-based packages, never hourly for production. Minimum project $2,500. Monthly retainers get 10% off and first booking priority. Raise day rate every January; sponsorship rates follow channel views (CPM $35–45).',
    marketingPlan: 'YouTube channel (2 videos / month) as proof of craft; Instagram showreel posts and Reels 3× a week; quarterly case study; referral bonus for past clients; booth visits at 2 trade shows a year.',
    salesProcess: 'Inquiry form → 20-min discovery call within 48 h → treatment + proposal in 3 days → services agreement + 50% deposit → kickoff. Follow up on proposals after 3 and 7 days.',
    swot: {
      strengths: '• Director + editor in one, fast turnaround\n• Channel audience lends credibility with gear brands\n• Strong repeat client (Brightline)',
      weaknesses: '• Two clients make up most client revenue\n• No written processes — hard to delegate\n• Sales happen only when there is free time',
      opportunities: '• Brands moving budget from agencies to creators\n• Productized social packs (monthly)\n• Partnering with local branding agencies that don’t do video',
      threats: '• Cheaper AI-generated product video\n• Platform algorithm changes reduce channel reach\n• Client budgets cut in a downturn',
    },
    offers: [
      { id: 'offer_brand', name: 'Brand film package', price: 5500, priceNote: 'from', description: 'Creative treatment, 1 shoot day with crew and lighting, 60–120 s brand film, 2 revision rounds, color and sound mix.', idealFor: 'Launches, website hero videos, investor and trade-show screens', active: true },
      { id: 'offer_social', name: 'Monthly social content pack', price: 2400, priceNote: 'per month', description: '1 half-day shoot per month → 8 vertical edits with captions, 20 stills, a content calendar and posting-ready copy.', idealFor: 'Brands that post weekly and have no in-house video team', active: true },
      { id: 'offer_spons', name: 'Channel sponsorship', price: 3000, priceNote: 'per integration', description: '60–90 s dedicated integration in a YouTube video, 3 Instagram Stories with link sticker, usage rights for 30 days.', idealFor: 'Camera, lighting and creator-gear brands', active: true },
      { id: 'offer_photo', name: 'Product photography day', price: 1800, priceNote: 'per day', description: 'Up to 25 edited product images for web and print, studio and lighting included.', idealFor: 'E-commerce catalog refreshes', active: false },
    ],
    goals: [
      { id: 'goal_rev', title: 'Revenue this year', metric: 'revenue', target: 85000, period: 'ytd', due: `${today.slice(0, 4)}-12-31` },
      { id: 'goal_clients', title: 'New clients this year', metric: 'clients', target: 4, period: 'ytd', due: `${today.slice(0, 4)}-12-31` },
      { id: 'goal_deals', title: 'Deals won this quarter', metric: 'deals_won', target: 3, period: 'this_quarter' },
      { id: 'goal_news', title: 'Newsletter subscribers', metric: 'custom', current: 640, target: 1500, due: d(120) },
    ],
    priorities: [
      { id: 'prio_1', text: 'Launch the monthly social content pack and sell it to 2 clients', quarter: q, done: false },
      { id: 'prio_2', text: 'Write down onboarding, delivery and bookkeeping as SOPs', quarter: q, done: true },
      { id: 'prio_3', text: 'Run the showreel ads test and decide: scale or stop', quarter: q, done: false },
      { id: 'prio_4', text: 'Publish the Brightline case study', quarter: q, done: false },
      { id: 'prio_5', text: 'Raise the day rate for new clients', quarter: lastQ, done: true },
      { id: 'prio_6', text: 'Hire a second editor on a per-video rate', quarter: lastQ, done: true },
    ],
    competitors: [
      { id: 'comp_1', name: 'Harbor & Pine Creative', url: 'https://harborpine.example.com', strengths: 'Full-service agency, big-name clients, strategy team', weaknesses: 'Slow (6–8 weeks), $15k minimum, junior crews on smaller jobs', notes: 'Loses smaller brands on price and speed — our sweet spot.' },
      { id: 'comp_2', name: 'Freelance shooters on marketplaces', url: 'https://marketplace.example.com', strengths: 'Cheap and available on short notice', weaknesses: 'No creative direction, inconsistent quality, no editing pipeline', notes: 'Position the social pack against these: planning + consistency.' },
    ],
    notes: 'Review this page at the start of each quarter. Numbers in Goals update from Income, Clients and the Sales Pipeline.',
  };

  /* ---------------------------------------------------------------- growth */
  const hasAds = b.expenses.some((e) => e.id === 'exp_ads');
  const ads: Initiative = {
    id: 'init_ads',
    title: 'Showreel ads → inbound leads',
    status: 'in_progress',
    area: 'Marketing',
    goalId: 'goal_clients',
    hypothesis: 'If we run the 45 s showreel as Instagram ads to marketing managers of consumer brands on the West Coast, we get 3+ extra inbound inquiries a month at under $100 per inquiry.',
    owner: 'Jordan',
    startDate: d(-49),
    dueDate: d(41),
    kpi: 'Inbound inquiries / month',
    baseline: 2,
    target: 6,
    budget: 600,
    spend: 120,
    impact: 4,
    effort: 2,
    steps: [
      { id: 'task_ads_1', title: 'Cut a 45 s vertical showreel', done: true, due: d(-45) },
      { id: 'task_ads_2', title: 'Set up the inquiry form with “How did you hear about us?”', done: true, due: d(-44) },
      { id: 'task_ads_3', title: 'Launch audience A (marketing managers, food & drink)', done: true, due: d(-40) },
      { id: 'task_ads_4', title: 'Launch audience B (camera & outdoor gear)', done: false, due: d(3) },
      { id: 'task_ads_5', title: 'Decide: scale, change or stop', done: false, due: d(41) },
    ],
    updates: [
      { id: 'upd_ads_1', date: d(-42), value: 2, note: 'Ads live. Baseline month: 2 inquiries, both referrals.' },
      { id: 'upd_ads_2', date: d(-35), value: 3, note: 'First ad lead (coffee roaster). CTR 1.4%.' },
      { id: 'upd_ads_3', date: d(-28), value: 3, note: 'Swapped the first 3 seconds of the reel for the latte-art shot.' },
      { id: 'upd_ads_4', date: d(-21), value: 4, note: 'CTR up to 2.1%. One lead booked a discovery call.' },
      { id: 'upd_ads_5', date: d(-14), value: 4, note: 'Cost per inquiry ~$68.' },
      { id: 'upd_ads_6', date: d(-7), value: 5, note: 'Two inquiries this week; one wants the monthly pack.' },
    ],
    results: 'So far: cost per inquiry ~$68, well under the $100 limit. Food & drink converts better than expected.',
  };
  if (hasAds) for (const e of b.expenses) if (e.id === 'exp_ads') e.initiativeId = ads.id;
  ads.current = 5;
  b.initiatives = [
    ads,
    {
      id: 'init_pack',
      title: 'Productize the monthly social content pack',
      status: 'planned',
      area: 'Offers & pricing',
      goalId: 'goal_rev',
      hypothesis: 'A fixed monthly pack is easier to buy than custom quotes and turns one-off clients into retainers.',
      owner: 'Jordan',
      startDate: d(7),
      dueDate: d(70),
      kpi: 'Packs sold (active retainers)',
      baseline: 0,
      target: 3,
      budget: 250,
      impact: 5,
      effort: 3,
      steps: [
        { id: 'task_pack_1', title: 'Write the one-pager and pricing', done: true },
        { id: 'task_pack_2', title: 'Build the sample content calendar', done: false, due: d(10) },
        { id: 'task_pack_3', title: 'Offer it to Brightline and 5 past clients', done: false, due: d(21) },
        { id: 'task_pack_4', title: 'Landing page + case study', done: false, due: d(35) },
      ],
      updates: [],
    },
    {
      id: 'init_agency',
      title: 'Referral partnership with 2 branding agencies',
      status: 'idea',
      area: 'Partnerships',
      goalId: 'goal_deals',
      hypothesis: 'Branding agencies without video capacity will refer their clients for a 10% referral fee.',
      kpi: 'Referred deals',
      baseline: 0,
      target: 2,
      impact: 3,
      effort: 4,
      steps: [
        { id: 'task_ag_1', title: 'List 10 agencies in the Bay Area', done: false },
        { id: 'task_ag_2', title: 'Draft the referral agreement', done: false },
      ],
      updates: [],
    },
  ];

  /* ---------------------------------------------------------------- resources */
  const lib: BizResource[] = [
    {
      id: 'res_brand',
      title: 'Brand assets & logo pack',
      section: 'library',
      category: 'brand',
      kind: 'link',
      url: 'https://drive.example.com/northlight/brand',
      description: 'Logos (SVG / PNG, light & dark), colors, fonts and the brand guidelines PDF.',
      tags: ['logo', 'brand'],
      pinned: true,
      updatedAt: d(-30),
    },
    {
      id: 'res_welcome',
      title: 'Welcome email — new client',
      section: 'library',
      category: 'template',
      kind: 'text',
      text:
        'Subject: Welcome to Northlight — next steps for [Project name]\n\nHi [First name],\n\nThank you for choosing Northlight! I’m excited to get started on [Project name].\n\nHere is what happens next:\n1. Signed agreement + deposit invoice (attached) — the shoot date is reserved once the deposit is in.\n2. A short intake questionnaire: [link] (10 minutes).\n3. Kickoff call — pick a time that suits you: [booking link].\n\nYour shared folder for briefs, logos and references: [folder link].\n\nTalk soon,\nJordan Avery\nNorthlight Media',
      description: 'Send right after the proposal is accepted.',
      tags: ['onboarding', 'email'],
      pinned: true,
      updatedAt: d(-20),
    },
    {
      id: 'res_testimonial',
      title: 'Testimonial request',
      section: 'library',
      category: 'template',
      kind: 'text',
      text: 'Hi [First name],\n\nNow that [Project name] is live, would you share 2–3 sentences about working with us? A few prompts if helpful:\n• What was the challenge before?\n• What was the result?\n• Would you recommend us, and to whom?\n\nMay we use your words (with your name and company) on our website and social media?\n\nThank you!\nJordan',
      tags: ['delivery', 'email'],
      updatedAt: d(-60),
    },
    {
      id: 'res_gear',
      title: 'Shoot day gear checklist',
      section: 'library',
      category: 'checklist',
      kind: 'text',
      text: '☐ FX3 + 2 batteries charged + spare\n☐ CFexpress cards formatted (3)\n☐ 24-70, 35, 85 lenses + ND filters\n☐ Tripod, gimbal, slider\n☐ 2 × LED panels + softboxes + stands\n☐ Wireless mics + lav + spare batteries\n☐ Laptop + card reader + backup SSD\n☐ Release forms and call sheet (printed)',
      tags: ['shoot', 'gear'],
      updatedAt: d(-45),
    },
    {
      id: 'res_books',
      title: 'Bookkeeping app',
      section: 'library',
      category: 'tool',
      kind: 'link',
      url: 'https://books.example.com/northlight',
      description: 'Bank feeds, receipts and the accountant’s access.',
      tags: ['finance'],
      updatedAt: d(-90),
    },
    {
      id: 'res_w9',
      title: 'W-9 form (blank, IRS)',
      section: 'library',
      category: 'contract',
      kind: 'link',
      url: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf',
      description: 'Send to new US contractors before the first payment.',
      tags: ['contractors', 'tax'],
      updatedAt: d(-120),
    },
  ];
  b.resources = [...b.resources.filter((r) => !lib.some((x) => x.id === r.id)), ...lib];

  /* ---------------------------------------------------------------- workflows & SOPs */
  const [onb, del, books, rep] = STARTER_SOPS.map((st) => sopFromStarter(st, { updatedAt: d(-14) }));
  const sops: Sop[] = [
    { ...onb, id: 'sop_onboarding', resourceIds: ['res_welcome', 'res_brand'] },
    { ...del, id: 'sop_delivery', resourceIds: ['res_testimonial'] },
    { ...books, id: 'sop_books', resourceIds: ['res_books'] },
    { ...rep, id: 'sop_repurpose', resourceIds: ['res_brand'], owner: 'Jordan + Sam (editor)' },
  ];
  sops[0].runs = [{ id: 'run_onb_1', label: 'Brightline Coffee — holiday campaign', startedAt: d(-3), done: sops[0].steps.slice(0, 3).map((s) => s.id) }];
  sops[2].runs = [{ id: 'run_books_1', label: 'Last month', startedAt: d(-20), finishedAt: d(-18), done: sops[2].steps.map((s) => s.id) }];
  b.sops = sops;
}
