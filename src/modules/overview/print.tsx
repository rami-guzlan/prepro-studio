import type { PrintDocDef } from '@/print/types';
import { DocHeader, KV, PBadge, PSection, PTable, Pre, Check } from '@/print/components';
import { charactersForCast, crewByDepartment, scheduleInfo } from '@/derived/project';
import { CAST_STATUSES, DEPARTMENTS, LOCATION_STATUSES, PROJECT_STATUSES, PROJECT_TYPES, optionColor, optionLabel } from '@/lib/constants';
import { MONTHS_LONG, parseISODate, todayISO, weekdayShort } from '@/lib/dates';
import { formatSeconds, parseDuration } from '@/lib/format';
import { titleCase } from '@/lib/text';
import { computeTiming } from '@/modules/avscript/format';
import { EVENT_KINDS, budgetTotals, projectEvents, shootRange, type ProjectEvent } from './derive';

const ONE_SHEET_CSS = `
.ovp-hero { display: flex; gap: 16pt; align-items: flex-start; padding-bottom: 10pt; margin-bottom: 4pt; border-bottom: 2pt solid var(--pp-accent, #6d4aff); }
.ovp-cover { width: 2.3in; flex-shrink: 0; border-radius: 4pt; overflow: hidden; background: #e9e9ee; }
.ovp-cover img { display: block; width: 100%; height: auto; }
.ovp-hero-main { flex: 1; min-width: 0; }
.ovp-kicker { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #6b6b75; }
.ovp-hero h1 { font-size: 24pt; line-height: 1.1; margin: 3pt 0 2pt; letter-spacing: -0.02em; }
.ovp-sub { font-size: 10pt; color: #55555e; margin-bottom: 4pt; }
.ovp-logline { font-size: 10.5pt; font-style: italic; line-height: 1.4; margin: 6pt 0 10pt; color: #26262e; }
.ovp-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6pt; }
.ovp-stat { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 5pt 7pt; }
.ovp-stat .k { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; }
.ovp-stat .v { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; }
.ovp-stat .s { font-size: 7pt; color: #707078; }
.ovp-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14pt; }
.ovp-crew { font-size: 8.3pt; }
.ovp-crew .dept { break-inside: avoid; margin-bottom: 5pt; }
.ovp-crew .dept-name { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6b75; margin-bottom: 1pt; }
.ovp-crew .who { display: flex; justify-content: space-between; gap: 8pt; border-bottom: 0.4pt solid #ececf1; padding: 0.8pt 0; }
.ovp-crew .who span:first-child { white-space: nowrap; font-weight: 600; }
.ovp-crew .who span:last-child { color: #55555e; text-align: right; }
.ovp-day-label { color: #66666f; font-size: 7.4pt; }
`;

const CAL_CSS = `
.ovc-date { white-space: nowrap; font-variant-numeric: tabular-nums; }
.ovc-date .wd { color: #7a7a84; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 3pt; }
.ovc-label { font-weight: 650; }
.ovc-done .ovc-label { color: #7a7a84; text-decoration: line-through; }
.ovc-detail { color: #66666f; font-size: 7.6pt; }
.ovc-summary { display: flex; gap: 14pt; flex-wrap: wrap; margin-bottom: 8pt; font-size: 8pt; color: #55555e; }
.ovc-summary b { color: #141418; }
`;

