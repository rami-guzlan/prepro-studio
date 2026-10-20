/* Pure helpers for the space Overview (screen + one-sheet print). */
import { mindTotals } from '@/lib/mind';
import { addDays, diffDays, todayISO, weekdayLong } from '@/lib/dates';
import { allPosts, overduePosts, upcomingPosts, type PostRef } from '@/spaces/derive';
import type { Campaign, ContentStage, SpaceData, SpaceMilestone } from '@/spaces/types';
import type { ContentTab } from '@/spaces/ui';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISO(v: string | undefined | null): v is string {
  return !!v && ISO_RE.test(v);
}

/** 'Today', 'Tomorrow', 'in 5 days', '3 days ago', 'in 9 weeks' … */
export function relativeDay(date: string, today = todayISO()): string {
  const d = diffDays(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 60) return `in ${d} days`;
  if (d < -1 && d > -60) return `${-d} days ago`;
  if (d >= 60) return `in ${Math.round(d / 7)} weeks`;
  return `${Math.round(-d / 7)} weeks ago`;
}

/** Heading for a day in agenda lists: 'Today', 'Tomorrow' or the weekday. */
export function dayHeading(date: string, today = todayISO()): string {
  const d = diffDays(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return weekdayLong(date);
}

/** Drop the year from a medium date ('Oct 19, 2026' → 'Oct 19', '19 Oct 2026' → '19 Oct'). */
export function stripYear(s: string): string {
  return s.replace(/,? \d{4}$/, '');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Best editor tab for a piece depending on how far along it is. */
export function tabForStage(stage: ContentStage): ContentTab {
  if (stage === 'idea') return 'brief';
  if (stage === 'writing') return 'write';
  if (stage === 'planning' || stage === 'production' || stage === 'editing') return 'produce';
  return 'publish';
}

/* ---------------------------------------------------------------- KPIs */

export interface SpaceKpis {
  /** pieces past the idea stage and not yet published */
  inProgress: number;
  ideas: number;
  /** posts published in the last 30 days */
  published30: number;
  /** open posts (draft / scheduled) in the next 7 days, today included */
  next7: number;
  next7Scheduled: number;
  overdue: number;
  goalsOnTrack: number;
  goalsAtRisk: number;
  goalsTotal: number;
}

export function spaceKpis(s: Pick<SpaceData, 'content' | 'channels' | 'goals'>, today = todayISO()): SpaceKpis {
  const from30 = addDays(today, -30);
  const posts = allPosts(s);
  const published30 = posts.filter((r) => r.post.status === 'published' && r.post.date && r.post.date >= from30 && r.post.date <= today).length;
  const next = upcomingPosts(s, 6, today);
  const goals = s.goals ?? [];
  return {
    inProgress: s.content.filter((c) => c.stage !== 'idea' && c.stage !== 'published').length,
    ideas: s.content.filter((c) => c.stage === 'idea').length,
    published30,
    next7: next.length,
    next7Scheduled: next.filter((r) => r.post.status === 'scheduled').length,
    overdue: overduePosts(s, today).length,
    goalsOnTrack: goals.filter((g) => g.status === 'on_track' || g.status === 'done').length,
    goalsAtRisk: goals.filter((g) => g.status === 'at_risk' || g.status === 'off_track').length,
    goalsTotal: goals.length,
  };
}

/** Group post refs by their date (input must be sorted). */
export function groupByDate(list: PostRef[]): [string, PostRef[]][] {
  const map = new Map<string, PostRef[]>();
  for (const r of list) {
    const k = r.post.date ?? '';
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()];
}

/* ---------------------------------------------------------------- campaigns */

export function campaignRange(c: Campaign): { start?: string; end?: string } {
  const start = isISO(c.start) ? c.start : isISO(c.end) ? c.end : undefined;
  const end = isISO(c.end) ? c.end : start;
  if (start && end && end < start) return { start: end, end: start };
  return { start, end };
}

export function isActiveCampaign(c: Campaign, today = todayISO()): boolean {
  const { start, end } = campaignRange(c);
  return !!start && !!end && start <= today && today <= end;
}

/** Day x of n for an active campaign and the elapsed fraction (0..1). */
export function campaignElapsed(c: Campaign, today = todayISO()): { day: number; days: number; pct: number } {
  const { start, end } = campaignRange(c);
  if (!start || !end) return { day: 0, days: 0, pct: 0 };
  const days = diffDays(start, end) + 1;
  const day = Math.max(0, Math.min(days, diffDays(start, today) + 1));
  return { day, days, pct: days > 0 ? day / days : 0 };
}

export function activeCampaigns(campaigns: Campaign[], today = todayISO()): Campaign[] {
  return campaigns.filter((c) => isActiveCampaign(c, today)).sort((a, b) => (campaignRange(a).end ?? '').localeCompare(campaignRange(b).end ?? ''));
}

export function nextCampaign(campaigns: Campaign[], today = todayISO()): Campaign | undefined {
  return campaigns
    .filter((c) => {
      const r = campaignRange(c);
      return !!r.start && r.start > today;
    })
    .sort((a, b) => (campaignRange(a).start ?? '').localeCompare(campaignRange(b).start ?? ''))[0];
}

export function upcomingMilestones(milestones: SpaceMilestone[], today = todayISO(), limit = 5): SpaceMilestone[] {
  return milestones
    .filter((m) => !m.done && isISO(m.date) && m.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, limit);
}

export function overdueMilestones(milestones: SpaceMilestone[], today = todayISO()): SpaceMilestone[] {
  return milestones.filter((m) => !m.done && isISO(m.date) && m.date < today).sort((a, b) => a.date!.localeCompare(b.date!));
}

/* ---------------------------------------------------------------- pillars */

/** Actual share (0–100) of content per pillar id, plus the unassigned count. */
export function pillarShares(s: Pick<SpaceData, 'content' | 'pillars'>): { counts: Record<string, number>; total: number; unassigned: number } {
  const ids = new Set(s.pillars.map((p) => p.id));
  const counts: Record<string, number> = {};
  let unassigned = 0;
  for (const c of s.content) {
    if (c.pillarId && ids.has(c.pillarId)) counts[c.pillarId] = (counts[c.pillarId] ?? 0) + 1;
    else unassigned++;
  }
  return { counts, total: s.content.length, unassigned };
}

/* ---------------------------------------------------------------- getting started */

export interface StartStep {
  id: 'channels' | 'pillars' | 'goal' | 'ideas' | 'post';
  label: string;
  detail: string;
  done: boolean;
  action: string;
}

export function startSteps(s: Pick<SpaceData, 'channels' | 'pillars' | 'goals' | 'mind' | 'content'>): StartStep[] {
  const { notes: mindNotes, text: mindText } = mindTotals(s.mind);
  const hasPost = s.content.some((c) => c.posts.some((p) => isISO(p.date)));
  return [
    { id: 'channels', label: 'Add your channels', detail: 'Where you publish — YouTube, Instagram, TikTok, a newsletter… with a posting cadence.', done: s.channels.length > 0, action: 'Add channels' },
    { id: 'pillars', label: 'Define content pillars', detail: '3–5 recurring themes every piece fits into, so the mix stays balanced.', done: s.pillars.length > 0, action: 'Define pillars' },
    { id: 'goal', label: 'Set a goal', detail: 'One measurable target, like 1,000 subscribers or 50k trailer views by a date.', done: (s.goals ?? []).length > 0, action: 'Set a goal' },
    { id: 'ideas', label: 'Capture ideas', detail: 'Brain-dump everything on the Ideas board, then turn the best into content.', done: mindNotes > 0 || mindText > 0 || s.content.length > 0, action: 'Open ideas' },
    { id: 'post', label: 'Plan your first post', detail: 'Give a piece a date and a channel — it shows up on the calendar.', done: hasPost, action: 'Open calendar' },
  ];
}
