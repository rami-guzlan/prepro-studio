/* Actuals: estimate vs actual per account with variance colouring; expand to enter actuals per line. */
import { Fragment, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ID } from '@/types';
import { listOps, useFormatters, useProject } from '@/store/project';
import { NumberInput, Progress, Stat } from '@/ui';
import { lineActual, lineTotal, summarize, varianceTone } from './calc';

const TONE_LABEL = { over: 'Over budget', near: 'Near limit', under: 'On track', none: 'No spend yet' } as const;
const TONE_COLOR = { over: 'var(--danger)', near: 'var(--warning)', under: 'var(--success)', none: 'var(--border-strong)' } as const;

export function ActualsView() {
  const budget = useProject((p) => p.budget);
  const fmt = useFormatters();
  const s = useMemo(() => summarize(budget), [budget]);
  const [open, setOpen] = useState<Record<ID, boolean>>({});
  const [onlySpent, setOnlySpent] = useState(false);
  const currency = useMemo(() => fmt.money(0).replace(/[\d.,\s  ]/g, '') || '$', [fmt]);

  const overCount = s.sections.reduce((n, sec) => n + sec.cats.filter((c) => varianceTone(c.total, c.actual) === 'over').length, 0);
  const remaining = s.subtotal - s.actual;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="stat-grid">
        <Stat label="Budget (subtotal)" value={fmt.money(s.subtotal, { cents: false })} sub={`Grand total ${fmt.money(s.grand, { cents: false })} incl. contingency`} />
        <Stat label="Spent to date" value={fmt.money(s.actual, { cents: false })} sub={`${s.subtotal ? ((s.actual / s.subtotal) * 100).toFixed(0) : 0}% of subtotal`} />
        <Stat
          label={remaining >= 0 ? 'Remaining' : 'Over budget'}
          value={<span style={{ color: remaining < 0 ? 'var(--danger)' : undefined }}>{fmt.money(Math.abs(remaining), { cents: false })}</span>}
          sub={s.contingency ? `Contingency available: ${fmt.money(s.contingency, { cents: false })}` : undefined}
        />
        <Stat label="Accounts over budget" value={<span style={{ color: overCount ? 'var(--danger)' : 'var(--success)' }}>{overCount}</span>} sub={overCount ? 'Check the red rows below' : 'Everything within estimate'} />
      </div>

      <div className="row">
        <span className="muted small">Click an account to enter actuals per line. Variance = estimate − actual (negative means over).</span>
        <span className="spacer" />
        <label className="checkbox">
          <input type="checkbox" checked={onlySpent} onChange={(e) => setOnlySpent(e.target.checked)} />
          <span>Only accounts with spend</span>
        </label>
      </div>

      <div className="table-wrap">
        <table className="table budget-actuals">
          <colgroup>
            <col style={{ width: 34 }} />
            <col style={{ width: 80 }} />
            <col />
            <col style={{ width: 140 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead>
            <tr>
              <th />
              <th>Acct #</th>
              <th>Account</th>
              <th className="num">Estimate</th>
              <th className="num">Actual</th>
              <th className="num">Variance</th>
              <th>Spent</th>
            </tr>
          </thead>
          <tbody>
            {s.sections.map((sec) => {
              const cats = onlySpent ? sec.cats.filter((c) => c.actual > 0) : sec.cats;
              if (!cats.length) return null;
              return (
                <Fragment key={sec.def.id}>
                  <tr className="budget-top-section">
                    <td colSpan={7}>
                      <span className="budget-section-dot" style={{ background: sec.def.color }} />
                      {sec.def.label}
                    </td>
                  </tr>
                  {cats.map(({ cat, total, actual }) => {
                    const tone = varianceTone(total, actual);
                    const isOpen = !!open[cat.id];
                    const ops = listOps((d) => d.budget.categories.find((c) => c.id === cat.id)?.lines ?? [], `budget:${cat.id}`);
                    return (
                      <Fragment key={cat.id}>
                        <tr className={`budget-act-row ${tone}`} onClick={() => setOpen({ ...open, [cat.id]: !isOpen })}>
                          <td>
                            <ChevronRight size={14} className={`budget-act-chev ${isOpen ? 'open' : ''}`} />
                          </td>
                          <td className="mono muted">{cat.code}</td>
                          <td className="strong">{cat.name || 'Untitled account'}</td>
                          <td className="num">{fmt.money(total)}</td>
                          <td className="num">{actual ? fmt.money(actual) : <span className="muted">—</span>}</td>
                          <td className="num">{tone === 'none' ? <span className="muted">—</span> : <span className={`budget-var ${tone}`}>{fmt.money(total - actual)}</span>}</td>
                          <td>
                            <div className="row" style={{ gap: 8 }} title={TONE_LABEL[tone]}>
                              <Progress value={total ? actual / total : actual ? 1 : 0} color={TONE_COLOR[tone]} style={{ flex: 1 }} />
                              <span className="small muted nowrap" style={{ width: 40, textAlign: 'right' }}>
                                {total ? `${((actual / total) * 100).toFixed(0)}%` : actual ? '—' : '0%'}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isOpen &&
                          cat.lines.map((l) => {
                            const lt = lineTotal(l);
                            const la = lineActual(l);
                            const lTone = varianceTone(lt, la);
                            return (
                              <tr key={l.id} className="budget-act-line">
                                <td />
                                <td />
                                <td className="text-2">{l.description || <span className="muted">Untitled line</span>}</td>
                                <td className="num muted">{fmt.money(lt)}</td>
                                <td className="num">
                                  <NumberInput bare size="sm" value={l.actual} decimals={2} prefix={currency} placeholder="—" onChange={(v) => ops.update(l.id, { actual: v })} />
                                </td>
                                <td className="num">{lTone === 'none' ? <span className="muted">—</span> : <span className={`budget-var ${lTone}`}>{fmt.money(lt - la)}</span>}</td>
                                <td className="small muted ellipsis" title={l.notes}>
                                  {l.notes}
                                </td>
                              </tr>
                            );
                          })}
                        {isOpen && cat.lines.length === 0 && (
                          <tr className="budget-act-line">
                            <td />
                            <td />
                            <td colSpan={5} className="muted small">
                              No lines in this account.
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="budget-top-subtotal">
                    <td />
                    <td />
                    <td>Total {sec.def.label}</td>
                    <td className="num">{fmt.money(sec.total)}</td>
                    <td className="num">{sec.actual ? fmt.money(sec.actual) : ''}</td>
                    <td className="num">{sec.actual ? <span className={`budget-var ${varianceTone(sec.total, sec.actual)}`}>{fmt.money(sec.total - sec.actual)}</span> : ''}</td>
                    <td />
                  </tr>
                </Fragment>
              );
            })}
            <tr className="budget-top-grand">
              <td />
              <td />
              <td>All accounts</td>
              <td className="num">{fmt.money(s.subtotal)}</td>
              <td className="num">{fmt.money(s.actual)}</td>
              <td className="num">
                <span className={`budget-var ${varianceTone(s.subtotal, s.actual)}`}>{fmt.money(s.subtotal - s.actual)}</span>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
