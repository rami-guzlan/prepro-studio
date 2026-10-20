/* App-level tools: projects, navigation, undo / redo, screenshots. */
import { activeBoardId, getBoards } from '@/modules/script/mind/ops';
import type { ProjectType } from '@/types';
import { backend } from '@/backend';
import { navigate, navigateSpace, openPrint, useApp, type ModuleId, type SpaceModuleId } from '@/store/app';
import { redo as storeRedo, undo as storeUndo, update, useProjectStore } from '@/store/project';
import { spaceRedo, spaceUndo, useSpaceStore } from '@/store/space';
import { SPACE_MODULES } from '@/spaces/registry';
import { getSpacePrintDoc } from '@/spaces/print/registry';
import { openContent, type ContentTab } from '@/spaces/ui';
import { syncCharactersDraft } from '@/derived/script';
import { MODULES } from '@/modules/registry';
import { PROJECT_TYPES } from '@/lib/constants';
import { uid } from '@/lib/id';
import { getPrintDoc } from '@/print/registry';
import { AV_TYPES } from '@/store/defaults';
import { createAndOpen, deleteProject, leaveProject, openDemo, openProjectById } from '@/shell/projectActions';
import { clean, fail, journal, model, openKind, project } from '../ctx';
import { defineTool } from '../tool';
import { anyObj, bool, enm, obj, opt, str } from '../schema';

/** Brainstorm boards of the open document ("Name (active)"), for get_app_state. */
function boardNames(): string[] | undefined {
  const bs = getBoards();
  if (!bs.length) return undefined;
  const active = activeBoardId();
  return bs.map((b) => `${b.name} — ${b.notes.length} note${b.notes.length === 1 ? '' : 's'}${b.id === active ? ' (active)' : ''}`);
}

const MODULE_IDS = MODULES.map((m) => m.id) as ModuleId[];
const SPACE_MODULE_IDS = SPACE_MODULES.map((m) => m.id) as SpaceModuleId[];
const SPACE_NAV_PARAMS: Partial<Record<SpaceModuleId, string>> = {
  strategy: 'tab ("goals" | "audience" | "pillars" | "messaging" | "tactics" | "notes")',
  content: 'stage, contentId',
  calendar: 'date (YYYY-MM-DD)',
  campaigns: 'campaignId',
  production: 'shootId',
};

const NAV_PARAMS: Partial<Record<ModuleId, string>> = {
  script: 'tab ("script" | "titlepage" | "cards" | "mind"), sceneId',
  storyboard: 'sceneId, shotId',
  shots: 'sceneId, shotId',
  lighting: 'diagramId',
  cast: 'castId, characterId, tab ("characters" | "cast" | "sizes")',
  crew: 'crewId',
  contacts: 'contactId',
  locations: 'locationId, view ("sets")',
  breakdown: 'sceneId',
  elements: 'elementId',
  schedule: 'sceneId, dayId',
  callsheets: 'dayId',
  tasks: 'taskId, tab ("milestones")',
  post: 'tab ("schedule" | "deliverables" | "graphics" | "music" | "vfx" | "adr" | "notes" | "workflow")',
};

async function findProject(ref: string) {
  const list = await backend.listProjects();
  const hit = list.find((p) => p.id === ref) ?? list.filter((p) => p.title.toLowerCase() === ref.toLowerCase())[0] ?? list.find((p) => p.title.toLowerCase().includes(ref.toLowerCase()));
  if (!hit) fail(`No project "${ref}". Call list_projects.`);
  return hit;
}

