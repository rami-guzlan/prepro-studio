/* Wardrobe plot data: scenes × characters with the wardrobe each character wears. Pure (used by screen and print). */
import type { BreakdownElement, Character, ID } from '@/types';
import type { ScriptModel } from '@/script-core/model';
import { sortCharacters } from '@/modules/breakdown/logic';

export interface PlotData {
  chars: Character[];
  unassigned: boolean;
  rows: { sceneId: ID; number: string; heading: string; stripKey: string; scriptDay?: string; cells: Map<string, { present: boolean; items: BreakdownElement[] }> }[];
}

/** Build the plot. `cats` = element categories to include (wardrobe, optionally makeup). */
export function buildPlot(model: ScriptModel, elements: BreakdownElement[], characters: Character[], cats: string[]): PlotData {
  const items = elements.filter((e) => cats.includes(e.category));
  const itemById = new Map(items.map((e) => [e.id, e]));
  const charIds = new Set<ID>();
  for (const s of model.scenes) for (const id of s.characterIds) charIds.add(id);
  for (const e of items) if (e.characterId) charIds.add(e.characterId);
  const chars = sortCharacters(characters.filter((c) => charIds.has(c.id)));
  const known = new Set(chars.map((c) => c.id));
  let unassigned = false;
  const rows = model.scenes
    .map((s) => {
      const cells = new Map<string, { present: boolean; items: BreakdownElement[] }>();
      // voice-only speakers (V.O. / O.S. / filtered) are heard, not seen: no wardrobe needed
      const offscreen = new Set((s.offscreen ?? []).map((n) => n.toUpperCase()));
      for (const c of chars) cells.set(c.id, { present: s.characterIds.includes(c.id) && !offscreen.has(c.name.toUpperCase()), items: [] });
      for (const id of s.elementIds) {
        const e = itemById.get(id);
        if (!e) continue;
        const key = e.characterId && known.has(e.characterId) ? e.characterId : '__none';
        if (key === '__none') unassigned = true;
        const cell = cells.get(key) ?? { present: false, items: [] };
        cell.items.push(e);
        cells.set(key, cell);
      }
      return { sceneId: s.id, number: s.number, heading: s.heading, stripKey: s.stripKey, scriptDay: s.meta?.scriptDay, cells };
    })
    .filter((r) => [...r.cells.values()].some((c) => c.present || c.items.length));
  return { chars, unassigned, rows };
}
