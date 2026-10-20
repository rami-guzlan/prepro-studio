/* Channels: platform picker (add channel) and the delete-with-posts dialog. */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRightLeft, Check, Trash2 } from 'lucide-react';
import type { ID } from '@/types';
import type { Channel, Platform } from '@/spaces/types';
import { PLATFORMS, PLATFORM_BY_ID, type PlatformDef } from '@/spaces/constants';
import { makeChannel } from '@/spaces/defaults';
import { channelColor } from '@/spaces/derive';
import { getSpace, spaceUndo, updateSpace, useSpace } from '@/store/space';
import { Button, confirmDialog, Modal, Popover, Select, toast, type AnchorRect } from '@/ui';
import { PlatformMark } from './util';

/* ---------------------------------------------------------------- adding */

/** Add one channel; returns its id. */
export function addChannel(platform: Platform, patch: Partial<Channel> = {}): ID {
  const def = PLATFORM_BY_ID[platform];
  const ch = makeChannel(platform, { name: def?.label ?? platform, ...patch });
  updateSpace((d) => void d.channels.push(ch));
  return ch.id;
}

export interface ChannelSet {
  id: string;
  label: string;
  hint: string;
  channels: [Platform, number?, ('week' | 'month')?][];
}

export const CHANNEL_SETS: ChannelSet[] = [
  { id: 'core', label: 'YouTube + Instagram + TikTok', hint: 'The classic creator trio', channels: [['youtube', 1, 'week'], ['instagram', 3, 'week'], ['tiktok', 3, 'week']] },
  { id: 'shorts', label: 'Short-form everywhere', hint: 'Shorts, Reels and TikTok', channels: [['youtube_shorts', 3, 'week'], ['instagram', 4, 'week'], ['tiktok', 5, 'week']] },
  { id: 'release', label: 'Film release', hint: 'Socials, trailer home, press', channels: [['instagram', 4, 'week'], ['tiktok', 4, 'week'], ['youtube', 1, 'week'], ['x', 5, 'week'], ['press']] },
  { id: 'writer', label: 'Writing & thought leadership', hint: 'Newsletter, LinkedIn, X', channels: [['newsletter', 2, 'month'], ['linkedin', 3, 'week'], ['x', 5, 'week']] },
];

/** Add a set of channels in one undo step (platforms already present are skipped). Returns the number added. */
export function addChannelSet(set: ChannelSet): number {
  const have = new Set(getSpace().channels.map((c) => c.platform));
  const add = set.channels
    .filter(([p]) => !have.has(p))
    .map(([platform, cadence, unit]) => makeChannel(platform, { name: PLATFORM_BY_ID[platform]?.label ?? platform, cadence, cadenceUnit: cadence ? unit ?? 'week' : undefined }));
  if (add.length) updateSpace((d) => void d.channels.push(...add));
  return add.length;
}

/* ---------------------------------------------------------------- platform picker */

