/* Units: values are stored metric (kg, cm, L); the profile decides what is shown
   and typed (metric or imperial). Pure helpers, shared by screens, print and agents. */
import type { Units } from './types';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const L_PER_FLOZ = 0.0295735;

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const trim = (n: number, d: number) => {
  const s = r(n, d).toFixed(d);
  return d > 0 ? s.replace(/\.?0+$/, '') : s;
};

export interface UnitKit {
  units: Units;
  /** 'kg' | 'lb' */
  w: string;
  /** 'cm' | 'in' */
  len: string;
  /** stored kg → display number */
  fromKg(kg: number | undefined): number | undefined;
  /** display number → stored kg */
  toKg(v: number | undefined): number | undefined;
  fromCm(cm: number | undefined): number | undefined;
  toCm(v: number | undefined): number | undefined;
  /** "82.4 kg" / "181.7 lb" */
  weight(kg: number | undefined | null, digits?: number): string;
  /** number only, trimmed */
  weightNum(kg: number | undefined | null, digits?: number): string;
  /** signed change: "−0.4 kg" */
  delta(kg: number | undefined | null, digits?: number): string;
  length(cm: number | undefined | null, digits?: number): string;
  height(cm: number | undefined | null): string;
}

export function unitKit(units: Units = 'metric'): UnitKit {
  const imp = units === 'imperial';
  const fromKg = (kg: number | undefined) => (kg == null ? undefined : imp ? kg / KG_PER_LB : kg);
  const toKg = (v: number | undefined) => (v == null ? undefined : imp ? r(v * KG_PER_LB, 4) : v);
  const fromCm = (cm: number | undefined) => (cm == null ? undefined : imp ? cm / CM_PER_IN : cm);
  const toCm = (v: number | undefined) => (v == null ? undefined : imp ? r(v * CM_PER_IN, 3) : v);
  const w = imp ? 'lb' : 'kg';
  const len = imp ? 'in' : 'cm';
  return {
    units,
    w,
    len,
    fromKg,
    toKg,
    fromCm,
    toCm,
    weight: (kg, digits = 1) => (kg == null || !isFinite(kg) ? '—' : `${trim(fromKg(kg)!, digits)} ${w}`),
    weightNum: (kg, digits = 1) => (kg == null || !isFinite(kg) ? '' : trim(fromKg(kg)!, digits)),
    delta: (kg, digits = 1) => {
      if (kg == null || !isFinite(kg)) return '—';
      const v = fromKg(kg)!;
      const s = trim(Math.abs(v), digits);
      return `${v > 0.00001 && s !== '0' ? '+' : v < -0.00001 && s !== '0' ? '−' : '±'}${s} ${w}`;
    },
    length: (cm, digits = 1) => (cm == null || !isFinite(cm) ? '—' : `${trim(fromCm(cm)!, digits)} ${len}`),
    height: (cm) => {
      if (cm == null || !isFinite(cm)) return '—';
      if (!imp) return `${Math.round(cm)} cm`;
      const inches = Math.round(cm / CM_PER_IN);
      return `${Math.floor(inches / 12)}′${inches % 12}″`;
    },
  };
}

/** Parse "5'11", "5 ft 11", "71in", "180" (cm when metric) → cm. */
export function parseHeight(text: string, units: Units): number | undefined {
  const s = text.trim().toLowerCase();
  if (!s) return undefined;
  const ft = /^(\d+(?:\.\d+)?)\s*(?:'|′|ft|feet)\s*(\d+(?:\.\d+)?)?\s*(?:"|″|in)?$/.exec(s);
  if (ft) return r((Number(ft[1]) * 12 + Number(ft[2] ?? 0)) * CM_PER_IN, 1);
  const inch = /^(\d+(?:\.\d+)?)\s*(?:"|″|in|inches)$/.exec(s);
  if (inch) return r(Number(inch[1]) * CM_PER_IN, 1);
  const cm = /^(\d+(?:\.\d+)?)\s*(?:cm)?$/.exec(s);
  if (cm) {
    const n = Number(cm[1]);
    return units === 'imperial' && n < 100 ? r(n * CM_PER_IN, 1) : n;
  }
  return undefined;
}

/** Convert a weight given by an agent / user in a named unit to kg. */
export function weightToKg(v: number, unit: string | undefined, units: Units): number {
  const u = (unit ?? '').toLowerCase();
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return r(v * KG_PER_LB, 4);
  if (u === 'kg' || u === 'kgs' || u === 'kilo' || u === 'kilos') return v;
  return units === 'imperial' ? r(v * KG_PER_LB, 4) : v;
}

export function lengthToCm(v: number, unit: string | undefined, units: Units): number {
  const u = (unit ?? '').toLowerCase();
  if (u === 'in' || u === 'inch' || u === 'inches') return r(v * CM_PER_IN, 3);
  if (u === 'cm') return v;
  return units === 'imperial' ? r(v * CM_PER_IN, 3) : v;
}
