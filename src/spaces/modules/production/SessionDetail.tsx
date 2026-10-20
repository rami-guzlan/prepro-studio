/* Detail of one shoot session: logistics, run of show (pieces to film, drag to
   reorder), combined shot list, checklist and notes. */
import { useMemo, useState, type CSSProperties } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CalendarDays,
  CheckCheck,
  CircleCheck,
  Clock,
  Copy,
  Ellipsis,
  FileText,
  Film,
  GripVertical,
  ListChecks,
  MapPin,
  Plus,
  Printer,
  Sparkles,
  Timer,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ContentFormat, ContentPiece, ShootSession } from '@/spaces/types';
import { FORMAT_BY_ID, STAGES } from '@/spaces/constants';
import { openContent } from '@/spaces/ui';
import { navigateSpace, openPrint } from '@/store/app';
import { useSpaceFormatters } from '@/store/space';
import { timeToMinutes } from '@/lib/dates';
import { formatMinutes, formatSeconds } from '@/lib/format';
import { plural } from '@/lib/text';
import { Button, Card, Checkbox, Combo, DateInput, Field, IconButton, Input, Menu, Progress, Select, StatusBadge, Textarea, TimeInput, confirmDialog } from '@/ui';
import {
  addShootChecks,
  cleanMissing,
  createPieceForShoot,
  deleteShoot,
  duplicateShoot,
  markShootFilmed,
  removePieceFromShoot,
  removeShootCheck,
  setShootDate,
  setShootOrder,
  updateShoot,
  updateShootCheck,
} from './actions';
import { AddContentModal, FILMABLE_FORMATS } from './AddContentModal';
import { STANDARD_SHOOT_CHECKLIST, estimateLabel, isSessionFilmed, scriptEstimate, shotStats } from './model';
import { DateBadge, shootPrintValue, undoToast } from './parts';
import { ShotList } from './ShotList';

/* ---------------------------------------------------------------- run of show row */

function PieceRow({ c, index, onRemove }: { c: ContentPiece; index: number; onRemove: (c: ContentPiece) => void }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: c.id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 2 : undefined };
  const f = FORMAT_BY_ID[c.format];
  const FIcon = f?.icon ?? Sparkles;
  const est = scriptEstimate(c);
  const shots = c.shots ?? [];
  const done = shots.filter((s) => s.done).length;
  return (
    <div ref={setNodeRef} style={style} className={`sp-production-piece ${isDragging ? 'is-dragging' : ''}`}>
      <button type="button" ref={setActivatorNodeRef} className="sp-production-grip" aria-label={`Reorder “${c.title}” (Space, then arrow keys)`} title="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical />
      </button>
      <span className="sp-production-num">{index + 1}</span>
      <span className="sp-production-ficon" title={f?.label}>
        <FIcon />
      </span>
      <div className="sp-production-pbody">
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <button type="button" className="sp-production-ptitle" onClick={() => openContent(c.id, 'produce')} title="Open script & shots">
            {c.title || 'Untitled content'}
          </button>
          <StatusBadge value={c.stage} options={STAGES} />
        </div>
        {c.hook ? <div className="sp-production-hook">“{c.hook}”</div> : c.concept ? <div className="sp-production-hook" style={{ fontStyle: 'normal' }}>{c.concept}</div> : null}
        <div className="sp-production-pmeta">
          <span>{f?.label ?? c.format}</span>
          {c.length && (
            <span title="Target length">
              <Timer /> {c.length}
            </span>
          )}
          <span title={est ? `${plural(est.words, 'word')} at ~150 words per minute` : 'No script yet'}>
            <FileText /> {est ? `Script ${estimateLabel(est)}` : 'No script'}
          </span>
          <span className={shots.length && done === shots.length ? 'ok' : undefined}>
            <Film /> {shots.length ? `${done}/${plural(shots.length, 'shot')}` : 'No shots'}
          </span>
          {c.aspect && <span>{c.aspect}</span>}
          {c.location && (
            <span>
              <MapPin /> {c.location}
            </span>
          )}
        </div>
      </div>
      <IconButton size="sm" icon={X} label="Remove from this shoot day" onClick={() => onRemove(c)} />
    </div>
  );
}

