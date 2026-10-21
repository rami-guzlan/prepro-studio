/* The holistic coach's view of the whole studio: one read-only snapshot across
   Productions, Marketing Spaces, businesses, Personal Finances (only while the
   user has unlocked them) and Training — so an agent can give advice that
   accounts for workload, money and health together. */
import type { SpaceData, SpaceKind } from '@/spaces/types';
import { backend } from '@/backend';
import { normalizeSpace } from '@/spaces/defaults';
import { kindDef } from '@/spaces/registry';
import { countByStage, overduePosts, upcomingPosts } from '@/spaces/derive';
import { isFinanceUnlocked } from '@/spaces/finance/lock';
import { useSpaceStore } from '@/store/space';
import { useProjectStore } from '@/store/project';
import { addDays, todayISO } from '@/lib/dates';
import { clean } from '../ctx';
import { defineTool } from '../tool';
import { arr, enm, int, obj, opt } from '../schema';

const AREAS = ['productions', 'marketing', 'business', 'finance', 'training'] as const;
type Area = (typeof AREAS)[number];

async function loadKind(kind: SpaceKind): Promise<SpaceData[]> {
  const open = useSpaceStore.getState().space;
  const list = (await backend.listSpaces()).filter((s) => (s.kind ?? 'marketing') === kind && !s.demo);
  const out: SpaceData[] = [];
  for (const s of list) {
    try {
      out.push(open?.id === s.id ? open : normalizeSpace(await backend.loadSpace(s.id)));
    } catch {
      /* unreadable space: skip */
    }
  }
  return out;
}

function marketingSummary(s: SpaceData, today: string, days: number) {
  const up = upcomingPosts(s, days, today);
  const stages = countByStage(s.content);
  return clean({
    space: s.meta.title,
    postsNextDays: up.length,
    nextPosts: up.slice(0, 5).map((p) => `${p.post.date}${p.post.time ? ` ${p.post.time}` : ''} · ${p.channel?.name ?? '?'} · ${p.content.title}`),
    overduePosts: overduePosts(s, today).length || undefined,
    inProgress: Object.entries(stages)
      .filter(([k, n]) => n && k !== 'published' && k !== 'idea')
      .map(([k, n]) => `${n} ${k}`)
      .join(', '),
    ideas: stages.idea || undefined,
    activeCampaigns: s.campaigns.filter((c) => c.status === 'active' || (c.start && c.end && c.start <= today && c.end >= today)).map((c) => c.name),
    milestonesNextDays: s.milestones.filter((m) => !m.done && m.date && m.date >= today && m.date <= addDays(today, days)).map((m) => `${m.date} ${m.name}`),
  });
}

export const coachTools = [
  defineTool({
    name: 'studio_context',
    title: 'Holistic coach: studio-wide snapshot',
    description:
      'One read-only snapshot of the whole studio for holistic coaching: productions (status), Marketing Spaces (posts due, pipeline, active campaigns, milestones), businesses (income, expenses, overdue invoices, hours, contractors owed), Personal Finances (only while the user has unlocked them in the app — otherwise reported as locked; never ask for the PIN) and Training (weight trend and projection, workouts, streaks, macros, last check-in). Use it before giving advice that should weigh workload, money and health together, then dig in with the area tools (open_training + training_report, open_finances + finance_report, biz_report …). Advice is coaching, not medical or financial advice.',
    readOnly: true,
    global: true,
    noStep: true,
    input: obj({
      areas: opt(arr(enm(AREAS), 'only these areas (default all)')),
      days: opt(int('look-ahead window for posts and milestones (default 14)', 1)),
    }),
    async run(a: { areas?: Area[]; days?: number }) {
      const today = todayISO();
      const days = a.days ?? 14;
      const want = new Set<Area>(a.areas?.length ? a.areas : AREAS);
      const open = useSpaceStore.getState().space;
      const openProject = useProjectStore.getState().project;
      const out: Record<string, unknown> = {
        today,
        open: openProject ? `production: ${openProject.meta.title}` : open ? `${open.meta.kind ?? 'marketing'}: ${open.meta.title}` : 'library',
      };
      if (want.has('productions')) {
        const list = (await backend.listProjects()).filter((p) => !p.demo);
        out.productions = list.map((p) => clean({ title: p.title, type: p.projectType, status: p.status, updated: p.updatedAt.slice(0, 10) }));
      }
      if (want.has('marketing')) out.marketing = (await loadKind('marketing')).map((s) => marketingSummary(s, today, days));
      if (want.has('business')) out.business = (await loadKind('business')).map((s) => ({ business: s.meta.title, ...kindDef('business').coachSummary(s, today) }));
      if (want.has('finance')) {
        if (!isFinanceUnlocked()) out.finance = { locked: true, note: 'Personal Finances are locked. If money matters for this advice, ask the user to unlock them in PrePro Studio.' };
        else {
          const f = (await loadKind('finance'))[0];
          out.finance = f ? kindDef('finance').coachSummary(f, today) : { empty: true };
        }
      }
      if (want.has('training')) {
        const t = (await loadKind('training'))[0];
        out.training = t ? kindDef('training').coachSummary(t, today) : { empty: true, note: 'Training has not been set up yet (open_training creates it).' };
      }
      return { data: clean(out) };
    },
  }),
];
