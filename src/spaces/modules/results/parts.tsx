/* Results screen building blocks: KPI tiles, views chart, breakdown, top posts, goals. */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Target } from 'lucide-react';
import type { ID } from '@/types';
import type { Goal, SpaceData } from '@/spaces/types';
import { FORMAT_BY_ID, GOAL_STATUSES } from '@/spaces/constants';
import { channelColor, goalProgress, type PostRef } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { updateSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { Badge, NumberInput, Progress, StatusBadge, Tabs, UnderlineTabs } from '@/ui';
import { BREAKDOWNS, breakdown, compact, niceMax, percent, postValue, topPosts, type Bar, type BreakdownBy, type BreakdownRow, type Kpis, type TopSort } from './calc';

/* ---------------------------------------------------------------- KPI tiles */

function Delta({ value, points, label }: { value: number | null; points?: boolean; label: string }) {
  if (value == null || !isFinite(value)) return null;
  const up = value > 0;
  const flat = Math.abs(value) < (points ? 0.005 : 0.005);
  const Icon = up ? ArrowUp : ArrowDown;
  const text = points ? `${Math.abs(value).toFixed(1)} pt` : `${Math.abs(value * 100) >= 10 ? Math.abs(value * 100).toFixed(0) : Math.abs(value * 100).toFixed(1)}%`;
  return (
    <span className={`sp-results-delta ${flat ? 'flat' : up ? 'up' : 'down'}`} title={`vs ${label.toLowerCase()}`}>
      {!flat && <Icon size={11} />}
      {flat ? 'No change' : text}
    </span>
  );
}

export interface KpiDef {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  points?: boolean;
  title?: string;
}

export function buildKpis(cur: Kpis, prev: Kpis | null, fmtNumber: (n: number) => string): KpiDef[] {
  const rel = (a: number, b: number | undefined) => (prev && b ? (a - b) / b : null);
  return [
    { key: 'posts', label: 'Posts published', value: fmtNumber(cur.posts), sub: cur.posts ? `${cur.logged} with results` : 'in this period', delta: rel(cur.posts, prev?.posts) },
    { key: 'views', label: 'Views', value: compact(cur.views), sub: cur.impressions ? `${compact(cur.impressions)} impressions` : cur.posts ? `${compact(cur.posts ? cur.views / cur.posts : 0)} per post` : undefined, delta: rel(cur.views, prev?.views), title: fmtNumber(cur.views) },
    { key: 'eng', label: 'Engagement', value: compact(cur.engagement), sub: cur.engRate != null ? `${percent(cur.engRate)} of views` : 'likes, comments, shares, saves', delta: rel(cur.engagement, prev?.engagement), title: 'Likes + comments + shares + saves' },
    { key: 'followers', label: 'Followers gained', value: compact(cur.followers), delta: rel(cur.followers, prev?.followers) },
    { key: 'clicks', label: 'Link clicks', value: compact(cur.clicks), delta: rel(cur.clicks, prev?.clicks) },
    { key: 'conv', label: 'Conversions', value: compact(cur.conversions), sub: 'sign-ups, sales …', delta: rel(cur.conversions, prev?.conversions) },
    {
      key: 'ctr',
      label: 'Avg. CTR',
      value: cur.ctr != null ? `${cur.ctr.toFixed(cur.ctr >= 10 ? 0 : 1)}%` : '—',
      sub: cur.ctr == null ? 'log CTR or impressions' : 'click-through rate',
      delta: prev && prev.ctr != null && cur.ctr != null ? cur.ctr - prev.ctr : null,
      points: true,
    },
  ];
}

export function KpiGrid({ items, compareLabel }: { items: KpiDef[]; compareLabel?: string }) {
  return (
    <div className="sp-results-kpis">
      {items.map((k) => (
        <div key={k.key} className="sp-results-kpi" title={k.title}>
          <span className="label">{k.label}</span>
          <span className="value">{k.value}</span>
          <span className="sub">
            {compareLabel && <Delta value={k.delta ?? null} points={k.points} label={compareLabel} />}
            {k.sub != null && <span className="ellipsis">{k.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- views chart */

export function ViewsChart({ bars, unit, undated }: { bars: Bar[]; unit: 'week' | 'month'; undated: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(0, ...bars.map((b) => b.views))), [bars]);
  const total = bars.reduce((a, b) => a + b.views, 0);
  const posts = bars.reduce((a, b) => a + b.posts, 0);
  const every = Math.max(1, Math.ceil(bars.length / 10));
  const h = hover != null ? bars[hover] : null;
  return (
    <div className="sp-results-chart">
      <div className="sp-results-chart-plot" onMouseLeave={() => setHover(null)}>
        <div className="sp-results-chart-grid" aria-hidden>
          {[1, 0.5, 0].map((f) => (
            <div key={f} className="line" style={{ bottom: `${f * 100}%` }}>
              <span>{compact(max * f)}</span>
            </div>
          ))}
        </div>
        <div className="sp-results-bars" role="list" aria-label={`Views per ${unit}`} style={{ gap: bars.length > 40 ? 1 : 2 }}>
          {bars.map((b, i) => (
            <div
              key={b.start}
              role="listitem"
              tabIndex={0}
              className={`sp-results-barcol ${hover === i ? 'on' : ''}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${b.title}: ${b.views.toLocaleString()} views, ${b.posts} posts`}
            >
              {b.views > 0 ? (
                <div className="sp-results-bar" style={{ height: `${Math.max(1.5, (b.views / max) * 100)}%` }} />
              ) : b.posts > 0 ? (
                <div className="sp-results-bar pending" title="Published, no views logged yet" />
              ) : null}
            </div>
          ))}
        </div>
        {h && hover != null && (
          <div
            className="sp-results-tip"
            style={{ left: `${((hover + 0.5) / bars.length) * 100}%`, transform: `translateX(${(hover + 0.5) / bars.length < 0.2 ? '-10%' : (hover + 0.5) / bars.length > 0.8 ? '-90%' : '-50%'})` }}
          >
            <div className="t">{h.title}</div>
            <div>
              <b>{h.views.toLocaleString()}</b> views
            </div>
            <div className="muted">
              {h.posts} {h.posts === 1 ? 'post' : 'posts'} published
              {h.unlogged ? ` · ${h.unlogged} without views` : ''}
            </div>
          </div>
        )}
      </div>
      <div className="sp-results-xlabels" aria-hidden>
        {bars.map((b, i) => (
          <span key={b.start}>{i % every === 0 ? b.label : ''}</span>
        ))}
      </div>
      <div className="sp-results-chart-foot">
        <span>
          <b>{total.toLocaleString()}</b> views from {posts} {posts === 1 ? 'post' : 'posts'} · per {unit}
        </span>
        {bars.some((b) => b.unlogged > 0) && (
          <span className="row" style={{ gap: 6 }}>
            <span className="sp-results-legend-pending" /> published, views not logged
          </span>
        )}
        {undated > 0 && <span>{undated} published without a date not shown</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- breakdown */

type SortKey = 'label' | 'posts' | 'views' | 'engagement' | 'engRate' | 'clicks' | 'followers';

export function BreakdownCard({ refs, space }: { refs: PostRef[]; space: Pick<SpaceData, 'pillars' | 'campaigns'> }) {
  const [by, setBy] = useState<BreakdownBy>('channel');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => breakdown(refs, space, by), [refs, space, by]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const v = (r: BreakdownRow) => (sort.key === 'label' ? r.label.toLowerCase() : (r[sort.key] ?? -1));
    return [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir;
    });
  }, [rows, sort]);
  const maxShare = Math.max(0.0001, ...rows.map((r) => r.share));
  const th = (key: SortKey, label: string, num = true) => {
    const on = sort?.key === key;
    return (
      <th
        className={`sortable ${num ? 'num' : ''}`}
        aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
        onClick={() => setSort(on ? (sort!.dir === -1 ? { key, dir: 1 } : null) : { key, dir: key === 'label' ? 1 : -1 })}
      >
        <span className="row" style={{ gap: 3, display: 'inline-flex' }}>
          {label}
          {on && (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </span>
      </th>
    );
  };
  return (
    <div className="card sp-results-card">
      <div className="card-header sp-results-card-tabs">
        <h3>Breakdown</h3>
        <UnderlineTabs tabs={BREAKDOWNS.map((b) => ({ id: b.value, label: b.label }))} value={by} onChange={(v) => setBy(v)} />
      </div>
      <div className="table-wrap sp-results-tablewrap">
        <table className="table sp-results-table">
          <thead>
            <tr>
              {th('label', BREAKDOWNS.find((b) => b.value === by)!.label, false)}
              {th('posts', 'Posts')}
              {th('views', 'Views')}
              <th className="sp-results-sharecol">Share of views</th>
              {th('engagement', 'Engagement')}
              {th('engRate', 'Eng. rate')}
              {th('clicks', 'Clicks')}
              {th('followers', '+Followers')}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  Nothing published in this period.
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.key || 'none'} className={r.none ? 'sp-results-none' : undefined}>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="color-dot" style={{ background: r.color ?? 'var(--border-strong)' }} />
                    <span className="ellipsis">{r.label}</span>
                  </span>
                </td>
                <td className="num">{r.posts}</td>
                <td className="num strong">{r.views.toLocaleString()}</td>
                <td className="sp-results-sharecol">
                  <div className="sp-results-share">
                    <div style={{ width: `${(r.share / maxShare) * 100}%`, background: r.color ?? 'var(--accent)' }} />
                  </div>
                  <span className="muted tiny">{percent(r.share, 0)}</span>
                </td>
                <td className="num">{r.engagement.toLocaleString()}</td>
                <td className="num">{percent(r.engRate)}</td>
                <td className="num">{r.clicks.toLocaleString()}</td>
                <td className="num">{r.followers ? `+${r.followers.toLocaleString()}` : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- top posts */

export function TopPostsCard({ posts }: { posts: PostRef[] }) {
  const fmt = useSpaceFormatters();
  const [sort, setSort] = useState<TopSort>('views');
  const [all, setAll] = useState(false);
  const list = useMemo(() => topPosts(posts, sort), [posts, sort]);
  const total = posts.length;
  const shown = all ? list : list.slice(0, 10);
  return (
    <div className="card sp-results-card">
      <div className="card-header">
        <h3>Top posts</h3>
        <span className="muted small">{list.length ? `${list.length} of ${total} with results` : ''}</span>
        <div className="spacer" />
        <Tabs
          tabs={[
            { id: 'views', label: 'Views' },
            { id: 'engagement', label: 'Engagement' },
            { id: 'clicks', label: 'Clicks' },
          ]}
          value={sort}
          onChange={(v) => setSort(v as TopSort)}
        />
      </div>
      {list.length === 0 ? (
        <div className="sp-results-blank">{total ? 'Log views, likes or clicks for the published posts below to rank them here.' : 'Nothing published in this period.'}</div>
      ) : (
        <div className="table-wrap sp-results-tablewrap">
          <table className="table sp-results-table sp-results-top">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>Content</th>
                <th>Channel</th>
                <th>Date</th>
                <th className={`num ${sort === 'views' ? 'on' : ''}`}>Views</th>
                <th className={`num ${sort === 'engagement' ? 'on' : ''}`}>Engagement</th>
                <th className="num">Eng. rate</th>
                <th className={`num ${sort === 'clicks' ? 'on' : ''}`}>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const m = r.post.metrics;
                const eng = postValue(r, 'engagement');
                const Icon = FORMAT_BY_ID[r.content.format]?.icon;
                return (
                  <tr
                    key={r.post.id}
                    tabIndex={0}
                    className="sp-results-click"
                    onClick={() => openContent(r.content.id, 'results')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openContent(r.content.id, 'results');
                    }}
                    title="Open the results of this piece"
                  >
                    <td className="muted">{i + 1}</td>
                    <td>
                      <span className="row" style={{ gap: 6, minWidth: 0 }}>
                        {Icon && <Icon size={14} className="muted" style={{ flexShrink: 0 }} />}
                        <span className="ellipsis strong">{r.post.title?.trim() || r.content.title || 'Untitled content'}</span>
                      </span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="color-dot" style={{ background: channelColor(r.channel) }} />
                        <span className="ellipsis">{r.channel?.name ?? 'Deleted channel'}</span>
                      </span>
                    </td>
                    <td className="nowrap">{fmt.dateMedium(r.post.date) || '—'}</td>
                    <td className="num">{m?.views != null ? m.views.toLocaleString() : '—'}</td>
                    <td className="num">{eng.toLocaleString()}</td>
                    <td className="num">{m?.views ? percent(eng / m.views) : '—'}</td>
                    <td className="num">{m?.clicks != null ? m.clicks.toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > 10 && (
            <div className="sp-results-more">
              <button type="button" className="sp-results-link" onClick={() => setAll(!all)}>
                {all ? 'Show top 10' : `Show all ${list.length}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- goals */

function setGoalCurrent(id: ID, v: number | undefined) {
  updateSpace(
    (d) => {
      const g = d.goals.find((x) => x.id === id);
      if (g) g.current = v;
    },
    { coalesce: `goal:${id}:current` },
  );
}

export function GoalsCard({ goals }: { goals: Goal[] }) {
  const fmt = useSpaceFormatters();
  return (
    <div className="card sp-results-card">
      <div className="card-header">
        <Target size={14} className="muted" />
        <h3>Goals</h3>
        <div className="spacer" />
        <button type="button" className="sp-results-link" onClick={() => navigateSpace('strategy', { tab: 'goals' })}>
          {goals.length ? 'Manage' : 'Set goals'} <ArrowRight size={12} />
        </button>
      </div>
      {goals.length === 0 ? (
        <div className="sp-results-blank">No goals yet. Set measurable goals in Strategy (followers, trailer views, sign-ups…) and track them here.</div>
      ) : (
        <div className="sp-results-goals">
          {goals.map((g) => {
            const p = goalProgress(g);
            const color = GOAL_STATUSES.find((s) => s.value === g.status)?.color;
            return (
              <div key={g.id} className="sp-results-goal">
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="strong ellipsis" title={g.title}>
                      {g.title || 'Untitled goal'}
                    </div>
                    <div className="muted tiny ellipsis">
                      {[g.metric, g.due && `due ${fmt.dateMedium(g.due)}`].filter(Boolean).join(' · ') || 'No metric set'}
                    </div>
                  </div>
                  <StatusBadge value={g.status} options={GOAL_STATUSES} />
                </div>
                <div className="sp-results-goal-bar">
                  <Progress value={p ?? 0} color={color} />
                  <span className="pct">{p != null ? percent(p, 0) : '—'}</span>
                </div>
                <div className="sp-results-goal-nums">
                  <NumberInput size="sm" value={g.current} placeholder="Current" aria-label={`Current value of ${g.title}`} onChange={(v) => setGoalCurrent(g.id, v)} style={{ width: 100 }} />
                  <span className="muted small">
                    {g.target != null ? `of ${g.target.toLocaleString()}` : 'no target'} {g.unit ?? ''}
                    {g.baseline ? ` · from ${g.baseline.toLocaleString()}` : ''}
                  </span>
                  {p === 1 && g.status !== 'done' && (
                    <Badge tone="success" style={{ marginLeft: 'auto' }}>
                      Target reached
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
