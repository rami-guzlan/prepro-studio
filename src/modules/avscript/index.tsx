/* Two-column audio/video (A/V) script editor, rendered inside the Script module.
   Rows: optional segment band, number, VIDEO, AUDIO ("SPEAKER:" labels styled),
   duration (suggested from audio at 150 wpm), running time, thumbnail or linked
   shot, notes. Keyboard: Ctrl+Enter new row · Alt+↑/↓ move · Ctrl+Shift+S segment. */
import './avscript.css';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Copy,
  FileVideo2,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Link2,
  ListVideo,
  MoreHorizontal,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import type { Draft } from 'immer';
import type { AVRow, AVScript, ProjectData, Shot } from '@/types';
import { getProject, listOps, update, useProject } from '@/store/project';
import { readLS, writeLS } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { formatSeconds, parseDuration } from '@/lib/format';
import { uid } from '@/lib/id';
import { naturalCompare, safeFileName, truncate } from '@/lib/text';
import { exportCsv } from '@/backend';
import { AssetImage, Button, EmptyState, ExportMenu, IconButton, ImageDrop, Menu, Select, Textarea, confirmDialog, toast, type MenuItem } from '@/ui';
import { RichText, computeTiming, WPM } from './format';
import { templateAvRows } from '@/templates';

type Field = 'video' | 'audio' | 'duration' | 'segment' | 'notes';

function avDraft(d: Draft<ProjectData>): Draft<AVScript> {
  if (!d.script.av) d.script.av = { rows: [], videoLabel: 'VIDEO', audioLabel: 'AUDIO', showImages: true, showDurations: true };
  if (!Array.isArray(d.script.av.rows)) d.script.av.rows = [];
  return d.script.av;
}

const rowOps = listOps<AVRow>((d) => avDraft(d).rows, 'av');
const RICH = { spk: 'avs-spk', cue: 'avs-cue', dir: 'avs-dir' };

/* ---------------------------------------------------------------- caret helpers */

/** Pending caret position for the next cell that enters edit mode. */
let nextCaret: number | 'end' | null = null;

function offsetFromPoint(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let off = 0;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      off = pos.offset;
    }
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      off = r.startOffset;
    }
  }
  if (!node || !root.contains(node)) return null;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) return total + off;
    total += (n.textContent ?? '').length;
  }
  return null;
}

/* ---------------------------------------------------------------- rich cell */

const RichCell = memo(function RichCell({
  value,
  field,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  field: 'video' | 'audio';
  label: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number | 'end' | null>(null);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = taRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const c = caretRef.current ?? nextCaret ?? 'end';
    caretRef.current = null;
    nextCaret = null;
    const pos = c === 'end' ? el.value.length : Math.max(0, Math.min(c, el.value.length));
    el.setSelectionRange(pos, pos);
  }, [editing]);

  if (editing) {
    return (
      <Textarea
        ref={taRef}
        bare
        autoGrow
        minRows={1}
        className={`avs-text avs-${field}`}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onBlur={() => {
          // deferred: a row move re-parents the textarea and the editor re-focuses it right away
          setTimeout(() => {
            if (taRef.current && document.activeElement !== taRef.current) setEditing(false);
          }, 0);
        }}
        data-avs-field={field}
        aria-label={label}
      />
    );
  }
  return (
    <div
      ref={viewRef}
      className={`avs-text avs-view avs-${field} ${value ? '' : 'empty'}`}
      tabIndex={0}
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      data-avs-field={field}
      onMouseDown={(e) => {
        if (e.button !== 0 || !viewRef.current) return;
        caretRef.current = value ? offsetFromPoint(viewRef.current, e.clientX, e.clientY) ?? 'end' : 0;
      }}
      onFocus={() => setEditing(true)}
    >
      {value ? <RichText text={value} cls={RICH} /> : placeholder}
    </div>
  );
});

/* ---------------------------------------------------------------- duration input */

