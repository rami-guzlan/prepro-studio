/* Printable documents of the Cast & Characters module. */
import type { ReactNode } from 'react';
import type { CastMember, Character, ID, ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import type { SceneInfo } from '@/script-core/model';
import { Box, Check, DocHeader, Dot, KV, Photo, PBadge, Pre, PSection, PTable, type PCol } from '@/print/components';
import { CAST_STATUSES, optionColor, optionLabel, RATE_UNITS } from '@/lib/constants';
import { dayDates, sceneDayIndex } from '@/derived/project';
import { boardOf, characterStats, hasMeasurements, MEASUREMENTS, rolesByCast, sortByBoard, sortCastByBoard } from './data';

/* ------------------------------------------------------------------ helpers */

function statusBadge(status: string | undefined) {
  if (!status) return null;
  return <PBadge color={optionColor(CAST_STATUSES, status)}>{optionLabel(CAST_STATUSES, status)}</PBadge>;
}

function rateText(ctx: PrintContext, m: { rate?: number; rateUnit?: string }): string {
  if (m.rate == null) return '';
  const unit = m.rateUnit ? RATE_UNITS.find((u) => u.value === m.rateUnit)?.label ?? '' : '';
  return `${ctx.fmt.money(m.rate)} ${unit}`.trim();
}

function lines(...parts: (string | undefined | null | false)[]): ReactNode {
  const shown = parts.filter((x): x is string => !!x && !!x.trim());
  if (!shown.length) return null;
  return shown.map((s, i) => (
    <div key={i} className={i === 0 ? undefined : 'pp-muted pp-small'}>
      {s}
    </div>
  ));
}

/** "Day 1 · Sat 11/7" for scheduled scenes. */
function dayLabeler(p: ProjectData, ctx: PrintContext) {
  const idx = sceneDayIndex(p);
  const dates = dayDates(p);
  return (sceneId: ID): string => {
    const i = idx.get(sceneId);
    if (i == null) return '';
    const d = dates[i];
    return `Day ${i + 1}${d ? ` · ${ctx.fmt.dateShort(d)}` : ''}`;
  };
}

function rolesLabel(roles: Character[]): string {
  return roles.map((r) => `${r.number != null ? `${r.number}. ` : ''}${r.name}`).join(', ');
}

const castEmpty = (p: ProjectData) => (p.cast.length ? false : 'No cast members yet');

/* ------------------------------------------------------------------ cast list */

interface CastRow {
  member?: CastMember;
  roles: Character[];
}

const castList: PrintDocDef = {
  id: 'cast-list',
  title: 'Cast List',
  group: 'People',
  orientation: 'portrait',
  description: 'Cast by board number with characters, phone, email and agent',
  options: [
    { key: 'withPhotos', label: 'Headshots', type: 'boolean', default: false },
    { key: 'showContact', label: 'Phone & email', type: 'boolean', default: true },
    { key: 'showAgent', label: 'Agent / representation', type: 'boolean', default: true },
    { key: 'showStatus', label: 'Casting status', type: 'boolean', default: false },
    { key: 'includeUncast', label: 'Include uncast characters (TBD)', type: 'boolean', default: true },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: (p) => (p.cast.length || p.characters.length ? false : 'No cast or characters yet'),
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const roles = rolesByCast(p.characters);
    const castIds = new Set(p.cast.map((m) => m.id));
    const rows: CastRow[] = sortCastByBoard(p.cast, roles)
      .filter((m) => !o.hideDeclined || m.status !== 'declined')
      .map((m) => ({ member: m, roles: roles.get(m.id) ?? [] }));
    if (o.includeUncast) for (const c of sortByBoard(p.characters)) if (!c.castId || !castIds.has(c.castId)) rows.push({ roles: [c] });
    rows.sort((a, b) => boardOf(a.roles) - boardOf(b.roles) || (a.member?.name ?? '~').localeCompare(b.member?.name ?? '~'));

    const cols: PCol<CastRow>[] = [
      { header: '#', width: '0.32in', cell: (r) => <span className="pp-strong">{r.roles.map((c) => c.number).filter((n) => n != null).join(', ')}</span> },
    ];
    if (o.withPhotos)
      cols.push({
        header: '',
        width: '0.58in',
        cell: (r) => (r.member?.photo ? <img className="cl-photo" src={ctx.asset(r.member.photo)} alt="" /> : <div className="cl-photo cl-photo-empty" />),
      });
    cols.push(
      {
        header: 'Character',
        width: o.showContact || o.showAgent ? '1.1in' : undefined,
        cell: (r) => (
          <div className="cl-chars">
            {r.roles.length ? (
              r.roles.map((c) => (
                <div key={c.id} className="pp-strong">
                  {c.color && <Dot color={c.color} />}
                  {c.name}
                </div>
              ))
            ) : (
              <span className="pp-muted">—</span>
            )}
          </div>
        ),
      },
      {
        header: 'Cast',
        width: o.showContact || o.showAgent ? '1.35in' : undefined,
        cell: (r) =>
          r.member ? (
            <>
              <div className="pp-strong">{r.member.name || 'Unnamed'}</div>
              {(r.member.pronouns || r.member.union) && <div className="pp-muted pp-small">{[r.member.pronouns, r.member.union].filter(Boolean).join(' · ')}</div>}
            </>
          ) : (
            <span className="pp-muted">TBD</span>
          ),
      },
    );
    if (o.showStatus) cols.push({ header: 'Status', width: '0.78in', cell: (r) => statusBadge(r.member?.status) });
    if (o.showContact)
      cols.push({
        header: 'Phone / email',
        width: o.showAgent ? '1.9in' : undefined,
        cell: (r) =>
          r.member ? (
            <>
              <div className="pp-nowrap">{r.member.phone}</div>
              {r.member.email && <div className="pp-small cl-break">{r.member.email}</div>}
            </>
          ) : null,
      });
    if (o.showAgent)
      cols.push({
        header: 'Agent',
        cell: (r) => (r.member ? lines([r.member.agent, r.member.agency].filter(Boolean).join(' · '), r.member.agentPhone, r.member.agentEmail) : null),
      });

    const confirmed = p.cast.filter((m) => m.status === 'confirmed').length;
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Cast List" subtitle={`${p.cast.length} cast · ${confirmed} confirmed · ${p.characters.length} characters`} />
          <PTable columns={cols} rows={rows} zebra empty="No cast yet." rowStyle={(r) => (r.member ? undefined : { color: '#707078' })} />
        </>
      ),
      css: `
.cl-photo { width: 0.5in; height: 0.66in; object-fit: cover; border-radius: 2pt; display: block; background: #e9e9ee; }
.cl-photo-empty { border: 0.5pt dashed #c9c9d1; }
.cl-chars > div + div { margin-top: 2pt; }
.cl-break { overflow-wrap: anywhere; }
`,
    };
  },
};

