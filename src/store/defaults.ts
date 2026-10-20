import type {
  ElementFlow,
  ElementType,
  PaperSize,
  ProjectData,
  ProjectSettings,
  ProjectType,
  ScriptFormatSettings,
} from '@/types';
import { SCHEMA_VERSION } from '@/types';
import { uid } from '@/lib/id';
import { newBoard, normalizeMind } from '@/lib/mind';
import { templateAvRows, templateBudget, templateDeliverables, templateGear, templateGraphics, templatePostSchedule, templateTasks } from '@/templates';

/** Final Draft-style Enter/Tab element flow. */
export function defaultFlow(): Record<ElementType, ElementFlow> {
  return {
    scene_heading: { enter: 'action', enterEmpty: 'action', tab: 'action', tabEmpty: 'action', shiftTabEmpty: 'transition' },
    action: { enter: 'action', enterEmpty: 'scene_heading', tab: 'character', tabEmpty: 'character', shiftTabEmpty: 'scene_heading' },
    character: { enter: 'dialogue', enterEmpty: 'action', tab: 'parenthetical', tabEmpty: 'transition', shiftTabEmpty: 'action' },
    parenthetical: { enter: 'dialogue', enterEmpty: 'dialogue', tab: 'dialogue', tabEmpty: 'dialogue', shiftTabEmpty: 'character' },
    dialogue: { enter: 'action', enterEmpty: 'action', tab: 'parenthetical', tabEmpty: 'parenthetical', shiftTabEmpty: 'character' },
    transition: { enter: 'scene_heading', enterEmpty: 'scene_heading', tab: 'scene_heading', tabEmpty: 'scene_heading', shiftTabEmpty: 'character' },
    shot: { enter: 'action', enterEmpty: 'action', tab: 'action', tabEmpty: 'action', shiftTabEmpty: 'scene_heading' },
    general: { enter: 'general', enterEmpty: 'action', tab: 'action', tabEmpty: 'action', shiftTabEmpty: 'action' },
  };
}

export function defaultScriptSettings(): ScriptFormatSettings {
  return {
    font: 'Courier Prime',
    sceneNumbers: 'none',
    sceneHeadingBold: false,
    sceneHeadingSpacing: 1,
    autoContd: true,
    moreContd: true,
    firstPageNumber: false,
    smartFormat: true,
    smartType: true,
    flow: defaultFlow(),
    pageView: true,
    zoom: 0,
  };
}

function guessPaper(): PaperSize {
  try {
    const loc = (navigator.language || 'en-US').toUpperCase();
    return /-(US|CA|MX|PH|CL|CO|VE)$/.test(loc) ? 'letter' : loc === 'EN' ? 'letter' : 'a4';
  } catch {
    return 'letter';
  }
}

export function defaultSettings(): ProjectSettings {
  const paper = guessPaper();
  return {
    paperSize: paper,
    dateFormat: paper === 'letter' ? 'MDY' : 'DMY',
    timeFormat: paper === 'letter' ? '12h' : '24h',
    currency: 'USD',
    weekStartsMonday: paper !== 'letter',
    script: defaultScriptSettings(),
    print: { showProjectTitle: true, showLogo: true, confidential: false, color: true },
  };
}

export function emptyScriptDoc(): unknown {
  return { type: 'doc', content: [{ type: 'scene_heading', attrs: { sid: uid('sc') } }] };
}

export interface NewProjectOptions {
  title: string;
  projectType: ProjectType;
  /** true (default) = start from the type's template (checklist, structure, deliverables, budget, gear); false = blank project */
  withTemplates?: boolean;
  scriptMode?: 'screenplay' | 'av';
  color?: string;
}

/** Project types that default to the two-column A/V script. */
export const AV_TYPES: ProjectType[] = ['corporate', 'training', 'interview', 'documentary', 'trailer', 'minidoc'];

export function createProject(opts: NewProjectOptions): ProjectData {
  const now = new Date().toISOString();
  const withT = opts.withTemplates !== false;
  const vertical = opts.projectType === 'social';
  const scriptMode = opts.scriptMode ?? (AV_TYPES.includes(opts.projectType) ? 'av' : 'screenplay');
  return normalizeProject({
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    meta: {
      title: opts.title || 'Untitled Project',
      projectType: opts.projectType,
      status: 'development',
      logline: '',
      synopsis: '',
      aspectRatio: opts.projectType === 'feature' || opts.projectType === 'short' ? '2.39:1' : vertical ? '9:16' : '16:9',
      resolution: vertical ? '1080x1920' : '3840x2160',
      frameRate: opts.projectType === 'social' || opts.projectType === 'corporate' || opts.projectType === 'training' ? '29.97' : '23.976',
      color: opts.color ?? '#7c5cff',
      createdAt: now,
      updatedAt: now,
    },
    settings: defaultSettings(),
    script: {
      mode: scriptMode,
      doc: emptyScriptDoc(),
      titlePage: { title: (opts.title || 'Untitled').toUpperCase(), credit: 'Written by', authors: '' },
      notes: {},
      av: { rows: withT ? templateAvRows(opts.projectType) : [], videoLabel: 'VIDEO', audioLabel: 'AUDIO', showImages: true, showDurations: true },
      mind: { boards: [newBoard('Main board')] },
      revision: 0,
    },
    tasks: withT ? templateTasks(opts.projectType) : [],
    gear: withT ? templateGear(opts.projectType) : [],
    budget: { contingencyPct: 10, categories: withT ? templateBudget(opts.projectType) : [] },
    post: {
      schedule: withT ? templatePostSchedule() : [],
      deliverables: withT ? templateDeliverables(opts.projectType) : [],
      vfx: [],
      music: [],
      adr: [],
      graphics: withT ? templateGraphics(opts.projectType) : [],
      editNotes: [],
      workflow: withT ? DEFAULT_WORKFLOW : '',
    },
  } as Partial<ProjectData>);
}

