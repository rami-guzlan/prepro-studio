/* Per-exercise progress: top-set weight and estimated 1RM (Epley) over time with
   a dashed projection towards a strength target, volume per session, the
   session table, and every lift's best (PR board). */
import { useMemo } from 'react';
import { ChartLine, Trophy } from 'lucide-react';
import { Card, DataTable, EmptyState, Select, Toolbar, type Column } from '@/ui';
import { BarChart, LineChart, StatTile, type LineSeries } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { addDays, diffDays } from '@/lib/dates';
import { bestLifts, exerciseHistory, recentPRs, round, strengthProjection, strengthTrend, type ExercisePoint, type PR } from '../../calc';
import { useToday, useTraining, useUnits } from '../../ui';

export function ExerciseProgress({ exerciseId, setExerciseId, onOpenSession }: { exerciseId?: string; setExerciseId: (id: string) => void; onOpenSession: (id: string) => void }) {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const used = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of t.sessions) for (const id of new Set(s.sets.filter((x) => x.done !== false).map((x) => x.exerciseId))) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, name: t.exercises.find((e) => e.id === id)?.name ?? '(deleted exercise)' }));
  }, [t]);
  const id = exerciseId && used.some((x) => x.id === exerciseId) ? exerciseId : used[0]?.id;
  const hist = useMemo(() => (id ? exerciseHistory(t, id) : []), [t, id]);
  const st = useMemo(() => (id ? strengthTrend(t, id, today) : { points: 0 }), [t, id, today]);
  const goal = t.goals.find((g) => g.kind === 'strength' && g.exerciseId === id && g.status === 'active');
  const projected = goal?.target != null ? strengthProjection(st, goal.target, today) : undefined;
  const best = hist.reduce<ExercisePoint | undefined>((a, b) => ((b.e1rm ?? 0) > (a?.e1rm ?? 0) ? b : a), undefined);
  const heaviest = hist.reduce<ExercisePoint | undefined>((a, b) => (b.topKg > (a?.topKg ?? -1) ? b : a), undefined);
  const lifts = useMemo(() => bestLifts(t), [t]);
  const recent = useMemo(() => new Set(recentPRs(t, addDays(today, -27), today).map((p) => p.exerciseId)), [t, today]);

  const series = useMemo<LineSeries[]>(() => {
    const conv = (kg: number) => round(u.fromKg(kg)!, 1);
    const out: LineSeries[] = [
      { id: 'top', label: 'Top set', points: hist.map((p) => ({ x: p.date, y: conv(p.topKg) })), slot: 0 },
      { id: 'e1rm', label: 'Estimated 1RM', points: hist.filter((p) => p.e1rm != null).map((p) => ({ x: p.date, y: conv(p.e1rm!) })), slot: 1 },
    ];
    if (st.current != null && st.ratePerWeek && st.ratePerWeek > 0 && hist.length) {
      const last = hist[hist.length - 1].date;
      const end = projected && projected > last ? projected : addDays(last, 56);
      const capped = diffDays(last, end) > 365 ? addDays(last, 365) : end;
      const days = diffDays(last, capped);
      out.push({ id: 'proj', label: 'Projection', slot: 1, dashed: true, points: [{ x: last, y: conv(st.current) }, { x: capped, y: conv(st.current + (st.ratePerWeek / 7) * days) }] });
    }
    return out;
  }, [hist, st, projected, u]);

  if (!used.length)
    return (
      <div className="tr-page">
        <EmptyState icon={ChartLine} title="Progress shows up after your first sessions" description="Every logged set feeds the charts: heaviest set, estimated 1RM (Epley: weight × (1 + reps ÷ 30)) and volume per session, plus your PRs." />
      </div>
    );

  const prCols: Column<PR & { id: string }>[] = [
    { key: 'name', header: 'Exercise', type: 'readonly', minWidth: 150, render: (r) => <b>{r.name}</b> },
    { key: 'e1rm', header: 'Best e1RM', type: 'readonly', width: 100, align: 'right', render: (r) => u.weight(r.e1rm), sortValue: (r) => r.e1rm },
    { key: 'kg', header: 'Set', type: 'readonly', width: 110, align: 'right', render: (r) => `${u.weightNum(r.kg)} × ${r.reps}` },
    { key: 'date', header: 'Date', type: 'readonly', width: 100, render: (r) => fmt.dateShort(r.date) },
    { key: 'recent', header: '', type: 'readonly', width: 70, render: (r) => (recent.has(r.exerciseId) ? <span className="tr-pill good"><Trophy size={11} /> new</span> : null) },
  ];

  const histCols: Column<ExercisePoint & { id: string }>[] = [
    { key: 'date', header: 'Date', type: 'readonly', width: 100, render: (r) => fmt.dateShort(r.date) },
    { key: 'topKg', header: 'Top set', type: 'readonly', width: 110, align: 'right', render: (r) => `${u.weightNum(r.topKg)} × ${r.topReps}` },
    { key: 'e1rm', header: 'e1RM', type: 'readonly', width: 90, align: 'right', render: (r) => (r.e1rm != null ? u.weightNum(r.e1rm) : '') },
    { key: 'sets', header: 'Sets', type: 'readonly', width: 56, align: 'right' },
    { key: 'reps', header: 'Reps', type: 'readonly', width: 56, align: 'right' },
    { key: 'volume', header: 'Volume', type: 'readonly', width: 90, align: 'right', render: (r) => u.weightNum(r.volume, 0) },
  ];

  return (
    <>
      <Toolbar>
        <Select value={id ?? ''} onChange={setExerciseId} options={used.map((x) => ({ value: x.id, label: `${x.name} (${x.n})` }))} aria-label="Exercise" style={{ minWidth: 220 }} />
        <div className="spacer" />
        <span className="muted small">e1RM = weight × (1 + reps ÷ 30)</span>
      </Toolbar>
      <div className="tr-page">
        <div className="tr-stats">
          <StatTile label="Best e1RM" value={best?.e1rm != null ? u.weight(best.e1rm) : '—'} sub={best ? fmt.dateMedium(best.date) : undefined} />
          <StatTile label="Heaviest set" value={heaviest ? `${u.weight(heaviest.topKg)} × ${heaviest.topReps}` : '—'} sub={heaviest ? fmt.dateMedium(heaviest.date) : undefined} />
          <StatTile label="Trend" value={st.ratePerWeek != null ? `${u.delta(st.ratePerWeek)}/wk` : '—'} sub="e1RM, last 8 weeks" deltaGood={st.ratePerWeek != null ? st.ratePerWeek >= 0 : undefined} />
          <StatTile label={goal ? `Target ${u.weight(goal.target)}` : 'Target'} value={goal ? (projected ? (projected === today ? 'Reached' : fmt.dateMedium(projected)) : 'Not on pace') : '—'} sub={goal ? (goal.targetDate ? `goal date ${fmt.dateMedium(goal.targetDate)}` : 'projected') : 'add a strength target in Goals'} />
        </div>
        <div className="tr-cols">
          <div className="tr-col">
            <Card title="Top set & estimated 1RM">
              <LineChart series={series} height={240} yFormat={(v) => `${Math.round(v)}`} xFormat={(x) => (typeof x === 'string' ? fmt.dateShort(x).replace(/^\w+ /, '') : String(x))} target={goal?.target != null ? { y: round(u.fromKg(goal.target)!, 1), label: `Target ${u.weight(goal.target, 0)}` } : undefined} ariaLabel={`Top set and estimated one-rep max in ${u.w}`} />
            </Card>
            <Card title={`Volume per session (${u.w} × reps)`}>
              <BarChart data={hist.slice(-24).map((p) => ({ label: fmt.dateShort(p.date).replace(/^\w+ /, ''), value: Math.round(u.fromKg(p.volume)!), title: `${fmt.dateMedium(p.date)} · ${p.sets} sets · ${p.reps} reps` }))} height={160} slot={2} ariaLabel="Volume per session" />
            </Card>
            <Card title="Sessions" padded={false}>
              <div className="tr-scroll-x">
                <DataTable rows={[...hist].reverse().map((p) => ({ ...p, id: p.sessionId }))} columns={histCols} onRowClick={(r) => onOpenSession(r.sessionId)} />
              </div>
            </Card>
          </div>
          <div className="tr-col">
            <Card title="Personal records" padded={false}>
              <div className="tr-scroll-x">
                <DataTable rows={lifts.map((p) => ({ ...p, id: p.exerciseId }))} columns={prCols} onRowClick={(r) => setExerciseId(r.exerciseId)} selectedId={id} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
