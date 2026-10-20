import type {
  BreakdownCategory,
  CastStatus,
  CrewStatus,
  ElementStatus,
  GearStatus,
  LocationStatus,
  Phase,
  PostStatus,
  ProjectStatus,
  ProjectType,
  ShotStatus,
  ContactCategory,
} from '@/types';

export interface Option<V extends string = string> {
  value: V;
  label: string;
  color?: string;
  hint?: string;
}

/* ------------------------------------------------------------------ project */

export const PROJECT_TYPES: Option<ProjectType>[] = [
  { value: 'short', label: 'Short Film' },
  { value: 'feature', label: 'Feature Film' },
  { value: 'commercial', label: 'Commercial / Ad' },
  { value: 'music_video', label: 'Music Video' },
  { value: 'trailer', label: 'Trailer / Teaser / Promo' },
  { value: 'corporate', label: 'Corporate / Brand Video' },
  { value: 'training', label: 'Training / Educational' },
  { value: 'social', label: 'Social / YouTube' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'minidoc', label: 'Mini-doc / Short Doc' },
  { value: 'interview', label: 'Interview / Podcast' },
  { value: 'episodic', label: 'Episodic / Series' },
  { value: 'other', label: 'Other' },
];

export const PROJECT_STATUSES: Option<ProjectStatus>[] = [
  { value: 'development', label: 'Development', color: '#8e8c99' },
  { value: 'pre', label: 'Pre-production', color: '#3e8ef7' },
  { value: 'production', label: 'Production', color: '#f5a524' },
  { value: 'post', label: 'Post-production', color: '#a464f5' },
  { value: 'delivered', label: 'Delivered', color: '#2fb36d' },
  { value: 'archived', label: 'Archived', color: '#6b6b6b' },
];

