/* ==========================================================================
   Every editable list of a project, described for the AI agent:
   where it lives in ProjectData, its fields (types, enums, references),
   defaults for new items and clean-up when items are deleted.
   The generic tools (list_items / add_items / update_items / delete_items /
   move_items) are driven entirely by this registry.
   ========================================================================== */
import type { Draft } from 'immer';
import type { ProjectData } from '@/types';
import type { ModuleId } from '@/store/app';
import {
  BREAKDOWN_CATEGORIES,
  CAST_STATUSES,
  CONTACT_CATEGORIES,
  CREW_STATUSES,
  DELIVERY_PLATFORMS,
  DEPARTMENTS,
  ELEMENT_STATUSES,
  GEAR_CATEGORIES,
  GEAR_STATUSES,
  LENSES,
  LOCATION_STATUSES,
  PHASES,
  POSITIONS_BY_DEPT,
  POST_STATUSES,
  RATE_UNITS,
  SHOT_ANGLES,
  SHOT_EQUIPMENT,
  SHOT_MOVEMENTS,
  SHOT_SIZES,
  SHOT_STATUSES,
  SOUND_TYPES,
  type Option,
} from '@/lib/constants';
import { LOCATION_KINDS, PERMIT_STATUSES } from '@/modules/locations/data';
import { GRAPHIC_KINDS, MUSIC_SOURCES, MUSIC_USAGES, VFX_COMPLEXITY, NOTE_STATUSES, ADR_REASONS } from '@/modules/post/shared';
import { UNITS } from '@/modules/budget/calc';
import { BOARD_COLORS, NOTE_COLORS, NOTE_H, NOTE_W, boardDraftFor, boardFor } from '@/modules/script/mind/ops';

export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'time' | 'enum' | 'string[]' | 'ref' | 'ref[]' | 'image' | 'image[]' | 'object' | 'object[]' | 'color';

export interface FieldSpec {
  name: string;
  type: FieldType;
  required?: boolean;
  desc?: string;
  /** enum values */
  values?: string[];
  /** suggested values for free-text fields */
  suggest?: string[];
  /** referenced collection ('scenes' = script scenes) */
  ref?: string;
  /** keys of an object field */
  keys?: string[];
  /** object fields: values are numbers (default: text) */
  numericValues?: boolean;
  /** never written by the agent */
  readOnly?: boolean;
  /** uppercase string values */
  upper?: boolean;
}

type D = Draft<ProjectData>;

export interface CollectionDef {
  name: string;
  label: string;
  module: ModuleId;
  description: string;
  /** 'record' = object keyed by id */
  kind: 'array' | 'record';
  /** nested collection: items live inside an item of another collection */
  parent?: string;
  get(p: ProjectData, parentId?: string): any[] | Record<string, any> | undefined;
  draft(d: D, parentId?: string): any[] | Record<string, any> | undefined;
  idPrefix: string;
  fields: FieldSpec[];
  /** field used to find items by name (references, show_in_app) */
  nameField?: string;
  defaults?: (p: ProjectData, parentId?: string) => Record<string, unknown>;
  /** fields hidden from list_items output (large) */
  hideInList?: string[];
  /** generic add_items disabled — message naming the tool to use instead */
  addVia?: string;
  /** navigate params to show an item */
  navParam?: string;
}

const v = (opts: readonly Option[] | readonly string[]): string[] => opts.map((o: any) => (typeof o === 'string' ? o : o.value));

