import { Archive, FolderOpen, Home as HomeIcon, Keyboard, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Redo2, Settings, Sun, Undo2 } from 'lucide-react';
import { MODULES, type ModuleDef } from '@/modules/registry';
import { navigate, setTheme, toggleSidebar, useApp } from '@/store/app';
import { redo, undo, useCanRedo, useCanUndo, useProject, useProjectStore } from '@/store/project';
import { PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { assetUrl, backend } from '@/backend';
import { IconButton, Menu } from '@/ui';
import { exportArchive, leaveProject, revealCurrentProject } from './projectActions';
import { AgentIndicator } from './AgentDialog';

const GROUPS: ModuleDef['group'][] = ['Overview', 'Writing', 'Visuals', 'People', 'Production', 'Post', 'Output'];

export function Sidebar() {
  const moduleId = useApp((s) => s.moduleId);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const theme = useApp((s) => s.theme);
  const meta = useProject((p) => p.meta);
  const projectId = useProject((p) => p.id);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const logo = assetUrl(meta.logo || meta.poster);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Menu
          trigger={
            <button className="project-switch" title={meta.title}>
              <span className="swatch-lg" style={{ background: meta.color }}>
                {logo ? <img src={logo} alt="" /> : meta.title.slice(0, 1).toUpperCase()}
              </span>
              <span className="ptext" style={{ minWidth: 0 }}>
                <div className="ptitle ellipsis">{meta.title}</div>
                <div className="ptype">{optionLabel(PROJECT_TYPES, meta.projectType)}</div>
              </span>
            </button>
          }
          items={[
            { label: 'Project library', icon: HomeIcon, shortcut: 'Ctrl+Shift+H', onClick: () => leaveProject() },
            { label: 'Project settings', icon: Settings, shortcut: 'Ctrl+,', onClick: () => navigate('settings') },
            ...(backend.openProjectFolder ? [{ label: 'Open project folder', icon: FolderOpen, onClick: () => revealCurrentProject() }] : []),
            { label: 'Export archive (.zip)…', icon: Archive, onClick: () => exportArchive(projectId, meta.title) },
            { separator: true },
            { label: 'Keyboard shortcuts', icon: Keyboard, shortcut: 'F1', onClick: () => useApp.setState({ shortcutsOpen: true }) },
          ]}
        />
      </div>
      <nav className="sidebar-nav">
        {GROUPS.map((g) => (
          <div className="nav-group" key={g}>
            <div className="nav-group-label">{g}</div>
            {MODULES.filter((m) => m.group === g).map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.id} className={`nav-item ${moduleId === m.id ? 'active' : ''}`} onClick={() => navigate(m.id)} title={collapsed ? m.label : m.description}>
                  <Icon />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {window.prepro?.mcp && (
        <div className="sidebar-agent">
          <AgentIndicator compact={collapsed} />
        </div>
      )}
      <div className="sidebar-bottom">
        <SaveState />
        <IconButton icon={Undo2} label="Undo (Ctrl+Z)" size="sm" disabled={!canUndo} onClick={() => undo()} />
        <IconButton icon={Redo2} label="Redo (Ctrl+Y)" size="sm" disabled={!canRedo} onClick={() => redo()} />
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

function SaveState() {
  const appStatus = useApp((s) => s.saveStatus);
  const err = useApp((s) => s.saveError);
  const clean = useProjectStore((s) => s.version === s.savedVersion);
  const status = appStatus === 'error' || appStatus === 'saving' ? appStatus : clean ? 'saved' : 'idle';
  const label = status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : status === 'idle' ? 'Unsaved' : 'Saved';
  return (
    <div className={`save-state ${status}`} title={status === 'error' ? err : backend.kind === 'electron' ? 'Saved automatically to your projects folder' : 'Saved automatically in this browser'}>
      <span className="dot" />
      <span>{label}</span>
    </div>
  );
}
