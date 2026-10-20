/* ==========================================================================
   Lighting diagram item library: every placeable kind with its category,
   geometry model and default properties. Pure data (no React).
   ========================================================================== */

export type Category = 'camera' | 'light' | 'grip' | 'sound' | 'people' | 'set' | 'note';

/**
 * symbol – fixed-size icon, resized with `scale`
 * box    – real-world sized object, resized with `w` / `h` (canvas px)
 * path   – polyline through `points` (relative to x/y)
 * text   – free text label, resized with `scale`
 */
export type Shape = 'symbol' | 'box' | 'path' | 'text';

export interface KindDef {
  kind: string;
  label: string;
  category: Category;
  shape: Shape;
  /** symbol: base size in px (bounding box at scale 1); box: minimum size in px */
  w: number;
  h: number;
  /** box kinds: default size in diagram units [width, depth] */
  size?: [number, number];
  /** stacking hint used when inserting: 0 floor, 1 set & walls, 2 equipment & people, 3 annotations */
  layer: 0 | 1 | 2 | 3;
  /** extra search words */
  keywords?: string;
  /** default kind-specific props */
  props?: Record<string, unknown>;
  /** default item colour */
  color?: string;
  /** default label */
  label0?: string;
  /** lights: width of the emitting face in px (beam starts there) and its local y */
  emit?: { w: number; y: number };
  /** cameras: local y of the lens front (FOV origin) */
  front?: number;
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'camera', label: 'Cameras' },
  { id: 'light', label: 'Lights' },
  { id: 'grip', label: 'Modifiers & grip' },
  { id: 'sound', label: 'Sound' },
  { id: 'people', label: 'People' },
  { id: 'set', label: 'Set & furniture' },
  { id: 'note', label: 'Annotations' },
];

const L = (kind: string, label: string, w: number, h: number, props: Record<string, unknown>, emit: { w: number; y: number }, keywords = ''): KindDef => ({
  kind,
  label,
  category: 'light',
  shape: 'symbol',
  w,
  h,
  layer: 2,
  props: { intensity: 100, ...props },
  emit,
  keywords: `light lamp fixture ${keywords}`,
});

