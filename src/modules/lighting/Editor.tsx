/* ==========================================================================
   Lighting plot canvas editor (SVG).
   - Live drag state is local; the store is updated once on pointer-up so a
     whole drag is one undo step (global Ctrl+Z covers everything).
   - Keyboard shortcuts are handled while the canvas has focus.
   ========================================================================== */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as RDragEvent, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  Camera,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  Eye,
  EyeOff,
  Grid3x3,
  Hand,
  Lock,
  LockOpen,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  SendToBack,
  Sun,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { DiagramItem, LightingDiagram } from '@/types';
import { assetUrl } from '@/backend';
import { getProject, redo, undo, useCanRedo, useCanUndo } from '@/store/project';
import { Button, IconButton, openContextMenu, toast, type MenuItem } from '@/ui';
import { kindDef, isCameraKind, isLightKind } from './library';
import type { Palette } from './color';
import {
  angleTo,
  boxSize,
  boxesIntersect,
  cloneItems,
  dims,
  dist,
  facing,
  fmtLength,
  itemAABB,
  itemPoints,
  itemRot,
  itemScale,
  lnum,
  localHalf,
  makeItem,
  normDeg,
  num,
  rotate,
  snapStep,
  unionBox,
  type Box,
  type P,
} from './model';
import { addItems, patchDiagram, patchItem, patchItems, removeItems, reorderItems, type ZOrder } from './ops';
import { PlotLayers } from './render';
import type { DrawCtx } from './symbols';
import { TEMPLATES } from './templates';
import { DRAG_MIME } from './menus';

export interface EditorApi {
  add(kind: string): void;
  draw(kind: string): void;
  fit(): void;
  focus(): void;
}

export interface ViewPrefs {
  snap: boolean;
  beams: boolean;
  fov: boolean;
  labels: boolean;
}

interface VP {
  x: number;
  y: number;
  z: number;
}

type Drag =
  | { t: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { t: 'marquee'; start: P; base: string[] }
  | { t: 'move'; start: P; sx: number; sy: number; primary: string; orig: { id: string; x: number; y: number }[]; moved: boolean }
  | { t: 'handle'; h: string; id: string; item0: DiagramItem; start: P; hx: number; hy: number; vi: number };

const MINZ = 0.08;
const MAXZ = 8;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* module-local clipboard: survives switching diagrams */
let clipboard: DiagramItem[] = [];
let pasteCount = 0;
/* remembered view per diagram */
const viewMemo = new Map<string, VP>();

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];

function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* pointer already released */
  }
}

function normBox(a: P, b: P): Box {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
}

/** World position of a light's emitting face centre. */
function emitOrigin(it: DiagramItem): P {
  const def = kindDef(it.kind);
  const ey = (def.emit?.y ?? 0) * itemScale(it);
  return add([it.x, it.y], rotate([0, ey], itemRot(it)));
}

function lensOrigin(it: DiagramItem): P {
  const def = kindDef(it.kind);
  return add([it.x, it.y], rotate([0, (def.front ?? 0) * itemScale(it)], itemRot(it)));
}

