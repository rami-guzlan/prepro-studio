/* Project & growth-initiative link helpers shared by the money / people / legal
   screens: pickers ("Project" select), small pills in lists, and the write
   operations of the Projects screen (tasks, status, linking records). */
import '../../work.css';
import type { Option } from '@/lib/constants';
import { navigateSpace } from '@/store/app';
import { todayISO } from '@/lib/dates';
import { Select } from '@/ui';
import { isOpenProject, projectStatusInfo } from '../../derive-work';
import { bizUpdate, makeTask } from '../../ops';
import { Pill, useBiz } from '../../ui';
import type { BizProject, BizProjectStatus, BizTask, BusinessData } from '../../types';

/* ---------------------------------------------------------------- read helpers */

export const projectColor = (p: Pick<BizProject, 'color' | 'status'>) => p.color || projectStatusInfo(p.status).color || 'var(--accent)';

export function projectName(b: BusinessData, id?: string): string {
  if (!id) return '';
  const p = b.projects.find((x) => x.id === id);
  return p ? p.name || 'Untitled project' : '';
}

/** Business projects for a picker: open projects first (by name), then finished ones. */
export function projectOptions(b: BusinessData): Option[] {
  const byName = (a: BizProject, z: BizProject) => (a.name || '').localeCompare(z.name || '');
  const open = b.projects.filter(isOpenProject).sort(byName);
  const closed = b.projects.filter((p) => !isOpenProject(p)).sort(byName);
  return [
    ...open.map((p) => ({ value: p.id, label: p.name || 'Untitled project', color: projectColor(p) })),
    ...closed.map((p) => ({ value: p.id, label: `${p.name || 'Untitled project'} (${projectStatusInfo(p.status).label.toLowerCase()})`, color: projectColor(p) })),
  ];
}

/** Growth initiatives for a picker (by title). */
export function initiativeOptions(b: BusinessData): Option[] {
  return [...(b.initiatives ?? [])].sort((a, z) => (a.title || '').localeCompare(z.title || '')).map((i) => ({ value: i.id, label: i.title || 'Untitled initiative' }));
}

/** "Project" select bound to a bizProjectId. */
export function ProjectSelect({ value, onChange, size, bare, placeholder = 'No project', ariaLabel = 'Business project' }: { value?: string; onChange: (id: string | undefined) => void; size?: 'sm' | 'md'; bare?: boolean; placeholder?: string; ariaLabel?: string }) {
  const b = useBiz();
  return <Select size={size} bare={bare} value={value ?? ''} placeholder={b.projects.length ? placeholder : 'No projects yet'} options={projectOptions(b)} onChange={(v) => onChange(v || undefined)} aria-label={ariaLabel} />;
}

/** Small coloured project name; clicking opens the project (unless `static`). */
export function ProjectPill({ id, static: isStatic }: { id?: string; static?: boolean }) {
  const b = useBiz();
  const p = id ? b.projects.find((x) => x.id === id) : undefined;
  if (!p) return null;
  const pill = (
    <Pill color={projectColor(p)} title={`Project: ${p.name}`}>
      {p.name || 'Untitled project'}
    </Pill>
  );
  if (isStatic) return pill;
  return (
    <button
      type="button"
      className="wk-pill-btn"
      onClick={(e) => {
        e.stopPropagation();
        navigateSpace('projects', { projectId: p.id });
      }}
      title={`Open project “${p.name}”`}
    >
      {pill}
    </button>
  );
}

/* ---------------------------------------------------------------- write operations */

export type LinkKind = 'invoices' | 'income' | 'expenses' | 'time' | 'payments' | 'docs';

/** Point existing records at a project (or clear with projectId undefined). One undo step. */
export function linkRecords(kind: LinkKind, ids: string[], projectId: string | undefined) {
  const set = new Set(ids);
  if (!set.size) return;
  bizUpdate((b) => {
    for (const x of b[kind] as { id: string; bizProjectId?: string }[]) {
      if (!set.has(x.id)) continue;
      if (projectId) x.bizProjectId = projectId;
      else delete x.bizProjectId;
    }
    if (kind === 'docs' && !projectId) for (const p of b.projects) p.docIds = p.docIds.filter((d) => !set.has(d));
  });
}

export function setProjectStatus(id: string, status: BizProjectStatus) {
  bizUpdate((b) => {
    const p = b.projects.find((x) => x.id === id);
    if (!p) return;
    p.status = status;
    if (status === 'done') p.completedDate ??= todayISO();
    else delete p.completedDate;
  });
}

export function addTask(projectId: string, patch: Partial<BizTask> = {}): string {
  const t = makeTask(patch);
  bizUpdate((b) => void b.projects.find((x) => x.id === projectId)?.tasks.push(t));
  return t.id;
}

export function updateTask(projectId: string, taskId: string, patch: Partial<BizTask>, coalesce = true) {
  bizUpdate(
    (b) => {
      const t = b.projects.find((x) => x.id === projectId)?.tasks.find((x) => x.id === taskId);
      if (!t) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete (t as any)[k];
        else (t as any)[k] = v;
      }
    },
    coalesce ? { coalesce: `biz:task:${taskId}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function removeTask(projectId: string, taskId: string) {
  bizUpdate((b) => {
    const p = b.projects.find((x) => x.id === projectId);
    if (p) p.tasks = p.tasks.filter((t) => t.id !== taskId);
  });
}

/** Move a task before another (null = to the end). */
export function reorderTask(projectId: string, taskId: string, beforeId: string | null) {
  bizUpdate((b) => {
    const p = b.projects.find((x) => x.id === projectId);
    if (!p) return;
    const i = p.tasks.findIndex((t) => t.id === taskId);
    if (i < 0) return;
    const [t] = p.tasks.splice(i, 1);
    const j = beforeId ? p.tasks.findIndex((x) => x.id === beforeId) : -1;
    if (j < 0) p.tasks.push(t);
    else p.tasks.splice(j, 0, t);
  });
}

/** Assignee label: "Me", a contractor's name, or ''. */
export function assigneeLabel(b: BusinessData, a?: string): string {
  if (!a) return '';
  if (a === 'me') return 'Me';
  return b.contractors.find((c) => c.id === a)?.name || '';
}
