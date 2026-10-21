/* Option lists for Marketing Spaces: platforms, formats, stages, statuses. */
import {
  AudioLines,
  BookOpen,
  Briefcase,
  CalendarHeart,
  Clapperboard,
  Film,
  GalleryHorizontal,
  Image,
  Mail,
  Megaphone,
  MessageSquareText,
  Mic,
  MonitorPlay,
  Radio,
  Smartphone,
  Sparkles,
  Tv,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { Option } from '@/lib/constants';
import type { AssetKind, CampaignStatus, ResourceType, ContentFormat, ContentStage, GoalStatus, Platform, PostMetrics, PostStatus, ShotKind, SpaceType, TacticStatus } from './types';

export interface SpaceTypeDef extends Option<SpaceType> {
  icon: LucideIcon;
  description: string;
}

export const SPACE_TYPES: SpaceTypeDef[] = [
  { value: 'personal_brand', label: 'Personal brand', icon: User, description: 'You across every channel and format' },
  { value: 'channel', label: 'Channel / show', icon: Tv, description: 'A YouTube channel, podcast or series' },
  { value: 'campaign', label: 'Campaign / launch', icon: Megaphone, description: 'A film release, product or event launch' },
  { value: 'business', label: 'Business / client', icon: Briefcase, description: 'A company or client brand' },
  { value: 'event', label: 'Event', icon: CalendarHeart, description: 'A premiere, festival run or live event' },
  { value: 'other', label: 'Other', icon: Sparkles, description: 'Anything else' },
];

export interface PlatformDef extends Option<Platform> {
  color: string;
  /** caption / post text limit (characters) */
  captionLimit?: number;
  /** title limit (YouTube title, pin title …) */
  titleLimit?: number;
  /** usual aspect ratio of video posts */
  aspect?: string;
  /** max video length hint */
  maxLength?: string;
  hasTitle?: boolean;
}

export const PLATFORMS: PlatformDef[] = [
  { value: 'youtube', label: 'YouTube', color: '#ff0033', titleLimit: 100, captionLimit: 5000, aspect: '16:9', hasTitle: true },
  { value: 'youtube_shorts', label: 'YouTube Shorts', color: '#ff4e45', titleLimit: 100, captionLimit: 5000, aspect: '9:16', maxLength: '3:00', hasTitle: true },
  { value: 'instagram', label: 'Instagram', color: '#e1306c', captionLimit: 2200, aspect: '4:5 · 9:16', maxLength: 'Reels 3:00' },
  { value: 'tiktok', label: 'TikTok', color: '#00c2b8', captionLimit: 4000, aspect: '9:16', maxLength: '10:00' },
  { value: 'linkedin', label: 'LinkedIn', color: '#0a66c2', captionLimit: 3000, aspect: '1:1 · 4:5 · 16:9' },
  { value: 'x', label: 'X (Twitter)', color: '#5b5b66', captionLimit: 280, aspect: '16:9 · 1:1' },
  { value: 'threads', label: 'Threads', color: '#3d3d46', captionLimit: 500 },
  { value: 'facebook', label: 'Facebook', color: '#1877f2', captionLimit: 63206, aspect: '4:5 · 16:9' },
  { value: 'pinterest', label: 'Pinterest', color: '#e60023', titleLimit: 100, captionLimit: 500, aspect: '2:3', hasTitle: true },
  { value: 'snapchat', label: 'Snapchat', color: '#e2c800', captionLimit: 250, aspect: '9:16' },
  { value: 'twitch', label: 'Twitch', color: '#9146ff', titleLimit: 140, hasTitle: true },
  { value: 'newsletter', label: 'Newsletter', color: '#f08c00', titleLimit: 80, hasTitle: true },
  { value: 'blog', label: 'Blog', color: '#2f9e44', titleLimit: 70, hasTitle: true },
  { value: 'podcast', label: 'Podcast', color: '#8e44ad', titleLimit: 100, captionLimit: 4000, hasTitle: true },
  { value: 'website', label: 'Website', color: '#3e8ef7', hasTitle: true },
  { value: 'press', label: 'Press / PR', color: '#868e96', hasTitle: true },
  { value: 'other', label: 'Other', color: '#7c5cff', hasTitle: true },
];

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.value, p])) as Record<Platform, PlatformDef>;

