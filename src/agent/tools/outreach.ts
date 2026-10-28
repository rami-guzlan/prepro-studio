/* Marketing Space → People & Brands → Accounts & outreach for agents: target
   account lists, the leads at each account, the team, and logged outreach. */
import type { AccountList, Lead, LeadStage, Outreach, OutreachMember, TargetAccount, TouchChannel } from '@/spaces/types';
import { LEAD_STAGES, STAGE_ORDER, TOUCH_CHANNELS, emptyOutreach, filterAccounts, goalOf, lastTouch, leadOwner, makeAccount, makeLead, makeList, makeMember, makeTouch, memberName, outreachStats, stageInfo } from '@/spaces/outreach';
import { todayISO } from '@/lib/dates';
import { updateSpace } from '@/store/space';
import { clean, fail, plural, space } from '../ctx';
import { defineTool } from '../tool';
import { arr, enm, int, num, obj, opt, str } from '../schema';

const STAGES = STAGE_ORDER as LeadStage[];
const CHANNELS = TOUCH_CHANNELS.map((c) => c.value) as TouchChannel[];
const outreachOf = (): Outreach => space().outreach ?? emptyOutreach();

function findBy<T extends { id: string; name: string }>(items: T[], ref: string | undefined, what: string): T {
  const r = (ref ?? '').trim().toLowerCase();
  const hit = items.find((x) => x.id === ref) ?? items.find((x) => x.name.toLowerCase() === r) ?? (r ? items.find((x) => x.name.toLowerCase().includes(r)) : undefined);
  if (!hit) fail(`No ${what} "${ref}". ${what[0].toUpperCase() + what.slice(1)}s: ${items.slice(0, 30).map((x) => `"${x.name}"`).join(', ') || 'none yet'}.`);
  return hit;
}

/** Team member by name or id; unknown names are added to the team. */
function memberRef(o: Outreach, ref: string | undefined): string | undefined {
  if (!ref?.trim()) return undefined;
  const r = ref.trim().toLowerCase();
  let m = o.team.find((x) => x.id === ref) ?? o.team.find((x) => x.name.toLowerCase() === r);
  if (!m) {
    m = makeMember(ref, o.team);
    o.team.push(m);
  }
  return m.id;
}

function leadOut(o: Outreach, a: TargetAccount, l: Lead, touches = false) {
  const lt = lastTouch(l);
  return clean({
    id: l.id,
    name: l.name,
    title: l.title,
    email: l.email,
    linkedin: l.linkedin,
    owner: memberName(o.team, leadOwner(a, l)) || undefined,
    stage: l.stage,
    nextStep: l.nextStep,
    nextDate: l.nextDate,
    touches: touches ? [...l.touches].sort((x, y) => y.date.localeCompare(x.date)).map((t) => clean({ date: t.date, channel: t.channel, by: memberName(o.team, t.byId) || undefined, note: t.note })) : l.touches.length || undefined,
    lastTouch: touches ? undefined : lt?.date,
    notes: l.notes,
  });
}

function accountOut(o: Outreach, a: TargetAccount, touches = false) {
  return clean({
    id: a.id,
    name: a.name,
    segment: a.segment,
    tier: a.tier,
    owner: memberName(o.team, a.ownerId) || undefined,
    lists: a.listIds.map((id) => o.lists.find((l) => l.id === id)?.name).filter(Boolean),
    website: a.website,
    notes: a.notes,
    leads: a.leads.map((l) => leadOut(o, a, l, touches)),
  });
}

const leadIn = obj({
  name: str(),
  title: opt(str()),
  email: opt(str()),
  linkedin: opt(str()),
  phone: opt(str()),
  owner: opt(str('team member name (added to the team when new); empty = the account owner')),
  stage: opt(enm(STAGES)),
  nextStep: opt(str()),
  nextDate: opt(str('YYYY-MM-DD')),
  notes: opt(str()),
});
interface LeadIn {
  name: string;
  title?: string;
  email?: string;
  linkedin?: string;
  phone?: string;
  owner?: string;
  stage?: LeadStage;
  nextStep?: string;
  nextDate?: string;
  notes?: string;
}

