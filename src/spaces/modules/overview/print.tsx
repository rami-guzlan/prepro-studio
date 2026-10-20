/* Printable documents of the space Overview: the one-sheet. */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Check, Dot, PBadge, PSection, PTable, Pre } from '@/print/components';
import { CAMPAIGN_STATUSES, FORMAT_BY_ID, GOAL_STATUSES, PLATFORM_BY_ID, POST_STATUSES, SPACE_TYPES, STAGES, STAGE_BY_ID } from '@/spaces/constants';
import { cadenceForWeek, channelColor, countByStage, goalProgress, upcomingPosts, weekStart } from '@/spaces/derive';
import { optionColor, optionLabel } from '@/lib/constants';
import { addDays } from '@/lib/dates';
import { campaignRange, isActiveCampaign, isISO, pillarShares, spaceKpis, stripYear } from './derive';

const CSS = `
.spo-hero { display: flex; gap: 12pt; align-items: flex-start; margin-bottom: 4pt; }
.spo-emoji { width: 34pt; height: 34pt; border-radius: 8pt; display: flex; align-items: center; justify-content: center; font-size: 18pt; font-weight: 700; flex-shrink: 0; }
.spo-hero-main { flex: 1; min-width: 0; }
.spo-kicker { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #6b6b75; }
.spo-desc { font-size: 10pt; line-height: 1.45; color: #26262e; margin-top: 2pt; white-space: pre-wrap; }
.spo-tagline { font-size: 10pt; font-style: italic; color: #44444d; margin-top: 4pt; }
.spo-stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5pt; }
.spo-stat { border: 0.75pt solid #d4d4dc; border-radius: 4pt; padding: 5pt 7pt; }
.spo-stat .k { font-size: 6.3pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; }
.spo-stat .v { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; }
.spo-stat .s { font-size: 6.8pt; color: #707078; }
.spo-stat.alert { border-color: #e5484d; }
.spo-stat.alert .v { color: #d93036; }
.spo-bar { display: inline-block; width: 100%; height: 5pt; border-radius: 3pt; background: #ececf1; overflow: hidden; vertical-align: middle; }
.spo-bar > span { display: block; height: 100%; border-radius: 3pt; }
.spo-pct { font-size: 7pt; color: #55555e; font-variant-numeric: tabular-nums; }
.spo-pipe { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4pt; }
.spo-stage { border: 0.75pt solid #d4d4dc; border-top-width: 2.5pt; border-radius: 3pt; padding: 4pt 6pt; }
.spo-stage .n { font-size: 12pt; font-weight: 700; }
.spo-stage .l { font-size: 7pt; color: #55555e; font-weight: 600; }
.spo-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14pt; }
.spo-sub { color: #707078; font-size: 7.3pt; }
.spo-met { color: #23a35a; font-weight: 700; }
.spo-miss { color: #c27a00; font-weight: 700; }
.spo-done { color: #8a8a94; text-decoration: line-through; }
`;

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-overview',
    title: 'Space One-Sheet',
    group: 'Overview',
    orientation: 'portrait',
    description: 'Mission, goals with progress, pillars, channels & cadence, pipeline, the next two weeks of posts and campaigns at a glance',
    options: [
      { key: 'showUpcoming', label: 'Upcoming posts (next 14 days)', type: 'boolean', default: true },
      { key: 'showCampaigns', label: 'Campaigns & milestones', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Space notes', type: 'boolean', default: false },
    ],
    render: (ctx) => {
      const s = ctx.space;
      const { fmt, options } = ctx;
      const today = ctx.todayISO;
      const m = s.meta;
      const color = m.color || '#7c5cff';
      const typeLabel = SPACE_TYPES.find((t) => t.value === m.type)?.label ?? 'Marketing space';
      const k = spaceKpis(s, today);
      const stages = countByStage(s.content);
      const shares = pillarShares(s);
      const week = weekStart(today, s.settings.weekStartsMonday);
      const cadence = cadenceForWeek(s, week);
      const cadenceById = new Map(cadence.map((c) => [c.channel.id, c]));
      const upcoming = upcomingPosts(s, 13, today);
      const goals = [...s.goals].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
      const campaigns = [...s.campaigns].sort((a, b) => (campaignRange(a).start ?? '9999').localeCompare(campaignRange(b).start ?? '9999'));
      const campName = new Map(s.campaigns.map((c) => [c.id, c]));
      const milestones = [...s.milestones].filter((x) => !x.done || (isISO(x.date) && x.date >= addDays(today, -14))).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
      const range = isISO(m.startDate) ? `${fmt.dateMedium(m.startDate)}${isISO(m.endDate) ? ` – ${fmt.dateMedium(m.endDate)}` : ''}` : '';
      const dateSpan = (a?: string, b?: string) => (a ? (b && b !== a ? `${stripYear(fmt.dateMedium(a))} – ${fmt.dateMedium(b)}` : fmt.dateMedium(a)) : '—');

      const stat = (key: string, v: string | number, sub?: string, alert?: boolean) => (
        <div className={`spo-stat ${alert ? 'alert' : ''}`} key={key}>
          <div className="k">{key}</div>
          <div className="v">{v}</div>
          {sub && <div className="s">{sub}</div>}
        </div>
      );

      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Space One-Sheet" subtitle={range || undefined} />

            <div className="spo-hero pp-avoid">
              <div className="spo-emoji" style={{ background: `${color}22`, color }}>
                {m.emoji || (m.title || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="spo-hero-main">
                <div className="spo-kicker">{typeLabel}</div>
                <h1 style={{ fontSize: '20pt', lineHeight: 1.15 }}>{m.title || 'Untitled Space'}</h1>
                {m.description ? <div className="spo-desc">{m.description}</div> : <div className="spo-desc pp-muted">No description yet.</div>}
                {s.strategy.tagline && <div className="spo-tagline">“{s.strategy.tagline}”</div>}
              </div>
            </div>

            <PSection title="At a glance" className="pp-avoid">
              <div className="spo-stats">
                {stat('Content', s.content.length, `${k.ideas} idea${k.ideas === 1 ? '' : 's'}`)}
                {stat('In progress', k.inProgress, 'writing → ready')}
                {stat('Published', k.published30, 'last 30 days')}
                {stat('Next 7 days', k.next7, `${k.next7Scheduled} scheduled`)}
                {stat('Overdue', k.overdue, 'posts', k.overdue > 0)}
                {stat('Goals', k.goalsTotal ? `${k.goalsOnTrack}/${k.goalsTotal}` : '—', 'on track')}
              </div>
            </PSection>

            <PSection title="Goals">
              <PTable
                rows={goals}
                empty="No goals set yet."
                columns={[
                  {
                    header: 'Goal',
                    cell: (g) => (
                      <>
                        <div className="pp-strong">{g.title || 'Untitled goal'}</div>
                        {g.metric && <div className="spo-sub">{g.metric}</div>}
                      </>
                    ),
                  },
                  {
                    header: 'Progress',
                    width: '28%',
                    cell: (g) => {
                      const p = goalProgress(g);
                      const c = optionColor(GOAL_STATUSES, g.status) ?? '#888';
                      return p == null ? (
                        <span className="pp-muted">—</span>
                      ) : (
                        <>
                          <span className="spo-bar">
                            <span style={{ width: `${Math.round(p * 100)}%`, background: c }} />
                          </span>
                          <div className="spo-pct">
                            {fmt.number(g.current)} / {fmt.number(g.target)} {g.unit ?? ''} · {Math.round(p * 100)}%
                          </div>
                        </>
                      );
                    },
                  },
                  { header: 'Due', width: '62pt', cell: (g) => (isISO(g.due) ? fmt.dateMedium(g.due) : '—') },
                  { header: 'Status', width: '62pt', cell: (g) => <PBadge color={optionColor(GOAL_STATUSES, g.status)}>{optionLabel(GOAL_STATUSES, g.status)}</PBadge> },
                ]}
              />
            </PSection>

            <div className="spo-two">
              <PSection title="Content pillars">
                <PTable
                  rows={s.pillars}
                  empty="No pillars defined."
                  columns={[
                    {
                      header: 'Pillar',
                      cell: (p) => (
                        <>
                          <div className="pp-strong">
                            <Dot color={p.color} />
                            {p.name || 'Pillar'}
                          </div>
                          {p.description && <div className="spo-sub">{p.description}</div>}
                        </>
                      ),
                    },
                    { header: 'Target', width: '38pt', num: true, cell: (p) => (p.targetShare != null ? `${p.targetShare}%` : '—') },
                    {
                      header: 'Actual',
                      width: '38pt',
                      num: true,
                      cell: (p) => (shares.total ? `${Math.round(((shares.counts[p.id] ?? 0) / shares.total) * 100)}%` : '—'),
                    },
                  ]}
                />
              </PSection>
              <PSection title="Channels & cadence" right={`week of ${stripYear(fmt.dateMedium(week))}`}>
                <PTable
                  rows={s.channels.filter((c) => c.active)}
                  empty="No active channels."
                  columns={[
                    {
                      header: 'Channel',
                      cell: (c) => (
                        <>
                          <div className="pp-strong">
                            <Dot color={channelColor(c)} />
                            {c.name || 'Channel'}
                          </div>
                          <div className="spo-sub">{[PLATFORM_BY_ID[c.platform]?.label, c.handle].filter(Boolean).join(' · ')}</div>
                        </>
                      ),
                    },
                    { header: 'Cadence', width: '52pt', cell: (c) => (c.cadence ? `${c.cadence} / ${c.cadenceUnit ?? 'week'}` : '—') },
                    {
                      header: 'This week',
                      width: '46pt',
                      num: true,
                      cell: (c) => {
                        const r = cadenceById.get(c.id);
                        if (!r) return '—';
                        const ok = r.target ? r.planned >= r.target : undefined;
                        return <span className={ok === undefined ? '' : ok ? 'spo-met' : 'spo-miss'}>{r.target ? `${r.planned}/${Number.isInteger(r.target) ? r.target : r.target.toFixed(1)}` : r.planned}</span>;
                      },
                    },
                  ]}
                />
              </PSection>
            </div>

            <PSection title="Content pipeline" right={`${s.content.length} pieces`} className="pp-avoid">
              <div className="spo-pipe">
                {STAGES.map((st) => (
                  <div key={st.value} className="spo-stage" style={{ borderTopColor: st.color }}>
                    <div className="n">{stages[st.value] ?? 0}</div>
                    <div className="l">{st.label}</div>
                  </div>
                ))}
              </div>
            </PSection>

            {options.showUpcoming && (
              <PSection title="Coming up — next 14 days" right={`${upcoming.length} posts`}>
                <PTable
                  rows={upcoming}
                  empty="Nothing scheduled in the next two weeks."
                  groupBy={(r) => r.post.date ?? ''}
                  groupLabel={(d, rows) => `${fmt.dateLong(d)} · ${rows.length} post${rows.length === 1 ? '' : 's'}`}
                  columns={[
                    { header: 'Time', width: '46pt', cell: (r) => (r.post.time ? fmt.time(r.post.time) : '—') },
                    {
                      header: 'Channel',
                      width: '92pt',
                      cell: (r) => (
                        <>
                          <Dot color={channelColor(r.channel)} />
                          {r.channel?.name ?? 'No channel'}
                        </>
                      ),
                    },
                    { header: 'Content', cell: (r) => <span className="pp-strong">{r.content.title || 'Untitled content'}</span> },
                    { header: 'Format', width: '72pt', cell: (r) => FORMAT_BY_ID[r.content.format]?.label ?? r.content.format },
                    { header: 'Stage', width: '54pt', cell: (r) => <PBadge color={STAGE_BY_ID[r.content.stage]?.color}>{STAGE_BY_ID[r.content.stage]?.label ?? r.content.stage}</PBadge> },
                    { header: 'Status', width: '54pt', cell: (r) => <PBadge color={optionColor(POST_STATUSES, r.post.status)}>{optionLabel(POST_STATUSES, r.post.status)}</PBadge> },
                  ]}
                />
              </PSection>
            )}

            {options.showCampaigns && (s.campaigns.length > 0 || s.milestones.length > 0) && (
              <div className="spo-two">
                <PSection title="Campaigns">
                  <PTable
                    rows={campaigns}
                    empty="No campaigns."
                    columns={[
                      {
                        header: 'Campaign',
                        cell: (c) => (
                          <>
                            <div className="pp-strong">
                              <Dot color={c.color || '#7c5cff'} />
                              {c.name || 'Campaign'}
                              {isActiveCampaign(c, today) ? ' · now' : ''}
                            </div>
                            {c.objective && <div className="spo-sub">{c.objective}</div>}
                          </>
                        ),
                      },
                      { header: 'Dates', width: '84pt', cell: (c) => dateSpan(campaignRange(c).start, campaignRange(c).end) },
                      { header: 'Status', width: '50pt', cell: (c) => <PBadge color={optionColor(CAMPAIGN_STATUSES, c.status)}>{optionLabel(CAMPAIGN_STATUSES, c.status)}</PBadge> },
                    ]}
                  />
                </PSection>
                <PSection title="Milestones">
                  <PTable
                    rows={milestones}
                    empty="No open milestones."
                    columns={[
                      { header: '', width: '12pt', cell: (x) => <Check on={x.done} /> },
                      { header: 'Date', width: '58pt', cell: (x) => (isISO(x.date) ? stripYear(fmt.dateMedium(x.date)) : '—') },
                      {
                        header: 'Milestone',
                        cell: (x) => (
                          <>
                            <span className={x.done ? 'spo-done' : 'pp-strong'}>{x.name || 'Milestone'}</span>
                            {x.campaignId && campName.get(x.campaignId) && <div className="spo-sub">{campName.get(x.campaignId)!.name}</div>}
                          </>
                        ),
                      },
                    ]}
                  />
                </PSection>
              </div>
            )}

            {options.showNotes && s.notes?.trim() && (
              <PSection title="Notes">
                <Pre>{s.notes}</Pre>
              </PSection>
            )}
          </>
        ),
      };
    },
  },
];
