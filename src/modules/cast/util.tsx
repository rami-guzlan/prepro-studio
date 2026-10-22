/* Shared helpers & small components for the Cast & Characters module. */
import { useState } from 'react';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import { backend, exportCsv } from '@/backend';
import type { CsvColumn } from '@/lib/csv';
import { safeFileName } from '@/lib/text';
import { ColorPicker, IconButton, Input, Popover, toast, type AnchorRect } from '@/ui';

export * from './data';

/* ------------------------------------------------------------------ external links */

export function openExternal(url: string) {
  if (backend.openExternal) backend.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+*#,;]/g, '')}`;
}

export function mailUrl(email: string): string {
  return `mailto:${email.trim()}`;
}

export function webUrl(site: string): string {
  const s = site.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

/** Text input with a trailing action button (call / email / open). */
export function LinkInput({ kind, value, onChange, placeholder, size }: { kind: 'tel' | 'email' | 'url'; value?: string; onChange: (v: string) => void; placeholder?: string; size?: 'sm' | 'md' }) {
  const v = value?.trim() ?? '';
  const Icon = kind === 'tel' ? Phone : kind === 'email' ? Mail : ExternalLink;
  const label = kind === 'tel' ? 'Call' : kind === 'email' ? 'Send email' : 'Open website';
  const href = kind === 'tel' ? telUrl(v) : kind === 'email' ? mailUrl(v) : webUrl(v);
  return (
    <div className="cast-linkinput">
      <Input type={kind === 'url' ? 'text' : kind} size={size} value={value} placeholder={placeholder} onChange={onChange} />
      <IconButton icon={Icon} label={label} size="sm" disabled={!v} onClick={() => openExternal(href)} />
    </div>
  );
}

/** Small colour dot that opens a swatch popover. */
export function ColorDotPicker({ value, onChange, size = 14 }: { value?: string; onChange: (v: string | undefined) => void; size?: number }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  return (
    <>
      <button
        type="button"
        className={`cast-colordot ${value ? '' : 'none'}`}
        style={{ width: size, height: size, background: value }}
        aria-label="Colour"
        title="Colour"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      />
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div style={{ width: 200, padding: 4 }}>
          <ColorPicker
            value={value}
            allowNone
            onChange={(v) => {
              onChange(v);
              setAnchor(null);
            }}
          />
        </div>
      </Popover>
    </>
  );
}

/* ------------------------------------------------------------------ misc */

/** true when the keyboard event target is a text field (so global keys like Delete must not act). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], .ProseMirror');
}

/** Export rows to CSV with a toast. */
export async function saveCsv<T>(projectTitle: string, docName: string, rows: T[], cols: CsvColumn<T>[]) {
  if (!rows.length) {
    toast(`No ${docName.toLowerCase()} to export yet`, 'info');
    return;
  }
  try {
    const path = await exportCsv(safeFileName(`${projectTitle || 'Project'} - ${docName}`), rows, cols);
    if (path) toast(`Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind !== 'electron') toast(`${docName} CSV downloaded`);
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/** Currency symbol for a currency code ('USD' -> '$'). */
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
