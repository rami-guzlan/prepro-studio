/* Macro calculator: Mifflin–St Jeor BMR × activity → TDEE, goal deficit or
   surplus, protein in g/kg, fat as % of calories, carbs = the rest. Shows the
   formula with your numbers; "Use as my targets" saves them. Targets can also be
   typed by hand. */
import { useMemo, useState } from 'react';
import { Calculator, Check, Sigma } from 'lucide-react';
import { Button, Card, Field, Input, NumberInput, Select, Tabs, toast } from '@/ui';
import { StatTile, VIZ } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { ACTIVITY_LEVELS, type ActivityLevel, type GoalDirection, type MacroTargets, type Sex, type Units } from '../../types';
import { ageOf, computeMacros, latestWeight, round } from '../../calc';
import { applyMacroResult, updateTraining } from '../../ops';
import { parseHeight, unitKit } from '../../units';
import { NotMedical, NumberUnit, useToday, useTraining, WeightInput } from '../../ui';

export function MacroCalculator() {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const u = unitKit(t.profile.units);
  const [weightKg, setWeightKg] = useState<number | undefined>(() => latestWeight(t)?.kg);
  const [heightText, setHeightText] = useState<string | null>(null);
  const c = t.calculator;
  const p = t.profile;
  const age = ageOf(t, today);

  const input = useMemo(
    () => ({ sex: p.sex, age, heightCm: p.heightCm, weightKg, activity: p.activity, direction: c.direction, adjustKcal: c.adjustKcal, proteinPerKg: c.proteinPerKg, fatPct: c.fatPct }),
    [p.sex, age, p.heightCm, weightKg, p.activity, c],
  );
  const r = useMemo(() => computeMacros(input), [input]);

  const setCalc = (patch: Partial<typeof c>) =>
    updateTraining(
      (tr) => {
        Object.assign(tr.calculator, patch);
      },
      { coalesce: `calc:${Object.keys(patch).join(',')}` },
    );
  const setProfile = (patch: Partial<typeof p>) =>
    updateTraining((tr) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (tr.profile as any)[k];
        else (tr.profile as any)[k] = v;
      }
    });
  const setTarget = (k: keyof MacroTargets, v: number | undefined) =>
    updateTraining(
      (tr) => {
        if (v == null) delete (tr.macros as any)[k];
        else (tr.macros as any)[k] = v;
        tr.macros.source = 'manual';
        tr.macros.updatedAt = today;
      },
      { coalesce: `macros:${k}` },
    );

  const apply = () => {
    updateTraining((tr) => applyMacroResult(tr, r, today));
    toast(`Targets set: ${r.calories} kcal · ${r.proteinG} P · ${r.carbsG} C · ${r.fatG} F`);
  };

  const commitHeight = () => {
    if (heightText == null) return;
    const cm = parseHeight(heightText, p.units);
    if (cm != null) setProfile({ heightCm: cm });
    setHeightText(null);
  };

  const sameAsTargets = r.ok && t.macros.calories === r.calories && t.macros.proteinG === r.proteinG && t.macros.fatG === r.fatG && t.macros.carbsG === r.carbsG;

  return (
    <div className="tr-page">
      <div className="tr-cols">
        <div className="tr-col">
          <Card title="You">
            <div className="tr-form-grid">
              <Field label="Units" span="all">
                <Tabs tabs={[{ id: 'metric', label: 'Metric' }, { id: 'imperial', label: 'Imperial' }]} value={p.units} onChange={(v) => setProfile({ units: v as Units })} />
              </Field>
              <Field label="Sex">
                <Select value={p.sex ?? ''} onChange={(v) => setProfile({ sex: (v || undefined) as Sex | undefined })} placeholder="Choose…" options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
              </Field>
              <Field label="Birth year" hint={age ? `${age} years` : undefined}>
                <NumberInput value={p.birthYear} onChange={(birthYear) => setProfile({ birthYear })} inputMode="numeric" />
              </Field>
              <Field label="Height" hint={p.heightCm ? u.height(p.heightCm) : p.units === 'imperial' ? "e.g. 5'11" : 'cm'}>
                <Input value={heightText ?? (p.heightCm ? (p.units === 'imperial' ? u.height(p.heightCm) : String(p.heightCm)) : '')} onChange={setHeightText} onBlur={commitHeight} onKeyDown={(e) => e.key === 'Enter' && commitHeight()} />
              </Field>
              <Field label="Weight" hint={latestWeight(t) ? `latest weigh-in ${fmt.dateShort(latestWeight(t)!.date)}` : undefined}>
                <WeightInput kg={weightKg} onChange={setWeightKg} u={u} />
              </Field>
              <Field label="Activity" span="all">
                <Select value={p.activity} onChange={(v) => setProfile({ activity: v as ActivityLevel })} options={ACTIVITY_LEVELS.map((a) => ({ value: a.value, label: `${a.label} (× ${a.factor}) — ${a.hint}` }))} />
              </Field>
            </div>
          </Card>
          <Card title="Goal settings">
            <div className="tr-form-grid">
              <Field label="Goal" span="all">
                <Tabs
                  tabs={[
                    { id: 'lose', label: 'Lose fat' },
                    { id: 'maintain', label: 'Maintain' },
                    { id: 'gain', label: 'Build / gain' },
                  ]}
                  value={c.direction}
                  onChange={(v) => setCalc({ direction: v as GoalDirection, adjustKcal: v === 'gain' && c.adjustKcal > 400 ? 250 : v === 'lose' && c.adjustKcal < 200 ? 450 : c.adjustKcal })}
                />
              </Field>
              {c.direction !== 'maintain' && (
                <Field label={c.direction === 'lose' ? 'Deficit' : 'Surplus'} hint={c.direction === 'lose' ? '≈ 500 kcal/day ≈ 0.45 kg (1 lb) a week' : '200–300 kcal/day for lean gains'} span="all">
                  <div className="tr-slider">
                    <input type="range" min={100} max={1000} step={25} value={c.adjustKcal} onChange={(e) => setCalc({ adjustKcal: Number(e.target.value) })} aria-label="Calorie adjustment" />
                    <NumberUnit value={c.adjustKcal} onChange={(v) => setCalc({ adjustKcal: Math.max(0, Math.min(1500, v ?? 0)) })} unit="kcal" size="sm" />
                  </div>
                </Field>
              )}
              <Field label="Protein" hint="1.6–2.2 g per kg is typical when training" span="all">
                <div className="tr-slider">
                  <input type="range" min={1.2} max={3} step={0.1} value={c.proteinPerKg} onChange={(e) => setCalc({ proteinPerKg: Number(e.target.value) })} aria-label="Protein per kg" />
                  <NumberUnit value={c.proteinPerKg} onChange={(v) => setCalc({ proteinPerKg: Math.max(0.8, Math.min(3.5, v ?? 2)) })} unit="g/kg" size="sm" step={0.1} />
                </div>
              </Field>
              <Field label="Fat" hint="20–35% of calories" span="all">
                <div className="tr-slider">
                  <input type="range" min={15} max={45} step={1} value={c.fatPct} onChange={(e) => setCalc({ fatPct: Number(e.target.value) })} aria-label="Fat percent" />
                  <NumberUnit value={c.fatPct} onChange={(v) => setCalc({ fatPct: Math.max(10, Math.min(60, v ?? 27)) })} unit="%" size="sm" />
                </div>
              </Field>
            </div>
          </Card>
        </div>
        <div className="tr-col">
          <Card title="Result" actions={<Calculator size={15} className="muted" />}>
            {!r.ok ? (
              <p className="muted">Fill in {r.missing.join(', ')} to calculate.</p>
            ) : (
              <>
                <div className="tr-stats small-tiles">
                  <StatTile label="BMR" value={`${r.bmr}`} sub="kcal at rest" />
                  <StatTile label="Maintenance (TDEE)" value={`${r.tdee}`} sub="kcal/day" />
                  <StatTile label="Target" value={`${r.calories}`} sub={c.direction === 'maintain' ? 'kcal/day' : `kcal/day (${c.direction === 'lose' ? '−' : '+'}${c.adjustKcal})`} />
                </div>
                <div className="tr-split-bar" role="img" aria-label={`Protein ${Math.round(r.split.protein * 100)}%, carbs ${Math.round(r.split.carbs * 100)}%, fat ${Math.round(r.split.fat * 100)}%`}>
                  <span style={{ width: `${r.split.protein * 100}%`, background: VIZ(0) }} />
                  <span style={{ width: `${r.split.carbs * 100}%`, background: VIZ(1) }} />
                  <span style={{ width: `${r.split.fat * 100}%`, background: VIZ(2) }} />
                </div>
                <div className="tr-macro-cards">
                  {(
                    [
                      ['Protein', r.proteinG, r.split.protein, 0],
                      ['Carbs', r.carbsG, r.split.carbs, 1],
                      ['Fat', r.fatG, r.split.fat, 2],
                    ] as const
                  ).map(([label, g, share, slot]) => (
                    <div key={label} className="tr-macro-card">
                      <i style={{ background: VIZ(slot) }} />
                      <span className="muted small">{label}</span>
                      <b>{g} g</b>
                      <span className="muted tiny">{Math.round(share * 100)}% of kcal</span>
                    </div>
                  ))}
                </div>
                {r.warnings.map((w) => (
                  <p key={w} className="tr-warn">
                    {w}
                  </p>
                ))}
                <details className="tr-formula" open>
                  <summary>
                    <Sigma size={13} /> How it's calculated
                  </summary>
                  <ol>
                    {r.formula.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ol>
                  {weightKg != null && p.units === 'imperial' && <p className="muted tiny">Calculated in metric: {u.weight(weightKg)} = {round(weightKg, 1)} kg; height {round(p.heightCm ?? 0, 1)} cm.</p>}
                </details>
                <Button variant="primary" size="lg" icon={Check} onClick={apply} disabled={sameAsTargets}>
                  {sameAsTargets ? 'These are your targets' : 'Use as my targets'}
                </Button>
              </>
            )}
            <NotMedical />
          </Card>
          <Card title="Current targets" actions={<span className="muted tiny">{t.macros.source === 'calculator' ? `from the calculator${t.macros.updatedAt ? ` · ${fmt.dateShort(t.macros.updatedAt)}` : ''}` : t.macros.source === 'manual' ? 'set by hand' : ''}</span>}>
            <div className="tr-form-grid four">
              <Field label="Calories">
                <NumberUnit value={t.macros.calories} onChange={(v) => setTarget('calories', v)} unit="kcal" />
              </Field>
              <Field label="Protein">
                <NumberUnit value={t.macros.proteinG} onChange={(v) => setTarget('proteinG', v)} unit="g" />
              </Field>
              <Field label="Carbs">
                <NumberUnit value={t.macros.carbsG} onChange={(v) => setTarget('carbsG', v)} unit="g" />
              </Field>
              <Field label="Fat">
                <NumberUnit value={t.macros.fatG} onChange={(v) => setTarget('fatG', v)} unit="g" />
              </Field>
              <Field label="Fibre">
                <NumberUnit value={t.macros.fiberG} onChange={(v) => setTarget('fiberG', v)} unit="g" />
              </Field>
            </div>
            {t.macros.calories != null && t.macros.proteinG != null && t.macros.carbsG != null && t.macros.fatG != null && (
              <p className="tr-note">
                Macros add up to {t.macros.proteinG * 4 + t.macros.carbsG * 4 + t.macros.fatG * 9} kcal{Math.abs(t.macros.proteinG * 4 + t.macros.carbsG * 4 + t.macros.fatG * 9 - t.macros.calories) > 50 ? ` (${t.macros.calories} set — adjust one of them)` : ''}.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
