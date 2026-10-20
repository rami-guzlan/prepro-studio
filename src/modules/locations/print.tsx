/* Printable documents of the Locations module: location list, location sheets, tech scout checklists. */
import type { ReactNode } from 'react';
import type { Location, ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import type { SceneInfo } from '@/script-core/model';
import { Box, Check, DocHeader, KV, PBadge, Photo, Pre, PSection, PTable, type PCol } from '@/print/components';
import { LOCATION_STATUSES, optionColor, optionLabel } from '@/lib/constants';
import { sceneDayIndex } from '@/derived/project';
import { sunTimes } from '@/lib/sun';
import { weekdayShort } from '@/lib/dates';
import { formatCoords, hasCoords, LOCATION_KINDS, permitText, PERMIT_STATUSES, scenesAt, shootDaysAt, type LocDay } from './data';

function statusBadge(status: string) {
  return <PBadge color={optionColor(LOCATION_STATUSES, status)}>{optionLabel(LOCATION_STATUSES, status)}</PBadge>;
}

function kindLabel(l: Location): string {
  return l.kind ? optionLabel(LOCATION_KINDS, l.kind) : '';
}

function pickLocations(p: ProjectData, options: Record<string, any>, hideDeclined: boolean): Location[] {
  if (typeof options.only === 'string' && options.only) return p.locations.filter((l) => l.id === options.only);
  return p.locations.filter((l) => !hideDeclined || l.status !== 'declined');
}

function sunLine(ctx: PrintContext, l: Location, date?: string): string {
  if (!date || !hasCoords(l)) return '';
  const t = sunTimes(date, l.lat, l.lng);
  if (!t.sunrise || !t.sunset) return '';
  return `Sunrise ${ctx.fmt.time(t.sunrise)} · Sunset ${ctx.fmt.time(t.sunset)} · Golden hour from ${ctx.fmt.time(t.goldenEveningStart)}`;
}

const locEmpty = (p: ProjectData) => (p.locations.length ? false : 'No locations yet');

/* ------------------------------------------------------------------ location list */

const locationList: PrintDocDef = {
  id: 'location-list',
  title: 'Location List',
  group: 'Locations',
  orientation: 'portrait',
  description: 'All locations with address, contact, status, permit and the sets shot there',
  options: [
    { key: 'withPhotos', label: 'Cover photos', type: 'boolean', default: true },
    { key: 'showFees', label: 'Location fees', type: 'boolean', default: false },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: locEmpty,
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const rows = pickLocations(p, {}, !!o.hideDeclined);
    const cols: PCol<Location>[] = [];
    if (o.withPhotos)
      cols.push({ header: '', width: '0.95in', cell: (l) => (l.photos?.[0] ? <img className="ll-photo" src={ctx.asset(l.photos[0])} alt="" /> : <div className="ll-photo" />) });
    cols.push(
      {
        header: 'Location',
        width: '1.9in',
        cell: (l) => (
          <>
            <div className="pp-strong">{l.name || 'Untitled location'}</div>
            <div className="pp-small pp-muted">{[kindLabel(l), l.address].filter(Boolean).join(' · ')}</div>
          </>
        ),
      },
      {
        header: 'Contact',
        width: '1.55in',
        cell: (l) => (
          <>
            <div>{l.contactName}</div>
            {l.contactPhone && <div className="pp-small pp-nowrap">{l.contactPhone}</div>}
            {l.contactEmail && <div className="pp-small pp-muted ll-break">{l.contactEmail}</div>}
          </>
        ),
      },
      {
        header: 'Status',
        width: '0.95in',
        cell: (l) => (
          <>
            {statusBadge(l.status)}
            {permitText(l) && <div className="pp-small pp-muted" style={{ marginTop: '2pt' }}>{permitText(l)}</div>}
          </>
        ),
      },
      { header: 'Sets', cell: (l) => <span className="pp-small">{(l.sets ?? []).join(', ') || '—'}</span> },
    );
    if (o.showFees) cols.push({ header: 'Fee', width: '0.75in', num: true, cell: (l) => ctx.fmt.money(l.fee, { cents: false }) });
    const total = rows.reduce((a, l) => a + (l.fee ?? 0), 0);
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Location List" subtitle={`${rows.length} locations · ${rows.filter((l) => l.status === 'confirmed').length} confirmed`} />
          <PTable
            columns={cols}
            rows={rows}
            zebra
            empty="No locations."
            footer={o.showFees ? [...cols.slice(0, -1).map((_, i) => (i === 0 ? 'Total' : '')), ctx.fmt.money(total, { cents: false })] : undefined}
          />
        </>
      ),
      css: `
.ll-photo { width: 0.85in; height: 0.57in; object-fit: cover; border-radius: 2pt; display: block; background: #e9e9ee; }
.ll-break { overflow-wrap: anywhere; }
`,
    };
  },
};

