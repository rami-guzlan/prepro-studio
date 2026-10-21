/* Pure training computations shared by the screens, print documents, the coach
   summary and the agent tools: macro calculator (Mifflin–St Jeor), meal macros,
   grocery aggregation, weight trend + projection, streaks and consistency,
   estimated 1RM (Epley), PRs, volume, habit actuals, insights and reports.
   Everything takes plain TrainingData and ISO dates; nothing touches the store. */
import { addDays, diffDays, parseISODate } from '@/lib/dates';
import {
  ACTIVITY_LEVELS,
  AISLES,
  MEASUREMENTS,
  type ActivityLevel,
  type Aisle,
  type CheckIn,
  type Exercise,
  type FoodEntry,
  type GoalDirection,
  type GoalTarget,
  type HabitKey,
  type ISODate,
  type Meal,
  type MeasurementKey,
  type PlanEntry,
  type ProgramDay,
  type Session,
  type SessionSet,
  type Sex,
  type TrainingData,
  numOr,
  weekdaysOf,
} from './types';
import { unitKit } from './units';

/* ---------------------------------------------------------------- generic */

export const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const isNum = (x: unknown): x is number => typeof x === 'number' && isFinite(x);

/** Least-squares line through points (x in days). */
export function linReg(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

export function weekday(iso: ISODate): number {
  return parseISODate(iso)?.getDay() ?? 0;
}

export function weekStartOf(iso: ISODate, mondayFirst = true): ISODate {
  const wd = weekday(iso);
  const back = mondayFirst ? (wd + 6) % 7 : wd;
  return addDays(iso, -back);
}

export const inRange = (d: ISODate, from?: ISODate, to?: ISODate) => (!from || d >= from) && (!to || d <= to);

export function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = Math.min(3660, diffDays(from, to));
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/* ---------------------------------------------------------------- profile & calculator */

export function ageOf(t: TrainingData, today: ISODate): number | undefined {
  const y = Number(today.slice(0, 4));
  return t.profile.birthYear ? Math.max(10, y - t.profile.birthYear) : undefined;
}

export interface MacroInput {
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activity: ActivityLevel;
  direction: GoalDirection;
  adjustKcal: number;
  proteinPerKg: number;
  fatPct: number;
}

export interface MacroResult {
  ok: boolean;
  missing: string[];
  bmr: number;
  factor: number;
  tdee: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** share of calories 0–1 */
  split: { protein: number; fat: number; carbs: number };
  formula: string[];
  warnings: string[];
}

/** Mifflin–St Jeor BMR × activity → TDEE, ± goal adjustment, protein g/kg, fat %, carbs = remainder. */
export function computeMacros(i: MacroInput): MacroResult {
  const missing: string[] = [];
  if (!i.sex) missing.push('sex');
  if (!i.age) missing.push('age / birth year');
  if (!i.heightCm) missing.push('height');
  if (!i.weightKg) missing.push('weight');
  const level = ACTIVITY_LEVELS.find((a) => a.value === i.activity) ?? ACTIVITY_LEVELS[2];
  const factor = level.factor;
  if (missing.length)
    return { ok: false, missing, bmr: 0, factor, tdee: 0, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, split: { protein: 0, fat: 0, carbs: 0 }, formula: [], warnings: [] };
  const w = i.weightKg!;
  const h = i.heightCm!;
  const a = i.age!;
  const s = i.sex === 'male' ? 5 : -161;
  const bmr = 10 * w + 6.25 * h - 5 * a + s;
  const tdee = bmr * factor;
  const adj = i.direction === 'lose' ? -Math.abs(i.adjustKcal) : i.direction === 'gain' ? Math.abs(i.adjustKcal) : 0;
  let calories = Math.round((tdee + adj) / 10) * 10;
  const warnings: string[] = [];
  const floor = i.sex === 'male' ? 1500 : 1200;
  if (calories < floor) {
    warnings.push(`${calories} kcal is below a common minimum of ${floor} kcal/day, so the target was raised to ${floor}. Consider a smaller deficit and talk to a professional before going lower.`);
    calories = floor;
  }
  if (i.direction === 'lose' && Math.abs(adj) > tdee * 0.25) warnings.push('That deficit is more than 25% of your maintenance calories — fast, but harder to sustain and to keep muscle.');
  const proteinG = Math.round(w * i.proteinPerKg);
  const fatG = Math.round((calories * (i.fatPct / 100)) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  if (carbsG < 60) warnings.push('Carbs end up very low with these settings; lower protein or fat if training feels flat.');
  if (i.proteinPerKg > 3) warnings.push('Protein above 3 g/kg brings little extra benefit for most people.');
  const total = proteinG * 4 + fatG * 9 + carbsG * 4 || 1;
  const formula = [
    `BMR (Mifflin–St Jeor) = 10 × ${round(w, 1)} kg + 6.25 × ${round(h, 1)} cm − 5 × ${a} y ${s > 0 ? '+ 5' : '− 161'} = ${Math.round(bmr)} kcal`,
    `TDEE = BMR × ${factor} (${level.label.toLowerCase()}) = ${Math.round(tdee)} kcal`,
    `Target = TDEE ${adj > 0 ? `+ ${adj}` : adj < 0 ? `− ${-adj}` : '± 0'} kcal (${i.direction === 'lose' ? 'lose' : i.direction === 'gain' ? 'gain' : 'maintain'}) = ${calories} kcal`,
    `Protein = ${round(i.proteinPerKg, 2)} g/kg × ${round(w, 1)} kg = ${proteinG} g (${proteinG * 4} kcal)`,
    `Fat = ${i.fatPct}% of ${calories} kcal ÷ 9 = ${fatG} g (${fatG * 9} kcal)`,
    `Carbs = remaining ${Math.max(0, calories - proteinG * 4 - fatG * 9)} kcal ÷ 4 = ${carbsG} g`,
  ];
  return { ok: true, missing, bmr: Math.round(bmr), factor, tdee: Math.round(tdee), calories, proteinG, fatG, carbsG, split: { protein: (proteinG * 4) / total, fat: (fatG * 9) / total, carbs: (carbsG * 4) / total }, formula, warnings };
}

/** Calculator inputs from the stored profile + latest weight. */
export function macroInputFor(t: TrainingData, today: ISODate): MacroInput {
  return {
    sex: t.profile.sex,
    age: ageOf(t, today),
    heightCm: t.profile.heightCm,
    weightKg: latestWeight(t)?.kg,
    activity: t.profile.activity,
    direction: t.calculator.direction,
    adjustKcal: t.calculator.adjustKcal,
    proteinPerKg: t.calculator.proteinPerKg,
    fatPct: t.calculator.fatPct,
  };
}

/* ---------------------------------------------------------------- meals & intake */

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
export const addM = (a: Macros, b: Macros): Macros => ({ calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat });
export const scaleM = (a: Macros, f: number): Macros => ({ calories: a.calories * f, protein: a.protein * f, carbs: a.carbs * f, fat: a.fat * f });

/** Per-serving macros of a meal (hand-entered values win over the ingredient sum). */
export function mealMacros(m: Meal | undefined): Macros & { known: boolean; manual: boolean } {
  if (!m) return { ...ZERO, known: false, manual: false };
  const n = (x: unknown) => numOr(x) ?? 0;
  if (numOr(m.calories) != null || numOr(m.protein) != null) return { calories: n(m.calories), protein: n(m.protein), carbs: n(m.carbs), fat: n(m.fat), known: true, manual: true };
  const ings = Array.isArray(m.ingredients) ? m.ingredients.filter((x) => x && typeof x === 'object') : [];
  const sum = ings.reduce<Macros>((acc, x) => addM(acc, { calories: n(x.calories), protein: n(x.protein), carbs: n(x.carbs), fat: n(x.fat) }), ZERO);
  const known = ings.some((x) => numOr(x.calories) != null || numOr(x.protein) != null);
  return { ...scaleM(sum, 1 / (numOr(m.servings) || 1)), known, manual: false };
}

export function mealMap(t: TrainingData): Map<string, Meal> {
  return new Map(t.meals.map((m) => [m.id, m]));
}

export function entryMacros(e: PlanEntry, meals: Map<string, Meal>): Macros {
  const m = e.mealId ? meals.get(e.mealId) : undefined;
  return m ? scaleM(mealMacros(m), numOr(e.servings) || 1) : ZERO;
}

export function foodMacros(f: FoodEntry, meals: Map<string, Meal>): Macros {
  const n = (x: unknown) => numOr(x) ?? 0;
  if ([f.calories, f.protein, f.carbs, f.fat].some((x) => numOr(x) != null)) return { calories: n(f.calories), protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat) };
  const m = f.mealId ? meals.get(f.mealId) : undefined;
  return m ? scaleM(mealMacros(m), numOr(f.servings) || 1) : ZERO;
}

export function entryLabel(e: PlanEntry, meals: Map<string, Meal>): string {
  return (e.mealId ? meals.get(e.mealId)?.name : undefined) ?? e.text ?? '(deleted meal)';
}

export function dayPlanned(t: TrainingData, date: ISODate, meals = mealMap(t)): Macros {
  return t.plan.filter((e) => e.date === date).reduce((a, e) => addM(a, entryMacros(e, meals)), ZERO);
}

/** What was eaten on a day: planned meals ticked as eaten + food log entries. */
export function dayEaten(t: TrainingData, date: ISODate, meals = mealMap(t)): Macros & { items: number } {
  const plan = t.plan.filter((e) => e.date === date && e.eaten);
  const food = t.food.filter((f) => f.date === date);
  const m = [...plan.map((e) => entryMacros(e, meals)), ...food.map((f) => foodMacros(f, meals))].reduce(addM, ZERO);
  return { ...m, items: plan.length + food.length };
}

export function intakeDates(t: TrainingData): Set<ISODate> {
  const s = new Set<ISODate>();
  for (const e of t.plan) if (e.eaten) s.add(e.date);
  for (const f of t.food) s.add(f.date);
  return s;
}

/* ---------------------------------------------------------------- grocery */

const AISLE_WORDS: [Aisle, RegExp][] = [
  ['frozen', /\bfrozen\b/],
  ['meat', /\b(chicken|beef|steak|mince|ground (beef|turkey)|turkey|pork|ham|bacon|salmon|tuna|cod|shrimp|prawn|fish|lamb|sausage|tofu|tempeh)\b/],
  ['dairy', /\b(milk|yogh?urt|skyr|cheese|feta|mozzarella|parmesan|cottage|butter|cream|eggs?|kefir|whey)\b/],
  ['bakery', /\b(bread|bagel|tortilla|wrap|pita|bun|roll|sourdough|naan)\b/],
  ['spices', /\b(salt|pepper flakes|black pepper|paprika|cumin|cinnamon|oregano|chili|sauce|soy|tamari|vinegar|mustard|salsa|ketchup|mayo|spice|seasoning|stock|broth|curry paste|sriracha|pesto)\b/],
  ['drinks', /\b(water|coffee|tea|juice|soda|kombucha)\b/],
  ['pantry', /\b(rice|oats?|oatmeal|pasta|noodles|quinoa|couscous|beans|lentils|chickpeas|flour|oil|honey|syrup|peanut butter|almond butter|nuts?|almonds|walnuts|seeds|granola|cereal|protein powder|chocolate|cocoa|tomatoes? \(canned\)|canned|tin|coconut milk|rice cakes|crackers|sugar)\b/],
  ['produce', /\b(apple|banana|berr(y|ies)|blueberr|strawberr|raspberr|spinach|kale|lettuce|salad|broccoli|cauliflower|onion|garlic|ginger|tomato|bell pepper|peppers?|avocado|potato|sweet potato|carrot|lemon|lime|orange|cucumber|zucchini|courgette|mushroom|herbs?|basil|cilantro|coriander|parsley|celery|cabbage|asparagus|green beans|peas|corn|mango|pineapple|grapes|pear|kiwi|squash|beet)\b/],
];

export function guessAisle(name: string): Aisle {
  const s = name.toLowerCase();
  for (const [aisle, re] of AISLE_WORDS) if (re.test(s)) return aisle;
  return 'other';
}

export const groceryKey = (name: string, unit?: string) => `${name.trim().toLowerCase()}|${(unit ?? '').trim().toLowerCase()}`;

export interface GroceryLine {
  key: string;
  name: string;
  qty?: number;
  unit?: string;
  aisle: Aisle;
  /** meals that need it */
  meals: string[];
  checked: boolean;
  /** manual extra item id */
  extraId?: string;
}

/** Ingredients of every planned meal between from and to (inclusive), aggregated by name + unit, plus manual extras. */
export function groceryList(t: TrainingData, from: ISODate, to: ISODate): GroceryLine[] {
  const meals = mealMap(t);
  const checked = new Set(t.grocery.checked);
  const byKey = new Map<string, GroceryLine>();
  for (const e of t.plan) {
    if (!inRange(e.date, from, to) || !e.mealId) continue;
    const m = meals.get(e.mealId);
    if (!m) continue;
    const f = (numOr(e.servings) || 1) / (numOr(m.servings) || 1);
    for (const ing of Array.isArray(m.ingredients) ? m.ingredients : []) {
      if (!ing || typeof ing !== 'object' || typeof ing.name !== 'string' || !ing.name.trim()) continue;
      const unit = typeof ing.unit === 'string' ? ing.unit : undefined;
      const key = groceryKey(ing.name, unit);
      let line = byKey.get(key);
      if (!line) {
        line = { key, name: ing.name.trim(), unit: unit?.trim() || undefined, aisle: AISLES.some((a) => a.value === ing.aisle) ? ing.aisle! : guessAisle(ing.name), meals: [], checked: checked.has(key) };
        byKey.set(key, line);
      }
      const q = numOr(ing.qty);
      if (q != null) line.qty = (line.qty ?? 0) + q * f;
      if (!line.meals.includes(m.name)) line.meals.push(m.name);
    }
  }
  const lines = [...byKey.values()].map((l) => ({ ...l, qty: l.qty == null ? undefined : niceQty(l.qty, l.unit) }));
  for (const x of t.grocery.extras) lines.push({ key: `extra:${x.id}`, name: x.name, qty: numOr(x.qty), unit: x.unit, aisle: AISLES.some((a) => a.value === x.aisle) ? x.aisle! : guessAisle(x.name), meals: [], checked: !!x.checked, extraId: x.id });
  const order = new Map(AISLES.map((a, i) => [a.value, i]));
  return lines.sort((a, b) => (order.get(a.aisle)! - order.get(b.aisle)!) || a.name.localeCompare(b.name));
}

/** Round a shopping quantity sensibly (grams to 5, pieces to 0.5). */
export function niceQty(q: number, unit?: string): number {
  const u = (unit ?? '').toLowerCase();
  if (/^(g|gram|grams|ml)$/.test(u)) return q >= 50 ? Math.ceil(q / 5) * 5 : Math.ceil(q);
  if (/^(kg|l|lb|lbs|oz|cup|cups)$/.test(u)) return round(q, 2);
  return round(Math.ceil(q * 2) / 2, 1);
}

export function qtyText(q: number | undefined, unit?: string): string {
  if (q == null) return unit ?? '';
  const n = Number.isInteger(q) ? String(q) : String(round(q, 2));
  return unit ? `${n} ${unit}` : n;
}

/* ---------------------------------------------------------------- body weight */

export interface WeightPoint {
  date: ISODate;
  kg: number;
}

/** Daily weights (last entry of a day wins), oldest first. */
export function weightSeries(t: TrainingData): WeightPoint[] {
  const m = new Map<ISODate, number>();
  for (const x of [...t.metrics].sort((a, b) => a.date.localeCompare(b.date))) if (isNum(x.weightKg)) m.set(x.date, x.weightKg);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, kg]) => ({ date, kg }));
}

