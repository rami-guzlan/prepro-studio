import type { ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { aspectToNumber } from '@/lib/constants';
import { sampleSketches } from './sketches';

/** Adds pencil-style sketch frames (and a couple of sketch-layer overlays with
    camera-move arrows) to the sample shots created by the Shot List seeder. */
export async function seedSample(p: ProjectData, ctx: SampleContext): Promise<void> {
  const frames = sampleSketches(aspectToNumber(p.meta.aspectRatio));
  for (const shot of p.shots) {
    const fr = frames[shot.id];
    if (!fr) continue;
    if (!shot.image) shot.image = await ctx.addSvg(fr.image);
    if (fr.drawing && !shot.drawing) shot.drawing = await ctx.addSvg(fr.drawing);
  }
}
