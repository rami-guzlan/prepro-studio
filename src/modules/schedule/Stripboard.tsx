/* Stripboard: shoot days with draggable scene strips + the boneyard. */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowDown01,
  ArrowDownAZ,
  ArrowRightLeft,
  ArrowUp,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  Clapperboard,
  ClipboardList,
  Clock,
  Ellipsis,
  FileText,
  Film,
  Flag,
  Inbox,
  ListPlus,
  ListRestart,
  MapPin,
  PanelRight,
  PanelRightClose,
  Plus,
  Printer,
  ScanText,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
} from 'lucide-react';
import type { ID, StripItem } from '@/types';
import { getProject, useFormatters, useProject, useProjectId } from '@/store/project';
import { navigate, openPrint, readLS, writeLS } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { locationForScene } from '@/derived/project';
import { STRIP_COLORS } from '@/lib/constants';
import { formatEighths, formatMinutes } from '@/lib/format';
import { weekdayShort } from '@/lib/dates';
import { matchesQuery, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Button, DateInput, EmptyState, IconButton, Menu, Modal, Popover, SearchInput, Textarea, Toolbar, openContextMenu, type AnchorRect, type MenuItem } from '@/ui';
import {
  BANNER_PRESETS,
  BONEYARD,
  LONG_DAY_MINUTES,
  boneyardScenes,
  castNumbers,
  computeDays,
  dayWarnings,
  pagesLabel,
  sceneSynopsis,
  stripColor,
  type BannerItem,
  type DayRow,
  type DayWarning,
} from './logic';
import {
  addDay,
  clearSchedule,
  commitArrangement,
  deleteAllDays,
  deleteDay,
  insertBanner,
  moveDay,
  moveSceneTo,
  nudgeItem,
  removeItem,
  resetBoneyardOrder,
  scheduleAllUnscheduled,
  setDayField,
  sortDay,
} from './actions';
import { BannerView, SortableBanner, SortableStrip, StripView, type StripData } from './Strip';
import { ScheduleSettingsButton } from './ScheduleSettings';

type Containers = Record<string, string[]>;

export interface BoardFocus {
  sceneId?: string;
  dayId?: string;
  key: number;
}

const byId = (sceneId: ID) => `by:${sceneId}`;

/* ---------------------------------------------------------------- missing scene placeholder */

function SortableMissing({ dragId, container, dayId }: { dragId: string; container: string; dayId: ID }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: dragId, data: { container } });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={['sched-missing', isDragging && 'ghost'].filter(Boolean).join(' ')} {...attributes} {...listeners}>
      <CircleAlert />
      <span className="grow">This scene was removed from the script.</span>
      <Button size="sm" variant="ghost" icon={Trash2} onPointerDown={(e) => e.stopPropagation()} onClick={() => removeItem(dayId, dragId)}>
        Remove strip
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- warnings badge */

