/* Every printable document of Marketing Spaces. */
import type { SpacePrintDocDef } from './types';
import { spacePrintDocs as overview } from '../modules/overview/print';
import { spacePrintDocs as strategy } from '../modules/strategy/print';
import { spacePrintDocs as campaigns } from '../modules/campaigns/print';
import { spacePrintDocs as content } from '../modules/content/print';
import { spacePrintDocs as ideas } from '../modules/ideas/print';
import { spacePrintDocs as production } from '../modules/production/print';
import { spacePrintDocs as calendar } from '../modules/calendar/print';
import { spacePrintDocs as results } from '../modules/results/print';
import { spacePrintDocs as assets } from '../modules/assets/print';
import { spacePrintDocs as people } from '../modules/people/print';

export const SPACE_PRINT_GROUPS: SpacePrintDocDef['group'][] = ['Overview', 'Strategy', 'Content', 'Calendar', 'Production', 'Results'];

export const SPACE_PRINT_DOCS: SpacePrintDocDef[] = [...overview, ...strategy, ...campaigns, ...ideas, ...content, ...calendar, ...production, ...results, ...people, ...assets];

export function getSpacePrintDoc(id: string): SpacePrintDocDef | undefined {
  return SPACE_PRINT_DOCS.find((d) => d.id === id);
}
