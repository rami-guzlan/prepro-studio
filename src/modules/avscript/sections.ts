/* Sections of an A/V script. A section is a segment band (AVRow.segment on its first
   row) plus every row up to the next band; rows before the first band form a leading
   block without a band, which always stays first.

   Bands belong to POSITIONS, not to shots: moving a row keeps every band where it is
   (the row moves in or out of sections), and a section moves as a whole block. All
   functions work in place on the rows array (an immer draft inside update()). */
import type { AVRow } from '@/types';

export interface AVBlock {
  /** first row index */
  start: number;
  /** index after the last row */
  end: number;
  /** id of the row carrying the band (undefined for the leading block) */
  bandId?: string;
}

export function blocksOf(rows: readonly AVRow[]): AVBlock[] {
  const out: AVBlock[] = [];
  rows.forEach((r, i) => {
    if (r.segment != null || i === 0) out.push({ start: i, end: i + 1, bandId: r.segment != null ? r.id : undefined });
    else out[out.length - 1].end = i + 1;
  });
  return out;
}

const blockAt = (blocks: AVBlock[], index: number) => blocks.findIndex((b) => index >= b.start && index < b.end);

interface Group {
  band?: string;
  items: AVRow[];
}

function groupsOf(rows: readonly AVRow[]): Group[] {
  return blocksOf(rows).map((b) => ({ band: b.bandId ? rows[b.start].segment : undefined, items: rows.slice(b.start, b.end) }));
}

/** Write groups back: each band goes on its group's first row, every other row loses its band. */
function writeGroups(rows: AVRow[], groups: Group[]) {
  const flat: AVRow[] = [];
  for (const g of groups) {
    g.items.forEach((r, i) => {
      if (i === 0 && g.band != null) r.segment = g.band;
      else delete r.segment;
      flat.push(r);
    });
  }
  rows.splice(0, rows.length, ...flat);
}

function locate(groups: Group[], id: string): { g: number; i: number } {
  for (let g = 0; g < groups.length; g++) {
    const i = groups[g].items.findIndex((r) => r.id === id);
    if (i >= 0) return { g, i };
  }
  return { g: -1, i: -1 };
}

/** Drag a row onto the row at `to`: the row leaves its section and joins the target row's
    section (before it when moving up, after it when moving down); bands stay with their
    sections. A section's only row carries its band along (a band never sits alone). */
export function moveRowKeepBands(rows: AVRow[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
  const moving = rows[from];
  const target = rows[to];
  const groups = groupsOf(rows);
  const src = locate(groups, moving.id);
  if (groups[src.g].items.length === 1 && groups[src.g].band != null) {
    // a one-row section: plain move, band included
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    return;
  }
  groups[src.g].items.splice(src.i, 1);
  const dst = locate(groups, target.id);
  groups[dst.g].items.splice(from < to ? dst.i + 1 : dst.i, 0, moving);
  writeGroups(rows, groups);
}

/** Alt+↑/↓: one step. Inside a section the row swaps with its neighbour; at a section's
    edge it crosses into the next / previous section (first row there, or last row). */
export function stepRow(rows: AVRow[], index: number, dir: -1 | 1) {
  if (index < 0 || index >= rows.length) return;
  const groups = groupsOf(rows);
  const at = locate(groups, rows[index].id);
  const g = groups[at.g];
  const j = at.i + dir;
  if (j >= 0 && j < g.items.length) {
    [g.items[at.i], g.items[j]] = [g.items[j], g.items[at.i]];
  } else {
    const ng = groups[at.g + dir];
    if (!ng) return;
    if (g.items.length === 1 && g.band != null) {
      // a one-row section swaps places with the neighbouring section instead (never above the leading rows)
      if (ng.band == null) return;
      [groups[at.g], groups[at.g + dir]] = [groups[at.g + dir], groups[at.g]];
    } else {
      const [row] = g.items.splice(at.i, 1);
      if (dir === 1) ng.items.unshift(row);
      else ng.items.push(row);
    }
  }
  writeGroups(rows, groups);
}

/** Where a dragged section lands when dropped on `targetRowId`: before the target's
    section when moving up, after it when moving down (never inside another section,
    never above the leading block without a band). */
export function sectionDrop(rows: readonly AVRow[], bandId: string, targetRowId: string): { blockIndex: number; side: 'before' | 'after' } | null {
  const blocks = blocksOf(rows);
  const src = blocks.findIndex((b) => b.bandId === bandId);
  const tgt = blockAt(blocks, rows.findIndex((r) => r.id === targetRowId));
  if (src < 0 || tgt < 0 || src === tgt) return null;
  if (tgt < src) {
    // the leading block without a band keeps its place: drop after it instead
    if (!blocks[tgt].bandId) return tgt + 1 === src ? null : { blockIndex: tgt, side: 'after' };
    return { blockIndex: tgt, side: 'before' };
  }
  return { blockIndex: tgt, side: 'after' };
}

/** Move a whole section (band + rows) to a drop position from sectionDrop. */
export function moveSection(rows: AVRow[], bandId: string, drop: { blockIndex: number; side: 'before' | 'after' }) {
  const blocks = blocksOf(rows);
  const src = blocks.findIndex((b) => b.bandId === bandId);
  if (src < 0 || drop.blockIndex === src) return;
  const s = blocks[src];
  const t = blocks[drop.blockIndex];
  const chunk = rows.splice(s.start, s.end - s.start);
  let at = drop.side === 'before' ? t.start : t.end;
  if (at > s.start) at -= chunk.length;
  rows.splice(at, 0, ...chunk);
}

/** Swap a section with the one above (-1) or below (+1). Returns false when it can't move. */
export function stepSection(rows: AVRow[], bandId: string, dir: -1 | 1): boolean {
  const blocks = blocksOf(rows);
  const src = blocks.findIndex((b) => b.bandId === bandId);
  const nb = blocks[src + dir];
  if (src < 0 || !nb || (dir === -1 && !nb.bandId)) return false;
  moveSection(rows, bandId, { blockIndex: src + dir, side: dir === -1 ? 'before' : 'after' });
  return true;
}

export function canStepSection(rows: readonly AVRow[], bandId: string, dir: -1 | 1): boolean {
  const blocks = blocksOf(rows);
  const src = blocks.findIndex((b) => b.bandId === bandId);
  const nb = blocks[src + dir];
  return src >= 0 && !!nb && !(dir === -1 && !nb.bandId);
}

/** Move a band one row up (the section starts a row earlier) or down (a row later);
    the shots stay put. Returns the id of the row now carrying the band, or null. */
export function shiftBand(rows: AVRow[], bandId: string, dir: -1 | 1): string | null {
  const i = rows.findIndex((r) => r.id === bandId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length || rows[j].segment != null) return null;
  rows[j].segment = rows[i].segment;
  delete rows[i].segment;
  return rows[j].id;
}

export function canShiftBand(rows: readonly AVRow[], bandId: string, dir: -1 | 1): boolean {
  const i = rows.findIndex((r) => r.id === bandId);
  const j = i + dir;
  return i >= 0 && j >= 0 && j < rows.length && rows[j].segment == null;
}

/** Number of rows in the section that starts at `bandId`. */
export function sectionSize(rows: readonly AVRow[], bandId: string): number {
  const b = blocksOf(rows).find((x) => x.bandId === bandId);
  return b ? b.end - b.start : 0;
}