export const ASPECT_RATIOS: Option[] = [
  { value: '16:9', label: '16:9 (HD / UHD)' },
  { value: '2.39:1', label: '2.39:1 (Scope)' },
  { value: '1.85:1', label: '1.85:1 (Flat)' },
  { value: '2:1', label: '2:1 (Univisium)' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1 (Square)' },
  { value: '4:5', label: '4:5 (Feed portrait)' },
  { value: '9:16', label: '9:16 (Vertical / Reels / Shorts)' },
];

/** numeric width/height ratio for an aspect string like '16:9' or '2.39:1' */
export function aspectToNumber(aspect: string | undefined): number {
  if (!aspect) return 16 / 9;
  const m = aspect.match(/^\s*([\d.]+)\s*[:x/]\s*([\d.]+)\s*$/i);
  if (!m) return 16 / 9;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  return w > 0 && h > 0 ? w / h : 16 / 9;
}

export const RESOLUTIONS: Option[] = [
  { value: '1920x1080', label: '1920×1080 (HD)' },
  { value: '3840x2160', label: '3840×2160 (UHD 4K)' },
  { value: '4096x2160', label: '4096×2160 (DCI 4K)' },
  { value: '2048x1080', label: '2048×1080 (DCI 2K)' },
  { value: '1080x1920', label: '1080×1920 (Vertical HD)' },
  { value: '2160x3840', label: '2160×3840 (Vertical 4K)' },
  { value: '1080x1080', label: '1080×1080 (Square)' },
  { value: '1080x1350', label: '1080×1350 (4:5)' },
  { value: '1280x720', label: '1280×720 (HD 720)' },
];

export const FRAME_RATES: Option[] = ['23.976', '24', '25', '29.97', '30', '48', '50', '59.94', '60', '120'].map((v) => ({
  value: v,
  label: `${v} fps`,
}));

/* ------------------------------------------------------------------ breakdown */

export interface CategoryDef {
  id: BreakdownCategory;
  label: string;
  short: string;
  color: string;
}

/** Industry-style breakdown colour coding. */
export const BREAKDOWN_CATEGORIES: CategoryDef[] = [
  { id: 'cast', label: 'Cast Members', short: 'Cast', color: '#e5484d' },
  { id: 'extras', label: 'Background / Extras', short: 'Extras', color: '#2f9e44' },
  { id: 'stunts', label: 'Stunts', short: 'Stunts', color: '#f76707' },
  { id: 'props', label: 'Props', short: 'Props', color: '#8e44ec' },
  { id: 'wardrobe', label: 'Wardrobe', short: 'Wardrobe', color: '#1c7ed6' },
  { id: 'makeup', label: 'Makeup / Hair', short: 'HMU', color: '#e64980' },
  { id: 'set_dressing', label: 'Set Dressing', short: 'Set Dress', color: '#a0703c' },
  { id: 'vehicles', label: 'Vehicles', short: 'Vehicles', color: '#d6336c' },
  { id: 'animals', label: 'Animals / Livestock', short: 'Animals', color: '#b7791f' },
  { id: 'sfx', label: 'Special Effects', short: 'SFX', color: '#3b5bdb' },
  { id: 'vfx', label: 'Visual Effects', short: 'VFX', color: '#0ca678' },
  { id: 'sound', label: 'Sound Effects', short: 'Sound', color: '#8d5524' },
  { id: 'music', label: 'Music', short: 'Music', color: '#6741d9' },
  { id: 'special_equipment', label: 'Special Equipment', short: 'Equip', color: '#495057' },
  { id: 'greenery', label: 'Greenery', short: 'Greens', color: '#5c940d' },
  { id: 'security', label: 'Security', short: 'Security', color: '#343a40' },
  { id: 'misc', label: 'Miscellaneous / Notes', short: 'Misc', color: '#868e96' },
];

export const CATEGORY_BY_ID: Record<BreakdownCategory, CategoryDef> = Object.fromEntries(
  BREAKDOWN_CATEGORIES.map((c) => [c.id, c]),
) as Record<BreakdownCategory, CategoryDef>;

export const ELEMENT_STATUSES: Option<ElementStatus>[] = [
  { value: 'needed', label: 'Needed', color: '#e5484d' },
  { value: 'sourcing', label: 'Sourcing', color: '#f5a524' },
  { value: 'acquired', label: 'Acquired', color: '#3e8ef7' },
  { value: 'on_set', label: 'On set', color: '#2fb36d' },
  { value: 'returned', label: 'Returned', color: '#8e8c99' },
];

/* ------------------------------------------------------------------ scenes */

/** Standard stripboard colours by INT/EXT + DAY/NIGHT. */
export const STRIP_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  'INT-DAY': { bg: '#ffffff', fg: '#111111', label: 'Int. Day' },
  'EXT-DAY': { bg: '#fff3a3', fg: '#111111', label: 'Ext. Day' },
  'INT-NIGHT': { bg: '#a9c8ff', fg: '#111111', label: 'Int. Night' },
  'EXT-NIGHT': { bg: '#a8e6b4', fg: '#111111', label: 'Ext. Night' },
  'INT-DAWN': { bg: '#ffd6e7', fg: '#111111', label: 'Int. Dawn/Dusk' },
  'EXT-DAWN': { bg: '#ffc9a8', fg: '#111111', label: 'Ext. Dawn/Dusk' },
  'INT-DUSK': { bg: '#ffd6e7', fg: '#111111', label: 'Int. Dawn/Dusk' },
  'EXT-DUSK': { bg: '#ffc9a8', fg: '#111111', label: 'Ext. Dawn/Dusk' },
  OTHER: { bg: '#e9e9ee', fg: '#111111', label: 'Other' },
};

export const TIMES_OF_DAY = [
  'DAY',
  'NIGHT',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
  'SUNRISE',
  'SUNSET',
  'MAGIC HOUR',
  'LATE NIGHT',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'SAME',
  'SAME TIME',
];

export const SCENE_INTROS = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EXT./INT. ', 'I/E. ', 'EST. '];

export const TRANSITIONS = [
  'CUT TO:',
  'FADE IN:',
  'FADE OUT.',
  'FADE TO BLACK.',
  'DISSOLVE TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'CUT TO BLACK.',
  'TIME CUT:',
  'INTERCUT WITH:',
  'BACK TO:',
  'FADE TO:',
  'WIPE TO:',
];

