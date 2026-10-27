/* Ramp up: a gentle, game-like way back into training. Data types, the stage
   plans and the normalizer (no runtime imports from ./types, so ./types can
   use it). The logic lives in ./ramp.ts. */

export type RampWhere = 'gym' | 'home';
/** full = the planned session, mini = the 10-minute bad-day version, move = any movement (walk, class, sport) */
export type RampWinKind = 'full' | 'mini' | 'move';

export interface RampWin {
  id: string;
  date: string;
  kind: RampWinKind;
  minutes?: number;
  note?: string;
  source?: 'me' | 'agent';
}

export interface Ramp {
  startDate: string;
  where: RampWhere;
  /** sessions a week to end up at (2–5) */
  goalDays: number;
  /** minutes the user can honestly do right now (10–45) */
  minutesNow: number;
  /** their reason, shown on the mission card */
  why?: string;
  /** a treat for reaching the next level */
  reward?: string;
  wins: RampWin[];
  /** extra weeks to stay at a stage before moving on (the coach adds one when life gets busy) */
  hold?: { stage: string; weeks: number };
  paused?: boolean;
}

export const WIN_POINTS: Record<RampWinKind, number> = { full: 10, mini: 6, move: 3 };
export const WEEK_BONUS = 10;

export interface RampMove {
  name: string;
  /** "2 × 10", "8 min", "30 s each side" */
  dose: string;
  tip?: string;
}

export interface RampStage {
  id: string;
  name: string;
  /** what this stage is about, in one sentence */
  aim: string;
  /** completed weeks needed to move on */
  weeks: number;
  /** target sessions a week (capped by goalDays from stage 3 on) */
  perWeek: number;
  minutes: number;
  gym: RampMove[][];
  home: RampMove[][];
  /** the 10-minute bad-day version */
  mini: { gym: RampMove[]; home: RampMove[] };
}

const WARM = (min: number): RampMove => ({ name: 'Easy cardio warm-up', dose: `${min} min`, tip: 'Bike, incline walk or rower. Chatting pace.' });
const STRETCH: RampMove = { name: 'Stretch what feels tight', dose: '3 min' };

export const RAMP_STAGES: RampStage[] = [
  {
    id: 'show_up',
    name: 'Show up',
    aim: 'The only goal is walking in. Short, easy, done before it gets hard.',
    weeks: 2,
    perWeek: 2,
    minutes: 20,
    gym: [
      [WARM(8), { name: 'Leg press machine', dose: '2 × 12', tip: 'Pick a weight that feels light.' }, { name: 'Chest press machine', dose: '2 × 12' }, { name: 'Lat pulldown', dose: '2 × 12' }, STRETCH],
    ],
    home: [[{ name: 'Brisk walk or marching in place', dose: '8 min' }, { name: 'Sit-to-stand from a chair', dose: '2 × 10' }, { name: 'Wall or counter push-ups', dose: '2 × 8' }, { name: 'Glute bridge', dose: '2 × 12' }, STRETCH]],
    mini: {
      gym: [WARM(5), { name: 'One machine you like', dose: '2 × 12' }, STRETCH],
      home: [{ name: 'Walk around the block', dose: '10 min' }],
    },
  },
  {
    id: 'habit',
    name: 'Make it a habit',
    aim: 'Same days, same time, two simple workouts you can do without thinking.',
    weeks: 2,
    perWeek: 3,
    minutes: 30,
    gym: [
      [WARM(6), { name: 'Goblet squat', dose: '3 × 10' }, { name: 'Dumbbell bench press', dose: '3 × 10' }, { name: 'Seated cable row', dose: '3 × 10' }, { name: 'Plank', dose: '3 × 20 s' }],
      [WARM(6), { name: 'Romanian deadlift (dumbbells)', dose: '3 × 10' }, { name: 'Lat pulldown', dose: '3 × 10' }, { name: 'Dumbbell shoulder press', dose: '3 × 10' }, { name: 'Walking lunges', dose: '2 × 8 each leg' }],
    ],
    home: [
      [{ name: 'Brisk walk or bike', dose: '6 min' }, { name: 'Bodyweight squat', dose: '3 × 12' }, { name: 'Incline push-ups', dose: '3 × 8' }, { name: 'Backpack row', dose: '3 × 10' }, { name: 'Plank', dose: '3 × 20 s' }],
      [{ name: 'Brisk walk or bike', dose: '6 min' }, { name: 'Reverse lunges', dose: '3 × 8 each leg' }, { name: 'Glute bridge', dose: '3 × 15' }, { name: 'Pike or wall push-ups', dose: '3 × 8' }, { name: 'Dead bug', dose: '3 × 8 each side' }],
    ],
    mini: {
      gym: [WARM(4), { name: 'Goblet squat', dose: '2 × 10' }, { name: 'Lat pulldown', dose: '2 × 10' }],
      home: [{ name: 'Squat, push-up, bridge circuit', dose: '3 rounds × 10' }],
    },
  },
  {
    id: 'build',
    name: 'Build',
    aim: 'A little more each week: one more set, a little more weight, a few more minutes.',
    weeks: 2,
    perWeek: 3,
    minutes: 40,
    gym: [
      [WARM(5), { name: 'Goblet or back squat', dose: '4 × 8', tip: 'Add a little weight when all sets feel smooth.' }, { name: 'Dumbbell bench press', dose: '4 × 8' }, { name: 'Seated cable row', dose: '3 × 10' }, { name: 'Farmer carry', dose: '3 × 30 m' }],
      [WARM(5), { name: 'Romanian deadlift', dose: '4 × 8' }, { name: 'Lat pulldown', dose: '4 × 8' }, { name: 'Dumbbell shoulder press', dose: '3 × 10' }, { name: 'Cable crunch or plank', dose: '3 × 12 / 30 s' }],
    ],
    home: [
      [{ name: 'Brisk walk or bike', dose: '5 min' }, { name: 'Split squat', dose: '4 × 8 each leg' }, { name: 'Push-ups (lower the incline)', dose: '4 × 8' }, { name: 'Backpack row', dose: '4 × 10' }, { name: 'Side plank', dose: '3 × 20 s each' }],
      [{ name: 'Brisk walk or bike', dose: '5 min' }, { name: 'Single-leg glute bridge', dose: '3 × 10 each' }, { name: 'Backpack deadlift', dose: '4 × 10' }, { name: 'Pike push-ups', dose: '3 × 8' }, { name: 'Mountain climbers', dose: '3 × 30 s' }],
    ],
    mini: {
      gym: [WARM(3), { name: 'Squat', dose: '3 × 8' }, { name: 'Row', dose: '3 × 10' }],
      home: [{ name: 'Squat, push-up, row circuit', dose: '4 rounds × 8' }],
    },
  },
  {
    id: 'own_it',
    name: 'Own it',
    aim: 'Your full routine at your goal frequency. Keep adding a little and keep it fun.',
    weeks: 2,
    perWeek: 4,
    minutes: 45,
    gym: [
      [WARM(5), { name: 'Back squat', dose: '4 × 6–8' }, { name: 'Bench press', dose: '4 × 6–8' }, { name: 'Seated cable row', dose: '3 × 10' }, { name: 'Walking lunges', dose: '3 × 10 each' }],
      [WARM(5), { name: 'Deadlift or trap-bar deadlift', dose: '4 × 5' }, { name: 'Pull-ups or lat pulldown', dose: '4 × 8' }, { name: 'Overhead press', dose: '3 × 8' }, { name: 'Farmer carry', dose: '3 × 40 m' }],
      [WARM(10), { name: 'Free choice: a class, a swim, a long incline walk', dose: '30 min' }],
    ],
    home: [
      [{ name: 'Brisk walk or bike', dose: '5 min' }, { name: 'Bulgarian split squat', dose: '4 × 8 each' }, { name: 'Push-ups', dose: '4 × max' }, { name: 'Backpack row', dose: '4 × 12' }, { name: 'Plank', dose: '3 × 45 s' }],
      [{ name: 'Brisk walk or bike', dose: '5 min' }, { name: 'Backpack deadlift', dose: '4 × 12' }, { name: 'Pike push-ups', dose: '4 × 8' }, { name: 'Jump squats or fast squats', dose: '3 × 12' }, { name: 'Dead bug', dose: '3 × 10 each' }],
      [{ name: 'Free choice: a run, a ride, a class, a long walk', dose: '30 min' }],
    ],
    mini: {
      gym: [WARM(3), { name: 'Main lift of the day', dose: '3 × 5' }],
      home: [{ name: 'Full-body circuit', dose: '10 min, as many rounds as feels good' }],
    },
  },
];

