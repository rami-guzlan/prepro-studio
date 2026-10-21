/* Add / edit one transaction. Existing transactions save as you type (undoable);
   a new one is added with "Add". */
import { useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { todayISO } from '@/lib/dates';
import { Button, Checkbox, confirmDialog, DateInput, Field, FormGrid, Input, Modal, NumberInput, Textarea, toast } from '@/ui';
import type { FinTransaction } from './types';
import { cleanDescription, merchantOf } from './calc';
import { categorize } from './importers';
import { addTransaction, deleteTransactions, getFinance, patchTransaction, suggestRuleText } from './ops';
import { AccountSelect, CategorySelect, useFinance, useFmt } from './ui';
import { RuleModal } from './RuleModal';

export function TxModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const f = useFinance();
  const fmt = useFmt();
  const existing = id ? f.transactions.find((t) => t.id === id) : undefined;
  const [draft, setDraft] = useState<Omit<FinTransaction, 'id'>>(() => ({ date: todayISO(), description: '', amount: 0, accountId: f.settings.defaultAccountId }));
  const [out, setOut] = useState(true);
  const [rule, setRule] = useState(false);
  const t = existing ?? ({ ...draft, id: '' } as FinTransaction);
  const isNew = !existing;
  const set = (p: Partial<FinTransaction>) => (existing ? patchTransaction(existing.id, p) : setDraft((d) => ({ ...d, ...p })));
  const statement = existing?.statementId ? f.statements.find((s) => s.id === existing.statementId) : undefined;

  if (id && !existing) {
    return (
      <Modal open size="sm" title="Transaction" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <p className="muted">This transaction was deleted.</p>
      </Modal>
    );
  }

  const add = () => {
    if (!draft.description.trim() || !draft.amount) return;
    const amount = out ? -Math.abs(draft.amount) : Math.abs(draft.amount);
    const auto = draft.category ? {} : categorize(getFinance(), draft.description, amount, draft.accountId);
    addTransaction({ ...draft, amount, description: draft.description.trim(), category: draft.category ?? auto.category, merchant: draft.merchant || auto.merchant });
    toast('Transaction added');
    onClose();
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={isNew ? 'Add a transaction' : merchantOf(t)}
        onClose={onClose}
        footer={
          isNew ? (
            <>
              <div className="spacer" />
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={!draft.description.trim() || !draft.amount} onClick={add}>
                Add
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={async () => {
                  if (await confirmDialog({ title: 'Delete this transaction?', message: `${t.description} · ${fmt.money(t.amount)}`, confirmLabel: 'Delete', danger: true })) {
                    deleteTransactions([t.id]);
                    onClose();
                  }
                }}
              >
                Delete
              </Button>
              <Button icon={Sparkles} onClick={() => setRule(true)}>
                Create rule…
              </Button>
              <div className="spacer" />
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </>
          )
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <FormGrid min={160}>
            <Field label="Date">
              <DateInput value={t.date} onChange={(date) => date && set({ date })} />
            </Field>
            <Field label={isNew ? 'Amount' : 'Amount (− = money out)'}>
              {isNew ? (
                <div className="row" style={{ gap: 6 }}>
                  <NumberInput value={draft.amount || undefined} onChange={(n) => setDraft((d) => ({ ...d, amount: Math.abs(n ?? 0) }))} decimals={2} style={{ flex: 1 }} autoFocus={false} />
                  <Button size="sm" active={out} onClick={() => setOut(true)}>
                    Out
                  </Button>
                  <Button size="sm" active={!out} onClick={() => setOut(false)}>
                    In
                  </Button>
                </div>
              ) : (
                <NumberInput value={t.amount} onChange={(n) => n != null && set({ amount: n })} decimals={2} />
              )}
            </Field>
            <Field label="Account">
              <AccountSelect value={t.accountId} onChange={(accountId) => set({ accountId })} />
            </Field>
          </FormGrid>
          <Field label="Description (as on the statement)">
            <Input autoFocus={isNew} value={t.description} onChange={(description) => set({ description })} placeholder="e.g. SQ *BLUE BOTTLE COFFEE" onKeyDown={(e) => isNew && e.key === 'Enter' && add()} />
          </Field>
          <FormGrid min={180}>
            <Field label="Merchant name" hint={t.description ? `Shown as “${t.merchant?.trim() || cleanDescription(t.description)}”` : undefined}>
              <Input value={t.merchant ?? ''} onChange={(merchant) => set({ merchant })} placeholder={t.description ? cleanDescription(t.description) : 'Clean name'} />
            </Field>
            <Field label="Category">
              <CategorySelect value={t.category} onChange={(category) => set({ category, ...(category === 'transfers' ? { transfer: true } : {}) })} />
            </Field>
          </FormGrid>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <Checkbox checked={t.transfer} onChange={(transfer) => set({ transfer })} label="Transfer between my accounts" />
            <Checkbox checked={t.recurring} onChange={(recurring) => set({ recurring })} label="Recurring (bill, subscription, salary)" />
          </div>
          <Field label="Tags" hint="Comma separated, e.g. tax-deductible, trip-lisbon">
            <Input value={(t.tags ?? []).join(', ')} onChange={(v) => set({ tags: v.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="tax-deductible" />
          </Field>
          <Field label="Notes">
            <Textarea value={t.notes ?? ''} onChange={(notes) => set({ notes })} minRows={2} autoGrow />
          </Field>
          {statement && (
            <p className="fin-muted-note" style={{ margin: 0 }}>
              Imported from {statement.name || statement.fileName || 'a statement'}
              {statement.periodStart ? ` (${fmt.dateMedium(statement.periodStart)} – ${fmt.dateMedium(statement.periodEnd)})` : ''}.
            </p>
          )}
        </div>
      </Modal>
      {rule && existing && <RuleModal initial={{ match: suggestRuleText(existing), category: existing.category, rename: existing.merchant }} onClose={() => setRule(false)} />}
    </>
  );
}