function resizeCursor(hx: number, hy: number, rot: number): string {
  const a = normDeg((Math.atan2(hy, hx) * 180) / Math.PI + rot) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

export default function Editor({
  d,
  sel,
  setSel,
  apiRef,
  prefs,
  setPrefs,
  pal,
  inspectorOpen,
  toggleInspector,
}: {
  d: LightingDiagram;
  sel: string[];
  setSel: (ids: string[]) => void;
  apiRef: { current: EditorApi | null };
  prefs: ViewPrefs;
  setPrefs: (p: Partial<ViewPrefs>) => void;
  pal: Palette;
  inspectorOpen: boolean;
  toggleInspector: () => void;
}) {
  const { w: W, h: H, ppu, units } = dims(d);
  const step = snapStep(d);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [vp, setVpState] = useState<VP>(() => viewMemo.get(d.id) ?? { x: 40, y: 40, z: 1 });
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const setVp = (fn: VP | ((v: VP) => VP)) =>
    setVpState((v) => {
      const n = typeof fn === 'function' ? fn(v) : fn;
      viewMemo.set(d.id, n);
      return n;
    });
  const [live, setLiveState] = useState<Record<string, Partial<DiagramItem>> | null>(null);
  const liveRef = useRef(live);
  const setLive = (v: Record<string, Partial<DiagramItem>> | null) => {
    liveRef.current = v;
    setLiveState(v);
  };
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [drawing, setDrawing] = useState<{ kind: string; pts: P[]; hover: P | null } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const lastDown = useRef<{ id: string | null; t: number; x: number; y: number }>({ id: null, t: 0, x: 0, y: 0 });
  const fittedFor = useRef('');
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const selSet = useMemo(() => new Set(sel), [sel]);
  const items = useMemo(() => (live ? d.items.map((i) => (live[i.id] ? { ...i, ...live[i.id] } : i)) : d.items), [d.items, live]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const visible = useMemo(() => items.filter((i) => !i.hidden || selSet.has(i.id)), [items, selSet]);
  const ghost = useMemo(() => new Set(items.filter((i) => i.hidden && selSet.has(i.id)).map((i) => i.id)), [items, selSet]);
  const selItems = useMemo(() => sel.map((id) => byId.get(id)).filter((i): i is DiagramItem => !!i), [sel, byId]);
  const single = selItems.length === 1 ? selItems[0] : null;
  const c: DrawCtx = useMemo(() => ({ pal, ppu, units, idp: 'ed', editor: true }), [pal, ppu, units]);
  const bgHref = assetUrl(d.background) || undefined;
  const hiddenCount = useMemo(() => d.items.filter((i) => i.hidden).length, [d.items]);

  /* ------------------------------------------------------------ sizing & view */

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitTo = (box: Box, maxZ = 2.5) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const pad = 36;
    const bw = Math.max(1, box.x1 - box.x0);
    const bh = Math.max(1, box.y1 - box.y0);
    const z = clamp(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh), MINZ, maxZ);
    setVp({ z, x: (w - bw * z) / 2 - box.x0 * z, y: (h - bh * z) / 2 - box.y0 * z });
  };

  const fit = () => {
    const bb = unionBox([{ x0: 0, y0: 0, x1: W, y1: H }, ...d.items.filter((i) => !i.hidden).map((i) => itemAABB(i, ppu))]);
    if (bb) fitTo(bb);
  };

  const zoomAt = (factor: number, sx?: number, sy?: number) => {
    const { w, h } = sizeRef.current;
    const mx = sx ?? w / 2;
    const my = sy ?? h / 2;
    setVp((v) => {
      const z = clamp(v.z * factor, MINZ, MAXZ);
      return { z, x: mx - ((mx - v.x) * z) / v.z, y: my - ((my - v.y) * z) / v.z };
    });
  };

  useEffect(() => {
    if (!size.w || !size.h || fittedFor.current === d.id) return;
    fittedFor.current = d.id;
    const memo = viewMemo.get(d.id);
    if (memo) setVpState(memo);
    else fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, size.w, size.h]);

  useEffect(() => {
    setLive(null);
    setDrawing(null);
    setEditing(null);
    setMarquee(null);
    dragRef.current = null;
  }, [d.id]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
        zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * k;
        const dy = (e.shiftKey ? 0 : e.deltaY) * k;
        setVp((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  /* ------------------------------------------------------------ helpers */

  const focus = () => wrapRef.current?.focus({ preventScroll: true });

  /** Latest stored items (event handlers may run twice before a re-render, e.g. key repeat). */
  const curItems = (): DiagramItem[] => {
    try {
      return getProject().diagrams.find((x) => x.id === d.id)?.items ?? d.items;
    } catch {
      return d.items;
    }
  };

  const toCanvas = (cx: number, cy: number): P => {
    const r = (svgRef.current ?? wrapRef.current)!.getBoundingClientRect();
    const v = vpRef.current;
    return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z];
  };

  const snapOn = (e?: { altKey: boolean }) => prefs.snap && !e?.altKey;
  const snapV = (v: number) => Math.round(v / step) * step;
  const snapP = (p: P, e?: { altKey: boolean }): P => (snapOn(e) ? [snapV(p[0]), snapV(p[1])] : [Math.round(p[0]), Math.round(p[1])]);

  const viewCenter = (): P => {
    const { w, h } = sizeRef.current;
    const v = vpRef.current;
    return [(w / 2 - v.x) / v.z, (h / 2 - v.y) / v.z];
  };

  /* ------------------------------------------------------------ item actions */

  const addKind = (kind: string, at?: P) => {
    const def = kindDef(kind);
    if (def.shape === 'path' && !at) {
      startDraw(kind);
      return;
    }
    let [x, y] = at ?? viewCenter();
    if (!at) {
      x = clamp(x, Math.min(ppu, W / 2), Math.max(W - ppu, W / 2));
      y = clamp(y, Math.min(ppu, H / 2), Math.max(H - ppu, H / 2));
      let k = 0;
      while (k < 30 && curItems().some((i) => Math.abs(i.x - x) < 8 && Math.abs(i.y - y) < 8)) {
        x += 24;
        y += 24;
        k++;
      }
    }
    if (prefs.snap) {
      x = snapV(x);
      y = snapV(y);
    }
    const item = makeItem(kind, d, x, y);
    if (def.shape === 'path' && item.points) item.x = Math.round(x - item.points[1][0] / 2);
    addItems(d.id, [item]);
    setSel([item.id]);
    focus();
  };

  const startDraw = (kind: string) => {
    setDrawing({ kind, pts: [], hover: null });
    setSel([]);
    focus();
  };

  const finishDraw = (dr = drawing) => {
    if (!dr) return;
    setDrawing(null);
    const pts: P[] = [];
    for (const p of dr.pts) if (!pts.length || dist(pts[pts.length - 1], p) > 2) pts.push(p);
    if (pts.length < 2) return;
    const [x0, y0] = pts[0];
    const item = makeItem(dr.kind, d, x0, y0, { points: pts.map((p) => [Math.round(p[0] - x0), Math.round(p[1] - y0)] as [number, number]) });
    addItems(d.id, [item]);
    setSel([item.id]);
  };

  const del = (ids: string[]) => {
    if (!ids.length) return;
    removeItems(d.id, ids);
    setSel([]);
  };

  const duplicate = (ids: string[]) => {
    const all = curItems();
    const src = ids.map((id) => all.find((i) => i.id === id)).filter((i): i is DiagramItem => !!i);
    if (!src.length) return;
    const clones = cloneItems(src, all, 20, 20);
    addItems(d.id, clones);
    setSel(clones.map((i) => i.id));
  };

  const copy = (ids: string[]) => {
    const all = curItems();
    const src = ids.map((id) => all.find((i) => i.id === id)).filter((i): i is DiagramItem => !!i);
    if (!src.length) return;
    clipboard = JSON.parse(JSON.stringify(src));
    pasteCount = 0;
    toast(`Copied ${src.length} item${src.length === 1 ? '' : 's'}`, 'info', { duration: 1500 });
  };

  const paste = (at?: P) => {
    if (!clipboard.length) return;
    let dx: number;
    let dy: number;
    if (at) {
      const bb = unionBox(clipboard.map((i) => itemAABB(i, ppu)))!;
      dx = at[0] - (bb.x0 + bb.x1) / 2;
      dy = at[1] - (bb.y0 + bb.y1) / 2;
    } else {
      pasteCount++;
      dx = dy = 20 * pasteCount;
    }
    const clones = cloneItems(clipboard, curItems(), dx, dy);
    addItems(d.id, clones);
    setSel(clones.map((i) => i.id));
  };

  const nudge = (ids: string[], dx: number, dy: number) => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    const all = curItems();
    for (const id of ids) {
      const it = all.find((i) => i.id === id);
      if (it && !it.locked) patches[id] = { x: it.x + dx, y: it.y + dy };
    }
    if (Object.keys(patches).length) patchItems(d.id, patches, { coalesce: `light-nudge:${ids.join(',')}` });
  };

  const rotateBy = (ids: string[], delta: number) => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    const all = curItems();
    for (const id of ids) {
      const it = all.find((i) => i.id === id);
      if (it && !it.locked) patches[id] = { rotation: normDeg(itemRot(it) + delta) };
    }
    if (Object.keys(patches).length) patchItems(d.id, patches, { coalesce: `light-rot:${ids.join(',')}` });
  };

  const setLocked = (ids: string[], locked: boolean) => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    for (const id of ids) patches[id] = { locked };
    patchItems(d.id, patches);
  };

  const hide = (ids: string[]) => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    for (const id of ids) patches[id] = { hidden: true };
    patchItems(d.id, patches);
    setSel([]);
    toast(`${ids.length === 1 ? 'Item' : `${ids.length} items`} hidden — show again from the Objects tab`, 'info');
  };

  const unhideAll = () => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    for (const i of d.items) if (i.hidden) patches[i.id] = { hidden: false };
    patchItems(d.id, patches);
  };

  const reorder = (ids: string[], mode: ZOrder) => {
    if (ids.length) reorderItems(d.id, ids, mode);
  };

  const aimAt = (ids: string[], target: DiagramItem) => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    const all = curItems();
    for (const id of ids) {
      const it = all.find((i) => i.id === id);
      if (it && it.id !== target.id) patches[id] = { rotation: Math.round(angleTo([it.x, it.y], [target.x, target.y])) };
    }
    patchItems(d.id, patches);
  };

  const startEdit = (it: DiagramItem) => {
    if (it.locked) return;
    setEditing({ id: it.id, text: it.label ?? '' });
  };

  const commitEdit = () => {
    if (!editing) return;
    const it = d.items.find((i) => i.id === editing.id);
    if (it && (it.label ?? '') !== editing.text) patchItem(d.id, it.id, { label: editing.text });
    setEditing(null);
    focus();
  };

  const insertVertex = (it: DiagramItem, p: P) => {
    const pts = itemPoints(it);
    const local = rotate([p[0] - it.x, p[1] - it.y], -itemRot(it));
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const t = clamp(((local[0] - a[0]) * vx + (local[1] - a[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      const dd = dist([a[0] + vx * t, a[1] + vy * t], local);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    const next = [...pts];
    next.splice(best + 1, 0, [Math.round(local[0]), Math.round(local[1])]);
    patchItem(d.id, it.id, { points: next });
  };

  const removeVertex = (it: DiagramItem, vi: number) => {
    const pts = itemPoints(it);
    if (pts.length <= 2) return;
    patchItem(d.id, it.id, { points: pts.filter((_, i) => i !== vi) });
  };

  apiRef.current = { add: (k) => addKind(k), draw: startDraw, fit, focus };

  /* ------------------------------------------------------------ pointer handling */

  const handlePatch = (dr: Extract<Drag, { t: 'handle' }>, p: P, e: { shiftKey: boolean; altKey: boolean }): Partial<DiagramItem> => {
    const it = dr.item0;
    const def = kindDef(it.kind);
    const center: P = [it.x, it.y];
    const snapAngle = (r: number) => normDeg(e.shiftKey ? Math.round(r / 15) * 15 : Math.round(r));
    switch (dr.h) {
      case 'rotate':
        return { rotation: snapAngle(angleTo(center, p)) };
      case 'scale': {
        const d0 = Math.max(4, dist(center, dr.start));
        const s = clamp(Math.round(((itemScale(it) * dist(center, p)) / d0) * 20) / 20, 0.2, 8);
        return { scale: s };
      }
      case 'resize': {
        const { w, h } = boxSize(it, def, ppu);
        const rot = itemRot(it);
        const local = rotate([p[0] - it.x, p[1] - it.y], -rot);
        const min = 4;
        let nw = w;
        let nh = h;
        const snapLen = (v: number) => (snapOn(e) ? Math.max(step / 2, Math.round(v / (step / 2)) * (step / 2)) : Math.round(v));
        if (dr.hx) nw = Math.max(min, snapLen((local[0] + (dr.hx * w) / 2) * dr.hx));
        if (dr.hy) nh = Math.max(min, snapLen((local[1] + (dr.hy * h) / 2) * dr.hy));
        if (e.shiftKey && dr.hx && dr.hy) {
          const ratio = w / h;
          if (nw / nh > ratio) nw = nh * ratio;
          else nh = nw / ratio;
        }
        const cx = dr.hx ? (-dr.hx * w) / 2 + (dr.hx * nw) / 2 : 0;
        const cy = dr.hy ? (-dr.hy * h) / 2 + (dr.hy * nh) / 2 : 0;
        const off = rotate([cx, cy], rot);
        return { w: Math.round(nw), h: Math.round(nh), x: Math.round(it.x + off[0]), y: Math.round(it.y + off[1]) };
      }
      case 'vertex': {
        const sp = snapP(p, e);
        const local = rotate([sp[0] - it.x, sp[1] - it.y], -itemRot(it));
        const pts = itemPoints(it).map((q) => [q[0], q[1]] as P);
        if (dr.vi >= 0 && dr.vi < pts.length) pts[dr.vi] = [Math.round(local[0]), Math.round(local[1])];
        return { points: pts };
      }
      case 'throw': {
        const o = emitOrigin(it);
        const L = Math.max(0.5, Math.round((dist(o, p) / ppu) * 2) / 2);
        return { rotation: snapAngle(angleTo(o, p)), props: { ...(it.props ?? {}), throw: L } };
      }
      case 'spread': {
        const ax = facing(itemRot(it));
        const o = emitOrigin(it);
        const v: P = [p[0] - o[0], p[1] - o[1]];
        const len = Math.hypot(v[0], v[1]) || 1;
        const ang = (Math.acos(clamp((ax[0] * v[0] + ax[1] * v[1]) / len, -1, 1)) * 180) / Math.PI;
        let beam = clamp(Math.round(ang * 2), 4, 360);
        if (e.shiftKey) beam = Math.round(beam / 5) * 5;
        return { props: { ...(it.props ?? {}), beam } };
      }
      case 'fov': {
        const o = lensOrigin(it);
        const L = Math.max(1, Math.round((dist(o, p) / ppu) * 2) / 2);
        return { rotation: snapAngle(angleTo(o, p)), props: { ...(it.props ?? {}), fovLength: L } };
      }
    }
    return {};
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    focus();
    if (editing) commitEdit();
    const svg = svgRef.current!;
    if (e.button === 1 || (e.button === 0 && (space || tool === 'pan'))) {
      e.preventDefault();
      dragRef.current = { t: 'pan', sx: e.clientX, sy: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
      setPanning(true);
      capture(svg, e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = toCanvas(e.clientX, e.clientY);
    const now = performance.now();

    if (drawing) {
      const sp = snapP(p, e);
      const ld = lastDown.current;
      const dbl = ld.id === '__draw' && now - ld.t < 380 && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < 6;
      lastDown.current = { id: '__draw', t: now, x: e.clientX, y: e.clientY };
      if (dbl) {
        finishDraw(drawing);
        return;
      }
      const pts = [...drawing.pts, sp];
      if (drawing.kind === 'note.dimension' && pts.length >= 2) finishDraw({ ...drawing, pts });
      else setDrawing({ ...drawing, pts, hover: sp });
      return;
    }

    const target = e.target as Element;
    const hEl = target.closest('[data-h]');
    if (hEl && single && !single.locked) {
      const h = hEl.getAttribute('data-h')!;
      const vi = Number(hEl.getAttribute('data-vi') ?? -1);
      if (h === 'vertex') {
        const ld = lastDown.current;
        if (ld.id === `v${single.id}:${vi}` && now - ld.t < 380) {
          lastDown.current = { id: null, t: 0, x: 0, y: 0 };
          removeVertex(single, vi);
          return;
        }
        lastDown.current = { id: `v${single.id}:${vi}`, t: now, x: e.clientX, y: e.clientY };
      }
      dragRef.current = { t: 'handle', h, id: single.id, item0: single, start: p, hx: Number(hEl.getAttribute('data-hx') ?? 0), hy: Number(hEl.getAttribute('data-hy') ?? 0), vi };
      capture(svg, e.pointerId);
      return;
    }

    const id = target.closest('[data-id]')?.getAttribute('data-id') ?? null;
    const hit = id ? byId.get(id) : undefined;
    const item = hit && !hit.locked ? hit : undefined;
    const ld = lastDown.current;
    const isDouble = !!item && ld.id === item.id && now - ld.t < 380 && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < 6;
    lastDown.current = { id: item?.id ?? null, t: now, x: e.clientX, y: e.clientY };

    if (item) {
      if (isDouble) {
        lastDown.current = { id: null, t: 0, x: 0, y: 0 };
        const def = kindDef(item.kind);
        if (def.shape === 'path' && def.kind !== 'note.dimension') insertVertex(item, snapP(p, e));
        else startEdit(item);
        return;
      }
      let ids: string[];
      if (e.shiftKey) {
        if (selSet.has(item.id)) {
          setSel(sel.filter((x) => x !== item.id));
          return;
        }
        ids = [...sel, item.id];
      } else ids = selSet.has(item.id) ? sel : [item.id];
      setSel(ids);
      const movable = ids.map((x) => byId.get(x)).filter((i): i is DiagramItem => !!i && !i.locked);
      dragRef.current = { t: 'move', start: p, sx: e.clientX, sy: e.clientY, primary: item.id, orig: movable.map((i) => ({ id: i.id, x: i.x, y: i.y })), moved: false };
      capture(svg, e.pointerId);
      return;
    }

    if (!e.shiftKey && sel.length) setSel([]);
    dragRef.current = { t: 'marquee', start: p, base: e.shiftKey ? sel : [] };
    capture(svg, e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toCanvas(e.clientX, e.clientY);
    if (statusRef.current) statusRef.current.textContent = `${num(p[0] / ppu)}, ${num(p[1] / ppu)} ${units}`;
    if (drawing) {
      const sp = snapP(p, e);
      if (!drawing.hover || drawing.hover[0] !== sp[0] || drawing.hover[1] !== sp[1]) setDrawing({ ...drawing, hover: sp });
    }
    const dr = dragRef.current;
    if (!dr) return;
    if (dr.t === 'pan') {
      setVp((v) => ({ ...v, x: dr.vx + e.clientX - dr.sx, y: dr.vy + e.clientY - dr.sy }));
    } else if (dr.t === 'marquee') {
      setMarquee(normBox(dr.start, p));
    } else if (dr.t === 'move') {
      if (!dr.moved && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) < 3) return;
      dr.moved = true;
      if (!dr.orig.length) return;
      let dx = p[0] - dr.start[0];
      let dy = p[1] - dr.start[1];
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const prim = dr.orig.find((o) => o.id === dr.primary) ?? dr.orig[0];
      if (snapOn(e)) {
        dx = snapV(prim.x + dx) - prim.x;
        dy = snapV(prim.y + dy) - prim.y;
      }
      const next: Record<string, Partial<DiagramItem>> = {};
      for (const o of dr.orig) next[o.id] = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) };
      setLive(next);
    } else if (dr.t === 'handle') {
      setLive({ [dr.id]: handlePatch(dr, p, e) });
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const dr = dragRef.current;
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (!dr) return;
    const lv = liveRef.current;
    if (dr.t === 'pan') {
      setPanning(false);
    } else if (dr.t === 'marquee') {
      const b = normBox(dr.start, toCanvas(e.clientX, e.clientY));
      setMarquee(null);
      if (b.x1 - b.x0 < 2 && b.y1 - b.y0 < 2) return;
      const hits = items.filter((i) => !i.locked && !i.hidden && boxesIntersect(itemAABB(i, ppu), b)).map((i) => i.id);
      setSel([...new Set([...dr.base, ...hits])]);
    } else if (dr.t === 'move') {
      if (dr.moved && lv) patchItems(d.id, lv);
      setLive(null);
    } else if (dr.t === 'handle') {
      if (lv && lv[dr.id]) patchItems(d.id, lv);
      setLive(null);
    }
  };

  /* ------------------------------------------------------------ context menus */

  const itemMenu = (ids: string[]): MenuItem[] => {
    const its = ids.map((id) => d.items.find((i) => i.id === id)).filter((i): i is DiagramItem => !!i);
    const one = its.length === 1 ? its[0] : null;
    const allLocked = its.every((i) => i.locked);
    const aimable = its.filter((i) => isLightKind(i.kind) || isCameraKind(i.kind) || kindDef(i.kind).category === 'grip' || kindDef(i.kind).category === 'sound');
    const targets = d.items.filter((i) => kindDef(i.kind).category === 'people' && i.kind !== 'person.monitor' && !ids.includes(i.id)).slice(0, 6);
    const out: (MenuItem | false | null)[] = [
      one && { label: kindDef(one.kind).shape === 'text' ? 'Edit text' : 'Edit label', icon: Pencil, shortcut: 'Enter', onClick: () => startEdit(one), disabled: !!one.locked },
      { label: 'Duplicate', icon: CopyPlus, shortcut: 'Ctrl+D', onClick: () => duplicate(ids) },
      { label: 'Copy', icon: Copy, shortcut: 'Ctrl+C', onClick: () => copy(ids) },
      { label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl+V', disabled: !clipboard.length, onClick: () => paste() },
      { separator: true },
      ...(aimable.length && targets.length
        ? [{ header: 'Aim at' } as MenuItem, ...targets.map((t) => ({ label: t.label?.trim() || kindDef(t.kind).label, icon: Crosshair, onClick: () => aimAt(aimable.map((a) => a.id), t) }) as MenuItem), { separator: true } as MenuItem]
        : []),
      { label: 'Bring to front', icon: BringToFront, shortcut: 'Ctrl+]', onClick: () => reorder(ids, 'front') },
      { label: 'Bring forward', icon: ArrowUp, shortcut: ']', onClick: () => reorder(ids, 'forward') },
      { label: 'Send backward', icon: ArrowDown, shortcut: '[', onClick: () => reorder(ids, 'backward') },
      { label: 'Send to back', icon: SendToBack, shortcut: 'Ctrl+[', onClick: () => reorder(ids, 'back') },
      { separator: true },
      { label: 'Rotate 15° clockwise', icon: RotateCw, shortcut: 'R', onClick: () => rotateBy(ids, 15) },
      { label: 'Rotate 90° clockwise', icon: RotateCw, onClick: () => rotateBy(ids, 90) },
      { label: 'Rotate 90° counter-clockwise', icon: RotateCcw, onClick: () => rotateBy(ids, -90) },
      { label: allLocked ? 'Unlock' : 'Lock', icon: allLocked ? LockOpen : Lock, shortcut: 'Ctrl+L', onClick: () => setLocked(ids, !allLocked) },
      { label: 'Hide', icon: EyeOff, onClick: () => hide(ids) },
      { separator: true },
      { label: ids.length > 1 ? `Delete ${ids.length} items` : 'Delete', icon: Trash2, danger: true, shortcut: 'Del', onClick: () => del(ids) },
    ];
    return out.filter((x): x is MenuItem => !!x);
  };

  const canvasMenu = (p: P): MenuItem[] => {
    const quick = (kind: string, label: string): MenuItem => ({ label, icon: Plus, onClick: () => addKind(kind, snapP(p)) });
    const out: MenuItem[] = [
      { label: 'Paste here', icon: ClipboardPaste, shortcut: 'Ctrl+V', disabled: !clipboard.length, onClick: () => paste(p) },
      { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => setSel(d.items.filter((i) => !i.hidden && !i.locked).map((i) => i.id)) },
      { separator: true },
      { header: 'Add here' },
      quick('person.actor', 'Actor'),
      quick('camera.cinema', 'Camera'),
      quick('light.fresnel', 'Light (Fresnel)'),
      quick('light.softbox', 'Light (Softbox)'),
      quick('note.text', 'Text'),
      { separator: true },
      { label: 'Fit to screen', icon: Maximize, shortcut: 'Shift+1', onClick: fit },
      { label: 'Snap to grid', checked: prefs.snap, onClick: () => setPrefs({ snap: !prefs.snap }) },
      { label: 'Show grid', checked: d.showGrid !== false, onClick: () => patchDiagram(d.id, { showGrid: d.showGrid === false }) },
      { label: 'Show beams', checked: prefs.beams, onClick: () => setPrefs({ beams: !prefs.beams }) },
      { label: 'Show camera FOV', checked: prefs.fov, onClick: () => setPrefs({ fov: !prefs.fov }) },
    ];
    if (hiddenCount) out.push({ separator: true }, { label: `Show ${hiddenCount} hidden item${hiddenCount === 1 ? '' : 's'}`, icon: Eye, onClick: unhideAll });
    return out;
  };

  const onContextMenu = (e: RMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (drawing) {
      finishDraw();
      return;
    }
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
    const it = id ? d.items.find((i) => i.id === id) : undefined;
    if (it) {
      let ids = sel;
      if (!selSet.has(it.id)) {
        ids = [it.id];
        setSel(ids);
      }
      openContextMenu(e, itemMenu(ids));
    } else {
      openContextMenu(e, canvasMenu(toCanvas(e.clientX, e.clientY)));
    }
  };

  /* ------------------------------------------------------------ keyboard */

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (isTextTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const lk = k.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (!space) setSpace(true);
      return;
    }
    if (k === 'Escape') {
      if (drawing) finishDraw();
      else if (sel.length) setSel([]);
      else if (tool === 'pan') setTool('select');
      e.preventDefault();
      return;
    }
    if (k === 'Enter') {
      if (drawing) finishDraw();
      else if (single) startEdit(single);
      e.preventDefault();
      return;
    }
    if (k === 'Delete' || k === 'Backspace') {
      if (drawing) {
        setDrawing({ ...drawing, pts: drawing.pts.slice(0, -1) });
      } else if (sel.length) del(sel);
      e.preventDefault();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey) {
      if (lk === 'd') {
        e.preventDefault();
        duplicate(sel);
        return;
      }
      if (lk === 'c') {
        e.preventDefault();
        copy(sel);
        return;
      }
      if (lk === 'x') {
        e.preventDefault();
        if (sel.length) {
          copy(sel);
          del(sel);
        }
        return;
      }
      if (lk === 'v') {
        e.preventDefault();
        paste();
        return;
      }
      if (lk === 'a') {
        e.preventDefault();
        setSel(d.items.filter((i) => !i.hidden && !i.locked).map((i) => i.id));
        return;
      }
      if (lk === 'l') {
        e.preventDefault();
        if (selItems.length) setLocked(sel, !selItems.every((i) => i.locked));
        return;
      }
      if (k === ']') {
        e.preventDefault();
        reorder(sel, 'front');
        return;
      }
      if (k === '[') {
        e.preventDefault();
        reorder(sel, 'back');
        return;
      }
      if (k === '0') {
        e.preventDefault();
        zoomAt(1 / vpRef.current.z);
        return;
      }
    }
    if (mod) return;
    if (k.startsWith('Arrow') && sel.length) {
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      nudge(sel, k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0, k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0);
      return;
    }
    if (lk === 'r' && sel.length) {
      e.preventDefault();
      rotateBy(sel, e.shiftKey ? -15 : 15);
      return;
    }
    if (k === ']') return reorder(sel, 'forward');
    if (k === '[') return reorder(sel, 'backward');
    if (lk === 'v' && !e.shiftKey) return setTool('select');
    if (lk === 'h' && !e.shiftKey) return setTool('pan');
    if (e.shiftKey && e.code === 'Digit1') {
      e.preventDefault();
      fit();
      return;
    }
    if (e.shiftKey && e.code === 'Digit0') {
      e.preventDefault();
      zoomAt(1 / vpRef.current.z);
      return;
    }
    if (k === '+' || k === '=') zoomAt(1.2);
    if (k === '-' || k === '_') zoomAt(1 / 1.2);
  };

  const onKeyUp = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') setSpace(false);
  };

  /* ------------------------------------------------------------ overlay rendering */

  const z = vp.z;
  const hs = { fill: '#ffffff', stroke: pal.select, strokeWidth: 1.5 / z };
  const hr = 4.5 / z;

  const outline = (it: DiagramItem) => {
    const def = kindDef(it.kind);
    const color = it.locked ? pal.ink3 : pal.select;
    if (def.shape === 'path') {
      const rot = itemRot(it);
      const pts = itemPoints(it).map((q) => add([it.x, it.y], rotate(q, rot)));
      return <polyline key={`o${it.id}`} points={pts.map((q) => `${q[0]},${q[1]}`).join(' ')} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={6 / z} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
    }
    const { hw, hh } = localHalf(it, ppu);
    const pad = 4 / z;
    return (
      <g key={`o${it.id}`} transform={`translate(${it.x} ${it.y}) rotate(${itemRot(it)})`} pointerEvents="none">
        <rect x={-hw - pad} y={-hh - pad} width={hw * 2 + pad * 2} height={hh * 2 + pad * 2} fill="none" stroke={color} strokeWidth={1.3 / z} strokeDasharray={`${5 / z} ${3 / z}`} />
        {it.locked && (
          <g transform={`translate(${hw + pad} ${-hh - pad}) rotate(${-itemRot(it)}) scale(${1 / z})`}>
            <circle r={8} fill={pal.ink3} />
            <rect x={-3.5} y={-1.5} width={7} height={5.5} rx={1} fill="#fff" />
            <path d="M-2.2,-1.5 V-3.5 A2.2,2.2 0 0 1 2.2,-3.5 V-1.5" fill="none" stroke="#fff" strokeWidth={1.3} />
          </g>
        )}
      </g>
    );
  };

  const handles = (it: DiagramItem): ReactNode => {
    const def = kindDef(it.kind);
    const rot = itemRot(it);
    if (def.shape === 'path') {
      return itemPoints(it).map((q, i) => {
        const w = add([it.x, it.y], rotate(q, rot));
        return <circle key={`v${i}`} data-h="vertex" data-vi={i} cx={w[0]} cy={w[1]} r={hr * 1.1} {...hs} style={{ cursor: 'move' }} />;
      });
    }
    const { hw, hh } = localHalf(it, ppu);
    const pad = 4 / z;
    const local: ReactNode[] = [
      <line key="rl" x1={0} y1={-hh - pad} x2={0} y2={-hh - 24 / z} stroke={pal.select} strokeWidth={1.2 / z} pointerEvents="none" />,
      <circle key="r" data-h="rotate" cx={0} cy={-hh - 24 / z} r={hr * 1.15} {...hs} style={{ cursor: 'grab' }} />,
    ];
    if (def.shape === 'box') {
      for (const hx of [-1, 0, 1])
        for (const hy of [-1, 0, 1]) {
          if (!hx && !hy) continue;
          local.push(
            <rect
              key={`s${hx}${hy}`}
              data-h="resize"
              data-hx={hx}
              data-hy={hy}
              x={hx * (hw + pad) - hr}
              y={hy * (hh + pad) - hr}
              width={hr * 2}
              height={hr * 2}
              {...hs}
              style={{ cursor: resizeCursor(hx, hy, rot) }}
            />,
          );
        }
    } else {
      for (const [hx, hy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        local.push(<rect key={`s${hx}${hy}`} data-h="scale" data-hx={hx} data-hy={hy} x={hx * (hw + pad) - hr} y={hy * (hh + pad) - hr} width={hr * 2} height={hr * 2} {...hs} style={{ cursor: resizeCursor(hx, hy, rot) }} />);
    }
    const world: ReactNode[] = [];
    const diamond = (key: string, h: string, at: P, fill: string, title: string) => (
      <rect key={key} data-h={h} x={at[0] - hr * 1.1} y={at[1] - hr * 1.1} width={hr * 2.2} height={hr * 2.2} transform={`rotate(45 ${at[0]} ${at[1]})`} fill={fill} stroke="#ffffff" strokeWidth={1.4 / z} style={{ cursor: 'crosshair' }}>
        <title>{title}</title>
      </rect>
    );
    if (isLightKind(it.kind) && prefs.beams) {
      const o = emitOrigin(it);
      const fw = facing(rot);
      const R = lnum(it, 'throw', 10) * ppu;
      const beam = lnum(it, 'beam', 60);
      world.push(<line key="tl" x1={o[0]} y1={o[1]} x2={o[0] + fw[0] * R} y2={o[1] + fw[1] * R} stroke="#f5a524" strokeOpacity={0.7} strokeWidth={1 / z} strokeDasharray={`${3 / z} ${3 / z}`} pointerEvents="none" />);
      world.push(diamond('throw', 'throw', [o[0] + fw[0] * R, o[1] + fw[1] * R], '#f5a524', 'Drag to aim and set throw'));
      if (beam < 359) {
        const sd = facing(rot - beam / 2);
        world.push(diamond('spread', 'spread', [o[0] + sd[0] * R * 0.72, o[1] + sd[1] * R * 0.72], '#e8590c', 'Drag to change beam angle'));
      }
    }
    if (isCameraKind(it.kind) && prefs.fov && it.props?.showFov !== false) {
      const o = lensOrigin(it);
      const fw = facing(rot);
      const L = lnum(it, 'fovLength', 15) * ppu;
      world.push(diamond('fov', 'fov', [o[0] + fw[0] * L, o[1] + fw[1] * L], pal.camera, 'Drag to aim and set the frustum length'));
    }
    return (
      <>
        <g transform={`translate(${it.x} ${it.y}) rotate(${rot})`}>{local}</g>
        {world}
      </>
    );
  };

  const drawPreview = () => {
    if (!drawing) return null;
    const pts = [...drawing.pts, ...(drawing.hover ? [drawing.hover] : [])];
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    return (
      <g pointerEvents="none">
        <polyline points={pts.map((q) => `${q[0]},${q[1]}`).join(' ')} fill="none" stroke={pal.select} strokeWidth={2 / z} strokeDasharray={`${6 / z} ${4 / z}`} />
        {drawing.pts.map((q, i) => (
          <circle key={i} cx={q[0]} cy={q[1]} r={3.5 / z} fill={pal.select} />
        ))}
        {prev && (
          <text x={last[0] + 10 / z} y={last[1] - 10 / z} fontSize={11 / z} fill={pal.select} fontWeight={650} stroke={pal.halo} strokeWidth={3 / z} paintOrder="stroke">
            {fmtLength(dist(prev, last) / ppu, units)}
          </text>
        )}
      </g>
    );
  };

  /* ------------------------------------------------------------ label editor overlay */

  const labelEditor = () => {
    if (!editing) return null;
    const it = byId.get(editing.id);
    if (!it) return null;
    const def = kindDef(it.kind);
    const b = itemAABB(it, ppu);
    const inside = def.shape === 'text' || (def.shape === 'box' && def.category !== 'grip' && Math.min(b.x1 - b.x0, b.y1 - b.y0) >= 24);
    const sx = ((b.x0 + b.x1) / 2) * z + vp.x;
    const sy = inside ? ((b.y0 + b.y1) / 2) * z + vp.y : b.y1 * z + vp.y + 14;
    const done = (e: RKeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(null);
        focus();
      } else if (e.key === 'Enter' && !(def.shape === 'text' && e.shiftKey)) {
        e.preventDefault();
        commitEdit();
      }
    };
    return (
      <div className="light-label-edit" style={{ left: sx, top: sy }}>
        {def.shape === 'text' ? (
          <textarea autoFocus value={editing.text} rows={Math.max(1, editing.text.split('\n').length)} onChange={(e) => setEditing({ ...editing, text: e.target.value })} onKeyDown={done} onBlur={commitEdit} placeholder="Text (Shift+Enter for a new line)" />
        ) : (
          <input autoFocus value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} onKeyDown={done} onBlur={commitEdit} onFocus={(e) => e.target.select()} placeholder={isCameraKind(it.kind) ? 'Camera ID (A, B…)' : 'Label'} />
        )}
      </div>
    );
  };

  /* ------------------------------------------------------------ drop from palette */

  const onDragOver = (e: RDragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: RDragEvent) => {
    const kind = e.dataTransfer.getData(DRAG_MIME);
    if (!kind) return;
    e.preventDefault();
    addKind(kind, snapP(toCanvas(e.clientX, e.clientY)));
  };

  /* ------------------------------------------------------------ render */

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const built = t.build();
    patchDiagram(d.id, { items: built.items, width: built.width, height: built.height, pxPerUnit: built.pxPerUnit, units: built.units, notes: d.notes || built.notes });
    fittedFor.current = '';
    viewMemo.delete(d.id);
    setTimeout(() => {
      fittedFor.current = d.id;
      const bb = unionBox([{ x0: 0, y0: 0, x1: built.width, y1: built.height }]);
      if (bb) fitTo(bb);
    }, 0);
  };

  const pct = Math.round(z * 100);
  const cursorCls = panning ? 'is-panning' : space || tool === 'pan' ? 'is-pan' : drawing ? 'is-drawing' : '';
  const drawingDef = drawing ? kindDef(drawing.kind) : null;

  return (
    <div className="light-editor">
      <div className="light-toolbar">
        <div className="btn-group">
          <IconButton icon={MousePointer2} label="Select (V)" size="sm" variant="default" active={tool === 'select' && !drawing} onClick={() => setTool('select')} />
          <IconButton icon={Hand} label="Pan (H, or hold Space)" size="sm" variant="default" active={tool === 'pan'} onClick={() => setTool('pan')} />
        </div>
        <div className="btn-group">
          <IconButton icon={Minus} label="Zoom out (-)" size="sm" variant="default" onClick={() => zoomAt(1 / 1.25)} />
          <Button size="sm" className="light-zoom" onClick={() => zoomAt(1 / z)} title="Zoom to 100% (Shift+0)">
            {pct}%
          </Button>
          <IconButton icon={Plus} label="Zoom in (+)" size="sm" variant="default" onClick={() => zoomAt(1.25)} />
          <IconButton icon={Maximize} label="Fit to screen (Shift+1)" size="sm" variant="default" onClick={fit} />
        </div>
        <div className="btn-group">
          <IconButton icon={Undo2} label="Undo (Ctrl+Z)" size="sm" variant="default" disabled={!canUndo} onClick={() => undo()} />
          <IconButton icon={Redo2} label="Redo (Ctrl+Y)" size="sm" variant="default" disabled={!canRedo} onClick={() => redo()} />
        </div>
        <div className="btn-group">
          <IconButton icon={Magnet} label={`Snap to grid (${units === 'm' ? '25 cm' : '6 in'}) — hold Alt to bypass`} size="sm" variant="default" active={prefs.snap} onClick={() => setPrefs({ snap: !prefs.snap })} />
          <IconButton icon={Grid3x3} label="Show grid" size="sm" variant="default" active={d.showGrid !== false} onClick={() => patchDiagram(d.id, { showGrid: d.showGrid === false })} />
          <IconButton icon={Sun} label="Show light beams" size="sm" variant="default" active={prefs.beams} onClick={() => setPrefs({ beams: !prefs.beams })} />
          <IconButton icon={Camera} label="Show camera field of view" size="sm" variant="default" active={prefs.fov} onClick={() => setPrefs({ fov: !prefs.fov })} />
          <IconButton icon={Tag} label="Show labels" size="sm" variant="default" active={prefs.labels} onClick={() => setPrefs({ labels: !prefs.labels })} />
        </div>
        {sel.length > 0 && (
          <div className="btn-group">
            <IconButton icon={RotateCw} label="Rotate 15° (R)" size="sm" variant="default" onClick={() => rotateBy(sel, 15)} />
            <IconButton icon={BringToFront} label="Bring to front (Ctrl+])" size="sm" variant="default" onClick={() => reorder(sel, 'front')} />
            <IconButton icon={SendToBack} label="Send to back (Ctrl+[)" size="sm" variant="default" onClick={() => reorder(sel, 'back')} />
            <IconButton icon={selItems.every((i) => i.locked) ? LockOpen : Lock} label={selItems.every((i) => i.locked) ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} size="sm" variant="default" onClick={() => setLocked(sel, !selItems.every((i) => i.locked))} />
            <IconButton icon={CopyPlus} label="Duplicate (Ctrl+D)" size="sm" variant="default" onClick={() => duplicate(sel)} />
            <IconButton icon={Trash2} label="Delete (Del)" size="sm" variant="default" onClick={() => del(sel)} />
          </div>
        )}
        <div className="spacer" />
        <IconButton icon={inspectorOpen ? PanelRightClose : PanelRightOpen} label={inspectorOpen ? 'Hide inspector' : 'Show inspector'} size="sm" onClick={toggleInspector} />
      </div>

      <div
        ref={wrapRef}
        className={`light-canvas ${cursorCls}`}
        tabIndex={0}
        style={{ background: pal.desk }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => setSpace(false)}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg ref={svgRef} className="light-svg" width="100%" height="100%" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onContextMenu={onContextMenu}>
          <g transform={`translate(${vp.x} ${vp.y}) scale(${z})`}>
            <rect x={-2 / z} y={-2 / z} width={W + 4 / z} height={H + 4 / z} fill={pal.gridMajor} opacity={0.6} pointerEvents="none" />
            <PlotLayers
              d={d}
              items={visible}
              all={items}
              c={c}
              opts={{ beams: prefs.beams, fov: prefs.fov, grid: d.showGrid !== false, labels: prefs.labels }}
              bgHref={bgHref}
              region={{ x0: 0, y0: 0, x1: W, y1: H }}
              zoom={z}
              ghost={ghost}
            />
            <g>{selItems.map(outline)}</g>
            {single && !single.locked && !drawing && <g>{handles(single)}</g>}
            {marquee && <rect x={marquee.x0} y={marquee.y0} width={marquee.x1 - marquee.x0} height={marquee.y1 - marquee.y0} fill={pal.select} fillOpacity={0.08} stroke={pal.select} strokeWidth={1 / z} pointerEvents="none" />}
            {drawPreview()}
          </g>
        </svg>
        {labelEditor()}
        {d.items.length === 0 && !drawing && (
          <div className="light-canvas-empty">
            <div className="light-canvas-empty-card">
              <h3>Start your plot</h3>
              <p>Click or drag items from the library on the left — or start from a template:</p>
              <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
                {TEMPLATES.map((t) => (
                  <Button key={t.id} size="sm" onClick={() => applyTemplate(t.id)} title={t.description}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
        {drawing && (
          <div className="light-draw-hint">
            <strong>{drawingDef?.label}</strong> —{' '}
            {drawing.kind === 'note.dimension' ? 'click the start and end points' : 'click to add points · double-click, Enter or right-click to finish'} · Esc to {drawing.pts.length >= 2 ? 'finish' : 'cancel'}
          </div>
        )}
      </div>

      <div className="light-status">
        <span className="mono" ref={statusRef}>
          —
        </span>
        <span>
          Grid: 1 square = 1 {units}
          {d.showGrid !== false ? '' : ' (hidden)'}
        </span>
        {sel.length > 0 && <span>{sel.length} selected</span>}
        <div className="spacer" />
        <span className="muted">Shift+click / drag to multi-select · Space+drag to pan · Ctrl+wheel to zoom · Alt bypasses snap</span>
      </div>
    </div>
  );
}
