/* ==========================================================================
   Marketing Spaces — data model
   --------------------------------------------------------------------------
   A Space is a long-running marketing workspace (a personal brand, a channel,
   a film's release campaign …) as opposed to a Project (one production).
   Saved as <projectsDir>/Marketing Spaces/<slug>__<id>/space.json with
   assets/ and backups/ like projects. Images are asset names (see
   assetUrl in '@/backend').

   The heart of a space is `content`: content pieces (a video, a carousel, a
   newsletter …) that move through stages (idea → published). Each piece has
   one or more `posts` = its distribution on channels (date/time, caption,
   status, results). The calendar shows posts, shoots and milestones.

   Conventions as in src/types.ts: stable `id`s (uid()), dates 'YYYY-MM-DD',
   times 'HH:MM' (24h), optional fields may be missing.
   ========================================================================== */
import type { AVRow, ID, ISODate, MindDump, PaperSize, PrintSettings, TimeStr } from '@/types';
import type { BusinessData } from './business/types';
import type { FinanceData } from './finance/types';
import type { TrainingData } from './training/types';

export const SPACE_SCHEMA_VERSION = 1;

export type SpaceType = 'personal_brand' | 'channel' | 'campaign' | 'business' | 'event' | 'other';

/** Which kind of workspace a space file is. Marketing Spaces and Business spaces can be many;
    Personal Finances and Training are one per user. All share the space store, autosave,
    folders, assets and agent tooling; each kind has its own modules and data (`business`,
    `finance`, `training`). Missing = 'marketing' (files from before kinds existed). */
export type SpaceKind = 'marketing' | 'business' | 'finance' | 'training';

