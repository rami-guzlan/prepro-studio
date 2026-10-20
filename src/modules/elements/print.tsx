import type { ReactNode } from 'react';
import type { BreakdownElement, Character, ID, Measurements, ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import type { SceneInfo } from '@/script-core/model';
import { Check, DocHeader, Dot, PBadge, PSection, PTable, Photo, type PCol } from '@/print/components';
import { CATEGORY_BY_ID, ELEMENT_STATUSES, optionColor, optionLabel } from '@/lib/constants';
import { castForCharacter, locationForScene } from '@/derived/project';
import { naturalCompare } from '@/lib/text';
import {
  ELEMENT_CATEGORIES,
  ELEMENT_SOURCES,
  characterMap,
  elementMap,
  elementsByCategory,
  intExtLabel,
  sceneCharacters,
  sceneElements,
  scenesByElement,
  sortCharacters,
  stripStyle,
  type ElCategory,
} from '@/modules/breakdown/logic';
import { buildPlot } from './plot';

/* ---------------------------------------------------------------- shared */

const CSS = `
.elements-p-name { font-weight: 700; }
.elements-p-desc { color: #55555e; font-size: 7.6pt; margin-top: 1pt; white-space: pre-wrap; }
.elements-p-notes { color: #55555e; font-size: 7.2pt; font-style: italic; margin-top: 1pt; white-space: pre-wrap; }
.elements-p-sc { display: inline-block; min-width: 13pt; text-align: center; font-size: 6.8pt; font-weight: 700; border: 0.5pt solid #999; border-radius: 2pt; padding: 0 1.5pt; margin: 0 1.5pt 1.5pt 0; }
.elements-p-cat { display: flex; align-items: center; gap: 5pt; }
.elements-p-sizes { font-size: 7.4pt; color: #3a3a44; margin: -2pt 0 5pt; }
.elements-p-sizes b { font-size: 6.4pt; text-transform: uppercase; letter-spacing: 0.05em; color: #7a7a84; margin-right: 2pt; }
.elements-p-scene { border: 0.75pt solid #c9c9d1; border-radius: 3pt; margin-bottom: 7pt; overflow: hidden; }
.elements-p-scenehead { display: flex; align-items: center; gap: 7pt; padding: 4pt 7pt; border-bottom: 0.75pt solid #c9c9d1; background: #f6f6f9; }
.elements-p-scenenum { min-width: 20pt; text-align: center; font-weight: 800; font-size: 9pt; border: 0.6pt solid #888; border-radius: 2pt; padding: 0.5pt 3pt; }
.elements-p-sceneh { flex: 1; font-weight: 700; font-family: 'Courier Prime', 'Courier New', monospace; font-size: 9pt; }
.elements-p-scenemeta { font-size: 7.2pt; color: #55555e; white-space: nowrap; }
.elements-p-rows { width: 100%; border-collapse: collapse; }
.elements-p-rows td { padding: 2.5pt 7pt; border-bottom: 0.5pt solid #e3e3e8; vertical-align: top; font-size: 8.2pt; }
.elements-p-rows tr:last-child td { border-bottom: 0; }
.elements-p-rows td.k { width: 92pt; font-size: 6.8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.elements-p-item { display: inline; }
.elements-p-item + .elements-p-item::before { content: ' · '; color: #999; }
.elements-p-st { font-size: 6.4pt; font-weight: 700; text-transform: uppercase; }
.elements-p-plot td, .elements-p-plot th { font-size: 7.4pt; }
.elements-p-plot td.has { background: #eef5fd; }
.elements-p-plot .gap { color: #b26b00; font-style: italic; }
`;

function scenesOf(map: Map<ID, SceneInfo[]>, id: ID) {
  return map.get(id) ?? [];
}

function SceneChips({ scenes }: { scenes: SceneInfo[] }) {
  if (!scenes.length) return <span className="pp-muted">—</span>;
  return (
    <>
      {scenes.map((s) => {
        const st = stripStyle(s.stripKey);
        return (
          <span key={s.id} className="elements-p-sc" style={{ background: st.bg, color: st.fg }}>
            {s.number}
          </span>
        );
      })}
    </>
  );
}

function StatusBadge({ value }: { value?: string }) {
  if (!value) return <span className="pp-muted">—</span>;
  return <PBadge color={optionColor(ELEMENT_STATUSES, value)}>{optionLabel(ELEMENT_STATUSES, value)}</PBadge>;
}

function firstSceneIndex(map: Map<ID, SceneInfo[]>, id: ID): number {
  return map.get(id)?.[0]?.index ?? 99999;
}

function sourceLabel(e: BreakdownElement): string {
  const s = ELEMENT_SOURCES.find((x) => x.value === e.source)?.label ?? '';
  return [s, e.vendor].filter(Boolean).join(' · ');
}

interface TableOpts {
  photos?: boolean;
  costs?: boolean;
  category?: boolean;
  character?: boolean;
  check?: boolean;
  owner?: boolean;
}

function elementColumns(ctx: PrintContext, scenes: Map<ID, SceneInfo[]>, chars: Map<ID, Character>, o: TableOpts): PCol<BreakdownElement>[] {
  const cols: PCol<BreakdownElement>[] = [];
  if (o.check) cols.push({ header: '', width: '14pt', cell: (e) => <Check on={e.status === 'on_set' || e.status === 'returned'} /> });
  if (o.photos) cols.push({ header: 'Photo', width: '54pt', cell: (e) => <Photo src={ctx.asset(e.photo)} width="48pt" height="36pt" placeholder="No photo" /> });
  cols.push({
    header: 'Item',
    cell: (e) => (
      <>
        <div className="elements-p-name">
          {o.category && <Dot color={CATEGORY_BY_ID[e.category]?.color ?? '#888'} />}
          {e.name || 'Unnamed'}
        </div>
        {e.description ? <div className="elements-p-desc">{e.description}</div> : null}
        {e.notes ? <div className="elements-p-notes">{e.notes}</div> : null}
      </>
    ),
  });
  if (o.character)
    cols.push({
      header: 'Character',
      width: '62pt',
      cell: (e) => (e.characterId ? chars.get(e.characterId)?.name ?? '' : ''),
    });
  cols.push({ header: 'Qty', width: '26pt', num: true, cell: (e) => e.quantity ?? '' });
  cols.push({ header: 'Scenes', width: '62pt', cell: (e) => <SceneChips scenes={scenesOf(scenes, e.id)} /> });
  cols.push({ header: 'Status', width: '54pt', cell: (e) => <StatusBadge value={e.status} /> });
  cols.push({ header: 'Source / vendor', width: '74pt', cell: (e) => sourceLabel(e) });
  if (o.owner) cols.push({ header: 'Owner', width: '54pt', cell: (e) => e.owner ?? '' });
  if (o.costs) cols.push({ header: 'Cost', width: '52pt', num: true, cell: (e) => (e.cost != null ? ctx.fmt.money(e.cost) : '') });
  return cols;
}

function costFooter(ctx: PrintContext, cols: PCol<BreakdownElement>[], rows: BreakdownElement[], costs: boolean): ReactNode[] | undefined {
  if (!costs || !rows.length) return undefined;
  const total = rows.reduce((n, e) => n + (e.cost ?? 0), 0);
  const itemCol = cols.findIndex((c) => c.header === 'Item');
  return cols.map((c, i) => (i === cols.length - 1 ? ctx.fmt.money(total) : i === itemCol ? `${rows.length} item${rows.length === 1 ? '' : 's'}` : ''));
}

function sortRows(rows: BreakdownElement[], scenes: Map<ID, SceneInfo[]>, sort: string) {
  const out = [...rows];
  if (sort === 'name') out.sort((a, b) => naturalCompare(a.name, b.name));
  else if (sort === 'status') out.sort((a, b) => ELEMENT_STATUSES.findIndex((s) => s.value === a.status) - ELEMENT_STATUSES.findIndex((s) => s.value === b.status) || naturalCompare(a.name, b.name));
  else out.sort((a, b) => firstSceneIndex(scenes, a.id) - firstSceneIndex(scenes, b.id) || naturalCompare(a.name, b.name));
  return out;
}

const SORT_OPTION = {
  key: 'sort',
  label: 'Sort by',
  type: 'select' as const,
  default: 'scene',
  choices: [
    { value: 'scene', label: 'First appearance' },
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
  ],
};

/* ---------------------------------------------------------------- props list */

function renderProps(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const cats: string[] = ['props', ...(o.includeSetDressing ? ['set_dressing', 'greenery'] : [])];
  const scenes = scenesByElement(ctx.model);
  const chars = characterMap(p.characters);
  const rows = sortRows(
    p.elements.filter((e) => cats.includes(e.category)),
    scenes,
    String(o.sort),
  );
  const cols = elementColumns(ctx, scenes, chars, { photos: !!o.showPhotos, costs: !!o.showCosts, category: cats.length > 1, check: true, owner: true });
  const toSource = rows.filter((e) => e.status === 'needed' || e.status === 'sourcing').length;
  return {
    body: (
      <>
        <DocHeader ctx={ctx} title={o.includeSetDressing ? 'Props & Set Dressing List' : 'Props List'} subtitle={`${rows.length} items${toSource ? ` · ${toSource} still to source` : ''}`} />
        <PTable columns={cols} rows={rows} footer={costFooter(ctx, cols, rows, !!o.showCosts)} empty="No props in the breakdown yet." />
      </>
    ),
    css: CSS,
  };
}

/* ---------------------------------------------------------------- wardrobe */

const SIZE_KEYS: [keyof Measurements, string][] = [
  ['height', 'Height'],
  ['chest', 'Chest'],
  ['waist', 'Waist'],
  ['hips', 'Hips'],
  ['inseam', 'Inseam'],
  ['neck', 'Neck'],
  ['sleeve', 'Sleeve'],
  ['jacket', 'Jacket'],
  ['shirt', 'Shirt'],
  ['pants', 'Pants'],
  ['dress', 'Dress'],
  ['shoe', 'Shoe'],
  ['hat', 'Hat'],
];

function renderWardrobe(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const cats = ['wardrobe', ...(o.includeMakeup ? ['makeup'] : [])];
  const scenes = scenesByElement(ctx.model);
  const chars = characterMap(p.characters);
  const items = p.elements.filter((e) => cats.includes(e.category));
  const byChar = new Map<string, BreakdownElement[]>();
  for (const e of items) {
    const k = e.characterId && chars.has(e.characterId) ? e.characterId : '';
    byChar.set(k, [...(byChar.get(k) ?? []), e]);
  }
  const order = sortCharacters(p.characters.filter((c) => byChar.has(c.id)));
  const groups: { key: string; char?: Character; rows: BreakdownElement[] }[] = order.map((c) => ({ key: c.id, char: c, rows: sortRows(byChar.get(c.id)!, scenes, 'scene') }));
  if (byChar.has('')) groups.push({ key: '', rows: sortRows(byChar.get('')!, scenes, 'scene') });

  const cols = elementColumns(ctx, scenes, chars, { photos: !!o.showPhotos, costs: !!o.showCosts, category: cats.length > 1, owner: false });
  const plot = o.showPlot ? buildPlot(ctx.model, p.elements, p.characters, cats) : null;

  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Wardrobe List" subtitle={`${items.length} items · ${groups.filter((g) => g.char).length} characters${o.includeMakeup ? ' · includes hair & makeup' : ''}`} />
        {groups.length === 0 && <p className="pp-muted">No wardrobe in the breakdown yet.</p>}
        {groups.map((g) => {
          const actor = g.char ? castForCharacter(p, g.char) : undefined;
          const sizes = o.showSizes && actor?.measurements ? SIZE_KEYS.filter(([k]) => actor.measurements?.[k]).map(([k, label]) => [label, actor.measurements![k]!] as const) : [];
          const sceneSet = new Map<ID, SceneInfo>();
          for (const e of g.rows) for (const s of scenesOf(scenes, e.id)) sceneSet.set(s.id, s);
          const sc = [...sceneSet.values()].sort((a, b) => a.index - b.index);
          return (
            <PSection
              key={g.key || 'none'}
              className="pp-avoid"
              title={g.char ? `${g.char.number != null ? `${g.char.number}. ` : ''}${g.char.name}${actor ? ` — ${actor.name}` : ''}` : 'No character assigned'}
              right={`${g.rows.length} item${g.rows.length === 1 ? '' : 's'}${sc.length ? ` · scenes ${sc.map((s) => s.number).join(', ')}` : ''}`}
            >
              {sizes.length > 0 && (
                <div className="elements-p-sizes">
                  {sizes.map(([k, v], i) => (
                    <span key={k}>
                      {i > 0 ? ' · ' : ''}
                      <b>{k}</b>
                      {v}
                    </span>
                  ))}
                </div>
              )}
              <PTable columns={cols} rows={g.rows} />
            </PSection>
          );
        })}
        {plot && plot.rows.length > 0 && (plot.chars.length > 0 || plot.unassigned) && (
          <div className="pp-break-before">
            <DocHeader ctx={ctx} title="Wardrobe Plot" subtitle="Costume per character, scene by scene" />
            <PlotTable ctx={ctx} plot={plot} />
          </div>
        )}
      </>
    ),
    css: CSS,
  };
}

