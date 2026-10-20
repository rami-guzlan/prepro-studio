import type { PrintDocDef } from '@/print/types';
import type { AdrLine, Deliverable, EditNote, GraphicItem, MusicCue, PostMilestone, VfxShot } from '@/types';
import { Check, DocHeader, KV, PBadge, PTable } from '@/print/components';
import { POST_STATUSES, optionColor } from '@/lib/constants';
import { MONTHS_SHORT, addDays, diffDays, parseISODate, toISODate, todayISO } from '@/lib/dates';
import { formatSeconds, parseDuration } from '@/lib/format';
import { MUSIC_SOURCES, NOTE_STATUSES, VFX_COMPLEXITY, characterText, cueSeconds, fmtDur, nominalFps, sceneText, shotText } from './shared';

const valid = (d?: string): d is string => !!d && !!parseISODate(d);
const status = (v: string | undefined) => {
  const o = POST_STATUSES.find((s) => s.value === v);
  return o ? <PBadge color={o.color}>{o.label}</PBadge> : '';
};
const res = (r?: string) => (r ? r.replace(/x/i, '×') : '');

const CSS = `
.pstp-strong { font-weight: 650; }
.pstp-sub { color: #66666f; font-size: 7.4pt; }
.pstp-mono { font-family: 'Courier Prime', 'Courier New', monospace; font-size: 8pt; white-space: nowrap; }
.pstp-script { font-family: 'Courier Prime', 'Courier New', monospace; font-size: 8.6pt; white-space: pre-wrap; }
.pstp-done { color: #7a7a84; }
.pstp-done .pstp-strong { text-decoration: line-through; }
.pstp-thumb { width: 0.9in; aspect-ratio: 16 / 9; background: #ececf1; border-radius: 2pt; overflow: hidden; }
.pstp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pstp-kv { margin-bottom: 10pt; }

.psg { margin: 0 0 14pt; break-inside: avoid; page-break-inside: avoid; }
.psg-head, .psg-row { display: flex; align-items: stretch; }
.psg-label { width: 1.8in; flex-shrink: 0; padding-right: 6pt; font-size: 7.6pt; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 13pt; }
.psg-track { position: relative; flex: 1; min-width: 0; }
.psg-head .psg-track { height: 12pt; }
.psg-row .psg-track { height: 13pt; border-top: 0.4pt solid #ececf1; }
.psg-tick { position: absolute; top: 0; transform: translateX(-50%); font-size: 6.4pt; color: #7a7a84; white-space: nowrap; }
.psg-grid { position: absolute; top: 0; bottom: 0; width: 0; border-left: 0.4pt solid #e2e2e8; }
.psg-bar { position: absolute; top: 2.5pt; height: 8pt; border-radius: 2pt; }
.psg-today { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1pt solid #e5484d; }
.psg-deadline { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1pt dashed #6d4aff; }
.psg-legend { display: flex; gap: 12pt; margin: 5pt 0 0 1.8in; font-size: 6.8pt; color: #66666f; }
.psg-legend i { display: inline-block; width: 8pt; height: 6pt; border-radius: 1.5pt; margin-right: 3pt; vertical-align: 0; }
`;

