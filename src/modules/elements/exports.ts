/* CSV export of all breakdown elements. */
import type { BreakdownElement, ProjectData } from '@/types';
import { getScriptModel } from '@/derived/script';
import { exportCsv } from '@/backend';
import { CATEGORY_BY_ID, ELEMENT_STATUSES, optionLabel } from '@/lib/constants';
import { naturalCompare, safeFileName } from '@/lib/text';
import { toast } from '@/ui';
import { ELEMENT_SOURCES, scenesByElement, taggedCounts } from '@/modules/breakdown/logic';
import { categoryIndex } from './groups';

export async function exportElementsCsv(p: ProjectData, only?: BreakdownElement[]) {
  const model = getScriptModel(p);
  const scenes = scenesByElement(model);
  const tagged = taggedCounts(model);
  const chars = new Map(p.characters.map((c) => [c.id, c]));
  const rows = [...(only ?? p.elements)].sort((a, b) => categoryIndex(a.category) - categoryIndex(b.category) || naturalCompare(a.name, b.name));
  try {
    const path = await exportCsv(safeFileName(`${p.meta.title} - Elements`), rows, [
      { header: 'Category', value: (e) => CATEGORY_BY_ID[e.category]?.label ?? e.category },
      { header: 'Name', value: (e) => e.name },
      { header: 'Description', value: (e) => e.description },
      { header: 'Qty', value: (e) => e.quantity },
      { header: 'Status', value: (e) => optionLabel(ELEMENT_STATUSES, e.status) },
      { header: 'Source', value: (e) => ELEMENT_SOURCES.find((s) => s.value === e.source)?.label ?? '' },
      { header: 'Cost', value: (e) => e.cost },
      { header: 'Vendor', value: (e) => e.vendor },
      { header: 'Owner / Dept', value: (e) => e.owner },
      { header: 'Character', value: (e) => (e.characterId ? chars.get(e.characterId)?.name ?? '' : '') },
      { header: 'Scenes', value: (e) => (scenes.get(e.id) ?? []).map((s) => s.number).join(', ') },
      { header: 'Scene count', value: (e) => (scenes.get(e.id) ?? []).length },
      { header: 'Tagged in script', value: (e) => (tagged.get(e.id) ?? 0) > 0 },
      { header: 'Notes', value: (e) => e.notes },
    ]);
    if (path) toast(`Exported ${rows.length} elements`);
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
