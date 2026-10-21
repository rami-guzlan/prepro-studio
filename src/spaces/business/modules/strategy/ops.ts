/* Write operations on the lists inside the business strategy (offers, goals,
   quarterly priorities, competitors). Each call is one undo step; typing
   coalesces per item + field. Shared by the Strategy screen and agent tools. */
import { uid } from '@/lib/id';
import { bizUpdate } from '../../ops';
import type { BizCompetitor, BizGoal, BizOffer, BizPriority, BizStrategy } from '../../types';

export type StrategyList = 'offers' | 'goals' | 'priorities' | 'competitors';
type ItemOf<K extends StrategyList> = BizStrategy[K][number];

const PFX: Record<StrategyList, string> = { offers: 'offer', goals: 'goal', priorities: 'prio', competitors: 'comp' };

export const newStrategyId = (k: StrategyList) => uid(PFX[k]);

export const makeOffer = (p: Partial<BizOffer> = {}): BizOffer => ({ id: newStrategyId('offers'), name: '', active: true, ...p });
export const makeGoal = (p: Partial<BizGoal> = {}): BizGoal => ({ id: newStrategyId('goals'), title: '', metric: 'revenue', period: 'ytd', ...p });
export const makePriority = (p: Partial<BizPriority> = {}): BizPriority => ({ id: newStrategyId('priorities'), text: '', done: false, ...p });
export const makeCompetitor = (p: Partial<BizCompetitor> = {}): BizCompetitor => ({ id: newStrategyId('competitors'), name: '', ...p });

export function addStrategyItem<K extends StrategyList>(k: K, item: ItemOf<K>, index?: number): string {
  bizUpdate((b) => {
    const list = b.strategy[k] as unknown as ItemOf<K>[];
    if (index == null || index < 0 || index > list.length) list.push(item);
    else list.splice(index, 0, item);
  });
  return item.id;
}

export function updateStrategyItem<K extends StrategyList>(k: K, id: string, patch: Partial<ItemOf<K>>, coalesce = true) {
  bizUpdate(
    (b) => {
      const it = (b.strategy[k] as unknown as ItemOf<K>[]).find((x) => x.id === id);
      if (!it) return;
      for (const [key, v] of Object.entries(patch)) {
        if (v === undefined) delete (it as any)[key];
        else (it as any)[key] = v;
      }
    },
    coalesce ? { coalesce: `biz:strategy:${k}:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function removeStrategyItem(k: StrategyList, id: string) {
  bizUpdate((b) => {
    const list = b.strategy[k] as unknown as { id: string }[];
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    if (k === 'goals') for (const x of b.initiatives) if (x.goalId === id) delete x.goalId;
    if (k === 'offers') for (const d of b.deals) if (d.offerId === id) delete d.offerId;
  });
}

export function moveStrategyItem(k: StrategyList, id: string, dir: -1 | 1) {
  bizUpdate((b) => {
    const list = b.strategy[k] as unknown as { id: string }[];
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const [it] = list.splice(i, 1);
    list.splice(j, 0, it);
  });
}

export function setSwot(patch: Partial<BizStrategy['swot']>, coalesce = true) {
  bizUpdate((b) => void Object.assign(b.strategy.swot, patch), coalesce ? { coalesce: `biz:strategy:swot:${Object.keys(patch).join(',')}` } : undefined);
}

/** Goals measured in money (formatted with the currency). */
export const goalIsMoney = (m: BizGoal['metric']) => m === 'revenue' || m === 'profit' || m === 'pipeline';

/** Value of a goal / KPI for display. */
export function goalValue(m: BizGoal['metric'], n: number | undefined, money: (n: number) => string): string {
  if (n == null) return '—';
  return goalIsMoney(m) ? money(n) : String(Math.round(n * 100) / 100);
}

/** "2026 Q4" for a date. */
export function quarterOf(iso: string): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7)) || 1;
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}

export const STRATEGY_TEXT_FIELDS: { key: keyof BizStrategy & string; label: string; hint: string }[] = [
  { key: 'mission', label: 'Mission', hint: 'Why the business exists and who it serves — one or two sentences.' },
  { key: 'vision', label: 'Vision', hint: 'Where you want it to be in 3–5 years.' },
  { key: 'positioning', label: 'Positioning statement', hint: 'For [ideal client] who [need], we are the [category] that [key benefit], unlike [alternative].' },
  { key: 'idealClient', label: 'Ideal client', hint: 'Who they are, what they struggle with, budget, where you find them.' },
  { key: 'uniqueValue', label: 'Unique value', hint: 'Why clients pick you over the alternatives.' },
  { key: 'pricingStrategy', label: 'Pricing strategy', hint: 'Packages, value-based vs hourly, minimums, retainers, when you raise rates.' },
  { key: 'marketingPlan', label: 'Marketing plan', hint: 'Channels, content, referrals, outreach — how people find you.' },
  { key: 'salesProcess', label: 'Sales process', hint: 'Inquiry → discovery call → proposal → contract → deposit.' },
];
