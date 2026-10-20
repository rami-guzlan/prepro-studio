/* Budget top sheet: KPI tiles + account summary by section with contingency, insurance and tax. */
import { Fragment, useMemo } from 'react';
import type { ID } from '@/types';
import { update, useFormatters, useProject } from '@/store/project';
import { navigate } from '@/store/app';
import { Card, NumberInput, Progress, Textarea } from '@/ui';
import { runtimeMinutes, summarize, varianceTone, type BudgetSummary } from './calc';

function pct(n: number, of: number) {
  return of > 0 ? (n / of) * 100 : 0;
}

function setPct(key: 'contingencyPct' | 'insurancePct' | 'taxPct', v: number | undefined) {
  update(
    (d) => {
      if (key === 'contingencyPct') d.budget.contingencyPct = Math.max(0, v ?? 0);
      else d.budget[key] = v != null && v > 0 ? v : undefined;
    },
    { coalesce: `budget:${key}` },
  );
}

function SplitBar({ s }: { s: BudgetSummary }) {
  const fmt = useFormatters();
  const parts = s.sections.filter((x) => x.total > 0);
  return (
    <div className="budget-split">
      <div className="budget-split-bar">
        {parts.length === 0 && <div style={{ flex: 1, background: 'var(--bg-active)' }} />}
        {parts.map((x) => (
          <div key={x.def.id} style={{ flex: x.total, background: x.def.color }} title={`${x.def.label}: ${fmt.money(x.total)} (${pct(x.total, s.subtotal).toFixed(0)}%)`} />
        ))}
      </div>
      <div className="budget-split-legend">
        {s.sections.map((x) => (
          <span key={x.def.id} className={x.total ? '' : 'muted'}>
            <i style={{ background: x.def.color }} />
            {x.def.short} <b>{pct(x.total, s.subtotal).toFixed(0)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function TopSheet({ onOpenCategory }: { onOpenCategory: (id: ID) => void }) {
  const budget = useProject((p) => p.budget);
  const meta = useProject((p) => p.meta);
  const days = useProject((p) => p.schedule.days.length);
  const fmt = useFormatters();
  const s = useMemo(() => summarize(budget), [budget]);
  const minutes = runtimeMinutes(meta.targetRuntime);
  const spentPct = pct(s.actual, s.subtotal);
  const spentColor = s.actual > s.subtotal ? 'var(--danger)' : spentPct >= 90 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="budget-kpis">
        <div className="stat">
          <span className="label">Grand total</span>
          <span className="value">{fmt.money(s.grand, { cents: false })}</span>
          <span className="sub">
            Subtotal {fmt.money(s.subtotal, { cents: false })}
            {s.contingency ? ` + ${s.contingencyPct}% contingency` : ''}
          </span>
        </div>
        <div className="stat">
          <span className="label">Above / below the line</span>
          <SplitBar s={s} />
        </div>
        <div className="stat">
          <span className="label">Cost per finished minute</span>
          <span className="value">{minutes > 0 ? fmt.money(s.grand / minutes, { cents: false }) : '—'}</span>
          <span className="sub">
            {minutes > 0 ? (
              `Target runtime ${meta.targetRuntime}${days ? ` · ${fmt.money(s.grand / days, { cents: false })} per shoot day` : ''}`
            ) : (
              <button type="button" className="budget-linkbtn" onClick={() => navigate('settings')}>
                Set a target runtime in Project Settings
              </button>
            )}
          </span>
        </div>
        <div className="stat">
          <span className="label">Actual spend</span>
          <span className="value" style={{ color: s.actual > s.subtotal ? 'var(--danger)' : undefined }}>
            {fmt.money(s.actual, { cents: false })}
          </span>
          <Progress value={s.subtotal ? s.actual / s.subtotal : 0} color={spentColor} style={{ margin: '4px 0 2px' }} />
          <span className="sub">
            {spentPct.toFixed(0)}% of {fmt.money(s.subtotal, { cents: false })} · {fmt.money(Math.max(0, s.subtotal - s.actual), { cents: false })} left
          </span>
        </div>
      </div>

      <Card title="Top sheet" padded={false}>
        <table className="table budget-top">
          <colgroup>
            <col style={{ width: 80 }} />
            <col />
            <col style={{ width: 70 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Acct #</th>
              <th>Account</th>
              <th className="num">Lines</th>
              <th className="num">Estimate</th>
              <th className="num">Actual</th>
              <th className="num">Variance</th>
              <th className="num">% total</th>
            </tr>
          </thead>
          <tbody>
            {s.sections.map((sec) => (
              <Fragment key={sec.def.id}>
                <tr className="budget-top-section">
                  <td colSpan={7}>
                    <span className="budget-section-dot" style={{ background: sec.def.color }} />
                    {sec.def.label}
                  </td>
                </tr>
                {sec.cats.length === 0 && (
                  <tr>
                    <td />
                    <td colSpan={6} className="muted small">
                      No accounts
                    </td>
                  </tr>
                )}
                {sec.cats.map(({ cat, total, actual }) => {
                  const tone = varianceTone(total, actual);
                  return (
                    <tr key={cat.id} className="budget-top-row" onClick={() => onOpenCategory(cat.id)} title="Open in Detail">
                      <td className="mono muted">{cat.code}</td>
                      <td className="strong">{cat.name || 'Untitled account'}</td>
                      <td className="num muted">{cat.lines.length}</td>
                      <td className="num">{fmt.money(total)}</td>
                      <td className="num">{actual ? fmt.money(actual) : <span className="muted">—</span>}</td>
                      <td className="num">{tone === 'none' ? <span className="muted">—</span> : <span className={`budget-var ${tone}`}>{fmt.money(total - actual)}</span>}</td>
                      <td className="num muted">{pct(total, s.grand).toFixed(1)}%</td>
                    </tr>
                  );
                })}
                <tr className="budget-top-subtotal">
                  <td />
                  <td>Total {sec.def.label}</td>
                  <td />
                  <td className="num">{fmt.money(sec.total)}</td>
                  <td className="num">{sec.actual ? fmt.money(sec.actual) : ''}</td>
                  <td className="num">{sec.actual ? <span className={`budget-var ${varianceTone(sec.total, sec.actual)}`}>{fmt.money(sec.total - sec.actual)}</span> : ''}</td>
                  <td className="num">{pct(sec.total, s.grand).toFixed(1)}%</td>
                </tr>
              </Fragment>
            ))}
            <tr className="budget-top-total">
              <td />
              <td>Subtotal</td>
              <td />
              <td className="num">{fmt.money(s.subtotal)}</td>
              <td className="num">{s.actual ? fmt.money(s.actual) : ''}</td>
              <td className="num">{s.actual ? <span className={`budget-var ${varianceTone(s.subtotal, s.actual)}`}>{fmt.money(s.subtotal - s.actual)}</span> : ''}</td>
              <td className="num">{pct(s.subtotal, s.grand).toFixed(1)}%</td>
            </tr>
            {(
              [
                ['contingencyPct', 'Contingency', s.contingencyPct, s.contingency],
                ['insurancePct', 'Insurance', s.insurancePct, s.insurance],
                ['taxPct', 'Tax', s.taxPct, s.tax],
              ] as const
            ).map(([key, label, p, amount]) => (
              <tr key={key} className="budget-top-adj">
                <td />
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <span>{label}</span>
                    <NumberInput size="sm" value={p || (key === 'contingencyPct' ? 0 : undefined)} placeholder="0" onChange={(v) => setPct(key, v)} style={{ width: 70 }} />
                    <span className="muted small">% of subtotal</span>
                  </div>
                </td>
                <td />
                <td className="num">{amount ? fmt.money(amount) : <span className="muted">—</span>}</td>
                <td />
                <td />
                <td className="num muted">{amount ? `${pct(amount, s.grand).toFixed(1)}%` : ''}</td>
              </tr>
            ))}
            <tr className="budget-top-grand">
              <td />
              <td>Grand total</td>
              <td />
              <td className="num">{fmt.money(s.grand)}</td>
              <td className="num">{s.actual ? fmt.money(s.actual) : ''}</td>
              <td />
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="Budget notes & assumptions">
        <Textarea
          autoGrow
          minRows={3}
          value={budget.notes ?? ''}
          placeholder="Union agreements, rate assumptions, what is deferred, what is excluded…"
          onChange={(v) => update((d) => void (d.budget.notes = v || undefined), { coalesce: 'budget:notes' })}
        />
      </Card>
    </div>
  );
}