export function latestWeight(t: TrainingData): WeightPoint | undefined {
  const s = weightSeries(t);
  return s[s.length - 1];
}

/** Trailing 7-day average at each weigh-in. */
export function avgSeries(series: WeightPoint[], window = 7): WeightPoint[] {
  return series.map((p) => {
    const from = addDays(p.date, -(window - 1));
    const xs = series.filter((q) => q.date >= from && q.date <= p.date).map((q) => q.kg);
    return { date: p.date, kg: round(avg(xs)!, 2) };
  });
}

export interface WeightTrend {
  latest: WeightPoint;
  /** 7-day average ending at the latest weigh-in */
  trendKg: number;
  /** kg per week (negative = losing); undefined with too little data */
  ratePerWeek?: number;
  startKg: number;
  startDate: ISODate;
  targetKg?: number;
  targetDate?: ISODate;
  /** kg still to go (positive = to lose) */
  toGo?: number;
  /** date the target is reached at the current rate */
  projectedDate?: ISODate;
  /** kg/week needed to hit the target by the target date */
  neededRate?: number;
  onTrack?: boolean;
  /** share of the way from start to target, 0–1 */
  progress?: number;
  change7?: number;
  change28?: number;
}

export function weightTrend(t: TrainingData): WeightTrend | null {
  const s = weightSeries(t);
  if (!s.length) return null;
  const latest = s[s.length - 1];
  const avgs = avgSeries(s);
  const trendKg = avgs[avgs.length - 1].kg;
  const from28 = addDays(latest.date, -27);
  let pts = s.filter((p) => p.date >= from28);
  if (pts.length < 3 || diffDays(pts[0].date, latest.date) < 7) pts = s;
  let ratePerWeek: number | undefined;
  if (pts.length >= 3 && diffDays(pts[0].date, latest.date) >= 7) {
    const reg = linReg(pts.map((p) => ({ x: diffDays(latest.date, p.date), y: p.kg })));
    if (reg) ratePerWeek = round(reg.slope * 7, 2);
  }
  const startDate = t.goal.startDate && t.goal.startDate <= latest.date ? t.goal.startDate : s[0].date;
  const startKg = t.goal.startWeightKg ?? s.find((p) => p.date >= startDate)?.kg ?? s[0].kg;
  const targetKg = t.goal.targetWeightKg;
  const targetDate = t.goal.targetDate;
  const out: WeightTrend = { latest, trendKg, ratePerWeek, startKg, startDate, targetKg, targetDate };
  const at = (d: ISODate) => avgs.filter((p) => p.date <= d).pop()?.kg;
  const a7 = at(addDays(latest.date, -7));
  const a28 = at(addDays(latest.date, -28));
  if (a7 != null) out.change7 = round(trendKg - a7, 2);
  if (a28 != null) out.change28 = round(trendKg - a28, 2);
  if (targetKg != null) {
    out.toGo = round(trendKg - targetKg, 2);
    const span = startKg - targetKg;
    if (Math.abs(span) > 0.01) out.progress = Math.max(0, Math.min(1, (startKg - trendKg) / span));
    const dir = Math.sign(targetKg - trendKg);
    if (Math.abs(targetKg - trendKg) < 0.15) out.projectedDate = latest.date;
    else if (ratePerWeek != null && Math.sign(ratePerWeek) === dir && Math.abs(ratePerWeek) >= 0.02) {
      const days = Math.ceil(((targetKg - trendKg) / ratePerWeek) * 7);
      if (days <= 365 * 3) out.projectedDate = addDays(latest.date, days);
    }
    if (targetDate && targetDate > latest.date) out.neededRate = round(((targetKg - trendKg) / diffDays(latest.date, targetDate)) * 7, 2);
    if (targetDate) out.onTrack = !!out.projectedDate && out.projectedDate <= targetDate;
  }
  return out;
}

