/* Growth: business growth initiatives (new offers, outreach pushes, partnerships,
   ads tests, hiring …) on a status board or an impact / effort matrix. Each
   initiative tracks a KPI from baseline to target with dated check-ins, budget vs
   spend (incl. linked expenses), steps and learnings. */
import '../../biz.css';
import '../../library.css';
import { useMemo, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, CheckSquare, ExternalLink, Grid2x2, KanbanSquare, Link2, Plus, Receipt, Rocket, Square, Trash2, Unlink, UserRound } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { exportCsv } from '@/backend';
import { plural, safeFileName } from '@/lib/text';
import { openSpaceById } from '@/shell/spaceActions';
import { Button, Checkbox, Combo, DateInput, EmptyState, ExportMenu, Field, IconButton, Input, ModuleHeader, NumberInput, Select, Tabs, Textarea, confirmDialog, toast } from '@/ui';
import { LineChart, Meter, StatTile } from '@/ui/charts';
import { INITIATIVE_AREAS, INITIATIVE_STATUSES } from '../../constants';
import { initiativeProgress, initiativeStatusInfo, isOpenInitiative } from '../../derive-work';
import { addItem, makeExpense, makeInitiative, makeTask, removeItems, updateItem } from '../../ops';
import { Money, Pill, rowKeys, useBiz, useFmt, useMarketingSpaces, useNavParams, useToday } from '../../ui';
import type { BusinessData, Initiative, InitiativeStatus } from '../../types';
import { QUADRANTS, addInitiativeChild, growthSummary, isOnTrack, linkExpense, makeUpdate, moveInitiativeStep, quadrantOf, removeInitiativeChild, updateInitiativeChild } from './ops';

type View = 'board' | 'matrix';
const RATINGS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const kpiNum = (n: number | undefined) => (n == null ? '—' : String(Math.round(n * 100) / 100));

