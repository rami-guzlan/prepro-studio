/* Screenplay editing commands (element changes, flow, dual dialogue, tags, notes). */
import { Fragment, type Node as PMNode, type Mark } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import type { ElementType, ScriptFormatSettings } from '@/types';
import { screenplaySchema as schema, UPPERCASE_ELEMENTS } from '@/script-core/schema';
import { uid } from '@/lib/id';
import { blockText } from './util';

/** attrs for a node type, keeping compatible attributes from the old node */
function attrsFor(type: ElementType, old?: PMNode): Record<string, unknown> {
  if (type === 'scene_heading') return { sid: old?.type.name === 'scene_heading' && old.attrs.sid ? old.attrs.sid : uid('sc') };
  if (type === 'character') return { dual: old?.type.name === 'character' ? !!old.attrs.dual : false };
  if (type === 'action' || type === 'general') return { align: old?.attrs.align ?? null };
  return {};
}

/** Uppercase all text in a block (keeps marks). */
function upperContent(node: PMNode): Fragment {
  const nodes: PMNode[] = [];
  node.forEach((c) => {
    nodes.push(c.isText ? schema.text(c.text!.toUpperCase(), c.marks) : c);
  });
  return Fragment.fromArray(nodes);
}

/** Change the type of the block at `pos` (position before the node). */
export function convertBlock(tr: Transaction, pos: number, type: ElementType): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (!node) return tr;
  const from = node.type.name as ElementType;
  if (from === type && type !== 'parenthetical') return tr;
  tr.setNodeMarkup(pos, schema.nodes[type], attrsFor(type, node));
  const updated = tr.doc.nodeAt(pos)!;
  const text = blockText(updated);
  if (UPPERCASE_ELEMENTS.has(type) && text !== text.toUpperCase()) {
    tr.replaceWith(pos + 1, pos + 1 + updated.content.size, upperContent(updated));
  }
  const cur = tr.doc.nodeAt(pos)!;
  const curText = blockText(cur);
  if (type === 'parenthetical' && from !== 'parenthetical') {
    if (!curText.trim()) {
      tr.insertText('()', pos + 1, pos + 1 + cur.content.size);
      tr.setSelection(TextSelection.create(tr.doc, pos + 2));
    } else if (!curText.trimStart().startsWith('(')) {
      tr.insert(pos + 1 + cur.content.size, schema.text(')'));
      tr.insert(pos + 1, schema.text('('));
    }
  } else if (from === 'parenthetical' && type !== 'parenthetical') {
    const t = curText.trim();
    if (t === '()' || t === '(') tr.delete(pos + 1, pos + 1 + cur.content.size);
    else if (t.startsWith('(') && t.endsWith(')')) {
      // strip wrapping parentheses
      const start = pos + 1 + curText.indexOf('(');
      const end = pos + 1 + curText.lastIndexOf(')');
      tr.delete(end, end + 1);
      tr.delete(start, start + 1);
    }
  }
  return tr;
}

/** Set the element type of every block touched by the selection. */
export function setElement(type: ElementType): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    const positions: number[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) positions.push(pos);
      return !node.isTextblock;
    });
    if (!positions.length) return false;
    for (const pos of positions) convertBlock(tr, tr.mapping.map(pos), type);
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Insert a new empty block of `type` after the current block and put the cursor in it. */
export function insertElementAfter(state: EditorState, type: ElementType): Transaction {
  const { $from } = state.selection;
  const after = $from.after(1);
  const node = schema.nodes[type].create(attrsFor(type));
  const tr = state.tr.insert(after, node);
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  if (type === 'parenthetical') {
    tr.insertText('()', after + 1);
    tr.setSelection(TextSelection.create(tr.doc, after + 2));
  }
  return tr.scrollIntoView();
}

export interface FlowContext {
  settings: () => ScriptFormatSettings;
}

function currentBlock(state: EditorState) {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const node = $from.parent;
  const pos = $from.before(1);
  const text = blockText(node);
  const offset = $from.parentOffset;
  return { node, pos, text, type: node.type.name as ElementType, atEnd: offset === node.content.size, atStart: offset === 0, empty: node.content.size === 0 };
}

/** True when the block only holds empty parentheses "()" or the cursor sits right before a closing ')'. */
function parenAtEnd(state: EditorState): boolean {
  const b = currentBlock(state);
  if (!b || b.type !== 'parenthetical') return false;
  const after = b.text.slice(state.selection.$from.parentOffset);
  return after === ')';
}

