/* CSV exports of the breakdown (uses the current project snapshot). */
import type { ProjectData } from '@/types';
import type { SceneInfo } from '@/script-core/model';
import { getScriptModel } from '@/derived/script';
import { locationForScene } from '@/derived/project';
import { exportCsv } from '@/backend';
import { formatEighths } from '@/lib/format';
import type { CsvColumn } from '@/lib/csv';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui';
import { ELEMENT_CATEGORIES, characterMap, elementMap, elementsByCategory, intExtLabel, sceneCharacters, sceneElements, type ElCategory } from './logic';

async function save<T>(p: ProjectData, name: string, rows: T[], cols: CsvColumn<T>[]) {
  try {
    const path = await exportCsv(safeFileName(`${p.meta.title} - ${name}`), rows, cols);
    if (path) toast(`Exported ${name}`);
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

export function exportBreakdownCsv(p: ProjectData) {
  const model = getScriptModel(p);
  const elById = elementMap(p.elements);
  const charById = characterMap(p.characters);
  const rows = model.scenes;
  const catCols = ELEMENT_CATEGORIES.map((c) => ({
    header: c.label,
    value: (s: SceneInfo) => {
      const g = elementsByCategory(sceneElements(s, elById));
      return (g.get(c.id as ElCategory) ?? []).map((e) => ((e.quantity ?? 1) > 1 ? `${e.name} (x${e.quantity})` : e.name)).join('; ');
    },
  }));
  return save(p, 'Breakdown', rows, [
    { header: 'Scene', value: (s) => s.number },
    { header: 'Heading', value: (s) => s.heading },
    { header: 'Int/Ext', value: (s) => intExtLabel(s.intExt) },
    { header: 'Day/Night', value: (s) => s.dayNight },
    { header: 'Set', value: (s) => s.set },
    { header: 'Location', value: (s) => locationForScene(p, s)?.name ?? '' },
    { header: 'Pages', value: (s) => formatEighths(s.eighths) },
    { header: 'Script page', value: (s) => s.page },
    { header: 'Script day', value: (s) => s.meta?.scriptDay ?? '' },
    { header: 'Est. minutes', value: (s) => s.meta?.estMinutes ?? '' },
    { header: 'Synopsis', value: (s) => s.synopsis },
    { header: 'Cast', value: (s) => sceneCharacters(s, charById).map((c) => (c.number != null ? `${c.number}. ${c.name}` : c.name)).join('; ') },
    { header: 'Extras (description)', value: (s) => s.meta?.extras ?? '' },
    ...catCols,
    { header: 'Notes', value: (s) => s.meta?.notes ?? '' },
  ]);
}

export function exportSceneListCsv(p: ProjectData) {
  const model = getScriptModel(p);
  const charById = characterMap(p.characters);
  return save(p, 'Scene list', model.scenes, [
    { header: 'Scene', value: (s) => s.number },
    { header: 'Heading', value: (s) => s.heading },
    { header: 'Int/Ext', value: (s) => intExtLabel(s.intExt) },
    { header: 'Day/Night', value: (s) => s.dayNight },
    { header: 'Pages', value: (s) => formatEighths(s.eighths) },
    { header: 'Eighths', value: (s) => s.eighths },
    { header: 'Script page', value: (s) => s.page },
    { header: 'Script day', value: (s) => s.meta?.scriptDay ?? '' },
    { header: 'Cast IDs', value: (s) => sceneCharacters(s, charById).map((c) => c.number ?? c.name).join(', ') },
    { header: 'Location', value: (s) => locationForScene(p, s)?.name ?? '' },
    { header: 'Est. minutes', value: (s) => s.meta?.estMinutes ?? '' },
    { header: 'Synopsis', value: (s) => s.synopsis },
  ]);
}