export const CHARACTER_EXTENSIONS = ["V.O.", 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'FILTERED', 'ON PHONE', 'ON TV', 'SUBTITLED', 'INTO PHONE'];

export const SHOT_TYPES_SCRIPT = [
  'ANGLE ON',
  'CLOSE ON',
  'CLOSE UP',
  'EXTREME CLOSE UP',
  'WIDE SHOT',
  'ESTABLISHING SHOT',
  'INSERT',
  'POV',
  'BACK TO SCENE',
  'TRACKING SHOT',
  'AERIAL SHOT',
  'OVER THE SHOULDER',
  'TWO SHOT',
  'REVERSE ANGLE',
  'MONTAGE',
  'SERIES OF SHOTS',
  'FLASHBACK',
  'END FLASHBACK',
  'SUPER:',
  'TITLE CARD:',
];

/* ------------------------------------------------------------------ shots */

export const SHOT_SIZES: Option[] = [
  { value: 'EWS', label: 'EWS – Extreme Wide' },
  { value: 'WS', label: 'WS – Wide' },
  { value: 'FS', label: 'FS – Full Shot' },
  { value: 'MWS', label: 'MWS – Medium Wide' },
  { value: 'MS', label: 'MS – Medium' },
  { value: 'MCU', label: 'MCU – Medium Close-Up' },
  { value: 'CU', label: 'CU – Close-Up' },
  { value: 'ECU', label: 'ECU – Extreme Close-Up' },
  { value: 'OTS', label: 'OTS – Over the Shoulder' },
  { value: 'POV', label: 'POV – Point of View' },
  { value: '2S', label: '2S – Two Shot' },
  { value: '3S', label: '3S – Three Shot' },
  { value: 'INSERT', label: 'Insert' },
  { value: 'EST', label: 'Establishing' },
  { value: 'CUTAWAY', label: 'Cutaway' },
];

export const SHOT_ANGLES: Option[] = [
  'Eye level',
  'High angle',
  'Low angle',
  'Overhead',
  "Bird's eye",
  "Worm's eye",
  'Dutch',
  'Over the shoulder',
  'Profile',
  'Hip level',
  'Ground level',
].map((v) => ({ value: v, label: v }));

export const SHOT_MOVEMENTS: Option[] = [
  'Static',
  'Pan',
  'Tilt',
  'Push in',
  'Pull out',
  'Dolly in',
  'Dolly out',
  'Truck left',
  'Truck right',
  'Pedestal',
  'Crane up',
  'Crane down',
  'Arc / Orbit',
  'Tracking',
  'Handheld',
  'Zoom in',
  'Zoom out',
  'Whip pan',
  'Rack focus',
  'Dolly zoom',
].map((v) => ({ value: v, label: v }));

export const SHOT_EQUIPMENT: Option[] = [
  'Tripod',
  'Sticks + fluid head',
  'Gimbal',
  'Handheld',
  'Shoulder rig',
  'Easyrig',
  'Steadicam',
  'Slider',
  'Dolly',
  'Jib / Crane',
  'Drone',
  'Car mount',
  'Hi-hat',
  'Technocrane',
  'Teleprompter',
].map((v) => ({ value: v, label: v }));

export const LENSES: Option[] = ['8mm', '12mm', '14mm', '16mm', '18mm', '21mm', '24mm', '25mm', '28mm', '32mm', '35mm', '40mm', '50mm', '65mm', '75mm', '85mm', '100mm', '135mm', '200mm', 'Zoom', 'Macro'].map((v) => ({
  value: v,
  label: v,
}));

export const SHOT_STATUSES: Option<ShotStatus>[] = [
  { value: 'planned', label: 'Planned', color: '#8e8c99' },
  { value: 'ready', label: 'Ready', color: '#3e8ef7' },
  { value: 'shot', label: 'Shot', color: '#2fb36d' },
  { value: 'omitted', label: 'Omitted', color: '#e5484d' },
];

