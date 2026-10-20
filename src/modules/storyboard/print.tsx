/* Printable storyboards: the project's frames ('storyboard') and blank sketching
   templates ('storyboard-blank'). Every page is laid out as an exact-size grid
   so frames keep the project aspect ratio and never split across pages. */
import type { CSSProperties, ReactNode } from 'react';
import type { Orientation, PrintContext, PrintDocDef, PrintOutput } from '@/print/types';
import { paperSizeIn } from '@/print/build';
import type { PaperSize, Shot } from '@/types';
import type { SceneInfo } from '@/derived/script';
import { aspectToNumber } from '@/lib/constants';
import { groupShots, isOmitted, shotSeconds, shotSpecs, UNASSIGNED } from '../shots/shotData';

/* ------------------------------------------------------------------ layout engine */

const MARGINS = { top: 0.55, right: 0.45, bottom: 0.55, left: 0.45 };
const SAFETY = 0.12; // in — keeps every page block safely inside the printable area
const BAND_H = 0.42;
const BAND_GAP = 0.14;
const LABEL_H = 0.2;

interface Layout {
  cols: number;
  rows: number;
  row: boolean;
  cellW: number;
  cellH: number;
  frameW: number;
  frameH: number;
  textH: number;
  textW: number;
  gapX: number;
  gapY: number;
  fontPt: number;
}

const TEXT_H: Record<number, number> = { 1: 1.15, 2: 0.95, 3: 0.95, 4: 0.85, 6: 0.75, 9: 0.6 };
const FONT_PT: Record<number, number> = { 1: 9.5, 2: 9.5, 3: 8.8, 4: 8.6, 6: 8, 9: 7.2 };

export function autoOrientation(per: number, aspect: number): Orientation {
  if (aspect >= 1) return per === 2 || per === 9 ? 'portrait' : 'landscape';
  return per === 1 ? 'portrait' : 'landscape';
}

function contentSize(paper: PaperSize, orientation: Orientation) {
  const s = paperSizeIn(paper, orientation);
  return { w: s.w - MARGINS.left - MARGINS.right, h: s.h - MARGINS.top - MARGINS.bottom - SAFETY };
}

export function computeLayout(per: number, orientation: Orientation, paper: PaperSize, aspect: number, hasText: boolean): Layout {
  const { w: W, h: H0 } = contentSize(paper, orientation);
  const H = H0 - BAND_H - BAND_GAP;
  const baseText = hasText ? TEXT_H[per] ?? 0.7 : 0.08;
  const gapX = per >= 9 ? 0.18 : 0.24;
  const gapY = per >= 9 ? 0.12 : 0.16;
  let best: Layout | null = null;
  let bestScore = -1;
  const consider = (l: Layout) => {
    const score = l.frameW * l.frameH;
    if (l.frameH > 0.25 && score > bestScore) {
      best = l;
      bestScore = score;
    }
  };
  for (let cols = 1; cols <= per; cols++) {
    if (per % cols) continue;
    const rows = per / cols;
    const cellW = (W - gapX * (cols - 1)) / cols;
    const cellH = (H - gapY * (rows - 1)) / rows;
    const frameH = Math.min(cellW / aspect, cellH - LABEL_H - baseText - 0.06);
    const frameW = frameH * aspect;
    consider({ cols, rows, row: false, cellW, cellH, frameW, frameH, textH: cellH - LABEL_H - frameH - 0.06, textW: frameW, gapX, gapY, fontPt: FONT_PT[per] ?? 8 });
    // frame on the left, notes on the right (classic 3-up)
    if (cols === 1 && per <= 4 && hasText && aspect >= 1) {
      const textW = Math.max(2.2, W * 0.36);
      const fw = Math.min(W - textW - 0.25, (cellH - LABEL_H) * aspect);
      const fh = fw / aspect;
      consider({ cols: 1, rows, row: true, cellW: W, cellH, frameW: fw, frameH: fh, textH: cellH - LABEL_H, textW: W - fw - 0.25, gapX, gapY, fontPt: FONT_PT[per] ?? 8 });
    }
  }
  if (!best) {
    const frameW = W;
    const frameH = Math.max(0.5, Math.min(W / aspect, H - LABEL_H - 0.1));
    return { cols: 1, rows: 1, row: false, cellW: W, cellH: H, frameW: frameH * aspect, frameH, textH: 0, textW: frameW, gapX, gapY, fontPt: 8 };
  }
  return best;
}

const inch = (n: number) => `${Math.max(0, n).toFixed(3)}in`;

/* ------------------------------------------------------------------ CSS */

