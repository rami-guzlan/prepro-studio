/* Script / copy helpers for the content editor and the printed brief (pure, no hooks):
   structure templates, heading detection, spoken word counts and durations at
   ~150 wpm, target-length parsing, carousel / thread parts and A/V timing. */
import type { AVRow } from '@/types';
import type { ContentFormat } from '@/spaces/types';
import { parseDuration } from '@/lib/format';
import { wordCount } from '@/lib/text';

/** Speaking rate used for duration estimates. */
export const WPM = 150;

export interface ScriptStructure {
  id: string;
  label: string;
  /** the beats, shown in the menu */
  hint: string;
  sections: [heading: string, direction: string][];
}

export const SCRIPT_STRUCTURES: ScriptStructure[] = [
  {
    id: 'short',
    label: 'Short / Reel / TikTok',
    hint: 'Hook · Setup · Payoff · CTA',
    sections: [
      ['HOOK (0–3 s)', 'Stop the scroll: a bold claim, a question or a striking image'],
      ['SETUP', 'One or two lines of context: why keep watching?'],
      ['PAYOFF', 'Deliver the value, the reveal or the punchline'],
      ['CTA', 'One clear next step: follow, comment, save, link in bio'],
    ],
  },
  {
    id: 'long',
    label: 'Long-form video',
    hint: 'Cold open · Intro · 3 sections · Outro',
    sections: [
      ['COLD OPEN', 'Start with the most intriguing moment'],
      ['INTRO', 'Who you are and what they will get, in 15–30 s'],
      ['SECTION 1', 'First point / step / story beat'],
      ['SECTION 2', 'Second point, build on the first'],
      ['SECTION 3', 'The strongest point last'],
      ['OUTRO & CTA', 'Recap, then point to the next video or subscribe'],
    ],
  },
  {
    id: 'trailer',
    label: 'Trailer',
    hint: 'Hook · World · Conflict · Escalation · Title · Button · Card',
    sections: [
      ['HOOK', 'An image or a line that grabs attention'],
      ['WORLD', 'Establish the place, the tone and the protagonist'],
      ['CONFLICT', 'What goes wrong: the inciting incident'],
      ['ESCALATION', 'Raise the stakes; the montage builds to a peak'],
      ['TITLE', 'Title card'],
      ['BUTTON', 'One last beat: a joke, a scare, a twist'],
      ['CARD', 'Release date · where to watch · credits'],
    ],
  },
  {
    id: 'podcast',
    label: 'Podcast episode',
    hint: 'Intro · Segments · Outro',
    sections: [
      ['INTRO', 'Cold-open quote, welcome, what this episode is about'],
      ['SEGMENT 1', 'Topic, questions, talking points'],
      ['SEGMENT 2', 'Topic, questions, talking points'],
      ['SEGMENT 3', 'Topic, questions, talking points'],
      ['OUTRO', 'Thanks, call to action, tease the next episode'],
    ],
  },
  {
    id: 'tutorial',
    label: 'Tutorial / how-to',
    hint: 'Result first · Why · Steps · Recap',
    sections: [
      ['HOOK', 'Show the end result first'],
      ['WHY IT MATTERS', 'The problem this solves'],
      ['STEP 1', ''],
      ['STEP 2', ''],
      ['STEP 3', ''],
      ['RECAP & CTA', 'Sum up in one sentence, then the next step'],
    ],
  },
  {
    id: 'story',
    label: 'Story / behind the scenes',
    hint: 'Hook · Before · The moment · After · Takeaway',
    sections: [
      ['HOOK', 'Drop the viewer into the moment'],
      ['BEFORE', 'Where we were, what we wanted'],
      ['THE MOMENT', 'What happened: the turn'],
      ['AFTER', 'What changed'],
      ['TAKEAWAY', 'What the audience can take from it'],
    ],
  },
  {
    id: 'ad',
    label: 'Ad (problem → solution)',
    hint: 'Hook · Problem · Solution · Proof · Offer',
    sections: [
      ['HOOK', 'Call out the audience or the pain in the first second'],
      ['PROBLEM', 'Make it relatable'],
      ['SOLUTION', 'Show the product / film / offer in action'],
      ['PROOF', 'Reviews, laurels, numbers, faces'],
      ['OFFER & CTA', 'What to do now, and why now'],
    ],
  },
];

/** Structure that fits a format best (first in the menu). */
export function structureForFormat(format: ContentFormat): string {
  switch (format) {
    case 'long_video':
    case 'livestream':
      return 'long';
    case 'trailer':
      return 'trailer';
    case 'podcast':
      return 'podcast';
    case 'ad':
      return 'ad';
    default:
      return 'short';
  }
}

export function structureText(s: ScriptStructure): string {
  return s.sections.map(([h, d]) => (d ? `${h}\n[${d}]\n` : `${h}\n\n`)).join('\n');
}

/* ---------------------------------------------------------------- analysis */

