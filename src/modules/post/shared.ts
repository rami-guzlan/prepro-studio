/* Post-production helpers: option lists, timecode maths, deliverable presets,
   post schedule date generation and CSV exports. No React in here. */
import type { AdrLine, Deliverable, EditNote, GraphicItem, MusicCue, PostMilestone, ProjectData, ProjectMeta, VfxShot } from '@/types';
import type { ScriptModel } from '@/derived/script';
import { POST_STATUSES, type Option } from '@/lib/constants';
import { addDays, isWeekend, parseISODate } from '@/lib/dates';
import { formatSeconds } from '@/lib/format';
import { listOps } from '@/store/project';
import { safeFileName, titleCase } from '@/lib/text';
import { exportCsv } from '@/backend';
import { toast } from '@/ui';

/* ---------------------------------------------------------------- list ops */

export const scheduleOps = listOps<PostMilestone>((d) => d.post.schedule, 'post.schedule');
export const deliverableOps = listOps<Deliverable>((d) => d.post.deliverables, 'post.deliverables');
export const graphicOps = listOps<GraphicItem>((d) => d.post.graphics, 'post.graphics');
export const musicOps = listOps<MusicCue>((d) => d.post.music, 'post.music');
export const vfxOps = listOps<VfxShot>((d) => d.post.vfx, 'post.vfx');
export const adrOps = listOps<AdrLine>((d) => d.post.adr, 'post.adr');
export const noteOps = listOps<EditNote>((d) => d.post.editNotes, 'post.editNotes');

/* ---------------------------------------------------------------- option lists */

export const GRAPHIC_KINDS = ['Lower third', 'Title card', 'End card', 'Callout', 'Chart', 'Subtitle', 'Logo bug', 'Disclaimer'];

export const MUSIC_SOURCES: Option<NonNullable<MusicCue['source']>>[] = [
  { value: 'original', label: 'Original score' },
  { value: 'library', label: 'Library / stock' },
  { value: 'licensed', label: 'Licensed track' },
  { value: 'source', label: 'Source (on screen)' },
];

export const MUSIC_USAGES: Option[] = [
  { value: 'BI', label: 'BI – Background instrumental' },
  { value: 'BV', label: 'BV – Background vocal' },
  { value: 'VI', label: 'VI – Visual instrumental' },
  { value: 'VV', label: 'VV – Visual vocal' },
  { value: 'MT', label: 'MT – Main title' },
  { value: 'ET', label: 'ET – End title' },
];

export const VFX_COMPLEXITY: Option<NonNullable<VfxShot['complexity']>>[] = [
  { value: 'simple', label: 'Simple', color: '#2fb36d' },
  { value: 'medium', label: 'Medium', color: '#f5a524' },
  { value: 'complex', label: 'Complex', color: '#e5484d' },
];

export const NOTE_STATUSES: Option<EditNote['status']>[] = [
  { value: 'open', label: 'Open', color: '#f5a524' },
  { value: 'addressed', label: 'Addressed', color: '#2fb36d' },
  { value: 'wontfix', label: "Won't fix", color: '#8e8c99' },
];

export const ADR_REASONS = ['Noise', 'Wind noise', 'Performance', 'Added line', 'Changed line', 'Technical (mic / clipping)', 'Clarity', 'Overlap', 'Profanity cover', 'Walla / group'];

export const AUDIO_SPECS = ['Stereo', 'Stereo AAC 48 kHz', '5.1', 'Stereo + 5.1', 'Mono', 'Stereo + stems (DME)', 'WAV 48 kHz / 24-bit'];
export const LOUDNESS_SPECS = ['-14 LUFS', '-16 LUFS', '-23 LUFS (EBU R128)', '-24 LKFS (ATSC A/85)', '-27 LKFS (Netflix dialog-gated)'];
export const CODECS = ['H.264', 'H.265 / HEVC', 'Apple ProRes 422', 'Apple ProRes 422 HQ', 'Apple ProRes 4444', 'DNxHR HQX', 'JPEG 2000', 'JPG / PNG', 'SRT', 'WAV'];
export const CONTAINERS = ['MP4', 'MOV', 'MXF', 'SRT', 'VTT', 'WAV', 'ZIP'];
export const CAPTION_SPECS = ['None', 'Burned-in', 'SRT sidecar', 'VTT sidecar', 'SRT + VTT', 'CEA-608/708 (SCC)', 'Open captions'];

