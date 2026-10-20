/* Milestones: timeline strip + editable table. */
import { useLayoutEffect, useMemo, useState } from 'react';
import { Copy, Flag, Plus, Trash2 } from 'lucide-react';
import type { Milestone, Phase } from '@/types';
import { PHASES, optionColor } from '@/lib/constants';
import { addDays, diffDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { truncate } from '@/lib/text';
import { useFormatters } from '@/store/project';
import { Button, DataTable, EmptyState, Select, confirmDialog, type Column } from '@/ui';
import { isISO, milestoneOps } from './shared';

function relative(date: string | undefined, today: string): string {
  if (!isISO(date)) return '';
  const d = diffDays(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export async function deleteMilestone(m: Milestone) {
  const ok = await confirmDialog({ title: 'Delete milestone?', message: `“${m.name || 'Untitled milestone'}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) milestoneOps.remove(m.id);
}

export function addMilestone(phase: Phase) {
  milestoneOps.add({ id: uid('ms'), name: 'New milestone', phase });
}

export function MilestonesView({ milestones, defaultPhase }: { milestones: Milestone[]; defaultPhase: Phase }) {
  const fmt = useFormatters();
  const today = todayISO();
  const rows = useMemo(() => [...milestones].sort((a, b) => (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31')), [milestones]);

  const columns: Column<Milestone>[] = [
    { key: 'done', header: 'Done', type: 'checkbox', width: 56, align: 'center' },
    { key: 'name', header: 'Milestone', type: 'text', placeholder: 'Milestone name', minWidth: 200 },
    { key: 'date', header: 'Date', type: 'date', width: 150 },
    {
      key: 'when',
      header: 'When',
      width: 120,
      sortValue: (m) => m.date ?? '9999',
      render: (m) => {
        const r = relative(m.date, today);
        const overdue = !m.done && isISO(m.date) && m.date < today;
        return <span className={overdue ? 'tk-overdue-text' : 'muted'}>{overdue ? `Overdue · ${r}` : r || '—'}</span>;
      },
    },
    {
      key: 'phase',
      header: 'Phase',
      width: 170,
      sortValue: (m) => PHASES.findIndex((p) => p.value === m.phase),
      render: (m) => (
        <div className="row" style={{ gap: 6 }}>
          <span className="color-dot" style={{ background: optionColor(PHASES, m.phase) }} />
          <Select bare size="sm" value={m.phase} options={PHASES} onChange={(v) => milestoneOps.update(m.id, { phase: v as Phase }, false)} />
        </div>
      ),
    },
    { key: 'notes', header: 'Notes', type: 'text', placeholder: 'Notes', minWidth: 180 },
  ];

  if (milestones.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No milestones yet"
        description="Milestones mark the big moments: script lock, tech scout, first shoot day, picture lock, delivery."
        action={
          <Button variant="primary" icon={Plus} onClick={() => addMilestone(defaultPhase)}>
            Add milestone
          </Button>
        }
      />
    );
  }

  return (
    <div className="tk-ms-page">
      <MilestoneStrip milestones={milestones} />
      <DataTable
        rows={rows}
        columns={columns}
        onChange={(id, patch) => milestoneOps.update(id, patch, !('done' in patch) && !('date' in patch))}
        rowStyle={(m) => (m.done ? { opacity: 0.62 } : undefined)}
        rowActions={(m) => [
          { label: 'Duplicate', icon: Copy, onClick: () => milestoneOps.duplicate(m.id, () => uid('ms')) },
          { label: 'Postpone one week', icon: Flag, disabled: !isISO(m.date), onClick: () => isISO(m.date) && milestoneOps.update(m.id, { date: addDays(m.date, 7) }, false) },
          { separator: true },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteMilestone(m) },
        ]}
      />
      <div className="muted small" style={{ marginTop: 8 }}>
        {milestones.filter((m) => m.done).length} of {milestones.length} done · next:{' '}
        {(() => {
          const next = rows.find((m) => !m.done && isISO(m.date) && m.date >= today);
          return next ? `${next.name} — ${fmt.dateMedium(next.date)}` : 'none scheduled';
        })()}
      </div>
    </div>
  );
}

/** Width of an element (callback ref so it follows re-mounts). */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, w };
}

function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  const today = todayISO();
  const { ref, w } = useWidth<HTMLDivElement>();
  const dated = useMemo(() => milestones.filter((m) => isISO(m.date)).sort((a, b) => a.date!.localeCompare(b.date!)), [milestones]);

  const layout = useMemo(() => {
    if (!dated.length) return null;
    let lo = dated[0].date!;
    let hi = dated[dated.length - 1].date!;
    if (today < lo && diffDays(today, lo) < 90) lo = today;
    if (today > hi && diffDays(hi, today) < 90) hi = today;
    if (diffDays(lo, hi) < 10) {
      lo = addDays(lo, -5);
      hi = addDays(hi, 5);
    }
    const pad = Math.max(1, Math.round(diffDays(lo, hi) * 0.04));
    const start = addDays(lo, -pad);
    const span = Math.max(1, diffDays(start, addDays(hi, pad)));
    const pct = (d: string) => Math.max(0, Math.min(100, (diffDays(start, d) / span) * 100));
    // greedy lanes: 0,1 below / above near the line, 2,3 further out
    const ends = [-1e9, -1e9, -1e9, -1e9];
    const items = dated.map((m, i) => {
      const p = pct(m.date!);
      const x = (p / 100) * w;
      const label = truncate(m.name || 'Milestone', 26);
      const width = Math.max(label.length, 10) * 6.6 + 16;
      const from = x - width / 2;
      let lane = [0, 1, 2, 3].find((l) => ends[l] < from - 6);
      if (lane == null) lane = i % 4;
      ends[lane] = x + width / 2;
      return { m, p, lane, label };
    });
    return { items, todayPct: today >= start && diffDays(start, today) <= span ? pct(today) : null };
  }, [dated, w, today]);

  return (
    <div className={`tk-ms-strip ${layout ? '' : 'empty muted small'}`}>
      {layout ? <div className="tk-ms-line" /> : 'Give milestones a date to see them on the timeline.'}
      <div className="tk-ms-inner" ref={ref}>
        {layout && <StripItems layout={layout} />}
      </div>
    </div>
  );
}

function StripItems({ layout }: { layout: { items: { m: Milestone; p: number; lane: number; label: string }[]; todayPct: number | null } }) {
  const fmt = useFormatters();
  return (
    <>
      {layout.todayPct != null && (
        <div className="tk-ms-today" style={{ left: `${layout.todayPct}%` }}>
          <span>Today</span>
        </div>
      )}
      {layout.items.map(({ m, p, lane, label }) => {
        const color = optionColor(PHASES, m.phase) ?? '#7c5cff';
        const above = lane % 2 === 1;
        const far = lane >= 2;
        return (
          <div
            key={m.id}
            className={`tk-ms-item ${above ? 'above' : 'below'} ${far ? 'far' : ''} ${m.done ? 'done' : ''}`}
            style={{ left: `${p}%`, ['--mc' as string]: color }}
            title={`${m.name} — ${fmt.dateLong(m.date)}${m.done ? ' (done)' : ''}`}
          >
            <i className="tk-ms-dot" />
            <span className="tk-ms-stem" />
            <span className="tk-ms-label">
              <b>{label}</b>
              <small>{fmt.dateMedium(m.date).replace(/, \d{4}$/, '')}</small>
            </span>
          </div>
        );
      })}
    </>
  );
}
