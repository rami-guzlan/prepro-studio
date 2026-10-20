/* Store writes for shoot sessions. Each function is ONE undo step and keeps
   ContentPiece.shootId / shootDate and ShootSession.contentIds in sync. */
import type { Draft } from 'immer';
import type { ChecklistItem, ContentFormat, ContentShot, ShootSession, SpaceData } from '@/spaces/types';
import { makeChecklistItem, makeContent, makeShoot, makeShot } from '@/spaces/defaults';
import { getSpace, updateSpace } from '@/store/space';
import { addDays } from '@/lib/dates';
import { uid } from '@/lib/id';
import { indexSessions, validDate } from './model';

type D = Draft<SpaceData>;

function findShoot(d: D, id: string) {
  return d.shoots.find((s) => s.id === id);
}

function findContent(d: D, id: string) {
  return d.content.find((c) => c.id === id);
}

/** Ids of the pieces filmed in a session (resolved like the UI shows them). */
export function sessionContentIds(shootId: string): string[] {
  const s = getSpace();
  return (indexSessions(s).pieces.get(shootId) ?? []).map((c) => c.id);
}

/* ---------------------------------------------------------------- sessions */

export function createShootSession(patch: Partial<ShootSession> = {}): string {
  const sh = makeShoot(patch);
  updateSpace((d) => {
    d.shoots.push(sh);
  });
  return sh.id;
}

