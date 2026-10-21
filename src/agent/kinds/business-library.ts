/* Agent (MCP) collections, single fields and tools of the business library
   sections: Strategy (plan text, SWOT, offers, goals, quarterly priorities,
   competitors), Growth initiatives (with steps and dated KPI check-ins),
   Workflows & SOPs (steps, runs) and Resources (library + sales enablement). */
import type { BizResource, BusinessData, Initiative, Sop } from '@/spaces/business/types';
import { ENABLEMENT_CATEGORIES, GOAL_METRICS, INITIATIVE_AREAS, INITIATIVE_STATUSES, LIBRARY_CATEGORIES, PERIODS, RESOURCE_KINDS, SOP_KINDS } from '@/spaces/business/constants';
import { bizOf } from '@/spaces/business/derive';
import { goalProgress, initiativeProgress, initiativeStatusInfo } from '@/spaces/business/derive-work';
import { STRATEGY_TEXT_FIELDS } from '@/spaces/business/modules/strategy/ops';
import { growthSummary, isOnTrack, quadrantOf } from '@/spaces/business/modules/growth/ops';
import { findSop, finishRun, runProgress, setRunSteps, sopText, startRun } from '@/spaces/business/modules/sops/ops';
import { todayISO } from '@/lib/dates';
import type { SpaceData } from '@/spaces/types';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import type { ToolDef } from '../tool';
import { defineTool } from '../tool';
import { arr, bool, enm, obj, opt, str } from '../schema';
import { clean, fail, normDate, plural, spaceOf } from '../ctx';

const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const req = { required: true };
const NOTES = F('notes', 'text');

/** Typed loosely: the getters receive a SpaceData. */
type S = any;
const B = (s: S) => s.business as BusinessData | undefined;
const ST = (s: S) => B(s)?.strategy;
const DST = (d: S) => d.business?.strategy;

const today = () => todayISO();

/* ================================================================ collections */

