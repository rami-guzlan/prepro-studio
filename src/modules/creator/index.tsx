/* Creator Workspace: a lightweight home for YouTube / social videos. Today
   (where it stands, what to do next, a focus sprint), then one tab per stage:
   Idea, Plan, Shoot (with a full-screen shoot mode), Edit and Publish.
   Data: project.creator (src/types.ts), logic in ./model, edits in ./ops. */
import './creator.css';
import { useEffect, useState } from 'react';
import { Clapperboard, Lightbulb, ListChecks, Rocket, Scissors, Smartphone, Sun, MonitorPlay } from 'lucide-react';
import type { CreatorData } from '@/types';
import { useApp, readLS, writeLS } from '@/store/app';
import { useProject } from '@/store/project';
import { Button, ModuleHeader, Select, UnderlineTabs, type TabDef } from '@/ui';
import { STAGES, nextAction, normalizeCreator, stageInfo, stageProgress, type CreatorTab } from './model';
import { editCreator, leaveCreatorWorkflow, startCreatorWorkflow } from './ops';
import { NextStageBar } from './shared';
import { TodayTab } from './Today';
import { IdeaTab } from './Idea';
import { PlanTab } from './Plan';
import { ShootMode, ShootTab } from './Shoot';
import { EditTab } from './Edit';
import { PublishTab } from './Publish';

const TAB_STAGE: Partial<Record<CreatorTab, CreatorData['stage']>> = { idea: 'idea', plan: 'plan', shoot: 'shoot', edit: 'edit', publish: 'publish' };

function Intro() {
  return (
    <div className="module-body">
      <div className="cr-intro">
        <MonitorPlay size={30} />
        <h2>A lighter workspace for YouTube and social videos</h2>
        <p className="muted">
          Write the idea, plan the shoot in minutes, shoot with a teleprompter and checklists, then edit and publish, with one clear next step at every point. Nothing in this production is
          removed: every film tool stays under “All production tools”.
        </p>
        <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
          <Button variant="primary" icon={MonitorPlay} onClick={() => startCreatorWorkflow('long')}>
            Use it for a YouTube video
          </Button>
          <Button icon={Smartphone} onClick={() => startCreatorWorkflow('short')}>
            Use it for a short / reel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CreatorModule() {
  const workflow = useProject((p) => p.meta.workflow);
  const raw = useProject((p) => p.creator);
  const projectId = useProject((p) => p.id);
  const params = useApp((s) => s.params) as { tab?: CreatorTab; anchor?: string } | undefined;
  const navKey = useApp((s) => s.navKey);
  const key = `prepro.creator.tab.${projectId}`;
  const [tab, setTabState] = useState<CreatorTab>(() => readLS<CreatorTab>(key, 'today'));
  const [shootMode, setShootMode] = useState(false);
  const setTab = (t: CreatorTab) => {
    setTabState(t);
    writeLS(key, t);
  };
  const go = (t: CreatorTab, anchor?: string) => {
    setTab(t);
    if (anchor)
      setTimeout(() => {
        const el = document.getElementById(anchor);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true });
      }, 60);
  };
  // links from agents / other screens: { tab, anchor }
  useEffect(() => {
    if (params?.tab) go(params.tab, params.anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  if (workflow !== 'creator') {
    return (
      <div className="module">
        <ModuleHeader title="Creator Workspace" icon={MonitorPlay} subtitle="For YouTube and social videos" />
        <Intro />
      </div>
    );
  }

  const c = normalizeCreator(raw ? structuredClone(raw) : undefined);
  const prog = stageProgress(c);
  const ready = !nextAction(c).step;
  const stageOfTab = TAB_STAGE[tab];
  const tabs: TabDef<CreatorTab>[] = [
    { id: 'today', label: 'Today', icon: Sun },
    { id: 'idea', label: <>Idea <span className="cr-tabprog">{prog.idea.done}/{prog.idea.total}</span></>, icon: Lightbulb },
    { id: 'plan', label: <>Plan <span className="cr-tabprog">{prog.plan.done}/{prog.plan.total}</span></>, icon: ListChecks },
    { id: 'shoot', label: <>Shoot <span className="cr-tabprog">{prog.shoot.done}/{prog.shoot.total}</span></>, icon: Clapperboard },
    { id: 'edit', label: <>Edit <span className="cr-tabprog">{prog.edit.done}/{prog.edit.total}</span></>, icon: Scissors },
    { id: 'publish', label: <>Publish <span className="cr-tabprog">{prog.publish.done}/{prog.publish.total}</span></>, icon: Rocket },
  ];

  return (
    <div className="module cr">
      <ModuleHeader
        title="Creator Workspace"
        icon={MonitorPlay}
        subtitle={`${c.format === 'short' ? 'Short / reel' : 'YouTube video'} · ${stageInfo(c.stage).label}`}
        actions={
          <>
            <Select
              size="sm"
              style={{ width: 'auto' }}
              value={c.format}
              options={[
                { value: 'long', label: 'Long-form video' },
                { value: 'short', label: 'Short / reel' },
              ]}
              onChange={(v) => editCreator((x) => void (x.format = v as 'long' | 'short'))}
              aria-label="Format"
            />
            <Select
              size="sm"
              style={{ width: 'auto' }}
              value={c.stage}
              options={STAGES.map((s) => ({ value: s.value, label: `Stage: ${s.label}` }))}
              onChange={(v) => editCreator((x, d) => {
                x.stage = v as CreatorData['stage'];
                d.meta.status = ({ idea: 'development', plan: 'pre', shoot: 'production', edit: 'post', publish: 'post', done: 'delivered' } as const)[x.stage];
              })}
              aria-label="Stage"
            />
            <Button variant="primary" icon={Clapperboard} onClick={() => setShootMode(true)}>
              Shoot mode
            </Button>
          </>
        }
      />
      <UnderlineTabs<CreatorTab> tabs={tabs} value={tab} onChange={setTab} />
      <div className="module-body cr-body">
        {tab === 'today' && <TodayTab c={c} onGo={go} onShoot={() => setShootMode(true)} />}
        {tab === 'idea' && <IdeaTab c={c} />}
        {tab === 'plan' && <PlanTab c={c} />}
        {tab === 'shoot' && <ShootTab c={c} onShootMode={() => setShootMode(true)} />}
        {tab === 'edit' && <EditTab c={c} />}
        {tab === 'publish' && <PublishTab c={c} />}
        {stageOfTab && <NextStageBar stage={stageOfTab} current={c.stage} ready={ready} />}
        {tab === 'today' && (
          <p className="cr-foot muted small">
            Need the full film toolkit (storyboard, lighting, schedule, budget)? It’s all under “All production tools” in the sidebar.{' '}
            <button type="button" className="cr-linkbtn" onClick={() => leaveCreatorWorkflow()}>
              Switch this production back to the film layout
            </button>
          </p>
        )}
      </div>
      {shootMode && <ShootMode c={c} onClose={() => setShootMode(false)} />}
    </div>
  );
}
