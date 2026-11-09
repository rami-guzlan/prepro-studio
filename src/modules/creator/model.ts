/* Creator workspace (YouTube / social videos): defaults, presets, and the
   progress model. Each stage has steps worked out from the data itself (a
   picked hook, shots ticked, platforms live …), so the workspace can always
   say what to do next without anyone keeping a checklist up to date. */
import type { CreatorBeat, CreatorCheck, CreatorData, CreatorOption, CreatorShotKind, CreatorStage, ProjectStatus } from '@/types';
import { uid } from '@/lib/id';
import { diffDays, todayISO } from '@/lib/dates';

export const STAGES: { value: CreatorStage; label: string; verb: string; hint: string }[] = [
  { value: 'idea', label: 'Idea', verb: 'Shape the idea', hint: 'Premise, hook, title, thumbnail and a rough outline' },
  { value: 'plan', label: 'Plan', verb: 'Plan the shoot', hint: 'A shot list, the gear and a date, kept light' },
  { value: 'shoot', label: 'Shoot', verb: 'Shoot it', hint: 'Pre-roll checks, prompter, tick the shots' },
  { value: 'edit', label: 'Edit', verb: 'Edit it', hint: 'From selects to export, one pass at a time' },
  { value: 'publish', label: 'Publish', verb: 'Get it out', hint: 'Title, description, thumbnail, every platform' },
  { value: 'done', label: 'Done', verb: 'Out in the world', hint: 'Note how it did and start the next one' },
];
export const STAGE_ORDER = STAGES.map((s) => s.value);
export const stageInfo = (s: CreatorStage) => STAGES.find((x) => x.value === s) ?? STAGES[0];
export const nextStage = (s: CreatorStage): CreatorStage => STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, STAGE_ORDER.indexOf(s) + 1)];

/** The production status that goes with each stage (library badges and board). */
export const STATUS_OF_STAGE: Record<CreatorStage, ProjectStatus> = { idea: 'development', plan: 'pre', shoot: 'production', edit: 'post', publish: 'post', done: 'delivered' };

export const SHOT_KINDS: { value: CreatorShotKind; label: string }[] = [
  { value: 'a_roll', label: 'A-roll (talking)' },
  { value: 'b_roll', label: 'B-roll' },
  { value: 'insert', label: 'Insert / detail' },
  { value: 'screen', label: 'Screen recording' },
];
export const BEAT_KINDS: { value: NonNullable<CreatorBeat['kind']>; label: string }[] = [
  { value: 'hook', label: 'Hook' },
  { value: 'intro', label: 'Intro' },
  { value: 'point', label: 'Point' },
  { value: 'cta', label: 'Call to action' },
  { value: 'outro', label: 'Outro' },
];

export const PLATFORMS = ['YouTube', 'YouTube Shorts', 'Instagram Reels', 'TikTok', 'LinkedIn', 'X', 'Facebook'];

/** One-tap B-roll and insert ideas for the plan. */
export const SHOT_PRESETS: { text: string; kind: CreatorShotKind }[] = [
  { text: 'Wide establishing shot', kind: 'b_roll' },
  { text: 'Walk-and-talk', kind: 'a_roll' },
  { text: 'Hands at work, close-up', kind: 'insert' },
  { text: 'Product / prop detail', kind: 'insert' },
  { text: 'Over-the-shoulder on the screen', kind: 'b_roll' },
  { text: 'Screen recording of the steps', kind: 'screen' },
  { text: 'Reaction / cutaway', kind: 'b_roll' },
  { text: 'Time-lapse', kind: 'b_roll' },
  { text: 'Thumbnail photo (posed, expressive)', kind: 'insert' },
];

