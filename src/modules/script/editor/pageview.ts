/* Page view: renders the editor as real screenplay pages (page breaks with
   (MORE)/(CONT'D), page numbers, scene numbers, automatic CONT'D) using the
   same pagination engine as the PDF export. */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { PaperSize, SceneMeta, ScriptFormatSettings } from '@/types';
import { elementGeom, paginate, type Pagination } from '@/script-core/pagination';
import { computeContd, numberScenes } from '@/script-core/model';
import { nodeToParas, offsetToPos } from './util';

export interface PageViewOptions {
  settings: () => { script: ScriptFormatSettings; paper: PaperSize; metas: Record<string, SceneMeta> };
  onPaginate?: (info: PageInfo) => void;
}

export interface PageInfo {
  pagination: Pagination;
  /** document position where each page starts (index 0 = page 1) */
  pageStarts: number[];
  sceneNumbers: Map<string, string>;
}

export const pageKey = new PluginKey<DecorationSet>('pageview');

const ROW = (n: number) => `calc(${n} * 1in / 6)`;

function el(tag: string, cls: string, style?: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  return e;
}

function pageBreakDom(opts: {
  pageNumber: number;
  fillRows: number;
  more: boolean;
  moreLeft: number;
  contd?: { text: string; left: number };
  pageWidth: number;
  offsetLeft: number;
  header?: string;
  footer?: string;
}): HTMLElement {
  const root = el('span', 'sp-pb', { marginLeft: `-${opts.offsetLeft}in`, width: `${opts.pageWidth}in` });
  root.contentEditable = 'false';
  const fill = el('span', 'sp-pb-fill', { height: `calc(${ROW(opts.fillRows)} + 1in)` });
  if (opts.more) fill.appendChild(el('span', 'sp-pb-more', { paddingLeft: `${opts.moreLeft}in` }, '(MORE)'));
  if (opts.footer) fill.appendChild(el('span', 'sp-pb-footer', undefined, opts.footer));
  root.appendChild(fill);
  root.appendChild(el('span', 'sp-pb-gap'));
  const head = el('span', 'sp-pb-head');
  if (opts.header) head.appendChild(el('span', 'sp-pb-htext', undefined, opts.header));
  head.appendChild(el('span', 'sp-pb-num', undefined, `${opts.pageNumber}.`));
  root.appendChild(head);
  if (opts.contd) root.appendChild(el('span', 'sp-pb-contd', { paddingLeft: `${opts.contd.left}in` }, opts.contd.text));
  return root;
}

