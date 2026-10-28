/* People & Brands → Accounts & outreach: target account lists, the leads at each
   account and the team's outreach touches, worked towards a goal such as an
   event's RSVP list. Pure helpers shared by the screens, the agent tool and print.
   Data lives in space.outreach (types in ./types). */
import type { ID } from '@/types';
import { uid } from '@/lib/id';
import { addDays, diffDays, todayISO } from '@/lib/dates';
import type { AccountList, Lead, LeadStage, Outreach, OutreachMember, OutreachTouch, TargetAccount, TouchChannel } from './types';

/* ---------------------------------------------------------------- constants */

export const LEAD_STAGES: { value: LeadStage; label: string; color: string; hint: string }[] = [
  { value: 'not_contacted', label: 'Not contacted', color: '#8a8f98', hint: 'On the list, nobody has reached out yet' },
  { value: 'contacted', label: 'Contacted', color: '#4c6ef5', hint: 'Reached out at least once, no answer yet' },
  { value: 'engaged', label: 'Engaged', color: '#15aabf', hint: 'Replied, talking, interested' },
  { value: 'invited', label: 'Invited', color: '#7950f2', hint: 'Has the invitation, has not answered it' },
  { value: 'rsvp_yes', label: 'RSVP yes', color: '#2f9e44', hint: 'Said yes: on the RSVP list' },
  { value: 'attended', label: 'Attended', color: '#087f5b', hint: 'Came to the event' },
  { value: 'declined', label: 'Declined', color: '#e03131', hint: 'Said no, or asked us to stop' },
];
export const STAGE_ORDER = LEAD_STAGES.map((s) => s.value);
export const stageInfo = (v: LeadStage | undefined) => LEAD_STAGES.find((s) => s.value === v) ?? LEAD_STAGES[0];
/** RSVP list: said yes (or came). */
export const isRsvp = (l: Pick<Lead, 'stage'>) => l.stage === 'rsvp_yes' || l.stage === 'attended';
/** Still being worked: not yet a yes or a no. */
export const isOpenLead = (l: Pick<Lead, 'stage'>) => !isRsvp(l) && l.stage !== 'declined';

export const TOUCH_CHANNELS: { value: TouchChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];
export const channelLabel = (v: TouchChannel | undefined) => TOUCH_CHANNELS.find((c) => c.value === v)?.label ?? 'Other';

export const SEGMENTS = ['Bank', 'Asset manager', 'Insurer', 'Capital markets', 'Fintech', 'Wealth management', 'Payments', 'Other'];
export const TIERS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Tier 1' },
  { value: 2, label: 'Tier 2' },
  { value: 3, label: 'Tier 3' },
];
export const MEMBER_COLORS = ['#5b45e0', '#e8590c', '#0ca678', '#d6336c', '#1c7ed6', '#f59f00', '#7048e8', '#2b8a3e'];
export const LIST_COLORS = ['#5b45e0', '#0ca678', '#e8590c', '#1c7ed6', '#d6336c', '#f59f00'];

/* ---------------------------------------------------------------- makers */

export const emptyOutreach = (): Outreach => ({ lists: [], accounts: [], team: [] });

export function makeList(patch: Partial<AccountList> = {}): AccountList {
  return { id: uid('alist'), name: 'Target accounts', color: LIST_COLORS[0], ...patch };
}
export function makeAccount(patch: Partial<TargetAccount> = {}): TargetAccount {
  return { id: uid('acct'), name: '', listIds: [], leads: [], createdAt: new Date().toISOString(), ...patch };
}
export function makeLead(patch: Partial<Lead> = {}): Lead {
  return { id: uid('lead'), name: '', stage: 'not_contacted', touches: [], updatedAt: new Date().toISOString(), ...patch };
}
export function makeTouch(patch: Partial<OutreachTouch> = {}): OutreachTouch {
  return { id: uid('touch'), date: todayISO(), channel: 'email', ...patch };
}
export function makeMember(name: string, existing: OutreachMember[]): OutreachMember {
  return { id: uid('mem'), name: name.trim(), color: MEMBER_COLORS[existing.length % MEMBER_COLORS.length] };
}

