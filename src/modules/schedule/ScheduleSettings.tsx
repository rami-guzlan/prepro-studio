/* Schedule settings popover: start date, skip weekends, date helpers. */
import { useState } from 'react';
import { CalendarCheck, CalendarX, Settings2 } from 'lucide-react';
import { update, useFormatters, useProject } from '@/store/project';
import { Button, DateInput, Field, Popover, Switch, type AnchorRect } from '@/ui';
import { clearFixedDates, syncProjectShootDates } from './actions';

export function ScheduleSettingsButton() {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const schedule = useProject((p) => p.schedule);
  const meta = useProject((p) => p.meta);
  const fmt = useFormatters();
  const fixed = schedule.days.filter((d) => d.date).length;
  return (
    <>
      <Button
        size="sm"
        icon={Settings2}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        Schedule settings
      </Button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="sched-settings">
          <div className="section-title">Schedule settings</div>
          <Field label="First shoot day" hint="Days without a fixed date follow on from here.">
            <DateInput
              value={schedule.startDate}
              onChange={(v) =>
                update(
                  (d) => {
                    if (v) d.schedule.startDate = v;
                    else delete d.schedule.startDate;
                  },
                  { coalesce: 'schedule:startDate' },
                )
              }
            />
          </Field>
          <Switch
            checked={schedule.skipWeekends}
            onChange={(v) =>
              update((d) => {
                d.schedule.skipWeekends = v;
              })
            }
            label="Skip weekends for automatic dates"
          />
          <div className="divider" />
          <div className="col" style={{ gap: 6 }}>
            <Button size="sm" icon={CalendarX} disabled={!fixed} onClick={() => clearFixedDates()}>
              Use automatic dates for all days{fixed ? ` (${fixed} fixed)` : ''}
            </Button>
            <Button size="sm" icon={CalendarCheck} disabled={!schedule.days.length} onClick={() => syncProjectShootDates()}>
              Copy dates to project info
            </Button>
            <div className="muted tiny">
              Project shoot dates: {meta.shootStart ? fmt.dateMedium(meta.shootStart) : '—'} → {meta.shootEnd ? fmt.dateMedium(meta.shootEnd) : '—'}
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}
