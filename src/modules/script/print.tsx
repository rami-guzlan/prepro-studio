/* Printable script documents: the screenplay (industry layout, exact pages),
   title page, scene report and script notes. */
import { Fragment, type ReactNode } from 'react';
import type { PrintDocDef } from '@/print/types';
import type { TitlePage } from '@/types';
import { paginate, type PLine } from '@/script-core/pagination';
import type { Run } from '@/script-core/paragraphs';
import { DocHeader, PTable } from '@/print/components';
import { STRIP_COLORS } from '@/lib/constants';
import { locationForScene } from '@/derived/project';
import { mindPrintDocs } from './mind/print';

const SCRIPT_CSS = `
.sp-pdf { font-family: 'Courier Prime', 'Courier New', Courier, monospace; font-size: 12pt; line-height: 12pt; color: #000; }
.sp-pdf.cn { font-family: 'Courier New', Courier, monospace; }
.sp-pdf .ln { position: absolute; white-space: pre; height: 12pt; overflow: visible; }
.sp-pdf .b { font-weight: 700; }
.sp-pdf .i { font-style: italic; }
.sp-pdf .u { text-decoration: underline; }
.sp-pdf .hdr { position: absolute; top: 0.5in; font-size: 12pt; white-space: pre; }
.sp-pdf .ftr { position: absolute; bottom: 0.5in; left: 0; right: 0; text-align: center; font-size: 10pt; }
`;

function runsEl(runs: Run[], key: string | number): ReactNode {
  return runs.map((r, i) => {
    const cls = [r.b && 'b', r.i && 'i', r.u && 'u'].filter(Boolean).join(' ');
    return cls ? (
      <span key={`${key}-${i}`} className={cls}>
        {r.text}
      </span>
    ) : (
      r.text
    );
  });
}

function lineEl(ln: PLine, i: number, top: number, bold: boolean): ReactNode {
  const style = {
    top: `${top + ln.row / 6}in`,
    left: `${ln.left}in`,
    width: `${ln.width}in`,
    textAlign: ln.align,
    fontWeight: bold && ln.type === 'scene_heading' && ln.kind === 'text' ? 700 : undefined,
  } as const;
  return (
    <div key={i} className="ln" style={style}>
      {runsEl(ln.runs, i)}
    </div>
  );
}

