/* Shared calculator on the Strategy page of Marketing Spaces and businesses:
   named lines with formulas that can use each other ("Monthly revenue =
   Day rate * Shoots per month"). The lines are stored in the space itself
   (space.calc), so in the hosted version everyone in the space sees every
   change live and can talk the numbers through together. */
import './calc.css';
import { useMemo } from 'react';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { updateSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { evaluate, type CalcLine } from '@/lib/calc';
import { uid } from '@/lib/id';
import { Button, IconButton, Input, Select } from '@/ui';
import { isCloud } from '@/backend';

const EMPTY: CalcLine[] = [];

const EXAMPLE: Omit<CalcLine, 'id'>[] = [
  { label: 'Day rate', expr: '1800', format: 'money' },
  { label: 'Shoots per month', expr: '4' },
  { label: 'Monthly revenue', expr: 'Day rate * Shoots per month', format: 'money' },
  { label: 'Monthly costs', expr: '2500', format: 'money' },
  { label: 'Margin', expr: '(Monthly revenue - Monthly costs) / Monthly revenue * 100', format: 'percent' },
];

const FORMATS = [
  { value: 'number', label: '123' },
  { value: 'money', label: '$' },
  { value: 'percent', label: '%' },
];

function setLines(recipe: (lines: CalcLine[]) => void, coalesce?: string) {
  updateSpace(
    (d) => {
      d.calc ??= [];
      recipe(d.calc as CalcLine[]);
    },
    coalesce ? { coalesce } : undefined,
  );
}

const addLines = (items: Omit<CalcLine, 'id'>[]) => setLines((l) => void l.push(...items.map((x) => ({ id: uid('calc'), ...x }))));
const patchLine = (id: string, patch: Partial<CalcLine>, field: string) =>
  setLines((l) => {
    const line = l.find((x) => x.id === id);
    if (line) Object.assign(line, patch);
  }, `calc-${id}-${field}`);
const removeLine = (id: string) =>
  setLines((l) => {
    const i = l.findIndex((x) => x.id === id);
    if (i >= 0) l.splice(i, 1);
  });

export function SharedCalculator() {
  const lines = useSpace((s) => s.calc) ?? EMPTY;
  const fmt = useSpaceFormatters();
  const results = useMemo(() => evaluate(lines), [lines]);

  const show = (line: CalcLine) => {
    const r = results.get(line.id);
    if (!r) return '';
    if (!r.ok) return r.error;
    if (line.format === 'money') return fmt.money(r.value);
    if (line.format === 'percent') return `${r.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    return r.value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  return (
    <div className="calc">
      <div className="calc-head">
        <Calculator size={16} />
        <span className="calc-title">Calculator</span>
        <span className="muted small">{isCloud ? 'Shared live with everyone in this space.' : 'Saved with this space.'} A formula can use any line by its name.</span>
      </div>
      {lines.length === 0 ? (
        <div className="calc-empty">
          <span className="muted small">Work out prices, volumes and margins together. Each line has a name and a number or a formula, like Day rate * Shoots per month.</span>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" icon={Plus} onClick={() => addLines([{ label: '', expr: '' }])}>
              Add a line
            </Button>
            <Button size="sm" variant="ghost" onClick={() => addLines(EXAMPLE)}>
              Start from an example
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="calc-grid" role="table" aria-label="Calculator lines">
            <div className="calc-row calc-row-head muted tiny" role="row">
              <span>Name</span>
              <span>Number or formula</span>
              <span className="calc-right">Result</span>
              <span>Show as</span>
              <span />
            </div>
            {lines.map((line) => {
              const r = results.get(line.id);
              return (
                <div className="calc-row" role="row" key={line.id}>
                  <Input size="sm" value={line.label} placeholder="e.g. Day rate" onChange={(v) => patchLine(line.id, { label: v }, 'label')} aria-label="Line name" />
                  <Input size="sm" className="mono" value={line.expr} placeholder="e.g. 1800 or Day rate * 4" onChange={(v) => patchLine(line.id, { expr: v }, 'expr')} aria-label="Number or formula" />
                  <span className={`calc-result calc-right ${r && !r.ok ? 'calc-error' : ''}`} title={r && !r.ok ? r.error : undefined}>
                    {line.expr.trim() ? show(line) : ''}
                  </span>
                  <Select size="sm" value={line.format ?? 'number'} options={FORMATS} onChange={(v) => patchLine(line.id, { format: v === 'number' ? undefined : (v as CalcLine['format']) }, 'format')} aria-label="Show as" />
                  <IconButton icon={Trash2} size="sm" label="Remove line" onClick={() => removeLine(line.id)} />
                </div>
              );
            })}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => addLines([{ label: '', expr: '' }])}>
              Add a line
            </Button>
            <span className="muted tiny">Use + − * / ^, %, parentheses, 1.2k, and min, max, sum, avg, round.</span>
          </div>
        </>
      )}
    </div>
  );
}
