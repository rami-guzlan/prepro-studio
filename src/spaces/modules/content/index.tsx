/* Content: every piece from idea to published. Board (kanban by stage with
   drag & drop and quick add) or List (sortable, groupable), filters, New
   content / Repurpose dialogs, print & CSV. The editor opens over it. */
import './content.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Columns3, FilterX, FolderKanban, Lightbulb, List, Plus, Radio, SearchX } from 'lucide-react';
import { navigateSpace, readLS, useApp, writeLS } from '@/store/app';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { FORMATS, STAGES, STAGE_BY_ID } from '@/spaces/constants';
import { overduePosts } from '@/spaces/derive';
import type { ContentFormat, ContentStage } from '@/spaces/types';
import { openContent, useSpaceUI, type ContentTab } from '@/spaces/ui';
import { useCommand } from '@/lib/commands';
import { todayISO } from '@/lib/dates';
import { Button, EmptyState, ExportMenu, Menu, ModuleHeader, SearchInput, Select, Switch, Tabs, Toolbar, isModalOpen, toast } from '@/ui';
import { ContentBoard, type Lookups } from './Board';
import { ContentList, GROUP_OPTIONS, type GroupBy } from './ListView';
import { LS_LAST_FORMAT } from './NewContentDialog';
import { FormatIcon } from './parts';
import { EMPTY_FILTERS, NONE, createContent, exportContentCsv, filterContent, formatLabel, hasActiveFilters, useOwnerSuggestions, type ContentFilters } from './shared';
import { openNewContent, setContentOrder } from './store';

type View = 'board' | 'list';

