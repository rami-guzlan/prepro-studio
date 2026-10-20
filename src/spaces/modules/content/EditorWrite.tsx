/* Content editor › Write: script (with structures, word count and spoken
   duration), two-column A/V script, and copy (character limits per channel,
   slides / thread parts split on `---`). */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Clock, Columns2, Copy, FileText, GripVertical, Heading, LayoutTemplate, MoreHorizontal, Plus, SeparatorHorizontal, Trash2, Type, Wand2, X } from 'lucide-react';
import type { AVRow } from '@/types';
import { useSpace } from '@/store/space';
import { FORMAT_BY_ID, PLATFORM_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import type { ContentPiece } from '@/spaces/types';
import { formatSeconds, parseDuration } from '@/lib/format';
import { uid } from '@/lib/id';
import { truncate, wordCount } from '@/lib/text';
import { Button, IconButton, Menu, Tabs, Textarea, confirmDialog, toast, type MenuItem } from '@/ui';
import { SCRIPT_STRUCTURES, WPM, avTiming, hasParts, isHeading, parseTarget, scriptSections, secondsForWords, splitParts, spokenWords, structureForFormat, structureText } from './script';
import { assign, patchContent, updateContent } from './shared';

type Mode = 'script' | 'av' | 'copy';

/** Remember the chosen editor per piece for the session. */
const modeMemory = new Map<string, Mode>();

function defaultMode(c: ContentPiece): Mode {
  const f = FORMAT_BY_ID[c.format];
  if (f?.text) return c.script?.trim() && !c.copy?.trim() ? 'script' : 'copy';
  if (c.avRows?.length && !c.script?.trim()) return 'av';
  if (f?.video || f?.audio) return 'script';
  if (c.copy?.trim()) return 'copy';
  return c.script?.trim() ? 'script' : c.format === 'story' ? 'script' : 'copy';
}

export function WriteTab({ c }: { c: ContentPiece }) {
  const [mode, setModeState] = useState<Mode>(() => modeMemory.get(c.id) ?? defaultMode(c));
  const setMode = (m: Mode) => {
    modeMemory.set(c.id, m);
    setModeState(m);
  };
  const words = spokenWords(c.script);
  const avCount = c.avRows?.length ?? 0;
  const chars = c.copy?.length ?? 0;
  return (
    <div className="sp-content-tab sp-content-write">
      <div className="sp-content-write-modes">
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'script', label: 'Script', icon: FileText, count: words || undefined },
            { id: 'av', label: 'Two-column (visual | audio)', icon: Columns2, count: avCount || undefined },
            { id: 'copy', label: 'Copy', icon: Type, count: chars || undefined },
          ]}
        />
      </div>
      {mode === 'script' && <ScriptEditor c={c} />}
      {mode === 'av' && <AVEditor c={c} onUseScript={() => setMode('script')} />}
      {mode === 'copy' && <CopyEditor c={c} />}
    </div>
  );
}

/* ---------------------------------------------------------------- length meter */