function PlotTable({ ctx, plot }: { ctx: PrintContext; plot: ReturnType<typeof buildPlot> }) {
  const cols = plot.chars.map((c) => ({ id: c.id, label: `${c.number != null ? `${c.number}. ` : ''}${c.name}` }));
  if (plot.unassigned) cols.push({ id: '__none', label: 'Unassigned' });
  const columns: PCol<(typeof plot.rows)[number]>[] = [
    {
      header: 'Sc.',
      width: '26pt',
      cell: (r) => {
        const st = stripStyle(r.stripKey);
        return (
          <span className="elements-p-sc" style={{ background: st.bg, color: st.fg }}>
            {r.number}
          </span>
        );
      },
    },
    {
      header: 'Scene',
      width: cols.length > 4 ? '90pt' : '130pt',
      cell: (r) => (
        <>
          <div style={{ fontWeight: 700 }}>{r.heading}</div>
          {r.scriptDay ? <div className="pp-muted pp-tiny">{r.scriptDay}</div> : null}
        </>
      ),
    },
    ...cols.map(
      (c): PCol<(typeof plot.rows)[number]> => ({
        header: c.label,
        cell: (r) => {
          const cell = r.cells.get(c.id);
          if (!cell || (!cell.present && !cell.items.length)) return '';
          if (!cell.items.length) return <span className="gap">in scene — not set</span>;
          return cell.items.map((e) => e.name).join(', ');
        },
      }),
    ),
  ];
  return <PTable className="elements-p-plot" columns={columns} rows={plot.rows} bordered />;
}

