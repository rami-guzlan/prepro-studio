/* Training data model (space kind 'training'). Stored in SpaceData.training.

   Canonical units are metric: body weight and lifted weight in kg, lengths in cm,
   water in litres. The profile's `units` only changes how values are shown and
   entered (see units.ts). Dates are 'YYYY-MM-DD'. */
import { todayISO } from '@/lib/dates';
import { normalizeRamp, type Ramp } from './ramp-types';

export type ISODate = string;
export type Units = 'metric' | 'imperial';
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Pose = 'front' | 'side' | 'back' | 'other';
export type Aisle = 'produce' | 'meat' | 'dairy' | 'bakery' | 'pantry' | 'frozen' | 'spices' | 'drinks' | 'other';
export type Muscle = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'full_body' | 'cardio' | 'other';
export type ExerciseKind = 'weight' | 'bodyweight' | 'time' | 'cardio';
export type GoalKind = 'weight' | 'body_fat' | 'strength' | 'measurement' | 'habit' | 'other';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'dropped';
export type Source = 'me' | 'agent';
export type CoachCategory = 'general' | 'nutrition' | 'training' | 'recovery' | 'mindset';
export type GoalDirection = 'lose' | 'maintain' | 'gain';

interface Opt<V extends string = string> {
  value: V;
  label: string;
}

export const MEAL_SLOTS: Opt<MealSlot>[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
];
export const POSES: Opt<Pose>[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
  { value: 'other', label: 'Other' },
];
export const AISLES: Opt<Aisle>[] = [
  { value: 'produce', label: 'Produce' },
  { value: 'meat', label: 'Meat & fish' },
  { value: 'dairy', label: 'Dairy & eggs' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'pantry', label: 'Pantry & grains' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'spices', label: 'Spices & sauces' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'other', label: 'Other' },
];
export const ACTIVITY_LEVELS: (Opt<ActivityLevel> & { factor: number; hint: string })[] = [
  { value: 'sedentary', label: 'Sedentary', factor: 1.2, hint: 'desk job, little or no exercise' },
  { value: 'light', label: 'Lightly active', factor: 1.375, hint: 'light exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderately active', factor: 1.55, hint: 'training 3–5 days a week' },
  { value: 'active', label: 'Very active', factor: 1.725, hint: 'hard training 6–7 days a week' },
  { value: 'very_active', label: 'Athlete / physical job', factor: 1.9, hint: 'physical job plus training, or twice a day' },
];
export const MUSCLES: Opt<Muscle>[] = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'calves', label: 'Calves' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Full body' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];
export const EXERCISE_KINDS: Opt<ExerciseKind>[] = [
  { value: 'weight', label: 'Weight × reps' },
  { value: 'bodyweight', label: 'Bodyweight (+ added weight)' },
  { value: 'time', label: 'Timed hold' },
  { value: 'cardio', label: 'Cardio (time / distance)' },
];
export const GOAL_KINDS: Opt<GoalKind>[] = [
  { value: 'weight', label: 'Body weight' },
  { value: 'body_fat', label: 'Body fat %' },
  { value: 'strength', label: 'Strength (1RM)' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'habit', label: 'Habit' },
  { value: 'other', label: 'Other' },
];
export const GOAL_STATUSES: (Opt<GoalStatus> & { color: string })[] = [
  { value: 'active', label: 'Active', color: '#2a78d6' },
  { value: 'achieved', label: 'Achieved', color: '#23a35a' },
  { value: 'paused', label: 'Paused', color: '#e8960c' },
  { value: 'dropped', label: 'Dropped', color: '#85858f' },
];
export const COACH_CATEGORIES: Opt<CoachCategory>[] = [
  { value: 'general', label: 'General' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'training', label: 'Training' },
  { value: 'recovery', label: 'Recovery & sleep' },
  { value: 'mindset', label: 'Mindset' },
];
/** Body measurements stored on BodyMetric (cm). */
export const MEASUREMENTS = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'hipsCm', label: 'Hips' },
  { key: 'armCm', label: 'Arm' },
  { key: 'thighCm', label: 'Thigh' },
  { key: 'neckCm', label: 'Neck' },
] as const;
export type MeasurementKey = (typeof MEASUREMENTS)[number]['key'];
/** Habit metrics a habit goal can track. */
export const HABITS = [
  { value: 'workouts', label: 'Workouts per week' },
  { value: 'steps', label: 'Steps per day' },
  { value: 'sleep', label: 'Sleep hours' },
  { value: 'protein', label: 'Protein per day (g)' },
  { value: 'water', label: 'Water per day (L)' },
  { value: 'checkins', label: 'Check-ins per week' },
  { value: 'photos', label: 'Photos per week' },
] as const;
export type HabitKey = (typeof HABITS)[number]['value'];

