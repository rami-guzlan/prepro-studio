/* SmartType: Final Draft-style autocomplete for scene headings (INT./EXT.,
   locations, times of day), character names (+ extensions), transitions and
   shots. Enter/Tab accepts, arrows move, Esc dismisses. */
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { CHARACTER_EXTENSIONS, SCENE_INTROS, SHOT_TYPES_SCRIPT, TIMES_OF_DAY, TRANSITIONS } from '@/lib/constants';
import { parseCue, parseHeading } from '@/script-core/heading';
import { blockText, offsetToPos } from './util';

export interface SmartItem {
  label: string;
  insert: string;
  hint?: string;
}

export interface SmartState {
  active: boolean;
  items: SmartItem[];
  index: number;
  from: number;
  to: number;
  kind: string;
  key: string;
  dismissed?: string;
}

export const smartKey = new PluginKey<SmartState>('smartType');
const EMPTY: SmartState = { active: false, items: [], index: 0, from: 0, to: 0, kind: '', key: '' };
const MAX = 10;

export interface SmartOptions {
  enabled: () => boolean;
  /** extra names known to the project (manual characters) */
  extraNames: () => string[];
  onChange: (s: SmartState) => void;
}

function docNames(state: EditorState): string[] {
  const counts = new Map<string, number>();
  state.doc.forEach((n) => {
    if (n.type.name !== 'character') return;
    const name = parseCue(blockText(n)).name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

function docSets(state: EditorState, exceptPos: number): string[] {
  const out: string[] = [];
  state.doc.forEach((n, offset) => {
    if (n.type.name !== 'scene_heading' || offset === exceptPos) return;
    const s = parseHeading(blockText(n)).set;
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}

function docTimes(state: EditorState): string[] {
  const out: string[] = [];
  state.doc.forEach((n) => {
    if (n.type.name !== 'scene_heading') return;
    const t = parseHeading(blockText(n)).time;
    if (t && !out.includes(t)) out.push(t);
  });
  return out;
}

const INTRO_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.?|I\/E\.?|INT\.|EXT\.|EST\.)\s+/i;

function compute(state: EditorState, opts: SmartOptions): SmartState {
  if (!opts.enabled()) return EMPTY;
  const sel = state.selection;
  if (!sel.empty || sel.$from.depth < 1) return EMPTY;
  const $from = sel.$from;
  const node = $from.parent;
  if ($from.parentOffset !== node.content.size) return EMPTY;
  const type = node.type.name;
  const blockStart = $from.before(1);
  const text = blockText(node);
  const key = `${blockStart}:${type}:${text}`;
  const posAt = (offset: number) => offsetToPos(node, blockStart, offset);
  const end = $from.pos;
  const mk = (kind: string, items: SmartItem[], fromOffset: number): SmartState =>
    items.length ? { active: true, items: items.slice(0, MAX), index: 0, from: posAt(fromOffset), to: end, kind, key } : { ...EMPTY, key };

  if (type === 'scene_heading') {
    const m = INTRO_RE.exec(text);
    if (!m) {
      const q = text.trim().toUpperCase();
      if (q.length > 9) return { ...EMPTY, key };
      const items = SCENE_INTROS.filter((i) => i.toUpperCase().startsWith(q) && i.trim() !== q).map((i) => ({ label: i.trim(), insert: i }));
      return mk('intro', items, 0);
    }
    const rest = text.slice(m[0].length);
    const dash = rest.search(/\s[-–—]\s/);
    if (dash < 0) {
      const q = rest.toUpperCase();
      const sets = docSets(state, blockStart);
      const items = sets
        .filter((s) => s.startsWith(q.trimStart()) && s !== q.trim())
        .map((s) => ({ label: s, insert: `${s} - `, hint: 'location' }));
      return mk('set', items, m[0].length);
    }
    const lastDash = Math.max(rest.lastIndexOf(' - '), rest.lastIndexOf(' – '), rest.lastIndexOf(' — '));
    const qStart = m[0].length + lastDash + 3;
    const q = text.slice(qStart).toUpperCase();
    const used = docTimes(state);
    const pool = [...new Set([...TIMES_OF_DAY, ...used])];
    const items = pool.filter((t) => t.startsWith(q) && t !== q).map((t) => ({ label: t, insert: t, hint: 'time' }));
    return mk('time', items, qStart);
  }

  if (type === 'character') {
    const paren = text.lastIndexOf('(');
    if (paren >= 0 && !text.slice(paren).includes(')')) {
      const q = text.slice(paren + 1).toUpperCase();
      const items = CHARACTER_EXTENSIONS.filter((e) => e.startsWith(q) && e !== q).map((e) => ({ label: `(${e})`, insert: `${e})`, hint: 'extension' }));
      return mk('ext', items, paren + 1);
    }
    if (text.includes(')')) return { ...EMPTY, key };
    const q = text.trim().toUpperCase();
    const names = [...new Set([...docNames(state), ...opts.extraNames().map((n) => n.toUpperCase())])];
    const items = names.filter((n) => n.startsWith(q) && n !== q).map((n) => ({ label: n, insert: n }));
    return mk('character', items, 0);
  }

  if (type === 'transition') {
    const q = text.trim().toUpperCase();
    const items = TRANSITIONS.filter((t) => t.startsWith(q) && t !== q).map((t) => ({ label: t, insert: t }));
    return mk('transition', items, 0);
  }

  if (type === 'shot') {
    const q = text.trim().toUpperCase();
    if (!q) return { ...EMPTY, key };
    const items = SHOT_TYPES_SCRIPT.filter((t) => t.startsWith(q) && t !== q).map((t) => ({ label: t, insert: t }));
    return mk('shot', items, 0);
  }
  return { ...EMPTY, key };
}

export function acceptSmart(view: EditorView, index?: number): boolean {
  const s = smartKey.getState(view.state);
  if (!s?.active) return false;
  const item = s.items[index ?? s.index];
  if (!item) return false;
  const tr = view.state.tr.insertText(item.insert, s.from, s.to);
  tr.setSelection(TextSelection.create(tr.doc, s.from + item.insert.length));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export function dismissSmart(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(smartKey, { dismiss: true }));
}

export function smartTypePlugin(opts: SmartOptions) {
  return new Plugin<SmartState>({
    key: smartKey,
    state: {
      init: () => EMPTY,
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(smartKey) as { dismiss?: boolean; index?: number } | undefined;
        if (meta?.dismiss) return { ...EMPTY, dismissed: prev.key };
        if (meta?.index != null && prev.active) return { ...prev, index: meta.index };
        if (!tr.docChanged && !tr.selectionSet) return prev;
        const next = compute(newState, opts);
        if (prev.dismissed && next.key === prev.dismissed) return { ...EMPTY, key: next.key, dismissed: prev.dismissed };
        return next;
      },
    },
    props: {
      handleKeyDown(view, e) {
        const s = smartKey.getState(view.state);
        if (!s?.active) return false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const n = s.items.length;
          const index = (s.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
          view.dispatch(view.state.tr.setMeta(smartKey, { index }));
          return true;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          return acceptSmart(view);
        }
        if (e.key === 'Escape') {
          dismissSmart(view);
          return true;
        }
        return false;
      },
    },
    view: () => ({
      update(view) {
        opts.onChange(smartKey.getState(view.state) ?? EMPTY);
      },
    }),
  });
}