/* ---------------------------------------------------------------- by scene */

function renderByScene(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const elById = elementMap(p.elements);
  const charById = characterMap(p.characters);
  const scenes = ctx.model.scenes.filter((s) => !o.hideEmpty || sceneElements(s, elById).length > 0 || (o.includeCast && sceneCharacters(s, charById).length > 0));

  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Elements by Scene" subtitle={`${scenes.length} scenes · everything each scene needs`} />
        {scenes.length === 0 && <p className="pp-muted">No scenes to list.</p>}
        {scenes.map((s) => {
          const st = stripStyle(s.stripKey);
          const els = sceneElements(s, elById);
          const groups = elementsByCategory(els);
          const chars = sceneCharacters(s, charById);
          const loc = locationForScene(p, s);
          const rows: { key: string; label: string; color: string; content: ReactNode }[] = [];
          if (o.includeCast && chars.length) {
            rows.push({
              key: 'cast',
              label: CATEGORY_BY_ID.cast.short,
              color: CATEGORY_BY_ID.cast.color,
              content: chars.map((c) => {
                const actor = castForCharacter(p, c);
                return (
                  <span key={c.id} className="elements-p-item">
                    {c.number != null ? `${c.number}. ` : ''}
                    <b>{c.name}</b>
                    {actor ? ` (${actor.name})` : ''}
                  </span>
                );
              }),
            });
          }
          if (s.meta?.extras) rows.push({ key: 'extras-text', label: CATEGORY_BY_ID.extras.short, color: CATEGORY_BY_ID.extras.color, content: s.meta.extras });
          for (const c of ELEMENT_CATEGORIES) {
            const list = groups.get(c.id as ElCategory);
            if (!list?.length) continue;
            rows.push({
              key: c.id,
              label: c.label,
              color: c.color,
              content: list.map((e) => {
                const chr = e.characterId ? charById.get(e.characterId) : undefined;
                return (
                  <span key={e.id} className="elements-p-item">
                    <b>{e.name || 'Unnamed'}</b>
                    {(e.quantity ?? 1) > 1 ? ` ×${e.quantity}` : ''}
                    {chr ? ` (${chr.name})` : ''}
                    {o.showStatus && e.status ? (
                      <span className="elements-p-st" style={{ color: optionColor(ELEMENT_STATUSES, e.status) }}>
                        {' '}
                        {optionLabel(ELEMENT_STATUSES, e.status)}
                      </span>
                    ) : null}
                  </span>
                );
              }),
            });
          }
          return (
            <div key={s.id} className="elements-p-scene pp-avoid">
              <div className="elements-p-scenehead">
                <span className="elements-p-scenenum" style={{ background: st.bg, color: st.fg }}>
                  {s.number}
                </span>
                <span className="elements-p-sceneh">{s.heading || 'Untitled scene'}</span>
                <span className="elements-p-scenemeta">
                  {ctx.fmt.eighths(s.eighths)} pgs
                  {s.meta?.scriptDay ? ` · ${s.meta.scriptDay}` : ''}
                  {loc ? ` · ${loc.name}` : ''}
                </span>
              </div>
              {rows.length ? (
                <table className="elements-p-rows">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className="k" style={{ color: r.color }}>
                          {r.label}
                        </td>
                        <td>{r.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="pp-muted" style={{ padding: '4pt 7pt', fontSize: '8pt' }}>
                  Nothing broken down for this scene yet.
                </div>
              )}
            </div>
          );
        })}
      </>
    ),
    css: CSS,
  };
}

