/* Workspace of an open space (any kind): sidebar + the active module; Marketing
   Spaces also host the content editor (which opens over any module). */
import { Component, Suspense, type ReactNode } from 'react';
import { Folder, FolderOpen, Home as HomeIcon, Keyboard, Loader2, Lock, LockKeyhole, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Redo2, Settings, Sun, TriangleAlert, Undo2 } from 'lucide-react';
import { groupsFor, moduleDefFor, modulesFor } from '@/spaces/registry';
import { KIND_INFO } from '@/spaces/kinds';
import { lockFinances, requestFinanceUnlock, useFinanceLock } from '@/spaces/finance/lock';
import { SPACE_TYPES } from '@/spaces/constants';
import { ContentEditorHost } from '@/spaces/modules/content/ContentEditor';
import { navigateSpace, setTheme, toggleSidebar, useApp } from '@/store/app';
import { spaceRedo, spaceUndo, useCanRedoSpace, useCanUndoSpace, useSpace, useSpaceStore } from '@/store/space';
import { optionLabel } from '@/lib/constants';
import { assetUrl, backend } from '@/backend';
import { Button, IconButton, Menu } from '@/ui';
import { AgentIndicator } from './AgentDialog';
import { PHONE_TABS, PhoneNavBackdrop, PhoneTabBar } from './PhoneNav';
import { isPhone, useIsPhone } from '@/ui/phone';
import { leaveSpace } from './spaceActions';
import '@/spaces/mind';

