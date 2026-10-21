/* Projects: client work and internal projects as a list (grouped by status), a
   kanban board by status and a timeline (start → due with milestones). Each
   project page links money (invoices, income, expenses, time, contractor pay),
   contractors, legal documents, the deal it came from, Marketing Spaces and
   productions. */
import '../../biz.css';
import '../../work.css';
import { useMemo, useState, type CSSProperties } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { AlertTriangle, CalendarRange, Columns3, Diamond, FolderKanban, List, Plus } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { readLS, writeLS } from '@/store/app';
import { MONTHS_SHORT, addDays, diffDays } from '@/lib/dates';
import { plural, safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Button, EmptyState, ExportMenu, ModuleHeader, Select, Tabs, Toolbar, toast } from '@/ui';
import { Meter, StatTile } from '@/ui/charts';
import { PROJECT_STATUSES, FEE_TYPES } from '../../constants';
import { clientLabel } from '../../derive';
import { isOpenProject, projectFinancials, projectStatusInfo, projectsSummary, type ProjectFinancials } from '../../derive-work';
import { addItem, bizUpdate, makeProject } from '../../ops';
import { Money, OptionPill, clientOptions, rowKeys, useBiz, useFmt, useNavParams, useToday } from '../../ui';
import type { BizProject, BizProjectStatus, BusinessData } from '../../types';
import { assigneeLabel, projectColor, setProjectStatus } from './link';
import { ProjectPage } from './page';

type View = 'list' | 'board' | 'timeline';
type StatusFilter = 'open' | 'all' | BizProjectStatus;

