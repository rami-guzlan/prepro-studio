import { Fragment, type ReactNode } from 'react';
import type { ProjectData } from '@/types';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { DocHeader, KV, PSection } from '@/print/components';
import { PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { dayDates } from '@/derived/project';
import { lineActual, lineTotal, runtimeMinutes, summarize } from './calc';

const CSS = `
.budget-p { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
.budget-p th { text-align: left; font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #3a3a44; background: #efeff3; padding: 4pt 5pt; border-bottom: 0.75pt solid #b9b9c3; }
.budget-p thead { display: table-header-group; }
.budget-p td { padding: 3pt 5pt; border-bottom: 0.5pt solid #e1e1e7; vertical-align: top; }
.budget-p tr { break-inside: avoid; page-break-inside: avoid; }
.budget-p .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.budget-p .code { font-family: 'Courier Prime', 'Courier New', monospace; color: #55555e; white-space: nowrap; }
.budget-p tr.sec td { background: #1f1f26; color: #fff; font-weight: 800; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.07em; padding-top: 5pt; padding-bottom: 5pt; border-bottom: 0; }
.budget-p tr.cat td { background: #f2f2f6; font-weight: 750; border-bottom: 0.75pt solid #c9c9d1; padding-top: 5pt; }
.budget-p tr.cattotal td { font-weight: 700; border-top: 0.75pt solid #9a9aa4; border-bottom: 0.75pt solid #c9c9d1; background: #fafafc; }
.budget-p tr.sectotal td { font-weight: 800; border-top: 1pt solid #444; border-bottom: 1.25pt solid #444; background: #ececf1; }
.budget-p tr.sub td { font-weight: 700; border-top: 1pt solid #444; }
.budget-p tr.adj td { color: #33333c; }
.budget-p tr.grand td { font-weight: 800; font-size: 11pt; border-top: 1.5pt solid #111; border-bottom: 2.5pt double #111; background: #f2f2f6; }
.budget-p .lnotes { color: #6a6a72; font-size: 7pt; margin-top: 1pt; white-space: pre-wrap; }
.budget-p .over { color: #c92a2a; font-weight: 700; }
.budget-p .under { color: #2b8a3e; }
.budget-p-split { display: flex; gap: 8pt; margin: 10pt 0 2pt; }
.budget-p-split > div { flex: 1; border: 0.75pt solid #c9c9d1; border-radius: 3pt; padding: 5pt 7pt; border-top: 3pt solid var(--c); }
.budget-p-split .k { font-size: 6.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6a6a72; }
.budget-p-split .v { font-size: 11pt; font-weight: 800; }
.budget-p-split .s { font-size: 7pt; color: #6a6a72; }
.budget-p-sign { display: grid; grid-template-columns: 2fr 1fr 2fr 1fr; gap: 6pt 12pt; margin-top: 26pt; font-size: 7pt; color: #55555e; }
.budget-p-sign div { border-top: 0.75pt solid #555; padding-top: 2pt; }
.budget-p-notes { font-size: 8pt; white-space: pre-wrap; color: #2a2a33; }
`;

function variance(ctx: PrintContext, estimate: number, actual: number): ReactNode {
  if (!actual) return '';
  const v = estimate - actual;
  return <span className={v < -0.005 ? 'over' : 'under'}>{v < 0 ? `(${ctx.fmt.money(-v)})` : ctx.fmt.money(v)}</span>;
}

function shootDates(ctx: PrintContext): string {
  const p = ctx.project;
  const dates = dayDates(p).filter((d): d is string => !!d).sort();
  const a = dates[0] ?? p.meta.shootStart;
  const b = dates[dates.length - 1] ?? p.meta.shootEnd;
  if (!a) return '';
  return b && b !== a ? `${ctx.fmt.dateMedium(a)} – ${ctx.fmt.dateMedium(b)}` : ctx.fmt.dateMedium(a);
}

/* ---------------------------------------------------------------- top sheet */

function renderTopSheet(ctx: PrintContext) {
  const p = ctx.project;
  const s = summarize(p.budget);
  const showActuals = !!ctx.options.showActuals;
  const minutes = runtimeMinutes(p.meta.targetRuntime);
  const days = p.schedule.days.length;
  const cols = showActuals ? 5 : 3;
  const pct = (n: number) => (s.grand ? `${((n / s.grand) * 100).toFixed(1)}%` : '');

  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Budget Top Sheet" subtitle={`Grand total ${ctx.fmt.money(s.grand)}`} />
        <KV
          cols={3}
          items={[
            ['Production', `${p.meta.title}${p.meta.subtitle ? ` · ${p.meta.subtitle}` : ''}`],
            ['Production company', p.meta.productionCompany],
            ['Type', optionLabel(PROJECT_TYPES, p.meta.projectType)],
            ['Producer', p.meta.producer],
            ['Director', p.meta.director],
            ['Writer', p.meta.writer],
            ['Shoot dates', shootDates(ctx)],
            ['Shoot days', days ? String(days) : ''],
            ['Locations', p.locations.length ? String(p.locations.length) : ''],
            ['Target runtime', p.meta.targetRuntime],
            ['Format', [p.meta.aspectRatio, p.meta.resolution, p.meta.frameRate ? `${p.meta.frameRate} fps` : ''].filter(Boolean).join(' · ')],
            ['Delivery', p.meta.deliveryDate ? ctx.fmt.dateMedium(p.meta.deliveryDate) : ''],
          ]}
        />
        <div className="budget-p-split pp-avoid">
          {s.sections.map((sec) => (
            <div key={sec.def.id} style={{ ['--c' as any]: sec.def.color }}>
              <div className="k">{sec.def.label}</div>
              <div className="v">{ctx.fmt.money(sec.total, { cents: false })}</div>
              <div className="s">{pct(sec.total)} of total</div>
            </div>
          ))}
          <div style={{ ['--c' as any]: '#111' }}>
            <div className="k">{minutes ? 'Per finished minute' : days ? 'Per shoot day' : 'Accounts'}</div>
            <div className="v">{minutes ? ctx.fmt.money(s.grand / minutes, { cents: false }) : days ? ctx.fmt.money(s.grand / days, { cents: false }) : p.budget.categories.length}</div>
            <div className="s">{minutes ? `${p.meta.targetRuntime} runtime` : days ? `${days} shoot days` : 'in this budget'}</div>
          </div>
        </div>
        <PSection title="Summary">
          <table className="budget-p">
            <colgroup>
              <col style={{ width: '48pt' }} />
              <col />
              <col style={{ width: '82pt' }} />
              {showActuals && <col style={{ width: '82pt' }} />}
              {showActuals && <col style={{ width: '82pt' }} />}
            </colgroup>
            <thead>
              <tr>
                <th>Acct #</th>
                <th>Account</th>
                <th className="num">Total</th>
                {showActuals && <th className="num">Actual</th>}
                {showActuals && <th className="num">Variance</th>}
              </tr>
            </thead>
            <tbody>
              {s.sections.map((sec) => (
                <Fragment key={sec.def.id}>
                  <tr className="sec">
                    <td colSpan={cols}>{sec.def.label}</td>
                  </tr>
                  {sec.cats.length === 0 && (
                    <tr>
                      <td />
                      <td colSpan={cols - 1} className="pp-muted">
                        —
                      </td>
                    </tr>
                  )}
                  {sec.cats.map(({ cat, total, actual }) => (
                    <tr key={cat.id}>
                      <td className="code">{cat.code}</td>
                      <td>{cat.name}</td>
                      <td className="num">{ctx.fmt.money(total)}</td>
                      {showActuals && <td className="num">{actual ? ctx.fmt.money(actual) : ''}</td>}
                      {showActuals && <td className="num">{variance(ctx, total, actual)}</td>}
                    </tr>
                  ))}
                  <tr className="sectotal">
                    <td />
                    <td>Total {sec.def.label}</td>
                    <td className="num">{ctx.fmt.money(sec.total)}</td>
                    {showActuals && <td className="num">{sec.actual ? ctx.fmt.money(sec.actual) : ''}</td>}
                    {showActuals && <td className="num">{variance(ctx, sec.total, sec.actual)}</td>}
                  </tr>
                </Fragment>
              ))}
              <tr className="sub">
                <td />
                <td>Subtotal</td>
                <td className="num">{ctx.fmt.money(s.subtotal)}</td>
                {showActuals && <td className="num">{s.actual ? ctx.fmt.money(s.actual) : ''}</td>}
                {showActuals && <td className="num">{variance(ctx, s.subtotal, s.actual)}</td>}
              </tr>
              {(
                [
                  ['Contingency', s.contingencyPct, s.contingency],
                  ['Insurance', s.insurancePct, s.insurance],
                  ['Tax', s.taxPct, s.tax],
                ] as const
              )
                .filter(([, pc]) => pc > 0)
                .map(([label, pc, amount]) => (
                  <tr key={label} className="adj">
                    <td />
                    <td>
                      {label} ({pc}% of subtotal)
                    </td>
                    <td className="num">{ctx.fmt.money(amount)}</td>
                    {showActuals && <td />}
                    {showActuals && <td />}
                  </tr>
                ))}
              <tr className="grand">
                <td />
                <td>GRAND TOTAL</td>
                <td className="num">{ctx.fmt.money(s.grand)}</td>
                {showActuals && <td className="num">{s.actual ? ctx.fmt.money(s.actual) : ''}</td>}
                {showActuals && <td />}
              </tr>
            </tbody>
          </table>
        </PSection>
        {p.budget.notes?.trim() ? (
          <PSection title="Notes & assumptions" className="pp-avoid">
            <div className="budget-p-notes">{p.budget.notes}</div>
          </PSection>
        ) : null}
        <div className="budget-p-sign pp-avoid">
          <div>Prepared by</div>
          <div>Date</div>
          <div>Approved by</div>
          <div>Date</div>
        </div>
      </>
    ),
    css: CSS,
  };
}

