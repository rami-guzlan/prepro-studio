/* Mind Dump board, image import (storyboard frames, headshots, location photos,
   logos …) and lighting diagrams. */
import type { DiagramItem, IdeaNote, LightingDiagram, MindBoard } from '@/types';
import { update } from '@/store/project';
import { importImageFile } from '@/backend';
import { extToMime } from '@/lib/images';
import {
  activeBoardId,
  addBoard,
  addGroup,
  addNotes,
  findBoard,
  fitGroups,
  getBoards,
  getMind,
  setActiveBoard,
  updateBoard,
  updateGroup,
  updateNote,
  NOTE_COLORS,
  readingOrder,
  sendAsAction,
  sendAsScenes,
  sendToAv,
  sendToShots,
  sendToTasks,
  tidyByColour,
  tidyGrid,
} from '@/modules/script/mind/ops';
import { CATEGORIES, FIXTURES, KINDS, LIGHT_PURPOSES, MODIFIERS, kindDef } from '@/modules/lighting/library';
import { angleTo, cameraLetters, cameraRows, insertIndex, lightNumbers, lightRows, makeItem, newDiagram, normDeg, type P } from '@/modules/lighting/model';
import { TEMPLATES } from '@/modules/lighting/templates';
import { addLightsToGear } from '@/modules/lighting/ops';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import { activeDoc, clean, fail, itemsOf, openKind, plural, project, resolveRef } from '../ctx';
import { FORMATS } from '@/spaces/constants';
import type { ContentFormat } from '@/spaces/types';
import { getSpace } from '@/store/space';
import { defineTool } from '../tool';
import { anyObj, arr, bool, enm, num, obj, opt, str } from '../schema';

/* ================================================================ mind dump */

const SEND = ['scenes', 'action', 'av_video', 'av_audio', 'shots', 'tasks', 'content', 'milestones', 'initiatives', 'priorities', 'offers', 'leads', 'workflows'] as const;
const BIZ_SEND = { initiatives: 'growth initiatives', priorities: 'priorities', offers: 'offers', leads: 'sales leads', workflows: 'workflows' } as const;

const BOARD_ARG = 'board (idea batch / category) to work on, by name or id — it becomes the active board; omit for the active one';

/** Switch to the board named / with id `ref` (creating it when `create`); the active board when omitted. */
function pickBoard(ref: string | undefined, create: boolean): { board: MindBoard; created: boolean } {
  if (ref?.trim()) {
    const found = findBoard(ref);
    if (found) {
      setActiveBoard(found.id);
      return { board: found, created: false };
    }
    if (!create) fail(`No board "${ref}". Boards: ${getBoards().map((b) => `"${b.name}"`).join(', ')}. Create it with mind_use_board.`);
    const id = addBoard(ref.trim());
    return { board: findBoard(id)!, created: true };
  }
  return { board: getMind(), created: false };
}

const boardList = () => getBoards().map((b) => clean({ id: b.id, name: b.name, notes: b.notes.length, active: b.id === activeBoardId() || undefined }));

