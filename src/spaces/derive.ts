/* Derived data for Marketing Spaces (pure functions; use with useMemo). */
import type { ID } from '@/types';
import { addDays, parseISODate, todayISO } from '@/lib/dates';
import { METRICS, PLATFORM_BY_ID, STAGES } from './constants';
import type { Channel, ContentPiece, ContentPost, ContentStage, Goal, PostMetrics, SpaceData } from './types';

/** Colour of a channel (its own colour or the platform's). */
export function channelColor(ch: Pick<Channel, 'color' | 'platform'> | undefined): string {
  return ch?.color || PLATFORM_BY_ID[ch?.platform ?? 'other']?.color || '#7c5cff';
}

export function channelById(s: Pick<SpaceData, 'channels'>, id: ID | undefined): Channel | undefined {
  return id ? s.channels.find((c) => c.id === id) : undefined;
}

export function contentById(s: Pick<SpaceData, 'content'>, id: ID | undefined): ContentPiece | undefined {
  return id ? s.content.find((c) => c.id === id) : undefined;
}

/** A post together with its content piece and channel (for calendars and lists). */
export interface PostRef {
  post: ContentPost;
  content: ContentPiece;
  channel?: Channel;
  /** 'YYYY-MM-DD HH:MM' sortable key ('' when unscheduled) */
  sortKey: string;
}

export function allPosts(s: Pick<SpaceData, 'content' | 'channels'>): PostRef[] {
  const ch = new Map(s.channels.map((c) => [c.id, c]));
  const out: PostRef[] = [];
  for (const content of s.content)
    for (const post of content.posts) out.push({ post, content, channel: ch.get(post.channelId), sortKey: post.date ? `${post.date} ${post.time ?? '99:99'}` : '' });
  return out.sort((a, b) => (a.sortKey || '~').localeCompare(b.sortKey || '~'));
}

/** Posts with a date in [from, to] (inclusive, YYYY-MM-DD). */
export function postsInRange(s: Pick<SpaceData, 'content' | 'channels'>, from: string, to: string): PostRef[] {
  return allPosts(s).filter((r) => r.post.date && r.post.date >= from && r.post.date <= to);
}

/** Upcoming, not yet published posts. */
export function upcomingPosts(s: Pick<SpaceData, 'content' | 'channels'>, days = 14, from = todayISO()): PostRef[] {
  const to = addDays(from, days);
  return postsInRange(s, from, to).filter((r) => r.post.status !== 'published' && r.post.status !== 'skipped');
}

/** Posts whose date has passed but are not marked published / skipped. */
export function overduePosts(s: Pick<SpaceData, 'content' | 'channels'>, today = todayISO()): PostRef[] {
  return allPosts(s).filter((r) => r.post.date && r.post.date < today && (r.post.status === 'draft' || r.post.status === 'scheduled'));
}

/** Content that is not ready but has a post date within `days`. */
export function atRiskContent(s: Pick<SpaceData, 'content'>, days = 7, today = todayISO()): ContentPiece[] {
  const limit = addDays(today, days);
  const late: ContentStage[] = ['idea', 'writing', 'planning', 'production', 'editing'];
  return s.content.filter((c) => late.includes(c.stage) && c.posts.some((p) => p.date && p.date >= today && p.date <= limit && p.status !== 'skipped'));
}

/** First planned post date of a piece (or undefined). */
export function firstPostDate(c: ContentPiece): string | undefined {
  return c.posts
    .map((p) => p.date)
    .filter((d): d is string => !!d)
    .sort()[0];
}

export function countByStage(content: ContentPiece[]): Record<ContentStage, number> {
  const out = Object.fromEntries(STAGES.map((s) => [s.value, 0])) as Record<ContentStage, number>;
  for (const c of content) out[c.stage] = (out[c.stage] ?? 0) + 1;
  return out;
}

/** Sum of every metric over posts. */
export function sumMetrics(posts: ContentPost[]): PostMetrics & { posts: number } {
  const out: PostMetrics & { posts: number } = { posts: 0 };
  let ctrN = 0;
  let avdN = 0;
  for (const p of posts) {
    if (!p.metrics) continue;
    out.posts++;
    for (const m of METRICS) {
      const v = p.metrics[m.key];
      if (v == null || isNaN(v)) continue;
      if (m.key === 'ctr') {
        out.ctr = (out.ctr ?? 0) + v;
        ctrN++;
      } else if (m.key === 'avgViewSec') {
        out.avgViewSec = (out.avgViewSec ?? 0) + v;
        avdN++;
      } else (out as any)[m.key] = ((out as any)[m.key] ?? 0) + v;
    }
  }
  if (ctrN) out.ctr = Math.round(((out.ctr ?? 0) / ctrN) * 100) / 100;
  if (avdN) out.avgViewSec = Math.round((out.avgViewSec ?? 0) / avdN);
  return out;
}

/** Engagement = likes + comments + shares + saves. */
export function engagement(m: PostMetrics | undefined): number {
  if (!m) return 0;
  return (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
}

/** 0..1 progress of a goal from baseline to target (undefined when not measurable). */
export function goalProgress(g: Goal): number | undefined {
  if (g.target == null || g.current == null) return undefined;
  const base = g.baseline ?? 0;
  if (g.target === base) return g.current >= g.target ? 1 : 0;
  return Math.max(0, Math.min(1, (g.current - base) / (g.target - base)));
}

/** Monday- or Sunday-start of the week containing `iso`. */
export function weekStart(iso: string, mondayFirst: boolean): string {
  const d = parseISODate(iso) ?? new Date();
  const dow = d.getDay(); // 0 = Sunday
  const back = mondayFirst ? (dow + 6) % 7 : dow;
  return addDays(iso, -back);
}

/** Planned (non-skipped) posts per channel in the week starting `start`, vs the channel's cadence. */
export function cadenceForWeek(s: Pick<SpaceData, 'content' | 'channels'>, start: string): { channel: Channel; planned: number; target?: number }[] {
  const end = addDays(start, 6);
  const posts = postsInRange(s, start, end).filter((r) => r.post.status !== 'skipped');
  return s.channels
    .filter((c) => c.active)
    .map((channel) => {
      const planned = posts.filter((r) => r.post.channelId === channel.id).length;
      const target = channel.cadence ? (channel.cadenceUnit === 'month' ? Math.round((channel.cadence * 12) / 52 * 10) / 10 : channel.cadence) : undefined;
      return { channel, planned, target };
    });
}

/** Stage a piece should be in from its posts: all non-skipped posts published → 'published'. */
export function isFullyPublished(c: ContentPiece): boolean {
  const live = c.posts.filter((p) => p.status !== 'skipped');
  return live.length > 0 && live.every((p) => p.status === 'published');
}
