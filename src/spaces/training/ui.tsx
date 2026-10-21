/* Shared pieces of the Training screens: data hooks, unit-aware inputs, rating
   picker, macro bars, weight chart, consistency heatmap, insight list. */
import './training.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Stethoscope } from 'lucide-react';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace, useApp } from '@/store/app';
import { todayISO, WEEKDAYS_SHORT } from '@/lib/dates';
import { NumberInput } from '@/ui';
import { LineChart, Meter, type LineSeries } from '@/ui/charts';
import { normalizeTraining, RATING_WORDS, type ISODate, type TrainingData } from './types';
import { unitKit, type UnitKit } from './units';
import { avgSeries, heatmap, projectionPoints, weekdayOrder, weightSeries, weightTrend, type Insight, type Macros } from './calc';

const EMPTY = normalizeTraining({});

/** The Training data of the open space (never undefined). */
export function useTraining(): TrainingData {
  return useSpace((s) => s.training) ?? EMPTY;
}

export function useUnits(): UnitKit {
  const units = useSpace((s) => s.training?.profile.units) ?? 'metric';
  return useMemo(() => unitKit(units), [units]);
}

export function useMondayFirst(): boolean {
  return useSpace((s) => s.settings?.weekStartsMonday) ?? true;
}

/** Today's date; refreshes when the window regains focus after midnight. */
export function useToday(): ISODate {
  const [d, setD] = useState(todayISO);
  useEffect(() => {
    const on = () => setD(todayISO());
    window.addEventListener('focus', on);
    const id = window.setInterval(on, 60_000);
    return () => {
      window.removeEventListener('focus', on);
      window.clearInterval(id);
    };
  }, []);
  return d;
}

/** Module params (re-read on every navigation). */
export function useNavParams(): Record<string, any> {
  const params = useApp((s) => s.params);
  useApp((s) => s.navKey);
  return params ?? {};
}

export function go(module: string, params: Record<string, any> = {}) {
  navigateSpace(module, params);
}

/* ---------------------------------------------------------------- inputs */

/** Weight input in the profile's units; value / onChange in kg. */
export function WeightInput({ kg, onChange, u, size, placeholder, autoFocus, className, ariaLabel }: { kg: number | undefined; onChange: (kg: number | undefined) => void; u: UnitKit; size?: 'sm' | 'md'; placeholder?: string; autoFocus?: boolean; className?: string; ariaLabel?: string }) {
  const shown = kg == null ? undefined : Math.round(u.fromKg(kg)! * 100) / 100;
  return (
    <div className={`tr-unit-input ${className ?? ''}`}>
      <NumberInput value={shown} onChange={(v) => onChange(u.toKg(v))} size={size} placeholder={placeholder} autoFocus={autoFocus} inputMode="decimal" aria-label={ariaLabel ?? `Weight in ${u.w}`} />
      <span className="tr-unit">{u.w}</span>
    </div>
  );
}

export function LengthInput({ cm, onChange, u, size, placeholder, ariaLabel }: { cm: number | undefined; onChange: (cm: number | undefined) => void; u: UnitKit; size?: 'sm' | 'md'; placeholder?: string; ariaLabel?: string }) {
  const shown = cm == null ? undefined : Math.round(u.fromCm(cm)! * 10) / 10;
  return (
    <div className="tr-unit-input">
      <NumberInput value={shown} onChange={(v) => onChange(u.toCm(v))} size={size} placeholder={placeholder} inputMode="decimal" aria-label={ariaLabel ?? `Length in ${u.len}`} />
      <span className="tr-unit">{u.len}</span>
    </div>
  );
}

export function NumberUnit({ value, onChange, unit, size, placeholder, step, ariaLabel }: { value: number | undefined; onChange: (v: number | undefined) => void; unit: string; size?: 'sm' | 'md'; placeholder?: string; step?: number; ariaLabel?: string }) {
  return (
    <div className="tr-unit-input">
      <NumberInput value={value} onChange={onChange} size={size} placeholder={placeholder} inputMode="decimal" step={step} aria-label={ariaLabel ?? unit} />
      <span className="tr-unit">{unit}</span>
    </div>
  );
}

