/* Printable documents of the Contacts & Vendors module. */
import type { Contact } from '@/types';
import type { PrintDocDef } from '@/print/types';
import { DocHeader, PTable, type PCol } from '@/print/components';
import { CONTACT_CATEGORIES, optionLabel } from '@/lib/constants';

const vendorList: PrintDocDef = {
  id: 'vendor-list',
  title: 'Vendor & Contact List',
  group: 'People',
  orientation: 'portrait',
  description: 'Clients, agencies, vendors, rental houses and post facilities grouped by category',
  options: [
    { key: 'showAddress', label: 'Addresses', type: 'boolean', default: true },
    { key: 'showWebsite', label: 'Websites', type: 'boolean', default: false },
    { key: 'showNotes', label: 'Notes', type: 'boolean', default: false },
    { key: 'hideClients', label: 'Hide clients & agencies (crew copy)', type: 'boolean', default: false },
  ],
  emptyReason: (p) => (p.contacts.length ? false : 'No contacts yet'),
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const order = (c: Contact) => {
      const i = CONTACT_CATEGORIES.findIndex((x) => x.value === c.category);
      return i < 0 ? 999 : i;
    };
    const rows = [...p.contacts]
      .filter((c) => !o.hideClients || (c.category !== 'client' && c.category !== 'agency'))
      .sort((a, b) => order(a) - order(b) || (a.company || a.name).localeCompare(b.company || b.name));
    const cols: PCol<Contact>[] = [
      {
        header: 'Company',
        width: '1.7in',
        cell: (c) => (
          <>
            <div className="pp-strong">{c.company || c.name || '—'}</div>
            {o.showWebsite && c.website && <div className="pp-small pp-muted vl-break">{c.website}</div>}
          </>
        ),
      },
      {
        header: 'Contact',
        width: '1.4in',
        cell: (c) => (
          <>
            <div>{c.company ? c.name : ''}</div>
            {c.role && <div className="pp-small pp-muted">{c.role}</div>}
          </>
        ),
      },
      { header: 'Phone', width: '1.05in', cell: (c) => <span className="pp-nowrap">{c.phone}</span> },
      { header: 'Email', cell: (c) => <span className="vl-break">{c.email}</span> },
    ];
    if (o.showAddress) cols.push({ header: 'Address', width: '1.6in', cell: (c) => <span className="pp-pre">{c.address}</span> });
    if (o.showNotes) cols.push({ header: 'Notes', width: '1.6in', cell: (c) => <span className="pp-pre pp-small">{c.notes}</span> });
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Vendor & Contact List" subtitle={`${rows.length} contacts`} />
          <PTable
            columns={cols}
            rows={rows}
            groupBy={(c) => optionLabel(CONTACT_CATEGORIES, c.category) || 'Other'}
            groupLabel={(g, gr) => (
              <>
                {g} <span style={{ fontWeight: 500, color: '#888' }}>· {gr.length}</span>
              </>
            )}
            empty="No contacts."
          />
        </>
      ),
      css: `.vl-break { overflow-wrap: anywhere; }
.pp-table tr.pp-group { break-after: avoid; page-break-after: avoid; }`,
    };
  },
};

export const printDocs: PrintDocDef[] = [vendorList];
