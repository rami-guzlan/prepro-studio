/* Sample training data for the self-test and demos: 8 weeks of a fictional
   person ("Alex") cutting from 84.6 kg towards 78 kg on a 4-day upper/lower
   program. Dates are relative to today so every screen looks current.
   sampleTraining() is pure data (no photos); seedSamplePhotos(spaceId, t) adds
   generated SVG silhouettes as progress photos (front, every other day) when a
   space id is available. */
import { addDays, todayISO } from '@/lib/dates';
import { backend } from '@/backend';
import { normalizeTraining, type CheckIn, type Exercise, type Meal, type PlanEntry, type ProgramDay, type Session, type TrainingData } from './types';
import { computeMacros, weekStartOf } from './calc';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r25 = (n: number) => Math.round(n / 2.5) * 2.5;

const EXERCISES: [string, Exercise['muscle'], Exercise['kind'], string?][] = [
  ['Bench press', 'chest', 'weight', 'Barbell'],
  ['Barbell row', 'back', 'weight', 'Barbell'],
  ['Overhead press', 'shoulders', 'weight', 'Barbell'],
  ['Pull-up', 'back', 'bodyweight', 'Bodyweight'],
  ['Triceps pushdown', 'triceps', 'weight', 'Cable'],
  ['Back squat', 'quads', 'weight', 'Barbell'],
  ['Romanian deadlift', 'hamstrings', 'weight', 'Barbell'],
  ['Leg press', 'quads', 'weight', 'Machine'],
  ['Standing calf raise', 'calves', 'weight', 'Machine'],
  ['Incline dumbbell press', 'chest', 'weight', 'Dumbbells'],
  ['Lat pulldown', 'back', 'weight', 'Cable'],
  ['Lateral raise', 'shoulders', 'weight', 'Dumbbells'],
  ['Deadlift', 'back', 'weight', 'Barbell'],
  ['Hip thrust', 'glutes', 'weight', 'Barbell'],
  ['Plank', 'core', 'time', 'Bodyweight'],
];

/** [exercise, sets, reps, start kg, kg added per 2 weeks] */
const DAYS: { name: string; focus: string; weekday: number; ex: [string, number, string, number, number][] }[] = [
  { name: 'Upper A', focus: 'Strength', weekday: 1, ex: [['Bench press', 4, '5', 80, 2.5], ['Barbell row', 4, '6', 70, 2.5], ['Overhead press', 3, '8', 45, 1.25], ['Pull-up', 3, '8', 0, 0], ['Triceps pushdown', 2, '12', 30, 1.25]] },
  { name: 'Lower A', focus: 'Strength', weekday: 2, ex: [['Back squat', 4, '5', 105, 2.5], ['Romanian deadlift', 3, '8', 90, 2.5], ['Leg press', 3, '10', 160, 5], ['Standing calf raise', 3, '12', 60, 2.5]] },
  { name: 'Upper B', focus: 'Hypertrophy', weekday: 4, ex: [['Incline dumbbell press', 3, '8-10', 30, 1], ['Lat pulldown', 3, '10-12', 60, 2.5], ['Lateral raise', 3, '15', 10, 0.5], ['Triceps pushdown', 2, '12', 30, 1.25]] },
  { name: 'Lower B', focus: 'Posterior chain', weekday: 5, ex: [['Deadlift', 3, '5', 140, 2.5], ['Hip thrust', 3, '10', 110, 5], ['Leg press', 3, '12', 150, 5], ['Plank', 3, '45s', 0, 0]] },
];

