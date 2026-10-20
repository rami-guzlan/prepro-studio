/* Printable documents of the Crew module (crew list, production contact sheet, deal tracker). */
import type { ReactNode } from 'react';
import type { CastMember, Character, Contact, CrewMember, ID, Location, ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { Box, Check, DocHeader, PBadge, PSection, PTable, type PCol } from '@/print/components';
import { CONTACT_CATEGORIES, CREW_STATUSES, optionColor, optionLabel, RATE_UNITS } from '@/lib/constants';
import { crewSorted, deptOf } from './data';

function nameOr(c: { name?: string }, fallback = 'TBD'): ReactNode {
  return c.name?.trim() ? c.name : <span className="pp-muted">{fallback}</span>;
}

function crewFiltered(p: ProjectData, hideDeclined: boolean): CrewMember[] {
  return crewSorted(p.crew).filter((c) => !hideDeclined || c.status !== 'declined');
}

function rateText(ctx: PrintContext, m: { rate?: number; rateUnit?: string }): string {
  if (m.rate == null) return '';
  const unit = m.rateUnit ? RATE_UNITS.find((u) => u.value === m.rateUnit)?.label ?? '' : '';
  return `${ctx.fmt.money(m.rate)} ${unit}`.trim();
}

const groupLabel = (g: string, rows: unknown[]) => (
  <>
    {g} <span style={{ fontWeight: 500, color: '#888' }}>· {rows.length}</span>
  </>
);

/* ------------------------------------------------------------------ crew list */

const crewList: PrintDocDef = {
  id: 'crew-list',
  title: 'Crew List',
  group: 'People',
  orientation: 'portrait',
  description: 'Crew grouped by department with position, phone, email and call time',
  options: [
    { key: 'showEmail', label: 'Email', type: 'boolean', default: true },
    { key: 'showCall', label: 'Default call time', type: 'boolean', default: true },
    { key: 'showStatus', label: 'Hiring status', type: 'boolean', default: false },
    { key: 'withPhotos', label: 'Photos', type: 'boolean', default: false },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: (p) => (p.crew.length ? false : 'No crew yet'),
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const rows = crewFiltered(p, !!o.hideDeclined);
    const cols: PCol<CrewMember>[] = [];
    if (o.withPhotos)
      cols.push({ header: '', width: '0.42in', cell: (c) => (c.photo ? <img className="crl-photo" src={ctx.asset(c.photo)} alt="" /> : <div className="crl-photo" />) });
    cols.push(
      { header: 'Position', width: '1.75in', cell: (c) => <span className="pp-strong">{c.position || '—'}</span> },
      { header: 'Name', width: o.showEmail ? '1.5in' : undefined, cell: (c) => nameOr(c) },
      { header: 'Phone', width: '1.1in', cell: (c) => <span className="pp-nowrap">{c.phone}</span> },
    );
    if (o.showEmail) cols.push({ header: 'Email', cell: (c) => <span className="crl-break">{c.email}</span> });
    if (o.showStatus) cols.push({ header: 'Status', width: '0.8in', cell: (c) => <PBadge color={optionColor(CREW_STATUSES, c.status)}>{optionLabel(CREW_STATUSES, c.status)}</PBadge> });
    if (o.showCall) cols.push({ header: 'Call', width: '0.65in', align: 'right', cell: (c) => <span className="pp-nowrap">{ctx.fmt.time(c.defaultCall)}</span> });
    const depts = new Set(rows.map(deptOf)).size;
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Crew List" subtitle={`${rows.length} crew · ${depts} ${depts === 1 ? 'department' : 'departments'}`} />
          <PTable columns={cols} rows={rows} groupBy={deptOf} groupLabel={groupLabel} empty="No crew yet." />
        </>
      ),
      css: `
.crl-photo { width: 0.32in; height: 0.32in; border-radius: 50%; object-fit: cover; display: block; background: #e9e9ee; }
.crl-break { overflow-wrap: anywhere; }
.pp-table tr.pp-group { break-after: avoid; page-break-after: avoid; }
`,
    };
  },
};

/* ------------------------------------------------------------------ contact sheet */

const KEY_POSITIONS = ['Director', 'Producer', 'Executive Producer', 'Line Producer', 'Production Manager', '1st Assistant Director', 'Production Coordinator', 'Location Manager'];

