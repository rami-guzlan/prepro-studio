/* ==========================================================================
   ScriptModel: everything production modules need to know about the script —
   scenes (number, heading parts, page, eighths, cast, tagged elements),
   speaking characters, sets and the full pagination.
   Build with buildScriptModel(); in React use useScriptModel() from
   '@/derived/script' (cached, cheap to call from many components).
   ========================================================================== */
import type { BreakdownCategory, BreakdownElement, Character, ID, ProjectSettings, SceneMeta } from '@/types';
import { docToParas, type Para } from './paragraphs';
import { dayNightOf, parseCue, parseHeading, stripKey, type DayNight, type IntExt } from './heading';
import { paginate, rowsToEighths, type Pagination } from './pagination';
import { wordCount } from '@/lib/text';

export interface SceneInfo {
  id: ID;
  /** 0-based order in the script */
  index: number;
  /** display scene number ('12', '12A' ...) */
  number: string;
  heading: string;
  intExt: IntExt;
  /** set / location name from the heading, uppercase */
  set: string;
  /** raw time of day ('NIGHT', 'CONTINUOUS' ...) */
  time: string;
  /** normalised DAY / NIGHT / DAWN / DUSK ('' if unknown) */
  dayNight: DayNight;
  /** key into STRIP_COLORS */
  stripKey: string;
  /** paragraph range [paraStart, paraEnd) */
  paraStart: number;
  paraEnd: number;
  /** character names speaking in the scene (uppercase, no extensions) */
  speaking: string[];
  /** character ids in the scene: speaking + tagged as cast + added manually */
  characterIds: ID[];
  /** breakdown element ids: tagged in text + added manually + linked on the element */
  elementIds: ID[];
  /** tags found in the scene text */
  tagged: { cat: BreakdownCategory; id: ID }[];
  /** SceneMeta.synopsis or '' */
  synopsis: string;
  /** first action paragraph text (fallback description) */
  firstAction: string;
  /** 1-based page where the scene starts */
  page: number;
  /** length in eighths of a page (SceneMeta.eighthsOverride wins) */
  eighths: number;
  /** length in eighths computed from the pages (ignores the override) */
  autoEighths: number;
  /** speaking names that are only heard (all their cues in the scene are V.O. / O.S. / O.C. / filtered) */
  offscreen: string[];
  meta?: SceneMeta;
}

export interface NameStats {
  scenes: number;
  /** number of speeches */
  speeches: number;
  words: number;
  firstScene: number;
}

export interface ScriptModel {
  paras: Para[];
  scenes: SceneInfo[];
  sceneById: Map<ID, SceneInfo>;
  /** scene index for each paragraph (-1 before the first scene heading) */
  sceneOfPara: number[];
  /** speaking character names, most frequent first */
  speakingNames: string[];
  nameStats: Map<string, NameStats>;
  /** unique set names in order of appearance */
  sets: string[];
  /** character cue paragraphs that get an automatic (CONT'D) */
  contdParas: Set<number>;
  /** scene number per scene-heading paragraph index */
  sceneNumbers: Map<number, string>;
  pagination: Pagination;
  pageCount: number;
  wordCount: number;
  /** estimated screen time in minutes (≈ 1 page per minute) */
  estMinutes: number;
}

export interface ScriptModelInput {
  doc: unknown;
  scenes: Record<ID, SceneMeta>;
  characters: Character[];
  elements: BreakdownElement[];
  settings: ProjectSettings;
}

function nameIndex(characters: Character[]): Map<string, ID> {
  const m = new Map<string, ID>();
  for (const c of characters) {
    m.set(c.name.toUpperCase(), c.id);
    for (const a of c.aliases ?? []) m.set(a.toUpperCase(), c.id);
  }
  return m;
}

