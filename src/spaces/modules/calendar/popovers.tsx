/* Calendar popovers: quick create, plan (schedule a piece), milestone editor,
   move-to-date and the "+N more" day list. */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarCheck, Clapperboard, FilePlus2, Plus, Radio, Trash2 } from 'lucide-react';
import type { Campaign, Channel, ContentFormat } from '@/spaces/types';
import { FORMATS, PLATFORM_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { navigateSpace } from '@/store/app';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { todayISO, weekdayLong } from '@/lib/dates';
import { plural } from '@/lib/text';
import { Button, Checkbox, DateInput, Field, Input, Popover, Select, Textarea, TimeInput, confirmDialog, toast, type AnchorRect } from '@/ui';
import { createShootSession, setShootDate } from '../production/actions';
import { createContentPosting, createMilestone, createPosts, deleteMilestone, setMilestone, setPostsDate, setPostTime, undoToast } from './actions';
import { DraggableItem, focusSoon } from './items';
import { channelLabel, isISODate, type CalItem } from './model';

/** First 'HH:MM' in a channel's "best times" text (e.g. 'Tue/Thu 18:00'). */
function bestTime(ch: Channel | undefined): string | undefined {
  const m = /(\d{1,2}):(\d{2})/.exec(ch?.bestTimes ?? '');
  if (!m) return undefined;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => Number(b.active) - Number(a.active));
}

function NoChannels({ onClose }: { onClose: () => void }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="sp-calendar-pop-note">Posts go out on channels. Add your platforms (YouTube, Instagram, newsletter …) first.</div>
      <div className="sp-calendar-pop-actions">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Radio}
          onClick={() => {
            onClose();
            navigateSpace('channels');
          }}
        >
          Set up channels
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- quick create */

type Step = 'menu' | 'content' | 'milestone' | 'shoot';

