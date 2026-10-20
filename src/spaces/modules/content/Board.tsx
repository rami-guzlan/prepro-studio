/* Content board: one column per stage, drag & drop between and within columns
   (@dnd-kit), quick-add at the top of every column. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Camera, ChevronsLeftRight, ListChecks, MoreHorizontal, Plus } from 'lucide-react';
import type { ID } from '@/types';
import type { Formatters } from '@/lib/format';
import { FORMATS, STAGES } from '@/spaces/constants';
import type { Campaign, Channel, ContentFormat, ContentPiece, ContentStage, Pillar } from '@/spaces/types';
import { openContent } from '@/spaces/ui';
import { AssetImage, Avatar, IconButton, Menu, openContextMenu } from '@/ui';
import { CampaignChip, ChannelDots, FormatIcon, PillarTag, PriorityFlag } from './parts';
import { checklistProgress, contentMenuItems, deleteContent, formatLabel, moveContent, nextPostInfo } from './shared';

type Cols = Record<ContentStage, ID[]>;
const STAGE_IDS = STAGES.map((s) => s.value);
const isStage = (id: string): id is ContentStage => (STAGE_IDS as string[]).includes(id);

export interface Lookups {
  pillars: Map<ID, Pillar>;
  campaigns: Map<ID, Campaign>;
  channels: Map<ID, Channel>;
}

/** 'Oct 3' (year dropped when it is the current year). */
export function shortDate(fmt: Formatters, iso: string | undefined): string {
  if (!iso) return '';
  const s = fmt.dateMedium(iso);
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? s.replace(/,? \d{4}$/, '') : s;
}