const mindTools = [
  defineTool({
    name: 'mind_use_board',
    title: 'Switch / create a brainstorm board',
    description:
      'The Mind Dump (project) and Ideas screen (Marketing Space) hold several boards, one per idea batch or category (e.g. "Hooks", "Trailer concepts", "BTS"), each with its own free-writing text, notes, groups and arrows. Makes a board the active one (also on screen) so mind_* tools, mind_notes / mind_groups / mind_links and the free-writing text work on it; creates it when no board has that name. Can rename or recolour it. Without "board" it just lists the boards.',
    global: true,
    input: obj({
      board: opt(str('board name or id')),
      create: opt(bool('create the board when it does not exist (default true)')),
      rename: opt(str('new name')),
      color: opt(str('board colour #rrggbb')),
    }),
    run(a: { board?: string; create?: boolean; rename?: string; color?: string }) {
      activeDoc();
      if (!a.board?.trim()) return { data: { boards: boardList() }, summary: 'Listed the boards' };
      const { board, created } = pickBoard(a.board, a.create !== false);
      if (a.rename?.trim() || a.color) updateBoard(board.id, clean({ name: a.rename?.trim() || undefined, color: a.color }), false);
      const b = findBoard(board.id)!;
      return {
        data: clean({ id: b.id, name: b.name, created: created || undefined, notes: b.notes.length, groups: b.groups.length, words: b.text.trim() ? b.text.trim().split(/\s+/).length : undefined, boards: boardList() }),
        summary: created ? `Created the board “${b.name}”` : `Switched to the board “${b.name}”`,
      };
    },
  }),

  defineTool({
    name: 'mind_add_notes',
    title: 'Add Mind Dump notes',
    description:
      'Pins ideas as sticky notes on the brainstorm board of what is open (a project\'s Script → Mind Dump, or a Marketing Space\'s Ideas board), placed automatically below existing notes. Optionally frames them in a titled group (e.g. "Story", "Look & camera", "Sound"). Use colours to cluster: ' +
      NOTE_COLORS.join(', ') +
      '.',
    global: true,
    input: obj({
      notes: { ...arr({ type: ['string', 'object'], description: 'a string, or { "text": "…", "color": "#rrggbb" }' }), minItems: 1 },
      group: opt(str('title of a new group frame around these notes')),
      color: opt(str('default colour for all notes')),
      board: opt(str(BOARD_ARG + ' (created when it does not exist)')),
    }),
    run(a: { notes: (string | { text: string; color?: string })[]; group?: string; color?: string; board?: string }) {
      activeDoc();
      const { board, created } = pickBoard(a.board, true);
      const list = a.notes.map((n) => (typeof n === 'string' ? { text: n } : n));
      if (list.some((n) => !n || typeof n.text !== 'string')) fail('Each note needs "text".');
      const ids = addNotes(
        list.map((n) => n.text),
        { color: a.color },
      );
      const colors = new Map(ids.map((id, i) => [id, list[i].color]).filter(([, c]) => !!c) as [string, string][]);
      for (const [id, c] of colors) updateNote(id, { color: c }, false);
      let groupId: string | undefined;
      if (a.group) {
        groupId = addGroup(ids);
        updateGroup(groupId, { title: a.group }, false);
      }
      return {
        data: clean({ ids, groupId, board: board.name, boardCreated: created || undefined }),
        summary: `Pinned ${plural(ids.length, 'note')} on “${board.name}”${a.group ? ` (${a.group})` : ''}`,
      };
    },
  }),

  defineTool({
    name: 'mind_organize',
    title: 'Organize the Mind Dump board',
    description: 'Arranges the board: "tidy_grid" (neat grid, optionally only noteIds), "tidy_by_colour" (one column per colour), "fit_groups" (resize group frames around their notes), "group" (frame noteIds in a new titled group).',
    global: true,
    input: obj({ action: enm(['tidy_grid', 'tidy_by_colour', 'fit_groups', 'group'] as const), noteIds: opt(arr(str())), title: opt(str('group title (action "group")')), board: opt(str(BOARD_ARG)) }),
    run(a: { action: 'tidy_grid' | 'tidy_by_colour' | 'fit_groups' | 'group'; noteIds?: string[]; title?: string; board?: string }) {
      activeDoc();
      pickBoard(a.board, false);
      const ids = a.noteIds?.map((x) => resolveRef('mind_notes', x));
      if (a.action === 'tidy_grid') tidyGrid(ids);
      else if (a.action === 'tidy_by_colour') tidyByColour();
      else if (a.action === 'fit_groups') fitGroups();
      else {
        if (!ids?.length) fail('group needs noteIds.');
        const gid = addGroup(ids);
        updateGroup(gid, { title: a.title || 'Group' }, false);
        return { data: { groupId: gid }, summary: 'Grouped Mind Dump notes' };
      }
      const m = getMind();
      return { data: { board: m.name, notes: m.notes.length, groups: m.groups.length }, summary: `“${m.name}”: ${a.action.replace(/_/g, ' ')}` };
    },
  }),

  defineTool({
    name: 'mind_send_notes',
    title: 'Turn board notes into script, content, shots or tasks',
    description:
      'Turns notes (in reading order) into real content and ticks them as used. In a project: "scenes" (each note becomes a new scene at the end of the screenplay; a first line like "INT. KITCHEN - NIGHT" becomes the heading, otherwise it becomes the index-card synopsis), "action" (action paragraphs at the end), "av_video" / "av_audio" (A/V script rows), "shots" (unassigned shots) or "tasks". In a Marketing Space: "content" (content pieces in the Idea stage; pick a format) or "milestones". In a business: "initiatives" (Growth), "priorities" (this quarter, Strategy), "offers" (Strategy), "leads" (Sales Pipeline) or "workflows" (Workflows & SOPs).',
    global: true,
    input: obj({
      noteIds: { ...arr(str()), minItems: 1 },
      to: enm(SEND),
      format: opt(enm(FORMATS.map((f) => f.value) as ContentFormat[], 'spaces, to "content": format of the new pieces (default short_video)')),
      board: opt(str(BOARD_ARG)),
    }),
    async run(a: { noteIds: string[]; to: (typeof SEND)[number]; format?: ContentFormat; board?: string }) {
      const kind = openKind();
      pickBoard(a.board, false);
      const ids = new Set(a.noteIds.map((x) => resolveRef('mind_notes', x)));
      const notes: IdeaNote[] = readingOrder(getMind().notes.filter((n) => ids.has(n.id)));
      if (kind === 'space' && getSpace().meta.kind === 'business') {
        if (!(a.to in BIZ_SEND)) fail('In a business, send notes to "initiatives", "priorities", "offers", "leads" or "workflows".');
        const m = await import('@/spaces/business/mind');
        const run = { initiatives: m.notesToInitiatives, priorities: m.notesToPriorities, offers: m.notesToOffers, leads: m.notesToDeals, workflows: m.notesToSops }[a.to as keyof typeof BIZ_SEND];
        run(notes);
        return { summary: `Turned ${plural(notes.length, 'note')} into ${BIZ_SEND[a.to as keyof typeof BIZ_SEND]}` };
      }
      if (kind === 'space') {
        const { notesToContent, notesToMilestones } = await import('@/spaces/mind');
        if (a.to === 'content') {
          const created = notesToContent(notes, { format: a.format ?? 'short_video', stage: 'idea' });
          return { data: { created }, summary: `Turned ${plural(notes.length, 'note')} into content ideas` };
        }
        if (a.to === 'milestones') {
          const created = notesToMilestones(notes);
          return { data: { created }, summary: `Turned ${plural(notes.length, 'note')} into milestones` };
        }
        fail('In a Marketing Space, send notes to "content" or "milestones".');
      }
      project();
      if (a.to === 'content' || a.to === 'milestones') fail('"content" and "milestones" are for Marketing Spaces; in a project use scenes, action, av_video, av_audio, shots or tasks.');
      if (a.to === 'scenes') sendAsScenes(notes);
      else if (a.to === 'action') sendAsAction(notes);
      else if (a.to === 'av_video') sendToAv(notes, 'video');
      else if (a.to === 'av_audio') sendToAv(notes, 'audio');
      else if (a.to === 'shots') sendToShots(notes);
      else sendToTasks(notes);
      return { data: { sent: notes.length, to: a.to }, summary: `Turned ${plural(notes.length, 'note')} into ${a.to.replace('_', ' ')}` };
    },
  }),
];

