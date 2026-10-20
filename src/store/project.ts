/* ==========================================================================
   Project store — the single source of truth for the open project.

   Read:   const cast = useProject(p => p.cast);
   Write:  update(d => { d.cast.push(newMember) }, { coalesce: 'cast:add' });
   Lists:  const ops = listOps(d => d.cast); ops.update(id, { phone }) ...

   Every update() is immutable (immer). Undo/redo is global (Ctrl+Z / Ctrl+Y)
   except for the screenplay text, which has its own editor history.
   ========================================================================== */
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { useMemo } from 'react';
import type { ID, ProjectData } from '@/types';
import { setCurrentProjectId } from '@/backend';
import { makeFormatters, type Formatters } from '@/lib/format';

export interface UpdateOptions {
  /** Edits with the same key within 2s are merged into one undo step (e.g. typing in a field). */
  coalesce?: string;
  /** false = don't record an undo step (still saved). */
  history?: boolean;
}

interface ProjectState {
  project: ProjectData | null;
  /** increments on every change */
  version: number;
  /** last version written to disk */
  savedVersion: number;
  past: ProjectData[];
  future: ProjectData[];
  lastCoalesce: string | null;
  lastTime: number;
}

const HISTORY_LIMIT = 200;

export const useProjectStore = create<ProjectState>(() => ({
  project: null,
  version: 0,
  savedVersion: 0,
  past: [],
  future: [],
  lastCoalesce: null,
  lastTime: 0,
}));

/* ---------------------------------------------------------------- lifecycle */

export function openProject(p: ProjectData) {
  setCurrentProjectId(p.id);
  useProjectStore.setState({ project: p, version: 0, savedVersion: 0, past: [], future: [], lastCoalesce: null, lastTime: 0 });
}

export function closeProject() {
  setCurrentProjectId('');
  useProjectStore.setState({ project: null, version: 0, savedVersion: 0, past: [], future: [], lastCoalesce: null, lastTime: 0 });
}

/** Replace the whole project (e.g. restore a backup). Recorded as one undo step. */
export function replaceProject(p: ProjectData) {
  const s = useProjectStore.getState();
  if (!s.project) return;
  useProjectStore.setState({
    project: p,
    version: s.version + 1,
    past: [...s.past, s.project].slice(-HISTORY_LIMIT),
    future: [],
    lastCoalesce: null,
  });
}

/** Current project (throws if none is open). Use inside event handlers, not render. */
export function getProject(): ProjectData {
  const p = useProjectStore.getState().project;
  if (!p) throw new Error('No project open');
  return p;
}

/* ---------------------------------------------------------------- writes */

type Recipe = (draft: Draft<ProjectData>) => void;

/** Fix-ups applied after undo/redo (registered by modules that keep derived data in sync). */
const postUndoFixers: ((d: Draft<ProjectData>) => void)[] = [];
export function registerPostUndoFixer(fn: (d: Draft<ProjectData>) => void) {
  postUndoFixers.push(fn);
}

export function update(recipe: Recipe, opts?: UpdateOptions) {
  const s = useProjectStore.getState();
  const prev = s.project;
  if (!prev) return;
  const next = produce(prev, recipe);
  if (next === prev) return;
  const now = Date.now();
  const record = opts?.history !== false;
  const merge = !!opts?.coalesce && opts.coalesce === s.lastCoalesce && now - s.lastTime < 2000;
  useProjectStore.setState({
    project: next,
    version: s.version + 1,
    past: record && !merge ? [...s.past, prev].slice(-HISTORY_LIMIT) : s.past,
    future: record ? [] : s.future,
    lastCoalesce: record ? opts?.coalesce ?? null : s.lastCoalesce,
    lastTime: record ? now : s.lastTime,
  });
}

/** Fields that are NOT part of global undo (they have their own history or are view state). */
function keepLive(target: ProjectData, live: ProjectData): ProjectData {
  return produce(target, (d) => {
    d.script.doc = live.script.doc as any;
    d.script.revision = live.script.revision;
    d.settings.script.zoom = live.settings.script.zoom;
    d.settings.script.pageView = live.settings.script.pageView;
    for (const fix of postUndoFixers) fix(d);
  });
}

export function undo() {
  const s = useProjectStore.getState();
  if (!s.project || s.past.length === 0) return false;
  const target = s.past[s.past.length - 1];
  useProjectStore.setState({
    project: keepLive(target, s.project),
    past: s.past.slice(0, -1),
    future: [s.project, ...s.future].slice(0, HISTORY_LIMIT),
    version: s.version + 1,
    lastCoalesce: null,
  });
  return true;
}

