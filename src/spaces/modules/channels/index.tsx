/* Channels — where the space's content goes out: platforms, handles, cadence
   targets, best times, and each channel's results at a glance. */
import './channels.css';
import { useMemo, useState, type DragEvent } from 'react';
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, Plus, Radio, Sparkles } from 'lucide-react';
import type { ID } from '@/types';
import type { Channel, Platform } from '@/spaces/types';
import { PLATFORMS, PLATFORM_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { getSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { todayISO } from '@/lib/dates';
import { plural, safeFileName } from '@/lib/text';
import { backend, exportCsv } from '@/backend';
import { Button, Checkbox, EmptyState, ExportMenu, ModuleHeader, toast, type AnchorRect } from '@/ui';
import { ChannelCard, channelOps, type CardDrag } from './ChannelCard';
import { addChannel, addChannelSet, CHANNEL_SETS, DeleteChannelDialog, deleteUnusedChannel, PlatformPicker, postsUsingChannel } from './dialogs';
import { compact, computeChannelStats, PlatformMark, type ChannelStats } from './util';

/* ---------------------------------------------------------------- CSV */

async function exportChannelsCsv(stats: Map<ID, ChannelStats>) {
  const s = getSpace();
  if (!s.channels.length) {
    toast('No channels to export yet', 'info');
    return;
  }
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title || 'Space'} - Channels`), s.channels, [
      { header: 'Platform', value: (c: Channel) => PLATFORM_BY_ID[c.platform]?.label ?? c.platform },
      { header: 'Name', value: (c) => c.name },
      { header: 'Handle', value: (c) => c.handle },
      { header: 'URL', value: (c) => c.url },
      { header: 'Followers', value: (c) => c.followers },
      { header: 'Cadence', value: (c) => c.cadence },
      { header: 'Per', value: (c) => (c.cadence ? c.cadenceUnit ?? 'week' : '') },
      { header: 'Best times', value: (c) => c.bestTimes },
      { header: 'Active', value: (c) => c.active },
      { header: 'Posts published', value: (c) => stats.get(c.id)?.published ?? 0 },
      { header: 'Views', value: (c) => stats.get(c.id)?.views ?? 0 },
      { header: 'Engagement', value: (c) => stats.get(c.id)?.engagement ?? 0 },
      { header: 'Notes', value: (c) => c.notes },
    ]);
    if (path) toast(`Exported ${plural(s.channels.length, 'channel')} to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind !== 'electron') toast('Channels CSV downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/* ---------------------------------------------------------------- platform reference */

function PlatformReference({ inUse }: { inUse: Platform[] }) {
  const [open, setOpen] = useState(() => readLS<boolean>('prepro.sp-channels.reference', false));
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    if (all || !inUse.length) return PLATFORMS;
    const set = new Set(inUse);
    return PLATFORMS.filter((p) => set.has(p.value));
  }, [all, inUse]);
  const toggle = () => {
    writeLS('prepro.sp-channels.reference', !open);
    setOpen(!open);
  };
  const num = (n?: number) => (n ? n.toLocaleString() : '—');
  return (
    <div className="card sp-channels-ref">
      <button type="button" className="sp-channels-ref-head" aria-expanded={open} onClick={toggle}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <BookOpen size={15} />
        <span className="strong">Platform reference</span>
        <span className="muted small ellipsis">Title & caption limits, aspect ratios and max lengths{inUse.length ? ' for your channels' : ''}</span>
      </button>
      {open && (
        <div className="sp-channels-ref-body">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="num">Title limit</th>
                  <th className="num">Caption limit</th>
                  <th>Aspect ratio</th>
                  <th>Max video length</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.value}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <PlatformMark platform={p.value} color={p.color} size={20} />
                        {p.label}
                      </span>
                    </td>
                    <td className="num">{p.hasTitle && p.titleLimit ? `${num(p.titleLimit)} chars` : p.hasTitle ? 'Title' : '—'}</td>
                    <td className="num">{p.captionLimit ? `${num(p.captionLimit)} chars` : '—'}</td>
                    <td>{p.aspect ?? '—'}</td>
                    <td>{p.maxLength ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            {inUse.length > 0 && <Checkbox checked={all} onChange={setAll} label="Show every platform" />}
            <div className="spacer" />
            <span className="muted tiny">Platforms change their limits now and then; double-check before an important launch.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- empty state */

function ChannelsEmpty({ onPick }: { onPick: (e: React.MouseEvent<HTMLElement>) => void }) {
  return (
    <div className="sp-channels-empty">
      <EmptyState
        icon={Radio}
        title="No channels yet"
        description="Channels are where your content goes out: YouTube, Instagram, a newsletter, press… Add the ones you use, set a cadence, and the calendar and results will follow. Most creators start with YouTube, Instagram and TikTok."
        action={
          <Button variant="primary" icon={Plus} onClick={onPick}>
            Add a channel
          </Button>
        }
      />
      <div className="sp-channels-sets">
        <div className="section-title">Or start with a common set</div>
        <div className="sp-channels-sets-grid">
          {CHANNEL_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              className="sp-channels-set"
              onClick={() => {
                const n = addChannelSet(set);
                toast(n ? `Added ${plural(n, 'channel')}` : 'Those channels are already here', n ? 'success' : 'info');
              }}
            >
              <span className="sp-channels-set-marks">
                {set.channels.map(([p]) => (
                  <PlatformMark key={p} platform={p} color={PLATFORM_BY_ID[p].color} size={26} />
                ))}
              </span>
              <span className="strong">{set.label}</span>
              <span className="muted small">{set.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- module */

export default function ChannelsModule() {
  const channels = useSpace((s) => s.channels) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const mondayFirst = useSpace((s) => s.settings?.weekStartsMonday) ?? true;
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const [picker, setPicker] = useState<AnchorRect | null>(null);
  const [focusId, setFocusId] = useState<ID | null>(null);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const [dragId, setDragId] = useState<ID | null>(null);
  const [over, setOver] = useState<{ id: ID; side: 'before' | 'after' } | null>(null);

  const { stats, week } = useMemo(() => computeChannelStats(content, channels, mondayFirst, today), [content, channels, mondayFirst, today]);
  const active = useMemo(() => channels.filter((c) => c.active), [channels]);
  const inactive = useMemo(() => channels.filter((c) => !c.active), [channels]);
  const inUse = useMemo(() => [...new Set(channels.map((c) => c.platform))], [channels]);
  const followers = useMemo(() => active.reduce((a, c) => a + (c.followers ?? 0), 0), [active]);

  const openPicker = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicker({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };

  const onDelete = (c: Channel) => {
    if (postsUsingChannel(c.id) > 0) setDeleting(c);
    else void deleteUnusedChannel(c);
  };

  const dragFor = (c: Channel): CardDrag => ({
    dragging: dragId === c.id,
    over: over?.id === c.id && dragId !== c.id ? over.side : null,
    onHandleDragStart: (e, card) => {
      setDragId(c.id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-sp-channel', c.id);
      if (card) e.dataTransfer.setDragImage(card, 24, 24);
    },
    onDragEnd: () => {
      setDragId(null);
      setOver(null);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const side = e.clientX > r.left + r.width / 2 ? 'after' : 'before';
      if (over?.id !== c.id || over.side !== side) setOver({ id: c.id, side });
    },
    onDrop: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      const id = dragId;
      const side = over?.side ?? 'before';
      setDragId(null);
      setOver(null);
      if (id === c.id) return;
      if (side === 'before') channelOps.moveBefore(id, c.id);
      else {
        const order = getSpace().channels.map((x) => x.id).filter((x) => x !== id);
        channelOps.moveBefore(id, order[order.indexOf(c.id) + 1] ?? null);
      }
    },
  });

  const card = (c: Channel) => (
    <ChannelCard key={c.id} channel={c} stats={stats.get(c.id)} autoFocus={focusId === c.id} onFocused={() => setFocusId(null)} onDelete={onDelete} drag={dragFor(c)} />
  );

  const subtitle = channels.length
    ? `${plural(channels.length, 'channel')} · ${active.length} active${followers ? ` · ${compact(followers)} followers` : ''}`
    : 'Platforms, handles and posting cadence';

  return (
    <div className="module sp-channels">
      <ModuleHeader
        title="Channels"
        icon={Radio}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu csv={[{ label: 'Channels (CSV)', onClick: () => exportChannelsCsv(stats) }]} label="Export" />
            <Button variant="primary" icon={Plus} onClick={openPicker}>
              Add channel
            </Button>
          </>
        }
      />
      <div className="module-body">
        {channels.length === 0 ? (
          <ChannelsEmpty onPick={openPicker} />
        ) : (
          <div className="sp-channels-page">
            {active.length > 0 && (
              <div className="sp-channels-week">
                <CalendarDays size={15} />
                <span>
                  Week of <b>{fmt.dateMedium(week.start)}</b>
                </span>
                <span className="sp-channels-week-sep" />
                <span>
                  <b>{week.planned}</b> {week.planned === 1 ? 'post' : 'posts'} planned
                  {week.target ? (
                    <>
                      {' '}
                      · cadence target <b>{week.target}</b>
                    </>
                  ) : null}
                </span>
                {week.behind.length > 0 && (
                  <>
                    <span className="sp-channels-week-sep" />
                    <span className="sp-channels-behind">
                      Behind on{' '}
                      {week.behind.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && ', '}
                          <span className="color-dot" style={{ background: channelColor(c), marginRight: 4 }} />
                          {c.name || PLATFORM_BY_ID[c.platform]?.label}
                        </span>
                      ))}
                    </span>
                  </>
                )}
                <div className="spacer" />
                <button type="button" className="sp-channels-link" onClick={() => navigateSpace('calendar')}>
                  Open calendar
                </button>
              </div>
            )}

            {active.length > 0 ? (
              <div className="sp-channels-grid">{active.map(card)}</div>
            ) : (
              <div className="sp-channels-allinactive">
                <Sparkles size={15} /> Every channel is switched off. Turn one back on, or add a new one.
              </div>
            )}

            {inactive.length > 0 && (
              <>
                <div className="sp-channels-divider">
                  <span>Inactive</span>
                  <span className="badge">{inactive.length}</span>
                  <span className="muted small">Not counted in cadence; kept with their history.</span>
                </div>
                <div className="sp-channels-grid">{inactive.map(card)}</div>
              </>
            )}

            <PlatformReference inUse={inUse} />
          </div>
        )}
      </div>

      <PlatformPicker
        anchor={picker}
        onClose={() => setPicker(null)}
        onPick={(p) => {
          const id = addChannel(p.value);
          setFocusId(id);
        }}
      />
      {deleting && <DeleteChannelDialog key={deleting.id} channel={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
