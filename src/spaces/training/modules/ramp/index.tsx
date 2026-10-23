/* Ramp up: a gentle, game-like way back into training. A short setup, then
   today's mission (with a 10-minute bad-day version that still counts),
   this week's target, points, levels, badges and a forgiving weekly streak.
   The plan only moves up once weeks are actually met (src/spaces/training/ramp.ts). */
import './ramp.css';
import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Copy, Dumbbell, Footprints, Gift, Lock, PartyPopper, Pause, Play, Rocket, Timer, Trash2, Undo2 } from 'lucide-react';
import { Button, Card, confirmDialog, Field, Input, ModuleHeader, Select, Textarea, toast } from '@/ui';
import { Meter } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { addDays } from '@/lib/dates';
import { updateTraining } from '../../ops';
import { useToday, useTraining } from '../../ui';
import { normalizeTraining, type TrainingData } from '../../types';
import { RAMP_STAGES, addWin, holdStage, rampStatus, rampToProgram, removeWin, setupRamp, type RampStatus, type RampWinKind } from '../../ramp';

const COACH_PROMPT =
  'Be my Ramp up coach in PrePro Studio → Training. Start with training_ramp (action "status"). Keep it light and encouraging: tell me today\'s mission in two lines, ask if I can do it today, and if the day is hard offer the 10-minute version. When I tell you I trained, log it with training_ramp (action "log_win"), celebrate points, level and badges, and tell me what unlocks next. If I miss a week, never guilt me: suggest action "hold" to stay at this stage. Save anything worth remembering with training_coach_note.';

/** Run a write and celebrate what changed (level, badge, week target, stage). */
function celebrate(before: RampStatus | null, t: TrainingData, today: string) {
  const after = rampStatus(normalizeTraining(t), today);
  if (!before || !after) return;
  if (after.level.index > before.level.index) toast(`Level up: ${after.level.name}!${after.ramp.reward ? ` Time for: ${after.ramp.reward}` : ''}`, 'success', { duration: 6000 });
  for (const b of after.badges) if (b.earned && !before.badges.find((x) => x.id === b.id)?.earned) toast(`Badge earned: ${b.name}`, 'success', { duration: 5000 });
  if (after.week.met && !before.week.met) toast('Week target hit. That is how habits are built.', 'success', { duration: 5000 });
}