export const appTools = [
  defineTool({
    name: 'get_app_state',
    title: 'What is open in PrePro Studio',
    description: 'Start here. Shows what is open — a production project or a Marketing Space (or the library) — the screen the user is looking at, the modules, save status and the agent’s recent changes.',
    readOnly: true,
    global: true,
    input: obj({}),
    async run() {
      const st = useProjectStore.getState();
      const app = useApp.getState();
      const kind = openKind();
      const p = kind === 'project' ? st.project : null;
      const sp = kind === 'space' ? useSpaceStore.getState() : null;
      const info = await backend.info();
      const m = p ? model(p) : null;
      if (sp?.space) {
        const s = sp.space;
        return {
          data: clean({
            app: { version: info.version, projectsFolder: info.projectsDir },
            screen: { module: app.spaceModuleId, label: SPACE_MODULES.find((x) => x.id === app.spaceModuleId)?.label, params: Object.keys(app.params ?? {}).length ? app.params : undefined },
            openSpace: clean({ id: s.id, title: s.meta.title, type: s.meta.type, description: s.meta.description, content: s.content.length, channels: s.channels.map((c) => c.name), linkedProjects: s.projectIds.length || undefined, ideaBoards: boardNames(), demo: s.meta.demo || undefined }),
            saved: sp.version === sp.savedVersion ? 'all changes saved' : 'saving soon',
            undo: { canUndo: sp.past.length > 0, canRedo: sp.future.length > 0 },
            recentAgentChanges: journal.slice(-6).map((j) => j.summary),
            modules: SPACE_MODULES.map((x) => clean({ id: x.id, label: x.label, about: x.description, showParams: SPACE_NAV_PARAMS[x.id] })),
            note: 'A Marketing Space is open: the generic data tools work on its collections (content, posts, channels, pillars, goals, campaigns, milestones, shoots, assets …). Project tools (script, lighting, schedule, call sheets) need a project open.',
          }),
        };
      }
      return {
        data: clean({
          app: { version: info.version, projectsFolder: info.projectsDir },
          screen: app.view === 'project' && p ? { module: app.moduleId, label: MODULES.find((x) => x.id === app.moduleId)?.label, params: Object.keys(app.params ?? {}).length ? app.params : undefined } : 'library (no project or space open)',
          openProject: p
            ? clean({
                id: p.id,
                title: p.meta.title,
                type: p.meta.projectType,
                status: p.meta.status,
                scriptMode: p.script.mode,
                scenes: m!.scenes.length,
                pages: m!.pageCount,
                shootDays: p.schedule.days.length,
                mindBoards: boardNames(),
                demo: p.meta.demo || undefined,
              })
            : undefined,
          saved: p ? (st.version === st.savedVersion ? 'all changes saved' : 'saving soon') : undefined,
          undo: p ? { canUndo: st.past.length > 0, canRedo: st.future.length > 0 } : undefined,
          recentAgentChanges: journal.slice(-6).map((j) => j.summary),
          modules: MODULES.map((x) => clean({ id: x.id, label: x.label, about: x.description, showParams: NAV_PARAMS[x.id] })),
        }),
      };
    },
  }),

  defineTool({
    name: 'list_projects',
    title: 'List projects',
    description: 'All projects in the library (most recently edited first) with id, title, type, status and which one is open.',
    readOnly: true,
    global: true,
    input: obj({}),
    async run() {
      const open = useProjectStore.getState().project?.id;
      const list = await backend.listProjects();
      return { data: list.map((p) => clean({ id: p.id, title: p.title, subtitle: p.subtitle, type: p.projectType, status: p.status, updated: p.updatedAt.slice(0, 10), demo: p.demo || undefined, open: p.id === open || undefined })) };
    },
  }),

  defineTool({
    name: 'open_project',
    title: 'Open a project',
    description: 'Opens a project (by id or title) in the app, optionally on a module. Every other tool works on the open project.',
    global: true,
    noStep: true,
    input: obj({ projectId: str('project id or title'), module: opt(enm(MODULE_IDS)) }),
    async run(a: { projectId: string; module?: ModuleId }) {
      const hit = await findProject(a.projectId);
      await openProjectById(hit.id, a.module);
      const p = useProjectStore.getState().project;
      if (p?.id !== hit.id) fail(`Could not open “${hit.title}”.`);
      return { data: { opened: hit.id, title: hit.title }, summary: `Opened “${hit.title}”` };
    },
  }),

  defineTool({
    name: 'create_project',
    title: 'Create a project',
    description:
      'Creates and opens a new project. projectType picks templates (checklist, budget lines, gear, deliverables, post schedule; trailers get a beat structure and mini-docs a story structure in the A/V script). start "blank" skips templates. copyFrom copies branding, cast & characters, crew & contacts and/or locations from another project (e.g. a trailer for a film already planned).',
    global: true,
    noStep: true,
    input: obj({
      title: str(),
      projectType: enm(PROJECT_TYPES.map((t) => t.value) as ProjectType[]),
      start: opt(enm(['template', 'blank'] as const)),
      scriptMode: opt(enm(['screenplay', 'av'] as const, `default: av for ${AV_TYPES.join(', ')}; screenplay otherwise`)),
      color: opt(str('#rrggbb accent colour')),
      meta: opt(anyObj('initial project info, e.g. {"logline": "…", "client": "…", "director": "…", "targetRuntime": "02:00"}')),
      copyFrom: opt(obj({ projectId: str('id or title'), branding: opt(bool()), cast: opt(bool()), crew: opt(bool()), locations: opt(bool()) })),
    }),
    async run(a: { title: string; projectType: ProjectType; start?: 'template' | 'blank'; scriptMode?: 'screenplay' | 'av'; color?: string; meta?: Record<string, unknown>; copyFrom?: { projectId: string; branding?: boolean; cast?: boolean; crew?: boolean; locations?: boolean } }) {
      const src = a.copyFrom ? await findProject(a.copyFrom.projectId) : null;
      const p = await createAndOpen(
        { title: a.title, projectType: a.projectType, withTemplates: a.start !== 'blank', scriptMode: a.scriptMode, color: a.color },
        src ? { sourceId: src.id, branding: !!a.copyFrom!.branding, cast: !!a.copyFrom!.cast, crew: !!a.copyFrom!.crew, locations: !!a.copyFrom!.locations } : undefined,
      );
      if (!p) fail('Could not create the project.');
      if (a.meta && Object.keys(a.meta).length) {
        const allowed = ['subtitle', 'logline', 'synopsis', 'client', 'productionCompany', 'director', 'producer', 'writer', 'aspectRatio', 'resolution', 'frameRate', 'targetRuntime', 'shootStart', 'shootEnd', 'deliveryDate', 'status'];
        const bad = Object.keys(a.meta).filter((k) => !allowed.includes(k));
        if (bad.length) fail(`Project created, but meta fields ${bad.join(', ')} are unknown (allowed: ${allowed.join(', ')}). Use set_fields to fill them.`);
        update((d) => {
          for (const [k, v] of Object.entries(a.meta!)) if (v != null) (d.meta as any)[k] = String(v);
          if (a.meta!.writer && !d.script.titlePage.authors) d.script.titlePage.authors = String(a.meta!.writer);
          syncCharactersDraft(d);
        });
      }
      return { data: { id: p.id, title: a.title, scriptMode: useProjectStore.getState().project?.script.mode }, summary: `Created project “${a.title}”` };
    },
  }),

  defineTool({
    name: 'close_project',
    title: 'Close the project',
    description: 'Saves and closes the open project and shows the project library.',
    noStep: true,
    input: obj({}),
    async run() {
      const t = project().meta.title;
      await leaveProject();
      return { data: { closed: t }, summary: `Closed “${t}”` };
    },
  }),

  defineTool({
    name: 'open_demo_project',
    title: 'Open the demo project',
    description: 'Opens the built-in demo production “The Last Take” (every module filled in) — handy to see how a complete project looks. Built the first time.',
    global: true,
    noStep: true,
    input: obj({}),
    async run() {
      await openDemo();
      const p = useProjectStore.getState().project;
      if (!p) fail('The demo could not be opened.');
      return { data: { id: p.id, title: p.meta.title }, summary: 'Opened the demo project' };
    },
  }),

  defineTool({
    name: 'duplicate_project',
    title: 'Duplicate a project',
    description: 'Copies a whole project (with images) under a new title. The copy is not opened.',
    global: true,
    noStep: true,
    input: obj({ projectId: str('id or title'), title: opt(str('title of the copy (default “<title> (copy)”)')) }),
    async run(a: { projectId: string; title?: string }) {
      const src = await findProject(a.projectId);
      const id = uid('prj');
      const title = a.title || `${src.title} (copy)`;
      await backend.duplicateProject(src.id, id, title);
      return { data: { id, title }, summary: `Duplicated “${src.title}”` };
    },
  }),

  defineTool({
    name: 'delete_project',
    title: 'Delete a project',
    description: 'Moves a project folder to the Windows Recycle Bin (restorable from there). Only do this when the user explicitly asked to delete that project. Requires confirm: true.',
    global: true,
    noStep: true,
    destructive: true,
    input: obj({ projectId: str('id or title'), confirm: bool('must be true') }),
    async run(a: { projectId: string; confirm: boolean }) {
      if (a.confirm !== true) fail('Set confirm: true after the user has explicitly asked to delete this project.');
      const hit = await findProject(a.projectId);
      await deleteProject(hit.id);
      return { data: { deleted: hit.id, title: hit.title, where: backend.kind === 'electron' ? 'Recycle Bin' : 'removed' }, summary: `Deleted “${hit.title}”` };
    },
  }),

  defineTool({
    name: 'show_in_app',
    title: 'Show something to the user',
    description:
      'Switches the app to a module of the open project or space (optionally a specific item, e.g. {"sceneId": "…"} in script, {"dayId": "…"} in callsheets, {"tab": "mind"} in script; in spaces {"date": "…"} in calendar, {"tab": "goals"} in strategy), opens a space content piece in its editor (content), or opens the print preview of a document, so the user sees what you are talking about.',
    readOnly: true,
    noStep: true,
    global: true,
    input: obj({
      module: opt(enm([...new Set([...MODULE_IDS, ...SPACE_MODULE_IDS])] as string[])),
      params: opt(anyObj('module parameters (see get_app_state → modules.showParams)')),
      content: opt(obj({ contentId: str(), tab: opt(enm(['brief', 'write', 'produce', 'publish', 'results'] as const)) }, 'spaces: open a content piece in the editor')),
      document: opt(obj({ docId: str(), options: opt(anyObj()) })),
    }),
    run(a: { module?: string; params?: Record<string, unknown>; content?: { contentId: string; tab?: ContentTab }; document?: { docId: string; options?: Record<string, unknown> } }) {
      const kind = openKind();
      if (!kind) fail('Nothing is open. Open a project or a space first.');
      if (!a.module && !a.document && !a.content) fail('Pass a module, a content piece or a document.');
      if (kind === 'space') {
        if (a.module) {
          if (!SPACE_MODULE_IDS.includes(a.module as SpaceModuleId)) fail(`"${a.module}" is not a space module. Space modules: ${SPACE_MODULE_IDS.join(', ')}`);
          navigateSpace(a.module as SpaceModuleId, a.params ?? {});
        }
        if (a.content) {
          const s = useSpaceStore.getState().space!;
          const c = s.content.find((x) => x.id === a.content!.contentId) ?? s.content.find((x) => x.title.toLowerCase() === a.content!.contentId.toLowerCase());
          if (!c) fail(`Unknown content piece "${a.content.contentId}".`);
          openContent(c.id, a.content.tab ?? 'brief');
        }
        if (a.document) {
          if (!getSpacePrintDoc(a.document.docId)) fail(`Unknown space document ${a.document.docId} (list_documents).`);
          openPrint(a.document.docId, a.document.options);
        }
        return { data: { showing: a.document ? `print preview: ${a.document.docId}` : a.content ? `content editor: ${a.content.contentId}` : a.module } };
      }
      if (a.content) fail('content works in Marketing Spaces; a project is open.');
      if (a.module) {
        if (!MODULE_IDS.includes(a.module as ModuleId)) fail(`"${a.module}" is not a project module. Project modules: ${MODULE_IDS.join(', ')}`);
        navigate(a.module as ModuleId, a.params ?? {});
      }
      if (a.document) {
        if (!getPrintDoc(a.document.docId)) fail(`Unknown document ${a.document.docId}`);
        openPrint(a.document.docId, a.document.options);
      }
      return { data: { showing: a.document ? `print preview: ${a.document.docId}` : a.module } };
    },
  }),

  defineTool({
    name: 'undo',
    title: 'Undo',
    description: 'Undoes the last change, like Ctrl+Z in the app. If it was one of your own changes (nothing changed since), it is fully reverted, including screenplay text; otherwise the app’s most recent change is undone (screenplay text has its own undo in the script editor).',
    noStep: true,
    global: true,
    input: obj({}),
    run() {
      const kind = openKind();
      if (!kind) fail('Nothing is open.');
      const last = journal[journal.length - 1];
      if (kind === 'space') {
        const sp = useSpaceStore.getState();
        if (last && last.kind === 'space' && last.projectId === sp.space!.id && last.version === sp.version) {
          journal.pop();
          spaceUndo();
          return { data: { undone: last.summary }, summary: `Undid: ${last.summary}` };
        }
        if (!spaceUndo()) return { text: 'Nothing to undo.' };
        return { data: { undone: 'the most recent change in the space' }, summary: 'Undid the last change' };
      }
      const p = project();
      const st = useProjectStore.getState();
      if (last && last.kind === 'project' && last.projectId === p.id && last.version === st.version) {
        journal.pop();
        storeUndo();
        if (last.scriptBefore !== undefined) {
          update(
            (d) => {
              d.script.doc = last.scriptBefore as any;
              d.script.revision = (d.script.revision ?? 0) + 1;
              syncCharactersDraft(d);
            },
            { history: false },
          );
        }
        return { data: { undone: last.summary }, summary: `Undid: ${last.summary}` };
      }
      if (!storeUndo()) return { text: 'Nothing to undo.' };
      return { data: { undone: 'the most recent change in the app' }, summary: 'Undid the last change' };
    },
  }),

  defineTool({
    name: 'redo',
    title: 'Redo',
    description: 'Redoes the last undone change (Ctrl+Y).',
    noStep: true,
    global: true,
    input: obj({}),
    run() {
      const kind = openKind();
      if (!kind) fail('Nothing is open.');
      if (kind === 'space') {
        if (!spaceRedo()) return { text: 'Nothing to redo.' };
        return { data: { redone: true }, summary: 'Redid the last change' };
      }
      if (!storeRedo()) return { text: 'Nothing to redo.' };
      return { data: { redone: true }, summary: 'Redid the last change' };
    },
  }),

  defineTool({
    name: 'screenshot_app',
    title: 'See the app window',
    description: 'Returns a screenshot of the PrePro Studio window as the user sees it right now.',
    readOnly: true,
    global: true,
    noStep: true,
    input: obj({}),
    async run() {
      const m = window.prepro?.mcp;
      if (!m) fail('Screenshots need the desktop app.');
      const shot = await m.capture(1400);
      return { text: `PrePro Studio window (${shot.width}×${shot.height})`, images: [{ data: shot.data, mimeType: shot.mimeType }] };
    },
  }),
];
