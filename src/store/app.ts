/* App-level UI state: which screen/module is showing, theme, save status,
   and the print-preview request. */
import { create } from 'zustand';

export type ModuleId =
  | 'overview'
  | 'tasks'
  | 'script'
  | 'storyboard'
  | 'shots'
  | 'lighting'
  | 'cast'
  | 'crew'
  | 'contacts'
  | 'locations'
  | 'breakdown'
  | 'elements'
  | 'schedule'
  | 'callsheets'
  | 'gear'
  | 'budget'
  | 'post'
  | 'printcenter'
  | 'settings';

/** Module of the open space. Marketing: overview, strategy, ideas, content, calendar, production,
    campaigns, channels, assets, results, people, projects; every kind: print, settings; other kinds
    declare their own (src/spaces/<kind>/index.ts). */
export type SpaceModuleId = string;

/** Library tabs: Productions, Spaces (Marketing / Business), Personal Finances, Training. */
export type HomeTab = 'projects' | 'spaces' | 'business' | 'finance' | 'training';

export type Theme = 'system' | 'light' | 'dark';

export interface PrintRequest {
  docId: string;
  options?: Record<string, unknown>;
}

interface AppState {
  view: 'home' | 'project' | 'space';
  moduleId: ModuleId;
  /** module of the open Marketing Space */
  spaceModuleId: SpaceModuleId;
  /** library tab */
  homeTab: HomeTab;
  /** optional parameters for the module, e.g. { sceneId } or { dayId } */
  params: Record<string, any>;
  /** increments on every navigate() so modules can react to repeated navigation */
  navKey: number;
  theme: Theme;
  sidebarCollapsed: boolean;
  /** phone layout: the slide-out navigation drawer is open */
  navOpen: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string;
  lastSavedAt?: number;
  print: PrintRequest | null;
  shortcutsOpen: boolean;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export { readLS };

export const useApp = create<AppState>(() => ({
  view: 'home',
  moduleId: 'overview',
  spaceModuleId: 'overview',
  homeTab: readLS<HomeTab>('prepro.homeTab', 'projects'),
  params: {},
  navKey: 0,
  theme: readLS<Theme>('prepro.theme', 'system'),
  sidebarCollapsed: readLS<boolean>('prepro.sidebarCollapsed', false),
  navOpen: false,
  saveStatus: 'idle',
  print: null,
  shortcutsOpen: false,
}));

/** Go to a module of the open project, optionally with params (e.g. navigate('script', { sceneId })). */
export function navigate(moduleId: ModuleId, params: Record<string, any> = {}) {
  useApp.setState((s) => ({ view: 'project', moduleId, params, navKey: s.navKey + 1, navOpen: false }));
  const pid = (window as any).__preproProjectId as string | undefined;
  if (pid) writeLS(`prepro.lastModule.${pid}`, moduleId);
}

/** Go to a module of the open Marketing Space, optionally with params (e.g. navigateSpace('content', { contentId })). */
export function navigateSpace(moduleId: SpaceModuleId, params: Record<string, any> = {}) {
  useApp.setState((s) => ({ view: 'space', spaceModuleId: moduleId, params, navKey: s.navKey + 1, navOpen: false }));
  const sid = (window as any).__preproSpaceId as string | undefined;
  if (sid) writeLS(`prepro.lastSpaceModule.${sid}`, moduleId);
}

export function setHomeTab(tab: HomeTab) {
  writeLS('prepro.homeTab', tab);
  useApp.setState({ homeTab: tab });
}

export function goHome() {
  useApp.setState({ view: 'home', params: {}, navOpen: false });
}

/** Phone layout: open or close the navigation drawer. */
export function setNavOpen(open: boolean) {
  useApp.setState({ navOpen: open });
}

export function setTheme(theme: Theme) {
  writeLS('prepro.theme', theme);
  useApp.setState({ theme });
}

export function toggleSidebar() {
  const v = !useApp.getState().sidebarCollapsed;
  writeLS('prepro.sidebarCollapsed', v);
  useApp.setState({ sidebarCollapsed: v });
}

/** Open the print / export preview for a document id (see src/print/registry.ts). */
export function openPrint(docId: string, options?: Record<string, unknown>) {
  useApp.setState({ print: { docId, options } });
}

export function closePrint() {
  useApp.setState({ print: null });
}
