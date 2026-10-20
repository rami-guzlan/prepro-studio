/* One channel card: identity, cadence & results at a glance, editable details. */
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CalendarClock, ExternalLink, GripVertical, MoreHorizontal, Palette, Power, Trash2, TriangleAlert } from 'lucide-react';
import type { Channel, Platform } from '@/spaces/types';
import { PLATFORMS, PLATFORM_BY_ID, POST_STATUSES } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { spaceListOps, useSpaceFormatters } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { ColorPicker, IconButton, Input, Menu, NumberInput, Popover, Progress, Select, StatusBadge, Switch, Textarea, type AnchorRect } from '@/ui';
import { compact, openExternal, pct, PlatformMark, type ChannelStats } from './util';

export const channelOps = spaceListOps<Channel>((d) => d.channels, 'channels');

const UNITS = [
  { value: 'week', label: 'per week' },
  { value: 'month', label: 'per month' },
];

export interface CardDrag {
  dragging: boolean;
  over: 'before' | 'after' | null;
  onHandleDragStart: (e: DragEvent, card: HTMLElement | null) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

export function ChannelCard({ channel, stats, autoFocus, onFocused, onDelete, drag }: { channel: Channel; stats?: ChannelStats; autoFocus?: boolean; onFocused?: () => void; onDelete: (c: Channel) => void; drag: CardDrag }) {
  const fmt = useSpaceFormatters();
  const color = channelColor(channel);
  const def = PLATFORM_BY_ID[channel.platform] ?? PLATFORM_BY_ID.other;
  const cardRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [look, setLook] = useState<AnchorRect | null>(null);
  const up = (patch: Partial<Channel>) => channelOps.update(channel.id, patch);

  useEffect(() => {
    if (!autoFocus) return;
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    nameRef.current?.focus();
    nameRef.current?.select();
    onFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const changePlatform = (p: Platform) => {
    if (p === channel.platform) return;
    const oldLabel = PLATFORM_BY_ID[channel.platform]?.label;
    up({ platform: p, ...((channel.name ?? '').trim() === '' || channel.name === oldLabel || channel.name === channel.platform ? { name: PLATFORM_BY_ID[p]?.label ?? p } : {}) });
  };

  const st = stats;
  const planned = st?.planned ?? 0;
  const target = st?.target;
  const ratio = target ? planned / target : 0;
  const cadenceColor = !target ? 'var(--text-3)' : ratio >= 1 ? 'var(--success)' : ratio >= 0.5 ? 'var(--warning)' : 'var(--danger)';
  const next = st?.next;

  return (
    <div
      ref={cardRef}
      className={['card', 'sp-channels-card', !channel.active && 'inactive', drag.dragging && 'dragging', drag.over && `over-${drag.over}`].filter(Boolean).join(' ')}
      style={{ ['--ch-color' as string]: color }}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
    >
      <div className="sp-channels-head">
        <span
          className="sp-channels-grip"
          draggable
          title="Drag to reorder"
          aria-hidden
          onDragStart={(e) => drag.onHandleDragStart(e, cardRef.current)}
          onDragEnd={drag.onDragEnd}
        >
          <GripVertical size={14} />
        </span>
        <button
          type="button"
          className="sp-channels-markbtn"
          title="Platform & colour"
          aria-label="Change platform and colour"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setLook({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
          }}
        >
          <PlatformMark platform={channel.platform} color={color} name={channel.name} size={38} />
        </button>
        <div className="sp-channels-ident">
          <Input ref={nameRef} bare className="sp-channels-name" value={channel.name} placeholder={def.label} aria-label="Channel name" onChange={(name) => up({ name })} />
          <div className="sp-channels-sub ellipsis">
            {def.label}
            {channel.handle?.trim() ? ` · ${channel.handle.trim()}` : ''}
            {channel.followers != null ? ` · ${compact(channel.followers)} followers` : ''}
          </div>
        </div>
        <Switch checked={channel.active} onChange={(active) => up({ active })} />
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="Channel actions" size="sm" />}
          items={() => [
            { label: 'Open channel page', icon: ExternalLink, disabled: !channel.url?.trim(), onClick: () => openExternal(channel.url!) },
            {
              label: 'Platform & colour…',
              icon: Palette,
              onClick: () => {
                const r = cardRef.current?.querySelector('.sp-channels-markbtn')?.getBoundingClientRect();
                if (r) setLook({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
              },
            },
            { label: channel.active ? 'Mark inactive' : 'Mark active', icon: Power, onClick: () => up({ active: !channel.active }) },
            { label: 'Open calendar', icon: CalendarClock, onClick: () => navigateSpace('calendar') },
            { separator: true },
            { label: 'Delete channel…', icon: Trash2, danger: true, onClick: () => onDelete(channel) },
          ]}
        />
      </div>

      <div className="sp-channels-stats">
        <div className="sp-channels-stat" title={target ? `${planned} planned of ${target} per ${st?.period}` : 'Set a cadence target below'}>
          <span className="k">{st?.period === 'month' ? 'This month' : 'This week'}</span>
          <span className="v">
            {planned}
            {target ? <span className="of"> / {target}</span> : null}
          </span>
          {target ? <Progress value={Math.min(1, ratio)} color={cadenceColor} style={{ height: 4 }} /> : <span className="s">no target</span>}
        </div>
        <div className="sp-channels-stat">
          <span className="k">Published</span>
          <span className="v">{st?.published ?? 0}</span>
          <span className="s">{st && st.total > st.published ? `${st.total - st.published} planned` : 'posts'}</span>
        </div>
        <div className="sp-channels-stat" title={st?.views ? `${fmt.number(st.views)} views` : undefined}>
          <span className="k">Views</span>
          <span className="v">{st?.views ? compact(st.views) : '—'}</span>
          <span className="s">{st?.published ? `${st.withMetrics}/${st.published} logged` : 'total'}</span>
        </div>
        <div className="sp-channels-stat" title="Likes + comments + shares + saves">
          <span className="k">Engagement</span>
          <span className="v">{st?.engagement ? compact(st.engagement) : '—'}</span>
          <span className="s">{st?.engagement && st.views ? `${pct(st.engagement, st.views)} of views` : 'total'}</span>
        </div>
      </div>

      <div className="sp-channels-next">
        <CalendarClock size={14} />
        {next ? (
          <button type="button" className="sp-channels-nextbtn" onClick={() => openContent(next.content.id, 'publish')} title="Open in the content editor">
            <span className="when">
              {fmt.dateShort(next.post.date)}
              {next.post.time ? ` · ${fmt.time(next.post.time)}` : ''}
            </span>
            <span className="what ellipsis">{next.content.title || 'Untitled content'}</span>
            <StatusBadge value={next.post.status} options={POST_STATUSES} />
          </button>
        ) : (
          <span className="muted small">Nothing scheduled{channel.active ? ' yet' : ''}</span>
        )}
        {!!st?.overdue && (
          <span className="badge warning" title="Date passed, not marked published or skipped">
            <TriangleAlert size={11} /> {st.overdue} overdue
          </span>
        )}
      </div>

      <div className="sp-channels-fields">
        <label className="sp-channels-field">
          <span>Handle</span>
          <Input size="sm" value={channel.handle} placeholder="@handle" onChange={(handle) => up({ handle })} />
        </label>
        <label className="sp-channels-field">
          <span>Followers</span>
          <NumberInput size="sm" value={channel.followers} placeholder="0" onChange={(followers) => up({ followers: followers == null ? undefined : Math.max(0, Math.round(followers)) })} />
        </label>
        <div className="sp-channels-field span">
          <span>Link</span>
          <div className="row" style={{ gap: 4 }}>
            <Input size="sm" value={channel.url} placeholder={`${def.label} page URL`} aria-label="Channel URL" onChange={(url) => up({ url })} />
            <IconButton icon={ExternalLink} label="Open in browser" size="sm" variant="default" disabled={!channel.url?.trim()} onClick={() => openExternal(channel.url ?? '')} />
          </div>
        </div>
        <div className="sp-channels-field">
          <span>Cadence target</span>
          <div className="row" style={{ gap: 4 }}>
            <NumberInput
              size="sm"
              value={channel.cadence}
              placeholder="—"
              style={{ width: 58, flexShrink: 0 }}
              aria-label="Posts per period"
              onChange={(v) => up({ cadence: v == null || v <= 0 ? undefined : Math.round(v * 10) / 10, cadenceUnit: channel.cadenceUnit ?? 'week' })}
            />
            <Select size="sm" value={channel.cadenceUnit ?? 'week'} options={UNITS} aria-label="Cadence period" onChange={(u) => up({ cadenceUnit: u as 'week' | 'month' })} />
          </div>
        </div>
        <label className="sp-channels-field">
          <span>Best times</span>
          <Input size="sm" value={channel.bestTimes} placeholder="e.g. Tue/Thu 18:00" onChange={(bestTimes) => up({ bestTimes })} />
        </label>
        <label className="sp-channels-field span">
          <span>Notes</span>
          <Textarea autoGrow minRows={1} value={channel.notes} placeholder="Audience, what works here, collab rules…" onChange={(notes) => up({ notes })} />
        </label>
      </div>

      <Popover anchor={look} onClose={() => setLook(null)}>
        <div className="sp-channels-look">
          <div className="field">
            <label>Platform</label>
            <Select value={channel.platform} options={PLATFORMS.map((p) => ({ value: p.value, label: p.label }))} onChange={(p) => changePlatform(p as Platform)} />
          </div>
          <div className="field">
            <label>Colour</label>
            <ColorPicker value={channel.color} allowNone onChange={(c) => up({ color: c })} />
            <span className="hint">None = the {def.label} colour.</span>
          </div>
        </div>
      </Popover>
    </div>
  );
}
