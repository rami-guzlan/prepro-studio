/* ==========================================================================
   Space store — the open Marketing Space (same pattern as store/project.ts).

   Read:   const content = useSpace(s => s.content);
   Write:  updateSpace(d => { d.content.push(piece) });
   Lists:  const ops = spaceListOps(d => d.channels, 'channels'); ops.update(id, { handle })

   Every write is immutable (immer) and undoable (Ctrl+Z / Ctrl+Y while a
   space is open). Saved automatically (store/spaceAutosave.ts).
   ========================================================================== */
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { useMemo } from 'react';
import type { ID } from '@/types';
import type { SpaceData } from '@/spaces/types';
import { setCurrentProjectId } from '@/backend';
import { makeFormatters, type Formatters } from '@/lib/format';
import type { ListOps, UpdateOptions } from './project';

interface SpaceState {
  space: SpaceData | null;
  version: number;
  savedVersion: number;
  past: SpaceData[];
  future: SpaceData[];
  lastCoalesce: string | null;
  lastTime: number;
}

const HISTORY_LIMIT = 200;

export const useSpaceStore = create<SpaceState>(() => ({
  space: null,
  version: 0,
  savedVersion: 0,
  past: [],
  future: [],
  lastCoalesce: null,
  lastTime: 0,
}));

export function openSpaceData(s: SpaceData) {
  // assets of the open document resolve through assetUrl(name)
  setCurrentProjectId(s.id);
  useSpaceStore.setState({ space: s, version: 0, savedVersion: 0, past: [], future: [], lastCoalesce: null, lastTime: 0 });
}

export function closeSpaceData() {
  setCurrentProjectId('');
  useSpaceStore.setState({ space: null, version: 0, savedVersion: 0, past: [], future: [], lastCoalesce: null, lastTime: 0 });
}

/** Current space (throws if none is open). Use in event handlers, not render. */
export function getSpace(): SpaceData {
  const s = useSpaceStore.getState().space;
  if (!s) throw new Error('No space open');
  return s;
}

type Recipe = (draft: Draft<SpaceData>) => void;

export function updateSpace(recipe: Recipe, opts?: UpdateOptions) {
  const s = useSpaceStore.getState();
  const prev = s.space;
  if (!prev) return;
  const next = produce(prev, recipe);
  if (next === prev) return;
  const now = Date.now();
  const record = opts?.history !== false;
  const merge = !!opts?.coalesce && opts.coalesce === s.lastCoalesce && now - s.lastTime < 2000;
  useSpaceStore.setState({
    space: next,
    version: s.version + 1,
    past: record && !merge ? [...s.past, prev].slice(-HISTORY_LIMIT) : s.past,
    future: record ? [] : s.future,
    lastCoalesce: record ? opts?.coalesce ?? null : s.lastCoalesce,
    lastTime: record ? now : s.lastTime,
  });
}

/** Replace the whole space (backup restore). One undo step. */
export function replaceSpace(next: SpaceData) {
  const s = useSpaceStore.getState();
  if (!s.space) return;
  useSpaceStore.setState({ space: next, version: s.version + 1, past: [...s.past, s.space].slice(-HISTORY_LIMIT), future: [], lastCoalesce: null });
}

export function spaceUndo(): boolean {
  const s = useSpaceStore.getState();
  if (!s.space || !s.past.length) return false;
  useSpaceStore.setState({ space: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.space, ...s.future].slice(0, HISTORY_LIMIT), version: s.version + 1, lastCoalesce: null });
  return true;
}

export function spaceRedo(): boolean {
  const s = useSpaceStore.getState();
  if (!s.space || !s.future.length) return false;
  useSpaceStore.setState({ space: s.future[0], past: [...s.past, s.space].slice(-HISTORY_LIMIT), future: s.future.slice(1), version: s.version + 1, lastCoalesce: null });
  return true;
}

/** Several updateSpace() calls as ONE undo step. */
export async function asOneSpaceStep<T>(fn: () => T | Promise<T>): Promise<T> {
  const start = useSpaceStore.getState().space;
  try {
    return await fn();
  } finally {
    const s = useSpaceStore.getState();
    const i = start ? s.past.lastIndexOf(start) : -1;
    if (i >= 0 && i < s.past.length - 1) useSpaceStore.setState({ past: s.past.slice(0, i + 1), lastCoalesce: null });
  }
}

/** CRUD helpers for any array of {id} inside the space, e.g. spaceListOps(d => d.channels, 'channels'). */
export function spaceListOps<T extends { id: ID }>(get: (d: Draft<SpaceData>) => T[] | Draft<T>[], key = 'list'): ListOps<T> {
  const arr = (d: Draft<SpaceData>) => get(d) as unknown as T[];
  return {
    add(item, index) {
      updateSpace((d) => {
        const a = arr(d);
        if (index == null || index < 0 || index > a.length) a.push(item);
        else a.splice(index, 0, item);
      });
    },
    update(id, patch, coalesce = true) {
      updateSpace(
        (d) => {
          const it = arr(d).find((x) => x.id === id);
          if (it) Object.assign(it, patch);
        },
        coalesce ? { coalesce: `${key}:${id}:${Object.keys(patch).join(',')}` } : undefined,
      );
    },
    remove(id) {
      updateSpace((d) => {
        const a = arr(d);
        const i = a.findIndex((x) => x.id === id);
        if (i >= 0) a.splice(i, 1);
      });
    },
    removeMany(ids) {
      const set = new Set(ids);
      updateSpace((d) => {
        const a = arr(d);
        for (let i = a.length - 1; i >= 0; i--) if (set.has(a[i].id)) a.splice(i, 1);
      });
    },
    move(from, to) {
      if (from === to) return;
      updateSpace((d) => {
        const a = arr(d);
        if (from < 0 || from >= a.length) return;
        const [it] = a.splice(from, 1);
        a.splice(Math.max(0, Math.min(a.length, to)), 0, it);
      });
    },
    moveBefore(id, beforeId) {
      updateSpace((d) => {
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
      updateSpace((d) => {
        const a = arr(d);
        const i = a.findIndex((x) => x.id === id);
        if (i < 0) return;
        copy = { ...JSON.parse(JSON.stringify(a[i])), id: makeId() } as T;
        a.splice(i + 1, 0, copy);
      });
      return copy;
    },
    replaceAll(items) {
      updateSpace((d) => {
        const a = arr(d);
        a.splice(0, a.length, ...items);
      });
    },
  };
}

const EMPTY: any = {};

/** Select a slice of the open space (return stored references, not new objects). */
export function useSpace<T>(selector: (s: SpaceData) => T): T {
  return useSpaceStore((st) => (st.space ? selector(st.space) : (undefined as unknown as T)));
}

export function useSpaceData(): SpaceData {
  return useSpaceStore((st) => st.space ?? EMPTY);
}

export function useSpaceId(): string {
  return useSpaceStore((st) => st.space?.id ?? '');
}

export function useCanUndoSpace(): boolean {
  return useSpaceStore((st) => st.past.length > 0);
}

export function useCanRedoSpace(): boolean {
  return useSpaceStore((st) => st.future.length > 0);
}

/** Formatters (dates, times, money …) using the space's settings. */
export function useSpaceFormatters(): Formatters {
  const settings = useSpace((s) => s.settings);
  return useMemo(() => makeFormatters(settings as any), [settings]);
}