export const RATING_WORDS: Record<'mood' | 'energy' | 'sleep' | 'hunger' | 'stress' | 'soreness', string[]> = {
  mood: ['Low', 'Meh', 'OK', 'Good', 'Great'],
  energy: ['Drained', 'Low', 'OK', 'Good', 'Charged'],
  sleep: ['Awful', 'Poor', 'OK', 'Good', 'Great'],
  hunger: ['None', 'Light', 'Normal', 'Hungry', 'Starving'],
  stress: ['Calm', 'Light', 'Some', 'High', 'Maxed'],
  soreness: ['None', 'Light', 'Some', 'Sore', 'Wrecked'],
};

/* ---------------------------------------------------------------- entities */

export interface TrainingProfile {
  name?: string;
  sex?: Sex;
  birthYear?: number;
  heightCm?: number;
  units: Units;
  activity: ActivityLevel;
}

/** The overall goal and habit targets (one per Training space). */
export interface OverallGoal {
  /** "Lose the last 6 kg and deadlift 2× bodyweight by spring" */
  statement?: string;
  why?: string;
  startDate?: ISODate;
  startWeightKg?: number;
  targetWeightKg?: number;
  targetBodyFat?: number;
  targetDate?: ISODate;
  /** planned weekly change in kg (negative = losing) */
  weeklyRateKg?: number;
  workoutsPerWeek?: number;
  stepsPerDay?: number;
  sleepHours?: number;
  waterLiters?: number;
}

/** A specific target: strength, measurement, habit … */
export interface GoalTarget {
  id: string;
  title: string;
  kind: GoalKind;
  status: GoalStatus;
  /** strength goals */
  exerciseId?: string;
  /** measurement goals: a MeasurementKey; habit goals: a HabitKey */
  metric?: string;
  /** target value in canonical units (kg, cm, %, count) */
  target?: number;
  /** starting value (canonical) */
  start?: number;
  targetDate?: ISODate;
  notes?: string;
}

export interface MacroTargets {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  source?: 'calculator' | 'manual';
  updatedAt?: ISODate;
}

/** Last inputs of the macro calculator. */
export interface CalculatorSettings {
  direction: GoalDirection;
  /** kcal per day added (gain) or removed (lose) */
  adjustKcal: number;
  proteinPerKg: number;
  fatPct: number;
}

export interface Ingredient {
  name: string;
  qty?: number;
  unit?: string;
  aisle?: Aisle;
  /** macros of this quantity (whole recipe) */
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface Meal {
  id: string;
  name: string;
  /** usual slot */
  slot?: MealSlot;
  tags: string[];
  /** servings the ingredient list makes (default 1) */
  servings: number;
  ingredients: Ingredient[];
  /** per-serving macros entered by hand (override the ingredient sum) */
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  prepMinutes?: number;
  notes?: string;
  image?: string;
  favorite?: boolean;
}

export interface PlanEntry {
  id: string;
  date: ISODate;
  slot: MealSlot;
  mealId?: string;
  /** free text when no library meal ("Dinner out") */
  text?: string;
  servings: number;
  eaten?: boolean;
  notes?: string;
}

/** Something eaten that is not (or not only) a planned meal. */
export interface FoodEntry {
  id: string;
  date: ISODate;
  slot?: MealSlot;
  name: string;
  mealId?: string;
  servings?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  time?: string;
  source?: Source;
  notes?: string;
}

export interface GroceryExtra {
  id: string;
  name: string;
  qty?: number;
  unit?: string;
  aisle?: Aisle;
  checked?: boolean;
}

export interface GroceryState {
  from?: ISODate;
  to?: ISODate;
  /** checked keys of generated items (see groceryKey) */
  checked: string[];
  extras: GroceryExtra[];
}

export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
  kind: ExerciseKind;
  equipment?: string;
  notes?: string;
}

