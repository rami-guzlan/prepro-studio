/* Spreadsheet-like editable table used by most list modules.

   <DataTable
     rows={gear}
     columns={[
       { key: 'name', header: 'Item', type: 'text', width: 240 },
       { key: 'qty', header: 'Qty', type: 'number', width: 70 },
       { key: 'status', header: 'Status', type: 'select', options: GEAR_STATUSES },
     ]}
     onChange={(id, patch) => ops.update(id, patch)}
     onReorder={(id, beforeId) => ops.moveBefore(id, beforeId)}
     rowActions={(row) => [{ label: 'Delete', icon: Trash2, danger: true, onClick: () => ops.remove(row.id) }]}
   />
*/
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Option } from '@/lib/constants';
import { Input, NumberInput, Select, Textarea, DateInput, TimeInput, Checkbox, Combo } from './forms';
import { Menu, type MenuItem } from './Menu';
import { naturalCompare } from '@/lib/text';

export type ColumnType = 'text' | 'textarea' | 'number' | 'money' | 'select' | 'combo' | 'date' | 'time' | 'checkbox' | 'readonly';

export interface Column<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  type?: ColumnType;
  options?: (Option | string)[];
  suggestions?: string[];
  placeholder?: string;
  /** read the cell value (default row[key]) */
  get?: (row: T) => unknown;
  /** build the patch for a new value (default { [key]: value }) */
  set?: (value: any, row: T) => Partial<T>;
  /** custom cell renderer (overrides type) */
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  /** footer cell (e.g. totals) */
  footer?: ReactNode;
  hidden?: boolean;
  /** money prefix e.g. '$' */
  prefix?: string;
  style?: CSSProperties;
}

export interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  onChange?: (id: string, patch: Partial<T>) => void;
  /** enables drag handles; called with dragged id and the id it is dropped before (null = end) */
  onReorder?: (id: string, beforeId: string | null) => void;
  rowActions?: (row: T) => MenuItem[];
  onDelete?: (row: T) => void;
  onRowClick?: (row: T) => void;
  selectedId?: string;
  groupBy?: (row: T) => string;
  groupOrder?: string[];
  groupHeader?: (group: string, rows: T[]) => ReactNode;
  emptyText?: ReactNode;
  maxHeight?: number | string;
  style?: CSSProperties;
  rowStyle?: (row: T) => CSSProperties | undefined;
  /** show the footer row (column.footer) */
  showFooter?: boolean;
}

