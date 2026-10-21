/* Agent (MCP) collections, single fields and tools of the business sales sections:
   deals (Sales Pipeline) with their activity log, testimonials and portfolio.
   Sales enablement resources live in the shared 'resources' collection (section
   'enablement'), defined with the library. biz_pipeline covers the flows with side
   effects (win → planning project, lose with reason) and the forecast summary. */
import type { Draft } from 'immer';
import type { BusinessData, Deal, DealActivity, DealActivityKind, DealStage } from '@/spaces/business/types';
import { DEAL_ACTIVITY_KINDS, DEAL_SOURCES, DEAL_STAGES, PERIODS, PORTFOLIO_KINDS, TESTIMONIAL_PERMISSIONS, type PeriodId } from '@/spaces/business/constants';
import { bizOf, clientLabel, periodRange } from '@/spaces/business/derive';
import { dealContact, dealProbability, isOpenDeal, pipelineSummary, stageInfo, weightedValue } from '@/spaces/business/derive-work';
import { bizUpdate, winDeal } from '@/spaces/business/ops';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import type { SpaceData } from '@/spaces/types';
import type { CollectionDef, FieldSpec } from '../collections';
import type { SingletonDef } from '../singletons';
import type { ToolDef } from '../tool';
import { defineTool } from '../tool';
import { bool, enm, obj, opt, str } from '../schema';
import { clean, fail, normDate, spaceOf } from '../ctx';

const v = (opts: readonly { value: string }[]) => opts.map((o) => o.value);
const F = (name: string, type: FieldSpec['type'], o: Omit<FieldSpec, 'name' | 'type'> = {}): FieldSpec => ({ name, type, ...o });
const req = { required: true };

/** Typed loosely: the getters receive a SpaceData. */
type S = any;
const B = (s: S) => s.business as BusinessData | undefined;

const STAGES = v(DEAL_STAGES) as DealStage[];
const KINDS = v(DEAL_ACTIVITY_KINDS) as DealActivityKind[];

/* ================================================================ collections */

