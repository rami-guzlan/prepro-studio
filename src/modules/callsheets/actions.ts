/* Call sheet mutations. A CallSheet is created lazily on the first edit. */
import type { Draft } from 'immer';
import type { CallSheet, CastCall, CrewCall, Hospital, ID } from '@/types';
import { getProject, update } from '@/store/project';
import { getScriptModel } from '@/derived/script';
import { confirmDialog, toast } from '@/ui';
import { emptyCallSheet, resolveCallSheet } from './logic';

type CS = Draft<CallSheet>;

export function editCS(dayId: ID, fn: (cs: CS) => void, coalesce?: string) {
  update(
    (d) => {
      if (!d.callSheets) (d as { callSheets: Record<ID, CallSheet> }).callSheets = {};
      let cs = d.callSheets[dayId];
      if (!cs) {
        d.callSheets[dayId] = emptyCallSheet(dayId);
        cs = d.callSheets[dayId];
      }
      cs.castCalls ??= {};
      cs.crewCalls ??= {};
      cs.deptNotes ??= {};
      fn(cs);
    },
    coalesce ? { coalesce: `callsheet:${dayId}:${coalesce}` } : undefined,
  );
}

type TextKey = 'crewCall' | 'shootingCall' | 'breakfast' | 'lunch' | 'estWrap' | 'parking' | 'basecamp' | 'generalNotes' | 'safetyNotes' | 'specialInstructions' | 'extras' | 'walkieChannels' | 'advanceNotes' | 'quote';

export function setField(dayId: ID, key: TextKey, value: string | undefined) {
  editCS(
    dayId,
    (cs) => {
      if (value == null || (value === '' && key !== 'extras')) delete cs[key];
      else cs[key] = value;
    },
    key,
  );
}

/** Revert a field to its computed default (e.g. extras). */
export function clearField(dayId: ID, key: TextKey) {
  editCS(dayId, (cs) => {
    delete cs[key];
  });
}

export function setVersion(dayId: ID, version: number | undefined) {
  editCS(
    dayId,
    (cs) => {
      if (version == null || isNaN(version) || version < 1) delete cs.version;
      else cs.version = Math.round(version);
    },
    'version',
  );
}

export function setWeather(dayId: ID, key: keyof NonNullable<CallSheet['weather']>, value: string | undefined) {
  editCS(
    dayId,
    (cs) => {
      const w = (cs.weather ??= {});
      if (value?.trim()) w[key] = value;
      else delete w[key];
      if (!Object.keys(w).length) delete cs.weather;
    },
    `weather:${key}`,
  );
}

export function setHospital(dayId: ID, key: keyof Hospital, value: string) {
  editCS(
    dayId,
    (cs) => {
      const h = (cs.hospital ??= {});
      if (value.trim()) h[key] = value;
      else delete h[key];
      if (!Object.keys(h).length) delete cs.hospital;
    },
    `hospital:${key}`,
  );
}

export function setLocations(dayId: ID, ids: ID[] | undefined) {
  editCS(dayId, (cs) => {
    if (ids?.length) cs.locationIds = ids;
    else delete cs.locationIds;
  });
}

export function setCastCall(dayId: ID, castId: ID, key: keyof CastCall, value: string | undefined) {
  editCS(
    dayId,
    (cs) => {
      const c = (cs.castCalls[castId] ??= {});
      if (value?.trim()) c[key] = value;
      else delete c[key];
      if (!Object.keys(c).length) delete cs.castCalls[castId];
    },
    `cast:${castId}:${key}`,
  );
}

export function setCrewCall(dayId: ID, crewId: ID, key: keyof CrewCall, value: string | undefined) {
  editCS(
    dayId,
    (cs) => {
      const c = (cs.crewCalls[crewId] ??= {});
      if (value?.trim()) c[key] = value;
      else delete c[key];
      if (!Object.keys(c).length) delete cs.crewCalls[crewId];
    },
    `crew:${crewId}:${key}`,
  );
}

/** Set (or clear with undefined) the call of several crew members at once. */
export function setCrewCalls(dayId: ID, crewIds: ID[], value: string | undefined) {
  editCS(dayId, (cs) => {
    for (const id of crewIds) {
      const c = (cs.crewCalls[id] ??= {});
      if (value) c.call = value;
      else delete c.call;
      if (!Object.keys(c).length) delete cs.crewCalls[id];
    }
  });
}

export function setDeptNote(dayId: ID, key: string, value: string) {
  editCS(
    dayId,
    (cs) => {
      if (value.trim()) cs.deptNotes[key] = value;
      else delete cs.deptNotes[key];
    },
    `dept:${key}`,
  );
}

/** Fill every empty department note with its breakdown suggestion. */
export function fillDeptNotes(dayId: ID, notes: { key: string; text: string; suggestion: string }[]) {
  const todo = notes.filter((n) => !n.text.trim() && n.suggestion.trim());
  if (!todo.length) {
    toast('Nothing to fill — every note with a suggestion already has text.', 'info');
    return;
  }
  editCS(dayId, (cs) => {
    for (const n of todo) cs.deptNotes[n.key] = n.suggestion;
  });
  toast(`Filled ${todo.length} department note${todo.length === 1 ? '' : 's'} from the breakdown`);
}

/** Copy header times, crew calls and (matching) cast calls from the previous shoot day. */
export function copyFromPrevious(dayIndex: number) {
  const p = getProject();
  const prevDay = p.schedule.days[dayIndex - 1];
  const day = p.schedule.days[dayIndex];
  if (!prevDay || !day) return;
  const prev = p.callSheets?.[prevDay.id];
  if (!prev) {
    toast(`Day ${dayIndex} has no call sheet to copy from yet.`, 'info');
    return;
  }
  const model = getScriptModel(p);
  const today = resolveCallSheet(p, model, dayIndex);
  const working = new Set(today?.castRows.map((r) => r.cast.id) ?? []);
  editCS(day.id, (cs) => {
    for (const k of ['crewCall', 'shootingCall', 'breakfast', 'lunch', 'estWrap'] as const) {
      if (prev[k]) cs[k] = prev[k];
    }
    cs.crewCalls = JSON.parse(JSON.stringify(prev.crewCalls ?? {}));
    for (const [id, call] of Object.entries(prev.castCalls ?? {})) {
      if (!working.has(id)) continue;
      const copy: CastCall = { ...call };
      delete copy.notes;
      if (Object.keys(copy).length) cs.castCalls[id] = copy;
    }
    if (!cs.walkieChannels && prev.walkieChannels) cs.walkieChannels = prev.walkieChannels;
  });
  toast(`Copied call times from Day ${dayIndex} — Ctrl+Z to undo`);
}

export async function resetCallSheet(dayId: ID, dayNumber: number) {
  if (!getProject().callSheets?.[dayId]) {
    toast('This call sheet already uses the defaults.', 'info');
    return;
  }
  const ok = await confirmDialog({
    title: `Reset the Day ${dayNumber} call sheet?`,
    message: 'All times, weather, notes and individual cast & crew calls entered for this day are removed. Scenes, cast and locations still come from the schedule.',
    confirmLabel: 'Reset to defaults',
    danger: true,
  });
  if (!ok) return;
  update((d) => {
    if (d.callSheets) delete d.callSheets[dayId];
  });
  toast('Call sheet reset to defaults', 'info');
}