export const statusLabel = (v: string | undefined) => POST_STATUSES.find((s) => s.value === v)?.label ?? v ?? '';

/* ---------------------------------------------------------------- timecode */

/** Integer frames per second used for timecode (23.976 → 24, 29.97 → 30). */
export function nominalFps(frameRate: string | undefined): number {
  const n = parseFloat(frameRate ?? '');
  if (!isFinite(n) || n <= 0) return 24;
  return Math.round(n);
}

/** Parse 'HH:MM:SS:FF', 'HH:MM:SS', 'MM:SS' or seconds into seconds. */
export function parseTC(text: string | undefined | null, fps = 24): number | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  const parts = t.split(/[:;]/).map((s) => s.trim());
  if (parts.length > 4 || !parts.every((p, i) => (i === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p))) return undefined;
  const n = parts.map(Number);
  switch (n.length) {
    case 4:
      return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / Math.max(1, fps);
    case 3:
      return n[0] * 3600 + n[1] * 60 + n[2];
    case 2:
      return n[0] * 60 + n[1];
    default:
      return n[0];
  }
}

/** Duration of a span between two timecodes ('' when not computable). */
export function tcSpan(tcIn: string | undefined, tcOut: string | undefined, fps: number): number | undefined {
  const a = parseTC(tcIn, fps);
  const b = parseTC(tcOut, fps);
  if (a == null || b == null || b <= a) return undefined;
  return b - a;
}

/** Effective cue length in seconds: TC out − TC in, else the typed duration. */
export function cueSeconds(c: MusicCue, fps: number): number | undefined {
  return tcSpan(c.tcIn, c.tcOut, fps) ?? parseTC(c.duration, fps);
}

export const fmtDur = (s: number | undefined) => (s == null ? '' : formatSeconds(s));

/* ---------------------------------------------------------------- deliverable presets */

export interface DeliverablePreset {
  id: string;
  label: string;
  group: string;
  make: (m: ProjectMeta) => Omit<Deliverable, 'id' | 'status'>;
}

const fpsOf = (m: ProjectMeta) => m.frameRate || '23.976';
const isScope = (aspect: string | undefined) => {
  const mm = /^\s*([\d.]+)\s*[:x/]\s*([\d.]+)/.exec(aspect ?? '');
  return !!mm && parseFloat(mm[1]) / parseFloat(mm[2]) > 2.1;
};

