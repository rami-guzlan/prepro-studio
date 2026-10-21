/* Today: the daily screen. Today's meals and workout, a quick check-in, today's
   photo, streaks + 12-week consistency calendar, weight trend with projection
   and the top insights. Designed to work on a phone-width window. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronRight, Circle, Dumbbell, Flame, ImagePlus, MessageSquareHeart, Play, Salad, Square, Sun } from 'lucide-react';
import { Button, Card, confirmDialog, ExportMenu, ModuleHeader, Select, Tabs, toast, AssetImage } from '@/ui';
import { StatTile } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { addDays } from '@/lib/dates';
import { MEAL_SLOTS, POSES, type Pose } from '../../types';
import {
  countIn,
  dayEaten,
  entryLabel,
  entryMacros,
  insights as buildInsights,
  loggedDates,
  mealMap,
  photoDates,
  plannedDaysOn,
  projectionText,
  sessionDone,
  sessionStats,
  streak,
  suggestedDay,
  weekStreak,
  weightTrend,
  workoutDates,
} from '../../calc';
import { beginSession, endSession, startSession, updateTraining } from '../../ops';
import { sessionState } from '../../calc';
import { storePhoto } from '../../photoStore';
import { go, Heatmap, InsightList, MacroBars, Pill, useMondayFirst, useNavParams, useToday, useTraining, useUnits, WeightChart, type HeatKind } from '../../ui';
import { QuickCheckIn, type CheckInHandle } from './CheckIn';
import { SetupCard } from './Setup';

export default function TrainingToday() {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const mondayFirst = useMondayFirst();
  const params = useNavParams();
  const checkRef = useRef<CheckInHandle>(null);
  const [heat, setHeat] = useState<HeatKind>('logged');

  useEffect(() => {
    if (params.checkin) checkRef.current?.focus();
  }, [params]);

  const meals = useMemo(() => mealMap(t), [t]);
  const logged = useMemo(() => loggedDates(t), [t]);
  const st = useMemo(() => streak(logged, today), [logged, today]);
  const tr = useMemo(() => weightTrend(t), [t]);
  const ins = useMemo(() => buildInsights(t, today, mondayFirst, fmt.dateMedium), [t, today, mondayFirst, fmt]);
  const work = useMemo(() => workoutDates(t), [t]);
  const w7 = countIn(work, addDays(today, -6), today);
  const wStreak = t.goal.workoutsPerWeek ? weekStreak(t, today, t.goal.workoutsPerWeek, mondayFirst) : 0;
  const eaten = useMemo(() => dayEaten(t, today, meals), [t, today, meals]);
  const todayPlan = t.plan.filter((e) => e.date === today);
  const todaySessions = t.sessions.filter((s) => s.date === today);
  const activeToday = todaySessions.find((s) => sessionState(s) === 'active');
  const doneToday = todaySessions.find((s) => sessionState(s) === 'finished');
  /** prepared for today (e.g. by an agent) but not started */
  const readyToday = todaySessions.find((s) => sessionState(s) === 'planned');
  const planned = plannedDaysOn(t, today);
  const next = suggestedDay(t, today);
  const photosToday = t.photos.filter((p) => p.date === today);
  const photoStreak = streak(photoDates(t), today).current;
  const firstRun = !t.profile.heightCm && !t.metrics.length && !t.checkIns.length && !t.sessions.length && !t.meals.length;

  // what's coming up today: a prepared session, else the planned program day, else the next one in rotation
  const upcoming = readyToday ? { name: readyToday.name || t.program.days.find((d) => d.id === readyToday.dayId)?.name || 'Workout', sub: `${readyToday.sets.length} sets ready` } : (planned[0] ?? next) ? { name: (planned[0] ?? next)!.name, sub: (planned[0] ?? next)!.focus || `${(planned[0] ?? next)!.exercises.length} exercises` } : null;

  const startWorkout = () => {
    let id = readyToday?.id ?? '';
    updateTraining((tr2) => {
      if (!id) id = startSession(tr2, today, (planned[0] ?? next)?.id);
      beginSession(tr2, id);
    });
    go('workouts', { tab: 'log', sessionId: id });
  };

  const continueWorkout = () => activeToday && go('workouts', { tab: 'log', sessionId: activeToday.id });

  const stopWorkout = async () => {
    if (!activeToday) return;
    const doneSets = activeToday.sets.filter((x) => x.done !== false).length;
    const pending = activeToday.sets.length - doneSets;
    const ok = await confirmDialog(
      doneSets
        ? { title: 'Stop and save this workout?', message: `${doneSets} set${doneSets === 1 ? '' : 's'} done${pending ? ` — ${pending} not ticked will be removed` : ''}. The duration is filled in from when you started.`, confirmLabel: 'Stop & save' }
        : { title: 'Stop this workout?', message: 'No sets are ticked yet, so the workout is discarded. Ctrl+Z brings it back.', confirmLabel: 'Stop & discard', danger: true },
    );
    if (!ok) return;
    let kept = false;
    updateTraining((tr2) => {
      kept = endSession(tr2, activeToday.id);
    });
    toast(kept ? `${activeToday.name || 'Workout'} saved` : 'Workout discarded', kept ? 'success' : 'info');
  };

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Today"
        icon={Sun}
        subtitle={`${fmt.dateLong(today)}${st.current ? ` · ${st.current}-day streak` : ''}`}
        actions={
          <>
            <Button variant="primary" icon={MessageSquareHeart} onClick={() => checkRef.current?.focus()}>
              Check in
            </Button>
            <ExportMenu docs={[{ id: 'space-train-progress', label: 'Progress report' }, { id: 'space-train-meal-plan', label: 'This week’s meal plan' }, { id: 'space-train-program', label: 'Workout program' }]} />
          </>
        }
      />
      <div className="module-body">
        <div className="tr-page">
          {firstRun && <SetupCard today={today} />}

          <div className="tr-stats">
            <StatTile
              label="Weight (7-day avg)"
              value={tr ? u.weight(tr.trendKg) : '—'}
              delta={tr?.ratePerWeek != null ? `${u.delta(tr.ratePerWeek)}/wk` : undefined}
              deltaGood={tr?.ratePerWeek != null && tr.targetKg != null ? Math.sign(tr.ratePerWeek) === Math.sign(tr.targetKg - tr.trendKg) : undefined}
              sub={tr ? `last ${fmt.dateShort(tr.latest.date)}` : 'no weigh-ins yet'}
              onClick={() => go('body')}
            />
            <StatTile label="Goal" value={tr?.toGo != null ? `${u.weight(Math.abs(tr.toGo))} to go` : t.goal.targetWeightKg != null ? u.weight(t.goal.targetWeightKg) : 'Not set'} sub={tr?.projectedDate ? `≈ ${fmt.dateMedium(tr.projectedDate)}` : t.goal.targetDate ? `by ${fmt.dateMedium(t.goal.targetDate)}` : 'set one in Goals'} onClick={() => go('goals')} />
            <StatTile label="Streak" value={`${st.current} day${st.current === 1 ? '' : 's'}`} sub={st.loggedToday ? 'logged today' : 'log today to keep it'} delta={st.best > st.current ? `best ${st.best}` : undefined} onClick={() => go('coach')} />
            <StatTile label="Workouts (7 days)" value={t.goal.workoutsPerWeek ? `${w7} / ${t.goal.workoutsPerWeek}` : String(w7)} sub={wStreak > 1 ? `${wStreak} weeks on target` : 'this week'} onClick={() => go('workouts', { tab: 'history' })} />
            <StatTile label="Eaten today" value={`${Math.round(eaten.calories)} kcal`} sub={t.macros.calories ? `of ${t.macros.calories} · ${Math.round(eaten.protein)} g protein` : `${Math.round(eaten.protein)} g protein`} onClick={() => go('nutrition', { tab: 'log', date: today })} />
          </div>

          <div className="tr-cols">
            <div className="tr-col">
              <Card title="Check-in">
                <QuickCheckIn ref={checkRef} date={today} />
              </Card>

              <Card
                title="Today's plan"
                actions={
                  <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => go('nutrition', { tab: 'plan', week: today })}>
                    Meal plan
                  </Button>
                }
              >
                <div className="tr-today-workout">
                  <Dumbbell size={18} />
                  {activeToday ? (
                    <div className="grow">
                      <b>
                        <span className="tr-live-dot" aria-hidden /> {activeToday.name || 'Workout'} · in progress
                      </b>
                      <div className="muted small">
                        {activeToday.startedAt ? `started ${new Date(activeToday.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ` : ''}
                        {activeToday.sets.filter((x) => x.done !== false).length}/{activeToday.sets.length} sets done
                      </div>
                    </div>
                  ) : doneToday && !readyToday ? (
                    <div className="grow">
                      <b>{doneToday.name || 'Workout'} done</b>
                      <div className="muted small">
                        {sessionStats(doneToday).sets} sets · {u.weight(sessionStats(doneToday).volume, 0)} volume{doneToday.durationMin ? ` · ${doneToday.durationMin} min` : ''}
                      </div>
                    </div>
                  ) : upcoming ? (
                    <div className="grow">
                      <span className="tr-slot">{readyToday || planned.length ? 'Today' : 'Up next'}</span>
                      <b>{upcoming.name}</b>
                      <div className="muted small">{upcoming.sub}</div>
                    </div>
                  ) : (
                    <div className="grow">
                      <b>No program yet</b>
                      <div className="muted small">Build your training days in Workouts, or log a free session.</div>
                    </div>
                  )}
                  {activeToday ? (
                    <div className="row" style={{ gap: 6 }}>
                      <Button size="sm" icon={Square} onClick={() => void stopWorkout()}>
                        Stop
                      </Button>
                      <Button size="sm" variant="primary" icon={Play} onClick={continueWorkout}>
                        Continue
                      </Button>
                    </div>
                  ) : doneToday && !readyToday ? (
                    <Button size="sm" onClick={() => go('workouts', { tab: 'log', sessionId: doneToday.id })}>
                      Open
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" icon={Play} onClick={startWorkout}>
                      Start
                    </Button>
                  )}
                </div>

                {todayPlan.length === 0 ? (
                  <div className="tr-blank">
                    <Salad size={18} />
                    <span>No meals planned for today.</span>
                    <Button size="sm" onClick={() => go('nutrition', { tab: 'plan', week: today })}>
                      Plan meals
                    </Button>
                  </div>
                ) : (
                  <ul className="tr-today-meals">
                    {MEAL_SLOTS.flatMap((slot) =>
                      todayPlan
                        .filter((e) => e.slot === slot.value)
                        .map((e) => {
                          const m = entryMacros(e, meals);
                          return (
                            <li key={e.id}>
                              <button
                                type="button"
                                className={`tr-eat ${e.eaten ? 'on' : ''}`}
                                aria-pressed={!!e.eaten}
                                aria-label={`${e.eaten ? 'Eaten' : 'Mark eaten'}: ${entryLabel(e, meals)}`}
                                onClick={() =>
                                  updateTraining((tr2) => {
                                    const x = tr2.plan.find((p) => p.id === e.id);
                                    if (x) x.eaten = !x.eaten;
                                  })
                                }
                              >
                                {e.eaten ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                              </button>
                              <div className="grow">
                                <span className="tr-slot">{slot.label}</span>
                                <b>{entryLabel(e, meals)}</b>
                                {e.servings !== 1 && <span className="muted"> × {e.servings}</span>}
                              </div>
                              <span className="muted small nowrap">{m.calories ? `${Math.round(m.calories)} kcal · ${Math.round(m.protein)} P` : ''}</span>
                            </li>
                          );
                        }),
                    )}
                  </ul>
                )}
                <MacroBars value={eaten} targets={t.macros} compact />
              </Card>

              <TodayPhoto today={today} photos={photosToday} streakDays={photoStreak} />
            </div>

            <div className="tr-col">
              <Card
                title="Weight trend"
                actions={
                  <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => go('body', { tab: 'charts' })}>
                    Body
                  </Button>
                }
              >
                <WeightChart t={t} weeks={12} height={230} />
                <p className="tr-note">{projectionText(tr, t.profile.units, fmt.dateMedium)}</p>
              </Card>

              <Card title="Consistency" actions={<Tabs tabs={[{ id: 'logged', label: 'Logged' }, { id: 'workout', label: 'Workouts' }, { id: 'photo', label: 'Photos' }]} value={heat} onChange={(v) => setHeat(v as HeatKind)} />}>
                <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
                  <Pill tone={st.current >= 3 ? 'good' : undefined}>
                    <Flame size={13} /> {st.current}-day logging streak
                  </Pill>
                  <Pill>best {st.best}</Pill>
                  {t.goal.workoutsPerWeek ? <Pill tone={wStreak >= 2 ? 'good' : undefined}>{wStreak} wk workout streak</Pill> : null}
                  <Pill>{Math.round((countIn(logged, addDays(today, -27), today) / 28) * 100)}% of last 28 days</Pill>
                </div>
                <Heatmap t={t} today={today} mondayFirst={mondayFirst} kind={heat} />
              </Card>

              <Card
                title="Insights"
                actions={
                  <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => go('coach')}>
                    Coach
                  </Button>
                }
              >
                <InsightList items={ins} limit={4} />
                <p className="tr-disclaimer-inline">Computed from your logs — not medical advice.</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayPhoto({ today, photos, streakDays }: { today: string; photos: { id: string; asset: string; pose: Pose }[]; streakDays: number }) {
  const [pose, setPose] = useState<Pose>('front');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try {
      await storePhoto(f, today, pose);
      toast(`Saved today's ${pose} photo`);
    } catch (e) {
      toast(`Could not add the photo: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <Card
      title="Today's photo"
      actions={
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => go('photos')}>
          Photos
        </Button>
      }
    >
      {photos.length > 0 && (
        <div className="tr-today-photos">
          {photos.map((p) => (
            <button key={p.id} type="button" className="tr-today-photo" onClick={() => go('photos', { photoId: p.id })} aria-label={`Open today's ${p.pose} photo`}>
              <AssetImage name={p.asset} fit="cover" />
              <span>{POSES.find((x) => x.value === p.pose)?.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="tr-photo-actions">
        <Select value={pose} onChange={(v) => setPose(v as Pose)} options={POSES} aria-label="Pose" />
        <Button variant={photos.length ? 'default' : 'primary'} icon={Camera} onClick={() => go('photos', { capture: true, pose })}>
          Take photo
        </Button>
        <Button icon={ImagePlus} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Saving…' : 'Upload'}
        </Button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      <p className="tr-note">{photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} today${streakDays > 1 ? ` · ${streakDays}-day photo streak` : ''}.` : 'Same spot, same light, same pose — one a day makes a smooth timelapse.'}</p>
    </Card>
  );
}
