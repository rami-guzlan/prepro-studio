/* People & Brands: the row dialog (every field of one row) and the column editor. */
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CrmColumnType, CrmRow, CrmSheet } from '@/spaces/types';
import { CRM_COLUMN_TYPES, OPTION_COLORS, rowTitle } from '@/spaces/crm';
import { useSpaceFormatters } from '@/store/space';
import { Button, Field, IconButton, Input, Menu, Modal, Select, confirmDialog } from '@/ui';
import { CrmCell, TYPE_ICON, pillStyle } from './cells';
import { addOption, deleteColumn, deleteOption, deleteRows, duplicateRow, moveOption, setColumnType, updateColumn, updateOption } from './ops';

export function RowDialog({ sheet, row, onClose, onOpenRow }: { sheet: CrmSheet; row: CrmRow; onClose: () => void; onOpenRow: (id: string) => void }) {
  const fmt = useSpaceFormatters();
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={rowTitle(sheet, row)}
      headerExtra={<span className="muted small">{sheet.name}</span>}
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              const ok = await confirmDialog({ title: `Delete “${rowTitle(sheet, row)}”?`, message: 'The row is removed from the sheet. You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true });
              if (ok) {
                deleteRows(sheet.id, [row.id]);
                onClose();
              }
            }}
          >
            Delete
          </Button>
          <div className="spacer" />
          {row.updatedAt && <span className="muted small">Edited {fmt.dateMedium(row.updatedAt.slice(0, 10))}</span>}
          <Button
            icon={Copy}
            onClick={() => {
              const id = duplicateRow(sheet.id, row.id);
              if (id) onOpenRow(id);
            }}
          >
            Duplicate
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sp-crm-form">
        {sheet.columns.map((c, i) => {
          const Icon = TYPE_ICON[c.type];
          const wide = c.type === 'longtext' || c.type === 'multi';
          return (
            <Field
              key={c.id}
              span={wide ? 'all' : undefined}
              label={
                c.type === 'checkbox' ? undefined : (
                  <span className="row" style={{ gap: 5 }}>
                    <Icon size={12} /> {c.name}
                  </span>
                )
              }
            >
              <CrmCell sheet={sheet} col={c} row={row} form autoFocus={i === 0} />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}

export function ColumnDialog({ sheet, colId, onClose }: { sheet: CrmSheet; colId: string; onClose: () => void }) {
  const col = sheet.columns.find((c) => c.id === colId);
  const [newOpt, setNewOpt] = useState('');
  if (!col) return null;
  const hasOptions = col.type === 'select' || col.type === 'multi';
  const used = (optId: string) => sheet.rows.filter((r) => r.values[col.id] === optId || (Array.isArray(r.values[col.id]) && (r.values[col.id] as string[]).includes(optId))).length;
  const add = () => {
    const l = newOpt.trim();
    if (!l) return;
    addOption(sheet.id, col.id, l);
    setNewOpt('');
  };
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title="Edit column"
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            disabled={sheet.columns.length <= 1}
            onClick={async () => {
              const filled = sheet.rows.filter((r) => r.values[col.id] != null && r.values[col.id] !== '').length;
              const ok = !filled || (await confirmDialog({ title: `Delete the column “${col.name}”?`, message: `${filled} row${filled === 1 ? ' has' : 's have'} a value in it. You can undo with Ctrl+Z.`, confirmLabel: 'Delete column', danger: true }));
              if (ok) {
                deleteColumn(sheet.id, col.id);
                onClose();
              }
            }}
          >
            Delete column
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sp-crm-coledit">
        <Field label="Name">
          <Input autoFocus value={col.name} onChange={(name) => updateColumn(sheet.id, col.id, { name })} onFocus={(e) => e.target.select()} />
        </Field>
        <Field label="Type" hint={CRM_COLUMN_TYPES.find((t) => t.value === col.type)?.hint || undefined}>
          <Select value={col.type} options={CRM_COLUMN_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={(t) => setColumnType(sheet.id, col.id, t as CrmColumnType)} />
        </Field>
        {hasOptions && (
          <Field label="Options" span="all">
            <div className="sp-crm-opts">
              {(col.options ?? []).map((o, i) => (
                <div key={o.id} className="sp-crm-opt">
                  <Menu
                    align="start"
                    trigger={<button type="button" className="sp-crm-optcolor" style={{ background: o.color ?? '#868e96' }} aria-label="Option colour" />}
                    items={OPTION_COLORS.map((c) => ({ label: c, swatch: c, checked: o.color === c, onClick: () => updateOption(sheet.id, col.id, o.id, { color: c }, false) }))}
                  />
                  <Input size="sm" value={o.label} onChange={(label) => updateOption(sheet.id, col.id, o.id, { label })} />
                  <span className="sp-crm-chip" style={pillStyle(o.color)}>
                    {o.label || '—'}
                  </span>
                  <span className="muted small sp-crm-optused">{used(o.id) || ''}</span>
                  <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={i === 0} onClick={() => moveOption(sheet.id, col.id, o.id, -1)} />
                  <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={i === (col.options?.length ?? 0) - 1} onClick={() => moveOption(sheet.id, col.id, o.id, 1)} />
                  <IconButton icon={Trash2} size="sm" label="Delete option" onClick={() => deleteOption(sheet.id, col.id, o.id)} />
                </div>
              ))}
              <div className="sp-crm-opt add">
                <Plus size={14} className="muted" />
                <input
                  className="input sm"
                  value={newOpt}
                  placeholder="New option, Enter to add"
                  onChange={(e) => setNewOpt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      add();
                    }
                  }}
                />
                <Button size="sm" onClick={add} disabled={!newOpt.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </Field>
        )}
        <p className="muted small" style={{ margin: 0, gridColumn: '1 / -1' }}>
          Changing the type converts what’s already in the column (e.g. text → single select turns each distinct value into an option).
        </p>
      </div>
    </Modal>
  );
}
