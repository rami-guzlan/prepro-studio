/* Printable Mind Dump: per board (idea batch / category) the board picture, an
   outline of notes by group and the free-written text. */
import type { ReactNode } from 'react';
import type { PrintDocDef, PrintOptionDef } from '@/print/types';
import type { IdeaNote, MindBoard, MindDump } from '@/types';
import { mindTotals } from '@/lib/mind';
import { DocHeader, PSection } from '@/print/components';
import { edgePoint, notesInGroup, readingOrder } from './ops';

export const MIND_PRINT_CSS = `
.mdp-board { position: relative; overflow: hidden; border: 0.75pt solid #c9c9d1; border-radius: 4pt; background: #fafafc; margin: 0 auto; }
.mdp-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.mdp-note { position: absolute; border-radius: 3px; padding: 8px 10px; font-size: 13px; line-height: 1.35; color: #1d1d22; white-space: pre-wrap; word-break: break-word; overflow: hidden; box-shadow: 0 0 0 1px rgba(0,0,0,0.12); }
.mdp-group { position: absolute; border-radius: 9px; border: 2px dashed; }
.mdp-group-title { position: absolute; left: 10px; top: 6px; font-weight: 700; font-size: 14px; }
.mdp-outline-group { break-inside: avoid; margin-bottom: 10pt; }
.mdp-outline-group h3 { font-size: 10pt; margin: 0 0 4pt; }
.mdp-item { display: flex; gap: 6pt; align-items: flex-start; padding: 3pt 0; border-bottom: 0.5pt solid #e3e3e8; font-size: 9pt; white-space: pre-wrap; }
.mdp-chip { width: 9pt; height: 9pt; border-radius: 2pt; flex-shrink: 0; margin-top: 1pt; border: 0.5pt solid rgba(0,0,0,0.2); }
.mdp-used { color: #2fb36d; font-weight: 700; font-size: 7.5pt; margin-left: auto; white-space: nowrap; }
.mdp-text { white-space: pre-wrap; font-size: 10pt; line-height: 1.5; }
.mdp-board-title { display: flex; align-items: center; gap: 7pt; font-size: 14pt; font-weight: 700; margin: 0 0 8pt; }
.mdp-board-title .dot { width: 10pt; height: 10pt; border-radius: 50%; }
.mdp-board-title small { font-size: 9pt; font-weight: 400; color: #6b6b75; }
`;

export const MIND_PRINT_OPTIONS: PrintOptionDef[] = [
  { key: 'boards', label: 'Boards', type: 'text', default: '', hint: 'board names, comma separated — empty prints every board' },
  { key: 'board', label: 'Board picture', type: 'boolean', default: true },
  { key: 'outline', label: 'Notes outline (by group)', type: 'boolean', default: true },
  { key: 'text', label: 'Free-written text', type: 'boolean', default: true },
];

export const mindPrintDocs: PrintDocDef[] = [
  {
    id: 'mind-dump',
    title: 'Mind Dump',
    group: 'Script',
    orientation: 'landscape',
    description: 'Your brainstorm: the board as a picture, every note grouped by frame, and the free-written text.',
    options: MIND_PRINT_OPTIONS,
    emptyReason: (p) => {
      const t = mindTotals(p.script.mind);
      return t.notes || t.text ? false : 'The mind dump is empty';
    },
    render: (ctx) => {
      const mind = ctx.project.script.mind ?? { boards: [] };
      return {
        css: MIND_PRINT_CSS,
        body: mindPrintBody(mind, ctx.options, (subtitle) => <DocHeader ctx={ctx} title="Mind Dump" subtitle={subtitle} />),
      };
    },
  },
];

