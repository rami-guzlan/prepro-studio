/* One business project: details, tasks & milestones, money (from projectFinancials)
   with linked invoices / income / expenses / time / contractor pay, contractors,
   legal documents and links (deal, Marketing Space, production, testimonials,
   portfolio). */
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, Clapperboard, Clock, ExternalLink, FileSignature, FileText, HandCoins, Link2, Megaphone, MoreHorizontal, Plus, Printer, Receipt, Target, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { navigateSpace, openPrint } from '@/store/app';
import { openSpaceById } from '@/shell/spaceActions';
import { openProjectById } from '@/shell/projectActions';
import { useProjectList } from '@/spaces/ui';
import { Avatar, Button, Card, ColorPicker, DataTable, DateInput, Field, Input, Menu, NumberInput, Select, Textarea, confirmDialog, promptDialog, toast, type Column, type MenuItem } from '@/ui';
import { Meter, StatTile } from '@/ui/charts';
import { FEE_TYPES, INVOICE_STATUSES, LEGAL_STATUSES, PAYMENT_STATUSES, PROJECT_STATUSES, RATE_TYPES } from '../../constants';
import { clientLabel, formatDuration, invoiceStatus, invoiceTotal, round2 } from '../../derive';
import { contractorOnProject, projectFinancials, projectLinks, stageInfo } from '../../derive-work';
import { addItem, bizUpdate, makePayment, makeProject, makeTask, removeItems, updateItem } from '../../ops';
import { LEGAL_TEMPLATES, TEMPLATE_BY_ID } from '../../templates';
import { Money, OptionPill, Pill, clientOptions, useBiz, useFmt, useMarketingSpaces, useToday } from '../../ui';
import type { BizProject, BizProjectStatus, BizTask, BusinessData, Contractor, LegalTemplateId } from '../../types';
import { addTask, linkRecords, removeTask, reorderTask, setProjectStatus, updateTask, type LinkKind } from './link';
import { rememberNames } from '../linked/derive';