export const BUSINESS_SALES_COLLECTIONS: CollectionDef[] = [
  {
    name: 'deals',
    label: 'Deals (Sales Pipeline)',
    module: 'pipeline' as any,
    navParam: 'dealId',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      const today = todayISO();
      return items.map((d: Deal) => ({
        ...d,
        _contact: dealContact(b, d) || undefined,
        _probability: dealProbability(d),
        _weighted: d.value != null ? weightedValue(d) : undefined,
        _followUpDue: isOpenDeal(d) && !!d.nextStepDate && d.nextStepDate <= today ? true : undefined,
      }));
    },
    description:
      `Sales opportunities moving ${DEAL_STAGES.map((s) => `${s.value} (${s.probability}%)`).join(' → ')}. Link an existing client with clientId, or fill contactName / company / email / phone for a new prospect. probability empty = the stage default (numbers above). nextStep + nextStepDate drive "follow-ups due". To WIN or LOSE a deal use biz_pipeline {action:"move"} (won creates a planning project and a client from the contact fields; lost records the reason) — do not set stage won / lost with update_items. Log calls / emails / meetings with biz_pipeline {action:"log_activity"} or the deal_activities collection. Forecast and win rate: biz_pipeline {action:"summary"}.`,
    kind: 'array',
    get: (s: S) => B(s)?.deals,
    draft: (d: S) => d.business?.deals,
    idPrefix: 'deal',
    nameField: 'title',
    hideInList: ['activities'],
    fields: [
      F('title', 'string', { ...req, desc: 'e.g. "Brightline — spring launch film"' }),
      F('stage', 'enum', { values: STAGES, desc: 'open stages lead | qualified | proposal | negotiation; use biz_pipeline move for won / lost' }),
      F('clientId', 'ref', { ref: 'clients', desc: 'existing client (id or name)' }),
      F('contactName', 'string', { desc: 'prospect contact when not a client yet' }),
      F('company', 'string'),
      F('email', 'string'),
      F('phone', 'string'),
      F('source', 'string', { suggest: DEAL_SOURCES, desc: 'where the lead came from' }),
      F('value', 'number', { desc: 'expected deal value (space currency)' }),
      F('probability', 'integer', { desc: 'win chance 0–100 (empty = stage default)' }),
      F('createdAt', 'date'),
      F('expectedClose', 'date'),
      F('nextStep', 'string', { desc: 'e.g. "Send proposal"' }),
      F('nextStepDate', 'date', { desc: 'follow-up date (due when today or earlier)' }),
      F('closedDate', 'date', { readOnly: true, desc: 'set when won / lost' }),
      F('lostReason', 'string'),
      F('offerId', 'string', { desc: 'strategy offer id (business.strategy offers) sold in this deal' }),
      F('bizProjectId', 'string', { readOnly: true, desc: 'business project created when the deal was won' }),
      F('spaceId', 'string', { desc: 'linked Marketing Space id (list_spaces), e.g. the campaign that brought the lead' }),
      F('projectId', 'string', { desc: 'linked production project id (list_projects)' }),
      F('notes', 'text'),
    ],
    defaults: () => ({ stage: 'lead', createdAt: todayISO(), activities: [] }),
  },
  {
    name: 'deal_activities',
    label: 'Deal activity log',
    module: 'pipeline' as any,
    navParam: 'dealId',
    description: 'Nested in deals: pass parentId = deal id or title. Calls, emails, meetings, proposals, follow-ups and notes with their date.',
    kind: 'array',
    parent: 'deals',
    get: (s: S, pid?: string) => B(s)?.deals.find((d) => d.id === pid)?.activities,
    draft: (d: S, pid?: string) => d.business?.deals.find((x: Deal) => x.id === pid)?.activities,
    idPrefix: 'act',
    nameField: 'text',
    fields: [F('date', 'date', req), F('kind', 'enum', { ...req, values: KINDS }), F('text', 'text', { ...req, desc: 'what happened / was agreed' })],
    defaults: () => ({ date: todayISO(), kind: 'note' }),
  },
  {
    name: 'testimonials',
    label: 'Testimonials',
    module: 'testimonials' as any,
    navParam: 'testimonialId',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      return items.map((t) => ({ ...t, _client: t.clientId ? clientLabel(b, t.clientId) : undefined }));
    },
    description:
      'What clients said, word for word, with author, role, company, rating 1–5, source and permission to use it publicly (not_asked | requested | granted | declined — only use "granted" ones publicly). featured = shown as proof in Sales Enablement and the sales kit.',
    kind: 'array',
    get: (s: S) => B(s)?.testimonials,
    draft: (d: S) => d.business?.testimonials,
    idPrefix: 'tst',
    nameField: 'author',
    fields: [
      F('quote', 'text', req),
      F('author', 'string', req),
      F('role', 'string'),
      F('company', 'string'),
      F('clientId', 'ref', { ref: 'clients' }),
      F('bizProjectId', 'string', { desc: 'business project id' }),
      F('date', 'date'),
      F('rating', 'integer', { desc: '1–5' }),
      F('source', 'string', { suggest: ['Email', 'LinkedIn', 'Google review', 'Instagram', 'Video', 'Text message', 'Survey'] }),
      F('url', 'string', { desc: 'link to the original' }),
      F('photo', 'image', { desc: 'headshot / logo (asset name from import_image)' }),
      F('permission', 'enum', { values: v(TESTIMONIAL_PERMISSIONS) }),
      F('featured', 'boolean'),
      F('tags', 'string[]'),
    ],
    defaults: () => ({ permission: 'not_asked', date: todayISO() }),
  },
  {
    name: 'portfolio',
    label: 'Portfolio & reels',
    module: 'portfolio' as any,
    navParam: 'itemId',
    enrich: (items, doc) => {
      const b = bizOf(doc);
      return items.map((x) => ({ ...x, _client: x.clientId ? clientLabel(b, x.clientId) : undefined, _files: x.files?.length || undefined }));
    },
    description:
      'Showreels, videos, stills, case studies, links and decks that show the work: url (YouTube / Vimeo / website — YouTube thumbnails are derived automatically), image (still), client, date, the user’s role, description and results (case studies). featured = proof to send.',
    kind: 'array',
    get: (s: S) => B(s)?.portfolio,
    draft: (d: S) => d.business?.portfolio,
    idPrefix: 'pf',
    nameField: 'title',
    hideInList: ['files'],
    fields: [
      F('title', 'string', req),
      F('kind', 'enum', { ...req, values: v(PORTFOLIO_KINDS) }),
      F('url', 'string'),
      F('image', 'image', { desc: 'thumbnail / still (asset name from import_image)' }),
      F('clientId', 'ref', { ref: 'clients' }),
      F('bizProjectId', 'string', { desc: 'business project id' }),
      F('projectId', 'string', { desc: 'linked production project id (list_projects)' }),
      F('date', 'date'),
      F('role', 'string', { desc: 'e.g. "Director & editor"' }),
      F('description', 'text'),
      F('results', 'text', { desc: 'outcomes: views, sales lift, awards …' }),
      F('tags', 'string[]'),
      F('featured', 'boolean'),
    ],
    defaults: () => ({ kind: 'video' }),
  },
];

