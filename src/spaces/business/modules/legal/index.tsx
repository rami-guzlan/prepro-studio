/* Legal documents: generate personalised agreements, NDAs, releases and letters
   from templates, preview them as formatted documents, export PDFs, and track
   status (draft → sent → signed / expired) with the signed copy attached. */
import '../../biz.css';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ClipboardCopy, Copy, Eye, FileDown, FileSignature, ListChecks, MoreHorizontal, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { plural } from '@/lib/text';
import { openPrint, readLS, writeLS } from '@/store/app';
import { uid } from '@/lib/id';
import { Button, DateInput, EmptyState, Field, Input, Menu, Modal, ModuleHeader, NumberInput, SearchInput, Select, Tabs, Textarea, confirmDialog, toast } from '@/ui';
import { LEGAL_STATUSES } from '../../constants';
import { clientName } from '../../derive';
import { addDoc, bizUpdate, removeItems, updateDocParty, updateDocVars, updateItem } from '../../ops';
import { FileBox, canStorePdf, storePdfCopy } from '../../files';
import { LEGAL_DISCLAIMER, LEGAL_TEMPLATES, TEMPLATE_BY_ID, buildLegal, draftDoc, legalText, longDate, missingRequired, ourVars, partyFrom, type TemplateField } from '../../templates';
import { LegalDocView } from '../../LegalDocView';
import { OptionPill, rowKeys, useBiz, useFmt, useNavParams, useToday } from '../../ui';
import type { LegalDoc, LegalStatus, LegalTemplateId } from '../../types';
import { ProjectPill, ProjectSelect } from '../projects/link';

