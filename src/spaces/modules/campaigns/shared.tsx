/* Campaigns & Milestones: list operations, add / delete with reference
   clean-up, CSV exports and small shared components. Pure helpers live in
   ./logic (re-exported here). */
import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { Campaign, ContentPiece, SpaceData, SpaceMilestone } from '@/spaces/types';
import { CAMPAIGN_STATUSES, FORMAT_BY_ID, PILLAR_COLORS } from '@/spaces/constants';
import { makeCampaign } from '@/spaces/defaults';
import { getSpace, spaceListOps, updateSpace } from '@/store/space';
import { exportCsv } from '@/backend';
import { addDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { SWATCHES, optionLabel } from '@/lib/constants';
import { safeFileName } from '@/lib/text';
import { ColorPicker, Popover, confirmDialog, toast, type AnchorRect } from '@/ui';
import { campaignRange, plural, sortCampaigns } from './logic';

export * from './logic';

export const campaignOps = spaceListOps<Campaign>((d) => d.campaigns, 'campaigns');
export const milestoneOps = spaceListOps<SpaceMilestone>((d) => d.milestones, 'milestones');

export const CAMPAIGN_SWATCHES = [...PILLAR_COLORS, ...SWATCHES.filter((c) => !PILLAR_COLORS.includes(c))].slice(0, 16);

/* ---------------------------------------------------------------- add / delete */

export function addCampaign(patch: Partial<Campaign> = {}): Campaign {
  const s = getSpace();
  const today = todayISO();
  const lastEnd = s.campaigns
    .map((c) => campaignRange(c).end)
    .filter((d): d is string => !!d && d >= today)
    .sort()
    .pop();
  const start = lastEnd ? addDays(lastEnd, 1) : today;
  const c = makeCampaign({ start, end: addDays(start, 13), color: PILLAR_COLORS[(s.campaigns.length + 1) % PILLAR_COLORS.length], ...patch });
  campaignOps.add(c);
  return c;
}

/** Three classic release phases, back to back from today. */
export function addLaunchPhases(): Campaign[] {
  const today = todayISO();
  const phases = [
    { name: 'Tease', objective: 'Build curiosity before anything is revealed', days: 14 },
    { name: 'Launch', objective: 'Maximum reach for the big drop', days: 10 },
    { name: 'Sustain', objective: 'Keep the momentum: reactions, BTS, clips', days: 21 },
  ];
  const n = getSpace().campaigns.length;
  let start = today;
  const out: Campaign[] = phases.map((p, i) => {
    const c = makeCampaign({ name: p.name, objective: p.objective, start, end: addDays(start, p.days - 1), color: PILLAR_COLORS[(n + i + 1) % PILLAR_COLORS.length] });
    start = addDays(start, p.days);
    return c;
  });
  updateSpace((d) => {
    d.campaigns.push(...out);
  });
  return out;
}

export function addMilestone(patch: Partial<SpaceMilestone> = {}): SpaceMilestone {
  const m: SpaceMilestone = { id: uid('sms'), name: 'New milestone', ...patch };
  milestoneOps.add(m);
  return m;
}

export function duplicateCampaign(c: Campaign): Campaign {
  const copy: Campaign = { ...(JSON.parse(JSON.stringify(c)) as Campaign), id: uid('camp'), name: `${c.name || 'Campaign'} (copy)` };
  updateSpace((d) => {
    const i = d.campaigns.findIndex((x) => x.id === c.id);
    d.campaigns.splice(i < 0 ? d.campaigns.length : i + 1, 0, copy);
  });
  return copy;
}

export async function deleteCampaign(c: Campaign): Promise<boolean> {
  const s = getSpace();
  const pieces = s.content.filter((x) => x.campaignId === c.id).length;
  const ms = s.milestones.filter((x) => x.campaignId === c.id).length;
  const res = s.assets.filter((x) => x.campaignId === c.id).length;
  const extra = [pieces ? plural(pieces, 'content piece') : '', ms ? plural(ms, 'milestone') : '', res ? plural(res, 'resource') : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const ok = await confirmDialog({
    title: 'Delete campaign?',
    message: `“${c.name || 'Untitled campaign'}” will be removed.${extra ? ` Its ${extra} stay in the space, just without a campaign.` : ''}`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  updateSpace((d) => {
    d.campaigns = d.campaigns.filter((x) => x.id !== c.id);
    for (const x of d.content) if (x.campaignId === c.id) delete x.campaignId;
    for (const x of d.milestones) if (x.campaignId === c.id) delete x.campaignId;
    for (const x of d.goals) if (x.campaignId === c.id) delete x.campaignId;
    for (const x of d.tactics) if (x.campaignId === c.id) delete x.campaignId;
    for (const x of d.assets) if (x.campaignId === c.id) delete x.campaignId;
    for (const sh of d.crm ?? []) {
      const cols = sh.columns.filter((col) => col.type === 'campaign').map((col) => col.id);
      if (cols.length) for (const r of sh.rows) for (const k of cols) if (r.values[k] === c.id) delete r.values[k];
    }
  });
  return true;
}

export async function deleteMilestone(m: SpaceMilestone): Promise<boolean> {
  const ok = await confirmDialog({ title: 'Delete milestone?', message: `“${m.name || 'Untitled milestone'}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) milestoneOps.remove(m.id);
  return ok;
}

/* ---------------------------------------------------------------- CSV */

function baseName(s: SpaceData, what: string) {
  return safeFileName(`${s.meta.title || 'Space'} - ${what}`);
}

export async function exportCampaignsCsv() {
  const s = getSpace();
  const channels = new Map(s.channels.map((c) => [c.id, c.name]));
  const rows = sortCampaigns(s.campaigns);
  const path = await exportCsv(baseName(s, 'Campaigns'), rows, [
    { header: 'Campaign', value: (c) => c.name },
    { header: 'Objective', value: (c) => c.objective },
    { header: 'Status', value: (c) => optionLabel(CAMPAIGN_STATUSES, c.status) },
    { header: 'Start', value: (c) => c.start },
    { header: 'End', value: (c) => c.end },
    { header: 'Channels', value: (c) => (c.channelIds ?? []).map((id) => channels.get(id)).filter(Boolean).join(', ') },
    { header: 'Budget', value: (c) => c.budget },
    { header: 'CTA / offer', value: (c) => c.cta },
    { header: 'Content pieces', value: (c) => s.content.filter((x) => x.campaignId === c.id).length },
    { header: 'Description', value: (c) => c.description },
    { header: 'Notes', value: (c) => c.notes },
  ]);
  if (path) toast('Campaigns exported');
}

export async function exportMilestonesCsv() {
  const s = getSpace();
  const campaigns = new Map(s.campaigns.map((c) => [c.id, c.name]));
  const rows = [...s.milestones].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const path = await exportCsv(baseName(s, 'Milestones'), rows, [
    { header: 'Milestone', value: (m) => m.name },
    { header: 'Date', value: (m) => m.date },
    { header: 'Done', value: (m) => !!m.done },
    { header: 'Campaign', value: (m) => (m.campaignId ? campaigns.get(m.campaignId) : '') },
    { header: 'Notes', value: (m) => m.notes },
  ]);
  if (path) toast('Milestones exported');
}

/* ---------------------------------------------------------------- components */

export function FormatIcon({ format, size = 14 }: { format: ContentPiece['format']; size?: number }) {
  const def = FORMAT_BY_ID[format];
  const Icon = def?.icon ?? FileText;
  return (
    <span className="sp-campaigns-fmt" title={def?.label ?? 'Content'}>
      <Icon size={size} />
    </span>
  );
}

/** Colour swatch button that opens a colour picker popover. */
export function ColorButton({ value, onChange, label = 'Colour', size = 22 }: { value?: string; onChange: (c: string) => void; label?: string; size?: number }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  return (
    <>
      <button
        type="button"
        className="sp-campaigns-colorbtn"
        style={{ background: value || '#7c5cff', width: size, height: size }}
        aria-label={label}
        title={label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      />
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="sp-campaigns-colorpop">
          <ColorPicker
            value={value}
            swatches={CAMPAIGN_SWATCHES}
            onChange={(c) => {
              if (!c) return;
              onChange(c);
              if (CAMPAIGN_SWATCHES.some((s) => s.toLowerCase() === c.toLowerCase())) setAnchor(null);
            }}
          />
        </div>
      </Popover>
    </>
  );
}
