/* Printable schedule documents: shooting schedule, one-liner, stripboard, DOOD. */
import { Fragment } from 'react';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { DocHeader } from '@/print/components';
import type { ID, ProjectData } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { locationForScene } from '@/derived/project';
import { CATEGORY_BY_ID } from '@/lib/constants';
import { formatEighths, formatMinutes } from '@/lib/format';
import { weekdayShort } from '@/lib/dates';
import { plural } from '@/lib/text';
import {
  DOOD_LEGEND,
  DOOD_STYLE,
  boneyardScenes,
  castNumbers,
  compareCharacters,
  computeDays,
  computeDood,
  dayNightLabel,
  elementsByCategory,
  intExtLabel,
  readableText,
  sceneSynopsis,
  stripColor,
  type DayRow,
} from './logic';

/* ---------------------------------------------------------------- shared */

function prep(ctx: PrintContext) {
  const p = ctx.project;
  const rows = computeDays(p, ctx.model);
  const charById = new Map(p.characters.map((c) => [c.id, c]));
  const castById = new Map(p.cast.map((c) => [c.id, c]));
  return { p, rows, charById, castById };
}

function noDays(p: ProjectData): string | false {
  return p.schedule?.days?.length ? false : 'No shoot days yet — add days in the Shooting Schedule.';
}

function dateRange(ctx: PrintContext, rows: DayRow[]): string {
  const d = rows.filter((r) => r.date).map((r) => r.date!).sort();
  if (!d.length) return '';
  return d[0] === d[d.length - 1] ? ctx.fmt.dateMedium(d[0]) : `${ctx.fmt.dateMedium(d[0])} – ${ctx.fmt.dateMedium(d[d.length - 1])}`;
}

function summary(ctx: PrintContext, rows: DayRow[], model: ScriptModel): string {
  const scenes = rows.reduce((n, r) => n + r.scenes.length, 0);
  const pages = rows.reduce((n, r) => n + r.eighths, 0);
  return [plural(rows.length, 'shoot day'), dateRange(ctx, rows), `${scenes} of ${plural(model.scenes.length, 'scene')}`, `${formatEighths(pages)} pages`].filter(Boolean).join(' · ');
}

function dayHeading(ctx: PrintContext, r: DayRow): string {
  return `${ctx.fmt.dateLong(r.date) || 'Date to be confirmed'}${r.day.label ? ` · ${r.day.label}` : ''}`;
}

function dayTotals(r: DayRow): string {
  return [plural(r.scenes.length, 'scene'), `${formatEighths(r.eighths)} pages`, r.minutes ? `est. ${formatMinutes(r.minutes)}` : ''].filter(Boolean).join(' · ');
}

function Banner({ text, color, colSpan }: { text: string; color?: string; colSpan?: number }) {
  const bg = color || '#868e96';
  const style = { background: bg, color: readableText(bg) };
  if (colSpan) {
    return (
      <tr className="pps-banner-row">
        <td colSpan={colSpan} style={style}>
          {text}
        </td>
      </tr>
    );
  }
  return (
    <div className="pps-banner pp-avoid" style={style}>
      {text}
    </div>
  );
}

const BASE_CSS = `
.pps-dayhead { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; background: #16161c; color: #fff; padding: 5pt 8pt; margin-top: 12pt; border-radius: 2pt; break-after: avoid; page-break-after: avoid; }
.pps-dayhead .pps-dn { font-size: 11pt; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }
.pps-dayhead .pps-dd { font-size: 9pt; font-weight: 600; flex: 1; }
.pps-dayhead .pps-dt { font-size: 8pt; white-space: nowrap; opacity: 0.85; }
.pps-daynotes { font-size: 8pt; font-style: italic; color: #444; padding: 4pt 8pt; background: #f4f4f7; border-left: 2pt solid #16161c; white-space: pre-wrap; break-after: avoid; page-break-after: avoid; }
.pps-banner { margin: 4pt 0; padding: 3pt 8pt; font-weight: 800; font-size: 8pt; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 2pt; }
.pps-eod { margin: 4pt 0 0; padding: 4pt 8pt; border-top: 1.5pt solid #16161c; border-bottom: 1.5pt solid #16161c; font-weight: 800; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; break-before: avoid; page-break-before: avoid; }
.pps-castbox { display: inline-block; min-width: 11pt; padding: 0 2pt; margin: 0 1pt 1pt 0; border: 0.6pt solid #333; border-radius: 1.5pt; font-size: 7pt; font-weight: 700; text-align: center; line-height: 10pt; background: rgba(255,255,255,0.7); }
`;