export function updateShoot(id: string, patch: Partial<Omit<ShootSession, 'id' | 'contentIds' | 'checklist' | 'date'>>, coalesce = true) {
  updateSpace(
    (d) => {
      const sh = findShoot(d, id);
      if (sh) Object.assign(sh, patch);
    },
    coalesce ? { coalesce: `shoot:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/** Change a session's date; pieces whose shoot date was empty or followed the session follow it. */
export function setShootDate(id: string, date: string | undefined) {
  const ids = new Set(sessionContentIds(id));
  updateSpace((d) => {
    const sh = findShoot(d, id);
    if (!sh) return;
    const old = sh.date;
    if (date) sh.date = date;
    else delete sh.date;
    for (const c of d.content) {
      if (!ids.has(c.id)) continue;
      if (!c.shootDate || c.shootDate === old) {
        if (date) c.shootDate = date;
        else delete c.shootDate;
      }
    }
  });
}

export function duplicateShoot(id: string): ShootSession | undefined {
  const src = getSpace().shoots.find((s) => s.id === id);
  if (!src) return undefined;
  const copy: ShootSession = {
    ...JSON.parse(JSON.stringify(src)),
    id: uid('shoot'),
    title: `${src.title || 'Shoot day'} (copy)`,
    date: validDate(src.date) ? addDays(src.date, 7) : undefined,
    contentIds: [],
    checklist: (src.checklist ?? []).map((c) => ({ id: uid('chk'), text: c.text })),
  };
  updateSpace((d) => {
    const i = d.shoots.findIndex((s) => s.id === id);
    d.shoots.splice(i < 0 ? d.shoots.length : i + 1, 0, copy);
  });
  return copy;
}

/** Delete a session and unlink its pieces. */
export function deleteShoot(id: string) {
  const ids = new Set(sessionContentIds(id));
  updateSpace((d) => {
    const i = d.shoots.findIndex((s) => s.id === id);
    if (i < 0) return;
    const sh = d.shoots[i];
    for (const c of d.content) {
      if (c.shootId === id || ids.has(c.id)) {
        if (c.shootId === id) delete c.shootId;
        if (sh.date && c.shootDate === sh.date) delete c.shootDate;
      }
    }
    d.shoots.splice(i, 1);
  });
}

/* ---------------------------------------------------------------- pieces in a session */

function linkPiece(d: D, sh: Draft<ShootSession>, contentId: string) {
  const c = findContent(d, contentId);
  if (!c) return false;
  for (const o of d.shoots) {
    if (o.id === sh.id) continue;
    const list = (o.contentIds ??= []);
    const j = list.indexOf(contentId);
    if (j >= 0) list.splice(j, 1);
  }
  const ids = (sh.contentIds ??= []);
  if (!ids.includes(contentId)) ids.push(contentId);
  c.shootId = sh.id;
  if (!c.shootDate && sh.date) c.shootDate = sh.date;
  return true;
}

export function addPiecesToShoot(shootId: string, contentIds: string[]): number {
  let n = 0;
  updateSpace((d) => {
    const sh = findShoot(d, shootId);
    if (!sh) return;
    for (const id of contentIds) if (linkPiece(d, sh, id)) n++;
  });
  return n;
}

export function removePieceFromShoot(shootId: string, contentId: string) {
  updateSpace((d) => {
    const sh = findShoot(d, shootId);
    if (sh) {
      const ids = (sh.contentIds ??= []);
      const i = ids.indexOf(contentId);
      if (i >= 0) ids.splice(i, 1);
    }
    const c = findContent(d, contentId);
    if (c) {
      if (c.shootId === shootId) delete c.shootId;
      if (sh?.date && c.shootDate === sh.date) delete c.shootDate;
    }
  });
}

/** Store the filming order (also drops ids of deleted content and links every listed piece). */
export function setShootOrder(shootId: string, orderedIds: string[]) {
  updateSpace((d) => {
    const sh = findShoot(d, shootId);
    if (!sh) return;
    const existing = orderedIds.filter((id) => d.content.some((c) => c.id === id));
    sh.contentIds = existing;
    for (const id of existing) {
      const c = findContent(d, id);
      if (c && c.shootId !== shootId) c.shootId = shootId;
    }
  });
}

/** Remove ids of deleted content from a session. */
export function cleanMissing(shootId: string) {
  updateSpace((d) => {
    const sh = findShoot(d, shootId);
    if (!sh) return;
    sh.contentIds = (sh.contentIds ?? []).filter((id) => d.content.some((c) => c.id === id));
  });
}

/** Create a new piece directly in a session (batch planning). */
export function createPieceForShoot(shootId: string, title: string, format: ContentFormat): string {
  const sh = getSpace().shoots.find((s) => s.id === shootId);
  const c = makeContent({ title: title.trim() || 'Untitled content', format, stage: 'planning', shootId, shootDate: sh?.date });
  updateSpace((d) => {
    d.content.push(c);
    const s = findShoot(d, shootId);
    if (s) (s.contentIds ??= []).push(c.id);
  });
  return c.id;
}

/** New session holding the given pieces. */
export function createShootWithPieces(contentIds: string[], patch: Partial<ShootSession> = {}): string {
  const sh = makeShoot(patch);
  updateSpace((d) => {
    d.shoots.push(sh);
    const draft = findShoot(d, sh.id)!;
    for (const id of contentIds) linkPiece(d, draft, id);
  });
  return sh.id;
}

/**
 * "Mark session filmed": pieces in planning / shooting move to editing, every shot
 * is ticked and the piece's "Filmed" / "Recorded" checklist item is checked.
 */
export function markShootFilmed(shootId: string): { moved: number; shots: number } {
  const ids = new Set(sessionContentIds(shootId));
  let moved = 0;
  let shots = 0;
  updateSpace((d) => {
    for (const c of d.content) {
      if (!ids.has(c.id)) continue;
      if (c.stage === 'planning' || c.stage === 'production') {
        c.stage = 'editing';
        moved++;
      }
      for (const s of c.shots ?? []) {
        if (!s.done) shots++;
        s.done = true;
      }
      for (const item of c.checklist ?? []) if (/^(filmed|recorded)\b/i.test(item.text.trim())) item.done = true;
    }
  });
  return { moved, shots };
}

/* ---------------------------------------------------------------- shots (write back to content.shots) */

export function addShot(contentId: string, patch: Partial<ContentShot> = {}, afterShotId?: string): string {
  const shot = makeShot(patch);
  updateSpace((d) => {
    const c = findContent(d, contentId);
    if (!c) return;
    const list = (c.shots ??= []);
    const i = afterShotId ? list.findIndex((s) => s.id === afterShotId) : -1;
    if (i >= 0) list.splice(i + 1, 0, shot);
    else list.push(shot);
  });
  return shot.id;
}

export function updateShot(contentId: string, shotId: string, patch: Partial<ContentShot>, coalesce = true) {
  updateSpace(
    (d) => {
      const s = findContent(d, contentId)?.shots?.find((x) => x.id === shotId);
      if (!s) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete (s as any)[k];
        else (s as any)[k] = v;
      }
      if (s.description == null) s.description = '';
    },
    coalesce ? { coalesce: `cshot:${shotId}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function removeShot(contentId: string, shotId: string) {
  updateSpace((d) => {
    const c = findContent(d, contentId);
    if (!c?.shots) return;
    const i = c.shots.findIndex((s) => s.id === shotId);
    if (i >= 0) c.shots.splice(i, 1);
  });
}

export function setAllShotsDone(contentIds: string[], done: boolean) {
  const ids = new Set(contentIds);
  updateSpace((d) => {
    for (const c of d.content) if (ids.has(c.id)) for (const s of c.shots ?? []) s.done = done;
  });
}

/* ---------------------------------------------------------------- session checklist */

export function addShootChecks(shootId: string, texts: string[]) {
  const items: ChecklistItem[] = texts.map((t) => t.trim()).filter(Boolean).map((t) => makeChecklistItem(t));
  if (!items.length) return;
  updateSpace((d) => {
    const sh = findShoot(d, shootId);
    if (sh) (sh.checklist ??= []).push(...items);
  });
}

export function updateShootCheck(shootId: string, itemId: string, patch: Partial<ChecklistItem>, coalesce = true) {
  updateSpace(
    (d) => {
      const it = findShoot(d, shootId)?.checklist?.find((x) => x.id === itemId);
      if (it) Object.assign(it, patch);
    },
    coalesce ? { coalesce: `shootchk:${itemId}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

export function removeShootCheck(shootId: string, itemId: string) {
  updateSpace((d) => {
    const sh = findShoot(d, shootId);
    if (!sh?.checklist) return;
    const i = sh.checklist.findIndex((x) => x.id === itemId);
    if (i >= 0) sh.checklist.splice(i, 1);
  });
}
