/* Store mutations for lighting diagrams. Every function is one update()
   = one undo step (or coalesced for typing / nudging). */
import type { Draft } from 'immer';
import type { DiagramItem, GearItem, LightingDiagram, ProjectData } from '@/types';
import { update, getProject, type UpdateOptions } from '@/store/project';
import { uid } from '@/lib/id';
import { fixtureName, insertIndex, isOrderable, lightRows } from './model';

type DDraft = Draft<LightingDiagram>;

export function mutateDiagram(id: string, fn: (d: DDraft, p: Draft<ProjectData>) => void, opts?: UpdateOptions) {
  update((p) => {
    const d = p.diagrams.find((x) => x.id === id);
    if (!d) return;
    if (!Array.isArray(d.items)) d.items = [];
    fn(d, p);
    d.updatedAt = new Date().toISOString();
  }, opts);
}

/** Patch the diagram's own fields. */
export function patchDiagram(id: string, patch: Partial<LightingDiagram>, coalesce?: string) {
  mutateDiagram(id, (d) => Object.assign(d, patch), coalesce ? { coalesce: `light:${id}:${coalesce}` } : undefined);
}

function findItem(d: DDraft, itemId: string) {
  return d.items.find((i) => i.id === itemId);
}

/** Patch one item; props are merged (undefined values delete a prop). */
export function patchItem(dId: string, itemId: string, patch: Partial<DiagramItem>, coalesce?: string) {
  mutateDiagram(
    dId,
    (d) => {
      const it = findItem(d, itemId);
      if (!it) return;
      const { props, ...rest } = patch;
      Object.assign(it, rest);
      for (const [k, v] of Object.entries(rest)) if (v === undefined) delete (it as any)[k];
      if (props) {
        const next: Record<string, unknown> = { ...(it.props ?? {}) };
        for (const [k, v] of Object.entries(props)) {
          if (v === undefined || v === '') delete next[k];
          else next[k] = v;
        }
        it.props = next;
      }
    },
    coalesce ? { coalesce: `light:${dId}:${itemId}:${coalesce}` } : undefined,
  );
}

export function patchProps(dId: string, itemId: string, props: Record<string, unknown>, coalesce?: string) {
  patchItem(dId, itemId, { props }, coalesce ?? Object.keys(props).join(','));
}

/** Apply full-item patches (e.g. the result of a drag) in one undo step. */
export function patchItems(dId: string, patches: Record<string, Partial<DiagramItem>>, opts?: UpdateOptions) {
  mutateDiagram(
    dId,
    (d) => {
      for (const it of d.items) {
        const p = patches[it.id];
        if (!p) continue;
        const { props, ...rest } = p;
        Object.assign(it, rest);
        if (props) it.props = { ...(it.props ?? {}), ...props };
      }
    },
    opts,
  );
}

export function addItems(dId: string, items: DiagramItem[]) {
  if (!items.length) return;
  mutateDiagram(dId, (d) => {
    for (const it of items) d.items.splice(insertIndex(d.items as DiagramItem[], it.kind), 0, it as Draft<DiagramItem>);
  });
}

export function removeItems(dId: string, ids: string[]) {
  const set = new Set(ids);
  mutateDiagram(dId, (d) => {
    d.items = d.items.filter((i) => !set.has(i.id));
  });
}

export type ZOrder = 'front' | 'back' | 'forward' | 'backward';

export function reorderItems(dId: string, ids: string[], mode: ZOrder) {
  const set = new Set(ids);
  mutateDiagram(dId, (d) => {
    const a = d.items;
    if (mode === 'front') d.items = [...a.filter((i) => !set.has(i.id)), ...a.filter((i) => set.has(i.id))];
    else if (mode === 'back') d.items = [...a.filter((i) => set.has(i.id)), ...a.filter((i) => !set.has(i.id))];
    else if (mode === 'forward') {
      for (let i = a.length - 2; i >= 0; i--) {
        if (set.has(a[i].id) && !set.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]];
      }
    } else {
      for (let i = 1; i < a.length; i++) {
        if (set.has(a[i].id) && !set.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]];
      }
    }
  });
}

