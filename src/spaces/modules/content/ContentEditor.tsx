/* The content editor: opens over any space screen when useSpaceUI.contentId is
   set (openContent(id, tab)); Esc / close → closeContent(). Also hosts the
   New content and Repurpose dialogs so they work from every screen. */
import './content.css';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BarChart3, CalendarDays, Camera, ChevronLeft, ChevronRight, Clapperboard, ExternalLink, FileText, Link2, ListChecks, MoreHorizontal, PenLine, Recycle, Send, TriangleAlert, X } from 'lucide-react';
import type { ID } from '@/types';
import { spaceRedo, spaceUndo, useSpace, useSpaceFormatters, useSpaceStore } from '@/store/space';
import { FORMATS, POST_STATUSES, STAGES } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import type { ContentPiece, ContentStage } from '@/spaces/types';
import { closeContent, openContent, useProjectList, useSpaceUI, type ContentTab } from '@/spaces/ui';
import { aspectToNumber } from '@/lib/constants';
import { Button, Checkbox, Combo, IconButton, ImageDrop, Menu, Modal, Progress, Select, UnderlineTabs } from '@/ui';
import { shortDate } from './Board';
import { BriefTab } from './EditorBrief';
import { ProduceTab } from './EditorProduce';
import { PublishTab } from './EditorPublish';
import { ResultsTab } from './EditorResults';
import { WriteTab } from './EditorWrite';
import { NewContentDialog } from './NewContentDialog';
import { RepurposeDialog } from './RepurposeDialog';
import { FormatIcon, StageBadge } from './parts';
import { PRIORITIES, assign, changeFormat, checklistProgress, contentMenuItems, patchContent, setStage, stageColor, updateContent, useOwnerSuggestions, withMissing } from './shared';
import { useContentOrder } from './store';

/* ---------------------------------------------------------------- host */

export function ContentEditorHost() {
  const id = useSpaceUI((s) => s.contentId);
  const hasSpace = useSpaceStore((s) => !!s.space);
  const exists = useSpaceStore((s) => (id && s.space ? s.space.content.some((c) => c.id === id) : false));

  // the piece was deleted (or undone away) while open → close quietly
  useEffect(() => {
    if (id && hasSpace && !exists) closeContent();
  }, [id, hasSpace, exists]);

  if (!hasSpace) return null;
  return (
    <>
      {id && exists && (
        <EditorBoundary key={id}>
          <ContentEditor id={id} />
        </EditorBoundary>
      )}
      <NewContentDialog />
      <RepurposeDialog />
    </>
  );
}

class EditorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error)
      return (
        <Modal open size="sm" title="The editor ran into a problem" onClose={closeContent} footer={<Button onClick={() => this.setState({ error: null })}>Try again</Button>}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <TriangleAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p style={{ marginTop: 0 }}>Your content is safe. Close the editor and open the piece again.</p>
              <p className="mono small muted">{this.state.error.message}</p>
            </div>
          </div>
        </Modal>
      );
    return this.props.children;
  }
}

/* ---------------------------------------------------------------- editor */

