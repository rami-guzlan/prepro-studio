/* All milestones of the space (table + quick add) and the milestone popover
   editor opened from the roadmap. */
import { useMemo, useState, type Ref } from 'react';
import { CalendarPlus, Copy, Flag, Trash2 } from 'lucide-react';
import type { SpaceMilestone } from '@/spaces/types';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { readLS, writeLS } from '@/store/app';
import { addDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { Button, Card, Checkbox, DataTable, DateInput, Input, Popover, Select, Switch, Textarea, type AnchorRect, type Column } from '@/ui';
import { MilestoneQuickAdd } from './CampaignsPanel';
import { deleteMilestone, isISO, milestoneOps, relativeDay, sortCampaigns } from './shared';

export function MilestonesPanel({ inputRef }: { inputRef: Ref<HTMLInputElement> }) {
  const milestones = useSpace((s) => s.milestones);
  const campaigns = useSpace((s) => s.campaigns);
  const today = todayISO();
  const [campaignFilter, setCampaignFilter] = useState('');
  const [showDone, setShowDoneState] = useState(() => readLS<boolean>('prepro.spaceCampaigns.showDone', true));
  const setShowDone = (v: boolean) => {
    setShowDoneState(v);
    writeLS('prepro.spaceCampaigns.showDone', v);
  };

  const campaignOptions = useMemo(() => sortCampaigns(campaigns ?? []).map((c) => ({ value: c.id, label: c.name || 'Untitled campaign', color: c.color })), [campaigns]);
  const campById = useMemo(() => new Map((campaigns ?? []).map((c) => [c.id, c])), [campaigns]);
  const rows = useMemo(
    () =>
      [...(milestones ?? [])]
        .filter((m) => (showDone || !m.done) && (!campaignFilter || (campaignFilter === '_none' ? !m.campaignId || !campById.has(m.campaignId) : m.campaignId === campaignFilter)))
        .sort((a, b) => (a.date ?? '9999-99').localeCompare(b.date ?? '9999-99')),
    [milestones, showDone, campaignFilter, campById],
  );
  const total = milestones?.length ?? 0;
  const done = (milestones ?? []).filter((m) => m.done).length;
  const late = (milestones ?? []).filter((m) => !m.done && isISO(m.date) && m.date < today).length;
  const next = (milestones ?? []).filter((m) => !m.done && isISO(m.date) && m.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0];

  const columns: Column<SpaceMilestone>[] = [
    { key: 'done', header: 'Done', type: 'checkbox', width: 54, align: 'center' },
    { key: 'name', header: 'Milestone', type: 'text', placeholder: 'Milestone name', minWidth: 200 },
    { key: 'date', header: 'Date', type: 'date', width: 145 },
    {
      key: 'when',
      header: 'When',
      width: 150,
      sortValue: (m) => m.date ?? '9999',
      render: (m) => {
        if (!isISO(m.date)) return <span className="muted">No date</span>;
        const overdue = !m.done && m.date < today;
        return <span className={overdue ? 'sp-campaigns-overdue' : 'muted'}>{overdue ? `Overdue · ${relativeDay(m.date, today)}` : relativeDay(m.date, today)}</span>;
      },
    },
    {
      key: 'campaignId',
      header: 'Campaign',
      width: 190,
      sortValue: (m) => (m.campaignId ? campById.get(m.campaignId)?.name ?? '' : ''),
      render: (m) => {
        const c = m.campaignId ? campById.get(m.campaignId) : undefined;
        return (
          <div className="row" style={{ gap: 6, minWidth: 150 }}>
            <span className="color-dot" style={{ background: c?.color || 'var(--border-strong)' }} />
            <Select bare size="sm" value={c ? c.id : ''} options={campaignOptions} placeholder="No campaign" onChange={(v) => milestoneOps.update(m.id, { campaignId: v || undefined }, false)} />
          </div>
        );
      },
    },
    { key: 'notes', header: 'Notes', type: 'text', placeholder: 'Notes', minWidth: 180 },
  ];

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Milestones
          <span className="muted small">
            {total ? `${done}/${total} done${late ? ` · ${late} overdue` : ''}${next ? ` · next: ${next.name || 'Milestone'} ${relativeDay(next.date!, today).toLowerCase()}` : ''}` : 'Key dates: poster reveal, trailer drop, premiere, release'}
          </span>
        </span>
      }
      actions={
        total > 0 ? (
          <>
            <Select
              size="sm"
              value={campaignFilter}
              options={[{ value: '_none', label: 'Without campaign' }, ...campaignOptions]}
              placeholder="All campaigns"
              onChange={setCampaignFilter}
              aria-label="Filter by campaign"
              style={{ width: 170 }}
            />
            <Switch checked={showDone} onChange={setShowDone} label="Show done" />
          </>
        ) : undefined
      }
      padded={false}
    >
      <div className="sp-campaigns-ms-quick">
        <MilestoneQuickAdd
          inputRef={inputRef}
          campaignId={campaignFilter && campaignFilter !== '_none' ? campaignFilter : undefined}
          placeholder={campaignFilter && campaignFilter !== '_none' ? `Add a milestone to ${campById.get(campaignFilter)?.name || 'this campaign'} and press Enter` : 'Add a milestone and press Enter — e.g. Trailer drop'}
        />
      </div>
      {total === 0 ? (
        <div className="sp-campaigns-ms-empty">
          <Flag size={18} />
          <div>
            <b>No milestones yet</b>
            <div className="muted small">Milestones are the moments everything builds up to: poster reveal, teaser drop, trailer drop, premiere, release day. They show as diamonds on the roadmap and on the calendar.</div>
          </div>
        </div>
      ) : (
        <div className="sp-campaigns-ms-table">
          <DataTable
            rows={rows}
            columns={columns}
            onChange={(id, patch) => milestoneOps.update(id, patch, !('done' in patch) && !('date' in patch))}
            rowStyle={(m) => (m.done ? { opacity: 0.6 } : !m.done && isISO(m.date) && m.date < today ? { background: 'var(--danger-soft)' } : undefined)}
            emptyText={showDone ? 'No milestones match this filter.' : 'Every milestone here is done — switch on “Show done” to see them.'}
            rowActions={(m) => [
              { label: 'Postpone one week', icon: CalendarPlus, disabled: !isISO(m.date), onClick: () => isISO(m.date) && milestoneOps.update(m.id, { date: addDays(m.date, 7) }, false) },
              { label: 'Duplicate', icon: Copy, onClick: () => milestoneOps.duplicate(m.id, () => uid('sms')) },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteMilestone(m) },
            ]}
          />
        </div>
      )}
      {total > 0 && rows.length > 0 && rows.length < total && (
        <div className="sp-campaigns-ms-foot muted small">
          Showing {rows.length} of {total} milestones
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== popover editor */

export function MilestonePopover({ id, anchor, onClose }: { id: string | null; anchor: AnchorRect | null; onClose: () => void }) {
  const m = useSpace((s) => (id ? s.milestones.find((x) => x.id === id) : undefined));
  const campaigns = useSpace((s) => s.campaigns);
  const fmt = useSpaceFormatters();
  const options = useMemo(() => sortCampaigns(campaigns ?? []).map((c) => ({ value: c.id, label: c.name || 'Untitled campaign' })), [campaigns]);
  if (!m) return null;
  const set = (patch: Partial<SpaceMilestone>, coalesce = false) => milestoneOps.update(m.id, patch, coalesce);
  return (
    <Popover anchor={anchor} onClose={onClose} className="sp-campaigns-mspop">
      <div className="sp-campaigns-mspop-body">
        <div className="sp-campaigns-mspop-head">
          <Flag size={14} />
          <span>Milestone</span>
          <span className="spacer" />
          {isISO(m.date) && <span className="muted tiny">{fmt.dateLong(m.date)}</span>}
        </div>
        <Input
          autoFocus
          value={m.name}
          placeholder="Milestone name"
          onChange={(v) => set({ name: v }, true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="row">
          <DateInput value={m.date} onChange={(v) => set({ date: v })} style={{ flex: 1 }} />
          <Checkbox checked={m.done} onChange={(v) => set({ done: v })} label="Done" />
        </div>
        <Select value={m.campaignId && options.some((o) => o.value === m.campaignId) ? m.campaignId : ''} options={options} placeholder="No campaign" onChange={(v) => set({ campaignId: v || undefined })} />
        <Textarea autoGrow minRows={2} value={m.notes} placeholder="Notes" onChange={(v) => set({ notes: v || undefined }, true)} />
        <div className="row">
          <Button
            size="sm"
            variant="danger"
            icon={Trash2}
            onClick={() => {
              onClose();
              void deleteMilestone(m);
            }}
          >
            Delete
          </Button>
          <span className="spacer" />
          <Button size="sm" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Popover>
  );
}
