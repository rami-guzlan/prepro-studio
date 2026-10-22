/* Shot List — table view of project.shots grouped by scene, with inline editing. */
import './shots.css';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  Columns3,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Images,
  ListOrdered,
  ListPlus,
  ListVideo,
  MoreHorizontal,
  Plus,
  SearchX,
  Trash2,
} from 'lucide-react';
import type { Shot, ShotStatus } from '@/types';
import { useProject, useFormatters, getProject } from '@/store/project';
import { navigate, readLS, useApp, writeLS } from '@/store/app';
import { sceneLabel, useScriptModel } from '@/derived/script';
import { useCommand } from '@/lib/commands';
import { matchesQuery, plural } from '@/lib/text';
import { backend, importDroppedImages } from '@/backend';
import { isImageFile } from '@/lib/images';
import {
  aspectToNumber,
  FRAME_RATES,
  LENSES,
  SHOT_ANGLES,
  SHOT_EQUIPMENT,
  SHOT_MOVEMENTS,
  SHOT_SIZES,
  SHOT_STATUSES,
  SOUND_TYPES,
  type Option,
} from '@/lib/constants';
import {
  Button,
  Checkbox,
  confirmDialog,
  EmptyState,
  ExportMenu,
  Input,
  Menu,
  ModuleHeader,
  MultiSelect,
  NumberInput,
  SearchInput,
  Select,
  Switch,
  Textarea,
  toast,
  Toolbar,
  type MenuItem,
} from '@/ui';
import {
  addShots,
  CAMERAS,
  duplicateShot,
  exportShotsCsv,
  groupShots,
  isOmitted,
  moveShot,
  moveShotsToScene,
  offerRenumber,
  renumberShots,
  shotOps,
  UNASSIGNED,
  type NumberScheme,
  type ShotGroup,
} from './shotData';
import { CompactSelect, FrameThumb, pickScene, SceneTag, ScenePickerHost } from './components';

/* ------------------------------------------------------------------ columns */

type ColKey =
  | 'number'
  | 'thumb'
  | 'description'
  | 'size'
  | 'angle'
  | 'movement'
  | 'equipment'
  | 'lens'
  | 'camera'
  | 'fps'
  | 'sound'
  | 'cast'
  | 'setup'
  | 'shoot'
  | 'vfx'
  | 'diagram'
  | 'status'
  | 'notes';

interface ColDef {
  key: ColKey;
  label: string;
  width?: number;
  /** can be hidden from the Columns menu */
  optional?: boolean;
  num?: boolean;
  center?: boolean;
}

const COLS: ColDef[] = [
  { key: 'number', label: '#', width: 58 },
  { key: 'thumb', label: 'Frame', width: 96 },
  { key: 'description', label: 'Description' },
  { key: 'size', label: 'Size', width: 84, optional: true },
  { key: 'angle', label: 'Angle', width: 118, optional: true },
  { key: 'movement', label: 'Movement', width: 118, optional: true },
  { key: 'equipment', label: 'Equipment', width: 126, optional: true },
  { key: 'lens', label: 'Lens', width: 78, optional: true },
  { key: 'camera', label: 'Cam', width: 56, optional: true },
  { key: 'fps', label: 'FPS', width: 74, optional: true },
  { key: 'sound', label: 'Sound', width: 92, optional: true },
  { key: 'cast', label: 'Cast', width: 180, optional: true },
  { key: 'setup', label: 'Setup', width: 66, optional: true, num: true },
  { key: 'shoot', label: 'Shoot', width: 66, optional: true, num: true },
  { key: 'vfx', label: 'VFX', width: 46, optional: true, center: true },
  { key: 'diagram', label: 'Lighting', width: 140, optional: true },
  { key: 'status', label: 'Status', width: 108, optional: true },
  { key: 'notes', label: 'Notes', width: 220, optional: true },
];

const COL_TITLES: Partial<Record<ColKey, string>> = {
  setup: 'Estimated setup minutes',
  shoot: 'Estimated shooting minutes',
  camera: 'Camera unit',
  fps: 'Frame rate (blank = project rate)',
  diagram: 'Lighting diagram',
};

