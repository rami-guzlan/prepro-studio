/* Script Breakdown: scene list + breakdown sheet editor, and a scenes × categories summary. */
import './breakdown.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDashed, FileText, Grid3x3, ScanText } from 'lucide-react';
import type { ID } from '@/types';
import { useScriptModel } from '@/derived/script';
import { getProject, useFormatters, useProject, useProjectId } from '@/store/project';
import { navigate, openPrint, readLS, useApp, writeLS } from '@/store/app';
import { useCommand } from '@/lib/commands';
import { matchesQuery } from '@/lib/text';
import { Button, EmptyState, ExportMenu, ModuleHeader, SearchInput, Tabs, UnderlineTabs, isModalOpen } from '@/ui';
import { SheetEditor } from './Sheet';
import { SummaryMatrix } from './Summary';
import { exportBreakdownCsv, exportSceneListCsv } from './exports';
import { characterMap, elementMap, intExtLabel, sceneCounts, stripStyle } from './logic';

type Tab = 'sheet' | 'summary';
type Filter = 'all' | 'todo' | 'done';

export default function BreakdownModule() {
  const model = useScriptModel();
  const scenes = model.scenes;
  const fmt = useFormatters();
  const pid = useProjectId();
  const elements = useProject((p) => p.elements);
  const characters = useProject((p) => p.characters);
  const scriptMode = useProject((p) => p.script.mode);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  const [tab, setTabState] = useState<Tab>(() => readLS<Tab>('prepro.breakdown.tab', 'sheet'));
  const setTab = (t: Tab) => {
    writeLS('prepro.breakdown.tab', t);
    setTabState(t);
  };
  const [selectedId, setSelectedIdState] = useState<ID | null>(() => readLS<ID | null>(`prepro.breakdown.scene.${pid}`, null));
  const setSelectedId = useCallback(
    (id: ID | null) => {
      setSelectedIdState(id);
      writeLS(`prepro.breakdown.scene.${pid}`, id);
    },
    [pid],
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const searchRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // navigation params: navigate('breakdown', { sceneId })
  useEffect(() => {
    const sid = params?.sceneId as ID | undefined;
    if (sid) {
      setSelectedId(sid);
      setTabState('sheet');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const elById = useMemo(() => elementMap(elements), [elements]);
  const charById = useMemo(() => characterMap(characters), [characters]);

  const info = useMemo(
    () =>
      scenes.map((s) => {
        const c = sceneCounts(s, elById, charById);
        return { scene: s, counts: c, done: c.elements + c.cast > 0 };
      }),
    [scenes, elById, charById],
  );
  const doneCount = info.filter((i) => i.done).length;

  const visible = useMemo(
    () =>
      info.filter((i) => {
        if (filter === 'todo' && i.done) return false;
        if (filter === 'done' && !i.done) return false;
        const s = i.scene;
        return matchesQuery(`${s.number} ${s.heading} ${s.synopsis} ${s.meta?.scriptDay ?? ''}`, query);
      }),
    [info, filter, query],
  );

  const current = scenes.find((s) => s.id === selectedId) ?? scenes[0];
  const index = current ? scenes.indexOf(current) : -1;

  const go = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = scenes[Math.max(0, Math.min(scenes.length - 1, index + delta))];
      if (next) setSelectedId(next.id);
    },
    [index, scenes, setSelectedId],
  );

  // keep the selected scene visible in the list
  useEffect(() => {
    if (!current || tab !== 'sheet') return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-sid="${CSS.escape(current.id)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [current?.id, tab]);

  // Alt+↑ / Alt+↓ : previous / next scene
  useEffect(() => {
    if (tab !== 'sheet') return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || isModalOpen()) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        go(e.key === 'ArrowUp' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, tab]);

  useCommand('find', () => {
    if (tab !== 'sheet') setTab('sheet');
    requestAnimationFrame(() => searchRef.current?.querySelector('input')?.focus());
    return true;
  });
  useCommand('print', () => {
    if (tab === 'summary') openPrint('breakdown-summary');
    else openPrint('breakdown-sheets', { sceneId: current?.number ?? '' });
    return true;
  });

  const totalPages = useMemo(() => scenes.reduce((n, s) => n + s.eighths, 0), [scenes]);
  const subtitle = scenes.length
    ? `${scenes.length} scene${scenes.length === 1 ? '' : 's'} · ${fmt.eighths(totalPages)} pages · ${doneCount} broken down · ${elements.length} element${elements.length === 1 ? '' : 's'}`
    : 'Breakdown sheets per scene';

  const header = (
    <ModuleHeader
      title="Script Breakdown"
      icon={ScanText}
      subtitle={subtitle}
      actions={
        scenes.length > 0 && (
          <ExportMenu
            docs={[
              ...(current ? [{ id: 'breakdown-sheets', label: `Breakdown sheet — scene ${current.number}`, options: { sceneId: current.number } }] : []),
              { id: 'breakdown-sheets', label: 'Breakdown sheets — all scenes', options: { sceneId: '' } },
              { id: 'breakdown-summary', label: 'Breakdown summary' },
              { id: 'scene-list', label: 'Scene list' },
            ]}
            csv={[
              { label: 'Breakdown (CSV)', onClick: () => exportBreakdownCsv(getProject()) },
              { label: 'Scene list (CSV)', onClick: () => exportSceneListCsv(getProject()) },
            ]}
          />
        )
      }
    />
  );

  if (scenes.length === 0) {
    return (
      <div className="module">
        {header}
        <div className="module-body">
          <EmptyState
            icon={ScanText}
            title="No scenes to break down yet"
            description={
              scriptMode === 'av'
                ? 'This project uses a two-column A/V script. Breakdown sheets are built from screenplay scene headings — switch the Script module to screenplay mode or add scene headings.'
                : 'Write or import a screenplay. Every scene heading (INT. / EXT.) becomes a breakdown sheet, and anything you tag in the script shows up here automatically.'
            }
            action={
              <Button variant="primary" icon={FileText} onClick={() => navigate('script')}>
                Open the script
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="module">
      {header}
      <UnderlineTabs<Tab>
        tabs={[
          { id: 'sheet', label: 'Breakdown sheets', icon: FileText },
          { id: 'summary', label: 'Summary', icon: Grid3x3 },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'summary' ? (
        <div className="module-body padded">
          <SummaryMatrix
            model={model}
            onOpen={(sid) => {
              setSelectedId(sid);
              setTab('sheet');
            }}
          />
        </div>
      ) : (
        <div className="split">
          <div className="pane-left">
            <div className="breakdown-listtools">
              <div ref={searchRef}>
                <SearchInput value={query} onChange={setQuery} placeholder="Search scenes…" width="100%" />
              </div>
              <Tabs<Filter>
                style={{ width: '100%' }}
                tabs={[
                  { id: 'all', label: 'All', count: scenes.length },
                  { id: 'todo', label: 'To do', count: scenes.length - doneCount },
                  { id: 'done', label: 'Done', count: doneCount },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </div>
            <div
              className="breakdown-scenes"
              ref={listRef}
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.altKey) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const i = visible.findIndex((v) => v.scene.id === current?.id);
                  const n = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
                  if (n) {
                    setSelectedId(n.scene.id);
                    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-sid="${CSS.escape(n.scene.id)}"]`)?.focus());
                  }
                }
              }}
            >
              {visible.length === 0 && (
                <div className="breakdown-listempty muted small">
                  {filter === 'todo' && !query ? 'Every scene has a breakdown. Nice work!' : 'No scenes match.'}
                </div>
              )}
              {visible.map(({ scene: s, counts, done }) => {
                const strip = stripStyle(s.stripKey);
                const active = s.id === current?.id;
                return (
                  <button key={s.id} type="button" data-sid={s.id} className={`breakdown-scene ${active ? 'active' : ''}`} onClick={() => setSelectedId(s.id)}>
                    <span className="breakdown-scene-num" style={{ background: strip.bg, color: strip.fg }} title={strip.label}>
                      {s.number}
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="breakdown-scene-title ellipsis">{s.set || s.heading || 'Untitled scene'}</span>
                      <span className="breakdown-scene-meta">
                        {intExtLabel(s.intExt)} · {s.dayNight || '—'} · {fmt.eighths(s.eighths)} pg
                        {s.meta?.scriptDay ? ` · ${s.meta.scriptDay}` : ''}
                      </span>
                    </span>
                    {done ? (
                      <span className="breakdown-scene-count" title={`${counts.cast} cast · ${counts.elements} elements`}>
                        {counts.cast + counts.elements}
                      </span>
                    ) : (
                      <span className="breakdown-scene-todo" title="Not broken down yet">
                        <CircleDashed size={15} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="breakdown-listfoot">
              <div className="progress" title={`${doneCount} of ${scenes.length} scenes broken down`}>
                <div style={{ width: `${(doneCount / Math.max(1, scenes.length)) * 100}%` }} />
              </div>
              <span className="tiny muted">
                {doneCount}/{scenes.length} broken down
              </span>
            </div>
          </div>
          <div className="pane-main">
            {current && (
              <SheetEditor key={current.id} scene={current} model={model} index={index} total={scenes.length} onPrev={() => go(-1)} onNext={() => go(1)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

