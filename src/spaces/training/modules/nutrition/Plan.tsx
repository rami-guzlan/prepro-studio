/* Weekly meal plan: 7 day cards × breakfast / lunch / dinner / snacks. Pick meals
   from a menu (works on a phone) or drag them from the library or between
   slots (Ctrl/⌥ + drag copies). Each day totals its macros against the targets. */
import { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Copy, Eraser, GripVertical, Minus, Plus, ShoppingCart, Type, X } from 'lucide-react';
import { Button, confirmDialog, EmptyState, IconButton, Menu, promptDialog, SearchInput, toast, Toolbar, type MenuItem } from '@/ui';
import { useSpaceFormatters } from '@/store/space';
import { addDays, weekdayLong } from '@/lib/dates';
import { uid } from '@/lib/id';
import { MEAL_SLOTS, type Meal, type MealSlot, type PlanEntry } from '../../types';
import { dayPlanned, entryLabel, entryMacros, mealMacros, mealMap, weekStartOf, type Macros } from '../../calc';
import { copyPlanWeek, updateTraining } from '../../ops';
import { useMondayFirst, useToday, useTraining } from '../../ui';

const DRAG_ENTRY = 'application/x-tr-plan';
const DRAG_MEAL = 'application/x-tr-meal';

function addEntry(date: string, slot: MealSlot, patch: Partial<PlanEntry>) {
  updateTraining((t) => {
    t.plan.push({ id: uid('plan'), date, slot, servings: 1, ...patch });
  });
}

function patchEntry(id: string, patch: Partial<PlanEntry>) {
  updateTraining((t) => {
    const e = t.plan.find((x) => x.id === id);
    if (!e) return;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (e as any)[k];
      else (e as any)[k] = v;
    }
  });
}