const LS_HIDDEN = 'prepro.shots.hiddenCols';
const LS_THUMBS = 'prepro.shots.thumbs';
const LS_EMPTY = 'prepro.shots.showEmptyScenes';

const STATUS_FILTERS: Option[] = [{ value: 'all', label: 'All statuses' }, ...SHOT_STATUSES];
const CAMERA_OPTIONS: Option[] = CAMERAS.map((c) => ({ value: c, label: `Camera ${c}` }));

const DL = {
  angle: 'shots-dl-angle',
  movement: 'shots-dl-movement',
  equipment: 'shots-dl-equipment',
  lens: 'shots-dl-lens',
  fps: 'shots-dl-fps',
};

function searchText(s: Shot, charName: Map<string, string>): string {
  return [
    s.number,
    s.title,
    s.description,
    s.notes,
    s.audio,
    s.shotSize,
    s.angle,
    s.movement,
    s.equipment,
    s.lens,
    s.camera ? `cam ${s.camera}` : '',
    ...(s.characterIds ?? []).map((id) => charName.get(id) ?? ''),
  ]
    .filter(Boolean)
    .join(' ');
}

/* ------------------------------------------------------------------ row */

type DropPos = 'before' | 'after';

interface RowCtx {
  cols: ColDef[];
  aspect: number;
  charOptions: Option[];
  diagramOptions: Option[];
  fps: string;
  onHandleDragStart: (e: DragEvent<HTMLElement>, id: string) => void;
  onDragEnd: () => void;
  onRowDragOver: (e: DragEvent<HTMLElement>, id: string) => void;
  onRowDrop: (e: DragEvent<HTMLElement>, id: string) => void;
  rowMenu: (shot: Shot) => MenuItem[];
  dropImage: (shot: Shot, files: File[]) => void;
}

