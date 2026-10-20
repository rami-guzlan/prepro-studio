/* Results: pure calculations shared by the screen and the printed report. */
import type { ContentPost, SpaceData } from '@/spaces/types';
import { FORMAT_BY_ID } from '@/spaces/constants';
import { allPosts, channelColor, engagement, sumMetrics, weekStart, type PostRef } from '@/spaces/derive';
import { addDays, diffDays, MONTHS_SHORT, parseISODate, toISODate } from '@/lib/dates';

/* ---------------------------------------------------------------- periods */

export type PeriodId = '7' | '30' | '90' | 'year' | 'all' | 'custom';

export const PERIODS: { value: PeriodId; label: string; short: string }[] = [
  { value: '7', label: 'Last 7 days', short: '7 days' },
  { value: '30', label: 'Last 30 days', short: '30 days' },
  { value: '90', label: 'Last 90 days', short: '90 days' },
  { value: 'year', label: 'This year', short: 'This year' },
  { value: 'all', label: 'All time', short: 'All time' },
  { value: 'custom', label: 'Custom range', short: 'Custom' },
];

export interface Range {
  /** inclusive bounds (YYYY-MM-DD); undefined = open */
  from?: string;
  to?: string;
  label: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function periodRange(period: PeriodId | string | undefined, today: string, from?: string, to?: string): Range {
  switch (period) {
    case '7':
      return { from: addDays(today, -6), to: today, label: 'Last 7 days' };
    case '90':
      return { from: addDays(today, -89), to: today, label: 'Last 90 days' };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today, label: `This year (${today.slice(0, 4)})` };
    case 'all':
      return { label: 'All time' };
    case 'custom': {
      let f = from && ISO.test(from) ? from : undefined;
      let t = to && ISO.test(to) ? to : undefined;
      if (f && t && f > t) [f, t] = [t, f];
      return { from: f, to: t, label: 'Custom range' };
    }
    case '30':
    default:
      return { from: addDays(today, -29), to: today, label: 'Last 30 days' };
  }
}