const contactSheet: PrintDocDef = {
  id: 'contact-sheet',
  title: 'Contact Sheet',
  group: 'People',
  orientation: 'portrait',
  description: 'The production contact list: key contacts, cast, crew by department, locations and vendors',
  options: [
    { key: 'includeCast', label: 'Cast', type: 'boolean', default: true },
    { key: 'includeCrew', label: 'Crew', type: 'boolean', default: true },
    { key: 'includeLocations', label: 'Location contacts', type: 'boolean', default: true },
    { key: 'includeContacts', label: 'Vendors & contacts', type: 'boolean', default: true },
    { key: 'showAgents', label: 'Cast agents', type: 'boolean', default: false },
    { key: 'hideDeclined', label: 'Hide declined cast & crew', type: 'boolean', default: true },
  ],
  emptyReason: (p) => (p.cast.length || p.crew.length || p.contacts.length ? false : 'No cast, crew or contacts yet'),
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const crew = crewFiltered(p, !!o.hideDeclined);
    const rolesOf = (id: ID): Character[] =>
      p.characters.filter((c) => c.castId === id).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
    const board = (m: CastMember) => Math.min(1e9, ...rolesOf(m.id).map((c) => c.number ?? 1e9));
    const cast = p.cast.filter((m) => !o.hideDeclined || m.status !== 'declined').sort((a, b) => board(a) - board(b) || a.name.localeCompare(b.name));
    const locs = p.locations.filter((l) => l.status !== 'declined' && (l.contactName || l.contactPhone || l.contactEmail));
    const contacts = [...p.contacts].sort(
      (a, b) =>
        CONTACT_CATEGORIES.findIndex((c) => c.value === a.category) - CONTACT_CATEGORIES.findIndex((c) => c.value === b.category) ||
        (a.company || a.name).localeCompare(b.company || b.name),
    );
    const key = KEY_POSITIONS.flatMap((pos) => crew.filter((c) => c.position === pos && (c.name || c.phone)));
    const total = (o.includeCast ? cast.length : 0) + (o.includeCrew ? crew.length : 0);

    return {
      body: (
        <>
          <DocHeader
            ctx={ctx}
            title="Contact Sheet"
            subtitle={[p.meta.productionCompany, `${total} people`].filter(Boolean).join(' · ')}
          />
          {key.length > 0 && (
            <div className="ctc-key pp-avoid">
              {key.map((c) => (
                <Box key={c.id} title={c.position}>
                  <div className="pp-strong">{nameOr(c)}</div>
                  <div className="pp-nowrap">{c.phone}</div>
                  {c.email && <div className="pp-small pp-muted ctc-break">{c.email}</div>}
                </Box>
              ))}
            </div>
          )}

          {o.includeCast && cast.length > 0 && (
            <PSection title="Cast" right={`${cast.length}`}>
              <PTable
                zebra
                columns={[
                  { header: '#', width: '0.35in', cell: (m: CastMember) => rolesOf(m.id).map((c) => c.number).filter((n) => n != null).join(', ') },
                  { header: 'Character', width: '1.3in', cell: (m) => <span className="pp-strong">{rolesOf(m.id).map((c) => c.name).join(', ') || '—'}</span> },
                  { header: 'Actor', width: '1.45in', cell: (m) => nameOr(m) },
                  { header: 'Phone', width: '1.1in', cell: (m) => <span className="pp-nowrap">{m.phone}</span> },
                  { header: 'Email', cell: (m) => <span className="ctc-break">{m.email}</span> },
                  ...(o.showAgents
                    ? [
                        {
                          header: 'Agent',
                          width: '1.45in',
                          cell: (m: CastMember) => (
                            <>
                              <div>{[m.agent, m.agency].filter(Boolean).join(' · ')}</div>
                              {m.agentPhone && <div className="pp-small pp-muted">{m.agentPhone}</div>}
                            </>
                          ),
                        },
                      ]
                    : []),
                ]}
                rows={cast}
              />
            </PSection>
          )}

          {o.includeCrew && crew.length > 0 && (
            <PSection title="Crew" right={`${crew.length}`}>
              <PTable
                columns={[
                  { header: 'Position', width: '1.75in', cell: (c: CrewMember) => <span className="pp-strong">{c.position || '—'}</span> },
                  { header: 'Name', width: '1.45in', cell: (c) => nameOr(c) },
                  { header: 'Phone', width: '1.1in', cell: (c) => <span className="pp-nowrap">{c.phone}</span> },
                  { header: 'Email', cell: (c) => <span className="ctc-break">{c.email}</span> },
                ]}
                rows={crew}
                groupBy={deptOf}
                groupLabel={groupLabel}
              />
            </PSection>
          )}

          {o.includeLocations && locs.length > 0 && (
            <PSection title="Locations">
              <PTable
                zebra
                columns={[
                  {
                    header: 'Location',
                    width: '2in',
                    cell: (l: Location) => (
                      <>
                        <div className="pp-strong">{l.name}</div>
                        {l.address && <div className="pp-small pp-muted">{l.address}</div>}
                      </>
                    ),
                  },
                  { header: 'Contact', width: '1.3in', cell: (l) => l.contactName },
                  { header: 'Phone', width: '1.1in', cell: (l) => <span className="pp-nowrap">{l.contactPhone}</span> },
                  { header: 'Email', cell: (l) => <span className="ctc-break">{l.contactEmail}</span> },
                ]}
                rows={locs}
              />
            </PSection>
          )}

          {o.includeContacts && contacts.length > 0 && (
            <PSection title="Vendors & contacts">
              <PTable
                columns={[
                  {
                    header: 'Company',
                    width: '1.75in',
                    cell: (c: Contact) => <span className="pp-strong">{c.company || c.name}</span>,
                  },
                  {
                    header: 'Contact',
                    width: '1.45in',
                    cell: (c) => (
                      <>
                        <div>{c.company ? c.name : ''}</div>
                        {c.role && <div className="pp-small pp-muted">{c.role}</div>}
                      </>
                    ),
                  },
                  { header: 'Phone', width: '1.1in', cell: (c) => <span className="pp-nowrap">{c.phone}</span> },
                  { header: 'Email', cell: (c) => <span className="ctc-break">{c.email}</span> },
                ]}
                rows={contacts}
                groupBy={(c) => optionLabel(CONTACT_CATEGORIES, c.category)}
              />
            </PSection>
          )}
        </>
      ),
      css: `
.ctc-key { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6pt; margin-bottom: 4pt; }
.ctc-key .pp-box { padding: 5pt 7pt; }
.ctc-break { overflow-wrap: anywhere; }
.pp-table tr.pp-group { break-after: avoid; page-break-after: avoid; }
`,
    };
  },
};

