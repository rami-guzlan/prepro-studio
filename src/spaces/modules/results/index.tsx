/* Results — how published content performs: KPIs for a period, views over time,
   breakdowns by channel / format / pillar / campaign, top posts, goal progress
   and a fast "log results" grid. */
import './results.css';
import { useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, ClipboardList, FolderKanban, History } from 'lucide-react';
import type { PostRef } from '@/spaces/derive';
import { FORMAT_BY_ID } from '@/spaces/constants';
import { getSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { todayISO } from '@/lib/dates';
import { plural, safeFileName } from '@/lib/text';
import { backend, exportCsv } from '@/backend';
import { Button, DateInput, EmptyState, ExportMenu, ModuleHeader, Tabs, toast, Toolbar } from '@/ui';
import { breakdown, BREAKDOWNS, inRange, kpis, periodRange, PERIODS, previousRange, publishedPosts, viewsSeries, type PeriodId } from './calc';
import { BreakdownCard, buildKpis, GoalsCard, KpiGrid, TopPostsCard, ViewsChart } from './parts';
import { LogResults } from './LogResults';

interface PeriodState {
  period: PeriodId;
  from?: string;
  to?: string;
}

const LS_KEY = 'prepro.sp-results.period';

/* ---------------------------------------------------------------- CSV */

async function exportPostsCsv(refs: PostRef[], label: string) {
  if (!refs.length) {
    toast('No published posts in this period', 'info');
    return;
  }
  const s = getSpace();
  const pillar = new Map(s.pillars.map((p) => [p.id, p.name]));
  const campaign = new Map(s.campaigns.map((c) => [c.id, c.name]));
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title || 'Space'} - Results - ${label}`), refs, [
      { header: 'Date', value: (r: PostRef) => r.post.date },
      { header: 'Content', value: (r) => r.content.title },
      { header: 'Post title', value: (r) => r.post.title },
      { header: 'Channel', value: (r) => r.channel?.name ?? 'Deleted channel' },
      { header: 'Format', value: (r) => FORMAT_BY_ID[r.content.format]?.label ?? r.content.format },
      { header: 'Pillar', value: (r) => (r.content.pillarId ? pillar.get(r.content.pillarId) : '') },
      { header: 'Campaign', value: (r) => (r.content.campaignId ? campaign.get(r.content.campaignId) : '') },
      { header: 'URL', value: (r) => r.post.url },
      { header: 'Impressions', value: (r) => r.post.metrics?.impressions },
      { header: 'Views', value: (r) => r.post.metrics?.views },
      { header: 'Likes', value: (r) => r.post.metrics?.likes },
      { header: 'Comments', value: (r) => r.post.metrics?.comments },
      { header: 'Shares', value: (r) => r.post.metrics?.shares },
      { header: 'Saves', value: (r) => r.post.metrics?.saves },
      { header: 'Clicks', value: (r) => r.post.metrics?.clicks },
      { header: 'CTR %', value: (r) => r.post.metrics?.ctr },
      { header: 'Watch hours', value: (r) => r.post.metrics?.watchHours },
      { header: 'Avg view (s)', value: (r) => r.post.metrics?.avgViewSec },
      { header: 'Followers gained', value: (r) => r.post.metrics?.followersGained },
      { header: 'Conversions', value: (r) => r.post.metrics?.conversions },
      { header: 'Results updated', value: (r) => r.post.metricsAt },
    ]);
    if (path) toast(`Exported ${plural(refs.length, 'post')} to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind === 'web') toast('Results CSV downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

async function exportBreakdownCsv(refs: PostRef[], label: string) {
  if (!refs.length) {
    toast('No published posts in this period', 'info');
    return;
  }
  const s = getSpace();
  const rows = BREAKDOWNS.flatMap((b) => breakdown(refs, s, b.value).map((r) => ({ ...r, by: b.label })));
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title || 'Space'} - Results breakdown - ${label}`), rows, [
      { header: 'By', value: (r) => r.by },
      { header: 'Group', value: (r) => r.label },
      { header: 'Posts', value: (r) => r.posts },
      { header: 'Views', value: (r) => r.views },
      { header: 'Share of views %', value: (r) => Math.round(r.share * 1000) / 10 },
      { header: 'Engagement', value: (r) => r.engagement },
      { header: 'Engagement rate %', value: (r) => (r.engRate != null ? Math.round(r.engRate * 1000) / 10 : '') },
      { header: 'Clicks', value: (r) => r.clicks },
      { header: 'Followers gained', value: (r) => r.followers },
      { header: 'Conversions', value: (r) => r.conversions },
    ]);
    if (path) toast(`Exported breakdown to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind === 'web') toast('Breakdown CSV downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/* ---------------------------------------------------------------- module */

export default function ResultsModule() {
  const content = useSpace((s) => s.content) ?? [];
  const channels = useSpace((s) => s.channels) ?? [];
  const pillars = useSpace((s) => s.pillars) ?? [];
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const goals = useSpace((s) => s.goals) ?? [];
  const mondayFirst = useSpace((s) => s.settings?.weekStartsMonday) ?? true;
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const logRef = useRef<HTMLDivElement>(null);

  const [ps, setPs] = useState<PeriodState>(() => {
    const v = readLS<PeriodState | null>(LS_KEY, null);
    return v && PERIODS.some((p) => p.value === v.period) ? v : { period: '30' };
  });
  const setPeriod = (next: PeriodState) => {
    setPs(next);
    writeLS(LS_KEY, next);
  };

  const range = useMemo(() => periodRange(ps.period, today, ps.from, ps.to), [ps, today]);
  const prevRange = useMemo(() => previousRange(range, ps.period), [range, ps.period]);
  const published = useMemo(() => publishedPosts({ content, channels }), [content, channels]);
  const inPeriod = useMemo(() => published.filter((r) => inRange(r.post.date, range)), [published, range]);
  const cur = useMemo(() => kpis(inPeriod), [inPeriod]);
  const prev = useMemo(() => (prevRange ? kpis(published.filter((r) => inRange(r.post.date, prevRange))) : null), [published, prevRange]);
  const series = useMemo(() => viewsSeries(inPeriod, range, mondayFirst, today), [inPeriod, range, mondayFirst, today]);
  const kpiItems = useMemo(() => buildKpis(cur, prev, (n) => fmt.number(n)), [cur, prev, fmt]);
  const space = useMemo(() => ({ pillars, campaigns }), [pillars, campaigns]);
  const missing = useMemo(() => published.filter((r) => !r.post.metrics || !Object.values(r.post.metrics).some((v) => v != null)).length, [published]);

  const rangeText = range.from && range.to ? `${fmt.dateMedium(range.from)} – ${fmt.dateMedium(range.to)}` : range.from ? `from ${fmt.dateMedium(range.from)}` : range.to ? `until ${fmt.dateMedium(range.to)}` : 'all time';
  const periodLabel = PERIODS.find((p) => p.value === ps.period)?.label ?? range.label;
  const printOptions = { period: ps.period, from: range.from ?? '', to: range.to ?? '' };

  return (
    <div className="module sp-results">
      <ModuleHeader
        title="Results"
        icon={BarChart3}
        subtitle={published.length ? `${periodLabel} · ${rangeText} · ${plural(inPeriod.length, 'post')} published` : 'Performance of published content and progress on goals'}
        actions={
          <>
            {missing > 0 && (
              <Button icon={ClipboardList} onClick={() => logRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                Log results ({missing})
              </Button>
            )}
            <ExportMenu
              docs={[{ id: 'space-results-report', label: 'Results report', options: printOptions }]}
              csv={[
                { label: 'Published posts with results (CSV)', onClick: () => exportPostsCsv(inPeriod, periodLabel) },
                { label: 'Breakdown tables (CSV)', onClick: () => exportBreakdownCsv(inPeriod, periodLabel) },
              ]}
            />
          </>
        }
      />
      {published.length > 0 && (
        <Toolbar>
          <Tabs tabs={PERIODS.map((p) => ({ id: p.value, label: p.short }))} value={ps.period} onChange={(v) => setPeriod({ period: v, from: v === 'custom' ? ps.from ?? range.from : ps.from, to: v === 'custom' ? ps.to ?? range.to : ps.to })} />
          {ps.period === 'custom' && (
            <div className="row" style={{ gap: 6 }}>
              <DateInput size="sm" value={ps.from} onChange={(from) => setPeriod({ ...ps, from })} title="From" />
              <span className="muted">–</span>
              <DateInput size="sm" value={ps.to} onChange={(to) => setPeriod({ ...ps, to })} title="To" />
            </div>
          )}
          <div className="spacer" />
          <span className="muted small">
            {rangeText}
            {prevRange ? ` · compared with ${fmt.dateMedium(prevRange.from)} – ${fmt.dateMedium(prevRange.to)}` : ''}
          </span>
        </Toolbar>
      )}
      <div className="module-body">
        {published.length === 0 ? (
          <div className="sp-results-page">
            <EmptyState
              icon={BarChart3}
              title="No results yet"
              description="Results come from posts marked Published. When a piece goes live, open it in Content, mark its post Published on the Publish tab and paste the link. Then log views, likes and clicks here (or on the piece's Results tab) and this page fills with KPIs, charts, top posts and goal progress."
              action={
                <div className="row" style={{ gap: 8 }}>
                  <Button variant="primary" icon={FolderKanban} onClick={() => navigateSpace('content')}>
                    Go to Content
                  </Button>
                  <Button icon={CalendarDays} onClick={() => navigateSpace('calendar')}>
                    Open Calendar
                  </Button>
                </div>
              }
            />
            {goals.length > 0 && (
              <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
                <GoalsCard goals={goals} />
              </div>
            )}
          </div>
        ) : (
          <div className="sp-results-page">
            <KpiGrid items={kpiItems} compareLabel={prevRange?.label} />

            {inPeriod.length === 0 && (
              <div className="sp-results-nothing">
                <History size={15} />
                <span>Nothing was published {ps.period === 'custom' ? 'in this range' : `in the ${periodLabel.toLowerCase()}`}.</span>
                <button type="button" className="sp-results-link" onClick={() => setPeriod({ ...ps, period: 'all' })}>
                  Show all time
                </button>
              </div>
            )}

            <div className="sp-results-grid">
              <div className="card sp-results-card">
                <div className="card-header">
                  <h3>Views per {series.unit}</h3>
                  <span className="muted small">{periodLabel}</span>
                </div>
                <div className="card-body">
                  {series.bars.length ? <ViewsChart bars={series.bars} unit={series.unit} undated={series.undated} /> : <div className="sp-results-blank">No dated posts in this period.</div>}
                </div>
              </div>
              <GoalsCard goals={goals} />
            </div>

            <BreakdownCard refs={inPeriod} space={space} />
            <TopPostsCard posts={inPeriod} />
            <LogResults ref={logRef} published={published} />
          </div>
        )}
      </div>
    </div>
  );
}
