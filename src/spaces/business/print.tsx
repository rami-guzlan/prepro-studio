/* Printable documents of business spaces (PDF / print). */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { KV, PBadge, PSection, PTable, Pre } from '@/print/components';
import { PERIODS, PAYMENT_METHODS, PAYMENT_STATUSES, RATE_TYPES, STREAM_TYPES, TAX_FORM_STATUSES, type PeriodId } from './constants';
import {
  arAging,
  bizOf,
  categoryOf,
  clientLabel,
  clientName,
  contractorBalance,
  entryRate,
  entryValue,
  expenseRows,
  expensesByCategory,
  findInvoice,
  formatDuration,
  inRange,
  incomeByClient,
  incomeByStream,
  incomeRows,
  invoiceStatus,
  invoiceTotals,
  monthKey,
  monthLabel,
  periodRange,
  profitLoss,
  round2,
  sumAmount,
} from './derive';
import type { BusinessData, Invoice, LegalDoc, TimeEntry } from './types';
import { buildLegal, longDate } from './templates';
import { LEGAL_PRINT_CSS, LegalDocView } from './LegalDocView';

const periodChoices = PERIODS.map((p) => ({ value: p.value, label: p.label }));
const optLabel = (opts: { value: string; label: string }[], v?: string) => opts.find((o) => o.value === v)?.label ?? v ?? '';

const BIZ_CSS = `
.bz-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 4pt; }
.bz-kpi { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 6pt 8pt; }
.bz-kpi .k { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #777; }
.bz-kpi .v { font-size: 13pt; font-weight: 700; margin-top: 2pt; font-variant-numeric: tabular-nums; }
.bz-kpi .s { font-size: 7pt; color: #777; }
.bz-pos { color: #1e8a4c; }
.bz-neg { color: #c92a2a; }
.bz-bar { display: inline-block; height: 6pt; border-radius: 2pt; background: #4c6ef5; vertical-align: middle; }
.bz-swatch { display: inline-block; width: 7pt; height: 7pt; border-radius: 2pt; margin-right: 4pt; vertical-align: -0.5pt; }
.bz-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; }
`;

function money(ctx: SpacePrintContext, n: number) {
  return ctx.fmt.money(n);
}