export default function ProjectsModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const today = useToday();
  const [view, setViewState] = useState<View>(() => readLS<View>(`prepro.biz.projectsView.${spaceId}`, 'list'));
  const [status, setStatus] = useState<StatusFilter>('open');
  const [client, setClient] = useState('');
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.project.${spaceId}`, null));

  const setView = (v: View) => {
    setViewState(v);
    writeLS(`prepro.biz.projectsView.${spaceId}`, v);
  };
  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.project.${spaceId}`, id);
  };

  const create = (patch: Partial<BizProject> = {}) => {
    const p = makeProject({ name: 'New project', startDate: today, ...patch });
    if (p.clientId && !b.clients.some((c) => c.id === p.clientId)) delete p.clientId;
    if (p.dealId && !b.deals.some((d) => d.id === p.dealId)) delete p.dealId;
    if (p.dealId) {
      const deal = b.deals.find((d) => d.id === p.dealId)!;
      p.name = deal.title || p.name;
      p.clientId ??= deal.clientId;
      p.fee ??= deal.value;
      p.spaceId ??= deal.spaceId;
      p.projectId ??= deal.projectId;
      bizUpdate((d) => {
        d.projects.push(p);
        const dd = d.deals.find((x) => x.id === p.dealId);
        if (dd && !dd.bizProjectId) dd.bizProjectId = p.id;
      });
    } else addItem('projects', p);
    select(p.id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.wk-project-name input')?.select());
    return p;
  };

  useNavParams((p) => {
    if (p.projectId && b.projects.some((x) => x.id === p.projectId)) select(p.projectId);
    if (p.view === 'list' || p.view === 'board' || p.view === 'timeline') {
      setView(p.view);
      if (!p.projectId) select(null);
    }
    if (p.status && (p.status === 'open' || p.status === 'all' || PROJECT_STATUSES.some((s) => s.value === p.status))) setStatus(p.status);
    if (p.new) create({ clientId: p.clientId || undefined, dealId: p.dealId || undefined, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'New project' });
  });

  const fin = useMemo(() => new Map(b.projects.map((p) => [p.id, projectFinancials(b, p, today)])), [b, today]);
  const sum = useMemo(() => projectsSummary(b, today), [b, today]);
  const list = useMemo(
    () =>
      b.projects.filter((p) => (status === 'all' ? true : status === 'open' ? isOpenProject(p) : p.status === status) && (!client || (client === '_none' ? !p.clientId : p.clientId === client))),
    [b.projects, status, client],
  );
  const project = b.projects.find((p) => p.id === sel);

  const exportProjects = async () => {
    const path = await exportCsv(safeFileName(`${title} - Projects`), list, [
      { header: 'Project', value: (p) => p.name },
      { header: 'Status', value: (p) => projectStatusInfo(p.status).label },
      { header: 'Client', value: (p) => clientLabel(b, p.clientId) },
      { header: 'Start', value: (p) => p.startDate },
      { header: 'Due', value: (p) => p.dueDate },
      { header: 'Completed', value: (p) => p.completedDate },
      { header: 'Fee', value: (p) => fin.get(p.id)!.fee },
      { header: 'Fee type', value: (p) => FEE_TYPES.find((f) => f.value === p.feeType)?.label },
      { header: 'Cost budget', value: (p) => p.budget },
      { header: 'Invoiced', value: (p) => fin.get(p.id)!.invoiced },
      { header: 'Received', value: (p) => fin.get(p.id)!.received },
      { header: 'Outstanding', value: (p) => fin.get(p.id)!.outstanding },
      { header: 'To invoice', value: (p) => fin.get(p.id)!.toInvoice },
      { header: 'Costs', value: (p) => fin.get(p.id)!.costs },
      { header: 'Owed to contractors', value: (p) => fin.get(p.id)!.owedToContractors },
      { header: 'Profit so far', value: (p) => fin.get(p.id)!.profit },
      { header: 'Expected profit', value: (p) => fin.get(p.id)!.expectedProfit },
      { header: 'Hours', value: (p) => (fin.get(p.id)!.minutes / 60).toFixed(2) },
      { header: 'Tasks done', value: (p) => fin.get(p.id)!.tasksDone },
      { header: 'Tasks', value: (p) => fin.get(p.id)!.tasksTotal },
    ]);
    if (path) toast(`Exported ${plural(list.length, 'project')}`);
  };

  const exportTasks = async () => {
    const source = project ? [project] : list;
    const rows = source.flatMap((p) => p.tasks.map((t) => ({ id: t.id, p, t })));
    const path = await exportCsv(safeFileName(`${title} - ${project ? `${project.name} tasks` : 'Project tasks'}`), rows, [
      { header: 'Project', value: (r) => r.p.name },
      { header: 'Task', value: (r) => r.t.title },
      { header: 'Milestone', value: (r) => (r.t.milestone ? 'yes' : '') },
      { header: 'Due', value: (r) => r.t.due },
      { header: 'Assignee', value: (r) => assigneeLabel(b, r.t.assignee) },
      { header: 'Done', value: (r) => (r.t.done ? 'yes' : 'no') },
      { header: 'Notes', value: (r) => r.t.notes },
    ]);
    if (path) toast(`Exported ${plural(rows.length, 'task')}`);
  };

  const docs = [
    ...(project ? [{ id: 'space-biz-project-brief', label: `Project brief — ${project.name || 'this project'}`, options: { project: project.id } }] : []),
    { id: 'space-biz-projects', label: 'Projects report (open projects)', options: { status: 'open' } },
    { id: 'space-biz-projects', label: 'Projects report (all projects)', options: { status: 'all' } },
  ];

  return (
    <div className="module biz">
      <ModuleHeader
        title="Projects"
        icon={FolderKanban}
        subtitle={b.projects.length ? `${sum.open} open · ${sum.active} active${sum.overdue ? ` · ${sum.overdue} overdue` : ''} · ${fmt.money(sum.toInvoice, { cents: false })} still to invoice` : 'Client work: plan, tasks, money, contractors, documents'}
        actions={
          <>
            <ExportMenu
              docs={docs}
              csv={[
                { label: 'Projects shown (CSV)', onClick: () => void exportProjects() },
                { label: project ? 'Tasks of this project (CSV)' : 'Tasks of the projects shown (CSV)', onClick: () => void exportTasks() },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => create()}>
              New project
            </Button>
          </>
        }
      />
      {project ? (
        <div className="module-body">
          <ProjectPage key={project.id} p={project} onBack={() => select(null)} onDeleted={() => select(null)} />
        </div>
      ) : (
        <>
          <Toolbar>
            <Tabs<View>
              value={view}
              onChange={setView}
              tabs={[
                { id: 'list', label: 'List', icon: List },
                { id: 'board', label: 'Board', icon: Columns3 },
                { id: 'timeline', label: 'Timeline', icon: CalendarRange },
              ]}
            />
            <div className="spacer" />
            <Select
              size="sm"
              value={status}
              onChange={(v) => setStatus((v || 'open') as StatusFilter)}
              options={[{ value: 'open', label: 'Open projects' }, { value: 'all', label: 'All projects' }, ...PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
              aria-label="Status"
              style={{ width: 160 }}
            />
            <Select size="sm" value={client} placeholder="All clients" options={[...clientOptions(b), { value: '_none', label: 'No client (internal)' }]} onChange={setClient} aria-label="Client" style={{ width: 190 }} />
          </Toolbar>
          <div className="module-body">
            <div className="biz-page">
              {b.projects.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="Plan your client work"
                  description="A project ties everything about a job together: the fee and what you invoiced and received, costs and contractor pay, time, tasks and milestones, agreements, and the Marketing Space or production it belongs to."
                  action={
                    <Button variant="primary" icon={Plus} onClick={() => create()}>
                      New project
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="biz-kpis">
                    <StatTile label="Open projects" value={String(sum.open)} sub={`${sum.active} active`} onClick={() => setStatus('open')} />
                    <StatTile label="Fees of open projects" value={fmt.money(sum.openFees, { cents: false })} />
                    <StatTile label="Still to invoice" value={fmt.money(sum.toInvoice, { cents: false })} sub="fees not invoiced yet" />
                    <StatTile label="Due in 14 days" value={String(sum.dueSoon.length)} delta={sum.overdue ? `${sum.overdue} overdue` : undefined} deltaGood={sum.overdue ? false : undefined} sub={sum.dueSoon[0] ? `next: ${sum.dueSoon[0].name}` : undefined} />
                  </div>
                  {list.length === 0 ? (
                    <div className="biz-empty-line">No project matches these filters.</div>
                  ) : view === 'list' ? (
                    <ProjectList b={b} list={list} fin={fin} onOpen={select} />
                  ) : view === 'board' ? (
                    <ProjectBoard b={b} list={list} fin={fin} onOpen={select} showClosed={status !== 'open'} />
                  ) : (
                    <ProjectTimeline b={b} list={list} fin={fin} onOpen={select} />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- card */

interface ViewProps {
  b: BusinessData;
  list: BizProject[];
  fin: Map<string, ProjectFinancials>;
  onOpen: (id: string) => void;
}

function ProjectCard({ b, p, f, onOpen, compact }: { b: BusinessData; p: BizProject; f: ProjectFinancials; onOpen: (id: string) => void; compact?: boolean }) {
  const fmt = useFmt();
  const client = clientLabel(b, p.clientId);
  return (
    <div role="button" className={`wk-card ${compact ? 'compact' : ''}`} style={{ ['--pc' as string]: projectColor(p) } as CSSProperties} onClick={() => onOpen(p.id)} {...rowKeys(() => onOpen(p.id))}>
      <div className="wk-card-top">
        <span className="wk-card-name ellipsis">{p.name || 'Untitled project'}</span>
        {!compact && <OptionPill value={p.status} options={PROJECT_STATUSES} />}
      </div>
      <div className="wk-card-sub ellipsis">
        {client || 'Internal'}
        {p.dueDate ? (
          <span className={f.overdue ? 'biz-out' : ''}>
            {' '}
            · {f.overdue ? <AlertTriangle size={11} style={{ verticalAlign: -1 }} /> : null} due {fmt.dateShort(p.dueDate)}
          </span>
        ) : null}
      </div>
      {f.tasksTotal > 0 && (
        <div className="wk-card-progress">
          <Meter value={f.tasksDone} max={f.tasksTotal} tone={f.progress >= 1 ? 'good' : undefined} label={`${p.name} tasks done`} />
          <span className="tiny muted">
            {f.tasksDone}/{f.tasksTotal}
          </span>
        </div>
      )}
      <div className="wk-card-money">
        <span title="Fee">{f.fee ? fmt.money(f.fee, { cents: false }) : <span className="muted">No fee</span>}</span>
        {f.invoiced > 0 && <span className="muted small" title="Invoiced">{fmt.money(f.invoiced, { cents: false })} invoiced</span>}
        {f.toInvoice > 0 && isOpenProject(p) && <span className="biz-tag" title="Fee not invoiced yet">{fmt.money(f.toInvoice, { cents: false })} to invoice</span>}
      </div>
      {!compact && f.nextTask && (
        <div className="wk-card-next ellipsis muted small">
          Next: {f.nextTask.title || 'Untitled task'}
          {f.nextTask.due ? ` · ${fmt.dateShort(f.nextTask.due)}` : ''}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- list */

function ProjectList({ b, list, fin, onOpen }: ViewProps) {
  const fmt = useFmt();
  const order: BizProjectStatus[] = ['active', 'review', 'planning', 'on_hold', 'done', 'cancelled'];
  const groups = [...PROJECT_STATUSES].sort((a, z) => order.indexOf(a.value) - order.indexOf(z.value)).map((s) => ({ s, items: list.filter((p) => p.status === s.value).sort((a, z) => (a.dueDate ?? '9999').localeCompare(z.dueDate ?? '9999') || a.name.localeCompare(z.name)) })).filter((g) => g.items.length);
  return (
    <div className="wk-groups">
      {groups.map(({ s, items }) => (
        <section key={s.value} className="wk-group">
          <div className="wk-group-head">
            <OptionPill value={s.value} options={PROJECT_STATUSES} />
            <span className="muted small">{plural(items.length, 'project')}</span>
            <div className="spacer" />
            <span className="muted small">
              fees {fmt.money(items.reduce((n, p) => n + fin.get(p.id)!.fee, 0), { cents: false })} · received {fmt.money(items.reduce((n, p) => n + fin.get(p.id)!.received, 0), { cents: false })}
            </span>
          </div>
          <div className="wk-rows">
            {items.map((p) => {
              const f = fin.get(p.id)!;
              return (
                <div key={p.id} role="button" className="wk-row" style={{ ['--pc' as string]: projectColor(p) } as CSSProperties} onClick={() => onOpen(p.id)} {...rowKeys(() => onOpen(p.id))}>
                  <span className="wk-row-bar" />
                  <span className="wk-row-main">
                    <span className="ellipsis biz-strong">{p.name || 'Untitled project'}</span>
                    <span className="ellipsis muted small">
                      {clientLabel(b, p.clientId) || 'Internal'}
                      {f.nextTask ? ` · next: ${f.nextTask.title || 'task'}` : ''}
                    </span>
                  </span>
                  <span className="wk-row-dates small">
                    {p.startDate || p.dueDate ? (
                      <>
                        {p.startDate ? fmt.dateShort(p.startDate) : '…'} → <span className={f.overdue ? 'biz-out' : ''}>{p.dueDate ? fmt.dateShort(p.dueDate) : '…'}</span>
                      </>
                    ) : (
                      <span className="muted">No dates</span>
                    )}
                  </span>
                  <span className="wk-row-progress">
                    {f.tasksTotal ? (
                      <>
                        <Meter value={f.tasksDone} max={f.tasksTotal} tone={f.progress >= 1 ? 'good' : undefined} label="Tasks done" />
                        <span className="tiny muted">{Math.round(f.progress * 100)}%</span>
                      </>
                    ) : (
                      <span className="tiny muted">No tasks</span>
                    )}
                  </span>
                  <span className="wk-row-money">
                    <Money value={f.fee} strong />
                    <span className="tiny muted">{f.received ? `${fmt.money(f.received, { cents: false })} received` : f.invoiced ? `${fmt.money(f.invoiced, { cents: false })} invoiced` : 'nothing invoiced'}</span>
                  </span>
                  <span className="wk-row-money biz-hide-narrow">
                    <Money value={f.expectedProfit} tone="auto" />
                    <span className="tiny muted">expected profit</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- board */

function DraggableCard({ b, p, f, onOpen }: { b: BusinessData; p: BizProject; f: ProjectFinancials; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`wk-drag ${isDragging ? 'dragging' : ''}`}>
      <ProjectCard b={b} p={p} f={f} onOpen={onOpen} compact />
    </div>
  );
}

function BoardColumn({ status, children, count }: { status: (typeof PROJECT_STATUSES)[number]; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <div ref={setNodeRef} className={`wk-col ${isOver ? 'over' : ''}`}>
      <div className="wk-col-head">
        <OptionPill value={status.value} options={PROJECT_STATUSES} />
        <span className="muted small">{count}</span>
      </div>
      <div className="wk-col-body">{children}</div>
    </div>
  );
}

function ProjectBoard({ b, list, fin, onOpen, showClosed }: ViewProps & { showClosed: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragId, setDragId] = useState<string | null>(null);
  const cols = PROJECT_STATUSES.filter((s) => s.open || showClosed || s.value === 'done');
  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const to = e.over?.id as BizProjectStatus | undefined;
    const p = list.find((x) => x.id === e.active.id);
    if (!p || !to || p.status === to) return;
    setProjectStatus(p.id, to);
    toast(`${p.name || 'Project'} → ${projectStatusInfo(to).label}`);
  };
  const dragged = list.find((p) => p.id === dragId);
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
      <div className="wk-board">
        {cols.map((s) => {
          const items = list.filter((p) => p.status === s.value).sort((a, z) => (a.dueDate ?? '9999').localeCompare(z.dueDate ?? '9999'));
          return (
            <BoardColumn key={s.value} status={s} count={items.length}>
              {items.map((p) => (
                <DraggableCard key={p.id} b={b} p={p} f={fin.get(p.id)!} onOpen={onOpen} />
              ))}
              {!items.length && <div className="wk-col-empty">Drop a project here</div>}
            </BoardColumn>
          );
        })}
      </div>
      <DragOverlay>{dragged ? <ProjectCard b={b} p={dragged} f={fin.get(dragged.id)!} onOpen={() => undefined} compact /> : null}</DragOverlay>
    </DndContext>
  );
}

/* ---------------------------------------------------------------- timeline */

function ProjectTimeline({ b, list, fin, onOpen }: ViewProps) {
  const fmt = useFmt();
  const today = useToday();
  const dated = list.filter((p) => p.startDate || p.dueDate).sort((a, z) => (a.startDate || a.dueDate || '').localeCompare(z.startDate || z.dueDate || ''));
  const undated = list.filter((p) => !p.startDate && !p.dueDate);
  if (!dated.length)
    return (
      <EmptyState icon={CalendarRange} title="No dates yet" description="Give your projects a start and due date (and mark key tasks as milestones) to see them on the timeline." />
    );
  const dates: string[] = [today];
  for (const p of dated) {
    if (p.startDate) dates.push(p.startDate);
    if (p.dueDate) dates.push(p.dueDate);
    for (const t of p.tasks) if (t.milestone && t.due) dates.push(t.due);
  }
  dates.sort();
  const from = addDays(`${dates[0].slice(0, 7)}-01`, 0);
  const lastMonth = dates[dates.length - 1].slice(0, 7);
  const to = addDays(`${lastMonth}-01`, 40).slice(0, 7) + '-01';
  const total = Math.max(1, diffDays(from, to));
  const pos = (d: string) => `${Math.min(100, Math.max(0, (diffDays(from, d) / total) * 100))}%`;
  const months: string[] = [];
  for (let m = from; m < to; m = `${addDays(m, 32).slice(0, 7)}-01`) months.push(m);
  return (
    <div className="wk-tl">
      <div className="wk-tl-scroll">
        <div className="wk-tl-inner">
          <div className="wk-tl-row wk-tl-head">
            <div className="wk-tl-label muted small">Project</div>
            <div className="wk-tl-track">
              {months.map((m) => (
                <span key={m} className="wk-tl-month" style={{ left: pos(m) }}>
                  {MONTHS_SHORT[Number(m.slice(5, 7)) - 1]}
                  {m === from || m.slice(5, 7) === '01' ? ` ${m.slice(0, 4)}` : ''}
                </span>
              ))}
            </div>
          </div>
          {dated.map((p) => {
            const f = fin.get(p.id)!;
            const s = p.startDate || p.dueDate!;
            const e = p.dueDate || p.startDate!;
            const color = projectColor(p);
            return (
              <div key={p.id} className="wk-tl-row">
                <button type="button" className="wk-tl-label wk-tl-name" onClick={() => onOpen(p.id)} title={`Open ${p.name}`}>
                  <span className="ellipsis biz-strong">{p.name || 'Untitled project'}</span>
                  <span className="ellipsis tiny muted">{clientLabel(b, p.clientId) || 'Internal'}</span>
                </button>
                <div className="wk-tl-track">
                  {months.map((m) => (
                    <span key={m} className="wk-tl-grid" style={{ left: pos(m) }} />
                  ))}
                  <span className="wk-tl-today" style={{ left: pos(today) }} title={`Today ${fmt.dateMedium(today)}`} />
                  <button
                    type="button"
                    className={`wk-tl-bar ${f.overdue ? 'late' : ''} ${isOpenProject(p) ? '' : 'closed'}`}
                    style={{ left: pos(s), width: `max(10px, calc(${pos(e)} - ${pos(s)}))`, ['--pc' as string]: color } as CSSProperties}
                    onClick={() => onOpen(p.id)}
                    title={`${p.name}: ${fmt.dateMedium(s)} → ${fmt.dateMedium(e)} · ${Math.round(f.progress * 100)}% done`}
                  >
                    <span className="wk-tl-fill" style={{ width: `${Math.round(f.progress * 100)}%` }} />
                  </button>
                  {p.tasks
                    .filter((t) => t.milestone && t.due)
                    .map((t) => (
                      <span key={t.id} className={`wk-tl-ms ${t.done ? 'done' : t.due! < today ? 'late' : ''}`} style={{ left: pos(t.due!), ['--pc' as string]: color } as CSSProperties} title={`${t.title || 'Milestone'} · ${fmt.dateMedium(t.due)}${t.done ? ' · done' : ''}`}>
                        <Diamond size={11} />
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="wk-tl-legend muted small">
        <span>
          <span className="wk-tl-key bar" /> start → due (filled = tasks done)
        </span>
        <span>
          <Diamond size={11} /> milestone
        </span>
        <span>
          <span className="wk-tl-key today" /> today
        </span>
      </div>
      {undated.length > 0 && (
        <div className="biz-empty-line">
          Without dates: {undated.map((p, i) => (
            <span key={p.id}>
              {i ? ', ' : ''}
              <button type="button" className="biz-link" onClick={() => onOpen(p.id)}>
                {p.name || 'Untitled project'}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