function LengthMeter({ seconds, words, length, estimated }: { seconds: number; words: number; length?: string; estimated?: boolean }) {
  const target = parseTarget(length);
  const pct = target.seconds ? seconds / target.seconds : target.words ? words / target.words : undefined;
  const over = pct != null && pct > 1.08;
  const under = pct != null && pct < 0.6;
  return (
    <div className="sp-content-meter">
      <span className="sp-content-meter-item">
        <strong>{words.toLocaleString()}</strong> word{words === 1 ? '' : 's'}
      </span>
      <span className="sp-content-meter-item" title={`Estimated at ${WPM} words per minute`}>
        <Clock size={12} /> <strong>{formatSeconds(seconds) || '0:00'}</strong> {estimated === false ? '' : 'spoken'}
      </span>
      {pct != null && (
        <span className={`sp-content-meter-target ${over ? 'over' : under ? 'under' : 'ok'}`}>
          <span className="bar">
            <span style={{ width: `${Math.min(100, pct * 100)}%` }} />
          </span>
          {target.seconds
            ? over
              ? `${formatSeconds(seconds - target.seconds)} over ${formatSeconds(target.seconds)}`
              : `of ${formatSeconds(target.seconds)} target`
            : over
              ? `${(words - target.words!).toLocaleString()} words over ${target.words!.toLocaleString()}`
              : `of ${target.words!.toLocaleString()} words`}
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- script */

function ScriptEditor({ c }: { c: ContentPiece }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const text = c.script ?? '';
  const words = useMemo(() => spokenWords(text), [text]);
  const sections = useMemo(() => scriptSections(text), [text]);
  const seconds = secondsForWords(words);
  const preferred = structureForFormat(c.format);
  const structures = useMemo(() => [...SCRIPT_STRUCTURES].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0)), [preferred]);

  useLayoutEffect(() => {
    const pos = pendingCaret.current;
    const el = ref.current;
    if (pos == null || !el) return;
    pendingCaret.current = null;
    el.focus();
    el.setSelectionRange(pos, pos);
  }, [text]);

  const setText = (v: string) => patchContent(c.id, { script: v || undefined }, 'script');

  const insert = (snippet: string) => {
    const cur = c.script ?? '';
    // caret goes below the first heading (and its [direction] line, if any)
    const first = snippet.indexOf('\n');
    const second = snippet.indexOf('\n', first + 1);
    const inSnippet = (/^\s*\[/.test(snippet.slice(first + 1)) && second > 0 ? second : first) + 1;
    if (!cur.trim()) {
      pendingCaret.current = inSnippet;
      patchContent(c.id, { script: snippet });
      return;
    }
    const at = Math.max(0, Math.min(cur.length, caret.current ?? cur.length));
    const before = cur.slice(0, at);
    const after = cur.slice(at);
    const pre = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const post = after && !after.startsWith('\n') ? '\n\n' : '';
    const next = before + pre + snippet.trimEnd() + post + after;
    pendingCaret.current = (before + pre).length + inSnippet;
    patchContent(c.id, { script: next });
  };

  const jump = (offset: number) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const lineEnd = text.indexOf('\n', offset);
    const pos = lineEnd < 0 ? text.length : lineEnd + 1;
    el.setSelectionRange(pos, pos);
    const lines = text.slice(0, offset).split('\n').length - 1;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const scroller = el.closest('.sp-content-ed-body') as HTMLElement | null;
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, top + lines * lh - 90), behavior: 'smooth' });
    }
  };

  const remember = () => {
    if (ref.current) caret.current = ref.current.selectionStart;
  };

  const structureItems = (): MenuItem[] => [
    { header: 'Insert at the cursor' },
    ...structures.map((s) => ({ label: `${s.label} — ${s.hint}`, icon: LayoutTemplate, onClick: () => insert(structureText(s)) })),
    { separator: true },
    { label: 'Section heading', icon: Heading, onClick: () => insert('NEW SECTION\n\n') },
  ];

  return (
    <div className="sp-content-script">
      <div className="sp-content-write-bar">
        <Menu trigger={<Button size="sm" icon={Wand2}>Insert structure</Button>} items={structureItems} />
        <div className="spacer" />
        <LengthMeter seconds={seconds} words={words} length={c.length} />
      </div>
      {sections.length > 1 || (sections.length === 1 && sections[0].title) ? (
        <div className="sp-content-sections" aria-label="Sections">
          {sections.map((s, i) => (
            <button key={`${s.offset}-${i}`} type="button" className="sp-content-section-chip" onClick={() => jump(s.offset)} title={`${s.words} spoken words`}>
              <span className="ellipsis">{s.title ? s.title.replace(/\s*\([^)]*\)\s*$/, '') : 'Intro'}</span>
              <span className="t">{s.seconds ? formatSeconds(s.seconds) : '—'}</span>
            </button>
          ))}
        </div>
      ) : null}
      <Textarea
        ref={ref}
        autoGrow
        minRows={16}
        className="sp-content-script-text"
        value={text}
        placeholder={'Write the script…\n\nTip: lines in CAPITALS (HOOK, SETUP, CTA …) start sections. [Directions in brackets] and (parentheticals) are not counted as spoken words.'}
        onChange={setText}
        onSelect={remember}
        onBlur={remember}
        onKeyUp={remember}
        spellCheck
        aria-label="Script"
      />
      <div className="sp-content-hint">
        <span>Spoken words are counted at {WPM} wpm.</span>
        {c.length ? null : <span>Set a target length in the Brief to compare.</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- A/V */

type AVField = 'video' | 'audio' | 'duration' | 'segment';

function AVEditor({ c, onUseScript }: { c: ContentPiece; onUseScript: () => void }) {
  const rows = c.avRows ?? [];
  const timing = useMemo(() => avTiming(rows), [rows]);
  const rootRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: string; field: AVField } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || !rootRef.current) return;
    pending.current = null;
    const el = rootRef.current.querySelector(`[data-av-row="${window.CSS.escape(p.id)}"] [data-av-field="${p.field}"]`) as HTMLTextAreaElement | HTMLInputElement | null;
    el?.focus();
  }, [rows]);

  const edit = (fn: (list: AVRow[]) => void, field?: string) =>
    updateContent(
      c.id,
      (x) => {
        if (!x.avRows) x.avRows = [];
        fn(x.avRows as AVRow[]);
      },
      field,
    );

  const updateRow = (id: string, patch: Partial<AVRow>, field?: AVField) =>
    edit((list) => {
      const r = list.find((x) => x.id === id);
      if (r) assign(r, patch);
    }, field ? `av:${id}:${field}` : undefined);

  const addAfter = (id: string | null, focus: AVField = 'video') => {
    const row: AVRow = { id: uid('av'), video: '', audio: '' };
    edit((list) => {
      const i = id ? list.findIndex((r) => r.id === id) : -1;
      list.splice(i < 0 ? list.length : i + 1, 0, row);
    });
    pending.current = { id: row.id, field: focus };
  };

  const remove = async (r: AVRow) => {
    if (r.video.trim() || r.audio.trim()) {
      const ok = await confirmDialog({ title: 'Delete row?', message: truncate(r.audio.trim() || r.video.trim(), 120), confirmLabel: 'Delete', danger: true });
      if (!ok) return;
    }
    edit((list) => {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list.splice(i, 1);
    });
  };

  const move = (id: string, dir: -1 | 1, field?: AVField) => {
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    edit((list) => {
      const [r] = list.splice(i, 1);
      list.splice(j, 0, r);
    });
    if (field) pending.current = { id, field };
  };

  const duplicate = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const copy: AVRow = { ...JSON.parse(JSON.stringify(r)), id: uid('av') };
    edit((list) => {
      const i = list.findIndex((x) => x.id === id);
      list.splice(i + 1, 0, copy);
    });
    pending.current = { id: copy.id, field: 'video' };
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.id === active.id);
    const to = rows.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    edit((list) => {
      const next = arrayMove(list, from, to);
      list.splice(0, list.length, ...next);
    });
  };

  const fromScript = async () => {
    const built = scriptToRows(c.script ?? '');
    if (!built.length) {
      toast('The script is empty', 'info');
      return;
    }
    if (rows.length) {
      const ok = await confirmDialog({ title: 'Add rows from the script?', message: `${built.length} row${built.length === 1 ? '' : 's'} will be added below the existing ${rows.length}.`, confirmLabel: 'Add rows' });
      if (!ok) return;
    }
    edit((list) => void list.push(...built));
    toast(`Added ${built.length} row${built.length === 1 ? '' : 's'} from the script`);
  };

  const target = parseTarget(c.length);

  if (!rows.length) {
    return (
      <div className="sp-content-av-empty">
        <Columns2 size={22} />
        <h4>Two-column script</h4>
        <p>Plan picture and sound side by side: what we see on the left, what we hear on the right, with a duration per beat.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <Button variant="primary" icon={Plus} onClick={() => addAfter(null)}>
            Add the first row
          </Button>
          {c.script?.trim() ? (
            <Button icon={Wand2} onClick={fromScript}>
              Build from the script
            </Button>
          ) : (
            <Button variant="ghost" onClick={onUseScript}>
              Write a script first
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sp-content-av" ref={rootRef}>
      <div className="sp-content-write-bar">
        <Button size="sm" icon={Plus} onClick={() => addAfter(rows[rows.length - 1]?.id ?? null)}>
          Add row
        </Button>
        {c.script?.trim() && (
          <Button size="sm" variant="ghost" icon={Wand2} onClick={fromScript}>
            Add rows from script
          </Button>
        )}
        <div className="spacer" />
        <LengthMeter seconds={timing.total} words={rows.reduce((n, r) => n + spokenWords(r.audio), 0)} length={target.seconds ? c.length : undefined} />
      </div>
      <div className="sp-content-av-head">
        <span />
        <span>Visual</span>
        <span>Audio</span>
        <span className="r">Time</span>
        <span />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {rows.map((r, i) => (
            <AVRowView
              key={r.id}
              row={r}
              index={i}
              count={rows.length}
              estimate={timing.rows[i]}
              onChange={updateRow}
              onAddAfter={addAfter}
              onMove={move}
              onDuplicate={duplicate}
              onRemove={remove}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" className="sp-content-av-add" onClick={() => addAfter(rows[rows.length - 1]?.id ?? null)}>
        <Plus size={14} /> Add row <span className="muted">(Ctrl+Enter in a row)</span>
      </button>
      <div className="sp-content-av-total">
        <span>
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <span className="spacer" />
        <span>Total {timing.estimated ? '(incl. estimates)' : ''}</span>
        <strong>{formatSeconds(timing.total) || '0:00'}</strong>
      </div>
    </div>
  );
}

function AVRowView({
  row,
  index,
  count,
  estimate,
  onChange,
  onAddAfter,
  onMove,
  onDuplicate,
  onRemove,
}: {
  row: AVRow;
  index: number;
  count: number;
  estimate?: { seconds: number; estimated: boolean };
  onChange: (id: string, patch: Partial<AVRow>, field?: AVField) => void;
  onAddAfter: (id: string | null, focus?: AVField) => void;
  onMove: (id: string, dir: -1 | 1, field?: AVField) => void;
  onDuplicate: (id: string) => void;
  onRemove: (r: AVRow) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: 'relative' };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const field = ((e.target as HTMLElement).closest('[data-av-field]') as HTMLElement | null)?.dataset.avField as AVField | undefined;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      onAddAfter(row.id, 'video');
    } else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onMove(row.id, e.key === 'ArrowUp' ? -1 : 1, field);
    }
  };

  const items = (): MenuItem[] => [
    { label: 'Add row below', icon: Plus, shortcut: 'Ctrl+Enter', onClick: () => onAddAfter(row.id) },
    row.segment == null ? { label: 'Add segment title', icon: Heading, onClick: () => onChange(row.id, { segment: '' }) } : { label: 'Remove segment title', icon: Heading, onClick: () => onChange(row.id, { segment: undefined }) },
    { separator: true },
    { label: 'Move up', icon: ArrowUp, shortcut: 'Alt+↑', disabled: index === 0, onClick: () => onMove(row.id, -1) },
    { label: 'Move down', icon: ArrowDown, shortcut: 'Alt+↓', disabled: index === count - 1, onClick: () => onMove(row.id, 1) },
    { label: 'Duplicate', icon: Copy, onClick: () => onDuplicate(row.id) },
    { separator: true },
    { label: 'Delete row', icon: Trash2, danger: true, onClick: () => onRemove(row) },
  ];

  return (
    <div ref={setNodeRef} style={style} className={`sp-content-av-wrap ${isDragging ? 'dragging' : ''}`} data-av-row={row.id} onKeyDown={onKey}>
      {row.segment != null && (
        <div className="sp-content-av-seg">
          <input className="sp-content-av-seg-input" value={row.segment} placeholder="SEGMENT TITLE" data-av-field="segment" onChange={(e) => onChange(row.id, { segment: e.target.value }, 'segment')} aria-label="Segment title" autoFocus={!row.segment} />
          <IconButton icon={X} size="sm" label="Remove segment title" onClick={() => onChange(row.id, { segment: undefined })} />
        </div>
      )}
      <div className="sp-content-av-row">
        <div className="sp-content-av-num">
          <button type="button" ref={setActivatorNodeRef} className="sp-content-grip" {...attributes} {...listeners} aria-label={`Drag row ${index + 1}`} title="Drag to reorder">
            <GripVertical size={14} />
          </button>
          <span>{index + 1}</span>
        </div>
        <Textarea bare autoGrow minRows={2} className="sp-content-av-text" value={row.video} placeholder="What we see: shot, B-roll, on-screen text…" data-av-field="video" onChange={(v) => onChange(row.id, { video: v }, 'video')} aria-label="Visual" />
        <Textarea bare autoGrow minRows={2} className="sp-content-av-text audio" value={row.audio} placeholder="What we hear: voice-over, dialogue, music, SFX…" data-av-field="audio" onChange={(v) => onChange(row.id, { audio: v }, 'audio')} aria-label="Audio" />
        <DurationField value={row.duration} suggested={estimate?.estimated ? estimate.seconds : undefined} onChange={(v) => onChange(row.id, { duration: v })} />
        <div className="sp-content-av-actions">
          <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label="Row actions" />} items={items} />
        </div>
      </div>
    </div>
  );
}

function DurationField({ value, suggested, onChange }: { value?: number; suggested?: number; onChange: (v: number | undefined) => void }) {
  const show = (v?: number) => (v == null ? '' : formatSeconds(v));
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : show(value);
  const commit = () => {
    const t = text.trim();
    if (!t) {
      if (value != null) onChange(undefined);
      return;
    }
    const s = parseDuration(t);
    if (s != null && s >= 0 && Math.round(s) !== value) onChange(Math.round(s));
  };
  return (
    <input
      className="input bare sm sp-content-av-dur"
      value={shown}
      placeholder={suggested ? `~${formatSeconds(suggested)}` : '0:00'}
      title={suggested ? `Estimated from the audio at ${WPM} wpm. Type a duration (m:ss) to set it.` : 'Duration (m:ss)'}
      data-av-field="duration"
      inputMode="numeric"
      onFocus={(e) => {
        setFocused(true);
        setText(show(value));
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
        }
      }}
      aria-label="Duration"
    />
  );
}

