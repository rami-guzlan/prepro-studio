/* The three calendar views: Month (6-week grid), Week (7 columns) and Agenda. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { CalendarPlus, Check, Plus, Radio } from 'lucide-react';
import type { Campaign, Channel } from '@/spaces/types';
import { channelColor } from '@/spaces/derive';
import { navigateSpace } from '@/store/app';
import { MONTHS_SHORT, WEEKDAYS_SHORT, diffDays, isWeekend, parseISODate, weekdayShort } from '@/lib/dates';
import { plural } from '@/lib/text';
import { Badge, Button, type AnchorRect } from '@/ui';
import { Bands, DayDrop, DraggableItem, useCal } from './items';
import { campaignsOn, channelLabel, isISODate, monthOf, monthWeeks, weekBands, weekDays, type CalItem } from './model';

const DAYNUM_H = 24;
const BAND_H = 17;
const CHIP_STEP = 22;

export function rectOf(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Popover anchored over the top of an element (instead of below it). */
function topRectOf(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.top };
}

function isFromItem(e: MouseEvent) {
  return !!(e.target as HTMLElement).closest('[data-cal-item], button, a, input, select, textarea');
}

export function weekdayHeaders(mondayFirst: boolean): string[] {
  return mondayFirst ? [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]] : WEEKDAYS_SHORT;
}

export interface ViewProps {
  cursor: string;
  mondayFirst: boolean;
  items: Map<string, CalItem[]>;
  /** campaigns to draw as bands (already filtered) */
  campaigns: Campaign[];
  today: string;
  onCreate: (date: string, anchor: AnchorRect) => void;
}

/* ---------------------------------------------------------------- month */

