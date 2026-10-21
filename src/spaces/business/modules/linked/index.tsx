/* Marketing & Productions: the Marketing Spaces and productions this business
   is linked to, each with what in the business refers to it (invoices,
   expenses, projects, deals) and the money tagged to it. */
import '../../biz.css';
import '../../work.css';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { ArrowRightLeft, Clapperboard, ExternalLink, FileText, FolderKanban, Link2, Megaphone, Receipt, Target, Unlink, Wallet } from 'lucide-react';
import type { ProjectSummary } from '@/types';
import type { SpaceSummary } from '@/spaces/types';
import { updateSpace, useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { safeFileName, plural } from '@/lib/text';
import { exportCsv } from '@/backend';
import { PROJECT_TYPES } from '@/lib/constants';
import { SPACE_TYPES } from '@/spaces/constants';
import { openSpaceById } from '@/shell/spaceActions';
import { openProjectById } from '@/shell/projectActions';
import { useProjectList } from '@/spaces/ui';
import { Button, Card, EmptyState, ExportMenu, Menu, ModuleHeader, toast, type MenuItem } from '@/ui';
import { StatTile } from '@/ui/charts';
import { useBiz, useFmt, useMarketingSpaces, useToday } from '../../ui';
import { projectColor } from '../projects/link';
import { linkedUsage, rememberNames, rememberedName, unlinkedReferences, type LinkedKind, type LinkedUsage } from './derive';

export default function LinkedModule() {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const title = useSpace((s) => s.meta.title);
  const spaceIds = useSpace((s) => s.spaceIds) ?? [];
  const projectIds = useSpace((s) => s.projectIds);
  const spaces = useMarketingSpaces();
  const productions = useProjectList();

  useEffect(() => {
    rememberNames([
      ...spaces.map((s) => ({ id: s.id, title: s.title, color: s.color, sub: SPACE_TYPES.find((t) => t.value === s.type)?.label })),
      ...productions.map((p) => ({ id: p.id, title: p.title, color: p.color, sub: PROJECT_TYPES.find((t) => t.value === p.projectType)?.label })),
    ]);
  }, [spaces, productions]);

  const linkSpace = (id: string) => updateSpace((d) => void (d.spaceIds = [...new Set([...(d.spaceIds ?? []), id])]));
  const linkProduction = (id: string) => updateSpace((d) => void (d.projectIds = [...new Set([...d.projectIds, id])]));
  const unlinkSpace = (id: string) => updateSpace((d) => void (d.spaceIds = (d.spaceIds ?? []).filter((x) => x !== id)));
  const unlinkProduction = (id: string) => updateSpace((d) => void (d.projectIds = d.projectIds.filter((x) => x !== id)));

  const usage = useMemo(() => {
    const m = new Map<string, LinkedUsage>();
    for (const id of spaceIds) m.set(`s:${id}`, linkedUsage(b, 'space', id, today));
    for (const id of projectIds) m.set(`p:${id}`, linkedUsage(b, 'production', id, today));
    return m;
  }, [b, spaceIds, projectIds, today]);
  const unlinked = useMemo(() => unlinkedReferences(b, spaceIds, projectIds), [b, spaceIds, projectIds]);

  const spaceItems: MenuItem[] = spaces.filter((s) => !spaceIds.includes(s.id) && !s.demo).map((s) => ({ label: s.title || 'Untitled space', swatch: s.color, onClick: () => linkSpace(s.id) }));
  const prodItems: MenuItem[] = productions.filter((p) => !projectIds.includes(p.id) && !p.demo).map((p) => ({ label: p.title || 'Untitled production', swatch: p.color, onClick: () => linkProduction(p.id) }));
  const linkMenu: MenuItem[] = [
    { header: 'Marketing Spaces' },
    ...(spaceItems.length ? spaceItems : [{ label: spaces.some((x) => !x.demo) ? 'All linked' : 'No Marketing Spaces yet', disabled: true }]),
    { separator: true },
    { header: 'Productions' },
    ...(prodItems.length ? prodItems : [{ label: productions.some((x) => !x.demo) ? 'All linked' : 'No productions yet (demos can’t be linked)', disabled: true }]),
  ];
  const linkButton = (primary = false) => (
    <Menu align="end" trigger={<Button variant={primary ? 'primary' : undefined} icon={Link2}>Link…</Button>} items={linkMenu} />
  );

  const all = [...usage.values()];
  const totals = {
    received: all.reduce((n, u) => n + u.received, 0),
    costs: all.reduce((n, u) => n + u.costs, 0),
    projects: new Set(all.flatMap((u) => u.projects.map((p) => p.id))).size,
  };
  const count = spaceIds.length + projectIds.length;

  const exportList = async () => {
    const rows = [
      ...spaceIds.map((id) => ({ id, kind: 'Marketing Space', name: spaces.find((s) => s.id === id)?.title ?? rememberedName(id)?.title ?? id, u: usage.get(`s:${id}`)! })),
      ...projectIds.map((id) => ({ id, kind: 'Production', name: productions.find((p) => p.id === id)?.title ?? rememberedName(id)?.title ?? id, u: usage.get(`p:${id}`)! })),
    ];
    const path = await exportCsv(safeFileName(`${title} - Marketing & productions`), rows, [
      { header: 'Type', value: (r) => r.kind },
      { header: 'Name', value: (r) => r.name },
      { header: 'Invoices', value: (r) => r.u.invoices.length },
      { header: 'Invoiced', value: (r) => r.u.invoiced },
      { header: 'Received', value: (r) => r.u.received },
      { header: 'Expenses', value: (r) => r.u.expenses.length },
      { header: 'Costs', value: (r) => r.u.costs },
      { header: 'Net', value: (r) => r.u.net },
      { header: 'Business projects', value: (r) => r.u.projects.map((p) => p.name).join('; ') },
      { header: 'Deals', value: (r) => r.u.deals.map((d) => d.title).join('; ') },
    ]);
    if (path) toast(`Exported ${plural(rows.length, 'linked item')}`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Marketing & Productions"
        icon={Clapperboard}
        subtitle={count ? `${plural(spaceIds.length, 'Marketing Space')} · ${plural(projectIds.length, 'production')} linked` : 'Link the Marketing Spaces and productions this business runs'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-biz-linked', label: 'Marketing & productions report' }]} csv={[{ label: 'Linked items with totals (CSV)', onClick: () => void exportList() }]} />
            {linkButton(true)}
          </>
        }
      />
      <div className="module-body">
        <div className="biz-page">
          {count === 0 ? (
            <>
              <EmptyState
                icon={Link2}
                title="Connect your marketing and productions"
                description="A business usually has a channel or brand it markets in a Marketing Space, and productions it makes for clients or itself. Link them here to jump between them and see what each one earns and costs."
                action={linkButton(true)}
              />
              <div className="wk-why">
                <div>
                  <ArrowRightLeft size={16} />
                  <span>
                    <b>Jump between them</b>Open the campaign or production from the business, and the business from them.
                  </span>
                </div>
                <div>
                  <Wallet size={16} />
                  <span>
                    <b>Money per channel or film</b>Tag invoices and expenses with a space or production to see income, costs and net per item.
                  </span>
                </div>
                <div>
                  <FolderKanban size={16} />
                  <span>
                    <b>Projects & deals in context</b>Business projects and deals that belong to a campaign or production are listed on its card.
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="biz-kpis">
                <StatTile label="Linked" value={String(count)} sub={`${spaceIds.length} spaces · ${projectIds.length} productions`} />
                <StatTile label="Received (tagged invoices)" value={fmt.money(totals.received, { cents: false })} />
                <StatTile label="Costs (tagged expenses)" value={fmt.money(totals.costs, { cents: false })} />
                <StatTile label="Net" value={<span className={totals.received - totals.costs < 0 ? 'biz-out' : ''}>{fmt.money(totals.received - totals.costs, { cents: false })}</span>} sub={totals.projects ? `${plural(totals.projects, 'business project')}` : undefined} />
              </div>
              {spaceIds.length > 0 && (
                <>
                  <h3 className="wk-section-title">
                    <Megaphone size={15} /> Marketing Spaces
                  </h3>
                  <div className="wk-lcards">
                    {spaceIds.map((id) => (
                      <LinkedCard key={id} kind="space" id={id} space={spaces.find((s) => s.id === id)} u={usage.get(`s:${id}`)!} onUnlink={() => unlinkSpace(id)} />
                    ))}
                  </div>
                </>
              )}
              {projectIds.length > 0 && (
                <>
                  <h3 className="wk-section-title">
                    <Clapperboard size={15} /> Productions
                  </h3>
                  <div className="wk-lcards">
                    {projectIds.map((id) => (
                      <LinkedCard key={id} kind="production" id={id} production={productions.find((p) => p.id === id)} u={usage.get(`p:${id}`)!} onUnlink={() => unlinkProduction(id)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {(unlinked.spaces.length > 0 || unlinked.productions.length > 0) && (
            <Card title="Referenced but not linked">
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Invoices, expenses, projects or deals in this business point to these. Link them to see their totals here.
              </p>
              <div className="wk-lcard-refs">
                {unlinked.spaces.map((id) => {
                  const s = spaces.find((x) => x.id === id);
                  return (
                    <button key={id} type="button" className="wk-chip" disabled={!s} onClick={() => linkSpace(id)} title={s ? 'Link this Marketing Space' : 'This space no longer exists'}>
                      <Megaphone size={12} />
                      <span>{s?.title ?? rememberedName(id)?.title ?? 'Deleted Marketing Space'}</span>
                      {s && <Link2 size={12} />}
                    </button>
                  );
                })}
                {unlinked.productions.map((id) => {
                  const p = productions.find((x) => x.id === id);
                  return (
                    <button key={id} type="button" className="wk-chip" disabled={!p} onClick={() => linkProduction(id)} title={p ? 'Link this production' : 'This production no longer exists'}>
                      <Clapperboard size={12} />
                      <span>{p?.title ?? rememberedName(id)?.title ?? 'Deleted production'}</span>
                      {p && <Link2 size={12} />}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkedCard({ kind, id, space, production, u, onUnlink }: { kind: LinkedKind; id: string; space?: SpaceSummary; production?: ProjectSummary; u: LinkedUsage; onUnlink: () => void }) {
  const fmt = useFmt();
  const item = kind === 'space' ? space : production;
  const remembered = rememberedName(id);
  const name = item?.title || remembered?.title || (kind === 'space' ? 'Deleted Marketing Space' : 'Deleted production');
  const color = item?.color || remembered?.color || 'var(--text-3)';
  const typeLabel = kind === 'space' ? SPACE_TYPES.find((t) => t.value === space?.type)?.label ?? 'Marketing Space' : PROJECT_TYPES.find((t) => t.value === production?.projectType)?.label ?? 'Production';
  const sub =
    kind === 'space'
      ? [typeLabel, space?.contentCount != null ? plural(space.contentCount, 'piece') : '', space?.nextPost ? `next post ${fmt.dateShort(space.nextPost)}` : ''].filter(Boolean).join(' · ')
      : [typeLabel, production?.subtitle, production?.updatedAt ? `updated ${fmt.dateShort(production.updatedAt.slice(0, 10))}` : ''].filter(Boolean).join(' · ');
  const open = () => void (kind === 'space' ? openSpaceById(id) : openProjectById(id));
  const refs = u.invoices.length + u.expenses.length + u.projects.length + u.deals.length;
  return (
    <div className={`wk-lcard ${item ? '' : 'missing'}`} style={{ ['--lc' as string]: color } as CSSProperties}>
      <div className="wk-lcard-cover">
        <span className="wk-lcard-icon">{kind === 'space' ? space?.emoji || <Megaphone size={20} /> : <Clapperboard size={20} />}</span>
        <span className="wk-lcard-title">
          <b className="ellipsis">{name}</b>
          <span className="ellipsis muted small">{item ? sub : 'Not found — it may have been deleted'}</span>
        </span>
      </div>
      <div className="wk-lcard-body">
        {kind === 'space' && space?.description ? <p className="muted small ellipsis" style={{ margin: 0 }}>{space.description}</p> : null}
        <div className="wk-lcard-stats">
          <div title="Paid invoices tagged with it">
            <span>Received</span>
            <b className="biz-in">{fmt.money(u.received, { cents: false })}</b>
          </div>
          <div title="Expenses tagged with it">
            <span>Costs</span>
            <b className={u.costs ? 'biz-out' : ''}>{fmt.money(u.costs, { cents: false })}</b>
          </div>
          <div title="Received − costs">
            <span>Net</span>
            <b className={u.net < 0 ? 'biz-out' : ''}>{fmt.money(u.net, { cents: false })}</b>
          </div>
        </div>
        {refs === 0 ? (
          <span className="muted small">
            Nothing in this business refers to it yet. Tag invoices and expenses with it (“Linked production / space”), or link a business project to it.
          </span>
        ) : (
          <div className="wk-lcard-refs">
            {u.projects.map((p) => (
              <button key={p.id} type="button" className="wk-chip" style={{ borderColor: projectColor(p) }} onClick={() => navigateSpace('projects', { projectId: p.id })} title="Business project">
                <FolderKanban size={12} />
                <span>{p.name || 'Untitled project'}</span>
              </button>
            ))}
            {u.deals.map((d) => (
              <button key={d.id} type="button" className="wk-chip" onClick={() => navigateSpace('pipeline', { dealId: d.id })} title="Deal">
                <Target size={12} />
                <span>{d.title || 'Deal'}</span>
              </button>
            ))}
            {u.invoices.length > 0 && (
              <button type="button" className="wk-chip" onClick={() => navigateSpace('invoices', u.invoices.length === 1 ? { invoiceId: u.invoices[0].id } : {})} title={u.invoices.map((i) => i.number).join(', ')}>
                <FileText size={12} />
                <span>
                  {plural(u.invoices.length, 'invoice')} · {fmt.money(u.invoiced, { cents: false })}
                </span>
              </button>
            )}
            {u.expenses.length > 0 && (
              <button type="button" className="wk-chip" onClick={() => navigateSpace('expenses', u.expenses.length === 1 ? { expenseId: u.expenses[0].id } : {})}>
                <Receipt size={12} />
                <span>
                  {plural(u.expenses.length, 'expense')} · {fmt.money(u.costs, { cents: false })}
                </span>
              </button>
            )}
          </div>
        )}
        {u.projects.length > 0 && (
          <span className="muted tiny">
            Business projects: {plural(u.openProjects, 'open project')} · {fmt.money(u.projectProfit, { cents: false })} profit so far
          </span>
        )}
      </div>
      <div className="wk-lcard-foot">
        <Button size="sm" variant="primary" icon={ExternalLink} disabled={!item} onClick={open}>
          Open
        </Button>
        <div className="spacer" />
        <Button size="sm" variant="ghost" icon={Unlink} onClick={onUnlink}>
          Unlink
        </Button>
      </div>
    </div>
  );
}
