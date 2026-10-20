/* Derived data for batch shoot planning (pure functions; use with useMemo). */
import type { ContentPiece, ContentShot, ContentStage, ShootSession, ShotKind, SpaceData } from '@/spaces/types';
import { FORMAT_BY_ID, SHOT_KINDS } from '@/spaces/constants';
import { parseISODate, todayISO } from '@/lib/dates';
import { formatSeconds } from '@/lib/format';
import { wordCount } from '@/lib/text';

/** Stages a piece can be added to a shoot session in. */
export const FILMABLE_STAGES: ContentStage[] = ['idea', 'writing', 'planning', 'production'];
/** Stages that show up in "Needs filming" when the piece has no session. */
export const NEEDS_FILMING_STAGES: ContentStage[] = ['writing', 'planning', 'production'];

/** Video or audio formats get filmed / recorded. */
export function isFilmable(c: Pick<ContentPiece, 'format'>): boolean {
  const f = FORMAT_BY_ID[c.format];
  return !!(f?.video || f?.audio);
}

export function validDate(iso: string | undefined | null): iso is string {
  return !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !!parseISODate(iso);
}

/* ---------------------------------------------------------------- sessions ⇄ pieces */

export interface SessionIndex {
  /** pieces of each session, in filming order */
  pieces: Map<string, ContentPiece[]>;
  /** ids listed in a session that point to deleted content */
  missing: Map<string, string[]>;
  /** content id → session id it is filmed in */
  sessionOf: Map<string, string>;
}

/**
 * Resolve which pieces belong to which session. `ContentPiece.shootId` wins when it
 * points to an existing session; pieces only listed in `ShootSession.contentIds`
 * (older data, or a link made elsewhere) count too. Never throws on stale ids.
 */
export function indexSessions(s: Pick<SpaceData, 'shoots' | 'content'>): SessionIndex {
  const shoots = s.shoots ?? [];
  const content = s.content ?? [];
  const byId = new Map(content.map((c) => [c.id, c]));
  const shootIds = new Set(shoots.map((x) => x.id));
  const sessionOf = new Map<string, string>();
  for (const c of content) if (c.shootId && shootIds.has(c.shootId)) sessionOf.set(c.id, c.shootId);
  const pieces = new Map<string, ContentPiece[]>();
  const missing = new Map<string, string[]>();
  const members = new Map<string, Set<string>>();
  for (const sh of shoots) {
    const list: ContentPiece[] = [];
    const miss: string[] = [];
    const seen = new Set<string>();
    for (const id of sh.contentIds ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const c = byId.get(id);
      if (!c) {
        miss.push(id);
        continue;
      }
      const owner = sessionOf.get(c.id);
      if (owner && owner !== sh.id) continue; // moved to another session
      if (!owner) sessionOf.set(c.id, sh.id);
      list.push(c);
    }
    pieces.set(sh.id, list);
    missing.set(sh.id, miss);
    members.set(sh.id, new Set(list.map((c) => c.id)));
  }
  // linked through shootId but not (yet) listed in the session
  for (const c of content) {
    const sid = sessionOf.get(c.id);
    if (!sid) continue;
    const m = members.get(sid);
    if (m && !m.has(c.id)) {
      m.add(c.id);
      pieces.get(sid)?.push(c);
    }
  }
  return { pieces, missing, sessionOf };
}

/** Pieces that still need a shoot session. */
export function needsFilming(content: ContentPiece[], idx: SessionIndex): ContentPiece[] {
  return content.filter((c) => isFilmable(c) && NEEDS_FILMING_STAGES.includes(c.stage) && !idx.sessionOf.has(c.id));
}

/** Pieces that can be added to a session (filmable, idea…shooting, not in any session yet). */
export function addablePieces(content: ContentPiece[], idx: SessionIndex): ContentPiece[] {
  return content.filter((c) => isFilmable(c) && FILMABLE_STAGES.includes(c.stage) && !idx.sessionOf.has(c.id));
}

/* ---------------------------------------------------------------- estimates */

export interface ScriptEstimate {
  words: number;
  seconds: number;
}

/** Spoken length estimate from the script (≈150 words per minute) or the A/V rows. */
export function scriptEstimate(c: ContentPiece): ScriptEstimate | null {
  let words = wordCount(c.script ?? '');
  let seconds = 0;
  if (!words && Array.isArray(c.avRows) && c.avRows.length) {
    words = c.avRows.reduce((n, r) => n + wordCount(r?.audio ?? ''), 0);
    seconds = c.avRows.reduce((n, r) => n + (typeof r?.duration === 'number' ? r.duration : 0), 0);
  }
  if (!words && !seconds) return null;
  return { words, seconds: seconds || Math.max(1, Math.round(words / 2.5)) };
}

