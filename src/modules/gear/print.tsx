import type { ReactNode } from 'react';
import type { Contact, GearItem, ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { Check, DocHeader, KV, PBadge, PTable, type PCol } from '@/print/components';
import { GEAR_STATUSES, optionColor, optionLabel } from '@/lib/constants';
import { dayDates } from '@/derived/project';
import { addDays } from '@/lib/dates';
import { naturalCompare, plural } from '@/lib/text';
import { GEAR_SOURCES, categoryOrder, effectiveDays, gearTotal, lineTotal, shootDayCount, sortByCategory } from './logic';

const CSS = `
.gear-p-name { font-weight: 650; }
.gear-p-notes { color: #55555e; font-size: 7.2pt; margin-top: 1pt; white-space: pre-wrap; }
.gear-p-serial { color: #33333c; font-size: 6.8pt; font-family: 'Courier Prime', 'Courier New', monospace; margin-top: 0.5pt; }
.gear-p-src { font-size: 6.2pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #7a7a84; }
.gear-p-diag { font-size: 6.2pt; font-weight: 700; color: #b26b00; text-transform: uppercase; letter-spacing: 0.04em; margin-left: 3pt; }
.gear-p-order { break-inside: auto; }
.gear-p-order + .gear-p-order.pp-break-before { margin-top: 0; }
.gear-p-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-bottom: 10pt; }
.gear-p-party { border: 0.75pt solid #c9c9d1; border-radius: 3pt; padding: 6pt 8pt; }
.gear-p-party .k { font-size: 6.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #7a7a84; margin-bottom: 2pt; }
.gear-p-party .n { font-size: 10pt; font-weight: 700; }
.gear-p-party .l { font-size: 8pt; color: #33333c; white-space: pre-wrap; }
.gear-p-dates { margin-bottom: 10pt; }
.gear-p-sign { display: grid; grid-template-columns: 2fr 1fr 2fr 1fr; gap: 6pt 12pt; margin-top: 18pt; font-size: 7pt; color: #55555e; }
.gear-p-sign div { border-top: 0.75pt solid #555; padding-top: 2pt; }
.gear-p-terms { margin-top: 10pt; font-size: 7.4pt; color: #44444c; white-space: pre-wrap; }
.gear-p-grand { margin-top: 12pt; display: flex; justify-content: flex-end; }
.gear-p-grand table { border-collapse: collapse; font-size: 9pt; }
.gear-p-grand td { padding: 2pt 8pt; }
.gear-p-grand tr.t td { font-weight: 800; font-size: 11pt; border-top: 1pt solid #333; }
`;

function sourceLabel(g: GearItem) {
  return GEAR_SOURCES.find((s) => s.value === g.source)?.label ?? g.source ?? '';
}

function shootWindow(p: ProjectData) {
  const dates = dayDates(p).filter((d): d is string => !!d).sort();
  if (!dates.length) return null;
  return { first: dates[0], last: dates[dates.length - 1], count: p.schedule.days.length };
}

/* ---------------------------------------------------------------- gear list */

function renderGearList(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const showCosts = !!o.showCosts;
  const days = shootDayCount(p);
  const crew = new Map(p.crew.map((c) => [c.id, c]));
  const groupBy = String(o.groupBy ?? 'category');
  let rows = sortByCategory(p.gear);
  if (!o.includeReturned) rows = rows.filter((g) => g.status !== 'returned');
  const keyOf = (g: GearItem): string => {
    if (groupBy === 'assigned') return g.assignedTo ? crew.get(g.assignedTo)?.name ?? 'Unassigned' : 'Unassigned';
    if (groupBy === 'vendor') return g.source === 'rental' || g.source === 'purchase' ? g.vendor || 'No vendor' : sourceLabel(g);
    return g.category || 'Other';
  };
  if (groupBy !== 'category') {
    const order = new Map<string, number>();
    const keys = [...new Set(rows.map(keyOf))].sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : naturalCompare(a, b)));
    keys.forEach((k, i) => order.set(k, i));
    const cat = categoryOrder(rows);
    rows = [...rows].sort((a, b) => order.get(keyOf(a))! - order.get(keyOf(b))! || cat.indexOf(a.category) - cat.indexOf(b.category));
  }

  const cols: PCol<GearItem>[] = [
    { header: '✓', width: '16pt', cell: (g) => <Check on={!!g.checked && !!o.showPacked} /> },
    { header: 'Qty', width: '26pt', num: true, cell: (g) => g.qty ?? 1 },
    {
      header: 'Item',
      cell: (g) => (
        <>
          <span className="gear-p-name">{g.name || 'Unnamed item'}</span>
          {g.fromDiagram ? <span className="gear-p-diag">diagram</span> : null}
          {o.showSerials && g.serial ? <div className="gear-p-serial">S/N {g.serial}</div> : null}
          {g.notes ? <div className="gear-p-notes">{g.notes}</div> : null}
        </>
      ),
    },
  ];
  if (groupBy !== 'category') cols.push({ header: 'Category', width: '60pt', cell: (g) => g.category });
  cols.push({
    header: 'Source',
    width: '72pt',
    cell: (g) =>
      g.vendor ? (
        <>
          <div className="gear-p-src">{sourceLabel(g)}</div>
          {g.vendor}
        </>
      ) : (
        sourceLabel(g)
      ),
  });
  cols.push({ header: 'Status', width: '50pt', cell: (g) => <PBadge color={optionColor(GEAR_STATUSES, g.status)}>{optionLabel(GEAR_STATUSES, g.status)}</PBadge> });
  if (groupBy !== 'assigned') cols.push({ header: 'Assigned to', width: '64pt', cell: (g) => (g.assignedTo ? crew.get(g.assignedTo)?.name ?? '' : '') });
  if (showCosts) {
    cols.push({ header: 'Rate', width: '46pt', num: true, cell: (g) => (g.dayRate ? ctx.fmt.money(g.dayRate, { cents: false }) : g.flatCost ? 'flat' : '') });
    cols.push({ header: 'Days', width: '24pt', num: true, cell: (g) => (g.dayRate ? effectiveDays(g, days) : '') });
    cols.push({ header: 'Total', width: '56pt', num: true, cell: (g) => (lineTotal(g, days) ? ctx.fmt.money(lineTotal(g, days)) : '') });
  }
  const total = gearTotal(rows, days);
  const footer: ReactNode[] | undefined = showCosts ? cols.map((_, i) => (i === 2 ? plural(rows.length, 'item') : i === cols.length - 1 ? ctx.fmt.money(total) : '')) : undefined;
  const win = shootWindow(p);
  const packedCount = rows.filter((g) => g.checked).length;

  return {
    body: (
      <>
        <DocHeader
          ctx={ctx}
          title={showCosts ? 'Gear List' : 'Gear Packing List'}
          subtitle={`${rows.length} items${win ? ` · shoot ${ctx.fmt.dateMedium(win.first)}${win.last !== win.first ? ` – ${ctx.fmt.dateMedium(win.last)}` : ''}` : ''}${o.showPacked ? ` · ${packedCount} packed` : ''}${showCosts ? ` · ${ctx.fmt.money(total)}` : ''}`}
        />
        <PTable
          columns={cols}
          rows={rows}
          groupBy={keyOf}
          groupLabel={(g, list) => {
            const sub = gearTotal(list, days);
            return `${g} · ${list.length} item${list.length === 1 ? '' : 's'}${showCosts && sub ? ` · ${ctx.fmt.money(sub)}` : ''}`;
          }}
          footer={footer}
          empty="No gear on the list yet."
        />
      </>
    ),
    css: CSS,
  };
}