/** The period just before `r` (same length; for "this year" the same span of last year). */
export function previousRange(r: Range, period: PeriodId): Range | null {
  if (!r.from || !r.to || period === 'all') return null;
  if (period === 'year') {
    const y = Number(r.from.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}${r.to.slice(4)}`, label: `Same period ${y}` };
  }
  const len = diffDays(r.from, r.to) + 1;
  const to = addDays(r.from, -1);
  return { from: addDays(to, -(len - 1)), to, label: `Previous ${len} days` };
}

export function inRange(date: string | undefined, r: Range): boolean {
  if (!r.from && !r.to) return true;
  if (!date) return false;
  return (!r.from || date >= r.from) && (!r.to || date <= r.to);
}

export function publishedPosts(s: Pick<SpaceData, 'content' | 'channels'>): PostRef[] {
  return allPosts(s).filter((r) => r.post.status === 'published');
}

export function hasMetrics(p: ContentPost): boolean {
  return !!p.metrics && Object.values(p.metrics).some((v) => v != null && !isNaN(v as number));
}

/* ---------------------------------------------------------------- KPIs */

export interface Kpis {
  posts: number;
  /** posts with results logged */
  logged: number;
  views: number;
  impressions: number;
  engagement: number;
  engRate?: number;
  followers: number;
  clicks: number;
  conversions: number;
  ctr?: number;
  watchHours: number;
}

export function kpis(refs: PostRef[]): Kpis {
  const m = sumMetrics(refs.map((r) => r.post));
  const eng = refs.reduce((a, r) => a + engagement(r.post.metrics), 0);
  const views = m.views ?? 0;
  const clicks = m.clicks ?? 0;
  const impressions = m.impressions ?? 0;
  return {
    posts: refs.length,
    logged: refs.filter((r) => hasMetrics(r.post)).length,
    views,
    impressions,
    engagement: eng,
    engRate: views ? eng / views : undefined,
    followers: m.followersGained ?? 0,
    clicks,
    conversions: m.conversions ?? 0,
    ctr: m.ctr ?? (impressions && clicks ? Math.round((clicks / impressions) * 10000) / 100 : undefined),
    watchHours: m.watchHours ?? 0,
  };
}

/** Relative change (0.12 = +12 %), null when there is nothing to compare. */
export function change(cur: number | undefined, prev: number | undefined): number | null {
  if (cur == null || prev == null) return null;
  if (prev === 0) return null;
  return (cur - prev) / prev;
}

/* ---------------------------------------------------------------- breakdowns */

export type BreakdownBy = 'channel' | 'format' | 'pillar' | 'campaign';

export const BREAKDOWNS: { value: BreakdownBy; label: string; none: string }[] = [
  { value: 'channel', label: 'Channel', none: 'Deleted channel' },
  { value: 'format', label: 'Format', none: 'Other' },
  { value: 'pillar', label: 'Pillar', none: 'No pillar' },
  { value: 'campaign', label: 'Campaign', none: 'No campaign' },
];

export interface BreakdownRow {
  key: string;
  label: string;
  color?: string;
  posts: number;
  views: number;
  engagement: number;
  engRate?: number;
  clicks: number;
  followers: number;
  conversions: number;
  /** share of all views in the period (0..1) */
  share: number;
  /** the "no pillar / no campaign" bucket */
  none?: boolean;
}

export function breakdown(refs: PostRef[], s: Pick<SpaceData, 'pillars' | 'campaigns'>, by: BreakdownBy): BreakdownRow[] {
  const def = BREAKDOWNS.find((b) => b.value === by)!;
  const pillars = new Map(s.pillars.map((p) => [p.id, p]));
  const campaigns = new Map(s.campaigns.map((c) => [c.id, c]));
  const rows = new Map<string, BreakdownRow>();
  let total = 0;
  for (const r of refs) {
    let key = '';
    let label = def.none;
    let color: string | undefined;
    if (by === 'channel') {
      key = r.post.channelId;
      if (r.channel) {
        label = r.channel.name || r.channel.platform;
        color = channelColor(r.channel);
      }
    } else if (by === 'format') {
      key = r.content.format;
      label = FORMAT_BY_ID[r.content.format]?.label ?? def.none;
    } else if (by === 'pillar') {
      const p = r.content.pillarId ? pillars.get(r.content.pillarId) : undefined;
      key = p?.id ?? '';
      if (p) {
        label = p.name;
        color = p.color;
      }
    } else {
      const c = r.content.campaignId ? campaigns.get(r.content.campaignId) : undefined;
      key = c?.id ?? '';
      if (c) {
        label = c.name;
        color = c.color;
      }
    }
    let row = rows.get(key);
    if (!row) {
      row = { key, label, color, posts: 0, views: 0, engagement: 0, clicks: 0, followers: 0, conversions: 0, share: 0, none: (by === 'channel' && !r.channel) || ((by === 'pillar' || by === 'campaign') && !key) };
      rows.set(key, row);
    }
    const m = r.post.metrics;
    row.posts++;
    row.views += m?.views ?? 0;
    row.engagement += engagement(m);
    row.clicks += m?.clicks ?? 0;
    row.followers += m?.followersGained ?? 0;
    row.conversions += m?.conversions ?? 0;
    total += m?.views ?? 0;
  }
  const out = [...rows.values()];
  for (const r of out) {
    r.share = total ? r.views / total : 0;
    r.engRate = r.views ? r.engagement / r.views : undefined;
  }
  return out.sort((a, b) => Number(!!a.none) - Number(!!b.none) || b.views - a.views || b.posts - a.posts || a.label.localeCompare(b.label));
}

/* ---------------------------------------------------------------- views over time */

export interface Bar {
  start: string;
  end: string;
  label: string;
  /** long label for tooltips */
  title: string;
  views: number;
  posts: number;
  /** published posts in the bucket without any views logged */
  unlogged: number;
}

function monthStart(iso: string) {
  return `${iso.slice(0, 8)}01`;
}
function nextMonth(iso: string) {
  const d = parseISODate(monthStart(iso)) ?? new Date();
  d.setMonth(d.getMonth() + 1);
  return toISODate(d);
}

/** Views per week (or per month for long ranges) of published posts. */
export function viewsSeries(refs: PostRef[], r: Range, mondayFirst: boolean, today: string): { unit: 'week' | 'month'; bars: Bar[]; undated: number } {
  const dated = refs.filter((x) => !!x.post.date);
  const dates = dated.map((x) => x.post.date!).sort();
  const from = r.from ?? dates[0] ?? today;
  const to = r.to ?? (dates.length && dates[dates.length - 1] > today ? dates[dates.length - 1] : today);
  const weeks = Math.floor(diffDays(weekStart(from, mondayFirst), weekStart(to, mondayFirst)) / 7) + 1;
  const unit: 'week' | 'month' = weeks > 60 ? 'month' : 'week';
  const bars: Bar[] = [];
  if (unit === 'week') {
    for (let s = weekStart(from, mondayFirst); s <= to; s = addDays(s, 7)) {
      const d = parseISODate(s)!;
      const e = addDays(s, 6);
      bars.push({ start: s, end: e, label: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`, title: `Week of ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`, views: 0, posts: 0, unlogged: 0 });
      if (bars.length > 400) break;
    }
  } else {
    for (let s = monthStart(from); s <= to; s = nextMonth(s)) {
      const d = parseISODate(s)!;
      bars.push({ start: s, end: addDays(nextMonth(s), -1), label: d.getMonth() === 0 || bars.length === 0 ? `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : MONTHS_SHORT[d.getMonth()], title: `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`, views: 0, posts: 0, unlogged: 0 });
      if (bars.length > 400) break;
    }
  }
  for (const x of dated) {
    const date = x.post.date!;
    const b = bars.find((bb) => date >= bb.start && date <= bb.end);
    if (!b) continue;
    b.posts++;
    const v = x.post.metrics?.views;
    if (v == null) b.unlogged++;
    else b.views += v;
  }
  return { unit, bars, undated: refs.length - dated.length };
}

/** 1, 2, 5 × 10^n ceiling. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* ---------------------------------------------------------------- top posts */

export type TopSort = 'views' | 'engagement' | 'clicks';

export function postValue(r: PostRef, sort: TopSort): number {
  const m = r.post.metrics;
  return sort === 'views' ? m?.views ?? 0 : sort === 'clicks' ? m?.clicks ?? 0 : engagement(m);
}

export function topPosts(refs: PostRef[], sort: TopSort): PostRef[] {
  return refs.filter((r) => hasMetrics(r.post)).sort((a, b) => postValue(b, sort) - postValue(a, sort) || (b.post.date ?? '').localeCompare(a.post.date ?? ''));
}

/* ---------------------------------------------------------------- formatting */

const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function compact(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return Math.abs(n) < 10000 ? Math.round(n).toLocaleString() : compactFmt.format(n);
}

export function percent(v: number | undefined | null, digits = 1): string {
  if (v == null || isNaN(v)) return '—';
  const p = v * 100;
  return `${p >= 10 || digits === 0 ? p.toFixed(0) : p.toFixed(digits)}%`;
}
