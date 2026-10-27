/* Contacts & Vendors module: clients, agencies, vendors, rental houses, post facilities… */
import './contacts.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookUser, Copy, ExternalLink, Mail, MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import type { Contact, ContactCategory, ID } from '@/types';
import { getProject, listOps, undo, update, useProject } from '@/store/project';
import { useApp } from '@/store/app';
import { CONTACT_CATEGORIES, optionLabel } from '@/lib/constants';
import type { CsvColumn } from '@/lib/csv';
import { uid } from '@/lib/id';
import { matchesQuery, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { backend, exportCsv } from '@/backend';
import { safeFileName } from '@/lib/text';
import {
  Button,
  confirmDialog,
  DataTable,
  EmptyState,
  ExportMenu,
  Input,
  isModalOpen,
  ModuleHeader,
  SearchInput,
  Select,
  toast,
  Toolbar,
  type Column,
  type MenuItem,
} from '@/ui';

const ops = listOps<Contact>((d) => d.contacts, 'contacts');
const CATEGORY_LABELS = CONTACT_CATEGORIES.map((c) => c.label);
const catLabel = (c: Contact) => optionLabel(CONTACT_CATEGORIES, c.category) || 'Other';

/* ------------------------------------------------------------------ helpers */

function openExternal(url: string) {
  if (backend.openExternal) backend.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}
const telUrl = (s: string) => `tel:${s.replace(/[^\d+*#,;]/g, '')}`;
const webUrl = (s: string) => (/^[a-z][a-z0-9+.-]*:/i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);
const mapsUrl = (s: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.trim())}`;

/** Minimum table width so the fixed-layout table keeps its column widths (and scrolls horizontally when narrow). */
function tableMinWidth(cols: { width?: number | string; minWidth?: number; hidden?: boolean }[], extra = 0): number {
  return cols.filter((c) => !c.hidden).reduce((a, c) => a + (typeof c.width === 'number' ? c.width : c.minWidth ?? 160), 0) + extra;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .ProseMirror');
}

/** Inline-editable cell with a hover action button (call / email / open). */
function LinkCell({ value, onChange, kind, placeholder }: { value?: string; onChange: (v: string) => void; kind: 'tel' | 'email' | 'url'; placeholder?: string }) {
  const v = value?.trim() ?? '';
  const Icon = kind === 'tel' ? Phone : kind === 'email' ? Mail : ExternalLink;
  const label = kind === 'tel' ? 'Call' : kind === 'email' ? 'Send email' : 'Open website';
  return (
    <div className="ct-linkcell">
      <Input bare size="sm" type={kind === 'url' ? 'text' : kind} value={value} placeholder={placeholder} onChange={onChange} />
      {v && (
        <button type="button" className="btn ghost sm icon ct-linkbtn" title={label} aria-label={label} onClick={() => openExternal(kind === 'tel' ? telUrl(v) : kind === 'email' ? `mailto:${v}` : webUrl(v))}>
          <Icon />
        </button>
      )}
    </div>
  );
}

function addContact(category: ContactCategory): ID {
  const id = uid('ct');
  update((d) => {
    // keep new rows next to their category
    let at = -1;
    d.contacts.forEach((c, i) => {
      if (c.category === category) at = i;
    });
    const item: Contact = { id, name: '', category };
    if (at < 0) d.contacts.push(item);
    else d.contacts.splice(at + 1, 0, item);
  });
  return id;
}

async function deleteContact(id: ID): Promise<boolean> {
  const c = getProject().contacts.find((x) => x.id === id);
  if (!c) return false;
  const label = c.name || c.company || 'this contact';
  const ok = await confirmDialog({ title: `Delete ${label}?`, message: [c.company, c.role].filter(Boolean).join(' · ') || undefined, confirmLabel: 'Delete', danger: true });
  if (!ok) return false;
  ops.remove(id);
  toast(`Deleted ${label}`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
  return true;
}

async function exportContactsCsv() {
  const p = getProject();
  const rows = [...p.contacts].sort(
    (a, b) => CONTACT_CATEGORIES.findIndex((c) => c.value === a.category) - CONTACT_CATEGORIES.findIndex((c) => c.value === b.category),
  );
  if (!rows.length) {
    toast('No contacts to export yet', 'info');
    return;
  }
  const cols: CsvColumn<Contact>[] = [
    { header: 'Category', value: (c) => catLabel(c) },
    { header: 'Company', value: (c) => c.company },
    { header: 'Name', value: (c) => c.name },
    { header: 'Role', value: (c) => c.role },
    { header: 'Phone', value: (c) => c.phone },
    { header: 'Email', value: (c) => c.email },
    { header: 'Address', value: (c) => c.address },
    { header: 'Website', value: (c) => c.website },
    { header: 'Notes', value: (c) => c.notes },
  ];
  try {
    const path = await exportCsv(safeFileName(`${p.meta.title || 'Project'} - Contacts & Vendors`), rows, cols);
    if (path) toast(`Exported ${rows.length} contacts to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind !== 'electron') toast('Contacts CSV downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/* ------------------------------------------------------------------ module */

export default function ContactsModule() {
  const contacts = useProject((p) => p.contacts);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState<ID | null>(null);
  const [focusId, setFocusId] = useState<ID | null>(null);
  const searchWrap = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useCommand('find', () => {
    searchWrap.current?.querySelector('input')?.focus();
    return true;
  });

  useEffect(() => {
    if (params?.contactId) setSel(params.contactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  // focus the name field of a freshly added contact
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      const row = bodyRef.current?.querySelector('tr.selected');
      (row?.querySelector('input') as HTMLInputElement | null)?.focus();
      setFocusId(null);
    }, 30);
    return () => clearTimeout(t);
  }, [focusId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen() || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.popover') || !sel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setSel(null);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        deleteContact(sel).then((ok) => ok && setSel(null));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) => (!cat || c.category === cat) && matchesQuery([c.name, c.company, c.role, c.email, c.phone, c.address, c.website, c.notes, catLabel(c)].join(' '), q),
      ),
    [contacts, cat, q],
  );
  const companies = useMemo(() => new Set(contacts.map((c) => c.company?.trim().toLowerCase()).filter(Boolean)).size, [contacts]);

  const add = (category?: ContactCategory) => {
    const id = addContact(category ?? ((cat as ContactCategory) || 'vendor'));
    setQ('');
    setSel(id);
    setFocusId(id);
  };

  const rowActions = (c: Contact): MenuItem[] => [
    { label: 'Call', icon: Phone, disabled: !c.phone?.trim(), onClick: () => openExternal(telUrl(c.phone!)) },
    { label: 'Send email', icon: Mail, disabled: !c.email?.trim(), onClick: () => openExternal(`mailto:${c.email!.trim()}`) },
    { label: 'Open website', icon: ExternalLink, disabled: !c.website?.trim(), onClick: () => openExternal(webUrl(c.website!)) },
    { label: 'Open address in Maps', icon: MapPin, disabled: !c.address?.trim(), onClick: () => openExternal(mapsUrl(c.address!)) },
    { separator: true },
    { label: 'Duplicate', icon: Copy, onClick: () => setSel(ops.duplicate(c.id, () => uid('ct'))?.id ?? c.id) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteContact(c.id).then((ok) => ok && sel === c.id && setSel(null)) },
  ];

  const columns: Column<Contact>[] = [
    { key: 'company', header: 'Company', type: 'text', minWidth: 160, placeholder: 'Company' },
    { key: 'name', header: 'Name', type: 'text', minWidth: 140, placeholder: 'Contact name' },
    { key: 'role', header: 'Role', type: 'text', width: 140, placeholder: 'Role' },
    { key: 'category', header: 'Category', type: 'select', width: 130, options: CONTACT_CATEGORIES },
    {
      key: 'phone',
      header: 'Phone',
      width: 150,
      sortValue: (c) => c.phone ?? '',
      render: (c) => <LinkCell kind="tel" value={c.phone} onChange={(phone) => ops.update(c.id, { phone })} />,
    },
    {
      key: 'email',
      header: 'Email',
      minWidth: 180,
      sortValue: (c) => c.email ?? '',
      render: (c) => <LinkCell kind="email" value={c.email} onChange={(email) => ops.update(c.id, { email })} />,
    },
    { key: 'address', header: 'Address', type: 'textarea', minWidth: 180 },
    {
      key: 'website',
      header: 'Website',
      width: 160,
      sortValue: (c) => c.website ?? '',
      render: (c) => <LinkCell kind="url" value={c.website} placeholder="example.com" onChange={(website) => ops.update(c.id, { website })} />,
    },
    { key: 'notes', header: 'Notes', type: 'textarea', minWidth: 180 },
  ];

  return (
    <div className="module contacts-module">
      <ModuleHeader
        title="Contacts & Vendors"
        subtitle={contacts.length ? `${plural(contacts.length, 'contact')} · ${plural(companies, 'company', 'companies')}` : 'Clients, agencies, vendors, rental houses and post facilities'}
        icon={BookUser}
        actions={
          <>
            <ExportMenu docs={[{ id: 'vendor-list', label: 'Vendor & contact list' }, { id: 'contact-sheet', label: 'Production contact sheet' }]} csv={[{ label: 'Contacts (CSV)', onClick: exportContactsCsv }]} />
            <Button variant="primary" icon={Plus} onClick={() => add()}>
              Add contact
            </Button>
          </>
        }
      />
      {contacts.length > 0 && (
        <Toolbar>
          <div ref={searchWrap}>
            <SearchInput value={q} onChange={setQ} placeholder="Search contacts…" />
          </div>
          <Select
            value={cat}
            onChange={setCat}
            placeholder="All categories"
            options={CONTACT_CATEGORIES.map((c) => ({ value: c.value, label: `${c.label} (${contacts.filter((x) => x.category === c.value).length})` }))}
            style={{ width: 190 }}
          />
          <div className="spacer" />
          <span className="muted small">Click a phone, email or website icon to call, write or open it.</span>
        </Toolbar>
      )}
      <div className="module-body contacts-pad" ref={bodyRef}>
        {contacts.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title="No contacts yet"
            description="Keep every phone number the production needs in one place: clients, agencies, rental houses, prop and catering vendors, post facilities."
            action={
              <Button variant="primary" icon={Plus} onClick={() => add('vendor')}>
                Add contact
              </Button>
            }
          />
        ) : (
          <div className="ct-xtable" style={{ ['--xt-minw' as string]: `${tableMinWidth(columns, 64)}px` } as React.CSSProperties}>
            <DataTable
              rows={filtered}
              columns={columns}
              onChange={(id, patch) => ops.update(id, patch)}
              onReorder={!q && !cat ? (id, before) => ops.moveBefore(id, before) : undefined}
              selectedId={sel ?? undefined}
              onRowClick={(c) => setSel(c.id)}
              rowActions={rowActions}
              groupBy={catLabel}
              groupOrder={CATEGORY_LABELS}
              groupHeader={(g, rows) => {
                const value = CONTACT_CATEGORIES.find((c) => c.label === g)?.value ?? 'other';
                return (
                  <div className="ct-group">
                    <span>{g}</span>
                    <span className="ct-group-count">{rows.length}</span>
                    <div className="spacer" />
                    <button type="button" className="btn ghost sm" onClick={() => add(value)}>
                      <Plus /> Add {g.toLowerCase()}
                    </button>
                  </div>
                );
              }}
              emptyText="No contacts match these filters."
            />
          </div>
        )}
      </div>
    </div>
  );
}