export const SOUND_TYPES: Option[] = [
  { value: 'sync', label: 'Sync' },
  { value: 'mos', label: 'MOS' },
  { value: 'vo', label: 'VO' },
  { value: 'playback', label: 'Playback' },
  { value: 'wild', label: 'Wild track' },
];

/* ------------------------------------------------------------------ people */

export const DEPARTMENTS = [
  'Production',
  'Direction',
  'Writing',
  'Camera',
  'Grip',
  'Electric',
  'Sound',
  'Art',
  'Props',
  'Wardrobe',
  'Hair & Makeup',
  'Locations',
  'Transportation',
  'Catering / Craft',
  'Stunts',
  'VFX',
  'Post-production',
  'Music',
  'Marketing / BTS',
  'Client / Agency',
  'Other',
] as const;

export const POSITIONS_BY_DEPT: Record<string, string[]> = {
  Production: ['Executive Producer', 'Producer', 'Line Producer', 'Production Manager', 'Production Coordinator', 'Production Assistant', 'Production Accountant'],
  Direction: ['Director', '1st Assistant Director', '2nd Assistant Director', 'Script Supervisor'],
  Writing: ['Writer', 'Story Editor'],
  Camera: ['Director of Photography', 'Camera Operator', '1st AC (Focus Puller)', '2nd AC', 'DIT', 'Steadicam Operator', 'Drone Pilot', 'Still Photographer', 'Video Assist'],
  Grip: ['Key Grip', 'Best Boy Grip', 'Dolly Grip', 'Grip'],
  Electric: ['Gaffer', 'Best Boy Electric', 'Electrician', 'Generator Operator', 'Board Operator'],
  Sound: ['Production Sound Mixer', 'Boom Operator', 'Sound Utility'],
  Art: ['Production Designer', 'Art Director', 'Set Decorator', 'Set Dresser', 'Art PA'],
  Props: ['Prop Master', 'Assistant Props'],
  Wardrobe: ['Costume Designer', 'Wardrobe Supervisor', 'Wardrobe Assistant'],
  'Hair & Makeup': ['Key Makeup Artist', 'Makeup Artist', 'Key Hair Stylist', 'Hair Stylist', 'SFX Makeup'],
  Locations: ['Location Manager', 'Location Scout', 'Location Assistant'],
  Transportation: ['Transportation Coordinator', 'Driver'],
  'Catering / Craft': ['Caterer', 'Craft Services'],
  Stunts: ['Stunt Coordinator', 'Stunt Performer'],
  VFX: ['VFX Supervisor', 'VFX Artist'],
  'Post-production': ['Editor', 'Assistant Editor', 'Colorist', 'Sound Designer', 'Re-recording Mixer', 'Motion Graphics', 'Post Supervisor'],
  Music: ['Composer', 'Music Supervisor'],
  'Marketing / BTS': ['BTS Videographer', 'Social Media', 'Publicist'],
  'Client / Agency': ['Client', 'Agency Producer', 'Creative Director', 'Brand Manager'],
  Other: ['Talent Wrangler', 'Medic', 'Security', 'Teacher / Welfare'],
};

export const CAST_STATUSES: Option<CastStatus>[] = [
  { value: 'considering', label: 'Considering', color: '#8e8c99' },
  { value: 'auditioned', label: 'Auditioned', color: '#3e8ef7' },
  { value: 'callback', label: 'Callback', color: '#7c5cff' },
  { value: 'offered', label: 'Offered', color: '#f5a524' },
  { value: 'confirmed', label: 'Confirmed', color: '#2fb36d' },
  { value: 'declined', label: 'Declined', color: '#e5484d' },
];

export const CREW_STATUSES: Option<CrewStatus>[] = [
  { value: 'considering', label: 'Considering', color: '#8e8c99' },
  { value: 'hold', label: 'On hold', color: '#f5a524' },
  { value: 'confirmed', label: 'Confirmed', color: '#2fb36d' },
  { value: 'declined', label: 'Declined', color: '#e5484d' },
];

