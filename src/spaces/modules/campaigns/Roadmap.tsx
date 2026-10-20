/* Campaign roadmap: horizontal timeline with a months header, a today line,
   one bar per campaign, milestones as diamonds and the campaign's posts as
   small dots (coloured by channel). */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Flag, Map as MapIcon, Plus, Rocket } from 'lucide-react';
import type { Campaign, Channel, ContentPiece, SpaceMilestone } from '@/spaces/types';
import { channelColor } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { useSpaceFormatters } from '@/store/space';
import { readLS, writeLS } from '@/store/app';
import { MONTHS_LONG, MONTHS_SHORT, addDays, diffDays, parseISODate, toISODate, todayISO } from '@/lib/dates';
import { Button, Card, EmptyState, Tabs, type AnchorRect } from '@/ui';
import { campaignRange, isISO, readableOn, sortCampaigns, stripYear } from './shared';

type Zoom = 'week' | 'month' | 'quarter';
const PPD: Record<Zoom, number> = { week: 30, month: 12, quarter: 4.5 };
const ROW_H = 60;
const HEAD_H = 38;
/** lanes inside a campaign row: milestones on top, the bar, posts underneath */
const MS_TOP = 3;
const BAR_TOP = 19;
const BAR_H = 22;
const DOT_TOP = BAR_TOP + BAR_H + 4;
const LABEL_W = 210;

interface PostDot {
  key: string;
  date: string;
  color: string;
  title: string;
  contentId: string;
}

type Row = { kind: 'campaign'; c: Campaign; start: string; end: string; ms: SpaceMilestone[]; posts: Map<string, PostDot[]> } | { kind: 'loose'; ms: SpaceMilestone[] };

