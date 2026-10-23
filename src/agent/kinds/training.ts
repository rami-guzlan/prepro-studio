/* Agent (MCP) collections, single fields and tools of 'training' spaces.

   Collections / singletons feed the generic data tools (describe_data,
   list_items, add_items, update_items, delete_items, get_fields, set_fields).
   The training_* tools cover the conversational flows: log a whole day in one
   call, report trends + projections, run the macro calculator, build the
   grocery list, add a progress photo and save coach advice.
   Stored units are metric (kg, cm, L); the tools accept lb / in where noted. */
import { importImageFile } from '@/backend';
import { addDays, diffDays, todayISO } from '@/lib/dates';
import { extToMime } from '@/lib/images';
import { uid } from '@/lib/id';
import { updateSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { makeFormatters } from '@/lib/format';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import { defineTool, type ToolDef } from '../tool';
import { arr, bool, enm, int, num, obj, opt, str } from '../schema';
import { clean, fail, normDate, normTime, plural, spaceOf } from '../ctx';
import {
  ACTIVITY_LEVELS,
  AISLES,
  COACH_CATEGORIES,
  EXERCISE_KINDS,
  GOAL_KINDS,
  GOAL_STATUSES,
  HABITS,
  MEAL_SLOTS,
  MEASUREMENTS,
  MUSCLES,
  normalizeTraining,
  POSES,
  type ActivityLevel,
  type CoachCategory,
  type GoalDirection,
  type Pose,
  type Sex,
  type TrainingData,
} from '@/spaces/training/types';
import {
  ageOf,
  bestLifts,
  computeMacros,
  dayEaten,
  goalProgress,
  groceryList,
  latestWeight,
  loggedDates,
  mealMap,
  periodRange,
  qtyText,
  recentPRs,
  round,
  sessionStats,
  strengthTrend,
  streak,
  trainingReport,
  weekStartOf,
  weekStreak,
  weightTrend,
} from '@/spaces/training/calc';
import { addCheckIn, applyMacroResult, ensureExercise, findDay, logMealEaten, makeSet, nowTime, upsertMetric } from '@/spaces/training/ops';
import { PHOTO_MAX } from '@/spaces/training/photoStore';
import { lengthToCm, weightToKg } from '@/spaces/training/units';

type S = any;
const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const req = { required: true };
const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
const NOTES = F('notes', 'text');
const RATING = (name: string, what: string) => F(name, 'integer', { desc: `${what} 1–5 (1 = worst/lowest, 5 = best/highest)` });
/** The training data of a draft (created if missing). */
const T = (d: S): TrainingData => (d.training ??= normalizeTraining({}));
const today = () => todayISO();
const SOURCE = F('source', 'enum', { values: ['me', 'agent'], readOnly: true, desc: 'who logged it' });

/* ================================================================ collections */

export const TRAINING_COLLECTIONS: CollectionDef[] = [
  {
    name: 'meals',
    label: 'Meal library (common meals)',
    module: 'nutrition' as any,
    navParam: 'mealId',
    description:
      'The meals the user eats on repeat. `ingredients` is the whole recipe (for `servings` servings) as [{name, qty, unit, aisle, calories, protein, carbs, fat}] — macros per ingredient are optional; or give per-serving macros directly with calories/protein/carbs/fat (they override the ingredient sum). update_items replaces the whole ingredients list. Plan meals with meal_plan; groceries come from the ingredients.',
    kind: 'array',
    get: (s: S) => s.training?.meals ?? [],
    draft: (d: S) => T(d).meals,
    idPrefix: 'meal',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('slot', 'enum', { values: v(MEAL_SLOTS), desc: 'usual meal of the day' }),
      F('tags', 'string[]', { suggest: ['high protein', 'batch cook', 'quick', 'vegetarian', 'on set', 'post workout'] }),
      F('servings', 'number', { desc: 'servings the ingredient list makes (default 1)' }),
      F('ingredients', 'object[]', { keys: ['name', 'qty', 'unit', 'aisle', 'calories', 'protein', 'carbs', 'fat'], desc: `whole-recipe ingredients; unit e.g. g, ml, pcs, cup, tbsp; aisle one of ${v(AISLES).join(', ')}` }),
      F('calories', 'number', { desc: 'per serving (optional override)' }),
      F('protein', 'number', { desc: 'g per serving (optional override)' }),
      F('carbs', 'number', { desc: 'g per serving (optional override)' }),
      F('fat', 'number', { desc: 'g per serving (optional override)' }),
      F('prepMinutes', 'integer'),
      F('favorite', 'boolean'),
      F('image', 'image'),
      F('notes', 'text', { desc: 'prep notes' }),
    ],
    defaults: () => ({ tags: [], servings: 1, ingredients: [] }),
  },
  {
    name: 'meal_plan',
    label: 'Meal plan entries (date × slot → meal)',
    module: 'nutrition' as any,
    description: 'Planned meals by date and slot (breakfast, lunch, dinner, snack). Use mealId (meal id or name from the meals collection) or free `text` ("Dinner out"). servings scales the meal. Set eaten:true when it was eaten (counts for the day\'s macros). The grocery list is built from the plan (training_grocery_list).',
    kind: 'array',
    get: (s: S) => s.training?.plan ?? [],
    draft: (d: S) => T(d).plan,
    idPrefix: 'plan',
    fields: [F('date', 'date', req), F('slot', 'enum', { ...req, values: v(MEAL_SLOTS) }), F('mealId', 'ref', { ref: 'meals', desc: 'meal id or name' }), F('text', 'string', { desc: 'free text when not a library meal' }), F('servings', 'number'), F('eaten', 'boolean'), NOTES],
    defaults: () => ({ servings: 1 }),
  },
  {
    name: 'food_log',
    label: 'Food log (eaten, besides ticked planned meals)',
    module: 'nutrition' as any,
    description: 'Things eaten that were not a planned meal (or with different macros). Macros are totals for the entry. training_log { meals } is the easy way: it ticks a matching planned meal or adds an entry here, copying the macros of a library meal.',
    kind: 'array',
    get: (s: S) => s.training?.food ?? [],
    draft: (d: S) => T(d).food,
    idPrefix: 'food',
    nameField: 'name',
    fields: [F('date', 'date', req), F('name', 'string', req), F('slot', 'enum', { values: v(MEAL_SLOTS) }), F('mealId', 'ref', { ref: 'meals' }), F('servings', 'number'), F('calories', 'number'), F('protein', 'number', { desc: 'g' }), F('carbs', 'number', { desc: 'g' }), F('fat', 'number', { desc: 'g' }), F('time', 'time'), NOTES, SOURCE],
    defaults: () => ({ source: 'agent' }),
  },
  {
    name: 'grocery_items',
    label: 'Grocery list extras (manual items)',
    module: 'nutrition' as any,
    description: 'Items added to the grocery list by hand (coffee, paper towels …). Ingredients of planned meals are added automatically — read the full list with training_grocery_list.',
    kind: 'array',
    get: (s: S) => s.training?.grocery?.extras ?? [],
    draft: (d: S) => T(d).grocery.extras,
    idPrefix: 'groc',
    nameField: 'name',
    fields: [F('name', 'string', req), F('qty', 'number'), F('unit', 'string'), F('aisle', 'enum', { values: v(AISLES) }), F('checked', 'boolean')],
  },
  {
    name: 'exercises',
    label: 'Exercise library',
    module: 'workouts' as any,
    navParam: 'exercise',
    description: 'Exercises used by the program and sessions. training_log creates missing exercises automatically from names.',
    kind: 'array',
    get: (s: S) => s.training?.exercises ?? [],
    draft: (d: S) => T(d).exercises,
    idPrefix: 'ex',
    nameField: 'name',
    fields: [F('name', 'string', req), F('muscle', 'enum', { values: v(MUSCLES) }), F('kind', 'enum', { values: v(EXERCISE_KINDS), desc: 'weight = weight × reps; bodyweight = reps (+ added kg); time = seconds; cardio = km / seconds' }), F('equipment', 'string'), NOTES],
    defaults: () => ({ muscle: 'other', kind: 'weight' }),
  },
  {
    name: 'program_days',
    label: 'Workout program days',
    module: 'workouts' as any,
    navParam: 'dayId',
    description: 'Named training days of the program (e.g. "Upper A"). Their exercises are the nested program_exercises collection (parentId = the day). weekdays = when it is planned.',
    kind: 'array',
    get: (s: S) => s.training?.program?.days ?? [],
    draft: (d: S) => T(d).program.days,
    idPrefix: 'pday',
    nameField: 'name',
    fields: [F('name', 'string', req), F('focus', 'string'), F('weekdays', 'string[]', { desc: 'planned weekdays: names ("mon", "thu") or numbers 0 = Sunday … 6 = Saturday' }), F('exercises', 'object[]', { readOnly: true, desc: 'use program_exercises' }), NOTES],
    defaults: () => ({ weekdays: [], exercises: [] }),
    hideInList: ['exercises'],
  },
  {
    name: 'program_exercises',
    label: 'Exercises of a program day',
    module: 'workouts' as any,
    description: 'Nested in program_days: pass parentId = day id or name. targetKg is in kg (lb × 0.4536).',
    kind: 'array',
    parent: 'program_days',
    get: (s: S, pid?: string) => s.training?.program?.days?.find((x: any) => x.id === pid)?.exercises,
    draft: (d: S, pid?: string) => T(d).program.days.find((x: any) => x.id === pid)?.exercises,
    idPrefix: 'pex',
    fields: [F('exerciseId', 'ref', { ...req, ref: 'exercises', desc: 'exercise id or name (create it first in exercises)' }), F('sets', 'integer', req), F('reps', 'string', { desc: '"5", "8-10", "AMRAP", "45s"' }), F('targetKg', 'number'), F('rpe', 'number'), F('restSec', 'integer'), NOTES],
    defaults: () => ({ sets: 3, reps: '8-10' }),
  },
  {
    name: 'sessions',
    label: 'Workout sessions',
    module: 'workouts' as any,
    navParam: 'sessionId',
    description: 'Logged workouts. Their sets are the nested session_sets collection (parentId = session id). Easiest: training_log { workout } logs a whole session with its sets in one call (and reports PRs).',
    kind: 'array',
    get: (s: S) => s.training?.sessions ?? [],
    draft: (d: S) => T(d).sessions,
    idPrefix: 'ses',
    nameField: 'name',
    fields: [F('date', 'date', req), F('name', 'string'), F('dayId', 'ref', { ref: 'program_days', desc: 'program day id or name' }), F('durationMin', 'integer'), F('rpe', 'number', { desc: 'session effort 1–10' }), NOTES, F('sets', 'object[]', { readOnly: true, desc: 'use session_sets or training_log' }), SOURCE],
    defaults: () => ({ sets: [], source: 'agent' }),
    hideInList: ['sets'],
  },
  {
    name: 'session_sets',
    label: 'Sets of a workout session',
    module: 'workouts' as any,
    description: 'Nested in sessions: pass parentId = session id. kg in kilograms (lb × 0.4536). done:false = planned but not done yet. Timed sets use seconds; cardio uses km and seconds.',
    kind: 'array',
    parent: 'sessions',
    get: (s: S, pid?: string) => s.training?.sessions?.find((x: any) => x.id === pid)?.sets,
    draft: (d: S, pid?: string) => T(d).sessions.find((x: any) => x.id === pid)?.sets,
    idPrefix: 'set',
    fields: [F('exerciseId', 'ref', { ...req, ref: 'exercises', desc: 'exercise id or name' }), F('kg', 'number'), F('reps', 'integer'), F('rpe', 'number'), F('seconds', 'number'), F('km', 'number'), F('warmup', 'boolean'), F('done', 'boolean'), NOTES],
  },
  {
    name: 'body_metrics',
    label: 'Body metrics (weight, body fat, measurements)',
    module: 'body' as any,
    description: 'One row per day: weightKg, bodyFat %, tape measurements in cm. Prefer training_log (accepts lb / in and merges into the day\'s row) over add_items.',
    kind: 'array',
    get: (s: S) => s.training?.metrics ?? [],
    draft: (d: S) => T(d).metrics,
    idPrefix: 'met',
    fields: [F('date', 'date', req), F('weightKg', 'number'), F('bodyFat', 'number', { desc: '%' }), ...MEASUREMENTS.map((m) => F(m.key, 'number', { desc: `${m.label.toLowerCase()} in cm` })), F('restingHr', 'integer'), NOTES, SOURCE],
    defaults: () => ({ source: 'agent' }),
  },
  {
    name: 'check_ins',
    label: 'Check-ins / journal (conversational blurbs)',
    module: 'coach' as any,
    navParam: 'checkInId',
    description: 'Daily check-ins: a short blurb in the user\'s words (or your summary of the conversation) with optional mood / energy / sleep quality / hunger / stress / soreness 1–5, sleep hours, steps and water. Several per day are fine.',
    kind: 'array',
    get: (s: S) => s.training?.checkIns ?? [],
    draft: (d: S) => T(d).checkIns,
    idPrefix: 'chk',
    fields: [F('date', 'date', req), F('time', 'time'), F('text', 'text'), RATING('mood', 'mood'), RATING('energy', 'energy'), RATING('sleep', 'sleep quality'), RATING('hunger', 'hunger'), RATING('stress', 'stress'), RATING('soreness', 'muscle soreness'), F('sleepHours', 'number'), F('steps', 'integer'), F('waterL', 'number', { desc: 'litres' }), SOURCE],
    defaults: () => ({ source: 'agent' }),
  },
  {
    name: 'photos',
    label: 'Progress photos',
    module: 'photos' as any,
    navParam: 'photoId',
    description: 'Progress photos by date and pose (front, side, back, other). Add new ones with training_add_photo; here you can read them and edit date, pose and notes. The timelapse plays one photo per day per pose.',
    kind: 'array',
    get: (s: S) => s.training?.photos ?? [],
    draft: (d: S) => T(d).photos,
    idPrefix: 'pho',
    fields: [F('date', 'date', req), F('pose', 'enum', { ...req, values: v(POSES) }), F('asset', 'image', { readOnly: true }), NOTES],
    addVia: 'Add progress photos with training_add_photo (path, url or base64 + date + pose).',
  },
  {
    name: 'goals',
    label: 'Specific training targets',
    module: 'goals' as any,
    navParam: 'goalId',
    description: `Targets beyond the overall goal (set the overall goal / target weight with set_fields training.goal.*). kind strength: exerciseId + target 1RM in kg; measurement: metric = ${MEASUREMENTS.map((m) => m.key).join(' | ')} + target cm; body_fat: target %; habit: metric = ${HABITS.map((h) => h.value).join(' | ')} + target; weight: target kg. start = value when the goal was set.`,
    kind: 'array',
    get: (s: S) => s.training?.goals ?? [],
    draft: (d: S) => T(d).goals,
    idPrefix: 'tgoal',
    nameField: 'title',
    fields: [F('title', 'string', req), F('kind', 'enum', { ...req, values: v(GOAL_KINDS) }), F('status', 'enum', { values: v(GOAL_STATUSES) }), F('exerciseId', 'ref', { ref: 'exercises' }), F('metric', 'string'), F('target', 'number'), F('start', 'number'), F('targetDate', 'date'), NOTES],
    defaults: () => ({ status: 'active', kind: 'other' }),
  },
  {
    name: 'coach_notes',
    label: 'Coach notes (saved advice)',
    module: 'coach' as any,
    description: 'Advice and plans worth keeping (shown in Journal & Coach; pinned ones on the progress report). training_coach_note is the shortcut.',
    kind: 'array',
    get: (s: S) => s.training?.coachNotes ?? [],
    draft: (d: S) => T(d).coachNotes,
    idPrefix: 'note',
    nameField: 'title',
    fields: [F('title', 'string', req), F('date', 'date'), F('body', 'text'), F('pinned', 'boolean'), F('category', 'enum', { values: v(COACH_CATEGORIES) }), SOURCE],
    defaults: () => ({ date: today(), source: 'agent', category: 'general' }),
  },
];

