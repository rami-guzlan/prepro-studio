/* People & Brands: store operations on the space's CRM sheets (each one undo step). */
import type { Draft } from 'immer';
import type { ID } from '@/types';
import type { CrmColumn, CrmColumnType, CrmOption, CrmSheet, SpaceData } from '@/spaces/types';
import { uid } from '@/lib/id';
import { getSpace, updateSpace } from '@/store/space';
import { OPTION_COLORS, convertColumn, isEmptyValue, makeColumn, makeOption, makeRow } from '@/spaces/crm';

function sheetOf(d: Draft<SpaceData>, id: ID): Draft<CrmSheet> | undefined {
  return (d.crm ?? []).find((s) => s.id === id);
}

function colOf(d: Draft<SpaceData>, sheetId: ID, colId: ID): Draft<CrmColumn> | undefined {
  return sheetOf(d, sheetId)?.columns.find((c) => c.id === colId);
}

const now = () => new Date().toISOString();

/* ---------------------------------------------------------------- sheets */

export function addSheet(sheet: CrmSheet): ID {
  updateSpace((d) => {
    if (!Array.isArray(d.crm)) d.crm = [];
    d.crm.push(sheet as Draft<CrmSheet>);
  });
  return sheet.id;
}

export function updateSheet(id: ID, patch: Partial<Pick<CrmSheet, 'name' | 'color' | 'description' | 'view' | 'boardColumnId'>>, coalesce = false) {
  updateSpace(
    (d) => {
      const s = sheetOf(d, id);
      if (s) Object.assign(s, patch);
    },
    coalesce ? { coalesce: `crm-sheet:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/** Copy a sheet (structure only, or with its rows). Option and column ids are renewed. */
export function duplicateSheet(id: ID, withRows: boolean): ID | undefined {
  const src = getSpace().crm.find((s) => s.id === id);
  if (!src) return;
  const colMap = new Map<string, string>();
  const optMap = new Map<string, string>();
  const columns = src.columns.map((c) => {
    const nid = uid('col');
    colMap.set(c.id, nid);
    return { ...c, id: nid, options: c.options?.map((o) => {
      const oid = uid('opt');
      optMap.set(o.id, oid);
      return { ...o, id: oid };
    }) };
  });
  const remap = (v: unknown): unknown => (typeof v === 'string' && optMap.has(v) ? optMap.get(v) : Array.isArray(v) ? v.map(remap) : v);
  const copy: CrmSheet = {
    ...src,
    id: uid('sheet'),
    name: `${src.name} (copy)`,
    columns,
    boardColumnId: src.boardColumnId ? colMap.get(src.boardColumnId) : undefined,
    rows: withRows ? src.rows.map((r) => ({ ...makeRow(), values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [colMap.get(k) ?? k, remap(v)])) })) : [],
  };
  updateSpace((d) => {
    const i = d.crm.findIndex((s) => s.id === id);
    d.crm.splice(i + 1, 0, copy as Draft<CrmSheet>);
  });
  return copy.id;
}

export function deleteSheet(id: ID) {
  updateSpace((d) => {
    d.crm = d.crm.filter((s) => s.id !== id);
  });
}

export function moveSheet(id: ID, delta: -1 | 1) {
  updateSpace((d) => {
    const i = d.crm.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= d.crm.length) return;
    const [s] = d.crm.splice(i, 1);
    d.crm.splice(j, 0, s);
  });
}

/* ---------------------------------------------------------------- rows */

export function setValue(sheetId: ID, rowId: ID, colId: ID, value: unknown, coalesce = true) {
  updateSpace(
    (d) => {
      const r = sheetOf(d, sheetId)?.rows.find((x) => x.id === rowId);
      if (!r) return;
      if (isEmptyValue(value)) delete r.values[colId];
      else r.values[colId] = value as never;
      r.updatedAt = now();
    },
    coalesce ? { coalesce: `crm:${rowId}:${colId}` } : undefined,
  );
}

export function addRow(sheetId: ID, values: Record<ID, unknown> = {}): ID {
  const row = makeRow(values);
  updateSpace((d) => void sheetOf(d, sheetId)?.rows.push(row as never));
  return row.id;
}

export function duplicateRow(sheetId: ID, rowId: ID): ID | undefined {
  const s = getSpace().crm.find((x) => x.id === sheetId);
  const src = s?.rows.find((r) => r.id === rowId);
  if (!s || !src) return;
  const row = makeRow(JSON.parse(JSON.stringify(src.values)));
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    if (!sh) return;
    const i = sh.rows.findIndex((r) => r.id === rowId);
    sh.rows.splice(i + 1, 0, row as never);
  });
  return row.id;
}

export function deleteRows(sheetId: ID, ids: ID[]) {
  const set = new Set(ids);
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    if (sh) sh.rows = sh.rows.filter((r) => !set.has(r.id));
  });
}

/* ---------------------------------------------------------------- columns */

export function addColumn(sheetId: ID, name: string, type: CrmColumnType = 'text', index?: number): ID {
  const col = makeColumn(name, type, { width: type === 'longtext' ? 240 : type === 'checkbox' ? 80 : 160 });
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    if (!sh) return;
    if (index == null || index < 0 || index > sh.columns.length) sh.columns.push(col as never);
    else sh.columns.splice(index, 0, col as never);
  });
  return col.id;
}

export function updateColumn(sheetId: ID, colId: ID, patch: Partial<Pick<CrmColumn, 'name' | 'width'>>, coalesce = true) {
  updateSpace(
    (d) => {
      const c = colOf(d, sheetId, colId);
      if (c) Object.assign(c, patch);
    },
    coalesce ? { coalesce: `crm-col:${colId}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function setColumnType(sheetId: ID, colId: ID, type: CrmColumnType) {
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    if (!sh) return;
    convertColumn(sh as CrmSheet, colId, type, { campaigns: d.campaigns as never });
    if (sh.boardColumnId === colId && type !== 'select') sh.boardColumnId = undefined;
  });
}

export function moveColumn(sheetId: ID, colId: ID, delta: -1 | 1) {
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    if (!sh) return;
    const i = sh.columns.findIndex((c) => c.id === colId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sh.columns.length) return;
    const [c] = sh.columns.splice(i, 1);
    sh.columns.splice(j, 0, c);
  });
}