/* ---------------------------------------------------------------- detail */

function renderDetail(ctx: PrintContext) {
  const p = ctx.project;
  const o = ctx.options;
  const s = summarize(p.budget);
  const showActuals = !!o.showActuals;
  const hideZero = o.hideZeroLines !== false;
  const showNotes = o.showNotes !== false;
  const cols = showActuals ? 9 : 7;
  let shownLines = 0;

  const head = (
    <thead>
      <tr>
        <th>Description</th>
        <th className="num">Qty</th>
        <th>Unit</th>
        <th className="num">Rate</th>
        <th className="num">×</th>
        <th className="num">Fringe</th>
        <th className="num">Total</th>
        {showActuals && <th className="num">Actual</th>}
        {showActuals && <th className="num">Variance</th>}
      </tr>
    </thead>
  );
  const colgroup = (
    <colgroup>
      <col />
      <col style={{ width: '32pt' }} />
      <col style={{ width: '34pt' }} />
      <col style={{ width: '58pt' }} />
      <col style={{ width: '22pt' }} />
      <col style={{ width: '34pt' }} />
      <col style={{ width: '64pt' }} />
      {showActuals && <col style={{ width: '60pt' }} />}
      {showActuals && <col style={{ width: '60pt' }} />}
    </colgroup>
  );

  const body = s.sections.map((sec) => {
    const cats = sec.cats.filter(({ cat }) => !hideZero || cat.lines.some((l) => lineTotal(l) || lineActual(l)));
    if (!cats.length) return null;
    return (
      <PSection key={sec.def.id} title={sec.def.label} right={ctx.fmt.money(sec.total)}>
        <table className="budget-p">
          {colgroup}
          {head}
          <tbody>
            {cats.map(({ cat, total, actual }) => {
              const lines = cat.lines.filter((l) => !hideZero || lineTotal(l) || lineActual(l));
              shownLines += lines.length;
              return (
                <Fragment key={cat.id}>
                  <tr className="cat">
                    <td colSpan={cols}>
                      <span className="code">{cat.code}</span> {cat.name}
                    </td>
                  </tr>
                  {lines.map((l) => {
                    const t = lineTotal(l);
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.description || '—'}
                          {showNotes && l.notes ? <div className="lnotes">{l.notes}</div> : null}
                        </td>
                        <td className="num">{ctx.fmt.number(l.qty, 2)}</td>
                        <td>{l.unit}</td>
                        <td className="num">{ctx.fmt.money(l.rate)}</td>
                        <td className="num">{(l.x ?? 1) !== 1 ? ctx.fmt.number(l.x, 2) : ''}</td>
                        <td className="num">{l.fringePct ? `${l.fringePct}%` : ''}</td>
                        <td className="num">{ctx.fmt.money(t)}</td>
                        {showActuals && <td className="num">{l.actual != null ? ctx.fmt.money(l.actual) : ''}</td>}
                        {showActuals && <td className="num">{variance(ctx, t, lineActual(l))}</td>}
                      </tr>
                    );
                  })}
                  <tr className="cattotal">
                    <td colSpan={6}>Total {cat.code ? `${cat.code} ` : ''}
                      {cat.name}
                    </td>
                    <td className="num">{ctx.fmt.money(total)}</td>
                    {showActuals && <td className="num">{actual ? ctx.fmt.money(actual) : ''}</td>}
                    {showActuals && <td className="num">{variance(ctx, total, actual)}</td>}
                  </tr>
                </Fragment>
              );
            })}
            <tr className="sectotal">
              <td colSpan={6}>Total {sec.def.label}</td>
              <td className="num">{ctx.fmt.money(sec.total)}</td>
              {showActuals && <td className="num">{sec.actual ? ctx.fmt.money(sec.actual) : ''}</td>}
              {showActuals && <td className="num">{variance(ctx, sec.total, sec.actual)}</td>}
            </tr>
          </tbody>
        </table>
      </PSection>
    );
  });

  return {
    body: (
      <>
        <DocHeader ctx={ctx} title="Budget Detail" subtitle={`Grand total ${ctx.fmt.money(s.grand)}${showActuals ? ` · actual ${ctx.fmt.money(s.actual)}` : ''}`} />
        {body}
        <PSection title="Totals" className="pp-avoid">
          <table className="budget-p">
            <colgroup>
              <col />
              <col style={{ width: '90pt' }} />
              {showActuals && <col style={{ width: '90pt' }} />}
            </colgroup>
            <tbody>
              {s.sections.map((sec) => (
                <tr key={sec.def.id}>
                  <td>{sec.def.label}</td>
                  <td className="num">{ctx.fmt.money(sec.total)}</td>
                  {showActuals && <td className="num">{sec.actual ? ctx.fmt.money(sec.actual) : ''}</td>}
                </tr>
              ))}
              <tr className="sub">
                <td>Subtotal</td>
                <td className="num">{ctx.fmt.money(s.subtotal)}</td>
                {showActuals && <td className="num">{ctx.fmt.money(s.actual)}</td>}
              </tr>
              {s.contingency > 0 && (
                <tr className="adj">
                  <td>Contingency ({s.contingencyPct}%)</td>
                  <td className="num">{ctx.fmt.money(s.contingency)}</td>
                  {showActuals && <td />}
                </tr>
              )}
              {s.insurance > 0 && (
                <tr className="adj">
                  <td>Insurance ({s.insurancePct}%)</td>
                  <td className="num">{ctx.fmt.money(s.insurance)}</td>
                  {showActuals && <td />}
                </tr>
              )}
              {s.tax > 0 && (
                <tr className="adj">
                  <td>Tax ({s.taxPct}%)</td>
                  <td className="num">{ctx.fmt.money(s.tax)}</td>
                  {showActuals && <td />}
                </tr>
              )}
              <tr className="grand">
                <td>GRAND TOTAL</td>
                <td className="num">{ctx.fmt.money(s.grand)}</td>
                {showActuals && <td />}
              </tr>
            </tbody>
          </table>
        </PSection>
        {shownLines === 0 && <p className="pp-muted">No budget lines with amounts yet.</p>}
      </>
    ),
    css: CSS,
  };
}

const noBudget = (p: ProjectData) => (p.budget?.categories?.length ? false : 'No budget accounts yet');

/** Printable documents of the budget module. */
export const printDocs: PrintDocDef[] = [
  {
    id: 'budget-topsheet',
    title: 'Budget Top Sheet',
    group: 'Budget & Gear',
    orientation: 'portrait',
    description: 'Classic top sheet: accounts by section, contingency, insurance, tax and grand total',
    options: [{ key: 'showActuals', label: 'Show actuals & variance', type: 'boolean', default: false }],
    emptyReason: noBudget,
    render: renderTopSheet,
  },
  {
    id: 'budget-detail',
    title: 'Budget Detail',
    group: 'Budget & Gear',
    orientation: 'portrait',
    description: 'Every account with its line items, subtotals and the grand total',
    options: [
      { key: 'showActuals', label: 'Show actuals & variance', type: 'boolean', default: false },
      { key: 'hideZeroLines', label: 'Hide empty lines', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Show line notes', type: 'boolean', default: true },
    ],
    emptyReason: noBudget,
    render: renderDetail,
  },
];
