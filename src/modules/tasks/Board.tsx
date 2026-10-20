/* Kanban board: To do / In progress / Done with drag & drop (@dnd-kit). */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Flag, Plus, StickyNote } from 'lucide-react';
import type { Task } from '@/types';
import { useFormatters } from '@/store/project';
import { todayISO } from '@/lib/dates';
import { Avatar, IconButton } from '@/ui';
import { PHASE_SHORT, TASK_STATUSES, dueState, moveTask, phaseOf, type TaskStatus } from './shared';

type Cols = Record<TaskStatus, string[]>;
const STATUS_IDS: TaskStatus[] = ['todo', 'doing', 'done'];
const isStatus = (id: string): id is TaskStatus => (STATUS_IDS as string[]).includes(id);

export function Board({
  tasks,
  selectedId,
  onOpen,
  onAdd,
}: {
  tasks: Task[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const base = useMemo<Cols>(
    () => ({
      todo: tasks.filter((t) => t.status === 'todo').map((t) => t.id),
      doing: tasks.filter((t) => t.status === 'doing').map((t) => t.id),
      done: tasks.filter((t) => t.status === 'done').map((t) => t.id),
    }),
    [tasks],
  );
  const [dragCols, setDragCols] = useState<Cols | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const cols = dragCols ?? base;
  const colsRef = useRef(cols);
  colsRef.current = cols;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const findCol = (id: string, c: Cols): TaskStatus | undefined => (isStatus(id) ? id : STATUS_IDS.find((s) => c[s].includes(id)));

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDragCols(base);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);
    setDragCols((prev) => {
      const c = prev ?? base;
      const from = findCol(aid, c);
      const to = findCol(oid, c);
      if (!from || !to || from === to) return prev;
      const fromItems = c[from].filter((x) => x !== aid);
      const toItems = [...c[to]];
      let idx = isStatus(oid) ? toItems.length : toItems.indexOf(oid);
      if (idx < 0) idx = toItems.length;
      if (!isStatus(oid)) {
        const activeRect = active.rect.current.translated;
        if (activeRect && activeRect.top > over.rect.top + over.rect.height / 2) idx += 1;
      }
      toItems.splice(idx, 0, aid);
      return { ...c, [from]: fromItems, [to]: toItems };
    });
  };

  const finish = () => {
    setDragCols(null);
    setActiveId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const aid = String(active.id);
    let c = colsRef.current;
    const col = findCol(aid, c);
    if (over && col) {
      const oid = String(over.id);
      const overCol = findCol(oid, c);
      if (overCol === col && !isStatus(oid)) {
        const oldIdx = c[col].indexOf(aid);
        const newIdx = c[col].indexOf(oid);
        if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) c = { ...c, [col]: arrayMove(c[col], oldIdx, newIdx) };
      }
      const order = c[col];
      const i = order.indexOf(aid);
      const beforeId = i >= 0 ? order[i + 1] ?? null : null;
      const t = byId.get(aid);
      const origOrder = base[col];
      const unchanged = t?.status === col && origOrder.indexOf(aid) === i && (origOrder[i + 1] ?? null) === beforeId;
      if (!unchanged) moveTask(aid, col, beforeId);
    }
    finish();
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={finish}>
      <div className="tk-board">
        {TASK_STATUSES.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} color={s.color!} ids={cols[s.value]} byId={byId} selectedId={selectedId} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>{active ? <div className="tk-card overlay" style={phaseStyle(active)}><CardBody task={active} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  label,
  color,
  ids,
  byId,
  selectedId,
  onOpen,
  onAdd,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  ids: string[];
  byId: Map<string, Task>;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className={`tk-col ${isOver ? 'over' : ''}`} aria-label={label}>
      <header className="tk-col-head">
        <span className="color-dot" style={{ background: color }} />
        <h3>{label}</h3>
        <span className="tk-count">{ids.length}</span>
        <div className="spacer" />
        <IconButton icon={Plus} size="sm" label={`Add task to ${label}`} onClick={() => onAdd(status)} />
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="tk-col-body">
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableCard key={id} task={t} selected={selectedId === id} onOpen={onOpen} /> : null;
          })}
          {ids.length === 0 && <div className="tk-col-empty">{status === 'done' ? 'Drop finished tasks here' : 'Drop tasks here'}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function phaseStyle(t: Task): CSSProperties {
  return { ['--ph' as string]: phaseOf(t.phase).color };
}

function SortableCard({ task, selected, onOpen }: { task: Task; selected: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style: CSSProperties = {
    ...phaseStyle(task),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={['tk-card', selected && 'selected', task.status === 'done' && 'done'].filter(Boolean).join(' ')}
      data-task-id={task.id}
      {...attributes}
      {...listeners}
      aria-label={task.title || 'Untitled task'}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(task.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
    >
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task }: { task: Task }) {
  const fmt = useFormatters();
  const today = todayISO();
  const ph = phaseOf(task.phase);
  const due = dueState(task.due, task.status, today);
  return (
    <>
      <div className="tk-card-title">{task.title || 'Untitled task'}</div>
      <div className="tk-card-meta">
        <span className="tk-phase-tag" title={ph.label}>
          {PHASE_SHORT[ph.value]}
        </span>
        {task.due && (
          <span className={`tk-due ${due}`} title={fmt.dateLong(task.due)}>
            <CalendarDays size={12} />
            {fmt.dateMedium(task.due).replace(/, \d{4}$/, '')}
          </span>
        )}
        {task.priority === 'high' && (
          <span className="tk-prio high" title="High priority">
            <Flag size={12} />
          </span>
        )}
        {task.priority === 'low' && <span className="tk-prio low">Low</span>}
        {task.notes?.trim() && (
          <span className="tk-has-notes" title={task.notes}>
            <StickyNote size={12} />
          </span>
        )}
        <span className="spacer" />
        {task.assignee?.trim() && <Avatar name={task.assignee} size={20} />}
      </div>
    </>
  );
}
