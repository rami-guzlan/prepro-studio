/* People & Brands → Accounts & outreach: lists of target accounts, the leads at
   each one, and the team's outreach towards a goal (an event's RSVP list).
   Views: Accounts (leads drop down under each account), Pipeline (leads by
   stage) and Progress (goal, funnel, team, follow-ups). */
import '../people.css';
import './outreach.css';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, FileUp, Handshake, Kanban, List, Pencil, Plus, Table2, Users } from 'lucide-react';
import type { ID } from '@/types';
import { filterCount, importOutreachCsv, leadsOf, outreachCsvRows, outreachStats, outreachView, type OutreachFilter } from '@/spaces/outreach';
import { getSpace } from '@/store/space';
import { readLS, useApp, writeLS } from '@/store/app';
import { parseCSV } from '@/lib/csv';
import { plural, safeFileName } from '@/lib/text';
import { backend, exportCsv } from '@/backend';
import { Button, EmptyState, ExportMenu, Menu, ModuleHeader, SearchInput, Tabs, Toolbar, UnderlineTabs, toast } from '@/ui';
import { FilterBar } from './filters';
import { AccountsView } from './Accounts';
import { PipelineView } from './Pipeline';
import { DashboardView } from './Dashboard';
import { AccountDialog, LeadDialog, ListDialog, TeamDialog } from './dialogs';
import { addAccount, addList, editOutreach, getOutreach } from './ops';
import { useOutreach } from './shared';

export type PeopleMode = 'accounts' | 'sheets';

/** Accounts & outreach | Sheets, under the People & Brands header. */
export function ModeTabs({ mode, onMode, sheets }: { mode: PeopleMode; onMode: (m: PeopleMode) => void; sheets: number }) {
  const o = useOutreach();
  return (
    <UnderlineTabs<PeopleMode>
      value={mode}
      onChange={onMode}
      tabs={[
        { id: 'accounts', label: 'Accounts & outreach', icon: Building2, count: o.accounts.length || undefined },
        { id: 'sheets', label: 'Sheets', icon: Table2, count: sheets || undefined },
      ]}
    />
  );
}

type View = 'accounts' | 'pipeline' | 'progress';