/** Dashed projection from the current trend weight forward. */
export function projectionPoints(tr: WeightTrend, horizonWeeks = 12): WeightPoint[] {
  if (tr.ratePerWeek == null) return [];
  let end = tr.projectedDate && tr.projectedDate > tr.latest.date ? tr.projectedDate : tr.targetDate && tr.targetDate > tr.latest.date ? tr.targetDate : addDays(tr.latest.date, horizonWeeks * 7);
  if (tr.targetDate && tr.targetDate > tr.latest.date && end > tr.targetDate && tr.projectedDate) end = tr.projectedDate > tr.targetDate ? tr.projectedDate : tr.targetDate;
  const maxEnd = addDays(tr.latest.date, 365);
  if (end > maxEnd) end = maxEnd;
  const days = diffDays(tr.latest.date, end);
  const pts: WeightPoint[] = [];
  const step = Math.max(7, Math.round(days / 8));
  for (let d = 0; d < days; d += step) pts.push({ date: addDays(tr.latest.date, d), kg: round(tr.trendKg + (tr.ratePerWeek / 7) * d, 2) });
  pts.push({ date: end, kg: round(tr.trendKg + (tr.ratePerWeek / 7) * days, 2) });
  return pts;
}

/** Plain-language projection sentence. */
export function projectionText(tr: WeightTrend | null, units: 'metric' | 'imperial', fmtDate: (d: ISODate) => string): string {
  const u = unitKit(units);
  if (!tr) return 'Log your weight a few times a week to see your trend and projection.';
  if (tr.ratePerWeek == null) return `Trend weight ${u.weight(tr.trendKg)}. A few more weigh-ins over at least a week and you'll see your rate and a projection.`;
  const rate = `${u.delta(tr.ratePerWeek)}/week`;
  if (tr.targetKg == null) return `At the current rate of ${rate} you'd be around ${u.weight(tr.trendKg + tr.ratePerWeek * 4)} in 4 weeks. Set a target weight in Goals to see when you'll reach it.`;
  if (tr.projectedDate === tr.latest.date) return `You're at your target of ${u.weight(tr.targetKg)} — time to set the next goal or switch to maintenance.`;
  if (!tr.projectedDate) {
    const dir = tr.targetKg < tr.trendKg ? 'down' : 'up';
    return `At the current rate of ${rate} you're not moving ${dir} towards ${u.weight(tr.targetKg)} yet${tr.neededRate != null ? ` — it needs about ${u.delta(tr.neededRate)}/week to make ${fmtDate(tr.targetDate!)}` : ''}.`;
  }
  let s = `At the current rate of ${rate} you reach ${u.weight(tr.targetKg)} around ${fmtDate(tr.projectedDate)}`;
  if (tr.targetDate) s += tr.onTrack ? ` — ahead of your ${fmtDate(tr.targetDate)} target.` : ` — after your ${fmtDate(tr.targetDate)} target${tr.neededRate != null ? ` (that needs ${u.delta(tr.neededRate)}/week)` : ''}.`;
  else s += '.';
  return s;
}

/** Latest value of a body metric field. */
export function latestMetric(t: TrainingData, key: MeasurementKey | 'bodyFat' | 'weightKg' | 'restingHr'): { date: ISODate; value: number } | undefined {
  const xs = [...t.metrics].filter((m) => isNum(m[key])).sort((a, b) => a.date.localeCompare(b.date));
  const x = xs[xs.length - 1];
  return x ? { date: x.date, value: x[key] as number } : undefined;
}

