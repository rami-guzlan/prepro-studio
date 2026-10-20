/* Printable calendar documents: the month grid (landscape) and the posting
   schedule for publishing day (portrait). Render-only: no hooks, literal colours. */
import type { CSSProperties } from 'react';
import type { SpacePrintContext, SpacePrintDocDef } from '@/spaces/print/types';
import type { Channel, SpaceData } from '@/spaces/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Check, Dot, PBadge } from '@/print/components';
import { FORMAT_BY_ID, PLATFORM_BY_ID, POST_STATUSES, STAGE_BY_ID } from '@/spaces/constants';
import { allPosts, channelColor, type PostRef } from '@/spaces/derive';
import { MONTHS_LONG, MONTHS_SHORT, WEEKDAYS_SHORT, addDays, isWeekend, parseISODate, todayISO } from '@/lib/dates';
import { plural } from '@/lib/text';
import { indexSessions } from '../production/model';
import {
  MISSING_CHANNEL_COLOR,
  NO_CHANNEL,
  addMonths,
  buildItems,
  channelLabel,
  firstOfMonth,
  isISODate,
  monthOf,
  monthWeeksCompact,
  refColor,
  shortTime,
  weekBands,
  type CalItem,
} from './model';

/* ---------------------------------------------------------------- option helpers */

/** 'YYYY-MM' (or a full date) → first day of that month; anything else → this month. */
function parseMonth(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return `${m[1]}-${String(mm).padStart(2, '0')}-01`;
  }
  return firstOfMonth(todayISO());
}

function parseDate(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim();
  return isISODate(s) ? s : fallback;
}

/** Channels matching a comma-separated list of names / platforms / ids (empty = all). */
function matchChannels(space: SpaceData, text: unknown): { ids: Set<string> | null; label: string; unmatched: string[] } {
  const tokens = String(text ?? '')
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return { ids: null, label: 'All channels', unmatched: [] };
  const ids = new Set<string>();
  const unmatched: string[] = [];
  for (const t of tokens) {
    const hits = space.channels.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const plat = (PLATFORM_BY_ID[c.platform]?.label || '').toLowerCase();
      return c.id === t || c.platform === t || name === t || plat === t || name.includes(t) || plat.includes(t);
    });
    if (hits.length) hits.forEach((c) => ids.add(c.id));
    else unmatched.push(t);
  }
  const names = space.channels.filter((c) => ids.has(c.id)).map((c) => channelLabel(c));
  return { ids, label: names.length ? names.join(', ') : 'No matching channel', unmatched };
}

function channelHidden(space: SpaceData, ids: Set<string> | null): string[] {
  if (!ids) return [];
  return [...space.channels.filter((c) => !ids.has(c.id)).map((c) => c.id), NO_CHANNEL];
}

const STATUS = Object.fromEntries(POST_STATUSES.map((s) => [s.value, s])) as Record<string, { label: string; color?: string }>;

function color(c: string | undefined, fallback = '#f08c00'): string {
  return c && !c.startsWith('var(') ? c : fallback;
}

/* ---------------------------------------------------------------- month grid */

