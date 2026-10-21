/* People & Brands: the spreadsheet view of a sheet — typed cells, column menus,
   sorting, column resizing, money totals and quick row adding. */
import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Kanban, Maximize2, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ID } from '@/types';
import type { Campaign, CrmColumn, CrmRow, CrmSheet } from '@/spaces/types';
import { CRM_TYPE_LABEL, displayValue, optionOf } from '@/spaces/crm';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { naturalCompare } from '@/lib/text';
import { Menu, type MenuItem } from '@/ui';
import { CrmCell, TYPE_ICON } from './cells';
import { addColumn, deleteColumn, deleteRows, duplicateRow, moveColumn, updateColumn, updateSheet } from './ops';

export interface SortState {
  colId: ID;
  dir: 1 | -1;
}

/** Sort key of a value (select / multi by option order, numbers numerically, text naturally). */
function sortKey(col: CrmColumn, v: unknown): string | number | null {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  switch (col.type) {
    case 'select':
      return col.options?.findIndex((o) => o.id === v) ?? null;
    case 'multi':
      return col.options?.findIndex((o) => o.id === (v as string[])[0]) ?? null;
    case 'number':
    case 'money':
      return typeof v === 'number' ? v : null;
    case 'checkbox':
      return v ? 0 : 1;
    default:
      return String(v).toLowerCase();
  }
}

export function sortRows(sheet: CrmSheet, rows: CrmRow[], sort: SortState | null): CrmRow[] {
  const col = sort ? sheet.columns.find((c) => c.id === sort.colId) : undefined;
  if (!sort || !col) return rows;
  return [...rows].sort((a, b) => {
    const ka = sortKey(col, a.values[col.id]);
    const kb = sortKey(col, b.values[col.id]);
    if (ka == null) return kb == null ? 0 : 1;
    if (kb == null) return -1;
    if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * sort.dir;
    return naturalCompare(String(ka), String(kb)) * sort.dir;
  });
}

