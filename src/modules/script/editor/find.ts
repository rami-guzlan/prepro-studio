/* Find & replace highlighting for the screenplay editor. */
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

export interface FindState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  matches: { from: number; to: number }[];
  current: number;
}

export const findKey = new PluginKey<FindState>('find');
const EMPTY: FindState = { query: '', matchCase: false, wholeWord: false, matches: [], current: -1 };

export function searchDoc(state: EditorState, query: string, matchCase: boolean, wholeWord: boolean) {
  const out: { from: number; to: number }[] = [];
  if (!query) return out;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, matchCase ? 'gu' : 'giu');
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const map: number[] = [];
    node.forEach((child, off) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + off + i);
        text += child.text;
      } else {
        map.push(pos + 1 + off);
        text += '\n';
      }
    });
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      out.push({ from: map[m.index], to: map[m.index + m[0].length - 1] + 1 });
    }
    return false;
  });
  return out;
}

export function findPlugin() {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => EMPTY,
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
        if (meta) {
          const next = { ...prev, ...meta };
          if (meta.query !== undefined || meta.matchCase !== undefined || meta.wholeWord !== undefined) {
            next.matches = searchDoc(state, next.query, next.matchCase, next.wholeWord);
            if (meta.current === undefined) {
              const sel = state.selection.from;
              const idx = next.matches.findIndex((m) => m.from >= sel);
              next.current = next.matches.length ? (idx >= 0 ? idx : 0) : -1;
            }
          }
          return next;
        }
        if (tr.docChanged && prev.query) {
          const matches = searchDoc(state, prev.query, prev.matchCase, prev.wholeWord);
          return { ...prev, matches, current: Math.min(prev.current, matches.length - 1) };
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        const s = findKey.getState(state);
        if (!s || !s.query || !s.matches.length) return null;
        return DecorationSet.create(
          state.doc,
          s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'sp-find sp-find-current' : 'sp-find' })),
        );
      },
    },
  });
}

export function setFind(view: EditorView, patch: Partial<FindState>) {
  view.dispatch(view.state.tr.setMeta(findKey, patch).setMeta('addToHistory', false));
}

export function gotoMatch(view: EditorView, dir: 1 | -1) {
  const s = findKey.getState(view.state);
  if (!s || !s.matches.length) return;
  const current = (s.current + dir + s.matches.length) % s.matches.length;
  const m = s.matches[current];
  const tr = view.state.tr.setMeta(findKey, { current }).setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView();
  view.dispatch(tr);
}

export function replaceCurrent(view: EditorView, replacement: string) {
  const s = findKey.getState(view.state);
  if (!s || s.current < 0 || !s.matches[s.current]) return;
  const m = s.matches[s.current];
  view.dispatch(view.state.tr.insertText(replacement, m.from, m.to));
  gotoMatch(view, 1);
}

export function replaceAll(view: EditorView, replacement: string): number {
  const s = findKey.getState(view.state);
  if (!s || !s.matches.length) return 0;
  const tr = view.state.tr;
  for (let i = s.matches.length - 1; i >= 0; i--) tr.insertText(replacement, s.matches[i].from, s.matches[i].to);
  view.dispatch(tr);
  return s.matches.length;
}
