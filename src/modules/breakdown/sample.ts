import type { ID, ProjectData, SceneMeta } from '@/types';
import type { SampleContext } from '@/sample/context';
import { SAMPLE_ELEMENTS, SAMPLE_SCENES } from '@/sample/context';

/** Adds demo data for the breakdown module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const meta = (sid: string): SceneMeta => (p.scenes[sid] ??= { id: sid });
  const addEl = (sid: string, ...ids: ID[]) => {
    const m = meta(sid);
    const list = (m.elementIds ??= []);
    for (const id of ids) if (p.elements.some((e) => e.id === id) && !list.includes(id)) list.push(id);
  };
  const charId = (name: string) => p.characters.find((c) => c.name === name)?.id;

  // Scene 1 — rooftop, waiting for June
  const roof1 = meta(SAMPLE_SCENES.roof1);
  roof1.extras = '3 crew background: boom op, grip, makeup artist (our real crew, in their own clothes)';
  roof1.notes = 'Golden-hour window is 12 minutes. Pre-light and block before 3:45 PM. Lock off the roof door — public access stays closed until wrap.';
  roof1.estMinutes = roof1.estMinutes ?? 120;

  // Scene 2 — stairwell run
  const stairs = meta(SAMPLE_SCENES.stairs);
  stairs.extras = '';
  stairs.notes = 'Handheld follow, two passes max — actor runs nine floors. Rehearse at half speed; stunt coordinator on the landing. Coat double ready.';
  addEl(SAMPLE_SCENES.stairs, SAMPLE_ELEMENTS.walkie);

  // Scene 3 — the take
  const roof2 = meta(SAMPLE_SCENES.roof2);
  roof2.extras = 'Same 3 crew background as Sc. 1 (continuity: same positions)';
  roof2.notes = 'ONE TAKE scene — roll two cameras if possible. Wind machine off camera left at 40%. Walkie drop on gravel: use the beater walkie.';
  addEl(SAMPLE_SCENES.roof2, SAMPLE_ELEMENTS.coat, SAMPLE_ELEMENTS.camera, SAMPLE_ELEMENTS.walkie);
  const sam = charId('SAM');
  if (sam) {
    const list = (roof2.characterIds ??= []);
    if (!list.includes(sam)) list.push(sam);
  }

  // Scene 4 — edit suite
  const edit = meta(SAMPLE_SCENES.edit);
  edit.notes = 'Monitors play back the rooftop take (DIT prepares a ProRes loop on Day 1). Practical lighting only: monitor glow + one desk lamp.';
}