export const DELIVERABLE_PRESETS: DeliverablePreset[] = [
  {
    id: 'yt-4k',
    label: 'YouTube 16:9 4K',
    group: 'Online',
    make: (m) => ({
      name: 'YouTube master (16:9 4K)',
      platform: 'YouTube',
      resolution: '3840x2160',
      aspectRatio: '16:9',
      frameRate: fpsOf(m),
      codec: 'H.264 High, 35–45 Mbps',
      container: 'MP4',
      audio: 'Stereo AAC-LC 48 kHz, 384 kbps',
      loudness: '-14 LUFS, -1 dBTP',
      captions: 'SRT sidecar',
      notes: 'Upload at the native frame rate; progressive scan, moov atom at front.',
    }),
  },
  {
    id: 'yt-shorts',
    label: 'YouTube Shorts 9:16',
    group: 'Online',
    make: (m) => ({
      name: 'YouTube Short (9:16)',
      platform: 'YouTube Shorts',
      resolution: '1080x1920',
      aspectRatio: '9:16',
      frameRate: fpsOf(m),
      codec: 'H.264 High, 8–12 Mbps',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS, -1 dBTP',
      captions: 'Burned-in',
      duration: '≤ 3:00',
      notes: 'Keep text clear of the bottom 20% and the right-hand buttons.',
    }),
  },
  {
    id: 'ig-reels',
    label: 'Instagram Reels 9:16',
    group: 'Online',
    make: (m) => ({
      name: 'Instagram Reel (9:16)',
      platform: 'Instagram Reels',
      resolution: '1080x1920',
      aspectRatio: '9:16',
      frameRate: parseFloat(fpsOf(m)) > 30 ? '30' : fpsOf(m),
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'Burned-in',
      duration: '≤ 3:00',
      notes: 'Keep key text inside the central 4:5 area (profile grid crop). Cover frame 1080×1920.',
    }),
  },
  {
    id: 'ig-feed',
    label: 'Instagram Feed 4:5',
    group: 'Online',
    make: (m) => ({
      name: 'Instagram Feed (4:5)',
      platform: 'Instagram Feed',
      resolution: '1080x1350',
      aspectRatio: '4:5',
      frameRate: parseFloat(fpsOf(m)) > 30 ? '30' : fpsOf(m),
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'Burned-in',
    }),
  },
  {
    id: 'tiktok',
    label: 'TikTok 9:16',
    group: 'Online',
    make: (m) => ({
      name: 'TikTok (9:16)',
      platform: 'TikTok',
      resolution: '1080x1920',
      aspectRatio: '9:16',
      frameRate: parseFloat(fpsOf(m)) > 30 ? '30' : fpsOf(m),
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'Burned-in',
      duration: '≤ 10:00',
      notes: 'Keep text clear of the right-side buttons and the bottom caption area.',
    }),
  },
  {
    id: 'li-1x1',
    label: 'LinkedIn 1:1',
    group: 'Online',
    make: (m) => ({
      name: 'LinkedIn feed (1:1)',
      platform: 'LinkedIn',
      resolution: '1080x1080',
      aspectRatio: '1:1',
      frameRate: parseFloat(fpsOf(m)) > 30 ? '30' : fpsOf(m),
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'SRT sidecar',
      duration: '≤ 15:00',
      notes: 'Most viewers watch muted — upload captions.',
    }),
  },
  {
    id: 'li-4x5',
    label: 'LinkedIn 4:5',
    group: 'Online',
    make: (m) => ({
      name: 'LinkedIn feed (4:5)',
      platform: 'LinkedIn',
      resolution: '1080x1350',
      aspectRatio: '4:5',
      frameRate: parseFloat(fpsOf(m)) > 30 ? '30' : fpsOf(m),
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'SRT sidecar',
      duration: '≤ 15:00',
    }),
  },
  {
    id: 'li-16x9',
    label: 'LinkedIn 16:9',
    group: 'Online',
    make: (m) => ({
      name: 'LinkedIn (16:9)',
      platform: 'LinkedIn',
      resolution: '1920x1080',
      aspectRatio: '16:9',
      frameRate: parseFloat(fpsOf(m)) > 30 ? '30' : fpsOf(m),
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'SRT sidecar',
      duration: '≤ 15:00',
    }),
  },
  {
    id: 'broadcast',
    label: 'Broadcast master (ProRes, -24 LKFS)',
    group: 'Broadcast & cinema',
    make: (m) => ({
      name: 'Broadcast master',
      platform: 'Broadcast',
      resolution: '1920x1080',
      aspectRatio: '16:9',
      frameRate: fpsOf(m),
      codec: 'Apple ProRes 422 HQ',
      container: 'MOV',
      audio: 'Stereo + 5.1, PCM 48 kHz / 24-bit',
      loudness: '-24 LKFS ±2 (ATSC A/85), -2 dBTP',
      captions: 'CEA-608/708 (SCC)',
      notes: 'Bars & tone, slate and 2-pop; textless version after the programme; QC report.',
    }),
  },
  {
    id: 'festival',
    label: 'Festival screener',
    group: 'Broadcast & cinema',
    make: (m) => ({
      name: 'Festival screener',
      platform: 'Festival',
      resolution: '1920x1080',
      aspectRatio: m.aspectRatio || '16:9',
      frameRate: fpsOf(m),
      codec: 'H.264 High, 10–20 Mbps',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-24 LKFS',
      captions: 'English subtitles (SRT)',
      notes: 'Private, password-protected link. Letterboxed inside 16:9; optional SCREENER watermark.',
    }),
  },
  {
    id: 'dcp',
    label: 'DCP (2K)',
    group: 'Broadcast & cinema',
    make: (m) => {
      const scope = isScope(m.aspectRatio);
      return {
        name: `DCP 2K ${scope ? 'Scope' : 'Flat'}`,
        platform: 'Cinema / DCP',
        resolution: scope ? '2048x858' : '1998x1080',
        aspectRatio: scope ? '2.39:1' : '1.85:1',
        frameRate: '24',
        codec: 'JPEG 2000, ≤ 250 Mbps',
        container: 'MXF (SMPTE DCP)',
        audio: '5.1 PCM 48 kHz / 24-bit',
        loudness: 'Theatrical mix (85 dB SPL reference)',
        captions: 'SMPTE subtitles (XML)',
        notes: 'Conform 23.976 to 24 fps. Unencrypted unless the festival asks for KDMs; test on a cinema server.',
      };
    },
  },
  {
    id: 'archive',
    label: 'Archive master',
    group: 'Masters & files',
    make: (m) => ({
      name: 'Archive master',
      platform: 'Archive master',
      resolution: m.resolution || '3840x2160',
      aspectRatio: m.aspectRatio || '16:9',
      frameRate: fpsOf(m),
      codec: 'Apple ProRes 4444',
      container: 'MOV',
      audio: 'Stereo + 5.1 mixes, DME stems (WAV)',
      captions: 'Textless version + SRT',
      notes: 'Graded master, textless master, project files and LUTs on two drives (one off-site).',
    }),
  },
  {
    id: 'srt',
    label: 'Captions (SRT)',
    group: 'Masters & files',
    make: () => ({
      name: 'Captions file (SRT)',
      codec: 'SRT (UTF-8)',
      container: 'SRT',
      captions: 'SRT – English',
      notes: 'Max 2 lines, ~42 characters per line; include speaker IDs and key sound cues.',
    }),
  },
  {
    id: 'thumbnail',
    label: 'Thumbnail',
    group: 'Masters & files',
    make: () => ({
      name: 'Thumbnail',
      platform: 'YouTube',
      resolution: '1280x720',
      aspectRatio: '16:9',
      codec: 'JPG / PNG (< 2 MB)',
      notes: 'Readable at small sizes; consistent with the title card.',
    }),
  },
];

