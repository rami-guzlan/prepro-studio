/* Printable documents of the lighting module:
   - lighting-diagram: one landscape page per diagram (plot + key + cameras + notes)
   - lighting-gear-summary: every fixture across all diagrams, aggregated for the gaffer's order */
import type { DiagramItem, LightingDiagram, ProjectData } from '@/types';
import type { PCol } from '@/print/components';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { Box, DocHeader, KV, PSection, PTable, Pre } from '@/print/components';
import { sceneLabel } from '@/derived/script';
import { kindDef, PURPOSE_COLORS, SENSOR_BY_ID } from './library';
import { PAL_LIGHT } from './color';
import { aggregateBy, aggregateFixtures, boxSize, cameraRows, countLights, dims, fixtureName, fmtUnits, isOrderable, lightRows, num, pstr, totalWatts, type LightRow } from './model';
import { DiagramSvg } from './render';

const CSS = `
.lt-top { display: flex; gap: 10pt; align-items: flex-start; }
.lt-plot { flex: 1; min-width: 0; border: 0.75pt solid #c9c9d1; border-radius: 3pt; padding: 3pt; background: #fff; }
.lt-plot svg { display: block; width: 100%; height: auto; max-height: 4.4in; }
.lt-side { width: 2.4in; flex-shrink: 0; display: flex; flex-direction: column; gap: 7pt; }
.lt-side .pp-box { padding: 6pt 8pt; }
.lt-side .pp-kv { gap: 4pt 10pt; }
.lt-side .pp-kv .pp-v { font-size: 8pt; }
.lt-cam { display: flex; gap: 5pt; align-items: flex-start; font-size: 7.8pt; line-height: 1.3; }
.lt-cam + .lt-cam { margin-top: 4pt; }
.lt-cam-badge { min-width: 13pt; height: 13pt; padding: 0 3pt; border-radius: 7pt; background: #2f7be6; color: #fff; font-weight: 800; font-size: 7pt; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lt-n { display: inline-block; min-width: 17pt; padding: 0.6pt 4pt; border-radius: 7pt; background: #25262d; color: #fff; font-weight: 800; font-size: 7pt; text-align: center; }
.lt-sw { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; border: 0.5pt solid #666; vertical-align: -0.8pt; margin-left: 3pt; }
.lt-purpose { font-weight: 700; white-space: nowrap; }
.lt-purpose i { display: inline-block; width: 5pt; height: 5pt; border-radius: 50%; margin-right: 3pt; vertical-align: 0.5pt; }
.lt-sub { color: #707078; font-size: 7pt; }
.lt-grip { font-size: 7.8pt; columns: 2; column-gap: 8pt; }
.lt-grip div { break-inside: avoid; }
.lt-empty { padding: 30pt; text-align: center; color: #707078; border: 0.75pt dashed #c9c9d1; border-radius: 4pt; }
`;

/* ---------------------------------------------------------------- helpers */

/** Resolve the "diagram" option: 'all', ids, names (exact or partial) or 1-based numbers, comma-separated. */
export function selectDiagrams(project: ProjectData, opt: unknown): LightingDiagram[] {
  const all = project.diagrams ?? [];
  const v = String(opt ?? 'all').trim();
  if (!v || v.toLowerCase() === 'all') return all;
  const out: LightingDiagram[] = [];
  for (const part of v.split(',').map((s) => s.trim()).filter(Boolean)) {
    const lc = part.toLowerCase();
    const found =
      all.find((d) => d.id === part) ??
      all.find((d) => d.name.trim().toLowerCase() === lc) ??
      (/^\d+$/.test(part) ? all[Number(part) - 1] : undefined) ??
      all.find((d) => d.name.toLowerCase().includes(lc));
    if (found && !out.includes(found)) out.push(found);
  }
  return out;
}

function sceneText(ctx: PrintContext, d: LightingDiagram): string {
  return (d.sceneIds ?? [])
    .map((id) => ctx.model.sceneById.get(id))
    .filter((s) => !!s)
    .map((s) => sceneLabel(s))
    .join(' · ');
}