export const DEFAULT_WORKFLOW = `CAMERA & MEDIA
• Camera A: ____  Codec/profile: ____  Resolution/fps: ____  Color space / LUT: ____
• Card naming: A001, A002 … (B-cam: B001 …). Audio: SD001 …
• Slate every take; timecode jam-synced at call and after lunch.

ON-SET DATA (3-2-1 rule)
• 3 copies on 2 different media, 1 kept off-site.
• Offload with checksum verification (e.g. MD5/xxHash). Log in the media log.
• Never format a card until 2 verified copies exist.

FOLDER STRUCTURE
• /01_Footage/DAY_01/A001   /02_Audio   /03_Proxies   /04_Graphics   /05_Music   /06_Exports

POST
• Proxies: ____  Editing software: ____  Project shared via: ____
• Review links & notes: ____  Versioning: v01, v02 …
• Colour pipeline: ____  Final mix spec: ____
`;

/** Make sure every field exists (older or hand-edited files). Mutates and returns the object. */
export function normalizeProject(raw: Partial<ProjectData> & Record<string, any>): ProjectData {
  const p = raw as any;
  const now = new Date().toISOString();
  p.schemaVersion = p.schemaVersion ?? SCHEMA_VERSION;
  p.id = p.id || uid('prj');
  p.meta = {
    title: 'Untitled Project',
    projectType: 'short',
    status: 'development',
    logline: '',
    synopsis: '',
    aspectRatio: '16:9',
    resolution: '3840x2160',
    frameRate: '23.976',
    color: '#7c5cff',
    createdAt: now,
    updatedAt: now,
    ...(p.meta ?? {}),
  };
  const defaults = defaultSettings();
  p.settings = {
    ...defaults,
    ...(p.settings ?? {}),
    script: { ...defaults.script, ...(p.settings?.script ?? {}) },
    print: { ...defaults.print, ...(p.settings?.print ?? {}) },
  };
  const flow = defaultFlow();
  const savedFlow = p.settings.script.flow ?? {};
  p.settings.script.flow = Object.fromEntries(
    (Object.keys(flow) as ElementType[]).map((k) => [k, { ...flow[k], ...(savedFlow[k] ?? {}) }]),
  );
  p.script = {
    mode: 'screenplay',
    doc: emptyScriptDoc(),
    titlePage: { title: (p.meta.title || '').toUpperCase(), credit: 'Written by', authors: '' },
    notes: {},
    av: { rows: [], videoLabel: 'VIDEO', audioLabel: 'AUDIO', showImages: true, showDurations: true },
    revision: 0,
    ...(p.script ?? {}),
  };
  if (!p.script.doc || (p.script.doc as any).type !== 'doc') p.script.doc = emptyScriptDoc();
  p.script.av = { rows: [], videoLabel: 'VIDEO', audioLabel: 'AUDIO', showImages: true, showDurations: true, ...(p.script.av ?? {}) };
  p.script.av.rows = Array.isArray(p.script.av.rows) ? p.script.av.rows : [];
  p.script.mind = normalizeMind(p.script.mind, 'Main board');
  p.script.notes = p.script.notes ?? {};
  p.script.titlePage = { title: '', credit: 'Written by', authors: '', ...(p.script.titlePage ?? {}) };
  p.scenes = p.scenes ?? {};
  for (const key of ['characters', 'elements', 'shots', 'diagrams', 'cast', 'crew', 'contacts', 'locations', 'gear', 'tasks', 'milestones']) {
    if (!Array.isArray(p[key])) p[key] = [];
  }
  for (const loc of p.locations) {
    loc.photos = Array.isArray(loc.photos) ? loc.photos : [];
    loc.sets = Array.isArray(loc.sets) ? loc.sets : [];
    loc.status = loc.status ?? 'scouting';
  }
  for (const d of p.diagrams) {
    d.items = Array.isArray(d.items) ? d.items : [];
    d.sceneIds = Array.isArray(d.sceneIds) ? d.sceneIds : [];
  }
  p.schedule = { days: [], ...(p.schedule ?? {}) };
  p.schedule.days = Array.isArray(p.schedule.days) ? p.schedule.days : [];
  for (const day of p.schedule.days) day.items = Array.isArray(day.items) ? day.items : [];
  p.callSheets = p.callSheets ?? {};
  for (const cs of Object.values<any>(p.callSheets)) {
    cs.castCalls = cs.castCalls ?? {};
    cs.crewCalls = cs.crewCalls ?? {};
    cs.deptNotes = cs.deptNotes ?? {};
  }
  p.budget = { contingencyPct: 10, categories: [], ...(p.budget ?? {}) };
  p.budget.categories = Array.isArray(p.budget.categories) ? p.budget.categories : [];
  for (const c of p.budget.categories) c.lines = Array.isArray(c.lines) ? c.lines : [];
  p.post = { schedule: [], deliverables: [], vfx: [], music: [], adr: [], graphics: [], editNotes: [], workflow: '', ...(p.post ?? {}) };
  for (const key of ['schedule', 'deliverables', 'vfx', 'music', 'adr', 'graphics', 'editNotes']) {
    if (!Array.isArray(p.post[key])) p.post[key] = [];
  }
  p.notes = p.notes ?? '';
  return p as ProjectData;
}