function DurationInput({ value, suggested, onChange }: { value?: number; suggested?: number; onChange: (v: number | undefined) => void }) {
  const fmt = (v?: number) => (v == null ? '' : formatSeconds(v));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);
  const commit = () => {
    const t = text.trim();
    if (!t) {
      if (value != null) onChange(undefined);
      return;
    }
    const s = parseDuration(t);
    if (s == null || s < 0) setText(fmt(value));
    else if (Math.round(s) !== value) onChange(Math.round(s));
  };
  return (
    <input
      className="input bare sm avs-dur"
      value={text}
      placeholder={suggested != null ? formatSeconds(suggested) : '0:00'}
      title={suggested != null ? `Suggested from the audio (${WPM} wpm): ${formatSeconds(suggested)} — type a duration to override` : 'Duration (m:ss)'}
      inputMode="numeric"
      data-avs-field="duration"
      onFocus={(e) => {
        setFocused(true);
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setText(fmt(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label="Duration"
    />
  );
}

/* ---------------------------------------------------------------- row */

interface RowActions {
  addAfter: (id: string) => void;
  move: (id: string, dir: -1 | 1, field?: Field, caret?: number) => void;
  segment: (id: string) => void;
  removeSegment: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  openNote: (id: string) => void;
  closeNote: (id: string) => void;
}

interface RowProps {
  row: AVRow;
  index: number;
  count: number;
  suggested?: number;
  runEnd: number;
  /** running time includes estimated durations */
  runEst: boolean;
  segmentSeconds?: number;
  showImages: boolean;
  showDurations: boolean;
  notesVisible: boolean;
  shot?: Shot;
  shotLabel?: string;
  shotOptions: { value: string; label: string }[];
  grid: string;
  actions: RowActions;
}

const AVRowView = memo(function AVRowView({
  row,
  index,
  count,
  suggested,
  runEnd,
  runEst,
  segmentSeconds,
  showImages,
  showDurations,
  notesVisible,
  shot,
  shotLabel,
  shotOptions,
  grid,
  actions,
}: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: 'relative' };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const field = (target.closest('[data-avs-field]') as HTMLElement | null)?.dataset.avsField as Field | undefined;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.blur();
      actions.addAfter(row.id);
    } else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const caret = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target.selectionStart ?? undefined : undefined;
      actions.move(row.id, e.key === 'ArrowUp' ? -1 : 1, field, caret);
    } else if (mod && e.shiftKey && (e.code === 'KeyS' || e.key.toLowerCase() === 's')) {
      e.preventDefault();
      actions.segment(row.id);
    }
  };

  const menu = (): MenuItem[] => [
    { label: 'Add row below', icon: Plus, shortcut: 'Ctrl+Enter', onClick: () => actions.addAfter(row.id) },
    row.segment == null
      ? { label: 'Insert segment band', icon: Heading, shortcut: 'Ctrl+Shift+S', onClick: () => actions.segment(row.id) }
      : { label: 'Remove segment band', icon: Heading, onClick: () => actions.removeSegment(row.id) },
    { label: row.notes ? 'Edit note' : 'Add note', icon: StickyNote, onClick: () => actions.openNote(row.id) },
    { separator: true },
    { label: 'Move up', icon: ArrowUp, shortcut: 'Alt+↑', disabled: index === 0, onClick: () => actions.move(row.id, -1) },
    { label: 'Move down', icon: ArrowDown, shortcut: 'Alt+↓', disabled: index === count - 1, onClick: () => actions.move(row.id, 1) },
    { label: 'Duplicate', icon: Copy, onClick: () => actions.duplicate(row.id) },
    { separator: true },
    { label: 'Delete row', icon: Trash2, danger: true, onClick: () => actions.remove(row.id) },
  ];

  const thumb = () => {
    if (row.image) return <ImageDrop value={row.image} onChange={(v) => rowOps.update(row.id, { image: v }, false)} aspect={16 / 9} />;
    if (shot?.image)
      return (
        <div className="avs-shot-thumb" title={`Linked shot ${shotLabel ?? ''}${shot.description ? ' — ' + shot.description : ''}`}>
          <AssetImage name={shot.image} />
          {shot.drawing && <AssetImage name={shot.drawing} className="avs-shot-drawing" />}
          <span className="avs-shot-tag">
            <Link2 size={11} /> {shotLabel}
          </span>
        </div>
      );
    return <ImageDrop value={undefined} onChange={(v) => rowOps.update(row.id, { image: v }, false)} aspect={16 / 9} label="Image" />;
  };

  return (
    <div ref={setNodeRef} style={style} className={`avs-row-wrap ${isDragging ? 'dragging' : ''}`} data-avs-row={row.id} onKeyDown={onKey}>
      {row.segment != null && (
        <div className="avs-segment">
          <input
            className="avs-segment-input"
            value={row.segment}
            placeholder="SEGMENT TITLE"
            data-avs-field="segment"
            onChange={(e) => rowOps.update(row.id, { segment: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const el = (e.currentTarget.closest('[data-avs-row]') as HTMLElement | null)?.querySelector('[data-avs-field="video"]') as HTMLElement | null;
                el?.focus();
              }
            }}
            aria-label="Segment title"
          />
          {showDurations && segmentSeconds != null && segmentSeconds > 0 && <span className="avs-segment-time">{formatSeconds(segmentSeconds)}</span>}
          <IconButton icon={X} size="sm" label="Remove segment band" onClick={() => actions.removeSegment(row.id)} />
        </div>
      )}
      <div className="avs-row" style={{ gridTemplateColumns: grid }}>
        <div className="avs-num">
          <button type="button" ref={setActivatorNodeRef} className="avs-grip" {...attributes} {...listeners} aria-label={`Drag row ${index + 1}`} title="Drag to reorder">
            <GripVertical size={14} />
          </button>
          <span>{index + 1}</span>
        </div>
        {showImages && (
          <div className="avs-thumb">
            {thumb()}
            {shotOptions.length > 0 && (
              <Select
                bare
                size="sm"
                className="avs-shot-select"
                value={row.shotId ?? ''}
                options={row.shotId && !shot ? [{ value: row.shotId, label: '(deleted shot)' }, ...shotOptions] : shotOptions}
                placeholder="Link shot…"
                onChange={(v) => rowOps.update(row.id, { shotId: v || undefined }, false)}
                aria-label="Linked shot"
              />
            )}
          </div>
        )}
        <div className="avs-cell">
          <RichCell
            value={row.video}
            field="video"
            label="Video"
            placeholder="Picture: shot, B-roll, on-screen text (SUPER: …)"
            onChange={(v) => rowOps.update(row.id, { video: v })}
          />
        </div>
        <div className="avs-cell">
          <RichCell
            value={row.audio}
            field="audio"
            label="Audio"
            placeholder="NARRATOR: voice-over, dialogue…  SFX / MUSIC: cues"
            onChange={(v) => rowOps.update(row.id, { audio: v })}
          />
        </div>
        {showDurations && (
          <div className="avs-time">
            <DurationInput value={row.duration} suggested={suggested} onChange={(v) => rowOps.update(row.id, { duration: v }, false)} />
          </div>
        )}
        {showDurations && (
          <div className={`avs-run ${runEst ? 'est' : ''}`} title={runEst ? 'Includes durations estimated from the audio' : 'Running time at the end of this row'}>
            {runEnd > 0 ? formatSeconds(runEnd) : '—'}
          </div>
        )}
        <div className="avs-actions">
          <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label="Row actions" />} items={menu} />
        </div>
      </div>
      {notesVisible && (
        <div className="avs-row avs-notes-row" style={{ gridTemplateColumns: grid }}>
          <div />
          {showImages && <div />}
          <div className="avs-notes">
            <StickyNote size={13} />
            <Textarea
              bare
              autoGrow
              minRows={1}
              value={row.notes}
              placeholder="Production note (not part of the script)…"
              onChange={(v) => rowOps.update(row.id, { notes: v || undefined })}
              onBlur={(e) => {
                if (!e.target.value.trim()) actions.closeNote(row.id);
              }}
              data-avs-field="notes"
              aria-label="Row note"
            />
          </div>
        </div>
      )}
    </div>
  );
});

