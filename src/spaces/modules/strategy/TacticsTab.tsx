/* Strategy › Tactics: the concrete moves (table with status filter / grouping). */
import { useMemo, useState } from 'react';
import { Copy, ListTodo, Plus, Trash2 } from 'lucide-react';
import type { Tactic, TacticStatus } from '@/spaces/types';
import { TACTIC_STATUSES } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { readLS, writeLS } from '@/store/app';
import { uid } from '@/lib/id';
import { optionColor, optionLabel } from '@/lib/constants';
import { Button, DataTable, EmptyState, MultiSelect, Select, Switch, Tabs, type Column, type TabDef } from '@/ui';
import { addTactic, currencySymbol, deleteTactic, tacticOps } from './shared';

type Filter = 'all' | TacticStatus;

const TEXT_KEYS = new Set(['title', 'description', 'owner', 'notes', 'budget']);

export function TacticsTab({ focusId, onAdded }: { focusId: string | null; onAdded: (id: string) => void }) {
  const tactics = useSpace((s) => s.tactics);
  const channels = useSpace((s) => s.channels);
  const campaigns = useSpace((s) => s.campaigns);
  const currency = useSpace((s) => s.settings?.currency);
  const fmt = useSpaceFormatters();
  const [filter, setFilter] = useState<Filter>('all');
  const [grouped, setGroupedState] = useState(() => readLS<boolean>('prepro.spaceStrategy.groupTactics', true));
  const setGrouped = (v: boolean) => {
    setGroupedState(v);
    writeLS('prepro.spaceStrategy.groupTactics', v);
  };

  const channelOptions = useMemo(() => (channels ?? []).map((c) => ({ value: c.id, label: c.name || 'Channel', color: channelColor(c) })), [channels]);
  const campaignOptions = useMemo(() => (campaigns ?? []).map((c) => ({ value: c.id, label: c.name || 'Campaign', color: c.color })), [campaigns]);
  const owners = useMemo(() => [...new Set((tactics ?? []).map((t) => t.owner?.trim()).filter((x): x is string => !!x))].sort(), [tactics]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tactics ?? []) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [tactics]);
  const rows = useMemo(() => (filter === 'all' ? tactics ?? [] : (tactics ?? []).filter((t) => t.status === filter)), [tactics, filter]);
  const budget = useMemo(() => rows.reduce((a, t) => a + (t.budget ?? 0), 0), [rows]);

  if (!tactics?.length) {
    return (
      <div className="sp-strategy-page">
        <EmptyState
          icon={ListTodo}
          title="Turn strategy into moves"
          description="Tactics are the concrete things you’ll do: a weekly Shorts series, a collab with another creator, paid boosts for the trailer, a festival PR push. Give each a status, channels and dates."
          action={
            <Button variant="primary" icon={Plus} onClick={() => onAdded(addTactic())}>
              Add a tactic
            </Button>
          }
        />
      </div>
    );
  }

  const tabs: TabDef<Filter>[] = [{ id: 'all', label: 'All', count: tactics.length }, ...TACTIC_STATUSES.map((s) => ({ id: s.value, label: s.label, count: counts[s.value] ?? 0 }))];

  const columns: Column<Tactic>[] = [
    { key: 'title', header: 'Tactic', type: 'text', placeholder: 'What you’ll do', minWidth: 180 },
    { key: 'description', header: 'Description', type: 'textarea', placeholder: 'How / why', minWidth: 200 },
    {
      key: 'channels',
      header: 'Channels',
      minWidth: 170,
      sortValue: (t) => (t.channelIds ?? []).length,
      render: (t) =>
        channelOptions.length ? (
          <div style={{ minWidth: 150 }}>
            <MultiSelect size="sm" value={(t.channelIds ?? []).filter((id) => channelOptions.some((o) => o.value === id))} options={channelOptions} placeholder="Add…" onChange={(v) => tacticOps.update(t.id, { channelIds: v }, false)} />
          </div>
        ) : (
          <span className="muted small">No channels yet</span>
        ),
    },
    {
      key: 'campaignId',
      header: 'Campaign',
      width: 150,
      sortValue: (t) => campaignOptions.find((c) => c.value === t.campaignId)?.label ?? '',
      render: (t) => (
        <Select
          bare
          size="sm"
          style={{ minWidth: 130 }}
          value={t.campaignId && campaignOptions.some((o) => o.value === t.campaignId) ? t.campaignId : ''}
          options={campaignOptions}
          placeholder="—"
          onChange={(v) => tacticOps.update(t.id, { campaignId: v || undefined }, false)}
        />
      ),
    },
    { key: 'owner', header: 'Owner', type: 'combo', suggestions: owners, placeholder: '—', width: 120 },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      sortValue: (t) => TACTIC_STATUSES.findIndex((s) => s.value === t.status),
      render: (t) => {
        const c = optionColor(TACTIC_STATUSES, t.status) ?? '#888';
        return (
          <div className="row" style={{ gap: 6, minWidth: 110 }}>
            <span className="color-dot" style={{ background: c }} />
            <Select bare size="sm" value={t.status} options={TACTIC_STATUSES} onChange={(v) => tacticOps.update(t.id, { status: v as TacticStatus }, false)} />
          </div>
        );
      },
    },
    { key: 'start', header: 'Start', type: 'date', width: 135 },
    { key: 'end', header: 'End', type: 'date', width: 135 },
    { key: 'budget', header: 'Budget', type: 'money', prefix: currencySymbol(currency), width: 110, footer: budget ? fmt.money(budget) : '' },
  ];

  return (
    <div className="sp-strategy-page wide">
      <div className="sp-strategy-tactics-bar">
        <Tabs<Filter> tabs={tabs} value={filter} onChange={setFilter} />
        <span className="spacer" />
        <Switch checked={grouped && filter === 'all'} disabled={filter !== 'all'} onChange={setGrouped} label="Group by status" />
        <Button variant="primary" size="sm" icon={Plus} onClick={() => onAdded(addTactic(filter !== 'all' ? { status: filter } : {}))}>
          Add tactic
        </Button>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        onChange={(id, patch) => tacticOps.update(id, patch, Object.keys(patch).every((k) => TEXT_KEYS.has(k)))}
        groupBy={grouped && filter === 'all' ? (t) => t.status : undefined}
        groupOrder={TACTIC_STATUSES.map((s) => s.value)}
        groupHeader={(g, rs) => (
          <span className="row" style={{ gap: 6 }}>
            <span className="color-dot" style={{ background: optionColor(TACTIC_STATUSES, g) }} />
            {optionLabel(TACTIC_STATUSES, g)} · {rs.length}
          </span>
        )}
        selectedId={focusId ?? undefined}
        rowStyle={(t) => (t.status === 'done' ? { opacity: 0.65 } : undefined)}
        showFooter={budget > 0}
        emptyText={`No ${optionLabel(TACTIC_STATUSES, filter).toLowerCase()} tactics.`}
        rowActions={(t) => [
          {
            label: 'Duplicate',
            icon: Copy,
            onClick: () => {
              const copy = tacticOps.duplicate(t.id, () => uid('tac'));
              if (copy) onAdded(copy.id);
            },
          },
          { separator: true },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteTactic(t) },
        ]}
      />
    </div>
  );
}
