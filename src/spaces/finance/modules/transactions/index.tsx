/* Transactions: fast filterable table (search, account, category, month range,
   uncategorised only, money in / out), inline category, bulk actions (category,
   transfer, rule from a merchant, delete) and an editor per transaction. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowLeftRight, FileUp, ListChecks, Plus, Repeat, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
import { navigateSpace, useApp } from '@/store/app';
import { plural } from '@/lib/text';
import { Button, Checkbox, confirmDialog, EmptyState, ExportMenu, Input, ModuleHeader, SearchInput, Select, Tabs, toast, Toolbar } from '@/ui';
import type { FinTransaction } from '../../types';
import { accountLabel, merchantOf, monthOf, round2 } from '../../calc';
import { applyRules, deleteTransactions, setCategory, setFlag, suggestRuleText } from '../../ops';
import { RuleModal, type RuleDraft } from '../../RuleModal';
import { TxModal } from '../../TxModal';
import { Amount, CategorySelect, categoryOptions, exportTransactionsCsv, FinPage, useAccountMap, useCatMap, useFinance, useFmt } from '../../ui';

type Direction = 'all' | 'in' | 'out';
const PAGE = 200;

interface Filters {
  search: string;
  accountId: string;
  category: string;
  from: string;
  to: string;
  direction: Direction;
  uncategorized: boolean;
  statementId: string;
}
const NONE: Filters = { search: '', accountId: '', category: '', from: '', to: '', direction: 'all', uncategorized: false, statementId: '' };

export default function TransactionsModule() {
  const f = useFinance();
  const fmt = useFmt();
  const cats = useCatMap();
  const accts = useAccountMap();
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [flt, setFlt] = useState<Filters>(NONE);
  const [sort, setSort] = useState<{ key: 'date' | 'amount'; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const [rule, setRule] = useState<RuleDraft | null>(null);
  const sd = f.settings.monthStartDay;

  // filters from navigation (overview, budgets, agents' show_in_app)
  useEffect(() => {
    const p = params ?? {};
    if (!Object.keys(p).length) return;
    setFlt({
      ...NONE,
      search: typeof p.search === 'string' ? p.search : '',
      accountId: typeof p.accountId === 'string' ? p.accountId : '',
      category: typeof p.category === 'string' ? p.category : '',
      from: typeof p.month === 'string' ? p.month : typeof p.from === 'string' ? p.from : '',
      to: typeof p.month === 'string' ? p.month : typeof p.to === 'string' ? p.to : '',
      direction: p.direction === 'in' || p.direction === 'out' ? p.direction : 'all',
      uncategorized: p.uncategorized === true || p.uncategorized === 'true',
      statementId: typeof p.statementId === 'string' ? p.statementId : '',
    });
    if (typeof p.transactionId === 'string') setEdit(p.transactionId);
    setSel(new Set());
    setLimit(PAGE);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Filters>) => {
    setFlt((x) => ({ ...x, ...p }));
    setLimit(PAGE);
  };

  const rows = useMemo(() => {
    const q = flt.search.trim().toLowerCase();
    const out = f.transactions.filter((t) => {
      if (flt.accountId && t.accountId !== flt.accountId) return false;
      if (flt.uncategorized ? !!t.category || t.transfer : flt.category && t.category !== flt.category) return false;
      if (flt.statementId && t.statementId !== flt.statementId) return false;
      if (flt.direction === 'in' && t.amount <= 0) return false;
      if (flt.direction === 'out' && t.amount >= 0) return false;
      if (flt.from || flt.to) {
        const m = monthOf(t.date, sd);
        if (flt.from && m < flt.from) return false;
        if (flt.to && m > flt.to) return false;
      }
      if (q) {
        const hay = `${t.description} ${t.merchant ?? ''} ${t.notes ?? ''} ${(t.tags ?? []).join(' ')} ${t.category ? cats.get(t.category)?.name ?? '' : ''} ${Math.abs(t.amount).toFixed(2)}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    out.sort((a, b) => (sort.key === 'date' ? a.date.localeCompare(b.date) || a.amount - b.amount : a.amount - b.amount || a.date.localeCompare(b.date)) * sort.dir);
    return out;
  }, [f.transactions, flt, sort, sd, cats]);

  const sums = useMemo(() => {
    let inn = 0;
    let out = 0;
    for (const t of rows) if (t.amount > 0) inn += t.amount;
    else out += t.amount;
    return { inn: round2(inn), out: round2(out), net: round2(inn + out) };
  }, [rows]);

  const visible = rows.slice(0, limit);
  const selected = useMemo(() => rows.filter((t) => sel.has(t.id)), [rows, sel]);
  const allSel = rows.length > 0 && selected.length === rows.length;
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const active = JSON.stringify(flt) !== JSON.stringify(NONE);
  const catOpts = useMemo(() => categoryOptions(f.categories), [f.categories]);
  const statement = flt.statementId ? f.statements.find((s) => s.id === flt.statementId) : undefined;

  const merchantsOfSel = [...new Set(selected.map((t) => merchantOf(t)))];
  const bulkRule = () => {
    const t = selected[0];
    if (!t) return;
    setRule({ match: suggestRuleText(t), category: t.category, rename: merchantsOfSel.length === 1 ? merchantOf(t) : undefined });
  };

  if (!f.transactions.length) {
    return (
      <div className="module">
        <ModuleHeader title="Transactions" icon={ListChecks} actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add transaction</Button>} />
        <div className="module-body padded">
          <EmptyState
            icon={ListChecks}
            title="No transactions yet"
            description="Import a statement from your bank or card (CSV, OFX/QFX or PDF), let a connected AI agent import them from your email, or add transactions by hand."
            action={
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" icon={FileUp} onClick={() => navigateSpace('import')}>
                  Import statements
                </Button>
                <Button icon={Plus} onClick={() => setEdit('new')}>
                  Add by hand
                </Button>
              </div>
            }
          />
        </div>
        {edit && <TxModal id={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      </div>
    );
  }

  const sortHead = (key: 'date' | 'amount', label: string, cls?: string) => (
    <th className={`clickable ${cls ?? ''}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'date' ? -1 : 1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : <ArrowDownUp size={10} style={{ opacity: 0.4 }} />}
    </th>
  );

  return (
    <div className="module">
      <ModuleHeader
        title="Transactions"
        icon={ListChecks}
        subtitle={`${plural(rows.length, 'transaction')}${active ? ' (filtered)' : ''} · in ${fmt.money(sums.inn)} · out ${fmt.money(-sums.out)}`}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-fin-transactions', label: 'Transaction list', options: { from: flt.from, to: flt.to } }]} csv={[{ label: `These ${plural(rows.length, 'transaction')} (CSV)`, onClick: () => void exportTransactionsCsv(rows, active ? 'Transactions (filtered)' : 'Transactions') }]} />
            <Button icon={Plus} onClick={() => setEdit('new')}>
              Add
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={flt.search} onChange={(search) => set({ search })} placeholder="Search description, notes, amount…" width="min(260px, 100%)" />
        <Select size="sm" value={flt.accountId} placeholder="All accounts" options={f.accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))} onChange={(accountId) => set({ accountId })} title="Account" style={{ width: 'auto', maxWidth: 220 }} />
        <Select size="sm" value={flt.category} placeholder="All categories" options={catOpts} onChange={(category) => set({ category, uncategorized: false })} disabled={flt.uncategorized} title="Category" style={{ width: 'auto', maxWidth: 220 }} />
        <div className="row" style={{ gap: 4 }} title="Month range">
          <Input size="sm" type="month" value={flt.from} onChange={(from) => set({ from, to: flt.to && from && flt.to < from ? from : flt.to })} aria-label="From month" style={{ width: 132 }} />
          <span className="muted">–</span>
          <Input size="sm" type="month" value={flt.to} onChange={(to) => set({ to })} aria-label="To month" style={{ width: 132 }} />
        </div>
        <Tabs
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'in', label: 'Money in' },
            { id: 'out', label: 'Money out' },
          ]}
          value={flt.direction}
          onChange={(direction) => set({ direction })}
        />
        <Checkbox checked={flt.uncategorized} onChange={(uncategorized) => set({ uncategorized, category: '' })} label="Uncategorised only" />
        {active && (
          <Button size="sm" variant="ghost" icon={X} onClick={() => set(NONE)}>
            Clear
          </Button>
        )}
      </Toolbar>
      <div className="module-body">
        <FinPage>
          {statement && (
            <div className="fin-notice info">
              <FileUp size={15} />
              <span>
                Showing transactions imported from <b>{statement.name || statement.fileName || 'a statement'}</b>.{' '}
                <button type="button" className="fin-link" onClick={() => set({ statementId: '' })}>
                  Show all
                </button>
              </span>
            </div>
          )}
          {selected.length > 0 && (
            <div className="fin-bulk">
              <b>{plural(selected.length, 'selected')}</b>
              <div style={{ width: 200, maxWidth: '100%' }}>
                <CategorySelect
                  size="sm"
                  value={undefined}
                  placeholder="Set category…"
                  onChange={(c) => {
                    if (!c) return;
                    setCategory(selected.map((t) => t.id), c);
                    toast(`${plural(selected.length, 'transaction')} → ${cats.get(c)?.name ?? c}`);
                  }}
                />
              </div>
              <Button size="sm" icon={Sparkles} onClick={bulkRule} title="Create a rule from the merchant so future imports are categorised">
                Create rule
              </Button>
              <Button size="sm" icon={ArrowLeftRight} onClick={() => setFlag(selected.map((t) => t.id), 'transfer', !selected.every((t) => t.transfer))}>
                {selected.every((t) => t.transfer) ? 'Not a transfer' : 'Mark transfer'}
              </Button>
              <Button size="sm" icon={Repeat} onClick={() => setFlag(selected.map((t) => t.id), 'recurring', !selected.every((t) => t.recurring))}>
                {selected.every((t) => t.recurring) ? 'Not recurring' : 'Mark recurring'}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const n = applyRules('all', selected.map((t) => t.id));
                  toast(n ? `Re-categorised ${plural(n, 'transaction')}` : 'Rules and keywords found nothing new', n ? 'success' : 'info');
                }}
              >
                Auto-categorise
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                onClick={async () => {
                  if (!(await confirmDialog({ title: `Delete ${plural(selected.length, 'transaction')}?`, message: 'You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true }))) return;
                  deleteTransactions(selected.map((t) => t.id));
                  setSel(new Set());
                }}
              >
                Delete
              </Button>
              <div className="spacer" />
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
                Clear selection
              </Button>
            </div>
          )}
          {rows.length === 0 ? (
            <EmptyState icon={ListChecks} title="No transactions match" description="Try another month, account or category." action={<Button onClick={() => set(NONE)}>Clear filters</Button>} />
          ) : (
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th className="chk">
                      <Checkbox checked={allSel} onChange={(v) => setSel(v ? new Set(rows.map((t) => t.id)) : new Set())} title="Select all" />
                    </th>
                    {sortHead('date', 'Date')}
                    <th>Description</th>
                    <th>Category</th>
                    <th>Account</th>
                    {sortHead('amount', 'Amount', 'num')}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <Row key={t.id} t={t} selected={sel.has(t.id)} onToggle={() => toggle(t.id)} onOpen={() => setEdit(t.id)} accountName={t.accountId ? accountLabel(accts.get(t.accountId)) : '—'} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td colSpan={4}>
                      {plural(rows.length, 'transaction')} · in <Amount value={sums.inn} /> · out <Amount value={sums.out} />
                    </td>
                    <td className="num">
                      <Amount value={sums.net} strong />
                    </td>
                  </tr>
                </tfoot>
              </table>
              {rows.length > limit && (
                <div className="fin-more">
                  <Button onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button>
                </div>
              )}
            </div>
          )}
        </FinPage>
      </div>
      {edit && <TxModal id={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {rule && <RuleModal initial={rule} onClose={() => setRule(null)} />}
    </div>
  );
}

function Row({ t, selected, onToggle, onOpen, accountName }: { t: FinTransaction; selected: boolean; onToggle: () => void; onOpen: () => void; accountName: string }) {
  const fmt = useFmt();
  const m = merchantOf(t);
  return (
    <tr className={selected ? 'sel' : undefined}>
      <td className="chk">
        <Checkbox checked={selected} onChange={onToggle} />
      </td>
      <td className="clickable" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>
        {fmt.date(t.date)}
      </td>
      <td className="clickable" onClick={onOpen}>
        <div className="fin-desc">
          <b>
            {m}{' '}
            <span className="fin-flags">
              {t.transfer && <ArrowLeftRight aria-label="Transfer" />}
              {t.recurring && <Repeat aria-label="Recurring" />}
              {t.notes && <StickyNote aria-label="Has notes" />}
            </span>
          </b>
          <span title={t.description}>{t.notes ? `${t.notes} · ` : ''}{m.toLowerCase() !== t.description.toLowerCase() ? t.description : (t.tags ?? []).join(', ')}</span>
        </div>
      </td>
      <td>
        <CategorySelect size="sm" bare value={t.category} onChange={(c) => setCategory([t.id], c)} title="Category" />
      </td>
      <td className="clickable small muted" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>
        {accountName}
      </td>
      <td className="num clickable" onClick={onOpen}>
        <Amount value={t.amount} strong={t.amount > 0} />
      </td>
    </tr>
  );
}
