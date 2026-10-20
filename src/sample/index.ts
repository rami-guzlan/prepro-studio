/* Builds the sample project "The Last Take" with data in every module.
   Core cross-module data (script, characters, cast, crew, contacts,
   locations, shoot days) is created here; each module's seedSample() then
   adds its own demo data. Scene ids are fixed (SAMPLE_SCENES) so seeders
   can reference them. */
import type { BreakdownCategory, BreakdownElement, ElementType, ProjectData } from '@/types';
import { createProject } from '@/store/defaults';
import { parasToDoc, type Para, type Run } from '@/script-core/paragraphs';
import { syncCharactersDraft } from '@/derived/script';
import { backend } from '@/backend';
import { uid } from '@/lib/id';
import { SAMPLE_ELEMENTS, SAMPLE_SCENES, type SampleContext } from './context';
export { SAMPLE_ELEMENTS, SAMPLE_SCENES };

import { seedSample as seedCast } from '@/modules/cast/sample';
import { seedSample as seedCrew } from '@/modules/crew/sample';
import { seedSample as seedContacts } from '@/modules/contacts/sample';
import { seedSample as seedLocations } from '@/modules/locations/sample';
import { seedSample as seedElements } from '@/modules/elements/sample';
import { seedSample as seedBreakdown } from '@/modules/breakdown/sample';
import { seedSample as seedShots } from '@/modules/shots/sample';
import { seedSample as seedStoryboard } from '@/modules/storyboard/sample';
import { seedSample as seedLighting } from '@/modules/lighting/sample';
import { seedSample as seedSchedule } from '@/modules/schedule/sample';
import { seedSample as seedCallsheets } from '@/modules/callsheets/sample';
import { seedSample as seedGear } from '@/modules/gear/sample';
import { seedSample as seedBudget } from '@/modules/budget/sample';
import { seedSample as seedPost } from '@/modules/post/sample';
import { seedSample as seedTasks } from '@/modules/tasks/sample';
import { seedSample as seedOverview } from '@/modules/overview/sample';
import { seedSample as seedScript } from '@/modules/script/sample';
import { seedSample as seedAv } from '@/modules/avscript/sample';

/** Parse "{cat:id|text}" tag markers and *italic* / **bold** into runs. */
function runs(src: string): Run[] {
  const out: Run[] = [];
  const re = /\{([a-z_]+):([a-zA-Z0-9_]+)\|([^}]+)\}|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[1]) out.push({ text: m[3], tags: [{ cat: m[1] as BreakdownCategory, id: m[2] }] });
    else if (m[4]) out.push({ text: m[4], b: true });
    else if (m[5]) out.push({ text: m[5], i: true });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

function para(type: ElementType, src: string, extra: Partial<Para> = {}): Para {
  const r = runs(src);
  return { type, text: r.map((x) => x.text).join(''), runs: r, ...extra };
}

const E = SAMPLE_ELEMENTS;

