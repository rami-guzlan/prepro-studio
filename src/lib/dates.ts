/* Date helpers working with ISO 'YYYY-MM-DD' strings in local time. */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Parse 'YYYY-MM-DD' into a local Date at noon (avoids DST edge issues). */
export function parseISODate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso) ?? new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDays(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function isWeekend(iso: string): boolean {
  const d = parseISODate(iso);
  if (!d) return false;
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}

/** Next date after `iso` (optionally skipping weekends). */
export function nextWorkDate(iso: string, skipWeekends: boolean): string {
  let next = addDays(iso, 1);
  if (skipWeekends) while (isWeekend(next)) next = addDays(next, 1);
  return next;
}

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function weekdayShort(iso: string | undefined): string {
  const d = parseISODate(iso);
  return d ? WEEKDAYS_SHORT[d.getDay()] : '';
}

export function weekdayLong(iso: string | undefined): string {
  const d = parseISODate(iso);
  return d ? WEEKDAYS_LONG[d.getDay()] : '';
}

/** Parse 'HH:MM' (24h) into minutes since midnight. */
export function timeToMinutes(t: string | undefined | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function addMinutesToTime(t: string, delta: number): string {
  const m = timeToMinutes(t);
  return m == null ? t : minutesToTime(m + delta);
}
