/* Strategy: an editable one-page business plan — mission, positioning, ideal
   client, pricing, marketing and sales; offers / services with prices; goals with
   live progress; quarterly priorities; SWOT and competitors. */
import '../../biz.css';
import '../../library.css';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Compass, ExternalLink, Megaphone, Plus, Rocket, Trash2 } from 'lucide-react';
import { useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { exportCsv } from '@/backend';
import { safeFileName, plural } from '@/lib/text';
import { openSpaceById } from '@/shell/spaceActions';
import { Button, Checkbox, DateInput, EmptyState, ExportMenu, Field, IconButton, Input, ModuleHeader, NumberInput, Select, Switch, Textarea, confirmDialog, toast } from '@/ui';
import { Meter } from '@/ui/charts';
import { SharedCalculator } from '@/spaces/calc/SharedCalculator';
import { openUrl } from '@/spaces/modules/assets/actions';
import { GOAL_METRICS, PERIODS } from '../../constants';
import { goalProgress, initiativeStatusInfo } from '../../derive-work';
import { setStrategy } from '../../ops';
import { Pill, useBiz, useFmt, useMarketingSpaces, useNavParams, useToday } from '../../ui';
import type { BizGoal, BizOffer, BizStrategy } from '../../types';
import {
  STRATEGY_TEXT_FIELDS,
  addStrategyItem,
  goalIsMoney,
  goalValue,
  makeCompetitor,
  makeGoal,
  makeOffer,
  makePriority,
  moveStrategyItem,
  quarterOf,
  removeStrategyItem,
  setSwot,
  updateStrategyItem,
} from './ops';

const SECTIONS = [
  { id: 'story', label: 'Our strategy' },
  { id: 'plan', label: 'Plan' },
  { id: 'offers', label: 'Offers' },
  { id: 'goals', label: 'Goals' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'swot', label: 'SWOT' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'calc', label: 'Calculator' },
] as const;

const scrollTo = (id: string) => document.getElementById(`biz-strat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const focusLast = (sel: string) => requestAnimationFrame(() => [...document.querySelectorAll<HTMLInputElement>(sel)].pop()?.focus());

export default function StrategyModule() {
  const b = useBiz();
  const st = b.strategy;
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const today = useToday();
  useNavParams((p) => {
    if (typeof p.section === 'string') requestAnimationFrame(() => scrollTo(p.section));
  });

  const goals = st.goals.map((g) => ({ g, p: goalProgress(b, g, today) }));
  const reached = goals.filter(({ g, p }) => g.done || (p.pct ?? 0) >= 1).length;
  const prDone = st.priorities.filter((x) => x.done).length;
  const filled = STRATEGY_TEXT_FIELDS.filter((f) => String(st[f.key] ?? '').trim()).length;
  const subtitle = [
    `${filled}/${STRATEGY_TEXT_FIELDS.length} plan sections`,
    st.offers.length ? plural(st.offers.filter((o) => o.active).length, 'active offer') : '',
    st.goals.length ? `${reached}/${plural(st.goals.length, 'goal')} reached` : '',
    st.priorities.length ? `${prDone}/${st.priorities.length} priorities done` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const csv = async (what: 'goals' | 'offers' | 'competitors') => {
    const name = safeFileName(`${title} - ${what === 'goals' ? 'Goals' : what === 'offers' ? 'Offers' : 'Competitors'}`);
    let path: string | null = null;
    if (what === 'goals')
      path = await exportCsv(name, goals, [
        { header: 'Goal', value: (x) => x.g.title },
        { header: 'Metric', value: (x) => GOAL_METRICS.find((m) => m.value === x.g.metric)?.label },
        { header: 'Period', value: (x) => x.p.periodLabel },
        { header: 'Current', value: (x) => x.p.current },
        { header: 'Target', value: (x) => x.g.target },
        { header: 'Progress %', value: (x) => (x.p.pct != null ? Math.round(x.p.pct * 100) : '') },
        { header: 'Due', value: (x) => x.g.due },
        { header: 'Done', value: (x) => (x.g.done ? 'yes' : '') },
      ]);
    else if (what === 'offers')
      path = await exportCsv(name, st.offers, [
        { header: 'Offer', value: (x) => x.name },
        { header: 'Price', value: (x) => x.price },
        { header: 'Price note', value: (x) => x.priceNote },
        { header: 'Ideal for', value: (x) => x.idealFor },
        { header: 'Description', value: (x) => x.description },
        { header: 'Active', value: (x) => (x.active ? 'yes' : 'no') },
      ]);
    else
      path = await exportCsv(name, st.competitors, [
        { header: 'Competitor', value: (x) => x.name },
        { header: 'Website', value: (x) => x.url },
        { header: 'Strengths', value: (x) => x.strengths },
        { header: 'Weaknesses', value: (x) => x.weaknesses },
        { header: 'Notes', value: (x) => x.notes },
      ]);
    if (path) toast('Exported');
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Strategy"
        icon={Compass}
        subtitle={subtitle}
        actions={
          <ExportMenu
            docs={[
              { id: 'space-biz-strategy', label: 'Business plan (PDF)' },
              { id: 'space-biz-growth', label: 'Growth initiatives report' },
            ]}
            csv={[
              { label: 'Goals (CSV)', onClick: () => void csv('goals') },
              { label: 'Offers (CSV)', onClick: () => void csv('offers') },
              { label: 'Competitors (CSV)', onClick: () => void csv('competitors') },
            ]}
          />
        }
      />
      <div className="module-body">
      <div className="biz-page">
        <nav className="lib-jump" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => scrollTo(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <section id="biz-strat-story" className="lib-section biz-story">
          <div className="biz-section-head">
            <h3>Our strategy</h3>
            <span className="muted small">The big picture, in your own words</span>
          </div>
          <Textarea
            bare
            autoGrow
            minRows={4}
            className="biz-story-text"
            value={st.narrative}
            placeholder={'Where is this business going, and how will it get there?\n\nWrite it the way you would explain it to a partner over coffee: who we serve, what we do better than anyone, how we will grow over the next year, and what we are saying no to.'}
            onChange={(v) => setStrategy({ narrative: v || undefined })}
            aria-label="Our strategy"
          />
        </section>

        <PlanSection st={st} />
        <OffersSection st={st} />

        <section id="biz-strat-goals" className="lib-section">
          <div className="biz-section-head">
            <h3>Goals</h3>
            <span className="muted small">Revenue, profit, clients, deals and pipeline update automatically from your data</span>
            <div className="spacer" />
            <Button
              size="sm"
              icon={Plus}
              onClick={() => {
                addStrategyItem('goals', makeGoal({ title: 'New goal' }));
                focusLast('.lib-goal-title input');
              }}
            >
              Add goal
            </Button>
          </div>
          {goals.length === 0 ? (
            <div className="lib-empty-card">
              <b>Set 2–4 goals for the year</b>
              <span>For example “$120k revenue this year”, “8 new clients”, or a custom goal you update yourself.</span>
              <Button size="sm" variant="primary" icon={Plus} onClick={() => addStrategyItem('goals', makeGoal({ title: 'Revenue this year', metric: 'revenue', period: 'ytd' }))}>
                Add a revenue goal
              </Button>
            </div>
          ) : (
            <div className="lib-goals">
              {goals.map(({ g, p }) => (
                <GoalCard key={g.id} g={g} current={p.current} pct={p.pct} periodLabel={p.periodLabel} money={(n) => fmt.money(n, { cents: false })} initiatives={b.initiatives.filter((i) => i.goalId === g.id).map((i) => ({ id: i.id, title: i.title, status: i.status }))} />
              ))}
            </div>
          )}
        </section>

        <PrioritiesSection st={st} today={today} />
        <SwotSection st={st} />
        <CompetitorsSection st={st} />

        <section id="biz-strat-calc" className="lib-section">
          <SharedCalculator />
        </section>

        <section className="lib-section">
          <div className="biz-section-head">
            <h3>Notes</h3>
          </div>
          <Textarea autoGrow minRows={3} value={st.notes} placeholder="Anything else: assumptions, open questions, ideas for later…" onChange={(v) => setStrategy({ notes: v || undefined })} />
        </section>
      </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- plan */

function PlanSection({ st }: { st: BizStrategy }) {
  const s = useSpace((x) => x.spaceIds) ?? [];
  const spaces = useMarketingSpaces();
  const linked = s.map((id) => ({ id, s: spaces.find((x) => x.id === id) }));
  return (
    <section id="biz-strat-plan" className="lib-section">
      <div className="biz-section-head">
        <h3>Business plan</h3>
        <span className="muted small">Saved as you type</span>
      </div>
      <div className="lib-plan">
        {STRATEGY_TEXT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} className={f.key === 'positioning' ? 'lib-plan-wide' : undefined}>
            <Textarea autoGrow minRows={f.key === 'positioning' || f.key === 'mission' || f.key === 'vision' ? 2 : 3} value={(st[f.key] as string | undefined) ?? ''} placeholder={f.hint} onChange={(v) => setStrategy({ [f.key]: v || undefined } as Partial<BizStrategy>)} />
            {f.key === 'marketingPlan' && (
              <div className="lib-linked">
                <Megaphone size={13} />
                {linked.length === 0 ? (
                  <span className="muted small">
                    No Marketing Spaces linked.{' '}
                    <button type="button" className="biz-link" onClick={() => navigateSpace('linked')}>
                      Link one
                    </button>{' '}
                    to plan content and campaigns.
                  </span>
                ) : (
                  <>
                    <span className="muted small">Marketing Spaces:</span>
                    {linked.map(({ id, s: sp }) => (
                      <button key={id} type="button" className="lib-chip" disabled={!sp} onClick={() => void openSpaceById(id)} title={sp ? `Open ${sp.title}` : 'This space was deleted'}>
                        {sp?.title ?? 'Deleted space'}
                        <ExternalLink size={11} />
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </Field>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- offers */

function OffersSection({ st }: { st: BizStrategy }) {
  const b = useBiz();
  const add = () => {
    addStrategyItem('offers', makeOffer({ name: 'New offer' }));
    focusLast('.lib-offer-name input');
  };
  return (
    <section id="biz-strat-offers" className="lib-section">
      <div className="biz-section-head">
        <h3>Offers & services</h3>
        <span className="muted small">What you sell and for how much</span>
        <div className="spacer" />
        <Button size="sm" icon={Plus} onClick={add}>
          Add offer
        </Button>
      </div>
      {st.offers.length === 0 ? (
        <div className="lib-empty-card">
          <b>List what you sell</b>
          <span>Packages, retainers, day rates or products — with a price, who it is for and what is included. Deals in the pipeline can point to an offer.</span>
          <Button size="sm" variant="primary" icon={Plus} onClick={add}>
            Add your first offer
          </Button>
        </div>
      ) : (
        <div className="biz-cards">
          {st.offers.map((o, i) => (
            <OfferCard key={o.id} o={o} first={i === 0} last={i === st.offers.length - 1} won={b.deals.filter((d) => d.offerId === o.id && d.stage === 'won').length} open={b.deals.filter((d) => d.offerId === o.id && d.stage !== 'won' && d.stage !== 'lost').length} />
          ))}
        </div>
      )}
    </section>
  );
}

function OfferCard({ o, first, last, won, open }: { o: BizOffer; first: boolean; last: boolean; won: number; open: number }) {
  const up = (patch: Partial<BizOffer>, coalesce = true) => updateStrategyItem('offers', o.id, patch, coalesce);
  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${o.name || 'this offer'}”?`, message: 'Deals that point to it keep their value. You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true })) removeStrategyItem('offers', o.id);
  };
  return (
    <div className={`biz-card lib-offer ${o.active ? '' : 'off'}`}>
      <div className="biz-card-head lib-offer-name">
        <Input value={o.name} placeholder="Offer name" onChange={(v) => up({ name: v })} aria-label="Offer name" />
        <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={first} onClick={() => moveStrategyItem('offers', o.id, -1)} />
        <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={last} onClick={() => moveStrategyItem('offers', o.id, 1)} />
        <IconButton icon={Trash2} size="sm" label="Delete offer" onClick={() => void remove()} />
      </div>
      <div className="lib-price">
        <NumberInput decimals={2} value={o.price} placeholder="Price" onChange={(v) => up({ price: v ?? undefined })} aria-label="Price" />
        <Input value={o.priceNote} placeholder="from / per month / per video" onChange={(v) => up({ priceNote: v || undefined })} aria-label="Price note" />
      </div>
      <Textarea autoGrow minRows={2} value={o.description} placeholder="What’s included" onChange={(v) => up({ description: v || undefined })} aria-label="Description" />
      <Input value={o.idealFor} placeholder="Ideal for…" onChange={(v) => up({ idealFor: v || undefined })} aria-label="Ideal for" />
      <div className="biz-card-stats">
        {(won > 0 || open > 0) && (
          <button type="button" className="biz-link small" onClick={() => navigateSpace('pipeline')}>
            {[won && `${won} won`, open && `${open} open`].filter(Boolean).join(' · ')} deal{won + open === 1 ? '' : 's'}
          </button>
        )}
        <Switch checked={o.active} onChange={(v) => up({ active: v }, false)} label="Active" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- goals */

function GoalCard({ g, current, pct, periodLabel, money, initiatives }: { g: BizGoal; current: number; pct: number | null; periodLabel?: string; money: (n: number) => string; initiatives: { id: string; title: string; status: string }[] }) {
  const up = (patch: Partial<BizGoal>, coalesce = true) => updateStrategyItem('goals', g.id, patch, coalesce);
  const computed = g.metric !== 'custom';
  const done = g.done || (pct ?? 0) >= 1;
  const remove = async () => {
    if (await confirmDialog({ title: `Delete the goal “${g.title || 'Untitled'}”?`, message: 'Initiatives linked to it keep their data. You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true })) removeStrategyItem('goals', g.id);
  };
  return (
    <div className={`lib-goal ${g.done ? 'done' : ''}`}>
      <div className="lib-goal-head lib-goal-title">
        <Input value={g.title} placeholder="Goal" onChange={(v) => up({ title: v })} aria-label="Goal" />
        <IconButton icon={Trash2} size="sm" label="Delete goal" onClick={() => void remove()} />
      </div>
      <div className="lib-goal-progress">
        <div className="lib-goal-nums">
          <b>{goalValue(g.metric, current, money)}</b>
          <span className="muted">of {g.target != null ? goalValue(g.metric, g.target, money) : 'no target'}</span>
          <span className="spacer" />
          {pct != null && <span className={done ? 'biz-ok' : 'muted small'}>{done ? <CheckCircle2 size={13} /> : null}{Math.round(pct * 100)}%</span>}
        </div>
        <Meter value={pct ?? 0} max={1} tone={done ? 'good' : undefined} label={`${g.title} progress`} />
        {periodLabel && <span className="muted tiny">{periodLabel}</span>}
      </div>
      <div className="biz-form biz-form-tight">
        <Field label="Measured by">
          <Select size="sm" value={g.metric} options={GOAL_METRICS} onChange={(v) => up({ metric: v as BizGoal['metric'] }, false)} />
        </Field>
        {computed && g.metric !== 'pipeline' && (
          <Field label="Period">
            <Select size="sm" value={g.period || 'ytd'} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} onChange={(v) => up({ period: v }, false)} />
          </Field>
        )}
        <Field label="Target">
          <NumberInput size="sm" decimals={goalIsMoney(g.metric) ? 2 : 0} value={g.target} onChange={(v) => up({ target: v ?? undefined })} />
        </Field>
        {!computed && (
          <Field label="Current">
            <NumberInput size="sm" decimals={2} value={g.current} onChange={(v) => up({ current: v ?? undefined })} />
          </Field>
        )}
        <Field label="Due">
          <DateInput size="sm" value={g.due} onChange={(v) => up({ due: v }, false)} />
        </Field>
      </div>
      <div className="lib-goal-foot">
        <Checkbox checked={g.done} onChange={(v) => up({ done: v || undefined }, false)} label="Mark reached" />
        <span className="spacer" />
        {initiatives.map((i) => (
          <button key={i.id} type="button" className="lib-chip" onClick={() => navigateSpace('growth', { initiativeId: i.id })} title="Open initiative">
            <Rocket size={11} />
            <span className="ellipsis">{i.title || 'Untitled'}</span>
            <Pill color={initiativeStatusInfo(i.status as never).color}>{initiativeStatusInfo(i.status as never).label}</Pill>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- priorities */

function PrioritiesSection({ st, today }: { st: BizStrategy; today: string }) {
  const [text, setText] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const q = quarterOf(today);
  const groups = useMemo(() => {
    const m = new Map<string, typeof st.priorities>();
    for (const p of st.priorities) {
      if (hideDone && p.done) continue;
      const k = p.quarter || 'No quarter';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [z]) => (a === q ? -1 : z === q ? 1 : z.localeCompare(a)));
  }, [st.priorities, hideDone, q]);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    addStrategyItem('priorities', makePriority({ text: t, quarter: q }));
    setText('');
  };
  return (
    <section id="biz-strat-priorities" className="lib-section">
      <div className="biz-section-head">
        <h3>Quarterly priorities</h3>
        <span className="muted small">The 3–5 things that matter most this quarter</span>
        <div className="spacer" />
        {st.priorities.some((p) => p.done) && <Checkbox checked={hideDone} onChange={setHideDone} label="Hide done" />}
      </div>
      <div className="lib-add-row">
        <Input value={text} placeholder={`Add a priority for ${q}…`} onChange={setText} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New priority" />
        <Button icon={Plus} disabled={!text.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {groups.length === 0 ? (
        <div className="biz-empty-line">{st.priorities.length ? 'All priorities are done.' : 'No priorities yet — add what you will focus on this quarter.'}</div>
      ) : (
        groups.map(([quarter, list]) => (
          <div key={quarter} className="lib-prio-group">
            <div className="lib-prio-q">
              {quarter}
              {quarter === q && <span className="biz-tag">Now</span>}
              <span className="muted tiny">
                {list.filter((x) => x.done).length}/{list.length}
              </span>
            </div>
            {list.map((p) => (
              <div key={p.id} className={`lib-prio ${p.done ? 'done' : ''}`}>
                <Checkbox checked={p.done} onChange={(v) => updateStrategyItem('priorities', p.id, { done: v }, false)} />
                <Input bare value={p.text} onChange={(v) => updateStrategyItem('priorities', p.id, { text: v })} aria-label="Priority" />
                <Input bare size="sm" className="lib-prio-quarter" value={p.quarter} placeholder="Quarter" onChange={(v) => updateStrategyItem('priorities', p.id, { quarter: v || undefined })} aria-label="Quarter" />
                <IconButton icon={Trash2} size="sm" label="Delete priority" onClick={() => removeStrategyItem('priorities', p.id)} />
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- SWOT */

const SWOT: { key: keyof BizStrategy['swot']; label: string; hint: string; color: string }[] = [
  { key: 'strengths', label: 'Strengths', hint: 'What you do better than others; unique skills, gear, relationships', color: '#2fb36d' },
  { key: 'weaknesses', label: 'Weaknesses', hint: 'Where you are thin: time, skills, cash, reach', color: '#e8590c' },
  { key: 'opportunities', label: 'Opportunities', hint: 'Trends, gaps, partnerships, underserved clients', color: '#4c6ef5' },
  { key: 'threats', label: 'Threats', hint: 'Competition, platform changes, client concentration, economy', color: '#e03131' },
];

function SwotSection({ st }: { st: BizStrategy }) {
  return (
    <section id="biz-strat-swot" className="lib-section">
      <div className="biz-section-head">
        <h3>SWOT</h3>
      </div>
      <div className="lib-swot">
        {SWOT.map((x) => (
          <div key={x.key} className="lib-swot-cell" style={{ ['--sc' as string]: x.color }}>
            <b>{x.label}</b>
            <Textarea bare autoGrow minRows={4} value={st.swot[x.key]} placeholder={x.hint} onChange={(v) => setSwot({ [x.key]: v || undefined })} aria-label={x.label} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- competitors */

function CompetitorsSection({ st }: { st: BizStrategy }) {
  const add = () => {
    addStrategyItem('competitors', makeCompetitor({ name: '' }));
    focusLast('.lib-comp-name input, input.lib-comp-name');
  };
  return (
    <section id="biz-strat-competitors" className="lib-section">
      <div className="biz-section-head">
        <h3>Competitors</h3>
        <span className="muted small">Who else your clients consider</span>
        <div className="spacer" />
        <Button size="sm" icon={Plus} onClick={add}>
          Add competitor
        </Button>
      </div>
      {st.competitors.length === 0 ? (
        <EmptyState title="No competitors yet" description="Note 2–3 alternatives your clients consider (other studios, freelancers, doing it in-house) and what they do well or badly." style={{ padding: '18px 10px' }} />
      ) : (
        <div className="table-wrap">
          <table className="table lib-comp-table">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Name</th>
                <th style={{ width: '18%' }}>Website</th>
                <th>Strengths</th>
                <th>Weaknesses</th>
                <th>Notes</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {st.competitors.map((c) => {
                const up = (patch: Partial<typeof c>) => updateStrategyItem('competitors', c.id, patch);
                return (
                  <tr key={c.id}>
                    <td>
                      <Input bare className="lib-comp-name" value={c.name} placeholder="Name" onChange={(v) => up({ name: v })} aria-label="Competitor name" />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 2 }}>
                        <Input bare value={c.url} placeholder="website" onChange={(v) => up({ url: v || undefined })} aria-label="Website" />
                        {c.url && <IconButton icon={ExternalLink} size="sm" label="Open website" onClick={() => openUrl(c.url)} />}
                      </div>
                    </td>
                    <td>
                      <Textarea bare autoGrow minRows={1} value={c.strengths} onChange={(v) => up({ strengths: v || undefined })} aria-label="Strengths" />
                    </td>
                    <td>
                      <Textarea bare autoGrow minRows={1} value={c.weaknesses} onChange={(v) => up({ weaknesses: v || undefined })} aria-label="Weaknesses" />
                    </td>
                    <td>
                      <Textarea bare autoGrow minRows={1} value={c.notes} onChange={(v) => up({ notes: v || undefined })} aria-label="Notes" />
                    </td>
                    <td>
                      <IconButton icon={Trash2} size="sm" label="Delete competitor" onClick={() => removeStrategyItem('competitors', c.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
