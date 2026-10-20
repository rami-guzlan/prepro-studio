import { Fragment } from 'react';
import type { PrintDocDef } from '@/print/types';
import type { AVRow } from '@/types';
import { KV } from '@/print/components';
import { formatSeconds, parseDuration } from '@/lib/format';
import { RichText, computeTiming, WPM } from './format';

const RICH = { spk: 'avsp-spk', cue: 'avsp-cue', dir: 'avsp-dir' };

const CSS = `
.avsp-title { padding-bottom: 9pt; margin-bottom: 10pt; border-bottom: 2pt solid var(--pp-accent, #6d4aff); }
.avsp-title-row { display: flex; align-items: flex-end; gap: 14pt; }
.avsp-title-main { flex: 1; min-width: 0; }
.avsp-logo { max-height: 36pt; max-width: 120pt; object-fit: contain; }
.avsp-kicker { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6b75; }
.avsp-title h1 { font-size: 20pt; line-height: 1.1; margin: 2pt 0 2pt; letter-spacing: -0.01em; }
.avsp-sub { font-size: 9.5pt; color: #55555e; margin-bottom: 8pt; }
.avsp-runtime { text-align: right; white-space: nowrap; }
.avsp-runtime .v { font-size: 18pt; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
.avsp-runtime .k { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #7a7a84; }
.avsp-runtime .over { color: #c77700; }
.avsp-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.avsp-table thead { display: table-header-group; }
.avsp-table th { text-align: left; font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #2a2a33; background: #efeff3; padding: 5pt 6pt; border-bottom: 1pt solid #9a9aa6; }
.avsp-table th.r, .avsp-table td.r { text-align: right; }
.avsp-table td { padding: 6pt 6pt; vertical-align: top; font-size: 9.2pt; line-height: 1.45; border-bottom: 0.5pt solid #d6d6de; }
.avsp-table tr { break-inside: avoid; page-break-inside: avoid; }
.avsp-table td.avsp-v { border-right: 0.5pt solid #d6d6de; }
.avsp-text { white-space: pre-wrap; word-break: break-word; }
.avsp-num { color: #8a8a94; font-weight: 700; font-size: 8pt; }
.avsp-time, .avsp-run { font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 8.4pt; }
.avsp-run { color: #55555e; }
.avsp-est { color: #8a8a94; font-style: italic; }
.avsp-spk { font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
.avsp-cue { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 8.2pt; color: var(--pp-accent, #6d4aff); }
.avsp-dir { font-style: italic; color: #66666f; }
.avsp-seg td { background: #f2f1f8; border-left: 3pt solid var(--pp-accent, #6d4aff); font-size: 8.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 5pt 7pt; border-bottom: 0.75pt solid #c9c9d1; break-after: avoid; page-break-after: avoid; }
.avsp-seg .t { float: right; font-weight: 700; letter-spacing: 0; color: #55555e; }
.avsp-thumb { width: 100%; aspect-ratio: 16 / 9; background: #ececf1; border-radius: 2pt; overflow: hidden; position: relative; }
.avsp-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.avsp-thumb img.ov { object-fit: contain; }
.avsp-note td { padding-top: 0; }
.avsp-note-text { font-size: 7.6pt; color: #8a6400; font-style: italic; white-space: pre-wrap; }
.avsp-total td { font-weight: 700; border-top: 1pt solid #888; border-bottom: 0; background: #f6f6f9; }
.avsp-legend { margin-top: 6pt; font-size: 7pt; color: #7a7a84; }
`;