export const BUSINESS_LIBRARY_COLLECTIONS: CollectionDef[] = [
  {
    name: 'offers',
    label: 'Offers & services (Strategy)',
    module: 'strategy' as any,
    description: 'What the business sells: packages, retainers, day rates, sponsorships, products — with price, price note ("from", "per month", "per video"), who it is for and whether it is currently offered. Deals in the sales pipeline can point to an offer (offerId).',
    kind: 'array',
    get: (s: S) => ST(s)?.offers,
    draft: (d: S) => DST(d)?.offers,
    idPrefix: 'offer',
    nameField: 'name',
    fields: [F('name', 'string', req), F('price', 'number', { desc: 'space currency' }), F('priceNote', 'string', { suggest: ['from', 'per month', 'per video', 'per day', 'per integration', 'fixed'] }), F('description', 'text', { desc: 'what is included' }), F('idealFor', 'string'), F('active', 'boolean')],
    defaults: () => ({ active: true }),
  },
  {
    name: 'goals',
    label: 'Business goals (Strategy)',
    module: 'strategy' as any,
    description:
      'Business goals with a target. metric revenue | profit | clients (new paying clients) | deals_won | pipeline (open deal value) are computed live from the data for the period (PeriodId, default ytd); custom goals are updated by hand with current. list_items shows _current and _pct (0–1). Growth initiatives can serve a goal (goalId).',
    kind: 'array',
    get: (s: S) => ST(s)?.goals,
    draft: (d: S) => DST(d)?.goals,
    idPrefix: 'goal',
    nameField: 'title',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      return items.map((g) => {
        const p = goalProgress(b, g, today());
        return { ...g, _current: p.current, _pct: p.pct == null ? undefined : Math.round(p.pct * 100) / 100, _period: p.periodLabel };
      });
    },
    fields: [
      F('title', 'string', req),
      F('metric', 'enum', { ...req, values: v(GOAL_METRICS) }),
      F('target', 'number'),
      F('current', 'number', { desc: 'progress of custom goals only (others are computed)' }),
      F('period', 'enum', { values: PERIODS.map((p) => p.value), desc: 'period of computed metrics (default ytd)' }),
      F('due', 'date'),
      F('done', 'boolean', { desc: 'marked reached by hand' }),
    ],
    defaults: () => ({ metric: 'custom', period: 'ytd' }),
  },
  {
    name: 'priorities',
    label: 'Quarterly priorities (Strategy)',
    module: 'strategy' as any,
    description: 'The few things that matter most this quarter, as a checklist. quarter is free text like "2026 Q4".',
    kind: 'array',
    get: (s: S) => ST(s)?.priorities,
    draft: (d: S) => DST(d)?.priorities,
    idPrefix: 'prio',
    nameField: 'text',
    fields: [F('text', 'string', req), F('quarter', 'string', { desc: 'e.g. "2026 Q4"' }), F('done', 'boolean')],
    defaults: () => {
      const t = today();
      return { done: false, quarter: `${t.slice(0, 4)} Q${Math.floor((Number(t.slice(5, 7)) - 1) / 3) + 1}` };
    },
  },
  {
    name: 'competitors',
    label: 'Competitors (Strategy)',
    module: 'strategy' as any,
    description: 'Alternatives clients consider, with strengths, weaknesses and notes.',
    kind: 'array',
    get: (s: S) => ST(s)?.competitors,
    draft: (d: S) => DST(d)?.competitors,
    idPrefix: 'comp',
    nameField: 'name',
    fields: [F('name', 'string', req), F('url', 'string', { desc: 'website' }), F('strengths', 'text'), F('weaknesses', 'text'), NOTES],
  },
  {
    name: 'initiatives',
    label: 'Growth initiatives',
    module: 'growth' as any,
    navParam: 'initiativeId',
    description:
      'Things the business tries in order to grow (new offer, outreach push, partnership, ads test, hiring …). Status idea → planned → in_progress → paused → done / dropped. Track a KPI from baseline to target with dated check-ins (initiative_updates — the latest value is the current one), budget vs spend (spend = money outside Expenses; expenses with initiativeId add to it), steps (initiative_steps), impact & effort 1–5 (impact/effort matrix: 3+ is high), results / learnings. list_items shows _current, _pct (0–1), _spent, _onTrack. Report: biz_strategy {action:"report"}; PDF: export_pdf space-biz-growth.',
    kind: 'array',
    get: (s: S) => B(s)?.initiatives,
    draft: (d: S) => d.business?.initiatives,
    idPrefix: 'init',
    nameField: 'title',
    hideInList: ['steps', 'updates'],
    enrich: (items, doc) => {
      const b = bizOf(doc);
      const t = today();
      return items.map((i: Initiative) => {
        const p = initiativeProgress(b, i, t);
        return { ...i, _current: p.current, _pct: p.pct == null ? undefined : Math.round(p.pct * 100) / 100, _spent: p.spent || undefined, _steps: i.steps.length ? `${p.stepsDone}/${p.stepsTotal}` : undefined, _onTrack: i.status === 'in_progress' ? isOnTrack(i, p, t) : undefined, _overdue: p.overdue || undefined, _quadrant: quadrantOf(i) ?? undefined };
      });
    },
    fields: [
      F('title', 'string', req),
      F('status', 'enum', { values: v(INITIATIVE_STATUSES) }),
      F('area', 'string', { suggest: INITIATIVE_AREAS }),
      F('goalId', 'ref', { ref: 'goals', desc: 'strategy goal it serves (id or title)' }),
      F('hypothesis', 'text', { desc: 'what you expect to happen and why' }),
      F('owner', 'string'),
      F('startDate', 'date'),
      F('dueDate', 'date'),
      F('kpi', 'string', { desc: 'e.g. "Inbound leads / month"' }),
      F('baseline', 'number'),
      F('target', 'number'),
      F('current', 'number', { desc: 'latest value when there are no check-ins with values' }),
      F('budget', 'number'),
      F('spend', 'number', { desc: 'money spent outside Expenses (expenses with initiativeId are added automatically)' }),
      F('impact', 'integer', { desc: '1–5' }),
      F('effort', 'integer', { desc: '1–5' }),
      F('spaceId', 'string', { desc: 'linked Marketing Space id (list_spaces)' }),
      F('results', 'text', { desc: 'results & learnings' }),
      NOTES,
      F('steps', 'object[]', { readOnly: true, desc: 'use initiative_steps' }),
      F('updates', 'object[]', { readOnly: true, desc: 'use initiative_updates' }),
    ],
    defaults: () => ({ status: 'idea', steps: [], updates: [] }),
  },
  {
    name: 'initiative_steps',
    label: 'Growth initiative steps',
    module: 'growth' as any,
    navParam: 'initiativeId',
    description: 'Nested in initiatives: pass parentId = initiative id or title. A checklist of what to do.',
    kind: 'array',
    parent: 'initiatives',
    get: (s: S, pid?: string) => B(s)?.initiatives.find((i) => i.id === pid)?.steps,
    draft: (d: S, pid?: string) => d.business?.initiatives.find((i: Initiative) => i.id === pid)?.steps,
    idPrefix: 'task',
    nameField: 'title',
    fields: [F('title', 'string', req), F('done', 'boolean'), F('due', 'date'), F('assignee', 'string', { desc: '"me" or a contractor id' }), NOTES],
    defaults: () => ({ done: false }),
  },
  {
    name: 'initiative_updates',
    label: 'Growth initiative check-ins (KPI over time)',
    module: 'growth' as any,
    navParam: 'initiativeId',
    description: 'Nested in initiatives: pass parentId = initiative id or title. A dated check-in with the KPI value at that date and a note. The latest dated value is the initiative’s current KPI (shown as a line chart).',
    kind: 'array',
    parent: 'initiatives',
    get: (s: S, pid?: string) => B(s)?.initiatives.find((i) => i.id === pid)?.updates,
    draft: (d: S, pid?: string) => d.business?.initiatives.find((i: Initiative) => i.id === pid)?.updates,
    idPrefix: 'upd',
    nameField: 'note',
    fields: [F('date', 'date', req), F('value', 'number', { desc: 'KPI value at this date' }), F('note', 'text')],
    defaults: () => ({ date: today() }),
  },
  {
    name: 'sops',
    label: 'Workflows, SOPs & checklists',
    module: 'sops' as any,
    navParam: 'sopId',
    description:
      'Step-by-step procedures (kind sop | workflow | checklist) grouped by category, with when to use it (trigger), owner, frequency, ordered steps (sop_steps — text + optional detail), related resources (resourceIds) and notes. Runs (one pass through a checklist, e.g. onboarding one client) are managed with biz_sop (start_run / check / finish); biz_sop {action:"get"} returns the SOP as numbered text. PDF: export_pdf space-biz-sops {sop, category}.',
    kind: 'array',
    get: (s: S) => B(s)?.sops,
    draft: (d: S) => d.business?.sops,
    idPrefix: 'sop',
    nameField: 'title',
    hideInList: ['steps', 'runs'],
    enrich: (items) =>
      items.map((x: Sop) => ({ ...x, _steps: x.steps.length, _activeRuns: x.runs.filter((r) => !r.finishedAt).map((r) => clean({ id: r.id, label: r.label, startedAt: r.startedAt, ...runProgress(x, r), pct: undefined })), _finishedRuns: x.runs.filter((r) => r.finishedAt).length || undefined })),
    fields: [
      F('title', 'string', req),
      F('kind', 'enum', { values: v(SOP_KINDS) }),
      F('category', 'string', { suggest: ['Clients', 'Delivery', 'Sales', 'Marketing', 'Content', 'Finance & admin', 'Hiring & contractors', 'Tools & IT', 'Other'] }),
      F('trigger', 'string', { desc: 'when to use it, e.g. "A new client signs"' }),
      F('owner', 'string'),
      F('frequency', 'string', { suggest: ['Per client', 'Per project', 'Weekly', 'Monthly', 'Quarterly', 'As needed'] }),
      F('resourceIds', 'ref[]', { ref: 'resources', desc: 'related resources (ids or titles)' }),
      NOTES,
      F('steps', 'object[]', { readOnly: true, desc: 'use sop_steps' }),
      F('runs', 'object[]', { readOnly: true, desc: 'use biz_sop' }),
      F('updatedAt', 'date', { readOnly: true }),
    ],
    defaults: () => ({ kind: 'sop', steps: [], resourceIds: [], runs: [], updatedAt: today() }),
  },
  {
    name: 'sop_steps',
    label: 'SOP / workflow / checklist steps',
    module: 'sops' as any,
    navParam: 'sopId',
    description: 'Nested in sops: pass parentId = SOP id or title. Ordered steps (move_items reorders) with an optional detail (how, links, gotchas).',
    kind: 'array',
    parent: 'sops',
    get: (s: S, pid?: string) => B(s)?.sops.find((x) => x.id === pid)?.steps,
    draft: (d: S, pid?: string) => d.business?.sops.find((x: Sop) => x.id === pid)?.steps,
    idPrefix: 'step',
    nameField: 'text',
    fields: [F('text', 'string', req), F('detail', 'text')],
  },
  {
    name: 'resources',
    label: 'Resources (library + sales enablement)',
    module: 'resources' as any,
    navParam: 'resourceId',
    description: `Reusable resources. section "library" shows in Resources (categories: ${v(LIBRARY_CATEGORIES).join(', ')}); section "enablement" shows in Sales Enablement (categories: ${v(ENABLEMENT_CATEGORIES).join(', ')}). kind text (body in text — templates, scripts, boilerplate the user copies), link (url) or file (files are added in the app). pinned puts it at the top.`,
    kind: 'array',
    get: (s: S) => B(s)?.resources,
    draft: (d: S) => d.business?.resources,
    idPrefix: 'res',
    nameField: 'title',
    hideInList: ['text'],
    enrich: (items) => items.map((r: BizResource) => ({ ...r, files: r.files?.length ? r.files.map((f) => f.fileName) : undefined, _textLength: r.text ? r.text.length : undefined })),
    fields: [
      F('title', 'string', req),
      F('section', 'enum', { values: ['library', 'enablement'], desc: 'library = Resources screen, enablement = Sales Enablement' }),
      F('category', 'string', { suggest: [...v(LIBRARY_CATEGORIES), ...v(ENABLEMENT_CATEGORIES)] }),
      F('kind', 'enum', { values: v(RESOURCE_KINDS) }),
      F('url', 'string'),
      F('text', 'text', { desc: 'body of a text resource (Markdown / plain); use [Placeholders] for things to fill in' }),
      F('description', 'string'),
      F('tags', 'string[]'),
      F('pinned', 'boolean'),
      F('files', 'object[]', { readOnly: true, desc: 'stored files (added in the app)' }),
      F('updatedAt', 'date'),
    ],
    defaults: () => ({ section: 'library', kind: 'text', updatedAt: today() }),
  },
];

