/* Small chart kit (SVG + HTML) shared by Business, Personal Finances and Training.

   Rules (see the data-viz method used across the app):
   - colour by job: series colours come from the validated categorical order
     (--viz-1 … --viz-8, light and dark steps), assigned in fixed order by the
     caller's series index — never cycled, never by rank;
   - one y-axis per chart; thin marks (2px lines, rounded bar ends at the
     baseline, 2px gaps); recessive grid; text stays in text colours;
   - every plot has a hover layer (crosshair + tooltip on lines, per-mark
     tooltips on bars) and an aria label; >= 2 series get a legend.

   LineChart   time series (ISO dates or numbers on x), optional dashed projection
               series and a horizontal target line
   BarChart    one value per category / period (vertical)
   BarList     ranked horizontal bars with values (categories, merchants)
   Sparkline   tiny inline trend
   StatTile    headline number with label and delta
   Meter       progress towards a target */
import './charts.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const VIZ = (i: number) => `var(--viz-${(i % 8) + 1})`;

/* ---------------------------------------------------------------- helpers */

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const step = niceMax((hi - lo) / 4) / 2 || 1;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

const toX = (x: string | number) => (typeof x === 'number' ? x : Date.parse(`${x}T00:00:00`));

export const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n * 10) / 10}`);

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---------------------------------------------------------------- line chart */

export interface LinePoint {
  x: string | number;
  y: number;
}
export interface LineSeries {
  id: string;
  label: string;
  points: LinePoint[];
  /** categorical slot (0-based); default = index in the series array */
  slot?: number;
  /** projection / plan: dashed, no markers */
  dashed?: boolean;
}

export function LineChart({
  series,
  height = 220,
  yFormat = compact,
  xFormat = (x) => (typeof x === 'number' ? String(x) : x.slice(5)),
  target,
  yZero = false,
  ariaLabel,
  empty = 'No data yet',
}: {
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (x: string | number) => string;
  /** horizontal reference line (goal, budget) */
  target?: { y: number; label: string };
  /** start the y-axis at zero (amounts) instead of fitting the data (weights) */
  yZero?: boolean;
  ariaLabel: string;
  empty?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = series.flatMap((s) => s.points);
  const xs = useMemo(() => [...new Set(pts.map((p) => toX(p.x)))].sort((a, b) => a - b), [pts]);
  if (!pts.length) return <div className="viz-empty">{empty}</div>;
  const ys = pts.map((p) => p.y).concat(target ? [target.y] : []);
  const [y0, y1] = yZero ? [Math.min(0, ...ys), niceMax(Math.max(...ys))] : niceRange(Math.min(...ys), Math.max(...ys));
  const L = 44;
  const R = 12;
  const T = 10;
  const B = 24;
  const W = width;
  const H = height;
  const x0 = xs[0];
  const xr = xs[xs.length - 1] - x0 || 1;
  const sx = (x: number) => L + ((x - x0) / xr) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => y0 + (y1 - y0) * f);
  const xt = xs.length <= 6 ? xs : [0, 0.25, 0.5, 0.75, 1].map((f) => xs[Math.round(f * (xs.length - 1))]);
  const xLabel = (x: number) => {
    const raw = series.flatMap((s) => s.points).find((p) => toX(p.x) === x)?.x ?? x;
    return xFormat(raw);
  };
  const hx = hover != null ? xs[hover] : null;
  const legend = series.length >= 2;
  return (
    <div className="viz" ref={ref as React.RefObject<HTMLDivElement>}>
      {legend && (
        <div className="viz-legend">
          {series.map((s, i) => (
            <span key={s.id}>
              <i className={s.dashed ? 'dash' : ''} style={{ background: s.dashed ? undefined : VIZ(s.slot ?? i), borderColor: VIZ(s.slot ?? i) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const mx = e.clientX - r.left;
          let best = 0;
          xs.forEach((x, i) => {
            if (Math.abs(sx(x) - mx) < Math.abs(sx(xs[best]) - mx)) best = i;
          });
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="viz-grid" x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} />
            <text className="viz-axis" x={L - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xt.map((x) => (
          <text key={x} className="viz-axis" x={sx(x)} y={H - 6} textAnchor="middle">
            {xLabel(x)}
          </text>
        ))}
        {target && (
          <g>
            <line className="viz-target" x1={L} x2={W - R} y1={sy(target.y)} y2={sy(target.y)} />
            <text className="viz-axis" x={W - R} y={sy(target.y) - 5} textAnchor="end">
              {target.label}
            </text>
          </g>
        )}
        {series.map((s, i) => {
          const sorted = [...s.points].sort((a, b) => toX(a.x) - toX(b.x));
          if (!sorted.length) return null;
          const d = sorted.map((p, j) => `${j ? 'L' : 'M'}${sx(toX(p.x)).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={VIZ(s.slot ?? i)} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {!s.dashed && sorted.length <= 40 && sorted.map((p, j) => <circle key={j} cx={sx(toX(p.x))} cy={sy(p.y)} r={2.6} fill={VIZ(s.slot ?? i)} stroke="var(--viz-surface)" strokeWidth={1.5} />)}
            </g>
          );
        })}
        {hx != null && (
          <g pointerEvents="none">
            <line className="viz-cross" x1={sx(hx)} x2={sx(hx)} y1={T} y2={H - B} />
            {series.map((s, i) => {
              const p = s.points.find((q) => toX(q.x) === hx);
              return p ? <circle key={s.id} cx={sx(hx)} cy={sy(p.y)} r={4.5} fill={VIZ(s.slot ?? i)} stroke="var(--viz-surface)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {hx != null && (
        <div className="viz-tip" style={{ left: Math.min(Math.max(sx(hx), 70), W - 70) }}>
          <b>{xLabel(hx)}</b>
          {series.map((s, i) => {
            const p = s.points.find((q) => toX(q.x) === hx);
            return p ? (
              <span key={s.id}>
                <i style={{ background: VIZ(s.slot ?? i) }} />
                {series.length > 1 ? `${s.label}: ` : ''}
                {yFormat(p.y)}
              </span>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- bar chart */

export interface BarDatum {
  label: string;
  value: number;
  /** longer label for the tooltip */
  title?: string;
}

export function BarChart({ data, height = 200, yFormat = compact, slot = 0, ariaLabel, empty = 'No data yet', negativeSlot }: { data: BarDatum[]; height?: number; yFormat?: (v: number) => string; slot?: number; ariaLabel: string; empty?: ReactNode; negativeSlot?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div className="viz-empty">{empty}</div>;
  const maxAbs = niceMax(Math.max(...data.map((d) => Math.abs(d.value))));
  const hasNeg = data.some((d) => d.value < 0);
  const every = Math.max(1, Math.ceil(data.length / 12));
  return (
    <div className="viz viz-bars" style={{ height }} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
      <div className="viz-bars-grid" aria-hidden>
        {(hasNeg ? [1, 0, -1] : [1, 0.5, 0]).map((f) => (
          <div key={f} style={{ bottom: hasNeg ? `${(f + 1) * 50}%` : `${f * 100}%` }}>
            <span>{yFormat(maxAbs * f)}</span>
          </div>
        ))}
      </div>
      <div className="viz-bars-row">
        {data.map((d, i) => {
          const h = (Math.abs(d.value) / maxAbs) * (hasNeg ? 50 : 100);
          const neg = d.value < 0;
          return (
            <div key={`${d.label}-${i}`} className={`viz-barcol ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${d.title ?? d.label}: ${yFormat(d.value)}`}>
              <div
                className={`viz-bar ${neg ? 'neg' : ''}`}
                style={{
                  height: `${Math.max(d.value ? 1 : 0, h)}%`,
                  bottom: hasNeg ? (neg ? `${50 - h}%` : '50%') : 0,
                  background: VIZ(neg && negativeSlot != null ? negativeSlot : slot),
                }}
              />
              {i % every === 0 && <span className="viz-barlabel">{d.label}</span>}
              {hover === i && (
                <div className="viz-tip bar">
                  <b>{d.title ?? d.label}</b>
                  <span>{yFormat(d.value)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- ranked list */

export function BarList({ rows, format = compact, max, empty = 'Nothing yet', onSelect }: { rows: { id: string; label: ReactNode; value: number; sub?: ReactNode; color?: string }[]; format?: (v: number) => string; max?: number; empty?: ReactNode; onSelect?: (id: string) => void }) {
  if (!rows.length) return <div className="viz-empty">{empty}</div>;
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="viz-barlist">
      {rows.map((r) => (
        <button key={r.id} type="button" className="viz-barlist-row" onClick={onSelect ? () => onSelect(r.id) : undefined} disabled={!onSelect} title={typeof r.label === 'string' ? `${r.label}: ${format(r.value)}` : undefined}>
          <span className="viz-barlist-label ellipsis">{r.label}</span>
          <span className="viz-barlist-track">
            <span style={{ width: `${Math.max(1.5, (Math.abs(r.value) / m) * 100)}%`, background: r.color ?? VIZ(0) }} />
          </span>
          <span className="viz-barlist-value">{format(r.value)}</span>
          {r.sub != null && <span className="viz-barlist-sub">{r.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- tiny pieces */

export function Sparkline({ values, width = 90, height = 26, slot = 0, ariaLabel }: { values: number[]; width?: number; height?: number; slot?: number; ariaLabel: string }) {
  if (values.length < 2) return <span className="viz-spark-empty" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel} className="viz-spark">
      <path d={d} fill="none" stroke={VIZ(slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function StatTile({ label, value, sub, delta, deltaGood, onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; delta?: string; /** whether the delta is good news (colours it) */ deltaGood?: boolean; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`viz-stat ${onClick ? 'click' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="viz-stat-label">{label}</span>
      <span className="viz-stat-value">{value}</span>
      {(sub != null || delta) && (
        <span className="viz-stat-sub">
          {delta && <b className={deltaGood == null ? '' : deltaGood ? 'good' : 'bad'}>{delta}</b>} {sub}
        </span>
      )}
    </Tag>
  );
}

export function Meter({ value, max, tone, label }: { value: number; max: number; tone?: 'good' | 'warning' | 'critical'; label?: string }) {
  const f = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span className={`viz-meter ${tone ?? ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${f * 100}%` }} />
    </span>
  );
}
