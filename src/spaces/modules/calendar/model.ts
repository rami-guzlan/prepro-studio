/* Derived calendar data: grids, items per day, campaign bands, the unscheduled tray. */
import type { Campaign, Channel, ContentPiece, ContentPost, ContentStage, ShootSession, SpaceMilestone } from '@/spaces/types';
import { PLATFORM_BY_ID } from '@/spaces/constants';
import { channelColor, weekStart, type PostRef } from '@/spaces/derive';
import { addDays, diffDays, parseISODate, pad2, timeToMinutes, toISODate } from '@/lib/dates';
import { matchesQuery } from '@/lib/text';

export type CalView = 'month' | 'week' | 'agenda';

/** Key used for posts whose channel was deleted. */
export const NO_CHANNEL = '__none';
export const MISSING_CHANNEL_COLOR = '#868e96';

export interface CalFilters {
  /** hidden channel ids (NO_CHANNEL = posts on deleted channels) */
  hidden: string[];
  campaignId: string;
  stage: string;
  showShoots: boolean;
  showMilestones: boolean;
  showCampaigns: boolean;
}

export const DEFAULT_TOGGLES = { showShoots: true, showMilestones: true, showCampaigns: true };

export function isISODate(iso: string | undefined | null): iso is string {
  return !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !!parseISODate(iso);
}

/* ---------------------------------------------------------------- items */

export type CalItem =
  | { kind: 'post'; key: string; date: string; time?: string; ref: PostRef; color: string }
  | { kind: 'shoot'; key: string; date: string; time?: string; shoot: ShootSession; pieces: number }
  | { kind: 'milestone'; key: string; date: string; ms: SpaceMilestone; color: string; campaign?: Campaign };

export function postKey(contentId: string, postId: string) {
  return `post:${contentId}:${postId}`;
}

export function postChannelKey(ref: PostRef): string {
  return ref.channel ? ref.channel.id : NO_CHANNEL;
}

export function refColor(ref: PostRef): string {
  return ref.channel ? channelColor(ref.channel) : MISSING_CHANNEL_COLOR;
}

export function channelLabel(ch: Channel | undefined): string {
  if (!ch) return 'Deleted channel';
  return ch.name || PLATFORM_BY_ID[ch.platform]?.label || 'Channel';
}

function itemRank(it: CalItem): string {
  if (it.kind === 'milestone') return `0 ${it.ms.name}`;
  if (it.kind === 'shoot') return `1 ${it.time ?? '99:99'}`;
  return it.time ? `3 ${it.time}` : '2';
}

export interface BuildArgs {
  refs: PostRef[];
  shoots: ShootSession[];
  milestones: SpaceMilestone[];
  campaigns: Campaign[];
  /** content id → session id (for the campaign filter on shoots) */
  sessionPieces: Map<string, ContentPiece[]>;
  filters: CalFilters;
}

export function postVisible(ref: PostRef, f: CalFilters, hidden: Set<string>): boolean {
  if (hidden.has(postChannelKey(ref))) return false;
  if (f.campaignId && ref.content.campaignId !== f.campaignId) return false;
  if (f.stage && ref.content.stage !== f.stage) return false;
  return true;
}

/** Everything that shows on the calendar, grouped by date and sorted for display. */
export function buildItems({ refs, shoots, milestones, campaigns, sessionPieces, filters }: BuildArgs): Map<string, CalItem[]> {
  const out = new Map<string, CalItem[]>();
  const add = (it: CalItem) => {
    const list = out.get(it.date);
    if (list) list.push(it);
    else out.set(it.date, [it]);
  };
  const hidden = new Set(filters.hidden);
  for (const ref of refs) {
    const d = ref.post.date;
    if (!isISODate(d) || !postVisible(ref, filters, hidden)) continue;
    add({ kind: 'post', key: postKey(ref.content.id, ref.post.id), date: d, time: ref.post.time || undefined, ref, color: refColor(ref) });
  }
  if (filters.showShoots)
    for (const sh of shoots) {
      if (!isISODate(sh.date)) continue;
      const pieces = sessionPieces.get(sh.id) ?? [];
      if (filters.campaignId && !pieces.some((c) => c.campaignId === filters.campaignId)) continue;
      add({ kind: 'shoot', key: `shoot:${sh.id}`, date: sh.date, time: sh.callTime || undefined, shoot: sh, pieces: pieces.length });
    }
  if (filters.showMilestones) {
    const camp = new Map(campaigns.map((c) => [c.id, c]));
    for (const ms of milestones) {
      if (!isISODate(ms.date)) continue;
      if (filters.campaignId && ms.campaignId !== filters.campaignId) continue;
      const c = ms.campaignId ? camp.get(ms.campaignId) : undefined;
      add({ kind: 'milestone', key: `ms:${ms.id}`, date: ms.date, ms, color: c?.color || 'var(--warning)', campaign: c });
    }
  }
  for (const list of out.values()) list.sort((a, b) => itemRank(a).localeCompare(itemRank(b)));
  return out;
}

/* ---------------------------------------------------------------- grids */

export function monthOf(iso: string): { y: number; m: number } {
  const d = parseISODate(iso) ?? new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}

export function firstOfMonth(iso: string): string {
  const { y, m } = monthOf(iso);
  return `${y}-${pad2(m + 1)}-01`;
}