class SpaceModuleBoundary extends Component<{ children: ReactNode; moduleId: string }, { error: Error | null }> {
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

function SpaceSaveState() {
  const appStatus = useApp((s) => s.saveStatus);
  const err = useApp((s) => s.saveError);
  const clean = useSpaceStore((s) => s.version === s.savedVersion);
  const status = appStatus === 'error' || appStatus === 'saving' ? appStatus : clean ? 'saved' : 'idle';
  const label = status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : status === 'idle' ? 'Unsaved' : 'Saved';
  return (
    <div className={`save-state ${status}`} title={status === 'error' ? err : 'Saved automatically'}>
      <span className="dot" />
      <span>{label}</span>
    </div>
  );
}

function SpaceSidebar() {
  const moduleId = useApp((s) => s.spaceModuleId);
  const collapsed = useApp((s) => s.sidebarCollapsed) && !isPhone();
  const theme = useApp((s) => s.theme);
  const meta = useSpace((s) => s.meta);
  const spaceId = useSpace((s) => s.id);
  const contentCount = useSpace((s) => s.content.length);
  const kind = useSpace((s) => s.meta.kind ?? 'marketing');
  const info = KIND_INFO[kind];
  const modules = modulesFor(kind);
  const canUndo = useCanUndoSpace();
  const canRedo = useCanRedoSpace();
  // the emoji reads best at this size; otherwise the cover (or a square logo)
  const logo = meta.emoji ? '' : assetUrl(meta.cover || meta.logo);
  return (
    <aside className="sidebar space-sidebar">
      <div className="sidebar-top">
        <Menu
          trigger={
            <button className="project-switch" title={meta.title}>
              <span className="swatch-lg" style={{ background: meta.color }}>
                {logo ? <img src={logo} alt="" /> : meta.emoji || meta.title.slice(0, 1).toUpperCase()}
              </span>
              <span className="ptext" style={{ minWidth: 0 }}>
                <div className="ptitle ellipsis">{meta.title}</div>
                <div className="ptype">{kind === 'marketing' ? `Marketing space · ${optionLabel(SPACE_TYPES, meta.type)}` : info.label}</div>
              </span>
            </button>
          }
          items={[
            { label: 'Library', icon: HomeIcon, shortcut: 'Ctrl+Shift+H', onClick: () => leaveSpace() },
            { label: 'Space settings', icon: Settings, shortcut: 'Ctrl+,', onClick: () => navigateSpace('settings') },
            ...(kind === 'finance' ? [{ label: 'Lock finances', icon: Lock, onClick: () => lockFinances() }] : []),
            ...(backend.openProjectFolder ? [{ label: 'Open space folder', icon: FolderOpen, onClick: () => backend.openProjectFolder!(spaceId) }] : []),
            { separator: true },
            { label: 'Keyboard shortcuts', icon: Keyboard, shortcut: 'F1', onClick: () => useApp.setState({ shortcutsOpen: true }) },
          ]}
        />
      </div>
      <nav className="sidebar-nav">
        {groupsFor(kind).map((g) => (
          <div className="nav-group" key={g}>
            <div className="nav-group-label">{g}</div>
            {modules.filter((m) => m.group === g && m.id !== 'settings').map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.id} className={`nav-item ${moduleId === m.id ? 'active' : ''}`} onClick={() => navigateSpace(m.id)} title={collapsed ? m.label : m.description}>
                  <Icon />
                  <span>{m.label}</span>
                  {m.id === 'content' && contentCount > 0 && !collapsed && <span className="nav-badge">{contentCount}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="nav-group">
          {kind === 'finance' && (
            <button className="nav-item" onClick={() => lockFinances()} title="Lock your finances now">
              <Lock />
              <span>Lock finances</span>
            </button>
          )}
          <button className={`nav-item ${moduleId === 'settings' ? 'active' : ''}`} onClick={() => navigateSpace('settings')} title="Settings">
            <Settings />
            <span>{kind === 'marketing' ? 'Space Settings' : 'Settings'}</span>
          </button>
          <button className="nav-item" onClick={() => leaveSpace()} title="Back to the library">
            <Folder />
            <span>Library</span>
          </button>
        </div>
      </nav>
      {window.prepro?.mcp && (
        <div className="sidebar-agent">
          <AgentIndicator compact={collapsed} />
        </div>
      )}
      <div className="sidebar-bottom">
        <SpaceSaveState />
        <IconButton icon={Undo2} label="Undo (Ctrl+Z)" size="sm" disabled={!canUndo} onClick={() => spaceUndo()} />
        <IconButton icon={Redo2} label="Redo (Ctrl+Y)" size="sm" disabled={!canRedo} onClick={() => spaceRedo()} />
        <Menu
          align="end"
          trigger={<IconButton icon={theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor} label="Theme" size="sm" />}
          items={[
            { label: 'System', checked: theme === 'system', onClick: () => setTheme('system') },
            { label: 'Light', checked: theme === 'light', onClick: () => setTheme('light') },
            { label: 'Dark', checked: theme === 'dark', onClick: () => setTheme('dark') },
          ]}
        />
        <IconButton icon={collapsed ? PanelLeftOpen : PanelLeftClose} label="Toggle sidebar (Ctrl+\)" size="sm" onClick={toggleSidebar} />
      </div>
    </aside>
  );
}

/** Personal Finances open while the screen is locked (an agent opened them, or the
   user locked them): cover the numbers until the PIN is entered. */
function FinanceLockCover() {
  return (
    <div className="empty" style={{ flex: 1 }}>
      <div className="empty-icon">
        <LockKeyhole />
      </div>
      <h3>Personal Finances are locked</h3>
      <p className="muted small">Enter your PIN to see them. Connected AI agents can keep working while the screen is locked.</p>
      <Button variant="primary" onClick={() => void requestFinanceUnlock()}>
        Unlock
      </Button>
    </div>
  );
}

export function SpaceWorkspace() {
  const moduleId = useApp((s) => s.spaceModuleId);
  const phone = useIsPhone();
  const collapsed = useApp((s) => s.sidebarCollapsed) && !phone;
  const navOpen = useApp((s) => s.navOpen);
  const kind = useSpace((s) => s.meta.kind ?? 'marketing');
  const finLocked = useFinanceLock((s) => !s.unlocked) && kind === 'finance';
  const def = moduleDefFor(kind, moduleId);
  const Comp = def.component;
  const tabs = PHONE_TABS[kind].map((t) => {
    const m = moduleDefFor(kind, t.id);
    return { id: t.id, label: t.label ?? m.label, icon: m.icon };
  });
  return (
    <div className={`app space-app kind-${kind} ${collapsed ? 'sidebar-collapsed' : ''} ${navOpen ? 'nav-open' : ''}`}>
      <SpaceSidebar />
      <PhoneNavBackdrop />
      <main className="main">
        <SpaceModuleBoundary moduleId={moduleId}>
          <Suspense
            fallback={
              <div className="module-loading">
                <Loader2 className="spin" size={18} /> Loading…
              </div>
            }
          >
            {finLocked ? <FinanceLockCover /> : <Comp key={moduleId} />}
          </Suspense>
        </SpaceModuleBoundary>
      </main>
      {phone && <PhoneTabBar tabs={tabs} active={moduleId} onSelect={(id) => navigateSpace(id)} />}
      {kind === 'marketing' && <ContentEditorHost />}
    </div>
  );
}
