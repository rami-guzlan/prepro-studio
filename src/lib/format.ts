import type { ProjectSettings } from '@/types';
import { MONTHS_LONG, MONTHS_SHORT, parseISODate, pad2, timeToMinutes, WEEKDAYS_LONG, WEEKDAYS_SHORT } from './dates';

export interface Formatters {
  /** 10/18/2026 (per project date format) */
  date(iso?: string | null): string;
  /** Oct 18, 2026 */
  dateMedium(iso?: string | null): string;
  /** Sunday, October 18, 2026 */
  dateLong(iso?: string | null): string;
  /** Sun 10/18 */
  dateShort(iso?: string | null): string;
  /** 7:30 AM or 07:30 */
  time(t?: string | null): string;
  /** $1,250.00 */
  money(n?: number | null, opts?: { cents?: boolean }): string;
  /** 1,250 */
  number(n?: number | null, digits?: number): string;
  /** page length in eighths, e.g. 11 -> '1 3/8' */
  eighths(n?: number | null): string;
  /** minutes to '1h 30m' */
  minutes(n?: number | null): string;
  /** seconds to '1:05' or '1:02:05' */
  seconds(n?: number | null): string;
}

export function formatEighths(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '';
  const total = Math.max(0, Math.round(n));
  const pages = Math.floor(total / 8);
  const rest = total % 8;
  if (pages === 0 && rest === 0) return '0';
  if (pages === 0) return `${rest}/8`;
  if (rest === 0) return `${pages}`;
  return `${pages} ${rest}/8`;
}

export function formatMinutes(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n <= 0) return '';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatSeconds(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n < 0) return '';
  const total = Math.round(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** Parse '1:05', '65', '1:02:05', '1m 5s' into seconds. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const parts = t.split(':').map((p) => p.trim());
  if (parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
  }
  const m = /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i.exec(t);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return undefined;
}

export function makeFormatters(settings?: Partial<ProjectSettings>): Formatters {
  const dateFormat = settings?.dateFormat ?? 'MDY';
  const timeFormat = settings?.timeFormat ?? '12h';
  const currency = settings?.currency || 'USD';
  let moneyFmt: Intl.NumberFormat;
  let moneyFmtWhole: Intl.NumberFormat;
  try {
    moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });
    moneyFmtWhole = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    moneyFmtWhole = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  const date = (iso?: string | null) => {
    const d = parseISODate(iso ?? undefined);
    if (!d) return '';
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    if (dateFormat === 'DMY') return `${dd}/${mm}/${yyyy}`;
    if (dateFormat === 'YMD') return `${yyyy}-${mm}-${dd}`;
    return `${mm}/${dd}/${yyyy}`;
  };

  return {
    date,
    dateMedium(iso) {
      const d = parseISODate(iso ?? undefined);
      if (!d) return '';
      if (dateFormat === 'DMY') return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    },
    dateLong(iso) {
      const d = parseISODate(iso ?? undefined);
      if (!d) return '';
      if (dateFormat === 'DMY') return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
      return `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    },
    dateShort(iso) {
      const d = parseISODate(iso ?? undefined);
      if (!d) return '';
      const md = dateFormat === 'DMY' ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.getMonth() + 1}/${d.getDate()}`;
      return `${WEEKDAYS_SHORT[d.getDay()]} ${md}`;
    },
    time(t) {
      const mins = timeToMinutes(t ?? undefined);
      if (mins == null) return t ?? '';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (timeFormat === '24h') return `${pad2(h)}:${pad2(m)}`;
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${pad2(m)} ${suffix}`;
    },
    money(n, opts) {
      if (n == null || isNaN(n)) return '';
      return opts?.cents === false ? moneyFmtWhole.format(n) : moneyFmt.format(n);
    },
    number(n, digits = 0) {
      if (n == null || isNaN(n)) return '';
      return n.toLocaleString(undefined, { maximumFractionDigits: digits });
    },
    eighths: formatEighths,
    minutes: formatMinutes,
    seconds: formatSeconds,
  };
}

/** Safe number parse for inputs ('1,200.50' -> 1200.5). */
export function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return isNaN(v) ? fallback : v;
  if (typeof v !== 'string') return fallback;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? fallback : n;
}