/** A line written entirely in capitals ("HOOK (0–3 s)", "SECTION 2", "OUTRO & CTA") starts a section. */
export function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  const core = t
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();
  if (core.length < 2 || !/[A-ZÀ-Þ]/.test(core)) return false;
  if (/[:.!?,;…"“”]$/.test(core)) return false;
  return core === core.toUpperCase();
}

const CUE_RE = /^\s*(SFX|FX|MUSIC|SOUND|NAT SOUND|NATS|SUPER|GFX|GRAPHIC|GRAPHICS|TITLE CARD|LOWER THIRD|TEXT|ON SCREEN|ON-SCREEN TEXT|OST|B-ROLL|BROLL|VISUAL|VISUALS|CUT TO|TRANSITION|CAPTION)\s*:/i;
const LABEL_RE = /^\s*[A-ZÀ-Þ][A-ZÀ-Þ0-9 .'’&/-]{0,30}\s*(\([^)]*\))?\s*:\s*/;

/** Words that are actually spoken: no headings, [directions], (parentheticals), speaker labels or cue lines. */
export function spokenWords(text: string | undefined): number {
  if (!text) return 0;
  let n = 0;
  for (const raw of text.split('\n')) {
    if (isHeading(raw) || CUE_RE.test(raw)) continue;
    const line = raw
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(LABEL_RE, '');
    n += wordCount(line);
  }
  return n;
}

export function secondsForWords(words: number): number {
  return Math.round((words / WPM) * 60);
}

export interface ScriptSection {
  title: string;
  /** character offset of the heading line */
  offset: number;
  words: number;
  seconds: number;
}

/** Sections of a script (text before the first heading becomes an untitled section when not empty). */
export function scriptSections(text: string | undefined): ScriptSection[] {
  if (!text) return [];
  const out: ScriptSection[] = [];
  let cur: { title: string; offset: number; body: string[] } | null = null;
  let offset = 0;
  const flush = () => {
    if (!cur) return;
    const words = spokenWords(cur.body.join('\n'));
    if (cur.title || words > 0) out.push({ title: cur.title, offset: cur.offset, words, seconds: secondsForWords(words) });
  };
  for (const line of text.split('\n')) {
    if (isHeading(line)) {
      flush();
      cur = { title: line.trim(), offset, body: [] };
    } else {
      if (!cur) cur = { title: '', offset: 0, body: [] };
      cur.body.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return out;
}

export interface LengthTarget {
  seconds?: number;
  words?: number;
}

/** '0:45', '45s', '8 min', '1:02:00' → seconds; '1200 words' → words. */
export function parseTarget(length: string | undefined): LengthTarget {
  const t = (length ?? '').trim();
  if (!t) return {};
  const w = /^([\d.,\s]+)\s*(k)?\s*words?$/i.exec(t);
  if (w) {
    const n = parseFloat(w[1].replace(/[,\s]/g, ''));
    return isNaN(n) ? {} : { words: Math.round(w[2] ? n * 1000 : n) };
  }
  // '1:30', '90', '1:02:00'
  if (/^[\d:.]+$/.test(t)) {
    const s = parseDuration(t);
    return s != null && s > 0 ? { seconds: Math.round(s) } : {};
  }
  // '8 min', '45s', '1h 30m', '2 min 30 sec' (anything else, e.g. '5 slides', is not a duration)
  const UNIT = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?=[\s\d]|$)/gi;
  if (!/^(\s*\d+(?:\.\d+)?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?=[\s\d]|$))+\s*$/i.test(t)) return {};
  let total = 0;
  for (const m of t.matchAll(UNIT)) {
    const n = parseFloat(m[1]);
    const u = m[2][0].toLowerCase();
    total += u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
  }
  return total > 0 ? { seconds: Math.round(total) } : {};
}

/* ---------------------------------------------------------------- copy parts */

const PART_RE = /^\s*---+\s*$/;

/** Copy split on lines containing only `---` (carousel slides, thread posts). */
export function splitParts(copy: string | undefined): string[] {
  if (!copy) return [];
  const parts: string[] = [];
  let cur: string[] = [];
  for (const line of copy.split('\n')) {
    if (PART_RE.test(line)) {
      parts.push(cur.join('\n').trim());
      cur = [];
    } else cur.push(line);
  }
  parts.push(cur.join('\n').trim());
  return parts;
}

export function hasParts(copy: string | undefined): boolean {
  return !!copy && copy.split('\n').some((l) => PART_RE.test(l));
}

/* ---------------------------------------------------------------- A/V timing */

export interface AVTiming {
  /** seconds per row (typed or estimated from the audio) */
  rows: { seconds: number; estimated: boolean }[];
  total: number;
  estimated: boolean;
}

export function avTiming(rows: AVRow[] | undefined): AVTiming {
  const out: AVTiming = { rows: [], total: 0, estimated: false };
  for (const r of rows ?? []) {
    if (r.duration != null && !isNaN(r.duration)) {
      out.rows.push({ seconds: r.duration, estimated: false });
      out.total += r.duration;
    } else {
      const s = secondsForWords(spokenWords(r.audio));
      out.rows.push({ seconds: s, estimated: s > 0 });
      if (s > 0) out.estimated = true;
      out.total += s;
    }
  }
  return out;
}

/** Plain-text version of A/V rows (for search, printing, converting). */
export function avToText(rows: AVRow[] | undefined): string {
  return (rows ?? [])
    .map((r) => [r.segment, r.video, r.audio].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