/** Make loaded data safe to render (missing arrays, unknown stages). */
export function normalizeOutreach(o: Outreach) {
  o.lists = Array.isArray(o.lists) ? o.lists : [];
  o.team = Array.isArray(o.team) ? o.team : [];
  o.accounts = Array.isArray(o.accounts) ? o.accounts : [];
  for (const a of o.accounts) {
    a.listIds = Array.isArray(a.listIds) ? a.listIds : [];
    a.leads = Array.isArray(a.leads) ? a.leads : [];
    for (const l of a.leads) {
      l.touches = Array.isArray(l.touches) ? l.touches : [];
      if (!STAGE_ORDER.includes(l.stage)) l.stage = 'not_contacted';
    }
  }
}

/* ---------------------------------------------------------------- reading */

export const leadOwner = (a: TargetAccount, l: Lead) => l.ownerId || a.ownerId;
export const memberName = (team: OutreachMember[], id: ID | undefined) => team.find((m) => m.id === id)?.name ?? '';
export const lastTouch = (l: Lead): OutreachTouch | undefined => l.touches.reduce<OutreachTouch | undefined>((best, t) => (!best || t.date > best.date ? t : best), undefined);
export const accountLastTouch = (a: TargetAccount): string | undefined => a.leads.map((l) => lastTouch(l)?.date).filter(Boolean).sort().pop();
/** The furthest a lead at the account has got (declined counts last). */
export function accountStage(a: TargetAccount): LeadStage | undefined {
  if (!a.leads.length) return undefined;
  const rank = (s: LeadStage) => (s === 'declined' ? -1 : STAGE_ORDER.indexOf(s));
  return a.leads.reduce((best, l) => (rank(l.stage) > rank(best) ? l.stage : best), a.leads[0].stage);
}

/** Lead activity filters; "no_leads" is about the account. */
export type ActivityFilter = 'due' | 'stale' | 'untouched' | 'open' | 'no_leads';
export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string; hint: string }[] = [
  { value: 'due', label: 'Follow-up due', hint: 'Next step date today or earlier' },
  { value: 'stale', label: 'Gone quiet (14+ days)', hint: 'Still open, last touch more than 14 days ago' },
  { value: 'untouched', label: 'Never contacted', hint: 'No outreach logged yet' },
  { value: 'open', label: 'Still open', hint: 'Not yet a yes or a no' },
  { value: 'no_leads', label: 'Accounts with no leads', hint: 'Nobody added at the account yet' },
];
export const STALE_DAYS = 14;
/** "" stands for accounts without an industry; tier 0 for no tier. */
export const NO_SEGMENT = '';

export type AccountSort = 'default' | 'name' | 'tier' | 'stage' | 'rsvps' | 'leads' | 'last_touch' | 'next_date';
export const ACCOUNT_SORTS: { value: AccountSort; label: string }[] = [
  { value: 'default', label: 'Newest first' },
  { value: 'name', label: 'Name' },
  { value: 'tier', label: 'Tier' },
  { value: 'stage', label: 'Furthest stage' },
  { value: 'rsvps', label: 'Most RSVPs' },
  { value: 'leads', label: 'Most leads' },
  { value: 'last_touch', label: 'Last touch (oldest first)' },
  { value: 'next_date', label: 'Next step date' },
];

export interface OutreachFilter {
  listId?: ID;
  ownerId?: ID;
  q?: string;
  /** industries (account segment); NO_SEGMENT = none set */
  segments?: string[];
  /** 0 = no tier */
  tiers?: number[];
  stages?: LeadStage[];
  activity?: ActivityFilter[];
  sort?: AccountSort;
}

export const filterCount = (f: OutreachFilter) => (f.segments?.length ? 1 : 0) + (f.tiers?.length ? 1 : 0) + (f.stages?.length ? 1 : 0) + (f.activity?.length ? 1 : 0) + (f.ownerId ? 1 : 0);