/* ---------------------------------------------------------------- shooting schedule */

function SceneBlock({ ctx, s, opts, charById, castById }: { ctx: PrintContext; s: SceneInfo; opts: Record<string, any>; charById: Map<ID, any>; castById: Map<ID, any> }) {
  const p = ctx.project;
  const col = stripColor(s);
  const loc = locationForScene(p, s);
  const cast = castNumbers(s, charById, castById);
  const groups = opts.showElements ? elementsByCategory(s, p.elements) : [];
  const syn = sceneSynopsis(s);
  const extras = s.meta?.extras?.trim();
  const castCat = CATEGORY_BY_ID.cast;
  const extrasCat = CATEGORY_BY_ID.extras;
  return (
    <div className="pps-scene pp-avoid">
      <div className="pps-scene-top">
        <div className="pps-sc" style={{ background: col.bg, color: col.fg }}>
          <div className="pps-sc-l">Scene</div>
          <div className="pps-sc-n">{s.number}</div>
        </div>
        <div className="pps-scene-main">
          <div className="pps-heading">
            <span>{intExtLabel(s)}</span> {s.set || 'UNTITLED SET'} <span className="pps-heading-dn">— {dayNightLabel(s) || '—'}</span>
          </div>
          {opts.showSynopsis && syn && <div className="pps-syn">{syn}</div>}
          {loc && (
            <div className="pps-loc">
              <b>Location:</b> {loc.name}
              {loc.address ? ` — ${loc.address}` : ''}
            </div>
          )}
        </div>
        <div className="pps-scene-side">
          <div>
            <b>{formatEighths(s.eighths)}</b> pgs
          </div>
          {s.meta?.estMinutes ? <div>est. {formatMinutes(s.meta.estMinutes)}</div> : null}
          <div className="pp-muted">
            p. {s.page}
            {s.meta?.scriptDay ? ` · ${s.meta.scriptDay}` : ''}
          </div>
        </div>
      </div>
      {(cast.length > 0 || extras || groups.length > 0) && (
        <div className="pps-cats">
          {cast.length > 0 && (
            <div className="pps-cat">
              <div className="pps-cat-h" style={{ borderColor: castCat.color }}>
                <span className="pps-catdot" style={{ background: castCat.color }} />
                Cast
              </div>
              {cast.map((c) => (
                <div key={c.id}>
                  <b>{c.label}.</b> {c.name}
                  {c.actor ? <span className="pp-muted"> ({c.actor})</span> : null}
                </div>
              ))}
            </div>
          )}
          {extras && (
            <div className="pps-cat">
              <div className="pps-cat-h" style={{ borderColor: extrasCat.color }}>
                <span className="pps-catdot" style={{ background: extrasCat.color }} />
                Background
              </div>
              <div>{extras}</div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.cat.id} className="pps-cat">
              <div className="pps-cat-h" style={{ borderColor: g.cat.color }}>
                <span className="pps-catdot" style={{ background: g.cat.color }} />
                {g.cat.label}
              </div>
              {g.items.map((e) => (
                <div key={e.id}>
                  {e.name}
                  {e.quantity && e.quantity > 1 ? ` ×${e.quantity}` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {opts.showNotes && s.meta?.notes?.trim() && <div className="pps-scene-notes">Notes: {s.meta.notes.trim()}</div>}
    </div>
  );
}

const SHOOTING_CSS = `${BASE_CSS}
.pps-scene { border: 0.75pt solid #c4c4cc; border-radius: 3pt; margin-top: 5pt; overflow: hidden; }
.pps-scene-top { display: flex; align-items: stretch; }
.pps-sc { width: 46pt; flex-shrink: 0; text-align: center; padding: 4pt 2pt; border-right: 0.75pt solid #c4c4cc; }
.pps-sc-l { font-size: 5.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
.pps-sc-n { font-size: 15pt; font-weight: 800; line-height: 1.05; }
.pps-scene-main { flex: 1; min-width: 0; padding: 4pt 8pt; }
.pps-heading { font-size: 9.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; }
.pps-heading-dn { font-weight: 700; }
.pps-syn { font-size: 8.4pt; margin-top: 1.5pt; }
.pps-loc { font-size: 7.6pt; color: #444; margin-top: 2pt; }
.pps-scene-side { width: 70pt; flex-shrink: 0; text-align: right; padding: 4pt 8pt; font-size: 8pt; border-left: 0.5pt solid #e0e0e6; }
.pps-scene-side b { font-size: 10pt; }
.pps-cats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4pt 10pt; padding: 5pt 8pt 6pt; border-top: 0.5pt solid #e0e0e6; background: #fbfbfd; font-size: 7.6pt; }
.pps-cat-h { font-size: 6.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #333; border-bottom: 1.2pt solid; padding-bottom: 1pt; margin-bottom: 2pt; }
.pps-catdot { display: inline-block; width: 5pt; height: 5pt; border-radius: 50%; margin-right: 3pt; vertical-align: 0.5pt; }
.pps-scene-notes { font-size: 7.6pt; padding: 3pt 8pt 4pt; border-top: 0.5pt dashed #ccc; color: #444; white-space: pre-wrap; }
.pps-unsched-h { margin-top: 16pt; }
`;

function renderShootingSchedule(ctx: PrintContext) {
  const { p, rows, charById, castById } = prep(ctx);
  const o = ctx.options;
  const unscheduled = o.includeUnscheduled ? boneyardScenes(p.schedule, ctx.model) : [];
  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Shooting Schedule" subtitle={summary(ctx, rows, ctx.model)} />
        {rows.map((r) => (
          <div key={r.day.id} className={o.pageBreak && r.index > 0 ? 'pp-break-before' : undefined}>
            <div className="pps-dayhead">
              <span className="pps-dn">
                Day {r.number} of {r.total}
              </span>
              <span className="pps-dd">{dayHeading(ctx, r)}</span>
              <span className="pps-dt">{dayTotals(r)}</span>
            </div>
            {o.showNotes && r.day.notes?.trim() && <div className="pps-daynotes">{r.day.notes.trim()}</div>}
            {r.day.items.map((it) => {
              if (it.type === 'banner') return <Banner key={it.id} text={it.text} color={it.color} />;
              const s = ctx.model.sceneById.get(it.sceneId);
              return s ? <SceneBlock key={it.id} ctx={ctx} s={s} opts={o} charById={charById} castById={castById} /> : null;
            })}
            {r.scenes.length === 0 && <div className="pp-muted pp-small" style={{ padding: '6pt 8pt' }}>No scenes scheduled.</div>}
            <div className="pps-eod">
              <span>
                End of Day {r.number}
                {r.date ? ` — ${ctx.fmt.dateMedium(r.date)}` : ''}
              </span>
              <span>
                {formatEighths(r.eighths)} pages{r.minutes ? ` · est. ${formatMinutes(r.minutes)}` : ''}
              </span>
            </div>
          </div>
        ))}
        {unscheduled.length > 0 && (
          <div className="pp-break-before">
            <div className="pps-dayhead pps-unsched-h">
              <span className="pps-dn">Unscheduled</span>
              <span className="pps-dd">Boneyard</span>
              <span className="pps-dt">
                {plural(unscheduled.length, 'scene')} · {formatEighths(unscheduled.reduce((n, s) => n + s.eighths, 0))} pages
              </span>
            </div>
            {unscheduled.map((s) => (
              <SceneBlock key={s.id} ctx={ctx} s={s} opts={o} charById={charById} castById={castById} />
            ))}
          </div>
        )}
      </>
    ),
    css: SHOOTING_CSS,
  };
}

/* ---------------------------------------------------------------- one-liner */

const ONE_LINER_CSS = `${BASE_CSS}
.pps-ol { width: 100%; border-collapse: collapse; font-size: 7.8pt; }
.pps-ol th { text-align: left; font-size: 6.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 3pt 4pt; border-bottom: 1pt solid #16161c; }
.pps-ol thead { display: table-header-group; }
.pps-ol td { padding: 2.6pt 4pt; border-bottom: 0.5pt solid #dcdce2; vertical-align: top; }
.pps-ol tr { break-inside: avoid; page-break-inside: avoid; }
.pps-ol td.sc { font-weight: 800; text-align: center; border-left: 4pt solid; white-space: nowrap; }
.pps-ol td.set b { text-transform: uppercase; }
.pps-ol td.set .s { color: #555; }
.pps-ol td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pps-ol tr.day td { background: #16161c; color: #fff; font-weight: 800; font-size: 8pt; padding: 4pt 6pt; letter-spacing: 0.03em; }
.pps-ol tr.day td span { font-weight: 500; opacity: 0.85; }
.pps-ol tr.eod td { border-top: 1.2pt solid #16161c; border-bottom: 1.2pt solid #16161c; font-weight: 800; font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.04em; background: #f1f1f5; }
.pps-ol tr.pps-banner-row td { font-weight: 800; font-size: 7.2pt; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; }
.pps-ol tr.notes td { font-style: italic; color: #444; background: #f7f7fa; }
.pps-ol tr.spacer td { border: 0; height: 8pt; padding: 0; }
`;

function renderOneLiner(ctx: PrintContext) {
  const { p, rows, charById } = prep(ctx);
  const o = ctx.options;
  const cols = 8;
  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="One-Liner" subtitle={summary(ctx, rows, ctx.model)} />
        <table className="pps-ol">
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '5%' }} />
            <col />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Sc</th>
              <th>I/E</th>
              <th>Set / synopsis</th>
              <th>D/N</th>
              <th style={{ textAlign: 'right' }}>Pgs</th>
              <th>Cast</th>
              <th style={{ textAlign: 'right' }}>Est.</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.day.id}>
                {r.index > 0 && (
                  <tr className="spacer">
                    <td colSpan={cols} />
                  </tr>
                )}
                <tr className="day">
                  <td colSpan={cols}>
                    DAY {r.number} OF {r.total} — {dayHeading(ctx, r).toUpperCase()} <span>· {dayTotals(r)}</span>
                  </td>
                </tr>
                {o.showNotes && r.day.notes?.trim() && (
                  <tr className="notes">
                    <td colSpan={cols}>{r.day.notes.trim()}</td>
                  </tr>
                )}
                {r.day.items.map((it) => {
                  if (it.type === 'banner') return <Banner key={it.id} text={it.text} color={it.color} colSpan={cols} />;
                  const s = ctx.model.sceneById.get(it.sceneId);
                  if (!s) return null;
                  const col = stripColor(s);
                  const syn = sceneSynopsis(s);
                  return (
                    <tr key={it.id}>
                      <td className="sc" style={{ borderLeftColor: col.bg === '#ffffff' ? '#c9c9d1' : col.bg }}>
                        {s.number}
                      </td>
                      <td>{intExtLabel(s)}</td>
                      <td className="set">
                        <b>{s.set || 'UNTITLED SET'}</b>
                        {o.showSynopsis && syn ? <span className="s"> — {syn}</span> : null}
                      </td>
                      <td>{dayNightLabel(s)}</td>
                      <td className="num">{formatEighths(s.eighths)}</td>
                      <td>{castNumbers(s, charById).map((c) => c.label).join(', ')}</td>
                      <td className="num">{s.meta?.estMinutes ? formatMinutes(s.meta.estMinutes) : ''}</td>
                      <td>{locationForScene(p, s)?.name ?? ''}</td>
                    </tr>
                  );
                })}
                <tr className="eod">
                  <td colSpan={4}>
                    End of Day {r.number}
                    {r.date ? ` — ${ctx.fmt.dateShort(r.date)}` : ''}
                  </td>
                  <td className="num">{formatEighths(r.eighths)}</td>
                  <td />
                  <td className="num">{r.minutes ? formatMinutes(r.minutes) : ''}</td>
                  <td>{plural(r.scenes.length, 'scene')}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        <CastLegend ctx={ctx} rows={rows} />
      </>
    ),
    css: ONE_LINER_CSS + LEGEND_CSS,
  };
}

