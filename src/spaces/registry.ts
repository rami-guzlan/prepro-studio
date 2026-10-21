/* Sidebar modules of a space, per kind. Marketing modules live in
   src/spaces/modules/<id>/ (index.tsx default export = the screen, optional
   print.tsx); business / finance / training modules are declared by their kind
   (src/spaces/<kind>/index.ts). "settings" is shared by every kind and "print"
   (Print & Export) shows the documents of the open space's kind. */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  Compass,
  FolderKanban,
  Gauge,
  Handshake,
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
import type { SpaceKind } from './types';
import type { SpaceKindDef } from './kinds';
import { businessKind } from './business';
import { financeKind } from './finance';
import { trainingKind } from './training';

export interface SpaceModuleDef {
  id: SpaceModuleId;
  label: string;
  /** sidebar group (see groupsFor(kind) for the order) */
  group: string;
  icon: LucideIcon;
  description: string;
  component: LazyExoticComponent<ComponentType>;
}

/** Shared by every kind. */
export const SETTINGS_MODULE: SpaceModuleDef = { id: 'settings', label: 'Space Settings', group: 'Space', icon: Settings, description: 'Name, look and formats', component: lazy(() => import('./modules/settings')) };
export const PRINT_MODULE: SpaceModuleDef = { id: 'print', label: 'Print & Export', group: 'Output', icon: Printer, description: 'Documents of this space as PDF', component: lazy(() => import('./modules/print')) };

/** Marketing Space modules. */
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
  { id: 'people', label: 'People & Brands', group: 'Measure', icon: Handshake, description: 'Relationships, leads and brand deals', component: lazy(() => import('./modules/people')) },
  { id: 'assets', label: 'Brand Kit & Assets', group: 'Library', icon: Palette, description: 'Logos, colours, fonts, templates', component: lazy(() => import('./modules/assets')) },
  { id: 'projects', label: 'Linked Projects', group: 'Library', icon: Link2, description: 'Productions this space promotes', component: lazy(() => import('./modules/projects')) },
  PRINT_MODULE,
  SETTINGS_MODULE,
];

export const SPACE_MODULE_BY_ID = Object.fromEntries(SPACE_MODULES.map((m) => [m.id, m])) as Record<string, SpaceModuleDef>;
export const SPACE_GROUPS = ['Plan', 'Create', 'Publish', 'Measure', 'Library', 'Output'];

const KIND_DEFS: Record<Exclude<SpaceKind, 'marketing'>, SpaceKindDef> = { business: businessKind, finance: financeKind, training: trainingKind };

/** Modules of a kind (always ending with Print & Export and Space Settings). */
export function modulesFor(kind: SpaceKind): SpaceModuleDef[] {
  if (kind === 'marketing') return SPACE_MODULES;
  const own = KIND_DEFS[kind].modules.filter((m) => m.id !== 'print' && m.id !== 'settings');
  return [...own, PRINT_MODULE, SETTINGS_MODULE];
}

/** Sidebar group order of a kind (settings is drawn separately). */
export function groupsFor(kind: SpaceKind): string[] {
  if (kind === 'marketing') return SPACE_GROUPS;
  const g = KIND_DEFS[kind].groups.filter((x) => x !== 'Output' && x !== 'Space');
  return [...g, 'Output'];
}

export function moduleDefFor(kind: SpaceKind, id: string): SpaceModuleDef {
  const list = modulesFor(kind);
  return list.find((m) => m.id === id) ?? list[0];
}

export function kindDef(kind: Exclude<SpaceKind, 'marketing'>): SpaceKindDef {
  return KIND_DEFS[kind];
}
