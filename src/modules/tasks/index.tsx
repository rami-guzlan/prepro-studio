/* Tasks & Milestones: kanban board, phase-grouped list with inline editing,
   side-panel editor, filters, quick add, bulk "mark phase done" and milestones. */
import './tasks.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Columns3, Flag, List, ListChecks, MoreHorizontal, Plus, SearchX } from 'lucide-react';
import type { Phase, Task } from '@/types';
import { useProject, getProject } from '@/store/project';
import { readLS, useApp, writeLS } from '@/store/app';
import { useCommand } from '@/lib/commands';
import { PHASES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import {
  Button,
  EmptyState,
  ExportMenu,
  IconButton,
  Menu,
  ModuleHeader,
  SearchInput,
  Select,
  Switch,
  Tabs,
  Toolbar,
  confirmDialog,
  isModalOpen,
  toast,
} from '@/ui';
import { Board } from './Board';
import { ListView } from './ListView';
import { MilestonesView, addMilestone } from './Milestones';
import { TaskEditor } from './TaskEditor';
import {
  STATUS_PHASE,
  UNASSIGNED,
  exportMilestonesCsv,
  exportTasksCsv,
  filterTasks,
  markPhaseDone,
  taskOps,
  useAssigneeSuggestions,
  type TaskFilters,
  type TaskStatus,
  dueState,
} from './shared';

type View = 'board' | 'list' | 'milestones';

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export default function TasksModule() {
  const tasks = useProject((p) => p.tasks);
  const milestones = useProject((p) => p.milestones);
  const status = useProject((p) => p.meta.status);
  const suggestions = useAssigneeSuggestions();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  const [view, setViewState] = useState<View>(() => readLS<View>('prepro.tasks.view', 'list'));
  const setView = (v: View) => {
    setViewState(v);
    writeLS('prepro.tasks.view', v);
  };
  const [filters, setFiltersState] = useState<TaskFilters>(() => ({ phase: '', assignee: '', hideDone: readLS('prepro.tasks.hideDone', false), query: '' }));
  const setFilters = (patch: Partial<TaskFilters>) => {
    setFiltersState((f) => {
      const next = { ...f, ...patch };
      if (patch.hideDone != null) writeLS('prepro.tasks.hideDone', patch.hideDone);
      return next;
    });
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusNew, setFocusNew] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const currentPhase: Phase = STATUS_PHASE[status] ?? 'pre';
  const filtered = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const selected = selectedId ? tasks.find((t) => t.id === selectedId) : undefined;

  // deep links: navigate('tasks', { taskId }) / navigate('tasks', { tab: 'milestones' })
  useEffect(() => {
    if (params?.tab === 'milestones') setView('milestones');
    if (typeof params?.taskId === 'string') {
      const id = params.taskId as string;
      setSelectedId(id);
      setFiltersState((f) => ({ ...f, phase: '', assignee: '', query: '', hideDone: false }));
      setViewState((v) => (v === 'milestones' ? 'list' : v));
      setTimeout(() => document.querySelector(`[data-task-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    }
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useCommand('find', () => {
    if (view === 'milestones') return false;
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  const deleteTask = async (t: Task) => {
    const ok = await confirmDialog({ title: 'Delete task?', message: `“${t.title || 'Untitled task'}” will be removed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    taskOps.remove(t.id);
    if (selectedId === t.id) setSelectedId(null);
  };

  // keyboard: Esc closes the editor, Delete removes the selected task
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen() || !selectedId || view === 'milestones') return;
      if (e.key === 'Escape') {
        const inEditor = !!(e.target as HTMLElement)?.closest?.('[data-tk-editor]');
        if (inEditor || !isTextTarget(e.target)) {
          (document.activeElement as HTMLElement | null)?.blur?.();
          setSelectedId(null);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextTarget(e.target)) {
        const t = getProject().tasks.find((x) => x.id === selectedId);
        if (t) {
          e.preventDefault();
          deleteTask(t);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openTask = (id: string) => {
    setSelectedId(id);
    setFocusNew(null);
  };

  const createTask = (patch: Partial<Task>, open: boolean) => {
    const assignee = filters.assignee && filters.assignee !== UNASSIGNED ? filters.assignee : undefined;
    const t: Task = { id: uid('task'), title: '', phase: filters.phase || currentPhase, status: 'todo', priority: 'normal', assignee, ...patch };
    taskOps.add(t);
    if (open) {
      setSelectedId(t.id);
      setFocusNew(t.id);
    }
    return t;
  };

  const quickAdd = () => {
    const title = draft.trim();
    if (!title) return;
    const t = createTask({ title }, false);
    setDraft('');
    if (filterTasks([t], filters).length === 0) toast(`Added “${t.title}” — hidden by the current search`, 'info');
  };

  const today = todayISO();
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdue = tasks.filter((t) => dueState(t.due, t.status, today) === 'overdue').length;
  const assigneeOptions = [
    { value: '', label: 'Everyone' },
    { value: UNASSIGNED, label: 'Unassigned' },
    ...suggestions.map((s) => ({ value: s, label: s })),
  ];

  const showEditor = view !== 'milestones' && !!selected;

  return (
    <div className="module">
      <ModuleHeader
        title="Tasks & Milestones"
        icon={ListChecks}
        subtitle={`${done} of ${tasks.length} tasks done${overdue ? ` · ${overdue} overdue` : ''} · ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'task-checklist', label: 'Task checklist' },
                { id: 'milestones', label: 'Milestones' },
              ]}
              csv={[
                { label: 'Tasks (CSV)', onClick: () => exportTasksCsv(getProject()) },
                { label: 'Milestones (CSV)', onClick: () => exportMilestonesCsv(getProject()) },
              ]}
            />
            <Menu
              align="end"
              trigger={<IconButton icon={MoreHorizontal} label="More actions" variant="default" />}
              items={() => [
                { header: 'Mark phase done' },
                ...PHASES.map((ph) => {
                  const open = getProject().tasks.filter((t) => t.phase === ph.value && t.status !== 'done').length;
                  return {
                    label: `${ph.label}${open ? ` (${open} open)` : ''}`,
                    icon: CheckCheck,
                    disabled: open === 0,
                    onClick: async () => {
                      const ok = await confirmDialog({
                        title: `Mark all ${ph.label} tasks done?`,
                        message: `${open} open task${open === 1 ? '' : 's'} will be marked done. You can undo with Ctrl+Z.`,
                        confirmLabel: 'Mark done',
                      });
                      if (ok) markPhaseDone(ph.value);
                    },
                  };
                }),
              ]}
            />
            {view === 'milestones' ? (
              <Button variant="primary" icon={Flag} onClick={() => addMilestone(currentPhase)}>
                Add milestone
              </Button>
            ) : (
              <Button variant="primary" icon={Plus} onClick={() => createTask({ title: '' }, true)}>
                Add task
              </Button>
            )}
          </>
        }
      />
      <Toolbar>
        <Tabs<View>
          value={view}
          onChange={setView}
          tabs={[
            { id: 'list', label: 'List', icon: List, count: filtered.length },
            { id: 'board', label: 'Board', icon: Columns3 },
            { id: 'milestones', label: 'Milestones', icon: Flag, count: milestones.length },
          ]}
        />
        {view !== 'milestones' && (
          <>
            <div className="vdivider" />
            <Select
              size="sm"
              value={filters.phase}
              options={PHASES}
              placeholder="All phases"
              onChange={(v) => setFilters({ phase: v as Phase | '' })}
              style={{ width: 150 }}
              aria-label="Filter by phase"
            />
            <Select size="sm" value={filters.assignee} options={assigneeOptions} onChange={(v) => setFilters({ assignee: v })} style={{ width: 150 }} aria-label="Filter by assignee" />
            <Switch checked={filters.hideDone} onChange={(v) => setFilters({ hideDone: v })} label="Hide done" />
            <div ref={searchRef}>
              <SearchInput value={filters.query} onChange={(v) => setFilters({ query: v })} placeholder="Search tasks…" width={190} />
            </div>
            <div className="spacer" />
            <div className="tk-quickadd">
              <Plus size={14} />
              <input
                className="input sm"
                value={draft}
                placeholder="Quick add task… (Enter)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    quickAdd();
                  } else if (e.key === 'Escape') setDraft('');
                }}
                aria-label="Quick add task"
              />
            </div>
          </>
        )}
      </Toolbar>
      <div className="split">
        <div className="pane-main">
          {view === 'milestones' ? (
            <div className="tk-pad">
              <MilestonesView milestones={milestones} defaultPhase={currentPhase} />
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No tasks yet"
              description="Plan everything that has to happen before, during and after the shoot. Type a task in the quick-add box or create one here."
              action={
                <Button variant="primary" icon={Plus} onClick={() => createTask({ title: '' }, true)}>
                  Add the first task
                </Button>
              }
            />
          ) : filtered.length === 0 && (filters.query || filters.assignee) ? (
            <EmptyState
              icon={SearchX}
              title="No matching tasks"
              description="Try another search or clear the filters."
              action={<Button onClick={() => setFilters({ query: '', assignee: '', phase: '' })}>Clear filters</Button>}
            />
          ) : view === 'board' ? (
            <div className="tk-pad tk-pad-board">
              <Board
                tasks={filtered}
                selectedId={selectedId}
                onOpen={openTask}
                onAdd={(s: TaskStatus) => createTask({ title: '', status: s }, true)}
              />
            </div>
          ) : (
            <div className="tk-pad">
              <ListView
                all={tasks}
                tasks={filtered}
                filters={filters}
                selectedId={selectedId}
                suggestions={suggestions}
                onOpen={openTask}
                onAddInPhase={(phase) => createTask({ title: '', phase }, true)}
                onDelete={deleteTask}
              />
            </div>
          )}
        </div>
        {showEditor && selected && (
          <aside className="pane-right tk-pane">
            <TaskEditor
              key={selected.id}
              task={selected}
              suggestions={suggestions}
              focusTitle={focusNew === selected.id}
              onClose={() => setSelectedId(null)}
              onDelete={deleteTask}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