/* ------------------------------------------------------------------ location sheets */

const locationSheets: PrintDocDef = {
  id: 'location-sheets',
  title: 'Location Sheets',
  group: 'Locations',
  orientation: 'portrait',
  description: 'One page per location: photos, address, contact, parking, power, load-in, hospital, sets & scenes',
  options: [
    { key: 'maxPhotos', label: 'Photos per location (0–5)', type: 'number', default: 5, min: 0, max: 5 },
    { key: 'showScenes', label: 'Sets & scenes', type: 'boolean', default: true },
    { key: 'showScoutNotes', label: 'Tech scout notes', type: 'boolean', default: true },
    { key: 'showFee', label: 'Fee & permit (production copy)', type: 'boolean', default: false },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: locEmpty,
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const list = pickLocations(p, o, !!o.hideDeclined);
    const dayIdx = sceneDayIndex(p);
    const max = Math.max(0, Math.min(5, Number(o.maxPhotos ?? 5)));

    const sheet = (l: Location, i: number) => {
      const photos = (l.photos ?? []).slice(0, Math.min(max, 5));
      const scenes = scenesAt(p.locations, ctx.model, l.id);
      const days = shootDaysAt(p.schedule, p.callSheets, p.locations, ctx.model, l.id);
      const eighths = scenes.reduce((a, s) => a + (s.eighths || 0), 0);
      const h = l.hospital ?? {};
      return (
        <div key={l.id} className={['ls-sheet', i > 0 && 'pp-break-before'].filter(Boolean).join(' ')}>
          <DocHeader ctx={ctx} title={l.name || 'Untitled location'} subtitle={[kindLabel(l), l.address].filter(Boolean).join(' · ')} meta={statusBadge(l.status)} />

          {photos.length > 0 && (
            <div className={`ls-photos n${Math.min(photos.length, 5)}`}>
              {photos.map((ph, j) => (
                <Photo key={j} src={ctx.asset(ph)} aspect={j === 0 ? 16 / 9 : 3 / 2} />
              ))}
            </div>
          )}

          <div className="ls-grid">
            <Box title="Address">
              <div className="pp-strong pp-pre">{l.address || '—'}</div>
              {hasCoords(l) && <div className="pp-small pp-muted" style={{ marginTop: '2pt' }}>GPS {formatCoords(l.lat, l.lng)}</div>}
            </Box>
            <Box title="Location contact">
              <div className="pp-strong">{l.contactName || '—'}</div>
              {l.contactPhone && <div>{l.contactPhone}</div>}
              {l.contactEmail && <div className="pp-small pp-muted">{l.contactEmail}</div>}
            </Box>
            <Box title="Nearest hospital" className="ls-hospital">
              <div className="pp-strong">{h.name || '—'}</div>
              {h.address && <div className="pp-small">{h.address}</div>}
              {h.phone && <div>{h.phone}</div>}
            </Box>
          </div>

          <PSection title="Logistics">
            <KV
              cols={2}
              items={[
                ['Parking', l.parking],
                ['Load-in', l.loadIn],
                ['Power', l.power],
                ['Restrooms', l.restrooms],
                ['Wi-Fi', l.wifi],
                ['Availability / access', l.availability],
                ...(o.showFee
                  ? ([
                      ['Fee', ctx.fmt.money(l.fee)],
                      ['Permit', l.permitStatus ? optionLabel(PERMIT_STATUSES, l.permitStatus) : permitText(l)],
                    ] as [ReactNode, ReactNode][])
                  : []),
              ]}
            />
            {!l.parking && !l.loadIn && !l.power && !l.restrooms && !l.wifi && !l.availability && <div className="pp-muted">No logistics recorded yet.</div>}
          </PSection>

          {days.length > 0 && (
            <PSection title="Shoot days">
              <PTable
                columns={[
                  {
                    header: 'Day',
                    width: '1.65in',
                    cell: (d: LocDay) => (
                      <>
                        <div className="pp-strong">{d.label}</div>
                        {d.name && <div className="pp-small pp-muted">{d.name}</div>}
                      </>
                    ),
                  },
                  { header: 'Date', width: '1.15in', cell: (d) => (d.date ? `${weekdayShort(d.date)}, ${ctx.fmt.dateMedium(d.date)}` : 'TBD') },
                  { header: 'Sun', cell: (d) => sunLine(ctx, l, d.date) || <span className="pp-muted">—</span> },
                  { header: 'Scenes', width: '1in', cell: (d) => d.scenes.map((s) => s.number).join(', ') },
                ]}
                rows={days}
              />
            </PSection>
          )}

          {o.showScenes && (
            <PSection
              title="Sets & scenes"
              right={[(l.sets ?? []).join(', '), scenes.length ? `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'} · ${ctx.fmt.eighths(eighths)} pages` : ''].filter(Boolean).join(' · ') || undefined}
            >
              <PTable
                columns={[
                  { header: 'Sc', width: '0.45in', cell: (s: SceneInfo) => <span className="pp-strong">{s.number}</span> },
                  { header: 'Scene', cell: (s) => s.heading },
                  { header: 'Pages', width: '0.55in', num: true, cell: (s) => ctx.fmt.eighths(s.eighths) },
                  { header: 'Day', width: '0.55in', cell: (s) => (dayIdx.has(s.id) ? `Day ${dayIdx.get(s.id)! + 1}` : '') },
                ]}
                rows={scenes}
                empty="No scenes assigned to this location."
              />
            </PSection>
          )}

          {((o.showScoutNotes && l.scoutNotes) || l.notes) && (
            <div className="ls-notes">
              {o.showScoutNotes && l.scoutNotes && (
                <PSection title="Tech scout notes">
                  <Pre>{l.scoutNotes}</Pre>
                </PSection>
              )}
              {l.notes && (
                <PSection title="Notes">
                  <Pre>{l.notes}</Pre>
                </PSection>
              )}
            </div>
          )}
        </div>
      );
    };

    return {
      body: list.length ? <>{list.map(sheet)}</> : <div className="pp-muted">No locations to print.</div>,
      title: list.length === 1 ? `Location Sheet – ${list[0].name || 'Untitled'}` : 'Location Sheets',
      css: `
.ls-photos { display: grid; gap: 5pt; margin-bottom: 10pt; }
.ls-photos .pp-photo { aspect-ratio: auto !important; height: 100%; }
.ls-photos.n1 { height: 2.6in; }
.ls-photos.n2 { height: 2in; grid-template-columns: 1.6fr 1fr; }
.ls-photos.n3 { height: 2in; grid-template-columns: 1.6fr 1fr; grid-template-rows: 1fr 1fr; }
.ls-photos.n4, .ls-photos.n5 { height: 2.05in; grid-template-columns: 1.6fr 1fr 1fr; grid-template-rows: 1fr 1fr; }
.ls-sheet .pp-doc-header { margin-bottom: 9pt; }
.ls-sheet .pp-section { margin-top: 6pt; }
.ls-sheet .pp-section-title { margin: 8pt 0 4pt; }
.ls-sheet .pp-kv { gap: 4pt 14pt; }
.ls-notes { display: flex; gap: 14pt; align-items: flex-start; }
.ls-notes > .pp-section { flex: 1; min-width: 0; }
.ls-notes .pp-pre { font-size: 8.5pt; }
.ls-photos.n3 .pp-photo:first-child, .ls-photos.n4 .pp-photo:first-child, .ls-photos.n5 .pp-photo:first-child { grid-row: span 2; }
.ls-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8pt; }
.ls-hospital { border-color: #e5484d; }
.ls-hospital .pp-box-title { color: #c62f35; }
`,
    };
  },
};

