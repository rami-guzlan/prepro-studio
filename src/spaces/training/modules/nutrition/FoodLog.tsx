/* Food log of one day: planned meals ticked as eaten plus anything else eaten
   (from the library or custom with macros), totalled against the targets. */
import { useMemo } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, NotebookPen, Plus, Trash2 } from 'lucide-react';
import { Button, Card, DataTable, DateInput, IconButton, Menu, Toolbar, type Column } from '@/ui';
import { useSpaceFormatters } from '@/store/space';
import { addDays } from '@/lib/dates';
import { uid } from '@/lib/id';
import { MEAL_SLOTS, type FoodEntry, type MealSlot } from '../../types';
import { dayEaten, entryLabel, entryMacros, foodMacros, mealMacros, mealMap } from '../../calc';
import { logMealEaten, nowTime, updateTraining } from '../../ops';
import { MacroBars, NotMedical, useToday, useTraining } from '../../ui';

export function FoodLog({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const meals = useMemo(() => mealMap(t), [t]);
  const planned = t.plan.filter((e) => e.date === date);
  const food = t.food.filter((f) => f.date === date);
  const eaten = useMemo(() => dayEaten(t, date, meals), [t, date, meals]);

  const patchFood = (id: string, patch: Partial<FoodEntry>) =>
    updateTraining(
      (tr) => {
        const f = tr.food.find((x) => x.id === id);
        if (!f) return;
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') delete (f as any)[k];
          else (f as any)[k] = v;
        }
      },
      { coalesce: `food:${id}:${Object.keys(patch).join(',')}` },
    );

  const columns: Column<FoodEntry>[] = [
    { key: 'name', header: 'Food', type: 'text', minWidth: 160 },
    { key: 'slot', header: 'Meal', type: 'select', options: MEAL_SLOTS, width: 110 },
    { key: 'servings', header: 'Servings', type: 'number', width: 80 },
    { key: 'calories', header: 'kcal', type: 'number', width: 76, align: 'right', get: (r) => (r.calories != null ? r.calories : Math.round(foodMacros(r, meals).calories) || undefined) },
    { key: 'protein', header: 'Protein', type: 'number', width: 76, align: 'right', get: (r) => (r.protein != null ? r.protein : Math.round(foodMacros(r, meals).protein) || undefined) },
    { key: 'carbs', header: 'Carbs', type: 'number', width: 70, align: 'right', get: (r) => (r.carbs != null ? r.carbs : Math.round(foodMacros(r, meals).carbs) || undefined) },
    { key: 'fat', header: 'Fat', type: 'number', width: 64, align: 'right', get: (r) => (r.fat != null ? r.fat : Math.round(foodMacros(r, meals).fat) || undefined) },
    { key: 'time', header: 'Time', type: 'time', width: 96 },
  ];

  const addCustom = () =>
    updateTraining((tr) => {
      tr.food.push({ id: uid('food'), date, name: 'Snack', time: date === today ? nowTime() : undefined, source: 'me' });
      const f = tr.food[tr.food.length - 1];
      if (f.time === undefined) delete f.time;
    });

  return (
    <>
      <Toolbar>
        <IconButton icon={ChevronLeft} label="Previous day" onClick={() => setDate(addDays(date, -1))} />
        <DateInput size="sm" value={date} onChange={(v) => v && setDate(v)} />
        <IconButton icon={ChevronRight} label="Next day" onClick={() => setDate(addDays(date, 1))} />
        <Button size="sm" onClick={() => setDate(today)} disabled={date === today}>
          Today
        </Button>
        <b className="small">{fmt.dateLong(date)}</b>
        <div className="spacer" />
        <Menu
          align="end"
          trigger={
            <Button size="sm" variant="primary" icon={Plus}>
              Log food
            </Button>
          }
          items={() => [
            { label: 'Custom food…', icon: NotebookPen, onClick: addCustom },
            ...(t.meals.length ? [{ separator: true }, { header: 'From your meals' }] : []),
            ...[...t.meals]
              .sort((a, b) => a.name.localeCompare(b.name))
              .slice(0, 40)
              .map((m) => ({
                label: `${m.name}${mealMacros(m).known ? `  ·  ${Math.round(mealMacros(m).calories)} kcal` : ''}`,
                onClick: () =>
                  updateTraining((tr) => {
                    logMealEaten(tr, date, { meal: m.id, slot: m.slot as MealSlot | undefined, time: date === today ? nowTime() : undefined, source: 'me' });
                  }),
              })),
          ]}
        />
      </Toolbar>
      <div className="tr-page">
        <div className="tr-cols">
          <div className="tr-col">
            <Card title="Planned meals">
              {planned.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  Nothing planned for this day. Log what you ate with “Log food”, or tell your AI.
                </p>
              ) : (
                <ul className="tr-today-meals">
                  {MEAL_SLOTS.flatMap((s) =>
                    planned
                      .filter((e) => e.slot === s.value)
                      .map((e) => {
                        const m = entryMacros(e, meals);
                        return (
                          <li key={e.id}>
                            <button
                              type="button"
                              className={`tr-eat ${e.eaten ? 'on' : ''}`}
                              aria-pressed={!!e.eaten}
                              aria-label={e.eaten ? 'Eaten' : 'Mark eaten'}
                              onClick={() =>
                                updateTraining((tr) => {
                                  const x = tr.plan.find((p) => p.id === e.id);
                                  if (!x) return;
                                  if (x.eaten) delete x.eaten;
                                  else x.eaten = true;
                                })
                              }
                            >
                              {e.eaten ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                            </button>
                            <div className="grow">
                              <span className="tr-slot">{s.label}</span>
                              <b>{entryLabel(e, meals)}</b>
                              {e.servings !== 1 && <span className="muted"> × {e.servings}</span>}
                            </div>
                            <span className="muted small nowrap">{m.calories ? `${Math.round(m.calories)} kcal · ${Math.round(m.protein)} P` : ''}</span>
                          </li>
                        );
                      }),
                  )}
                </ul>
              )}
            </Card>
            <Card title={`Also eaten${food.length ? ` · ${food.length}` : ''}`} padded={false}>
              <div className="tr-scroll-x">
                <DataTable
                  rows={food}
                  columns={columns}
                  onChange={(id, patch) => patchFood(id, patch)}
                  rowActions={(r) => [
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      onClick: () =>
                        updateTraining((tr) => {
                          tr.food = tr.food.filter((x) => x.id !== r.id);
                        }),
                    },
                  ]}
                  onDelete={(r) =>
                    updateTraining((tr) => {
                      tr.food = tr.food.filter((x) => x.id !== r.id);
                    })
                  }
                  emptyText="Nothing else logged. Use “Log food” for snacks, meals out or anything off-plan."
                />
              </div>
            </Card>
          </div>
          <div className="tr-col">
            <Card title="Day total">
              <MacroBars value={eaten} targets={t.macros} />
              <p className="tr-note">
                {eaten.items} item{eaten.items === 1 ? '' : 's'} logged.{' '}
                {t.macros.calories ? `${Math.round(t.macros.calories - eaten.calories) >= 0 ? `${Math.round(t.macros.calories - eaten.calories)} kcal left` : `${Math.round(eaten.calories - t.macros.calories)} kcal over`}${t.macros.proteinG ? ` · ${Math.max(0, Math.round(t.macros.proteinG - eaten.protein))} g protein to go` : ''}.` : 'Set targets in the Macros tab.'}
              </p>
              <NotMedical>Targets are estimates, not medical advice.</NotMedical>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
