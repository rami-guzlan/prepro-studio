/* Shared shot logic used by the Shot List and Storyboard modules.
   Shots live in project.shots (one ordered array). The display order inside a
   scene is the order of the array; scenes themselves follow script order. */
import type { Draft } from 'immer';
import type { ID, ProjectData, Shot } from '@/types';
import type { SceneInfo, ScriptModel } from '@/derived/script';
import { getProject, listOps, update } from '@/store/project';
import { toast } from '@/ui/Toast';
import { uid } from '@/lib/id';
import { naturalCompare, safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { optionLabel, SHOT_SIZES, SHOT_STATUSES, SOUND_TYPES } from '@/lib/constants';

/** Group key for shots without a (known) scene. */
export const UNASSIGNED = '__unassigned';
/** Animatic seconds used when a shot has no duration. */
export const DEFAULT_FRAME_SECONDS = 3;

export const shotOps = listOps<Shot>((d) => d.shots, 'shots');

export const CAMERAS = ['A', 'B', 'C', 'D'];

/* ------------------------------------------------------------------ basics */

export function groupKeyOf(shot: Pick<Shot, 'sceneId'>, sceneById: ReadonlyMap<string, unknown>): string {
  return shot.sceneId && sceneById.has(shot.sceneId) ? shot.sceneId : UNASSIGNED;
}

export function shotSeconds(s: Pick<Shot, 'duration'>): number {
  return s.duration != null && s.duration > 0 ? s.duration : DEFAULT_FRAME_SECONDS;
}

export function isOmitted(s: Pick<Shot, 'status'>): boolean {
  return s.status === 'omitted';
}

export function shotMinutes(s: Pick<Shot, 'setupMinutes' | 'shootMinutes'>): number {
  return (s.setupMinutes ?? 0) + (s.shootMinutes ?? 0);
}

/** "WS · Low angle · Dolly in · 35mm · Cam A" */
export function shotSpecs(s: Shot, opts: { long?: boolean; camera?: boolean } = {}): string {
  const parts = [
    s.shotSize ? (opts.long ? optionLabel(SHOT_SIZES, s.shotSize) : s.shotSize) : '',
    s.angle ?? '',
    s.movement ?? '',
    opts.long ? s.equipment ?? '' : '',
    s.lens ?? '',
    opts.camera !== false && s.camera ? `Cam ${s.camera}` : '',
  ];
  return parts.filter((x) => x && x.trim()).join(' · ');
}

/** "Scene 3 · Shot 2A" (or "Shot 2A" for unassigned shots) */
export function shotTitle(shot: Shot, scene: SceneInfo | undefined): string {
  const n = shot.number?.trim() || '—';
  return scene ? `Scene ${scene.number} · Shot ${n}` : `Shot ${n}`;
}

/* ------------------------------------------------------------------ grouping */

export interface ShotGroup {
  key: string;
  scene?: SceneInfo;
  shots: Shot[];
}

/** Shots grouped by scene in script order (unassigned last). */
export function groupShots(
  shots: readonly Shot[],
  model: Pick<ScriptModel, 'scenes' | 'sceneById'>,
  opts: { includeEmptyScenes?: boolean; filter?: (s: Shot) => boolean; onlyKey?: string } = {},
): ShotGroup[] {
  const map = new Map<string, Shot[]>();
  for (const s of shots) {
    if (opts.filter && !opts.filter(s)) continue;
    const k = groupKeyOf(s, model.sceneById);
    const list = map.get(k);
    if (list) list.push(s);
    else map.set(k, [s]);
  }
  const out: ShotGroup[] = [];
  for (const sc of model.scenes) {
    if (opts.onlyKey && opts.onlyKey !== sc.id) continue;
    const list = map.get(sc.id);
    if (list?.length || opts.includeEmptyScenes) out.push({ key: sc.id, scene: sc, shots: list ?? [] });
  }
  const un = map.get(UNASSIGNED);
  if ((!opts.onlyKey || opts.onlyKey === UNASSIGNED) && (un?.length || (opts.includeEmptyScenes && model.scenes.length === 0))) {
    out.push({ key: UNASSIGNED, shots: un ?? [] });
  }
  return out;
}

/* ------------------------------------------------------------------ numbering */

/** Slate letters skip I and O (they read like 1 and 0). */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function letterFor(i: number): string {
  let s = '';
  let n = Math.max(0, Math.floor(i));
  do {
    s = LETTERS[n % LETTERS.length] + s;
    n = Math.floor(n / LETTERS.length) - 1;
  } while (n >= 0);
  return s;
}

function letterIndex(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) {
    const i = LETTERS.indexOf(ch);
    if (i < 0) return -1;
    n = n * LETTERS.length + i + 1;
  }
  return n - 1;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Next free shot number for a scene (follows the scene's numbering style). */
export function nextShotNumber(sceneShots: readonly Pick<Shot, 'number'>[], sceneNumber?: string): string {
  const nums = sceneShots.map((s) => (s.number ?? '').trim()).filter(Boolean);
  if (nums.length === 0) return '1';
  const taken = new Set(nums.map((n) => n.toUpperCase()));
  if (sceneNumber) {
    const re = new RegExp(`^${escapeRe(sceneNumber)}([A-Z]+)$`, 'i');
    const lettered = nums.map((n) => re.exec(n)).filter((m): m is RegExpExecArray => !!m);
    if (lettered.length && lettered.length === nums.length) {
      const max = Math.max(...lettered.map((m) => letterIndex(m[1])));
      let i = max + 1;
      while (taken.has(`${sceneNumber}${letterFor(i)}`.toUpperCase())) i++;
      return `${sceneNumber}${letterFor(i)}`;
    }
  }
  let max = 0;
  for (const n of nums) {
    const m = /^(\d+)/.exec(n);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let next = max + 1;
  while (taken.has(String(next))) next++;
  return String(next);
}

/** Number for a shot inserted right after `num` (3 → 3A, 3A → 3B). */
export function numberAfter(num: string, taken: Set<string>): string {
  const base = num.trim() || '1';
  const has = (n: string) => taken.has(n.toUpperCase());
  const m = /^(.*?)([A-Z]+)$/i.exec(base);
  if (m && /\d$/.test(m[1])) {
    let i = letterIndex(m[2]) + 1;
    while (i < 2000 && has(`${m[1]}${letterFor(i)}`)) i++;
    return `${m[1]}${letterFor(i)}`;
  }
  let i = 0;
  while (i < 2000 && has(`${base}${letterFor(i)}`)) i++;
  return `${base}${letterFor(i)}`;
}

export type NumberScheme = 'numeric' | 'scene-letter';

/** Renumber the shots of the given group keys in their current order. */
export function renumberShots(keys: string[], scheme: NumberScheme, model: Pick<ScriptModel, 'sceneById'>) {
  const keySet = new Set(keys);
  update((d) => {
    const counters = new Map<string, number>();
    for (const s of d.shots) {
      const k = groupKeyOf(s, model.sceneById);
      if (!keySet.has(k)) continue;
      const i = counters.get(k) ?? 0;
      counters.set(k, i + 1);
      const sceneNo = k === UNASSIGNED ? '' : model.sceneById.get(k)?.number ?? '';
      s.number = scheme === 'numeric' ? String(i + 1) : `${sceneNo}${letterFor(i)}`;
    }
  });
}

/** "1A, 1B" style when most shots of the scene already use it. */
export function guessScheme(list: readonly Pick<Shot, 'number'>[], scene: SceneInfo | undefined): NumberScheme {
  if (!scene || !list.length) return 'numeric';
  const re = new RegExp(`^${escapeRe(scene.number)}[A-Z]+$`, 'i');
  return list.filter((s) => re.test(s.number ?? '')).length > list.length / 2 ? 'scene-letter' : 'numeric';
}

/** After a manual reorder: offer to renumber the group when its numbers are out of order. */
export function offerRenumber(key: string, model: Pick<ScriptModel, 'sceneById'>) {
  const list = getProject().shots.filter((s) => groupKeyOf(s, model.sceneById) === key);
  if (isSequential(list)) return;
  const sc = key === UNASSIGNED ? undefined : model.sceneById.get(key);
  toast(`Shot order changed${sc ? ` in scene ${sc.number}` : ''}`, 'info', {
    action: { label: 'Renumber', onClick: () => renumberShots([key], guessScheme(list, sc), model) },
  });
}

/** true when shot numbers ascend in display order. */
export function isSequential(shots: readonly Pick<Shot, 'number'>[]): boolean {
  for (let i = 1; i < shots.length; i++) {
    if (naturalCompare(shots[i - 1].number ?? '', shots[i].number ?? '') >= 0) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ mutations */

interface SceneLookup {
  sceneById: ReadonlyMap<string, SceneInfo>;
}

/** Insert a shot into the array: before `beforeId`, else after the last shot of its group,
    else before the first shot of a later scene (keeps the array roughly in script order). */
function insertShot(a: Draft<Shot>[], shot: Draft<Shot>, key: string, beforeId: ID | null, m: SceneLookup) {
  if (beforeId) {
    const j = a.findIndex((x) => x.id === beforeId);
    if (j >= 0) {
      a.splice(j, 0, shot);
      return;
    }
  }
  let last = -1;
  for (let i = 0; i < a.length; i++) if (groupKeyOf(a[i], m.sceneById) === key) last = i;
  if (last >= 0) {
    a.splice(last + 1, 0, shot);
    return;
  }
  const targetIndex = key === UNASSIGNED ? Infinity : m.sceneById.get(key)?.index ?? Infinity;
  const j = a.findIndex((x) => {
    const k = groupKeyOf(x, m.sceneById);
    const idx = k === UNASSIGNED ? Infinity : m.sceneById.get(k)?.index ?? Infinity;
    return idx > targetIndex;
  });
  if (j >= 0) a.splice(j, 0, shot);
  else a.push(shot);
}

/** Pick a number for a shot arriving in another scene: keep it when free, translate
    "1C" → "4C" for scene-letter numbering, otherwise take the next free number. */
function numberForMove(shot: Draft<Shot>, fromScene: SceneInfo | undefined, toKey: string, a: Draft<Shot>[], m: SceneLookup): string {
  const toScene = toKey === UNASSIGNED ? undefined : m.sceneById.get(toKey);
  const siblings = a.filter((x) => x.id !== shot.id && groupKeyOf(x, m.sceneById) === toKey);
  const taken = new Set(siblings.map((x) => (x.number ?? '').toUpperCase()));
  let num = shot.number ?? '';
  if (fromScene && toScene) {
    const re = new RegExp(`^${escapeRe(fromScene.number)}([A-Z]+)$`, 'i');
    const mm = re.exec(num);
    if (mm) num = `${toScene.number}${mm[1].toUpperCase()}`;
  }
  if (num && !taken.has(num.toUpperCase())) return num;
  return nextShotNumber(siblings, toScene?.number);
}

/** Move one shot to a group (scene id or UNASSIGNED), before `beforeId` (null = end). */
export function moveShot(id: ID, toKey: string, beforeId: ID | null, m: SceneLookup) {
  update((d) => {
    const a = d.shots;
    const i = a.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [s] = a.splice(i, 1);
    const fromKey = groupKeyOf(s, m.sceneById);
    if (fromKey !== toKey) {
      s.number = numberForMove(s, fromKey === UNASSIGNED ? undefined : m.sceneById.get(fromKey), toKey, a, m);
      s.sceneId = toKey === UNASSIGNED ? undefined : toKey;
    }
    insertShot(a, s, toKey, beforeId === id ? null : beforeId, m);
  });
}

/** Move several shots to the end of a group (keeps their relative order). */
export function moveShotsToScene(ids: ID[], toKey: string, m: SceneLookup) {
  const set = new Set(ids);
  update((d) => {
    const a = d.shots;
    const moving = a.filter((x) => set.has(x.id));
    for (const s of moving) {
      const i = a.findIndex((x) => x.id === s.id);
      if (i >= 0) a.splice(i, 1);
    }
    for (const s of moving) {
      const fromKey = groupKeyOf(s, m.sceneById);
      if (fromKey !== toKey) {
        s.number = numberForMove(s, fromKey === UNASSIGNED ? undefined : m.sceneById.get(fromKey), toKey, a, m);
        s.sceneId = toKey === UNASSIGNED ? undefined : toKey;
      }
      insertShot(a, s, toKey, null, m);
    }
  });
}

export function makeShot(patch: Partial<Shot> = {}): Shot {
  return { id: uid('shot'), number: '1', description: '', status: 'planned', ...patch };
}

/** Add new shots to a group, after `afterId` (or at the end of the group). Returns the new ids. */
export function addShots(toKey: string, patches: Partial<Shot>[], m: SceneLookup, afterId?: ID | null): ID[] {
  const ids: ID[] = [];
  update((d) => {
    const a = d.shots;
    const scene = toKey === UNASSIGNED ? undefined : m.sceneById.get(toKey);
    let anchor = afterId ?? null;
    for (const patch of patches) {
      const siblings = a.filter((x) => groupKeyOf(x, m.sceneById) === toKey);
      let number: string;
      let beforeId: ID | null = null;
      if (anchor) {
        const ai = a.findIndex((x) => x.id === anchor);
        const anchorShot = ai >= 0 ? a[ai] : undefined;
        const nextSibling = anchorShot ? siblings[siblings.indexOf(anchorShot) + 1] : undefined;
        beforeId = nextSibling?.id ?? null;
        number = nextSibling && anchorShot
          ? numberAfter(anchorShot.number ?? '', new Set(siblings.map((x) => (x.number ?? '').toUpperCase())))
          : nextShotNumber(siblings, scene?.number);
      } else number = nextShotNumber(siblings, scene?.number);
      const shot = makeShot({ number, sceneId: scene ? toKey : undefined, ...patch }) as Draft<Shot>;
      insertShot(a, shot, toKey, beforeId, m);
      ids.push(shot.id);
      anchor = shot.id;
    }
  });
  return ids;
}

/** Duplicate a shot right after itself (number 3 → 3A). */
export function duplicateShot(id: ID, m: SceneLookup): ID | undefined {
  let newId: ID | undefined;
  update((d) => {
    const a = d.shots;
    const i = a.findIndex((x) => x.id === id);
    if (i < 0) return;
    const src = a[i];
    const key = groupKeyOf(src, m.sceneById);
    const taken = new Set(a.filter((x) => groupKeyOf(x, m.sceneById) === key).map((x) => (x.number ?? '').toUpperCase()));
    const copy = { ...JSON.parse(JSON.stringify(src)), id: uid('shot'), number: numberAfter(src.number ?? '', taken) } as Draft<Shot>;
    if (copy.status === 'shot') copy.status = 'planned';
    a.splice(i + 1, 0, copy);
    newId = copy.id;
  });
  return newId;
}

/* ------------------------------------------------------------------ CSV */

export async function exportShotsCsv(project: ProjectData, model: Pick<ScriptModel, 'scenes' | 'sceneById'>) {
  const groups = groupShots(project.shots, model);
  const rows: { shot: Shot; scene?: SceneInfo }[] = [];
  for (const g of groups) for (const s of g.shots) rows.push({ shot: s, scene: g.scene });
  const charName = new Map(project.characters.map((c) => [c.id, c.name]));
  const diagramName = new Map(project.diagrams.map((d) => [d.id, d.name]));
  return exportCsv(`${safeFileName(project.meta.title)} - Shot List`, rows, [
    { header: 'Scene', value: (r) => r.scene?.number ?? '' },
    { header: 'Scene heading', value: (r) => r.scene?.heading ?? 'Unassigned' },
    { header: 'Shot', value: (r) => r.shot.number },
    { header: 'Description', value: (r) => r.shot.description },
    { header: 'Size', value: (r) => r.shot.shotSize },
    { header: 'Angle', value: (r) => r.shot.angle },
    { header: 'Movement', value: (r) => r.shot.movement },
    { header: 'Equipment', value: (r) => r.shot.equipment },
    { header: 'Lens', value: (r) => r.shot.lens },
    { header: 'Camera', value: (r) => r.shot.camera },
    { header: 'Frame rate', value: (r) => r.shot.frameRate },
    { header: 'Sound', value: (r) => optionLabel(SOUND_TYPES, r.shot.sound) },
    { header: 'Cast', value: (r) => (r.shot.characterIds ?? []).map((id) => charName.get(id)).filter(Boolean).join(', ') },
    { header: 'Setup (min)', value: (r) => r.shot.setupMinutes },
    { header: 'Shoot (min)', value: (r) => r.shot.shootMinutes },
    { header: 'VFX', value: (r) => !!r.shot.vfx },
    { header: 'Lighting diagram', value: (r) => (r.shot.diagramId ? diagramName.get(r.shot.diagramId) ?? '' : '') },
    { header: 'Duration (s)', value: (r) => r.shot.duration },
    { header: 'Audio / dialogue', value: (r) => r.shot.audio },
    { header: 'Status', value: (r) => optionLabel(SHOT_STATUSES, r.shot.status) },
    { header: 'Notes', value: (r) => r.shot.notes },
  ]);
}
