/* ==========================================================================
   Screenplay pagination engine (industry layout, Courier 12pt: 10 chars/inch,
   6 lines/inch). Produces exact pages for PDF/print, page-break positions for
   the editor's page view, and per-scene lengths in eighths of a page.
   Rules: scene headings/shots keep with the next paragraph, action splits at
   sentence ends (min 2 lines each side), dialogue splits with (MORE)/(CONT'D),
   parentheticals never end a page, dual dialogue stays together.
   ========================================================================== */
import type { ElementType, PaperSize, ScriptFormatSettings } from '@/types';
import { type Para, type Run, sliceRuns } from './paragraphs';
import { parseCue } from './heading';

export const LINES_PER_INCH = 6;
export const CHARS_PER_INCH = 10;
export const LINE_HEIGHT_IN = 1 / LINES_PER_INCH;

export interface Geometry {
  paper: PaperSize;
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  linesPerPage: number;
}

export function pageGeometry(paper: PaperSize): Geometry {
  const pageWidth = paper === 'a4' ? 8.27 : 8.5;
  const pageHeight = paper === 'a4' ? 11.69 : 11;
  const marginTop = 1;
  const marginBottom = 1;
  return {
    paper,
    pageWidth,
    pageHeight,
    marginTop,
    marginBottom,
    linesPerPage: Math.floor((pageHeight - marginTop - marginBottom) * LINES_PER_INCH + 1e-6),
  };
}

export type Align = 'left' | 'center' | 'right';

export interface ElemGeom {
  /** inches from the left page edge */
  left: number;
  /** inches */
  width: number;
  align: Align;
  /** blank lines before */
  before: number;
}

export function elementGeom(type: ElementType, s: Pick<ScriptFormatSettings, 'sceneHeadingSpacing'>, align?: string | null): ElemGeom {
  switch (type) {
    case 'scene_heading':
      return { left: 1.5, width: 6.0, align: 'left', before: s.sceneHeadingSpacing ?? 1 };
    case 'character':
      return { left: 3.5, width: 3.5, align: 'left', before: 1 };
    case 'parenthetical':
      return { left: 3.0, width: 2.5, align: 'left', before: 0 };
    case 'dialogue':
      return { left: 2.5, width: 3.5, align: 'left', before: 0 };
    case 'transition':
      return { left: 5.0, width: 2.5, align: 'right', before: 1 };
    case 'shot':
      return { left: 1.5, width: 6.0, align: 'left', before: 1 };
    case 'general':
    case 'action':
    default:
      return { left: 1.5, width: 6.0, align: (align as Align) || 'left', before: 1 };
  }
}

/** Dual dialogue column geometry (left / right column). */
export function dualGeom(type: ElementType, side: 'L' | 'R'): ElemGeom {
  const colLeft = side === 'L' ? 1.5 : 4.6;
  const colWidth = 2.9;
  if (type === 'character') return { left: colLeft + 0.8, width: colWidth - 0.8, align: 'left', before: 0 };
  if (type === 'parenthetical') return { left: colLeft + 0.4, width: colWidth - 0.6, align: 'left', before: 0 };
  return { left: colLeft, width: colWidth, align: 'left', before: 0 };
}

/* ---------------------------------------------------------------- wrapping */

export interface WrappedLine {
  from: number;
  to: number;
}

