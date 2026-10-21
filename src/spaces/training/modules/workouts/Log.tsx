/* Session logging. Start from a program day (sets pre-filled with the target or
   last time's weights) or an empty session; tick sets off with big buttons,
   adjust weight / reps / RPE, add sets and exercises, and a rest timer runs
   after each ticked set. Everything saves as you go. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChartLine, Copy, Dumbbell, Flag, MoreHorizontal, Plus, Timer, Trash2, Trophy, X } from 'lucide-react';
import { Button, Card, confirmDialog, DateInput, EmptyState, IconButton, Input, Menu, NumberInput, promptDialog, Select, Textarea, toast, type MenuItem } from '@/ui';
import { useSpaceFormatters } from '@/store/space';
import { WEEKDAYS_SHORT } from '@/lib/dates';
import { weekdaysOf, type Session, type SessionSet, type TrainingData } from '../../types';
import { e1rm, exerciseHistory, exerciseMap, isWork, lastPerformance, plannedDaysOn, sessionDone, sessionExerciseOrder, sessionState, sessionStats, setsText, suggestedDay } from '../../calc';
import { beginSession, endSession, ensureExercise, makeSet, plannedSets, startSession, updateTraining } from '../../ops';
import { NumberUnit, useToday, useTraining, useUnits, WeightInput } from '../../ui';
import type { UnitKit } from '../../units';

function patchSession(id: string, patch: Partial<Session>, coalesce?: string) {
  updateTraining(
    (t) => {
      const s = t.sessions.find((x) => x.id === id);
      if (!s) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete (s as any)[k];
        else (s as any)[k] = v;
      }
    },
    coalesce ? { coalesce } : undefined,
  );
}

function patchSet(sessionId: string, setId: string, patch: Partial<SessionSet>, coalesce?: string) {
  updateTraining(
    (t) => {
      const x = t.sessions.find((s) => s.id === sessionId)?.sets.find((y) => y.id === setId);
      if (!x) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (x as any)[k];
        else (x as any)[k] = v;
      }
    },
    coalesce ? { coalesce } : undefined,
  );
}

export function SessionLog({ sessionId, setSessionId, onProgress, onProgram }: { sessionId?: string; setSessionId: (id: string | undefined) => void; onProgress: (exerciseId: string) => void; onProgram: () => void }) {
  const t = useTraining();
  const today = useToday();
  const session = sessionId ? t.sessions.find((s) => s.id === sessionId) : undefined;

  const start = (dayId?: string) => {
    let id = '';
    updateTraining((tr) => {
      id = startSession(tr, today, dayId);
      beginSession(tr, id);
    });
    setSessionId(id);
  };

  if (!session) return <StartScreen t={t} today={today} onStart={start} onOpen={setSessionId} onProgram={onProgram} />;
  return <SessionEditor key={session.id} t={t} s={session} onBack={() => setSessionId(undefined)} onProgress={onProgress} />;
}

function StartScreen({ t, today, onStart, onOpen, onProgram }: { t: TrainingData; today: string; onStart: (dayId?: string) => void; onOpen: (id: string) => void; onProgram: () => void }) {
  const fmt = useSpaceFormatters();
  const u = useUnits();
  const planned = plannedDaysOn(t, today);
  const next = suggestedDay(t, today);
  const open = t.sessions.filter((s) => sessionState(s) === 'active' || (sessionState(s) === 'planned' && s.sets.length > 0)).sort((a, b) => b.date.localeCompare(a.date));
  const recent = [...t.sessions].filter(sessionDone).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const lastOf = (dayId: string) => [...t.sessions].filter((s) => s.dayId === dayId && sessionDone(s)).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
  const ex = exerciseMap(t);
  return (
    <div className="tr-page narrow">
      {open.length > 0 && (
        <Card title="In progress & ready">
          <div className="tr-start-list">
            {open.map((s) => (
              <button key={s.id} type="button" className="tr-start-day" onClick={() => onOpen(s.id)}>
                <Play14 />
                <div className="grow">
                  <b>{s.name || 'Workout'}</b>
                  <span className="muted small">
                    {fmt.dateShort(s.date)} · {s.sets.filter((x) => x.done !== false).length}/{s.sets.length} sets done
                  </span>
                </div>
                <span className="tr-pill accent">{sessionState(s) === 'active' ? 'Continue' : 'Start'}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <Card title="Start a workout">
        {t.program.days.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No program yet"
            description="Build your training days (exercises, sets × reps, target weights) and every session starts pre-filled. Or just log a free session."
            action={
              <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
                <Button variant="primary" onClick={onProgram}>
                  Build my program
                </Button>
                <Button icon={Plus} onClick={() => onStart()}>
                  Empty session
                </Button>
              </div>
            }
          />
        ) : (
          <div className="tr-start-list">
            {t.program.days.map((d) => {
              const isPlanned = planned.some((p) => p.id === d.id);
              const isNext = !planned.length && next?.id === d.id;
              const last = lastOf(d.id);
              return (
                <button key={d.id} type="button" className={`tr-start-day ${isPlanned || isNext ? 'suggested' : ''}`} onClick={() => onStart(d.id)}>
                  <Play14 />
                  <div className="grow">
                    <b>{d.name}</b>
                    <span className="muted small">
                      {[d.focus, `${d.exercises.length} exercises`, weekdaysOf(d.weekdays).map((w) => WEEKDAYS_SHORT[w]).join('/'), last ? `last ${fmt.dateShort(last)}` : 'not done yet'].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {isPlanned ? <span className="tr-pill accent">Today</span> : isNext ? <span className="tr-pill">Next up</span> : null}
                </button>
              );
            })}
            <button type="button" className="tr-start-day" onClick={() => onStart()}>
              <Plus size={16} />
              <div className="grow">
                <b>Empty session</b>
                <span className="muted small">Add exercises as you go</span>
              </div>
            </button>
          </div>
        )}
      </Card>
      {recent.length > 0 && (
        <Card title="Recent sessions">
          <div className="tr-start-list">
            {recent.map((s) => {
              const st = sessionStats(s);
              return (
                <button key={s.id} type="button" className="tr-start-day" onClick={() => onOpen(s.id)}>
                  <Check size={16} />
                  <div className="grow">
                    <b>{s.name || 'Workout'}</b>
                    <span className="muted small">
                      {fmt.dateShort(s.date)} · {st.sets} sets · {u.weight(st.volume, 0)}
                      {s.durationMin ? ` · ${s.durationMin} min` : ''} · {sessionExerciseOrder(s).map((id) => ex.get(id)?.name ?? '?').slice(0, 3).join(', ')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Play14() {
  return <Dumbbell size={16} />;
}

/* ---------------------------------------------------------------- editor */

