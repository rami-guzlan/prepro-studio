/* The screenplay editor (ProseMirror) with Final Draft-style keyboard flow,
   SmartType, live page view, find/replace, tags and notes. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { EditorState, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, chainCommands, deleteSelection, joinBackward, selectNodeBackward } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import type { ElementType } from '@/types';
import { screenplaySchema as schema, ELEMENT_TYPES, ELEMENT_SHORTCUTS, ELEMENT_LABELS } from '@/script-core/schema';
import { getProject, update, useProject, useProjectStore } from '@/store/project';
import { registerPreSave } from '@/store/autosave';
import { syncCharactersDraft } from '@/derived/script';
import { BREAKDOWN_CATEGORIES } from '@/lib/constants';
import { openContextMenu, type MenuItem } from '@/ui';
import { emptyScriptDoc } from '@/store/defaults';
import { enterCommand, hardBreak, setElement, shiftTabCommand, tabCommand, toggleDual } from './commands';
import { smartTypePlugin, smartKey, acceptSmart } from './smartType';
import { sceneIdPlugin, inputPlugin } from './plugins';
import { pageViewPlugin, repaginate, type PageViewOptions } from './pageview';
import { findPlugin } from './find';
import { sceneIdAtIndex } from './util';
import { addNote, tagSelection, untag } from './actions';
import { useScriptUI } from '../scriptUI';
import { SmartPopup } from './SmartPopup';

function docFromJSON(json: unknown): PMNode {
  try {
    const d = PMNode.fromJSON(schema, json);
    d.check();
    return d;
  } catch (e) {
    console.error('Invalid script document, starting empty', e);
    return PMNode.fromJSON(schema, emptyScriptDoc());
  }
}

export function ScreenplayEditor() {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastWritten = useRef<unknown>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settings = useProject((p) => p.settings.script);
  const paper = useProject((p) => p.settings.paperSize);
  const metas = useProject((p) => p.scenes);
  const storeDoc = useProject((p) => p.script.doc);
  const showTags = useScriptUI((s) => s.showTags);

  // latest values for plugins (read lazily)
  const live = useRef({ settings, paper, metas });
  live.current = { settings, paper, metas };

  const pageOpts = useRef<PageViewOptions>({
    settings: () => ({ script: live.current.settings, paper: live.current.paper, metas: live.current.metas }),
    onPaginate: (info) => {
      const v = viewRef.current;
      const page = v ? pageOfPos(info.pageStarts, v.state.selection.from) : 1;
      useScriptUI.setState({ pageInfo: info, page });
    },
  });

  const flush = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const v = viewRef.current;
    if (!v || !(v as any).__dirty) return;
    (v as any).__dirty = false;
    const json = v.state.doc.toJSON();
    lastWritten.current = json;
    update(
      (d) => {
        d.script.doc = json;
        d.script.revision = (d.script.revision ?? 0) + 1;
        syncCharactersDraft(d);
      },
      { history: false },
    );
    // immer may have frozen a copy: remember what the store now holds
    lastWritten.current = useProjectStore.getState().project?.script.doc;
  };

  const createState = (json: unknown) => {
    const ctx = { settings: () => live.current.settings };
    const elementKeys: Record<string, any> = {};
    for (const t of ELEMENT_TYPES) {
      elementKeys[`Mod-${ELEMENT_SHORTCUTS[t]}`] = setElement(t);
      elementKeys[`Alt-${ELEMENT_SHORTCUTS[t]}`] = setElement(t);
    }
    const plugins: Plugin[] = [
      smartTypePlugin({
        enabled: () => live.current.settings.smartType,
        extraNames: () => getProject().characters.map((c) => c.name),
        onChange: (s) => {
          const prev = useScriptUI.getState().smart;
          if (prev !== s) useScriptUI.setState({ smart: s });
        },
      }),
      keymap({
        Enter: enterCommand(ctx),
        Tab: tabCommand(ctx),
        'Shift-Tab': shiftTabCommand(ctx),
        'Shift-Enter': hardBreak,
        'Mod-Enter': hardBreak,
        'Mod-b': toggleMark(schema.marks.bold),
        'Mod-i': toggleMark(schema.marks.italic),
        'Mod-u': toggleMark(schema.marks.underline),
        'Mod-d': toggleDual,
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        Backspace: chainCommands(deleteSelection, joinBackward, selectNodeBackward),
        ...elementKeys,
      }),
      keymap(baseKeymap),
      history({ depth: 500, newGroupDelay: 600 }),
      sceneIdPlugin(),
      inputPlugin({ smartFormat: () => live.current.settings.smartFormat }),
      pageViewPlugin(pageOpts.current),
      findPlugin(),
    ];
    return EditorState.create({ doc: docFromJSON(json), plugins });
  };

  // mount
  useLayoutEffect(() => {
    const initial = getProject().script.doc;
    lastWritten.current = initial;
    const view = new EditorView(mountRef.current!, {
      state: createState(initial),
      attributes: { class: 'sp-page', spellcheck: 'true', 'data-gramm': 'false' },
      dispatchTransaction(tr) {
        const v = viewRef.current!;
        const newState = v.state.apply(tr);
        v.updateState(newState);
        if (tr.docChanged) {
          (v as any).__dirty = true;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(flush, 700);
        }
        if (tr.docChanged || tr.selectionSet) reportSelection(v);
      },
      handleDOMEvents: {
        contextmenu(view, e) {
          openContextMenu(e, contextItems(view, e as MouseEvent));
          return true;
        },
      },
    });
    viewRef.current = view;
    useScriptUI.setState({ view });
    reportSelection(view);
    const offPre = registerPreSave(flush);
    return () => {
      offPre();
      flush();
      useScriptUI.setState({ view: null, smart: null });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // external document changes (import, backup restore, AI agent edits)
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    if (storeDoc === lastWritten.current) return;
    // only reload if the store doc really differs from the editor content
    const incoming = JSON.stringify(storeDoc);
    if (incoming === JSON.stringify(v.state.doc.toJSON())) {
      lastWritten.current = storeDoc;
      return;
    }
    lastWritten.current = storeDoc;
    // apply as one editor transaction so Ctrl+Z in the script reverts it; only the changed
    // range is replaced, so the caret stays put when someone else edits another part
    const next = docFromJSON(storeDoc);
    try {
      const cur = v.state.doc.content;
      const start = cur.findDiffStart(next.content);
      if (start == null) return;
      let { a: endA, b: endB } = cur.findDiffEnd(next.content) ?? { a: cur.size, b: next.content.size };
      const overlap = start - Math.min(endA, endB);
      if (overlap > 0) {
        endA += overlap;
        endB += overlap;
      }
      const tr = v.state.tr.replace(start, endA, next.slice(start, endB));
      tr.setMeta('external', true);
      v.dispatch(tr);
    } catch {
      v.updateState(createState(storeDoc));
    }
    reportSelection(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDoc]);

  // settings that affect layout
  useEffect(() => {
    const v = viewRef.current;
    if (v) repaginate(v, pageOpts.current);
  }, [settings, paper, metas]);

  const geomW = paper === 'a4' ? 8.27 : 8.5;
  const snClass = settings.sceneNumbers === 'none' ? '' : `sn-${settings.sceneNumbers}`;
  const fontClass = settings.font === 'Courier New' ? 'font-cn' : '';

  return (
    <div
      className={['sp-editor', snClass, fontClass, settings.sceneHeadingBold ? 'sh-bold' : '', settings.sceneHeadingSpacing === 2 ? 'sh-2' : '', showTags ? 'show-tags' : '', settings.pageView ? 'page-view' : 'draft-view']
        .filter(Boolean)
        .join(' ')}
      style={{ ['--sp-pw' as any]: `${geomW}in`, ['--sp-right' as any]: `${(geomW - 7.5).toFixed(2)}in` }}
    >
      <div ref={mountRef} className="sp-mount" />
      <SmartPopup />
    </div>
  );
}

function pageOfPos(starts: number[], pos: number): number {
  let page = 1;
  for (let i = 0; i < starts.length; i++) if (pos >= starts[i]) page = i + 1;
  return page;
}

function reportSelection(view: EditorView) {
  const { $from, empty, from } = view.state.selection;
  const element = ($from.depth >= 1 ? $from.parent.type.name : 'action') as ElementType;
  const idx = $from.depth >= 1 ? $from.index(0) : 0;
  const sceneId = sceneIdAtIndex(view.state.doc, idx);
  const marks = $from.marks();
  const cursorTags = marks.filter((m) => m.type === schema.marks.tag).map((m) => ({ cat: m.attrs.cat as string, id: m.attrs.id as string }));
  const noteMark = marks.find((m) => m.type === schema.marks.note);
  const info = useScriptUI.getState().pageInfo;
  const page = info ? pageOfPos(info.pageStarts, from) : 1;
  const s = useScriptUI.getState();
  if (s.element !== element || s.sceneId !== sceneId || s.hasSelection !== !empty || s.page !== page || JSON.stringify(s.cursorTags) !== JSON.stringify(cursorTags) || s.cursorNote !== (noteMark?.attrs.id ?? null)) {
    useScriptUI.setState({ element, sceneId, hasSelection: !empty, page, cursorTags, cursorNote: noteMark?.attrs.id ?? null });
  }
}

function spellingItems(view: EditorView, e: MouseEvent): MenuItem[] {
  const spell = (window as any).prepro?.spell;
  if (!spell) return [];
  const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
  if (!hit) return [];
  const $p = view.state.doc.resolve(hit.pos);
  if ($p.depth < 1) return [];
  const text = $p.parent.textContent;
  let a = $p.parentOffset;
  let b = a;
  while (a > 0 && /[\p{L}'’]/u.test(text[a - 1])) a--;
  while (b < text.length && /[\p{L}'’]/u.test(text[b])) b++;
  const word = text.slice(a, b).replace(/^['’]+|['’]+$/g, '');
  if (word.length < 2 || !spell.isMisspelled(word)) return [];
  const from = $p.start() + a;
  const to = $p.start() + b;
  const suggestions: string[] = (spell.suggestions(word) ?? []).slice(0, 6);
  const items: MenuItem[] = [{ header: `Spelling: “${word}”` }];
  for (const s of suggestions) {
    items.push({
      label: s,
      onClick: () => {
        const isUpper = word === word.toUpperCase();
        view.dispatch(view.state.tr.insertText(isUpper ? s.toUpperCase() : s, from, to));
        view.focus();
      },
    });
  }
  if (!suggestions.length) items.push({ label: 'No suggestions', disabled: true });
  items.push({ label: 'Add to dictionary', onClick: () => spell.add(word) }, { separator: true });
  return items;
}

function contextItems(view: EditorView, e: MouseEvent): MenuItem[] {
  const items: MenuItem[] = [...spellingItems(view, e)];
  const hasSel = !view.state.selection.empty;
  if (hasSel) {
    items.push(
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => { view.focus(); document.execCommand('cut'); } },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => { view.focus(); document.execCommand('copy'); } },
      { separator: true },
    );
  }
  items.push({ header: 'Element' });
  for (const t of ELEMENT_TYPES) {
    items.push({
      label: ELEMENT_LABELS[t],
      shortcut: `Ctrl+${ELEMENT_SHORTCUTS[t]}`,
      checked: view.state.selection.$from.parent.type.name === t,
      onClick: () => {
        setElement(t)(view.state, view.dispatch);
        view.focus();
      },
    });
  }
  items.push({ separator: true }, { header: hasSel ? 'Tag selection as' : 'Tag word as' });
  for (const c of BREAKDOWN_CATEGORIES.slice(0, 10)) {
    items.push({ label: c.label, onClick: () => tagSelection(view, c.id) });
  }
  items.push({ label: 'More categories… (toolbar Tag menu)', disabled: true });
  items.push({ separator: true });
  items.push({ label: 'Remove tag', onClick: () => untag(view) });
  items.push({ label: 'Add script note…', shortcut: 'Ctrl+Alt+M', onClick: () => addNote(view) });
  items.push({ label: 'Toggle dual dialogue', shortcut: 'Ctrl+D', onClick: () => toggleDual(view.state, view.dispatch) });
  void acceptSmart;
  void smartKey;
  return items;
}
