/* The library: Productions, Spaces (Marketing Spaces / Business Management), Personal
   Finances and Training — create, open, import, duplicate, archive and delete. */
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Archive, Bot, BriefcaseBusiness, LogOut, Users, ChevronDown, CircleHelp, Clapperboard, Dumbbell, Wallet, Copy, EyeOff, FileInput, FolderOpen, Megaphone, Moon, MoreHorizontal, Plus, RotateCcw, Sparkles, Sun, Trash2, Upload, Monitor } from 'lucide-react';
import type { SpaceSummary } from '@/spaces/types';
import { SPACE_TYPES } from '@/spaces/constants';
import { openAgentDialog } from '@/agent/state';
import type { ProjectSummary } from '@/types';
import { backend, isCloud, type HiddenDemos } from '@/backend';
import { cloudBoot, type TabId } from '@/backend/cloud';
import { PROJECT_STATUSES, PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { makeFormatters } from '@/lib/format';
import { readLS, setHomeTab, setTheme, useApp, writeLS, type HomeTab } from '@/store/app';
import { Badge, Button, EmptyState, Menu, Tabs, confirmDialog, toast, type MenuItem } from '@/ui';
import { useCommand } from '@/lib/commands';
import { NewProjectDialog } from './NewProjectDialog';
import { NewSpaceDialog } from './NewSpaceDialog';
import { NewBusinessDialog } from './NewBusinessDialog';
import { BUSINESS_TYPES } from '@/spaces/business/constants';

const FinanceHomePanel = lazy(() => import('@/spaces/finance/HomePanel'));
const TrainingHomePanel = lazy(() => import('@/spaces/training/HomePanel'));
import { confirmResetDemoSpace, deleteSpace, duplicateSpace, openDemoSpace, openSpaceById } from './spaceActions';
import { confirmResetDemo, deleteProject, duplicateProject, exportArchive, importArchive, importScriptAsNewProject, openDemo, openProjectById, removeDemoFromHome } from './projectActions';

const fmt = makeFormatters();

/* Hosted version: each person sees only the tabs the owner gave them. */
const account = cloudBoot?.account;
const TAB_ACCESS: Record<HomeTab, TabId> = { projects: 'productions', spaces: 'marketing', business: 'business', finance: 'finance', training: 'training' };
export const tabAllowed = (t: HomeTab) => !account || !!account.tabs[TAB_ACCESS[t]];
const ALL_TABS: HomeTab[] = ['projects', 'spaces', 'business', 'finance', 'training'];

/** Where to find the demos once their cards are removed (Help menu of the window; a Help button in the browser build). */
const DEMO_HINT_PROJECT = ' Want to look around first? Help → Open Demo Project.';
const DEMO_HINT_SPACE = ' Want to look around first? Help → Open Demo Marketing Space.';
const DEMO_CARD_HINT = 'Remove it any time — it stays in the Help menu';

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newBizOpen, setNewBizOpen] = useState(false);
  const tab = useApp((s) => s.homeTab);
  const [projectsDir, setProjectsDir] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [hiddenDemos, setHiddenDemos] = useState<HiddenDemos>({});
  const theme = useApp((s) => s.theme);

  const refresh = useCallback(async () => {
    try {
      setProjects(await backend.listProjects());
      setSpaces(await backend.listSpaces().catch(() => []));
      const info = await backend.info();
      setProjectsDir(info.projectsDir);
      setHiddenDemos(info.hiddenDemos ?? {});
    } catch (e) {
      toast(`Could not list projects: ${e instanceof Error ? e.message : e}`, 'error');
      setProjects([]);
      setSpaces([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  // hosted version: someone created or deleted something
  useEffect(() => {
    const on = () => void refresh();
    window.addEventListener('prepro:library', on);
    return () => window.removeEventListener('prepro:library', on);
  }, [refresh]);
  useEffect(() => {
    if (!tabAllowed(tab)) {
      const first = ALL_TABS.find(tabAllowed);
      if (first) setHomeTab(first);
    }
  }, [tab]);

  useCommand('new-project', () => {
    setHomeTab('projects');
    setNewOpen(true);
    return true;
  });
  // Help → Show Demos on the Home Screen
  useCommand('demos-changed', () => {
    refresh();
    return true;
  });
  useCommand('new-business', () => {
    setHomeTab('business');
    setNewBizOpen(true);
    return true;
  });
  useCommand('new-space', () => {
    setHomeTab('spaces');
    setNewSpaceOpen(true);
    return true;
  });

  /** run a demo action (open / reset) with the busy state */
  const demoAction = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  // demo cards: on the home screen until the user removes them; always in the Help menu
  const marketing = spaces?.filter((s) => (s.kind ?? 'marketing') === 'marketing') ?? [];
  const businesses = spaces?.filter((s) => s.kind === 'business') ?? [];
  const otherSpaces = marketing.filter((s) => !s.demo);
  const demoSpace = marketing.find((s) => s.demo);
  const showDemo = !hiddenDemos.project;
  const showDemoSpace = !hiddenDemos.space;

  const removeDemo = async (kind: 'project' | 'space', deleteId?: string) => {
    if (await removeDemoFromHome(kind, { deleteId })) refresh();
  };
  const showDemos = async (show: boolean) => {
    setHiddenDemos(await backend.setDemosHidden({ project: !show, space: !show }));
  };

  const demoMenu = (kind: 'project' | 'space', id?: string): MenuItem[] => [
    { label: 'Open', icon: FolderOpen, onClick: demoAction(kind === 'project' ? openDemo : openDemoSpace) },
    ...(id ? [{ label: 'Reset demo to original…', icon: RotateCcw, onClick: demoAction(kind === 'project' ? confirmResetDemo : confirmResetDemoSpace) }] : []),
    { separator: true },
    { label: 'Remove from home screen', icon: EyeOff, onClick: () => removeDemo(kind) },
    ...(id ? [{ label: backend.kind === 'electron' ? 'Delete demo (Recycle Bin)…' : 'Delete demo…', icon: Trash2, danger: true, onClick: () => removeDemo(kind, id) }] : []),
  ];

  const spaceMenu = (sp: SpaceSummary) => [
    { label: 'Open', icon: FolderOpen, onClick: () => openSpaceById(sp.id) },
    { label: 'Duplicate', icon: Copy, onClick: async () => { await duplicateSpace(sp.id, sp.title); refresh(); } },
    ...(sp.path && backend.reveal ? [{ label: 'Show in folder', icon: FolderOpen, onClick: () => backend.reveal!(sp.path!) }] : []),
    { separator: true },
    {
      label: backend.kind === 'electron' ? 'Move to Recycle Bin…' : 'Delete…',
      icon: Trash2,
      danger: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: `Delete “${sp.title}”?`,
          message: backend.kind === 'electron' ? 'The space folder will be moved to the Recycle Bin. You can restore it from there.' : 'This permanently removes the space from this browser.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (ok) {
          await deleteSpace(sp.id);
          refresh();
        }
      },
    },
  ];

  const others = projects?.filter((p) => !p.demo) ?? [];
  const demo = projects?.find((p) => p.demo);

  const cardMenu = (p: ProjectSummary) => [
    { label: 'Open', icon: FolderOpen, onClick: () => openProjectById(p.id) },
    { label: 'Duplicate', icon: Copy, onClick: async () => { await duplicateProject(p.id, p.title); refresh(); } },
    { label: 'Export archive (.zip)…', icon: Archive, onClick: () => exportArchive(p.id, p.title) },
    ...(p.path && backend.reveal ? [{ label: 'Show in folder', icon: FolderOpen, onClick: () => backend.reveal!(p.path!) }] : []),
    { separator: true },
    {
      label: backend.kind === 'electron' ? 'Move to Recycle Bin…' : 'Delete…',
      icon: Trash2,
      danger: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: `Delete “${p.title}”?`,
          message: backend.kind === 'electron' ? 'The project folder will be moved to the Recycle Bin. You can restore it from there.' : 'This permanently removes the project from this browser.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (ok) {
          await deleteProject(p.id);
          refresh();
        }
      },
    },
  ];

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-hero">
          <div className="brand">
            <div className="brand-mark">
              <Clapperboard size={24} />
            </div>
            <div>
              <h1>PrePro Studio</h1>
              <p>{account ? <>Signed in as {account.email}{account.owner ? ' (owner)' : ''}</> : 'Pre-production & post planning — everything stays on this computer.'}</p>
            </div>
          </div>
          <div className="spacer" />
          {tab === 'projects' ? (
            <>
              <Button icon={FileInput} onClick={async () => { await importScriptAsNewProject(); }}>
                Import script
              </Button>
              <Button icon={Upload} onClick={async () => { const id = await importArchive(); if (id) refresh(); }}>
                Import archive
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
                New production
              </Button>
            </>
          ) : tab === 'spaces' ? (
            <Button variant="primary" icon={Plus} onClick={() => setNewSpaceOpen(true)}>
              New marketing space
            </Button>
          ) : tab === 'business' ? (
            <Button variant="primary" icon={Plus} onClick={() => setNewBizOpen(true)}>
              New business
            </Button>
          ) : null}
        </div>

        <div className="home-tabs">
          <HomeTabBar tab={tab} counts={{ projects: others.length, spaces: otherSpaces.length, business: businesses.length }} />
          <span className="muted small">{TAB_HINTS[tab]}</span>
        </div>

        {tab === 'business' ? (
          spaces === null ? (
            <div className="muted">Loading…</div>
          ) : businesses.length === 0 ? (
            <div className="card" style={{ padding: 12 }}>
              <EmptyState
                icon={BriefcaseBusiness}
                title="Run the business side of things"
                description="A space for each side hustle, business you're part of or income stream: income and clients, contractors and what you agreed to pay, legal documents, invoices, expenses and time — linked to the Marketing Spaces and Productions it runs."
                action={
                  <Button variant="primary" icon={Plus} onClick={() => setNewBizOpen(true)}>
                    New business
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="project-grid">
              <button className="new-card" onClick={() => setNewBizOpen(true)}>
                <Plus size={26} />
                New business
              </button>
              {businesses.map((sp) => (
                <SpaceCard key={sp.id} sp={sp} menu={spaceMenu(sp)} hint={sp.description?.trim() || BUSINESS_TYPES.find((t) => t.value === sp.subtype)?.description} badge={BUSINESS_TYPES.find((t) => t.value === sp.subtype)?.label ?? 'Business'} />
              ))}
            </div>
          )
        ) : tab === 'finance' ? (
          <Suspense fallback={<div className="muted">Loading…</div>}>
            <FinanceHomePanel />
          </Suspense>
        ) : tab === 'training' ? (
          <Suspense fallback={<div className="muted">Loading…</div>}>
            <TrainingHomePanel />
          </Suspense>
        ) : tab === 'spaces' ? (
          spaces === null ? (
            <div className="muted">Loading spaces…</div>
          ) : otherSpaces.length === 0 && !showDemoSpace ? (
            <div className="card" style={{ padding: 12 }}>
              <EmptyState
                icon={Megaphone}
                title="Create your first marketing space"
                description={`A space for each marketing goal: your personal brand, a channel, a film's release campaign. Plan the strategy, brainstorm, write and produce multiformat content, schedule it on a visual calendar and track results.${DEMO_HINT_SPACE}`}
                action={
                  <Button variant="primary" icon={Plus} onClick={() => setNewSpaceOpen(true)}>
                    New marketing space
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="project-grid">
              <button className="new-card" onClick={() => setNewSpaceOpen(true)}>
                <Plus size={26} />
                New marketing space
              </button>
              {showDemoSpace &&
                (demoSpace ? (
                  <SpaceCard key={demoSpace.id} sp={demoSpace} menu={demoMenu('space', demoSpace.id)} hint={DEMO_CARD_HINT} />
                ) : (
                  <DemoCard kind="space" busy={busy} onOpen={demoAction(openDemoSpace)} menu={demoMenu('space')} />
                ))}
              {otherSpaces.map((sp) => (
                <SpaceCard key={sp.id} sp={sp} menu={spaceMenu(sp)} />
              ))}
            </div>
          )
        ) : (
        <>

        {projects === null ? (
          <div className="muted">Loading productions…</div>
        ) : others.length === 0 && !showDemo ? (
          <div className="card" style={{ padding: 12 }}>
            <EmptyState
              icon={Clapperboard}
              title="Start your first production"
              description={`Create a production for each video. Write the script, build storyboards and shot lists, plan lighting, cast and crew, schedule the shoot, send call sheets and plan post — then print or export everything as PDF.${DEMO_HINT_PROJECT}`}
              action={
                <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
                  New production
                </Button>
              }
            />
          </div>
        ) : (
          <div className="project-grid">
            <button className="new-card" onClick={() => setNewOpen(true)}>
              <Plus size={26} />
              New production
            </button>
            {showDemo &&
              (demo ? (
                <ProjectCard key={demo.id} p={demo} menu={demoMenu('project', demo.id)} hint={DEMO_CARD_HINT} />
              ) : (
                <DemoCard kind="project" busy={busy} onOpen={demoAction(openDemo)} menu={demoMenu('project')} />
              ))}
            {others.map((p) => (
              <ProjectCard key={p.id} p={p} menu={cardMenu(p)} />
            ))}
          </div>
        )}
        </>
        )}

        <div className="row" style={{ marginTop: 36, gap: 12, flexWrap: 'wrap' }}>
          {backend.kind !== 'electron' && (
            <Menu
              align="start"
              trigger={
                <Button size="sm" variant="ghost" icon={CircleHelp} disabled={busy}>
                  {busy ? 'Opening demo…' : 'Help'}
                </Button>
              }
              items={[
                { label: 'Open demo project', icon: Sparkles, onClick: demoAction(openDemo) },
                { label: 'Open demo marketing space', icon: Sparkles, onClick: demoAction(openDemoSpace) },
                { separator: true },
                { label: 'Reset demo project…', icon: RotateCcw, onClick: demoAction(confirmResetDemo) },
                { label: 'Reset demo marketing space…', icon: RotateCcw, onClick: demoAction(confirmResetDemoSpace) },
                { separator: true },
                { label: 'Show demos on the home screen', checked: showDemo && showDemoSpace, onClick: () => showDemos(!(showDemo && showDemoSpace)) },
              ]}
            />
          )}
          {isCloud && account?.owner && (
            <Button size="sm" variant="ghost" icon={Users} onClick={() => window.open('/team', '_blank', 'noopener')}>
              Team and access
            </Button>
          )}
          {(window.prepro?.mcp || isCloud) && (
            <Button size="sm" variant="ghost" icon={Bot} onClick={openAgentDialog}>
              Connect an AI agent
            </Button>
          )}
          {isCloud && (
            <Button size="sm" variant="ghost" icon={LogOut} onClick={() => (location.href = '/logout')}>
              Sign out
            </Button>
          )}
          <div className="spacer" />
          {projectsDir && (
            <span className="muted small row" style={{ gap: 6 }}>
              Studio folder: <span className="mono">{projectsDir}</span>
              {backend.openPath && (
                <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => backend.openPath!(projectsDir)}>
                  Open
                </Button>
              )}
              {backend.chooseProjectsDir && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const dir = await backend.chooseProjectsDir!();
                    if (dir) {
                      toast('Studio folder changed');
                      refresh();
                    }
                  }}
                >
                  Change…
                </Button>
              )}
            </span>
          )}
          <Menu
            align="end"
            trigger={<Button size="sm" variant="ghost" icon={ThemeIcon}>Theme</Button>}
            items={[
              { label: 'System', checked: theme === 'system', onClick: () => setTheme('system') },
              { label: 'Light', checked: theme === 'light', onClick: () => setTheme('light') },
              { label: 'Dark', checked: theme === 'dark', onClick: () => setTheme('dark') },
            ]}
          />
        </div>
      </div>
      <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <NewSpaceDialog open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} />
      <NewBusinessDialog open={newBizOpen} onClose={() => setNewBizOpen(false)} />
    </div>
  );
}

