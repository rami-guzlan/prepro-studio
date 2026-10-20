/* Campaign list + detail editor (fields, stats, content pieces, milestones). */
import { useMemo, useState, type ReactNode } from 'react';
import { Copy, Flag, Megaphone, MoreHorizontal, Plus, Rocket, Trash2, X } from 'lucide-react';
import type { Campaign, CampaignStatus, ContentPiece, SpaceMilestone } from '@/spaces/types';
import { CAMPAIGN_STATUSES, STAGES, STAGE_BY_ID } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import { makeContent } from '@/spaces/defaults';
import { openContent, useProjectList } from '@/spaces/ui';
import { updateSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { optionColor } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { Badge, Button, Checkbox, DateInput, EmptyState, Field, IconButton, Input, Menu, MultiSelect, NumberInput, Select, StatusBadge, Textarea } from '@/ui';
import {
  ColorButton,
  FormatIcon,
  addMilestone,
  campaignOps,
  campaignRange,
  campaignStats,
  campaignTiming,
  deleteCampaign,
  duplicateCampaign,
  isISO,
  milestoneOps,
  nextPostDate,
  plural,
  relativeDay,
  sortCampaigns,
  stripYear,
} from './shared';

/** Focus and select a freshly created campaign's name (stable callback ref). */
function focusSelect(el: HTMLInputElement | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.focus();
    el.select();
  });
}

