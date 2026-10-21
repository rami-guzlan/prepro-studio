/* Time: a start / stop timer that survives restarts, manual entries, a week
   view with totals, billable vs non-billable and unbilled time → invoices. */
import '../../biz.css';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, FileText, Play, Plus, Square, X } from 'lucide-react';
import { useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { addDays, weekdayShort } from '@/lib/dates';
import { safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Button, Card, Checkbox, DataTable, ExportMenu, IconButton, Input, Menu, ModuleHeader, Select, Switch, Toolbar, toast, type Column, type MenuItem } from '@/ui';
import { BarChart, StatTile } from '@/ui/charts';
import { clientLabel, entryRate, entryValue, formatDuration, inRange, minutesBetween, minutesIn, parseDuration, periodRange, sumAmount, timerMinutes, unbilledEntries, weekStartOf } from '../../derive';
import { addItem, addUnbilledTime, createInvoice, discardTimer, makeTimeEntry, removeItems, startTimer, stopTimer, updateItem, updateTimer } from '../../ops';
import { clientOptions, useBiz, useFmt, useNavParams, useTick, useToday } from '../../ui';
import type { RunningTimer, TimeEntry } from '../../types';
import { ProjectSelect, projectName } from '../projects/link';

function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(formatDuration(minutes));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(formatDuration(minutes));
  }, [minutes, focus]);
  return (
    <input
      className="input bare sm biz-dur"
      value={text}
      aria-label="Duration"
      onFocus={(e) => {
        setFocus(true);
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        setText(e.target.value);
        const m = parseDuration(e.target.value);
        if (m != null) onChange(m);
      }}
      onBlur={() => setFocus(false)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const clock = (mins: number, secs: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

function TimerCard() {
  const b = useBiz();
  const fmt = useFmt();
  const t = b.timer;
  const now = useTick(!!t, 1000);
  const [desc, setDesc] = useState('');
  const [client, setClient] = useState('');
  const [proj, setProj] = useState('');
  const start = () => {
    const next: Omit<RunningTimer, 'startedAt'> = { description: desc.trim() || undefined, clientId: client || undefined, billable: true, ...(proj ? { bizProjectId: proj } : {}) };
    startTimer(next);
    setDesc('');
  };
  const pickProject = (id: string | undefined, running: boolean) => {
    const pr = id ? b.projects.find((x) => x.id === id) : undefined;
    if (running) updateTimer({ bizProjectId: id, ...(pr?.clientId && !t?.clientId ? { clientId: pr.clientId } : {}) });
    else {
      setProj(id ?? '');
      if (pr?.clientId && !client) setClient(pr.clientId);
    }
  };
  const timerProject = t?.bizProjectId;
  if (t) {
    const ms = Math.max(0, now - Date.parse(t.startedAt));
    const mins = timerMinutes(t, now);
    const rate = entryRate(b, { clientId: t.clientId });
    return (
      <div className={`biz-timer on ${b.projects.length ? 'wk-timer-proj' : ''}`}>
        <div className="biz-timer-clock" aria-live="off">
          <span className="biz-timer-dot" />
          {clock(mins, Math.floor((ms / 1000) % 60))}
        </div>
        <Input value={t.description} placeholder="What are you working on?" onChange={(v) => updateTimer({ description: v || undefined })} />
        <Select value={t.clientId ?? ''} placeholder="No client" options={clientOptions(b, t.clientId)} onChange={(v) => updateTimer({ clientId: v || undefined })} aria-label="Client" />
        {b.projects.length > 0 && <ProjectSelect value={timerProject} onChange={(id) => pickProject(id, true)} />}
        <Switch checked={t.billable !== false} onChange={(v) => updateTimer({ billable: v })} label={t.billable !== false && rate ? `Billable · ${fmt.money(rate)}/h` : 'Billable'} />
        <div className="biz-timer-actions">
          <IconButton icon={X} label="Discard timer" onClick={() => discardTimer()} />
          <Button
            variant="danger-solid"
            icon={Square}
            onClick={() => {
              const e = stopTimer();
              if (e && timerProject && b.projects.some((x) => x.id === timerProject)) updateItem('time', e.id, { bizProjectId: timerProject }, false);
              if (e) toast(`Logged ${formatDuration(e.minutes)}${e.clientId ? ` for ${clientLabel(b, e.clientId)}` : ''}`);
            }}
          >
            Stop
          </Button>
        </div>
        <span className="muted tiny biz-timer-since">Started {new Date(t.startedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · keeps running if you close the app</span>
      </div>
    );
  }
  return (
    <div className={`biz-timer ${b.projects.length ? 'wk-timer-proj' : ''}`}>
      <div className="biz-timer-clock muted">0:00:00</div>
      <Input value={desc} placeholder="What are you working on?" onChange={setDesc} onKeyDown={(e) => e.key === 'Enter' && start()} />
      <Select value={client} placeholder="No client" options={clientOptions(b)} onChange={setClient} aria-label="Client" />
      {b.projects.length > 0 && <ProjectSelect value={proj} onChange={(id) => pickProject(id, false)} />}
      <div className="biz-timer-actions">
        <Button variant="primary" icon={Play} onClick={start}>
          Start timer
        </Button>
      </div>
    </div>
  );
}

export default function TimeModule() {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const mondayFirst = useSpace((s) => s.settings.weekStartsMonday);
  const title = useSpace((s) => s.meta.title);
  const [weekOf, setWeekOf] = useState(() => weekStartOf(today, mondayFirst));
  const [all, setAll] = useState(false);
  const [client, setClient] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useNavParams((p) => {
    if (p.entryId) {
      const e = b.time.find((x) => x.id === p.entryId);
      if (e) {
        setWeekOf(weekStartOf(e.date, mondayFirst));
        setAll(false);
        setFlash(e.id);
      }
    }
    if (p.new) {
      const pr = p.bizProjectId ? b.projects.find((x) => x.id === p.bizProjectId) : undefined;
      const cid = p.clientId && b.clients.some((c) => c.id === p.clientId) ? String(p.clientId) : pr?.clientId;
      const e = makeTimeEntry({ clientId: cid, ...(pr ? { bizProjectId: pr.id } : {}) });
      addItem('time', e, 0);
      setWeekOf(weekStartOf(e.date, mondayFirst));
      setAll(false);
      setFlash(e.id);
    }
  });

  const week = { from: weekOf, to: addDays(weekOf, 6) };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
  const rows = useMemo(
    () =>
      b.time
        .filter((t) => (all || inRange(t.date, week)) && (!client || (client === '_none' ? !t.clientId : t.clientId === client)))
        .sort((a, z) => z.date.localeCompare(a.date) || (z.start ?? '').localeCompare(a.start ?? '')),
    [b.time, all, weekOf, client],
  );
  const weekMins = minutesIn(b, week);
  const weekBill = minutesIn(b, week, (t) => t.billable);
  const monthMins = minutesIn(b, periodRange('this_month', today));
  const unbilled = unbilledEntries(b);
  const unbilledValue = sumAmount(unbilled.map((e) => ({ amount: entryValue(b, e) })));
  const byClient = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of unbilled) m.set(e.clientId ?? '', [...(m.get(e.clientId ?? '') ?? []), e]);
    return [...m.entries()];
  }, [unbilled]);

  const invoiceFor = (clientId: string) => {
    const inv = createInvoice({ clientId: clientId || undefined });
    const n = addUnbilledTime(inv.id, (d) => fmt.dateShort(d));
    toast(`Invoice ${inv.number} created with ${n} time ${n === 1 ? 'entry' : 'entries'}`);
    navigateSpace('invoices', { invoiceId: inv.id });
  };

  const invoiceMenu: MenuItem[] = byClient.length
    ? byClient.map(([cid, es]) => ({
        label: `${cid ? clientLabel(b, cid) : 'No client'} · ${formatDuration(es.reduce((n, e) => n + e.minutes, 0))} · ${fmt.money(sumAmount(es.map((e) => ({ amount: entryValue(b, e) }))))}`,
        icon: FileText,
        onClick: () => invoiceFor(cid),
      }))
    : [{ label: 'No unbilled billable time', disabled: true }];

  const addEntry = () => {
    const date = inRange(today, week) ? today : weekOf;
    const e = makeTimeEntry({ date, clientId: client && client !== '_none' ? client : undefined });
    addItem('time', e, 0);
    setFlash(e.id);
  };

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Time`), rows, [
      { header: 'Date', value: (t) => t.date },
      { header: 'Start', value: (t) => t.start },
      { header: 'End', value: (t) => t.end },
      { header: 'Hours', value: (t) => (t.minutes / 60).toFixed(2) },
      { header: 'Client', value: (t) => clientLabel(b, t.clientId) },
      { header: 'Description', value: (t) => t.description },
      { header: 'Billable', value: (t) => (t.billable ? 'yes' : 'no') },
      { header: 'Rate', value: (t) => (t.billable ? entryRate(b, t) : '') },
      { header: 'Amount', value: (t) => entryValue(b, t) },
      { header: 'Invoice', value: (t) => b.invoices.find((i) => i.id === t.invoiceId)?.number },
      { header: 'Project', value: (t) => projectName(b, t.bizProjectId) },
    ]);
    if (path) toast(`Exported ${rows.length} entries`);
  };

  const setTimes = (e: TimeEntry, patch: Partial<TimeEntry>) => {
    const next = { ...e, ...patch };
    const m = minutesBetween(next.start, next.end);
    updateItem('time', e.id, { ...patch, ...(m != null ? { minutes: m } : {}) }, false);
  };

  const cols: Column<TimeEntry>[] = [
    { key: 'date', header: 'Date', type: 'date', width: 140, footer: all ? 'All time' : 'Week' },
    { key: 'start', header: 'Start', width: 104, render: (e) => <input type="time" className="input bare sm" value={e.start ?? ''} onChange={(ev) => setTimes(e, { start: ev.target.value || undefined })} aria-label="Start" /> },
    { key: 'end', header: 'End', width: 104, render: (e) => <input type="time" className="input bare sm" value={e.end ?? ''} onChange={(ev) => setTimes(e, { end: ev.target.value || undefined })} aria-label="End" /> },
    { key: 'minutes', header: 'Duration', width: 96, sortValue: (e) => e.minutes, render: (e) => <DurationInput minutes={e.minutes} onChange={(m) => updateItem('time', e.id, { minutes: m, end: undefined })} />, footer: formatDuration(rows.reduce((n, t) => n + t.minutes, 0)) },
    { key: 'clientId', header: 'Client', type: 'select', options: clientOptions(b), width: 170, placeholder: '—' },
    { key: 'bizProjectId', header: 'Project', width: 160, render: (e) => <ProjectSelect bare size="sm" placeholder="—" value={e.bizProjectId} onChange={(id) => updateItem('time', e.id, { bizProjectId: id }, false)} /> },
    { key: 'description', header: 'Description', type: 'text', minWidth: 180, placeholder: 'What you did' },
    { key: 'billable', header: 'Billable', type: 'checkbox', width: 72, align: 'center' },
    { key: 'rate', header: 'Rate/h', type: 'money', width: 104, placeholder: '' },
    { key: 'amount', header: 'Amount', width: 104, align: 'right', sortValue: (e) => entryValue(b, e), render: (e) => (e.billable ? <span className="biz-money">{fmt.money(entryValue(b, e))}</span> : <span className="muted small">—</span>), footer: fmt.money(sumAmount(rows.map((e) => ({ amount: entryValue(b, e) })))) },
    {
      key: 'invoice',
      header: 'Invoice',
      width: 104,
      render: (e) => {
        const inv = b.invoices.find((i) => i.id === e.invoiceId);
        if (inv)
          return (
            <button type="button" className="biz-link biz-mono" onClick={() => navigateSpace('invoices', { invoiceId: inv.id })}>
              {inv.number}
            </button>
          );
        return e.billable ? <span className="biz-tag">Unbilled</span> : null;
      },
    },
  ];

  const dayData = days.map((d) => ({ d, mins: b.time.filter((t) => t.date === d).reduce((n, t) => n + t.minutes, 0), bill: b.time.filter((t) => t.date === d && t.billable).reduce((n, t) => n + t.minutes, 0) }));

  return (
    <div className="module biz">
      <ModuleHeader
        title="Time"
        icon={Clock}
        subtitle={`${formatDuration(weekMins)} this week · ${formatDuration(unbilled.reduce((n, e) => n + e.minutes, 0))} unbilled (${fmt.money(unbilledValue)})`}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-biz-time', label: 'Time report (this month)', options: { period: 'this_month' } }]} csv={[{ label: 'Entries shown (CSV)', onClick: () => void exportList() }]} />
            <Menu align="end" trigger={<Button icon={FileText}>Invoice unbilled</Button>} items={invoiceMenu} />
            <Button variant="primary" icon={Plus} onClick={addEntry}>
              Add entry
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="biz-page">
          <TimerCard />
          <div className="biz-kpis">
            <StatTile label="This week" value={formatDuration(weekMins)} sub={`${formatDuration(weekBill)} billable`} />
            <StatTile label="Billable share" value={weekMins ? `${Math.round((weekBill / weekMins) * 100)}%` : '—'} sub="this week" />
            <StatTile label="This month" value={formatDuration(monthMins)} />
            <StatTile label="Unbilled" value={fmt.money(unbilledValue, { cents: false })} sub={`${unbilled.length} entries`} />
          </div>
          <Card
            title={
              <span className="row" style={{ gap: 6 }}>
                <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeekOf(addDays(weekOf, -7))} />
                <span>
                  Week of {fmt.dateMedium(weekOf)}
                </span>
                <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeekOf(addDays(weekOf, 7))} />
              </span>
            }
            actions={
              weekOf !== weekStartOf(today, mondayFirst) ? (
                <Button size="sm" variant="ghost" onClick={() => setWeekOf(weekStartOf(today, mondayFirst))}>
                  This week
                </Button>
              ) : undefined
            }
          >
            <div className="biz-week">
              {dayData.map(({ d, mins, bill }) => (
                <div key={d} className={`biz-day ${d === today ? 'today' : ''}`}>
                  <span className="biz-day-name">
                    {weekdayShort(d)} <span className="muted biz-day-date">{fmt.dateShort(d).replace(/^\S+\s/, '')}</span>
                  </span>
                  <b>{mins ? formatDuration(mins) : '—'}</b>
                  {mins > 0 && <span className="muted tiny">{formatDuration(bill)} billable</span>}
                </div>
              ))}
            </div>
            <BarChart ariaLabel="Hours per day this week" height={120} data={dayData.map(({ d, mins }) => ({ label: weekdayShort(d), title: fmt.dateMedium(d), value: Math.round((mins / 60) * 100) / 100 }))} yFormat={(v) => `${Math.round(v * 10) / 10}h`} />
          </Card>
          <Toolbar style={{ padding: '0', border: 0, background: 'none' }}>
            <Checkbox checked={all} onChange={setAll} label="Show all entries (not just this week)" />
            <div className="spacer" />
            <Select size="sm" value={client} placeholder="All clients" options={[...clientOptions(b), { value: '_none', label: 'No client' }]} onChange={setClient} aria-label="Client filter" />
          </Toolbar>
          <DataTable<TimeEntry>
            rows={rows}
            columns={cols}
            onChange={(id, patch) => updateItem('time', id, patch as Partial<TimeEntry>)}
            onDelete={(e) => removeItems('time', [e.id])}
            selectedId={flash ?? undefined}
            showFooter
            emptyText={
              <span>
                No time logged {all ? 'yet' : 'this week'}. Start the timer or{' '}
                <button type="button" className="biz-link" onClick={addEntry}>
                  add an entry
                </button>
                .
              </span>
            }
          />
          <p className="muted small" style={{ margin: 0 }}>
            Durations accept “1:30”, “1h 30m”, “90m” or “1.5”. Empty rates use the client’s rate, then your default rate ({b.settings.hourlyRate ? `${fmt.money(b.settings.hourlyRate)}/h` : 'not set'}).
          </p>
        </div>
      </div>
    </div>
  );
}