function RunOfShow({ shoot, pieces, missing, candidates }: { shoot: ShootSession; pieces: ContentPiece[]; missing: string[]; candidates: ContentPiece[] }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ContentFormat>('short_video');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = useMemo(() => pieces.map((p) => p.id), [pieces]);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setShootOrder(shoot.id, arrayMove(ids, from, to));
  };
  const remove = (c: ContentPiece) => {
    removePieceFromShoot(shoot.id, c.id);
    undoToast(`“${c.title || 'Untitled content'}” removed from this shoot day`);
  };
  const create = () => {
    const t = title.trim();
    if (!t) return;
    createPieceForShoot(shoot.id, t, format);
    setTitle('');
  };
  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Content to film
          <span className="badge">{pieces.length}</span>
        </span>
      }
      actions={
        <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
          Add content
        </Button>
      }
    >
      {pieces.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="sp-production-pieces">
              {pieces.map((c, i) => (
                <PieceRow key={c.id} c={c} index={i} onRemove={remove} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="sp-production-empty">
          <p>Batch-film several pieces on one day: add the videos and audio pieces you’ll shoot here, in running order.</p>
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            Add content
          </Button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="sp-production-missing">
          <TriangleAlert />
          <span className="grow">{plural(missing.length, 'linked piece')} no longer exist{missing.length === 1 ? 's' : ''} (deleted from Content).</span>
          <Button size="sm" variant="ghost" onClick={() => cleanMissing(shoot.id)}>
            Clean up
          </Button>
        </div>
      )}
      <div className="sp-production-quickadd">
        <Input
          value={title}
          onChange={setTitle}
          placeholder="Quick add a new piece to film…"
          aria-label="New piece title"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
        />
        <Select value={format} onChange={(v) => setFormat(v as ContentFormat)} options={FILMABLE_FORMATS} aria-label="Format" />
        <Button icon={Plus} disabled={!title.trim()} onClick={create}>
          Add
        </Button>
      </div>
      <AddContentModal open={adding} onClose={() => setAdding(false)} shootId={shoot.id} shootTitle={shoot.title} candidates={candidates} />
    </Card>
  );
}

/* ---------------------------------------------------------------- checklist */

