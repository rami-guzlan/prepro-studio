/* Goals: the overall goal with its projection, habit targets with this week's
   actuals, the profile used by the calculator, and specific targets (strength,
   measurements, habits) each with progress and a projection. */
import { useMemo, useState } from 'react';
import { Pencil, Plus, Target, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, confirmDialog, DateInput, EmptyState, ExportMenu, Field, Input, Modal, ModuleHeader, NumberInput, Select, Tabs, Textarea } from '@/ui';
import { Meter, StatTile } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { uid } from '@/lib/id';
import { ACTIVITY_LEVELS, GOAL_KINDS, GOAL_STATUSES, HABITS, MEASUREMENTS, type ActivityLevel, type GoalKind, type GoalTarget, type HabitKey, type OverallGoal, type Sex, type TrainingData, type Units } from '../../types';
import { goalProgress, habitActual, habitTarget, latestMetric, projectionText, round, strengthTrend, weightTrend } from '../../calc';
import { updateTraining } from '../../ops';
import { parseHeight, unitKit, type UnitKit } from '../../units';
import { LengthInput, NumberUnit, useNavParams, useToday, useTraining, useUnits, WeightChart, WeightInput } from '../../ui';

const HABIT_ROWS: { key: HabitKey; label: string; unit: string; field?: keyof OverallGoal; step?: number }[] = [
  { key: 'workouts', label: 'Workouts per week', unit: '/wk', field: 'workoutsPerWeek' },
  { key: 'steps', label: 'Steps per day', unit: 'steps', field: 'stepsPerDay', step: 500 },
  { key: 'sleep', label: 'Sleep per night', unit: 'h', field: 'sleepHours', step: 0.25 },
  { key: 'water', label: 'Water per day', unit: 'L', field: 'waterLiters', step: 0.25 },
  { key: 'protein', label: 'Protein per day', unit: 'g' },
];

function setGoal(patch: Partial<OverallGoal>, coalesce?: string) {
  updateTraining(
    (t) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete (t.goal as any)[k];
        else (t.goal as any)[k] = v;
      }
    },
    coalesce ? { coalesce } : undefined,
  );
}