export interface ProgramExercise {
  id: string;
  exerciseId?: string;
  sets: number;
  /** "5", "8-10", "AMRAP" */
  reps?: string;
  targetKg?: number;
  rpe?: number;
  restSec?: number;
  notes?: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  focus?: string;
  /** planned weekdays, 0 = Sunday … 6 = Saturday */
  weekdays: number[];
  exercises: ProgramExercise[];
  notes?: string;
}

export interface Program {
  name?: string;
  notes?: string;
  startDate?: ISODate;
  days: ProgramDay[];
}

export interface SessionSet {
  id: string;
  exerciseId?: string;
  kg?: number;
  reps?: number;
  rpe?: number;
  /** timed / cardio sets */
  seconds?: number;
  km?: number;
  warmup?: boolean;
  /** false = planned but not done yet (pre-filled from the program) */
  done?: boolean;
  notes?: string;
}

export interface Session {
  id: string;
  date: ISODate;
  dayId?: string;
  name?: string;
  durationMin?: number;
  /** session effort 1–10 */
  rpe?: number;
  notes?: string;
  sets: SessionSet[];
  source?: Source;
  /** ISO date-time the workout was started (Start); absent = prepared / logged afterwards */
  startedAt?: string;
  /** ISO date-time it was finished (Stop / Finish workout) */
  finishedAt?: string;
}

export interface BodyMetric {
  id: string;
  date: ISODate;
  weightKg?: number;
  bodyFat?: number;
  waistCm?: number;
  chestCm?: number;
  hipsCm?: number;
  armCm?: number;
  thighCm?: number;
  neckCm?: number;
  restingHr?: number;
  notes?: string;
  source?: Source;
}

export interface CheckIn {
  id: string;
  date: ISODate;
  time?: string;
  /** the conversational blurb */
  text?: string;
  mood?: number;
  energy?: number;
  /** sleep quality 1–5 */
  sleep?: number;
  sleepHours?: number;
  hunger?: number;
  stress?: number;
  soreness?: number;
  steps?: number;
  waterL?: number;
  source: Source;
}

export interface ProgressPhoto {
  id: string;
  date: ISODate;
  pose: Pose;
  asset: string;
  notes?: string;
}

export interface CoachNote {
  id: string;
  date: ISODate;
  title: string;
  body?: string;
  pinned?: boolean;
  category?: CoachCategory;
  source: Source;
}

export interface TrainingData {
  /** schema version of this kind's data */
  version: number;
  profile: TrainingProfile;
  goal: OverallGoal;
  goals: GoalTarget[];
  macros: MacroTargets;
  calculator: CalculatorSettings;
  meals: Meal[];
  plan: PlanEntry[];
  food: FoodEntry[];
  grocery: GroceryState;
  exercises: Exercise[];
  program: Program;
  sessions: Session[];
  metrics: BodyMetric[];
  checkIns: CheckIn[];
  photos: ProgressPhoto[];
  coachNotes: CoachNote[];
  /** Ramp up: the gentle, game-like start plan (./ramp.ts); absent until set up */
  ramp?: Ramp;
}

/* ---------------------------------------------------------------- normalize */

