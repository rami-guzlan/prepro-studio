/* Store writes of the calendar (each one = one undo step). */
import type { ContentFormat, ContentPost, PostStatus, SpaceMilestone } from '@/spaces/types';
import { makeContent, makePost } from '@/spaces/defaults';
import { getSpace, spaceUndo, updateSpace } from '@/store/space';
import { uid } from '@/lib/id';
import { toast } from '@/ui';
import { isISODate } from './model';

export function undoToast(message: string) {
  toast(message, 'success', { action: { label: 'Undo', onClick: () => spaceUndo() } });
}

/** Set (or clear) the date of posts; time and status are kept. */
export function setPostsDate(contentId: string, postIds: string[], date: string | undefined) {
  const ids = new Set(postIds);
  updateSpace((d) => {
    const c = d.content.find((x) => x.id === contentId);
    if (!c) return;
    for (const p of c.posts ?? []) {
      if (!ids.has(p.id)) continue;
      if (date) p.date = date;
      else delete p.date;
    }
  });
}

export function setPostStatus(contentId: string, postId: string, status: PostStatus) {
  updateSpace((d) => {
    const p = d.content.find((x) => x.id === contentId)?.posts?.find((x) => x.id === postId);
    if (p) p.status = status;
  });
}

export function setPostTime(contentId: string, postId: string, time: string | undefined) {
  updateSpace(
    (d) => {
      const p = d.content.find((x) => x.id === contentId)?.posts?.find((x) => x.id === postId);
      if (!p) return;
      if (time) p.time = time;
      else delete p.time;
    },
    { coalesce: `post:${postId}:time` },
  );
}

/** Create one post per channel on a date. */
export function createPosts(contentId: string, channelIds: string[], date: string, time?: string): number {
  const posts: ContentPost[] = channelIds.map((ch) => makePost(ch, { date, ...(time ? { time } : {}) }));
  if (!posts.length) return 0;
  updateSpace((d) => {
    const c = d.content.find((x) => x.id === contentId);
    if (c) (c.posts ??= []).push(...posts);
  });
  return posts.length;
}

export function setMilestone(id: string, patch: Partial<SpaceMilestone>, coalesce = false) {
  updateSpace(
    (d) => {
      const m = d.milestones.find((x) => x.id === id);
      if (!m) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete (m as any)[k];
        else (m as any)[k] = v;
      }
      if (m.name == null) m.name = '';
    },
    coalesce ? { coalesce: `ms:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function deleteMilestone(id: string) {
  updateSpace((d) => {
    const i = d.milestones.findIndex((x) => x.id === id);
    if (i >= 0) d.milestones.splice(i, 1);
  });
}

export function createMilestone(name: string, date: string, campaignId?: string): string {
  const ms: SpaceMilestone = { id: uid('sms'), name: name.trim() || 'Milestone', date, ...(campaignId ? { campaignId } : {}) };
  updateSpace((d) => {
    d.milestones.push(ms);
  });
  return ms.id;
}

/** Quick-create a content piece that posts on `date` on one channel. */
export function createContentPosting(opts: { title: string; format: ContentFormat; channelId: string; date: string; time?: string; campaignId?: string }): string {
  const c = makeContent({
    title: opts.title.trim() || 'Untitled content',
    format: opts.format,
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
    posts: [makePost(opts.channelId, { date: opts.date, ...(opts.time ? { time: opts.time } : {}) })],
  });
  updateSpace((d) => {
    d.content.push(c);
  });
  return c.id;
}

/** Undated (non-skipped, non-published) posts of a piece. */
export function undatedPostIds(contentId: string): string[] {
  const c = getSpace().content.find((x) => x.id === contentId);
  return (c?.posts ?? []).filter((p) => !isISODate(p.date) && p.status !== 'skipped' && p.status !== 'published').map((p) => p.id);
}
