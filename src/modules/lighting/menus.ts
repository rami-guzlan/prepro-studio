/* Non-component helpers shared by the lighting screens (kept out of the
   component files so React Fast Refresh boundaries stay valid). */
import { LayoutTemplate, Plus } from 'lucide-react';
import type { LightingDiagram } from '@/types';
import type { MenuItem } from '@/ui';
import { TEMPLATES } from './templates';

/** dataTransfer type used when dragging a library tile onto the canvas */
export const DRAG_MIME = 'application/x-prepro-lighting-kind';

/** "New diagram" menu: blank + every template. */
export function newDiagramItems(onNew: (templateId?: string) => void): MenuItem[] {
  return [
    { label: 'Blank diagram', icon: Plus, onClick: () => onNew() },
    { separator: true },
    { header: 'From a template' },
    ...TEMPLATES.map((t) => ({ label: t.label, icon: LayoutTemplate, onClick: () => onNew(t.id) })),
  ];
}

/** Value for the print option "diagram": the name when unique, else the id. */
export function printKey(d: LightingDiagram, all: LightingDiagram[]): string {
  const same = all.filter((x) => x.name.trim().toLowerCase() === d.name.trim().toLowerCase());
  return d.name.trim() && same.length === 1 ? d.name.trim() : d.id;
}
