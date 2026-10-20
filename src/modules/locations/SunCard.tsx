/* Sunrise / sunset / golden hour for a location on a shoot day (or any date). */
import { useEffect, useMemo, useState } from 'react';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import type { Location } from '@/types';
import { useFormatters } from '@/store/project';
import { sunTimes } from '@/lib/sun';
import { timeToMinutes, todayISO } from '@/lib/dates';
import { formatMinutes } from '@/lib/format';
import { DateInput } from '@/ui';
import { hasCoords, type LocDay } from './data';

export function SunCard({ loc, days }: { loc: Location; days: LocDay[] }) {
  const fmt = useFormatters();
  const firstDay = days.find((d) => d.date)?.date;
  const [date, setDate] = useState<string>(firstDay ?? todayISO());
  // when switching locations, jump to that location's first shoot day
  useEffect(() => {
    setDate(firstDay ?? todayISO());
  }, [loc.id, firstDay]);

  const t = useMemo(() => (hasCoords(loc) ? sunTimes(date, loc.lat, loc.lng) : {}), [date, loc]);
  const today = todayISO();

  if (!hasCoords(loc)) {
    return (
      <div className="loc-sun-empty">
        <Sun size={18} />
        <div>
          <div className="strong">Sun times need coordinates</div>
          <div className="muted small">Add the latitude and longitude above to see sunrise, sunset and golden hour for every shoot day. They also print on call sheets.</div>
        </div>
      </div>
    );
  }

  const pct = (time?: string) => {
    const m = timeToMinutes(time);
    return m == null ? null : (m / 1440) * 100;
  };
  const band = (from?: string, to?: string, cls?: string) => {
    const a = pct(from);
    const b = pct(to);
    if (a == null || b == null || b <= a) return null;
    return <div className={`loc-sunbar-band ${cls}`} style={{ left: `${a}%`, width: `${b - a}%` }} />;
  };

  return (
    <div className="loc-sun">
      <div className="loc-sun-dates">
        {days
          .filter((d) => d.date)
          .map((d) => (
            <button key={d.index} type="button" className={`chip loc-daychip ${date === d.date ? 'on' : ''}`} onClick={() => setDate(d.date!)}>
              {d.label} · {fmt.dateShort(d.date)}
            </button>
          ))}
        <button type="button" className={`chip loc-daychip ${date === today ? 'on' : ''}`} onClick={() => setDate(today)}>
          Today
        </button>
        <div className="spacer" />
        <DateInput size="sm" value={date} onChange={(v) => v && setDate(v)} style={{ width: 140 }} />
      </div>
      {!t.sunrise || !t.sunset ? (
        <div className="muted small">The sun doesn't rise or set at this location on {fmt.dateMedium(date)} (polar day or night).</div>
      ) : (
        <>
          <div className="loc-sun-main">
            <div>
              <Sunrise size={18} />
              <span className="loc-sun-k">Sunrise</span>
              <strong>{fmt.time(t.sunrise)}</strong>
            </div>
            <div>
              <Sunset size={18} />
              <span className="loc-sun-k">Sunset</span>
              <strong>{fmt.time(t.sunset)}</strong>
            </div>
            <div>
              <Sun size={18} />
              <span className="loc-sun-k">Daylight</span>
              <strong>{formatMinutes(t.dayLengthMinutes) || '—'}</strong>
            </div>
          </div>
          <div className="loc-sunbar" aria-hidden>
            {band(t.dawn, t.sunrise, 'twilight')}
            {band(t.sunrise, t.goldenMorningEnd, 'golden')}
            {band(t.goldenMorningEnd, t.goldenEveningStart, 'day')}
            {band(t.goldenEveningStart, t.sunset, 'golden')}
            {band(t.sunset, t.dusk, 'twilight')}
            {[6, 12, 18].map((h) => (
              <span key={h} className="loc-sunbar-tick" style={{ left: `${(h / 24) * 100}%` }}>
                {fmt.time(`${String(h).padStart(2, '0')}:00`).replace(':00', '')}
              </span>
            ))}
          </div>
          <div className="loc-sun-rows">
            <div>
              <span className="golden-dot" /> Golden hour: until <strong>{fmt.time(t.goldenMorningEnd)}</strong> · from <strong>{fmt.time(t.goldenEveningStart)}</strong>
            </div>
            <div>
              <Moon size={12} /> Civil dawn <strong>{fmt.time(t.dawn)}</strong> · dusk <strong>{fmt.time(t.dusk)}</strong> · solar noon {fmt.time(t.solarNoon)}
            </div>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {fmt.dateLong(date)} · times in this computer's time zone.
          </div>
        </>
      )}
    </div>
  );
}
