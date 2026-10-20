/* Actions on the live editor used by toolbar, menus and keyboard shortcuts. */
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { BreakdownCategory, BreakdownElement, Character } from '@/types';
import { screenplaySchema as schema } from '@/script-core/schema';
import { getProject, update } from '@/store/project';
import { uid } from '@/lib/id';
import { promptDialog, toast } from '@/ui';
import { CATEGORY_BY_ID } from '@/lib/constants';
import { findOccurrences, moveSceneTr, removeTagsAt } from './commands';
import { scenePos } from './util';

/** Selection range, or the word at the cursor if empty. */
export function selectionOrWord(view: EditorView): { from: number; to: number } | null {
  const { from, to, empty, $from } = view.state.selection;
  if (!empty) return { from, to };
  if ($from.depth < 1) return null;
  const text = $from.parent.textContent;
  const off = $from.parentOffset;
  let a = off;
  let b = off;
  while (a > 0 && /[\p{L}\p{N}'’-]/u.test(text[a - 1])) a--;
  while (b < text.length && /[\p{L}\p{N}'’-]/u.test(text[b])) b++;
  if (a === b) return null;
  const start = $from.start();
  return { from: start + a, to: start + b };
}

/** Tag the selection (or word) as a breakdown element; creates the element/character if needed. */
export function tagSelection(view: EditorView, cat: BreakdownCategory, allOccurrences = false) {
  const range = selectionOrWord(view);
  if (!range) {
    toast('Select the text to tag first', 'info');
    return;
  }
  const raw = view.state.doc.textBetween(range.from, range.to, ' ').trim();
  if (!raw) return;
  const name = raw.toUpperCase().replace(/\s+/g, ' ');
  const p = getProject();
  let id: string;
  if (cat === 'cast') {
    const existing = p.characters.find((c) => c.name.toUpperCase() === name || (c.aliases ?? []).some((a) => a.toUpperCase() === name));
    if (existing) id = existing.id;
    else {
      id = uid('chr');
      const num = p.characters.reduce((m, c) => Math.max(m, c.number ?? 0), 0) + 1;
      const c: Character = { id, name, number: num, manual: true };
      update((d) => void d.characters.push(c));
    }
  } else {
    const existing = p.elements.find((e) => e.category === cat && e.name.toUpperCase() === name);
    if (existing) id = existing.id;
    else {
      id = uid('el');
      const e: BreakdownElement = { id, category: cat as BreakdownElement['category'], name, status: 'needed' };
      update((d) => void d.elements.push(e));
    }
  }
  const mark = schema.marks.tag.create({ cat, id });
  const ranges = allOccurrences ? findOccurrences(view.state.doc, raw) : [range];
  const tr = view.state.tr;
  for (const r of ranges) tr.addMark(r.from, r.to, mark);
  view.dispatch(tr);
  view.focus();
  toast(`Tagged “${name}” as ${CATEGORY_BY_ID[cat].label}${ranges.length > 1 ? ` (${ranges.length}×)` : ''}`);
}

export function untag(view: EditorView) {
  if (!removeTagsAt(view.state, view.dispatch)) toast('No tag here', 'info');
  view.focus();
}

/** Add a script note to the selection (or the current paragraph). */
export async function addNote(view: EditorView) {
  let { from, to, empty, $from } = view.state.selection;
  if (empty) {
    if ($from.depth < 1) return;
    from = $from.start();
    to = $from.end();
    if (from === to) {
      toast('Write something first, then attach a note to it', 'info');
      return;
    }
  }
  const text = await promptDialog({ title: 'Add script note', placeholder: 'Note…', multiline: true, confirmLabel: 'Add note' });
  if (!text?.trim()) {
    view.focus();
    return;
  }
  const id = uid('note');
  update((d) => {
    d.script.notes[id] = { id, text: text.trim(), color: '#f5b800', createdAt: new Date().toISOString() };
  });
  view.dispatch(view.state.tr.addMark(from, to, schema.marks.note.create({ id })));
  view.focus();
}

export function removeNoteMarks(view: EditorView, noteId: string) {
  const tr = view.state.tr;
  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((m) => m.type === schema.marks.note && m.attrs.id === noteId)) {
      tr.removeMark(pos, pos + node.nodeSize, schema.marks.note.create({ id: noteId }));
    }
  });
  if (tr.docChanged) view.dispatch(tr);
}

/** Positions of the first occurrence of a note mark. */
export function notePos(view: EditorView, noteId: string): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.marks.some((m) => m.type === schema.marks.note && m.attrs.id === noteId)) found = pos;
    return true;
  });
  return found;
}

/** Scroll the editor to a document position and place the cursor there. */
export function scrollToPos(view: EditorView, pos: number, select = true) {
  const doc = view.state.doc;
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  if (select) {
    const sel = TextSelection.near(doc.resolve(Math.min(safe + 1, doc.content.size)));
    view.dispatch(view.state.tr.setSelection(sel));
  }
  try {
    const dom = view.nodeDOM(safe) as HTMLElement | null;
    const target = dom && dom.nodeType === 1 ? dom : (view.domAtPos(safe + 1).node as HTMLElement);
    const elx = target.nodeType === 1 ? target : target.parentElement;
    elx?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    /* ignore */
  }
  view.focus();
}

export function scrollToScene(view: EditorView, sid: string) {
  const pos = scenePos(view.state.doc, sid);
  if (pos >= 0) scrollToPos(view, pos);
}

export function moveScene(view: EditorView, sid: string, beforeSid: string | null) {
  const tr = moveSceneTr(view.state, sid, beforeSid);
  if (tr) view.dispatch(tr.scrollIntoView());
}
