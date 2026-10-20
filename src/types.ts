/* ==========================================================================
   PrePro Studio — project data model
   --------------------------------------------------------------------------
   One ProjectData object is one production (a video / film / campaign).
   It is saved as <projectFolder>/project.json; images live in
   <projectFolder>/assets and are referenced by their asset file name
   (e.g. "a_k3j9x2.jpg"). Use assetUrl(name) from '@/backend' to display.

   Conventions
   - Every list item has a stable `id` (see uid() in '@/lib/id').
   - Dates are ISO 'YYYY-MM-DD' strings, times are 24h 'HH:MM' strings.
   - Optional fields may be missing in older files: always read defensively.
   - Scenes are owned by the screenplay: a scene's id ("sid") is stored on
     its Scene Heading paragraph. SceneMeta (project.scenes[sid]) holds
     extra per-scene data (synopsis, estimates, manual breakdown, ...).
   ========================================================================== */

export type ID = string;
/** 'YYYY-MM-DD' */
export type ISODate = string;
/** 'HH:MM' 24-hour */
export type TimeStr = string;

export const SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Project                                                                     */
/* -------------------------------------------------------------------------- */

export type ProjectType =
  | 'short'
  | 'feature'
  | 'commercial'
  | 'music_video'
  | 'corporate'
  | 'training'
  | 'social'
  | 'documentary'
  | 'episodic'
  | 'interview'
  | 'trailer'
  | 'minidoc'
  | 'other';

export type ProjectStatus = 'development' | 'pre' | 'production' | 'post' | 'delivered' | 'archived';

export type PaperSize = 'letter' | 'a4';

