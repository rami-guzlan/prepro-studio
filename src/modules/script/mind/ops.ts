/* Mind Dump data operations: boards, notes, groups, links, tidy layouts, and
   turning notes into script content, A/V rows, shots and tasks.
   A mind dump holds several boards (idea batches / categories); every note /
   group / link operation works on the ACTIVE board of the open document.
   The same boards are used by Marketing Spaces (Ideas): edits go to the open
   space while a space is shown (see registerSpaceMindTarget). */
import type { Draft } from 'immer';
import { create } from 'zustand';
import type { IdeaGroup, IdeaLink, IdeaNote, MindBoard, MindDump, ProjectData, Shot, Task } from '@/types';
import { getProject, update as projectUpdate, useProjectStore, type UpdateOptions } from '@/store/project';
import { readLS, useApp, writeLS } from '@/store/app';
import { uid } from '@/lib/id';
import { BOARD_COLORS, boardOf, newBoard, normalizeMind } from '@/lib/mind';
import { isSceneHeadingText } from '@/script-core/heading';
import { toast } from '@/ui';

export const NOTE_W = 200;
export const NOTE_H = 130;
export const GAP = 24;

/** Sticky-note palette (light, readable in both themes). */
export const NOTE_COLORS = ['#fff3a3', '#ffd6a5', '#ffc8dd', '#cdb4ff', '#b5d8ff', '#b9f0d0', '#e9ecef', '#ffffff'];
export const GROUP_COLORS = ['#7c5cff', '#3e8ef7', '#2fb36d', '#f5a524', '#e5484d', '#e64980', '#868e96'];
export { BOARD_COLORS };

/** Boards living somewhere else than the project's script (a Marketing Space's Ideas). */
export interface MindTarget {
  /** id of the document (space id) */
  id(): string;
  get(): MindDump;
  update(recipe: (m: Draft<MindDump>) => void, opts?: UpdateOptions): void;
}

let spaceTarget: MindTarget | null = null;
export function registerSpaceMindTarget(t: MindTarget) {
  spaceTarget = t;
}

function spaceActive(): boolean {
  return !!spaceTarget && useApp.getState().view === 'space';
}

/* ---------------------------------------------------------------- active board (per document, remembered) */

interface MindUIState {
  /** document id → active board id */
  active: Record<string, string>;
}

export const useMindUI = create<MindUIState>(() => ({ active: readLS<Record<string, string>>('prepro.mind.activeBoard', {}) }));

/** Id of the open project / space whose boards are being edited. */
export function mindDocId(): string {
  if (spaceActive()) return spaceTarget!.id();
  return useProjectStore.getState().project?.id ?? '';
}

function container(): MindDump {
  if (spaceActive()) return spaceTarget!.get();
  return getProject().script.mind ?? { boards: [] };
}

export function activeBoardId(docId = mindDocId()): string | undefined {
  return boardOf(containerSafe(), useMindUI.getState().active[docId])?.id;
}

function containerSafe(): MindDump | undefined {
  try {
    return container();
  } catch {
    return undefined;
  }
}

export function setActiveBoard(boardId: string, docId = mindDocId()) {
  const active = { ...useMindUI.getState().active, [docId]: boardId };
  useMindUI.setState({ active });
  writeLS('prepro.mind.activeBoard', active);
}

/** The active board of a document's mind dump (data passed in, e.g. by agent collections). */
export function boardFor(m: MindDump | undefined, docId: string): MindBoard {
  return boardOf(m, useMindUI.getState().active[docId]) ?? EMPTY_BOARD;
}

/** Same inside a draft (creates a board if there is none). */
export function boardDraftFor(m: Draft<MindDump>, docId: string): Draft<MindBoard> {
  if (!Array.isArray(m.boards)) normalizeMind(m, 'Ideas');
  if (!m.boards.length) m.boards.push(newBoard('Ideas') as Draft<MindBoard>);
  const id = useMindUI.getState().active[docId];
  return m.boards.find((b) => b.id === id) ?? m.boards[0];
}

const EMPTY_BOARD: MindBoard = Object.freeze({ id: '', name: '', text: '', notes: [], groups: [], links: [] }) as MindBoard;