export const KINDS: KindDef[] = [
  /* ------------------------------------------------------------ cameras */
  { kind: 'camera.cinema', label: 'Cinema camera', category: 'camera', shape: 'symbol', w: 44, h: 66, layer: 2, front: -32, props: { lens: 35, sensor: 's35', fovLength: 15, showFov: true }, keywords: 'camera alexa red venice fx6 cine' },
  { kind: 'camera.mirrorless', label: 'Mirrorless / DSLR', category: 'camera', shape: 'symbol', w: 46, h: 38, layer: 2, front: -19, props: { lens: 35, sensor: 'ff', fovLength: 12, showFov: true }, keywords: 'camera dslr fx3 a7s gh lumix canon' },
  { kind: 'camera.phone', label: 'Phone / vertical rig', category: 'camera', shape: 'symbol', w: 34, h: 34, layer: 2, front: -9, props: { lens: 24, sensor: 'ff', fovLength: 8, showFov: true }, keywords: 'camera iphone smartphone gimbal vertical social' },
  { kind: 'camera.drone', label: 'Drone', category: 'camera', shape: 'symbol', w: 60, h: 60, layer: 2, front: -14, props: { lens: 24, sensor: 'ff', fovLength: 25, showFov: true }, keywords: 'camera drone aerial dji mavic' },

  /* ------------------------------------------------------------ lights */
  L('light.fresnel', 'Fresnel', 42, 46, { beam: 40, throw: 12, cct: 3200, modifier: 'Barn doors' }, { w: 24, y: -16 }, 'tungsten arri 650 1k 2k hard'),
  L('light.panel', 'LED panel 1x1', 48, 24, { beam: 60, throw: 10, cct: 5600 }, { w: 38, y: -9 }, 'led panel 1x1 litepanels astra gemini skypanel bicolor'),
  L('light.mat', 'LED mat', 58, 24, { beam: 110, throw: 8, cct: 5600 }, { w: 50, y: -8 }, 'led mat flexible flex aladdin'),
  L('light.softbox', 'Softbox', 54, 42, { beam: 90, throw: 8, cct: 5600, modifier: 'Softbox' }, { w: 48, y: -16 }, 'softbox soft key aputure'),
  L('light.lantern', 'Octabox / lantern', 46, 46, { beam: 300, throw: 7, cct: 5600, modifier: 'Lantern' }, { w: 26, y: 0 }, 'octa octabox lantern paper soft'),
  L('light.chinaball', 'China ball', 40, 40, { beam: 360, throw: 6, cct: 3200 }, { w: 30, y: 0 }, 'china ball paper lantern chimera soft overhead'),
  L('light.tube', 'Tube light', 70, 18, { beam: 150, throw: 6, cct: 5600 }, { w: 60, y: -3 }, 'tube astera titan pavotube quasar kino rgb'),
  L('light.ring', 'Ring light', 48, 48, { beam: 70, throw: 5, cct: 5600 }, { w: 30, y: 0 }, 'ring beauty vlog'),
  L('light.par', 'PAR / spot / Leko', 32, 54, { beam: 26, throw: 18, cct: 3200, modifier: 'None' }, { w: 12, y: -28 }, 'par spot ellipsoidal leko source four profile projector'),
  L('light.hmi', 'HMI', 52, 60, { beam: 35, throw: 25, cct: 5600, modifier: 'Barn doors' }, { w: 32, y: -19 }, 'hmi daylight m18 m40 joker arrisun'),
  L('light.practical', 'Practical lamp', 34, 34, { beam: 360, throw: 4, cct: 2700, intensity: 60 }, { w: 16, y: 0 }, 'practical lamp table lamp bulb household'),
  L('light.window', 'Window light', 70, 20, { beam: 110, throw: 16, cct: 5600 }, { w: 62, y: -2 }, 'window daylight ambient natural source'),
  L('light.sun', 'Sun', 50, 54, { beam: 30, throw: 30, cct: 5600 }, { w: 22, y: 0 }, 'sun daylight natural golden hour magic hour sunset'),
  L('light.screen', 'Screen glow', 46, 22, { beam: 120, throw: 4, cct: 6500, intensity: 50 }, { w: 38, y: -7 }, 'monitor screen tv laptop glow practical'),

  /* ------------------------------------------------------------ grip */
  { kind: 'grip.flag', label: 'Flag / floppy', category: 'grip', shape: 'box', w: 12, h: 4, size: [2, 0.15], layer: 2, label0: 'Flag', keywords: 'flag floppy cutter solid black negative' },
  { kind: 'grip.scrim', label: 'Scrim / silk frame', category: 'grip', shape: 'box', w: 12, h: 4, size: [4, 0.2], layer: 2, label0: '4x4 Silk', keywords: 'silk scrim frame butterfly overhead single double net' },
  { kind: 'grip.diffusion', label: 'Diffusion frame', category: 'grip', shape: 'box', w: 12, h: 4, size: [4, 0.2], layer: 2, label0: '4x4 Diffusion', props: { diffusion: '1/2 Grid cloth' }, keywords: 'diffusion frame grid cloth 216 250 opal' },
  { kind: 'grip.bounce', label: 'Bounce / reflector', category: 'grip', shape: 'box', w: 12, h: 4, size: [4, 0.2], layer: 2, label0: '4x4 Bounce', props: { surface: 'white' }, keywords: 'bounce reflector poly beadboard ultrabounce silver gold white' },
  { kind: 'grip.negfill', label: 'Negative fill', category: 'grip', shape: 'box', w: 12, h: 4, size: [4, 0.2], layer: 2, label0: 'Neg fill', keywords: 'negative fill duvetyne black solid' },
  { kind: 'grip.vflat', label: 'V-flat', category: 'grip', shape: 'box', w: 16, h: 12, size: [4, 2.6], layer: 2, label0: 'V-flat', keywords: 'vflat v flat foamcore bounce black white' },
  { kind: 'grip.umbrella', label: 'Umbrella', category: 'grip', shape: 'symbol', w: 48, h: 40, layer: 2, keywords: 'umbrella shoot through bounce' },
  { kind: 'grip.cstand', label: 'C-stand', category: 'grip', shape: 'symbol', w: 40, h: 44, layer: 2, keywords: 'c-stand century stand grip arm' },
  { kind: 'grip.sandbag', label: 'Sandbag', category: 'grip', shape: 'symbol', w: 30, h: 18, layer: 2, keywords: 'sandbag shot bag weight safety' },
  { kind: 'grip.applebox', label: 'Apple box', category: 'grip', shape: 'box', w: 10, h: 8, size: [1.67, 1], layer: 2, label0: '', keywords: 'apple box full half quarter pancake' },
  { kind: 'grip.track', label: 'Dolly track', category: 'grip', shape: 'box', w: 30, h: 16, size: [8, 2], layer: 1, label0: '8 ft track', keywords: 'dolly track rails tracking doorway' },
  { kind: 'grip.slider', label: 'Slider', category: 'grip', shape: 'box', w: 24, h: 8, size: [3, 0.45], layer: 1, label0: 'Slider', keywords: 'slider rail camera move' },
  { kind: 'grip.wind', label: 'Wind machine', category: 'grip', shape: 'symbol', w: 44, h: 52, layer: 2, label0: 'Wind machine', keywords: 'wind machine fan blower sfx' },

  /* ------------------------------------------------------------ sound */
  { kind: 'sound.boom', label: 'Boom mic', category: 'sound', shape: 'symbol', w: 30, h: 96, layer: 2, keywords: 'boom pole shotgun mic microphone sound' },
  { kind: 'sound.lav', label: 'Lav mic', category: 'sound', shape: 'symbol', w: 24, h: 24, layer: 2, keywords: 'lav lavalier wireless mic' },
  { kind: 'sound.recorder', label: 'Sound cart / recorder', category: 'sound', shape: 'symbol', w: 42, h: 30, layer: 2, label0: 'Sound', keywords: 'recorder mixer sound cart bag zoom zaxcom' },

  /* ------------------------------------------------------------ people */
  { kind: 'person.actor', label: 'Actor / subject', category: 'people', shape: 'symbol', w: 52, h: 36, layer: 2, color: '#e5484d', label0: 'Actor', keywords: 'actor talent subject person cast' },
  { kind: 'person.crew', label: 'Crew member', category: 'people', shape: 'symbol', w: 48, h: 34, layer: 2, color: '#7c8394', label0: 'Crew', keywords: 'crew person operator director grip' },
  { kind: 'person.monitor', label: 'Director monitor', category: 'people', shape: 'symbol', w: 60, h: 50, layer: 2, label0: 'Video village', keywords: 'monitor video village director client playback' },

  /* ------------------------------------------------------------ set */
  { kind: 'set.wall', label: 'Wall', category: 'set', shape: 'box', w: 8, h: 4, size: [8, 0.4], layer: 1, label0: '', keywords: 'wall partition flat ledge parapet' },
  { kind: 'set.door', label: 'Door', category: 'set', shape: 'box', w: 16, h: 16, size: [3, 3], layer: 1, label0: '', keywords: 'door entrance exit' },
  { kind: 'set.window', label: 'Window', category: 'set', shape: 'box', w: 16, h: 6, size: [4, 0.4], layer: 1, label0: '', keywords: 'window glass' },
  { kind: 'set.table', label: 'Table', category: 'set', shape: 'box', w: 16, h: 12, size: [6, 3], layer: 1, label0: '', keywords: 'table dining' },
  { kind: 'set.roundtable', label: 'Round table', category: 'set', shape: 'box', w: 12, h: 12, size: [4, 4], layer: 1, label0: '', keywords: 'round table cafe' },
  { kind: 'set.chair', label: 'Chair', category: 'set', shape: 'box', w: 8, h: 8, size: [1.7, 1.7], layer: 1, label0: '', keywords: 'chair seat stool' },
  { kind: 'set.sofa', label: 'Sofa', category: 'set', shape: 'box', w: 20, h: 12, size: [7, 3], layer: 1, label0: '', keywords: 'sofa couch' },
  { kind: 'set.bed', label: 'Bed', category: 'set', shape: 'box', w: 16, h: 20, size: [5, 6.7], layer: 1, label0: '', keywords: 'bed queen king mattress bedroom' },
  { kind: 'set.desk', label: 'Desk', category: 'set', shape: 'box', w: 16, h: 10, size: [5, 2.5], layer: 1, label0: '', keywords: 'desk office workstation' },
  { kind: 'set.counter', label: 'Kitchen counter', category: 'set', shape: 'box', w: 20, h: 8, size: [8, 2], layer: 1, label0: '', keywords: 'kitchen counter sink stove island bar' },
  { kind: 'set.tv', label: 'TV / monitor', category: 'set', shape: 'box', w: 12, h: 4, size: [3.5, 0.5], layer: 2, label0: '', keywords: 'tv monitor screen television computer' },
  { kind: 'set.plant', label: 'Plant', category: 'set', shape: 'box', w: 8, h: 8, size: [2, 2], layer: 1, label0: '', keywords: 'plant tree greenery pot' },
  { kind: 'set.car', label: 'Car', category: 'set', shape: 'box', w: 20, h: 40, size: [6, 15], layer: 1, label0: '', keywords: 'car vehicle auto picture car interior' },
  { kind: 'set.stairs', label: 'Stairs', category: 'set', shape: 'box', w: 12, h: 20, size: [4, 8], layer: 1, label0: '', keywords: 'stairs steps staircase' },
  { kind: 'set.rug', label: 'Rug / floor area', category: 'set', shape: 'box', w: 12, h: 12, size: [8, 5], layer: 0, label0: '', color: '#b9a37f', keywords: 'rug carpet floor mat area' },
  { kind: 'set.watertower', label: 'Water tower', category: 'set', shape: 'box', w: 20, h: 20, size: [9, 9], layer: 1, label0: 'Water tower', keywords: 'water tower tank rooftop' },

  /* ------------------------------------------------------------ annotations */
  { kind: 'note.text', label: 'Text', category: 'note', shape: 'text', w: 60, h: 20, layer: 3, label0: 'Text', props: { size: 16 }, keywords: 'text label note title' },
  { kind: 'note.arrow', label: 'Movement arrow', category: 'note', shape: 'path', w: 4, h: 4, layer: 3, color: '#3e8ef7', props: { width: 2.5, head: 'end', dashed: true }, keywords: 'arrow movement blocking path camera move dolly walk' },
  { kind: 'note.line', label: 'Line', category: 'note', shape: 'path', w: 4, h: 4, layer: 3, props: { width: 2 }, keywords: 'line' },
  { kind: 'shape.rect', label: 'Rectangle', category: 'note', shape: 'box', w: 8, h: 8, size: [4, 3], layer: 3, color: '#6d4aff', props: { fill: true }, keywords: 'rectangle box area zone shape' },
  { kind: 'shape.ellipse', label: 'Ellipse', category: 'note', shape: 'box', w: 8, h: 8, size: [4, 4], layer: 3, color: '#6d4aff', props: { fill: true }, keywords: 'ellipse circle area zone shape' },
  { kind: 'note.dimension', label: 'Dimension', category: 'note', shape: 'path', w: 4, h: 4, layer: 3, props: { width: 1.25 }, keywords: 'dimension measure distance ruler length' },
];