async function importCsv(listId: ID | undefined) {
  try {
    const files = await backend.openFiles({ multiple: false, title: 'Import accounts and leads (CSV)', filters: [{ name: 'CSV / TSV', extensions: ['csv', 'tsv', 'txt'] }] });
    const f = files[0];
    if (!f) return;
    const text = new TextDecoder().decode(f.data);
    const table = /\.tsv$/i.test(f.name) || (!text.includes(',') && text.includes('\t')) ? text.split(/\r?\n/).map((l) => l.split('\t')) : parseCSV(text);
    if (table.length < 2) return toast('That file has no rows', 'error');
    let res: ReturnType<typeof importOutreachCsv> | undefined;
    editOutreach((o) => {
      res = importOutreachCsv(o, table, listId);
    });
    if (res) toast(`Imported ${plural(res.leads, 'lead')} at ${plural(res.accounts, 'account')} (${res.newAccounts} new)${res.members.length ? ` · added ${res.members.join(', ')} to the team` : ''}`);
  } catch (e) {
    toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

export function OutreachModule({ modeTabs }: { modeTabs: React.ReactNode }) {
  const o = useOutreach();
  const spaceId = getSpace().id;
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const key = (k: string) => `prepro.or.${k}.${spaceId}`;
  const [listId, setListIdState] = useState<ID>(() => readLS<string>(key('list'), ''));
  const [view, setViewState] = useState<View>(() => readLS<View>(key('view'), 'accounts'));
  // filters stay per space (the search box does not)
  const [filters, setFiltersState] = useState<OutreachFilter>(() => readLS<OutreachFilter>(key('filters'), {}));
  const setFilters = (patch: Partial<OutreachFilter>) =>
    setFiltersState((f) => {
      const next = { ...f, ...patch };
      writeLS(key('filters'), next);
      return next;
    });
  const [q, setQ] = useState('');
  const [acc, setAcc] = useState<ID | null>(null);
  const [lead, setLead] = useState<{ accountId: ID; leadId: ID } | null>(null);
  const [editList, setEditList] = useState<ID | null>(null);
  const [team, setTeam] = useState(false);
  const setListId = (id: ID) => {
    setListIdState(id);
    writeLS(key('list'), id);
  };
  const setView = (v: View) => {
    setViewState(v);
    writeLS(key('view'), v);
  };
  const list = o.lists.find((l) => l.id === listId);
  const activeList = list ? listId : '';

  // navigation from agents / other screens: { accountId, leadId, listId, view }
  useEffect(() => {
    const p = params as { accountId?: string; leadId?: string; listId?: string; outreachView?: View } | undefined;
    if (p?.listId) setListId(p.listId);
    if (p?.outreachView) setView(p.outreachView);
    if (p?.accountId && p.leadId) setLead({ accountId: p.accountId, leadId: p.leadId });
    else if (p?.accountId) setAcc(p.accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  // each account with only the leads that pass the filters (hidden: how many they hide)
  const { accounts, hidden } = useMemo(() => outreachView(o, { ...filters, ownerId: filters.ownerId && o.team.some((m) => m.id === filters.ownerId) ? filters.ownerId : undefined, listId: activeList || undefined, q }), [o, filters, activeList, q]);
  const leads = useMemo(() => leadsOf(accounts), [accounts]);
  const stats = useMemo(() => outreachStats(o, accounts), [o, accounts]);
  const filtering = filterCount(filters) > 0 || !!q.trim();

  const newAccount = () => setAcc(addAccount({ listIds: activeList ? [activeList] : [] }));
  const newList = () => {
    const id = addList({ name: o.lists.length ? `Target list ${o.lists.length + 1}` : 'Event RSVP targets' });
    setListId(id);
    setEditList(id);
  };
  const exportList = async () => {
    const { rows, columns } = outreachCsvRows(getOutreach(), accounts);
    if (!rows.length) return toast('Nothing to export yet', 'info');
    const path = await exportCsv(safeFileName(`${getSpace().meta.title || 'Space'} - ${list?.name ?? 'Accounts'}`), rows, columns);
    if (path) toast(`Exported ${plural(rows.length, 'row')}`);
  };

  const subtitle = o.accounts.length
    ? [plural(o.accounts.length, 'account'), plural(leadsOf(o.accounts).length, 'lead'), `${outreachStats(o, o.accounts).rsvps} RSVP`].join(' · ')
    : 'Target accounts, their leads and your team’s outreach';

  return (
    <div className="module sp-crm or">
      <ModuleHeader
        title="People & Brands"
        icon={Handshake}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu csv={[{ label: `${list?.name ?? 'All accounts'} with leads (CSV)`, onClick: () => void exportList() }]} />
            <Button icon={FileUp} title="Columns like Account, Name, Title, Email, LinkedIn, Owner, Tier, Segment, Stage. One row per lead." onClick={() => void importCsv(activeList || undefined)}>
              Import CSV
            </Button>
            <Button icon={Users} onClick={() => setTeam(true)}>
              Team{o.team.length ? ` · ${o.team.length}` : ''}
            </Button>
            <Button variant="primary" icon={Plus} onClick={newAccount}>
              Add account
            </Button>
          </>
        }
      />
      {modeTabs}

      {o.accounts.length === 0 && o.lists.length === 0 ? (
        <div className="module-body">
          <EmptyState
            icon={Building2}
            title="Build your target account list"
            description="Make a list for a goal, for example the people you want on an event’s RSVP list, with a target number and the date. Add the accounts you want to reach, the leads at each one, and give them owners on your team. Every email, LinkedIn message and call you log shows up on the team’s progress."
            action={
              <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
                <Button variant="primary" icon={List} onClick={newList}>
                  New list
                </Button>
                <Button icon={Plus} onClick={newAccount}>
                  Add an account
                </Button>
                <Button icon={FileUp} onClick={() => void importCsv(undefined)}>
                  Import a CSV
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="or-lists" role="tablist" aria-label="Account lists">
            <button type="button" role="tab" aria-selected={!activeList} className={`or-list-chip ${!activeList ? 'on' : ''}`} onClick={() => setListId('')}>
              All accounts <span className="n">{o.accounts.length}</span>
            </button>
            {o.lists.map((l) => (
              <span key={l.id} className={`or-list-chip ${activeList === l.id ? 'on' : ''}`} style={{ ['--lc' as string]: l.color ?? 'var(--accent)' }}>
                <button type="button" role="tab" aria-selected={activeList === l.id} onClick={() => setListId(l.id)}>
                  <i className="or-list-dot" />
                  {l.name} <span className="n">{o.accounts.filter((a) => a.listIds.includes(l.id)).length}</span>
                </button>
                {activeList === l.id && (
                  <button type="button" className="or-list-edit" aria-label="Edit the list" title="Name, RSVP goal, event date" onClick={() => setEditList(l.id)}>
                    <Pencil size={12} />
                  </button>
                )}
              </span>
            ))}
            <button type="button" className="or-list-chip add" onClick={newList}>
              <Plus size={12} /> New list
            </button>
          </div>
          <Toolbar>
            <Tabs<View>
              value={view}
              onChange={setView}
              tabs={[
                { id: 'accounts', label: 'Accounts', icon: Building2 },
                { id: 'pipeline', label: 'Pipeline', icon: Kanban },
                { id: 'progress', label: 'Progress', icon: BarChart3 },
              ]}
            />
            <SearchInput value={q} onChange={setQ} placeholder="Search accounts and leads…" />
            <div className="spacer" />
            <span className="muted small">
              {filtering ? 'Showing ' : ''}
              {plural(accounts.length, 'account')} · {plural(leads.length, 'lead')} · {stats.rsvps} RSVP
            </span>
            {view !== 'progress' && (
              <Menu
                align="end"
                trigger={
                  <Button size="sm" variant="ghost" icon={Plus}>
                    Add
                  </Button>
                }
                items={[
                  { label: 'Account', icon: Building2, onClick: newAccount },
                  { label: 'List', icon: List, onClick: newList },
                ]}
              />
            )}
          </Toolbar>
          <FilterBar f={filters} onChange={setFilters} showSort={view === 'accounts'} />
          <div className="module-body or-body">
            {view === 'accounts' && <AccountsView accounts={accounts} hidden={hidden} filtering={filtering} onOpenAccount={setAcc} onOpenLead={(accountId, leadId) => setLead({ accountId, leadId })} onAddAccount={newAccount} />}
            {view === 'pipeline' && <PipelineView leads={leads} onOpenLead={(accountId, leadId) => setLead({ accountId, leadId })} />}
            {view === 'progress' && <DashboardView stats={stats} listId={activeList || undefined} onOpenLead={(accountId, leadId) => setLead({ accountId, leadId })} onPickOwner={(id) => { setFilters({ ownerId: id }); setView('accounts'); }} onPickSegment={(segment) => { setFilters({ segments: [segment] }); setView('accounts'); }} onOpenAccount={setAcc} />}
          </div>
        </>
      )}

      {acc && <AccountDialog key={acc} accountId={acc} onClose={() => setAcc(null)} onOpenLead={(accountId, leadId) => { setAcc(null); setLead({ accountId, leadId }); }} />}
      {lead && <LeadDialog key={lead.leadId} accountId={lead.accountId} leadId={lead.leadId} onClose={() => setLead(null)} onOpenAccount={setAcc} />}
      {editList && <ListDialog listId={editList} onClose={() => setEditList(null)} />}
      {team && <TeamDialog onClose={() => setTeam(false)} />}
    </div>
  );
}
