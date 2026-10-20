/* Content editor › Results: metrics per post, when they were measured,
   learnings, and totals / engagement for the whole piece. */
import { useMemo } from 'react';
import { BarChart3, ExternalLink, Trophy } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { METRICS, POST_STATUSES } from '@/spaces/constants';
import { channelColor, engagement, sumMetrics } from '@/spaces/derive';
import type { Channel, ContentPiece, ContentPost, PostMetrics } from '@/spaces/types';
import { todayISO } from '@/lib/dates';
import { formatSeconds } from '@/lib/format';
import { DateInput, EmptyState, Field, IconButton, NumberInput, Textarea } from '@/ui';
import { openUrl, updateContent } from './shared';

function setMetric(contentId: ID, postId: ID, key: keyof PostMetrics, v: number | undefined) {
  updateContent(
    contentId,
    (c) => {
      const p = c.posts.find((x) => x.id === postId);
      if (!p) return;
      const m: PostMetrics = { ...(p.metrics ?? {}) };
      if (v == null || isNaN(v)) delete m[key];
      else m[key] = v;
      if (Object.keys(m).length) p.metrics = m;
      else delete p.metrics;
      if (v != null && !p.metricsAt) p.metricsAt = todayISO();
    },
    `post:${postId}:m:${key}`,
  );
}

function rate(num: number, den: number | undefined): string {
  if (!den) return '';
  return `${((num / den) * 100).toFixed(num / den < 0.1 ? 2 : 1)}%`;
}

export function ResultsTab({ c }: { c: ContentPiece }) {
  const channels = useSpace((s) => s.channels) ?? [];
  const fmt = useSpaceFormatters();
  const chMap = useMemo(() => new Map(channels.map((ch) => [ch.id, ch])), [channels]);
  const totals = useMemo(() => sumMetrics(c.posts), [c.posts]);
  const eng = engagement(totals);
  const reach = totals.views ?? totals.impressions;
  const top = useMemo(() => {
    let best: ContentPost | undefined;
    let score = 0;
    for (const p of c.posts) {
      const s = (p.metrics?.views ?? p.metrics?.impressions ?? 0) + engagement(p.metrics) * 5;
      if (s > score) {
        score = s;
        best = p;
      }
    }
    return c.posts.filter((p) => p.metrics).length > 1 ? best?.id : undefined;
  }, [c.posts]);

  if (!c.posts.length) {
    return (
      <div className="sp-content-tab">
        <EmptyState icon={BarChart3} title="No posts to measure yet" description="Plan where this piece goes in the Publish tab. Once posts are live, log views, engagement and what you learned here." />
      </div>
    );
  }

  const stats: { label: string; value: string; sub?: string }[] = [];
  const num = (n?: number, d = 0) => (n == null ? '' : fmt.number(n, d));
  if (totals.views != null) stats.push({ label: 'Views', value: num(totals.views) });
  if (totals.impressions != null) stats.push({ label: 'Impressions', value: num(totals.impressions) });
  stats.push({ label: 'Engagement', value: num(eng) || '0', sub: reach ? `${rate(eng, reach)} of ${totals.views != null ? 'views' : 'impressions'}` : 'likes + comments + shares + saves' });
  if (totals.clicks != null) stats.push({ label: 'Link clicks', value: num(totals.clicks), sub: totals.impressions ? `${rate(totals.clicks, totals.impressions)} CTR` : undefined });
  if (totals.followersGained != null) stats.push({ label: 'Followers gained', value: num(totals.followersGained) });
  if (totals.conversions != null) stats.push({ label: 'Conversions', value: num(totals.conversions) });
  if (totals.watchHours != null) stats.push({ label: 'Watch time', value: `${num(totals.watchHours, 1)} h` });
  if (totals.avgViewSec != null) stats.push({ label: 'Avg. view duration', value: formatSeconds(totals.avgViewSec), sub: 'average over posts' });
  if (totals.ctr != null) stats.push({ label: 'Avg. CTR', value: `${num(totals.ctr, 2)}%` });

  return (
    <div className="sp-content-tab sp-content-results">
      <div className="stat-grid" style={{ marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
            {s.sub && <span className="sub">{s.sub}</span>}
          </div>
        ))}
        <div className="stat">
          <span className="label">Posts measured</span>
          <span className="value">
            {totals.posts} / {c.posts.filter((p) => p.status !== 'skipped').length}
          </span>
        </div>
      </div>
      <div className="sp-content-results-list">
        {c.posts.map((p) => (
          <ResultCard key={p.id} c={c} post={p} channel={chMap.get(p.channelId)} top={top === p.id} />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ c, post, channel, top }: { c: ContentPiece; post: ContentPost; channel?: Channel; top: boolean }) {
  const fmt = useSpaceFormatters();
  const m = post.metrics ?? {};
  const eng = engagement(post.metrics);
  const reach = m.views ?? m.impressions;
  const status = POST_STATUSES.find((s) => s.value === post.status);
  return (
    <div className={`sp-content-result ${post.status}`} style={{ ['--ch' as string]: channel ? channelColor(channel) : '#8a8a94' }}>
      <div className="sp-content-result-head">
        <span className="sp-content-post-swatch" />
        <span className="strong ellipsis">{channel?.name ?? 'Deleted channel'}</span>
        {top && (
          <span className="sp-content-top" title="Best performing post of this piece">
            <Trophy size={12} /> Top
          </span>
        )}
        <span className="muted small">
          {post.date ? fmt.dateMedium(post.date) : 'Unscheduled'} · {status?.label ?? post.status}
        </span>
        {post.url && <IconButton icon={ExternalLink} size="sm" label="Open the live post" onClick={() => openUrl(post.url!)} />}
        <div className="spacer" />
        <span className="small text-2">
          Engagement <strong>{fmt.number(eng)}</strong>
          {reach ? ` · ${rate(eng, reach)}` : ''}
        </span>
        <Field label="Measured on" className="sp-content-result-at">
          <DateInput size="sm" value={post.metricsAt} onChange={(v) => updateContent(c.id, (x) => {
            const p = x.posts.find((q) => q.id === post.id);
            if (!p) return;
            if (v) p.metricsAt = v;
            else delete p.metricsAt;
          })} />
        </Field>
      </div>
      <div className="sp-content-metrics">
        {METRICS.map((mt) => (
          <label key={mt.key} className="sp-content-metric">
            <span>{mt.label}</span>
            <NumberInput size="sm" value={m[mt.key]} placeholder="—" onChange={(v) => setMetric(c.id, post.id, mt.key, v)} aria-label={mt.label} />
          </label>
        ))}
      </div>
      <Field label="Notes & learnings">
        <Textarea
          autoGrow
          minRows={1}
          value={post.notes}
          placeholder="What worked, what didn’t, what to try next time…"
          onChange={(v) =>
            updateContent(
              c.id,
              (x) => {
                const p = x.posts.find((q) => q.id === post.id);
                if (!p) return;
                if (v) p.notes = v;
                else delete p.notes;
              },
              `post:${post.id}:notes`,
            )
          }
        />
      </Field>
    </div>
  );
}
