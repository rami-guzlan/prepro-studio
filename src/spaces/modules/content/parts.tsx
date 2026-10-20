/* Small presentational pieces shared by the board, list, editor and dialogs. */
import type { CSSProperties } from 'react';
import { AudioLines, Flag } from 'lucide-react';
import type { ID } from '@/types';
import { FORMAT_BY_ID, STAGE_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import type { Campaign, Channel, ContentFormat, ContentPost, ContentStage, Pillar } from '@/spaces/types';
import { postStatusLabel } from './shared';

export function FormatIcon({ format, size = 14, style }: { format: ContentFormat | undefined; size?: number; style?: CSSProperties }) {
  const Icon = (format && FORMAT_BY_ID[format]?.icon) || AudioLines;
  return <Icon size={size} style={{ flexShrink: 0, ...style }} />;
}

export function StageBadge({ stage }: { stage: ContentStage }) {
  const s = STAGE_BY_ID[stage];
  const color = s?.color ?? '#a5a3b3';
  return (
    <span className="sp-content-stage-badge" style={{ ['--st' as string]: color }} title={s?.hint}>
      <span className="dot" />
      {s?.label ?? stage}
    </span>
  );
}

export function PillarTag({ pillar }: { pillar: Pillar | undefined }) {
  if (!pillar) return null;
  return (
    <span className="sp-content-pillar" style={{ ['--pil' as string]: pillar.color }} title={pillar.description || `Pillar: ${pillar.name}`}>
      {pillar.name}
    </span>
  );
}

export function CampaignChip({ campaign }: { campaign: Campaign | undefined }) {
  if (!campaign) return null;
  return (
    <span className="sp-content-campaign" title={campaign.objective ? `${campaign.name} — ${campaign.objective}` : `Campaign: ${campaign.name}`}>
      <span className="color-dot" style={{ background: campaign.color, width: 7, height: 7 }} />
      {campaign.name}
    </span>
  );
}

/** One dot per post, coloured by channel; filled = published, ring = planned, faded = skipped. */
export function ChannelDots({ posts, channels, max = 8, fmtDate }: { posts: ContentPost[]; channels: Map<ID, Channel>; max?: number; fmtDate?: (iso?: string) => string }) {
  if (!posts.length) return null;
  const shown = posts.slice(0, max);
  return (
    <span className="sp-content-dots">
      {shown.map((p) => {
        const ch = channels.get(p.channelId);
        const color = ch ? channelColor(ch) : '#8a8a94';
        const label = `${ch?.name ?? 'Deleted channel'} · ${postStatusLabel(p.status)}${p.date && fmtDate ? ` · ${fmtDate(p.date)}` : ''}`;
        return <span key={p.id} className={`sp-content-dot ${p.status}`} style={{ ['--ch' as string]: color }} title={label} />;
      })}
      {posts.length > max && <span className="sp-content-dots-more">+{posts.length - max}</span>}
    </span>
  );
}

export function PriorityFlag({ priority }: { priority: string | undefined }) {
  if (priority === 'high')
    return (
      <span className="sp-content-prio high" title="High priority">
        <Flag size={12} />
      </span>
    );
  if (priority === 'low')
    return (
      <span className="sp-content-prio low" title="Low priority">
        Low
      </span>
    );
  return null;
}

export function ChannelLabel({ channel, fallback = 'Deleted channel' }: { channel: Channel | undefined; fallback?: string }) {
  return (
    <span className="row" style={{ gap: 6, minWidth: 0 }}>
      <span className="color-dot" style={{ background: channel ? channelColor(channel) : '#8a8a94' }} />
      <span className="ellipsis">{channel?.name ?? fallback}</span>
    </span>
  );
}
