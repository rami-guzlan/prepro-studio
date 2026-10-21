/* Program editor: named training days (with planned weekdays) → exercises with
   sets × reps, target weight, RPE and rest. Drag rows to reorder. */
import { ArrowDown, ArrowUp, ClipboardList, Copy, MoreHorizontal, Play, Plus, Trash2 } from 'lucide-react';
import { Button, Card, confirmDialog, DataTable, DateInput, EmptyState, Field, IconButton, Input, Menu, promptDialog, Textarea, type Column, type MenuItem } from '@/ui';
import { uid } from '@/lib/id';
import { weekdaysOf, type ProgramDay, type ProgramExercise, type TrainingData } from '../../types';
import { ensureExercise, makeProgramDay, makeProgramExercise, startSession, updateTraining } from '../../ops';
import { useMondayFirst, useToday, useTraining, useUnits, WeekdayPicker, WeightInput } from '../../ui';
import { WEEKDAYS_LONG } from '@/lib/dates';

const TEMPLATES: { label: string; days: { name: string; focus: string; weekdays: number[]; ex: [string, number, string][] }[] }[] = [
  {
    label: 'Upper / lower (4 days)',
    days: [
      { name: 'Upper A', focus: 'Strength', weekdays: [1], ex: [['Bench press', 4, '5'], ['Barbell row', 4, '6'], ['Overhead press', 3, '8'], ['Pull-up', 3, '8'], ['Triceps pushdown', 2, '12']] },
      { name: 'Lower A', focus: 'Strength', weekdays: [2], ex: [['Back squat', 4, '5'], ['Romanian deadlift', 3, '8'], ['Leg press', 3, '10'], ['Standing calf raise', 3, '12'], ['Plank', 3, '45s']] },
      { name: 'Upper B', focus: 'Hypertrophy', weekdays: [4], ex: [['Incline dumbbell press', 3, '8-10'], ['Lat pulldown', 3, '10-12'], ['Seated cable row', 3, '10-12'], ['Lateral raise', 3, '15'], ['Dumbbell curl', 3, '12']] },
      { name: 'Lower B', focus: 'Hypertrophy', weekdays: [5], ex: [['Deadlift', 3, '5'], ['Bulgarian split squat', 3, '10'], ['Hip thrust', 3, '10'], ['Leg curl', 3, '12'], ['Hanging leg raise', 3, '12']] },
    ],
  },
  {
    label: 'Full body (3 days)',
    days: [
      { name: 'Full body A', focus: 'Squat focus', weekdays: [1], ex: [['Back squat', 3, '5'], ['Bench press', 3, '8'], ['Barbell row', 3, '8'], ['Plank', 3, '45s']] },
      { name: 'Full body B', focus: 'Hinge focus', weekdays: [3], ex: [['Deadlift', 3, '5'], ['Overhead press', 3, '8'], ['Pull-up', 3, '8'], ['Walking lunge', 2, '12']] },
      { name: 'Full body C', focus: 'Volume', weekdays: [5], ex: [['Front squat', 3, '8'], ['Incline dumbbell press', 3, '10'], ['Lat pulldown', 3, '12'], ['Hip thrust', 3, '10']] },
    ],
  },
  {
    label: 'Push / pull / legs (3 days)',
    days: [
      { name: 'Push', focus: 'Chest, shoulders, triceps', weekdays: [1], ex: [['Bench press', 4, '6-8'], ['Overhead press', 3, '8'], ['Incline dumbbell press', 3, '10'], ['Lateral raise', 3, '15'], ['Triceps pushdown', 3, '12']] },
      { name: 'Pull', focus: 'Back, biceps', weekdays: [3], ex: [['Deadlift', 3, '5'], ['Pull-up', 3, '8'], ['Seated cable row', 3, '10'], ['Face pull', 3, '15'], ['Dumbbell curl', 3, '12']] },
      { name: 'Legs', focus: 'Quads, hamstrings, glutes', weekdays: [5], ex: [['Back squat', 4, '6-8'], ['Romanian deadlift', 3, '8'], ['Leg press', 3, '12'], ['Leg curl', 3, '12'], ['Standing calf raise', 4, '12']] },
    ],
  },
];

