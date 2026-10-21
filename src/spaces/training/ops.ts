/* Writes to the Training data. Mutators take a (draft) TrainingData so the same
   logic serves the screens (inside updateTraining → one undo step) and the agent
   tools (inside their own undo step). */
import { updateSpace } from '@/store/space';
import { uid } from '@/lib/id';
import { addDays, diffDays } from '@/lib/dates';
import { normalizeIngredient, normalizeTraining, type BodyMetric, type CheckIn, type Exercise, type ExerciseKind, type FoodEntry, type ISODate, type Meal, type MealSlot, type Muscle, type ProgramDay, type ProgramExercise, type Session, type SessionSet, type Source, type TrainingData } from './types';
import { lastPerformance, mealMacros, type MacroResult } from './calc';

/** Change the Training data of the open space (one undo step; `coalesce` merges typing). */
export function updateTraining(fn: (t: TrainingData) => void, opts?: { coalesce?: string }) {
  updateSpace((d) => {
    if (!d.training) d.training = normalizeTraining({});
    fn(d.training as TrainingData);
  }, opts);
}

const norm = (s: string) => s.trim().toLowerCase();

/* ---------------------------------------------------------------- factories */

export function makeMeal(patch: Partial<Meal> = {}): Meal {
  return { id: uid('meal'), name: 'New meal', tags: [], servings: 1, ingredients: [], ...patch };
}

export function makeExercise(name: string, patch: Partial<Exercise> = {}): Exercise {
  return { id: uid('ex'), name: name.trim() || 'Exercise', muscle: guessMuscle(name), kind: guessKind(name), ...patch };
}

export function makeProgramDay(patch: Partial<ProgramDay> = {}): ProgramDay {
  return { id: uid('pday'), name: 'New day', weekdays: [], exercises: [], ...patch };
}

export function makeProgramExercise(patch: Partial<ProgramExercise> = {}): ProgramExercise {
  return { id: uid('pex'), sets: 3, reps: '8-10', ...patch };
}

export function makeSet(patch: Partial<SessionSet> = {}): SessionSet {
  return { id: uid('set'), ...patch };
}

const MUSCLE_WORDS: [Muscle, RegExp][] = [
  ['cardio', /\b(run|jog|bike|cycl|row(ing)? machine|erg|elliptical|swim|walk|stair|sprint|cardio|hiit)\b/i],
  ['chest', /\b(bench|chest|push[- ]?up|dip|fly|flye|pec)\b/i],
  ['back', /\b(row|pull[- ]?up|chin[- ]?up|pulldown|lat|deadlift|back extension|shrug)\b/i],
  ['shoulders', /\b(overhead|ohp|military|shoulder|lateral raise|face pull|arnold|rear delt)\b/i],
  ['biceps', /\b(curl|bicep)\b/i],
  ['triceps', /\b(tricep|pushdown|skull|extension|close[- ]grip)\b/i],
  ['hamstrings', /\b(rdl|romanian|hamstring|leg curl|good morning|nordic)\b/i],
  ['glutes', /\b(hip thrust|glute|bridge|kickback)\b/i],
  ['quads', /\b(squat|leg press|lunge|split squat|leg extension|step[- ]up)\b/i],
  ['calves', /\b(calf|calves)\b/i],
  ['core', /\b(plank|crunch|ab|abs|core|hollow|pallof|leg raise|sit[- ]?up|carry)\b/i],
];

export function guessMuscle(name: string): Muscle {
  for (const [m, re] of MUSCLE_WORDS) if (re.test(name)) return m;
  return 'other';
}

export function guessKind(name: string): ExerciseKind {
  if (/\b(plank|hold|hang|wall sit|hollow)\b/i.test(name)) return 'time';
  if (MUSCLE_WORDS[0][1].test(name)) return 'cardio';
  if (/\b(pull[- ]?up|chin[- ]?up|push[- ]?up|dip|sit[- ]?up|crunch|burpee|leg raise)\b/i.test(name)) return 'bodyweight';
  return 'weight';
}

/* ---------------------------------------------------------------- lookups */