/** Greedy word wrap mirroring the editor (white-space: pre-wrap, break after spaces / hyphens). */
export function wrapText(text: string, firstMax: number, restMax = firstMax): WrappedLine[] {
  const out: WrappedLine[] = [];
  if (text.length === 0) return [{ from: 0, to: 0 }];
  let segStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i !== text.length && text[i] !== '\n') continue;
    const segEnd = i;
    let pos = segStart;
    if (segStart === segEnd) out.push({ from: segStart, to: segStart });
    while (pos < segEnd) {
      const max = Math.max(1, out.length === 0 ? firstMax : restMax);
      let trimmedEnd = segEnd;
      while (trimmedEnd > pos && text[trimmedEnd - 1] === ' ') trimmedEnd--;
      if (trimmedEnd - pos <= max) {
        out.push({ from: pos, to: trimmedEnd });
        break;
      }
      let lineEnd = -1;
      let next = -1;
      for (let j = Math.min(pos + max, segEnd); j > pos; j--) {
        if (text[j] === ' ') {
          let e = j;
          while (e > pos && text[e - 1] === ' ') e--;
          if (e > pos) {
            lineEnd = e;
            next = j;
            break;
          }
        }
        if (j < segEnd && text[j - 1] === '-' && j - 2 >= pos && /[A-Za-z0-9]/.test(text[j - 2]) && /[A-Za-z0-9]/.test(text[j])) {
          lineEnd = j;
          next = j;
          break;
        }
      }
      if (lineEnd < 0) {
        lineEnd = pos + max;
        next = pos + max;
      }
      out.push({ from: pos, to: lineEnd });
      pos = next;
      while (pos < segEnd && text[pos] === ' ') pos++;
    }
    segStart = i + 1;
  }
  return out;
}

/* ---------------------------------------------------------------- layout types */

export interface PLine {
  /** 0-based row from the top margin */
  row: number;
  left: number;
  width: number;
  align: Align;
  runs: Run[];
  type: ElementType;
  kind: 'text' | 'more' | 'contd';
  para: number;
  from: number;
  to: number;
  /** scene number to print in the margins (first line of a scene heading) */
  sceneNum?: string;
  /** element is part of a dual-dialogue block */
  dual?: 'L' | 'R';
}

export interface PPage {
  /** 1-based page number */
  number: number;
  lines: PLine[];
  rowsUsed: number;
}

export interface PageBreak {
  /** index of the page that starts here (1 = second page) */
  page: number;
  /** paragraph index & character offset of the first text on the new page */
  para: number;
  offset: number;
  /** rows used on the previous page (including a (MORE) line) */
  prevRows: number;
  more: boolean;
  /** CONT'D header line printed at the top of the new page */
  contd?: { text: string; left: number };
}

export interface Pagination {
  geometry: Geometry;
  pages: PPage[];
  breaks: PageBreak[];
  /** rows (lines incl. spacing) used by each scene */
  sceneRows: Map<string, number>;
  /** 1-based page where each scene starts */
  scenePage: Map<string, number>;
  /** 1-based page where each paragraph starts */
  paraPage: number[];
}

interface Item {
  role: 'text' | 'cue' | 'paren' | 'dial';
  type: ElementType;
  runs: Run[];
  left: number;
  width: number;
  align: Align;
  para: number;
  from: number;
  to: number;
  endsSentence: boolean;
  sceneNum?: string;
  dual?: 'L' | 'R';
}

type Row = Item[];

interface Block {
  kind: 'single' | 'dialogue' | 'dual';
  before: number;
  rows: Row[];
  keepWithNext: boolean;
  splittable: boolean;
  sceneId?: string;
  firstPara: number;
  /** dialogue: cue text used for CONT'D headers */
  cueText?: string;
  cueLeft?: number;
}

export interface PaginateOptions {
  settings: Pick<ScriptFormatSettings, 'sceneHeadingSpacing' | 'moreContd'>;
  paper: PaperSize;
  /** paragraph indexes of character cues that get an automatic (CONT'D) */
  contdParas?: Set<number>;
  /** scene number for each scene heading paragraph index */
  sceneNumbers?: Map<number, string>;
}

