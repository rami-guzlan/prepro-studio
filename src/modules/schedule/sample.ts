import type { ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { SAMPLE_SCENES } from '@/sample/context';
import { uid } from '@/lib/id';

/** Adds demo data for the schedule module to the sample project (mutates p).
    The two shoot days already exist; this adds labels, a meal banner and notes. */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const [day1, day2] = p.schedule?.days ?? [];
  if (day1) {
    day1.label = day1.label ?? 'Hollis Bldg — stairwell & roof';
    const stairsIdx = day1.items.findIndex((it) => it.type === 'scene' && it.sceneId === SAMPLE_SCENES.stairs);
    if (stairsIdx >= 0 && !day1.items.some((it) => it.type === 'banner' && /lunch/i.test(it.text))) {
      day1.items.splice(stairsIdx + 1, 0, { id: uid('st'), type: 'banner', text: 'Lunch — 12:00 PM (30 min, 9th floor lobby)', color: '#2fb36d' });
    }
  }
  if (day2) {
    day2.label = day2.label ?? 'Studio 9 — edit suite';
    day2.notes =
      day2.notes ??
      'Night interior shot day-for-night: black out the suite windows with duvetyne before camera. Monitor playback of the rooftop take needed for Sc 4.';
  }
  const edit = p.scenes?.[SAMPLE_SCENES.edit];
  if (edit && !edit.notes) edit.notes = 'Playback: loop the hero take from Day 1 on the centre monitor.';
}
