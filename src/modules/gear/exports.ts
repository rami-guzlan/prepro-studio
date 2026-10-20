/* CSV export of the gear list. */
import { getProject } from '@/store/project';
import { exportCsv } from '@/backend';
import { GEAR_STATUSES } from '@/lib/constants';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui';
import { GEAR_SOURCES, effectiveDays, lineTotal, shootDayCount, sortByCategory } from './logic';

export async function exportGearCsv() {
  const p = getProject();
  const days = shootDayCount(p);
  const crew = new Map(p.crew.map((c) => [c.id, c]));
  const rows = sortByCategory(p.gear);
  try {
    const path = await exportCsv(safeFileName(`${p.meta.title} - Gear`), rows, [
      { header: 'Category', value: (g) => g.category },
      { header: 'Item', value: (g) => g.name },
      { header: 'Qty', value: (g) => g.qty },
      { header: 'Source', value: (g) => GEAR_SOURCES.find((s) => s.value === g.source)?.label ?? g.source },
      { header: 'Vendor', value: (g) => g.vendor },
      { header: 'Day rate', value: (g) => g.dayRate },
      { header: 'Days', value: (g) => (g.dayRate ? effectiveDays(g, days) : g.days) },
      { header: 'Flat cost', value: (g) => g.flatCost },
      { header: 'Line total', value: (g) => Math.round(lineTotal(g, days) * 100) / 100 },
      { header: 'Status', value: (g) => GEAR_STATUSES.find((s) => s.value === g.status)?.label ?? g.status },
      { header: 'Assigned to', value: (g) => (g.assignedTo ? crew.get(g.assignedTo)?.name ?? '' : '') },
      { header: 'Serial', value: (g) => g.serial },
      { header: 'Packed', value: (g) => !!g.checked },
      { header: 'From lighting diagram', value: (g) => !!g.fromDiagram },
      { header: 'Notes', value: (g) => g.notes },
    ]);
    if (path) toast(`Exported ${rows.length} gear items`);
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
