/* Small shared pieces of the Production screen. */
import { useEffect, useState } from 'react';
import type { ShootSession } from '@/spaces/types';
import { MONTHS_SHORT, parseISODate, weekdayShort } from '@/lib/dates';
import { formatSeconds, parseDuration } from '@/lib/format';
import { spaceUndo } from '@/store/space';
import { toast } from '@/ui';
import { validDate } from './model';

/** Success toast with an Undo button. */
export function undoToast(message: string) {
  toast(message, 'success', { action: { label: 'Undo', onClick: () => spaceUndo() } });
}

export function DateBadge({ date }: { date?: string }) {
  const d = validDate(date) ? parseISODate(date) : null;
  if (!d) {
    return (
      <div className="sp-production-datebadge none" aria-label="No date">
        <span>Date</span>
        <strong>—</strong>
      </div>
    );
  }
  return (
    <div className="sp-production-datebadge" aria-hidden>
      <span>{weekdayShort(date)}</span>
      <strong>{d.getDate()}</strong>
      <span>{MONTHS_SHORT[d.getMonth()]}</span>
    </div>
  );
}

/** Seconds field shown as m:ss; accepts '5', '0:05', '1m 5s'. */
export function DurationInput({ value, onChange, ariaLabel }: { value?: number; onChange: (v: number | undefined) => void; ariaLabel?: string }) {
  const [text, setText] = useState(value != null ? formatSeconds(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value != null ? formatSeconds(value) : '');
  }, [value, focused]);
  return (
    <input
      className="input bare sm sp-production-dur"
      value={text}
      placeholder="0:00"
      inputMode="numeric"
      aria-label={ariaLabel ?? 'Duration'}
      title="Duration (seconds or m:ss)"
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const t = text.trim();
        if (!t) onChange(undefined);
        else {
          const n = parseDuration(t);
          if (n != null && !isNaN(n)) onChange(Math.max(0, Math.round(n)));
          else setText(value != null ? formatSeconds(value) : '');
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Value for the print option "shoot": the title when it is unique, else the id. */
export function shootPrintValue(sh: ShootSession, all: ShootSession[]): string {
  const t = (sh.title || '').trim().toLowerCase();
  if (t && all.filter((s) => (s.title || '').trim().toLowerCase() === t).length === 1) return (sh.title || '').trim();
  return sh.id;
}