const CSS = `
.sbp-page { position: relative; overflow: hidden; display: flex; flex-direction: column; }
.sbp-page:not(:last-child) { break-after: page; page-break-after: always; }
.sbp-band { display: flex; align-items: center; gap: 8pt; border-bottom: 1.5pt solid var(--pp-accent, #6d4aff); flex-shrink: 0; overflow: hidden; }
.sbp-band-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7pt; }
.sbp-band-scene { display: inline-block; font-weight: 800; font-size: 10pt; padding: 1pt 6pt; border-radius: 3pt; background: var(--pp-accent, #6d4aff); color: #fff; white-space: nowrap; }
.sbp-band-titles { min-width: 0; }
.sbp-band-h { font-weight: 800; font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sbp-band-sub { font-size: 7.6pt; color: #66666f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sbp-band-right { font-size: 7.6pt; color: #55555e; text-align: right; white-space: nowrap; }
.sbp-band-field { display: inline-flex; align-items: flex-end; gap: 4pt; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #33333c; margin-right: 12pt; }
.sbp-band-field span { display: inline-block; border-bottom: 0.75pt solid #555; min-width: 1.1in; height: 12pt; }
.sbp-grid { display: grid; }
.sbp-cell { display: flex; justify-content: center; overflow: hidden; }
.sbp-cell.row { justify-content: flex-start; gap: 0.25in; }
.sbp-col { display: flex; flex-direction: column; min-width: 0; }
.sbp-label { display: flex; align-items: flex-end; gap: 5pt; padding-bottom: 2.5pt; line-height: 1; white-space: nowrap; overflow: hidden; }
.sbp-no { font-weight: 800; font-size: 1.05em; letter-spacing: 0.02em; }
.sbp-sc { font-weight: 700; color: #707078; font-size: 0.85em; letter-spacing: 0.04em; }
.sbp-dur { margin-left: auto; color: #55555e; font-size: 0.85em; font-variant-numeric: tabular-nums; }
.sbp-blank-field { display: inline-block; border-bottom: 0.6pt solid #888; width: 0.55in; height: 9pt; }
.sbp-frame { position: relative; overflow: hidden; border: 0.9pt solid #1a1a1a; background: #fff; flex-shrink: 0; }
.sbp-frame img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; max-width: none; }
.sbp-frame img.i { object-fit: cover; }
.sbp-frame img.d { object-fit: fill; }
.sbp-frame.omit::after { content: 'OMITTED'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; letter-spacing: 0.2em; color: #c33; background: rgba(255,255,255,0.6); }
.sbp-text { overflow: hidden; padding-top: 3.5pt; line-height: 1.3; }
.sbp-specs { font-size: 0.82em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #3d3d46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sbp-desc { white-space: pre-wrap; word-break: break-word; color: #141418; }
.sbp-audio { font-style: italic; color: #44444c; white-space: pre-wrap; word-break: break-word; margin-top: 1.5pt; }
.sbp-audio b { font-style: normal; font-size: 0.72em; letter-spacing: 0.08em; color: #85858f; margin-right: 3pt; }
.sbp-lines div { border-bottom: 0.5pt solid #c4c4cc; height: 0.235in; }
.sbp-empty { padding: 1in 0; text-align: center; color: #85858f; font-size: 11pt; }
@media screen { .sbp-page { outline: 1px dashed #d4d4dc; outline-offset: 0.12in; margin-bottom: 0.4in; } }
`;

/* ------------------------------------------------------------------ panels */

interface Panel {
  shot?: Shot;
  scene?: SceneInfo;
}

interface PageDef {
  key: string;
  band: ReactNode;
  panels: Panel[];
}

function lineClamp(lines: number): CSSProperties {
  return { display: '-webkit-box', WebkitLineClamp: Math.max(1, lines), WebkitBoxOrient: 'vertical', overflow: 'hidden' };
}

