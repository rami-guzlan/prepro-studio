/* Cast sub-page: actors as headshot cards or a table, with a detail panel. */
import { useMemo, useRef, useState } from 'react';
import { Copy, LayoutGrid, Pencil, Phone, Plus, Rows3, Trash2, UserPlus, Users } from 'lucide-react';
import type { CastMember, Character, ID } from '@/types';
import { listOps, useProject } from '@/store/project';
import { readLS, writeLS } from '@/store/app';
import { assetUrl } from '@/backend';
import { CAST_STATUSES, RATE_UNITS } from '@/lib/constants';
import { initials, matchesQuery, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Avatar, Button, DataTable, EmptyState, openContextMenu, SearchInput, Select, StatusBadge, Tabs, Toolbar, type Column, type MenuItem } from '@/ui';
import { deleteCastMember, duplicateCastMember } from './actions';
import { CastDetail } from './CastDetail';
import { currencySymbol, rolesByCast, tableMinWidth, UNION_SUGGESTIONS } from './util';

const ops = listOps<CastMember>((d) => d.cast, 'cast');

export function CastTab({
  selectedId,
  focusNameId,
  onSelect,
  onAdd,
  onOpenCharacter,
  onOpenSizes,
}: {
  selectedId: ID | null;
  focusNameId: ID | null;
  onSelect: (id: ID | null) => void;
  onAdd: () => void;
  onOpenCharacter: (id: ID) => void;
  onOpenSizes: () => void;
}) {
  const cast = useProject((p) => p.cast);
  const characters = useProject((p) => p.characters);
  const currency = useProject((p) => p.settings.currency);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [view, setViewState] = useState<'grid' | 'table'>(() => readLS('prepro.cast.view', 'grid'));
  const setView = (v: 'grid' | 'table') => {
    setViewState(v);
    writeLS('prepro.cast.view', v);
  };
  const searchWrap = useRef<HTMLDivElement>(null);
  useCommand('find', () => {
    searchWrap.current?.querySelector('input')?.focus();
    return true;
  });

  const roles = useMemo(() => rolesByCast(characters), [characters]);
  const filtered = useMemo(
    () =>
      cast.filter(
        (m) =>
          (!status || m.status === status) &&
          matchesQuery([m.name, m.email, m.phone, m.agent, m.agency, m.union, m.notes, ...(roles.get(m.id) ?? []).map((c) => c.name)].join(' '), q),
      ),
    [cast, status, q, roles],
  );
  const selected = cast.find((m) => m.id === selectedId);
  const confirmed = cast.filter((m) => m.status === 'confirmed').length;

  const itemsFor = (m: CastMember): MenuItem[] => [
    { label: 'Open details', icon: Pencil, onClick: () => onSelect(m.id) },
    { label: 'Duplicate', icon: Copy, onClick: () => onSelect(duplicateCastMember(m.id) ?? m.id) },
    { separator: true },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteCastMember(m.id).then((ok) => ok && selectedId === m.id && onSelect(null)) },
  ];

  const columns: Column<CastMember>[] = [
    { key: 'photo', header: '', width: 44, sortable: false, render: (m) => <Avatar name={m.name || '?'} photo={m.photo} size={28} /> },
    { key: 'name', header: 'Name', type: 'text', minWidth: 150, placeholder: 'Actor name' },
    {
      key: 'roles',
      header: 'Role(s)',
      minWidth: 140,
      sortValue: (m) => roles.get(m.id)?.[0]?.number ?? 1e9,
      render: (m) => <RoleChips roles={roles.get(m.id)} onOpen={onOpenCharacter} />,
    },
    { key: 'status', header: 'Status', type: 'select', width: 130, options: CAST_STATUSES },
    { key: 'phone', header: 'Phone', type: 'text', width: 140 },
    { key: 'email', header: 'Email', type: 'text', minWidth: 170 },
    { key: 'agent', header: 'Agent', type: 'text', width: 130 },
    { key: 'union', header: 'Union', type: 'combo', width: 110, suggestions: UNION_SUGGESTIONS },
    { key: 'rate', header: 'Rate', type: 'money', width: 96, prefix: currencySymbol(currency) },
    { key: 'rateUnit', header: 'Per', type: 'select', width: 84, options: RATE_UNITS },
    { key: 'releaseSigned', header: 'Release', type: 'checkbox', width: 66, align: 'center' },
    { key: 'contractSigned', header: 'Contract', type: 'checkbox', width: 70, align: 'center' },
  ];

  return (
    <>
      <Toolbar>
        <div ref={searchWrap}>
          <SearchInput value={q} onChange={setQ} placeholder="Search cast…" />
        </div>
        <Select
          value={status}
          onChange={setStatus}
          options={CAST_STATUSES.map((s) => ({ value: s.value, label: `${s.label} (${cast.filter((m) => m.status === s.value).length})` }))}
          placeholder="All statuses"
          style={{ width: 170 }}
        />
        <span className="muted small">
          {plural(cast.length, 'cast member')} · {confirmed} confirmed
        </span>
        <div className="spacer" />
        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { id: 'grid', label: 'Cards', icon: LayoutGrid },
            { id: 'table', label: 'Table', icon: Rows3 },
          ]}
        />
      </Toolbar>
      <div className="split">
        <div className="pane-main cast-pad">
          {cast.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No cast yet"
              description="Add the actors you're considering or have booked — headshots, contacts, agents and sizes — then link them to the characters they play."
              action={
                <Button variant="primary" icon={UserPlus} onClick={onAdd}>
                  Add cast member
                </Button>
              }
            />
          ) : view === 'grid' ? (
            <div className="cast-grid">
              {filtered.map((m) => (
                <CastCard
                  key={m.id}
                  member={m}
                  roles={roles.get(m.id)}
                  selected={m.id === selectedId}
                  onClick={() => onSelect(m.id)}
                  onContextMenu={(e) => openContextMenu(e, itemsFor(m))}
                />
              ))}
              {!status && !q && (
                <button type="button" className="cast-card cast-card-add" onClick={onAdd}>
                  <Plus />
                  <span>Add cast member</span>
                </button>
              )}
              {filtered.length === 0 && (q || status) && <div className="muted cast-nomatch">No cast members match these filters.</div>}
            </div>
          ) : (
            <div className="cast-xtable" style={{ ['--xt-minw' as string]: `${tableMinWidth(columns, 64)}px` } as React.CSSProperties}>
              <DataTable
                rows={filtered}
                columns={columns}
                onChange={(id, patch) => ops.update(id, patch)}
                onReorder={!q && !status ? (id, before) => ops.moveBefore(id, before) : undefined}
                selectedId={selectedId ?? undefined}
                onRowClick={(m) => onSelect(m.id)}
                rowActions={itemsFor}
                emptyText="No cast members match these filters."
              />
            </div>
          )}
        </div>
        {selected && (
          <aside className="pane-right cast-detail-pane">
            <CastDetail key={selected.id} member={selected} autoFocusName={focusNameId === selected.id} onClose={() => onSelect(null)} onSelect={onSelect} onOpenSizes={onOpenSizes} />
          </aside>
        )}
      </div>
    </>
  );
}