function SessionEditor({ t, s, onBack, onProgress }: { t: TrainingData; s: Session; onBack: () => void; onProgress: (id: string) => void }) {
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const [restEnds, setRestEnds] = useState<number | null>(null);
  const ex = exerciseMap(t);
  const order = sessionExerciseOrder(s);
  const day = s.dayId ? t.program.days.find((d) => d.id === s.dayId) : undefined;
  const st = sessionStats(s);
  const pending = s.sets.filter((x) => x.done === false).length;
  // best e1RM per exercise before this session (for PR badges)
  const bests = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of order) {
      const prev = exerciseHistory(t, id).filter((p) => p.sessionId !== s.id && p.date <= s.date && p.e1rm != null);
      if (prev.length) m.set(id, Math.max(...prev.map((p) => p.e1rm!)));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.sessions, s.id, s.date, order.join(',')]);

  const addExercise = (exerciseId: string) => {
    updateTraining((tr) => {
      const ss = tr.sessions.find((x) => x.id === s.id);
      if (!ss) return;
      const pe = day?.exercises.find((x) => x.exerciseId === exerciseId);
      const last = lastPerformance(tr, exerciseId, s.id, s.date);
      const n = pe?.sets ?? Math.max(1, last?.sets.length ?? 3);
      for (let i = 0; i < n; i++) ss.sets.push(makeSet({ exerciseId, kg: pe?.targetKg ?? last?.sets[i]?.kg ?? last?.sets[0]?.kg, reps: last?.sets[i]?.reps, done: false }));
    });
  };

  const pickItems = (): MenuItem[] => {
    const used = new Set(order);
    const items: MenuItem[] = [
      {
        label: 'New exercise…',
        icon: Plus,
        onClick: async () => {
          const name = await promptDialog({ title: 'New exercise', placeholder: 'Bulgarian split squat' });
          if (!name?.trim()) return;
          let id = '';
          updateTraining((tr) => {
            id = ensureExercise(tr, name.trim()).id;
          });
          addExercise(id);
        },
      },
    ];
    const list = [...t.exercises].filter((x) => !used.has(x.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (list.length) items.push({ separator: true }, ...list.map((x) => ({ label: x.name, onClick: () => addExercise(x.id) })));
    return items;
  };

  const finish = async () => {
    if (pending) {
      const ok = await confirmDialog({ title: `Remove ${pending} set${pending === 1 ? '' : 's'} not ticked?`, message: 'Sets you did not tick as done are removed from this session.', confirmLabel: 'Remove and finish', cancelLabel: 'Keep them' });
      if (ok)
        updateTraining((tr) => {
          const ss = tr.sessions.find((x) => x.id === s.id);
          if (ss) ss.sets = ss.sets.filter((x) => x.done !== false);
        });
    }
    if (!s.sets.some((x) => x.done !== false)) {
      toast('Nothing ticked yet — tick the sets you did, then finish.', 'info');
      return;
    }
    updateTraining((tr) => void endSession(tr, s.id, { dropPending: false }));
    const prs = order.filter((id) => {
      const best = bests.get(id);
      const now = Math.max(0, ...s.sets.filter((x) => x.exerciseId === id && isWork(x)).map((x) => e1rm(x.kg, x.reps) ?? 0));
      return best != null && now > best;
    });
    toast(`Workout saved · ${st.sets} sets · ${u.weight(st.volume, 0)}${prs.length ? ` · PR on ${prs.map((id) => ex.get(id)?.name).join(', ')}` : ''}`, 'success', { duration: 5000 });
    onBack();
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this session?', message: `${s.name || 'Workout'} on ${fmt.dateMedium(s.date)} with ${s.sets.length} sets. Ctrl+Z brings it back.`, confirmLabel: 'Delete', danger: true }))) return;
    updateTraining((tr) => {
      tr.sessions = tr.sessions.filter((x) => x.id !== s.id);
    });
    onBack();
  };

  const resetFromProgram = () =>
    updateTraining((tr) => {
      const ss = tr.sessions.find((x) => x.id === s.id);
      const d = tr.program.days.find((x) => x.id === ss?.dayId);
      if (!ss || !d) return;
      ss.sets = [...ss.sets.filter((x) => x.done !== false), ...plannedSets(tr, d, ss.date, ss.id).filter((p) => !ss.sets.some((x) => x.exerciseId === p.exerciseId))];
    });

  return (
    <div className="tr-page narrow tr-session">
      <div className="tr-session-head">
        <IconButton icon={ArrowLeft} label="Back to start" onClick={onBack} />
        <Input value={s.name ?? ''} onChange={(name) => patchSession(s.id, { name }, `ses:${s.id}:name`)} placeholder="Workout" className="tr-session-name" aria-label="Session name" />
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="Session actions" />}
          items={[
            ...(day ? [{ label: `Add missing ${day.name} exercises`, icon: Copy, onClick: resetFromProgram }] : []),
            { label: 'Delete session', icon: Trash2, danger: true, onClick: remove },
          ]}
        />
      </div>
      <div className="tr-session-meta">
        <DateInput size="sm" value={s.date} onChange={(date) => date && patchSession(s.id, { date })} />
        <Select size="sm" value={s.dayId ?? ''} onChange={(v) => patchSession(s.id, { dayId: v || undefined, name: s.name || t.program.days.find((d) => d.id === v)?.name })} placeholder="No program day" options={t.program.days.map((d) => ({ value: d.id, label: d.name }))} aria-label="Program day" />
        <NumberUnit value={s.durationMin} onChange={(durationMin) => patchSession(s.id, { durationMin }, `ses:${s.id}:dur`)} unit="min" size="sm" ariaLabel="Duration in minutes" />
        <NumberUnit value={s.rpe} onChange={(rpe) => patchSession(s.id, { rpe: rpe == null ? undefined : Math.max(1, Math.min(10, rpe)) }, `ses:${s.id}:rpe`)} unit="RPE" size="sm" ariaLabel="Session effort 1–10" />
      </div>
      <div className="tr-session-sum">
        <span>
          <b>{st.sets}</b> sets
        </span>
        <span>
          <b>{st.reps}</b> reps
        </span>
        <span>
          <b>{u.weightNum(st.volume, 0)}</b> {u.w} volume
        </span>
        {pending > 0 && <span className="muted">{pending} to go</span>}
      </div>

      {order.length === 0 && <p className="muted" style={{ textAlign: 'center', margin: '20px 0' }}>No exercises yet — add the first one below.</p>}

      {order.map((id, i) => (
        <ExerciseBlock
          key={id}
          s={s}
          exerciseId={id}
          name={ex.get(id)?.name ?? '(deleted exercise)'}
          kind={ex.get(id)?.kind ?? 'weight'}
          u={u}
          t={t}
          best={bests.get(id)}
          target={day?.exercises.find((x) => x.exerciseId === id)}
          first={i === 0}
          last={i === order.length - 1}
          onProgress={() => onProgress(id)}
          onRest={(sec) => setRestEnds(Date.now() + sec * 1000)}
        />
      ))}

      <div className="row wrap" style={{ gap: 8, justifyContent: 'center', margin: '8px 0 4px' }}>
        <Menu trigger={<Button icon={Plus}>Add exercise</Button>} items={pickItems} />
      </div>

      <label className="tr-field">
        <span>Notes</span>
        <Textarea value={s.notes ?? ''} onChange={(notes) => patchSession(s.id, { notes }, `ses:${s.id}:notes`)} rows={2} placeholder="Felt strong on squats; left knee a bit cranky on lunges." />
      </label>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="primary" size="lg" icon={Flag} onClick={finish}>
          Finish workout
        </Button>
      </div>
      {restEnds && <RestTimer endsAt={restEnds} onDone={() => setRestEnds(null)} onAdd={(sec) => setRestEnds((r) => (r ?? Date.now()) + sec * 1000)} />}
    </div>
  );
}

