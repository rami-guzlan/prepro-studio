/* Exercise library: name, muscle group, type (weight × reps, bodyweight, timed,
   cardio), equipment and cues. Used by the program and session logging. */
import { useMemo, useState } from 'react';
import { ChartLine, Library, Plus, Trash2 } from 'lucide-react';
import { Button, Card, confirmDialog, DataTable, EmptyState, Input, SearchInput, Select, Toolbar, type Column } from '@/ui';
import { EXERCISE_KINDS, MUSCLES, type Exercise, type Muscle } from '../../types';
import { makeExercise, updateTraining } from '../../ops';
import { useTraining } from '../../ui';

type Row = Exercise & { uses: number; inProgram: number };

export function ExerciseLibrary({ onProgress }: { onProgress: (id: string) => void }) {
  const t = useTraining();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [name, setName] = useState('');
  const rows = useMemo<Row[]>(() => {
    const s = q.trim().toLowerCase();
    return [...t.exercises]
      .filter((x) => (!muscle || x.muscle === muscle) && (!s || x.name.toLowerCase().includes(s) || (x.equipment ?? '').toLowerCase().includes(s)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => ({
        ...x,
        uses: t.sessions.filter((s2) => s2.sets.some((y) => y.exerciseId === x.id)).length,
        inProgram: t.program.days.filter((d) => d.exercises.some((y) => y.exerciseId === x.id)).length,
      }));
  }, [t, q, muscle]);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    updateTraining((tr) => {
      tr.exercises.push(makeExercise(n));
    });
    setName('');
  };

  const remove = async (r: Row) => {
    const msg = r.uses || r.inProgram ? `It appears in ${r.uses} logged session${r.uses === 1 ? '' : 's'} and ${r.inProgram} program day${r.inProgram === 1 ? '' : 's'}. Logged sets stay (shown as “deleted exercise”); program rows are removed.` : 'Ctrl+Z brings it back.';
    if (!(await confirmDialog({ title: `Delete ${r.name}?`, message: msg, confirmLabel: 'Delete', danger: true }))) return;
    updateTraining((tr) => {
      tr.exercises = tr.exercises.filter((x) => x.id !== r.id);
      for (const d of tr.program.days) d.exercises = d.exercises.filter((x) => x.exerciseId !== r.id);
      for (const g of tr.goals) if (g.exerciseId === r.id) delete g.exerciseId;
    });
  };

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Exercise', type: 'text', minWidth: 180 },
    { key: 'muscle', header: 'Muscle', type: 'select', options: MUSCLES, width: 130 },
    { key: 'kind', header: 'Type', type: 'select', options: EXERCISE_KINDS, width: 190 },
    { key: 'equipment', header: 'Equipment', type: 'combo', suggestions: ['Barbell', 'Dumbbells', 'Cable', 'Machine', 'Kettlebell', 'Bodyweight', 'Bands', 'Smith machine', 'Treadmill', 'Bike', 'Rower'], width: 140 },
    { key: 'notes', header: 'Cues / notes', type: 'text', minWidth: 180 },
    { key: 'uses', header: 'Sessions', type: 'readonly', width: 80, align: 'right' },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search exercises…" />
        <Select size="sm" value={muscle} onChange={setMuscle} placeholder="All muscles" options={MUSCLES} />
        <div className="spacer" />
        <div className="row" style={{ gap: 6 }} onKeyDown={(e) => e.key === 'Enter' && add()}>
          <Input size="sm" value={name} onChange={setName} placeholder="New exercise name" aria-label="New exercise name" />
          <Button size="sm" icon={Plus} onClick={add} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </Toolbar>
      <div className="tr-page">
        {t.exercises.length === 0 ? (
          <EmptyState icon={Library} title="No exercises yet" description="Exercises are created as you build the program or log sessions — or add them here. The muscle group and type are guessed from the name; adjust them anytime." />
        ) : (
          <Card padded={false}>
            <div className="tr-scroll-x">
              <DataTable
                rows={rows}
                columns={columns}
                onChange={(id, patch) =>
                  updateTraining(
                    (tr) => {
                      const x = tr.exercises.find((e) => e.id === id);
                      if (!x) return;
                      for (const [k, v] of Object.entries(patch)) {
                        if (k === 'uses' || k === 'inProgram') continue;
                        if (v === undefined || v === '') {
                          if (k !== 'name') delete (x as any)[k];
                        } else (x as any)[k] = k === 'muscle' ? (v as Muscle) : v;
                      }
                    },
                    { coalesce: `ex:${id}:${Object.keys(patch).join(',')}` },
                  )
                }
                rowActions={(r) => [
                  { label: 'Progress chart', icon: ChartLine, onClick: () => onProgress(r.id), disabled: !r.uses },
                  { separator: true },
                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => remove(r) },
                ]}
                onDelete={(r) => remove(r)}
                emptyText="No exercises match."
              />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
