/* Session history: every logged workout with sets, volume, duration and PRs;
   weekly volume chart; repeat a session today; CSV export. */
import { useMemo, useState } from 'react';
import { Bot, Copy, FileDown, History as HistoryIcon, Trash2, Trophy } from 'lucide-react';
import { Button, Card, confirmDialog, DataTable, EmptyState, SearchInput, toast, Toolbar, type Column } from '@/ui';
import { BarChart } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { safeFileName } from '@/lib/text';
import { uid } from '@/lib/id';
import { exportCsv } from '@/backend';
import type { Session } from '../../types';
import { exerciseMap, prSessionIds, sessionDone, sessionExerciseOrder, sessionStats, weeklyVolume } from '../../calc';
import { updateTraining } from '../../ops';
import { useMondayFirst, useToday, useTraining, useUnits } from '../../ui';

interface Row {
  id: string;
  date: string;
  name: string;
  exercises: string;
  sets: number;
  volume: number;
  durationMin?: number;
  rpe?: number;
  prs: number;
  source?: string;
  s: Session;
}

export function SessionHistory({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const mondayFirst = useMondayFirst();
  const [q, setQ] = useState('');
  const ex = useMemo(() => exerciseMap(t), [t]);
  const prKeys = useMemo(() => prSessionIds(t), [t]);
  const rows = useMemo<Row[]>(() => {
    const dayName = new Map(t.program.days.map((d) => [d.id, d.name]));
    const s = q.trim().toLowerCase();
    return [...t.sessions]
      .filter(sessionDone)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((x) => {
        const st = sessionStats(x);
        const order = sessionExerciseOrder(x);
        return {
          id: x.id,
          date: x.date,
          name: x.name || (x.dayId ? dayName.get(x.dayId) : undefined) || 'Workout',
          exercises: order.map((id) => ex.get(id)?.name ?? '?').join(', '),
          sets: st.sets,
          volume: st.volume,
          durationMin: x.durationMin,
          rpe: x.rpe,
          prs: order.filter((id) => prKeys.has(`${id}@${x.date}`)).length,
          source: x.source,
          s: x,
        };
      })
      .filter((r) => !s || r.name.toLowerCase().includes(s) || r.exercises.toLowerCase().includes(s) || (r.s.notes ?? '').toLowerCase().includes(s));
  }, [t, q, ex, prKeys]);
  const weeks = useMemo(() => weeklyVolume(t, today, 12, mondayFirst), [t, today, mondayFirst]);

  if (!rows.length && !q)
    return (
      <div className="tr-page">
        <EmptyState icon={HistoryIcon} title="No workouts logged yet" description="Finished sessions show up here with sets, volume and PRs. Log one on the Log tab, or tell your AI what you did: “bench 3×8 at 80, rows 3×10 at 60, 50 minutes”." />
      </div>
    );

  const repeat = (r: Row) => {
    const id = uid('ses');
    updateTraining((tr) => {
      tr.sessions.push({ id, date: today, dayId: r.s.dayId, name: r.s.name, sets: r.s.sets.filter((x) => x.done !== false).map((x) => ({ ...x, id: uid('set'), done: false, rpe: undefined })), source: 'me' });
      const s = tr.sessions[tr.sessions.length - 1];
      for (const x of s.sets) delete x.rpe;
      if (!s.dayId) delete s.dayId;
      if (!s.name) delete s.name;
    });
    onOpen(id);
  };

  const remove = async (r: Row) => {
    if (!(await confirmDialog({ title: 'Delete this session?', message: `${r.name} on ${fmt.dateMedium(r.date)}. Ctrl+Z brings it back.`, confirmLabel: 'Delete', danger: true }))) return;
    updateTraining((tr) => {
      tr.sessions = tr.sessions.filter((x) => x.id !== r.id);
    });
  };

  const csv = async () => {
    const out = rows.flatMap((r) => r.s.sets.filter((x) => x.done !== false).map((x, i) => ({ r, x, i })));
    const path = await exportCsv(safeFileName('Workout sets'), out, [
      { header: 'Date', value: (o) => o.r.date },
      { header: 'Session', value: (o) => o.r.name },
      { header: 'Exercise', value: (o) => (o.x.exerciseId ? ex.get(o.x.exerciseId)?.name : '') },
      { header: 'Set', value: (o) => o.i + 1 },
      { header: `Weight (${u.w})`, value: (o) => (o.x.kg != null ? u.weightNum(o.x.kg) : '') },
      { header: 'Reps', value: (o) => o.x.reps },
      { header: 'RPE', value: (o) => o.x.rpe },
      { header: 'Seconds', value: (o) => o.x.seconds },
      { header: 'Km', value: (o) => o.x.km },
      { header: 'Warm-up', value: (o) => !!o.x.warmup },
    ]);
    if (path) toast(`Exported ${path.split(/[\\/]/).pop()}`);
  };

  const columns: Column<Row>[] = [
    { key: 'date', header: 'Date', type: 'readonly', width: 110, render: (r) => fmt.dateShort(r.date) },
    {
      key: 'name',
      header: 'Session',
      type: 'readonly',
      minWidth: 140,
      render: (r) => (
        <span className="row" style={{ gap: 6 }}>
          <b>{r.name}</b>
          {r.prs > 0 && (
            <span className="tr-pill good" title={`${r.prs} PR${r.prs === 1 ? '' : 's'}`}>
              <Trophy size={11} /> {r.prs}
            </span>
          )}
          {r.source === 'agent' && <Bot size={13} className="muted" aria-label="Logged by your AI" />}
        </span>
      ),
    },
    { key: 'exercises', header: 'Exercises', type: 'readonly', minWidth: 200, render: (r) => <span className="muted small ellipsis" style={{ display: 'block', maxWidth: 320 }}>{r.exercises}</span> },
    { key: 'sets', header: 'Sets', type: 'readonly', width: 60, align: 'right' },
    { key: 'volume', header: `Volume ${u.w}`, type: 'readonly', width: 100, align: 'right', render: (r) => u.weightNum(r.volume, 0), sortValue: (r) => r.volume },
    { key: 'durationMin', header: 'Min', type: 'readonly', width: 60, align: 'right' },
    { key: 'rpe', header: 'RPE', type: 'readonly', width: 56, align: 'right' },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search sessions, exercises, notes…" width={260} />
        <div className="spacer" />
        <span className="muted small">{rows.length} sessions</span>
        <Button size="sm" icon={FileDown} onClick={csv}>
          Sets CSV
        </Button>
      </Toolbar>
      <div className="tr-page">
        <Card title={`Weekly volume (${u.w} × reps)`}>
          <BarChart data={weeks.map((w) => ({ label: fmt.dateShort(w.weekStart).replace(/^\w+ /, ''), value: Math.round(u.fromKg(w.volume)!), title: `Week of ${fmt.dateMedium(w.weekStart)} · ${w.sessions} session${w.sessions === 1 ? '' : 's'} · ${w.sets} sets` }))} height={170} ariaLabel="Training volume per week" />
        </Card>
        <Card padded={false}>
          <div className="tr-scroll-x">
            <DataTable
              rows={rows}
              columns={columns}
              onRowClick={(r) => onOpen(r.id)}
              rowActions={(r) => [
                { label: 'Open', onClick: () => onOpen(r.id) },
                { label: 'Repeat today', icon: Copy, onClick: () => repeat(r) },
                { separator: true },
                { label: 'Delete', icon: Trash2, danger: true, onClick: () => remove(r) },
              ]}
              emptyText="No sessions match."
            />
          </div>
        </Card>
      </div>
    </>
  );
}