function firstOfMonth(iso: string): string {
  const d = parseISODate(iso)!;
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

function endOfMonth(iso: string): string {
  const d = parseISODate(iso)!;
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

function buildModel(campaigns: Campaign[], milestones: SpaceMilestone[], content: ContentPiece[], channels: Channel[], today: string, mondayFirst: boolean) {
  const chById = new Map(channels.map((c) => [c.id, c]));
  const scheduled = sortCampaigns(campaigns).filter((c) => campaignRange(c).start);
  const unscheduled = campaigns.filter((c) => !campaignRange(c).start);
  const schedIds = new Set(scheduled.map((c) => c.id));
  const dates: string[] = [];

  const rows: Row[] = scheduled.map((c) => {
    const { start, end } = campaignRange(c) as { start: string; end: string };
    dates.push(start, end);
    const ms = milestones.filter((m) => m.campaignId === c.id && isISO(m.date));
    for (const m of ms) dates.push(m.date!);
    const posts = new Map<string, PostDot[]>();
    for (const piece of content) {
      if (piece.campaignId !== c.id) continue;
      for (const p of piece.posts) {
        if (!isISO(p.date) || p.status === 'skipped') continue;
        dates.push(p.date);
        const ch = chById.get(p.channelId);
        const dot: PostDot = { key: p.id, date: p.date, color: channelColor(ch), title: `${piece.title || 'Untitled content'} · ${ch?.name ?? 'No channel'}`, contentId: piece.id };
        const list = posts.get(p.date);
        if (list) list.push(dot);
        else posts.set(p.date, [dot]);
      }
    }
    return { kind: 'campaign', c, start, end, ms, posts };
  });
  const loose = milestones.filter((m) => isISO(m.date) && (!m.campaignId || !schedIds.has(m.campaignId)));
  for (const m of loose) dates.push(m.date!);
  if (loose.length) rows.push({ kind: 'loose', ms: [...loose].sort((a, b) => a.date!.localeCompare(b.date!)) });

  const sorted = [...dates, today].sort();
  let start = firstOfMonth(addDays(sorted[0], -7));
  let end = endOfMonth(addDays(sorted[sorted.length - 1], 14));
  if (diffDays(start, end) < 90) end = endOfMonth(addDays(start, 90));
  if (diffDays(start, end) > 1100) start = firstOfMonth(addDays(end, -1100));
  const days = diffDays(start, end) + 1;

  // first week start inside the range
  let wk = start;
  for (let i = 0; i < 7; i++) {
    const dow = parseISODate(wk)!.getDay();
    if (mondayFirst ? dow === 1 : dow === 0) break;
    wk = addDays(wk, 1);
  }
  return { start, end, days, rows, unscheduled, firstWeek: wk, hasAnything: rows.length > 0 };
}

export function RoadmapCard({
  campaigns,
  milestones,
  content,
  channels,
  mondayFirst,
  selectedId,
  onSelect,
  onEditMilestone,
  onNewCampaign,
  onPhases,
}: {
  campaigns: Campaign[];
  milestones: SpaceMilestone[];
  content: ContentPiece[];
  channels: Channel[];
  mondayFirst: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEditMilestone: (id: string, anchor: AnchorRect) => void;
  onNewCampaign: () => void;
  onPhases: () => void;
}) {
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const [zoom, setZoomState] = useState<Zoom>(() => {
    const z = readLS<Zoom>('prepro.spaceCampaigns.zoom', 'month');
    return z in PPD ? z : 'month';
  });
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    writeLS('prepro.spaceCampaigns.zoom', z);
  };
  const ppd = PPD[zoom];
  const model = useMemo(() => buildModel(campaigns, milestones, content, channels, today, mondayFirst), [campaigns, milestones, content, channels, today, mondayFirst]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const x = (iso: string) => diffDays(model.start, iso) * ppd;
  const width = model.days * ppd;
  const todayIn = today >= model.start && today <= model.end;

  const months = useMemo(() => {
    const out: { key: string; label: string; x: number; w: number }[] = [];
    let m = model.start;
    let first = true;
    while (m <= model.end) {
      const d = parseISODate(m)!;
      const last = endOfMonth(m) < model.end ? endOfMonth(m) : model.end;
      const days = diffDays(m, last) + 1;
      const name = zoom === 'quarter' ? MONTHS_SHORT[d.getMonth()] : MONTHS_LONG[d.getMonth()];
      out.push({ key: m, label: first || d.getMonth() === 0 ? `${name} ${d.getFullYear()}` : name, x: diffDays(model.start, m) * ppd, w: days * ppd });
      first = false;
      m = addDays(last, 1);
    }
    return out;
  }, [model.start, model.end, ppd, zoom]);

  const weeks = useMemo(() => {
    const out: string[] = [];
    for (let w = model.firstWeek; w <= model.end; w = addDays(w, 7)) out.push(w);
    return out;
  }, [model.firstWeek, model.end]);

  const scrollToDate = (iso: string, smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, x(iso) - el.clientWidth * 0.25), behavior: smooth ? 'smooth' : 'auto' });
  };

  // start scrolled to today (and keep today in view when zooming)
  useLayoutEffect(() => {
    scrollToDate(todayIn ? today : model.start);
  }, [zoom, model.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // bring the selected campaign into view
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedId) return;
    const row = model.rows.find((r) => r.kind === 'campaign' && r.c.id === selectedId);
    if (!row || row.kind !== 'campaign') return;
    const left = x(row.start);
    const right = x(row.end) + ppd;
    if (right < el.scrollLeft + 20 || left > el.scrollLeft + el.clientWidth - 40) el.scrollTo({ left: Math.max(0, left - 60), behavior: 'smooth' });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const editMs = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onEditMilestone(id, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };

  const actions = model.hasAnything ? (
    <>
      <Tabs<Zoom>
        tabs={[
          { id: 'week', label: 'Weeks' },
          { id: 'month', label: 'Months' },
          { id: 'quarter', label: 'Quarters' },
        ]}
        value={zoom}
        onChange={setZoom}
      />
      <Button size="sm" icon={CalendarClock} onClick={() => scrollToDate(today, true)} disabled={!todayIn}>
        Today
      </Button>
    </>
  ) : undefined;

  return (
    <Card title="Roadmap" actions={actions} padded={false}>
      {!model.hasAnything ? (
        <EmptyState
          icon={MapIcon}
          title={campaigns.length ? 'Give your campaigns dates' : 'Map out your campaigns'}
          description={
            campaigns.length
              ? 'Campaigns appear on the roadmap once they have a start and end date. Pick one below and set its dates.'
              : 'A campaign is a time-boxed push — a teaser week, the trailer launch, a festival run, the release. Add one to see it here with its milestones and posts.'
          }
          action={
            campaigns.length ? undefined : (
              <div className="row" style={{ justifyContent: 'center' }}>
                <Button variant="primary" icon={Plus} onClick={onNewCampaign}>
                  New campaign
                </Button>
                <Button icon={Rocket} onClick={onPhases}>
                  Start with launch phases
                </Button>
              </div>
            )
          }
          style={{ padding: '34px 24px' }}
        />
      ) : (
        <div className="sp-campaigns-road" style={{ ['--row-h' as string]: `${ROW_H}px`, ['--head-h' as string]: `${HEAD_H}px`, ['--label-w' as string]: `${LABEL_W}px` }}>
          <div className="sp-campaigns-road-labels">
            <div className="sp-campaigns-road-corner">{model.rows.filter((r) => r.kind === 'campaign').length} on the roadmap</div>
            {model.rows.map((r) =>
              r.kind === 'campaign' ? (
                <button
                  key={r.c.id}
                  type="button"
                  className={`sp-campaigns-road-label ${selectedId === r.c.id ? 'on' : ''}`}
                  onClick={() => {
                    onSelect(r.c.id);
                    scrollToDate(r.start, true);
                  }}
                  title={r.c.objective || r.c.name}
                >
                  <span className="color-dot" style={{ background: r.c.color || 'var(--accent)' }} />
                  <span className="grow">
                    <span className="ellipsis strong">{r.c.name || 'Untitled campaign'}</span>
                    <span className="ellipsis tiny muted">{r.start === r.end ? fmt.dateMedium(r.start) : `${stripYear(fmt.dateMedium(r.start))} – ${stripYear(fmt.dateMedium(r.end))}`}</span>
                  </span>
                </button>
              ) : (
                <div key="loose" className="sp-campaigns-road-label loose">
                  <Flag size={13} />
                  <span className="grow">
                    <span className="ellipsis strong">Milestones</span>
                    <span className="ellipsis tiny muted">not in a scheduled campaign</span>
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="sp-campaigns-road-scroll" ref={scrollRef}>
            <div className="sp-campaigns-road-canvas" style={{ width }}>
              <div className="sp-campaigns-road-head">
                {months.map((m) => (
                  <div key={m.key} className="sp-campaigns-road-month" style={{ left: m.x, width: m.w }}>
                    <span>{m.label}</span>
                  </div>
                ))}
                {zoom !== 'quarter' &&
                  weeks.map((w) => (
                    <span key={w} className="sp-campaigns-road-wk" style={{ left: x(w) }}>
                      {parseISODate(w)!.getDate()}
                    </span>
                  ))}
              </div>
              <div className="sp-campaigns-road-grid">
                {weeks.map((w) => (
                  <span key={w} className="wk" style={{ left: x(w) }} />
                ))}
                {months.map((m) => (
                  <span key={m.key} className="mo" style={{ left: m.x }} />
                ))}
              </div>
              <div className="sp-campaigns-road-rows">
              {model.rows.map((r) =>
                r.kind === 'campaign' ? (
                  <div key={r.c.id} className={`sp-campaigns-road-row ${selectedId === r.c.id ? 'on' : ''}`}>
                    {(() => {
                      const left = x(r.start);
                      const w = (diffDays(r.start, r.end) + 1) * ppd;
                      const color = r.c.color || '#7c5cff';
                      return (
                        <button
                          type="button"
                          className={`sp-campaigns-bar ${selectedId === r.c.id ? 'on' : ''} ${r.c.status === 'complete' ? 'complete' : ''}`}
                          style={{ left, width: Math.max(6, w), top: BAR_TOP, height: BAR_H, background: color, color: readableOn(color) }}
                          onClick={() => onSelect(r.c.id)}
                          title={`${r.c.name || 'Campaign'} · ${fmt.dateMedium(r.start)} – ${fmt.dateMedium(r.end)}${r.c.objective ? `\n${r.c.objective}` : ''}`}
                        >
                          {w > 34 && (
                            <span>
                              <b>{r.c.name || 'Untitled campaign'}</b>
                              {w > 200 && <em>{r.start === r.end ? stripYear(fmt.dateMedium(r.start)) : `${stripYear(fmt.dateMedium(r.start))} – ${stripYear(fmt.dateMedium(r.end))}`}</em>}
                            </span>
                          )}
                        </button>
                      );
                    })()}
                    {[...r.posts.entries()].map(([date, dots]) =>
                      dots.slice(0, 3).map((d, k) => (
                        <button
                          key={d.key}
                          type="button"
                          className="sp-campaigns-dot"
                          style={{ left: x(date) + ppd / 2 - 3.5, top: DOT_TOP + k * 4, background: d.color }}
                          title={`${d.title} · ${fmt.dateMedium(date)}${k === 2 && dots.length > 3 ? ` (+${dots.length - 3} more that day)` : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openContent(d.contentId, 'publish');
                          }}
                        />
                      )),
                    )}
                    {r.ms.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`sp-campaigns-diamond ${m.done ? 'done' : ''} ${!m.done && m.date! < today ? 'late' : ''}`}
                        style={{ left: x(m.date!) + ppd / 2 - 7, top: MS_TOP, ['--mc' as string]: r.c.color || 'var(--accent)' }}
                        title={`${m.name || 'Milestone'} · ${fmt.dateMedium(m.date)}${m.done ? ' · done' : ''}`}
                        onClick={(e) => editMs(e, m.id)}
                        aria-label={`Edit milestone ${m.name}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div key="loose" className="sp-campaigns-road-row loose">
                    {r.ms.map((m) => (
                      <div key={m.id} className="sp-campaigns-loose" style={{ left: x(m.date!) + ppd / 2 - 7 }}>
                        <button
                          type="button"
                          className={`sp-campaigns-diamond static ${m.done ? 'done' : ''} ${!m.done && m.date! < today ? 'late' : ''}`}
                          style={{ ['--mc' as string]: 'var(--accent)' }}
                          title={`${m.name || 'Milestone'} · ${fmt.dateMedium(m.date)}${m.done ? ' · done' : ''}`}
                          onClick={(e) => editMs(e, m.id)}
                          aria-label={`Edit milestone ${m.name}`}
                        />
                        <button type="button" className={`sp-campaigns-loose-label ${m.done ? 'done' : ''}`} onClick={(e) => editMs(e, m.id)}>
                          {m.name || 'Milestone'}
                        </button>
                      </div>
                    ))}
                  </div>
                ),
              )}
              </div>
              {todayIn && (
                <div className="sp-campaigns-road-today" style={{ left: x(today) + ppd / 2 }}>
                  <span>Today</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {model.unscheduled.length > 0 && (
        <div className="sp-campaigns-unsched">
          <span className="muted small">Not on the roadmap yet:</span>
          {model.unscheduled.map((c) => (
            <button key={c.id} type="button" className={`sp-campaigns-chip ${selectedId === c.id ? 'on' : ''}`} onClick={() => onSelect(c.id)} title="Select to set its dates">
              <span className="color-dot" style={{ background: c.color || 'var(--accent)' }} />
              {c.name || 'Untitled campaign'}
            </button>
          ))}
          <span className="muted tiny">— add start and end dates</span>
        </div>
      )}
      {model.hasAnything && (
        <div className="sp-campaigns-legend">
          <span>
            <i className="sp-campaigns-diamond static legend" style={{ ['--mc' as string]: 'var(--text-3)' }} /> Milestone
          </span>
          <span>
            <i className="sp-campaigns-diamond static legend done" style={{ ['--mc' as string]: 'var(--text-3)' }} /> Done
          </span>
          <span>
            <i className="sp-campaigns-dot legend" style={{ background: 'var(--text-3)' }} /> Post (channel colour) — click to open
          </span>
          <span className="spacer" />
          <span className="muted">Click a bar to edit the campaign, a diamond to edit the milestone</span>
        </div>
      )}
    </Card>
  );
}
