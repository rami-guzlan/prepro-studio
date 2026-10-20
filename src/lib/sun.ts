/* Sunrise / sunset (NOAA solar calculator algorithm). Works fully offline.
   Returns local clock times 'HH:MM' for the given date at lat/lng, using the
   computer's time zone offset for that date. */

import { pad2, parseISODate } from './dates';

const rad = Math.PI / 180;

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

interface SunTimes {
  sunrise?: string;
  sunset?: string;
  /** civil dawn / dusk */
  dawn?: string;
  dusk?: string;
  /** approx. golden hour start (evening) and end (morning) */
  goldenMorningEnd?: string;
  goldenEveningStart?: string;
  solarNoon?: string;
  dayLengthMinutes?: number;
}

/** minutes after local midnight -> 'HH:MM' */
function fmt(mins: number | null): string | undefined {
  if (mins == null || !isFinite(mins)) return undefined;
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function calc(date: Date, lat: number, lng: number, zenith: number, rising: boolean, tzOffsetMin: number): number | null {
  // Based on NOAA spreadsheet equations.
  const jd = Math.floor(julianDay(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())))) + 0.5;
  const t = (jd - 2451545.0) / 36525.0;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C =
    Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * M * rad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime =
    4 *
    (y * Math.sin(2 * L0 * rad) -
      2 * e * Math.sin(M * rad) +
      4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) -
      0.5 * y * y * Math.sin(4 * L0 * rad) -
      1.25 * e * e * Math.sin(2 * M * rad)) /
    rad;
  const cosH = (Math.cos(zenith * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  if (cosH > 1 || cosH < -1) return null; // polar day / night
  const H = Math.acos(cosH) / rad;
  const solarNoonUTC = 720 - 4 * lng - eqTime; // minutes UTC
  const utc = rising ? solarNoonUTC - 4 * H : solarNoonUTC + 4 * H;
  return utc + tzOffsetMin;
}

export function sunTimes(isoDate: string | undefined, lat: number | undefined, lng: number | undefined): SunTimes {
  const date = parseISODate(isoDate);
  if (!date || lat == null || lng == null || isNaN(lat) || isNaN(lng)) return {};
  const tz = -date.getTimezoneOffset(); // minutes east of UTC
  const sunrise = calc(date, lat, lng, 90.833, true, tz);
  const sunset = calc(date, lat, lng, 90.833, false, tz);
  const dawn = calc(date, lat, lng, 96, true, tz);
  const dusk = calc(date, lat, lng, 96, false, tz);
  // golden hour ≈ sun elevation below 6°: zenith 84°
  const gMorning = calc(date, lat, lng, 84, true, tz);
  const gEvening = calc(date, lat, lng, 84, false, tz);
  return {
    sunrise: fmt(sunrise),
    sunset: fmt(sunset),
    dawn: fmt(dawn),
    dusk: fmt(dusk),
    goldenMorningEnd: fmt(gMorning),
    goldenEveningStart: fmt(gEvening),
    solarNoon: sunrise != null && sunset != null ? fmt((sunrise + sunset) / 2) : undefined,
    dayLengthMinutes: sunrise != null && sunset != null ? Math.round(sunset - sunrise) : undefined,
  };
}