/** Outline shapes that fill the beats in one click. */
export const OUTLINE_TEMPLATES: { id: string; label: string; beats: { text: string; kind: CreatorBeat['kind']; seconds?: number }[] }[] = [
  {
    id: 'tutorial',
    label: 'Tutorial / how-to',
    beats: [
      { text: 'Hook: show the end result first', kind: 'hook', seconds: 10 },
      { text: 'What you will be able to do and why it matters', kind: 'intro', seconds: 20 },
      { text: 'Step 1', kind: 'point', seconds: 60 },
      { text: 'Step 2', kind: 'point', seconds: 60 },
      { text: 'Step 3', kind: 'point', seconds: 60 },
      { text: 'Common mistake to avoid', kind: 'point', seconds: 30 },
      { text: 'Recap + what to watch next', kind: 'cta', seconds: 20 },
    ],
  },
  {
    id: 'story',
    label: 'Story',
    beats: [
      { text: 'Cold open: the moment it went wrong (or right)', kind: 'hook', seconds: 15 },
      { text: 'Who I am / the setup', kind: 'intro', seconds: 30 },
      { text: 'The challenge', kind: 'point', seconds: 60 },
      { text: 'The turning point', kind: 'point', seconds: 60 },
      { text: 'What changed', kind: 'point', seconds: 45 },
      { text: 'The lesson for you', kind: 'cta', seconds: 30 },
    ],
  },
  {
    id: 'list',
    label: 'List (3 to 5 things)',
    beats: [
      { text: 'Hook: the one thing most people get wrong', kind: 'hook', seconds: 10 },
      { text: '#1', kind: 'point', seconds: 45 },
      { text: '#2', kind: 'point', seconds: 45 },
      { text: '#3', kind: 'point', seconds: 45 },
      { text: 'Bonus', kind: 'point', seconds: 30 },
      { text: 'Which one will you try? (comment prompt)', kind: 'cta', seconds: 15 },
    ],
  },
  {
    id: 'short',
    label: 'Short / reel (under 60 s)',
    beats: [
      { text: 'Hook in the first 2 seconds (text on screen too)', kind: 'hook', seconds: 3 },
      { text: 'The payoff, fast', kind: 'point', seconds: 30 },
      { text: 'Loop back to the start or a one-line CTA', kind: 'cta', seconds: 5 },
    ],
  },
  {
    id: 'review',
    label: 'Review / opinion',
    beats: [
      { text: 'Verdict up front', kind: 'hook', seconds: 10 },
      { text: 'What it is and who it is for', kind: 'intro', seconds: 30 },
      { text: 'What is great', kind: 'point', seconds: 60 },
      { text: 'What is not', kind: 'point', seconds: 60 },
      { text: 'Who should get it (and who should skip it)', kind: 'cta', seconds: 30 },
    ],
  },
];

/** Hook formulas to get unstuck. */
export const HOOK_PROMPTS = [
  'Here’s how I … in … (without …)',
  'Stop doing … Do this instead.',
  'I tried … for 30 days. Here’s what happened.',
  'The … nobody tells you about.',
  'If you … , watch this first.',
  '3 mistakes I made with … (so you don’t have to)',
];

const checks = (labels: string[]): CreatorCheck[] => labels.map((label) => ({ id: uid('chk'), label }));

export const GEAR_PRESET = ['Camera / phone', 'Lens', 'Microphone + windscreen', 'Batteries charged', 'Cards formatted / storage free', 'Tripod or mount', 'Light', 'Phone on Do Not Disturb'];
export const PREROLL_PRESET = ['Audio levels checked (clap test)', 'Focus and exposure locked', 'Framing: eyes on the upper third, headroom', 'Background tidy', 'Recording: red light on, timer running'];
export const EDIT_PRESET = ['Import and back up the footage', 'Pull selects', 'Rough cut: story first', 'B-roll, inserts and screen recordings', 'Music and sound effects', 'Captions / subtitles', 'Colour and audio pass', 'Watch it once start to finish', 'Export (and a vertical cut if needed)'];
export const PUBLISH_PRESET = ['Thumbnail exported (and an alternate)', 'Description with links and chapters', 'End screen and cards', 'Pinned comment', 'Shared to community / socials', 'Replied to the first comments'];

export function defaultCreator(format: 'long' | 'short' = 'long'): CreatorData {
  return {
    stage: 'idea',
    format,
    idea: { premise: '', audience: '', payoff: '', hooks: [], titles: [], thumbnail: { concept: '', text: '' }, beats: [], notes: '' },
    plan: { location: '', wardrobe: '', notes: '', shots: [], gear: checks(GEAR_PRESET) },
    shoot: { preroll: checks(PREROLL_PRESET), prompter: { source: 'beats', text: '', speed: 3, size: 44 }, log: [] },
    edit: { checklist: checks(format === 'short' ? EDIT_PRESET.filter((x) => !/vertical|colour/i.test(x)) : EDIT_PRESET), versions: [], notes: '', projectFile: '' },
    publish: {
      title: '',
      description: '',
      tags: '',
      platforms: (format === 'short' ? ['YouTube Shorts', 'Instagram Reels', 'TikTok'] : ['YouTube']).map((platform) => ({ id: uid('plat'), platform, status: 'todo' as const })),
      checklist: checks(format === 'short' ? PUBLISH_PRESET.filter((x) => !/end screen|chapters/i.test(x)) : PUBLISH_PRESET),
      results: '',
    },
    sessions: [],
  };
}

