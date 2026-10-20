/* Printable shoot plan: one page (or more) per shoot session — logistics, run of
   show, combined shot list with checkboxes, checklist and notes. Render-only. */
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import type { ContentPiece, ContentShot, ShootSession } from '@/spaces/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Box, Check, KV, PBadge, PSection, PTable, Pre } from '@/print/components';
import { FORMAT_BY_ID, STAGE_BY_ID } from '@/spaces/constants';
import { formatSeconds } from '@/lib/format';
import { plural } from '@/lib/text';
import { estimateLabel, filmingOrder, indexSessions, scriptEstimate, shotKindShort, shotStats, splitSessions, validDate } from './model';

const CSS = `
.spp-logi { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-top: 8pt; }
.spp-logi .pp-pre { font-size: 8.4pt; }
.spp-lines { height: 13pt; border-bottom: 0.5pt solid #c4c4cc; }
.spp-title { font-weight: 700; }
.spp-sub { font-size: 7.4pt; color: #66666f; margin-top: 1pt; }
.spp-hook { font-style: italic; color: #33333c; }
.spp-done td { color: #77777f; }
.spp-done .spp-desc { text-decoration: line-through; }
.spp-none { color: #8a8a93; font-style: italic; }
.spp-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 3pt 14pt; font-size: 8.4pt; }
.spp-checks div { display: flex; align-items: flex-start; gap: 5pt; }
.spp-checks .pp-check { margin-top: 1.5pt; flex-shrink: 0; }
.spp-checks .on-text { color: #77777f; text-decoration: line-through; }
.spp-empty { padding: 18pt; text-align: center; color: #77777f; border: 0.75pt dashed #c9c9d1; border-radius: 4pt; margin-top: 10pt; }
.spp-loc { font-size: 7.4pt; color: #66666f; }
`;

/** Sessions selected by the "shoot" option: id or title (exact, then partial); empty = upcoming. */
function pickSessions(ctx: SpacePrintContext): { sessions: ShootSession[]; note?: string } {
  const shoots = ctx.space.shoots ?? [];
  const q = String(ctx.options.shoot ?? '').trim();
  if (!q) {
    const { upcoming } = splitSessions(shoots, ctx.todayISO);
    return upcoming.length ? { sessions: upcoming } : { sessions: [], note: shoots.length ? 'No upcoming shoot days. Enter the title of a past shoot day to print it.' : 'No shoot days yet.' };
  }
  const byId = shoots.filter((s) => s.id === q);
  if (byId.length) return { sessions: byId };
  const lq = q.toLowerCase();
  const exact = shoots.filter((s) => (s.title || '').trim().toLowerCase() === lq);
  if (exact.length) return { sessions: exact };
  const partial = shoots.filter((s) => (s.title || '').toLowerCase().includes(lq));
  if (partial.length) return { sessions: partial };
  return { sessions: [], note: `No shoot day matches “${q}”.` };
}

interface ShotRow {
  piece: ContentPiece;
  pieceIndex: number;
  shot: ContentShot | null;
  n: number;
  group: string;
}