const MEALS: Omit<Meal, 'id'>[] = [
  {
    name: 'Overnight oats with berries',
    slot: 'breakfast',
    tags: ['high protein', 'make ahead'],
    servings: 1,
    prepMinutes: 5,
    notes: 'Mix the night before; keeps 3 days. Add the berries in the morning.',
    favorite: true,
    ingredients: [
      { name: 'Rolled oats', qty: 70, unit: 'g', aisle: 'pantry', calories: 263, protein: 9, carbs: 45, fat: 5 },
      { name: 'Skyr', qty: 150, unit: 'g', aisle: 'dairy', calories: 95, protein: 17, carbs: 6, fat: 0 },
      { name: 'Milk', qty: 150, unit: 'ml', aisle: 'dairy', calories: 75, protein: 5, carbs: 7, fat: 3 },
      { name: 'Blueberries', qty: 100, unit: 'g', aisle: 'produce', calories: 57, protein: 1, carbs: 14, fat: 0 },
      { name: 'Chia seeds', qty: 10, unit: 'g', aisle: 'pantry', calories: 49, protein: 2, carbs: 4, fat: 3 },
    ],
  },
  {
    name: 'Egg & spinach scramble on sourdough',
    slot: 'breakfast',
    tags: ['quick'],
    servings: 1,
    prepMinutes: 10,
    ingredients: [
      { name: 'Eggs', qty: 3, unit: 'pcs', aisle: 'dairy', calories: 216, protein: 19, carbs: 1, fat: 15 },
      { name: 'Egg whites', qty: 100, unit: 'ml', aisle: 'dairy', calories: 52, protein: 11, carbs: 1, fat: 0 },
      { name: 'Spinach', qty: 50, unit: 'g', aisle: 'produce', calories: 12, protein: 1, carbs: 2, fat: 0 },
      { name: 'Sourdough bread', qty: 1, unit: 'slice', aisle: 'bakery', calories: 130, protein: 5, carbs: 25, fat: 1 },
    ],
  },
  {
    name: 'Chicken rice bowl (batch)',
    slot: 'lunch',
    tags: ['batch cook', 'high protein'],
    servings: 4,
    prepMinutes: 40,
    notes: 'Sunday batch: bake the chicken at 200 °C for 22 min, cook the rice, steam the broccoli. Portion into 4 boxes.',
    favorite: true,
    ingredients: [
      { name: 'Chicken breast', qty: 800, unit: 'g', aisle: 'meat', calories: 880, protein: 184, carbs: 0, fat: 12 },
      { name: 'Jasmine rice', qty: 320, unit: 'g', aisle: 'pantry', calories: 1150, protein: 22, carbs: 252, fat: 2 },
      { name: 'Broccoli', qty: 600, unit: 'g', aisle: 'produce', calories: 204, protein: 17, carbs: 40, fat: 2 },
      { name: 'Soy sauce', qty: 60, unit: 'ml', aisle: 'spices', calories: 32, protein: 5, carbs: 3, fat: 0 },
      { name: 'Olive oil', qty: 20, unit: 'ml', aisle: 'pantry', calories: 177, protein: 0, carbs: 0, fat: 20 },
    ],
  },
  {
    name: 'Turkey & hummus wrap',
    slot: 'lunch',
    tags: ['quick', 'on set'],
    servings: 1,
    prepMinutes: 5,
    ingredients: [
      { name: 'Wholewheat tortilla', qty: 1, unit: 'pcs', aisle: 'bakery', calories: 190, protein: 6, carbs: 32, fat: 4 },
      { name: 'Sliced turkey', qty: 120, unit: 'g', aisle: 'meat', calories: 130, protein: 26, carbs: 2, fat: 2 },
      { name: 'Hummus', qty: 40, unit: 'g', aisle: 'pantry', calories: 100, protein: 3, carbs: 6, fat: 7 },
      { name: 'Mixed salad leaves', qty: 40, unit: 'g', aisle: 'produce', calories: 8, protein: 1, carbs: 1, fat: 0 },
    ],
  },
  {
    name: 'Salmon, potatoes & green beans',
    slot: 'dinner',
    tags: ['omega-3'],
    servings: 2,
    prepMinutes: 30,
    ingredients: [
      { name: 'Salmon fillet', qty: 300, unit: 'g', aisle: 'meat', calories: 620, protein: 60, carbs: 0, fat: 40 },
      { name: 'Baby potatoes', qty: 500, unit: 'g', aisle: 'produce', calories: 385, protein: 10, carbs: 85, fat: 1 },
      { name: 'Green beans', qty: 300, unit: 'g', aisle: 'produce', calories: 93, protein: 5, carbs: 21, fat: 0 },
      { name: 'Lemon', qty: 1, unit: 'pcs', aisle: 'produce', calories: 17, protein: 1, carbs: 5, fat: 0 },
    ],
  },
  {
    name: 'Lean beef chili',
    slot: 'dinner',
    tags: ['batch cook', 'freezer'],
    servings: 6,
    prepMinutes: 60,
    notes: 'Freeze 3 portions. Serve with 50 g rice or on its own.',
    ingredients: [
      { name: 'Lean ground beef (5%)', qty: 1000, unit: 'g', aisle: 'meat', calories: 1370, protein: 210, carbs: 0, fat: 50 },
      { name: 'Kidney beans (canned)', qty: 2, unit: 'can', aisle: 'pantry', calories: 560, protein: 36, carbs: 96, fat: 2 },
      { name: 'Chopped tomatoes (canned)', qty: 2, unit: 'can', aisle: 'pantry', calories: 160, protein: 8, carbs: 28, fat: 1 },
      { name: 'Onion', qty: 2, unit: 'pcs', aisle: 'produce', calories: 88, protein: 2, carbs: 20, fat: 0 },
      { name: 'Bell pepper', qty: 2, unit: 'pcs', aisle: 'produce', calories: 60, protein: 2, carbs: 14, fat: 0 },
      { name: 'Chili spice mix', qty: 2, unit: 'tbsp', aisle: 'spices', calories: 30, protein: 1, carbs: 5, fat: 1 },
      { name: 'Jasmine rice', qty: 300, unit: 'g', aisle: 'pantry', calories: 1080, protein: 21, carbs: 236, fat: 2 },
    ],
  },
  {
    name: 'Greek yogurt, honey & walnuts',
    slot: 'snack',
    tags: ['sweet tooth'],
    servings: 1,
    prepMinutes: 2,
    ingredients: [
      { name: 'Greek yogurt 2%', qty: 200, unit: 'g', aisle: 'dairy', calories: 146, protein: 20, carbs: 8, fat: 4 },
      { name: 'Honey', qty: 10, unit: 'g', aisle: 'pantry', calories: 30, protein: 0, carbs: 8, fat: 0 },
      { name: 'Walnuts', qty: 15, unit: 'g', aisle: 'pantry', calories: 98, protein: 2, carbs: 2, fat: 10 },
    ],
  },
  {
    name: 'Protein shake & banana',
    slot: 'snack',
    tags: ['post workout', 'on set'],
    servings: 1,
    prepMinutes: 1,
    calories: 245,
    protein: 26,
    carbs: 30,
    fat: 2,
    ingredients: [
      { name: 'Whey protein', qty: 1, unit: 'scoop', aisle: 'pantry' },
      { name: 'Banana', qty: 1, unit: 'pcs', aisle: 'produce' },
    ],
  },
];

