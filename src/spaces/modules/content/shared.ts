/* Content module: data operations (all through updateSpace → undoable) and
   pure helpers shared by the board, the list, the editor and the dialogs. */
import { useMemo } from 'react';
import type { Draft } from 'immer';
import { Copy, PenLine, Printer, Recycle, Trash2 } from 'lucide-react';
import type { ID } from '@/types';
import type { Option } from '@/lib/constants';
import { openPrint } from '@/store/app';
import { getSpace, updateSpace, useSpace } from '@/store/space';
import { closeContent, openContent, useSpaceUI } from '@/spaces/ui';
import { FORMAT_BY_ID, PLATFORM_BY_ID, POST_STATUSES, STAGE_BY_ID, STAGES } from '@/spaces/constants';
import { defaultChecklist, makeContent, makePost } from '@/spaces/defaults';
import { isFullyPublished } from '@/spaces/derive';
import type { Channel, ContentFormat, ContentPiece, ContentPost, ContentStage, Platform, SpaceData } from '@/spaces/types';
import { backend, exportCsv } from '@/backend';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { matchesQuery, safeFileName, truncate } from '@/lib/text';
import { confirmDialog, toast, type MenuItem } from '@/ui';
import { openRepurpose } from './store';

export type Priority = 'low' | 'normal' | 'high';

export const PRIORITIES: Option<Priority>[] = [
  { value: 'high', label: 'High', color: '#e5484d' },
  { value: 'normal', label: 'Normal', color: '#8e8c99' },
  { value: 'low', label: 'Low', color: '#3e8ef7' },
];

/** Platforms a format usually goes out on (used to preselect channels). */
export const FORMAT_PLATFORMS: Record<ContentFormat, Platform[]> = {
  long_video: ['youtube'],
  short_video: ['tiktok', 'instagram', 'youtube_shorts'],
  trailer: ['youtube', 'instagram', 'x', 'facebook'],
  teaser: ['instagram', 'tiktok', 'x', 'youtube_shorts'],
  livestream: ['youtube', 'twitch'],
  podcast: ['podcast', 'youtube'],
  carousel: ['instagram', 'linkedin'],
  image: ['instagram', 'x', 'threads', 'facebook'],
  story: ['instagram', 'snapchat', 'facebook'],
  text: ['x', 'threads', 'linkedin'],
  article: ['blog', 'website', 'linkedin'],
  newsletter: ['newsletter'],
  ad: ['instagram', 'facebook', 'youtube', 'tiktok'],
  other: [],
};

/** Short noun for a format, used in generated titles ("Trailer — Short #2"). */
export const FORMAT_NOUN: Record<ContentFormat, string> = {
  long_video: 'Video',
  short_video: 'Short',
  trailer: 'Trailer',
  teaser: 'Teaser',
  livestream: 'Live',
  podcast: 'Podcast',
  carousel: 'Carousel',
  image: 'Still',
  story: 'Story',
  text: 'Thread',
  article: 'Article',
  newsletter: 'Newsletter blurb',
  ad: 'Ad',
  other: 'Piece',
};

export function formatLabel(f: ContentFormat | undefined): string {
  return (f && FORMAT_BY_ID[f]?.label) || 'Other';
}

export function stageColor(s: ContentStage | undefined): string {
  return (s && STAGE_BY_ID[s]?.color) || '#a5a3b3';
}

/** Active channels whose platform suits the format. */
export function defaultChannelsFor(format: ContentFormat, channels: Channel[]): ID[] {
  const wanted = FORMAT_PLATFORMS[format] ?? [];
  return channels.filter((c) => c.active && wanted.includes(c.platform)).map((c) => c.id);
}

/* ---------------------------------------------------------------- writes */

/** Assign a patch, deleting keys set to undefined (keeps the saved JSON tidy). */
export function assign<T extends object>(target: T, patch: Partial<T>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (target as any)[k];
    else (target as any)[k] = v;
  }
}

/** Edit a piece; `field` coalesces typing into one undo step. */
export function updateContent(id: ID, fn: (c: Draft<ContentPiece>, d: Draft<SpaceData>) => void, field?: string) {
  updateSpace(
    (d) => {
      const c = d.content.find((x) => x.id === id);
      if (c) fn(c, d);
    },
    field ? { coalesce: `content:${id}:${field}` } : undefined,
  );
}

export function patchContent(id: ID, patch: Partial<ContentPiece>, field?: string) {
  updateContent(id, (c) => assign(c, patch as Partial<Draft<ContentPiece>>), field);
}

