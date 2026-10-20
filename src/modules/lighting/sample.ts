import type { ProjectData } from '@/types';
import { SAMPLE_SCENES, type SampleContext } from '@/sample/context';
import { PlotBuilder } from './templates';
import type { P } from './model';

/* Two plots for "The Last Take":
   1. Rooftop — magic hour monologue (EXT. CITY ROOFTOP - MAGIC HOUR)
   2. Edit suite — night (INT. EDIT SUITE - NIGHT) */

function rooftop(p: ProjectData) {
  const b = new PlotBuilder('Rooftop — magic hour monologue', 40, 28, 30);
  const june: P = [7, 14];
  const cam: P = [21.5, 14];

  // set: parapet / ledge on the west edge, water towers, stair bulkhead
  b.add('set.wall', 1.6, 14, { rot: 90, size: [26, 0.6], label: 'Parapet / ledge (W)', locked: true });
  b.add('set.watertower', 6, 4.6, { size: [6.5, 6.5], label: 'Water tower' });
  b.add('set.watertower', 33.5, 4.8, { size: [7.5, 7.5], label: 'Water tower' });
  b.add('set.wall', 34.5, 22.5, { size: [6, 5], label: 'Stair bulkhead' });
  b.add('set.door', 30.6, 22.6, { rot: 270, size: [3, 3] });

  // talent & blocking
  b.add('person.actor', june[0], june[1], { rot: 90, label: 'JUNE (Sofia M.)', color: '#e5484d', props: { notes: 'Red 1960s coat — wind machine lifts the hem on “I never said goodbye”.' } });
  b.add('note.arrow', 29.5, 22, {
    points: [
      [29.5, 22],
      [21, 21.5],
      [12.5, 18.5],
      [8.4, 15.4],
    ],
    label: 'June: door → ledge',
    color: '#e5484d',
    props: { dashed: true, curved: true, width: 2.5 },
  });

  // light: sun as backlight, bounce, LED fill through diffusion
  b.add('light.sun', 0.8, 13.2, {
    facing: june,
    label: 'Sun — magic hour',
    props: {
      purpose: 'Back/Rim',
      fixture: 'Natural sun',
      cct: 3400,
      intensity: 100,
      beam: 32,
      throw: 26,
      notes: 'Sunset 4:38 PM. Usable light ≈ 4:10–4:32 — sun sits just above the western skyline behind June.',
    },
  });
  b.add('grip.bounce', 11, 18.2, { facing: june, size: [4, 0.2], label: '4x4 Bounce (zebra)', props: { surface: 'zebra', notes: 'Kick the sun back into June’s face; feather off when the sky ignites.' } });
  b.add('grip.cstand', 12.6, 19.6, {});
  b.add('grip.sandbag', 13.4, 20.4, {});
  b.add('light.fresnel', 11.2, 8.6, {
    facing: june,
    label: 'LED fill',
    props: {
      purpose: 'Fill',
      fixture: 'Aputure LS 300x',
      watts: 300,
      cct: 4300,
      intensity: 35,
      modifier: 'Diffusion 1/2',
      beam: 45,
      throw: 9,
      height: 6,
      channel: 'Sidus app · Ch 2',
      notes: 'V-mount battery (no cable across the roof). Through 4x4 1/2 grid cloth; ride down as the sun drops.',
    },
  });
  b.add('grip.diffusion', 9.2, 10.9, { facing: june, size: [4, 0.2], label: '4x4 1/2 Grid', props: { diffusion: '1/2 Grid cloth' } });
  b.add('grip.cstand', 8.3, 9.6, {});
  b.add('grip.wind', 6.2, 20.4, { facing: june, label: 'Wind machine (coat lift)', props: { notes: 'Battery leaf blower / E-fan, cue from 1st AD.' } });

  // camera & sound
  b.add('camera.cinema', cam[0], cam[1], {
    rot: 270,
    label: 'A',
    props: { lens: 85, sensor: 'lf', body: 'ARRI Alexa Mini LF', support: 'Sticks + fluid head', height: 5.5, fovLength: 16, notes: 'MCU → CU, T2. Keep the water tower soft over June’s shoulder.' },
  });
  b.add('person.crew', 23.6, 15.8, { rot: 270, label: 'Ivan — DP / Op' });
  b.add('person.crew', 22, 11.6, { rot: 250, label: 'Mia — 1st AC' });
  b.add('sound.boom', 8.6, 10.6, { facing: june, scale: 0.8 });
  b.add('person.crew', 10.4, 5.9, { facing: june, label: 'Karim — boom' });

  // video village
  b.add('person.monitor', 27.5, 17.5, { rot: 0, label: 'Video village — director' });
  b.add('person.crew', 25.8, 19.4, { rot: 0, label: 'Elena (director)' });

  // annotations
  b.add('note.dimension', 7.6, 12, {
    points: [
      [7.6, 12],
      [20.4, 12],
    ],
  });
  b.add('note.text', 4.6, 26.6, { label: 'WEST — sunset side', props: { size: 13, bold: true } });
  b.add('note.text', 37.6, 1.6, { label: 'N ↑', props: { size: 15, bold: true } });

  b.d.notes =
    'Twelve minutes of usable light — rehearse the walk with stand-in at 3:45 PM, roll at 4:10.\n' +
    'Freight elevator is out: everything up nine flights. Keep the package battery-powered (no distro on the roof).\n' +
    'Safety: sandbag every stand — gusts on the roof. Nobody inside 6 ft of the parapet except June (harness line on the ledge mark).';
  return b.d;
}

