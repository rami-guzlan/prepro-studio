/* Storyboard — visual view of project.shots: frames grouped by scene, sketching,
   drag & drop ordering, animatic playback and exports. */
import './storyboard.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowRightLeft,
  Brush,
  Copy,
  Eraser,
  FileArchive,
  FileText,
  ImageOff,
  ImagePlus,
  Images,
  ListPlus,
  ListVideo,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Shot } from '@/types';
import { getProject, useFormatters, useProject } from '@/store/project';
import { navigate, readLS, useApp, writeLS } from '@/store/app';
import { sceneLabel, useScriptModel, type SceneInfo } from '@/derived/script';
import { backend, importImageFile, pickImages } from '@/backend';
import { isImageFile } from '@/lib/images';
import { aspectToNumber, type Option } from '@/lib/constants';
import { plural } from '@/lib/text';
import {
  Button,
  confirmDialog,
  EmptyState,
  ExportMenu,
  Field,
  isModalOpen,
  Menu,
  Modal,
  ModuleHeader,
  Select,
  Tabs,
  toast,
  Toolbar,
  type MenuItem,
} from '@/ui';
import { pickScene, SceneTag, ScenePickerHost } from '../shots/components';
import {
  addShots,
  duplicateShot,
  groupKeyOf,
  groupShots,
  isOmitted,
  moveShot,
  moveShotsToScene,
  offerRenumber,
  shotOps,
  shotSeconds,
  UNASSIGNED,
  type ShotGroup,
} from '../shots/shotData';
import { FrameCard, FrameCardGhost, type CardApi, type CardShow } from './FrameCard';
import { FrameEditor } from './FrameEditor';
import { AnimaticPlayer, type AnimaticItem } from './Animatic';
import { exportFramesForMiro } from './exportFrames';

type CardSize = 'S' | 'M' | 'L';
const LS_SIZE = 'prepro.storyboard.size';
const LS_SHOW = 'prepro.storyboard.show';
const LS_EMPTY = 'prepro.storyboard.showEmpty';

const SIZE_BASE: Record<CardSize, number> = { S: 190, M: 290, L: 460 };

function cardWidth(size: CardSize, aspect: number): number {
  const base = SIZE_BASE[size];
  if (aspect >= 1.3) return base;
  return Math.round(base * Math.max(0.5, Math.min(1, Math.sqrt(aspect / 1.78))));
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

const groupId = (key: string) => `group:${key}`;
const isGroupId = (id: string) => id.startsWith('group:');

interface DragState {
  id: string;
  groups: Record<string, string[]>;
  origKey: string;
  origNext: string | null;
  width: number;
}

function findKey(id: string, groups: Record<string, string[]>): string | undefined {
  if (isGroupId(id)) return id.slice(6);
  return Object.keys(groups).find((k) => groups[k].includes(id));
}

/* ------------------------------------------------------------------ sortable pieces */

function SortableFrame(props: { shot: Shot; sceneNumber?: string; api: CardApi; show: CardShow; selected: boolean; flash: boolean }) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: props.shot.id });
  return (
    <FrameCard
      {...props}
      nodeRef={setNodeRef}
      activatorRef={setActivatorNodeRef}
      listeners={listeners}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    />
  );
}