export function MonthView({ cursor, mondayFirst, items, campaigns, today, onCreate, onMore }: ViewProps & { onMore: (date: string, anchor: AnchorRect) => void }) {
  const cal = useCal();
  const weeks = useMemo(() => monthWeeks(cursor, mondayFirst), [cursor, mondayFirst]);
  const bands = useMemo(() => weeks.map((w) => weekBands(campaigns, w)), [weeks, campaigns]);
  const { m } = monthOf(cursor);
  const ref = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRowH(el.clientHeight / 6);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="sp-calendar-month" role="grid" aria-label="Month">
      <div className="sp-calendar-wdays" role="row">
        {weekdayHeaders(mondayFirst).map((w) => (
          <div key={w} className="sp-calendar-wday" role="columnheader">
            {w}
          </div>
        ))}
      </div>
      <div className="sp-calendar-weeks" ref={ref}>
        {weeks.map((days, wi) => {
          const { segs, lanes } = bands[wi];
          const max = rowH ? Math.max(1, Math.floor((rowH - DAYNUM_H - 6 - lanes * BAND_H) / CHIP_STEP)) : 4;
          return (
            <div key={days[0]} className="sp-calendar-week" role="row" style={{ ['--lanes' as any]: lanes } as CSSProperties}>
              {days.map((iso) => {
                const d = parseISODate(iso)!;
                const list = items.get(iso) ?? [];
                const overflow = list.length > max;
                const shown = overflow ? list.slice(0, Math.max(0, max - 1)) : list;
                const cls = ['sp-calendar-day', d.getMonth() !== m && 'out', isWeekend(iso) && 'weekend', iso === today && 'today'].filter(Boolean).join(' ');
                return (
                  <DayDrop
                    key={iso}
                    id={`day:m:${iso}`}
                    date={iso}
                    className={cls}
                    role="gridcell"
                    aria-label={cal.fmt.dateLong(iso)}
                    onClick={(e) => {
                      if (!isFromItem(e) && !cal.dragging()) onCreate(iso, topRectOf(e.currentTarget));
                    }}
                  >
                    <div className="sp-calendar-daynum">
                      <b>{d.getDate()}</b>
                      {d.getDate() === 1 && <span className="mon">{MONTHS_SHORT[d.getMonth()]}</span>}
                      <button
                        type="button"
                        className="sp-calendar-add"
                        aria-label={`New on ${cal.fmt.dateMedium(iso)}`}
                        title="New content, milestone or shoot day"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreate(iso, rectOf(e.currentTarget));
                        }}
                      >
                        <Plus />
                      </button>
                    </div>
                    {lanes > 0 && <div className="sp-calendar-bandspace" />}
                    <div className="sp-calendar-items">
                      {shown.map((it) => (
                        <DraggableItem key={it.key} it={it} variant="chip" scope="m" />
                      ))}
                      {overflow && (
                        <button
                          type="button"
                          className="sp-calendar-more"
                          onClick={(e) => {
                            e.stopPropagation();
                            const cell = e.currentTarget.closest('.sp-calendar-day');
                            onMore(iso, topRectOf(cell ?? e.currentTarget));
                          }}
                        >
                          +{list.length - shown.length} more
                        </button>
                      )}
                    </div>
                  </DayDrop>
                );
              })}
              <Bands segs={segs} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- week */

export interface CadenceRow {
  channel: Channel;
  planned: number;
  target?: number;
}

function fmtTarget(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function CadenceBar({ cadence }: { cadence: CadenceRow[] }) {
  if (!cadence.length) {
    return (
      <div className="sp-calendar-cadence">
        <span className="muted small">Set a posting rhythm on your channels to see here whether each one gets its posts this week.</span>
        <Button size="sm" variant="ghost" icon={Radio} onClick={() => navigateSpace('channels')}>
          Channels
        </Button>
      </div>
    );
  }
  return (
    <div className="sp-calendar-cadence" aria-label="Posting rhythm this week">
      <span className="sp-calendar-filter-label">Rhythm this week</span>
      {cadence.map(({ channel, planned, target }) => {
        const met = target != null && planned >= target;
        const under = target != null && !met;
        const unit = channel.cadenceUnit === 'month' ? 'month' : 'week';
        const tip =
          target != null
            ? `${channelLabel(channel)}: ${plural(planned, 'post')} planned this week · target ${channel.cadence} per ${unit}${unit === 'month' ? ` (≈ ${fmtTarget(target)} per week)` : ''}`
            : `${channelLabel(channel)}: ${plural(planned, 'post')} planned this week · no target set`;
        return (
          <span key={channel.id} className={`sp-calendar-cad ${met ? 'met' : under ? 'under' : ''}`} style={{ ['--ch' as any]: channelColor(channel) } as CSSProperties} title={tip}>
            <i className="dot" />
            {channelLabel(channel)}
            <span className="n">
              {planned}
              {target != null && unit === 'week' ? `/${fmtTarget(target)}` : ''}
            </span>
            {target != null && unit === 'month' && <span className="muted">· {channel.cadence}/mo</span>}
            {met && <Check />}
          </span>
        );
      })}
    </div>
  );
}

export function WeekView({ cursor, mondayFirst, items, campaigns, today, onCreate, cadence }: ViewProps & { cadence: CadenceRow[] }) {
  const cal = useCal();
  const days = useMemo(() => weekDays(cursor, mondayFirst), [cursor, mondayFirst]);
  const { segs, lanes } = useMemo(() => weekBands(campaigns, days), [campaigns, days]);
  const split = useMemo(
    () =>
      days.map((iso) => {
        const list = items.get(iso) ?? [];
        return {
          iso,
          allDay: list.filter((it) => it.kind !== 'post' || !it.time),
          timed: list.filter((it) => it.kind === 'post' && !!it.time),
          posts: list.filter((it) => it.kind === 'post').length,
        };
      }),
    [days, items],
  );
  const dayCls = (base: string, iso: string) => [base, isWeekend(iso) && 'weekend', iso === today && 'today'].filter(Boolean).join(' ');

  return (
    <div className="sp-calendar-weekview">
      <CadenceBar cadence={cadence} />
      <div className="sp-calendar-wk">
        <div className="sp-calendar-wk-row head">
          <div className="sp-calendar-wk-gutter" />
          {split.map(({ iso, posts }) => (
            <div key={iso} className={dayCls('sp-calendar-wk-head-cell', iso)}>
              <span className="wd">{weekdayShort(iso)}</span>
              <span className="dn">{parseISODate(iso)?.getDate()}</span>
              {posts > 0 && <span className="cnt">{plural(posts, 'post')}</span>}
              <button
                type="button"
                className="sp-calendar-add"
                aria-label={`New on ${cal.fmt.dateMedium(iso)}`}
                title="New content, milestone or shoot day"
                onClick={(e) => onCreate(iso, rectOf(e.currentTarget))}
              >
                <Plus />
              </button>
            </div>
          ))}
        </div>
        <div className="sp-calendar-wk-row allday" style={{ ['--lanes' as any]: lanes } as CSSProperties}>
          <div className="sp-calendar-wk-gutter">All day</div>
          {split.map(({ iso, allDay }) => (
            <DayDrop
              key={iso}
              id={`day:wa:${iso}`}
              date={iso}
              className={dayCls('sp-calendar-wk-cell', iso)}
              onClick={(e) => {
                if (!isFromItem(e) && !cal.dragging()) onCreate(iso, topRectOf(e.currentTarget));
              }}
            >
              {lanes > 0 && <div className="sp-calendar-bandspace" />}
              {allDay.map((it) => (
                <DraggableItem key={it.key} it={it} variant="chip" scope="wa" />
              ))}
            </DayDrop>
          ))}
          <Bands segs={segs} />
        </div>
        <div className="sp-calendar-wk-row timed">
          <div className="sp-calendar-wk-gutter">Timed</div>
          {split.map(({ iso, timed }) => (
            <DayDrop
              key={iso}
              id={`day:wt:${iso}`}
              date={iso}
              className={dayCls('sp-calendar-wk-cell', iso)}
              onClick={(e) => {
                if (!isFromItem(e) && !cal.dragging()) onCreate(iso, topRectOf(e.currentTarget));
              }}
            >
              {timed.map((it) => (
                <DraggableItem key={it.key} it={it} variant="card" scope="wt" />
              ))}
              {timed.length === 0 && (
                <div className="sp-calendar-wk-empty">
                  <button type="button" className="sp-calendar-add" aria-label={`New on ${cal.fmt.dateMedium(iso)}`} onClick={(e) => onCreate(iso, rectOf(e.currentTarget))}>
                    <Plus />
                  </button>
                </div>
              )}
            </DayDrop>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- agenda */

function relativeDay(today: string, iso: string): string {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1) return n < 14 ? `in ${n} days` : `in ${Math.round(n / 7)} weeks`;
  return -n < 14 ? `${-n} days ago` : `${Math.round(-n / 7)} weeks ago`;
}

export function AgendaView({
  items,
  campaigns,
  today,
  onCreate,
  showPast,
  scrollKey,
}: Omit<ViewProps, 'cursor' | 'mondayFirst'> & { showPast: boolean; scrollKey: number }) {
  const cal = useCal();
  const dates = useMemo(() => {
    const set = new Set([...items.keys()].filter(isISODate));
    set.add(today);
    return [...set].filter((d) => showPast || d >= today).sort();
  }, [items, today, showPast]);
  const todayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start' });
  }, [showPast, scrollKey]);
  const ahead = dates.filter((d) => d > today && (items.get(d)?.length ?? 0) > 0).length;

  return (
    <div className="sp-calendar-agenda">
      {dates.map((iso) => {
        const list = items.get(iso) ?? [];
        const d = parseISODate(iso)!;
        const camps = campaignsOn(campaigns, iso);
        const cls = ['sp-calendar-agenda-day', iso === today && 'today', iso < today && 'past'].filter(Boolean).join(' ');
        return (
          <div key={iso} ref={iso === today ? todayRef : undefined} style={{ scrollMarginTop: 12 }}>
            <DayDrop id={`day:a:${iso}`} date={iso} className={cls}>
              <div className="sp-calendar-agenda-head">
                <div className="sp-calendar-datebadge">
                  <span>{weekdayShort(iso)}</span>
                  <strong>{d.getDate()}</strong>
                </div>
                <div className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span className="sp-calendar-agenda-title">{cal.fmt.dateLong(iso)}</span>
                  <span className="sp-calendar-agenda-rel">
                    {relativeDay(today, iso)}
                    {list.length > 0 && ` · ${plural(list.length, 'item')}`}
                  </span>
                </div>
                {camps.length > 0 && (
                  <div className="sp-calendar-agenda-camps">
                    {camps.map((c) => (
                      <Badge key={c.id} color={c.color || '#7c5cff'} title={c.objective}>
                        {c.name || 'Campaign'}
                      </Badge>
                    ))}
                  </div>
                )}
                <span className="spacer" />
                <button type="button" className="sp-calendar-add" aria-label={`New on ${cal.fmt.dateMedium(iso)}`} title="New content, milestone or shoot day" onClick={(e) => onCreate(iso, rectOf(e.currentTarget))}>
                  <Plus />
                </button>
              </div>
              {list.length > 0 ? (
                <div className="sp-calendar-agenda-rows">
                  {list.map((it) => (
                    <DraggableItem key={it.key} it={it} variant="row" scope="a" />
                  ))}
                </div>
              ) : (
                <div className="sp-calendar-agenda-empty">Nothing planned — drag a piece from Unscheduled here or click +.</div>
              )}
            </DayDrop>
          </div>
        );
      })}
      {ahead === 0 && (
        <div className="empty" style={{ padding: '28px 16px' }}>
          <div className="empty-icon">
            <CalendarPlus />
          </div>
          <h3>Nothing planned ahead</h3>
          <p>Schedule posts by dragging pieces from the Unscheduled tray onto a day, or switch to Month and click any day to plan something new.</p>
          <Button variant="primary" icon={Plus} onClick={(e) => onCreate(today, rectOf(e.currentTarget))}>
            Plan something for today
          </Button>
        </div>
      )}
    </div>
  );
}
