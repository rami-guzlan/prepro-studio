/* Single-value project fields the agent can read / write with get_fields /
   set_fields, addressed as "<object>.<field>" (e.g. "meta.logline",
   "settings.print.watermark", "script.titlePage.authors", "notes"). */
import type { Draft } from 'immer';
import type { ProjectData } from '@/types';
import { ASPECT_RATIOS, FRAME_RATES, PROJECT_STATUSES, PROJECT_TYPES, RESOLUTIONS } from '@/lib/constants';
import type { CollectionDef, FieldSpec } from './collections';
import { boardDraftFor, boardFor } from '@/modules/script/mind/ops';

type D = Draft<ProjectData>;

export interface SingletonDef {
  path: string;
  label: string;
  get(p: ProjectData): Record<string, any>;
  draft(d: D): Record<string, any>;
  fields: FieldSpec[];
}

const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const B = (name: string, desc?: string) => F(name, 'boolean', desc ? { desc } : {});

export const SINGLETONS: SingletonDef[] = [
  {
    path: 'meta',
    label: 'Project info (title, logline, type, status, key people, format, key dates, branding)',
    get: (p) => p.meta,
    draft: (d) => d.meta,
    fields: [
      F('title', 'string', { required: true }),
      F('subtitle', 'string', { desc: 'episode / version / campaign name' }),
      F('projectType', 'enum', { values: v(PROJECT_TYPES) }),
      F('status', 'enum', { values: v(PROJECT_STATUSES) }),
      F('logline', 'text'),
      F('synopsis', 'text'),
      F('client', 'string'),
      F('productionCompany', 'string'),
      F('director', 'string'),
      F('producer', 'string'),
      F('writer', 'string'),
      F('aspectRatio', 'string', { suggest: v(ASPECT_RATIOS) }),
      F('resolution', 'string', { suggest: v(RESOLUTIONS) }),
      F('frameRate', 'string', { suggest: v(FRAME_RATES) }),
      F('targetRuntime', 'string', { desc: "'MM:SS' or 'HH:MM:SS'" }),
      F('shootStart', 'date'),
      F('shootEnd', 'date'),
      F('deliveryDate', 'date'),
      F('color', 'color', { desc: 'accent colour (#rrggbb) for covers and print headers' }),
      F('logo', 'image', { desc: 'asset name from import_image' }),
      F('poster', 'image', { desc: 'cover image shown in the project library' }),
      F('tags', 'string[]'),
    ],
  },
  {
    path: 'settings',
    label: 'Formats: paper, dates, times, currency',
    get: (p) => p.settings,
    draft: (d) => d.settings,
    fields: [
      F('paperSize', 'enum', { values: ['letter', 'a4'] }),
      F('dateFormat', 'enum', { values: ['MDY', 'DMY', 'YMD'] }),
      F('timeFormat', 'enum', { values: ['12h', '24h'] }),
      F('currency', 'string', { desc: "ISO 4217 code, e.g. 'USD', 'EUR', 'GBP'" }),
      B('weekStartsMonday'),
    ],
  },
  {
    path: 'settings.script',
    label: 'Screenplay formatting',
    get: (p) => p.settings.script,
    draft: (d) => d.settings.script,
    fields: [
      F('font', 'enum', { values: ['Courier Prime', 'Courier New'] }),
      F('sceneNumbers', 'enum', { values: ['none', 'left', 'right', 'both'] }),
      B('sceneHeadingBold'),
      F('sceneHeadingSpacing', 'integer', { desc: 'blank lines before a scene heading: 1 or 2' }),
      B('autoContd', "automatic (CONT'D)"),
      B('moreContd', "(MORE)/(CONT'D) at page breaks"),
      B('firstPageNumber'),
      B('smartFormat'),
      B('smartType'),
      F('header', 'string', { desc: "running header, e.g. 'BLUE REV. 10/18/26'" }),
      F('footer', 'string'),
      B('pageView'),
    ],
  },
  {
    path: 'settings.print',
    label: 'Print & PDF options for every document',
    get: (p) => p.settings.print,
    draft: (d) => d.settings.print,
    fields: [B('showProjectTitle'), B('showLogo'), B('confidential', 'CONFIDENTIAL in footers'), F('watermark', 'string', { desc: "diagonal watermark, e.g. 'DRAFT'" }), B('color', 'false = black & white')],
  },
  {
    path: 'script',
    label: 'Which script editor the project uses',
    get: (p) => ({ mode: p.script.mode }),
    draft: (d) => d.script,
    fields: [F('mode', 'enum', { values: ['screenplay', 'av'], desc: 'screenplay (Final Draft style) or av (two-column A/V script)' })],
  },
  {
    path: 'script.titlePage',
    label: 'Screenplay title page',
    get: (p) => p.script.titlePage,
    draft: (d) => d.script.titlePage,
    fields: [
      F('title', 'string'),
      F('credit', 'string', { desc: "e.g. 'Written by'" }),
      F('authors', 'text'),
      F('source', 'string', { desc: "e.g. 'Based on the novel by …'" }),
      F('draft', 'string', { desc: "e.g. 'First Draft'" }),
      F('draftDate', 'string'),
      F('contact', 'text', { desc: 'printed bottom-left' }),
      F('copyright', 'string'),
      F('notes', 'text', { desc: 'printed bottom-right (WGA reg …)' }),
    ],
  },
  {
    path: 'script.av',
    label: 'A/V script options',
    get: (p) => {
      const { rows, ...rest } = p.script.av;
      return rest;
    },
    draft: (d) => d.script.av,
    fields: [F('videoLabel', 'string'), F('audioLabel', 'string'), B('showImages'), B('showDurations')],
  },
  {
    path: 'script.mind',
    label: 'Mind Dump free-writing text (active board)',
    get: (p) => ({ text: boardFor(p.script.mind, p.id).text }),
    draft: (d) => boardDraftFor(d.script.mind, d.id),
    fields: [F('text', 'text', { desc: 'the brain-dump text panel' })],
  },
  {
    path: 'schedule',
    label: 'Shooting schedule settings',
    get: (p) => ({ startDate: p.schedule.startDate, skipWeekends: p.schedule.skipWeekends }),
    draft: (d) => d.schedule,
    fields: [F('startDate', 'date', { desc: 'first shoot day; undated days follow it' }), B('skipWeekends')],
  },
  {
    path: 'budget',
    label: 'Budget percentages & notes',
    get: (p) => {
      const { categories, ...rest } = p.budget;
      return rest;
    },
    draft: (d) => d.budget,
    fields: [F('contingencyPct', 'number'), F('taxPct', 'number'), F('insurancePct', 'number'), F('notes', 'text')],
  },
  {
    path: 'post',
    label: 'Post-production media workflow plan',
    get: (p) => ({ workflow: p.post.workflow }),
    draft: (d) => d.post,
    fields: [F('workflow', 'text', { desc: 'camera cards, backups, proxies, naming, DIT …' })],
  },
  {
    path: '',
    label: 'Project notes (Overview)',
    get: (p) => ({ notes: p.notes }),
    draft: (d) => d as any,
    fields: [F('notes', 'text')],
  },
];

/** Pseudo collection used to coerce singleton values with the same rules as list items. */
export function asCollection(s: SingletonDef): CollectionDef {
  return { name: s.path || 'project', label: s.label, module: 'overview', description: '', kind: 'array', get: () => [], draft: () => [], idPrefix: '', fields: s.fields };
}

export function findSingletonField(path: string): { s: SingletonDef; f: FieldSpec } | null {
  const i = path.lastIndexOf('.');
  const obj = i < 0 ? '' : path.slice(0, i);
  const key = i < 0 ? path : path.slice(i + 1);
  const s = SINGLETONS.find((x) => x.path === obj);
  const f = s?.fields.find((x) => x.name === key);
  return s && f ? { s, f } : null;
}
