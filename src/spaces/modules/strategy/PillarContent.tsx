/* Strategy › Pillars › one pillar's content: every piece in the pillar (or with no
   pillar) grouped by stage, with quick edits — stage, pillar, open in the editor —
   and new pieces created straight into the pillar. */
import { useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, Layers, MoreHorizontal, Plus, X } from 'lucide-react';
import type { ID } from '@/types';
import type { ContentPiece, ContentStage } from '@/spaces/types';
import { STAGES } from '@/spaces/constants';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { todayISO, addDays } from '@/lib/dates';
import { openContent } from '@/spaces/ui';
import { Button, EmptyState, IconButton, Menu, SearchInput, Select, Switch } from '@/ui';
import { contentMenuItems, NONE, nextPostInfo, patchContent, setStage } from '../content/shared';
import { openNewContent } from '../content/store';
import { FormatIcon } from '../content/parts';
import { plural } from './shared';

/** pillarId = a pillar id, or NONE for pieces without a pillar */
export function PillarContentPanel({ pillarId, onClose, onSwitch }: { pillarId: ID; onClose: () => void; onSwitch: (id: ID) => void }) {
  const pillars = useSpace((s) => s.pillars);
  const content = useSpace((s) => s.content);
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const fmt = useSpaceFormatters();
  const [query, setQuery] = useState('');
  const [stage, setStageFilter] = useState<ContentStage | ''>('');
  const [hidePublished, setHidePublished] = useState(false);

  const none = pillarId === NONE;
  const pillar = none ? undefined : pillars.find((p) => p.id === pillarId);
  const known = useMemo(() => new Set(pillars.map((p) => p.id)), [pillars]);
  const inPillar = useMemo(() => content.filter((c) => (none ? !c.pillarId || !known.has(c.pillarId) : c.pillarId === pillarId)), [content, pillarId, none, known]);

  const today = todayISO();
  const in30 = addDays(today, 30);
  const stats = useMemo(() => {
    const byStage = new Map<ContentStage, number>();
    let upcoming = 0;
    let lastPublished: string | undefined;
    for (const c of inPillar) {
      byStage.set(c.stage, (byStage.get(c.stage) ?? 0) + 1);
      for (const p of c.posts) {
        if (p.date && p.status !== 'published' && p.status !== 'skipped' && p.date >= today && p.date <= in30) upcoming++;
        if (p.date && p.status === 'published' && (!lastPublished || p.date > lastPublished)) lastPublished = p.date;
      }
    }
    return { byStage, upcoming, lastPublished, inProgress: inPillar.filter((c) => c.stage !== 'idea' && c.stage !== 'published').length };
  }, [inPillar, today, in30]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPillar.filter(
      (c) =>
        (!stage || c.stage === stage) &&
        (!hidePublished || c.stage !== 'published') &&
        (!q || [c.title, c.concept, c.hook, c.owner].some((x) => x?.toLowerCase().includes(q))),
    );
  }, [inPillar, query, stage, hidePublished]);

  const pillarOptions = [...pillars.map((p) => ({ value: p.id, label: p.name || 'Untitled pillar' })), { value: NONE, label: 'No pillar' }];
  const campaignName = (id?: ID) => (id ? campaigns.find((x) => x.id === id)?.name : undefined);
  const color = pillar?.color ?? 'var(--border-strong)';
  const title = none ? 'No pillar' : pillar?.name || 'Untitled pillar';

  if (!none && !pillar) return null;

  return (
    <section className="card sp-pillar-panel" style={{ ['--pc' as string]: color }} aria-label={`Content in ${title}`}>
      <header className="sp-pillar-panel-head">
        <span className="sp-pillar-panel-dot" />
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 className="ellipsis">{title}</h3>
          <div className="muted small ellipsis">{none ? 'Pieces not assigned to a pillar yet — give each one a home.' : pillar?.description || 'Every piece of content in this pillar'}</div>
        </div>
        <Select size="sm" value={pillarId} options={pillarOptions} onChange={(v) => v && onSwitch(v)} aria-label="Show another pillar" style={{ width: 170 }} />
        {!none && (
          <Button size="sm" icon={Plus} variant="primary" onClick={() => openNewContent({ pillarId })}>
            New piece
          </Button>
        )}
        <IconButton icon={ExternalLink} label="Open in the Content board" onClick={() => navigateSpace('content', { pillarId: none ? NONE : pillarId })} />
        <IconButton icon={X} label="Close" onClick={onClose} />
      </header>

      <div className="sp-pillar-panel-stats">
        <span>
          <b>{inPillar.length}</b> {inPillar.length === 1 ? 'piece' : 'pieces'}
        </span>
        <span>
          <b>{stats.inProgress}</b> in progress
        </span>
        <span>
          <b>{stats.byStage.get('published') ?? 0}</b> published
        </span>
        <span>
          <b>{stats.upcoming}</b> {stats.upcoming === 1 ? 'post' : 'posts'} in the next 30 days
        </span>
        <span className="muted">{stats.lastPublished ? `last out ${fmt.dateShort(stats.lastPublished)}` : 'nothing published yet'}</span>
      </div>

      {inPillar.length > 0 && (
        <div className="sp-pillar-panel-stages" role="group" aria-label="Filter by stage">
          {STAGES.map((s) => {
            const n = stats.byStage.get(s.value) ?? 0;
            return (
              <button key={s.value} type="button" className={`sp-pillar-stage ${stage === s.value ? 'on' : ''}`} style={{ ['--st' as string]: s.color }} disabled={!n} onClick={() => setStageFilter(stage === s.value ? '' : s.value)} aria-pressed={stage === s.value} title={s.hint}>
                <span className="dot" />
                {s.label} <b>{n}</b>
              </button>
            );
          })}
        </div>
      )}

      {inPillar.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={none ? 'Every piece has a pillar' : 'No content in this pillar yet'}
          description={none ? 'Nice — your whole mix is accounted for.' : 'Add a piece here, or move existing pieces in by choosing this pillar on them.'}
          action={
            none ? undefined : (
              <Button variant="primary" icon={Plus} onClick={() => openNewContent({ pillarId })}>
                New piece in {title}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="sp-pillar-panel-tools">
            <SearchInput value={query} onChange={setQuery} placeholder={`Search ${plural(inPillar.length, 'piece')}…`} width={240} />
            <Switch checked={hidePublished} onChange={setHidePublished} label="Hide published" />
            {(stage || query) && (
              <Button size="sm" variant="ghost" onClick={() => (setStageFilter(''), setQuery(''))}>
                Clear filters
              </Button>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="muted small" style={{ padding: '6px 16px 16px' }}>
              Nothing matches.
            </p>
          ) : (
            <div className="sp-pillar-panel-list">
              {STAGES.filter((s) => shown.some((c) => c.stage === s.value)).map((s) => (
                <div key={s.value} className="sp-pillar-group">
                  <div className="sp-pillar-group-head" style={{ ['--st' as string]: s.color }}>
                    <span className="dot" />
                    {s.label}
                    <span className="muted">{shown.filter((c) => c.stage === s.value).length}</span>
                  </div>
                  {shown
                    .filter((c) => c.stage === s.value)
                    .map((c) => (
                      <PieceRow key={c.id} c={c} campaign={campaignName(c.campaignId)} pillarId={none ? NONE : pillarId} pillarOptions={pillarOptions} today={today} />
                    ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );

}

function PieceRow({ c, campaign, pillarId: current, pillarOptions: opts, today }: { c: ContentPiece; campaign?: string; pillarId: ID; pillarOptions: { value: string; label: string }[]; today: string }) {
  const fmt = useSpaceFormatters();
  const next = nextPostInfo(c, today);
  return (
    <div className="sp-pillar-piece">
      <button type="button" className="sp-pillar-piece-main" onClick={() => openContent(c.id, 'brief')} title="Open in the editor">
        <FormatIcon format={c.format} size={15} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="ellipsis sp-pillar-piece-title">{c.title || 'Untitled piece'}</span>
          <span className="ellipsis muted small">{[c.concept || c.hook, campaign ? `Campaign: ${campaign}` : '', c.owner].filter(Boolean).join(' · ') || 'No brief yet'}</span>
        </span>
      </button>
      <span className={`sp-pillar-piece-date small ${next?.overdue ? 'late' : 'muted'}`} title={next ? (next.published ? 'Last published' : next.overdue ? 'Post date passed' : 'Next post') : 'No post dates'}>
        {next ? (
          <>
            <CalendarClock size={13} /> {fmt.dateShort(next.date)}
          </>
        ) : (
          '—'
        )}
      </span>
      <Select size="sm" value={c.stage} options={STAGES.map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => v && setStage(c.id, v as ContentStage)} aria-label={`Stage of ${c.title}`} style={{ width: 118 }} />
      <Select size="sm" value={current} options={opts} onChange={(v) => patchContent(c.id, { pillarId: v && v !== NONE ? v : undefined })} aria-label={`Pillar of ${c.title}`} style={{ width: 150 }} />
      <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label="More" />} items={contentMenuItems(c)} />
    </div>
  );
}