function ProjectCard({ p, menu, hint }: { p: ProjectSummary; menu: any[]; hint?: string }) {
  const poster = p.poster ? backend.assetUrl(p.id, p.poster) : '';
  const status = PROJECT_STATUSES.find((s) => s.value === p.status);
  return (
    <div className="project-card" onClick={() => openProjectById(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openProjectById(p.id)}>
      <div className="cover" style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 55%, #000))` }}>
        {poster && <img src={poster} alt="" />}
        {!poster && <span className="initial">{p.title.slice(0, 1).toUpperCase()}</span>}
        <div className="card-menu" onClick={(e) => e.stopPropagation()}>
          <Menu align="end" trigger={<button className="btn sm icon" aria-label="Project actions"><MoreHorizontal /></button>} items={menu} />
        </div>
      </div>
      <div className="info">
        <h3 className="ellipsis">{p.title}</h3>
        <div className="row" style={{ gap: 6 }}>
          {p.demo && <Badge tone="accent">Demo</Badge>}
          {status && <Badge color={status.color}>{status.label}</Badge>}
          <span className="meta">{optionLabel(PROJECT_TYPES, p.projectType)}</span>
        </div>
        <div className="meta">{hint ?? `Edited ${fmt.dateMedium(p.updatedAt.slice(0, 10))}`}</div>
      </div>
    </div>
  );
}

/** Demo card shown until the demo has been built (click builds and opens it). */
function DemoCard({ kind, busy, onOpen, menu }: { kind: 'project' | 'space'; busy: boolean; onOpen: () => void; menu: MenuItem[] }) {
  const project = kind === 'project';
  return (
    <div className={`project-card ${project ? '' : 'space-card'}`} onClick={() => !busy && onOpen()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && !busy && onOpen()}>
      <div className="cover" style={{ background: project ? 'linear-gradient(135deg, #8a6dff, #e8590c)' : 'linear-gradient(135deg, #e8590c, #3b1a6e)' }}>
        <span className="initial" style={{ fontSize: 22, letterSpacing: '0.12em' }}>
          DEMO
        </span>
        <div className="card-menu" onClick={(e) => e.stopPropagation()}>
          <Menu align="end" trigger={<button className="btn sm icon" aria-label="Demo actions"><MoreHorizontal /></button>} items={menu} />
        </div>
      </div>
      <div className="info">
        <h3 className="ellipsis">{project ? 'The Last Take — demo production' : 'The Last Take — release campaign'}</h3>
        <div className="row" style={{ gap: 6 }}>
          <Badge tone="accent">Demo</Badge>
          <span className="meta">{project ? 'Every module filled in' : 'Every screen filled in'}</span>
        </div>
        <div className="meta">{busy ? 'Building the demo…' : DEMO_CARD_HINT}</div>
      </div>
    </div>
  );
}

function SpaceCard({ sp, menu, hint, badge }: { sp: SpaceSummary; menu: any[]; hint?: string; badge?: string }) {
  const cover = sp.cover ? backend.assetUrl(sp.id, sp.cover) : '';
  const type = SPACE_TYPES.find((t) => t.value === sp.type);
  const stats = [
    sp.contentCount ? `${sp.contentCount} piece${sp.contentCount === 1 ? '' : 's'}` : 'No content yet',
    sp.publishedCount ? `${sp.publishedCount} published` : '',
    sp.nextPost ? `next post ${fmt.dateMedium(sp.nextPost)}` : '',
  ].filter(Boolean);
  return (
    <div className="project-card space-card" onClick={() => openSpaceById(sp.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openSpaceById(sp.id)}>
      <div className="cover" style={{ background: `linear-gradient(135deg, ${sp.color}, color-mix(in srgb, ${sp.color} 45%, #000))` }}>
        {cover && <img src={cover} alt="" />}
        {!cover && <span className="initial">{sp.emoji || sp.title.slice(0, 1).toUpperCase()}</span>}
        <div className="card-menu" onClick={(e) => e.stopPropagation()}>
          <Menu align="end" trigger={<button className="btn sm icon" aria-label="Space actions"><MoreHorizontal /></button>} items={menu} />
        </div>
      </div>
      <div className="info">
        <h3 className="ellipsis">{sp.title}</h3>
        <div className="row" style={{ gap: 6 }}>
          <Badge color={sp.color}>{badge ?? type?.label ?? 'Space'}</Badge>
          {sp.demo && <Badge tone="accent">Demo</Badge>}
        </div>
        <div className={hint ? 'meta' : 'meta ellipsis'}>{hint ?? stats.join(' · ')}</div>
      </div>
    </div>
  );
}

const TAB_HINTS: Record<HomeTab, string> = {
  projects: 'Productions: one video or film, its script, team, shoot and post.',
  spaces: 'Ongoing marketing: strategy, multiformat content, calendar and results.',
  business: 'The business side: income, clients, contractors, agreements, invoices, expenses and time.',
  finance: 'Your money: statements, spending, budgets, plans and advice. Locked with your PIN.',
  training: 'Meals, macros, workouts, body metrics, daily progress photos and your coach.',
};

/** Productions · Spaces ▾ (Marketing Spaces / Business Management) · Personal Finances · Training */
function HomeTabBar({ tab, counts }: { tab: HomeTab; counts: { projects: number; spaces: number; business: number } }) {
  const spacesSub: 'spaces' | 'business' = tab === 'business' || tab === 'spaces' ? tab : readLS<'spaces' | 'business'>('prepro.homeSpacesSub', 'spaces');
  const go = (t: HomeTab) => {
    if (t === 'spaces' || t === 'business') writeLS('prepro.homeSpacesSub', t);
    setHomeTab(t);
  };
  const inSpaces = tab === 'spaces' || tab === 'business';
  const spaceTabs = (['spaces', 'business'] as const).filter(tabAllowed);
  const Count = ({ n }: { n: number }) => (n > 0 ? <span className="count">{n}</span> : null);
  return (
    <div className="tabs home-tabbar" role="tablist">
      {tabAllowed('projects') && <button type="button" role="tab" aria-selected={tab === 'projects'} className={tab === 'projects' ? 'on' : ''} onClick={() => go('projects')}>
        <Clapperboard />
        Productions
        <Count n={counts.projects} />
      </button>}
      {spaceTabs.length === 1 && (
        <button type="button" role="tab" aria-selected={inSpaces} className={inSpaces ? 'on' : ''} onClick={() => go(spaceTabs[0])}>
          {spaceTabs[0] === 'business' ? <BriefcaseBusiness /> : <Megaphone />}
          {spaceTabs[0] === 'business' ? 'Business Management' : 'Marketing Spaces'}
          <Count n={spaceTabs[0] === 'business' ? counts.business : counts.spaces} />
        </button>
      )}
      {spaceTabs.length === 2 && <span className={`home-tab-split ${inSpaces ? 'on' : ''}`}>
        <button type="button" role="tab" aria-selected={inSpaces} className={inSpaces ? 'on' : ''} onClick={() => go(spacesSub)}>
          {spacesSub === 'business' ? <BriefcaseBusiness /> : <Megaphone />}
          {spacesSub === 'business' ? 'Business Management' : 'Marketing Spaces'}
          <Count n={spacesSub === 'business' ? counts.business : counts.spaces} />
        </button>
        <Menu
          align="start"
          trigger={
            <button type="button" className={`home-tab-caret ${inSpaces ? 'on' : ''}`} aria-label="Choose spaces">
              <ChevronDown />
            </button>
          }
          items={[
            { header: 'Spaces' },
            { label: `Marketing Spaces${counts.spaces ? ` (${counts.spaces})` : ''}`, icon: Megaphone, checked: tab === 'spaces', onClick: () => go('spaces') },
            { label: `Business Management${counts.business ? ` (${counts.business})` : ''}`, icon: BriefcaseBusiness, checked: tab === 'business', onClick: () => go('business') },
          ]}
        />
      </span>}
      {tabAllowed('finance') && <button type="button" role="tab" aria-selected={tab === 'finance'} className={tab === 'finance' ? 'on' : ''} onClick={() => go('finance')}>
        <Wallet />
        Personal Finances
      </button>}
      {tabAllowed('training') && <button type="button" role="tab" aria-selected={tab === 'training'} className={tab === 'training' ? 'on' : ''} onClick={() => go('training')}>
        <Dumbbell />
        Training
      </button>}
    </div>
  );
}
