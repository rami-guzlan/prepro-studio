/* Modules of a Marketing Space (sidebar). Each lives in src/spaces/modules/<id>/
   with index.tsx (default export: the screen) and optionally print.tsx. */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  Compass,
  FolderKanban,
  Gauge,
  Lightbulb,
  Link2,
  Megaphone,
  Palette,
  Printer,
  Radio,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { SpaceModuleId } from '@/store/app';

export interface SpaceModuleDef {
  id: SpaceModuleId;
  label: string;
  group: 'Plan' | 'Create' | 'Publish' | 'Measure' | 'Library' | 'Output' | 'Space';
  icon: LucideIcon;
  description: string;
  component: LazyExoticComponent<ComponentType>;
}

export const SPACE_MODULES: SpaceModuleDef[] = [
  { id: 'overview', label: 'Overview', group: 'Plan', icon: Gauge, description: 'Goals, pipeline, what’s next', component: lazy(() => import('./modules/overview')) },
  { id: 'strategy', label: 'Strategy', group: 'Plan', icon: Compass, description: 'Goals, audiences, pillars, messaging, tactics', component: lazy(() => import('./modules/strategy')) },
  { id: 'campaigns', label: 'Campaigns & Milestones', group: 'Plan', icon: Megaphone, description: 'Campaign phases, milestones and roadmap', component: lazy(() => import('./modules/campaigns')) },
  { id: 'ideas', label: 'Ideas', group: 'Create', icon: Lightbulb, description: 'Brainstorm board — get it all out', component: lazy(() => import('./modules/ideas')) },
  { id: 'content', label: 'Content', group: 'Create', icon: FolderKanban, description: 'Every piece from idea to published', component: lazy(() => import('./modules/content')) },
  { id: 'production', label: 'Production', group: 'Create', icon: Clapperboard, description: 'Batch shoot days and shot lists', component: lazy(() => import('./modules/production')) },
  { id: 'calendar', label: 'Calendar', group: 'Publish', icon: CalendarDays, description: 'Visual publishing schedule', component: lazy(() => import('./modules/calendar')) },
  { id: 'channels', label: 'Channels', group: 'Publish', icon: Radio, description: 'Platforms, handles and cadence', component: lazy(() => import('./modules/channels')) },
  { id: 'results', label: 'Results', group: 'Measure', icon: BarChart3, description: 'Performance and goal progress', component: lazy(() => import('./modules/results')) },
  { id: 'assets', label: 'Brand Kit & Assets', group: 'Library', icon: Palette, description: 'Logos, colours, fonts, templates', component: lazy(() => import('./modules/assets')) },
  { id: 'projects', label: 'Linked Projects', group: 'Library', icon: Link2, description: 'Productions this space promotes', component: lazy(() => import('./modules/projects')) },
  { id: 'print', label: 'Print & Export', group: 'Output', icon: Printer, description: 'Briefs, calendars, plans as PDF', component: lazy(() => import('./modules/print')) },
  { id: 'settings', label: 'Space Settings', group: 'Space', icon: Settings, description: 'Name, type, look and formats', component: lazy(() => import('./modules/settings')) },
];

export const SPACE_MODULE_BY_ID = Object.fromEntries(SPACE_MODULES.map((m) => [m.id, m])) as Record<SpaceModuleId, SpaceModuleDef>;
export const SPACE_GROUPS: SpaceModuleDef['group'][] = ['Plan', 'Create', 'Publish', 'Measure', 'Library', 'Output'];