export function findExercise(t: TrainingData, ref: string): Exercise | undefined {
  const r = norm(ref);
  return t.exercises.find((x) => x.id === ref) ?? t.exercises.find((x) => norm(x.name) === r) ?? t.exercises.find((x) => norm(x.name).replace(/s$/, '') === r.replace(/s$/, ''));
}

/** Find an exercise by id or name, creating it when unknown. */
export function ensureExercise(t: TrainingData, ref: string): Exercise {
  const hit = findExercise(t, ref);
  if (hit) return hit;
  const ex = makeExercise(ref);
  t.exercises.push(ex);
  return t.exercises[t.exercises.length - 1];
}

export function findMeal(t: TrainingData, ref: string): Meal | undefined {
  const r = norm(ref);
  return t.meals.find((m) => m.id === ref) ?? t.meals.find((m) => norm(m.name) === r) ?? (r.length >= 4 ? t.meals.find((m) => norm(m.name).includes(r)) : undefined);
}

export function findDay(t: TrainingData, ref: string): ProgramDay | undefined {
  const r = norm(ref);
  return t.program.days.find((d) => d.id === ref) ?? t.program.days.find((d) => norm(d.name) === r) ?? (r.length >= 3 ? t.program.days.find((d) => norm(d.name).includes(r) || norm(d.focus ?? '') === r) : undefined);
}

/* ---------------------------------------------------------------- body metrics & check-ins */

/** Merge values into the metric row of a date (creating it). Returns the row. */
export function upsertMetric(t: TrainingData, date: ISODate, patch: Partial<BodyMetric>, source: Source = 'me'): BodyMetric {
  let row = t.metrics.find((m) => m.date === date);
  if (!row) {
    t.metrics.push({ id: uid('met'), date, source });
    t.metrics.sort((a, b) => a.date.localeCompare(b.date));
    row = t.metrics.find((m) => m.date === date)!;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || k === 'date') continue;
    if (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) delete (row as any)[k];
    else (row as any)[k] = v;
  }
  return row;
}

export function addCheckIn(t: TrainingData, c: Omit<CheckIn, 'id'>): CheckIn {
  const row: CheckIn = { id: uid('chk'), ...c };
  for (const k of Object.keys(row) as (keyof CheckIn)[]) if (row[k] === undefined || row[k] === '') delete row[k];
  t.checkIns.push(row);
  return row;
}

export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- meals */

/** Record a meal as eaten: ticks a matching planned entry, else adds a food log entry. */
export function logMealEaten(t: TrainingData, date: ISODate, input: { meal?: string; name?: string; slot?: MealSlot; servings?: number; calories?: number; protein?: number; carbs?: number; fat?: number; time?: string; source?: Source }): { kind: 'plan' | 'food'; id: string; label: string } {
  const meal = input.meal ? findMeal(t, input.meal) : input.name ? findMeal(t, input.name) : undefined;
  const hasMacros = [input.calories, input.protein, input.carbs, input.fat].some((x) => x != null);
  if (meal && !hasMacros) {
    const planned = t.plan.find((e) => e.date === date && e.mealId === meal.id && !e.eaten && (!input.slot || e.slot === input.slot));
    if (planned) {
      planned.eaten = true;
      if (input.servings) planned.servings = input.servings;
      return { kind: 'plan', id: planned.id, label: meal.name };
    }
  }
  const f: FoodEntry = {
    id: uid('food'),
    date,
    slot: input.slot ?? meal?.slot,
    name: meal?.name ?? input.name ?? input.meal ?? 'Food',
    mealId: meal?.id,
    servings: input.servings ?? (meal ? 1 : undefined),
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    time: input.time,
    source: input.source,
  };
  if (meal && !hasMacros) {
    // freeze the meal's macros so later recipe edits don't rewrite history
    const m = mealMacros(meal);
    if (m.known) {
      const s = f.servings ?? 1;
      f.calories = Math.round(m.calories * s);
      f.protein = Math.round(m.protein * s);
      f.carbs = Math.round(m.carbs * s);
      f.fat = Math.round(m.fat * s);
    }
  }
  for (const k of Object.keys(f) as (keyof FoodEntry)[]) if (f[k] === undefined) delete f[k];
  t.food.push(f);
  return { kind: 'food', id: f.id, label: f.name };
}

