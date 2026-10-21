/* Clients: who pays you — contact details, default rate and terms, and totals
   billed / paid / outstanding, with their invoices, time and documents. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { Archive, ArrowLeft, FileSignature, FileText, Mail, Phone, Play, Plus, Trash2, UserRound } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { safeFileName, plural } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Avatar, Button, Checkbox, EmptyState, ExportMenu, Field, Input, ModuleHeader, NumberInput, SearchInput, Textarea, confirmDialog, toast } from '@/ui';
import { StatTile } from '@/ui/charts';
import { INVOICE_STATUSES, LEGAL_STATUSES, PROJECT_STATUSES } from '../../constants';
import { isOpenProject, projectFinancials } from '../../derive-work';
import { ProjectPill, projectColor } from '../projects/link';
import { clientName, clientTotals, formatDuration, invoiceStatus, invoiceTotal } from '../../derive';
import { addItem, createInvoice, makeClient, removeItems, startTimer, updateItem } from '../../ops';
import { TEMPLATE_BY_ID } from '../../templates';
import { Money, OptionPill, rowKeys, useBiz, useFmt, useNavParams, useToday } from '../../ui';
import type { Client } from '../../types';

export default function ClientsModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const today = useToday();
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.client.${spaceId}`, null));
  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.client.${spaceId}`, id);
  };
  const add = () => {
    const c = makeClient({ name: 'New client' });
    addItem('clients', c);
    select(c.id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.biz-client-name input')?.select());
  };
  useNavParams((p) => {
    if (p.clientId && b.clients.some((c) => c.id === p.clientId)) select(p.clientId);
    if (p.new) add();
  });

  const totals = useMemo(() => new Map(b.clients.map((c) => [c.id, clientTotals(b, c.id, today)])), [b, today]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return b.clients.filter((c) => (archived || !c.archived || c.id === sel) && (!s || [c.name, c.company, c.email, c.notes].join(' ').toLowerCase().includes(s))).sort((a, z) => clientName(a).localeCompare(clientName(z)));
  }, [b.clients, q, archived, sel]);
  const c = b.clients.find((x) => x.id === sel);
  const outstanding = [...totals.values()].reduce((n, t) => n + t.outstanding, 0);

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Clients`), b.clients, [
      { header: 'Name', value: (x) => x.name },
      { header: 'Company', value: (x) => x.company },
      { header: 'Email', value: (x) => x.email },
      { header: 'Phone', value: (x) => x.phone },
      { header: 'Address', value: (x) => x.address },
      { header: 'Default rate', value: (x) => x.defaultRate },
      { header: 'Billed', value: (x) => totals.get(x.id)?.billed },
      { header: 'Paid', value: (x) => totals.get(x.id)?.paid },
      { header: 'Outstanding', value: (x) => totals.get(x.id)?.outstanding },
    ]);
    if (path) toast(`Exported ${b.clients.length} clients`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Clients"
        icon={UserRound}
        subtitle={b.clients.length ? `${b.clients.filter((x) => !x.archived).length} active · ${fmt.money(outstanding)} outstanding` : 'Who pays you'}
        actions={
          <>
            <ExportMenu csv={[{ label: 'Clients (CSV)', onClick: () => void exportList() }]} />
            <Button variant="primary" icon={Plus} onClick={add}>
              Add client
            </Button>
          </>
        }
      />
      <div className={`biz-split ${c ? 'has-sel' : ''}`}>
        <div className="biz-split-list">
          <div className="biz-split-tools">
            <SearchInput value={q} onChange={setQ} placeholder="Search clients…" width="100%" />
            {b.clients.some((x) => x.archived) && <Checkbox checked={archived} onChange={setArchived} label="Show archived" />}
          </div>
          <div className="biz-split-items">
            {list.length === 0 ? (
              <div className="biz-empty-line" style={{ padding: 16 }}>
                {b.clients.length ? 'No client matches.' : 'No clients yet.'}
              </div>
            ) : (
              list.map((x) => {
                const t = totals.get(x.id)!;
                return (
                  <div key={x.id} role="button" className={`biz-item ${x.id === sel ? 'on' : ''} ${x.archived ? 'off' : ''}`} onClick={() => select(x.id)} {...rowKeys(() => select(x.id))}>
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={clientName(x)} size={30} />
                      <div className="biz-grow" style={{ minWidth: 0 }}>
                        <div className="ellipsis biz-strong">{clientName(x)}</div>
                        <div className="ellipsis muted small">{x.company && x.name ? x.company : x.email || ' '}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Money value={t.billed} />
                        {t.outstanding > 0 && <div className="tiny biz-warn">{fmt.money(t.outstanding, { cents: false })} open</div>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="biz-split-main">
          {c ? (
            <ClientDetail key={c.id} c={c} onBack={() => select(null)} onDeleted={() => select(null)} />
          ) : (
            <EmptyState
              icon={UserRound}
              title={b.clients.length ? 'Pick a client' : 'Add your clients'}
              description="Keep contact details, default rates and payment terms in one place. Invoices, time and documents pull them in automatically."
              action={
                <Button variant="primary" icon={Plus} onClick={add}>
                  Add client
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ClientDetail({ c, onBack, onDeleted }: { c: Client; onBack: () => void; onDeleted: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const t = clientTotals(b, c.id, today);
  const up = (patch: Partial<Client>, coalesce = true) => updateItem('clients', c.id, patch, coalesce);
  const invoices = b.invoices.filter((i) => i.clientId === c.id).sort((a, z) => (z.issueDate || '').localeCompare(a.issueDate || ''));
  const time = b.time.filter((x) => x.clientId === c.id).sort((a, z) => z.date.localeCompare(a.date));
  const docs = b.docs.filter((d) => d.partyKind === 'client' && d.partyId === c.id);
  const projects = b.projects.filter((x) => x.clientId === c.id).sort((a, z) => Number(isOpenProject(z)) - Number(isOpenProject(a)) || (z.startDate ?? '').localeCompare(a.startDate ?? ''));
  const remove = async () => {
    const used = invoices.length + time.length;
    const ok = await confirmDialog({
      title: `Delete ${clientName(c)}?`,
      message: used ? `${plural(invoices.length, 'invoice')} and ${plural(time.length, 'time entry', 'time entries')} keep their amounts but lose the client. Consider archiving instead. You can undo with Ctrl+Z.` : 'You can undo with Ctrl+Z.',
      confirmLabel: 'Delete client',
      danger: true,
    });
    if (!ok) return;
    removeItems('clients', [c.id]);
    onDeleted();
  };
  return (
    <div className="biz-editor">
      <div className="biz-editor-head">
        <Button className="biz-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Clients
        </Button>
        <div className="biz-editor-title biz-client-name">
          <Avatar name={clientName(c)} size={34} />
          <Input value={c.name} placeholder="Client name" onChange={(v) => up({ name: v })} aria-label="Client name" />
        </div>
        <div className="biz-editor-actions">
          <Button icon={Play} disabled={!!b.timer} onClick={() => { startTimer({ clientId: c.id }); navigateSpace('time'); }}>
            Track time
          </Button>
          <Button icon={FileSignature} onClick={() => navigateSpace('legal', { template: 'services', partyKind: 'client', partyId: c.id })}>
            Agreement
          </Button>
          <Button variant="primary" icon={FileText} onClick={() => { const inv = createInvoice({ clientId: c.id }); navigateSpace('invoices', { invoiceId: inv.id }); }}>
            New invoice
          </Button>
        </div>
      </div>
      <div className="biz-editor-body">
        <div className="biz-kpis small">
          <StatTile label="Billed" value={fmt.money(t.billed, { cents: false })} sub={plural(t.invoices, 'invoice')} />
          <StatTile label="Received" value={fmt.money(t.paid, { cents: false })} />
          <StatTile label="Outstanding" value={fmt.money(t.outstanding, { cents: false })} />
          <StatTile label="Time" value={`${t.hours}h`} sub={t.unbilled ? `${fmt.money(t.unbilled, { cents: false })} unbilled` : undefined} />
        </div>
        <div className="biz-form">
          <Field label="Company">
            <Input value={c.company} onChange={(v) => up({ company: v || undefined })} />
          </Field>
          <Field label="Email">
            <div className="row" style={{ gap: 4 }}>
              <Input type="email" value={c.email} onChange={(v) => up({ email: v || undefined })} />
              {c.email && (
                <a className="btn icon" href={`mailto:${c.email}`} aria-label="Email" title="Email">
                  <Mail size={15} />
                </a>
              )}
            </div>
          </Field>
          <Field label="Phone">
            <div className="row" style={{ gap: 4 }}>
              <Input type="tel" value={c.phone} onChange={(v) => up({ phone: v || undefined })} />
              {c.phone && (
                <a className="btn icon" href={`tel:${c.phone}`} aria-label="Call" title="Call">
                  <Phone size={15} />
                </a>
              )}
            </div>
          </Field>
          <Field label="Default hourly rate" hint={b.settings.hourlyRate ? `Business default ${fmt.money(b.settings.hourlyRate)}` : undefined}>
            <NumberInput decimals={2} value={c.defaultRate} onChange={(v) => up({ defaultRate: v })} />
          </Field>
          <Field label="Payment terms (days)" hint={`Default ${b.settings.paymentTermsDays}`}>
            <NumberInput value={c.termsDays} onChange={(v) => up({ termsDays: v == null ? undefined : Math.max(0, Math.round(v)) })} />
          </Field>
          <Field label=" ">
            <Checkbox checked={c.archived} onChange={(v) => up({ archived: v || undefined }, false)} label="Archived (hidden from pickers)" />
          </Field>
          <Field label="Billing address" span="all">
            <Textarea value={c.address} rows={3} onChange={(v) => up({ address: v || undefined })} />
          </Field>
          <Field label="Notes" span="all">
            <Textarea autoGrow minRows={2} value={c.notes} placeholder="How they like to work, PO process, who approves invoices…" onChange={(v) => up({ notes: v || undefined })} />
          </Field>
        </div>

        <div className="biz-section-head">
          <h3>Projects</h3>
          <div className="spacer" />
          <Button size="sm" icon={Plus} onClick={() => navigateSpace('projects', { new: true, clientId: c.id })}>
            New project
          </Button>
        </div>
        {projects.length === 0 ? (
          <div className="biz-empty-line">No projects for this client yet — a project groups the work, invoices, costs and documents of one job.</div>
        ) : (
          <div className="biz-list">
            {projects.map((pr) => {
              const pf = projectFinancials(b, pr, today);
              return (
                <button key={pr.id} type="button" className="biz-list-row" onClick={() => navigateSpace('projects', { projectId: pr.id })}>
                  <span className="wk-dot" style={{ background: projectColor(pr) }} />
                  <span className="biz-grow">
                    <span className="ellipsis biz-strong">{pr.name || 'Untitled project'}</span>
                    <span className="ellipsis muted tiny">
                      {pr.dueDate ? `due ${fmt.dateShort(pr.dueDate)}` : 'no due date'}
                      {pf.tasksTotal ? ` · ${pf.tasksDone}/${pf.tasksTotal} tasks` : ''}
                      {pf.toInvoice > 0 && isOpenProject(pr) ? ` · ${fmt.money(pf.toInvoice, { cents: false })} to invoice` : ''}
                    </span>
                  </span>
                  <OptionPill value={pr.status} options={PROJECT_STATUSES} />
                  <Money value={pf.fee} />
                </button>
              );
            })}
          </div>
        )}

        <div className="biz-section-head">
          <h3>Invoices</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="biz-empty-line">No invoices for this client yet.</div>
        ) : (
          <div className="biz-list">
            {invoices.map((inv) => (
              <button key={inv.id} type="button" className="biz-list-row" onClick={() => navigateSpace('invoices', { invoiceId: inv.id })}>
                <span className="biz-mono">{inv.number}</span>
                <span className="biz-grow ellipsis muted small">{fmt.date(inv.issueDate)}{inv.title ? ` · ${inv.title}` : ''}</span>
                <ProjectPill id={inv.bizProjectId} static />
                <OptionPill value={invoiceStatus(inv, today)} options={INVOICE_STATUSES} />
                <Money value={invoiceTotal(inv)} />
              </button>
            ))}
          </div>
        )}

        {time.length > 0 && (
          <>
            <div className="biz-section-head">
              <h3>Recent time</h3>
              <div className="spacer" />
              <Button size="sm" variant="ghost" onClick={() => navigateSpace('time')}>
                All time
              </Button>
            </div>
            <div className="biz-list">
              {time.slice(0, 6).map((e) => (
                <button key={e.id} type="button" className="biz-list-row" onClick={() => navigateSpace('time', { entryId: e.id })}>
                  <span className="biz-date">{fmt.dateShort(e.date)}</span>
                  <span className="biz-grow ellipsis">{e.description || 'Time'}</span>
                  <span className="small">{formatDuration(e.minutes)}</span>
                  {e.billable && !e.invoiceId && <span className="biz-tag">Unbilled</span>}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="biz-section-head">
          <h3>Documents</h3>
        </div>
        {docs.length === 0 ? (
          <div className="biz-empty-line">No agreements with this client yet.</div>
        ) : (
          <div className="biz-list">
            {docs.map((d) => (
              <button key={d.id} type="button" className="biz-list-row" onClick={() => navigateSpace('legal', { docId: d.id })}>
                <FileSignature size={14} className="muted" />
                <span className="biz-grow ellipsis">{d.title || TEMPLATE_BY_ID[d.templateId]?.name}</span>
                <OptionPill value={d.status} options={LEGAL_STATUSES} />
              </button>
            ))}
          </div>
        )}

        <div className="biz-danger-row">
          <Button variant="ghost" icon={Archive} onClick={() => up({ archived: !c.archived || undefined }, false)}>
            {c.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete client
          </Button>
        </div>
      </div>
    </div>
  );
}