const LEAD_ACTIVITY: ActivityFilter[] = ['due', 'stale', 'untouched', 'open'];
function leadActivity(l: Lead, a: ActivityFilter, today: string): boolean {
  if (a === 'due') return !!l.nextDate && l.nextDate <= today && isOpenLead(l);
  if (a === 'untouched') return !l.touches.length;
  if (a === 'open') return isOpenLead(l);
  if (a === 'stale') {
    const lt = lastTouch(l);
    return isOpenLead(l) && !!lt && diffDays(lt.date, today) > STALE_DAYS;
  }
  return false;
}

const accountText = (a: TargetAccount) => [a.name, a.segment, a.website, a.notes].join(' ').toLowerCase();
const leadText = (l: Lead) => [l.name, l.title, l.email, l.notes].join(' ').toLowerCase();

/** The leads of an account that pass the lead filters (owner, stage, activity, search). */
export function filterLeads(a: TargetAccount, f: OutreachFilter, today = todayISO()): Lead[] {
  const q = f.q?.trim().toLowerCase();
  const acts = (f.activity ?? []).filter((x) => LEAD_ACTIVITY.includes(x));
  const accountHit = !!q && accountText(a).includes(q);
  return a.leads.filter((l) => {
    if (f.ownerId && leadOwner(a, l) !== f.ownerId) return false;
    if (f.stages?.length && !f.stages.includes(l.stage)) return false;
    if (acts.length && !acts.some((x) => leadActivity(l, x, today))) return false;
    if (q && !accountHit && !leadText(l).includes(q)) return false;
    return true;
  });
}

/** Accounts on a list (all when none) that pass the filters. With lead filters on, an account needs a matching lead. */
export function filterAccounts(o: Outreach, f: OutreachFilter, today = todayISO()): TargetAccount[] {
  const q = f.q?.trim().toLowerCase();
  const leadFilters = !!(f.stages?.length || f.activity?.some((x) => LEAD_ACTIVITY.includes(x)));
  const noLeads = !!f.activity?.includes('no_leads');
  const out = o.accounts.filter((a) => {
    if (f.listId && !a.listIds.includes(f.listId)) return false;
    if (f.segments?.length && !f.segments.includes(a.segment?.trim() || NO_SEGMENT)) return false;
    if (f.tiers?.length && !f.tiers.includes(a.tier ?? 0)) return false;
    if (f.ownerId && a.ownerId !== f.ownerId && !a.leads.some((l) => leadOwner(a, l) === f.ownerId)) return false;
    const leads = filterLeads(a, f, today);
    if (noLeads || leadFilters) {
      const ok = (noLeads && !a.leads.length) || (leadFilters && leads.length > 0);
      if (!ok) return false;
    }
    if (q && !accountText(a).includes(q) && !leads.length) return false;
    return true;
  });
  return sortAccounts(out, f.sort ?? 'default', today);
}

export function sortAccounts(list: TargetAccount[], sort: AccountSort, today = todayISO()): TargetAccount[] {
  if (sort === 'default') return list;
  const rank = (a: TargetAccount) => {
    const st = accountStage(a);
    return st ? (st === 'declined' ? -1 : STAGE_ORDER.indexOf(st)) : -2;
  };
  const next = (a: TargetAccount) => a.leads.map((l) => (isOpenLead(l) ? l.nextDate : undefined)).filter(Boolean).sort()[0] ?? '9999';
  const by: Record<Exclude<AccountSort, 'default'>, (a: TargetAccount, b: TargetAccount) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    tier: (a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name),
    stage: (a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name),
    rsvps: (a, b) => b.leads.filter(isRsvp).length - a.leads.filter(isRsvp).length || b.leads.length - a.leads.length,
    leads: (a, b) => b.leads.length - a.leads.length || a.name.localeCompare(b.name),
    last_touch: (a, b) => (accountLastTouch(a) ?? '0000').localeCompare(accountLastTouch(b) ?? '0000'),
    next_date: (a, b) => next(a).localeCompare(next(b)),
  };
  void today;
  return [...list].sort(by[sort]);
}

