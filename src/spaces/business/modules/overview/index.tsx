/* Business overview: money at a glance (income first), the sales pipeline and
   projects, receivables, contractors, time, due dates, goals and growth
   initiatives, the 12-month chart, profile and linked Marketing Spaces / Productions. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { AlertTriangle, BriefcaseBusiness, CalendarClock, CheckCircle2, Circle, Clapperboard, Clock, FileText, FolderKanban, Link2, Megaphone, Pencil, Plus, Receipt, Rocket, Settings2, Target, UserRound, X } from 'lucide-react';
import { updateSpace, useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { addDays } from '@/lib/dates';
import { openSpaceById } from '@/shell/spaceActions';
import { openProjectById } from '@/shell/projectActions';
import { useProjectList } from '@/spaces/ui';
import { Button, Card, EmptyState, ExportMenu, Menu, ModuleHeader, type MenuItem } from '@/ui';
import { BarList, LineChart, Meter, StatTile } from '@/ui/charts';
import { BUSINESS_TYPES, DEAL_STAGES, INVOICE_STATUSES, PROJECT_STATUSES, STREAM_TYPES } from '../../constants';
import { dealContact, goalProgress, initiativeProgress, isOpenInitiative, isOpenProject, pipelineSummary, projectFinancials, projectsSummary } from '../../derive-work';
import { arAging, clientLabel, entryValue, formatDuration, incomeRows, inRange, invoiceStatus, invoiceTotal, minutesIn, monthLabel, monthSeries, periodRange, profitLoss, sumAmount, totalOwedToContractors, unbilledEntries, upcoming, weekStartOf } from '../../derive';
import { createInvoice, startTimer } from '../../ops';
import { ProfileDialog, SettingsDialog } from '../../dialogs';
import { Money, OptionPill, useBiz, useFmt, useNavParams, useToday, useMarketingSpaces } from '../../ui';

export default function BusinessOverview() {
  const b = useBiz();
  const meta = useSpace((s) => s.meta);
  const spaceIds = useSpace((s) => s.spaceIds) ?? [];
  const projectIds = useSpace((s) => s.projectIds);
  const mondayFirst = useSpace((s) => s.settings.weekStartsMonday);
  const fmt = useFmt();
  const today = useToday();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const projects = useProjectList();
  const spaces = useMarketingSpaces();

  useNavParams((p) => {
    if (p.card === 'profile') setProfileOpen(true);
    if (p.card === 'settings') setSettingsOpen(true);
    if (p.card === 'links') requestAnimationFrame(() => document.getElementById('biz-links')?.scrollIntoView({ behavior: 'smooth' }));
  });

  const data = useMemo(() => {
    const month = profitLoss(b, periodRange('this_month', today));
    const ytd = profitLoss(b, periodRange('ytd', today));
    const ar = arAging(b, today);
    const ws = weekStartOf(today, mondayFirst);
    const weekMins = minutesIn(b, { from: ws, to: addDays(ws, 6) });
    const billableWeek = minutesIn(b, { from: ws, to: addDays(ws, 6) }, (t) => t.billable);
    const unbilled = unbilledEntries(b);
    const unbilledValue = sumAmount(unbilled.map((e) => ({ amount: entryValue(b, e) })));
    const series = monthSeries(b, today, 12);
    const due = upcoming(b, today, 30);
    const owed = totalOwedToContractors(b);
    const owedCount = new Set(b.payments.filter((p) => p.status !== 'paid').map((p) => p.contractorId)).size;
    const monthRange = periodRange('this_month', today);
    const inc = incomeRows(b).filter((r) => inRange(r.date, monthRange));
    const streams = b.streams.filter((s) => s.active).map((s) => ({ s, actual: sumAmount(inc.filter((r) => r.streamId === s.id)) }));
    const open = b.invoices.filter((i) => i.status === 'sent').sort((a, z) => (a.dueDate ?? '').localeCompare(z.dueDate ?? ''));
    const pipe = pipelineSummary(b, today, periodRange('ytd', today));
    const proj = projectsSummary(b, today);
    const openProjects = b.projects
      .filter(isOpenProject)
      .map((p) => ({ p, f: projectFinancials(b, p, today) }))
      .sort((a, z) => Number(z.f.overdue) - Number(a.f.overdue) || (a.p.dueDate ?? '9999').localeCompare(z.p.dueDate ?? '9999'));
    const goals = b.strategy.goals.filter((g) => !g.done).map((g) => ({ g, pr: goalProgress(b, g, today) }));
    const inits = b.initiatives.filter(isOpenInitiative).map((i) => ({ i, pr: initiativeProgress(b, i, today) }));
    return { month, ytd, ar, weekMins, billableWeek, unbilled, unbilledValue, series, due, owed, owedCount, streams, open, pipe, proj, openProjects, goals, inits };
  }, [b, today, mondayFirst]);

  const type = BUSINESS_TYPES.find((t) => t.value === b.profile.type);
  const fresh = !b.clients.length && !b.invoices.length && !b.expenses.length && !b.income.length && !b.time.length && !b.deals.length && !b.projects.length;
  const hasSeries = data.series.some((m) => m.income || m.expenses);

  const newInvoice = () => {
    const inv = createInvoice();
    navigateSpace('invoices', { invoiceId: inv.id });
  };

  const linkedSpaces = spaceIds.map((id) => ({ id, s: spaces.find((x) => x.id === id) }));
  const linkedProjects = projectIds.map((id) => ({ id, p: projects.find((x) => x.id === id) }));
  const spaceItems: MenuItem[] = spaces.filter((s) => !spaceIds.includes(s.id) && !s.demo).map((s) => ({ label: s.title || 'Untitled space', swatch: s.color, onClick: () => updateSpace((d) => void (d.spaceIds = [...(d.spaceIds ?? []), s.id])) }));
  const projectItems: MenuItem[] = projects.filter((p) => !projectIds.includes(p.id) && !p.demo).map((p) => ({ label: p.title || 'Untitled project', swatch: p.color, onClick: () => updateSpace((d) => void d.projectIds.push(p.id)) }));
  const linkMenu: MenuItem[] = [
    { header: 'Marketing Spaces' },
    ...(spaceItems.length ? spaceItems : [{ label: spaces.length ? 'All linked' : 'No Marketing Spaces yet', disabled: true }]),
    { separator: true },
    { header: 'Productions' },
    ...(projectItems.length ? projectItems : [{ label: projects.length ? 'All linked' : 'No productions yet', disabled: true }]),
  ];

  const steps = [
    { done: !!(b.profile.legalName && b.profile.ownerName), label: 'Fill in your business profile', action: () => setProfileOpen(true) },
    { done: b.clients.length > 0, label: 'Add a client', action: () => navigateSpace('clients', { new: true }) },
    { done: b.invoices.length > 0, label: 'Create your first invoice', action: newInvoice },
    { done: b.expenses.length > 0, label: 'Log an expense (drop a receipt)', action: () => navigateSpace('expenses', { new: true }) },
    { done: b.time.length > 0 || !!b.timer, label: 'Track time', action: () => navigateSpace('time') },
    { done: b.docs.length > 0, label: 'Generate an agreement', action: () => navigateSpace('legal') },
    { done: b.deals.length > 0, label: 'Add a lead to your sales pipeline', action: () => navigateSpace('pipeline') },
    { done: b.projects.length > 0, label: 'Plan a project', action: () => navigateSpace('projects') },
    { done: !!(b.strategy.mission || b.strategy.positioning || b.strategy.offers.length), label: 'Write your strategy and offers', action: () => navigateSpace('strategy') },
  ];

  return (
    <div className="module biz">
      <ModuleHeader
        title={meta.title || 'Business'}
        icon={BriefcaseBusiness}
        subtitle={[type ? `${type.emoji} ${type.label}` : '', b.profile.legalName && b.profile.legalName !== meta.title ? b.profile.legalName : '', b.profile.role].filter(Boolean).join(' · ')}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-biz-pl', label: 'Profit & Loss (year to date)', options: { period: 'ytd' } },
                { id: 'space-biz-pipeline', label: 'Sales pipeline report', options: { period: 'ytd' } },
                { id: 'space-biz-projects', label: 'Projects report' },
                { id: 'space-biz-strategy', label: 'Business plan (strategy)' },
                { id: 'space-biz-expenses', label: 'Expense report (this month)', options: { period: 'this_month' } },
                { id: 'space-biz-time', label: 'Time report (this month)', options: { period: 'this_month' } },
                { id: 'space-biz-contractors', label: 'Contractor payments', options: { period: 'ytd' } },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={newInvoice}>
              New invoice
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="biz-page">
          <div className="biz-kpis">
            <StatTile label="Income this month" value={fmt.money(data.month.income, { cents: false })} sub={`${fmt.money(data.ytd.income, { cents: false })} this year`} onClick={() => navigateSpace('income')} />
            <StatTile label="Expenses this month" value={fmt.money(data.month.expenses, { cents: false })} sub={`${fmt.money(data.ytd.expenses, { cents: false })} this year`} onClick={() => navigateSpace('expenses')} />
            <StatTile label="Profit this month" value={<span className={data.month.profit < 0 ? 'biz-out' : ''}>{fmt.money(data.month.profit, { cents: false })}</span>} sub={`${fmt.money(data.ytd.profit, { cents: false })} year to date`} />
            <StatTile
              label="Outstanding invoices"
              value={fmt.money(data.ar.total, { cents: false })}
              delta={data.ar.overdueCount ? `${data.ar.overdueCount} overdue` : undefined}
              deltaGood={data.ar.overdueCount ? false : undefined}
              sub={data.ar.overdueCount ? fmt.money(data.ar.overdue, { cents: false }) : `${data.ar.openCount} open`}
              onClick={() => navigateSpace('invoices', { status: data.ar.overdueCount ? 'overdue' : 'open' })}
            />
            <StatTile label="Owed to contractors" value={fmt.money(data.owed, { cents: false })} sub={data.owedCount ? `${data.owedCount} contractor${data.owedCount === 1 ? '' : 's'}` : 'All paid'} onClick={() => navigateSpace('contractors')} />
            <StatTile label="Open pipeline" value={fmt.money(data.pipe.openValue, { cents: false })} sub={`${fmt.money(data.pipe.weighted, { cents: false })} weighted · ${data.pipe.openCount} deal${data.pipe.openCount === 1 ? '' : 's'}`} delta={data.pipe.followUpsDue.length ? `${data.pipe.followUpsDue.length} follow-up${data.pipe.followUpsDue.length === 1 ? '' : 's'} due` : undefined} deltaGood={data.pipe.followUpsDue.length ? false : undefined} onClick={() => navigateSpace('pipeline')} />
            <StatTile label="Active projects" value={String(data.proj.open)} sub={`${fmt.money(data.proj.toInvoice, { cents: false })} still to invoice`} delta={data.proj.overdue ? `${data.proj.overdue} overdue` : undefined} deltaGood={data.proj.overdue ? false : undefined} onClick={() => navigateSpace('projects')} />
            <StatTile label="Time this week" value={formatDuration(data.weekMins)} sub={`${formatDuration(data.billableWeek)} billable · ${fmt.money(data.unbilledValue, { cents: false })} unbilled`} onClick={() => navigateSpace('time')} />
          </div>

          {fresh && (
            <Card title="Get set up">
              <div className="biz-steps">
                {steps.map((s, i) => (
                  <button key={i} type="button" className={`biz-step ${s.done ? 'done' : ''}`} onClick={s.action}>
                    {s.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <div className="biz-grid-2">
            <Card title="Income vs expenses · last 12 months">
              {hasSeries ? (
                <LineChart
                  ariaLabel="Income and expenses per month for the last 12 months"
                  yZero
                  yFormat={(v) => fmt.money(v, { cents: false })}
                  xFormat={(x) => monthLabel(String(x).slice(0, 7))}
                  series={[
                    { id: 'income', label: 'Income', slot: 0, points: data.series.map((m) => ({ x: `${m.month}-01`, y: m.income })) },
                    { id: 'expenses', label: 'Expenses', slot: 1, points: data.series.map((m) => ({ x: `${m.month}-01`, y: m.expenses })) },
                  ]}
                />
              ) : (
                <EmptyState icon={Receipt} title="No money in or out yet" description="Paid invoices, income entries and expenses show up here month by month." />
              )}
            </Card>
            <Card title="Due & upcoming" actions={<span className="muted small">next 30 days</span>}>
              {data.due.length === 0 ? (
                <div className="biz-empty-line">
                  <CalendarClock size={16} /> Nothing due. Invoice due dates, contractor payments, recurring costs and document dates appear here.
                </div>
              ) : (
                <div className="biz-list">
                  {data.due.slice(0, 8).map((d) => (
                    <button key={`${d.kind}-${d.id}`} type="button" className={`biz-list-row ${d.overdue ? 'late' : ''}`} onClick={() => navigateSpace(d.module, d.params)}>
                      <span className="biz-date">{d.overdue ? <AlertTriangle size={13} /> : null}{fmt.dateShort(d.date)}</span>
                      <span className="biz-grow">
                        <span className="ellipsis biz-strong">{d.label}</span>
                        {d.sub && <span className="ellipsis muted small">{d.sub}</span>}
                      </span>
                      {d.amount != null && <Money value={d.amount} />}
                    </button>
                  ))}
                  {data.due.length > 8 && <span className="muted small">+{data.due.length - 8} more</span>}
                </div>
              )}
            </Card>
          </div>

          <div className="biz-grid-2 even">
            <Card
              title="Sales pipeline"
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigateSpace('pipeline')}>
                  Open
                </Button>
              }
            >
              {b.deals.length === 0 ? (
                <div className="biz-empty-line">
                  <Target size={16} /> Track leads and proposals in Sales Pipeline: value, win chance and next steps show here.
                </div>
              ) : (
                <div className="biz-ov-sales">
                  <div className="biz-ov-mini">
                    <span>
                      <b>{fmt.money(data.pipe.wonValue, { cents: false })}</b>
                      <span className="muted tiny">won this year · {data.pipe.wonCount}</span>
                    </span>
                    <span>
                      <b>{data.pipe.winRate == null ? '—' : `${Math.round(data.pipe.winRate * 100)}%`}</b>
                      <span className="muted tiny">win rate</span>
                    </span>
                    <span>
                      <b>{data.pipe.avgDealSize == null ? '—' : fmt.money(data.pipe.avgDealSize, { cents: false })}</b>
                      <span className="muted tiny">average deal</span>
                    </span>
                  </div>
                  <BarList
                    format={(v) => fmt.money(v, { cents: false })}
                    rows={data.pipe.byStage
                      .filter((st) => DEAL_STAGES.find((d) => d.value === st.stage)?.open)
                      .map((st) => ({ id: st.stage, label: st.label, value: st.value, sub: `${st.count} deal${st.count === 1 ? '' : 's'}`, color: st.color }))}
                    onSelect={(stage) => navigateSpace('pipeline', { stage })}
                  />
                  {(data.pipe.followUpsDue.length > 0 || data.pipe.closingSoon.length > 0) && (
                    <div className="biz-list">
                      {[...data.pipe.followUpsDue.map((d) => ({ d, late: true })), ...data.pipe.closingSoon.filter((d) => !data.pipe.followUpsDue.includes(d)).map((d) => ({ d, late: false }))].slice(0, 4).map(({ d, late }) => (
                        <button key={d.id} type="button" className={`biz-list-row ${late ? 'late' : ''}`} onClick={() => navigateSpace('pipeline', { dealId: d.id })}>
                          <span className="biz-date">
                            {late ? <AlertTriangle size={13} /> : null}
                            {fmt.dateShort((late ? d.nextStepDate : d.expectedClose) ?? '')}
                          </span>
                          <span className="biz-grow">
                            <span className="ellipsis biz-strong">{d.title || 'Untitled deal'}</span>
                            <span className="ellipsis muted small">{late ? d.nextStep || 'Follow up' : `Expected to close · ${dealContact(b, d)}`}</span>
                          </span>
                          {d.value != null && <Money value={d.value} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
            <Card
              title="Projects"
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigateSpace('projects')}>
                  All
                </Button>
              }
            >
              {data.openProjects.length === 0 ? (
                <div className="biz-empty-line">
                  <FolderKanban size={16} /> {b.projects.length ? 'No open projects — everything is delivered.' : 'Plan client work in Projects: tasks, fee, costs, contractors and documents in one place.'}
                </div>
              ) : (
                <div className="biz-ov-projects">
                  <div className="biz-ov-status">
                    {PROJECT_STATUSES.filter((st) => st.open).map((st) => {
                      const n = data.proj.byStatus.find((x) => x.status === st.value)?.count ?? 0;
                      return (
                        <button key={st.value} type="button" className="biz-ov-chip" style={{ ['--cc' as string]: st.color }} onClick={() => navigateSpace('projects', { status: st.value })}>
                          <b>{n}</b> {st.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="biz-list">
                    {data.openProjects.slice(0, 6).map(({ p, f }) => (
                      <button key={p.id} type="button" className={`biz-list-row biz-ov-proj ${f.overdue ? 'late' : ''}`} onClick={() => navigateSpace('projects', { projectId: p.id })}>
                        <span className="biz-grow">
                          <span className="row" style={{ gap: 6 }}>
                            <span className="ellipsis biz-strong">{p.name || 'Untitled project'}</span>
                            <OptionPill value={p.status} options={PROJECT_STATUSES} />
                          </span>
                          <span className="ellipsis muted small">
                            {[clientLabel(b, p.clientId), p.dueDate ? `${f.overdue ? 'overdue since' : 'due'} ${fmt.dateShort(p.dueDate)}` : '', f.tasksTotal ? `${f.tasksDone}/${f.tasksTotal} tasks` : ''].filter(Boolean).join(' · ')}
                          </span>
                          <Meter value={f.progress} max={1} tone={f.overdue ? 'warning' : undefined} label={`${p.name} progress`} />
                        </span>
                        <span className="biz-ov-proj-money">
                          <Money value={f.received} />
                          {f.fee > 0 && <span className="muted tiny">of {fmt.money(f.fee, { cents: false })}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="biz-grid-3">
            <Card title="Open invoices" actions={<Button size="sm" variant="ghost" onClick={() => navigateSpace('invoices')}>All</Button>}>
              {data.open.length === 0 ? (
                <div className="biz-empty-line">
                  <FileText size={16} /> No unpaid invoices.
                </div>
              ) : (
                <div className="biz-list">
                  {data.open.slice(0, 6).map((inv) => (
                    <button key={inv.id} type="button" className="biz-list-row" onClick={() => navigateSpace('invoices', { invoiceId: inv.id })}>
                      <span className="biz-mono">{inv.number}</span>
                      <span className="biz-grow ellipsis">{clientLabel(b, inv.clientId) || 'No client'}</span>
                      <OptionPill value={invoiceStatus(inv, today)} options={INVOICE_STATUSES} />
                      <Money value={invoiceTotal(inv)} />
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Income streams" actions={<Button size="sm" variant="ghost" onClick={() => navigateSpace('income', { tab: 'streams' })}>Manage</Button>}>
              {data.streams.length === 0 ? (
                <div className="biz-empty-line">
                  <Receipt size={16} /> Add your income streams (client work, products, sponsorships …) in Income.
                </div>
              ) : (
                <div className="biz-list">
                  {data.streams.map(({ s, actual }) => (
                    <div key={s.id} className="biz-stream-row">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="biz-grow ellipsis biz-strong">{s.name || 'Unnamed stream'}</span>
                        <OptionPill value={s.type} options={STREAM_TYPES} />
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <Meter value={actual} max={s.expectedMonthly || Math.max(actual, 1)} tone={s.expectedMonthly && actual >= s.expectedMonthly ? 'good' : undefined} label={`${s.name} this month`} />
                        <span className="small biz-nowrap">
                          {fmt.money(actual, { cents: false })}
                          {s.expectedMonthly ? <span className="muted"> / {fmt.money(s.expectedMonthly, { cents: false })}</span> : null}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card
              title="Goals & growth"
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigateSpace('strategy', { section: 'goals' })}>
                  Strategy
                </Button>
              }
            >
              {data.goals.length === 0 && data.inits.length === 0 ? (
                <div className="biz-empty-line">
                  <Rocket size={16} /> Set revenue or client goals in Strategy and track growth initiatives in Growth.
                </div>
              ) : (
                <div className="biz-list">
                  {data.goals.slice(0, 4).map(({ g, pr }) => (
                    <button key={g.id} type="button" className="biz-stream-row biz-ov-goal" onClick={() => navigateSpace('strategy', { section: 'goals' })}>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="biz-grow ellipsis biz-strong">{g.title || 'Untitled goal'}</span>
                        <span className="small biz-nowrap">
                          {g.metric === 'revenue' || g.metric === 'profit' || g.metric === 'pipeline' ? fmt.money(pr.current, { cents: false }) : pr.current.toLocaleString()}
                          {pr.target != null && <span className="muted"> / {g.metric === 'revenue' || g.metric === 'profit' || g.metric === 'pipeline' ? fmt.money(pr.target, { cents: false }) : pr.target.toLocaleString()}</span>}
                        </span>
                      </span>
                      <Meter value={pr.pct ?? 0} max={1} tone={pr.pct != null && pr.pct >= 1 ? 'good' : undefined} label={`${g.title} progress`} />
                    </button>
                  ))}
                  {data.inits.slice(0, 3).map(({ i, pr }) => (
                    <button key={i.id} type="button" className={`biz-list-row ${pr.overdue ? 'late' : ''}`} onClick={() => navigateSpace('growth', { initiativeId: i.id })}>
                      <Rocket size={14} className="muted" />
                      <span className="biz-grow">
                        <span className="ellipsis biz-strong">{i.title || 'Untitled initiative'}</span>
                        <span className="ellipsis muted small">{[i.kpi, pr.current != null && i.target != null ? `${pr.current.toLocaleString()} → ${i.target.toLocaleString()}` : ''].filter(Boolean).join(' · ') || 'Growth initiative'}</span>
                      </span>
                      {pr.pct != null && <span className="small biz-nowrap">{Math.round(pr.pct * 100)}%</span>}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div id="biz-links" className="biz-grid-2 even">
            <Card
              title="Business profile"
              actions={
                <>
                  <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setSettingsOpen(true)}>
                    Settings
                  </Button>
                  <Button size="sm" icon={Pencil} onClick={() => setProfileOpen(true)}>
                    Edit
                  </Button>
                </>
              }
            >
              <dl className="biz-dl">
                <dt>Legal name</dt>
                <dd>{b.profile.legalName || <span className="muted">Not set</span>}</dd>
                <dt>Signer</dt>
                <dd>{[b.profile.ownerName, b.profile.signerTitle].filter(Boolean).join(', ') || <span className="muted">Not set</span>}</dd>
                {b.profile.role && (
                  <>
                    <dt>Your role</dt>
                    <dd>{b.profile.role}</dd>
                  </>
                )}
                <dt>Contact</dt>
                <dd>{[b.profile.email, b.profile.phone].filter(Boolean).join(' · ') || <span className="muted">Not set</span>}</dd>
                <dt>Address</dt>
                <dd className="biz-pre">{b.profile.address || <span className="muted">Not set</span>}</dd>
                <dt>Jurisdiction</dt>
                <dd>{b.profile.jurisdiction || <span className="muted">Not set</span>}</dd>
                <dt>Tax ID</dt>
                <dd>{b.profile.taxId || <span className="muted">Not set</span>}</dd>
                <dt>Invoices</dt>
                <dd>
                  {b.settings.invoicePrefix}… · net {b.settings.paymentTermsDays} days{b.settings.taxPct ? ` · ${b.settings.taxPct}% tax` : ''}
                  {b.settings.hourlyRate ? ` · ${fmt.money(b.settings.hourlyRate)}/h` : ''}
                </dd>
              </dl>
            </Card>
            <Card
              title="Linked Marketing Spaces & Productions"
              actions={
                <Menu align="end" trigger={<Button size="sm" icon={Link2}>Link…</Button>} items={linkMenu} />
              }
            >
              {linkedSpaces.length + linkedProjects.length === 0 ? (
                <div className="biz-empty-line">
                  <Link2 size={16} /> Link the Marketing Spaces this business runs and the productions it makes to jump between them.
                </div>
              ) : (
                <div className="biz-links">
                  {linkedSpaces.map(({ id, s }) => (
                    <div key={id} className="biz-link-card" style={{ ['--lc' as string]: s?.color ?? 'var(--border-strong)' }}>
                      <button type="button" className="biz-link-main" disabled={!s} onClick={() => void openSpaceById(id)} title={s ? `Open ${s.title}` : 'This space was deleted'}>
                        <span className="biz-link-icon">{s?.emoji || <Megaphone size={16} />}</span>
                        <span className="biz-grow">
                          <span className="ellipsis biz-strong">{s?.title ?? 'Deleted Marketing Space'}</span>
                          <span className="muted tiny">Marketing Space{s?.contentCount != null ? ` · ${s.contentCount} pieces` : ''}</span>
                        </span>
                      </button>
                      <button type="button" className="biz-link-x" aria-label="Unlink" title="Unlink" onClick={() => updateSpace((d) => void (d.spaceIds = (d.spaceIds ?? []).filter((x) => x !== id)))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {linkedProjects.map(({ id, p }) => (
                    <div key={id} className="biz-link-card" style={{ ['--lc' as string]: p?.color ?? 'var(--border-strong)' }}>
                      <button type="button" className="biz-link-main" disabled={!p} onClick={() => void openProjectById(id)} title={p ? `Open ${p.title}` : 'This production was deleted'}>
                        <span className="biz-link-icon">
                          <Clapperboard size={16} />
                        </span>
                        <span className="biz-grow">
                          <span className="ellipsis biz-strong">{p?.title ?? 'Deleted production'}</span>
                          <span className="muted tiny">Production{p?.subtitle ? ` · ${p.subtitle}` : ''}</span>
                        </span>
                      </button>
                      <button type="button" className="biz-link-x" aria-label="Unlink" title="Unlink" onClick={() => updateSpace((d) => void (d.projectIds = d.projectIds.filter((x) => x !== id)))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="biz-quick">
            <Button icon={UserRound} onClick={() => navigateSpace('clients', { new: true })}>
              Add client
            </Button>
            <Button icon={Receipt} onClick={() => navigateSpace('expenses', { new: true })}>
              Log expense
            </Button>
            <Button
              icon={Clock}
              disabled={!!b.timer}
              onClick={() => {
                startTimer();
                navigateSpace('time');
              }}
            >
              {b.timer ? 'Timer running' : 'Start timer'}
            </Button>
          </div>
        </div>
      </div>
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