export default function LegalModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.doc.${spaceId}`, null));
  const [create, setCreate] = useState<{ templateId?: LegalTemplateId; partyKind?: LegalDoc['partyKind']; partyId?: string; bizProjectId?: string } | null>(null);
  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.doc.${spaceId}`, id);
  };
  useNavParams((p) => {
    if (p.docId && b.docs.some((d) => d.id === p.docId)) select(p.docId);
    if (p.template && TEMPLATE_BY_ID[p.template as LegalTemplateId]) setCreate({ templateId: p.template, partyKind: p.partyKind, partyId: p.partyId, bizProjectId: p.bizProjectId && b.projects.some((x) => x.id === p.bizProjectId) ? p.bizProjectId : undefined });
  });
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...b.docs].filter((d) => !s || [d.title, d.party.name, d.party.company, TEMPLATE_BY_ID[d.templateId]?.name].join(' ').toLowerCase().includes(s)).sort((a, z) => (z.createdAt || '').localeCompare(a.createdAt || ''));
  }, [b.docs, q]);
  const doc = b.docs.find((d) => d.id === sel);
  const pending = b.docs.filter((d) => d.status === 'sent').length;

  return (
    <div className="module biz">
      <ModuleHeader
        title="Legal Documents"
        icon={FileSignature}
        subtitle={b.docs.length ? `${plural(b.docs.length, 'document')} · ${b.docs.filter((d) => d.status === 'signed').length} signed${pending ? ` · ${pending} awaiting signature` : ''}` : 'Agreements, NDAs, releases and letters'}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreate({})}>
            New document
          </Button>
        }
      />
      <div className="biz-disclaimer" role="note">
        <AlertTriangle size={15} />
        <span>
          <b>Template, not legal advice</b> — have a lawyer review before signing. Laws differ by country and state; adapt the documents to your situation.
        </span>
      </div>
      <div className={`biz-split ${doc ? 'has-sel' : ''}`}>
        <div className="biz-split-list">
          <div className="biz-split-tools">
            <SearchInput value={q} onChange={setQ} placeholder="Search documents…" width="100%" />
          </div>
          <div className="biz-split-items">
            {list.length === 0 ? (
              <div className="biz-empty-line" style={{ padding: 16 }}>
                {b.docs.length ? 'No document matches.' : 'No documents yet.'}
              </div>
            ) : (
              list.map((d) => (
                <div key={d.id} role="button" className={`biz-item ${d.id === sel ? 'on' : ''}`} onClick={() => select(d.id)} {...rowKeys(() => select(d.id))}>
                  <div className="ellipsis biz-strong">{d.title || TEMPLATE_BY_ID[d.templateId]?.name}</div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="biz-grow ellipsis muted small">{TEMPLATE_BY_ID[d.templateId]?.name}</span>
                    <OptionPill value={d.status} options={LEGAL_STATUSES} />
                  </div>
                  <div className="muted tiny row" style={{ gap: 6 }}>
                    <ProjectPill id={d.bizProjectId ?? b.projects.find((x) => x.docIds.includes(d.id))?.id} static />
                    <span className="biz-grow ellipsis">{d.status === 'signed' && d.signedDate ? `Signed ${fmt.dateMedium(d.signedDate)}` : d.status === 'sent' && d.sentDate ? `Sent ${fmt.dateMedium(d.sentDate)}` : `Created ${fmt.dateMedium(d.createdAt)}`}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="biz-split-main">
          {doc ? (
            <DocEditor key={doc.id} doc={doc} onBack={() => select(null)} onSelect={select} />
          ) : (
            <div className="biz-page">
              <EmptyState
                icon={FileSignature}
                title={b.docs.length ? 'Pick a document' : 'Generate your first agreement'}
                description="Pick a template, choose the client or contractor, fill a short form — the document is written with your business details, numbered sections and signature blocks."
              />
              <div className="biz-templates">
                {LEGAL_TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="biz-template" onClick={() => setCreate({ templateId: t.id })}>
                    <FileSignature size={18} />
                    <b>{t.name}</b>
                    <span className="muted small">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {create && (
        <NewDocDialog
          initial={create}
          onClose={() => setCreate(null)}
          onCreated={(id) => {
            setCreate(null);
            select(id);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- new document */

function NewDocDialog({ initial, onClose, onCreated }: { initial: { templateId?: LegalTemplateId; partyKind?: LegalDoc['partyKind']; partyId?: string; bizProjectId?: string }; onClose: () => void; onCreated: (id: string) => void }) {
  const b = useBiz();
  const title = useSpace((s) => s.meta.title);
  const fmt = useFmt();
  const [tid, setTid] = useState<LegalTemplateId>(initial.templateId ?? 'contractor');
  const t = TEMPLATE_BY_ID[tid];
  const [kind, setKind] = useState<LegalDoc['partyKind']>(initial.partyKind && t.partyKinds.includes(initial.partyKind) ? initial.partyKind : t.defaultPartyKind);
  const [partyId, setPartyId] = useState(initial.partyId ?? '');
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(initial.bizProjectId);
  const pick = (id: LegalTemplateId) => {
    setTid(id);
    const nt = TEMPLATE_BY_ID[id];
    if (!nt.partyKinds.includes(kind)) {
      setKind(nt.defaultPartyKind);
      setPartyId('');
    }
  };
  const options = kind === 'client' ? b.clients.filter((c) => !c.archived).map((c) => ({ value: c.id, label: clientName(c) })) : kind === 'contractor' ? b.contractors.map((c) => ({ value: c.id, label: c.name || 'Unnamed' })) : [];
  const ok = kind === 'other' ? !!name.trim() : !!partyId;
  const create = () => {
    if (!ok) return;
    const d = draftDoc(b, title, tid, kind, kind === 'other' ? undefined : partyId, (n) => fmt.money(n), kind === 'other' ? name.trim() : undefined);
    if (projectId && b.projects.some((x) => x.id === projectId)) d.bizProjectId = projectId;
    addDoc(d);
    onCreated(d.id);
  };
  const kindLabel = { client: 'Client', contractor: 'Contractor', other: 'Someone else' };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New legal document"
      footer={
        <>
          <span className="muted small biz-hide-narrow">{LEGAL_DISCLAIMER}</span>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={create}>
            Create document
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="biz-templates compact">
          {LEGAL_TEMPLATES.map((x) => (
            <button key={x.id} type="button" className={`biz-template ${x.id === tid ? 'on' : ''}`} onClick={() => pick(x.id)}>
              <b>{x.name}</b>
              <span className="muted small">{x.description}</span>
            </button>
          ))}
        </div>
        <div className="biz-form">
          <Field label="With">
            <Select
              value={kind}
              options={t.partyKinds.map((k) => ({ value: k, label: kindLabel[k] }))}
              onChange={(v) => {
                setKind(v as LegalDoc['partyKind']);
                setPartyId('');
              }}
            />
          </Field>
          {kind === 'other' ? (
            <Field label="Their name">
              <Input autoFocus value={name} placeholder="Person or company" onChange={setName} onKeyDown={(e) => e.key === 'Enter' && create()} />
            </Field>
          ) : (
            <Field label={kindLabel[kind]} hint={options.length ? undefined : `Add ${kind === 'client' ? 'a client in Clients' : 'a contractor in Contractors'} first, or choose “Someone else”.`}>
              <Select value={partyId} placeholder={options.length ? 'Choose…' : 'None yet'} options={options} onChange={setPartyId} />
            </Field>
          )}
          {b.projects.length > 0 && (
            <Field label="Project">
              <ProjectSelect value={projectId} onChange={setProjectId} />
            </Field>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          The document is filled with your business profile{kind === 'contractor' ? ', the contractor’s agreed rate, terms and scope' : kind === 'client' ? ', the client’s details, rate and terms' : ''}. You can edit every value afterwards.
        </p>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- editor */

function VarField({ f, value, onChange }: { f: TemplateField; value: string | undefined; onChange: (v: string | undefined) => void }) {
  switch (f.type) {
    case 'longtext':
      return <Textarea autoGrow minRows={2} value={value} placeholder={f.placeholder} onChange={(v) => onChange(v || undefined)} />;
    case 'date':
      return <DateInput value={value} onChange={onChange} />;
    case 'money':
      return <NumberInput decimals={2} value={value != null && value !== '' ? Number(value) : undefined} placeholder={f.placeholder} onChange={(v) => onChange(v == null ? undefined : String(v))} />;
    case 'number':
    case 'percent':
      return <NumberInput value={value != null && value !== '' ? Number(value) : undefined} placeholder={f.placeholder} onChange={(v) => onChange(v == null ? undefined : String(v))} />;
    case 'select':
      return <Select value={value ?? ''} options={f.options ?? []} placeholder="—" onChange={(v) => onChange(v || undefined)} />;
    default:
      return <Input value={value} placeholder={f.placeholder} onChange={(v) => onChange(v || undefined)} />;
  }
}

function DocEditor({ doc, onBack, onSelect }: { doc: LegalDoc; onBack: () => void; onSelect: (id: ID | null) => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const spaceTitle = useSpace((s) => s.meta.title);
  const [view, setView] = useState<'form' | 'preview'>('form');
  const t = TEMPLATE_BY_ID[doc.templateId];
  const built = useMemo(() => buildLegal(doc, (n) => fmt.money(n)), [doc, fmt]);
  const missing = missingRequired(t, doc.vars, doc.party);
  const up = (patch: Partial<LegalDoc>, coalesce = true) => updateItem('docs', doc.id, patch, coalesce);
  const setVar = (key: string, v: string | undefined) => updateDocVars(doc.id, { [key]: v });
  const roles = t.roles(doc.partyKind);
  const linked = doc.partyKind === 'client' ? b.clients.find((c) => c.id === doc.partyId) : doc.partyKind === 'contractor' ? b.contractors.find((c) => c.id === doc.partyId) : undefined;

  const setStatus = (s: LegalStatus) => {
    const patch: Partial<LegalDoc> = { status: s };
    if (s === 'sent' && !doc.sentDate) patch.sentDate = today;
    if (s === 'signed' && !doc.signedDate) patch.signedDate = today;
    up(patch, false);
    if (s === 'signed' && !(doc.attachments ?? []).length) toast('Marked signed — attach the signed copy below', 'info');
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(legalText(built));
      toast('Document text copied');
    } catch {
      toast('Could not copy to the clipboard', 'error');
    }
  };

  const duplicate = () => {
    const copy: LegalDoc = { ...JSON.parse(JSON.stringify(doc)), id: uid('doc'), title: `${doc.title} (copy)`, status: 'draft', createdAt: today, attachments: [], sentDate: undefined, signedDate: undefined };
    addDoc(copy);
    onSelect(copy.id);
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete “${doc.title}”?`, message: doc.attachments?.length ? 'Its attached files are removed too. You can undo with Ctrl+Z.' : 'You can undo with Ctrl+Z.', confirmLabel: 'Delete document', danger: true }))) return;
    removeItems('docs', [doc.id]);
    onSelect(null);
  };

  const refreshParty = () => {
    if (!linked) return;
    const p = partyFrom(doc.partyKind, doc.partyKind === 'client' ? (linked as any) : undefined, doc.partyKind === 'contractor' ? (linked as any) : undefined);
    up({ party: { ...doc.party, ...p } }, false);
    toast('Updated from the saved details');
  };

  const refreshOurs = () => {
    updateDocVars(doc.id, ourVars(b, spaceTitle));
    toast('Updated from your business profile');
  };

  const fields = t.fields.filter((f) => !f.when || f.when(doc.vars));

  return (
    <div className="biz-editor">
      <div className="biz-editor-head">
        <Button className="biz-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Documents
        </Button>
        <div className="biz-editor-title">
          <Input value={doc.title} placeholder="Document title" onChange={(v) => up({ title: v })} aria-label="Document title" />
        </div>
        <div className="biz-editor-actions">
          <Select value={doc.status} options={LEGAL_STATUSES} onChange={(v) => setStatus(v as LegalStatus)} aria-label="Status" />
          <Button icon={Printer} onClick={() => openPrint('space-biz-legal', { doc: doc.id })}>
            PDF
          </Button>
          <Menu
            align="end"
            trigger={<Button icon={MoreHorizontal} aria-label="More actions" />}
            items={[
              { label: 'Copy as text', icon: ClipboardCopy, onClick: () => void copyText() },
              ...(canStorePdf() ? [{ label: 'Save a PDF copy with the document', icon: FileDown, onClick: () => void storePdfCopy({ list: 'docs', id: doc.id, field: 'attachments' }, 'space-biz-legal', { doc: doc.id, disclaimer: false }, doc.title) }] : []),
              { label: 'Duplicate', icon: Copy, onClick: duplicate },
              { separator: true },
              { label: 'Delete…', icon: Trash2, danger: true, onClick: () => void remove() },
            ]}
          />
        </div>
      </div>
      <div className="biz-legal-tabs">
        <Tabs<'form' | 'preview'>
          value={view}
          onChange={setView}
          tabs={[
            { id: 'form', label: 'Details', icon: ListChecks, count: missing.length || undefined },
            { id: 'preview', label: 'Preview', icon: Eye },
          ]}
        />
      </div>
      <div className={`biz-legal view-${view}`}>
        <div className="biz-legal-form">
          {missing.length > 0 && (
            <div className="biz-note warn">
              <AlertTriangle size={14} /> Still to fill in: {missing.join(', ')}.
            </div>
          )}
          <div className="biz-form">
            <Field label="Status dates" span="all">
              <div className="biz-form biz-form-tight">
                <Field label="Sent">
                  <DateInput value={doc.sentDate} onChange={(v) => up({ sentDate: v }, false)} />
                </Field>
                <Field label="Signed">
                  <DateInput value={doc.signedDate} onChange={(v) => up({ signedDate: v, ...(v && doc.status !== 'signed' ? { status: 'signed' as LegalStatus } : {}) }, false)} />
                </Field>
                <Field label="Ends / expires">
                  <DateInput value={doc.expiresDate} onChange={(v) => up({ expiresDate: v }, false)} />
                </Field>
              </div>
            </Field>
            <Field label="Project">
              <ProjectSelect
                value={doc.bizProjectId ?? b.projects.find((x) => x.docIds.includes(doc.id))?.id}
                onChange={(id) => {
                  bizUpdate((d) => {
                    const x = d.docs.find((y) => y.id === doc.id);
                    if (!x) return;
                    if (id) x.bizProjectId = id;
                    else delete x.bizProjectId;
                    for (const pr of d.projects) if (pr.id !== id) pr.docIds = pr.docIds.filter((y) => y !== doc.id);
                  });
                }}
              />
            </Field>
          </div>

          <div className="biz-section-head">
            <h3>{roles.them}</h3>
            <div className="spacer" />
            {linked && (
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refreshParty}>
                Refresh from {doc.partyKind}
              </Button>
            )}
          </div>
          <div className="biz-form">
            <Field label="Name">
              <Input value={doc.party.name} onChange={(v) => updateDocParty(doc.id, { name: v })} />
            </Field>
            <Field label="Company">
              <Input value={doc.party.company} onChange={(v) => updateDocParty(doc.id, { company: v || undefined })} />
            </Field>
            <Field label="Signer’s title">
              <Input value={doc.party.title} placeholder="e.g. Director" onChange={(v) => updateDocParty(doc.id, { title: v || undefined })} />
            </Field>
            <Field label="Email">
              <Input value={doc.party.email} onChange={(v) => updateDocParty(doc.id, { email: v || undefined })} />
            </Field>
            <Field label="Address" span="all">
              <Textarea rows={2} value={doc.party.address} onChange={(v) => updateDocParty(doc.id, { address: v || undefined })} />
            </Field>
          </div>

          <div className="biz-section-head">
            <h3>{t.name}</h3>
          </div>
          <div className="biz-form">
            {fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint} span={f.type === 'longtext' ? 'all' : undefined}>
                <VarField f={f} value={doc.vars[f.key]} onChange={(v) => setVar(f.key, v)} />
              </Field>
            ))}
          </div>

          <div className="biz-section-head">
            <h3>You ({roles.us})</h3>
            <div className="spacer" />
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refreshOurs}>
              Refresh from profile
            </Button>
          </div>
          <div className="biz-form">
            <Field label="Legal name">
              <Input value={doc.vars.ourName} onChange={(v) => setVar('ourName', v || undefined)} />
            </Field>
            <Field label="Entity description" hint="e.g. a California limited liability company">
              <Input value={doc.vars.ourEntity} onChange={(v) => setVar('ourEntity', v || undefined)} />
            </Field>
            <Field label="Signer">
              <Input value={doc.vars.ourSigner} onChange={(v) => setVar('ourSigner', v || undefined)} />
            </Field>
            <Field label="Signer’s title">
              <Input value={doc.vars.ourTitle} onChange={(v) => setVar('ourTitle', v || undefined)} />
            </Field>
            <Field label="Email">
              <Input value={doc.vars.ourEmail} onChange={(v) => setVar('ourEmail', v || undefined)} />
            </Field>
            <Field label="Address" span="all">
              <Textarea rows={2} value={doc.vars.ourAddress} onChange={(v) => setVar('ourAddress', v || undefined)} />
            </Field>
            <Field label="Private notes" span="all">
              <Textarea autoGrow minRows={1} value={doc.notes} placeholder="Not printed" onChange={(v) => up({ notes: v || undefined })} />
            </Field>
          </div>
          <FileBox target={{ list: 'docs', id: doc.id, field: 'attachments' }} files={doc.attachments} label="Signed copy & files" empty="Drop the signed PDF (or a scan) here once it’s signed." />
        </div>
        <div className="biz-legal-preview">
          <div className="biz-paper">
            <LegalDocView doc={built} signedDate={doc.status === 'signed' && doc.signedDate ? longDate(doc.signedDate) : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}