export const printDocs: PrintDocDef[] = [
  {
    id: 'av-script',
    title: 'A/V Script',
    group: 'Script',
    orientation: 'portrait',
    description: 'Two-column audio/video script with segment bands, thumbnails, durations and running time',
    options: [
      { key: 'showImages', label: 'Show thumbnails', type: 'boolean', default: true },
      { key: 'showDurations', label: 'Show durations & running time', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Show production notes', type: 'boolean', default: false },
      { key: 'version', label: 'Version', type: 'text', default: '', hint: 'e.g. “Client draft v2” (defaults to the script draft)' },
    ],
    emptyReason: (p) => ((p.script.av?.rows?.length ?? 0) > 0 ? false : 'The A/V script has no rows yet'),
    render: (ctx) => {
      const { project: p, fmt, options } = ctx;
      const av = p.script.av ?? { rows: [] };
      const rows: AVRow[] = av.rows ?? [];
      const timing = computeTiming(rows);
      const target = parseDuration(p.meta.targetRuntime ?? '');
      const img = (r: AVRow): { src: string; overlay?: string } | null => {
        if (r.image) return { src: ctx.asset(r.image) };
        const sh = r.shotId ? p.shots.find((s) => s.id === r.shotId) : undefined;
        if (sh?.image) return { src: ctx.asset(sh.image), overlay: sh.drawing ? ctx.asset(sh.drawing) : undefined };
        return null;
      };
      const showImages = !!options.showImages && rows.some((r) => img(r));
      const showDur = !!options.showDurations;
      const showNotes = !!options.showNotes;
      const colCount = 3 + (showImages ? 1 : 0) + (showDur ? 2 : 0);
      const version = String(options.version || '').trim() || p.script.titlePage?.draft || '';
      const logo = p.settings.print.showLogo && p.meta.logo ? ctx.asset(p.meta.logo) : '';
      let estimatedSoFar = false;

      return {
        css: CSS,
        body: (
          <>
            <div className="avsp-title pp-avoid">
              <div className="avsp-title-row">
                {logo && <img className="avsp-logo" src={logo} alt="" />}
                <div className="avsp-title-main">
                  <div className="avsp-kicker">Audio / Video Script</div>
                  <h1>{p.meta.title || 'Untitled'}</h1>
                  {p.meta.subtitle && <div className="avsp-sub">{p.meta.subtitle}</div>}
                </div>
                {showDur && (
                  <div className="avsp-runtime">
                    <div className="k">Total runtime{timing.estimated ? ' (est.)' : ''}</div>
                    <div className={`v ${target && timing.total > target ? 'over' : ''}`}>{formatSeconds(timing.total) || '0:00'}</div>
                    {target ? <div className="k">Target {formatSeconds(target)}</div> : null}
                  </div>
                )}
              </div>
              <KV
                cols={4}
                style={{ marginTop: '8pt' }}
                items={[
                  ['Client', p.meta.client],
                  ['Version', version],
                  ['Date', ctx.today],
                  ['Production', p.meta.productionCompany],
                  ['Director', p.meta.director],
                  ['Producer', p.meta.producer],
                  ['Writer', p.meta.writer],
                  ['Rows', String(rows.length)],
                ]}
              />
            </div>

            <table className="avsp-table">
              <colgroup>
                <col style={{ width: '22pt' }} />
                {showImages && <col style={{ width: '1.25in' }} />}
                <col />
                <col />
                {showDur && <col style={{ width: '36pt' }} />}
                {showDur && <col style={{ width: '38pt' }} />}
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  {showImages && <th>Frame</th>}
                  <th>{av.videoLabel || 'VIDEO'}</th>
                  <th>{av.audioLabel || 'AUDIO'}</th>
                  {showDur && <th className="r">Time</th>}
                  {showDur && <th className="r">Run</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const t = timing.rows[i];
                  const im = showImages ? img(r) : null;
                  if (t.estimated && t.effective > 0) estimatedSoFar = true;
                  return (
                    <Fragment key={r.id}>
                      {r.segment != null && (
                        <tr className="avsp-seg">
                          <td colSpan={colCount}>
                            {r.segment || 'Segment'}
                            {showDur && timing.segments.get(r.id) ? <span className="t">{formatSeconds(timing.segments.get(r.id)!)}</span> : null}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="avsp-num">{i + 1}</td>
                        {showImages && (
                          <td>
                            {im ? (
                              <div className="avsp-thumb">
                                <img src={im.src} alt="" />
                                {im.overlay && <img className="ov" src={im.overlay} alt="" />}
                              </div>
                            ) : null}
                          </td>
                        )}
                        <td className="avsp-v">
                          <div className="avsp-text">
                            <RichText text={r.video ?? ''} cls={RICH} />
                          </div>
                        </td>
                        <td>
                          <div className="avsp-text">
                            <RichText text={r.audio ?? ''} cls={RICH} />
                          </div>
                        </td>
                        {showDur && (
                          <td className="r avsp-time">
                            {r.duration != null ? formatSeconds(r.duration) : t.suggested != null ? <span className="avsp-est">~{formatSeconds(t.suggested)}</span> : ''}
                          </td>
                        )}
                        {showDur && <td className={`r avsp-run ${estimatedSoFar ? 'avsp-est' : ''}`}>{t.end > 0 ? formatSeconds(t.end) : ''}</td>}
                      </tr>
                      {showNotes && r.notes?.trim() && (
                        <tr className="avsp-note">
                          <td />
                          {showImages && <td />}
                          <td colSpan={2}>
                            <div className="avsp-note-text">Note: {r.notes}</div>
                          </td>
                          {showDur && <td colSpan={2} />}
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {showDur && rows.length > 0 && (
                  <tr className="avsp-total">
                    <td colSpan={colCount - 2}>Total running time{timing.estimated ? ' (includes estimates)' : ''}</td>
                    <td colSpan={2} className="r">
                      {formatSeconds(timing.total) || '0:00'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {showDur && timing.estimated && (
              <div className="avsp-legend">
                ~ Durations in italics are estimated from the audio at {WPM} words per minute. {timing.words} spoken words · {fmt.number(Math.round((timing.words / WPM) * 60))} s of speech.
              </div>
            )}
          </>
        ),
      };
    },
  },
];