export default function RampModule() {
  const raw = useTraining();
  const t = useMemo(() => normalizeTraining(raw), [raw]);
  const today = useToday();
  const s = useMemo(() => rampStatus(t, today), [t, today]);

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Ramp up"
        icon={Rocket}
        subtitle={s ? `${s.stage.name} · ${s.week.sessions}/${s.week.target} this week · ${s.level.name}` : 'A gentle way back into the gym, one small win at a time'}
        actions={
          <Button icon={Copy} onClick={() => void navigator.clipboard.writeText(COACH_PROMPT).then(() => toast('Coach prompt copied. Paste it into Claude (connected to PrePro Studio).'))}>
            Copy coach prompt
          </Button>
        }
      />
      <div className="module-body">
        <div className="tr-page">{s ? <RampBoard s={s} today={today} /> : <RampSetup today={today} />}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- setup */

function RampSetup({ today, initial, onDone }: { today: string; initial?: RampStatus['ramp']; onDone?: () => void }) {
  const [where, setWhere] = useState(initial?.where ?? 'gym');
  const [goalDays, setGoalDays] = useState(String(initial?.goalDays ?? 3));
  const [minutes, setMinutes] = useState(String(initial?.minutesNow ?? 20));
  const [why, setWhy] = useState(initial?.why ?? '');
  const [reward, setReward] = useState(initial?.reward ?? '');
  const start = () => {
    updateTraining((tr) => setupRamp(tr, { where: where as 'gym' | 'home', goalDays: Number(goalDays), minutesNow: Number(minutes), why, reward, startDate: initial?.startDate ?? today }));
    toast(initial ? 'Ramp updated' : 'Your ramp is ready. First mission below.');
    onDone?.();
  };
  return (
    <Card title={initial ? 'Change your ramp' : 'Start small. Really small.'}>
      {!initial && (
        <p className="ramp-lead">
          Four stages over about eight weeks, starting with two short visits a week where the only goal is walking in. You only move up when a week is actually done, so a bad week never pushes you into harder work. A 10-minute version always counts.
        </p>
      )}
      <div className="ramp-setup">
        <Field label="Where will you train?">
          <Select value={where} onChange={(v) => setWhere(v as 'gym' | 'home')} options={[{ value: 'gym', label: 'At the gym' }, { value: 'home', label: 'At home' }]} />
        </Field>
        <Field label="Days a week you'd like to end up at">
          <Select value={goalDays} onChange={setGoalDays} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} days` }))} />
        </Field>
        <Field label="Honestly, how long can you do right now?">
          <Select value={minutes} onChange={setMinutes} options={[10, 15, 20, 30, 45].map((n) => ({ value: String(n), label: `${n} minutes` }))} />
        </Field>
        <Field label="Why do you want this? (shown on your mission)">
          <Input value={why} onChange={setWhy} placeholder="e.g. more energy on shoot days" />
        </Field>
        <Field label="Your reward for each new level">
          <Input value={reward} onChange={setReward} placeholder="e.g. new running shoes, a massage" />
        </Field>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Button variant="primary" icon={Rocket} onClick={start}>
          {initial ? 'Save' : 'Start my ramp'}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- board */

function RampBoard({ s, today }: { s: RampStatus; today: string }) {
  const fmt = useSpaceFormatters();
  const [editing, setEditing] = useState(false);
  const raw = useTraining();

  const log = (kind: RampWinKind) => {
    const before = s;
    let next: TrainingData | null = null;
    updateTraining((tr) => {
      addWin(tr, { date: today, kind, minutes: kind === 'mini' ? 10 : kind === 'full' ? s.mission.minutes : undefined });
      next = JSON.parse(JSON.stringify(tr));
    });
    toast(kind === 'full' ? 'Mission done. Nice work!' : kind === 'mini' ? 'Showed up on a hard day. That counts the most.' : 'Movement logged. Every bit counts.');
    if (next) celebrate(before, next, today);
  };

  if (editing) return <RampSetup today={today} initial={s.ramp} onDone={() => setEditing(false)} />;

  const daysOfWeek = Array.from({ length: 7 }, (_, i) => addDays(s.week.from, i));
  const recent = [...s.ramp.wins].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const nextLevel = s.level.next;

  return (
    <>
      <div className="ramp-hero card">
        <div className="ramp-stages" aria-label="Stages">
          {RAMP_STAGES.map((st, i) => (
            <div key={st.id} className={`ramp-stage ${i < s.stageIndex || s.complete ? 'done' : i === s.stageIndex ? 'on' : ''}`}>
              <span className="ramp-stage-n">{i < s.stageIndex || s.complete ? <CheckCircle2 size={14} /> : i + 1}</span>
              <span>{st.name}</span>
            </div>
          ))}
        </div>
        <h2 className="ramp-stage-title">{s.complete ? 'Ramp complete' : `Stage ${s.stageIndex + 1}: ${s.stage.name}`}</h2>
        <p className="muted">{s.stage.aim}</p>
        <div className="ramp-week">
          <div className="ramp-dots" aria-label={`${s.week.sessions} of ${s.week.target} workouts this week`}>
            {daysOfWeek.map((d) => {
              const k = s.days.get(d);
              return (
                <span key={d} className={`ramp-dot ${k ?? ''} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`} title={`${fmt.dateShort(d)}${k ? `: ${k === 'full' ? 'workout' : k === 'mini' ? '10-minute version' : 'movement'}` : ''}`}>
                  {fmt.dateShort(d).slice(0, 3)}
                </span>
              );
            })}
          </div>
          <div className="ramp-week-text">
            <b>
              {s.week.sessions} / {s.week.target}
            </b>{' '}
            workouts this week · stage {s.stageWeeksMet}/{s.stageWeeksNeeded} weeks
          </div>
        </div>
        <p className="ramp-next">{s.nextUnlock}</p>
      </div>

      <div className="ramp-grid">
        <Card title={s.doneToday ? 'Today: done' : "Today's mission"} actions={<span className="muted small row" style={{ gap: 4 }}><Timer size={14} /> about {s.mission.minutes} min</span>}>
          {s.ramp.why && <p className="ramp-why">“{s.ramp.why}”</p>}
          {s.doneToday ? (
            <div className="ramp-done">
              <PartyPopper size={22} />
              <div>
                <b>{s.doneToday === 'full' ? 'Mission complete.' : s.doneToday === 'mini' ? 'You showed up on a hard day.' : 'You moved today.'}</b>
                <div className="muted small">Rest well. Your next mission is waiting tomorrow.</div>
              </div>
            </div>
          ) : (
            <>
              <h4 className="ramp-mission-title">{s.mission.title}</h4>
              <ol className="ramp-moves">
                {s.mission.moves.map((m) => (
                  <li key={m.name}>
                    <span>{m.name}</span>
                    <b>{m.dose}</b>
                    {m.tip && <span className="muted small">{m.tip}</span>}
                  </li>
                ))}
              </ol>
              <div className="ramp-actions">
                <Button variant="primary" icon={CheckCircle2} onClick={() => log('full')}>
                  I did it (+10)
                </Button>
                <Button icon={Timer} onClick={() => log('mini')} title={s.mission.mini.map((m) => `${m.name} ${m.dose}`).join(' · ')}>
                  Bad day: 10-minute version (+6)
                </Button>
                <Button variant="ghost" icon={Footprints} onClick={() => log('move')}>
                  I just moved (+3)
                </Button>
              </div>
              <details className="ramp-mini">
                <summary>What is the 10-minute version?</summary>
                <ul>
                  {s.mission.mini.map((m) => (
                    <li key={m.name}>
                      {m.name}: <b>{m.dose}</b>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </Card>

        <Card title="Level" actions={<span className="muted small">{s.points} points</span>}>
          <div className="ramp-level">
            <Award size={26} />
            <div className="grow">
              <b>{s.level.name}</b>
              {nextLevel ? (
                <>
                  <Meter value={s.points} max={nextLevel.points} label="Points to the next level" />
                  <span className="muted small">
                    {nextLevel.points - s.points} points to {nextLevel.name}
                  </span>
                </>
              ) : (
                <span className="muted small">Top level. Legendary.</span>
              )}
            </div>
          </div>
          {s.ramp.reward && (
            <p className="ramp-reward">
              <Gift size={15} /> Reward for the next level: <b>{s.ramp.reward}</b>
            </p>
          )}
          <div className="ramp-streak">
            <b>{s.weekStreak}</b> week{s.weekStreak === 1 ? '' : 's'} in a row on target{s.bestWeekStreak > s.weekStreak ? ` · best ${s.bestWeekStreak}` : ''}
          </div>
          <div className="muted tiny">Workout 10 · 10-minute version 6 · movement 3 · each week on target +10</div>
        </Card>
      </div>

      <Card title="Badges">
        <div className="ramp-badges">
          {s.badges.map((b) => (
            <div key={b.id} className={`ramp-badge ${b.earned ? 'on' : ''}`} title={b.how}>
              {b.earned ? <Award size={18} /> : <Lock size={16} />}
              <b>{b.name}</b>
              <span className="muted tiny">{b.how}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="ramp-grid">
        <Card title="Recent wins">
          {recent.length === 0 ? (
            <p className="muted small">Nothing yet. Your first win is today's mission, or even a 10-minute walk.</p>
          ) : (
            <ul className="ramp-wins">
              {recent.map((w) => (
                <li key={w.id}>
                  <span className="ramp-win-kind">{w.kind === 'full' ? <Dumbbell size={14} /> : w.kind === 'mini' ? <Timer size={14} /> : <Footprints size={14} />}</span>
                  <span className="grow">
                    {fmt.dateMedium(w.date)} · {w.kind === 'full' ? 'Workout' : w.kind === 'mini' ? '10-minute version' : 'Movement'}
                    {w.source === 'agent' && <span className="muted small"> (logged by your coach)</span>}
                  </span>
                  <Button size="sm" variant="ghost" icon={Undo2} onClick={() => updateTraining((tr) => removeWin(tr, w.id))}>
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted tiny">Workouts you finish in Workouts count automatically.</p>
        </Card>

        <Card title="Your ramp">
          <div className="ramp-settings">
            <span>
              {s.ramp.where === 'gym' ? 'Gym' : 'Home'} · goal {s.ramp.goalDays} days a week · started {fmt.dateMedium(s.ramp.startDate)}
            </span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => setEditing(true)}>
                Change
              </Button>
              <Button
                size="sm"
                icon={Dumbbell}
                onClick={() => {
                  updateTraining((tr) => void rampToProgram(tr, s.stage, s.ramp.where));
                  toast('Added this stage to your Program. Log it in Workouts with sets and weights.', 'success', {
                    action: { label: 'Open Workouts', onClick: () => navigateSpace('workouts', { tab: 'program' }) },
                  });
                }}
              >
                Put this stage in my Program
              </Button>
              <Button
                size="sm"
                icon={s.ramp.hold?.stage === s.stage.id ? Play : Pause}
                onClick={() => {
                  const holding = s.ramp.hold?.stage === s.stage.id;
                  updateTraining((tr) => holdStage(tr, s.stage.id, holding ? 0 : 1));
                  toast(holding ? 'Back on the normal pace' : 'Staying one extra week at this stage. No pressure.');
                }}
              >
                {s.ramp.hold?.stage === s.stage.id ? 'Back to normal pace' : 'Busy? Stay a week longer'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={async () => {
                  if (await confirmDialog({ title: 'Start over?', message: 'Your ramp, points and badges reset. Workouts in Workouts stay.', confirmLabel: 'Start over', danger: true }))
                    updateTraining((tr) => void delete tr.ramp);
                }}
              >
                Start over
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
