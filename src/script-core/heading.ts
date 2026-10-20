/* Parsing of scene headings ("INT. KITCHEN - NIGHT") and character cues ("JOHN (V.O.)"). */

export type IntExt = 'INT' | 'EXT' | 'INT/EXT' | 'EST' | '';
export type DayNight = 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | '';

export interface ParsedHeading {
  intExt: IntExt;
  /** set / location part, e.g. "JOHN'S HOUSE - KITCHEN" */
  set: string;
  /** raw time of day, e.g. "NIGHT", "CONTINUOUS" */
  time: string;
}

const INTRO_RE = /^\s*(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|E\s*\/\s*I\.?|INT\.?|EXT\.?|EST\.?|INTERIOR|EXTERIOR)(?=[\s.]|$)[.\s]*/i;
const TIME_RE = /\b(DAY|NIGHT|MORNING|AFTERNOON|EVENING|DAWN|DUSK|SUNRISE|SUNSET|NOON|MIDNIGHT|CONTINUOUS|LATER|SAME|MOMENTS? LATER|MAGIC HOUR|GOLDEN HOUR|LATE|EARLY|TWILIGHT|FLASHBACK|PRESENT)\b/i;

export function isSceneHeadingText(text: string): boolean {
  return INTRO_RE.test(text) && /^\s*(INT|EXT|EST|I\/E|E\/I|INTERIOR|EXTERIOR)[.\s/]/i.test(text + ' ');
}

export function parseHeading(raw: string): ParsedHeading {
  let text = raw.replace(/#[^#]*#\s*$/, '').trim(); // fountain scene numbers
  text = text.replace(/^\./, ''); // fountain forced heading
  let intExt: IntExt = '';
  const m = INTRO_RE.exec(text);
  if (m) {
    const intro = m[1].toUpperCase().replace(/\s+/g, '').replace(/\./g, '');
    if (intro === 'INT' || intro === 'INTERIOR') intExt = 'INT';
    else if (intro === 'EXT' || intro === 'EXTERIOR') intExt = 'EXT';
    else if (intro === 'EST') intExt = 'EST';
    else intExt = 'INT/EXT';
    text = text.slice(m[0].length);
  }
  // split "SET - TIME" on the last dash separator
  const parts = text.split(/\s+[-–—]+\s+|\s+[-–—]+$|^[-–—]+\s+/).map((s) => s.trim()).filter(Boolean);
  let time = '';
  let set = text.trim();
  if (parts.length >= 2 && TIME_RE.test(parts[parts.length - 1])) {
    time = parts[parts.length - 1].toUpperCase();
    set = parts.slice(0, -1).join(' - ');
  } else if (parts.length >= 1) {
    set = parts.join(' - ');
  }
  return { intExt, set: set.toUpperCase().replace(/\s+/g, ' ').trim(), time };
}

/** Normalised day/night for strip colours; CONTINUOUS / LATER etc. inherit `previous`. */
export function dayNightOf(time: string, previous: DayNight = ''): DayNight {
  const t = time.toUpperCase();
  if (!t) return previous || '';
  if (/NIGHT|MIDNIGHT/.test(t)) return 'NIGHT';
  if (/DAWN|SUNRISE|EARLY MORNING/.test(t)) return 'DAWN';
  if (/DUSK|SUNSET|MAGIC HOUR|GOLDEN HOUR|TWILIGHT|EVENING/.test(t)) return 'DUSK';
  if (/DAY|MORNING|AFTERNOON|NOON/.test(t)) return 'DAY';
  if (/CONTINUOUS|LATER|SAME|MOMENT/.test(t)) return previous || '';
  return previous || '';
}

/** Strip colour key for STRIP_COLORS, e.g. 'EXT-NIGHT'. */
export function stripKey(intExt: IntExt, dn: DayNight): string {
  const ie = intExt === 'INT' ? 'INT' : intExt ? 'EXT' : 'INT';
  return `${ie}-${dn || 'DAY'}`;
}

export interface ParsedCue {
  /** canonical uppercase name without extensions */
  name: string;
  /** extensions inside parentheses, e.g. ['V.O.'] */
  extensions: string[];
}

export function parseCue(raw: string): ParsedCue {
  const text = raw.replace(/\^\s*$/, '').replace(/^@/, '').trim();
  const idx = text.indexOf('(');
  const name = (idx >= 0 ? text.slice(0, idx) : text).trim().toUpperCase().replace(/\s+/g, ' ');
  const extensions: string[] = [];
  const re = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) extensions.push(m[1].trim().toUpperCase());
  return { name, extensions };
}

/** Name used to match characters ("JOHN (V.O.)" -> "JOHN"). */
export function cueName(raw: string): string {
  return parseCue(raw).name;
}
