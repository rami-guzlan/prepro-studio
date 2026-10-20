/* A/V script text helpers shared by the editor and the printed document:
   "SPEAKER:" label detection, rich rendering (no hooks — safe for static
   markup), spoken word counts and running-time maths. */
import { Fragment, type ReactNode } from 'react';
import type { AVRow } from '@/types';
import { wordCount } from '@/lib/text';

/** Reading speed used for suggested durations. */
export const WPM = 150;

/** Labels that are sound / picture cues rather than speakers (styled differently, not counted as speech). */
const CUE_LABELS = new Set([
  'SFX',
  'FX',
  'MUSIC',
  'MUS',
  'SOUND',
  'NAT SOUND',
  'NATS',
  'NAT',
  'AMBIENCE',
  'ATMOS',
  'SUPER',
  'GFX',
  'GRAPHIC',
  'GRAPHICS',
  'TITLE',
  'LOWER THIRD',
  'L3',
  'CG',
  'TEXT',
  'OST',
  'ON SCREEN',
  'ON-SCREEN TEXT',
  'B-ROLL',
  'BROLL',
  'ANIMATION',
  'CAPTION',
  'CUT TO',
  'TRANSITION',
]);

export interface LineParts {
  indent: string;
  /** speaker / cue label without the colon, as typed */
  label?: string;
  /** ':' plus any spaces before it */
  sep?: string;
  /** everything after the label (including the space after the colon) */
  rest: string;
  /** label is a sound/picture cue (SFX, MUSIC, SUPER …) */
  cue: boolean;
}

const LABEL_RE = /^(\s*)([^:\n]{1,40}?)(\s*:)(?=\s|$)/;

function isLabel(raw: string): boolean {
  const core = raw.replace(/\([^)]*\)/g, '').trim();
  if (!core || core.length > 30) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 .'’&/-]*$/.test(core)) return false;
  if (core === core.toUpperCase()) return true;
  const words = core.split(/\s+/);
  return words.length <= 2 && words.every((w) => /^[A-ZÀ-Þ]/.test(w));
}

export function splitLabel(line: string): LineParts {
  const m = LABEL_RE.exec(line);
  if (m && isLabel(m[2])) {
    const core = m[2].replace(/\([^)]*\)/g, '').trim().toUpperCase();
    return { indent: m[1], label: m[2], sep: m[3], rest: line.slice(m[0].length), cue: CUE_LABELS.has(core) };
  }
  return { indent: '', rest: line, cue: false };
}

const DIR_RE = /(\[[^\]\n]*\]|\([^)\n]*\))/g;

export interface RichClasses {
  spk: string;
  cue: string;
  dir: string;
}

function renderRest(rest: string, cls: RichClasses): ReactNode[] {
  const parts = rest.split(DIR_RE);
  return parts.map((t, i) => (i % 2 === 1 ? <span key={i} className={cls.dir}>{t}</span> : t ? <Fragment key={i}>{t}</Fragment> : null));
}

/** Render text with bold speaker labels, coloured cue labels and italic [directions]. Characters are preserved 1:1. */
export function RichText({ text, cls }: { text: string; cls: RichClasses }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const p = splitLabel(line);
        return (
          <Fragment key={i}>
            {i > 0 && '\n'}
            {p.label ? (
              <>
                {p.indent}
                <span className={p.cue ? cls.cue : cls.spk}>
                  {p.label}
                  {p.sep}
                </span>
              </>
            ) : null}
            {renderRest(p.rest, cls)}
          </Fragment>
        );
      })}
    </>
  );
}

/** Words that will be spoken (labels, cue lines and [directions] excluded). */
export function spokenWords(audio: string | undefined): number {
  if (!audio) return 0;
  let n = 0;
  for (const line of audio.split('\n')) {
    const p = splitLabel(line);
    if (p.label && p.cue) continue;
    n += wordCount(p.rest.replace(/\[[^\]]*\]|\([^)]*\)/g, ' '));
  }
  return n;
}

export function suggestSeconds(words: number): number | undefined {
  if (!words) return undefined;
  return Math.max(2, Math.round((words / WPM) * 60));
}

export interface RowTiming {
  words: number;
  suggested?: number;
  /** explicit duration, else the suggestion, else 0 */
  effective: number;
  /** no explicit duration was entered */
  estimated: boolean;
  start: number;
  end: number;
}

export interface Timing {
  rows: RowTiming[];
  total: number;
  words: number;
  /** total is partly based on estimates */
  estimated: boolean;
  /** seconds per segment, keyed by the row that opens the segment */
  segments: Map<string, number>;
}

export function computeTiming(rows: AVRow[]): Timing {
  let t = 0;
  let words = 0;
  let estimated = false;
  const segments = new Map<string, number>();
  let seg: string | null = null;
  const out = rows.map((r) => {
    const w = spokenWords(r.audio);
    words += w;
    const suggested = suggestSeconds(w);
    const has = typeof r.duration === 'number' && isFinite(r.duration);
    const effective = has ? Math.max(0, r.duration!) : suggested ?? 0;
    if (!has && suggested) estimated = true;
    const start = t;
    t += effective;
    if (r.segment != null) seg = r.id;
    if (seg) segments.set(seg, (segments.get(seg) ?? 0) + effective);
    return { words: w, suggested, effective, estimated: !has, start, end: t };
  });
  return { rows: out, total: t, words, estimated, segments };
}
