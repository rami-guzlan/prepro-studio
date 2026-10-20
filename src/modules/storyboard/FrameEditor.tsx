/* Frame editor: large frame with a sketch layer (pen, highlighter, eraser, lines,
   arrows, shapes, text) + all shot fields. The drawing is saved as a transparent
   PNG in shot.drawing; the frame image itself is never modified (unless flattened). */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  Grid3x3,
  Highlighter,
  ImagePlus,
  Layers,
  Loader2,
  Minus,
  MoveUpRight,
  Pencil,
  Redo2,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import type { Shot, ShotStatus } from '@/types';
import { useProject } from '@/store/project';
import { sceneLabel, useScriptModel } from '@/derived/script';
import { assetUrl, importAssetBytes, importImageFile, pickImages } from '@/backend';
import { canvasToPng, isImageFile } from '@/lib/images';
import { LENSES, SHOT_ANGLES, SHOT_EQUIPMENT, SHOT_MOVEMENTS, SHOT_SIZES, SHOT_STATUSES, type Option } from '@/lib/constants';
import { Button, Combo, confirmDialog, Field, Input, Modal, MultiSelect, NumberInput, Select, Textarea, toast } from '@/ui';
import { CAMERAS, DEFAULT_FRAME_SECONDS, groupKeyOf, moveShotsToScene, shotOps, shotTitle, UNASSIGNED } from '../shots/shotData';
import { canvasToJpeg, drawCover, frameSize, isCanvasBlank, loadAssetImage } from './canvasUtils';
import { constrain, drawOp, renderLayer, SKETCH_COLORS, textSize, type Op, type Pt, type Tool } from './sketch';
import { useFitBox } from './useFit';

const TOOLS: { id: Tool; label: string; key: string; icon: typeof Pencil }[] = [
  { id: 'pen', label: 'Pen', key: 'P', icon: Pencil },
  { id: 'highlighter', label: 'Highlighter', key: 'H', icon: Highlighter },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: Eraser },
  { id: 'line', label: 'Line', key: 'L', icon: Minus },
  { id: 'arrow', label: 'Arrow (camera / actor movement)', key: 'A', icon: MoveUpRight },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle },
  { id: 'text', label: 'Text label', key: 'T', icon: Type },
];
const TOOL_KEYS: Record<string, Tool> = { p: 'pen', b: 'pen', h: 'highlighter', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text' };
const STROKE_TOOLS: Tool[] = ['pen', 'highlighter', 'eraser'];
const SHAPE_TOOLS: Tool[] = ['line', 'arrow', 'rect', 'ellipse'];

const LS_PREFS = 'prepro.storyboard.sketchPrefs';

function readPrefs(): { tool: Tool; color: string; width: number; dashed: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(LS_PREFS) || 'null');
    if (v && typeof v === 'object') return { tool: v.tool ?? 'pen', color: v.color ?? '#111111', width: Number(v.width) || 6, dashed: !!v.dashed };
  } catch {
    /* ignore */
  }
  return { tool: 'pen', color: '#111111', width: 6, dashed: false };
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export interface FrameEditorProps {
  shotId: string;
  /** shot ids in display order (Prev / Next) */
  order: string[];
  aspect: number;
  onClose: () => void;
}

