/* Crew module: crew list grouped by department with a detail panel. */
import './crew.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, Copy, HardHat, Pencil, Plus, Sparkles, Trash2, UserPlus } from 'lucide-react';
import type { CrewMember, ID } from '@/types';
import { listOps, useProject, useFormatters } from '@/store/project';
import { readLS, useApp, writeLS } from '@/store/app';
import { CREW_STATUSES, POSITIONS_BY_DEPT, RATE_UNITS } from '@/lib/constants';
import { matchesQuery, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import {
  Avatar,
  Button,
  Combo,
  DataTable,
  EmptyState,
  ExportMenu,
  isModalOpen,
  Menu,
  ModuleHeader,
  SearchInput,
  Select,
  Toolbar,
  type Column,
  type MenuItem,
} from '@/ui';
import { addCrewMember, deleteCrewMember, duplicateCrewMember, exportCrewCsv } from './actions';
import { ALL_POSITIONS, departmentOrder, deptOf } from './data';
import { CrewDetail } from './CrewDetail';
import { QuickAddModal } from './QuickAddModal';
import { currencySymbol, isTypingTarget, tableMinWidth } from './util';

const ops = listOps<CrewMember>((d) => d.crew, 'crew');

type OptCol = 'phone' | 'email' | 'rate' | 'call' | 'dealMemo' | 'kit' | 'dietary' | 'emergency' | 'notes';
const OPTIONAL_COLUMNS: { id: OptCol; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
  { id: 'rate', label: 'Rate' },
  { id: 'call', label: 'Default call' },
  { id: 'dealMemo', label: 'Deal memo' },
  { id: 'kit', label: 'Kit' },
  { id: 'dietary', label: 'Dietary' },
  { id: 'emergency', label: 'Emergency contact' },
  { id: 'notes', label: 'Notes' },
];
const DEFAULT_COLS: OptCol[] = ['phone', 'email', 'rate', 'call', 'dealMemo'];

export default function CrewModule() {
  const crew = useProject((p) => p.crew);
  const currency = useProject((p) => p.settings.currency);
  const fmt = useFormatters();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [dept, setDept] = useState('');
  const [sel, setSel] = useState<ID | null>(null);
  const [focusName, setFocusName] = useState<ID | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [cols, setColsState] = useState<OptCol[]>(() => readLS<OptCol[]>('prepro.crew.cols', DEFAULT_COLS));
  const setCols = (c: OptCol[]) => {
    setColsState(c);
    writeLS('prepro.crew.cols', c);
  };
  const searchWrap = useRef<HTMLDivElement>(null);
  useCommand('find', () => {
    searchWrap.current?.querySelector('input')?.focus();
    return true;
  });

  useEffect(() => {
    if (params?.crewId) setSel(params.crewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const order = useMemo(() => departmentOrder(crew), [crew]);
  const usedDepts = useMemo(() => order.filter((d) => crew.some((c) => deptOf(c) === d)), [order, crew]);
  const filtered = useMemo(
    () =>
      crew.filter(
        (c) =>
          (!status || c.status === status) &&
          (!dept || deptOf(c) === dept) &&
          matchesQuery([c.name, c.position, c.department, c.email, c.phone, c.kit, c.notes].join(' '), q),
      ),
    [crew, status, dept, q],
  );
  const selected = crew.find((c) => c.id === sel);
  const confirmed = crew.filter((c) => c.status === 'confirmed').length;
  const openPositions = crew.filter((c) => !c.name.trim()).length;

  const add = (department?: string) => {
    const id = addCrewMember(department ? { department } : dept ? { department: dept } : undefined);
    setSel(id);
    setFocusName(id);
  };
  const select = (id: ID | null) => {
    setSel(id);
    setFocusName(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen() || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.popover') || !sel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        select(null);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        deleteCrewMember(sel).then((ok) => ok && select(null));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const rowActions = (c: CrewMember): MenuItem[] => [
    { label: 'Open details', icon: Pencil, onClick: () => select(c.id) },
    { label: 'Duplicate', icon: Copy, onClick: () => select(duplicateCrewMember(c.id) ?? c.id) },
    { separator: true },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteCrewMember(c.id).then((ok) => ok && sel === c.id && select(null)) },
  ];

  const has = (c: OptCol) => cols.includes(c);
  const columns: Column<CrewMember>[] = [
    { key: 'photo', header: '', width: 40, sortable: false, render: (c) => <Avatar name={c.name || c.position || '?'} photo={c.photo} size={26} /> },
    {
      key: 'position',
      header: 'Position',
      width: 200,
      sortValue: (c) => c.position,
      render: (c) => (
        <Combo bare size="sm" value={c.position} suggestions={POSITIONS_BY_DEPT[deptOf(c)] ?? ALL_POSITIONS} placeholder="Position" onChange={(position) => ops.update(c.id, { position })} />
      ),
    },
    { key: 'name', header: 'Name', type: 'text', minWidth: 150, placeholder: 'TBD' },
    {
      key: 'department',
      header: 'Department',
      width: 150,
      sortValue: (c) => order.indexOf(deptOf(c)),
      render: (c) => <Select bare size="sm" value={c.department} options={order} placeholder={c.department ? undefined : '—'} onChange={(department) => ops.update(c.id, { department })} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (c) => CREW_STATUSES.findIndex((s) => s.value === c.status),
      render: (c) => {
        const color = CREW_STATUSES.find((s) => s.value === c.status)?.color;
        return (
          <div className="crew-status">
            <span className="color-dot" style={{ background: color ?? 'var(--border-strong)' }} />
            <Select bare size="sm" value={c.status} options={CREW_STATUSES} onChange={(v) => ops.update(c.id, { status: v as CrewMember['status'] })} />
          </div>
        );
      },
    },
    { key: 'phone', header: 'Phone', type: 'text', width: 132, hidden: !has('phone') },
    { key: 'email', header: 'Email', type: 'text', minWidth: 170, hidden: !has('email') },
    { key: 'rate', header: 'Rate', type: 'money', width: 96, prefix: currencySymbol(currency), hidden: !has('rate') },
    { key: 'rateUnit', header: 'Per', type: 'select', width: 84, options: RATE_UNITS, hidden: !has('rate') },
    { key: 'defaultCall', header: 'Call', type: 'time', width: 104, hidden: !has('call') },
    { key: 'dealMemo', header: 'Deal memo', type: 'checkbox', width: 80, align: 'center', hidden: !has('dealMemo') },
    { key: 'kit', header: 'Kit', type: 'textarea', minWidth: 180, hidden: !has('kit') },
    { key: 'dietary', header: 'Dietary', type: 'text', width: 120, hidden: !has('dietary') },
    {
      key: 'emergency',
      header: 'Emergency',
      minWidth: 170,
      hidden: !has('emergency'),
      sortValue: (c) => c.emergencyName ?? '',
      render: (c) =>
        c.emergencyName || c.emergencyPhone ? (
          <span className="small">
            {c.emergencyName} <span className="muted">{c.emergencyPhone}</span>
          </span>
        ) : (
          <span className="muted small">—</span>
        ),
    },
    { key: 'notes', header: 'Notes', type: 'textarea', minWidth: 180, hidden: !has('notes') },
  ];

  const totalDay = crew.filter((c) => c.status !== 'declined' && c.rateUnit === 'day' && c.rate).reduce((a, c) => a + (c.rate ?? 0), 0);
  const subtitle = [
    plural(crew.length, 'crew member'),
    `${confirmed} confirmed`,
    openPositions ? `${openPositions} open ${openPositions === 1 ? 'position' : 'positions'}` : '',
    totalDay ? `${fmt.money(totalDay, { cents: false })}/day` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="module crew-module">
      <ModuleHeader
        title="Crew"
        subtitle={subtitle}
        icon={HardHat}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'crew-list', label: 'Crew list' },
                { id: 'contact-sheet', label: 'Production contact sheet' },
                { id: 'crew-deal-tracker', label: 'Crew deal & rate tracker' },
              ]}
              csv={[{ label: 'Crew (CSV)', onClick: () => exportCrewCsv() }]}
            />
            <Button icon={Sparkles} onClick={() => setQuickAdd(dept ? `dept:${dept}` : 'small')}>
              Quick add
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => add()}>
              Add crew
            </Button>
          </>
        }
      />
      {crew.length > 0 && (
        <Toolbar>
          <div ref={searchWrap}>
            <SearchInput value={q} onChange={setQ} placeholder="Search crew…" />
          </div>
          <Select value={dept} onChange={setDept} options={usedDepts.map((d) => ({ value: d, label: `${d} (${crew.filter((c) => deptOf(c) === d).length})` }))} placeholder="All departments" style={{ width: 190 }} />
          <Select value={status} onChange={setStatus} options={CREW_STATUSES} placeholder="All statuses" style={{ width: 140 }} />
          <div className="spacer" />
          <Menu
            align="end"
            trigger={<Button icon={Columns3}>Columns</Button>}
            items={() => [
              { header: 'Show columns' },
              ...OPTIONAL_COLUMNS.map((c) => ({
                label: c.label,
                checked: cols.includes(c.id),
                onClick: () => setCols(cols.includes(c.id) ? cols.filter((x) => x !== c.id) : [...cols, c.id]),
              })),
              { separator: true },
              { label: 'Reset to default', onClick: () => setCols(DEFAULT_COLS) },
            ]}
          />
        </Toolbar>
      )}
      <div className="split">
        <div className="pane-main crew-pad">
          {crew.length === 0 ? (
            <EmptyState
              icon={HardHat}
              title="No crew yet"
              description="Build your crew list by department. Start from a template (small crew, commercial or full narrative) or add people one by one."
              action={
                <div className="row">
                  <Button icon={Sparkles} onClick={() => setQuickAdd('small')}>
                    Start from a template
                  </Button>
                  <Button variant="primary" icon={UserPlus} onClick={() => add()}>
                    Add crew member
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="crew-xtable" style={{ ['--xt-minw' as string]: `${tableMinWidth(columns, 64)}px` } as React.CSSProperties}>
              <DataTable
                rows={filtered}
                columns={columns}
                onChange={(id, patch) => ops.update(id, patch)}
                onReorder={!q && !status ? (id, before) => ops.moveBefore(id, before) : undefined}
                selectedId={sel ?? undefined}
                onRowClick={(c) => select(c.id)}
                rowActions={rowActions}
                groupBy={deptOf}
                groupOrder={order}
                groupHeader={(g, rows) => (
                  <div className="crew-group">
                    <span>{g}</span>
                    <span className="crew-group-count">{rows.length}</span>
                    <div className="spacer" />
                    <button type="button" className="btn ghost sm" onClick={() => add(g)}>
                      <Plus /> Add to {g}
                    </button>
                  </div>
                )}
                emptyText="No crew match these filters."
              />
            </div>
          )}
        </div>
        {selected && (
          <aside className="pane-right crew-detail-pane">
            <CrewDetail key={selected.id} member={selected} autoFocusName={focusName === selected.id} onClose={() => select(null)} onSelect={select} />
          </aside>
        )}
      </div>
      {quickAdd && <QuickAddModal crew={crew} initial={quickAdd} onClose={() => setQuickAdd(null)} />}
    </div>
  );
}