export function ContentBoard({
  pieces,
  lookups,
  fmt,
  today,
  collapsePublished,
  onExpandPublished,
  quickFormat,
  onQuickFormat,
  onQuickAdd,
  highlight,
}: {
  pieces: ContentPiece[];
  lookups: Lookups;
  fmt: Formatters;
  today: string;
  collapsePublished: boolean;
  onExpandPublished: () => void;
  quickFormat: ContentFormat;
  onQuickFormat: (f: ContentFormat) => void;
  onQuickAdd: (stage: ContentStage, title: string, open: boolean) => void;
  highlight: { stage: ContentStage; key: number } | null;
}) {
  const byId = useMemo(() => new Map(pieces.map((c) => [c.id, c])), [pieces]);
  const base = useMemo<Cols>(() => {
    const out = Object.fromEntries(STAGE_IDS.map((s) => [s, [] as ID[]])) as Cols;
    for (const c of pieces) (out[c.stage] ?? out.idea).push(c.id);
    return out;
  }, [pieces]);
  const [dragCols, setDragCols] = useState<Cols | null>(null);
  const [activeId, setActiveId] = useState<ID | null>(null);
  const cols = dragCols ?? base;
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const boardRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<ContentStage | null>(null);

  useEffect(() => {
    if (!highlight) return;
    const el = boardRef.current?.querySelector(`[data-stage="${highlight.stage}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setFlash(highlight.stage);
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [highlight?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  const findCol = (id: string, c: Cols): ContentStage | undefined => (isStage(id) ? id : STAGE_IDS.find((s) => c[s].includes(id)));

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDragCols(base);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);
    setDragCols((prev) => {
      const c = prev ?? base;
      const from = findCol(aid, c);
      const to = findCol(oid, c);
      if (!from || !to || from === to) return prev;
      const fromItems = c[from].filter((x) => x !== aid);
      const toItems = [...c[to]];
      let idx = isStage(oid) ? toItems.length : toItems.indexOf(oid);
      if (idx < 0) idx = toItems.length;
      if (!isStage(oid)) {
        const r = active.rect.current.translated;
        if (r && r.top > over.rect.top + over.rect.height / 2) idx += 1;
      }
      toItems.splice(idx, 0, aid);
      return { ...c, [from]: fromItems, [to]: toItems };
    });
  };

  const finish = () => {
    setDragCols(null);
    setActiveId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const aid = String(active.id);
    let c = colsRef.current;
    const col = findCol(aid, c);
    if (over && col) {
      const oid = String(over.id);
      if (findCol(oid, c) === col && !isStage(oid)) {
        const a = c[col].indexOf(aid);
        const b = c[col].indexOf(oid);
        if (a >= 0 && b >= 0 && a !== b) c = { ...c, [col]: arrayMove(c[col], a, b) };
      }
      const order = c[col];
      const i = order.indexOf(aid);
      const beforeId = i >= 0 ? order[i + 1] ?? null : null;
      const piece = byId.get(aid);
      const orig = base[col];
      const unchanged = piece?.stage === col && orig.indexOf(aid) === i && (orig[i + 1] ?? null) === beforeId;
      if (!unchanged) moveContent(aid, col, beforeId);
    }
    finish();
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={finish}>
      <div className="sp-content-board" ref={boardRef}>
        {STAGES.map((s) =>
          s.value === 'published' && collapsePublished ? (
            <CollapsedColumn key={s.value} stage={s.value} label={s.label} color={s.color!} count={cols[s.value].length} flash={flash === s.value} onExpand={onExpandPublished} />
          ) : (
            <Column
              key={s.value}
              stage={s.value}
              label={s.label}
              hint={s.hint}
              color={s.color!}
              ids={cols[s.value]}
              byId={byId}
              lookups={lookups}
              fmt={fmt}
              today={today}
              flash={flash === s.value}
              quickFormat={quickFormat}
              onQuickFormat={onQuickFormat}
              onQuickAdd={onQuickAdd}
            />
          ),
        )}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
        {active ? (
          <div className="sp-content-card overlay" style={cardStyle(active, lookups)}>
            <CardBody c={active} lookups={lookups} fmt={fmt} today={today} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function CollapsedColumn({ stage, label, color, count, flash, onExpand }: { stage: ContentStage; label: string; color: string; count: number; flash: boolean; onExpand: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <button
      type="button"
      ref={setNodeRef}
      data-stage={stage}
      className={['sp-content-col-collapsed', isOver && 'over', flash && 'flash'].filter(Boolean).join(' ')}
      style={{ ['--st' as string]: color }}
      onClick={onExpand}
      title={`${label} is hidden (${count}). Click to show · drop a card here to mark it published`}
    >
      <ChevronsLeftRight size={14} />
      <span className="sp-content-col-collapsed-label">{label}</span>
      <span className="sp-content-count">{count}</span>
    </button>
  );
}

function Column({
  stage,
  label,
  hint,
  color,
  ids,
  byId,
  lookups,
  fmt,
  today,
  flash,
  quickFormat,
  onQuickFormat,
  onQuickAdd,
}: {
  stage: ContentStage;
  label: string;
  hint?: string;
  color: string;
  ids: ID[];
  byId: Map<ID, ContentPiece>;
  lookups: Lookups;
  fmt: Formatters;
  today: string;
  flash: boolean;
  quickFormat: ContentFormat;
  onQuickFormat: (f: ContentFormat) => void;
  onQuickAdd: (stage: ContentStage, title: string, open: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <section className={['sp-content-col', isOver && 'over', flash && 'flash'].filter(Boolean).join(' ')} style={{ ['--st' as string]: color }} data-stage={stage} aria-label={label}>
      <header className="sp-content-col-head" title={hint}>
        <span className="sp-content-col-dot" />
        <h3>{label}</h3>
        <span className="sp-content-count">{ids.length}</span>
        <div className="spacer" />
        <IconButton icon={Plus} size="sm" label={`Add to ${label}`} onClick={() => inputRef.current?.focus()} />
      </header>
      <QuickAdd stage={stage} label={label} inputRef={inputRef} format={quickFormat} onFormat={onQuickFormat} onAdd={(t, open) => onQuickAdd(stage, t, open)} />
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="sp-content-col-body">
          {ids.map((id) => {
            const c = byId.get(id);
            return c ? <SortableCard key={id} c={c} lookups={lookups} fmt={fmt} today={today} /> : null;
          })}
          {ids.length === 0 && <div className="sp-content-col-empty">{stage === 'idea' ? 'Type an idea above and press Enter' : 'Drop content here'}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function QuickAdd({
  stage,
  label,
  inputRef,
  format,
  onFormat,
  onAdd,
}: {
  stage: ContentStage;
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  format: ContentFormat;
  onFormat: (f: ContentFormat) => void;
  onAdd: (title: string, open: boolean) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="sp-content-qa">
      <Menu
        trigger={
          <button type="button" className="sp-content-qa-format" title={`New pieces: ${formatLabel(format)} (click to change)`} aria-label="Format for quick add">
            <FormatIcon format={format} size={14} />
          </button>
        }
        items={FORMATS.map((f) => ({ label: f.label, icon: f.icon, onClick: () => onFormat(f.value) }))}
      />
      <input
        ref={inputRef}
        className="input sm"
        value={text}
        placeholder={stage === 'idea' ? 'Capture an idea…' : `Add to ${label}…`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            const t = text.trim();
            if (!t) return;
            onAdd(t, e.ctrlKey || e.metaKey);
            setText('');
          } else if (e.key === 'Escape') {
            if (text) {
              e.stopPropagation();
              setText('');
            } else (e.target as HTMLInputElement).blur();
          }
        }}
        title="Enter adds · Ctrl+Enter adds and opens the editor"
        aria-label={`Quick add to ${label}`}
      />
    </div>
  );
}

function cardStyle(c: ContentPiece, lookups: Lookups): CSSProperties {
  const p = c.pillarId ? lookups.pillars.get(c.pillarId) : undefined;
  return { ['--pil' as string]: p?.color ?? 'transparent' };
}

function SortableCard({ c, lookups, fmt, today }: { c: ContentPiece; lookups: Lookups; fmt: Formatters; today: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style: CSSProperties = { ...cardStyle(c, lookups), transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : undefined };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={['sp-content-card', c.stage === 'published' && 'published'].filter(Boolean).join(' ')}
      data-content-id={c.id}
      {...attributes}
      {...listeners}
      aria-label={c.title || 'Untitled content'}
      onClick={() => openContent(c.id)}
      onContextMenu={(e) => openContextMenu(e, contentMenuItems(c))}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          openContent(c.id);
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          void deleteContent(c.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
    >
      <CardBody c={c} lookups={lookups} fmt={fmt} today={today} />
      <div className="sp-content-card-menu" onPointerDown={(e) => e.stopPropagation()}>
        <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label="Content actions" />} items={() => contentMenuItems(c)} />
      </div>
    </div>
  );
}

export function CardBody({ c, lookups, fmt, today }: { c: ContentPiece; lookups: Lookups; fmt: Formatters; today: string }) {
  const pillar = c.pillarId ? lookups.pillars.get(c.pillarId) : undefined;
  const campaign = c.campaignId ? lookups.campaigns.get(c.campaignId) : undefined;
  const next = nextPostInfo(c, today);
  const prog = checklistProgress(c);
  const ch = next ? lookups.channels.get(next.channelId) : undefined;
  return (
    <>
      {c.thumbnail && (
        <div className="sp-content-card-thumb">
          <AssetImage name={c.thumbnail} />
        </div>
      )}
      <div className="sp-content-card-body">
        <div className="sp-content-card-top">
          <FormatIcon format={c.format} size={13} />
          <span className="ellipsis">{formatLabel(c.format)}</span>
          <PriorityFlag priority={c.priority} />
        </div>
        <div className="sp-content-card-title">{c.title || 'Untitled content'}</div>
        {(pillar || campaign) && (
          <div className="sp-content-card-tags">
            <PillarTag pillar={pillar} />
            <CampaignChip campaign={campaign} />
          </div>
        )}
        <div className="sp-content-card-meta">
          <ChannelDots posts={c.posts} channels={lookups.channels} fmtDate={(d) => shortDate(fmt, d)} max={6} />
          {next && (
            <span
              className={['sp-content-due', next.overdue && 'overdue', next.published && 'done'].filter(Boolean).join(' ')}
              title={`${next.published ? 'Published' : next.overdue ? 'Overdue — planned' : 'Next post'}: ${fmt.dateLong(next.date)}${next.time ? ` ${fmt.time(next.time)}` : ''}${ch ? ` on ${ch.name}` : ''}`}
            >
              <CalendarDays size={12} />
              {shortDate(fmt, next.date)}
            </span>
          )}
          {c.shootDate && (
            <span className="sp-content-shoot" title={`Shoot: ${fmt.dateLong(c.shootDate)}`}>
              <Camera size={12} />
              {c.stage === 'idea' || c.stage === 'writing' || c.stage === 'planning' || c.stage === 'production' ? shortDate(fmt, c.shootDate) : null}
            </span>
          )}
          <span className="spacer" />
          {prog.total > 0 && (
            <span className={`sp-content-checks ${prog.done === prog.total ? 'complete' : ''}`} title={`Checklist ${prog.done} of ${prog.total} done`}>
              <ListChecks size={12} />
              {prog.done}/{prog.total}
            </span>
          )}
          {c.owner?.trim() && <Avatar name={c.owner} size={18} />}
        </div>
      </div>
    </>
  );
}
