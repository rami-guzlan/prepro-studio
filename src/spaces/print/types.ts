/* Printable documents of Marketing Spaces (same pipeline as project documents:
   render() returns a PrintOutput that is turned into HTML and a PDF).
   Register docs in src/spaces/print/registry.ts. Open with openPrint(docId). */
import type { PaperSize } from '@/types';
import type { Formatters } from '@/lib/format';
import type { Orientation, PrintOptionDef, PrintOutput } from '@/print/types';
import type { SpaceData } from '../types';

export interface SpacePrintContext {
  space: SpaceData;
  /** option values (defaults merged with the user's choices) */
  options: Record<string, any>;
  paper: PaperSize;
  orientation: Orientation;
  fmt: Formatters;
  /** absolute URL for a space asset (images) */
  asset: (name?: string | null) => string;
  /** today's date formatted for print */
  today: string;
  /** today as YYYY-MM-DD */
  todayISO: string;
}

export interface SpacePrintDocDef {
  /** must start with "space-" */
  id: string;
  title: string;
  group: 'Overview' | 'Strategy' | 'Content' | 'Calendar' | 'Production' | 'Results';
  description?: string;
  orientation?: Orientation;
  options?: PrintOptionDef[];
  emptyReason?: (space: SpaceData) => string | false;
  render: (ctx: SpacePrintContext) => PrintOutput;
}