/** What the screens show: the filtered accounts, each with only its matching leads, and how many leads the filters hide. */
export function outreachView(o: Outreach, f: OutreachFilter, today = todayISO()): { accounts: TargetAccount[]; hidden: Record<ID, number> } {
  const hidden: Record<ID, number> = {};
  const accounts = filterAccounts(o, f, today).map((a) => {
    const leads = filterLeads(a, f, today);
    if (leads.length === a.leads.length) return a;
    hidden[a.id] = a.leads.length - leads.length;
    return { ...a, leads };
  });
  return { accounts, hidden };
}

/** Industries in use, most accounts first ("" = none set). */
export function segmentsInUse(o: Outreach): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of o.accounts) {
    const k = a.segment?.trim() || NO_SEGMENT;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Rough seniority from a job title, for the audience breakdown. */
export const SENIORITY = ['C-level', 'SVP / VP', 'Director / Head', 'Manager', 'Other', 'No title'] as const;
export type Seniority = (typeof SENIORITY)[number];
export function seniorityOf(title: string | undefined): Seniority {
  const t = (title ?? '').toLowerCase();
  if (!t.trim()) return 'No title';
  if (/\bchief\b|\bc[a-z]o\b|\bclo\b|\bcpo\b|\bchro\b|\bpresident\b|\bfounder\b/.test(t)) return 'C-level';
  if (/\b(s?evp|svp|vp|vice president)\b/.test(t)) return 'SVP / VP';
  if (/\bdirector\b|\bhead\b|\blead\b/.test(t)) return 'Director / Head';
  if (/\bmanager\b|\bpartner\b|\bspecialist\b/.test(t)) return 'Manager';
  return 'Other';
}

export interface LeadRef {
  account: TargetAccount;
  lead: Lead;
}
export function leadsOf(accounts: TargetAccount[], ownerId?: ID): LeadRef[] {
  const out: LeadRef[] = [];
  for (const account of accounts) for (const lead of account.leads) if (!ownerId || leadOwner(account, lead) === ownerId) out.push({ account, lead });
  return out;
}

/** Goal of a list, or the sum of all lists' goals. */
export function goalOf(o: Outreach, listId?: ID): { goal: number; eventDate?: string; name: string } {
  if (listId) {
    const l = o.lists.find((x) => x.id === listId);
    return { goal: l?.goal ?? 0, eventDate: l?.eventDate, name: l?.name ?? '' };
  }
  const dates = o.lists.map((l) => l.eventDate).filter(Boolean).sort() as string[];
  return { goal: o.lists.reduce((n, l) => n + (l.goal ?? 0), 0), eventDate: dates[0], name: 'All lists' };
}

/** Week start (Monday) of a date. */
function weekOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const back = (d.getDay() + 6) % 7;
  return addDays(iso, -back);
}

export interface OutreachStats {
  accounts: number;
  leads: number;
  byStage: Record<LeadStage, number>;
  rsvps: number;
  /** accounts with at least one lead reached */
  reached: number;
  /** accounts with no leads yet */
  noLeads: number;
  touches: { total: number; last7: number; last30: number };
  /** touches per week, oldest first (Monday dates) */
  weekly: { week: string; count: number }[];
  /** per team member (plus "unassigned" under id "") */
  team: { id: ID; name: string; color?: string; accounts: number; leads: number; open: number; rsvps: number; touches7: number; touches30: number }[];
  /** follow-ups due today or earlier, soonest first */
  due: (LeadRef & { date: string })[];
  /** latest touches, newest first */
  recent: (LeadRef & { touch: OutreachTouch })[];
  /** accounts by industry ("" = none set), most accounts first, with each one's leads by stage */
  bySegment: { segment: string; accounts: number; leads: number; reached: number; rsvps: number; stages: Record<LeadStage, number> }[];
  /** accounts by tier (0 = no tier) */
  byTier: { tier: number; accounts: number; leads: number; reached: number; rsvps: number }[];
  /** where each account is: no leads, leads but nobody reached, reached, has an RSVP */
  coverage: { noLeads: number; notReached: number; reached: number; rsvp: number };
  /** leads by seniority (from their titles) and stage */
  bySeniority: { level: Seniority; leads: number; rsvps: number }[];
  /** accounts with the most RSVPs, then the most leads */
  topAccounts: { account: TargetAccount; leads: number; rsvps: number; stages: Record<LeadStage, number> }[];
}