/* ------------------------------------------------------------------ deal tracker */

function estimate(c: CrewMember, days: number): number | undefined {
  if (c.rate == null) return undefined;
  if (c.rateUnit === 'day') return c.rate * days;
  if (c.rateUnit === 'flat') return c.rate;
  if (c.rateUnit === 'week') return c.rate * Math.max(1, Math.ceil(days / 5));
  return undefined;
}

const dealTracker: PrintDocDef = {
  id: 'crew-deal-tracker',
  title: 'Crew Deal Tracker',
  group: 'People',
  orientation: 'portrait',
  description: 'Rates, deal memo status and estimated cost per crew member',
  options: [
    { key: 'showEstimate', label: 'Estimated cost (shoot days × rate)', type: 'boolean', default: true },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: (p) => (p.crew.length ? false : 'No crew yet'),
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const rows = crewFiltered(p, !!o.hideDeclined);
    const days = p.schedule.days.length;
    const signed = rows.filter((c) => c.dealMemo).length;
    const total = rows.reduce((a, c) => a + (estimate(c, days) ?? 0), 0);
    const cols: PCol<CrewMember>[] = [
      { header: 'Position', width: '1.6in', cell: (c) => <span className="pp-strong">{c.position || '—'}</span> },
      { header: 'Name', cell: (c) => nameOr(c) },
      { header: 'Status', width: '0.8in', cell: (c) => <PBadge color={optionColor(CREW_STATUSES, c.status)}>{optionLabel(CREW_STATUSES, c.status)}</PBadge> },
      { header: 'Union', width: '0.95in', cell: (c) => c.union },
      { header: 'Rate', width: '1in', cell: (c) => rateText(ctx, c) },
      { header: 'Deal memo', width: '0.65in', align: 'center', cell: (c) => <Check on={c.dealMemo} /> },
    ];
    if (o.showEstimate) cols.push({ header: `Est. (${days} ${days === 1 ? 'day' : 'days'})`, width: '0.95in', num: true, cell: (c) => ctx.fmt.money(estimate(c, days), { cents: false }) });
    const footer: ReactNode[] | undefined = o.showEstimate ? [...cols.slice(0, -1).map((_, i) => (i === 0 ? 'Total' : '')), ctx.fmt.money(total, { cents: false })] : undefined;
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Crew Deal Tracker" subtitle={`${signed} of ${rows.length} deal memos signed`} />
          <PTable columns={cols} rows={rows} groupBy={deptOf} groupLabel={groupLabel} footer={footer} empty="No crew yet." />
          {o.showEstimate && (
            <p className="pp-muted pp-small" style={{ marginTop: '8pt' }}>
              Estimates use {days} scheduled shoot {days === 1 ? 'day' : 'days'} (weekly rates per 5-day week). Hourly rates are not estimated. Excludes fringes, overtime and kit fees.
            </p>
          )}
        </>
      ),
      css: `.pp-table tr.pp-group { break-after: avoid; page-break-after: avoid; }`,
    };
  },
};

export const printDocs: PrintDocDef[] = [crewList, contactSheet, dealTracker];
