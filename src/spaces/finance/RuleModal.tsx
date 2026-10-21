/* Create / edit a categorisation rule ("description contains X → category Y, rename to Z"). */
import { useMemo, useState } from 'react';
import { Button, Checkbox, Field, FormGrid, Input, Modal, Select, toast } from '@/ui';
import { plural } from '@/lib/text';
import type { FinRule, RuleMatch } from './types';
import { RULE_MATCHES } from './types';
import { addRule, ruleMatchCount, updateFinance } from './ops';
import { AccountSelect, CategorySelect, useFinance } from './ui';

export interface RuleDraft {
  match: string;
  matchType?: RuleMatch;
  category?: string;
  rename?: string;
  transfer?: boolean;
  recurring?: boolean;
  accountId?: string;
}

export function RuleModal({ rule, initial, onClose }: { rule?: FinRule; initial?: RuleDraft; onClose: () => void }) {
  const f = useFinance();
  const [d, setD] = useState<RuleDraft>(() => (rule ? { ...rule } : { matchType: 'contains', ...initial, match: initial?.match ?? '' }));
  const [apply, setApply] = useState<'uncategorized' | 'all' | 'none'>('uncategorized');
  const set = (p: Partial<RuleDraft>) => setD((x) => ({ ...x, ...p }));
  const matches = useMemo(() => (d.match.trim() ? ruleMatchCount({ match: d.match, matchType: d.matchType ?? 'contains', accountId: d.accountId }, f.transactions) : 0), [d.match, d.matchType, d.accountId, f.transactions]);
  const uncategorizedMatches = useMemo(
    () => (d.match.trim() ? ruleMatchCount({ match: d.match, matchType: d.matchType ?? 'contains', accountId: d.accountId }, f.transactions.filter((t) => !t.category)) : 0),
    [d.match, d.matchType, d.accountId, f.transactions],
  );
  let badRegex = false;
  if (d.matchType === 'regex' && d.match) {
    try {
      new RegExp(d.match, 'i');
    } catch {
      badRegex = true;
    }
  }
  const ok = !!d.match.trim() && !badRegex && (!!d.category || !!d.rename?.trim() || !!d.transfer || !!d.recurring);

  const save = () => {
    if (!ok) return;
    const clean: Omit<FinRule, 'id'> = {
      match: d.match.trim(),
      matchType: d.matchType ?? 'contains',
      ...(d.category ? { category: d.category } : {}),
      ...(d.rename?.trim() ? { rename: d.rename.trim() } : {}),
      ...(d.transfer ? { transfer: true } : {}),
      ...(d.recurring ? { recurring: true } : {}),
      ...(d.accountId ? { accountId: d.accountId } : {}),
    };
    if (rule) {
      updateFinance((fd) => {
        const i = fd.rules.findIndex((r) => r.id === rule.id);
        if (i >= 0) fd.rules[i] = { ...clean, id: rule.id };
      });
      toast('Rule saved');
    } else {
      const r = addRule(clean, apply);
      toast(`Rule added${apply !== 'none' ? ` · ${plural(r.changed, 'transaction')} updated` : ''}`);
    }
    onClose();
  };

  return (
    <Modal
      open
      size="md"
      title={rule ? 'Edit rule' : 'New rule'}
      onClose={onClose}
      footer={
        <>
          <span className="muted small">{d.match.trim() ? `Matches ${plural(matches, 'transaction')}` : 'Rules run on every import, before keywords.'}</span>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={save}>
            {rule ? 'Save rule' : 'Add rule'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <FormGrid min={180}>
          <Field label="When the description">
            <Select value={d.matchType ?? 'contains'} options={RULE_MATCHES} onChange={(v) => set({ matchType: v as RuleMatch })} />
          </Field>
          <Field label="Text" hint={badRegex ? 'Not a valid regular expression' : 'Not case-sensitive'}>
            <Input autoFocus value={d.match} onChange={(match) => set({ match })} placeholder="e.g. STARBUCKS" onKeyDown={(e) => e.key === 'Enter' && save()} />
          </Field>
        </FormGrid>
        <FormGrid min={180}>
          <Field label="Set category">
            <CategorySelect value={d.category} onChange={(category) => set({ category })} placeholder="Leave as is" />
          </Field>
          <Field label="Rename merchant to">
            <Input value={d.rename ?? ''} onChange={(rename) => set({ rename })} placeholder="e.g. Starbucks" />
          </Field>
          <Field label="Only for account">
            <AccountSelect value={d.accountId} onChange={(accountId) => set({ accountId })} placeholder="Any account" />
          </Field>
        </FormGrid>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <Checkbox checked={d.transfer} onChange={(transfer) => set({ transfer })} label="Mark as transfer (not income or spending)" />
          <Checkbox checked={d.recurring} onChange={(recurring) => set({ recurring })} label="Mark as recurring" />
        </div>
        {!rule && (
          <Field label="Apply to existing transactions">
            <Select
              value={apply}
              onChange={(v) => setApply(v as typeof apply)}
              options={[
                { value: 'uncategorized', label: `Uncategorised matches only (${uncategorizedMatches})` },
                { value: 'all', label: `All matches, replacing their category (${matches})` },
                { value: 'none', label: 'Only future imports' },
              ]}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