function stat(k: string, v: string | number, s?: string) {
  return (
    <div className="ovp-stat" key={k}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export const printDocs: PrintDocDef[] = [
  {
    id: 'project-overview',
    title: 'Project One-Sheet',
    group: 'Overview',
    orientation: 'portrait',
    description: 'Cover, logline, synopsis, format, key people, locations, stats and the shooting schedule at a glance',
    options: [
      { key: 'showCover', label: 'Show cover image', type: 'boolean', default: true },
      { key: 'showBudget', label: 'Show budget total', type: 'boolean', default: true },
      { key: 'showPeople', label: 'Show cast & crew', type: 'boolean', default: true },
      { key: 'showSchedule', label: 'Show schedule summary', type: 'boolean', default: true },
    ],
    render: (ctx) => {
      const p = ctx.project;
      const m = p.meta;
      const { fmt, model, options } = ctx;
      const cover = options.showCover && m.poster ? ctx.asset(m.poster) : '';
      const range = shootRange(p);
      const days = scheduleInfo(p, model);
      const budget = budgetTotals(p.budget);
      const target = parseDuration(m.targetRuntime ?? '');
      const cast = p.cast.filter((c) => c.status !== 'declined');
      const crew = crewByDepartment(
        p.crew.filter((c) => c.status !== 'declined'),
        DEPARTMENTS,
      );
      const locations = p.locations.filter((l) => l.status !== 'declined');
      const shots = p.shots.filter((s) => s.status !== 'omitted');
      const avRows = p.script.av?.rows ?? [];
      const avSeconds = computeTiming(avRows).total;
      const shootText = range.start
        ? range.end && range.end !== range.start
          ? `${fmt.dateMedium(range.start)} – ${fmt.dateMedium(range.end)}`
          : fmt.dateMedium(range.start)
        : '';

      const stats = [
        model.scenes.length ? stat('Script', `${model.pageCount} pp`, `${model.scenes.length} scenes`) : stat('A/V script', avRows.length, avSeconds ? formatSeconds(avSeconds) : 'rows'),
        stat('Est. runtime', model.scenes.length && model.estMinutes ? fmt.minutes(Math.max(1, model.estMinutes)) : avSeconds ? formatSeconds(avSeconds) : '—', target ? `Target ${formatSeconds(target)}` : undefined),
        stat('Shoot days', range.days, shootText || undefined),
        stat('Shots', shots.length, `${shots.filter((s) => s.image || s.drawing).length} storyboarded`),
        stat('Cast', `${cast.filter((c) => c.status === 'confirmed').length}/${cast.length}`, 'confirmed'),
        stat('Crew', p.crew.filter((c) => c.status === 'confirmed').length, 'confirmed'),
        stat('Locations', `${locations.filter((l) => l.status === 'confirmed').length}/${locations.length}`, 'confirmed'),
        options.showBudget
          ? stat('Budget', budget.total ? fmt.money(budget.total, { cents: false }) : '—', budget.actual ? `Actual ${fmt.money(budget.actual, { cents: false })}` : undefined)
          : stat('Tasks', `${p.tasks.filter((t) => t.status === 'done').length}/${p.tasks.length}`, 'done'),
      ];

      return {
        css: ONE_SHEET_CSS,
        body: (
          <>
            <div className="ovp-hero pp-avoid">
              {cover && (
                <div className="ovp-cover">
                  <img src={cover} alt="" />
                </div>
              )}
              <div className="ovp-hero-main">
                <div className="ovp-kicker">
                  {optionLabel(PROJECT_TYPES, m.projectType)} · {optionLabel(PROJECT_STATUSES, m.status)}
                </div>
                <h1>{m.title || 'Untitled Project'}</h1>
                {m.subtitle && <div className="ovp-sub">{m.subtitle}</div>}
                {m.logline && <p className="ovp-logline">{m.logline}</p>}
                <KV
                  cols={3}
                  items={[
                    ['Director', m.director],
                    ['Producer', m.producer],
                    ['Writer', m.writer],
                    ['Client', m.client],
                    ['Production company', m.productionCompany],
                  ]}
                />
              </div>
            </div>

            {m.synopsis && (
              <PSection title="Synopsis">
                <Pre>{m.synopsis}</Pre>
              </PSection>
            )}

            <PSection title="At a glance" className="pp-avoid">
              <div className="ovp-stats">{stats}</div>
            </PSection>

            <PSection title="Format & key dates" className="pp-avoid">
              <KV
                cols={4}
                items={[
                  ['Aspect ratio', m.aspectRatio],
                  ['Resolution', m.resolution?.replace('x', '×')],
                  ['Frame rate', m.frameRate ? `${m.frameRate} fps` : ''],
                  ['Target runtime', target ? formatSeconds(target) : m.targetRuntime],
                  ['Shoot', shootText],
                  ['Delivery', fmt.dateMedium(m.deliveryDate)],
                ]}
              />
            </PSection>

            {options.showPeople && (cast.length > 0 || crew.length > 0) && (
              <div className="ovp-two">
                <PSection title="Cast">
                  <PTable
                    rows={cast}
                    empty="No cast yet."
                    columns={[
                      { header: 'Actor', cell: (c) => <span className="pp-strong">{c.name}</span> },
                      { header: 'Role', cell: (c) => charactersForCast(p, c.id).map((ch) => titleCase(ch.name)).join(', ') || '—' },
                      {
                        header: 'Status',
                        width: '62pt',
                        cell: (c) => <PBadge color={optionColor(CAST_STATUSES, c.status)}>{optionLabel(CAST_STATUSES, c.status)}</PBadge>,
                      },
                    ]}
                  />
                </PSection>
                <PSection title="Crew">
                  {crew.length === 0 ? (
                    <div className="pp-muted">No crew yet.</div>
                  ) : (
                    <div className="ovp-crew">
                      {crew.map(([dept, list]) => (
                        <div className="dept" key={dept}>
                          <div className="dept-name">{dept}</div>
                          {list.map((c) => (
                            <div className="who" key={c.id}>
                              <span>{c.name}</span>
                              <span>{c.position}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </PSection>
              </div>
            )}

            {locations.length > 0 && (
              <PSection title="Locations">
                <PTable
                  rows={locations}
                  columns={[
                    { header: 'Location', cell: (l) => <span className="pp-strong">{l.name}</span> },
                    { header: 'Address', cell: (l) => l.address ?? '' },
                    { header: 'Sets', cell: (l) => l.sets.map((s) => titleCase(s)).join(', ') },
                    {
                      header: 'Status',
                      width: '62pt',
                      cell: (l) => <PBadge color={optionColor(LOCATION_STATUSES, l.status)}>{optionLabel(LOCATION_STATUSES, l.status)}</PBadge>,
                    },
                  ]}
                />
              </PSection>
            )}

            {options.showSchedule && days.length > 0 && (
              <PSection title="Shooting schedule">
                <PTable
                  rows={days}
                  columns={[
                    {
                      header: 'Day',
                      width: '96pt',
                      cell: (d) => (
                        <div>
                          <div className="pp-strong">Day {d.index + 1}</div>
                          {d.day.label && <div className="ovp-day-label">{d.day.label}</div>}
                        </div>
                      ),
                    },
                    { header: 'Date', width: '90pt', cell: (d) => (d.date ? fmt.dateMedium(d.date) : 'TBD') },
                    { header: 'Sets', cell: (d) => d.sets.map((s) => titleCase(s)).join(', ') || '—' },
                    { header: 'Scenes', width: '70pt', cell: (d) => d.scenes.map((s) => s.number).join(', ') || '—' },
                    { header: 'Pages', width: '40pt', num: true, cell: (d) => fmt.eighths(d.eighths) },
                    { header: 'Est.', width: '44pt', num: true, cell: (d) => fmt.minutes(d.minutes) },
                  ]}
                />
              </PSection>
            )}
          </>
        ),
      };
    },
  },
  {
    id: 'production-calendar',
    title: 'Production Calendar',
    group: 'Overview',
    orientation: 'portrait',
    description: 'Every dated event in chronological order: shoot days, milestones, post schedule, deliverables and tasks',
    options: [
      { key: 'includeTasks', label: 'Include task due dates', type: 'boolean', default: true },
      { key: 'includeDone', label: 'Include completed tasks', type: 'boolean', default: false },
      { key: 'includePast', label: 'Include past events', type: 'boolean', default: true },
    ],
    emptyReason: (p) => {
      const any =
        p.schedule.days.some((d) => d.date) ||
        p.milestones.some((m) => m.date) ||
        p.post.schedule.some((s) => s.start || s.end) ||
        p.post.deliverables.some((d) => d.due) ||
        p.tasks.some((t) => t.due) ||
        !!p.meta.deliveryDate ||
        !!p.meta.shootStart ||
        !!p.schedule.startDate;
      return any ? false : 'No dated events yet';
    },
    render: (ctx) => {
      const { project: p, model, fmt, options } = ctx;
      const today = todayISO();
      let events = projectEvents(p, model, { tasks: !!options.includeTasks, doneTasks: !!options.includeDone });
      if (!options.includePast) events = events.filter((e) => (e.end ?? e.date) >= today);
      const first = events[0]?.date;
      const last = events.reduce((acc, e) => ((e.end ?? e.date) > acc ? e.end ?? e.date : acc), first ?? '');
      const firstFuture = events.find((e) => e.date >= today)?.id;
      const monthOf = (iso: string) => {
        const d = parseISODate(iso);
        return d ? `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : 'Undated';
      };
      const dateCell = (e: ProjectEvent) => (
        <span className="ovc-date">
          <span className="wd">{weekdayShort(e.date)}</span>
          {fmt.dateMedium(e.date).replace(/, \d{4}$/, '')}
          {e.end ? ` – ${fmt.dateMedium(e.end).replace(/, \d{4}$/, '')}` : ''}
        </span>
      );
      const counts = new Map<string, number>();
      for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
      return {
        css: CAL_CSS,
        body: (
          <>
            <DocHeader
              ctx={ctx}
              title="Production Calendar"
              subtitle={first ? `${fmt.dateMedium(first)} – ${fmt.dateMedium(last)} · ${events.length} events` : 'No events'}
            />
            <div className="ovc-summary">
              {[...counts.entries()].map(([k, n]) => (
                <span key={k}>
                  <b>{n}</b> {n === 1 ? EVENT_KINDS[k as keyof typeof EVENT_KINDS].label.toLowerCase() : EVENT_KINDS[k as keyof typeof EVENT_KINDS].plural}
                </span>
              ))}
            </div>
            <PTable
              rows={events}
              groupBy={(e) => monthOf(e.date)}
              rowStyle={(e) => (e.id === firstFuture && options.includePast ? { boxShadow: 'inset 0 1.5pt 0 #e5484d' } : undefined)}
              empty="No dated events."
              columns={[
                { header: '', width: '12pt', cell: (e) => <Check on={e.done} /> },
                { header: 'Date', width: '120pt', cell: dateCell },
                {
                  header: 'Event',
                  cell: (e) => (
                    <div className={e.done ? 'ovc-done' : undefined}>
                      <div className="ovc-label">{e.label}</div>
                      {e.detail && <div className="ovc-detail">{e.detail}</div>}
                    </div>
                  ),
                },
                { header: 'Type', width: '70pt', cell: (e) => <PBadge color={EVENT_KINDS[e.kind].color}>{EVENT_KINDS[e.kind].label}</PBadge> },
              ]}
            />
          </>
        ),
      };
    },
  },
];
