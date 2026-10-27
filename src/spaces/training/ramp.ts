/* Ramp up logic: where the user is in the plan, today's mission, points,
   levels, badges and the weekly streak. Pure functions over TrainingData
   (plus a few write helpers used by the screen and the AI coach).

   The plan moves at the user's pace: a stage needs a number of weeks where
   the weekly target was met, so a missed week never pushes them forward
   into harder work. Completed workouts logged in Workouts count too. */
import { addDays, diffDays } from '@/lib/dates';
import { uid } from '@/lib/id';
import type { TrainingData } from './types';
import { sessionDone } from './calc';
import { ensureExercise, makeProgramDay, makeProgramExercise } from './ops';
import { RAMP_BADGES, RAMP_LEVELS, RAMP_STAGES, WEEK_BONUS, WIN_POINTS, type Ramp, type RampMove, type RampStage, type RampWin, type RampWinKind } from './ramp-types';

export * from './ramp-types';

const RANK: Record<RampWinKind, number> = { move: 1, mini: 2, full: 3 };

export interface RampWeek {
  index: number;
  from: string;
  to: string;
  stage: number;
  target: number;
  /** days with a full or mini workout */
  sessions: number;
  met: boolean;
}

export interface RampStatus {
  ramp: Ramp;
  stage: RampStage;
  stageIndex: number;
  /** all four stages finished (they keep going at Own it) */
  complete: boolean;
  /** met weeks in this stage, and how many it needs */
  stageWeeksMet: number;
  stageWeeksNeeded: number;
  week: RampWeek;
  weeks: RampWeek[];
  weekStreak: number;
  bestWeekStreak: number;
  points: number;
  level: { index: number; name: string; points: number; next?: { name: string; points: number } };
  badges: { id: string; name: string; how: string; earned: boolean }[];
  /** best win per day (manual wins and finished workouts) */
  days: Map<string, RampWinKind>;
  doneToday?: RampWinKind;
  mission: { title: string; minutes: number; moves: RampMove[]; mini: RampMove[] };
  nextUnlock: string;
  totals: { workouts: number; minis: number; moves: number };
}

const targetFor = (r: Ramp, stageIndex: number) => (stageIndex === RAMP_STAGES.length - 1 ? r.goalDays : Math.min(RAMP_STAGES[stageIndex].perWeek, r.goalDays));
const neededFor = (r: Ramp, stageIndex: number) => RAMP_STAGES[stageIndex].weeks + (r.hold?.stage === RAMP_STAGES[stageIndex].id ? r.hold.weeks : 0);

/** Best win kind per day: manual wins plus finished workouts (as full). */
export function rampDays(t: TrainingData): Map<string, RampWinKind> {
  const out = new Map<string, RampWinKind>();
  const put = (d: string, k: RampWinKind) => {
    const cur = out.get(d);
    if (!cur || RANK[k] > RANK[cur]) out.set(d, k);
  };
  for (const w of t.ramp?.wins ?? []) put(w.date, w.kind);
  for (const s of t.sessions) if (sessionDone(s)) put(s.date, 'full');
  return out;
}