const BLURBS: [string, Partial<CheckIn>][] = [
  ['First week of the cut. Hungry around 4pm but the overnight oats keep me full till lunch.', { mood: 4, energy: 3, hunger: 4, sleep: 3, sleepHours: 7 }],
  ['Squats felt heavy, slept badly after the late edit session.', { mood: 3, energy: 2, sleep: 2, sleepHours: 5.5, stress: 4 }],
  ['Great bench day, 85 for 5 moved fast. Batch-cooked chicken bowls for the week.', { mood: 5, energy: 4, sleep: 4, sleepHours: 7.5 }],
  ['Long shoot day, only ate the wrap and a shake. Need to pack more food for set days.', { mood: 3, energy: 3, hunger: 4, sleepHours: 6.5, steps: 14200 }],
  ['Rest day, long walk with the dog. Weight down a bit.', { mood: 4, energy: 4, sleep: 4, sleepHours: 8, steps: 12800 }],
  ['Weekend pizza with friends — back on track today.', { mood: 4, energy: 3, hunger: 3, sleepHours: 7 }],
  ['Deadlifts 145 for 5, grip was the limit. Bought chalk.', { mood: 4, energy: 4, soreness: 3, sleepHours: 7.5 }],
  ['Stressful client call; ate on autopilot in the evening.', { mood: 2, energy: 2, stress: 5, hunger: 4, sleepHours: 6 }],
  ['Slept 8 hours, energy way up. Hit protein easily.', { mood: 5, energy: 5, sleep: 5, sleepHours: 8.2 }],
  ['Travel day to the location scout; protein bars and a salad. Skipped the gym.', { mood: 3, energy: 3, sleepHours: 6, steps: 9800 }],
  ['Back in the gym. Rows felt strong, shoulders a little tight.', { mood: 4, energy: 4, soreness: 2, sleepHours: 7.2 }],
  ['Waist measurement down 2 cm since the start — clothes fitting better.', { mood: 5, energy: 4, sleepHours: 7.4 }],
  ['Cravings after dinner again. Added the yogurt snack and it helped.', { mood: 3, energy: 3, hunger: 4, sleepHours: 7 }],
  ['Edit deadline week. Short sleep, kept the workouts short but did them.', { mood: 3, energy: 2, stress: 4, sleep: 2, sleepHours: 5.8 }],
  ['Deadline done! Celebrated with a long sleep. Lower B felt amazing.', { mood: 5, energy: 5, sleep: 5, sleepHours: 8.5 }],
  ['Scale up 0.6 after salty sushi, not worried — the average is still going down.', { mood: 4, energy: 4, sleepHours: 7 }],
  ['Incline press up a dumbbell size. Pull-ups now 3×8 bodyweight.', { mood: 5, energy: 4, soreness: 2, sleepHours: 7.6 }],
  ['Busy day on set, 16k steps. Ate the chili and a shake.', { mood: 4, energy: 3, hunger: 3, sleepHours: 6.8, steps: 16100 }],
  ['Felt flat in training, probably under-ate yesterday.', { mood: 3, energy: 2, hunger: 4, sleepHours: 7 }],
  ['Meal prep Sunday: chicken bowls + chili. Week planned.', { mood: 4, energy: 4, sleepHours: 7.8, steps: 8800 }],
  ['Squat 117.5 for 5 — PR! Knees fine.', { mood: 5, energy: 5, sleep: 4, sleepHours: 7.5 }],
  ['Good day overall. Water intake better with the big bottle on my desk.', { mood: 4, energy: 4, sleepHours: 7.2, waterL: 3 }],
  ['A bit sore from leg day, walked it off.', { mood: 4, energy: 3, soreness: 4, sleepHours: 7, steps: 10400 }],
  ['Weigh-in lowest so far. Energy steady even on the cut.', { mood: 5, energy: 4, sleep: 4, sleepHours: 7.6 }],
  ['Slept badly (neighbours), but kept to the plan.', { mood: 3, energy: 3, sleep: 2, sleepHours: 6.2 }],
];

