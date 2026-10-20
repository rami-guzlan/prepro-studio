/* List view: tasks grouped by production phase with inline editing and per-phase progress. */
import { CheckCheck, PanelRightOpen, Plus, Trash2 } from 'lucide-react';
import type { Phase, Task } from '@/types';
import { PHASES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { Button, Checkbox, Combo, DateInput, IconButton, Input, Progress, Select, confirmDialog } from '@/ui';
import { PRIORITIES, TASK_STATUSES, dueState, markPhaseDone, taskOps, type TaskFilters, isFiltering } from './shared';

export function ListView({
  all,
  tasks,
  filters,
  selectedId,
  suggestions,
  onOpen,
  onAddInPhase,
  onDelete,
}: {
  /** every task (for phase progress) */
  all: Task[];
  /** filtered tasks */
  tasks: Task[];
  filters: TaskFilters;
  selectedId: string | null;
  suggestions: string[];
  onOpen: (id: string) => void;
  onAddInPhase: (phase: Phase) => void;
  onDelete: (t: Task) => void;
}) {
  const today = todayISO();
  const phases = filters.phase ? PHASES.filter((p) => p.value === filters.phase) : PHASES;
  const filtering = isFiltering(filters);

  return (
    <div className="tk-list">
      {phases.map((ph) => {
        const inPhase = all.filter((t) => t.phase === ph.value);
        const rows = tasks.filter((t) => t.phase === ph.value);
        if (filtering && rows.length === 0) return null;
        const done = inPhase.filter((t) => t.status === 'done').length;
        const open = inPhase.length - done;
        return (
          <section key={ph.value} className="tk-phase" style={{ ['--ph' as string]: ph.color }}>
            <header className="tk-phase-head">
              <span className="color-dot" style={{ background: ph.color }} />
              <h3>{ph.label}</h3>
              <span className="tk-phase-count">
                {done}/{inPhase.length}
              </span>
              <Progress value={inPhase.length ? done / inPhase.length : 0} color={ph.color} style={{ width: 140 }} />
              <div className="spacer" />
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => onAddInPhase(ph.value)}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={CheckCheck}
                disabled={open === 0}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Mark all ${ph.label} tasks done?`,
                    message: `${open} open task${open === 1 ? '' : 's'} in ${ph.label} will be marked done. You can undo with Ctrl+Z.`,
                    confirmLabel: 'Mark done',
                  });
                  if (ok) markPhaseDone(ph.value);
                }}
              >
                Mark phase done
              </Button>
            </header>
            {rows.length === 0 ? (
              <button type="button" className="tk-phase-empty" onClick={() => onAddInPhase(ph.value)}>
                {inPhase.length && filters.hideDone ? 'All tasks in this phase are done.' : 'No tasks yet — click to add one.'}
              </button>
            ) : (
              <div className="tk-table-wrap">
                <table className="table tk-table">
                  <colgroup>
                    <col style={{ width: 34 }} />
                    <col />
                    <col style={{ width: 118 }} />
                    <col style={{ width: 132 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: 66 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th />
                      <th>Task</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>Assignee</th>
                      <th>Priority</th>
                      <th>Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const due = dueState(t.due, t.status, today);
                      const st = TASK_STATUSES.find((s) => s.value === t.status);
                      const pr = PRIORITIES.find((s) => s.value === (t.priority ?? 'normal'));
                      return (
                        <tr
                          key={t.id}
                          data-task-id={t.id}
                          className={[selectedId === t.id && 'selected', t.status === 'done' && 'tk-row-done'].filter(Boolean).join(' ')}
                          onClick={(e) => {
                            if (!(e.target as HTMLElement).closest('input,select,textarea,button,label')) onOpen(t.id);
                          }}
                        >
                          <td className="tk-c-check">
                            <Checkbox checked={t.status === 'done'} onChange={(v) => taskOps.update(t.id, { status: v ? 'done' : 'todo' }, false)} title={t.status === 'done' ? 'Mark not done' : 'Mark done'} />
                          </td>
                          <td>
                            <Input bare size="sm" className="tk-title-input" value={t.title} placeholder="Untitled task" onChange={(v) => taskOps.update(t.id, { title: v })} />
                          </td>
                          <td>
                            <Select bare size="sm" value={t.status} options={TASK_STATUSES} onChange={(v) => taskOps.update(t.id, { status: v as Task['status'] }, false)} style={{ color: st?.color, fontWeight: 600 }} />
                          </td>
                          <td className={`tk-c-due ${due}`}>
                            <DateInput bare size="sm" value={t.due} onChange={(v) => taskOps.update(t.id, { due: v }, false)} />
                          </td>
                          <td>
                            <Combo bare size="sm" value={t.assignee} suggestions={suggestions} placeholder="—" onChange={(v) => taskOps.update(t.id, { assignee: v || undefined })} />
                          </td>
                          <td>
                            <Select
                              bare
                              size="sm"
                              value={t.priority ?? 'normal'}
                              options={PRIORITIES}
                              onChange={(v) => taskOps.update(t.id, { priority: v as Task['priority'] }, false)}
                              style={{ color: t.priority === 'high' ? pr?.color : undefined }}
                            />
                          </td>
                          <td>
                            <Input bare size="sm" value={t.notes} placeholder="Notes" onChange={(v) => taskOps.update(t.id, { notes: v || undefined })} />
                          </td>
                          <td className="actions-cell">
                            <IconButton icon={PanelRightOpen} size="sm" label="Open details" onClick={() => onOpen(t.id)} />
                            <IconButton icon={Trash2} size="sm" label="Delete task" onClick={() => onDelete(t)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
