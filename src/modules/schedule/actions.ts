/* Store mutations of the Shooting Schedule (all undoable through update()). */
import type { Draft } from 'immer';
import type { ID, ProjectData, ShootDay, StripItem } from '@/types';
import { getProject, update } from '@/store/project';
import { getScriptModel } from '@/derived/script';
import { uid } from '@/lib/id';
import { plural } from '@/lib/text';
import { confirmDialog, toast } from '@/ui';
import { BONEYARD, boneyardScenes, computeDays, insertInScriptOrder, sortDayItems, type BannerItem } from './logic';

type D = Draft<ProjectData>;

function model() {
  return getScriptModel(getProject());
}

/** Remove a scene from whatever day it is on (draft). Returns true if it was scheduled. */
function unscheduleDraft(d: D, sceneId: ID): boolean {
  let found = false;
  for (const day of d.schedule.days) {
    const i = day.items.findIndex((it) => it.type === 'scene' && it.sceneId === sceneId);
    if (i >= 0) {
      day.items.splice(i, 1);
      found = true;
    }
  }
  return found;
}

function returnToBoneyardDraft(d: D, sceneIds: ID[]) {
  if (!d.schedule.boneyardOrder) return; // pure script order: nothing to maintain
  const m = model();
  let order = [...d.schedule.boneyardOrder];
  for (const id of sceneIds) order = insertInScriptOrder(order, id, m);
  d.schedule.boneyardOrder = order;
}

export function newDay(): ShootDay {
  return { id: uid('day'), items: [] };
}

/** Add a shoot day (at the end, or after `afterIndex`). Returns its id. */
export function addDay(afterIndex?: number): ID {
  const day = newDay();
  update((d) => {
    const days = d.schedule.days;
    if (afterIndex == null || afterIndex >= days.length - 1) days.push(day);
    else days.splice(Math.max(0, afterIndex + 1), 0, day);
  });
  return day.id;
}

/** Move a scene onto a day ('new' creates a day) or back to the boneyard. */
export function moveSceneTo(sceneId: ID, target: ID | typeof BONEYARD | 'new', position: 'start' | 'end' = 'end') {
  let label = '';
  update((d) => {
    const existing = d.schedule.days.flatMap((x) => x.items).find((it) => it.type === 'scene' && it.sceneId === sceneId);
    unscheduleDraft(d, sceneId);
    if (target === BONEYARD) {
      returnToBoneyardDraft(d, [sceneId]);
      label = 'the boneyard';
      return;
    }
    let day = target === 'new' ? undefined : d.schedule.days.find((x) => x.id === target);
    if (!day) {
      d.schedule.days.push(newDay());
      day = d.schedule.days[d.schedule.days.length - 1];
    }
    const item: StripItem = existing ? { ...existing } : { id: uid('st'), type: 'scene', sceneId };
    if (position === 'start') day.items.unshift(item);
    else day.items.push(item);
    if (d.schedule.boneyardOrder) d.schedule.boneyardOrder = d.schedule.boneyardOrder.filter((x) => x !== sceneId);
    label = `Day ${d.schedule.days.indexOf(day) + 1}`;
  });
  const s = model().sceneById.get(sceneId);
  if (s && label) toast(`Scene ${s.number} moved to ${label}`, 'info');
}

/** Move a strip item one step up/down inside its day. */
export function nudgeItem(dayId: ID, itemId: ID, delta: -1 | 1) {
  update((d) => {
    const day = d.schedule.days.find((x) => x.id === dayId);
    if (!day) return;
    const i = day.items.findIndex((it) => it.id === itemId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= day.items.length) return;
    const [it] = day.items.splice(i, 1);
    day.items.splice(j, 0, it);
  });
}

export function moveItemToEdge(dayId: ID, itemId: ID, edge: 'start' | 'end') {
  update((d) => {
    const day = d.schedule.days.find((x) => x.id === dayId);
    if (!day) return;
    const i = day.items.findIndex((it) => it.id === itemId);
    if (i < 0) return;
    const [it] = day.items.splice(i, 1);
    if (edge === 'start') day.items.unshift(it);
    else day.items.push(it);
  });
}

export function moveDay(dayId: ID, delta: -1 | 1) {
  update((d) => {
    const days = d.schedule.days;
    const i = days.findIndex((x) => x.id === dayId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= days.length) return;
    const [day] = days.splice(i, 1);
    days.splice(j, 0, day);
  });
}

