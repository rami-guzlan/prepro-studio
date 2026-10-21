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
import { businessKind } from '../business';
import { financeKind } from '../finance';
import { trainingKind } from '../training';
import type { SpaceKind } from '../types';

export const SPACE_PRINT_GROUPS: SpacePrintDocDef['group'][] = ['Overview', 'Strategy', 'Content', 'Calendar', 'Production', 'Results', 'Business', 'Sales', 'Work', 'Money', 'Library', 'Finances', 'Training'];

export const SPACE_PRINT_DOCS: SpacePrintDocDef[] = [...overview, ...strategy, ...campaigns, ...ideas, ...content, ...calendar, ...production, ...results, ...people, ...assets, ...withKind(businessKind.printDocs, 'business'), ...withKind(financeKind.printDocs, 'finance'), ...withKind(trainingKind.printDocs, 'training')];

function withKind(docs: SpacePrintDocDef[], kind: SpaceKind): SpacePrintDocDef[] {
  return docs.map((d) => (d.kinds ? d : { ...d, kinds: [kind] }));
}

/** Documents of a kind of space. */
export function printDocsFor(kind: SpaceKind): SpacePrintDocDef[] {
  return SPACE_PRINT_DOCS.filter((d) => (d.kinds ?? ['marketing']).includes(kind));
}

export function getSpacePrintDoc(id: string): SpacePrintDocDef | undefined {
  return SPACE_PRINT_DOCS.find((d) => d.id === id);
}
