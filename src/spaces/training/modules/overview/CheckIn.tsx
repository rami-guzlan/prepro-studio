/* Quick daily check-in: weight, sleep, energy, mood and a free-text blurb.
   Weight goes to Body metrics (one row per day), the rest becomes a check-in. */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Check, MessageSquareText } from 'lucide-react';
import { Button, Textarea, toast } from '@/ui';
import { useSpaceFormatters } from '@/store/space';
import { todayISO } from '@/lib/dates';
import { addCheckIn, nowTime, updateTraining, upsertMetric } from '../../ops';
import { dayCheckIn, loggedDates, streak } from '../../calc';
import { NumberUnit, RatingPicker, useTraining, useUnits, WeightInput } from '../../ui';
import type { ISODate } from '../../types';

export interface CheckInHandle {
  focus(): void;
}

interface Draft {
  kg?: number;
  sleepHours?: number;
  energy?: number;
  mood?: number;
  sleep?: number;
  hunger?: number;
  text: string;
}

export const QuickCheckIn = forwardRef<CheckInHandle, { date: ISODate; extended?: boolean; onSaved?: () => void }>(function QuickCheckIn({ date, extended, onSaved }, ref) {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const wrap = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<Draft>({ text: '' });
  useImperativeHandle(ref, () => ({
    focus: () => {
      wrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => wrap.current?.querySelector<HTMLInputElement>('input')?.focus(), 250);
    },
  }));
  const todayMetric = t.metrics.find((m) => m.date === date);
  const todayCheck = useMemo(() => dayCheckIn(t, date), [t, date]);
  const empty = d.kg == null && d.sleepHours == null && d.energy == null && d.mood == null && d.sleep == null && d.hunger == null && !d.text.trim();

  const save = () => {
    if (empty) return;
    let streakNow = 0;
    updateTraining((tr) => {
      if (d.kg != null) upsertMetric(tr, date, { weightKg: d.kg });
      if (d.sleepHours != null || d.energy != null || d.mood != null || d.sleep != null || d.hunger != null || d.text.trim())
        addCheckIn(tr, { date, time: nowTime(), text: d.text.trim() || undefined, sleepHours: d.sleepHours, energy: d.energy, mood: d.mood, sleep: d.sleep, hunger: d.hunger, source: 'me' });
      streakNow = streak(loggedDates(tr), date).current;
    });
    setD({ text: '' });
    toast(streakNow > 1 ? `Checked in · ${streakNow}-day streak` : 'Checked in');
    onSaved?.();
  };

  return (
    <div className="tr-checkin" ref={wrap} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && save()}>
      <div className="tr-checkin-grid">
        <label className="tr-field">
          <span>Weight</span>
          <WeightInput kg={d.kg} onChange={(kg) => setD({ ...d, kg })} u={u} placeholder={todayMetric?.weightKg != null ? u.weightNum(todayMetric.weightKg) : undefined} ariaLabel={`Today's weight in ${u.w}`} />
        </label>
        <label className="tr-field">
          <span>Sleep</span>
          <NumberUnit value={d.sleepHours} onChange={(sleepHours) => setD({ ...d, sleepHours })} unit="h" placeholder={todayCheck.sleepHours != null ? String(todayCheck.sleepHours) : '7.5'} step={0.25} ariaLabel="Hours slept" />
        </label>
      </div>
      <div className="tr-field">
        <span>Energy</span>
        <RatingPicker kind="energy" value={d.energy} onChange={(energy) => setD({ ...d, energy })} label="Energy" />
      </div>
      <div className="tr-field">
        <span>Mood</span>
        <RatingPicker kind="mood" value={d.mood} onChange={(mood) => setD({ ...d, mood })} label="Mood" />
      </div>
      {extended && (
        <>
          <div className="tr-field">
            <span>Sleep quality</span>
            <RatingPicker kind="sleep" value={d.sleep} onChange={(sleep) => setD({ ...d, sleep })} label="Sleep quality" />
          </div>
          <div className="tr-field">
            <span>Hunger</span>
            <RatingPicker kind="hunger" value={d.hunger} onChange={(hunger) => setD({ ...d, hunger })} label="Hunger" />
          </div>
        </>
      )}
      <label className="tr-field">
        <span>How's it going?</span>
        <Textarea value={d.text} onChange={(text) => setD({ ...d, text })} rows={3} placeholder="Slept badly but the workout felt strong. Craving sweets after 9pm…" />
      </label>
      <div className="row wrap" style={{ gap: 8 }}>
        <Button variant="primary" size="lg" icon={Check} disabled={empty} onClick={save}>
          Save check-in
        </Button>
        {(todayMetric?.weightKg != null || todayCheck.texts.length > 0) && (
          <span className="muted small">
            <MessageSquareText size={12} style={{ verticalAlign: -2 }} /> {date === todayISO() ? 'Today' : fmt.dateShort(date)}:{' '}
            {[todayMetric?.weightKg != null ? u.weight(todayMetric.weightKg) : '', todayCheck.sleepHours != null ? `${todayCheck.sleepHours} h sleep` : '', todayCheck.energy ? `energy ${todayCheck.energy}/5` : '', todayCheck.mood ? `mood ${todayCheck.mood}/5` : '', todayCheck.texts.length ? `${todayCheck.texts.length} note${todayCheck.texts.length === 1 ? '' : 's'}` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
});