/** Set the stage; moving to Ready schedules dated draft posts. */
export function applyStage(c: Draft<ContentPiece>, stage: ContentStage) {
  c.stage = stage;
  if (stage === 'ready') for (const p of c.posts) if (p.date && p.status === 'draft') p.status = 'scheduled';
}

export function setStage(id: ID, stage: ContentStage) {
  updateContent(id, (c) => {
    if (c.stage !== stage) applyStage(c, stage);
  });
}

/** Keep content.shootId and shoot.contentIds in sync. */
export function linkShoot(d: Draft<SpaceData>, contentId: ID, shootId: ID | undefined) {
  const c = d.content.find((x) => x.id === contentId);
  for (const s of d.shoots) {
    if (s.id === shootId) continue;
    const i = s.contentIds.indexOf(contentId);
    if (i >= 0) s.contentIds.splice(i, 1);
  }
  const shoot = shootId ? d.shoots.find((s) => s.id === shootId) : undefined;
  if (shoot && !shoot.contentIds.includes(contentId)) shoot.contentIds.push(contentId);
  if (c) {
    if (shoot) {
      c.shootId = shoot.id;
      if (shoot.date) c.shootDate = shoot.date;
      if (!c.location && shoot.location) c.location = shoot.location;
    } else delete c.shootId;
  }
}

export interface CreateOptions {
  channelIds?: ID[];
  date?: string;
  time?: string;
  /** 'top' = before the first piece of the same stage (quick add), default end */
  position?: 'top' | 'end';
}

export function createContent(patch: Partial<ContentPiece>, opts: CreateOptions = {}): ContentPiece {
  const c = makeContent({ ...patch, title: patch.title?.trim() || 'Untitled content' });
  if (opts.channelIds?.length) {
    const ready = c.stage === 'ready';
    c.posts = opts.channelIds.map((ch) => makePost(ch, { date: opts.date, time: opts.date ? opts.time : undefined, status: ready && opts.date ? 'scheduled' : 'draft' }));
    for (const p of c.posts) for (const k of Object.keys(p) as (keyof ContentPost)[]) if (p[k] === undefined) delete p[k];
  }
  updateSpace((d) => {
    if (opts.position === 'top') {
      const i = d.content.findIndex((x) => x.stage === c.stage);
      if (i >= 0) {
        d.content.splice(i, 0, c);
        return;
      }
    }
    d.content.push(c);
  });
  return c;
}

/** Copy a piece (new ids, posts back to draft without links / results). Returns the new id. */
export function duplicateContent(id: ID): ID | undefined {
  const src = getSpace().content.find((x) => x.id === id);
  if (!src) return undefined;
  const copy: ContentPiece = JSON.parse(JSON.stringify(src));
  copy.id = uid('cnt');
  copy.title = `${src.title || 'Untitled content'} (copy)`;
  copy.createdAt = new Date().toISOString();
  if (copy.stage === 'published') copy.stage = 'ready';
  copy.posts = (copy.posts ?? []).map((p) => {
    const n: ContentPost = { ...p, id: uid('post'), status: p.status === 'skipped' ? 'skipped' : 'draft' };
    delete n.url;
    delete n.metrics;
    delete n.metricsAt;
    return n;
  });
  copy.shots = (copy.shots ?? []).map((s) => ({ ...s, id: uid('cshot'), done: false }));
  copy.checklist = (copy.checklist ?? []).map((i) => ({ ...i, id: uid('chk'), done: false }));
  if (copy.avRows) copy.avRows = copy.avRows.map((r) => ({ ...r, id: uid('av') }));
  updateSpace((d) => {
    const i = d.content.findIndex((x) => x.id === id);
    d.content.splice(i < 0 ? d.content.length : i + 1, 0, copy);
    if (copy.shootId) {
      const s = d.shoots.find((x) => x.id === copy.shootId);
      if (s) s.contentIds.push(copy.id);
      else delete d.content.find((x) => x.id === copy.id)!.shootId;
    }
  });
  return copy.id;
}