export function outreachStats(o: Outreach, accounts: TargetAccount[], today = todayISO(), weeks = 10): OutreachStats {
  const refs = leadsOf(accounts);
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<LeadStage, number>;
  for (const { lead } of refs) byStage[lead.stage]++;
  const touches = refs.flatMap((r) => r.lead.touches.map((touch) => ({ ...r, touch })));
  const since = (days: number) => touches.filter((t) => diffDays(t.touch.date, today) < days && t.touch.date <= today);
  const firstWeek = weekOf(addDays(today, -7 * (weeks - 1)));
  const weekly = Array.from({ length: weeks }, (_, i) => ({ week: addDays(firstWeek, i * 7), count: 0 }));
  for (const t of touches) {
    const w = weekly.find((x) => x.week === weekOf(t.touch.date));
    if (w) w.count++;
  }
  const members = [...o.team.map((m) => ({ id: m.id, name: m.name, color: m.color })), { id: '', name: 'Unassigned', color: undefined }];
  const team = members
    .map((m) => {
      const mine = refs.filter((r) => (leadOwner(r.account, r.lead) ?? '') === m.id);
      const by = touches.filter((t) => (t.touch.byId ?? '') === m.id);
      return {
        ...m,
        accounts: accounts.filter((a) => (a.ownerId ?? '') === m.id).length,
        leads: mine.length,
        open: mine.filter((r) => isOpenLead(r.lead)).length,
        rsvps: mine.filter((r) => isRsvp(r.lead)).length,
        touches7: by.filter((t) => diffDays(t.touch.date, today) < 7 && t.touch.date <= today).length,
        touches30: by.filter((t) => diffDays(t.touch.date, today) < 30 && t.touch.date <= today).length,
      };
    })
    .filter((m) => m.id || m.accounts || m.leads || m.touches30);
  return {
    accounts: accounts.length,
    leads: refs.length,
    byStage,
    rsvps: byStage.rsvp_yes + byStage.attended,
    reached: accounts.filter((a) => a.leads.some((l) => l.stage !== 'not_contacted')).length,
    noLeads: accounts.filter((a) => !a.leads.length).length,
    touches: { total: touches.length, last7: since(7).length, last30: since(30).length },
    weekly,
    team,
    due: refs
      .filter((r) => r.lead.nextDate && r.lead.nextDate <= today && isOpenLead(r.lead))
      .map((r) => ({ ...r, date: r.lead.nextDate! }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recent: [...touches].sort((a, b) => b.touch.date.localeCompare(a.touch.date)).slice(0, 15),
    ...accountBreakdowns(accounts),
  };
}

const zeroStages = () => Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<LeadStage, number>;
const reachedAcc = (a: TargetAccount) => a.leads.some((l) => l.stage !== 'not_contacted');

function accountBreakdowns(accounts: TargetAccount[]) {
  const seg = new Map<string, OutreachStats['bySegment'][number]>();
  const tier = new Map<number, OutreachStats['byTier'][number]>();
  const coverage = { noLeads: 0, notReached: 0, reached: 0, rsvp: 0 };
  const sen = new Map<Seniority, { level: Seniority; leads: number; rsvps: number }>(SENIORITY.map((level) => [level, { level, leads: 0, rsvps: 0 }]));
  for (const a of accounts) {
    const k = a.segment?.trim() || NO_SEGMENT;
    const sg = seg.get(k) ?? { segment: k, accounts: 0, leads: 0, reached: 0, rsvps: 0, stages: zeroStages() };
    const t = tier.get(a.tier ?? 0) ?? { tier: a.tier ?? 0, accounts: 0, leads: 0, reached: 0, rsvps: 0 };
    const rsvps = a.leads.filter(isRsvp).length;
    sg.accounts++;
    t.accounts++;
    sg.leads += a.leads.length;
    t.leads += a.leads.length;
    sg.rsvps += rsvps;
    t.rsvps += rsvps;
    if (reachedAcc(a)) {
      sg.reached++;
      t.reached++;
    }
    for (const l of a.leads) {
      sg.stages[l.stage]++;
      const s = sen.get(seniorityOf(l.title))!;
      s.leads++;
      if (isRsvp(l)) s.rsvps++;
    }
    seg.set(k, sg);
    tier.set(a.tier ?? 0, t);
    if (!a.leads.length) coverage.noLeads++;
    else if (rsvps) coverage.rsvp++;
    else if (reachedAcc(a)) coverage.reached++;
    else coverage.notReached++;
  }
  const topAccounts = accounts
    .filter((a) => a.leads.length)
    .map((account) => {
      const stages = zeroStages();
      for (const l of account.leads) stages[l.stage]++;
      return { account, leads: account.leads.length, rsvps: account.leads.filter(isRsvp).length, stages };
    })
    .sort((a, b) => b.rsvps - a.rsvps || b.leads - a.leads || a.account.name.localeCompare(b.account.name))
    .slice(0, 8);
  return {
    bySegment: [...seg.values()].sort((a, b) => b.accounts - a.accounts || a.segment.localeCompare(b.segment)),
    byTier: [...tier.values()].sort((a, b) => (a.tier || 9) - (b.tier || 9)),
    coverage,
    bySeniority: [...sen.values()].filter((x) => x.leads),
    topAccounts,
  };
}

/* ---------------------------------------------------------------- CSV */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const HEADERS: Record<string, string[]> = {
  account: ['account', 'company', 'organization', 'organisation', 'firm', 'institution', 'accountname', 'companyname'],
  name: ['name', 'lead', 'contact', 'fullname', 'contactname', 'person', 'leadname'],
  first: ['firstname', 'first', 'givenname'],
  last: ['lastname', 'last', 'surname', 'familyname'],
  title: ['title', 'jobtitle', 'role', 'position'],
  email: ['email', 'emailaddress', 'workemail'],
  linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'profileurl'],
  phone: ['phone', 'phonenumber', 'mobile', 'tel'],
  owner: ['owner', 'accountowner', 'rep', 'assignedto', 'leadowner'],
  tier: ['tier', 'priority'],
  segment: ['segment', 'industry', 'type', 'sector'],
  stage: ['stage', 'status', 'rsvp'],
  website: ['website', 'domain', 'url', 'site'],
  notes: ['notes', 'note', 'comments'],
};

export interface CsvImport {
  accounts: number;
  newAccounts: number;
  leads: number;
  members: string[];
}

/** Rows of a CSV (first row = headers) → accounts and leads on a list. One row per lead; rows of the same account merge. */
export function importOutreachCsv(o: Outreach, table: string[][], listId: ID | undefined): CsvImport {
  const [head, ...rows] = table;
  const idx: Record<string, number> = {};
  head.forEach((h, i) => {
    const n = norm(h);
    for (const [k, names] of Object.entries(HEADERS)) if (idx[k] == null && names.includes(n)) idx[k] = i;
  });
  if (idx.account == null) throw new Error('No account column: name one column Account or Company.');
  const get = (r: string[], k: string) => (idx[k] != null ? (r[idx[k]] ?? '').trim() : '');
  const out: CsvImport = { accounts: 0, newAccounts: 0, leads: 0, members: [] };
  const touched = new Set<ID>();
  const member = (name: string): ID | undefined => {
    if (!name) return;
    let m = o.team.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!m) {
      m = makeMember(name, o.team);
      o.team.push(m);
      out.members.push(m.name);
    }
    return m.id;
  };
  for (const r of rows) {
    const accName = get(r, 'account');
    if (!accName) continue;
    let a = o.accounts.find((x) => x.name.toLowerCase() === accName.toLowerCase());
    if (!a) {
      a = makeAccount({ name: accName });
      o.accounts.push(a);
      out.newAccounts++;
    }
    if (listId && !a.listIds.includes(listId)) a.listIds.push(listId);
    const tier = Number(get(r, 'tier').replace(/\D/g, ''));
    if (tier >= 1 && tier <= 3 && !a.tier) a.tier = tier as 1 | 2 | 3;
    if (!a.segment && get(r, 'segment')) a.segment = get(r, 'segment');
    if (!a.website && get(r, 'website')) a.website = get(r, 'website');
    touched.add(a.id);
    const name = get(r, 'name') || [get(r, 'first'), get(r, 'last')].filter(Boolean).join(' ');
    const owner = member(get(r, 'owner'));
    if (!name) {
      if (owner && !a.ownerId) a.ownerId = owner;
      continue;
    }
    const email = get(r, 'email');
    if (a.leads.some((l) => (email && l.email?.toLowerCase() === email.toLowerCase()) || l.name.toLowerCase() === name.toLowerCase())) continue;
    const stageRaw = norm(get(r, 'stage'));
    const stage = LEAD_STAGES.find((s) => norm(s.label) === stageRaw || norm(s.value) === stageRaw)?.value ?? (/yes|accepted|registered/.test(stageRaw) ? 'rsvp_yes' : 'not_contacted');
    a.leads.push(makeLead({ name, title: get(r, 'title') || undefined, email: email || undefined, linkedin: get(r, 'linkedin') || undefined, phone: get(r, 'phone') || undefined, ownerId: owner, stage, notes: get(r, 'notes') || undefined }));
    out.leads++;
  }
  out.accounts = touched.size;
  return out;
}

