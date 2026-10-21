import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { MODULE_BY_ID } from '@/modules/registry';
import { navigate, navigateSpace, toggleSidebar, useApp, type ModuleId } from '@/store/app';
import { redo, undo, useProjectStore } from '@/store/project';
import { spaceRedo, spaceUndo, useSpaceStore } from '@/store/space';
import { flushSave, startAutosave } from '@/store/autosave';
import { startSpaceAutosave } from '@/store/spaceAutosave';
import { runCommand } from '@/lib/commands';
import { backend } from '@/backend';
import { Button, ContextMenuHost, DialogHost, ToastHost, isModalOpen, toast } from '@/ui';
import { PrintPreviewHost } from '@/print/PrintPreview';
import { Home } from './Home';
import { Sidebar } from './Sidebar';
import { ShortcutsDialog } from './ShortcutsDialog';
import { AgentDialog } from './AgentDialog';
import { SpaceWorkspace } from './SpaceWorkspace';
import { PHONE_TABS, PhoneNavBackdrop, PhoneTabBar } from './PhoneNav';
import { useIsPhone } from '@/ui/phone';
import { FinanceLockHost, useFinanceLock } from '@/spaces/finance/lock';

// automated tests (isolated data folder + explicit flag): start with the finances unlocked
void backend.info().then((i) => {
  if (i.testUnlockFinances || (window as any).prepro?.selftest) useFinanceLock.setState({ unlocked: true, lastActive: Date.now() });
}).catch(() => {});
import { confirmResetDemoSpace, leaveSpace, openDemoSpace, openSingleton } from './spaceActions';
import { initAgentActivity, openAgentDialog } from '@/agent/state';
import { confirmResetDemo, exportArchive, importArchive, importScriptAsNewProject, leaveProject, openDemo, reopenLastProject, revealCurrentProject } from './projectActions';

/* ---------------------------------------------------------------- theme */

