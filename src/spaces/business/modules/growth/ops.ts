/* Write operations and helpers of growth initiatives (steps, check-ins, linked
   expenses, "on track"). Shared by the Growth screen, print docs and agent tools. */
import { uid } from '@/lib/id';
import { diffDays } from '@/lib/dates';
import { bizUpdate } from '../../ops';
import { initiativeProgress, type InitiativeProgress } from '../../derive-work';
import type { BizTask, BusinessData, Initiative, InitiativeUpdate } from '../../types';

export type InitiativeChild = 'steps' | 'updates';

export const makeUpdate = (p: Partial<InitiativeUpdate> = {}): InitiativeUpdate => ({ id: uid('upd'), date: '', ...p });

/** Keep `current` equal to the latest dated check-in value. */
function syncCurrent(i: { updates: InitiativeUpdate[]; current?: number }) {
  const last = [...i.updates].filter((u) => u.value != null).sort((a, z) => a.date.localeCompare(z.date)).pop();
  if (last) i.current = last.value;
}

export function addInitiativeChild(initId: string, list: InitiativeChild, item: BizTask | InitiativeUpdate) {
  bizUpdate((b) => {
    const it = b.initiatives.find((x) => x.id === initId);
    if (!it) return;
    (it[list] as unknown as (BizTask | InitiativeUpdate)[]).push(item);
    if (list === 'updates') {
      it.updates.sort((a, z) => a.date.localeCompare(z.date));
      syncCurrent(it);
    }
  });
}

export function updateInitiativeChild(initId: string, list: InitiativeChild, id: string, patch: Record<string, unknown>, coalesce = true) {
  bizUpdate(
    (b) => {
      const it = b.initiatives.find((x) => x.id === initId);
      const c = (it?.[list] as unknown as Record<string, unknown>[] | undefined)?.find((x) => x.id === id);
      if (!it || !c) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete c[k];
        else c[k] = v;
      }
      if (list === 'updates') syncCurrent(it);
    },
    coalesce ? { coalesce: `biz:init:${initId}:${list}:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function removeInitiativeChild(initId: string, list: InitiativeChild, id: string) {
  bizUpdate((b) => {
    const it = b.initiatives.find((x) => x.id === initId);
    if (!it) return;
    const arr = it[list] as unknown as { id: string }[];
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr.splice(i, 1);
  });
}

export function moveInitiativeStep(initId: string, id: string, dir: -1 | 1) {
  bizUpdate((b) => {
    const it = b.initiatives.find((x) => x.id === initId);
    if (!it) return;
    const i = it.steps.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= it.steps.length) return;
    const [s] = it.steps.splice(i, 1);
    it.steps.splice(j, 0, s);
  });
}

/** Link (or unlink with undefined) an expense to an initiative. */
export function linkExpense(expenseId: string, initiativeId: string | undefined) {
  bizUpdate((b) => {
    const e = b.expenses.find((x) => x.id === expenseId);
    if (!e) return;
    if (initiativeId) e.initiativeId = initiativeId;
    else delete e.initiativeId;
  });
}

/** In progress, not overdue and KPI progress keeping up with the time elapsed. */
export function isOnTrack(i: Initiative, p: InitiativeProgress, today: string): boolean {
  if (i.status !== 'in_progress' || p.overdue) return false;
  if (p.pct == null || !i.startDate || !i.dueDate) return true;
  const total = diffDays(i.startDate, i.dueDate);
  if (total <= 0) return true;
  const expected = Math.max(0, Math.min(1, diffDays(i.startDate, today) / total));
  return p.pct >= expected - 0.15;
}

export interface GrowthSummary {
  active: number;
  open: number;
  onTrack: number;
  budget: number;
  spent: number;
}

export function growthSummary(b: BusinessData, today: string): GrowthSummary {
  let budget = 0;
  let spent = 0;
  let onTrack = 0;
  for (const i of b.initiatives) {
    if (i.status === 'dropped') continue;
    const p = initiativeProgress(b, i, today);
    budget += i.budget ?? 0;
    spent += p.spent;
    if (isOnTrack(i, p, today)) onTrack++;
  }
  return {
    active: b.initiatives.filter((i) => i.status === 'in_progress').length,
    open: b.initiatives.filter((i) => i.status !== 'done' && i.status !== 'dropped').length,
    onTrack,
    budget: Math.round(budget * 100) / 100,
    spent: Math.round(spent * 100) / 100,
  };
}

/** Impact / effort quadrant (1–5 ratings; 3 and up counts as high). */
export type Quadrant = 'quick_win' | 'big_bet' | 'fill_in' | 'money_pit';

export const QUADRANTS: { id: Quadrant; label: string; hint: string; color: string }[] = [
  { id: 'quick_win', label: 'Quick wins', hint: 'High impact, low effort — do these first', color: '#2fb36d' },
  { id: 'big_bet', label: 'Big bets', hint: 'High impact, high effort — plan them well', color: '#4c6ef5' },
  { id: 'fill_in', label: 'Fill-ins', hint: 'Low impact, low effort — when there is time', color: '#f59f00' },
  { id: 'money_pit', label: 'Money pits', hint: 'Low impact, high effort — question these', color: '#e03131' },
];

export function quadrantOf(i: Initiative): Quadrant | null {
  if (!i.impact || !i.effort) return null;
  const hi = i.impact >= 3;
  const he = i.effort >= 3;
  return hi ? (he ? 'big_bet' : 'quick_win') : he ? 'money_pit' : 'fill_in';
}