export const BUSINESS_SALES_SINGLETONS: SingletonDef[] = [];

/* ================================================================ helpers */

function biz(): { s: SpaceData; b: BusinessData } {
  const s = spaceOf('business');
  return { s, b: bizOf(s) };
}

const norm = (x: unknown) => String(x ?? '').trim().toLowerCase();

function requireDeal(b: BusinessData, ref: string | undefined): Deal {
  if (!ref?.trim()) fail('Pass deal (id or title).');
  const r = norm(ref);
  const exact = b.deals.filter((d) => d.id === ref || norm(d.title) === r);
  if (exact.length > 1) fail(`"${ref}" matches ${exact.length} deals; pass the id (${exact.map((d) => d.id).join(', ')}).`);
  const hit = exact[0] ?? b.deals.find((d) => norm(d.title).includes(r));
  if (!hit) fail(`No deal "${ref}". Deals: ${b.deals.map((d) => `${d.title} (${d.id})`).join(', ') || 'none yet — add one with add_items {collection:"deals"}'}.`);
  return hit;
}

function dealOut(b: BusinessData, d: Deal, today: string) {
  return clean({
    id: d.id,
    title: d.title,
    stage: d.stage,
    contact: dealContact(b, d) || undefined,
    clientId: d.clientId,
    value: d.value,
    probability: dealProbability(d),
    weighted: d.value != null ? weightedValue(d) : undefined,
    nextStep: d.nextStep,
    nextStepDate: d.nextStepDate,
    followUpDue: isOpenDeal(d) && !!d.nextStepDate && d.nextStepDate <= today ? true : undefined,
    expectedClose: d.expectedClose,
    closedDate: d.closedDate,
    lostReason: d.lostReason,
    bizProjectId: d.bizProjectId,
    activities: d.activities.length || undefined,
  });
}

/* ================================================================ tools */