export interface SpaceMeta {
  title: string;
  /** workspace kind (default 'marketing') */
  kind?: SpaceKind;
  type: SpaceType;
  /** what this space is about / mission */
  description: string;
  owner?: string;
  /** accent colour */
  color: string;
  /** emoji or short text shown on the card when there is no cover */
  emoji?: string;
  logo?: string; // asset
  cover?: string; // asset (library card image)
  /** for time-boxed spaces (campaigns, launches) */
  startDate?: ISODate;
  endDate?: ISODate;
  tags?: string[];
  /** the built-in demo space */
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceSettings {
  dateFormat: 'MDY' | 'DMY' | 'YMD';
  timeFormat: '12h' | '24h';
  currency: string;
  weekStartsMonday: boolean;
  paperSize: PaperSize;
  print: PrintSettings;
}

/* ---------------------------------------------------------------- strategy */

/** Long-form strategy text (each field is free text, may contain line breaks). */
export interface Strategy {
  /** who we are / what we stand for; the big idea */
  positioning: string;
  /** why the audience should care */
  valueProp: string;
  tagline?: string;
  /** tone of voice, words we use / avoid */
  voice: string;
  /** the 3–5 things every piece should reinforce */
  keyMessages: string;
  /** competitors / inspiration accounts and what we learn from them */
  competitors?: string;
  /** free-form strategy notes */
  notes: string;
}

export type GoalStatus = 'not_started' | 'on_track' | 'at_risk' | 'off_track' | 'done';

/** A measurable goal (objective + one key result). */
export interface Goal {
  id: ID;
  title: string;
  description?: string;
  /** e.g. 'YouTube subscribers', 'Trailer views', 'Newsletter sign-ups' */
  metric?: string;
  baseline?: number;
  target?: number;
  current?: number;
  /** e.g. '%', 'views' */
  unit?: string;
  start?: ISODate;
  due?: ISODate;
  status: GoalStatus;
  campaignId?: ID;
  notes?: string;
}

export interface Persona {
  id: ID;
  name: string;
  /** one-line summary, e.g. 'Indie filmmakers, 20–35' */
  summary?: string;
  photo?: string; // asset
  demographics?: string;
  pains?: string;
  desires?: string;
  /** where they spend time online */
  whereTheyAre?: string;
  objections?: string;
  notes?: string;
}

/** A recurring theme content is built around. */
export interface Pillar {
  id: ID;
  name: string;
  description?: string;
  color: string;
  /** share of content we aim for (0–100) */
  targetShare?: number;
}

export type TacticStatus = 'idea' | 'planned' | 'active' | 'paused' | 'done';

export interface Tactic {
  id: ID;
  title: string;
  description?: string;
  channelIds?: ID[];
  campaignId?: ID;
  owner?: string;
  status: TacticStatus;
  start?: ISODate;
  end?: ISODate;
  budget?: number;
  notes?: string;
}

/* ---------------------------------------------------------------- channels */

export type Platform =
  | 'youtube'
  | 'youtube_shorts'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'x'
  | 'threads'
  | 'facebook'
  | 'pinterest'
  | 'snapchat'
  | 'twitch'
  | 'newsletter'
  | 'blog'
  | 'podcast'
  | 'website'
  | 'press'
  | 'other';

export interface Channel {
  id: ID;
  platform: Platform;
  /** display name, e.g. 'Alex on Instagram' */
  name: string;
  handle?: string;
  url?: string;
  /** overrides the platform colour */
  color?: string;
  /** target number of posts per cadenceUnit */
  cadence?: number;
  cadenceUnit?: 'week' | 'month';
  /** preferred posting times, e.g. 'Tue/Thu 18:00' */
  bestTimes?: string;
  followers?: number;
  active: boolean;
  notes?: string;
}

/* ---------------------------------------------------------------- campaigns & milestones */

export type CampaignStatus = 'planning' | 'active' | 'paused' | 'complete';

/** A time-boxed push inside a space (e.g. 'Trailer launch week'). */
export interface Campaign {
  id: ID;
  name: string;
  objective?: string;
  description?: string;
  start?: ISODate;
  end?: ISODate;
  status: CampaignStatus;
  color: string;
  budget?: number;
  channelIds?: ID[];
  /** linked production project */
  projectId?: ID;
  /** call to action / offer of the campaign */
  cta?: string;
  notes?: string;
}

export interface SpaceMilestone {
  id: ID;
  name: string;
  date?: ISODate;
  done?: boolean;
  campaignId?: ID;
  notes?: string;
}

/* ---------------------------------------------------------------- content */

export type ContentFormat =
  | 'long_video'
  | 'short_video'
  | 'trailer'
  | 'teaser'
  | 'livestream'
  | 'podcast'
  | 'carousel'
  | 'image'
  | 'story'
  | 'text'
  | 'article'
  | 'newsletter'
  | 'ad'
  | 'other';

export type ContentStage = 'idea' | 'writing' | 'planning' | 'production' | 'editing' | 'ready' | 'published';

export type ShotKind = 'a_roll' | 'b_roll' | 'insert' | 'screen' | 'graphic' | 'other';

/** A shot / clip needed for a piece of content (lightweight shot list). */
export interface ContentShot {
  id: ID;
  description: string;
  kind?: ShotKind;
  /** framing / size, e.g. 'MCU', 'Wide', 'Top-down' */
  framing?: string;
  /** seconds */
  duration?: number;
  location?: string;
  done?: boolean;
  notes?: string;
}

export interface ChecklistItem {
  id: ID;
  text: string;
  done?: boolean;
}

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'skipped';

export interface PostMetrics {
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  /** % click-through rate */
  ctr?: number;
  /** total watch time in hours */
  watchHours?: number;
  /** average view duration in seconds */
  avgViewSec?: number;
  followersGained?: number;
  /** sign-ups / sales / other conversions */
  conversions?: number;
}

/** One distribution of a content piece on a channel. */
export interface ContentPost {
  id: ID;
  channelId: ID;
  date?: ISODate;
  time?: TimeStr;
  status: PostStatus;
  /** platform title (YouTube title, article headline …) */
  title?: string;
  caption?: string;
  hashtags?: string;
  /** live link once published */
  url?: string;
  metrics?: PostMetrics;
  /** when metrics were last updated */
  metricsAt?: ISODate;
  notes?: string;
}

export interface ContentPiece {
  id: ID;
  title: string;
  format: ContentFormat;
  stage: ContentStage;
  priority?: 'low' | 'normal' | 'high';
  owner?: string;
  pillarId?: ID;
  campaignId?: ID;
  personaId?: ID;
  goalIds?: ID[];
  /** linked production project (e.g. the film this trailer is cut from) */
  projectId?: ID;
  /** repurposed from another piece (e.g. a short cut from a long video) */
  sourceId?: ID;
  /* ---- brief */
  /** the core idea / angle in one or two sentences */
  concept?: string;
  hook?: string;
  cta?: string;
  keywords?: string;
  /** inspiration links / references */
  references?: string;
  /** target length, e.g. '0:45' or '1200 words' */
  length?: string;
  /** e.g. '9:16' */
  aspect?: string;
  /* ---- writing */
  /** script for spoken / video content (plain text; sections like HOOK / BODY / CTA welcome) */
  script?: string;
  /** optional two-column A/V script (visual | audio) */
  avRows?: AVRow[];
  /** body copy for text formats (article, newsletter, thread, carousel slides …) */
  copy?: string;
  /* ---- production */
  shootDate?: ISODate;
  /** ShootSession it is filmed in */
  shootId?: ID;
  editDue?: ISODate;
  location?: string;
  talent?: string;
  gear?: string;
  shots: ContentShot[];
  checklist: ChecklistItem[];
  /* ---- assets */
  thumbnail?: string; // asset
  images?: string[]; // assets (references, frames, slides)
  /* ---- distribution */
  posts: ContentPost[];
  notes?: string;
  createdAt: string;
}

/** A batch production day: several pieces filmed together. */
export interface ShootSession {
  id: ID;
  title: string;
  date?: ISODate;
  callTime?: TimeStr;
  wrapTime?: TimeStr;
  location?: string;
  /** content pieces filmed in this session (in order) */
  contentIds: ID[];
  people?: string;
  gear?: string;
  checklist: ChecklistItem[];
  notes?: string;
}

/* ---------------------------------------------------------------- brand kit & assets */

export type AssetKind = 'logo' | 'image' | 'color' | 'font' | 'template' | 'video' | 'audio' | 'link' | 'doc' | 'resource' | 'other';

/** What a downloadable resource is (lead magnets, sequence maps, templates …). */
export type ResourceType = 'playbook' | 'template' | 'sequence_map' | 'one_pager' | 'guide' | 'checklist' | 'worksheet' | 'slides' | 'swipe_file' | 'other';

export interface BrandAsset {
  id: ID;
  name: string;
  kind: AssetKind;
  /** stored image (asset name) */
  image?: string;
  /** colour hex, font name, or other value */
  value?: string;
  url?: string;
  tags?: string[];
  notes?: string;
  /** campaign it belongs to (Links & documents group resources per campaign) */
  campaignId?: ID;
  /** downloadable resources: what it is */
  resourceType?: ResourceType;
  /** given in exchange for an email / opt-in (lead magnet) */
  gated?: boolean;
  /** uploaded file stored in the space folder (asset name) */
  file?: string;
  /** original file name of the upload (used when downloading) */
  fileName?: string;
  /** size of the upload in bytes */
  fileSize?: number;
}

/* ---------------------------------------------------------------- people & brands (CRM sheets) */

export type CrmColumnType = 'text' | 'longtext' | 'select' | 'multi' | 'number' | 'money' | 'date' | 'email' | 'phone' | 'url' | 'checkbox' | 'campaign';

export interface CrmOption {
  /** stable id stored in rows */
  id: ID;
  label: string;
  color?: string;
}

export interface CrmColumn {
  id: ID;
  name: string;
  type: CrmColumnType;
  /** choices of select / multi columns */
  options?: CrmOption[];
  /** column width in px */
  width?: number;
}

export interface CrmRow {
  id: ID;
  /** column id → value (text, number, ISO date, option id(s), campaign id, boolean) */
  values: Record<ID, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** One spreadsheet in People & Brands (relationships, leads, brand deals …). */
export interface CrmSheet {
  id: ID;
  name: string;
  color?: string;
  description?: string;
  columns: CrmColumn[];
  rows: CrmRow[];
  /** table or board (cards grouped by a select column) */
  view?: 'table' | 'board';
  /** select column used for the board */
  boardColumnId?: ID;
}

/* ---------------------------------------------------------------- root */

export interface SpaceData {
  schemaVersion: number;
  kind: 'space';
  id: ID;
  meta: SpaceMeta;
  settings: SpaceSettings;
  strategy: Strategy;
  goals: Goal[];
  personas: Persona[];
  pillars: Pillar[];
  tactics: Tactic[];
  channels: Channel[];
  campaigns: Campaign[];
  milestones: SpaceMilestone[];
  content: ContentPiece[];
  shoots: ShootSession[];
  assets: BrandAsset[];
  /** People & Brands: CRM-style sheets (relationships, leads, brand deals …) */
  crm: CrmSheet[];
  /** brainstorming board (same model as the script's Mind Dump) */
  mind: MindDump;
  /** shared calculator lines on the Strategy page (src/spaces/calc) */
  calc?: import('@/lib/calc').CalcLine[];
  /** linked production projects */
  projectIds: ID[];
  /** linked Marketing Spaces (business spaces link the marketing they run) */
  spaceIds?: ID[];
  notes: string;
  /** business spaces: income, contractors, agreements, invoices, expenses, time … */
  business?: BusinessData;
  /** the Personal Finances space: accounts, statements, transactions, budgets, plans */
  finance?: FinanceData;
  /** the Training space: goals, meals, workouts, body metrics, progress photos, check-ins */
  training?: TrainingData;
}

/** Library card. */
export interface SpaceSummary {
  id: ID;
  title: string;
  kind?: SpaceKind;
  /** business spaces: the business type */
  subtype?: string;
  type: SpaceType;
  color: string;
  emoji?: string;
  cover?: string;
  description?: string;
  updatedAt: string;
  createdAt: string;
  path?: string;
  demo?: boolean;
  /** counts for the card */
  contentCount?: number;
  publishedCount?: number;
  /** next scheduled post date */
  nextPost?: ISODate;
}
