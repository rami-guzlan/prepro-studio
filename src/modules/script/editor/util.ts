/* Helpers working directly on the ProseMirror document. */
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { ElementType } from '@/types';
import type { Para, Run } from '@/script-core/paragraphs';

/** Paragraphs from a live ProseMirror doc (no JSON round trip). Also returns each paragraph's start position. */
export function nodeToParas(doc: PMNode): { paras: Para[]; starts: number[] } {
  const paras: Para[] = [];
  const starts: number[] = [];
  doc.forEach((node, offset) => {
    const runs: Run[] = [];
    let text = '';
    node.forEach((child) => {
      if (child.type.name === 'hard_break') {
        runs.push({ text: '\n' });
        text += '\n';
        return;
      }
      if (!child.isText || !child.text) return;
      const r: Run = { text: child.text };
      for (const m of child.marks) {
        if (m.type.name === 'bold') r.b = true;
        else if (m.type.name === 'italic') r.i = true;
        else if (m.type.name === 'underline') r.u = true;
      }
      runs.push(r);
      text += child.text;
    });
    const p: Para = { type: node.type.name as ElementType, text, runs };
    if (node.type.name === 'scene_heading') p.sid = node.attrs.sid ?? undefined;
    if (node.type.name === 'character' && node.attrs.dual) p.dual = true;
    if (node.attrs.align) p.align = node.attrs.align;
    paras.push(p);
    starts.push(offset);
  });
  return { paras, starts };
}

/** Character offset inside a textblock -> document position (hard breaks count as 1 char). */
export function offsetToPos(block: PMNode, blockStart: number, offset: number): number {
  let acc = 0;
  let pos = blockStart + 1;
  for (let i = 0; i < block.childCount; i++) {
    const child = block.child(i);
    const len = child.isText ? child.text!.length : 1;
    if (offset === acc) return pos;
    if (child.isText && offset < acc + len) return pos + (offset - acc);
    acc += len;
    pos += child.nodeSize;
  }
  return pos;
}

/** Index of the top-level node containing pos. */
export function topIndexAt(state: EditorState, pos: number): number {
  const $p = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  return $p.depth >= 1 ? $p.index(0) : Math.min($p.index(0), state.doc.childCount - 1);
}

/** Scene id (sid) of the scene containing the given top-level index. */
export function sceneIdAtIndex(doc: PMNode, index: number): string | null {
  for (let i = Math.min(index, doc.childCount - 1); i >= 0; i--) {
    const n = doc.child(i);
    if (n.type.name === 'scene_heading') return n.attrs.sid ?? null;
  }
  return null;
}

/** Position (before the node) of the scene heading with this sid, or -1. */
export function scenePos(doc: PMNode, sid: string): number {
  let found = -1;
  doc.forEach((node, offset) => {
    if (found < 0 && node.type.name === 'scene_heading' && node.attrs.sid === sid) found = offset;
  });
  return found;
}

/** [from, to) document range covering a whole scene (heading through the paragraph before the next heading). */
export function sceneRange(doc: PMNode, sid: string): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  doc.forEach((node, offset) => {
    if (to >= 0) return;
    if (node.type.name === 'scene_heading') {
      if (from >= 0) to = offset;
      else if (node.attrs.sid === sid) from = offset;
    }
  });
  if (from < 0) return null;
  return { from, to: to >= 0 ? to : doc.content.size };
}

export function blockText(node: PMNode): string {
  let t = '';
  node.forEach((c) => {
    t += c.isText ? c.text : c.type.name === 'hard_break' ? '\n' : '';
  });
  return t;
}