export const businessSalesTools: ToolDef[] = [
  defineTool({
    name: 'biz_pipeline',
    title: 'Sales pipeline: forecast, move deals, log activity',
    description:
      'Sales pipeline of the open business. "summary": open pipeline value, probability-weighted forecast, deals and value per stage, won / lost / win rate / average deal size in a period (default year to date), follow-ups due (next step date today or earlier) and deals closing within 30 days. "move": move a deal to a stage — won marks it closed today at 100% and (unless createProject:false or it already has one) creates a planning project in Projects with the deal value as fee, turning the contact fields into a client; lost records lostReason; moving back to an open stage reopens it. "log_activity": add a call / email / meeting / proposal / follow_up / note to a deal (optionally set the next step and its date). Add or edit deals themselves with add_items / update_items {collection:"deals"}.',
    global: true,
    input: obj({
      action: enm(['summary', 'move', 'log_activity'] as const),
      period: opt(enm(v(PERIODS) as PeriodId[], 'summary: period for won / lost / win rate (default ytd)')),
      deal: opt(str('move / log_activity: deal id or title')),
      stage: opt(enm(STAGES, 'move: target stage')),
      lostReason: opt(str('move to lost: why')),
      createProject: opt(bool('move to won: create the planning project (default true)')),
      kind: opt(enm(KINDS, 'log_activity: default note')),
      text: opt(str('log_activity: what happened')),
      date: opt(str('log_activity: YYYY-MM-DD (default today)')),
      nextStep: opt(str('log_activity: new next step')),
      nextStepDate: opt(str('log_activity: YYYY-MM-DD of the next step')),
    }),
    run(a: Record<string, any>) {
      const { s, b } = biz();
      const today = todayISO();
      if (a.action === 'summary') {
        const r = periodRange((a.period as PeriodId) ?? 'ytd', today);
        const sum = pipelineSummary(b, today, r);
        return {
          data: {
            currency: s.settings.currency,
            period: r.label,
            openCount: sum.openCount,
            openValue: sum.openValue,
            weightedForecast: sum.weighted,
            byStage: sum.byStage.map((x) => ({ stage: x.stage, label: x.label, count: x.count, value: x.value, defaultProbability: stageInfo(x.stage).probability })),
            won: { count: sum.wonCount, value: sum.wonValue, avgDealSize: sum.avgDealSize ?? undefined },
            lost: sum.lostCount,
            winRate: sum.winRate == null ? null : Math.round(sum.winRate * 1000) / 10,
            followUpsDue: sum.followUpsDue.map((d) => dealOut(b, d, today)),
            closingSoon: sum.closingSoon.map((d) => dealOut(b, d, today)),
          },
        };
      }

      const deal = requireDeal(b, a.deal);

      if (a.action === 'move') {
        const stage = a.stage as DealStage | undefined;
        if (!stage) fail(`Pass stage: ${STAGES.join(' | ')}.`);
        if (stage === 'won') {
          const projectId = winDeal(deal.id, { createProject: a.createProject !== false });
          const after = bizOf(spaceOf('business'));
          const d = after.deals.find((x) => x.id === deal.id)!;
          const p = projectId ? after.projects.find((x) => x.id === projectId) : undefined;
          return {
            data: { deal: dealOut(after, d, today), project: p ? clean({ id: p.id, name: p.name, status: p.status, fee: p.fee, clientId: p.clientId }) : undefined, next: p ? 'Plan the project (tasks, due date, contractors) with the projects tools, then draft the agreement and invoice.' : undefined },
            summary: `Won “${deal.title}”${p && !deal.bizProjectId ? ' — project created' : ''}`,
          };
        }
        bizUpdate((d) => {
          const x = d.deals.find((y) => y.id === deal.id)!;
          if (stage === 'lost') {
            x.stage = 'lost';
            x.closedDate = deal.stage === 'lost' && x.closedDate ? x.closedDate : today;
            x.probability = 0;
            if (a.lostReason !== undefined) {
              if (a.lostReason) x.lostReason = a.lostReason;
              else delete x.lostReason;
            }
            return;
          }
          const wasClosed = !stageInfo(x.stage).open;
          x.stage = stage;
          if (wasClosed) {
            delete x.closedDate;
            delete x.probability;
            delete x.lostReason;
          }
        });
        const after = bizOf(spaceOf('business'));
        return { data: dealOut(after, after.deals.find((x) => x.id === deal.id)!, today), summary: `Moved “${deal.title}” to ${stageInfo(stage).label}` };
      }

      // log_activity
      const text = String(a.text ?? '').trim();
      if (!text) fail('Pass text (what happened).');
      const act: DealActivity = { id: uid('act'), date: normDate(a.date, 'date') ?? today, kind: (a.kind as DealActivityKind) ?? 'note', text };
      const nextDate = normDate(a.nextStepDate, 'nextStepDate');
      bizUpdate((d) => {
        const x = d.deals.find((y) => y.id === deal.id)!;
        x.activities.push(act as Draft<DealActivity>);
        if (a.nextStep !== undefined) {
          if (a.nextStep) x.nextStep = a.nextStep;
          else delete x.nextStep;
        }
        if (nextDate) x.nextStepDate = nextDate;
      });
      const after = bizOf(spaceOf('business'));
      return { data: { activity: act, deal: dealOut(after, after.deals.find((x) => x.id === deal.id)!, today) }, summary: `Logged a ${DEAL_ACTIVITY_KINDS.find((k) => k.value === act.kind)?.label.toLowerCase() ?? 'note'} on “${deal.title}”` };
    },
  }),
];