/** 1–5 rating as five big tap targets (click the active one again to clear). */
export function RatingPicker({ value, onChange, kind, label }: { value: number | undefined; onChange: (v: number | undefined) => void; kind: keyof typeof RATING_WORDS; label?: string }) {
  const words = RATING_WORDS[kind];
  return (
    <div className="tr-rating" role="radiogroup" aria-label={label ?? kind}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? 'on' : value != null && n < value ? 'under' : ''} title={`${n} · ${words[n - 1]}`} onClick={() => onChange(value === n ? undefined : n)}>
          <b>{n}</b>
          <span>{words[n - 1]}</span>
        </button>
      ))}
    </div>
  );
}

/** Weekday toggles (0 = Sunday). */
export function WeekdayPicker({ value, onChange, mondayFirst }: { value: number[]; onChange: (v: number[]) => void; mondayFirst: boolean }) {
  return (
    <div className="tr-weekdays">
      {weekdayOrder(mondayFirst).map((d) => (
        <button key={d} type="button" className={value.includes(d) ? 'on' : ''} aria-pressed={value.includes(d)} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}>
          {WEEKDAYS_SHORT[d].slice(0, 2)}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- display */

export function NotMedical({ children }: { children?: ReactNode }) {
  return (
    <p className="tr-disclaimer">
      <Stethoscope size={13} />
      <span>{children ?? 'Not medical advice. Estimates for healthy adults — check with a doctor or registered dietitian before big changes, if you are pregnant, or have a medical condition.'}</span>
    </p>
  );
}

const MACRO_ROWS: { key: keyof Macros; label: string; unit: string; target: 'calories' | 'proteinG' | 'carbsG' | 'fatG' }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', target: 'calories' },
  { key: 'protein', label: 'Protein', unit: 'g', target: 'proteinG' },
  { key: 'carbs', label: 'Carbs', unit: 'g', target: 'carbsG' },
  { key: 'fat', label: 'Fat', unit: 'g', target: 'fatG' },
];

/** Eaten (or planned) macros against the targets. */
export function MacroBars({ value, targets, compact }: { value: Macros; targets: TrainingData['macros']; compact?: boolean }) {
  return (
    <div className={`tr-macros ${compact ? 'compact' : ''}`}>
      {MACRO_ROWS.map((r) => {
        const v = Math.round(value[r.key]);
        const tg = targets[r.target];
        const tone = tg ? (v > tg * 1.1 && r.key !== 'protein' ? 'warning' : v >= tg * 0.9 ? 'good' : undefined) : undefined;
        return (
          <div key={r.key} className="tr-macro-row">
            <span className="tr-macro-label">{r.label}</span>
            <Meter value={v} max={tg || Math.max(v, 1)} tone={tone} label={`${r.label} ${v} of ${tg ?? '—'} ${r.unit}`} />
            <span className="tr-macro-val">
              <b>{v}</b>
              {tg ? <span className="muted"> / {tg}</span> : null} {r.unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Body weight: daily weigh-ins, 7-day average, dashed projection and the target line. */
export function WeightChart({ t, height = 220, weeks, projection = true }: { t: TrainingData; height?: number; weeks?: number; projection?: boolean }) {
  const u = unitKit(t.profile.units);
  const fmt = useSpaceFormatters();
  const series = useMemo<LineSeries[]>(() => {
    const raw = weightSeries(t);
    const from = weeks && raw.length ? raw[raw.length - 1].date : undefined;
    const cut = (d: string) => !from || !weeks || d >= addDaysLocal(from, -weeks * 7);
    const daily = raw.filter((p) => cut(p.date));
    const avg = avgSeries(raw).filter((p) => cut(p.date));
    const tr = weightTrend(t);
    const proj = projection && tr ? projectionPoints(tr) : [];
    const conv = (kg: number) => Math.round(u.fromKg(kg)! * 10) / 10;
    const out: LineSeries[] = [
      { id: 'w', label: 'Weigh-ins', points: daily.map((p) => ({ x: p.date, y: conv(p.kg) })), slot: 0 },
      { id: 'a', label: '7-day average', points: avg.map((p) => ({ x: p.date, y: conv(p.kg) })), slot: 1 },
    ];
    if (proj.length) out.push({ id: 'p', label: 'Projection', points: proj.map((p) => ({ x: p.date, y: conv(p.kg) })), slot: 1, dashed: true });
    return out;
  }, [t, weeks, projection, u]);
  const target = t.goal.targetWeightKg != null ? { y: Math.round(u.fromKg(t.goal.targetWeightKg)! * 10) / 10, label: `Goal ${u.weight(t.goal.targetWeightKg)}` } : undefined;
  return (
    <LineChart
      series={series}
      height={height}
      target={target}
      yFormat={(v) => `${Math.round(v * 10) / 10}`}
      xFormat={(x) => (typeof x === 'string' ? fmt.dateShort(x).replace(/^\w+ /, '') : String(x))}
      ariaLabel={`Body weight in ${u.w} with 7-day average${target ? ' and goal' : ''}`}
      empty="No weigh-ins yet — log your weight to see the trend."
    />
  );
}

function addDaysLocal(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type HeatKind = 'logged' | 'workout' | 'photo';

/** 12-week calendar of logged days / workouts / photos. */
export function Heatmap({ t, today, mondayFirst, kind }: { t: TrainingData; today: ISODate; mondayFirst: boolean; kind: HeatKind }) {
  const fmt = useSpaceFormatters();
  const weeks = useMemo(() => heatmap(t, today, 12, mondayFirst), [t, today, mondayFirst]);
  const order = weekdayOrder(mondayFirst);
  const label = kind === 'logged' ? 'logged' : kind === 'workout' ? 'workout' : 'photo';
  return (
    <div className="tr-heat" role="img" aria-label={`Last 12 weeks: days with a ${label}`}>
      <div className="tr-heat-days" aria-hidden>
        {order.map((d, i) => (
          <span key={d}>{i % 2 === 0 ? WEEKDAYS_SHORT[d].slice(0, 1) : ''}</span>
        ))}
      </div>
      <div className="tr-heat-grid">
        {weeks.map((w, wi) => (
          <div key={wi} className="tr-heat-col">
            {w.map((c) => {
              const on = kind === 'logged' ? c.logged : kind === 'workout' ? c.workout : c.photo;
              const level = kind === 'logged' ? (c.logged ? 1 + (c.workout ? 1 : 0) + (c.photo ? 1 : 0) : 0) : on ? 3 : 0;
              return <span key={c.date} className={`tr-heat-cell l${level} ${c.future ? 'future' : ''} ${c.date === today ? 'today' : ''}`} title={`${fmt.dateMedium(c.date)}${c.future ? '' : `: ${[c.logged && 'logged', c.workout && 'workout', c.photo && 'photo'].filter(Boolean).join(', ') || 'nothing logged'}`}`} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const TONE_ICON = { good: CheckCircle2, warn: AlertTriangle, info: Info };

export function InsightList({ items, limit }: { items: Insight[]; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <ul className="tr-insights">
      {list.map((x) => {
        const Icon = TONE_ICON[x.tone];
        return (
          <li key={x.id} className={`tr-insight ${x.tone}`}>
            <Icon size={16} />
            <div className="grow">
              <b>{x.title}</b>
              <p>{x.text}</p>
            </div>
            {x.module && (
              <button type="button" className="tr-link" onClick={() => go(x.module!, x.params ?? {})} aria-label={`Open ${x.title}`}>
                <ChevronRight size={16} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Small "label: value" chip. */
export function Pill({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' | 'accent' }) {
  return <span className={`tr-pill ${tone ?? ''}`}>{children}</span>;
}