export function setIngredients(m: Meal, list: unknown[]) {
  m.ingredients = list.map(normalizeIngredient).filter((x): x is NonNullable<typeof x> => !!x);
}

/** Copy the plan of 7 days starting at `fromStart` to the 7 days starting at `toStart` (replacing what's there). */
export function copyPlanWeek(t: TrainingData, fromStart: ISODate, toStart: ISODate): number {
  const fromEnd = addDays(fromStart, 6);
  const toEnd = addDays(toStart, 6);
  const src = t.plan.filter((e) => e.date >= fromStart && e.date <= fromEnd);
  t.plan = t.plan.filter((e) => e.date < toStart || e.date > toEnd);
  const shift = diffDays(fromStart, toStart);
  for (const e of src) t.plan.push({ ...e, id: uid('plan'), date: addDays(e.date, shift), eaten: undefined });
  for (const e of t.plan) if (e.eaten === undefined) delete e.eaten;
  return src.length;
}

/* ---------------------------------------------------------------- workouts */

function firstInt(reps?: string): number | undefined {
  const m = /\d+/.exec(reps ?? '');
  return m ? Number(m[0]) : undefined;
}

/** Planned (not yet done) sets for a program day: target weight, else last time's top set. */
export function plannedSets(t: TrainingData, day: ProgramDay, date: ISODate, sessionId?: string): SessionSet[] {
  const out: SessionSet[] = [];
  for (const pe of day.exercises) {
    if (!pe.exerciseId) continue;
    const last = lastPerformance(t, pe.exerciseId, sessionId, date);
    const lastTop = last?.sets.reduce<SessionSet | undefined>((a, b) => ((b.kg ?? 0) > (a?.kg ?? -1) ? b : a), undefined);
    for (let i = 0; i < pe.sets; i++) out.push(makeSet({ exerciseId: pe.exerciseId, kg: pe.targetKg ?? lastTop?.kg, reps: firstInt(pe.reps) ?? last?.sets[i]?.reps, rpe: undefined, done: false }));
  }
  return out;
}

/** Create a session (optionally from a program day, pre-filled with planned sets). Returns its id. */
export function startSession(t: TrainingData, date: ISODate, dayId?: string, source: Source = 'me'): string {
  const day = dayId ? t.program.days.find((d) => d.id === dayId) : undefined;
  const s: Session = { id: uid('ses'), date, dayId: day?.id, name: day?.name, sets: [], source };
  s.sets = day ? plannedSets(t, day, date, s.id) : [];
  if (!s.name) delete s.name;
  if (!s.dayId) delete s.dayId;
  t.sessions.push(s);
  return s.id;
}

/** Start (or resume) a session now. */
export function beginSession(t: TrainingData, sessionId: string) {
  const s = t.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  if (!s.startedAt) s.startedAt = new Date().toISOString();
  delete s.finishedAt;
}

/** Stop a session: drops sets not ticked as done (unless dropPending: false), stamps the finish time and fills the
    duration from the start time when it was not entered. With no done sets it is removed.
    Returns false when the session was removed. */
export function endSession(t: TrainingData, sessionId: string, opts: { dropPending?: boolean } = {}): boolean {
  const s = t.sessions.find((x) => x.id === sessionId);
  if (!s) return false;
  if (opts.dropPending !== false) s.sets = s.sets.filter((x) => x.done !== false);
  if (!s.sets.some((x) => x.done !== false)) {
    t.sessions = t.sessions.filter((x) => x.id !== sessionId);
    return false;
  }
  const now = new Date();
  s.finishedAt = now.toISOString();
  if (s.durationMin == null && s.startedAt) {
    const mins = Math.round((now.getTime() - new Date(s.startedAt).getTime()) / 60000);
    if (mins > 0 && mins <= 600) s.durationMin = mins;
  }
  return true;
}

/* ---------------------------------------------------------------- calculator */

export function applyMacroResult(t: TrainingData, r: MacroResult, today: ISODate) {
  if (!r.ok) return;
  t.macros = { ...t.macros, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, source: 'calculator', updatedAt: today };
}