const WD_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Weekdays as numbers 0–6 (accepts numbers, "1", "mon", "Monday"). */
export function weekdaysOf(x: unknown): number[] {
  const out = new Set<number>();
  for (const v of Array.isArray(x) ? x : x == null ? [] : [x]) {
    const s = String(v).trim().toLowerCase();
    const n = /^\d$/.test(s) ? Number(s) : WD_NAMES.indexOf(s.slice(0, 3));
    if (n >= 0 && n <= 6) out.add(n);
  }
  return [...out].sort();
}

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);
export function numOr(x: unknown): number | undefined {
  if (typeof x === 'number') return isFinite(x) ? x : undefined;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x.replace(/[,\s]/g, ''));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : undefined);
const oneOf = <T extends string>(x: unknown, opts: { value: T }[], fallback: T): T => (opts.some((o) => o.value === x) ? (x as T) : fallback);
const maybeOneOf = <T extends string>(x: unknown, opts: { value: T }[]): T | undefined => (opts.some((o) => o.value === x) ? (x as T) : undefined);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (x: unknown): string | undefined => (typeof x === 'string' && DATE_RE.test(x) ? x : undefined);
let seq = 0;
const fallbackId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
const withId = (x: Record<string, any>, p: string) => (typeof x.id === 'string' && x.id ? x.id : fallbackId(p));

/** Drop undefined keys (keeps the stored JSON tidy). */
function tidy<T extends Record<string, any>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

export function normalizeIngredient(x: unknown): Ingredient | null {
  if (typeof x === 'string') return x.trim() ? { name: x.trim() } : null;
  if (!isObj(x)) return null;
  const name = str(x.name)?.trim();
  if (!name) return null;
  return tidy({ name, qty: numOr(x.qty), unit: str(x.unit), aisle: maybeOneOf(x.aisle, AISLES), calories: numOr(x.calories), protein: numOr(x.protein), carbs: numOr(x.carbs), fat: numOr(x.fat) });
}

export function normalizeSet(x: Record<string, any>): SessionSet {
  return tidy({ ...x, id: withId(x, 'set'), kg: numOr(x.kg), reps: numOr(x.reps), rpe: numOr(x.rpe), seconds: numOr(x.seconds), km: numOr(x.km) }) as SessionSet;
}