/* ---------------------------------------------------------------- rental order */

function vendorContact(p: ProjectData, vendor: string): Contact | undefined {
  const v = vendor.trim().toLowerCase();
  if (!v) return undefined;
  return p.contacts.find((c) => (c.company ?? '').trim().toLowerCase() === v) ?? p.contacts.find((c) => c.name.trim().toLowerCase() === v);
}

function renderRentalOrder(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const days = shootDayCount(p);
  const filter = String(o.vendor ?? '').trim().toLowerCase();
  const rentals = sortByCategory(p.gear.filter((g) => g.source === 'rental' && g.status !== 'returned'));
  const byVendor = new Map<string, GearItem[]>();
  for (const g of rentals) {
    const v = (g.vendor ?? '').trim() || 'No vendor assigned';
    if (filter && !v.toLowerCase().includes(filter)) continue;
    byVendor.set(v, [...(byVendor.get(v) ?? []), g]);
  }
  const vendors = [...byVendor.keys()].sort((a, b) => (a === 'No vendor assigned' ? 1 : b === 'No vendor assigned' ? -1 : naturalCompare(a, b)));
  const win = shootWindow(p);
  const pickup = win ? addDays(win.first, -1) : undefined;
  const ret = win ? addDays(win.last, 1) : undefined;
  const producer = p.crew.find((c) => /producer/i.test(c.position) && !/assistant|coordinator/i.test(c.position));
  const company = p.meta.productionCompany || p.meta.title;
  const grand = gearTotal(
    vendors.flatMap((v) => byVendor.get(v)!),
    days,
  );

  const cols: PCol<GearItem>[] = [
    { header: 'Qty', width: '26pt', num: true, cell: (g) => g.qty ?? 1 },
    {
      header: 'Item',
      cell: (g) => (
        <>
          <span className="gear-p-name">{g.name || 'Unnamed item'}</span>
          {o.showNotes && g.notes ? <div className="gear-p-notes">{g.notes}</div> : null}
        </>
      ),
    },
    { header: 'Day rate', width: '54pt', num: true, cell: (g) => (g.dayRate ? ctx.fmt.money(g.dayRate) : '') },
    { header: 'Days', width: '28pt', num: true, cell: (g) => (g.dayRate ? effectiveDays(g, days) : '') },
    { header: 'Flat', width: '50pt', num: true, cell: (g) => (g.flatCost ? ctx.fmt.money(g.flatCost) : '') },
    { header: 'Total', width: '60pt', num: true, cell: (g) => ctx.fmt.money(lineTotal(g, days)) },
  ];

  if (!vendors.length) {
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Rental Order" />
          <p className="pp-muted">{filter ? `No rental items for “${String(o.vendor)}”.` : 'No rental items on the gear list. Set an item’s source to “Rental” to include it.'}</p>
        </>
      ),
      css: CSS,
    };
  }

  return {
    title: vendors.length === 1 ? `Rental Order — ${vendors[0]}` : 'Rental Orders',
    body: (
      <>
        {vendors.map((v, vi) => {
          const items = byVendor.get(v)!;
          const contact = vendorContact(p, v);
          const sub = gearTotal(items, days);
          return (
            <div key={v} className={['gear-p-order', vi > 0 && o.pageBreak ? 'pp-break-before' : ''].filter(Boolean).join(' ')} style={vi > 0 && !o.pageBreak ? { marginTop: '22pt' } : undefined}>
              <DocHeader ctx={ctx} title="Rental Order" subtitle={v} meta={<>Order date: {ctx.today}</>} />
              <div className="gear-p-parties">
                <div className="gear-p-party">
                  <div className="k">Rental house</div>
                  <div className="n">{contact?.company || v}</div>
                  <div className="l">
                    {[contact?.name && contact.name !== contact.company ? `Attn: ${contact.name}` : '', contact?.phone, contact?.email, contact?.address].filter(Boolean).join('\n') || ' '}
                  </div>
                </div>
                <div className="gear-p-party">
                  <div className="k">Production</div>
                  <div className="n">{company}</div>
                  <div className="l">
                    {[
                      p.meta.productionCompany ? `Project: ${p.meta.title}${p.meta.subtitle ? ` · ${p.meta.subtitle}` : ''}` : '',
                      producer ? `Contact: ${producer.name} (${producer.position})` : p.meta.producer ? `Producer: ${p.meta.producer}` : '',
                      producer?.phone,
                      producer?.email,
                    ]
                      .filter(Boolean)
                      .join('\n') || ' '}
                  </div>
                </div>
              </div>
              <div className="gear-p-dates">
                <KV
                  cols={4}
                  keepEmpty
                  items={[
                    ['Pickup / prep', pickup ? ctx.fmt.dateLong(pickup) : ''],
                    ['Return', ret ? ctx.fmt.dateLong(ret) : ''],
                    ['Shoot days', win ? `${win.count} (${ctx.fmt.dateShort(win.first)}${win.last !== win.first ? ` – ${ctx.fmt.dateShort(win.last)}` : ''})` : days ? String(days) : ''],
                    ['Items', `${plural(items.length, 'line')} · ${plural(items.reduce((n, g) => n + (g.qty ?? 1), 0), 'unit')}`],
                  ]}
                />
              </div>
              <PTable columns={cols} rows={items} groupBy={(g) => g.category || 'Other'} footer={['', plural(items.length, 'item'), '', '', '', ctx.fmt.money(sub)]} />
              {o.terms ? <div className="gear-p-terms">{String(o.terms)}</div> : null}
              <div className="gear-p-sign">
                <div>Ordered by (production)</div>
                <div>Date</div>
                <div>Approved by (rental house)</div>
                <div>Date</div>
              </div>
            </div>
          );
        })}
        {vendors.length > 1 && !filter && (
          <div className="gear-p-grand pp-avoid">
            <table>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v}>
                    <td>{v}</td>
                    <td className="pp-right">{ctx.fmt.money(gearTotal(byVendor.get(v)!, days))}</td>
                  </tr>
                ))}
                <tr className="t">
                  <td>All rentals</td>
                  <td className="pp-right">{ctx.fmt.money(grand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </>
    ),
    css: CSS,
  };
}