function shotText(ctx: PrintContext, d: LightingDiagram): string {
  const ids = new Set(d.shotIds ?? []);
  for (const s of ctx.project.shots) if (s.diagramId === d.id) ids.add(s.id);
  return ctx.project.shots
    .filter((s) => ids.has(s.id))
    .map((s) => {
      const sc = s.sceneId ? ctx.model.sceneById.get(s.sceneId) : undefined;
      return `${sc ? `${sc.number}` : ''}${sc ? '/' : ''}${s.number}${s.title ? ` ${s.title}` : ''}`;
    })
    .join(', ');
}

function gripName(i: DiagramItem, ppu: number, units: 'ft' | 'm'): string {
  const def = kindDef(i.kind);
  if (['grip.flag', 'grip.scrim', 'grip.diffusion', 'grip.bounce', 'grip.negfill', 'grip.vflat'].includes(def.kind)) {
    const { w } = boxSize(i, def, ppu);
    const size = num(w / ppu, units === 'm' ? 1 : 0);
    const type =
      def.kind === 'grip.bounce'
        ? `Bounce (${pstr(i, 'surface', 'white')})`
        : def.kind === 'grip.diffusion'
          ? `Diffusion frame${pstr(i, 'diffusion') ? ` — ${pstr(i, 'diffusion')}` : ''}`
          : def.kind === 'grip.scrim'
            ? 'Silk / scrim frame'
            : def.kind === 'grip.negfill'
              ? 'Negative fill'
              : def.kind === 'grip.vflat'
                ? 'V-flat'
                : 'Flag / floppy';
    return def.kind === 'grip.vflat' ? type : `${size}${units === 'm' ? ' m' : `x${size}`} ${type}`;
  }
  if (def.kind === 'grip.track' || def.kind === 'grip.slider') {
    const { w } = boxSize(i, def, ppu);
    return `${def.label} (${fmtUnits(w / ppu, units, 0)})`;
  }
  return def.label;
}

const intensityText = (r: LightRow) => `${r.intensity}%`;

/* ---------------------------------------------------------------- diagram page */

