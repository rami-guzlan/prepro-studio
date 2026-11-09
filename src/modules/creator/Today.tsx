/* Creator workspace → Today: where this video stands, the one thing to do next,
   a focus sprint to get going, and how much time has gone in. */
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Check, Clapperboard, Flame, Pause, Play, Square, Timer } from 'lucide-react';
import { create } from 'zustand';
import type { CreatorData, CreatorStage } from '@/types';
import { DateInput, Button } from '@/ui';
import { STAGES, daysLeft, nextAction, overallPercent, sessionStats, stageProgress, stageSteps, type CreatorTab } from './model';
import { editCreator, logSession, setStage } from './ops';
import { stageIndex } from './shared';

/* ---------------------------------------------------------------- sprint timer (kept while you switch tabs) */

interface Sprint {
  running: boolean;
  /** ms already counted before the current run */
  banked: number;
  startedAt: number | null;
  goal: number;
}
export const useSprint = create<Sprint>(() => ({ running: false, banked: 0, startedAt: null, goal: 25 }));
const elapsedMs = (s: Sprint) => s.banked + (s.running && s.startedAt ? Date.now() - s.startedAt : 0);

export function SprintTimer({ stage, compact }: { stage: CreatorStage; compact?: boolean }) {
  const s = useSprint();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [s.running]);
  const ms = elapsedMs(s);
  const left = Math.max(0, s.goal * 60000 - ms);
  const over = ms >= s.goal * 60000;
  const mm = Math.floor((over ? ms : left) / 60000);
  const ss = Math.floor(((over ? ms : left) % 60000) / 1000);
  const start = () => useSprint.setState({ running: true, startedAt: Date.now() });
  const pause = () => useSprint.setState((x) => ({ running: false, banked: elapsedMs(x), startedAt: null }));
  const stop = () => {
    logSession(ms / 60000, stage);
    useSprint.setState({ running: false, banked: 0, startedAt: null });
  };
  return (
    <div className={`cr-sprint ${s.running ? 'on' : ''} ${compact ? 'compact' : ''}`}>
      <Timer size={compact ? 14 : 18} />
      <span className="cr-sprint-time">
        {over ? '+' : ''}
        {mm}:{String(ss).padStart(2, '0')}
      </span>
      {!compact && <span className="muted small">{over ? 'Sprint done, keep going or stop' : ms ? 'left in this sprint' : `${s.goal}-minute focus sprint`}</span>}
      {!s.running ? (
        <Button size="sm" variant={ms ? 'default' : 'primary'} icon={Play} onClick={start}>
          {ms ? 'Resume' : 'Start'}
        </Button>
      ) : (
        <Button size="sm" icon={Pause} onClick={pause}>
          Pause
        </Button>
      )}
      {ms > 0 && (
        <Button size="sm" variant="ghost" icon={Square} title="Stop and log the time" onClick={stop}>
          Log
        </Button>
      )}
      {!compact && !ms && (
        <select className="cr-sprint-goal" value={s.goal} onChange={(e) => useSprint.setState({ goal: Number(e.target.value) })} aria-label="Sprint length">
          {[10, 15, 25, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- stage track */

export function StageTrack({ c }: { c: CreatorData }) {
  const prog = stageProgress(c);
  const cur = stageIndex(c.stage);
  return (
    <ol className="cr-track" aria-label="Stages">
      {STAGES.map((s, i) => {
        const p = prog[s.value];
        const state = i < cur ? 'past' : i === cur ? 'now' : 'next';
        return (
          <li key={s.value} className={state}>
            <button type="button" onClick={() => setStage(s.value)} title={`${s.hint}. Click to set the video to ${s.label}.`}>
              <span className="cr-track-dot">{i < cur || (s.value === 'done' && i === cur) ? <Check size={13} /> : i + 1}</span>
              <span className="cr-track-label">{s.label}</span>
              {s.value !== 'done' && p.total > 0 && (
                <span className="cr-track-bar">
                  <i style={{ width: `${(p.done / p.total) * 100}%` }} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- today */

export function TodayTab({ c, onGo, onShoot }: { c: CreatorData; onGo: (tab: CreatorTab, anchor?: string) => void; onShoot: () => void }) {
  const next = nextAction(c);
  const steps = stageSteps(c);
  const prog = stageProgress(c);
  const pct = overallPercent(c);
  const days = daysLeft(c);
  const st = sessionStats(c);
  const stage = STAGES.find((s) => s.value === c.stage)!;

  return (
    <div className="cr-today">
      <div className="cr-hero">
        <div className="cr-hero-main">
          <div className="muted small">
            Now: <b>{stage.label}</b> · {pct}% of the way
          </div>
          {c.stage === 'done' ? (
            <>
              <h2>It’s out. Nice work.</h2>
              <p className="muted">Note how it did on the Publish tab, then start the next one while the momentum is there.</p>
              <Button icon={ArrowRight} onClick={() => onGo('publish', 'cr-results')}>
                Note the results
              </Button>
            </>
          ) : next.step ? (
            <>
              <h2>{next.step.label}</h2>
              <p className="muted">{stage.hint}.</p>
              <div className="row wrap" style={{ gap: 8 }}>
                <Button variant="primary" icon={ArrowRight} onClick={() => onGo(next.step!.tab, next.step!.anchor)}>
                  Do it now
                </Button>
                {(c.stage === 'shoot' || c.stage === 'plan') && (
                  <Button icon={Clapperboard} onClick={onShoot}>
                    Open shoot mode
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2>{stage.label} is done</h2>
              <p className="muted">Move on while you’re warm.</p>
              <Button variant="primary" icon={ArrowRight} onClick={() => setStage(STAGES[stageIndex(c.stage) + 1].value)}>
                On to {STAGES[stageIndex(c.stage) + 1].label}
              </Button>
            </>
          )}
        </div>
        <div className="cr-hero-side">
          <SprintTimer stage={c.stage} />
          <div className="cr-facts">
            <span>
              <Flame size={14} /> <b>{st.streak}</b> day streak
            </span>
            <span>
              <Timer size={14} /> <b>{st.weekMinutes}</b> min this week
            </span>
            <span className="cr-target">
              <CalendarClock size={14} /> Publish by
              <DateInput size="sm" value={c.targetDate} onChange={(targetDate) => editCreator((x) => void (x.targetDate = targetDate))} />
              {days != null && <b className={days < 0 ? 'late' : days <= 3 ? 'soon' : ''}>{days < 0 ? `${-days} days late` : days === 0 ? 'today' : `${days} days`}</b>}
            </span>
          </div>
        </div>
      </div>

      <StageTrack c={c} />

      <div className="cr-stagecards">
        {STAGES.filter((s) => s.value !== 'done').map((s) => {
          const p = prog[s.value];
          const list = steps[s.value as Exclude<CreatorStage, 'done'>];
          const i = stageIndex(s.value);
          const cur = stageIndex(c.stage);
          return (
            <div key={s.value} className={`cr-stagecard ${i === cur ? 'now' : i < cur ? 'past' : ''}`}>
              <div className="cr-stagecard-head">
                <b>{s.label}</b>
                <span className="muted small">
                  {p.done}/{p.total}
                </span>
              </div>
              <ul>
                {list.map((x, k) => (
                  <li key={k} className={x.done ? 'done' : ''}>
                    <button type="button" onClick={() => onGo(x.tab, x.anchor)}>
                      <span className="cr-mini-tick">{x.done && <Check size={11} />}</span>
                      <span className="ellipsis">{x.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
