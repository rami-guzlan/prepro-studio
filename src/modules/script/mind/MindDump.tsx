/* Mind Dump: several boards (idea batches / categories), each with its own
   free writing and sticky-note board. Write freely, turn thoughts into notes
   and arrange them visually. Also used by Marketing Spaces (Ideas). */
import './mind.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, MoreHorizontal, PanelLeft, PanelRight, Pencil, Plus, Printer, Rows3, Sparkles, StickyNote, Trash2 } from 'lucide-react';
import { openPrint, readLS, writeLS } from '@/store/app';
import { useProject } from '@/store/project';
import { wordCount } from '@/lib/text';
import { boardOf } from '@/lib/mind';
import type { IdeaNote, MindBoard, MindDump as MindDumpData } from '@/types';
import { Button, Menu, Tabs, Textarea, confirmDialog, openContextMenu, toast, type MenuItem } from '@/ui';
import { Board } from './Board';
import { BOARD_COLORS, addBoard, addNotes, deleteBoard, duplicateBoard, moveBoard, setActiveBoard, setBoardText, splitText, updateBoard, useMindUI } from './ops';

type Layout = 'split' | 'write' | 'board';

const BOARD_COLOR_NAMES: Record<string, string> = {
  '#7c5cff': 'Violet',
  '#3e8ef7': 'Blue',
  '#2fb36d': 'Green',
  '#f08c00': 'Orange',
  '#e64980': 'Pink',
  '#15aabf': 'Teal',
  '#e5484d': 'Red',
  '#868e96': 'Grey',
};

const EMPTY: MindDumpData = { boards: [] };

export interface MindDumpProps {
  /** boards (default: the open project's Mind Dump) */
  mind?: MindDumpData;
  /** id of the project / space (remembers the active board and views) */
  scopeId?: string;
  /** "Turn into…" menu for notes */
  sendMenu?: (notes: IdeaNote[]) => MenuItem[];
  /** print document id (null hides the button) */
  printDocId?: string | null;
  placeholder?: string;
}