export default function GrowthModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const today = useToday();
  const [view, setViewState] = useState<View>(() => readLS<View>('prepro.biz.growth.view', 'board'));
  const setView = (v: View) => {
    setViewState(v);
    writeLS('prepro.biz.growth.view', v);
  };
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.initiative.${spaceId}`, null));
  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.initiative.${spaceId}`, id);
  };
  const add = (status: InitiativeStatus = 'idea') => {
    const i = makeInitiative({ title: 'New initiative', status, startDate: status === 'in_progress' ? today : undefined });
    addItem('initiatives', i);
    select(i.id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.lib-init-title input')?.select());
  };
  useNavParams((p) => {
    if (p.initiativeId && b.initiatives.some((x) => x.id === p.initiativeId)) select(p.initiativeId);
    if (p.new) add();
  });

  const sum = growthSummary(b, today);
  const cur = b.initiatives.find((x) => x.id === sel);

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Growth initiatives`), b.initiatives, [
      { header: 'Initiative', value: (x) => x.title },
      { header: 'Status', value: (x) => initiativeStatusInfo(x.status).label },
      { header: 'Area', value: (x) => x.area },
      { header: 'Goal', value: (x) => b.strategy.goals.find((g) => g.id === x.goalId)?.title },
      { header: 'Owner', value: (x) => x.owner },
      { header: 'Start', value: (x) => x.startDate },
      { header: 'Due', value: (x) => x.dueDate },
      { header: 'KPI', value: (x) => x.kpi },
      { header: 'Baseline', value: (x) => x.baseline },
      { header: 'Current', value: (x) => initiativeProgress(b, x, today).current },
      { header: 'Target', value: (x) => x.target },
      { header: 'Progress %', value: (x) => { const p = initiativeProgress(b, x, today).pct; return p == null ? '' : Math.round(p * 100); } },
      { header: 'Budget', value: (x) => x.budget },
      { header: 'Spent', value: (x) => initiativeProgress(b, x, today).spent },
      { header: 'Impact', value: (x) => x.impact },
      { header: 'Effort', value: (x) => x.effort },
      { header: 'Steps done', value: (x) => `${x.steps.filter((s) => s.done).length}/${x.steps.length}` },
      { header: 'Hypothesis', value: (x) => x.hypothesis },
      { header: 'Results', value: (x) => x.results },
    ]);
    if (path) toast(`Exported ${plural(b.initiatives.length, 'initiative')}`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Growth"
        icon={Rocket}
        subtitle={b.initiatives.length ? `${sum.active} in progress · ${sum.open} open · ${plural(b.initiatives.length, 'initiative')}` : 'Experiments and projects that grow the business'}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-biz-growth', label: 'Growth initiatives report' },
                ...(cur ? [{ id: 'space-biz-growth', label: `This initiative only`, options: { initiative: cur.id, includeDone: true } }] : []),
              ]}
              csv={[{ label: 'Initiatives (CSV)', onClick: () => void exportList() }]}
            />
            <Button variant="primary" icon={Plus} onClick={() => add()}>
              New initiative
            </Button>
          </>
        }
      />
      {cur ? (
        <div className="module-body">
          <InitiativeDetail key={cur.id} i={cur} onBack={() => select(null)} />
        </div>
      ) : b.initiatives.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="Track how you grow the business"
          description="An initiative is anything you try to grow: a new offer, an outreach push, a partnership, an ads test, hiring help. Give it a KPI with a baseline and target, a budget and steps — then log check-ins and see if it works."
          action={
            <Button variant="primary" icon={Plus} onClick={() => add()}>
              New initiative
            </Button>
          }
        />
      ) : (
        <div className="module-body">
        <div className="biz-page">
          <div className="biz-kpis small">
            <StatTile label="In progress" value={sum.active} sub={`${sum.open} open in total`} />
            <StatTile label="On track" value={`${sum.onTrack}/${sum.active}`} sub="KPI keeping pace, not overdue" />
            <StatTile label="Spent" value={fmt.money(sum.spent, { cents: false })} sub={sum.budget ? `of ${fmt.money(sum.budget, { cents: false })} budget` : 'no budgets set'} />
            <StatTile label="Done" value={b.initiatives.filter((x) => x.status === 'done').length} sub={`${b.initiatives.filter((x) => x.status === 'dropped').length} dropped`} />
          </div>
          <div className="row lib-toolbar">
            <Tabs<View>
              value={view}
              onChange={setView}
              tabs={[
                { id: 'board', label: 'Board', icon: KanbanSquare },
                { id: 'matrix', label: 'Impact / effort', icon: Grid2x2 },
              ]}
            />
          </div>
          {view === 'board' ? <Board b={b} today={today} onOpen={select} onAdd={add} /> : <Matrix b={b} today={today} onOpen={select} />}
        </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- board */

function InitCard({ i, b, today, onOpen, draggable }: { i: Initiative; b: BusinessData; today: string; onOpen: (id: string) => void; draggable?: boolean }) {
  const fmt = useFmt();
  const p = initiativeProgress(b, i, today);
  const on = isOnTrack(i, p, today);
  return (
    <div
      role="button"
      className={`lib-init-card ${p.overdue ? 'late' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-biz-initiative', i.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(i.id)}
      {...rowKeys(() => onOpen(i.id))}
    >
      <div className="lib-init-card-title">{i.title || 'Untitled'}</div>
      <div className="lib-init-card-meta">
        {i.area && <span className="lib-area">{i.area}</span>}
        {i.status === 'in_progress' && <span className={on ? 'lib-on' : 'lib-off'}>{on ? 'On track' : 'Behind'}</span>}
      </div>
      {i.kpi && (
        <div className="lib-init-kpi">
          <span className="ellipsis muted small">{i.kpi}</span>
          <span className="small biz-strong">
            {kpiNum(p.current)}
            {i.target != null && <span className="muted"> / {kpiNum(i.target)}</span>}
          </span>
        </div>
      )}
      {p.pct != null && <Meter value={p.pct} max={1} tone={p.pct >= 1 ? 'good' : undefined} label="KPI progress" />}
      <div className="lib-init-card-foot muted tiny">
        {i.dueDate && (
          <span className={p.overdue ? 'biz-out' : ''}>
            <CalendarClock size={11} /> {fmt.dateShort(i.dueDate)}
          </span>
        )}
        {p.stepsTotal > 0 && (
          <span>
            <CheckSquare size={11} /> {p.stepsDone}/{p.stepsTotal}
          </span>
        )}
        {(i.budget || p.spent > 0) && <span>{fmt.money(p.spent, { cents: false })}{i.budget ? ` / ${fmt.money(i.budget, { cents: false })}` : ''}</span>}
        {i.owner && (
          <span>
            <UserRound size={11} /> {i.owner}
          </span>
        )}
      </div>
    </div>
  );
}