/* ================================================================ single fields */

export const BUSINESS_LIBRARY_SINGLETONS: SingletonDef[] = [
  {
    path: 'business.strategy',
    label: 'Business plan text (Strategy): mission, vision, positioning, ideal client, unique value, pricing, marketing plan, sales process, notes',
    get: (s: S) => {
      const st = bizOf(s).strategy;
      return Object.fromEntries([...STRATEGY_TEXT_FIELDS.map((f) => f.key), 'notes'].map((k) => [k, (st as any)[k]]));
    },
    draft: (d: S) => d.business.strategy,
    fields: [...STRATEGY_TEXT_FIELDS.map((f) => F(f.key, 'text', { desc: f.hint })), F('notes', 'text')],
  },
  {
    path: 'business.strategy.swot',
    label: 'SWOT analysis (Strategy)',
    get: (s: S) => bizOf(s).strategy.swot,
    draft: (d: S) => d.business.strategy.swot,
    fields: [F('strengths', 'text'), F('weaknesses', 'text'), F('opportunities', 'text'), F('threats', 'text')],
  },
];

/* ================================================================ tools */

function biz(): { s: SpaceData; b: BusinessData } {
  const s = spaceOf('business');
  return { s, b: bizOf(s) };
}

function requireSop(b: BusinessData, ref: string | undefined): Sop {
  if (!ref?.trim()) fail('Pass sop (id or title).');
  const hit = findSop(b, ref);
  if (!hit) fail(`No workflow / SOP "${ref}". SOPs: ${b.sops.map((x) => `${x.title} (${x.id})`).join(', ') || 'none yet — add one with add_items {collection:"sops"}'}.`);
  return hit;
}

