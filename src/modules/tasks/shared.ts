/* Shared helpers for the Tasks & Milestones module. */
import { useMemo } from 'react';
import type { Milestone, Phase, ProjectData, ProjectStatus, Task } from '@/types';
import type { Option } from '@/lib/constants';
import { PHASES } from '@/lib/constants';
import { listOps, update, useProject } from '@/store/project';
import { diffDays, parseISODate } from '@/lib/dates';
import { matchesQuery, safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { toast } from '@/ui';

export type TaskStatus = Task['status'];
export type Priority = NonNullable<Task['priority']>;

export const TASK_STATUSES: Option<TaskStatus>[] = [
  { value: 'todo', label: 'To do', color: '#8e8c99' },
  { value: 'doing', label: 'In progress', color: '#3e8ef7' },
  { value: 'done', label: 'Done', color: '#2fb36d' },
];

export const PRIORITIES: Option<Priority>[] = [
  { value: 'high', label: 'High', color: '#e5484d' },
  { value: 'normal', label: 'Normal', color: '#8e8c99' },
  { value: 'low', label: 'Low', color: '#3e8ef7' },
];

export const STATUS_PHASE: Record<ProjectStatus, Phase> = {
  development: 'development',
  pre: 'pre',
  production: 'production',
  post: 'post',
  delivered: 'delivery',
  archived: 'delivery',
};

export const PHASE_SHORT: Record<Phase, string> = {
  development: 'Dev',
  pre: 'Pre',
  production: 'Prod',
  post: 'Post',
  delivery: 'Delivery',
};

export const phaseOf = (v: string | undefined): Option<Phase> => PHASES.find((p) => p.value === v) ?? PHASES[0];

export const taskOps = listOps<Task>((d) => d.tasks, 'tasks');
export const milestoneOps = listOps<Milestone>((d) => d.milestones, 'milestones');

export const isISO = (d: string | undefined | null): d is string => !!d && !!parseISODate(d);

/** 'overdue' | 'soon' (within 2 days) | '' */
export function dueState(due: string | undefined, status: TaskStatus | undefined, today: string): '' | 'overdue' | 'soon' {
  if (!isISO(due) || status === 'done') return '';
  const d = diffDays(today, due);
  if (d < 0) return 'overdue';
  if (d <= 2) return 'soon';
  return '';
}

export interface TaskFilters {
  phase: Phase | '';
  /** '' = everyone, '__none' = unassigned */
  assignee: string;
  hideDone: boolean;
  query: string;
}

export const UNASSIGNED = '__none';

export function filterTasks(tasks: Task[], f: TaskFilters): Task[] {
  return tasks.filter((t) => {
    if (f.phase && t.phase !== f.phase) return false;
    if (f.hideDone && t.status === 'done') return false;
    if (f.assignee === UNASSIGNED ? !!t.assignee?.trim() : f.assignee && (t.assignee ?? '').trim().toLowerCase() !== f.assignee.toLowerCase()) return false;
    if (f.query && !matchesQuery(`${t.title} ${t.notes ?? ''} ${t.assignee ?? ''}`, f.query)) return false;
    return true;
  });
}

export function isFiltering(f: TaskFilters): boolean {
  return !!(f.assignee || f.query.trim());
}

/** Crew + cast names (and anyone already assigned) for the assignee combo. */
export function useAssigneeSuggestions(): string[] {
  const crew = useProject((p) => p.crew);
  const cast = useProject((p) => p.cast);
  const tasks = useProject((p) => p.tasks);
  return useMemo(() => {
    const set = new Map<string, string>();
    const add = (n: string | undefined) => {
      const v = n?.trim();
      if (v && !set.has(v.toLowerCase())) set.set(v.toLowerCase(), v);
    };
    for (const c of crew) if (c.status !== 'declined') add(c.name);
    for (const c of cast) if (c.status !== 'declined') add(c.name);
    for (const t of tasks) add(t.assignee);
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [crew, cast, tasks]);
}

/** Mark every task of a phase done (one undo step). */
export function markPhaseDone(phase: Phase) {
  update((d) => {
    for (const t of d.tasks) if (t.phase === phase) t.status = 'done';
  });
}

/** Move a task to a status column and before another task (one undo step). */
export function moveTask(id: string, status: TaskStatus, beforeId: string | null) {
  update((d) => {
    const a = d.tasks;
    const i = a.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = a.splice(i, 1);
    t.status = status;
    const j = beforeId ? a.findIndex((x) => x.id === beforeId) : -1;
    if (j < 0) a.push(t);
    else a.splice(j, 0, t);
  });
}

/* ---------------------------------------------------------------- CSV */

export async function exportTasksCsv(p: ProjectData) {
  const order = PHASES.map((x) => x.value);
  const rows = [...p.tasks].sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase));
  const path = await exportCsv(`${safeFileName(p.meta.title)} - Tasks`, rows, [
    { header: 'Phase', value: (t) => phaseOf(t.phase).label },
    { header: 'Task', value: (t) => t.title },
    { header: 'Status', value: (t) => TASK_STATUSES.find((s) => s.value === t.status)?.label ?? t.status },
    { header: 'Priority', value: (t) => PRIORITIES.find((s) => s.value === (t.priority ?? 'normal'))?.label },
    { header: 'Due', value: (t) => t.due ?? '' },
    { header: 'Assignee', value: (t) => t.assignee ?? '' },
    { header: 'Notes', value: (t) => t.notes ?? '' },
  ]);
  if (path) toast('Tasks exported to CSV');
}

export async function exportMilestonesCsv(p: ProjectData) {
  const rows = [...p.milestones].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const path = await exportCsv(`${safeFileName(p.meta.title)} - Milestones`, rows, [
    { header: 'Milestone', value: (m) => m.name },
    { header: 'Date', value: (m) => m.date ?? '' },
    { header: 'Phase', value: (m) => phaseOf(m.phase).label },
    { header: 'Done', value: (m) => !!m.done },
    { header: 'Notes', value: (m) => m.notes ?? '' },
  ]);
  if (path) toast('Milestones exported to CSV');
}