const ShotRow = memo(function ShotRow({
  shot,
  ctx,
  drop,
  dragging,
  flash,
  autoFocus,
}: {
  shot: Shot;
  ctx: RowCtx;
  drop: DropPos | null;
  dragging: boolean;
  flash: boolean;
  autoFocus: boolean;
}) {
  const up = (patch: Partial<Shot>) => shotOps.update(shot.id, patch);
  const statusOpt = SHOT_STATUSES.find((o) => o.value === shot.status);
  const cell = (c: ColDef): ReactNode => {
    switch (c.key) {
      case 'number':
        return <Input bare size="sm" className="shots-num" value={shot.number} onChange={(v) => up({ number: v })} placeholder="#" aria-label="Shot number" />;
      case 'thumb':
        return (
          <div
            className="shots-thumb"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              e.stopPropagation();
              ctx.dropImage(shot, Array.from(e.dataTransfer.files));
            }}
          >
            <FrameThumb
              shot={shot}
              aspect={ctx.aspect}
              height={42}
              title={shot.image || shot.drawing ? 'Open in storyboard' : 'No frame yet — open in storyboard (or drop an image here)'}
              onClick={() => navigate('storyboard', { shotId: shot.id })}
            />
          </div>
        );
      case 'description':
        return <Textarea bare autoGrow minRows={1} value={shot.description} onChange={(v) => up({ description: v })} placeholder="Describe the shot…" autoFocus={autoFocus} aria-label="Description" />;
      case 'size':
        return <CompactSelect value={shot.shotSize} onChange={(v) => up({ shotSize: v })} options={SHOT_SIZES} title="Shot size" />;
      case 'angle':
        return <Input bare size="sm" list={DL.angle} value={shot.angle} onChange={(v) => up({ angle: v || undefined })} placeholder="—" aria-label="Angle" />;
      case 'movement':
        return <Input bare size="sm" list={DL.movement} value={shot.movement} onChange={(v) => up({ movement: v || undefined })} placeholder="—" aria-label="Movement" />;
      case 'equipment':
        return <Input bare size="sm" list={DL.equipment} value={shot.equipment} onChange={(v) => up({ equipment: v || undefined })} placeholder="—" aria-label="Equipment" />;
      case 'lens':
        return <Input bare size="sm" list={DL.lens} value={shot.lens} onChange={(v) => up({ lens: v || undefined })} placeholder="—" aria-label="Lens" />;
      case 'camera':
        return <CompactSelect value={shot.camera} onChange={(v) => up({ camera: v })} options={CAMERA_OPTIONS} title="Camera" />;
      case 'fps':
        return <Input bare size="sm" list={DL.fps} value={shot.frameRate} onChange={(v) => up({ frameRate: v || undefined })} placeholder={ctx.fps || '—'} aria-label="Frame rate" />;
      case 'sound':
        return (
          <CompactSelect
            value={shot.sound}
            onChange={(v) => up({ sound: v as Shot['sound'] })}
            options={SOUND_TYPES}
            display={SOUND_TYPES.find((o) => o.value === shot.sound)?.label}
            title="Sound"
          />
        );
      case 'cast':
        return <MultiSelect size="sm" value={shot.characterIds ?? []} onChange={(v) => up({ characterIds: v })} options={ctx.charOptions} placeholder="+ Cast" />;
      case 'setup':
        return <NumberInput bare size="sm" value={shot.setupMinutes} onChange={(v) => up({ setupMinutes: v })} placeholder="min" />;
      case 'shoot':
        return <NumberInput bare size="sm" value={shot.shootMinutes} onChange={(v) => up({ shootMinutes: v })} placeholder="min" />;
      case 'vfx':
        return <Checkbox checked={shot.vfx} onChange={(v) => up({ vfx: v || undefined })} title="VFX shot" />;
      case 'diagram':
        return (
          <div className="row" style={{ gap: 2, minWidth: 0 }}>
            <CompactSelect
              value={shot.diagramId}
              onChange={(v) => up({ diagramId: v })}
              options={ctx.diagramOptions}
              display={ctx.diagramOptions.find((o) => o.value === shot.diagramId)?.label ?? 'Missing diagram'}
              placeholder={ctx.diagramOptions.length ? '—' : 'None'}
              title="Lighting diagram"
              style={{ flex: 1 }}
            />
            {shot.diagramId && ctx.diagramOptions.some((o) => o.value === shot.diagramId) && (
              <button type="button" className="btn ghost sm icon" title="Open lighting diagram" onClick={() => navigate('lighting', { diagramId: shot.diagramId })}>
                <ExternalLink />
              </button>
            )}
          </div>
        );
      case 'status':
        return (
          <CompactSelect
            value={shot.status}
            onChange={(v) => up({ status: (v as ShotStatus) || 'planned' })}
            options={SHOT_STATUSES}
            allowEmpty={false}
            display={
              <>
                <span className="shots-status-dot" style={{ background: statusOpt?.color ?? '#888' }} />
                {statusOpt?.label ?? shot.status}
              </>
            }
            title="Status"
          />
        );
      case 'notes':
        return <Textarea bare autoGrow minRows={1} value={shot.notes} onChange={(v) => up({ notes: v || undefined })} placeholder="Notes" aria-label="Notes" />;
    }
  };
  return (
    <tr
      data-shot-row={shot.id}
      className={['shots-row', drop && `drop-${drop}`, dragging && 'dragging', flash && 'flash', isOmitted(shot) && 'omitted'].filter(Boolean).join(' ')}
      onDragOver={(e) => ctx.onRowDragOver(e, shot.id)}
      onDrop={(e) => ctx.onRowDrop(e, shot.id)}
    >
      <td
        className="drag"
        draggable
        onDragStart={(e) => ctx.onHandleDragStart(e, shot.id)}
        onDragEnd={ctx.onDragEnd}
        title="Drag to reorder (drop on another scene to move it there)"
      >
        <GripVertical size={14} />
      </td>
      {ctx.cols.map((c) => (
        <td key={c.key} className={[`col-${c.key}`, c.num && 'num', c.center && 'center'].filter(Boolean).join(' ')}>
          {cell(c)}
        </td>
      ))}
      <td className="actions-cell">
        <Menu
          align="end"
          trigger={
            <button type="button" className="btn ghost sm icon" aria-label="Shot actions">
              <MoreHorizontal />
            </button>
          }
          items={() => ctx.rowMenu(shot)}
        />
      </td>
    </tr>
  );
});

/* ------------------------------------------------------------------ screen */

