/* Marketing Space extras for agents: People & Brands (CRM sheets with typed
   columns) and downloadable campaign resources (files in Brand Kit & Assets). */
import type { Campaign, CrmColumn, CrmColumnType, CrmRow, CrmSheet, ResourceType } from '@/spaces/types';
import { RESOURCE_TYPES } from '@/spaces/constants';
import { CRM_COLUMN_TYPES, CRM_TEMPLATES, SHEET_COLORS, convertColumn, displayValue, dueRows, findOption, makeColumn, makeRow, makeSheet, optionOf, parseValue } from '@/spaces/crm';
import { guessResourceType } from '@/spaces/modules/assets/resources';
import { importAssetBytes } from '@/backend';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { updateSpace } from '@/store/space';
import { clean, fail, plural, space } from '../ctx';
import { defineTool } from '../tool';
import { anyObj, arr, bool, enm, int, obj, opt, str } from '../schema';

const TYPES = CRM_COLUMN_TYPES.map((t) => t.value) as CrmColumnType[];

function findSheet(sheets: CrmSheet[], ref: string | undefined): CrmSheet {
  if (!ref?.trim()) fail('Pass "sheet" (name or id). Call crm_read without arguments to list the sheets.');
  const r = ref.trim().toLowerCase();
  const hit = sheets.find((s) => s.id === ref) ?? sheets.find((s) => s.name.toLowerCase() === r) ?? sheets.find((s) => s.name.toLowerCase().includes(r));
  if (!hit) fail(`No sheet "${ref}". Sheets: ${sheets.map((s) => `"${s.name}"`).join(', ') || 'none yet — create one with crm_sheet {action:"create"}'}.`);
  return hit;
}

function findCol(sheet: CrmSheet, ref: string): CrmColumn {
  const r = ref.trim().toLowerCase();
  const hit = sheet.columns.find((c) => c.id === ref) ?? sheet.columns.find((c) => c.name.toLowerCase() === r);
  if (!hit) fail(`"${sheet.name}" has no column "${ref}". Columns: ${sheet.columns.map((c) => c.name).join(', ')}.`);
  return hit;
}

function colOut(c: CrmColumn) {
  return clean({ name: c.name, type: c.type, options: c.options?.length ? c.options.map((o) => o.label) : undefined });
}

function sheetOut(sh: CrmSheet) {
  const board = sh.columns.find((c) => c.id === sh.boardColumnId);
  return clean({ id: sh.id, name: sh.name, description: sh.description, rows: sh.rows.length, due: dueRows(sh, todayISO()).length || undefined, view: sh.view, boardGroupsBy: board?.name, columns: sh.columns.map(colOut) });
}

/** A row as { id, "Column name": value } (labels for selects, names for campaigns). */
function rowOut(sh: CrmSheet, r: CrmRow, campaigns: Campaign[]) {
  const o: Record<string, unknown> = { id: r.id };
  for (const c of sh.columns) {
    const v = r.values[c.id];
    if (v == null || v === '') continue;
    if (c.type === 'number' || c.type === 'money') o[c.name] = v;
    else if (c.type === 'checkbox') o[c.name] = v === true;
    else if (c.type === 'multi') o[c.name] = (Array.isArray(v) ? v : []).map((id) => optionOf(c, id)?.label).filter(Boolean);
    else o[c.name] = displayValue(c, v, { campaigns });
  }
  if (r.updatedAt) o._updated = r.updatedAt.slice(0, 10);
  return o;
}

