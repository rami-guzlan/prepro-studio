/* Plain paragraph representation of a screenplay, independent of ProseMirror.
   Used by pagination, exports (PDF, Fountain, FDX) and all production modules. */
import type { BreakdownCategory, ElementType } from '@/types';
import { ELEMENT_TYPES } from './schema';
import { uid } from '@/lib/id';

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** breakdown tags on this run */
  tags?: { cat: BreakdownCategory; id: string }[];
  /** script note ids on this run */
  notes?: string[];
}

export interface Para {
  type: ElementType;
  /** plain text; hard line breaks are '\n' */
  text: string;
  runs: Run[];
  /** scene id (scene headings only) */
  sid?: string;
  /** dual dialogue (character cue of the second speaker) */
  dual?: boolean;
  align?: 'center' | 'right' | null;
}

const VALID = new Set<string>(ELEMENT_TYPES);

/** Convert ProseMirror doc JSON into paragraphs. */
export function docToParas(doc: any): Para[] {
  const out: Para[] = [];
  const content: any[] = doc && Array.isArray(doc.content) ? doc.content : [];
  for (const node of content) {
    const type: ElementType = VALID.has(node.type) ? node.type : 'action';
    const runs: Run[] = [];
    let text = '';
    for (const child of node.content ?? []) {
      if (child.type === 'hard_break') {
        runs.push({ text: '\n' });
        text += '\n';
        continue;
      }
      if (child.type !== 'text' || !child.text) continue;
      const r: Run = { text: child.text };
      for (const m of child.marks ?? []) {
        if (m.type === 'bold') r.b = true;
        else if (m.type === 'italic') r.i = true;
        else if (m.type === 'underline') r.u = true;
        else if (m.type === 'tag' && m.attrs?.cat && m.attrs?.id) (r.tags ??= []).push({ cat: m.attrs.cat, id: m.attrs.id });
        else if (m.type === 'note' && m.attrs?.id) (r.notes ??= []).push(m.attrs.id);
      }
      runs.push(r);
      text += child.text;
    }
    const p: Para = { type, text, runs };
    const attrs = node.attrs ?? {};
    if (type === 'scene_heading') p.sid = attrs.sid ?? undefined;
    if (type === 'character' && attrs.dual) p.dual = true;
    if ((type === 'action' || type === 'general') && attrs.align) p.align = attrs.align;
    out.push(p);
  }
  return out;
}

/** Convert paragraphs back into ProseMirror doc JSON. Missing scene ids are generated. */
export function parasToDoc(paras: Para[]): any {
  const content = paras.map((p) => {
    const node: any = { type: p.type };
    const attrs: Record<string, unknown> = {};
    if (p.type === 'scene_heading') attrs.sid = p.sid || uid('sc');
    if (p.type === 'character' && p.dual) attrs.dual = true;
    if ((p.type === 'action' || p.type === 'general') && p.align) attrs.align = p.align;
    if (Object.keys(attrs).length) node.attrs = attrs;
    const runs = p.runs.length ? p.runs : p.text ? [{ text: p.text }] : [];
    const children: any[] = [];
    for (const r of runs) {
      const parts = r.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) children.push({ type: 'hard_break' });
        if (!part) return;
        const marks: any[] = [];
        if (r.b) marks.push({ type: 'bold' });
        if (r.i) marks.push({ type: 'italic' });
        if (r.u) marks.push({ type: 'underline' });
        for (const t of r.tags ?? []) marks.push({ type: 'tag', attrs: { cat: t.cat, id: t.id } });
        for (const n of r.notes ?? []) marks.push({ type: 'note', attrs: { id: n } });
        children.push(marks.length ? { type: 'text', text: part, marks } : { type: 'text', text: part });
      });
    }
    if (children.length) node.content = children;
    return node;
  });
  if (content.length === 0) content.push({ type: 'scene_heading', attrs: { sid: uid('sc') } });
  return { type: 'doc', content };
}

/** Slice runs to the character range [from, to). */
export function sliceRuns(runs: Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (end > from && pos < to) {
      const a = Math.max(from, pos) - pos;
      const b = Math.min(to, end) - pos;
      const text = r.text.slice(a, b);
      if (text) out.push({ ...r, text });
    }
    pos = end;
    if (pos >= to) break;
  }
  return out;
}

export function plainParas(texts: [ElementType, string][]): Para[] {
  return texts.map(([type, text]) => ({ type, text, runs: text ? [{ text }] : [] }));
}