/* ================================================================ images */

function b64ToBytes(b64: string): Uint8Array {
  const clean64 = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const bin = atob(clean64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadImageBytes(src: { path?: string; url?: string; base64?: string; svg?: string; mimeType?: string }): Promise<{ bytes: Uint8Array; mime: string }> {
  const given = [src.path, src.url, src.base64, src.svg].filter((x) => x != null && x !== '').length;
  if (given !== 1) fail('Pass exactly one of path, url, base64 or svg.');
  const mcp = window.prepro?.mcp;
  if (src.svg != null) {
    if (!/<svg[\s>]/i.test(src.svg)) fail('svg must be SVG markup starting with <svg …>.');
    let svg = src.svg.trim();
    if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return { bytes: new TextEncoder().encode(svg), mime: 'image/svg+xml' };
  }
  if (src.base64 != null) {
    const m = /^data:([^;]+);base64,/.exec(src.base64);
    return { bytes: b64ToBytes(src.base64), mime: src.mimeType || m?.[1] || 'image/png' };
  }
  if (!mcp) fail('Importing files needs the desktop app.');
  if (src.path) {
    const f = await mcp.readFile(src.path);
    return { bytes: f.data, mime: extToMime(f.name.split('.').pop() || 'png') };
  }
  const r = await mcp.fetchUrl(src.url!);
  const ext = (src.url!.split('?')[0].split('.').pop() || '').toLowerCase();
  return { bytes: r.data, mime: (r.contentType || '').split(';')[0] || extToMime(ext) || 'image/jpeg' };
}

const imageTools = [
  defineTool({
    name: 'import_image',
    title: 'Import an image',
    description:
      'Stores an image in the project and (optionally) puts it on an item: a storyboard frame (collection "shots", field "image"), a headshot (cast.photo / crew.photo), a location photo (locations.photos, appended), a prop photo (elements.photo), an A/V thumbnail (av_rows.image), a floor plan (diagrams.background) or the project logo / poster (field "meta.logo" / "meta.poster"). Sources: an absolute file path, an http(s) URL, base64 data, or SVG markup — you can draw a storyboard sketch as SVG (e.g. 1600×900 for 16:9 frames). Large photos are downscaled.',
    global: true,
    input: obj({
      path: opt(str('absolute path of an image file on this computer')),
      url: opt(str('http(s) URL to download')),
      base64: opt(str('base64 image data (or a data: URL)')),
      svg: opt(str('SVG markup')),
      mimeType: opt(str('for base64: image/png, image/jpeg …')),
      attachTo: opt(
        obj({
          collection: opt(str('collection of the item (shots, cast, crew, locations, elements, av_rows, diagrams)')),
          id: opt(str('item id (or name)')),
          field: str('image field, e.g. "image", "photo", "photos", "background" — or "meta.logo" / "meta.poster" without collection'),
          replace: opt(bool('for photo lists: replace instead of append')),
        }),
      ),
    }),
    async run(a: { path?: string; url?: string; base64?: string; svg?: string; mimeType?: string; attachTo?: { collection?: string; id?: string; field: string; replace?: boolean } }) {
      const doc = activeDoc();
      const p = doc.doc;
      // validate the target before storing anything
      const t = a.attachTo;
      let target: { c?: CollectionDef; id?: string; list?: boolean; singleton?: { s: SingletonDef; f: FieldSpec } } | null = null;
      if (t) {
        if (!t.collection) {
          const i = t.field.lastIndexOf('.');
          const sd = doc.singletons.find((x) => x.path === (i < 0 ? '' : t.field.slice(0, i)));
          const f = sd?.fields.find((x) => x.name === t.field.slice(i + 1));
          if (!sd || !f || f.type !== 'image') fail(`"${t.field}" is not an image field. Use ${doc.kind === 'space' ? '"meta.logo" or "meta.cover"' : '"meta.logo" or "meta.poster"'}, or pass a collection.`);
          target = { singleton: { s: sd, f } };
        } else {
          const c = doc.byName[t.collection];
          if (!c) fail(`Unknown collection "${t.collection}".`);
          const f = c.fields.find((x) => x.name === t.field);
          if (!f || (f.type !== 'image' && f.type !== 'image[]') || f.readOnly) fail(`${t.collection}.${t.field} is not an image field (image fields: ${c.fields.filter((x) => x.type.startsWith('image') && !x.readOnly).map((x) => x.name).join(', ') || 'none'}).`);
          if (!t.id) fail('attachTo.id is required.');
          const id = resolveRef(c.name, t.id, p);
          target = { c, id, list: f.type === 'image[]' };
        }
      }
      const { bytes, mime } = await loadImageBytes(a);
      if (!/^image\//.test(mime)) fail(`Not an image (${mime}).`);
      const name = await importImageFile(new Blob([bytes as BlobPart], { type: mime }));
      if (target) {
        doc.update((d) => {
          if (target!.singleton) {
            target!.singleton.s.draft(d)[target!.singleton.f.name] = name;
            return;
          }
          const c = target!.c!;
          const raw = c.parent ? null : c.draft(d);
          let it: any = Array.isArray(raw) ? raw.find((x: any) => x.id === target!.id) : (raw as any)?.[target!.id!];
          if (!it && c.parent)
            for (const par of itemsOf(doc.byName[c.parent], d as any)) {
              it = (c.draft(d, par.id) as any[])?.find((x) => x.id === target!.id);
              if (it) break;
            }
          if (!it) return;
          if (target!.list) it[t!.field] = t!.replace ? [name] : [...(it[t!.field] ?? []), name];
          else it[t!.field] = name;
        });
      }
      return {
        data: clean({ asset: name, attachedTo: t ? `${t.collection ? `${t.collection}/${target?.id}` : ''}${t.collection ? '.' : ''}${t.field}` : undefined }),
        summary: t ? `Added an image to ${t.collection ?? ''} ${t.field}`.trim() : 'Imported an image',
      };
    },
  }),
];

/* ================================================================ lighting */

function diagramOf(id: string): LightingDiagram {
  const p = project();
  const did = resolveRef('diagrams', id, p);
  return p.diagrams.find((x) => x.id === did)!;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function itemOut(d: LightingDiagram, it: DiagramItem, nums: Map<string, number>, letters: Map<string, string>) {
  const ppu = d.pxPerUnit;
  const def = kindDef(it.kind);
  return clean({
    id: it.id,
    kind: it.kind,
    label: it.label,
    light: nums.get(it.id) ? `L${nums.get(it.id)}` : undefined,
    camera: letters.get(it.id),
    x: r1(it.x / ppu),
    y: r1(it.y / ppu),
    rotation: Math.round(it.rotation),
    size: def.shape === 'box' && it.w != null && it.h != null ? [r1(it.w / ppu), r1(it.h / ppu)] : undefined,
    points: it.points?.map(([px, py]) => [r1((it.x + px) / ppu), r1((it.y + py) / ppu)]),
    scale: it.scale !== 1 && def.shape !== 'box' ? it.scale : undefined,
    color: it.color,
    props: it.props && Object.keys(it.props).length ? it.props : undefined,
    hidden: it.hidden || undefined,
    locked: it.locked || undefined,
  });
}

type ItemInput = { kind?: string; x?: number; y?: number; rotation?: number; facing?: unknown; label?: string; size?: [number, number]; color?: string; props?: Record<string, unknown>; points?: [number, number][]; scale?: number; hidden?: boolean; locked?: boolean };

/** Point (units) for a facing target: [x, y] or another item's id / label. */
function facingPoint(d: LightingDiagram, f: unknown, extra: DiagramItem[]): P {
  if (Array.isArray(f) && f.length === 2 && f.every((n) => typeof n === 'number')) return f as P;
  if (typeof f === 'string') {
    const all = [...d.items, ...extra];
    const hit = all.find((i) => i.id === f) ?? all.find((i) => (i.label ?? '').toLowerCase() === f.toLowerCase());
    if (hit) return [hit.x / d.pxPerUnit, hit.y / d.pxPerUnit];
  }
  fail(`facing: use [x, y] in ${d.units} or the id / label of an item in the diagram (got ${JSON.stringify(f)}).`);
}

function applyInput(d: LightingDiagram, it: DiagramItem, a: ItemInput, extra: DiagramItem[]) {
  const ppu = d.pxPerUnit;
  if (a.x != null) it.x = Math.round(a.x * ppu);
  if (a.y != null) it.y = Math.round(a.y * ppu);
  if (a.size) {
    it.w = Math.round(a.size[0] * ppu);
    it.h = Math.round(a.size[1] * ppu);
  }
  if (a.points) it.points = a.points.map(([px, py]) => [Math.round(px * ppu - it.x), Math.round(py * ppu - it.y)] as [number, number]);
  if (a.facing != null) it.rotation = Math.round(angleTo([it.x / ppu, it.y / ppu], facingPoint(d, a.facing, extra)));
  if (a.rotation != null) it.rotation = normDeg(a.rotation);
  if (a.label !== undefined) it.label = a.label ?? undefined;
  if (a.color !== undefined) it.color = a.color ?? undefined;
  if (a.scale != null) it.scale = a.scale;
  if (a.hidden != null) it.hidden = a.hidden || undefined;
  if (a.locked != null) it.locked = a.locked || undefined;
  if (a.props) {
    const props = { ...(it.props ?? {}) };
    for (const [k, v] of Object.entries(a.props)) {
      if (v === null) delete props[k];
      else props[k] = v;
    }
    it.props = props;
  }
}

const ITEM_PROPS = {
  kind: opt(str('library kind, e.g. light.softbox, camera.cinema, person.actor, set.table, note.arrow (see lighting_list_kinds)')),
  x: opt(num('position in diagram units (ft or m) from the left')),
  y: opt(num('position in units from the top')),
  rotation: opt(num('degrees, 0 = facing up (top of the plot), clockwise')),
  facing: opt({ description: 'turn to face [x, y] (units) or another item (id or label, e.g. "Subject")' }),
  label: opt({ type: ['string', 'null'] }),
  size: opt({ ...arr(num()), description: 'box kinds (walls, tables, flags …): [width, depth] in units' }),
  color: opt({ type: ['string', 'null'] }),
  props: opt(anyObj('lights: purpose, fixture, watts, cct, gel, intensity (0-100), modifier, height, beam (deg), throw (units), channel, notes · cameras: lens (mm), sensor, fovLength, showFov · text: size; null removes a prop')),
  points: opt({ ...arr(arr(num())), description: 'arrows / lines: absolute points [[x,y], …] in units' }),
  scale: opt(num('symbol size multiplier')),
  hidden: opt(bool()),
  locked: opt(bool()),
};
const itemSchema = obj(ITEM_PROPS);

const lightingTools = [
  defineTool({
    name: 'lighting_list_kinds',
    title: 'Lighting diagram library',
    description: 'Lists every item you can place on a lighting diagram (cameras, lights, grip, sound, people, set pieces, annotations) with default sizes and properties, plus the diagram templates and common fixtures. Read this before building a plot.',
    readOnly: true,
    global: true,
    input: obj({ category: opt(enm(CATEGORIES.map((c) => c.id))) }),
    run({ category }: { category?: string }) {
      return {
        data: {
          coordinates: 'Positions are in diagram units (feet or metres) from the top-left corner; y grows downwards (towards camera side is up to you). rotation 0 = facing the top of the plot, clockwise. Use `facing` to aim lights and cameras at a subject.',
          kinds: KINDS.filter((k) => !category || k.category === category).map((k) =>
            clean({ kind: k.kind, label: k.label, category: k.category, shape: k.shape, defaultSize: k.size, defaultLabel: k.label0, props: k.props }),
          ),
          lightPurposes: LIGHT_PURPOSES,
          modifiers: MODIFIERS,
          fixtures: FIXTURES.map((f) => clean({ name: f.name, watts: f.watts, cct: f.cct })),
          templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description })),
        },
      };
    },
  }),

  defineTool({
    name: 'lighting_create_diagram',
    title: 'Create a lighting diagram',
    description: 'Creates a lighting / camera plot, empty or from a template (interview, dialogue, product, car …), linked to scenes, shots or a location. Returns the id and the canvas size in units.',
    input: obj({
      name: str(),
      template: opt(enm(TEMPLATES.map((t) => t.id))),
      units: opt(enm(['ft', 'm'] as const)),
      width: opt(num('room width in units (default 30 ft / 10 m)')),
      depth: opt(num('room depth in units (default 20 ft / 7 m)')),
      sceneIds: opt(arr(str())),
      shotIds: opt(arr(str())),
      locationId: opt(str()),
      notes: opt(str()),
    }),
    run(a: { name: string; template?: string; units?: 'ft' | 'm'; width?: number; depth?: number; sceneIds?: string[]; shotIds?: string[]; locationId?: string; notes?: string }) {
      const p = project();
      const d: LightingDiagram = a.template ? TEMPLATES.find((t) => t.id === a.template)!.build() : newDiagram(a.name, a.units ?? 'ft');
      d.name = a.name;
      if (a.width) d.width = Math.round(a.width * d.pxPerUnit);
      if (a.depth) d.height = Math.round(a.depth * d.pxPerUnit);
      d.sceneIds = (a.sceneIds ?? []).map((x) => resolveRef('scenes', x, p));
      d.shotIds = (a.shotIds ?? []).map((x) => resolveRef('shots', x, p));
      if (a.locationId) d.locationId = resolveRef('locations', a.locationId, p);
      if (a.notes) d.notes = a.notes;
      d.updatedAt = new Date().toISOString();
      update((dr) => void dr.diagrams.push(d as any));
      if (d.shotIds?.length)
        update((dr) => {
          for (const s of dr.shots) if (d.shotIds!.includes(s.id)) s.diagramId = d.id;
        });
      return {
        data: { id: d.id, units: d.units, width: r1(d.width / d.pxPerUnit), depth: r1(d.height / d.pxPerUnit), items: d.items.length },
        summary: `Created lighting diagram “${a.name}”`,
      };
    },
  }),

  defineTool({
    name: 'lighting_get_diagram',
    title: 'Read a lighting diagram',
    description: 'Returns a diagram with all items (positions in units, rotation, labels, light numbers L1…, camera letters, properties) and its lighting / camera tables.',
    readOnly: true,
    input: obj({ diagramId: str('diagram id or name') }),
    run({ diagramId }: { diagramId: string }) {
      const d = diagramOf(diagramId);
      const nums = lightNumbers(d.items);
      const letters = cameraLetters(d.items);
      return {
        data: clean({
          id: d.id,
          name: d.name,
          units: d.units,
          width: r1(d.width / d.pxPerUnit),
          depth: r1(d.height / d.pxPerUnit),
          sceneIds: d.sceneIds,
          shotIds: d.shotIds,
          locationId: d.locationId,
          notes: d.notes,
          items: d.items.map((it) => itemOut(d, it, nums, letters)),
          lights: lightRows(d).map((r) => clean({ n: `L${r.n}`, type: r.type, purpose: r.purpose, fixture: r.fixture, watts: r.watts, cct: r.cct, gel: r.gel, modifier: r.modifier, intensity: r.intensity })),
          cameras: cameraRows(d).map((r) => clean({ camera: r.letter, type: r.type, body: r.body, lens: r.lens ? `${r.lens}mm` : undefined, sensor: r.sensor, support: r.support, label: r.item.label })),
        }),
      };
    },
  }),

  defineTool({
    name: 'lighting_add_items',
    title: 'Add items to a lighting diagram',
    description:
      'Places cameras, lights, grip, people, set pieces and annotations on a diagram. Positions in units; `facing` aims an item at a point or at another item (also ones added in the same call, by label). Lights are numbered L1, L2 … and cameras lettered A, B … automatically.',
    input: obj({ diagramId: str(), items: { ...arr(itemSchema), minItems: 1 } }),
    run(a: { diagramId: string; items: ItemInput[] }) {
      const d = diagramOf(a.diagramId);
      const made: DiagramItem[] = [];
      const pending = { ...d, items: [...d.items] };
      for (const inp of a.items) {
        if (!inp.kind) fail('Each item needs a kind (see lighting_list_kinds).');
        if (inp.x == null || inp.y == null) fail(`${inp.kind}: x and y are required.`);
        if (kindDef(inp.kind).kind === 'unknown' && !inp.kind.includes('.')) fail(`Unknown kind "${inp.kind}". See lighting_list_kinds.`);
        const it = makeItem(inp.kind, pending, inp.x * d.pxPerUnit, inp.y * d.pxPerUnit, inp.props ? { props: inp.props } : {});
        applyInput(d, it, { ...inp, props: undefined }, made);
        made.push(it);
        pending.items.push(it);
      }
      // second pass: facing items added in this call
      update((dr) => {
        const dd = dr.diagrams.find((x) => x.id === d.id)!;
        for (const it of made) dd.items.splice(insertIndex(dd.items as DiagramItem[], it.kind), 0, it as any);
        dd.updatedAt = new Date().toISOString();
      });
      const nums = lightNumbers(pending.items);
      const letters = cameraLetters(pending.items);
      return { data: { added: made.map((it) => itemOut(d, it, nums, letters)) }, summary: `Added ${plural(made.length, 'item')} to “${d.name}”` };
    },
  }),

  defineTool({
    name: 'lighting_update_items',
    title: 'Change or remove lighting diagram items',
    description: 'Moves, rotates, re-aims, relabels or re-props items (each update is { id, …fields }; props are merged, null removes one), and/or removes items by id.',
    input: obj({ diagramId: str(), updates: opt(arr(obj({ id: str('item id'), ...ITEM_PROPS }))), remove: opt(arr(str(), 'item ids to delete')) }),
    run(a: { diagramId: string; updates?: (ItemInput & { id: string })[]; remove?: string[] }) {
      const d = diagramOf(a.diagramId);
      const byId = new Map(d.items.map((i) => [i.id, i]));
      for (const u of a.updates ?? []) if (!byId.has(u.id)) fail(`Item ${u.id} is not in “${d.name}”.`);
      for (const id of a.remove ?? []) if (!byId.has(id)) fail(`Item ${id} is not in “${d.name}”.`);
      const rm = new Set(a.remove ?? []);
      update((dr) => {
        const dd = dr.diagrams.find((x) => x.id === d.id)!;
        for (const u of a.updates ?? []) {
          const it = dd.items.find((x) => x.id === u.id);
          if (it) {
            if (u.kind && u.kind !== it.kind) it.kind = u.kind;
            applyInput(d, it as DiagramItem, u, []);
          }
        }
        if (rm.size) dd.items = dd.items.filter((x) => !rm.has(x.id));
        dd.updatedAt = new Date().toISOString();
      });
      return { data: { updated: a.updates?.length ?? 0, removed: rm.size }, summary: `Edited “${d.name}”` };
    },
  }),

  defineTool({
    name: 'lighting_add_to_gear',
    title: 'Add a diagram’s lights to the gear list',
    description: 'Adds every fixture of a lighting diagram to Gear & Equipment (category Lighting, rental), merging identical fixtures into quantities. Fixtures already added from a diagram are skipped.',
    input: obj({ diagramId: str() }),
    run({ diagramId }: { diagramId: string }) {
      const d = diagramOf(diagramId);
      const res = addLightsToGear(d.id);
      return { data: res, summary: `Added ${plural(res.added.length, 'light')} to the gear list` };
    },
  }),
];

export const visualTools = [...mindTools, ...imageTools, ...lightingTools];
