/* Accounts & outreach → Progress: the RSVP goal, the funnel, the team's outreach
   week by week, follow-ups that are due and the latest touches. */
import type { ID } from '@/types';
import type { LeadStage } from '@/spaces/types';
import { LEAD_STAGES, NO_SEGMENT, channelLabel, goalOf, type OutreachStats } from '@/spaces/outreach';
import { diffDays, todayISO } from '@/lib/dates';
import { plural } from '@/lib/text';
import { BarChart, BarList, Meter } from '@/ui/charts';
import { MemberDot, shortDate, useOutreach } from './shared';

/** One bar split by stage (width relative to the biggest row). */
function StageStack({ stages, max }: { stages: Record<LeadStage, number>; max: number }) {
  const total = LEAD_STAGES.reduce((n, s) => n + stages[s.value], 0);
  return (
    <span className="or-stack" style={{ width: `${Math.max(4, (total / Math.max(1, max)) * 100)}%` }} aria-label={LEAD_STAGES.filter((s) => stages[s.value]).map((s) => `${stages[s.value]} ${s.label}`).join(', ')}>
      {LEAD_STAGES.map((s) =>
        stages[s.value] ? <i key={s.value} style={{ flexGrow: stages[s.value], background: s.color }} title={`${s.label}: ${stages[s.value]}`} /> : null,
      )}
    </span>
  );
}

const COVERAGE = [
  { key: 'rsvp', label: 'Has an RSVP', color: '#2f9e44' },
  { key: 'reached', label: 'Reached', color: '#4c6ef5' },
  { key: 'notReached', label: 'Leads, not reached yet', color: '#adb5bd' },
  { key: 'noLeads', label: 'No leads yet', color: 'transparent' },
] as const;

export function DashboardView({ stats, listId, onOpenLead, onPickOwner, onPickSegment, onOpenAccount }: { stats: OutreachStats; listId?: ID; onOpenLead: (accountId: ID, leadId: ID) => void; onPickOwner: (id: ID) => void; onPickSegment: (segment: string) => void; onOpenAccount: (id: ID) => void }) {
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

      <section className="or-cover">
        <h3>Accounts at a glance</h3>
        {stats.accounts === 0 ? (
          <p className="muted small">No accounts match.</p>
        ) : (
          <>
            <div className="or-cover-bar" role="img" aria-label={COVERAGE.map((c) => `${stats.coverage[c.key]} ${c.label}`).join(', ')}>
              {COVERAGE.map((c) =>
                stats.coverage[c.key] ? <i key={c.key} className={c.key} style={{ flexGrow: stats.coverage[c.key], background: c.color }} title={`${c.label}: ${stats.coverage[c.key]}`} /> : null,
              )}
            </div>
            <div className="or-cover-legend">
              {COVERAGE.map((c) => (
                <span key={c.key}>
                  <i className={c.key} style={{ background: c.color }} />
                  <b>{stats.coverage[c.key]}</b> {c.label}
                </span>
              ))}
              <span className="muted">
                {stats.accounts ? (stats.leads / stats.accounts).toFixed(1) : '0'} leads per account
              </span>
            </div>
          </>
        )}
      </section>

      <div className="or-dash-grid">
        <section className="wide">
          <h3>By industry</h3>
          {stats.bySegment.length === 0 ? (
            <p className="muted small">No accounts match.</p>
          ) : (
            <table className="or-team-table or-seg-table">
              <thead>
                <tr>
                  <th>Industry</th>
                  <th>Accounts</th>
                  <th>Reached</th>
                  <th className="or-seg-stack">Leads by stage</th>
                  <th>RSVPs</th>
                </tr>
              </thead>
              <tbody>
                {stats.bySegment.map((g) => {
                  const maxLeads = Math.max(1, ...stats.bySegment.map((x) => x.leads));
                  return (
                    <tr key={g.segment || 'none'} className="click" onClick={() => onPickSegment(g.segment)} title={`Show ${g.segment || 'accounts with no industry'}`}>
                      <td>{g.segment === NO_SEGMENT ? <span className="muted">No industry set</span> : g.segment}</td>
                      <td>{g.accounts}</td>
                      <td>
                        <span className="or-team-bar">
                          <i style={{ width: `${(g.reached / Math.max(1, g.accounts)) * 60}px`, background: '#4c6ef5' }} />
                          {g.reached}
                        </span>
                      </td>
                      <td className="or-seg-stack">
                        <span className="row" style={{ gap: 8 }}>
                          <StageStack stages={g.stages} max={maxLeads} />
                          <span className="muted small">{g.leads}</span>
                        </span>
                      </td>
                      <td>
                        <b>{g.rsvps}</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="or-stage-legend">
            {LEAD_STAGES.map((s) => (
              <span key={s.value}>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3>By tier</h3>
          <BarList
            rows={stats.byTier.map((t) => ({ id: String(t.tier), label: t.tier ? `Tier ${t.tier}` : 'No tier', value: t.accounts, sub: `${t.reached} reached · ${t.rsvps} RSVP`, color: ['#adb5bd', '#5b45e0', '#7c6cf0', '#a99ff5'][t.tier] }))}
            empty="No accounts match"
          />
        </section>

        <section>
          <h3>Who we are reaching</h3>
          <BarList rows={stats.bySeniority.map((x) => ({ id: x.level, label: x.level, value: x.leads, sub: `${x.rsvps} RSVP`, color: 'var(--viz-2)' }))} empty="No leads yet" />
          <p className="muted small">Seniority read from each lead’s title.</p>
        </section>

        <section className="wide">
          <h3>Top accounts</h3>
          {stats.topAccounts.length === 0 ? (
            <p className="muted small">Accounts with leads show here, the most RSVPs first.</p>
          ) : (
            <ul className="or-list">
              {stats.topAccounts.map((t) => (
                <li key={t.account.id}>
                  <button type="button" onClick={() => onOpenAccount(t.account.id)}>
                    <span className="or-top-name ellipsis">
                      <b>{t.account.name || 'Untitled account'}</b>
                      <span className="muted small"> {[t.account.tier ? `Tier ${t.account.tier}` : '', t.account.segment].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="grow">
                      <StageStack stages={t.stages} max={Math.max(...stats.topAccounts.map((x) => x.leads))} />
                    </span>
                    <span className="small">
                      {t.leads} leads{t.rsvps ? <b className="or-rsvp"> · {t.rsvps} RSVP</b> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

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
