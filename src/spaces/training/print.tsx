/* Printable Training documents: weekly meal plan (+ grocery list), grocery list,
   workout program (with blank log columns) and a progress report for a period. */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Box, Check, KV, PSection, PTable } from '@/print/components';
import { addDays } from '@/lib/dates';
import { AISLES, MEAL_SLOTS, weekdaysOf, normalizeTraining, type TrainingData } from './types';
import { avgSeries, dayPlanned, entryLabel, groceryList, mealMap, periodRange, projectionText, qtyText, REPORT_PERIODS, round, trainingReport, weekStartOf, weightSeries, type GroceryLine } from './calc';
import { unitKit } from './units';

const CSS = `
.tp-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.tp-grid th, .tp-grid td { border: 0.5pt solid #c9c9d1; padding: 3pt 4pt; vertical-align: top; font-size: 8pt; }
.tp-grid th { background: #f2f2f5; text-align: left; font-weight: 700; }
.tp-grid td.slot { font-weight: 700; background: #fafafc; width: 58pt; }
.tp-grid .tot { color: #555; font-size: 7pt; }
.tp-meal { display: block; margin-bottom: 2pt; }
.tp-meal .s { color: #777; }
.tp-meal.eaten { color: #23a35a; }
.tp-cols { column-count: 2; column-gap: 18pt; }
.tp-cols-3 { column-count: 3; column-gap: 14pt; }
.tp-aisle { break-inside: avoid; margin-bottom: 8pt; }
.tp-aisle h3 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 3pt; color: #444; border-bottom: 0.5pt solid #ccc; padding-bottom: 2pt; }
.tp-item { display: flex; gap: 5pt; align-items: baseline; font-size: 8.5pt; padding: 1.5pt 0; }
.tp-item .q { margin-left: auto; color: #555; white-space: nowrap; }
.tp-item .for { color: #888; font-size: 7pt; }
.tp-blank { border-bottom: 0.5pt solid #bbb; min-width: 34pt; display: inline-block; height: 10pt; }
.tp-good { color: #23a35a; font-weight: 700; }
.tp-warn { color: #c77700; font-weight: 700; }
.tp-insight { margin: 0 0 4pt; font-size: 8.5pt; }
.tp-insight b { margin-right: 4pt; }
.tp-chart { width: 100%; height: 130pt; }
.tp-note { font-size: 7.5pt; color: #666; margin-top: 6pt; }
`;

const td = (s: SpacePrintContext): TrainingData => normalizeTraining(s.space.training);
const mf = (ctx: SpacePrintContext) => ctx.space.settings?.weekStartsMonday ?? true;
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

