/* Writes to the open finance space. Every function is one undo step (one
   updateSpace call). Used by the screens and the agent tools. */
import type { Draft } from 'immer';
import { importAssetBytes } from '@/backend';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { getSpace, updateSpace } from '@/store/space';
import type { UpdateOptions } from '@/store/project';
import type { CsvMapping, FinanceData, FinCategory, FinInsight, FinRule, FinStatement, FinTarget, FinTransaction, StatementFormat } from './types';
import { normalizeFinance } from './types';
import { categorize, closingBalance, dedupeKey, ruleMatches, rowsPeriod, type ReviewRow } from './importers';
import type { ComputedInsight } from './calc';
import { assignedIn, autoAssignPlan, moveMoneyIn, setAssignedIn, type AssignChange, type AutoAssignMode } from './ynab';
import { merchantOf } from './calc';

const EMPTY = normalizeFinance({});

/** The finance data of the open space (event handlers / tools — not for render). */
export function getFinance(): FinanceData {
  return getSpace().finance ?? EMPTY;
}

/** Change the finance data (one undo step; `coalesce` merges typing). */
export function updateFinance(recipe: (f: Draft<FinanceData>) => void, opts?: UpdateOptions) {
  updateSpace((d) => {
    if (!d.finance) d.finance = normalizeFinance({}) as Draft<FinanceData>;
    recipe(d.finance as Draft<FinanceData>);
  }, opts);
}

/* ---------------------------------------------------------------- import */

export interface CommitImport {
  accountId?: string;
  rows: ReviewRow[];
  format: StatementFormat;
  /** the statement file to keep (stored in the space) */
  file?: { name: string; data: Uint8Array };
  name?: string;
  periodStart?: string;
  periodEnd?: string;
  source?: string;
  /** remember this CSV mapping for the account */
  mapping?: CsvMapping;
  /** set the account balance from the statement's closing balance */
  updateBalance?: boolean;
  closingBalance?: number;
  closingDate?: string;
  notes?: string;
  /** add the rows to this existing statement (e.g. a PDF stored earlier) instead of creating one */
  statementId?: string;
}

export interface CommitResult {
  statementId: string;
  imported: number;
  duplicates: number;
  ids: string[];
}

/** Add the included review rows as transactions and record the statement (with its file). */
export async function commitImport(c: CommitImport): Promise<CommitResult> {
  const stored = c.file ? { file: await importAssetBytes(c.file.data, (c.file.name.split('.').pop() || 'bin').toLowerCase()), fileName: c.file.name, fileSize: c.file.data.length } : null;
  const take = c.rows.filter((r) => r.include);
  const period = rowsPeriod(c.rows.length ? c.rows : take);
  const reuse = c.statementId && getFinance().statements.some((s) => s.id === c.statementId) ? c.statementId : undefined;
  const statementId = reuse ?? uid('stmt');
  const now = new Date().toISOString();
  const ids: string[] = [];
  const close = c.closingBalance != null ? { balance: c.closingBalance, date: c.closingDate ?? period.to ?? todayISO() } : closingBalance(take);
  updateFinance((f) => {
    for (const r of take) {
      const id = uid('tx');
      ids.push(id);
      const t: FinTransaction = {
        id,
        date: r.date,
        description: r.description,
        amount: r.amount,
        accountId: c.accountId,
        statementId,
        hash: r.fitid ? `fitid:${r.fitid}` : dedupeKey(c.accountId, r.date, r.amount, r.description),
        createdAt: now,
      };
      if (r.merchant) t.merchant = r.merchant;
      if (r.category) t.category = r.category;
      if (r.transfer) t.transfer = true;
      if (r.recurring) t.recurring = true;
      if (r.notes) t.notes = r.notes;
      f.transactions.push(t);
    }
    const acct = f.accounts.find((a) => a.id === c.accountId);
    const st: FinStatement = {
      id: statementId,
      accountId: c.accountId,
      name: c.name,
      periodStart: c.periodStart ?? period.from,
      periodEnd: c.periodEnd ?? period.to,
      format: c.format,
      importedCount: take.length,
      duplicateCount: c.rows.filter((r) => r.duplicate && !r.include).length,
      importedAt: now,
      source: c.source ?? 'upload',
      ...(stored ?? {}),
      ...(close ? { closingBalance: close.balance } : {}),
      ...(c.notes ? { notes: c.notes } : {}),
    };
    const prev = reuse ? f.statements.find((s) => s.id === reuse) : undefined;
    if (prev) {
      prev.accountId = prev.accountId ?? c.accountId;
      prev.importedCount += take.length;
      prev.duplicateCount = (prev.duplicateCount ?? 0) + (st.duplicateCount ?? 0);
      prev.periodStart = prev.periodStart && st.periodStart && prev.periodStart < st.periodStart ? prev.periodStart : st.periodStart;
      prev.periodEnd = prev.periodEnd && st.periodEnd && prev.periodEnd > st.periodEnd ? prev.periodEnd : st.periodEnd;
      if (c.name) prev.name = c.name;
      if (st.closingBalance != null) prev.closingBalance = st.closingBalance;
      if (c.source) prev.source = c.source;
      if (c.notes) prev.notes = c.notes;
      if (stored) Object.assign(prev, stored);
    } else f.statements.push(st);
    if (acct) {
      if (c.mapping) acct.csvMapping = c.mapping;
      if (c.updateBalance && close && (!acct.balanceDate || close.date >= acct.balanceDate)) {
        // card / loan statements print what you owe; store it as a positive "owed" balance
        acct.balance = acct.type === 'credit_card' || acct.type === 'loan' ? Math.abs(close.balance) : close.balance;
        acct.balanceDate = close.date;
      }
    }
  });
  return { statementId, imported: take.length, duplicates: c.rows.filter((r) => r.duplicate).length, ids };
}

