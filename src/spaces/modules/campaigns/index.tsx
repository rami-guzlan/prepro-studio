/* Campaigns & Milestones — roadmap timeline, campaign list + detail (fields,
   stats, content, milestones) and the space's milestone list. */
import './campaigns.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Megaphone, Plus } from 'lucide-react';
import { useSpace } from '@/store/space';
import { useApp } from '@/store/app';
import { todayISO } from '@/lib/dates';
import { Button, ExportMenu, ModuleHeader, type AnchorRect } from '@/ui';
import { CampaignsPanel } from './CampaignsPanel';
import { MilestonePopover, MilestonesPanel } from './MilestonesPanel';
import { RoadmapCard } from './Roadmap';
import { addCampaign, addLaunchPhases, campaignRange, exportCampaignsCsv, exportMilestonesCsv, isISO, plural, sortCampaigns } from './shared';

export default function CampaignsModule() {
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const milestones = useSpace((s) => s.milestones) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const channels = useSpace((s) => s.channels) ?? [];
  const mondayFirst = useSpace((s) => s.settings?.weekStartsMonday ?? true);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const today = todayISO();

  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof params?.campaignId === 'string' ? params.campaignId : null));
  const [focusName, setFocusName] = useState<string | null>(null);
  const [msEdit, setMsEdit] = useState<{ id: string; anchor: AnchorRect } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const msInputRef = useRef<HTMLInputElement>(null);

  // default selection: the running campaign, else the next one, else the first
  const effectiveId = useMemo(() => {
    if (selectedId && campaigns.some((c) => c.id === selectedId)) return selectedId;
    const sorted = sortCampaigns(campaigns);
    const live = sorted.find((c) => {
      const r = campaignRange(c);
      return r.start && r.end && r.start <= today && today <= r.end;
    });
    const upcoming = sorted.find((c) => (campaignRange(c).start ?? '') > today);
    return (live ?? upcoming ?? sorted[0])?.id ?? null;
  }, [selectedId, campaigns, today]);

  // deep link: navigateSpace('campaigns', { campaignId })
  useEffect(() => {
    if (typeof params?.campaignId === 'string') {
      setSelectedId(params.campaignId);
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id: string | null) => {
    setSelectedId(id);
    setFocusName(null);
  };

  const selectAndShow = (id: string) => {
    select(id);
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight - 120 || r.bottom < 80) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const newCampaign = () => {
    const c = addCampaign();
    setSelectedId(c.id);
    setFocusName(c.id);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const phases = () => {
    const list = addLaunchPhases();
    if (list[0]) setSelectedId(list[0].id);
  };

  const focusMilestoneInput = () => {
    const el = msInputRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
  };

  const active = campaigns.filter((c) => {
    const r = campaignRange(c);
    return r.start && r.end && r.start <= today && today <= r.end;
  }).length;
  const msDone = milestones.filter((m) => m.done).length;
  const subtitle = campaigns.length || milestones.length
    ? [plural(campaigns.length, 'campaign'), active ? `${active} running` : '', milestones.length ? `${msDone}/${plural(milestones.length, 'milestone')} done` : ''].filter(Boolean).join(' · ')
    : 'Plan launches, phases and key dates';

  return (
    <div className="module">
      <ModuleHeader
        title="Campaigns & Milestones"
        icon={Megaphone}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu
              docs={[{ id: 'space-campaign-plan', label: 'Campaign plan' }]}
              csv={[
                { label: 'Campaigns (CSV)', onClick: exportCampaignsCsv },
                { label: 'Milestones (CSV)', onClick: exportMilestonesCsv },
              ]}
            />
            <Button icon={Flag} onClick={focusMilestoneInput}>
              Add milestone
            </Button>
            <Button variant="primary" icon={Plus} onClick={newCampaign}>
              New campaign
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="sp-campaigns-page">
          <RoadmapCard
            campaigns={campaigns}
            milestones={milestones}
            content={content}
            channels={channels}
            mondayFirst={mondayFirst}
            selectedId={effectiveId}
            onSelect={selectAndShow}
            onEditMilestone={(id, anchor) => setMsEdit({ id, anchor })}
            onNewCampaign={newCampaign}
            onPhases={phases}
          />
          <div ref={panelRef} className="sp-campaigns-anchor">
            <CampaignsPanel
              selectedId={effectiveId}
              onSelect={select}
              onNewCampaign={newCampaign}
              onPhases={phases}
              focusName={focusName}
              hideEmpty={campaigns.length === 0 && !milestones.some((m) => isISO(m.date))}
            />
          </div>
          <MilestonesPanel inputRef={msInputRef} />
        </div>
      </div>
      <MilestonePopover id={msEdit?.id ?? null} anchor={msEdit?.anchor ?? null} onClose={() => setMsEdit(null)} />
    </div>
  );
}
