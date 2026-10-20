/* Printable ideas board of a Marketing Space (same layout as the script's Mind Dump). */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { MIND_PRINT_CSS, MIND_PRINT_OPTIONS, mindPrintBody } from '@/modules/script/mind/print';
import { mindTotals } from '@/lib/mind';

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-ideas',
    title: 'Ideas Board',
    group: 'Content',
    orientation: 'landscape',
    description: 'Every brainstorm board (or the ones you pick) as a picture, every idea grouped by frame, and the free-written text.',
    options: MIND_PRINT_OPTIONS,
    emptyReason: (s) => {
      const t = mindTotals(s.mind);
      return t.notes || t.text ? false : 'The ideas boards are empty';
    },
    render: (ctx) => ({
      css: MIND_PRINT_CSS,
      body: mindPrintBody(ctx.space.mind, ctx.options, (subtitle) => <SpaceDocHeader ctx={ctx} title="Ideas" subtitle={subtitle} />),
    }),
  },
];
