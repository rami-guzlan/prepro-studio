/* Printable documents of the Content module: one-page content briefs and the
   landscape content plan. Render-only (no hooks), literal colours. */
import { Fragment, type ReactNode } from 'react';
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Check, Dot, KV, PBadge, PSection, PTable, Photo, Pre } from '@/print/components';
import { FORMATS, FORMAT_BY_ID, POST_STATUSES, SHOT_KINDS, STAGES, STAGE_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import type { ContentPiece, ContentStage } from '@/spaces/types';
import { aspectToNumber } from '@/lib/constants';
import { formatSeconds } from '@/lib/format';
import { avTiming, hasParts, parseTarget, secondsForWords, splitParts, spokenWords } from './script';

const label = (list: { value: string; label: string }[], v: string | undefined) => (v ? list.find((x) => x.value === v)?.label ?? v : '');
const formatName = (c: ContentPiece) => FORMAT_BY_ID[c.format]?.label ?? 'Other';
const stageColor = (s: ContentStage) => STAGE_BY_ID[s]?.color ?? '#a5a3b3';
const PRIORITY: Record<string, string> = { high: 'High', normal: 'Normal', low: 'Low' };

/** Pieces for the brief: by id, exact title, then partial title; empty = every piece not yet published. */
function piecesFor(ctx: SpacePrintContext): ContentPiece[] {
  const all = ctx.space.content;
  const q = String(ctx.options.content ?? '').trim();
  if (!q) return all.filter((c) => c.stage !== 'published');
  const byId = all.filter((c) => c.id === q);
  if (byId.length) return byId;
  const lower = q.toLowerCase();
  const exact = all.filter((c) => (c.title || '').trim().toLowerCase() === lower);
  if (exact.length) return exact;
  return all.filter((c) => (c.title || '').toLowerCase().includes(lower));
}

const BRIEF_CSS = `
.sp-content-pb { }
.sp-content-pb-top { display: flex; gap: 14pt; align-items: flex-start; }
.sp-content-pb-top .sp-content-pb-kv { flex: 1; min-width: 0; }
.sp-content-pb-thumb { width: 150pt; flex-shrink: 0; }
.sp-content-pb-thumb.tall { width: 90pt; }
.sp-content-pb-stage { display: inline-flex; align-items: center; gap: 4pt; font-weight: 700; }
.sp-content-pb-text { font-size: 9.5pt; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.sp-content-pb-lead { font-size: 11pt; line-height: 1.4; font-weight: 600; white-space: pre-wrap; margin-bottom: 6pt; }
.sp-content-pb-script { font-family: 'Courier Prime', 'Courier New', monospace; font-size: 9.6pt; line-height: 1.5; white-space: pre-wrap; word-break: break-word; border-left: 2pt solid #d6d6de; padding-left: 9pt; }
.sp-content-pb-av { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.8pt; }
.sp-content-pb-av th { text-align: left; font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: #efeff3; padding: 4pt 5pt; border-bottom: 0.75pt solid #b9b9c3; }
.sp-content-pb-av td { padding: 4pt 5pt; vertical-align: top; border-bottom: 0.5pt solid #dcdce2; white-space: pre-wrap; word-break: break-word; }
.sp-content-pb-av tr { break-inside: avoid; page-break-inside: avoid; }
.sp-content-pb-av td.v { border-right: 0.5pt solid #dcdce2; }
.sp-content-pb-av td.n, .sp-content-pb-av td.t { color: #707078; font-variant-numeric: tabular-nums; }
.sp-content-pb-av td.t { text-align: right; white-space: nowrap; }
.sp-content-pb-av tr.seg td { background: #f4f3fa; font-weight: 700; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.08em; border-left: 2.5pt solid var(--pp-accent, #6d4aff); }
.sp-content-pb-av td.est { font-style: italic; }
.sp-content-pb-slides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6pt; }
.sp-content-pb-slide { border: 0.75pt solid #c9c9d1; border-radius: 3pt; padding: 5pt 7pt; break-inside: avoid; page-break-inside: avoid; }
.sp-content-pb-slide-n { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; margin-bottom: 2pt; }
.sp-content-pb-checks { columns: 2; column-gap: 16pt; }
.sp-content-pb-check { display: flex; gap: 5pt; align-items: baseline; padding: 1.5pt 0; break-inside: avoid; }
.sp-content-pb-check.done span:last-child { color: #8a8a94; text-decoration: line-through; }
.sp-content-pb-images { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5pt; }
.sp-content-pb-caption { white-space: pre-wrap; word-break: break-word; }
.sp-content-pb-tags { color: #3e6fd8; }
.sp-content-pb-empty { padding: 30pt 0; text-align: center; color: #707078; }
`;

const PLAN_CSS = `
.sp-content-pp-strip { display: flex; gap: 0; height: 7pt; border-radius: 4pt; overflow: hidden; margin: 2pt 0 4pt; }
.sp-content-pp-strip span { display: block; height: 100%; }
.sp-content-pp-legend { display: flex; flex-wrap: wrap; gap: 4pt 12pt; font-size: 7.6pt; color: #444; margin-bottom: 10pt; }
.sp-content-pp-title { font-weight: 650; }
.sp-content-pp-concept { font-size: 7.2pt; color: #6b6b75; margin-top: 1pt; }
.sp-content-pp-post { white-space: nowrap; font-size: 7.6pt; line-height: 1.5; }
.sp-content-pp-post.published { color: #2a7a4b; }
.sp-content-pp-post.skipped { color: #9a9aa4; text-decoration: line-through; }
.sp-content-pp-post.overdue { color: #c22d3a; font-weight: 650; }
.sp-content-pp-group { display: inline-flex; align-items: center; gap: 4pt; }
`;

function Brief({ c, ctx, first }: { c: ContentPiece; ctx: SpacePrintContext; first: boolean }) {
  const { space: s, fmt, options } = ctx;
  const pillar = s.pillars.find((p) => p.id === c.pillarId);
  const campaign = s.campaigns.find((p) => p.id === c.campaignId);
  const persona = s.personas.find((p) => p.id === c.personaId);
  const shoot = s.shoots.find((x) => x.id === c.shootId);
  const source = c.sourceId ? s.content.find((x) => x.id === c.sourceId) : undefined;
  const goals = (c.goalIds ?? []).map((id) => s.goals.find((g) => g.id === id)?.title).filter(Boolean) as string[];
  const ch = new Map(s.channels.map((x) => [x.id, x]));
  const stage = STAGE_BY_ID[c.stage];
  const words = spokenWords(c.script);
  const target = parseTarget(c.length);
  const av = c.avRows ?? [];
  const timing = avTiming(av);
  const parts = c.format === 'carousel' || hasParts(c.copy) ? splitParts(c.copy) : [];
  const aspect = aspectToNumber(c.aspect);
  const showScript = options.showScript !== false;
  const showPosts = options.showPosts !== false;
  const showImages = options.showImages !== false;
  const images = (c.images ?? []).slice(0, 12);

  const briefItems: [ReactNode, ReactNode][] = [
    ['Hook', c.hook],
    ['Call to action', c.cta],
    ['Audience', persona ? `${persona.name}${persona.summary ? ` — ${persona.summary}` : ''}` : ''],
    ['Supports goals', goals.join(' · ')],
    ['Keywords', c.keywords],
    ['References', c.references],
  ];

  return (
    <div className={['sp-content-pb', !first && 'pp-break-before'].filter(Boolean).join(' ')}>
      <SpaceDocHeader
        ctx={ctx}
        title={c.title || 'Untitled content'}
        subtitle={[formatName(c), stage?.label, pillar?.name, campaign?.name].filter(Boolean).join(' · ')}
        meta={
          <>
            Content brief
            <br />
            {ctx.today}
          </>
        }
      />
      <div className="sp-content-pb-top pp-avoid">
        <div className="sp-content-pb-kv">
          <KV
            cols={3}
            items={[
              ['Format', formatName(c)],
              [
                'Stage',
                <span className="sp-content-pb-stage">
                  <Dot color={stageColor(c.stage)} />
                  {stage?.label ?? c.stage}
                </span>,
              ],
              ['Priority', c.priority && c.priority !== 'normal' ? PRIORITY[c.priority] : ''],
              [
                'Pillar',
                pillar ? (
                  <>
                    <Dot color={pillar.color} />
                    {pillar.name}
                  </>
                ) : (
                  ''
                ),
              ],
              [
                'Campaign',
                campaign ? (
                  <>
                    <Dot color={campaign.color} />
                    {campaign.name}
                  </>
                ) : (
                  ''
                ),
              ],
              ['Owner', c.owner],
              ['Target length', c.length],
              ['Aspect ratio', c.aspect],
              ['Shoot', [c.shootDate ? fmt.dateMedium(c.shootDate) : '', shoot?.title].filter(Boolean).join(' · ')],
              ['Edit due', c.editDue ? fmt.dateMedium(c.editDue) : ''],
              ['Location', c.location],
              ['Talent', c.talent],
              ['Gear', c.gear],
              ['Repurposed from', source ? source.title : ''],
            ]}
          />
        </div>
        {showImages && c.thumbnail && (
          <div className={`sp-content-pb-thumb ${aspect < 1 ? 'tall' : ''}`}>
            <Photo src={ctx.asset(c.thumbnail)} aspect={aspect} />
          </div>
        )}
      </div>

      {(c.concept || briefItems.some(([, v]) => v)) && (
        <PSection title="Brief">
          {c.concept && <div className="sp-content-pb-lead">{c.concept}</div>}
          <KV cols={2} items={briefItems} />
        </PSection>
      )}

      {showScript && c.script?.trim() && (
        <PSection title="Script" right={`${words} spoken words · ~${formatSeconds(secondsForWords(words)) || '0:00'}${target.seconds ? ` · target ${formatSeconds(target.seconds)}` : ''}`}>
          <div className="sp-content-pb-script">{c.script}</div>
        </PSection>
      )}

      {showScript && av.length > 0 && (
        <PSection title="Two-column script" right={`${av.length} rows · ${formatSeconds(timing.total) || '0:00'}${timing.estimated ? ' (incl. estimates)' : ''}`}>
          <table className="sp-content-pb-av">
            <colgroup>
              <col style={{ width: '18pt' }} />
              <col style={{ width: '45%' }} />
              <col />
              <col style={{ width: '34pt' }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Visual</th>
                <th>Audio</th>
                <th style={{ textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {av.map((r, i) => (
                <Fragment key={r.id}>
                  {r.segment != null && r.segment.trim() && (
                    <tr className="seg">
                      <td colSpan={4}>{r.segment}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="n">{i + 1}</td>
                    <td className="v">{r.video}</td>
                    <td>{r.audio}</td>
                    <td className={`t ${timing.rows[i]?.estimated ? 'est' : ''}`}>{timing.rows[i]?.seconds ? formatSeconds(timing.rows[i].seconds) : ''}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </PSection>
      )}

      {showScript && c.copy?.trim() && (
        <PSection title={parts.length > 1 ? (c.format === 'carousel' ? `Copy · ${parts.length} slides` : `Copy · ${parts.length} parts`) : 'Copy'} right={`${c.copy.length.toLocaleString()} characters`}>
          {parts.length > 1 ? (
            <div className="sp-content-pb-slides">
              {parts.map((p, i) => (
                <div key={i} className="sp-content-pb-slide">
                  <div className="sp-content-pb-slide-n">
                    {c.format === 'carousel' ? 'Slide' : 'Part'} {i + 1} · {p.length} chars
                  </div>
                  <div className="sp-content-pb-text">{p || '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sp-content-pb-text">{c.copy}</div>
          )}
        </PSection>
      )}

      {c.shots.length > 0 && (
        <PSection title="Shot list" right={`${c.shots.length} shots · ${c.shots.filter((x) => x.done).length} done`}>
          <PTable
            zebra
            columns={[
              { header: '', width: '16pt', cell: (x) => <Check on={x.done} /> },
              { header: '#', width: '18pt', cell: (_x, i) => i + 1 },
              { header: 'Kind', width: '80pt', cell: (x) => label(SHOT_KINDS, x.kind) },
              { header: 'Description', cell: (x) => x.description },
              { header: 'Framing', width: '70pt', cell: (x) => x.framing ?? '' },
              { header: 'Sec', width: '30pt', num: true, cell: (x) => (x.duration != null ? x.duration : '') },
              { header: 'Location', width: '90pt', cell: (x) => x.location ?? '' },
            ]}
            rows={c.shots}
          />
        </PSection>
      )}

      {c.checklist.length > 0 && (
        <PSection title="Checklist" right={`${c.checklist.filter((x) => x.done).length} of ${c.checklist.length} done`}>
          <div className="sp-content-pb-checks">
            {c.checklist.map((i) => (
              <div key={i.id} className={`sp-content-pb-check ${i.done ? 'done' : ''}`}>
                <Check on={i.done} />
                <span>{i.text}</span>
              </div>
            ))}
          </div>
        </PSection>
      )}

      {showPosts && c.posts.length > 0 && (
        <PSection title="Posts">
          <PTable
            columns={[
              {
                header: 'Channel',
                width: '92pt',
                cell: (p) => {
                  const x = ch.get(p.channelId);
                  return (
                    <>
                      <Dot color={x ? channelColor(x) : '#8a8a94'} />
                      {x?.name ?? 'Deleted channel'}
                    </>
                  );
                },
              },
              { header: 'Date', width: '62pt', cell: (p) => (p.date ? fmt.dateMedium(p.date) : '—') },
              { header: 'Time', width: '40pt', cell: (p) => (p.time ? fmt.time(p.time) : '') },
              {
                header: 'Status',
                width: '58pt',
                cell: (p) => {
                  const st = POST_STATUSES.find((x) => x.value === p.status);
                  return <PBadge color={st?.color}>{st?.label ?? p.status}</PBadge>;
                },
              },
              {
                header: 'Title · caption',
                cell: (p) => (
                  <div className="sp-content-pb-caption">
                    {p.title && <div className="pp-strong">{p.title}</div>}
                    {p.caption}
                    {p.hashtags && <div className="sp-content-pb-tags">{p.hashtags}</div>}
                    {p.url && <div className="pp-muted pp-small">{p.url}</div>}
                  </div>
                ),
              },
            ]}
            rows={c.posts}
          />
        </PSection>
      )}

      {showImages && images.length > 0 && (
        <PSection title="References & frames">
          <div className="sp-content-pb-images">
            {images.map((n, i) => (
              <Photo key={`${n}-${i}`} src={ctx.asset(n)} aspect={1} />
            ))}
          </div>
        </PSection>
      )}

      {c.notes?.trim() && (
        <PSection title="Notes">
          <Pre>{c.notes}</Pre>
        </PSection>
      )}
    </div>
  );
}

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-content-brief',
    title: 'Content Brief',
    group: 'Content',
    orientation: 'portrait',
    description: 'One page per piece: brief, script or A/V table, copy, shot list, checklist and posts',
    options: [
      { key: 'content', label: 'Content', type: 'text', default: '', hint: 'Title of a piece; leave empty to print every piece that is not published yet (one per page)' },
      { key: 'showScript', label: 'Include script & copy', type: 'boolean', default: true },
      { key: 'showPosts', label: 'Include posts & captions', type: 'boolean', default: true },
      { key: 'showImages', label: 'Include thumbnail & images', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.content.length ? false : 'No content yet'),
    render: (ctx) => {
      const list = piecesFor(ctx);
      const q = String(ctx.options.content ?? '').trim();
      const single = list.length === 1 ? list[0] : undefined;
      return {
        css: BRIEF_CSS,
        title: single ? `Content Brief — ${single.title || 'Untitled content'}` : 'Content Briefs',
        fileName: single ? `${ctx.space.meta.title} - Brief - ${single.title || 'Untitled content'}` : undefined,
        body: list.length ? (
          <>
            {list.map((c, i) => (
              <Brief key={c.id} c={c} ctx={ctx} first={i === 0} />
            ))}
          </>
        ) : (
          <>
            <SpaceDocHeader ctx={ctx} title="Content Brief" />
            <div className="sp-content-pb-empty">{q ? `No content matches “${q}”.` : 'Every piece is published. Type a title in the Content option to print its brief.'}</div>
          </>
        ),
      };
    },
  },
  {
    id: 'space-content-plan',
    title: 'Content Plan',
    group: 'Content',
    orientation: 'landscape',
    description: 'Every piece in one table, grouped by stage, campaign or pillar, with channels, dates and checklist progress',
    options: [
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'select',
        default: 'stage',
        choices: [
          { value: 'stage', label: 'Stage' },
          { value: 'campaign', label: 'Campaign' },
          { value: 'pillar', label: 'Pillar' },
          { value: 'format', label: 'Format' },
          { value: 'owner', label: 'Owner' },
        ],
      },
      { key: 'hidePublished', label: 'Leave out published pieces', type: 'boolean', default: false },
      { key: 'showConcept', label: 'Show the concept under each title', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.content.length ? false : 'No content yet'),
    render: (ctx) => {
      const { space: s, fmt, options } = ctx;
      const groupBy = String(options.groupBy || 'stage');
      const pillars = new Map(s.pillars.map((p) => [p.id, p]));
      const campaigns = new Map(s.campaigns.map((p) => [p.id, p]));
      const ch = new Map(s.channels.map((x) => [x.id, x]));
      const stageIdx = (c: ContentPiece) => STAGES.findIndex((x) => x.value === c.stage);
      const rows = s.content
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !(options.hidePublished && c.stage === 'published'))
        .sort((a, b) => stageIdx(a.c) - stageIdx(b.c) || a.i - b.i)
        .map((x) => x.c);

      // group keys in display order
      const keyOf = (c: ContentPiece): string => {
        if (groupBy === 'campaign') return c.campaignId && campaigns.has(c.campaignId) ? c.campaignId : '';
        if (groupBy === 'pillar') return c.pillarId && pillars.has(c.pillarId) ? c.pillarId : '';
        if (groupBy === 'format') return c.format;
        if (groupBy === 'owner') return c.owner?.trim() ?? '';
        return c.stage;
      };
      const order =
        groupBy === 'campaign'
          ? [...campaigns.keys(), '']
          : groupBy === 'pillar'
            ? [...pillars.keys(), '']
            : groupBy === 'format'
              ? FORMATS.map((f) => f.value as string)
              : groupBy === 'owner'
                ? [...[...new Set(rows.map((c) => c.owner?.trim() ?? ''))].filter(Boolean).sort((a, b) => a.localeCompare(b)), '']
                : STAGES.map((x) => x.value as string);
      const sorted = [...rows].sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b)));
      const groupName = (k: string): string => {
        if (groupBy === 'campaign') return campaigns.get(k)?.name ?? 'No campaign';
        if (groupBy === 'pillar') return pillars.get(k)?.name ?? 'No pillar';
        if (groupBy === 'format') return FORMAT_BY_ID[k as ContentPiece['format']]?.label ?? 'Other';
        if (groupBy === 'owner') return k || 'Unassigned';
        return STAGE_BY_ID[k as ContentStage]?.label ?? k;
      };
      const groupColor = (k: string): string | undefined => {
        if (groupBy === 'campaign') return campaigns.get(k)?.color;
        if (groupBy === 'pillar') return pillars.get(k)?.color;
        if (groupBy === 'stage') return STAGE_BY_ID[k as ContentStage]?.color;
        return undefined;
      };
      const total = rows.length || 1;
      const counts = STAGES.map((st) => ({ st, n: rows.filter((c) => c.stage === st.value).length }));

      return {
        css: PLAN_CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Content Plan" subtitle={`${rows.length} piece${rows.length === 1 ? '' : 's'}${options.hidePublished ? ' in progress' : ''} · grouped by ${groupBy}`} />
            <div className="sp-content-pp-strip">
              {counts
                .filter((x) => x.n)
                .map((x) => (
                  <span key={x.st.value} style={{ width: `${(x.n / total) * 100}%`, background: x.st.color }} />
                ))}
            </div>
            <div className="sp-content-pp-legend">
              {counts.map((x) => (
                <span key={x.st.value}>
                  <Dot color={x.st.color!} />
                  {x.st.label} {x.n}
                </span>
              ))}
            </div>
            <PTable
              zebra
              rows={sorted}
              groupBy={(c) => keyOf(c) || '\u0000none'}
              groupLabel={(k, gr) => {
                const key = k === '\u0000none' ? '' : k;
                const color = groupColor(key);
                return (
                  <span className="sp-content-pp-group">
                    {color && <Dot color={color} />}
                    {groupName(key)} · {gr.length}
                  </span>
                );
              }}
              empty="No content to plan yet."
              columns={[
                {
                  header: 'Title',
                  cell: (c) => (
                    <>
                      <div className="sp-content-pp-title">
                        {c.priority === 'high' ? '⚑ ' : ''}
                        {c.title || 'Untitled content'}
                      </div>
                      {options.showConcept !== false && c.concept && <div className="sp-content-pp-concept">{c.concept.length > 140 ? `${c.concept.slice(0, 139)}…` : c.concept}</div>}
                    </>
                  ),
                },
                { header: 'Format', width: '78pt', cell: (c) => formatName(c) },
                ...(groupBy === 'stage'
                  ? []
                  : [
                      {
                        header: 'Stage',
                        width: '62pt',
                        cell: (c: ContentPiece) => (
                          <>
                            <Dot color={stageColor(c.stage)} />
                            {STAGE_BY_ID[c.stage]?.label ?? c.stage}
                          </>
                        ),
                      },
                    ]),
                ...(groupBy === 'pillar'
                  ? []
                  : [
                      {
                        header: 'Pillar',
                        width: '78pt',
                        cell: (c: ContentPiece) => {
                          const p = c.pillarId ? pillars.get(c.pillarId) : undefined;
                          return p ? (
                            <>
                              <Dot color={p.color} />
                              {p.name}
                            </>
                          ) : (
                            ''
                          );
                        },
                      },
                    ]),
                ...(groupBy === 'campaign'
                  ? []
                  : [
                      {
                        header: 'Campaign',
                        width: '78pt',
                        cell: (c: ContentPiece) => {
                          const p = c.campaignId ? campaigns.get(c.campaignId) : undefined;
                          return p ? p.name : '';
                        },
                      },
                    ]),
                ...(groupBy === 'owner' ? [] : [{ header: 'Owner', width: '62pt', cell: (c: ContentPiece) => c.owner ?? '' }]),
                {
                  header: 'Posts',
                  width: '150pt',
                  cell: (c) =>
                    c.posts.length ? (
                      <>
                        {c.posts.map((p) => {
                          const x = ch.get(p.channelId);
                          const overdue = !!p.date && p.date < ctx.todayISO && (p.status === 'draft' || p.status === 'scheduled');
                          return (
                            <div key={p.id} className={`sp-content-pp-post ${overdue ? 'overdue' : p.status}`}>
                              <Dot color={x ? channelColor(x) : '#8a8a94'} />
                              {x?.name ?? 'Deleted channel'} · {p.date ? fmt.dateMedium(p.date) : 'no date'}
                              {p.status === 'published' ? ' ✓' : ''}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <span className="pp-muted">Not planned</span>
                    ),
                },
                { header: 'Shoot', width: '56pt', cell: (c) => (c.shootDate ? fmt.dateMedium(c.shootDate) : '') },
                {
                  header: 'Checklist',
                  width: '46pt',
                  align: 'right',
                  cell: (c) => (c.checklist.length ? `${c.checklist.filter((i) => i.done).length}/${c.checklist.length}` : ''),
                },
              ]}
            />
          </>
        ),
      };
    },
  },
];