function patchDay(id: string, patch: Partial<ProgramDay>, coalesce?: string) {
  updateTraining(
    (t) => {
      const d = t.program.days.find((x) => x.id === id);
      if (!d) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete (d as any)[k];
        else (d as any)[k] = v;
      }
    },
    coalesce ? { coalesce } : undefined,
  );
}

function applyTemplate(t: TrainingData, tpl: (typeof TEMPLATES)[number]) {
  for (const d of tpl.days) {
    const day = makeProgramDay({ name: d.name, focus: d.focus, weekdays: d.weekdays });
    day.exercises = d.ex.map(([name, sets, reps]) => makeProgramExercise({ exerciseId: ensureExercise(t, name).id, sets, reps, restSec: sets >= 4 ? 150 : 90 }));
    t.program.days.push(day);
  }
  if (!t.program.name) t.program.name = tpl.label.replace(/ \(.*\)/, '');
}

export function ProgramEditor({ onStarted }: { onStarted: (sessionId: string) => void }) {
  const t = useTraining();
  const today = useToday();
  const mondayFirst = useMondayFirst();
  const p = t.program;

  const setProgram = (patch: Partial<typeof p>, coalesce?: string) =>
    updateTraining(
      (tr) => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') delete (tr.program as any)[k];
          else (tr.program as any)[k] = v;
        }
      },
      coalesce ? { coalesce } : undefined,
    );

  const addDay = () =>
    updateTraining((tr) => {
      tr.program.days.push(makeProgramDay({ name: `Day ${String.fromCharCode(65 + tr.program.days.length)}` }));
    });

  const weekPlan = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ w, days: p.days.filter((d) => weekdaysOf(d.weekdays).includes(w)) }));
  const ordered = mondayFirst ? [...weekPlan.slice(1), weekPlan[0]] : weekPlan;

  return (
    <div className="tr-page">
      <Card title="Program">
        <div className="tr-form-grid">
          <Field label="Name">
            <Input value={p.name ?? ''} onChange={(name) => setProgram({ name }, 'prog:name')} placeholder="Upper / lower — cut phase" />
          </Field>
          <Field label="Started">
            <DateInput value={p.startDate} onChange={(startDate) => setProgram({ startDate })} />
          </Field>
          <Field label="Notes" span={2}>
            <Textarea value={p.notes ?? ''} onChange={(notes) => setProgram({ notes }, 'prog:notes')} rows={1} placeholder="Add 2.5 kg when all sets hit the top of the rep range. Deload every 6th week." />
          </Field>
        </div>
        {p.days.some((d) => weekdaysOf(d.weekdays).length > 0) && (
          <div className="tr-week-strip">
            {ordered.map(({ w, days }) => (
              <div key={w} className={days.length ? 'on' : ''}>
                <span className="muted tiny">{WEEKDAYS_LONG[w].slice(0, 3)}</span>
                <b className="small">{days.map((d) => d.name).join(', ') || 'Rest'}</b>
              </div>
            ))}
          </div>
        )}
      </Card>

      {p.days.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Build your training days"
          description="Start from a template or add days one by one. Each day lists exercises with sets × reps and a target weight; logging a session pre-fills from here (or from last time)."
          action={
            <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
              {TEMPLATES.map((tpl) => (
                <Button key={tpl.label} onClick={() => updateTraining((tr) => applyTemplate(tr, tpl))}>
                  {tpl.label}
                </Button>
              ))}
              <Button variant="primary" icon={Plus} onClick={addDay}>
                Empty day
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {p.days.map((d, i) => (
            <DayEditor
              key={d.id}
              t={t}
              d={d}
              first={i === 0}
              last={i === p.days.length - 1}
              mondayFirst={mondayFirst}
              onStart={() => {
                let id = '';
                updateTraining((tr) => {
                  id = startSession(tr, today, d.id);
                });
                onStarted(id);
              }}
            />
          ))}
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button icon={Plus} onClick={addDay}>
              Add day
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DayEditor({ t, d, first, last, mondayFirst, onStart }: { t: TrainingData; d: ProgramDay; first: boolean; last: boolean; mondayFirst: boolean; onStart: () => void }) {
  const u = useUnits();
  const exName = (id?: string) => (id ? t.exercises.find((x) => x.id === id)?.name : undefined) ?? '(choose)';

  const patchEx = (exId: string, patch: Partial<ProgramExercise>) =>
    updateTraining(
      (tr) => {
        const x = tr.program.days.find((y) => y.id === d.id)?.exercises.find((y) => y.id === exId);
        if (!x) return;
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') delete (x as any)[k];
          else (x as any)[k] = v;
        }
      },
      { coalesce: `pex:${exId}:${Object.keys(patch).join(',')}` },
    );

  const addExercise = (exerciseId: string) =>
    updateTraining((tr) => {
      tr.program.days.find((y) => y.id === d.id)?.exercises.push(makeProgramExercise({ exerciseId, restSec: 90 }));
    });

  const pickItems = (onPick: (id: string) => void): MenuItem[] => [
    {
      label: 'New exercise…',
      icon: Plus,
      onClick: async () => {
        const name = await promptDialog({ title: 'New exercise', placeholder: 'Cable fly' });
        if (!name?.trim()) return;
        let id = '';
        updateTraining((tr) => {
          id = ensureExercise(tr, name.trim()).id;
        });
        onPick(id);
      },
    },
    ...(t.exercises.length ? [{ separator: true } as MenuItem] : []),
    ...[...t.exercises].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ label: x.name, onClick: () => onPick(x.id) })),
  ];

  const move = (dir: -1 | 1) =>
    updateTraining((tr) => {
      const i = tr.program.days.findIndex((x) => x.id === d.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= tr.program.days.length) return;
      const [x] = tr.program.days.splice(i, 1);
      tr.program.days.splice(j, 0, x);
    });

  const duplicate = () =>
    updateTraining((tr) => {
      const i = tr.program.days.findIndex((x) => x.id === d.id);
      const copy: ProgramDay = { ...JSON.parse(JSON.stringify(d)), id: uid('pday'), name: `${d.name} (copy)`, weekdays: [] };
      copy.exercises = copy.exercises.map((x) => ({ ...x, id: uid('pex') }));
      tr.program.days.splice(i + 1, 0, copy);
    });

  const remove = async () => {
    const used = t.sessions.filter((s) => s.dayId === d.id).length;
    if (!(await confirmDialog({ title: `Delete ${d.name}?`, message: used ? `${used} logged session${used === 1 ? ' keeps' : 's keep'} its sets; they just won't be linked to this day any more.` : 'Ctrl+Z brings it back.', confirmLabel: 'Delete day', danger: true }))) return;
    updateTraining((tr) => {
      tr.program.days = tr.program.days.filter((x) => x.id !== d.id);
      for (const s of tr.sessions) if (s.dayId === d.id) delete s.dayId;
    });
  };

  const columns: Column<ProgramExercise>[] = [
    {
      key: 'exerciseId',
      header: 'Exercise',
      minWidth: 170,
      render: (r) => (
        <Menu
          trigger={
            <button type="button" className="tr-cell-btn ellipsis">
              {exName(r.exerciseId)}
            </button>
          }
          items={() => pickItems((id) => patchEx(r.id, { exerciseId: id }))}
        />
      ),
      sortValue: (r) => exName(r.exerciseId),
    },
    { key: 'sets', header: 'Sets', type: 'number', width: 64, align: 'right' },
    { key: 'reps', header: 'Reps', type: 'text', width: 76, placeholder: '8-10' },
    { key: 'targetKg', header: `Target ${u.w}`, width: 110, render: (r) => <WeightInput kg={r.targetKg} onChange={(targetKg) => patchEx(r.id, { targetKg })} u={u} size="sm" ariaLabel="Target weight" /> },
    { key: 'rpe', header: 'RPE', type: 'number', width: 60, align: 'right' },
    { key: 'restSec', header: 'Rest s', type: 'number', width: 70, align: 'right' },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 140 },
  ];

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          {d.name}
          {d.focus && <span className="muted small" style={{ fontWeight: 400 }}>{d.focus}</span>}
        </span>
      }
      actions={
        <>
          <Button size="sm" variant="primary" icon={Play} onClick={onStart} disabled={!d.exercises.length}>
            Start
          </Button>
          <Menu
            align="end"
            trigger={<IconButton icon={MoreHorizontal} label={`${d.name} actions`} size="sm" />}
            items={[
              { label: 'Move up', icon: ArrowUp, onClick: () => move(-1), disabled: first },
              { label: 'Move down', icon: ArrowDown, onClick: () => move(1), disabled: last },
              { label: 'Duplicate', icon: Copy, onClick: duplicate },
              { separator: true },
              { label: 'Delete day', icon: Trash2, danger: true, onClick: remove },
            ]}
          />
        </>
      }
      padded={false}
    >
      <>
          <div className="tr-day-fields">
            <Field label="Name">
              <Input value={d.name} onChange={(name) => patchDay(d.id, { name }, `pday:${d.id}:name`)} size="sm" />
            </Field>
            <Field label="Focus">
              <Input value={d.focus ?? ''} onChange={(focus) => patchDay(d.id, { focus }, `pday:${d.id}:focus`)} size="sm" placeholder="Strength · upper body" />
            </Field>
            <Field label="Planned on">
              <WeekdayPicker value={weekdaysOf(d.weekdays)} onChange={(weekdays) => patchDay(d.id, { weekdays })} mondayFirst={mondayFirst} />
            </Field>
          </div>
          <div className="tr-scroll-x">
            <DataTable
              rows={d.exercises}
              columns={columns}
              onChange={(id, patch) => patchEx(id, { ...patch, ...(patch.sets != null ? { sets: Math.max(1, Math.round(Number(patch.sets) || 1)) } : {}) })}
              onReorder={(id, beforeId) =>
                updateTraining((tr) => {
                  const list = tr.program.days.find((y) => y.id === d.id)?.exercises;
                  if (!list) return;
                  const i = list.findIndex((x) => x.id === id);
                  if (i < 0) return;
                  const [x] = list.splice(i, 1);
                  const j = beforeId ? list.findIndex((y) => y.id === beforeId) : -1;
                  list.splice(j < 0 ? list.length : j, 0, x);
                })
              }
              rowActions={(r) => [
                {
                  label: 'Remove',
                  icon: Trash2,
                  danger: true,
                  onClick: () =>
                    updateTraining((tr) => {
                      const day = tr.program.days.find((y) => y.id === d.id);
                      if (day) day.exercises = day.exercises.filter((x) => x.id !== r.id);
                    }),
                },
              ]}
              emptyText="No exercises yet."
            />
          </div>
          <div className="tr-day-foot">
            <Menu
              trigger={
                <Button size="sm" icon={Plus}>
                  Add exercise
                </Button>
              }
              items={() => pickItems(addExercise)}
            />
            <Input value={d.notes ?? ''} onChange={(notes) => patchDay(d.id, { notes }, `pday:${d.id}:notes`)} size="sm" placeholder="Day notes (warm-up, superset A1/A2 …)" className="grow" />
          </div>
      </>
    </Card>
  );
}
