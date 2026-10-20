/* Calendar building blocks: item chips / cards / rows (draggable), day drop
   targets and campaign bands. Handlers come from CalContext (index.tsx). */
import { createContext, useContext, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Clapperboard, Sparkles } from 'lucide-react';
import type { Campaign } from '@/spaces/types';
import { FORMAT_BY_ID, POST_STATUSES, STAGE_BY_ID } from '@/spaces/constants';
import type { Formatters } from '@/lib/format';
import { plural } from '@/lib/text';
import { channelLabel, shortTime, type BandSeg, type CalItem, type TrayEntry } from './model';

/* ---------------------------------------------------------------- drag & drop data */

export type DragData =
  | { type: 'post'; contentId: string; postId: string; item: CalItem; variant: ItemVariant }
  | { type: 'shoot'; shootId: string; item: CalItem; variant: ItemVariant }
  | { type: 'milestone'; msId: string; item: CalItem; variant: ItemVariant }
  | { type: 'piece'; contentId: string; entry: TrayEntry }
  | { type: 'upost'; contentId: string; postId: string; entry: TrayEntry };

export type DropData = { type: 'day'; date: string } | { type: 'tray' };

export type ItemVariant = 'chip' | 'card' | 'row';

/* ---------------------------------------------------------------- context */

export interface CalCtx {
  fmt: Formatters;
  h12: boolean;
  /** true while a drag is running or just ended (suppresses the click that follows) */
  dragging: () => boolean;
  openItem: (it: CalItem, el: HTMLElement) => void;
  itemMenu: (it: CalItem, e: MouseEvent) => void;
  deleteItem: (it: CalItem) => void;
  openCampaign: (c: Campaign) => void;
}

export const CalContext = createContext<CalCtx | null>(null);

export function useCal(): CalCtx {
  const c = useContext(CalContext);
  if (!c) throw new Error('CalContext missing');
  return c;
}

/** Ref callback: focus an element once its popover is positioned and visible. */
export function focusSoon(el: HTMLElement | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.focus();
    if (el instanceof HTMLInputElement && el.value) el.select();
  });
}

/* ---------------------------------------------------------------- visuals */

const STATUS_LABEL = Object.fromEntries(POST_STATUSES.map((s) => [s.value, s.label])) as Record<string, string>;
const STATUS_COLOR = Object.fromEntries(POST_STATUSES.map((s) => [s.value, s.color ?? '#888'])) as Record<string, string>;

export function itemTitle(it: CalItem, fmt: Formatters): string {
  if (it.kind === 'post') {
    const { post, content, channel } = it.ref;
    const f = FORMAT_BY_ID[content.format];
    const lines = [
      content.title || 'Untitled content',
      [channelLabel(channel), f?.label, STATUS_LABEL[post.status] ?? post.status, post.time ? fmt.time(post.time) : 'No time'].filter(Boolean).join(' · '),
    ];
    if (post.title && post.title !== content.title) lines.push(post.title);
    lines.push('Click to open · drag to move');
    return lines.join('\n');
  }
  if (it.kind === 'shoot') {
    const sh = it.shoot;
    return [
      sh.title || 'Shoot day',
      [sh.callTime && `Call ${fmt.time(sh.callTime)}`, sh.location, plural(it.pieces, 'piece')].filter(Boolean).join(' · '),
      'Click to open in Production · drag to move',
    ].join('\n');
  }
  return [it.ms.name || 'Milestone', it.campaign ? it.campaign.name : '', it.ms.done ? 'Done' : 'Open', 'Click to edit · drag to move'].filter(Boolean).join('\n');
}