/** Enter: Final Draft style element flow. */
export function enterCommand(ctx: FlowContext): Command {
  return (state, dispatch) => {
    if (!state.selection.empty) {
      if (dispatch) {
        const tr = state.tr.deleteSelection();
        dispatch(tr);
      }
      return true;
    }
    const b = currentBlock(state);
    if (!b) return false;
    const flow = ctx.settings().flow[b.type];
    if (!flow) return false;
    const isEmptyParen = b.type === 'parenthetical' && /^\(\s*\)?$/.test(b.text.trim());
    if (b.empty || isEmptyParen) {
      // change the empty element in place
      if (dispatch) {
        const tr = state.tr;
        if (isEmptyParen) tr.delete(b.pos + 1, b.pos + 1 + b.node.content.size);
        convertBlock(tr, b.pos, flow.enterEmpty);
        const node = tr.doc.nodeAt(b.pos)!;
        if (flow.enterEmpty !== 'parenthetical') tr.setSelection(TextSelection.create(tr.doc, b.pos + 1 + node.content.size));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    if (b.atEnd || parenAtEnd(state)) {
      if (dispatch) dispatch(insertElementAfter(state, flow.enter));
      return true;
    }
    // split in the middle: both halves keep the element type
    if (dispatch) {
      const tr = state.tr.split(state.selection.from, 1, [{ type: b.node.type, attrs: attrsFor(b.type, b.node) }]);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Tab: change empty element / start the next element. */
export function tabCommand(ctx: FlowContext): Command {
  return (state, dispatch) => {
    const b = currentBlock(state);
    if (!b) return false;
    const flow = ctx.settings().flow[b.type];
    if (!flow) return false;
    const isEmptyParen = b.type === 'parenthetical' && /^\(\s*\)?$/.test(b.text.trim());
    if (b.empty || isEmptyParen) {
      if (dispatch) {
        const tr = state.tr;
        if (isEmptyParen) tr.delete(b.pos + 1, b.pos + 1 + b.node.content.size);
        convertBlock(tr, b.pos, flow.tabEmpty);
        const node = tr.doc.nodeAt(b.pos)!;
        if (flow.tabEmpty !== 'parenthetical') tr.setSelection(TextSelection.create(tr.doc, b.pos + 1 + node.content.size));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    if (b.atEnd || parenAtEnd(state)) {
      if (dispatch) dispatch(insertElementAfter(state, flow.tab));
      return true;
    }
    if (dispatch) dispatch(convertBlock(state.tr, b.pos, flow.tab).scrollIntoView());
    return true;
  };
}

/** Shift+Tab: change the current element to the "previous" element. */
export function shiftTabCommand(ctx: FlowContext): Command {
  return (state, dispatch) => {
    const b = currentBlock(state);
    if (!b) return false;
    const flow = ctx.settings().flow[b.type];
    if (!flow) return false;
    if (dispatch) dispatch(convertBlock(state.tr, b.pos, flow.shiftTabEmpty).scrollIntoView());
    return true;
  };
}

/** Toggle dual dialogue on the character cue of the current speech. */
export const toggleDual: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth < 1) return false;
  let idx = $from.index(0);
  // walk back from dialogue/parenthetical to its cue
  while (idx >= 0) {
    const n = state.doc.child(idx);
    if (n.type.name === 'character') break;
    if (n.type.name !== 'dialogue' && n.type.name !== 'parenthetical') return false;
    idx--;
  }
  if (idx < 0) return false;
  let pos = 0;
  for (let i = 0; i < idx; i++) pos += state.doc.child(i).nodeSize;
  const node = state.doc.child(idx);
  if (dispatch) dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, dual: !node.attrs.dual }));
  return true;
};

/** Hard line break inside an element (Shift+Enter). */
export const hardBreak: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

/* ---------------------------------------------------------------- marks */

export function addMarkToRanges(tr: Transaction, ranges: { from: number; to: number }[], mark: Mark): Transaction {
  for (const r of ranges) tr.addMark(r.from, r.to, mark);
  return tr;
}

/** Remove tag marks overlapping the selection (or at the cursor). Returns false if none. */
export function removeTagsAt(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { from, to, empty, $from } = state.selection;
  const type = schema.marks.tag;
  let a = from;
  let b = to;
  if (empty) {
    // expand to the tagged run around the cursor
    const marks = $from.marks().filter((m) => m.type === type);
    if (!marks.length) return false;
    const parent = $from.parent;
    const start = $from.start();
    let runFrom = -1;
    let runTo = -1;
    parent.forEach((child, off) => {
      const cs = start + off;
      const ce = cs + child.nodeSize;
      if (child.marks.some((m) => marks.includes(m))) {
        if (cs <= from && ce >= from) {
          runFrom = cs;
          runTo = ce;
        }
      }
    });
    if (runFrom < 0) return false;
    a = runFrom;
    b = runTo;
  }
  let found = false;
  state.doc.nodesBetween(a, b, (n) => {
    if (n.marks.some((m) => m.type === type)) found = true;
  });
  if (!found) return false;
  if (dispatch) dispatch(state.tr.removeMark(a, b, type));
  return true;
}

/** Find all case-insensitive whole-word occurrences of `text` in the doc. */
export function findOccurrences(doc: PMNode, text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const needle = text.trim().toLowerCase();
  if (!needle) return out;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${esc})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let acc = '';
    const map: number[] = [];
    node.forEach((child, off) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + off + i);
        acc += child.text;
      } else {
        map.push(pos + 1 + off);
        acc += '\n';
      }
    });
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(acc))) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      out.push({ from: map[start], to: map[end - 1] + 1 });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return false;
  });
  return out;
}

/** Move a whole scene before another scene (beforeSid null = end of script). */
export function moveSceneTr(state: EditorState, sid: string, beforeSid: string | null): Transaction | null {
  const ranges: { sid: string; from: number; to: number }[] = [];
  let preamble = 0;
  state.doc.forEach((node, offset) => {
    if (node.type.name === 'scene_heading') {
      if (ranges.length) ranges[ranges.length - 1].to = offset;
      else preamble = offset;
      ranges.push({ sid: node.attrs.sid, from: offset, to: state.doc.content.size });
    }
  });
  void preamble;
  const src = ranges.find((r) => r.sid === sid);
  if (!src || sid === beforeSid || ranges.length < 2) return null;
  const idx = ranges.indexOf(src);
  if ((beforeSid === null && idx === ranges.length - 1) || ranges[idx + 1]?.sid === beforeSid) return null;
  const slice = state.doc.slice(src.from, src.to);
  const tr = state.tr.delete(src.from, src.to);
  let insertAt: number;
  if (beforeSid) {
    const target = ranges.find((r) => r.sid === beforeSid);
    if (!target) return null;
    insertAt = tr.mapping.map(target.from);
  } else insertAt = tr.doc.content.size;
  tr.insert(insertAt, slice.content);
  return tr;
}
