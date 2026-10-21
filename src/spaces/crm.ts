/* People & Brands: the CRM-style sheets of a Marketing Space (relationships,
   leads, brand deals, collaborators, press …). Model helpers shared by the
   screen, print and the agent tools: templates, value display / parsing,
   column type conversion and CSV import / export. */
import type { ID } from '@/types';
import { uid } from '@/lib/id';
import type { Campaign, CrmColumn, CrmColumnType, CrmOption, CrmRow, CrmSheet } from './types';

/* ---------------------------------------------------------------- column types */

export const CRM_COLUMN_TYPES: { value: CrmColumnType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Names, companies, short notes' },
  { value: 'longtext', label: 'Long text', hint: 'Notes, deliverables, context' },
  { value: 'select', label: 'Single select', hint: 'Status, stage, warmth — one choice with a colour' },
  { value: 'multi', label: 'Multi-select', hint: 'Tags, topics, platforms' },
  { value: 'number', label: 'Number', hint: 'Followers, scores, counts' },
  { value: 'money', label: 'Money', hint: 'Fees, deal values (totals at the bottom)' },
  { value: 'date', label: 'Date', hint: 'Last contact, next follow-up, due dates' },
  { value: 'email', label: 'Email', hint: 'Click to write an email' },
  { value: 'phone', label: 'Phone', hint: '' },
  { value: 'url', label: 'Link', hint: 'Profiles, websites, contracts' },
  { value: 'checkbox', label: 'Checkbox', hint: 'Paid, signed, sent …' },
  { value: 'campaign', label: 'Campaign', hint: 'Links the row to one of this space’s campaigns' },
];

export const CRM_TYPE_LABEL = Object.fromEntries(CRM_COLUMN_TYPES.map((t) => [t.value, t.label])) as Record<CrmColumnType, string>;

export const OPTION_COLORS = ['#868e96', '#3e8ef7', '#15aabf', '#2fb36d', '#f08c00', '#e64980', '#7c5cff', '#e5484d', '#a05eea', '#0ca678'];
export const SHEET_COLORS = ['#7c5cff', '#3e8ef7', '#2fb36d', '#f08c00', '#e64980', '#15aabf', '#e5484d', '#868e96'];

export function makeOption(label: string, color?: string): CrmOption {
  return { id: uid('opt'), label, color };
}

function options(labels: string[], colors: string[]): CrmOption[] {
  return labels.map((l, i) => makeOption(l, colors[i % colors.length]));
}

export function makeColumn(name: string, type: CrmColumnType, extra: Partial<CrmColumn> = {}): CrmColumn {
  return { id: uid('col'), name, type, ...(type === 'select' || type === 'multi' ? { options: [] } : {}), ...extra };
}

const G = '#868e96';
const B = '#3e8ef7';
const T = '#15aabf';
const GR = '#2fb36d';
const O = '#f08c00';
const P = '#e64980';
const V = '#7c5cff';
const R = '#e5484d';

/* ---------------------------------------------------------------- templates */

export interface CrmTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  columns: () => CrmColumn[];
  /** name of the select column the board groups by */
  board?: string;
}

