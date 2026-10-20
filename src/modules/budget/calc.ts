/* Budget maths (pure): line totals, category / section subtotals, top-sheet summary. */
import type { Budget, BudgetCategory, BudgetLine } from '@/types';

export type SectionId = BudgetCategory['section'];

export interface SectionDef {
  id: SectionId;
  label: string;
  short: string;
  color: string;
  /** first account code of the section */
  base: number;
}

export const SECTIONS: SectionDef[] = [
  { id: 'atl', label: 'Above-the-line', short: 'ATL', color: '#7c5cff', base: 1000 },
  { id: 'btl', label: 'Below-the-line', short: 'BTL', color: '#3e8ef7', base: 2000 },
  { id: 'post', label: 'Post-production', short: 'Post', color: '#f5a524', base: 4000 },
  { id: 'other', label: 'Other', short: 'Other', color: '#868e96', base: 5000 },
];

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<SectionId, SectionDef>;

export const UNITS = ['day', 'week', 'hour', 'flat', 'each', 'allow', 'month', 'kit', 'person'];

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && !isNaN(v) ? v : fallback);

/** qty × rate × x × (1 + fringe %) */
export function lineTotal(l: BudgetLine): number {
  return num(l.qty) * num(l.rate) * num(l.x, 1) * (1 + num(l.fringePct) / 100);
}

export function lineActual(l: BudgetLine): number {
  return num(l.actual);
}

export function catTotal(c: BudgetCategory): number {
  return (c.lines ?? []).reduce((n, l) => n + lineTotal(l), 0);
}

export function catActual(c: BudgetCategory): number {
  return (c.lines ?? []).reduce((n, l) => n + lineActual(l), 0);
}

export function categoriesInSection(b: Pick<Budget, 'categories'>, s: SectionId): BudgetCategory[] {
  return (b.categories ?? []).filter((c) => (c.section ?? 'other') === s);
}

export interface SectionSummary {
  def: SectionDef;
  cats: { cat: BudgetCategory; total: number; actual: number }[];
  total: number;
  actual: number;
}

export interface BudgetSummary {
  sections: SectionSummary[];
  subtotal: number;
  actual: number;
  contingencyPct: number;
  contingency: number;
  insurancePct: number;
  insurance: number;
  taxPct: number;
  tax: number;
  grand: number;
  bySection: Record<SectionId, number>;
}

export function summarize(b: Budget | undefined): BudgetSummary {
  const budget: Budget = b ?? { contingencyPct: 0, categories: [] };
  const sections = SECTIONS.map((def) => {
    const cats = categoriesInSection(budget, def.id).map((cat) => ({ cat, total: catTotal(cat), actual: catActual(cat) }));
    return { def, cats, total: cats.reduce((n, c) => n + c.total, 0), actual: cats.reduce((n, c) => n + c.actual, 0) };
  });
  const subtotal = sections.reduce((n, s) => n + s.total, 0);
  const actual = sections.reduce((n, s) => n + s.actual, 0);
  const contingencyPct = num(budget.contingencyPct);
  const insurancePct = num(budget.insurancePct);
  const taxPct = num(budget.taxPct);
  const contingency = (subtotal * contingencyPct) / 100;
  const insurance = (subtotal * insurancePct) / 100;
  const tax = (subtotal * taxPct) / 100;
  const bySection = Object.fromEntries(sections.map((s) => [s.def.id, s.total])) as Record<SectionId, number>;
  return { sections, subtotal, actual, contingencyPct, contingency, insurancePct, insurance, taxPct, tax, grand: subtotal + contingency + insurance + tax, bySection };
}

/** Next free account code in a section (multiples of 100). */
export function nextCode(b: Pick<Budget, 'categories'>, s: SectionId): string {
  const def = SECTION_BY_ID[s];
  const codes = categoriesInSection(b, s)
    .map((c) => parseInt(c.code ?? '', 10))
    .filter((n) => !isNaN(n));
  const max = codes.length ? Math.max(...codes) : def.base - 100;
  return String(Math.floor(max / 100) * 100 + 100);
}

/** Index in budget.categories where a new category of a section should be inserted (after the section's last one). */
export function insertIndex(b: Pick<Budget, 'categories'>, s: SectionId): number {
  const order = SECTIONS.map((x) => x.id);
  let idx = -1;
  b.categories.forEach((c, i) => {
    if (order.indexOf(c.section) <= order.indexOf(s)) idx = i;
  });
  return idx + 1;
}

/** Target runtime ('HH:MM:SS', 'MM:SS' or minutes) → minutes. */
export function runtimeMinutes(rt: string | undefined): number {
  const t = (rt ?? '').trim();
  if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const parts = t.split(':').map((x) => parseFloat(x));
  if (parts.some((x) => isNaN(x))) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

/** variance = estimate − actual (negative = over budget) */
export function varianceTone(estimate: number, actual: number): 'over' | 'near' | 'under' | 'none' {
  if (!actual) return 'none';
  if (actual > estimate + 0.005) return 'over';
  if (estimate > 0 && actual / estimate >= 0.9) return 'near';
  return 'under';
}
