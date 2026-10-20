/* Collects the printable documents of every module. */
import type { PrintDocDef } from './types';
import { printDocs as overview } from '@/modules/overview/print';
import { printDocs as tasks } from '@/modules/tasks/print';
import { printDocs as script } from '@/modules/script/print';
import { printDocs as avscript } from '@/modules/avscript/print';
import { printDocs as storyboard } from '@/modules/storyboard/print';
import { printDocs as shots } from '@/modules/shots/print';
import { printDocs as lighting } from '@/modules/lighting/print';
import { printDocs as cast } from '@/modules/cast/print';
import { printDocs as crew } from '@/modules/crew/print';
import { printDocs as contacts } from '@/modules/contacts/print';
import { printDocs as breakdown } from '@/modules/breakdown/print';
import { printDocs as elements } from '@/modules/elements/print';
import { printDocs as locations } from '@/modules/locations/print';
import { printDocs as schedule } from '@/modules/schedule/print';
import { printDocs as callsheets } from '@/modules/callsheets/print';
import { printDocs as gear } from '@/modules/gear/print';
import { printDocs as budget } from '@/modules/budget/print';
import { printDocs as post } from '@/modules/post/print';
import { printDocs as blanks } from '@/modules/printcenter/print';

export const PRINT_GROUPS: PrintDocDef['group'][] = ['Overview', 'Script', 'Visuals', 'People', 'Locations', 'Breakdown', 'Schedule', 'Budget & Gear', 'Post', 'Blank Templates'];

export const PRINT_DOCS: PrintDocDef[] = [
  ...overview,
  ...tasks,
  ...script,
  ...avscript,
  ...storyboard,
  ...shots,
  ...lighting,
  ...cast,
  ...crew,
  ...contacts,
  ...breakdown,
  ...elements,
  ...locations,
  ...schedule,
  ...callsheets,
  ...gear,
  ...budget,
  ...post,
  ...blanks,
];

export function getPrintDoc(id: string): PrintDocDef | undefined {
  return PRINT_DOCS.find((d) => d.id === id);
}