/** Printable documents of the gear module. */
export const printDocs: PrintDocDef[] = [
  {
    id: 'gear-list',
    title: 'Gear List',
    group: 'Budget & Gear',
    orientation: 'portrait',
    description: 'Equipment grouped by category with packing checkboxes, sources and who is responsible',
    options: [
      { key: 'showCosts', label: 'Show costs', type: 'boolean', default: true },
      { key: 'showSerials', label: 'Show serial numbers', type: 'boolean', default: true },
      { key: 'showPacked', label: 'Tick items already packed', type: 'boolean', default: false, hint: 'Off = empty boxes for a fresh check-out' },
      { key: 'includeReturned', label: 'Include returned items', type: 'boolean', default: true },
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'select',
        default: 'category',
        choices: [
          { value: 'category', label: 'Category' },
          { value: 'assigned', label: 'Assigned crew member' },
          { value: 'vendor', label: 'Vendor / source' },
        ],
      },
    ],
    emptyReason: (p) => (p.gear.length ? false : 'No gear yet'),
    render: renderGearList,
  },
  {
    id: 'rental-order',
    title: 'Rental Order',
    group: 'Budget & Gear',
    orientation: 'portrait',
    description: 'Rental items grouped by vendor with day rates, days and totals — ready to send to the rental house',
    options: [
      { key: 'vendor', label: 'Vendor', type: 'text', default: '', hint: 'Leave empty for one order per vendor' },
      { key: 'showNotes', label: 'Show item notes', type: 'boolean', default: true },
      { key: 'pageBreak', label: 'Each vendor on a new page', type: 'boolean', default: true },
      {
        key: 'terms',
        label: 'Notes to the rental house',
        type: 'text',
        default: 'Certificate of insurance to follow. Please confirm availability, pickup time and weekend rate by reply.',
      },
    ],
    emptyReason: (p) => (p.gear.some((g) => g.source === 'rental') ? false : 'No rental items (set an item’s source to Rental)'),
    render: renderRentalOrder,
  },
];