/** Store a statement file without transactions (a PDF waiting for its rows). */
export async function addStatementFile(file: { name: string; data: Uint8Array }, accountId?: string, source = 'upload'): Promise<string> {
  const stored = await importAssetBytes(file.data, (file.name.split('.').pop() || 'bin').toLowerCase());
  const id = uid('stmt');
  updateFinance((f) => {
    f.statements.push({ id, accountId, format: 'pdf', file: stored, fileName: file.name, fileSize: file.data.length, importedCount: 0, importedAt: new Date().toISOString(), source });
  });
  return id;
}

/** Delete a statement record (optionally with its transactions). */
export function deleteStatement(id: string, withTransactions: boolean) {
  updateFinance((f) => {
    f.statements = f.statements.filter((s) => s.id !== id);
    if (withTransactions) f.transactions = f.transactions.filter((t) => t.statementId !== id);
    else for (const t of f.transactions) if (t.statementId === id) delete t.statementId;
  });
}

/* ---------------------------------------------------------------- transactions */

export function patchTransaction(id: string, patch: Partial<FinTransaction>, coalesce = true) {
  updateFinance(
    (f) => {
      const t = f.transactions.find((x) => x.id === id);
      if (!t) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)) delete (t as any)[k];
        else (t as any)[k] = v;
      }
    },
    coalesce ? { coalesce: `fin-tx:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function setCategory(ids: string[], category: string | undefined) {
  const set = new Set(ids);
  updateFinance((f) => {
    for (const t of f.transactions) {
      if (!set.has(t.id)) continue;
      if (category) t.category = category;
      else delete t.category;
      if (category === 'transfers') t.transfer = true;
      else if (t.transfer && category && f.categories.find((c) => c.id === category)?.kind !== 'transfer') delete t.transfer;
    }
  });
}

export function setFlag(ids: string[], flag: 'transfer' | 'recurring', on: boolean) {
  const set = new Set(ids);
  updateFinance((f) => {
    for (const t of f.transactions) if (set.has(t.id)) on ? (t[flag] = true) : delete t[flag];
  });
}

export function deleteTransactions(ids: string[]) {
  const set = new Set(ids);
  updateFinance((f) => {
    f.transactions = f.transactions.filter((t) => !set.has(t.id));
  });
}

export function addTransaction(t: Omit<FinTransaction, 'id'>): string {
  const id = uid('tx');
  updateFinance((f) => {
    f.transactions.push({ ...t, id, createdAt: new Date().toISOString() });
  });
  return id;
}

/* ---------------------------------------------------------------- rules & categories */

/** Add a rule; apply it to existing transactions ('uncategorized' only, 'all', or 'none'). Returns how many changed. */
export function addRule(rule: Omit<FinRule, 'id'>, apply: 'uncategorized' | 'all' | 'none' = 'uncategorized'): { id: string; changed: number } {
  const id = uid('rule');
  let changed = 0;
  updateFinance((f) => {
    const r = { ...rule, id } as FinRule;
    f.rules.unshift(r);
    if (apply === 'none') return;
    for (const t of f.transactions) {
      if (!ruleMatches(r, t.description, t.accountId)) continue;
      if (apply === 'uncategorized' && t.category) continue;
      let hit = false;
      if (r.category && t.category !== r.category) {
        t.category = r.category;
        hit = true;
      }
      if (r.rename && t.merchant !== r.rename) {
        t.merchant = r.rename;
        hit = true;
      }
      if (r.transfer && !t.transfer) {
        t.transfer = true;
        hit = true;
      }
      if (r.recurring && !t.recurring) {
        t.recurring = true;
        hit = true;
      }
      if (hit) changed++;
    }
  });
  return { id, changed };
}

/** Re-run rules + keywords over transactions (uncategorised only, or all). Returns how many got a (new) category. */
export function applyRules(scope: 'uncategorized' | 'all', ids?: string[]): number {
  let changed = 0;
  const only = ids ? new Set(ids) : null;
  updateFinance((f) => {
    for (const t of f.transactions) {
      if (only && !only.has(t.id)) continue;
      if (scope === 'uncategorized' && t.category) continue;
      const c = categorize(f as FinanceData, t.description, t.amount, t.accountId);
      let hit = false;
      if (c.category && c.category !== t.category) {
        t.category = c.category;
        hit = true;
      }
      if (c.merchant && c.merchant !== t.merchant) t.merchant = c.merchant;
      if (c.transfer || c.category === 'transfers') t.transfer = true;
      if (c.recurring) t.recurring = true;
      if (hit) changed++;
    }
  });
  return changed;
}

/** Transactions a rule would match. */
export function ruleMatchCount(rule: Pick<FinRule, 'match' | 'matchType' | 'accountId'>, txs: FinTransaction[]): number {
  const r = { ...rule, id: '' } as FinRule;
  return txs.filter((t) => ruleMatches(r, t.description, t.accountId)).length;
}

/** A sensible rule text from a transaction ("Starbucks" from "STARBUCKS STORE 0423 SEATTLE WA"). */
export function suggestRuleText(t: FinTransaction): string {
  const words = t.description.replace(/[^A-Za-z0-9&.' ]+/g, ' ').trim().split(/\s+/).filter((w) => !/^\d+$/.test(w));
  const base = words.slice(0, words[0] && words[0].length <= 3 ? 2 : 1).join(' ');
  return base || merchantOf(t);
}

export function deleteCategory(id: string, reassignTo?: string) {
  updateFinance((f) => {
    f.categories = f.categories.filter((c) => c.id !== id);
    for (const t of f.transactions) if (t.category === id) reassignTo ? (t.category = reassignTo) : delete t.category;
    f.budgets = f.budgets.filter((b) => b.category !== id);
    // budget: its assigned money moves with the transactions (or back to Ready to Assign); its target goes
    const moved = f.assignments.filter((a) => a.categoryId === id);
    f.assignments = f.assignments.filter((a) => a.categoryId !== id);
    if (reassignTo) for (const a of moved) setAssignedIn(f.assignments, a.month, reassignTo, assignedIn(f.assignments, a.month, reassignTo) + a.assigned);
    f.targets = f.targets.filter((t) => t.categoryId !== id);
    for (const r of f.rules) if (r.category === id) reassignTo ? (r.category = reassignTo) : delete r.category;
  });
}

export function addCategory(c: Omit<FinCategory, 'id'> & { id?: string }): string {
  const base = (c.id || c.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'category';
  let id = base;
  updateFinance((f) => {
    let n = 2;
    while (f.categories.some((x) => x.id === id)) id = `${base}_${n++}`;
    f.categories.push({ ...c, id });
  });
  return id;
}

/* ---------------------------------------------------------------- insights & advice */

export function dismissInsight(key: string, on = true) {
  updateFinance((f) => {
    const set = new Set(f.settings.dismissedInsights);
    if (on) set.add(key);
    else set.delete(key);
    f.settings.dismissedInsights = [...set].slice(-400);
  });
}

/** Keep a computed insight as a pinned note. */
export function pinComputed(i: ComputedInsight): string {
  const id = uid('ins');
  updateFinance((f) => {
    const existing = f.insights.find((x) => x.key === i.key);
    if (existing) {
      existing.pinned = true;
      existing.dismissed = false;
      return;
    }
    f.insights.unshift({ id, title: i.title, body: i.body, source: 'app', kind: i.kind, date: todayISO(), pinned: true, key: i.key });
  });
  return id;
}

export function addAdvice(a: Omit<FinInsight, 'id' | 'date'> & { date?: string }): string {
  const id = uid('ins');
  updateFinance((f) => {
    f.insights.unshift({ ...a, id, date: a.date ?? todayISO() });
  });
  return id;
}

export function patchInsight(id: string, patch: Partial<FinInsight>, coalesce = false) {
  updateFinance(
    (f) => {
      const x = f.insights.find((i) => i.id === id);
      if (x) Object.assign(x, patch);
    },
    coalesce ? { coalesce: `fin-ins:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function deleteInsight(id: string) {
  updateFinance((f) => {
    f.insights = f.insights.filter((i) => i.id !== id);
  });
}

/* ---------------------------------------------------------------- YNAB budget */

/** Set what is assigned to a category in a month (typing coalesces into one undo step). */
export function setAssigned(month: string, categoryId: string, value: number, coalesce = true) {
  updateFinance((f) => setAssignedIn(f.assignments, month, categoryId, value), coalesce ? { coalesce: `fin-asg:${month}:${categoryId}` } : undefined);
}

/** Move money between categories (or Ready to Assign = 'rta') in a month. */
export function moveMoney(month: string, from: string, to: string, amount: number) {
  updateFinance((f) => moveMoneyIn(f.assignments, month, from, to, Math.abs(amount)));
}

/** Apply assigned-amount changes (from autoAssignPlan) in one undo step. */
export function applyAssignChanges(month: string, changes: AssignChange[]) {
  if (!changes.length) return;
  updateFinance((f) => {
    for (const c of changes) setAssignedIn(f.assignments, month, c.categoryId, c.to);
  });
}

/** Run an auto-assign helper on a month (all visible categories, or `ids`). Returns the changes made. */
export function autoAssign(month: string, mode: AutoAssignMode, ids?: string[]): AssignChange[] {
  const plan = autoAssignPlan(getFinance(), month, mode, ids);
  applyAssignChanges(month, plan);
  return plan;
}

/** Create, replace or (null) remove the target of a category. */
export function setTarget(categoryId: string, t: Omit<FinTarget, 'id' | 'categoryId'> | null): string | undefined {
  let id: string | undefined;
  updateFinance((f) => {
    const old = f.targets.find((x) => x.categoryId === categoryId);
    if (!t) {
      f.targets = f.targets.filter((x) => x.categoryId !== categoryId);
      return;
    }
    id = old?.id ?? uid('tgt');
    const next: FinTarget = { id, categoryId, type: t.type, amount: Math.max(0, t.amount || 0) };
    if (t.date) next.date = t.date.slice(0, 7);
    if (t.repeatMonths) next.repeatMonths = Math.max(0, Math.round(t.repeatMonths));
    if (t.notes) next.notes = t.notes;
    if (old) Object.assign(old, next, { date: next.date, repeatMonths: next.repeatMonths, notes: next.notes });
    else f.targets.push(next);
    if (old) for (const k of ['date', 'repeatMonths', 'notes'] as const) if (old[k] === undefined) delete old[k];
  });
  return id;
}

export function patchCategory(id: string, patch: Partial<FinCategory>) {
  updateFinance((f) => {
    const c = f.categories.find((x) => x.id === id);
    if (!c) return;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === false || v === '') delete (c as any)[k];
      else (c as any)[k] = v;
    }
  });
}