export interface FormatDef extends Option<ContentFormat> {
  icon: LucideIcon;
  /** has a spoken / visual script and usually a shoot */
  video?: boolean;
  /** audio only */
  audio?: boolean;
  /** written content (copy is the main deliverable) */
  text?: boolean;
  /** default aspect ratio */
  aspect?: string;
}

export const FORMATS: FormatDef[] = [
  { value: 'long_video', label: 'Long-form video', icon: MonitorPlay, video: true, aspect: '16:9' },
  { value: 'short_video', label: 'Short / Reel / TikTok', icon: Smartphone, video: true, aspect: '9:16' },
  { value: 'trailer', label: 'Trailer', icon: Film, video: true, aspect: '16:9' },
  { value: 'teaser', label: 'Teaser', icon: Clapperboard, video: true, aspect: '9:16' },
  { value: 'livestream', label: 'Livestream', icon: Radio, video: true, aspect: '16:9' },
  { value: 'podcast', label: 'Podcast episode', icon: Mic, audio: true },
  { value: 'carousel', label: 'Carousel', icon: GalleryHorizontal, text: true, aspect: '4:5' },
  { value: 'image', label: 'Image post', icon: Image, text: true, aspect: '4:5' },
  { value: 'story', label: 'Story', icon: Smartphone, aspect: '9:16' },
  { value: 'text', label: 'Text post / thread', icon: MessageSquareText, text: true },
  { value: 'article', label: 'Article / blog post', icon: BookOpen, text: true },
  { value: 'newsletter', label: 'Newsletter', icon: Mail, text: true },
  { value: 'ad', label: 'Ad', icon: Megaphone, video: true },
  { value: 'other', label: 'Other', icon: AudioLines },
];

export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.value, f])) as Record<ContentFormat, FormatDef>;

export const STAGES: Option<ContentStage>[] = [
  { value: 'idea', label: 'Idea', color: '#a5a3b3', hint: 'Captured, not started' },
  { value: 'writing', label: 'Writing', color: '#7c5cff', hint: 'Script / copy in progress' },
  { value: 'planning', label: 'Planning', color: '#3e8ef7', hint: 'Shot list, locations, gear' },
  { value: 'production', label: 'Shooting', color: '#f08c00', hint: 'Being filmed / created' },
  { value: 'editing', label: 'Editing', color: '#e64980', hint: 'Edit, design, captions' },
  { value: 'ready', label: 'Ready', color: '#15aabf', hint: 'Approved, waiting to post' },
  { value: 'published', label: 'Published', color: '#2fb36d', hint: 'Live on every planned channel' },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.value, s])) as Record<ContentStage, Option<ContentStage>>;

export const POST_STATUSES: Option<PostStatus>[] = [
  { value: 'draft', label: 'Draft', color: '#a5a3b3' },
  { value: 'scheduled', label: 'Scheduled', color: '#3e8ef7' },
  { value: 'published', label: 'Published', color: '#2fb36d' },
  { value: 'skipped', label: 'Skipped', color: '#868e96' },
];

export const GOAL_STATUSES: Option<GoalStatus>[] = [
  { value: 'not_started', label: 'Not started', color: '#a5a3b3' },
  { value: 'on_track', label: 'On track', color: '#2fb36d' },
  { value: 'at_risk', label: 'At risk', color: '#f5a524' },
  { value: 'off_track', label: 'Off track', color: '#e5484d' },
  { value: 'done', label: 'Achieved', color: '#7c5cff' },
];

