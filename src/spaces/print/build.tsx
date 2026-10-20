/* Build Marketing Space documents (HTML → PDF via the shared print pipeline). */
import type { PaperSize } from '@/types';
import type { Orientation } from '@/print/types';
import { assembleDocument, defaultOptions, type BuiltDoc } from '@/print/build';
import { makeFormatters } from '@/lib/format';
import { todayISO } from '@/lib/dates';
import { backend } from '@/backend';
import type { SpaceData } from '../types';
import type { SpacePrintContext, SpacePrintDocDef } from './types';

export function makeSpaceContext(space: SpaceData, def: SpacePrintDocDef, options: Record<string, any>, paper?: PaperSize, orientation?: Orientation): SpacePrintContext {
  const fmt = makeFormatters(space.settings as any);
  const t = todayISO();
  return {
    space,
    options: { ...defaultOptions(def as any), ...options },
    paper: paper ?? space.settings.paperSize,
    orientation: orientation ?? def.orientation ?? 'portrait',
    fmt,
    asset: (name) => (name ? backend.assetUrl(space.id, name) : ''),
    today: fmt.dateMedium(t),
    todayISO: t,
  };
}

export function buildSpaceDocument(def: SpacePrintDocDef, ctx: SpacePrintContext): BuiltDoc {
  const m = ctx.space.meta;
  return assembleDocument(def.render(ctx), def.title, { title: m.title, color: m.color, print: ctx.space.settings.print }, ctx);
}