function compute(state: EditorState, opts: PageViewOptions): { set: DecorationSet; info: PageInfo } {
  const { script, paper, metas } = opts.settings();
  const doc = state.doc;
  const { paras, starts } = nodeToParas(doc);
  const headingIdx: number[] = [];
  paras.forEach((p, i) => p.type === 'scene_heading' && headingIdx.push(i));
  const numbers = numberScenes(
    headingIdx.map((i) => paras[i]),
    metas,
  );
  const sceneNumbers = new Map<number, string>();
  const bySid = new Map<string, string>();
  headingIdx.forEach((pi, k) => {
    sceneNumbers.set(pi, numbers[k]);
    if (paras[pi].sid) bySid.set(paras[pi].sid!, numbers[k]);
  });
  const contdParas = computeContd(paras, script.autoContd);
  const pagination = paginate(paras, { settings: script, paper, contdParas, sceneNumbers });
  const L = pagination.geometry.linesPerPage;
  const pageWidth = pagination.geometry.pageWidth;
  const decos: Decoration[] = [];

  // scene numbers
  for (const pi of headingIdx) {
    const node = doc.child(pi);
    decos.push(Decoration.node(starts[pi], starts[pi] + node.nodeSize, { 'data-num': sceneNumbers.get(pi) ?? '' }));
  }
  // automatic (CONT'D)
  for (const pi of contdParas) {
    const node = doc.child(pi);
    const end = starts[pi] + 1 + node.content.size;
    decos.push(
      Decoration.widget(end, () => el('span', 'sp-contd', undefined, " (CONT'D)"), { side: 1, key: `contd-${pi}`, ignoreSelection: true }),
    );
  }
  // page breaks
  const pageStarts = [0];
  for (const b of pagination.breaks) {
    const node = doc.child(b.para);
    const geom = elementGeom(node.type.name as any, script, node.attrs.align);
    const atStart = b.offset === 0;
    const pos = atStart ? starts[b.para] : offsetToPos(node, starts[b.para], b.offset);
    pageStarts.push(pos);
    const offsetLeft = atStart ? 1.5 : geom.left + (node.type.name === 'parenthetical' ? 0.1 : 0);
    const fillRows = Math.max(0, L - b.prevRows + (b.more ? 1 : 0));
    const pageNumber = b.page + 1;
    const key = `pb-${pageNumber}-${fillRows}-${b.more ? 1 : 0}-${b.contd?.text ?? ''}-${atStart ? 'b' : 'i'}-${offsetLeft}-${script.header ?? ''}-${script.footer ?? ''}`;
    decos.push(
      Decoration.widget(
        pos,
        () =>
          pageBreakDom({
            pageNumber,
            fillRows,
            more: b.more,
            moreLeft: (b.contd?.left ?? 3.5) - 1.5 + 1.5,
            contd: b.contd ? { text: b.contd.text, left: b.contd.left } : undefined,
            pageWidth,
            offsetLeft,
            header: script.header,
            footer: script.footer,
          }),
        { side: -1, key, ignoreSelection: true, stopEvent: () => true },
      ),
    );
    if (atStart) decos.push(Decoration.node(starts[b.para], starts[b.para] + node.nodeSize, { class: 'pg-top' }));
  }
  // last page filler
  const last = pagination.pages[pagination.pages.length - 1];
  const lastRows = Math.max(0, L - (last?.rowsUsed ?? 0));
  decos.push(
    Decoration.widget(
      doc.content.size,
      () => {
        const f = el('span', 'sp-pb sp-pb-last', { marginLeft: '-1.5in', width: `${pageWidth}in` });
        f.contentEditable = 'false';
        const fill = el('span', 'sp-pb-fill', { height: `calc(${ROW(lastRows)} + 1in)` });
        if (script.footer) fill.appendChild(el('span', 'sp-pb-footer', undefined, script.footer));
        f.appendChild(fill);
        return f;
      },
      { side: 1, key: `last-${lastRows}-${script.footer ?? ''}`, ignoreSelection: true, stopEvent: () => true },
    ),
  );
  // page 1 header
  if (script.header || script.firstPageNumber) {
    decos.push(
      Decoration.widget(
        0,
        () => {
          const h = el('span', 'sp-first-head', { width: `${pageWidth}in` });
          h.contentEditable = 'false';
          if (script.header) h.appendChild(el('span', 'sp-pb-htext', undefined, script.header));
          if (script.firstPageNumber) h.appendChild(el('span', 'sp-pb-num', undefined, '1.'));
          return h;
        },
        { side: -1, key: `first-${script.header ?? ''}-${script.firstPageNumber}`, ignoreSelection: true },
      ),
    );
  }
  return { set: DecorationSet.create(doc, decos), info: { pagination, pageStarts, sceneNumbers: bySid } };
}

export function pageViewPlugin(opts: PageViewOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = (view: EditorView) => {
    timer = null;
    if ((view as any).isDestroyed) return;
    const { set, info } = compute(view.state, opts);
    view.dispatch(view.state.tr.setMeta(pageKey, set).setMeta('addToHistory', false));
    opts.onPaginate?.(info);
  };
  return new Plugin<DecorationSet>({
    key: pageKey,
    state: {
      init: (_c, state) => compute(state, opts).set,
      apply(tr, prev) {
        const meta = tr.getMeta(pageKey) as DecorationSet | undefined;
        if (meta) return meta;
        return tr.docChanged ? prev.map(tr.mapping, tr.doc) : prev;
      },
    },
    props: {
      decorations(state) {
        return pageKey.getState(state);
      },
    },
    view(view) {
      // report initial pagination
      setTimeout(() => run(view), 0);
      return {
        update(v, prevState) {
          const force = v.state.tr.getMeta('repaginate');
          void force;
          if (v.state.doc !== prevState.doc) {
            if (timer) clearTimeout(timer);
            const size = v.state.doc.childCount;
            timer = setTimeout(() => run(v), size > 1500 ? 450 : 180);
          }
        },
        destroy() {
          if (timer) clearTimeout(timer);
        },
      };
    },
  });
}

/** Force a recompute (e.g. after settings changed). */
export function repaginate(view: EditorView, opts: PageViewOptions) {
  const { set, info } = compute(view.state, opts);
  view.dispatch(view.state.tr.setMeta(pageKey, set).setMeta('addToHistory', false));
  opts.onPaginate?.(info);
}