function sampleScript(): Para[] {
  return [
    para('transition', 'FADE IN:'),
    para('scene_heading', 'EXT. CITY ROOFTOP - DUSK', { sid: SAMPLE_SCENES.roof1 }),
    para('action', 'The sun hangs low over a skyline of water towers. A skeleton film crew races against the light.'),
    para('action', 'MAYA (30s, director, headset askew) stares at a field monitor.'),
    para('character', 'MAYA'),
    para('dialogue', "We've got twelve minutes of usable light. Where's June?"),
    para('action', `LEO (40s, director of photography, unflappable) levels a {props:${E.camera}|vintage film camera} on its tripod.`),
    para('character', 'LEO'),
    para('parenthetical', '(without looking up)'),
    para('dialogue', 'Hair and makeup. Again.'),
    para('character', 'MAYA'),
    para('dialogue', 'Sam!'),
    para('action', `SAM (19, production assistant, all energy) jogs over clutching a {props:${E.walkie}|walkie-talkie}.`),
    para('character', 'SAM'),
    para('dialogue', "On it. She's in the stairwell — the elevator's dead."),
    para('character', 'MAYA'),
    para('dialogue', "Tell her the sun doesn't do second takes."),
    para('transition', 'CUT TO:'),

    para('scene_heading', 'INT. STAIRWELL - CONTINUOUS', { sid: SAMPLE_SCENES.stairs }),
    para('action', `JUNE (20s, actor, wrapped in a {wardrobe:${E.coat}|red 1960s coat}) takes the stairs two at a time, a dog-eared {props:${E.script}|script} in one hand.`),
    para('character', 'JUNE'),
    para('parenthetical', '(breathless, into walkie)'),
    para('dialogue', 'Nine floors. Nobody mentioned nine floors.'),
    para('character', 'SAM (V.O.)'),
    para('parenthetical', '(filtered)'),
    para('dialogue', 'Eight more to go! You are doing amazing!'),
    para('action', 'She stops on a landing. Looks up the spiral of railings. Laughs despite herself — then keeps climbing.'),

    para('scene_heading', 'EXT. CITY ROOFTOP - MAGIC HOUR', { sid: SAMPLE_SCENES.roof2 }),
    para('action', 'The sky burns orange. June bursts through the door. Leo is already rolling.'),
    para('character', 'MAYA'),
    para('dialogue', "Don't stop. Walk to the edge, just like we rehearsed."),
    para('action', `June crosses to the ledge, catches her breath, and turns to the lens. A gust of {sfx:${E.wind}|wind} lifts the coat.`),
    para('character', 'JUNE'),
    para('dialogue', 'I never said goodbye. Not to the city. Not to you. I thought if I stayed quiet long enough, it would all stay exactly where I left it.'),
    para('action', 'A long beat. Nobody breathes.'),
    para('character', 'MAYA'),
    para('dialogue', 'Cut!'),
    para('character', 'LEO', { dual: true }),
    para('dialogue', "That's the one."),
    para('action', `The crew erupts. Sam drops the walkie — it {sound:${E.crackle}|CRACKLES} on the gravel.`),
    para('transition', 'DISSOLVE TO:'),

    para('scene_heading', 'INT. EDIT SUITE - NIGHT', { sid: SAMPLE_SCENES.edit }),
    para('action', `A wall of {set_dressing:${E.monitors}|monitors} glows in the dark. Maya and Leo watch the take on loop.`),
    para('character', 'LEO'),
    para('dialogue', 'Twelve minutes of light. We used eleven.'),
    para('character', 'MAYA'),
    para('parenthetical', '(smiling)'),
    para('dialogue', 'Show-off.'),
    para('action', 'She hits SAVE. The frame freezes on June — backlit, windswept, perfect.'),
    para('transition', 'FADE OUT.'),
  ];
}

function sampleElements(): BreakdownElement[] {
  return [
    { id: E.camera, category: 'props', name: 'VINTAGE FILM CAMERA', description: 'Hero prop — 1970s 16mm camera on wooden tripod (non-working is fine)', status: 'sourcing', source: 'rent', cost: 150, vendor: 'Prop House NYC', quantity: 1 },
    { id: E.walkie, category: 'props', name: 'WALKIE-TALKIE', description: 'Practical walkie; must survive a drop onto gravel', status: 'acquired', source: 'own', quantity: 2 },
    { id: E.coat, category: 'wardrobe', name: 'RED 1960S COAT', description: "June's hero coat. Need a double for the stairwell run.", status: 'sourcing', source: 'buy', cost: 220, quantity: 2 },
    { id: E.script, category: 'props', name: 'SCRIPT', description: 'Dog-eared script pages, highlighted', status: 'needed', source: 'make', quantity: 1 },
    { id: E.crackle, category: 'sound', name: 'CRACKLES', description: 'Walkie static burst — record wild on set', status: 'needed' },
    { id: E.monitors, category: 'set_dressing', name: 'MONITORS', description: 'Bank of 4–6 monitors for the edit suite', status: 'needed', source: 'borrow', quantity: 5 },
    { id: E.wind, category: 'sfx', name: 'WIND', description: 'Wind machine / leaf blower off-camera for the coat lift', status: 'needed', source: 'rent', cost: 90 },
  ];
}