export function PlatformPicker({ anchor, onClose, onPick }: { anchor: AnchorRect | null; onClose: () => void; onPick: (p: PlatformDef) => void }) {
  const channels = useSpace((s) => s.channels);
  const used = useMemo(() => new Set(channels.map((c) => c.platform)), [channels]);
  const gridRef = useRef<HTMLDivElement>(null);

  const onKey = (e: KeyboardEvent) => {
    const btns = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 2 : e.key === 'ArrowUp' ? -2 : 0;
    if (!step) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + step))]?.focus();
  };

  return (
    <Popover anchor={anchor} onClose={onClose} align="end">
      <div className="sp-channels-picker">
        <div className="menu-label">Add a channel</div>
        <div className="sp-channels-picker-grid" ref={gridRef} onKeyDown={onKey} role="menu">
          {PLATFORMS.map((p, i) => (
            <button
              key={p.value}
              type="button"
              role="menuitem"
              className="sp-channels-pick"
              autoFocus={i === 0}
              onClick={() => {
                onClose();
                onPick(p);
              }}
              title={used.has(p.value) ? `You already have a ${p.label} channel — add another account` : `Add ${p.label}`}
            >
              <PlatformMark platform={p.value} color={p.color} size={24} />
              <span className="grow ellipsis">{p.label}</span>
              {used.has(p.value) && <Check size={13} className="sp-channels-used" />}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}

/* ---------------------------------------------------------------- deleting */

function removeChannel(id: ID, posts: 'move' | 'delete' | 'none', target?: ID) {
  updateSpace((d) => {
    for (const c of d.content) {
      if (posts === 'move' && target) {
        for (const p of c.posts) if (p.channelId === id) p.channelId = target;
      } else if (posts === 'delete') {
        if (c.posts.some((p) => p.channelId === id)) c.posts = c.posts.filter((p) => p.channelId !== id);
      }
    }
    for (const camp of d.campaigns) if (camp.channelIds?.includes(id)) camp.channelIds = camp.channelIds.filter((x) => x !== id);
    for (const t of d.tactics) if (t.channelIds?.includes(id)) t.channelIds = t.channelIds.filter((x) => x !== id);
    const i = d.channels.findIndex((c) => c.id === id);
    if (i >= 0) d.channels.splice(i, 1);
  });
}

export function postsUsingChannel(id: ID): number {
  return getSpace().content.reduce((a, c) => a + c.posts.filter((p) => p.channelId === id).length, 0);
}

/** Delete a channel that no post uses (simple confirm). */
export async function deleteUnusedChannel(ch: Channel) {
  const ok = await confirmDialog({ title: `Delete ${ch.name || 'this channel'}?`, message: 'No posts use this channel. Campaigns and tactics that list it will no longer show it.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  removeChannel(ch.id, 'none');
  toast(`Deleted ${ch.name || 'channel'}`, 'success', { action: { label: 'Undo', onClick: () => spaceUndo() } });
}

export function DeleteChannelDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const content = useSpace((s) => s.content);
  const channels = useSpace((s) => s.channels);
  const { posts, pieces, published } = useMemo(() => {
    let posts = 0;
    let published = 0;
    let pieces = 0;
    for (const c of content) {
      const n = c.posts.filter((p) => p.channelId === channel.id);
      if (n.length) pieces++;
      posts += n.length;
      published += n.filter((p) => p.status === 'published').length;
    }
    return { posts, pieces, published };
  }, [content, channel.id]);
  const others = useMemo(() => channels.filter((c) => c.id !== channel.id), [channels, channel.id]);
  const [mode, setMode] = useState<'move' | 'delete'>(others.length ? 'move' : 'delete');
  const [target, setTarget] = useState<ID>(() => (others.find((o) => o.platform === channel.platform) ?? others.find((o) => o.active) ?? others[0])?.id ?? '');
  const targetCh = others.find((o) => o.id === target);
  const canConfirm = mode === 'delete' || !!targetCh;

  const confirm = () => {
    if (!canConfirm) return;
    removeChannel(channel.id, mode, mode === 'move' ? target : undefined);
    onClose();
    toast(mode === 'move' ? `Deleted ${channel.name || 'channel'} · moved ${posts} ${posts === 1 ? 'post' : 'posts'} to ${targetCh?.name}` : `Deleted ${channel.name || 'channel'} and ${posts} ${posts === 1 ? 'post' : 'posts'}`, 'success', {
      action: { label: 'Undo', onClick: () => spaceUndo() },
    });
  };

  return (
    <Modal
      open
      size="sm"
      title={`Delete ${channel.name || 'channel'}?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger-solid" icon={Trash2} disabled={!canConfirm} onClick={confirm} autoFocus>
            Delete channel
          </Button>
        </>
      }
    >
      <div
        className="col"
        style={{ gap: 12 }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'SELECT') {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <p className="text-2" style={{ margin: 0 }}>
          {posts} {posts === 1 ? 'post' : 'posts'} in {pieces} {pieces === 1 ? 'content piece' : 'content pieces'} {posts === 1 ? 'goes' : 'go'} out on this channel
          {published ? ` (${published} already published, with their results)` : ''}. What should happen to {posts === 1 ? 'it' : 'them'}?
        </p>
        <label className={`sp-channels-opt ${mode === 'move' ? 'on' : ''} ${others.length ? '' : 'disabled'}`}>
          <input type="radio" name="sp-ch-del" checked={mode === 'move'} disabled={!others.length} onChange={() => setMode('move')} />
          <ArrowRightLeft size={15} />
          <div className="grow col" style={{ gap: 6 }}>
            <span className="strong">
              Move {posts === 1 ? 'its post' : `its ${posts} posts`} to another channel
            </span>
            {others.length ? (
              <div className="row" style={{ gap: 6 }}>
                {targetCh && <span className="color-dot" style={{ background: channelColor(targetCh) }} />}
                <Select
                  size="sm"
                  value={target}
                  onChange={(v) => {
                    setTarget(v);
                    setMode('move');
                  }}
                  options={others.map((o) => ({ value: o.id, label: `${o.name || PLATFORM_BY_ID[o.platform]?.label}${o.active ? '' : ' (inactive)'}` }))}
                />
              </div>
            ) : (
              <span className="muted small">There is no other channel to move them to.</span>
            )}
          </div>
        </label>
        <label className={`sp-channels-opt danger ${mode === 'delete' ? 'on' : ''}`}>
          <input type="radio" name="sp-ch-del" checked={mode === 'delete'} onChange={() => setMode('delete')} />
          <Trash2 size={15} />
          <div className="grow col" style={{ gap: 2 }}>
            <span className="strong">Delete {posts === 1 ? 'that post' : `those ${posts} posts`}</span>
            <span className="muted small">The content pieces stay; only their distribution on this channel is removed.</span>
          </div>
        </label>
        <span className="muted small">You can undo this with Ctrl+Z.</span>
      </div>
    </Modal>
  );
}

