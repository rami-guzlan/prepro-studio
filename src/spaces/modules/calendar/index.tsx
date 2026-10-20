/* Marketing Space — Calendar: the visual publishing schedule.
   Month / Week / Agenda views of posts, shoot days, milestones and campaign
   ranges; drag & drop to reschedule; an Unscheduled tray to plan pieces. */
import './calendar.css';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FileText,
  Flag,
  FilterX,
  History,
  ListTodo,
  PanelRight,
  Pencil,
  Plus,
  Printer,
  Radio,
  Send,
  Trash2,
} from 'lucide-react';
import type { Campaign, ContentStage } from '@/spaces/types';
import { FORMAT_BY_ID, POST_STATUSES, STAGES } from '@/spaces/constants';
import { allPosts, cadenceForWeek, channelColor, weekStart, type PostRef } from '@/spaces/derive';
import { openContent, useSpaceUI } from '@/spaces/ui';
import { getSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace, openPrint, readLS, useApp, writeLS } from '@/store/app';
import { exportCsv, isDesktop } from '@/backend';
import { MONTHS_LONG, MONTHS_SHORT, addDays, parseISODate, todayISO } from '@/lib/dates';
import { plural, safeFileName } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Button, ExportMenu, IconButton, ModuleHeader, Select, Tabs, Toolbar, confirmDialog, openContextMenu, toast, type AnchorRect, type MenuItem } from '@/ui';
import { overlayCount } from '@/ui/overlayStack';
import { indexSessions } from '../production/model';
import { setShootDate } from '../production/actions';
import { deleteMilestone, setMilestone, setPostStatus, setPostsDate, undatedPostIds, undoToast } from './actions';
import { CalContext, ItemView, type CalCtx, type DragData, type DropData } from './items';
import {
  DEFAULT_TOGGLES,
  MISSING_CHANNEL_COLOR,
  NO_CHANNEL,
  addMonths,
  buildItems,
  buildTray,
  channelLabel,
  firstOfMonth,
  isISODate,
  monthOf,
  type CalFilters,
  type CalView,
  type TrayEntry,
} from './model';
import { MilestonePopover, MorePopover, MovePopover, PlanPopover, QuickCreatePopover, type MoveTarget } from './popovers';
import { Tray, TrayCard } from './tray';
import { AgendaView, MonthView, WeekView, rectOf } from './views';

type Pop =
  | { kind: 'create'; date: string; anchor: AnchorRect }
  | { kind: 'more'; date: string; anchor: AnchorRect }
  | { kind: 'plan'; contentId: string; postIds?: string[]; date?: string; anchor: AnchorRect }
  | { kind: 'milestone'; id: string; anchor: AnchorRect }
  | { kind: 'move'; target: MoveTarget; current?: string; label: string; anchor: AnchorRect }
  | null;

const VIEWS: CalView[] = ['month', 'week', 'agenda'];

function pointRect(e: { clientX: number; clientY: number }): AnchorRect {
  return { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY };
}

function isTextTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Arrow keys move a keyboard-dragged item to the neighbouring day. */
const dayKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  const dir = dirs[event.code];
  if (!dir) return undefined;
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!collisionRect) return undefined;
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number; score: number } | null = null;
  for (const entry of droppableContainers.getEnabled()) {
    const r = droppableRects.get(entry.id);
    if (!r) continue;
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) continue; // the current day
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const along = (tx - cx) * dir[0] + (ty - cy) * dir[1];
    if (along <= 4) continue;
    const across = Math.abs(dir[0] ? ty - cy : tx - cx);
    const score = along + across * 3;
    if (!best || score < best.score) best = { x: tx, y: Math.min(ty, r.top + 30), score };
  }
  if (!best) return undefined;
  return { x: best.x - collisionRect.width / 2, y: best.y - collisionRect.height / 2 };
};

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function lastOfMonth(iso: string) {
  return addDays(addMonths(firstOfMonth(iso), 1), -1);
}