export function rampStatus(t: TrainingData, today: string): RampStatus | null {
  const r = t.ramp;
  if (!r) return null;
  const days = rampDays(t);
  const since = (d: string) => diffDays(r.startDate, d) >= 0;
  const currentIndex = Math.max(0, Math.floor(diffDays(r.startDate, today) / 7));

  const weeks: RampWeek[] = [];
  let stageIndex = 0;
  let stageWeeksMet = 0;
  let complete = false;
  let stagesFinished = 0;
  for (let i = 0; i <= currentIndex; i++) {
    const from = addDays(r.startDate, i * 7);
    const to = addDays(from, 6);
    let sessions = 0;
    for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
      const k = days.get(d);
      if (k === 'full' || k === 'mini') sessions++;
    }
    const target = targetFor(r, stageIndex);
    const met = sessions >= target;
    weeks.push({ index: i, from, to, stage: stageIndex, target, sessions, met });
    // the current week moves you up only once it is met; past weeks count when met
    if (met) {
      stageWeeksMet++;
      if (stageWeeksMet >= neededFor(r, stageIndex)) {
        stagesFinished = Math.max(stagesFinished, stageIndex + 1);
        if (stageIndex < RAMP_STAGES.length - 1) {
          // a stage finished in the current week starts next week
          if (i < currentIndex) {
            stageIndex++;
            stageWeeksMet = 0;
          }
        } else complete = true;
      }
    }
  }
  // a stage finished during the current week is still shown until the next week starts
  const week = weeks[weeks.length - 1];

  // streaks of met weeks (the current week only counts once it is met)
  let run = 0;
  let best = 0;
  for (const w of weeks) {
    if (w.met) best = Math.max(best, ++run);
    else if (w.index < currentIndex) run = 0;
  }
  const weekStreak = week.met ? run : weeks.length > 1 && weeks[weeks.length - 2].met ? run : 0;

  // points: best win per day since the start, plus a bonus per met week
  let points = 0;
  const totals = { workouts: 0, minis: 0, moves: 0 };
  for (const [d, k] of days) {
    if (!since(d)) continue;
    points += WIN_POINTS[k];
    if (k === 'full') totals.workouts++;
    else if (k === 'mini') totals.minis++;
    else totals.moves++;
  }
  points += weeks.filter((w) => w.met).length * WEEK_BONUS;
  let li = 0;
  for (let i = 0; i < RAMP_LEVELS.length; i++) if (points >= RAMP_LEVELS[i].points) li = i;
  const level = { index: li, name: RAMP_LEVELS[li].name, points, next: RAMP_LEVELS[li + 1] };

  const earned = new Set<string>();
  if (totals.workouts + totals.minis + totals.moves > 0) earned.add('first');
  if (totals.minis > 0) earned.add('mini');
  if (best >= 1) earned.add('week');
  if (best >= 2) earned.add('two_weeks');
  if (best >= 4) earned.add('month');
  if (totals.workouts + totals.minis >= 10) earned.add('ten');
  if (stagesFinished >= 1) earned.add('stage');
  if (complete) earned.add('all');
  const badges = RAMP_BADGES.map((b) => ({ ...b, earned: earned.has(b.id) }));

  const stage = RAMP_STAGES[stageIndex];
  const plans = r.where === 'home' ? stage.home : stage.gym;
  // rotate workouts A / B (/ C) by how many sessions were done in this stage
  const stageStart = weeks.find((w) => w.stage === stageIndex)?.from ?? r.startDate;
  let doneInStage = 0;
  for (const [d, k] of days) if ((k === 'full' || k === 'mini') && diffDays(stageStart, d) >= 0 && d < today) doneInStage++;
  const pick = doneInStage % plans.length;
  const letter = plans.length > 1 ? ` ${String.fromCharCode(65 + pick)}` : '';
  const minutes = stageIndex === 0 ? Math.min(stage.minutes, Math.max(10, r.minutesNow)) : stage.minutes;
  const mission = { title: `${stage.name}${letter}`, minutes, moves: plans[pick], mini: r.where === 'home' ? stage.mini.home : stage.mini.gym };

  const left = week.target - week.sessions;
  // the next badge earned by training (the bad-day badge is never something to aim for)
  const nextBadge = badges.find((b) => !b.earned && b.id !== 'mini');
  const nextUnlock = complete
    ? 'You finished the ramp. Keep your routine going, and ask your coach for the next challenge.'
    : left > 0
      ? `${left} more workout${left === 1 ? '' : 's'} this week to hit your target${nextBadge ? ` (and get closer to "${nextBadge.name}")` : ''}.`
      : stageWeeksMet >= neededFor(r, stageIndex) && stageIndex < RAMP_STAGES.length - 1
        ? `Stage done: "${RAMP_STAGES[stageIndex + 1].name}" starts with your next week.`
        : `Week target hit. ${neededFor(r, stageIndex) - stageWeeksMet} more week${neededFor(r, stageIndex) - stageWeeksMet === 1 ? '' : 's'} like this and you move up to "${RAMP_STAGES[Math.min(stageIndex + 1, RAMP_STAGES.length - 1)].name}".`;

  return {
    ramp: r,
    stage,
    stageIndex,
    complete,
    stageWeeksMet,
    stageWeeksNeeded: neededFor(r, stageIndex),
    week,
    weeks,
    weekStreak,
    bestWeekStreak: best,
    points,
    level,
    badges,
    days,
    doneToday: days.get(today),
    mission,
    nextUnlock,
    totals,
  };
}