export function MindDump(props: MindDumpProps = {}) {
  const projectMind = useProject((p) => p.script.mind);
  const mode = useProject((p) => p.script.mode) ?? 'screenplay';
  const projectId = useProject((p) => p.id);
  const mind = props.mind ?? projectMind ?? EMPTY;
  const scopeId = props.scopeId ?? projectId;
  const activeId = useMindUI((s) => s.active[scopeId]);
  const board: MindBoard | undefined = boardOf(mind, activeId);
  const printDocId = props.printDocId === undefined ? 'mind-dump' : props.printDocId;

  const layoutKey = board ? `prepro.mind.layout.${board.id}` : 'prepro.mind.layout';
  const [layout, setLayoutState] = useState<Layout>(() => readLS<Layout>(layoutKey, readLS<Layout>('prepro.mind.layout', 'split')));
  useEffect(() => {
    setLayoutState(readLS<Layout>(layoutKey, readLS<Layout>('prepro.mind.layout', 'split')));
  }, [layoutKey]);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    writeLS(layoutKey, l);
    writeLS('prepro.mind.layout', l);
  };

  const [quick, setQuick] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);
  const text = board?.text ?? '';
  const words = useMemo(() => wordCount(text), [text]);
  const lines = useMemo(() => splitText(text, 'lines').length, [text]);
  const paras = useMemo(() => splitText(text, 'paragraphs').length, [text]);
  const setText = (v: string) => setBoardText(v);

  const makeNotes = (how: 'lines' | 'paragraphs', clear: boolean) => {
    const parts = splitText(text, how);
    if (!parts.length) {
      toast('Write something first', 'info');
      return;
    }
    addNotes(parts);
    if (clear) setText('');
    toast(`Created ${parts.length} note${parts.length === 1 ? '' : 's'} on “${board?.name ?? 'the board'}”`);
    if (layout === 'write') setLayout('split');
  };

  const addQuick = () => {
    const t = quick.trim();
    if (!t) return;
    addNotes([t]);
    setQuick('');
    quickRef.current?.focus();
  };

  return (
    <div className="md-wrap">
      <BoardTabs boards={mind.boards} activeId={board?.id} />
      <div className="md-bar">
        <Tabs<Layout>
          value={layout}
          onChange={setLayout}
          tabs={[
            { id: 'write', label: 'Write', icon: PanelLeft },
            { id: 'split', label: 'Split', icon: Rows3 },
            { id: 'board', label: 'Board', icon: PanelRight },
          ]}
        />
        <div className="md-quick">
          <StickyNote size={15} className="muted" />
          <input
            ref={quickRef}
            className="input sm"
            value={quick}
            placeholder={`Quick thought → Enter pins it on “${board?.name ?? 'the board'}”`}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addQuick();
              }
            }}
          />
        </div>
        <div className="spacer" />
        <span className="muted small">
          {board?.notes.length ?? 0} note{board?.notes.length === 1 ? '' : 's'} · {board?.groups.length ?? 0} group{board?.groups.length === 1 ? '' : 's'}
        </span>
        {printDocId && (
          <Button size="sm" icon={Printer} onClick={() => openPrint(printDocId, mind.boards.length > 1 && board ? { boards: board.name } : undefined)}>
            Print
          </Button>
        )}
      </div>
      {board && (
        <div className={`md-body md-layout-${layout}`}>
          {layout !== 'board' && (
            <div className="md-write">
              <div className="md-write-head">
                <div>
                  <div className="strong">Brain dump{mind.boards.length > 1 ? ` · ${board.name}` : ''}</div>
                  <div className="muted small">Get everything out — ideas, images, lines, questions. No structure needed.</div>
                </div>
              </div>
              <Textarea
                key={board.id}
                className="md-textarea"
                value={text}
                onChange={setText}
                placeholder={props.placeholder ?? 'Just type…\n\n- a shot of the sun behind the water towers\n- what if June never makes it up the stairs?\n- music: something with a ticking clock\n- ending on the freeze frame'}
                spellCheck
              />
              <div className="md-write-foot">
                <span className="muted small">
                  {words} word{words === 1 ? '' : 's'}
                </span>
                <div className="spacer" />
                <Menu
                  align="end"
                  trigger={
                    <Button size="sm" variant="primary" icon={Sparkles} disabled={!text.trim()}>
                      Make notes
                    </Button>
                  }
                  items={[
                    { header: 'Turn the text into sticky notes' },
                    { label: `One note per line (${lines})`, onClick: () => makeNotes('lines', false) },
                    { label: `One note per paragraph (${paras})`, onClick: () => makeNotes('paragraphs', false) },
                    { separator: true },
                    { label: 'Per line, then clear the text', onClick: () => makeNotes('lines', true) },
                    { label: 'Per paragraph, then clear the text', onClick: () => makeNotes('paragraphs', true) },
                  ]}
                />
              </div>
            </div>
          )}
          {layout !== 'write' && <Board key={board.id} mind={board} boards={mind.boards} mode={mode} projectId={`${scopeId}:${board.id}`} sendMenu={props.sendMenu} />}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- board tabs */

function BoardTabs({ boards, activeId }: { boards: MindBoard[]; activeId?: string }) {
  const [renaming, setRenaming] = useState<string | null>(null);

  const create = () => {
    const id = addBoard(`Board ${boards.length + 1}`);
    setRenaming(id);
  };

  const remove = async (b: MindBoard) => {
    const n = b.notes.length;
    const ok =
      n === 0 && !b.text.trim()
        ? true
        : await confirmDialog({
            title: boards.length === 1 ? `Clear “${b.name}”?` : `Delete the board “${b.name}”?`,
            message: `${n} note${n === 1 ? '' : 's'}${b.text.trim() ? ' and the written text' : ''} ${boards.length === 1 ? 'are removed (it is the only board)' : 'go with it'}. You can undo with Ctrl+Z.`,
            confirmLabel: boards.length === 1 ? 'Clear board' : 'Delete board',
            danger: true,
          });
    if (ok) deleteBoard(b.id);
  };

  const menu = (b: MindBoard, i: number): MenuItem[] => [
    { label: 'Rename', icon: Pencil, onClick: () => setRenaming(b.id) },
    { header: 'Colour' },
    ...BOARD_COLORS.map((c): MenuItem => ({ label: BOARD_COLOR_NAMES[c] ?? c, swatch: c, checked: b.color === c, onClick: () => updateBoard(b.id, { color: c }, false) })),
    { separator: true },
    { label: 'Duplicate board', icon: Copy, onClick: () => duplicateBoard(b.id) },
    { label: 'Move left', icon: ArrowLeft, disabled: i === 0, onClick: () => moveBoard(b.id, -1) },
    { label: 'Move right', icon: ArrowRight, disabled: i === boards.length - 1, onClick: () => moveBoard(b.id, 1) },
    { separator: true },
    { label: boards.length === 1 ? 'Clear board…' : 'Delete board…', icon: Trash2, danger: true, onClick: () => remove(b) },
  ];

  return (
    <div className="md-boards" role="tablist" aria-label="Boards">
      {boards.map((b, i) => {
        const on = b.id === activeId;
        return (
          <div
            key={b.id}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            className={`md-board-tab ${on ? 'on' : ''}`}
            style={{ ['--md-board-color' as any]: b.color || 'var(--accent)' }}
            onClick={() => setActiveBoard(b.id)}
            onDoubleClick={() => setRenaming(b.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setActiveBoard(b.id);
              if (e.key === 'F2') setRenaming(b.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(e, menu(b, i));
            }}
            title={`${b.name} — ${b.notes.length} note${b.notes.length === 1 ? '' : 's'}. Double-click to rename, right-click for more.`}
          >
            <span className="md-board-dot" />
            {renaming === b.id ? (
              <input
                className="md-board-rename"
                autoFocus
                defaultValue={b.name}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== b.name) updateBoard(b.id, { name: v }, false);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    (e.target as HTMLInputElement).value = b.name;
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <span className="md-board-name">{b.name}</span>
            )}
            <span className="md-board-count">{b.notes.length}</span>
            {on && renaming !== b.id && (
              <span onClick={(e) => e.stopPropagation()}>
                <Menu align="start" trigger={<button className="md-board-more" aria-label="Board options"><MoreHorizontal size={14} /></button>} items={menu(b, i)} />
              </span>
            )}
          </div>
        );
      })}
      <button className="md-board-add" onClick={create} title="New board — a separate batch or category of ideas">
        <Plus size={14} /> New board
      </button>
    </div>
  );
}
