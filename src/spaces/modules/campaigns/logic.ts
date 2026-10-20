/* Pure helpers for Campaigns & Milestones (screen + print). */
import type { Campaign, ContentPiece, ContentStage, SpaceData } from '@/spaces/types';
import { countByStage } from '@/spaces/derive';
import { diffDays, todayISO } from '@/lib/dates';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isISO(v: string | undefined | null): v is string {
  return !!v && ISO_RE.test(v);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

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

export function stripYear(s: string): string {
  return s.replace(/,? \d{4}$/, '');
}

/* ---------------------------------------------------------------- dates */

/** Normalised date span of a campaign (a single date counts as a one-day campaign). */
export function campaignRange(c: Pick<Campaign, 'start' | 'end'>): { start?: string; end?: string } {
  const start = isISO(c.start) ? c.start : isISO(c.end) ? c.end : undefined;
  const end = isISO(c.end) ? c.end : start;
  if (start && end && end < start) return { start: end, end: start };
  return { start, end };
}

export function isScheduled(c: Campaign): boolean {
  return !!campaignRange(c).start;
}

export function campaignTiming(c: Campaign, today = todayISO()): { label: string; tone?: 'active' | 'past' | 'future' } {
  const { start, end } = campaignRange(c);
  if (!start || !end) return { label: 'No dates yet' };
  const days = diffDays(start, end) + 1;
  if (today < start) {
    const d = diffDays(today, start);
    return { label: `${plural(days, 'day')} · starts ${d === 1 ? 'tomorrow' : `in ${d} days`}`, tone: 'future' };
  }
  if (today > end) return { label: `${plural(days, 'day')} · ended ${relativeDay(end, today).toLowerCase()}`, tone: 'past' };
  const day = diffDays(start, today) + 1;
  return { label: `Day ${day} of ${days} · ${end === today ? 'ends today' : `${plural(diffDays(today, end), 'day')} left`}`, tone: 'active' };
}

export function sortCampaigns(list: Campaign[]): Campaign[] {
  return [...list].sort((a, b) => (campaignRange(a).start ?? '9999').localeCompare(campaignRange(b).start ?? '9999'));
}

/* ---------------------------------------------------------------- stats */

export interface CampaignStats {
  pieces: ContentPiece[];
  byStage: Record<ContentStage, number>;
  postsTotal: number;
  scheduled: number;
  published: number;
  drafts: number;
  msDone: number;
  msTotal: number;
}

export function campaignStats(c: Campaign, s: Pick<SpaceData, 'content' | 'milestones'>): CampaignStats {
  const pieces = s.content.filter((x) => x.campaignId === c.id);
  let scheduled = 0;
  let published = 0;
  let drafts = 0;
  let postsTotal = 0;
  for (const p of pieces)
    for (const post of p.posts) {
      if (post.status === 'skipped') continue;
      postsTotal++;
      if (post.status === 'published') published++;
      else if (post.status === 'scheduled') scheduled++;
      else drafts++;
    }
  const ms = s.milestones.filter((m) => m.campaignId === c.id);
  return { pieces, byStage: countByStage(pieces), postsTotal, scheduled, published, drafts, msDone: ms.filter((m) => m.done).length, msTotal: ms.length };
}

/** Next not-yet-published post date of a piece (or its first post date). */
export function nextPostDate(c: ContentPiece, today = todayISO()): string | undefined {
  const dates = c.posts.filter((p) => isISO(p.date) && p.status !== 'skipped').map((p) => ({ d: p.date!, open: p.status !== 'published' }));
  const next = dates.filter((x) => x.open && x.d >= today).map((x) => x.d).sort()[0];
  return next ?? dates.map((x) => x.d).sort()[0];
}

/** Text colour (dark / white) that reads well on a background colour. */
export function readableOn(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 168 ? '#1b1b21' : '#fff';
}
