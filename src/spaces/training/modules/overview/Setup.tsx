/* First-run setup: units, basics, current and goal weight — enough for the
   calculator, the trend and the projection to work from day one. */
import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { Button, DateInput, Field, Input, NumberInput, Select, Tabs, Textarea, toast } from '@/ui';
import { addDays } from '@/lib/dates';
import { ACTIVITY_LEVELS, type ActivityLevel, type Sex, type Units } from '../../types';
import { parseHeight, unitKit } from '../../units';
import { applyMacroResult, updateTraining, upsertMetric } from '../../ops';
import { computeMacros } from '../../calc';
import { NotMedical, WeightInput } from '../../ui';

export function SetupCard({ today }: { today: string }) {
  const [units, setUnits] = useState<Units>('metric');
  const [sex, setSex] = useState<Sex | ''>('');
  const [birthYear, setBirthYear] = useState<number | undefined>();
  const [height, setHeight] = useState('');
  const [kg, setKg] = useState<number | undefined>();
  const [targetKg, setTargetKg] = useState<number | undefined>();
  const [targetDate, setTargetDate] = useState<string | undefined>(addDays(today, 84));
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [statement, setStatement] = useState('');
  const [perWeek, setPerWeek] = useState<number | undefined>(4);
  const u = unitKit(units);
  const heightCm = parseHeight(height, units);

  const save = () => {
    updateTraining((t) => {
      t.profile = { ...t.profile, units, activity, sex: sex || undefined, birthYear, heightCm };
      for (const k of Object.keys(t.profile) as (keyof typeof t.profile)[]) if (t.profile[k] === undefined) delete t.profile[k];
      t.goal = { ...t.goal, statement: statement.trim() || t.goal.statement, startDate: t.goal.startDate ?? today, startWeightKg: t.goal.startWeightKg ?? kg, targetWeightKg: targetKg, targetDate: targetKg != null ? targetDate : undefined, workoutsPerWeek: perWeek };
      for (const k of Object.keys(t.goal) as (keyof typeof t.goal)[]) if (t.goal[k] === undefined) delete t.goal[k];
      if (kg != null) upsertMetric(t, today, { weightKg: kg });
      if (kg != null && targetKg != null) t.calculator.direction = targetKg < kg - 0.5 ? 'lose' : targetKg > kg + 0.5 ? 'gain' : 'maintain';
      if (t.calculator.direction === 'gain') t.calculator.adjustKcal = 250;
      if (!t.macros.calories && sex && birthYear && heightCm && kg) {
        const r = computeMacros({ sex, age: Number(today.slice(0, 4)) - birthYear, heightCm, weightKg: kg, activity, direction: t.calculator.direction, adjustKcal: t.calculator.adjustKcal, proteinPerKg: t.calculator.proteinPerKg, fatPct: t.calculator.fatPct });
        applyMacroResult(t, r, today);
      }
    });
    toast('Training is set up — check in daily and the trends fill in');
  };

  return (
    <div className="card tr-setup">
      <div className="tr-setup-head">
        <Rocket size={20} />
        <div>
          <h2>Set up your training</h2>
          <p className="muted">A minute of basics so the macro calculator, weight trend and projections work from day one. Everything can be changed later in Goals and Nutrition.</p>
        </div>
      </div>
      <div className="tr-form-grid">
        <Field label="Units">
          <Tabs tabs={[{ id: 'metric', label: 'Metric (kg, cm)' }, { id: 'imperial', label: 'Imperial (lb, in)' }]} value={units} onChange={(v) => setUnits(v as Units)} />
        </Field>
        <Field label="Sex (for the BMR formula)">
          <Select value={sex} onChange={(v) => setSex(v as Sex | '')} placeholder="Choose…" options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
        </Field>
        <Field label="Birth year">
          <NumberInput value={birthYear} onChange={setBirthYear} placeholder="1990" inputMode="numeric" />
        </Field>
        <Field label="Height" hint={units === 'imperial' ? "e.g. 5'11 or 71 in" : 'e.g. 178'}>
          <Input value={height} onChange={setHeight} placeholder={units === 'imperial' ? "5'11" : '178 cm'} />
        </Field>
        <Field label="Weight today">
          <WeightInput kg={kg} onChange={setKg} u={u} />
        </Field>
        <Field label="Goal weight">
          <WeightInput kg={targetKg} onChange={setTargetKg} u={u} placeholder="optional" />
        </Field>
        <Field label="By">
          <DateInput value={targetDate} onChange={setTargetDate} />
        </Field>
        <Field label="Activity">
          <Select value={activity} onChange={(v) => setActivity(v as ActivityLevel)} options={ACTIVITY_LEVELS.map((a) => ({ value: a.value, label: `${a.label} — ${a.hint}` }))} />
        </Field>
        <Field label="Workouts per week">
          <NumberInput value={perWeek} onChange={setPerWeek} inputMode="numeric" />
        </Field>
        <Field label="In one sentence, what are you working towards?" span="all">
          <Textarea value={statement} onChange={setStatement} rows={2} placeholder="Lose the last 6 kg, keep my strength and have energy for long shoot days." />
        </Field>
      </div>
      <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
        <Button variant="primary" size="lg" icon={Rocket} onClick={save}>
          Save and start
        </Button>
        {height && heightCm == null && <span className="small" style={{ color: 'var(--danger)' }}>Height not understood</span>}
      </div>
      <NotMedical />
    </div>
  );
}
