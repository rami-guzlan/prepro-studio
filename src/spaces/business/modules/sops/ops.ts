/* Write operations and helpers of workflows / SOPs / checklists: steps, runs
   (one pass through a checklist, e.g. onboarding a specific client), plain-text
   export and starter templates. Shared by the screen, print docs, sample data
   and agent tools. */
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { bizUpdate, makeSop } from '../../ops';
import { SOP_KINDS } from '../../constants';
import type { BusinessData, Sop, SopRun, SopStep } from '../../types';

export const makeStep = (p: Partial<SopStep> = {}): SopStep => ({ id: uid('step'), text: '', ...p });

export const SOP_CATEGORIES = ['Clients', 'Delivery', 'Sales', 'Marketing', 'Content', 'Finance & admin', 'Hiring & contractors', 'Tools & IT', 'Other'];
export const SOP_FREQUENCIES = ['Per client', 'Per project', 'Per video', 'Daily', 'Every Monday', 'Every Friday', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'As needed'];

/** Change a SOP (marks it updated today). */
export function updateSop(id: string, recipe: (s: Sop) => void, coalesce?: string) {
  bizUpdate(
    (b) => {
      const s = b.sops.find((x) => x.id === id);
      if (!s) return;
      recipe(s as Sop);
      s.updatedAt = todayISO();
    },
    coalesce ? { coalesce: `biz:sop:${id}:${coalesce}` } : undefined,
  );
}

export function patchSop(id: string, patch: Partial<Sop>, coalesce = true) {
  updateSop(
    id,
    (s) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (s as any)[k];
        else (s as any)[k] = v;
      }
    },
    coalesce ? Object.keys(patch).join(',') : undefined,
  );
}

export function addSteps(sopId: string, steps: SopStep[], index?: number) {
  updateSop(sopId, (s) => {
    if (index == null || index < 0 || index > s.steps.length) s.steps.push(...steps);
    else s.steps.splice(index, 0, ...steps);
  });
}

export function patchStep(sopId: string, stepId: string, patch: Partial<SopStep>, coalesce = true) {
  updateSop(
    sopId,
    (s) => {
      const st = s.steps.find((x) => x.id === stepId);
      if (!st) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (st as any)[k];
        else (st as any)[k] = v;
      }
    },
    coalesce ? `step:${stepId}:${Object.keys(patch).join(',')}` : undefined,
  );
}

export function removeStep(sopId: string, stepId: string) {
  updateSop(sopId, (s) => {
    s.steps = s.steps.filter((x) => x.id !== stepId);
    for (const r of s.runs) r.done = r.done.filter((x) => x !== stepId);
  });
}

export function moveStep(sopId: string, stepId: string, dir: -1 | 1) {
  updateSop(sopId, (s) => {
    const i = s.steps.findIndex((x) => x.id === stepId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.steps.length) return;
    const [st] = s.steps.splice(i, 1);
    s.steps.splice(j, 0, st);
  });
}

/* ---------------------------------------------------------------- runs */

/** Start a run; returns its id. */
export function startRun(sopId: string, label?: string, date = todayISO()): string {
  const run: SopRun = { id: uid('run'), label: label?.trim() || undefined, startedAt: date, done: [] };
  bizUpdate((b) => {
    const s = b.sops.find((x) => x.id === sopId);
    if (s) s.runs.push(run);
  });
  return run.id;
}

export function setRunSteps(sopId: string, runId: string, stepIds: string[], done: boolean) {
  bizUpdate((b) => {
    const r = b.sops.find((x) => x.id === sopId)?.runs.find((x) => x.id === runId);
    if (!r) return;
    const set = new Set(r.done);
    for (const id of stepIds) {
      if (done) set.add(id);
      else set.delete(id);
    }
    r.done = [...set];
  });
}

export function finishRun(sopId: string, runId: string, finished = true, date = todayISO()) {
  bizUpdate((b) => {
    const r = b.sops.find((x) => x.id === sopId)?.runs.find((x) => x.id === runId);
    if (!r) return;
    if (finished) r.finishedAt = date;
    else delete r.finishedAt;
  });
}

export function patchRun(sopId: string, runId: string, patch: Partial<SopRun>) {
  bizUpdate(
    (b) => {
      const r = b.sops.find((x) => x.id === sopId)?.runs.find((x) => x.id === runId);
      if (r) Object.assign(r, patch);
    },
    { coalesce: `biz:sop:${sopId}:run:${runId}:${Object.keys(patch).join(',')}` },
  );
}

export function removeRun(sopId: string, runId: string) {
  bizUpdate((b) => {
    const s = b.sops.find((x) => x.id === sopId);
    if (s) s.runs = s.runs.filter((r) => r.id !== runId);
  });
}

/** Done / total of a run (ignores ids of deleted steps). */
export function runProgress(s: Sop, r: SopRun) {
  const ids = new Set(s.steps.map((x) => x.id));
  const done = r.done.filter((x) => ids.has(x)).length;
  return { done, total: s.steps.length, pct: s.steps.length ? done / s.steps.length : 0 };
}

/** Find a SOP by id or title (agents, print options). */
export function findSop(b: BusinessData, ref: string | undefined): Sop | undefined {
  const r = String(ref ?? '').trim().toLowerCase();
  if (!r) return undefined;
  return b.sops.find((x) => x.id === ref) ?? b.sops.find((x) => x.title.trim().toLowerCase() === r) ?? b.sops.find((x) => x.title.toLowerCase().includes(r));
}