export function QuickCreatePopover({
  anchor,
  date,
  channels,
  campaigns,
  campaignId,
  onClose,
}: {
  anchor: AnchorRect;
  date: string;
  channels: Channel[];
  campaigns: Campaign[];
  /** active campaign filter: new items join it */
  campaignId?: string;
  onClose: () => void;
}) {
  const fmt = useSpaceFormatters();
  const [step, setStep] = useState<Step>('menu');
  // re-position the popover when its content changes size
  const pos = useMemo(() => ({ ...anchor }), [anchor, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const [day, setDay] = useState(date);
  const sorted = useMemo(() => sortChannels(channels), [channels]);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ContentFormat>('short_video');
  const [channelId, setChannelId] = useState(sorted[0]?.id ?? '');
  const [time, setTime] = useState<string | undefined>(() => bestTime(sorted[0]));
  const [timeTouched, setTimeTouched] = useState(false);
  const [msName, setMsName] = useState('');
  const [campaign, setCampaign] = useState(campaignId ?? '');
  const [shootTitle, setShootTitle] = useState('Shoot day');
  const validDay = isISODate(day);
  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: c.name || 'Campaign' }));

  const submitContent = (e?: FormEvent) => {
    e?.preventDefault();
    if (!validDay || !channelId) return;
    const id = createContentPosting({ title: title || 'Untitled content', format, channelId, date: day, time, campaignId: campaign || undefined });
    onClose();
    openContent(id, 'brief');
  };
  const submitMilestone = (e?: FormEvent) => {
    e?.preventDefault();
    if (!validDay) return;
    createMilestone(msName || 'Milestone', day, campaign || undefined);
    onClose();
    undoToast(`Milestone added on ${fmt.dateMedium(day)}`);
  };
  const submitShoot = (e?: FormEvent) => {
    e?.preventDefault();
    if (!validDay) return;
    const id = createShootSession({ title: shootTitle.trim() || 'Shoot day', date: day });
    onClose();
    toast(`Shoot day added on ${fmt.dateMedium(day)}`, 'success', { action: { label: 'Plan it', onClick: () => navigateSpace('production', { shootId: id }) } });
  };

  const head = (label: string) => (
    <div className="sp-calendar-pop-head">
      {step !== 'menu' && (
        <Button size="sm" variant="ghost" className="icon" aria-label="Back" onClick={() => setStep('menu')}>
          <ArrowLeft />
        </Button>
      )}
      <h4>{label}</h4>
      <DateInput size="sm" value={day} onChange={(v) => setDay(v ?? '')} title="Date" />
    </div>
  );

  return (
    <Popover anchor={pos} onClose={onClose} className={`sp-calendar-pop ${step === 'menu' ? 'menu' : ''}`}>
      {step === 'menu' && (
        <>
          {head(validDay ? `${weekdayLong(day)}` : 'New')}
          <div role="menu">
            <button ref={focusSoon} type="button" role="menuitem" className="menu-item" onClick={() => setStep('content')}>
              <FilePlus2 />
              <span>New content posting this day</span>
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => setStep('milestone')}>
              <span className="sp-calendar-diamond" style={{ ['--mk' as any]: 'var(--warning)', margin: '0 4px 0 3px' }} />
              <span>New milestone</span>
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => setStep('shoot')}>
              <Clapperboard />
              <span>New shoot day</span>
            </button>
          </div>
        </>
      )}
      {step === 'content' && (
        <form className="sp-calendar-pop-form" onSubmit={submitContent}>
          {head('New content')}
          {channels.length === 0 ? (
            <NoChannels onClose={onClose} />
          ) : (
            <>
              <Field label="Title">
                <Input ref={focusSoon} value={title} onChange={setTitle} placeholder="e.g. 3 lighting tricks for night interiors" />
              </Field>
              <Field label="Format">
                <Select value={format} onChange={(v) => setFormat(v as ContentFormat)} options={FORMATS.map((f) => ({ value: f.value, label: f.label }))} />
              </Field>
              <div className="sp-calendar-pop-row">
                <Field label="Channel">
                  <Select
                    value={channelId}
                    onChange={(v) => {
                      setChannelId(v);
                      if (!timeTouched) setTime(bestTime(channels.find((c) => c.id === v)));
                    }}
                    options={sorted.map((c) => ({ value: c.id, label: `${channelLabel(c)}${c.active ? '' : ' (inactive)'}` }))}
                  />
                </Field>
                <Field label="Time">
                  <TimeInput
                    value={time}
                    onChange={(v) => {
                      setTime(v);
                      setTimeTouched(true);
                    }}
                  />
                </Field>
              </div>
              {campaigns.length > 0 && (
                <Field label="Campaign">
                  <Select value={campaign} onChange={setCampaign} options={campaignOptions} placeholder="No campaign" />
                </Field>
              )}
              <div className="sp-calendar-pop-actions">
                <Button size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!validDay || !channelId}>
                  Create & open
                </Button>
              </div>
            </>
          )}
        </form>
      )}
      {step === 'milestone' && (
        <form className="sp-calendar-pop-form" onSubmit={submitMilestone}>
          {head('New milestone')}
          <Field label="Name">
            <Input ref={focusSoon} value={msName} onChange={setMsName} placeholder="e.g. Trailer drop" />
          </Field>
          {campaigns.length > 0 && (
            <Field label="Campaign">
              <Select value={campaign} onChange={setCampaign} options={campaignOptions} placeholder="No campaign" />
            </Field>
          )}
          <div className="sp-calendar-pop-actions">
            <Button size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!validDay}>
              Add milestone
            </Button>
          </div>
        </form>
      )}
      {step === 'shoot' && (
        <form className="sp-calendar-pop-form" onSubmit={submitShoot}>
          {head('New shoot day')}
          <Field label="Title" hint="Batch-film several pieces; plan the run of show in Production.">
            <Input ref={focusSoon} value={shootTitle} onChange={setShootTitle} onFocus={(e) => e.target.select()} />
          </Field>
          <div className="sp-calendar-pop-actions">
            <Button size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!validDay}>
              Add shoot day
            </Button>
          </div>
        </form>
      )}
    </Popover>
  );
}

/* ---------------------------------------------------------------- plan: put a piece / post on a date */

