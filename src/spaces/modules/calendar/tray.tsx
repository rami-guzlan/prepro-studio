/* Unscheduled tray: pieces without a dated post and undated posts — drag onto a day. */
import type { CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CalendarPlus, CalendarX2, CircleCheck, Inbox, PanelRightClose, Sparkles } from 'lucide-react';
import { FORMAT_BY_ID, STAGE_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { plural } from '@/lib/text';
import { Button, IconButton, SearchInput, type AnchorRect } from '@/ui';
import { useCal, type DragData, type DropData } from './items';
import { MISSING_CHANNEL_COLOR, channelLabel, type TrayEntry } from './model';
import { rectOf } from './views';

export function TrayCard({ entry, onPlan }: { entry: TrayEntry; onPlan?: (entry: TrayEntry, anchor: AnchorRect) => void }) {
  const c = entry.content;
  const FIcon = FORMAT_BY_ID[c.format]?.icon ?? Sparkles;
  const stage = STAGE_BY_ID[c.stage];
  let meta;
  if (entry.kind === 'post') {
    meta = (
      <>
        <i style={{ background: entry.channel ? channelColor(entry.channel) : MISSING_CHANNEL_COLOR }} />
        <span className="ellipsis">{channelLabel(entry.channel)} post without a date</span>
      </>
    );
  } else {
    meta = (
      <>
        <i style={{ background: stage?.color ?? 'var(--text-3)' }} />
        <span>{stage?.label ?? c.stage}</span>
        <span>·</span>
        <span className="ellipsis">{entry.undated.length ? plural(entry.undated.length, 'post') + ' to date' : 'No posts yet'}</span>
      </>
    );
  }
  return (
    <div className="sp-calendar-tray-item" style={{ ['--st' as any]: stage?.color ?? 'var(--text-3)' } as CSSProperties}>
      <FIcon />
      <div className="grow">
        <div className="title" title={c.title}>
          {c.title || 'Untitled content'}
        </div>
        <div className="meta">{meta}</div>
      </div>
      {onPlan && (
        <Button
          size="sm"
          variant="ghost"
          icon={CalendarPlus}
          title="Pick a date"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPlan(entry, rectOf(e.currentTarget));
          }}
        >
          Plan
        </Button>
      )}
    </div>
  );
}

function TrayItem({ entry, onPlan }: { entry: TrayEntry; onPlan: (entry: TrayEntry, anchor: AnchorRect) => void }) {
  const cal = useCal();
  const data: DragData =
    entry.kind === 'piece' ? { type: 'piece', contentId: entry.content.id, entry } : { type: 'upost', contentId: entry.content.id, postId: entry.post.id, entry };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `tray|${entry.key}`, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'is-dragging' : undefined}
      style={{ outline: 'none' }}
      title={`${entry.content.title || 'Untitled content'}\nDrag onto a day to schedule · click to open`}
      onClick={() => {
        if (!cal.dragging()) openContent(entry.content.id, 'publish');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !cal.dragging()) {
          e.preventDefault();
          openContent(entry.content.id, 'publish');
          return;
        }
        (listeners as any)?.onKeyDown?.(e);
      }}
    >
      <TrayCard entry={entry} onPlan={onPlan} />
    </div>
  );
}

export function Tray({
  entries,
  query,
  setQuery,
  draggingPost,
  onPlan,
  onClose,
}: {
  entries: TrayEntry[];
  query: string;
  setQuery: (q: string) => void;
  /** a dated post is being dragged (the tray accepts it to unschedule) */
  draggingPost: boolean;
  onPlan: (entry: TrayEntry, anchor: AnchorRect) => void;
  onClose: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray', data: { type: 'tray' } satisfies DropData });
  const pieces = entries.filter((e) => e.kind === 'piece').length;
  const posts = entries.length - pieces;
  return (
    <aside ref={setNodeRef} className={`sp-calendar-tray ${isOver && draggingPost ? 'is-over' : ''}`} aria-label="Unscheduled content">
      <div className="sp-calendar-tray-head">
        <Inbox />
        <strong>Unscheduled</strong>
        <span className="badge">{entries.length}</span>
        <span className="spacer" />
        <IconButton size="sm" icon={PanelRightClose} label="Hide unscheduled" onClick={onClose} />
      </div>
      <div className="sp-calendar-tray-sub">
        {entries.length ? `${plural(pieces, 'piece')}${posts ? ` · ${plural(posts, 'single post')}` : ''} — drag onto a day` : 'Pieces without a date show up here'}
      </div>
      <div className="sp-calendar-tray-search">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter unscheduled…" width="100%" />
      </div>
      <div className="sp-calendar-tray-list">
        {entries.map((e) => (
          <TrayItem key={e.key} entry={e} onPlan={onPlan} />
        ))}
        {entries.length === 0 && (
          <div className="sp-calendar-tray-empty">
            <CircleCheck />
            {query ? 'Nothing matches the filter.' : 'All caught up — every piece has a date.'}
          </div>
        )}
      </div>
      {isOver && draggingPost && (
        <div className="sp-calendar-tray-drop">
          <CalendarX2 /> Drop to unschedule
        </div>
      )}
    </aside>
  );
}