/* ---------------------------------------------------------------- by category */

function renderByCategory(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const scenes = scenesByElement(ctx.model);
  const chars = characterMap(p.characters);
  const all = p.elements.filter((e) => o.includeUnused || (scenes.get(e.id)?.length ?? 0) > 0);
  const total = all.reduce((n, e) => n + (e.cost ?? 0), 0);
  const cats = ELEMENT_CATEGORIES.filter((c) => all.some((e) => e.category === c.id));
  return {
    body: (
      <>
        <DocHeader
          ctx={ctx}
          title="Elements by Category"
          subtitle={`${all.length} elements in ${cats.length} categories${o.showCosts && total ? ` · ${ctx.fmt.money(total)}` : ''}`}
        />
        {cats.length === 0 && <p className="pp-muted">No elements in the breakdown yet.</p>}
        {cats.map((c) => {
          const rows = sortRows(
            all.filter((e) => e.category === c.id),
            scenes,
            String(o.sort),
          );
          const showChar = c.id === 'wardrobe' || c.id === 'makeup' || rows.some((e) => e.characterId);
          const cols = elementColumns(ctx, scenes, chars, { photos: !!o.showPhotos, costs: !!o.showCosts, character: showChar, owner: true });
          const sub = rows.reduce((n, e) => n + (e.cost ?? 0), 0);
          return (
            <PSection
              key={c.id}
              title={
                <span className="elements-p-cat">
                  <Dot color={c.color} />
                  {c.label}
                </span>
              }
              right={`${rows.length} item${rows.length === 1 ? '' : 's'}${o.showCosts && sub ? ` · ${ctx.fmt.money(sub)}` : ''}`}
            >
              <PTable columns={cols} rows={rows} footer={costFooter(ctx, cols, rows, !!o.showCosts && sub > 0)} />
            </PSection>
          );
        })}
      </>
    ),
    css: CSS,
  };
}

