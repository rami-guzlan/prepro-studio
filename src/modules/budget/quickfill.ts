/* Quick-fill helpers: add cast & crew from People, and a gear rentals line from the Gear list.
   All functions mutate a draft (call inside update()). */
import type { Draft } from 'immer';
import type { BudgetCategory, BudgetLine, CastMember, CrewMember, ProjectData, RateUnit } from '@/types';
import { uid } from '@/lib/id';
import { charactersForCast } from '@/derived/project';
import { insertIndex, nextCode, type SectionId } from './calc';
import { gearTotal, shootDayCount, sortByCategory, categoryOrder } from '@/modules/gear/logic';

type D = Draft<ProjectData>;

interface Target {
  /** matches an existing category name (searched within `section`) */
  match: RegExp;
  name: string;
  section: SectionId;
  code?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ALIASES: Record<string, string> = {
  '1st assistant director': '1st ad',
  'first assistant director': '1st ad',
  'production assistant': 'production assistants',
  'key makeup artist': 'hmu artist',
  'makeup artist': 'hmu artist',
  'key hair stylist': 'hmu artist',
  'costume designer': 'wardrobe stylist',
  'wardrobe supervisor': 'wardrobe stylist',
  'production sound mixer': 'sound mixer',
  '1st ac focus puller': '1st ac',
};

function crewTarget(c: CrewMember): Target | null {
  const pos = c.position || '';
  const dept = c.department || '';
  if (/^\s*director\s*$/i.test(pos)) return { match: /^director|direction/i, name: 'Director', section: 'atl', code: '1200' };
  if (/producer/i.test(pos) && !/line producer|assistant|coordinator/i.test(pos)) return { match: /producer/i, name: 'Producers', section: 'atl', code: '1100' };
  if (dept === 'Writing' || /writer/i.test(pos)) return { match: /story|writ|rights/i, name: 'Story & Rights', section: 'atl', code: '1000' };
  switch (dept) {
    case 'Production':
    case 'Direction':
      return { match: /production staff|^production$|production crew|production team/i, name: 'Production Staff', section: 'btl', code: '2000' };
    case 'Camera':
      return { match: /camera/i, name: 'Camera', section: 'btl', code: '2100' };
    case 'Grip':
    case 'Electric':
      return { match: /grip|electric|g\s*&\s*e|lighting/i, name: 'Grip & Electric', section: 'btl', code: '2200' };
    case 'Sound':
      return { match: /sound/i, name: 'Sound', section: 'btl', code: '2300' };
    case 'Art':
    case 'Props':
      return { match: /\bart\b|props|production design/i, name: 'Art Department', section: 'btl', code: '2400' };
    case 'Wardrobe':
      return { match: /wardrobe|costume/i, name: 'Wardrobe', section: 'btl', code: '2500' };
    case 'Hair & Makeup':
      return { match: /hair|make-?up|hmu/i, name: 'Hair & Makeup', section: 'btl', code: '2600' };
    case 'Locations':
      return { match: /location/i, name: 'Locations', section: 'btl', code: '2700' };
    case 'Transportation':
      return { match: /transport/i, name: 'Transportation', section: 'btl', code: '2800' };
    case 'Catering / Craft':
      return { match: /cater|craft/i, name: 'Catering & Craft', section: 'btl', code: '2900' };
    case 'Stunts':
      return { match: /stunt/i, name: 'Stunts', section: 'btl' };
    case 'VFX':
      return { match: /vfx|visual effects|graphics/i, name: 'Graphics & VFX', section: 'post', code: '4400' };
    case 'Post-production':
      if (/colou?rist/i.test(pos)) return { match: /colou?r/i, name: 'Color', section: 'post', code: '4100' };
      if (/sound|mixer|re-?recording/i.test(pos)) return { match: /sound/i, name: 'Sound Post', section: 'post', code: '4200' };
      if (/graphic|motion|vfx/i.test(pos)) return { match: /graphics|vfx/i, name: 'Graphics & VFX', section: 'post', code: '4400' };
      return { match: /editorial|edit|post/i, name: 'Editorial', section: 'post', code: '4000' };
    case 'Music':
      return { match: /music/i, name: 'Music', section: 'post', code: '4300' };
    case 'Marketing / BTS':
      return { match: /marketing|publicity|bts|behind/i, name: 'Marketing & BTS', section: 'other' };
    case 'Client / Agency':
      return null;
    default:
      return { match: /misc/i, name: 'Miscellaneous', section: 'other' };
  }
}

function findOrCreate(d: D, t: Target, created: string[]): Draft<BudgetCategory> {
  const cats = d.budget.categories;
  const found = (t.code ? cats.find((c) => c.code === t.code && c.section === t.section && t.match.test(c.name)) : undefined) ?? cats.find((c) => c.section === t.section && t.match.test(c.name));
  if (found) return found;
  const code = t.code && !cats.some((c) => c.code === t.code) ? t.code : nextCode(d.budget, t.section);
  const cat: BudgetCategory = { id: uid('bc'), code, name: t.name, section: t.section, lines: [] };
  cats.splice(insertIndex(d.budget, t.section), 0, cat as Draft<BudgetCategory>);
  created.push(t.name);
  return cats.find((c) => c.id === cat.id)!;
}

function qtyFor(unit: RateUnit | undefined, days: number): { qty: number; unit: string; note?: string } {
  switch (unit) {
    case 'hour':
      return { qty: days * 10, unit: 'hour', note: `${days} × 10-hr days` };
    case 'week':
      return { qty: Math.max(1, Math.ceil(days / 5)), unit: 'week' };
    case 'flat':
      return { qty: 1, unit: 'flat' };
    default:
      return { qty: days, unit: 'day' };
  }
}

export interface PeopleFillResult {
  added: number;
  filled: number;
  skipped: number;
  noRate: number;
  created: string[];
}

/** For every cast member / crew member with a rate, add (or fill a matching empty template line). */
export function addPeopleDraft(d: D): PeopleFillResult {
  const days = Math.max(1, shootDayCount(d as ProjectData));
  const res: PeopleFillResult = { added: 0, filled: 0, skipped: 0, noRate: 0, created: [] };
  const existing = new Set<string>();
  for (const c of d.budget.categories) for (const l of c.lines) existing.add(l.description.trim().toLowerCase());

  const place = (target: Target, description: string, rate: number, unit: RateUnit | undefined, position?: string) => {
    if (existing.has(description.toLowerCase())) {
      res.skipped++;
      return;
    }
    const cat = findOrCreate(d, target, res.created);
    const q = qtyFor(unit, days);
    if (target.section === 'post' && q.unit === 'day') q.note = 'Qty = shoot days — adjust to the post schedule';
    // fill an empty template line with the same role ("Gaffer", "1st AC" …) instead of adding a new one
    if (position) {
      const p = ALIASES[norm(position)] ?? norm(position);
      const tpl = cat.lines.find((l) => {
        if ((l.qty || 0) * (l.rate || 0) !== 0) return false;
        const n = ALIASES[norm(l.description)] ?? norm(l.description);
        return n.length >= 3 && p.length >= 3 && (n === p || n.includes(p) || p.includes(n));
      });
      if (tpl) {
        Object.assign(tpl, { description, qty: q.qty, unit: q.unit, rate, x: tpl.x || 1 });
        if (q.note) tpl.notes = tpl.notes ? `${tpl.notes} · ${q.note}` : q.note;
        existing.add(description.toLowerCase());
        res.filled++;
        return;
      }
    }
    const line: BudgetLine = { id: uid('bl'), description, qty: q.qty, unit: q.unit, rate, x: 1, notes: q.note };
    cat.lines.push(line as Draft<BudgetLine>);
    existing.add(description.toLowerCase());
    res.added++;
  };

  for (const m of d.cast as CastMember[]) {
    if (m.status === 'declined') continue;
    if (!m.rate) {
      res.noRate++;
      continue;
    }
    const roles = charactersForCast(d as ProjectData, m.id).map((c) => c.name);
    const description = roles.length ? `${m.name} — ${roles.join(' / ')}` : m.name;
    place({ match: /\bcast\b|talent|actors/i, name: 'Cast', section: 'atl', code: '1300' }, description, m.rate, m.rateUnit);
  }
  for (const c of d.crew as CrewMember[]) {
    if (c.status === 'declined') continue;
    const target = crewTarget(c);
    if (!target) continue;
    if (!c.rate) {
      res.noRate++;
      continue;
    }
    const description = c.position ? `${c.position} — ${c.name}` : c.name;
    place(target, description, c.rate, c.rateUnit, c.position);
  }
  return res;
}

export const GEAR_LINE_DESCRIPTION = 'Gear & equipment (from Gear list)';

/** Add or refresh one line with the gear list total in an Equipment category. */
export function addGearDraft(d: D, money: (n: number) => string): { result: 'added' | 'updated' | 'empty'; total: number; created: string[] } {
  const days = shootDayCount(d as ProjectData);
  const gear = d.gear as ProjectData['gear'];
  const total = Math.round(gearTotal(gear, days) * 100) / 100;
  const created: string[] = [];
  if (!total) return { result: 'empty', total: 0, created };
  const order = categoryOrder(gear);
  const parts = order
    .map((cat) => [cat, gearTotal(sortByCategory(gear).filter((g) => (g.category || 'Other') === cat), days)] as const)
    .filter(([, v]) => v > 0)
    .map(([cat, v]) => `${cat} ${money(v)}`);
  const notes = `From the Gear list: ${parts.join(' · ')}`;
  for (const c of d.budget.categories) {
    const l = c.lines.find((x) => x.description === GEAR_LINE_DESCRIPTION);
    if (l) {
      Object.assign(l, { qty: 1, unit: 'flat', rate: total, x: 1, notes });
      return { result: 'updated', total, created };
    }
  }
  const cat = findOrCreate(d, { match: /equipment|rentals/i, name: 'Equipment Rentals', section: 'btl', code: '3100' }, created);
  cat.lines.push({ id: uid('bl'), description: GEAR_LINE_DESCRIPTION, qty: 1, unit: 'flat', rate: total, x: 1, notes } as Draft<BudgetLine>);
  return { result: 'added', total, created };
}