export function MealPlan({ week, setWeek, onGroceries, onNewMeal }: { week: string; setWeek: (w: string) => void; onGroceries: () => void; onNewMeal: () => void }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const mondayFirst = useMondayFirst();
  const [q, setQ] = useState('');
  const meals = useMemo(() => mealMap(t), [t]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const inWeek = t.plan.filter((e) => e.date >= week && e.date <= days[6]);
  const prevCount = t.plan.filter((e) => e.date >= addDays(week, -7) && e.date < week).length;
  const library = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...t.meals].filter((m) => !s || m.name.toLowerCase().includes(s) || m.tags.some((x) => x.toLowerCase().includes(s))).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name));
  }, [t.meals, q]);

  const copyLast = async () => {
    if (!prevCount) return;
    if (inWeek.length && !(await confirmDialog({ title: 'Replace this week?', message: `This week's ${inWeek.length} planned meals are replaced by last week's ${prevCount}.`, confirmLabel: 'Replace' }))) return;
    updateTraining((tr) => {
      copyPlanWeek(tr, addDays(week, -7), week);
    });
    toast(`Copied ${prevCount} meals from last week`);
  };
  const repeatNext = () => {
    updateTraining((tr) => {
      copyPlanWeek(tr, week, addDays(week, 7));
    });
    toast(`Next week now repeats this week (${inWeek.length} meals)`);
    setWeek(addDays(week, 7));
  };
  const clearWeek = async () => {
    if (!(await confirmDialog({ title: 'Clear this week?', message: `${inWeek.length} planned meals are removed. Ctrl+Z brings them back.`, confirmLabel: 'Clear week', danger: true }))) return;
    updateTraining((tr) => {
      tr.plan = tr.plan.filter((e) => e.date < week || e.date > days[6]);
    });
  };

  const weekLabel = `${fmt.dateMedium(week)} – ${fmt.dateMedium(days[6])}`;

  return (
    <>
      <Toolbar>
        <div className="row" style={{ gap: 4 }}>
          <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeek(addDays(week, -7))} />
          <Button size="sm" onClick={() => setWeek(weekStartOf(today, mondayFirst))} disabled={today >= week && today <= days[6]}>
            This week
          </Button>
          <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeek(addDays(week, 7))} />
        </div>
        <b className="small nowrap">{weekLabel}</b>
        <div className="spacer" />
        <Menu
          align="end"
          trigger={
            <Button size="sm" icon={Copy}>
              Copy
            </Button>
          }
          items={[
            { label: `Copy last week here${prevCount ? ` (${prevCount})` : ''}`, icon: Copy, onClick: copyLast, disabled: !prevCount },
            { label: 'Repeat this week next week', icon: ChevronRight, onClick: repeatNext, disabled: !inWeek.length },
            { separator: true },
            { label: 'Clear this week', icon: Eraser, danger: true, onClick: clearWeek, disabled: !inWeek.length },
          ]}
        />
        <Button size="sm" icon={ShoppingCart} onClick={onGroceries}>
          Grocery list
        </Button>
      </Toolbar>
      <div className="tr-plan">
        <aside className="tr-plan-lib">
          <div className="tr-plan-lib-head">
            <SearchInput value={q} onChange={setQ} placeholder="Meals…" width="100%" />
          </div>
          <div className="tr-plan-lib-list">
            {library.map((m) => (
              <LibraryItem key={m.id} m={m} />
            ))}
            {!t.meals.length && <p className="muted small" style={{ padding: 10 }}>No meals yet.</p>}
          </div>
          <Button size="sm" icon={Plus} onClick={onNewMeal} style={{ margin: 8 }}>
            New meal
          </Button>
          <p className="muted tiny" style={{ padding: '0 10px 10px' }}>
            Drag a meal onto a slot. Drag planned meals to move them; hold Ctrl to copy.
          </p>
        </aside>
        <div className="tr-plan-main">
          {!t.meals.length && (
            <EmptyState
              icon={BookOpen}
              title="Add a few meals first"
              description="The plan is built from your meal library. Add your go-to breakfasts, lunches, dinners and snacks, then fill the week."
              action={
                <Button variant="primary" icon={Plus} onClick={onNewMeal}>
                  New meal
                </Button>
              }
            />
          )}
          <div className="tr-plan-days">
            {days.map((d) => (
              <DayCard key={d} date={d} isToday={d === today} meals={meals} library={library} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function LibraryItem({ m }: { m: Meal }) {
  const mm = mealMacros(m);
  return (
    <div
      className="tr-plan-lib-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MEAL, m.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={`${m.name}${mm.known ? ` · ${Math.round(mm.calories)} kcal · ${Math.round(mm.protein)} g protein per serving` : ''}`}
    >
      <GripVertical size={12} className="muted" />
      <span className="grow ellipsis">{m.name}</span>
      {mm.known && <span className="muted tiny">{Math.round(mm.calories)}</span>}
    </div>
  );
}

function macroLine(m: Macros) {
  return `${Math.round(m.calories)} kcal · ${Math.round(m.protein)} P · ${Math.round(m.carbs)} C · ${Math.round(m.fat)} F`;
}

function DayCard({ date, isToday, meals, library }: { date: string; isToday: boolean; meals: Map<string, Meal>; library: Meal[] }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const [over, setOver] = useState<string | null>(null);
  const entries = t.plan.filter((e) => e.date === date);
  const total = dayPlanned(t, date, meals);
  const target = t.macros.calories;
  const tone = target && total.calories ? (Math.abs(total.calories - target) <= target * 0.1 ? 'good' : total.calories > target ? 'over' : 'under') : '';

  const pickItems = (slot: MealSlot): MenuItem[] => {
    const first = library.filter((m) => m.slot === slot);
    const rest = library.filter((m) => m.slot !== slot);
    const item = (m: Meal): MenuItem => ({ label: `${m.name}${mealMacros(m).known ? `  ·  ${Math.round(mealMacros(m).calories)} kcal` : ''}`, onClick: () => addEntry(date, slot, { mealId: m.id }) });
    const out: MenuItem[] = [];
    if (first.length) out.push({ header: MEAL_SLOTS.find((s) => s.value === slot)!.label }, ...first.slice(0, 25).map(item));
    if (rest.length) out.push({ header: first.length ? 'Other meals' : 'Meals' }, ...rest.slice(0, 25).map(item));
    if (out.length) out.push({ separator: true });
    out.push({
      label: 'Something else (text)…',
      icon: Type,
      onClick: async () => {
        const text = await promptDialog({ title: 'What is planned?', placeholder: 'Dinner out with the crew' });
        if (text?.trim()) addEntry(date, slot, { text: text.trim() });
      },
    });
    return out;
  };

  const onDrop = (e: React.DragEvent, slot: MealSlot) => {
    e.preventDefault();
    setOver(null);
    const mealId = e.dataTransfer.getData(DRAG_MEAL);
    const entryId = e.dataTransfer.getData(DRAG_ENTRY);
    if (mealId) addEntry(date, slot, { mealId });
    else if (entryId) {
      const copy = e.ctrlKey || e.altKey || e.metaKey;
      updateTraining((tr) => {
        const src = tr.plan.find((x) => x.id === entryId);
        if (!src) return;
        if (copy) tr.plan.push({ ...src, id: uid('plan'), date, slot, eaten: undefined });
        else {
          src.date = date;
          src.slot = slot;
        }
        for (const x of tr.plan) if (x.eaten === undefined) delete x.eaten;
      });
    }
  };

  return (
    <div className={`tr-day ${isToday ? 'today' : ''}`}>
      <div className="tr-day-head">
        <b>{weekdayLong(date)}</b>
        <span className="muted small">{fmt.dateShort(date).replace(/^\w+ /, '')}</span>
        {isToday && <span className="tr-pill accent">Today</span>}
      </div>
      {MEAL_SLOTS.map((s) => {
        const list = entries.filter((e) => e.slot === s.value);
        const key = `${s.value}`;
        return (
          <div
            key={s.value}
            className={`tr-slot-box ${over === key ? 'over' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_MEAL) || e.dataTransfer.types.includes(DRAG_ENTRY)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_MEAL) || e.ctrlKey || e.altKey ? 'copy' : 'move';
                setOver(key);
              }
            }}
            onDragLeave={() => setOver((o) => (o === key ? null : o))}
            onDrop={(e) => onDrop(e, s.value)}
          >
            <div className="tr-slot-head">
              <span className="tr-slot">{s.label}</span>
              <Menu trigger={<IconButton icon={Plus} label={`Add to ${s.label} on ${weekdayLong(date)}`} size="sm" />} items={() => pickItems(s.value)} />
            </div>
            {list.map((e) => (
              <PlanChip key={e.id} e={e} meals={meals} />
            ))}
          </div>
        );
      })}
      <div className={`tr-day-total ${tone}`} title={target ? `Target ${target} kcal · ${t.macros.proteinG ?? '—'} g protein` : undefined}>
        {total.calories ? macroLine(total) : <span className="muted">Nothing planned</span>}
      </div>
    </div>
  );
}

function PlanChip({ e, meals }: { e: PlanEntry; meals: Map<string, Meal> }) {
  const m = entryMacros(e, meals);
  const label = entryLabel(e, meals);
  return (
    <div
      className={`tr-plan-chip ${e.eaten ? 'eaten' : ''} ${!e.mealId ? 'text' : ''}`}
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(DRAG_ENTRY, e.id);
        ev.dataTransfer.effectAllowed = 'copyMove';
      }}
      title={m.calories ? macroLine(m) : label}
    >
      <button type="button" className="tr-chip-eat" aria-pressed={!!e.eaten} aria-label={e.eaten ? 'Eaten — click to undo' : 'Mark eaten'} onClick={() => patchEntry(e.id, { eaten: e.eaten ? undefined : true })}>
        {e.eaten ? <CheckCircle2 size={15} /> : <Circle size={15} />}
      </button>
      <span className="grow tr-chip-name">{label}</span>
      {e.mealId && (
        <span className="tr-servings">
          <button type="button" aria-label="Fewer servings" onClick={() => patchEntry(e.id, { servings: Math.max(0.5, e.servings - 0.5) })}>
            <Minus size={11} />
          </button>
          <span>{e.servings}×</span>
          <button type="button" aria-label="More servings" onClick={() => patchEntry(e.id, { servings: e.servings + 0.5 })}>
            <Plus size={11} />
          </button>
        </span>
      )}
      <button
        type="button"
        className="tr-chip-x"
        aria-label={`Remove ${label}`}
        onClick={() =>
          updateTraining((t) => {
            t.plan = t.plan.filter((x) => x.id !== e.id);
          })
        }
      >
        <X size={13} />
      </button>
    </div>
  );
}
