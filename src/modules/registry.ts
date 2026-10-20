/* All modules shown in the sidebar. Each module lives in src/modules/<id>/
   with index.tsx (default export: the module screen), print.tsx (printable
   documents) and sample.ts (demo data for the sample project). */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  BookUser,
  CalendarRange,
  Camera,
  ClipboardList,
  FileText,
  HardHat,
  Images,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListVideo,
  MapPin,
  Package,
  Printer,
  ScanText,
  Scissors,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleId } from '@/store/app';

export interface ModuleDef {
  id: ModuleId;
  label: string;
  group: 'Overview' | 'Writing' | 'Visuals' | 'People' | 'Production' | 'Post' | 'Output' | 'Project';
  icon: LucideIcon;
  description: string;
  component: LazyExoticComponent<ComponentType>;
}

export const MODULES: ModuleDef[] = [
  { id: 'overview', label: 'Overview', group: 'Overview', icon: LayoutDashboard, description: 'Project dashboard, key info & progress', component: lazy(() => import('./overview')) },
  { id: 'tasks', label: 'Tasks & Milestones', group: 'Overview', icon: ListChecks, description: 'Pre-production checklist, milestones', component: lazy(() => import('./tasks')) },
  { id: 'script', label: 'Script', group: 'Writing', icon: FileText, description: 'Screenplay & two-column A/V scripts', component: lazy(() => import('./script')) },
  { id: 'storyboard', label: 'Storyboard', group: 'Visuals', icon: Images, description: 'Frames, sketches & animatic', component: lazy(() => import('./storyboard')) },
  { id: 'shots', label: 'Shot List', group: 'Visuals', icon: ListVideo, description: 'Shots per scene with camera specs', component: lazy(() => import('./shots')) },
  { id: 'lighting', label: 'Lighting Diagrams', group: 'Visuals', icon: Lightbulb, description: 'Top-down lighting & camera plots', component: lazy(() => import('./lighting')) },
  { id: 'cast', label: 'Cast & Characters', group: 'People', icon: Users, description: 'Characters, actors, sizes & contacts', component: lazy(() => import('./cast')) },
  { id: 'crew', label: 'Crew', group: 'People', icon: HardHat, description: 'Crew list by department', component: lazy(() => import('./crew')) },
  { id: 'contacts', label: 'Contacts & Vendors', group: 'People', icon: BookUser, description: 'Clients, vendors, rental houses', component: lazy(() => import('./contacts')) },
  { id: 'breakdown', label: 'Script Breakdown', group: 'Production', icon: ScanText, description: 'Breakdown sheets per scene', component: lazy(() => import('./breakdown')) },
  { id: 'elements', label: 'Props, Wardrobe & Elements', group: 'Production', icon: Package, description: 'Everything tagged in the breakdown', component: lazy(() => import('./elements')) },
  { id: 'locations', label: 'Locations & Sets', group: 'Production', icon: MapPin, description: 'Locations, photos, permits & sets', component: lazy(() => import('./locations')) },
  { id: 'schedule', label: 'Shooting Schedule', group: 'Production', icon: CalendarRange, description: 'Stripboard, shoot days & DOOD', component: lazy(() => import('./schedule')) },
  { id: 'callsheets', label: 'Call Sheets', group: 'Production', icon: ClipboardList, description: 'Daily call sheets', component: lazy(() => import('./callsheets')) },
  { id: 'gear', label: 'Gear & Equipment', group: 'Production', icon: Camera, description: 'Equipment lists & rentals', component: lazy(() => import('./gear')) },
  { id: 'budget', label: 'Budget', group: 'Production', icon: Wallet, description: 'Top sheet, line items & actuals', component: lazy(() => import('./budget')) },
  { id: 'post', label: 'Post-Production', group: 'Post', icon: Scissors, description: 'Post schedule, deliverables, VFX, music', component: lazy(() => import('./post')) },
  { id: 'printcenter', label: 'Print & Export', group: 'Output', icon: Printer, description: 'All documents, PDFs & production book', component: lazy(() => import('./printcenter')) },
  { id: 'settings', label: 'Project Settings', group: 'Project', icon: Settings, description: 'Format, paper, script & print settings', component: lazy(() => import('../shell/ProjectSettings')) },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleDef>;
