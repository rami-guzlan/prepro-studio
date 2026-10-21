/* Sales Pipeline: deals from lead → qualified → proposal → negotiation → won / lost
   on a drag & drop board (or a list), with forecast numbers, follow-ups, an
   activity log per deal and "Mark won" turning the deal into a planning project. */
import '../../biz.css';
import '../../sales.css';
import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CalendarClock, ChevronRight, Columns3, List, Plus, Target, Trash2 } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { readLS, writeLS } from '@/store/app';
import { plural, safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Button, Checkbox, EmptyState, ExportMenu, ModuleHeader, SearchInput, Tabs, confirmDialog, openContextMenu, toast, type MenuItem } from '@/ui';
import { StatTile } from '@/ui/charts';
import { DEAL_STAGES, type PeriodId } from '../../constants';
import { periodRange } from '../../derive';
import { dealContact, dealProbability, isOpenDeal, pipelineSummary, stageInfo, weightedValue } from '../../derive-work';
import { addItem, makeDeal, removeItems } from '../../ops';
import { OptionPill, PeriodSelect, useBiz, useFmt, useNavParams, useToday } from '../../ui';
import type { BusinessData, Deal, DealStage } from '../../types';
import { moveDeal } from './deal-ops';
import { DealDialog } from './DealDialog';

type View = 'board' | 'list';

