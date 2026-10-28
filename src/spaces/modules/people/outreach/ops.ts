/* Accounts & outreach: store operations on space.outreach (each one undo step;
   typing in a field coalesces into one). */
import type { Draft } from 'immer';
import type { ID } from '@/types';
import type { AccountList, Lead, LeadStage, Outreach, OutreachMember, OutreachTouch, SpaceData, TargetAccount } from '@/spaces/types';
import { emptyOutreach, makeAccount, makeLead, makeList, makeMember, makeTouch } from '@/spaces/outreach';
import { getSpace, updateSpace } from '@/store/space';

function out(d: Draft<SpaceData>): Draft<Outreach> {
  if (!d.outreach) d.outreach = emptyOutreach() as Draft<Outreach>;
  return d.outreach;
}
const accountOf = (d: Draft<SpaceData>, id: ID) => out(d).accounts.find((a) => a.id === id);
const leadOf = (d: Draft<SpaceData>, accountId: ID, leadId: ID) => accountOf(d, accountId)?.leads.find((l) => l.id === leadId);
const now = () => new Date().toISOString();
const co = (key: string, coalesce?: boolean) => (coalesce ? { coalesce: key } : undefined);

export const getOutreach = (): Outreach => getSpace().outreach ?? emptyOutreach();

/* ---------------------------------------------------------------- lists */

export function addList(patch: Partial<AccountList> = {}): ID {
  const l = makeList(patch);
  updateSpace((d) => void out(d).lists.push(l as Draft<AccountList>));
  return l.id;
}
export function updateList(id: ID, patch: Partial<AccountList>, coalesce = false) {
  updateSpace((d) => {
    const l = out(d).lists.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  }, co(`olist:${id}:${Object.keys(patch).join(',')}`, coalesce));
}
/** Removes the list; its accounts stay (only off this list). */
export function deleteList(id: ID) {
  updateSpace((d) => {
    const o = out(d);
    o.lists = o.lists.filter((l) => l.id !== id);
    for (const a of o.accounts) a.listIds = a.listIds.filter((x) => x !== id);
  });
}

/* ---------------------------------------------------------------- team */

export function addMember(name: string): ID | undefined {
  const n = name.trim();
  if (!n) return;
  const existing = getOutreach().team.find((m) => m.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing.id;
  const m = makeMember(n, getOutreach().team);
  updateSpace((d) => void out(d).team.push(m as Draft<OutreachMember>));
  return m.id;
}
export function updateMember(id: ID, patch: Partial<OutreachMember>, coalesce = false) {
  updateSpace((d) => {
    const m = out(d).team.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  }, co(`omem:${id}`, coalesce));
}
/** Removes a member; what they owned becomes unassigned (touches keep no name). */
export function removeMember(id: ID) {
  updateSpace((d) => {
    const o = out(d);
    o.team = o.team.filter((m) => m.id !== id);
    for (const a of o.accounts) {
      if (a.ownerId === id) a.ownerId = undefined;
      for (const l of a.leads) {
        if (l.ownerId === id) l.ownerId = undefined;
        for (const t of l.touches) if (t.byId === id) t.byId = undefined;
      }
    }
  });
}

/* ---------------------------------------------------------------- accounts */

export function addAccount(patch: Partial<TargetAccount> = {}): ID {
  const a = makeAccount(patch);
  updateSpace((d) => void out(d).accounts.unshift(a as Draft<TargetAccount>));
  return a.id;
}
export function updateAccount(id: ID, patch: Partial<TargetAccount>, coalesce = false) {
  updateSpace((d) => {
    const a = accountOf(d, id);
    if (a) Object.assign(a, patch);
  }, co(`oacct:${id}:${Object.keys(patch).join(',')}`, coalesce));
}
export function toggleAccountList(id: ID, listId: ID, on: boolean) {
  updateSpace((d) => {
    const a = accountOf(d, id);
    if (!a) return;
    a.listIds = on ? [...new Set([...a.listIds, listId])] : a.listIds.filter((x) => x !== listId);
  });
}
export function deleteAccounts(ids: ID[]) {
  updateSpace((d) => {
    const o = out(d);
    o.accounts = o.accounts.filter((a) => !ids.includes(a.id));
  });
}

/* ---------------------------------------------------------------- leads */

export function addLead(accountId: ID, patch: Partial<Lead> = {}): ID {
  const l = makeLead(patch);
  updateSpace((d) => void accountOf(d, accountId)?.leads.push(l as Draft<Lead>));
  return l.id;
}
export function updateLead(accountId: ID, leadId: ID, patch: Partial<Lead>, coalesce = false) {
  updateSpace((d) => {
    const l = leadOf(d, accountId, leadId);
    if (!l) return;
    Object.assign(l, patch);
    l.updatedAt = now();
  }, co(`olead:${leadId}:${Object.keys(patch).join(',')}`, coalesce));
}
export const setStage = (accountId: ID, leadId: ID, stage: LeadStage) => updateLead(accountId, leadId, { stage });
/** Move a lead to another account. */
export function moveLead(fromId: ID, leadId: ID, toId: ID) {
  if (fromId === toId) return;
  updateSpace((d) => {
    const from = accountOf(d, fromId);
    const to = accountOf(d, toId);
    const i = from?.leads.findIndex((l) => l.id === leadId) ?? -1;
    if (!from || !to || i < 0) return;
    to.leads.push(from.leads.splice(i, 1)[0]);
  });
}
export function deleteLead(accountId: ID, leadId: ID) {
  updateSpace((d) => {
    const a = accountOf(d, accountId);
    if (a) a.leads = a.leads.filter((l) => l.id !== leadId);
  });
}

/* ---------------------------------------------------------------- touches */

/** Log an outreach step. A lead nobody had contacted becomes Contacted. */
export function logTouch(accountId: ID, leadId: ID, patch: Partial<OutreachTouch>, opts: { stage?: LeadStage; nextStep?: string; nextDate?: string } = {}): ID {
  const t = makeTouch(patch);
  updateSpace((d) => {
    const l = leadOf(d, accountId, leadId);
    if (!l) return;
    l.touches.push(t as Draft<OutreachTouch>);
    if (opts.stage) l.stage = opts.stage;
    else if (l.stage === 'not_contacted') l.stage = 'contacted';
    if (opts.nextStep !== undefined) l.nextStep = opts.nextStep || undefined;
    if (opts.nextDate !== undefined) l.nextDate = opts.nextDate || undefined;
    l.updatedAt = now();
  });
  return t.id;
}
export function deleteTouch(accountId: ID, leadId: ID, touchId: ID) {
  updateSpace((d) => {
    const l = leadOf(d, accountId, leadId);
    if (l) l.touches = l.touches.filter((t) => t.id !== touchId);
  });
}

/** Run a change on the whole outreach object in one undo step (imports). */
export function editOutreach(fn: (o: Outreach) => void) {
  updateSpace((d) => fn(out(d) as Outreach));
}