/** Find a board of the open document by id or (case-insensitive) name. */
export function findBoard(ref: string): MindBoard | undefined {
  const r = ref.trim().toLowerCase();
  const bs = getBoards();
  return bs.find((b) => b.id === ref) ?? bs.find((b) => b.name.trim().toLowerCase() === r);
}

/** Every board of the open document. */
export function getBoards(): MindBoard[] {
  return containerSafe()?.boards ?? [];
}

/** Edits of the mind dump container (all boards) of the open project / space. */
function updateContainer(recipe: (m: Draft<MindDump>) => void, opts?: UpdateOptions) {
  if (spaceActive()) {
    spaceTarget!.update(recipe, opts);
    return;
  }
  projectUpdate((d) => {
    if (!d.script.mind || !Array.isArray((d.script.mind as any).boards)) d.script.mind = normalizeMind(d.script.mind, 'Main board') as any;
    recipe(d.script.mind);
  }, opts);
}

/** Board edits: recipes only touch the board through mindDraft(d), so the open space's
    mind dump is passed in as d.script.mind while a space is shown. */
function update(recipe: (d: Draft<ProjectData>) => void, opts?: UpdateOptions) {
  if (spaceActive()) {
    spaceTarget!.update((m) => recipe({ script: { mind: m } } as unknown as Draft<ProjectData>), opts);
    return;
  }
  projectUpdate(recipe, opts);
}

/** The ACTIVE board inside a draft (project draft, or the space wrapper above). */
export function mindDraft(d: Draft<ProjectData>): Draft<MindBoard> {
  if (!d.script.mind || !Array.isArray((d.script.mind as any).boards)) d.script.mind = normalizeMind(d.script.mind, 'Main board') as any;
  const m = d.script.mind;
  const id = useMindUI.getState().active[mindDocId()];
  return (m.boards.find((b) => b.id === id) ?? m.boards[0]) as Draft<MindBoard>;
}

/** The ACTIVE board of the open project / space. */
export function getMind(): MindBoard {
  const m = container();
  return boardOf(m, useMindUI.getState().active[mindDocId()]) ?? newBoard('Ideas');
}

/* ---------------------------------------------------------------- boards */

/** Free-writing text of the active board (typing coalesces into one undo step per board). */
export function setBoardText(text: string) {
  const id = activeBoardId();
  update((d) => void (mindDraft(d).text = text), { coalesce: `mind:text:${id}` });
}

export function addBoard(name: string, opts: { color?: string; text?: string; activate?: boolean } = {}): string {
  const count = getBoards().length;
  const b = newBoard(name.trim() || `Board ${count + 1}`, { color: opts.color ?? BOARD_COLORS[count % BOARD_COLORS.length], text: opts.text ?? '' });
  updateContainer((m) => void m.boards.push(b as Draft<MindBoard>));
  if (opts.activate !== false) setActiveBoard(b.id);
  return b.id;
}