/** Fill in every field (new spaces, older or hand-edited files). Must not throw. */
export function normalizeTraining(raw: unknown): TrainingData {
  const d = isObj(raw) ? raw : {};
  const profile = isObj(d.profile) ? d.profile : {};
  const goal = isObj(d.goal) ? d.goal : {};
  const calc = isObj(d.calculator) ? d.calculator : {};
  const grocery = isObj(d.grocery) ? d.grocery : {};
  const program = isObj(d.program) ? d.program : {};
  return {
    version: 1,
    profile: tidy({
      ...profile,
      units: oneOf(profile.units, [{ value: 'metric' }, { value: 'imperial' }], 'metric'),
      activity: oneOf(profile.activity, ACTIVITY_LEVELS, 'moderate'),
      sex: maybeOneOf(profile.sex, [{ value: 'male' }, { value: 'female' }] as { value: Sex }[]),
      birthYear: numOr(profile.birthYear),
      heightCm: numOr(profile.heightCm),
    }),
    goal: tidy({ ...goal }),
    goals: arr(d.goals)
      .filter(isObj)
      .map((g) => tidy({ ...g, id: withId(g, 'tgoal'), title: str(g.title) ?? 'Goal', kind: oneOf(g.kind, GOAL_KINDS, 'other'), status: oneOf(g.status, GOAL_STATUSES, 'active'), target: numOr(g.target), start: numOr(g.start) })),
    macros: tidy({ ...(isObj(d.macros) ? d.macros : {}) }),
    calculator: {
      direction: oneOf(calc.direction, [{ value: 'lose' }, { value: 'maintain' }, { value: 'gain' }] as { value: GoalDirection }[], 'lose'),
      adjustKcal: numOr(calc.adjustKcal) ?? 450,
      proteinPerKg: numOr(calc.proteinPerKg) ?? 2,
      fatPct: numOr(calc.fatPct) ?? 27,
    },
    meals: arr(d.meals)
      .filter(isObj)
      .map((m) =>
        tidy({
          ...m,
          id: withId(m, 'meal'),
          name: str(m.name) ?? 'Meal',
          slot: maybeOneOf(m.slot, MEAL_SLOTS),
          tags: arr(m.tags).map(String).filter(Boolean),
          servings: Math.max(0.25, numOr(m.servings) ?? 1),
          ingredients: arr(m.ingredients).map(normalizeIngredient).filter((x): x is Ingredient => !!x),
        }),
      ),
    plan: arr(d.plan)
      .filter((p) => isObj(p) && date(p.date))
      .map((p) => tidy({ ...p, id: withId(p, 'plan'), slot: oneOf(p.slot, MEAL_SLOTS, 'lunch'), servings: numOr(p.servings) ?? 1 })),
    food: arr(d.food)
      .filter((f) => isObj(f) && date(f.date))
      .map((f) => tidy({ ...f, id: withId(f, 'food'), name: str(f.name) ?? 'Food' })),
    grocery: {
      from: date(grocery.from),
      to: date(grocery.to),
      checked: arr(grocery.checked).map(String),
      extras: arr(grocery.extras)
        .filter(isObj)
        .map((x) => tidy({ ...x, id: withId(x, 'groc'), name: str(x.name) ?? 'Item', qty: numOr(x.qty), aisle: maybeOneOf(x.aisle, AISLES) })),
    },
    exercises: arr(d.exercises)
      .filter(isObj)
      .map((x) => tidy({ ...x, id: withId(x, 'ex'), name: str(x.name) ?? 'Exercise', muscle: oneOf(x.muscle, MUSCLES, 'other'), kind: oneOf(x.kind, EXERCISE_KINDS, 'weight') })),
    program: {
      ...program,
      days: arr(program.days)
        .filter(isObj)
        .map((day) => ({
          ...day,
          id: withId(day, 'pday'),
          name: str(day.name) ?? 'Day',
          weekdays: weekdaysOf(day.weekdays),
          exercises: arr(day.exercises)
            .filter(isObj)
            .map((x) => tidy({ ...x, id: withId(x, 'pex'), sets: Math.max(1, Math.round(numOr(x.sets) ?? 3)), reps: str(x.reps), targetKg: numOr(x.targetKg), rpe: numOr(x.rpe), restSec: numOr(x.restSec) })),
        })),
    },
    sessions: arr(d.sessions)
      .filter((x) => isObj(x) && date(x.date))
      .map((x) => tidy({ ...x, id: withId(x, 'ses'), sets: arr(x.sets).filter(isObj).map(normalizeSet), durationMin: numOr(x.durationMin), rpe: numOr(x.rpe) })),
    metrics: arr(d.metrics)
      .filter((x) => isObj(x) && date(x.date))
      .map((x) => tidy({ ...x, id: withId(x, 'met') })),
    checkIns: arr(d.checkIns)
      .filter((x) => isObj(x) && date(x.date))
      .map((x) => tidy({ ...x, id: withId(x, 'chk'), source: x.source === 'agent' ? 'agent' : 'me' })),
    photos: arr(d.photos)
      .filter((x) => isObj(x) && date(x.date) && typeof x.asset === 'string' && x.asset)
      .map((x) => tidy({ ...x, id: withId(x, 'pho'), pose: oneOf(x.pose, POSES, 'front') })),
    coachNotes: arr(d.coachNotes)
      .filter(isObj)
      .map((x) => tidy({ ...x, id: withId(x, 'note'), date: date(x.date) ?? todayISO(), title: str(x.title) ?? 'Note', source: x.source === 'me' ? 'me' : 'agent' })),
    ...(normalizeRamp(d.ramp) ? { ramp: normalizeRamp(d.ramp) } : {}),
  };
}
