/* Meal library: common meals with ingredients (quantities, aisle, optional
   macros per ingredient) or per-serving macros, tags and prep notes. */
import { useMemo, useState } from 'react';
import { BookOpen, Clock, Copy, Plus, Star, Trash2, X } from 'lucide-react';
import { Button, Checkbox, Combo, confirmDialog, EmptyState, Field, IconButton, ImageDrop, Input, Modal, NumberInput, SearchInput, Select, Textarea, toast, Toolbar, AssetImage } from '@/ui';
import { uid } from '@/lib/id';
import { AISLES, MEAL_SLOTS, normalizeIngredient, type Aisle, type Ingredient, type Meal, type MealSlot } from '../../types';
import { guessAisle, mealMacros } from '../../calc';
import { updateTraining } from '../../ops';
import { useTraining } from '../../ui';

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'cup', 'tbsp', 'tsp', 'oz', 'lb', 'slice', 'scoop', 'can', 'pack', 'clove', 'bunch'];

/** "200 g chicken breast", "2 eggs", "1.5 cup oats" → ingredient. */
export function parseIngredientLine(line: string): Ingredient | null {
  const s = line.trim().replace(/^[-*•]\s*/, '');
  if (!s) return null;
  const m = /^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*([a-zA-Z]+\.?)?\s+(.+)$/.exec(s);
  if (!m) return { name: s, aisle: guessAisle(s) };
  const qty = m[1].includes('/') ? Number(m[1].split('/')[0]) / Number(m[1].split('/')[1]) : Number(m[1].replace(',', '.'));
  let unit: string | undefined = m[2]?.replace(/\.$/, '').toLowerCase();
  let name = m[3].trim();
  if (unit && !UNITS.includes(unit) && !['gram', 'grams', 'cups', 'tbsps', 'tsps', 'slices', 'scoops', 'cans', 'cloves'].includes(unit)) {
    name = `${m[2]} ${name}`;
    unit = undefined;
  }
  if (unit) unit = unit.replace(/^grams?$/, 'g').replace(/s$/, (x) => (['pcs'].includes(unit!) ? x : ''));
  return { name, qty: isFinite(qty) ? qty : undefined, unit: unit || undefined, aisle: guessAisle(name) };
}