export const TRAINING_SINGLETONS: SingletonDef[] = [
  {
    path: 'training.profile',
    label: 'Training profile (used by the macro calculator; units = how the app shows weights)',
    get: (s: S) => s.training?.profile ?? {},
    draft: (d: S) => T(d).profile,
    fields: [F('name', 'string'), F('sex', 'enum', { values: ['male', 'female'] }), F('birthYear', 'integer'), F('heightCm', 'number'), F('units', 'enum', { values: ['metric', 'imperial'] }), F('activity', 'enum', { values: v(ACTIVITY_LEVELS) })],
  },
  {
    path: 'training.goal',
    label: 'Overall goal, target weight / date and habit targets',
    get: (s: S) => s.training?.goal ?? {},
    draft: (d: S) => T(d).goal,
    fields: [
      F('statement', 'text', { desc: 'the overall goal in the user\'s words' }),
      F('why', 'text'),
      F('startDate', 'date'),
      F('startWeightKg', 'number'),
      F('targetWeightKg', 'number'),
      F('targetBodyFat', 'number', { desc: '%' }),
      F('targetDate', 'date'),
      F('weeklyRateKg', 'number', { desc: 'planned change per week in kg, negative = losing' }),
      F('workoutsPerWeek', 'integer'),
      F('stepsPerDay', 'integer'),
      F('sleepHours', 'number'),
      F('waterLiters', 'number'),
    ],
  },
  {
    path: 'training.macros',
    label: 'Daily macro targets (training_macros can calculate them)',
    get: (s: S) => s.training?.macros ?? {},
    draft: (d: S) => T(d).macros,
    fields: [F('calories', 'integer', { desc: 'kcal/day' }), F('proteinG', 'integer'), F('carbsG', 'integer'), F('fatG', 'integer'), F('fiberG', 'integer')],
  },
  {
    path: 'training.program',
    label: 'Workout program info',
    get: (s: S) => s.training?.program ?? {},
    draft: (d: S) => T(d).program,
    fields: [F('name', 'string'), F('notes', 'text'), F('startDate', 'date')],
  },
];