export const KIND_BY_ID: Record<string, KindDef> = Object.fromEntries(KINDS.map((k) => [k.kind, k]));

/** Older / generic kind names mapped to library kinds. */
const ALIASES: Record<string, string> = {
  camera: 'camera.cinema',
  light: 'light.fresnel',
  person: 'person.actor',
  actor: 'person.actor',
  crew: 'person.crew',
  text: 'note.text',
  arrow: 'note.arrow',
  line: 'note.line',
  dimension: 'note.dimension',
  rect: 'shape.rect',
  ellipse: 'shape.ellipse',
  'furniture.table': 'set.table',
  'furniture.chair': 'set.chair',
  'furniture.sofa': 'set.sofa',
  'furniture.bed': 'set.bed',
  'furniture.desk': 'set.desk',
};

const UNKNOWN: KindDef = { kind: 'unknown', label: 'Object', category: 'note', shape: 'box', w: 8, h: 8, size: [2, 2], layer: 2 };

/** Library definition for an item kind (never undefined: unknown kinds render as a plain box). */
export function kindDef(kind: string | undefined): KindDef {
  if (!kind) return UNKNOWN;
  const k = KIND_BY_ID[kind] ?? KIND_BY_ID[ALIASES[kind] ?? ''];
  if (k) return k;
  const prefix = kind.split('.')[0];
  if (prefix === 'light') return KIND_BY_ID['light.fresnel'];
  if (prefix === 'camera') return KIND_BY_ID['camera.cinema'];
  return UNKNOWN;
}