/* ---------------------------------------------------------------- registry */

const hasElements = (cats?: string[]) => (p: ProjectData) =>
  p.elements.some((e) => !cats || cats.includes(e.category)) ? false : cats ? `No ${cats.map((c) => CATEGORY_BY_ID[c as ElCategory]?.label.toLowerCase()).join(' / ')} in the breakdown yet` : 'No elements in the breakdown yet';

/** Printable documents of the elements module. */
export const printDocs: PrintDocDef[] = [
  {
    id: 'props-list',
    title: 'Props List',
    group: 'Breakdown',
    orientation: 'portrait',
    description: 'Props with photos, scenes, status, source and cost — with prep checkboxes',
    options: [
      { key: 'showPhotos', label: 'Show photos', type: 'boolean', default: true },
      { key: 'showCosts', label: 'Show costs', type: 'boolean', default: true },
      { key: 'includeSetDressing', label: 'Include set dressing & greenery', type: 'boolean', default: false },
      SORT_OPTION,
    ],
    emptyReason: (p) => (p.elements.some((e) => e.category === 'props' || e.category === 'set_dressing') ? false : 'No props in the breakdown yet'),
    render: renderProps,
  },
  {
    id: 'wardrobe-list',
    title: 'Wardrobe List & Plot',
    group: 'Breakdown',
    orientation: 'portrait',
    description: 'Wardrobe grouped by character with actor sizes, plus the scene-by-scene wardrobe plot',
    options: [
      { key: 'includeMakeup', label: 'Include hair & makeup', type: 'boolean', default: true },
      { key: 'showPhotos', label: 'Show photos', type: 'boolean', default: true },
      { key: 'showSizes', label: 'Show actor sizes', type: 'boolean', default: true },
      { key: 'showPlot', label: 'Include wardrobe plot', type: 'boolean', default: true },
      { key: 'showCosts', label: 'Show costs', type: 'boolean', default: false },
    ],
    emptyReason: hasElements(['wardrobe', 'makeup']),
    render: renderWardrobe,
  },
  {
    id: 'elements-by-scene',
    title: 'Elements by Scene',
    group: 'Breakdown',
    orientation: 'portrait',
    description: 'Scene-by-scene list of everything needed: cast, props, wardrobe, effects…',
    options: [
      { key: 'includeCast', label: 'Include cast', type: 'boolean', default: true },
      { key: 'showStatus', label: 'Show status', type: 'boolean', default: true },
      { key: 'hideEmpty', label: 'Hide scenes with nothing broken down', type: 'boolean', default: false },
    ],
    emptyReason: (_p, model) => (model.scenes.length ? false : 'No scenes in the script yet'),
    render: renderByScene,
  },
  {
    id: 'elements-by-category',
    title: 'Elements by Category',
    group: 'Breakdown',
    orientation: 'portrait',
    description: 'Every breakdown category with its elements, scenes, status and cost',
    options: [
      { key: 'showCosts', label: 'Show costs', type: 'boolean', default: true },
      { key: 'showPhotos', label: 'Show photos', type: 'boolean', default: false },
      { key: 'includeUnused', label: 'Include elements not in any scene', type: 'boolean', default: true },
      SORT_OPTION,
    ],
    emptyReason: hasElements(),
    render: renderByCategory,
  },
];
