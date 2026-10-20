/* Cross-entity helpers (pure functions over ProjectData + ScriptModel). */
import type { CastMember, Character, CrewMember, ID, Location, ProjectData, ShootDay } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { addDays, isWeekend, nextWorkDate, parseISODate } from '@/lib/dates';

/** Characters played by a cast member. */
export function charactersForCast(p: Pick<ProjectData, 'characters'>, castId: ID): Character[] {
  return p.characters.filter((c) => c.castId === castId);
}

export function castForCharacter(p: Pick<ProjectData, 'cast'>, character: Character | undefined): CastMember | undefined {
  if (!character?.castId) return undefined;
  return p.cast.find((m) => m.id === character.castId);
}

export function characterById(p: Pick<ProjectData, 'characters'>, id: ID | undefined): Character | undefined {
  return id ? p.characters.find((c) => c.id === id) : undefined;
}

/** Real-world location for a scene: SceneMeta.locationId, else a Location whose `sets` include the scene's set. */
export function locationForScene(p: Pick<ProjectData, 'locations'>, scene: SceneInfo | undefined): Location | undefined {
  if (!scene) return undefined;
  if (scene.meta?.locationId) {
    const l = p.locations.find((x) => x.id === scene.meta!.locationId);
    if (l) return l;
  }
  const set = scene.set.toUpperCase();
  if (!set) return undefined;
  return p.locations.find((l) => l.sets.some((s) => s.toUpperCase() === set));
}

/** Location for a set name. */
export function locationForSet(p: Pick<ProjectData, 'locations'>, set: string): Location | undefined {
  const s = set.toUpperCase();
  return p.locations.find((l) => l.sets.some((x) => x.toUpperCase() === s));
}

/* ---------------------------------------------------------------- schedule */

export interface DayInfo {
  day: ShootDay;
  /** 0-based index */
  index: number;
  /** 'Day 1' ... */
  label: string;
  /** effective date (explicit, or computed from schedule start) */
  date?: string;
  sceneIds: ID[];
  scenes: SceneInfo[];
  eighths: number;
  /** estimated minutes (SceneMeta.estMinutes sum) */
  minutes: number;
  characterIds: ID[];
  locationIds: ID[];
  sets: string[];
}

/** Effective date of each shoot day (explicit date wins; otherwise follows startDate, skipping weekends if set). */
export function dayDates(p: Pick<ProjectData, 'schedule'>): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  let prev: string | undefined;
  p.schedule.days.forEach((d, i) => {
    let date = d.date;
    if (!date) {
      if (prev) date = nextWorkDate(prev, !!p.schedule.skipWeekends);
      else if (i === 0 && p.schedule.startDate) {
        date = p.schedule.startDate;
        if (p.schedule.skipWeekends) while (isWeekend(date)) date = addDays(date, 1);
      }
    }
    out.push(date);
    prev = date ?? prev;
  });
  return out;
}

export function scheduleInfo(p: ProjectData, model: ScriptModel): DayInfo[] {
  const dates = dayDates(p);
  return p.schedule.days.map((day, index) => {
    const sceneIds = day.items.filter((it): it is Extract<typeof it, { type: 'scene' }> => it.type === 'scene').map((it) => it.sceneId);
    const scenes = sceneIds.map((id) => model.sceneById.get(id)).filter((s): s is SceneInfo => !!s);
    const characterIds: ID[] = [];
    const locationIds: ID[] = [];
    const sets: string[] = [];
    let eighths = 0;
    let minutes = 0;
    for (const s of scenes) {
      eighths += s.eighths;
      minutes += s.meta?.estMinutes ?? 0;
      for (const c of s.characterIds) if (!characterIds.includes(c)) characterIds.push(c);
      const loc = locationForScene(p, s);
      if (loc && !locationIds.includes(loc.id)) locationIds.push(loc.id);
      if (s.set && !sets.includes(s.set)) sets.push(s.set);
    }
    return {
      day,
      index,
      label: day.label || `Day ${index + 1}`,
      date: dates[index],
      sceneIds,
      scenes,
      eighths,
      minutes,
      characterIds,
      locationIds,
      sets,
    };
  });
}

/** scene id -> index of the shoot day it is scheduled on */
export function sceneDayIndex(p: Pick<ProjectData, 'schedule'>): Map<ID, number> {
  const m = new Map<ID, number>();
  p.schedule.days.forEach((d, i) => {
    for (const it of d.items) if (it.type === 'scene') m.set(it.sceneId, i);
  });
  return m;
}

/** Crew grouped by department in a stable order. */
export function crewByDepartment(crew: CrewMember[], order: readonly string[]): [string, CrewMember[]][] {
  const groups = new Map<string, CrewMember[]>();
  for (const c of crew) {
    const dept = c.department || 'Other';
    groups.set(dept, [...(groups.get(dept) ?? []), c]);
  }
  return [...groups.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0]);
  });
}

export function isValidDate(iso?: string): boolean {
  return !!parseISODate(iso);
}