/* ------------------------------------------------------------------ cast sheets */

const castSheets: PrintDocDef = {
  id: 'cast-sheets',
  title: 'Cast Sheets',
  group: 'People',
  orientation: 'portrait',
  description: 'One page per actor: headshot, roles, contact, agent, sizes, health and emergency info, scenes',
  options: [
    { key: 'showScenes', label: 'Scenes the actor works', type: 'boolean', default: true },
    { key: 'showSizes', label: 'Wardrobe sizes', type: 'boolean', default: true },
    { key: 'showRates', label: 'Rate & deal (confidential)', type: 'boolean', default: false },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: castEmpty,
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const roles = rolesByCast(p.characters);
    const stats = characterStats(p.characters, ctx.model);
    const dayOf = dayLabeler(p, ctx);
    let members = sortCastByBoard(p.cast, roles);
    if (typeof o.only === 'string' && o.only) members = members.filter((m) => m.id === o.only);
    else if (o.hideDeclined) members = members.filter((m) => m.status !== 'declined');

    const sheet = (m: CastMember, i: number) => {
      const rs = roles.get(m.id) ?? [];
      const sceneMap = new Map<ID, { s: SceneInfo; chars: string[] }>();
      for (const c of rs) {
        for (const s of stats.get(c.id)?.scenes ?? []) {
          const e = sceneMap.get(s.id) ?? { s, chars: [] };
          e.chars.push(c.name);
          sceneMap.set(s.id, e);
        }
      }
      const scenes = [...sceneMap.values()].sort((a, b) => a.s.index - b.s.index);
      const sizes = MEASUREMENTS.filter((f) => m.measurements?.[f.key]?.trim()).map((f): [ReactNode, ReactNode] => [f.label, m.measurements?.[f.key]]);
      return (
        <div key={m.id} className={['cs-sheet', i > 0 && 'pp-break-before'].filter(Boolean).join(' ')}>
          <DocHeader ctx={ctx} title={m.name || 'Unnamed actor'} subtitle={rs.length ? `as ${rs.map((r) => r.name).join(', ')}` : 'No role assigned'} meta={<>{statusBadge(m.status)}</>} />
          <div className="cs-top">
            <div className="cs-photo">
              <Photo src={m.photo ? ctx.asset(m.photo) : undefined} aspect={3 / 4} placeholder="No headshot" />
            </div>
            <div className="cs-main">
              {rs.length > 0 && (
                <div className="cs-roles">
                  {rs.map((c) => (
                    <span key={c.id} className="cs-role" style={c.color ? { borderColor: c.color } : undefined}>
                      {c.number != null && <span className="cs-n">{c.number}</span>}
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
              <KV
                cols={2}
                items={[
                  ['Phone', m.phone],
                  ['Email', m.email],
                  ['Pronouns', m.pronouns],
                  ['Union', m.union],
                  ['Address', m.address],
                  ...(o.showRates ? ([['Rate', rateText(ctx, m)]] as [ReactNode, ReactNode][]) : []),
                ]}
              />
              {(m.agent || m.agency || m.agentPhone || m.agentEmail) && (
                <Box title="Representation" style={{ marginTop: '9pt' }}>
                  <KV
                    cols={2}
                    items={[
                      ['Agent', m.agent],
                      ['Agency', m.agency],
                      ['Phone', m.agentPhone],
                      ['Email', m.agentEmail],
                    ]}
                  />
                </Box>
              )}
              {o.showRates && (
                <div className="cs-paper">
                  <Check on={m.releaseSigned} /> Release signed <span style={{ width: '12pt', display: 'inline-block' }} />
                  <Check on={m.contractSigned} /> Contract signed
                </div>
              )}
            </div>
          </div>

          <div className="cs-grid3">
            <Box title="Availability">{m.availability ? <Pre>{m.availability}</Pre> : <span className="pp-muted">—</span>}</Box>
            <Box title="Dietary & medical">
              <KV
                cols={1}
                items={[
                  ['Dietary', m.dietary],
                  ['Allergies', m.allergies],
                  ['Medical', m.medical],
                ]}
              />
              {!m.dietary && !m.allergies && !m.medical && <span className="pp-muted">None noted</span>}
            </Box>
            <Box title="Emergency contact">
              {m.emergencyName || m.emergencyPhone ? (
                <>
                  <div className="pp-strong">{m.emergencyName}</div>
                  <div>{m.emergencyPhone}</div>
                </>
              ) : (
                <span className="pp-muted">—</span>
              )}
            </Box>
          </div>

          {o.showSizes && (
            <PSection title="Wardrobe sizes">{sizes.length ? <KV cols={6} items={sizes} /> : <div className="pp-muted">No measurements on file.</div>}</PSection>
          )}

          {o.showScenes && rs.length > 0 && (
            <PSection title="Scenes" right={`${scenes.length} scenes · ${ctx.fmt.eighths(scenes.reduce((a, x) => a + x.s.eighths, 0))} pages`}>
              <PTable
                columns={[
                  { header: 'Sc', width: '0.45in', cell: (x) => <span className="pp-strong">{x.s.number}</span> },
                  { header: 'Scene', cell: (x) => x.s.heading },
                  ...(rs.length > 1 ? [{ header: 'As', width: '1.1in', cell: (x: { chars: string[] }) => x.chars.join(', ') }] : []),
                  { header: 'Pages', width: '0.55in', num: true, cell: (x) => ctx.fmt.eighths(x.s.eighths) },
                  { header: 'Shoot', width: '1.05in', cell: (x) => dayOf(x.s.id) },
                ]}
                rows={scenes}
                empty="Not in any scene yet."
              />
            </PSection>
          )}

          {m.notes && (
            <PSection title="Notes">
              <Pre>{m.notes}</Pre>
            </PSection>
          )}
        </div>
      );
    };

    return {
      body: members.length ? <>{members.map(sheet)}</> : <div className="pp-muted">No cast members to print.</div>,
      title: members.length === 1 ? `Cast Sheet – ${members[0].name || 'Unnamed'}` : 'Cast Sheets',
      css: `
.cs-top { display: flex; gap: 14pt; align-items: flex-start; }
.cs-photo { width: 2.05in; flex-shrink: 0; }
.cs-main { flex: 1; min-width: 0; }
.cs-roles { display: flex; flex-wrap: wrap; gap: 4pt; margin-bottom: 10pt; }
.cs-role { border: 1pt solid #b9b9c3; border-radius: 3pt; padding: 2pt 7pt; font-weight: 700; font-size: 10pt; letter-spacing: 0.02em; }
.cs-n { color: #8a8a94; margin-right: 4pt; font-weight: 600; }
.cs-paper { margin-top: 9pt; font-size: 8.5pt; }
.cs-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8pt; margin-top: 12pt; }
`,
    };
  },
};

/* ------------------------------------------------------------------ character breakdown */

const characterBreakdown: PrintDocDef = {
  id: 'character-breakdown',
  title: 'Character Breakdown',
  group: 'People',
  orientation: 'portrait',
  description: 'Every character with description, actor and the scenes they appear in',
  options: [
    { key: 'showActor', label: 'Show actor', type: 'boolean', default: true },
    { key: 'showSchedule', label: 'Shoot day per scene', type: 'boolean', default: true },
    { key: 'includeUnused', label: 'Include characters without scenes', type: 'boolean', default: true },
  ],
  emptyReason: (p) => (p.characters.length ? false : 'No characters yet'),
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const stats = characterStats(p.characters, ctx.model);
    const dayOf = dayLabeler(p, ctx);
    const chars = sortByBoard(p.characters).filter((c) => o.includeUnused || (stats.get(c.id)?.scenes.length ?? 0) > 0);
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Character Breakdown" subtitle={`${chars.length} characters · ${ctx.model.scenes.length} scenes`} />
          {chars.length === 0 && <div className="pp-muted">No characters.</div>}
          {chars.map((c) => {
            const st = stats.get(c.id);
            const actor = p.cast.find((m) => m.id === c.castId);
            const scenes = st?.scenes ?? [];
            const names = [c.name, ...(c.aliases ?? [])].map((n) => n.toUpperCase());
            const meta = [c.age && `Age ${c.age}`, c.gender, c.aliases?.length ? `aka ${c.aliases.join(', ')}` : ''].filter(Boolean).join(' · ');
            return (
              <div key={c.id} className="cb-char pp-avoid">
                <div className="cb-head" style={c.color ? { borderLeftColor: c.color } : undefined}>
                  <span className="cb-num">{c.number ?? '–'}</span>
                  <div className="pp-grow">
                    <div className="cb-name">{c.name}</div>
                    {meta && <div className="pp-muted pp-small">{meta}</div>}
                  </div>
                  <div className="pp-right">
                    {o.showActor && <div className="pp-strong">{actor ? actor.name || 'Unnamed actor' : <span className="pp-muted">Uncast</span>}</div>}
                    <div className="pp-muted pp-small">
                      {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} · {ctx.fmt.eighths(st?.eighths ?? 0) || '0'} pgs
                      {st?.speeches ? ` · ${st.speeches} speeches` : ''}
                    </div>
                  </div>
                </div>
                {c.description && <div className="cb-desc">{c.description}</div>}
                {c.notes && <div className="cb-desc pp-muted">{c.notes}</div>}
                {scenes.length > 0 && (
                  <PTable
                    className="cb-table"
                    columns={[
                      { header: 'Sc', width: '0.45in', cell: (s) => <span className="pp-strong">{s.number}</span> },
                      { header: 'Scene', cell: (s) => s.heading },
                      { header: 'D/N', width: '0.5in', cell: (s) => s.dayNight || '' },
                      { header: 'Pages', width: '0.5in', num: true, cell: (s) => ctx.fmt.eighths(s.eighths) },
                      { header: '', width: '0.5in', cell: (s) => (s.speaking.some((n) => names.includes(n)) ? '' : <span className="pp-muted pp-small">silent</span>) },
                      ...(o.showSchedule ? [{ header: 'Shoot', width: '1.05in', cell: (s: SceneInfo) => dayOf(s.id) }] : []),
                    ]}
                    rows={scenes}
                  />
                )}
              </div>
            );
          })}
        </>
      ),
      css: `
.cb-char { margin-bottom: 14pt; }
.cb-head { display: flex; align-items: center; gap: 9pt; padding: 4pt 0 4pt 8pt; border-left: 3pt solid #b9b9c3; margin-bottom: 4pt; }
.cb-num { display: inline-flex; align-items: center; justify-content: center; min-width: 18pt; height: 18pt; border-radius: 3pt; background: #ececf1; font-weight: 800; font-size: 10pt; }
.cb-name { font-size: 12pt; font-weight: 800; letter-spacing: 0.02em; }
.cb-desc { margin: 2pt 0 5pt 11pt; }
.cb-table { margin-left: 0; }
`,
    };
  },
};

/* ------------------------------------------------------------------ size sheet */

const sizeSheet: PrintDocDef = {
  id: 'size-sheet',
  title: 'Wardrobe Size Sheet',
  group: 'People',
  orientation: 'landscape',
  description: 'All cast measurements in one table for the costume department',
  options: [
    { key: 'hideEmptyColumns', label: 'Hide empty measurement columns', type: 'boolean', default: true },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
    { key: 'withPhotos', label: 'Headshots', type: 'boolean', default: false },
  ],
  emptyReason: castEmpty,
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const roles = rolesByCast(p.characters);
    const members = sortCastByBoard(p.cast, roles).filter((m) => !o.hideDeclined || m.status !== 'declined');
    const fields = MEASUREMENTS.filter((f) => !o.hideEmptyColumns || members.some((m) => m.measurements?.[f.key]?.trim()));
    const cols: PCol<CastMember>[] = [];
    if (o.withPhotos)
      cols.push({ header: '', width: '0.5in', cell: (m) => (m.photo ? <img className="ss-photo" src={ctx.asset(m.photo)} alt="" /> : <div className="ss-photo" />) });
    cols.push({
      header: 'Cast / role',
      width: '1.55in',
      cell: (m) => (
        <>
          <div className="pp-strong">{m.name || 'Unnamed'}</div>
          <div className="pp-muted pp-small">{rolesLabel(roles.get(m.id) ?? []) || '—'}</div>
        </>
      ),
    });
    for (const f of fields)
      cols.push({
        header: f.label,
        align: f.key === 'hair' ? 'left' : 'center',
        width: f.key === 'hair' ? '1.25in' : f.key === 'eyes' ? '0.62in' : undefined,
        cell: (m) => m.measurements?.[f.key] ?? '',
      });
    const missing = members.filter((m) => !hasMeasurements(m.measurements));
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Wardrobe Size Sheet" subtitle={`${members.length} cast members${missing.length ? ` · ${missing.length} without sizes` : ''}`} />
          {fields.length === 0 ? (
            <div className="pp-muted">No measurements recorded yet.</div>
          ) : (
            <PTable columns={cols} rows={members} bordered className="ss-table" />
          )}
        </>
      ),
      css: `
.ss-table td { font-size: 8.5pt; }
.ss-table th { font-size: 6.4pt; }
.ss-photo { width: 0.4in; height: 0.53in; object-fit: cover; border-radius: 2pt; display: block; background: #e9e9ee; }
`,
    };
  },
};