function PanelView({ ctx, p, layout, opts, showScene }: { ctx: PrintContext; p: Panel; layout: Layout; opts: { desc: boolean; audio: boolean; specs: boolean; specsLine?: boolean }; showScene: boolean }) {
  const s = p.shot;
  const lh = (layout.fontPt * 1.3) / 72;
  const img = s?.image ? ctx.asset(s.image) : '';
  const drw = s?.drawing ? ctx.asset(s.drawing) : '';
  const specs = s && opts.specs ? shotSpecs(s) : '';
  const hasAudio = !!(s && opts.audio && s.audio);
  const hasDesc = !!(s && opts.desc && s.description);
  const textH = layout.textH - 0.05;
  const specsH = specs ? lh : 0;
  const audioLines = hasAudio ? Math.min(hasDesc ? 3 : 8, Math.max(1, Math.floor((textH - specsH) / lh / (hasDesc ? 3 : 1)))) : 0;
  const descLines = Math.max(1, Math.floor((textH - specsH - audioLines * lh - (hasAudio ? 0.03 : 0)) / lh));
  const ruled = Math.max(0, Math.floor((textH - specsH) / 0.235));

  const label = s ? (
    <div className="sbp-label" style={{ height: inch(LABEL_H) }}>
      <span className="sbp-no">SHOT {s.number || '—'}</span>
      {showScene && p.scene && <span className="sbp-sc">SC {p.scene.number}</span>}
      <span className="sbp-dur">{shotSeconds(s)}s</span>
    </div>
  ) : (
    <div className="sbp-label" style={{ height: inch(LABEL_H) }}>
      <span className="sbp-no">SHOT</span> <span className="sbp-blank-field" />
      {opts.specsLine !== false && (
        <>
          <span className="sbp-sc">SC</span> <span className="sbp-blank-field" style={{ width: '0.4in' }} />
        </>
      )}
      <span className="sbp-dur">
        <span className="sbp-blank-field" style={{ width: '0.35in' }} /> s
      </span>
    </div>
  );

  const frame = (
    <div className={['sbp-frame', s && isOmitted(s) && 'omit'].filter(Boolean).join(' ')} style={{ width: inch(layout.frameW), height: inch(layout.frameH) }}>
      {img && <img className="i" src={img} alt="" />}
      {drw && <img className="d" src={drw} alt="" />}
    </div>
  );

  const showText = opts.desc || opts.audio || opts.specs || !s;
  const text = showText ? (
    <div className="sbp-text" style={{ height: inch(layout.textH), width: layout.row ? undefined : inch(layout.textW), flex: layout.row ? 1 : undefined }}>
      {specs && <div className="sbp-specs">{specs}</div>}
      {!s && opts.specsLine !== false && <div className="sbp-specs" style={{ color: '#9a9aa3' }}>Size ____ Angle ______ Move ______ Lens ____</div>}
      {hasDesc && (
        <div className="sbp-desc" style={lineClamp(descLines)}>
          {s!.description}
        </div>
      )}
      {hasAudio && (
        <div className="sbp-audio" style={lineClamp(audioLines)}>
          <b>AUDIO</b>
          {s!.audio}
        </div>
      )}
      {!hasDesc && !hasAudio && ruled > 0 && (
        <div className="sbp-lines">
          {Array.from({ length: ruled }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      )}
    </div>
  ) : null;

  if (layout.row) {
    return (
      <div className="sbp-cell row" style={{ width: inch(layout.cellW), height: inch(layout.cellH) }}>
        <div className="sbp-col" style={{ width: inch(layout.frameW) }}>
          {label}
          {frame}
        </div>
        <div className="sbp-col" style={{ flex: 1, paddingTop: inch(LABEL_H - 0.04) }}>
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="sbp-cell" style={{ width: inch(layout.cellW), height: inch(layout.cellH) }}>
      <div className="sbp-col" style={{ width: inch(layout.frameW) }}>
        {label}
        {frame}
        {text}
      </div>
    </div>
  );
}

function renderPages(ctx: PrintContext, pages: PageDef[], layout: Layout, opts: { desc: boolean; audio: boolean; specs: boolean; specsLine?: boolean }, showScene: boolean, orientation: Orientation): ReactNode {
  const { h } = contentSize(ctx.paper, orientation);
  return pages.map((pg) => (
    <div key={pg.key} className="sbp-page" style={{ height: inch(h) }}>
      <div className="sbp-band" style={{ height: inch(BAND_H), marginBottom: inch(BAND_GAP) }}>
        {pg.band}
      </div>
      <div
        className="sbp-grid"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, ${inch(layout.cellW)})`,
          gridAutoRows: inch(layout.cellH),
          columnGap: inch(layout.gapX),
          rowGap: inch(layout.gapY),
          fontSize: `${layout.fontPt}pt`,
        }}
      >
        {pg.panels.map((p, i) => (
          <PanelView key={p.shot?.id ?? `blank-${i}`} ctx={ctx} p={p} layout={layout} opts={opts} showScene={showScene} />
        ))}
      </div>
    </div>
  ));
}

function resolveOrientation(opt: unknown, per: number, aspect: number): Orientation {
  return opt === 'portrait' || opt === 'landscape' ? opt : autoOrientation(per, aspect);
}

const LAYOUT_CHOICES = [
  { value: '1', label: '1 frame per page' },
  { value: '2', label: '2 frames per page' },
  { value: '3', label: '3 frames per page' },
  { value: '4', label: '4 frames per page' },
  { value: '6', label: '6 frames per page' },
  { value: '9', label: '9 frames per page' },
];
const ORIENT_CHOICES = [
  { value: 'auto', label: 'Automatic (best fit)' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

/* ------------------------------------------------------------------ storyboard */

function renderStoryboard(ctx: PrintContext): PrintOutput {
  const { project: p, model, options: o } = ctx;
  const aspect = aspectToNumber(p.meta.aspectRatio);
  const per = Math.max(1, parseInt(String(o.layout), 10) || 6);
  const orientation = resolveOrientation(o.orientation, per, aspect);
  const opts = { desc: !!o.showDescription, audio: !!o.showAudio, specs: !!o.showSpecs };
  const layout = computeLayout(per, orientation, ctx.paper, aspect, opts.desc || opts.audio || opts.specs || !!o.includeBlankFrames);
  const sceneOnly = typeof o.sceneId === 'string' && o.sceneId && (o.sceneId === UNASSIGNED || model.sceneById.has(o.sceneId)) ? (o.sceneId as string) : undefined;
  const groups = groupShots(p.shots, model, {
    filter: (s) => !isOmitted(s),
    onlyKey: sceneOnly,
    includeEmptyScenes: !!o.includeBlankFrames && !!o.newPagePerScene,
  });
  const total = groups.reduce((n, g) => n + g.shots.length, 0);
  const right = (from: number, to: number) => (
    <div className="sbp-band-right">
      {[p.meta.director ? `Dir. ${p.meta.director}` : '', p.meta.aspectRatio].filter(Boolean).join(' · ')}
      <br />
      {to >= from ? `Frames ${from}–${to} of ${total}` : 'Blank frames for sketching'}
    </div>
  );

  const pages: PageDef[] = [];
  let counter = 0;
  const chunk = (panels: Panel[], pad: boolean) => {
    const out: Panel[][] = [];
    for (let i = 0; i < panels.length; i += per) out.push(panels.slice(i, i + per));
    if (!out.length && pad) out.push([]);
    if (pad && out.length) {
      const last = out[out.length - 1];
      while (last.length < per) last.push({ scene: last[0]?.scene });
    }
    return out;
  };

  if (o.newPagePerScene) {
    for (const g of groups) {
      const sc = g.scene;
      const chunks = chunk(
        g.shots.map((s) => ({ shot: s, scene: sc })),
        !!o.includeBlankFrames,
      );
      chunks.forEach((panels, ci) => {
        const real = panels.filter((x) => x.shot).length;
        const from = counter + 1;
        counter += real;
        const syn = sc ? sc.synopsis || '' : '';
        pages.push({
          key: `${g.key}-${ci}`,
          panels: panels.map((x) => ({ ...x, scene: sc })),
          band: (
            <>
              <div className="sbp-band-main">
                {sc && <span className="sbp-band-scene">SC {sc.number}</span>}
                <div className="sbp-band-titles">
                  <div className="sbp-band-h">
                    {sc ? sc.heading || 'Untitled scene' : model.scenes.length ? 'Unassigned frames' : 'Frames'}
                    {ci > 0 ? ' (cont’d)' : ''}
                  </div>
                  {syn && <div className="sbp-band-sub">{syn}</div>}
                </div>
              </div>
              {right(from, counter)}
            </>
          ),
        });
      });
    }
  } else {
    const all: Panel[] = groups.flatMap((g) => g.shots.map((s) => ({ shot: s, scene: g.scene })));
    chunk(all, !!o.includeBlankFrames).forEach((panels, ci) => {
      const real = panels.filter((x) => x.shot);
      const from = counter + 1;
      counter += real.length;
      const nums = [...new Set(real.map((x) => x.scene?.number).filter(Boolean))] as string[];
      const scenesTxt = nums.length ? (nums.length === 1 ? `Scene ${nums[0]}` : `Scenes ${nums[0]}–${nums[nums.length - 1]}`) : '';
      const first = real[0]?.scene;
      pages.push({
        key: `p-${ci}`,
        panels,
        band: (
          <>
            <div className="sbp-band-main">
              <div className="sbp-band-titles">
                <div className="sbp-band-h">Storyboard{scenesTxt ? ` · ${scenesTxt}` : ''}</div>
                <div className="sbp-band-sub">{nums.length === 1 && first ? first.heading : p.meta.title}</div>
              </div>
            </div>
            {right(from, counter)}
          </>
        ),
      });
    });
  }

  const body = pages.length ? (
    renderPages(ctx, pages, layout, opts, !o.newPagePerScene, orientation)
  ) : (
    <div className="sbp-empty">No storyboard frames to print yet. Add frames in the Storyboard, or turn on “Blank frames”.</div>
  );
  return { body, css: CSS, orientation, margins: MARGINS };
}

/* ------------------------------------------------------------------ blank template */

const BLANK_ASPECTS = [
  { value: 'project', label: 'Project aspect ratio' },
  { value: '16:9', label: '16:9' },
  { value: '2.39:1', label: '2.39:1 (Scope)' },
  { value: '1.85:1', label: '1.85:1' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1 (Square)' },
  { value: '4:5', label: '4:5' },
  { value: '9:16', label: '9:16 (Vertical)' },
];

function renderBlank(ctx: PrintContext): PrintOutput {
  const { project: p, options: o } = ctx;
  const ratio = o.aspect && o.aspect !== 'project' ? String(o.aspect) : p.meta.aspectRatio;
  const aspect = aspectToNumber(ratio);
  const per = Math.max(1, parseInt(String(o.layout), 10) || 6);
  const orientation = resolveOrientation(o.orientation, per, aspect);
  const layout = computeLayout(per, orientation, ctx.paper, aspect, true);
  const count = Math.max(1, Math.min(60, Number(o.pages) || 1));
  const pages: PageDef[] = Array.from({ length: count }, (_, i) => ({
    key: `b-${i}`,
    panels: Array.from({ length: per }, () => ({})),
    band: (
      <>
        <div className="sbp-band-main">
          <span className="sbp-band-field">
            Scene <span style={{ minWidth: '0.6in' }} />
          </span>
          <span className="sbp-band-field">
            Location <span style={{ minWidth: '1.8in' }} />
          </span>
          <span className="sbp-band-field">
            Page <span style={{ minWidth: '0.45in' }} />
          </span>
        </div>
        <div className="sbp-band-right">
          {p.meta.title}
          <br />
          {ratio} storyboard
        </div>
      </>
    ),
  }));
  return {
    body: renderPages(ctx, pages, layout, { desc: false, audio: false, specs: false, specsLine: !!o.specsLine }, false, orientation),
    css: CSS,
    orientation,
    margins: MARGINS,
  };
}

/* ------------------------------------------------------------------ definitions */

export const printDocs: PrintDocDef[] = [
  {
    id: 'storyboard',
    title: 'Storyboard',
    group: 'Visuals',
    description: 'Numbered frames in the project aspect ratio with shot specs, action and audio. Choose 1–9 frames per page.',
    options: [
      { key: 'layout', label: 'Layout', type: 'select', default: '6', choices: LAYOUT_CHOICES },
      { key: 'orientation', label: 'Orientation', type: 'select', default: 'auto', choices: ORIENT_CHOICES, hint: 'Automatic picks the orientation that suits the layout' },
      { key: 'showDescription', label: 'Description', type: 'boolean', default: true },
      { key: 'showAudio', label: 'Audio / dialogue', type: 'boolean', default: true },
      { key: 'showSpecs', label: 'Shot specs (size, angle, movement, lens)', type: 'boolean', default: true },
      { key: 'newPagePerScene', label: 'Start each scene on a new page', type: 'boolean', default: true },
      { key: 'includeBlankFrames', label: 'Fill pages with blank frames for sketching', type: 'boolean', default: false },
    ],
    emptyReason: (p) => (p.shots.some((s) => s.status !== 'omitted') ? false : 'No storyboard frames yet'),
    render: renderStoryboard,
  },
  {
    id: 'storyboard-blank',
    title: 'Blank Storyboard Template',
    group: 'Blank Templates',
    description: 'Empty frames with ruled note lines for sketching on set or in a meeting.',
    options: [
      { key: 'layout', label: 'Layout', type: 'select', default: '6', choices: LAYOUT_CHOICES },
      { key: 'orientation', label: 'Orientation', type: 'select', default: 'auto', choices: ORIENT_CHOICES },
      { key: 'aspect', label: 'Frame aspect ratio', type: 'select', default: 'project', choices: BLANK_ASPECTS },
      { key: 'pages', label: 'Number of pages', type: 'number', default: 4, min: 1, max: 60 },
      { key: 'specsLine', label: 'Size / angle / move / lens line', type: 'boolean', default: true },
    ],
    render: renderBlank,
  },
];
