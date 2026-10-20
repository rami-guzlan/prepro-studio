/* "Log results": fast entry of views / likes / comments / shares / saves / clicks
   for published posts (writes post.metrics + metricsAt = today). */
import { forwardRef, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, ClipboardList, ExternalLink, PanelRightOpen } from 'lucide-react';
import type { ID } from '@/types';
import type { PostMetrics } from '@/spaces/types';
import { channelColor, type PostRef } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { updateSpace, useSpaceFormatters } from '@/store/space';
import { todayISO } from '@/lib/dates';
import { backend } from '@/backend';
import { Checkbox, IconButton, NumberInput } from '@/ui';
import { hasMetrics } from './calc';

const FIELDS: { key: keyof PostMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'clicks', label: 'Clicks' },
];

function setMetric(contentId: ID, postId: ID, key: keyof PostMetrics, v: number | undefined) {
  updateSpace(
    (d) => {
      const p = d.content.find((c) => c.id === contentId)?.posts.find((x) => x.id === postId);
      if (!p) return;
      const m: PostMetrics = { ...(p.metrics ?? {}) };
      if (v == null || isNaN(v)) delete m[key];
      else m[key] = Math.max(0, v);
      const any = Object.values(m).some((x) => x != null);
      p.metrics = any ? m : undefined;
      p.metricsAt = any ? todayISO() : undefined;
    },
    { coalesce: `post:${postId}:metric:${key}` },
  );
}

function openUrl(url: string) {
  const u = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  if (backend.openExternal) backend.openExternal(u);
  else window.open(u, '_blank', 'noopener');
}

/** Enter moves to the next field (row by row), Shift+Enter to the previous one. */
function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Enter') return;
  const t = e.target as HTMLElement;
  if (t.tagName !== 'INPUT') return;
  const inputs = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input.sp-results-metric'));
  const i = inputs.indexOf(t as HTMLInputElement);
  if (i < 0) return;
  e.preventDefault();
  const next = inputs[i + (e.shiftKey ? -1 : 1)];
  if (next) next.focus();
  else (t as HTMLInputElement).blur();
}

export const LogResults = forwardRef<HTMLDivElement, { published: PostRef[] }>(function LogResults({ published }, ref) {
  const fmt = useSpaceFormatters();
  const [touched, setTouched] = useState<Set<ID>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const missing = useMemo(() => published.filter((r) => !hasMetrics(r.post)).length, [published]);
  const rows = useMemo(
    () =>
      published
        .filter((r) => showAll || !hasMetrics(r.post) || touched.has(r.post.id))
        .sort((a, b) => (b.post.date ?? '').localeCompare(a.post.date ?? '') || (b.post.time ?? '').localeCompare(a.post.time ?? '')),
    [published, showAll, touched],
  );
  const touch = (id: ID) => {
    if (!touched.has(id)) setTouched((s) => new Set(s).add(id));
  };
  const done = (id: ID) =>
    setTouched((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  return (
    <div className="card sp-results-card sp-results-log" ref={ref} id="sp-results-log">
      <div className="card-header">
        <ClipboardList size={14} className="muted" />
        <h3>Log results</h3>
        <span className={`badge ${missing ? 'warning' : 'success'}`}>{missing ? `${missing} ${missing === 1 ? 'post needs' : 'posts need'} results` : 'All caught up'}</span>
        <div className="spacer" />
        <Checkbox checked={showAll} onChange={setShowAll} label="Show every published post" />
      </div>
      {rows.length === 0 ? (
        <div className="sp-results-blank">
          {published.length === 0
            ? 'Posts appear here once they are marked Published in the content editor.'
            : 'Every published post has results. Tick “Show every published post” to update the numbers after a few days.'}
        </div>
      ) : (
        <>
          <div className="sp-results-log-hint muted small">Check each platform, type the numbers in; Enter jumps to the next field. Saved instantly with today’s date.</div>
          <div className="table-wrap sp-results-tablewrap" onKeyDown={onGridKey}>
            <table className="table sp-results-table sp-results-logtable">
              <thead>
                <tr>
                  <th>Post</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="num">
                      {f.label}
                    </th>
                  ))}
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.post;
                  const filled = hasMetrics(p);
                  return (
                    <tr key={p.id} className={filled ? 'filled' : undefined}>
                      <td>
                        <div className="sp-results-logpost">
                          <span className="color-dot" style={{ background: channelColor(r.channel) }} />
                          <div className="grow">
                            <div className="strong ellipsis" title={r.content.title}>
                              {p.title?.trim() || r.content.title || 'Untitled content'}
                            </div>
                            <div className="muted tiny ellipsis">
                              {r.channel?.name ?? 'Deleted channel'} · {p.date ? fmt.dateMedium(p.date) : 'no date'}
                              {p.metricsAt ? ` · updated ${fmt.dateMedium(p.metricsAt)}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      {FIELDS.map((f) => (
                        <td key={f.key} className="num">
                          <NumberInput
                            size="sm"
                            className="sp-results-metric"
                            value={p.metrics?.[f.key]}
                            placeholder="—"
                            aria-label={`${f.label} for ${r.content.title} on ${r.channel?.name ?? 'channel'}`}
                            onChange={(v) => {
                              touch(p.id);
                              setMetric(r.content.id, p.id, f.key, v == null ? undefined : Math.round(v));
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                          {p.url?.trim() && <IconButton icon={ExternalLink} label="Open the live post" size="sm" onClick={() => openUrl(p.url!)} />}
                          <IconButton icon={PanelRightOpen} label="Open results in the content editor" size="sm" onClick={() => openContent(r.content.id, 'results')} />
                          {touched.has(p.id) && filled && !showAll && <IconButton icon={Check} label="Done — hide this row" size="sm" onClick={() => done(p.id)} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
});