/* ------------------------------------------------------------------ tech scout */

interface ScoutSection {
  title: string;
  known?: (l: Location, sun: string) => string | undefined;
  checks: string[];
}

const SCOUT_SECTIONS: ScoutSection[] = [
  { title: 'Power', known: (l) => l.power, checks: ['Circuits & amperage available', 'Breaker panel location', 'Cable runs / distance to set', 'Generator placement & noise'] },
  { title: 'Sound', checks: ['Traffic, sirens, aircraft', 'HVAC, fridges, buzzing lights', 'Neighbours, construction, bells', 'What can be switched off — and who has the keys'] },
  { title: 'Sun & light', known: (_l, sun) => sun || undefined, checks: ['Sun direction vs. shooting direction', 'Window orientation / blackout needs', 'Practicals & dimmers', 'Light spill from street / neighbours'] },
  { title: 'Parking & transport', known: (l) => l.parking, checks: ['Crew parking', 'Truck / van parking & permits', 'Cast drop-off point', 'Public transport nearby'] },
  { title: 'Holding & base camp', checks: ['Cast holding / green room', 'Hair, makeup & wardrobe space', 'Gear staging / crew base', 'Catering / lunch area'] },
  { title: 'Restrooms', known: (l) => l.restrooms, checks: ['Number & location', 'Accessible restroom'] },
  { title: 'Load-in & access', known: (l) => l.loadIn, checks: ['Elevator / stairs', 'Distance from trucks to set', 'Door widths, floor protection', 'Access hours, keys, security'] },
  { title: 'Permits & safety', known: (l) => permitText(l), checks: ['Permit status & restrictions', 'Fire exits & extinguishers', 'Hazards (heights, water, traffic)', 'Route to nearest hospital'] },
  { title: 'Connectivity', known: (l) => (l.wifi ? `Wi-Fi: ${l.wifi}` : undefined), checks: ['Cell signal (by carrier)', 'Wi-Fi / network for DIT & video village'] },
];