/** Boards chosen by the "boards" option (names, comma separated; empty = every board with content). */
export function selectBoards(mind: MindDump, spec: unknown): MindBoard[] {
  const boards = mind.boards ?? [];
  const names = String(spec ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (names.length) return boards.filter((b) => names.includes(b.name.trim().toLowerCase()) || names.includes(b.id));
  const filled = boards.filter((b) => b.notes.length || b.text.trim());
  return filled.length ? filled : boards.slice(0, 1);
}

/** Every chosen board: picture + outline + free text (also used by Marketing Spaces' Ideas). */
export function mindPrintBody(mind: MindDump, options: Record<string, any>, header: (subtitle: string) => ReactNode): ReactNode {
  const boards = selectBoards(mind, options.boards);
  const notes = boards.reduce((n, b) => n + b.notes.length, 0);
  const groups = boards.reduce((n, b) => n + b.groups.length, 0);
  const many = (mind.boards?.length ?? 0) > 1;
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const subtitle = [many ? n(boards.length, 'board') : '', n(notes, 'note'), n(groups, 'group')].filter(Boolean).join(' · ');
  return (
    <>
      {header(boards.length === 1 && many ? `${boards[0].name} · ${subtitle}` : subtitle)}
      {boards.length === 0 && <p className="pp-muted">No board matches “{String(options.boards)}”.</p>}
      {boards.map((b, i) => (
        <div key={b.id} className={i > 0 ? 'pp-break-before' : undefined}>
          {many && boards.length > 1 && (
            <div className="mdp-board-title">
              <span className="dot" style={{ background: b.color || '#7c5cff' }} />
              {b.name}
              <small>
                {n(b.notes.length, 'note')} · {n(b.groups.length, 'group')}
              </small>
            </div>
          )}
          {boardPrintBody(b, options)}
        </div>
      ))}
    </>
  );
}

/** Board picture + outline + free text of one board. */
function boardPrintBody(mind: MindBoard, options: Record<string, any>): ReactNode {
  const ctx = { options };
  const boxes = [...mind.notes, ...mind.groups];
  const W = 960;
  const H = 540;
  let board = null;
  if (ctx.options.board && boxes.length) {
    const x0 = Math.min(...boxes.map((b) => b.x)) - 20;
    const y0 = Math.min(...boxes.map((b) => b.y)) - 20;
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + 20;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 20;
    const scale = Math.min(1, W / (x1 - x0), H / (y1 - y0));
    const byId = new Map(mind.notes.map((n) => [n.id, n]));
    board = (
      <div className="mdp-board" style={{ width: `${(x1 - x0) * scale}px`, height: `${(y1 - y0) * scale}px` }}>
        <div className="mdp-world" style={{ transform: `scale(${scale}) translate(${-x0}px, ${-y0}px)` }}>
          {mind.groups.map((g) => (
            <div key={g.id} className="mdp-group" style={{ left: g.x, top: g.y, width: g.w, height: g.h, borderColor: g.color, background: `${g.color}14` }}>
              <div className="mdp-group-title" style={{ color: g.color }}>
                {g.title}
              </div>
            </div>
          ))}

          {mind.notes.map((n) => (
            <div key={n.id} className="mdp-note" style={{ left: n.x, top: n.y, width: n.w, height: n.h, background: n.color, opacity: n.used ? 0.6 : 1 }}>
              {n.text}
            </div>
          ))}
          <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width="1" height="1">
            <defs>
              <marker id="mdp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#55555e" />
              </marker>
            </defs>
            {mind.links.map((l) => {
              const a = byId.get(l.from);
              const b = byId.get(l.to);
              if (!a || !b) return null;
              const p1 = edgePoint(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
              const p2 = edgePoint(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
              return <line key={l.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#55555e" strokeWidth={2} markerEnd="url(#mdp-arrow)" />;
            })}
          </svg>
        </div>
      </div>
    );
  }

  const grouped = new Set<string>();
  const sections = mind.groups.map((g) => {
    const inside = readingOrder(notesInGroup(g, mind.notes));
    inside.forEach((n) => grouped.add(n.id));
    return { title: g.title || 'Untitled group', color: g.color, notes: inside };
  });
  const loose = readingOrder(mind.notes.filter((n) => !grouped.has(n.id)));
  if (loose.length) sections.push({ title: sections.length ? 'Ungrouped' : 'Notes', color: '#868e96', notes: loose });
  const item = (n: IdeaNote) => (
    <div key={n.id} className="mdp-item">
      <span className="mdp-chip" style={{ background: n.color }} />
      <span>{n.text}</span>
      {n.used && <span className="mdp-used">✓ used</span>}
    </div>
  );

  return (
    <>
      {board}
      {ctx.options.outline && sections.length > 0 && (
        <PSection title="Notes" className={board ? 'pp-break-before' : undefined}>
          <div style={{ columnCount: 2, columnGap: '18pt' }}>
            {sections.map((s) => (
              <div key={s.title} className="mdp-outline-group">
                <h3 style={{ color: s.color }}>
                  {s.title} <span className="pp-muted pp-small">({s.notes.length})</span>
                </h3>
                {s.notes.map(item)}
              </div>
            ))}
          </div>
        </PSection>
      )}
      {ctx.options.text && mind.text.trim() && (
        <PSection title="Brain dump" className="pp-break-before">
          <div className="mdp-text">{mind.text}</div>
        </PSection>
      )}
    </>
  );
}
