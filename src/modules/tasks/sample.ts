import type { Milestone, ProjectData, Task } from '@/types';
import type { SampleContext } from '@/sample/context';
import { uid } from '@/lib/id';

/* Progress for the template tasks of "The Last Take" (today ≈ Oct 18, 2026, project in pre-production). */
const PLAN: Record<string, Partial<Task>> = {
  'Lock script / treatment': { status: 'doing', due: '2026-10-20', assignee: 'Elena Ward', notes: 'Shooting draft out; final polish on the rooftop monologue.' },
  'Approve production budget': { status: 'done', due: '2026-10-09', assignee: 'Marcus Chen' },
  'Hire key crew (DP, Gaffer, Sound, PD)': { status: 'done', due: '2026-10-10', assignee: 'Marcus Chen' },
  'Casting & talent confirmations': { status: 'doing', due: '2026-10-23', assignee: 'Marcus Chen', notes: 'Alex Kim (SAM) has the offer — chase the agent by Friday.' },
  'Location scouting & photos': { status: 'done', due: '2026-10-12', assignee: 'Tasha Brooks' },
  'Secure location agreements & permits': { status: 'done', due: '2026-10-16', assignee: 'Marcus Chen' },
  'Production insurance / certificate of insurance': {
    status: 'doing',
    due: '2026-10-16',
    assignee: 'Marcus Chen',
    notes: 'Hollis Building management needs the COI before we can load in.',
  },
  'Shot list & storyboards': { status: 'doing', due: '2026-10-28', assignee: 'Ivan Petrov' },
  'Lighting diagrams & camera plan': { status: 'todo', due: '2026-10-30', assignee: 'Luis Ortega' },
  'Book equipment rentals': { status: 'todo', due: '2026-10-29', assignee: 'Ivan Petrov', notes: 'Lensworks: hold the camera package for Nov 6–9.' },
  'Wardrobe fittings & approvals': { status: 'todo', due: '2026-11-02', assignee: 'Nina Patel', notes: 'Two red coats — hero + stairwell double.' },
  'Props & set dressing sourced': { status: 'doing', due: '2026-11-03', assignee: 'Ben Carter' },
  'Tech scout with HODs': { status: 'todo', due: '2026-10-31', assignee: 'Tasha Brooks' },
  'Lock shooting schedule': { status: 'doing', due: '2026-10-27', assignee: 'Tasha Brooks' },
  'Prepare talent & location releases': { status: 'todo', due: '2026-11-04', assignee: 'Marcus Chen' },
  'Safety plan / risk assessment': {
    status: 'todo',
    due: '2026-11-04',
    assignee: 'Tasha Brooks',
    priority: 'high',
    notes: 'Rooftop edge work: anchor point + spotter. Stairs-only load-in (elevator out).',
  },
  'Catering, parking & transportation': { status: 'todo', due: '2026-11-05', assignee: 'Ben Carter' },
  'Media management plan (cards, backups, DIT)': { status: 'done', due: '2026-10-15', assignee: 'Chloe Martin' },
  'Send call sheets (24h before each day)': { due: '2026-11-06', assignee: 'Tasha Brooks' },
  'Collect signed releases on set': { due: '2026-11-07', assignee: 'Ben Carter' },
  'Back up footage daily (3-2-1)': { due: '2026-11-08', assignee: 'Mia Santos' },
  'Wrap report & equipment returns': { due: '2026-11-09', assignee: 'Marcus Chen' },
  'Ingest, sync & organize footage': { due: '2026-11-10', assignee: 'Chloe Martin' },
  'Assembly / rough cut': { due: '2026-11-18', assignee: 'Chloe Martin' },
  'Review rounds & notes': { due: '2026-11-20', assignee: 'Elena Ward' },
  'Picture lock': { due: '2026-11-27', assignee: 'Elena Ward' },
  'Sound design, music & mix': { due: '2026-12-09', assignee: 'Studio 9 Post' },
  'Color grade': { due: '2026-12-03', assignee: 'Studio 9 Post' },
  'Graphics, titles & lower thirds': { due: '2026-12-02', assignee: 'Chloe Martin' },
  'Captions / subtitles': { due: '2026-12-11', assignee: 'Chloe Martin' },
  'QC & final approvals': { due: '2026-12-11', assignee: 'Marcus Chen' },
  'Export & deliver all versions': { due: '2026-12-15', assignee: 'Chloe Martin' },
  'Archive project & media': { due: '2026-12-18', assignee: 'Chloe Martin' },
};

/** Adds demo data for the tasks module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  for (const t of p.tasks) {
    const plan = PLAN[t.title];
    if (plan) Object.assign(t, plan);
  }

  // project-specific tasks
  const extra: Task[] = [
    {
      id: uid('task'),
      title: 'Rooftop walkthrough with building management',
      phase: 'pre',
      status: 'todo',
      priority: 'high',
      due: '2026-10-31',
      assignee: 'Tasha Brooks',
      notes: 'Confirm roof access hours, power on the bulkhead and where the crew can stage.',
    },
    { id: uid('task'), title: 'Confirm sunset time & light window for Nov 7', phase: 'pre', status: 'todo', priority: 'normal', due: '2026-11-05', assignee: 'Ivan Petrov' },
    { id: uid('task'), title: 'Rent wind machine + leaf blower backup', phase: 'pre', status: 'todo', priority: 'normal', due: '2026-11-02', assignee: 'Luis Ortega' },
  ];
  const preIdx = p.tasks.findIndex((t) => t.phase === 'production');
  if (preIdx >= 0) p.tasks.splice(preIdx, 0, ...extra);
  else p.tasks.push(...extra);

  const ms = (name: string, date: string, phase: Milestone['phase'], notes?: string, done?: boolean): Milestone => ({ id: uid('ms'), name, date, phase, notes, done });
  p.milestones = [
    ms('Greenlight & budget approved', '2026-10-09', 'development', undefined, true),
    ms('Script lock', '2026-10-20', 'development', 'Shooting draft locked — revisions in colour pages after this.'),
    ms('Tech scout', '2026-10-31', 'pre', 'All HODs on the roof at 3:30 PM to see the light.'),
    ms('Shoot', '2026-11-07', 'production', 'Day 1 of 2 — stairwell + rooftop at magic hour.'),
    ms('Picture lock', '2026-11-27', 'post'),
    ms('Delivery', '2026-12-15', 'delivery', 'Festival screener + DCP + archive master.'),
  ];
}
