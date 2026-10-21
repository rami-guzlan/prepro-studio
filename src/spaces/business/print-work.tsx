/* Print documents of the business work sections: one project's brief, the
   projects report and the linked Marketing Spaces & productions. */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Check, KV, PBadge, PSection, PTable, Pre } from '@/print/components';
import { FEE_TYPES, INVOICE_STATUSES, LEGAL_STATUSES, PAYMENT_STATUSES, PROJECT_STATUSES, RATE_TYPES } from './constants';
import { bizOf, clientLabel, formatDuration, invoiceStatus, invoiceTotal, sumAmount } from './derive';
import { contractorOnProject, isOpenProject, projectFinancials, projectLinks, projectStatusInfo, stageInfo } from './derive-work';
import type { BizProject, BusinessData, Contractor } from './types';
import { TEMPLATE_BY_ID } from './templates';
import { linkedUsage, rememberedName } from './modules/linked/derive';

/** The print center groups documents by group; 'Work' must be listed in SpacePrintDocDef['group'] / SPACE_PRINT_GROUPS. */
const GROUP = 'Work' as const;

const optLabel = (opts: { value: string; label: string }[], v?: string) => opts.find((o) => o.value === v)?.label ?? v ?? '';

const WORK_CSS = `
.wp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 6pt; }
.wp-kpi { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 6pt 8pt; }
.wp-kpi .k { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #777; }
.wp-kpi .v { font-size: 13pt; font-weight: 700; margin-top: 2pt; font-variant-numeric: tabular-nums; }
.wp-kpi .s { font-size: 7pt; color: #777; }
.wp-pos { color: #1e8a4c; }
.wp-neg { color: #c92a2a; }
.wp-late { color: #c92a2a; font-weight: 700; }
.wp-bar { position: relative; display: inline-block; width: 60pt; height: 5pt; border-radius: 3pt; background: #e6e6ec; vertical-align: middle; overflow: hidden; margin-right: 4pt; }
.wp-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #4c6ef5; }
.wp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; }
.wp-ms { color: #7950f2; font-weight: 700; }
.wp-swatch { display: inline-block; width: 8pt; height: 8pt; border-radius: 2pt; margin-right: 5pt; vertical-align: -1pt; }
.wp-deliv { margin: 0; padding-left: 12pt; }
.wp-deliv li { margin: 1.5pt 0; }
.wp-money td:first-child { color: #555; }
.wp-money td { padding: 2.5pt 0; font-variant-numeric: tabular-nums; }
.wp-money td:last-child { text-align: right; font-weight: 600; }
.wp-money { border-collapse: collapse; width: 100%; }
.wp-money tr.total td { border-top: 1pt solid #222; padding-top: 4pt; font-weight: 800; }
`;

function Kpis({ items }: { items: { k: string; v: string; s?: string; tone?: 'pos' | 'neg' }[] }) {
  return (
    <div className="wp-kpis pp-avoid">
      {items.map((x, i) => (
        <div key={i} className="wp-kpi">
          <div className="k">{x.k}</div>
          <div className={`v ${x.tone === 'pos' ? 'wp-pos' : x.tone === 'neg' ? 'wp-neg' : ''}`}>{x.v}</div>
          {x.s && <div className="s">{x.s}</div>}
        </div>
      ))}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="wp-bar">
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </span>
  );
}

const statusBadge = (s: BizProject['status']) => <PBadge color={projectStatusInfo(s).color}>{projectStatusInfo(s).label}</PBadge>;

/** Project by id or name; empty = the most recent active project (then open, then any). */
function pickProject(b: BusinessData, ref: string): BizProject | undefined {
  const r = (ref ?? '').trim().toLowerCase();
  if (r) return b.projects.find((p) => p.id === ref.trim()) ?? b.projects.find((p) => p.name.toLowerCase() === r) ?? b.projects.find((p) => p.name.toLowerCase().includes(r));
  const recent = (list: BizProject[]) => [...list].sort((a, z) => (z.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
  return recent(b.projects.filter((p) => p.status === 'active')) ?? recent(b.projects.filter(isOpenProject)) ?? recent(b.projects);
}

function rate(ctx: SpacePrintContext, c: Contractor) {
  if (c.rate == null) return '';
  if (c.rateType === 'rev_share') return `${c.rate}% revenue share`;
  return `${ctx.fmt.money(c.rate)} ${RATE_TYPES.find((x) => x.value === c.rateType)?.unit ?? ''}`.trim();
}

const statusChoices = [{ value: 'open', label: 'Open projects' }, { value: 'all', label: 'All projects' }, ...PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))];