let n = 0;
const id = (p: string) => `${p}-s${(n++).toString(36)}`;

export function sampleTraining(today: string = todayISO()): TrainingData {
  n = 0;
  const rand = rng(42);
  const start = addDays(today, -55);
  const t = normalizeTraining({});

  t.profile = { name: 'Alex', sex: 'male', birthYear: Number(today.slice(0, 4)) - 34, heightCm: 180, units: 'metric', activity: 'moderate' };
  t.goal = {
    statement: 'Get down to 78 kg without losing strength — and pull a 185 kg deadlift by spring.',
    why: 'More energy on long shoot days, feel good on camera, and keep up with the kids.',
    startDate: start,
    startWeightKg: 84.6,
    targetWeightKg: 78,
    targetDate: addDays(today, 112),
    weeklyRateKg: -0.5,
    workoutsPerWeek: 4,
    stepsPerDay: 9000,
    sleepHours: 7.5,
    waterLiters: 3,
  };
  t.calculator = { direction: 'lose', adjustKcal: 450, proteinPerKg: 2.1, fatPct: 27 };

  // exercises & program
  t.exercises = EXERCISES.map(([name, muscle, kind, equipment]) => ({ id: id('ex'), name, muscle, kind, equipment }));
  const exId = (name: string) => t.exercises.find((e) => e.name === name)!.id;
  const days: ProgramDay[] = DAYS.map((d) => ({
    id: id('pday'),
    name: d.name,
    focus: d.focus,
    weekdays: [d.weekday],
    exercises: d.ex.map(([name, sets, reps, kg]) => ({ id: id('pex'), exerciseId: exId(name), sets, reps, targetKg: kg ? kg + 7.5 : undefined, restSec: sets >= 4 ? 150 : 90, rpe: sets >= 4 ? 8 : undefined })),
  }));
  for (const d of days) for (const x of d.exercises) for (const k of Object.keys(x) as (keyof typeof x)[]) if (x[k] === undefined) delete x[k];
  t.program = { name: 'Upper / lower — cut', notes: 'Add 2.5 kg when every set hits the top of the rep range. Keep 1–2 reps in reserve on the cut.', startDate: start, days };

  // sessions: follow the weekday plan with a few misses
  const sessions: Session[] = [];
  for (let i = 0; i < 56; i++) {
    const date = addDays(start, i);
    if (date >= today) break;
    const wd = new Date(`${date}T12:00:00`).getDay();
    const di = DAYS.findIndex((d) => d.weekday === wd);
    if (di < 0) continue;
    if (rand() < 0.2) continue; // missed
    const week = Math.floor(i / 7);
    const def = DAYS[di];
    const s: Session = { id: id('ses'), date, dayId: days[di].id, name: def.name, sets: [], durationMin: 50 + Math.round(rand() * 25), rpe: 7 + Math.round(rand() * 2), source: i % 9 === 0 ? 'agent' : 'me' };
    def.ex.forEach(([name, sets, reps, kg, inc], k) => {
      const ex = exId(name);
      const base = kg ? r25(kg + inc * Math.floor(week / 2)) : 0;
      const top = name === 'Back squat' && week >= 6 ? 117.5 : base;
      if (k === 0 && kg) s.sets.push({ id: id('set'), exerciseId: ex, kg: r25(top * 0.6), reps: 8, warmup: true });
      const target = parseInt(reps, 10);
      for (let j = 0; j < sets; j++) {
        if (name === 'Plank') s.sets.push({ id: id('set'), exerciseId: ex, seconds: 40 + week * 3 });
        else if (name === 'Pull-up') s.sets.push({ id: id('set'), exerciseId: ex, reps: Math.min(10, 5 + Math.floor(week / 2) + (j === 0 ? 1 : 0)), rpe: 8 });
        else s.sets.push({ id: id('set'), exerciseId: ex, kg: top, reps: Math.max(1, target + (rand() < 0.25 ? -1 : 0) + (j === 0 && rand() < 0.3 ? 1 : 0)), rpe: j === sets - 1 ? 8.5 : 7.5 });
      }
    });
    sessions.push(s);
  }
  t.sessions = sessions;

  // body metrics
  let w = 84.6;
  for (let i = 0; i < 56; i++) {
    const date = addDays(start, i);
    if (date > today) break;
    w -= 0.068 + (rand() - 0.5) * 0.02;
    if (rand() < 0.2 && i % 7 !== 0) continue; // skipped weigh-in
    const noise = (rand() - 0.5) * 0.8 + (new Date(`${date}T12:00:00`).getDay() === 1 ? 0.35 : 0);
    const m: TrainingData['metrics'][number] = { id: id('met'), date, weightKg: r1(w + noise) };
    if (i % 7 === 0) {
      const f = i / 55;
      m.waistCm = r1(92 - 3.6 * f + (rand() - 0.5) * 0.4);
      m.hipsCm = r1(101 - 2 * f);
      m.chestCm = r1(104 - 1.2 * f);
      m.armCm = r1(36.5 - 0.2 * f);
      m.thighCm = r1(59 - 1.1 * f);
    }
    if (i % 14 === 0) m.bodyFat = r1(21.8 - 2.3 * (i / 55));
    if (i % 7 === 3) m.restingHr = Math.round(62 - (i / 55) * 4);
    if (i % 11 === 5) m.source = 'agent';
    t.metrics.push(m);
  }

  // meals & plan (last week + this week)
  t.meals = MEALS.map((m) => ({ ...m, id: id('meal') }));
  const meal = (name: string) => t.meals.find((m) => m.name.startsWith(name))!.id;
  const wk = weekStartOf(today, true);
  const plan: PlanEntry[] = [];
  for (let i = -7; i < 7; i++) {
    const date = addDays(wk, i);
    const odd = i % 2 !== 0;
    const past = date < today;
    const add = (slot: PlanEntry['slot'], mealId: string, servings = 1) => plan.push({ id: id('plan'), date, slot, mealId, servings, ...(past && rand() < 0.88 ? { eaten: true } : {}) });
    add('breakfast', meal(odd ? 'Egg' : 'Overnight'));
    add('lunch', meal((i + 7) % 3 === 2 ? 'Turkey' : 'Chicken rice'));
    add('dinner', meal((i + 7) % 4 < 2 ? 'Lean beef' : 'Salmon'));
    add('snack', meal('Greek yogurt'));
    if (DAYS.some((d) => d.weekday === new Date(`${date}T12:00:00`).getDay())) add('snack', meal('Protein shake'));
  }
  t.plan = plan;
  t.food = [
    { id: id('food'), date: addDays(today, -2), slot: 'snack', name: 'Protein bar', calories: 210, protein: 20, carbs: 22, fat: 7, time: '16:10', source: 'agent' },
    { id: id('food'), date: addDays(today, -4), slot: 'dinner', name: 'Sushi (12 pieces)', calories: 640, protein: 30, carbs: 96, fat: 12, time: '20:00', source: 'me' },
    { id: id('food'), date: addDays(today, -1), slot: 'snack', name: 'Apple', calories: 80, protein: 0, carbs: 21, fat: 0, time: '11:00', source: 'me' },
  ];
  t.grocery = { from: wk, to: addDays(wk, 6), checked: [], extras: [{ id: id('groc'), name: 'Coffee beans', qty: 1, unit: 'bag', aisle: 'drinks' }, { id: id('groc'), name: 'Chalk', qty: 1, unit: 'pcs', aisle: 'other' }] };

  // check-ins (about every other day, newest last)
  const ci: CheckIn[] = [];
  BLURBS.forEach(([text, vals], i) => {
    const date = addDays(start, Math.min(55, Math.round(2 + i * 2.15)));
    if (date > today) return;
    ci.push({ id: id('chk'), date, time: i % 3 === 0 ? '21:30' : '08:15', text, source: i % 4 === 1 ? 'agent' : 'me', steps: vals.steps ?? (i % 2 ? 7000 + Math.round(rand() * 4000) : undefined), waterL: vals.waterL ?? (i % 3 === 0 ? 2.5 : undefined), ...vals });
  });
  for (const c of ci) for (const k of Object.keys(c) as (keyof CheckIn)[]) if (c[k] === undefined) delete c[k];
  t.checkIns = ci;

  // targets
  t.goals = [
    { id: id('tgoal'), title: 'Deadlift 185 kg', kind: 'strength', status: 'active', exerciseId: exId('Deadlift'), target: 185, start: 165, targetDate: addDays(today, 140) },
    { id: id('tgoal'), title: 'Bench 110 kg', kind: 'strength', status: 'active', exerciseId: exId('Bench press'), target: 110, start: 94, targetDate: addDays(today, 180) },
    { id: id('tgoal'), title: 'Waist under 85 cm', kind: 'measurement', status: 'active', metric: 'waistCm', target: 85, start: 92, targetDate: addDays(today, 90) },
    { id: id('tgoal'), title: '9,000 steps a day', kind: 'habit', status: 'active', metric: 'steps', target: 9000 },
    { id: id('tgoal'), title: '8 pull-ups', kind: 'other', status: 'achieved', notes: 'Hit 3×8 at bodyweight in week 6.' },
  ];

  t.coachNotes = [
    { id: id('note'), date: addDays(today, -6), title: 'Pack food for shoot days', body: 'On set days you average ~1,500 kcal and 90 g protein, then overeat at night. Pack two chicken bowls and a shake; aim for 40 g protein before noon.', pinned: true, category: 'nutrition', source: 'agent' },
    { id: id('note'), date: addDays(today, -13), title: 'Sleep is your energy lever', body: 'Energy averages 4.4/5 after 7.5 h+ nights vs 2.4/5 after short ones. Protect sleep during edit weeks: screens off by 23:00, short workouts are fine.', pinned: true, category: 'recovery', source: 'agent' },
    { id: id('note'), date: addDays(today, -20), title: 'Deload in week 7', body: 'Volume has climbed 5 weeks in a row. Take week 7 at ~60% volume, keep the intensity.', category: 'training', source: 'agent' },
  ];

  const r = computeMacros({ sex: 'male', age: 34, heightCm: 180, weightKg: t.metrics[t.metrics.length - 1]?.weightKg ?? 81, activity: 'moderate', direction: 'lose', adjustKcal: 450, proteinPerKg: 2.1, fatPct: 27 });
  t.macros = { calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, fiberG: 35, source: 'calculator', updatedAt: addDays(today, -20) };
  return normalizeTraining(t);
}