function SessionPage({ ctx, sh, pieces, first }: { ctx: SpacePrintContext; sh: ShootSession; pieces: ContentPiece[]; first: boolean }) {
  const { fmt, options } = ctx;
  const stats = shotStats(pieces);
  const tick = options.tickDone !== false;
  const byLocation = options.order === 'location';
  const dateLabel = validDate(sh.date) ? fmt.dateLong(sh.date) : 'Date to be confirmed';
  const times = [sh.callTime && `Call ${fmt.time(sh.callTime)}`, sh.wrapTime && `Wrap ${fmt.time(sh.wrapTime)}`].filter(Boolean).join(' · ');

  let rows: ShotRow[];
  if (byLocation) {
    rows = filmingOrder(pieces, sh.location).flatMap((g) =>
      g.rows.map((r, i) => ({ piece: r.piece, pieceIndex: pieces.indexOf(r.piece), shot: r.shot, n: i + 1, group: `${g.location} — ${plural(g.rows.length, 'shot')}` })),
    );
  } else {
    rows = pieces.flatMap((piece, pi): ShotRow[] => {
      const group = `${pi + 1}. ${piece.title || 'Untitled content'} — ${FORMAT_BY_ID[piece.format]?.label ?? piece.format}`;
      const shots = piece.shots ?? [];
      if (!shots.length) return [{ piece, pieceIndex: pi, shot: null, n: 0, group }];
      return shots.map((shot, i) => ({ piece, pieceIndex: pi, shot, n: i + 1, group }));
    });
  }

  const lines = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="spp-lines" />);

  return (
    <div className={first ? undefined : 'pp-break-before'}>
      <SpaceDocHeader ctx={ctx} title={`Shoot Plan — ${sh.title || 'Shoot day'}`} subtitle={[dateLabel, times].filter(Boolean).join(' · ')} meta={`${plural(pieces.length, 'piece')} · ${plural(stats.total, 'shot')}`} />
      <KV
        cols={4}
        keepEmpty
        items={[
          ['Date', dateLabel],
          ['Call', sh.callTime ? fmt.time(sh.callTime) : ''],
          ['Wrap', sh.wrapTime ? fmt.time(sh.wrapTime) : ''],
          ['Location', sh.location || ''],
        ]}
      />
      <div className="spp-logi pp-avoid">
        <Box title="People">{sh.people?.trim() ? <Pre>{sh.people}</Pre> : lines(3)}</Box>
        <Box title="Gear">{sh.gear?.trim() ? <Pre>{sh.gear}</Pre> : lines(3)}</Box>
      </div>

      <PSection title="Run of show" right={plural(pieces.length, 'piece')}>
        <PTable<ContentPiece>
          rows={pieces}
          empty="No content planned for this shoot day yet."
          columns={[
            { header: '#', width: '4%', align: 'center', cell: (_c, i) => <strong>{i + 1}</strong> },
            {
              header: 'Content',
              width: '30%',
              cell: (c) => (
                <>
                  <div className="spp-title">{c.title || 'Untitled content'}</div>
                  <div className="spp-sub">{[FORMAT_BY_ID[c.format]?.label ?? c.format, c.aspect, c.location].filter(Boolean).join(' · ')}</div>
                </>
              ),
            },
            {
              header: 'Stage',
              width: '11%',
              cell: (c) => {
                const st = STAGE_BY_ID[c.stage];
                return <PBadge color={st?.color}>{st?.label ?? c.stage}</PBadge>;
              },
            },
            { header: 'Hook', cell: (c) => (c.hook ? <span className="spp-hook">“{c.hook}”</span> : c.concept ? <span>{c.concept}</span> : '') },
            {
              header: 'Length',
              width: '12%',
              cell: (c) => {
                const est = scriptEstimate(c);
                return (
                  <>
                    {c.length && <div>Target {c.length}</div>}
                    {est && <div className="spp-sub">Script {estimateLabel(est)}</div>}
                  </>
                );
              },
            },
            {
              header: 'Shots',
              width: '8%',
              align: 'right',
              cell: (c) => {
                const s = c.shots ?? [];
                return s.length ? `${s.filter((x) => x.done).length}/${s.length}` : '—';
              },
            },
          ]}
        />
      </PSection>

      <PSection title={byLocation ? 'Shot list — filming order by location' : 'Shot list'} right={stats.total ? `${stats.done}/${stats.total} done${stats.seconds ? ` · ${formatSeconds(stats.seconds)}` : ''}` : undefined}>
        <PTable<ShotRow>
          rows={rows}
          groupBy={(r) => r.group}
          empty="No shots yet."
          rowStyle={() => undefined}
          columns={[
            { header: '', width: '4%', align: 'center', cell: (r) => (r.shot ? <Check on={tick && !!r.shot.done} /> : '') },
            { header: '#', width: '4%', align: 'right', cell: (r) => (r.shot ? r.n : '') },
            {
              header: 'Shot',
              cell: (r) =>
                r.shot ? (
                  <>
                    <span className={tick && r.shot.done ? 'spp-desc' : undefined} style={tick && r.shot.done ? { color: '#77777f', textDecoration: 'line-through' } : undefined}>
                      {r.shot.description || '—'}
                    </span>
                    {byLocation && <div className="spp-sub">{r.piece.title || 'Untitled content'}</div>}
                    {r.shot.notes && <div className="spp-sub">{r.shot.notes}</div>}
                  </>
                ) : (
                  <span className="spp-none">No shots listed for this piece.</span>
                ),
            },
            { header: 'Kind', width: '10%', cell: (r) => (r.shot ? shotKindShort(r.shot.kind) : '') },
            { header: 'Framing', width: '11%', cell: (r) => r.shot?.framing ?? '' },
            { header: 'Dur.', width: '7%', num: true, cell: (r) => (r.shot?.duration != null ? formatSeconds(r.shot.duration) : '') },
            ...(byLocation ? [] : [{ header: 'Location', width: '16%', cell: (r: ShotRow) => <span className="spp-loc">{r.shot?.location || ''}</span> }]),
          ]}
        />
      </PSection>

      {(sh.checklist ?? []).length > 0 && (
        <PSection title="Checklist" right={`${sh.checklist.filter((c) => c.done).length}/${sh.checklist.length}`}>
          <div className="spp-checks">
            {sh.checklist.map((it) => (
              <div key={it.id}>
                <Check on={!!it.done} />
                <span className={it.done ? 'on-text' : undefined}>{it.text}</span>
              </div>
            ))}
          </div>
        </PSection>
      )}

      <PSection title="Notes" className={sh.notes?.trim() ? undefined : 'pp-avoid'}>
        {sh.notes?.trim() ? <Pre>{sh.notes}</Pre> : lines(3)}
      </PSection>
    </div>
  );
}

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-shoot-plan',
    title: 'Shoot Plan',
    group: 'Production',
    orientation: 'portrait',
    description: 'Batch shoot day: call & wrap, location, people, gear, run of show, combined shot list with checkboxes, checklist and notes',
    options: [
      { key: 'shoot', label: 'Shoot day', type: 'text', default: '', hint: 'Title or id; empty = every upcoming shoot day (one per page)' },
      {
        key: 'order',
        label: 'Shot list order',
        type: 'select',
        default: 'piece',
        choices: [
          { value: 'piece', label: 'Grouped by piece' },
          { value: 'location', label: 'Filming order (by location)' },
        ],
      },
      { key: 'tickDone', label: 'Tick shots already filmed', type: 'boolean', default: true },
    ],
    emptyReason: (s) => ((s.shoots ?? []).length ? false : 'No shoot days yet'),
    render: (ctx) => {
      const { sessions, note } = pickSessions(ctx);
      const idx = indexSessions(ctx.space);
      const title = sessions.length === 1 ? `Shoot Plan — ${sessions[0].title || 'Shoot day'}` : 'Shoot Plans';
      return {
        css: CSS,
        title,
        body: sessions.length ? (
          <>
            {sessions.map((sh, i) => (
              <SessionPage key={sh.id} ctx={ctx} sh={sh} pieces={idx.pieces.get(sh.id) ?? []} first={i === 0} />
            ))}
          </>
        ) : (
          <>
            <SpaceDocHeader ctx={ctx} title="Shoot Plan" />
            <div className="spp-empty">{note}</div>
          </>
        ),
      };
    },
  },
];