export function ProjectPage({ p, onBack, onDeleted }: { p: BizProject; onBack: () => void; onDeleted: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const f = useMemo(() => projectFinancials(b, p, today), [b, p, today]);
  const links = useMemo(() => projectLinks(b, p), [b, p]);
  const up = (patch: Partial<BizProject>, coalesce = true) => updateItem('projects', p.id, patch, coalesce);

  const remove = async () => {
    const n = links.invoices.length + links.expenses.length + links.time.length + links.payments.length + links.income.length + links.docs.length;
    const ok = await confirmDialog({
      title: `Delete “${p.name || 'this project'}”?`,
      message: n ? `${plural(n, 'linked record')} (invoices, expenses, time, payments, documents) stay but are no longer linked to a project. You can undo with Ctrl+Z.` : 'You can undo with Ctrl+Z.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (!ok) return;
    removeItems('projects', [p.id]);
    onDeleted();
  };

  const duplicate = () => {
    const { id: _id, ...rest } = JSON.parse(JSON.stringify(p)) as BizProject;
    const copy = makeProject({ ...rest, name: `${p.name} (copy)`, status: 'planning', docIds: [], tasks: rest.tasks.map(({ id: _t, ...t }) => makeTask({ ...t, done: false })) });
    delete copy.completedDate;
    delete copy.dealId;
    addItem('projects', copy);
    toast('Project duplicated (tasks reset, money records not copied)');
  };

  return (
    <div className="biz-editor wk-page" style={{ ['--pc' as string]: p.color || PROJECT_STATUSES.find((s) => s.value === p.status)?.color } as CSSProperties}>
      <div className="biz-editor-head">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Projects
        </Button>
        <div className="biz-editor-title wk-project-name">
          <span className="wk-dot" />
          <Input value={p.name} placeholder="Project name" onChange={(v) => up({ name: v })} aria-label="Project name" />
        </div>
        <div className="biz-editor-actions">
          <Select value={p.status} options={PROJECT_STATUSES} onChange={(v) => setProjectStatus(p.id, v as BizProjectStatus)} aria-label="Status" />
          <Button icon={Printer} onClick={() => openPrint('space-biz-project-brief', { project: p.id })}>
            Brief
          </Button>
          <Menu
            align="end"
            trigger={<Button icon={MoreHorizontal} aria-label="More actions" />}
            items={[
              { label: 'Duplicate project', icon: Plus, onClick: duplicate },
              { separator: true },
              { label: 'Delete project…', icon: Trash2, danger: true, onClick: () => void remove() },
            ]}
          />
        </div>
      </div>
      <div className="biz-editor-body">
        <div className="biz-kpis small">
          <StatTile label="Fee" value={fmt.money(f.fee, { cents: false })} sub={FEE_TYPES.find((x) => x.value === p.feeType)?.label} />
          <StatTile label="Received" value={fmt.money(f.received, { cents: false })} sub={`${fmt.money(f.invoiced, { cents: false })} invoiced`} />
          <StatTile label="Costs" value={fmt.money(f.costs, { cents: false })} sub={f.owedToContractors ? `+ ${fmt.money(f.owedToContractors, { cents: false })} owed` : p.budget ? `budget ${fmt.money(p.budget, { cents: false })}` : undefined} />
          <StatTile label="Expected profit" value={<span className={f.expectedProfit < 0 ? 'biz-out' : ''}>{fmt.money(f.expectedProfit, { cents: false })}</span>} sub={`${fmt.money(f.profit, { cents: false })} so far`} />
          <StatTile label="Progress" value={`${Math.round(f.progress * 100)}%`} sub={f.tasksTotal ? `${f.tasksDone}/${f.tasksTotal} tasks` : 'no tasks yet'} delta={f.overdue ? 'overdue' : undefined} deltaGood={f.overdue ? false : undefined} />
        </div>

        <div className="wk-layout">
          <div className="wk-main">
            <DetailsCard p={p} up={up} />
            <TasksCard p={p} f={f} />
            <RecordsCard p={p} links={links} />
          </div>
          <div className="wk-side">
            <MoneyCard p={p} f={f} />
            <ContractorsCard p={p} links={links} />
            <LegalCard p={p} links={links} />
            <LinksCard p={p} links={links} up={up} />
          </div>
        </div>

        <div className="biz-danger-row">
          <Button variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete project
          </Button>
        </div>
      </div>
    </div>
  );
}

const plural = (n: number, s: string) => `${n} ${n === 1 ? s : `${s}s`}`;
type Links = ReturnType<typeof projectLinks>;

/* ---------------------------------------------------------------- details */

function DetailsCard({ p, up }: { p: BizProject; up: (patch: Partial<BizProject>, coalesce?: boolean) => void }) {
  const b = useBiz();
  const fmt = useFmt();
  return (
    <Card title="Details">
      <div className="biz-form">
        <Field label="Client">
          <div className="row" style={{ gap: 4 }}>
            <Select value={p.clientId ?? ''} placeholder="Internal (no client)" options={clientOptions(b, p.clientId)} onChange={(v) => up({ clientId: v || undefined }, false)} />
            {p.clientId && (
              <Button icon={ExternalLink} aria-label="Open client" title="Open client" onClick={() => navigateSpace('clients', { clientId: p.clientId })} />
            )}
          </div>
        </Field>
        <Field label="Start">
          <DateInput value={p.startDate} onChange={(v) => up({ startDate: v }, false)} />
        </Field>
        <Field label="Due" hint={p.startDate && p.dueDate && p.dueDate < p.startDate ? 'Due date is before the start' : undefined}>
          <DateInput value={p.dueDate} onChange={(v) => up({ dueDate: v }, false)} />
        </Field>
        {p.status === 'done' && (
          <Field label="Completed">
            <DateInput value={p.completedDate} onChange={(v) => up({ completedDate: v }, false)} />
          </Field>
        )}
        <Field label="Fee to the client">
          <NumberInput decimals={2} value={p.fee} placeholder={p.feeType === 'hourly' ? 'billed time' : '0.00'} onChange={(v) => up({ fee: v ?? undefined })} />
        </Field>
        <Field label="Fee type" hint={p.feeType === 'hourly' && p.fee == null ? 'Without a fee, the billable time value counts as the fee' : undefined}>
          <Select value={p.feeType ?? ''} placeholder="—" options={FEE_TYPES} onChange={(v) => up({ feeType: (v || undefined) as BizProject['feeType'] }, false)} />
        </Field>
        <Field label="Cost budget" hint="Contractors and expenses you plan to spend">
          <NumberInput decimals={2} value={p.budget} placeholder={p.fee ? fmt.money(round2(p.fee * 0.3), { cents: false }) : '0.00'} onChange={(v) => up({ budget: v ?? undefined })} />
        </Field>
        <Field label="Colour">
          <ColorPicker value={p.color} allowNone onChange={(v) => up({ color: v }, false)} />
        </Field>
        <Field label="Description" span="all">
          <Textarea autoGrow minRows={2} value={p.description} placeholder="What the project is and why it matters to the client" onChange={(v) => up({ description: v || undefined })} />
        </Field>
        <Field label="Scope & deliverables" span="all" hint="One per line — printed on the project brief">
          <Textarea autoGrow minRows={3} value={p.deliverables} placeholder={'e.g. 1 × 90 s brand film (16:9)\n3 × 15 s cut-downs (9:16)\n2 revision rounds'} onChange={(v) => up({ deliverables: v || undefined })} />
        </Field>
        <Field label="Notes" span="all">
          <Textarea autoGrow minRows={2} value={p.notes} onChange={(v) => up({ notes: v || undefined })} />
        </Field>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- tasks */

function TasksCard({ p, f }: { p: BizProject; f: ReturnType<typeof projectFinancials> }) {
  const b = useBiz();
  const today = useToday();
  const assignees = [{ value: 'me', label: 'Me' }, ...b.contractors.filter((c) => c.active || p.contractorIds.includes(c.id) || p.tasks.some((t) => t.assignee === c.id)).map((c) => ({ value: c.id, label: c.name || 'Unnamed contractor' }))];
  const add = (milestone = false) => {
    const id = addTask(p.id, { title: '', milestone: milestone || undefined, assignee: 'me' });
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-task="${id}"] input, .wk-tasks tr:last-child td:nth-child(3) input`)?.focus());
  };
  const cols: Column<BizTask>[] = [
    { key: 'done', header: 'Done', type: 'checkbox', width: 52, align: 'center' },
    {
      key: 'milestone',
      header: '◆',
      width: 44,
      align: 'center',
      render: (t) => (
        <button type="button" className={`wk-ms-toggle ${t.milestone ? 'on' : ''}`} title={t.milestone ? 'Milestone (shown on the timeline)' : 'Make this a milestone'} aria-pressed={!!t.milestone} onClick={() => updateTask(p.id, t.id, { milestone: t.milestone ? undefined : true }, false)}>
          ◆
        </button>
      ),
    },
    { key: 'title', header: 'Task / milestone', type: 'text', minWidth: 200, placeholder: 'What needs to happen' },
    { key: 'due', header: 'Due', type: 'date', width: 140 },
    { key: 'assignee', header: 'Who', type: 'select', options: assignees, width: 150, placeholder: '—' },
  ];
  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Tasks & milestones
          {f.tasksTotal > 0 && <span className="muted small">{f.tasksDone}/{f.tasksTotal} done</span>}
        </span>
      }
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => add(true)}>
            ◆ Milestone
          </Button>
          <Button size="sm" icon={Plus} onClick={() => add()}>
            Task
          </Button>
        </>
      }
    >
      {f.tasksTotal > 0 && (
        <div className="wk-progress">
          <Meter value={f.tasksDone} max={f.tasksTotal} tone={f.tasksDone === f.tasksTotal ? 'good' : undefined} label="Tasks done" />
          <span className="small">{Math.round((f.tasksDone / f.tasksTotal) * 100)}%</span>
        </div>
      )}
      <div className="wk-tasks">
        <DataTable<BizTask>
          rows={p.tasks}
          columns={cols}
          onChange={(id, patch) => updateTask(p.id, id, patch, !('done' in patch || 'assignee' in patch || 'due' in patch))}
          onReorder={(id, beforeId) => reorderTask(p.id, id, beforeId)}
          onDelete={(t) => removeTask(p.id, t.id)}
          rowStyle={(t) => (t.done ? { opacity: 0.55 } : !t.done && t.due && t.due < today ? { background: 'color-mix(in srgb, var(--danger) 7%, transparent)' } : undefined)}
          emptyText={
            <span>
              No tasks yet — <button type="button" className="biz-link" onClick={() => add()}>add a task</button> or a{' '}
              <button type="button" className="biz-link" onClick={() => add(true)}>milestone</button> (shoot day, first cut, delivery …).
            </span>
          }
        />
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- money */

function MoneyCard({ p, f }: { p: BizProject; f: ReturnType<typeof projectFinancials> }) {
  const fmt = useFmt();
  const spent = round2(f.costs + f.owedToContractors);
  const newInvoice = () => {
    const lines = f.toInvoice > 0 && p.feeType !== 'hourly' ? [{ description: p.name || 'Project fee', qty: 1, unitPrice: f.toInvoice }] : [];
    navigateSpace('invoices', { new: true, clientId: p.clientId, bizProjectId: p.id, title: p.name, lines });
  };
  const rows: [string, ReactNode, string?][] = [
    ['Fee', <Money key="fee" value={f.fee} strong />],
    ['Invoiced', <Money key="inv" value={f.invoiced} />],
    ['Received', <Money key="rec" value={f.received} tone="in" />],
    ['Outstanding', <Money key="out" value={f.outstanding} />, 'sent, not paid yet'],
    ['To invoice', <Money key="toinv" value={f.toInvoice} />, 'fee not invoiced yet'],
    ['Costs', <Money key="costs" value={f.costs} tone="out" />, 'expenses + paid contractors'],
    ['Owed to contractors', <Money key="owed" value={f.owedToContractors} />],
    ['Profit so far', <Money key="profit" value={f.profit} tone="auto" />, 'received − costs'],
    ['Expected profit', <Money key="exp" value={f.expectedProfit} tone="auto" strong />, 'fee − costs − owed'],
    ['Time logged', <span key="time">{formatDuration(f.minutes)}{f.timeValue ? <span className="muted small"> · {fmt.money(f.timeValue, { cents: false })} billable</span> : null}</span>],
  ];
  return (
    <Card title="Money">
      <dl className="wk-money">
        {rows.map(([k, v, hint]) => (
          <div key={k} title={hint}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {p.budget ? (
        <div className="wk-budget">
          <div className="row" style={{ gap: 8 }}>
            <span className="small">Budget used</span>
            <span className="spacer" />
            <span className={`small ${spent > p.budget ? 'biz-out' : ''}`}>
              {fmt.money(spent, { cents: false })} / {fmt.money(p.budget, { cents: false })}
            </span>
          </div>
          <Meter value={spent} max={p.budget} tone={spent > p.budget ? 'critical' : spent > p.budget * 0.85 ? 'warning' : 'good'} label="Budget used" />
        </div>
      ) : null}
      <div className="wk-actions">
        <Button size="sm" variant="primary" icon={FileText} onClick={newInvoice}>
          New invoice
        </Button>
        <Button size="sm" icon={Receipt} onClick={() => navigateSpace('expenses', { new: true, bizProjectId: p.id })}>
          Log expense
        </Button>
        <Button size="sm" icon={Clock} onClick={() => navigateSpace('time', { new: true, bizProjectId: p.id, clientId: p.clientId })}>
          Log time
        </Button>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- linked records */

function RecordsCard({ p, links }: { p: BizProject; links: Links }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const unlink = (kind: LinkKind, id: string) => linkRecords(kind, [id], undefined);
  const X_ = ({ kind, id }: { kind: LinkKind; id: string }) => (
    <button type="button" className="biz-link-x" aria-label="Unlink from project" title="Unlink from this project" onClick={(e) => { e.stopPropagation(); unlink(kind, id); }}>
      <X size={13} />
    </button>
  );
  const sameClient = (cid?: string) => !p.clientId || !cid || cid === p.clientId;
  const candidates = linkCandidates(b, p, sameClient);
  const linkMenu: MenuItem[] = [];
  const section = (header: string, kind: LinkKind, items: { id: string; label: string }[]) => {
    if (!items.length) return;
    if (linkMenu.length) linkMenu.push({ separator: true });
    linkMenu.push({ header });
    for (const it of items) linkMenu.push({ label: it.label, onClick: () => { linkRecords(kind, [it.id], p.id); toast('Linked to this project'); } });
  };
  section('Invoices', 'invoices', candidates.invoices.map((i) => ({ id: i.id, label: `${i.number} · ${clientLabel(b, i.clientId) || 'No client'} · ${fmt.money(invoiceTotal(i))}` })));
  section('Expenses', 'expenses', candidates.expenses.map((e) => ({ id: e.id, label: `${fmt.dateShort(e.date)} · ${e.vendor || e.description || 'Expense'} · ${fmt.money(e.amount)}` })));
  section('Time', 'time', candidates.time.map((t) => ({ id: t.id, label: `${fmt.dateShort(t.date)} · ${t.description || 'Time'} · ${formatDuration(t.minutes)}` })));
  section('Income', 'income', candidates.income.map((e) => ({ id: e.id, label: `${fmt.dateShort(e.date)} · ${e.description || 'Income'} · ${fmt.money(e.amount)}` })));
  section('Contractor pay', 'payments', candidates.payments.map((x) => ({ id: x.id, label: `${b.contractors.find((c) => c.id === x.contractorId)?.name || 'Contractor'} · ${x.description || fmt.dateShort(x.date)} · ${fmt.money(x.amount)}` })));
  const total = links.invoices.length + links.income.length + links.expenses.length + links.time.length + links.payments.length;
  const time = [...links.time].sort((a, z) => z.date.localeCompare(a.date));
  return (
    <Card
      title={`Linked money & time${total ? ` · ${total}` : ''}`}
      actions={<Menu align="end" trigger={<Button size="sm" icon={Link2}>Link existing…</Button>} items={linkMenu.length ? linkMenu : [{ label: 'Nothing unlinked to add', disabled: true }]} />}
    >
      {total === 0 ? (
        <div className="biz-empty-line">
          <Link2 size={16} /> Invoices, income, expenses, time and contractor payments you link to this project add up in Money. Use the buttons there or “Link existing…”.
        </div>
      ) : (
        <div className="wk-records">
          {links.invoices.length > 0 && (
            <RecordGroup icon={FileText} title="Invoices">
              {links.invoices.map((i) => (
                <div key={i.id} role="button" tabIndex={0} className="biz-list-row" onClick={() => navigateSpace('invoices', { invoiceId: i.id })}>
                  <span className="biz-mono">{i.number}</span>
                  <span className="biz-grow ellipsis muted small">{fmt.date(i.issueDate)}{i.title ? ` · ${i.title}` : ''}</span>
                  <OptionPill value={invoiceStatus(i, today)} options={INVOICE_STATUSES} />
                  <Money value={invoiceTotal(i)} />
                  <X_ kind="invoices" id={i.id} />
                </div>
              ))}
            </RecordGroup>
          )}
          {links.income.length > 0 && (
            <RecordGroup icon={HandCoins} title="Income">
              {links.income.map((e) => (
                <div key={e.id} role="button" tabIndex={0} className="biz-list-row" onClick={() => navigateSpace('income', { tab: 'entries' })}>
                  <span className="biz-date">{fmt.dateShort(e.date)}</span>
                  <span className="biz-grow ellipsis">{e.description || 'Income'}</span>
                  <Money value={e.amount} tone="in" />
                  <X_ kind="income" id={e.id} />
                </div>
              ))}
            </RecordGroup>
          )}
          {links.expenses.length > 0 && (
            <RecordGroup icon={Receipt} title="Expenses">
              {links.expenses.map((e) => (
                <div key={e.id} role="button" tabIndex={0} className="biz-list-row" onClick={() => navigateSpace('expenses', { expenseId: e.id })}>
                  <span className="biz-date">{fmt.dateShort(e.date)}</span>
                  <span className="biz-grow ellipsis">{e.vendor || e.description || 'Expense'}{e.vendor && e.description ? <span className="muted small"> · {e.description}</span> : null}</span>
                  <Money value={e.amount} tone="out" />
                  <X_ kind="expenses" id={e.id} />
                </div>
              ))}
            </RecordGroup>
          )}
          {links.payments.length > 0 && (
            <RecordGroup icon={UsersRound} title="Contractor pay">
              {links.payments.map((x) => (
                <div key={x.id} role="button" tabIndex={0} className="biz-list-row" onClick={() => navigateSpace('contractors', { contractorId: x.contractorId })}>
                  <span className="biz-date">{fmt.dateShort(x.date)}</span>
                  <span className="biz-grow ellipsis">
                    {b.contractors.find((c) => c.id === x.contractorId)?.name || 'Contractor'}
                    {x.description ? <span className="muted small"> · {x.description}</span> : null}
                  </span>
                  <OptionPill value={x.status} options={PAYMENT_STATUSES} />
                  <Money value={x.amount} />
                  <X_ kind="payments" id={x.id} />
                </div>
              ))}
            </RecordGroup>
          )}
          {time.length > 0 && (
            <RecordGroup icon={Clock} title={`Time · ${formatDuration(time.reduce((n, t) => n + t.minutes, 0))}`}>
              {time.slice(0, 12).map((t) => (
                <div key={t.id} role="button" tabIndex={0} className="biz-list-row" onClick={() => navigateSpace('time', { entryId: t.id })}>
                  <span className="biz-date">{fmt.dateShort(t.date)}</span>
                  <span className="biz-grow ellipsis">{t.description || 'Time'}</span>
                  <span className="small">{formatDuration(t.minutes)}</span>
                  {t.billable && !t.invoiceId && <span className="biz-tag">Unbilled</span>}
                  <X_ kind="time" id={t.id} />
                </div>
              ))}
              {time.length > 12 && <span className="muted small">+{time.length - 12} more entries</span>}
            </RecordGroup>
          )}
        </div>
      )}
    </Card>
  );
}

function RecordGroup({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: ReactNode }) {
  return (
    <div className="wk-record-group">
      <div className="wk-record-head">
        <Icon size={13} /> {title}
      </div>
      <div className="biz-list">{children}</div>
    </div>
  );
}

/** Records not linked to any project (same client first), newest first, at most 8 per kind. */
function linkCandidates(b: BusinessData, p: BizProject, sameClient: (cid?: string) => boolean) {
  const recent = <T extends { date?: string; issueDate?: string; bizProjectId?: string }>(list: T[], keep: (x: T) => boolean = () => true) =>
    list
      .filter((x) => !x.bizProjectId && keep(x))
      .sort((a, z) => (z.date ?? z.issueDate ?? '').localeCompare(a.date ?? a.issueDate ?? ''))
      .slice(0, 8);
  const contractorIds = new Set(p.contractorIds);
  return {
    invoices: recent(b.invoices, (i) => i.status !== 'void' && sameClient(i.clientId)),
    expenses: recent(b.expenses, (e) => !e.paymentId),
    time: recent(b.time, (t) => sameClient(t.clientId)),
    income: recent(b.income, (e) => !e.invoiceId && sameClient(e.clientId)),
    payments: recent(b.payments, (x) => !contractorIds.size || contractorIds.has(x.contractorId)),
  };
}

/* ---------------------------------------------------------------- contractors */

function rateText(c: Contractor, money: (n: number) => string) {
  if (c.rate == null) return 'No rate agreed';
  if (c.rateType === 'rev_share') return `${c.rate}% revenue share`;
  return `${money(c.rate)} ${RATE_TYPES.find((r) => r.value === c.rateType)?.unit ?? ''}`.trim();
}

function ContractorsCard({ p, links }: { p: BizProject; links: Links }) {
  const b = useBiz();
  const fmt = useFmt();
  const available = b.contractors.filter((c) => !links.contractors.some((x) => x.id === c.id));
  const assign = (id: string) => updateItem('projects', p.id, { contractorIds: [...p.contractorIds, id] }, false);
  const unassign = (id: string) => updateItem('projects', p.id, { contractorIds: p.contractorIds.filter((x) => x !== id) }, false);
  const record = async (c: Contractor) => {
    const def = c.rateType === 'fixed' || c.rateType === 'deliverable' || c.rateType === 'day' ? c.rate : undefined;
    const v = await promptDialog({ title: `Record payment to ${c.name}`, message: `Adds an “owed” entry to their pay log, linked to “${p.name}”. Mark it paid in Contractors (it then counts as a cost).`, defaultValue: def != null ? String(def) : '', placeholder: 'Amount', confirmLabel: 'Add to pay log' });
    if (v == null) return;
    const amount = Number(v.replace(/[^0-9.,-]/g, '').replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) {
      toast('Enter an amount', 'error');
      return;
    }
    bizUpdate((d) => {
      d.payments.unshift(makePayment(c.id, { amount, description: p.name, bizProjectId: p.id }));
      const pr = d.projects.find((x) => x.id === p.id);
      if (pr && !pr.contractorIds.includes(c.id)) pr.contractorIds.push(c.id);
    });
    toast(`${fmt.money(amount)} owed to ${c.name} for this project`, 'success', { action: { label: 'Open pay log', onClick: () => navigateSpace('contractors', { contractorId: c.id }) } });
  };
  return (
    <Card
      title="Team & contractors"
      actions={
        <Menu
          align="end"
          trigger={<Button size="sm" icon={UserPlus}>Assign</Button>}
          items={[
            ...(available.length ? available.map((c) => ({ label: `${c.name || 'Unnamed'}${c.role ? ` · ${c.role}` : ''}`, onClick: () => assign(c.id) })) : [{ label: b.contractors.length ? 'All contractors assigned' : 'No contractors yet', disabled: true }]),
            { separator: true },
            { label: 'Add a contractor…', icon: Plus, onClick: () => navigateSpace('contractors', { new: true }) },
          ]}
        />
      }
    >
      {links.contractors.length === 0 ? (
        <div className="biz-empty-line">
          <UsersRound size={16} /> Assign the editors, crew and freelancers working on this project to track what you pay and owe them here.
        </div>
      ) : (
        <div className="wk-team">
          {links.contractors.map((c) => {
            const on = contractorOnProject(b, c.id, p.id);
            const tasks = p.tasks.filter((t) => t.assignee === c.id && !t.done).length;
            return (
              <div key={c.id} className="wk-member">
                <button type="button" className="wk-member-main" onClick={() => navigateSpace('contractors', { contractorId: c.id })} title="Open contractor">
                  <Avatar name={c.name || '?'} size={28} />
                  <span className="biz-grow">
                    <span className="ellipsis biz-strong">{c.name || 'Unnamed contractor'}</span>
                    <span className="ellipsis muted tiny">
                      {[c.role, rateText(c, (n) => fmt.money(n)), tasks ? `${tasks} open task${tasks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                <span className="wk-member-money">
                  <span className="small">{fmt.money(on.paid, { cents: false })} paid</span>
                  {on.owed > 0 && <span className="small biz-out">{fmt.money(on.owed, { cents: false })} owed</span>}
                </span>
                <span className="wk-member-actions">
                  <Button size="sm" icon={Plus} onClick={() => void record(c)} title="Record a payment for this project">
                    Pay
                  </Button>
                  {p.contractorIds.includes(c.id) && (
                    <button type="button" className="biz-link-x" aria-label="Remove from project" title="Remove from project" onClick={() => unassign(c.id)}>
                      <X size={13} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- legal */

function LegalCard({ p, links }: { p: BizProject; links: Links }) {
  const b = useBiz();
  const others = b.docs.filter((d) => !links.docs.some((x) => x.id === d.id));
  const start = (template: LegalTemplateId) => {
    const t = TEMPLATE_BY_ID[template];
    const contractor = p.contractorIds[0];
    const params: Record<string, unknown> = { template, bizProjectId: p.id };
    if (template === 'contractor' && contractor) Object.assign(params, { partyKind: 'contractor', partyId: contractor });
    else if (p.clientId && t.partyKinds.includes('client')) Object.assign(params, { partyKind: 'client', partyId: p.clientId });
    navigateSpace('legal', params);
  };
  const unlink = (id: string) => {
    bizUpdate((d) => {
      const doc = d.docs.find((x) => x.id === id);
      if (doc && doc.bizProjectId === p.id) delete doc.bizProjectId;
      const pr = d.projects.find((x) => x.id === p.id);
      if (pr) pr.docIds = pr.docIds.filter((x) => x !== id);
    });
  };
  return (
    <Card
      title="Legal documents"
      actions={
        <>
          <Menu
            align="end"
            trigger={<Button size="sm" variant="ghost" icon={Link2} aria-label="Link a document" title="Link an existing document" />}
            items={others.length ? others.map((d) => ({ label: `${d.title || TEMPLATE_BY_ID[d.templateId]?.name} · ${LEGAL_STATUSES.find((s) => s.value === d.status)?.label ?? d.status}`, onClick: () => linkRecords('docs', [d.id], p.id) })) : [{ label: 'No other documents', disabled: true }]}
          />
          <Menu align="end" trigger={<Button size="sm" icon={Plus}>New</Button>} items={LEGAL_TEMPLATES.map((t) => ({ label: t.name, icon: FileSignature, onClick: () => start(t.id) }))} />
        </>
      }
    >
      {links.docs.length === 0 ? (
        <div className="biz-empty-line">
          <FileSignature size={16} /> No agreements yet. Start a Statement of Work or services agreement for the client, or a contractor agreement for your team.
        </div>
      ) : (
        <div className="biz-list">
          {links.docs.map((d) => (
            <div key={d.id} role="button" tabIndex={0} className="biz-list-row" onClick={() => navigateSpace('legal', { docId: d.id })}>
              <FileSignature size={14} className="muted" />
              <span className="biz-grow">
                <span className="ellipsis">{d.title || TEMPLATE_BY_ID[d.templateId]?.name}</span>
                <span className="ellipsis muted tiny">{d.party.name}</span>
              </span>
              <OptionPill value={d.status} options={LEGAL_STATUSES} />
              <button type="button" className="biz-link-x" aria-label="Unlink document" title="Unlink from this project" onClick={(e) => { e.stopPropagation(); unlink(d.id); }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- links */

function LinksCard({ p, links, up }: { p: BizProject; links: Links; up: (patch: Partial<BizProject>, coalesce?: boolean) => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const productions = useProjectList();
  const spaces = useMarketingSpaces();
  const deal = links.deal;
  const space = spaces.find((s) => s.id === p.spaceId);
  const production = productions.find((x) => x.id === p.projectId);
  useEffect(() => {
    rememberNames([...spaces.map((s) => ({ id: s.id, title: s.title, color: s.color })), ...productions.map((x) => ({ id: x.id, title: x.title, color: x.color }))]);
  }, [spaces, productions]);
  const setDeal = (id: string) => {
    bizUpdate((d) => {
      const pr = d.projects.find((x) => x.id === p.id);
      if (!pr) return;
      if (id) pr.dealId = id;
      else delete pr.dealId;
      const dd = id ? d.deals.find((x) => x.id === id) : undefined;
      if (dd && !dd.bizProjectId) dd.bizProjectId = p.id;
    });
  };
  return (
    <Card title="Links">
      <div className="wk-links">
        <div className="wk-link-row">
          <span className="wk-link-icon">
            <Target size={15} />
          </span>
          <div className="biz-grow">
            <span className="muted tiny">Deal it came from</span>
            <Select size="sm" value={p.dealId ?? ''} placeholder={b.deals.length ? 'No deal' : 'No deals yet'} options={b.deals.map((d) => ({ value: d.id, label: `${d.title || 'Untitled deal'} · ${stageInfo(d.stage).label}` }))} onChange={setDeal} aria-label="Deal" />
            {deal && (
              <span className="row small" style={{ gap: 6, marginTop: 4 }}>
                <Pill color={stageInfo(deal.stage).color}>{stageInfo(deal.stage).label}</Pill>
                {deal.value ? <span>{fmt.money(deal.value, { cents: false })}</span> : null}
              </span>
            )}
          </div>
          {deal && <Button size="sm" variant="ghost" icon={ExternalLink} aria-label="Open deal" title="Open in Sales Pipeline" onClick={() => navigateSpace('pipeline', { dealId: deal.id })} />}
        </div>
        <div className="wk-link-row">
          <span className="wk-link-icon" style={space ? ({ ['--lc' as string]: space.color } as CSSProperties) : undefined}>
            {space?.emoji || <Megaphone size={15} />}
          </span>
          <div className="biz-grow">
            <span className="muted tiny">Marketing Space</span>
            <Select
              size="sm"
              value={p.spaceId ?? ''}
              placeholder="None"
              options={spaces.filter((s) => !s.demo || s.id === p.spaceId).map((s) => ({ value: s.id, label: s.title || 'Untitled space' }))}
              onChange={(v) => up({ spaceId: v || undefined }, false)}
              aria-label="Marketing Space"
            />
          </div>
          {p.spaceId && <Button size="sm" variant="ghost" icon={ExternalLink} aria-label="Open Marketing Space" title={space ? `Open ${space.title}` : 'Open'} disabled={!space} onClick={() => void openSpaceById(p.spaceId!)} />}
        </div>
        <div className="wk-link-row">
          <span className="wk-link-icon" style={production ? ({ ['--lc' as string]: production.color } as CSSProperties) : undefined}>
            <Clapperboard size={15} />
          </span>
          <div className="biz-grow">
            <span className="muted tiny">Production</span>
            <Select
              size="sm"
              value={p.projectId ?? ''}
              placeholder="None"
              options={productions.filter((x) => !x.demo || x.id === p.projectId).map((x) => ({ value: x.id, label: x.title || 'Untitled production' }))}
              onChange={(v) => up({ projectId: v || undefined }, false)}
              aria-label="Production"
            />
          </div>
          {p.projectId && <Button size="sm" variant="ghost" icon={ExternalLink} aria-label="Open production" title={production ? `Open ${production.title}` : 'Open'} disabled={!production} onClick={() => void openProjectById(p.projectId!)} />}
        </div>
      </div>
      {(links.testimonials.length > 0 || links.portfolio.length > 0) && (
        <div className="biz-list" style={{ marginTop: 10 }}>
          {links.testimonials.map((t) => (
            <button key={t.id} type="button" className="biz-list-row" onClick={() => navigateSpace('testimonials', { testimonialId: t.id })}>
              <span className="muted">“</span>
              <span className="biz-grow ellipsis small">{t.quote || 'Testimonial'} <span className="muted">— {t.author}</span></span>
            </button>
          ))}
          {links.portfolio.map((x) => (
            <button key={x.id} type="button" className="biz-list-row" onClick={() => navigateSpace('portfolio', { portfolioId: x.id })}>
              <Clapperboard size={13} className="muted" />
              <span className="biz-grow ellipsis small">{x.title || 'Portfolio item'}</span>
            </button>
          ))}
        </div>
      )}
      {!links.testimonials.length && !links.portfolio.length && p.status === 'done' && (
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          Finished? Ask for a{' '}
          <button type="button" className="biz-link" onClick={() => navigateSpace('testimonials', { new: true, clientId: p.clientId, bizProjectId: p.id })}>
            testimonial
          </button>{' '}
          and add it to your{' '}
          <button type="button" className="biz-link" onClick={() => navigateSpace('portfolio', { new: true, clientId: p.clientId, bizProjectId: p.id })}>
            portfolio
          </button>
          .
        </p>
      )}
    </Card>
  );
}