/** One row per lead (accounts without leads get one row too). */
export function outreachCsvRows(o: Outreach, accounts: TargetAccount[]) {
  const listNames = (a: TargetAccount) => a.listIds.map((id) => o.lists.find((l) => l.id === id)?.name).filter(Boolean).join('; ');
  const rows: { a: TargetAccount; l?: Lead }[] = accounts.flatMap((a) => (a.leads.length ? a.leads.map((l) => ({ a, l })) : [{ a }]));
  const columns = [
    { header: 'Account', value: (r: { a: TargetAccount; l?: Lead }) => r.a.name },
    { header: 'Segment', value: (r: { a: TargetAccount }) => r.a.segment },
    { header: 'Tier', value: (r: { a: TargetAccount }) => (r.a.tier ? String(r.a.tier) : '') },
    { header: 'Lists', value: (r: { a: TargetAccount }) => listNames(r.a) },
    { header: 'Account owner', value: (r: { a: TargetAccount }) => memberName(o.team, r.a.ownerId) },
    { header: 'Lead', value: (r: { l?: Lead }) => r.l?.name },
    { header: 'Title', value: (r: { l?: Lead }) => r.l?.title },
    { header: 'Email', value: (r: { l?: Lead }) => r.l?.email },
    { header: 'LinkedIn', value: (r: { l?: Lead }) => r.l?.linkedin },
    { header: 'Lead owner', value: (r: { a: TargetAccount; l?: Lead }) => (r.l ? memberName(o.team, leadOwner(r.a, r.l)) : '') },
    { header: 'Stage', value: (r: { l?: Lead }) => (r.l ? stageInfo(r.l.stage).label : '') },
    { header: 'Touches', value: (r: { l?: Lead }) => (r.l ? String(r.l.touches.length) : '') },
    { header: 'Last touch', value: (r: { l?: Lead }) => (r.l ? lastTouch(r.l)?.date : '') },
    { header: 'Next step', value: (r: { l?: Lead }) => r.l?.nextStep },
    { header: 'Next date', value: (r: { l?: Lead }) => r.l?.nextDate },
  ];
  return { rows, columns };
}