function getVal<T>(col: Column<T>, row: T): unknown {
  return col.get ? col.get(row) : (row as any)[col.key];
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onChange,
  onReorder,
  rowActions,
  onDelete,
  onRowClick,
  selectedId,
  groupBy,
  groupOrder,
  groupHeader,
  emptyText = 'Nothing here yet.',
  maxHeight,
  style,
  rowStyle,
  showFooter,
}: DataTableProps<T>) {
  const cols = columns.filter((c) => !c.hidden);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r: T) => {
      const v = col.sortValue ? col.sortValue(r) : getVal(col, r);
      if (col.options && typeof v === 'string') {
        const idx = col.options.findIndex((o) => (typeof o === 'string' ? o : o.value) === v);
        if (idx >= 0) return idx;
      }
      return v as any;
    };
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return naturalCompare(String(va), String(vb)) * sort.dir;
    });
  }, [rows, sort, cols]);

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, T[]>();
    for (const r of sorted) {
      const g = groupBy(r) || '—';
      map.set(g, [...(map.get(g) ?? []), r]);
    }
    const keys = [...map.keys()];
    if (groupOrder) keys.sort((a, b) => (groupOrder.indexOf(a) < 0 ? 999 : groupOrder.indexOf(a)) - (groupOrder.indexOf(b) < 0 ? 999 : groupOrder.indexOf(b)));
    return keys.map((k) => [k, map.get(k)!] as const);
  }, [sorted, groupBy, groupOrder]);

  const canDrag = !!onReorder && !sort;
  const hasActions = !!rowActions || !!onDelete;
  const colCount = cols.length + (canDrag ? 1 : 0) + (hasActions ? 1 : 0);

  const renderCell = (col: Column<T>, row: T, index: number) => {
    if (col.render) return col.render(row, index);
    const v = getVal(col, row);
    const change = (value: unknown) => onChange?.(row.id, col.set ? col.set(value, row) : ({ [col.key]: value } as Partial<T>));
    const readOnly = !onChange || col.type === 'readonly' || !col.type;
    if (readOnly) {
      if (col.options && typeof v === 'string') {
        const o = col.options.find((x) => (typeof x === 'string' ? x : x.value) === v);
        return <span>{o ? (typeof o === 'string' ? o : o.label) : v}</span>;
      }
      if (typeof v === 'boolean') return v ? '✓' : '';
      return <span>{v == null ? '' : String(v)}</span>;
    }
    switch (col.type) {
      case 'textarea':
        return <Textarea bare autoGrow minRows={1} value={(v as string) ?? ''} placeholder={col.placeholder} onChange={change} />;
      case 'number':
        return <NumberInput bare size="sm" value={v as number} placeholder={col.placeholder} onChange={change} />;
      case 'money':
        return <NumberInput bare size="sm" value={v as number} decimals={2} prefix={col.prefix} placeholder={col.placeholder} onChange={change} />;
      case 'select':
        return <Select bare size="sm" value={(v as string) ?? ''} options={col.options ?? []} placeholder={col.placeholder ?? '—'} onChange={change} />;
      case 'combo':
        return <Combo bare size="sm" value={(v as string) ?? ''} suggestions={col.suggestions ?? []} placeholder={col.placeholder} onChange={change} />;
      case 'date':
        return <DateInput bare size="sm" value={v as string} onChange={change} />;
      case 'time':
        return <TimeInput bare size="sm" value={v as string} onChange={change} />;
      case 'checkbox':
        return <Checkbox checked={!!v} onChange={change} />;
      case 'text':
      default:
        return <Input bare size="sm" value={(v as string) ?? ''} placeholder={col.placeholder} onChange={change} />;
    }
  };

  const renderRow = (row: T, index: number) => {
    const isDrop = dropTarget?.id === row.id;
    return (
      <tr
        key={row.id}
        className={[selectedId === row.id && 'selected'].filter(Boolean).join(' ')}
        style={{
          ...(rowStyle?.(row) ?? {}),
          ...(isDrop ? { boxShadow: dropTarget!.after ? 'inset 0 -2px 0 var(--accent)' : 'inset 0 2px 0 var(--accent)' } : {}),
          opacity: dragId === row.id ? 0.4 : undefined,
          cursor: onRowClick ? 'pointer' : undefined,
        }}
        onClick={onRowClick ? (e) => {
          const tag = (e.target as HTMLElement).closest('input,select,textarea,button,label');
          if (!tag) onRowClick(row);
        } : undefined}
        onDragOver={
          canDrag && dragId
            ? (e) => {
                e.preventDefault();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                if (dropTarget?.id !== row.id || dropTarget.after !== after) setDropTarget({ id: row.id, after });
              }
            : undefined
        }
        onDrop={
          canDrag && dragId
            ? (e) => {
                e.preventDefault();
                const target = dropTarget;
                setDropTarget(null);
                const id = dragId;
                setDragId(null);
                if (!target || !id || target.id === id) return;
                if (!target.after) onReorder!(id, target.id);
                else {
                  const order = rows.map((r) => r.id).filter((x) => x !== id);
                  const i = order.indexOf(target.id);
                  onReorder!(id, order[i + 1] ?? null);
                }
              }
            : undefined
        }
      >
        {canDrag && (
          <td
            className="drag"
            draggable
            onDragStart={(e) => {
              setDragId(row.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', row.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropTarget(null);
            }}
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </td>
        )}
        {cols.map((c) => (
          <td key={c.key} className={c.align === 'right' || c.type === 'number' || c.type === 'money' ? 'num' : undefined} style={{ textAlign: c.align, ...c.style }}>
            {renderCell(c, row, index)}
          </td>
        ))}
        {hasActions && (
          <td className="actions-cell">
            {rowActions ? (
              <Menu
                align="end"
                trigger={
                  <button className="btn ghost sm icon" aria-label="Row actions">
                    <MoreHorizontal />
                  </button>
                }
                items={() => rowActions(row)}
              />
            ) : (
              <button className="btn ghost sm icon" aria-label="Delete row" title="Delete" onClick={() => onDelete!(row)}>
                <Trash2 />
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="table-wrap" style={{ maxHeight, ...style }} onDragLeave={(e) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(null);
    }}>
      <table className="table">
        <colgroup>
          {canDrag && <col style={{ width: 24 }} />}
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width, minWidth: c.minWidth }} />
          ))}
          {hasActions && <col style={{ width: 40 }} />}
        </colgroup>
        <thead>
          <tr>
            {canDrag && <th />}
            {cols.map((c) => {
              const sortable = c.sortable ?? (!!c.type || !!c.sortValue);
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={[sortable && 'sortable', (c.align === 'right' || c.type === 'number' || c.type === 'money') && 'num'].filter(Boolean).join(' ')}
                  style={{ textAlign: c.align }}
                  onClick={
                    sortable
                      ? () => setSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })
                      : undefined
                  }
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {c.header}
                    {active && (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </span>
                </th>
              );
            })}
            {hasActions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 28 }}>
                {emptyText}
              </td>
            </tr>
          )}
          {groups
            ? groups.map(([g, gr]) => (
                <Fragment key={`g-${g}`}>
                  <tr className="group-row">
                    <td colSpan={colCount}>{groupHeader ? groupHeader(g, gr) : `${g} · ${gr.length}`}</td>
                  </tr>
                  {gr.map((r) => renderRow(r, rows.indexOf(r)))}
                </Fragment>
              ))
            : sorted.map((r, i) => renderRow(r, i))}
        </tbody>
        {showFooter && (
          <tfoot>
            <tr>
              {canDrag && <td />}
              {cols.map((c) => (
                <td key={c.key} className={c.align === 'right' || c.type === 'number' || c.type === 'money' ? 'num' : undefined} style={{ fontWeight: 650, background: 'var(--bg-elev)', position: 'sticky', bottom: 0 }}>
                  {c.footer}
                </td>
              ))}
              {hasActions && <td style={{ background: 'var(--bg-elev)', position: 'sticky', bottom: 0 }} />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