export default function ShotsModule() {
  const shots = useProject((p) => p.shots);
  const characters = useProject((p) => p.characters);
  const diagrams = useProject((p) => p.diagrams);
  const aspectRatio = useProject((p) => p.meta.aspectRatio);
  const projectFps = useProject((p) => p.meta.frameRate);
  const model = useScriptModel();
  const fmt = useFormatters();
  const aspect = aspectToNumber(aspectRatio);

  const [sceneFilter, setSceneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [showThumbs, setShowThumbs] = useState<boolean>(() => readLS(LS_THUMBS, true));
  const [hidden, setHidden] = useState<ColKey[]>(() => readLS<ColKey[]>(LS_HIDDEN, []));
  const [showEmpty, setShowEmpty] = useState<boolean>(() => readLS(LS_EMPTY, true));
  const [flashId, setFlashId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | { group: string; pos: 'start' | 'end' } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  // scene filter may point at a deleted scene
  const effSceneFilter = sceneFilter === 'all' || sceneFilter === UNASSIGNED || model.sceneById.has(sceneFilter) ? sceneFilter : 'all';

  const charName = useMemo(() => new Map(characters.map((c) => [c.id, c.name])), [characters]);
  const charOptions = useMemo<Option[]>(() => characters.map((c) => ({ value: c.id, label: c.name, color: c.color })), [characters]);
  const diagramOptions = useMemo<Option[]>(() => diagrams.map((d) => ({ value: d.id, label: d.name || 'Untitled diagram' })), [diagrams]);

  const filtering = statusFilter !== 'all' || query.trim() !== '';
  const groups = useMemo(
    () =>
      groupShots(shots, model, {
        includeEmptyScenes: (showEmpty && !filtering) || effSceneFilter !== 'all',
        onlyKey: effSceneFilter === 'all' ? undefined : effSceneFilter,
        filter: filtering ? (s) => (statusFilter === 'all' || s.status === statusFilter) && matchesQuery(searchText(s, charName), query) : undefined,
      }),
    [shots, model, showEmpty, filtering, effSceneFilter, statusFilter, query, charName],
  );
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const visibleCount = groups.reduce((n, g) => n + g.shots.length, 0);

  // totals (all shots, omitted excluded)
  const totals = useMemo(() => {
    let count = 0;
    let setup = 0;
    let shoot = 0;
    const covered = new Set<string>();
    for (const s of shots) {
      if (isOmitted(s)) continue;
      count++;
      setup += s.setupMinutes ?? 0;
      shoot += s.shootMinutes ?? 0;
      if (s.sceneId && model.sceneById.has(s.sceneId)) covered.add(s.sceneId);
    }
    return { count, setup, shoot, covered: covered.size };
  }, [shots, model]);

  const cols = useMemo(
    () =>
      COLS.filter((c) => (c.key === 'thumb' ? showThumbs : !hidden.includes(c.key))).map((c) =>
        c.key === 'thumb' ? { ...c, width: Math.max(64, Math.min(110, Math.round(42 * aspect))) + 24 } : c,
      ),
    [showThumbs, hidden, aspect],
  );
  const colCount = cols.length + 2;
  const tableMinWidth = 24 + 40 + cols.reduce((w, c) => w + (c.width ?? 300), 0);

  /* ---------------- navigation from other modules */
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  useEffect(() => {
    const shotId = params?.shotId as string | undefined;
    const sceneId = params?.sceneId as string | undefined;
    if (!shotId && !sceneId) return;
    setStatusFilter('all');
    setQuery('');
    if (shotId) {
      setSceneFilter('all');
      setFlashId(shotId);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.querySelector(`[data-shot-row="${CSS.escape(shotId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })),
      );
      const t = setTimeout(() => setFlashId(null), 2200);
      return () => clearTimeout(t);
    }
    if (sceneId) {
      setSceneFilter('all');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.querySelector(`[data-scene-row="${CSS.escape(sceneId)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  // keep the sticky scene header as wide as the visible table area
  const roRef = useRef<ResizeObserver | null>(null);
  const wrapRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const set = () => el.style.setProperty('--shots-vw', `${el.clientWidth}px`);
    set();
    roRef.current = new ResizeObserver(set);
    roRef.current.observe(el);
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);

  // new rows grab focus once
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => setFocusId(null), 600);
    return () => clearTimeout(t);
  }, [focusId]);

  useCommand('find', () => {
    const input = searchRef.current?.querySelector('input');
    if (!input) return false;
    input.focus();
    input.select();
    return true;
  });

  /* ---------------- actions */

  const defaultTargetKey = (): string => {
    if (effSceneFilter !== 'all') return effSceneFilter;
    const withShots = groupsRef.current.filter((g) => g.shots.length);
    if (withShots.length) return withShots[withShots.length - 1].key;
    return model.scenes[0]?.id ?? UNASSIGNED;
  };

  const addShot = (key?: string, afterId?: string) => {
    const target = key ?? defaultTargetKey();
    const [id] = addShots(target, [{}], model, afterId ?? null);
    if (!id) return;
    if (filtering) {
      setStatusFilter('all');
      setQuery('');
    }
    if (effSceneFilter !== 'all' && effSceneFilter !== target) setSceneFilter('all');
    setFocusId(id);
    requestAnimationFrame(() => document.querySelector(`[data-shot-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  const deleteShot = async (shot: Shot) => {
    const ok = await confirmDialog({
      title: 'Delete shot?',
      message: `Shot ${shot.number || ''}${shot.description ? ` — “${shot.description.slice(0, 80)}”` : ''} will be removed from the shot list and the storyboard.`,
      confirmLabel: 'Delete shot',
      danger: true,
    });
    if (ok) shotOps.remove(shot.id);
  };

  const moveToScene = async (shot: Shot) => {
    const key = await pickScene({ title: `Move shot ${shot.number}`, scenes: model.scenes, current: shot.sceneId && model.sceneById.has(shot.sceneId) ? shot.sceneId : UNASSIGNED });
    if (key == null) return;
    moveShotsToScene([shot.id], key, model);
    const sc = model.sceneById.get(key);
    toast(sc ? `Moved to scene ${sc.number}` : 'Moved to Unassigned');
  };

  const rowMenuRef = useRef<(shot: Shot) => MenuItem[]>(() => []);
  rowMenuRef.current = (shot: Shot): MenuItem[] => [
    { label: 'Open in storyboard', icon: Images, onClick: () => navigate('storyboard', { shotId: shot.id }) },
    { label: 'Insert shot below', icon: ListPlus, onClick: () => addShot(shot.sceneId && model.sceneById.has(shot.sceneId) ? shot.sceneId : UNASSIGNED, shot.id) },
    {
      label: 'Duplicate',
      icon: Copy,
      onClick: () => {
        const id = duplicateShot(shot.id, model);
        if (id) setFocusId(id);
      },
    },
    { label: 'Move to scene…', icon: ArrowRightLeft, onClick: () => moveToScene(shot) },
    { separator: true },
    { label: 'Delete shot', icon: Trash2, danger: true, onClick: () => deleteShot(shot) },
  ];

  const dropImage = useCallback(async (shot: Shot, files: File[]) => {
    const imgs = files.filter(isImageFile);
    if (!imgs.length) {
      toast('That file is not an image', 'error');
      return;
    }
    try {
      const [name] = await importDroppedImages(imgs.slice(0, 1));
      if (name) {
        shotOps.update(shot.id, { image: name }, false);
        toast(`Frame added to shot ${shot.number}`);
      }
    } catch (e) {
      toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }, []);

  /* ---------------- drag & drop reordering */

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragId(null);
    setDrop(null);
  }, []);

  const finishMove = (id: string, key: string, beforeId: string | null) => {
    const before = getProject().shots;
    moveShot(id, key, beforeId, model);
    if (getProject().shots !== before) offerRenumber(key, model);
  };

  const finishRef = useRef(finishMove);
  finishRef.current = finishMove;

  const rowCtx = useMemo<RowCtx>(
    () => ({
      cols,
      aspect,
      charOptions,
      diagramOptions,
      fps: projectFps,
      onHandleDragStart: (e, id) => {
        dragRef.current = id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-prepro-shot', id);
        const tr = (e.currentTarget as HTMLElement).closest('tr');
        if (tr) e.dataTransfer.setDragImage(tr, 14, 14);
        setTimeout(() => setDragId(id), 0);
      },
      onDragEnd: () => endDrag(),
      onRowDragOver: (e, id) => {
        if (!dragRef.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const pos: DropPos = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
        setDrop((d) => (d && 'id' in d && d.id === id && d.pos === pos ? d : { id, pos }));
      },
      onRowDrop: (e, targetId) => {
        const id = dragRef.current;
        if (!id) return;
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const pos: DropPos = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
        endDrag();
        if (id === targetId) return;
        const g = groupsRef.current.find((x) => x.shots.some((s) => s.id === targetId));
        if (!g) return;
        let beforeId: string | null = targetId;
        if (pos === 'after') {
          const list = g.shots.filter((s) => s.id !== id);
          beforeId = list[list.findIndex((s) => s.id === targetId) + 1]?.id ?? null;
        }
        finishRef.current(id, g.key, beforeId);
      },
      rowMenu: (shot) => rowMenuRef.current(shot),
      dropImage,
    }),
    [cols, aspect, charOptions, diagramOptions, projectFps, endDrag, dropImage],
  );

  const groupDragOver = (e: DragEvent, key: string, pos: 'start' | 'end') => {
    if (!dragRef.current) return;
    e.preventDefault();
    setDrop((d) => (d && 'group' in d && d.group === key && d.pos === pos ? d : { group: key, pos }));
  };
  const groupDrop = (e: DragEvent, key: string, pos: 'start' | 'end') => {
    const id = dragRef.current;
    if (!id) return;
    e.preventDefault();
    endDrag();
    const g = groupsRef.current.find((x) => x.key === key);
    const list = (g?.shots ?? []).filter((s) => s.id !== id);
    finishMove(id, key, pos === 'start' ? list[0]?.id ?? null : null);
  };

  /* ---------------- renumber */

  const renumber = async (scheme: NumberScheme) => {
    const keys =
      effSceneFilter !== 'all'
        ? [effSceneFilter]
        : [...new Set(shots.map((s) => (s.sceneId && model.sceneById.has(s.sceneId) ? s.sceneId : UNASSIGNED)))];
    if (!keys.length) return;
    const scope = effSceneFilter !== 'all' ? (effSceneFilter === UNASSIGNED ? 'unassigned shots' : `scene ${model.sceneById.get(effSceneFilter)?.number}`) : 'every scene';
    const ok = await confirmDialog({
      title: 'Renumber shots?',
      message: `Shots in ${scope} will be numbered ${scheme === 'numeric' ? '1, 2, 3…' : 'with the scene number and a letter (1A, 1B, 1C…; I and O are skipped)'} in their current order.`,
      confirmLabel: 'Renumber',
    });
    if (!ok) return;
    renumberShots(keys, scheme, model);
    toast('Shots renumbered');
  };

  const toggleCol = (k: ColKey) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    writeLS(LS_HIDDEN, next);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setQuery('');
    setSceneFilter('all');
  };

  /* ---------------- render */

  const sceneOptions: Option[] = useMemo(
    () => [
      { value: 'all', label: 'All scenes' },
      ...model.scenes.map((s) => ({ value: s.id, label: sceneLabel(s) })),
      { value: UNASSIGNED, label: 'Unassigned shots' },
    ],
    [model.scenes],
  );

  const subtitle = [
    plural(totals.count, 'shot'),
    model.scenes.length ? `${totals.covered}/${model.scenes.length} scenes covered` : '',
    totals.setup + totals.shoot > 0 ? `est. ${fmt.minutes(totals.setup + totals.shoot)} (setup ${fmt.minutes(totals.setup) || '0m'} · shoot ${fmt.minutes(totals.shoot) || '0m'})` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const noShotsAtAll = shots.length === 0 && model.scenes.length === 0;

  const renderGroup = (g: ShotGroup): ReactNode => {
    const sc = g.scene;
    const live = g.shots.filter((s) => !isOmitted(s));
    const setup = live.reduce((n, s) => n + (s.setupMinutes ?? 0), 0);
    const shoot = live.reduce((n, s) => n + (s.shootMinutes ?? 0), 0);
    const dropStart = drop && 'group' in drop && drop.group === g.key && drop.pos === 'start';
    const dropEnd = drop && 'group' in drop && drop.group === g.key && drop.pos === 'end';
    return (
      <tbody key={g.key} className="shots-group">
        <tr
          className={['shots-scene-row', dropStart && 'drop-after'].filter(Boolean).join(' ')}
          data-scene-row={g.key}
          onDragOver={(e) => groupDragOver(e, g.key, 'start')}
          onDrop={(e) => groupDrop(e, g.key, 'start')}
        >
          <td colSpan={colCount}>
            <div className="shots-scene-inner">
              <div className="shots-scene-head">
                <SceneTag scene={sc} />
                {sc ? (
                  <button type="button" className="shots-scene-heading" title="Open this scene in the script" onClick={() => navigate('script', { sceneId: sc.id })}>
                    {sc.heading || 'Untitled scene'}
                  </button>
                ) : (
                  <span className="shots-scene-heading static">{model.scenes.length ? 'Unassigned shots' : 'Shots'}</span>
                )}
                <span className="shots-scene-meta">
                  {sc && sc.eighths > 0 && <span>{fmt.eighths(sc.eighths)} pg</span>}
                  <span>{plural(g.shots.length, 'shot')}</span>
                  {setup + shoot > 0 && (
                    <span title="Estimated setup + shooting time">
                      {fmt.minutes(setup + shoot)} <span className="muted">(setup {fmt.minutes(setup) || '0m'} · shoot {fmt.minutes(shoot) || '0m'})</span>
                    </span>
                  )}
                </span>
                <span className="spacer" />
                <Button size="sm" variant="ghost" icon={Images} onClick={() => navigate('storyboard', sc ? { sceneId: sc.id } : {})}>
                  Storyboard
                </Button>
                <Button size="sm" icon={Plus} onClick={() => addShot(g.key)}>
                  Add shot
                </Button>
              </div>
              {sc && (sc.synopsis || sc.firstAction) && <div className="shots-scene-syn">{sc.synopsis || sc.firstAction}</div>}
            </div>
          </td>
        </tr>
        {g.shots.map((s) => (
          <ShotRow
            key={s.id}
            shot={s}
            ctx={rowCtx}
            drop={drop && 'id' in drop && drop.id === s.id ? drop.pos : null}
            dragging={dragId === s.id}
            flash={flashId === s.id}
            autoFocus={focusId === s.id}
          />
        ))}
        <tr
          className={['shots-add-row', dropEnd && 'drop-before'].filter(Boolean).join(' ')}
          onDragOver={(e) => groupDragOver(e, g.key, 'end')}
          onDrop={(e) => groupDrop(e, g.key, 'end')}
        >
          <td colSpan={colCount}>
            <div className="shots-scene-inner">
              {g.shots.length === 0 ? (
                <span className="muted small">
                  No shots in this scene yet.{' '}
                  <button type="button" className="shots-link" onClick={() => addShot(g.key)}>
                    Add the first shot
                  </button>
                </span>
              ) : (
                <button type="button" className="shots-add-btn" onClick={() => addShot(g.key)}>
                  <Plus size={13} /> Add shot{sc ? ` to scene ${sc.number}` : ''}
                </button>
              )}
            </div>
          </td>
        </tr>
      </tbody>
    );
  };

  return (
    <div className="module shots-module">
      <ModuleHeader
        title="Shot List"
        subtitle={subtitle}
        icon={ListVideo}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'shot-list', label: 'Shot list — by scene', options: effSceneFilter !== 'all' ? { groupBy: 'scene', sceneId: effSceneFilter } : { groupBy: 'scene' } },
                { id: 'shot-list', label: 'Shot list — by shoot day', options: { groupBy: 'day' } },
                { id: 'storyboard', label: 'Storyboard', options: effSceneFilter !== 'all' ? { sceneId: effSceneFilter } : undefined },
              ]}
              csv={[
                {
                  label: 'Shot list (CSV)',
                  onClick: () =>
                    void exportShotsCsv(getProject(), model)
                      .then((path) => {
                        if (path || backend.kind !== 'electron') toast('Shot list exported to CSV');
                      })
                      .catch((e) => toast(`CSV export failed: ${e instanceof Error ? e.message : e}`, 'error')),
                },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => addShot()}>
              Add shot
            </Button>
          </>
        }
      />
      <Toolbar>
        <Select value={effSceneFilter} onChange={setSceneFilter} options={sceneOptions} style={{ width: 240 }} aria-label="Scene filter" />
        <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} style={{ width: 140 }} aria-label="Status filter" />
        <div ref={searchRef}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search shots…  (Ctrl+F)" width={230} />
        </div>
        <Switch
          checked={showThumbs}
          onChange={(v) => {
            setShowThumbs(v);
            writeLS(LS_THUMBS, v);
          }}
          label="Thumbnails"
        />
        <div className="spacer" />
        {filtering && (
          <span className="muted small">
            {plural(visibleCount, 'shot')} match
          </span>
        )}
        <Menu
          align="end"
          trigger={<Button icon={Columns3}>Columns</Button>}
          items={() => [
            { header: 'Columns' },
            ...COLS.filter((c) => c.optional).map((c) => ({ label: COL_TITLES[c.key] ? `${c.label} — ${COL_TITLES[c.key]}` : c.label, checked: !hidden.includes(c.key), onClick: () => toggleCol(c.key) })),
            { separator: true },
            {
              label: 'Show scenes without shots',
              checked: showEmpty,
              onClick: () => {
                setShowEmpty(!showEmpty);
                writeLS(LS_EMPTY, !showEmpty);
              },
            },
          ]}
        />
        <Menu
          align="end"
          trigger={<Button icon={ListOrdered}>Renumber</Button>}
          items={[
            { header: effSceneFilter === 'all' ? 'Renumber every scene' : 'Renumber this scene' },
            { label: '1, 2, 3 …', icon: ListOrdered, onClick: () => renumber('numeric') },
            { label: '1A, 1B, 1C … (scene + letter)', icon: FileText, onClick: () => renumber('scene-letter') },
          ]}
        />
      </Toolbar>
      <div className="module-body shots-body">
        {noShotsAtAll ? (
          <EmptyState
            icon={ListVideo}
            title="No shots yet"
            description="Break your scenes down into shots with size, angle, movement, lens and timing. Shots also appear as frames in the Storyboard."
            action={
              <Button variant="primary" icon={Plus} onClick={() => addShot()}>
                Add the first shot
              </Button>
            }
          />
        ) : groups.length === 0 || (filtering && visibleCount === 0) ? (
          <EmptyState
            icon={SearchX}
            title="No shots match"
            description="Try a different search or status, or clear the filters."
            action={<Button onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <div className="table-wrap shots-wrap" ref={wrapRef} onDragLeave={(e) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop(null);
          }}>
            <table className="table shots-table" style={{ minWidth: tableMinWidth }}>
              <colgroup>
                <col style={{ width: 24 }} />
                {cols.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: 40 }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  {cols.map((c) => (
                    <th key={c.key} className={[c.num && 'num', c.center && 'center'].filter(Boolean).join(' ')} title={COL_TITLES[c.key]}>
                      {c.label}
                      {(c.key === 'setup' || c.key === 'shoot') && <span className="muted"> (min)</span>}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              {groups.map((g) => (
                <Fragment key={g.key}>{renderGroup(g)}</Fragment>
              ))}
            </table>
          </div>
        )}
        <datalist id={DL.angle}>{SHOT_ANGLES.map((o) => <option key={o.value} value={o.value} />)}</datalist>
        <datalist id={DL.movement}>{SHOT_MOVEMENTS.map((o) => <option key={o.value} value={o.value} />)}</datalist>
        <datalist id={DL.equipment}>{SHOT_EQUIPMENT.map((o) => <option key={o.value} value={o.value} />)}</datalist>
        <datalist id={DL.lens}>{LENSES.map((o) => <option key={o.value} value={o.value} />)}</datalist>
        <datalist id={DL.fps}>{FRAME_RATES.map((o) => <option key={o.value} value={o.value} />)}</datalist>
      </div>
      <ScenePickerHost />
    </div>
  );
}