export const isLightKind = (kind: string | undefined) => kindDef(kind).category === 'light';
export const isCameraKind = (kind: string | undefined) => kindDef(kind).category === 'camera';

/* ------------------------------------------------------------------ option lists */

export const LIGHT_PURPOSES = ['Key', 'Fill', 'Back/Rim', 'Hair', 'Background', 'Practical', 'Kicker', 'Bounce', 'Motivated'];

export const PURPOSE_COLORS: Record<string, string> = {
  Key: '#e5484d',
  Fill: '#3e8ef7',
  'Back/Rim': '#f5a524',
  Hair: '#a464f5',
  Background: '#12b886',
  Practical: '#e8590c',
  Kicker: '#15aabf',
  Bounce: '#868e96',
  Motivated: '#2fb36d',
};

export const MODIFIERS = ['None', 'Softbox', 'Lantern', 'Octabox', 'Grid', 'Barn doors', 'Diffusion 1/4', 'Diffusion 1/2', 'Diffusion Full', 'Snoot', 'Fresnel lens', 'Reflector', 'Dome', 'Projection / gobo'];

export interface FixtureDef {
  name: string;
  watts: number;
  cct?: number;
}

/** Common fixtures (combo suggestions; picking one fills wattage). */
export const FIXTURES: FixtureDef[] = [
  { name: 'Aputure LS 600d Pro', watts: 600, cct: 5600 },
  { name: 'Aputure LS 600x Pro', watts: 600 },
  { name: 'Aputure LS 1200d Pro', watts: 1200, cct: 5600 },
  { name: 'Aputure LS 300x', watts: 300 },
  { name: 'Aputure Nova P300c', watts: 300 },
  { name: 'Aputure MC', watts: 5 },
  { name: 'Aputure INFINIBAR PB12', watts: 50 },
  { name: 'Amaran 200x S', watts: 200 },
  { name: 'Amaran 100d S', watts: 100, cct: 5600 },
  { name: 'Amaran F22c (mat)', watts: 200 },
  { name: 'Nanlite Forza 500', watts: 500, cct: 5600 },
  { name: 'Nanlite Forza 300 II', watts: 300, cct: 5600 },
  { name: 'Nanlite PavoTube II 30X', watts: 40 },
  { name: 'ARRI SkyPanel S60-C', watts: 450 },
  { name: 'ARRI SkyPanel S30-C', watts: 220 },
  { name: 'ARRI Orbiter', watts: 500 },
  { name: 'ARRI 150 Fresnel', watts: 150, cct: 3200 },
  { name: 'ARRI 300 Fresnel', watts: 300, cct: 3200 },
  { name: 'ARRI 650 Fresnel', watts: 650, cct: 3200 },
  { name: 'ARRI 1K Fresnel', watts: 1000, cct: 3200 },
  { name: 'ARRI M18 HMI', watts: 1800, cct: 5600 },
  { name: 'ARRI M40 HMI', watts: 4000, cct: 5600 },
  { name: 'K5600 Joker 800 HMI', watts: 800, cct: 5600 },
  { name: 'Astera Titan Tube', watts: 72 },
  { name: 'Astera Helios Tube', watts: 36 },
  { name: 'Litepanels Gemini 2x1', watts: 350 },
  { name: 'Litepanels Gemini 1x1', watts: 200 },
  { name: 'Litepanels Astra 1x1', watts: 100 },
  { name: 'Kino Flo Diva-Lite 401', watts: 200 },
  { name: 'Kino Flo 4ft 4-bank', watts: 220 },
  { name: 'Kino Flo FreeStyle 31', watts: 160 },
  { name: 'Godox SL60W', watts: 60, cct: 5600 },
  { name: 'Godox VL300', watts: 300, cct: 5600 },
  { name: 'Quasar Science Rainbow 2 (4ft)', watts: 50 },
  { name: 'Creamsource Vortex8', watts: 650 },
  { name: 'Dedolight DLH4', watts: 150, cct: 3200 },
  { name: 'ETC Source Four (Leko)', watts: 575, cct: 3200 },
  { name: '1K Open face (Redhead)', watts: 1000, cct: 3200 },
  { name: '2K Open face (Blonde)', watts: 2000, cct: 3200 },
  { name: 'China ball 250W', watts: 250, cct: 3200 },
  { name: 'Household practical bulb', watts: 60, cct: 2700 },
  { name: 'Natural sun', watts: 0, cct: 5600 },
  { name: 'Natural daylight (window)', watts: 0, cct: 5600 },
];

