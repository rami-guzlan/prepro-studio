/* Sample work data for the self-test and demos (fills the lists of an existing sample business):
   four business projects (done, two active, planning) with tasks & milestones, contractors,
   fee / budget, and existing sample invoices, income, expenses, time, contractor pay and
   documents linked to them so the project financials show real numbers.
   Project ids (stable, for other samples): bproj_brand, bproj_holiday, bproj_lumen, bproj_barista. */
import { addDays } from '@/lib/dates';
import type { BizProject, BizTask, BusinessData } from './types';

export function sampleWork(b: BusinessData, today: string): void {
  const d = (n: number) => addDays(today, n);
  let seq = 0;
  const task = (title: string, due: number | undefined, done: boolean, extra: Partial<BizTask> = {}): BizTask => ({ id: `task_s${++seq}`, title, due: due == null ? undefined : d(due), done, ...extra });

  const projects: BizProject[] = [
    {
      id: 'bproj_brand',
      name: 'Brightline spring brand film',
      status: 'done',
      clientId: 'cli_bright',
      startDate: d(-96),
      dueDate: d(-64),
      completedDate: d(-62),
      fee: 7070,
      feeType: 'fixed',
      budget: 1200,
      contractorIds: ['ctr_sam'],
      docIds: [],
      color: '#e8590c',
      description: 'A 90-second brand film for Brightline’s spring menu launch, plus six vertical cut-downs for social.',
      deliverables: '1 × 90 s brand film (16:9, 4K master)\n6 × 15 s social cut-downs (9:16, captions)\nStills for the website\n2 revision rounds',
      tasks: [
        task('Creative treatment & script', -88, true, { assignee: 'me' }),
        task('Location scout at the Mission St café', -80, true, { assignee: 'me' }),
        task('Shoot day', -73, true, { milestone: true, assignee: 'me' }),
        task('First cut', -66, true, { milestone: true, assignee: 'ctr_sam' }),
        task('Colour, sound mix & final delivery', -62, true, { milestone: true, assignee: 'ctr_sam' }),
        task('Social cut-downs', -42, true, { assignee: 'me' }),
      ],
      notes: 'Client loved the café-at-dawn opening; reuse the look for the holiday campaign.',
    },
    {
      id: 'bproj_holiday',
      name: 'Brightline holiday campaign',
      status: 'active',
      clientId: 'cli_bright',
      startDate: d(-10),
      dueDate: d(45),
      fee: 9500,
      feeType: 'fixed',
      budget: 2500,
      contractorIds: ['ctr_sam', 'ctr_priya'],
      docIds: [],
      color: '#c92a2a',
      description: 'Holiday campaign for Brightline’s new seasonal line: a 60-second hero spot, cut-downs and product stills. Under NDA until launch.',
      deliverables: '1 × 60 s hero spot (16:9 + 9:16)\n4 × 15 s cut-downs with end cards\n12 product stills\nLower thirds & end-card package',
      tasks: [
        task('Concepts & mood board', -9, true, { assignee: 'me' }),
        task('Client workshop', -8, true, { assignee: 'me' }),
        task('Script draft', -1, true, { assignee: 'me' }),
        task('Storyboard & shot list', 4, false, { assignee: 'me' }),
        task('End cards & lower thirds', 5, false, { assignee: 'ctr_priya' }),
        task('Shoot day', 18, false, { milestone: true, assignee: 'me' }),
        task('First cut to client', 30, false, { milestone: true, assignee: 'ctr_sam' }),
        task('Final delivery', 45, false, { milestone: true, assignee: 'ctr_sam' }),
      ],
    },
    {
      id: 'bproj_lumen',
      name: 'Lumen Gear launch partnership',
      status: 'active',
      clientId: 'cli_lumen',
      startDate: d(-40),
      dueDate: d(26),
      fee: 9250,
      feeType: 'retainer',
      budget: 900,
      contractorIds: ['ctr_sam'],
      docIds: [],
      color: '#15aabf',
      description: 'Sponsored content and product photography around Lumen’s X2 and X3 light launches.',
      deliverables: 'X2: dedicated YouTube integration + 3 Instagram Stories\nX3: 20 edited product photos\nX3: YouTube integration, 3 Stories, 1 TikTok / Reel',
      tasks: [
        task('X2 integration live', -24, true, { milestone: true, assignee: 'me' }),
        task('Product shoot prep — shot list & lighting plan', -1, true, { assignee: 'me' }),
        task('Photo retouching round 2', -5, true, { assignee: 'me' }),
        task('Deliver X3 product photos', 3, false, { assignee: 'me' }),
        task('X3 sponsorship agreement signed', 6, false, { assignee: 'me' }),
        task('X3 tutorial with integration', 19, false, { milestone: true, assignee: 'me' }),
        task('Edit X3 integration', 22, false, { assignee: 'ctr_sam' }),
      ],
    },
    {
      id: 'bproj_barista',
      name: 'Barista training series — season 2',
      status: 'planning',
      clientId: 'cli_bright',
      startDate: d(21),
      dueDate: d(70),
      fee: 3200,
      feeType: 'fixed',
      budget: 700,
      contractorIds: [],
      docIds: [],
      color: '#7950f2',
      description: 'Five short training videos for new baristas (espresso, milk, latte art, cleaning, opening checklist).',
      deliverables: '5 × 3–4 min training videos\nPDF checklists for each episode',
      tasks: [
        task('Send proposal & SOW', 6, false, { assignee: 'me' }),
        task('Outline the five episodes', 14, false, { assignee: 'me' }),
        task('Shoot block (2 days)', 40, false, { milestone: true, assignee: 'me' }),
        task('Deliver all episodes', 70, false, { milestone: true, assignee: 'me' }),
      ],
    },
  ];
  b.projects = [...(b.projects ?? []), ...projects.filter((p) => !(b.projects ?? []).some((x) => x.id === p.id))];

  /* link existing sample records (ids from sample.ts; missing ones are skipped) */
  const link = <T extends { id: string; bizProjectId?: string }>(list: T[] | undefined, ids: string[], projectId: string) => {
    for (const x of list ?? []) if (ids.includes(x.id)) x.bizProjectId = projectId;
  };
  link(b.invoices, ['inv_1', 'inv_3'], 'bproj_brand');
  link(b.invoices, ['inv_5'], 'bproj_holiday');
  link(b.invoices, ['inv_2', 'inv_4'], 'bproj_lumen');
  link(b.expenses, ['exp_train', 'exp_lunch'], 'bproj_brand');
  link(b.expenses, ['exp_cards'], 'bproj_lumen');
  link(b.payments, ['cpay_1', 'cpay_5'], 'bproj_brand');
  link(b.payments, ['cpay_6'], 'bproj_holiday');
  link(b.payments, ['cpay_3'], 'bproj_lumen');
  link(b.time, ['time_8'], 'bproj_brand');
  link(b.time, ['time_1', 'time_5', 'time_inv5a', 'time_inv5b'], 'bproj_holiday');
  link(b.time, ['time_2', 'time_3', 'time_7', 'time_10'], 'bproj_lumen');
  link(b.income, ['inc_old_7'], 'bproj_lumen');
  link(b.docs, ['doc_nda'], 'bproj_holiday');
  link(b.docs, ['doc_lumen'], 'bproj_lumen');
  // the contractor agreement with Sam covers all his work; list it on the holiday project too
  const holiday = b.projects.find((p) => p.id === 'bproj_holiday');
  if (holiday && (b.docs ?? []).some((x) => x.id === 'doc_sam') && !holiday.docIds.includes('doc_sam')) holiday.docIds.push('doc_sam');
  if (!b.contractors.some((c) => c.id === 'ctr_priya')) for (const p of b.projects) p.contractorIds = p.contractorIds.filter((c) => c !== 'ctr_priya');
}
