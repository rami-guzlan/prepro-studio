/* Mind Dump board: sticky notes you can drag, resize, colour, group into
   frames and connect with arrows. Scroll to pan, Ctrl+scroll to zoom. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Boxes, Check, Copy, Expand, FileText, Group, LayoutGrid, ListChecks, ListVideo, Minus, Palette, Plus, Send, StickyNote, Trash2, Columns2 } from 'lucide-react';
import type { IdeaGroup, IdeaNote, MindBoard } from '@/types';
import { readLS, writeLS } from '@/store/app';
import { Button, IconButton, Menu, openContextMenu, type MenuItem } from '@/ui';
import {
  GROUP_COLORS,
  NOTE_COLORS,
  addGroup,
  addLink,
  addNoteAt,
  deleteItems,
  duplicateNotes,
  edgePoint,
  fitGroups,
  moveItems,
  moveNotesToBoard,
  noteCenter,
  notesInGroup,
  sendAsAction,
  sendAsScenes,
  sendToAv,
  sendToShots,
  sendToTasks,
  tidyByColour,
  tidyGrid,
  updateGroup,
  updateNote,
} from './ops';

interface View {
  x: number;
  y: number;
  z: number;
}

type Drag =
  | { kind: 'move'; sx: number; sy: number; notes: string[]; groups: string[]; moved: boolean }
  | { kind: 'resize'; id: string; group: boolean; sx: number; sy: number; w: number; h: number }
  | { kind: 'marquee'; sx: number; sy: number; cx: number; cy: number; additive: boolean }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'link'; from: string; cx: number; cy: number };

const COLOR_NAMES: Record<string, string> = {
  '#fff3a3': 'Yellow',
  '#ffd6a5': 'Orange',
  '#ffc8dd': 'Pink',
  '#cdb4ff': 'Purple',
  '#b5d8ff': 'Blue',
  '#b9f0d0': 'Green',
  '#e9ecef': 'Grey',
  '#ffffff': 'White',
};

export function Board({
  mind,
  boards,
  mode,
  projectId,
  sendMenu,
}: {
  /** the board shown */
  mind: MindBoard;
  /** every board of the document (for "Move to board") */
  boards?: MindBoard[];
  mode: 'screenplay' | 'av';
  /** id of the project / space (remembers the board view) */
  projectId: string;
  /** "Turn into…" entries for selected notes (default: script, shots, tasks of the project) */
  sendMenu?: (notes: IdeaNote[]) => MenuItem[];
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const lsKey = `prepro.mind.view.${projectId}`;
  const [view, setView] = useState<View>(() => readLS<View>(lsKey, { x: 40, y: 76, z: 1 }));
  const [selNotes, setSelNotes] = useState<Set<string>>(new Set());
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [selLink, setSelLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<{ dx: number; dy: number; w?: number; h?: number }>({ dx: 0, dy: 0 });
  const [space, setSpace] = useState(false);
  const createdRef = useRef<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    const t = setTimeout(() => writeLS(lsKey, view), 300);
    return () => clearTimeout(t);
  }, [view, lsKey]);

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = boardRef.current!.getBoundingClientRect();
      return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
    },
    [view],
  );

  const clearSel = () => {
    setSelNotes(new Set());
    setSelGroups(new Set());
    setSelLink(null);
  };

  const selectedNotes = useMemo(() => mind.notes.filter((n) => selNotes.has(n.id)), [mind.notes, selNotes]);

  /* ---------------------------------------------------------------- live geometry */

  const movingNotes = useMemo(() => {
    if (drag?.kind !== 'move') return new Set<string>();
    return new Set(drag.notes);
  }, [drag]);
  const movingGroups = useMemo(() => (drag?.kind === 'move' ? new Set(drag.groups) : new Set<string>()), [drag]);

  const noteBox = (n: IdeaNote) => {
    let { x, y, w, h } = n;
    if (movingNotes.has(n.id)) {
      x += live.dx;
      y += live.dy;
    }
    if (drag?.kind === 'resize' && !drag.group && drag.id === n.id) {
      w = live.w ?? w;
      h = live.h ?? h;
    }
    return { x, y, w, h };
  };
  const groupBox = (g: IdeaGroup) => {
    let { x, y, w, h } = g;
    if (movingGroups.has(g.id)) {
      x += live.dx;
      y += live.dy;
    }
    if (drag?.kind === 'resize' && drag.group && drag.id === g.id) {
      w = live.w ?? w;
      h = live.h ?? h;
    }
    return { x, y, w, h };
  };

  /* ---------------------------------------------------------------- pointer handling */

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === 'move') {
        const dx = (e.clientX - d.sx) / view.z;
        const dy = (e.clientY - d.sy) / view.z;
        if (!d.moved && Math.hypot(dx, dy) * view.z > 3) setDrag({ ...d, moved: true });
        setLive({ dx, dy });
      } else if (d.kind === 'resize') {
        const minW = d.group ? 160 : 120;
        const minH = d.group ? 120 : 70;
        setLive({ dx: 0, dy: 0, w: Math.max(minW, d.w + (e.clientX - d.sx) / view.z), h: Math.max(minH, d.h + (e.clientY - d.sy) / view.z) });
      } else if (d.kind === 'marquee') {
        setDrag({ ...d, cx: e.clientX, cy: e.clientY });
      } else if (d.kind === 'pan') {
        setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }));
      } else if (d.kind === 'link') {
        setDrag({ ...d, cx: e.clientX, cy: e.clientY });
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.kind === 'move') {
        const dx = (e.clientX - d.sx) / view.z;
        const dy = (e.clientY - d.sy) / view.z;
        if (d.moved) moveItems(d.notes, d.groups, dx, dy);
      } else if (d.kind === 'resize') {
        const minW = d.group ? 160 : 120;
        const minH = d.group ? 120 : 70;
        const w = Math.round(Math.max(minW, d.w + (e.clientX - d.sx) / view.z));
        const h = Math.round(Math.max(minH, d.h + (e.clientY - d.sy) / view.z));
        if (d.group) updateGroup(d.id, { w, h }, false);
        else updateNote(d.id, { w, h }, false);
      } else if (d.kind === 'marquee') {
        const a = toWorld(d.sx, d.sy);
        const b = toWorld(e.clientX, e.clientY);
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        if (x1 - x0 > 4 || y1 - y0 > 4) {
          const hit = mind.notes.filter((n) => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0).map((n) => n.id);
          setSelNotes((s) => new Set([...(d.additive ? s : []), ...hit]));
          if (!d.additive) setSelGroups(new Set());
        }
      } else if (d.kind === 'link') {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-note]') as HTMLElement | null;
        const to = el?.dataset.note;
        if (to && to !== d.from) addLink(d.from, to);
      }
      setLive({ dx: 0, dy: 0 });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.kind, view.z, mind.notes]);

  const startMove = (e: React.PointerEvent, notes: string[], groups: string[]) => {
    // dragging a group carries the notes inside it
    const carried = new Set(notes);
    for (const gid of groups) {
      const g = mind.groups.find((x) => x.id === gid);
      if (g) for (const n of notesInGroup(g, mind.notes)) carried.add(n.id);
    }
    setLive({ dx: 0, dy: 0 });
    setDrag({ kind: 'move', sx: e.clientX, sy: e.clientY, notes: [...carried], groups, moved: false });
  };

  const onNoteDown = (e: React.PointerEvent, n: IdeaNote) => {
    if (e.button === 2) {
      e.stopPropagation();
      return;
    }
    if (e.button !== 0 || editing === n.id) return;
    e.stopPropagation();
    boardRef.current?.focus({ preventScroll: true });
    let notes = selNotes;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      notes = new Set(selNotes);
      if (notes.has(n.id)) notes.delete(n.id);
      else notes.add(n.id);
      setSelNotes(notes);
      return;
    }
    if (!selNotes.has(n.id)) {
      notes = new Set([n.id]);
      setSelNotes(notes);
      setSelGroups(new Set());
    }
    setSelLink(null);
    startMove(e, [...notes], [...selGroups].filter(() => selNotes.has(n.id)));
  };

  const onGroupDown = (e: React.PointerEvent, g: IdeaGroup) => {
    if (e.button === 2) {
      e.stopPropagation();
      return;
    }
    if (e.button !== 0 || editingGroup === g.id) return;
    e.stopPropagation();
    boardRef.current?.focus({ preventScroll: true });
    if (e.shiftKey) {
      const s = new Set(selGroups);
      if (s.has(g.id)) s.delete(g.id);
      else s.add(g.id);
      setSelGroups(s);
      return;
    }
    setSelGroups(new Set([g.id]));
    setSelNotes(new Set());
    setSelLink(null);
    startMove(e, [], [g.id]);
  };

  const onBoardDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.md-toolbar, .md-zoom')) return;
    boardRef.current?.focus({ preventScroll: true });
    setEditing(null);
    setEditingGroup(null);
    if (e.button === 1 || e.button === 2 || space) {
      e.preventDefault();
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    if (e.button !== 0) return;
    if (!e.shiftKey) clearSel();
    setDrag({ kind: 'marquee', sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, additive: e.shiftKey });
  };

  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest('textarea')) return;
    if (e.ctrlKey || e.metaKey) {
      const r = boardRef.current!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const z = Math.max(0.2, Math.min(2.5, v.z * Math.exp(-e.deltaY * 0.0015)));
        return { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
      });
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // block the browser's page zoom on Ctrl+wheel over the board
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  /* ---------------------------------------------------------------- actions */

  const zoomBy = (f: number) => {
    const r = boardRef.current!.getBoundingClientRect();
    const px = r.width / 2;
    const py = r.height / 2;
    setView((v) => {
      const z = Math.max(0.2, Math.min(2.5, v.z * f));
      return { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
    });
  };

  const fit = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const boxes = [...mind.notes, ...mind.groups];
    if (!boxes.length) {
      setView({ x: 40, y: 76, z: 1 });
      return;
    }
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const W = el.clientWidth - 80;
    const H = el.clientHeight - 120;
    const z = Math.max(0.2, Math.min(1.4, Math.min(W / (x1 - x0), H / (y1 - y0))));
    setView({ z, x: 40 + (W - (x1 - x0) * z) / 2 - x0 * z, y: 90 + (H - (y1 - y0) * z) / 2 - y0 * z });
  }, [mind.notes, mind.groups]);

  const centerWorld = () => {
    const el = boardRef.current!;
    return { x: (el.clientWidth / 2 - view.x) / view.z, y: (el.clientHeight / 2 - view.y) / view.z };
  };

  const newNoteAt = (x: number, y: number) => {
    const id = addNoteAt(x, y);
    createdRef.current = id;
    setSelNotes(new Set([id]));
    setSelGroups(new Set());
    setEditing(id);
  };

  const deleteSelection = () => {
    if (!selNotes.size && !selGroups.size && !selLink) return;
    deleteItems([...selNotes], [...selGroups], selLink ? [selLink] : []);
    clearSel();
  };

  const colour = (c: string) => {
    if (selNotes.size) for (const id of selNotes) updateNote(id, { color: c }, false);
  };

  const sendItems = (notes: IdeaNote[]): MenuItem[] => {
    if (sendMenu) return sendMenu(notes);
    const n = notes.length;
    const s = n === 1 ? '' : 's';
    const disabled = n === 0;
    const items: MenuItem[] = [];
    if (mode === 'screenplay') {
      items.push(
        { label: `New scene${s} in the script`, icon: FileText, disabled, onClick: () => sendAsScenes(notes) },
        { label: `Action paragraph${s} in the script`, icon: FileText, disabled, onClick: () => sendAsAction(notes) },
      );
    } else {
      items.push(
        { label: `A/V row${s} — picture column`, icon: Columns2, disabled, onClick: () => sendToAv(notes, 'video') },
        { label: `A/V row${s} — sound / VO column`, icon: Columns2, disabled, onClick: () => sendToAv(notes, 'audio') },
      );
    }
    items.push(
      { label: `Shot${s} in the shot list`, icon: ListVideo, disabled, onClick: () => sendToShots(notes) },
      { label: `Task${s}`, icon: ListChecks, disabled, onClick: () => sendToTasks(notes) },
    );
    return items;
  };

  const noteMenu = (n: IdeaNote): MenuItem[] => {
    const targets = selNotes.has(n.id) && selNotes.size > 1 ? selectedNotes : [n];
    return [
      { label: 'Edit text', shortcut: 'Enter', onClick: () => setEditing(n.id) },
      { header: targets.length > 1 ? `Turn ${targets.length} notes into…` : 'Turn into…' },
      ...sendItems(targets),
      { separator: true },
      { header: 'Colour' },
      ...NOTE_COLORS.map((c) => ({ label: COLOR_NAMES[c] ?? c, checked: n.color === c, onClick: () => targets.forEach((t) => updateNote(t.id, { color: c }, false)) })),
      { separator: true },
      { label: targets.length > 1 ? 'Group these notes' : 'Put in a group', icon: Group, onClick: () => addGroup(targets.map((t) => t.id)) },
      { label: 'Duplicate', icon: Copy, shortcut: 'Ctrl+D', onClick: () => setSelNotes(new Set(duplicateNotes(targets.map((t) => t.id)))) },
      { label: n.used ? 'Mark as not used' : 'Mark as used', icon: Check, onClick: () => targets.forEach((t) => updateNote(t.id, { used: !n.used }, false)) },
      ...moveItemsFor(targets),
      { separator: true },
      { label: 'Delete', icon: Trash2, danger: true, shortcut: 'Del', onClick: () => deleteItems(targets.map((t) => t.id), []) },
    ];
  };

  /** "Move to board" entries (only with more than one board). */
  const moveItemsFor = (notes: IdeaNote[]): MenuItem[] => {
    const others = (boards ?? []).filter((b) => b.id !== mind.id);
    if (!others.length || !notes.length) return [];
    return [
      { header: notes.length > 1 ? `Move ${notes.length} notes to board…` : 'Move to board…' },
      ...others.map(
        (b): MenuItem => ({
          label: b.name,
          icon: ArrowRightLeft,
          swatch: b.color,
          onClick: () => {
            moveNotesToBoard(notes.map((x) => x.id), b.id);
            setSelNotes(new Set());
          },
        }),
      ),
    ];
  };

  const groupMenu = (g: IdeaGroup): MenuItem[] => {
    const inside = notesInGroup(g, mind.notes);
    return [
      { label: 'Rename', onClick: () => setEditingGroup(g.id) },
      { label: `Select the ${inside.length} notes inside`, onClick: () => setSelNotes(new Set(inside.map((x) => x.id))) },
      { header: `Turn the group's ${inside.length} notes into…` },
      ...sendItems(inside),
      { separator: true },
      { header: 'Colour' },
      ...GROUP_COLORS.map((c) => ({ label: c, checked: g.color === c, onClick: () => updateGroup(g.id, { color: c }, false) })),
      { separator: true },
      { label: 'Remove group (keep notes)', icon: Trash2, onClick: () => deleteItems([], [g.id]) },
      { label: 'Delete group and its notes', icon: Trash2, danger: true, onClick: () => deleteItems(inside.map((x) => x.id), [g.id]) },
    ];
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('textarea, input')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') {
      setSpace(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelection();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelNotes(new Set(mind.notes.map((n) => n.id)));
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (selNotes.size) setSelNotes(new Set(duplicateNotes([...selNotes])));
    } else if (e.key === 'Escape') {
      clearSel();
    } else if (e.key === 'Enter' && selNotes.size === 1) {
      e.preventDefault();
      setEditing([...selNotes][0]);
    } else if (!mod && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      const c = centerWorld();
      newNoteAt(c.x, c.y);
    } else if (e.key.startsWith('Arrow') && (selNotes.size || selGroups.size)) {
      e.preventDefault();
      const step = e.shiftKey ? 20 : 4;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      moveItems([...selNotes], [...selGroups], dx, dy);
    }
  };

  const finishEdit = (n: IdeaNote) => {
    setEditing(null);
    if (createdRef.current === n.id && !n.text.trim()) deleteItems([n.id], []);
    createdRef.current = null;
  };

  /* ---------------------------------------------------------------- render */

  const marquee =
    drag?.kind === 'marquee'
      ? (() => {
          const r = boardRef.current!.getBoundingClientRect();
          return { left: Math.min(drag.sx, drag.cx) - r.left, top: Math.min(drag.sy, drag.cy) - r.top, width: Math.abs(drag.cx - drag.sx), height: Math.abs(drag.cy - drag.sy) };
        })()
      : null;

  const byId = new Map(mind.notes.map((n) => [n.id, n]));
  const linkPreview = drag?.kind === 'link' ? (() => {
    const from = byId.get(drag.from);
    if (!from) return null;
    const p = toWorld(drag.cx, drag.cy);
    return { a: noteCenter(noteBox(from)), b: p };
  })() : null;

  const anySel = selNotes.size > 0;

  return (
    <div
      ref={boardRef}
      className={`md-board ${space || drag?.kind === 'pan' ? 'panning' : ''}`}
      tabIndex={0}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.z}px ${24 * view.z}px` }}
      onPointerDown={onBoardDown}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === ' ' && setSpace(false)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.md-note, .md-group-title, .md-toolbar, .md-zoom')) return;
        const p = toWorld(e.clientX, e.clientY);
        newNoteAt(p.x, p.y);
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.md-note, .md-group, .md-toolbar')) return;
        e.preventDefault();
      }}
    >
      <div className="md-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {mind.groups.map((g) => {
          const b = groupBox(g);
          return (
            <div
              key={g.id}
              className={`md-group ${selGroups.has(g.id) ? 'selected' : ''}`}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h, ['--g' as any]: g.color }}
              onPointerDown={(e) => onGroupDown(e, g)}
              onContextMenu={(e) => openContextMenu(e, groupMenu(g))}
            >
              <div className="md-group-title" onDoubleClick={() => setEditingGroup(g.id)}>
                {editingGroup === g.id ? (
                  <input
                    autoFocus
                    className="md-group-input"
                    value={g.title}
                    onPointerDown={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateGroup(g.id, { title: e.target.value })}
                    onBlur={() => setEditingGroup(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') setEditingGroup(null);
                    }}
                  />
                ) : (
                  <span>{g.title || 'Untitled group'}</span>
                )}
                <span className="md-group-count">{notesInGroup(g, mind.notes).length}</span>
              </div>
              {selGroups.has(g.id) && (
                <span
                  className="md-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setLive({ dx: 0, dy: 0, w: g.w, h: g.h });
                    setDrag({ kind: 'resize', id: g.id, group: true, sx: e.clientX, sy: e.clientY, w: g.w, h: g.h });
                  }}
                />
              )}
            </div>
          );
        })}

        <svg className="md-links" width="1" height="1">
          <defs>
            <marker id="md-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {mind.links.map((l) => {
            const a = byId.get(l.from);
            const b = byId.get(l.to);
            if (!a || !b) return null;
            const ra = noteBox(a);
            const rb = noteBox(b);
            const p1 = edgePoint(ra, noteCenter(rb));
            const p2 = edgePoint(rb, noteCenter(ra));
            return (
              <g key={l.id} className={`md-link ${selLink === l.id ? 'selected' : ''}`}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="md-link-hit" onPointerDown={(e) => {
                  e.stopPropagation();
                  boardRef.current?.focus({ preventScroll: true });
                  setSelNotes(new Set());
                  setSelGroups(new Set());
                  setSelLink(l.id);
                }} />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} markerEnd="url(#md-arrow)" className="md-link-line" />
              </g>
            );
          })}
          {linkPreview && <line x1={linkPreview.a.x} y1={linkPreview.a.y} x2={linkPreview.b.x} y2={linkPreview.b.y} className="md-link-line preview" markerEnd="url(#md-arrow)" />}
        </svg>

        {mind.notes.map((n) => {
          const b = noteBox(n);
          const selected = selNotes.has(n.id);
          return (
            <div
              key={n.id}
              data-note={n.id}
              className={`md-note ${selected ? 'selected' : ''} ${n.used ? 'used' : ''} ${editing === n.id ? 'editing' : ''}`}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h, background: n.color }}
              onPointerDown={(e) => onNoteDown(e, n)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(n.id);
              }}
              onContextMenu={(e) => {
                if (!selNotes.has(n.id)) setSelNotes(new Set([n.id]));
                openContextMenu(e, noteMenu(n));
              }}
            >
              {editing === n.id ? (
                <textarea
                  autoFocus
                  className="md-note-input"
                  value={n.text}
                  placeholder="Type a thought…"
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                  onChange={(e) => updateNote(n.id, { text: e.target.value })}
                  onBlur={() => finishEdit(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                />
              ) : (
                <div className="md-note-text">{n.text || <span className="md-note-empty">Double-click to write</span>}</div>
              )}
              {n.used && (
                <span className="md-used" title="Already turned into script / shot / task">
                  <Check size={11} />
                </span>
              )}
              {!editing && (
                <span
                  className="md-link-handle"
                  title="Drag onto another note to connect"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDrag({ kind: 'link', from: n.id, cx: e.clientX, cy: e.clientY });
                  }}
                />
              )}
              {selected && selNotes.size === 1 && editing !== n.id && (
                <span
                  className="md-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setLive({ dx: 0, dy: 0, w: n.w, h: n.h });
                    setDrag({ kind: 'resize', id: n.id, group: false, sx: e.clientX, sy: e.clientY, w: n.w, h: n.h });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {marquee && <div className="md-marquee" style={marquee} />}

      <div className="md-toolbar" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Button size="sm" icon={StickyNote} onClick={() => {
          const c = centerWorld();
          newNoteAt(c.x + (Math.random() - 0.5) * 60, c.y + (Math.random() - 0.5) * 40);
        }}>
          Note
        </Button>
        <Button size="sm" icon={Boxes} onClick={() => {
          const id = addGroup([...selNotes], centerWorld());
          setSelGroups(new Set([id]));
          setSelNotes(new Set());
          setEditingGroup(id);
        }} title={anySel ? 'Group the selected notes' : 'Add an empty group'}>
          Group
        </Button>
        <span className="vdivider" />
        <span className="md-swatches" title="Colour of selected notes">
          <Palette size={14} className="muted" />
          {NOTE_COLORS.map((c) => (
            <button key={c} type="button" className="md-swatch" style={{ background: c }} title={COLOR_NAMES[c]} disabled={!anySel} onClick={() => colour(c)} />
          ))}
        </span>
        <span className="vdivider" />
        <Menu
          trigger={<Button size="sm" icon={LayoutGrid}>Tidy</Button>}
          items={[
            { label: anySel ? 'Arrange selected in a grid' : 'Arrange all in a grid', onClick: () => tidyGrid([...selNotes]) },
            { label: 'Sort into columns by colour', onClick: () => tidyByColour() },
            { label: 'Fit groups to their notes', onClick: () => fitGroups() },
          ]}
        />
        <Menu trigger={<Button size="sm" icon={Send} disabled={!anySel}>Turn into</Button>} items={() => sendItems(selectedNotes)} />
        <IconButton icon={Trash2} size="sm" label="Delete selection (Del)" disabled={!anySel && !selGroups.size && !selLink} onClick={deleteSelection} />
      </div>

      <div className="md-zoom" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <IconButton icon={Minus} size="sm" label="Zoom out" onClick={() => zoomBy(1 / 1.2)} />
        <button className="btn ghost sm" onClick={() => setView((v) => ({ ...v, z: 1 }))} title="Reset zoom">
          {Math.round(view.z * 100)}%
        </button>
        <IconButton icon={Plus} size="sm" label="Zoom in" onClick={() => zoomBy(1.2)} />
        <IconButton icon={Expand} size="sm" label="Fit everything" onClick={fit} />
      </div>

      {mind.notes.length === 0 && mind.groups.length === 0 && (
        <div className="md-hint">
          <StickyNote size={26} />
          <b>Double-click anywhere to add a note</b>
          <span>…or write freely on the left and turn the lines into notes. Drag notes around, colour them, group them, and connect them with the dot on their right edge.</span>
        </div>
      )}
      <div className="md-help">Double-click: new note · drag: select · Space/right-drag: pan · scroll: move · Ctrl+scroll: zoom · drag the ● on a note to connect</div>
    </div>
  );
}
