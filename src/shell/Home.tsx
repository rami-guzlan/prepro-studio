/* Project library: create, open, import, duplicate, archive and delete projects. */
import { useCallback, useEffect, useState } from 'react';
import { Archive, Bot, CircleHelp, Clapperboard, Copy, EyeOff, FileInput, FolderOpen, Megaphone, Moon, MoreHorizontal, Plus, RotateCcw, Sparkles, Sun, Trash2, Upload, Monitor } from 'lucide-react';
import type { SpaceSummary } from '@/spaces/types';
import { SPACE_TYPES } from '@/spaces/constants';
import { openAgentDialog } from '@/agent/state';
import type { ProjectSummary } from '@/types';
import { backend, type HiddenDemos } from '@/backend';
import { PROJECT_STATUSES, PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { makeFormatters } from '@/lib/format';
import { setHomeTab, setTheme, useApp } from '@/store/app';
import { Badge, Button, EmptyState, Menu, Tabs, confirmDialog, toast, type MenuItem } from '@/ui';
import { useCommand } from '@/lib/commands';
import { NewProjectDialog } from './NewProjectDialog';
import { NewSpaceDialog } from './NewSpaceDialog';
import { confirmResetDemoSpace, deleteSpace, duplicateSpace, openDemoSpace, openSpaceById } from './spaceActions';
import { confirmResetDemo, deleteProject, duplicateProject, exportArchive, importArchive, importScriptAsNewProject, openDemo, openProjectById, removeDemoFromHome } from './projectActions';

const fmt = makeFormatters();

/** Where to find the demos once their cards are removed (Help menu of the window; a Help button in the browser build). */
const DEMO_HINT_PROJECT = ' Want to look around first? Help → Open Demo Project.';
const DEMO_HINT_SPACE = ' Want to look around first? Help → Open Demo Marketing Space.';
const DEMO_CARD_HINT = 'Remove it any time — it stays in the Help menu';

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
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
  const otherSpaces = spaces?.filter((s) => !s.demo) ?? [];
  const demoSpace = spaces?.find((s) => s.demo);
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
              <p>Pre-production & post planning — everything stays on this computer.</p>
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
                New project
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={Plus} onClick={() => setNewSpaceOpen(true)}>
              New marketing space
            </Button>
          )}
        </div>

        <div className="home-tabs">
          <Tabs<'projects' | 'spaces'>
            value={tab}
            onChange={setHomeTab}
            tabs={[
              { id: 'projects', label: 'Projects', icon: Clapperboard, count: others.length },
              { id: 'spaces', label: 'Marketing Spaces', icon: Megaphone, count: otherSpaces.length },
            ]}
          />
          <span className="muted small">
            {tab === 'projects' ? 'Productions: one video or film, its script, team, shoot and post.' : 'Ongoing marketing: strategy, multiformat content, calendar and results.'}
          </span>
        </div>

        {tab === 'spaces' ? (
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
          <div className="muted">Loading projects…</div>
        ) : others.length === 0 && !showDemo ? (
          <div className="card" style={{ padding: 12 }}>
            <EmptyState
              icon={Clapperboard}
              title="Start your first production"
              description={`Create a project for each video. Write the script, build storyboards and shot lists, plan lighting, cast and crew, schedule the shoot, send call sheets and plan post — then print or export everything as PDF.${DEMO_HINT_PROJECT}`}
              action={
                <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
                  New project
                </Button>
              }
            />
          </div>
        ) : (
          <div className="project-grid">
            <button className="new-card" onClick={() => setNewOpen(true)}>
              <Plus size={26} />
              New project
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
          {window.prepro?.mcp && (
            <Button size="sm" variant="ghost" icon={Bot} onClick={openAgentDialog}>
              Connect an AI agent
            </Button>
          )}
          <div className="spacer" />
          {projectsDir && (
            <span className="muted small row" style={{ gap: 6 }}>
              Projects folder: <span className="mono">{projectsDir}</span>
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
                      toast('Projects folder changed');
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

function SpaceCard({ sp, menu, hint }: { sp: SpaceSummary; menu: any[]; hint?: string }) {
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
          <Badge color={sp.color}>{type?.label ?? 'Space'}</Badge>
          {sp.demo && <Badge tone="accent">Demo</Badge>}
        </div>
        <div className={hint ? 'meta' : 'meta ellipsis'}>{hint ?? stats.join(' · ')}</div>
      </div>
    </div>
  );
}