export const RAMP_LEVELS = [
  { name: 'Rookie', points: 0 },
  { name: 'Regular', points: 40 },
  { name: 'Committed', points: 100 },
  { name: 'Strong', points: 180 },
  { name: 'Unstoppable', points: 300 },
  { name: 'Legend', points: 450 },
];

export const RAMP_BADGES: { id: string; name: string; how: string }[] = [
  { id: 'first', name: 'First step', how: 'Log your first win' },
  { id: 'mini', name: 'Bad day, still showed up', how: 'Do a 10-minute version instead of skipping' },
  { id: 'week', name: 'Full week', how: 'Hit a week’s target' },
  { id: 'two_weeks', name: 'Two in a row', how: 'Hit the target two weeks running' },
  { id: 'ten', name: 'Double digits', how: '10 workouts logged' },
  { id: 'stage', name: 'Level up', how: 'Finish a stage' },
  { id: 'month', name: 'One month strong', how: 'Hit the target four weeks running' },
  { id: 'all', name: 'Ramp complete', how: 'Finish all four stages' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (x: unknown, lo: number, hi: number, d: number) => {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

export function normalizeRamp(x: unknown): Ramp | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const r = x as Record<string, any>;
  if (typeof r.startDate !== 'string' || !DATE_RE.test(r.startDate)) return undefined;
  const out: Ramp = {
    startDate: r.startDate,
    where: r.where === 'home' ? 'home' : 'gym',
    goalDays: num(r.goalDays, 2, 5, 3),
    minutesNow: num(r.minutesNow, 10, 60, 20),
    wins: (Array.isArray(r.wins) ? r.wins : [])
      .filter((w: any) => w && typeof w === 'object' && typeof w.date === 'string' && DATE_RE.test(w.date))
      .map((w: any, i: number) => {
        const win: RampWin = { id: typeof w.id === 'string' && w.id ? w.id : `win-${i}-${w.date}`, date: w.date, kind: w.kind === 'mini' || w.kind === 'move' ? w.kind : 'full' };
        if (Number.isFinite(Number(w.minutes)) && w.minutes != null) win.minutes = Math.round(Number(w.minutes));
        if (typeof w.note === 'string' && w.note.trim()) win.note = w.note;
        if (w.source === 'agent') win.source = 'agent';
        return win;
      }),
  };
  if (typeof r.why === 'string' && r.why.trim()) out.why = r.why;
  if (typeof r.reward === 'string' && r.reward.trim()) out.reward = r.reward;
  if (r.hold && typeof r.hold.stage === 'string' && Number(r.hold.weeks) > 0) out.hold = { stage: r.hold.stage, weeks: num(r.hold.weeks, 1, 8, 1) };
  if (r.paused) out.paused = true;
  return out;
}