const TAB_ORDER: ContentTab[] = ['brief', 'write', 'produce', 'publish', 'results'];

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function ContentEditor({ id }: { id: ID }) {
  const c = useSpace((s) => s.content.find((x) => x.id === id)) as ContentPiece;
  const tab = useSpaceUI((s) => s.contentTab);
  const setTab = (t: ContentTab) => useSpaceUI.setState({ contentTab: t });
  const content = useSpace((s) => s.content);
  const order = useContentOrder((s) => s.ids);
  const titleRef = useRef<HTMLInputElement>(null);

  const ids = useMemo(() => {
    const all = content.map((x) => x.id);
    const existing = new Set(all);
    const o = order.filter((x) => existing.has(x));
    return o.includes(id) ? o : all;
  }, [content, order, id]);
  const idx = ids.indexOf(id);
  const go = (d: -1 | 1) => {
    const next = ids[idx + d];
    if (next) openContent(next, tab);
  };

  // new pieces: put the cursor in the title
  useEffect(() => {
    if (c && (!c.title || c.title === 'Untitled content')) {
      requestAnimationFrame(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      });
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      spaceUndo();
    } else if (mod && !e.altKey && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      spaceRedo();
    } else if (e.altKey && !mod && isTextTarget(e.target)) {
      // Alt+arrows / Alt+digits edit text on some platforms: leave them alone in fields
      return;
    } else if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      go(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.altKey && !mod && /^[1-5]$/.test(e.key)) {
      e.preventDefault();
      setTab(TAB_ORDER[Number(e.key) - 1]);
    }
  };

  const published = c.posts.filter((p) => p.status === 'published').length;

  return (
    <Modal open size="full" onClose={closeContent} bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="sp-content-editor" onKeyDown={onKeyDown} style={{ ['--st' as string]: stageColor(c.stage) }}>
        <header className="sp-content-ed-head">
          <div className="sp-content-ed-titlebar">
            <span className="sp-content-ed-icon" title={FORMATS.find((f) => f.value === c.format)?.label}>
              <FormatIcon format={c.format} size={18} />
            </span>
            <input
              ref={titleRef}
              className="sp-content-ed-title"
              value={c.title}
              placeholder="Untitled content"
              onChange={(e) => patchContent(c.id, { title: e.target.value }, 'title')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Title"
              spellCheck
            />
            <div className="sp-content-ed-nav">
              <IconButton icon={ChevronLeft} label="Previous piece (Alt+←)" disabled={idx <= 0} onClick={() => go(-1)} />
              <span className="sp-content-ed-pos">{idx >= 0 ? `${idx + 1} / ${ids.length}` : ''}</span>
              <IconButton icon={ChevronRight} label="Next piece (Alt+→)" disabled={idx < 0 || idx >= ids.length - 1} onClick={() => go(1)} />
            </div>
            <Menu align="end" trigger={<IconButton icon={MoreHorizontal} label="More actions" />} items={() => contentMenuItems(c, { inEditor: true })} />
            <IconButton icon={X} label="Close (Esc)" onClick={closeContent} />
          </div>
          <StageStepper stage={c.stage} onChange={(s) => setStage(c.id, s)} />
          <Props c={c} />
          <UnderlineTabs<ContentTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'brief', label: 'Brief', icon: FileText },
              { id: 'write', label: 'Write', icon: PenLine },
              { id: 'produce', label: 'Produce', icon: Clapperboard, count: c.shots.length || undefined },
              { id: 'publish', label: 'Publish', icon: Send, count: c.posts.length || undefined },
              { id: 'results', label: 'Results', icon: BarChart3, count: published || undefined },
            ]}
          />
        </header>
        <div className="sp-content-ed-main">
          <div className="sp-content-ed-body">
            {tab === 'brief' && <BriefTab c={c} />}
            {tab === 'write' && <WriteTab key={c.id} c={c} />}
            {tab === 'produce' && <ProduceTab c={c} />}
            {tab === 'publish' && <PublishTab c={c} />}
            {tab === 'results' && <ResultsTab c={c} />}
          </div>
          <Glance c={c} onTab={setTab} />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- header parts */