const LEGEND_CSS = `
.pps-legend { margin-top: 10pt; font-size: 7.4pt; display: flex; flex-wrap: wrap; gap: 2pt 12pt; break-inside: avoid; page-break-inside: avoid; }
.pps-legend-h { width: 100%; font-size: 6.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin-bottom: 1pt; }
`;

function CastLegend({ ctx, rows }: { ctx: PrintContext; rows: DayRow[] }) {
  const ids = new Set(rows.flatMap((r) => r.characterIds));
  const chars = ctx.project.characters.filter((c) => ids.has(c.id)).sort(compareCharacters);
  if (!chars.length) return null;
  return (
    <div className="pps-legend">
      <div className="pps-legend-h">Cast</div>
      {chars.map((c) => {
        const actor = c.castId ? ctx.project.cast.find((m) => m.id === c.castId)?.name : undefined;
        return (
          <span key={c.id}>
            <b>{c.number ?? c.name.slice(0, 3)}</b> {c.name}
            {actor ? ` (${actor})` : ''}
          </span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- stripboard */

const STRIP_CSS = `${BASE_CSS}${LEGEND_CSS}
.pps-sb { width: 100%; border-collapse: separate; border-spacing: 0 1.6pt; font-size: 7.6pt; }
.pps-sb thead { display: table-header-group; }
.pps-sb th { text-align: left; font-size: 6.2pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 2pt 3pt; border-bottom: 1pt solid #16161c; white-space: nowrap; }
.pps-sb th.cn { text-align: center; padding: 2pt 0; }
.pps-sb tr { break-inside: avoid; page-break-inside: avoid; }
.pps-sb td { padding: 2.4pt 3pt; vertical-align: middle; border-top: 0.6pt solid rgba(0,0,0,0.28); border-bottom: 0.6pt solid rgba(0,0,0,0.28); }
.pps-sb tr.strip td:first-child { border-left: 0.6pt solid rgba(0,0,0,0.28); border-radius: 2pt 0 0 2pt; }
.pps-sb tr.strip td:last-child { border-right: 0.6pt solid rgba(0,0,0,0.28); border-radius: 0 2pt 2pt 0; }
.pps-sb td.sc { font-weight: 800; font-size: 9pt; text-align: center; white-space: nowrap; }
.pps-sb td.ie, .pps-sb td.dn { font-weight: 700; font-size: 7pt; white-space: nowrap; }
.pps-sb td.set b { text-transform: uppercase; }
.pps-sb td.set .s { opacity: 0.75; }
.pps-sb td.num { text-align: right; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pps-sb td.cn { text-align: center; padding: 2pt 0; font-weight: 800; font-size: 7pt; border-left: 0.4pt solid rgba(0,0,0,0.12); }
.pps-sb tr.day td { background: #16161c; color: #fff; font-weight: 800; font-size: 7.6pt; letter-spacing: 0.04em; text-transform: uppercase; padding: 3pt 6pt; border-color: #16161c; }
.pps-sb tr.day td span { font-weight: 500; opacity: 0.85; text-transform: none; letter-spacing: 0; }
.pps-sb tr.pps-banner-row td { font-weight: 800; font-size: 7pt; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; border: 0.6pt solid rgba(0,0,0,0.28); border-radius: 2pt; }
.pps-sb tr.eod td { background: #16161c; color: #fff; font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2pt 6pt; }
.pps-sb tr.gap td { border: 0; height: 5pt; padding: 0; background: transparent; }
.pps-colors { margin-top: 8pt; display: flex; gap: 10pt; font-size: 7pt; flex-wrap: wrap; }
.pps-colors span { display: inline-flex; align-items: center; gap: 3pt; }
.pps-colors i { display: inline-block; width: 9pt; height: 9pt; border: 0.6pt solid #888; border-radius: 1.5pt; }
`;

function renderStripboard(ctx: PrintContext) {
  const { p, rows, charById } = prep(ctx);
  const o = ctx.options;
  const bone = o.includeUnscheduled ? boneyardScenes(p.schedule, ctx.model) : [];
  const usedIds = new Set([...rows.flatMap((r) => r.characterIds), ...bone.flatMap((s) => s.characterIds)]);
  const chars = p.characters.filter((c) => usedIds.has(c.id)).sort(compareCharacters);
  const positional = o.castColumns && chars.length > 0 && chars.length <= 30;
  const baseCols = 6 + (o.showLocation ? 1 : 0) + 1; // sc, ie, set, dn, pgs, est, (loc), cast-list
  const cols = baseCols - (positional ? 1 : 0) + (positional ? chars.length : 0);

  const strip = (s: SceneInfo, key: string) => {
    const col = stripColor(s);
    const st = { background: col.bg, color: col.fg };
    const inScene = new Set(s.characterIds);
    const syn = sceneSynopsis(s);
    return (
      <tr key={key} className="strip">
        <td className="sc" style={st}>
          {s.number}
        </td>
        <td className="ie" style={st}>
          {intExtLabel(s)}
        </td>
        <td className="set" style={st}>
          <b>{s.set || 'UNTITLED SET'}</b>
          {o.showSynopsis && syn ? <span className="s"> — {syn}</span> : null}
        </td>
        <td className="dn" style={st}>
          {dayNightLabel(s)}
        </td>
        <td className="num" style={st}>
          {formatEighths(s.eighths)}
        </td>
        {positional ? (
          chars.map((c) => (
            <td key={c.id} className="cn" style={st}>
              {inScene.has(c.id) ? (c.number ?? '•') : ''}
            </td>
          ))
        ) : (
          <td style={st}>
            {castNumbers(s, charById).map((c) => (
              <span key={c.id} className="pps-castbox">
                {c.label}
              </span>
            ))}
          </td>
        )}
        <td className="num" style={st}>
          {s.meta?.estMinutes ? formatMinutes(s.meta.estMinutes) : ''}
        </td>
        {o.showLocation && <td style={st}>{locationForScene(p, s)?.name ?? ''}</td>}
      </tr>
    );
  };

  const legendColors: [string, string][] = [
    ['#ffffff', 'Int. Day'],
    ['#fff3a3', 'Ext. Day'],
    ['#a9c8ff', 'Int. Night'],
    ['#a8e6b4', 'Ext. Night'],
    ['#ffd6e7', 'Int. Dawn/Dusk'],
    ['#ffc9a8', 'Ext. Dawn/Dusk'],
  ];

  return {
    orientation: 'landscape' as const,
    body: (
      <>
        <DocHeader ctx={ctx} title="Stripboard" subtitle={summary(ctx, rows, ctx.model)} />
        <table className="pps-sb">
          <colgroup>
            <col style={{ width: '4.5%' }} />
            <col style={{ width: '3.5%' }} />
            <col />
            <col style={{ width: '5%' }} />
            <col style={{ width: '4.5%' }} />
            {positional ? chars.map((c) => <col key={c.id} style={{ width: '1.9%' }} />) : <col style={{ width: '14%' }} />}
            <col style={{ width: '5%' }} />
            {o.showLocation && <col style={{ width: '14%' }} />}
          </colgroup>
          <thead>
            <tr>
              <th>Sc</th>
              <th>I/E</th>
              <th>Set / synopsis</th>
              <th>D/N</th>
              <th style={{ textAlign: 'right' }}>Pgs</th>
              {positional ? (
                chars.map((c) => (
                  <th key={c.id} className="cn" title={c.name}>
                    {c.number ?? c.name.slice(0, 2)}
                  </th>
                ))
              ) : (
                <th>Cast</th>
              )}
              <th style={{ textAlign: 'right' }}>Est.</th>
              {o.showLocation && <th>Location</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.day.id}>
                {r.index > 0 && (
                  <tr className="gap">
                    <td colSpan={cols} />
                  </tr>
                )}
                <tr className="day">
                  <td colSpan={cols}>
                    Day {r.number} of {r.total} — {dayHeading(ctx, r)} <span>· {dayTotals(r)}</span>
                  </td>
                </tr>
                {r.day.items.map((it) => {
                  if (it.type === 'banner') return <Banner key={it.id} text={it.text} color={it.color} colSpan={cols} />;
                  const s = ctx.model.sceneById.get(it.sceneId);
                  return s ? strip(s, it.id) : null;
                })}
                <tr className="eod">
                  <td colSpan={cols}>
                    End of Day {r.number}
                    {r.date ? ` — ${weekdayShort(r.date)} ${ctx.fmt.date(r.date)}` : ''} — {formatEighths(r.eighths)} pages
                    {r.minutes ? ` — est. ${formatMinutes(r.minutes)}` : ''}
                  </td>
                </tr>
              </Fragment>
            ))}
            {bone.length > 0 && (
              <>
                <tr className="gap">
                  <td colSpan={cols} />
                </tr>
                <tr className="day">
                  <td colSpan={cols}>
                    Boneyard — unscheduled <span>· {plural(bone.length, 'scene')}</span>
                  </td>
                </tr>
                {bone.map((s) => strip(s, `bone-${s.id}`))}
              </>
            )}
          </tbody>
        </table>
        <div className="pps-colors">
          {legendColors.map(([c, l]) => (
            <span key={l}>
              <i style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
        <CastLegend ctx={ctx} rows={rows} />
      </>
    ),
    css: STRIP_CSS,
  };
}

/* ---------------------------------------------------------------- DOOD */

const DOOD_CSS = `
.ppd-t { width: 100%; border-collapse: collapse; font-size: 7.6pt; margin-bottom: 10pt; }
.ppd-t thead { display: table-header-group; }
.ppd-t th, .ppd-t td { border: 0.5pt solid #b9b9c3; padding: 2.4pt 3pt; }
.ppd-t th { background: #efeff3; font-size: 6.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; vertical-align: bottom; }
.ppd-t th.l, .ppd-t td.l { text-align: left; }
.ppd-t th .d { font-weight: 600; text-transform: none; letter-spacing: 0; color: #555; display: block; }
.ppd-t td.c { text-align: center; font-weight: 800; font-size: 7pt; }
.ppd-t td.n { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.ppd-t tr { break-inside: avoid; page-break-inside: avoid; }
.ppd-t tfoot td { background: #f4f4f7; font-weight: 800; }
.ppd-legend { display: flex; gap: 12pt; flex-wrap: wrap; font-size: 7.4pt; margin-bottom: 8pt; }
.ppd-legend b { display: inline-block; min-width: 20pt; text-align: center; padding: 0.5pt 3pt; border-radius: 2pt; margin-right: 4pt; font-size: 7pt; border: 0.5pt solid #bbb; }
.ppd-part { font-size: 7pt; color: #666; margin: 0 0 3pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
`;

function renderDood(ctx: PrintContext) {
  const { p, rows } = prep(ctx);
  const dood = computeDood(rows, p.characters, p.cast);
  const per = Math.max(4, Math.min(31, Number(ctx.options.daysPerPage) || 16));
  const chunks: DayRow[][] = [];
  for (let i = 0; i < rows.length; i += per) chunks.push(rows.slice(i, i + per));
  if (!chunks.length) chunks.push([]);
  return {
    orientation: 'landscape' as const,
    body: (
      <>
        <DocHeader ctx={ctx} title="Day Out of Days" subtitle={`${plural(dood.length, 'character')} · ${summary(ctx, rows, ctx.model)}`} />
        <div className="ppd-legend">
          {DOOD_LEGEND.map((l) => (
            <span key={l.code}>
              <b style={{ background: l.bg, color: l.fg }}>{l.code}</b>
              {l.label}
            </span>
          ))}
        </div>
        {chunks.map((chunk, ci) => {
          const last = ci === chunks.length - 1;
          return (
            <div key={ci} className={ci > 0 ? 'pp-break-before' : undefined}>
              {chunks.length > 1 && (
                <div className="ppd-part">
                  Days {chunk[0]?.number}–{chunk[chunk.length - 1]?.number} (part {ci + 1} of {chunks.length})
                </div>
              )}
              <table className="ppd-t">
                <thead>
                  <tr>
                    <th style={{ width: '3%' }}>#</th>
                    <th className="l" style={{ width: '12%' }}>
                      Character
                    </th>
                    <th className="l" style={{ width: '12%' }}>
                      Cast
                    </th>
                    {chunk.map((r) => (
                      <th key={r.day.id}>
                        Day {r.number}
                        <span className="d">{r.date ? ctx.fmt.dateShort(r.date) : '—'}</span>
                      </th>
                    ))}
                    {last && (
                      <>
                        <th>Work</th>
                        <th>Hold</th>
                        <th>Total</th>
                        <th>Start</th>
                        <th>Finish</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dood.map((d) => (
                    <tr key={d.character.id}>
                      <td className="n">{d.character.number ?? ''}</td>
                      <td className="l">
                        <b>{d.character.name}</b>
                      </td>
                      <td className="l">{d.cast?.name ?? ''}</td>
                      {chunk.map((r) => {
                        const code = d.codes[r.index];
                        const st = code ? DOOD_STYLE[code] : undefined;
                        return (
                          <td key={r.day.id} className="c" style={st ? { background: st.bg, color: st.fg } : undefined}>
                            {code}
                          </td>
                        );
                      })}
                      {last && (
                        <>
                          <td className="n">{d.work}</td>
                          <td className="n">{d.hold || ''}</td>
                          <td className="n">{d.total}</td>
                          <td className="c" style={{ fontWeight: 600 }}>
                            {d.start ? ctx.fmt.dateShort(d.start) : `Day ${d.startIndex + 1}`}
                          </td>
                          <td className="c" style={{ fontWeight: 600 }}>
                            {d.finish ? ctx.fmt.dateShort(d.finish) : `Day ${d.finishIndex + 1}`}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {dood.length === 0 && (
                    <tr>
                      <td colSpan={3 + chunk.length + (last ? 5 : 0)} className="l pp-muted">
                        No characters appear in scheduled scenes yet.
                      </td>
                    </tr>
                  )}
                </tbody>
                {dood.length > 0 && (
                  <tfoot>
                    <tr>
                      <td />
                      <td className="l" colSpan={2}>
                        Cast working
                      </td>
                      {chunk.map((r) => (
                        <td key={r.day.id} className="c">
                          {dood.filter((d) => d.codes[r.index] && d.codes[r.index] !== 'H').length || ''}
                        </td>
                      ))}
                      {last && (
                        <>
                          <td className="n">{dood.reduce((n, d) => n + d.work, 0)}</td>
                          <td className="n">{dood.reduce((n, d) => n + d.hold, 0) || ''}</td>
                          <td className="n">{dood.reduce((n, d) => n + d.total, 0)}</td>
                          <td colSpan={2} />
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          );
        })}
      </>
    ),
    css: DOOD_CSS,
  };
}

/* ---------------------------------------------------------------- registry */

export const printDocs: PrintDocDef[] = [
  {
    id: 'shooting-schedule',
    title: 'Shooting Schedule',
    group: 'Schedule',
    orientation: 'portrait',
    description: 'Day-by-day schedule with scene details, cast, locations and breakdown elements',
    options: [
      { key: 'showSynopsis', label: 'Scene synopsis', type: 'boolean', default: true },
      { key: 'showElements', label: 'Breakdown elements', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Day & scene notes', type: 'boolean', default: true },
      { key: 'pageBreak', label: 'Start each day on a new page', type: 'boolean', default: false },
      { key: 'includeUnscheduled', label: 'Include unscheduled scenes', type: 'boolean', default: false },
    ],
    emptyReason: (p) => noDays(p),
    render: renderShootingSchedule,
  },
  {
    id: 'one-liner',
    title: 'One-Liner',
    group: 'Schedule',
    orientation: 'portrait',
    description: 'Compact schedule with one line per scene',
    options: [
      { key: 'showSynopsis', label: 'Scene synopsis', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Day notes', type: 'boolean', default: true },
    ],
    emptyReason: (p) => noDays(p),
    render: renderOneLiner,
  },
  {
    id: 'stripboard',
    title: 'Stripboard',
    group: 'Schedule',
    orientation: 'landscape',
    description: 'Colour-coded production strips by shoot day',
    options: [
      { key: 'showSynopsis', label: 'Scene synopsis', type: 'boolean', default: true },
      { key: 'castColumns', label: 'Cast in numbered columns', type: 'boolean', default: true, hint: 'Up to 30 characters; otherwise listed per strip' },
      { key: 'showLocation', label: 'Location column', type: 'boolean', default: true },
      { key: 'includeUnscheduled', label: 'Include the boneyard', type: 'boolean', default: false },
    ],
    emptyReason: (p) => noDays(p),
    render: renderStripboard,
  },
  {
    id: 'dood',
    title: 'Day Out of Days',
    group: 'Schedule',
    orientation: 'landscape',
    description: 'Cast work / hold days across the shoot (SW, W, WF, SWF, H)',
    options: [{ key: 'daysPerPage', label: 'Shoot days per page', type: 'number', default: 16, min: 4, max: 31 }],
    emptyReason: (p) => noDays(p),
    render: renderDood,
  },
];