/* ------------------------------------------------------------------ release tracker */

const releaseTracker: PrintDocDef = {
  id: 'cast-release-tracker',
  title: 'Cast Release & Contract Tracker',
  group: 'People',
  orientation: 'portrait',
  description: 'Paperwork status per actor: release, contract, union and rate',
  options: [
    { key: 'showRates', label: 'Show rates', type: 'boolean', default: true },
    { key: 'hideDeclined', label: 'Hide declined', type: 'boolean', default: true },
  ],
  emptyReason: castEmpty,
  render: (ctx) => {
    const p = ctx.project;
    const o = ctx.options;
    const roles = rolesByCast(p.characters);
    const members = sortCastByBoard(p.cast, roles).filter((m) => !o.hideDeclined || m.status !== 'declined');
    const rel = members.filter((m) => m.releaseSigned).length;
    const con = members.filter((m) => m.contractSigned).length;
    const cols: PCol<CastMember>[] = [
      {
        header: 'Cast',
        cell: (m) => (
          <>
            <div className="pp-strong">{m.name || 'Unnamed'}</div>
            <div className="pp-muted pp-small">{rolesLabel(roles.get(m.id) ?? []) || '—'}</div>
          </>
        ),
      },
      { header: 'Status', width: '0.9in', cell: (m) => statusBadge(m.status) },
      { header: 'Union', width: '0.95in', cell: (m) => m.union },
      ...(o.showRates ? [{ header: 'Rate', width: '1.05in', cell: (m: CastMember) => rateText(ctx, m) }] : []),
      { header: 'Release', width: '0.6in', align: 'center', cell: (m) => <Check on={m.releaseSigned} /> },
      { header: 'Contract', width: '0.62in', align: 'center', cell: (m) => <Check on={m.contractSigned} /> },
      { header: 'Notes', width: '1.6in', cell: () => <div className="rt-line" /> },
    ];
    return {
      body: (
        <>
          <DocHeader ctx={ctx} title="Release & Contract Tracker" subtitle={`${rel} of ${members.length} releases · ${con} of ${members.length} contracts signed`} />
          <PTable columns={cols} rows={members} zebra empty="No cast yet." />
        </>
      ),
      css: `.rt-line { border-bottom: 0.5pt solid #bbb; height: 12pt; }`,
    };
  },
};

export const printDocs: PrintDocDef[] = [castList, castSheets, characterBreakdown, sizeSheet, releaseTracker];