function useThemeEffect() {
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/* ---------------------------------------------------------------- commands */

function inProject() {
  return useApp.getState().view === 'project' && !!useProjectStore.getState().project;
}

function inSpace() {
  return useApp.getState().view === 'space' && !!useSpaceStore.getState().space;
}

export function handleCommand(cmd: string) {
  // let the active module handle it first (e.g. script editor 'find', 'print')
  if (runCommand(cmd)) return;
  switch (cmd) {
    case 'undo':
      if (inProject()) undo();
      else if (inSpace()) spaceUndo();
      break;
    case 'redo':
      if (inProject()) redo();
      else if (inSpace()) spaceRedo();
      break;
    case 'save':
      if (inProject() || inSpace()) flushSave().then(() => toast('Saved'));
      break;
    case 'home':
      if (inProject()) leaveProject();
      else if (inSpace()) leaveSpace();
      break;
    case 'new-project':
      if (inProject()) leaveProject().then(() => setTimeout(() => runCommand('new-project'), 50));
      else if (inSpace()) leaveSpace().then(() => setTimeout(() => runCommand('new-project'), 50));
      break;
    case 'new-space':
      if (inProject()) leaveProject().then(() => setTimeout(() => runCommand('new-space'), 50));
      else if (inSpace()) leaveSpace().then(() => setTimeout(() => runCommand('new-space'), 50));
      else runCommand('new-space');
      break;
    case 'new-business':
      if (inProject()) leaveProject().then(() => setTimeout(() => runCommand('new-business'), 50));
      else if (inSpace()) leaveSpace().then(() => setTimeout(() => runCommand('new-business'), 50));
      else runCommand('new-business');
      break;
    case 'open-finances':
      void openSingleton('finance');
      break;
    case 'open-training':
      void openSingleton('training');
      break;
    case 'import-script':
      if (inProject()) navigate('script', { import: Date.now() });
      else importScriptAsNewProject();
      break;
    case 'export-archive': {
      const p = useProjectStore.getState().project;
      if (p) exportArchive(p.id, p.meta.title);
      else toast('Open a project first (or use the card menu in the library).', 'info');
      break;
    }
    case 'import-archive':
      importArchive();
      break;
    case 'print':
    case 'print-center':
      if (inProject()) navigate('printcenter');
      else if (inSpace()) navigateSpace('print');
      break;
    case 'project-folder': {
      const sp = useSpaceStore.getState().space;
      if (inSpace() && sp && backend.openProjectFolder) backend.openProjectFolder(sp.id);
      else revealCurrentProject();
      break;
    }
    case 'settings':
      if (inProject()) navigate('settings');
      else if (inSpace()) navigateSpace('settings');
      break;
    case 'toggle-sidebar':
      toggleSidebar();
      break;
    case 'shortcuts':
      useApp.setState({ shortcutsOpen: true });
      break;
    case 'open-demo':
      openDemo();
      break;
    case 'open-demo-space':
      openDemoSpace();
      break;
    case 'reset-demo':
      confirmResetDemo();
      break;
    case 'reset-demo-space':
      confirmResetDemoSpace();
      break;
    case 'agent-connect':
      openAgentDialog();
      break;
    case 'guide':
      useApp.setState({ shortcutsOpen: true });
      break;
  }
}

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function ownsUndo(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el?.closest?.('.ProseMirror, [data-own-undo]');
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'F1') {
        e.preventDefault();
        handleCommand('shortcuts');
        return;
      }
      if (!mod) return;
      if (k === 'z' && !e.shiftKey) {
        if (ownsUndo(e.target) || isModalOpen()) return;
        e.preventDefault();
        handleCommand('undo');
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        if (ownsUndo(e.target) || isModalOpen()) return;
        e.preventDefault();
        handleCommand('redo');
      } else if (k === 's' && !e.shiftKey) {
        e.preventDefault();
        handleCommand('save');
      } else if (k === 'p' && !e.shiftKey) {
        e.preventDefault();
        handleCommand('print');
      } else if (k === 'f' && !e.shiftKey) {
        if (runCommand('find')) e.preventDefault();
      } else if (k === 'n' && e.shiftKey) {
        e.preventDefault();
        handleCommand('new-project');
      } else if (k === 'm' && e.shiftKey) {
        e.preventDefault();
        handleCommand('new-space');
      } else if (k === 'h' && e.shiftKey) {
        e.preventDefault();
        handleCommand('home');
      } else if (k === ',') {
        e.preventDefault();
        handleCommand('settings');
      } else if (k === '\\') {
        e.preventDefault();
        handleCommand('toggle-sidebar');
      }
      void isTextTarget;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useDesktopBridge() {
  useEffect(() => {
    const bridge = window.prepro;
    if (!bridge) return;
    const offMenu = bridge.onMenuCommand((cmd) => handleCommand(cmd));
    const offClose = bridge.onRequestClose(async () => {
      try {
        await flushSave();
      } finally {
        bridge.closeReady();
      }
    });
    return () => {
      offMenu();
      offClose();
    };
  }, []);
}

/* ---------------------------------------------------------------- error boundary */

class ModuleBoundary extends Component<{ children: ReactNode; moduleId: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { moduleId: string }) {
    if (prev.moduleId !== this.props.moduleId && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty" style={{ flex: 1 }}>
          <div className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <TriangleAlert />
          </div>
          <h3>Something went wrong in this screen</h3>
          <p className="mono small">{this.state.error.message}</p>
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------- workspace */

function Workspace() {
  const moduleId = useApp((s) => s.moduleId);
  const phone = useIsPhone();
  const collapsed = useApp((s) => s.sidebarCollapsed) && !phone;
  const navOpen = useApp((s) => s.navOpen);
  const def = MODULE_BY_ID[moduleId] ?? MODULE_BY_ID.overview;
  const Comp = def.component;
  const tabs = PHONE_TABS.project.map((t) => {
    const m = MODULE_BY_ID[t.id as ModuleId];
    return { id: t.id, label: t.label ?? m.label, icon: m.icon };
  });
  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar />
      <PhoneNavBackdrop />
      <main className="main">
        <ModuleBoundary moduleId={moduleId}>
          <Suspense
            fallback={
              <div className="module-loading">
                <Loader2 className="spin" size={18} /> Loading…
              </div>
            }
          >
            <Comp key={moduleId} />
          </Suspense>
        </ModuleBoundary>
      </main>
      {phone && <PhoneTabBar tabs={tabs} active={moduleId} onSelect={(id) => navigate(id as ModuleId)} />}
    </div>
  );
}

export function App() {
  useThemeEffect();
  useGlobalKeys();
  useDesktopBridge();
  useEffect(() => {
    startAutosave();
    startSpaceAutosave();
    reopenLastProject();
    // local MCP server for AI agents: the tools live in a lazily loaded chunk
    if (window.prepro?.mcp) {
      initAgentActivity();
      import('@/agent').then((m) => m.startAgentServer());
    }
  }, []);
  const view = useApp((s) => s.view);
  const hasProject = useProjectStore((s) => !!s.project);
  const hasSpace = useSpaceStore((s) => !!s.space);
  return (
    <>
      {view === 'project' && hasProject ? <Workspace /> : view === 'space' && hasSpace ? <SpaceWorkspace /> : <Home />}
      <PrintPreviewHost />
      <ShortcutsDialog />
      <AgentDialog />
      <FinanceLockHost />
      <DialogHost />
      <ContextMenuHost />
      <ToastHost />
    </>
  );
}