const CAL_CSS = `
.spc-month { break-inside: avoid; }
.spc-mhead { display: flex; align-items: baseline; justify-content: space-between; gap: 10pt; margin-bottom: 4pt; }
.spc-mhead h2 { font-size: 15pt; letter-spacing: -0.01em; }
.spc-mhead .spc-sub { font-size: 8pt; color: #66666f; }
.spc-grid { border: 0.75pt solid #b9b9c3; border-radius: 3pt; overflow: hidden; }
.spc-wds { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); background: #efeff3; border-bottom: 0.75pt solid #b9b9c3; }
.spc-wds div { padding: 2.5pt 4pt; font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #44444d; }
.spc-week { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: minmax(0, 1fr); border-bottom: 0.5pt solid #c9c9d1; }
.spc-week:last-child { border-bottom: 0; }
.spc-day { position: relative; overflow: hidden; padding: 1.5pt 3pt 2pt; border-right: 0.5pt solid #d6d6dd; }
.spc-day:last-child { border-right: 0; }
.spc-day.we { background: #f7f7f9; }
.spc-day.out { background: #fbfbfc; }
.spc-day.out .spc-num, .spc-day.out .spc-line { opacity: 0.45; }
.spc-num { font-size: 7.6pt; font-weight: 700; color: #2a2a33; height: 10pt; line-height: 10pt; }
.spc-num .spc-mon { font-size: 6pt; color: #77777f; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 2pt; }
.spc-day.today .spc-num span.n { background: #2a2a33; color: #fff; border-radius: 5pt; padding: 0 3pt; }
.spc-line { display: flex; align-items: center; gap: 2pt; font-size: 6.4pt; line-height: 7.8pt; height: 7.8pt; white-space: nowrap; overflow: hidden; }
.spc-line .t { font-weight: 700; color: #3a3a44; flex-shrink: 0; }
.spc-line .l { overflow: hidden; text-overflow: ellipsis; }
.spc-line .pp-dot { width: 4.5pt; height: 4.5pt; margin-right: 0; flex-shrink: 0; }
.spc-line .hollow { display: inline-block; width: 4.5pt; height: 4.5pt; border-radius: 50%; border: 0.9pt solid; flex-shrink: 0; box-sizing: border-box; }
.spc-line.published .l { color: #6b6b75; }
.spc-line.skipped .l { text-decoration: line-through; color: #8a8a93; }
.spc-line .ok { color: #2f9e44; font-weight: 700; flex-shrink: 0; }
.spc-line.ms { font-weight: 700; }
.spc-diamond { display: inline-block; width: 4.6pt; height: 4.6pt; transform: rotate(45deg); border: 1pt solid; margin: 0 1.5pt 0 1pt; flex-shrink: 0; box-sizing: border-box; }
.spc-tag { font-size: 5.2pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 0 2pt; border-radius: 2pt; background: #2a2a33; color: #fff; line-height: 6.6pt; flex-shrink: 0; }
.spc-line.shoot { font-weight: 650; }
.spc-more { font-size: 6pt; font-weight: 700; color: #66666f; line-height: 7.6pt; }
.spc-bands { position: absolute; left: 0; right: 0; top: 11.5pt; height: 0; }
.spc-band { position: absolute; height: 7pt; border-radius: 1.5pt; font-size: 5.6pt; font-weight: 700; line-height: 7pt; padding: 0 3pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spc-legend { display: flex; flex-wrap: wrap; gap: 3pt 10pt; margin-top: 5pt; font-size: 6.6pt; color: #4d4d58; align-items: center; }
.spc-legend span { display: inline-flex; align-items: center; gap: 2.5pt; }
.spc-legend .sw { display: inline-block; width: 12pt; height: 5pt; border-radius: 1pt; }
.spc-legend b { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.06em; color: #77777f; }
`;

const PT_PER_IN = 72;
const MARGINS = { top: 0.5, right: 0.45, bottom: 0.55, left: 0.45 };

function CellLine({ it }: { it: CalItem }) {
  if (it.kind === 'milestone') {
    const c = color(it.color);
    return (
      <div className="spc-line ms">
        <span className="spc-diamond" style={{ borderColor: c, background: it.ms.done ? c : '#fff' }} />
        <span className="l">{it.ms.name || 'Milestone'}</span>
      </div>
    );
  }
  if (it.kind === 'shoot') {
    return (
      <div className="spc-line shoot">
        <span className="spc-tag">Shoot</span>
        {it.shoot.callTime && <span className="t">{shortTime(it.shoot.callTime, true)}</span>}
        <span className="l">{it.shoot.title || 'Shoot day'}</span>
      </div>
    );
  }
  const { post, content } = it.ref;
  const c = color(it.color, MISSING_CHANNEL_COLOR);
  return (
    <div className={`spc-line ${post.status}`}>
      {post.status === 'draft' ? <span className="hollow" style={{ borderColor: c }} /> : <Dot color={c} />}
      {post.time && <span className="t">{shortTime(post.time, true)}</span>}
      <span className="l">{content.title || 'Untitled content'}</span>
      {post.status === 'published' && <span className="ok">✓</span>}
    </div>
  );
}