function DiagramPage({ ctx, d, idx }: { ctx: PrintContext; d: LightingDiagram; idx: number }) {
  const o = ctx.options;
  const { w, h, ppu, units } = dims(d);
  const rows = lightRows(d);
  const cams = cameraRows(d);
  const watts = totalWatts(d);
  const loc = d.locationId ? ctx.project.locations.find((l) => l.id === d.locationId) : undefined;
  const scenes = sceneText(ctx, d);
  const shots = shotText(ctx, d);
  const grip = aggregateBy([d], (i) => (kindDef(i.kind).category === 'grip' ? gripName(i, ppu, units) : null));
  const sound = d.items.filter((i) => !i.hidden && kindDef(i.kind).category === 'sound').length;
  const showNotes = o.notes !== false;
  const lightCols: PCol<LightRow>[] = [
    {
      header: '#',
      width: '0.55in',
      cell: (r) => (
        <span className="pp-nowrap">
          <span className="lt-n">L{r.n}</span>
          <span className="lt-sw" style={{ background: r.color }} />
        </span>
      ),
    },
    {
      header: 'Purpose',
      width: '0.85in',
      cell: (r) =>
        r.purpose ? (
          <span className="lt-purpose">
            <i style={{ background: PURPOSE_COLORS[r.purpose] ?? '#999' }} />
            {r.purpose}
          </span>
        ) : (
          <span className="pp-muted">—</span>
        ),
    },
    {
      header: 'Fixture',
      cell: (r) => (
        <>
          <div className="pp-strong">{fixtureName(r)}</div>
          {(r.fixture || r.item.label) && <div className="lt-sub">{[r.fixture ? r.type : '', r.item.label].filter(Boolean).join(' · ')}</div>}
        </>
      ),
    },
    { header: 'Power', width: '0.55in', num: true, cell: (r) => (r.watts ? `${r.watts.toLocaleString()} W` : '') },
    {
      header: 'CCT / gel',
      width: '0.95in',
      cell: (r) => (
        <>
          {r.cct ? `${r.cct}K` : ''}
          {r.gel && <div className="lt-sub">{r.gel}</div>}
        </>
      ),
    },
    { header: 'Modifier', width: '0.9in', cell: (r) => (r.modifier && r.modifier !== 'None' ? r.modifier : '') },
    { header: 'Int.', width: '0.45in', num: true, cell: intensityText },
    { header: 'Beam', width: '0.45in', num: true, cell: (r) => `${r.beam}°` },
    { header: 'Height', width: '0.55in', num: true, cell: (r) => (r.height != null ? fmtUnits(r.height, units) : '') },
    { header: 'Ch.', width: '0.5in', cell: (r) => r.channel },
  ];
  if (showNotes) lightCols.push({ header: 'Notes', width: '2.1in', cell: (r) => <span className="pp-pre">{r.notes}</span> });

  return (
    <div className={idx > 0 ? 'pp-break-before' : undefined}>
      <DocHeader
        ctx={ctx}
        title={d.name || 'Lighting diagram'}
        subtitle={[scenes, loc?.name].filter(Boolean).join('  ·  ') || 'Lighting & camera plot'}
        meta={
          <>
            <div>
              {rows.length} light{rows.length === 1 ? '' : 's'} · {cams.length} camera{cams.length === 1 ? '' : 's'}
            </div>
            {watts > 0 && (
              <div>
                {watts.toLocaleString()} W ≈ {num(watts / 120)} A @ 120 V
              </div>
            )}
            <div>{ctx.today}</div>
          </>
        }
      />
      <div className="lt-top pp-avoid">
        <div className="lt-plot">
          {d.items.some((i) => !i.hidden) ? (
            <DiagramSvg
              d={d}
              pal={PAL_LIGHT}
              idp={`p${idx}`}
              bgHref={d.background ? ctx.asset(d.background) : undefined}
              opts={{ beams: o.beams !== false, fov: o.fov !== false, grid: o.grid !== false && d.showGrid !== false, labels: true, crop: o.crop !== false, scaleBar: true, fit: { w: 715, h: 422 }, labelPx: 8.6 }}
            />
          ) : (
            <div className="lt-empty">This diagram is empty.</div>
          )}
        </div>
        <div className="lt-side">
          <Box title="Setup">
            <KV
              cols={1}
              items={[
                ['Location', loc ? `${loc.name}${loc.address ? `\n${loc.address}` : ''}` : ''],
                ['Scenes', scenes],
                ['Shots', shots],
                ['Plot size', `${num(w / ppu)} × ${num(h / ppu)} ${units}  ·  grid = 1 ${units}`],
              ]}
            />
          </Box>
          <Box title={`Cameras (${cams.length})`}>
            {cams.length ? (
              cams.map((c) => (
                <div key={c.item.id} className="lt-cam">
                  <span className="lt-cam-badge">{c.letter}</span>
                  <div>
                    <div className="pp-strong">
                      {c.body || c.type}
                      {c.lens ? ` · ${c.lens}mm` : ''}
                    </div>
                    <div className="lt-sub">
                      {[c.hfov ? `${num(c.hfov)}° HFOV (${SENSOR_BY_ID[c.sensor]?.label.replace(/\s*\(.*\)/, '') ?? c.sensor})` : '', c.support, c.height != null ? `${fmtUnits(c.height, units)} high` : ''].filter(Boolean).join(' · ')}
                    </div>
                    {c.notes && <div className="lt-sub pp-pre">{c.notes}</div>}
                  </div>
                </div>
              ))
            ) : (
              <span className="pp-muted pp-small">No cameras placed.</span>
            )}
          </Box>
          {(grip.length > 0 || sound > 0) && (
            <Box title="Grip & sound">
              <div className="lt-grip">
                {grip.map((g) => (
                  <div key={g.name}>
                    {g.maxQty}× {g.name}
                  </div>
                ))}
                {d.items
                  .filter((i) => !i.hidden && kindDef(i.kind).category === 'sound')
                  .map((i) => (
                    <div key={i.id}>{i.label?.trim() || kindDef(i.kind).label}</div>
                  ))}
              </div>
            </Box>
          )}
          {d.notes?.trim() && (
            <Box title="Notes">
              <Pre style={{ fontSize: '7.8pt' }}>{d.notes}</Pre>
            </Box>
          )}
        </div>
      </div>
      <PSection title="Light key" right={rows.length ? `${rows.length} fixture${rows.length === 1 ? '' : 's'}${watts ? ` · ${watts.toLocaleString()} W total` : ''}` : undefined}>
        <PTable columns={lightCols} rows={rows} zebra empty="No lights on this diagram." />
      </PSection>
    </div>
  );
}