function F(name: string, type: FieldType, o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec {
  return { name, type, ...o };
}

const req = { required: true };

/* ---------------------------------------------------------------- shared field sets */

const RATE = [F('rate', 'number', { desc: 'pay rate (project currency)' }), F('rateUnit', 'enum', { values: v(RATE_UNITS) })];
const CONTACT = [F('phone', 'string'), F('email', 'string'), F('address', 'text')];
const NOTES = F('notes', 'text');
const ALL_POSITIONS = Object.values(POSITIONS_BY_DEPT).flat();
const MEASUREMENT_KEYS = ['height', 'weight', 'chest', 'waist', 'hips', 'inseam', 'neck', 'sleeve', 'jacket', 'shirt', 'pants', 'dress', 'shoe', 'hat', 'glove', 'hair', 'eyes'];
const ELEMENT_CATS: string[] = BREAKDOWN_CATEGORIES.map((c) => c.id).filter((c) => c !== 'cast');

const arrDraft = (get: (d: D) => any[]) => get;

export const COLLECTIONS: CollectionDef[] = [
  /* ---------------------------------------------------------------- people */
  {
    name: 'characters',
    label: 'Characters',
    module: 'cast',
    navParam: 'characterId',
    description:
      'Roles in the script. Characters are created automatically from character cues in the screenplay; add one manually for non-speaking roles. Link the actor with castId.',
    kind: 'array',
    get: (p) => p.characters,
    draft: arrDraft((d) => d.characters),
    idPrefix: 'chr',
    nameField: 'name',
    fields: [
      F('name', 'string', { ...req, upper: true, desc: 'UPPERCASE name exactly as in character cues' }),
      F('aliases', 'string[]', { desc: 'other cue names for the same role' }),
      F('description', 'text'),
      F('age', 'string'),
      F('gender', 'string'),
      F('castId', 'ref', { ref: 'cast', desc: 'actor playing the role (cast member id or name)' }),
      F('number', 'integer', { desc: 'cast board number used on strips & call sheets' }),
      F('color', 'color'),
      NOTES,
      F('manual', 'boolean', { readOnly: true }),
    ],
    defaults: (p) => ({ manual: true, number: p.characters.reduce((m, c) => Math.max(m, c.number ?? 0), 0) + 1 }),
  },
  {
    name: 'cast',
    label: 'Cast members (actors)',
    module: 'cast',
    navParam: 'castId',
    description: 'Actors / talent. The roles they play are set on characters (characters.castId) — or pass a virtual `roles` array of character names/ids here.',
    kind: 'array',
    get: (p) => p.cast,
    draft: arrDraft((d) => d.cast),
    idPrefix: 'cast',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('roles', 'ref[]', { ref: 'characters', desc: 'virtual: characters this actor plays (sets characters.castId)' }),
      F('photo', 'image', { desc: 'headshot (asset name from import_image)' }),
      F('status', 'enum', { ...req, values: v(CAST_STATUSES) }),
      F('pronouns', 'string'),
      ...CONTACT,
      F('agent', 'string'),
      F('agency', 'string'),
      F('agentPhone', 'string'),
      F('agentEmail', 'string'),
      F('union', 'string', { suggest: ['SAG-AFTRA', 'Non-union', 'Equity', 'ACTRA'] }),
      ...RATE,
      F('availability', 'text'),
      F('measurements', 'object', { keys: MEASUREMENT_KEYS, desc: 'wardrobe sizes, e.g. {"height":"5\'8\\"","shoe":"9"}' }),
      F('dietary', 'string'),
      F('allergies', 'string'),
      F('medical', 'text'),
      F('emergencyName', 'string'),
      F('emergencyPhone', 'string'),
      F('releaseSigned', 'boolean'),
      F('contractSigned', 'boolean'),
      NOTES,
    ],
    defaults: () => ({ status: 'considering' }),
  },
  {
    name: 'crew',
    label: 'Crew members',
    module: 'crew',
    navParam: 'crewId',
    description: 'Crew by department and position. defaultCall is their usual call time on call sheets.',
    kind: 'array',
    get: (p) => p.crew,
    draft: arrDraft((d) => d.crew),
    idPrefix: 'crew',
    nameField: 'name',
    fields: [
      F('name', 'string', { ...req, desc: 'person name (may be "TBD" for an open position)' }),
      F('department', 'string', { ...req, suggest: [...DEPARTMENTS] }),
      F('position', 'string', { ...req, suggest: ALL_POSITIONS }),
      F('status', 'enum', { ...req, values: v(CREW_STATUSES) }),
      F('photo', 'image'),
      F('pronouns', 'string'),
      ...CONTACT,
      F('union', 'string'),
      ...RATE,
      F('defaultCall', 'time', { desc: "'HH:MM' 24h, or 'N/C' (not called) / 'O/C' (on call)" }),
      F('kit', 'text', { desc: 'kit / gear they bring' }),
      F('dealMemo', 'boolean'),
      F('dietary', 'string'),
      F('allergies', 'string'),
      F('emergencyName', 'string'),
      F('emergencyPhone', 'string'),
      NOTES,
    ],
    defaults: () => ({ status: 'considering', department: 'Production', position: '' }),
  },
  {
    name: 'contacts',
    label: 'Contacts & vendors',
    module: 'contacts',
    navParam: 'contactId',
    description: 'Clients, agencies, vendors, rental houses, location owners, post houses.',
    kind: 'array',
    get: (p) => p.contacts,
    draft: arrDraft((d) => d.contacts),
    idPrefix: 'ct',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('company', 'string'),
      F('role', 'string'),
      F('category', 'enum', { ...req, values: v(CONTACT_CATEGORIES) }),
      ...CONTACT,
      F('website', 'string'),
      NOTES,
    ],
    defaults: () => ({ category: 'other' }),
  },
  /* ---------------------------------------------------------------- locations & breakdown */
  {
    name: 'locations',
    label: 'Locations',
    module: 'locations',
    navParam: 'locationId',
    description:
      'Real-world places. `sets` lists the script set names (UPPERCASE, as in scene headings, e.g. "MAYA\'S APARTMENT") shot there — this is how scenes are mapped to locations for the schedule and call sheets.',
    kind: 'array',
    get: (p) => p.locations,
    draft: arrDraft((d) => d.locations),
    idPrefix: 'loc',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('address', 'text'),
      F('kind', 'enum', { values: v(LOCATION_KINDS) }),
      F('status', 'enum', { ...req, values: v(LOCATION_STATUSES) }),
      F('photos', 'image[]', { desc: 'asset names (import_image)' }),
      F('sets', 'string[]', { upper: true, desc: 'script set names shot here' }),
      F('contactName', 'string'),
      F('contactPhone', 'string'),
      F('contactEmail', 'string'),
      F('lat', 'number', { desc: 'decimal degrees (sunrise/sunset on call sheets)' }),
      F('lng', 'number'),
      F('fee', 'number'),
      F('permitRequired', 'boolean'),
      F('permitStatus', 'enum', { values: v(PERMIT_STATUSES) }),
      F('parking', 'text'),
      F('power', 'text'),
      F('restrooms', 'text'),
      F('loadIn', 'text'),
      F('wifi', 'string'),
      F('hospital', 'object', { keys: ['name', 'address', 'phone'], desc: 'nearest hospital' }),
      F('availability', 'text'),
      F('scoutNotes', 'text'),
      NOTES,
    ],
    defaults: () => ({ status: 'scouting', photos: [], sets: [] }),
  },
  {
    name: 'elements',
    label: 'Breakdown elements (props, wardrobe, vehicles, SFX…)',
    module: 'elements',
    navParam: 'elementId',
    description:
      'Everything in the script breakdown except cast. Elements appear in a scene when tagged in the script text (tag_script) or linked through sceneIds / update_scenes.elementIds.',
    kind: 'array',
    get: (p) => p.elements,
    draft: arrDraft((d) => d.elements),
    idPrefix: 'el',
    nameField: 'name',
    fields: [
      F('category', 'enum', { ...req, values: ELEMENT_CATS }),
      F('name', 'string', { ...req, upper: true }),
      F('description', 'text'),
      F('photo', 'image'),
      F('quantity', 'number'),
      F('status', 'enum', { values: v(ELEMENT_STATUSES) }),
      F('source', 'enum', { values: ['buy', 'rent', 'borrow', 'make', 'own', 'other'] }),
      F('cost', 'number'),
      F('vendor', 'string'),
      F('owner', 'string', { desc: 'responsible department or person' }),
      F('characterId', 'ref', { ref: 'characters', desc: 'wardrobe / makeup for a character' }),
      F('sceneIds', 'ref[]', { ref: 'scenes', desc: 'scenes linked manually' }),
      NOTES,
    ],
    defaults: () => ({ status: 'needed' }),
  },
  /* ---------------------------------------------------------------- visuals */
  {
    name: 'shots',
    label: 'Shots & storyboard frames',
    module: 'shots',
    navParam: 'shotId',
    description:
      'The shot list. Each shot is also a storyboard frame (its `image`). Shots are grouped by sceneId in script order; `number` is assigned automatically per scene (1, 2, 3 or 12A, 12B …) when omitted.',
    kind: 'array',
    get: (p) => p.shots,
    draft: arrDraft((d) => d.shots),
    idPrefix: 'shot',
    fields: [
      F('sceneId', 'ref', { ref: 'scenes', desc: 'scene id, scene number or heading (omit = unassigned)' }),
      F('number', 'string'),
      F('title', 'string'),
      F('description', 'text', { ...req, desc: 'what we see' }),
      F('image', 'image', { desc: 'storyboard frame (import_image)' }),
      F('drawing', 'image', { readOnly: true }),
      F('shotSize', 'string', { suggest: v(SHOT_SIZES) }),
      F('angle', 'string', { suggest: v(SHOT_ANGLES) }),
      F('movement', 'string', { suggest: v(SHOT_MOVEMENTS) }),
      F('equipment', 'string', { suggest: v(SHOT_EQUIPMENT) }),
      F('lens', 'string', { suggest: v(LENSES) }),
      F('camera', 'string', { suggest: ['A', 'B', 'C', 'D'] }),
      F('frameRate', 'string'),
      F('audio', 'text', { desc: 'dialogue / VO / sound under the frame' }),
      F('sound', 'enum', { values: v(SOUND_TYPES) }),
      F('characterIds', 'ref[]', { ref: 'characters' }),
      F('locationId', 'ref', { ref: 'locations' }),
      F('duration', 'number', { desc: 'seconds of screen time (animatic)' }),
      F('setupMinutes', 'number'),
      F('shootMinutes', 'number'),
      F('vfx', 'boolean'),
      F('diagramId', 'ref', { ref: 'diagrams' }),
      F('status', 'enum', { ...req, values: v(SHOT_STATUSES) }),
      NOTES,
    ],
    defaults: () => ({ status: 'planned', description: '' }),
  },
  {
    name: 'diagrams',
    label: 'Lighting diagrams',
    module: 'lighting',
    navParam: 'diagramId',
    description: 'Top-down lighting & camera plots. Create with lighting_create_diagram; edit items with lighting_add_items / lighting_update_items. Generic update covers name, links and notes.',
    kind: 'array',
    get: (p) => p.diagrams,
    draft: arrDraft((d) => d.diagrams),
    idPrefix: 'dgm',
    nameField: 'name',
    hideInList: ['items'],
    fields: [
      F('name', 'string', req),
      F('sceneIds', 'ref[]', { ref: 'scenes' }),
      F('shotIds', 'ref[]', { ref: 'shots' }),
      F('locationId', 'ref', { ref: 'locations' }),
      F('notes', 'text'),
      F('showGrid', 'boolean'),
      F('background', 'image', { desc: 'floor plan image under the plot' }),
      F('backgroundOpacity', 'number', { desc: '0–1' }),
      F('units', 'enum', { values: ['ft', 'm'], readOnly: true }),
      F('width', 'number', { readOnly: true }),
      F('height', 'number', { readOnly: true }),
      F('pxPerUnit', 'number', { readOnly: true }),
    ],
    addVia: 'Use lighting_create_diagram to add a diagram.',
  },
  /* ---------------------------------------------------------------- production */
  {
    name: 'shoot_days',
    label: 'Shoot days',
    module: 'schedule',
    navParam: 'dayId',
    description:
      'Days of the shooting schedule. Put scenes on days with schedule_scenes. A day without a date follows schedule.startDate (skipping weekends if schedule.skipWeekends). Each day has a call sheet (get_call_sheet).',
    kind: 'array',
    get: (p) => p.schedule.days,
    draft: arrDraft((d) => d.schedule.days),
    idPrefix: 'day',
    nameField: 'label',
    hideInList: ['items'],
    fields: [F('date', 'date'), F('label', 'string', { desc: "optional, e.g. 'Pickup day' (default 'Day N')" }), NOTES],
    defaults: () => ({ items: [] }),
  },
  {
    name: 'gear',
    label: 'Gear & equipment',
    module: 'gear',
    description: 'Equipment list with rentals and costs. Rentals cost dayRate × days (days defaults to the number of shoot days); purchases use flatCost.',
    kind: 'array',
    get: (p) => p.gear,
    draft: arrDraft((d) => d.gear),
    idPrefix: 'gear',
    nameField: 'name',
    fields: [
      F('category', 'string', { ...req, suggest: GEAR_CATEGORIES }),
      F('name', 'string', req),
      F('qty', 'number', req),
      F('source', 'enum', { ...req, values: ['owned', 'rental', 'purchase', 'borrow'] }),
      F('vendor', 'string'),
      F('dayRate', 'number'),
      F('days', 'number'),
      F('flatCost', 'number'),
      F('status', 'enum', { ...req, values: v(GEAR_STATUSES) }),
      F('serial', 'string'),
      F('assignedTo', 'ref', { ref: 'crew' }),
      F('checked', 'boolean', { desc: 'packed / checked off' }),
      F('fromDiagram', 'boolean', { readOnly: true }),
      NOTES,
    ],
    defaults: () => ({ qty: 1, source: 'rental', status: 'needed', category: 'Other' }),
  },
  {
    name: 'budget_categories',
    label: 'Budget categories',
    module: 'budget',
    description: 'Budget accounts grouped in sections: atl (above the line), btl (below the line / production), post, other. Line items are in budget_lines (parentId = category id).',
    kind: 'array',
    get: (p) => p.budget.categories,
    draft: arrDraft((d) => d.budget.categories),
    idPrefix: 'bcat',
    nameField: 'name',
    hideInList: ['lines'],
    fields: [F('code', 'string', { desc: "account code, e.g. '2100'" }), F('name', 'string', req), F('section', 'enum', { ...req, values: ['atl', 'btl', 'post', 'other'] })],
    defaults: () => ({ section: 'btl', lines: [] }),
  },
  {
    name: 'budget_lines',
    label: 'Budget line items',
    module: 'budget',
    description: 'Lines of a budget category (pass parentId = budget category id or name). Total = qty × rate × x, plus fringePct %.',
    kind: 'array',
    parent: 'budget_categories',
    get: (p, pid) => p.budget.categories.find((c) => c.id === pid)?.lines,
    draft: (d, pid) => d.budget.categories.find((c) => c.id === pid)?.lines,
    idPrefix: 'bl',
    nameField: 'description',
    fields: [
      F('description', 'string', req),
      F('qty', 'number', req),
      F('unit', 'string', { ...req, suggest: UNITS }),
      F('rate', 'number', req),
      F('x', 'number', { ...req, desc: 'multiplier, e.g. number of people' }),
      F('fringePct', 'number', { desc: 'payroll fringe % on top' }),
      F('actual', 'number', { desc: 'actual spend' }),
      NOTES,
    ],
    defaults: () => ({ qty: 1, unit: 'flat', rate: 0, x: 1 }),
  },
  {
    name: 'tasks',
    label: 'Tasks',
    module: 'tasks',
    navParam: 'taskId',
    description: 'Production checklist / to-dos by phase.',
    kind: 'array',
    get: (p) => p.tasks,
    draft: arrDraft((d) => d.tasks),
    idPrefix: 'task',
    nameField: 'title',
    fields: [
      F('title', 'string', req),
      F('phase', 'enum', { ...req, values: v(PHASES) }),
      F('status', 'enum', { ...req, values: ['todo', 'doing', 'done'] }),
      F('due', 'date'),
      F('assignee', 'string'),
      F('priority', 'enum', { values: ['low', 'normal', 'high'] }),
      NOTES,
    ],
    defaults: () => ({ phase: 'pre', status: 'todo', priority: 'normal' }),
  },
  {
    name: 'milestones',
    label: 'Milestones',
    module: 'tasks',
    description: 'Key dates (greenlight, casting done, picture lock …) shown on the overview timeline.',
    kind: 'array',
    get: (p) => p.milestones,
    draft: arrDraft((d) => d.milestones),
    idPrefix: 'ms',
    nameField: 'name',
    fields: [F('name', 'string', req), F('date', 'date'), F('phase', 'enum', { ...req, values: v(PHASES) }), F('done', 'boolean'), NOTES],
    defaults: () => ({ phase: 'pre' }),
  },
  /* ---------------------------------------------------------------- post */
  {
    name: 'post_schedule',
    label: 'Post schedule',
    module: 'post',
    description: 'Post-production phases (assembly, rough cut, picture lock, color, mix, delivery …) shown as a Gantt chart.',
    kind: 'array',
    get: (p) => p.post.schedule,
    draft: arrDraft((d) => d.post.schedule),
    idPrefix: 'pm',
    nameField: 'name',
    fields: [F('name', 'string', req), F('start', 'date'), F('end', 'date'), F('owner', 'string'), F('status', 'enum', { ...req, values: v(POST_STATUSES) }), NOTES],
    defaults: () => ({ status: 'not_started' }),
  },
  {
    name: 'deliverables',
    label: 'Deliverables',
    module: 'post',
    description: 'Final files to deliver, with technical specs.',
    kind: 'array',
    get: (p) => p.post.deliverables,
    draft: arrDraft((d) => d.post.deliverables),
    idPrefix: 'dlv',
    nameField: 'name',
    fields: [
      F('name', 'string', req),
      F('platform', 'string', { suggest: v(DELIVERY_PLATFORMS) }),
      F('resolution', 'string'),
      F('aspectRatio', 'string'),
      F('frameRate', 'string'),
      F('codec', 'string'),
      F('container', 'string'),
      F('audio', 'string', { suggest: ['Stereo', '5.1', 'Mono'] }),
      F('loudness', 'string', { suggest: ['-14 LUFS', '-16 LUFS', '-23 LUFS', '-24 LKFS'] }),
      F('captions', 'string'),
      F('duration', 'string'),
      F('due', 'date'),
      F('status', 'enum', { ...req, values: v(POST_STATUSES) }),
      NOTES,
    ],
    defaults: () => ({ status: 'not_started' }),
  },
  {
    name: 'vfx',
    label: 'VFX shots',
    module: 'post',
    description: 'Visual effects shot list.',
    kind: 'array',
    get: (p) => p.post.vfx,
    draft: arrDraft((d) => d.post.vfx),
    idPrefix: 'vfx',
    nameField: 'code',
    fields: [
      F('code', 'string', { ...req, desc: "e.g. 'VFX_010'" }),
      F('sceneId', 'ref', { ref: 'scenes' }),
      F('shotId', 'ref', { ref: 'shots' }),
      F('description', 'text', req),
      F('vendor', 'string'),
      F('complexity', 'enum', { values: v(VFX_COMPLEXITY) }),
      F('due', 'date'),
      F('status', 'enum', { ...req, values: v(POST_STATUSES) }),
      F('cost', 'number'),
      NOTES,
    ],
    defaults: (p) => ({ status: 'not_started', code: `VFX_${String((p.post.vfx.length + 1) * 10).padStart(3, '0')}` }),
  },
  {
    name: 'music_cues',
    label: 'Music cues',
    module: 'post',
    description: 'Music cue sheet.',
    kind: 'array',
    get: (p) => p.post.music,
    draft: arrDraft((d) => d.post.music),
    idPrefix: 'mc',
    nameField: 'title',
    fields: [
      F('cue', 'string', { ...req, desc: "e.g. '1M1'" }),
      F('title', 'string', req),
      F('composer', 'string'),
      F('publisher', 'string'),
      F('source', 'enum', { values: v(MUSIC_SOURCES) }),
      F('tcIn', 'string'),
      F('tcOut', 'string'),
      F('duration', 'string'),
      F('usage', 'string', { suggest: v(MUSIC_USAGES) }),
      F('license', 'string'),
      F('status', 'enum', { ...req, values: v(POST_STATUSES) }),
      NOTES,
    ],
    defaults: (p) => ({ status: 'not_started', cue: `1M${p.post.music.length + 1}` }),
  },
  {
    name: 'adr',
    label: 'ADR lines',
    module: 'post',
    description: 'Dialogue to re-record.',
    kind: 'array',
    get: (p) => p.post.adr,
    draft: arrDraft((d) => d.post.adr),
    idPrefix: 'adr',
    fields: [
      F('characterId', 'ref', { ref: 'characters' }),
      F('sceneId', 'ref', { ref: 'scenes' }),
      F('line', 'text', req),
      F('reason', 'string', { suggest: ADR_REASONS }),
      F('tc', 'string'),
      F('status', 'enum', { ...req, values: v(POST_STATUSES) }),
      NOTES,
    ],
    defaults: () => ({ status: 'not_started' }),
  },
  {
    name: 'graphics',
    label: 'Graphics & lower thirds',
    module: 'post',
    description: 'Titles, lower thirds, end cards, callouts, subtitles.',
    kind: 'array',
    get: (p) => p.post.graphics,
    draft: arrDraft((d) => d.post.graphics),
    idPrefix: 'gfx',
    nameField: 'text',
    fields: [
      F('kind', 'string', { ...req, suggest: GRAPHIC_KINDS }),
      F('text', 'string', req),
      F('subtext', 'string'),
      F('sceneId', 'ref', { ref: 'scenes' }),
      F('tcIn', 'string'),
      F('duration', 'string'),
      F('status', 'enum', { ...req, values: v(POST_STATUSES) }),
      NOTES,
    ],
    defaults: () => ({ status: 'not_started', kind: 'Lower third' }),
  },
  {
    name: 'edit_notes',
    label: 'Edit notes',
    module: 'post',
    description: 'Review notes on cuts.',
    kind: 'array',
    get: (p) => p.post.editNotes,
    draft: arrDraft((d) => d.post.editNotes),
    idPrefix: 'en',
    fields: [F('version', 'string', { desc: "e.g. 'v1 rough cut'" }), F('tc', 'string'), F('note', 'text', req), F('author', 'string'), F('status', 'enum', { ...req, values: v(NOTE_STATUSES) })],
    defaults: () => ({ status: 'open' }),
  },
  /* ---------------------------------------------------------------- script side lists */
  {
    name: 'av_rows',
    label: 'A/V script rows',
    module: 'script',
    description:
      'Two-column A/V script (corporate, documentary, trailer, mini-doc): picture on the left (video), narration / dialogue / sound on the right (audio). `segment` starts a full-width section band above the row. Set script.mode to "av" to make it the main script.',
    kind: 'array',
    get: (p) => p.script.av.rows,
    draft: arrDraft((d) => d.script.av.rows),
    idPrefix: 'av',
    fields: [
      F('segment', 'string', { desc: 'section title shown above this row' }),
      F('video', 'text', { desc: 'VIDEO column' }),
      F('audio', 'text', { desc: 'AUDIO column' }),
      F('duration', 'number', { desc: 'seconds (omit to estimate from word count)' }),
      F('image', 'image', { desc: 'thumbnail' }),
      F('shotId', 'ref', { ref: 'shots' }),
      NOTES,
    ],
    defaults: () => ({ video: '', audio: '' }),
  },
  {
    name: 'mind_boards',
    label: 'Mind Dump boards',
    module: 'script',
    description:
      'Brainstorm boards of the Mind Dump: one per idea batch or category (e.g. "Story", "Look", "Promo ideas"), each with its own free-writing text, notes, groups and arrows. mind_notes / mind_groups / mind_links and the mind_* tools work on the ACTIVE board (_active); switch or create one with mind_use_board.',
    kind: 'array',
    get: (p) => p.script.mind?.boards ?? [],
    draft: arrDraft((d) => d.script.mind.boards),
    idPrefix: 'mb',
    nameField: 'name',
    fields: [F('name', 'string', req), F('color', 'color', { suggest: BOARD_COLORS }), F('text', 'text', { desc: 'free-writing text of the board' })],
    hideInList: ['text', 'notes', 'groups', 'links'],
    defaults: (p) => ({ text: '', notes: [], groups: [], links: [], color: BOARD_COLORS[(p.script.mind?.boards.length ?? 0) % BOARD_COLORS.length] }),
  },
  {
    name: 'mind_notes',
    label: 'Mind Dump sticky notes',
    module: 'script',
    description: `Sticky notes on the ACTIVE Mind Dump board (see mind_boards). Coordinates are board pixels (note ${NOTE_W}×${NOTE_H}). Prefer mind_add_notes, which places notes automatically.`,
    kind: 'array',
    get: (p) => boardFor(p.script.mind, p.id).notes,
    draft: arrDraft((d) => boardDraftFor(d.script.mind, d.id).notes),
    idPrefix: 'idea',
    fields: [
      F('text', 'text', req),
      F('x', 'number'),
      F('y', 'number'),
      F('w', 'number'),
      F('h', 'number'),
      F('color', 'color', { suggest: NOTE_COLORS }),
      F('used', 'boolean', { desc: 'already turned into script / shots / tasks' }),
    ],
    defaults: () => ({ w: NOTE_W, h: NOTE_H, color: NOTE_COLORS[0] }),
  },
  {
    name: 'mind_groups',
    label: 'Mind Dump groups',
    module: 'script',
    description: 'Titled frames on the ACTIVE Mind Dump board; notes inside the rectangle belong to the group.',
    kind: 'array',
    get: (p) => boardFor(p.script.mind, p.id).groups,
    draft: arrDraft((d) => boardDraftFor(d.script.mind, d.id).groups),
    idPrefix: 'igrp',
    nameField: 'title',
    fields: [F('title', 'string', req), F('x', 'number', req), F('y', 'number', req), F('w', 'number', req), F('h', 'number', req), F('color', 'color')],
    defaults: () => ({ color: '#7c5cff' }),
  },
  {
    name: 'mind_links',
    label: 'Mind Dump arrows',
    module: 'script',
    description: 'Arrows between two notes of the ACTIVE Mind Dump board.',
    kind: 'array',
    get: (p) => boardFor(p.script.mind, p.id).links,
    draft: arrDraft((d) => boardDraftFor(d.script.mind, d.id).links),
    idPrefix: 'ilnk',
    fields: [F('from', 'ref', { ...req, ref: 'mind_notes' }), F('to', 'ref', { ...req, ref: 'mind_notes' })],
  },
  {
    name: 'script_notes',
    label: 'Script notes',
    module: 'script',
    description: 'Notes attached to screenplay text (add new ones with add_script_note). Use update_items to resolve them.',
    kind: 'record',
    get: (p) => p.script.notes,
    draft: (d) => d.script.notes,
    idPrefix: 'note',
    fields: [F('text', 'text', req), F('color', 'color'), F('author', 'string'), F('createdAt', 'string', { readOnly: true }), F('resolved', 'boolean')],
    addVia: 'Use add_script_note to attach a note to script text.',
  },
];

export const COLLECTION_BY_NAME: Record<string, CollectionDef> = Object.fromEntries(COLLECTIONS.map((c) => [c.name, c]));
export const COLLECTION_NAMES = COLLECTIONS.map((c) => c.name);