/* ---------------------------------------------------------------- VFX codes */

export function nextVfxCode(list: VfxShot[]): string {
  let max = 0;
  for (const v of list) {
    const m = /(\d+)\s*$/.exec(v.code ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = Math.floor(max / 10) * 10 + 10;
  return `VFX_${String(n).padStart(3, '0')}`;
}

/* ---------------------------------------------------------------- schedule generation */

interface DurRule {
  re: RegExp;
  days: number;
  parallel?: boolean;
  lock?: boolean;
}

const RULES: DurRule[] = [
  { re: /ingest|sync|dailies|organi[sz]e/i, days: 2 },
  { re: /assembl/i, days: 5 },
  { re: /rough/i, days: 5 },
  { re: /review|notes|feedback|screening/i, days: 3 },
  { re: /fine/i, days: 4 },
  { re: /lock/i, days: 1, lock: true },
  { re: /music|sound design|score|composer/i, days: 7, parallel: true },
  { re: /colou?r|grade|grading/i, days: 4, parallel: true },
  { re: /graphic|vfx|title|motion|animation/i, days: 7, parallel: true },
  { re: /mix/i, days: 3 },
  { re: /caption|subtit|qc|quality/i, days: 2 },
  { re: /deliver|export|archive|upload/i, days: 1 },
];

export function ruleFor(name: string): DurRule {
  return RULES.find((r) => r.re.test(name)) ?? { re: /.*/, days: 3 };
}

const isoOk = (d?: string): d is string => !!d && !!parseISODate(d);

function startOn(d: string, skip: boolean) {
  let x = d;
  if (skip) while (isWeekend(x)) x = addDays(x, 1);
  return x;
}
function nextDay(d: string, skip: boolean) {
  return startOn(addDays(d, 1), skip);
}
/** End date of a task that starts on `d` and lasts `days` working days. */
function endAfter(d: string, days: number, skip: boolean) {
  let x = startOn(d, skip);
  for (let i = 1; i < days; i++) x = nextDay(x, skip);
  return x;
}
function workdaysBetween(a: string, b: string, skip: boolean): number {
  if (b < a) return 0;
  let n = 0;
  let x = a;
  for (let guard = 0; x <= b && guard < 2000; guard++) {
    if (!skip || !isWeekend(x)) n++;
    x = addDays(x, 1);
  }
  return n;
}

export interface GeneratedDates {
  id: string;
  name: string;
  start: string;
  end: string;
  days: number;
}

export interface GenerateOptions {
  start: string;
  lockTarget?: string;
  skipWeekends: boolean;
}

/** Distribute default durations over the post schedule (sequential edit → lock, finishing tasks in parallel after lock). */
export function generateSchedule(items: PostMilestone[], opts: GenerateOptions): { rows: GeneratedDates[]; warning?: string } {
  const skip = opts.skipWeekends;
  const rules = items.map((it) => ruleFor(it.name || ''));
  const durations = rules.map((r) => r.days);
  let warning: string | undefined;

  const lockIdx = rules.findIndex((r) => r.lock);
  if (isoOk(opts.lockTarget) && lockIdx >= 0) {
    const preIdx = rules.map((r, i) => (i < lockIdx && !r.parallel ? i : -1)).filter((i) => i >= 0);
    const available = workdaysBetween(startOn(opts.start, skip), opts.lockTarget, skip) - durations[lockIdx];
    const required = preIdx.reduce((a, i) => a + durations[i], 0);
    if (available <= 0) warning = 'The picture lock target is before (or right at) the start date.';
    else if (required > 0) {
      const f = available / required;
      for (const i of preIdx) durations[i] = Math.max(1, Math.round(durations[i] * f));
      // fix rounding so the editorial chain lands exactly on the target
      let diff = available - preIdx.reduce((a, i) => a + durations[i], 0);
      for (let k = preIdx.length - 1; diff !== 0 && k >= 0; k--) {
        const i = preIdx[k];
        const nd = Math.max(1, durations[i] + diff);
        diff -= nd - durations[i];
        durations[i] = nd;
      }
      if (diff < 0) warning = 'Not enough working days before the picture lock target — some steps are compressed to one day.';
    }
  }

  const rows: GeneratedDates[] = [];
  let cursor = startOn(opts.start, skip);
  let groupStart: string | null = null;
  let groupEnd: string | null = null;
  items.forEach((it, i) => {
    const r = rules[i];
    const days = durations[i];
    let s: string;
    let e: string;
    if (r.parallel) {
      if (groupStart == null) {
        groupStart = cursor;
        groupEnd = cursor;
      }
      s = groupStart;
      e = endAfter(s, days, skip);
      if (e > groupEnd!) groupEnd = e;
    } else {
      if (groupStart != null && groupEnd != null) {
        cursor = nextDay(groupEnd, skip);
        groupStart = null;
        groupEnd = null;
      }
      s = cursor;
      e = endAfter(s, days, skip);
      cursor = nextDay(e, skip);
    }
    rows.push({ id: it.id, name: it.name, start: s, end: e, days });
  });
  return { rows, warning };
}

/* ---------------------------------------------------------------- labels */

export function sceneText(model: ScriptModel, id: string | undefined): string {
  if (!id) return '';
  const s = model.sceneById.get(id);
  return s ? `${s.number}. ${s.heading || 'Untitled scene'}` : '(deleted scene)';
}

export function shotText(p: ProjectData, model: ScriptModel, id: string | undefined): string {
  if (!id) return '';
  const sh = p.shots.find((x) => x.id === id);
  if (!sh) return '(deleted shot)';
  const sc = sh.sceneId ? model.sceneById.get(sh.sceneId) : undefined;
  return `${sc ? sc.number + '/' : ''}${sh.number}`;
}

export function characterText(p: ProjectData, id: string | undefined): string {
  if (!id) return '';
  const c = p.characters.find((x) => x.id === id);
  return c ? titleCase(c.name) : '(deleted character)';
}

/* ---------------------------------------------------------------- CSV exports */

const base = (p: ProjectData, what: string) => `${safeFileName(p.meta.title)} - ${what}`;
async function done(path: string | null, what: string) {
  if (path) toast(`${what} exported to CSV`);
}

export async function csvSchedule(p: ProjectData) {
  await done(
    await exportCsv(base(p, 'Post schedule'), p.post.schedule, [
      { header: 'Milestone', value: (r) => r.name },
      { header: 'Start', value: (r) => r.start ?? '' },
      { header: 'End', value: (r) => r.end ?? '' },
      { header: 'Owner', value: (r) => r.owner ?? '' },
      { header: 'Status', value: (r) => statusLabel(r.status) },
      { header: 'Notes', value: (r) => r.notes ?? '' },
    ]),
    'Post schedule',
  );
}

export async function csvDeliverables(p: ProjectData) {
  await done(
    await exportCsv(base(p, 'Deliverables'), p.post.deliverables, [
      { header: 'Deliverable', value: (r) => r.name },
      { header: 'Platform', value: (r) => r.platform ?? '' },
      { header: 'Resolution', value: (r) => r.resolution ?? '' },
      { header: 'Aspect', value: (r) => r.aspectRatio ?? '' },
      { header: 'FPS', value: (r) => r.frameRate ?? '' },
      { header: 'Codec', value: (r) => r.codec ?? '' },
      { header: 'Container', value: (r) => r.container ?? '' },
      { header: 'Audio', value: (r) => r.audio ?? '' },
      { header: 'Loudness', value: (r) => r.loudness ?? '' },
      { header: 'Captions', value: (r) => r.captions ?? '' },
      { header: 'Duration', value: (r) => r.duration ?? '' },
      { header: 'Due', value: (r) => r.due ?? '' },
      { header: 'Status', value: (r) => statusLabel(r.status) },
      { header: 'Notes', value: (r) => r.notes ?? '' },
    ]),
    'Deliverables',
  );
}

export async function csvGraphics(p: ProjectData, model: ScriptModel) {
  await done(
    await exportCsv(base(p, 'Graphics & titles'), p.post.graphics, [
      { header: '#', value: (r) => p.post.graphics.indexOf(r) + 1 },
      { header: 'Kind', value: (r) => r.kind },
      { header: 'Text', value: (r) => r.text },
      { header: 'Subtext', value: (r) => r.subtext ?? '' },
      { header: 'Scene', value: (r) => sceneText(model, r.sceneId) },
      { header: 'TC in', value: (r) => r.tcIn ?? '' },
      { header: 'Duration', value: (r) => r.duration ?? '' },
      { header: 'Status', value: (r) => statusLabel(r.status) },
      { header: 'Notes', value: (r) => r.notes ?? '' },
    ]),
    'Graphics list',
  );
}

export async function csvMusic(p: ProjectData) {
  const fps = nominalFps(p.meta.frameRate);
  await done(
    await exportCsv(base(p, 'Music cue sheet'), p.post.music, [
      { header: 'Cue', value: (r) => r.cue },
      { header: 'Title', value: (r) => r.title },
      { header: 'Composer', value: (r) => r.composer ?? '' },
      { header: 'Publisher', value: (r) => r.publisher ?? '' },
      { header: 'Source', value: (r) => MUSIC_SOURCES.find((s) => s.value === r.source)?.label ?? r.source ?? '' },
      { header: 'TC in', value: (r) => r.tcIn ?? '' },
      { header: 'TC out', value: (r) => r.tcOut ?? '' },
      { header: 'Duration', value: (r) => fmtDur(cueSeconds(r, fps)) || r.duration || '' },
      { header: 'Usage', value: (r) => r.usage ?? '' },
      { header: 'License', value: (r) => r.license ?? '' },
      { header: 'Status', value: (r) => statusLabel(r.status) },
      { header: 'Notes', value: (r) => r.notes ?? '' },
    ]),
    'Music cue sheet',
  );
}

export async function csvVfx(p: ProjectData, model: ScriptModel) {
  await done(
    await exportCsv(base(p, 'VFX'), p.post.vfx, [
      { header: 'Code', value: (r) => r.code },
      { header: 'Scene', value: (r) => sceneText(model, r.sceneId) },
      { header: 'Shot', value: (r) => shotText(p, model, r.shotId) },
      { header: 'Description', value: (r) => r.description },
      { header: 'Vendor', value: (r) => r.vendor ?? '' },
      { header: 'Complexity', value: (r) => VFX_COMPLEXITY.find((c) => c.value === r.complexity)?.label ?? '' },
      { header: 'Due', value: (r) => r.due ?? '' },
      { header: 'Cost', value: (r) => r.cost ?? '' },
      { header: 'Status', value: (r) => statusLabel(r.status) },
      { header: 'Notes', value: (r) => r.notes ?? '' },
    ]),
    'VFX list',
  );
}

export async function csvAdr(p: ProjectData, model: ScriptModel) {
  await done(
    await exportCsv(base(p, 'ADR'), p.post.adr, [
      { header: 'Character', value: (r) => characterText(p, r.characterId) },
      { header: 'Scene', value: (r) => sceneText(model, r.sceneId) },
      { header: 'Line', value: (r) => r.line },
      { header: 'Reason', value: (r) => r.reason ?? '' },
      { header: 'TC', value: (r) => r.tc ?? '' },
      { header: 'Status', value: (r) => statusLabel(r.status) },
      { header: 'Notes', value: (r) => r.notes ?? '' },
    ]),
    'ADR list',
  );
}

export async function csvEditNotes(p: ProjectData) {
  await done(
    await exportCsv(base(p, 'Edit notes'), p.post.editNotes, [
      { header: 'Version', value: (r) => r.version ?? '' },
      { header: 'TC', value: (r) => r.tc ?? '' },
      { header: 'Note', value: (r) => r.note },
      { header: 'Author', value: (r) => r.author ?? '' },
      { header: 'Status', value: (r) => NOTE_STATUSES.find((s) => s.value === r.status)?.label ?? r.status },
    ]),
    'Edit notes',
  );
}
