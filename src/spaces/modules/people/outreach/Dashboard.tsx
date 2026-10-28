/* Accounts & outreach → Progress: the RSVP goal, the funnel, the team's outreach
   week by week, follow-ups that are due and the latest touches. */
import type { ID } from '@/types';
import { LEAD_STAGES, channelLabel, goalOf, type OutreachStats } from '@/spaces/outreach';
import { diffDays, todayISO } from '@/lib/dates';
import { plural } from '@/lib/text';
import { BarChart, BarList, Meter } from '@/ui/charts';
import { MemberDot, shortDate, useOutreach } from './shared';

export function DashboardView({ stats, listId, onOpenLead, onPickOwner }: { stats: OutreachStats; listId?: ID; onOpenLead: (accountId: ID, leadId: ID) => void; onPickOwner: (id: ID) => void }) {
  const o = useOutreach();
  const today = todayISO();
  const { goal, eventDate, name } = goalOf(o, listId);
  const days = eventDate ? diffDays(today, eventDate) : null;
  const pct = goal ? Math.round((stats.rsvps / goal) * 100) : 0;
  // what it takes from here: RSVPs still needed per week until the event
  const weeksLeft = days != null && days > 0 ? Math.max(1, Math.ceil(days / 7)) : null;
  const perWeek = goal && weeksLeft ? Math.max(0, Math.ceil((goal - stats.rsvps) / weeksLeft)) : null;
  const team = stats.team.filter((m) => m.id);

  return (
    <div className="or-dash">
      <section className="or-dash-goal">
        <div className="or-dash-goal-main">
          <div className="muted small">{name}{eventDate ? ` · ${new Date(`${eventDate}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}</div>
          <div className="or-dash-big">
            {stats.rsvps}
            {goal ? <span className="muted"> of {goal} RSVPs</span> : <span className="muted"> RSVPs</span>}
          </div>
          {goal ? <Meter value={stats.rsvps} max={goal} tone={pct >= 100 ? 'good' : undefined} label="RSVPs against the goal" /> : <p className="muted small">Set an RSVP goal and the event date on the list (the pencil next to its name) to track progress here.</p>}
        </div>
        <dl className="or-dash-facts">
          {days != null && (
            <>
              <dt>{days >= 0 ? 'Days to go' : 'Days since'}</dt>
              <dd>{Math.abs(days)}</dd>
            </>
          )}
          {perWeek != null && goal > stats.rsvps && (
            <>
              <dt>RSVPs needed a week</dt>
              <dd>{perWeek}</dd>
            </>
          )}
          <dt>Accounts reached</dt>
          <dd>
            {stats.reached} <span className="muted">of {stats.accounts}</span>
          </dd>
          <dt>Touches this week</dt>
          <dd>{stats.touches.last7}</dd>
        </dl>
      </section>

      <div className="or-dash-grid">
        <section>
          <h3>Funnel</h3>
          <BarList rows={LEAD_STAGES.map((s) => ({ id: s.value, label: s.label, value: stats.byStage[s.value], color: s.color }))} max={Math.max(1, stats.leads)} empty="No leads yet" />
          <p className="muted small">
            {plural(stats.leads, 'lead')} at {plural(stats.accounts, 'account')}
            {stats.noLeads ? ` · ${plural(stats.noLeads, 'account')} with no leads yet` : ''}
          </p>
        </section>

        <section>
          <h3>Outreach by week</h3>
          <BarChart
            height={170}
            ariaLabel="Touches logged per week"
            empty="No touches logged yet"
            data={stats.weekly.map((w) => ({ label: shortDate(w.week), title: `Week of ${shortDate(w.week)}`, value: w.count }))}
          />
        </section>

        <section className="wide">
          <h3>Team</h3>
          {team.length === 0 ? (
            <p className="muted small">Add the team (Team button) and give accounts an owner to see who is working what.</p>
          ) : (
            <table className="or-team-table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Accounts</th>
                  <th>Leads</th>
                  <th>Still open</th>
                  <th>RSVPs</th>
                  <th>Touches, 7 days</th>
                  <th>Touches, 30 days</th>
                </tr>
              </thead>
              <tbody>
                {stats.team.map((m) => (
                  <tr key={m.id || 'none'} onClick={m.id ? () => onPickOwner(m.id) : undefined} className={m.id ? 'click' : ''} title={m.id ? `Show ${m.name}'s accounts` : undefined}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <MemberDot m={m.id ? { id: m.id, name: m.name, color: m.color } : undefined} />
                        {m.name}
                      </span>
                    </td>
                    <td>{m.accounts}</td>
                    <td>{m.leads}</td>
                    <td>{m.open}</td>
                    <td>
                      <b>{m.rsvps}</b>
                    </td>
                    <td>{m.touches7}</td>
                    <td>
                      <span className="or-team-bar">
                        <i style={{ width: `${(m.touches30 / Math.max(1, ...stats.team.map((x) => x.touches30))) * 100}%`, background: m.color ?? 'var(--text-muted)' }} />
                        {m.touches30}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3>Follow-ups due {stats.due.length > 0 && <span className="or-count">{stats.due.length}</span>}</h3>
          {stats.due.length === 0 ? (
            <p className="muted small">Nothing due. Set a next step date on a lead and it shows here when it comes up.</p>
          ) : (
            <ul className="or-list">
              {stats.due.slice(0, 12).map((r) => (
                <li key={r.lead.id}>
                  <button type="button" onClick={() => onOpenLead(r.account.id, r.lead.id)}>
                    <span className="grow ellipsis">
                      <b>{r.lead.name || 'Lead'}</b> <span className="muted">· {r.account.name}</span>
                      {r.lead.nextStep && <span className="muted small"> · {r.lead.nextStep}</span>}
                    </span>
                    <span className={r.date < today ? 'or-due' : 'small'}>{shortDate(r.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Latest outreach</h3>
          {stats.recent.length === 0 ? (
            <p className="muted small">Logged touches show up here for the whole team.</p>
          ) : (
            <ul className="or-list">
              {stats.recent.map((r) => {
                const by = o.team.find((m) => m.id === r.touch.byId);
                return (
                  <li key={r.touch.id}>
                    <button type="button" onClick={() => onOpenLead(r.account.id, r.lead.id)}>
                      <MemberDot m={by} size={18} />
                      <span className="grow ellipsis">
                        {by?.name ?? 'Someone'} · {channelLabel(r.touch.channel)} · <b>{r.lead.name || 'Lead'}</b> <span className="muted">({r.account.name})</span>
                      </span>
                      <span className="small muted">{shortDate(r.touch.date)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