function renderCalendar(ctx: SpacePrintContext) {
  const { space, options } = ctx;
  const start = parseMonth(options.month);
  const count = Math.max(1, Math.min(12, Math.round(Number(options.months) || 1)));
  const mondayFirst = !!space.settings.weekStartsMonday;
  const ch = matchChannels(space, options.channels);
  const toggles = {
    showShoots: options.shoots !== false,
    showMilestones: options.milestones !== false,
    showCampaigns: options.campaigns !== false,
  };
  const refs = allPosts(space);
  const items = buildItems({
    refs,
    shoots: space.shoots,
    milestones: space.milestones,
    campaigns: space.campaigns,
    sessionPieces: indexSessions(space).pieces,
    filters: { hidden: channelHidden(space, ch.ids), campaignId: '', stage: '', ...toggles },
  });
  const bandCampaigns = toggles.showCampaigns ? space.campaigns : [];
  const wds = mondayFirst ? [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]] : WEEKDAYS_SHORT;
  const paperH = (ctx.paper === 'a4' ? 8.27 : 8.5) * PT_PER_IN;
  const contentH = paperH - (MARGINS.top + MARGINS.bottom) * PT_PER_IN;
  const today = ctx.todayISO;

  const months = Array.from({ length: count }, (_, i) => addMonths(start, i));
  const last = months[months.length - 1];
  const rangeLabel = count > 1 ? `${MONTHS_SHORT[monthOf(start).m]} ${monthOf(start).y} – ${MONTHS_SHORT[monthOf(last).m]} ${monthOf(last).y}` : `${MONTHS_LONG[monthOf(start).m]} ${monthOf(start).y}`;

  const body = (
    <>
      {months.map((first, mi) => {
        const { y, m } = monthOf(first);
        const weeks = monthWeeksCompact(first, mondayFirst);
        const reserved = (mi === 0 ? 66 : 30) + 16 + 30; // title block, weekday row, legend
        const rowH = Math.floor((contentH - reserved - 6) / weeks.length);
        const monthItems = weeks.flat().filter((d) => monthOf(d).m === m);
        let posts = 0;
        const usedChannels = new Map<string, Channel | undefined>();
        for (const d of monthItems)
          for (const it of items.get(d) ?? [])
            if (it.kind === 'post') {
              posts++;
              usedChannels.set(it.ref.channel?.id ?? NO_CHANNEL, it.ref.channel);
            }
        const usedCampaigns = bandCampaigns.filter((c) => weeks.some((w) => weekBands([c], w).segs.length));
        return (
          <div key={first} className={['spc-month', mi > 0 && 'pp-break-before'].filter(Boolean).join(' ')}>
            {mi === 0 ? (
              <SpaceDocHeader ctx={ctx} title={`Content Calendar — ${MONTHS_LONG[m]} ${y}`} subtitle={`${ch.label}${count > 1 ? ` · ${rangeLabel}` : ''}`} meta={`${plural(posts, 'post')} · ${ctx.today}`} />
            ) : (
              <div className="spc-mhead">
                <h2>
                  {MONTHS_LONG[m]} {y}
                </h2>
                <span className="spc-sub">
                  {ch.label} · {plural(posts, 'post')}
                </span>
              </div>
            )}
            <div className="spc-grid">
              <div className="spc-wds">
                {wds.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              {weeks.map((days) => {
                const { segs, lanes } = weekBands(bandCampaigns, days);
                const bandSpace = lanes * 8.5;
                const lines = Math.max(1, Math.floor((rowH - 13 - bandSpace) / 7.8));
                return (
                  <div key={days[0]} className="spc-week" style={{ height: `${rowH}pt` }}>
                    {days.map((iso) => {
                      const d = parseISODate(iso)!;
                      const list = items.get(iso) ?? [];
                      const overflow = list.length > lines;
                      const shown = overflow ? list.slice(0, lines - 1) : list;
                      const cls = ['spc-day', isWeekend(iso) && 'we', d.getMonth() !== m && 'out', iso === today && 'today'].filter(Boolean).join(' ');
                      return (
                        <div key={iso} className={cls}>
                          <div className="spc-num">
                            <span className="n">{d.getDate()}</span>
                            {d.getDate() === 1 && <span className="spc-mon">{MONTHS_SHORT[d.getMonth()]}</span>}
                          </div>
                          {lanes > 0 && <div style={{ height: `${bandSpace}pt` }} />}
                          {shown.map((it) => (
                            <CellLine key={it.key} it={it} />
                          ))}
                          {overflow && <div className="spc-more">+{list.length - shown.length} more</div>}
                        </div>
                      );
                    })}
                    {segs.length > 0 && (
                      <div className="spc-bands">
                        {segs.map((s) => {
                          const c = color(s.campaign.color, '#7c5cff');
                          const style: CSSProperties = {
                            left: `calc(100% * ${s.col} / 7 + 2pt)`,
                            width: `calc(100% * ${s.span} / 7 - 4pt)`,
                            top: `${s.lane * 8.5}pt`,
                            background: `color-mix(in srgb, ${c} 22%, white)`,
                            color: '#1d1d24',
                            borderLeft: s.starts ? `2pt solid ${c}` : undefined,
                          };
                          return (
                            <div key={`${s.campaign.id}-${s.col}`} className="spc-band" style={style}>
                              {s.campaign.name || 'Campaign'}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="spc-legend">
              {usedChannels.size > 0 && <b>Channels</b>}
              {[...usedChannels.entries()].map(([id, c]) => (
                <span key={id}>
                  <Dot color={c ? color(channelColor(c), '#888') : MISSING_CHANNEL_COLOR} />
                  {channelLabel(c)}
                </span>
              ))}
              {usedCampaigns.length > 0 && <b>Campaigns</b>}
              {usedCampaigns.map((c) => (
                <span key={c.id}>
                  <span className="sw" style={{ background: `color-mix(in srgb, ${color(c.color, '#7c5cff')} 35%, white)`, borderLeft: `2pt solid ${color(c.color, '#7c5cff')}` }} />
                  {c.name || 'Campaign'}
                </span>
              ))}
              <b>Key</b>
              <span>
                <span className="hollow" style={{ display: 'inline-block', width: '4.5pt', height: '4.5pt', borderRadius: '50%', border: '0.9pt solid #555' }} /> draft
              </span>
              <span>
                <Dot color="#555" /> scheduled
              </span>
              <span>✓ published</span>
              {toggles.showMilestones && (
                <span>
                  <span className="spc-diamond" style={{ borderColor: '#555' }} /> milestone
                </span>
              )}
              {toggles.showShoots && (
                <span>
                  <span className="spc-tag">Shoot</span> shoot day
                </span>
              )}
              {ch.unmatched.length > 0 && <span style={{ color: '#d2343f' }}>No channel matches “{ch.unmatched.join(', ')}”</span>}
            </div>
          </div>
        );
      })}
    </>
  );
  return { body, css: CAL_CSS, orientation: 'landscape' as const, margins: MARGINS, title: 'Content Calendar' };
}

/* ---------------------------------------------------------------- posting schedule */

const SCHED_CSS = `
.sps-summary { display: flex; flex-wrap: wrap; gap: 4pt 14pt; font-size: 8pt; color: #55555e; margin-bottom: 6pt; }
.sps-summary b { color: #141418; }
.sps-day { margin-top: 12pt; }
.sps-day:first-of-type { margin-top: 4pt; }
.sps-dayhead { display: flex; align-items: baseline; justify-content: space-between; gap: 10pt; padding-bottom: 3pt; margin-bottom: 5pt; border-bottom: 1pt solid #2a2a33; break-after: avoid; page-break-after: avoid; }
.sps-dayhead h3 { font-size: 11pt; }
.sps-dayhead span { font-size: 7.6pt; color: #66666f; font-weight: 600; }
.sps-post { border: 0.75pt solid #d0d0d8; border-left: 3pt solid #888; border-radius: 3pt; padding: 5pt 7pt 6pt; margin-bottom: 5pt; }
.sps-top { display: flex; align-items: center; gap: 7pt; font-size: 7.8pt; color: #44444d; }
.sps-time { font-weight: 800; font-size: 9pt; color: #141418; min-width: 38pt; }
.sps-ch { font-weight: 700; color: #22222a; }
.sps-fmt { color: #66666f; }
.sps-posted { margin-left: auto; display: inline-flex; align-items: center; gap: 3pt; font-size: 7.4pt; color: #55555e; }
.sps-title { font-size: 10pt; font-weight: 700; margin-top: 3pt; }
.sps-field { margin-top: 3pt; font-size: 8.2pt; }
.sps-field .k { font-size: 6.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; margin-right: 4pt; }
.sps-caption { margin-top: 3pt; padding: 4pt 6pt; background: #f6f6f9; border-radius: 2pt; font-size: 8.2pt; white-space: pre-wrap; word-break: break-word; }
.sps-tags { margin-top: 2pt; font-size: 7.8pt; color: #3e5fbf; word-break: break-word; }
.sps-warn { margin-top: 3pt; font-size: 7.4pt; font-weight: 700; color: #c2410c; }
.sps-empty { padding: 18pt; text-align: center; color: #77777f; border: 0.75pt dashed #c9c9d1; border-radius: 4pt; }
`;

function renderSchedule(ctx: SpacePrintContext) {
  const { space, options, fmt } = ctx;
  const today = ctx.todayISO;
  let from = parseDate(options.from, today);
  let to = parseDate(options.to, addDays(from, 13));
  if (to < from) [from, to] = [to, from];
  const ch = matchChannels(space, options.channels);
  const hidePublished = !!options.hidePublished;
  const includeSkipped = !!options.includeSkipped;
  const showCaptions = options.showCaptions !== false;
  const refs = allPosts(space).filter((r) => {
    const d = r.post.date;
    if (!isISODate(d) || d < from || d > to) return false;
    if (ch.ids && !(r.channel && ch.ids.has(r.channel.id))) return false;
    if (!includeSkipped && r.post.status === 'skipped') return false;
    if (hidePublished && r.post.status === 'published') return false;
    return true;
  });
  const byDay = new Map<string, PostRef[]>();
  for (const r of refs) byDay.set(r.post.date!, [...(byDay.get(r.post.date!) ?? []), r]);
  const notReady = refs.filter((r) => r.post.status !== 'published' && !['ready', 'published'].includes(r.content.stage)).length;
  const channelsUsed = new Set(refs.map((r) => r.channel?.id ?? NO_CHANNEL)).size;

  const body = (
    <>
      <SpaceDocHeader ctx={ctx} title="Posting Schedule" subtitle={`${fmt.dateMedium(from)} – ${fmt.dateMedium(to)} · ${ch.label}`} />
      <div className="sps-summary">
        <span>
          <b>{refs.length}</b> posts
        </span>
        <span>
          <b>{byDay.size}</b> posting days
        </span>
        <span>
          <b>{channelsUsed}</b> channels
        </span>
        {notReady > 0 && (
          <span style={{ color: '#c2410c' }}>
            <b style={{ color: '#c2410c' }}>{notReady}</b> not ready yet
          </span>
        )}
      </div>
      {refs.length === 0 && <div className="sps-empty">No posts between {fmt.dateMedium(from)} and {fmt.dateMedium(to)}.</div>}
      {[...byDay.entries()].map(([day, list]) => (
        <div key={day} className="sps-day">
          <div className="sps-dayhead">
            <h3>{fmt.dateLong(day)}</h3>
            <span>{plural(list.length, 'post')}</span>
          </div>
          {list.map((r) => {
            const { post, content, channel } = r;
            const c = color(refColor(r), MISSING_CHANNEL_COLOR);
            const st = STATUS[post.status];
            const stage = STAGE_BY_ID[content.stage];
            const late = post.status !== 'published' && post.status !== 'skipped' && !['ready', 'published'].includes(content.stage);
            return (
              <div key={post.id} className="sps-post pp-avoid" style={{ borderLeftColor: c }}>
                <div className="sps-top">
                  <span className="sps-time">{post.time ? fmt.time(post.time) : 'Any time'}</span>
                  <span className="sps-ch">
                    <Dot color={c} />
                    {channelLabel(channel)}
                  </span>
                  <span className="sps-fmt">{FORMAT_BY_ID[content.format]?.label ?? content.format}</span>
                  <PBadge color={st?.color}>{st?.label ?? post.status}</PBadge>
                  <span className="sps-posted">
                    <Check on={post.status === 'published'} /> Posted
                  </span>
                </div>
                <div className="sps-title">{content.title || 'Untitled content'}</div>
                {post.title && (
                  <div className="sps-field">
                    <span className="k">{channel && PLATFORM_BY_ID[channel.platform]?.hasTitle ? 'Title' : 'Headline'}</span>
                    {post.title}
                  </div>
                )}
                {showCaptions && post.caption && <div className="sps-caption">{post.caption}</div>}
                {showCaptions && post.hashtags && <div className="sps-tags">{post.hashtags}</div>}
                {post.url && (
                  <div className="sps-field">
                    <span className="k">Link</span>
                    {post.url}
                  </div>
                )}
                {post.notes && (
                  <div className="sps-field">
                    <span className="k">Notes</span>
                    {post.notes}
                  </div>
                )}
                {late && <div className="sps-warn">Content is still in “{stage?.label ?? content.stage}” — not ready to post.</div>}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
  return { body, css: SCHED_CSS, title: 'Posting Schedule' };
}

/* ---------------------------------------------------------------- definitions */

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-calendar',
    title: 'Content Calendar',
    group: 'Calendar',
    orientation: 'landscape',
    description: 'Month grid with posts (channel colour, time, title), shoot days, milestones and campaign ranges — one page per month',
    options: [
      {
        key: 'month',
        label: 'First month (YYYY-MM)',
        type: 'text',
        get default() {
          return todayISO().slice(0, 7);
        },
        hint: 'e.g. 2026-11',
      },
      { key: 'months', label: 'Number of months', type: 'number', default: 1, min: 1, max: 12, hint: 'One page per month' },
      { key: 'channels', label: 'Channels', type: 'text', default: '', hint: 'Comma-separated names, empty = all channels' },
      { key: 'shoots', label: 'Show shoot days', type: 'boolean', default: true },
      { key: 'milestones', label: 'Show milestones', type: 'boolean', default: true },
      { key: 'campaigns', label: 'Show campaign ranges', type: 'boolean', default: true },
    ],
    emptyReason: () => false,
    render: renderCalendar,
  },
  {
    id: 'space-posting-schedule',
    title: 'Posting Schedule',
    group: 'Calendar',
    orientation: 'portrait',
    description: 'Every post in a date range by day: time, channel, format, status, platform title, caption and hashtags — for publishing day',
    options: [
      {
        key: 'from',
        label: 'From (YYYY-MM-DD)',
        type: 'text',
        get default() {
          return todayISO();
        },
      },
      {
        key: 'to',
        label: 'To (YYYY-MM-DD)',
        type: 'text',
        get default() {
          return addDays(todayISO(), 13);
        },
        hint: 'Default: the next 14 days',
      },
      { key: 'channels', label: 'Channels', type: 'text', default: '', hint: 'Comma-separated names, empty = all channels' },
      { key: 'showCaptions', label: 'Show captions & hashtags', type: 'boolean', default: true },
      { key: 'hidePublished', label: 'Hide published posts', type: 'boolean', default: false },
      { key: 'includeSkipped', label: 'Include skipped posts', type: 'boolean', default: false },
    ],
    emptyReason: (s) => (s.content.some((c) => c.posts?.some((p) => isISODate(p.date))) ? false : 'No dated posts yet'),
    render: renderSchedule,
  },
];