export function setDayField(dayId: ID, patch: Partial<Pick<ShootDay, 'date' | 'label' | 'notes'>>, coalesce?: string) {
  update(
    (d) => {
      const day = d.schedule.days.find((x) => x.id === dayId);
      if (!day) return;
      for (const [k, v] of Object.entries(patch) as [keyof typeof patch, string | undefined][]) {
        if (v == null || v === '') delete day[k];
        else day[k] = v;
      }
    },
    coalesce ? { coalesce: `schedule:${dayId}:${coalesce}` } : undefined,
  );
}

export async function deleteDay(dayId: ID) {
  const p = getProject();
  const idx = p.schedule.days.findIndex((x) => x.id === dayId);
  if (idx < 0) return;
  const day = p.schedule.days[idx];
  const scenes = day.items.filter((it) => it.type === 'scene').length;
  const hasSheet = !!p.callSheets?.[dayId];
  const ok = await confirmDialog({
    title: `Delete Day ${idx + 1}?`,
    message: `${scenes ? `${plural(scenes, 'scene')} will go back to the boneyard.` : 'This day has no scenes.'}${hasSheet ? '\nIts call sheet will be deleted too.' : ''}`,
    confirmLabel: 'Delete day',
    danger: true,
  });
  if (!ok) return;
  update((d) => {
    const i = d.schedule.days.findIndex((x) => x.id === dayId);
    if (i < 0) return;
    const [removed] = d.schedule.days.splice(i, 1);
    returnToBoneyardDraft(
      d,
      removed.items.filter((it) => it.type === 'scene').map((it) => (it as { sceneId: ID }).sceneId),
    );
    if (d.callSheets) delete d.callSheets[dayId];
  });
  toast(`Day ${idx + 1} deleted`, 'info');
}

export function insertBanner(dayId: ID, preset: { text: string; color: string }, index?: number): ID {
  const item: BannerItem = { id: uid('st'), type: 'banner', text: preset.text, color: preset.color };
  update((d) => {
    const day = d.schedule.days.find((x) => x.id === dayId);
    if (!day) return;
    if (index == null || index >= day.items.length) day.items.push(item);
    else day.items.splice(Math.max(0, index), 0, item);
  });
  return item.id;
}

export function updateBanner(dayId: ID, itemId: ID, patch: { text?: string; color?: string }) {
  update(
    (d) => {
      const it = d.schedule.days.find((x) => x.id === dayId)?.items.find((x) => x.id === itemId);
      if (it && it.type === 'banner') Object.assign(it, patch);
    },
    { coalesce: `banner:${itemId}:${Object.keys(patch).join(',')}` },
  );
}

export function removeItem(dayId: ID, itemId: ID) {
  update((d) => {
    const day = d.schedule.days.find((x) => x.id === dayId);
    if (!day) return;
    const i = day.items.findIndex((x) => x.id === itemId);
    if (i < 0) return;
    const [it] = day.items.splice(i, 1);
    if (it.type === 'scene') returnToBoneyardDraft(d, [it.sceneId]);
  });
}

export function sortDay(dayId: ID, by: 'location' | 'script') {
  const p = getProject();
  const m = model();
  update((d) => {
    const day = d.schedule.days.find((x) => x.id === dayId);
    if (!day) return;
    const src = p.schedule.days.find((x) => x.id === dayId)?.items ?? [];
    day.items = sortDayItems(src, by, p, m).map((it) => ({ ...it }));
  });
}

export function setEstMinutes(sceneId: ID, minutes: number | undefined) {
  update(
    (d) => {
      const meta = (d.scenes[sceneId] ??= { id: sceneId });
      if (minutes == null || isNaN(minutes) || minutes <= 0) delete meta.estMinutes;
      else meta.estMinutes = Math.round(minutes);
    },
    { coalesce: `scene:${sceneId}:estMinutes` },
  );
}

