/* Print building blocks for Marketing Space documents. The generic ones
   (PSection, PTable, KV, Box, Photo, Check, Dot, PBadge, Pre) come from
   '@/print/components'; this adds the space-aware document header. */
import type { ReactNode } from 'react';
import type { SpacePrintContext } from './types';

export function SpaceDocHeader({ ctx, title, subtitle, meta }: { ctx: SpacePrintContext; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode }) {
  const m = ctx.space.meta;
  const logo = ctx.space.settings.print.showLogo && m.logo ? ctx.asset(m.logo) : '';
  return (
    <div className="pp-doc-header">
      {logo && <img className="pp-logo" src={logo} alt="" />}
      <div className="pp-titles">
        <div className="pp-project">{m.title}</div>
        <h1>{title}</h1>
        {subtitle != null && subtitle !== '' && <div className="pp-sub">{subtitle}</div>}
      </div>
      <div className="pp-meta">{meta ?? ctx.today}</div>
    </div>
  );
}