const SENTENCE_END = /[.!?…"')\]]\s*$/;

function itemsForPara(p: Para, index: number, geom: ElemGeom, role: Item['role'], displayText: string, extraRuns: Run[] | null, dual?: 'L' | 'R', sceneNum?: string): Item[] {
  const chars = Math.max(4, Math.round(geom.width * CHARS_PER_INCH));
  const hanging = p.type === 'parenthetical' && displayText.startsWith('(');
  const lines = wrapText(displayText, chars, hanging ? chars - 1 : chars);
  const runs = extraRuns ?? p.runs;
  return lines.map((ln, i) => {
    const text = displayText.slice(ln.from, ln.to);
    return {
      role,
      type: p.type,
      runs: extraRuns ? sliceRuns(runs, ln.from, ln.to) : sliceRuns(p.runs, ln.from, ln.to),
      left: geom.left + (hanging && i > 0 ? 0.1 : 0),
      width: geom.width - (hanging && i > 0 ? 0.1 : 0),
      align: geom.align,
      para: index,
      from: ln.from,
      to: ln.to,
      endsSentence: SENTENCE_END.test(text) || i === lines.length - 1,
      sceneNum: i === 0 ? sceneNum : undefined,
      dual,
    };
  });
}

function cueDisplay(p: Para, index: number, contd: Set<number> | undefined): { text: string; runs: Run[] | null } {
  if (contd?.has(index) && !/\(CONT['’]?D\)/i.test(p.text)) {
    const text = `${p.text.replace(/\s*\^\s*$/, '')} (CONT'D)`;
    return { text, runs: [...p.runs, { text: " (CONT'D)" }] };
  }
  return { text: p.text, runs: null };
}

function buildBlocks(paras: Para[], opts: PaginateOptions): Block[] {
  const s = opts.settings;
  const blocks: Block[] = [];
  let i = 0;
  while (i < paras.length) {
    const p = paras[i];
    if (p.type === 'character') {
      // dialogue group: cue + parentheticals/dialogue
      const group = collectDialogue(paras, i, opts, undefined);
      i = group.next;
      // dual: next group starts with a cue marked dual
      if (i < paras.length && paras[i].type === 'character' && paras[i].dual) {
        const left = collectDialogue(paras, group.start, opts, 'L');
        const right = collectDialogue(paras, i, opts, 'R');
        i = right.next;
        const n = Math.max(left.rows.length, right.rows.length);
        const rows: Row[] = [];
        for (let r = 0; r < n; r++) rows.push([...(left.rows[r] ?? []), ...(right.rows[r] ?? [])]);
        blocks.push({ kind: 'dual', before: 1, rows, keepWithNext: false, splittable: false, firstPara: group.start });
        continue;
      }
      blocks.push({
        kind: 'dialogue',
        before: elementGeom('character', s).before,
        rows: group.rows,
        keepWithNext: false,
        splittable: opts.settings.moreContd !== false,
        firstPara: group.start,
        cueText: group.cueText,
        cueLeft: elementGeom('character', s).left,
      });
      continue;
    }
    const g = elementGeom(p.type, s, p.align);
    const sceneNum = p.type === 'scene_heading' ? opts.sceneNumbers?.get(i) : undefined;
    const items = itemsForPara(p, i, g, 'text', p.text, null, undefined, sceneNum);
    blocks.push({
      kind: 'single',
      before: g.before,
      rows: items.map((it) => [it]),
      keepWithNext: p.type === 'scene_heading' || p.type === 'shot',
      splittable: p.type === 'action' || p.type === 'general',
      sceneId: p.type === 'scene_heading' ? p.sid : undefined,
      firstPara: i,
    });
    i++;
  }
  return blocks;
}

function collectDialogue(paras: Para[], start: number, opts: PaginateOptions, dual: 'L' | 'R' | undefined) {
  const s = opts.settings;
  const rows: Row[] = [];
  const cue = paras[start];
  const disp = cueDisplay(cue, start, opts.contdParas);
  const cueGeom = dual ? dualGeom('character', dual) : elementGeom('character', s);
  for (const it of itemsForPara(cue, start, cueGeom, 'cue', disp.text, disp.runs, dual)) rows.push([it]);
  let j = start + 1;
  while (j < paras.length && (paras[j].type === 'parenthetical' || paras[j].type === 'dialogue')) {
    const p = paras[j];
    const g = dual ? dualGeom(p.type, dual) : elementGeom(p.type, s);
    const role = p.type === 'parenthetical' ? 'paren' : 'dial';
    for (const it of itemsForPara(p, j, g, role, p.text, null, dual)) rows.push([it]);
    j++;
  }
  const parsed = parseCue(cue.text);
  const ext = parsed.extensions.filter((e) => !/^CONT/.test(e));
  const cueText = `${parsed.name}${ext.map((e) => ` (${e})`).join('')} (CONT'D)`;
  return { rows, next: j, start, cueText };
}

/* ---------------------------------------------------------------- paginate */

export function paginate(paras: Para[], opts: PaginateOptions): Pagination {
  const geometry = pageGeometry(opts.paper);
  const L = geometry.linesPerPage;
  const blocks = buildBlocks(paras, opts);
  const pages: PPage[] = [{ number: 1, lines: [], rowsUsed: 0 }];
  const breaks: PageBreak[] = [];
  const sceneRows = new Map<string, number>();
  const scenePage = new Map<string, number>();
  const paraPage: number[] = new Array(paras.length).fill(0);
  let row = 0;
  let currentScene: string | undefined;

  const addRows = (n: number) => {
    if (currentScene) sceneRows.set(currentScene, (sceneRows.get(currentScene) ?? 0) + n);
  };

  const place = (rows: Row[], startRow: number) => {
    const page = pages[pages.length - 1];
    rows.forEach((r, k) => {
      for (const it of r) {
        page.lines.push({
          row: startRow + k,
          left: it.left,
          width: it.width,
          align: it.align,
          runs: it.runs,
          type: it.type,
          kind: 'text',
          para: it.para,
          from: it.from,
          to: it.to,
          sceneNum: it.sceneNum,
          dual: it.dual,
        });
        if (!paraPage[it.para]) paraPage[it.para] = page.number;
      }
    });
  };

  const newPage = (para: number, offset: number, more: boolean, contd?: { text: string; left: number }) => {
    pages[pages.length - 1].rowsUsed = row;
    breaks.push({ page: pages.length, para, offset, prevRows: row, more, contd });
    pages.push({ number: pages.length + 1, lines: [], rowsUsed: 0 });
    row = 0;
  };

  const firstTextOf = (rows: Row[]): { para: number; offset: number } => {
    for (const r of rows) for (const it of r) return { para: it.para, offset: it.from };
    return { para: 0, offset: 0 };
  };

  const findSplit = (b: Block, avail: number): number | null => {
    const h = b.rows.length;
    if (b.kind === 'single') {
      if (h < 4) return null;
      const maxK = Math.min(avail, h - 2);
      for (let k = maxK; k >= 2; k--) if (b.rows[k - 1][0].endsSentence) return k;
      return h > 8 && maxK >= 2 ? maxK : null;
    }
    if (b.kind === 'dialogue') {
      const maxK = Math.min(avail - 1, h - 1); // leave room for (MORE)
      let fallback: number | null = null;
      for (let k = maxK; k >= 2; k--) {
        const last = b.rows[k - 1][0];
        if (last.role !== 'dial') continue;
        if (last.endsSentence) return k;
        if (fallback == null) fallback = k;
      }
      return fallback;
    }
    return null;
  };

  for (let bi = 0; bi < blocks.length; bi++) {
    let b = blocks[bi];
    if (b.sceneId) currentScene = b.sceneId;
    let guard = 0;
    while (guard++ < 1000) {
      const space = row === 0 ? 0 : b.before;
      const h = b.rows.length;
      const need = space + h;
      let keepNeed = 0;
      if (b.keepWithNext && bi + 1 < blocks.length) {
        const nb = blocks[bi + 1];
        keepNeed = nb.before + Math.min(nb.rows.length, nb.splittable ? 2 : nb.rows.length);
      }
      if (row + need <= L && (row + need + keepNeed <= L || row === 0)) {
        if (b.sceneId && !scenePage.has(b.sceneId)) scenePage.set(b.sceneId, pages.length);
        place(b.rows, row + space);
        addRows(space + h);
        row += space + h;
        break;
      }
      if (row === 0 && h > L) {
        // taller than a page: forced split
        const isDlg = b.kind === 'dialogue';
        const k = isDlg ? L - 1 : L;
        const first = b.rows.slice(0, k);
        if (b.sceneId && !scenePage.has(b.sceneId)) scenePage.set(b.sceneId, pages.length);
        place(first, 0);
        row = k;
        addRows(k);
        let contd: { text: string; left: number } | undefined;
        if (isDlg) {
          pages[pages.length - 1].lines.push(moreLine(b, row));
          row += 1;
          addRows(1);
          contd = { text: b.cueText ?? "(CONT'D)", left: b.cueLeft ?? 3.5 };
        }
        const rest = b.rows.slice(k);
        const ft = firstTextOf(rest);
        newPage(ft.para, ft.offset, isDlg, contd);
        b = remainder(b, rest, isDlg);
        continue;
      }
      if (row > 0 && b.splittable && !b.keepWithNext) {
        const avail = L - row - space;
        const k = findSplit(b, avail);
        if (k != null && k >= 1) {
          const isDlg = b.kind === 'dialogue';
          if (b.sceneId && !scenePage.has(b.sceneId)) scenePage.set(b.sceneId, pages.length);
          place(b.rows.slice(0, k), row + space);
          row += space + k;
          addRows(space + k);
          let contd: { text: string; left: number } | undefined;
          if (isDlg) {
            pages[pages.length - 1].lines.push(moreLine(b, row));
            row += 1;
            addRows(1);
            contd = { text: b.cueText ?? "(CONT'D)", left: b.cueLeft ?? 3.5 };
          }
          const rest = b.rows.slice(k);
          const ft = firstTextOf(rest);
          newPage(ft.para, ft.offset, isDlg, contd);
          b = remainder(b, rest, isDlg);
          continue;
        }
      }
      if (row === 0) {
        // can't satisfy keep-with-next even on an empty page: place anyway
        if (b.sceneId && !scenePage.has(b.sceneId)) scenePage.set(b.sceneId, pages.length);
        place(b.rows, 0);
        addRows(h);
        row += h;
        break;
      }
      newPage(b.firstPara, 0, false);
    }
  }
  pages[pages.length - 1].rowsUsed = row;
  return { geometry, pages, breaks, sceneRows, scenePage, paraPage };

  function moreLine(b: Block, atRow: number): PLine {
    return {
      row: atRow,
      left: b.cueLeft ?? 3.5,
      width: 3.5,
      align: 'left',
      runs: [{ text: '(MORE)' }],
      type: 'character',
      kind: 'more',
      para: b.firstPara,
      from: 0,
      to: 0,
    };
  }

  function remainder(b: Block, rest: Row[], isDlg: boolean): Block {
    if (!isDlg) return { ...b, before: 0, rows: rest, sceneId: undefined, keepWithNext: false };
    const contdItem: Item = {
      role: 'cue',
      type: 'character',
      runs: [{ text: b.cueText ?? "(CONT'D)" }],
      left: b.cueLeft ?? 3.5,
      width: 3.5,
      align: 'left',
      para: b.firstPara,
      from: 0,
      to: 0,
      endsSentence: false,
    };
    // mark as contd kind when placed
    const rows: Row[] = [[{ ...contdItem }], ...rest];
    return { ...b, before: 0, rows, sceneId: undefined, firstPara: rest[0]?.[0]?.para ?? b.firstPara, keepWithNext: false };
  }
}

/** Eighths of a page from a row count (min 1/8 for any non-empty scene). */
export function rowsToEighths(rows: number, linesPerPage: number): number {
  if (rows <= 0) return 0;
  return Math.max(1, Math.round(rows / (linesPerPage / 8)));
}