/** Delete a piece after confirming; cleans shoot lists and "repurposed from" links. */
export async function deleteContent(id: ID): Promise<boolean> {
  const c = getSpace().content.find((x) => x.id === id);
  if (!c) return false;
  const live = c.posts.filter((p) => p.status === 'published').length;
  const ok = await confirmDialog({
    title: 'Delete this content?',
    message: `“${truncate(c.title || 'Untitled content', 80)}” and its ${c.posts.length} post${c.posts.length === 1 ? '' : 's'}${live ? ` (${live} published, with their results)` : ''} will be removed. You can undo with Ctrl+Z.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  updateSpace((d) => {
    const i = d.content.findIndex((x) => x.id === id);
    if (i < 0) return;
    d.content.splice(i, 1);
    for (const s of d.shoots) {
      const j = s.contentIds.indexOf(id);
      if (j >= 0) s.contentIds.splice(j, 1);
    }
    for (const x of d.content) if (x.sourceId === id) delete x.sourceId;
  });
  if (useSpaceUI.getState().contentId === id) closeContent();
  toast(`Deleted “${truncate(c.title || 'Untitled content', 40)}”`, 'info');
  return true;
}

/** Move a piece to a stage, before `beforeId` (null = after the last piece of that stage). */
export function moveContent(id: ID, stage: ContentStage, beforeId: ID | null) {
  updateSpace((d) => {
    const a = d.content;
    const i = a.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [c] = a.splice(i, 1);
    if (c.stage !== stage) applyStage(c, stage);
    const j = beforeId ? a.findIndex((x) => x.id === beforeId) : -1;
    if (j >= 0) a.splice(j, 0, c);
    else {
      let k = -1;
      a.forEach((x, idx) => {
        if (x.stage === stage) k = idx;
      });
      a.splice(k < 0 ? a.length : k + 1, 0, c);
    }
  });
}

/** Change the format; also swaps the default aspect and an untouched default checklist. */
export function changeFormat(id: ID, format: ContentFormat) {
  updateContent(id, (c) => {
    const old = c.format;
    if (old === format) return;
    const oldAspect = FORMAT_BY_ID[old]?.aspect;
    if (!c.aspect || c.aspect === oldAspect) {
      const a = FORMAT_BY_ID[format]?.aspect;
      if (a) c.aspect = a;
      else delete c.aspect;
    }
    const untouched = c.checklist.every((i) => !i.done) && c.checklist.map((i) => i.text).join('\n') === defaultChecklist(old).map((i) => i.text).join('\n');
    if (untouched) c.checklist = defaultChecklist(format);
    c.format = format;
  });
}

/* ---------------------------------------------------------------- posts */

/** Edit a post. Dating a draft post of a Ready piece schedules it; publishing every post advances the piece. */
export function updatePost(contentId: ID, postId: ID, patch: Partial<ContentPost>, field?: string) {
  let advanced = false;
  updateSpace(
    (d) => {
      const c = d.content.find((x) => x.id === contentId);
      const p = c?.posts.find((x) => x.id === postId);
      if (!c || !p) return;
      const hadDate = !!p.date;
      assign(p, patch as Partial<Draft<ContentPost>>);
      if ('date' in patch && patch.date && !hadDate && c.stage === 'ready' && p.status === 'draft') p.status = 'scheduled';
      if (patch.status === 'published' && !p.date) p.date = todayISO();
      if ('status' in patch && c.stage !== 'published' && isFullyPublished(c as ContentPiece)) {
        c.stage = 'published';
        advanced = true;
      }
    },
    field ? { coalesce: `post:${postId}:${field}` } : undefined,
  );
  if (advanced) toast('Every post is live — moved to Published');
}

/** Add posts for channels (date / time copied from the first dated post). Returns the new post ids. */
export function addPosts(contentId: ID, channelIds: ID[]): ID[] {
  const ids: ID[] = [];
  updateContent(contentId, (c) => {
    const ref = c.posts.find((p) => p.date);
    for (const ch of channelIds) {
      const p = makePost(ch);
      if (ref?.date) {
        p.date = ref.date;
        if (ref.time) p.time = ref.time;
        if (c.stage === 'ready') p.status = 'scheduled';
      }
      c.posts.push(p);
      ids.push(p.id);
    }
  });
  return ids;
}

export function duplicatePost(contentId: ID, postId: ID): ID | undefined {
  let newId: ID | undefined;
  updateContent(contentId, (c) => {
    const i = c.posts.findIndex((p) => p.id === postId);
    if (i < 0) return;
    const copy = JSON.parse(JSON.stringify(c.posts[i])) as ContentPost;
    copy.id = uid('post');
    copy.status = 'draft';
    delete copy.url;
    delete copy.metrics;
    delete copy.metricsAt;
    c.posts.splice(i + 1, 0, copy);
    newId = copy.id;
  });
  return newId;
}

export async function deletePost(contentId: ID, postId: ID, channelName: string) {
  const c = getSpace().content.find((x) => x.id === contentId);
  const p = c?.posts.find((x) => x.id === postId);
  if (!c || !p) return;
  const filled = !!(p.caption?.trim() || p.title?.trim() || p.url || p.metrics || p.notes?.trim());
  if (filled) {
    const ok = await confirmDialog({
      title: 'Delete this post?',
      message: `The ${channelName} post${p.status === 'published' ? ' (published, with its results)' : ''} will be removed from “${truncate(c.title, 60)}”.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
  }
  updateContent(contentId, (x) => {
    const i = x.posts.findIndex((q) => q.id === postId);
    if (i >= 0) x.posts.splice(i, 1);
  });
}

export function postStatusLabel(s: string | undefined): string {
  return POST_STATUSES.find((x) => x.value === s)?.label ?? 'Draft';
}

/* ---------------------------------------------------------------- derived */

export interface NextPost {
  date: string;
  time?: string;
  channelId: ID;
  /** a pending post whose date has passed */
  overdue: boolean;
  /** every dated post is published (date = latest) */
  published: boolean;
}

/** Next pending post (or, when all are out, the latest published one). */
export function nextPostInfo(c: ContentPiece, today = todayISO()): NextPost | undefined {
  const key = (p: ContentPost) => `${p.date} ${p.time ?? '99:99'}`;
  const pending = c.posts.filter((p) => p.date && p.status !== 'published' && p.status !== 'skipped').sort((a, b) => key(a).localeCompare(key(b)));
  if (pending.length) {
    const p = pending[0];
    return { date: p.date!, time: p.time, channelId: p.channelId, overdue: p.date! < today, published: false };
  }
  const pub = c.posts.filter((p) => p.date && p.status === 'published').sort((a, b) => key(b).localeCompare(key(a)));
  if (pub.length) return { date: pub[0].date!, time: pub[0].time, channelId: pub[0].channelId, overdue: false, published: true };
  return undefined;
}

export function checklistProgress(c: Pick<ContentPiece, 'checklist'>): { done: number; total: number } {
  const list = c.checklist ?? [];
  return { done: list.filter((i) => i.done).length, total: list.length };
}

/* ---------------------------------------------------------------- filters */

export const NONE = '__none__';

export interface ContentFilters {
  query: string;
  format: string;
  pillar: string;
  campaign: string;
  channel: string;
  owner: string;
  hidePublished: boolean;
}

export const EMPTY_FILTERS: ContentFilters = { query: '', format: '', pillar: '', campaign: '', channel: '', owner: '', hidePublished: false };

export function hasActiveFilters(f: ContentFilters): boolean {
  return !!(f.query.trim() || f.format || f.pillar || f.campaign || f.channel || f.owner);
}

function searchText(c: ContentPiece): string {
  return [
    c.title,
    c.concept,
    c.hook,
    c.cta,
    c.keywords,
    c.notes,
    c.owner,
    c.talent,
    c.location,
    c.script,
    c.copy,
    ...c.posts.flatMap((p) => [p.title, p.caption, p.hashtags]),
    ...(c.avRows ?? []).flatMap((r) => [r.video, r.audio]),
  ]
    .filter(Boolean)
    .join('\n');
}

export function filterContent(list: ContentPiece[], f: ContentFilters, opts: { keepPublished?: boolean } = {}): ContentPiece[] {
  const q = f.query.trim();
  return list.filter((c) => {
    if (f.hidePublished && !opts.keepPublished && c.stage === 'published') return false;
    if (f.format && c.format !== f.format) return false;
    if (f.pillar && (f.pillar === NONE ? !!c.pillarId : c.pillarId !== f.pillar)) return false;
    if (f.campaign && (f.campaign === NONE ? !!c.campaignId : c.campaignId !== f.campaign)) return false;
    if (f.owner && (f.owner === NONE ? !!c.owner?.trim() : (c.owner ?? '').trim() !== f.owner)) return false;
    if (f.channel && (f.channel === NONE ? c.posts.length > 0 : !c.posts.some((p) => p.channelId === f.channel))) return false;
    if (q && !matchesQuery(searchText(c), q)) return false;
    return true;
  });
}

/** Owners used in the space (for suggestions and the owner filter). */
export function useOwnerSuggestions(): string[] {
  const content = useSpace((s) => s.content);
  const owner = useSpace((s) => s.meta.owner);
  return useMemo(() => {
    const set = new Set<string>();
    if (owner?.trim()) set.add(owner.trim());
    for (const c of content ?? []) if (c.owner?.trim()) set.add(c.owner.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [content, owner]);
}

/* ---------------------------------------------------------------- menus */

export function contentMenuItems(c: ContentPiece, opts: { inEditor?: boolean; projectTitle?: string; onOpenProject?: () => void } = {}): MenuItem[] {
  const items: MenuItem[] = [];
  if (!opts.inEditor) items.push({ label: 'Open', icon: PenLine, shortcut: 'Enter', onClick: () => openContent(c.id) });
  items.push(
    {
      label: 'Duplicate',
      icon: Copy,
      onClick: () => {
        const id = duplicateContent(c.id);
        if (!id) return;
        if (opts.inEditor) openContent(id, useSpaceUI.getState().contentTab);
        toast(`Duplicated “${truncate(c.title, 40)}”`);
      },
    },
    { label: 'Repurpose…', icon: Recycle, onClick: () => openRepurpose(c.id) },
    { label: 'Print brief…', icon: Printer, onClick: () => openPrint('space-content-brief', { content: c.title }) },
    { separator: true },
    { header: 'Move to stage' },
    ...STAGES.map((s) => ({ label: s.label, checked: c.stage === s.value, onClick: () => setStage(c.id, s.value) })),
    { separator: true },
    { label: 'Delete', icon: Trash2, danger: true, shortcut: opts.inEditor ? undefined : 'Del', onClick: () => void deleteContent(c.id) },
  );
  return items;
}

/* ---------------------------------------------------------------- CSV */

export async function exportContentCsv() {
  const s = getSpace();
  const pillar = new Map(s.pillars.map((p) => [p.id, p.name]));
  const camp = new Map(s.campaigns.map((p) => [p.id, p.name]));
  const ch = new Map(s.channels.map((p) => [p.id, p.name]));
  const order = STAGES.map((x) => x.value);
  const rows = [...s.content].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  const path = await exportCsv(`${safeFileName(s.meta.title)} - Content`, rows, [
    { header: 'Title', value: (c) => c.title },
    { header: 'Format', value: (c) => formatLabel(c.format) },
    { header: 'Stage', value: (c) => STAGE_BY_ID[c.stage]?.label ?? c.stage },
    { header: 'Priority', value: (c) => PRIORITIES.find((p) => p.value === (c.priority ?? 'normal'))?.label },
    { header: 'Pillar', value: (c) => (c.pillarId ? pillar.get(c.pillarId) ?? '' : '') },
    { header: 'Campaign', value: (c) => (c.campaignId ? camp.get(c.campaignId) ?? '' : '') },
    { header: 'Owner', value: (c) => c.owner ?? '' },
    { header: 'Channels', value: (c) => c.posts.map((p) => ch.get(p.channelId) ?? 'Deleted channel').join(', ') },
    { header: 'Next post', value: (c) => nextPostInfo(c)?.date ?? '' },
    { header: 'Shoot date', value: (c) => c.shootDate ?? '' },
    { header: 'Edit due', value: (c) => c.editDue ?? '' },
    { header: 'Checklist', value: (c) => `${checklistProgress(c).done}/${checklistProgress(c).total}` },
    { header: 'Concept', value: (c) => c.concept ?? '' },
    { header: 'Hook', value: (c) => c.hook ?? '' },
    { header: 'CTA', value: (c) => c.cta ?? '' },
    { header: 'Target length', value: (c) => c.length ?? '' },
    { header: 'Aspect', value: (c) => c.aspect ?? '' },
  ]);
  if (path) toast('Content exported to CSV');
}

export function captionLimitFor(ch: Channel | undefined): number | undefined {
  return ch ? PLATFORM_BY_ID[ch.platform]?.captionLimit : undefined;
}

/** Options plus an entry for a value that no longer exists (deleted pillar, channel …). */
export function withMissing(options: Option[], value: string | undefined, label: string): Option[] {
  return value && !options.some((o) => o.value === value) ? [{ value, label }, ...options] : options;
}

/** Open a link in the system browser (desktop) or a new tab (browser mode). */
export function openUrl(raw: string) {
  const t = raw.trim();
  if (!t) return;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  if (backend.openExternal) backend.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** Links found in free text (references, notes). */
export function findLinks(text: string | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi)) out.add(m[0].replace(/[.,;:!?]+$/, ''));
  return [...out];
}
