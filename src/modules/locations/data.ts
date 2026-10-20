/* Pure helpers for the Locations module (safe for print docs). */
import type { CallSheet, ID, Location, Schedule } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import type { Option } from '@/lib/constants';
import { dayDates, locationForScene, locationForSet } from '@/derived/project';

export const LOCATION_KINDS: Option<NonNullable<Location['kind']>>[] = [
  { value: 'interior', label: 'Interior' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'both', label: 'Interior & exterior' },
  { value: 'studio', label: 'Studio / stage' },
  { value: 'virtual', label: 'Virtual / LED volume' },
];

export const PERMIT_STATUSES: Option<NonNullable<Location['permitStatus']>>[] = [
  { value: 'n/a', label: 'Not needed', color: '#8e8c99' },
  { value: 'needed', label: 'Needed', color: '#e5484d' },
  { value: 'applied', label: 'Applied', color: '#f5a524' },
  { value: 'approved', label: 'Approved', color: '#2fb36d' },
];

export function permitText(l: Location): string {
  if (l.permitStatus && l.permitStatus !== 'n/a') return `Permit ${PERMIT_STATUSES.find((s) => s.value === l.permitStatus)?.label.toLowerCase()}`;
  if (l.permitRequired) return 'Permit required';
  if (l.permitStatus === 'n/a' || l.permitRequired === false) return 'No permit needed';
  return '';
}

/* ------------------------------------------------------------------ maps & coordinates */

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

export function hasCoords(l: Pick<Location, 'lat' | 'lng'>): l is { lat: number; lng: number } {
  return typeof l.lat === 'number' && typeof l.lng === 'number' && !isNaN(l.lat) && !isNaN(l.lng);
}

export function formatCoords(lat?: number, lng?: number): string {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return '';
  return `${+lat.toFixed(6)}, ${+lng.toFixed(6)}`;
}

function dmsToDec(deg: string, min: string | undefined, sec: string | undefined, hemi: string): number {
  const v = parseFloat(deg) + (min ? parseFloat(min) / 60 : 0) + (sec ? parseFloat(sec) / 3600 : 0);
  return /[SW]/i.test(hemi) ? -v : v;
}

/** Parse "40.7128, -73.9573", "40.7128 -73.9573" or "40°42'46.1\"N 73°57'26.3\"W". */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const t = text.trim();
  if (!t) return null;
  const dms = /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NS])[\s,;]+(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([EW])/i.exec(t);
  let lat: number;
  let lng: number;
  if (dms) {
    lat = dmsToDec(dms[1], dms[2], dms[3], dms[4]);
    lng = dmsToDec(dms[5], dms[6], dms[7], dms[8]);
  } else {
    const m = /^\(?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*\)?$/i.exec(t);
    if (!m) return null;
    lat = parseFloat(m[1]) * (m[2] && /s/i.test(m[2]) ? -1 : 1);
    lng = parseFloat(m[3]) * (m[4] && /w/i.test(m[4]) ? -1 : 1);
  }
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/* ------------------------------------------------------------------ sets & scenes */

export interface SetRow {
  /** stable key (uppercase set name) */
  id: string;
  set: string;
  scenes: SceneInfo[];
  eighths: number;
  location?: Location;
  inScript: boolean;
}

/** Every set from the script (plus sets only listed on locations) with its scenes and location. */
export function setRows(model: ScriptModel, locations: Location[]): SetRow[] {
  const rows = new Map<string, SetRow>();
  for (const s of model.sets) {
    const k = s.toUpperCase();
    if (!rows.has(k)) rows.set(k, { id: k, set: s, scenes: [], eighths: 0, inScript: true });
  }
  for (const sc of model.scenes) {
    const r = rows.get(sc.set.toUpperCase());
    if (!r) continue;
    r.scenes.push(sc);
    r.eighths += sc.eighths || 0;
  }
  for (const l of locations) {
    for (const s of l.sets ?? []) {
      const k = s.toUpperCase();
      if (k && !rows.has(k)) rows.set(k, { id: k, set: k, scenes: [], eighths: 0, inScript: false });
    }
  }
  for (const r of rows.values()) r.location = locationForSet({ locations }, r.set);
  return [...rows.values()];
}

/** Scenes shot at a location (via its sets or a per-scene override). */
export function scenesAt(locations: Location[], model: ScriptModel, locId: ID): SceneInfo[] {
  return model.scenes.filter((s) => locationForScene({ locations }, s)?.id === locId);
}

export interface LocDay {
  index: number;
  /** 'Day 1' */
  label: string;
  /** optional custom day name from the schedule (e.g. 'Pickup day') */
  name?: string;
  date?: string;
  scenes: SceneInfo[];
}

/** Shoot days that use a location (scheduled scenes there, or the call-sheet location override). */
export function shootDaysAt(schedule: Schedule, callSheets: Record<ID, CallSheet> | undefined, locations: Location[], model: ScriptModel, locId: ID): LocDay[] {
  const dates = dayDates({ schedule });
  const out: LocDay[] = [];
  schedule.days.forEach((day, index) => {
    const scenes: SceneInfo[] = [];
    for (const it of day.items) {
      if (it.type !== 'scene') continue;
      const s = model.sceneById.get(it.sceneId);
      if (s && locationForScene({ locations }, s)?.id === locId) scenes.push(s);
    }
    const override = callSheets?.[day.id]?.locationIds?.includes(locId);
    if (scenes.length || override) out.push({ index, label: `Day ${index + 1}`, name: day.label?.trim() || undefined, date: dates[index], scenes });
  });
  return out;
}