function StageStepper({ stage, onChange }: { stage: ContentStage; onChange: (s: ContentStage) => void }) {
  const idx = STAGES.findIndex((s) => s.value === stage);
  return (
    <div className="sp-content-stepper" role="radiogroup" aria-label="Stage">
      {STAGES.map((s, i) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={i === idx}
          className={['sp-content-step', i < idx && 'past', i === idx && 'on'].filter(Boolean).join(' ')}
          style={{ ['--st' as string]: s.color }}
          title={s.hint}
          onClick={() => onChange(s.value)}
        >
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function Prop({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return (
    <label className="sp-content-prop">
      <span className="sp-content-prop-label">{label}</span>
      <span className="sp-content-prop-control">
        {color && <span className="color-dot" style={{ background: color, width: 8, height: 8 }} />}
        {children}
      </span>
    </label>
  );
}

function Props({ c }: { c: ContentPiece }) {
  const pillars = useSpace((s) => s.pillars) ?? [];
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const owners = useOwnerSuggestions();
  const projects = useProjectList();
  const pillar = pillars.find((p) => p.id === c.pillarId);
  const campaign = campaigns.find((p) => p.id === c.campaignId);
  const project = projects.find((p) => p.id === c.projectId);
  const openProject = () => {
    if (!c.projectId) return;
    const pid = c.projectId;
    closeContent();
    void import('@/shell/projectActions').then((m) => m.openProjectById(pid));
  };
  return (
    <div className="sp-content-props">
      <Prop label="Format">
        <Select bare size="sm" value={c.format} options={FORMATS} onChange={(v) => changeFormat(c.id, v as ContentPiece['format'])} aria-label="Format" />
      </Prop>
      <Prop label="Priority" color={PRIORITIES.find((p) => p.value === (c.priority ?? 'normal'))?.color}>
        <Select bare size="sm" value={c.priority ?? 'normal'} options={PRIORITIES} onChange={(v) => patchContent(c.id, { priority: v as ContentPiece['priority'] })} aria-label="Priority" />
      </Prop>
      <Prop label="Pillar" color={pillar?.color}>
        <Select
          bare
          size="sm"
          value={c.pillarId ?? ''}
          options={withMissing(pillars.map((p) => ({ value: p.id, label: p.name })), c.pillarId, 'Deleted pillar')}
          placeholder={pillars.length ? 'No pillar' : 'No pillars yet'}
          onChange={(v) => patchContent(c.id, { pillarId: v || undefined })}
          aria-label="Pillar"
        />
      </Prop>
      <Prop label="Campaign" color={campaign?.color}>
        <Select
          bare
          size="sm"
          value={c.campaignId ?? ''}
          options={withMissing(campaigns.map((p) => ({ value: p.id, label: p.name })), c.campaignId, 'Deleted campaign')}
          placeholder={campaigns.length ? 'No campaign' : 'No campaigns yet'}
          onChange={(v) => patchContent(c.id, { campaignId: v || undefined })}
          aria-label="Campaign"
        />
      </Prop>
      <Prop label="Owner">
        <Combo bare size="sm" value={c.owner} suggestions={owners} placeholder="Unassigned" onChange={(v) => patchContent(c.id, { owner: v || undefined }, 'owner')} aria-label="Owner" />
      </Prop>
      <Prop label="Production">
        <Select
          bare
          size="sm"
          value={c.projectId ?? ''}
          options={withMissing(projects.map((p) => ({ value: p.id, label: p.title || 'Untitled project' })), c.projectId, 'Unavailable project')}
          placeholder={projects.length ? 'Not linked' : 'No projects'}
          onChange={(v) => patchContent(c.id, { projectId: v || undefined })}
          aria-label="Linked production project"
        />
        {project && <IconButton icon={ExternalLink} size="sm" label={`Open “${project.title}”`} onClick={openProject} />}
      </Prop>
    </div>
  );
}

/* ---------------------------------------------------------------- side panel */

function Glance({ c, onTab }: { c: ContentPiece; onTab: (t: ContentTab) => void }) {
  const channels = useSpace((s) => s.channels) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const fmt = useSpaceFormatters();
  const chMap = useMemo(() => new Map(channels.map((ch) => [ch.id, ch])), [channels]);
  const prog = checklistProgress(c);
  const source = c.sourceId ? content.find((x) => x.id === c.sourceId) : undefined;
  const derived = useMemo(() => content.filter((x) => x.sourceId === c.id), [content, c.id]);
  const aspect = aspectToNumber(c.aspect);
  const posts = useMemo(() => [...c.posts].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '').localeCompare(b.time ?? '')), [c.posts]);

  return (
    <aside className="sp-content-ed-side" aria-label="At a glance">
      <div className="sp-content-glance-thumb" style={{ maxWidth: aspect < 1 ? 150 : undefined }}>
        <ImageDrop value={c.thumbnail} aspect={Math.max(0.5, Math.min(2, aspect))} onChange={(v) => patchContent(c.id, { thumbnail: v })} label="Thumbnail" />
      </div>

      <div className="sp-content-glance-sec">
        <button type="button" className="sp-content-glance-title" onClick={() => onTab('publish')}>
          <Send size={12} /> Posts <span className="sp-content-count">{c.posts.length}</span>
        </button>
        {posts.length === 0 ? (
          <div className="muted small">
            Not planned yet.{' '}
            <button type="button" className="sp-content-linkbtn" onClick={() => onTab('publish')}>
              Plan posts
            </button>
          </div>
        ) : (
          posts.map((p) => {
            const ch = chMap.get(p.channelId);
            const st = POST_STATUSES.find((s) => s.value === p.status);
            return (
              <button key={p.id} type="button" className="sp-content-glance-post" onClick={() => onTab('publish')} title={`${ch?.name ?? 'Deleted channel'} · ${st?.label ?? p.status}`}>
                <span className="color-dot" style={{ background: ch ? channelColor(ch) : '#8a8a94', width: 8, height: 8 }} />
                <span className="ellipsis grow">{ch?.name ?? 'Deleted channel'}</span>
                <span className="muted tiny nowrap">{p.date ? `${shortDate(fmt, p.date)}${p.time ? ` ${fmt.time(p.time)}` : ''}` : '—'}</span>
                <span className={`sp-content-glance-status ${p.status}`} style={{ ['--ps' as string]: st?.color }} />
              </button>
            );
          })
        )}
      </div>

      <div className="sp-content-glance-sec">
        <button type="button" className="sp-content-glance-title" onClick={() => onTab('produce')}>
          <ListChecks size={12} /> Checklist{' '}
          <span className="sp-content-count">
            {prog.done}/{prog.total}
          </span>
        </button>
        {prog.total > 0 && <Progress value={prog.done / prog.total} color={prog.done === prog.total ? 'var(--success)' : undefined} style={{ margin: '2px 0 6px' }} />}
        {c.checklist.map((item) => (
          <div key={item.id} className={`sp-content-glance-check ${item.done ? 'done' : ''}`}>
            <Checkbox
              checked={item.done}
              onChange={(v) =>
                updateContent(c.id, (x) => {
                  const it = x.checklist.find((i) => i.id === item.id);
                  if (it) assign(it, { done: v || undefined });
                })
              }
              label={item.text || 'Untitled step'}
            />
          </div>
        ))}
      </div>

      {(c.shootDate || c.editDue || c.shootId) && (
        <div className="sp-content-glance-sec">
          <div className="sp-content-glance-title static">
            <CalendarDays size={12} /> Dates
          </div>
          {c.shootDate && (
            <div className="sp-content-glance-kv">
              <Camera size={12} /> Shoot <span className="grow" /> {fmt.dateMedium(c.shootDate)}
            </div>
          )}
          {c.editDue && (
            <div className="sp-content-glance-kv">
              <PenLine size={12} /> Edit due <span className="grow" /> {fmt.dateMedium(c.editDue)}
            </div>
          )}
        </div>
      )}

      {(source || derived.length > 0 || c.sourceId) && (
        <div className="sp-content-glance-sec">
          <div className="sp-content-glance-title static">
            <Link2 size={12} /> Repurposing
          </div>
          {c.sourceId && (
            <button type="button" className="sp-content-glance-link" disabled={!source} onClick={() => source && openContent(source.id)}>
              <Recycle size={12} />
              <span className="ellipsis">From: {source ? source.title || 'Untitled content' : 'deleted piece'}</span>
            </button>
          )}
          {derived.map((d) => (
            <button key={d.id} type="button" className="sp-content-glance-link" onClick={() => openContent(d.id)}>
              <FormatIcon format={d.format} size={12} />
              <span className="ellipsis grow">{d.title || 'Untitled content'}</span>
              <StageBadge stage={d.stage} />
            </button>
          ))}
        </div>
      )}

      <div className="sp-content-glance-foot muted tiny">Created {fmt.dateMedium(c.createdAt?.slice(0, 10))}</div>
    </aside>
  );
}
