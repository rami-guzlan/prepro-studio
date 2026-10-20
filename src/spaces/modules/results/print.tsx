/* Printable results report: KPIs, views over time, breakdowns, top 10 posts, goals. */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import { GOAL_STATUSES } from '@/spaces/constants';
import { channelColor, goalProgress } from '@/spaces/derive';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Dot, PBadge, PSection, PTable } from '@/print/components';
import { breakdown, BREAKDOWNS, compact, inRange, kpis, niceMax, percent, periodRange, PERIODS, postValue, previousRange, publishedPosts, topPosts, viewsSeries, type BreakdownRow, type PeriodId } from './calc';

const CSS = `
.rr-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6pt; }
.rr-kpi { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 5pt 7pt; break-inside: avoid; }
.rr-kpi .k { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; }
.rr-kpi .v { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.rr-kpi .s { font-size: 7pt; color: #707078; }
.rr-kpi .up { color: #1f8f4e; font-weight: 700; }
.rr-kpi .down { color: #c9303e; font-weight: 700; }
.rr-chart { display: flex; align-items: flex-end; gap: 1.5pt; height: 1.1in; border-bottom: 0.75pt solid #9a9aa4; padding-top: 4pt; }
.rr-col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
.rr-bar { width: 100%; background: #6d4aff; border-radius: 1.5pt 1.5pt 0 0; }
.rr-x { display: flex; gap: 1.5pt; margin-top: 2pt; }
.rr-x span { flex: 1; min-width: 0; font-size: 6pt; color: #7a7a84; white-space: nowrap; overflow: visible; }
.rr-chart-meta { display: flex; justify-content: space-between; font-size: 7pt; color: #707078; margin-bottom: 3pt; }
.rr-share { display: inline-block; height: 4pt; border-radius: 2pt; vertical-align: middle; margin-right: 4pt; }
.rr-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12pt; }
.rr-prog { display: inline-block; width: 0.8in; height: 4pt; background: #e6e6ec; border-radius: 2pt; overflow: hidden; vertical-align: middle; margin-right: 4pt; }
.rr-prog > span { display: block; height: 100%; border-radius: 2pt; }
.rr-note { font-size: 7.4pt; color: #707078; margin-top: 4pt; }
`;