export function metricSeries(t: TrainingData, key: MeasurementKey | 'bodyFat' | 'weightKg' | 'restingHr'): { date: ISODate; value: number }[] {
  const m = new Map<ISODate, number>();
  for (const x of [...t.metrics].sort((a, b) => a.date.localeCompare(b.date))) if (isNum(x[key])) m.set(x.date, x[key] as number);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

/* ---------------------------------------------------------------- workouts */

export const isDone = (s: SessionSet) => s.done !== false;
export const isWork = (s: SessionSet) => isDone(s) && !s.warmup;

/** Epley estimated one-rep max. */
export function e1rm(kg?: number, reps?: number): number | undefined {
  if (!isNum(kg) || !isNum(reps) || kg <= 0 || reps <= 0) return undefined;
  if (reps === 1) return kg;
  return round(kg * (1 + Math.min(reps, 15) / 30), 1);
}

export function exerciseMap(t: TrainingData): Map<string, Exercise> {
  return new Map(t.exercises.map((x) => [x.id, x]));
}

export function sessionStats(s: Session): { sets: number; reps: number; volume: number; exercises: number } {
  const work = s.sets.filter(isWork);
  return {
    sets: work.length,
    reps: work.reduce((a, x) => a + (x.reps ?? 0), 0),
    volume: Math.round(work.reduce((a, x) => a + (x.kg ?? 0) * (x.reps ?? 0), 0)),
    exercises: new Set(work.map((x) => x.exerciseId ?? '')).size,
  };
}

export const sessionDone = (s: Session) => s.sets.some(isDone);

/** planned = prepared but not started; active = started, not finished; finished = stopped,
    or (sessions logged afterwards, e.g. by an agent) has done sets and was never started. */
export type SessionState = 'planned' | 'active' | 'finished';
export function sessionState(s: Session): SessionState {
  if (s.finishedAt) return 'finished';
  if (s.startedAt) return 'active';
  return sessionDone(s) ? 'finished' : 'planned';
}

/** Exercise ids of a session in the order they appear. */
export function sessionExerciseOrder(s: Session): string[] {
  const out: string[] = [];
  for (const x of s.sets) if (x.exerciseId && !out.includes(x.exerciseId)) out.push(x.exerciseId);
  return out;
}

export interface ExercisePoint {
  date: ISODate;
  sessionId: string;
  topKg: number;
  topReps: number;
  e1rm?: number;
  volume: number;
  sets: number;
  reps: number;
}

export function exerciseHistory(t: TrainingData, exerciseId: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const s of [...t.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const work = s.sets.filter((x) => isWork(x) && x.exerciseId === exerciseId);
    if (!work.length) continue;
    let top = work[0];
    for (const x of work) if ((x.kg ?? 0) > (top.kg ?? 0) || ((x.kg ?? 0) === (top.kg ?? 0) && (x.reps ?? 0) > (top.reps ?? 0))) top = x;
    const e = work.map((x) => e1rm(x.kg, x.reps)).filter(isNum);
    out.push({
      date: s.date,
      sessionId: s.id,
      topKg: top.kg ?? 0,
      topReps: top.reps ?? 0,
      e1rm: e.length ? Math.max(...e) : undefined,
      volume: Math.round(work.reduce((a, x) => a + (x.kg ?? 0) * (x.reps ?? 0), 0)),
      sets: work.length,
      reps: work.reduce((a, x) => a + (x.reps ?? 0), 0),
    });
  }
  return out;
}

export interface PR {
  exerciseId: string;
  name: string;
  date: ISODate;
  e1rm: number;
  kg: number;
  reps: number;
  /** previous best e1RM (undefined for the first) */
  previous?: number;
}

/** Best estimated 1RM per exercise. */
export function bestLifts(t: TrainingData): PR[] {
  const ex = exerciseMap(t);
  const out: PR[] = [];
  for (const id of new Set(t.sessions.flatMap((s) => s.sets.map((x) => x.exerciseId).filter((x): x is string => !!x)))) {
    const h = exerciseHistory(t, id).filter((p) => p.e1rm != null);
    if (!h.length) continue;
    const best = h.reduce((a, b) => (b.e1rm! > a.e1rm! ? b : a));
    out.push({ exerciseId: id, name: ex.get(id)?.name ?? '(deleted exercise)', date: best.date, e1rm: best.e1rm!, kg: best.topKg, reps: best.topReps });
  }
  return out.sort((a, b) => b.e1rm - a.e1rm);
}

/** New estimated-1RM records set on or after `since` (beating every earlier session). */
export function recentPRs(t: TrainingData, since: ISODate, until?: ISODate): PR[] {
  const ex = exerciseMap(t);
  const out: PR[] = [];
  for (const id of new Set(t.sessions.flatMap((s) => s.sets.map((x) => x.exerciseId).filter((x): x is string => !!x)))) {
    let best: number | undefined;
    for (const p of exerciseHistory(t, id)) {
      if (p.e1rm == null) continue;
      if (best != null && p.e1rm > best && p.date >= since && (!until || p.date <= until)) out.push({ exerciseId: id, name: ex.get(id)?.name ?? '(deleted exercise)', date: p.date, e1rm: p.e1rm, kg: p.topKg, reps: p.topReps, previous: best });
      best = Math.max(best ?? 0, p.e1rm);
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** IDs of sets that were a PR when they happened (for badges). */
export function prSessionIds(t: TrainingData): Set<string> {
  return new Set(recentPRs(t, '0000-01-01').map((p) => `${p.exerciseId}@${p.date}`));
}

export interface StrengthTrend {
  current?: number;
  ratePerWeek?: number;
  points: number;
}

/** e1RM trend of an exercise over the last 8 weeks. */
export function strengthTrend(t: TrainingData, exerciseId: string, today: ISODate): StrengthTrend {
  const h = exerciseHistory(t, exerciseId).filter((p) => p.e1rm != null);
  if (!h.length) return { points: 0 };
  const recent = h.filter((p) => p.date >= addDays(today, -56));
  const pts = recent.length >= 3 ? recent : h.slice(-6);
  const reg = pts.length >= 3 && diffDays(pts[0].date, pts[pts.length - 1].date) >= 10 ? linReg(pts.map((p) => ({ x: diffDays(today, p.date), y: p.e1rm! }))) : null;
  return { current: h[h.length - 1].e1rm, ratePerWeek: reg ? round(reg.slope * 7, 2) : undefined, points: pts.length };
}

/** When a strength target is reached at the current e1RM trend. */
export function strengthProjection(st: StrengthTrend, targetKg: number, today: ISODate): ISODate | undefined {
  if (st.current == null) return undefined;
  if (st.current >= targetKg) return today;
  if (!st.ratePerWeek || st.ratePerWeek <= 0.05) return undefined;
  const days = Math.ceil(((targetKg - st.current) / st.ratePerWeek) * 7);
  return days <= 730 ? addDays(today, days) : undefined;
}

export interface WeekVolume {
  weekStart: ISODate;
  volume: number;
  sessions: number;
  sets: number;
}

export function weeklyVolume(t: TrainingData, today: ISODate, weeks = 8, mondayFirst = true): WeekVolume[] {
  const first = addDays(weekStartOf(today, mondayFirst), -(weeks - 1) * 7);
  const out: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({ weekStart: addDays(first, i * 7), volume: 0, sessions: 0, sets: 0 }));
  for (const s of t.sessions) {
    if (s.date < first || s.date > addDays(first, weeks * 7 - 1) || !sessionDone(s)) continue;
    const i = Math.floor(diffDays(first, s.date) / 7);
    const st = sessionStats(s);
    out[i].volume += st.volume;
    out[i].sets += st.sets;
    out[i].sessions += 1;
  }
  return out;
}

/** Sets of the last session (before `beforeDate`, excluding a session) that had this exercise. */
export function lastPerformance(t: TrainingData, exerciseId: string, excludeSessionId?: string, beforeDate?: ISODate): { date: ISODate; sets: SessionSet[] } | undefined {
  const xs = [...t.sessions]
    .filter((s) => s.id !== excludeSessionId && (!beforeDate || s.date <= beforeDate) && s.sets.some((x) => x.exerciseId === exerciseId && isWork(x)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const s = xs[0];
  return s ? { date: s.date, sets: s.sets.filter((x) => x.exerciseId === exerciseId && isWork(x)) } : undefined;
}

export function setsText(sets: SessionSet[], u: ReturnType<typeof unitKit>): string {
  return sets
    .map((x) => {
      if (x.seconds != null && x.reps == null) return `${x.seconds}s`;
      if (x.km != null) return `${x.km} km${x.seconds ? ` / ${Math.round(x.seconds / 60)} min` : ''}`;
      return `${x.kg != null && x.kg > 0 ? `${u.weightNum(x.kg)}×` : ''}${x.reps ?? '?'}`;
    })
    .join(', ');
}

/** Program days planned on a date (by weekday). */
export function plannedDaysOn(t: TrainingData, date: ISODate): ProgramDay[] {
  const wd = weekday(date);
  return t.program.days.filter((d) => weekdaysOf(d.weekdays).includes(wd));
}

/** The program day to do next: the one planned for today, else the one after the last session's day. */
export function suggestedDay(t: TrainingData, today: ISODate): ProgramDay | undefined {
  const days = t.program.days;
  if (!days.length) return undefined;
  const planned = plannedDaysOn(t, today);
  if (planned.length) return planned[0];
  const last = [...t.sessions].filter((s) => s.dayId && sessionDone(s)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const i = last ? days.findIndex((d) => d.id === last.dayId) : -1;
  return days[(i + 1) % days.length];
}

/** Planned program days (by weekday) in [from, to] with no session that day. */
export function missedWorkouts(t: TrainingData, from: ISODate, to: ISODate): { date: ISODate; day: ProgramDay }[] {
  if (!t.program.days.some((d) => weekdaysOf(d.weekdays).length)) return [];
  const done = new Set(t.sessions.filter(sessionDone).map((s) => s.date));
  const out: { date: ISODate; day: ProgramDay }[] = [];
  for (const d of datesBetween(from, to)) {
    if (done.has(d)) continue;
    for (const day of plannedDaysOn(t, d)) out.push({ date: d, day });
  }
  return out;
}

/* ---------------------------------------------------------------- consistency */

export function workoutDates(t: TrainingData): Set<ISODate> {
  return new Set(t.sessions.filter(sessionDone).map((s) => s.date));
}
export function photoDates(t: TrainingData): Set<ISODate> {
  return new Set(t.photos.map((p) => p.date));
}
/** Days with anything logged (weight, check-in, food, workout, photo). */
export function loggedDates(t: TrainingData): Set<ISODate> {
  const s = intakeDates(t);
  for (const x of t.metrics) s.add(x.date);
  for (const x of t.checkIns) s.add(x.date);
  for (const x of workoutDates(t)) s.add(x);
  for (const x of t.photos) s.add(x.date);
  return s;
}

/** Current streak (counting from today, or from yesterday when today isn't logged yet) and best streak. */
export function streak(dates: Set<ISODate>, today: ISODate): { current: number; best: number; loggedToday: boolean } {
  const loggedToday = dates.has(today);
  let d = loggedToday ? today : addDays(today, -1);
  let current = 0;
  while (dates.has(d) && current < 3660) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const x of [...dates].filter((x) => x <= today).sort()) {
    run = prev && diffDays(prev, x) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { current, best: Math.max(best, current), loggedToday };
}

/** Consecutive weeks (ending with the current week when it's already met, else last week) with ≥ target workouts. */
export function weekStreak(t: TrainingData, today: ISODate, perWeek: number, mondayFirst = true): number {
  if (!perWeek) return 0;
  const counts = new Map<ISODate, number>();
  for (const d of workoutDates(t)) counts.set(weekStartOf(d, mondayFirst), (counts.get(weekStartOf(d, mondayFirst)) ?? 0) + 1);
  let w = weekStartOf(today, mondayFirst);
  let n = 0;
  if ((counts.get(w) ?? 0) >= perWeek) n++;
  w = addDays(w, -7);
  while ((counts.get(w) ?? 0) >= perWeek && n < 520) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}

export function countIn(dates: Set<ISODate>, from: ISODate, to: ISODate): number {
  let n = 0;
  for (const d of dates) if (d >= from && d <= to) n++;
  return n;
}

export interface HeatCell {
  date: ISODate;
  logged: boolean;
  workout: boolean;
  photo: boolean;
  future: boolean;
}

/** `weeks` columns × 7 rows ending with the current week. */
export function heatmap(t: TrainingData, today: ISODate, weeks = 12, mondayFirst = true): HeatCell[][] {
  const logged = loggedDates(t);
  const work = workoutDates(t);
  const pics = photoDates(t);
  const first = addDays(weekStartOf(today, mondayFirst), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(first, w * 7 + d);
      return { date, logged: logged.has(date), workout: work.has(date), photo: pics.has(date), future: date > today };
    }),
  );
}

/* ---------------------------------------------------------------- habits & check-ins */

/** Per-day merged check-in values (later check-ins of a day override earlier ones). */
export function dayCheckIn(t: TrainingData, date: ISODate): Partial<CheckIn> & { texts: CheckIn[] } {
  const xs = t.checkIns.filter((c) => c.date === date).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const out: Partial<CheckIn> & { texts: CheckIn[] } = { texts: xs };
  for (const c of xs) for (const k of ['mood', 'energy', 'sleep', 'sleepHours', 'hunger', 'stress', 'soreness', 'steps', 'waterL'] as const) if (isNum(c[k])) (out as any)[k] = c[k];
  return out;
}

export function latestCheckIn(t: TrainingData): CheckIn | undefined {
  return [...t.checkIns].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))[0];
}

function dayValues(t: TrainingData, from: ISODate, to: ISODate, key: 'sleepHours' | 'steps' | 'waterL' | 'mood' | 'energy' | 'sleep' | 'hunger' | 'stress'): number[] {
  const out: number[] = [];
  for (const d of new Set(t.checkIns.filter((c) => inRange(c.date, from, to)).map((c) => c.date))) {
    const v = dayCheckIn(t, d)[key];
    if (isNum(v)) out.push(v);
  }
  return out;
}

export function avgRating(t: TrainingData, from: ISODate, to: ISODate, key: 'mood' | 'energy' | 'sleep' | 'hunger' | 'stress' | 'sleepHours' | 'steps' | 'waterL'): number | undefined {
  const a = avg(dayValues(t, from, to, key));
  return a == null ? undefined : round(a, 1);
}

/** What the last 7 days (ending today) actually look like for a habit. */
export function habitActual(t: TrainingData, key: HabitKey, today: ISODate): number | undefined {
  const from = addDays(today, -6);
  switch (key) {
    case 'workouts':
      return countIn(workoutDates(t), from, today);
    case 'checkins':
      return new Set(t.checkIns.filter((c) => inRange(c.date, from, today)).map((c) => c.date)).size;
    case 'photos':
      return countIn(photoDates(t), from, today);
    case 'steps':
      return avgRating(t, from, today, 'steps');
    case 'sleep':
      return avgRating(t, from, today, 'sleepHours');
    case 'water':
      return avgRating(t, from, today, 'waterL');
    case 'protein': {
      const meals = mealMap(t);
      const days = [...intakeDates(t)].filter((d) => inRange(d, from, today));
      const a = avg(days.map((d) => dayEaten(t, d, meals).protein));
      return a == null ? undefined : Math.round(a);
    }
  }
}

export function habitTarget(t: TrainingData, key: HabitKey): number | undefined {
  switch (key) {
    case 'workouts':
      return t.goal.workoutsPerWeek;
    case 'steps':
      return t.goal.stepsPerDay;
    case 'sleep':
      return t.goal.sleepHours;
    case 'water':
      return t.goal.waterLiters;
    case 'protein':
      return t.macros.proteinG;
    default:
      return undefined;
  }
}

/* ---------------------------------------------------------------- goals */

export interface GoalProgress {
  current?: number;
  progress?: number;
  projected?: ISODate;
  text: string;
}

/** Current value, progress and projection of a specific goal (values canonical). */
export function goalProgress(t: TrainingData, g: GoalTarget, today: ISODate, fmtDate: (d: ISODate) => string = (d) => d): GoalProgress {
  const u = unitKit(t.profile.units);
  const pct = (cur: number | undefined) => (cur != null && g.target != null && g.start != null && g.start !== g.target ? Math.max(0, Math.min(1, (cur - g.start) / (g.target - g.start))) : undefined);
  switch (g.kind) {
    case 'weight': {
      const tr = weightTrend(t);
      const cur = tr?.trendKg;
      return { current: cur, progress: g.start != null ? pct(cur) : undefined, text: cur != null ? `Trend ${u.weight(cur)}${g.target != null ? ` · ${u.weight(Math.abs(cur - g.target))} to go` : ''}` : 'No weigh-ins yet' };
    }
    case 'body_fat': {
      const cur = latestMetric(t, 'bodyFat')?.value;
      return { current: cur, progress: pct(cur), text: cur != null ? `Now ${round(cur, 1)}%` : 'No body-fat readings yet' };
    }
    case 'measurement': {
      const key = (MEASUREMENTS.find((m) => m.key === g.metric)?.key ?? 'waistCm') as MeasurementKey;
      const cur = latestMetric(t, key)?.value;
      return { current: cur, progress: pct(cur), text: cur != null ? `Now ${u.length(cur)}` : 'No measurements yet' };
    }
    case 'strength': {
      if (!g.exerciseId) return { text: 'Pick the exercise' };
      const st = strengthTrend(t, g.exerciseId, today);
      if (st.current == null) return { text: 'No sessions with this lift yet' };
      const projected = g.target != null ? strengthProjection(st, g.target, today) : undefined;
      const rate = st.ratePerWeek != null ? ` trending ${u.delta(st.ratePerWeek)}/week` : '';
      return {
        current: st.current,
        progress: g.target ? Math.min(1, (st.current - (g.start ?? 0)) / Math.max(0.01, g.target - (g.start ?? 0))) : undefined,
        projected,
        text: `e1RM ${u.weight(st.current)}${rate}${g.target != null ? (projected ? (projected === today ? ' · target reached' : ` → ${u.weight(g.target)} around ${fmtDate(projected)}`) : ' · not on pace yet') : ''}`,
      };
    }
    case 'habit': {
      const key = (g.metric ?? 'workouts') as HabitKey;
      const cur = habitActual(t, key, today);
      return { current: cur, progress: cur != null && g.target ? Math.min(1, cur / g.target) : undefined, text: cur != null ? `Last 7 days: ${round(cur, 1)}` : 'Nothing logged in the last 7 days' };
    }
    default:
      return { text: g.status === 'achieved' ? 'Achieved' : '' };
  }
}

/* ---------------------------------------------------------------- insights */

export interface Insight {
  id: string;
  tone: 'good' | 'warn' | 'info';
  title: string;
  text: string;
  /** module to open for details */
  module?: string;
  params?: Record<string, string>;
}

export function insights(t: TrainingData, today: ISODate, mondayFirst = true, fmtDate: (d: ISODate) => string = (d) => d): Insight[] {
  const u = unitKit(t.profile.units);
  const out: Insight[] = [];
  const from28 = addDays(today, -27);
  const from7 = addDays(today, -6);
  const logged = loggedDates(t);
  const any = logged.size > 0 || t.meals.length > 0 || t.program.days.length > 0;
  if (!any) return [{ id: 'start', tone: 'info', title: 'Start logging', text: 'Log a weigh-in, a check-in or a workout today — insights appear as soon as there is a little data.', module: 'overview' }];

  // consistency
  const days28 = countIn(logged, from28, today);
  const pct = Math.round((days28 / 28) * 100);
  const st = streak(logged, today);
  out.push({
    id: 'consistency',
    tone: pct >= 70 ? 'good' : pct >= 40 ? 'info' : 'warn',
    title: `${pct}% consistent`,
    text: `Logged ${days28} of the last 28 days${st.current > 1 ? ` · ${st.current}-day streak` : ''}${st.best > st.current ? ` (best ${st.best})` : ''}.${pct < 40 ? ' A 20-second check-in each morning is the easiest habit to rebuild.' : ''}`,
    module: 'coach',
  });

  // weight rate vs target
  const tr = weightTrend(t);
  if (tr && tr.ratePerWeek != null) {
    const target = t.goal.weeklyRateKg ?? tr.neededRate;
    const losing = (tr.targetKg ?? tr.trendKg) < tr.trendKg;
    let tone: Insight['tone'] = 'info';
    let text = `Trend ${u.weight(tr.trendKg)}, changing ${u.delta(tr.ratePerWeek)}/week over the last 4 weeks.`;
    if (target != null && Math.abs(target) > 0.01) {
      const ratio = tr.ratePerWeek / target;
      tone = ratio >= 0.75 && ratio <= 1.5 ? 'good' : ratio > 1.5 ? 'warn' : 'warn';
      text += ratio > 1.5 ? ` That's faster than the ${u.delta(target)}/week you need — consider eating a little more to protect muscle and energy.` : ratio < 0.75 ? ` You need about ${u.delta(target)}/week; ${losing ? 'tighten the deficit a little (≈150–250 kcal) or add steps' : 'add a little more food'}.` : ` Right on pace for ${u.delta(target)}/week.`;
    }
    if (tr.projectedDate && tr.targetKg != null) text += ` Projected to reach ${u.weight(tr.targetKg)} around ${fmtDate(tr.projectedDate)}.`;
    out.push({ id: 'rate', tone, title: 'Weight trend', text, module: 'body' });
    if (tr.change28 != null && Math.abs(tr.change28) < 0.25 && tr.targetKg != null && Math.abs(tr.trendKg - tr.targetKg) > 1)
      out.push({ id: 'stall', tone: 'warn', title: 'Weight has stalled', text: `The 7-day average barely moved in 4 weeks (${u.delta(tr.change28)}). Check logging accuracy, weekend intake and step count before cutting calories further.`, module: 'nutrition' });
  } else if (!tr) out.push({ id: 'weigh', tone: 'info', title: 'No weigh-ins yet', text: 'Weigh in 3–7 mornings a week; the 7-day average smooths out water swings.', module: 'body' });

  // nutrition adherence
  const meals = mealMap(t);
  const intake7 = [...intakeDates(t)].filter((d) => inRange(d, from7, today));
  if (intake7.length && t.macros.proteinG) {
    const hit = intake7.filter((d) => dayEaten(t, d, meals).protein >= t.macros.proteinG! * 0.9).length;
    out.push({ id: 'protein', tone: hit >= intake7.length * 0.7 ? 'good' : 'warn', title: `Protein ${hit}/${intake7.length} days`, text: `Hit at least 90% of ${t.macros.proteinG} g on ${hit} of ${intake7.length} logged days this week.${hit < intake7.length * 0.7 ? ' Add a protein anchor to breakfast and snacks (skyr, eggs, shake).' : ''}`, module: 'nutrition', params: { tab: 'log' } });
  }
  if (intake7.length && t.macros.calories) {
    const a = avg(intake7.map((d) => dayEaten(t, d, meals).calories))!;
    const diff = a - t.macros.calories;
    out.push({ id: 'calories', tone: Math.abs(diff) <= t.macros.calories * 0.1 ? 'good' : 'info', title: `Calories avg ${Math.round(a)}`, text: `Average ${Math.round(a)} kcal on logged days vs a ${t.macros.calories} kcal target (${diff >= 0 ? '+' : '−'}${Math.abs(Math.round(diff))}).`, module: 'nutrition', params: { tab: 'log' } });
  } else if (!intake7.length && t.meals.length) out.push({ id: 'food', tone: 'info', title: 'No meals logged this week', text: 'Tick planned meals as eaten (or tell your AI what you ate) to see macro adherence.', module: 'nutrition', params: { tab: 'plan' } });

  // training frequency & missed workouts
  const w7 = countIn(workoutDates(t), from7, today);
  if (t.goal.workoutsPerWeek) {
    const missed = missedWorkouts(t, from7, addDays(today, -1));
    out.push({
      id: 'workouts',
      tone: w7 >= t.goal.workoutsPerWeek ? 'good' : w7 >= t.goal.workoutsPerWeek - 1 ? 'info' : 'warn',
      title: `${w7}/${t.goal.workoutsPerWeek} workouts`,
      text: `${w7} workout${w7 === 1 ? '' : 's'} in the last 7 days.${missed.length ? ` Missed: ${missed.slice(0, 3).map((m) => `${m.day.name} (${fmtDate(m.date)})`).join(', ')}.` : ''}${weekStreak(t, today, t.goal.workoutsPerWeek, mondayFirst) > 1 ? ` ${weekStreak(t, today, t.goal.workoutsPerWeek, mondayFirst)} weeks in a row on target.` : ''}`,
      module: 'workouts',
    });
  }
  const vol = weeklyVolume(t, today, 8, mondayFirst);
  const last4 = vol.slice(4).reduce((a, x) => a + x.volume, 0);
  const prev4 = vol.slice(0, 4).reduce((a, x) => a + x.volume, 0);
  if (prev4 > 0 && last4 > 0) {
    const ch = (last4 - prev4) / prev4;
    out.push({ id: 'volume', tone: ch >= -0.05 ? 'good' : 'info', title: `Volume ${ch >= 0 ? '+' : '−'}${Math.abs(Math.round(ch * 100))}%`, text: `Training volume over the last 4 weeks is ${Math.abs(Math.round(ch * 100))}% ${ch >= 0 ? 'higher' : 'lower'} than the 4 weeks before.${ch < -0.2 ? ' Planned deload, or life getting in the way?' : ''}`, module: 'workouts', params: { tab: 'progress' } });
  }
  const prs = recentPRs(t, addDays(today, -13), today);
  if (prs.length) out.push({ id: 'prs', tone: 'good', title: `${prs.length} new PR${prs.length === 1 ? '' : 's'}`, text: prs.slice(0, 3).map((p) => `${p.name}: e1RM ${u.weight(p.e1rm)} (${u.weightNum(p.kg)}×${p.reps})`).join(' · '), module: 'workouts', params: { tab: 'progress' } });

  // sleep vs energy
  const pairs = [...new Set(t.checkIns.filter((c) => c.date >= addDays(today, -41)).map((c) => c.date))]
    .map((d) => dayCheckIn(t, d))
    .filter((c) => isNum(c.energy) && (isNum(c.sleepHours) || isNum(c.sleep)));
  if (pairs.length >= 5) {
    const good = pairs.filter((c) => (isNum(c.sleepHours) ? c.sleepHours >= (t.goal.sleepHours ?? 7) : (c.sleep ?? 0) >= 4));
    const bad = pairs.filter((c) => !good.includes(c));
    if (good.length >= 2 && bad.length >= 2) {
      const eg = avg(good.map((c) => c.energy!))!;
      const eb = avg(bad.map((c) => c.energy!))!;
      out.push({ id: 'sleep', tone: eg - eb >= 0.5 ? 'warn' : 'info', title: 'Sleep → energy', text: `Energy averages ${round(eg, 1)}/5 after good nights vs ${round(eb, 1)}/5 after short or poor ones (${pairs.length} check-ins).${eg - eb >= 0.5 ? ' Sleep is one of your biggest levers right now.' : ''}`, module: 'coach' });
    }
  }

  // photos
  if (t.photos.length) {
    const last = [...t.photos].sort((a, b) => b.date.localeCompare(a.date))[0];
    const ago = diffDays(last.date, today);
    if (ago >= 7) out.push({ id: 'photo', tone: 'info', title: 'Progress photo due', text: `Last photo was ${ago} days ago. Same pose, light and time of day make the timelapse shine.`, module: 'photos' });
  } else out.push({ id: 'photo', tone: 'info', title: 'Take a first progress photo', text: 'Front, side and back in the same spot each week — the timelapse shows changes the scale hides.', module: 'photos' });
  return out;
}

/* ---------------------------------------------------------------- report */

export interface TrainingReport {
  from: ISODate;
  to: ISODate;
  days: number;
  units: 'metric' | 'imperial';
  weight: { startKg?: number; endKg?: number; changeKg?: number; ratePerWeek?: number; weekly: { weekStart: ISODate; avgKg: number; minKg: number; maxKg: number; n: number }[] };
  bodyFat: { start?: number; end?: number };
  measurements: { key: MeasurementKey; label: string; startCm?: number; endCm?: number; changeCm?: number }[];
  workouts: { count: number; perWeek: number; sets: number; volume: number; minutes: number; sessions: { date: ISODate; name: string; sets: number; volume: number; durationMin?: number }[]; missed: number };
  consistency: { daysLogged: number; pct: number; workoutDays: number; photoDays: number; checkInDays: number; currentStreak: number; bestStreak: number };
  nutrition: { daysLogged: number; avgCalories?: number; avgProtein?: number; proteinHitDays?: number; calorieTarget?: number; proteinTarget?: number };
  checkIns: { count: number; mood?: number; energy?: number; sleep?: number; sleepHours?: number; steps?: number };
  prs: PR[];
  trend: WeightTrend | null;
  insights: Insight[];
}

export function trainingReport(t: TrainingData, from: ISODate, to: ISODate, today: ISODate, mondayFirst = true, fmtDate: (d: ISODate) => string = (d) => d): TrainingReport {
  const days = diffDays(from, to) + 1;
  const ws = weightSeries(t).filter((p) => inRange(p.date, from, to));
  const avgs = avgSeries(weightSeries(t)).filter((p) => inRange(p.date, from, to));
  const weekly = new Map<ISODate, number[]>();
  for (const p of ws) {
    const k = weekStartOf(p.date, mondayFirst);
    weekly.set(k, [...(weekly.get(k) ?? []), p.kg]);
  }
  const reg = ws.length >= 3 ? linReg(ws.map((p) => ({ x: diffDays(from, p.date), y: p.kg }))) : null;
  const bf = metricSeries(t, 'bodyFat').filter((p) => inRange(p.date, from, to));
  const sessions = t.sessions.filter((s) => inRange(s.date, from, to) && sessionDone(s)).sort((a, b) => a.date.localeCompare(b.date));
  const ex = new Map(t.program.days.map((d) => [d.id, d.name]));
  const logged = loggedDates(t);
  const meals = mealMap(t);
  const intake = [...intakeDates(t)].filter((d) => inRange(d, from, to));
  const eaten = intake.map((d) => dayEaten(t, d, meals));
  const st = streak(logged, today);
  const stats = sessions.map((s) => ({ s, st: sessionStats(s) }));
  return {
    from,
    to,
    days,
    units: t.profile.units,
    weight: {
      startKg: avgs[0]?.kg,
      endKg: avgs[avgs.length - 1]?.kg,
      changeKg: avgs.length >= 2 ? round(avgs[avgs.length - 1].kg - avgs[0].kg, 2) : undefined,
      ratePerWeek: reg ? round(reg.slope * 7, 2) : undefined,
      weekly: [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, xs]) => ({ weekStart, avgKg: round(avg(xs)!, 2), minKg: Math.min(...xs), maxKg: Math.max(...xs), n: xs.length })),
    },
    bodyFat: { start: bf[0]?.value, end: bf[bf.length - 1]?.value },
    measurements: MEASUREMENTS.map((m) => {
      const xs = metricSeries(t, m.key).filter((p) => inRange(p.date, from, to));
      const a = xs[0]?.value;
      const b = xs[xs.length - 1]?.value;
      return { key: m.key, label: m.label, startCm: a, endCm: b, changeCm: a != null && b != null && xs.length > 1 ? round(b - a, 1) : undefined };
    }).filter((m) => m.startCm != null),
    workouts: {
      count: sessions.length,
      perWeek: round((sessions.length / days) * 7, 1),
      sets: stats.reduce((a, x) => a + x.st.sets, 0),
      volume: stats.reduce((a, x) => a + x.st.volume, 0),
      minutes: sessions.reduce((a, s) => a + (s.durationMin ?? 0), 0),
      sessions: stats.map(({ s, st: x }) => ({ date: s.date, name: s.name || (s.dayId ? ex.get(s.dayId) : undefined) || 'Workout', sets: x.sets, volume: x.volume, durationMin: s.durationMin })),
      missed: missedWorkouts(t, from, to < today ? to : addDays(today, -1)).length,
    },
    consistency: {
      daysLogged: countIn(logged, from, to),
      pct: Math.round((countIn(logged, from, to < today ? to : today) / Math.max(1, diffDays(from, to < today ? to : today) + 1)) * 100),
      workoutDays: countIn(workoutDates(t), from, to),
      photoDays: countIn(photoDates(t), from, to),
      checkInDays: new Set(t.checkIns.filter((c) => inRange(c.date, from, to)).map((c) => c.date)).size,
      currentStreak: st.current,
      bestStreak: st.best,
    },
    nutrition: {
      daysLogged: intake.length,
      avgCalories: eaten.length ? Math.round(avg(eaten.map((m) => m.calories))!) : undefined,
      avgProtein: eaten.length ? Math.round(avg(eaten.map((m) => m.protein))!) : undefined,
      proteinHitDays: t.macros.proteinG ? eaten.filter((m) => m.protein >= t.macros.proteinG! * 0.9).length : undefined,
      calorieTarget: t.macros.calories,
      proteinTarget: t.macros.proteinG,
    },
    checkIns: {
      count: t.checkIns.filter((c) => inRange(c.date, from, to)).length,
      mood: avgRating(t, from, to, 'mood'),
      energy: avgRating(t, from, to, 'energy'),
      sleep: avgRating(t, from, to, 'sleep'),
      sleepHours: avgRating(t, from, to, 'sleepHours'),
      steps: avgRating(t, from, to, 'steps'),
    },
    prs: recentPRs(t, from, to),
    trend: weightTrend(t),
    insights: insights(t, today, mondayFirst, fmtDate),
  };
}

