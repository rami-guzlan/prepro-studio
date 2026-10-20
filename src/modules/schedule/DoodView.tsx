/* Day Out of Days: work / hold status of every character per shoot day. */
import { useMemo } from 'react';
import { CalendarPlus, Users } from 'lucide-react';
import { useFormatters, useProject } from '@/store/project';
import { navigate } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { Button, EmptyState, Toolbar } from '@/ui';
import { DOOD_LEGEND, DOOD_STYLE, computeDays, computeDood } from './logic';
import { addDay } from './actions';

export function DoodView() {
  const schedule = useProject((p) => p.schedule);
  const locations = useProject((p) => p.locations);
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const model = useScriptModel();
  const fmt = useFormatters();
  const rows = useMemo(() => computeDays({ schedule, locations }, model), [schedule, locations, model]);
  const dood = useMemo(() => computeDood(rows, characters, cast), [rows, characters, cast]);

  if (!rows.length) {
    return (
      <div className="module-body">
        <EmptyState
          icon={CalendarPlus}
          title="No shoot days yet"
          description="The Day Out of Days fills in automatically once scenes are scheduled on shoot days."
          action={
            <Button variant="primary" icon={CalendarPlus} onClick={() => addDay()}>
              Add shoot day
            </Button>
          }
        />
      </div>
    );
  }
  if (!dood.length) {
    return (
      <div className="module-body">
        <EmptyState
          icon={Users}
          title="No cast on the schedule yet"
          description="Schedule scenes with characters in them (speaking or tagged as cast in the breakdown) to see who works on which day."
          action={<Button onClick={() => navigate('breakdown')}>Open breakdown</Button>}
        />
      </div>
    );
  }

  const totals = rows.map((r) => dood.filter((d) => d.codes[r.index] && d.codes[r.index] !== 'H').length);

  return (
    <>
      <Toolbar>
        <div className="sched-dood-legend">
          {DOOD_LEGEND.map((l) => (
            <span key={l.code}>
              <b style={{ background: l.bg, color: l.fg }}>{l.code}</b>
              {l.label}
            </span>
          ))}
        </div>
        <div className="spacer" />
        <span className="muted small">
          {dood.length} characters · {rows.length} shoot days
        </span>
      </Toolbar>
      <div className="module-body padded">
        <div className="table-wrap sched-dood-wrap">
          <table className="table sched-dood">
            <thead>
              <tr>
                <th className="sticky c1">#</th>
                <th className="sticky c2">Character</th>
                <th className="sticky c3">Cast</th>
                {rows.map((r) => (
                  <th key={r.day.id} className="day" title={r.day.label || undefined}>
                    <div>Day {r.number}</div>
                    <div className="sub">{r.date ? fmt.dateShort(r.date) : '—'}</div>
                  </th>
                ))}
                <th className="num tot">Work</th>
                <th className="num tot">Hold</th>
                <th className="num tot">Total</th>
                <th className="tot">Start</th>
                <th className="tot">Finish</th>
              </tr>
            </thead>
            <tbody>
              {dood.map((d) => (
                <tr key={d.character.id}>
                  <td className="sticky c1 strong">{d.character.number ?? ''}</td>
                  <td className="sticky c2 strong">{d.character.name}</td>
                  <td className="sticky c3">{d.cast?.name ?? <span className="muted">Not cast</span>}</td>
                  {d.codes.map((code, i) => {
                    const st = code ? DOOD_STYLE[code] : undefined;
                    return (
                      <td key={i} className="code" style={st ? { background: st.bg, color: st.fg } : undefined} title={st ? `${st.label} — Day ${i + 1}` : undefined}>
                        {code}
                      </td>
                    );
                  })}
                  <td className="num strong">{d.work}</td>
                  <td className="num">{d.hold || ''}</td>
                  <td className="num strong">{d.total}</td>
                  <td className="nowrap">{d.start ? fmt.dateShort(d.start) : `Day ${d.startIndex + 1}`}</td>
                  <td className="nowrap">{d.finish ? fmt.dateShort(d.finish) : `Day ${d.finishIndex + 1}`}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky c1" />
                <td className="sticky c2 strong" colSpan={1}>
                  Cast working
                </td>
                <td className="sticky c3" />
                {totals.map((t, i) => (
                  <td key={i} className="code strong">
                    {t || ''}
                  </td>
                ))}
                <td className="num strong">{dood.reduce((n, d) => n + d.work, 0)}</td>
                <td className="num">{dood.reduce((n, d) => n + d.hold, 0) || ''}</td>
                <td className="num strong">{dood.reduce((n, d) => n + d.total, 0)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