function findRun(b: BusinessData, runId: string | undefined, sopRef?: string) {
  if (!runId?.trim()) fail('Pass runId (from start_run or list_items {collection:"sops"} → _activeRuns).');
  const pool = sopRef ? [requireSop(b, sopRef)] : b.sops;
  for (const s of pool) {
    const r = s.runs.find((x) => x.id === runId || (x.label ?? '').toLowerCase() === runId.trim().toLowerCase());
    if (r) return { s, r };
  }
  fail(`No run "${runId}".`);
}

function runOut(s: Sop, runId: string) {
  const r = s.runs.find((x) => x.id === runId)!;
  const done = new Set(r.done);
  const pr = runProgress(s, r);
  return clean({
    sopId: s.id,
    sop: s.title,
    runId: r.id,
    label: r.label,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    done: pr.done,
    total: pr.total,
    steps: s.steps.map((st, i) => ({ id: st.id, n: i + 1, text: st.text, done: done.has(st.id) })),
  });
}

export const businessLibraryTools: ToolDef[] = [
  defineTool({
    name: 'biz_strategy',
    title: 'Business strategy & growth report',
    description:
      'The strategy of the open business in one call: action "report" returns the plan text (mission, vision, positioning, ideal client, unique value, pricing, marketing, sales process), SWOT, offers with prices, goals with live progress (current / target / pct for the period), quarterly priorities, competitors and every growth initiative with status, KPI baseline → current → target, progress, spend vs budget, steps done, on-track flag and latest check-in, plus totals. Edit with set_fields business.strategy.* / business.strategy.swot.* and the offers / goals / priorities / competitors / initiatives collections. PDFs: export_pdf space-biz-strategy (business plan) and space-biz-growth.',
    readOnly: true,
    global: true,
    input: obj({
      action: enm(['report'] as const),
      includeClosed: opt(bool('include done & dropped initiatives (default true)')),
    }),
    run(a: { action: 'report'; includeClosed?: boolean }) {
      const { s, b } = biz();
      const t = today();
      const st = b.strategy;
      const inits = b.initiatives.filter((i) => a.includeClosed !== false || (i.status !== 'done' && i.status !== 'dropped'));
      const sum = growthSummary(b, t);
      return {
        data: clean({
          business: s.meta.title,
          currency: s.settings.currency,
          plan: Object.fromEntries(STRATEGY_TEXT_FIELDS.map((f) => [f.key, st[f.key]])),
          swot: st.swot,
          offers: st.offers.map((o) => clean({ id: o.id, name: o.name, price: o.price, priceNote: o.priceNote, idealFor: o.idealFor, active: o.active, dealsWon: b.deals.filter((d) => d.offerId === o.id && d.stage === 'won').length || undefined })),
          goals: st.goals.map((g) => {
            const p = goalProgress(b, g, t);
            return clean({ id: g.id, title: g.title, metric: g.metric, period: p.periodLabel, current: p.current, target: g.target, pct: p.pct == null ? undefined : Math.round(p.pct * 100) / 100, due: g.due, done: g.done, initiatives: b.initiatives.filter((i) => i.goalId === g.id).map((i) => i.title) });
          }),
          priorities: st.priorities.map((x) => clean({ id: x.id, text: x.text, quarter: x.quarter, done: x.done })),
          competitors: st.competitors.map((c) => clean({ name: c.name, url: c.url, strengths: c.strengths, weaknesses: c.weaknesses })),
          growth: { inProgress: sum.active, open: sum.open, onTrack: sum.onTrack, budget: sum.budget, spent: sum.spent },
          initiatives: inits.map((i) => {
            const p = initiativeProgress(b, i, t);
            const last = [...i.updates].sort((x, z) => z.date.localeCompare(x.date))[0];
            return clean({
              id: i.id,
              title: i.title,
              status: initiativeStatusInfo(i.status).label,
              area: i.area,
              goal: st.goals.find((g) => g.id === i.goalId)?.title,
              owner: i.owner,
              startDate: i.startDate,
              dueDate: i.dueDate,
              kpi: i.kpi,
              baseline: i.baseline,
              current: p.current,
              target: i.target,
              pct: p.pct == null ? undefined : Math.round(p.pct * 100) / 100,
              onTrack: i.status === 'in_progress' ? isOnTrack(i, p, t) : undefined,
              overdue: p.overdue || undefined,
              budget: i.budget,
              spent: p.spent || undefined,
              linkedExpenses: b.expenses.filter((e) => e.initiativeId === i.id).length || undefined,
              steps: i.steps.length ? `${p.stepsDone}/${p.stepsTotal}` : undefined,
              impact: i.impact,
              effort: i.effort,
              quadrant: quadrantOf(i) ?? undefined,
              lastCheckIn: last ? clean({ date: last.date, value: last.value, note: last.note }) : undefined,
              checkIns: i.updates.length || undefined,
              results: i.results,
            });
          }),
        }),
      };
    },
  }),

  defineTool({
    name: 'biz_sop',
    title: 'Run workflows, SOPs and checklists',
    description:
      'Workflows / SOPs / checklists of the open business. "get": the SOP as numbered plain text plus its active runs. "start_run": start a run of a SOP (label e.g. the client, project or month) — returns the runId and its steps. "check": tick (done:true, default) or untick steps of a run (stepIds = step ids or 1-based step numbers). "finish": mark a run finished (reopen:true to reopen it). Create / edit SOPs and their steps with add_items / update_items (collections sops, sop_steps).',
    global: true,
    input: obj({
      action: enm(['get', 'start_run', 'check', 'finish'] as const),
      sop: opt(str('SOP id or title (get / start_run; optional to narrow a run lookup)')),
      label: opt(str('start_run: what this run is for, e.g. "Brightline Coffee"')),
      date: opt(str('start_run / finish: YYYY-MM-DD (default today)')),
      runId: opt(str('check / finish: run id (or its exact label)')),
      stepIds: opt(arr(str(), 'check: step ids or step numbers ("1", "2" …); omit to tick every step')),
      done: opt(bool('check: true = tick (default), false = untick')),
      reopen: opt(bool('finish: reopen a finished run instead')),
    }),
    run(a: { action: 'get' | 'start_run' | 'check' | 'finish'; sop?: string; label?: string; date?: string; runId?: string; stepIds?: string[]; done?: boolean; reopen?: boolean }) {
      const { b } = biz();
      if (a.action === 'get') {
        const s = requireSop(b, a.sop);
        return {
          text: sopText(b, s),
          data: clean({ id: s.id, kind: s.kind, steps: s.steps.map((x, i) => ({ id: x.id, n: i + 1 })), activeRuns: s.runs.filter((r) => !r.finishedAt).map((r) => runOut(s, r.id)), finishedRuns: s.runs.filter((r) => r.finishedAt).length || undefined }),
        };
      }
      if (a.action === 'start_run') {
        const s = requireSop(b, a.sop);
        if (!s.steps.length) fail(`"${s.title}" has no steps yet. Add them with add_items {collection:"sop_steps", parentId:"${s.id}"}.`);
        const id = startRun(s.id, a.label, normDate(a.date, 'date') ?? today());
        const after = bizOf(spaceOf('business')).sops.find((x) => x.id === s.id)!;
        return { data: runOut(after, id), summary: `Started “${s.title}”${a.label ? ` for ${a.label}` : ''}` };
      }
      const { s, r } = findRun(b, a.runId, a.sop);
      if (a.action === 'check') {
        const ids = (a.stepIds?.length ? a.stepIds : s.steps.map((x) => x.id)).map((ref) => {
          const hit = s.steps.find((x) => x.id === ref) ?? (/^\d+$/.test(ref.trim()) ? s.steps[Number(ref) - 1] : undefined) ?? s.steps.find((x) => x.text.trim().toLowerCase() === ref.trim().toLowerCase());
          if (!hit) fail(`No step "${ref}" in “${s.title}” (it has ${plural(s.steps.length, 'step')}).`);
          return hit.id;
        });
        setRunSteps(s.id, r.id, ids, a.done !== false);
        const after = bizOf(spaceOf('business')).sops.find((x) => x.id === s.id)!;
        const out = runOut(after, r.id);
        return { data: out, summary: `${a.done === false ? 'Unticked' : 'Ticked'} ${plural(ids.length, 'step')} of “${s.title}”${r.label ? ` (${r.label})` : ''}` };
      }
      // finish
      finishRun(s.id, r.id, !a.reopen, normDate(a.date, 'date') ?? today());
      const after = bizOf(spaceOf('business')).sops.find((x) => x.id === s.id)!;
      const out = runOut(after, r.id);
      return { data: out, summary: a.reopen ? `Reopened “${s.title}”${r.label ? ` (${r.label})` : ''}` : `Finished “${s.title}”${r.label ? ` (${r.label})` : ''} — ${out.done}/${out.total} steps done` };
    },
  }),
];