/** Period presets for reports. */
export const REPORT_PERIODS = [
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '28d', label: 'Last 4 weeks', days: 28 },
  { value: '12w', label: 'Last 12 weeks', days: 84 },
  { value: 'all', label: 'Since the start', days: 0 },
] as const;

export function periodRange(t: TrainingData, period: string, today: ISODate, from?: string, to?: string): { from: ISODate; to: ISODate } {
  if (period === 'custom' && from && to) return from <= to ? { from, to } : { from: to, to: from };
  const p = REPORT_PERIODS.find((x) => x.value === period);
  if (p && p.days) return { from: addDays(today, -(p.days - 1)), to: today };
  const dates = [...loggedDates(t)].sort();
  return { from: t.goal.startDate ?? dates[0] ?? addDays(today, -27), to: today };
}

/* ---------------------------------------------------------------- coach summary */

/** Compact numbers for the holistic coach (studio_context). Units in kg / cm. */
export function trainingCoachSummary(t: TrainingData, today: ISODate): Record<string, unknown> {
  const tr = weightTrend(t);
  const logged = loggedDates(t);
  const st = streak(logged, today);
  const meals = mealMap(t);
  const from7 = addDays(today, -6);
  const intake7 = [...intakeDates(t)].filter((d) => inRange(d, from7, today));
  const ci = latestCheckIn(t);
  const prs = recentPRs(t, addDays(today, -27), today).slice(0, 5);
  const day = suggestedDay(t, today);
  const sessionToday = t.sessions.find((s) => s.date === today && sessionDone(s));
  const out: Record<string, unknown> = {
    units: 'kg/cm (profile shows ' + t.profile.units + ')',
    goal: t.goal.statement,
    weight: tr
      ? {
          latestKg: tr.latest.kg,
          latestDate: tr.latest.date,
          avg7Kg: tr.trendKg,
          ratePerWeekKg: tr.ratePerWeek,
          targetKg: tr.targetKg,
          targetDate: tr.targetDate,
          projectedDate: tr.projectedDate,
          onTrack: tr.onTrack,
        }
      : undefined,
    workouts: {
      last7: countIn(workoutDates(t), from7, today),
      last28: countIn(workoutDates(t), addDays(today, -27), today),
      targetPerWeek: t.goal.workoutsPerWeek,
      today: sessionToday ? 'done' : day ? `planned: ${day.name}` : undefined,
    },
    streaks: { daysLogged: st.current, best: st.best, loggedToday: st.loggedToday, consistency28: `${Math.round((countIn(logged, addDays(today, -27), today) / 28) * 100)}%` },
    macros: t.macros.calories
      ? {
          targetKcal: t.macros.calories,
          targetProteinG: t.macros.proteinG,
          daysLogged7: intake7.length,
          avgKcal7: intake7.length ? Math.round(avg(intake7.map((d) => dayEaten(t, d, meals).calories))!) : undefined,
          avgProtein7: intake7.length ? Math.round(avg(intake7.map((d) => dayEaten(t, d, meals).protein))!) : undefined,
        }
      : undefined,
    lastCheckIn: ci ? { date: ci.date, mood: ci.mood, energy: ci.energy, sleep: ci.sleep, sleepHours: ci.sleepHours, text: ci.text ? (ci.text.length > 160 ? `${ci.text.slice(0, 157)}…` : ci.text) : undefined } : undefined,
    prs28: prs.length ? prs.map((p) => `${p.name} e1RM ${p.e1rm} kg (${p.date})`) : undefined,
    photosLast: t.photos.length ? [...t.photos].sort((a, b) => b.date.localeCompare(a.date))[0].date : undefined,
    pinnedNotes: t.coachNotes.filter((n) => n.pinned).map((n) => n.title).slice(0, 3),
  };
  return JSON.parse(JSON.stringify(out));
}

/** Weekday names in display order. */
export function weekdayOrder(mondayFirst = true): number[] {
  return mondayFirst ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
}