function Board({ b, today, onOpen, onAdd }: { b: BusinessData; today: string; onOpen: (id: string) => void; onAdd: (s: InitiativeStatus) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const drop = (status: InitiativeStatus) => (e: DragEvent) => {
    const id = e.dataTransfer.getData('text/x-biz-initiative');
    setOver(null);
    if (!id) return;
    e.preventDefault();
    const it = b.initiatives.find((x) => x.id === id);
    if (!it || it.status === status) return;
    updateItem('initiatives', id, { status, ...(status === 'in_progress' && !it.startDate ? { startDate: today } : {}) }, false);
  };
  return (
    <div className="lib-board">
      {INITIATIVE_STATUSES.map((s) => {
        const list = b.initiatives.filter((x) => x.status === s.value);
        return (
          <div
            key={s.value}
            className={`lib-col ${over === s.value ? 'over' : ''}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('text/x-biz-initiative')) return;
              e.preventDefault();
              if (over !== s.value) setOver(s.value);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={drop(s.value)}
          >
            <div className="lib-col-head">
              <Pill color={s.color}>{s.label}</Pill>
              <span className="muted tiny">{list.length}</span>
              <span className="spacer" />
              {s.open && <IconButton icon={Plus} size="sm" label={`New ${s.label.toLowerCase()} initiative`} onClick={() => onAdd(s.value)} />}
            </div>
            <div className="lib-col-items">
              {list.length === 0 ? <div className="lib-col-empty muted tiny">Drop here</div> : list.map((i) => <InitCard key={i.id} i={i} b={b} today={today} onOpen={onOpen} draggable />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- matrix */

function Matrix({ b, today, onOpen }: { b: BusinessData; today: string; onOpen: (id: string) => void }) {
  const [closed, setClosed] = useState(false);
  const list = b.initiatives.filter((i) => closed || isOpenInitiative(i));
  const unrated = list.filter((i) => !quadrantOf(i));
  const order = ['big_bet', 'quick_win', 'money_pit', 'fill_in'] as const;
  return (
    <div className="lib-matrix-wrap">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="muted small">Rate impact and effort 1–5 on each initiative (3 and up counts as high).</span>
        <span className="spacer" />
        <Checkbox checked={closed} onChange={setClosed} label="Include done & dropped" />
      </div>
      <div className="lib-matrix">
        <div className="lib-axis-y">Impact ↑</div>
        <div className="lib-quads">
          {order.map((qid) => {
            const q = QUADRANTS.find((x) => x.id === qid)!;
            const items = list.filter((i) => quadrantOf(i) === qid).sort((a, z) => (z.impact ?? 0) - (a.impact ?? 0) || (a.effort ?? 0) - (z.effort ?? 0));
            return (
              <div key={qid} className={`lib-quad q-${qid}`} style={{ ['--qc' as string]: q.color }}>
                <div className="lib-quad-head">
                  <b>{q.label}</b>
                  <span className="muted tiny">{q.hint}</span>
                </div>
                <div className="lib-quad-items">
                  {items.length === 0 ? (
                    <span className="muted tiny">—</span>
                  ) : (
                    items.map((i) => (
                      <button key={i.id} type="button" className="lib-quad-chip" onClick={() => onOpen(i.id)} title={`Impact ${i.impact} · effort ${i.effort}`}>
                        <span className="ellipsis">{i.title || 'Untitled'}</span>
                        <span className="tiny muted">
                          {i.impact}/{i.effort}
                        </span>
                        <i style={{ background: initiativeStatusInfo(i.status).color }} />
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="lib-axis-x">Effort →</div>
      </div>
      {unrated.length > 0 && (
        <div className="lib-unrated">
          <div className="biz-section-head">
            <h3>Not rated yet</h3>
          </div>
          {unrated.map((i) => (
            <div key={i.id} className="lib-unrated-row">
              <button type="button" className="biz-link ellipsis" onClick={() => onOpen(i.id)}>
                {i.title || 'Untitled'}
              </button>
              <span className="spacer" />
              <label className="muted small">Impact</label>
              <Select size="sm" value={i.impact ? String(i.impact) : ''} placeholder="–" options={RATINGS} onChange={(v) => updateItem('initiatives', i.id, { impact: v ? Number(v) : undefined }, false)} aria-label="Impact" />
              <label className="muted small">Effort</label>
              <Select size="sm" value={i.effort ? String(i.effort) : ''} placeholder="–" options={RATINGS} onChange={(v) => updateItem('initiatives', i.id, { effort: v ? Number(v) : undefined }, false)} aria-label="Effort" />
            </div>
          ))}
        </div>
      )}
      {!list.length && <div className="biz-empty-line">No open initiatives.</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

function InitiativeDetail({ i, onBack }: { i: Initiative; onBack: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const spaces = useMarketingSpaces();
  const p = initiativeProgress(b, i, today);
  const up = (patch: Partial<Initiative>, coalesce = true) => updateItem('initiatives', i.id, patch, coalesce);
  const expenses = b.expenses.filter((e) => e.initiativeId === i.id).sort((a, z) => z.date.localeCompare(a.date));
  const linkable = useMemo(() => b.expenses.filter((e) => !e.initiativeId).sort((a, z) => z.date.localeCompare(a.date)).slice(0, 60), [b.expenses]);
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${i.title || 'this initiative'}”?`,
      message: expenses.length ? `${plural(expenses.length, 'linked expense')} stay in Expenses without the link. You can undo with Ctrl+Z.` : 'You can undo with Ctrl+Z.',
      confirmLabel: 'Delete initiative',
      danger: true,
    });
    if (!ok) return;
    removeItems('initiatives', [i.id]);
    onBack();
  };
  const on = isOnTrack(i, p, today);
  const budgetTone = i.budget && p.spent > i.budget ? 'critical' : i.budget && p.spent > i.budget * 0.85 ? 'warning' : undefined;
  const linkedSpace = i.spaceId ? spaces.find((s) => s.id === i.spaceId) : undefined;

  return (
    <div className="biz-editor lib-init">
      <div className="biz-editor-head">
        <Button className="biz-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Growth
        </Button>
        <div className="biz-editor-title lib-init-title">
          <Rocket size={18} className="muted" />
          <Input value={i.title} placeholder="Initiative" onChange={(v) => up({ title: v })} aria-label="Initiative title" />
        </div>
        <div className="biz-editor-actions">
          <Select value={i.status} options={INITIATIVE_STATUSES} onChange={(v) => up({ status: v as InitiativeStatus, ...(v === 'in_progress' && !i.startDate ? { startDate: today } : {}) }, false)} aria-label="Status" />
          <IconButton icon={Trash2} label="Delete initiative" onClick={() => void remove()} />
        </div>
      </div>
      <div className="biz-editor-body">
        <div className="biz-kpis small">
          <StatTile label={i.kpi || 'KPI'} value={kpiNum(p.current)} sub={i.target != null ? `${kpiNum(i.baseline ?? 0)} → ${kpiNum(i.target)}` : 'set a target below'} />
          <StatTile label="Progress" value={p.pct != null ? `${Math.round(p.pct * 100)}%` : '—'} sub={i.status === 'in_progress' ? (on ? 'On track' : p.overdue ? 'Overdue' : 'Behind schedule') : initiativeStatusInfo(i.status).label} />
          <StatTile label="Spent" value={fmt.money(p.spent, { cents: false })} sub={i.budget ? `of ${fmt.money(i.budget, { cents: false })} budget` : 'no budget'} />
          <StatTile label="Steps" value={`${p.stepsDone}/${p.stepsTotal}`} sub={i.dueDate ? `due ${fmt.dateShort(i.dueDate)}` : undefined} />
        </div>

        <div className="biz-form">
          <Field label="Area">
            <Combo value={i.area} suggestions={INITIATIVE_AREAS} onChange={(v) => up({ area: v || undefined })} placeholder="Marketing, Sales…" />
          </Field>
          <Field label="Serves goal">
            <Select value={i.goalId ?? ''} placeholder={b.strategy.goals.length ? '— none —' : 'No goals in Strategy yet'} options={b.strategy.goals.map((g) => ({ value: g.id, label: g.title || 'Untitled goal' }))} onChange={(v) => up({ goalId: v || undefined }, false)} />
          </Field>
          <Field label="Owner">
            <Input value={i.owner} placeholder="Who drives it" onChange={(v) => up({ owner: v || undefined })} />
          </Field>
          <Field label="Start">
            <DateInput value={i.startDate} onChange={(v) => up({ startDate: v }, false)} />
          </Field>
          <Field label="Due">
            <DateInput value={i.dueDate} onChange={(v) => up({ dueDate: v }, false)} />
          </Field>
          <Field label="Impact (1–5)">
            <Select value={i.impact ? String(i.impact) : ''} placeholder="Not rated" options={RATINGS} onChange={(v) => up({ impact: v ? Number(v) : undefined }, false)} />
          </Field>
          <Field label="Effort (1–5)">
            <Select value={i.effort ? String(i.effort) : ''} placeholder="Not rated" options={RATINGS} onChange={(v) => up({ effort: v ? Number(v) : undefined }, false)} />
          </Field>
          <Field label="Marketing Space">
            <div className="row" style={{ gap: 4 }}>
              <Select value={i.spaceId ?? ''} placeholder="— none —" options={spaces.map((s) => ({ value: s.id, label: s.title }))} onChange={(v) => up({ spaceId: v || undefined }, false)} />
              {i.spaceId && <IconButton icon={ExternalLink} label={linkedSpace ? `Open ${linkedSpace.title}` : 'Open space'} disabled={!linkedSpace} onClick={() => void openSpaceById(i.spaceId!)} />}
            </div>
          </Field>
          <Field label="Hypothesis" span="all">
            <Textarea autoGrow minRows={2} value={i.hypothesis} placeholder="If we … then … because … (what you expect to happen and why)" onChange={(v) => up({ hypothesis: v || undefined })} />
          </Field>
        </div>

        <KpiSection i={i} current={p.current} pct={p.pct} />

        <div className="biz-section-head">
          <h3>Budget & spend</h3>
        </div>
        <div className="lib-budget">
          <div className="biz-form biz-form-tight">
            <Field label="Budget">
              <NumberInput decimals={2} value={i.budget} onChange={(v) => up({ budget: v ?? undefined })} />
            </Field>
            <Field label="Other spend" hint="not in Expenses">
              <NumberInput decimals={2} value={i.spend} onChange={(v) => up({ spend: v ?? undefined })} />
            </Field>
          </div>
          {i.budget ? (
            <div className="lib-budget-meter">
              <div className="row small">
                <Money value={p.spent} strong />
                <span className="muted">of {fmt.money(i.budget)}</span>
                <span className="spacer" />
                <span className={budgetTone === 'critical' ? 'biz-out' : 'muted'}>{p.spent > i.budget ? `${fmt.money(p.spent - i.budget)} over` : `${fmt.money(i.budget - p.spent)} left`}</span>
              </div>
              <Meter value={p.spent} max={i.budget} tone={budgetTone} label="Budget used" />
            </div>
          ) : null}
        </div>
        <div className="biz-list">
          {expenses.map((e) => (
            <div key={e.id} className="biz-list-row static">
              <button type="button" className="biz-list-row lib-flat" onClick={() => navigateSpace('expenses', { expenseId: e.id })} title="Open in Expenses">
                <Receipt size={14} className="muted" />
                <span className="biz-date">{fmt.dateShort(e.date)}</span>
                <span className="biz-grow ellipsis">{[e.vendor, e.description].filter(Boolean).join(' · ') || 'Expense'}</span>
                <Money value={e.amount} />
              </button>
              <IconButton icon={Unlink} size="sm" label="Unlink expense" onClick={() => linkExpense(e.id, undefined)} />
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Link2 size={14} className="muted" />
          <Select
            size="sm"
            value=""
            placeholder={linkable.length ? 'Link an expense…' : 'No unlinked expenses'}
            disabled={!linkable.length}
            options={linkable.map((e) => ({ value: e.id, label: `${fmt.dateShort(e.date)} · ${e.vendor || e.description || 'Expense'} · ${fmt.money(e.amount)}` }))}
            onChange={(v) => v && linkExpense(v, i.id)}
            aria-label="Link an expense"
          />
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => { const e = makeExpense({ date: today, category: 'marketing', description: i.title || undefined, initiativeId: i.id }); addItem('expenses', e); navigateSpace('expenses', { expenseId: e.id }); }}>
            New expense
          </Button>
        </div>

        <StepsSection i={i} />

        <div className="biz-form">
          <Field label="Results & learnings" span="all">
            <Textarea autoGrow minRows={3} value={i.results} placeholder="What happened, what worked, what you would do differently, decision (scale / change / stop)" onChange={(v) => up({ results: v || undefined })} />
          </Field>
          <Field label="Notes" span="all">
            <Textarea autoGrow minRows={2} value={i.notes} onChange={(v) => up({ notes: v || undefined })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function KpiSection({ i, current, pct }: { i: Initiative; current?: number; pct: number | null }) {
  const fmt = useFmt();
  const today = useToday();
  const [date, setDate] = useState<string | undefined>(today);
  const [value, setValue] = useState<number | undefined>(undefined);
  const [note, setNote] = useState('');
  const up = (patch: Partial<Initiative>, coalesce = true) => updateItem('initiatives', i.id, patch, coalesce);
  const points = useMemo(() => {
    const pts = i.updates.filter((u) => u.value != null && u.date).map((u) => ({ x: u.date, y: u.value! }));
    if (i.baseline != null && i.startDate && !pts.some((x) => x.x <= i.startDate!)) pts.unshift({ x: i.startDate, y: i.baseline });
    return pts.sort((a, z) => a.x.localeCompare(z.x));
  }, [i.updates, i.baseline, i.startDate]);
  const addCheckIn = () => {
    if (value == null && !note.trim()) return;
    addInitiativeChild(i.id, 'updates', makeUpdate({ date: date || today, value, note: note.trim() || undefined }));
    setValue(undefined);
    setNote('');
  };
  const updates = [...i.updates].sort((a, z) => z.date.localeCompare(a.date));
  return (
    <>
      <div className="biz-section-head">
        <h3>KPI & check-ins</h3>
        {pct != null && <span className="muted small">{Math.round(pct * 100)}% of the way from baseline to target</span>}
      </div>
      <div className="biz-form biz-form-tight">
        <Field label="KPI" style={{ gridColumn: 'span 2' }}>
          <Input value={i.kpi} placeholder="e.g. Inbound leads / month" onChange={(v) => up({ kpi: v || undefined })} />
        </Field>
        <Field label="Baseline">
          <NumberInput decimals={2} value={i.baseline} onChange={(v) => up({ baseline: v ?? undefined })} />
        </Field>
        <Field label="Target">
          <NumberInput decimals={2} value={i.target} onChange={(v) => up({ target: v ?? undefined })} />
        </Field>
        <Field label="Current" hint={i.updates.some((u) => u.value != null) ? 'from the latest check-in' : undefined}>
          <NumberInput decimals={2} value={current} disabled={i.updates.some((u) => u.value != null)} onChange={(v) => up({ current: v ?? undefined })} />
        </Field>
      </div>
      <div className="lib-chart">
        <LineChart
          ariaLabel={`${i.kpi || 'KPI'} over time`}
          height={190}
          series={[{ id: 'kpi', label: i.kpi || 'KPI', points }]}
          target={i.target != null ? { y: i.target, label: 'Target' } : undefined}
          xFormat={(x) => fmt.dateShort(String(x))}
          empty="Log a check-in with a value to see the KPI over time."
        />
      </div>
      <div className="lib-checkin">
        <DateInput size="sm" value={date} onChange={setDate} />
        <NumberInput size="sm" decimals={2} value={value} placeholder="Value" onChange={setValue} aria-label="KPI value" />
        <Input size="sm" value={note} placeholder="What happened since the last check-in?" onChange={setNote} onKeyDown={(e) => e.key === 'Enter' && addCheckIn()} aria-label="Note" />
        <Button size="sm" icon={Plus} disabled={value == null && !note.trim()} onClick={addCheckIn}>
          Log check-in
        </Button>
      </div>
      {updates.length > 0 && (
        <div className="lib-updates">
          {updates.map((u) => (
            <div key={u.id} className="lib-update">
              <DateInput bare size="sm" value={u.date} onChange={(v) => updateInitiativeChild(i.id, 'updates', u.id, { date: v || u.date }, false)} />
              <NumberInput bare size="sm" decimals={2} value={u.value} placeholder="—" onChange={(v) => updateInitiativeChild(i.id, 'updates', u.id, { value: v })} aria-label="Value" />
              <Textarea bare autoGrow minRows={1} value={u.note} placeholder="Note" onChange={(v) => updateInitiativeChild(i.id, 'updates', u.id, { note: v || undefined })} aria-label="Note" />
              <IconButton icon={Trash2} size="sm" label="Delete check-in" onClick={() => removeInitiativeChild(i.id, 'updates', u.id)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function StepsSection({ i }: { i: Initiative }) {
  const fmt = useFmt();
  const today = useToday();
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    addInitiativeChild(i.id, 'steps', makeTask({ title: t }));
    setText('');
  };
  return (
    <>
      <div className="biz-section-head">
        <h3>Steps</h3>
        {i.steps.length > 0 && (
          <span className="muted small">
            {i.steps.filter((s) => s.done).length}/{i.steps.length} done
          </span>
        )}
      </div>
      <div className="lib-steps">
        {i.steps.map((s, idx) => (
          <div key={s.id} className={`lib-step ${s.done ? 'done' : ''}`}>
            <IconButton icon={s.done ? CheckSquare : Square} size="sm" label={s.done ? 'Mark not done' : 'Mark done'} onClick={() => updateInitiativeChild(i.id, 'steps', s.id, { done: !s.done }, false)} />
            <Input bare value={s.title} onChange={(v) => updateInitiativeChild(i.id, 'steps', s.id, { title: v })} aria-label="Step" />
            <DateInput bare size="sm" className={s.due && s.due < today && !s.done ? 'lib-late' : undefined} value={s.due} onChange={(v) => updateInitiativeChild(i.id, 'steps', s.id, { due: v }, false)} title={s.due ? `Due ${fmt.dateMedium(s.due)}` : 'Due date'} />
            <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={idx === 0} onClick={() => moveInitiativeStep(i.id, s.id, -1)} />
            <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={idx === i.steps.length - 1} onClick={() => moveInitiativeStep(i.id, s.id, 1)} />
            <IconButton icon={Trash2} size="sm" label="Delete step" onClick={() => removeInitiativeChild(i.id, 'steps', s.id)} />
          </div>
        ))}
      </div>
      <div className="lib-add-row">
        <Input value={text} placeholder="Add a step…" onChange={setText} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New step" />
        <Button icon={Plus} disabled={!text.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </>
  );
}