/** Fill whatever is missing (older files, hand edits). Mutates. */
export function normalizeCreator(c: Partial<CreatorData> | undefined): CreatorData {
  const d = defaultCreator(c?.format === 'short' ? 'short' : 'long');
  const x = (c ?? {}) as CreatorData;
  const arr = <T,>(v: T[] | undefined, fallback: T[]) => (Array.isArray(v) ? v : fallback);
  x.stage = STAGE_ORDER.includes(x.stage) ? x.stage : 'idea';
  x.format = x.format === 'short' ? 'short' : 'long';
  x.idea = { ...d.idea, ...(x.idea ?? {}) };
  x.idea.hooks = arr(x.idea.hooks, []);
  x.idea.titles = arr(x.idea.titles, []);
  x.idea.beats = arr(x.idea.beats, []);
  x.idea.thumbnail = { ...d.idea.thumbnail, ...(x.idea.thumbnail ?? {}) };
  x.plan = { ...d.plan, ...(x.plan ?? {}) };
  x.plan.shots = arr(x.plan.shots, []);
  x.plan.gear = arr(x.plan.gear, d.plan.gear);
  x.shoot = { ...d.shoot, ...(x.shoot ?? {}) };
  x.shoot.preroll = arr(x.shoot.preroll, d.shoot.preroll);
  x.shoot.prompter = { ...d.shoot.prompter, ...(x.shoot.prompter ?? {}) };
  x.shoot.log = arr(x.shoot.log, []);
  x.edit = { ...d.edit, ...(x.edit ?? {}) };
  x.edit.checklist = arr(x.edit.checklist, d.edit.checklist);
  x.edit.versions = arr(x.edit.versions, []);
  x.publish = { ...d.publish, ...(x.publish ?? {}) };
  x.publish.platforms = arr(x.publish.platforms, d.publish.platforms);
  x.publish.checklist = arr(x.publish.checklist, d.publish.checklist);
  x.sessions = arr(x.sessions, []);
  return x;
}

/* ---------------------------------------------------------------- progress */

export type CreatorTab = 'today' | 'idea' | 'plan' | 'shoot' | 'edit' | 'publish';

export interface Step {
  label: string;
  done: boolean;
  /** where to do it */
  tab: CreatorTab;
  /** element to scroll to on that tab */
  anchor?: string;
}

const picked = (xs: CreatorOption[]) => xs.find((x) => x.picked);
const allDone = (xs: CreatorCheck[]) => xs.length > 0 && xs.every((x) => x.done);