function currencySymbol(code: string | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code || 'USD' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

export function CampaignsPanel({
  selectedId,
  onSelect,
  onNewCampaign,
  onPhases,
  focusName,
  hideEmpty,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewCampaign: () => void;
  onPhases: () => void;
  focusName: string | null;
  /** the roadmap above already shows the "no campaigns" call to action */
  hideEmpty?: boolean;
}) {
  const campaigns = useSpace((s) => s.campaigns);
  const content = useSpace((s) => s.content);
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const sorted = useMemo(() => sortCampaigns(campaigns ?? []), [campaigns]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of content) if (c.campaignId) m.set(c.campaignId, (m.get(c.campaignId) ?? 0) + 1);
    return m;
  }, [content]);
  const selected = sorted.find((c) => c.id === selectedId) ?? sorted[0];

  if (sorted.length === 0) {
    if (hideEmpty) return null;
    return (
      <div className="card">
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Group content, milestones and dates into campaigns — e.g. Tease, Trailer launch, Festival run, Release. Each gets an objective, a call to action and its own content list."
          action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button variant="primary" icon={Plus} onClick={onNewCampaign}>
                New campaign
              </Button>
              <Button icon={Rocket} onClick={onPhases}>
                Start with launch phases
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const move = (dir: 1 | -1) => {
    const i = sorted.findIndex((c) => c.id === selected?.id);
    const next = sorted[i + dir];
    if (next) {
      onSelect(next.id);
      requestAnimationFrame(() => (document.querySelector(`[data-campaign-id="${CSS.escape(next.id)}"]`) as HTMLElement | null)?.focus());
    }
  };

  return (
    <div className="card sp-campaigns-panel">
      <div className="sp-campaigns-list">
        <div className="sp-campaigns-list-head">
          <span>Campaigns</span>
          <span className="muted">{sorted.length}</span>
          <span className="spacer" />
          <IconButton icon={Plus} size="sm" label="New campaign" onClick={onNewCampaign} />
        </div>
        <div className="sp-campaigns-list-items" role="listbox" aria-label="Campaigns">
          {sorted.map((c) => {
            const t = campaignTiming(c, today);
            const r = campaignRange(c);
            const on = c.id === selected?.id;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={on}
                data-campaign-id={c.id}
                className={`sp-campaigns-item ${on ? 'on' : ''}`}
                style={{ ['--cc' as string]: c.color || 'var(--accent)' }}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    move(1);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    move(-1);
                  } else if (e.key === 'Delete') {
                    e.preventDefault();
                    deleteCampaign(c);
                  }
                }}
              >
                <div className="sp-campaigns-item-top">
                  <b className="ellipsis">{c.name || 'Untitled campaign'}</b>
                  {t.tone === 'active' && <span className="sp-campaigns-live">Live</span>}
                </div>
                <div className="sp-campaigns-item-sub">
                  <span className="ellipsis">{r.start ? (r.start === r.end ? stripYear(fmt.dateMedium(r.start)) : `${stripYear(fmt.dateMedium(r.start))} – ${stripYear(fmt.dateMedium(r.end))}`) : 'No dates'}</span>
                  <span className="spacer" />
                  <span>{plural(counts.get(c.id) ?? 0, 'piece')}</span>
                </div>
                <div className="sp-campaigns-item-sub">
                  <StatusBadge value={c.status} options={CAMPAIGN_STATUSES} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="sp-campaigns-detail">{selected && <CampaignDetail key={selected.id} c={selected} autoFocusName={focusName === selected.id} onDeleted={() => onSelect(null)} onDuplicated={(id) => onSelect(id)} />}</div>
    </div>
  );
}

/* ======================================================================== detail */

function MiniStat({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sp-campaigns-mini">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      {children}
      {sub != null && <span className="s">{sub}</span>}
    </div>
  );
}

function CampaignDetail({ c, autoFocusName, onDeleted, onDuplicated }: { c: Campaign; autoFocusName: boolean; onDeleted: () => void; onDuplicated: (id: string) => void }) {
  const content = useSpace((s) => s.content);
  const milestones = useSpace((s) => s.milestones);
  const channels = useSpace((s) => s.channels);
  const currency = useSpace((s) => s.settings?.currency);
  const projects = useProjectList();
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const stats = useMemo(() => campaignStats(c, { content, milestones }), [c, content, milestones]);
  const timing = campaignTiming(c, today);
  const set = (patch: Partial<Campaign>, coalesce = false) => campaignOps.update(c.id, patch, coalesce);
  const statusColor = optionColor(CAMPAIGN_STATUSES, c.status) ?? '#888';

  const channelOptions = useMemo(() => channels.map((ch) => ({ value: ch.id, label: ch.name || 'Channel', color: channelColor(ch) })), [channels]);
  const projectOptions = useMemo(() => {
    const opts = projects.map((p) => ({ value: p.id, label: p.title || 'Untitled project' }));
    if (c.projectId && !opts.some((o) => o.value === c.projectId)) opts.unshift({ value: c.projectId, label: projects.length ? 'Missing project' : 'Linked project' });
    return opts;
  }, [projects, c.projectId]);

  const pieces = useMemo(() => [...stats.pieces].sort((a, b) => (nextPostDate(a, today) ?? '9999').localeCompare(nextPostDate(b, today) ?? '9999')), [stats.pieces, today]);
  const others = useMemo(() => content.filter((x) => x.campaignId !== c.id), [content, c.id]);
  const ms = useMemo(() => milestones.filter((m) => m.campaignId === c.id).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')), [milestones, c.id]);
  const chById = useMemo(() => new Map(channels.map((ch) => [ch.id, ch])), [channels]);
  const allCampaigns = useSpace((s) => s.campaigns);
  const campNameById = useMemo(() => new Map(allCampaigns.map((x) => [x.id, x.name])), [allCampaigns]);

  const addContent = () => {
    const piece = makeContent({ campaignId: c.id, projectId: c.projectId, title: 'Untitled content' });
    updateSpace((d) => {
      d.content.push(piece);
    });
    openContent(piece.id);
  };

  const assign = (id: string) => {
    if (!id) return;
    updateSpace((d) => {
      const x = d.content.find((y) => y.id === id);
      if (x) x.campaignId = c.id;
    });
  };

  const unassign = (piece: ContentPiece) =>
    updateSpace((d) => {
      const x = d.content.find((y) => y.id === piece.id);
      if (x) delete x.campaignId;
    });

  return (
    <div className="sp-campaigns-detail-inner" style={{ ['--cc' as string]: c.color || 'var(--accent)' }}>
      <div className="sp-campaigns-detail-head">
        <ColorButton value={c.color} onChange={(v) => set({ color: v })} label="Campaign colour" size={26} />
        <input
          ref={autoFocusName ? focusSelect : undefined}
          className="sp-campaigns-name"
          value={c.name}
          placeholder="Campaign name"
          onChange={(e) => set({ name: e.target.value }, true)}
          aria-label="Campaign name"
        />
        <Select
          className="sp-campaigns-pill"
          value={c.status}
          options={CAMPAIGN_STATUSES}
          onChange={(v) => set({ status: v as CampaignStatus })}
          style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 14%, transparent)` }}
          aria-label="Campaign status"
        />
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="Campaign actions" />}
          items={[
            { label: 'Duplicate campaign', icon: Copy, onClick: () => onDuplicated(duplicateCampaign(c).id) },
            { separator: true },
            {
              label: 'Delete campaign',
              icon: Trash2,
              danger: true,
              onClick: async () => {
                if (await deleteCampaign(c)) onDeleted();
              },
            },
          ]}
        />
      </div>
      <div className={`sp-campaigns-timing ${timing.tone ?? ''}`}>{timing.label}</div>

      <div className="sp-campaigns-minis">
        <MiniStat
          label="Content"
          value={stats.pieces.length}
          sub={stats.pieces.length ? STAGES.filter((st) => stats.byStage[st.value]).map((st) => `${stats.byStage[st.value]} ${st.label.toLowerCase()}`).join(' · ') : 'none yet'}
        >
          {stats.pieces.length > 0 && (
            <span className="sp-campaigns-stagebar" title={STAGES.filter((s) => stats.byStage[s.value]).map((s) => `${s.label}: ${stats.byStage[s.value]}`).join('\n')}>
              {STAGES.map((s) => (stats.byStage[s.value] ? <span key={s.value} style={{ flexGrow: stats.byStage[s.value], background: s.color }} /> : null))}
            </span>
          )}
        </MiniStat>
        <MiniStat label="Posts" value={`${stats.published}/${stats.postsTotal}`} sub={stats.postsTotal ? `published · ${stats.scheduled} scheduled${stats.drafts ? ` · ${stats.drafts} draft` : ''}` : 'no posts planned'} />
        <MiniStat label="Milestones" value={`${stats.msDone}/${stats.msTotal}`} sub={stats.msTotal ? 'done' : 'none yet'} />
        <MiniStat label="Budget" value={c.budget ? fmt.money(c.budget, { cents: false }) : '—'} sub={c.budget ? 'planned' : 'not set'} />
      </div>

      <div className="sp-campaigns-form">
        <Field label="Objective" span="all">
          <Input value={c.objective} placeholder="What should this campaign achieve? e.g. 50k trailer views in launch week" onChange={(v) => set({ objective: v || undefined }, true)} />
        </Field>
        <Field label="Start">
          <DateInput value={c.start} onChange={(v) => set({ start: v })} />
        </Field>
        <Field label="End">
          <DateInput value={c.end} onChange={(v) => set({ end: v })} />
        </Field>
        <Field label="Budget">
          <NumberInput value={c.budget} decimals={2} prefix={currencySymbol(currency)} placeholder="0.00" onChange={(v) => set({ budget: v }, true)} />
        </Field>
        <Field label="Linked production">
          <Select value={c.projectId ?? ''} options={projectOptions} placeholder={projectOptions.length ? 'None' : 'No projects yet'} onChange={(v) => set({ projectId: v || undefined })} />
        </Field>
        <Field label="Channels" span={2}>
          {channelOptions.length ? (
            <MultiSelect value={(c.channelIds ?? []).filter((id) => chById.has(id))} options={channelOptions} placeholder="Add channel…" onChange={(v) => set({ channelIds: v })} />
          ) : (
            <button type="button" className="sp-campaigns-link" onClick={() => navigateSpace('channels')}>
              Add channels first
            </button>
          )}
        </Field>
        <Field label="Call to action / offer" span={2}>
          <Input value={c.cta} placeholder="e.g. Watch the trailer — link in bio · Get tickets for the premiere" onChange={(v) => set({ cta: v || undefined }, true)} />
        </Field>
        <Field label="Description" span="all">
          <Textarea autoGrow minRows={2} value={c.description} placeholder="The idea of the campaign, the story arc across posts, who it’s for…" onChange={(v) => set({ description: v || undefined }, true)} />
        </Field>
        <Field label="Notes" span="all">
          <Textarea autoGrow minRows={2} value={c.notes} placeholder="Partners, assets to request, approvals, lessons learned…" onChange={(v) => set({ notes: v || undefined }, true)} />
        </Field>
      </div>

      <div className="sp-campaigns-section">
        <div className="sp-campaigns-section-head">
          <span>Content in this campaign</span>
          <Badge>{pieces.length}</Badge>
          <span className="spacer" />
          {others.length > 0 && (
            <Select
              size="sm"
              className="sp-campaigns-assign"
              value=""
              placeholder="Add existing…"
              options={others.map((x) => ({ value: x.id, label: `${x.title || 'Untitled content'}${x.campaignId && campNameById.get(x.campaignId) ? ` (in ${campNameById.get(x.campaignId)})` : ''}` }))}
              onChange={assign}
              aria-label="Add existing content to this campaign"
            />
          )}
          <Button size="sm" variant="primary" icon={Plus} onClick={addContent}>
            Add content
          </Button>
        </div>
        {pieces.length === 0 ? (
          <div className="sp-campaigns-none">No content yet — add the trailer, teasers, posts and stories this campaign needs.</div>
        ) : (
          <div className="sp-campaigns-pieces">
            {pieces.map((p) => {
              const st = STAGE_BY_ID[p.stage];
              const next = nextPostDate(p, today);
              const postChannels = [...new Set(p.posts.filter((x) => x.status !== 'skipped').map((x) => x.channelId))].map((id) => chById.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
              return (
                <div key={p.id} className="sp-campaigns-piece">
                  <button type="button" className="sp-campaigns-piece-main" onClick={() => openContent(p.id)} title="Open in the content editor">
                    <FormatIcon format={p.format} />
                    <span className="sp-campaigns-piece-title ellipsis">{p.title || 'Untitled content'}</span>
                    <span className="sp-campaigns-piece-chs">
                      {postChannels.slice(0, 5).map((ch) => (
                        <span key={ch.id} className="color-dot" style={{ background: channelColor(ch) }} title={ch.name} />
                      ))}
                    </span>
                    <span className={`sp-campaigns-piece-date ${next && next < today && p.stage !== 'published' ? 'late' : ''}`}>{next ? `${stripYear(fmt.dateMedium(next))}` : 'Unscheduled'}</span>
                    {st && (
                      <span className="sp-campaigns-stage" style={{ ['--st' as string]: st.color }}>
                        {st.label}
                      </span>
                    )}
                  </button>
                  <IconButton icon={X} size="sm" label="Remove from campaign" onClick={() => unassign(p)} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sp-campaigns-section">
        <div className="sp-campaigns-section-head">
          <span>Milestones</span>
          <Badge>{ms.length}</Badge>
        </div>
        {ms.length > 0 && (
          <div className="sp-campaigns-cms">
            {ms.map((m) => (
              <CampaignMilestoneRow key={m.id} m={m} today={today} />
            ))}
          </div>
        )}
        <MilestoneQuickAdd campaignId={c.id} placeholder={`Add a milestone to ${c.name || 'this campaign'} and press Enter`} />
      </div>
    </div>
  );
}

function CampaignMilestoneRow({ m, today }: { m: SpaceMilestone; today: string }) {
  const fmt = useSpaceFormatters();
  const late = !m.done && isISO(m.date) && m.date < today;
  return (
    <div className={`sp-campaigns-cm ${m.done ? 'done' : ''}`}>
      <Checkbox checked={m.done} onChange={(v) => milestoneOps.update(m.id, { done: v }, false)} title={m.done ? 'Mark as not done' : 'Mark as done'} />
      <Flag size={13} className="sp-campaigns-cm-flag" />
      <Input bare size="sm" value={m.name} placeholder="Milestone" onChange={(v) => milestoneOps.update(m.id, { name: v })} />
      <span className={`sp-campaigns-when ${late ? 'late' : ''}`} title={m.date ? fmt.dateLong(m.date) : undefined}>
        {isISO(m.date) ? `${stripYear(fmt.dateMedium(m.date))} · ${relativeDay(m.date, today)}` : 'No date'}
      </span>
    </div>
  );
}

/** Quick add for milestones: name + optional date, Enter to add. */
export function MilestoneQuickAdd({ campaignId, placeholder, inputRef }: { campaignId?: string; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | undefined>(undefined);
  const add = () => {
    const n = name.trim();
    if (!n) return;
    addMilestone({ name: n, date: date ?? undefined, campaignId });
    setName('');
  };
  return (
    <div className="sp-campaigns-quick">
      <Plus size={15} />
      <input
        ref={inputRef}
        className="input bare"
        value={name}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Escape') setName('');
        }}
        aria-label="New milestone name"
      />
      <DateInput size="sm" value={date ?? ''} onChange={setDate} title="Date (optional)" />
      <Button size="sm" onClick={add} disabled={!name.trim()}>
        Add
      </Button>
    </div>
  );
}