function ColumnHead({ sheet, col, index, sort, onSort, onEdit, onResize }: { sheet: CrmSheet; col: CrmColumn; index: number; sort: SortState | null; onSort: (s: SortState | null) => void; onEdit: (id: ID) => void; onResize: (w: number) => void }) {
  const Icon = TYPE_ICON[col.type];
  const active = sort?.colId === col.id;
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const items: MenuItem[] = [
    { header: `${CRM_TYPE_LABEL[col.type]} column` },
    { label: 'Sort ascending', icon: ArrowUp, checked: active && sort?.dir === 1, onClick: () => onSort({ colId: col.id, dir: 1 }) },
    { label: 'Sort descending', icon: ArrowDown, checked: active && sort?.dir === -1, onClick: () => onSort({ colId: col.id, dir: -1 }) },
    ...(active ? [{ label: 'Clear sort', icon: X, onClick: () => onSort(null) }] : []),
    { separator: true },
    { label: 'Edit column…', icon: Pencil, onClick: () => onEdit(col.id) },
    { label: 'Insert column right', icon: Plus, onClick: () => onEdit(addColumn(sheet.id, 'New column', 'text', index + 1)) },
    { label: 'Move left', icon: ArrowLeft, disabled: index === 0, onClick: () => moveColumn(sheet.id, col.id, -1) },
    { label: 'Move right', icon: ArrowRight, disabled: index === sheet.columns.length - 1, onClick: () => moveColumn(sheet.id, col.id, 1) },
    ...(col.type === 'select' ? [{ label: 'Group the board by this', icon: Kanban, checked: sheet.boardColumnId === col.id, onClick: () => updateSheet(sheet.id, { boardColumnId: col.id }) }] : []),
    { separator: true },
    { label: 'Delete column', icon: Trash2, danger: true, disabled: sheet.columns.length <= 1, onClick: () => deleteColumn(sheet.id, col.id) },
  ];
  return (
    <th className="sp-crm-th">
      <Menu
        align="start"
        trigger={
          <button type="button" className="sp-crm-thbtn" title={`${col.name} — ${CRM_TYPE_LABEL[col.type]}`}>
            <Icon size={12} className="sp-crm-thicon" />
            <span className="ellipsis">{col.name}</span>
            {active && (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          </button>
        }
        items={items}
      />
      <span
        className="sp-crm-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const th = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          startRef.current = { x: e.clientX, w: th.width };
          const move = (ev: MouseEvent) => {
            if (!startRef.current) return;
            onResize(Math.max(70, Math.min(600, Math.round(startRef.current.w + ev.clientX - startRef.current.x))));
          };
          const up = () => {
            startRef.current = null;
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
        title="Drag to resize"
      />
    </th>
  );
}

export function SheetTable({ sheet, rows, sort, onSort, onOpenRow, onEditColumn, onAddRow }: { sheet: CrmSheet; rows: CrmRow[]; sort: SortState | null; onSort: (s: SortState | null) => void; onOpenRow: (id: ID) => void; onEditColumn: (id: ID) => void; onAddRow: () => void }) {
  const campaigns = useSpace((s) => s.campaigns);
  const fmt = useSpaceFormatters();
  const [widths, setWidths] = useState<Record<string, number>>({});
  const sorted = useMemo(() => sortRows(sheet, rows, sort), [sheet, rows, sort]);
  const moneyCols = sheet.columns.filter((c) => c.type === 'money');
  const totals = useMemo(() => Object.fromEntries(moneyCols.map((c) => [c.id, rows.reduce((n, r) => n + (typeof r.values[c.id] === 'number' ? (r.values[c.id] as number) : 0), 0)])), [moneyCols, rows]);
  const widthOf = (c: CrmColumn) => widths[c.id] ?? c.width ?? 160;
  const resize = (c: CrmColumn, w: number) => {
    setWidths((prev) => ({ ...prev, [c.id]: w }));
    updateColumn(sheet.id, c.id, { width: w });
  };

  const rowMenu = (r: CrmRow): MenuItem[] => [
    { label: 'Open details', icon: Maximize2, onClick: () => onOpenRow(r.id) },
    { label: 'Duplicate row', icon: Copy, onClick: () => duplicateRow(sheet.id, r.id) },
    { separator: true },
    { label: 'Delete row', icon: Trash2, danger: true, onClick: () => deleteRows(sheet.id, [r.id]) },
  ];

  return (
    <div className="table-wrap sp-crm-tablewrap">
      <table className="table sp-crm-table" style={{ width: 34 + sheet.columns.reduce((n, c) => n + widthOf(c), 0) + 80 }}>
        <colgroup>
          <col style={{ width: 34 }} />
          {sheet.columns.map((c) => (
            <col key={c.id} style={{ width: widthOf(c) }} />
          ))}
          <col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sp-crm-rowno-h">#</th>
            {sheet.columns.map((c, i) => (
              <ColumnHead key={c.id} sheet={sheet} col={c} index={i} sort={sort} onSort={onSort} onEdit={onEditColumn} onResize={(w) => resize(c, w)} />
            ))}
            <th className="sp-crm-addcol-h">
              <button type="button" className="sp-crm-addcol" onClick={() => onEditColumn(addColumn(sheet.id, 'New column'))} title="Add a column">
                <Plus size={13} /> Column
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id} data-row-id={r.id}>
              <td className="sp-crm-rowno">
                <button type="button" onClick={() => onOpenRow(r.id)} title="Open details">
                  <span className="n">{i + 1}</span>
                  <Maximize2 size={12} className="open" />
                </button>
              </td>
              {sheet.columns.map((c) => (
                <td key={c.id} className={`sp-crm-td t-${c.type}`} title={c.type === 'longtext' ? displayValue(c, r.values[c.id], { campaigns }) : undefined}>
                  <CrmCell sheet={sheet} col={c} row={r} />
                </td>
              ))}
              <td className="actions-cell">
                <Menu
                  align="end"
                  trigger={
                    <button className="btn ghost sm icon" aria-label="Row actions">
                      <MoreHorizontal />
                    </button>
                  }
                  items={() => rowMenu(r)}
                />
              </td>
            </tr>
          ))}
          <tr className="sp-crm-addrow">
            <td colSpan={sheet.columns.length + 2}>
              <button type="button" onClick={onAddRow}>
                <Plus size={14} /> New row
              </button>
            </td>
          </tr>
        </tbody>
        {moneyCols.length > 0 && rows.length > 0 && (
          <tfoot>
            <tr>
              <td className="sp-crm-foot-label">Σ</td>
              {sheet.columns.map((c) => (
                <td key={c.id} className={c.type === 'money' ? 'num sp-crm-total' : undefined}>
                  {c.type === 'money' ? fmt.money(totals[c.id] ?? 0, { cents: false }) : ''}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** First few filled values of a row (for board cards), skipping the title, the grouping column and long text. */
export function cardFields(sheet: CrmSheet, row: CrmRow, skip: ID[], campaigns: Campaign[], max = 3): { col: CrmColumn; text: string; color?: string }[] {
  const out: { col: CrmColumn; text: string; color?: string }[] = [];
  for (const c of sheet.columns) {
    if (skip.includes(c.id) || c.type === 'longtext') continue;
    const v = row.values[c.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const text = displayValue(c, v, { campaigns });
    if (!text) continue;
    out.push({ col: c, text, color: c.type === 'select' ? optionOf(c, v)?.color : undefined });
    if (out.length >= max) break;
  }
  return out;
}
