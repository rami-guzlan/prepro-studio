/* Side panel for editing one task. */
import { useEffect, useRef } from 'react';
import { CalendarPlus, Check, Trash2, X } from 'lucide-react';
import type { Phase, Task } from '@/types';
import { PHASES } from '@/lib/constants';
import { addDays, todayISO } from '@/lib/dates';
import { useFormatters } from '@/store/project';
import { Button, Combo, DateInput, Field, IconButton, Select, Textarea } from '@/ui';
import { PRIORITIES, TASK_STATUSES, dueState, taskOps } from './shared';

export function TaskEditor({
  task,
  suggestions,
  focusTitle,
  onClose,
  onDelete,
}: {
  task: Task;
  suggestions: string[];
  /** focus + select the title (new tasks) */
  focusTitle?: boolean;
  onClose: () => void;
  onDelete: (t: Task) => void;
}) {
  const fmt = useFormatters();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<Task>, coalesce = true) => taskOps.update(task.id, patch, coalesce);
  const today = todayISO();
  const due = dueState(task.due, task.status, today);

  useEffect(() => {
    if (!focusTitle) return;
    const el = titleRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [focusTitle, task.id]);

  return (
    <div className="tk-editor" data-tk-editor>
      <div className="tk-editor-head">
        <span className="color-dot" style={{ background: PHASES.find((p) => p.value === task.phase)?.color }} />
        <span className="tk-editor-kicker">{PHASES.find((p) => p.value === task.phase)?.label ?? 'Task'}</span>
        <div className="spacer" />
        <IconButton icon={X} label="Close (Esc)" onClick={onClose} />
      </div>
      <div className="tk-editor-body">
        <Textarea
          ref={titleRef}
          bare
          autoGrow
          minRows={1}
          className="tk-editor-title"
          value={task.title}
          placeholder="Task title"
          onChange={(v) => set({ title: v.replace(/\n/g, ' ') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />

        <div className="tk-seg" role="radiogroup" aria-label="Status">
          {TASK_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={task.status === s.value}
              className={task.status === s.value ? 'on' : ''}
              style={{ ['--sc' as string]: s.color }}
              onClick={() => set({ status: s.value }, false)}
            >
              {task.status === s.value && <Check size={13} />}
              {s.label}
            </button>
          ))}
        </div>

        <Field label="Phase">
          <Select value={task.phase} options={PHASES} onChange={(v) => set({ phase: v as Phase }, false)} />
        </Field>
        <Field label="Due date" hint={due === 'overdue' ? <span className="tk-warn">Overdue</span> : task.due ? fmt.dateLong(task.due) : undefined}>
          <div className="row" style={{ gap: 6 }}>
            <DateInput value={task.due} onChange={(v) => set({ due: v }, false)} />
            <Button size="sm" variant="ghost" icon={CalendarPlus} title="Due in one week" onClick={() => set({ due: addDays(today, 7) }, false)}>
              +1w
            </Button>
          </div>
        </Field>
        <Field label="Assignee">
          <Combo value={task.assignee} suggestions={suggestions} placeholder="Name" onChange={(v) => set({ assignee: v || undefined })} />
        </Field>
        <Field label="Priority">
          <div className="tk-seg small" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={(task.priority ?? 'normal') === p.value}
                className={(task.priority ?? 'normal') === p.value ? 'on' : ''}
                style={{ ['--sc' as string]: p.color }}
                onClick={() => set({ priority: p.value }, false)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <Textarea autoGrow minRows={4} value={task.notes} placeholder="Details, links, who to call…" onChange={(v) => set({ notes: v || undefined })} />
        </Field>
      </div>
      <div className="tk-editor-foot">
        <Button variant="danger" icon={Trash2} onClick={() => onDelete(task)}>
          Delete
        </Button>
        <div className="spacer" />
        {task.status !== 'done' ? (
          <Button variant="primary" icon={Check} onClick={() => set({ status: 'done' }, false)}>
            Mark done
          </Button>
        ) : (
          <Button onClick={() => set({ status: 'todo' }, false)}>Reopen</Button>
        )}
      </div>
    </div>
  );
}