/** A simple silhouette whose waist narrows with `f` (0 → 1). */
export function samplePhotoSvg(f: number, date: string): string {
  const waist = 118 - 22 * f;
  const hip = 128 - 12 * f;
  const cx = 300;
  const body = `M${cx - 70},230 C${cx - 120},250 ${cx - 125},300 ${cx - 118},360 L${cx - waist / 2 - 30},470 C${cx - waist / 2},520 ${cx - hip / 2 - 6},560 ${cx - hip / 2},610 L${cx - 60},900 L${cx - 18},900 L${cx},650 L${cx + 18},900 L${cx + 60},900 L${cx + hip / 2},610 C${cx + hip / 2 + 6},560 ${cx + waist / 2},520 ${cx + waist / 2 + 30},470 L${cx + 118},360 C${cx + 125},300 ${cx + 120},250 ${cx + 70},230 Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 1000"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9e4dc"/><stop offset="1" stop-color="#cfc6b8"/></linearGradient></defs><rect width="600" height="1000" fill="url(#g)"/><rect x="0" y="900" width="600" height="100" fill="#b9ad9b"/><circle cx="${cx}" cy="150" r="62" fill="#8a6f5a"/><rect x="${cx - 26}" y="200" width="52" height="40" fill="#8a6f5a"/><path d="${body}" fill="#8a6f5a"/><path d="M${cx - 135},300 L${cx - 165},560 L${cx - 140},565 L${cx - 112},360 Z M${cx + 135},300 L${cx + 165},560 L${cx + 140},565 L${cx + 112},360 Z" fill="#7d6350"/><rect x="${cx - hip / 2 - 4}" y="590" width="${hip + 8}" height="90" rx="10" fill="#2f3b52"/><text x="24" y="44" font-family="Segoe UI, sans-serif" font-size="26" fill="#6b6255">${date}</text></svg>`;
}

/** Adds generated SVG progress photos (front pose, every other day) to `t` for the space `spaceId`. */
export async function seedSamplePhotos(spaceId: string, t: TrainingData, today: string = todayISO()): Promise<void> {
  const start = t.goal.startDate ?? addDays(today, -55);
  const total = 56;
  for (let i = 0; i < total; i += 2) {
    const date = addDays(start, i);
    if (date > today) break;
    const svg = samplePhotoSvg(i / (total - 1), date);
    const asset = await backend.importAsset(spaceId, new TextEncoder().encode(svg), 'svg');
    t.photos.push({ id: `pho-s${i}`, date, pose: 'front', asset });
    if (i % 14 === 0) {
      const side = await backend.importAsset(spaceId, new TextEncoder().encode(svg), 'svg');
      t.photos.push({ id: `pho-s${i}b`, date, pose: 'side', asset: side });
    }
  }
  t.photos.sort((a, b) => a.date.localeCompare(b.date));
}