export function redo() {
  const s = useProjectStore.getState();
  if (!s.project || s.future.length === 0) return false;
  const target = s.future[0];
  useProjectStore.setState({
    project: keepLive(target, s.project),
    past: [...s.past, s.project].slice(-HISTORY_LIMIT),
    future: s.future.slice(1),
    version: s.version + 1,
    lastCoalesce: null,
  });
  return true;
}

/** Run several update() calls as ONE undo step (used by the AI agent tools). */
export async function asOneStep<T>(fn: () => T | Promise<T>): Promise<T> {
  const start = useProjectStore.getState().project;
  try {
    return await fn();
  } finally {
    const s = useProjectStore.getState();
    const i = start ? s.past.lastIndexOf(start) : -1;
    if (i >= 0 && i < s.past.length - 1) useProjectStore.setState({ past: s.past.slice(0, i + 1), lastCoalesce: null });
  }
}

/* ---------------------------------------------------------------- list helpers */

export interface ListOps<T extends { id: ID }> {
  add(item: T, index?: number): void;
  update(id: ID, patch: Partial<T>, coalesce?: boolean): void;
  remove(id: ID): void;
  removeMany(ids: ID[]): void;
  move(fromIndex: number, toIndex: number): void;
  /** move item with id before item `beforeId` (null = to the end) */
  moveBefore(id: ID, beforeId: ID | null): void;
  duplicate(id: ID, makeId: () => ID): T | undefined;
  replaceAll(items: T[]): void;
}

/** CRUD helpers for any array of {id} objects inside the project, e.g. listOps(d => d.post.deliverables). */
export function listOps<T extends { id: ID }>(get: (d: Draft<ProjectData>) => T[] | Draft<T>[], key = 'list'): ListOps<T> {
  const arr = (d: Draft<ProjectData>) => get(d) as unknown as T[];
  return {
    add(item, index) {
      update((d) => {
        const a = arr(d);
        if (index == null || index < 0 || index > a.length) a.push(item);
        else a.splice(index, 0, item);
      });
    },
    update(id, patch, coalesce = true) {
      update(
        (d) => {
          const it = arr(d).find((x) => x.id === id);
          if (it) Object.assign(it, patch);
        },
        coalesce ? { coalesce: `${key}:${id}:${Object.keys(patch).join(',')}` } : undefined,
      );
    },
    remove(id) {
      update((d) => {
        const a = arr(d);
        const i = a.findIndex((x) => x.id === id);
        if (i >= 0) a.splice(i, 1);
      });
    },
    removeMany(ids) {
      const set = new Set(ids);
      update((d) => {
        const a = arr(d);
        for (let i = a.length - 1; i >= 0; i--) if (set.has(a[i].id)) a.splice(i, 1);
      });
    },
    move(from, to) {
      if (from === to) return;
      update((d) => {
        const a = arr(d);
        if (from < 0 || from >= a.length) return;
        const [it] = a.splice(from, 1);
        a.splice(Math.max(0, Math.min(a.length, to)), 0, it);
      });
    },
    moveBefore(id, beforeId) {
      update((d) => {
        const a = arr(d);
        const i = a.findIndex((x) => x.id === id);
        if (i < 0) return;
        const [it] = a.splice(i, 1);
        const j = beforeId == null ? -1 : a.findIndex((x) => x.id === beforeId);
        if (j < 0) a.push(it);
        else a.splice(j, 0, it);
      });
    },
    duplicate(id, makeId) {
      let copy: T | undefined;
      update((d) => {
        const a = arr(d);
        const i = a.findIndex((x) => x.id === id);
        if (i < 0) return;
        copy = { ...JSON.parse(JSON.stringify(a[i])), id: makeId() } as T;
        a.splice(i + 1, 0, copy);
      });
      return copy;
    },
    replaceAll(items) {
      update((d) => {
        const a = arr(d);
        a.splice(0, a.length, ...items);
      });
    },
  };
}

/* ---------------------------------------------------------------- hooks */

const EMPTY: any = {};

/** Select a slice of the open project. Keep selectors simple (return stored references, not new objects). */
export function useProject<T>(selector: (p: ProjectData) => T): T {
  return useProjectStore((s) => (s.project ? selector(s.project) : (undefined as unknown as T)));
}

/** Whole project object (re-renders on every change — prefer useProject(selector)). */
export function useProjectData(): ProjectData {
  return useProjectStore((s) => s.project ?? EMPTY);
}

export function useProjectId(): string {
  return useProjectStore((s) => s.project?.id ?? '');
}

export function useCanUndo(): boolean {
  return useProjectStore((s) => s.past.length > 0);
}

export function useCanRedo(): boolean {
  return useProjectStore((s) => s.future.length > 0);
}

/** Formatters (dates, times, money...) using the project's settings. */
export function useFormatters(): Formatters {
  const settings = useProject((p) => p.settings);
  return useMemo(() => makeFormatters(settings), [settings]);
}
