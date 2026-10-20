/* Content editor › Produce: shoot day (synced with ShootSession.contentIds),
   edit due, location / talent / gear, shot list, checklist and images. */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, Clapperboard, ExternalLink, GripVertical, ListChecks, MapPin, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import type { ID } from '@/types';
import { navigateSpace } from '@/store/app';
import { updateSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { SHOT_KINDS } from '@/spaces/constants';
import { defaultChecklist, makeChecklistItem, makeShoot, makeShot } from '@/spaces/defaults';
import { closeContent } from '@/spaces/ui';
import type { ContentPiece, ContentShot, ShotKind } from '@/spaces/types';
import { aspectToNumber } from '@/lib/constants';
import { formatSeconds } from '@/lib/format';
import { Button, Checkbox, Combo, DateInput, Field, IconButton, ImageDrop, Input, NumberInput, Progress, Select, Textarea, confirmDialog, promptDialog, toast } from '@/ui';
import { assign, checklistProgress, linkShoot, patchContent, updateContent, withMissing } from './shared';

const NEW_SHOOT = '__new_shoot__';
const FRAMINGS = ['Wide', 'Medium', 'MCU', 'Close-up', 'ECU', 'Over the shoulder', 'POV', 'Top-down', 'Insert', 'Two-shot', 'Handheld', 'Gimbal walk', 'Drone'];

export function ProduceTab({ c }: { c: ContentPiece }) {
  const shoots = useSpace((s) => s.shoots) ?? [];
  const fmt = useSpaceFormatters();
  const shoot = c.shootId ? shoots.find((s) => s.id === c.shootId) : undefined;
  const set = (patch: Partial<ContentPiece>, field: string) => patchContent(c.id, patch, field);

  const shootOptions = useMemo(() => {
    const list = [...shoots]
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
      .map((s) => ({ value: s.id, label: `${s.title || 'Shoot day'}${s.date ? ` · ${fmt.dateMedium(s.date)}` : ''}` }));
    return [...withMissing(list, c.shootId, 'Deleted shoot day'), { value: NEW_SHOOT, label: 'New shoot day…' }];
  }, [shoots, fmt, c.shootId]);

  const pickShoot = async (v: string) => {
    if (v === NEW_SHOOT) {
      const title = await promptDialog({
        title: 'New shoot day',
        message: 'Batch several pieces into one filming day. You can add more pieces to it from the Production screen.',
        defaultValue: c.shootDate ? `Shoot day — ${fmt.dateMedium(c.shootDate)}` : 'Shoot day',
        confirmLabel: 'Create',
      });
      if (title == null) return;
      const s = makeShoot({ title: title.trim() || 'Shoot day' });
      if (c.shootDate) s.date = c.shootDate;
      if (c.location) s.location = c.location;
      updateSpace((d) => {
        d.shoots.push(s);
        linkShoot(d, c.id, s.id);
      });
      toast(`Created “${s.title}”`);
      return;
    }
    updateSpace((d) => linkShoot(d, c.id, v || undefined));
  };

  const others = shoot ? shoot.contentIds.filter((x) => x !== c.id).length : 0;
  const mismatch = shoot?.date && c.shootDate && shoot.date !== c.shootDate;

  return (
    <div className="sp-content-tab sp-content-produce">
      <section className="sp-content-sec">
        <h4 className="sp-content-sec-title">Shoot & schedule</h4>
        <div className="sp-content-3col">
          <Field label="Shoot date">
            <DateInput value={c.shootDate} onChange={(v) => set({ shootDate: v }, 'shootDate')} />
          </Field>
          <Field label="Shoot day (batch)">
            <Select value={c.shootId ?? ''} options={shootOptions} placeholder="Not in a shoot day" onChange={(v) => void pickShoot(v)} />
          </Field>
          <Field label="Edit due">
            <DateInput value={c.editDue} onChange={(v) => set({ editDue: v }, 'editDue')} />
          </Field>
        </div>
        {shoot && (
          <div className="sp-content-shootbox">
            <Clapperboard size={16} />
            <div className="grow">
              <div className="strong">{shoot.title || 'Shoot day'}</div>
              <div className="muted small row wrap" style={{ gap: 10 }}>
                {shoot.date && (
                  <span className="row" style={{ gap: 4 }}>
                    <CalendarClock size={12} />
                    {fmt.dateLong(shoot.date)}
                    {shoot.callTime ? ` · call ${fmt.time(shoot.callTime)}` : ''}
                  </span>
                )}
                {shoot.location && (
                  <span className="row" style={{ gap: 4 }}>
                    <MapPin size={12} />
                    {shoot.location}
                  </span>
                )}
                <span>{others ? `with ${others} other piece${others === 1 ? '' : 's'}` : 'only this piece so far'}</span>
              </div>
              {mismatch && (
                <div className="sp-content-warn">
                  <TriangleAlert size={12} /> The shoot day is on {fmt.dateMedium(shoot.date)}.
                  <button type="button" className="sp-content-linkbtn" onClick={() => set({ shootDate: shoot.date }, 'shootDate')}>
                    Use that date
                  </button>
                </div>
              )}
            </div>
            <Button
              size="sm"
              icon={ExternalLink}
              onClick={() => {
                closeContent();
                navigateSpace('production', { shootId: shoot.id });
              }}
            >
              Open in Production
            </Button>
          </div>
        )}
        <div className="sp-content-3col" style={{ marginTop: 12 }}>
          <Field label="Location">
            <Input value={c.location} placeholder="Studio, home office, street…" onChange={(v) => set({ location: v || undefined }, 'location')} />
          </Field>
          <Field label="Talent / on camera">
            <Input value={c.talent} placeholder="Who appears" onChange={(v) => set({ talent: v || undefined }, 'talent')} />
          </Field>
          <Field label="Gear">
            <Textarea autoGrow minRows={1} value={c.gear} placeholder="Camera, lenses, lights, mic…" onChange={(v) => set({ gear: v || undefined }, 'gear')} />
          </Field>
        </div>
      </section>

      <ShotList c={c} />
      <Checklist c={c} />
      <Images c={c} />
    </div>
  );
}

/* ---------------------------------------------------------------- shot list */

type ShotField = 'description' | 'framing' | 'location';

function ShotList({ c }: { c: ContentPiece }) {
  const shots = c.shots ?? [];
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: ID; field: ShotField } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || !rootRef.current) return;
    pending.current = null;
    (rootRef.current.querySelector(`[data-shot-id="${window.CSS.escape(p.id)}"] [data-f="${p.field}"]`) as HTMLInputElement | null)?.focus();
  }, [shots]);

  const edit = (fn: (list: ContentShot[]) => void, field?: string) => updateContent(c.id, (x) => fn(x.shots as ContentShot[]), field);
  const upd = (id: ID, patch: Partial<ContentShot>, field?: string) =>
    edit((list) => {
      const s = list.find((x) => x.id === id);
      if (s) assign(s, patch);
    }, field ? `shot:${id}:${field}` : undefined);

  const add = (afterId: ID | null, description = '', focus = true) => {
    const prev = afterId ? shots.find((s) => s.id === afterId) : shots[shots.length - 1];
    const s = makeShot({ description, kind: prev?.kind ?? (c.format === 'long_video' || c.format === 'short_video' ? 'a_roll' : 'b_roll') });
    if (prev?.location) s.location = prev.location;
    edit((list) => {
      const i = afterId ? list.findIndex((x) => x.id === afterId) : -1;
      list.splice(i < 0 ? list.length : i + 1, 0, s);
    });
    if (focus) pending.current = { id: s.id, field: 'description' };
  };

  const remove = (id: ID, focusPrev = false) => {
    const i = shots.findIndex((s) => s.id === id);
    edit((list) => {
      const j = list.findIndex((x) => x.id === id);
      if (j >= 0) list.splice(j, 1);
    });
    if (focusPrev && i > 0) pending.current = { id: shots[i - 1].id, field: 'description' };
  };

  const move = (id: ID, dir: -1 | 1) => {
    const i = shots.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shots.length) return;
    edit((list) => {
      const [s] = list.splice(i, 1);
      list.splice(j, 0, s);
    });
    pending.current = { id, field: 'description' };
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = shots.findIndex((s) => s.id === active.id);
    const to = shots.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    edit((list) => {
      const next = arrayMove(list, from, to);
      list.splice(0, list.length, ...next);
    });
  };

  const done = shots.filter((s) => s.done).length;
  const total = shots.reduce((n, s) => n + (s.duration ?? 0), 0);

  return (
    <section className="sp-content-sec" ref={rootRef}>
      <div className="sp-content-sec-head">
        <h4 className="sp-content-sec-title">Shot list</h4>
        {shots.length > 0 && (
          <span className="muted small">
            {shots.length} shot{shots.length === 1 ? '' : 's'} · {done} done{total ? ` · ${formatSeconds(total)}` : ''}
          </span>
        )}
      </div>
      {shots.length > 0 && (
        <div className="sp-content-shots">
          <div className="sp-content-shot sp-content-shot-head">
            <span />
            <span />
            <span>#</span>
            <span>Kind</span>
            <span>Description</span>
            <span>Framing</span>
            <span className="r">Sec</span>
            <span>Location</span>
            <span />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {shots.map((s, i) => (
                <ShotRow key={s.id} shot={s} index={i} onChange={upd} onAddAfter={(id) => add(id)} onRemove={remove} onMove={move} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      <div className="sp-content-addline">
        <Plus size={14} />
        <input
          className="input sm"
          value={draft}
          placeholder={shots.length ? 'Add a shot… (Enter)' : 'Describe the first shot, e.g. “Wide: me walking into the studio” (Enter)'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!draft.trim()) return;
              add(null, draft.trim(), false);
              setDraft('');
            }
          }}
          aria-label="Add a shot"
        />
      </div>
    </section>
  );
}

function ShotRow({
  shot,
  index,
  onChange,
  onAddAfter,
  onRemove,
  onMove,
}: {
  shot: ContentShot;
  index: number;
  onChange: (id: ID, patch: Partial<ContentShot>, field?: string) => void;
  onAddAfter: (id: ID) => void;
  onRemove: (id: ID, focusPrev?: boolean) => void;
  onMove: (id: ID, dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: 'relative' };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sp-content-shot ${shot.done ? 'done' : ''} ${isDragging ? 'dragging' : ''}`}
      data-shot-id={shot.id}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          onMove(shot.id, e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      <button type="button" ref={setActivatorNodeRef} className="sp-content-grip" {...attributes} {...listeners} aria-label={`Drag shot ${index + 1}`} title="Drag to reorder (Alt+↑/↓)">
        <GripVertical size={14} />
      </button>
      <Checkbox checked={shot.done} onChange={(v) => onChange(shot.id, { done: v || undefined })} title="Shot done" />
      <span className="sp-content-shot-num">{index + 1}</span>
      <Select bare size="sm" value={shot.kind ?? ''} options={SHOT_KINDS} placeholder="—" onChange={(v) => onChange(shot.id, { kind: (v || undefined) as ShotKind | undefined })} aria-label="Kind" />
      <Input
        bare
        size="sm"
        value={shot.description}
        placeholder="What we film"
        data-f="description"
        onChange={(v) => onChange(shot.id, { description: v }, 'description')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAddAfter(shot.id);
          } else if (e.key === 'Backspace' && !shot.description && !shot.framing && !shot.location && shot.duration == null) {
            e.preventDefault();
            onRemove(shot.id, true);
          }
        }}
        aria-label="Description"
      />
      <Combo bare size="sm" value={shot.framing} suggestions={FRAMINGS} placeholder="Framing" data-f="framing" onChange={(v) => onChange(shot.id, { framing: v || undefined }, 'framing')} aria-label="Framing" />
      <NumberInput bare size="sm" value={shot.duration} placeholder="—" onChange={(v) => onChange(shot.id, { duration: v }, 'duration')} aria-label="Duration in seconds" />
      <Input bare size="sm" value={shot.location} placeholder="Location" data-f="location" onChange={(v) => onChange(shot.id, { location: v || undefined }, 'location')} aria-label="Location" />
      <IconButton icon={Trash2} size="sm" label="Delete shot" onClick={() => onRemove(shot.id)} />
    </div>
  );
}

/* ---------------------------------------------------------------- checklist */

function Checklist({ c }: { c: ContentPiece }) {
  const list = c.checklist ?? [];
  const [draft, setDraft] = useState('');
  const prog = checklistProgress(c);
  const edit = (fn: (x: ContentPiece['checklist']) => void, field?: string) => updateContent(c.id, (x) => fn(x.checklist as ContentPiece['checklist']), field);

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Reset the checklist?',
      message: 'The checklist is replaced with the default steps for this format. Ticks and custom items are removed.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (ok) edit((x) => void x.splice(0, x.length, ...defaultChecklist(c.format)));
  };

  return (
    <section className="sp-content-sec">
      <div className="sp-content-sec-head">
        <h4 className="sp-content-sec-title">
          <ListChecks size={13} /> Checklist
        </h4>
        {prog.total > 0 && (
          <span className="muted small">
            {prog.done} of {prog.total} done
          </span>
        )}
        <div className="spacer" />
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>
          Reset to default
        </Button>
      </div>
      {prog.total > 0 && <Progress value={prog.done / prog.total} color={prog.done === prog.total ? 'var(--success)' : undefined} style={{ marginBottom: 8 }} />}
      <div className="sp-content-checklist">
        {list.map((item) => (
          <div key={item.id} className={`sp-content-check-item ${item.done ? 'done' : ''}`}>
            <Checkbox
              checked={item.done}
              onChange={(v) =>
                edit((x) => {
                  const it = x.find((i) => i.id === item.id);
                  if (it) assign(it, { done: v || undefined });
                })
              }
            />
            <Input
              bare
              size="sm"
              value={item.text}
              onChange={(v) =>
                edit((x) => {
                  const it = x.find((i) => i.id === item.id);
                  if (it) it.text = v;
                }, `chk:${item.id}`)
              }
              aria-label="Checklist item"
            />
            <IconButton
              icon={Trash2}
              size="sm"
              label="Delete item"
              onClick={() =>
                edit((x) => {
                  const i = x.findIndex((y) => y.id === item.id);
                  if (i >= 0) x.splice(i, 1);
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="sp-content-addline">
        <Plus size={14} />
        <input
          className="input sm"
          value={draft}
          placeholder="Add a to-do… (Enter)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const t = draft.trim();
              if (!t) return;
              edit((x) => void x.push(makeChecklistItem(t)));
              setDraft('');
            }
          }}
          aria-label="Add checklist item"
        />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- images */

function Images({ c }: { c: ContentPiece }) {
  const images = c.images ?? [];
  const aspect = aspectToNumber(c.aspect);
  const editImages = (fn: (list: string[]) => void) =>
    updateContent(c.id, (x) => {
      const list = [...(x.images ?? [])];
      fn(list);
      if (list.length) x.images = list;
      else delete x.images;
    });
  return (
    <section className="sp-content-sec">
      <h4 className="sp-content-sec-title">Images</h4>
      <div className="sp-content-images">
        <Field label="Thumbnail / cover" className="sp-content-thumb-field">
          <div style={{ maxWidth: aspect < 1 ? 170 : 300 }}>
            <ImageDrop value={c.thumbnail} aspect={Math.max(0.5, Math.min(2, aspect))} onChange={(v) => patchContent(c.id, { thumbnail: v })} label="Drop the thumbnail" />
          </div>
        </Field>
        <Field label={`References, frames & slides${images.length ? ` (${images.length})` : ''}`} className="grow">
          <div className="sp-content-gallery">
            {images.map((name, i) => (
              <div key={`${name}-${i}`} className="sp-content-gallery-item">
                <ImageDrop
                  value={name}
                  aspect={1}
                  onChange={(v) =>
                    editImages((list) => {
                      if (v) list[i] = v;
                      else list.splice(i, 1);
                    })
                  }
                />
              </div>
            ))}
            <div className="sp-content-gallery-item add">
              <ImageDrop value={undefined} aspect={1} label="Add images" onChange={(v) => v && editImages((list) => void list.push(v))} onMultiple={(names) => editImages((list) => void list.push(...names))} />
            </div>
          </div>
          <span className="hint">Drop several images at once, or paste (Ctrl+V).</span>
        </Field>
      </div>
    </section>
  );
}