function applyLead(o: Outreach, l: Lead, x: Partial<LeadIn>) {
  if (x.name != null) l.name = x.name.trim();
  for (const k of ['title', 'email', 'linkedin', 'phone', 'nextStep', 'nextDate', 'notes'] as const) if (x[k] != null) l[k] = x[k]!.trim() || undefined;
  if (x.stage) l.stage = x.stage;
  if (x.owner != null) l.ownerId = memberRef(o, x.owner);
  l.updatedAt = new Date().toISOString();
}

export const outreachTools = [
  defineTool({
    name: 'outreach_read',
    title: 'Read target accounts, leads and outreach',
    description:
      'People & Brands → Accounts & outreach (Marketing Spaces): lists of target accounts (each list can have an RSVP goal and an event date), the leads at each account (stage: ' +
      LEAD_STAGES.map((s) => `${s.value} = ${s.label}`).join(', ') +
      '), the outreach team and every logged touch. Without arguments: lists, team and progress (RSVPs against the goal, funnel, touches per person, follow-ups due). With "list", "owner", "stage" or "search": the matching accounts with their leads. With "account": that account with every touch.',
    readOnly: true,
    global: true,
    input: obj({
      list: opt(str('list name or id')),
      owner: opt(str('team member name: their accounts and leads')),
      stage: opt(enm(STAGES, 'only leads at this stage')),
      search: opt(str('text in account or lead names, titles, emails')),
      account: opt(str('one account (name or id), with all touches')),
      limit: opt(int('max accounts (default 100)', 1)),
    }),
    run(a: { list?: string; owner?: string; stage?: LeadStage; search?: string; account?: string; limit?: number }) {
      const o = outreachOf();
      if (a.account) return { data: accountOut(o, findBy(o.accounts, a.account, 'account'), true) };
      const listId = a.list ? findBy(o.lists, a.list, 'list').id : undefined;
      const ownerId = a.owner ? findBy(o.team, a.owner, 'team member').id : undefined;
      let accounts = filterAccounts(o, { listId, ownerId, q: a.search });
      const stats = outreachStats(o, accounts);
      const goal = goalOf(o, listId);
      const summary = clean({
        goal: goal.goal || undefined,
        eventDate: goal.eventDate,
        rsvps: stats.rsvps,
        accounts: stats.accounts,
        leads: stats.leads,
        reached: stats.reached,
        byStage: stats.byStage,
        touchesLast7: stats.touches.last7,
        touchesLast30: stats.touches.last30,
        team: stats.team.map((m) => clean({ name: m.name, accounts: m.accounts, leads: m.leads, open: m.open, rsvps: m.rsvps, touches7: m.touches7, touches30: m.touches30 })),
        followUpsDue: stats.due.slice(0, 20).map((d) => ({ lead: d.lead.name, account: d.account.name, date: d.date, nextStep: d.lead.nextStep })),
      });
      if (!a.list && !a.owner && !a.stage && !a.search) {
        return {
          data: {
            lists: o.lists.map((l) => clean({ id: l.id, name: l.name, goal: l.goal, eventDate: l.eventDate, description: l.description, accounts: o.accounts.filter((x) => x.listIds.includes(l.id)).length })),
            team: o.team.map((m) => m.name),
            progress: summary,
            stages: LEAD_STAGES.map((s) => `${s.value}: ${s.hint}`),
            channels: CHANNELS,
          },
        };
      }
      if (a.stage) accounts = accounts.filter((x) => x.leads.some((l) => l.stage === a.stage));
      const page = accounts.slice(0, a.limit ?? 100);
      return {
        data: {
          progress: summary,
          total: accounts.length,
          accounts: page.map((x) => {
            const out = accountOut(o, x);
            if (a.stage) (out as { leads: unknown[] }).leads = x.leads.filter((l) => l.stage === a.stage).map((l) => leadOut(o, x, l));
            return out;
          }),
        },
      };
    },
  }),

  defineTool({
    name: 'outreach_write',
    title: 'Add or change target accounts, leads, lists and the team',
    description:
      'Builds Accounts & outreach. "lists": create or update lists by name ({name, goal (RSVPs), eventDate, description}). "team": names to add. "accounts": create or update accounts by name (matched case-insensitively) with {segment, tier 1-3, owner, website, notes, lists:[list names, created when new], leads:[{name, title, email, linkedin, owner, stage, nextStep, nextDate, notes}]}; leads are matched by email or name within the account and updated, new ones added. "removeAccounts" / "removeLeads" ({account, lead}) delete. One undo step.',
    destructive: true,
    global: true,
    input: obj({
      lists: opt(arr(obj({ name: str(), goal: opt(num('RSVP goal')), eventDate: opt(str('YYYY-MM-DD')), description: opt(str()), rename: opt(str('new name')) }))),
      team: opt(arr(str('team member name'))),
      accounts: opt(
        arr(
          obj({
            name: str(),
            rename: opt(str('new name')),
            segment: opt(str('Bank, Asset manager, Insurer, Capital markets, Fintech …')),
            tier: opt(int('1 (top) to 3', 1)),
            owner: opt(str('team member name')),
            website: opt(str()),
            notes: opt(str()),
            lists: opt(arr(str('list name'))),
            leads: opt(arr(leadIn)),
          }),
        ),
      ),
      removeAccounts: opt(arr(str('account name or id'))),
      removeLeads: opt(arr(obj({ account: str(), lead: str('name, email or id') }))),
    }),
    run(a: {
      lists?: { name: string; goal?: number; eventDate?: string; description?: string; rename?: string }[];
      team?: string[];
      accounts?: { name: string; rename?: string; segment?: string; tier?: number; owner?: string; website?: string; notes?: string; lists?: string[]; leads?: LeadIn[] }[];
      removeAccounts?: string[];
      removeLeads?: { account: string; lead: string }[];
    }) {
      space();
      const counts = { lists: 0, accounts: 0, newAccounts: 0, leads: 0, newLeads: 0, removed: 0 };
      let err = '';
      updateSpace((d) => {
        if (!d.outreach) d.outreach = emptyOutreach();
        const o = d.outreach as Outreach;
        const listByName = (name: string): AccountList => {
          let l = o.lists.find((x) => x.id === name || x.name.toLowerCase() === name.trim().toLowerCase());
          if (!l) {
            l = makeList({ name: name.trim() });
            o.lists.push(l);
          }
          return l;
        };
        for (const x of a.lists ?? []) {
          const l = listByName(x.name);
          if (x.rename?.trim()) l.name = x.rename.trim();
          if (x.goal != null) l.goal = x.goal;
          if (x.eventDate) l.eventDate = x.eventDate;
          if (x.description != null) l.description = x.description || undefined;
          counts.lists++;
        }
        for (const n of a.team ?? []) memberRef(o, n);
        for (const x of a.accounts ?? []) {
          if (!x.name?.trim()) continue;
          let acc = o.accounts.find((y) => y.id === x.name || y.name.toLowerCase() === x.name.trim().toLowerCase());
          if (!acc) {
            acc = makeAccount({ name: x.name.trim() });
            o.accounts.push(acc);
            counts.newAccounts++;
          }
          counts.accounts++;
          if (x.rename?.trim()) acc.name = x.rename.trim();
          if (x.segment != null) acc.segment = x.segment || undefined;
          if (x.tier != null) acc.tier = Math.min(3, Math.max(1, Math.round(x.tier))) as 1 | 2 | 3;
          if (x.owner != null) acc.ownerId = memberRef(o, x.owner);
          if (x.website != null) acc.website = x.website || undefined;
          if (x.notes != null) acc.notes = x.notes || undefined;
          for (const ln of x.lists ?? []) {
            const l = listByName(ln);
            if (!acc.listIds.includes(l.id)) acc.listIds.push(l.id);
          }
          for (const li of x.leads ?? []) {
            if (!li.name?.trim()) continue;
            const email = li.email?.trim().toLowerCase();
            let lead = acc.leads.find((l) => (email && l.email?.toLowerCase() === email) || l.name.toLowerCase() === li.name.trim().toLowerCase());
            if (!lead) {
              lead = makeLead();
              acc.leads.push(lead);
              counts.newLeads++;
            }
            applyLead(o, lead, li);
            counts.leads++;
          }
        }
        for (const ref of a.removeAccounts ?? []) {
          const r = ref.trim().toLowerCase();
          const before = o.accounts.length;
          o.accounts = o.accounts.filter((x) => x.id !== ref && x.name.toLowerCase() !== r);
          counts.removed += before - o.accounts.length;
        }
        for (const x of a.removeLeads ?? []) {
          const acc = o.accounts.find((y) => y.id === x.account || y.name.toLowerCase() === x.account.trim().toLowerCase());
          if (!acc) {
            err = `No account "${x.account}".`;
            continue;
          }
          const r = x.lead.trim().toLowerCase();
          const before = acc.leads.length;
          acc.leads = acc.leads.filter((l) => l.id !== x.lead && l.name.toLowerCase() !== r && l.email?.toLowerCase() !== r);
          counts.removed += before - acc.leads.length;
        }
      });
      const parts = [
        counts.lists && plural(counts.lists, 'list'),
        counts.accounts && `${plural(counts.accounts, 'account')} (${counts.newAccounts} new)`,
        counts.leads && `${plural(counts.leads, 'lead')} (${counts.newLeads} new)`,
        counts.removed && `${counts.removed} removed`,
      ].filter(Boolean);
      return { data: clean({ ...counts, warning: err || undefined }), summary: `Accounts & outreach: ${parts.join(', ') || 'no changes'}` };
    },
  }),

  defineTool({
    name: 'outreach_log',
    title: 'Log outreach on a lead',
    description:
      'Records an outreach touch (email, linkedin, call, meeting, event, other) on a lead at an account, by a team member (added when new), optionally moving the lead to a new stage and setting the next step. A lead nobody had contacted becomes "contacted". Use stage "rsvp_yes" when they accept the invitation.',
    global: true,
    input: obj({
      account: str('account name or id'),
      lead: str('lead name, email or id'),
      channel: opt(enm(CHANNELS)),
      date: opt(str('YYYY-MM-DD (default today)')),
      by: opt(str('team member name')),
      note: opt(str()),
      stage: opt(enm(STAGES)),
      nextStep: opt(str()),
      nextDate: opt(str('YYYY-MM-DD')),
    }),
    run(a: { account: string; lead: string; channel?: TouchChannel; date?: string; by?: string; note?: string; stage?: LeadStage; nextStep?: string; nextDate?: string }) {
      const o0 = outreachOf();
      const acc = findBy(o0.accounts, a.account, 'account');
      const r = a.lead.trim().toLowerCase();
      const lead = acc.leads.find((l) => l.id === a.lead || l.name.toLowerCase() === r || l.email?.toLowerCase() === r) ?? acc.leads.find((l) => l.name.toLowerCase().includes(r));
      if (!lead) fail(`${acc.name} has no lead "${a.lead}". Leads: ${acc.leads.map((l) => l.name).join(', ') || 'none yet'}.`);
      updateSpace((d) => {
        const o = d.outreach as Outreach;
        const l = o.accounts.find((x) => x.id === acc.id)!.leads.find((x) => x.id === lead.id)!;
        const byId = memberRef(o, a.by) as OutreachMember['id'] | undefined;
        l.touches.push(makeTouch({ channel: a.channel ?? 'email', date: a.date || todayISO(), byId, note: a.note?.trim() || undefined }));
        if (a.stage) l.stage = a.stage;
        else if (l.stage === 'not_contacted') l.stage = 'contacted';
        if (a.nextStep != null) l.nextStep = a.nextStep || undefined;
        if (a.nextDate != null) l.nextDate = a.nextDate || undefined;
        l.updatedAt = new Date().toISOString();
      });
      const now = outreachOf().accounts.find((x) => x.id === acc.id)!.leads.find((x) => x.id === lead.id)!;
      return { data: leadOut(outreachOf(), acc, now, true), summary: `Logged ${a.channel ?? 'email'} with ${lead.name} (${acc.name}), now ${stageInfo(now.stage).label}` };
    },
  }),
];
