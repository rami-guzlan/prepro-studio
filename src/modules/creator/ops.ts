/* Creator workspace: store edits on project.creator (each one undo step; typing
   coalesces). The workspace makes project.creator on first use. */
import type { Draft } from 'immer';
import type { CreatorCheck, CreatorData, CreatorStage, ProjectData } from '@/types';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { update } from '@/store/project';
import { STATUS_OF_STAGE, defaultCreator, normalizeCreator } from './model';

function creatorOf(d: Draft<ProjectData>): Draft<CreatorData> {
  if (!d.creator) d.creator = defaultCreator() as Draft<CreatorData>;
  return d.creator;
}

/** Change the creator data; pass a coalesce key while typing. */
export function editCreator(fn: (c: Draft<CreatorData>, d: Draft<ProjectData>) => void, coalesce?: string) {
  update((d) => fn(creatorOf(d), d), coalesce ? { coalesce: `creator:${coalesce}` } : undefined);
}

/** Turn this production into a YouTube / social video (keeps everything it has). */
export function startCreatorWorkflow(format: 'long' | 'short' = 'long') {
  update((d) => {
    d.meta.workflow = 'creator';
    d.creator = normalizeCreator((d.creator as CreatorData | undefined) ?? defaultCreator(format)) as Draft<CreatorData>;
  });
}
/** Back to the full film layout (the creator data stays). */
export function leaveCreatorWorkflow() {
  update((d) => {
    delete d.meta.workflow;
  });
}

export function setStage(stage: CreatorStage) {
  editCreator((c, d) => {
    c.stage = stage;
    d.meta.status = STATUS_OF_STAGE[stage];
  });
}

/* ---------------------------------------------------------------- generic lists */

type ListKey = 'gear' | 'preroll' | 'editChecks' | 'publishChecks';
const listOf = (c: Draft<CreatorData>, k: ListKey): Draft<CreatorCheck>[] =>
  k === 'gear' ? c.plan.gear : k === 'preroll' ? c.shoot.preroll : k === 'editChecks' ? c.edit.checklist : c.publish.checklist;

export const checkOps = (k: ListKey) => ({
  toggle: (id: string) =>
    editCreator((c) => {
      const x = listOf(c, k).find((i) => i.id === id);
      if (x) x.done = !x.done;
    }),
  add: (label: string) => editCreator((c) => void listOf(c, k).push({ id: uid('chk'), label })),
  rename: (id: string, label: string) =>
    editCreator((c) => {
      const x = listOf(c, k).find((i) => i.id === id);
      if (x) x.label = label;
    }, `chk:${id}`),
  remove: (id: string) =>
    editCreator((c) => {
      const l = listOf(c, k);
      const i = l.findIndex((x) => x.id === id);
      if (i >= 0) l.splice(i, 1);
    }),
  reset: () => editCreator((c) => listOf(c, k).forEach((x) => (x.done = false))),
});

/** Log a work session (sprint timer). */
export function logSession(minutes: number, stage: CreatorStage) {
  if (minutes < 1) return;
  editCreator((c) => void c.sessions.push({ id: uid('ses'), date: todayISO(), stage, minutes: Math.round(minutes) }));
}