/* ---------------------------------------------------------------- docs */

export const printDocs: PrintDocDef[] = [
  {
    id: 'lighting-diagram',
    title: 'Lighting Diagram',
    group: 'Visuals',
    orientation: 'landscape',
    description: 'Top-down lighting & camera plot with light key, camera list and notes — one page per diagram',
    options: [
      { key: 'diagram', label: 'Diagram', type: 'text', default: 'all', hint: '“all”, or a diagram name / number (comma-separate several)' },
      { key: 'beams', label: 'Show light beams', type: 'boolean', default: true },
      { key: 'fov', label: 'Show camera field of view', type: 'boolean', default: true },
      { key: 'grid', label: 'Show grid', type: 'boolean', default: true },
      { key: 'crop', label: 'Crop plot to the used area', type: 'boolean', default: true },
      { key: 'notes', label: 'Notes column in light key', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.diagrams?.length ? false : 'No lighting diagrams yet'),
    render: (ctx) => {
      const list = selectDiagrams(ctx.project, ctx.options.diagram);
      const title = list.length === 1 ? `Lighting Diagram — ${list[0].name}` : 'Lighting Diagrams';
      if (!list.length) {
        return {
          orientation: 'landscape',
          css: CSS,
          title,
          body: (
            <>
              <DocHeader ctx={ctx} title="Lighting Diagram" />
              <div className="lt-empty">{ctx.project.diagrams.length ? `No diagram matches “${String(ctx.options.diagram ?? '')}”. Use “all”, a diagram name or its number.` : 'No lighting diagrams yet.'}</div>
            </>
          ),
        };
      }
      return {
        orientation: 'landscape',
        css: CSS,
        title,
        margins: { top: 0.55, right: 0.45, bottom: 0.55, left: 0.45 },
        body: (
          <>
            {list.map((d, i) => (
              <DiagramPage key={d.id} ctx={ctx} d={d} idx={i} />
            ))}
          </>
        ),
      };
    },
  },
  {
    id: 'lighting-gear-summary',
    title: 'Lighting Gear Summary',
    group: 'Budget & Gear',
    orientation: 'portrait',
    description: 'Every fixture across all lighting diagrams aggregated for the gaffer’s order, plus modifiers, grip and power per setup',
    options: [
      { key: 'grip', label: 'Include modifiers & grip', type: 'boolean', default: true },
      {
        key: 'mains',
        label: 'Mains voltage',
        type: 'select',
        default: '120',
        choices: [
          { value: '120', label: '120 V (North America)' },
          { value: '230', label: '230 V (EU / UK / AU)' },
        ],
      },
    ],
    emptyReason: (p) => (p.diagrams?.some((d) => countLights(d) > 0) ? false : 'No lights on any lighting diagram yet'),
    render: (ctx) => {
      const ds = ctx.project.diagrams ?? [];
      const fixtures = aggregateFixtures(ds, true);
      const notOrdered = [...new Set(ds.flatMap((d) => lightRows(d).filter((r) => !isOrderable(r)).map((r) => fixtureName(r))))];
      const volts = Number(ctx.options.mains) || 120;
      const mods = aggregateBy(ds, (i) => {
        if (kindDef(i.kind).category !== 'light') return null;
        const m = pstr(i, 'modifier', pstr({ props: kindDef(i.kind).props }, 'modifier'));
        return m && m !== 'None' ? m : null;
      });
      const grip = aggregateBy(ds, (i) => {
        if (kindDef(i.kind).category !== 'grip') return null;
        const { ppu, units } = dims(ds.find((d) => d.items.includes(i)) ?? ds[0]);
        return gripName(i, ppu, units);
      });
      const gels = aggregateBy(ds, (i) => (kindDef(i.kind).category === 'light' && pstr(i, 'gel').trim() ? pstr(i, 'gel').trim() : null));
      const totalOrder = fixtures.reduce((s, f) => s + f.maxQty, 0);
      const power = ds.map((d) => ({ d, lights: lightRows(d).length, watts: totalWatts(d) }));
      const countCols = (label: string): PCol<(typeof mods)[number]>[] => [
        { header: label, cell: (r) => <span className="pp-strong">{r.name}</span> },
        { header: 'Qty', width: '0.6in', num: true, cell: (r) => r.maxQty },
        { header: 'Uses', width: '0.6in', num: true, cell: (r) => r.total },
        { header: 'Diagrams', width: '3in', cell: (r) => [...new Set(r.diagrams)].join(', ') },
      ];
      return {
        css: CSS,
        body: (
          <>
            <DocHeader
              ctx={ctx}
              title="Lighting Gear Summary"
              subtitle={`${ds.length} diagram${ds.length === 1 ? '' : 's'} · ${fixtures.length} fixture type${fixtures.length === 1 ? '' : 's'} · ${totalOrder} unit${totalOrder === 1 ? '' : 's'} to order`}
            />
            <PSection title="Fixtures" right="Qty = most used in a single setup">
              <PTable
                zebra
                rows={fixtures}
                empty="No lights on any diagram yet."
                columns={[
                  { header: 'Fixture', cell: (f) => <span className="pp-strong">{f.name}</span> },
                  { header: 'Type', width: '1.1in', cell: (f) => f.type },
                  { header: 'Qty', width: '0.45in', num: true, cell: (f) => <b>{f.maxQty}</b> },
                  { header: 'Uses', width: '0.45in', num: true, cell: (f) => f.total },
                  { header: 'Power', width: '0.65in', num: true, cell: (f) => (f.watts ? `${f.watts.toLocaleString()} W` : '') },
                  { header: 'Used in', width: '2.2in', cell: (f) => f.diagrams.map((x) => `${x.name} (${x.nums.map((n) => `L${n}`).join(', ')})`).join('; ') },
                  { header: 'Modifiers', width: '1.2in', cell: (f) => [...f.modifiers].join(', ') },
                ]}
                footer={['Total', '', String(totalOrder), String(fixtures.reduce((s, f) => s + f.total, 0)), '', '', '']}
              />
              {notOrdered.length > 0 && <div className="pp-muted pp-small" style={{ marginTop: '4pt' }}>Not listed (natural / on-set sources): {notOrdered.join(', ')}.</div>}
            </PSection>
            {ctx.options.grip !== false && (mods.length > 0 || gels.length > 0) && (
              <PSection title="Modifiers & gels">
                <PTable zebra rows={[...mods, ...gels.map((g) => ({ ...g, name: `Gel: ${g.name}` }))]} columns={countCols('Modifier / gel')} />
              </PSection>
            )}
            {ctx.options.grip !== false && grip.length > 0 && (
              <PSection title="Grip">
                <PTable zebra rows={grip} columns={countCols('Item')} />
              </PSection>
            )}
            <PSection title={`Power per setup (${volts} V)`}>
              <PTable
                zebra
                rows={power}
                columns={[
                  { header: 'Diagram', cell: (r) => <span className="pp-strong">{r.d.name}</span> },
                  { header: 'Scenes', width: '2.2in', cell: (r) => sceneText(ctx, r.d) },
                  { header: 'Lights', width: '0.6in', num: true, cell: (r) => r.lights },
                  { header: 'Load', width: '0.8in', num: true, cell: (r) => (r.watts ? `${r.watts.toLocaleString()} W` : '—') },
                  { header: 'Current', width: '0.8in', num: true, cell: (r) => (r.watts ? `${num(r.watts / volts)} A` : '—') },
                ]}
              />
              <div className="pp-muted pp-small" style={{ marginTop: '4pt' }}>
                Current is the sum of rated fixture power at full output; check circuit capacity at each location (typically 15–20 A per household circuit in North America, 13–16 A in Europe).
              </div>
            </PSection>
          </>
        ),
      };
    },
  },
];
