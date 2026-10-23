/* Strategy — goals, audience personas, content pillars, messaging, tactics
   and notes of a Marketing Space. */
import './strategy.css';
import { useEffect, useState } from 'react';
import { Calculator, Compass, Layers, ListTodo, MessageSquareQuote, NotebookPen, Plus, Target, Users } from 'lucide-react';
import { SharedCalculator } from '@/spaces/calc/SharedCalculator';
import { useSpace } from '@/store/space';
import { readLS, useApp, writeLS } from '@/store/app';
import { Button, ExportMenu, ModuleHeader, UnderlineTabs, type TabDef } from '@/ui';
import { AudienceTab } from './AudienceTab';
import { GoalsTab } from './GoalsTab';
import { MessagingTab, NotesTab } from './MessagingTab';
import { PillarsTab } from './PillarsTab';
import { TacticsTab } from './TacticsTab';
import { addGoal, addPersona, addPillar, exportGoalsCsv, exportTacticsCsv, plural } from './shared';

type Tab = 'goals' | 'audience' | 'pillars' | 'messaging' | 'tactics' | 'notes' | 'calc';
const TAB_IDS: Tab[] = ['goals', 'audience', 'pillars', 'messaging', 'tactics', 'notes', 'calc'];
const LS_KEY = 'prepro.spaceStrategy.tab';

export default function StrategyModule() {
  const goals = useSpace((s) => s.goals) ?? [];
  const personas = useSpace((s) => s.personas) ?? [];
  const pillars = useSpace((s) => s.pillars) ?? [];
  const tactics = useSpace((s) => s.tactics) ?? [];
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  const [tab, setTabState] = useState<Tab>(() => {
    const fromParams = params?.tab as Tab | undefined;
    if (fromParams && TAB_IDS.includes(fromParams)) return fromParams;
    const t = readLS<Tab>(LS_KEY, 'goals');
    return TAB_IDS.includes(t) ? t : 'goals';
  });
  const [focusId, setFocusId] = useState<string | null>(null);
  const setTab = (t: Tab) => {
    setTabState(t);
    setFocusId(null);
    writeLS(LS_KEY, t);
  };

  // deep links: navigateSpace('strategy', { tab: 'pillars' })
  useEffect(() => {
    if (typeof params?.tab === 'string' && TAB_IDS.includes(params.tab as Tab)) setTab(params.tab as Tab);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAdded = (id: string) => setFocusId(id);

  const tabs: TabDef<Tab>[] = [
    { id: 'goals', label: 'Goals', icon: Target, count: goals.length || undefined },
    { id: 'audience', label: 'Audience', icon: Users, count: personas.length || undefined },
    { id: 'pillars', label: 'Pillars', icon: Layers, count: pillars.length || undefined },
    { id: 'messaging', label: 'Messaging', icon: MessageSquareQuote },
    { id: 'tactics', label: 'Tactics', icon: ListTodo, count: tactics.length || undefined },
    { id: 'notes', label: 'Notes', icon: NotebookPen },
    { id: 'calc', label: 'Calculator', icon: Calculator },
  ];

  const onTrack = goals.filter((g) => g.status === 'on_track' || g.status === 'done').length;
  const active = tactics.filter((t) => t.status === 'active').length;
  const subtitle = [
    goals.length ? `${onTrack}/${plural(goals.length, 'goal')} on track` : 'No goals yet',
    personas.length ? plural(personas.length, 'persona') : '',
    pillars.length ? plural(pillars.length, 'pillar') : '',
    tactics.length ? `${active} active tactic${active === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const addAction: Partial<Record<Tab, { label: string; run: () => string }>> = {
    goals: { label: 'Add goal', run: () => addGoal() },
    audience: { label: 'Add persona', run: addPersona },
    pillars: { label: 'Add pillar', run: addPillar },
  };
  const add = addAction[tab];

  return (
    <div className="module">
      <ModuleHeader
        title="Strategy"
        icon={Compass}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu
              docs={[{ id: 'space-strategy', label: 'Strategy brief' }]}
              csv={[
                { label: 'Goals (CSV)', onClick: exportGoalsCsv },
                { label: 'Tactics (CSV)', onClick: exportTacticsCsv },
              ]}
            />
            {add && (
              <Button variant="primary" icon={Plus} onClick={() => onAdded(add.run())}>
                {add.label}
              </Button>
            )}
          </>
        }
      />
      <UnderlineTabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
      <div className="module-body sp-strategy-body">
        {tab === 'goals' && <GoalsTab focusId={focusId} onAdded={onAdded} />}
        {tab === 'audience' && <AudienceTab focusId={focusId} onAdded={onAdded} />}
        {tab === 'pillars' && <PillarsTab focusId={focusId} onAdded={onAdded} />}
        {tab === 'messaging' && <MessagingTab />}
        {tab === 'tactics' && <TacticsTab focusId={focusId} onAdded={onAdded} />}
        {tab === 'notes' && <NotesTab />}
        {tab === 'calc' && (
          <div style={{ padding: 20 }}>
            <SharedCalculator />
          </div>
        )}
      </div>
    </div>
  );
}