export function estimateLabel(e: ScriptEstimate | null): string {
  if (!e) return '';
  return `~${formatSeconds(e.seconds)}`;
}

export interface ShotStats {
  total: number;
  done: number;
  /** sum of shot durations (seconds) */
  seconds: number;
}

export function shotStats(pieces: ContentPiece[]): ShotStats {
  let total = 0;
  let done = 0;
  let seconds = 0;
  for (const c of pieces)
    for (const sh of c.shots ?? []) {
      total++;
      if (sh.done) done++;
      if (typeof sh.duration === 'number' && !isNaN(sh.duration)) seconds += sh.duration;
    }
  return { total, done, seconds };
}

/* ---------------------------------------------------------------- session status */

/** A session is "filmed" when every piece moved past shooting and every shot is done. */
export function isSessionFilmed(pieces: ContentPiece[]): boolean {
  if (!pieces.length) return false;
  const stats = shotStats(pieces);
  const later: ContentStage[] = ['editing', 'ready', 'published'];
  return pieces.every((c) => later.includes(c.stage)) && stats.done === stats.total;
}

export function isPastSession(sh: ShootSession, today = todayISO()): boolean {
  return validDate(sh.date) && sh.date < today;
}

/** Upcoming first (dated ascending, then undated), past sessions newest first. */
export function splitSessions(shoots: ShootSession[], today = todayISO()): { upcoming: ShootSession[]; past: ShootSession[] } {
  const upcoming = shoots
    .filter((s) => !isPastSession(s, today))
    .sort((a, b) => {
      const da = validDate(a.date) ? a.date : '~';
      const db = validDate(b.date) ? b.date : '~';
      return da.localeCompare(db) || (a.callTime ?? '').localeCompare(b.callTime ?? '') || (a.title ?? '').localeCompare(b.title ?? '');
    });
  const past = shoots.filter((s) => isPastSession(s, today)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return { upcoming, past };
}

/* ---------------------------------------------------------------- filming order */

const KIND_ORDER: ShotKind[] = ['a_roll', 'b_roll', 'insert', 'screen', 'graphic', 'other'];
export const NO_LOCATION = 'Location not set';

export interface OrderRow {
  piece: ContentPiece;
  shot: ContentShot;
}

export interface LocationGroup {
  location: string;
  rows: OrderRow[];
  seconds: number;
}

/**
 * Suggested filming order: shots grouped by location (shot → piece → session location),
 * then by kind (talking A-roll while the setup is lit, then B-roll and inserts …),
 * keeping the run-of-show order inside each kind.
 */
export function filmingOrder(pieces: ContentPiece[], sessionLocation?: string): LocationGroup[] {
  const groups = new Map<string, OrderRow[]>();
  const fallback = sessionLocation?.trim() || '';
  for (const piece of pieces)
    for (const shot of piece.shots ?? []) {
      const loc = shot.location?.trim() || piece.location?.trim() || fallback || NO_LOCATION;
      const list = groups.get(loc) ?? [];
      list.push({ piece, shot });
      groups.set(loc, list);
    }
  const rank = (k: ShotKind | undefined) => {
    const i = KIND_ORDER.indexOf(k ?? 'other');
    return i < 0 ? KIND_ORDER.length : i;
  };
  const out: LocationGroup[] = [];
  for (const [location, rows] of groups) {
    const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.shot.kind) - rank(b.r.shot.kind) || a.i - b.i).map((x) => x.r);
    out.push({ location, rows: sorted, seconds: sorted.reduce((n, r) => n + (r.shot.duration ?? 0), 0) });
  }
  return out.sort((a, b) => Number(a.location === NO_LOCATION) - Number(b.location === NO_LOCATION));
}

export function shotKindLabel(k: ShotKind | undefined): string {
  return SHOT_KINDS.find((x) => x.value === k)?.label ?? '';
}

/** Short kind label for tight columns. */
export function shotKindShort(k: ShotKind | undefined): string {
  switch (k) {
    case 'a_roll':
      return 'A-roll';
    case 'b_roll':
      return 'B-roll';
    case 'insert':
      return 'Insert';
    case 'screen':
      return 'Screen';
    case 'graphic':
      return 'Graphic';
    case 'other':
      return 'Other';
    default:
      return '';
  }
}

export const FRAMING_SUGGESTIONS = ['Wide', 'Medium', 'MCU', 'Close-up', 'ECU', 'OTS', 'POV', 'Top-down', 'Tracking', 'Handheld', 'Gimbal', 'Drone'];

/** Standard checklist offered for an empty session. */
export const STANDARD_SHOOT_CHECKLIST = [
  'Batteries charged',
  'Cards formatted & backed up',
  'Scripts / prompter loaded',
  'Wardrobe & props packed',
  'Location confirmed',
  'Audio check',
  'Footage backed up after wrap',
];
