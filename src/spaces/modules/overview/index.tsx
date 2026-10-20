/* Overview — the dashboard of a Marketing Space: getting-started checklist,
   KPIs, what's coming up, the content pipeline, goals, campaigns &
   milestones, channel cadence this week, things that need attention,
   linked productions and space notes. */
import './overview.css';
import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Diamond,
  FileText,
  Flag,
  FolderKanban,
  Lightbulb,
  Link2,
  Megaphone,
  Plus,
  Printer,
  Radio,
  Send,
  Target,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ContentPiece } from '@/spaces/types';
import { FORMAT_BY_ID, GOAL_STATUSES, POST_STATUSES, SPACE_TYPES, STAGES, STAGE_BY_ID } from '@/spaces/constants';
import { atRiskContent, cadenceForWeek, channelColor, countByStage, firstPostDate, goalProgress, overduePosts, upcomingPosts, weekStart } from '@/spaces/derive';
import { makeContent } from '@/spaces/defaults';
import { openContent, useProjectList } from '@/spaces/ui';
import { updateSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace, openPrint, readLS, writeLS } from '@/store/app';
import { PROJECT_STATUSES, optionColor, optionLabel } from '@/lib/constants';
import { addDays, todayISO } from '@/lib/dates';
import { backend } from '@/backend';
import { Badge, Button, Card, IconButton, ModuleHeader, Progress, Stat, StatusBadge, Textarea, toast } from '@/ui';
import {
  activeCampaigns,
  campaignElapsed,
  campaignRange,
  dayHeading,
  groupByDate,
  isISO,
  nextCampaign,
  overdueMilestones,
  plural,
  relativeDay,
  spaceKpis,
  startSteps,
  stripYear,
  tabForStage,
  upcomingMilestones,
  type StartStep,
} from './derive';

/* ======================================================================== helpers */

function newContent(patch: Partial<ContentPiece> = {}) {
  const c = makeContent(patch);
  updateSpace((d) => {
    d.content.push(c);
  });
  openContent(c.id);
}

function FormatIcon({ format, size = 14 }: { format: ContentPiece['format']; size?: number }) {
  const def = FORMAT_BY_ID[format];
  const Icon = def?.icon ?? FileText;
  return (
    <span className="sp-overview-fmt" title={def?.label ?? 'Content'}>
      <Icon size={size} />
    </span>
  );
}

function Empty({ icon: Icon, children, action }: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="sp-overview-empty">
      <span className="sp-overview-empty-icon">
        <Icon size={16} />
      </span>
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}

/* ======================================================================== screen */