function WarningsBadge({ warnings }: { warnings: DayWarning[] }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  if (!warnings.length) return null;
  const danger = warnings.some((w) => w.level === 'danger');
  return (
    <>
      <button
        type="button"
        className={`sched-warn ${danger ? 'danger' : ''}`}
        title={warnings.map((w) => w.text).join('\n')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        <TriangleAlert />
        {plural(warnings.length, 'issue')}
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} align="end">
        <div className="sched-warn-list">
          {warnings.map((w, i) => (
            <div key={i} className={`sched-warn-item ${w.level}`}>
              <TriangleAlert />
              <span>{w.text}</span>
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}

/* ---------------------------------------------------------------- day block */

interface DayBlockProps {
  row: DayRow;
  ids: string[];
  stripData: Map<ID, StripData>;
  itemIndex: Map<string, StripItem>;
  collapsed: boolean;
  warnings: DayWarning[];
  highlight: string | null;
  onToggle: (dayId: ID) => void;
  onOpen: (sceneId: ID) => void;
  onMenu: (sceneId: ID, at: { clientX: number; clientY: number }) => void;
  onDelete: (sceneId: ID) => void;
}

const DayBlock = memo(function DayBlock({ row, ids, stripData, itemIndex, collapsed, warnings, highlight, onToggle, onOpen, onMenu, onDelete }: DayBlockProps) {
  const fmt = useFormatters();
  const { day, index } = row;
  const { setNodeRef, isOver } = useDroppable({ id: day.id, data: { container: day.id } });
  const days = row.total;
  const menu = (): MenuItem[] => [
    { header: 'Insert banner' },
    ...BANNER_PRESETS.map((b) => ({ label: b.label, icon: Flag, onClick: () => insertBanner(day.id, b) })),
    { separator: true },
    { label: 'Sort by location / set', icon: ArrowDownAZ, onClick: () => sortDay(day.id, 'location') },
    { label: 'Sort by scene number', icon: ArrowDown01, onClick: () => sortDay(day.id, 'script') },
    { separator: true },
    { label: 'Move day up', icon: ArrowUp, disabled: index === 0, onClick: () => moveDay(day.id, -1) },
    { label: 'Move day down', icon: ArrowDown, disabled: index >= days - 1, onClick: () => moveDay(day.id, 1) },
    { label: 'Insert shoot day after', icon: CalendarPlus, onClick: () => addDay(index) },
    { separator: true },
    { label: 'Open call sheet', icon: ClipboardList, onClick: () => navigate('callsheets', { dayId: day.id }) },
    { label: 'Print call sheet', icon: Printer, onClick: () => openPrint('call-sheet', { dayId: day.id }) },
    { separator: true },
    { label: 'Delete day…', icon: Trash2, danger: true, onClick: () => deleteDay(day.id) },
  ];
  const long = row.minutes > LONG_DAY_MINUTES;
  return (
    <section id={`sched-day-${day.id}`} ref={setNodeRef} className={['sched-day', isOver && 'over', collapsed && 'collapsed'].filter(Boolean).join(' ')}>
      <header className="sched-day-head">
        <button type="button" className="sched-collapse" aria-label={collapsed ? 'Expand day' : 'Collapse day'} aria-expanded={!collapsed} onClick={() => onToggle(day.id)}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </button>
        <div className="sched-day-num">
          Day {row.number}
          <span> of {days}</span>
        </div>
        <div className="sched-day-date" title={row.autoDate ? 'Automatic date (follows the schedule start). Pick a date to fix it.' : 'Fixed date. Clear it to follow the schedule automatically.'}>
          <DateInput size="sm" value={row.date} onChange={(v) => setDayField(day.id, { date: v })} style={row.autoDate ? { fontStyle: 'italic', color: 'var(--text-3)' } : undefined} />
          {row.date && <span className="sched-weekday">{weekdayShort(row.date)}</span>}
          {row.autoDate && <span className="sched-auto">auto</span>}
        </div>
        <input
          className="input bare sm sched-day-label"
          value={day.label ?? ''}
          placeholder="Add label…"
          aria-label="Day label"
          onChange={(e) => setDayField(day.id, { label: e.target.value }, 'label')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
        <div className="sched-day-right">
        <div className="sched-day-stats">
          <span title="Scenes">
            <Film />
            {row.scenes.length}
          </span>
          <span title="Pages">{pagesLabel(row.eighths)}</span>
          <span title="Estimated shooting time" className={long ? 'over' : undefined}>
            <Clock />
            {row.minutes ? formatMinutes(row.minutes) : '–'}
          </span>
          <span title="Cast members">
            <Users />
            {row.characterIds.length}
          </span>
          <span title={row.sets.join('\n') || 'Sets'}>
            <MapPin />
            {plural(row.sets.length, 'set')}
          </span>
        </div>
        <WarningsBadge warnings={warnings} />
        <IconButton size="sm" icon={ClipboardList} label="Open call sheet" onClick={() => navigate('callsheets', { dayId: day.id })} />
        <Menu align="end" trigger={<IconButton size="sm" icon={Ellipsis} label="Day actions" />} items={menu} />
        </div>
      </header>
      {!collapsed && (
        <>
          <div className="sched-day-notes">
            <Textarea
              bare
              autoGrow
              minRows={1}
              value={day.notes}
              placeholder="Day notes — sunset, special instructions… (printed on the schedule)"
              onChange={(v) => setDayField(day.id, { notes: v }, 'notes')}
            />
          </div>
          <SortableContext id={day.id} items={ids} strategy={verticalListSortingStrategy}>
            <div className="sched-day-list">
              {ids.map((id) => {
                const it = id.startsWith('by:') ? ({ type: 'scene', sceneId: id.slice(3), id } as StripItem) : itemIndex.get(id);
                if (!it) return null;
                if (it.type === 'banner') return <SortableBanner key={id} dragId={id} container={day.id} item={it} dayId={day.id} />;
                const data = stripData.get(it.sceneId);
                if (!data) return <SortableMissing key={id} dragId={id} container={day.id} dayId={day.id} />;
                return (
                  <SortableStrip
                    key={id}
                    dragId={id}
                    container={day.id}
                    data={data}
                    highlight={highlight === it.sceneId}
                    onOpen={onOpen}
                    onMenu={onMenu}
                    onDelete={onDelete}
                  />
                );
              })}
              {ids.length === 0 && <div className="sched-drop-hint">Drag scenes here from the boneyard</div>}
            </div>
          </SortableContext>
        </>
      )}
      <footer className={`sched-day-foot ${long ? 'over' : ''}`}>
        <span>
          End of Day {row.number}
          {row.date ? ` — ${fmt.dateMedium(row.date)}` : ''}
        </span>
        <span>
          {pagesLabel(row.eighths)}
          {row.minutes ? ` · est. ${formatMinutes(row.minutes)}` : ''}
          {collapsed && row.scenes.length ? ` · ${plural(row.scenes.length, 'scene')}` : ''}
        </span>
      </footer>
    </section>
  );
});

/* ---------------------------------------------------------------- boneyard */

function BoneyardPane({
  ids,
  stripData,
  itemIndex,
  activeId,
  query,
  setQuery,
  searchRef,
  highlight,
  onOpen,
  onMenu,
  hasOrder,
}: {
  ids: string[];
  stripData: Map<ID, StripData>;
  itemIndex: Map<string, StripItem>;
  activeId: string | null;
  query: string;
  setQuery: (q: string) => void;
  searchRef: React.RefObject<HTMLDivElement | null>;
  highlight: string | null;
  onOpen: (sceneId: ID) => void;
  onMenu: (sceneId: ID, at: { clientX: number; clientY: number }) => void;
  hasOrder: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BONEYARD, data: { container: BONEYARD } });
  const sceneOf = (id: string) => (id.startsWith('by:') ? id.slice(3) : (itemIndex.get(id) as { sceneId?: ID } | undefined)?.sceneId);
  const shown = ids.filter((id) => {
    if (id === activeId || !query.trim()) return true;
    const d = stripData.get(sceneOf(id) ?? '');
    if (!d) return false;
    const s = d.scene;
    return matchesQuery(`${s.number} ${s.heading} ${d.synopsis} ${d.location?.name ?? ''} ${d.cast.map((c) => `${c.name} ${c.actor ?? ''}`).join(' ')}`, query);
  });
  const total = ids.reduce((n, id) => n + (stripData.get(sceneOf(id) ?? '')?.scene.eighths ?? 0), 0);
  return (
    <aside className="sched-bone">
      <div className="sched-bone-head">
        <Inbox />
        <div className="grow">
          <div className="strong">Boneyard</div>
          <div className="muted tiny">
            {ids.length ? `${plural(ids.length, 'unscheduled scene')} · ${pagesLabel(total)}` : 'Every scene is scheduled'}
          </div>
        </div>
        <Menu
          align="end"
          trigger={<IconButton size="sm" icon={Ellipsis} label="Boneyard actions" />}
          items={[
            { label: 'Schedule all on a new day', icon: ListPlus, disabled: !ids.length, onClick: scheduleAllUnscheduled },
            { label: 'Reset to script order', icon: ListRestart, disabled: !hasOrder, onClick: resetBoneyardOrder },
          ]}
        />
      </div>
      <div className="sched-bone-search" ref={searchRef}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search scenes, sets, cast…" width="100%" />
      </div>
      <div ref={setNodeRef} className={['sched-bone-list', isOver && 'over'].filter(Boolean).join(' ')}>
        <SortableContext id={BONEYARD} items={shown} strategy={verticalListSortingStrategy}>
          {shown.map((id) => {
            const sid = sceneOf(id);
            const data = sid ? stripData.get(sid) : undefined;
            if (!data) return null;
            return <SortableStrip key={id} dragId={id} container={BONEYARD} data={data} compact highlight={highlight === sid} onOpen={onOpen} onMenu={onMenu} />;
          })}
        </SortableContext>
        {ids.length === 0 && (
          <div className="sched-bone-empty">
            <Inbox />
            <div className="strong">All scenes are on the schedule</div>
            <div className="muted small">Drag a strip here to unschedule it.</div>
          </div>
        )}
        {ids.length > 0 && shown.length === 0 && <div className="sched-bone-empty muted small">No scenes match “{query}”.</div>}
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- move dialog */

function MoveDialog({ sceneId, rows, onClose }: { sceneId: ID | null; rows: DayRow[]; onClose: () => void }) {
  const fmt = useFormatters();
  const model = useScriptModel();
  const scene = sceneId ? model.sceneById.get(sceneId) : undefined;
  const current = rows.find((r) => r.scenes.some((s) => s.id === sceneId));
  const go = (target: string) => {
    if (sceneId) moveSceneTo(sceneId, target);
    onClose();
  };
  return (
    <Modal open={!!sceneId} onClose={onClose} title={scene ? `Move scene ${scene.number}` : 'Move scene'} size="sm">
      <div className="sched-move-list">
        {rows.map((r) => (
          <button key={r.day.id} type="button" className="list-item" disabled={r === current} onClick={() => go(r.day.id)} autoFocus={r.index === 0 && r !== current}>
            <span className="sched-move-day">Day {r.number}</span>
            <span className="grow">
              <span className="strong">{r.date ? fmt.dateMedium(r.date) : 'No date'}</span>
              {r.day.label ? <span className="muted"> · {r.day.label}</span> : null}
              <div className="meta">
                {plural(r.scenes.length, 'scene')} · {pagesLabel(r.eighths)}{r.minutes ? ` · ${formatMinutes(r.minutes)}` : ''}
              </div>
            </span>
            {r === current && <span className="badge">Current</span>}
          </button>
        ))}
        <div className="divider" />
        <button type="button" className="list-item" onClick={() => go('new')}>
          <CalendarPlus size={16} />
          <span className="grow strong">New shoot day</span>
        </button>
        <button type="button" className="list-item" disabled={!current} onClick={() => go(BONEYARD)}>
          <Undo2 size={16} />
          <span className="grow strong">Boneyard (unschedule)</span>
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- board */

export function Stripboard({ focus }: { focus: BoardFocus | null }) {
  const projectId = useProjectId();
  const schedule = useProject((p) => p.schedule);
  const locations = useProject((p) => p.locations);
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const model = useScriptModel();

  const rows = useMemo(() => computeDays({ schedule, locations }, model), [schedule, locations, model]);
  const bone = useMemo(() => boneyardScenes(schedule, model), [schedule, model]);
  const warnings = useMemo(() => {
    const m = new Map<ID, DayWarning[]>();
    for (const r of rows) m.set(r.day.id, dayWarnings(r, rows, { characters, cast, locations, schedule }));
    return m;
  }, [rows, characters, cast, locations, schedule]);

  const stripData = useMemo(() => {
    const charById = new Map(characters.map((c) => [c.id, c]));
    const castById = new Map(cast.map((c) => [c.id, c]));
    const m = new Map<ID, StripData>();
    for (const s of model.scenes) {
      const col = stripColor(s);
      m.set(s.id, { scene: s, cast: castNumbers(s, charById, castById), location: locationForScene({ locations }, s), synopsis: sceneSynopsis(s), bg: col.bg, fg: col.fg });
    }
    return m;
  }, [model, characters, cast, locations]);

  const itemIndex = useMemo(() => {
    const m = new Map<string, StripItem>();
    for (const d of schedule.days) for (const it of d.items) m.set(it.id, it);
    return m;
  }, [schedule]);

  const base = useMemo<Containers>(() => {
    const c: Containers = {};
    for (const d of schedule.days) c[d.id] = d.items.map((it) => it.id);
    c[BONEYARD] = bone.map((s) => byId(s.id));
    return c;
  }, [schedule, bone]);

  /* ---- UI state */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(readLS<string[]>(`prepro.schedule.collapsed.${projectId}`, [])));
  const [showBone, setShowBone] = useState(() => readLS<boolean>('prepro.schedule.boneyard', true));
  const [query, setQuery] = useState('');
  const [moveFor, setMoveFor] = useState<ID | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const toggleDay = useCallback(
    (dayId: ID) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(dayId)) next.delete(dayId);
        else next.add(dayId);
        writeLS(`prepro.schedule.collapsed.${projectId}`, [...next]);
        return next;
      }),
    [projectId],
  );
  const setAllCollapsed = (on: boolean) => {
    const next = new Set(on ? schedule.days.map((d) => d.id) : []);
    writeLS(`prepro.schedule.collapsed.${projectId}`, [...next]);
    setCollapsed(next);
  };

  useCommand('find', () => {
    if (!showBone) setShowBone(true);
    setTimeout(() => searchRef.current?.querySelector('input')?.focus(), 30);
    return true;
  });

  /* ---- navigation focus */
  useEffect(() => {
    if (!focus) return;
    if (focus.sceneId) {
      const day = schedule.days.find((d) => d.items.some((it) => it.type === 'scene' && it.sceneId === focus.sceneId));
      if (day && collapsed.has(day.id)) toggleDay(day.id);
      if (!day && !showBone) setShowBone(true);
    }
    const t = setTimeout(() => {
      if (focus.sceneId) {
        document.getElementById(`sched-strip-${focus.sceneId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setHighlight(focus.sceneId);
      } else if (focus.dayId) {
        document.getElementById(`sched-day-${focus.dayId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }, 80);
    const t2 = setTimeout(() => setHighlight(null), 2800);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  /* ---- drag & drop */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drag, setDragState] = useState<Containers | null>(null);
  const dragRef = useRef<Containers | null>(null);
  const containers = drag ?? base;
  const containersRef = useRef(containers);
  containersRef.current = containers;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);
  const justDragged = useRef(0);

  const setDrag = (next: Containers | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
  }, [drag]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );

  const findContainer = (c: Containers, id: string): string | undefined => {
    if (id in c) return id;
    return Object.keys(c).find((k) => c[k].includes(id));
  };
  const isSceneDrag = (id: string) => id.startsWith('by:') || itemIndex.get(id)?.type === 'scene';

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const cont = containersRef.current;
    const pointer = pointerWithin(args);
    const intersections = pointer.length > 0 ? pointer : rectIntersection(args);
    let overId = getFirstCollision(intersections, 'id');
    if (overId != null) {
      const key = String(overId);
      if (key in cont) {
        const items = cont[key];
        if (items.length > 0) {
          const closest = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((dc) => dc.id !== overId && items.includes(String(dc.id))) });
          if (closest.length) overId = closest[0].id;
        }
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    if (recentlyMoved.current) lastOverId.current = args.active.id;
    return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
  }, []);

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    const copy: Containers = {};
    for (const k of Object.keys(base)) copy[k] = [...base[k]];
    setDrag(copy);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const cur = dragRef.current ?? base;
    const activeC = findContainer(cur, activeKey);
    const overC = findContainer(cur, overKey);
    if (!activeC || !overC || activeC === overC) return;
    if (collapsedRef.current.has(overC)) return;
    if (overC === BONEYARD && !isSceneDrag(activeKey)) return;
    const overItems = cur[overC];
    const overIndex = overItems.indexOf(overKey);
    let newIndex: number;
    if (overKey === overC) newIndex = overItems.length;
    else {
      const t = active.rect.current.translated;
      const below = !!t && t.top > over.rect.top + over.rect.height / 2;
      newIndex = overIndex >= 0 ? overIndex + (below ? 1 : 0) : overItems.length;
    }
    recentlyMoved.current = true;
    setDrag({
      ...cur,
      [activeC]: cur[activeC].filter((x) => x !== activeKey),
      [overC]: [...overItems.slice(0, newIndex), activeKey, ...overItems.slice(newIndex)],
    });
  };

  const endDrag = () => {
    setActiveId(null);
    setDrag(null);
    lastOverId.current = null;
    justDragged.current = Date.now();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const activeKey = String(active.id);
    let cur = dragRef.current ?? base;
    if (over) {
      const overKey = String(over.id);
      const activeC = findContainer(cur, activeKey);
      const overC = findContainer(cur, overKey);
      if (activeC && overC) {
        if (activeC === overC) {
          const oldIndex = cur[activeC].indexOf(activeKey);
          const newIndex = cur[overC].indexOf(overKey);
          if (newIndex >= 0 && oldIndex >= 0 && oldIndex !== newIndex) cur = { ...cur, [activeC]: arrayMove(cur[activeC], oldIndex, newIndex) };
        } else if (!(overC === BONEYARD && !isSceneDrag(activeKey))) {
          cur = { ...cur, [activeC]: cur[activeC].filter((x) => x !== activeKey), [overC]: [...cur[overC], activeKey] };
        }
      }
      commitArrangement(cur);
    }
    endDrag();
  };

  /* ---- strip callbacks (stable) */
  const onOpen = useCallback((sceneId: ID) => {
    if (Date.now() - justDragged.current < 300) return;
    navigate('breakdown', { sceneId });
  }, []);
  const onDelete = useCallback((sceneId: ID) => moveSceneTo(sceneId, BONEYARD), []);
  const onMenu = useCallback((sceneId: ID, at: { clientX: number; clientY: number }) => {
    const p = getProject();
    const dayIndex = p.schedule.days.findIndex((d) => d.items.some((it) => it.type === 'scene' && it.sceneId === sceneId));
    const day = p.schedule.days[dayIndex];
    const pos = day ? day.items.findIndex((it) => it.type === 'scene' && it.sceneId === sceneId) : -1;
    const itemId = day?.items[pos]?.id;
    const items: MenuItem[] = [
      { label: 'Open breakdown', icon: ScanText, shortcut: 'Enter', onClick: () => navigate('breakdown', { sceneId }) },
      { label: 'Open in script', icon: FileText, onClick: () => navigate('script', { sceneId }) },
    ];
    if (day) items.push({ label: `Open call sheet (Day ${dayIndex + 1})`, icon: ClipboardList, onClick: () => navigate('callsheets', { dayId: day.id }) });
    items.push({ separator: true }, { label: 'Move to day…', icon: ArrowRightLeft, onClick: () => setMoveFor(sceneId) });
    if (day && itemId) {
      items.push(
        { label: 'Move up', icon: ArrowUp, disabled: pos <= 0, onClick: () => nudgeItem(day.id, itemId, -1) },
        { label: 'Move down', icon: ArrowDown, disabled: pos >= day.items.length - 1, onClick: () => nudgeItem(day.id, itemId, 1) },
        { separator: true },
        { label: 'Return to boneyard', icon: Undo2, shortcut: 'Del', onClick: () => moveSceneTo(sceneId, BONEYARD) },
      );
    } else {
      const last = p.schedule.days[p.schedule.days.length - 1];
      if (last) items.push({ label: `Add to Day ${p.schedule.days.length} (last day)`, icon: Plus, onClick: () => moveSceneTo(sceneId, last.id) });
      items.push({ label: 'Schedule on a new day', icon: CalendarPlus, onClick: () => moveSceneTo(sceneId, 'new') });
    }
    openContextMenu({ clientX: at.clientX, clientY: at.clientY, preventDefault: () => {} }, items);
  }, []);

  /* ---- overlay */
  const activeOverlay = (() => {
    if (!activeId) return null;
    if (activeId.startsWith('by:')) {
      const d = stripData.get(activeId.slice(3));
      return d ? <StripView data={d} overlay compact={findContainer(containers, activeId) === BONEYARD} /> : null;
    }
    const it = itemIndex.get(activeId);
    if (!it) return null;
    if (it.type === 'banner') {
      const dayId = schedule.days.find((d) => d.items.some((x) => x.id === it.id))?.id ?? '';
      return <BannerView item={it as BannerItem} dayId={dayId} overlay />;
    }
    const d = stripData.get(it.sceneId);
    return d ? <StripView data={d} overlay compact={findContainer(containers, activeId) === BONEYARD} /> : null;
  })();

  const scheduledCount = model.scenes.length - bone.length;
  const toggleBone = () => {
    writeLS('prepro.schedule.boneyard', !showBone);
    setShowBone(!showBone);
  };

  if (!model.scenes.length && !schedule.days.length) {
    return (
      <div className="module-body">
        <EmptyState
          icon={Clapperboard}
          title="No scenes to schedule yet"
          description="Strips come from the screenplay — every scene heading becomes a strip. Write or import a script, then build your shoot days here."
          action={
            <div className="row">
              <Button variant="primary" icon={FileText} onClick={() => navigate('script')}>
                Open script
              </Button>
              <Button icon={CalendarPlus} onClick={() => addDay()}>
                Add shoot day
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <>
      <Toolbar>
        <Button size="sm" icon={CalendarPlus} onClick={() => addDay()}>
          Add shoot day
        </Button>
        <Button size="sm" icon={ListPlus} disabled={!bone.length} onClick={scheduleAllUnscheduled} title="Put every unscheduled scene on a new shoot day">
          Schedule all unscheduled
        </Button>
        <ScheduleSettingsButton />
        <Menu
          trigger={
            <Button size="sm" icon={Ellipsis}>
              More
            </Button>
          }
          items={() => [
            { label: 'Sort every day by location / set', icon: ArrowDownAZ, disabled: !schedule.days.length, onClick: () => schedule.days.forEach((d) => sortDay(d.id, 'location')) },
            { separator: true },
            { label: 'Clear schedule…', icon: Undo2, danger: true, disabled: !scheduledCount, onClick: clearSchedule },
            { label: 'Delete all shoot days…', icon: Trash2, danger: true, disabled: !schedule.days.length, onClick: deleteAllDays },
          ]}
        />
        <div className="spacer" />
        <div className="sched-legend" aria-label="Strip colours">
          {(['INT-DAY', 'EXT-DAY', 'INT-NIGHT', 'EXT-NIGHT', 'INT-DUSK', 'EXT-DUSK'] as const).map((k) => (
            <span key={k} className="sched-legend-item">
              <span style={{ background: STRIP_COLORS[k].bg }} />
              {STRIP_COLORS[k].label}
            </span>
          ))}
        </div>
        <IconButton size="sm" icon={ChevronsDownUp} label="Collapse all days" onClick={() => setAllCollapsed(true)} disabled={!schedule.days.length} />
        <IconButton size="sm" icon={ChevronsUpDown} label="Expand all days" onClick={() => setAllCollapsed(false)} disabled={!schedule.days.length} />
        <IconButton size="sm" icon={showBone ? PanelRightClose : PanelRight} label={showBone ? 'Hide boneyard' : 'Show boneyard'} active={showBone} onClick={toggleBone} />
      </Toolbar>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="sched-board">
          <div className="sched-days">
            {rows.length === 0 ? (
              <EmptyState
                icon={CalendarPlus}
                title="No shoot days yet"
                description={`Add shoot days and drag scenes from the boneyard onto them. You have ${plural(model.scenes.length, 'scene')} waiting.`}
                action={
                  <div className="row">
                    <Button variant="primary" icon={CalendarPlus} onClick={() => addDay()}>
                      Add shoot day
                    </Button>
                    {bone.length > 0 && (
                      <Button icon={ListPlus} onClick={scheduleAllUnscheduled}>
                        Put all scenes on Day 1
                      </Button>
                    )}
                  </div>
                }
              />
            ) : (
              rows.map((r) => (
                <DayBlock
                  key={r.day.id}
                  row={r}
                  ids={containers[r.day.id] ?? []}
                  stripData={stripData}
                  itemIndex={itemIndex}
                  collapsed={collapsed.has(r.day.id)}
                  warnings={warnings.get(r.day.id) ?? []}
                  highlight={highlight}
                  onToggle={toggleDay}
                  onOpen={onOpen}
                  onMenu={onMenu}
                  onDelete={onDelete}
                />
              ))
            )}
            {rows.length > 0 && (
              <button type="button" className="sched-add-day" onClick={() => addDay()}>
                <Plus /> Add shoot day
              </button>
            )}
          </div>
          {showBone && (
            <BoneyardPane
              ids={containers[BONEYARD] ?? []}
              stripData={stripData}
              itemIndex={itemIndex}
              activeId={activeId}
              query={query}
              setQuery={setQuery}
              searchRef={searchRef}
              highlight={highlight}
              onOpen={onOpen}
              onMenu={onMenu}
              hasOrder={!!schedule.boneyardOrder?.length}
            />
          )}
        </div>
        <DragOverlay dropAnimation={null}>{activeOverlay}</DragOverlay>
      </DndContext>
      <MoveDialog sceneId={moveFor} rows={rows} onClose={() => setMoveFor(null)} />
    </>
  );
}