/** Short summary for agents and the holistic coach. */
export function rampSummary(t: TrainingData, today: string): Record<string, unknown> | undefined {
  const s = rampStatus(t, today);
  if (!s) return undefined;
  return {
    stage: `${s.stageIndex + 1}/${RAMP_STAGES.length} ${s.stage.name}${s.complete ? ' (ramp complete)' : ''}`,
    stageWeeks: `${s.stageWeeksMet}/${s.stageWeeksNeeded} weeks met`,
    thisWeek: `${s.week.sessions}/${s.week.target} workouts (${s.week.from} to ${s.week.to})`,
    today: s.doneToday ? `done (${s.doneToday})` : `mission: ${s.mission.title}, about ${s.mission.minutes} min`,
    weekStreak: s.weekStreak,
    level: `${s.level.name} (${s.points} pts${s.level.next ? `, ${s.level.next.name} at ${s.level.next.points}` : ''})`,
    badges: s.badges.filter((b) => b.earned).map((b) => b.name),
    nextUnlock: s.nextUnlock,
    where: s.ramp.where,
    goalDaysPerWeek: s.ramp.goalDays,
    why: s.ramp.why,
    reward: s.ramp.reward,
    paused: s.ramp.paused || undefined,
  };
}

/* ---------------------------------------------------------------- writes (inside updateTraining) */

export function setupRamp(t: TrainingData, input: { where?: Ramp['where']; goalDays?: number; minutesNow?: number; why?: string; reward?: string; startDate: string }) {
  const prev = t.ramp;
  t.ramp = {
    startDate: input.startDate,
    where: input.where ?? prev?.where ?? 'gym',
    goalDays: Math.min(5, Math.max(2, Math.round(input.goalDays ?? prev?.goalDays ?? 3))),
    minutesNow: Math.min(60, Math.max(10, Math.round(input.minutesNow ?? prev?.minutesNow ?? 20))),
    wins: prev?.wins ?? [],
  };
  const why = input.why ?? prev?.why;
  const reward = input.reward ?? prev?.reward;
  if (why?.trim()) t.ramp.why = why.trim();
  if (reward?.trim()) t.ramp.reward = reward.trim();
}

export function addWin(t: TrainingData, win: Omit<RampWin, 'id'>): string {
  if (!t.ramp) throw new Error('Set up Ramp up first');
  // one win per day and kind: a second "full" the same day replaces the first
  t.ramp.wins = t.ramp.wins.filter((w) => !(w.date === win.date && w.kind === win.kind));
  const id = uid('win');
  t.ramp.wins.push({ id, ...win });
  t.ramp.wins.sort((a, b) => a.date.localeCompare(b.date));
  return id;
}

export function removeWin(t: TrainingData, id: string) {
  if (t.ramp) t.ramp.wins = t.ramp.wins.filter((w) => w.id !== id);
}

/** Stay at the current stage for extra weeks (busy period, illness, travel). */
export function holdStage(t: TrainingData, stageId: string, weeks: number) {
  if (!t.ramp) return;
  if (weeks <= 0) delete t.ramp.hold;
  else t.ramp.hold = { stage: stageId, weeks: Math.min(8, Math.round(weeks)) };
}

const DOSE = /^(\d+)\s*[×x]\s*(.+)$/i;

/** Put the current stage's workouts into the Program (replacing earlier Ramp days), so logging in Workouts works too. */
export function rampToProgram(t: TrainingData, stage: RampStage, where: Ramp['where']): string[] {
  t.program.days = t.program.days.filter((d) => !d.name.startsWith('Ramp · '));
  const plans = where === 'home' ? stage.home : stage.gym;
  const ids: string[] = [];
  plans.forEach((moves, i) => {
    const day = makeProgramDay({ name: `Ramp · ${stage.name}${plans.length > 1 ? ` ${String.fromCharCode(65 + i)}` : ''}`, focus: stage.aim });
    for (const m of moves) {
      const ex = ensureExercise(t, m.name);
      const dose = DOSE.exec(m.dose);
      day.exercises.push(makeProgramExercise({ exerciseId: ex.id, sets: dose ? Number(dose[1]) : 1, reps: dose ? dose[2].trim() : undefined, notes: dose ? m.tip : [m.dose, m.tip].filter(Boolean).join('. ') }));
    }
    t.program.days.push(day);
    ids.push(day.id);
  });
  return ids;
}