function SceneSection({
  group,
  children,
  header,
  fileOver,
  onFileOver,
  onFiles,
}: {
  group: ShotGroup;
  children: ReactNode;
  header: ReactNode;
  fileOver: boolean;
  onFileOver: (key: string | null) => void;
  onFiles: (key: string, files: File[]) => void;
}) {
  const { setNodeRef } = useDroppable({ id: groupId(group.key) });
  return (
    <section
      ref={setNodeRef}
      className={['sb-section', fileOver && 'file-over'].filter(Boolean).join(' ')}
      data-scene-section={group.key}
      onDragOver={(e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        onFileOver(group.key);
      }}
      onDragLeave={(e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onFileOver(null);
      }}
      onDrop={(e: DragEvent) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        onFileOver(null);
        onFiles(group.key, Array.from(e.dataTransfer.files));
      }}
    >
      {header}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ import dialog */

function ImportDialog({ initialKey, scenes, onClose, onImport }: { initialKey: string; scenes: SceneInfo[]; onClose: () => void; onImport: (key: string, names: string[]) => void }) {
  const [key, setKey] = useState(initialKey);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const options: Option[] = [...scenes.map((s) => ({ value: s.id, label: sceneLabel(s) })), { value: UNASSIGNED, label: scenes.length ? 'Unassigned (no scene)' : 'No scene' }];
  const run = async (get: () => Promise<string[]>) => {
    setBusy(true);
    try {
      const names = await get();
      if (names.length) onImport(key, names);
    } catch (e) {
      toast(`Could not import images: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const fromFiles = (files: File[]) =>
    run(async () => {
      const imgs = files.filter(isImageFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (!imgs.length) {
        toast('No images in that drop', 'error');
        return [];
      }
      const out: string[] = [];
      for (const f of imgs) out.push(await importImageFile(f));
      return out;
    });
  return (
    <Modal
      open
      size="sm"
      title="Import images as frames"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={ImagePlus} disabled={busy} onClick={() => run(() => pickImages(true))}>
            {busy ? 'Importing…' : 'Choose images…'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <Field label="Add the new frames to">
          <Select value={key} onChange={setKey} options={options} />
        </Field>
        <div
          className={['sb-import-drop', over && 'over'].filter(Boolean).join(' ')}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void fromFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => !busy && run(() => pickImages(true))}
        >
          <Upload />
          <div>
            <strong>Drop images here</strong> or click to choose
          </div>
          <div className="muted small">Each image becomes one frame, in file-name order. Sketches, photos, screenshots or AI frames all work.</div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ screen */

export default function StoryboardModule() {
  const shots = useProject((p) => p.shots);
  const aspectRatio = useProject((p) => p.meta.aspectRatio);
  const projectTitle = useProject((p) => p.meta.title);
  const model = useScriptModel();
  const fmt = useFormatters();
  const aspect = aspectToNumber(aspectRatio);

  const [sceneFilter, setSceneFilter] = useState('all');
  const [size, setSize] = useState<CardSize>(() => readLS<CardSize>(LS_SIZE, 'M'));
  const [show, setShow] = useState<CardShow>(() => ({ description: true, specs: true, audio: true, ...readLS<Partial<CardShow>>(LS_SHOW, {}) }));
  const [showEmpty, setShowEmpty] = useState<boolean>(() => readLS(LS_EMPTY, true));
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ id: string; order: string[] } | null>(null);
  const [animatic, setAnimatic] = useState<{ items: AnimaticItem[]; start: number; title?: string } | null>(null);
  const [importKey, setImportKey] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const anchorRef = useRef<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const lastDragEnd = useRef(0);

  const effSceneFilter = sceneFilter === 'all' || sceneFilter === UNASSIGNED || model.sceneById.has(sceneFilter) ? sceneFilter : 'all';
  const cardW = cardWidth(size, aspect);

  const baseGroups = useMemo(
    () => groupShots(shots, model, { includeEmptyScenes: showEmpty || effSceneFilter !== 'all', onlyKey: effSceneFilter === 'all' ? undefined : effSceneFilter }),
    [shots, model, showEmpty, effSceneFilter],
  );
  const shotById = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);

  // while dragging, render from the drag state so cards can hop between scenes
  const groups: ShotGroup[] = useMemo(() => {
    if (!drag) return baseGroups;
    return baseGroups.map((g) => ({ ...g, shots: (drag.groups[g.key] ?? []).map((id) => shotById.get(id)).filter((s): s is Shot => !!s) }));
  }, [baseGroups, drag, shotById]);

  const visibleOrder = useMemo(() => baseGroups.flatMap((g) => g.shots.map((s) => s.id)), [baseGroups]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // keep selection valid
  useEffect(() => {
    setSelected((sel) => {
      const ok = sel.filter((id) => shotById.has(id));
      return ok.length === sel.length ? sel : ok;
    });
  }, [shotById]);

  const totals = useMemo(() => {
    let frames = 0;
    let boarded = 0;
    let seconds = 0;
    const scenes = new Set<string>();
    for (const s of shots) {
      if (isOmitted(s)) continue;
      frames++;
      if (s.image || s.drawing) boarded++;
      seconds += shotSeconds(s);
      if (s.sceneId && model.sceneById.has(s.sceneId)) scenes.add(s.sceneId);
    }
    return { frames, boarded, seconds, scenes: scenes.size };
  }, [shots, model]);

  /* ---------------- helpers */

  const scrollToFrame = (id: string, block: ScrollLogicalPosition = 'nearest') =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.querySelector(`[data-frame="${CSS_escape(id)}"]`)?.scrollIntoView({ block, behavior: 'smooth' })),
    );

  const flash = (id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1800);
  };

  const defaultKey = (): string => {
    if (effSceneFilter !== 'all') return effSceneFilter;
    const withShots = baseGroups.filter((g) => g.shots.length);
    if (withShots.length) return withShots[withShots.length - 1].key;
    return model.scenes[0]?.id ?? UNASSIGNED;
  };

  const revealNew = (ids: string[]) => {
    if (!ids.length) return;
    setSelected(ids);
    anchorRef.current = ids[0];
    flash(ids[0]);
    scrollToFrame(ids[0], 'center');
  };

  const addFrame = (key?: string) => {
    let target = key;
    let after: string | null = null;
    if (!target) {
      const single = selected.length === 1 ? shotById.get(selected[0]) : undefined;
      if (single) {
        target = groupKeyOf(single, model.sceneById);
        after = single.id;
      } else target = defaultKey();
    }
    if (effSceneFilter !== 'all' && target !== effSceneFilter) setSceneFilter('all');
    revealNew(addShots(target, [{}], model, after));
  };

  const addImages = (key: string, names: string[], afterId?: string | null) => {
    if (!names.length) return [];
    if (effSceneFilter !== 'all' && key !== effSceneFilter) setSceneFilter('all');
    const ids = addShots(key, names.map((image) => ({ image })), model, afterId ?? null);
    revealNew(ids);
    const sc = model.sceneById.get(key);
    toast(`Added ${plural(ids.length, 'frame')}${sc ? ` to scene ${sc.number}` : ''}`);
    return ids;
  };

  const importFilesTo = async (key: string, files: File[], afterId?: string | null) => {
    const imgs = files.filter(isImageFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!imgs.length) {
      toast('Only image files can become frames', 'error');
      return;
    }
    try {
      const names: string[] = [];
      for (const f of imgs) names.push(await importImageFile(f));
      addImages(key, names, afterId);
    } catch (e) {
      toast(`Could not import images: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const deleteShots = async (ids: string[]) => {
    if (!ids.length) return;
    const one = ids.length === 1 ? shotById.get(ids[0]) : undefined;
    const ok = await confirmDialog({
      title: one ? `Delete frame ${one.number}?` : `Delete ${ids.length} frames?`,
      message: `${one ? 'This shot' : 'These shots'} will be removed from the storyboard and the shot list. You can undo with Ctrl+Z.`,
      confirmLabel: one ? 'Delete frame' : `Delete ${ids.length} frames`,
      danger: true,
    });
    if (!ok) return;
    shotOps.removeMany(ids);
    setSelected([]);
  };

  const moveSelected = async (ids: string[]) => {
    if (!ids.length) return;
    const first = shotById.get(ids[0]);
    const key = await pickScene({
      title: ids.length === 1 ? `Move frame ${first?.number ?? ''}` : `Move ${ids.length} frames`,
      message: 'Frames are added to the end of the chosen scene.',
      scenes: model.scenes,
      current: first ? groupKeyOf(first, model.sceneById) : undefined,
    });
    if (key == null) return;
    const ordered = visibleOrder.filter((id) => ids.includes(id));
    moveShotsToScene(ordered.length ? ordered : ids, key, model);
    if (effSceneFilter !== 'all' && key !== effSceneFilter) setSceneFilter('all');
    const sc = model.sceneById.get(key);
    toast(`Moved ${plural(ids.length, 'frame')} to ${sc ? `scene ${sc.number}` : 'Unassigned'}`);
    scrollToFrame(ids[0], 'center');
  };

  const openEditor = (id: string) => setEditor({ id, order: visibleOrder.filter((x) => shotById.has(x)) });

  const playAnimatic = (onlyKey?: string, fromId?: string) => {
    const src = onlyKey ? baseGroups.filter((g) => g.key === onlyKey) : baseGroups;
    const items: AnimaticItem[] = [];
    for (const g of src) for (const s of g.shots) if (!isOmitted(s)) items.push({ shot: s, scene: g.scene });
    if (!items.length) {
      toast('Add some frames first — there is nothing to play yet', 'info');
      return;
    }
    const startId = fromId ?? (selected.length ? visibleOrder.find((id) => selectedSet.has(id)) : undefined);
    const start = Math.max(0, items.findIndex((it) => it.shot.id === startId));
    const sc = onlyKey ? model.sceneById.get(onlyKey) : undefined;
    setAnimatic({ items, start, title: sc ? sceneLabel(sc) : effSceneFilter !== 'all' ? sceneLabel(model.sceneById.get(effSceneFilter)) : undefined });
  };

  const exportMiro = async () => {
    if (exporting) return;
    const items: { shot: Shot; scene?: SceneInfo }[] = [];
    for (const g of baseGroups) for (const s of g.shots) if (!isOmitted(s)) items.push({ shot: s, scene: g.scene });
    if (!items.length) {
      toast('There are no frames to export yet', 'info');
      return;
    }
    setExporting(`Rendering 0 / ${items.length}…`);
    try {
      const res = await exportFramesForMiro(items, aspect, projectTitle || 'Storyboard', (d, t) => setExporting(`Rendering ${d} / ${t}…`));
      if (res || (res === null && backend.kind !== 'electron')) toast(`Exported ${plural(items.length, 'frame')} — drag the PNGs onto your Miro board`);
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  /* ---------------- card API (stable object, latest handlers via ref) */

  const handlers = {
    select: (e: MouseEvent, id: string) => {
      const t = e.target as HTMLElement;
      const inField = !!t.closest('input,textarea,select,button,label');
      if (e.button === 2) {
        if (!selectedSet.has(id)) setSelected([id]);
        return;
      }
      if (e.shiftKey && anchorRef.current && !inField) {
        e.preventDefault();
        const a = visibleOrder.indexOf(anchorRef.current);
        const b = visibleOrder.indexOf(id);
        if (a >= 0 && b >= 0) {
          setSelected(visibleOrder.slice(Math.min(a, b), Math.max(a, b) + 1));
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && !inField) {
        setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
        anchorRef.current = id;
        return;
      }
      if (!(selected.length === 1 && selected[0] === id)) setSelected([id]);
      anchorRef.current = id;
    },
    edit: (id: string) => openEditor(id),
    pickImage: async (id: string) => {
      try {
        const [name] = await pickImages(false);
        if (name) shotOps.update(id, { image: name }, false);
      } catch (e) {
        toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
      }
    },
    dropFiles: async (id: string, files: File[]) => {
      const imgs = files.filter(isImageFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const shot = shotById.get(id);
      if (!imgs.length || !shot) {
        toast('Only image files can be dropped on a frame', 'error');
        return;
      }
      try {
        const first = await importImageFile(imgs[0]);
        shotOps.update(id, { image: first }, false);
        if (imgs.length > 1) {
          const rest: string[] = [];
          for (const f of imgs.slice(1)) rest.push(await importImageFile(f));
          addImages(groupKeyOf(shot, model.sceneById), rest, id);
        } else toast(`Frame ${shot.number} updated`);
      } catch (e) {
        toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
      }
    },
    menu: (id: string): MenuItem[] => {
      const shot = shotById.get(id);
      if (!shot) return [];
      if (selectedSet.has(id) && selected.length > 1) {
        const ids = visibleOrder.filter((x) => selectedSet.has(x));
        return [
          { header: `${ids.length} frames selected` },
          { label: 'Play from here', icon: Play, onClick: () => playAnimatic(undefined, ids[0]) },
          { label: `Move ${ids.length} frames to scene…`, icon: ArrowRightLeft, onClick: () => void moveSelected(ids) },
          { separator: true },
          { label: `Delete ${ids.length} frames`, icon: Trash2, danger: true, onClick: () => void deleteShots(ids) },
        ];
      }
      const key = groupKeyOf(shot, model.sceneById);
      return [
        { label: 'Edit & sketch…', icon: Pencil, shortcut: 'Enter', onClick: () => openEditor(id) },
        { label: shot.image ? 'Replace image…' : 'Add image…', icon: ImagePlus, onClick: () => void handlers.pickImage(id) },
        ...(shot.image ? [{ label: 'Remove image', icon: ImageOff, onClick: () => shotOps.update(id, { image: undefined }, false) }] : []),
        ...(shot.drawing ? [{ label: 'Clear sketch layer', icon: Eraser, onClick: () => shotOps.update(id, { drawing: undefined }, false) }] : []),
        { separator: true },
        { label: 'Insert frame after', icon: ListPlus, onClick: () => revealNew(addShots(key, [{}], model, id)) },
        {
          label: 'Duplicate',
          icon: Copy,
          onClick: () => {
            const nid = duplicateShot(id, model);
            if (nid) revealNew([nid]);
          },
        },
        { label: 'Move to scene…', icon: ArrowRightLeft, onClick: () => void moveSelected([id]) },
        { label: 'Play from here', icon: Play, onClick: () => playAnimatic(undefined, id) },
        { label: 'Open in shot list', icon: ListVideo, onClick: () => navigate('shots', { shotId: id }) },
        { separator: true },
        { label: 'Delete frame', icon: Trash2, danger: true, shortcut: 'Del', onClick: () => void deleteShots([id]) },
      ];
    },
    paste: async (files: File[]) => {
      const single = selected.length === 1 ? shotById.get(selected[0]) : undefined;
      try {
        const names: string[] = [];
        for (const f of files) names.push(await importImageFile(f));
        if (!names.length) return;
        if (single && !single.image && !single.drawing) {
          shotOps.update(single.id, { image: names[0] }, false);
          toast(`Pasted into frame ${single.number}`);
          if (names.length > 1) addImages(groupKeyOf(single, model.sceneById), names.slice(1), single.id);
        } else if (single) addImages(groupKeyOf(single, model.sceneById), names, single.id);
        else addImages(defaultKey(), names);
      } catch (e) {
        toast(`Could not paste image: ${e instanceof Error ? e.message : e}`, 'error');
      }
    },
  };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const api = useMemo<CardApi>(
    () => ({
      aspect,
      select: (e, id) => handlersRef.current.select(e, id),
      edit: (id) => handlersRef.current.edit(id),
      pickImage: (id) => void handlersRef.current.pickImage(id),
      dropFiles: (id, files) => void handlersRef.current.dropFiles(id, files),
      menu: (id) => handlersRef.current.menu(id),
      wasDragging: () => !!dragRef.current || Date.now() - lastDragEnd.current < 300,
    }),
    [aspect],
  );

  /* ---------------- navigation from other modules */

  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  useEffect(() => {
    const shotId = params?.shotId as string | undefined;
    const sceneId = params?.sceneId as string | undefined;
    if (shotId && getProject().shots.some((s) => s.id === shotId)) {
      setSceneFilter('all');
      setSelected([shotId]);
      anchorRef.current = shotId;
      flash(shotId);
      scrollToFrame(shotId, 'center');
    } else if (sceneId) {
      setSceneFilter('all');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.querySelector(`[data-scene-section="${CSS_escape(sceneId)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  /* ---------------- keyboard & clipboard */

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isModalOpen() || isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length && !mod) {
      e.preventDefault();
      void deleteShots(visibleOrder.filter((id) => selectedSet.has(id)));
    } else if (e.key === 'Escape' && selected.length) {
      setSelected([]);
    } else if (e.key === 'Enter' && selected.length === 1 && !mod) {
      e.preventDefault();
      openEditor(selected[0]);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !mod && !e.altKey && visibleOrder.length) {
      const cur = selected.length ? visibleOrder.indexOf(anchorRef.current ?? selected[selected.length - 1]) : -1;
      const next = cur < 0 ? 0 : Math.max(0, Math.min(visibleOrder.length - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
      const id = visibleOrder[next];
      e.preventDefault();
      setSelected([id]);
      anchorRef.current = id;
      scrollToFrame(id);
    } else if (mod && e.key.toLowerCase() === 'a' && visibleOrder.length) {
      e.preventDefault();
      setSelected(visibleOrder);
    } else if (mod && e.key.toLowerCase() === 'd' && selected.length === 1) {
      e.preventDefault();
      const nid = duplicateShot(selected[0], model);
      if (nid) revealNew([nid]);
    } else if (e.key === ' ' && !mod && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
      e.preventDefault();
      playAnimatic();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    const onPaste = (e: ClipboardEvent) => {
      if (isModalOpen()) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (!files.length) return;
      if (isTyping(e.target) && (e.clipboardData?.getData('text/plain') ?? '').trim()) return;
      e.preventDefault();
      void handlersRef.current.paste(files);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  /* ---------------- drag & drop */

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const collision: CollisionDetection = useCallback((args) => {
    const within = pointerWithin(args);
    const hits = within.length ? within : rectIntersection(args);
    const item = hits.find((h) => !isGroupId(String(h.id)));
    if (item) return [item];
    const grp = hits.find((h) => isGroupId(String(h.id)));
    if (grp) {
      const ids = new Set(dragRef.current?.groups[String(grp.id).slice(6)] ?? []);
      const containers = args.droppableContainers.filter((c) => ids.has(String(c.id)));
      if (containers.length) {
        const c = closestCenter({ ...args, droppableContainers: containers });
        if (c.length) return [c[0]];
      }
      return [grp];
    }
    return [];
  }, []);

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    const map: Record<string, string[]> = {};
    for (const g of baseGroups) map[g.key] = g.shots.map((s) => s.id);
    const origKey = findKey(id, map);
    if (!origKey) return;
    const list = map[origKey];
    const st: DragState = { id, groups: map, origKey, origNext: list[list.indexOf(id) + 1] ?? null, width: active.rect.current.initial?.width ?? cardW };
    dragRef.current = st;
    setDrag(st);
    if (!selectedSet.has(id) || selected.length > 1) setSelected([id]);
    anchorRef.current = id;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    setDrag((prev) => {
      if (!prev) return prev;
      const from = findKey(aId, prev.groups);
      const to = findKey(oId, prev.groups);
      if (!from || !to || from === to) return prev;
      const fromList = prev.groups[from].filter((x) => x !== aId);
      const toList = [...prev.groups[to]];
      let idx = isGroupId(oId) ? toList.length : toList.indexOf(oId);
      if (idx < 0) idx = toList.length;
      const r = active.rect.current.translated;
      if (!isGroupId(oId) && r) {
        // insert after the hovered card when the dragged card's centre is past it
        // (below it when they are on different rows, to its right on the same row)
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const ocx = over.rect.left + over.rect.width / 2;
        const ocy = over.rect.top + over.rect.height / 2;
        const sameRow = Math.abs(cy - ocy) < over.rect.height / 2;
        if (sameRow ? cx > ocx : cy > ocy) idx++;
      }
      toList.splice(idx, 0, aId);
      const next = { ...prev, groups: { ...prev.groups, [from]: fromList, [to]: toList } };
      dragRef.current = next;
      return next;
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    lastDragEnd.current = Date.now();
    if (!d || !over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    const key = findKey(aId, d.groups);
    if (!key) return;
    let list = d.groups[key];
    if (!isGroupId(oId) && findKey(oId, d.groups) === key) {
      const from = list.indexOf(aId);
      const to = list.indexOf(oId);
      if (from >= 0 && to >= 0 && from !== to) list = arrayMove(list, from, to);
    }
    const next = list[list.indexOf(aId) + 1] ?? null;
    if (key === d.origKey && next === d.origNext) return;
    const before = getProject().shots;
    moveShot(aId, key, next, model);
    if (getProject().shots !== before) offerRenumber(key, model);
  };

  const onDragCancel = () => {
    dragRef.current = null;
    setDrag(null);
    lastDragEnd.current = Date.now();
  };

  /* ---------------- render */

  const toggleShow = (k: keyof CardShow) => {
    const next = { ...show, [k]: !show[k] };
    setShow(next);
    writeLS(LS_SHOW, next);
  };

  const sceneOptions: Option[] = useMemo(
    () => [{ value: 'all', label: 'All scenes' }, ...model.scenes.map((s) => ({ value: s.id, label: sceneLabel(s) })), { value: UNASSIGNED, label: 'Unassigned frames' }],
    [model.scenes],
  );

  const subtitle = [
    plural(totals.frames, 'frame'),
    totals.frames ? `${totals.boarded} boarded` : '',
    model.scenes.length ? `${totals.scenes}/${model.scenes.length} scenes` : '',
    totals.frames ? `animatic ${fmt.seconds(totals.seconds)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const activeShot = drag ? shotById.get(drag.id) : undefined;
  const nothing = shots.length === 0 && model.scenes.length === 0;
  const selectedOrdered = visibleOrder.filter((id) => selectedSet.has(id));

  const sectionHeader = (g: ShotGroup) => {
    const sc = g.scene;
    const live = g.shots.filter((s) => !isOmitted(s));
    const secs = live.reduce((n, s) => n + shotSeconds(s), 0);
    const syn = sc ? sc.synopsis || sc.firstAction : '';
    return (
      <div className="sb-section-head">
        <SceneTag scene={sc} style={{ height: 26, minWidth: 30, fontSize: 13 }} />
        <div className="sb-section-titles">
          <div className="sb-section-heading">{sc ? sc.heading || 'Untitled scene' : model.scenes.length ? 'Unassigned frames' : 'Frames'}</div>
          {syn && <div className="sb-section-syn">{syn}</div>}
        </div>
        <span className="sb-section-meta">
          {plural(g.shots.length, 'frame')}
          {live.length > 0 && ` · ${fmt.seconds(secs)}`}
        </span>
        {live.length > 0 && (
          <Button size="sm" variant="ghost" icon={Play} onClick={() => playAnimatic(g.key)} title="Play this scene's animatic">
            Play
          </Button>
        )}
        <Button size="sm" icon={Plus} onClick={() => addFrame(g.key)}>
          Add frame
        </Button>
        <Menu
          align="end"
          trigger={
            <button type="button" className="btn ghost sm icon" aria-label="Scene actions">
              <MoreHorizontal />
            </button>
          }
          items={[
            { label: 'Import images into this scene…', icon: ImagePlus, onClick: () => setImportKey(g.key) },
            { label: 'Open in shot list', icon: ListVideo, onClick: () => navigate('shots', sc ? { sceneId: sc.id } : {}) },
            ...(sc ? [{ label: 'Open in script', icon: FileText, onClick: () => navigate('script', { sceneId: sc.id }) }] : []),
            ...(g.shots.length ? [{ label: 'Select all frames in scene', icon: Images, onClick: () => setSelected(g.shots.map((s) => s.id)) }] : []),
          ]}
        />
      </div>
    );
  };

  return (
    <div className="module sb-module">
      <ModuleHeader
        title="Storyboard"
        subtitle={subtitle}
        icon={Images}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'storyboard', label: 'Storyboard (PDF)', options: effSceneFilter !== 'all' ? { sceneId: effSceneFilter } : undefined },
                { id: 'storyboard-blank', label: 'Blank storyboard template' },
                { id: 'shot-list', label: 'Shot list' },
              ]}
              extra={[
                { header: 'Images' },
                { label: exporting ?? 'Export frames for Miro (.zip of PNGs)', icon: FileArchive, disabled: !!exporting, onClick: () => void exportMiro() },
              ]}
            />
            <Button icon={Play} onClick={() => playAnimatic()} title="Play animatic (Space)">
              Play animatic
            </Button>
            <Button icon={ImagePlus} onClick={() => setImportKey(selected.length === 1 && shotById.get(selected[0]) ? groupKeyOf(shotById.get(selected[0])!, model.sceneById) : defaultKey())}>
              Import images
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => addFrame()}>
              Add frame
            </Button>
          </>
        }
      />
      <Toolbar>
        <Select value={effSceneFilter} onChange={setSceneFilter} options={sceneOptions} style={{ width: 240 }} aria-label="Scene filter" />
        <Tabs<CardSize>
          tabs={[
            { id: 'S', label: 'Small' },
            { id: 'M', label: 'Medium' },
            { id: 'L', label: 'Large' },
          ]}
          value={size}
          onChange={(v) => {
            setSize(v);
            writeLS(LS_SIZE, v);
          }}
        />
        <div className="sb-toggles">
          <Button size="sm" variant="ghost" active={show.description} onClick={() => toggleShow('description')} aria-pressed={show.description}>
            Description
          </Button>
          <Button size="sm" variant="ghost" active={show.specs} onClick={() => toggleShow('specs')} aria-pressed={show.specs}>
            Specs
          </Button>
          <Button size="sm" variant="ghost" active={show.audio} onClick={() => toggleShow('audio')} aria-pressed={show.audio}>
            Audio
          </Button>
          <Button
            size="sm"
            variant="ghost"
            active={showEmpty}
            aria-pressed={showEmpty}
            title="Show scenes that have no frames yet"
            onClick={() => {
              setShowEmpty(!showEmpty);
              writeLS(LS_EMPTY, !showEmpty);
            }}
          >
            Empty scenes
          </Button>
        </div>
        <div className="spacer" />
        {selected.length > 0 ? (
          <div className="sb-selbar">
            <span className="small strong">{plural(selected.length, 'frame')} selected</span>
            {selected.length === 1 && (
              <Button size="sm" icon={Brush} onClick={() => openEditor(selected[0])}>
                Edit
              </Button>
            )}
            <Button size="sm" icon={ArrowRightLeft} onClick={() => void moveSelected(selectedOrdered)}>
              Move…
            </Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => void deleteShots(selectedOrdered)}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" className="icon" aria-label="Clear selection" title="Clear selection (Esc)" onClick={() => setSelected([])}>
              <X />
            </Button>
          </div>
        ) : (
          <span className="muted tiny sb-hint">Click to select · Ctrl/Shift-click for more · drag to reorder · paste images with Ctrl+V</span>
        )}
      </Toolbar>
      <div
        className="module-body sb-body-wrap"
        onMouseDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('.sb-card, button, input, textarea, select, a, label')) setSelected([]);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          void importFilesTo(defaultKey(), Array.from(e.dataTransfer.files));
        }}
      >
        {nothing ? (
          <EmptyState
            icon={Images}
            title="Start your storyboard"
            description="Add frames and sketch them, or import images (drop them anywhere here). Each frame is a shot — specs, timing and audio are shared with the Shot List."
            action={
              <div className="row">
                <Button variant="primary" icon={Plus} onClick={() => addFrame()}>
                  Add frame
                </Button>
                <Button icon={ImagePlus} onClick={() => setImportKey(UNASSIGNED)}>
                  Import images
                </Button>
              </div>
            }
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Images}
            title="No frames here"
            description="This filter has no frames yet."
            action={
              <div className="row">
                <Button variant="primary" icon={Plus} onClick={() => addFrame()}>
                  Add frame
                </Button>
                <Button onClick={() => setSceneFilter('all')}>Show all scenes</Button>
              </div>
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collision}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div className="sb-sections">
              {groups.map((g) => (
                <SceneSection key={g.key} group={g} header={sectionHeader(g)} fileOver={fileOver === g.key} onFileOver={setFileOver} onFiles={(k, files) => void importFilesTo(k, files)}>
                  <SortableContext items={g.shots.map((s) => s.id)} strategy={rectSortingStrategy}>
                    <div className={`sb-grid sb-size-${size}`} style={{ gridTemplateColumns: `repeat(auto-fill, ${cardW}px)` }}>
                      {g.shots.map((s) => (
                        <SortableFrame key={s.id} shot={s} sceneNumber={g.scene?.number} api={api} show={show} selected={selectedSet.has(s.id)} flash={flashId === s.id} />
                      ))}
                      <button type="button" className="sb-add-tile" onClick={() => addFrame(g.key)} title="Add a frame to this scene (or drop images)">
                        <span className="sb-add-media" style={{ aspectRatio: String(aspect) }}>
                          <Plus />
                          <span>Add frame</span>
                          <small>or drop images</small>
                        </span>
                      </button>
                    </div>
                  </SortableContext>
                </SceneSection>
              ))}
            </div>
            <DragOverlay>{activeShot ? <FrameCardGhost shot={activeShot} aspect={aspect} width={drag?.width ?? cardW} /> : null}</DragOverlay>
          </DndContext>
        )}
      </div>

      {editor && <FrameEditor key={editor.id} shotId={editor.id} order={editor.order} aspect={aspect} onClose={() => setEditor(null)} />}
      {animatic && <AnimaticPlayer items={animatic.items} startIndex={animatic.start} aspect={aspect} title={animatic.title} onClose={() => setAnimatic(null)} />}
      {importKey != null && (
        <ImportDialog
          initialKey={importKey}
          scenes={model.scenes}
          onClose={() => setImportKey(null)}
          onImport={(key, names) => {
            setImportKey(null);
            addImages(key, names);
          }}
        />
      )}
      <ScenePickerHost />
    </div>
  );
}

function CSS_escape(s: string): string {
  return typeof window !== 'undefined' && window.CSS?.escape ? window.CSS.escape(s) : s.replace(/"/g, '');
}