export const workPrintDocs: SpacePrintDocDef[] = [
  /* ---------------------------------------------------------------- project brief */
  {
    id: 'space-biz-project-brief',
    title: 'Project Brief',
    group: GROUP,
    kinds: ['business'],
    description: 'One project: overview, scope & deliverables, tasks & milestones, team with rates, money summary and linked documents',
    options: [
      { key: 'project', label: 'Project (name or id; empty = most recent active project)', type: 'text', default: '' },
      { key: 'money', label: 'Money summary', type: 'boolean', default: true, hint: 'Turn off for a version you share with the client or crew' },
      { key: 'rates', label: 'Contractor rates and pay', type: 'boolean', default: true },
      { key: 'doneTasks', label: 'Include finished tasks', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (bizOf(s).projects.length ? false : 'Create a project in Projects first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const p = pickProject(b, String(ctx.options.project ?? ''));
      if (!p) return { body: <SpaceDocHeader ctx={ctx} title="Project Brief" subtitle={`No project matches “${ctx.options.project}”.`} /> };
      const f = projectFinancials(b, p, ctx.todayISO);
      const l = projectLinks(b, p);
      const m = (n: number) => ctx.fmt.money(n);
      const tasks = p.tasks.filter((t) => ctx.options.doneTasks || !t.done);
      const deliverables = (p.deliverables ?? '').split('\n').map((x) => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
      const who = (a?: string) => (a === 'me' ? b.profile.ownerName || 'Me' : b.contractors.find((c) => c.id === a)?.name ?? '');
      const client = b.clients.find((c) => c.id === p.clientId);
      return {
        css: WORK_CSS,
        title: `Project Brief — ${p.name}`,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title={p.name || 'Project'} subtitle={['Project brief', client ? clientLabel(b, client.id) : 'Internal project'].join(' · ')} meta={statusBadge(p.status)} />
            <KV
              cols={4}
              items={[
                ['Client', client ? [clientLabel(b, client.id), client.company && client.name ? client.company : ''].filter(Boolean).join(', ') : 'Internal'],
                ['Start', p.startDate ? ctx.fmt.date(p.startDate) : ''],
                ['Due', p.dueDate ? <span className={f.overdue ? 'wp-late' : ''}>{ctx.fmt.date(p.dueDate)}</span> : ''],
                ['Completed', p.completedDate ? ctx.fmt.date(p.completedDate) : ''],
                ['Progress', `${Math.round(f.progress * 100)}%${f.tasksTotal ? ` (${f.tasksDone}/${f.tasksTotal} tasks)` : ''}`],
                ['Fee', ctx.options.money && f.fee ? `${m(f.fee)}${p.feeType ? ` · ${optLabel(FEE_TYPES, p.feeType)}` : ''}` : ''],
                ['Deal', l.deal ? `${l.deal.title} (${stageInfo(l.deal.stage).label})` : ''],
                ['Linked', [p.spaceId ? `Marketing Space: ${rememberedName(p.spaceId)?.title ?? p.spaceId}` : '', p.projectId ? `Production: ${rememberedName(p.projectId)?.title ?? p.projectId}` : ''].filter(Boolean).join(' · ')],
              ]}
            />
            {p.description && (
              <PSection title="Overview">
                <Pre>{p.description}</Pre>
              </PSection>
            )}
            {deliverables.length > 0 && (
              <PSection title="Scope & deliverables">
                <ul className="wp-deliv">
                  {deliverables.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </PSection>
            )}
            <PSection title="Tasks & milestones" right={f.tasksTotal ? `${f.tasksDone} of ${f.tasksTotal} done` : undefined}>
              <PTable
                zebra
                rows={tasks}
                empty="No tasks yet."
                columns={[
                  { header: '', width: '5%', cell: (t) => <Check on={t.done} /> },
                  { header: 'Task', cell: (t) => (t.milestone ? <span><span className="wp-ms">◆</span> <b>{t.title}</b></span> : t.title) },
                  { header: 'Due', width: '16%', cell: (t) => (t.due ? <span className={!t.done && t.due < ctx.todayISO ? 'wp-late' : ''}>{ctx.fmt.date(t.due)}</span> : '') },
                  { header: 'Who', width: '20%', cell: (t) => who(t.assignee) },
                ]}
              />
            </PSection>
            {l.contractors.length > 0 && (
              <PSection title="Team & contractors" className="pp-avoid">
                <PTable
                  rows={l.contractors}
                  columns={[
                    { header: 'Name', cell: (c) => <b>{c.name}</b> },
                    { header: 'Role', cell: (c) => c.role ?? '' },
                    { header: 'Contact', cell: (c) => [c.email, c.phone].filter(Boolean).join(' · ') },
                    ...(ctx.options.rates
                      ? [
                          { header: 'Agreed rate', cell: (c: Contractor) => rate(ctx, c) },
                          { header: 'Paid', num: true, cell: (c: Contractor) => m(contractorOnProject(b, c.id, p.id).paid) },
                          { header: 'Owed', num: true, cell: (c: Contractor) => m(contractorOnProject(b, c.id, p.id).owed) },
                        ]
                      : []),
                  ]}
                />
              </PSection>
            )}
            {ctx.options.money && (
              <div className="wp-two pp-avoid">
                <PSection title="Money">
                  <table className="wp-money">
                    <tbody>
                      <tr><td>Fee</td><td>{m(f.fee)}</td></tr>
                      <tr><td>Invoiced</td><td>{m(f.invoiced)}</td></tr>
                      <tr><td>Received</td><td>{m(f.received)}</td></tr>
                      <tr><td>Outstanding</td><td>{m(f.outstanding)}</td></tr>
                      <tr><td>Still to invoice</td><td>{m(f.toInvoice)}</td></tr>
                      <tr><td>Costs (expenses + paid contractors)</td><td>{m(f.costs)}</td></tr>
                      <tr><td>Owed to contractors</td><td>{m(f.owedToContractors)}</td></tr>
                      {p.budget ? <tr><td>Cost budget used</td><td>{m(f.costs + f.owedToContractors)} / {m(p.budget)}</td></tr> : null}
                      <tr><td>Time logged</td><td>{formatDuration(f.minutes)}</td></tr>
                      <tr className="total"><td>Expected profit</td><td className={f.expectedProfit < 0 ? 'wp-neg' : ''}>{m(f.expectedProfit)}</td></tr>
                    </tbody>
                  </table>
                </PSection>
                <PSection title="Invoices">
                  <PTable
                    rows={l.invoices}
                    empty="No invoices linked."
                    columns={[
                      { header: 'No.', cell: (i) => i.number },
                      { header: 'Date', cell: (i) => ctx.fmt.dateShort(i.issueDate) },
                      { header: 'Status', cell: (i) => <PBadge color={INVOICE_STATUSES.find((x) => x.value === invoiceStatus(i, ctx.todayISO))?.color}>{optLabel(INVOICE_STATUSES, invoiceStatus(i, ctx.todayISO))}</PBadge> },
                      { header: 'Total', num: true, cell: (i) => m(invoiceTotal(i)) },
                    ]}
                  />
                  {l.payments.length > 0 && (
                    <PTable
                      style={{ marginTop: '8pt' }}
                      rows={l.payments}
                      columns={[
                        { header: 'Contractor pay', cell: (x) => `${b.contractors.find((c) => c.id === x.contractorId)?.name ?? ''}${x.description ? ` — ${x.description}` : ''}` },
                        { header: 'Status', cell: (x) => <PBadge color={PAYMENT_STATUSES.find((s) => s.value === x.status)?.color}>{optLabel(PAYMENT_STATUSES, x.status)}</PBadge> },
                        { header: 'Amount', num: true, cell: (x) => m(x.amount) },
                      ]}
                    />
                  )}
                </PSection>
              </div>
            )}
            {l.docs.length > 0 && (
              <PSection title="Documents" className="pp-avoid">
                <PTable
                  rows={l.docs}
                  columns={[
                    { header: 'Document', cell: (d) => <b>{d.title || TEMPLATE_BY_ID[d.templateId]?.name}</b> },
                    { header: 'With', cell: (d) => d.party.name },
                    { header: 'Status', cell: (d) => <PBadge color={LEGAL_STATUSES.find((x) => x.value === d.status)?.color}>{optLabel(LEGAL_STATUSES, d.status)}</PBadge> },
                    { header: 'Signed / sent', cell: (d) => (d.signedDate ? `signed ${ctx.fmt.date(d.signedDate)}` : d.sentDate ? `sent ${ctx.fmt.date(d.sentDate)}` : '') },
                  ]}
                />
              </PSection>
            )}
            {p.notes && (
              <PSection title="Notes">
                <Pre>{p.notes}</Pre>
              </PSection>
            )}
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- projects report */
  {
    id: 'space-biz-projects',
    title: 'Projects Report',
    group: GROUP,
    kinds: ['business'],
    orientation: 'landscape',
    description: 'All or open projects with status, client, dates, fee, invoiced, received, costs, profit and progress',
    options: [
      { key: 'status', label: 'Projects', type: 'select', default: 'open', choices: statusChoices },
      { key: 'tasks', label: 'Open tasks per project', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (bizOf(s).projects.length ? false : 'Create a project in Projects first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const st = String(ctx.options.status || 'open');
      const list = b.projects
        .filter((p) => (st === 'all' ? true : st === 'open' ? isOpenProject(p) : p.status === st))
        .sort((a, z) => PROJECT_STATUSES.findIndex((s) => s.value === a.status) - PROJECT_STATUSES.findIndex((s) => s.value === z.status) || (a.dueDate ?? '9999').localeCompare(z.dueDate ?? '9999'));
      const fin = new Map(list.map((p) => [p.id, projectFinancials(b, p, ctx.todayISO)]));
      const tot = (k: 'fee' | 'invoiced' | 'received' | 'costs' | 'expectedProfit' | 'toInvoice') => sumAmount(list.map((p) => ({ amount: fin.get(p.id)![k] })));
      const m = (n: number) => ctx.fmt.money(n);
      const overdue = list.filter((p) => fin.get(p.id)!.overdue).length;
      return {
        css: WORK_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Projects Report" subtitle={statusChoices.find((c) => c.value === st)?.label ?? st} />
            <Kpis
              items={[
                { k: 'Projects', v: String(list.length), s: overdue ? `${overdue} overdue` : undefined },
                { k: 'Fees', v: m(tot('fee')), s: `${m(tot('toInvoice'))} still to invoice` },
                { k: 'Received', v: m(tot('received')), s: `${m(tot('invoiced'))} invoiced` },
                { k: 'Expected profit', v: m(tot('expectedProfit')), s: `costs ${m(tot('costs'))}`, tone: tot('expectedProfit') < 0 ? 'neg' : undefined },
              ]}
            />
            <PTable
              zebra
              rows={list}
              empty="No projects."
              columns={[
                { header: 'Project', cell: (p) => <b>{p.name}</b> },
                { header: 'Status', width: '9%', cell: (p) => statusBadge(p.status) },
                { header: 'Client', cell: (p) => clientLabel(b, p.clientId) || 'Internal' },
                { header: 'Start', width: '8%', cell: (p) => (p.startDate ? ctx.fmt.dateShort(p.startDate) : '') },
                { header: 'Due', width: '8%', cell: (p) => (p.dueDate ? <span className={fin.get(p.id)!.overdue ? 'wp-late' : ''}>{ctx.fmt.dateShort(p.dueDate)}</span> : '') },
                { header: 'Fee', num: true, cell: (p) => m(fin.get(p.id)!.fee) },
                { header: 'Invoiced', num: true, cell: (p) => m(fin.get(p.id)!.invoiced) },
                { header: 'Received', num: true, cell: (p) => m(fin.get(p.id)!.received) },
                { header: 'Costs', num: true, cell: (p) => m(fin.get(p.id)!.costs) },
                { header: 'Exp. profit', num: true, cell: (p) => <span className={fin.get(p.id)!.expectedProfit < 0 ? 'wp-neg' : ''}>{m(fin.get(p.id)!.expectedProfit)}</span> },
                {
                  header: 'Progress',
                  width: '12%',
                  cell: (p) => (
                    <span className="pp-nowrap">
                      <Bar value={fin.get(p.id)!.progress} />
                      {Math.round(fin.get(p.id)!.progress * 100)}%
                    </span>
                  ),
                },
              ]}
              footer={['Total', '', '', '', '', m(tot('fee')), m(tot('invoiced')), m(tot('received')), m(tot('costs')), m(tot('expectedProfit')), '']}
            />
            {ctx.options.tasks &&
              list.map((p) => {
                const open = p.tasks.filter((t) => !t.done);
                if (!open.length) return null;
                return (
                  <PSection key={p.id} title={p.name} right={`${open.length} open tasks`} className="pp-avoid">
                    <PTable
                      rows={open}
                      columns={[
                        { header: 'Task', cell: (t) => (t.milestone ? <span><span className="wp-ms">◆</span> {t.title}</span> : t.title) },
                        { header: 'Due', width: '14%', cell: (t) => (t.due ? <span className={t.due < ctx.todayISO ? 'wp-late' : ''}>{ctx.fmt.date(t.due)}</span> : '') },
                        { header: 'Who', width: '18%', cell: (t) => (t.assignee === 'me' ? 'Me' : b.contractors.find((c) => c.id === t.assignee)?.name ?? '') },
                      ]}
                    />
                  </PSection>
                );
              })}
          </>
        ),
      };
    },
  },

  /* ---------------------------------------------------------------- linked */
  {
    id: 'space-biz-linked',
    title: 'Marketing & Productions',
    group: GROUP,
    kinds: ['business'],
    description: 'Linked Marketing Spaces and productions with what refers to them in the business and their money totals',
    emptyReason: (s) => ((s.spaceIds?.length ?? 0) + (s.projectIds?.length ?? 0) ? false : 'Link a Marketing Space or production in Marketing & Productions first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const m = (n: number) => ctx.fmt.money(n);
      const rows = [
        ...(ctx.space.spaceIds ?? []).map((id) => ({ id, kind: 'Marketing Space', u: linkedUsage(b, 'space', id, ctx.todayISO) })),
        ...(ctx.space.projectIds ?? []).map((id) => ({ id, kind: 'Production', u: linkedUsage(b, 'production', id, ctx.todayISO) })),
      ];
      const name = (id: string, kind: string) => rememberedName(id)?.title ?? `${kind} (${id})`;
      const total = (k: 'invoiced' | 'received' | 'costs' | 'net') => sumAmount(rows.map((r) => ({ amount: r.u[k] })));
      return {
        css: WORK_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Marketing & Productions" subtitle={`${rows.length} linked`} />
            <Kpis
              items={[
                { k: 'Linked', v: String(rows.length), s: `${ctx.space.spaceIds?.length ?? 0} spaces · ${ctx.space.projectIds?.length ?? 0} productions` },
                { k: 'Invoiced', v: m(total('invoiced')) },
                { k: 'Received', v: m(total('received')) },
                { k: 'Net (received − costs)', v: m(total('net')), s: `costs ${m(total('costs'))}`, tone: total('net') < 0 ? 'neg' : undefined },
              ]}
            />
            <PTable
              zebra
              rows={rows}
              columns={[
                {
                  header: 'Name',
                  cell: (r) => (
                    <b>
                      {rememberedName(r.id)?.color && <span className="wp-swatch" style={{ background: rememberedName(r.id)!.color }} />}
                      {name(r.id, r.kind)}
                    </b>
                  ),
                },
                { header: 'Type', width: '13%', cell: (r) => r.kind },
                { header: 'Projects & deals', cell: (r) => [...r.u.projects.map((p) => p.name), ...r.u.deals.map((d) => `Deal: ${d.title}`)].join(', ') },
                { header: 'Invoices', width: '8%', num: true, cell: (r) => String(r.u.invoices.length) },
                { header: 'Invoiced', num: true, cell: (r) => m(r.u.invoiced) },
                { header: 'Received', num: true, cell: (r) => m(r.u.received) },
                { header: 'Costs', num: true, cell: (r) => m(r.u.costs) },
                { header: 'Net', num: true, cell: (r) => <span className={r.u.net < 0 ? 'wp-neg' : ''}>{m(r.u.net)}</span> },
              ]}
              footer={['Total', '', '', '', m(total('invoiced')), m(total('received')), m(total('costs')), m(total('net'))]}
            />
            {rows.map((r) => {
              if (!r.u.invoices.length && !r.u.expenses.length) return null;
              return (
                <PSection key={r.id} title={name(r.id, r.kind)} right={r.kind} className="pp-avoid">
                  <PTable
                    rows={[
                      ...r.u.invoices.map((i) => ({ id: i.id, date: i.issueDate, what: `Invoice ${i.number}${i.title ? ` — ${i.title}` : ''}`, who: clientLabel(b, i.clientId), status: optLabel(INVOICE_STATUSES, invoiceStatus(i, ctx.todayISO)), amount: invoiceTotal(i), out: false })),
                      ...r.u.expenses.map((e) => ({ id: e.id, date: e.date, what: e.description || 'Expense', who: e.vendor ?? '', status: 'expense', amount: e.amount, out: true })),
                    ].sort((a, z) => a.date.localeCompare(z.date))}
                    columns={[
                      { header: 'Date', width: '12%', cell: (x) => ctx.fmt.dateShort(x.date) },
                      { header: 'What', cell: (x) => x.what },
                      { header: 'Client / vendor', cell: (x) => x.who },
                      { header: 'Status', width: '11%', cell: (x) => x.status },
                      { header: 'Amount', width: '13%', num: true, cell: (x) => <span className={x.out ? 'wp-neg' : ''}>{x.out ? `−${m(x.amount)}` : m(x.amount)}</span> },
                    ]}
                  />
                </PSection>
              );
            })}
          </>
        ),
      };
    },
  },
];
