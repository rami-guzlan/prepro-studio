import type { ReactNode } from 'react';
import type { Character, ID, ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { DocHeader, PTable, type PCol } from '@/print/components';
import { CATEGORY_BY_ID } from '@/lib/constants';
import { castForCharacter, dayDates, locationForScene, sceneDayIndex } from '@/derived/project';
import {
  ELEMENT_CATEGORIES,
  characterMap,
  characterNameIndex,
  elementMap,
  elementsByCategory,
  intExtLabel,
  sceneCharacters,
  sceneElements,
  stripStyle,
  type ElCategory,
} from './logic';

/* ---------------------------------------------------------------- helpers */

/** Scenes matching a spec: '' = all; otherwise comma-separated scene ids, numbers ('12A') or numeric ranges ('3-7'). */
export function selectScenes(scenes: SceneInfo[], spec: unknown): SceneInfo[] {
  const text = typeof spec === 'string' || typeof spec === 'number' ? String(spec).trim() : '';
  if (!text) return scenes;
  const tokens = text
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out = new Set<ID>();
  for (const tok of tokens) {
    const exact = scenes.filter((s) => s.id === tok || s.number.toUpperCase() === tok.toUpperCase());
    if (exact.length) {
      exact.forEach((s) => out.add(s.id));
      continue;
    }
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(tok);
    if (m) {
      const a = Math.min(Number(m[1]), Number(m[2]));
      const b = Math.max(Number(m[1]), Number(m[2]));
      for (const s of scenes) {
        const n = parseInt(s.number, 10);
        if (!isNaN(n) && n >= a && n <= b) out.add(s.id);
      }
    }
  }
  return scenes.filter((s) => out.has(s.id));
}

function castLabel(c: Character): string {
  return c.number != null ? `${c.number}. ${c.name}` : c.name;
}

function scheduledLabel(p: ProjectData, ctx: PrintContext, sceneId: ID): string {
  const idx = sceneDayIndex(p).get(sceneId);
  if (idx == null) return '';
  const day = p.schedule.days[idx];
  const date = dayDates(p)[idx];
  return `${day?.label || `Day ${idx + 1}`}${date ? ` · ${ctx.fmt.dateShort(date)}` : ''}`;
}

const SCENE_SPEC_HINT = 'Scene numbers or ranges, e.g. "3" or "1, 4-6". Leave empty for every scene.';

/* ---------------------------------------------------------------- breakdown sheets */

const SHEET_CSS = `
.breakdown-ps { break-inside: avoid; page-break-inside: avoid; }
.breakdown-ps + .breakdown-ps { break-before: page; page-break-before: always; }
.breakdown-ps-band { display: flex; align-items: center; gap: 10pt; border: 1.25pt solid #1d1d22; border-radius: 3pt; padding: 7pt 10pt; }
.breakdown-ps-band .co { flex: 1; min-width: 0; font-size: 7.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #2b2b31; }
.breakdown-ps-band .co .t { font-size: 9.5pt; letter-spacing: 0.02em; text-transform: none; color: #111; }
.breakdown-ps-band .ttl { flex: 1.6; text-align: center; font-size: 16pt; font-weight: 800; letter-spacing: 0.12em; color: #111; white-space: nowrap; }
.breakdown-ps-band .no { flex: 1; text-align: right; font-size: 7.4pt; color: #2b2b31; line-height: 1.3; }
.breakdown-ps-band .no b { font-size: 15pt; color: #111; }
.breakdown-ps-head { width: 100%; border-collapse: collapse; margin-top: 6pt; table-layout: fixed; }
.breakdown-ps-head td { border: 0.75pt solid #3d3d45; padding: 3pt 5pt 4pt; vertical-align: top; }
.breakdown-ps-head .k { display: block; font-size: 5.9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #6a6a72; margin-bottom: 1pt; }
.breakdown-ps-head .v { font-size: 10pt; font-weight: 700; color: #111; }
.breakdown-ps-head .v.sm { font-size: 8.6pt; font-weight: 600; }
.breakdown-ps-head .syn { font-size: 8.8pt; font-weight: 500; white-space: pre-wrap; }
.breakdown-ps-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5pt; margin-top: 7pt; }
.breakdown-ps-box { border: 1pt solid var(--c); border-radius: 2.5pt; min-height: 0.74in; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
.breakdown-ps-box .h { background: var(--c); color: #fff; font-size: 6.8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; padding: 2pt 5pt; display: flex; justify-content: space-between; }
.breakdown-ps-box ul { list-style: none; margin: 0; padding: 3pt 5pt 4pt; font-size: 8.2pt; line-height: 1.32; }
.breakdown-ps-box li { break-inside: avoid; }
.breakdown-ps-box li .sub { color: #6a6a72; font-size: 7pt; }
.breakdown-ps-box .txt { padding: 3pt 5pt 0; font-size: 8.2pt; white-space: pre-wrap; }
.breakdown-ps-box.notes { grid-column: 1 / -1; min-height: 0.9in; }
.breakdown-ps-foot { display: flex; justify-content: space-between; margin-top: 6pt; font-size: 7pt; color: #6a6a72; }
`;

function SheetBox({ color, title, count, children, className }: { color: string; title: string; count?: number; children?: ReactNode; className?: string }) {
  return (
    <div className={['breakdown-ps-box', className].filter(Boolean).join(' ')} style={{ ['--c' as any]: color }}>
      <div className="h">
        <span>{title}</span>
        {count ? <span>{count}</span> : null}
      </div>
      {children}
    </div>
  );
}

function BreakdownSheet({ ctx, scene, sheetNo, hideEmpty }: { ctx: PrintContext; scene: SceneInfo; sheetNo: number; hideEmpty: boolean }) {
  const p = ctx.project;
  const elById = elementMap(p.elements);
  const charById = characterMap(p.characters);
  const chars = sceneCharacters(scene, charById);
  const names = characterNameIndex(p.characters);
  const speakingIds = new Set(scene.speaking.map((n) => names.get(n)));
  const grouped = elementsByCategory(sceneElements(scene, elById));
  const strip = stripStyle(scene.stripKey);
  const loc = locationForScene(p, scene);
  const meta = scene.meta;
  const extrasEls = grouped.get('extras') ?? [];
  const sched = scheduledLabel(p, ctx, scene.id);

  const elementList = (cat: ElCategory) => {
    const list = grouped.get(cat) ?? [];
    if (!list.length) return null;
    return (
      <ul>
        {list.map((e) => {
          const chr = e.characterId ? charById.get(e.characterId) : undefined;
          return (
            <li key={e.id}>
              {e.name || 'Unnamed'}
              {(e.quantity ?? 1) > 1 ? ` (×${e.quantity})` : ''}
              {chr ? <span className="sub"> — {chr.name}</span> : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const boxes: ReactNode[] = [];
  const cast = CATEGORY_BY_ID.cast;
  if (!hideEmpty || chars.length)
    boxes.push(
      <SheetBox key="cast" color={cast.color} title={cast.label} count={chars.length}>
        {chars.length > 0 && (
          <ul>
            {chars.map((c) => {
              const actor = castForCharacter(p, c);
              const speaking = speakingIds.has(c.id);
              return (
                <li key={c.id}>
                  <b>{castLabel(c)}</b>
                  {actor ? <span className="sub"> — {actor.name}</span> : null}
                  {!speaking ? <span className="sub"> (silent)</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </SheetBox>,
    );
  const ex = CATEGORY_BY_ID.extras;
  if (!hideEmpty || extrasEls.length || meta?.extras)
    boxes.push(
      <SheetBox key="extras" color={ex.color} title={ex.label} count={extrasEls.length || undefined}>
        {meta?.extras ? <div className="txt">{meta.extras}</div> : null}
        {elementList('extras')}
      </SheetBox>,
    );
  for (const c of ELEMENT_CATEGORIES) {
    if (c.id === 'extras') continue;
    const list = grouped.get(c.id as ElCategory) ?? [];
    if (hideEmpty && !list.length) continue;
    boxes.push(
      <SheetBox key={c.id} color={c.color} title={c.label} count={list.length}>
        {elementList(c.id as ElCategory)}
      </SheetBox>,
    );
  }

  return (
    <div className="breakdown-ps">
      <div className="breakdown-ps-band" style={{ background: strip.bg }}>
        <div className="co">
          {p.meta.productionCompany || 'Production'}
          <div className="t">{p.meta.title}</div>
        </div>
        <div className="ttl">BREAKDOWN SHEET</div>
        <div className="no">
          Sheet # <b>{sheetNo}</b>
          <br />
          {ctx.today}
        </div>
      </div>
      <table className="breakdown-ps-head">
        <tbody>
          <tr>
            <td>
              <span className="k">Scene #</span>
              <span className="v">{scene.number}</span>
            </td>
            <td>
              <span className="k">Int / Ext</span>
              <span className="v">{intExtLabel(scene.intExt)}</span>
            </td>
            <td>
              <span className="k">Day / Night</span>
              <span className="v">{scene.dayNight || scene.time || '—'}</span>
            </td>
            <td>
              <span className="k">Pages</span>
              <span className="v">{ctx.fmt.eighths(scene.eighths)}</span>
            </td>
            <td>
              <span className="k">Script day</span>
              <span className="v sm">{meta?.scriptDay || '—'}</span>
            </td>
            <td>
              <span className="k">Script page</span>
              <span className="v sm">{scene.page}</span>
            </td>
            <td>
              <span className="k">Est. time</span>
              <span className="v sm">{meta?.estMinutes ? ctx.fmt.minutes(meta.estMinutes) : '—'}</span>
            </td>
          </tr>
          <tr>
            <td colSpan={4}>
              <span className="k">Set</span>
              <span className="v sm">{scene.set || scene.heading || '—'}</span>
            </td>
            <td colSpan={3}>
              <span className="k">Location</span>
              <span className="v sm">{loc ? loc.name : '—'}</span>
              {loc?.address ? <div style={{ fontSize: '7.2pt', color: '#55555e' }}>{loc.address}</div> : null}
            </td>
          </tr>
          <tr>
            <td colSpan={7}>
              <span className="k">Synopsis</span>
              <div className="syn">{scene.synopsis || scene.firstAction || ' '}</div>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="breakdown-ps-grid">
        {boxes}
        <SheetBox color="#55555e" title="Notes" className="notes">
          {meta?.notes ? <div className="txt" style={{ paddingBottom: '4pt' }}>{meta.notes}</div> : null}
        </SheetBox>
      </div>
      <div className="breakdown-ps-foot">
        <span>{scene.heading}</span>
        <span>{sched ? `Scheduled: ${sched}` : 'Not scheduled'}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- summary */

const SUMMARY_CSS = `
.breakdown-sum th.cat { color: #fff; text-align: left; }
.breakdown-sum td { font-size: 7.4pt; }
.breakdown-sum td.cnt { text-align: center; font-weight: 700; }
.breakdown-sum .sc { display: inline-block; min-width: 18pt; text-align: center; font-weight: 800; border: 0.6pt solid #888; border-radius: 2pt; padding: 0 2pt; }
.breakdown-sum .hd { font-weight: 700; }
.breakdown-sum .mt { color: #6a6a72; font-size: 6.6pt; }
`;

function summaryCats(ctx: PrintContext, scenes: SceneInfo[]) {
  const elById = elementMap(ctx.project.elements);
  const used = new Set<string>();
  for (const s of scenes) for (const e of sceneElements(s, elById)) used.add(e.category);
  return ELEMENT_CATEGORIES.filter((c) => used.has(c.id));
}

function renderSummary(ctx: PrintContext) {
  const p = ctx.project;
  const scenes = ctx.model.scenes;
  const names = ctx.options.mode !== 'counts';
  const elById = elementMap(p.elements);
  const charById = characterMap(p.characters);
  const cats = summaryCats(ctx, scenes);
  const rows = scenes.map((s) => ({ s, chars: sceneCharacters(s, charById), groups: elementsByCategory(sceneElements(s, elById)) }));
  const totalPages = scenes.reduce((n, s) => n + s.eighths, 0);
  const unique = (cat: string) => {
    const set = new Set<ID>();
    for (const r of rows) for (const e of r.groups.get(cat as ElCategory) ?? []) set.add(e.id);
    return set.size;
  };
  const castUnique = new Set(rows.flatMap((r) => r.chars.map((c) => c.id))).size;

  const columns: PCol<(typeof rows)[number]>[] = [
    {
      header: 'Sc.',
      width: '30pt',
      cell: (r) => {
        const st = stripStyle(r.s.stripKey);
        return (
          <span className="sc" style={{ background: st.bg, color: st.fg }}>
            {r.s.number}
          </span>
        );
      },
    },
    {
      header: 'Scene',
      width: names ? '120pt' : '170pt',
      cell: (r) => (
        <>
          <div className="hd">{r.s.set || r.s.heading}</div>
          <div className="mt">
            {intExtLabel(r.s.intExt)} · {r.s.dayNight || '—'}
            {r.s.meta?.scriptDay ? ` · ${r.s.meta.scriptDay}` : ''}
          </div>
        </>
      ),
    },
    { header: 'Pgs', width: '28pt', num: true, cell: (r) => ctx.fmt.eighths(r.s.eighths) },
    {
      header: 'Cast',
      width: names ? '60pt' : '40pt',
      style: names ? undefined : { textAlign: 'center' },
      cell: (r) => (names ? r.chars.map((c) => c.number ?? c.name).join(', ') : r.chars.length || ''),
    },
    ...cats.map(
      (c): PCol<(typeof rows)[number]> => ({
        header: c.short,
        cell: (r) => {
          const list = r.groups.get(c.id as ElCategory) ?? [];
          if (!names) return list.length || '';
          return list.map((e) => ((e.quantity ?? 1) > 1 ? `${e.name} ×${e.quantity}` : e.name)).join(', ');
        },
        style: names ? undefined : { textAlign: 'center', fontWeight: 700 },
      }),
    ),
  ];
  if (!names) columns.push({ header: 'Total', width: '32pt', num: true, cell: (r) => r.chars.length + [...r.groups.values()].reduce((n, l) => n + l.length, 0) });

  const footer: ReactNode[] = [
    '',
    `${scenes.length} scenes · unique`,
    ctx.fmt.eighths(totalPages),
    `${castUnique}`,
    ...cats.map((c) => `${unique(c.id)}`),
    ...(names ? [] : ['']),
  ];

  // coloured category headers
  const headerCss = cats.map((c, i) => `.breakdown-sum thead th:nth-child(${i + 5}) { background: ${c.color}; color: #fff; }`).join('\n');
  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Breakdown Summary" subtitle={`${scenes.length} scenes · ${ctx.fmt.eighths(totalPages)} pages · ${names ? 'elements by name' : 'element counts'}`} />
        <PTable className="breakdown-sum" columns={columns} rows={rows} footer={footer} zebra empty="No scenes in the script yet." />
      </>
    ),
    css: SUMMARY_CSS + headerCss + `\n.breakdown-sum thead th:nth-child(4) { background: ${CATEGORY_BY_ID.cast.color}; color: #fff; }`,
  };
}

/* ---------------------------------------------------------------- scene list */

const SCENELIST_CSS = `
.breakdown-sl .sc { display: inline-block; min-width: 20pt; text-align: center; font-weight: 800; border: 0.6pt solid #888; border-radius: 2pt; padding: 0.5pt 3pt; }
.breakdown-sl .hd { font-weight: 700; font-family: 'Courier Prime', 'Courier New', monospace; font-size: 8.4pt; }
.breakdown-sl .syn { color: #55555e; font-size: 7.6pt; margin-top: 1pt; }
`;

function renderSceneList(ctx: PrintContext) {
  const p = ctx.project;
  const groupBy = String(ctx.options.groupBy ?? 'none');
  const showSyn = ctx.options.showSynopsis !== false;
  const charById = characterMap(p.characters);
  const scenes = ctx.model.scenes;
  const keyOf = (s: SceneInfo): string => {
    if (groupBy === 'location') return locationForScene(p, s)?.name ?? 'No location';
    if (groupBy === 'set') return s.set || 'No set';
    if (groupBy === 'scriptDay') return s.meta?.scriptDay || 'No script day';
    if (groupBy === 'shootDay') {
      const idx = sceneDayIndex(p).get(s.id);
      if (idx == null) return 'Unscheduled';
      const date = dayDates(p)[idx];
      return `${p.schedule.days[idx]?.label || `Day ${idx + 1}`}${date ? ` — ${ctx.fmt.dateMedium(date)}` : ''}`;
    }
    return '';
  };
  let rows = scenes;
  if (groupBy !== 'none') {
    const order = new Map<string, number>();
    if (groupBy === 'shootDay') {
      const idx = sceneDayIndex(p);
      rows = [...scenes].sort((a, b) => (idx.get(a.id) ?? 9999) - (idx.get(b.id) ?? 9999) || a.index - b.index);
    } else {
      for (const s of scenes) if (!order.has(keyOf(s))) order.set(keyOf(s), order.size);
      rows = [...scenes].sort((a, b) => order.get(keyOf(a))! - order.get(keyOf(b))! || a.index - b.index);
    }
  }
  const totalPages = scenes.reduce((n, s) => n + s.eighths, 0);
  const totalMin = scenes.reduce((n, s) => n + (s.meta?.estMinutes ?? 0), 0);
  const columns: PCol<SceneInfo>[] = [
    {
      header: 'Sc.',
      width: '32pt',
      cell: (s) => {
        const st = stripStyle(s.stripKey);
        return (
          <span className="sc" style={{ background: st.bg, color: st.fg }}>
            {s.number}
          </span>
        );
      },
    },
    {
      header: 'Scene',
      cell: (s) => (
        <>
          <div className="hd">{s.heading || 'Untitled scene'}</div>
          {showSyn && (s.synopsis || s.firstAction) ? <div className="syn">{s.synopsis || s.firstAction}</div> : null}
        </>
      ),
    },
    { header: 'Pages', width: '34pt', num: true, cell: (s) => ctx.fmt.eighths(s.eighths) },
    { header: 'Pg', width: '22pt', num: true, cell: (s) => s.page },
    { header: 'Cast', width: '52pt', cell: (s) => sceneCharacters(s, charById).map((c) => c.number ?? c.name).join(', ') },
    { header: 'Location', width: '100pt', cell: (s) => locationForScene(p, s)?.name ?? '' },
    { header: 'Script day', width: '46pt', cell: (s) => s.meta?.scriptDay ?? '' },
    { header: 'Est.', width: '34pt', num: true, cell: (s) => ctx.fmt.minutes(s.meta?.estMinutes) },
  ];
  const castLegend = [...p.characters]
    .filter((c) => scenes.some((s) => s.characterIds.includes(c.id)))
    .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999))
    .map((c) => {
      const actor = castForCharacter(p, c);
      return `${c.number != null ? `${c.number}. ` : ''}${c.name}${actor ? ` (${actor.name})` : ''}`;
    });
  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Scene List" subtitle={`${scenes.length} scenes · ${ctx.fmt.eighths(totalPages)} pages${totalMin ? ` · est. ${ctx.fmt.minutes(totalMin)} shooting` : ''}`} />
        <PTable
          className="breakdown-sl"
          columns={columns}
          rows={rows}
          groupBy={groupBy !== 'none' ? keyOf : undefined}
          groupLabel={(g, gr) => `${g} · ${gr.length} scene${gr.length === 1 ? '' : 's'} · ${ctx.fmt.eighths(gr.reduce((n, s) => n + s.eighths, 0))} pgs`}
          footer={['', `${scenes.length} scenes`, ctx.fmt.eighths(totalPages), '', '', '', '', ctx.fmt.minutes(totalMin)]}
          empty="No scenes in the script yet."
        />
        {castLegend.length > 0 && (
          <div className="pp-avoid" style={{ marginTop: '10pt', fontSize: '7.4pt', color: '#44444c' }}>
            <b style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '6.6pt' }}>Cast IDs </b>
            {castLegend.join(' · ')}
          </div>
        )}
      </>
    ),
    css: SCENELIST_CSS,
  };
}

/* ---------------------------------------------------------------- registry */

const noScenes = (_p: ProjectData, model: ScriptModel) => (model.scenes.length ? false : 'No scenes in the script yet');

/** Printable documents of the breakdown module. */
export const printDocs: PrintDocDef[] = [
  {
    id: 'breakdown-sheets',
    title: 'Breakdown Sheets',
    group: 'Breakdown',
    orientation: 'portrait',
    description: 'Industry-style breakdown sheet per scene with colour-coded category boxes',
    options: [
      { key: 'sceneId', label: 'Scenes', type: 'text', default: '', hint: SCENE_SPEC_HINT },
      { key: 'hideEmpty', label: 'Hide empty categories', type: 'boolean', default: false },
    ],
    emptyReason: noScenes,
    render: (ctx) => {
      const scenes = selectScenes(ctx.model.scenes, ctx.options.sceneId);
      const single = scenes.length === 1 ? scenes[0] : undefined;
      return {
        title: single ? `Breakdown Sheet — Scene ${single.number}` : 'Breakdown Sheets',
        body: scenes.length ? (
          <>
            {scenes.map((s) => (
              <BreakdownSheet key={s.id} ctx={ctx} scene={s} sheetNo={s.index + 1} hideEmpty={!!ctx.options.hideEmpty} />
            ))}
          </>
        ) : (
          <>
            <DocHeader ctx={ctx} title="Breakdown Sheets" />
            <p className="pp-muted">No scene matches “{String(ctx.options.sceneId)}”.</p>
          </>
        ),
        css: SHEET_CSS,
        margins: { top: 0.55, right: 0.45, bottom: 0.55, left: 0.45 },
      };
    },
  },
  {
    id: 'breakdown-summary',
    title: 'Breakdown Summary',
    group: 'Breakdown',
    orientation: 'landscape',
    description: 'All scenes × breakdown categories in one matrix',
    options: [
      {
        key: 'mode',
        label: 'Cells show',
        type: 'select',
        default: 'names',
        choices: [
          { value: 'names', label: 'Element names' },
          { value: 'counts', label: 'Counts' },
        ],
      },
    ],
    emptyReason: noScenes,
    render: renderSummary,
  },
  {
    id: 'scene-list',
    title: 'Scene List',
    group: 'Breakdown',
    orientation: 'portrait',
    description: 'Scene report: number, heading, pages, cast IDs, location and synopsis',
    options: [
      { key: 'showSynopsis', label: 'Show synopsis', type: 'boolean', default: true },
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'select',
        default: 'none',
        choices: [
          { value: 'none', label: 'Script order' },
          { value: 'location', label: 'Location' },
          { value: 'set', label: 'Set' },
          { value: 'scriptDay', label: 'Script day' },
          { value: 'shootDay', label: 'Shoot day' },
        ],
      },
    ],
    emptyReason: noScenes,
    render: renderSceneList,
  },
];