export default function SpaceOverview() {
  const meta = useSpace((s) => s.meta);
  const typeDef = SPACE_TYPES.find((t) => t.value === meta?.type);
  const color = meta?.color || '#7c5cff';
  const title = meta?.title || 'Untitled Space';

  return (
    <div className="module">
      <ModuleHeader
        title={
          <span className="sp-overview-title">
            <span className="sp-overview-emoji" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>
              {meta?.emoji || title.slice(0, 1).toUpperCase()}
            </span>
            {title}
          </span>
        }
        subtitle={
          <span title={meta?.description || undefined}>
            {typeDef?.label ?? 'Marketing space'}
            {meta?.description ? ` · ${meta.description}` : ''}
          </span>
        }
        actions={
          <>
            <Button icon={Printer} onClick={() => openPrint('space-overview')} title="Print or save the space one-sheet as PDF">
              One-sheet
            </Button>
            <Button icon={CalendarDays} onClick={() => navigateSpace('calendar')}>
              Calendar
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => newContent()}>
              New content
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="sp-overview-page">
          <GettingStarted />
          <KpiRow />
          <PipelineCard />
          <div className="sp-overview-columns">
            <div className="sp-overview-stack">
              <ComingUpCard />
              <GoalsCard />
              <NotesCard />
            </div>
            <div className="sp-overview-stack">
              <AttentionCard />
              <CadenceCard />
              <CampaignsCard />
              <ProjectsCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== getting started */

function goStep(id: StartStep['id']) {
  if (id === 'channels') navigateSpace('channels');
  else if (id === 'pillars') navigateSpace('strategy', { tab: 'pillars' });
  else if (id === 'goal') navigateSpace('strategy', { tab: 'goals' });
  else if (id === 'ideas') navigateSpace('ideas');
  else navigateSpace('calendar');
}

function GettingStarted() {
  const spaceId = useSpace((s) => s.id);
  const channels = useSpace((s) => s.channels);
  const pillars = useSpace((s) => s.pillars);
  const goals = useSpace((s) => s.goals);
  const mind = useSpace((s) => s.mind);
  const content = useSpace((s) => s.content);
  const key = `prepro.spaceOverview.hideStart.${spaceId}`;
  const [hidden, setHidden] = useState(() => readLS<boolean>(key, false));
  const steps = useMemo(() => startSteps({ channels, pillars, goals, mind, content }), [channels, pillars, goals, mind, content]);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <section className="sp-overview-start card">
      <div className="sp-overview-start-head">
        <div className="grow">
          <h2>Get this space going</h2>
          <div className="muted small">
            {done === 0 ? 'Five quick steps to a strategy you can post from.' : `${done} of ${steps.length} done — next: ${next?.label.toLowerCase()}.`}
          </div>
        </div>
        <div className="sp-overview-start-meter" title={`${done} of ${steps.length} done`}>
          <Progress value={done / steps.length} color="var(--success)" />
          <span>
            {done}/{steps.length}
          </span>
        </div>
        <IconButton
          icon={X}
          label="Hide checklist"
          size="sm"
          onClick={() => {
            writeLS(key, true);
            setHidden(true);
            toast('Checklist hidden', 'info', {
              action: {
                label: 'Undo',
                onClick: () => {
                  writeLS(key, false);
                  setHidden(false);
                },
              },
            });
          }}
        />
      </div>
      <div className="sp-overview-steps">
        {steps.map((s, i) => (
          <div key={s.id} className={`sp-overview-step ${s.done ? 'done' : ''} ${s === next ? 'next' : ''}`}>
            <div className="sp-overview-step-top">
              <span className="sp-overview-step-num">{s.done ? <Check size={13} /> : i + 1}</span>
              <b>{s.label}</b>
            </div>
            <p>{s.detail}</p>
            <Button size="sm" variant={s === next ? 'primary' : s.done ? 'ghost' : 'default'} iconRight={ChevronRight} onClick={() => goStep(s.id)}>
              {s.done ? 'Review' : s.action}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ======================================================================== KPIs */

function Tile({ icon: Icon, label, value, sub, tone, progress, onClick, title }: { icon: LucideIcon; label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'success' | 'warning'; progress?: number; onClick: () => void; title?: string }) {
  return (
    <button type="button" className={`sp-overview-tile ${tone ?? ''}`} onClick={onClick} title={title}>
      <Stat
        label={
          <span className="sp-overview-tile-label">
            <Icon size={14} />
            {label}
            <ChevronRight size={13} className="sp-overview-tile-go" />
          </span>
        }
        value={value}
        sub={
          <>
            <span className="sp-overview-tile-sub">{sub}</span>
            {progress != null && (
              <span className="sp-overview-bar">
                <span style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
              </span>
            )}
          </>
        }
      />
    </button>
  );
}

function KpiRow() {
  const content = useSpace((s) => s.content);
  const channels = useSpace((s) => s.channels);
  const goals = useSpace((s) => s.goals);
  const today = todayISO();
  const k = useMemo(() => spaceKpis({ content, channels, goals }, today), [content, channels, goals, today]);
  const drafts = k.next7 - k.next7Scheduled;
  return (
    <section className="sp-overview-tiles">
      <Tile
        icon={FolderKanban}
        label="In progress"
        value={k.inProgress}
        sub={content.length ? `${plural(k.ideas, 'idea')} waiting · ${content.length} total` : 'No content yet'}
        onClick={() => navigateSpace('content')}
        title="Pieces between writing and ready"
      />
      <Tile
        icon={Send}
        label="Published · 30 days"
        value={k.published30}
        sub={k.published30 ? 'posts went live' : 'Nothing published yet'}
        onClick={() => navigateSpace('results')}
        tone={k.published30 > 0 ? 'success' : undefined}
      />
      <Tile
        icon={CalendarDays}
        label="Next 7 days"
        value={k.next7}
        sub={k.next7 ? `${k.next7Scheduled} scheduled${drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}` : 'No posts planned'}
        progress={k.next7 ? k.next7Scheduled / k.next7 : undefined}
        onClick={() => navigateSpace('calendar')}
      />
      <Tile
        icon={Clock}
        label="Overdue posts"
        value={k.overdue}
        sub={k.overdue ? 'past date, not published' : 'All caught up'}
        tone={k.overdue ? 'danger' : undefined}
        onClick={() => navigateSpace('calendar')}
      />
      <Tile
        icon={Target}
        label="Goals on track"
        value={k.goalsTotal ? `${k.goalsOnTrack}/${k.goalsTotal}` : '—'}
        sub={k.goalsTotal ? (k.goalsAtRisk ? `${k.goalsAtRisk} at risk or off track` : 'none at risk') : 'No goals yet'}
        progress={k.goalsTotal ? k.goalsOnTrack / k.goalsTotal : undefined}
        tone={k.goalsAtRisk ? 'warning' : undefined}
        onClick={() => navigateSpace('strategy', { tab: 'goals' })}
      />
    </section>
  );
}

/* ======================================================================== pipeline */

function PipelineCard() {
  const content = useSpace((s) => s.content);
  const counts = useMemo(() => countByStage(content), [content]);
  const total = content.length;
  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Content pipeline <span className="muted small">{plural(total, 'piece')}</span>
        </span>
      }
      actions={
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => navigateSpace('content')}>
          Content board
        </Button>
      }
    >
      {total > 0 && (
        <div className="sp-overview-pipe-bar" aria-hidden>
          {STAGES.map((st) =>
            counts[st.value] ? <span key={st.value} style={{ flexGrow: counts[st.value], background: st.color }} title={`${st.label}: ${counts[st.value]}`} /> : null,
          )}
        </div>
      )}
      <div className="sp-overview-pipe">
        {STAGES.map((st) => (
          <button
            key={st.value}
            type="button"
            className={`sp-overview-stage ${counts[st.value] ? '' : 'zero'}`}
            style={{ ['--st' as string]: st.color }}
            onClick={() => navigateSpace('content', { stage: st.value })}
            title={st.hint}
          >
            <span className="n">{counts[st.value] ?? 0}</span>
            <span className="l">{st.label}</span>
          </button>
        ))}
      </div>
      {total === 0 && (
        <div className="sp-overview-pipe-empty">
          <span className="muted small">Nothing in the pipeline yet — every piece moves from idea to published here.</span>
          <Button size="sm" icon={Lightbulb} onClick={() => newContent({ stage: 'idea', title: 'New idea' })}>
            Add first idea
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== coming up */

const MAX_ROWS = 18;

function ComingUpCard() {
  const content = useSpace((s) => s.content);
  const channels = useSpace((s) => s.channels);
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const [showAll, setShowAll] = useState(false);
  const upcoming = useMemo(() => upcomingPosts({ content, channels }, 13, today), [content, channels, today]);
  const shown = showAll ? upcoming : upcoming.slice(0, MAX_ROWS);
  const groups = useMemo(() => groupByDate(shown), [shown]);

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Coming up <span className="muted small">next 14 days</span>
        </span>
      }
      actions={
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => navigateSpace('calendar')}>
          Calendar
        </Button>
      }
      padded={false}
    >
      {upcoming.length === 0 ? (
        <div className="sp-overview-coming-empty">
          <CalendarDays size={22} />
          <b>Nothing scheduled in the next two weeks</b>
          <span className="muted small">
            {channels.length === 0 ? 'Add the channels you publish on, then plan posts on the calendar.' : 'Give a content piece a date and channel to see it here.'}
          </span>
          <div className="row" style={{ marginTop: 6 }}>
            {channels.length === 0 ? (
              <Button size="sm" variant="primary" icon={Radio} onClick={() => navigateSpace('channels')}>
                Add channels
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={CalendarDays} onClick={() => navigateSpace('calendar')}>
                Plan posts
              </Button>
            )}
            <Button size="sm" icon={Plus} onClick={() => newContent()}>
              New content
            </Button>
          </div>
        </div>
      ) : (
        <div className="sp-overview-agenda">
          {groups.map(([date, rows]) => (
            <div key={date} className="sp-overview-day">
              <div className={`sp-overview-day-head ${date === today ? 'today' : ''}`}>
                <b>{dayHeading(date, today)}</b>
                <span>{stripYear(fmt.dateMedium(date))}</span>
                <span className="spacer" />
                <span className="muted tiny">{plural(rows.length, 'post')}</span>
              </div>
              {rows.map((r) => {
                const stage = STAGE_BY_ID[r.content.stage];
                const notReady = r.content.stage !== 'ready' && r.content.stage !== 'published';
                return (
                  <button key={r.post.id} type="button" className="sp-overview-post" onClick={() => openContent(r.content.id, 'publish')} title="Open the post in the content editor">
                    <span className="sp-overview-post-time">{r.post.time ? fmt.time(r.post.time) : '—'}</span>
                    <span className="sp-overview-post-ch">
                      <span className="color-dot" style={{ background: channelColor(r.channel) }} />
                      <span className="ellipsis">{r.channel?.name ?? 'No channel'}</span>
                    </span>
                    <FormatIcon format={r.content.format} />
                    <span className="sp-overview-post-title ellipsis">{r.content.title || 'Untitled content'}</span>
                    {notReady && stage && (
                      <span className="sp-overview-stage-chip" style={{ ['--st' as string]: stage.color }} title={`Content stage: ${stage.label}`}>
                        {stage.label}
                      </span>
                    )}
                    <StatusBadge value={r.post.status} options={POST_STATUSES} />
                  </button>
                );
              })}
            </div>
          ))}
          {upcoming.length > MAX_ROWS && (
            <button type="button" className="sp-overview-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${upcoming.length} posts`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== goals */

function GoalsCard() {
  const goals = useSpace((s) => s.goals);
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const sorted = useMemo(
    () => [...(goals ?? [])].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due ?? '9999').localeCompare(b.due ?? '9999')),
    [goals],
  );
  const goGoals = () => navigateSpace('strategy', { tab: 'goals' });
  return (
    <Card
      title="Goals"
      actions={
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={goGoals}>
          Strategy
        </Button>
      }
      padded={false}
    >
      {sorted.length === 0 ? (
        <Empty
          icon={Target}
          action={
            <Button size="sm" icon={Plus} onClick={goGoals}>
              Set a goal
            </Button>
          }
        >
          No goals yet. Pick one number that tells you this is working.
        </Empty>
      ) : (
        <div className="sp-overview-goals">
          {sorted.map((g) => {
            const p = goalProgress(g);
            const color = optionColor(GOAL_STATUSES, g.status) ?? '#888';
            const overdue = g.status !== 'done' && isISO(g.due) && g.due < today;
            return (
              <button key={g.id} type="button" className="sp-overview-goal" onClick={goGoals}>
                <div className="sp-overview-goal-top">
                  <span className="color-dot" style={{ background: color }} title={optionLabel(GOAL_STATUSES, g.status)} />
                  <span className="sp-overview-goal-title ellipsis">{g.title || 'Untitled goal'}</span>
                  {isISO(g.due) && (
                    <span className={`sp-overview-due ${overdue ? 'overdue' : ''}`} title={fmt.dateLong(g.due)}>
                      {overdue ? `Overdue · ${stripYear(fmt.dateMedium(g.due))}` : `Due ${stripYear(fmt.dateMedium(g.due))}`}
                    </span>
                  )}
                </div>
                <Progress value={p ?? 0} color={color} />
                <div className="sp-overview-goal-meta">
                  {p != null ? (
                    <>
                      <b>{fmt.number(g.current)}</b> / {fmt.number(g.target)} {g.unit ?? ''}
                      <span className="spacer" />
                      <span style={{ color }}>{Math.round(p * 100)}%</span>
                    </>
                  ) : (
                    <span className="muted">{g.metric ? `${g.metric} · ` : ''}add a current value and target to track progress</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== attention */

function markPublished(contentId: string, postId: string) {
  updateSpace((d) => {
    const post = d.content.find((c) => c.id === contentId)?.posts.find((p) => p.id === postId);
    if (post) post.status = 'published';
  });
  toast('Marked as published');
}

function AttentionCard() {
  const content = useSpace((s) => s.content);
  const channels = useSpace((s) => s.channels);
  const milestones = useSpace((s) => s.milestones);
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const overdue = useMemo(() => overduePosts({ content, channels }, today), [content, channels, today]);
  const atRisk = useMemo(() => atRiskContent({ content }, 7, today), [content, today]);
  const lateMs = useMemo(() => overdueMilestones(milestones ?? [], today), [milestones, today]);
  const count = overdue.length + atRisk.length + lateMs.length;
  if (content.length === 0 && lateMs.length === 0) return null;

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Needs attention {count > 0 && <Badge tone="danger">{count}</Badge>}
        </span>
      }
      padded={false}
    >
      {count === 0 ? (
        <Empty icon={CircleCheck}>All clear — nothing overdue or at risk this week.</Empty>
      ) : (
        <div className="sp-overview-attn">
          {overdue.map((r) => (
            <div key={r.post.id} className="sp-overview-attn-row danger">
              <Clock size={15} className="sp-overview-attn-icon" />
              <button type="button" className="sp-overview-attn-main" onClick={() => openContent(r.content.id, 'publish')}>
                <span className="ellipsis strong">{r.content.title || 'Untitled content'}</span>
                <span className="sp-overview-attn-sub">
                  <span className="color-dot" style={{ background: channelColor(r.channel) }} />
                  {r.channel?.name ?? 'No channel'} · was due {stripYear(fmt.dateMedium(r.post.date))} ({relativeDay(r.post.date!, today)})
                </span>
              </button>
              <IconButton icon={Check} size="sm" label="Mark as published" onClick={() => markPublished(r.content.id, r.post.id)} />
              <Button size="sm" onClick={() => openContent(r.content.id, 'publish')}>
                Open
              </Button>
            </div>
          ))}
          {atRisk.map((c) => {
            const st = STAGE_BY_ID[c.stage];
            const next = c.posts
              .filter((p) => p.status !== 'skipped' && isISO(p.date) && p.date >= today)
              .map((p) => p.date!)
              .sort()[0] ?? firstPostDate(c);
            return (
              <div key={c.id} className="sp-overview-attn-row warning">
                <TriangleAlert size={15} className="sp-overview-attn-icon" />
                <button type="button" className="sp-overview-attn-main" onClick={() => openContent(c.id, tabForStage(c.stage))}>
                  <span className="ellipsis strong">{c.title || 'Untitled content'}</span>
                  <span className="sp-overview-attn-sub">
                    Still {st?.label.toLowerCase() ?? c.stage}
                    {next ? ` · posts ${relativeDay(next, today).toLowerCase()}` : ''}
                  </span>
                </button>
                <Button size="sm" onClick={() => openContent(c.id, tabForStage(c.stage))}>
                  Open
                </Button>
              </div>
            );
          })}
          {lateMs.map((m) => (
            <div key={m.id} className="sp-overview-attn-row danger">
              <Flag size={15} className="sp-overview-attn-icon" />
              <button type="button" className="sp-overview-attn-main" onClick={() => navigateSpace('campaigns')}>
                <span className="ellipsis strong">{m.name || 'Milestone'}</span>
                <span className="sp-overview-attn-sub">
                  Milestone · {stripYear(fmt.dateMedium(m.date))} ({relativeDay(m.date!, today)}) · not marked done
                </span>
              </button>
              <IconButton
                icon={Check}
                size="sm"
                label="Mark milestone done"
                onClick={() =>
                  updateSpace((d) => {
                    const x = d.milestones.find((y) => y.id === m.id);
                    if (x) x.done = true;
                  })
                }
              />
              <Button size="sm" onClick={() => navigateSpace('campaigns')}>
                Open
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== cadence */

function fmtTarget(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function CadenceCard() {
  const content = useSpace((s) => s.content);
  const channels = useSpace((s) => s.channels);
  const mondayFirst = useSpace((s) => s.settings?.weekStartsMonday ?? true);
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const start = weekStart(today, mondayFirst);
  const rows = useMemo(() => cadenceForWeek({ content, channels }, start), [content, channels, start]);
  const withTarget = rows.filter((r) => r.target);
  const met = withTarget.filter((r) => r.planned >= (r.target ?? 0)).length;

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          This week <span className="muted small">{`${stripYear(fmt.dateMedium(start))} – ${stripYear(fmt.dateMedium(addDays(start, 6)))}`}</span>
        </span>
      }
      actions={withTarget.length > 0 ? <span className={`sp-overview-met ${met === withTarget.length ? 'ok' : ''}`}>{`${met}/${withTarget.length} on target`}</span> : undefined}
      padded={false}
    >
      {rows.length === 0 ? (
        <Empty
          icon={Radio}
          action={
            <Button size="sm" icon={Plus} onClick={() => navigateSpace('channels')}>
              Add channels
            </Button>
          }
        >
          {channels.length ? 'All channels are paused.' : 'No channels yet. Add where you publish and how often.'}
        </Empty>
      ) : (
        <div className="sp-overview-cadence">
          {rows.map(({ channel, planned, target }) => {
            const ok = !!target && planned >= target;
            const pct = target ? Math.min(1, planned / target) : planned > 0 ? 1 : 0;
            const c = channelColor(channel);
            return (
              <button key={channel.id} type="button" className={`sp-overview-cad ${ok ? 'ok' : ''}`} onClick={() => navigateSpace('calendar', { date: start })} title="Open this week in the calendar">
                <span className="color-dot" style={{ background: c }} />
                <span className="sp-overview-cad-name ellipsis">{channel.name || 'Channel'}</span>
                <span className="sp-overview-cad-bar">
                  <span style={{ width: `${Math.round(pct * 100)}%`, background: ok ? 'var(--success)' : c }} />
                </span>
                <span className="sp-overview-cad-num">
                  {ok && <Check size={12} />}
                  <b>{planned}</b>
                  {target ? <span className="muted">/{fmtTarget(target)}</span> : <span className="muted"> planned</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== campaigns & milestones */

function CampaignsCard() {
  const campaigns = useSpace((s) => s.campaigns);
  const milestones = useSpace((s) => s.milestones);
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const active = useMemo(() => activeCampaigns(campaigns ?? [], today), [campaigns, today]);
  const upcoming = useMemo(() => nextCampaign(campaigns ?? [], today), [campaigns, today]);
  const nextMs = useMemo(() => upcomingMilestones(milestones ?? [], today, 5), [milestones, today]);
  const campById = useMemo(() => new Map((campaigns ?? []).map((c) => [c.id, c])), [campaigns]);
  const go = () => navigateSpace('campaigns');
  const empty = (campaigns ?? []).length === 0 && (milestones ?? []).length === 0;

  return (
    <Card
      title="Campaigns & milestones"
      actions={
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={go}>
          Roadmap
        </Button>
      }
      padded={false}
    >
      {empty ? (
        <Empty
          icon={Megaphone}
          action={
            <Button size="sm" icon={Plus} onClick={go}>
              Plan a campaign
            </Button>
          }
        >
          No campaigns yet — map out a launch, a trailer week or a festival run.
        </Empty>
      ) : (
        <>
          {active.length > 0 ? (
            <div className="sp-overview-camps">
              {active.map((c) => {
                const e = campaignElapsed(c, today);
                const end = campaignRange(c).end!;
                const left = e.days - e.day;
                return (
                  <button key={c.id} type="button" className="sp-overview-camp" style={{ ['--cc' as string]: c.color || 'var(--accent)' }} onClick={() => navigateSpace('campaigns', { campaignId: c.id })}>
                    <div className="sp-overview-camp-top">
                      <b className="ellipsis">{c.name || 'Campaign'}</b>
                      <span className="spacer" />
                      <span className="muted tiny nowrap">
                        Day {e.day} of {e.days}
                      </span>
                    </div>
                    <span className="sp-overview-camp-bar">
                      <span style={{ width: `${Math.round(e.pct * 100)}%` }} />
                    </span>
                    <div className="sp-overview-camp-sub">
                      {c.objective ? <span className="ellipsis">{c.objective}</span> : <span className="muted">Active</span>}
                      <span className="spacer" />
                      <span className="nowrap">{left === 0 ? 'Ends today' : `Ends ${stripYear(fmt.dateMedium(end))} · ${plural(left, 'day')} left`}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="sp-overview-camp-none">
              <Megaphone size={15} />
              {upcoming ? (
                <span>
                  No campaign running. <b>{upcoming.name || 'Next campaign'}</b> starts {relativeDay(campaignRange(upcoming).start!, today).toLowerCase()}.
                </span>
              ) : (
                <span>No campaign running right now.</span>
              )}
            </div>
          )}
          <div className="sp-overview-subhead">Next milestones</div>
          {nextMs.length === 0 ? (
            <div className="sp-overview-camp-none muted">
              <Flag size={14} /> No upcoming milestones.
            </div>
          ) : (
            <div className="sp-overview-ms-list">
              {nextMs.map((m) => {
                const camp = m.campaignId ? campById.get(m.campaignId) : undefined;
                const soon = diffSoon(m.date!, today);
                return (
                  <button key={m.id} type="button" className="sp-overview-ms" onClick={() => navigateSpace('campaigns', camp ? { campaignId: camp.id } : {})}>
                    <Diamond size={13} className="sp-overview-ms-icon" style={{ color: camp?.color || 'var(--accent)', fill: camp?.color || 'var(--accent)' }} />
                    <span className="grow ellipsis">
                      {m.name || 'Milestone'}
                      {camp && <span className="muted"> · {camp.name}</span>}
                    </span>
                    <span className="muted small nowrap">{stripYear(fmt.dateMedium(m.date))}</span>
                    <span className={`sp-overview-due ${soon ? 'soon' : ''}`}>{relativeDay(m.date!, today)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function diffSoon(date: string, today: string): boolean {
  return date <= addDays(today, 3);
}

/* ======================================================================== linked projects */

function ProjectsCard() {
  const projectIds = useSpace((s) => s.projectIds);
  const all = useProjectList();
  const linked = useMemo(() => {
    const byId = new Map(all.map((p) => [p.id, p]));
    return (projectIds ?? []).map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }, [all, projectIds]);
  const go = () => navigateSpace('projects');

  return (
    <Card
      title="Linked productions"
      actions={
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={go}>
          Manage
        </Button>
      }
      padded={false}
    >
      {linked.length === 0 ? (
        <Empty
          icon={Link2}
          action={
            <Button size="sm" icon={Link2} onClick={go}>
              Link a project
            </Button>
          }
        >
          Link the film or video this space promotes to pull in its trailer, stills and dates.
        </Empty>
      ) : (
        <div className="sp-overview-projects">
          {linked.map((p) => {
            const poster = p.poster ? backend.assetUrl(p.id, p.poster) : '';
            const sc = optionColor(PROJECT_STATUSES, p.status) ?? '#888';
            return (
              <button key={p.id} type="button" className="sp-overview-project" onClick={go} title={`${p.title} — ${optionLabel(PROJECT_STATUSES, p.status)}`}>
                <span className="sp-overview-project-thumb" style={{ background: p.color || 'var(--accent)' }}>
                  {poster ? <img src={poster} alt="" draggable={false} /> : (p.title || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="sp-overview-project-text">
                  <b className="ellipsis">{p.title || 'Untitled project'}</b>
                  <span className="tiny" style={{ color: sc }}>
                    {optionLabel(PROJECT_STATUSES, p.status)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== notes */

function NotesCard() {
  const notes = useSpace((s) => s.notes);
  return (
    <Card title="Space notes" actions={<span className="muted tiny">Saved automatically</span>}>
      <Textarea
        className="sp-overview-notes"
        autoGrow
        minRows={5}
        value={notes ?? ''}
        placeholder="Collab agreements, posting rules, useful links, what worked last time…"
        onChange={(v) =>
          updateSpace(
            (d) => {
              d.notes = v;
            },
            { coalesce: 'overview:notes' },
          )
        }
        aria-label="Space notes"
      />
    </Card>
  );
}