function Kpis({ items }: { items: { k: string; v: string; s?: string; tone?: 'pos' | 'neg' }[] }) {
  return (
    <div className="bz-kpis pp-avoid">
      {items.map((x, i) => (
        <div key={i} className="bz-kpi">
          <div className="k">{x.k}</div>
          <div className={`v ${x.tone === 'pos' ? 'bz-pos' : x.tone === 'neg' ? 'bz-neg' : ''}`}>{x.v}</div>
          {x.s && <div className="s">{x.s}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- invoice */

const INVOICE_CSS = `
.iv { font-size: 9.5pt; }
.iv-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20pt; margin-bottom: 22pt; }
.iv-brand { min-width: 0; }
.iv-logo { max-height: 46pt; max-width: 160pt; object-fit: contain; display: block; margin-bottom: 8pt; }
.iv-biz { font-size: 13pt; font-weight: 700; }
.iv-addr { color: #555; white-space: pre-wrap; margin-top: 3pt; line-height: 1.45; }
.iv-title { text-align: right; }
.iv-title h1 { font-size: 26pt; letter-spacing: 0.08em; font-weight: 800; color: var(--pp-accent, #222); }
.iv-no { font-size: 11pt; font-weight: 700; margin-top: 2pt; }
.iv-ref { color: #555; margin-top: 2pt; }
.iv-meta { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20pt; margin-bottom: 18pt; }
.iv-label { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 3pt; }
.iv-billto b { font-size: 10.5pt; }
.iv-dates { display: grid; grid-template-columns: auto auto; gap: 3pt 14pt; justify-content: end; align-content: start; }
.iv-dates span { color: #777; text-align: right; }
.iv-dates b { text-align: right; font-variant-numeric: tabular-nums; }
.iv-lines th:first-child, .iv-lines td:first-child { padding-left: 0; }
.iv-lines td { padding-top: 6pt; padding-bottom: 6pt; }
.iv-lines th { background: none; border-bottom: 1.2pt solid #222; color: #222; }
.iv-sum { display: flex; justify-content: flex-end; margin-top: 10pt; }
.iv-sum table { border-collapse: collapse; min-width: 210pt; }
.iv-sum td { padding: 3pt 0 3pt 18pt; text-align: right; font-variant-numeric: tabular-nums; }
.iv-sum td:first-child { color: #555; padding-left: 0; text-align: left; }
.iv-sum tr.total td { border-top: 1.2pt solid #222; font-size: 12pt; font-weight: 800; padding-top: 6pt; color: #111; }
.iv-sum tr.due td { font-weight: 700; color: #111; }
.iv-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt; margin-top: 24pt; break-inside: avoid; page-break-inside: avoid; }
.iv-stamp { display: inline-block; border: 2pt solid #1e8a4c; color: #1e8a4c; font-weight: 800; letter-spacing: 0.12em; padding: 2pt 8pt; border-radius: 3pt; font-size: 11pt; transform: rotate(-4deg); margin-top: 6pt; }
.iv-stamp.void { border-color: #999; color: #999; }
.iv-stamp.overdue { border-color: #c92a2a; color: #c92a2a; }
.iv-tax { color: #777; font-size: 8pt; margin-top: 4pt; }
.iv-thanks { margin-top: 22pt; text-align: center; color: #555; }
`;

function pickInvoice(b: BusinessData, ref: string): Invoice | undefined {
  if (ref?.trim()) return findInvoice(b, ref.trim());
  const list = b.invoices.filter((i) => i.status !== 'void');
  return [...(list.length ? list : b.invoices)].sort((a, z) => (z.issueDate || '').localeCompare(a.issueDate || '') || z.number.localeCompare(a.number))[0];
}

function InvoiceBody({ ctx, inv }: { ctx: SpacePrintContext; inv: Invoice }) {
  const s = ctx.space;
  const b = bizOf(s);
  const p = b.profile;
  const t = invoiceTotals(inv);
  const client = b.clients.find((c) => c.id === inv.clientId);
  const st = invoiceStatus(inv, ctx.todayISO);
  const logo = s.meta.logo ? ctx.asset(s.meta.logo) : '';
  const fromLines = [p.address, [p.email, p.phone].filter(Boolean).join(' · '), p.website].filter(Boolean).join('\n');
  const toLines = client ? [client.company && client.name ? client.company : '', client.address, client.email].filter(Boolean).join('\n') : '';
  return (
    <div className="iv">
      <div className="iv-top">
        <div className="iv-brand">
          {logo && <img className="iv-logo" src={logo} alt="" />}
          <div className="iv-biz">{p.legalName || s.meta.title}</div>
          {fromLines && <div className="iv-addr">{fromLines}</div>}
          {p.taxId && <div className="iv-tax">Tax ID: {p.taxId}</div>}
        </div>
        <div className="iv-title">
          <h1>INVOICE</h1>
          <div className="iv-no">{inv.number || 'Draft'}</div>
          {inv.title && <div className="iv-ref">{inv.title}</div>}
          {st === 'paid' && <div className="iv-stamp">PAID</div>}
          {st === 'void' && <div className="iv-stamp void">VOID</div>}
          {st === 'overdue' && <div className="iv-stamp overdue">OVERDUE</div>}
        </div>
      </div>
      <div className="iv-meta">
        <div className="iv-billto">
          <div className="iv-label">Bill to</div>
          <b>{client ? client.name || client.company : '—'}</b>
          {toLines && <div className="iv-addr">{toLines}</div>}
        </div>
        <div className="iv-dates">
          <span>Invoice date</span>
          <b>{ctx.fmt.dateMedium(inv.issueDate)}</b>
          {inv.dueDate && (
            <>
              <span>Due date</span>
              <b>{ctx.fmt.dateMedium(inv.dueDate)}</b>
            </>
          )}
          {inv.status === 'paid' && inv.paidDate && (
            <>
              <span>Paid</span>
              <b>{ctx.fmt.dateMedium(inv.paidDate)}</b>
            </>
          )}
          <span>Amount due</span>
          <b>{money(ctx, inv.status === 'paid' || inv.status === 'void' ? 0 : t.total)}</b>
        </div>
      </div>
      <PTable
        className="iv-lines"
        rows={inv.lines}
        empty="No line items."
        columns={[
          { header: 'Description', cell: (l) => <span style={{ whiteSpace: 'pre-wrap' }}>{l.description}</span> },
          { header: 'Qty', width: '10%', num: true, cell: (l) => ctx.fmt.number(l.qty, Number.isInteger(l.qty) ? 0 : 2) },
          { header: 'Unit price', width: '17%', num: true, cell: (l) => money(ctx, l.unitPrice) },
          { header: 'Amount', width: '17%', num: true, cell: (l) => money(ctx, round2(l.qty * l.unitPrice)) },
        ]}
      />
      <div className="iv-sum pp-avoid">
        <table>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{money(ctx, t.subtotal)}</td>
            </tr>
            {t.discount > 0 && (
              <tr>
                <td>Discount</td>
                <td>−{money(ctx, t.discount)}</td>
              </tr>
            )}
            {(inv.taxPct ?? 0) > 0 && (
              <tr>
                <td>Tax ({inv.taxPct}%)</td>
                <td>{money(ctx, t.tax)}</td>
              </tr>
            )}
            <tr className="total">
              <td>Total</td>
              <td>{money(ctx, t.total)}</td>
            </tr>
            {inv.status === 'paid' && (
              <tr className="due">
                <td>Balance due</td>
                <td>{money(ctx, 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(inv.paymentInstructions || inv.notes) && (
        <div className="iv-foot">
          <div>
            {inv.paymentInstructions && (
              <>
                <div className="iv-label">Payment instructions</div>
                <Pre>{inv.paymentInstructions}</Pre>
              </>
            )}
          </div>
          <div>
            {inv.notes && (
              <>
                <div className="iv-label">Notes</div>
                <Pre>{inv.notes}</Pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- time */

function filterTime(b: BusinessData, ctx: SpacePrintContext): { rows: TimeEntry[]; label: string; client?: string } {
  const r = periodRange(ctx.options.period as PeriodId, ctx.todayISO);
  const ref = String(ctx.options.client ?? '').trim().toLowerCase();
  const client = ref ? b.clients.find((c) => c.id === ref || clientName(c).toLowerCase() === ref || (c.company ?? '').toLowerCase() === ref || clientName(c).toLowerCase().includes(ref)) : undefined;
  const rows = b.time
    .filter((t) => inRange(t.date, r) && (!ref || (client && t.clientId === client.id)) && (!ctx.options.billableOnly || t.billable))
    .sort((a, z) => a.date.localeCompare(z.date) || (a.start ?? '').localeCompare(z.start ?? ''));
  return { rows, label: r.label, client: ref ? (client ? clientName(client) : String(ctx.options.client)) : undefined };
}

/* ---------------------------------------------------------------- docs */

export const businessPrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-biz-invoice',
    title: 'Invoice',
    group: 'Money',
    kinds: ['business'],
    description: 'A properly formatted invoice: your details, bill-to, line items, discount, tax, totals and payment instructions',
    options: [{ key: 'invoice', label: 'Invoice', type: 'text', default: '', hint: 'invoice number (e.g. INV-0007) or id — empty = the most recent invoice' }],
    emptyReason: (s) => (bizOf(s).invoices.length ? false : 'Create an invoice in Invoices first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const inv = pickInvoice(b, String(ctx.options.invoice ?? ''));
      if (!inv)
        return {
          css: INVOICE_CSS,
          body: (
            <>
              <SpaceDocHeader ctx={ctx} title="Invoice" />
              <p className="pp-muted">{ctx.options.invoice ? `No invoice “${String(ctx.options.invoice)}”.` : 'No invoices yet.'}</p>
            </>
          ),
        };
      return {
        css: INVOICE_CSS,
        header: false,
        title: `Invoice ${inv.number}`,
        fileName: `${b.profile.legalName || ctx.space.meta.title} - Invoice ${inv.number}`,
        footer: { left: `${b.profile.legalName || ctx.space.meta.title} · Invoice ${inv.number}` },
        body: <InvoiceBody ctx={ctx} inv={inv} />,
      };
    },
  },
  {
    id: 'space-biz-pl',
    title: 'Profit & Loss',
    group: 'Money',
    kinds: ['business'],
    description: 'Income by stream and client, expenses by category, net profit, month by month and receivables',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: 'ytd', choices: periodChoices },
      { key: 'months', label: 'Month-by-month table', type: 'boolean', default: true },
      { key: 'receivables', label: 'Receivables (open invoices)', type: 'boolean', default: true },
    ],
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const r = periodRange(ctx.options.period as PeriodId, ctx.todayISO);
      const pl = profitLoss(b, r);
      const streams = incomeByStream(b, r);
      const clients = incomeByClient(b, r);
      const cats = expensesByCategory(b, r);
      const inc = incomeRows(b).filter((x) => inRange(x.date, r));
      const exp = expenseRows(b).filter((x) => inRange(x.date, r));
      const months = [...new Set([...inc, ...exp].map((x) => monthKey(x.date)))].sort();
      const ar = arAging(b, ctx.todayISO);
      const margin = pl.income > 0 ? Math.round((pl.profit / pl.income) * 100) : null;
      const deductible = sumAmount(exp.filter((x) => x.deductible));
      const rangeText = r.from === '0000-01-01' ? 'All time' : `${ctx.fmt.dateMedium(r.from)} – ${ctx.fmt.dateMedium(r.to)}`;
      return {
        css: BIZ_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Profit & Loss" subtitle={`${r.label} · ${rangeText}`} />
            <Kpis
              items={[
                { k: 'Income', v: money(ctx, pl.income), s: `${inc.length} entries` },
                { k: 'Expenses', v: money(ctx, pl.expenses), s: `${exp.length} entries` },
                { k: 'Net profit', v: money(ctx, pl.profit), s: margin != null ? `${margin}% margin` : undefined, tone: pl.profit >= 0 ? 'pos' : 'neg' },
                { k: 'Deductible expenses', v: money(ctx, deductible) },
              ]}
            />
            <div className="bz-two">
              <PSection title="Income by stream">
                <PTable
                  rows={streams}
                  empty="No income in this period."
                  columns={[
                    { header: 'Stream', cell: (x) => x.label },
                    { header: 'Type', cell: (x) => optLabel(STREAM_TYPES, b.streams.find((s) => s.id === x.id)?.type) },
                    { header: 'Amount', num: true, cell: (x) => money(ctx, x.amount) },
                  ]}
                  footer={['Total', '', money(ctx, pl.income)]}
                />
              </PSection>
              <PSection title="Income by client">
                <PTable rows={clients} empty="No income in this period." columns={[{ header: 'Client', cell: (x) => x.label }, { header: 'Amount', num: true, cell: (x) => money(ctx, x.amount) }]} />
              </PSection>
            </div>
            <PSection title="Expenses by category">
              <PTable
                rows={cats}
                empty="No expenses in this period."
                columns={[
                  {
                    header: 'Category',
                    cell: (x) => (
                      <>
                        <span className="bz-swatch" style={{ background: x.color }} />
                        {x.label}
                      </>
                    ),
                  },
                  { header: 'Entries', num: true, width: '10%', cell: (x) => x.count },
                  { header: 'Share', width: '30%', cell: (x) => <span className="bz-bar" style={{ width: `${Math.max(2, (x.amount / Math.max(1, pl.expenses)) * 100)}%`, background: x.color }} /> },
                  { header: 'Amount', num: true, width: '16%', cell: (x) => money(ctx, x.amount) },
                ]}
                footer={['Total', String(exp.length), '', money(ctx, pl.expenses)]}
              />
            </PSection>
            {ctx.options.months && months.length > 0 && (
              <PSection title="Month by month">
                <PTable
                  zebra
                  rows={months}
                  columns={[
                    { header: 'Month', cell: (m) => monthLabel(m, true) },
                    { header: 'Income', num: true, cell: (m) => money(ctx, sumAmount(inc.filter((x) => x.date.startsWith(m)))) },
                    { header: 'Expenses', num: true, cell: (m) => money(ctx, sumAmount(exp.filter((x) => x.date.startsWith(m)))) },
                    {
                      header: 'Profit',
                      num: true,
                      cell: (m) => {
                        const v = round2(sumAmount(inc.filter((x) => x.date.startsWith(m))) - sumAmount(exp.filter((x) => x.date.startsWith(m))));
                        return <span className={v < 0 ? 'bz-neg' : ''}>{money(ctx, v)}</span>;
                      },
                    },
                  ]}
                  footer={['Total', money(ctx, pl.income), money(ctx, pl.expenses), money(ctx, pl.profit)]}
                />
              </PSection>
            )}
            {ctx.options.receivables && (
              <PSection title="Receivables today" right={`${ar.openCount} open · ${money(ctx, ar.total)}`}>
                <KV
                  cols={5}
                  keepEmpty
                  items={[
                    ['Not yet due', money(ctx, ar.current)],
                    ['1–30 days late', money(ctx, ar.d1_30)],
                    ['31–60 days', money(ctx, ar.d31_60)],
                    ['61–90 days', money(ctx, ar.d61_90)],
                    ['Over 90 days', money(ctx, ar.d90)],
                  ]}
                />
              </PSection>
            )}
            <p className="pp-muted pp-small" style={{ marginTop: '12pt' }}>
              Cash basis: income is counted when received (paid invoices and income entries), expenses when paid (expenses and paid contractor payments). Not tax advice.
            </p>
          </>
        ),
      };
    },
  },
  {
    id: 'space-biz-expenses',
    title: 'Expense Report',
    group: 'Money',
    kinds: ['business'],
    description: 'Every expense in a period grouped by category, with deductible totals and receipt status',
    orientation: 'landscape',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: 'this_month', choices: periodChoices },
      { key: 'category', label: 'Category', type: 'text', default: '', hint: 'category name — empty = all' },
      { key: 'deductibleOnly', label: 'Tax-deductible only', type: 'boolean', default: false },
    ],
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const r = periodRange(ctx.options.period as PeriodId, ctx.todayISO);
      const cref = String(ctx.options.category ?? '').trim().toLowerCase();
      const rows = expenseRows(b)
        .filter((x) => inRange(x.date, r) && (!cref || categoryOf(b, x.category).label.toLowerCase().includes(cref) || x.category === cref) && (!ctx.options.deductibleOnly || x.deductible))
        .sort((a, z) => a.date.localeCompare(z.date));
      const total = sumAmount(rows);
      const ded = sumAmount(rows.filter((x) => x.deductible));
      const withReceipt = rows.filter((x) => x.source === 'entry' && (b.expenses.find((e) => e.id === x.id)?.receipts?.length ?? 0) > 0).length;
      return {
        css: BIZ_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Expense Report" subtitle={`${r.label}${cref ? ` · ${String(ctx.options.category)}` : ''}`} />
            <Kpis
              items={[
                { k: 'Total', v: money(ctx, total), s: `${rows.length} expenses` },
                { k: 'Tax-deductible', v: money(ctx, ded) },
                { k: 'With receipt', v: `${withReceipt}/${rows.length}` },
                { k: 'Recurring', v: String(rows.filter((x) => b.expenses.find((e) => e.id === x.id)?.recurring).length) },
              ]}
            />
            <PTable
              zebra
              rows={rows}
              empty="No expenses in this period."
              groupBy={(x) => categoryOf(b, x.category).label}
              groupLabel={(g, gr) => `${g} · ${money(ctx, sumAmount(gr))}`}
              columns={[
                { header: 'Date', width: '10%', cell: (x) => ctx.fmt.date(x.date) },
                { header: 'Vendor', width: '18%', cell: (x) => x.vendor ?? '' },
                { header: 'Description', cell: (x) => x.description ?? '' },
                {
                  header: 'Method',
                  width: '11%',
                  cell: (x) => {
                    const e = b.expenses.find((y) => y.id === x.id);
                    const pm = e?.method ?? b.payments.find((p) => p.id === x.id)?.method;
                    return optLabel(PAYMENT_METHODS, pm);
                  },
                },
                { header: 'Deductible', width: '9%', align: 'center', cell: (x) => (x.deductible ? '✓' : '') },
                { header: 'Receipt', width: '8%', align: 'center', cell: (x) => ((b.expenses.find((e) => e.id === x.id)?.receipts?.length ?? 0) > 0 ? '✓' : '') },
                { header: 'Amount', width: '12%', num: true, cell: (x) => money(ctx, x.amount) },
              ]}
              footer={['Total', '', '', '', money(ctx, ded), '', money(ctx, total)]}
            />
          </>
        ),
      };
    },
  },
  {
    id: 'space-biz-time',
    title: 'Time Report',
    group: 'Money',
    kinds: ['business'],
    description: 'Timesheet for a period and client: hours, billable value and what is invoiced',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: 'this_month', choices: periodChoices },
      { key: 'client', label: 'Client', type: 'text', default: '', hint: 'client name — empty = all clients' },
      { key: 'billableOnly', label: 'Billable only', type: 'boolean', default: false },
      { key: 'showRates', label: 'Show rates and amounts', type: 'boolean', default: true },
    ],
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const { rows, label, client } = filterTime(b, ctx);
      const mins = rows.reduce((n, t) => n + t.minutes, 0);
      const billMins = rows.filter((t) => t.billable).reduce((n, t) => n + t.minutes, 0);
      const value = sumAmount(rows.map((t) => ({ amount: entryValue(b, t) })));
      const unbilled = sumAmount(rows.filter((t) => t.billable && !t.invoiceId).map((t) => ({ amount: entryValue(b, t) })));
      const show = !!ctx.options.showRates;
      return {
        css: BIZ_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Time Report" subtitle={[label, client].filter(Boolean).join(' · ')} />
            <Kpis
              items={[
                { k: 'Total time', v: formatDuration(mins), s: `${rows.length} entries` },
                { k: 'Billable', v: formatDuration(billMins), s: mins ? `${Math.round((billMins / mins) * 100)}%` : undefined },
                ...(show ? [{ k: 'Billable value', v: money(ctx, value) }, { k: 'Not invoiced yet', v: money(ctx, unbilled) }] : []),
              ]}
            />
            <PTable
              zebra
              rows={rows}
              empty="No time in this period."
              groupBy={client ? undefined : (t) => clientLabel(b, t.clientId) || 'No client'}
              groupLabel={(g, gr) => `${g} · ${formatDuration(gr.reduce((n, t) => n + t.minutes, 0))}`}
              columns={[
                { header: 'Date', width: '11%', cell: (t) => ctx.fmt.date(t.date) },
                { header: 'Time', width: '13%', cell: (t) => (t.start ? `${ctx.fmt.time(t.start)}${t.end ? `–${ctx.fmt.time(t.end)}` : ''}` : '') },
                { header: 'Description', cell: (t) => t.description ?? '' },
                { header: 'Hours', width: '8%', num: true, cell: (t) => (t.minutes / 60).toFixed(2) },
                { header: 'Billable', width: '8%', align: 'center', cell: (t) => (t.billable ? '✓' : '') },
                ...(show
                  ? [
                      { header: 'Rate', width: '10%', num: true, cell: (t: TimeEntry) => (t.billable ? money(ctx, entryRate(b, t)) : '') },
                      { header: 'Amount', width: '11%', num: true, cell: (t: TimeEntry) => (t.billable ? money(ctx, entryValue(b, t)) : '') },
                      { header: 'Invoice', width: '10%', cell: (t: TimeEntry) => b.invoices.find((i) => i.id === t.invoiceId)?.number ?? '' },
                    ]
                  : []),
              ]}
              footer={['Total', '', '', (mins / 60).toFixed(2), '', ...(show ? ['', money(ctx, value), ''] : [])]}
            />
          </>
        ),
      };
    },
  },
  {
    id: 'space-biz-contractors',
    title: 'Contractor Payments',
    group: 'Business',
    kinds: ['business'],
    description: 'Each contractor’s agreed rate, tax form, what you paid in a period and what you still owe, with the pay log',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: 'ytd', choices: periodChoices },
      { key: 'log', label: 'Payment log per contractor', type: 'boolean', default: true },
      { key: 'inactive', label: 'Include inactive contractors', type: 'boolean', default: false },
    ],
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const r = periodRange(ctx.options.period as PeriodId, ctx.todayISO);
      const list = b.contractors.filter((c) => ctx.options.inactive || c.active || contractorBalance(b, c.id).owed > 0);
      const paidIn = (id: string) => sumAmount(b.payments.filter((p) => p.contractorId === id && p.status === 'paid' && inRange(p.paidDate || p.date, r)));
      const totalPaid = sumAmount(list.map((c) => ({ amount: paidIn(c.id) })));
      const totalOwed = sumAmount(list.map((c) => ({ amount: contractorBalance(b, c.id).owed })));
      const rate = (c: (typeof list)[number]) => (c.rate == null ? '' : c.rateType === 'rev_share' ? `${c.rate}%` : `${money(ctx, c.rate)} ${RATE_TYPES.find((x) => x.value === c.rateType)?.unit ?? ''}`);
      return {
        css: BIZ_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Contractor Payments" subtitle={r.label} />
            <Kpis
              items={[
                { k: 'Contractors', v: String(list.length) },
                { k: `Paid (${r.label.toLowerCase()})`, v: money(ctx, totalPaid) },
                { k: 'Owed now', v: money(ctx, totalOwed), tone: totalOwed > 0 ? 'neg' : undefined },
                { k: '1099 / tax forms open', v: String(list.filter((c) => c.taxForm === 'requested' || c.taxForm === 'needs_1099' || c.taxForm === 'none').length) },
              ]}
            />
            <PTable
              zebra
              rows={list}
              empty="No contractors yet."
              columns={[
                { header: 'Contractor', cell: (c) => <b>{c.name}</b> },
                { header: 'Role', cell: (c) => c.role ?? '' },
                { header: 'Agreed rate', cell: (c) => rate(c) },
                { header: 'Terms', cell: (c) => c.paymentTerms ?? '' },
                { header: 'Tax form', cell: (c) => (c.taxForm ? <PBadge color={TAX_FORM_STATUSES.find((x) => x.value === c.taxForm)?.color}>{optLabel(TAX_FORM_STATUSES, c.taxForm)}</PBadge> : '') },
                { header: 'Paid', num: true, cell: (c) => money(ctx, paidIn(c.id)) },
                { header: 'Owed', num: true, cell: (c) => money(ctx, contractorBalance(b, c.id).owed) },
              ]}
              footer={['Total', '', '', '', '', money(ctx, totalPaid), money(ctx, totalOwed)]}
            />
            {ctx.options.log &&
              list.map((c) => {
                const pays = b.payments.filter((p) => p.contractorId === c.id && (p.status !== 'paid' || inRange(p.paidDate || p.date, r))).sort((a, z) => a.date.localeCompare(z.date));
                if (!pays.length) return null;
                return (
                  <PSection key={c.id} title={c.name} right={`${pays.length} payments`} className="pp-avoid">
                    <PTable
                      rows={pays}
                      columns={[
                        { header: 'Date', width: '12%', cell: (p) => ctx.fmt.date(p.status === 'paid' ? p.paidDate || p.date : p.date) },
                        { header: 'For', cell: (p) => p.description ?? '' },
                        { header: 'Ref.', width: '12%', cell: (p) => p.reference ?? '' },
                        { header: 'Method', width: '13%', cell: (p) => optLabel(PAYMENT_METHODS, p.method) },
                        { header: 'Status', width: '11%', cell: (p) => <PBadge color={PAYMENT_STATUSES.find((x) => x.value === p.status)?.color}>{optLabel(PAYMENT_STATUSES, p.status)}</PBadge> },
                        { header: 'Amount', width: '13%', num: true, cell: (p) => money(ctx, p.amount) },
                      ]}
                    />
                  </PSection>
                );
              })}
          </>
        ),
      };
    },
  },
  {
    id: 'space-biz-legal',
    title: 'Legal Document',
    group: 'Business',
    kinds: ['business'],
    description: 'A generated agreement, NDA, release or letter with numbered sections and signature blocks',
    options: [
      { key: 'doc', label: 'Document', type: 'text', default: '', hint: 'document title or id — empty = the most recent document' },
      { key: 'disclaimer', label: '“Not legal advice” note at the end', type: 'boolean', default: true, hint: 'Remove it for the final copy once a lawyer has reviewed the document' },
    ],
    emptyReason: (s) => (bizOf(s).docs.length ? false : 'Generate a document in Legal Documents first'),
    render: (ctx) => {
      const b = bizOf(ctx.space);
      const ref = String(ctx.options.doc ?? '').trim().toLowerCase();
      const sorted = [...b.docs].sort((a, z) => (z.createdAt || '').localeCompare(a.createdAt || ''));
      const doc: LegalDoc | undefined = ref ? b.docs.find((d) => d.id === ref) ?? b.docs.find((d) => d.title.toLowerCase() === ref) ?? b.docs.find((d) => d.title.toLowerCase().includes(ref)) : sorted[0];
      if (!doc)
        return {
          body: (
            <>
              <SpaceDocHeader ctx={ctx} title="Legal Document" />
              <p className="pp-muted">{ref ? `No document “${String(ctx.options.doc)}”.` : 'No documents yet.'}</p>
            </>
          ),
        };
      const built = buildLegal(doc, (n) => ctx.fmt.money(n));
      return {
        css: LEGAL_PRINT_CSS,
        title: doc.title,
        fileName: `${doc.title}${doc.party.name ? ` - ${doc.party.name}` : ''}`,
        header: { left: b.profile.legalName || ctx.space.meta.title, right: doc.status === 'draft' ? 'DRAFT' : '' },
        footer: { left: doc.title, center: '' },
        margins: { top: 0.9, right: 1, bottom: 0.9, left: 1 },
        body: <LegalDocView doc={built} signedDate={doc.status === 'signed' && doc.signedDate ? longDate(doc.signedDate) : undefined} showDisclaimer={!!ctx.options.disclaimer} />,
      };
    },
  },
];

