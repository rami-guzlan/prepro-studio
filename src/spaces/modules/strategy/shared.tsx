/* Strategy module: list operations, add / delete with reference clean-up,
   CSV exports and small shared components. */
import { useState } from 'react';
import type { Goal, Persona, Pillar, SpaceData, Tactic } from '@/spaces/types';
import { GOAL_STATUSES, PILLAR_COLORS, TACTIC_STATUSES } from '@/spaces/constants';
import { goalProgress } from '@/spaces/derive';
import { makeGoal, makePillar } from '@/spaces/defaults';
import { getSpace, spaceListOps, updateSpace } from '@/store/space';
import { exportCsv } from '@/backend';
import { diffDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { optionLabel } from '@/lib/constants';
import { safeFileName } from '@/lib/text';
import { ColorPicker, Popover, confirmDialog, toast, type AnchorRect } from '@/ui';

export const goalOps = spaceListOps<Goal>((d) => d.goals, 'goals');
export const personaOps = spaceListOps<Persona>((d) => d.personas, 'personas');
export const pillarOps = spaceListOps<Pillar>((d) => d.pillars, 'pillars');
export const tacticOps = spaceListOps<Tactic>((d) => d.tactics, 'tactics');

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isISO(v: string | undefined | null): v is string {
  return !!v && ISO_RE.test(v);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ---------------------------------------------------------------- add */

export function addGoal(patch: Partial<Goal> = {}): string {
  const g = makeGoal({ start: todayISO(), ...patch });
  goalOps.add(g);
  return g.id;
}

export function addPersona(): string {
  const p: Persona = { id: uid('per'), name: 'New persona' };
  personaOps.add(p);
  return p.id;
}

export function addPillar(): string {
  const n = getSpace().pillars.length;
  const p = makePillar('New pillar', n);
  pillarOps.add(p);
  return p.id;
}

export function addTactic(patch: Partial<Tactic> = {}): string {
  const t: Tactic = { id: uid('tac'), title: 'New tactic', status: 'idea', ...patch };
  tacticOps.add(t);
  return t.id;
}

/* ---------------------------------------------------------------- delete (with reference clean-up) */

export async function deleteGoal(g: Goal) {
  const ok = await confirmDialog({ title: 'Delete goal?', message: `“${g.title || 'Untitled goal'}” will be removed. Content linked to it stays.`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  updateSpace((d) => {
    d.goals = d.goals.filter((x) => x.id !== g.id);
    for (const c of d.content) if (c.goalIds?.includes(g.id)) c.goalIds = c.goalIds.filter((id) => id !== g.id);
  });
}

export async function deletePersona(p: Persona) {
  const used = getSpace().content.filter((c) => c.personaId === p.id).length;
  const ok = await confirmDialog({
    title: 'Delete persona?',
    message: `“${p.name || 'Untitled persona'}” will be removed.${used ? ` ${plural(used, 'content piece')} will no longer target it.` : ''}`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  updateSpace((d) => {
    d.personas = d.personas.filter((x) => x.id !== p.id);
    for (const c of d.content) if (c.personaId === p.id) delete c.personaId;
  });
}

export async function deletePillar(p: Pillar) {
  const used = getSpace().content.filter((c) => c.pillarId === p.id).length;
  const ok = await confirmDialog({
    title: 'Delete pillar?',
    message: `“${p.name || 'Untitled pillar'}” will be removed.${used ? ` ${plural(used, 'content piece')} will become unassigned.` : ''}`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  updateSpace((d) => {
    d.pillars = d.pillars.filter((x) => x.id !== p.id);
    for (const c of d.content) if (c.pillarId === p.id) delete c.pillarId;
  });
}

export async function deleteTactic(t: Tactic) {
  const ok = await confirmDialog({ title: 'Delete tactic?', message: `“${t.title || 'Untitled tactic'}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) tacticOps.remove(t.id);
}

/* ---------------------------------------------------------------- goals */

/** Share of the goal's time window that has passed (0..1), or undefined without start + due. */
export function goalElapsed(g: Goal, today = todayISO()): number | undefined {
  if (!isISO(g.start) || !isISO(g.due)) return undefined;
  const total = diffDays(g.start, g.due);
  if (total <= 0) return undefined;
  return Math.max(0, Math.min(1, diffDays(g.start, today) / total));
}

export function goalPace(g: Goal, today = todayISO()): { label: string; tone: 'success' | 'warning' | 'danger' } | undefined {
  if (g.status === 'done') return undefined;
  const p = goalProgress(g);
  const e = goalElapsed(g, today);
  if (p == null || e == null || e <= 0) return undefined;
  if (p >= 1) return { label: 'Target reached', tone: 'success' };
  if (p >= e) return { label: 'Ahead of pace', tone: 'success' };
  if (p >= e - 0.1) return { label: 'Slightly behind', tone: 'warning' };
  return { label: 'Behind pace', tone: 'danger' };
}

/* ---------------------------------------------------------------- money */

export function currencySymbol(code: string | undefined): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: code || 'USD' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

/* ---------------------------------------------------------------- CSV */

function baseName(s: SpaceData, what: string) {
  return safeFileName(`${s.meta.title || 'Space'} - ${what}`);
}

export async function exportGoalsCsv() {
  const s = getSpace();
  const campaigns = new Map(s.campaigns.map((c) => [c.id, c.name]));
  const path = await exportCsv(baseName(s, 'Goals'), s.goals, [
    { header: 'Goal', value: (g) => g.title },
    { header: 'Description', value: (g) => g.description },
    { header: 'Metric', value: (g) => g.metric },
    { header: 'Unit', value: (g) => g.unit },
    { header: 'Baseline', value: (g) => g.baseline },
    { header: 'Current', value: (g) => g.current },
    { header: 'Target', value: (g) => g.target },
    { header: 'Progress %', value: (g) => {
      const p = goalProgress(g);
      return p == null ? '' : Math.round(p * 100);
    } },
    { header: 'Start', value: (g) => g.start },
    { header: 'Due', value: (g) => g.due },
    { header: 'Status', value: (g) => optionLabel(GOAL_STATUSES, g.status) },
    { header: 'Campaign', value: (g) => (g.campaignId ? campaigns.get(g.campaignId) : '') },
    { header: 'Notes', value: (g) => g.notes },
  ]);
  if (path) toast('Goals exported');
}

export async function exportTacticsCsv() {
  const s = getSpace();
  const campaigns = new Map(s.campaigns.map((c) => [c.id, c.name]));
  const channels = new Map(s.channels.map((c) => [c.id, c.name]));
  const path = await exportCsv(baseName(s, 'Tactics'), s.tactics, [
    { header: 'Tactic', value: (t) => t.title },
    { header: 'Description', value: (t) => t.description },
    { header: 'Channels', value: (t) => (t.channelIds ?? []).map((id) => channels.get(id)).filter(Boolean).join(', ') },
    { header: 'Campaign', value: (t) => (t.campaignId ? campaigns.get(t.campaignId) : '') },
    { header: 'Owner', value: (t) => t.owner },
    { header: 'Status', value: (t) => optionLabel(TACTIC_STATUSES, t.status) },
    { header: 'Start', value: (t) => t.start },
    { header: 'End', value: (t) => t.end },
    { header: 'Budget', value: (t) => t.budget },
    { header: 'Notes', value: (t) => t.notes },
  ]);
  if (path) toast('Tactics exported');
}

/* ---------------------------------------------------------------- components */

/** Small colour swatch button that opens a colour picker popover. */
export function ColorButton({ value, onChange, swatches = PILLAR_COLORS, label = 'Colour' }: { value?: string; onChange: (c: string) => void; swatches?: string[]; label?: string }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  return (
    <>
      <button
        type="button"
        className="sp-strategy-colorbtn"
        style={{ background: value || '#7c5cff' }}
        aria-label={label}
        title={label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      />
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="sp-strategy-colorpop">
          <ColorPicker
            value={value}
            swatches={swatches}
            onChange={(c) => {
              if (!c) return;
              onChange(c);
              if (swatches.some((s) => s.toLowerCase() === c.toLowerCase())) setAnchor(null);
            }}
          />
        </div>
      </Popover>
    </>
  );
}

/** Select the text of a freshly created item's title input. */
export function focusSelect(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.focus();
    el.select();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