/** Script → A/V rows: headings become segment titles, [directions] go to the visual column, each paragraph is a row. */
function scriptToRows(script: string): AVRow[] {
  const out: AVRow[] = [];
  let segment: string | undefined;
  const paragraphs: { segment?: string; lines: string[] }[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.some((l) => l.trim())) paragraphs.push({ segment, lines: cur });
    if (cur.some((l) => l.trim())) segment = undefined;
    cur = [];
  };
  for (const line of script.split('\n')) {
    if (isHeading(line)) {
      flush();
      segment = line.trim();
    } else if (!line.trim()) flush();
    else cur.push(line);
  }
  flush();
  for (const p of paragraphs) {
    const video: string[] = [];
    const audio: string[] = [];
    for (const l of p.lines) {
      const m = /^\s*\[([^\]]*)\]\s*$/.exec(l);
      if (m) video.push(m[1].trim());
      else audio.push(l.trim());
    }
    const row: AVRow = { id: uid('av'), video: video.join('\n'), audio: audio.join('\n') };
    if (p.segment) row.segment = p.segment;
    out.push(row);
  }
  return out;
}

/* ---------------------------------------------------------------- copy */

function CopyEditor({ c }: { c: ContentPiece }) {
  const channels = useSpace((s) => s.channels) ?? [];
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const copy = c.copy ?? '';
  const isCarousel = c.format === 'carousel';
  const parted = isCarousel || hasParts(copy);
  const parts = useMemo(() => (parted ? splitParts(copy) : []), [parted, copy]);
  const words = useMemo(() => wordCount(copy), [copy]);
  const limits = useMemo(() => {
    const ids = new Set(c.posts.map((p) => p.channelId));
    const seen = new Set<string>();
    const out: { name: string; color: string; limit: number }[] = [];
    for (const ch of channels) {
      if (!ids.has(ch.id)) continue;
      const limit = PLATFORM_BY_ID[ch.platform]?.captionLimit;
      if (!limit || seen.has(ch.platform)) continue;
      seen.add(ch.platform);
      out.push({ name: PLATFORM_BY_ID[ch.platform].label, color: channelColor(ch), limit });
    }
    return out.sort((a, b) => a.limit - b.limit);
  }, [c.posts, channels]);
  const partLabel = isCarousel ? 'Slide' : 'Part';
  const longest = parts.reduce((m, p) => Math.max(m, p.length), 0);

  const insertBreak = () => {
    const at = Math.max(0, Math.min(copy.length, caret.current ?? copy.length));
    const before = copy.slice(0, at).replace(/\n*$/, '');
    const after = copy.slice(at).replace(/^\n*/, '');
    const next = `${before}${before ? '\n' : ''}---\n${after}`;
    patchContent(c.id, { copy: next });
    const pos = `${before}${before ? '\n' : ''}---\n`.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const remember = () => {
    if (ref.current) caret.current = ref.current.selectionStart;
  };

  return (
    <div className="sp-content-copy">
      <div className="sp-content-write-bar">
        {(isCarousel || c.format === 'text') && (
          <Button size="sm" icon={SeparatorHorizontal} onClick={insertBreak} title={`Insert a line with --- to start a new ${partLabel.toLowerCase()}`}>
            New {isCarousel ? 'slide' : 'part'}
          </Button>
        )}
        <div className="spacer" />
        <div className="sp-content-meter">
          <span className="sp-content-meter-item">
            <strong>{copy.length.toLocaleString()}</strong> characters
          </span>
          <span className="sp-content-meter-item">
            <strong>{words.toLocaleString()}</strong> words
          </span>
          {words > 150 && <span className="sp-content-meter-item">~{Math.max(1, Math.round(words / 230))} min read</span>}
          {parted && (
            <span className="sp-content-meter-item">
              <strong>{parts.length}</strong> {isCarousel ? (parts.length === 1 ? 'slide' : 'slides') : parts.length === 1 ? 'part' : 'parts'}
            </span>
          )}
          {c.length && (
            <span className="sp-content-meter-item muted" title="Target length from the Brief">
              target {c.length}
            </span>
          )}
        </div>
      </div>
      {limits.length > 0 && (
        <div className="sp-content-limits">
          {limits.map((l) => {
            const n = parted ? longest : copy.length;
            const over = n > l.limit;
            return (
              <span key={l.name} className={`sp-content-limit ${over ? 'over' : ''}`} title={parted ? `Longest ${partLabel.toLowerCase()} vs the ${l.name} limit` : `${l.name} caption limit`}>
                <span className="color-dot" style={{ background: l.color, width: 8, height: 8 }} />
                {l.name}
                <strong>
                  {n.toLocaleString()} / {l.limit.toLocaleString()}
                </strong>
              </span>
            );
          })}
        </div>
      )}
      <Textarea
        ref={ref}
        autoGrow
        minRows={14}
        className="sp-content-copy-text"
        value={copy}
        placeholder={
          isCarousel
            ? 'Slide 1: the hook\n---\nSlide 2\n---\nSlide 3 …\n\nA line with only --- starts a new slide.'
            : c.format === 'text'
              ? 'Write the post. For a thread, put --- on its own line between posts.'
              : 'Write the copy…'
        }
        onChange={(v) => patchContent(c.id, { copy: v || undefined }, 'copy')}
        onSelect={remember}
        onBlur={remember}
        onKeyUp={remember}
        spellCheck
        aria-label="Copy"
      />
      {parted && parts.some((p) => p) && (
        <div className="sp-content-slides" aria-label={`${partLabel}s`}>
          {parts.map((p, i) => {
            const minLimit = limits[0]?.limit;
            return (
              <div key={i} className={`sp-content-slide ${minLimit && p.length > minLimit ? 'over' : ''} ${p ? '' : 'empty'}`}>
                <div className="sp-content-slide-head">
                  <span>
                    {partLabel} {i + 1}
                  </span>
                  <span>{p.length}</span>
                </div>
                <div className="sp-content-slide-text">{p ? truncate(p, 140) : 'Empty'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
