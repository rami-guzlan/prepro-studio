/* Editor plugins: unique scene ids, uppercase/smart-format input, paste. */
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Slice, Fragment, Node as PMNode } from 'prosemirror-model';
import { screenplaySchema as schema, UPPERCASE_ELEMENTS } from '@/script-core/schema';
import type { ElementType } from '@/types';
import { uid } from '@/lib/id';
import { parseFountain } from '@/script-core/fountain';
import { parasToDoc } from '@/script-core/paragraphs';
import { convertBlock } from './commands';
import { blockText } from './util';

/** Every scene heading gets a unique, stable sid (copies get a fresh one). */
export function sceneIdPlugin() {
  return new Plugin({
    key: new PluginKey('sceneIds'),
    appendTransaction(trs, _old, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      const seen = new Set<string>();
      let tr = null as ReturnType<typeof state.tr.setNodeMarkup> | null;
      state.doc.forEach((node, offset) => {
        if (node.type.name !== 'scene_heading') return;
        const sid = node.attrs.sid as string | null;
        if (!sid || seen.has(sid)) {
          tr = (tr ?? state.tr).setNodeMarkup(offset, undefined, { ...node.attrs, sid: uid('sc') });
        } else seen.add(sid);
      });
      return tr;
    },
  });
}

const INTRO_TYPED = /^(int|ext|est|i\/e|int\.?\/ext|ext\.?\/int)\.?$/i;

/** Uppercasing, ")" skip-over and smart formatting while typing. */
export function inputPlugin(opts: { smartFormat: () => boolean }) {
  return new Plugin({
    key: new PluginKey('screenplayInput'),
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        const $from = state.doc.resolve(from);
        if ($from.depth < 1) return false;
        const node = $from.parent;
        const type = node.type.name as ElementType;
        const blockPos = $from.before(1);
        const full = blockText(node);
        const before = full.slice(0, $from.parentOffset);

        // skip over an auto-inserted closing parenthesis
        if (type === 'parenthetical' && text === ')' && from === to && state.doc.textBetween(from, Math.min(from + 1, $from.end())) === ')') {
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
          return true;
        }

        if (opts.smartFormat() && type === 'action' && from === to) {
          // "int. " at the start of an action line -> scene heading
          if (text === ' ' && INTRO_TYPED.test(before.trim()) && before.trim() === full.trim()) {
            const intro = before.trim().toUpperCase();
            const norm = /^int$/i.test(intro) ? 'INT.' : /^ext$/i.test(intro) ? 'EXT.' : /^est$/i.test(intro) ? 'EST.' : /^i\/e$/i.test(intro) ? 'I/E.' : intro.endsWith('.') ? intro : intro + '.';
            const tr = state.tr.insertText(`${norm} `, blockPos + 1, blockPos + 1 + node.content.size);
            convertBlock(tr, blockPos, 'scene_heading');
            const n = tr.doc.nodeAt(blockPos)!;
            tr.setSelection(TextSelection.create(tr.doc, blockPos + 1 + n.content.size));
            view.dispatch(tr);
            return true;
          }
          // "CUT TO:" typed as an all-caps action line -> transition
          if (text === ':' && $from.parentOffset === node.content.size && /^[A-Z][A-Z .]*\sTO$/.test(before.trim())) {
            const tr = state.tr.insertText(':', from, to);
            convertBlock(tr, blockPos, 'transition');
            view.dispatch(tr);
            return true;
          }
        }

        if (UPPERCASE_ELEMENTS.has(type) && text !== text.toUpperCase()) {
          view.dispatch(state.tr.insertText(text.toUpperCase(), from, to));
          return true;
        }
        return false;
      },

      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html') ?? '';
        if (html.includes('data-el=')) return false; // from our own editor: keep elements
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!text.includes('\n')) {
          // single line: respect uppercase elements
          const $from = view.state.selection.$from;
          if ($from.depth >= 1 && UPPERCASE_ELEMENTS.has($from.parent.type.name as ElementType) && text) {
            view.dispatch(view.state.tr.insertText(text.replace(/\s+/g, ' ').toUpperCase()).scrollIntoView());
            return true;
          }
          return false;
        }
        const parsed = parseFountain(text);
        if (!parsed.paras.length) return false;
        const doc = PMNode.fromJSON(schema, parasToDoc(parsed.paras));
        const { $from, empty } = view.state.selection;
        if (empty && $from.depth >= 1 && $from.parent.content.size === 0) {
          // pasting into an empty element: insert the pasted elements as they are
          const tr = view.state.tr.replaceWith($from.before(1), $from.after(1), doc.content);
          const end = $from.before(1) + doc.content.size;
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, end - 1)), -1));
          view.dispatch(tr.scrollIntoView());
          return true;
        }
        const slice = new Slice(Fragment.from(doc.content), 1, 1);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
  });
}
