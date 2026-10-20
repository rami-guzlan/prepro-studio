/* Poster of a production project (or its colour + initial when there is none). */
import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@/types';
import { backend } from '@/backend';

const prepared = new Set<string>();

/** Web build: asset blobs of other projects must be loaded before their URLs resolve. */
function usePosterUrl(p: ProjectSummary): string {
  const [, bump] = useState(0);
  const url = p.poster ? backend.assetUrl(p.id, p.poster) : '';
  useEffect(() => {
    if (!p.poster || url || prepared.has(p.id)) return;
    prepared.add(p.id);
    let alive = true;
    backend
      .prepareAssets(p.id)
      .then(() => alive && bump((n) => n + 1))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [p.id, p.poster, url]);
  return url;
}

export function Poster({ project, width = 96 }: { project: ProjectSummary; width?: number }) {
  const url = usePosterUrl(project);
  const [broken, setBroken] = useState(false);
  const show = url && !broken;
  return (
    <span className="sp-projects-poster" style={{ width, ['--pj-color' as string]: project.color || '#6d4aff', fontSize: Math.max(12, Math.round(width * 0.36)) }}>
      {show ? <img src={url} alt="" draggable={false} onError={() => setBroken(true)} /> : <span>{(project.title || '?').trim().slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}