export async function createSampleProject(): Promise<ProjectData> {
  const p = createProject({ title: 'The Last Take', projectType: 'short', withTemplates: true, scriptMode: 'screenplay', color: '#e8590c' });
  p.meta = {
    ...p.meta,
    status: 'pre',
    logline: 'A skeleton film crew races the setting sun to capture one perfect shot on a Brooklyn rooftop.',
    synopsis:
      'With twelve minutes of usable light left, director Maya and her tiny crew wait on a rooftop for their lead actor, June — who is stuck climbing nine floors of stairs in a vintage coat. When she finally bursts through the door, the sky ignites and they get the take of their lives.',
    director: 'Elena Ward',
    producer: 'Marcus Chen',
    writer: 'Elena Ward',
    productionCompany: 'Golden Hour Pictures',
    aspectRatio: '2.39:1',
    resolution: '4096x1716',
    frameRate: '23.976',
    targetRuntime: '04:00',
    shootStart: '2026-11-07',
    shootEnd: '2026-11-08',
    deliveryDate: '2026-12-15',
    tags: ['short film', 'festival', 'demo'],
    demo: true,
  };
  p.script.titlePage = {
    title: 'THE LAST TAKE',
    credit: 'Written by',
    authors: 'Elena Ward',
    draft: 'Shooting Draft',
    draftDate: 'October 18, 2026',
    contact: 'Golden Hour Pictures\nproduction@goldenhour.example\n(555) 010-4477',
  };
  p.script.doc = parasToDoc(sampleScript());
  p.elements = sampleElements();
  syncCharactersDraft(p as any);

  // character details
  const char = (name: string) => p.characters.find((c) => c.name === name)!;
  Object.assign(char('MAYA'), { description: 'Director. Calm on the outside, counting every second on the inside.', age: '30s', gender: 'Female', number: 1 });
  Object.assign(char('JUNE'), { description: 'Lead actor. Warm, funny, chronically late.', age: '20s', gender: 'Female', number: 2 });
  Object.assign(char('LEO'), { description: 'Director of photography. Has seen everything twice.', age: '40s', gender: 'Male', number: 3 });
  Object.assign(char('SAM'), { description: 'Production assistant. Runs everywhere.', age: '19', gender: 'Any', number: 4 });

  // cast
  const cast = [
    { name: 'Priya Raman', char: 'MAYA', status: 'confirmed' as const, rate: 450 },
    { name: 'Sofia Marín', char: 'JUNE', status: 'confirmed' as const, rate: 450 },
    { name: 'Daniel Okafor', char: 'LEO', status: 'confirmed' as const, rate: 400 },
    { name: 'Alex Kim', char: 'SAM', status: 'offered' as const, rate: 300 },
  ];
  p.cast = cast.map((c, i) => {
    const id = uid('cast');
    char(c.char).castId = id;
    return {
      id,
      name: c.name,
      status: c.status,
      phone: `(555) 010-21${10 + i}`,
      email: `${c.name.split(' ')[0].toLowerCase()}@talent.example`,
      union: i === 3 ? 'Non-union' : 'SAG-AFTRA',
      rate: c.rate,
      rateUnit: 'day' as const,
      releaseSigned: i < 2,
      contractSigned: i < 3,
    };
  });

  // crew
  const crew: [string, string, string, string?][] = [
    ['Elena Ward', 'Direction', 'Director', '06:30'],
    ['Marcus Chen', 'Production', 'Producer', '06:30'],
    ['Tasha Brooks', 'Direction', '1st Assistant Director', '06:00'],
    ['Ivan Petrov', 'Camera', 'Director of Photography', '06:30'],
    ['Mia Santos', 'Camera', '1st AC (Focus Puller)', '06:30'],
    ['Luis Ortega', 'Electric', 'Gaffer', '06:30'],
    ['Hannah Moore', 'Grip', 'Key Grip', '06:30'],
    ['Karim Haddad', 'Sound', 'Production Sound Mixer', '07:00'],
    ['Grace Liu', 'Hair & Makeup', 'Key Makeup Artist', '06:00'],
    ['Nina Patel', 'Wardrobe', 'Costume Designer', '06:00'],
    ['Ben Carter', 'Production', 'Production Assistant', '06:00'],
    ['Chloe Martin', 'Post-production', 'Editor'],
  ];
  p.crew = crew.map(([name, department, position, call], i) => ({
    id: uid('crew'),
    name,
    department,
    position,
    status: 'confirmed' as const,
    phone: `(555) 010-30${10 + i}`,
    email: `${name.split(' ')[0].toLowerCase()}@crew.example`,
    rate: [800, 700, 650, 900, 500, 650, 600, 650, 500, 500, 250, 600][i],
    rateUnit: 'day' as const,
    defaultCall: call,
    dealMemo: i !== 10,
  }));

  // contacts
  p.contacts = [
    { id: uid('ct'), name: 'Rental desk', company: 'Lensworks Rentals', category: 'rental', phone: '(555) 010-5000', email: 'rentals@lensworks.example', address: '12 Kent Ave, Brooklyn, NY' },
    { id: uid('ct'), name: 'Dana Whitfield', company: 'Hollis Building Management', role: 'Building manager', category: 'location', phone: '(555) 010-6112', email: 'dana@hollis.example' },
    { id: uid('ct'), name: 'Prop desk', company: 'Prop House NYC', category: 'vendor', phone: '(555) 010-7300', email: 'hello@prophouse.example' },
    { id: uid('ct'), name: 'Sam Reyes', company: 'Studio 9 Post', role: 'Post supervisor', category: 'post', phone: '(555) 010-8090', email: 'sam@studio9.example' },
  ];

  // locations
  const hospital = { name: 'Brooklyn Methodist Hospital (example)', address: '506 6th St, Brooklyn, NY', phone: '(555) 010-9111' };
  p.locations = [
    {
      id: uid('loc'),
      name: 'Hollis Building — Rooftop',
      address: '418 Hollis Ave, Brooklyn, NY 11211',
      kind: 'exterior',
      status: 'confirmed',
      photos: [],
      sets: ['CITY ROOFTOP'],
      contactName: 'Dana Whitfield',
      contactPhone: '(555) 010-6112',
      lat: 40.7128,
      lng: -73.9573,
      fee: 1200,
      permitRequired: true,
      permitStatus: 'approved',
      parking: 'Street parking on Hollis Ave; loading zone at the north entrance until 9 AM.',
      power: 'Two 20A circuits on the roof bulkhead. Bring a putt-putt generator for backup.',
      restrooms: '9th floor, east corridor',
      loadIn: 'Freight elevator OUT OF SERVICE — stairs only (9 floors). Plan 30 min load-in.',
      hospital,
      notes: 'Sun sets behind the water towers to the west — best light 20 min before sunset.',
    },
    {
      id: uid('loc'),
      name: 'Hollis Building — Stairwell',
      address: '418 Hollis Ave, Brooklyn, NY 11211',
      kind: 'interior',
      status: 'confirmed',
      photos: [],
      sets: ['STAIRWELL'],
      contactName: 'Dana Whitfield',
      contactPhone: '(555) 010-6112',
      lat: 40.7128,
      lng: -73.9573,
      permitRequired: false,
      permitStatus: 'n/a',
      power: 'Outlets on every landing (15A).',
      hospital,
    },
    {
      id: uid('loc'),
      name: 'Studio 9 Post — Suite B',
      address: '77 Water St, Brooklyn, NY 11201',
      kind: 'studio',
      status: 'option',
      photos: [],
      sets: ['EDIT SUITE'],
      contactName: 'Sam Reyes',
      contactPhone: '(555) 010-8090',
      lat: 40.7033,
      lng: -73.9881,
      fee: 400,
      hospital,
    },
  ];

  // shoot days
  p.schedule = {
    startDate: '2026-11-07',
    skipWeekends: false,
    days: [
      {
        id: uid('day'),
        date: '2026-11-07',
        items: [
          { id: uid('st'), type: 'scene', sceneId: SAMPLE_SCENES.stairs },
          { id: uid('st'), type: 'banner', text: 'Company move to roof · load gear up the stairs', color: '#f5a524' },
          { id: uid('st'), type: 'scene', sceneId: SAMPLE_SCENES.roof1 },
          { id: uid('st'), type: 'scene', sceneId: SAMPLE_SCENES.roof2 },
        ],
        notes: 'Sunset 4:38 PM. Rooftop scenes MUST start by 3:45 PM.',
      },
      {
        id: uid('day'),
        date: '2026-11-08',
        items: [{ id: uid('st'), type: 'scene', sceneId: SAMPLE_SCENES.edit }],
      },
    ],
  };

  p.scenes = {
    [SAMPLE_SCENES.roof1]: { id: SAMPLE_SCENES.roof1, synopsis: 'The crew waits for June as the light fades.', estMinutes: 120, scriptDay: 'Day 1', extras: '' },
    [SAMPLE_SCENES.stairs]: { id: SAMPLE_SCENES.stairs, synopsis: 'June races up nine floors in costume.', estMinutes: 90, scriptDay: 'Day 1' },
    [SAMPLE_SCENES.roof2]: { id: SAMPLE_SCENES.roof2, synopsis: 'June delivers the monologue at magic hour. The take.', estMinutes: 60, scriptDay: 'Day 1' },
    [SAMPLE_SCENES.edit]: { id: SAMPLE_SCENES.edit, synopsis: 'Maya and Leo watch the take in the edit suite.', estMinutes: 120, scriptDay: 'Day 1' },
  };

  p.notes = 'Sample project — explore every module, then create your own from the Project Library.\n\nKey risk: the elevator is out of service, so all gear goes up nine flights of stairs.';

  await backend.createProject(p);
  const ctx: SampleContext = {
    addAsset: (bytes, ext) => backend.importAsset(p.id, bytes, ext),
    addSvg: (svg) => backend.importAsset(p.id, new TextEncoder().encode(svg), 'svg'),
  };
  const seeders = [
    seedCast,
    seedCrew,
    seedContacts,
    seedLocations,
    seedElements,
    seedBreakdown,
    seedScript,
    seedAv,
    seedShots,
    seedStoryboard,
    seedLighting,
    seedSchedule,
    seedCallsheets,
    seedGear,
    seedBudget,
    seedPost,
    seedTasks,
    seedOverview,
  ];
  for (const seed of seeders) {
    try {
      await seed(p, ctx);
    } catch (e) {
      console.error('Sample seeding failed for a module', e);
    }
  }
  await backend.saveProject(p);
  return p;
}
