/* Screenplay document helpers for agent tools (ProseMirror JSON ⇄ paragraphs). */
import type { Draft } from 'immer';
import type { ProjectData } from '@/types';
import { runPreSaveHooks } from '@/store/autosave';
import { useProjectStore } from '@/store/project';
import { syncCharactersDraft } from '@/derived/script';
import { docToParas, parasToDoc, type Para } from '@/script-core/paragraphs';

/** The latest screenplay document (pushes the editor's unsaved typing into the store first). */
export function liveDoc(): unknown {
  runPreSaveHooks();
  return useProjectStore.getState().project?.script.doc;
}

export function liveParas(): Para[] {
  return docToParas(liveDoc());
}

/** Write a new document inside an update() recipe. */
export function writeDoc(d: Draft<ProjectData>, doc: unknown) {
  d.script.doc = doc as any;
  d.script.revision = (d.script.revision ?? 0) + 1;
  syncCharactersDraft(d);
}

export function writeParas(d: Draft<ProjectData>, paras: Para[]) {
  writeDoc(d, parasToDoc(paras));
}

/** Remove breakdown-tag / note marks pointing at deleted ids. Returns null when nothing changed. */
export function stripMarks(doc: any, ids: Set<string>): any | null {
  if (!doc || !Array.isArray(doc.content)) return null;
  let changed = false;
  const content = doc.content.map((node: any) => {
    if (!Array.isArray(node.content)) return node;
    let nodeChanged = false;
    const kids = node.content.map((ch: any) => {
      if (!Array.isArray(ch.marks)) return ch;
      const marks = ch.marks.filter((m: any) => !((m.type === 'tag' || m.type === 'note') && ids.has(m.attrs?.id)));
      if (marks.length === ch.marks.length) return ch;
      nodeChanged = true;
      const out = { ...ch };
      if (marks.length) out.marks = marks;
      else delete out.marks;
      return out;
    });
    if (!nodeChanged) return node;
    changed = true;
    return { ...node, content: kids };
  });
  return changed ? { ...doc, content } : null;
}
