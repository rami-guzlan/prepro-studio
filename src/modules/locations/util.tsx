/* Small helpers & components for the Locations module. */
import { Mail, Phone } from 'lucide-react';
import { backend, exportCsv } from '@/backend';
import type { CsvColumn } from '@/lib/csv';
import { safeFileName } from '@/lib/text';
import { IconButton, Input, toast } from '@/ui';

export function openExternal(url: string) {
  if (backend.openExternal) backend.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+*#,;]/g, '')}`;
}

/** Text input with a trailing call / email button. */
export function LinkInput({ kind, value, onChange, placeholder }: { kind: 'tel' | 'email'; value?: string; onChange: (v: string) => void; placeholder?: string }) {
  const v = value?.trim() ?? '';
  return (
    <div className="loc-linkinput">
      <Input type={kind} value={value} placeholder={placeholder} onChange={onChange} />
      <IconButton
        icon={kind === 'tel' ? Phone : Mail}
        label={kind === 'tel' ? 'Call' : 'Send email'}
        size="sm"
        disabled={!v}
        onClick={() => openExternal(kind === 'tel' ? telUrl(v) : `mailto:${v}`)}
      />
    </div>
  );
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .ProseMirror');
}

export async function saveCsv<T>(projectTitle: string, docName: string, rows: T[], cols: CsvColumn<T>[]) {
  if (!rows.length) {
    toast(`No ${docName.toLowerCase()} to export yet`, 'info');
    return;
  }
  try {
    const path = await exportCsv(safeFileName(`${projectTitle || 'Project'} - ${docName}`), rows, cols);
    if (path) toast(`Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind === 'web') toast(`${docName} CSV downloaded`);
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

export function currencySymbol(currency: string | undefined): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? '$'
    );
  } catch {
    return '$';
  }
}

/** Minimum table width so fixed-layout DataTables keep their column widths (and scroll horizontally when narrow). */
export function tableMinWidth(cols: { width?: number | string; minWidth?: number; hidden?: boolean }[], extra = 0): number {
  return cols.filter((c) => !c.hidden).reduce((a, c) => a + (typeof c.width === 'number' ? c.width : c.minWidth ?? 160), 0) + extra;
}
