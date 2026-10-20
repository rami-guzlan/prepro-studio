/* Turns a PrintDocDef into a complete, self-contained HTML document. */
import { renderToStaticMarkup } from 'react-dom/server';
import type { PaperSize, PrintSettings, ProjectData } from '@/types';
import type { Orientation, PrintContext, PrintDocDef, PrintOutput } from './types';
import { BASE_PRINT_CSS } from './printCss';
import { fontFaceCss } from './fonts';
import { getScriptModel } from '@/derived/script';
import { makeFormatters } from '@/lib/format';
import { todayISO } from '@/lib/dates';
import { escapeHtml, safeFileName } from '@/lib/text';
import { backend } from '@/backend';
import type { PdfJob } from '@/backend';

export const PAPER_IN: Record<PaperSize, { w: number; h: number }> = {
  letter: { w: 8.5, h: 11 },
  a4: { w: 8.27, h: 11.69 },
};

export function paperSizeIn(paper: PaperSize, orientation: Orientation) {
  const s = PAPER_IN[paper];
  return orientation === 'landscape' ? { w: s.h, h: s.w } : s;
}

function cssString(s: string): string {
  return JSON.stringify(s.replace(/[\r\n]+/g, ' '));
}

export function defaultOptions(def: PrintDocDef): Record<string, any> {
  const o: Record<string, any> = {};
  for (const opt of def.options ?? []) o[opt.key] = opt.default;
  return o;
}

export function makeContext(project: ProjectData, def: PrintDocDef, options: Record<string, any>, paper?: PaperSize, orientation?: Orientation): PrintContext {
  const fmt = makeFormatters(project.settings);
  return {
    project,
    model: getScriptModel(project),
    options: { ...defaultOptions(def), ...options },
    paper: paper ?? project.settings.paperSize,
    orientation: orientation ?? def.orientation ?? 'portrait',
    fmt,
    asset: (name) => (name ? backend.assetUrl(project.id, name) : ''),
    today: fmt.dateMedium(todayISO()),
  };
}

const READY_SCRIPT = `<script>
window.__printReady = function () {
  var imgs = Array.prototype.slice.call(document.images);
  var waits = imgs.map(function (img) {
    return img.complete ? Promise.resolve() : new Promise(function (r) { img.addEventListener('load', r); img.addEventListener('error', r); });
  });
  if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
  return Promise.all(waits).then(function () {
    return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(function () { r(true); }, 80); }); });
  });
};
</script>`;

export interface BuiltDoc {
  html: string;
  title: string;
  fileName: string;
  orientation: Orientation;
  paper: PaperSize;
  out: PrintOutput;
}

/** Whose document it is (project or Marketing Space): running header, accent colour, print settings. */
export interface DocOwner {
  title: string;
  subtitle?: string;
  color?: string;
  print: PrintSettings;
}

export function buildDocument(def: PrintDocDef, ctx: PrintContext): BuiltDoc {
  const p = ctx.project;
  return assembleDocument(def.render(ctx), def.title, { title: p.meta.title, subtitle: p.meta.subtitle, color: p.meta.color, print: p.settings.print }, ctx);
}

/** Turn a rendered PrintOutput into a complete HTML document (shared by projects and spaces). */
export function assembleDocument(out: PrintOutput, defTitle: string, owner: DocOwner, ctx: { paper: PaperSize; orientation: Orientation; today: string }): BuiltDoc {
  const orientation = out.orientation ?? ctx.orientation;
  const mode = out.mode ?? 'flow';
  const size = paperSizeIn(ctx.paper, orientation);
  const title = out.title ?? defTitle;
  const ps = owner.print;
  const m = out.margins ?? { top: 0.62, right: 0.5, bottom: 0.62, left: 0.5 };

  let pageCss: string;
  if (mode === 'fixed') {
    pageCss = `@page { size: ${size.w}in ${size.h}in; margin: 0; }
.pp-page { width: ${size.w}in; height: ${size.h}in; }`;
  } else {
    const headerLeft = out.header === false ? '' : out.header?.left ?? (ps.showProjectTitle ? `${owner.title}${owner.subtitle ? ' · ' + owner.subtitle : ''}` : '');
    const headerRight = out.header === false ? '' : out.header?.right ?? title;
    const footerLeft = out.footer === false ? '' : out.footer?.left ?? `${ps.confidential ? 'CONFIDENTIAL · ' : ''}${ctx.today}`;
    const footerCenter = out.footer === false ? '' : out.footer?.center ?? '';
    const pageNums = out.footer === false ? '' : out.footer?.right != null ? `content: ${cssString(out.footer.right)};` : `content: "Page " counter(page) " of " counter(pages);`;
    const box = `font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 7pt; color: #7a7a84;`;
    pageCss = `@page {
  size: ${ctx.paper === 'a4' ? 'A4' : 'letter'} ${orientation};
  margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;
  @top-left { content: ${cssString(headerLeft)}; ${box} font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; vertical-align: bottom; padding-bottom: 8pt; }
  @top-right { content: ${cssString(headerRight)}; ${box} vertical-align: bottom; padding-bottom: 8pt; }
  @bottom-left { content: ${cssString(footerLeft)}; ${box} vertical-align: top; padding-top: 8pt; }
  @bottom-center { content: ${cssString(footerCenter)}; ${box} vertical-align: top; padding-top: 8pt; }
  @bottom-right { ${pageNums} ${box} vertical-align: top; padding-top: 8pt; }
}
@media screen { body.pp-screen-flow { width: ${size.w}in; min-height: ${size.h}in; padding: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; } }`;
  }

  const body = renderToStaticMarkup(<>{out.body}</>);
  const watermark = ps.watermark?.trim() ? `<div class="pp-watermark">${escapeHtml(ps.watermark.trim())}</div>` : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${fontFaceCss()}
:root { --pp-accent: ${owner.color || '#6d4aff'}; }
${BASE_PRINT_CSS}
${pageCss}
${out.css ?? ''}
</style>
${READY_SCRIPT}
</head><body class="${mode === 'fixed' ? 'pp-screen-fixed' : 'pp-screen-flow'}${ps.color === false ? ' pp-bw' : ''}">${watermark}${body}</body></html>`;

  const fileName = safeFileName(out.fileName ?? `${owner.title} - ${title}`) + '.pdf';
  return { html, title, fileName, orientation, paper: ctx.paper, out };
}

export function toJob(doc: BuiltDoc): PdfJob {
  return { html: doc.html, fileName: doc.fileName, title: doc.title, paper: doc.paper, landscape: doc.orientation === 'landscape' };
}
