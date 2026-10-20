/* React access to the derived ScriptModel (scenes, characters, pages ...). */
import type { Draft } from 'immer';
import type { Character, ProjectData } from '@/types';
import { buildScriptModel, cueNamesInDoc, type ScriptModel, type SceneInfo } from '@/script-core/model';
import { docToParas } from '@/script-core/paragraphs';
import { useProject, registerPostUndoFixer } from '@/store/project';
import { uid } from '@/lib/id';

export type { ScriptModel, SceneInfo } from '@/script-core/model';

/* One shared cache: every component asking for the model gets the same object
   until one of its inputs changes. */
let lastInputs: unknown[] = [];
let lastModel: ScriptModel | null = null;

export function getScriptModel(p: Pick<ProjectData, 'script' | 'scenes' | 'characters' | 'elements' | 'settings'>): ScriptModel {
  const inputs = [p.script.doc, p.scenes, p.characters, p.elements, p.settings.script, p.settings.paperSize];
  if (lastModel && inputs.every((v, i) => v === lastInputs[i])) return lastModel;
  lastModel = buildScriptModel({ doc: p.script.doc, scenes: p.scenes, characters: p.characters, elements: p.elements, settings: p.settings });
  lastInputs = inputs;
  return lastModel;
}

/** The derived screenplay model. Cheap to call from many components. */
export function useScriptModel(): ScriptModel {
  const script = useProject((p) => p.script);
  const scenes = useProject((p) => p.scenes);
  const characters = useProject((p) => p.characters);
  const elements = useProject((p) => p.elements);
  const settings = useProject((p) => p.settings);
  return getScriptModel({ script, scenes, characters, elements, settings });
}

/** Scenes in script order. */
export function useScenes(): SceneInfo[] {
  return useScriptModel().scenes;
}

/** Map of scene id -> SceneInfo. */
export function useSceneMap(): Map<string, SceneInfo> {
  return useScriptModel().sceneById;
}

/** Short label for a scene: '12. INT. KITCHEN - NIGHT' */
export function sceneLabel(s: Pick<SceneInfo, 'number' | 'heading'> | undefined | null): string {
  if (!s) return '';
  return `${s.number}. ${s.heading || 'Untitled scene'}`;
}

/** Make sure every speaking character in the script has a Character record, and
    drop auto-created characters that left the script without any data attached
    (e.g. a half-typed cue like "MA" before it became "MAYA"). */
export function syncCharactersDraft(d: Draft<ProjectData>) {
  const names = cueNamesInDoc(d.script.doc);
  const inScript = new Set(names);
  const referenced = new Set<string>();
  for (const p of docToParas(d.script.doc)) for (const r of p.runs) for (const t of r.tags ?? []) if (t.cat === 'cast') referenced.add(t.id);
  for (const m of Object.values(d.scenes)) for (const id of m.characterIds ?? []) referenced.add(id);
  for (let i = d.characters.length - 1; i >= 0; i--) {
    const c = d.characters[i];
    const empty = !c.manual && !c.castId && !c.description && !c.age && !c.gender && !c.notes && !c.color && !(c.aliases?.length);
    if (empty && !inScript.has(c.name.toUpperCase()) && !referenced.has(c.id)) d.characters.splice(i, 1);
  }
  if (names.length === 0) return;
  const known = new Set<string>();
  for (const c of d.characters) {
    known.add(c.name.toUpperCase());
    for (const a of c.aliases ?? []) known.add(a.toUpperCase());
  }
  let nextNum = d.characters.reduce((m, c) => Math.max(m, c.number ?? 0), 0) + 1;
  for (const n of names) {
    if (known.has(n)) continue;
    const c: Character = { id: uid('chr'), name: n, number: nextNum++ };
    d.characters.push(c as Draft<Character>);
    known.add(n);
  }
}

registerPostUndoFixer(syncCharactersDraft);