/* ---------------------------------------------------------------- text */

/** The SOP as numbered plain text (clipboard, agents). */
export function sopText(b: BusinessData, s: Sop): string {
  const kind = SOP_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind;
  const lines: string[] = [s.title || 'Untitled', `${kind}${s.category ? ` · ${s.category}` : ''}`];
  const meta = [s.trigger && `When: ${s.trigger}`, s.owner && `Owner: ${s.owner}`, s.frequency && `How often: ${s.frequency}`].filter(Boolean) as string[];
  if (meta.length) lines.push(...meta);
  lines.push('');
  s.steps.forEach((st, i) => {
    lines.push(`${i + 1}. ${st.text}`);
    if (st.detail?.trim()) for (const l of st.detail.trim().split('\n')) lines.push(`   ${l}`);
  });
  const res = s.resourceIds.map((id) => b.resources.find((r) => r.id === id)).filter(Boolean);
  if (res.length) {
    lines.push('', 'Resources:');
    for (const r of res) lines.push(`- ${r!.title}${r!.kind === 'link' && r!.url ? ` (${r!.url})` : ''}`);
  }
  if (s.notes?.trim()) lines.push('', 'Notes:', s.notes.trim());
  return lines.join('\n');
}

/** Steps from pasted text: one per line, list markers removed; indented lines become the detail of the step above. */
export function stepsFromText(text: string): SopStep[] {
  const out: SopStep[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indented = /^\s{2,}|\t/.test(raw) && out.length > 0;
    const t = raw.trim().replace(/^(\d+[.)]|[-*•]|\[[ xX]?\])\s+/, '');
    if (indented) {
      const last = out[out.length - 1];
      last.detail = last.detail ? `${last.detail}\n${t}` : t;
    } else out.push(makeStep({ text: t }));
  }
  return out;
}

/* ---------------------------------------------------------------- starters */

type Starter = Pick<Sop, 'title' | 'kind' | 'category' | 'trigger' | 'owner' | 'frequency' | 'notes'> & { steps: [string, string?][] };

export const STARTER_SOPS: Starter[] = [
  {
    title: 'Client onboarding',
    kind: 'checklist',
    category: 'Clients',
    trigger: 'A new client signs the proposal',
    owner: 'Me',
    frequency: 'Per client',
    steps: [
      ['Send the agreement for signature', 'Services agreement or SOW from Legal Documents. Check fee, deposit and revision rounds.'],
      ['Send the deposit invoice', '50% upfront unless agreed otherwise; due on receipt.'],
      ['Add the client in Clients', 'Billing address, PO process, who approves invoices, default rate.'],
      ['Send the welcome email + intake questionnaire', 'Use the welcome email template from Resources.'],
      ['Create the shared folder', 'Client name / project name / 01 Brief · 02 Assets · 03 Deliverables.'],
      ['Schedule the kickoff call', '45 minutes: goals, audience, references, timeline, approvals.'],
      ['Create the project with tasks and milestones'],
    ],
  },
  {
    title: 'Project delivery',
    kind: 'workflow',
    category: 'Delivery',
    trigger: 'A project is ready to deliver',
    owner: 'Me',
    frequency: 'Per project',
    steps: [
      ['Final QC pass', 'Spelling in titles, audio levels (-14 LUFS web), color, black frames, safe areas.'],
      ['Export masters and versions', 'Master (ProRes), web (H.264), social cut-downs, captions (SRT).'],
      ['Upload to the delivery folder and send the link'],
      ['Send the final invoice'],
      ['Ask for a testimonial', 'Use the testimonial request template; log it in Testimonials.'],
      ['Archive project files', 'Copy to the archive drive and the cloud backup; note the drive in the project.'],
      ['Add the work to the portfolio'],
    ],
  },
  {
    title: 'Monthly bookkeeping',
    kind: 'checklist',
    category: 'Finance & admin',
    trigger: 'First working day of the month',
    owner: 'Me',
    frequency: 'Monthly',
    steps: [
      ['Log last month’s income and mark paid invoices'],
      ['Match card and bank statements to Expenses', 'Attach missing receipts.'],
      ['Chase overdue invoices', 'Friendly reminder at 7 days late, call at 21.'],
      ['Pay contractors who are owed'],
      ['Set aside tax', '25–30% of profit to the tax savings account.'],
      ['Export the Profit & Loss PDF for the accountant'],
    ],
  },
  {
    title: 'Content repurposing',
    kind: 'workflow',
    category: 'Content',
    trigger: 'A long-form video is published',
    owner: 'Me + editor',
    frequency: 'Per video',
    steps: [
      ['Pick 3–5 moments for shorts', 'Strong hook in the first 2 seconds, one idea per clip.'],
      ['Cut vertical shorts with captions'],
      ['Write a LinkedIn post and a newsletter section from the script'],
      ['Turn key frames into an Instagram carousel'],
      ['Schedule everything in the Marketing Space calendar'],
    ],
  },
];

export function sopFromStarter(st: Starter, patch: Partial<Sop> = {}): Sop {
  const { steps, ...rest } = st;
  return makeSop({ ...rest, steps: steps.map(([text, detail]) => makeStep({ text, detail })), ...patch });
}
