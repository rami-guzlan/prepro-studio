/* People & Brands: board view — one lane per option of a single-select column
   (stage, status, warmth …); drag cards between lanes to move them along. */
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ID } from '@/types';
import type { CrmColumn, CrmRow, CrmSheet } from '@/spaces/types';
import { rowTitle, titleColumn } from '@/spaces/crm';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { pillStyle } from './cells';
import { addRow, setValue } from './ops';
import { cardFields } from './Table';

const DRAG = 'text/x-crm-row';

export function SheetBoard({ sheet, rows, column, onOpenRow }: { sheet: CrmSheet; rows: CrmRow[]; column: CrmColumn; onOpenRow: (id: ID) => void }) {
  const campaigns = useSpace((s) => s.campaigns);
  const fmt = useSpaceFormatters();
  const [over, setOver] = useState<string | null>(null);
  const money = sheet.columns.find((c) => c.type === 'money');
  const title = titleColumn(sheet);
  const lanes = useMemo(() => {
    const opts = column.options ?? [];
    const known = new Set(opts.map((o) => o.id));
    const list = opts.map((o) => ({ id: o.id, label: o.label, color: o.color, rows: rows.filter((r) => r.values[column.id] === o.id) }));
    const none = rows.filter((r) => !known.has(r.values[column.id] as string));
    return [{ id: '', label: `No ${column.name.toLowerCase()}`, color: undefined as string | undefined, rows: none }, ...list].filter((l) => l.id || l.rows.length);
  }, [rows, column]);

  const drop = (laneId: string, rowId: string) => setValue(sheet.id, rowId, column.id, laneId || undefined, false);

  return (
    <div className="sp-crm-board">
      {lanes.map((l) => {
        const sum = money ? l.rows.reduce((n, r) => n + (typeof r.values[money.id] === 'number' ? (r.values[money.id] as number) : 0), 0) : 0;
        return (
          <div
            key={l.id || 'none'}
            className={`sp-crm-lane ${over === l.id ? 'over' : ''}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG)) return;
              e.preventDefault();
              if (over !== l.id) setOver(l.id);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG);
              setOver(null);
              if (id) drop(l.id, id);
            }}
          >
            <div className="sp-crm-lane-head">
              <span className="sp-crm-chip" style={pillStyle(l.color) ?? { background: 'var(--bg-sunken)' }}>
                {l.label}
              </span>
              <span className="muted small">{l.rows.length}</span>
              <span className="spacer" />
              {money && sum > 0 && <span className="sp-crm-lane-sum">{fmt.money(sum, { cents: false })}</span>}
            </div>
            <div className="sp-crm-lane-cards">
              {l.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="sp-crm-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG, r.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onOpenRow(r.id)}
                  data-row-id={r.id}
                >
                  <b className="ellipsis">{rowTitle(sheet, r)}</b>
                  {cardFields(sheet, r, [column.id, title?.id ?? ''], campaigns).map((f) => (
                    <span key={f.col.id} className="sp-crm-card-field ellipsis">
                      {f.color ? (
                        <span className="sp-crm-chip" style={pillStyle(f.color)}>
                          {f.text}
                        </span>
                      ) : f.col.type === 'money' ? (
                        fmt.money(Number(f.text), { cents: false })
                      ) : f.col.type === 'date' ? (
                        `${f.col.name}: ${fmt.dateMedium(f.text)}`
                      ) : (
                        f.text
                      )}
                    </span>
                  ))}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sp-crm-lane-add"
              onClick={() => onOpenRow(addRow(sheet.id, l.id ? { [column.id]: l.id } : {}))}
            >
              <Plus size={13} /> Add
            </button>
          </div>
        );
      })}
    </div>
  );
}
