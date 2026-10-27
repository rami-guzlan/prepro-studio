/* Brand Kit & Assets › Design system: sub-navigation (with counts and the readiness meter) and the
   selected section. */
import '../designSystem.css';
import { useEffect, useMemo, useRef } from 'react';
import { useSpaceData } from '@/store/space';
import { dsReadiness } from '../compile';
import { DS_SECTIONS, type DSSectionId } from './options';
import { useAssets, useDS } from './shared';
import { OverviewSection } from './OverviewSection';
import { ColorSection } from './ColorSection';
import { TypeSection } from './TypeSection';
import { TokensSection } from './TokensSection';
import { ComponentsSection } from './ComponentsSection';
import { ArtSection } from './ArtSection';
import { RulesSection } from './RulesSection';
import { ReferencesSection } from './ReferencesSection';
import { FormatsSection } from './FormatsSection';
import { BriefsSection } from './BriefsSection';
import { ReviewSection } from './ReviewSection';
import { SourcesSection } from './SourcesSection';

export function Readiness({ onClick, compact }: { onClick?: () => void; compact?: boolean }) {
  const space = useSpaceData();
  const { score, missing } = useMemo(() => dsReadiness(space), [space]);
  const pct = Math.round(score * 100);
  const tone = pct >= 80 ? 'good' : pct >= 45 ? 'mid' : 'low';
  const body = (
    <>
      <div className="ds-ready-top">
        <span>Agent-ready</span>
        <b>{pct}%</b>
      </div>
      <div className="ds-ready-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Design system readiness">
        <span style={{ width: `${pct}%` }} />
      </div>
      {!compact && <div className="ds-ready-sub">{missing.length ? `${missing.length} to do — see the Agent guide` : 'Everything an agent needs is there'}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className={`ds-ready ${tone}`} onClick={onClick} title={missing.length ? `Missing: ${missing.join(', ')}` : 'Complete'}>
      {body}
    </button>
  ) : (
    <div className={`ds-ready ${tone}`}>{body}</div>
  );
}

export function DesignSystemPane({ section, onSection, onGuide }: { section: DSSectionId; onSection: (s: DSSectionId) => void; onGuide: () => void }) {
  const ds = useDS();
  const assets = useAssets();
  const bodyRef = useRef<HTMLDivElement>(null);
  const counts: Partial<Record<DSSectionId, number>> = useMemo(
    () => ({
      color: assets.filter((a) => a.kind === 'color').length,
      type: ds.typeStyles.length,
      tokens: ds.tokens.length,
      components: ds.components.length + ds.layouts.length,
      art: ds.treatments.length,
      rules: ds.rules.length,
      references: ds.references.length,
      formats: ds.formats.length,
      briefs: ds.briefs.length,
      review: ds.review.criteria.length,
      sources: ds.sources.length,
    }),
    [ds, assets],
  );

  // a new section starts at the top
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [section]);

  const def = DS_SECTIONS.find((s) => s.id === section) ?? DS_SECTIONS[0];
  return (
    <div className="ds-pane">
      <nav className="ds-nav" aria-label="Design system sections">
        <Readiness onClick={onGuide} />
        <div className="ds-nav-list" role="tablist" aria-orientation="vertical">
          {DS_SECTIONS.map((s, i) => {
            const Icon = s.icon;
            const n = counts[s.id];
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === def.id}
                className={s.id === def.id ? 'on' : ''}
                title={s.hint}
                onClick={() => onSection(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const next = DS_SECTIONS[(i + (e.key === 'ArrowDown' ? 1 : -1) + DS_SECTIONS.length) % DS_SECTIONS.length];
                    const list = e.currentTarget.parentElement;
                    onSection(next.id);
                    setTimeout(() => list?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
                  }
                }}
              >
                <Icon size={14} />
                <span className="grow ellipsis">{s.label}</span>
                {n != null && n > 0 && <span className="n">{n}</span>}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="ds-body" ref={bodyRef}>
        <div className="ds-body-inner">
          {def.id === 'overview' && <OverviewSection />}
          {def.id === 'color' && <ColorSection />}
          {def.id === 'type' && <TypeSection />}
          {def.id === 'tokens' && <TokensSection />}
          {def.id === 'components' && <ComponentsSection />}
          {def.id === 'art' && <ArtSection />}
          {def.id === 'rules' && <RulesSection />}
          {def.id === 'references' && <ReferencesSection />}
          {def.id === 'formats' && <FormatsSection />}
          {def.id === 'briefs' && <BriefsSection />}
          {def.id === 'review' && <ReviewSection />}
          {def.id === 'sources' && <SourcesSection />}
        </div>
      </div>
    </div>
  );
}