function editSuite() {
  const b = new PlotBuilder('Edit suite — night', 16, 12, 50);
  const maya: P = [6.8, 4.9];
  const leo: P = [9.2, 4.9];

  // room
  b.add('set.rug', 8, 7.2, { size: [8, 5], color: '#8f7ca8' });
  b.add('set.wall', 8, 0.25, { size: [16, 0.5], locked: true });
  b.add('set.wall', 0.25, 6, { rot: 90, size: [12, 0.5], locked: true });
  b.add('set.wall', 15.75, 6, { rot: 90, size: [12, 0.5], locked: true });
  b.add('set.wall', 5.5, 11.75, { size: [11, 0.5], locked: true });
  b.add('set.door', 13.4, 10.1, { size: [2.8, 2.8] });
  b.add('set.desk', 8, 2.1, { size: [8, 2.5] });
  b.add('set.sofa', 1.8, 7.4, { rot: 90, size: [6, 2.6], label: 'Client sofa' });

  // monitors: centre grade monitor + two glowing edit monitors (practicals)
  b.add('set.tv', 8, 1.35, { size: [2.6, 0.35], label: '' });
  b.add('set.chair', maya[0], maya[1] + 0.2, { rot: 0, size: [1.8, 1.8] });
  b.add('set.chair', leo[0], leo[1] + 0.2, { rot: 0, size: [1.8, 1.8] });
  b.add('person.actor', maya[0], maya[1], { rot: 0, label: 'MAYA (Priya R.)', color: '#e5484d' });
  b.add('person.actor', leo[0], leo[1], { rot: 0, label: 'LEO (Daniel O.)', color: '#3e8ef7' });

  b.add('light.screen', 5.3, 1.6, {
    rot: 160,
    label: 'Edit monitor L',
    props: { purpose: 'Practical', fixture: 'Edit monitor (practical)', cct: 6500, intensity: 45, beam: 120, throw: 5, notes: 'Loop the rooftop take; monitor brightness 100 %, 6500K.' },
  });
  b.add('light.screen', 10.7, 1.6, {
    rot: 200,
    label: 'Edit monitor R',
    props: { purpose: 'Practical', fixture: 'Edit monitor (practical)', cct: 6500, intensity: 45, beam: 120, throw: 5 },
  });
  b.add('light.practical', 11.9, 2.3, {
    label: 'Desk lamp',
    props: { purpose: 'Practical', fixture: 'Household practical bulb', watts: 40, cct: 2700, intensity: 35, throw: 3.5, notes: 'Dimmed to a warm accent; keep out of the lens flare.' },
  });
  b.add('light.tube', 13.2, 8.4, {
    facing: [8, 4.9],
    label: 'Kicker',
    props: { purpose: 'Kicker', fixture: 'Astera Titan Tube', watts: 72, cct: 7500, gel: 'Steel Blue', intensity: 40, beam: 110, throw: 7, height: 5, channel: 'DMX 1', notes: 'Hidden behind the door frame — cool night edge on both faces.' },
  });
  b.add('light.chinaball', 8, 6.4, {
    label: 'Overhead ambience',
    props: { purpose: 'Fill', fixture: 'China ball 250W', watts: 250, cct: 3200, intensity: 15, throw: 5, height: 8.5, channel: 'Dimmer 2', notes: 'Skirted, on a boom arm just out of frame top. Barely-there base level.' },
  });

  // camera on slider: slow push-in towards the monitors
  b.add('grip.slider', 8, 9.4, { rot: 90, size: [3, 0.45], label: '' });
  b.add('camera.cinema', 8, 9.1, {
    rot: 0,
    label: 'A',
    scale: 0.85,
    props: { lens: 35, sensor: 'lf', body: 'ARRI Alexa Mini LF', support: 'Slider', height: 4.5, fovLength: 8, notes: 'Over-the-shoulder two-shot into the monitor wall. Slow push on “Show-off.”' },
  });
  b.add('note.arrow', 9.3, 10.8, {
    points: [
      [9.3, 10.8],
      [9.3, 8.1],
    ],
    label: 'Slow push-in (3 ft)',
    color: '#3e8ef7',
    props: { dashed: true },
  });
  b.add('person.crew', 6.6, 10.4, { rot: 0, label: 'Ivan — op' });
  b.add('note.text', 13.6, 11.3, { label: 'Door to corridor', props: { size: 11 } });

  b.d.notes = 'Night interior lit almost entirely by the monitors. Black out the window behind camera (duvetyne). Kicker on DMX from the iPad; China ball on a 600W dimmer.';
  return b.d;
}

/** Adds demo data for the lighting module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const roof = rooftop(p);
  const edit = editSuite();
  const locFor = (set: string) => p.locations.find((l) => (l.sets ?? []).some((s) => s.toUpperCase() === set))?.id;

  roof.sceneIds = [SAMPLE_SCENES.roof2];
  roof.locationId = locFor('CITY ROOFTOP');
  edit.sceneIds = [SAMPLE_SCENES.edit];
  edit.locationId = locFor('EDIT SUITE');

  for (const d of [roof, edit]) {
    const shots = (p.shots ?? []).filter((s) => s.sceneId && d.sceneIds.includes(s.sceneId));
    d.shotIds = shots.map((s) => s.id);
    for (const s of shots) if (!s.diagramId) s.diagramId = d.id;
  }

  p.diagrams = [...(p.diagrams ?? []), roof, edit];
}