function scheduleGantt(items: PostMilestone[], delivery: string | undefined) {
  const rows = items.map((it) => {
    const s = valid(it.start) ? it.start : valid(it.end) ? it.end : undefined;
    let e = valid(it.end) ? it.end : s;
    if (s && e && e < s) e = s;
    return { it, s, e };
  });
  const dates = rows.flatMap((r) => [r.s, r.e]).filter(valid);
  if (valid(delivery)) dates.push(delivery);
  if (!dates.length) return null;
  dates.sort();
  const lo = addDays(dates[0], -1);
  const hi = addDays(dates[dates.length - 1], 2);
  const span = Math.max(1, diffDays(lo, hi));
  const pct = (d: string) => (diffDays(lo, d) / span) * 100;
  const ticks: { date: string; label: string }[] = [];
  const d = new Date(parseISODate(lo)!);
  if (span <= 120) {
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (toISODate(d) <= hi) {
      ticks.push({ date: toISODate(d), label: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` });
      d.setDate(d.getDate() + (span > 70 ? 14 : 7));
    }
  } else {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    while (toISODate(d) <= hi) {
      ticks.push({ date: toISODate(d), label: MONTHS_SHORT[d.getMonth()] });
      d.setMonth(d.getMonth() + 1);
    }
  }
  const today = todayISO();
  const overlay = (
    <>
      {ticks.map((t) => (
        <i key={t.date} className="psg-grid" style={{ left: `${pct(t.date)}%` }} />
      ))}
      {today >= lo && today <= hi && <i className="psg-today" style={{ left: `${pct(today)}%` }} />}
      {valid(delivery) && <i className="psg-deadline" style={{ left: `${pct(addDays(delivery, 1))}%` }} />}
    </>
  );
  return (
    <div className="psg">
      <div className="psg-head">
        <div className="psg-label" />
        <div className="psg-track">
          {ticks.map((t) => (
            <span key={t.date} className="psg-tick" style={{ left: `${pct(t.date)}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {rows.map(({ it, s, e }) => (
        <div key={it.id} className="psg-row">
          <div className="psg-label">{it.name || 'Untitled'}</div>
          <div className="psg-track">
            {overlay}
            {s && e && (
              <span
                className="psg-bar"
                style={{
                  left: `${pct(s)}%`,
                  width: `${Math.max(0.6, ((diffDays(s, e) + 1) / span) * 100)}%`,
                  background: optionColor(POST_STATUSES, it.status) ?? '#8e8c99',
                }}
              />
            )}
          </div>
        </div>
      ))}
      <div className="psg-legend">
        {POST_STATUSES.filter((s) => items.some((i) => i.status === s.value)).map((s) => (
          <span key={s.value}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {today >= lo && today <= hi && (
          <span>
            <i style={{ background: '#e5484d', width: '1.5pt' }} />
            Today
          </span>
        )}
        {valid(delivery) && (
          <span>
            <i style={{ background: '#6d4aff', width: '1.5pt' }} />
            Delivery
          </span>
        )}
      </div>
    </div>
  );
}

export const printDocs: PrintDocDef[] = [
  /* ------------------------------------------------------------ schedule */
  {
    id: 'post-schedule',
    title: 'Post Schedule',
    group: 'Post',
    orientation: 'landscape',
    description: 'Post-production milestones with a Gantt chart, owners and status',
    options: [
      { key: 'showGantt', label: 'Show Gantt chart', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Show notes', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.post.schedule.length ? false : 'No post schedule yet'),
    render: (ctx) => {
      const { project: p, fmt, options } = ctx;
      const items = p.post.schedule;
      const dates = items.flatMap((i) => [i.start, i.end]).filter(valid).sort();
      const lock = items.find((i) => /picture lock/i.test(i.name));
      const done = items.filter((i) => i.status === 'done' || i.status === 'approved').length;
      return {
        css: CSS,
        body: (
          <>
            <DocHeader
              ctx={ctx}
              title="Post Schedule"
              subtitle={`${dates.length ? `${fmt.dateMedium(dates[0])} – ${fmt.dateMedium(dates[dates.length - 1])} · ` : ''}${done}/${items.length} done`}
            />
            <KV
              cols={4}
              style={{ marginBottom: '10pt' }}
              items={[
                ['Shoot wraps', fmt.dateMedium(p.meta.shootEnd)],
                ['Picture lock', fmt.dateMedium(lock?.end ?? lock?.start)],
                ['Delivery', fmt.dateMedium(p.meta.deliveryDate)],
                ['Post supervisor / editor', p.crew.find((c) => /editor|post sup/i.test(c.position))?.name],
              ]}
            />
            {options.showGantt && scheduleGantt(items, p.meta.deliveryDate)}
            <PTable<PostMilestone>
              rows={items}
              zebra
              columns={[
                { header: 'Milestone', cell: (m) => <span className="pstp-strong">{m.name || 'Untitled'}</span> },
                { header: 'Start', width: '78pt', cell: (m) => (valid(m.start) ? fmt.dateShort(m.start) : '') },
                { header: 'End', width: '78pt', cell: (m) => (valid(m.end) ? fmt.dateShort(m.end) : '') },
                { header: 'Days', width: '34pt', num: true, cell: (m) => (valid(m.start) && valid(m.end) && m.end >= m.start ? diffDays(m.start, m.end) + 1 : '') },
                { header: 'Owner', width: '110pt', cell: (m) => m.owner ?? '' },
                { header: 'Status', width: '70pt', cell: (m) => status(m.status) },
                ...(options.showNotes ? [{ header: 'Notes', cell: (m: PostMilestone) => <span className="pstp-sub">{m.notes ?? ''}</span> }] : []),
              ]}
            />
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ deliverables */
  {
    id: 'deliverables',
    title: 'Deliverables',
    group: 'Post',
    orientation: 'landscape',
    description: 'Every output file with platform, technical specs, due date and status',
    options: [
      { key: 'hideDone', label: 'Hide delivered items', type: 'boolean', default: false },
      { key: 'showNotes', label: 'Show notes', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.post.deliverables.length ? false : 'No deliverables yet'),
    render: (ctx) => {
      const { project: p, fmt, options } = ctx;
      const rows = p.post.deliverables.filter((d) => !options.hideDone || d.status !== 'done');
      return {
        css: CSS,
        body: (
          <>
            <DocHeader
              ctx={ctx}
              title="Deliverables"
              subtitle={`${p.post.deliverables.length} deliverables · ${p.post.deliverables.filter((d) => d.status === 'done').length} delivered${p.meta.deliveryDate ? ` · final delivery ${fmt.dateMedium(p.meta.deliveryDate)}` : ''}`}
            />
            <PTable<Deliverable>
              rows={rows}
              zebra
              columns={[
                { header: '', width: '12pt', cell: (d) => <Check on={d.status === 'done'} /> },
                {
                  header: 'Deliverable',
                  width: '120pt',
                  cell: (d) => (
                    <div>
                      <div className="pstp-strong">{d.name || 'Untitled'}</div>
                      {d.platform && <div className="pstp-sub">{d.platform}</div>}
                    </div>
                  ),
                },
                {
                  header: 'Picture',
                  width: '96pt',
                  cell: (d) => (
                    <div>
                      <div>{[res(d.resolution), d.aspectRatio].filter(Boolean).join(' · ')}</div>
                      {d.frameRate && <div className="pstp-sub">{d.frameRate} fps</div>}
                    </div>
                  ),
                },
                {
                  header: 'Codec / container',
                  cell: (d) => (
                    <div>
                      <div>{d.codec ?? ''}</div>
                      {d.container && <div className="pstp-sub">{d.container}</div>}
                    </div>
                  ),
                },
                {
                  header: 'Audio',
                  cell: (d) => (
                    <div>
                      <div>{d.audio ?? ''}</div>
                      {d.loudness && <div className="pstp-sub">{d.loudness}</div>}
                    </div>
                  ),
                },
                { header: 'Captions', width: '70pt', cell: (d) => d.captions ?? '' },
                { header: 'Length', width: '40pt', cell: (d) => d.duration ?? '' },
                { header: 'Due', width: '56pt', cell: (d) => (valid(d.due) ? fmt.dateShort(d.due) : '') },
                { header: 'Status', width: '62pt', cell: (d) => status(d.status) },
                ...(options.showNotes ? [{ header: 'Notes', cell: (d: Deliverable) => <span className="pstp-sub">{d.notes ?? ''}</span> }] : []),
              ]}
            />
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ graphics */
  {
    id: 'graphics-list',
    title: 'Graphics & Titles',
    group: 'Post',
    orientation: 'portrait',
    description: 'Lower thirds, title cards, callouts and other on-screen text with exact wording',
    options: [
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'select',
        default: 'none',
        choices: [
          { value: 'none', label: 'No grouping (list order)' },
          { value: 'kind', label: 'Kind' },
          { value: 'scene', label: 'Scene' },
        ],
      },
      { key: 'showNotes', label: 'Show notes', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.post.graphics.length ? false : 'No graphics yet'),
    render: (ctx) => {
      const { project: p, model, options } = ctx;
      const list = p.post.graphics;
      const groupBy =
        options.groupBy === 'kind' ? (g: GraphicItem) => g.kind || 'Other' : options.groupBy === 'scene' ? (g: GraphicItem) => sceneText(model, g.sceneId) || 'No scene' : undefined;
      return {
        css: CSS,
        body: (
          <>
            <DocHeader ctx={ctx} title="Graphics & Titles" subtitle={`${list.length} item${list.length === 1 ? '' : 's'} · ${list.filter((g) => g.status === 'approved' || g.status === 'done').length} approved`} />
            <PTable<GraphicItem>
              rows={list}
              groupBy={groupBy}
              columns={[
                { header: '#', width: '18pt', num: true, cell: (g) => list.indexOf(g) + 1 },
                { header: 'Kind', width: '62pt', cell: (g) => <span className="pstp-sub">{g.kind}</span> },
                {
                  header: 'Text',
                  cell: (g) => (
                    <div>
                      <div className="pstp-strong">{g.text || '—'}</div>
                      {g.subtext && <div>{g.subtext}</div>}
                      {options.showNotes && g.notes && <div className="pstp-sub">{g.notes}</div>}
                    </div>
                  ),
                },
                ...(options.groupBy === 'scene' ? [] : [{ header: 'Scene', width: '100pt', cell: (g: GraphicItem) => <span className="pstp-sub">{sceneText(model, g.sceneId)}</span> }]),
                { header: 'TC in', width: '62pt', cell: (g) => <span className="pstp-mono">{g.tcIn ?? ''}</span> },
                { header: 'Dur.', width: '30pt', cell: (g) => g.duration ?? '' },
                { header: 'Status', width: '60pt', cell: (g) => status(g.status) },
              ]}
            />
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ music cue sheet */
  {
    id: 'music-cue-sheet',
    title: 'Music Cue Sheet',
    group: 'Post',
    orientation: 'landscape',
    description: 'Cue-by-cue music log with timecodes, durations, composers, publishers and usage',
    options: [
      { key: 'showStatus', label: 'Show internal status', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Show notes', type: 'boolean', default: false },
    ],
    emptyReason: (p) => (p.post.music.length ? false : 'No music cues yet'),
    render: (ctx) => {
      const { project: p, fmt, options } = ctx;
      const fps = nominalFps(p.meta.frameRate);
      const cues = p.post.music;
      const total = cues.reduce((a, c) => a + (cueSeconds(c, fps) ?? 0), 0);
      const runtime = parseDuration(p.meta.targetRuntime ?? '');
      const cols = [
        { header: 'Cue', width: '34pt', cell: (c: MusicCue) => <span className="pstp-strong">{c.cue}</span> },
        { header: 'Title', cell: (c: MusicCue) => <span className="pstp-strong">{c.title || '—'}</span> },
        { header: 'Composer', cell: (c: MusicCue) => c.composer ?? '' },
        { header: 'Publisher', cell: (c: MusicCue) => c.publisher ?? '' },
        { header: 'Source', width: '64pt', cell: (c: MusicCue) => MUSIC_SOURCES.find((s) => s.value === c.source)?.label ?? c.source ?? '' },
        { header: 'Usage', width: '30pt', cell: (c: MusicCue) => c.usage ?? '' },
        { header: 'TC in', width: '62pt', cell: (c: MusicCue) => <span className="pstp-mono">{c.tcIn ?? ''}</span> },
        { header: 'TC out', width: '62pt', cell: (c: MusicCue) => <span className="pstp-mono">{c.tcOut ?? ''}</span> },
        { header: 'Duration', width: '42pt', num: true, cell: (c: MusicCue) => fmtDur(cueSeconds(c, fps)) || c.duration || '' },
        { header: 'License', width: '80pt', cell: (c: MusicCue) => c.license ?? '' },
        ...(options.showStatus ? [{ header: 'Status', width: '58pt', cell: (c: MusicCue) => status(c.status) }] : []),
        ...(options.showNotes ? [{ header: 'Notes', cell: (c: MusicCue) => <span className="pstp-sub">{c.notes ?? ''}</span> }] : []),
      ];
      const footer = cols.map((c) => (c.header === 'Title' ? `${cues.length} cue${cues.length === 1 ? '' : 's'}` : c.header === 'Duration' ? fmtDur(total) || '0:00' : c.header === 'TC out' ? 'Total' : ''));
      return {
        css: CSS,
        body: (
          <>
            <DocHeader ctx={ctx} title="Music Cue Sheet" subtitle={`${cues.length} cues · total music ${fmtDur(total) || '0:00'}`} />
            <KV
              cols={4}
              style={{ marginBottom: '10pt' }}
              items={[
                ['Production', p.meta.title],
                ['Production company', p.meta.productionCompany],
                ['Producer', p.meta.producer],
                ['Director', p.meta.director],
                ['Programme length', runtime ? formatSeconds(runtime) : p.meta.targetRuntime],
                ['Total music', fmtDur(total) || '0:00'],
                ['Frame rate', p.meta.frameRate ? `${p.meta.frameRate} fps` : ''],
                ['Date', fmt.dateMedium(todayISO())],
              ]}
            />
            <PTable<MusicCue> rows={cues} zebra columns={cols} footer={footer} />
            <div className="pstp-sub" style={{ marginTop: '6pt' }}>
              Usage: BI background instrumental · BV background vocal · VI visual instrumental · VV visual vocal · MT main title · ET end title
            </div>
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ VFX */
  {
    id: 'vfx-list',
    title: 'VFX List',
    group: 'Post',
    orientation: 'landscape',
    description: 'VFX shots with codes, scenes, vendors, complexity, cost and due dates',
    options: [
      { key: 'showImages', label: 'Show storyboard frames', type: 'boolean', default: true },
      { key: 'showCosts', label: 'Show costs', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Show notes', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.post.vfx.length ? false : 'No VFX shots yet'),
    render: (ctx) => {
      const { project: p, model, fmt, options } = ctx;
      const list = p.post.vfx;
      const total = list.reduce((a, v) => a + (v.cost ?? 0), 0);
      const img = (v: VfxShot) => {
        const sh = v.shotId ? p.shots.find((s) => s.id === v.shotId) : undefined;
        return sh?.image ? ctx.asset(sh.image) : '';
      };
      const anyImg = options.showImages && list.some((v) => img(v));
      const cols = [
        { header: 'Code', width: '52pt', cell: (v: VfxShot) => <span className="pstp-strong pstp-mono">{v.code}</span> },
        ...(anyImg ? [{ header: 'Frame', width: '0.95in', cell: (v: VfxShot) => <div className="pstp-thumb">{img(v) && <img src={img(v)} alt="" />}</div> }] : []),
        { header: 'Scene / shot', width: '110pt', cell: (v: VfxShot) => <div><div>{sceneText(model, v.sceneId)}</div>{v.shotId && <div className="pstp-sub">Shot {shotText(p, model, v.shotId)}</div>}</div> },
        {
          header: 'Description',
          cell: (v: VfxShot) => (
            <div>
              <div>{v.description}</div>
              {options.showNotes && v.notes && <div className="pstp-sub">{v.notes}</div>}
            </div>
          ),
        },
        { header: 'Vendor', width: '80pt', cell: (v: VfxShot) => v.vendor ?? '' },
        {
          header: 'Complexity',
          width: '56pt',
          cell: (v: VfxShot) => {
            const c = VFX_COMPLEXITY.find((x) => x.value === v.complexity);
            return c ? <PBadge color={c.color}>{c.label}</PBadge> : '';
          },
        },
        { header: 'Due', width: '54pt', cell: (v: VfxShot) => (valid(v.due) ? fmt.dateShort(v.due) : '') },
        ...(options.showCosts ? [{ header: 'Cost', width: '54pt', num: true, cell: (v: VfxShot) => (v.cost != null ? fmt.money(v.cost, { cents: false }) : '') }] : []),
        { header: 'Status', width: '60pt', cell: (v: VfxShot) => status(v.status) },
      ];
      const footer = options.showCosts ? cols.map((c) => (c.header === 'Cost' ? fmt.money(total, { cents: false }) : c.header === 'Code' ? `${list.length}` : c.header === 'Due' ? 'Total' : '')) : undefined;
      return {
        css: CSS,
        body: (
          <>
            <DocHeader ctx={ctx} title="VFX List" subtitle={`${list.length} shot${list.length === 1 ? '' : 's'}${options.showCosts ? ` · ${fmt.money(total, { cents: false })}` : ''}`} />
            <PTable<VfxShot> rows={list} zebra columns={cols} footer={footer} />
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ ADR */
  {
    id: 'adr-list',
    title: 'ADR List',
    group: 'Post',
    orientation: 'portrait',
    description: 'Lines to re-record, grouped by character, for booking ADR sessions',
    options: [
      { key: 'groupByCharacter', label: 'Group by character', type: 'boolean', default: true },
      { key: 'hideDone', label: 'Hide recorded lines', type: 'boolean', default: false },
    ],
    emptyReason: (p) => (p.post.adr.length ? false : 'No ADR lines yet'),
    render: (ctx) => {
      const { project: p, model, options } = ctx;
      const rows = p.post.adr.filter((a) => !options.hideDone || a.status !== 'done');
      const actor = (characterId?: string) => {
        const ch = p.characters.find((c) => c.id === characterId);
        const cast = ch?.castId ? p.cast.find((c) => c.id === ch.castId) : undefined;
        return cast?.name;
      };
      const ordered = options.groupByCharacter ? [...rows].sort((a, b) => characterText(p, a.characterId).localeCompare(characterText(p, b.characterId))) : rows;
      return {
        css: CSS,
        body: (
          <>
            <DocHeader ctx={ctx} title="ADR List" subtitle={`${rows.length} line${rows.length === 1 ? '' : 's'} · ${new Set(rows.map((r) => r.characterId).filter(Boolean)).size} actors`} />
            <PTable<AdrLine>
              rows={ordered}
              groupBy={options.groupByCharacter ? (a) => a.characterId ?? '' : undefined}
              groupLabel={(g, list) => {
                const name = g ? characterText(p, g).toUpperCase() : 'NO CHARACTER';
                const who = g ? actor(g) : undefined;
                return `${name}${who ? ` — ${who}` : ''} · ${list.length} line${list.length === 1 ? '' : 's'}`;
              }}
              columns={[
                { header: '', width: '12pt', cell: (a) => <Check on={a.status === 'done'} /> },
                ...(options.groupByCharacter ? [] : [{ header: 'Character', width: '70pt', cell: (a: AdrLine) => <span className="pstp-strong">{characterText(p, a.characterId)}</span> }]),
                { header: 'Scene', width: '96pt', cell: (a) => <span className="pstp-sub">{sceneText(model, a.sceneId)}</span> },
                { header: 'TC', width: '60pt', cell: (a) => <span className="pstp-mono">{a.tc ?? ''}</span> },
                {
                  header: 'Line',
                  cell: (a) => (
                    <div>
                      <div className="pstp-script">{a.line}</div>
                      {a.notes && <div className="pstp-sub">{a.notes}</div>}
                    </div>
                  ),
                },
                { header: 'Reason', width: '62pt', cell: (a) => a.reason ?? '' },
                { header: 'Status', width: '58pt', cell: (a) => status(a.status) },
              ]}
            />
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ edit notes */
  {
    id: 'edit-notes',
    title: 'Edit Notes',
    group: 'Post',
    orientation: 'portrait',
    description: 'Review notes per cut version with timecode, author and status',
    options: [
      { key: 'includeResolved', label: 'Include addressed / won’t fix', type: 'boolean', default: false },
      { key: 'groupByVersion', label: 'Group by version', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.post.editNotes.length ? false : 'No edit notes yet'),
    render: (ctx) => {
      const { project: p, options } = ctx;
      const rows = p.post.editNotes.filter((n) => options.includeResolved || n.status === 'open');
      const open = p.post.editNotes.filter((n) => n.status === 'open').length;
      return {
        css: CSS,
        body: (
          <>
            <DocHeader ctx={ctx} title="Edit Notes" subtitle={`${open} open · ${p.post.editNotes.length - open} resolved`} />
            <PTable<EditNote>
              rows={rows}
              groupBy={options.groupByVersion ? (n) => n.version?.trim() || 'No version' : undefined}
              empty="No open notes."
              columns={[
                { header: '', width: '12pt', cell: (n) => <Check on={n.status !== 'open'} /> },
                ...(options.groupByVersion ? [] : [{ header: 'Version', width: '60pt', cell: (n: EditNote) => n.version ?? '' }]),
                { header: 'TC', width: '62pt', cell: (n) => <span className="pstp-mono">{n.tc ?? ''}</span> },
                { header: 'Note', cell: (n) => <span className={n.status !== 'open' ? 'pstp-done' : undefined}>{n.note}</span> },
                { header: 'Author', width: '80pt', cell: (n) => n.author ?? '' },
                {
                  header: 'Status',
                  width: '58pt',
                  cell: (n) => {
                    const o = NOTE_STATUSES.find((s) => s.value === n.status);
                    return o ? <PBadge color={o.color}>{o.label}</PBadge> : '';
                  },
                },
              ]}
            />
          </>
        ),
      };
    },
  },

  /* ------------------------------------------------------------ workflow */
  {
    id: 'post-workflow',
    title: 'Media Management Plan',
    group: 'Post',
    orientation: 'portrait',
    description: 'Camera, backup, folder structure and post workflow plan',
    emptyReason: (p) => (p.post.workflow?.trim() ? false : 'No workflow plan written yet'),
    render: (ctx) => {
      const p = ctx.project;
      return {
        css: CSS + `.pstp-workflow { font-family: 'Courier Prime', 'Courier New', monospace; font-size: 9pt; line-height: 1.5; }`,
        body: (
          <>
            <DocHeader ctx={ctx} title="Media Management Plan" subtitle={[p.meta.frameRate && `${p.meta.frameRate} fps`, p.meta.resolution && res(p.meta.resolution), p.meta.aspectRatio].filter(Boolean).join(' · ')} />
            <div className="pp-pre pstp-workflow">{p.post.workflow}</div>
          </>
        ),
      };
    },
  },
];