function GroceryBlock({ lines, cols = 2 }: { lines: GroceryLine[]; cols?: number }) {
  if (!lines.length) return <p className="pp-muted">Nothing to buy — no meals planned in this range.</p>;
  return (
    <div className={cols === 3 ? 'tp-cols-3' : 'tp-cols'}>
      {AISLES.map((a) => {
        const xs = lines.filter((l) => l.aisle === a.value);
        if (!xs.length) return null;
        return (
          <div key={a.value} className="tp-aisle">
            <h3>{a.label}</h3>
            {xs.map((l) => (
              <div key={l.key} className="tp-item">
                <Check on={l.checked} />
                <span>
                  {l.name}
                  {l.meals.length > 0 && <span className="for"> · {l.meals.join(', ')}</span>}
                </span>
                <span className="q">{qtyText(l.qty, l.unit)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Tiny static weight chart (SVG) for print. */
function WeightSvg({ t, from, to }: { t: TrainingData; from: string; to: string }) {
  const u = unitKit(t.profile.units);
  const raw = weightSeries(t).filter((p) => p.date >= from && p.date <= to);
  const avg = avgSeries(weightSeries(t)).filter((p) => p.date >= from && p.date <= to);
  if (raw.length < 2) return null;
  const W = 500;
  const H = 130;
  const L = 34;
  const ys = [...raw.map((p) => p.kg), ...(t.goal.targetWeightKg != null ? [t.goal.targetWeightKg] : [])];
  const lo = Math.min(...ys) - 0.5;
  const hi = Math.max(...ys) + 0.5;
  const x0 = Date.parse(raw[0].date);
  const x1 = Date.parse(raw[raw.length - 1].date) || x0 + 1;
  const sx = (d: string) => L + ((Date.parse(d) - x0) / Math.max(1, x1 - x0)) * (W - L - 6);
  const sy = (kg: number) => 6 + (1 - (kg - lo) / (hi - lo || 1)) * (H - 22);
  const path = (pts: { date: string; kg: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.date).toFixed(1)},${sy(p.kg).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg className="tp-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - 6} y1={sy(v)} y2={sy(v)} stroke="#e3e3e8" strokeWidth={0.6} />
          <text x={L - 4} y={sy(v) + 3} fontSize={8} textAnchor="end" fill="#888">
            {round(u.fromKg(v)!, 1)}
          </text>
        </g>
      ))}
      {t.goal.targetWeightKg != null && t.goal.targetWeightKg >= lo && t.goal.targetWeightKg <= hi && <line x1={L} x2={W - 6} y1={sy(t.goal.targetWeightKg)} y2={sy(t.goal.targetWeightKg)} stroke="#888" strokeDasharray="3 3" strokeWidth={0.8} />}
      <path d={path(raw)} fill="none" stroke="#2a78d6" strokeWidth={1} opacity={0.6} />
      <path d={path(avg)} fill="none" stroke="#eb6834" strokeWidth={2} />
      <text x={L} y={H - 4} fontSize={8} fill="#888">
        {raw[0].date}
      </text>
      <text x={W - 6} y={H - 4} fontSize={8} fill="#888" textAnchor="end">
        {raw[raw.length - 1].date}
      </text>
    </svg>
  );
}

export const trainingPrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-train-meal-plan',
    title: 'Weekly Meal Plan',
    group: 'Training',
    kinds: ['training'],
    orientation: 'landscape',
    description: 'A week of planned meals by day and slot with daily macro totals, plus the grocery list',
    options: [
      { key: 'week', label: 'Week containing', type: 'text', default: '', hint: 'YYYY-MM-DD — empty = this week' },
      { key: 'macros', label: 'Daily macro totals', type: 'boolean', default: true },
      { key: 'grocery', label: 'Grocery list on page 2', type: 'boolean', default: true },
      { key: 'notes', label: 'Prep notes of the meals', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (normalizeTraining(s.training).plan.length ? false : 'Plan some meals in Nutrition → Meal plan first'),
    render: (ctx) => {
      const t = td(ctx);
      const meals = mealMap(t);
      const start = weekStartOf(isDate(ctx.options.week) ? ctx.options.week : ctx.todayISO, mf(ctx));
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      const used = [...new Set(t.plan.filter((e) => e.date >= days[0] && e.date <= days[6] && e.mealId).map((e) => e.mealId!))].map((id) => meals.get(id)).filter((m) => m && m.notes);
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Weekly Meal Plan" subtitle={`${ctx.fmt.dateMedium(days[0])} – ${ctx.fmt.dateMedium(days[6])}${t.macros.calories ? ` · targets ${t.macros.calories} kcal · ${t.macros.proteinG ?? '—'} g protein` : ''}`} />
            <table className="tp-grid">
              <thead>
                <tr>
                  <th style={{ width: 58 }} />
                  {days.map((d) => (
                    <th key={d}>{ctx.fmt.dateShort(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEAL_SLOTS.map((s) => (
                  <tr key={s.value}>
                    <td className="slot">{s.label}</td>
                    {days.map((d) => (
                      <td key={d}>
                        {t.plan
                          .filter((e) => e.date === d && e.slot === s.value)
                          .map((e) => (
                            <span key={e.id} className={`tp-meal ${e.eaten ? 'eaten' : ''}`}>
                              {entryLabel(e, meals)}
                              {e.servings !== 1 && <span className="s"> ×{e.servings}</span>}
                            </span>
                          ))}
                      </td>
                    ))}
                  </tr>
                ))}
                {ctx.options.macros && (
                  <tr>
                    <td className="slot">Total</td>
                    {days.map((d) => {
                      const m = dayPlanned(t, d, meals);
                      return (
                        <td key={d} className="tot">
                          {m.calories ? (
                            <>
                              <b>{Math.round(m.calories)} kcal</b>
                              <br />
                              {Math.round(m.protein)} P · {Math.round(m.carbs)} C · {Math.round(m.fat)} F
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
            {ctx.options.notes && used.length > 0 && (
              <PSection title="Prep notes" style={{ marginTop: '10pt' }}>
                {used.map((m) => (
                  <p key={m!.id} className="tp-insight">
                    <b>{m!.name}</b>
                    {m!.notes}
                  </p>
                ))}
              </PSection>
            )}
            {ctx.options.grocery && (
              <div className="pp-break-before">
                <PSection title="Grocery list" right={`${ctx.fmt.dateShort(days[0])} – ${ctx.fmt.dateShort(days[6])}`}>
                  <GroceryBlock lines={groceryList(t, days[0], days[6])} cols={3} />
                </PSection>
              </div>
            )}
          </>
        ),
      };
    },
  },
  {
    id: 'space-train-grocery',
    title: 'Grocery List',
    group: 'Training',
    kinds: ['training'],
    orientation: 'portrait',
    description: 'Ingredients of the planned meals in a date range, added up and grouped by aisle, with checkboxes',
    options: [
      { key: 'from', label: 'From', type: 'text', default: '', hint: 'YYYY-MM-DD — empty = the range set in Groceries (or this week)' },
      { key: 'to', label: 'To', type: 'text', default: '' },
      { key: 'hideChecked', label: 'Leave out items already checked', type: 'boolean', default: false },
    ],
    emptyReason: (s) => {
      const t = normalizeTraining(s.training);
      return t.plan.length || t.grocery.extras.length ? false : 'Plan meals (or add extras) in Nutrition first';
    },
    render: (ctx) => {
      const t = td(ctx);
      const wk = weekStartOf(ctx.todayISO, mf(ctx));
      const from = isDate(ctx.options.from) ? ctx.options.from : t.grocery.from ?? wk;
      const to = isDate(ctx.options.to) ? ctx.options.to : t.grocery.to ?? addDays(from, 6);
      const lines = groceryList(t, from, to).filter((l) => !ctx.options.hideChecked || !l.checked);
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Grocery List" subtitle={`${ctx.fmt.dateMedium(from)} – ${ctx.fmt.dateMedium(to)} · ${lines.length} items`} />
            <GroceryBlock lines={lines} />
          </>
        ),
      };
    },
  },
  {
    id: 'space-train-program',
    title: 'Workout Program',
    group: 'Training',
    kinds: ['training'],
    orientation: 'portrait',
    description: 'Training days with exercises, sets × reps, target weights, RPE and rest — with blank columns to log by hand',
    options: [
      { key: 'logColumns', label: 'Blank log columns', type: 'number', default: 3, min: 0, max: 6, hint: 'one per session you want to write in' },
      { key: 'pagePerDay', label: 'New page per day', type: 'boolean', default: false },
      { key: 'notes', label: 'Exercise notes', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (normalizeTraining(s.training).program.days.length ? false : 'Build your program in Workouts → Program first'),
    render: (ctx) => {
      const t = td(ctx);
      const u = unitKit(t.profile.units);
      const n = Math.max(0, Math.min(6, Number(ctx.options.logColumns) || 0));
      const ex = new Map(t.exercises.map((x) => [x.id, x.name]));
      const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title={t.program.name || 'Workout Program'} subtitle={`${t.program.days.length} training day${t.program.days.length === 1 ? '' : 's'}${t.program.startDate ? ` · since ${ctx.fmt.dateMedium(t.program.startDate)}` : ''}`} />
            {t.program.notes && <p className="tp-note" style={{ marginTop: 0 }}>{t.program.notes}</p>}
            {t.program.days.map((d, i) => (
              <div key={d.id} className={`pp-avoid ${ctx.options.pagePerDay && i > 0 ? 'pp-break-before' : ''}`}>
                <PSection title={`${d.name}${d.focus ? ` — ${d.focus}` : ''}`} right={weekdaysOf(d.weekdays).map((w) => WD[w]).join(' / ') || undefined}>
                  <PTable
                    zebra
                    rows={d.exercises}
                    columns={[
                      { header: 'Exercise', width: '30%', cell: (r) => <b>{r.exerciseId ? ex.get(r.exerciseId) ?? '—' : '—'}</b> },
                      { header: 'Sets × reps', cell: (r) => `${r.sets} × ${r.reps ?? '?'}` },
                      { header: 'Target', cell: (r) => (r.targetKg != null ? u.weight(r.targetKg) : '') },
                      { header: 'RPE', cell: (r) => r.rpe ?? '' },
                      { header: 'Rest', cell: (r) => (r.restSec ? `${Math.floor(r.restSec / 60)}:${String(r.restSec % 60).padStart(2, '0')}` : '') },
                      ...(ctx.options.notes ? [{ header: 'Notes', width: '20%', cell: (r: (typeof d.exercises)[number]) => <span className="pp-small">{r.notes ?? ''}</span> }] : []),
                      ...Array.from({ length: n }, (_, k) => ({ header: `Session ${k + 1}`, cell: () => <span className="tp-blank" /> })),
                    ]}
                    empty="No exercises."
                  />
                  {d.notes && <p className="tp-note">{d.notes}</p>}
                </PSection>
              </div>
            ))}
          </>
        ),
      };
    },
  },
  {
    id: 'space-train-progress',
    title: 'Progress Report',
    group: 'Training',
    kinds: ['training'],
    orientation: 'portrait',
    description: 'Weight and measurements, workouts, consistency, nutrition, PRs, goal projection and insights for a period',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: '28d', choices: [...REPORT_PERIODS.map((p) => ({ value: p.value, label: p.label })), { value: 'custom', label: 'Custom dates' }] },
      { key: 'from', label: 'From (custom)', type: 'text', default: '', hint: 'YYYY-MM-DD' },
      { key: 'to', label: 'To (custom)', type: 'text', default: '' },
      { key: 'sessions', label: 'List every workout', type: 'boolean', default: true },
      { key: 'notes', label: 'Pinned coach notes', type: 'boolean', default: true },
    ],
    emptyReason: (s) => {
      const t = normalizeTraining(s.training);
      return t.metrics.length || t.sessions.length || t.checkIns.length ? false : 'Log weight, workouts or check-ins first';
    },
    render: (ctx) => {
      const t = td(ctx);
      const u = unitKit(t.profile.units);
      const { from, to } = periodRange(t, String(ctx.options.period ?? '28d'), ctx.todayISO, isDate(ctx.options.from) ? ctx.options.from : undefined, isDate(ctx.options.to) ? ctx.options.to : undefined);
      const r = trainingReport(t, from, to, ctx.todayISO, mf(ctx), ctx.fmt.dateMedium);
      const pinned = t.coachNotes.filter((n) => n.pinned);
      const kg = (x?: number) => (x == null ? '—' : u.weight(x));
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Progress Report" subtitle={`${ctx.fmt.dateMedium(from)} – ${ctx.fmt.dateMedium(to)} · ${r.days} days`} />
            {t.goal.statement && (
              <Box title="Goal">
                <span>{t.goal.statement}</span>
              </Box>
            )}
            <PSection title="Summary">
              <KV
                cols={4}
                items={[
                  ['Weight (7-day avg)', r.weight.endKg != null ? `${kg(r.weight.startKg)} → ${kg(r.weight.endKg)}` : '—'],
                  ['Change', r.weight.changeKg != null ? u.delta(r.weight.changeKg) : '—'],
                  ['Rate', r.weight.ratePerWeek != null ? `${u.delta(r.weight.ratePerWeek)}/week` : '—'],
                  ['Body fat', r.bodyFat.end != null ? `${r.bodyFat.start != null && r.bodyFat.start !== r.bodyFat.end ? `${round(r.bodyFat.start, 1)}% → ` : ''}${round(r.bodyFat.end, 1)}%` : '—'],
                  ['Workouts', `${r.workouts.count} (${r.workouts.perWeek}/week)`],
                  ['Sets · volume', `${r.workouts.sets} · ${u.weight(r.workouts.volume, 0)}`],
                  ['Days logged', `${r.consistency.daysLogged} (${r.consistency.pct}%)`],
                  ['Streak', `${r.consistency.currentStreak} days (best ${r.consistency.bestStreak})`],
                  ['Avg calories', r.nutrition.avgCalories != null ? `${r.nutrition.avgCalories}${r.nutrition.calorieTarget ? ` / ${r.nutrition.calorieTarget}` : ''} kcal` : '—'],
                  ['Avg protein', r.nutrition.avgProtein != null ? `${r.nutrition.avgProtein}${r.nutrition.proteinTarget ? ` / ${r.nutrition.proteinTarget}` : ''} g` : '—'],
                  ['Protein days hit', r.nutrition.proteinHitDays != null && r.nutrition.daysLogged ? `${r.nutrition.proteinHitDays} of ${r.nutrition.daysLogged}` : '—'],
                  ['Mood · energy · sleep', [r.checkIns.mood, r.checkIns.energy, r.checkIns.sleep].some((x) => x != null) ? `${r.checkIns.mood ?? '—'} · ${r.checkIns.energy ?? '—'} · ${r.checkIns.sleep ?? '—'} /5` : '—'],
                ]}
              />
              <p className="tp-note">{projectionText(r.trend, t.profile.units, ctx.fmt.dateMedium)}</p>
            </PSection>
            <PSection title={`Weight (${u.w})`} right="blue = weigh-ins · orange = 7-day average · dashed = goal">
              <WeightSvg t={t} from={from} to={to} />
              <PTable
                zebra
                rows={r.weight.weekly}
                columns={[
                  { header: 'Week of', cell: (w) => ctx.fmt.dateMedium(w.weekStart) },
                  { header: 'Average', align: 'right', cell: (w) => u.weight(w.avgKg) },
                  { header: 'Low', align: 'right', cell: (w) => u.weight(w.minKg) },
                  { header: 'High', align: 'right', cell: (w) => u.weight(w.maxKg) },
                  { header: 'Weigh-ins', align: 'right', cell: (w) => w.n },
                ]}
                empty="No weigh-ins in this period."
              />
            </PSection>
            {r.measurements.length > 0 && (
              <PSection title={`Measurements (${u.len})`}>
                <PTable
                  zebra
                  rows={r.measurements}
                  columns={[
                    { header: 'Measurement', cell: (m) => m.label },
                    { header: 'Start', align: 'right', cell: (m) => u.length(m.startCm) },
                    { header: 'End', align: 'right', cell: (m) => u.length(m.endCm) },
                    { header: 'Change', align: 'right', cell: (m) => (m.changeCm != null ? <span className={m.changeCm < 0 ? 'tp-good' : undefined}>{`${m.changeCm > 0 ? '+' : ''}${u.length(m.changeCm)}`}</span> : '—') },
                  ]}
                />
              </PSection>
            )}
            {r.prs.length > 0 && (
              <PSection title="New personal records">
                <PTable
                  zebra
                  rows={r.prs}
                  columns={[
                    { header: 'Exercise', cell: (p) => <b>{p.name}</b> },
                    { header: 'Date', cell: (p) => ctx.fmt.dateShort(p.date) },
                    { header: 'Set', align: 'right', cell: (p) => `${u.weightNum(p.kg)} × ${p.reps}` },
                    { header: 'e1RM', align: 'right', cell: (p) => u.weight(p.e1rm) },
                    { header: 'Previous best', align: 'right', cell: (p) => (p.previous != null ? u.weight(p.previous) : '') },
                  ]}
                />
              </PSection>
            )}
            {ctx.options.sessions && (
              <PSection title="Workouts" right={r.workouts.missed ? `${r.workouts.missed} planned day${r.workouts.missed === 1 ? '' : 's'} missed` : undefined}>
                <PTable
                  zebra
                  rows={r.workouts.sessions}
                  columns={[
                    { header: 'Date', cell: (s) => ctx.fmt.dateShort(s.date) },
                    { header: 'Session', cell: (s) => s.name },
                    { header: 'Sets', align: 'right', cell: (s) => s.sets },
                    { header: `Volume (${u.w})`, align: 'right', cell: (s) => u.weightNum(s.volume, 0) },
                    { header: 'Minutes', align: 'right', cell: (s) => s.durationMin ?? '' },
                  ]}
                  empty="No workouts in this period."
                />
              </PSection>
            )}
            <PSection title="Insights">
              {r.insights.map((i) => (
                <p key={i.id} className="tp-insight">
                  <b className={i.tone === 'good' ? 'tp-good' : i.tone === 'warn' ? 'tp-warn' : undefined}>{i.title}.</b>
                  {i.text}
                </p>
              ))}
              <p className="tp-note">Computed from logged data. Not medical advice.</p>
            </PSection>
            {ctx.options.notes && pinned.length > 0 && (
              <PSection title="Coach notes">
                {pinned.map((n) => (
                  <p key={n.id} className="tp-insight">
                    <b>{n.title}.</b>
                    {n.body}
                  </p>
                ))}
              </PSection>
            )}
          </>
        ),
      };
    },
  },
];