export const FIXTURE_BY_NAME = new Map(FIXTURES.map((f) => [f.name.toLowerCase(), f]));

export const CAMERA_BODIES = [
  'ARRI Alexa 35',
  'ARRI Alexa Mini LF',
  'ARRI Alexa Mini',
  'RED V-Raptor',
  'RED Komodo 6K',
  'Sony Venice 2',
  'Sony Burano',
  'Sony FX9',
  'Sony FX6',
  'Sony FX3',
  'Sony A7S III',
  'Canon C500 Mk II',
  'Canon C70',
  'Canon R5 C',
  'Blackmagic URSA Cine 12K',
  'Blackmagic Pocket 6K',
  'Panasonic GH6',
  'Panasonic S5 II',
  'iPhone 16 Pro',
  'DJI Mavic 3 Pro',
  'DJI Inspire 3',
];

export interface SensorDef {
  value: string;
  label: string;
  /** sensor width in mm */
  width: number;
}

export const SENSORS: SensorDef[] = [
  { value: 'ff', label: 'Full frame (36 mm)', width: 36 },
  { value: 'lf', label: 'Large format (36.7 mm)', width: 36.7 },
  { value: 's35', label: 'Super 35 (24.9 mm)', width: 24.89 },
  { value: 'apsc', label: 'APS-C (23.5 mm)', width: 23.5 },
  { value: 'mft', label: 'Micro Four Thirds (17.3 mm)', width: 17.3 },
  { value: 's16', label: 'Super 16 (12.5 mm)', width: 12.52 },
];

export const SENSOR_BY_ID: Record<string, SensorDef> = Object.fromEntries(SENSORS.map((s) => [s.value, s]));

export const BOUNCE_SURFACES = [
  { value: 'white', label: 'White' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'zebra', label: 'Silver / gold zebra' },
  { value: 'ultrabounce', label: 'White / black (Ultrabounce)' },
];

export const CREW_ROLES = ['Director', 'DP', 'Camera operator', '1st AC', 'Gaffer', 'Key grip', 'Boom operator', 'Sound mixer', 'Script supervisor', 'Client', 'Producer', 'HMU', 'Wardrobe', 'PA'];
