/* Contractors: who you pay — agreed rate and terms ("agree on pay"), tax form
   status, agreements, and a pay log with what you still owe. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, CheckCircle2, FileSignature, Paperclip, Plus, Trash2, UsersRound } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { safeFileName, plural } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Avatar, Button, Card, Checkbox, DataTable, DateInput, EmptyState, ExportMenu, Field, Input, Modal, ModuleHeader, NumberInput, SearchInput, Select, Switch, Textarea, confirmDialog, toast, type Column } from '@/ui';
import { StatTile } from '@/ui/charts';
import { LEGAL_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, RATE_TYPES, TAX_FORM_STATUSES } from '../../constants';
import { contractorBalance, inRange, periodRange, sumAmount } from '../../derive';
import { addItem, makeContractor, makePayment, removeItems, setPaymentStatus, updateItem, updatePayment } from '../../ops';
import { FileBox } from '../../files';
import { Money, OptionPill, rowKeys, useBiz, useFmt, useNavParams, useToday } from '../../ui';
import type { Contractor, ContractorPayment, PaymentStatus, RateType, TaxFormStatus } from '../../types';
import { ProjectPill, ProjectSelect, projectName } from '../projects/link';

export default function ContractorsModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.contractor.${spaceId}`, null));
  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.contractor.${spaceId}`, id);
  };
  const add = () => {
    const c = makeContractor({ name: 'New contractor' });
    addItem('contractors', c);
    select(c.id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.biz-contractor-name input')?.select());
  };
  useNavParams((p) => {
    if (p.contractorId && b.contractors.some((c) => c.id === p.contractorId)) select(p.contractorId);
    if (p.new) add();
  });

  const balances = useMemo(() => new Map(b.contractors.map((c) => [c.id, contractorBalance(b, c.id)])), [b]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return b.contractors
      .filter((c) => (inactive || c.active || c.id === sel || (balances.get(c.id)?.owed ?? 0) > 0) && (!s || [c.name, c.role, c.company, c.email].join(' ').toLowerCase().includes(s)))
      .sort((a, z) => Number(z.active) - Number(a.active) || a.name.localeCompare(z.name));
  }, [b.contractors, q, inactive, sel, balances]);
  const c = b.contractors.find((x) => x.id === sel);
  const owed = [...balances.values()].reduce((n, x) => n + x.owed, 0);

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Contractor payments`), b.payments, [
      { header: 'Contractor', value: (p) => b.contractors.find((x) => x.id === p.contractorId)?.name },
      { header: 'Date', value: (p) => p.date },
      { header: 'For', value: (p) => p.description },
      { header: 'Reference', value: (p) => p.reference },
      { header: 'Project', value: (p) => projectName(b, p.bizProjectId) },
      { header: 'Method', value: (p) => PAYMENT_METHODS.find((m) => m.value === p.method)?.label },
      { header: 'Status', value: (p) => p.status },
      { header: 'Paid on', value: (p) => p.paidDate },
      { header: 'Amount', value: (p) => p.amount },
    ]);
    if (path) toast(`Exported ${plural(b.payments.length, 'payment')}`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Contractors"
        icon={UsersRound}
        subtitle={b.contractors.length ? `${b.contractors.filter((x) => x.active).length} active · ${fmt.money(owed)} owed` : 'Who you pay and what you agreed'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-biz-contractors', label: 'Contractor payments (year to date)', options: { period: 'ytd' } }]} csv={[{ label: 'All payments (CSV)', onClick: () => void exportList() }]} />
            <Button variant="primary" icon={Plus} onClick={add}>
              Add contractor
            </Button>
          </>
        }
      />
      <div className={`biz-split ${c ? 'has-sel' : ''}`}>
        <div className="biz-split-list">
          <div className="biz-split-tools">
            <SearchInput value={q} onChange={setQ} placeholder="Search contractors…" width="100%" />
            {b.contractors.some((x) => !x.active) && <Checkbox checked={inactive} onChange={setInactive} label="Show inactive" />}
          </div>
          <div className="biz-split-items">
            {list.length === 0 ? (
              <div className="biz-empty-line" style={{ padding: 16 }}>
                {b.contractors.length ? 'No contractor matches.' : 'No contractors yet.'}
              </div>
            ) : (
              list.map((x) => {
                const bal = balances.get(x.id)!;
                return (
                  <div key={x.id} role="button" className={`biz-item ${x.id === sel ? 'on' : ''} ${x.active ? '' : 'off'}`} onClick={() => select(x.id)} {...rowKeys(() => select(x.id))}>
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={x.name || '?'} size={30} />
                      <div className="biz-grow" style={{ minWidth: 0 }}>
                        <div className="ellipsis biz-strong">{x.name || 'Unnamed contractor'}</div>
                        <div className="ellipsis muted small">{[x.role, x.rate != null ? (x.rateType === 'rev_share' ? `${x.rate}%` : `${fmt.money(x.rate)} ${RATE_TYPES.find((r) => r.value === x.rateType)?.unit ?? ''}`) : ''].filter(Boolean).join(' · ') || ' '}</div>
                      </div>
                      {bal.owed > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <Money value={bal.owed} tone="out" />
                          <div className="tiny muted">owed</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="biz-split-main">
          {c ? (
            <ContractorDetail key={c.id} c={c} onBack={() => select(null)} onDeleted={() => select(null)} />
          ) : (
            <EmptyState
              icon={UsersRound}
              title={b.contractors.length ? 'Pick a contractor' : 'Work with contractors'}
              description="Record the rate you agreed, payment terms and tax forms, generate a contractor agreement pre-filled with it, and keep a pay log of what you paid and still owe."
              action={
                <Button variant="primary" icon={Plus} onClick={add}>
                  Add contractor
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ContractorDetail({ c, onBack, onDeleted }: { c: Contractor; onBack: () => void; onDeleted: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const [filesFor, setFilesFor] = useState<ID | null>(null);
  const up = (patch: Partial<Contractor>, coalesce = true) => updateItem('contractors', c.id, patch, coalesce);
  const bal = contractorBalance(b, c.id);
  const pays = b.payments.filter((p) => p.contractorId === c.id).sort((a, z) => z.date.localeCompare(a.date));
  const ytd = periodRange('ytd', today);
  const paidYtd = sumAmount(pays.filter((p) => p.status === 'paid' && inRange(p.paidDate || p.date, ytd)));
  const docs = b.docs.filter((d) => d.partyKind === 'contractor' && d.partyId === c.id);
  const signed = docs.find((d) => d.templateId === 'contractor' && d.status === 'signed');
  const rateUnit = RATE_TYPES.find((r) => r.value === c.rateType)?.unit ?? '';
  const filesPay = pays.find((p) => p.id === filesFor);

  const logPayment = () => {
    const amount = c.rateType === 'fixed' || c.rateType === 'deliverable' || c.rateType === 'day' ? c.rate ?? 0 : 0;
    addItem('payments', makePayment(c.id, { amount, method: pays[0]?.method }), 0);
  };

  const agree = () => {
    up({ agreedOn: today }, false);
    toast('Agreed pay recorded — generate the agreement to get it signed', 'success', { action: { label: 'Generate', onClick: () => navigateSpace('legal', { template: 'contractor', partyKind: 'contractor', partyId: c.id }) } });
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete ${c.name || 'this contractor'}?`,
      message: pays.length ? `Their ${pays.length} pay log entries are deleted too (expenses already recorded stay). Consider marking them inactive instead. You can undo with Ctrl+Z.` : 'You can undo with Ctrl+Z.',
      confirmLabel: 'Delete contractor',
      danger: true,
    });
    if (!ok) return;
    removeItems('contractors', [c.id]);
    onDeleted();
  };

  const cols: Column<ContractorPayment>[] = [
    { key: 'date', header: 'Date', type: 'date', width: 140 },
    { key: 'description', header: 'For', type: 'text', minWidth: 160, placeholder: 'e.g. Episode 12 edit' },
    { key: 'reference', header: 'Their invoice #', type: 'text', width: 120 },
    { key: 'bizProjectId', header: 'Project', width: 160, render: (p) => <ProjectSelect bare size="sm" placeholder="—" value={p.bizProjectId} onChange={(id) => updatePayment(p.id, { bizProjectId: id }, false)} /> },
    { key: 'method', header: 'Method', type: 'select', options: PAYMENT_METHODS, width: 130, placeholder: '—' },
    { key: 'amount', header: 'Amount', type: 'money', width: 120, footer: fmt.money(sumAmount(pays)) },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      render: (p) => (
        <Select bare size="sm" value={p.status} options={PAYMENT_STATUSES} onChange={(v) => setPaymentStatus(p.id, v as PaymentStatus)} aria-label="Status" />
      ),
    },
    {
      key: 'files',
      header: 'Files',
      width: 64,
      align: 'center',
      render: (p) => (
        <button type="button" className={`biz-receipt-btn ${p.attachments?.length ? 'has' : ''}`} onClick={() => setFilesFor(p.id)} title="Their invoice, remittance…">
          <Paperclip size={13} />
          {p.attachments?.length || ''}
        </button>
      ),
    },
  ];

  return (
    <div className="biz-editor">
      <div className="biz-editor-head">
        <Button className="biz-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Contractors
        </Button>
        <div className="biz-editor-title biz-contractor-name">
          <Avatar name={c.name || '?'} size={34} />
          <Input value={c.name} placeholder="Name" onChange={(v) => up({ name: v })} aria-label="Contractor name" />
        </div>
        <div className="biz-editor-actions">
          <Switch checked={c.active} onChange={(v) => up({ active: v }, false)} label="Active" />
          <Button icon={FileSignature} onClick={() => navigateSpace('legal', { template: 'contractor', partyKind: 'contractor', partyId: c.id })}>
            Agreement
          </Button>
          <Button variant="primary" icon={Plus} onClick={logPayment}>
            Log payment
          </Button>
        </div>
      </div>
      <div className="biz-editor-body">
        <div className="biz-kpis small">
          <StatTile label="Owed now" value={fmt.money(bal.owed, { cents: false })} deltaGood={bal.owed ? false : undefined} />
          <StatTile label="Paid this year" value={fmt.money(paidYtd, { cents: false })} />
          <StatTile label="Paid all time" value={fmt.money(bal.paid, { cents: false })} sub={plural(bal.count, 'payment')} />
        </div>

        {(() => {
          const onProjects = b.projects.filter((pr) => pr.contractorIds.includes(c.id) || pays.some((x) => x.bizProjectId === pr.id));
          return onProjects.length ? (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="muted small">Projects:</span>
              {onProjects.map((pr) => (
                <ProjectPill key={pr.id} id={pr.id} />
              ))}
            </div>
          ) : null;
        })()}
        <Card
          title="Agreed pay"
          actions={
            c.agreedOn ? (
              <span className="biz-ok small">
                <BadgeCheck size={14} /> Agreed {fmt.dateMedium(c.agreedOn)}
                {signed ? ' · signed' : ''}
              </span>
            ) : (
              <Button size="sm" icon={CheckCircle2} disabled={c.rate == null} onClick={agree} title={c.rate == null ? 'Enter the rate first' : 'Record that you both agreed to this pay'}>
                Mark agreed
              </Button>
            )
          }
        >
          <div className="biz-form">
            <Field label="Rate type">
              <Select value={c.rateType} options={RATE_TYPES} onChange={(v) => up({ rateType: v as RateType }, false)} />
            </Field>
            <Field label={c.rateType === 'rev_share' ? 'Share (%)' : `Rate ${rateUnit}`}>
              <NumberInput decimals={c.rateType === 'rev_share' ? undefined : 2} value={c.rate} onChange={(v) => up({ rate: v })} />
            </Field>
            <Field label="What the rate covers">
              <Input value={c.rateNote} placeholder="e.g. per edited 60 s short, incl. 2 revisions" onChange={(v) => up({ rateNote: v || undefined })} />
            </Field>
            <Field label="Payment terms">
              <Input value={c.paymentTerms} placeholder="e.g. Net 15 from invoice; 50% upfront" onChange={(v) => up({ paymentTerms: v || undefined })} />
            </Field>
            <Field label="Agreed on">
              <DateInput value={c.agreedOn} onChange={(v) => up({ agreedOn: v }, false)} />
            </Field>
            <Field label="Start / end">
              <div className="row" style={{ gap: 4 }}>
                <DateInput value={c.startDate} onChange={(v) => up({ startDate: v }, false)} />
                <DateInput value={c.endDate} onChange={(v) => up({ endDate: v }, false)} />
              </div>
            </Field>
            <Field label="Scope — what they do" span="all" hint="Pre-fills the contractor agreement">
              <Textarea autoGrow minRows={2} value={c.scope} placeholder="e.g. Edit two long-form videos per month and cut three shorts from each" onChange={(v) => up({ scope: v || undefined })} />
            </Field>
          </div>
          {docs.length > 0 ? (
            <div className="biz-list" style={{ marginTop: 10 }}>
              {docs.map((d) => (
                <button key={d.id} type="button" className="biz-list-row" onClick={() => navigateSpace('legal', { docId: d.id })}>
                  <FileSignature size={14} className="muted" />
                  <span className="biz-grow ellipsis">{d.title}</span>
                  <OptionPill value={d.status} options={LEGAL_STATUSES} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small" style={{ margin: '10px 0 0' }}>
              No agreement yet.{' '}
              <button type="button" className="biz-link" onClick={() => navigateSpace('legal', { template: 'contractor', partyKind: 'contractor', partyId: c.id })}>
                Generate an Independent Contractor Agreement
              </button>{' '}
              with this rate and scope.
            </p>
          )}
        </Card>

        <div className="biz-section-head">
          <h3>Pay log</h3>
          <div className="spacer" />
          <Button size="sm" icon={Plus} onClick={logPayment}>
            Add payment
          </Button>
        </div>
        <DataTable<ContractorPayment>
          rows={pays}
          columns={cols}
          onChange={(id, patch) => updatePayment(id, patch as Partial<ContractorPayment>)}
          onDelete={(p) => removeItems('payments', [p.id])}
          showFooter
          emptyText="No payments logged. Add what you owe (their invoice) or what you paid."
        />
        <p className="muted small" style={{ margin: 0 }}>
          Owed and scheduled payments are your balance with them. Marking one paid records it as a Contractors expense.
        </p>

        <div className="biz-section-head">
          <h3>Details & tax</h3>
        </div>
        <div className="biz-form">
          <Field label="Role">
            <Input value={c.role} placeholder="e.g. Video editor" onChange={(v) => up({ role: v || undefined })} />
          </Field>
          <Field label="Company">
            <Input value={c.company} onChange={(v) => up({ company: v || undefined })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={c.email} onChange={(v) => up({ email: v || undefined })} />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={c.phone} onChange={(v) => up({ phone: v || undefined })} />
          </Field>
          <Field label="Tax form" hint="e.g. W-9 for US contractors, W-8BEN for foreign; 1099-NEC when paid $600+ in a year (US)">
            <Select value={c.taxForm ?? 'none'} options={TAX_FORM_STATUSES} onChange={(v) => up({ taxForm: v as TaxFormStatus }, false)} />
          </Field>
          <Field label="Address" span="all">
            <Textarea value={c.address} rows={2} onChange={(v) => up({ address: v || undefined })} />
          </Field>
          <Field label="Notes" span="all">
            <Textarea autoGrow minRows={2} value={c.notes} onChange={(v) => up({ notes: v || undefined })} />
          </Field>
        </div>
        <div className="biz-danger-row">
          <Button variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete contractor
          </Button>
        </div>
      </div>
      {filesPay && (
        <Modal open onClose={() => setFilesFor(null)} title={`Files · ${filesPay.description || fmt.date(filesPay.date)}`} footer={<><div className="spacer" /><Button variant="primary" onClick={() => setFilesFor(null)}>Done</Button></>}>
          <div className="col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <OptionPill value={filesPay.status} options={PAYMENT_STATUSES} />
              <Money value={filesPay.amount} strong />
              {filesPay.status === 'paid' && filesPay.paidDate && <span className="muted small">paid {fmt.dateMedium(filesPay.paidDate)}</span>}
            </div>
            <FileBox target={{ list: 'payments', id: filesPay.id, field: 'attachments' }} files={filesPay.attachments} label="Their invoice & receipts" empty="Drop their invoice or your payment confirmation here." />
          </div>
        </Modal>
      )}
    </div>
  );
}
