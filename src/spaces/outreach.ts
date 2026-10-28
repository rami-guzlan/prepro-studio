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

export interface OutreachFilter {
  listId?: ID;
  ownerId?: ID;
  q?: string;
}

/** Accounts on a list (all when none), owned by someone (account or any of its leads), matching a search. */
export function filterAccounts(o: Outreach, f: OutreachFilter): TargetAccount[] {
  const q = f.q?.trim().toLowerCase();
  return o.accounts.filter((a) => {
    if (f.listId && !a.listIds.includes(f.listId)) return false;
    if (f.ownerId && a.ownerId !== f.ownerId && !a.leads.some((l) => leadOwner(a, l) === f.ownerId)) return false;
    if (!q) return true;
    return [a.name, a.segment, a.website, a.notes, ...a.leads.flatMap((l) => [l.name, l.title, l.email])].join(' ').toLowerCase().includes(q);
  });
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
    recent: touches.sort((a, b) => b.touch.date.localeCompare(a.touch.date)).slice(0, 15),
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
