/* Pure data helpers of the Cast & Characters module (no UI imports — safe for print docs). */
import type { CastMember, Character, ID, Measurements } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';

/* ------------------------------------------------------------------ measurements */

export const MEASUREMENTS: { key: keyof Measurements; label: string; placeholder?: string }[] = [
  { key: 'height', label: 'Height', placeholder: '5\'7"' },
  { key: 'weight', label: 'Weight', placeholder: '140 lb' },
  { key: 'chest', label: 'Chest / Bust' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'inseam', label: 'Inseam' },
  { key: 'neck', label: 'Neck' },
  { key: 'sleeve', label: 'Sleeve' },
  { key: 'jacket', label: 'Jacket' },
  { key: 'shirt', label: 'Shirt' },
  { key: 'pants', label: 'Pants' },
  { key: 'dress', label: 'Dress' },
  { key: 'shoe', label: 'Shoe' },
  { key: 'hat', label: 'Hat' },
  { key: 'glove', label: 'Glove' },
  { key: 'hair', label: 'Hair' },
  { key: 'eyes', label: 'Eyes' },
];

export function hasMeasurements(m: Measurements | undefined): boolean {
  return !!m && MEASUREMENTS.some((f) => !!m[f.key]?.trim());
}

export const GENDER_SUGGESTIONS = ['Female', 'Male', 'Non-binary', 'Any'];
export const PRONOUN_SUGGESTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'];
export const UNION_SUGGESTIONS = ['SAG-AFTRA', 'Non-union', 'Equity', 'ACTRA', 'SAG-AFTRA (Fi-Core)', 'UBCP'];

/* ------------------------------------------------------------------ characters */

export interface CharStats {
  scenes: SceneInfo[];
  /** has dialogue in the script (under its name or an alias) */
  speaking: boolean;
  speeches: number;
  words: number;
  /** index of the first scene the character appears in (Infinity if none) */
  firstScene: number;
  eighths: number;
}

/** Per-character stats: scenes (speaking + tagged + manual), speeches and words (name + aliases). */
export function characterStats(characters: Character[], model: ScriptModel): Map<ID, CharStats> {
  const out = new Map<ID, CharStats>();
  for (const c of characters) {
    const names = [c.name, ...(c.aliases ?? [])].map((n) => n.trim().toUpperCase()).filter(Boolean);
    let speeches = 0;
    let words = 0;
    let first = Infinity;
    let speaking = false;
    for (const n of names) {
      const st = model.nameStats.get(n);
      if (!st) continue;
      speaking = true;
      speeches += st.speeches;
      words += st.words;
      first = Math.min(first, st.firstScene);
    }
    const scenes = model.scenes.filter((s) => s.characterIds.includes(c.id));
    if (scenes.length) first = Math.min(first, scenes[0].index);
    const eighths = scenes.reduce((a, s) => a + (s.eighths || 0), 0);
    out.set(c.id, { scenes, speaking, speeches, words, firstScene: first, eighths });
  }
  return out;
}

/** Characters sorted by board number (unnumbered last, then by name). */
export function sortByBoard(chars: Character[]): Character[] {
  return [...chars].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.name.localeCompare(b.name));
}

/** Map castId -> characters played (sorted by board number). */
export function rolesByCast(characters: Character[]): Map<ID, Character[]> {
  const m = new Map<ID, Character[]>();
  for (const c of sortByBoard(characters)) {
    if (!c.castId) continue;
    m.set(c.castId, [...(m.get(c.castId) ?? []), c]);
  }
  return m;
}

/** Lowest board number of an actor's roles (for sorting cast lists). */
export function boardOf(roles: Character[] | undefined): number {
  if (!roles?.length) return 1e9;
  return Math.min(...roles.map((r) => r.number ?? 1e9));
}

export function sortCastByBoard(cast: CastMember[], roles: Map<ID, Character[]>): CastMember[] {
  return [...cast].sort((a, b) => boardOf(roles.get(a.id)) - boardOf(roles.get(b.id)) || a.name.localeCompare(b.name));
}
