/* Printable blank templates (for planning on paper, on set, or in meetings). */
import { Fragment, type ReactNode } from 'react';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { DocHeader } from '@/print/components';

const BLANK_CSS = `
.bt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.bt-table th { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #3a3a44; background: #efeff3; border: 0.75pt solid #b9b9c3; padding: 4pt 5pt; text-align: left; }
.bt-table td { border: 0.75pt solid #c9c9d1; vertical-align: top; padding: 3pt 5pt; }
.bt-table tr { break-inside: avoid; page-break-inside: avoid; }
.bt-band td { background: #f4f4f7; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #55555e; height: 16pt; }
.bt-ruled { background: repeating-linear-gradient(to bottom, transparent 0, transparent 17pt, #d9d9e0 17pt, #d9d9e0 17.6pt); }
.bt-label { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; margin-bottom: 2pt; }
.bt-fields { display: grid; gap: 8pt 14pt; margin-bottom: 12pt; }
.bt-field { border-bottom: 0.75pt solid #9a9aa6; height: 20pt; }
.bt-beat { border: 0.75pt solid #b9b9c3; border-radius: 4pt; margin-bottom: 8pt; break-inside: avoid; page-break-inside: avoid; }
.bt-beat-head { display: flex; align-items: baseline; gap: 10pt; padding: 4pt 8pt; background: #f4f4f7; border-bottom: 0.75pt solid #c9c9d1; }
.bt-beat-head b { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
.bt-beat-head span { font-size: 7pt; color: #707078; }
.bt-beat-body { display: grid; grid-template-columns: 1fr 1fr 0.55fr; }
.bt-beat-body > div { padding: 4pt 8pt; border-right: 0.75pt solid #dcdce2; }
.bt-beat-body > div:last-child { border-right: 0; }
.bt-line { height: 17pt; border-bottom: 0.6pt solid #d0d0d8; }
.bt-check { display: inline-block; width: 8pt; height: 8pt; border: 0.75pt solid #555; border-radius: 1.5pt; vertical-align: -1pt; margin-right: 4pt; }
`;

function header(ctx: PrintContext, title: string, subtitle?: string): ReactNode {
  return ctx.options.withProject === false ? (
    <div className="pp-doc-header">
      <div className="pp-titles">
        <h1>{title}</h1>
        {subtitle && <div className="pp-sub">{subtitle}</div>}
      </div>
      <div className="pp-meta">Date: ____________</div>
    </div>
  ) : (
    <DocHeader ctx={ctx} title={title} subtitle={subtitle} meta="Date: ____________" />
  );
}

function fields(labels: string[], cols: number): ReactNode {
  return (
    <div className="bt-fields" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {labels.map((l) => (
        <div key={l}>
          <div className="bt-label">{l}</div>
          <div className="bt-field" />
        </div>
      ))}
    </div>
  );
}

function Lines({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="bt-line" />
      ))}
    </>
  );
}

const range = (n: number) => Array.from({ length: Math.max(1, Math.min(200, n)) }, (_, i) => i);

const projectOption = { key: 'withProject', label: 'Show project name & logo', type: 'boolean' as const, default: true };

const TRAILER_BEATS: [string, string][] = [
  ['Hook', '0:00 – 0:10'],
  ['Setup', '0:10 – 0:30'],
  ['Inciting moment', '0:30 – 0:45'],
  ['Escalation / montage', '0:45 – 1:20'],
  ['Climax / quote cards', '1:20 – 1:35'],
  ['Title', '1:35 – 1:40'],
  ['Button', '1:40 – 1:50'],
  ['End card', '1:50 – 2:00'],
];

