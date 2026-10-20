/* Month calendar of shoot days with project / post milestones as markers.
   Shoot days can be dragged onto another date to fix their date. */
import { useMemo, useState, type DragEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Flag, PackageCheck, Scissors, Clapperboard, LayoutList } from 'lucide-react';
import type { ID } from '@/types';
import { useFormatters, useProject } from '@/store/project';
import { navigate, readLS, writeLS } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { PHASES, optionColor } from '@/lib/constants';
import { MONTHS_LONG, WEEKDAYS_SHORT, addDays, isWeekend, parseISODate, toISODate, todayISO } from '@/lib/dates';
import { formatEighths } from '@/lib/format';
import { plural } from '@/lib/text';
import { Button, IconButton, Tabs, Toolbar, openContextMenu, toast } from '@/ui';
import { computeDays, stripColor, type DayRow } from './logic';
import { setDayField } from './actions';

interface Marker {
  label: string;
  kind: 'project' | 'delivery' | 'milestone' | 'post';
  color: string;
  done?: boolean;
}

const DRAG_TYPE = 'application/x-prepro-shootday';

function monthKey(y: number, m: number) {
  return { y: y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
}

export function CalendarView({ onShowDay }: { onShowDay: (dayId: ID) => void }) {
  const schedule = useProject((p) => p.schedule);
  const locations = useProject((p) => p.locations);
  const meta = useProject((p) => p.meta);
  const milestones = useProject((p) => p.milestones);
  const postSchedule = useProject((p) => p.post?.schedule);
  const weekStartsMonday = useProject((p) => p.settings.weekStartsMonday);
  const model = useScriptModel();
  const fmt = useFormatters();
  const rows = useMemo(() => computeDays({ schedule, locations }, model), [schedule, locations, model]);

  const byDate = useMemo(() => {
    const m = new Map<string, DayRow[]>();
    for (const r of rows) if (r.date) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return m;
  }, [rows]);

  const markers = useMemo(() => {
    const m = new Map<string, Marker[]>();
    const add = (date: string | undefined, mk: Marker) => {
      if (!date || !parseISODate(date)) return;
      m.set(date, [...(m.get(date) ?? []), mk]);
    };
    add(meta.shootStart, { label: 'Shoot starts', kind: 'project', color: '#f5a524' });
    add(meta.shootEnd, { label: 'Shoot wraps', kind: 'project', color: '#f5a524' });
    add(meta.deliveryDate, { label: 'Delivery', kind: 'delivery', color: '#2fb36d' });
    for (const ms of milestones ?? []) add(ms.date, { label: ms.name, kind: 'milestone', color: optionColor(PHASES, ms.phase) ?? '#3e8ef7', done: ms.done });
    for (const pm of postSchedule ?? []) {
      const done = pm.status === 'done' || pm.status === 'approved';
      if (pm.start && pm.end && pm.start !== pm.end) {
        add(pm.start, { label: `${pm.name} begins`, kind: 'post', color: '#a464f5', done });
        add(pm.end, { label: `${pm.name} due`, kind: 'post', color: '#a464f5', done });
      } else add(pm.end ?? pm.start, { label: pm.name, kind: 'post', color: '#a464f5', done });
    }
    return m;
  }, [meta, milestones, postSchedule]);

  const firstDate = rows.find((r) => r.date)?.date ?? meta.shootStart ?? todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = parseISODate(firstDate) ?? new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [count, setCount] = useState<'1' | '2' | '3'>(() => readLS<'1' | '2' | '3'>('prepro.schedule.calMonths', '1'));
  const [dropDate, setDropDate] = useState<string | null>(null);

  const weekStart = weekStartsMonday ? 1 : 0;
  const weekdays = [...WEEKDAYS_SHORT.slice(weekStart), ...WEEKDAYS_SHORT.slice(0, weekStart)];
  const today = todayISO();
  const undated = rows.filter((r) => !r.date);

  const goTo = (iso: string | undefined) => {
    const d = parseISODate(iso);
    if (d) setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const onDrop = (e: DragEvent, iso: string) => {
    const dayId = e.dataTransfer.getData(DRAG_TYPE);
    setDropDate(null);
    if (!dayId) return;
    e.preventDefault();
    const r = rows.find((x) => x.day.id === dayId);
    if (!r || r.date === iso) return;
    setDayField(dayId, { date: iso });
    toast(`Day ${r.number} moved to ${fmt.dateMedium(iso)}`);
  };

  const months = Array.from({ length: Number(count) }, (_, i) => monthKey(cursor.y, cursor.m + i));

  return (
    <>
      <Toolbar>
        <IconButton size="sm" icon={ChevronLeft} label="Previous month" onClick={() => setCursor((c) => monthKey(c.y, c.m - 1))} />
        <IconButton size="sm" icon={ChevronRight} label="Next month" onClick={() => setCursor((c) => monthKey(c.y, c.m + 1))} />
        <div className="sched-cal-title">
          {MONTHS_LONG[cursor.m]} {cursor.y}
          {count !== '1' && ` – ${MONTHS_LONG[months[months.length - 1].m]} ${months[months.length - 1].y}`}
        </div>
        <Button size="sm" onClick={() => goTo(today)}>
          Today
        </Button>
        <Button size="sm" icon={Clapperboard} disabled={!rows.some((r) => r.date)} onClick={() => goTo(rows.find((r) => r.date)?.date)}>
          First shoot day
        </Button>
        <div className="spacer" />
        <div className="sched-cal-legend">
          <span>
            <i className="shoot" /> Shoot day
          </span>
          <span>
            <i style={{ background: '#f5a524' }} /> Shoot dates
          </span>
          <span>
            <i style={{ background: '#3e8ef7' }} /> Milestones
          </span>
          <span>
            <i style={{ background: '#a464f5' }} /> Post
          </span>
          <span>
            <i style={{ background: '#2fb36d' }} /> Delivery
          </span>
        </div>
        <Tabs
          value={count}
          onChange={(v) => {
            setCount(v);
            writeLS('prepro.schedule.calMonths', v);
          }}
          tabs={[
            { id: '1', label: '1 month' },
            { id: '2', label: '2' },
            { id: '3', label: '3' },
          ]}
        />
      </Toolbar>
      <div className="module-body padded sched-cal-wrap">
        {undated.length > 0 && (
          <div className="sched-cal-note">
            <CalendarDays />
            <span>
              {plural(undated.length, 'shoot day')} without a date ({undated.map((r) => `Day ${r.number}`).join(', ')}). Set the first shoot day in <strong>Schedule settings</strong> or drag
              {undated.length === 1 ? ' it' : ' them'} onto the calendar.
            </span>
            <div className="row" style={{ gap: 4 }}>
              {undated.map((r) => (
                <span
                  key={r.day.id}
                  className="sched-cal-chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, r.day.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  title="Drag onto a date"
                >
                  Day {r.number}
                </span>
              ))}
            </div>
          </div>
        )}
        {months.map(({ y, m }) => {
          const first = new Date(y, m, 1, 12);
          const offset = (first.getDay() - weekStart + 7) % 7;
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          const weeks = Math.ceil((offset + daysInMonth) / 7);
          const start = addDays(toISODate(first), -offset);
          const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
          return (
            <div key={`${y}-${m}`} className="sched-cal">
              {count !== '1' && (
                <div className="sched-cal-month">
                  {MONTHS_LONG[m]} {y}
                </div>
              )}
              <div className="sched-cal-grid head">
                {weekdays.map((w) => (
                  <div key={w} className="sched-cal-wd">
                    {w}
                  </div>
                ))}
              </div>
              <div className="sched-cal-grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(${count === '1' ? 112 : 92}px, auto))` }}>
                {cells.map((iso) => {
                  const d = parseISODate(iso)!;
                  const inMonth = d.getMonth() === m;
                  const shoots = byDate.get(iso) ?? [];
                  const mks = markers.get(iso) ?? [];
                  const cls = [
                    'sched-cal-cell',
                    !inMonth && 'out',
                    isWeekend(iso) && 'weekend',
                    iso === today && 'today',
                    shoots.length > 0 && 'has-shoot',
                    dropDate === iso && 'drop',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div
                      key={iso}
                      className={cls}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dropDate !== iso) setDropDate(iso);
                      }}
                      onDragLeave={() => dropDate === iso && setDropDate(null)}
                      onDrop={(e) => onDrop(e, iso)}
                    >
                      <div className="sched-cal-daynum">
                        <span>{d.getDate()}</span>
                        {shoots.length > 1 && <span className="sched-cal-clash">Double-booked</span>}
                      </div>
                      {mks.map((mk, i) => (
                        <div key={i} className={`sched-cal-marker ${mk.done ? 'done' : ''}`} style={{ ['--mk' as any]: mk.color }} title={mk.label}>
                          {mk.kind === 'delivery' ? <PackageCheck /> : mk.kind === 'post' ? <Scissors /> : <Flag />}
                          <span className="ellipsis">{mk.label}</span>
                        </div>
                      ))}
                      {shoots.map((r) => (
                        <div
                          key={r.day.id}
                          className="sched-cal-shoot"
                          draggable
                          role="button"
                          tabIndex={0}
                          title={`Day ${r.number}${r.day.label ? ` · ${r.day.label}` : ''}\n${plural(r.scenes.length, 'scene')} · ${formatEighths(r.eighths)} pages\nDrag to another date to reschedule`}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_TYPE, r.day.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => onShowDay(r.day.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onShowDay(r.day.id);
                          }}
                          onContextMenu={(e) =>
                            openContextMenu(e, [
                              { label: 'Show on stripboard', icon: LayoutList, onClick: () => onShowDay(r.day.id) },
                              { label: 'Open call sheet', icon: ClipboardList, onClick: () => navigate('callsheets', { dayId: r.day.id }) },
                            ])
                          }
                        >
                          <div className="sched-cal-shoot-title">
                            <strong>Day {r.number}</strong>
                            {r.day.label && <span className="ellipsis">{r.day.label}</span>}
                            <span className="sched-cal-pages">{formatEighths(r.eighths)} pg</span>
                          </div>
                          {r.scenes.length > 0 ? (
                            <div className="sched-cal-pills">
                              {r.scenes.map((s) => {
                                const c = stripColor(s);
                                return (
                                  <span key={s.id} className="sched-cal-pill" style={{ background: c.bg, color: c.fg }} title={`${s.number}. ${s.heading}`}>
                                    {s.number}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="sched-cal-empty">No scenes</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