function RoleChips({ roles, onOpen }: { roles?: Character[]; onOpen: (id: ID) => void }) {
  if (!roles?.length) return <span className="muted small">—</span>;
  return (
    <div className="row wrap" style={{ gap: 3 }}>
      {roles.map((c) => (
        <button key={c.id} type="button" className="chip cast-rolechip" onClick={() => onOpen(c.id)} title="Open character">
          {c.color && <span className="color-dot" style={{ background: c.color }} />}
          {c.name}
        </button>
      ))}
    </div>
  );
}

function CastCard({
  member: m,
  roles,
  selected,
  onClick,
  onContextMenu,
}: {
  member: CastMember;
  roles?: Character[];
  selected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const url = assetUrl(m.photo);
  const accent = roles?.find((r) => r.color)?.color;
  return (
    <div
      className={`cast-card ${selected ? 'on' : ''} ${m.status === 'declined' ? 'declined' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="cast-card-photo" style={accent && !url ? { background: `color-mix(in srgb, ${accent} 22%, var(--bg-sunken))` } : undefined}>
        {url ? <img src={url} alt="" draggable={false} /> : <span className="cast-card-initials">{initials(m.name || '?')}</span>}
        {!!roles?.length && roles[0].number != null && <span className="cast-card-board">#{roles.map((r) => r.number).filter((n) => n != null).join(', ')}</span>}
      </div>
      <div className="cast-card-body">
        <div className="cast-card-name ellipsis">{m.name || <span className="muted">Unnamed actor</span>}</div>
        <div className="cast-card-roles ellipsis">{roles?.length ? `as ${roles.map((r) => r.name).join(', ')}` : <span className="muted">No role yet</span>}</div>
        <div className="row" style={{ gap: 6, marginTop: 6, minWidth: 0 }}>
          <StatusBadge value={m.status} options={CAST_STATUSES} />
          {m.phone && (
            <span className="tiny muted ellipsis cast-card-phone">
              <Phone size={11} /> {m.phone}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
