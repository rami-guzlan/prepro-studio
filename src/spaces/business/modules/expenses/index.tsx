/* Expenses: costs with categories, payment method, tax-deductible flag,
   receipts (drop files), recurring costs and links to productions / spaces. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { Copy, Paperclip, Plus, Receipt, Repeat, Tags, Trash2, Upload } from 'lucide-react';
import { useSpace } from '@/store/space';
import { safeFileName, plural } from '@/lib/text';
import { exportCsv } from '@/backend';
import { useProjectList } from '@/spaces/ui';
import { useFileDrop } from '@/spaces/modules/assets/resources';
import { Button, Card, Checkbox, DataTable, DateInput, EmptyState, ExportMenu, Field, Input, Modal, ModuleHeader, NumberInput, SearchInput, Select, Textarea, Toolbar, confirmDialog, toast, type Column, Combo } from '@/ui';
import { BarChart, BarList, StatTile } from '@/ui/charts';
import { PAYMENT_METHODS, type PeriodId } from '../../constants';
import { categoryOf, expenseRows, expensesByCategory, inRange, monthLabel, monthSeries, periodRange, recurringSeries, round2, sumAmount } from '../../derive';
import { addItem, logNextRecurring, makeExpense, newId, removeItems, updateItem } from '../../ops';
import { FileBox, droppedFiles, pickFiles } from '../../files';
import { CategoriesDialog } from '../../dialogs';
import { Money, PeriodSelect, categoryOptions, contractorOptions, useBiz, useFmt, useMarketingSpaces, useNavParams, useToday } from '../../ui';
import type { Expense, PaymentMethod } from '../../types';
import { ProjectSelect, initiativeOptions, projectName } from '../projects/link';

export default function ExpensesModule() {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const title = useSpace((s) => s.meta.title);
  const [period, setPeriod] = useState<PeriodId>('this_month');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [dedOnly, setDedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [received, setReceived] = useState(false);

  const add = (patch: Partial<Expense> = {}) => {
    const e = makeExpense({ category: cat || 'other', ...patch });
    addItem('expenses', e, 0);
    if (!inRange(e.date, periodRange(period, today))) setPeriod('this_month');
    setOpen(e.id);
    return e;
  };

  useNavParams((p) => {
    if (p.category) setCat(String(p.category));
    if (p.expenseId) {
      const hit = b.expenses.find((e) => e.id === p.expenseId);
      if (hit) {
        if (!inRange(hit.date, periodRange(period, today))) setPeriod('all');
        setOpen(hit.id);
      }
    }
    if (p.new) {
      setReceived(!!p.received);
      const link = {
        ...(p.bizProjectId && b.projects.some((x) => x.id === p.bizProjectId) ? { bizProjectId: String(p.bizProjectId) } : {}),
        ...(p.initiativeId && (b.initiatives ?? []).some((x) => x.id === p.initiativeId) ? { initiativeId: String(p.initiativeId) } : {}),
      };
      add(p.received ? { description: 'Invoice from ', category: 'contractors', ...link } : link);
    }
  });

  const range = periodRange(period, today);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return b.expenses
      .filter((e) => inRange(e.date, range) && (!cat || e.category === cat) && (!dedOnly || e.deductible) && (!s || [e.vendor, e.description, e.reference, e.notes, categoryOf(b, e.category).label].join(' ').toLowerCase().includes(s)))
      .sort((a, z) => z.date.localeCompare(a.date));
  }, [b, range.from, range.to, cat, dedOnly, q]);

  const allRows = useMemo(() => expenseRows(b).filter((x) => inRange(x.date, range)), [b, range.from, range.to]);
  const fromPayLog = allRows.filter((x) => x.source === 'payment');
  const total = sumAmount(list);
  const deductible = sumAmount(list.filter((e) => e.deductible));
  const missing = list.filter((e) => !(e.receipts?.length) && e.amount >= 75).length;
  const series = recurringSeries(b);
  const monthlyRecurring = round2(series.reduce((n, s) => n + (s.last.recurring === 'yearly' ? s.last.amount / 12 : s.last.amount), 0));
  const byCat = useMemo(() => expensesByCategory(b, range), [b, range.from, range.to]);
  const months = useMemo(() => monthSeries(b, today, 12), [b, today]);
  const vendors = useMemo(() => [...new Set(b.expenses.map((e) => e.vendor).filter(Boolean) as string[])].sort(), [b.expenses]);
  const dueRecurring = series.filter((s) => s.next <= today).sort((a, z) => a.next.localeCompare(z.next));

  const drop = useFileDrop(async (files) => {
    const made = await droppedFiles(files);
    if (!made.length) return;
    for (const f of made) {
      const e = makeExpense({ category: cat || 'other', description: f.fileName.replace(/\.[^.]+$/, ''), receipts: [f] });
      addItem('expenses', e, 0);
    }
    if (!inRange(today, range)) setPeriod('this_month');
    toast(`Created ${made.length} expense${made.length === 1 ? '' : 's'} from receipts — fill in the amounts`);
  });

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Expenses`), list, [
      { header: 'Date', value: (e) => e.date },
      { header: 'Vendor', value: (e) => e.vendor },
      { header: 'Description', value: (e) => e.description },
      { header: 'Category', value: (e) => categoryOf(b, e.category).label },
      { header: 'Amount', value: (e) => e.amount },
      { header: 'Method', value: (e) => PAYMENT_METHODS.find((m) => m.value === e.method)?.label },
      { header: 'Deductible', value: (e) => (e.deductible ? 'yes' : 'no') },
      { header: 'Recurring', value: (e) => e.recurring ?? '' },
      { header: 'Reference', value: (e) => e.reference },
      { header: 'Project', value: (e) => projectName(b, e.bizProjectId) },
      { header: 'Growth initiative', value: (e) => (b.initiatives ?? []).find((i) => i.id === e.initiativeId)?.title },
      { header: 'Receipts', value: (e) => e.receipts?.length ?? 0 },
    ]);
    if (path) toast(`Exported ${plural(list.length, 'expense')}`);
  };

  const cols: Column<Expense>[] = [
    { key: 'date', header: 'Date', type: 'date', width: 140, footer: plural(list.length, 'expense') },
    { key: 'vendor', header: 'Vendor', type: 'combo', suggestions: vendors, width: 160, placeholder: 'Vendor' },
    { key: 'description', header: 'Description', type: 'text', minWidth: 160, placeholder: 'What for' },
    { key: 'category', header: 'Category', type: 'select', options: categoryOptions(b), width: 170 },
    { key: 'amount', header: 'Amount', type: 'money', width: 120, footer: fmt.money(total) },
    { key: 'method', header: 'Paid with', type: 'select', options: PAYMENT_METHODS, width: 130 },
    { key: 'deductible', header: 'Deductible', type: 'checkbox', width: 86, align: 'center' },
    {
      key: 'recurring',
      header: 'Repeats',
      width: 110,
      render: (e) => (
        <Select bare size="sm" value={e.recurring ?? ''} placeholder="—" options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} onChange={(v) => updateItem('expenses', e.id, { recurring: (v || undefined) as Expense['recurring'] }, false)} />
      ),
    },
    {
      key: 'bizProjectId',
      header: 'Project',
      width: 160,
      render: (e) => <ProjectSelect bare size="sm" placeholder="—" value={e.bizProjectId} onChange={(id) => updateItem('expenses', e.id, { bizProjectId: id }, false)} />,
    },
    {
      key: 'receipts',
      header: 'Receipt',
      width: 80,
      align: 'center',
      render: (e) => (
        <button type="button" className={`biz-receipt-btn ${e.receipts?.length ? 'has' : ''}`} onClick={() => setOpen(e.id)} title={e.receipts?.length ? `${e.receipts.length} file(s)` : 'Attach a receipt'}>
          <Paperclip size={13} />
          {e.receipts?.length ? e.receipts.length : ''}
        </button>
      ),
    },
  ];

  const openExp = b.expenses.find((e) => e.id === open);

  return (
    <div className={`module biz ${drop.over ? 'biz-dropping' : ''}`} {...drop.props}>
      <ModuleHeader
        title="Expenses"
        icon={Receipt}
        subtitle={`${fmt.money(total)} · ${range.label.toLowerCase()}${cat ? ` · ${categoryOf(b, cat).label}` : ''}`}
        actions={
          <>
            <Button icon={Tags} onClick={() => setCatsOpen(true)}>
              Categories
            </Button>
            <ExportMenu docs={[{ id: 'space-biz-expenses', label: 'Expense report', options: { period, category: cat ? categoryOf(b, cat).label : '' } }]} csv={[{ label: 'Expenses (CSV)', onClick: () => void exportList() }]} />
            <Button variant="primary" icon={Plus} onClick={() => add()}>
              Add expense
            </Button>
          </>
        }
      />
      <Toolbar>
        <PeriodSelect value={period} onChange={setPeriod} />
        <Select size="sm" value={cat} placeholder="All categories" options={categoryOptions(b)} onChange={setCat} aria-label="Category" />
        <Checkbox checked={dedOnly} onChange={setDedOnly} label="Deductible only" />
        <div className="spacer" />
        <SearchInput value={q} onChange={setQ} placeholder="Search vendor, note…" width={200} />
      </Toolbar>
      <div className="module-body">
        <div className="biz-page">
          <div className="biz-kpis">
            <StatTile label={`Spent · ${range.label.toLowerCase()}`} value={fmt.money(total, { cents: false })} sub={plural(list.length, 'expense')} />
            <StatTile label="Tax-deductible" value={fmt.money(deductible, { cents: false })} sub={total ? `${Math.round((deductible / total) * 100)}% of spend` : undefined} />
            <StatTile label="Recurring costs" value={`${fmt.money(monthlyRecurring, { cents: false })}/mo`} sub={`${series.length} subscriptions & bills`} />
            <StatTile label="Missing receipts" value={String(missing)} sub="expenses ≥ 75 without a file" deltaGood={missing ? false : undefined} />
          </div>

          {dueRecurring.length > 0 && (
            <Card title="Recurring costs due" actions={<span className="muted small">log this period’s charge in one click</span>}>
              <div className="biz-list">
                {dueRecurring.map(({ last, next }) => (
                  <div key={last.id} className="biz-list-row static">
                    <Repeat size={14} className="muted" />
                    <span className="biz-grow ellipsis">
                      <b>{last.vendor || last.description || 'Recurring expense'}</b> <span className="muted small">· {last.recurring} · due {fmt.dateShort(next)}</span>
                    </span>
                    <Money value={last.amount} />
                    <Button
                      size="sm"
                      icon={Copy}
                      onClick={() => {
                        const id = logNextRecurring(last.id);
                        if (id) toast(`Logged ${last.vendor || 'the charge'} for ${fmt.dateShort(next)}`);
                      }}
                    >
                      Log
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="biz-grid-2">
            <Card title="By category">
              <BarList rows={byCat.map((c) => ({ id: c.id, label: c.label, value: c.amount, color: c.color }))} format={(v) => fmt.money(v, { cents: false })} empty="No expenses in this period" onSelect={(id) => setCat(id)} />
            </Card>
            <Card title="Per month · last 12 months">
              <BarChart ariaLabel="Expenses per month" slot={1} data={months.map((m) => ({ label: monthLabel(m.month), title: monthLabel(m.month, true), value: m.expenses }))} yFormat={(v) => fmt.money(v, { cents: false })} />
            </Card>
          </div>

          {b.expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Track what the business spends"
              description="Add expenses as they happen or drop receipts (PDF, photos) anywhere on this screen — each becomes an expense with the file attached."
              action={
                <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                  <Button variant="primary" icon={Plus} onClick={() => add()}>
                    Add expense
                  </Button>
                  <Button
                    icon={Upload}
                    onClick={async () => {
                      const files = await pickFiles('Choose receipts');
                      for (const f of files) addItem('expenses', makeExpense({ description: f.fileName.replace(/\.[^.]+$/, ''), receipts: [f] }), 0);
                      if (files.length) toast(`Created ${files.length} expense${files.length === 1 ? '' : 's'} — fill in the amounts`);
                    }}
                  >
                    Upload receipts
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              <DataTable<Expense>
                rows={list}
                columns={cols}
                onChange={(id, patch) => updateItem('expenses', id, patch, true)}
                onRowClick={(e) => setOpen(e.id)}
                selectedId={open ?? undefined}
                rowActions={(e) => [
                  { label: 'Details & receipts…', icon: Paperclip, onClick: () => setOpen(e.id) },
                  { label: 'Duplicate', icon: Copy, onClick: () => { const { paymentId: _p, ...rest } = e; addItem('expenses', { ...rest, id: newId('expenses'), receipts: [] }, b.expenses.findIndex((x) => x.id === e.id) + 1); } },
                  ...(e.recurring ? [{ label: 'Log next occurrence', icon: Repeat, onClick: () => logNextRecurring(e.id) }] : []),
                  { separator: true },
                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItems('expenses', [e.id]) },
                ]}
                emptyText="No expenses match."
                showFooter
                style={{ maxHeight: 'none' }}
              />
              <p className="muted small" style={{ margin: 0 }}>
                Tip: drop receipts anywhere on this screen to create expenses.{fromPayLog.length ? ` ${fromPayLog.length} paid contractor payment${fromPayLog.length === 1 ? '' : 's'} from the pay log also count (${fmt.money(sumAmount(fromPayLog))}).` : ''}
              </p>
            </>
          )}
        </div>
      </div>
      {openExp && <ExpenseDialog e={openExp} received={received} onClose={() => { setOpen(null); setReceived(false); }} vendors={vendors} />}
      <CategoriesDialog open={catsOpen} onClose={() => setCatsOpen(false)} />
      {drop.over && <div className="biz-drop-hint">Drop receipts to create expenses</div>}
    </div>
  );
}

function ExpenseDialog({ e, onClose, vendors, received }: { e: Expense; onClose: () => void; vendors: string[]; received: boolean }) {
  const b = useBiz();
  const projects = useProjectList();
  const spaces = useMarketingSpaces();
  const up = (patch: Partial<Expense>, coalesce = true) => updateItem('expenses', e.id, patch, coalesce);
  const payment = e.paymentId ? b.payments.find((p) => p.id === e.paymentId) : undefined;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={received ? 'Received invoice' : e.vendor || e.description || 'Expense'}
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              if (await confirmDialog({ title: 'Delete this expense?', message: 'You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true })) {
                removeItems('expenses', [e.id]);
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
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="biz-form">
          <Field label="Date">
            <DateInput value={e.date} onChange={(v) => v && up({ date: v }, false)} />
          </Field>
          <Field label="Amount">
            <NumberInput autoFocus decimals={2} value={e.amount} onChange={(v) => up({ amount: v ?? 0 })} />
          </Field>
          <Field label="Vendor">
            <Combo value={e.vendor} suggestions={vendors} placeholder="Who you paid" onChange={(v) => up({ vendor: v || undefined })} />
          </Field>
          <Field label="Category">
            <Select value={e.category} options={categoryOptions(b)} onChange={(v) => up({ category: v }, false)} />
          </Field>
          <Field label="Description" span="all">
            <Input value={e.description} placeholder="What it was for" onChange={(v) => up({ description: v || undefined })} />
          </Field>
          <Field label="Paid with">
            <Select value={e.method ?? ''} placeholder="—" options={PAYMENT_METHODS} onChange={(v) => up({ method: (v || undefined) as PaymentMethod | undefined }, false)} />
          </Field>
          <Field label={received ? 'Their invoice number' : 'Reference / receipt no.'}>
            <Input autoFocus={received} value={e.reference} onChange={(v) => up({ reference: v || undefined })} />
          </Field>
          <Field label="Repeats">
            <Select value={e.recurring ?? ''} placeholder="Does not repeat" options={[{ value: 'monthly', label: 'Every month' }, { value: 'yearly', label: 'Every year' }]} onChange={(v) => up({ recurring: (v || undefined) as Expense['recurring'] }, false)} />
          </Field>
          <Field label="Project">
            <ProjectSelect value={e.bizProjectId} onChange={(id) => up({ bizProjectId: id }, false)} />
          </Field>
          <Field label="Growth initiative" hint={(b.initiatives ?? []).length ? undefined : 'Plan initiatives in Growth'}>
            <Select value={e.initiativeId ?? ''} placeholder={(b.initiatives ?? []).length ? 'None' : 'No initiatives yet'} options={initiativeOptions(b)} onChange={(v) => up({ initiativeId: v || undefined }, false)} />
          </Field>
          <Field label="Contractor">
            <Select value={e.contractorId ?? ''} placeholder="—" options={contractorOptions(b)} onChange={(v) => up({ contractorId: v || undefined }, false)} />
          </Field>
          <Field label="For production / space">
            <Select
              value={e.projectId ? `p:${e.projectId}` : e.spaceId ? `s:${e.spaceId}` : ''}
              placeholder="None"
              options={[...projects.filter((p) => !p.demo).map((p) => ({ value: `p:${p.id}`, label: `🎬 ${p.title}` })), ...spaces.filter((s) => !s.demo).map((s) => ({ value: `s:${s.id}`, label: `📣 ${s.title}` }))]}
              onChange={(v) => up({ projectId: v.startsWith('p:') ? v.slice(2) : undefined, spaceId: v.startsWith('s:') ? v.slice(2) : undefined }, false)}
            />
          </Field>
          <Field label=" ">
            <Checkbox checked={e.deductible} onChange={(v) => up({ deductible: v }, false)} label="Tax-deductible business expense" />
          </Field>
          <Field label="Notes" span="all">
            <Textarea autoGrow minRows={2} value={e.notes} onChange={(v) => up({ notes: v || undefined })} />
          </Field>
        </div>
        {payment && <div className="biz-note">Created from a contractor payment in the pay log. Changing the payment back to unpaid removes this expense.</div>}
        <FileBox target={{ list: 'expenses', id: e.id, field: 'receipts' }} files={e.receipts} label={received ? 'Invoice file' : 'Receipts'} empty="Drop the receipt or invoice (PDF, photo) here." />
      </div>
    </Modal>
  );
}

