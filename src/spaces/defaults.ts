/* Factories, normalisation and starting templates for Marketing Spaces. */
import type { ID } from '@/types';
import { uid } from '@/lib/id';
import { normalizeMind } from '@/lib/mind';
import { addDays, todayISO } from '@/lib/dates';
import { defaultSettings } from '@/store/defaults';
import { FORMAT_BY_ID, PILLAR_COLORS } from './constants';
import type {
  Campaign,
  Channel,
  ChecklistItem,
  ContentFormat,
  ContentPiece,
  ContentPost,
  ContentShot,
  Goal,
  Pillar,
  Platform,
  ShootSession,
  SpaceData,
  SpaceMilestone,
  SpaceType,
} from './types';
import { SPACE_SCHEMA_VERSION } from './types';

/* ---------------------------------------------------------------- item factories */

export function defaultChecklist(format: ContentFormat): ChecklistItem[] {
  const f = FORMAT_BY_ID[format];
  const items = f?.video
    ? ['Script / outline approved', 'Filmed', 'Edited', 'Captions / subtitles', 'Thumbnail / cover', 'Title, caption & hashtags', 'Scheduled on every channel']
    : f?.audio
      ? ['Outline', 'Recorded', 'Edited & mixed', 'Show notes', 'Cover art', 'Scheduled']
      : f?.text
        ? ['Draft written', 'Edited / proofread', 'Visuals ready', 'Links & CTA checked', 'Scheduled']
        : ['Created', 'Reviewed', 'Scheduled'];
  return items.map((text) => ({ id: uid('chk'), text }));
}

