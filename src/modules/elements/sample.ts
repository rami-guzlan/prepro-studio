import type { BreakdownElement, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { SAMPLE_ELEMENTS, SAMPLE_SCENES } from '@/sample/context';

/* Simple reference "photos" (SVG illustrations) so the props & wardrobe lists print nicely. */
const bg = (fill: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="800" height="600"><rect width="400" height="300" fill="${fill}"/>${body}</svg>`;

const CAMERA_SVG = bg(
  '#e9e4da',
  `<ellipse cx="200" cy="262" rx="150" ry="14" fill="#000" opacity=".12"/>
   <circle cx="150" cy="78" r="52" fill="#3b3b40"/><circle cx="150" cy="78" r="18" fill="#6d6d73"/>
   <circle cx="250" cy="78" r="52" fill="#3b3b40"/><circle cx="250" cy="78" r="18" fill="#6d6d73"/>
   <rect x="110" y="120" width="190" height="110" rx="10" fill="#2a2a2e"/>
   <rect x="120" y="132" width="70" height="22" rx="4" fill="#4a4a50"/>
   <rect x="300" y="150" width="34" height="56" rx="4" fill="#1d1d20"/>
   <circle cx="345" cy="178" r="30" fill="#1d1d20"/><circle cx="345" cy="178" r="20" fill="#5a6d82"/><circle cx="338" cy="171" r="6" fill="#c9d6e3" opacity=".7"/>
   <rect x="196" y="230" width="18" height="30" fill="#7a5a3a"/>`,
);

const COAT_SVG = bg(
  '#efe6e3',
  `<path d="M160 40 L240 40 L262 62 L318 90 L336 250 L300 254 L292 140 L286 270 L114 270 L108 140 L100 254 L64 250 L82 90 L138 62 Z" fill="#c92a2a"/>
   <path d="M160 40 L200 92 L240 40 L226 36 L200 70 L174 36 Z" fill="#a51d1d"/>
   <line x1="200" y1="92" x2="200" y2="270" stroke="#8f1717" stroke-width="3"/>
   <circle cx="214" cy="120" r="6" fill="#2b2b2b"/><circle cx="214" cy="160" r="6" fill="#2b2b2b"/><circle cx="214" cy="200" r="6" fill="#2b2b2b"/>
   <path d="M120 196 L170 196" stroke="#8f1717" stroke-width="4"/><path d="M230 196 L280 196" stroke="#8f1717" stroke-width="4"/>`,
);

const WALKIE_SVG = bg(
  '#e3e8ec',
  `<rect x="214" y="30" width="14" height="70" rx="5" fill="#222"/>
   <rect x="150" y="86" width="104" height="186" rx="16" fill="#26282b"/>
   <rect x="166" y="104" width="72" height="38" rx="5" fill="#9fc26a"/>
   <g fill="#4a4d52">${Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) => `<circle cx="${178 + c * 16}" cy="${170 + r * 16}" r="4"/>`).join('')).join('')}</g>
   <circle cx="176" cy="80" r="9" fill="#f08c00"/>`,
);

const HARNESS_SVG = bg(
  '#e6ebe4',
  `<path d="M150 60 C150 40 250 40 250 60 L262 200 L230 270 L170 270 L138 200 Z" fill="none" stroke="#e67700" stroke-width="16" stroke-linejoin="round"/>
   <line x1="200" y1="40" x2="200" y2="12" stroke="#495057" stroke-width="6"/>
   <rect x="182" y="120" width="36" height="28" rx="4" fill="#495057"/>
   <path d="M140 200 L260 200" stroke="#e67700" stroke-width="16"/>`,
);

/** Adds demo data for the elements module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, ctx: SampleContext): Promise<void> {
  const E = SAMPLE_ELEMENTS;
  const S = SAMPLE_SCENES;
  const charId = (name: string) => p.characters.find((c) => c.name === name)?.id;
  const el = (id: string) => p.elements.find((e) => e.id === id);
  const photo = async (svg: string) => {
    try {
      return await ctx.addSvg(svg);
    } catch {
      return undefined;
    }
  };

  // enrich the elements tagged in the sample script
  const camera = el(E.camera);
  if (camera) Object.assign(camera, { owner: 'Props', photo: await photo(CAMERA_SVG), notes: 'Pick up Thu after 2 PM. Insured value $1,500.' });
  const walkie = el(E.walkie);
  if (walkie) Object.assign(walkie, { owner: 'Production', photo: await photo(WALKIE_SVG), notes: 'Hero + beater (the beater gets dropped in Sc. 3).' });
  const coat = el(E.coat);
  if (coat) Object.assign(coat, { owner: 'Wardrobe', characterId: charId('JUNE'), vendor: 'Beacon’s Closet', photo: await photo(COAT_SVG) });
  const script = el(E.script);
  if (script) Object.assign(script, { owner: 'Props', characterId: charId('JUNE'), cost: 15 });
  const monitors = el(E.monitors);
  if (monitors) Object.assign(monitors, { owner: 'Art', vendor: 'Studio 9 Post', notes: 'Borrowed from the post house; playback files from the DIT.' });
  const wind = el(E.wind);
  if (wind) Object.assign(wind, { owner: 'Grip', vendor: 'Lensworks Rentals' });
  const crackle = el(E.crackle);
  if (crackle) Object.assign(crackle, { owner: 'Sound', notes: 'Record 30 s of wild walkie static on the roof.' });

  const add = (e: Omit<BreakdownElement, 'id'> & { id: string }) => {
    if (!p.elements.some((x) => x.id === e.id)) p.elements.push(e);
  };

  add({
    id: 'el_sample_harness',
    category: 'stunts',
    name: 'SAFETY HARNESS',
    description: 'Hidden fall-arrest harness under the coat, anchored to the roof bulkhead. Rigged & checked by stunt coordinator.',
    quantity: 1,
    status: 'acquired',
    source: 'rent',
    cost: 120,
    vendor: 'Lensworks Rentals',
    owner: 'Stunts',
    characterId: charId('JUNE'),
    sceneIds: [S.roof2],
    photo: await photo(HARNESS_SVG),
    notes: 'Fitting at 2 PM on Day 1, before HMU touch-ups.',
  });
  add({
    id: 'el_sample_rail',
    category: 'special_equipment',
    name: 'SAFETY RAIL (HIDDEN)',
    description: 'Temporary rail 3 ft behind the ledge line, kept out of frame. Speed-rail + clamps.',
    quantity: 1,
    status: 'sourcing',
    source: 'rent',
    cost: 80,
    vendor: 'Lensworks Rentals',
    owner: 'Grip',
    sceneIds: [S.roof1, S.roof2],
  });
  add({
    id: 'el_sample_sweat',
    category: 'makeup',
    name: 'SWEAT & WINDSWEPT HAIR',
    description: 'Glycerin sweat after the nine-floor climb; hair progressively loosened by the wind. Match continuity between Sc. 2 and 3.',
    quantity: 1,
    status: 'acquired',
    source: 'own',
    owner: 'Hair & Makeup',
    characterId: charId('JUNE'),
    sceneIds: [S.stairs, S.roof2],
  });
  add({
    id: 'el_sample_maya_look',
    category: 'wardrobe',
    name: 'DIRECTOR LAYERS',
    description: 'Worn denim jacket, grey scarf, black jeans, sneakers. Headset around the neck.',
    quantity: 1,
    status: 'acquired',
    source: 'own',
    owner: 'Wardrobe',
    characterId: charId('MAYA'),
    sceneIds: [S.roof1, S.roof2, S.edit],
  });
  add({
    id: 'el_sample_leo_look',
    category: 'wardrobe',
    name: 'DP VEST & BEANIE',
    description: 'Utility vest over a flannel, navy beanie, fingerless gloves.',
    quantity: 1,
    status: 'sourcing',
    source: 'buy',
    cost: 65,
    owner: 'Wardrobe',
    characterId: charId('LEO'),
    sceneIds: [S.roof1, S.roof2, S.edit],
  });
  add({
    id: 'el_sample_sam_look',
    category: 'wardrobe',
    name: 'PA HOODIE',
    description: 'Oversized orange hoodie (production logo), cargo pants, running shoes.',
    quantity: 2,
    status: 'needed',
    source: 'buy',
    cost: 40,
    owner: 'Wardrobe',
    characterId: charId('SAM'),
    sceneIds: [S.roof1, S.roof2],
    notes: 'Second hoodie in case of rain.',
  });
  add({
    id: 'el_sample_headset',
    category: 'props',
    name: 'DIRECTOR HEADSET',
    description: 'Comtek-style headset, worn askew.',
    quantity: 1,
    status: 'acquired',
    source: 'borrow',
    owner: 'Sound',
    characterId: charId('MAYA'),
    sceneIds: [S.roof1, S.roof2],
  });
  add({
    id: 'el_sample_fieldmonitor',
    category: 'props',
    name: 'FIELD MONITOR',
    description: '7" on-camera monitor on a stand for Maya to stare at (practical, playing a live feed).',
    quantity: 1,
    status: 'acquired',
    source: 'rent',
    cost: 45,
    vendor: 'Lensworks Rentals',
    owner: 'Props',
    sceneIds: [S.roof1],
  });
  add({
    id: 'el_sample_desk',
    category: 'set_dressing',
    name: 'EDIT DESK & DESK LAMP',
    description: 'Cluttered edit desk: keyboard, jog wheel, coffee cups, sticky notes on the monitors.',
    quantity: 1,
    status: 'needed',
    source: 'borrow',
    owner: 'Art',
    sceneIds: [S.edit],
  });
  add({
    id: 'el_sample_skyvfx',
    category: 'vfx',
    name: 'SKY REPLACEMENT (BACKUP)',
    description: 'Only if clouds kill the sunset: shoot a clean plate for a sky replacement.',
    quantity: 1,
    status: 'needed',
    source: 'other',
    owner: 'VFX / Post',
    sceneIds: [S.roof2],
  });
}