export interface ProjectMeta {
  title: string;
  subtitle?: string; // episode / version / campaign name
  projectType: ProjectType;
  status: ProjectStatus;
  logline: string;
  synopsis: string;
  client?: string;
  productionCompany?: string;
  director?: string;
  producer?: string;
  writer?: string;
  /** e.g. '16:9', '2.39:1', '9:16' */
  aspectRatio: string;
  /** e.g. '3840x2160' */
  resolution: string;
  /** e.g. '23.976' */
  frameRate: string;
  /** target runtime 'HH:MM:SS' or 'MM:SS' */
  targetRuntime?: string;
  shootStart?: ISODate;
  shootEnd?: ISODate;
  deliveryDate?: ISODate;
  /** accent colour used on covers / print headers */
  color: string;
  logo?: string; // asset
  poster?: string; // asset (cover image shown in the library)
  tags?: string[];
  /** the built-in demo project (can be reset from the library) */
  demo?: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export type ElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'general';

export interface ElementFlow {
  /** Enter at the end of a paragraph that has text */
  enter: ElementType;
  /** Enter on an empty paragraph (changes the paragraph in place) */
  enterEmpty: ElementType;
  /** Tab in a paragraph that has text (creates a new paragraph) */
  tab: ElementType;
  /** Tab on an empty paragraph (changes the paragraph in place) */
  tabEmpty: ElementType;
  /** Shift+Tab on an empty paragraph (changes the paragraph in place) */
  shiftTabEmpty: ElementType;
}

export interface ScriptFormatSettings {
  font: 'Courier Prime' | 'Courier New';
  sceneNumbers: 'none' | 'left' | 'right' | 'both';
  sceneHeadingBold: boolean;
  /** blank lines before a scene heading (1 or 2) */
  sceneHeadingSpacing: 1 | 2;
  /** automatically show (CONT'D) when the same character speaks again after action */
  autoContd: boolean;
  /** show (MORE) / (CONT'D) when dialogue breaks across pages */
  moreContd: boolean;
  /** show page number on page 1 */
  firstPageNumber: boolean;
  /** convert typed 'int. ' / 'ext. ' etc. into scene headings, etc. */
  smartFormat: boolean;
  /** autocomplete popups (SmartType) */
  smartType: boolean;
  /** Enter/Tab element flow (like Final Draft > Elements) */
  flow: Record<ElementType, ElementFlow>;
  /** optional running header text printed top-left on every page (e.g. 'BLUE REV. 10/18/26') */
  header?: string;
  /** optional footer text */
  footer?: string;
  /** show page view (sheets + page breaks) in the editor */
  pageView: boolean;
  /** editor zoom (1 = 100%) */
  zoom: number;
}

export interface PrintSettings {
  /** show the project title in running headers */
  showProjectTitle: boolean;
  /** show the logo on document title blocks */
  showLogo: boolean;
  /** print a "CONFIDENTIAL" line in the footer */
  confidential: boolean;
  /** optional diagonal watermark text (e.g. "DRAFT") */
  watermark?: string;
  /** colour (true) or black & white (false) output */
  color: boolean;
}

export interface ProjectSettings {
  paperSize: PaperSize;
  dateFormat: 'MDY' | 'DMY' | 'YMD';
  timeFormat: '12h' | '24h';
  currency: string; // ISO 4217, e.g. 'USD'
  /** Monday-first week in calendars */
  weekStartsMonday: boolean;
  script: ScriptFormatSettings;
  print: PrintSettings;
}

/* -------------------------------------------------------------------------- */
/* Script                                                                      */
/* -------------------------------------------------------------------------- */

export interface TitlePage {
  title: string;
  credit: string; // 'Written by'
  authors: string; // multi-line allowed
  source?: string; // 'Based on the novel by ...'
  draft?: string; // 'First Draft'
  draftDate?: string; // free text date
  contact?: string; // multi-line, printed bottom-left
  copyright?: string;
  notes?: string; // printed bottom-right (WGA reg, etc.)
}

/** A ScriptNote is attached to a range of script text (ProseMirror mark 'note'). */
export interface ScriptNote {
  id: ID;
  text: string;
  color: string;
  author?: string;
  createdAt: string;
  resolved?: boolean;
}

/** One row of a two-column (A/V) script. */
export interface AVRow {
  id: ID;
  /** optional segment / scene title shown as a full-width band above the row */
  segment?: string;
  video: string;
  audio: string;
  /** seconds */
  duration?: number;
  image?: string; // asset (thumbnail / storyboard frame)
  shotId?: ID;
  notes?: string;
}

export interface AVScript {
  rows: AVRow[];
  /** column titles */
  videoLabel?: string;
  audioLabel?: string;
  showImages?: boolean;
  showDurations?: boolean;
}

/* ---------------------------------------------------------------- mind dump */

/** A sticky note on the Mind Dump board. Coordinates are board pixels. */
export interface IdeaNote {
  id: ID;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** already sent to the script / turned into a shot or task */
  used?: boolean;
}

/** A titled frame that visually groups notes (membership = notes inside its rectangle). */
export interface IdeaGroup {
  id: ID;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** An arrow between two notes. */
export interface IdeaLink {
  id: ID;
  from: ID;
  to: ID;
}

/** One brainstorm board (an idea batch / category): its own free-writing text and sticky-note board. */
export interface MindBoard {
  id: ID;
  name: string;
  color?: string;
  /** free-writing text */
  text: string;
  notes: IdeaNote[];
  groups: IdeaGroup[];
  links: IdeaLink[];
}

/** Unstructured brainstorming of the Script module (and of Marketing Spaces' Ideas): one or more boards.
    Files from before boards existed have text / notes / groups / links at the top level; normalizeMind() moves them into the first board. */
export interface MindDump {
  boards: MindBoard[];
}

export interface ScriptData {
  /** which script editor the project primarily uses */
  mode: 'screenplay' | 'av';
  /** ProseMirror document JSON (see src/script-core/schema.ts) */
  doc: unknown;
  titlePage: TitlePage;
  notes: Record<ID, ScriptNote>;
  av: AVScript;
  /** brainstorming: free text + sticky-note board */
  mind: MindDump;
  /** bumps on every saved change of the screenplay doc */
  revision: number;
}

/* -------------------------------------------------------------------------- */
/* Scenes & breakdown                                                          */
/* -------------------------------------------------------------------------- */

export interface SceneMeta {
  id: ID; // = sid on the scene heading paragraph
  synopsis?: string;
  /** index-card / strip colour override */
  color?: string;
  /** estimated shooting time in minutes */
  estMinutes?: number;
  /** story day, e.g. 'Day 1' */
  scriptDay?: string;
  /** real-world location override (otherwise derived from the set name via Location.sets) */
  locationId?: ID;
  /** breakdown elements added manually to this scene (in addition to tags in the script) */
  elementIds?: ID[];
  /** characters present but not speaking (added manually) */
  characterIds?: ID[];
  /** background / extras description, e.g. '20 diners' */
  extras?: string;
  /** locked scene number (overrides auto numbering) */
  number?: string;
  notes?: string;
  /** page count override in eighths */
  eighthsOverride?: number;
}

export type BreakdownCategory =
  | 'cast'
  | 'extras'
  | 'stunts'
  | 'props'
  | 'wardrobe'
  | 'makeup'
  | 'set_dressing'
  | 'vehicles'
  | 'animals'
  | 'sfx'
  | 'vfx'
  | 'sound'
  | 'music'
  | 'special_equipment'
  | 'greenery'
  | 'security'
  | 'misc';

export type ElementStatus = 'needed' | 'sourcing' | 'acquired' | 'on_set' | 'returned';

export interface BreakdownElement {
  id: ID;
  category: Exclude<BreakdownCategory, 'cast'>;
  name: string; // canonical, usually UPPERCASE as tagged
  description?: string;
  photo?: string; // asset
  quantity?: number;
  status?: ElementStatus;
  source?: 'buy' | 'rent' | 'borrow' | 'make' | 'own' | 'other';
  cost?: number;
  vendor?: string;
  /** responsible department or person */
  owner?: string;
  /** wardrobe / makeup for a specific character */
  characterId?: ID;
  /** scenes linked manually (tags in the script are found automatically) */
  sceneIds?: ID[];
  notes?: string;
}

export interface Character {
  id: ID;
  /** canonical uppercase name as used in character cues */
  name: string;
  aliases?: string[];
  description?: string;
  age?: string;
  gender?: string;
  /** cast member playing this character */
  castId?: ID;
  /** cast "board ID" number used on strips / call sheets */
  number?: number;
  color?: string;
  notes?: string;
  /** created by the user (not auto-detected from the script) */
  manual?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Shots & storyboards                                                         */
/* -------------------------------------------------------------------------- */

export type ShotStatus = 'planned' | 'ready' | 'shot' | 'omitted';

export interface Shot {
  id: ID;
  sceneId?: ID;
  /** shot number within its scene: '1', '2', '2A' ... */
  number: string;
  title?: string;
  description: string;
  /** storyboard frame image (asset) */
  image?: string;
  /** transparent PNG overlay drawn in the sketch tool (asset) */
  drawing?: string;
  shotSize?: string; // 'ECU' | 'CU' | 'MCU' | 'MS' | 'MWS' | 'WS' | 'EWS' | 'OTS' | 'POV' | 'INSERT' | ...
  angle?: string;
  movement?: string;
  equipment?: string;
  lens?: string; // '35mm'
  camera?: string; // 'A' | 'B'
  frameRate?: string;
  /** dialogue / VO / sound notes shown under storyboard frames */
  audio?: string;
  sound?: 'sync' | 'mos' | 'vo' | 'playback' | 'wild';
  characterIds?: ID[];
  locationId?: ID;
  /** seconds of screen time (used by the animatic) */
  duration?: number;
  /** estimated setup minutes */
  setupMinutes?: number;
  /** estimated shooting minutes */
  shootMinutes?: number;
  vfx?: boolean;
  diagramId?: ID;
  status: ShotStatus;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Lighting diagrams                                                           */
/* -------------------------------------------------------------------------- */

export interface DiagramItem {
  id: ID;
  /** item type key from the lighting library, e.g. 'camera', 'light.fresnel', 'person', 'furniture.table', 'shape.rect', 'text', 'arrow' */
  kind: string;
  x: number;
  y: number;
  rotation: number; // degrees
  scale: number; // 1 = default size
  /** for shapes / walls */
  w?: number;
  h?: number;
  /** for lines / arrows / walls: polyline points relative to (x,y) */
  points?: [number, number][];
  label?: string;
  color?: string;
  locked?: boolean;
  hidden?: boolean;
  /** kind-specific properties, e.g. light: { fixture, watts, cct, gel, intensity, modifier, beam, notes } */
  props?: Record<string, unknown>;
}

export interface LightingDiagram {
  id: ID;
  name: string;
  sceneIds: ID[];
  shotIds?: ID[];
  locationId?: ID;
  notes: string;
  /** canvas size in pixels (logical) */
  width: number;
  height: number;
  /** pixels per foot/metre */
  pxPerUnit: number;
  units: 'ft' | 'm';
  showGrid: boolean;
  background?: string; // asset (floor plan image)
  backgroundOpacity?: number;
  items: DiagramItem[];
  updatedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

export type CastStatus = 'considering' | 'auditioned' | 'callback' | 'offered' | 'confirmed' | 'declined';
export type CrewStatus = 'considering' | 'hold' | 'confirmed' | 'declined';
export type RateUnit = 'hour' | 'day' | 'week' | 'flat';

export interface Measurements {
  height?: string;
  weight?: string;
  chest?: string;
  waist?: string;
  hips?: string;
  inseam?: string;
  neck?: string;
  sleeve?: string;
  jacket?: string;
  shirt?: string;
  pants?: string;
  dress?: string;
  shoe?: string;
  hat?: string;
  glove?: string;
  hair?: string;
  eyes?: string;
}

export interface CastMember {
  id: ID;
  name: string;
  photo?: string; // asset (headshot)
  /* The roles an actor plays are stored on the characters (Character.castId).
     Use charactersForCast(project, castId) from '@/derived/project'. */
  status: CastStatus;
  pronouns?: string;
  phone?: string;
  email?: string;
  address?: string;
  agent?: string;
  agency?: string;
  agentPhone?: string;
  agentEmail?: string;
  union?: string; // 'SAG-AFTRA', 'Non-union', ...
  rate?: number;
  rateUnit?: RateUnit;
  availability?: string;
  measurements?: Measurements;
  dietary?: string;
  allergies?: string;
  medical?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  releaseSigned?: boolean;
  contractSigned?: boolean;
  notes?: string;
}

export interface CrewMember {
  id: ID;
  name: string;
  photo?: string;
  department: string; // see DEPARTMENTS in '@/lib/constants'
  position: string;
  status: CrewStatus;
  pronouns?: string;
  phone?: string;
  email?: string;
  address?: string;
  union?: string;
  rate?: number;
  rateUnit?: RateUnit;
  /** default call time 'HH:MM' */
  defaultCall?: TimeStr;
  kit?: string; // kit / gear they bring
  dealMemo?: boolean;
  dietary?: string;
  allergies?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  notes?: string;
}

export type ContactCategory = 'client' | 'agency' | 'vendor' | 'rental' | 'location' | 'talent_agent' | 'post' | 'other';

export interface Contact {
  id: ID;
  name: string;
  company?: string;
  role?: string;
  category: ContactCategory;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Locations                                                                   */
/* -------------------------------------------------------------------------- */

export type LocationStatus = 'scouting' | 'option' | 'confirmed' | 'declined';

export interface Hospital {
  name?: string;
  address?: string;
  phone?: string;
}

export interface Location {
  id: ID;
  name: string;
  address?: string;
  kind?: 'interior' | 'exterior' | 'both' | 'studio' | 'virtual';
  status: LocationStatus;
  photos: string[]; // assets
  /** script set names (from scene headings, UPPERCASE) shot at this location, e.g. "JOHN'S KITCHEN" */
  sets: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  /** decimal degrees, used for sunrise/sunset on call sheets */
  lat?: number;
  lng?: number;
  fee?: number;
  permitRequired?: boolean;
  permitStatus?: 'n/a' | 'needed' | 'applied' | 'approved';
  parking?: string;
  power?: string;
  restrooms?: string;
  loadIn?: string;
  wifi?: string;
  hospital?: Hospital;
  availability?: string;
  scoutNotes?: string;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Schedule & call sheets                                                      */
/* -------------------------------------------------------------------------- */

export type StripItem =
  | { id: ID; type: 'scene'; sceneId: ID }
  | { id: ID; type: 'banner'; text: string; color?: string };

export interface ShootDay {
  id: ID;
  date?: ISODate;
  /** optional label e.g. 'Pickup day' */
  label?: string;
  items: StripItem[];
  notes?: string;
}

export interface Schedule {
  days: ShootDay[];
  /** ordering of unscheduled scene ids in the boneyard (scenes not listed are appended in script order) */
  boneyardOrder?: ID[];
  startDate?: ISODate;
  skipWeekends?: boolean;
}

export interface CastCall {
  pickup?: TimeStr;
  call?: TimeStr;
  hmu?: TimeStr; // hair & makeup
  onSet?: TimeStr;
  notes?: string;
}

export interface CrewCall {
  call?: TimeStr;
  notes?: string;
}

export interface CallSheet {
  /** = ShootDay.id */
  dayId: ID;
  crewCall?: TimeStr;
  shootingCall?: TimeStr;
  breakfast?: TimeStr;
  lunch?: TimeStr;
  estWrap?: TimeStr;
  weather?: {
    summary?: string;
    high?: string;
    low?: string;
    precip?: string;
    sunrise?: string;
    sunset?: string;
  };
  /** override of locations for the day (otherwise derived from scheduled scenes) */
  locationIds?: ID[];
  hospital?: Hospital;
  parking?: string;
  basecamp?: string;
  generalNotes?: string;
  safetyNotes?: string;
  specialInstructions?: string;
  /** keyed by CastMember.id */
  castCalls: Record<ID, CastCall>;
  /** keyed by CrewMember.id */
  crewCalls: Record<ID, CrewCall>;
  /** keyed by department name */
  deptNotes: Record<string, string>;
  extras?: string;
  walkieChannels?: string;
  advanceNotes?: string;
  version?: number;
  quote?: string;
}

/* -------------------------------------------------------------------------- */
/* Gear & budget                                                               */
/* -------------------------------------------------------------------------- */

export type GearStatus = 'needed' | 'reserved' | 'confirmed' | 'picked_up' | 'returned';

export interface GearItem {
  id: ID;
  category: string; // 'Camera' | 'Lenses' | 'Grip' | 'Lighting' | 'Sound' | ...
  name: string;
  qty: number;
  source: 'owned' | 'rental' | 'purchase' | 'borrow';
  vendor?: string;
  /** cost per day (rentals) */
  dayRate?: number;
  days?: number;
  /** flat cost (purchases / packages) */
  flatCost?: number;
  status: GearStatus;
  serial?: string;
  assignedTo?: ID; // crew id
  /** packed / checked in the prep checklist */
  checked?: boolean;
  /** created from a lighting diagram item */
  fromDiagram?: boolean;
  notes?: string;
}

export interface BudgetLine {
  id: ID;
  description: string;
  qty: number;
  unit: string; // 'day' | 'week' | 'flat' | 'hour' | 'each' ...
  rate: number;
  /** multiplier, e.g. number of people (x) */
  x: number;
  /** fringe % added on top (payroll taxes etc.) */
  fringePct?: number;
  actual?: number;
  notes?: string;
}

export interface BudgetCategory {
  id: ID;
  code?: string;
  name: string;
  section: 'atl' | 'btl' | 'post' | 'other';
  lines: BudgetLine[];
}

export interface Budget {
  contingencyPct: number;
  taxPct?: number;
  insurancePct?: number;
  categories: BudgetCategory[];
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                       */
/* -------------------------------------------------------------------------- */

export type Phase = 'development' | 'pre' | 'production' | 'post' | 'delivery';

export interface Task {
  id: ID;
  title: string;
  phase: Phase;
  status: 'todo' | 'doing' | 'done';
  due?: ISODate;
  assignee?: string;
  priority?: 'low' | 'normal' | 'high';
  notes?: string;
}

export interface Milestone {
  id: ID;
  name: string;
  date?: ISODate;
  phase: Phase;
  done?: boolean;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Post-production                                                             */
/* -------------------------------------------------------------------------- */

export type PostStatus = 'not_started' | 'in_progress' | 'review' | 'approved' | 'done' | 'blocked';

export interface PostMilestone {
  id: ID;
  name: string; // 'Assembly', 'Rough cut', 'Picture lock', ...
  start?: ISODate;
  end?: ISODate;
  owner?: string;
  status: PostStatus;
  notes?: string;
}

export interface Deliverable {
  id: ID;
  name: string;
  platform?: string; // 'YouTube', 'Instagram Reels', 'Broadcast', ...
  resolution?: string;
  aspectRatio?: string;
  frameRate?: string;
  codec?: string;
  container?: string;
  audio?: string; // 'Stereo', '5.1'
  loudness?: string; // '-14 LUFS'
  captions?: string; // 'SRT burned-in' ...
  duration?: string;
  due?: ISODate;
  status: PostStatus;
  notes?: string;
}

export interface VfxShot {
  id: ID;
  code: string; // 'VFX_010'
  sceneId?: ID;
  shotId?: ID;
  description: string;
  vendor?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  due?: ISODate;
  status: PostStatus;
  cost?: number;
  notes?: string;
}

export interface MusicCue {
  id: ID;
  cue: string; // '1M1'
  title: string;
  composer?: string;
  publisher?: string;
  source?: 'original' | 'library' | 'licensed' | 'source';
  tcIn?: string;
  tcOut?: string;
  duration?: string;
  usage?: string; // 'BI' (background instrumental), 'BV', 'VI', 'VV', 'MT' ...
  license?: string; // license status / ID
  status: PostStatus;
  notes?: string;
}

export interface AdrLine {
  id: ID;
  characterId?: ID;
  sceneId?: ID;
  line: string;
  reason?: string; // 'noise', 'performance', 'added line' ...
  tc?: string;
  status: PostStatus;
  notes?: string;
}

export interface GraphicItem {
  id: ID;
  kind: string; // 'Lower third' | 'Title' | 'End card' | 'Callout' | 'Chart' | 'Subtitle' ...
  text: string;
  subtext?: string;
  sceneId?: ID;
  tcIn?: string;
  duration?: string;
  status: PostStatus;
  notes?: string;
}

export interface EditNote {
  id: ID;
  version?: string; // 'v1 rough cut'
  tc?: string;
  note: string;
  author?: string;
  status: 'open' | 'addressed' | 'wontfix';
}

export interface PostData {
  schedule: PostMilestone[];
  deliverables: Deliverable[];
  vfx: VfxShot[];
  music: MusicCue[];
  adr: AdrLine[];
  graphics: GraphicItem[];
  editNotes: EditNote[];
  /** free-form media management / workflow plan (camera cards, backups, proxies, naming, DIT) */
  workflow: string;
}

/* -------------------------------------------------------------------------- */
/* Root                                                                        */
/* -------------------------------------------------------------------------- */

export interface ProjectData {
  schemaVersion: number;
  id: ID;
  meta: ProjectMeta;
  settings: ProjectSettings;
  script: ScriptData;
  scenes: Record<ID, SceneMeta>;
  characters: Character[];
  elements: BreakdownElement[];
  shots: Shot[];
  diagrams: LightingDiagram[];
  cast: CastMember[];
  crew: CrewMember[];
  contacts: Contact[];
  locations: Location[];
  schedule: Schedule;
  /** keyed by ShootDay.id */
  callSheets: Record<ID, CallSheet>;
  gear: GearItem[];
  budget: Budget;
  tasks: Task[];
  milestones: Milestone[];
  post: PostData;
  /** free-form project notes (overview) */
  notes: string;
}

/** Lightweight summary used by the project library. */
export interface ProjectSummary {
  id: ID;
  title: string;
  subtitle?: string;
  projectType: ProjectType;
  status: ProjectStatus;
  color: string;
  poster?: string;
  updatedAt: string;
  createdAt: string;
  /** folder on disk (desktop app only) */
  path?: string;
  /** the built-in demo project */
  demo?: boolean;
}
