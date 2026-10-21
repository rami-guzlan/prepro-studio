/* Printable documents of Campaigns & Milestones: the campaign plan. */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Check, Dot, KV, PBadge, PSection, PTable, Pre } from '@/print/components';
import { CAMPAIGN_STATUSES, FORMAT_BY_ID, POST_STATUSES, RESOURCE_TYPES, STAGE_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { useSpaceUI } from '@/spaces/ui';
import type { Campaign, SpaceMilestone } from '@/spaces/types';
import { optionColor, optionLabel } from '@/lib/constants';
import { MONTHS_SHORT, addDays, diffDays, parseISODate, toISODate } from '@/lib/dates';
import { campaignRange, campaignStats, isISO, readableOn, sortCampaigns, stripYear } from './logic';

const CSS = `
.spc-road { border: 0.75pt solid #c9c9d1; border-radius: 4pt; overflow: hidden; margin-bottom: 4pt; }
.spc-road-row { display: flex; border-top: 0.5pt solid #e1e1e7; min-height: 26pt; }
.spc-road-row:first-child { border-top: 0; }
.spc-road-label { width: 1.7in; flex-shrink: 0; padding: 4pt 6pt; font-size: 7.6pt; border-right: 0.75pt solid #c9c9d1; display: flex; flex-direction: column; justify-content: center; }
.spc-road-label b { font-size: 8pt; }
.spc-road-label span { color: #707078; font-size: 6.8pt; }
.spc-road-track { position: relative; flex: 1; }
.spc-road-head { min-height: 14pt; }
.spc-road-head .spc-road-track { height: 14pt; background: #f4f4f7; }
.spc-road-head .spc-road-label { background: #f4f4f7; font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #55555e; min-height: 14pt; }
.spc-month { position: absolute; top: 0; bottom: 0; border-left: 0.5pt solid #b9b9c3; padding: 2.5pt 3pt; font-size: 6.6pt; font-weight: 700; color: #44444d; white-space: nowrap; overflow: hidden; }
.spc-mline { position: absolute; top: 0; bottom: 0; border-left: 0.5pt solid #e4e4ea; }
.spc-bar { position: absolute; top: 9pt; height: 11pt; border-radius: 3pt; padding: 0 4pt; font-size: 6.6pt; font-weight: 700; line-height: 11pt; white-space: nowrap; overflow: hidden; }
.spc-dia { position: absolute; top: 1.2pt; width: 6.5pt; height: 6.5pt; margin-left: -3.25pt; transform: rotate(45deg); border: 1pt solid #333; background: #fff; }
.spc-dia.done { background: #333; }
.spc-dot { position: absolute; bottom: 1.4pt; width: 3.4pt; height: 3.4pt; margin-left: -1.7pt; border-radius: 50%; }
.spc-today { position: absolute; top: 0; bottom: 0; border-left: 1pt solid #e5484d; }
.spc-legend { display: flex; gap: 12pt; font-size: 7pt; color: #55555e; margin: 2pt 0 4pt; }
.spc-legend i { display: inline-block; vertical-align: -0.5pt; margin-right: 3pt; }
.spc-camp { margin-top: 14pt; }
.spc-camp-head { display: flex; align-items: center; gap: 8pt; padding: 5pt 8pt; border-radius: 4pt; margin-bottom: 6pt; break-after: avoid; page-break-after: avoid; }
.spc-camp-head h2 { font-size: 12.5pt; margin: 0; }
.spc-camp-head .when { margin-left: auto; font-size: 8pt; font-weight: 600; white-space: nowrap; }
.spc-two { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 12pt; margin-top: 6pt; }
.spc-sub { color: #707078; font-size: 7.2pt; }
.spc-done { color: #8a8a94; text-decoration: line-through; }
.spc-late { color: #d93036; font-weight: 700; }
.spc-post { white-space: nowrap; font-size: 7.4pt; }
`;

function dateSpan(fmt: { dateMedium: (s?: string | null) => string }, a?: string, b?: string): string {
  if (!a) return '—';
  if (!b || a === b) return fmt.dateMedium(a);
  return `${stripYear(fmt.dateMedium(a))} – ${fmt.dateMedium(b)}`;
}

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-campaign-plan',
    title: 'Campaign Plan',
    group: 'Strategy',
    orientation: 'landscape',
    description: 'Roadmap of every campaign with milestones, then each campaign’s objective, dates, channels, call to action, milestones and content with post dates and stages',
    options: [
      { key: 'showContent', label: 'Content lists', type: 'boolean', default: true },
      { key: 'showDetails', label: 'Descriptions & notes', type: 'boolean', default: true },
      { key: 'hideComplete', label: 'Hide completed campaigns', type: 'boolean', default: false },
      { key: 'pagePerCampaign', label: 'Each campaign on a new page', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (s.campaigns.length || s.milestones.length ? false : 'No campaigns or milestones yet'),
    render: (ctx) => {
      const s = ctx.space;
      const { fmt, options } = ctx;
      const today = ctx.todayISO;
      const campaigns = sortCampaigns(s.campaigns).filter((c) => !options.hideComplete || c.status !== 'complete');
      const shownIds = new Set(campaigns.map((c) => c.id));
      const allIds = new Set(s.campaigns.map((c) => c.id));
      const channels = new Map(s.channels.map((c) => [c.id, c]));
      const projects = new Map((useSpaceUI.getState().projects ?? []).map((p) => [p.id, p.title]));
      const msOf = (id: string) => s.milestones.filter((m) => m.campaignId === id).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
      const loose = s.milestones.filter((m) => !m.campaignId || !allIds.has(m.campaignId)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

      /* ---- roadmap range */
      const scheduled = campaigns.filter((c) => campaignRange(c).start);
      const dates: string[] = [];
      for (const c of scheduled) {
        const r = campaignRange(c);
        dates.push(r.start!, r.end!);
      }
      for (const m of s.milestones) if (isISO(m.date) && (!m.campaignId || shownIds.has(m.campaignId) || !allIds.has(m.campaignId))) dates.push(m.date);
      dates.sort();
      let rStart = '';
      let rEnd = '';
      let span = 0;
      const months: { key: string; label: string; left: number; width: number }[] = [];
      if (dates.length) {
        const a = parseISODate(dates[0])!;
        const b = parseISODate(dates[dates.length - 1])!;
        rStart = toISODate(new Date(a.getFullYear(), a.getMonth(), 1, 12));
        rEnd = toISODate(new Date(b.getFullYear(), b.getMonth() + 1, 0, 12));
        if (diffDays(rStart, rEnd) < 59) {
          const e = parseISODate(addDays(rStart, 59))!;
          rEnd = toISODate(new Date(e.getFullYear(), e.getMonth() + 1, 0, 12));
        }
        span = diffDays(rStart, rEnd) + 1;
        let m = rStart;
        while (m <= rEnd) {
          const d = parseISODate(m)!;
          const last = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
          months.push({ key: m, label: `${MONTHS_SHORT[d.getMonth()]}${d.getMonth() === 0 || m === rStart ? ` ${d.getFullYear()}` : ''}`, left: (diffDays(rStart, m) / span) * 100, width: ((diffDays(m, last) + 1) / span) * 100 });
          m = addDays(last, 1);
        }
      }
      const pct = (d: string) => (diffDays(rStart, d) / span) * 100;
      const todayIn = !!span && today >= rStart && today <= rEnd;
      const looseDated = loose.filter((m) => isISO(m.date));

      const roadmap = span ? (
        <div className="spc-road pp-avoid">
          <div className="spc-road-row spc-road-head">
            <div className="spc-road-label">Campaign</div>
            <div className="spc-road-track">
              {months.map((m) => (
                <div key={m.key} className="spc-month" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>
          {scheduled.map((c) => {
            const r = campaignRange(c);
            const color = c.color || '#7c5cff';
            const posts = s.content
              .filter((x) => x.campaignId === c.id)
              .flatMap((x) => x.posts.filter((p) => isISO(p.date) && p.status !== 'skipped' && p.date >= rStart && p.date <= rEnd).map((p) => ({ id: p.id, date: p.date!, color: channelColor(channels.get(p.channelId)) })));
            return (
              <div key={c.id} className="spc-road-row">
                <div className="spc-road-label">
                  <b>{c.name || 'Untitled campaign'}</b>
                  <span>{dateSpan(fmt, r.start, r.end)}</span>
                </div>
                <div className="spc-road-track">
                  {months.map((m) => (
                    <div key={m.key} className="spc-mline" style={{ left: `${m.left}%` }} />
                  ))}
                  <div className="spc-bar" style={{ left: `${pct(r.start!)}%`, width: `${Math.max(0.6, ((diffDays(r.start!, r.end!) + 1) / span) * 100)}%`, background: color, color: readableOn(color) }}>
                    {c.name}
                  </div>
                  {msOf(c.id)
                    .filter((m) => isISO(m.date) && m.date >= rStart && m.date <= rEnd)
                    .map((m) => (
                      <div key={m.id} className={`spc-dia ${m.done ? 'done' : ''}`} style={{ left: `${pct(m.date!) + 50 / span}%` }} />
                    ))}
                  {posts.map((p) => (
                    <div key={p.id} className="spc-dot" style={{ left: `${pct(p.date) + 50 / span}%`, background: p.color }} />
                  ))}
                  {todayIn && <div className="spc-today" style={{ left: `${pct(today) + 50 / span}%` }} />}
                </div>
              </div>
            );
          })}
          {looseDated.length > 0 && (
            <div className="spc-road-row">
              <div className="spc-road-label">
                <b>Other milestones</b>
                <span>not in a campaign</span>
              </div>
              <div className="spc-road-track">
                {months.map((m) => (
                  <div key={m.key} className="spc-mline" style={{ left: `${m.left}%` }} />
                ))}
                {looseDated.map((m) => (
                  <div key={m.id} className={`spc-dia ${m.done ? 'done' : ''}`} style={{ left: `${pct(m.date!) + 50 / span}%` }} />
                ))}
                {todayIn && <div className="spc-today" style={{ left: `${pct(today) + 50 / span}%` }} />}
              </div>
            </div>
          )}
        </div>
      ) : null;

      const milestoneTable = (rows: SpaceMilestone[], empty: string) => (
        <PTable
          rows={rows}
          empty={empty}
          columns={[
            { header: '', width: '12pt', cell: (m) => <Check on={m.done} /> },
            {
              header: 'Date',
              width: '62pt',
              cell: (m) => (isISO(m.date) ? <span className={!m.done && m.date < today ? 'spc-late' : ''}>{fmt.dateMedium(m.date)}</span> : '—'),
            },
            {
              header: 'Milestone',
              cell: (m) => (
                <>
                  <span className={m.done ? 'spc-done' : 'pp-strong'}>{m.name || 'Milestone'}</span>
                  {m.notes && <div className="spc-sub">{m.notes}</div>}
                </>
              ),
            },
          ]}
        />
      );

      const campaignSection = (c: Campaign, i: number) => {
        const r = campaignRange(c);
        const color = c.color || '#7c5cff';
        const st = campaignStats(c, s);
        const pieces = [...st.pieces].sort((a, b) => {
          const da = a.posts.map((p) => p.date).filter(isISO).sort()[0] ?? '9999';
          const db = b.posts.map((p) => p.date).filter(isISO).sort()[0] ?? '9999';
          return da.localeCompare(db);
        });
        const chNames = (c.channelIds ?? []).map((id) => channels.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
        return (
          <div key={c.id} className={`spc-camp ${options.pagePerCampaign && i > 0 ? 'pp-break-before' : ''}`}>
            <div className="spc-camp-head" style={{ background: `${color}1f`, borderLeft: `4pt solid ${color}` }}>
              <h2>{c.name || 'Untitled campaign'}</h2>
              <PBadge color={optionColor(CAMPAIGN_STATUSES, c.status)}>{optionLabel(CAMPAIGN_STATUSES, c.status)}</PBadge>
              <span className="when">
                {dateSpan(fmt, r.start, r.end)}
                {r.start && r.end ? ` · ${diffDays(r.start, r.end) + 1} days` : ''}
              </span>
            </div>
            <KV
              cols={4}
              items={[
                ['Objective', c.objective],
                ['Call to action / offer', c.cta],
                [
                  'Channels',
                  chNames.length ? (
                    <>
                      {chNames.map((ch) => (
                        <span key={ch.id} style={{ marginRight: '6pt', whiteSpace: 'nowrap' }}>
                          <Dot color={channelColor(ch)} />
                          {ch.name}
                        </span>
                      ))}
                    </>
                  ) : (
                    ''
                  ),
                ],
                ['Budget', c.budget ? fmt.money(c.budget, { cents: false }) : ''],
                ['Linked production', c.projectId ? projects.get(c.projectId) ?? 'Linked project' : ''],
                ['Content', `${st.pieces.length} piece${st.pieces.length === 1 ? '' : 's'} · ${st.published}/${st.postsTotal} posts published`],
                ['Milestones', st.msTotal ? `${st.msDone}/${st.msTotal} done` : ''],
                ['Resources', s.assets.filter((a) => a.campaignId === c.id).map((a) => `${a.name || a.fileName || 'Resource'}${a.resourceType ? ` (${optionLabel(RESOURCE_TYPES, a.resourceType).toLowerCase()}${a.gated ? ', gated' : ''})` : a.gated ? ' (gated)' : ''}`).join(' · ')],
              ]}
            />
            {options.showDetails && (c.description || c.notes) && (
              <div style={{ marginTop: '6pt' }}>
                {c.description && <Pre>{c.description}</Pre>}
                {c.notes && <Pre style={{ color: '#55555e', marginTop: '3pt' }}>{c.notes}</Pre>}
              </div>
            )}
            <div className="spc-two">
              <div>
                <div className="pp-section-title">Milestones</div>
                {milestoneTable(msOf(c.id), 'No milestones.')}
              </div>
              {options.showContent && (
                <div>
                  <div className="pp-section-title">Content</div>
                  <PTable
                    rows={pieces}
                    empty="No content in this campaign yet."
                    columns={[
                      {
                        header: 'Piece',
                        cell: (p) => (
                          <>
                            <div className="pp-strong">{p.title || 'Untitled content'}</div>
                            <div className="spc-sub">{FORMAT_BY_ID[p.format]?.label ?? p.format}</div>
                          </>
                        ),
                      },
                      { header: 'Stage', width: '56pt', cell: (p) => <PBadge color={STAGE_BY_ID[p.stage]?.color}>{STAGE_BY_ID[p.stage]?.label ?? p.stage}</PBadge> },
                      {
                        header: 'Posts',
                        width: '46%',
                        cell: (p) => {
                          const posts = [...p.posts].filter((x) => x.status !== 'skipped').sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
                          if (!posts.length) return <span className="pp-muted">Not planned</span>;
                          return posts.map((post) => {
                            const ch = channels.get(post.channelId);
                            return (
                              <div key={post.id} className="spc-post">
                                <Dot color={channelColor(ch)} />
                                {isISO(post.date) ? `${fmt.dateShort(post.date)}${post.time ? ` ${fmt.time(post.time)}` : ''}` : 'No date'} · {ch?.name ?? 'No channel'} ·{' '}
                                <span style={{ color: optionColor(POST_STATUSES, post.status) }}>{optionLabel(POST_STATUSES, post.status)}</span>
                              </div>
                            );
                          });
                        },
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>
        );
      };

      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader
              ctx={ctx}
              title="Campaign Plan"
              subtitle={[`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`, span ? `${fmt.dateMedium(rStart)} – ${fmt.dateMedium(rEnd)}` : ''].filter(Boolean).join(' · ')}
            />

            {roadmap && (
              <PSection title="Roadmap">
                {roadmap}
                <div className="spc-legend">
                  <span>
                    <i className="spc-dia" style={{ position: 'static', display: 'inline-block', margin: 0 }} /> Milestone
                  </span>
                  <span>
                    <i className="spc-dia done" style={{ position: 'static', display: 'inline-block', margin: 0 }} /> Done
                  </span>
                  <span>
                    <i className="spc-dot" style={{ position: 'static', display: 'inline-block', margin: 0, background: '#888' }} /> Post (channel colour)
                  </span>
                  {todayIn && (
                    <span>
                      <i style={{ display: 'inline-block', width: 0, height: '8pt', borderLeft: '1pt solid #e5484d' }} /> Today
                    </span>
                  )}
                </div>
              </PSection>
            )}

            {campaigns.length > 0 && (
              <PSection title="Overview">
                <PTable
                  rows={campaigns}
                  zebra
                  columns={[
                    {
                      header: 'Campaign',
                      cell: (c) => (
                        <span className="pp-strong">
                          <Dot color={c.color || '#7c5cff'} />
                          {c.name || 'Untitled campaign'}
                        </span>
                      ),
                    },
                    { header: 'Dates', width: '110pt', cell: (c) => dateSpan(fmt, campaignRange(c).start, campaignRange(c).end) },
                    { header: 'Objective', cell: (c) => c.objective ?? '' },
                    { header: 'Pieces', width: '40pt', num: true, cell: (c) => campaignStats(c, s).pieces.length },
                    {
                      header: 'Milestones',
                      width: '52pt',
                      num: true,
                      cell: (c) => {
                        const st = campaignStats(c, s);
                        return st.msTotal ? `${st.msDone}/${st.msTotal}` : '—';
                      },
                    },
                    { header: 'Status', width: '56pt', cell: (c) => <PBadge color={optionColor(CAMPAIGN_STATUSES, c.status)}>{optionLabel(CAMPAIGN_STATUSES, c.status)}</PBadge> },
                  ]}
                />
              </PSection>
            )}

            {campaigns.map((c, i) => campaignSection(c, i))}

            {loose.length > 0 && (
              <PSection title="Other milestones" className={options.pagePerCampaign ? 'pp-break-before' : undefined}>
                {milestoneTable(loose, 'None.')}
              </PSection>
            )}
          </>
        ),
      };
    },
  },
];