export function FrameEditor({ shotId, order, aspect, onClose }: FrameEditorProps) {
  const [id, setId] = useState(shotId);
  const shot = useProject((p) => p.shots.find((s) => s.id === id));
  const characters = useProject((p) => p.characters);
  const model = useScriptModel();

  const prefs = useMemo(readPrefs, []);
  const [tool, setTool] = useState<Tool>(prefs.tool);
  const [color, setColor] = useState(prefs.color);
  const [width, setWidth] = useState(prefs.width);
  const [dashed, setDashed] = useState(prefs.dashed);
  const [thirds, setThirds] = useState(false);
  const [hideImage, setHideImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseLoading, setBaseLoading] = useState(false);
  const [textDraft, setTextDraft] = useState<{ at: Pt; x: number; y: number; value: string } | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const { w: CW, h: CH } = useMemo(() => frameSize(aspect, 1600), [aspect]);
  const { ref: stageRef, box } = useFitBox(aspect, 28);
  const scale = box.w ? box.w / CW : 1;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const opsRef = useRef<Op[]>([]);
  const redoRef = useRef<Op[]>([]);
  const currentRef = useRef<Op | null>(null);
  const savingRef = useRef(false);
  const blockedRef = useRef(false);

  const dirty = opsRef.current.length > 0 || hideImage;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const textDraftRef = useRef(textDraft);
  textDraftRef.current = textDraft;

  useEffect(() => {
    try {
      localStorage.setItem(LS_PREFS, JSON.stringify({ tool, color, width, dashed }));
    } catch {
      /* ignore */
    }
  }, [tool, color, width, dashed]);

  /* ---------------- rendering */

  const committed = () => {
    let c = committedRef.current;
    if (!c || c.width !== CW || c.height !== CH) {
      c = document.createElement('canvas');
      c.width = CW;
      c.height = CH;
      committedRef.current = c;
    }
    return c;
  };

  const paint = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(committed(), 0, 0);
    if (currentRef.current) drawOp(ctx, currentRef.current, CW, CH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CW, CH]);

  const rebuild = useCallback(() => {
    const c = committed();
    renderLayer(c.getContext('2d')!, baseRef.current, opsRef.current, CW, CH);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CW, CH, paint]);

  /* ---------------- load the frame's existing drawing */

  const drawingAtOpen = shot?.drawing;
  useEffect(() => {
    opsRef.current = [];
    redoRef.current = [];
    currentRef.current = null;
    baseRef.current = null;
    setHideImage(false);
    setTextDraft(null);
    rebuild();
    bump();
    if (!drawingAtOpen) return;
    let cancelled = false;
    setBaseLoading(true);
    loadAssetImage(drawingAtOpen)
      .then((l) => {
        if (cancelled) return l.release();
        const c = document.createElement('canvas');
        c.width = CW;
        c.height = CH;
        c.getContext('2d')!.drawImage(l.img, 0, 0, CW, CH);
        l.release();
        baseRef.current = c;
        rebuild();
      })
      .catch(() => toast('Could not load the existing sketch layer', 'error'))
      .finally(() => {
        if (!cancelled) setBaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // reload only when switching frames (our own saves update the base directly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, CW, CH]);

  // repaint when the canvas element is (re)mounted or resized
  useEffect(() => {
    paint();
  }, [paint, box.w, box.h]);

  /* ---------------- ops */

  const pushOp = (op: Op) => {
    opsRef.current = [...opsRef.current, op];
    redoRef.current = [];
    if (op.t === 'clear') rebuild();
    else {
      drawOp(committed().getContext('2d')!, op, CW, CH);
      paint();
    }
    bump();
  };

  const undo = () => {
    if (!opsRef.current.length) return;
    const op = opsRef.current[opsRef.current.length - 1];
    opsRef.current = opsRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, op];
    rebuild();
    bump();
  };

  const redo = () => {
    if (!redoRef.current.length) return;
    const op = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    opsRef.current = [...opsRef.current, op];
    rebuild();
    bump();
  };

  const layerHasContent = () => !isCanvasBlank(committed());

  const clearDrawing = () => {
    if (!layerHasContent()) return;
    pushOp({ t: 'clear' });
  };

  /* ---------------- pointer input */

  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CW, ((e.clientY - r.top) / r.height) * CH];
  };

  const moveCursor = (e: { clientX: number; clientY: number }) => {
    const cur = cursorRef.current;
    const fr = frameRef.current;
    if (!cur || !fr) return;
    const r = fr.getBoundingClientRect();
    cur.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
  };

  const commitText = () => {
    const d = textDraftRef.current;
    if (!d) return;
    textDraftRef.current = null;
    setTextDraft(null);
    if (d.value.trim()) pushOp({ t: 'text', color, size: textSize(width), at: d.at, text: d.value.replace(/\s+$/, '') });
  };

  const onPointerDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (textDraftRef.current) {
      commitText();
      return;
    }
    const p = toCanvas(e);
    if (tool === 'text') {
      e.preventDefault();
      const fr = frameRef.current!.getBoundingClientRect();
      setTextDraft({ at: p, x: e.clientX - fr.left, y: e.clientY - fr.top, value: '' });
      setTimeout(() => textRef.current?.focus(), 0);
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    if (STROKE_TOOLS.includes(tool)) currentRef.current = { t: 'stroke', tool: tool as 'pen' | 'highlighter' | 'eraser', color, width, pts: [p] };
    else currentRef.current = { t: 'shape', tool: tool as 'line' | 'arrow' | 'rect' | 'ellipse', color, width, a: p, b: p, dashed };
    paint();
  };

  const onPointerMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    moveCursor(e);
    const cur = currentRef.current;
    if (!cur) return;
    if (cur.t === 'stroke') {
      const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
      const list = evs.length ? evs : [e.nativeEvent];
      for (const ev of list) {
        const p = toCanvas(ev);
        const last = cur.pts[cur.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.2) cur.pts.push(p);
      }
    } else if (cur.t === 'shape') {
      const p = toCanvas(e);
      cur.b = e.shiftKey ? constrain(cur.tool, cur.a, p) : p;
    }
    paint();
  };

  const onPointerUp = () => {
    const cur = currentRef.current;
    if (!cur) return;
    currentRef.current = null;
    if (cur.t === 'shape' && Math.hypot(cur.b[0] - cur.a[0], cur.b[1] - cur.a[1]) < 4) {
      paint();
      return;
    }
    pushOp(cur);
  };

  /* ---------------- save / flatten / navigation */

  const save = async (): Promise<boolean> => {
    if (savingRef.current || !shot) return false;
    if (textDraftRef.current) commitText();
    const hasOps = opsRef.current.length > 0;
    if (!hasOps && !hideImage) return true;
    savingRef.current = true;
    setSaving(true);
    try {
      const patch: Partial<Shot> = {};
      const layer = committed();
      let newBase: HTMLCanvasElement | null = baseRef.current;
      if (hasOps) {
        if (isCanvasBlank(layer)) {
          patch.drawing = undefined;
          newBase = null;
        } else {
          patch.drawing = await importAssetBytes(await canvasToPng(layer), 'png');
          newBase = cloneCanvas(layer);
        }
      }
      if (hideImage) patch.image = undefined;
      shotOps.update(shot.id, patch, false);
      baseRef.current = newBase;
      opsRef.current = [];
      redoRef.current = [];
      setHideImage(false);
      rebuild();
      bump();
      return true;
    } catch (e) {
      toast(`Could not save the sketch: ${e instanceof Error ? e.message : e}`, 'error');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const flatten = async () => {
    if (!shot) return;
    const bg = hideImage ? undefined : shot.image;
    if (!layerHasContent()) {
      toast('Draw something first — there is no sketch to flatten', 'info');
      return;
    }
    blockedRef.current = true;
    const ok = await confirmDialog({
      title: 'Flatten sketch into the image?',
      message:
        'The drawing is merged into a new frame image and the sketch layer is cleared. The original image file stays in the project, so this can be undone with Ctrl+Z after closing the editor.',
      confirmLabel: 'Flatten',
    });
    blockedRef.current = false;
    if (!ok) return;
    setSaving(true);
    try {
      const c = document.createElement('canvas');
      c.width = CW;
      c.height = CH;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CW, CH);
      if (bg) {
        const l = await loadAssetImage(bg);
        drawCover(ctx, l.img, 0, 0, CW, CH);
        l.release();
      }
      ctx.drawImage(committed(), 0, 0);
      const name = bg ? await importAssetBytes(await canvasToJpeg(c, 0.92), 'jpg') : await importAssetBytes(await canvasToPng(c), 'png');
      shotOps.update(shot.id, { image: name, drawing: undefined }, false);
      baseRef.current = null;
      opsRef.current = [];
      redoRef.current = [];
      setHideImage(false);
      rebuild();
      bump();
      toast('Sketch flattened into the frame image');
    } catch (e) {
      toast(`Could not flatten: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const index = order.indexOf(id);
  const go = async (delta: number) => {
    const next = order[index + delta];
    if (!next || savingRef.current) return;
    if (dirtyRef.current && !(await save())) return;
    setId(next);
  };

  const requestClose = async () => {
    if (textDraftRef.current) {
      setTextDraft(null);
      return;
    }
    if (blockedRef.current) return;
    if (!dirtyRef.current) {
      onClose();
      return;
    }
    blockedRef.current = true;
    const discard = await confirmDialog({
      title: 'Discard sketch changes?',
      message: 'The drawing changes on this frame have not been saved.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      danger: true,
    });
    blockedRef.current = false;
    if (discard) onClose();
  };

  const saveAndClose = async () => {
    if (await save()) onClose();
  };

  /* ---------------- images */

  const setImage = (name: string | undefined) => {
    if (!shot) return;
    shotOps.update(shot.id, { image: name }, false);
    setHideImage(false);
  };

  const replaceImage = async () => {
    try {
      const [name] = await pickImages(false);
      if (name) setImage(name);
    } catch (e) {
      toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const importFiles = async (files: File[]) => {
    const img = files.find(isImageFile);
    if (!img) return false;
    try {
      setImage(await importImageFile(img));
      toast('Frame image replaced — the sketch layer is kept');
    } catch (e) {
      toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
    }
    return true;
  };

  /* ---------------- keyboard & clipboard */

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (blockedRef.current) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      e.stopPropagation();
      void save();
      return;
    }
    if (isTyping(e.target)) return;
    if (mod && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      void go(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (!mod && !e.altKey) {
      if (TOOL_KEYS[k]) {
        e.preventDefault();
        setTool(TOOL_KEYS[k]);
      } else if (e.key === '[') setWidth((w) => Math.max(1, w - (w > 10 ? 2 : 1)));
      else if (e.key === ']') setWidth((w) => Math.min(40, w + (w >= 10 ? 2 : 1)));
      else if (e.key === 'PageUp') void go(-1);
      else if (e.key === 'PageDown') void go(1);
      else if (e.key === 'Delete' && e.shiftKey) clearDrawing();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    const onPaste = (e: ClipboardEvent) => {
      if (blockedRef.current || isTyping(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (!files.length) return;
      e.preventDefault();
      void importFiles(files);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('paste', onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the shot was deleted elsewhere
  useEffect(() => {
    if (!shot) onClose();
  }, [shot, onClose]);
  if (!shot) return null;

  /* ---------------- render */

  const scene = shot.sceneId ? model.sceneById.get(shot.sceneId) : undefined;
  const bgName = hideImage ? undefined : shot.image;
  const bgUrl = assetUrl(bgName);
  const up = (patch: Partial<Shot>) => shotOps.update(shot.id, patch);
  const sceneOptions: Option[] = [...model.scenes.map((s) => ({ value: s.id, label: sceneLabel(s) })), { value: UNASSIGNED, label: 'Unassigned' }];
  const charOptions: Option[] = characters.map((c) => ({ value: c.id, label: c.name, color: c.color }));
  const strokeTool = STROKE_TOOLS.includes(tool);
  const cursorSize = Math.max(4, (tool === 'eraser' ? width * 2.5 : tool === 'highlighter' ? width * 3.2 : width) * scale);
  const canUndo = opsRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;

  return (
    <Modal
      open
      size="full"
      onClose={() => void requestClose()}
      dismissable={false}
      title={
        <span className="row" style={{ gap: 8 }}>
          {shotTitle(shot, scene)}
          {scene && <span className="muted small" style={{ fontWeight: 500 }}>{scene.heading}</span>}
        </span>
      }
      headerExtra={
        <div className="row" style={{ gap: 4 }}>
          <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={index <= 0 || saving} onClick={() => void go(-1)} title="Previous frame (Alt+←)">
            Prev
          </Button>
          <span className="muted small" style={{ minWidth: 54, textAlign: 'center' }}>
            {index >= 0 ? `${index + 1} / ${order.length}` : ''}
          </span>
          <Button size="sm" variant="ghost" iconRight={ChevronRight} disabled={index < 0 || index >= order.length - 1 || saving} onClick={() => void go(1)} title="Next frame (Alt+→)">
            Next
          </Button>
        </div>
      }
      bodyStyle={{ padding: 0, display: 'flex', overflow: 'hidden' }}
      footer={
        <>
          <Button icon={Layers} onClick={() => void flatten()} disabled={saving} title="Merge the sketch into the frame image">
            Flatten into image
          </Button>
          <span className="muted tiny sb-ed-hint">Shift = straight lines / squares · [ ] brush size · Ctrl+Z undo · Ctrl+S save</span>
          <div className="spacer" />
          {saving ? (
            <span className="muted small row" style={{ gap: 6 }}>
              <Loader2 size={14} className="spin" /> Saving…
            </span>
          ) : dirty ? (
            <span className="small" style={{ color: 'var(--warning)' }}>
              Unsaved sketch
            </span>
          ) : null}
          <Button onClick={() => void requestClose()}>Close</Button>
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            Save
          </Button>
          <Button variant="primary" onClick={() => void saveAndClose()} disabled={saving}>
            {dirty ? 'Save & close' : 'Done'}
          </Button>
        </>
      }
    >
      <div className="sb-editor" data-own-undo>
        <div className="sb-ed-main">
          <div className="sb-ed-toolbar">
            <div className="sb-ed-group">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" className={['sb-ed-tool', tool === t.id && 'on'].filter(Boolean).join(' ')} title={`${t.label} (${t.key})`} onClick={() => setTool(t.id)}>
                    <Icon />
                  </button>
                );
              })}
            </div>
            <div className="sb-ed-group">
              {SKETCH_COLORS.map((c) => (
                <button key={c} type="button" className={['sb-ed-swatch', color.toLowerCase() === c && 'on'].filter(Boolean).join(' ')} style={{ background: c }} title={c} onClick={() => setColor(c)} />
              ))}
              <label className="sb-ed-swatch custom" title="Custom colour">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
            </div>
            <div className="sb-ed-group sb-ed-width" title="Stroke width ( [ and ] )">
              <span className="sb-ed-dot" style={{ width: Math.min(22, Math.max(3, width * 0.7)), height: Math.min(22, Math.max(3, width * 0.7)), background: color }} />
              <input type="range" min={1} max={40} value={width} onChange={(e) => setWidth(Number(e.target.value))} aria-label="Stroke width" />
              <span className="muted tiny" style={{ width: 18 }}>{width}</span>
            </div>
            {SHAPE_TOOLS.includes(tool) && (
              <div className="sb-ed-group">
                <button type="button" className={['sb-ed-tool wide', dashed && 'on'].filter(Boolean).join(' ')} onClick={() => setDashed(!dashed)} title="Dashed lines (movement paths)">
                  <SquareDashed /> Dashed
                </button>
              </div>
            )}
            <div className="sb-ed-group">
              <button type="button" className="sb-ed-tool" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
                <Undo2 />
              </button>
              <button type="button" className="sb-ed-tool" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">
                <Redo2 />
              </button>
              <button type="button" className="sb-ed-tool" onClick={clearDrawing} title="Clear drawing (Shift+Delete)">
                <Trash2 />
              </button>
            </div>
            <div className="spacer" />
            <div className="sb-ed-group">
              <button type="button" className={['sb-ed-tool', thirds && 'on'].filter(Boolean).join(' ')} onClick={() => setThirds(!thirds)} title="Rule-of-thirds guides">
                <Grid3x3 />
              </button>
              <button
                type="button"
                className={['sb-ed-tool wide', (hideImage || !shot.image) && 'on'].filter(Boolean).join(' ')}
                onClick={() => shot.image && setHideImage(!hideImage)}
                disabled={!shot.image}
                title={shot.image ? (hideImage ? 'Show the frame image again' : 'Draw on a blank white frame (removes the image when saved)') : 'This frame has no image — you are drawing on a blank frame'}
              >
                <Square /> {hideImage ? 'Show image' : 'Blank frame'}
              </button>
              <button type="button" className="sb-ed-tool wide" onClick={() => void replaceImage()} title="Choose a new frame image (paste or drop also works)">
                <ImagePlus /> {shot.image ? 'Replace image' : 'Add image'}
              </button>
            </div>
          </div>
          <div
            className="sb-ed-stage"
            ref={stageRef}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              void importFiles(Array.from(e.dataTransfer.files));
            }}
          >
            {box.w > 0 && (
              <div ref={frameRef} className="sb-ed-frame" style={{ width: box.w, height: box.h, background: bgUrl ? '#000' : '#fff' }}>
                {bgUrl && <img className="sb-ed-bg" src={bgUrl} alt="" draggable={false} />}
                <canvas
                  ref={(el) => {
                    canvasRef.current = el;
                    if (el) paint();
                  }}
                  width={CW}
                  height={CH}
                  className={`sb-ed-canvas tool-${tool}`}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerEnter={(e) => {
                    moveCursor(e);
                    if (cursorRef.current) cursorRef.current.style.opacity = '1';
                  }}
                  onPointerLeave={() => {
                    if (cursorRef.current) cursorRef.current.style.opacity = '0';
                  }}
                />
                {thirds && <div className="sb-ed-thirds" />}
                {strokeTool && (
                  <div ref={cursorRef} className="sb-ed-cursor" style={{ opacity: 0 }}>
                    <span style={{ width: cursorSize, height: cursorSize, marginLeft: -cursorSize / 2, marginTop: -cursorSize / 2 }} />
                  </div>
                )}
                {textDraft && (
                  <textarea
                    ref={textRef}
                    className="sb-ed-text"
                    style={{ left: textDraft.x, top: textDraft.y, fontSize: textSize(width) * scale, color }}
                    value={textDraft.value}
                    rows={Math.max(1, textDraft.value.split('\n').length)}
                    placeholder="Label…"
                    onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        commitText();
                      }
                    }}
                    onBlur={() => commitText()}
                  />
                )}
                {baseLoading && (
                  <div className="sb-ed-loading">
                    <Loader2 className="spin" /> Loading sketch…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <aside className="sb-ed-side">
          <div className="sb-ed-fields">
            <div className="sb-ed-row2">
              <Field label="Shot #">
                <Input value={shot.number} onChange={(v) => up({ number: v })} />
              </Field>
              <Field label="Duration (s)">
                <NumberInput value={shot.duration} onChange={(v) => up({ duration: v != null && v > 0 ? v : undefined })} placeholder={String(DEFAULT_FRAME_SECONDS)} />
              </Field>
            </div>
            <Field label="Scene">
              <Select
                value={groupKeyOf(shot, model.sceneById)}
                onChange={(v) => moveShotsToScene([shot.id], v, model)}
                options={sceneOptions}
              />
            </Field>
            <div className="sb-ed-row2">
              <Field label="Size">
                <Select value={shot.shotSize ?? ''} onChange={(v) => up({ shotSize: v || undefined })} options={SHOT_SIZES} placeholder="—" />
              </Field>
              <Field label="Angle">
                <Combo value={shot.angle ?? ''} onChange={(v) => up({ angle: v || undefined })} suggestions={SHOT_ANGLES.map((o) => o.value)} placeholder="—" />
              </Field>
            </div>
            <div className="sb-ed-row2">
              <Field label="Movement">
                <Combo value={shot.movement ?? ''} onChange={(v) => up({ movement: v || undefined })} suggestions={SHOT_MOVEMENTS.map((o) => o.value)} placeholder="—" />
              </Field>
              <Field label="Equipment">
                <Combo value={shot.equipment ?? ''} onChange={(v) => up({ equipment: v || undefined })} suggestions={SHOT_EQUIPMENT.map((o) => o.value)} placeholder="—" />
              </Field>
            </div>
            <div className="sb-ed-row2">
              <Field label="Lens">
                <Combo value={shot.lens ?? ''} onChange={(v) => up({ lens: v || undefined })} suggestions={LENSES.map((o) => o.value)} placeholder="—" />
              </Field>
              <Field label="Camera">
                <Select value={shot.camera ?? ''} onChange={(v) => up({ camera: v || undefined })} options={CAMERAS.map((c) => ({ value: c, label: `Camera ${c}` }))} placeholder="—" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={shot.description} onChange={(v) => up({ description: v })} minRows={3} placeholder="What happens in this frame" />
            </Field>
            <Field label="Audio / dialogue">
              <Textarea value={shot.audio} onChange={(v) => up({ audio: v || undefined })} minRows={2} placeholder="Dialogue, VO, music or SFX" />
            </Field>
            <Field label="Cast in shot">
              <MultiSelect value={shot.characterIds ?? []} onChange={(v) => up({ characterIds: v })} options={charOptions} placeholder="+ Add character" />
            </Field>
            <div className="sb-ed-row2">
              <Field label="Status">
                <Select value={shot.status} onChange={(v) => up({ status: v as ShotStatus })} options={SHOT_STATUSES} />
              </Field>
              <Field label="VFX">
                <label className="checkbox" style={{ height: 30 }}>
                  <input type="checkbox" checked={!!shot.vfx} onChange={(e) => up({ vfx: e.target.checked || undefined })} />
                  <span>VFX shot</span>
                </label>
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={shot.notes} onChange={(v) => up({ notes: v || undefined })} minRows={2} placeholder="Notes for the crew" />
            </Field>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