/** The steps of each stage, read off the data. */
export function stageSteps(c: CreatorData): Record<Exclude<CreatorStage, 'done'>, Step[]> {
  const shots = c.plan.shots;
  const live = c.publish.platforms.filter((p) => p.status === 'live').length;
  return {
    idea: [
      { label: 'Say what the video is in one sentence', done: !!c.idea.premise.trim(), tab: 'idea', anchor: 'cr-premise' },
      { label: 'Pick a hook', done: !!picked(c.idea.hooks), tab: 'idea', anchor: 'cr-hooks' },
      { label: 'Pick a title', done: !!picked(c.idea.titles) || !!c.publish.title.trim(), tab: 'idea', anchor: 'cr-titles' },
      { label: 'Sketch the thumbnail idea', done: !!(c.idea.thumbnail.concept.trim() || c.idea.thumbnail.image), tab: 'idea', anchor: 'cr-thumb' },
      { label: c.format === 'short' ? 'Write the beats (2 or more)' : 'Outline the beats (3 or more)', done: c.idea.beats.filter((b) => b.text.trim()).length >= (c.format === 'short' ? 2 : 3), tab: 'idea', anchor: 'cr-beats' },
    ],
    plan: [
      { label: 'List the shots', done: shots.length > 0, tab: 'plan', anchor: 'cr-shots' },
      { label: 'Add some B-roll or inserts', done: shots.some((s) => s.kind !== 'a_roll'), tab: 'plan', anchor: 'cr-shots' },
      { label: 'Pack the gear', done: allDone(c.plan.gear), tab: 'plan', anchor: 'cr-gear' },
      { label: 'Pick a shoot day', done: !!c.plan.shootDate, tab: 'plan', anchor: 'cr-when' },
    ],
    shoot: [
      { label: 'Run the pre-roll checks', done: allDone(c.shoot.preroll), tab: 'shoot', anchor: 'cr-preroll' },
      { label: shots.length ? `Get every shot (${shots.filter((s) => s.done).length} of ${shots.length})` : 'Get the shots', done: shots.length > 0 && shots.every((s) => s.done), tab: 'shoot', anchor: 'cr-shotlist' },
    ],
    edit: [
      ...c.edit.checklist.map((x): Step => ({ label: x.label, done: !!x.done, tab: 'edit', anchor: 'cr-editlist' })),
      { label: 'Log the exported version', done: c.edit.versions.length > 0, tab: 'edit', anchor: 'cr-versions' },
    ],
    publish: [
      { label: 'Final title', done: !!c.publish.title.trim(), tab: 'publish', anchor: 'cr-pubtitle' },
      { label: 'Description', done: !!c.publish.description.trim(), tab: 'publish', anchor: 'cr-desc' },
      { label: 'Final thumbnail', done: !!c.publish.thumbnail, tab: 'publish', anchor: 'cr-pubthumb' },
      { label: c.publish.platforms.length ? `Live on every platform (${live} of ${c.publish.platforms.length})` : 'Pick the platforms', done: c.publish.platforms.length > 0 && live === c.publish.platforms.length, tab: 'publish', anchor: 'cr-platforms' },
      ...c.publish.checklist.map((x): Step => ({ label: x.label, done: !!x.done, tab: 'publish', anchor: 'cr-publist' })),
    ],
  };
}

export function stageProgress(c: CreatorData): Record<CreatorStage, { done: number; total: number }> {
  const s = stageSteps(c);
  const out = {} as Record<CreatorStage, { done: number; total: number }>;
  for (const k of STAGE_ORDER) {
    const steps = k === 'done' ? [] : s[k];
    out[k] = { done: steps.filter((x) => x.done).length, total: steps.length };
  }
  return out;
}

/** What to do now: the first open step of the current stage (or a nudge to move on). */
export function nextAction(c: CreatorData): { step?: Step; ready: boolean } {
  if (c.stage === 'done') return { ready: false };
  const steps = stageSteps(c)[c.stage];
  const step = steps.find((x) => !x.done);
  return { step, ready: !step };
}

export function overallPercent(c: CreatorData): number {
  const p = stageProgress(c);
  const idx = STAGE_ORDER.indexOf(c.stage);
  if (c.stage === 'done') return 100;
  const per = 100 / 5;
  const cur = p[c.stage];
  return Math.round(idx * per + (cur.total ? (cur.done / cur.total) * per : 0));
}

/** Days until the publish-by date (negative = late). */
export const daysLeft = (c: CreatorData, today = todayISO()) => (c.targetDate ? diffDays(today, c.targetDate) : null);

/** Sessions of the last 7 days, and the streak of days in a row with a session (up to today). */
export function sessionStats(c: CreatorData, today = todayISO()) {
  const days = new Set(c.sessions.map((s) => s.date));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (days.has(iso)) streak++;
    else if (i > 0) break;
  }
  const week = c.sessions.filter((s) => diffDays(s.date, today) < 7);
  return { streak, weekMinutes: week.reduce((n, s) => n + s.minutes, 0), weekSessions: week.length, totalMinutes: c.sessions.reduce((n, s) => n + s.minutes, 0) };
}

/** YouTube chapters from the outline (needs the first at 0:00). */
export function chaptersFromBeats(beats: CreatorBeat[]): string {
  let t = 0;
  const lines: string[] = [];
  for (const b of beats) {
    if (!b.text.trim()) continue;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    lines.push(`${m}:${String(s).padStart(2, '0')} ${b.text.replace(/^(hook|intro|cta|outro)\s*:\s*/i, '').trim()}`);
    t += b.seconds ?? 30;
  }
  return lines.join('\n');
}

/** Rough runtime of the outline. */
export const outlineSeconds = (beats: CreatorBeat[]) => beats.reduce((n, b) => n + (b.seconds ?? 0), 0);
export const fmtSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)} s`);