const LS_VIEW = 'prepro.space.content.view';
const LS_GROUP = 'prepro.space.content.groupBy';
const LS_HIDE = 'prepro.space.content.hidePublished';

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export default function ContentModule() {
  const content = useSpace((s) => s.content);
  const channels = useSpace((s) => s.channels);
  const pillars = useSpace((s) => s.pillars);
  const campaigns = useSpace((s) => s.campaigns);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const fmt = useSpaceFormatters();
  const owners = useOwnerSuggestions();
  const today = todayISO();

  const [view, setViewState] = useState<View>(() => readLS<View>(LS_VIEW, 'board'));
  const setView = (v: View) => {
    setViewState(v);
    writeLS(LS_VIEW, v);
  };
  const [groupBy, setGroupByState] = useState<GroupBy>(() => readLS<GroupBy>(LS_GROUP, 'none'));
  const setGroupBy = (g: GroupBy) => {
    setGroupByState(g);
    writeLS(LS_GROUP, g);
  };
  const [filters, setFiltersState] = useState<ContentFilters>(() => ({ ...EMPTY_FILTERS, hidePublished: readLS<boolean>(LS_HIDE, false) }));
  const setFilters = (patch: Partial<ContentFilters>) => {
    if (patch.hidePublished != null) writeLS(LS_HIDE, patch.hidePublished);
    setFiltersState((f) => ({ ...f, ...patch }));
  };
  const [quickFormat, setQuickFormatState] = useState<ContentFormat>(() => readLS<ContentFormat>(LS_LAST_FORMAT, 'short_video'));
  const setQuickFormat = (f: ContentFormat) => {
    setQuickFormatState(f);
    writeLS(LS_LAST_FORMAT, f);
  };
  const [highlight, setHighlight] = useState<{ stage: ContentStage; key: number } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const list = content ?? [];
  const lookups = useMemo<Lookups>(
    () => ({
      pillars: new Map((pillars ?? []).map((p) => [p.id, p])),
      campaigns: new Map((campaigns ?? []).map((p) => [p.id, p])),
      channels: new Map((channels ?? []).map((p) => [p.id, p])),
    }),
    [pillars, campaigns, channels],
  );
  const boardPieces = useMemo(() => filterContent(list, filters, { keepPublished: true }), [list, filters]);
  const listPieces = useMemo(() => filterContent(list, filters), [list, filters]);

  // order the editor steps through (the list view publishes its own sorted order)
  useEffect(() => {
    if (view !== 'board') return;
    const stages = STAGES.filter((s) => !(filters.hidePublished && s.value === 'published'));
    setContentOrder(stages.flatMap((s) => boardPieces.filter((c) => c.stage === s.value).map((c) => c.id)));
  }, [view, boardPieces, filters.hidePublished]);

  // deep links: navigateSpace('content', { contentId, tab }) · navigateSpace('content', { stage })
  useEffect(() => {
    if (typeof params?.contentId === 'string') openContent(params.contentId, (params.tab as ContentTab) ?? 'brief');
    if (typeof params?.stage === 'string' && STAGE_BY_ID[params.stage as ContentStage]) {
      const stage = params.stage as ContentStage;
      setView('board');
      if (stage === 'published' && filters.hidePublished) setFilters({ hidePublished: false });
      setHighlight({ stage, key: navKey });
    }
    // from Strategy → Pillars / Campaigns: show only that pillar's / campaign's pieces
    if (typeof params?.pillarId === 'string') setFilters({ pillar: params.pillarId });
    if (typeof params?.campaignId === 'string') setFilters({ campaign: params.campaignId });
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useCommand('find', () => {
    if (useSpaceUI.getState().contentId || !list.length) return false;
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  // "N" opens the New content dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isModalOpen() || isTextTarget(e.target)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        newContent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const presetFromFilters = () => ({
    format: (filters.format || undefined) as ContentFormat | undefined,
    pillarId: filters.pillar && filters.pillar !== NONE ? filters.pillar : undefined,
    campaignId: filters.campaign && filters.campaign !== NONE ? filters.campaign : undefined,
    owner: filters.owner && filters.owner !== NONE ? filters.owner : undefined,
    channelIds: filters.channel && filters.channel !== NONE ? [filters.channel] : undefined,
  });

  const newContent = (stage?: ContentStage) => openNewContent({ ...presetFromFilters(), stage });

  const quickAdd = (stage: ContentStage, title: string, open: boolean) => {
    const p = presetFromFilters();
    const c = createContent(
      { title, stage, format: p.format ?? quickFormat, pillarId: p.pillarId, campaignId: p.campaignId, owner: p.owner },
      { channelIds: p.channelIds, position: 'top' },
    );
    if (open) openContent(c.id);
    else if (filterContent([c], filters, { keepPublished: true }).length === 0) toast(`Added “${c.title}” — hidden by the current filters`, 'info');
  };

  const captureFirst = (title: string, open: boolean) => {
    quickAdd('idea', title, open);
    if (!open) {
      setView('board');
      requestAnimationFrame(() => (document.querySelector('[data-stage="idea"] .sp-content-qa input') as HTMLInputElement | null)?.focus());
    }
  };

  /* ---- header numbers */
  const published = list.filter((c) => c.stage === 'published').length;
  const inProgress = list.filter((c) => c.stage !== 'idea' && c.stage !== 'published').length;
  const ideas = list.filter((c) => c.stage === 'idea').length;
  const overdue = useMemo(() => (content && channels ? overduePosts({ content, channels }, today).length : 0), [content, channels, today]);
  const subtitle = list.length
    ? [`${list.length} piece${list.length === 1 ? '' : 's'}`, `${ideas} idea${ideas === 1 ? '' : 's'}`, `${inProgress} in progress`, `${published} published`, overdue ? `${overdue} overdue post${overdue === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
    : 'From idea to published, on every channel';

  const filtersActive = hasActiveFilters(filters);
  const shown = view === 'board' ? boardPieces : listPieces;

  return (
    <div className="module sp-content-module">
      <ModuleHeader
        title="Content"
        icon={FolderKanban}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-content-plan', label: 'Content plan' },
                { id: 'space-content-brief', label: 'Content briefs (everything not yet published)' },
              ]}
              csv={[{ label: 'Content (CSV)', onClick: () => void exportContentCsv() }]}
            />
            <Button variant="primary" icon={Plus} onClick={() => newContent()} title="New content (N)">
              New content
            </Button>
          </>
        }
      >
        {list.length > 0 && <PipelineBar counts={STAGES.map((s) => ({ stage: s.value, label: s.label, color: s.color!, n: list.filter((c) => c.stage === s.value).length }))} onPick={(stage) => {
          setView('board');
          if (stage === 'published' && filters.hidePublished) setFilters({ hidePublished: false });
          setHighlight({ stage, key: Date.now() });
        }} />}
      </ModuleHeader>

      {list.length === 0 ? (
        <div className="module-body">
          <FirstIdea format={quickFormat} onFormat={setQuickFormat} hasChannels={(channels ?? []).length > 0} onAdd={captureFirst} onDetailed={() => newContent('idea')} />
        </div>
      ) : (
        <>
          <Toolbar>
            <Tabs<View>
              value={view}
              onChange={setView}
              tabs={[
                { id: 'board', label: 'Board', icon: Columns3 },
                { id: 'list', label: 'List', icon: List, count: listPieces.length },
              ]}
            />
            {view === 'list' && <Select size="sm" value={groupBy} options={GROUP_OPTIONS} onChange={(v) => setGroupBy(v as GroupBy)} style={{ width: 160 }} aria-label="Group by" />}
            <div className="vdivider" />
            <div ref={searchRef}>
              <SearchInput value={filters.query} onChange={(v) => setFilters({ query: v })} placeholder="Search content…" width={190} />
            </div>
            <Select size="sm" value={filters.format} options={FORMATS} placeholder="All formats" onChange={(v) => setFilters({ format: v })} style={{ width: 140 }} aria-label="Filter by format" />
            {(pillars ?? []).length > 0 && (
              <Select size="sm" value={filters.pillar} options={[...(pillars ?? []).map((p) => ({ value: p.id, label: p.name })), { value: NONE, label: 'No pillar' }]} placeholder="All pillars" onChange={(v) => setFilters({ pillar: v })} style={{ width: 140 }} aria-label="Filter by pillar" />
            )}
            {(campaigns ?? []).length > 0 && (
              <Select size="sm" value={filters.campaign} options={[...(campaigns ?? []).map((p) => ({ value: p.id, label: p.name })), { value: NONE, label: 'No campaign' }]} placeholder="All campaigns" onChange={(v) => setFilters({ campaign: v })} style={{ width: 150 }} aria-label="Filter by campaign" />
            )}
            {(channels ?? []).length > 0 && (
              <Select size="sm" value={filters.channel} options={[...(channels ?? []).map((p) => ({ value: p.id, label: p.name })), { value: NONE, label: 'Not planned on any channel' }]} placeholder="All channels" onChange={(v) => setFilters({ channel: v })} style={{ width: 140 }} aria-label="Filter by channel" />
            )}
            {owners.length > 0 && (
              <Select size="sm" value={filters.owner} options={[...owners.map((o) => ({ value: o, label: o })), { value: NONE, label: 'Unassigned' }]} placeholder="Everyone" onChange={(v) => setFilters({ owner: v })} style={{ width: 130 }} aria-label="Filter by owner" />
            )}
            {filtersActive && (
              <Button size="sm" variant="ghost" icon={FilterX} onClick={() => setFilters({ query: '', format: '', pillar: '', campaign: '', channel: '', owner: '' })}>
                Clear
              </Button>
            )}
            <div className="spacer" />
            <Switch checked={filters.hidePublished} onChange={(v) => setFilters({ hidePublished: v })} label="Hide published" />
          </Toolbar>
          <div className="sp-content-main">
            {filtersActive && shown.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Nothing matches"
                description="No content fits the current search and filters."
                action={<Button onClick={() => setFilters({ query: '', format: '', pillar: '', campaign: '', channel: '', owner: '' })}>Clear filters</Button>}
              />
            ) : view === 'board' ? (
              <ContentBoard
                pieces={boardPieces}
                lookups={lookups}
                fmt={fmt}
                today={today}
                collapsePublished={filters.hidePublished}
                onExpandPublished={() => setFilters({ hidePublished: false })}
                quickFormat={(filters.format as ContentFormat) || quickFormat}
                onQuickFormat={setQuickFormat}
                onQuickAdd={quickAdd}
                highlight={highlight}
              />
            ) : (
              <div className="sp-content-list-scroll">
                <ContentList pieces={listPieces} lookups={lookups} fmt={fmt} today={today} groupBy={groupBy} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- pipeline bar */

function PipelineBar({ counts, onPick }: { counts: { stage: ContentStage; label: string; color: string; n: number }[]; onPick: (s: ContentStage) => void }) {
  const total = counts.reduce((n, c) => n + c.n, 0) || 1;
  return (
    <div className="sp-content-pipebar" aria-label="Pipeline">
      {counts
        .filter((c) => c.n > 0)
        .map((c) => (
          <button key={c.stage} type="button" style={{ flexGrow: c.n / total, background: c.color }} onClick={() => onPick(c.stage)} title={`${c.label}: ${c.n}`} aria-label={`${c.label}: ${c.n}`} />
        ))}
    </div>
  );
}

/* ---------------------------------------------------------------- empty state */

function FirstIdea({ format, onFormat, hasChannels, onAdd, onDetailed }: { format: ContentFormat; onFormat: (f: ContentFormat) => void; hasChannels: boolean; onAdd: (title: string, open: boolean) => void; onDetailed: () => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);
  const submit = (open: boolean) => {
    const t = text.trim();
    if (!t) {
      inputRef.current?.focus();
      return;
    }
    onAdd(t, open);
    setText('');
  };
  return (
    <div className="sp-content-hero">
      <div className="sp-content-hero-icon">
        <Lightbulb size={26} />
      </div>
      <h2>Capture your first idea</h2>
      <p>
        Every piece — a reel, a trailer, a carousel, a newsletter — moves through the same pipeline, from a one-line idea to live on every channel. Dump ideas fast; shape them later.
      </p>
      <div className="sp-content-hero-input">
        <Menu
          trigger={
            <button type="button" className="sp-content-hero-format" title={`Format: ${formatLabel(format)} (click to change)`}>
              <FormatIcon format={format} size={16} />
              <span>{formatLabel(format)}</span>
            </button>
          }
          items={FORMATS.map((f) => ({ label: f.label, icon: f.icon, onClick: () => onFormat(f.value) }))}
        />
        <input
          ref={inputRef}
          value={text}
          placeholder="e.g. A day on set — BTS reel"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(e.ctrlKey || e.metaKey);
            }
          }}
          aria-label="Your first idea"
        />
        <Button variant="primary" icon={Plus} onClick={() => submit(false)}>
          Add idea
        </Button>
      </div>
      <div className="muted small">Enter adds it and keeps you typing · Ctrl+Enter adds it and opens the editor</div>

      <div className="sp-content-pipeline">
        {STAGES.map((s, i) => (
          <Fragment key={s.value}>
            <div className="sp-content-pipe-step" style={{ ['--st' as string]: s.color }}>
              <span className="dot" />
              <strong>{s.label}</strong>
              <span>{s.hint}</span>
            </div>
            {i < STAGES.length - 1 && <ChevronRight size={14} className="sp-content-pipe-arrow" />}
          </Fragment>
        ))}
      </div>

      <div className="sp-content-hero-actions">
        <Button variant="ghost" icon={Plus} onClick={onDetailed}>
          Create with all the details…
        </Button>
        {!hasChannels && (
          <Button variant="ghost" icon={Radio} onClick={() => navigateSpace('channels')}>
            Set up your channels first
          </Button>
        )}
      </div>
    </div>
  );
}
