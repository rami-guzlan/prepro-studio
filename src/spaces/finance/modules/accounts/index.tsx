/* Accounts: checking, savings, credit cards, loans, investments and cash with
   balances, credit utilisation and net worth. */
import { useEffect, useMemo, useState } from 'react';
import { Archive, Landmark, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import { navigateSpace, useApp } from '@/store/app';
import { uid } from '@/lib/id';
import { plural } from '@/lib/text';
import { todayISO } from '@/lib/dates';
import { Meter, StatTile, VIZ } from '@/ui/charts';
import { Button, Checkbox, confirmDialog, DateInput, EmptyState, ExportMenu, Field, FormGrid, Input, Menu, Modal, ModuleHeader, NumberInput, Select, Switch, Textarea, Toolbar } from '@/ui';
import type { AccountType, FinAccount } from '../../types';
import { ACCOUNT_TYPE_BY_ID, ACCOUNT_TYPES, isDebtType, isOnBudget } from '../../types';
import { netWorth } from '../../calc';
import { updateFinance } from '../../ops';
import { FinPage, pct, useFinance, useFmt } from '../../ui';

export default function AccountsModule() {
  const f = useFinance();
  const fmt = useFmt();
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    if (params?.add) setOpen('new');
    else if (typeof params?.accountId === 'string') setOpen(params.accountId);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const nw = useMemo(() => netWorth(f.accounts), [f.accounts]);
  const stats = useMemo(() => {
    const m = new Map<string, { n: number; last: string }>();
    for (const t of f.transactions) {
      if (!t.accountId) continue;
      const s = m.get(t.accountId) ?? { n: 0, last: '' };
      s.n++;
      if (t.date > s.last) s.last = t.date;
      m.set(t.accountId, s);
    }
    return m;
  }, [f.transactions]);
  const money0 = (n: number) => fmt.money(n, { cents: false });
  const archived = f.accounts.filter((a) => a.archived).length;
  const list = f.accounts.filter((a) => showArchived || !a.archived);
  const groups = ACCOUNT_TYPES.map((t) => ({ type: t, items: list.filter((a) => a.type === t.value) })).filter((g) => g.items.length);

  return (
    <div className="module">
      <ModuleHeader
        title="Accounts"
        icon={Landmark}
        subtitle={f.accounts.length ? `Net worth ${money0(nw.net)} · ${plural(f.accounts.length - archived, 'account')}` : 'Your bank accounts, cards, loans and investments'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-fin-networth', label: 'Net worth & goals' }]} />
            <Button variant="primary" icon={Plus} onClick={() => setOpen('new')}>
              Add account
            </Button>
          </>
        }
      />
      {archived > 0 && (
        <Toolbar>
          <Checkbox checked={showArchived} onChange={setShowArchived} label={`Show archived (${archived})`} />
        </Toolbar>
      )}
      <div className="module-body">
        <FinPage>
          {!f.accounts.length ? (
            <EmptyState
              icon={Landmark}
              title="No accounts yet"
              description="Add each checking and savings account, credit card, loan and investment account with its current balance. Statements import into an account, and balances drive net worth, credit utilisation and the debt planner. Store only a name and the last 4 digits."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setOpen('new')}>
                  Add your first account
                </Button>
              }
            />
          ) : (
            <>
              <div className="fin-tiles">
                <StatTile label="Net worth" value={money0(nw.net)} />
                <StatTile label="Assets" value={money0(nw.assets)} sub={`${money0(nw.liquid)} in cash accounts`} />
                <StatTile label="Debts" value={money0(nw.debts)} sub={nw.debts > 0 ? 'cards and loans' : 'debt-free'} onClick={nw.debts > 0 ? () => navigateSpace('plan', { tab: 'debt' }) : undefined} />
                <StatTile label="Credit used" value={pct(nw.utilization)} sub={nw.creditLimit ? `${money0(nw.creditUsed)} of ${money0(nw.creditLimit)}` : 'add card limits'} deltaGood={nw.utilization == null ? undefined : nw.utilization <= 0.3} />
              </div>
              {groups.map((g) => (
                <section key={g.type.value} className="col" style={{ gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
                    {g.type.label} <span className="muted small">· {money0(g.items.filter((a) => !a.archived).reduce((s, a) => s + (a.balance ?? 0), 0))}</span>
                  </h3>
                  <div className="fin-accounts">
                    {g.items.map((a) => {
                      const st = stats.get(a.id);
                      const debt = isDebtType(a.type);
                      const util = a.type === 'credit_card' && a.creditLimit ? (a.balance ?? 0) / a.creditLimit : null;
                      return (
                        <button key={a.id} type="button" className={`fin-account ${a.archived ? 'archived' : ''}`} style={{ ['--fin-acct' as string]: VIZ(a.slot ?? 0) }} onClick={() => setOpen(a.id)}>
                          <div className="fin-account-top">
                            <div>
                              <b>
                                {a.name} {f.settings.defaultAccountId === a.id && <Star size={11} style={{ color: 'var(--warning)' }} aria-label="Default account" />}
                              </b>
                              <span>{[a.institution, ACCOUNT_TYPE_BY_ID[a.type]?.short, a.last4 ? `··${a.last4}` : ''].filter(Boolean).join(' · ')}</span>
                            </div>
                            {a.archived && <span className="fin-badge">Archived</span>}
                          </div>
                          <div className="fin-account-bal" style={debt && (a.balance ?? 0) > 0 ? { color: 'var(--danger)' } : undefined}>
                            {a.balance == null ? <span className="muted">No balance</span> : fmt.money(a.balance)}
                            {debt && a.balance != null && <small>owed</small>}
                          </div>
                          {util != null && (
                            <div className="col" style={{ gap: 3 }}>
                              <Meter value={a.balance ?? 0} max={a.creditLimit!} tone={util > 0.7 ? 'critical' : util > 0.3 ? 'warning' : 'good'} label="Credit used" />
                              <span className="muted small">
                                {pct(util)} of {money0(a.creditLimit!)} limit
                              </span>
                            </div>
                          )}
                          <div className="fin-account-facts">
                            {a.balanceDate && (
                              <span>
                                as of <b>{fmt.dateMedium(a.balanceDate)}</b>
                              </span>
                            )}
                            {a.apr != null && (
                              <span>
                                APR <b>{a.apr}%</b>
                              </span>
                            )}
                            {a.minPayment != null && debt && (
                              <span>
                                min <b>{money0(a.minPayment)}</b>
                              </span>
                            )}
                            {a.statementDay != null && (
                              <span>
                                statement day <b>{a.statementDay}</b>
                              </span>
                            )}
                            <span>
                              <b>{st?.n ?? 0}</b> transactions{st?.last ? ` · last ${fmt.dateMedium(st.last)}` : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </FinPage>
      </div>
      {open && <AccountModal id={open === 'new' ? undefined : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const blank = (): Omit<FinAccount, 'id'> => ({ name: '', type: 'checking', balanceDate: todayISO() });

export function AccountModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const f = useFinance();
  const existing = id ? f.accounts.find((a) => a.id === id) : undefined;
  const [draft, setDraft] = useState<Omit<FinAccount, 'id'>>(blank);
  const a = existing ?? ({ ...draft, id: '' } as FinAccount);
  const txCount = existing ? f.transactions.filter((t) => t.accountId === existing.id).length : 0;
  const set = (p: Partial<FinAccount>) =>
    existing
      ? updateFinance(
          (fd) => {
            const x = fd.accounts.find((y) => y.id === existing.id);
            if (!x) return;
            for (const [k, v] of Object.entries(p)) if (v === undefined || v === '') delete (x as any)[k];
              else (x as any)[k] = v;
          },
          { coalesce: `fin-acct:${existing.id}:${Object.keys(p).join(',')}` },
        )
      : setDraft((d) => ({ ...d, ...p }));
  const debt = isDebtType(a.type);
  const add = () => {
    if (!draft.name.trim()) return;
    const nid = uid('acct');
    updateFinance((fd) => {
      fd.accounts.push({ ...draft, name: draft.name.trim(), id: nid, slot: draft.slot ?? fd.accounts.length % 8 });
      if (!fd.settings.defaultAccountId) fd.settings.defaultAccountId = nid;
    });
    onClose();
  };
  const remove = async (withTx: boolean) => {
    if (!existing) return;
    const ok = await confirmDialog({
      title: withTx ? `Delete ${existing.name} and ${plural(txCount, 'transaction')}?` : `Delete ${existing.name}?`,
      message: withTx ? 'Ctrl+Z brings everything back.' : txCount ? `Its ${plural(txCount, 'transaction')} stay, without an account. Archiving keeps history tidy instead.` : undefined,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    updateFinance((fd) => {
      fd.accounts = fd.accounts.filter((x) => x.id !== existing.id);
      if (withTx) fd.transactions = fd.transactions.filter((t) => t.accountId !== existing.id);
      else for (const t of fd.transactions) if (t.accountId === existing.id) delete t.accountId;
      for (const s of fd.statements) if (s.accountId === existing.id) delete s.accountId;
      for (const g of fd.goals) if (g.accountId === existing.id) delete g.accountId;
      for (const r of fd.rules) if (r.accountId === existing.id) delete r.accountId;
      if (fd.settings.defaultAccountId === existing.id) fd.settings.defaultAccountId = fd.accounts[0]?.id;
    });
    onClose();
  };
  if (id && !existing) return null;
  return (
    <Modal
      open
      size="md"
      title={existing ? existing.name || 'Account' : 'Add an account'}
      onClose={onClose}
      footer={
        existing ? (
          <>
            <Menu
              trigger={<Button icon={MoreHorizontal}>More</Button>}
              items={[
                { label: a.archived ? 'Unarchive' : 'Archive (hide, keep history)', icon: Archive, onClick: () => set({ archived: !a.archived || undefined }) },
                { label: 'Make default account', icon: Star, disabled: f.settings.defaultAccountId === existing.id, onClick: () => updateFinance((fd) => void (fd.settings.defaultAccountId = existing.id)) },
                ...(existing.csvMapping ? [{ label: 'Forget saved CSV columns', onClick: () => set({ csvMapping: undefined }) }] : []),
                { separator: true },
                { label: 'Delete account (keep transactions)', icon: Trash2, onClick: () => void remove(false) },
                { label: `Delete with ${plural(txCount, 'transaction')}`, icon: Trash2, danger: true, disabled: !txCount, onClick: () => void remove(true) },
              ]}
            />
            <Button onClick={() => navigateSpace('transactions', { accountId: existing.id })} disabled={!txCount}>
              Transactions
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
            <Button variant="primary" disabled={!draft.name.trim()} onClick={add}>
              Add account
            </Button>
          </>
        )
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <FormGrid min={170}>
          <Field label="Name">
            <Input autoFocus={!existing} value={a.name} onChange={(name) => set({ name })} placeholder="e.g. Everyday Checking" onKeyDown={(e) => !existing && e.key === 'Enter' && add()} />
          </Field>
          <Field label="Type">
            <Select value={a.type} options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => set({ type: v as AccountType })} />
          </Field>
          <Field label="Bank / issuer">
            <Input value={a.institution ?? ''} onChange={(institution) => set({ institution })} placeholder="optional" />
          </Field>
          <Field label="Last 4 digits" hint="Never enter the full number">
            <Input value={a.last4 ?? ''} onChange={(v) => set({ last4: v.replace(/\D/g, '').slice(0, 4) || undefined })} placeholder="1234" inputMode="numeric" />
          </Field>
        </FormGrid>
        <FormGrid min={150}>
          <Field label={debt ? 'Amount owed' : 'Balance'}>
            <NumberInput value={a.balance} onChange={(balance) => set({ balance, ...(existing ? { balanceDate: todayISO() } : {}) })} decimals={2} />
          </Field>
          <Field label="Balance as of">
            <DateInput value={a.balanceDate} onChange={(balanceDate) => set({ balanceDate })} />
          </Field>
          {a.type === 'credit_card' && (
            <Field label="Credit limit">
              <NumberInput value={a.creditLimit} onChange={(creditLimit) => set({ creditLimit })} decimals={0} />
            </Field>
          )}
          <Field label={debt ? 'APR %' : 'Interest %'}>
            <NumberInput value={a.apr} onChange={(apr) => set({ apr })} />
          </Field>
          {debt && (
            <Field label="Minimum payment">
              <NumberInput value={a.minPayment} onChange={(minPayment) => set({ minPayment })} decimals={0} />
            </Field>
          )}
          {(a.type === 'credit_card' || a.type === 'loan' || a.type === 'checking') && (
            <Field label="Statement day">
              <NumberInput value={a.statementDay} onChange={(n) => set({ statementDay: n == null ? undefined : Math.max(1, Math.min(31, Math.round(n))) })} placeholder="1–31" />
            </Field>
          )}
        </FormGrid>
        <Field label="Budget" hint={isOnBudget(a) ? 'On budget: its money is assigned to categories on the Budget screen' : 'Tracking only: shows in net worth, ignored by the budget (money moved here needs a category, e.g. Savings)'}>
          <Switch checked={isOnBudget(a)} onChange={(onBudget) => set({ onBudget })} label={isOnBudget(a) ? 'On budget' : 'Tracking account'} />
        </Field>
        <Field label="Colour">
          <div className="fin-swatches">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} type="button" className={`fin-swatch ${(a.slot ?? 0) === i ? 'on' : ''}`} style={{ background: VIZ(i) }} onClick={() => set({ slot: i })} aria-label={`Colour ${i + 1}`} />
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <Textarea value={a.notes ?? ''} onChange={(notes) => set({ notes })} minRows={2} autoGrow placeholder="e.g. Autopay on the 23rd, 2% cashback on groceries" />
        </Field>
      </div>
    </Modal>
  );
}
