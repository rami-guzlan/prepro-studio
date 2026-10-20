/* Brainstorm boards (Script → Mind Dump, Marketing Space → Ideas): pure helpers
   with no UI dependencies, shared by normalisation, samples, print and agents. */
import type { MindBoard, MindDump } from '@/types';
import { uid } from './id';

export const BOARD_COLORS = ['#7c5cff', '#3e8ef7', '#2fb36d', '#f08c00', '#e64980', '#15aabf', '#e5484d', '#868e96'];

export function newBoard(name: string, patch: Partial<MindBoard> = {}): MindBoard {
  return { id: uid('mb'), name, text: '', notes: [], groups: [], links: [], ...patch };
}

/** Make sure a mind dump has at least one board with every field. Moves pre-boards
    data (text / notes / groups / links at the top level) into the first board. Mutates and returns. */
export function normalizeMind(raw: any, firstName = 'Ideas'): MindDump {
  const m: any = raw && typeof raw === 'object' ? raw : {};
  const boards: MindBoard[] = Array.isArray(m.boards) ? m.boards : [];
  const legacy = ['text', 'notes', 'groups', 'links'].some((k) => k in m);
  if (legacy) {
    const hasContent = (m.text ?? '').trim() || m.notes?.length || m.groups?.length;
    if (hasContent || !boards.length) boards.unshift(newBoard(firstName, { text: m.text ?? '', notes: m.notes ?? [], groups: m.groups ?? [], links: m.links ?? [] }));
    delete m.text;
    delete m.notes;
    delete m.groups;
    delete m.links;
  }
  if (!boards.length) boards.push(newBoard(firstName));
  for (const b of boards) {
    b.id = b.id || uid('mb');
    b.name = b.name || 'Untitled board';
    b.text = b.text ?? '';
    for (const k of ['notes', 'groups', 'links'] as const) if (!Array.isArray(b[k])) (b as any)[k] = [];
  }
  m.boards = boards;
  return m as MindDump;
}

/** The board with this id, else the first one. */
export function boardOf(m: MindDump | undefined, id?: string | null): MindBoard | undefined {
  if (!m?.boards?.length) return undefined;
  return (id && m.boards.find((b) => b.id === id)) || m.boards[0];
}

/** Totals over every board. */
export function mindTotals(m: MindDump | undefined): { boards: number; notes: number; groups: number; text: number } {
  const bs = m?.boards ?? [];
  return {
    boards: bs.length,
    notes: bs.reduce((n, b) => n + (b.notes?.length ?? 0), 0),
    groups: bs.reduce((n, b) => n + (b.groups?.length ?? 0), 0),
    text: bs.reduce((n, b) => n + (b.text ?? '').trim().length, 0),
  };
}