function SessionChecklist({ shoot }: { shoot: ShootSession }) {
  const [text, setText] = useState('');
  const items = shoot.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const add = () => {
    const t = text.trim();
    if (!t) return;
    addShootChecks(shoot.id, [t]);
    setText('');
  };
  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          <ListChecks size={15} /> Checklist
          {items.length > 0 && (
            <span className={`badge ${done === items.length ? 'success' : ''}`}>
              {done}/{items.length}
            </span>
          )}
        </span>
      }
    >
      <div className="sp-production-checklist">
        {items.map((it) => (
          <div key={it.id} className={`sp-production-check ${it.done ? 'done' : ''}`}>
            <Checkbox checked={it.done} onChange={(v) => updateShootCheck(shoot.id, it.id, { done: v || undefined }, false)} />
            <Input bare size="sm" value={it.text} onChange={(v) => updateShootCheck(shoot.id, it.id, { text: v })} aria-label="Checklist item" />
            <IconButton size="sm" icon={Trash2} label="Delete item" onClick={() => removeShootCheck(shoot.id, it.id)} />
          </div>
        ))}
      </div>
      <div className="row sp-production-checkadd">
        <Input
          size="sm"
          value={text}
          onChange={setText}
          placeholder="Add item and press Enter…"
          aria-label="New checklist item"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <IconButton size="sm" icon={Plus} label="Add item" variant="default" disabled={!text.trim()} onClick={add} />
      </div>
      {items.length === 0 && (
        <Button size="sm" variant="ghost" icon={ListChecks} style={{ marginTop: 8 }} onClick={() => addShootChecks(shoot.id, STANDARD_SHOOT_CHECKLIST)}>
          Add the standard shoot checklist
        </Button>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- detail */

export function SessionDetail({
  shoot,
  shoots,
  pieces,
  missing,
  candidates,
  locationSuggestions,
  onSelect,
}: {
  shoot: ShootSession;
  shoots: ShootSession[];
  pieces: ContentPiece[];
  missing: string[];
  candidates: ContentPiece[];
  locationSuggestions: string[];
  onSelect: (id: string | null) => void;
}) {
  const fmt = useSpaceFormatters();
  const stats = useMemo(() => shotStats(pieces), [pieces]);
  const script = useMemo(() => pieces.reduce((n, c) => n + (scriptEstimate(c)?.seconds ?? 0), 0), [pieces]);
  const filmed = isSessionFilmed(pieces);
  const call = timeToMinutes(shoot.callTime);
  const wrap = timeToMinutes(shoot.wrapTime);
  const dayLen = call != null && wrap != null ? (wrap > call ? wrap - call : wrap + 1440 - call) : null;
  const pending = pieces.filter((c) => c.stage === 'planning' || c.stage === 'production').length;

  const markFilmed = async () => {
    const ok = await confirmDialog({
      title: 'Mark this shoot day as filmed?',
      message: `${pending ? `${plural(pending, 'piece')} in Planning / Shooting move to Editing` : 'No piece changes stage'}, and ${stats.total ? `all ${plural(stats.total, 'shot')} are ticked off` : 'there are no shots to tick'}.`,
      confirmLabel: 'Mark filmed',
    });
    if (!ok) return;
    const r = markShootFilmed(shoot.id);
    undoToast(`Shoot day filmed${r.moved ? ` · ${plural(r.moved, 'piece')} moved to Editing` : ''}`);
  };
  const duplicate = () => {
    const copy = duplicateShoot(shoot.id);
    if (!copy) return;
    onSelect(copy.id);
    undoToast(copy.date ? `Duplicated for ${fmt.dateMedium(copy.date)} (one week later) — add the pieces to film` : 'Shoot day duplicated — add the pieces to film');
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${shoot.title || 'Shoot day'}”?`,
      message: pieces.length ? `${plural(pieces.length, 'piece')} stay in Content but are no longer planned on a shoot day.` : 'This shoot day will be removed.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteShoot(shoot.id);
    onSelect(null);
    undoToast('Shoot day deleted');
  };

  return (
    <div className="sp-production-detail">
      <div className="card sp-production-hero">
        <div className="sp-production-hero-top">
          <DateBadge date={shoot.date} />
          <div className="sp-production-title">
            <div className="sp-production-eyebrow">{shoot.date ? fmt.dateLong(shoot.date) : 'Shoot day · no date yet'}</div>
            <Input bare value={shoot.title} placeholder="Shoot day title" aria-label="Shoot day title" onChange={(v) => updateShoot(shoot.id, { title: v })} />
          </div>
          <div className="sp-production-hero-actions">
            {filmed ? (
              <span className="badge success" style={{ height: 28, padding: '0 10px' }}>
                <CircleCheck size={13} /> Filmed
              </span>
            ) : (
              <Button variant="primary" icon={CheckCheck} disabled={!pieces.length} onClick={markFilmed} title={pieces.length ? 'Move pieces to Editing and tick every shot' : 'Add content first'}>
                Mark session filmed
              </Button>
            )}
            <IconButton icon={Printer} label="Print shoot plan" variant="default" onClick={() => openPrint('space-shoot-plan', { shoot: shootPrintValue(shoot, shoots) })} />
            <Menu
              align="end"
              trigger={<IconButton icon={Ellipsis} label="More" variant="default" />}
              items={[
                { label: 'Show in calendar', icon: CalendarDays, disabled: !shoot.date, onClick: () => navigateSpace('calendar', { date: shoot.date }) },
                { label: 'Duplicate shoot day', icon: Copy, onClick: duplicate },
                ...(filmed ? [{ label: 'Mark filmed again…', icon: CheckCheck, onClick: markFilmed }] : []),
                { separator: true },
                { label: 'Delete shoot day…', icon: Trash2, danger: true, onClick: remove },
              ]}
            />
          </div>
        </div>
        <div className="sp-production-fields">
          <Field label="Date">
            <DateInput value={shoot.date} onChange={(v) => setShootDate(shoot.id, v)} />
          </Field>
          <Field label="Call">
            <TimeInput value={shoot.callTime} onChange={(v) => updateShoot(shoot.id, { callTime: v }, false)} />
          </Field>
          <Field label="Wrap">
            <TimeInput value={shoot.wrapTime} onChange={(v) => updateShoot(shoot.id, { wrapTime: v }, false)} />
          </Field>
          <Field label="Location">
            <Combo value={shoot.location} onChange={(v) => updateShoot(shoot.id, { location: v })} suggestions={locationSuggestions} placeholder="Studio, home office, park …" />
          </Field>
        </div>
        <div className="sp-production-stats">
          <span>
            <Film />
            <span>
              <b>{pieces.length}</b> {pieces.length === 1 ? 'piece' : 'pieces'}
            </span>
          </span>
          <span>
            <CheckCheck />
            <span>
              <b>
                {stats.done}/{stats.total}
              </b>{' '}
              shots filmed
            </span>
            <Progress value={stats.total ? stats.done / stats.total : 0} color={stats.total && stats.done === stats.total ? 'var(--success)' : undefined} />
          </span>
          {stats.seconds > 0 && (
            <span title="Sum of shot durations">
              <Timer />
              <span>
                <b>{formatSeconds(stats.seconds)}</b> of shots
              </span>
            </span>
          )}
          {script > 0 && (
            <span title="Spoken length estimated from the scripts">
              <FileText />
              <span>
                <b>~{formatSeconds(script)}</b> of script
              </span>
            </span>
          )}
          {dayLen != null && (
            <span title="Call to wrap">
              <Clock />
              <span>
                <b>{formatMinutes(dayLen)}</b> shoot day
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="sp-production-cols">
        <div className="sp-production-maincol">
          <RunOfShow shoot={shoot} pieces={pieces} missing={missing} candidates={candidates} />
        </div>
        <div className="sp-production-sidecol">
          <Card title="People">
            <Textarea value={shoot.people} onChange={(v) => updateShoot(shoot.id, { people: v })} autoGrow minRows={3} placeholder={'Who’s on set: talent, camera, sound, collaborator …'} />
          </Card>
          <Card title="Gear">
            <Textarea value={shoot.gear} onChange={(v) => updateShoot(shoot.id, { gear: v })} autoGrow minRows={3} placeholder={'Camera A + 24-70, lav mics, key light, teleprompter …'} />
          </Card>
          <SessionChecklist shoot={shoot} />
          <Card title="Notes">
            <Textarea value={shoot.notes} onChange={(v) => updateShoot(shoot.id, { notes: v })} autoGrow minRows={3} placeholder="Parking, permits, wardrobe changes, backup plan …" />
          </Card>
        </div>
      </div>
      {/* the combined shot list gets the full width (it is a wide table) */}
      <ShotList shoot={shoot} pieces={pieces} />
    </div>
  );
}