export function addMonths(iso: string, n: number): string {
  const { y, m } = monthOf(iso);
  const d = new Date(y, m + n, 1, 12);
  return toISODate(d);
}

/** 6 weeks × 7 days covering the month of `iso`. */
export function monthWeeks(iso: string, mondayFirst: boolean, weeks = 6): string[][] {
  const start = weekStart(firstOfMonth(iso), mondayFirst);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** Only the weeks that contain days of the month (4–6), for print. */
export function monthWeeksCompact(iso: string, mondayFirst: boolean): string[][] {
  const first = firstOfMonth(iso);
  const { m } = monthOf(first);
  return monthWeeks(iso, mondayFirst, 6).filter((w) => w.some((d) => monthOf(d).m === m));
}

export function weekDays(iso: string, mondayFirst: boolean): string[] {
  const start = weekStart(iso, mondayFirst);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/* ---------------------------------------------------------------- campaign bands */

export interface BandSeg {
  campaign: Campaign;
  /** column 0..6 */
  col: number;
  span: number;
  lane: number;
  /** the campaign starts / ends inside this week */
  starts: boolean;
  ends: boolean;
}

export function campaignRange(c: Campaign): [string, string] | null {
  const s = isISODate(c.start) ? c.start : isISODate(c.end) ? c.end : undefined;
  const e = isISODate(c.end) ? c.end : s;
  if (!s || !e) return null;
  return s <= e ? [s, e] : [e, s];
}

/** Campaign segments for one week row, stacked into lanes. */
export function weekBands(campaigns: Campaign[], days: string[]): { segs: BandSeg[]; lanes: number } {
  const ws = days[0];
  const we = days[days.length - 1];
  const raw: Omit<BandSeg, 'lane'>[] = [];
  for (const c of campaigns) {
    const r = campaignRange(c);
    if (!r) continue;
    const [s, e] = r;
    if (e < ws || s > we) continue;
    const from = s < ws ? ws : s;
    const to = e > we ? we : e;
    raw.push({ campaign: c, col: diffDays(ws, from), span: diffDays(from, to) + 1, starts: s >= ws, ends: e <= we });
  }
  raw.sort((a, b) => a.col - b.col || b.span - a.span);
  const laneEnd: number[] = [];
  const segs: BandSeg[] = raw.map((r) => {
    let lane = laneEnd.findIndex((end) => end < r.col);
    if (lane < 0) {
      lane = laneEnd.length;
      laneEnd.push(-1);
    }
    laneEnd[lane] = r.col + r.span - 1;
    return { ...r, lane };
  });
  return { segs, lanes: laneEnd.length };
}

/** Campaigns active on a date (agenda header). */
export function campaignsOn(campaigns: Campaign[], iso: string): Campaign[] {
  return campaigns.filter((c) => {
    const r = campaignRange(c);
    return !!r && r[0] <= iso && iso <= r[1];
  });
}

/* ---------------------------------------------------------------- times */

/** Compact time for chips: '6pm', '6:30pm' or '18:00'. */
export function shortTime(t: string | undefined, h12: boolean): string {
  const mins = timeToMinutes(t);
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h12) return `${pad2(h)}:${pad2(m)}`;
  const suffix = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${pad2(m)}${suffix}` : `${hh}${suffix}`;
}

/* ---------------------------------------------------------------- unscheduled tray */

export type TrayEntry =
  | { kind: 'piece'; key: string; content: ContentPiece; undated: ContentPost[] }
  | { kind: 'post'; key: string; content: ContentPiece; post: ContentPost; channel?: Channel };

const STAGE_URGENCY: ContentStage[] = ['ready', 'editing', 'production', 'planning', 'writing', 'idea', 'published'];

export interface TrayArgs {
  content: ContentPiece[];
  channels: Channel[];
  filters: CalFilters;
  query: string;
}

/**
 * Pieces (idea … ready) without any dated post, plus single undated posts of pieces
 * that are already partly scheduled.
 */
export function buildTray({ content, channels, filters, query }: TrayArgs): TrayEntry[] {
  const ch = new Map(channels.map((c) => [c.id, c]));
  const hidden = new Set(filters.hidden);
  const out: TrayEntry[] = [];
  for (const c of content) {
    if (filters.campaignId && c.campaignId !== filters.campaignId) continue;
    if (filters.stage && c.stage !== filters.stage) continue;
    if (!matchesQuery(`${c.title} ${c.hook ?? ''}`, query)) continue;
    const posts = Array.isArray(c.posts) ? c.posts : [];
    const undated = posts.filter((p) => !isISODate(p.date) && p.status !== 'skipped' && p.status !== 'published');
    const hasDated = posts.some((p) => isISODate(p.date));
    if (!hasDated) {
      if (c.stage === 'published') continue;
      out.push({ kind: 'piece', key: `piece:${c.id}`, content: c, undated });
    } else {
      for (const p of undated) {
        const channel = ch.get(p.channelId);
        if (hidden.has(channel ? channel.id : NO_CHANNEL)) continue;
        out.push({ kind: 'post', key: `upost:${c.id}:${p.id}`, content: c, post: p, channel });
      }
    }
  }
  const rank = (e: TrayEntry) => STAGE_URGENCY.indexOf(e.content.stage);
  return out.sort((a, b) => rank(a) - rank(b) || (a.content.title ?? '').localeCompare(b.content.title ?? ''));
}
