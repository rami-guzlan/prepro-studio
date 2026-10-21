/* Library tab "Training": today's snapshot (streak, weight trend, today's
   workout and meals, photo taken?) with Open Training and Quick check-in. The
   first time it explains the section and creates it on open. */
import './training.css';
import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Dumbbell, Flame, MessageSquareHeart, Salad, Sun, Target } from 'lucide-react';
import { Button, EmptyState } from '@/ui';
import { Sparkline, StatTile } from '@/ui/charts';
import { backend } from '@/backend';
import { navigateSpace } from '@/store/app';
import { makeFormatters } from '@/lib/format';
import { addDays, todayISO } from '@/lib/dates';
import { openSingleton } from '@/shell/spaceActions';
import { normalizeTraining, type TrainingData } from './types';
import { avgSeries, countIn, dayEaten, loggedDates, mealMap, plannedDaysOn, sessionState, sessionStats, streak, suggestedDay, weightSeries, weightTrend, workoutDates } from './calc';
import { unitKit } from './units';

type State = { status: 'loading' } | { status: 'none' } | { status: 'ready'; t: TrainingData; title: string; settings?: { dateFormat?: 'MDY' | 'DMY' | 'YMD' } } | { status: 'error'; message: string };

export default function TrainingHomePanel() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const hit = (await backend.listSpaces()).find((x) => x.kind === 'training');
        if (!hit) {
          if (alive) setState({ status: 'none' });
          return;
        }
        const s = await backend.loadSpace(hit.id);
        if (alive) setState({ status: 'ready', t: normalizeTraining(s.training), title: s.meta?.title ?? 'Training', settings: s.settings });
      } catch (e) {
        if (alive) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const open = async (module = 'overview', params?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const ok = await openSingleton('training', module);
      if (ok && params) navigateSpace(module, params);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') return <div className="muted">Loading…</div>;
  if (state.status === 'error')
    return (
      <div className="card" style={{ padding: 16 }}>
        <p className="muted">Could not read Training: {state.message}</p>
        <Button onClick={() => open()}>Open Training</Button>
      </div>
    );
  if (state.status === 'none')
    return (
      <div className="card" style={{ padding: 12 }}>
        <EmptyState
          icon={Dumbbell}
          title="Your training, nutrition and progress in one place"
          description="Meal plan with your common meals and an automatic grocery list, a macro calculator, your workout program with set-by-set logging and PR charts, body metrics, daily progress photos that play back as a timelapse video, daily check-ins, and a coach that projects where you'll be. Log it here or just tell your connected AI."
          action={
            <Button variant="primary" size="lg" icon={Dumbbell} onClick={() => open()} disabled={busy}>
              {busy ? 'Setting up…' : 'Set up Training'}
            </Button>
          }
        />
      </div>
    );
  return <Snapshot t={state.t} dateFormat={state.settings?.dateFormat} busy={busy} onOpen={open} />;
}

function Snapshot({ t, dateFormat, busy, onOpen }: { t: TrainingData; dateFormat?: 'MDY' | 'DMY' | 'YMD'; busy: boolean; onOpen: (module?: string, params?: Record<string, unknown>) => void }) {
  const today = todayISO();
  const fmt = useMemo(() => makeFormatters({ dateFormat }), [dateFormat]);
  const u = unitKit(t.profile.units);
  const st = streak(loggedDates(t), today);
  const tr = weightTrend(t);
  const trend = avgSeries(weightSeries(t)).slice(-30).map((p) => p.kg);
  const meals = mealMap(t);
  const planToday = t.plan.filter((e) => e.date === today);
  const eaten = dayEaten(t, today, meals);
  const done = t.sessions.find((s) => s.date === today && sessionState(s) === 'finished');
  const planned = plannedDaysOn(t, today);
  const next = suggestedDay(t, today);
  const photo = t.photos.some((p) => p.date === today);
  const w7 = countIn(workoutDates(t), addDays(today, -6), today);

  return (
    <div className="tr-home">
      <div className="tr-home-head">
        <div className="tr-home-streak">
          <Flame size={22} />
          <div>
            <b>{st.current}-day streak</b>
            <span className="muted small">{st.loggedToday ? 'Logged today — nice.' : st.current ? 'Check in today to keep it going.' : 'Start a streak with a quick check-in.'}</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={MessageSquareHeart} size="lg" onClick={() => onOpen('overview', { checkin: true })} disabled={busy}>
            Quick check-in
          </Button>
          <Button variant="primary" icon={Sun} size="lg" onClick={() => onOpen('overview')} disabled={busy}>
            Open Training
          </Button>
        </div>
      </div>
      <div className="tr-stats">
        <div className="viz-stat">
          <span className="viz-stat-label">Weight (7-day avg)</span>
          <span className="viz-stat-value">{tr ? u.weight(tr.trendKg) : '—'}</span>
          <span className="viz-stat-sub">
            {trend.length >= 2 && <Sparkline values={trend} ariaLabel="Weight trend" />} {tr?.ratePerWeek != null ? `${u.delta(tr.ratePerWeek)}/wk` : tr ? `last ${fmt.dateShort(tr.latest.date)}` : 'no weigh-ins yet'}
          </span>
        </div>
        <StatTile label="Goal" value={tr?.toGo != null ? `${u.weight(Math.abs(tr.toGo))} to go` : t.goal.statement ? 'Set' : 'Not set'} sub={tr?.projectedDate ? `≈ ${fmt.dateMedium(tr.projectedDate)}` : undefined} onClick={() => onOpen('goals')} />
        <StatTile label="Workouts (7 days)" value={t.goal.workoutsPerWeek ? `${w7} / ${t.goal.workoutsPerWeek}` : String(w7)} onClick={() => onOpen('workouts', { tab: 'history' })} />
        <StatTile label="Eaten today" value={`${Math.round(eaten.calories)} kcal`} sub={t.macros.calories ? `of ${t.macros.calories} · ${Math.round(eaten.protein)} g protein` : undefined} onClick={() => onOpen('nutrition', { tab: 'log' })} />
      </div>
      <div className="tr-home-today">
        <button type="button" className="tr-home-item" onClick={() => onOpen('workouts', { tab: 'log' })}>
          {done ? <CheckCircle2 size={18} className="tr-ok" /> : <Dumbbell size={18} />}
          <span>
            <b>{done ? `${done.name || 'Workout'} done` : planned.length ? `Today: ${planned.map((d) => d.name).join(', ')}` : next ? `Next up: ${next.name}` : 'No program yet'}</b>
            <span className="muted small">{done ? `${sessionStats(done).sets} sets` : planned.length || next ? 'Tap to start' : 'Build one in Workouts'}</span>
          </span>
        </button>
        <button type="button" className="tr-home-item" onClick={() => onOpen('nutrition', { tab: 'plan' })}>
          <Salad size={18} />
          <span>
            <b>{planToday.length ? `${planToday.filter((e) => e.eaten).length}/${planToday.length} meals eaten` : 'No meals planned'}</b>
            <span className="muted small">{planToday.length ? planToday.map((e) => (e.mealId ? meals.get(e.mealId)?.name : e.text) ?? '').filter(Boolean).slice(0, 3).join(', ') : 'Plan the week'}</span>
          </span>
        </button>
        <button type="button" className="tr-home-item" onClick={() => onOpen('photos', photo ? undefined : { capture: true })}>
          {photo ? <CheckCircle2 size={18} className="tr-ok" /> : <Camera size={18} />}
          <span>
            <b>{photo ? 'Photo taken today' : 'No photo today'}</b>
            <span className="muted small">{photo ? `${t.photos.length} photos so far` : 'Take today’s progress photo'}</span>
          </span>
        </button>
        {t.goal.statement && (
          <button type="button" className="tr-home-item" onClick={() => onOpen('goals')}>
            <Target size={18} />
            <span>
              <b className="ellipsis">{t.goal.statement}</b>
              <span className="muted small">{tr?.projectedDate ? `On pace for ${fmt.dateMedium(tr.projectedDate)}` : 'Your goal'}</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