export function deleteColumn(sheetId: ID, colId: ID) {
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    if (!sh) return;
    sh.columns = sh.columns.filter((c) => c.id !== colId);
    for (const r of sh.rows) delete r.values[colId];
    if (sh.boardColumnId === colId) sh.boardColumnId = undefined;
  });
}

/* ---------------------------------------------------------------- select options */

export function addOption(sheetId: ID, colId: ID, label: string): ID | undefined {
  const c0 = getSpace().crm.find((s) => s.id === sheetId)?.columns.find((c) => c.id === colId);
  if (!c0) return;
  const o = makeOption(label, OPTION_COLORS[(c0.options?.length ?? 0) % OPTION_COLORS.length]);
  updateSpace((d) => {
    const c = colOf(d, sheetId, colId);
    if (c) c.options = [...(c.options ?? []), o];
  });
  return o.id;
}

export function updateOption(sheetId: ID, colId: ID, optId: ID, patch: Partial<Pick<CrmOption, 'label' | 'color'>>, coalesce = true) {
  updateSpace(
    (d) => {
      const o = colOf(d, sheetId, colId)?.options?.find((x) => x.id === optId);
      if (o) Object.assign(o, patch);
    },
    coalesce ? { coalesce: `crm-opt:${optId}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function moveOption(sheetId: ID, colId: ID, optId: ID, delta: -1 | 1) {
  updateSpace((d) => {
    const opts = colOf(d, sheetId, colId)?.options;
    if (!opts) return;
    const i = opts.findIndex((o) => o.id === optId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= opts.length) return;
    const [o] = opts.splice(i, 1);
    opts.splice(j, 0, o);
  });
}

/** Remove an option; rows using it lose the value. */
export function deleteOption(sheetId: ID, colId: ID, optId: ID) {
  updateSpace((d) => {
    const sh = sheetOf(d, sheetId);
    const c = sh?.columns.find((x) => x.id === colId);
    if (!sh || !c) return;
    c.options = (c.options ?? []).filter((o) => o.id !== optId);
    for (const r of sh.rows) {
      const v = r.values[colId];
      if (v === optId) delete r.values[colId];
      else if (Array.isArray(v)) {
        const next = v.filter((x) => x !== optId);
        if (next.length) r.values[colId] = next;
        else delete r.values[colId];
      }
    }
  });
}
