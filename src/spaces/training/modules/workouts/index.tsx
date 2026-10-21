/* Workouts: log a session (pre-filled from the program, big phone-friendly set
   entry), edit the program, browse history, see per-exercise progress (top set,
   estimated 1RM, volume) and PRs, and manage the exercise library. */
import { useEffect, useState } from 'react';
import { ChartLine, ClipboardList, Dumbbell, History as HistoryIcon, Library, Play } from 'lucide-react';
import { ExportMenu, ModuleHeader, UnderlineTabs } from '@/ui';
import { readLS, writeLS } from '@/store/app';
import { useNavParams, useTraining } from '../../ui';
import { findExercise } from '../../ops';
import { sessionDone } from '../../calc';
import { SessionLog } from './Log';
import { ProgramEditor } from './Program';
import { SessionHistory } from './History';
import { ExerciseProgress } from './Progress';
import { ExerciseLibrary } from './Exercises';

type Tab = 'log' | 'program' | 'history' | 'progress' | 'exercises';
const TABS: Tab[] = ['log', 'program', 'history', 'progress', 'exercises'];
const LS = 'prepro.training.workoutsTab';

export default function TrainingWorkouts() {
  const t = useTraining();
  const params = useNavParams();
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(params.tab) ? params.tab : params.sessionId ? 'log' : readLS<Tab>(LS, t.program.days.length ? 'log' : 'program')));
  const [sessionId, setSessionId] = useState<string | undefined>(params.sessionId);
  const [exerciseId, setExerciseId] = useState<string | undefined>(() => (params.exercise ? findExercise(t, String(params.exercise))?.id : undefined));
  const setTab = (x: Tab) => {
    setTabState(x);
    writeLS(LS, x);
  };

  useEffect(() => {
    if (TABS.includes(params.tab)) setTabState(params.tab);
    else if (params.sessionId) setTabState('log');
    if (params.sessionId) setSessionId(params.sessionId);
    if (params.exercise) {
      const ex = findExercise(t, String(params.exercise));
      if (ex) {
        setExerciseId(ex.id);
        if (!params.tab) setTabState('progress');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const done = t.sessions.filter(sessionDone).length;
  const openSession = (id: string) => {
    setSessionId(id);
    setTab('log');
  };
  const showProgress = (id: string) => {
    setExerciseId(id);
    setTab('progress');
  };

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Workouts"
        icon={Dumbbell}
        subtitle={t.program.name ? `${t.program.name} · ${t.program.days.length} day${t.program.days.length === 1 ? '' : 's'} · ${done} session${done === 1 ? '' : 's'} logged` : `${done} session${done === 1 ? '' : 's'} logged`}
        actions={<ExportMenu docs={[{ id: 'space-train-program', label: 'Workout program' }, { id: 'space-train-progress', label: 'Progress report' }]} />}
      />
      <UnderlineTabs
        tabs={[
          { id: 'log', label: 'Log', icon: Play },
          { id: 'program', label: 'Program', icon: ClipboardList },
          { id: 'history', label: 'History', icon: HistoryIcon, count: done },
          { id: 'progress', label: 'Progress', icon: ChartLine },
          { id: 'exercises', label: 'Exercises', icon: Library, count: t.exercises.length },
        ]}
        value={tab}
        onChange={(x) => setTab(x as Tab)}
      />
      <div className="module-body">
        {tab === 'log' && <SessionLog sessionId={sessionId} setSessionId={setSessionId} onProgress={showProgress} onProgram={() => setTab('program')} />}
        {tab === 'program' && <ProgramEditor onStarted={openSession} />}
        {tab === 'history' && <SessionHistory onOpen={openSession} />}
        {tab === 'progress' && <ExerciseProgress exerciseId={exerciseId} setExerciseId={setExerciseId} onOpenSession={openSession} />}
        {tab === 'exercises' && <ExerciseLibrary onProgress={showProgress} />}
      </div>
    </div>
  );
}