/* ======================================================================== editor */

export default function AVScriptEditor() {
  const av = useProject((p) => p.script.av);
  const shots = useProject((p) => p.shots);
  const targetText = useProject((p) => p.meta.targetRuntime);
  const model = useScriptModel();

  const rows = av?.rows ?? [];
  const showImages = av?.showImages !== false;
  const showDurations = av?.showDurations !== false;
  const [showNotes, setShowNotesState] = useState<boolean>(() => readLS('prepro.av.showNotes', false));
  const setShowNotes = (v: boolean) => {
    setShowNotesState(v);
    writeLS('prepro.av.showNotes', v);
  };
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const timing = useMemo(() => computeTiming(rows), [rows]);
  const target = parseDuration(targetText ?? '');

  /* ---- focus requests (applied after the store update re-renders) */
  const rootRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: string; field: Field; caret?: number | 'end' } | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const requestFocus = useCallback((id: string, field: Field, caret?: number | 'end') => {
    pending.current = { id, field, caret };
    setFocusTick((t) => t + 1);
  }, []);
  useLayoutEffect(() => {
    const req = pending.current;
    if (!req || !rootRef.current) return;
    pending.current = null;
    const el = rootRef.current.querySelector(`[data-avs-row="${CSS_ESCAPE(req.id)}"] [data-avs-field="${req.field}"]`) as HTMLElement | null;
    if (!el) return;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus();
      const pos = req.caret == null || req.caret === 'end' ? el.value.length : Math.min(req.caret, el.value.length);
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* inputs without selection support */
      }
    } else {
      nextCaret = req.caret ?? 'end';
      el.focus();
    }
    el.scrollIntoView({ block: 'nearest' });
  }, [focusTick, rows]);

  /* ---- actions (stable; read the latest rows from the store) */
  const actions = useMemo<RowActions>(() => {
    const cur = () => getProject().script.av?.rows ?? [];
    return {
      addAfter(id) {
        const list = cur();
        const i = list.findIndex((r) => r.id === id);
        const row: AVRow = { id: uid('av'), video: '', audio: '' };
        rowOps.add(row, i < 0 ? list.length : i + 1);
        requestFocus(row.id, 'video', 0);
      },
      move(id, dir, field, caret) {
        const list = cur();
        const i = list.findIndex((r) => r.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        rowOps.move(i, j);
        if (field) requestFocus(id, field, caret);
      },
      segment(id) {
        const r = cur().find((x) => x.id === id);
        if (r && r.segment == null) update((d) => void (avDraft(d).rows.find((x) => x.id === id)!.segment = ''));
        requestFocus(id, 'segment', 'end');
      },
      removeSegment(id) {
        update((d) => {
          const r = avDraft(d).rows.find((x) => x.id === id);
          if (r) delete r.segment;
        });
      },
      duplicate(id) {
        const copy = rowOps.duplicate(id, () => uid('av'));
        if (copy) requestFocus(copy.id, 'video', 'end');
      },
      async remove(id) {
        const r = cur().find((x) => x.id === id);
        if (!r) return;
        const filled = !!(r.video.trim() || r.audio.trim() || r.notes?.trim() || r.image || r.segment?.trim() || r.duration != null);
        if (filled) {
          const ok = await confirmDialog({
            title: 'Delete row?',
            message: truncate(r.video.trim() || r.audio.trim() || r.segment?.trim() || 'This row has content.', 120),
            confirmLabel: 'Delete',
            danger: true,
          });
          if (!ok) return;
        }
        rowOps.remove(id);
      },
      openNote(id) {
        setOpenNotes((s) => new Set(s).add(id));
        requestFocus(id, 'notes', 'end');
      },
      closeNote(id) {
        setOpenNotes((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      },
    };
  }, [requestFocus]);

  /* ---- shots */
  const shotIndex = useMemo(() => {
    const sceneIdx = (s: Shot) => (s.sceneId ? model.sceneById.get(s.sceneId)?.index ?? 9999 : 9999);
    const sorted = shots.filter((s) => s.status !== 'omitted').sort((a, b) => sceneIdx(a) - sceneIdx(b) || naturalCompare(a.number ?? '', b.number ?? ''));
    const label = (s: Shot) => {
      const sc = s.sceneId ? model.sceneById.get(s.sceneId) : undefined;
      return `${sc ? sc.number + '/' : ''}${s.number}`;
    };
    return {
      sorted,
      byId: new Map(shots.map((s) => [s.id, s])),
      label,
      options: sorted.map((s) => ({ value: s.id, label: truncate(`${label(s)} – ${s.title || s.description || s.shotSize || 'Shot'}`, 40) })),
    };
  }, [shots, model]);

  /* ---- toolbar actions */
  const setAv = (patch: Partial<AVScript>) =>
    update(
      (d) => {
        Object.assign(avDraft(d), patch);
      },
      { coalesce: `av:${Object.keys(patch).join(',')}` },
    );

  const addRow = (segment?: boolean) => {
    const row: AVRow = { id: uid('av'), video: '', audio: '', ...(segment ? { segment: '' } : {}) };
    rowOps.add(row);
    requestFocus(row.id, segment ? 'segment' : 'video', 'end');
  };

  const importShots = async () => {
    const list = shotIndex.sorted;
    if (!list.length) {
      toast('The shot list is empty — add shots in the Shot List first.', 'info');
      return;
    }
    if (rows.length) {
      const ok = await confirmDialog({
        title: `Append ${list.length} row${list.length === 1 ? '' : 's'} from the shot list?`,
        message: 'One row per shot: shot size and description go in the VIDEO column, the shot’s audio notes in the AUDIO column. Existing rows are kept.',
        confirmLabel: 'Append rows',
      });
      if (!ok) return;
    }
    let lastScene: string | undefined;
    const newRows: AVRow[] = list.map((s) => {
      const sc = s.sceneId ? model.sceneById.get(s.sceneId) : undefined;
      const video = [s.shotSize, s.description || s.title].filter(Boolean).join(' — ');
      const row: AVRow = { id: uid('av'), video, audio: s.audio ?? '', shotId: s.id };
      if (s.duration != null) row.duration = s.duration;
      if (sc && sc.id !== lastScene) {
        row.segment = `${sc.number}. ${sc.heading}`;
        lastScene = sc.id;
      }
      return row;
    });
    update((d) => void avDraft(d).rows.push(...newRows));
    toast(`Imported ${newRows.length} shot${newRows.length === 1 ? '' : 's'}`);
  };

  const exportCsvFile = async () => {
    const p = getProject();
    const t = computeTiming(p.script.av?.rows ?? []);
    const list = (p.script.av?.rows ?? []).map((r, i) => ({ r, i, t: t.rows[i] }));
    const path = await exportCsv(`${safeFileName(p.meta.title)} - AV script`, list, [
      { header: '#', value: (x) => x.i + 1 },
      { header: 'Segment', value: (x) => x.r.segment ?? '' },
      { header: p.script.av?.videoLabel || 'Video', value: (x) => x.r.video },
      { header: p.script.av?.audioLabel || 'Audio', value: (x) => x.r.audio },
      { header: 'Duration', value: (x) => (x.r.duration != null ? formatSeconds(x.r.duration) : x.t.suggested != null ? `~${formatSeconds(x.t.suggested)}` : '') },
      { header: 'Running time', value: (x) => formatSeconds(x.t.end) },
      { header: 'Shot', value: (x) => (x.r.shotId ? (shotIndex.byId.get(x.r.shotId) ? shotIndex.label(shotIndex.byId.get(x.r.shotId)!) : '') : '') },
      { header: 'Notes', value: (x) => x.r.notes ?? '' },
    ]);
    if (path) toast('A/V script exported to CSV');
  };

  /* ---- drag & drop */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const list = getProject().script.av?.rows ?? [];
    const from = list.findIndex((r) => r.id === active.id);
    const to = list.findIndex((r) => r.id === over.id);
    if (from >= 0 && to >= 0) rowOps.move(from, to);
  };

  const grid = [
    '46px',
    showImages ? '150px' : null,
    'minmax(200px, 1fr)',
    'minmax(200px, 1fr)',
    showDurations ? '66px' : null,
    showDurations ? '58px' : null,
    '34px',
  ]
    .filter(Boolean)
    .join(' ');
  // below this width the sheet scrolls horizontally instead of squashing the text columns
  const minWidth = 46 + (showImages ? 150 : 0) + 400 + (showDurations ? 124 : 0) + 34 + 2;

  const estUntil = useMemo(() => {
    let any = false;
    return timing.rows.map((t) => (any = any || (t.estimated && t.effective > 0)));
  }, [timing]);

  const over = target != null && target > 0 && timing.total > target;
  const runtimePct = target ? Math.min(1, timing.total / target) : 0;

  return (
    <div className="avs-root" ref={rootRef}>
      <div className="avs-sticky">
        <div className="avs-toolbar">
          <Button size="sm" icon={Plus} onClick={() => addRow(false)} title="Add a row at the end (Ctrl+Enter inside a row adds below it)">
            Row
          </Button>
          <Button size="sm" icon={Heading} onClick={() => addRow(true)} title="Add a row with a segment band">
            Segment
          </Button>
          <div className="vdivider" />
          <Button size="sm" variant="ghost" icon={ImageIcon} active={showImages} aria-pressed={showImages} onClick={() => setAv({ showImages: !showImages })} title="Show thumbnails">
            Images
          </Button>
          <Button size="sm" variant="ghost" icon={Clock} active={showDurations} aria-pressed={showDurations} onClick={() => setAv({ showDurations: !showDurations })} title="Show durations & running time">
            Timing
          </Button>
          <Button size="sm" variant="ghost" icon={StickyNote} active={showNotes} aria-pressed={showNotes} onClick={() => setShowNotes(!showNotes)} title="Show production notes under every row">
            Notes
          </Button>
          <div className="spacer" />
          <div className={`avs-runtime ${over ? 'over' : ''}`} title={timing.estimated ? `Includes durations estimated from the audio at ${WPM} words per minute` : 'Total of the row durations'}>
            <Clock size={13} />
            <b>{formatSeconds(timing.total) || '0:00'}</b>
            {target ? <span>/ {formatSeconds(target)}</span> : null}
            {target ? (
              <span className="avs-runtime-bar">
                <span style={{ width: `${Math.round(runtimePct * 100)}%` }} />
              </span>
            ) : null}
            {timing.estimated && <span className="avs-est">est.</span>}
          </div>
          <span className="avs-words" title={`Spoken words in the audio column — about ${formatSeconds(Math.round((timing.words / WPM) * 60)) || '0:00'} at ${WPM} wpm`}>
            {timing.words} word{timing.words === 1 ? '' : 's'}
          </span>
          <div className="vdivider" />
          <Button size="sm" icon={ListVideo} onClick={importShots} title="One row per shot from the Shot List">
            Import shots
          </Button>
          <ExportMenu
            label="Export"
            docs={[{ id: 'av-script', label: 'A/V script (PDF / print)', options: { showImages, showDurations, showNotes } }]}
            csv={[{ label: 'A/V script (CSV)', onClick: exportCsvFile }]}
          />
        </div>
        {rows.length > 0 && (
          <div className="avs-head" style={{ gridTemplateColumns: grid, minWidth }}>
            <span className="avs-head-cell">#</span>
            {showImages && <span className="avs-head-cell">Frame</span>}
            <input
              className="avs-head-input"
              value={av?.videoLabel ?? 'VIDEO'}
              placeholder="VIDEO"
              onChange={(e) => setAv({ videoLabel: e.target.value })}
              title="Click to rename the column"
              aria-label="Video column title"
            />
            <input
              className="avs-head-input"
              value={av?.audioLabel ?? 'AUDIO'}
              placeholder="AUDIO"
              onChange={(e) => setAv({ audioLabel: e.target.value })}
              title="Click to rename the column"
              aria-label="Audio column title"
            />
            {showDurations && <span className="avs-head-cell right">Time</span>}
            {showDurations && <span className="avs-head-cell right">Run</span>}
            <span />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileVideo2}
          title="Start your A/V script"
          description="Write picture on the left and sound on the right, row by row — the classic two-column format for corporate, documentary, training and promo videos. Durations and running time are calculated as you write."
          action={
            <div className="row">
              <Button variant="primary" icon={Plus} onClick={() => addRow(true)}>
                Add first row
              </Button>
              {shotIndex.sorted.length > 0 && (
                <Button icon={ListVideo} onClick={importShots}>
                  Import {shotIndex.sorted.length} shot{shotIndex.sorted.length === 1 ? '' : 's'}
                </Button>
              )}
              <Menu
                trigger={<Button>Start from a structure</Button>}
                items={[
                  { label: 'Trailer / teaser beats', onClick: () => rowOps.replaceAll(templateAvRows('trailer')) },
                  { label: 'Mini-doc story structure', onClick: () => rowOps.replaceAll(templateAvRows('minidoc')) },
                ]}
              />
            </div>
          }
        />
      ) : (
        <div className="avs-sheet" style={{ minWidth }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row, i) => {
                const shot = row.shotId ? shotIndex.byId.get(row.shotId) : undefined;
                return (
                  <AVRowView
                    key={row.id}
                    row={row}
                    index={i}
                    count={rows.length}
                    suggested={timing.rows[i].suggested}
                    runEnd={timing.rows[i].end}
                    runEst={estUntil[i]}
                    segmentSeconds={row.segment != null ? timing.segments.get(row.id) : undefined}
                    showImages={showImages}
                    showDurations={showDurations}
                    notesVisible={showNotes || !!row.notes?.trim() || openNotes.has(row.id)}
                    shot={shot}
                    shotLabel={shot ? shotIndex.label(shot) : undefined}
                    shotOptions={shotIndex.options}
                    grid={grid}
                    actions={actions}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
          <div className="avs-foot">
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => addRow(false)}>
              Add row
            </Button>
            <Button size="sm" variant="ghost" icon={Heading} onClick={() => addRow(true)}>
              Add segment
            </Button>
            <span className="spacer" />
            <span className="avs-hint">Ctrl+Enter new row · Alt+↑/↓ move row · Ctrl+Shift+S segment band</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CSS_ESCAPE(s: string): string {
  return typeof window !== 'undefined' && window.CSS?.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}