export function makeContent(patch: Partial<ContentPiece> = {}): ContentPiece {
  const format = patch.format ?? 'short_video';
  return {
    id: uid('cnt'),
    title: 'Untitled content',
    format,
    stage: 'idea',
    priority: 'normal',
    aspect: FORMAT_BY_ID[format]?.aspect,
    shots: [],
    checklist: defaultChecklist(format),
    posts: [],
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

export function makePost(channelId: ID, patch: Partial<ContentPost> = {}): ContentPost {
  return { id: uid('post'), channelId, status: 'draft', ...patch };
}

export function makeShot(patch: Partial<ContentShot> = {}): ContentShot {
  return { id: uid('cshot'), description: '', kind: 'b_roll', ...patch };
}

export function makeChecklistItem(text: string): ChecklistItem {
  return { id: uid('chk'), text };
}

export function makeChannel(platform: Platform, patch: Partial<Channel> = {}): Channel {
  return { id: uid('ch'), platform, name: patch.name ?? platform, active: true, ...patch };
}

export function makeShoot(patch: Partial<ShootSession> = {}): ShootSession {
  return { id: uid('shoot'), title: 'Shoot day', contentIds: [], checklist: [], ...patch };
}

export function makeGoal(patch: Partial<Goal> = {}): Goal {
  return { id: uid('goal'), title: 'New goal', status: 'not_started', ...patch };
}

export function makeCampaign(patch: Partial<Campaign> = {}): Campaign {
  return { id: uid('camp'), name: 'New campaign', status: 'planning', color: PILLAR_COLORS[1], ...patch };
}

export function makePillar(name: string, i: number, patch: Partial<Pillar> = {}): Pillar {
  return { id: uid('pil'), name, color: PILLAR_COLORS[i % PILLAR_COLORS.length], ...patch };
}

/* ---------------------------------------------------------------- templates */

type ChannelSeed = [Platform, string, number?, ('week' | 'month')?];
type ContentSeed = { title: string; format: ContentFormat; pillar?: number; concept?: string; campaign?: number; project?: boolean };

interface Template {
  description: string;
  emoji: string;
  color: string;
  channels: ChannelSeed[];
  pillars: [string, string, number?][];
  goals: Partial<Goal>[];
  campaigns?: { name: string; objective: string; offsetStart: number; days: number }[];
  milestones?: { name: string; offset: number; campaign?: number }[];
  content: ContentSeed[];
}

const TEMPLATES: Record<SpaceType, Template> = {
  personal_brand: {
    description: 'My work, my process and my point of view, across every channel.',
    emoji: '✨',
    color: '#7c5cff',
    channels: [
      ['youtube', 'YouTube', 1, 'week'],
      ['instagram', 'Instagram', 3, 'week'],
      ['tiktok', 'TikTok', 3, 'week'],
      ['linkedin', 'LinkedIn', 2, 'week'],
      ['newsletter', 'Newsletter', 2, 'month'],
    ],
    pillars: [
      ['Behind the scenes', 'How the work gets made: sets, edits, mistakes, wins', 30],
      ['Craft & how-to', 'Teach one useful thing per post', 30],
      ['Story & opinion', 'Why I do this; takes on the industry', 20],
      ['Work showcase', 'Finished projects, trailers, client work', 20],
    ],
    goals: [
      { title: 'Grow the audience', metric: 'Followers (all channels)', unit: 'followers' },
      { title: 'Build an email list', metric: 'Newsletter subscribers', unit: 'subscribers' },
    ],
    content: [
      { title: 'A day on set — BTS reel', format: 'short_video', pillar: 0, concept: 'Fast-cut day in the life from call time to wrap.' },
      { title: '3 lighting tricks for night interiors', format: 'long_video', pillar: 1, concept: 'Practical, cheap setups anyone can copy.' },
      { title: 'Why I make films', format: 'text', pillar: 2, concept: 'Personal story post that explains the mission.' },
    ],
  },
  channel: {
    description: 'A channel or show with a regular release rhythm.',
    emoji: '📺',
    color: '#ff0033',
    channels: [
      ['youtube', 'YouTube', 1, 'week'],
      ['youtube_shorts', 'YouTube Shorts', 3, 'week'],
      ['instagram', 'Instagram', 2, 'week'],
    ],
    pillars: [
      ['Main episodes', 'The flagship uploads', 50],
      ['Shorts & clips', 'Cut-downs that pull viewers to the main uploads', 35],
      ['Community', 'Polls, replies, collabs', 15],
    ],
    goals: [
      { title: 'Grow subscribers', metric: 'Subscribers', unit: 'subscribers' },
      { title: 'Average views per upload', metric: 'Views per video', unit: 'views' },
    ],
    content: [
      { title: 'Next episode', format: 'long_video', pillar: 0, concept: 'Pick the strongest idea from the board.' },
      { title: 'Episode cut-down #1', format: 'short_video', pillar: 1 },
      { title: 'Community poll: what should we make next?', format: 'text', pillar: 2 },
    ],
  },
  campaign: {
    description: 'Launch and release campaign: build awareness, drive views and turn viewers into fans.',
    emoji: '🎬',
    color: '#e8590c',
    channels: [
      ['instagram', 'Instagram', 4, 'week'],
      ['tiktok', 'TikTok', 4, 'week'],
      ['youtube', 'YouTube', 1, 'week'],
      ['x', 'X', 5, 'week'],
      ['newsletter', 'Newsletter', 2, 'month'],
      ['press', 'Press & festivals'],
    ],
    pillars: [
      ['Story & characters', 'Hook people on the world and the people in it', 35],
      ['Behind the scenes', 'How it was made', 25],
      ['Cast & crew', 'Faces and voices of the team', 20],
      ['Announcements & countdown', 'Dates, screenings, links', 20],
    ],
    goals: [
      { title: 'Trailer views', metric: 'Trailer views', unit: 'views' },
      { title: 'Festival selections', metric: 'Selections', unit: 'festivals' },
      { title: 'Email sign-ups for the release', metric: 'Sign-ups', unit: 'sign-ups' },
    ],
    campaigns: [
      { name: 'Tease', objective: 'Create curiosity before anything is revealed', offsetStart: 0, days: 14 },
      { name: 'Trailer launch', objective: 'Maximum reach for the trailer drop', offsetStart: 14, days: 10 },
      { name: 'Premiere / festival run', objective: 'Fill seats and get press', offsetStart: 24, days: 30 },
      { name: 'Release', objective: 'Drive views of the full film', offsetStart: 54, days: 21 },
    ],
    milestones: [
      { name: 'Poster reveal', offset: 7, campaign: 0 },
      { name: 'Teaser drop', offset: 10, campaign: 0 },
      { name: 'Trailer drop', offset: 14, campaign: 1 },
      { name: 'Premiere', offset: 30, campaign: 2 },
      { name: 'Release day', offset: 54, campaign: 3 },
    ],
    content: [
      { title: 'Poster reveal', format: 'image', pillar: 3, campaign: 0, project: true },
      { title: 'Teaser (15 s)', format: 'teaser', pillar: 0, campaign: 0, project: true },
      { title: 'Official trailer', format: 'trailer', pillar: 0, campaign: 1, project: true },
      { title: 'Meet the cast', format: 'carousel', pillar: 2, campaign: 1 },
      { title: 'Behind the scenes reel', format: 'short_video', pillar: 1, campaign: 1, project: true },
      { title: 'Premiere countdown', format: 'story', pillar: 3, campaign: 2 },
    ],
  },
  business: {
    description: 'A company or client brand: educate, build trust, bring in leads.',
    emoji: '💼',
    color: '#0a66c2',
    channels: [
      ['linkedin', 'LinkedIn', 3, 'week'],
      ['instagram', 'Instagram', 3, 'week'],
      ['blog', 'Blog', 2, 'month'],
      ['newsletter', 'Newsletter', 1, 'month'],
    ],
    pillars: [
      ['Education', 'Useful know-how for the audience', 40],
      ['Customer stories', 'Proof and results', 25],
      ['Product & offer', 'What we sell and why', 20],
      ['Culture', 'People and values', 15],
    ],
    goals: [
      { title: 'Generate leads', metric: 'Inbound leads', unit: 'leads' },
      { title: 'Grow reach', metric: 'Impressions per month', unit: 'impressions' },
    ],
    content: [
      { title: 'Customer story video', format: 'long_video', pillar: 1 },
      { title: '5 tips carousel', format: 'carousel', pillar: 0 },
      { title: 'Monthly newsletter', format: 'newsletter', pillar: 0 },
    ],
  },
  event: {
    description: 'Announce, sell out and recap an event.',
    emoji: '🎟️',
    color: '#e64980',
    channels: [
      ['instagram', 'Instagram', 4, 'week'],
      ['x', 'X', 4, 'week'],
      ['newsletter', 'Newsletter', 2, 'month'],
      ['press', 'Press'],
    ],
    pillars: [
      ['Announcements', 'Dates, line-up, tickets', 40],
      ['Hype', 'Teasers and countdowns', 30],
      ['Recap', 'Highlights after the event', 30],
    ],
    goals: [{ title: 'Sell tickets', metric: 'Tickets sold', unit: 'tickets' }],
    campaigns: [
      { name: 'Announce', objective: 'Save the date', offsetStart: 0, days: 7 },
      { name: 'Ticket push', objective: 'Sell out', offsetStart: 7, days: 21 },
      { name: 'Recap', objective: 'Keep the momentum', offsetStart: 30, days: 10 },
    ],
    milestones: [
      { name: 'Announcement', offset: 0, campaign: 0 },
      { name: 'Event day', offset: 28, campaign: 1 },
      { name: 'Recap film out', offset: 35, campaign: 2 },
    ],
    content: [
      { title: 'Save the date', format: 'image', pillar: 0, campaign: 0 },
      { title: 'Countdown stories', format: 'story', pillar: 1, campaign: 1 },
      { title: 'Recap film', format: 'short_video', pillar: 2, campaign: 2 },
    ],
  },
  other: {
    description: '',
    emoji: '🚀',
    color: '#15aabf',
    channels: [
      ['instagram', 'Instagram', 3, 'week'],
      ['youtube', 'YouTube', 1, 'week'],
    ],
    pillars: [['General', 'Everything', 100]],
    goals: [],
    content: [],
  },
};

export const PLATFORM_NAMES: Partial<Record<Platform, string>> = {};

export interface NewSpaceOptions {
  title: string;
  type: SpaceType;
  /** true (default) = starting channels, pillars, goals, phases and content ideas for the type */
  withTemplate?: boolean;
  description?: string;
  color?: string;
  emoji?: string;
  /** linked production projects */
  projectIds?: ID[];
  /** start date for campaign phases / milestones (default today) */
  startDate?: string;
}

export function createSpace(opts: NewSpaceOptions): SpaceData {
  const now = new Date().toISOString();
  const t = TEMPLATES[opts.type] ?? TEMPLATES.other;
  const withT = opts.withTemplate !== false;
  const start = opts.startDate || todayISO();
  const ps = defaultSettings();
  const channels: Channel[] = withT ? t.channels.map(([platform, name, cadence, unit]) => makeChannel(platform, { name, cadence, cadenceUnit: cadence ? unit ?? 'week' : undefined })) : [];
  const pillars: Pillar[] = withT ? t.pillars.map(([name, description, share], i) => makePillar(name, i, { description, targetShare: share })) : [];
  const campaigns: Campaign[] = withT
    ? (t.campaigns ?? []).map((c, i) =>
        makeCampaign({ name: c.name, objective: c.objective, start: addDays(start, c.offsetStart), end: addDays(start, c.offsetStart + c.days - 1), color: PILLAR_COLORS[(i + 1) % PILLAR_COLORS.length], projectId: opts.projectIds?.[0] }),
      )
    : [];
  const milestones: SpaceMilestone[] = withT ? (t.milestones ?? []).map((m) => ({ id: uid('sms'), name: m.name, date: addDays(start, m.offset), campaignId: m.campaign != null ? campaigns[m.campaign]?.id : undefined })) : [];
  const goals: Goal[] = withT ? t.goals.map((g) => makeGoal(g)) : [];
  const content: ContentPiece[] = withT
    ? t.content.map((c) =>
        makeContent({
          title: c.title,
          format: c.format,
          concept: c.concept,
          pillarId: c.pillar != null ? pillars[c.pillar]?.id : undefined,
          campaignId: c.campaign != null ? campaigns[c.campaign]?.id : undefined,
          projectId: c.project ? opts.projectIds?.[0] : undefined,
        }),
      )
    : [];
  return normalizeSpace({
    schemaVersion: SPACE_SCHEMA_VERSION,
    kind: 'space',
    id: uid('spc'),
    meta: {
      title: opts.title || 'Untitled Space',
      type: opts.type,
      description: opts.description ?? (withT ? t.description : ''),
      color: opts.color ?? t.color,
      emoji: opts.emoji ?? t.emoji,
      startDate: opts.type === 'campaign' || opts.type === 'event' ? start : undefined,
      createdAt: now,
      updatedAt: now,
    },
    settings: { paperSize: ps.paperSize, dateFormat: ps.dateFormat, timeFormat: ps.timeFormat, currency: ps.currency, weekStartsMonday: ps.weekStartsMonday, print: ps.print },
    channels,
    pillars,
    goals,
    campaigns,
    milestones,
    content,
    projectIds: opts.projectIds ?? [],
  });
}

/** Make sure every field exists (older or hand-edited files). Mutates and returns the object. */
export function normalizeSpace(raw: Partial<SpaceData> & Record<string, any>): SpaceData {
  const s = raw as any;
  const now = new Date().toISOString();
  const ps = defaultSettings();
  s.schemaVersion = s.schemaVersion ?? SPACE_SCHEMA_VERSION;
  s.kind = 'space';
  s.id = s.id || uid('spc');
  s.meta = { title: 'Untitled Space', type: 'other', description: '', color: '#e64980', createdAt: now, updatedAt: now, ...(s.meta ?? {}) };
  s.settings = {
    paperSize: ps.paperSize,
    dateFormat: ps.dateFormat,
    timeFormat: ps.timeFormat,
    currency: ps.currency,
    weekStartsMonday: ps.weekStartsMonday,
    ...(s.settings ?? {}),
    print: { ...ps.print, ...(s.settings?.print ?? {}) },
  };
  s.strategy = { positioning: '', valueProp: '', voice: '', keyMessages: '', notes: '', ...(s.strategy ?? {}) };
  for (const k of ['goals', 'personas', 'pillars', 'tactics', 'channels', 'campaigns', 'milestones', 'content', 'shoots', 'assets', 'projectIds']) if (!Array.isArray(s[k])) s[k] = [];
  for (const c of s.content) {
    c.shots = Array.isArray(c.shots) ? c.shots : [];
    c.checklist = Array.isArray(c.checklist) ? c.checklist : [];
    c.posts = Array.isArray(c.posts) ? c.posts : [];
    c.stage = c.stage ?? 'idea';
    c.format = c.format ?? 'other';
    c.createdAt = c.createdAt ?? now;
  }
  for (const sh of s.shoots) {
    sh.contentIds = Array.isArray(sh.contentIds) ? sh.contentIds : [];
    sh.checklist = Array.isArray(sh.checklist) ? sh.checklist : [];
  }
  for (const ch of s.channels) ch.active = ch.active !== false;
  s.mind = normalizeMind(s.mind, 'Ideas');
  s.notes = s.notes ?? '';
  return s as SpaceData;
}
