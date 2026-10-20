/* Post schedule: milestones table + Gantt chart + "Generate dates" helper. */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { CalendarClock, Copy, ListPlus, Plus, Trash2, WandSparkles } from 'lucide-react';
import type { PostMilestone, PostStatus } from '@/types';
import { POST_STATUSES, optionColor } from '@/lib/constants';
import { addDays, diffDays, MONTHS_SHORT, parseISODate, todayISO, toISODate } from '@/lib/dates';
import { uid } from '@/lib/id';
import { dayDates } from '@/derived/project';
import { getProject, update, useFormatters, useProject } from '@/store/project';
import { templatePostSchedule } from '@/templates';
import { Button, Card, DateInput, EmptyState, Field, Modal, Switch, Toolbar, confirmDialog, toast, type Column } from '@/ui';
import { PostTable, StatusSelect, Summary } from './components';
import { generateSchedule, scheduleOps } from './shared';

const isISO = (d?: string): d is string => !!d && !!parseISODate(d);

async function removeItem(m: PostMilestone) {
  const ok = await confirmDialog({ title: 'Delete post milestone?', message: `“${m.name || 'Untitled'}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) scheduleOps.remove(m.id);
}

export function ScheduleTab() {
  const items = useProject((p) => p.post.schedule);
  const crew = useProject((p) => p.crew);
  const contacts = useProject((p) => p.contacts);
  const delivery = useProject((p) => p.meta.deliveryDate);
  const fmt = useFormatters();
  const [genOpen, setGenOpen] = useState(false);

  const owners = useMemo(() => {
    const s = new Set<string>();
    for (const c of crew) if (c.status !== 'declined') s.add(c.name);
    for (const c of contacts) if (c.category === 'post' || c.category === 'vendor') s.add(c.company || c.name);
    for (const i of items) if (i.owner) s.add(i.owner);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [crew, contacts, items]);

  const add = () => scheduleOps.add({ id: uid('pm'), name: 'New milestone', status: 'not_started' });

  const columns: Column<PostMilestone>[] = [
    { key: 'name', header: 'Milestone', type: 'text', minWidth: 180, placeholder: 'Milestone' },
    { key: 'start', header: 'Start', type: 'date', width: 136 },
    { key: 'end', header: 'End', type: 'date', width: 136 },
    {
      key: 'days',
      header: 'Days',
      width: 60,
      align: 'right',
      sortValue: (m) => (isISO(m.start) && isISO(m.end) ? diffDays(m.start, m.end) + 1 : -1),
      render: (m) => <span className="muted">{isISO(m.start) && isISO(m.end) && m.end >= m.start ? diffDays(m.start, m.end) + 1 : ''}</span>,
    },
    { key: 'owner', header: 'Owner', type: 'combo', suggestions: owners, width: 170, placeholder: '—' },
    {
      key: 'status',
      header: 'Status',
      width: 132,
      sortValue: (m) => POST_STATUSES.findIndex((s) => s.value === m.status),
      render: (m) => <StatusSelect value={m.status} options={POST_STATUSES} onChange={(v) => scheduleOps.update(m.id, { status: v as PostStatus }, false)} />,
    },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 180, placeholder: 'Notes' },
  ];

  const doneCount = items.filter((i) => i.status === 'done' || i.status === 'approved').length;
  const lock = items.find((i) => /picture lock/i.test(i.name));
  const lastEnd = items.map((i) => i.end).filter(isISO).sort().pop();
  const late = delivery && lastEnd && lastEnd > delivery;

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={add}>
          Add milestone
        </Button>
        <Button icon={WandSparkles} onClick={() => setGenOpen(true)} disabled={items.length === 0}>
          Generate dates
        </Button>
        <div className="spacer" />
        <Summary>
          <span>
            <b>{doneCount}</b>/{items.length} done
          </span>
          {lock?.end && (
            <span>
              Picture lock <b>{fmt.dateMedium(lock.end)}</b>
            </span>
          )}
          {delivery && (
            <span className={late ? 'post-warn' : undefined} title={late ? 'The post schedule ends after the delivery date' : undefined}>
              Delivery <b>{fmt.dateMedium(delivery)}</b>
              {late ? ' · schedule runs late' : ''}
            </span>
          )}
        </Summary>
      </Toolbar>
      <div className="module-body padded">
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No post schedule yet"
            description="Plan editorial, sound, colour, graphics and delivery. Start from the standard post milestones and generate dates from the end of the shoot."
            action={
              <div className="row">
                <Button variant="primary" icon={ListPlus} onClick={() => update((d) => void d.post.schedule.push(...templatePostSchedule()))}>
                  Add standard milestones
                </Button>
                <Button icon={Plus} onClick={add}>
                  Add milestone
                </Button>
              </div>
            }
          />
        ) : (
          <div className="post-stack">
            <Card title="Timeline" padded>
              <Gantt items={items} delivery={delivery} />
            </Card>
            <PostTable
              rows={items}
              columns={columns}
              minWidth={980}
              onChange={(id, patch) => scheduleOps.update(id, patch, !('start' in patch) && !('end' in patch))}
              onReorder={(id, before) => scheduleOps.moveBefore(id, before)}
              rowActions={(m) => [
                { label: 'Duplicate', icon: Copy, onClick: () => scheduleOps.duplicate(m.id, () => uid('pm')) },
                { separator: true },
                { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(m) },
              ]}
            />
          </div>
        )}
      </div>
      <GenerateDatesModal open={genOpen} onClose={() => setGenOpen(false)} />
    </>
  );
}

/* ---------------------------------------------------------------- Gantt */

/** Width of an element via a callback ref. */
function useWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, w };
}

function Gantt({ items, delivery }: { items: PostMilestone[]; delivery?: string }) {
  const fmt = useFormatters();
  const today = todayISO();
  const { ref, w } = useWidth();
  const rows = items.map((it) => {
    const s = isISO(it.start) ? it.start : isISO(it.end) ? it.end : undefined;
    let e = isISO(it.end) ? it.end : s;
    if (s && e && e < s) e = s;
    return { it, s, e };
  });
  const dates = rows.flatMap((r) => [r.s, r.e]).filter(isISO);
  if (isISO(delivery)) dates.push(delivery);
  if (!dates.length) {
    return (
      <div className="muted small" ref={ref}>
        Add start and end dates — or use “Generate dates” — to see the schedule as a Gantt chart.
      </div>
    );
  }
  dates.sort();
  const lo = addDays(dates[0], -1);
  const hi = addDays(dates[dates.length - 1], 2);
  const span = Math.max(1, diffDays(lo, hi));
  const pct = (d: string) => (diffDays(lo, d) / span) * 100;

  const ticks: { date: string; label: string }[] = [];
  const start = parseISODate(lo)!;
  if (span <= 120) {
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (toISODate(d) <= hi) {
      ticks.push({ date: toISODate(d), label: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` });
      d.setDate(d.getDate() + (span > 70 ? 14 : 7));
    }
  } else {
    const d = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12);
    while (toISODate(d) <= hi) {
      ticks.push({ date: toISODate(d), label: MONTHS_SHORT[d.getMonth()] });
      d.setMonth(d.getMonth() + 1);
    }
  }

  // label only as many ticks as fit (≈ 56px apart)
  const trackW = Math.max(0, w - 200);
  const every = trackW > 0 && ticks.length > 1 ? Math.max(1, Math.ceil(56 / ((trackW * (pct(ticks[1].date) - pct(ticks[0].date))) / 100))) : 1;

  return (
    <div className="post-gantt" ref={ref}>
      <div className="post-gantt-row head">
        <div className="post-gantt-label" />
        <div className="post-gantt-track">
          {ticks.map((t, i) =>
            i % every === 0 ? (
              <span key={t.date} className="post-gantt-tick" style={{ left: `${pct(t.date)}%` }}>
                {t.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <div className="post-gantt-body">
        <div className="post-gantt-overlay">
          {ticks.map((t) => (
            <i key={t.date} className="post-gantt-grid" style={{ left: `${pct(t.date)}%` }} />
          ))}
          {today >= lo && today <= hi && (
            <div className="post-gantt-today" style={{ left: `${pct(today)}%` }} title={`Today — ${fmt.dateMedium(today)}`}>
              <span>Today</span>
            </div>
          )}
          {isISO(delivery) && (
            <div className="post-gantt-deadline" style={{ left: `${pct(addDays(delivery, 1))}%` }} title={`Delivery — ${fmt.dateMedium(delivery)}`}>
              <span>Delivery</span>
            </div>
          )}
        </div>
        {rows.map(({ it, s, e }) => {
          const color = optionColor(POST_STATUSES, it.status) ?? '#8e8c99';
          const left = s ? pct(s) : 0;
          const width = s && e ? Math.max(0.6, ((diffDays(s, e) + 1) / span) * 100) : 0;
          const days = s && e ? diffDays(s, e) + 1 : 0;
          const late = isISO(delivery) && e && e > delivery;
          return (
            <div key={it.id} className="post-gantt-row">
              <div className="post-gantt-label" title={it.name}>
                <span className="color-dot" style={{ background: color }} />
                <span className="ellipsis">{it.name || 'Untitled'}</span>
              </div>
              <div className="post-gantt-track">
                {s ? (
                  <div
                    className={`post-gantt-bar ${it.status === 'done' ? 'done' : ''} ${late ? 'late' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%`, ['--bar' as string]: color }}
                    title={`${it.name}\n${fmt.dateMedium(s)}${e && e !== s ? ' – ' + fmt.dateMedium(e) : ''} · ${days} day${days === 1 ? '' : 's'}\n${POST_STATUSES.find((x) => x.value === it.status)?.label ?? ''}${it.owner ? ' · ' + it.owner : ''}`}
                  >
                    {days > 2 && <span>{days}d</span>}
                  </div>
                ) : (
                  <span className="post-gantt-nodate">No dates</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- generate dates */

function GenerateDatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fmt = useFormatters();
  const items = useProject((p) => p.post.schedule);
  const delivery = useProject((p) => p.meta.deliveryDate);
  const [start, setStart] = useState<string | undefined>();
  const [lockTarget, setLockTarget] = useState<string | undefined>();
  const [skip, setSkip] = useState(true);
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = getProject();
    const days = dayDates(p).filter(isISO).sort();
    const shootEnd = isISO(p.meta.shootEnd) ? p.meta.shootEnd : days[days.length - 1];
    setStart(shootEnd ? addDays(shootEnd, 1) : todayISO());
    const lockMs = p.milestones.find((m) => /picture lock/i.test(m.name) && isISO(m.date));
    setLockTarget(lockMs?.date);
    setOnlyEmpty(false);
  }, [open]);

  const result = useMemo(() => (start && isISO(start) ? generateSchedule(items, { start, lockTarget: isISO(lockTarget) ? lockTarget : undefined, skipWeekends: skip }) : null), [items, start, lockTarget, skip]);
  const last = result?.rows.map((r) => r.end).sort().pop();
  const late = isISO(delivery) && last && last > delivery;
  const keeps = (id: string) => {
    const it = items.find((x) => x.id === id);
    return onlyEmpty && !!(it?.start || it?.end);
  };

  const apply = () => {
    if (!result) return;
    update((d) => {
      for (const r of result.rows) {
        const it = d.post.schedule.find((x) => x.id === r.id);
        if (!it) continue;
        if (onlyEmpty && (it.start || it.end)) continue;
        it.start = r.start;
        it.end = r.end;
      }
    });
    toast('Post schedule dates generated');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Generate post schedule dates"
      footer={
        <>
          {late && <span className="post-warn small">Ends {fmt.dateMedium(last)} — after the delivery date ({fmt.dateMedium(delivery)}).</span>}
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={WandSparkles} onClick={apply} disabled={!result}>
            Apply dates
          </Button>
        </>
      }
    >
      <div className="post-gen">
        <p className="muted" style={{ marginTop: 0 }}>
          Editorial steps run one after another up to picture lock; music &amp; sound, colour and graphics run in parallel after lock, followed by the mix, QC and delivery. Default durations are industry
          rules of thumb — adjust any date afterwards.
        </p>
        <div className="post-gen-fields">
          <Field label="Post starts" hint="Default: the day after the shoot wraps">
            <DateInput value={start} onChange={setStart} />
          </Field>
          <Field label="Picture lock target (optional)" hint="Editorial steps are scaled to land on this date">
            <DateInput value={lockTarget} onChange={setLockTarget} />
          </Field>
          <div className="col" style={{ gap: 10, paddingTop: 20 }}>
            <Switch checked={skip} onChange={setSkip} label="Skip weekends" />
            <Switch checked={onlyEmpty} onChange={setOnlyEmpty} label="Only fill empty dates" />
          </div>
        </div>
        {result?.warning && <div className="post-warn small">{result.warning}</div>}
        {result && (
          <table className="table post-gen-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Start</th>
                <th>End</th>
                <th className="num">Work days</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className={keeps(r.id) ? 'post-gen-keep' : undefined}>
                  <td>{r.name || 'Untitled'}</td>
                  <td>{keeps(r.id) ? <span className="muted">keeps current dates</span> : fmt.dateShort(r.start)}</td>
                  <td>{keeps(r.id) ? '' : fmt.dateShort(r.end)}</td>
                  <td className="num">{keeps(r.id) ? '' : r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
