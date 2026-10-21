/* Add / edit a goal (emergency fund, debt payoff, savings target, purchase …). */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { Button, Checkbox, confirmDialog, DateInput, Field, FormGrid, Input, Modal, NumberInput, Select, Textarea } from '@/ui';
import type { FinGoal, GoalType } from './types';
import { GOAL_TYPES, isDebtType } from './types';
import { addMonthsISO, averageMonth, goalProgress, netWorth } from './calc';
import { getFinance, updateFinance } from './ops';
import { AccountSelect, useFinance, useFmt } from './ui';

/** A starting point for a new goal of a type (emergency fund sized from your spending). */
export function goalTemplate(type: GoalType): Omit<FinGoal, 'id'> {
  const f = getFinance();
  const today = todayISO();
  const avg = averageMonth(f, today);
  if (type === 'emergency_fund') {
    const savings = f.accounts.find((a) => a.type === 'savings' && !a.archived);
    const target = Math.ceil(((avg.spending || 2000) * f.settings.emergencyMonths) / 100) * 100;
    return { name: `Emergency fund (${f.settings.emergencyMonths} months)`, type, target, current: savings?.balance ?? 0, accountId: savings?.id, monthly: Math.max(50, Math.round(Math.max(0, avg.net) / 2 / 10) * 10) || 200, targetDate: addMonthsISO(today, 24), startDate: today };
  }
  if (type === 'debt_payoff') {
    const debt = f.accounts.filter((a) => isDebtType(a.type) && (a.balance ?? 0) > 0).sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];
    return { name: debt ? `Pay off ${debt.name}` : 'Pay off debt', type, target: Math.ceil(debt?.balance ?? 1000), current: 0, accountId: debt?.id, monthly: debt?.minPayment ?? 100, targetDate: addMonthsISO(today, 12), startDate: today };
  }
  if (type === 'purchase') return { name: 'New purchase', type, target: 1500, current: 0, monthly: 150, targetDate: addMonthsISO(today, 10), startDate: today };
  if (type === 'retirement') return { name: 'Retirement / investing', type, target: Math.round(netWorth(f.accounts).assets + 50000), current: f.accounts.filter((a) => a.type === 'investment').reduce((s, a) => s + (a.balance ?? 0), 0), monthly: 300, startDate: today };
  return { name: type === 'savings' ? 'Savings target' : 'New goal', type, target: 5000, current: 0, monthly: 200, targetDate: addMonthsISO(today, 18), startDate: today };
}

export function GoalModal({ id, initial, onClose }: { id?: string; initial?: Omit<FinGoal, 'id'>; onClose: () => void }) {
  const f = useFinance();
  const fmt = useFmt();
  const existing = id ? f.goals.find((g) => g.id === id) : undefined;
  const [draft, setDraft] = useState<Omit<FinGoal, 'id'>>(() => initial ?? goalTemplate('savings'));
  const g = existing ?? ({ ...draft, id: '' } as FinGoal);
  const set = (p: Partial<FinGoal>) =>
    existing
      ? updateFinance(
          (fd) => {
            const x = fd.goals.find((y) => y.id === existing.id);
            if (!x) return;
            for (const [k, v] of Object.entries(p)) if (v === undefined || v === '') delete (x as any)[k];
              else (x as any)[k] = v;
          },
          { coalesce: `fin-goal:${existing.id}:${Object.keys(p).join(',')}` },
        )
      : setDraft((d) => ({ ...d, ...p }));
  const prog = goalProgress(g, f.accounts, todayISO());
  const linked = g.accountId ? f.accounts.find((a) => a.id === g.accountId) : undefined;
  const add = () => {
    if (!draft.name.trim() || !(draft.target > 0)) return;
    updateFinance((fd) => {
      fd.goals.push({ ...draft, name: draft.name.trim(), id: uid('goal'), slot: fd.goals.length % 8 });
    });
    onClose();
  };

  if (id && !existing) return null;

  return (
    <Modal
      open
      size="md"
      title={existing ? existing.name || 'Goal' : 'New goal'}
      onClose={onClose}
      footer={
        existing ? (
          <>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                if (await confirmDialog({ title: 'Delete this goal?', message: existing.name, confirmLabel: 'Delete', danger: true })) {
                  updateFinance((fd) => {
                    fd.goals = fd.goals.filter((x) => x.id !== existing.id);
                  });
                  onClose();
                }
              }}
            >
              Delete
            </Button>
            <div className="spacer" />
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <div className="spacer" />
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!draft.name.trim() || !(draft.target > 0)} onClick={add}>
              Add goal
            </Button>
          </>
        )
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <FormGrid min={180}>
          <Field label="Name">
            <Input autoFocus={!existing} value={g.name} onChange={(name) => set({ name })} onKeyDown={(e) => !existing && e.key === 'Enter' && add()} />
          </Field>
          <Field label="Type" hint={GOAL_TYPES.find((t) => t.value === g.type)?.hint}>
            <Select
              value={g.type}
              options={GOAL_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              onChange={(v) => (existing ? set({ type: v as GoalType }) : setDraft({ ...goalTemplate(v as GoalType) }))}
            />
          </Field>
        </FormGrid>
        <FormGrid min={150}>
          <Field label={g.type === 'debt_payoff' ? 'Debt to clear' : 'Target amount'}>
            <NumberInput value={g.target} onChange={(n) => set({ target: Math.max(0, n ?? 0) })} decimals={0} />
          </Field>
          <Field label={g.type === 'debt_payoff' ? 'Paid off so far' : 'Saved so far'} hint={linked ? `From ${linked.name}` : undefined}>
            <NumberInput value={linked ? prog.current : g.current} disabled={!!linked && linked.balance != null} onChange={(n) => set({ current: n ?? 0 })} decimals={0} />
          </Field>
          <Field label="Monthly contribution">
            <NumberInput value={g.monthly} onChange={(monthly) => set({ monthly })} decimals={0} />
          </Field>
        </FormGrid>
        <FormGrid min={150}>
          <Field label="Target date">
            <DateInput value={g.targetDate} onChange={(targetDate) => set({ targetDate })} />
          </Field>
          <Field label="Started">
            <DateInput value={g.startDate} onChange={(startDate) => set({ startDate })} />
          </Field>
          <Field label="Linked account" hint={g.type === 'debt_payoff' ? 'Progress = target − amount owed' : 'Progress = its balance'}>
            <AccountSelect value={g.accountId} onChange={(accountId) => set({ accountId })} placeholder="None (track by hand)" />
          </Field>
        </FormGrid>
        <div className="fin-notice info">
          <span>
            {prog.remaining <= 0
              ? 'Target reached.'
              : prog.monthsLeft != null
                ? `At ${fmt.money(g.monthly ?? 0, { cents: false })} a month you reach ${fmt.money(g.target, { cents: false })} around ${fmt.dateMedium(prog.projectedDate)}.`
                : 'Set a monthly contribution to see when you will get there.'}
            {prog.requiredMonthly != null && prog.remaining > 0 ? ` To hit the target date you need ${fmt.money(prog.requiredMonthly, { cents: false })} a month.` : ''}
          </span>
        </div>
        <Field label="Notes">
          <Textarea value={g.notes ?? ''} onChange={(notes) => set({ notes })} minRows={2} autoGrow />
        </Field>
        {existing && <Checkbox checked={g.done} onChange={(done) => set({ done: done || undefined })} label="Done — goal completed" />}
      </div>
    </Modal>
  );
}