function BreakdownTable({ rows, label }: { rows: BreakdownRow[]; label: string }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.share));
  return (
    <PTable
      zebra
      rows={rows}
      empty="Nothing published in this period."
      columns={[
        {
          header: label,
          width: '30%',
          cell: (r) => (
            <span style={{ color: r.none ? '#7a7a84' : undefined }}>
              <Dot color={r.color ?? '#c4c4cc'} />
              {r.label}
            </span>
          ),
        },
        { header: 'Posts', num: true, cell: (r) => r.posts },
        { header: 'Views', num: true, cell: (r) => <b>{r.views.toLocaleString()}</b> },
        {
          header: 'Share',
          width: '16%',
          cell: (r) => (
            <span className="pp-nowrap">
              <span className="rr-share" style={{ width: `${Math.max(1, (r.share / max) * 0.7 * 100)}%`, background: r.color ?? '#6d4aff', minWidth: '1pt' }} />
              {percent(r.share, 0)}
            </span>
          ),
        },
        { header: 'Engagement', num: true, cell: (r) => r.engagement.toLocaleString() },
        { header: 'Eng. rate', num: true, cell: (r) => percent(r.engRate) },
        { header: 'Clicks', num: true, cell: (r) => r.clicks.toLocaleString() },
        { header: '+Followers', num: true, cell: (r) => r.followers.toLocaleString() },
      ]}
    />
  );
}

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-results-report',
    title: 'Results Report',
    group: 'Results',
    orientation: 'portrait',
    description: 'KPIs, views over time, results by channel, format, pillar and campaign, top 10 posts and goal progress for a period',
    options: [
      { key: 'period', label: 'Period', type: 'select', default: '30', choices: PERIODS.map((p) => ({ value: p.value, label: p.label })) },
      { key: 'from', label: 'From (custom range)', type: 'text', default: '', hint: 'YYYY-MM-DD, used with Custom range' },
      { key: 'to', label: 'To (custom range)', type: 'text', default: '', hint: 'YYYY-MM-DD, used with Custom range' },
      { key: 'showChart', label: 'Views over time', type: 'boolean', default: true },
      { key: 'showCampaigns', label: 'By campaign', type: 'boolean', default: true },
      { key: 'showGoals', label: 'Goals', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.content.some((c) => c.posts.some((p) => p.status === 'published')) || s.goals.length ? false : 'Nothing is published yet'),
    render: (ctx) => {
      const { space, fmt, options } = ctx;
      const period = (PERIODS.some((p) => p.value === options.period) ? options.period : '30') as PeriodId;
      const range = periodRange(period, ctx.todayISO, options.from, options.to);
      const prevRange = previousRange(range, period);
      const published = publishedPosts(space);
      const refs = published.filter((r) => inRange(r.post.date, range));
      const k = kpis(refs);
      const prev = prevRange ? kpis(published.filter((r) => inRange(r.post.date, prevRange))) : null;
      const series = viewsSeries(refs, range, space.settings.weekStartsMonday, ctx.todayISO);
      const max = niceMax(Math.max(0, ...series.bars.map((b) => b.views)));
      const every = Math.max(1, Math.ceil(series.bars.length / 9));
      const top = topPosts(refs, 'views').slice(0, 10);
      const by = (b: (typeof BREAKDOWNS)[number]['value']) => breakdown(refs, space, b);
      const rangeText = range.from && range.to ? `${fmt.dateMedium(range.from)} – ${fmt.dateMedium(range.to)}` : range.from ? `From ${fmt.dateMedium(range.from)}` : range.to ? `Until ${fmt.dateMedium(range.to)}` : 'All time';
      const label = PERIODS.find((p) => p.value === period)?.label ?? range.label;

      const delta = (cur: number, p?: number) => {
        if (!prev || !p) return null;
        const d = (cur - p) / p;
        if (Math.abs(d) < 0.005) return <span> · no change</span>;
        return <span className={d > 0 ? 'up' : 'down'}> {d > 0 ? '▲' : '▼'} {Math.abs(d * 100).toFixed(Math.abs(d) >= 0.1 ? 0 : 1)}%</span>;
      };
      const tiles: [string, string, React.ReactNode][] = [
        ['Posts published', String(k.posts), <>{k.logged} with results{delta(k.posts, prev?.posts)}</>],
        ['Views', compact(k.views), <>{k.impressions ? `${compact(k.impressions)} impressions` : 'total'}{delta(k.views, prev?.views)}</>],
        ['Engagement', compact(k.engagement), <>{k.engRate != null ? `${percent(k.engRate)} of views` : 'likes, comments, shares, saves'}{delta(k.engagement, prev?.engagement)}</>],
        ['Followers gained', compact(k.followers), <>{delta(k.followers, prev?.followers) ?? 'total'}</>],
        ['Link clicks', compact(k.clicks), <>{delta(k.clicks, prev?.clicks) ?? 'total'}</>],
        ['Conversions', compact(k.conversions), <>{delta(k.conversions, prev?.conversions) ?? 'sign-ups, sales …'}</>],
        ['Avg. CTR', k.ctr != null ? `${k.ctr.toFixed(1)}%` : '—', 'click-through rate'],
        ['Watch time', k.watchHours ? `${compact(k.watchHours)} h` : '—', 'hours'],
      ];

      return {
        css: CSS,
        title: `Results Report · ${label}`,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Results Report" subtitle={`${label} · ${rangeText}`} meta={<>Printed {ctx.today}</>} />

            <div className="rr-kpis pp-avoid">
              {tiles.map(([kk, v, s]) => (
                <div key={kk} className="rr-kpi">
                  <div className="k">{kk}</div>
                  <div className="v">{v}</div>
                  <div className="s">{s}</div>
                </div>
              ))}
            </div>
            {prevRange && <div className="rr-note">Changes compared with {fmt.dateMedium(prevRange.from)} – {fmt.dateMedium(prevRange.to)}.</div>}

            {options.showChart && series.bars.length > 1 && (
              <PSection title={`Views per ${series.unit}`} className="pp-avoid">
                <div className="rr-chart-meta">
                  <span>
                    Scale 0 – {max.toLocaleString()} views
                  </span>
                  <span>{series.bars.reduce((a, b) => a + b.views, 0).toLocaleString()} views in total</span>
                </div>
                <div className="rr-chart">
                  {series.bars.map((b) => (
                    <div key={b.start} className="rr-col">
                      {b.views > 0 && <div className="rr-bar" style={{ height: `${Math.max(1, (b.views / max) * 100)}%` }} />}
                    </div>
                  ))}
                </div>
                <div className="rr-x">
                  {series.bars.map((b, i) => (
                    <span key={b.start}>{i % every === 0 ? b.label : ''}</span>
                  ))}
                </div>
              </PSection>
            )}

            <PSection title="By channel">
              <BreakdownTable rows={by('channel')} label="Channel" />
            </PSection>
            <PSection title="By format">
              <BreakdownTable rows={by('format')} label="Format" />
            </PSection>
            <PSection title="By pillar">
              <BreakdownTable rows={by('pillar')} label="Pillar" />
            </PSection>
            {options.showCampaigns && space.campaigns.length > 0 && (
              <PSection title="By campaign">
                <BreakdownTable rows={by('campaign')} label="Campaign" />
              </PSection>
            )}

            <PSection title="Top 10 posts" right="by views">
              <PTable
                zebra
                rows={top}
                empty={refs.length ? 'No results logged for the posts in this period.' : 'Nothing published in this period.'}
                columns={[
                  { header: '#', width: '4%', cell: (_r, i) => i + 1 },
                  { header: 'Content', width: '32%', cell: (r) => <span className="pp-strong">{r.post.title?.trim() || r.content.title || 'Untitled'}</span> },
                  {
                    header: 'Channel',
                    width: '16%',
                    cell: (r) => (
                      <>
                        <Dot color={channelColor(r.channel)} />
                        {r.channel?.name ?? 'Deleted channel'}
                      </>
                    ),
                  },
                  { header: 'Date', cell: (r) => <span className="pp-nowrap">{fmt.dateMedium(r.post.date) || '—'}</span> },
                  { header: 'Views', num: true, cell: (r) => (r.post.metrics?.views != null ? r.post.metrics.views.toLocaleString() : '—') },
                  { header: 'Eng.', num: true, cell: (r) => postValue(r, 'engagement').toLocaleString() },
                  { header: 'Eng. rate', num: true, cell: (r) => (r.post.metrics?.views ? percent(postValue(r, 'engagement') / r.post.metrics.views) : '—') },
                  { header: 'Clicks', num: true, cell: (r) => (r.post.metrics?.clicks != null ? r.post.metrics.clicks.toLocaleString() : '—') },
                ]}
              />
            </PSection>

            {options.showGoals && space.goals.length > 0 && (
              <PSection title="Goals">
                <PTable
                  zebra
                  rows={space.goals}
                  columns={[
                    {
                      header: 'Goal',
                      width: '30%',
                      cell: (g) => (
                        <>
                          <div className="pp-strong">{g.title}</div>
                          {g.metric && <div className="pp-small pp-muted">{g.metric}</div>}
                        </>
                      ),
                    },
                    { header: 'Baseline', num: true, cell: (g) => (g.baseline != null ? g.baseline.toLocaleString() : '—') },
                    { header: 'Current', num: true, cell: (g) => (g.current != null ? <b>{g.current.toLocaleString()}</b> : '—') },
                    { header: 'Target', num: true, cell: (g) => (g.target != null ? `${g.target.toLocaleString()}${g.unit ? ` ${g.unit}` : ''}` : '—') },
                    {
                      header: 'Progress',
                      width: '18%',
                      cell: (g) => {
                        const p = goalProgress(g);
                        const color = GOAL_STATUSES.find((s) => s.value === g.status)?.color ?? '#6d4aff';
                        return p == null ? (
                          '—'
                        ) : (
                          <span className="pp-nowrap">
                            <span className="rr-prog">
                              <span style={{ width: `${p * 100}%`, background: color }} />
                            </span>
                            {percent(p, 0)}
                          </span>
                        );
                      },
                    },
                    {
                      header: 'Status',
                      cell: (g) => {
                        const st = GOAL_STATUSES.find((s) => s.value === g.status);
                        return <PBadge color={st?.color}>{st?.label ?? g.status}</PBadge>;
                      },
                    },
                    { header: 'Due', cell: (g) => <span className="pp-nowrap">{fmt.dateMedium(g.due) || '—'}</span> },
                  ]}
                />
              </PSection>
            )}
          </>
        ),
      };
    },
  },
];