export const CRM_TEMPLATES: CrmTemplate[] = [
  {
    id: 'relationships',
    name: 'Relationships',
    description: 'Mentors, peers, collaborators and community members worth staying close to — with last contact and next follow-up.',
    color: V,
    board: 'Warmth',
    columns: () => [
      makeColumn('Name', 'text', { width: 180 }),
      makeColumn('Company / brand', 'text', { width: 160 }),
      makeColumn('Role', 'text', { width: 140 }),
      makeColumn('Relationship', 'select', { options: options(['Mentor', 'Peer', 'Collaborator', 'Community', 'Client', 'Partner', 'Other'], [V, B, T, GR, O, P, G]), width: 130 }),
      makeColumn('Warmth', 'select', { options: options(['Cold', 'Warm', 'Close'], [B, O, GR]), width: 100 }),
      makeColumn('Where we connect', 'multi', { options: options(['LinkedIn', 'X', 'YouTube', 'Email', 'Events', 'Community'], [B, G, R, T, O, V]), width: 160 }),
      makeColumn('Email', 'email', { width: 190 }),
      makeColumn('Profile', 'url', { width: 170 }),
      makeColumn('Last contact', 'date', { width: 120 }),
      makeColumn('Next follow-up', 'date', { width: 130 }),
      makeColumn('Notes', 'longtext', { width: 240 }),
    ],
  },
  {
    id: 'leads',
    name: 'Leads',
    description: 'People and companies who might hire you, buy from you or sponsor you — from first touch to won or lost.',
    color: B,
    board: 'Stage',
    columns: () => [
      makeColumn('Name', 'text', { width: 170 }),
      makeColumn('Company', 'text', { width: 160 }),
      makeColumn('Stage', 'select', { options: options(['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'], [G, B, T, O, GR, R]), width: 120 }),
      makeColumn('Source', 'select', { options: options(['Inbound', 'Content', 'Referral', 'Event', 'Outbound'], [GR, V, T, O, B]), width: 110 }),
      makeColumn('Value', 'money', { width: 110 }),
      makeColumn('Email', 'email', { width: 190 }),
      makeColumn('Next step', 'text', { width: 200 }),
      makeColumn('Follow-up', 'date', { width: 120 }),
      makeColumn('Campaign', 'campaign', { width: 150 }),
      makeColumn('Notes', 'longtext', { width: 240 }),
    ],
  },
  {
    id: 'brand_deals',
    name: 'Brand deals',
    description: 'Sponsorships and paid partnerships: the pitch, the deliverables, the fee, the deadline and whether it’s paid.',
    color: GR,
    board: 'Stage',
    columns: () => [
      makeColumn('Brand', 'text', { width: 160 }),
      makeColumn('Contact', 'text', { width: 150 }),
      makeColumn('Email', 'email', { width: 190 }),
      makeColumn('Stage', 'select', { options: options(['Pitched', 'Negotiating', 'Contracted', 'In production', 'Delivered', 'Paid', 'Lost'], [G, O, B, V, T, GR, R]), width: 130 }),
      makeColumn('Deliverables', 'longtext', { width: 220 }),
      makeColumn('Fee', 'money', { width: 110 }),
      makeColumn('Due', 'date', { width: 120 }),
      makeColumn('Paid', 'checkbox', { width: 70 }),
      makeColumn('Contract', 'url', { width: 160 }),
      makeColumn('Campaign', 'campaign', { width: 150 }),
      makeColumn('Notes', 'longtext', { width: 220 }),
    ],
  },
  {
    id: 'collaborations',
    name: 'Collaborations & guests',
    description: 'Collabs, podcast or video guests and co-created content — from idea to published.',
    color: T,
    board: 'Status',
    columns: () => [
      makeColumn('Name', 'text', { width: 170 }),
      makeColumn('Handle / link', 'url', { width: 170 }),
      makeColumn('Topic / idea', 'text', { width: 220 }),
      makeColumn('Status', 'select', { options: options(['Idea', 'Reached out', 'Confirmed', 'Recorded', 'Published', 'Not now'], [G, B, O, V, GR, R]), width: 120 }),
      makeColumn('Format', 'multi', { options: options(['Video', 'Podcast', 'Live', 'Post', 'Newsletter'], [R, V, O, B, T]), width: 150 }),
      makeColumn('Date', 'date', { width: 120 }),
      makeColumn('Email', 'email', { width: 190 }),
      makeColumn('Notes', 'longtext', { width: 220 }),
    ],
  },
  {
    id: 'press',
    name: 'Press & media',
    description: 'Journalists, newsletters, podcasts and outlets to pitch — and what came of it.',
    color: O,
    board: 'Status',
    columns: () => [
      makeColumn('Outlet', 'text', { width: 170 }),
      makeColumn('Contact', 'text', { width: 150 }),
      makeColumn('Email', 'email', { width: 190 }),
      makeColumn('Beat / topic', 'text', { width: 160 }),
      makeColumn('Status', 'select', { options: options(['To pitch', 'Pitched', 'Replied', 'Covered', 'Pass'], [G, B, O, GR, R]), width: 110 }),
      makeColumn('Pitched on', 'date', { width: 120 }),
      makeColumn('Coverage', 'url', { width: 170 }),
      makeColumn('Notes', 'longtext', { width: 220 }),
    ],
  },
  {
    id: 'blank',
    name: 'Blank sheet',
    description: 'Start from two columns and build your own.',
    color: G,
    columns: () => [makeColumn('Name', 'text', { width: 200 }), makeColumn('Notes', 'longtext', { width: 300 })],
  },
];

export function makeSheet(templateId: string, patch: Partial<CrmSheet> = {}): CrmSheet {
  const t = CRM_TEMPLATES.find((x) => x.id === templateId) ?? CRM_TEMPLATES[CRM_TEMPLATES.length - 1];
  const columns = t.columns();
  const board = t.board ? columns.find((c) => c.name === t.board) : undefined;
  return { id: uid('sheet'), name: t.id === 'blank' ? 'New sheet' : t.name, color: t.color, columns, rows: [], view: 'table', boardColumnId: board?.id, ...patch };
}

export function makeRow(values: Record<ID, unknown> = {}): CrmRow {
  const now = new Date().toISOString();
  return { id: uid('row'), values, createdAt: now, updatedAt: now };
}

