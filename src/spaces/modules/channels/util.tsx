/* Small helpers for the Channels screen (platform marks, numbers, links, stats). */
import type { CSSProperties } from 'react';
import type { ID } from '@/types';
import type { Channel, ContentPiece, Platform } from '@/spaces/types';
import { PLATFORM_BY_ID } from '@/spaces/constants';
import { allPosts, cadenceForWeek, engagement, weekStart, type PostRef } from '@/spaces/derive';
import { addDays, parseISODate, toISODate } from '@/lib/dates';
import { backend } from '@/backend';

/* ---------------------------------------------------------------- platform mark */

const ABBR: Record<Platform, string> = {
  youtube: 'YT',
  youtube_shorts: 'S',
  instagram: 'IG',
  tiktok: 'TT',
  linkedin: 'in',
  x: 'X',
  threads: '@',
  facebook: 'f',
  pinterest: 'P',
  snapchat: 'SC',
  twitch: 'TV',
  newsletter: 'NL',
  blog: 'B',
  podcast: 'PC',
  website: 'W',
  press: 'PR',
  other: '',
};

/** Black or white text, whichever reads better on `hex`. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#141418' : '#ffffff';
}

export function PlatformMark({ platform, color, name, size = 36, style }: { platform: Platform; color: string; name?: string; size?: number; style?: CSSProperties }) {
  const abbr = ABBR[platform] || (name || PLATFORM_BY_ID[platform]?.label || '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span
      className="sp-channels-mark"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * (abbr.length > 1 ? 0.36 : 0.46)),
        background: color,
        color: readableOn(color),
        ...style,
      }}
    >
      {abbr}
    </span>
  );
}

/* ---------------------------------------------------------------- numbers & links */

const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** 12400 → '12.4K' */
export function compact(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return Math.abs(n) < 1000 ? String(Math.round(n)) : compactFmt.format(n);
}

export function pct(part: number, of: number): string {
  if (!of) return '—';
  const v = (part / of) * 100;
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;
}

export const webUrl = (s: string) => (/^[a-z][a-z0-9+.-]*:/i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

export function openExternal(url: string) {
  if (!url.trim()) return;
  const u = webUrl(url);
  if (backend.openExternal) backend.openExternal(u);
  else window.open(u, '_blank', 'noopener');
}

/* ---------------------------------------------------------------- stats */

export interface ChannelStats {
  /** posts planned in the current week (weekly cadence) or month (monthly cadence), skipped excluded */
  planned: number;
  /** cadence target for that period */
  target?: number;
  period: 'week' | 'month';
  /** every post that uses the channel */
  total: number;
  published: number;
  views: number;
  engagement: number;
  /** published posts with results logged */
  withMetrics: number;
  /** next upcoming unpublished post */
  next?: PostRef;
  /** date passed, still draft / scheduled */
  overdue: number;
}

function monthBounds(today: string): [string, string] {
  const start = `${today.slice(0, 8)}01`;
  const d = parseISODate(start) ?? new Date();
  d.setMonth(d.getMonth() + 1);
  return [start, addDays(toISODate(d), -1)];
}

export interface WeekSummary {
  start: string;
  planned: number;
  target: number;
  behind: Channel[];
}

export function computeChannelStats(content: ContentPiece[], channels: Channel[], mondayFirst: boolean, today: string): { stats: Map<ID, ChannelStats>; week: WeekSummary } {
  const s = { content, channels };
  const ws = weekStart(today, mondayFirst);
  const we = addDays(ws, 6);
  const [ms, me] = monthBounds(today);
  const cadence = cadenceForWeek(s, ws);
  const cadById = new Map(cadence.map((c) => [c.channel.id, c]));
  const stats = new Map<ID, ChannelStats>();
  for (const ch of channels) {
    const period = ch.cadenceUnit === 'month' ? 'month' : 'week';
    stats.set(ch.id, { planned: 0, target: ch.cadence || undefined, period, total: 0, published: 0, views: 0, engagement: 0, withMetrics: 0, overdue: 0 });
  }
  for (const r of allPosts(s)) {
    const st = stats.get(r.post.channelId);
    if (!st) continue;
    const { post } = r;
    st.total++;
    if (post.status === 'published') {
      st.published++;
      st.views += post.metrics?.views ?? 0;
      st.engagement += engagement(post.metrics);
      if (post.metrics && Object.values(post.metrics).some((v) => v != null)) st.withMetrics++;
    }
    const open = post.status === 'draft' || post.status === 'scheduled';
    if (post.date && post.status !== 'skipped') {
      if (st.period === 'month' && post.date >= ms && post.date <= me) st.planned++;
      if (st.period === 'week' && !cadById.has(post.channelId) && post.date >= ws && post.date <= we) st.planned++;
    }
    if (open && post.date && post.date >= today && !st.next) st.next = r;
    if (open && post.date && post.date < today) st.overdue++;
  }
  // weekly cadence of active channels comes straight from cadenceForWeek
  for (const c of cadence) {
    const st = stats.get(c.channel.id);
    if (st && st.period === 'week') st.planned = c.planned;
  }
  const withTarget = cadence.filter((c) => c.target);
  return {
    stats,
    week: {
      start: ws,
      planned: cadence.reduce((a, c) => a + c.planned, 0),
      target: Math.round(withTarget.reduce((a, c) => a + (c.target ?? 0), 0) * 10) / 10,
      behind: withTarget.filter((c) => c.channel.cadenceUnit !== 'month' && c.planned < (c.target ?? 0)).map((c) => c.channel),
    },
  };
}
