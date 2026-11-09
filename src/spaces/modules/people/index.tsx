/* People & Brands — two parts:
   - Accounts & outreach (./outreach): target account lists, the leads at each
     account and the team's outreach towards a goal such as an event's RSVPs.
   - Sheets: CRM-style sheets of a Marketing Space: relationships, leads, brand
     deals, collaborators, press … Each sheet has its own typed columns, a
     spreadsheet view and a board view grouped by a stage / status column. */
import './people.css';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, FileUp, Handshake, Kanban, MoreHorizontal, Pencil, Plus, Table2, Trash2, X } from 'lucide-react';
import type { ID } from '@/types';
import type { CrmSheet } from '@/spaces/types';
import { CRM_TEMPLATES, SHEET_COLORS, boardColumn, displayValue, dueRows, makeSheet, sheetCsvColumns, sheetFromCsv } from '@/spaces/crm';
import { getSpace, useSpace } from '@/store/space';
import { readLS, useApp, writeLS } from '@/store/app';
import { parseCSV } from '@/lib/csv';
import { todayISO } from '@/lib/dates';
import { matchesQuery, plural, safeFileName } from '@/lib/text';
import { backend, exportCsv } from '@/backend';
import { Button, EmptyState, ExportMenu, Menu, ModuleHeader, SearchInput, Select, Tabs, Toolbar, confirmDialog, openContextMenu, toast, type MenuItem } from '@/ui';
import { SheetBoard } from './Board';
import { SheetTable, type SortState } from './Table';
import { ColumnDialog, RowDialog } from './dialogs';
import { addRow, addSheet, deleteSheet, duplicateSheet, moveSheet, updateSheet } from './ops';
import { ModeTabs, OutreachModule, type PeopleMode } from './outreach';

/* ---------------------------------------------------------------- import / export */