export function PlanPopover({ anchor, contentId, postIds, date, onClose }: { anchor: AnchorRect; contentId: string; postIds?: string[]; date?: string; onClose: () => void }) {
  const fmt = useSpaceFormatters();
  const content = useSpace((s) => s.content.find((c) => c.id === contentId));
  const channels = useSpace((s) => s.channels);
  const sorted = useMemo(() => sortChannels(channels ?? []), [channels]);
  const [day, setDay] = useState(date && isISODate(date) ? date : todayISO());
  const [sel, setSel] = useState<string[]>(() => (sorted.filter((c) => c.active).length === 1 ? [sorted.filter((c) => c.active)[0].id] : []));
  const [time, setTime] = useState<string | undefined>();
  const undated = useMemo(() => {
    const posts = content?.posts ?? [];
    if (postIds?.length) return posts.filter((p) => postIds.includes(p.id) && !isISODate(p.date));
    return posts.filter((p) => !isISODate(p.date) && p.status !== 'skipped' && p.status !== 'published');
  }, [content, postIds]);
  const validDay = isISODate(day);

  if (!content) {
    return (
      <Popover anchor={anchor} onClose={onClose} className="sp-calendar-pop">
        <div className="sp-calendar-pop-note">This content piece no longer exists.</div>
      </Popover>
    );
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!validDay) return;
    if (undated.length) {
      setPostsDate(content.id, undated.map((p) => p.id), day);
      if (time && undated.length === 1 && !undated[0].time) setPostTime(content.id, undated[0].id, time);
      onClose();
      undoToast(`${plural(undated.length, 'post')} scheduled on ${fmt.dateMedium(day)}`);
      return;
    }
    if (!sel.length) return;
    const n = createPosts(content.id, sel, day, time);
    onClose();
    undoToast(`${plural(n, 'post')} planned on ${fmt.dateMedium(day)}`);
  };

  const chById = new Map((channels ?? []).map((c) => [c.id, c]));
  return (
    <Popover anchor={anchor} onClose={onClose} className="sp-calendar-pop">
      <form className="sp-calendar-pop-form" onSubmit={submit}>
        <div className="sp-calendar-pop-head">
          <CalendarCheck size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <h4 title={content.title}>{content.title || 'Untitled content'}</h4>
        </div>
        <div className="sp-calendar-pop-row">
          <Field label="Date">
            <DateInput value={day} onChange={(v) => setDay(v ?? '')} />
          </Field>
          <Field label="Time">
            <TimeInput value={time} onChange={setTime} disabled={undated.length > 1} title={undated.length > 1 ? 'Each post keeps its own time' : undefined} />
          </Field>
        </div>
        {undated.length > 0 ? (
          <Field label={`${plural(undated.length, 'post')} without a date`}>
            <div className="sp-calendar-postlist">
              {undated.map((p) => {
                const ch = chById.get(p.channelId);
                return (
                  <div key={p.id}>
                    <i style={{ background: ch ? channelColor(ch) : '#868e96' }} />
                    <span>{channelLabel(ch)}</span>
                    {p.time && <span className="muted">· {fmt.time(p.time)}</span>}
                  </div>
                );
              })}
            </div>
          </Field>
        ) : sorted.length === 0 ? (
          <NoChannels onClose={onClose} />
        ) : (
          <Field label="Post on">
            <div className="sp-calendar-chlist" role="group" aria-label="Channels">
              {sorted.map((c) => (
                <label key={c.id} className="sp-calendar-chopt">
                  <input
                    type="checkbox"
                    checked={sel.includes(c.id)}
                    onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                  />
                  <i style={{ background: channelColor(c) }} />
                  <span>{channelLabel(c)}</span>
                  <span className="muted">{c.active ? PLATFORM_BY_ID[c.platform]?.label : 'inactive'}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        {(undated.length > 0 || sorted.length > 0) && (
          <div className="sp-calendar-pop-actions">
            <Button size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" icon={CalendarCheck} disabled={!validDay || (!undated.length && !sel.length)}>
              {undated.length ? 'Schedule' : sel.length > 1 ? `Create ${sel.length} posts` : 'Create post'}
            </Button>
          </div>
        )}
      </form>
    </Popover>
  );
}

/* ---------------------------------------------------------------- milestone editor */

export function MilestonePopover({ anchor, id, onClose }: { anchor: AnchorRect; id: string; onClose: () => void }) {
  const ms = useSpace((s) => s.milestones.find((m) => m.id === id));
  const campaigns = useSpace((s) => s.campaigns);
  useEffect(() => {
    if (!ms) onClose();
  }, [ms, onClose]);
  if (!ms) return null;
  const remove = async () => {
    onClose();
    if (await confirmDialog({ title: 'Delete milestone?', message: `“${ms.name || 'Milestone'}” will be removed from the calendar.`, confirmLabel: 'Delete', danger: true })) {
      deleteMilestone(id);
      undoToast('Milestone deleted');
    }
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="sp-calendar-pop">
      <div className="sp-calendar-pop-form">
        <div className="sp-calendar-pop-head">
          <span className="sp-calendar-diamond" style={{ ['--mk' as any]: campaigns.find((c) => c.id === ms.campaignId)?.color || 'var(--warning)' }} />
          <h4>Milestone</h4>
        </div>
        <Field label="Name">
          <Input
            ref={focusSoon}
            value={ms.name}
            onChange={(v) => setMilestone(id, { name: v }, true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onClose();
            }}
          />
        </Field>
        <div className="sp-calendar-pop-row">
          <Field label="Date">
            <DateInput value={ms.date} onChange={(v) => setMilestone(id, { date: v })} />
          </Field>
          <Field label="Status">
            <div style={{ height: 30, display: 'flex', alignItems: 'center' }}>
              <Checkbox checked={ms.done} onChange={(v) => setMilestone(id, { done: v || undefined })} label="Done" />
            </div>
          </Field>
        </div>
        {campaigns.length > 0 && (
          <Field label="Campaign">
            <Select
              value={ms.campaignId ?? ''}
              onChange={(v) => setMilestone(id, { campaignId: v || undefined })}
              options={campaigns.map((c) => ({ value: c.id, label: c.name || 'Campaign' }))}
              placeholder="No campaign"
            />
          </Field>
        )}
        <Field label="Notes">
          <Textarea value={ms.notes} onChange={(v) => setMilestone(id, { notes: v }, true)} minRows={2} autoGrow />
        </Field>
        <div className="sp-calendar-pop-actions">
          <Button size="sm" variant="danger" icon={Trash2} onClick={remove}>
            Delete
          </Button>
          <span className="spacer" />
          <Button size="sm" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Popover>
  );
}

/* ---------------------------------------------------------------- move to date (keyboard friendly) */

export type MoveTarget = { type: 'post'; contentId: string; postId: string } | { type: 'shoot'; shootId: string } | { type: 'milestone'; msId: string };

export function MovePopover({ anchor, target, current, label, onClose }: { anchor: AnchorRect; target: MoveTarget; current?: string; label: string; onClose: () => void }) {
  const fmt = useSpaceFormatters();
  const [day, setDay] = useState(current && isISODate(current) ? current : todayISO());
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isISODate(day)) return;
    if (target.type === 'post') setPostsDate(target.contentId, [target.postId], day);
    else if (target.type === 'shoot') setShootDate(target.shootId, day);
    else setMilestone(target.msId, { date: day });
    onClose();
    undoToast(`Moved to ${fmt.dateMedium(day)}`);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="sp-calendar-pop">
      <form className="sp-calendar-pop-form" onSubmit={submit}>
        <div className="sp-calendar-pop-head">
          <h4 title={label}>Move “{label}”</h4>
        </div>
        <Field label="New date">
          <DateInput value={day} onChange={(v) => setDay(v ?? '')} />
        </Field>
        <div className="sp-calendar-pop-actions">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={!isISODate(day)}>
            Move
          </Button>
        </div>
      </form>
    </Popover>
  );
}

/* ---------------------------------------------------------------- all items of a day */

export function MorePopover({ anchor, date, items, onCreate, onClose }: { anchor: AnchorRect; date: string; items: CalItem[]; onCreate: () => void; onClose: () => void }) {
  const fmt = useSpaceFormatters();
  return (
    <Popover anchor={anchor} onClose={onClose} className="sp-calendar-pop more">
      <div className="sp-calendar-pop-head">
        <h4>{fmt.dateLong(date)}</h4>
        <Button size="sm" variant="ghost" className="icon" aria-label="New on this day" title="New on this day" onClick={onCreate}>
          <Plus />
        </Button>
      </div>
      <div className="sp-calendar-more-list">
        {items.map((it) => (
          <DraggableItem key={it.key} it={it} variant="chip" scope="more" />
        ))}
      </div>
    </Popover>
  );
}