function ExerciseBlock({ s, exerciseId, name, kind, u, t, best, target, first, last, onProgress, onRest }: { s: Session; exerciseId: string; name: string; kind: string; u: UnitKit; t: TrainingData; best?: number; target?: { sets: number; reps?: string; targetKg?: number; rpe?: number; restSec?: number; notes?: string }; first: boolean; last: boolean; onProgress: () => void; onRest: (sec: number) => void }) {
  const fmt = useSpaceFormatters();
  const sets = s.sets.filter((x) => x.exerciseId === exerciseId);
  const prev = useMemo(() => lastPerformance(t, exerciseId, s.id, s.date), [t, exerciseId, s.id, s.date]);
  const timed = kind === 'time';
  const cardio = kind === 'cardio';

  const move = (dir: -1 | 1) =>
    updateTraining((tr) => {
      const ss = tr.sessions.find((x) => x.id === s.id);
      if (!ss) return;
      const order = sessionExerciseOrder(ss);
      const i = order.indexOf(exerciseId);
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      ss.sets = order.flatMap((id) => ss.sets.filter((x) => x.exerciseId === id)).concat(ss.sets.filter((x) => !x.exerciseId));
    });

  const addSet = () =>
    updateTraining((tr) => {
      const ss = tr.sessions.find((x) => x.id === s.id);
      if (!ss) return;
      const mine = ss.sets.filter((x) => x.exerciseId === exerciseId);
      const lastSet = mine[mine.length - 1];
      const at = lastSet ? ss.sets.indexOf(lastSet) + 1 : ss.sets.length;
      ss.sets.splice(at, 0, makeSet({ exerciseId, kg: lastSet?.kg, reps: lastSet?.reps, seconds: lastSet?.seconds, km: lastSet?.km, done: false }));
    });

  const removeExercise = () =>
    updateTraining((tr) => {
      const ss = tr.sessions.find((x) => x.id === s.id);
      if (ss) ss.sets = ss.sets.filter((x) => x.exerciseId !== exerciseId);
    });

  return (
    <div className="tr-ex-block">
      <div className="tr-ex-head">
        <div className="grow">
          <b>{name}</b>
          <div className="muted small">
            {target ? `Plan ${target.sets} × ${target.reps ?? '?'}${target.targetKg ? ` @ ${u.weight(target.targetKg)}` : ''}${target.rpe ? ` RPE ${target.rpe}` : ''}` : ''}
            {target && prev ? ' · ' : ''}
            {prev ? `Last (${fmt.dateShort(prev.date)}): ${setsText(prev.sets, u)}` : !target ? 'First time — have fun' : ''}
          </div>
          {target?.notes && <div className="muted tiny">{target.notes}</div>}
        </div>
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label={`${name} actions`} size="sm" />}
          items={[
            { label: 'Progress chart', icon: ChartLine, onClick: onProgress },
            { label: 'Move up', icon: ArrowUp, onClick: () => move(-1), disabled: first },
            { label: 'Move down', icon: ArrowDown, onClick: () => move(1), disabled: last },
            { separator: true },
            { label: 'Remove from session', icon: Trash2, danger: true, onClick: removeExercise },
          ]}
        />
      </div>
      <div className="tr-sets">
        <div className="tr-set tr-set-head" aria-hidden>
          <span>#</span>
          <span>{timed ? 'Time' : cardio ? 'Distance' : u.w}</span>
          <span>{timed ? '' : cardio ? 'Minutes' : 'Reps'}</span>
          <span>RPE</span>
          <span />
          <span />
        </div>
        {sets.map((x, i) => {
          const e = e1rm(x.kg, x.reps);
          const isPr = x.done !== false && !x.warmup && best != null && e != null && e > best && e === Math.max(...sets.filter(isWork).map((y) => e1rm(y.kg, y.reps) ?? 0));
          return (
            <div key={x.id} className={`tr-set ${x.done === false ? 'todo' : 'done'} ${x.warmup ? 'warm' : ''}`}>
              <button type="button" className="tr-set-n" title={x.warmup ? 'Warm-up set (click to make it a work set)' : 'Work set (click to mark as warm-up)'} onClick={() => patchSet(s.id, x.id, { warmup: x.warmup ? undefined : true })}>
                {x.warmup ? 'W' : i + 1 - sets.slice(0, i).filter((y) => y.warmup).length}
              </button>
              {timed ? (
                <NumberUnit value={x.seconds} onChange={(seconds) => patchSet(s.id, x.id, { seconds }, `set:${x.id}:sec`)} unit="s" ariaLabel="Seconds" />
              ) : cardio ? (
                <NumberUnit value={x.km} onChange={(km) => patchSet(s.id, x.id, { km }, `set:${x.id}:km`)} unit="km" ariaLabel="Distance in km" step={0.1} />
              ) : (
                <WeightInput kg={x.kg} onChange={(kg) => patchSet(s.id, x.id, { kg }, `set:${x.id}:kg`)} u={u} ariaLabel={`Set ${i + 1} weight`} />
              )}
              {timed ? (
                <span />
              ) : cardio ? (
                <NumberInput value={x.seconds != null ? Math.round((x.seconds / 60) * 10) / 10 : undefined} onChange={(m) => patchSet(s.id, x.id, { seconds: m == null ? undefined : Math.round(m * 60) }, `set:${x.id}:min`)} inputMode="decimal" aria-label="Minutes" />
              ) : (
                <NumberInput value={x.reps} onChange={(reps) => patchSet(s.id, x.id, { reps: reps == null ? undefined : Math.round(reps) }, `set:${x.id}:reps`)} inputMode="numeric" aria-label={`Set ${i + 1} reps`} />
              )}
              <NumberInput value={x.rpe} onChange={(rpe) => patchSet(s.id, x.id, { rpe: rpe == null ? undefined : Math.max(1, Math.min(10, rpe)) }, `set:${x.id}:rpe`)} inputMode="decimal" aria-label="RPE" placeholder="–" />
              <button
                type="button"
                className={`tr-set-done ${x.done === false ? '' : 'on'}`}
                aria-pressed={x.done !== false}
                aria-label={x.done === false ? `Tick set ${i + 1} done` : `Set ${i + 1} done`}
                onClick={() => {
                  const nowDone = x.done === false;
                  patchSet(s.id, x.id, { done: nowDone ? undefined : false });
                  if (nowDone && !x.warmup) onRest(target?.restSec ?? 90);
                }}
              >
                {isPr ? <Trophy size={18} /> : <Check size={20} />}
              </button>
              <IconButton
                icon={X}
                label="Delete set"
                size="sm"
                onClick={() =>
                  updateTraining((tr) => {
                    const ss = tr.sessions.find((y) => y.id === s.id);
                    if (ss) ss.sets = ss.sets.filter((y) => y.id !== x.id);
                  })
                }
              />
            </div>
          );
        })}
      </div>
      <Button size="sm" variant="ghost" icon={Plus} onClick={addSet}>
        Add set
      </Button>
    </div>
  );
}

function RestTimer({ endsAt, onDone, onAdd }: { endsAt: number; onDone: () => void; onAdd: (sec: number) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  useEffect(() => {
    if (left > 0) return;
    const id = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(id);
  }, [left, onDone]);
  return (
    <div className={`tr-rest ${left === 0 ? 'over' : ''}`} role="timer" aria-live="polite">
      <Timer size={16} />
      <b>{left === 0 ? 'Go!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</b>
      <span className="muted small">rest</span>
      <Button size="sm" onClick={() => onAdd(30)}>
        +30s
      </Button>
      <IconButton icon={X} label="Stop rest timer" size="sm" onClick={onDone} />
    </div>
  );
}