const ATTENDEES = ['Director', 'DP', 'Gaffer', 'Key grip', 'Sound', '1st AD', 'Production designer', 'Location manager', 'Producer'];

const techScout: PrintDocDef = {
  id: 'tech-scout',
  title: 'Tech Scout Checklist',
  group: 'Locations',
  orientation: 'portrait',
  description: 'Per-location checklist for the tech scout: power, sound, sun, parking, holding, restrooms, load-in, permits',
  options: [
    { key: 'blankLines', label: 'Blank lines per section', type: 'number', default: 2, min: 0, max: 6 },
    { key: 'showKnown', label: 'Pre-fill what we already know', type: 'boolean', default: true },
    { key: 'hideDeclined', label: 'Skip declined locations', type: 'boolean', default: true },
  ],
  emptyReason: locEmpty,
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const list = pickLocations(p, o, !!o.hideDeclined);
    const lines = Math.max(0, Math.min(6, Number(o.blankLines ?? 2)));

    const sheet = (l: Location, i: number) => {
      const days = shootDaysAt(p.schedule, p.callSheets, p.locations, ctx.model, l.id);
      const scenes = scenesAt(p.locations, ctx.model, l.id);
      const firstDate = days.find((d) => d.date)?.date;
      const sun = sunLine(ctx, l, firstDate);
      return (
        <div key={l.id} className={['ts-sheet', i > 0 && 'pp-break-before'].filter(Boolean).join(' ')}>
          <DocHeader
            ctx={ctx}
            title={`Tech Scout — ${l.name || 'Untitled location'}`}
            subtitle={[kindLabel(l), l.address].filter(Boolean).join(' · ')}
            meta={
              <div className="ts-date">
                Scout date <span className="ts-fill" />
              </div>
            }
          />
          <div className="ts-info">
            <KV
              cols={3}
              keepEmpty
              items={[
                ['Contact', [l.contactName, l.contactPhone].filter(Boolean).join(' · ') || '—'],
                ['Shoot days', days.map((d) => `${d.label}${d.date ? ` · ${ctx.fmt.dateShort(d.date)}` : ''}`).join(', ') || 'Not scheduled'],
                ['Scenes', scenes.map((s) => s.number).join(', ') || '—'],
                ['Sets', (l.sets ?? []).join(', ') || '—'],
                ['GPS', formatCoords(l.lat, l.lng) || '—'],
                ['Sun on first shoot day', sun || '—'],
              ]}
            />
          </div>
          <div className="ts-attendees">
            <span className="pp-strong pp-upper pp-tiny">Attending</span>
            {ATTENDEES.map((a) => (
              <span key={a} className="ts-att">
                <Check /> {a}
              </span>
            ))}
          </div>
          <div className="ts-grid">
            {SCOUT_SECTIONS.map((sec) => {
              const known = o.showKnown ? sec.known?.(l, sun) : undefined;
              return (
                <Box key={sec.title} title={sec.title} className="pp-avoid ts-box">
                  {known && <div className="ts-known">On file: {known}</div>}
                  {sec.checks.map((c) => (
                    <div key={c} className="ts-check">
                      <Check /> <span>{c}</span>
                    </div>
                  ))}
                  {Array.from({ length: lines }, (_, k) => (
                    <div key={k} className="pp-lines" />
                  ))}
                </Box>
              );
            })}
          </div>
          <Box title="Notes & decisions" className="pp-avoid ts-box ts-notes">
            {o.showKnown && l.scoutNotes && <div className="ts-known pp-pre">{l.scoutNotes}</div>}
            {Array.from({ length: Math.max(5, lines + 3) }, (_, k) => (
              <div key={k} className="pp-lines" />
            ))}
          </Box>
        </div>
      );
    };

    return {
      body: list.length ? <>{list.map(sheet)}</> : <div className="pp-muted">No locations to print.</div>,
      title: list.length === 1 ? `Tech Scout – ${list[0].name || 'Untitled'}` : 'Tech Scout Checklists',
      css: `
.ts-date { font-size: 8pt; color: #55555e; }
.ts-fill { display: inline-block; width: 1.2in; border-bottom: 0.75pt solid #888; margin-left: 4pt; }
.ts-info { margin-bottom: 8pt; }
.ts-attendees { display: flex; flex-wrap: wrap; align-items: center; gap: 4pt 10pt; padding: 5pt 0 8pt; border-bottom: 0.75pt solid #c9c9d1; margin-bottom: 9pt; font-size: 8pt; }
.ts-att { white-space: nowrap; }
.ts-grid { column-count: 2; column-gap: 7pt; }
.ts-box { padding: 6pt 8pt; break-inside: avoid; page-break-inside: avoid; margin-bottom: 7pt; }
.ts-grid > .ts-box { display: inline-block; width: 100%; }
.ts-notes { margin-top: 0; }
.ts-known { font-size: 7.6pt; color: #55555e; background: #f4f4f7; border-radius: 2pt; padding: 2pt 4pt; margin-bottom: 4pt; }
.ts-check { display: flex; gap: 5pt; align-items: baseline; font-size: 8.3pt; padding: 1.2pt 0; }
.ts-check .pp-check { flex-shrink: 0; }
`,
    };
  },
};

export const printDocs: PrintDocDef[] = [locationList, locationSheets, techScout];
