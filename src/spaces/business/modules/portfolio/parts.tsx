/* Portfolio thumbnail (stored still, else YouTube thumbnail, else a kind icon). */
import { useState } from 'react';
import { BookOpen, Clapperboard, FileText, Film, Image as ImageIcon, Link2, Play } from 'lucide-react';
import { AssetImage } from '@/ui';
import { PORTFOLIO_KINDS } from '../../constants';
import type { PortfolioItem, PortfolioKind } from '../../types';
import { videoThumb } from '../pipeline/sales-shared';

export const KIND_ICON: Record<PortfolioKind, typeof Film> = { showreel: Clapperboard, video: Film, image: ImageIcon, case_study: BookOpen, link: Link2, document: FileText };

export const kindInfo = (k: PortfolioKind) => PORTFOLIO_KINDS.find((x) => x.value === k) ?? PORTFOLIO_KINDS[1];

export const isVideoKind = (k: PortfolioKind) => k === 'showreel' || k === 'video';

export function ProofThumb({ item, play = true }: { item: Pick<PortfolioItem, 'image' | 'url' | 'kind' | 'title'>; play?: boolean }) {
  const [broken, setBroken] = useState(false);
  const yt = !item.image && !broken ? videoThumb(item.url) : undefined;
  const Icon = KIND_ICON[item.kind] ?? Film;
  const showPlay = play && isVideoKind(item.kind) && (item.image || yt);
  return (
    <span className="sl-thumb" style={{ ['--kc' as string]: kindInfo(item.kind).color }}>
      {item.image ? (
        <AssetImage name={item.image} alt={item.title} className="sl-thumb-img" />
      ) : yt ? (
        <img src={yt} alt={item.title} className="sl-thumb-img" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <span className="sl-thumb-ph">
          <Icon size={26} />
        </span>
      )}
      {showPlay && (
        <span className="sl-play">
          <Play size={16} fill="currentColor" />
        </span>
      )}
    </span>
  );
}
