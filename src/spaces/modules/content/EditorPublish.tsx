/* Content editor › Publish: one card per post (channel, date, time, status,
   platform title, caption with limits, hashtags, live link, notes). */
import { useMemo } from 'react';
import { CheckCircle2, ClipboardCopy, Copy, ExternalLink, Layers, MoreHorizontal, Plus, Radio, Send, Trash2, TriangleAlert } from 'lucide-react';
import { navigateSpace } from '@/store/app';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { PLATFORM_BY_ID, POST_STATUSES } from '@/spaces/constants';
import { channelColor, isFullyPublished } from '@/spaces/derive';
import { closeContent } from '@/spaces/ui';
import type { Channel, ContentPiece, ContentPost, PostStatus } from '@/spaces/types';
import { todayISO } from '@/lib/dates';
import { Button, DateInput, EmptyState, Field, IconButton, Input, Menu, Select, Textarea, TimeInput, confirmDialog, toast, type MenuItem } from '@/ui';
import { addPosts, deletePost, duplicatePost, openUrl, setStage, updateContent, updatePost, withMissing } from './shared';

export function PublishTab({ c }: { c: ContentPiece }) {
  const channels = useSpace((s) => s.channels) ?? [];
  const chMap = useMemo(() => new Map(channels.map((ch) => [ch.id, ch])), [channels]);
  const used = useMemo(() => new Set(c.posts.map((p) => p.channelId)), [c.posts]);
  const activeUnused = channels.filter((ch) => ch.active && !used.has(ch.id));
  const counts = useMemo(() => {
    const out: Record<PostStatus, number> = { draft: 0, scheduled: 0, published: 0, skipped: 0 };
    for (const p of c.posts) out[p.status] = (out[p.status] ?? 0) + 1;
    return out;
  }, [c.posts]);
  const fully = isFullyPublished(c);

  const addMenu = (): MenuItem[] => {
    const act = channels.filter((ch) => ch.active);
    const inactive = channels.filter((ch) => !ch.active);
    const item = (ch: Channel): MenuItem => ({
      label: `${ch.name}${used.has(ch.id) ? ' (again)' : ''}`,
      icon: Radio,
      onClick: () => {
        addPosts(c.id, [ch.id]);
        focusLast();
      },
    });
    return [
      ...(act.length ? [{ header: 'Channels' } as MenuItem, ...act.map(item)] : []),
      ...(inactive.length ? [{ separator: true } as MenuItem, { header: 'Inactive' } as MenuItem, ...inactive.map(item)] : []),
      { separator: true },
      {
        label: 'Manage channels…',
        onClick: () => {
          closeContent();
          navigateSpace('channels');
        },
      },
    ];
  };

  const addAll = () => {
    if (!activeUnused.length) return;
    addPosts(
      c.id,
      activeUnused.map((ch) => ch.id),
    );
    toast(`Added ${activeUnused.length} post${activeUnused.length === 1 ? '' : 's'}`);
  };

  const copyCaptionToAll = async (from: ContentPost) => {
    const others = c.posts.filter((p) => p.id !== from.id);
    if (!others.length) return;
    const overwrite = others.filter((p) => (p.caption?.trim() && p.caption !== from.caption) || (p.hashtags?.trim() && p.hashtags !== from.hashtags)).length;
    if (overwrite) {
      const ok = await confirmDialog({
        title: 'Copy caption to every post?',
        message: `${overwrite} post${overwrite === 1 ? ' has its' : 's have their'} own caption or hashtags, which will be replaced.`,
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }
    updateContent(c.id, (x) => {
      for (const p of x.posts) {
        if (p.id === from.id) continue;
        if (from.caption) p.caption = from.caption;
        else delete p.caption;
        if (from.hashtags) p.hashtags = from.hashtags;
        else delete p.hashtags;
      }
    });
    toast(`Caption copied to ${others.length} post${others.length === 1 ? '' : 's'}`);
  };

  if (!channels.length) {
    return (
      <div className="sp-content-tab">
        <EmptyState
          icon={Radio}
          title="No channels yet"
          description="Add the platforms you publish on (YouTube, Instagram, TikTok, your newsletter …). Then plan one post per channel here, each with its own date, caption and status."
          action={
            <Button
              variant="primary"
              onClick={() => {
                closeContent();
                navigateSpace('channels');
              }}
            >
              Set up channels
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="sp-content-tab sp-content-publish">
      <div className="sp-content-publish-bar">
        <Menu trigger={<Button variant="primary" size="sm" icon={Plus}>Add post</Button>} items={addMenu} />
        <Button size="sm" icon={Layers} disabled={!activeUnused.length} onClick={addAll} title={activeUnused.length ? activeUnused.map((ch) => ch.name).join(', ') : 'Every active channel already has a post'}>
          Add to all active channels{activeUnused.length ? ` (${activeUnused.length})` : ''}
        </Button>
        <div className="spacer" />
        {c.posts.length > 0 && (
          <span className="sp-content-publish-summary">
            {POST_STATUSES.filter((s) => counts[s.value]).map((s) => (
              <span key={s.value} className="row" style={{ gap: 4 }}>
                <span className="color-dot" style={{ background: s.color, width: 8, height: 8 }} />
                {counts[s.value]} {s.label.toLowerCase()}
              </span>
            ))}
          </span>
        )}
      </div>

      {fully && c.stage !== 'published' && (
        <div className="sp-content-banner success">
          <CheckCircle2 size={16} />
          <span className="grow">Every planned post is live.</span>
          <Button size="sm" onClick={() => setStage(c.id, 'published')}>
            Move to Published
          </Button>
        </div>
      )}

      {c.posts.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Not planned yet"
          description="Add a post for every channel this piece goes out on. Each post gets its own date, time, caption and status — and shows up on the calendar."
          action={
            <div className="row" style={{ gap: 8 }}>
              {activeUnused.length > 0 && (
                <Button variant="primary" icon={Layers} onClick={addAll}>
                  Add to all {activeUnused.length} active channel{activeUnused.length === 1 ? '' : 's'}
                </Button>
              )}
              <Menu trigger={<Button icon={Plus}>Pick a channel</Button>} items={addMenu} />
            </div>
          }
        />
      ) : (
        <div className="sp-content-posts">
          {c.posts.map((p) => (
            <PostCard key={p.id} c={c} post={p} channel={chMap.get(p.channelId)} channels={channels} onCopyCaption={() => void copyCaptionToAll(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function focusLast() {
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('.sp-content-post');
    const last = cards[cards.length - 1] as HTMLElement | undefined;
    last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (last?.querySelector('input[type="date"]') as HTMLInputElement | null)?.focus();
  });
}

function Counter({ n, limit, title }: { n: number; limit?: number; title?: string }) {
  if (!limit) return n ? <span className="sp-content-counter">{n.toLocaleString()}</span> : null;
  const over = n > limit;
  const near = !over && n > limit * 0.9;
  return (
    <span className={`sp-content-counter ${over ? 'over' : near ? 'near' : ''}`} title={title}>
      {n.toLocaleString()} / {limit.toLocaleString()}
    </span>
  );
}

function PostCard({ c, post, channel, channels, onCopyCaption }: { c: ContentPiece; post: ContentPost; channel?: Channel; channels: Channel[]; onCopyCaption: () => void }) {
  const fmt = useSpaceFormatters();
  const platform = channel ? PLATFORM_BY_ID[channel.platform] : undefined;
  const color = channel ? channelColor(channel) : '#8a8a94';
  const set = (patch: Partial<ContentPost>, field?: string) => updatePost(c.id, post.id, patch, field);
  const today = todayISO();
  const overdue = !!post.date && post.date < today && (post.status === 'draft' || post.status === 'scheduled');
  const showTitle = !!platform?.hasTitle || !!post.title;
  const captionLen = (post.caption?.length ?? 0) + (post.hashtags?.trim() ? post.hashtags.trim().length + 2 : 0);
  const tagCount = (post.hashtags?.match(/#[^\s#]+/g) ?? []).length;
  const statusColor = POST_STATUSES.find((s) => s.value === post.status)?.color ?? '#a5a3b3';
  const channelOptions = withMissing(
    channels.map((ch) => ({ value: ch.id, label: `${ch.name}${ch.active ? '' : ' (inactive)'}` })),
    post.channelId,
    'Deleted channel',
  );

  const menu = (): MenuItem[] => [
    { label: 'Copy caption to all posts', icon: ClipboardCopy, disabled: c.posts.length < 2 || (!post.caption && !post.hashtags), onClick: onCopyCaption },
    {
      label: 'Duplicate post',
      icon: Copy,
      onClick: () => {
        duplicatePost(c.id, post.id);
      },
    },
    { separator: true },
    { label: 'Delete post', icon: Trash2, danger: true, onClick: () => void deletePost(c.id, post.id, channel?.name ?? 'channel') },
  ];

  return (
    <div className={`sp-content-post ${post.status}`} style={{ ['--ch' as string]: color, ['--ps' as string]: statusColor }} data-post-id={post.id}>
      <div className="sp-content-post-head">
        <span className="sp-content-post-swatch" />
        <Select bare value={post.channelId} options={channelOptions} onChange={(v) => set({ channelId: v })} className="sp-content-post-channel" aria-label="Channel" />
        <div className="spacer" />
        <span className="sp-content-post-status">
          <span className="color-dot" style={{ background: statusColor, width: 8, height: 8 }} />
          <Select bare size="sm" value={post.status} options={POST_STATUSES} onChange={(v) => set({ status: v as PostStatus })} aria-label="Status" />
        </span>
        <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label="Post actions" />} items={menu} />
      </div>
      <div className="sp-content-post-body">
        <div className="sp-content-post-when">
          <Field label="Date">
            <DateInput value={post.date} onChange={(v) => set({ date: v })} />
          </Field>
          <Field label="Time">
            <TimeInput value={post.time} onChange={(v) => set({ time: v })} />
          </Field>
          <div className="sp-content-post-whenhint">
            {overdue ? (
              <span className="sp-content-warn">
                <TriangleAlert size={12} /> Date has passed — mark it published or move it
              </span>
            ) : post.date ? (
              <span className="muted small">{fmt.dateLong(post.date)}</span>
            ) : (
              <span className="muted small">Unscheduled</span>
            )}
            {channel?.bestTimes && <span className="muted small">Best: {channel.bestTimes}</span>}
          </div>
        </div>
        {showTitle && (
          <Field label={<span className="sp-content-label-row">Title {platform?.titleLimit ? <Counter n={post.title?.length ?? 0} limit={platform.titleLimit} /> : null}</span>}>
            <Input value={post.title} placeholder={c.title} onChange={(v) => set({ title: v || undefined }, 'title')} />
          </Field>
        )}
        <Field
          label={
            <span className="sp-content-label-row">
              Caption
              <Counter n={captionLen} limit={platform?.captionLimit} title={post.hashtags?.trim() ? 'Caption + hashtags' : undefined} />
              {!post.caption?.trim() && c.copy?.trim() && (
                <button type="button" className="sp-content-linkbtn" onClick={() => set({ caption: c.copy })}>
                  Use the copy
                </button>
              )}
            </span>
          }
        >
          <Textarea autoGrow minRows={3} value={post.caption} placeholder={c.hook ? `Start with the hook: ${c.hook}` : 'What the post says'} onChange={(v) => set({ caption: v || undefined }, 'caption')} />
        </Field>
        <div className="sp-content-post-2">
          <Field label={<span className="sp-content-label-row">Hashtags {tagCount ? <span className={`sp-content-counter ${channel?.platform === 'instagram' && tagCount > 30 ? 'over' : ''}`}>{tagCount}</span> : null}</span>}>
            <Input value={post.hashtags} placeholder="#filmmaking #bts" onChange={(v) => set({ hashtags: v || undefined }, 'hashtags')} />
          </Field>
          <Field label="Live link">
            <div className="row" style={{ gap: 4 }}>
              <Input value={post.url} placeholder="https://…" onChange={(v) => set({ url: v || undefined }, 'url')} style={{ flex: 1, minWidth: 0 }} />
              <IconButton icon={ExternalLink} label="Open link" disabled={!post.url?.trim()} onClick={() => post.url && openUrl(post.url)} />
            </div>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea autoGrow minRows={1} value={post.notes} placeholder="Collab tags, boost budget, cross-post notes…" onChange={(v) => set({ notes: v || undefined }, 'notes')} />
        </Field>
      </div>
    </div>
  );
}