export function ItemView({ it, variant }: { it: CalItem; variant: ItemVariant }) {
  const { fmt, h12 } = useCal();
  if (it.kind === 'post') {
    const { post, content, channel } = it.ref;
    const FIcon = FORMAT_BY_ID[content.format]?.icon ?? Sparkles;
    const st = post.status;
    const style = { ['--ch' as any]: it.color } as CSSProperties;
    if (variant === 'card') {
      const sub = post.title && post.title !== content.title ? post.title : post.caption;
      return (
        <div className={`sp-calendar-card st-${st}`} style={style}>
          <div className="top">
            {post.time && <span className="time">{fmt.time(post.time)}</span>}
            <FIcon className="fmt" />
            <span className="chan">{channelLabel(channel)}</span>
            <span className="pst" style={{ ['--st' as any]: STATUS_COLOR[st] }}>
              {st === 'published' ? <Check /> : <span className="dot" />}
              <span className="pst-l">{STATUS_LABEL[st] ?? st}</span>
            </span>
          </div>
          <div className="title">{content.title || 'Untitled content'}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
      );
    }
    if (variant === 'row') {
      const stage = STAGE_BY_ID[content.stage];
      return (
        <div className={`sp-calendar-row st-${st}`} style={style}>
          <span className={`when ${post.time ? '' : 'none'}`}>{post.time ? fmt.time(post.time) : 'Any time'}</span>
          <span className="what">
            <FIcon />
            <span className="txt">
              <span className="name">{content.title || 'Untitled content'}</span>
              <span className="meta">
                <span className="chan">
                  <i />
                  {channelLabel(channel)}
                </span>
                {post.title && post.title !== content.title ? ` · ${post.title}` : post.caption ? ` · ${post.caption}` : ''}
              </span>
            </span>
          </span>
          <span className="right">
            {stage && content.stage !== 'published' && (
              <span className="badge" style={{ background: `color-mix(in srgb, ${stage.color} 14%, transparent)`, color: stage.color }} title="Content stage">
                {stage.label}
              </span>
            )}
            <span className="badge" style={{ background: `color-mix(in srgb, ${STATUS_COLOR[st]} 16%, transparent)`, color: STATUS_COLOR[st] }}>
              {st === 'published' ? <Check size={12} /> : <span className="dot" />}
              {STATUS_LABEL[st] ?? st}
            </span>
          </span>
        </div>
      );
    }
    return (
      <div className={`sp-calendar-chip sp-calendar-post st-${st}`} style={style}>
        <FIcon className="fmt" />
        {post.time && <span className="t">{shortTime(post.time, h12)}</span>}
        <span className="lbl">{content.title || 'Untitled content'}</span>
        {st === 'published' && <Check className="ok" />}
      </div>
    );
  }
  if (it.kind === 'shoot') {
    const sh = it.shoot;
    if (variant === 'row') {
      return (
        <div className="sp-calendar-row" style={{ ['--ch' as any]: 'var(--accent)' }}>
          <span className={`when ${sh.callTime ? '' : 'none'}`}>{sh.callTime ? fmt.time(sh.callTime) : 'All day'}</span>
          <span className="what">
            <Clapperboard />
            <span className="txt">
              <span className="name">{sh.title || 'Shoot day'}</span>
              <span className="meta">{[sh.location, plural(it.pieces, 'piece'), sh.wrapTime && `wrap ${fmt.time(sh.wrapTime)}`].filter(Boolean).join(' · ')}</span>
            </span>
          </span>
          <span className="right">
            <span className="badge accent">Shoot day</span>
          </span>
        </div>
      );
    }
    return (
      <div className="sp-calendar-chip sp-calendar-shoot">
        <Clapperboard />
        {sh.callTime && <span className="t">{shortTime(sh.callTime, h12)}</span>}
        <span className="lbl">{sh.title || 'Shoot day'}</span>
      </div>
    );
  }
  const ms = it.ms;
  if (variant === 'row') {
    return (
      <div className={`sp-calendar-row sp-calendar-ms ${ms.done ? 'done' : ''}`} style={{ ['--mk' as any]: it.color }}>
        <span className="when none">Milestone</span>
        <span className="what">
          <span className="sp-calendar-diamond" />
          <span className="txt">
            <span className="name">{ms.name || 'Milestone'}</span>
            {(it.campaign || ms.notes) && <span className="meta">{[it.campaign?.name, ms.notes].filter(Boolean).join(' · ')}</span>}
          </span>
        </span>
        <span className="right">{ms.done ? <span className="badge success">Done</span> : <span className="badge warning">Open</span>}</span>
      </div>
    );
  }
  return (
    <div className={`sp-calendar-chip sp-calendar-ms ${ms.done ? 'done' : ''}`} style={{ ['--mk' as any]: it.color }}>
      <span className="sp-calendar-diamond" />
      <span className="lbl">{ms.name || 'Milestone'}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- draggable item */

export function dragDataFor(it: CalItem, variant: ItemVariant): DragData {
  if (it.kind === 'post') return { type: 'post', contentId: it.ref.content.id, postId: it.ref.post.id, item: it, variant };
  if (it.kind === 'shoot') return { type: 'shoot', shootId: it.shoot.id, item: it, variant };
  return { type: 'milestone', msId: it.ms.id, item: it, variant };
}

export function DraggableItem({ it, variant, scope }: { it: CalItem; variant: ItemVariant; scope: string }) {
  const cal = useCal();
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `${scope}|${it.key}`, data: dragDataFor(it, variant) });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!cal.dragging()) {
      if (e.key === 'Enter') {
        e.preventDefault();
        cal.openItem(it, e.currentTarget);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && it.kind === 'milestone') {
        e.preventDefault();
        cal.deleteItem(it);
        return;
      }
    }
    (listeners as any)?.onKeyDown?.(e);
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'is-dragging' : undefined}
      style={{ minWidth: 0, flexShrink: 0, outline: 'none' }}
      data-cal-item=""
      title={itemTitle(it, cal.fmt)}
      aria-label={itemTitle(it, cal.fmt).split('\n')[0]}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        e.stopPropagation();
        if (cal.dragging()) return;
        cal.openItem(it, e.currentTarget);
      }}
      onContextMenu={(e) => cal.itemMenu(it, e)}
    >
      <ItemView it={it} variant={variant} />
    </div>
  );
}

/* ---------------------------------------------------------------- drop target */

export function DayDrop({ id, date, className, children, ...rest }: { id: string; date: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'day', date } satisfies DropData });
  return (
    <div ref={setNodeRef} className={[className, isOver && 'is-over'].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- campaign bands */

export function Bands({ segs }: { segs: BandSeg[] }) {
  const cal = useCal();
  if (!segs.length) return null;
  return (
    <div className="sp-calendar-bands">
      {segs.map((s) => {
        const cls = ['sp-calendar-band', s.starts && 'starts', !s.starts && 'cont-left', !s.ends && 'cont-right'].filter(Boolean).join(' ');
        const c = s.campaign;
        return (
          <button
            key={`${c.id}-${s.col}`}
            type="button"
            className={cls}
            style={{
              ['--cc' as any]: c.color || 'var(--accent)',
              left: `calc(100% * ${s.col} / 7 + 3px)`,
              width: `calc(100% * ${s.span} / 7 - 6px)`,
              top: `calc(${s.lane} * var(--cal-band))`,
            }}
            title={`${c.name || 'Campaign'}${c.objective ? ` — ${c.objective}` : ''}\nClick to open Campaigns`}
            onClick={(e) => {
              e.stopPropagation();
              cal.openCampaign(c);
            }}
          >
            <span>{c.name || 'Campaign'}</span>
          </button>
        );
      })}
    </div>
  );
}