/** Put every unscheduled scene on one new shoot day. */
export function scheduleAllUnscheduled() {
  const p = getProject();
  const scenes = boneyardScenes(p.schedule, model());
  if (!scenes.length) {
    toast('Every scene is already scheduled.', 'info');
    return;
  }
  const day: ShootDay = { id: uid('day'), items: scenes.map((s) => ({ id: uid('st'), type: 'scene' as const, sceneId: s.id })) };
  update((d) => {
    d.schedule.days.push(day);
    delete d.schedule.boneyardOrder;
  });
  toast(`${plural(scenes.length, 'scene')} scheduled on Day ${p.schedule.days.length + 1}`);
}

export async function clearSchedule() {
  const p = getProject();
  const count = p.schedule.days.reduce((n, d) => n + d.items.filter((it) => it.type === 'scene').length, 0);
  if (!count) {
    toast('No scenes are scheduled.', 'info');
    return;
  }
  const ok = await confirmDialog({
    title: 'Clear the schedule?',
    message: `All ${plural(count, 'scheduled scene')} go back to the boneyard. Shoot days, dates, notes and banners are kept.`,
    confirmLabel: 'Clear schedule',
    danger: true,
  });
  if (!ok) return;
  update((d) => {
    for (const day of d.schedule.days) day.items = day.items.filter((it) => it.type !== 'scene');
    delete d.schedule.boneyardOrder;
  });
  toast('Schedule cleared — all scenes are in the boneyard', 'info');
}

export async function deleteAllDays() {
  const p = getProject();
  if (!p.schedule.days.length) return;
  const ok = await confirmDialog({
    title: `Delete all ${plural(p.schedule.days.length, 'shoot day')}?`,
    message: 'Every scene goes back to the boneyard and all call sheets are deleted. You can undo this with Ctrl+Z.',
    confirmLabel: 'Delete all days',
    danger: true,
  });
  if (!ok) return;
  update((d) => {
    d.schedule.days = [];
    delete d.schedule.boneyardOrder;
    d.callSheets = {};
  });
  toast('All shoot days deleted', 'info');
}

export async function clearFixedDates() {
  const ok = await confirmDialog({
    title: 'Use automatic dates for every day?',
    message: 'Fixed dates are removed; days then follow the schedule start date (skipping weekends if enabled).',
    confirmLabel: 'Use automatic dates',
  });
  if (!ok) return;
  update((d) => {
    for (const day of d.schedule.days) delete day.date;
  });
}

/** Copy the first/last shoot dates into the project info (meta.shootStart / shootEnd). */
export function syncProjectShootDates() {
  const p = getProject();
  const rows = computeDays(p, model()).filter((r) => r.date);
  if (!rows.length) {
    toast('Shoot days have no dates yet — set a start date first.', 'error');
    return;
  }
  const dates = rows.map((r) => r.date!).sort();
  update((d) => {
    d.meta.shootStart = dates[0];
    d.meta.shootEnd = dates[dates.length - 1];
  });
  toast('Project shoot dates updated');
}

/** Commit a drag & drop arrangement: container id -> drag ids ('by:<sceneId>' for boneyard scenes). */
export function commitArrangement(containers: Record<string, string[]>) {
  const p = getProject();
  const known = new Map<string, StripItem>();
  for (const day of p.schedule.days) for (const it of day.items) known.set(it.id, it);
  const sceneOf = (dragId: string): ID | undefined => {
    if (dragId.startsWith('by:')) return dragId.slice(3);
    const it = known.get(dragId);
    return it?.type === 'scene' ? it.sceneId : undefined;
  };
  update((d) => {
    for (const day of d.schedule.days) {
      const ids = containers[day.id];
      if (!ids) continue;
      const same = ids.length === day.items.length && ids.every((id, i) => day.items[i].id === id);
      if (same) continue;
      const next: StripItem[] = [];
      for (const id of ids) {
        const it = known.get(id);
        if (it) next.push({ ...it });
        else {
          const sid = sceneOf(id);
          if (sid) next.push({ id: uid('st'), type: 'scene', sceneId: sid });
        }
      }
      day.items = next;
    }
    const bone = containers[BONEYARD];
    if (bone) {
      const order = bone.map(sceneOf).filter((x): x is ID => !!x);
      const current = boneyardScenes(p.schedule, getScriptModel(p)).map((s) => s.id);
      const changed = order.length !== current.length || order.some((id, i) => current[i] !== id);
      if (changed) d.schedule.boneyardOrder = order;
    }
  });
}

export function resetBoneyardOrder() {
  update((d) => {
    delete d.schedule.boneyardOrder;
  });
}
