/* ==========================================================================
   Printable documents
   --------------------------------------------------------------------------
   Every module registers its printable documents (src/modules/<m>/print.tsx)
   as PrintDocDef objects. The print preview builds a complete HTML page from
   def.render(ctx), shows it, and exports a PDF (desktop: Chromium printToPDF
   with exact page sizes) or sends it to the printer.

   Two layout modes:
   - 'flow' (default): normal document flow; the page size, margins, running
     header (project / doc title) and footer (page X of Y) come from @page.
     Use <PTable>, <PSection>, class "pp-avoid" (keep together) and
     "pp-break" (page break after).
   - 'fixed': the body is a list of <div class="pp-page"> elements that
     already have the exact paper size (used by the screenplay).
   ========================================================================== */
import type { ReactNode } from 'react';
import type { PaperSize, ProjectData } from '@/types';
import type { ScriptModel } from '@/script-core/model';
import type { Formatters } from '@/lib/format';

export type Orientation = 'portrait' | 'landscape';

export type PrintOptionDef =
  | { key: string; label: string; type: 'boolean'; default: boolean; hint?: string }
  | { key: string; label: string; type: 'select'; default: string; choices: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; type: 'text'; default: string; hint?: string }
  | { key: string; label: string; type: 'number'; default: number; min?: number; max?: number; hint?: string };

export interface PrintContext {
  project: ProjectData;
  model: ScriptModel;
  /** option values (defaults merged with user choices) */
  options: Record<string, any>;
  paper: PaperSize;
  orientation: Orientation;
  fmt: Formatters;
  /** absolute URL for a project asset (images) */
  asset: (name?: string | null) => string;
  /** today's date formatted for print */
  today: string;
}

export interface PrintOutput {
  body: ReactNode;
  mode?: 'flow' | 'fixed';
  /** override orientation (e.g. chosen via an option) */
  orientation?: Orientation;
  /** extra CSS for this document (prefix your classes to avoid clashes) */
  css?: string;
  /** flow-mode page margins in inches */
  margins?: { top: number; right: number; bottom: number; left: number };
  /** running header/footer (flow mode). false hides them. */
  header?: false | { left?: string; right?: string };
  footer?: false | { left?: string; center?: string; right?: string };
  /** title for the running header + PDF metadata (default: def.title) */
  title?: string;
  /** file name without extension (default: '<Project> - <Doc title>') */
  fileName?: string;
}

export interface PrintDocDef {
  id: string;
  title: string;
  group: 'Overview' | 'Script' | 'Visuals' | 'People' | 'Locations' | 'Breakdown' | 'Schedule' | 'Budget & Gear' | 'Post' | 'Blank Templates';
  description?: string;
  orientation?: Orientation;
  options?: PrintOptionDef[];
  /** return a message when there's nothing to print yet (shown in the print center) */
  emptyReason?: (project: ProjectData, model: ScriptModel) => string | false;
  render: (ctx: PrintContext) => PrintOutput;
}