/* ---------------------------------------------------------------- reading values */

export function optionOf(col: CrmColumn, id: unknown): CrmOption | undefined {
  return typeof id === 'string' ? col.options?.find((o) => o.id === id) : undefined;
}

/** The column that names a row (first text column). */
export function titleColumn(sheet: CrmSheet): CrmColumn | undefined {
  return sheet.columns.find((c) => c.type === 'text') ?? sheet.columns[0];
}

export function rowTitle(sheet: CrmSheet, row: CrmRow): string {
  const c = titleColumn(sheet);
  const v = c ? row.values[c.id] : undefined;
  return typeof v === 'string' && v.trim() ? v.trim() : 'Untitled';
}

/** Column the board groups by: the chosen one, else the first single select. */
export function boardColumn(sheet: CrmSheet): CrmColumn | undefined {
  return sheet.columns.find((c) => c.id === sheet.boardColumnId && c.type === 'select') ?? sheet.columns.find((c) => c.type === 'select');
}

export function isEmptyValue(v: unknown): boolean {
  return v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

/** Plain-text value for search, CSV, print and agents. */
export function displayValue(col: CrmColumn, v: unknown, ctx: { campaigns: Campaign[] }): string {
  if (isEmptyValue(v)) return '';
  switch (col.type) {
    case 'select':
      return optionOf(col, v)?.label ?? '';
    case 'multi':
      return (Array.isArray(v) ? v : [])
        .map((id) => optionOf(col, id)?.label)
        .filter(Boolean)
        .join(', ');
    case 'checkbox':
      return v ? 'Yes' : '';
    case 'campaign':
      return ctx.campaigns.find((c) => c.id === v)?.name ?? '';
    case 'number':
    case 'money':
      return typeof v === 'number' ? String(v) : String(v);
    default:
      return String(v);
  }
}

/** Date columns that mean "do something by then" (follow-ups, next steps, due dates). */
export function isFollowUpColumn(col: CrmColumn): boolean {
  return col.type === 'date' && /follow|next|due|remind|deadline/i.test(col.name);
}

/** Rows with a follow-up / due date today or earlier (skips rows marked Paid / Won / Lost / Pass …). */
export function dueRows(sheet: CrmSheet, today: string): CrmRow[] {
  const cols = sheet.columns.filter(isFollowUpColumn);
  if (!cols.length) return [];
  const closed = /^(won|lost|paid|pass|published|covered|not now|delivered)$/i;
  const status = sheet.columns.filter((c) => c.type === 'select');
  const paid = sheet.columns.filter((c) => c.type === 'checkbox' && /paid|done|closed/i.test(c.name));
  return sheet.rows.filter((r) => {
    if (status.some((c) => closed.test(optionOf(c, r.values[c.id])?.label ?? ''))) return false;
    if (paid.some((c) => r.values[c.id] === true)) return false;
    return cols.some((c) => typeof r.values[c.id] === 'string' && (r.values[c.id] as string) <= today);
  });
}

/* ---------------------------------------------------------------- writing values (agents, CSV import) */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function normDateText(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (ISO.test(s)) return s;
  const m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return undefined;
}

function numberOf(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const s = String(raw ?? '')
    .replace(/[^\d.,-]/g, '')
    .replace(/,(?=\d{3}\b)/g, '');
  if (!s) return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Find (or, with `create`, add) the option of a select / multi column by id or label. */
export function findOption(col: CrmColumn, ref: string, create: boolean): CrmOption | undefined {
  const r = ref.trim();
  if (!r) return undefined;
  const hit = col.options?.find((o) => o.id === r) ?? col.options?.find((o) => o.label.toLowerCase() === r.toLowerCase());
  if (hit || !create) return hit;
  const o = makeOption(r, OPTION_COLORS[(col.options?.length ?? 0) % OPTION_COLORS.length]);
  col.options = [...(col.options ?? []), o];
  return o;
}

/** Turn a typed / imported value into what the column stores. Throws a readable message on bad values.
    `col` may be a draft: new select options are added to it. */
export function parseValue(col: CrmColumn, raw: unknown, ctx: { campaigns: Campaign[]; createOptions?: boolean }): unknown {
  if (raw == null || raw === '') return undefined;
  switch (col.type) {
    case 'number':
    case 'money': {
      const n = numberOf(raw);
      if (n == null) throw new Error(`"${col.name}" expects a number, got ${JSON.stringify(raw)}`);
      return n;
    }
    case 'checkbox':
      return typeof raw === 'boolean' ? raw || undefined : /^(1|true|yes|y|x|✓|done|paid)$/i.test(String(raw).trim()) || undefined;
    case 'date': {
      const d = normDateText(String(raw));
      if (!d) throw new Error(`"${col.name}" expects a date (YYYY-MM-DD), got ${JSON.stringify(raw)}`);
      return d;
    }
    case 'select': {
      const o = findOption(col, String(raw), ctx.createOptions !== false);
      if (!o) throw new Error(`"${col.name}" has no option "${raw}". Options: ${(col.options ?? []).map((x) => x.label).join(', ')}`);
      return o.id;
    }
    case 'multi': {
      const parts = (Array.isArray(raw) ? raw : String(raw).split(/[,;|]/)).map((x) => String(x).trim()).filter(Boolean);
      const ids = parts.map((p) => findOption(col, p, ctx.createOptions !== false)?.id).filter((x): x is string => !!x);
      return ids.length ? [...new Set(ids)] : undefined;
    }
    case 'campaign': {
      const r = String(raw).trim();
      const c = ctx.campaigns.find((x) => x.id === r) ?? ctx.campaigns.find((x) => x.name.toLowerCase() === r.toLowerCase());
      if (!c) throw new Error(`"${col.name}": no campaign "${raw}". Campaigns: ${ctx.campaigns.map((x) => x.name).join(', ') || 'none yet'}`);
      return c.id;
    }
    default:
      return String(raw);
  }
}

/** Change a column's type, converting existing values (mutates the sheet; call inside updateSpace). */
export function convertColumn(sheet: CrmSheet, colId: ID, type: CrmColumnType, ctx: { campaigns: Campaign[] }) {
  const col = sheet.columns.find((c) => c.id === colId);
  if (!col || col.type === type) return;
  const old = { ...col, options: col.options ? [...col.options] : undefined };
  const texts = sheet.rows.map((r) => displayValue(old, r.values[colId], ctx));
  col.type = type;
  if (type === 'select' || type === 'multi') col.options = col.options ?? [];
  sheet.rows.forEach((r, i) => {
    const t = texts[i];
    let v: unknown;
    try {
      v = t ? parseValue(col, t, { campaigns: ctx.campaigns, createOptions: true }) : undefined;
    } catch {
      v = undefined;
    }
    if (v === undefined) delete r.values[colId];
    else r.values[colId] = v;
  });
}

/* ---------------------------------------------------------------- CSV */

export function sheetCsvColumns(sheet: CrmSheet, campaigns: Campaign[]) {
  return sheet.columns.map((c) => ({ header: c.name, value: (r: CrmRow) => displayValue(c, r.values[c.id], { campaigns }) }));
}

/** Build a sheet from parsed CSV rows (first row = headers); column types are guessed from the values. */
export function sheetFromCsv(name: string, table: string[][], campaigns: Campaign[]): CrmSheet {
  const [head = [], ...body] = table.filter((r) => r.some((c) => c.trim()));
  const headers = head.map((h, i) => h.trim() || `Column ${i + 1}`);
  const columns = headers.map((h, i) => {
    const vals = body.map((r) => (r[i] ?? '').trim()).filter(Boolean);
    let type: CrmColumnType = 'text';
    if (vals.length) {
      if (vals.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) type = 'email';
      else if (vals.every((v) => /^(https?:\/\/|www\.)/i.test(v))) type = 'url';
      else if (vals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) type = 'date';
      else if (vals.every((v) => /^[$€£]?\s?-?[\d,.]+$/.test(v))) type = /[$€£]/.test(vals.join('')) || /fee|value|price|amount|budget|revenue/i.test(h) ? 'money' : 'number';
      else if (vals.every((v) => /^(yes|no|true|false|x|y|n)$/i.test(v))) type = 'checkbox';
      else {
        const distinct = new Set(vals.map((v) => v.toLowerCase()));
        if (vals.length >= 4 && distinct.size <= Math.min(8, Math.ceil(vals.length / 2)) && vals.every((v) => v.length <= 24)) type = 'select';
        else if (vals.some((v) => v.length > 80 || v.includes('\n'))) type = 'longtext';
      }
    }
    return makeColumn(h, type, { width: type === 'longtext' ? 240 : type === 'checkbox' ? 80 : 160 });
  });
  const sheet: CrmSheet = { id: uid('sheet'), name, color: SHEET_COLORS[0], columns, rows: [], view: 'table' };
  for (const r of body) {
    const values: Record<ID, unknown> = {};
    columns.forEach((c, i) => {
      const raw = (r[i] ?? '').trim();
      if (!raw) return;
      try {
        const v = parseValue(c, raw, { campaigns, createOptions: true });
        if (v !== undefined) values[c.id] = v;
      } catch {
        values[c.id] = raw;
      }
    });
    sheet.rows.push(makeRow(values));
  }
  sheet.boardColumnId = columns.find((c) => c.type === 'select')?.id;
  return sheet;
}