export function updateBoard(id: string, patch: Partial<Pick<MindBoard, 'name' | 'color'>>, coalesce = true) {
  updateContainer(
    (m) => {
      const b = m.boards.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    },
    coalesce ? { coalesce: `mindboard:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function duplicateBoard(id: string): string | undefined {
  const src = getBoards().find((b) => b.id === id);
  if (!src) return;
  const idMap = new Map(src.notes.map((n) => [n.id, uid('idea')]));
  const copy: MindBoard = {
    ...JSON.parse(JSON.stringify(src)),
    id: uid('mb'),
    name: `${src.name} (copy)`,
    notes: src.notes.map((n) => ({ ...n, id: idMap.get(n.id)! })),
    groups: src.groups.map((g) => ({ ...g, id: uid('grp') })),
    links: src.links.filter((l) => idMap.has(l.from) && idMap.has(l.to)).map((l) => ({ id: uid('link'), from: idMap.get(l.from)!, to: idMap.get(l.to)! })),
  };
  updateContainer((m) => {
    const i = m.boards.findIndex((b) => b.id === id);
    m.boards.splice(i + 1, 0, copy as Draft<MindBoard>);
  });
  setActiveBoard(copy.id);
  return copy.id;
}

/** Delete a board (the last remaining board is emptied instead). */
export function deleteBoard(id: string) {
  const boards = getBoards();
  const i = boards.findIndex((b) => b.id === id);
  if (i < 0) return;
  if (boards.length === 1) {
    updateContainer((m) => {
      const b = m.boards[0];
      b.text = '';
      b.notes = [];
      b.groups = [];
      b.links = [];
    });
    return;
  }
  const next = boards[i + 1] ?? boards[i - 1];
  updateContainer((m) => void m.boards.splice(i, 1));
  if (activeBoardId() === id || !getBoards().some((b) => b.id === activeBoardId())) setActiveBoard(next.id);
}

export function moveBoard(id: string, delta: -1 | 1) {
  updateContainer((m) => {
    const i = m.boards.findIndex((b) => b.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= m.boards.length) return;
    const [b] = m.boards.splice(i, 1);
    m.boards.splice(j, 0, b);
  });
}

/** Move notes (with the arrows between them) from the active board to another board. */
export function moveNotesToBoard(noteIds: string[], targetId: string) {
  const fromId = activeBoardId();
  if (!fromId || fromId === targetId || !noteIds.length) return;
  const set = new Set(noteIds);
  updateContainer((m) => {
    const from = m.boards.find((b) => b.id === fromId);
    const to = m.boards.find((b) => b.id === targetId);
    if (!from || !to) return;
    const moving = from.notes.filter((n) => set.has(n.id));
    // place them below what is already on the target board
    const baseY = to.notes.length ? Math.max(...to.notes.map((n) => n.y + n.h)) + GAP * 2 : 40;
    const minX = Math.min(...moving.map((n) => n.x));
    const minY = Math.min(...moving.map((n) => n.y));
    for (const n of moving) {
      n.x = Math.round(40 + (n.x - minX));
      n.y = Math.round(baseY + (n.y - minY));
    }
    to.notes.push(...moving);
    to.links.push(...from.links.filter((l) => set.has(l.from) && set.has(l.to)));
    from.notes = from.notes.filter((n) => !set.has(n.id));
    from.links = from.links.filter((l) => !set.has(l.from) && !set.has(l.to));
  });
  const target = getBoards().find((b) => b.id === targetId);
  toast(`Moved ${noteIds.length} note${noteIds.length === 1 ? '' : 's'} to “${target?.name ?? 'board'}”`, 'success', {
    action: { label: 'Open board', onClick: () => setActiveBoard(targetId) },
  });
}

/** First free grid slot to the right of / below existing notes. */
export function nextSlots(count: number, near?: { x: number; y: number }): { x: number; y: number }[] {
  const m = getMind();
  const cols = 5;
  let originX = near?.x ?? 40;
  let originY = near?.y ?? 40;
  if (!near && m.notes.length) {
    const maxY = Math.max(...m.notes.map((n) => n.y + n.h));
    const minX = Math.min(...m.notes.map((n) => n.x));
    originX = minX;
    originY = maxY + GAP * 2;
  }
  return Array.from({ length: count }, (_, i) => ({ x: originX + (i % cols) * (NOTE_W + GAP), y: originY + Math.floor(i / cols) * (NOTE_H + GAP) }));
}

export function addNotes(texts: string[], opts: { at?: { x: number; y: number }; color?: string } = {}): string[] {
  const slots = nextSlots(texts.length, opts.at);
  const notes: IdeaNote[] = texts.map((text, i) => ({ id: uid('idea'), text, x: slots[i].x, y: slots[i].y, w: NOTE_W, h: NOTE_H, color: opts.color ?? NOTE_COLORS[0] }));
  update((d) => {
    mindDraft(d).notes.push(...(notes as Draft<IdeaNote>[]));
  });
  return notes.map((n) => n.id);
}

export function addNoteAt(x: number, y: number, color?: string, text = ''): string {
  const n: IdeaNote = { id: uid('idea'), text, x: Math.round(x - NOTE_W / 2), y: Math.round(y - NOTE_H / 2), w: NOTE_W, h: NOTE_H, color: color ?? NOTE_COLORS[0] };
  update((d) => void mindDraft(d).notes.push(n as Draft<IdeaNote>));
  return n.id;
}

export function updateNote(id: string, patch: Partial<IdeaNote>, coalesce = true) {
  update(
    (d) => {
      const n = mindDraft(d).notes.find((x) => x.id === id);
      if (n) Object.assign(n, patch);
    },
    coalesce ? { coalesce: `idea:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function updateGroup(id: string, patch: Partial<IdeaGroup>, coalesce = true) {
  update(
    (d) => {
      const g = mindDraft(d).groups.find((x) => x.id === id);
      if (g) Object.assign(g, patch);
    },
    coalesce ? { coalesce: `ideagroup:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/** Move notes & groups by a delta in one undo step. */
export function moveItems(noteIds: string[], groupIds: string[], dx: number, dy: number) {
  if (!dx && !dy) return;
  const ns = new Set(noteIds);
  const gs = new Set(groupIds);
  update((d) => {
    const m = mindDraft(d);
    for (const n of m.notes) if (ns.has(n.id)) {
      n.x = Math.round(n.x + dx);
      n.y = Math.round(n.y + dy);
    }
    for (const g of m.groups) if (gs.has(g.id)) {
      g.x = Math.round(g.x + dx);
      g.y = Math.round(g.y + dy);
    }
  });
}

export function deleteItems(noteIds: string[], groupIds: string[], linkIds: string[] = []) {
  const ns = new Set(noteIds);
  const gs = new Set(groupIds);
  const ls = new Set(linkIds);
  update((d) => {
    const m = mindDraft(d);
    m.notes = m.notes.filter((n) => !ns.has(n.id));
    m.groups = m.groups.filter((g) => !gs.has(g.id));
    m.links = m.links.filter((l) => !ls.has(l.id) && !ns.has(l.from) && !ns.has(l.to));
  });
}

export function duplicateNotes(ids: string[]): string[] {
  const m = getMind();
  const src = m.notes.filter((n) => ids.includes(n.id));
  const copies = src.map((n) => ({ ...n, id: uid('idea'), x: n.x + 24, y: n.y + 24, used: false }));
  update((d) => void mindDraft(d).notes.push(...(copies as Draft<IdeaNote>[])));
  return copies.map((c) => c.id);
}

export function addLink(from: string, to: string) {
  if (from === to) return;
  const m = getMind();
  if (m.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) return;
  const l: IdeaLink = { id: uid('link'), from, to };
  update((d) => void mindDraft(d).links.push(l as Draft<IdeaLink>));
}

export function noteCenter(n: Pick<IdeaNote, 'x' | 'y' | 'w' | 'h'>) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Notes whose centre lies inside the group. */
export function notesInGroup(g: IdeaGroup, notes: IdeaNote[]): IdeaNote[] {
  return notes.filter((n) => {
    const c = noteCenter(n);
    return c.x >= g.x && c.x <= g.x + g.w && c.y >= g.y && c.y <= g.y + g.h;
  });
}

/** Group around the given notes (or an empty group at a position). */
export function addGroup(noteIds: string[], at?: { x: number; y: number }): string {
  const m = getMind();
  const notes = m.notes.filter((n) => noteIds.includes(n.id));
  const pad = 28;
  let g: IdeaGroup;
  if (notes.length) {
    const x0 = Math.min(...notes.map((n) => n.x)) - pad;
    const y0 = Math.min(...notes.map((n) => n.y)) - pad - 26;
    const x1 = Math.max(...notes.map((n) => n.x + n.w)) + pad;
    const y1 = Math.max(...notes.map((n) => n.y + n.h)) + pad;
    g = { id: uid('grp'), title: 'New group', x: x0, y: y0, w: x1 - x0, h: y1 - y0, color: GROUP_COLORS[m.groups.length % GROUP_COLORS.length] };
  } else {
    const p = at ?? { x: 60, y: 60 };
    g = { id: uid('grp'), title: 'New group', x: Math.round(p.x - 240), y: Math.round(p.y - 160), w: 480, h: 320, color: GROUP_COLORS[m.groups.length % GROUP_COLORS.length] };
  }
  update((d) => void mindDraft(d).groups.push(g as Draft<IdeaGroup>));
  return g.id;
}

/** Notes sorted in reading order (top-to-bottom, left-to-right). */
export function readingOrder(notes: IdeaNote[]): IdeaNote[] {
  return [...notes].sort((a, b) => (Math.abs(a.y - b.y) > NOTE_H / 2 ? a.y - b.y : a.x - b.x));
}

/* ---------------------------------------------------------------- tidy */

export function tidyGrid(ids?: string[]) {
  const m = getMind();
  const target = readingOrder(ids?.length ? m.notes.filter((n) => ids.includes(n.id)) : m.notes);
  if (!target.length) return;
  const x0 = Math.min(...target.map((n) => n.x));
  const y0 = Math.min(...target.map((n) => n.y));
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(target.length * 1.6))));
  const pos = new Map(target.map((n, i) => [n.id, { x: x0 + (i % cols) * (NOTE_W + GAP), y: y0 + Math.floor(i / cols) * (NOTE_H + GAP) }]));
  update((d) => {
    for (const n of mindDraft(d).notes) {
      const p = pos.get(n.id);
      if (p) {
        n.x = p.x;
        n.y = p.y;
        n.w = NOTE_W;
        n.h = NOTE_H;
      }
    }
  });
}

export function tidyByColour() {
  const m = getMind();
  if (!m.notes.length) return;
  const order = [...NOTE_COLORS, ...new Set(m.notes.map((n) => n.color))].filter((c, i, a) => a.indexOf(c) === i);
  const x0 = Math.min(...m.notes.map((n) => n.x));
  const y0 = Math.min(...m.notes.map((n) => n.y));
  const pos = new Map<string, { x: number; y: number }>();
  let col = 0;
  for (const c of order) {
    const list = readingOrder(m.notes.filter((n) => n.color === c));
    if (!list.length) continue;
    list.forEach((n, i) => pos.set(n.id, { x: x0 + col * (NOTE_W + GAP * 2), y: y0 + i * (NOTE_H + GAP) }));
    col++;
  }
  update((d) => {
    for (const n of mindDraft(d).notes) {
      const p = pos.get(n.id);
      if (p) {
        n.x = p.x;
        n.y = p.y;
        n.w = NOTE_W;
        n.h = NOTE_H;
      }
    }
  });
}

/** Resize every group to fit the notes inside it. */
export function fitGroups() {
  const m = getMind();
  const pad = 28;
  update((d) => {
    const md = mindDraft(d);
    for (const g of md.groups) {
      const inside = notesInGroup(g as IdeaGroup, m.notes);
      if (!inside.length) continue;
      const x0 = Math.min(...inside.map((n) => n.x)) - pad;
      const y0 = Math.min(...inside.map((n) => n.y)) - pad - 26;
      g.w = Math.max(...inside.map((n) => n.x + n.w)) + pad - x0;
      g.h = Math.max(...inside.map((n) => n.y + n.h)) + pad - y0;
      g.x = x0;
      g.y = y0;
    }
  });
}

/* ---------------------------------------------------------------- splitting free text */

export function splitText(text: string, mode: 'lines' | 'paragraphs'): string[] {
  const clean = (s: string) => s.replace(/^\s*([-*•–]|\d+[.)])\s+/, '').trim();
  if (mode === 'paragraphs') return text.split(/\n\s*\n/).map((p) => p.split('\n').map(clean).join('\n').trim()).filter(Boolean);
  return text.split('\n').map(clean).filter(Boolean);
}

/* ---------------------------------------------------------------- sending notes elsewhere */

export function markUsed(ids: string[]) {
  const set = new Set(ids);
  update((d) => {
    for (const n of mindDraft(d).notes) if (set.has(n.id)) n.used = true;
  });
}

function firstLine(t: string) {
  return t.split('\n')[0].trim();
}

function textNodes(t: string): any[] {
  const out: any[] = [];
  t.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ type: 'hard_break' });
    if (line) out.push({ type: 'text', text: line });
  });
  return out;
}

function appendToDoc(nodes: any[], label: string, sceneMetas: { sid: string; synopsis: string }[] = []) {
  const before = getProject().script.doc as any;
  projectUpdate(
    (d) => {
      const doc = d.script.doc as any;
      const content: any[] = [...(doc?.content ?? [])];
      const onlyEmpty = content.length === 1 && !(content[0].content?.length);
      d.script.doc = { type: 'doc', content: [...(onlyEmpty ? [] : content), ...nodes] } as any;
      d.script.revision = (d.script.revision ?? 0) + 1;
      for (const m of sceneMetas) d.scenes[m.sid] = { ...(d.scenes[m.sid] ?? { id: m.sid }), synopsis: m.synopsis };
    },
    { history: false },
  );
  toast(label, 'success', {
    action: {
      label: 'Undo',
      onClick: () =>
        projectUpdate(
          (d) => {
            d.script.doc = before;
            d.script.revision = (d.script.revision ?? 0) + 1;
          },
          { history: false },
        ),
    },
  });
}

/** Each note becomes a new scene (heading from the first line when it looks like one) with the note as action. */
export function sendAsScenes(notes: IdeaNote[]) {
  const nodes: any[] = [];
  const metas: { sid: string; synopsis: string }[] = [];
  for (const n of readingOrder(notes)) {
    const first = firstLine(n.text);
    const sid = uid('sc');
    if (isSceneHeadingText(first)) {
      nodes.push({ type: 'scene_heading', attrs: { sid }, content: textNodes(first.toUpperCase()) });
      const rest = n.text.split('\n').slice(1).join('\n').trim();
      if (rest) nodes.push({ type: 'action', content: textNodes(rest) });
    } else {
      nodes.push({ type: 'scene_heading', attrs: { sid } });
      nodes.push({ type: 'action', content: textNodes(n.text.trim()) });
      metas.push({ sid, synopsis: first });
    }
  }
  appendToDoc(nodes, `Added ${notes.length} scene${notes.length === 1 ? '' : 's'} to the end of the script`, metas);
  markUsed(notes.map((n) => n.id));
}

export function sendAsAction(notes: IdeaNote[]) {
  const nodes = readingOrder(notes).map((n) => ({ type: 'action', content: textNodes(n.text.trim()) }));
  appendToDoc(nodes, `Added ${notes.length} action paragraph${notes.length === 1 ? '' : 's'} to the end of the script`);
  markUsed(notes.map((n) => n.id));
}

export function sendToAv(notes: IdeaNote[], column: 'video' | 'audio') {
  const rows = readingOrder(notes).map((n) => ({ id: uid('av'), video: column === 'video' ? n.text.trim() : '', audio: column === 'audio' ? n.text.trim() : '' }));
  projectUpdate((d) => {
    if (!d.script.av) d.script.av = { rows: [], videoLabel: 'VIDEO', audioLabel: 'AUDIO', showImages: true, showDurations: true };
    d.script.av.rows.push(...rows);
  });
  markUsed(notes.map((n) => n.id));
  toast(`Added ${rows.length} row${rows.length === 1 ? '' : 's'} to the A/V script`);
}

export function sendToShots(notes: IdeaNote[]) {
  const p = getProject();
  const shots: Shot[] = readingOrder(notes).map((n, i) => ({ id: uid('shot'), number: String(p.shots.filter((s) => !s.sceneId).length + i + 1), description: n.text.trim(), status: 'planned' }));
  projectUpdate((d) => void d.shots.push(...(shots as Draft<Shot>[])));
  markUsed(notes.map((n) => n.id));
  toast(`Added ${shots.length} shot${shots.length === 1 ? '' : 's'} to the shot list (unassigned)`);
}

export function sendToTasks(notes: IdeaNote[]) {
  const tasks: Task[] = readingOrder(notes).map((n) => ({ id: uid('task'), title: firstLine(n.text) || 'Idea', notes: n.text.split('\n').slice(1).join('\n').trim() || undefined, phase: 'development', status: 'todo', priority: 'normal' }));
  projectUpdate((d) => void d.tasks.push(...(tasks as Draft<Task>[])));
  markUsed(notes.map((n) => n.id));
  toast(`Added ${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
}

/** Point where the segment from `from` towards the rect centre crosses the rect border. */
export function edgePoint(rect: { x: number; y: number; w: number; h: number }, from: { x: number; y: number }) {
  const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const dx = from.x - c.x;
  const dy = from.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? rect.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? rect.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