/** Apply { "Column": value } to a draft row. Unknown columns: error, or new text columns with createColumns. */
function applyValues(sh: CrmSheet, values: Record<string, unknown>, target: Record<string, unknown>, ctx: { campaigns: Campaign[]; createColumns?: boolean }) {
  for (const [k, raw] of Object.entries(values)) {
    if (k === 'id' || k.startsWith('_')) continue;
    let col = sh.columns.find((c) => c.id === k) ?? sh.columns.find((c) => c.name.toLowerCase() === k.trim().toLowerCase());
    if (!col) {
      if (!ctx.createColumns) fail(`"${sh.name}" has no column "${k}". Columns: ${sh.columns.map((c) => c.name).join(', ')}. Pass createColumns:true to add missing columns as text, or add them with crm_sheet.`);
      col = makeColumn(k.trim(), 'text', { width: 160 });
      sh.columns.push(col);
    }
    if (raw == null || raw === '') {
      delete target[col.id];
      continue;
    }
    try {
      const v = parseValue(col, raw, { campaigns: ctx.campaigns, createOptions: true });
      if (v === undefined) delete target[col.id];
      else target[col.id] = v;
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }
}

const columnSpec = obj({
  name: str(),
  type: opt(enm(TYPES, 'column type (default text)')),
  options: opt(arr(str(), 'select / multi choices, in order')),
});

export const crmTools = [
  defineTool({
    name: 'crm_read',
    title: 'Read People & Brands sheets',
    description:
      'People & Brands (Marketing Spaces) holds CRM-style sheets — relationships, leads, brand deals, collaborators & guests, press … each with its own typed columns. Without "sheet": lists the sheets with their columns, plus the templates and column types. With "sheet": returns its rows as {id, "Column": value}, filterable by search, where (column → value) or due (follow-up / due date today or earlier).',
    readOnly: true,
    global: true,
    input: obj({
      sheet: opt(str('sheet name or id')),
      search: opt(str('text to find in any column')),
      where: opt(anyObj('e.g. {"Stage": "Negotiating"}; multi-select columns match when they contain the value')),
      due: opt(bool('only rows whose follow-up / due date is today or earlier (and not closed)')),
      limit: opt(int('max rows (default 200)', 1)),
      offset: opt(int('skip rows', 0)),
    }),
    run(a: { sheet?: string; search?: string; where?: Record<string, unknown>; due?: boolean; limit?: number; offset?: number }) {
      const s = space();
      const sheets = s.crm ?? [];
      if (!a.sheet) {
        return {
          data: {
            sheets: sheets.map(sheetOut),
            templates: CRM_TEMPLATES.map((t) => clean({ id: t.id, name: t.name, about: t.description, columns: t.columns().map((c) => `${c.name} (${c.type})`).join(', ') })),
            columnTypes: CRM_COLUMN_TYPES.map((t) => `${t.value}: ${t.label}${t.hint ? ` — ${t.hint}` : ''}`),
          },
        };
      }
      const sh = findSheet(sheets, a.sheet);
      let rows = a.due ? dueRows(sh, todayISO()) : sh.rows;
      if (a.search?.trim()) {
        const q = a.search.trim().toLowerCase();
        rows = rows.filter((r) => sh.columns.some((c) => displayValue(c, r.values[c.id], { campaigns: s.campaigns }).toLowerCase().includes(q)));
      }
      for (const [k, want] of Object.entries(a.where ?? {})) {
        const c = findCol(sh, k);
        const w = String(want ?? '').toLowerCase();
        rows = rows.filter((r) => {
          const v = r.values[c.id];
          if (c.type === 'multi') return (Array.isArray(v) ? v : []).some((id) => optionOf(c, id)?.label.toLowerCase() === w);
          if (c.type === 'checkbox') return (v === true) === (want === true || w === 'true' || w === 'yes');
          return displayValue(c, v, { campaigns: s.campaigns }).toLowerCase() === w;
        });
      }
      const total = rows.length;
      const off = a.offset ?? 0;
      const page = rows.slice(off, off + (a.limit ?? 200));
      return { data: { sheet: sheetOut(sh), total, returned: page.length, rows: page.map((r) => rowOut(sh, r, s.campaigns)) } };
    },
  }),

  defineTool({
    name: 'crm_sheet',
    title: 'Create, change or delete a People & Brands sheet',
    description:
      'action "create": a new sheet from a template (relationships, leads, brand_deals, collaborations, press, blank) or with your own "columns"; "update": rename / describe / recolour, set the view ("table" | "board") and the column the board groups by, add, change (name, type, add / remove options) or remove columns; "delete": removes the sheet and its rows. Changing a column type converts existing values.',
    destructive: true,
    global: true,
    input: obj({
      action: enm(['create', 'update', 'delete'] as const),
      sheet: opt(str('update / delete: sheet name or id')),
      name: opt(str('create: sheet name; update: new name')),
      template: opt(enm(CRM_TEMPLATES.map((t) => t.id), 'create: starting columns (default blank)')),
      columns: opt(arr(columnSpec, 'create: your own columns instead of the template’s')),
      description: opt(str()),
      color: opt(str('#rrggbb')),
      view: opt(enm(['table', 'board'] as const)),
      boardColumn: opt(str('single-select column the board groups by')),
      addColumns: opt(arr(columnSpec)),
      updateColumns: opt(arr(obj({ column: str('column name or id'), name: opt(str()), type: opt(enm(TYPES)), addOptions: opt(arr(str())), removeOptions: opt(arr(str())) }))),
      removeColumns: opt(arr(str())),
    }),
    run(a: {
      action: 'create' | 'update' | 'delete';
      sheet?: string;
      name?: string;
      template?: string;
      columns?: { name: string; type?: CrmColumnType; options?: string[] }[];
      description?: string;
      color?: string;
      view?: 'table' | 'board';
      boardColumn?: string;
      addColumns?: { name: string; type?: CrmColumnType; options?: string[] }[];
      updateColumns?: { column: string; name?: string; type?: CrmColumnType; addOptions?: string[]; removeOptions?: string[] }[];
      removeColumns?: string[];
    }) {
      const s = space();
      const build = (c: { name: string; type?: CrmColumnType; options?: string[] }) => {
        const col = makeColumn(c.name.trim() || 'Column', c.type ?? 'text', { width: c.type === 'longtext' ? 240 : c.type === 'checkbox' ? 80 : 160 });
        if (c.options?.length) for (const o of c.options) findOption(col, o, true);
        return col;
      };
      if (a.action === 'create') {
        const sh = makeSheet(a.template ?? 'blank', clean({ name: a.name?.trim() || undefined, description: a.description, color: a.color }) as Partial<CrmSheet>);
        if (!a.name?.trim() && !a.template) sh.name = 'New sheet';
        if (a.columns?.length) {
          sh.columns = a.columns.map(build);
          sh.boardColumnId = sh.columns.find((c) => c.type === 'select')?.id;
        }
        if (!a.color && (!a.template || a.template === 'blank')) sh.color = SHEET_COLORS[(s.crm?.length ?? 0) % SHEET_COLORS.length];
        if (a.view) sh.view = a.view;
        updateSpace((d) => {
          if (!Array.isArray(d.crm)) d.crm = [];
          d.crm.push(sh as never);
        });
        return { data: sheetOut(sh), summary: `Created the sheet “${sh.name}”` };
      }
      const sh0 = findSheet(s.crm ?? [], a.sheet);
      if (a.action === 'delete') {
        updateSpace((d) => {
          d.crm = d.crm.filter((x) => x.id !== sh0.id);
        });
        return { data: { deleted: sh0.name, rows: sh0.rows.length }, summary: `Deleted the sheet “${sh0.name}”` };
      }
      // validate references before writing
      for (const u of a.updateColumns ?? []) findCol(sh0, u.column);
      for (const r of a.removeColumns ?? []) findCol(sh0, r);
      let result: CrmSheet | undefined;
      updateSpace((d) => {
        const sh = d.crm.find((x) => x.id === sh0.id) as unknown as CrmSheet;
        if (a.name?.trim()) sh.name = a.name.trim();
        if (a.description != null) sh.description = a.description || undefined;
        if (a.color) sh.color = a.color;
        for (const c of a.addColumns ?? []) sh.columns.push(build(c));
        for (const u of a.updateColumns ?? []) {
          const col = findCol(sh, u.column);
          if (u.name?.trim()) col.name = u.name.trim();
          if (u.type && u.type !== col.type) convertColumn(sh, col.id, u.type, { campaigns: s.campaigns });
          for (const o of u.addOptions ?? []) findOption(col, o, true);
          for (const o of u.removeOptions ?? []) {
            const hit = findOption(col, o, false);
            if (!hit) continue;
            col.options = (col.options ?? []).filter((x) => x.id !== hit.id);
            for (const r of sh.rows) {
              const v = r.values[col.id];
              if (v === hit.id) delete r.values[col.id];
              else if (Array.isArray(v)) r.values[col.id] = v.filter((x) => x !== hit.id);
            }
          }
        }
        for (const ref of a.removeColumns ?? []) {
          const col = findCol(sh, ref);
          sh.columns = sh.columns.filter((c) => c.id !== col.id);
          for (const r of sh.rows) delete r.values[col.id];
          if (sh.boardColumnId === col.id) sh.boardColumnId = undefined;
        }
        if (a.boardColumn) {
          const col = findCol(sh, a.boardColumn);
          if (col.type !== 'select') fail(`"${col.name}" is not a single-select column; the board groups by one.`);
          sh.boardColumnId = col.id;
        }
        if (a.view) sh.view = a.view;
        result = JSON.parse(JSON.stringify(sh));
      });
      return { data: sheetOut(result!), summary: `Updated the sheet “${result!.name}”` };
    },
  }),

  defineTool({
    name: 'crm_rows',
    title: 'Add, update or delete People & Brands rows',
    description:
      'Rows are objects keyed by column name: {"Name": "Ada Lovelace", "Company / brand": "Analytical Co", "Stage": "Contacted", "Fee": 1500, "Next follow-up": "2026-11-03", "Tags": ["AI", "Podcast"], "Campaign": "Launch"}. Select values are option labels (new labels become options), dates YYYY-MM-DD, campaign columns take a campaign name or id, null clears a value. "update" items need the row id (from crm_read). Never invent real people’s contact details.',
    destructive: true,
    global: true,
    input: obj({
      sheet: str('sheet name or id'),
      add: opt(arr(anyObj('row values by column name'))),
      update: opt(arr(anyObj('{ "id": "row id", "Column": value, … }'))),
      delete: opt(arr(str('row id'))),
      createColumns: opt(bool('add unknown column names as text columns instead of failing')),
    }),
    run(a: { sheet: string; add?: Record<string, unknown>[]; update?: Record<string, unknown>[]; delete?: string[]; createColumns?: boolean }) {
      const s = space();
      const sh0 = findSheet(s.crm ?? [], a.sheet);
      if (!a.add?.length && !a.update?.length && !a.delete?.length) fail('Pass add, update or delete.');
      for (const u of a.update ?? []) if (typeof u.id !== 'string' || !sh0.rows.some((r) => r.id === u.id)) fail(`update: no row "${String(u.id)}" in "${sh0.name}". Use crm_read to get row ids.`);
      const added: string[] = [];
      let sheetName = sh0.name;
      updateSpace((d) => {
        const sh = d.crm.find((x) => x.id === sh0.id) as unknown as CrmSheet;
        sheetName = sh.name;
        for (const v of a.add ?? []) {
          const row = makeRow();
          applyValues(sh, v, row.values, { campaigns: s.campaigns, createColumns: a.createColumns });
          sh.rows.push(row);
          added.push(row.id);
        }
        for (const u of a.update ?? []) {
          const row = sh.rows.find((r) => r.id === u.id)!;
          applyValues(sh, u, row.values, { campaigns: s.campaigns, createColumns: a.createColumns });
          row.updatedAt = new Date().toISOString();
        }
        if (a.delete?.length) {
          const del = new Set(a.delete);
          sh.rows = sh.rows.filter((r) => !del.has(r.id));
        }
      });
      const parts = [added.length && `added ${plural(added.length, 'row')}`, a.update?.length && `updated ${plural(a.update.length, 'row')}`, a.delete?.length && `deleted ${plural(a.delete.length, 'row')}`].filter(Boolean);
      return { data: clean({ sheet: sheetName, added: added.length ? added : undefined, updated: a.update?.length, deleted: a.delete?.length }), summary: `${sheetName}: ${parts.join(', ')}` };
    },
  }),

  defineTool({
    name: 'add_resource',
    title: 'Add a downloadable resource (file)',
    description:
      'Stores a downloadable resource in Brand Kit & Assets → Links & documents — optionally in a campaign ("Resources in this campaign"): lead magnets / gated resources, sequence maps, template docs, playbooks, one-pagers, guides, checklists, slide decks. The file comes from text you write (Markdown, HTML, CSV, plain text — pass fileName with the extension, e.g. "Launch playbook.md"), base64 data, or an absolute path on this computer. Without a file it creates a link / placeholder resource (pass url). With assetId it puts the file on an existing asset instead.',
    global: true,
    input: obj({
      name: opt(str('display name (default: the file name)')),
      campaignId: opt(str('campaign id or name')),
      resourceType: opt(enm(RESOURCE_TYPES.map((t) => t.value) as ResourceType[])),
      gated: opt(bool('given in exchange for an email / opt-in')),
      url: opt(str('landing page / Drive / Notion link')),
      notes: opt(str()),
      tags: opt(arr(str())),
      fileName: opt(str('file name with extension (required with text or base64)')),
      text: opt(str('file contents as text')),
      base64: opt(str('file contents as base64')),
      path: opt(str('absolute path of a file on this computer')),
      assetId: opt(str('existing asset to attach the file to')),
    }),
    async run(a: { name?: string; campaignId?: string; resourceType?: ResourceType; gated?: boolean; url?: string; notes?: string; tags?: string[]; fileName?: string; text?: string; base64?: string; path?: string; assetId?: string }) {
      const s = space();
      const sources = [a.text, a.base64, a.path].filter((x) => x != null && x !== '').length;
      if (sources > 1) fail('Pass only one of text, base64 or path.');
      let campaignId: string | undefined;
      if (a.campaignId) {
        const r = a.campaignId.trim().toLowerCase();
        const c = s.campaigns.find((x) => x.id === a.campaignId) ?? s.campaigns.find((x) => x.name.toLowerCase() === r);
        if (!c) fail(`No campaign "${a.campaignId}". Campaigns: ${s.campaigns.map((x) => x.name).join(', ') || 'none yet'}.`);
        campaignId = c.id;
      }
      const target = a.assetId ? s.assets.find((x) => x.id === a.assetId || x.name.toLowerCase() === a.assetId!.toLowerCase()) : undefined;
      if (a.assetId && !target) fail(`No asset "${a.assetId}".`);
      if (!a.assetId && !a.name?.trim() && !a.fileName && !a.path) fail('Pass a name (or a file).');

      let file: { stored: string; fileName: string; size: number } | undefined;
      if (sources === 1) {
        let bytes: Uint8Array;
        let fileName = a.fileName?.trim() || '';
        if (a.path) {
          const mcp = window.prepro?.mcp;
          if (!mcp) fail('Reading files needs the desktop app.');
          const f = await mcp.readFile(a.path);
          bytes = f.data;
          fileName = fileName || f.name;
        } else {
          if (!fileName || !fileName.includes('.')) fail('Pass fileName with an extension, e.g. "Launch playbook.md".');
          if (a.text != null) bytes = new TextEncoder().encode(a.text);
          else {
            const b64 = a.base64!.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
            const bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          }
        }
        const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'bin';
        file = { stored: await importAssetBytes(bytes, ext), fileName, size: bytes.length };
      }

      const id = target?.id ?? uid('asset');
      updateSpace((d) => {
        let it = d.assets.find((x) => x.id === id);
        if (!it) {
          it = { id, kind: 'resource', name: a.name?.trim() || (file?.fileName ?? 'Resource').replace(/\.[^.]+$/, '') } as never;
          d.assets.push(it!);
        }
        const x = it!;
        if (a.name?.trim() && target) x.name = a.name.trim();
        if (file) {
          x.file = file.stored;
          x.fileName = file.fileName;
          x.fileSize = file.size;
          if (x.kind === 'link' || x.kind === 'other') x.kind = 'resource';
        }
        if (campaignId) x.campaignId = campaignId;
        if (a.resourceType) x.resourceType = a.resourceType;
        else if (!x.resourceType && x.kind === 'resource') x.resourceType = guessResourceType(file?.fileName ?? x.name);
        if (a.gated != null) x.gated = a.gated || undefined;
        if (a.url) x.url = a.url;
        if (a.notes) x.notes = a.notes;
        if (a.tags?.length) x.tags = a.tags;
      });
      const camp = campaignId ? s.campaigns.find((c) => c.id === campaignId)?.name : undefined;
      return {
        data: clean({ id, file: file?.fileName, size: file?.size, campaign: camp }),
        summary: `${target ? 'Attached a file to' : 'Added the resource'} “${a.name?.trim() || target?.name || file?.fileName}”${camp ? ` (${camp})` : ''}`,
      };
    },
  }),
];
