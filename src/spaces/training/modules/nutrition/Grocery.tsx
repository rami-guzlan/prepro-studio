/* Grocery list: every ingredient of the meals planned in a date range, added up
   by name + unit and grouped by aisle, plus your own extras. Check things off in
   the shop (big tap targets), print it, copy it or export CSV. */
import { useMemo, useState } from 'react';
import { CheckSquare, ClipboardCopy, Eye, EyeOff, Plus, Printer, RotateCcw, ShoppingCart, Square, Trash2 } from 'lucide-react';
import { Button, Combo, DateInput, EmptyState, IconButton, Input, NumberInput, Select, toast, Toolbar } from '@/ui';
import { openPrint } from '@/store/app';
import { useSpaceFormatters } from '@/store/space';
import { addDays } from '@/lib/dates';
import { uid } from '@/lib/id';
import { safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { AISLES, type Aisle } from '../../types';
import { groceryList, guessAisle, qtyText, type GroceryLine } from '../../calc';
import { updateTraining } from '../../ops';
import { copyText, useTraining } from '../../ui';

export function GroceryList({ week }: { week: string }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const from = t.grocery.from ?? week;
  const to = t.grocery.to ?? addDays(week, 6);
  const [hideChecked, setHideChecked] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState<number | undefined>();
  const [unit, setUnit] = useState('');
  const lines = useMemo(() => groceryList(t, from, to), [t, from, to]);
  const shown = hideChecked ? lines.filter((l) => !l.checked) : lines;
  const done = lines.filter((l) => l.checked).length;
  const plannedMeals = t.plan.filter((e) => e.date >= from && e.date <= to && e.mealId).length;

  const setRange = (f: string, tt: string) =>
    updateTraining((tr) => {
      tr.grocery.from = f <= tt ? f : tt;
      tr.grocery.to = f <= tt ? tt : f;
    });

  const toggle = (l: GroceryLine) =>
    updateTraining((tr) => {
      if (l.extraId) {
        const x = tr.grocery.extras.find((e) => e.id === l.extraId);
        if (x) x.checked = !x.checked || undefined;
        if (x && !x.checked) delete x.checked;
        return;
      }
      tr.grocery.checked = l.checked ? tr.grocery.checked.filter((k) => k !== l.key) : [...tr.grocery.checked, l.key];
    });

  const addExtra = () => {
    const n = name.trim();
    if (!n) return;
    updateTraining((tr) => {
      tr.grocery.extras.push({ id: uid('groc'), name: n, qty, unit: unit.trim() || undefined, aisle: guessAisle(n) });
      const x = tr.grocery.extras[tr.grocery.extras.length - 1];
      for (const k of Object.keys(x) as (keyof typeof x)[]) if (x[k] === undefined) delete x[k];
    });
    setName('');
    setQty(undefined);
    setUnit('');
  };

  const asText = () => {
    const out: string[] = [`Groceries ${fmt.dateMedium(from)} – ${fmt.dateMedium(to)}`];
    for (const a of AISLES) {
      const xs = lines.filter((l) => l.aisle === a.value);
      if (!xs.length) continue;
      out.push('', a.label.toUpperCase());
      for (const l of xs) out.push(`${l.checked ? '[x]' : '[ ]'} ${l.name}${l.qty != null || l.unit ? ` — ${qtyText(l.qty, l.unit)}` : ''}`);
    }
    return out.join('\n');
  };

  const csv = async () => {
    const path = await exportCsv(safeFileName(`Groceries ${from} to ${to}`), lines, [
      { header: 'Aisle', value: (l) => AISLES.find((a) => a.value === l.aisle)?.label },
      { header: 'Item', value: (l) => l.name },
      { header: 'Quantity', value: (l) => l.qty },
      { header: 'Unit', value: (l) => l.unit },
      { header: 'For', value: (l) => l.meals.join('; ') },
      { header: 'Got it', value: (l) => l.checked },
    ]);
    if (path) toast(`Exported ${path.split(/[\\/]/).pop()}`);
  };

  return (
    <>
      <Toolbar>
        <DateInput size="sm" value={from} onChange={(v) => v && setRange(v, to)} title="From" />
        <span className="muted">–</span>
        <DateInput size="sm" value={to} onChange={(v) => v && setRange(from, v)} title="To" />
        <Button size="sm" onClick={() => setRange(week, addDays(week, 6))}>
          Plan week
        </Button>
        <Button size="sm" onClick={() => setRange(addDays(week, 7), addDays(week, 13))}>
          Next week
        </Button>
        <div className="spacer" />
        <Button size="sm" icon={hideChecked ? Eye : EyeOff} onClick={() => setHideChecked(!hideChecked)}>
          {hideChecked ? 'Show all' : 'Hide checked'}
        </Button>
        <Button
          size="sm"
          icon={RotateCcw}
          disabled={!done}
          onClick={() =>
            updateTraining((tr) => {
              tr.grocery.checked = [];
              for (const x of tr.grocery.extras) delete x.checked;
            })
          }
        >
          Uncheck all
        </Button>
        <Button size="sm" icon={ClipboardCopy} disabled={!lines.length} onClick={async () => toast((await copyText(asText())) ? 'List copied — paste it in Notes or a message' : 'Could not copy', 'info')}>
          Copy
        </Button>
        <Button size="sm" disabled={!lines.length} onClick={csv}>
          CSV
        </Button>
        <Button size="sm" icon={Printer} onClick={() => openPrint('space-train-grocery', { from, to })}>
          Print
        </Button>
      </Toolbar>
      <div className="tr-page narrow">
        <div className="tr-grocery-summary">
          <ShoppingCart size={16} />
          <span>
            <b>{lines.length}</b> items from <b>{plannedMeals}</b> planned meals · {fmt.dateShort(from)} – {fmt.dateShort(to)}
          </span>
          <span className="spacer" />
          {lines.length > 0 && (
            <span className="muted small">
              {done}/{lines.length} in the cart
            </span>
          )}
        </div>
        {lines.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Nothing to buy yet" description="Plan meals for these days (Meal plan tab) and their ingredients are added up here, grouped by aisle. Add extras below — coffee, paper towels, anything." />
        ) : (
          AISLES.map((a) => {
            const xs = shown.filter((l) => l.aisle === a.value);
            if (!xs.length) return null;
            return (
              <section key={a.value} className="tr-aisle">
                <h4>
                  {a.label} <span className="muted">{xs.length}</span>
                </h4>
                <ul>
                  {xs.map((l) => (
                    <li key={l.key} className={l.checked ? 'checked' : ''}>
                      <button type="button" className="tr-grocery-check" onClick={() => toggle(l)} aria-pressed={l.checked} aria-label={`${l.checked ? 'Uncheck' : 'Check'} ${l.name}`}>
                        {l.checked ? <CheckSquare size={20} /> : <Square size={20} />}
                        <span className="grow">
                          <b>{l.name}</b>
                          {l.meals.length > 0 && <span className="muted tiny"> · {l.meals.join(', ')}</span>}
                        </span>
                        <span className="tr-qty">{qtyText(l.qty, l.unit)}</span>
                      </button>
                      {l.extraId && (
                        <>
                          <Select
                            bare
                            size="sm"
                            value={l.aisle}
                            onChange={(v) =>
                              updateTraining((tr) => {
                                const x = tr.grocery.extras.find((e) => e.id === l.extraId);
                                if (x) x.aisle = v as Aisle;
                              })
                            }
                            options={AISLES}
                            aria-label="Aisle"
                            style={{ width: 110 }}
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Remove ${l.name}`}
                            size="sm"
                            onClick={() =>
                              updateTraining((tr) => {
                                tr.grocery.extras = tr.grocery.extras.filter((e) => e.id !== l.extraId);
                              })
                            }
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
        <div className="tr-grocery-add" onKeyDown={(e) => e.key === 'Enter' && addExtra()}>
          <Input value={name} onChange={setName} placeholder="Add an extra item…" aria-label="Item" />
          <NumberInput value={qty} onChange={setQty} placeholder="Qty" aria-label="Quantity" style={{ width: 70 }} inputMode="decimal" />
          <Combo value={unit} onChange={setUnit} suggestions={['g', 'kg', 'ml', 'l', 'pcs', 'pack', 'bottle', 'can', 'bag']} placeholder="Unit" style={{ width: 80 }} />
          <Button icon={Plus} onClick={addExtra} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </div>
    </>
  );
}