export const printDocs: PrintDocDef[] = [
  {
    id: 'blank-av-script',
    title: 'Blank A/V Script',
    group: 'Blank Templates',
    orientation: 'portrait',
    description: 'Empty two-column script (picture / sound) with time and frame columns — for writing by hand or in meetings.',
    options: [
      projectOption,
      { key: 'rows', label: 'Rows', type: 'number', default: 24, min: 4, max: 120 },
      { key: 'frames', label: 'Include sketch-frame column', type: 'boolean', default: true },
    ],
    render: (ctx) => {
      const rows = range(Number(ctx.options.rows) || 24);
      return {
        css: BLANK_CSS,
        body: (
          <>
            {header(ctx, 'A/V Script', 'Version ______   Writer ______________   Target runtime ______')}
            <table className="bt-table">
              <colgroup>
                <col style={{ width: '5%' }} />
                {ctx.options.frames && <col style={{ width: '17%' }} />}
                <col />
                <col />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  {ctx.options.frames && <th>Frame</th>}
                  <th>Video / picture</th>
                  <th>Audio / VO / dialogue</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <Fragment key={i}>
                    {i % 6 === 0 && (
                      <tr className="bt-band">
                        <td colSpan={ctx.options.frames ? 5 : 4}>Segment: ________________________________</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ height: '62pt', color: '#999', fontSize: '7pt' }}>{i + 1}</td>
                      {ctx.options.frames && <td style={{ padding: '4pt' }}><div style={{ border: '0.75pt solid #bbb', aspectRatio: '16 / 9' }} /></td>}
                      <td className="bt-ruled" />
                      <td className="bt-ruled" />
                      <td />
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </>
        ),
      };
    },
  },
  {
    id: 'blank-trailer-beats',
    title: 'Trailer Beat Sheet',
    group: 'Blank Templates',
    orientation: 'portrait',
    description: 'Classic trailer structure — hook, setup, escalation, title, button, end card — with space for picture, sound and timing.',
    options: [projectOption, { key: 'runtime', label: 'Runtime label', type: 'text', default: '2:00' }],
    render: (ctx) => ({
      css: BLANK_CSS,
      body: (
        <>
          {header(ctx, 'Trailer Beat Sheet', `Runtime ${ctx.options.runtime || '____'}   ·   Version ______   ·   Music track ____________________`)}
          {fields(['Goal / audience', 'Platforms & cutdowns', 'Key line / CTA'], 3)}
          {TRAILER_BEATS.map(([beat, t]) => (
            <div key={beat} className="bt-beat">
              <div className="bt-beat-head">
                <b>{beat}</b>
                <span>approx. {t}</span>
              </div>
              <div className="bt-beat-body">
                <div>
                  <div className="bt-label">Picture / shots</div>
                  <Lines n={3} />
                </div>
                <div>
                  <div className="bt-label">Sound / VO / dialogue / music</div>
                  <Lines n={3} />
                </div>
                <div>
                  <div className="bt-label">Timing · source TC</div>
                </div>
              </div>
            </div>
          ))}
        </>
      ),
    }),
  },
  {
    id: 'blank-interview-sheet',
    title: 'Interview Sheet',
    group: 'Blank Templates',
    orientation: 'portrait',
    description: 'For mini-docs and interviews: subject details, release check, numbered questions with space for soundbites and timecodes.',
    options: [projectOption, { key: 'questions', label: 'Questions', type: 'number', default: 12, min: 3, max: 60 }],
    render: (ctx) => (
      {
        css: BLANK_CSS,
        body: (
          <>
            {header(ctx, 'Interview Sheet', 'Mini-doc / documentary interview')}
            {fields(['Subject name', 'Role / title (lower third)', 'Phone / email', 'Location', 'Date & time', 'Card / clip names'], 3)}
            <div style={{ marginBottom: '10pt', fontSize: '8.5pt' }}>
              <span className="bt-check" />Release signed &nbsp;&nbsp; <span className="bt-check" />Lav + boom recorded &nbsp;&nbsp; <span className="bt-check" />Room tone (30 s) &nbsp;&nbsp;{' '}
              <span className="bt-check" />B-roll of subject &nbsp;&nbsp; <span className="bt-check" />Photos / archival collected
            </div>
            <table className="bt-table">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '40%' }} />
                <col />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Soundbite notes</th>
                  <th>TC in</th>
                </tr>
              </thead>
              <tbody>
                {range(Number(ctx.options.questions) || 12).map((i) => (
                  <tr key={i}>
                    <td style={{ height: '54pt', color: '#999', fontSize: '7pt' }}>{i + 1}</td>
                    <td className="bt-ruled" />
                    <td className="bt-ruled" />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ),
      }
    ),
  },
  {
    id: 'blank-shot-list',
    title: 'Blank Shot List',
    group: 'Blank Templates',
    orientation: 'landscape',
    description: 'Empty shot list with the standard columns and on-set tick boxes.',
    options: [projectOption, { key: 'rows', label: 'Rows', type: 'number', default: 20, min: 5, max: 150 }],
    render: (ctx) => ({
      css: BLANK_CSS,
      body: (
        <>
          {header(ctx, 'Shot List', 'Scene ______   ·   Location ____________________   ·   Shoot day ______')}
          <table className="bt-table">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>✓</th>
                <th>Sc.</th>
                <th>Shot</th>
                <th>Description</th>
                <th>Size</th>
                <th>Angle</th>
                <th>Movement</th>
                <th>Lens</th>
                <th>Equipment</th>
                <th>Takes</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {range(Number(ctx.options.rows) || 20).map((i) => (
                <tr key={i}>
                  <td style={{ height: '22pt' }}>
                    <span className="bt-check" />
                  </td>
                  {Array.from({ length: 10 }, (_, k) => (
                    <td key={k} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    }),
  },
];