export default function TrainingGoals() {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const params = useNavParams();
  const [editing, setEditing] = useState<GoalTarget | null>(null);
  const tr = useMemo(() => weightTrend(t), [t]);
  const g = t.goal;
  const active = t.goals.filter((x) => x.status === 'active');

  const newGoal = (kind: GoalKind = 'strength') => setEditing({ id: '', title: '', kind, status: 'active' });

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Goals"
        icon={Target}
        subtitle={g.statement || 'What you are working towards, and when you get there at the current pace'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-train-progress', label: 'Progress report' }]} />
            <Button variant="primary" icon={Plus} onClick={() => newGoal()}>
              Add target
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="tr-page">
          <div className="tr-cols">
            <div className="tr-col">
              <Card title="Overall goal">
                <div className="tr-form-grid">
                  <Field label="Goal" span="all">
                    <Textarea value={g.statement ?? ''} onChange={(v) => setGoal({ statement: v }, 'goal:statement')} rows={2} placeholder="Lose the last 6 kg and deadlift 2× bodyweight by spring." />
                  </Field>
                  <Field label="Why it matters" span="all">
                    <Textarea value={g.why ?? ''} onChange={(v) => setGoal({ why: v }, 'goal:why')} rows={2} placeholder="Energy for long shoot days, feel good on camera, keep up with my kids." />
                  </Field>
                  <Field label="Start date">
                    <DateInput value={g.startDate} onChange={(v) => setGoal({ startDate: v })} />
                  </Field>
                  <Field label="Start weight">
                    <WeightInput kg={g.startWeightKg} onChange={(v) => setGoal({ startWeightKg: v }, 'goal:start')} u={u} placeholder={tr ? u.weightNum(tr.startKg) : undefined} />
                  </Field>
                  <Field label="Target weight">
                    <WeightInput kg={g.targetWeightKg} onChange={(v) => setGoal({ targetWeightKg: v }, 'goal:target')} u={u} />
                  </Field>
                  <Field label="Target date">
                    <DateInput value={g.targetDate} onChange={(v) => setGoal({ targetDate: v })} />
                  </Field>
                  <Field label="Target body fat">
                    <NumberUnit value={g.targetBodyFat} onChange={(v) => setGoal({ targetBodyFat: v }, 'goal:bf')} unit="%" />
                  </Field>
                  <Field label="Planned rate" hint="per week; negative = losing">
                    <NumberUnit value={g.weeklyRateKg == null ? undefined : round(u.fromKg(g.weeklyRateKg)!, 2)} onChange={(v) => setGoal({ weeklyRateKg: u.toKg(v) }, 'goal:rate')} unit={`${u.w}/wk`} step={0.1} />
                  </Field>
                </div>
                {tr?.progress != null && (
                  <div className="tr-goal-progress">
                    <div className="row">
                      <span className="small strong">{Math.round(tr.progress * 100)}% of the way</span>
                      <span className="spacer" />
                      <span className="small muted">
                        {u.weight(tr.startKg)} → {u.weight(tr.trendKg)} → {u.weight(tr.targetKg)}
                      </span>
                    </div>
                    <Meter value={tr.progress} max={1} tone={tr.onTrack === false ? 'warning' : 'good'} label="Progress to target weight" />
                  </div>
                )}
              </Card>

              <Card title="Habit targets">
                <div className="tr-habits">
                  {HABIT_ROWS.map((h) => {
                    const actual = habitActual(t, h.key, today);
                    const target = habitTarget(t, h.key);
                    return (
                      <div key={h.key} className="tr-habit">
                        <span className="tr-habit-label">{h.label}</span>
                        {h.field ? (
                          <NumberUnit value={g[h.field] as number | undefined} onChange={(v) => setGoal({ [h.field!]: v } as Partial<OverallGoal>, `goal:${h.field}`)} unit={h.unit} step={h.step} size="sm" ariaLabel={`${h.label} target`} />
                        ) : (
                          <span className="small tr-habit-target">
                            {target ? `${target} g` : '—'} <span className="muted">(macros)</span>
                          </span>
                        )}
                        <span className="tr-habit-actual small muted">{actual != null ? `7 days: ${round(actual, 1).toLocaleString()}` : '7 days: —'}</span>
                        <Meter value={actual ?? 0} max={target || 1} tone={target && actual != null ? (actual >= target * 0.9 ? 'good' : actual >= target * 0.6 ? undefined : 'warning') : undefined} label={`${h.label}: ${actual ?? 0} of ${target ?? '—'}`} />
                      </div>
                    );
                  })}
                </div>
                <p className="tr-note">Steps, sleep and water come from check-ins (tell your AI “8,200 steps, slept 7 h”); protein from the food log.</p>
              </Card>

              <ProfileCard t={t} />
            </div>

            <div className="tr-col">
              <Card title="Projection">
                <div className="tr-stats small-tiles">
                  <StatTile label="Trend weight" value={tr ? u.weight(tr.trendKg) : '—'} sub={tr ? `${fmt.dateShort(tr.latest.date)}` : undefined} />
                  <StatTile label="Rate" value={tr?.ratePerWeek != null ? `${u.delta(tr.ratePerWeek)}/wk` : '—'} sub="last 4 weeks" />
                  <StatTile label="Needed" value={tr?.neededRate != null ? `${u.delta(tr.neededRate)}/wk` : '—'} sub={g.targetDate ? `to make ${fmt.dateShort(g.targetDate)}` : 'set a target date'} />
                  <StatTile label="Projected" value={tr?.projectedDate ? fmt.dateMedium(tr.projectedDate) : '—'} sub={tr?.onTrack == null ? undefined : tr.onTrack ? 'on track' : 'behind target date'} />
                </div>
                <WeightChart t={t} height={240} />
                <p className="tr-note">
                  {tr?.ratePerWeek != null && tr.ratePerWeek < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />} {projectionText(tr, t.profile.units, fmt.dateMedium)}
                </p>
              </Card>

              <Card
                title={`Targets${active.length ? ` · ${active.length} active` : ''}`}
                actions={
                  <Button size="sm" icon={Plus} onClick={() => newGoal()}>
                    Add
                  </Button>
                }
              >
                {t.goals.length === 0 ? (
                  <EmptyState
                    icon={Target}
                    title="No specific targets yet"
                    description="Add strength targets (a 140 kg deadlift), measurements (waist 84 cm) or habits (8,000 steps a day). Each gets progress and a projection from your logs."
                    action={
                      <div className="row wrap" style={{ gap: 6, justifyContent: 'center' }}>
                        <Button variant="primary" icon={Plus} onClick={() => newGoal('strength')}>
                          Strength target
                        </Button>
                        <Button onClick={() => newGoal('measurement')}>Measurement</Button>
                        <Button onClick={() => newGoal('habit')}>Habit</Button>
                      </div>
                    }
                  />
                ) : (
                  <div className="tr-targets">
                    {[...t.goals]
                      .sort((a, b) => GOAL_STATUSES.findIndex((s) => s.value === a.status) - GOAL_STATUSES.findIndex((s) => s.value === b.status))
                      .map((x) => (
                        <GoalRow key={x.id} t={t} g={x} u={u} today={today} highlight={params.goalId === x.id} onEdit={() => setEditing(x)} fmtDate={fmt.dateMedium} />
                      ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
      {editing && <GoalModal t={t} goal={editing} u={u} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}

function targetText(g: GoalTarget, u: UnitKit): string {
  if (g.target == null) return '';
  switch (g.kind) {
    case 'weight':
    case 'strength':
      return u.weight(g.target);
    case 'measurement':
      return u.length(g.target);
    case 'body_fat':
      return `${g.target}%`;
    case 'habit':
      return `${g.target.toLocaleString()} ${HABITS.find((h) => h.value === g.metric)?.label.toLowerCase() ?? ''}`.trim();
    default:
      return String(g.target);
  }
}

function GoalRow({ t, g, u, today, onEdit, highlight, fmtDate }: { t: TrainingData; g: GoalTarget; u: UnitKit; today: string; onEdit: () => void; highlight?: boolean; fmtDate: (d: string) => string }) {
  const p = goalProgress(t, g, today, fmtDate);
  const status = GOAL_STATUSES.find((s) => s.value === g.status)!;
  const exName = g.exerciseId ? t.exercises.find((e) => e.id === g.exerciseId)?.name : undefined;
  return (
    <div className={`tr-target ${highlight ? 'hl' : ''} ${g.status !== 'active' ? 'dim' : ''}`}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div className="grow">
          <b>{g.title || exName || 'Target'}</b>
          <div className="muted small">
            {GOAL_KINDS.find((k) => k.value === g.kind)?.label}
            {exName && g.title !== exName ? ` · ${exName}` : ''}
            {g.target != null ? ` · ${targetText(g, u)}` : ''}
            {g.targetDate ? ` by ${fmtDate(g.targetDate)}` : ''}
          </div>
        </div>
        <Badge color={status.color}>{status.label}</Badge>
        <Button size="sm" variant="ghost" className="icon" icon={Pencil} aria-label="Edit target" onClick={onEdit} />
      </div>
      {p.progress != null && <Meter value={p.progress} max={1} tone={p.progress >= 1 ? 'good' : undefined} label={`${g.title} progress`} />}
      {p.text && <div className="small text-2">{p.text}</div>}
      {g.targetDate && p.projected && p.projected > g.targetDate && g.status === 'active' && <div className="small" style={{ color: 'var(--warning)' }}>Projected after the target date — adjust the plan or the date.</div>}
      {g.notes && <div className="small muted">{g.notes}</div>}
    </div>
  );
}

function GoalModal({ t, goal, u, today, onClose }: { t: TrainingData; goal: GoalTarget; u: UnitKit; today: string; onClose: () => void }) {
  const [g, setG] = useState<GoalTarget>(goal);
  const isNew = !goal.id;
  const set = (patch: Partial<GoalTarget>) => setG((x) => ({ ...x, ...patch }));
  const currentFor = (x: GoalTarget): number | undefined => {
    if (x.kind === 'weight') return weightTrend(t)?.trendKg;
    if (x.kind === 'body_fat') return latestMetric(t, 'bodyFat')?.value;
    if (x.kind === 'measurement') return latestMetric(t, (x.metric ?? 'waistCm') as any)?.value;
    if (x.kind === 'strength' && x.exerciseId) return strengthTrend(t, x.exerciseId, today).current;
    if (x.kind === 'habit') return habitActual(t, (x.metric ?? 'workouts') as HabitKey, today);
    return undefined;
  };
  const save = () => {
    const ex = g.exerciseId ? t.exercises.find((e) => e.id === g.exerciseId) : undefined;
    const title = g.title.trim() || (g.kind === 'strength' && ex ? `${ex.name} ${g.target != null ? u.weight(g.target, 0) : ''}`.trim() : g.kind === 'measurement' ? `${MEASUREMENTS.find((m) => m.key === g.metric)?.label ?? 'Waist'} ${g.target != null ? u.length(g.target, 0) : ''}`.trim() : GOAL_KINDS.find((k) => k.value === g.kind)?.label ?? 'Target');
    const start = g.start ?? (isNew ? currentFor(g) : undefined);
    const row: GoalTarget = { ...g, id: g.id || uid('tgoal'), title, start: start == null ? undefined : round(start, 2) };
    for (const k of Object.keys(row) as (keyof GoalTarget)[]) if (row[k] === undefined || row[k] === '') delete row[k];
    updateTraining((tr) => {
      const i = tr.goals.findIndex((x) => x.id === row.id);
      if (i >= 0) tr.goals[i] = row;
      else tr.goals.push(row);
    });
    onClose();
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this target?', message: g.title, confirmLabel: 'Delete', danger: true }))) return;
    updateTraining((tr) => {
      tr.goals = tr.goals.filter((x) => x.id !== g.id);
    });
    onClose();
  };
  const valueInput = (value: number | undefined, onChange: (v: number | undefined) => void) =>
    g.kind === 'weight' || g.kind === 'strength' ? (
      <WeightInput kg={value} onChange={onChange} u={u} />
    ) : g.kind === 'measurement' ? (
      <LengthInput cm={value} onChange={onChange} u={u} />
    ) : (
      <NumberUnit value={value} onChange={onChange} unit={g.kind === 'body_fat' ? '%' : g.kind === 'habit' ? HABIT_ROWS.find((h) => h.key === g.metric)?.unit ?? '' : ''} />
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New target' : 'Edit target'}
      size="md"
      footer={
        <>
          {!isNew && (
            <Button variant="danger" icon={Trash2} onClick={remove}>
              Delete
            </Button>
          )}
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {isNew ? 'Add target' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="tr-form-grid" onKeyDown={(e) => e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && save()}>
        <Field label="Kind">
          <Select value={g.kind} onChange={(v) => set({ kind: v as GoalKind, metric: v === 'measurement' ? 'waistCm' : v === 'habit' ? 'workouts' : undefined, start: undefined })} options={GOAL_KINDS} />
        </Field>
        <Field label="Status">
          <Select value={g.status} onChange={(v) => set({ status: v as GoalTarget['status'] })} options={GOAL_STATUSES} />
        </Field>
        {g.kind === 'strength' && (
          <Field label="Exercise" span="all">
            <Select value={g.exerciseId ?? ''} onChange={(v) => set({ exerciseId: v || undefined, start: undefined })} placeholder={t.exercises.length ? 'Choose…' : 'Add exercises in Workouts first'} options={[...t.exercises].sort((a, b) => a.name.localeCompare(b.name)).map((e) => ({ value: e.id, label: e.name }))} />
          </Field>
        )}
        {g.kind === 'measurement' && (
          <Field label="Measurement" span="all">
            <Select value={g.metric ?? 'waistCm'} onChange={(v) => set({ metric: v, start: undefined })} options={MEASUREMENTS.map((m) => ({ value: m.key, label: m.label }))} />
          </Field>
        )}
        {g.kind === 'habit' && (
          <Field label="Habit" span="all">
            <Select value={g.metric ?? 'workouts'} onChange={(v) => set({ metric: v })} options={HABITS.map((h) => ({ value: h.value, label: h.label }))} />
          </Field>
        )}
        <Field label="Title" span="all" hint="optional — generated from the target when empty">
          <Input value={g.title} onChange={(title) => set({ title })} placeholder={g.kind === 'strength' ? 'Deadlift 140 kg' : 'Waist under 84 cm'} autoFocus />
        </Field>
        <Field label={g.kind === 'strength' ? 'Target 1RM' : 'Target'}>{valueInput(g.target, (target) => set({ target }))}</Field>
        <Field label="By">
          <DateInput value={g.targetDate} onChange={(targetDate) => set({ targetDate })} />
        </Field>
        {g.kind !== 'habit' && g.kind !== 'other' && <Field label="Starting value" hint={isNew ? 'defaults to your current value' : undefined}>{valueInput(g.start, (start) => set({ start }))}</Field>}
        <Field label="Notes" span="all">
          <Textarea value={g.notes ?? ''} onChange={(notes) => set({ notes })} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

function ProfileCard({ t }: { t: TrainingData }) {
  const p = t.profile;
  const u = unitKit(p.units);
  const [height, setHeight] = useState<string | null>(null);
  const setP = (patch: Partial<TrainingData['profile']>, coalesce?: string) =>
    updateTraining(
      (tr) => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') delete (tr.profile as any)[k];
          else (tr.profile as any)[k] = v;
        }
      },
      coalesce ? { coalesce } : undefined,
    );
  const commitHeight = () => {
    if (height == null) return;
    const cm = parseHeight(height, p.units);
    if (cm != null || !height.trim()) setP({ heightCm: cm });
    setHeight(null);
  };
  return (
    <Card title="Profile">
      <div className="tr-form-grid">
        <Field label="Units" span="all">
          <Tabs tabs={[{ id: 'metric', label: 'Metric (kg, cm)' }, { id: 'imperial', label: 'Imperial (lb, in)' }]} value={p.units} onChange={(v) => setP({ units: v as Units })} />
        </Field>
        <Field label="Name">
          <Input value={p.name ?? ''} onChange={(name) => setP({ name }, 'profile:name')} placeholder="optional" />
        </Field>
        <Field label="Sex">
          <Select value={p.sex ?? ''} onChange={(v) => setP({ sex: (v || undefined) as Sex | undefined })} placeholder="—" options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
        </Field>
        <Field label="Birth year">
          <NumberInput value={p.birthYear} onChange={(birthYear) => setP({ birthYear }, 'profile:birth')} inputMode="numeric" />
        </Field>
        <Field label="Height" hint={p.units === 'imperial' ? "e.g. 5'11" : 'cm'}>
          <Input value={height ?? (p.heightCm ? (p.units === 'imperial' ? u.height(p.heightCm) : String(p.heightCm)) : '')} onChange={setHeight} onBlur={commitHeight} onKeyDown={(e) => e.key === 'Enter' && commitHeight()} />
        </Field>
        <Field label="Activity" span="all">
          <Select value={p.activity} onChange={(v) => setP({ activity: v as ActivityLevel })} options={ACTIVITY_LEVELS.map((a) => ({ value: a.value, label: `${a.label} — ${a.hint}` }))} />
        </Field>
      </div>
    </Card>
  );
}
