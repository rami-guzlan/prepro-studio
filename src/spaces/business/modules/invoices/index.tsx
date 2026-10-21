/* Invoices: numbered invoices with line items, discount, tax, status (draft →
   sent → paid; overdue computed; void), unbilled time, PDF copies and files. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { ArrowLeft, Ban, CheckCircle2, Clock, Copy, FileDown, FileText, MoreHorizontal, Plus, Printer, Receipt, RotateCcw, Send, Settings2, Trash2, UserPlus } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace, openPrint, readLS, writeLS } from '@/store/app';
import { addDays, diffDays } from '@/lib/dates';
import { safeFileName, plural } from '@/lib/text';
import { exportCsv } from '@/backend';
import { useProjectList } from '@/spaces/ui';
import { Button, DataTable, DateInput, EmptyState, Field, Input, Menu, ModuleHeader, NumberInput, SearchInput, Select, Tabs, Textarea, confirmDialog, promptDialog, toast, type MenuItem } from '@/ui';
import { INVOICE_STATUSES, PAYMENT_METHODS } from '../../constants';
import { clientLabel, daysOverdue, entryValue, invoiceStatus, invoiceTotals, round2, sumAmount, unbilledEntries } from '../../derive';
import { addItem, addLines, addUnbilledTime, createInvoice, duplicateInvoice, makeClient, makeLine, reorderLine, removeItems, removeLine, setInvoiceStatus, updateInvoice, updateLine } from '../../ops';
import { FileBox, canStorePdf, storePdfCopy } from '../../files';
import { SettingsDialog } from '../../dialogs';
import { Money, OptionPill, clientOptions, rowKeys, streamOptions, useBiz, useFmt, useMarketingSpaces, useNavParams, useToday } from '../../ui';
import type { Invoice, InvoiceLine, PaymentMethod } from '../../types';
import { ProjectPill, ProjectSelect, projectName } from '../projects/link';

type Filter = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'void';

export default function InvoicesModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const fmt = useFmt();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.invoice.${spaceId}`, null));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.invoice.${spaceId}`, id);
  };

  useNavParams((p) => {
    if (p.invoiceId) {
      const r = String(p.invoiceId).toLowerCase();
      const hit = b.invoices.find((i) => i.id === p.invoiceId || i.number.toLowerCase() === r);
      if (hit) select(hit.id);
    }
    if (p.status && ['all', 'draft', 'open', 'overdue', 'paid', 'void'].includes(p.status)) setFilter(p.status);
    if (p.new) {
      const proj = p.bizProjectId ? b.projects.find((x) => x.id === p.bizProjectId) : undefined;
      const clientId = p.clientId && b.clients.some((c) => c.id === p.clientId) ? p.clientId : proj?.clientId;
      const lines = Array.isArray(p.lines) ? p.lines.filter((l: any) => l && typeof l.description === 'string').map((l: any) => makeLine({ description: l.description, qty: Number(l.qty) || 1, unitPrice: Number(l.unitPrice) || 0 })) : [];
      const inv = createInvoice({ clientId, ...(proj ? { bizProjectId: proj.id } : {}), ...(typeof p.title === 'string' && p.title.trim() ? { title: p.title.trim() } : {}), ...(lines.length ? { lines } : {}) });
      select(inv.id);
    }
  });

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: b.invoices.length, draft: 0, open: 0, overdue: 0, paid: 0, void: 0 };
    for (const inv of b.invoices) {
      const st = invoiceStatus(inv, today);
      if (st === 'draft') c.draft++;
      if (st === 'sent' || st === 'overdue') c.open++;
      if (st === 'overdue') c.overdue++;
      if (st === 'paid') c.paid++;
      if (st === 'void') c.void++;
    }
    return c;
  }, [b.invoices, today]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...b.invoices]
      .filter((inv) => {
        const st = invoiceStatus(inv, today);
        if (filter === 'draft' && st !== 'draft') return false;
        if (filter === 'open' && st !== 'sent' && st !== 'overdue') return false;
        if (filter === 'overdue' && st !== 'overdue') return false;
        if (filter === 'paid' && st !== 'paid') return false;
        if (filter === 'void' && st !== 'void') return false;
        if (!s) return true;
        return [inv.number, inv.title, clientLabel(b, inv.clientId), ...inv.lines.map((l) => l.description)].join(' ').toLowerCase().includes(s);
      })
      .sort((a, z) => (z.issueDate || '').localeCompare(a.issueDate || '') || z.number.localeCompare(a.number));
  }, [b, filter, q, today]);

  const inv = b.invoices.find((x) => x.id === sel);
  const open = sumAmount(b.invoices.filter((i) => i.status === 'sent').map((i) => ({ amount: invoiceTotals(i).total })));

  const newInvoice = () => {
    const created = createInvoice();
    select(created.id);
    setFilter('all');
  };

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`Invoices`), list, [
      { header: 'Number', value: (i) => i.number },
      { header: 'Client', value: (i) => clientLabel(b, i.clientId) },
      { header: 'Reference', value: (i) => i.title },
      { header: 'Project', value: (i) => projectName(b, i.bizProjectId) },
      { header: 'Issued', value: (i) => i.issueDate },
      { header: 'Due', value: (i) => i.dueDate },
      { header: 'Status', value: (i) => invoiceStatus(i, today) },
      { header: 'Subtotal', value: (i) => invoiceTotals(i).subtotal },
      { header: 'Discount', value: (i) => invoiceTotals(i).discount },
      { header: 'Tax', value: (i) => invoiceTotals(i).tax },
      { header: 'Total', value: (i) => invoiceTotals(i).total },
      { header: 'Paid on', value: (i) => i.paidDate },
    ]);
    if (path) toast(`Exported ${plural(list.length, 'invoice')}`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Invoices"
        icon={FileText}
        subtitle={b.invoices.length ? `${counts.open} open · ${fmt.money(open)} outstanding${counts.overdue ? ` · ${counts.overdue} overdue` : ''}` : 'Numbered invoices, payments and PDFs'}
        actions={
          <>
            <Menu
              align="end"
              trigger={<Button icon={MoreHorizontal}>More</Button>}
              items={[
                { label: 'Invoice & time settings…', icon: Settings2, onClick: () => setSettingsOpen(true) },
                { label: 'Record a received invoice (expense)…', icon: Receipt, onClick: () => navigateSpace('expenses', { new: true, received: true }) },
                { separator: true },
                { label: 'Export list (CSV)', icon: FileDown, onClick: () => void exportList(), disabled: !list.length },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={newInvoice}>
              New invoice
            </Button>
          </>
        }
      />
      <div className={`biz-split ${inv ? 'has-sel' : ''}`}>
        <div className="biz-split-list">
          <div className="biz-split-tools">
            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              tabs={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'draft', label: 'Draft', count: counts.draft },
                { id: 'open', label: 'Open', count: counts.open },
                { id: 'overdue', label: 'Overdue', count: counts.overdue },
                { id: 'paid', label: 'Paid', count: counts.paid },
              ]}
            />
            <SearchInput value={q} onChange={setQ} placeholder="Search invoices…" width="100%" />
          </div>
          <div className="biz-split-items">
            {list.length === 0 ? (
              <div className="biz-empty-line" style={{ padding: 16 }}>
                {b.invoices.length ? 'No invoice matches.' : 'No invoices yet.'}
              </div>
            ) : (
              list.map((x) => {
                const st = invoiceStatus(x, today);
                const t = invoiceTotals(x).total;
                return (
                  <div key={x.id} role="button" className={`biz-item ${x.id === sel ? 'on' : ''}`} onClick={() => select(x.id)} {...rowKeys(() => select(x.id))}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="biz-mono biz-strong">{x.number || 'No number'}</span>
                      <span className="biz-grow" />
                      <Money value={t} strong />
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="biz-grow ellipsis muted small">{clientLabel(b, x.clientId) || 'No client'}{x.title ? ` · ${x.title}` : ''}</span>
                      <OptionPill value={st} options={INVOICE_STATUSES} />
                    </div>
                    <div className="muted tiny row" style={{ gap: 6 }}>
                      <span className="biz-grow ellipsis">
                      {fmt.date(x.issueDate)}
                      {st === 'overdue' ? ` · ${daysOverdue(x, today)} days late` : x.status === 'sent' && x.dueDate ? ` · due ${fmt.dateShort(x.dueDate)}` : x.status === 'paid' && x.paidDate ? ` · paid ${fmt.dateShort(x.paidDate)}` : ''}
                      </span>
                      <ProjectPill id={x.bizProjectId} static />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="biz-split-main">
          {inv ? (
            <InvoiceEditor key={inv.id} inv={inv} onBack={() => select(null)} onSelect={select} />
          ) : (
            <EmptyState
              icon={FileText}
              title={b.invoices.length ? 'Pick an invoice' : 'Send your first invoice'}
              description="Numbered automatically, with your details, line items, tax and payment instructions. Mark it sent and paid — paid invoices count as income."
              action={
                <Button variant="primary" icon={Plus} onClick={newInvoice}>
                  New invoice
                </Button>
              }
            />
          )}
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

function InvoiceEditor({ inv, onBack, onSelect }: { inv: Invoice; onBack: () => void; onSelect: (id: ID | null) => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const projects = useProjectList();
  const spaces = useMarketingSpaces();
  const st = invoiceStatus(inv, today);
  const t = invoiceTotals(inv);
  const up = (patch: Partial<Invoice>, coalesce = true) => updateInvoice(inv.id, patch, coalesce);
  const unbilled = unbilledEntries(b, inv.clientId).filter((e) => (inv.clientId ? true : !e.clientId));
  const unbilledValue = sumAmount(unbilled.map((e) => ({ amount: entryValue(b, e) })));
  const locked = inv.status === 'paid' || inv.status === 'void';
  const pdfOptions = { invoice: inv.number || inv.id };

  const markPaid = async () => {
    const date = await promptDialog({ title: `Mark ${inv.number} as paid`, message: `Records ${fmt.money(t.total)} as income on the payment date (YYYY-MM-DD).`, defaultValue: today, confirmLabel: 'Mark paid' });
    if (date == null) return;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : today;
    setInvoiceStatus(inv.id, 'paid', d);
    toast(`${inv.number} paid — ${fmt.money(t.total)} added to income`);
  };

  const markSent = async () => {
    setInvoiceStatus(inv.id, 'sent', today);
    if (canStorePdf() && !(inv.attachments ?? []).some((f) => /\.pdf$/i.test(f.fileName))) {
      await storePdfCopy({ list: 'invoices', id: inv.id, field: 'attachments' }, 'space-biz-invoice', pdfOptions, `Invoice ${inv.number}`);
    } else toast(`${inv.number} marked as sent`);
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete invoice ${inv.number}?`,
      message: inv.status === 'paid' ? 'Its income entry is removed too and billed time becomes unbilled again. You can undo with Ctrl+Z.' : 'Billed time becomes unbilled again. You can undo with Ctrl+Z.',
      confirmLabel: 'Delete invoice',
      danger: true,
    });
    if (!ok) return;
    removeItems('invoices', [inv.id]);
    onSelect(null);
  };

  const addClient = async () => {
    const name = await promptDialog({ title: 'New client', placeholder: 'Name or company', confirmLabel: 'Add client' });
    if (!name?.trim()) return;
    const c = makeClient({ name: name.trim() });
    addItem('clients', c);
    up({ clientId: c.id, dueDate: addDays(inv.issueDate || today, b.settings.paymentTermsDays) }, false);
  };

  const moreItems: MenuItem[] = [
    { label: 'Duplicate', icon: Copy, onClick: () => { const c = duplicateInvoice(inv.id); if (c) { onSelect(c.id); toast(`Created ${c.number}`); } } },
    ...(canStorePdf() ? [{ label: 'Save a PDF copy with the invoice', icon: FileDown, onClick: () => void storePdfCopy({ list: 'invoices', id: inv.id, field: 'attachments' }, 'space-biz-invoice', pdfOptions, `Invoice ${inv.number}`) }] : []),
    { separator: true },
    ...(inv.status !== 'draft' ? [{ label: 'Back to draft', icon: RotateCcw, onClick: () => setInvoiceStatus(inv.id, 'draft') }] : []),
    ...(inv.status === 'paid' ? [{ label: 'Mark unpaid (sent)', icon: RotateCcw, onClick: () => setInvoiceStatus(inv.id, 'sent', inv.sentDate) }] : []),
    ...(inv.status !== 'void' ? [{ label: 'Void invoice', icon: Ban, onClick: () => setInvoiceStatus(inv.id, 'void') }] : []),
    { separator: true },
    { label: 'Delete…', icon: Trash2, danger: true, onClick: () => void remove() },
  ];

  const lineCols = [
    { key: 'description', header: 'Description', type: 'textarea' as const, placeholder: 'What you did or delivered', minWidth: 200 },
    { key: 'qty', header: 'Qty', type: 'number' as const, width: 80 },
    { key: 'unitPrice', header: 'Unit price', type: 'money' as const, width: 120 },
    { key: 'amount', header: 'Amount', width: 120, align: 'right' as const, render: (l: InvoiceLine) => <span className="biz-money">{fmt.money(round2(l.qty * l.unitPrice))}</span> },
  ];

  return (
    <div className="biz-editor">
      <div className="biz-editor-head">
        <Button className="biz-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Invoices
        </Button>
        <div className="biz-editor-title">
          <Input className="biz-number-input" value={inv.number} aria-label="Invoice number" onChange={(v) => up({ number: v })} />
          <OptionPill value={st} options={INVOICE_STATUSES} />
          {st === 'overdue' && <span className="biz-out small">{daysOverdue(inv, today)} days late</span>}
        </div>
        <div className="biz-editor-actions">
          {inv.status === 'draft' && (
            <Button icon={Send} onClick={() => void markSent()}>
              Mark sent
            </Button>
          )}
          {(inv.status === 'draft' || inv.status === 'sent') && (
            <Button variant="primary" icon={CheckCircle2} onClick={() => void markPaid()}>
              Mark paid
            </Button>
          )}
          <Button icon={Printer} onClick={() => openPrint('space-biz-invoice', pdfOptions)}>
            PDF
          </Button>
          <Menu align="end" trigger={<Button icon={MoreHorizontal} aria-label="More actions" />} items={moreItems} />
        </div>
      </div>

      <div className="biz-editor-body">
        <div className="biz-form">
          <Field label="Client">
            <div className="row" style={{ gap: 4 }}>
              <Select
                value={inv.clientId ?? ''}
                placeholder={b.clients.length ? 'Choose a client…' : 'No clients yet'}
                options={clientOptions(b, inv.clientId)}
                onChange={(v) => {
                  const c = b.clients.find((x) => x.id === v);
                  up({ clientId: v || undefined, ...(c?.termsDays != null && inv.status === 'draft' ? { dueDate: addDays(inv.issueDate || today, c.termsDays) } : {}) }, false);
                }}
              />
              <Button icon={UserPlus} aria-label="New client" title="New client" onClick={() => void addClient()} />
            </div>
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={inv.bizProjectId}
              onChange={(id) => {
                const proj = id ? b.projects.find((x) => x.id === id) : undefined;
                up({ bizProjectId: id, ...(proj?.clientId && !inv.clientId ? { clientId: proj.clientId } : {}), ...(proj && !inv.title ? { title: proj.name } : {}) }, false);
              }}
            />
          </Field>
          <Field label="Reference / PO">
            <Input value={inv.title} placeholder="e.g. October retainer, PO 4471" onChange={(v) => up({ title: v || undefined })} />
          </Field>
          <Field label="Invoice date">
            <DateInput
              value={inv.issueDate}
              onChange={(v) => {
                const terms = inv.dueDate && inv.issueDate ? diffDays(inv.issueDate, inv.dueDate) : b.settings.paymentTermsDays;
                up({ issueDate: v || today, dueDate: v ? addDays(v, terms) : inv.dueDate }, false);
              }}
            />
          </Field>
          <Field label="Due date" hint={inv.dueDate && inv.issueDate ? `Net ${diffDays(inv.issueDate, inv.dueDate)} days` : undefined}>
            <DateInput value={inv.dueDate} onChange={(v) => up({ dueDate: v }, false)} />
          </Field>
          <Field label="Income stream">
            <Select value={inv.streamId ?? ''} placeholder={b.streams.length ? 'None' : 'No streams yet'} options={streamOptions(b)} onChange={(v) => up({ streamId: v || undefined }, false)} />
          </Field>
          <Field label="Linked production / space">
            <Select
              value={inv.projectId ? `p:${inv.projectId}` : inv.spaceId ? `s:${inv.spaceId}` : ''}
              placeholder="None"
              options={[...projects.filter((p) => !p.demo).map((p) => ({ value: `p:${p.id}`, label: `🎬 ${p.title}` })), ...spaces.filter((s) => !s.demo).map((s) => ({ value: `s:${s.id}`, label: `📣 ${s.title}` }))]}
              onChange={(v) => up({ projectId: v.startsWith('p:') ? v.slice(2) : undefined, spaceId: v.startsWith('s:') ? v.slice(2) : undefined }, false)}
            />
          </Field>
          {inv.status !== 'draft' && (
            <Field label="Sent on">
              <DateInput value={inv.sentDate} onChange={(v) => up({ sentDate: v }, false)} />
            </Field>
          )}
          {inv.status === 'paid' && (
            <>
              <Field label="Paid on">
                <DateInput value={inv.paidDate} onChange={(v) => v && setInvoiceStatus(inv.id, 'paid', v, inv.method)} />
              </Field>
              <Field label="Paid by">
                <Select value={inv.method ?? ''} placeholder="—" options={PAYMENT_METHODS} onChange={(v) => setInvoiceStatus(inv.id, 'paid', inv.paidDate, (v || undefined) as PaymentMethod | undefined)} />
              </Field>
            </>
          )}
        </div>

        <div className="biz-section-head">
          <h3>Line items</h3>
          <div className="spacer" />
          {unbilled.length > 0 && (
            <Button
              size="sm"
              icon={Clock}
              onClick={() => {
                const n = addUnbilledTime(inv.id, (d) => fmt.dateShort(d));
                if (n) toast(`Added ${n} time ${n === 1 ? 'entry' : 'entries'} — marked as invoiced`);
              }}
            >
              Add unbilled time ({fmt.money(unbilledValue)})
            </Button>
          )}
          <Button size="sm" icon={Plus} onClick={() => addLines(inv.id, [makeLine({ unitPrice: b.clients.find((c) => c.id === inv.clientId)?.defaultRate ?? 0 })])}>
            Add line
          </Button>
        </div>
        {locked && <div className="biz-note">This invoice is {inv.status}. Edits still apply{inv.status === 'paid' ? ' and update its income entry' : ''}.</div>}
        <DataTable<InvoiceLine>
          rows={inv.lines}
          columns={lineCols}
          onChange={(id, patch) => updateLine(inv.id, id, patch)}
          onReorder={(id, beforeId) => reorderLine(inv.id, id, beforeId)}
          onDelete={(l) => removeLine(inv.id, l.id)}
          emptyText={
            <span>
              No line items yet — <button type="button" className="biz-link" onClick={() => addLines(inv.id, [makeLine()])}>add a line</button>
              {unbilled.length ? ' or add unbilled time' : ''}.
            </span>
          }
        />

        <div className="biz-totals-wrap">
          <div className="biz-form biz-form-narrow">
            <Field label="Notes">
              <Textarea autoGrow minRows={2} value={inv.notes} placeholder="Thank-you note, scope summary…" onChange={(v) => up({ notes: v || undefined })} />
            </Field>
            <Field label="Payment instructions">
              <Textarea autoGrow minRows={2} value={inv.paymentInstructions} placeholder="Bank details, PayPal, Stripe link…" onChange={(v) => up({ paymentInstructions: v || undefined })} />
            </Field>
          </div>
          <div className="biz-totals">
            <div>
              <span>Subtotal</span>
              <b>{fmt.money(t.subtotal)}</b>
            </div>
            <div>
              <span>Discount</span>
              <NumberInput size="sm" decimals={2} value={inv.discount} placeholder="0.00" onChange={(v) => up({ discount: v || undefined })} style={{ width: 120 }} />
            </div>
            <div>
              <span>Tax %</span>
              <NumberInput size="sm" value={inv.taxPct} placeholder="0" onChange={(v) => up({ taxPct: v || undefined })} style={{ width: 120 }} />
            </div>
            {t.tax > 0 && (
              <div>
                <span>Tax</span>
                <b>{fmt.money(t.tax)}</b>
              </div>
            )}
            <div className="total">
              <span>Total</span>
              <b>{fmt.money(t.total)}</b>
            </div>
          </div>
        </div>

        <FileBox target={{ list: 'invoices', id: inv.id, field: 'attachments' }} files={inv.attachments} label="Files (sent PDF, PO, remittance)" empty="Drop the sent PDF, a purchase order or remittance advice here." />
      </div>
    </div>
  );
}
