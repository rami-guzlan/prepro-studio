/* Whole-plot rendering shared by the editor, the print documents and the
   PNG/SVG exports. Pure (no hooks) so it works in renderToStaticMarkup. */
import type { CSSProperties, ReactNode } from 'react';
import type { DiagramItem, LightingDiagram } from '@/types';
import { kindDef, isCameraKind, isLightKind } from './library';
import { PAL_LIGHT, type Palette } from './color';
import { cameraRows, contentBox, dims, fixtureName, fmtUnits, itemAABB, lightNumbers, cameraLetters, lightRows, type Box } from './model';
import { Beam, FONT, FovWedge, ItemGraphic, ItemLabels, drawItemBody, type DrawCtx, type LabelInfo } from './symbols';

export interface PlotOpts {
  beams: boolean;
  fov: boolean;
  grid: boolean;
  labels: boolean;
}

const f = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- grid */

const LABEL_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

export function GridLayer({ region, ppu, units, pal, zoom, labels = true }: { region: Box; ppu: number; units: 'ft' | 'm'; pal: Palette; zoom: number; labels?: boolean }) {
  const minorStep = units === 'm' ? ppu / 4 : ppu / 2;
  const lines = (step: number, every: number | null, skipEvery?: number) => {
    let d = '';
    if (step <= 0) return d;
    const i0 = Math.ceil(region.x0 / step);
    const i1 = Math.floor(region.x1 / step);
    for (let i = i0; i <= i1; i++) {
      if (every && i % every !== 0) continue;
      if (skipEvery && i % skipEvery === 0) continue;
      d += `M${f(i * step)},${f(region.y0)}V${f(region.y1)}`;
    }
    const j0 = Math.ceil(region.y0 / step);
    const j1 = Math.floor(region.y1 / step);
    for (let j = j0; j <= j1; j++) {
      if (every && j % every !== 0) continue;
      if (skipEvery && j % skipEvery === 0) continue;
      d += `M${f(region.x0)},${f(j * step)}H${f(region.x1)}`;
    }
    return d;
  };
  const showMinor = minorStep * zoom >= 7;
  const showUnit = ppu * zoom >= 5;
  const fiveStep = ppu * 5;
  const labelK = LABEL_STEPS.find((k) => k * ppu * zoom >= 38) ?? 1000;
  const fs = 9 / zoom;
  const out: ReactNode[] = [];
  if (showMinor) out.push(<path key="mi" d={lines(minorStep, null, units === 'm' ? 4 : 2)} stroke={pal.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
  if (showUnit) out.push(<path key="u" d={lines(ppu, null, 5)} stroke={pal.gridMajor} strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
  out.push(<path key="5" d={lines(fiveStep, null)} stroke={pal.gridMajor} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
  if (labels) {
    const fmt = (v: number) => (units === 'm' ? `${v} m` : `${v}′`);
    const step = labelK * ppu;
    const tl: ReactNode[] = [];
    for (let i = Math.ceil(region.x0 / step); i * step <= region.x1; i++) {
      const x = i * step;
      if (x - region.x0 < 14 / zoom) continue;
      tl.push(
        <text key={`x${i}`} x={f(x + 3 / zoom)} y={f(region.y0 + 10 / zoom)} fontSize={f(fs)} fontFamily={FONT} fill={pal.gridText}>
          {fmt(i * labelK)}
        </text>,
      );
    }
    for (let j = Math.ceil(region.y0 / step); j * step <= region.y1; j++) {
      const y = j * step;
      if (y - region.y0 < 14 / zoom) continue;
      tl.push(
        <text key={`y${j}`} x={f(region.x0 + 3 / zoom)} y={f(y - 3 / zoom)} fontSize={f(fs)} fontFamily={FONT} fill={pal.gridText}>
          {fmt(j * labelK)}
        </text>,
      );
    }
    out.push(
      <g key="lab" pointerEvents="none">
        {tl}
      </g>,
    );
  }
  return <g pointerEvents="none">{out}</g>;
}

/* ---------------------------------------------------------------- layers */

export function labelInfo(items: DiagramItem[]): LabelInfo {
  return { lightNums: lightNumbers(items), camLetters: cameraLetters(items) };
}

/**
 * Background image, grid, beams, FOV wedges, items and labels.
 * `items` are the items to draw (already filtered / with live edits),
 * `all` the complete list used for stable numbering.
 */
export function PlotLayers({
  d,
  items,
  all,
  c,
  opts,
  bgHref,
  region,
  zoom,
  ghost,
}: {
  d: LightingDiagram;
  items: DiagramItem[];
  all?: DiagramItem[];
  c: DrawCtx;
  opts: PlotOpts;
  bgHref?: string;
  region: Box;
  zoom: number;
  ghost?: Set<string>;
}) {
  const { w, h } = dims(d);
  const info = labelInfo(all ?? items);
  const bgOpacity = typeof d.backgroundOpacity === 'number' ? Math.max(0, Math.min(1, d.backgroundOpacity)) : 0.6;
  return (
    <>
      <rect x={region.x0} y={region.y0} width={region.x1 - region.x0} height={region.y1 - region.y0} fill={c.pal.paper} />
      {bgHref && <image href={bgHref} x={0} y={0} width={w} height={h} preserveAspectRatio="xMinYMin meet" opacity={bgOpacity} />}
      {opts.grid && <GridLayer region={region} ppu={c.ppu} units={c.units} pal={c.pal} zoom={zoom} />}
      {opts.beams && (
        <g pointerEvents="none">
          {items
            .filter((i) => isLightKind(i.kind))
            .map((i) => (
              <Beam key={i.id} item={i} c={c} />
            ))}
        </g>
      )}
      {opts.fov && (
        <g pointerEvents="none">
          {items
            .filter((i) => isCameraKind(i.kind))
            .map((i) => (
              <FovWedge key={i.id} item={i} c={c} />
            ))}
        </g>
      )}
      <g>
        {items.map((i) => (
          <ItemGraphic key={i.id} item={i} c={c} ghost={ghost?.has(i.id)} />
        ))}
      </g>
      {opts.labels && (
        <g>
          {items.map((i) => (
            <ItemLabels key={i.id} item={i} c={c} info={info} bounds={itemAABB(i, c.ppu)} />
          ))}
        </g>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- static SVG */

export interface StaticOpts extends PlotOpts {
  crop: boolean;
  /** output box in px the plot must fit (print); default: natural size up to 1400 px wide */
  fit?: { w: number; h: number };
  /** wanted caption size in output px (print legibility) */
  labelPx?: number;
  /** draw a key of lights & cameras under the plot (PNG / SVG export) */
  legend?: boolean;
  scaleBar?: boolean;
  title?: string;
}

/** Scale bar band drawn under the plot (own strip, so it never covers the drawing). */
function scaleBand(d: LightingDiagram, box: Box, u: number, pal: Palette): { height: number; node: ReactNode } {
  const { w, h, ppu, units } = dims(d);
  const vw = box.x1 - box.x0;
  const target = vw * 0.14;
  const k = [1, 2, 5, 10, 20, 50, 100].find((s) => s * ppu >= target) ?? 100;
  const len = k * ppu;
  const height = 26 * u;
  const x = box.x0 + 14 * u;
  const y = box.y1 + 17 * u;
  const hh = 4 * u;
  return {
    height,
    node: (
      <g>
        <rect x={box.x0} y={box.y1} width={vw} height={height} fill={pal.paper} />
        <rect x={f(x)} y={f(y - hh)} width={f(len / 2)} height={f(hh)} fill={pal.ink} />
        <rect x={f(x + len / 2)} y={f(y - hh)} width={f(len / 2)} height={f(hh)} fill={pal.paper} stroke={pal.ink} strokeWidth={f(0.8 * u)} />
        <text x={f(x)} y={f(y - hh - 3 * u)} fontSize={f(8 * u)} fontFamily={FONT} fill={pal.ink}>
          0
        </text>
        <text x={f(x + len)} y={f(y - hh - 3 * u)} fontSize={f(8 * u)} fontFamily={FONT} fill={pal.ink} textAnchor="middle">
          {fmtUnits(k, units, 0)}
        </text>
        <text x={f(box.x1 - 14 * u)} y={f(y - hh / 2)} fontSize={f(8 * u)} fontFamily={FONT} fill={pal.ink2} textAnchor="end" dominantBaseline="central">
          {`Room ${fmtUnits(w / ppu, units)} × ${fmtUnits(h / ppu, units)} · grid 1 ${units}`}
        </text>
      </g>
    ),
  };
}

/** Key drawn under the plot in image exports. Returns its height and content. */
function legendBlock(d: LightingDiagram, box: Box, u: number, pal: Palette, top0: number): { height: number; node: ReactNode } {
  const lights = lightRows(d);
  const cams = cameraRows(d);
  if (!lights.length && !cams.length) return { height: 0, node: null };
  const { units } = dims(d);
  const lh = 17 * u;
  const fs = 10.5 * u;
  const rows: { key: string; badge: string; color: string; text: string; cam?: boolean }[] = [
    ...lights.map((r) => ({
      key: r.item.id,
      badge: `L${r.n}`,
      color: r.color,
      text: [r.purpose, fixtureName(r), r.modifier && r.modifier !== 'None' ? r.modifier : '', r.gel || (r.cct ? `${r.cct}K` : ''), `${r.intensity}%`, r.height != null ? `${r.height} ${units}` : ''].filter(Boolean).join(' · '),
    })),
    ...cams.map((r) => ({
      key: r.item.id,
      badge: r.letter,
      color: pal.camera,
      cam: true,
      text: [`Camera ${r.letter}`, r.body || r.type, r.lens ? `${r.lens}mm` : '', r.support].filter(Boolean).join(' · '),
    })),
  ];
  const vw = box.x1 - box.x0;
  const cols = rows.length > 6 && vw > 700 * u ? 2 : 1;
  const perCol = Math.ceil(rows.length / cols);
  const colW = vw / cols;
  const top = top0 + 14 * u;
  const height = 14 * u + 20 * u + perCol * lh + 12 * u;
  const node = (
    <g>
      <rect x={box.x0} y={top0} width={vw} height={height} fill={pal.paper} />
      <line x1={box.x0 + 12 * u} y1={top0 + 4 * u} x2={box.x1 - 12 * u} y2={top0 + 4 * u} stroke={pal.gridMajor} strokeWidth={u} />
      <text x={f(box.x0 + 14 * u)} y={f(top + 6 * u)} fontSize={f(9 * u)} fontWeight={750} letterSpacing={f(0.8 * u)} fontFamily={FONT} fill={pal.ink2}>
        KEY
      </text>
      {rows.map((r, i) => {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        const x = box.x0 + 14 * u + col * colW;
        const y = top + 22 * u + row * lh;
        const bw = Math.max(20, 9 + r.badge.length * 6.5) * u;
        return (
          <g key={r.key}>
            <rect x={f(x)} y={f(y - 7 * u)} width={f(bw)} height={f(14 * u)} rx={f(7 * u)} fill={r.cam ? pal.camera : pal.ink} />
            {!r.cam && <circle cx={f(x + bw + 8 * u)} cy={f(y)} r={f(4.5 * u)} fill={r.color} stroke={pal.ink} strokeWidth={f(0.6 * u)} />}
            <text x={f(x + bw / 2)} y={f(y)} fontSize={f(9 * u)} fontWeight={750} fontFamily={FONT} fill="#ffffff" textAnchor="middle" dominantBaseline="central">
              {r.badge}
            </text>
            <text x={f(x + bw + (r.cam ? 7 : 17) * u)} y={f(y)} fontSize={f(fs)} fontFamily={FONT} fill={pal.ink} dominantBaseline="central">
              {r.text}
            </text>
          </g>
        );
      })}
    </g>
  );
  return { height, node };
}

/** Complete standalone <svg> of a diagram (print, PNG and SVG export). */
export function DiagramSvg({
  d,
  opts,
  pal = PAL_LIGHT,
  bgHref,
  idp,
  className,
  style,
}: {
  d: LightingDiagram;
  opts: StaticOpts;
  pal?: Palette;
  bgHref?: string;
  idp: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { ppu, units } = dims(d);
  const bandPx = opts.scaleBar ? 26 : 0;
  const scaleFor = (b: Box) => {
    const bw = Math.max(1, b.x1 - b.x0);
    const bh = Math.max(1, b.y1 - b.y0);
    return opts.fit ? Math.max(0.05, Math.min(opts.fit.w / bw, (opts.fit.h - bandPx) / bh)) : Math.min(1, 1400 / bw);
  };
  const box0 = contentBox(d, opts.crop, 1);
  const ts = Math.max(1, Math.min(2.4, (opts.labelPx ?? 11) / 10.5 / scaleFor(box0)));
  const box = ts > 1.02 ? contentBox(d, opts.crop, ts) : box0;
  const scale = scaleFor(box);
  const vw = Math.max(1, box.x1 - box.x0);
  const zoom = scale;
  const u = 1 / zoom;
  const c: DrawCtx = { pal, ppu, units, idp, ts };
  const visible = d.items.filter((i) => !i.hidden);
  const band = opts.scaleBar ? scaleBand(d, box, u, pal) : { height: 0, node: null };
  const leg = opts.legend ? legendBlock(d, box, u, pal, box.y1 + band.height) : { height: 0, node: null };
  const vh = Math.max(1, box.y1 - box.y0) + band.height + leg.height;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${f(box.x0)} ${f(box.y0)} ${f(vw)} ${f(vh)}`}
      width={Math.round(vw * scale)}
      height={Math.round(vh * scale)}
      className={className}
      style={style}
      fontFamily={FONT}
    >
      {opts.title && <title>{opts.title}</title>}
      <PlotLayers d={d} items={visible} all={d.items} c={c} opts={opts} bgHref={bgHref} region={box} zoom={zoom} />
      {band.node}
      {leg.node}
    </svg>
  );
}

/* ---------------------------------------------------------------- palette icon */

/** Small preview of a library kind (palette tiles, object list). */
export function KindIcon({ kind, pal, size = 34, item }: { kind: string; pal: Palette; size?: number; item?: DiagramItem }) {
  const def = kindDef(kind);
  const c: DrawCtx = { pal, ppu: 10, units: 'ft', idp: 'ki' };
  const base: DiagramItem = {
    id: 'icon',
    kind,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    props: { ...(def.props ?? {}), ...(item?.props ?? {}) },
    color: item?.color ?? def.color,
    label: def.shape === 'text' ? 'Aa' : undefined,
  };
  let vb = `${-def.w / 2 - 3} ${-def.h / 2 - 3} ${def.w + 6} ${def.h + 6}`;
  if (def.shape === 'box') {
    const sw = def.size?.[0] ?? 2;
    const sh = def.size?.[1] ?? 2;
    const ppu = 30 / Math.max(sw, sh);
    c.ppu = ppu;
    base.w = Math.max(6, sw * ppu);
    base.h = Math.max(4, sh * ppu);
    if (def.kind === 'grip.flag' || def.kind === 'grip.scrim' || def.kind === 'grip.diffusion' || def.kind === 'grip.bounce' || def.kind === 'grip.negfill') base.h = 6;
    if (def.kind === 'set.wall') base.h = 7;
    if (def.kind === 'set.window' || def.kind === 'set.tv') base.h = 6;
    if (def.kind === 'grip.slider') base.h = 7;
    const m = Math.max(base.w, base.h) / 2 + 5;
    vb = `${-m} ${-m} ${m * 2} ${m * 2}`;
  } else if (def.shape === 'path') {
    base.points = def.kind === 'note.dimension' ? [[-15, 4], [15, 4]] : [[-15, 9], [-2, -4], [15, -8]];
    if (def.kind === 'note.arrow') base.props = { ...base.props, dashed: false, curved: true };
    vb = '-20 -20 40 40';
  } else if (def.shape === 'text') {
    base.props = { size: 18, bold: true };
    vb = '-20 -20 40 40';
  } else {
    const m = Math.max(def.w, def.h) / 2 + 4;
    vb = `${-m} ${-m} ${m * 2} ${m * 2}`;
  }
  return (
    <svg viewBox={vb} width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {drawItemBody(base, c)}
    </svg>
  );
}
