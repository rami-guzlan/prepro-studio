/* Business profile and invoice / time settings dialogs (used by several screens). */
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { updateSpace, useSpace } from '@/store/space';
import { Button, ColorPicker, Field, IconButton, Input, Modal, NumberInput, Select, Textarea } from '@/ui';
import { BUSINESS_TYPES, CATEGORY_COLORS } from './constants';
import { setProfile, setSettings, bizUpdate } from './ops';
import { useBiz, useFmt } from './ui';
import type { BusinessType, ExpenseCategory } from './types';
import { uid } from '@/lib/id';
import { slugify } from '@/lib/text';

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const b = useBiz();
  const title = useSpace((s) => s.meta.title);
  const p = b.profile;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Business profile"
      footer={
        <>
          <span className="muted small">Used on invoices and legal documents.</span>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="biz-form">
        <Field label="Name in the app">
          <Input value={title} onChange={(v) => updateSpace((d) => void (d.meta.title = v), { coalesce: 'biz:title' })} />
        </Field>
        <Field label="Kind of business">
          <Select value={p.type} options={BUSINESS_TYPES.map((t) => ({ value: t.value, label: `${t.emoji} ${t.label}` }))} onChange={(v) => setProfile({ type: v as BusinessType }, false)} />
        </Field>
        <Field label="Legal / registered name" hint="Printed on invoices and documents">
          <Input value={p.legalName} placeholder="e.g. Riverside Media LLC" onChange={(v) => setProfile({ legalName: v || undefined })} />
        </Field>
        <Field label="Entity type">
          <Input value={p.entityType} placeholder="e.g. limited liability company, sole proprietorship" onChange={(v) => setProfile({ entityType: v || undefined })} />
        </Field>
        <Field label="Owner / signer">
          <Input value={p.ownerName} placeholder="Who signs documents" onChange={(v) => setProfile({ ownerName: v || undefined })} />
        </Field>
        <Field label="Signer’s title">
          <Input value={p.signerTitle} placeholder="e.g. Owner, Managing Member, CEO" onChange={(v) => setProfile({ signerTitle: v || undefined })} />
        </Field>
        <Field label="Your role" hint="When the business isn’t yours alone">
          <Input value={p.role} placeholder="e.g. Co-founder, 20% partner" onChange={(v) => setProfile({ role: v || undefined })} />
        </Field>
        <Field label="Jurisdiction" hint="State / country of formation; default governing law">
          <Input value={p.jurisdiction} placeholder="e.g. California" onChange={(v) => setProfile({ jurisdiction: v || undefined })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={p.email} onChange={(v) => setProfile({ email: v || undefined })} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={p.phone} onChange={(v) => setProfile({ phone: v || undefined })} />
        </Field>
        <Field label="Website">
          <Input value={p.website} placeholder="https://…" onChange={(v) => setProfile({ website: v || undefined })} />
        </Field>
        <Field label="Tax ID (EIN / VAT)" hint="Printed on invoices when set">
          <Input value={p.taxId} onChange={(v) => setProfile({ taxId: v || undefined })} />
        </Field>
        <Field label="Address" span="all">
          <Textarea value={p.address} rows={3} placeholder="Street, city, state, postcode, country" onChange={(v) => setProfile({ address: v || undefined })} />
        </Field>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const b = useBiz();
  const st = b.settings;
  const currency = useSpace((s) => s.settings.currency);
  const fmt = useFmt();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Invoice & time settings"
      footer={
        <>
          <span className="muted small">Currency: {currency} (change it in Settings)</span>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="biz-form">
        <Field label="Invoice prefix">
          <Input value={st.invoicePrefix} placeholder="INV-" onChange={(v) => setSettings({ invoicePrefix: v })} />
        </Field>
        <Field label="Next invoice number" hint="Used when higher than your last invoice">
          <NumberInput value={st.nextInvoiceNumber} onChange={(v) => setSettings({ nextInvoiceNumber: Math.max(1, Math.round(v ?? 1)) })} />
        </Field>
        <Field label="Payment terms (days)" hint="Due date = invoice date + this">
          <NumberInput value={st.paymentTermsDays} onChange={(v) => setSettings({ paymentTermsDays: Math.max(0, Math.round(v ?? 0)) })} />
        </Field>
        <Field label="Default tax / VAT %">
          <NumberInput value={st.taxPct} onChange={(v) => setSettings({ taxPct: v || undefined })} />
        </Field>
        <Field label="Default hourly rate" hint={st.hourlyRate ? `${fmt.money(st.hourlyRate)} per hour` : 'For time entries without a client rate'}>
          <NumberInput value={st.hourlyRate} decimals={2} onChange={(v) => setSettings({ hourlyRate: v })} />
        </Field>
        <Field label="Governing law for documents" hint={`Default: ${b.profile.jurisdiction || 'your jurisdiction'}`}>
          <Input value={st.governingLaw} placeholder="e.g. the State of New York" onChange={(v) => setSettings({ governingLaw: v || undefined })} />
        </Field>
        <Field label="Payment instructions" hint="Bank details, PayPal, Stripe link … printed on invoices" span="all">
          <Textarea value={st.paymentInstructions} rows={3} placeholder={'Bank: …\nAccount name: …\nRouting / IBAN: …'} onChange={(v) => setSettings({ paymentInstructions: v || undefined })} />
        </Field>
        <Field label="Default invoice note" span="all">
          <Textarea value={st.invoiceNotes} rows={2} onChange={(v) => setSettings({ invoiceNotes: v || undefined })} />
        </Field>
      </div>
    </Modal>
  );
}

/** Edit expense categories (labels, colours, add, remove). */
export function CategoriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const b = useBiz();
  const cats = b.settings.expenseCategories;
  const [name, setName] = useState('');
  const used = (id: string) => b.expenses.filter((e) => e.category === id).length;
  const set = (next: ExpenseCategory[], coalesce?: string) => bizUpdate((d) => void (d.settings.expenseCategories = next), coalesce ? { coalesce } : undefined);
  const add = () => {
    const label = name.trim();
    if (!label) return;
    let id = slugify(label, 24) || uid('cat');
    if (cats.some((c) => c.id === id)) id = `${id}-${uid('', 4)}`;
    set([...cats, { id, label, color: CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length] }]);
    setName('');
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Expense categories"
      footer={
        <>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 6 }}>
        {cats.map((c, i) => (
          <div key={c.id} className="biz-cat-row">
            <ColorPicker value={c.color} allowCustom={false} swatches={CATEGORY_COLORS} onChange={(v) => set(cats.map((x, j) => (j === i ? { ...x, color: v ?? x.color } : x)))} />
            <Input value={c.label} onChange={(v) => set(cats.map((x, j) => (j === i ? { ...x, label: v } : x)), `biz:cat:${c.id}`)} />
            <span className="muted small biz-cat-count">{used(c.id) || ''}</span>
            <IconButton
              icon={Trash2}
              label={used(c.id) ? 'In use — move its expenses first' : 'Remove category'}
              disabled={used(c.id) > 0 || cats.length <= 1}
              onClick={() => set(cats.filter((x) => x.id !== c.id))}
            />
          </div>
        ))}
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <Input value={name} placeholder="New category, e.g. Studio rent" onChange={setName} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button icon={Plus} disabled={!name.trim()} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