export const CAMPAIGN_STATUSES: Option<CampaignStatus>[] = [
  { value: 'planning', label: 'Planning', color: '#3e8ef7' },
  { value: 'active', label: 'Active', color: '#2fb36d' },
  { value: 'paused', label: 'Paused', color: '#f5a524' },
  { value: 'complete', label: 'Complete', color: '#868e96' },
];

export const TACTIC_STATUSES: Option<TacticStatus>[] = [
  { value: 'idea', label: 'Idea', color: '#a5a3b3' },
  { value: 'planned', label: 'Planned', color: '#3e8ef7' },
  { value: 'active', label: 'Active', color: '#2fb36d' },
  { value: 'paused', label: 'Paused', color: '#f5a524' },
  { value: 'done', label: 'Done', color: '#868e96' },
];

export const SHOT_KINDS: Option<ShotKind>[] = [
  { value: 'a_roll', label: 'A-roll (talking)' },
  { value: 'b_roll', label: 'B-roll' },
  { value: 'insert', label: 'Insert / detail' },
  { value: 'screen', label: 'Screen recording' },
  { value: 'graphic', label: 'Graphic / text' },
  { value: 'other', label: 'Other' },
];

export const ASSET_KINDS: Option<AssetKind>[] = [
  { value: 'logo', label: 'Logo' },
  { value: 'image', label: 'Image' },
  { value: 'color', label: 'Colour' },
  { value: 'font', label: 'Font' },
  { value: 'template', label: 'Template' },
  { value: 'video', label: 'Video / footage' },
  { value: 'audio', label: 'Music / sound' },
  { value: 'link', label: 'Link' },
  { value: 'doc', label: 'Document' },
  { value: 'resource', label: 'Resource (downloadable)' },
  { value: 'other', label: 'Other' },
];

/** Downloadable campaign resources: lead magnets, sequence maps, template docs, playbooks, one-pagers … */
export const RESOURCE_TYPES: Option<ResourceType>[] = [
  { value: 'playbook', label: 'Playbook', color: '#7c5cff' },
  { value: 'template', label: 'Template doc', color: '#3e8ef7' },
  { value: 'sequence_map', label: 'Sequence map', color: '#15aabf' },
  { value: 'one_pager', label: 'One-pager', color: '#f08c00' },
  { value: 'guide', label: 'Guide / e-book', color: '#2fb36d' },
  { value: 'checklist', label: 'Checklist', color: '#e64980' },
  { value: 'worksheet', label: 'Worksheet', color: '#a05eea' },
  { value: 'slides', label: 'Slide deck', color: '#e5484d' },
  { value: 'swipe_file', label: 'Swipe file', color: '#868e96' },
  { value: 'other', label: 'Other', color: '#868e96' },
];

export const METRICS: { key: keyof PostMetrics; label: string; short: string; unit?: string }[] = [
  { key: 'impressions', label: 'Impressions', short: 'Impr.' },
  { key: 'views', label: 'Views', short: 'Views' },
  { key: 'likes', label: 'Likes', short: 'Likes' },
  { key: 'comments', label: 'Comments', short: 'Comm.' },
  { key: 'shares', label: 'Shares', short: 'Shares' },
  { key: 'saves', label: 'Saves', short: 'Saves' },
  { key: 'clicks', label: 'Link clicks', short: 'Clicks' },
  { key: 'ctr', label: 'Click-through rate', short: 'CTR', unit: '%' },
  { key: 'watchHours', label: 'Watch time (hours)', short: 'Watch h' },
  { key: 'avgViewSec', label: 'Avg. view duration (s)', short: 'AVD s' },
  { key: 'followersGained', label: 'Followers gained', short: '+Follows' },
  { key: 'conversions', label: 'Conversions', short: 'Conv.' },
];

export const PILLAR_COLORS = ['#7c5cff', '#3e8ef7', '#2fb36d', '#f08c00', '#e64980', '#15aabf', '#e5484d', '#868e96'];