async function exportPostsCsv() {
  const s = getSpace();
  const refs = allPosts(s);
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title} - Posts`), refs, [
      { header: 'Date', value: (r) => r.post.date },
      { header: 'Time', value: (r) => r.post.time },
      { header: 'Channel', value: (r) => channelLabel(r.channel) },
      { header: 'Platform', value: (r) => r.channel?.platform },
      { header: 'Content', value: (r) => r.content.title },
      { header: 'Format', value: (r) => FORMAT_BY_ID[r.content.format]?.label ?? r.content.format },
      { header: 'Stage', value: (r) => STAGES.find((x) => x.value === r.content.stage)?.label ?? r.content.stage },
      { header: 'Status', value: (r) => POST_STATUSES.find((x) => x.value === r.post.status)?.label ?? r.post.status },
      { header: 'Campaign', value: (r) => s.campaigns.find((c) => c.id === r.content.campaignId)?.name },
      { header: 'Post title', value: (r) => r.post.title },
      { header: 'Caption', value: (r) => r.post.caption },
      { header: 'Hashtags', value: (r) => r.post.hashtags },
      { header: 'URL', value: (r) => r.post.url },
    ]);
    if (path) toast(`Saved ${path}`);
    else if (!isDesktop) toast('CSV downloaded');
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}

export default function CalendarModule() {
  const spaceId = useSpace((s) => s.id);
  const content = useSpace((s) => s.content) ?? [];
  const channels = useSpace((s) => s.channels) ?? [];
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const milestones = useSpace((s) => s.milestones) ?? [];
  const shoots = useSpace((s) => s.shoots) ?? [];
  const settings = useSpace((s) => s.settings);
  const fmt = useSpaceFormatters();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const mondayFirst = !!settings?.weekStartsMonday;
  const h12 = settings?.timeFormat !== '24h';

  /* ---- view state */
  const [view, setViewState] = useState<CalView>(() => {
    const p = params?.view as CalView | undefined;
    if (p && VIEWS.includes(p)) return p;
    const v = readLS<CalView>('prepro.spcal.view', 'month');
    return VIEWS.includes(v) ? v : 'month';
  });
  const setView = (v: CalView) => {
    setViewState(v);
    writeLS('prepro.spcal.view', v);
  };
  const [cursor, setCursor] = useState<string>(() => (isISODate(params?.date) ? params.date : todayISO()));
  useEffect(() => {
    if (isISODate(params?.date)) setCursor(params.date);
    const p = params?.view as CalView | undefined;
    if (p && VIEWS.includes(p)) setViewState(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ---- filters */
  const [toggles, setToggles] = useState(() => ({ ...DEFAULT_TOGGLES, ...readLS<Partial<typeof DEFAULT_TOGGLES>>('prepro.spcal.toggles', {}) }));
  const setToggle = (k: keyof typeof DEFAULT_TOGGLES) => {
    const next = { ...toggles, [k]: !toggles[k] };
    setToggles(next);
    writeLS('prepro.spcal.toggles', next);
  };
  const hiddenKey = `prepro.spcal.hidden.${spaceId}`;
  const [hidden, setHidden] = useState<string[]>(() => readLS<string[]>(hiddenKey, []));
  const toggleChannel = (id: string, solo = false) => {
    const all = [...channels.map((c) => c.id), NO_CHANNEL];
    let next: string[];
    if (solo) next = hidden.length === all.length - 1 && !hidden.includes(id) ? [] : all.filter((x) => x !== id);
    else next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    writeLS(hiddenKey, next);
  };
  const [campaignSel, setCampaignSel] = useState('');
  const [stage, setStage] = useState('');
  const campaignId = campaigns.some((c) => c.id === campaignSel) ? campaignSel : '';
  const filtersActive = hidden.some((h) => h === NO_CHANNEL || channels.some((c) => c.id === h)) || !!campaignId || !!stage;
  const resetFilters = () => {
    setHidden([]);
    writeLS(hiddenKey, []);
    setCampaignSel('');
    setStage('');
  };

  const [trayOpen, setTrayOpen] = useState(() => readLS<boolean>('prepro.spcal.tray', true));
  const toggleTray = () => {
    writeLS('prepro.spcal.tray', !trayOpen);
    setTrayOpen(!trayOpen);
  };
  const [trayQuery, setTrayQuery] = useState('');
  const [showPast, setShowPast] = useState(() => readLS<boolean>('prepro.spcal.past', false));
  const [agendaScroll, setAgendaScroll] = useState(0);
  const [pop, setPop] = useState<Pop>(null);
  const closePop = useCallback(() => setPop(null), []);

  /* ---- derived data */
  const refs = useMemo(() => allPosts({ content, channels }), [content, channels]);
  const sessionIdx = useMemo(() => indexSessions({ shoots, content }), [shoots, content]);
  const filters: CalFilters = useMemo(() => ({ hidden, campaignId, stage, ...toggles }), [hidden, campaignId, stage, toggles]);
  const items = useMemo(
    () => buildItems({ refs, shoots, milestones, campaigns, sessionPieces: sessionIdx.pieces, filters }),
    [refs, shoots, milestones, campaigns, sessionIdx, filters],
  );
  const bandCampaigns = useMemo<Campaign[]>(() => (toggles.showCampaigns ? campaigns.filter((c) => !campaignId || c.id === campaignId) : []), [toggles.showCampaigns, campaigns, campaignId]);
  const tray = useMemo(() => buildTray({ content, channels, filters, query: trayQuery }), [content, channels, filters, trayQuery]);
  const weekStartIso = weekStart(cursor, mondayFirst);
  const cadence = useMemo(() => (view === 'week' ? cadenceForWeek({ content, channels }, weekStartIso) : []), [view, content, channels, weekStartIso]);
  const missingChannelPosts = useMemo(() => refs.some((r) => !r.channel && isISODate(r.post.date)), [refs]);

  /* ---- visible range */
  const range = useMemo(() => {
    if (view === 'month') return { from: firstOfMonth(cursor), to: lastOfMonth(cursor) };
    if (view === 'week') return { from: weekStartIso, to: addDays(weekStartIso, 6) };
    return { from: today, to: addDays(today, 13) };
  }, [view, cursor, weekStartIso, today]);
  const stats = useMemo(() => {
    let posts = 0;
    let shootsN = 0;
    let ms = 0;
    for (const [d, list] of items) {
      if (d < range.from || (view !== 'agenda' && d > range.to)) continue;
      for (const it of list) {
        if (it.kind === 'post') posts++;
        else if (it.kind === 'shoot') shootsN++;
        else ms++;
      }
    }
    return { posts, shoots: shootsN, ms };
  }, [items, range, view]);

  const title = useMemo(() => {
    if (view === 'month') {
      const { y, m } = monthOf(cursor);
      return `${MONTHS_LONG[m]} ${y}`;
    }
    if (view === 'week') {
      const a = parseISODate(range.from)!;
      const b = parseISODate(range.to)!;
      if (a.getFullYear() !== b.getFullYear()) return `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
      if (a.getMonth() !== b.getMonth()) return `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
      return `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
    }
    return showPast ? 'All dates' : 'Upcoming';
  }, [view, cursor, range, showPast]);

  const step = (dir: -1 | 1) => {
    if (view === 'month') setCursor((c) => addMonths(c, dir));
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7));
  };
  const goToday = () => {
    setCursor(todayISO());
    setAgendaScroll((n) => n + 1);
  };
  const defaultCreateDate = () => (today >= range.from && (view === 'agenda' || today <= range.to) ? today : range.from);

  /* ---- drag & drop */
  const [active, setActive] = useState<DragData | null>(null);
  const activeRef = useRef<DragData | null>(null);
  const lastDragEnd = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: dayKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );
  const endDrag = () => {
    activeRef.current = null;
    setActive(null);
    lastDragEnd.current = Date.now();
  };
  const onDragStart = ({ active: a }: DragStartEvent) => {
    const data = (a.data.current ?? null) as DragData | null;
    activeRef.current = data;
    setActive(data);
    setPop(null);
  };
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const data = a.data.current as DragData | undefined;
    const drop = over?.data.current as DropData | undefined;
    endDrag();
    if (!data || !drop || !over) return;
    if (drop.type === 'tray') {
      if (data.type === 'post') {
        setPostsDate(data.contentId, [data.postId], undefined);
        undoToast('Post moved to Unscheduled');
      }
      return;
    }
    const date = drop.date;
    const when = fmt.dateMedium(date);
    switch (data.type) {
      case 'post':
        if (data.item.date === date) return;
        setPostsDate(data.contentId, [data.postId], date);
        undoToast(`Moved to ${when}`);
        return;
      case 'upost':
        setPostsDate(data.contentId, [data.postId], date);
        undoToast(`Scheduled on ${when}`);
        return;
      case 'piece': {
        const ids = undatedPostIds(data.contentId);
        if (ids.length) {
          setPostsDate(data.contentId, ids, date);
          undoToast(`${plural(ids.length, 'post')} scheduled on ${when}`);
        } else {
          const r = over.rect;
          setPop({ kind: 'plan', contentId: data.contentId, date, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.top + Math.min(r.height, 40) } });
        }
        return;
      }
      case 'shoot':
        if (data.item.date === date) return;
        setShootDate(data.shootId, date);
        undoToast(`Shoot day moved to ${when}`);
        return;
      case 'milestone':
        if (data.item.date === date) return;
        setMilestone(data.msId, { date });
        undoToast(`Milestone moved to ${when}`);
        return;
    }
  };

  /* ---- item actions */
  const removeMilestone = useCallback(async (id: string, name: string) => {
    if (await confirmDialog({ title: 'Delete milestone?', message: `“${name || 'Milestone'}” will be removed from the calendar.`, confirmLabel: 'Delete', danger: true })) {
      deleteMilestone(id);
      undoToast('Milestone deleted');
    }
  }, []);

  const postMenu = (ref: PostRef, e: ReactMouseEvent): MenuItem[] => {
    const { content: c, post } = ref;
    const at = pointRect(e);
    return [
      { label: 'Open publishing details', icon: Send, shortcut: 'Enter', onClick: () => openContent(c.id, 'publish') },
      { label: 'Open brief', icon: FileText, onClick: () => openContent(c.id, 'brief') },
      { separator: true },
      { header: 'Post status' },
      ...POST_STATUSES.map((s) => ({ label: s.label, checked: post.status === s.value, onClick: () => setPostStatus(c.id, post.id, s.value) })),
      { separator: true },
      {
        label: 'Move to date…',
        icon: CalendarDays,
        onClick: () => setPop({ kind: 'move', target: { type: 'post', contentId: c.id, postId: post.id }, current: post.date, label: c.title || 'Post', anchor: at }),
      },
      {
        label: 'Unschedule (remove date)',
        icon: CalendarX2,
        onClick: () => {
          setPostsDate(c.id, [post.id], undefined);
          undoToast('Post moved to Unscheduled');
        },
      },
    ];
  };

  const ctx: CalCtx = {
    fmt,
    h12,
    dragging: () => !!activeRef.current || Date.now() - lastDragEnd.current < 250,
    openItem: (it, el) => {
      if (it.kind === 'post') openContent(it.ref.content.id, 'publish');
      else if (it.kind === 'shoot') navigateSpace('production', { shootId: it.shoot.id });
      else setPop({ kind: 'milestone', id: it.ms.id, anchor: rectOf(el) });
    },
    itemMenu: (it, e) => {
      let menu: MenuItem[];
      const at = pointRect(e);
      if (it.kind === 'post') menu = postMenu(it.ref, e);
      else if (it.kind === 'shoot') {
        const sh = it.shoot;
        menu = [
          { label: 'Open in Production', icon: Clapperboard, shortcut: 'Enter', onClick: () => navigateSpace('production', { shootId: sh.id }) },
          { label: 'Print shoot plan', icon: Printer, onClick: () => openPrint('space-shoot-plan', { shoot: sh.id }) },
          { separator: true },
          { label: 'Move to date…', icon: CalendarDays, onClick: () => setPop({ kind: 'move', target: { type: 'shoot', shootId: sh.id }, current: sh.date, label: sh.title || 'Shoot day', anchor: at }) },
        ];
      } else {
        const ms = it.ms;
        menu = [
          { label: 'Edit milestone…', icon: Pencil, shortcut: 'Enter', onClick: () => setPop({ kind: 'milestone', id: ms.id, anchor: at }) },
          { label: ms.done ? 'Mark as not done' : 'Mark as done', icon: Flag, onClick: () => setMilestone(ms.id, { done: ms.done ? undefined : true }) },
          { label: 'Move to date…', icon: CalendarDays, onClick: () => setPop({ kind: 'move', target: { type: 'milestone', msId: ms.id }, current: ms.date, label: ms.name || 'Milestone', anchor: at }) },
          ...(it.campaign ? [{ label: `Open campaign “${it.campaign.name}”`, icon: CalendarRange, onClick: () => navigateSpace('campaigns', { campaignId: it.campaign!.id }) }] : []),
          { separator: true },
          { label: 'Delete milestone…', icon: Trash2, danger: true, shortcut: 'Del', onClick: () => removeMilestone(ms.id, ms.name) },
        ];
      }
      openContextMenu(e, menu);
    },
    deleteItem: (it) => {
      if (it.kind === 'milestone') void removeMilestone(it.ms.id, it.ms.name);
    },
    openCampaign: (c) => navigateSpace('campaigns', { campaignId: c.id }),
  };

  const onPlan = (entry: TrayEntry, anchor: AnchorRect) =>
    setPop({ kind: 'plan', contentId: entry.content.id, postIds: entry.kind === 'post' ? [entry.post.id] : undefined, date: defaultCreateDate(), anchor });

  /* ---- keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTextTarget(e.target) || overlayCount() > 0 || activeRef.current || useSpaceUI.getState().contentId) return;
      const k = e.key;
      if (k === 't' || k === 'T') goToday();
      else if (k === 'm' || k === 'M') setView('month');
      else if (k === 'w' || k === 'W') setView('week');
      else if (k === 'a' || k === 'A') setView('agenda');
      else if ((k === 'ArrowLeft' || k === '[') && view !== 'agenda') step(-1);
      else if ((k === 'ArrowRight' || k === ']') && view !== 'agenda') step(1);
      else if (k === 'n' || k === 'N') {
        const el = document.querySelector('.sp-calendar-newbtn');
        setPop({ kind: 'create', date: defaultCreateDate(), anchor: el ? rectOf(el) : { left: 300, top: 120, right: 300, bottom: 120 } });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useCommand('print', () => {
    openPrint('space-calendar', { month: (view === 'agenda' ? today : cursor).slice(0, 7) });
    return true;
  });

  /* ---- render */
  const printMonth = view === 'agenda' ? firstOfMonth(today) : firstOfMonth(cursor);
  const scheduleRange = view === 'agenda' ? { from: today, to: addDays(today, 13) } : range;
  const subtitle = [plural(stats.posts, 'post'), stats.shoots ? plural(stats.shoots, 'shoot day') : '', stats.ms ? plural(stats.ms, 'milestone') : '', tray.length ? `${tray.length} unscheduled` : '']
    .filter(Boolean)
    .join(' · ');

  const channelChips = (
    <>
      <span className="sp-calendar-filter-label">Channels</span>
      {channels.map((c) => {
        const off = hidden.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`sp-calendar-chtoggle ${off ? 'off' : 'on'}`}
            style={{ ['--ch' as any]: channelColor(c) }}
            aria-pressed={!off}
            title={`${off ? 'Show' : 'Hide'} ${channelLabel(c)} · Alt+click to show only this channel`}
            onClick={(e) => toggleChannel(c.id, e.altKey)}
          >
            <span className="dot" />
            <span className="lbl">{channelLabel(c)}</span>
          </button>
        );
      })}
      {missingChannelPosts && (
        <button
          type="button"
          className={`sp-calendar-chtoggle ${hidden.includes(NO_CHANNEL) ? 'off' : 'on'}`}
          style={{ ['--ch' as any]: MISSING_CHANNEL_COLOR }}
          aria-pressed={!hidden.includes(NO_CHANNEL)}
          title="Posts whose channel was deleted"
          onClick={(e) => toggleChannel(NO_CHANNEL, e.altKey)}
        >
          <span className="dot" />
          <span className="lbl">Deleted channel</span>
        </button>
      )}
      {channels.length === 0 && (
        <Button size="sm" variant="ghost" icon={Radio} onClick={() => navigateSpace('channels')}>
          Add channels
        </Button>
      )}
    </>
  );

  if (!settings) return null;

  return (
    <div className="module sp-calendar">
      <ModuleHeader
        title="Calendar"
        icon={CalendarDays}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-calendar', label: `Calendar — ${MONTHS_LONG[monthOf(printMonth).m]} ${monthOf(printMonth).y}`, options: { month: printMonth.slice(0, 7) } },
                { id: 'space-calendar', label: `Calendar — 3 months from ${MONTHS_SHORT[monthOf(printMonth).m]}`, options: { month: printMonth.slice(0, 7), months: 3 } },
                {
                  id: 'space-posting-schedule',
                  label: view === 'agenda' ? 'Posting schedule — next 14 days' : `Posting schedule — this ${view}`,
                  options: { from: scheduleRange.from, to: scheduleRange.to },
                },
              ]}
              csv={[{ label: 'All posts (CSV)', onClick: exportPostsCsv }]}
            />
            <Button
              variant="primary"
              icon={Plus}
              className="sp-calendar-newbtn"
              title="New content, milestone or shoot day (N)"
              onClick={(e) => setPop({ kind: 'create', date: defaultCreateDate(), anchor: rectOf(e.currentTarget) })}
            >
              New
            </Button>
          </>
        }
      />
      <Toolbar>
        <Button size="sm" onClick={goToday} title="Today (T)">
          Today
        </Button>
        {view !== 'agenda' && (
          <>
            <IconButton size="sm" icon={ChevronLeft} label={`Previous ${view} (←)`} onClick={() => step(-1)} />
            <IconButton size="sm" icon={ChevronRight} label={`Next ${view} (→)`} onClick={() => step(1)} />
          </>
        )}
        <div className="sp-calendar-title" aria-live="polite">
          {title}
        </div>
        {view === 'agenda' && (
          <Button
            size="sm"
            variant={showPast ? 'default' : 'ghost'}
            icon={History}
            aria-pressed={showPast}
            onClick={() => {
              writeLS('prepro.spcal.past', !showPast);
              setShowPast(!showPast);
            }}
          >
            {showPast ? 'Hide past' : 'Show past'}
          </Button>
        )}
        <div className="spacer" />
        <Tabs<CalView>
          value={view}
          onChange={setView}
          tabs={[
            { id: 'month', label: 'Month', icon: CalendarDays },
            { id: 'week', label: 'Week', icon: CalendarRange },
            { id: 'agenda', label: 'Agenda', icon: ListTodo },
          ]}
        />
        <IconButton size="sm" icon={PanelRight} label={trayOpen ? 'Hide unscheduled' : `Show unscheduled (${tray.length})`} active={trayOpen} aria-pressed={trayOpen} onClick={toggleTray} />
      </Toolbar>
      <Toolbar>
        <div className="row wrap sp-calendar-filters" style={{ padding: 0, flex: 1, minWidth: 0 }}>
          {channelChips}
          <span className="sp-calendar-sep" />
          {campaigns.length > 0 && (
            <Select
              size="sm"
              value={campaignId}
              onChange={setCampaignSel}
              placeholder="All campaigns"
              options={campaigns.map((c) => ({ value: c.id, label: c.name || 'Campaign' }))}
              aria-label="Campaign filter"
            />
          )}
          <Select
            size="sm"
            value={stage}
            onChange={(v) => setStage(v as ContentStage | '')}
            placeholder="All stages"
            options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
            aria-label="Content stage filter"
          />
          <span className="sp-calendar-sep" />
          <div className="sp-calendar-toggle-group" role="group" aria-label="Show on calendar">
            <Button size="sm" variant="ghost" icon={Clapperboard} aria-pressed={toggles.showShoots} onClick={() => setToggle('showShoots')} title="Show shoot days">
              Shoots
            </Button>
            <Button size="sm" variant="ghost" icon={Flag} aria-pressed={toggles.showMilestones} onClick={() => setToggle('showMilestones')} title="Show milestones">
              Milestones
            </Button>
            <Button size="sm" variant="ghost" icon={CalendarRange} aria-pressed={toggles.showCampaigns} onClick={() => setToggle('showCampaigns')} title="Show campaign date ranges">
              Campaigns
            </Button>
          </div>
          {filtersActive && (
            <Button size="sm" variant="ghost" icon={FilterX} onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Toolbar>
      <CalContext.Provider value={ctx}>
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={endDrag}
          accessibility={{
            screenReaderInstructions: { draggable: 'Press Space to pick up. Use the arrow keys to move to another day, Space to drop, Escape to cancel.' },
          }}
        >
          <div className="sp-calendar-body">
            <div className="sp-calendar-main">
              {channels.length === 0 && (
                <div className="sp-calendar-hint">
                  <Radio />
                  <span>
                    Posts are planned per channel. Add the platforms you publish on (YouTube, Instagram, TikTok, newsletter …) with their posting rhythm, then plan content on any day.
                  </span>
                  <Button size="sm" variant="primary" icon={Radio} onClick={() => navigateSpace('channels')}>
                    Set up channels
                  </Button>
                </div>
              )}
              {view === 'month' && (
                <MonthView
                  cursor={cursor}
                  mondayFirst={mondayFirst}
                  items={items}
                  campaigns={bandCampaigns}
                  today={today}
                  onCreate={(date, anchor) => setPop({ kind: 'create', date, anchor })}
                  onMore={(date, anchor) => setPop({ kind: 'more', date, anchor })}
                />
              )}
              {view === 'week' && (
                <WeekView
                  cursor={cursor}
                  mondayFirst={mondayFirst}
                  items={items}
                  campaigns={bandCampaigns}
                  today={today}
                  cadence={cadence}
                  onCreate={(date, anchor) => setPop({ kind: 'create', date, anchor })}
                />
              )}
              {view === 'agenda' && (
                <AgendaView items={items} campaigns={bandCampaigns} today={today} showPast={showPast} scrollKey={agendaScroll} onCreate={(date, anchor) => setPop({ kind: 'create', date, anchor })} />
              )}
            </div>
            {trayOpen && <Tray entries={tray} query={trayQuery} setQuery={setTrayQuery} draggingPost={active?.type === 'post'} onPlan={onPlan} onClose={toggleTray} />}
          </div>
          <DragOverlay dropAnimation={null}>
            {active ? (
              <div className="sp-calendar-overlay">
                {active.type === 'piece' || active.type === 'upost' ? <TrayCard entry={active.entry} /> : <ItemView it={active.item} variant={active.variant} />}
              </div>
            ) : null}
          </DragOverlay>
          {pop?.kind === 'more' && (
            <MorePopover
              anchor={pop.anchor}
              date={pop.date}
              items={items.get(pop.date) ?? []}
              onClose={closePop}
              onCreate={() => setPop({ kind: 'create', date: pop.date, anchor: pop.anchor })}
            />
          )}
        </DndContext>
        {pop?.kind === 'create' && <QuickCreatePopover anchor={pop.anchor} date={pop.date} channels={channels} campaigns={campaigns} campaignId={campaignId} onClose={closePop} />}
        {pop?.kind === 'plan' && <PlanPopover anchor={pop.anchor} contentId={pop.contentId} postIds={pop.postIds} date={pop.date} onClose={closePop} />}
        {pop?.kind === 'milestone' && <MilestonePopover anchor={pop.anchor} id={pop.id} onClose={closePop} />}
        {pop?.kind === 'move' && <MovePopover anchor={pop.anchor} target={pop.target} current={pop.current} label={pop.label} onClose={closePop} />}
      </CalContext.Provider>
    </div>
  );
}
