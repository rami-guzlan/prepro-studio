/* Post-Production: schedule (Gantt), deliverables, graphics & titles, music cue
   sheet, VFX, ADR, edit notes and the media-management workflow. */
import './post.css';
import { useEffect, useState } from 'react';
import { CalendarClock, MessageSquareText, Mic, Music2, PackageCheck, Scissors, Sparkles, Type, Workflow } from 'lucide-react';
import { getProject, useFormatters, useProject } from '@/store/project';
import { readLS, useApp, writeLS } from '@/store/app';
import { getScriptModel } from '@/derived/script';
import { ExportMenu, ModuleHeader, UnderlineTabs, type TabDef } from '@/ui';
import { ScheduleTab } from './ScheduleTab';
import { DeliverablesTab } from './DeliverablesTab';
import { GraphicsTab } from './GraphicsTab';
import { MusicTab } from './MusicTab';
import { VfxTab } from './VfxTab';
import { AdrTab } from './AdrTab';
import { EditNotesTab } from './EditNotesTab';
import { WorkflowTab } from './WorkflowTab';
import { csvAdr, csvDeliverables, csvEditNotes, csvGraphics, csvMusic, csvSchedule, csvVfx } from './shared';

type Tab = 'schedule' | 'deliverables' | 'graphics' | 'music' | 'vfx' | 'adr' | 'notes' | 'workflow';
const TAB_IDS: Tab[] = ['schedule', 'deliverables', 'graphics', 'music', 'vfx', 'adr', 'notes', 'workflow'];

export default function PostModule() {
  const post = useProject((p) => p.post);
  const delivery = useProject((p) => p.meta.deliveryDate);
  const fmt = useFormatters();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const [tab, setTabState] = useState<Tab>(() => {
    const t = readLS<Tab>('prepro.post.tab', 'schedule');
    return TAB_IDS.includes(t) ? t : 'schedule';
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    writeLS('prepro.post.tab', t);
  };

  useEffect(() => {
    if (typeof params?.tab === 'string' && TAB_IDS.includes(params.tab as Tab)) setTab(params.tab as Tab);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNotes = post.editNotes.filter((n) => n.status === 'open').length;
  const tabs: TabDef<Tab>[] = [
    { id: 'schedule', label: 'Schedule', icon: CalendarClock, count: post.schedule.length },
    { id: 'deliverables', label: 'Deliverables', icon: PackageCheck, count: post.deliverables.length },
    { id: 'graphics', label: 'Graphics & Titles', icon: Type, count: post.graphics.length },
    { id: 'music', label: 'Music', icon: Music2, count: post.music.length },
    { id: 'vfx', label: 'VFX', icon: Sparkles, count: post.vfx.length },
    { id: 'adr', label: 'ADR', icon: Mic, count: post.adr.length },
    { id: 'notes', label: 'Edit Notes', icon: MessageSquareText, count: openNotes || post.editNotes.length },
    { id: 'workflow', label: 'Workflow', icon: Workflow },
  ];

  const msDone = post.schedule.filter((s) => s.status === 'done' || s.status === 'approved').length;
  const dlvDone = post.deliverables.filter((d) => d.status === 'done').length;
  const subtitle = [
    post.schedule.length ? `${msDone}/${post.schedule.length} post milestones done` : 'No post schedule yet',
    post.deliverables.length ? `${dlvDone}/${post.deliverables.length} deliverables` : '',
    delivery ? `delivery ${fmt.dateMedium(delivery)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const model = () => getScriptModel(getProject());

  return (
    <div className="module">
      <ModuleHeader
        title="Post-Production"
        icon={Scissors}
        subtitle={subtitle}
        actions={
          <ExportMenu
            docs={[
              { id: 'post-schedule', label: 'Post schedule' },
              { id: 'deliverables', label: 'Deliverables specs' },
              { id: 'graphics-list', label: 'Graphics & titles list' },
              { id: 'music-cue-sheet', label: 'Music cue sheet' },
              { id: 'vfx-list', label: 'VFX list' },
              { id: 'adr-list', label: 'ADR list' },
              { id: 'edit-notes', label: 'Edit notes' },
              { id: 'post-workflow', label: 'Media management plan' },
            ]}
            csv={[
              { label: 'Post schedule (CSV)', onClick: () => csvSchedule(getProject()) },
              { label: 'Deliverables (CSV)', onClick: () => csvDeliverables(getProject()) },
              { label: 'Graphics & titles (CSV)', onClick: () => csvGraphics(getProject(), model()) },
              { label: 'Music cue sheet (CSV)', onClick: () => csvMusic(getProject()) },
              { label: 'VFX list (CSV)', onClick: () => csvVfx(getProject(), model()) },
              { label: 'ADR list (CSV)', onClick: () => csvAdr(getProject(), model()) },
              { label: 'Edit notes (CSV)', onClick: () => csvEditNotes(getProject()) },
            ]}
          />
        }
      />
      <UnderlineTabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'deliverables' && <DeliverablesTab />}
      {tab === 'graphics' && <GraphicsTab />}
      {tab === 'music' && <MusicTab />}
      {tab === 'vfx' && <VfxTab />}
      {tab === 'adr' && <AdrTab />}
      {tab === 'notes' && <EditNotesTab />}
      {tab === 'workflow' && <WorkflowTab />}
    </div>
  );
}