export function MealLibrary({ highlight, onNew }: { highlight?: string; onNew: () => void }) {
  const t = useTraining();
  const [q, setQ] = useState('');
  const [slot, setSlot] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [edit, setEdit] = useState<Meal | null>(null);
  const tags = useMemo(() => [...new Set(t.meals.flatMap((m) => m.tags))].sort(), [t.meals]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...t.meals]
      .filter((m) => (!slot || m.slot === slot) && (!tag || m.tags.includes(tag)) && (!s || m.name.toLowerCase().includes(s) || m.ingredients.some((i) => i.name.toLowerCase().includes(s)) || m.tags.some((x) => x.toLowerCase().includes(s))))
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name));
  }, [t.meals, q, slot, tag]);
  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of t.plan) if (e.mealId) m.set(e.mealId, (m.get(e.mealId) ?? 0) + 1);
    return m;
  }, [t.plan]);

  if (!t.meals.length)
    return (
      <div className="tr-page">
        <EmptyState
          icon={BookOpen}
          title="Build your meal library"
          description="Add the meals you eat on repeat — ingredients with quantities (for the grocery list) and macros per ingredient or per serving. Then drag them into the weekly plan. Your AI can add them for you too: “add my usual overnight oats: 80 g oats, 200 ml milk, 150 g skyr, 100 g blueberries”."
          action={
            <Button variant="primary" icon={Plus} onClick={onNew}>
              New meal
            </Button>
          }
        />
      </div>
    );

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search meals or ingredients…" width={240} />
        <Select value={slot} onChange={setSlot} placeholder="Any meal" options={MEAL_SLOTS} size="sm" />
        {tags.length > 0 && <Select value={tag} onChange={setTag} placeholder="Any tag" options={tags} size="sm" />}
        <div className="spacer" />
        <span className="muted small">
          {list.length} of {t.meals.length}
        </span>
      </Toolbar>
      <div className="tr-page">
        <div className="tr-meal-grid">
          {list.map((m) => {
            const mm = mealMacros(m);
            return (
              <button key={m.id} type="button" className={`tr-meal-card ${highlight === m.id ? 'hl' : ''}`} onClick={() => setEdit(m)}>
                {m.image ? <AssetImage name={m.image} className="tr-meal-img" /> : null}
                <div className="tr-meal-body">
                  <div className="row" style={{ gap: 6 }}>
                    <b className="grow ellipsis">{m.name}</b>
                    {m.favorite && <Star size={14} className="tr-star" />}
                  </div>
                  <div className="muted small">
                    {MEAL_SLOTS.find((s) => s.value === m.slot)?.label ?? 'Any time'}
                    {m.prepMinutes ? (
                      <>
                        {' · '}
                        <Clock size={11} style={{ verticalAlign: -1 }} /> {m.prepMinutes} min
                      </>
                    ) : null}
                    {m.servings !== 1 ? ` · makes ${m.servings}` : ''}
                  </div>
                  {mm.known ? (
                    <div className="tr-meal-macros">
                      <span>
                        <b>{Math.round(mm.calories)}</b> kcal
                      </span>
                      <span>
                        <b>{Math.round(mm.protein)}</b> P
                      </span>
                      <span>
                        <b>{Math.round(mm.carbs)}</b> C
                      </span>
                      <span>
                        <b>{Math.round(mm.fat)}</b> F
                      </span>
                    </div>
                  ) : (
                    <div className="muted small">No macros yet</div>
                  )}
                  <div className="muted small ellipsis">{m.ingredients.length ? m.ingredients.map((i) => i.name).join(', ') : 'No ingredients'}</div>
                  {(m.tags.length > 0 || uses.get(m.id)) && (
                    <div className="row wrap" style={{ gap: 4 }}>
                      {m.tags.map((x) => (
                        <span key={x} className="chip">
                          {x}
                        </span>
                      ))}
                      {uses.get(m.id) ? <span className="muted tiny">planned {uses.get(m.id)}×</span> : null}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          <button type="button" className="tr-meal-card tr-meal-new" onClick={onNew}>
            <Plus size={22} />
            New meal
          </button>
        </div>
      </div>
      {edit && <MealModal meal={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function MealModal({ meal, isNew, onClose }: { meal: Meal; isNew?: boolean; onClose: () => void }) {
  const t = useTraining();
  const [m, setM] = useState<Meal>(() => {
    const copy: Meal = JSON.parse(JSON.stringify(meal));
    copy.ingredients = (Array.isArray(copy.ingredients) ? copy.ingredients : []).map(normalizeIngredient).filter((x): x is Ingredient => !!x);
    copy.tags = Array.isArray(copy.tags) ? copy.tags : [];
    return copy;
  });
  const [quick, setQuick] = useState('');
  const [manual, setManual] = useState(() => m.calories != null || m.protein != null);
  const set = (patch: Partial<Meal>) => setM((x) => ({ ...x, ...patch }));
  const setIng = (i: number, patch: Partial<Ingredient>) => setM((x) => ({ ...x, ingredients: x.ingredients.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const tagSuggestions = useMemo(() => [...new Set(t.meals.flatMap((x) => x.tags))], [t.meals]);
  const macros = mealMacros(manual ? m : { ...m, calories: undefined, protein: undefined, carbs: undefined, fat: undefined });

  const addQuick = () => {
    const lines = quick.split(/\n|;/).map(parseIngredientLine).filter((x): x is Ingredient => !!x);
    if (!lines.length) return;
    setM((x) => ({ ...x, ingredients: [...x.ingredients, ...lines] }));
    setQuick('');
  };

  const save = () => {
    const name = m.name.trim();
    if (!name) {
      toast('Give the meal a name', 'info');
      return;
    }
    const row: Meal = { ...m, name, ingredients: m.ingredients.filter((i) => i.name.trim()).map((i) => ({ ...i, name: i.name.trim() })) };
    if (!manual) {
      delete row.calories;
      delete row.protein;
      delete row.carbs;
      delete row.fat;
    }
    for (const k of Object.keys(row) as (keyof Meal)[]) if (row[k] === undefined || row[k] === '') delete row[k];
    updateTraining((tr) => {
      const i = tr.meals.findIndex((x) => x.id === row.id);
      if (i >= 0) tr.meals[i] = row;
      else tr.meals.push(row);
    });
    onClose();
  };

  const remove = async () => {
    const planned = t.plan.filter((e) => e.mealId === m.id).length;
    const ok = await confirmDialog({ title: `Delete “${m.name}”?`, message: planned ? `It is planned ${planned} time${planned === 1 ? '' : 's'}; those plan entries are removed too. Ctrl+Z brings everything back.` : 'Ctrl+Z brings it back.', confirmLabel: 'Delete meal', danger: true });
    if (!ok) return;
    updateTraining((tr) => {
      tr.meals = tr.meals.filter((x) => x.id !== m.id);
      tr.plan = tr.plan.filter((e) => e.mealId !== m.id);
      for (const f of tr.food) if (f.mealId === m.id) delete f.mealId;
    });
    onClose();
  };

  const duplicate = () => {
    const copy: Meal = { ...JSON.parse(JSON.stringify(m)), id: uid('meal'), name: `${m.name} (copy)` };
    updateTraining((tr) => {
      tr.meals.push(copy);
    });
    toast(`Duplicated as “${copy.name}”`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New meal' : 'Edit meal'}
      size="lg"
      dismissable={false}
      footer={
        <>
          {!isNew && (
            <>
              <Button variant="danger" icon={Trash2} onClick={remove}>
                Delete
              </Button>
              <Button icon={Copy} onClick={duplicate}>
                Duplicate
              </Button>
            </>
          )}
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {isNew ? 'Add meal' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="tr-meal-edit">
        <div className="tr-form-grid">
          <Field label="Name" span={2}>
            <Input value={m.name} onChange={(name) => set({ name })} placeholder="Overnight oats with berries" autoFocus={isNew} />
          </Field>
          <Field label="Usually for">
            <Select value={m.slot ?? ''} onChange={(v) => set({ slot: (v || undefined) as MealSlot | undefined })} placeholder="Any time" options={MEAL_SLOTS} />
          </Field>
          <Field label="Recipe makes" hint="servings">
            <NumberInput value={m.servings} onChange={(v) => set({ servings: Math.max(0.25, v ?? 1) })} inputMode="decimal" />
          </Field>
          <Field label="Prep time" hint="minutes">
            <NumberInput value={m.prepMinutes} onChange={(prepMinutes) => set({ prepMinutes })} inputMode="numeric" />
          </Field>
          <Field label="Tags" hint="comma separated" span={2}>
            <Combo value={m.tags.join(', ')} onChange={(v) => set({ tags: v.split(',').map((x) => x.trim()).filter(Boolean) })} suggestions={tagSuggestions} placeholder="high protein, batch cook, quick" />
          </Field>
          <Field label="Favourite">
            <Checkbox checked={!!m.favorite} onChange={(favorite) => set({ favorite: favorite || undefined })} label="Show first" />
          </Field>
        </div>

        <div className="tr-ing-head">
          <h4>Ingredients</h4>
          <span className="muted small">quantities for the whole recipe ({m.servings} serving{m.servings === 1 ? '' : 's'}) · macros optional</span>
        </div>
        <div className="table-wrap tr-scroll-x">
          <table className="table tr-ing-table">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Ingredient</th>
                <th style={{ width: 70 }}>Qty</th>
                <th style={{ width: 80 }}>Unit</th>
                <th style={{ width: 120 }}>Aisle</th>
                <th style={{ width: 66 }}>kcal</th>
                <th style={{ width: 56 }}>P</th>
                <th style={{ width: 56 }}>C</th>
                <th style={{ width: 56 }}>F</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {m.ingredients.map((g, i) => (
                <tr key={i}>
                  <td>
                    <Input bare value={g.name} onChange={(name) => setIng(i, { name })} onBlur={() => !g.aisle && g.name && setIng(i, { aisle: guessAisle(g.name) })} />
                  </td>
                  <td>
                    <NumberInput bare value={g.qty} onChange={(qty) => setIng(i, { qty })} inputMode="decimal" />
                  </td>
                  <td>
                    <Combo bare value={g.unit ?? ''} onChange={(unit) => setIng(i, { unit: unit || undefined })} suggestions={UNITS} />
                  </td>
                  <td>
                    <Select bare value={g.aisle ?? guessAisle(g.name)} onChange={(v) => setIng(i, { aisle: v as Aisle })} options={AISLES} />
                  </td>
                  {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
                    <td key={k}>
                      <NumberInput bare value={g[k]} onChange={(v) => setIng(i, { [k]: v })} inputMode="decimal" disabled={manual} />
                    </td>
                  ))}
                  <td>
                    <IconButton icon={X} label="Remove ingredient" size="sm" onClick={() => setM((x) => ({ ...x, ingredients: x.ingredients.filter((_, j) => j !== i) }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tr-ing-quick">
          <Textarea
            value={quick}
            onChange={setQuick}
            rows={1}
            placeholder="Quick add: 200 g chicken breast; 1 cup rice; 2 eggs  (Enter adds)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addQuick();
              }
            }}
          />
          <Button icon={Plus} onClick={() => (quick.trim() ? addQuick() : setM((x) => ({ ...x, ingredients: [...x.ingredients, { name: '' }] })))}>
            {quick.trim() ? 'Add' : 'Add row'}
          </Button>
        </div>

        <div className="tr-meal-macro-box">
          <Checkbox checked={manual} onChange={setManual} label="Enter macros per serving by hand (instead of summing ingredients)" />
          {manual ? (
            <div className="tr-form-grid four">
              {(
                [
                  ['calories', 'kcal'],
                  ['protein', 'Protein g'],
                  ['carbs', 'Carbs g'],
                  ['fat', 'Fat g'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <NumberInput value={m[k]} onChange={(v) => set({ [k]: v })} inputMode="decimal" />
                </Field>
              ))}
            </div>
          ) : null}
          <div className="tr-meal-macros big">
            <span className="muted small">Per serving:</span>
            <span>
              <b>{Math.round(macros.calories)}</b> kcal
            </span>
            <span>
              <b>{Math.round(macros.protein)}</b> g protein
            </span>
            <span>
              <b>{Math.round(macros.carbs)}</b> g carbs
            </span>
            <span>
              <b>{Math.round(macros.fat)}</b> g fat
            </span>
          </div>
        </div>

        <div className="tr-form-grid">
          <Field label="Prep notes" span="all">
            <Textarea value={m.notes ?? ''} onChange={(notes) => set({ notes })} rows={3} placeholder="Batch cook Sunday; keeps 4 days in the fridge." />
          </Field>
          <Field label="Photo">
            <ImageDrop value={m.image} onChange={(image) => set({ image: image || undefined })} aspect={4 / 3} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
