/* Nutrition: weekly meal plan, meal library, grocery list, food log and the
   macro calculator. Tab and week come from navigation params (agents can open
   any of them with show_in_app). */
import { useEffect, useState } from 'react';
import { BookOpen, Calculator as CalcIcon, CalendarRange, NotebookPen, Plus, Salad, ShoppingCart } from 'lucide-react';
import { Button, ExportMenu, ModuleHeader, UnderlineTabs } from '@/ui';
import { readLS, writeLS } from '@/store/app';
import { useMondayFirst, useNavParams, useToday, useTraining } from '../../ui';
import { weekStartOf } from '../../calc';
import { addDays } from '@/lib/dates';
import { MealPlan } from './Plan';
import { MealLibrary, MealModal } from './Meals';
import { GroceryList } from './Grocery';
import { MacroCalculator } from './Calculator';
import { FoodLog } from './FoodLog';
import { makeMeal } from '../../ops';
import type { Meal } from '../../types';

type Tab = 'plan' | 'meals' | 'groceries' | 'log' | 'calculator';
const TABS: Tab[] = ['plan', 'meals', 'groceries', 'log', 'calculator'];
const LS = 'prepro.training.nutritionTab';

export default function TrainingNutrition() {
  const t = useTraining();
  const today = useToday();
  const mondayFirst = useMondayFirst();
  const params = useNavParams();
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(params.tab) ? params.tab : readLS<Tab>(LS, t.meals.length ? 'plan' : 'calculator')));
  const [week, setWeek] = useState(() => weekStartOf(params.week ?? today, mondayFirst));
  const [logDate, setLogDate] = useState<string>(params.date ?? today);
  const [newMeal, setNewMeal] = useState<Meal | null>(null);

  const setTab = (x: Tab) => {
    setTabState(x);
    writeLS(LS, x);
  };

  useEffect(() => {
    if (TABS.includes(params.tab)) setTabState(params.tab);
    if (params.week) setWeek(weekStartOf(params.week, mondayFirst));
    if (params.date) setLogDate(params.date);
  }, [params, mondayFirst]);

  const from = t.grocery.from ?? week;
  const to = t.grocery.to ?? addDays(week, 6);

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Nutrition"
        icon={Salad}
        subtitle={t.macros.calories ? `Targets: ${t.macros.calories} kcal · ${t.macros.proteinG ?? '—'} g protein · ${t.macros.carbsG ?? '—'} g carbs · ${t.macros.fatG ?? '—'} g fat` : 'Meal plan, groceries and macros'}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-train-meal-plan', label: 'Weekly meal plan', options: { week } },
                { id: 'space-train-grocery', label: 'Grocery list', options: { from, to } },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => setNewMeal(makeMeal({ name: '' }))}>
              New meal
            </Button>
          </>
        }
      />
      <UnderlineTabs
          tabs={[
            { id: 'plan', label: 'Meal plan', icon: CalendarRange },
            { id: 'meals', label: 'Meals', icon: BookOpen, count: t.meals.length },
            { id: 'groceries', label: 'Groceries', icon: ShoppingCart },
            { id: 'log', label: 'Food log', icon: NotebookPen },
            { id: 'calculator', label: 'Macros', icon: CalcIcon },
          ]}
          value={tab}
          onChange={(x) => setTab(x as Tab)}
        />
      <div className="module-body">
        {tab === 'plan' && <MealPlan week={week} setWeek={setWeek} onGroceries={() => setTab('groceries')} onNewMeal={() => setNewMeal(makeMeal({ name: '' }))} />}
        {tab === 'meals' && <MealLibrary highlight={params.mealId} onNew={() => setNewMeal(makeMeal({ name: '' }))} />}
        {tab === 'groceries' && <GroceryList week={week} />}
        {tab === 'log' && <FoodLog date={logDate} setDate={setLogDate} />}
        {tab === 'calculator' && <MacroCalculator />}
      </div>
      {newMeal && <MealModal meal={newMeal} isNew onClose={() => setNewMeal(null)} />}
    </div>
  );
}
