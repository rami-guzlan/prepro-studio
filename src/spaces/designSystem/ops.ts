/* Write operations of the design system. Each call is one undo step (typing
   coalesces per field). Shared by the screens, the importer and the agent tools. */
import type { Draft } from 'immer';
import type { SpaceData } from '@/spaces/types';
import { getSpace, updateSpace } from '@/store/space';
import { uid } from '@/lib/id';
import { dsOf } from './compile';
import { emptyDesignSystem, normalizeDesignSystem, type DesignSystem } from './types';

/** List fields of the design system. */
export type DSListKey = 'themes' | 'semanticTokens' | 'typeStyles' | 'tokens' | 'components' | 'layouts' | 'treatments' | 'rules' | 'references' | 'formats' | 'briefs' | 'sources';
type ItemOf<K extends DSListKey> = DesignSystem[K][number];

const PREFIX: Record<DSListKey, string> = { themes: 'dsth', semanticTokens: 'dsst', typeStyles: 'dsty', tokens: 'dstk', components: 'dscm', layouts: 'dsly', treatments: 'dstr', rules: 'dsr', references: 'dsrf', formats: 'dsf', briefs: 'dsb', sources: 'dss' };

export const dsNewId = (key: DSListKey) => uid(PREFIX[key]);

/** The live design system (event handlers, agent tools). */
export function getDS(): DesignSystem {
  return dsOf(getSpace());
}

/** Change the design system in one undo step. */
export function dsUpdate(recipe: (ds: Draft<DesignSystem>, d: Draft<SpaceData>) => void, opts?: { coalesce?: string }) {
  updateSpace((d) => {
    if (!d.designSystem) d.designSystem = emptyDesignSystem() as Draft<DesignSystem>;
    else if (!Array.isArray(d.designSystem.rules)) d.designSystem = normalizeDesignSystem(d.designSystem) as Draft<DesignSystem>;
    recipe(d.designSystem as Draft<DesignSystem>, d);
    d.designSystem.updatedAt = new Date().toISOString();
  }, opts);
}

/** Set top-level fields (name, summary, version, agentNotes) or nested objects with a path, e.g. 'artDirection.imagery.subjects'. */
export function dsSet(path: string, value: unknown, coalesce = true) {
  dsUpdate(
    (ds) => {
      const parts = path.split('.');
      let o: any = ds;
      for (const p of parts.slice(0, -1)) o = o[p] ??= {};
      const k = parts[parts.length - 1];
      if (value === undefined || value === '') delete o[k];
      else o[k] = value;
    },
    coalesce ? { coalesce: `ds:${path}` } : undefined,
  );
}

export function dsAdd<K extends DSListKey>(key: K, item: Partial<ItemOf<K>>, index?: number): string {
  const full = { id: dsNewId(key), ...item } as ItemOf<K>;
  dsUpdate((ds) => {
    const list = ds[key] as unknown as ItemOf<K>[];
    if (index == null || index < 0 || index > list.length) list.push(full);
    else list.splice(index, 0, full);
  });
  return (full as { id: string }).id;
}

export function dsPatch<K extends DSListKey>(key: K, id: string, patch: Partial<ItemOf<K>>, coalesce = true) {
  dsUpdate(
    (ds) => {
      const it = (ds[key] as unknown as ItemOf<K>[]).find((x) => (x as { id: string }).id === id) as any;
      if (!it) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete it[k];
        else it[k] = v;
      }
    },
    coalesce ? { coalesce: `ds:${key}:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function dsMove(key: DSListKey, from: number, to: number) {
  dsUpdate((ds) => {
    const list = ds[key] as unknown as unknown[];
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
  });
}

/** Remove items and clean every reference to them. */
export function dsRemove(key: DSListKey, ids: string[]) {
  const set = new Set(ids);
  if (!set.size) return;
  dsUpdate((ds) => {
    const list = ds[key] as unknown as { id: string }[];
    for (let i = list.length - 1; i >= 0; i--) if (set.has(list[i].id)) list.splice(i, 1);
    if (key === 'rules') for (const b of ds.briefs) b.ruleIds = b.ruleIds.filter((x) => !set.has(x));
    if (key === 'references') for (const b of ds.briefs) b.referenceIds = b.referenceIds.filter((x) => !set.has(x));
    if (key === 'formats') {
      for (const b of ds.briefs) if (b.formatId && set.has(b.formatId)) delete b.formatId;
      for (const l of ds.layouts) if (l.formatId && set.has(l.formatId)) delete l.formatId;
    }
    if (key === 'themes') for (const t of ds.semanticTokens) for (const id of set) delete t.values[id];
  });
}

/** A brand asset was deleted: drop design-system links to it (call inside the same update). */
export function dsForgetAssets(d: Draft<SpaceData>, assetIds: Set<string>) {
  const ds = d.designSystem;
  if (!ds) return;
  for (const r of ds.references ?? []) if (r.assetId && assetIds.has(r.assetId)) delete r.assetId;
  for (const c of ds.components ?? []) if (c.previewAssetId && assetIds.has(c.previewAssetId)) delete c.previewAssetId;
  for (const l of ds.layouts ?? []) if (l.previewAssetId && assetIds.has(l.previewAssetId)) delete l.previewAssetId;
  for (const t of ds.treatments ?? []) if (t.exampleAssetId && assetIds.has(t.exampleAssetId)) delete t.exampleAssetId;
}