/* ================================================================ helpers */

function data(): TrainingData {
  return normalizeTraining(spaceOf('training').training);
}

function write(fn: (t: TrainingData) => void) {
  spaceOf('training');
  updateSpace((d) => fn(T(d)));
}

function fmtDate() {
  const s = spaceOf('training');
  return makeFormatters(s.settings as any).dateMedium;
}

const rating = (x: unknown, name: string) => {
  if (x == null) return undefined;
  const n = Math.round(Number(x));
  if (!(n >= 1 && n <= 5)) fail(`${name} must be 1–5.`);
  return n;
};

function b64ToBytes(b64: string): Uint8Array {
  const c = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const bin = atob(c);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadImageBytes(src: { path?: string; url?: string; base64?: string; mimeType?: string }): Promise<{ bytes: Uint8Array; mime: string }> {
  const given = [src.path, src.url, src.base64].filter((x) => x != null && x !== '').length;
  if (given !== 1) fail('Pass exactly one of path, url or base64.');
  if (src.base64 != null) {
    const m = /^data:([^;]+);base64,/.exec(src.base64);
    return { bytes: b64ToBytes(src.base64), mime: src.mimeType || m?.[1] || 'image/jpeg' };
  }
  const mcp = window.prepro?.mcp;
  if (!mcp) fail('Importing files needs the desktop app.');
  if (src.path) {
    const f = await mcp.readFile(src.path);
    return { bytes: f.data, mime: extToMime(f.name.split('.').pop() || 'jpg') };
  }
  const r = await mcp.fetchUrl(src.url!);
  const ext = (src.url!.split('?')[0].split('.').pop() || '').toLowerCase();
  return { bytes: r.data, mime: (r.contentType || '').split(';')[0] || extToMime(ext) || 'image/jpeg' };
}

/** Streaks + today's numbers after a change (returned by the logging tools). */
function statusOf(t: TrainingData, date: string) {
  const st = streak(loggedDates(t), today());
  const tr = weightTrend(t);
  const eaten = dayEaten(t, date, mealMap(t));
  const mondayFirst = (spaceOf('training').settings as any)?.weekStartsMonday ?? true;
  return clean({
    streak: { daysLogged: st.current, best: st.best, loggedToday: st.loggedToday, workoutWeeksOnTarget: t.goal.workoutsPerWeek ? weekStreak(t, today(), t.goal.workoutsPerWeek, mondayFirst) : undefined },
    day: { date, eatenKcal: Math.round(eaten.calories), eatenProteinG: Math.round(eaten.protein), targetKcal: t.macros.calories, targetProteinG: t.macros.proteinG },
    weight: tr ? { latestKg: tr.latest.kg, avg7Kg: tr.trendKg, ratePerWeekKg: tr.ratePerWeek, targetKg: tr.targetKg, projectedDate: tr.projectedDate } : undefined,
  });
}

/* ================================================================ tools */

const SET = obj({
  weight: opt(num('weight lifted (in weightUnit; 0 or omit for bodyweight)')),
  reps: opt(int('reps')),
  rpe: opt(num('effort 1–10')),
  seconds: opt(num('timed / cardio sets')),
  km: opt(num('cardio distance')),
  warmup: opt(bool()),
  count: opt(int('repeat this set N times, e.g. 3 for "3×8"', 1)),
});

export const trainingTools: ToolDef[] = [
  defineTool({
    name: 'training_log',
    title: 'Log a training day',
    description:
      'Logs anything from a conversation about the user\'s day in ONE call, in the open Training space (open_training first): morning weight and measurements (kg/lb, cm/in), a check-in blurb with mood / energy / sleep / hunger (1–5), sleep hours, steps, water; meals eaten (library meal names tick the planned meal or copy its macros; free foods need macros you estimate); and a workout with exercises and sets (exercises are created if new). Use it whenever the user tells you how they slept, what they weighed, ate or trained — summarise their words as the check-in text. Returns what was saved, new PRs, today\'s calories/protein vs targets, the logging streak and the weight trend. Not medical advice.',
    global: true,
    input: obj({
      date: opt(str('YYYY-MM-DD (default today)')),
      weight: opt(num('body weight')),
      weightUnit: opt(enm(['kg', 'lb'] as const, 'unit of weight and workout weights (default: the profile units)')),
      bodyFat: opt(num('%')),
      measurements: opt(obj({ waist: opt(num()), chest: opt(num()), hips: opt(num()), arm: opt(num()), thigh: opt(num()), neck: opt(num()) })),
      lengthUnit: opt(enm(['cm', 'in'] as const, 'unit of measurements (default: the profile units)')),
      restingHr: opt(int('resting heart rate')),
      checkIn: opt(
        obj({
          text: opt(str('the blurb — how it is going, in the user\'s words')),
          mood: opt(int('1–5')),
          energy: opt(int('1–5')),
          sleep: opt(int('sleep quality 1–5')),
          hunger: opt(int('1–5')),
          stress: opt(int('1–5')),
          soreness: opt(int('1–5')),
          sleepHours: opt(num()),
          steps: opt(int()),
          waterL: opt(num('litres')),
          time: opt(str('HH:MM')),
        }),
      ),
      meals: opt(
        arr(
          obj({
            meal: opt(str('library meal id or name (list_items meals)')),
            name: opt(str('free-text food when not a library meal')),
            slot: opt(enm(['breakfast', 'lunch', 'dinner', 'snack'] as const)),
            servings: opt(num()),
            calories: opt(num('total kcal (estimate for free foods)')),
            protein: opt(num('g')),
            carbs: opt(num('g')),
            fat: opt(num('g')),
            time: opt(str('HH:MM')),
          }),
          'meals / foods eaten',
        ),
      ),
      workout: opt(
        obj({
          day: opt(str('program day name or id ("Upper A")')),
          name: opt(str('session name (default: the day name)')),
          durationMin: opt(int()),
          rpe: opt(num('session effort 1–10')),
          notes: opt(str()),
          exercises: { ...arr(obj({ exercise: str('exercise name or id'), sets: { ...arr(SET), minItems: 1 }, notes: opt(str()) })), minItems: 1 },
        }),
      ),
    }),
    run(a: any) {
      const s = spaceOf('training');
      const t0 = normalizeTraining(s.training);
      const units = t0.profile.units;
      const date = normDate(a.date) ?? today();
      const saved: Record<string, unknown> = { date };
      const created: string[] = [];
      let sessionId: string | undefined;
      if (a.checkIn) {
        for (const k of ['mood', 'energy', 'sleep', 'hunger', 'stress', 'soreness']) rating(a.checkIn[k], k);
        if (a.checkIn.time) normTime(a.checkIn.time, 'checkIn.time');
      }
      write((t) => {
        // body
        const m: Record<string, number | undefined> = {};
        if (a.weight != null) m.weightKg = round(weightToKg(a.weight, a.weightUnit, units), 2);
        if (a.bodyFat != null) m.bodyFat = a.bodyFat;
        if (a.restingHr != null) m.restingHr = a.restingHr;
        for (const [k, val] of Object.entries(a.measurements ?? {})) if (val != null) m[`${k}Cm`] = round(lengthToCm(Number(val), a.lengthUnit, units), 1);
        if (Object.keys(m).length) {
          upsertMetric(t, date, m, 'agent');
          saved.body = m;
        }
        // check-in
        if (a.checkIn && Object.values(a.checkIn).some((x) => x != null && x !== '')) {
          const c = addCheckIn(t, { date, time: normTime(a.checkIn.time) ?? (date === today() ? nowTime() : undefined), text: a.checkIn.text, mood: rating(a.checkIn.mood, 'mood'), energy: rating(a.checkIn.energy, 'energy'), sleep: rating(a.checkIn.sleep, 'sleep'), hunger: rating(a.checkIn.hunger, 'hunger'), stress: rating(a.checkIn.stress, 'stress'), soreness: rating(a.checkIn.soreness, 'soreness'), sleepHours: a.checkIn.sleepHours, steps: a.checkIn.steps, waterL: a.checkIn.waterL, source: 'agent' });
          saved.checkInId = c.id;
        }
        // meals
        if (a.meals?.length) {
          saved.meals = a.meals.map((x: any) => {
            if (!x.meal && !x.name) fail('Each meal needs `meal` (library meal) or `name`.');
            const r = logMealEaten(t, date, { ...x, time: normTime(x.time), source: 'agent' });
            return `${r.label} (${r.kind === 'plan' ? 'planned meal ticked' : 'food log'})`;
          });
        }
        // workout
        if (a.workout) {
          const w = a.workout;
          const day = w.day ? findDay(t, w.day) : undefined;
          if (w.day && !day) fail(`Unknown program day "${w.day}". Days: ${t.program.days.map((d) => d.name).join(', ') || '(none — omit day)'}`);
          let ses = t.sessions.find((x) => x.date === date && day && x.dayId === day.id);
          if (!ses) {
            t.sessions.push({ id: uid('ses'), date, dayId: day?.id, name: w.name ?? day?.name, sets: [], source: 'agent' });
            ses = t.sessions[t.sessions.length - 1];
            if (!ses.dayId) delete ses.dayId;
            if (!ses.name) delete ses.name;
          }
          if (w.name) ses.name = w.name;
          if (w.durationMin != null) ses.durationMin = w.durationMin;
          if (w.rpe != null) ses.rpe = w.rpe;
          if (w.notes) ses.notes = ses.notes ? `${ses.notes}\n${w.notes}` : w.notes;
          for (const e of w.exercises) {
            const before = t.exercises.length;
            const ex = ensureExercise(t, e.exercise);
            if (t.exercises.length > before) created.push(ex.name);
            // replace planned (not done) sets of this exercise with what was done
            ses.sets = ses.sets.filter((x) => !(x.exerciseId === ex.id && x.done === false));
            for (const st of e.sets) {
              for (let i = 0; i < (st.count ?? 1); i++) {
                const set = makeSet({ exerciseId: ex.id, kg: st.weight ? round(weightToKg(st.weight, a.weightUnit, units), 3) : undefined, reps: st.reps, rpe: st.rpe, seconds: st.seconds, km: st.km, warmup: st.warmup || undefined, notes: i === 0 ? e.notes : undefined });
                for (const k of Object.keys(set) as (keyof typeof set)[]) if (set[k] === undefined) delete set[k];
                ses.sets.push(set);
              }
            }
          }
          sessionId = ses.id;
        }
      });
      const t = data();
      if (sessionId) {
        const ses = t.sessions.find((x) => x.id === sessionId)!;
        const st = sessionStats(ses);
        const prs = recentPRs(t, date, date).filter((p) => ses.sets.some((x) => x.exerciseId === p.exerciseId));
        saved.workout = clean({ sessionId, sets: st.sets, reps: st.reps, volumeKg: st.volume, newPRs: prs.map((p) => `${p.name}: ${p.kg} kg × ${p.reps} (e1RM ${p.e1rm} kg, previous ${p.previous} kg)`), createdExercises: created.length ? created : undefined });
      }
      if (Object.keys(saved).length === 1) fail('Nothing to log — pass weight, measurements, checkIn, meals or workout.');
      const parts = [saved.body && 'body', saved.checkInId && 'check-in', saved.meals && plural((saved.meals as unknown[]).length, 'meal'), saved.workout && 'workout'].filter(Boolean);
      return { data: { saved: clean(saved), ...statusOf(t, date), note: 'Not medical advice.' }, summary: `Logged ${parts.join(', ')} for ${date}` };
    },
  }),

  defineTool({
    name: 'training_report',
    title: 'Training report: trends, adherence, PRs, projections',
    description:
      'Reads the Training space for a period and returns the numbers a coach needs: weight trend (7-day averages, rate/week, projected date to the target), body fat and measurement changes, workouts (count, sets, volume, missed planned days), consistency (days logged, streaks), nutrition adherence (avg calories/protein vs targets), check-in averages (mood, energy, sleep), new PRs, strength trends and goal progress, plus computed insights. Weights in kg, lengths in cm (the profile `units` says what the user prefers to hear). Use it before giving advice; combine with studio_context for holistic coaching. Not medical advice.',
    readOnly: true,
    global: true,
    input: obj({
      period: opt(enm(['7d', '28d', '12w', 'all', 'custom'] as const, 'default 28d')),
      from: opt(str('YYYY-MM-DD (custom)')),
      to: opt(str('YYYY-MM-DD (custom)')),
      sessions: opt(bool('include the list of sessions (default false)')),
    }),
    run(a: { period?: string; from?: string; to?: string; sessions?: boolean }) {
      const t = data();
      const s = spaceOf('training');
      const mondayFirst = (s.settings as any)?.weekStartsMonday ?? true;
      if (a.period === 'custom' && (!a.from || !a.to)) fail('period "custom" needs from and to (YYYY-MM-DD).');
      const { from, to } = periodRange(t, a.period ?? '28d', today(), normDate(a.from, 'from'), normDate(a.to, 'to'));
      const r = trainingReport(t, from, to, today(), mondayFirst);
      const strength = bestLifts(t)
        .slice(0, 8)
        .map((p) => {
          const st = strengthTrend(t, p.exerciseId, today());
          return clean({ exercise: p.name, bestE1rmKg: p.e1rm, bestSet: `${p.kg} kg × ${p.reps}`, bestDate: p.date, currentE1rmKg: st.current, e1rmRatePerWeekKg: st.ratePerWeek });
        });
      const goals = t.goals.filter((g) => g.status === 'active').map((g) => clean({ title: g.title, kind: g.kind, target: g.target, targetDate: g.targetDate, ...goalProgress(t, g, today()) }));
      return {
        data: clean({
          period: { from, to, days: r.days },
          profile: { units: t.profile.units, note: 'values are kg / cm; convert for the user when units = imperial' },
          goal: { statement: t.goal.statement, targetWeightKg: t.goal.targetWeightKg, targetDate: t.goal.targetDate, plannedRatePerWeekKg: t.goal.weeklyRateKg, workoutsPerWeek: t.goal.workoutsPerWeek },
          weight: { ...r.weight, weekly: r.weight.weekly },
          trend: r.trend ? { latestKg: r.trend.latest.kg, latestDate: r.trend.latest.date, avg7Kg: r.trend.trendKg, ratePerWeekKg: r.trend.ratePerWeek, toGoKg: r.trend.toGo, projectedDate: r.trend.projectedDate, neededRatePerWeekKg: r.trend.neededRate, onTrack: r.trend.onTrack, progress: r.trend.progress != null ? round(r.trend.progress, 2) : undefined } : undefined,
          bodyFat: r.bodyFat,
          measurementsCm: r.measurements,
          workouts: { ...r.workouts, sessions: a.sessions ? r.workouts.sessions : undefined },
          consistency: r.consistency,
          nutrition: r.nutrition,
          checkIns: r.checkIns,
          prs: r.prs.map((p) => `${p.date} ${p.name}: ${p.kg} kg × ${p.reps} → e1RM ${p.e1rm} kg (was ${p.previous} kg)`),
          strength,
          goals,
          insights: r.insights.map((i) => `[${i.tone}] ${i.title}: ${i.text}`),
          latestCheckIns: [...t.checkIns]
            .sort((x, y) => y.date.localeCompare(x.date))
            .slice(0, 5)
            .map((c) => clean({ date: c.date, text: c.text, mood: c.mood, energy: c.energy, sleep: c.sleep, sleepHours: c.sleepHours })),
          note: 'Computed from logged data; projections assume the recent rate continues. Not medical advice.',
        }),
      };
    },
  }),

  defineTool({
    name: 'training_macros',
    title: 'Macro calculator',
    description:
      'Calculates daily calorie and macro targets: Mifflin–St Jeor BMR × activity factor = maintenance (TDEE), minus a deficit (lose) or plus a surplus (gain), protein in g per kg body weight, fat as % of calories, carbs = the rest. Missing inputs come from the Training profile and the latest weigh-in. Returns the numbers with the formula and warnings. apply:true saves them as the user\'s targets (and saves the given profile/calculator settings) — only apply after the user agrees. Not medical advice.',
    global: true,
    input: obj({
      sex: opt(enm(['male', 'female'] as const)),
      age: opt(int(undefined, 10)),
      birthYear: opt(int()),
      height: opt(num()),
      heightUnit: opt(enm(['cm', 'in'] as const)),
      weight: opt(num()),
      weightUnit: opt(enm(['kg', 'lb'] as const)),
      activity: opt(enm(['sedentary', 'light', 'moderate', 'active', 'very_active'] as const)),
      goal: opt(enm(['lose', 'maintain', 'gain'] as const)),
      adjustKcal: opt(num('deficit / surplus in kcal per day (default 450 lose, 250 gain)')),
      proteinPerKg: opt(num('g protein per kg (default 2.0)')),
      fatPct: opt(num('% of calories from fat (default 27)')),
      apply: opt(bool('save as the macro targets')),
    }),
    run(a: any) {
      const t = data();
      const units = t.profile.units;
      const day = today();
      const age = a.age ?? (a.birthYear ? Number(day.slice(0, 4)) - a.birthYear : ageOf(t, day));
      const heightCm = a.height != null ? lengthToCm(a.height, a.heightUnit, units) : t.profile.heightCm;
      const weightKg = a.weight != null ? weightToKg(a.weight, a.weightUnit, units) : latestWeight(t)?.kg;
      const direction: GoalDirection = a.goal ?? t.calculator.direction;
      const adjustKcal = a.adjustKcal ?? (a.goal && a.goal !== t.calculator.direction ? (a.goal === 'gain' ? 250 : 450) : t.calculator.adjustKcal);
      const input = { sex: (a.sex ?? t.profile.sex) as Sex | undefined, age, heightCm, weightKg, activity: (a.activity ?? t.profile.activity) as ActivityLevel, direction, adjustKcal, proteinPerKg: a.proteinPerKg ?? t.calculator.proteinPerKg, fatPct: a.fatPct ?? t.calculator.fatPct };
      const r = computeMacros(input);
      if (!r.ok) fail(`Missing ${r.missing.join(', ')} — pass them (or set them in training.profile / log a weight).`);
      if (a.apply) {
        write((tr) => {
          applyMacroResult(tr, r, day);
          tr.calculator = { direction, adjustKcal, proteinPerKg: input.proteinPerKg, fatPct: input.fatPct };
          if (a.sex) tr.profile.sex = a.sex;
          if (a.birthYear) tr.profile.birthYear = a.birthYear;
          else if (a.age) tr.profile.birthYear = Number(day.slice(0, 4)) - a.age;
          if (a.height != null) tr.profile.heightCm = round(heightCm!, 1);
          if (a.activity) tr.profile.activity = a.activity;
          if (a.weight != null) upsertMetric(tr, day, { weightKg: round(weightKg!, 2) }, 'agent');
        });
      }
      return {
        data: clean({
          inputs: { ...input, heightCm: input.heightCm != null ? round(input.heightCm, 1) : undefined, weightKg: input.weightKg != null ? round(input.weightKg, 1) : undefined },
          bmr: r.bmr,
          tdee: r.tdee,
          targets: { calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG },
          split: { protein: `${Math.round(r.split.protein * 100)}%`, carbs: `${Math.round(r.split.carbs * 100)}%`, fat: `${Math.round(r.split.fat * 100)}%` },
          formula: r.formula,
          warnings: r.warnings.length ? r.warnings : undefined,
          applied: !!a.apply,
          previousTargets: t.macros.calories ? { calories: t.macros.calories, proteinG: t.macros.proteinG, carbsG: t.macros.carbsG, fatG: t.macros.fatG } : undefined,
          note: 'Estimates for healthy adults — not medical advice.',
        }),
        summary: a.apply ? `Set macro targets: ${r.calories} kcal · ${r.proteinG} g protein` : undefined,
      };
    },
  }),

  defineTool({
    name: 'training_grocery_list',
    title: 'Grocery list for a date range',
    description: 'Adds up the ingredients of every meal planned (meal_plan) between from and to — scaled by servings — and groups them by aisle, plus the manual extras (grocery_items), with what is already checked off. Default: the current plan week. showInApp:true also sets this range on the Groceries tab and opens it.',
    global: true,
    input: obj({ from: opt(str('YYYY-MM-DD')), to: opt(str('YYYY-MM-DD')), showInApp: opt(bool()) }),
    run(a: { from?: string; to?: string; showInApp?: boolean }) {
      const t = data();
      const s = spaceOf('training');
      const wk = weekStartOf(today(), (s.settings as any)?.weekStartsMonday ?? true);
      const from = normDate(a.from, 'from') ?? wk;
      const to = normDate(a.to, 'to') ?? addDays(from, 6);
      if (to < from) fail('`to` is before `from`.');
      const lines = groceryList(t, from, to);
      if (a.showInApp) {
        write((tr) => {
          tr.grocery.from = from;
          tr.grocery.to = to;
        });
        navigateSpace('nutrition', { tab: 'groceries' });
      }
      const byAisle: Record<string, unknown[]> = {};
      for (const l of lines) (byAisle[AISLES.find((x) => x.value === l.aisle)?.label ?? 'Other'] ??= []).push(clean({ item: l.name, qty: qtyText(l.qty, l.unit) || undefined, for: l.meals.length ? l.meals.join(', ') : 'extra', checked: l.checked || undefined }));
      const planned = t.plan.filter((e) => e.date >= from && e.date <= to);
      return {
        data: {
          from,
          to,
          plannedMeals: planned.length,
          unplannedDays: Array.from({ length: Math.min(31, diffDays(from, to) + 1) }, (_, i) => addDays(from, i)).filter((d) => !planned.some((e) => e.date === d)),
          items: lines.length,
          checked: lines.filter((l) => l.checked).length,
          byAisle,
        },
        summary: a.showInApp ? `Grocery list ${from} – ${to}` : undefined,
      };
    },
  }),

  defineTool({
    name: 'training_add_photo',
    title: 'Add a progress photo',
    description: 'Stores a progress photo in Training for a date and pose (front, side, back, other) — from an absolute file path on this computer, an http(s) URL, or base64 data. One photo per day per pose makes the timelapse; a second photo the same day and pose replaces it in the timelapse (both are kept in the gallery). Large photos are downscaled.',
    global: true,
    input: obj({
      path: opt(str('absolute path of an image file')),
      url: opt(str('http(s) URL')),
      base64: opt(str('base64 image data or a data: URL')),
      mimeType: opt(str('for base64: image/jpeg, image/png …')),
      date: opt(str('YYYY-MM-DD (default today)')),
      pose: enm(['front', 'side', 'back', 'other'] as const),
      notes: opt(str()),
    }),
    async run(a: { path?: string; url?: string; base64?: string; mimeType?: string; date?: string; pose: Pose; notes?: string }) {
      spaceOf('training');
      const date = normDate(a.date) ?? today();
      const { bytes, mime } = await loadImageBytes(a);
      if (!/^image\//.test(mime)) fail(`Not an image (${mime}).`);
      const asset = await importImageFile(new Blob([bytes as BlobPart], { type: mime }), PHOTO_MAX);
      const id = uid('pho');
      write((t) => {
        t.photos.push(clean({ id, date, pose: a.pose, asset, notes: a.notes }));
        t.photos.sort((x, y) => x.date.localeCompare(y.date));
      });
      const t = data();
      const days = new Set(t.photos.filter((p) => p.pose === a.pose).map((p) => p.date)).size;
      return { data: { id, asset, date, pose: a.pose, timelapseFrames: days, show: { module: 'photos', params: { photoId: id } } }, summary: `Added a ${a.pose} progress photo (${date})` };
    },
  }),

  defineTool({
    name: 'training_ramp',
    title: 'Ramp up coach',
    description:
      'Ramp up is a gentle, game-like start plan for someone finding it hard to get to the gym: four stages (Show up, Make it a habit, Build, Own it), each needing a number of weeks where the weekly target was met, so missed weeks never push them into harder work. Wins: "full" (the mission, 10 pts), "mini" (the 10-minute bad-day version, 6 pts, still counts for the week), "move" (any movement, 3 pts, points only). Finished workouts in Workouts count as full. Actions: "status" (stage, this week, today\'s mission, level, badges, what unlocks next, the user\'s why and reward); "setup" (where gym/home, goalDays 2–5, minutesNow, why, reward; keeps existing wins); "log_win" (kind, date default today, minutes, note); "undo_win" (winId); "hold" (weeks: stay longer at the current stage during a busy patch; 0 = back to normal); "add_to_program" (puts the current stage\'s workouts in the Program). Coach warmly and briefly, celebrate every win, never guilt. General fitness guidance, not medical advice.',
    global: true,
    input: obj({
      action: enm(['status', 'setup', 'log_win', 'undo_win', 'hold', 'add_to_program'] as const),
      where: opt(enm(['gym', 'home'] as const)),
      goalDays: opt(int('setup: days a week to end up at (2–5)')),
      minutesNow: opt(int('setup: minutes they can do right now')),
      why: opt(str('setup: their reason, shown on the mission')),
      reward: opt(str('setup: treat for each new level')),
      kind: opt(enm(['full', 'mini', 'move'] as const)),
      date: opt(str('YYYY-MM-DD (default today)')),
      minutes: opt(int()),
      note: opt(str()),
      winId: opt(str()),
      weeks: opt(int('hold: extra weeks at this stage (0 = none)')),
    }),
    async run(a: { action: 'status' | 'setup' | 'log_win' | 'undo_win' | 'hold' | 'add_to_program'; where?: 'gym' | 'home'; goalDays?: number; minutesNow?: number; why?: string; reward?: string; kind?: 'full' | 'mini' | 'move'; date?: string; minutes?: number; note?: string; winId?: string; weeks?: number }) {
      spaceOf('training');
      const R = await import('@/spaces/training/ramp');
      const status = () => R.rampSummary(data(), today());
      if (a.action === 'setup') {
        write((t) => R.setupRamp(t, { where: a.where, goalDays: a.goalDays, minutesNow: a.minutesNow, why: a.why, reward: a.reward, startDate: t.ramp?.startDate ?? today() }));
        return { data: { ramp: status(), show: { module: 'ramp' } }, summary: 'Set up Ramp up' };
      }
      if (!data().ramp) fail('Ramp up is not set up yet. Ask where they will train, how many days a week they want to end up at, how long they can do now and why, then call action "setup".');
      if (a.action === 'status') {
        const s = R.rampStatus(data(), today())!;
        return { data: { ...status(), mission: s.mission, recentWins: s.ramp.wins.slice(-6) } };
      }
      if (a.action === 'log_win') {
        const before = R.rampStatus(data(), today())!;
        const date = normDate(a.date) ?? today();
        let id = '';
        write((t) => void (id = R.addWin(t, clean({ date, kind: a.kind ?? 'full', minutes: a.minutes, note: a.note, source: 'agent' as const }))));
        const after = R.rampStatus(data(), today())!;
        const news = [
          after.level.index > before.level.index ? `level up to ${after.level.name}${after.ramp.reward ? ` (reward: ${after.ramp.reward})` : ''}` : '',
          ...after.badges.filter((b) => b.earned && !before.badges.find((x) => x.id === b.id)?.earned).map((b) => `badge: ${b.name}`),
          after.week.met && !before.week.met ? 'week target hit' : '',
        ].filter(Boolean);
        return { data: { winId: id, pointsGained: after.points - before.points, celebrate: news, ramp: status() }, summary: `Logged a ${a.kind ?? 'full'} win (${date})` };
      }
      if (a.action === 'undo_win') {
        if (!a.winId) fail('undo_win needs winId (see status → recentWins).');
        write((t) => R.removeWin(t, a.winId!));
        return { data: { ramp: status() }, summary: 'Removed a win' };
      }
      if (a.action === 'hold') {
        const s = R.rampStatus(data(), today())!;
        write((t) => R.holdStage(t, s.stage.id, a.weeks ?? 1));
        return { data: { ramp: status() }, summary: a.weeks === 0 ? 'Back to the normal ramp pace' : `Staying ${a.weeks ?? 1} more week(s) at ${s.stage.name}` };
      }
      const s = R.rampStatus(data(), today())!;
      let ids: string[] = [];
      write((t) => void (ids = R.rampToProgram(t, s.stage, s.ramp.where)));
      return { data: { programDayIds: ids, show: { module: 'workouts', params: { tab: 'program' } } }, summary: `Added ${s.stage.name} to the Program` };
    },
  }),

  defineTool({
    name: 'training_coach_note',
    title: 'Save coach advice',
    description: 'Saves advice, a plan or an observation to Journal & Coach so the user can come back to it (pinned notes also print on the progress report). Keep it short and actionable. Pass id to update an existing note. Frame health advice as general guidance, not medical advice.',
    global: true,
    input: obj({
      title: str('short headline'),
      body: opt(str('the advice (a few sentences or bullets)')),
      category: opt(enm(['general', 'nutrition', 'training', 'recovery', 'mindset'] as const)),
      pinned: opt(bool()),
      date: opt(str('YYYY-MM-DD (default today)')),
      id: opt(str('update this note instead of adding one')),
    }),
    run(a: { title: string; body?: string; category?: CoachCategory; pinned?: boolean; date?: string; id?: string }) {
      spaceOf('training');
      const date = normDate(a.date) ?? today();
      let id = a.id ?? uid('note');
      write((t) => {
        const ex = a.id ? t.coachNotes.find((n) => n.id === a.id || n.title.toLowerCase() === a.id!.toLowerCase()) : undefined;
        if (a.id && !ex) fail(`Unknown coach note "${a.id}".`);
        if (ex) {
          id = ex.id;
          Object.assign(ex, clean({ title: a.title, body: a.body, category: a.category, date: a.date ? date : undefined }));
          if (a.pinned != null) {
            if (a.pinned) ex.pinned = true;
            else delete ex.pinned;
          }
        } else t.coachNotes.push(clean({ id, date, title: a.title.trim(), body: a.body, category: a.category ?? 'general', pinned: a.pinned || undefined, source: 'agent' as const }));
      });
      return { data: { id, saved: true, date: fmtDate()(date) }, summary: `Saved coach note “${a.title}”` };
    },
  }),
];