async function importCsvSheet(): Promise<ID | undefined> {
  try {
    const files = await backend.openFiles({ multiple: false, title: 'Import a spreadsheet (CSV)', filters: [{ name: 'CSV / TSV', extensions: ['csv', 'tsv', 'txt'] }] });
    const f = files[0];
    if (!f) return;
    const text = new TextDecoder().decode(f.data);
    const table = /\.tsv$/i.test(f.name) || (!text.includes(',') && text.includes('\t')) ? text.split(/\r?\n/).map((l) => l.split('\t')) : parseCSV(text);
    if (table.length < 1) {
      toast('That file is empty', 'error');
      return;
    }
    const sheet = sheetFromCsv(f.name.replace(/\.[^.]+$/, ''), table, getSpace().campaigns);
    sheet.color = SHEET_COLORS[getSpace().crm.length % SHEET_COLORS.length];
    addSheet(sheet);
    toast(`Imported ${plural(sheet.rows.length, 'row')} into “${sheet.name}” — check the column types`);
    return sheet.id;
  } catch (e) {
    toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

async function exportSheetCsv(sheet: CrmSheet) {
  const s = getSpace();
  if (!sheet.rows.length) {
    toast('This sheet has no rows yet', 'info');
    return;
  }
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title || 'Space'} - ${sheet.name}`), sheet.rows, sheetCsvColumns(sheet, s.campaigns));
    if (path) toast(`Exported ${plural(sheet.rows.length, 'row')} to ${path.split(/[\\/]/).pop()}`);
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/* ---------------------------------------------------------------- sheet tabs */

function SheetTabs({ sheets, activeId, onSelect }: { sheets: CrmSheet[]; activeId?: ID; onSelect: (id: ID) => void }) {
  const [renaming, setRenaming] = useState<ID | null>(null);
  const today = todayISO();

  const remove = async (sh: CrmSheet) => {
    const ok = !sh.rows.length || (await confirmDialog({ title: `Delete the sheet “${sh.name}”?`, message: `${plural(sh.rows.length, 'row')} go with it. You can undo with Ctrl+Z.`, confirmLabel: 'Delete sheet', danger: true }));
    if (!ok) return;
    const i = sheets.findIndex((x) => x.id === sh.id);
    deleteSheet(sh.id);
    const next = sheets[i + 1] ?? sheets[i - 1];
    if (next) onSelect(next.id);
  };

  const menu = (sh: CrmSheet, i: number): MenuItem[] => [
    { label: 'Rename', icon: Pencil, onClick: () => setRenaming(sh.id) },
    { header: 'Colour' },
    ...SHEET_COLORS.map((c): MenuItem => ({ label: c, swatch: c, checked: sh.color === c, onClick: () => updateSheet(sh.id, { color: c }) })),
    { separator: true },
    { label: 'Duplicate (columns only)', icon: Copy, onClick: () => { const id = duplicateSheet(sh.id, false); if (id) onSelect(id); } },
    { label: 'Duplicate with rows', icon: Copy, onClick: () => { const id = duplicateSheet(sh.id, true); if (id) onSelect(id); } },
    { label: 'Move left', icon: ArrowLeft, disabled: i === 0, onClick: () => moveSheet(sh.id, -1) },
    { label: 'Move right', icon: ArrowRight, disabled: i === sheets.length - 1, onClick: () => moveSheet(sh.id, 1) },
    { separator: true },
    { label: 'Export CSV', onClick: () => void exportSheetCsv(sh) },
    { label: 'Delete sheet…', icon: Trash2, danger: true, onClick: () => void remove(sh) },
  ];

  return (
    <div className="sp-crm-tabs" role="tablist" aria-label="Sheets">
      {sheets.map((sh, i) => {
        const on = sh.id === activeId;
        const due = dueRows(sh, today).length;
        return (
          <div
            key={sh.id}
            role="tab"
            tabIndex={0}
            aria-selected={on}
            className={`sp-crm-tab ${on ? 'on' : ''}`}
            style={{ ['--sc' as string]: sh.color || 'var(--accent)' }}
            onClick={() => onSelect(sh.id)}
            onDoubleClick={() => setRenaming(sh.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(sh.id);
              if (e.key === 'F2') setRenaming(sh.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(e, menu(sh, i));
            }}
            title={`${sh.name} — ${plural(sh.rows.length, 'row')}${due ? ` · ${due} due` : ''}. Double-click to rename, right-click for more.`}
          >
            <span className="sp-crm-tab-dot" />
            {renaming === sh.id ? (
              <input
                className="sp-crm-tab-rename"
                autoFocus
                defaultValue={sh.name}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== sh.name) updateSheet(sh.id, { name: v });
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    (e.target as HTMLInputElement).value = sh.name;
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <span className="sp-crm-tab-name ellipsis">{sh.name}</span>
            )}
            <span className="sp-crm-tab-count">{sh.rows.length}</span>
            {due > 0 && <span className="sp-crm-tab-due" title={`${due} follow-up${due === 1 ? '' : 's'} due`}>{due}</span>}
            {on && renaming !== sh.id && (
              <span onClick={(e) => e.stopPropagation()}>
                <Menu align="start" trigger={<button type="button" className="sp-crm-tab-more" aria-label="Sheet options"><MoreHorizontal size={14} /></button>} items={menu(sh, i)} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- module */

export default function PeopleModule() {
  const spaceId = useSpace((s) => s.id);
  const hasOutreach = useSpace((s) => !!(s.outreach?.accounts.length || s.outreach?.lists.length));
  const sheetCount = useSpace((s) => s.crm?.length ?? 0);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const key = `prepro.sp-people.mode.${spaceId}`;
  // spaces that only have sheets open on them; everything else on Accounts & outreach
  const [mode, setModeState] = useState<PeopleMode>(() => readLS<PeopleMode>(key, '' as PeopleMode) || (sheetCount && !hasOutreach ? 'sheets' : 'accounts'));
  const setMode = (m: PeopleMode) => {
    setModeState(m);
    writeLS(key, m);
  };
  // links from agents / other screens pick the part they point into
  useEffect(() => {
    const p = params as { sheetId?: string; rowId?: string; accountId?: string; listId?: string; outreachView?: string } | undefined;
    if (p?.sheetId || p?.rowId) setModeState('sheets');
    else if (p?.accountId || p?.listId || p?.outreachView) setModeState('accounts');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
  const tabs = <ModeTabs mode={mode} onMode={setMode} sheets={sheetCount} />;
  return mode === 'accounts' ? <OutreachModule modeTabs={tabs} /> : <SheetsModule modeTabs={tabs} />;
}

function SheetsModule({ modeTabs }: { modeTabs: React.ReactNode }) {
  const sheets = useSpace((s) => s.crm) ?? [];
  const campaigns = useSpace((s) => s.campaigns);
  const spaceId = useSpace((s) => s.id);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const lsKey = `prepro.sp-people.active.${spaceId}`;
  const [activeId, setActiveId] = useState<ID>(() => readLS<string>(lsKey, ''));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [openRow, setOpenRow] = useState<ID | null>(null);
  const [editCol, setEditCol] = useState<ID | null>(null);
  const today = todayISO();

  const sheet = sheets.find((x) => x.id === activeId) ?? sheets[0];
  const select = (id: ID) => {
    setActiveId(id);
    writeLS(lsKey, id);
    setSort(null);
    setQ('');
  };

  // navigation from agents / other screens: { sheetId, rowId }
  useEffect(() => {
    const p = params as { sheetId?: string; rowId?: string } | undefined;
    if (p?.sheetId) {
      const hit = sheets.find((x) => x.id === p.sheetId || x.name.toLowerCase() === String(p.sheetId).toLowerCase());
      if (hit) select(hit.id);
    }
    if (p?.rowId) setOpenRow(p.rowId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const rows = useMemo(() => {
    if (!sheet) return [];
    if (!q.trim()) return sheet.rows;
    return sheet.rows.filter((r) => matchesQuery(sheet.columns.map((c) => displayValue(c, r.values[c.id], { campaigns })).join(' '), q));
  }, [sheet, q, campaigns]);

  const newSheet = (templateId: string) => {
    const t = CRM_TEMPLATES.find((x) => x.id === templateId);
    const sh = makeSheet(templateId, { color: t?.id === 'blank' ? SHEET_COLORS[sheets.length % SHEET_COLORS.length] : t?.color });
    if (sheets.some((x) => x.name === sh.name)) sh.name = `${sh.name} ${sheets.filter((x) => x.name.startsWith(sh.name)).length + 1}`;
    select(addSheet(sh));
  };

  const newSheetItems: MenuItem[] = [
    { header: 'Start from a template' },
    ...CRM_TEMPLATES.map((t): MenuItem => ({ label: t.name, swatch: t.color, onClick: () => newSheet(t.id) })),
    { separator: true },
    { label: 'Import a CSV…', icon: FileUp, onClick: async () => { const id = await importCsvSheet(); if (id) select(id); } },
  ];

  const totalRows = sheets.reduce((n, x) => n + x.rows.length, 0);
  const dueTotal = sheets.reduce((n, x) => n + dueRows(x, today).length, 0);
  const subtitle = sheets.length
    ? [plural(sheets.length, 'sheet'), plural(totalRows, 'row'), dueTotal ? `${dueTotal} follow-up${dueTotal === 1 ? '' : 's'} due` : ''].filter(Boolean).join(' · ')
    : 'Track relationships, leads, brand deals and collaborators';
  const boardCol = sheet ? boardColumn(sheet) : undefined;
  const view = sheet?.view === 'board' && boardCol ? 'board' : 'table';
  const rowObj = sheet && openRow ? sheet.rows.find((r) => r.id === openRow) : undefined;

  const addAndOpen = () => {
    if (!sheet) return;
    const id = addRow(sheet.id);
    if (view === 'board') setOpenRow(id);
    else
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`.sp-crm-table tr[data-row-id="${id}"] input, .sp-crm-table tr[data-row-id="${id}"] textarea`);
        el?.focus();
        el?.scrollIntoView({ block: 'nearest' });
      });
  };

  return (
    <div className="module sp-crm">
      <ModuleHeader
        title="People & Brands"
        icon={Handshake}
        subtitle={subtitle}
        actions={
          <>
            {sheets.length > 0 && (
              <ExportMenu
                docs={[
                  { id: 'space-people', label: 'All sheets (PDF)' },
                  ...(sheet ? [{ id: 'space-people', label: `${sheet.name} (PDF)`, options: { sheets: sheet.name } }] : []),
                ]}
                csv={sheet ? [{ label: `${sheet.name} (CSV)`, onClick: () => void exportSheetCsv(sheet) }] : []}
              />
            )}
            <Menu
              align="end"
              items={newSheetItems}
              trigger={
                <Button variant="primary" icon={Plus}>
                  New sheet
                </Button>
              }
            />
          </>
        }
      />
      {modeTabs}

      {sheets.length === 0 ? (
        <div className="module-body">
          <EmptyState
            icon={Handshake}
            title="Track the people and brands behind your growth"
            description="Make a sheet for each kind of relationship: the people you learn from and build with, leads, sponsors and brand deals, collaborators and guests, press. Each sheet is a spreadsheet with its own columns and a pipeline board."
          />
          <div className="sp-crm-templates">
            {CRM_TEMPLATES.map((t) => (
              <button key={t.id} type="button" className="sp-crm-template" style={{ ['--sc' as string]: t.color }} onClick={() => newSheet(t.id)}>
                <span className="sp-crm-template-dot" />
                <b>{t.name}</b>
                <span>{t.description}</span>
                <span className="sp-crm-template-cols">{t.columns().map((c) => c.name).join(' · ')}</span>
              </button>
            ))}
            <button type="button" className="sp-crm-template import" onClick={async () => { const id = await importCsvSheet(); if (id) select(id); }}>
              <FileUp size={18} />
              <b>Import a CSV</b>
              <span>Bring a spreadsheet from Excel, Google Sheets, Notion or Airtable. Column types are detected.</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <SheetTabs sheets={sheets} activeId={sheet?.id} onSelect={select} />
          {sheet && (
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder={`Search ${sheet.name}…`} />
              {q && (
                <Button size="sm" variant="ghost" icon={X} onClick={() => setQ('')}>
                  Clear
                </Button>
              )}
              <Tabs<'table' | 'board'>
                value={view}
                onChange={(v) => {
                  if (v === 'board' && !boardCol) {
                    toast('Add a single-select column (e.g. Stage or Status) to use the board', 'info');
                    return;
                  }
                  updateSheet(sheet.id, { view: v });
                }}
                tabs={[
                  { id: 'table', label: 'Table', icon: Table2 },
                  { id: 'board', label: 'Board', icon: Kanban },
                ]}
              />
              {view === 'board' && boardCol && (
                <Select
                  size="sm"
                  style={{ width: 'auto', maxWidth: 220 }}
                  value={boardCol.id}
                  options={sheet.columns.filter((c) => c.type === 'select').map((c) => ({ value: c.id, label: `Group by ${c.name}` }))}
                  onChange={(v) => updateSheet(sheet.id, { boardColumnId: v })}
                  aria-label="Group the board by"
                />
              )}
              <div className="spacer" />
              <span className="muted small">{q ? `${rows.length} of ${plural(sheet.rows.length, 'row')}` : plural(sheet.rows.length, 'row')}</span>
              <Button size="sm" variant="primary" icon={Plus} onClick={addAndOpen}>
                New row
              </Button>
            </Toolbar>
          )}
          <div className="module-body sp-crm-body">
            {sheet &&
              (view === 'board' && boardCol ? (
                <SheetBoard sheet={sheet} rows={rows} column={boardCol} onOpenRow={setOpenRow} />
              ) : (
                <SheetTable sheet={sheet} rows={rows} sort={sort} onSort={setSort} onOpenRow={setOpenRow} onEditColumn={setEditCol} onAddRow={addAndOpen} />
              ))}
            {sheet && sheet.rows.length === 0 && (
              <p className="muted small sp-crm-hint">
                Tip: click a column header to sort, rename or change its type; open a row (#) to see every field. Your agent can fill this too: “add these 10 people to {sheet.name}”.
              </p>
            )}
          </div>
        </>
      )}

      {sheet && rowObj && <RowDialog key={rowObj.id} sheet={sheet} row={rowObj} onClose={() => setOpenRow(null)} onOpenRow={setOpenRow} />}
      {sheet && editCol && <ColumnDialog sheet={sheet} colId={editCol} onClose={() => setEditCol(null)} />}
    </div>
  );
}