/** Automatic scene numbering honouring locked numbers (SceneMeta.number). */
export function numberScenes(sceneParas: { sid?: string }[], metas: Record<ID, SceneMeta>): string[] {
  const anyLocked = sceneParas.some((p) => p.sid && metas[p.sid]?.number);
  const out: string[] = [];
  let prev = '';
  let letter = 0;
  sceneParas.forEach((p, i) => {
    const locked = p.sid ? metas[p.sid]?.number : undefined;
    if (locked) {
      out.push(locked);
      prev = locked;
      letter = 0;
    } else if (!anyLocked) {
      out.push(String(i + 1));
    } else {
      letter++;
      const base = prev || '0';
      out.push(`${base}${String.fromCharCode(64 + Math.min(26, letter))}`);
    }
  });
  return out;
}

export function buildScriptModel(input: ScriptModelInput): ScriptModel {
  const paras = docToParas(input.doc);
  const metas = input.scenes ?? {};
  const names = nameIndex(input.characters ?? []);

  // ---- scene ranges
  const headingIdx: number[] = [];
  paras.forEach((p, i) => {
    if (p.type === 'scene_heading') headingIdx.push(i);
  });
  const numbers = numberScenes(
    headingIdx.map((i) => paras[i]),
    metas,
  );
  const sceneNumbers = new Map<number, string>();
  headingIdx.forEach((pi, k) => sceneNumbers.set(pi, numbers[k]));

  const sceneOfPara: number[] = new Array(paras.length).fill(-1);
  headingIdx.forEach((start, k) => {
    const end = k + 1 < headingIdx.length ? headingIdx[k + 1] : paras.length;
    for (let i = start; i < end; i++) sceneOfPara[i] = k;
  });

  // ---- automatic (CONT'D)
  const contdParas = computeContd(paras, input.settings.script.autoContd);

  // ---- pagination
  const pagination = paginate(paras, {
    settings: input.settings.script,
    paper: input.settings.paperSize,
    contdParas,
    sceneNumbers,
  });
  const L = pagination.geometry.linesPerPage;

  // ---- elements linked from the element side
  const linkedByScene = new Map<ID, ID[]>();
  for (const el of input.elements ?? []) {
    for (const sid of el.sceneIds ?? []) {
      const arr = linkedByScene.get(sid) ?? [];
      arr.push(el.id);
      linkedByScene.set(sid, arr);
    }
  }

  // ---- scenes
  const scenes: SceneInfo[] = [];
  const sets: string[] = [];
  const setSeen = new Set<string>();
  const nameStats = new Map<string, NameStats>();
  let prevDN: DayNight = '';
  headingIdx.forEach((start, k) => {
    const end = k + 1 < headingIdx.length ? headingIdx[k + 1] : paras.length;
    const hp = paras[start];
    const sid = hp.sid || `__scene${k}`;
    const meta = metas[sid];
    const h = parseHeading(hp.text);
    const dn = dayNightOf(h.time, prevDN);
    prevDN = dn || prevDN;
    if (h.set && !setSeen.has(h.set)) {
      setSeen.add(h.set);
      sets.push(h.set);
    }
    const speaking: string[] = [];
    const onscreenCue = new Set<string>();
    const tagged: { cat: BreakdownCategory; id: ID }[] = [];
    const tagSeen = new Set<string>();
    let firstAction = '';
    for (let i = start + 1; i < end; i++) {
      const p = paras[i];
      if (p.type === 'character') {
        const cue = parseCue(p.text);
        const n = cue.name;
        if (n && !speaking.includes(n)) speaking.push(n);
        if (n && !cue.extensions.some((x) => /^(V\.?O\.?|O\.?S\.?|O\.?C\.?|FILTERED|ON PHONE|PRE-LAP|INTO PHONE|ON TV|ON RADIO)$/.test(x))) onscreenCue.add(n);
        if (n) {
          const st = nameStats.get(n) ?? { scenes: 0, speeches: 0, words: 0, firstScene: k };
          st.speeches++;
          nameStats.set(n, st);
        }
      } else if (p.type === 'dialogue') {
        // attribute words to the most recent cue
        for (let j = i - 1; j > start; j--) {
          if (paras[j].type === 'character') {
            const n = parseCue(paras[j].text).name;
            const st = nameStats.get(n);
            if (st) st.words += wordCount(p.text);
            break;
          }
          if (paras[j].type !== 'parenthetical' && paras[j].type !== 'dialogue') break;
        }
      } else if (p.type === 'action' && !firstAction && p.text.trim()) {
        firstAction = p.text.trim();
      }
      for (const r of p.runs) {
        for (const t of r.tags ?? []) {
          const key = `${t.cat}:${t.id}`;
          if (!tagSeen.has(key)) {
            tagSeen.add(key);
            tagged.push({ cat: t.cat, id: t.id });
          }
        }
      }
    }
    // tags in the heading itself
    for (const r of hp.runs) {
      for (const t of r.tags ?? []) {
        const key = `${t.cat}:${t.id}`;
        if (!tagSeen.has(key)) {
          tagSeen.add(key);
          tagged.push({ cat: t.cat, id: t.id });
        }
      }
    }
    for (const n of speaking) {
      const st = nameStats.get(n);
      if (st) st.scenes++;
    }
    const characterIds: ID[] = [];
    const addChar = (id: ID | undefined) => {
      if (id && !characterIds.includes(id)) characterIds.push(id);
    };
    for (const n of speaking) addChar(names.get(n));
    for (const t of tagged) if (t.cat === 'cast') addChar(t.id);
    for (const id of meta?.characterIds ?? []) addChar(id);

    const elementIds: ID[] = [];
    const addEl = (id: ID) => {
      if (!elementIds.includes(id)) elementIds.push(id);
    };
    for (const t of tagged) if (t.cat !== 'cast') addEl(t.id);
    for (const id of meta?.elementIds ?? []) addEl(id);
    for (const id of linkedByScene.get(sid) ?? []) addEl(id);

    const rows = pagination.sceneRows.get(sid) ?? 0;
    scenes.push({
      id: sid,
      index: k,
      number: numbers[k],
      heading: hp.text.trim(),
      intExt: h.intExt,
      set: h.set,
      time: h.time,
      dayNight: dn,
      stripKey: stripKey(h.intExt, dn),
      paraStart: start,
      paraEnd: end,
      speaking,
      characterIds,
      elementIds,
      tagged,
      synopsis: meta?.synopsis ?? '',
      firstAction,
      page: pagination.scenePage.get(sid) ?? 1,
      eighths: meta?.eighthsOverride ?? rowsToEighths(rows, L),
      autoEighths: rowsToEighths(rows, L),
      offscreen: speaking.filter((n) => !onscreenCue.has(n)),
      meta,
    });
  });

  const speakingNames = [...nameStats.entries()].sort((a, b) => b[1].speeches - a[1].speeches || a[1].firstScene - b[1].firstScene).map(([n]) => n);

  let words = 0;
  for (const p of paras) words += wordCount(p.text);
  const pageCount = pagination.pages.length;
  const lastRows = pagination.pages[pageCount - 1]?.rowsUsed ?? 0;
  const estMinutes = Math.max(0, pageCount - 1 + lastRows / L);

  return {
    paras,
    scenes,
    sceneById: new Map(scenes.map((s) => [s.id, s])),
    sceneOfPara,
    speakingNames,
    nameStats,
    sets,
    contdParas,
    sceneNumbers,
    pagination,
    pageCount: paras.length === 1 && !paras[0].text ? 0 : pageCount,
    wordCount: words,
    estMinutes: Math.round(estMinutes * 10) / 10,
  };
}

/** Cue names found in a doc (for character sync). */
export function cueNamesInDoc(doc: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of docToParas(doc)) {
    if (p.type !== 'character') continue;
    const n = parseCue(p.text).name;
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Character cues that get an automatic (CONT'D): same speaker again in the same scene. */
export function computeContd(paras: Para[], enabled: boolean): Set<number> {
  const out = new Set<number>();
  if (!enabled) return out;
  let last = '';
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.type === 'scene_heading' || p.type === 'transition') last = '';
    else if (p.type === 'character') {
      const n = parseCue(p.text).name;
      if (n && n === last && !p.dual) out.add(i);
      last = n;
    }
  }
  return out;
}