export const CONTACT_CATEGORIES: Option<ContactCategory>[] = [
  { value: 'client', label: 'Client' },
  { value: 'agency', label: 'Agency' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'rental', label: 'Rental house' },
  { value: 'location', label: 'Location' },
  { value: 'talent_agent', label: 'Talent agent' },
  { value: 'post', label: 'Post facility' },
  { value: 'other', label: 'Other' },
];

export const RATE_UNITS: Option[] = [
  { value: 'hour', label: '/ hour' },
  { value: 'day', label: '/ day' },
  { value: 'week', label: '/ week' },
  { value: 'flat', label: 'flat' },
];

/* ------------------------------------------------------------------ locations */

export const LOCATION_STATUSES: Option<LocationStatus>[] = [
  { value: 'scouting', label: 'Scouting', color: '#8e8c99' },
  { value: 'option', label: 'Option', color: '#f5a524' },
  { value: 'confirmed', label: 'Confirmed', color: '#2fb36d' },
  { value: 'declined', label: 'Declined', color: '#e5484d' },
];

/* ------------------------------------------------------------------ gear */

export const GEAR_CATEGORIES = [
  'Camera',
  'Lenses',
  'Camera Support',
  'Monitoring',
  'Media & Storage',
  'Power',
  'Lighting',
  'Grip',
  'Sound',
  'Teleprompter',
  'Drone',
  'Production',
  'Vehicles',
  'Expendables',
  'Other',
];

export const GEAR_STATUSES: Option<GearStatus>[] = [
  { value: 'needed', label: 'Needed', color: '#e5484d' },
  { value: 'reserved', label: 'Reserved', color: '#f5a524' },
  { value: 'confirmed', label: 'Confirmed', color: '#3e8ef7' },
  { value: 'picked_up', label: 'Picked up', color: '#2fb36d' },
  { value: 'returned', label: 'Returned', color: '#8e8c99' },
];

/* ------------------------------------------------------------------ tasks / post */

export const PHASES: Option<Phase>[] = [
  { value: 'development', label: 'Development', color: '#8e8c99' },
  { value: 'pre', label: 'Pre-production', color: '#3e8ef7' },
  { value: 'production', label: 'Production', color: '#f5a524' },
  { value: 'post', label: 'Post-production', color: '#a464f5' },
  { value: 'delivery', label: 'Delivery', color: '#2fb36d' },
];

export const POST_STATUSES: Option<PostStatus>[] = [
  { value: 'not_started', label: 'Not started', color: '#8e8c99' },
  { value: 'in_progress', label: 'In progress', color: '#3e8ef7' },
  { value: 'review', label: 'In review', color: '#f5a524' },
  { value: 'approved', label: 'Approved', color: '#7c5cff' },
  { value: 'done', label: 'Done', color: '#2fb36d' },
  { value: 'blocked', label: 'Blocked', color: '#e5484d' },
];

export const DELIVERY_PLATFORMS: Option[] = [
  'YouTube',
  'YouTube Shorts',
  'Instagram Reels',
  'Instagram Feed',
  'TikTok',
  'LinkedIn',
  'Facebook',
  'X / Twitter',
  'Vimeo',
  'Website',
  'LMS / SCORM',
  'Broadcast',
  'Cinema / DCP',
  'Festival',
  'Internal',
  'Archive master',
].map((v) => ({ value: v, label: v }));

/** Frequently used palette for colour pickers. */
export const SWATCHES = [
  '#e5484d',
  '#f76707',
  '#f5a524',
  '#fcc419',
  '#94d82d',
  '#2fb36d',
  '#12b886',
  '#15aabf',
  '#3e8ef7',
  '#4c6ef5',
  '#7c5cff',
  '#a464f5',
  '#e64980',
  '#a0703c',
  '#868e96',
  '#343a40',
];

export function optionLabel(options: Option[], value: string | undefined | null): string {
  if (value == null) return '';
  return options.find((o) => o.value === value)?.label ?? String(value);
}

export function optionColor(options: Option[], value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  return options.find((o) => o.value === value)?.color;
}
