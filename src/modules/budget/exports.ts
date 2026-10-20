/* CSV export of every budget line. */
import type { BudgetCategory, BudgetLine } from '@/types';
import { getProject } from '@/store/project';
import { exportCsv } from '@/backend';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui';
import { SECTIONS, lineTotal } from './calc';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function exportBudgetCsv() {
  const p = getProject();
  const rows: { cat: BudgetCategory; line: BudgetLine }[] = [];
  for (const sec of SECTIONS) for (const cat of p.budget.categories.filter((c) => c.section === sec.id)) for (const line of cat.lines) rows.push({ cat, line });
  try {
    const path = await exportCsv(safeFileName(`${p.meta.title} - Budget`), rows, [
      { header: 'Section', value: (r) => SECTIONS.find((s) => s.id === r.cat.section)?.label ?? r.cat.section },
      { header: 'Acct #', value: (r) => r.cat.code },
      { header: 'Account', value: (r) => r.cat.name },
      { header: 'Description', value: (r) => r.line.description },
      { header: 'Qty', value: (r) => r.line.qty },
      { header: 'Unit', value: (r) => r.line.unit },
      { header: 'Rate', value: (r) => r.line.rate },
      { header: 'X', value: (r) => r.line.x ?? 1 },
      { header: 'Fringe %', value: (r) => r.line.fringePct ?? '' },
      { header: 'Total', value: (r) => r2(lineTotal(r.line)) },
      { header: 'Actual', value: (r) => r.line.actual ?? '' },
      { header: 'Variance', value: (r) => (r.line.actual != null ? r2(lineTotal(r.line) - r.line.actual) : '') },
      { header: 'Notes', value: (r) => r.line.notes },
    ]);
    if (path) toast(`Exported ${rows.length} budget lines`);
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
