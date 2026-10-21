/* Income: streams (client work, products, sponsorships, royalties, salary /
   equity …) and money received. Paid invoices count automatically. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { ExternalLink, HandCoins, Plus, Trash2, Waves } from 'lucide-react';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { safeFileName, plural } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Button, Card, DataTable, DateInput, EmptyState, ExportMenu, Field, IconButton, Input, ModuleHeader, NumberInput, Select, Switch, Tabs, Textarea, Toolbar, confirmDialog, toast, type Column } from '@/ui';
import { BarChart, BarList, StatTile, VIZ } from '@/ui/charts';
import { PAYMENT_METHODS, STREAM_TYPES, type PeriodId } from '../../constants';
import { clientLabel, inRange, incomeByStream, incomeRows, monthLabel, monthSeries, periodRange, sumAmount } from '../../derive';
import { addItem, makeIncome, makeStream, removeItems, updateItem } from '../../ops';
import { Money, PeriodSelect, clientOptions, streamOptions, useBiz, useFmt, useNavParams, useToday } from '../../ui';
import type { IncomeEntry, IncomeStream, PaymentMethod, StreamType } from '../../types';
import { ProjectPill, ProjectSelect, projectName } from '../projects/link';

type Tab = 'entries' | 'streams';

interface Row {
  id: string;
  date: string;
  amount: number;
  entry?: IncomeEntry;
  invoiceId?: string;
  streamId?: string;
  clientId?: string;
  bizProjectId?: string;
  description?: string;
}

export default function IncomeModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const fmt = useFmt();
  const today = useToday();
  const [tab, setTab] = useState<Tab>(() => readLS<Tab>(`prepro.biz.incomeTab.${spaceId}`, 'entries'));
  const [period, setPeriod] = useState<PeriodId>('ytd');
  const [stream, setStream] = useState('');
  const switchTab = (t: Tab) => {
    setTab(t);
    writeLS(`prepro.biz.incomeTab.${spaceId}`, t);
  };
  useNavParams((p) => {
    if (p.tab === 'streams' || p.tab === 'entries') switchTab(p.tab);
  });

  const range = periodRange(period, today);
  const rows: Row[] = useMemo(
    () =>
      incomeRows(b)
        .filter((r) => inRange(r.date, range) && (!stream || (stream === '_none' ? !r.streamId : r.streamId === stream)))
        .map((r) => ({ id: r.id, date: r.date, amount: r.amount, entry: r.source === 'entry' ? b.income.find((e) => e.id === r.id) : undefined, invoiceId: r.invoiceId, streamId: r.streamId, clientId: r.clientId, bizProjectId: r.bizProjectId, description: r.description }))
        .sort((a, z) => z.date.localeCompare(a.date)),
    [b, range.from, range.to, stream],
  );
  const total = sumAmount(rows);
  const byStream = useMemo(() => incomeByStream(b, range), [b, range.from, range.to]);
  const months = useMemo(() => monthSeries(b, today, 12), [b, today]);
  const expected = b.streams.filter((s) => s.active).reduce((n, s) => n + (s.expectedMonthly ?? 0), 0);

  const addEntry = () => {
    const e = makeIncome({ streamId: stream && stream !== '_none' ? stream : b.streams.find((s) => s.active)?.id });
    addItem('income', e, 0);
    if (!inRange(e.date, range)) setPeriod('this_month');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`.biz-income-table tr:first-child td:nth-child(3) input`)?.focus());
  };

  const addStream = () => {
    const s = makeStream({ name: 'New stream' });
    addItem('streams', s);
    switchTab('streams');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-stream="${s.id}"] input`)?.select());
  };

  const exportList = async () => {
    const path = await exportCsv(safeFileName('Income'), rows, [
      { header: 'Date', value: (r) => r.date },
      { header: 'Amount', value: (r) => r.amount },
      { header: 'Description', value: (r) => r.entry?.description ?? r.description },
      { header: 'Stream', value: (r) => b.streams.find((s) => s.id === r.streamId)?.name },
      { header: 'Client', value: (r) => clientLabel(b, r.clientId) },
      { header: 'Invoice', value: (r) => b.invoices.find((i) => i.id === r.invoiceId)?.number },
      { header: 'Project', value: (r) => projectName(b, r.bizProjectId) },
      { header: 'Method', value: (r) => PAYMENT_METHODS.find((m) => m.value === r.entry?.method)?.label },
    ]);
    if (path) toast(`Exported ${rows.length} income entries`);
  };

  const cols: Column<Row>[] = [
    {
      key: 'date',
      header: 'Date',
      width: 140,
      sortValue: (r) => r.date,
      render: (r) => (r.entry && !r.invoiceId ? <DateInput bare size="sm" value={r.entry.date} onChange={(v) => v && updateItem('income', r.id, { date: v })} /> : <span className="biz-cell-ro">{fmt.date(r.date)}</span>),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 130,
      align: 'right',
      sortValue: (r) => r.amount,
      render: (r) => (r.entry && !r.invoiceId ? <NumberInput bare size="sm" decimals={2} value={r.entry.amount} onChange={(v) => updateItem('income', r.id, { amount: v ?? 0 })} /> : <span className="biz-cell-ro biz-money biz-in">{fmt.money(r.amount)}</span>),
    },
    {
      key: 'description',
      header: 'Description',
      minWidth: 180,
      render: (r) =>
        r.entry ? (
          <Input bare size="sm" value={r.entry.description} placeholder="What it was for" onChange={(v) => updateItem('income', r.id, { description: v || undefined })} />
        ) : (
          <span className="biz-cell-ro">{r.description}</span>
        ),
    },
    {
      key: 'streamId',
      header: 'Stream',
      width: 170,
      render: (r) =>
        r.entry ? (
          <Select bare size="sm" value={r.entry.streamId ?? ''} placeholder="—" options={streamOptions(b)} onChange={(v) => updateItem('income', r.id, { streamId: v || undefined }, false)} />
        ) : (
          <span className="biz-cell-ro">{b.streams.find((s) => s.id === r.streamId)?.name ?? ''}</span>
        ),
    },
    {
      key: 'clientId',
      header: 'Client',
      width: 170,
      render: (r) =>
        r.entry && !r.invoiceId ? (
          <Select bare size="sm" value={r.entry.clientId ?? ''} placeholder="—" options={clientOptions(b, r.entry.clientId)} onChange={(v) => updateItem('income', r.id, { clientId: v || undefined }, false)} />
        ) : (
          <span className="biz-cell-ro">{clientLabel(b, r.clientId)}</span>
        ),
    },
    {
      key: 'bizProjectId',
      header: 'Project',
      width: 160,
      render: (r) =>
        r.entry && !r.invoiceId ? (
          <ProjectSelect bare size="sm" placeholder="—" value={r.entry.bizProjectId} onChange={(id) => updateItem('income', r.id, { bizProjectId: id }, false)} />
        ) : (
          <span className="biz-cell-ro" title={r.invoiceId ? 'Set on the invoice' : undefined}>
            <ProjectPill id={r.bizProjectId} />
          </span>
        ),
    },
    {
      key: 'method',
      header: 'Received via',
      width: 140,
      render: (r) => (r.entry ? <Select bare size="sm" value={r.entry.method ?? ''} placeholder="—" options={PAYMENT_METHODS} onChange={(v) => updateItem('income', r.id, { method: (v || undefined) as PaymentMethod | undefined }, false)} /> : null),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      width: 110,
      render: (r) => {
        const inv = b.invoices.find((i) => i.id === r.invoiceId);
        return inv ? (
          <button type="button" className="biz-link biz-mono" onClick={() => navigateSpace('invoices', { invoiceId: inv.id })} title="Open the invoice">
            {inv.number} <ExternalLink size={11} />
          </button>
        ) : null;
      },
    },
  ];

  return (
    <div className="module biz">
      <ModuleHeader
        title="Income"
        icon={HandCoins}
        subtitle={`${fmt.money(total)} · ${range.label.toLowerCase()}${expected ? ` · plan ${fmt.money(expected, { cents: false })}/month` : ''}`}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-biz-pl', label: 'Profit & Loss', options: { period } }]} csv={[{ label: 'Income (CSV)', onClick: () => void exportList() }]} />
            {tab === 'streams' ? (
              <Button variant="primary" icon={Plus} onClick={addStream}>
                New stream
              </Button>
            ) : (
              <Button variant="primary" icon={Plus} onClick={addEntry}>
                Log income
              </Button>
            )}
          </>
        }
      />
      <Toolbar>
        <Tabs<Tab>
          value={tab}
          onChange={switchTab}
          tabs={[
            { id: 'entries', label: 'Money in', count: b.income.length },
            { id: 'streams', label: 'Streams', count: b.streams.length },
          ]}
        />
        {tab === 'entries' && (
          <>
            <div className="spacer" />
            <PeriodSelect value={period} onChange={setPeriod} />
            <Select size="sm" value={stream} placeholder="All streams" options={[...streamOptions(b), { value: '_none', label: 'No stream' }]} onChange={setStream} aria-label="Stream" />
          </>
        )}
      </Toolbar>
      <div className="module-body">
        {tab === 'entries' ? (
          <div className="biz-page">
            <div className="biz-kpis">
              <StatTile label={`Income · ${range.label.toLowerCase()}`} value={fmt.money(total, { cents: false })} sub={plural(rows.length, 'payment')} />
              <StatTile label="This month" value={fmt.money(months[months.length - 1]?.income ?? 0, { cents: false })} sub={expected ? `plan ${fmt.money(expected, { cents: false })}` : undefined} />
              <StatTile label="Monthly average (12 mo)" value={fmt.money(sumAmount(months.map((m) => ({ amount: m.income }))) / 12, { cents: false })} />
            </div>
            <div className="biz-grid-2">
              <Card title="By stream">
                <BarList rows={byStream.map((x) => ({ id: x.id, label: x.label, value: x.amount, color: VIZ(x.id === '_none' ? 7 : Math.max(0, b.streams.findIndex((s) => s.id === x.id))) }))} format={(v) => fmt.money(v, { cents: false })} empty="No income in this period" onSelect={(id) => setStream(id)} />
              </Card>
              <Card title="Per month · last 12 months">
                <BarChart ariaLabel="Income per month" data={months.map((m) => ({ label: monthLabel(m.month), title: monthLabel(m.month, true), value: m.income }))} yFormat={(v) => fmt.money(v, { cents: false })} />
              </Card>
            </div>
            {b.income.length === 0 && !rows.length ? (
              <EmptyState
                icon={HandCoins}
                title="No income logged yet"
                description="Log payments you receive (sales, sponsorships, royalties, distributions). Invoices you mark as paid are added here automatically."
                action={
                  <Button variant="primary" icon={Plus} onClick={addEntry}>
                    Log income
                  </Button>
                }
              />
            ) : (
              <div className="biz-income-table">
                <DataTable<Row>
                  rows={rows}
                  columns={cols}
                  onDelete={(r) => {
                    if (!r.entry) {
                      toast('This income comes from a paid invoice — mark the invoice unpaid instead', 'info');
                      return;
                    }
                    removeItems('income', [r.id]);
                  }}
                  emptyText="No income in this period."
                />
                <p className="muted small" style={{ margin: '8px 2px' }}>
                  Rows with an invoice number come from paid invoices: change their date or amount on the invoice.
                </p>
              </div>
            )}
          </div>
        ) : (
          <StreamsTab />
        )}
      </div>
    </div>
  );
}

function StreamsTab() {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const month = periodRange('this_month', today);
  const ytd = periodRange('ytd', today);
  const inc = incomeRows(b);
  const up = (id: string, patch: Partial<IncomeStream>, coalesce = true) => updateItem('streams', id, patch, coalesce);
  const remove = async (s: IncomeStream) => {
    const used = b.income.filter((e) => e.streamId === s.id).length + b.invoices.filter((i) => i.streamId === s.id).length;
    if (used && !(await confirmDialog({ title: `Delete “${s.name || 'stream'}”?`, message: `${used} income entries and invoices keep their amounts but lose this stream. You can undo with Ctrl+Z.`, confirmLabel: 'Delete stream', danger: true }))) return;
    removeItems('streams', [s.id]);
  };
  if (!b.streams.length)
    return (
      <div className="biz-page">
        <EmptyState
          icon={Waves}
          title="What brings money in?"
          description="Add each income stream — client work, a product or course, sponsorships, royalties, salary or equity distributions — with what you expect per month."
          action={
            <Button variant="primary" icon={Plus} onClick={() => addItem('streams', makeStream({ name: 'Client work' }))}>
              Add a stream
            </Button>
          }
        />
      </div>
    );
  return (
    <div className="biz-page">
      <div className="biz-cards">
        {b.streams.map((s) => {
          const m = sumAmount(inc.filter((r) => r.streamId === s.id && inRange(r.date, month)));
          const y = sumAmount(inc.filter((r) => r.streamId === s.id && inRange(r.date, ytd)));
          const color = STREAM_TYPES.find((t) => t.value === s.type)?.color;
          return (
            <div key={s.id} className={`biz-card ${s.active ? '' : 'off'}`} data-stream={s.id} style={{ ['--cc' as string]: color }}>
              <div className="biz-card-head">
                <Input value={s.name} placeholder="Stream name" onChange={(v) => up(s.id, { name: v })} aria-label="Stream name" />
                <IconButton icon={Trash2} label="Delete stream" onClick={() => void remove(s)} />
              </div>
              <div className="biz-form biz-form-tight">
                <Field label="Type">
                  <Select value={s.type} options={STREAM_TYPES} onChange={(v) => up(s.id, { type: v as StreamType }, false)} />
                </Field>
                <Field label="Expected / month">
                  <NumberInput decimals={2} value={s.expectedMonthly} onChange={(v) => up(s.id, { expectedMonthly: v })} />
                </Field>
              </div>
              <div className="biz-card-stats">
                <div>
                  <span className="muted tiny">This month</span>
                  <Money value={m} strong />
                </div>
                <div>
                  <span className="muted tiny">Year to date</span>
                  <Money value={y} strong />
                </div>
                <Switch checked={s.active} onChange={(v) => up(s.id, { active: v }, false)} label="Active" />
              </div>
              <Textarea autoGrow minRows={1} value={s.notes} placeholder="Notes: platform, payout schedule, contract…" onChange={(v) => up(s.id, { notes: v || undefined })} />
            </div>
          );
        })}
      </div>
      <p className="muted small">{fmt.money(b.streams.filter((s) => s.active).reduce((n, s) => n + (s.expectedMonthly ?? 0), 0))} expected per month from active streams.</p>
    </div>
  );
}