/** Renumber lights 1..n in their current number order (closes gaps). */
export function renumberLights(dId: string, byPosition = false) {
  const d = getProject().diagrams.find((x) => x.id === dId);
  if (!d) return;
  const rows = lightRows(d, true);
  const order = byPosition ? [...rows].sort((a, b) => a.item.x - b.item.x || a.item.y - b.item.y) : rows;
  const map = new Map(order.map((r, i) => [r.item.id, i + 1]));
  mutateDiagram(dId, (dd) => {
    for (const it of dd.items) {
      const n = map.get(it.id);
      if (n != null) it.props = { ...(it.props ?? {}), n };
    }
  });
}

/* ---------------------------------------------------------------- diagrams */

export function addDiagram(d: LightingDiagram) {
  update((p) => {
    p.diagrams.push(d as Draft<LightingDiagram>);
  });
}

export function duplicateDiagram(id: string): LightingDiagram | null {
  const src = getProject().diagrams.find((x) => x.id === id);
  if (!src) return null;
  const copy: LightingDiagram = JSON.parse(JSON.stringify(src));
  copy.id = uid('dgm');
  copy.name = `${src.name || 'Diagram'} (copy)`;
  copy.items = (copy.items ?? []).map((i) => ({ ...i, id: uid('li') }));
  copy.updatedAt = new Date().toISOString();
  update((p) => {
    const i = p.diagrams.findIndex((x) => x.id === id);
    p.diagrams.splice(i + 1, 0, copy as Draft<LightingDiagram>);
  });
  return copy;
}

export function deleteDiagram(id: string) {
  update((p) => {
    p.diagrams = p.diagrams.filter((d) => d.id !== id);
    for (const s of p.shots) if (s.diagramId === id) delete s.diagramId;
  });
}

export function moveDiagram(id: string, beforeId: string | null) {
  update((p) => {
    const i = p.diagrams.findIndex((d) => d.id === id);
    if (i < 0) return;
    const [d] = p.diagrams.splice(i, 1);
    const j = beforeId ? p.diagrams.findIndex((x) => x.id === beforeId) : -1;
    if (j < 0) p.diagrams.push(d);
    else p.diagrams.splice(j, 0, d);
  });
}

/** Link shots both ways: diagram.shotIds and shot.diagramId stay in sync. */
export function setDiagramShots(dId: string, shotIds: string[]) {
  const set = new Set(shotIds);
  mutateDiagram(dId, (d, p) => {
    d.shotIds = [...shotIds];
    for (const s of p.shots) {
      if (set.has(s.id)) s.diagramId = dId;
      else if (s.diagramId === dId) delete s.diagramId;
    }
  });
}

/* ---------------------------------------------------------------- gear */

export interface GearResult {
  added: { name: string; qty: number }[];
  skipped: string[];
}

/** Add the diagram's lights to the Gear list (category Lighting), merging identical fixtures into qty. */
export function addLightsToGear(dId: string): GearResult {
  const p = getProject();
  const d = p.diagrams.find((x) => x.id === dId);
  const res: GearResult = { added: [], skipped: [] };
  if (!d) return res;
  const groups = new Map<string, { name: string; qty: number; nums: number[]; watts?: number }>();
  for (const r of lightRows(d)) {
    if (!isOrderable(r)) continue;
    const name = fixtureName(r);
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { name, qty: 0, nums: [] };
    g.qty++;
    g.nums.push(r.n);
    groups.set(key, g);
  }
  const existing = new Set(p.gear.filter((g) => g.fromDiagram).map((g) => g.name.trim().toLowerCase()));
  const items: GearItem[] = [];
  for (const [key, g] of groups) {
    if (existing.has(key)) {
      res.skipped.push(g.name);
      continue;
    }
    items.push({
      id: uid('gear'),
      category: 'Lighting',
      name: g.name,
      qty: g.qty,
      source: 'rental',
      status: 'needed',
      fromDiagram: true,
      notes: `From lighting diagram “${d.name}” (${g.nums.map((n) => `L${n}`).join(', ')})`,
    });
    res.added.push({ name: g.name, qty: g.qty });
  }
  if (items.length) {
    update((pp) => {
      pp.gear.push(...(items as Draft<GearItem>[]));
    });
  }
  return res;
}