export default function PipelineModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const today = useToday();
  const [view, setViewState] = useState<View>(() => readLS<View>(`prepro.biz.pipeline.view.${spaceId}`, 'board'));
  const [period, setPeriod] = useState<PeriodId>('ytd');
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [sel, setSel] = useState<ID | null>(null);
  const setView = (v: View) => {
    setViewState(v);
    writeLS(`prepro.biz.pipeline.view.${spaceId}`, v);
  };

  const r = periodRange(period, today);
  const sum = useMemo(() => pipelineSummary(b, today, r), [b, today, r.from, r.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (stage: DealStage = 'lead') => {
    const d = makeDeal({ stage, createdAt: today });
    addItem('deals', d);
    setSel(d.id);
  };

  useNavParams((p) => {
    if (p.dealId) {
      const ref = String(p.dealId).toLowerCase();
      const hit = b.deals.find((d) => d.id === p.dealId) ?? b.deals.find((d) => d.title.toLowerCase() === ref);
      if (hit) setSel(hit.id);
    }
    if (p.new) add(p.stage && DEAL_STAGES.some((s) => s.value === p.stage) ? p.stage : 'lead');
    if (p.followUps) setDueOnly(true);
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const due = new Set(sum.followUpsDue.map((d) => d.id));
    return b.deals.filter((d) => {
      if (dueOnly && !due.has(d.id)) return false;
      if (!s) return true;
      return [d.title, dealContact(b, d), d.source, d.nextStep, d.notes].join(' ').toLowerCase().includes(s);
    });
  }, [b, q, dueOnly, sum.followUpsDue]);

  const deal = b.deals.find((d) => d.id === sel);

  const exportList = async () => {
    const rows = [...b.deals].sort(byStageThenDate);
    const path = await exportCsv(safeFileName(`${title} - Deals`), rows, [
      { header: 'Deal', value: (d) => d.title },
      { header: 'Contact', value: (d) => dealContact(b, d) },
      { header: 'Email', value: (d) => d.email ?? b.clients.find((c) => c.id === d.clientId)?.email },
      { header: 'Stage', value: (d) => stageInfo(d.stage).label },
      { header: 'Source', value: (d) => d.source },
      { header: 'Value', value: (d) => d.value },
      { header: 'Probability %', value: (d) => dealProbability(d) },
      { header: 'Weighted', value: (d) => weightedValue(d) },
      { header: 'Created', value: (d) => d.createdAt },
      { header: 'Expected close', value: (d) => d.expectedClose },
      { header: 'Closed', value: (d) => d.closedDate },
      { header: 'Next step', value: (d) => d.nextStep },
      { header: 'Next step date', value: (d) => d.nextStepDate },
      { header: 'Lost reason', value: (d) => d.lostReason },
      { header: 'Offer', value: (d) => b.strategy.offers.find((o) => o.id === d.offerId)?.name },
      { header: 'Activities', value: (d) => d.activities.length },
    ]);
    if (path) toast(`Exported ${plural(rows.length, 'deal')}`);
  };

  const winPct = sum.winRate == null ? '—' : `${Math.round(sum.winRate * 100)}%`;

  return (
    <div className="module biz">
      <ModuleHeader
        title="Sales Pipeline"
        icon={Target}
        subtitle={b.deals.length ? `${sum.openCount} open · ${fmt.money(sum.openValue, { cents: false })} in play` : 'Leads and deals from first contact to won'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-biz-pipeline', label: `Pipeline report (${r.label.toLowerCase()})`, options: { period } }]} csv={[{ label: 'All deals (CSV)', onClick: () => void exportList() }]} />
            <Button variant="primary" icon={Plus} onClick={() => add()}>
              Add deal
            </Button>
          </>
        }
      />
      {b.deals.length === 0 ? (
        <div className="module-body">
          <EmptyState
            icon={Target}
            title="Start your sales pipeline"
            description="Add every lead — a referral, an inbound email, someone you met at an event. Move them through Qualified, Proposal and Negotiation, log calls and emails, set the next follow-up, and mark them won to start the project automatically."
            action={
              <Button variant="primary" icon={Plus} onClick={() => add()}>
                Add your first lead
              </Button>
            }
          />
        </div>
      ) : (
        <div className="module-body sl-page">
          <div className="biz-kpis small">
            <StatTile label="Open pipeline" value={fmt.money(sum.openValue, { cents: false })} sub={plural(sum.openCount, 'open deal')} />
            <StatTile label="Weighted forecast" value={fmt.money(sum.weighted, { cents: false })} sub="value × win chance" />
            <StatTile label={`Won · ${r.label.toLowerCase()}`} value={fmt.money(sum.wonValue, { cents: false })} sub={`${plural(sum.wonCount, 'deal')}${sum.avgDealSize ? ` · avg ${fmt.money(sum.avgDealSize, { cents: false })}` : ''}`} />
            <StatTile label="Win rate" value={winPct} sub={`${sum.wonCount} won · ${sum.lostCount} lost`} />
            <StatTile
              label="Follow-ups due"
              value={<span className={sum.followUpsDue.length ? 'biz-out' : ''}>{sum.followUpsDue.length}</span>}
              sub={dueOnly ? 'Showing only these — click to clear' : sum.followUpsDue.length ? 'Click to show them' : 'All caught up'}
              onClick={sum.followUpsDue.length || dueOnly ? () => setDueOnly(!dueOnly) : undefined}
            />
          </div>
          <div className="sl-toolbar">
            <Tabs<View>
              value={view}
              onChange={setView}
              tabs={[
                { id: 'board', label: 'Board', icon: Columns3 },
                { id: 'list', label: 'List', icon: List },
              ]}
            />
            <SearchInput value={q} onChange={setQ} placeholder="Search deals…" width={220} />
            <Checkbox checked={showClosed} onChange={setShowClosed} label="Show won & lost" />
            {dueOnly && (
              <Button size="sm" variant="ghost" icon={CalendarClock} onClick={() => setDueOnly(false)}>
                Follow-ups only ✕
              </Button>
            )}
            <div className="spacer" />
            <PeriodSelect value={period} onChange={setPeriod} />
          </div>
          {view === 'board' ? (
            <Board b={b} deals={filtered} today={today} showClosed={showClosed} onToggleClosed={() => setShowClosed(!showClosed)} onOpen={setSel} onAdd={add} />
          ) : (
            <DealList b={b} deals={filtered.filter((d) => showClosed || isOpenDeal(d))} today={today} onOpen={setSel} />
          )}
        </div>
      )}
      {deal && <DealDialog key={deal.id} deal={deal} onClose={() => setSel(null)} />}
    </div>
  );
}

const stageIndex = (s: DealStage) => DEAL_STAGES.findIndex((x) => x.value === s);
const byStageThenDate = (a: Deal, z: Deal) => stageIndex(a.stage) - stageIndex(z.stage) || (a.nextStepDate ?? '9999').localeCompare(z.nextStepDate ?? '9999') || a.title.localeCompare(z.title);

/** 'due' (today), 'late' (before today) or ''. */
export function followUpState(d: Deal, today: string): '' | 'due' | 'late' {
  if (!d.nextStepDate || !isOpenDeal(d)) return '';
  if (d.nextStepDate < today) return 'late';
  if (d.nextStepDate === today) return 'due';
  return '';
}

function dealMenu(d: Deal, onOpen: (id: ID) => void): MenuItem[] {
  return [
    { label: 'Open', onClick: () => onOpen(d.id) },
    { separator: true },
    { header: 'Move to' },
    ...DEAL_STAGES.map((s) => ({ label: s.label, swatch: s.color, checked: d.stage === s.value, onClick: () => void moveDeal(d.id, s.value) })),
    { separator: true },
    {
      label: 'Delete…',
      icon: Trash2,
      danger: true,
      onClick: async () => {
        if (await confirmDialog({ title: `Delete “${d.title || 'deal'}”?`, message: 'Its activity log is deleted too. You can undo with Ctrl+Z.', confirmLabel: 'Delete deal', danger: true })) removeItems('deals', [d.id]);
      },
    },
  ];
}

/* ---------------------------------------------------------------- board */

function Board({ b, deals, today, showClosed, onToggleClosed, onOpen, onAdd }: { b: BusinessData; deals: Deal[]; today: string; showClosed: boolean; onToggleClosed: () => void; onOpen: (id: ID) => void; onAdd: (stage: DealStage) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );
  const byStage = useMemo(() => {
    const m = new Map<DealStage, Deal[]>(DEAL_STAGES.map((s) => [s.value, []]));
    for (const d of deals) (m.get(d.stage) ?? m.get('lead')!).push(d);
    for (const [k, list] of m) list.sort(k === 'won' || k === 'lost' ? (a, z) => (z.closedDate ?? '').localeCompare(a.closedDate ?? '') : (a, z) => (a.nextStepDate ?? '9999').localeCompare(z.nextStepDate ?? '9999') || (z.value ?? 0) - (a.value ?? 0));
    return m;
  }, [deals]);
  const active = activeId ? deals.find((d) => d.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over ? (String(e.over.id) as DealStage) : undefined;
    const d = deals.find((x) => x.id === String(e.active.id));
    if (d && to && d.stage !== to && DEAL_STAGES.some((s) => s.value === to)) void moveDeal(d.id, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="sl-board" aria-label="Deals by stage">
        {DEAL_STAGES.map((s) => {
          const list = byStage.get(s.value) ?? [];
          if (!s.open && !showClosed) return <CollapsedColumn key={s.value} stage={s.value} label={s.label} color={s.color!} list={list} onExpand={onToggleClosed} dragging={!!activeId} />;
          return (
            <Column key={s.value} stage={s.value} label={s.label} color={s.color!} list={list} b={b} today={today} onOpen={onOpen} onAdd={s.open ? () => onAdd(s.value) : undefined} />
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>{active ? <DealCardBody b={b} d={active} today={today} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function ColumnHead({ label, color, list }: { label: string; color: string; list: Deal[] }) {
  const fmt = useFmt();
  const value = list.reduce((n, d) => n + (d.value ?? 0), 0);
  return (
    <div className="sl-col-head">
      <i style={{ background: color }} />
      <b>{label}</b>
      <span className="muted small">{list.length}</span>
      <div className="spacer" />
      {value > 0 && <span className="small biz-money">{fmt.money(value, { cents: false })}</span>}
    </div>
  );
}

function Column({ stage, label, color, list, b, today, onOpen, onAdd }: { stage: DealStage; label: string; color: string; list: Deal[]; b: BusinessData; today: string; onOpen: (id: ID) => void; onAdd?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const fmt = useFmt();
  const weighted = list.reduce((n, d) => n + weightedValue(d), 0);
  return (
    <section ref={setNodeRef} className={`sl-col ${isOver ? 'over' : ''}`} style={{ ['--sc' as string]: color }} aria-label={label}>
      <ColumnHead label={label} color={color} list={list} />
      {stageInfo(stage).open && weighted > 0 && <div className="sl-col-sub muted tiny">{fmt.money(weighted, { cents: false })} weighted · {stageInfo(stage).probability}% default</div>}
      <div className="sl-col-items">
        {list.map((d) => (
          <DealCard key={d.id} b={b} d={d} today={today} onOpen={onOpen} />
        ))}
        {list.length === 0 && <div className="sl-col-empty muted small">{onAdd ? 'Drop a deal here' : stage === 'won' ? 'Won deals land here' : 'Lost deals land here'}</div>}
      </div>
      {onAdd && (
        <button type="button" className="sl-col-add" onClick={onAdd}>
          <Plus size={14} /> Add deal
        </button>
      )}
    </section>
  );
}

function CollapsedColumn({ stage, label, color, list, onExpand, dragging }: { stage: DealStage; label: string; color: string; list: Deal[]; onExpand: () => void; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const fmt = useFmt();
  const value = list.reduce((n, d) => n + (d.value ?? 0), 0);
  return (
    <button type="button" ref={setNodeRef} className={`sl-col collapsed ${isOver ? 'over' : ''} ${dragging ? 'target' : ''}`} style={{ ['--sc' as string]: color }} onClick={onExpand} title={`Show ${label.toLowerCase()} deals`}>
      <i style={{ background: color }} />
      <b>{label}</b>
      <span className="muted small">{list.length}</span>
      {value > 0 && <span className="small biz-money">{fmt.money(value, { cents: false })}</span>}
      <ChevronRight size={14} className="muted" />
      {dragging && <span className="tiny muted">Drop to mark {label.toLowerCase()}</span>}
    </button>
  );
}

function DealCard({ b, d, today, onOpen }: { b: BusinessData; d: Deal; today: string; onOpen: (id: ID) => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: d.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-roledescription="Draggable deal — Space to pick up, arrows to move, Enter to open"
      className={`sl-card ${isDragging ? 'dragging' : ''}`}
      onClick={() => onOpen(d.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(d.id);
        else listeners?.onKeyDown?.(e);
      }}
      onContextMenu={(e) => openContextMenu(e, dealMenu(d, onOpen))}
    >
      <DealCardBody b={b} d={d} today={today} />
    </div>
  );
}

function DealCardBody({ b, d, today, overlay }: { b: BusinessData; d: Deal; today: string; overlay?: boolean }) {
  const fmt = useFmt();
  const fu = followUpState(d, today);
  const contact = dealContact(b, d);
  const open = isOpenDeal(d);
  return (
    <div className={`sl-card-body ${overlay ? 'sl-card overlay' : ''}`}>
      <div className="sl-card-title">{d.title || <span className="muted">Untitled deal</span>}</div>
      {contact && <div className="muted small ellipsis">{contact}</div>}
      <div className="sl-card-nums">
        {d.value != null && <span className="biz-money biz-strong">{fmt.money(d.value, { cents: false })}</span>}
        {open && <span className="muted tiny">{dealProbability(d)}%</span>}
        {d.stage === 'won' && d.closedDate && <span className="muted tiny">won {fmt.dateShort(d.closedDate)}</span>}
        {d.stage === 'lost' && <span className="muted tiny ellipsis">{d.lostReason || (d.closedDate ? `lost ${fmt.dateShort(d.closedDate)}` : 'lost')}</span>}
      </div>
      {open && (d.nextStep || d.nextStepDate) && (
        <div className={`sl-next ${fu}`}>
          <CalendarClock size={12} />
          <span className="ellipsis">{d.nextStep || 'Follow up'}</span>
          {d.nextStepDate && <b>{fu === 'due' ? 'today' : fmt.dateShort(d.nextStepDate)}</b>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- list */

function DealList({ b, deals, today, onOpen }: { b: BusinessData; deals: Deal[]; today: string; onOpen: (id: ID) => void }) {
  const fmt = useFmt();
  const rows = [...deals].sort(byStageThenDate);
  if (!rows.length) return <div className="biz-empty-line">No deal matches.</div>;
  return (
    <div className="table-wrap sl-table">
      <table className="table">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Contact</th>
            <th>Stage</th>
            <th className="num">Value</th>
            <th className="num">Chance</th>
            <th className="num">Weighted</th>
            <th>Next step</th>
            <th>Close</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const fu = followUpState(d, today);
            return (
              <tr
                key={d.id}
                tabIndex={0}
                className="sl-row"
                onClick={() => onOpen(d.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}
                onContextMenu={(e) => openContextMenu(e, dealMenu(d, onOpen))}
              >
                <td className="biz-strong">{d.title || 'Untitled deal'}</td>
                <td className="muted">{dealContact(b, d)}</td>
                <td>
                  <OptionPill value={d.stage} options={DEAL_STAGES} />
                </td>
                <td className="num biz-money">{d.value != null ? fmt.money(d.value, { cents: false }) : ''}</td>
                <td className="num">{dealProbability(d)}%</td>
                <td className="num biz-money">{d.value != null ? fmt.money(weightedValue(d), { cents: false }) : ''}</td>
                <td>
                  {isOpenDeal(d) && (d.nextStep || d.nextStepDate) ? (
                    <span className={`sl-next inline ${fu}`}>
                      {d.nextStep || 'Follow up'}
                      {d.nextStepDate && <b> · {fu === 'due' ? 'today' : fmt.dateShort(d.nextStepDate)}</b>}
                    </span>
                  ) : (
                    <span className="muted small">{d.stage === 'lost' ? d.lostReason ?? '' : ''}</span>
                  )}
                </td>
                <td className="muted small">{d.closedDate ? fmt.dateShort(d.closedDate) : d.expectedClose ? fmt.dateShort(d.expectedClose) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