export function TitlePageSheet({ tp, w, h }: { tp: TitlePage; w: number; h: number }) {
  const lines = (s?: string) => (s ?? '').split('\n');
  return (
    <div className="pp-page sp-pdf" style={{ width: `${w}in`, height: `${h}in` }}>
      <div style={{ position: 'absolute', top: '3.5in', left: '1.5in', right: `${w - 7.5}in`, textAlign: 'center', lineHeight: '12pt' }}>
        <div style={{ textDecoration: 'underline', textTransform: 'uppercase' }}>{tp.title || 'UNTITLED'}</div>
        <div style={{ height: '36pt' }} />
        <div>{tp.credit}</div>
        <div style={{ height: '12pt' }} />
        {lines(tp.authors).map((l, i) => (
          <div key={i}>{l || ' '}</div>
        ))}
        {tp.source && (
          <>
            <div style={{ height: '36pt' }} />
            {lines(tp.source).map((l, i) => (
              <div key={i}>{l || ' '}</div>
            ))}
          </>
        )}
      </div>
      <div style={{ position: 'absolute', bottom: '1in', left: '1.5in', maxWidth: '3.4in', lineHeight: '12pt' }}>
        {lines(tp.contact).map((l, i) => (
          <div key={i}>{l || ' '}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: '1in', right: `${w - 7.5}in`, textAlign: 'right', maxWidth: '3in', lineHeight: '12pt' }}>
        {[tp.draft, tp.draftDate, ...(tp.notes ? lines(tp.notes) : []), tp.copyright].filter(Boolean).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

export const printDocs: PrintDocDef[] = [
  {
    id: 'screenplay',
    title: 'Screenplay',
    group: 'Script',
    description: 'Industry-standard screenplay pages (Courier 12pt) with optional title page and scene numbers.',
    options: [
      { key: 'titlePage', label: 'Include title page', type: 'boolean', default: true },
      {
        key: 'sceneNumbers',
        label: 'Scene numbers',
        type: 'select',
        default: 'project',
        choices: [
          { value: 'project', label: 'As in project settings' },
          { value: 'none', label: 'None' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'both', label: 'Both sides' },
        ],
      },
    ],
    emptyReason: (_p, model) => (model.paras.some((p) => p.text.trim()) ? false : 'The script is empty'),
    render: (ctx) => {
      const p = ctx.project;
      const s = p.settings.script;
      const model = ctx.model;
      const pag = paginate(model.paras, { settings: s, paper: ctx.paper, contdParas: model.contdParas, sceneNumbers: model.sceneNumbers });
      const { pageWidth: w, pageHeight: h, marginTop } = pag.geometry;
      const sn = ctx.options.sceneNumbers === 'project' ? s.sceneNumbers : ctx.options.sceneNumbers;
      const showL = sn === 'left' || sn === 'both';
      const showR = sn === 'right' || sn === 'both';
      const tp = p.script.titlePage;
      const withTitle = ctx.options.titlePage && (tp.title || tp.authors);
      const fontCls = s.font === 'Courier New' ? 'sp-pdf cn' : 'sp-pdf';
      return {
        mode: 'fixed',
        css: SCRIPT_CSS,
        title: tp.title ? `${tp.title}` : 'Screenplay',
        fileName: `${p.meta.title} - Screenplay`,
        body: (
          <>
            {withTitle && <TitlePageSheet tp={tp} w={w} h={h} />}
            {pag.pages.map((page) => (
              <div key={page.number} className={`pp-page ${fontCls}`} style={{ width: `${w}in`, height: `${h}in` }}>
                {s.header && (
                  <div className="hdr" style={{ left: '1.5in' }}>
                    {s.header}
                  </div>
                )}
                {(page.number > 1 || s.firstPageNumber) && (
                  <div className="hdr" style={{ left: `${7.5 - 1}in`, width: '1in', textAlign: 'right' }}>
                    {page.number}.
                  </div>
                )}
                {page.lines.map((ln, i) => (
                  <Fragment key={i}>
                    {lineEl(ln, i, marginTop, s.sceneHeadingBold)}
                    {ln.sceneNum && showL && (
                      <div key={`l${i}`} className="ln" style={{ top: `${marginTop + ln.row / 6}in`, left: '0.6in', width: '0.7in', textAlign: 'right' }}>
                        {ln.sceneNum}
                      </div>
                    )}
                    {ln.sceneNum && showR && (
                      <div key={`r${i}`} className="ln" style={{ top: `${marginTop + ln.row / 6}in`, left: '7.65in' }}>
                        {ln.sceneNum}
                      </div>
                    )}
                  </Fragment>
                ))}
                {s.footer && <div className="ftr">{s.footer}</div>}
              </div>
            ))}
          </>
        ),
      };
    },
  },
  {
    id: 'title-page',
    title: 'Title Page',
    group: 'Script',
    description: 'The screenplay title page on its own.',
    render: (ctx) => {
      const w = ctx.paper === 'a4' ? 8.27 : 8.5;
      const h = ctx.paper === 'a4' ? 11.69 : 11;
      return { mode: 'fixed', css: SCRIPT_CSS, body: <TitlePageSheet tp={ctx.project.script.titlePage} w={w} h={h} /> };
    },
  },
  {
    id: 'scene-report',
    title: 'Scene Report',
    group: 'Script',
    orientation: 'landscape',
    description: 'Every scene with page, length, cast, location and synopsis.',
    options: [{ key: 'withSynopsis', label: 'Include synopsis', type: 'boolean', default: true }],
    emptyReason: (_p, m) => (m.scenes.length ? false : 'No scenes yet'),
    render: (ctx) => {
      const { model, project: p, fmt } = ctx;
      const chars = new Map(p.characters.map((c) => [c.id, c]));
      return {
        body: (
          <>
            <DocHeader ctx={ctx} title="Scene Report" subtitle={`${model.scenes.length} scenes · ${model.pageCount} pages · approx. ${Math.round(model.estMinutes)} min`} />
            <PTable
              zebra
              rows={model.scenes}
              columns={[
                { header: 'Sc.', width: '5%', cell: (s) => <b>{s.number}</b> },
                {
                  header: 'I/E · D/N',
                  width: '9%',
                  cell: (s) => (
                    <span className="pp-badge" style={{ background: (STRIP_COLORS[s.stripKey] ?? STRIP_COLORS.OTHER).bg, border: '0.5pt solid #bbb' }}>
                      {s.intExt || '—'} {s.dayNight || ''}
                    </span>
                  ),
                },
                { header: 'Set', width: '20%', cell: (s) => s.set || s.heading },
                { header: 'Page', width: '5%', num: true, cell: (s) => s.page },
                { header: 'Length', width: '6%', num: true, cell: (s) => fmt.eighths(s.eighths) },
                {
                  header: 'Cast',
                  width: '17%',
                  cell: (s) =>
                    s.characterIds
                      .map((id) => chars.get(id))
                      .filter(Boolean)
                      .map((c) => (c!.number ? `${c!.number}. ${c!.name}` : c!.name))
                      .join(', '),
                },
                { header: 'Location', width: '14%', cell: (s) => locationForScene(p, s)?.name ?? '' },
                ...(ctx.options.withSynopsis ? [{ header: 'Synopsis', cell: (s: (typeof model.scenes)[number]) => s.synopsis || s.firstAction.slice(0, 160) }] : []),
              ]}
            />
          </>
        ),
      };
    },
  },
  {
    id: 'script-notes',
    title: 'Script Notes',
    group: 'Script',
    description: 'All script notes with the text they are attached to.',
    options: [{ key: 'includeResolved', label: 'Include resolved notes', type: 'boolean', default: false }],
    emptyReason: (p) => (Object.keys(p.script.notes).length ? false : 'No script notes'),
    render: (ctx) => {
      const { project: p, model, fmt } = ctx;
      // find anchor text + scene for each note
      const anchors = new Map<string, { text: string; scene: string }>();
      model.paras.forEach((para, i) => {
        for (const r of para.runs) {
          for (const id of r.notes ?? []) {
            const a = anchors.get(id);
            const sIdx = model.sceneOfPara[i];
            const scene = sIdx >= 0 ? `${model.scenes[sIdx].number}. ${model.scenes[sIdx].heading}` : '';
            if (a) a.text += r.text;
            else anchors.set(id, { text: r.text, scene });
          }
        }
      });
      const notes = Object.values(p.script.notes).filter((n) => ctx.options.includeResolved || !n.resolved);
      return {
        body: (
          <>
            <DocHeader ctx={ctx} title="Script Notes" subtitle={`${notes.length} notes`} />
            <PTable
              rows={notes}
              columns={[
                { header: 'Scene', width: '22%', cell: (n) => anchors.get(n.id)?.scene ?? '' },
                { header: 'On text', width: '28%', cell: (n) => <i>“{(anchors.get(n.id)?.text ?? '').slice(0, 160)}”</i> },
                { header: 'Note', cell: (n) => <span className="pp-pre">{n.text}</span> },
                { header: 'Status', width: '9%', cell: (n) => (n.resolved ? 'Resolved' : 'Open') },
                { header: 'Date', width: '10%', cell: (n) => fmt.date(n.createdAt.slice(0, 10)) },
              ]}
            />
          </>
        ),
      };
    },
  },
  ...mindPrintDocs,
];
