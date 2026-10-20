/* Linked Projects — the production projects this space promotes (a film's
   release campaign links the film), with the content and campaigns tied to each. */
import './projects.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Eraser, FolderX, Link2, Megaphone, MoreHorizontal, Plus, RefreshCw, Unlink } from 'lucide-react';
import type { ID, ProjectSummary } from '@/types';
import type { Campaign, ContentPiece } from '@/spaces/types';
import { CAMPAIGN_STATUSES, FORMAT_BY_ID, STAGE_BY_ID } from '@/spaces/constants';
import { makeContent } from '@/spaces/defaults';
import { firstPostDate } from '@/spaces/derive';
import { openContent, refreshProjectList, useProjectList, useSpaceUI } from '@/spaces/ui';
import { spaceUndo, updateSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { openProjectById } from '@/shell/projectActions';
import { PROJECT_STATUSES, PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { plural } from '@/lib/text';
import { Badge, Button, confirmDialog, EmptyState, IconButton, Menu, ModuleHeader, StatusBadge, toast, type AnchorRect, type MenuItem } from '@/ui';
import { Poster } from './Poster';
import { ProjectPicker } from './ProjectPicker';

/* ---------------------------------------------------------------- actions */

function linkProject(p: ProjectSummary) {
  updateSpace((d) => {
    if (!d.projectIds.includes(p.id)) d.projectIds.push(p.id);
  });
  toast(`Linked ${p.title || 'project'}`);
}

async function unlinkProject(id: ID, title: string, refs: { content: number; campaigns: number }) {
  const n = refs.content + refs.campaigns;
  const ok = await confirmDialog({
    title: `Unlink ${title}?`,
    message: n
      ? `${[refs.content && plural(refs.content, 'content piece'), refs.campaigns && plural(refs.campaigns, 'campaign')].filter(Boolean).join(' and ')} still point to it. They keep that reference and show up under “Referenced but not linked”. The project itself is not changed.`
      : 'The project itself is not changed; you can link it again at any time.',
    confirmLabel: 'Unlink',
    danger: true,
  });
  if (!ok) return;
  updateSpace((d) => {
    d.projectIds = d.projectIds.filter((x) => x !== id);
  });
  toast(`Unlinked ${title}`, 'success', { action: { label: 'Undo', onClick: () => spaceUndo() } });
}

async function clearReferences(id: ID, refs: { content: number; campaigns: number }) {
  const ok = await confirmDialog({
    title: 'Remove references to the missing project?',
    message: `${[refs.content && plural(refs.content, 'content piece'), refs.campaigns && plural(refs.campaigns, 'campaign')].filter(Boolean).join(' and ')} will no longer point to it, and it is unlinked from this space.`,
    confirmLabel: 'Remove references',
    danger: true,
  });
  if (!ok) return;
  updateSpace((d) => {
    d.projectIds = d.projectIds.filter((x) => x !== id);
    for (const c of d.content) if (c.projectId === id) delete c.projectId;
    for (const c of d.campaigns) if (c.projectId === id) delete c.projectId;
  });
  toast('References removed', 'success', { action: { label: 'Undo', onClick: () => spaceUndo() } });
}

function newContentFor(p: { id: ID; title?: string; projectType?: string }) {
  const format = p.projectType === 'trailer' ? 'trailer' : 'short_video';
  const piece = makeContent({ projectId: p.id, format, title: p.title ? `${p.title} — new piece` : 'Untitled content' });
  updateSpace((d) => void d.content.unshift(piece));
  openContent(piece.id, 'brief');
}

function attachContent(contentId: ID, projectId: ID) {
  updateSpace((d) => {
    const c = d.content.find((x) => x.id === contentId);
    if (c) c.projectId = projectId;
  });
}

/* ---------------------------------------------------------------- helpers */

function relTime(iso: string | undefined, fmtDate: (iso: string) => string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return fmtDate(iso.slice(0, 10));
}

interface Refs {
  content: ContentPiece[];
  campaigns: Campaign[];
}

/* ---------------------------------------------------------------- linked card */

function ContentRows({ items }: { items: ContentPiece[] }) {
  const fmt = useSpaceFormatters();
  return (
    <div className="sp-projects-rows">
      {items.map((c) => {
        const stage = STAGE_BY_ID[c.stage];
        const Icon = FORMAT_BY_ID[c.format]?.icon;
        const first = firstPostDate(c);
        return (
          <button key={c.id} type="button" className="sp-projects-row" onClick={() => openContent(c.id)} title="Open in the content editor">
            {Icon ? <Icon size={14} className="muted" /> : <span style={{ width: 14 }} />}
            <span className="grow ellipsis">{c.title || 'Untitled content'}</span>
            {first && <span className="muted tiny nowrap">{fmt.dateShort(first)}</span>}
            <Badge color={stage?.color ?? '#888'}>
              <span className="dot" />
              {stage?.label ?? c.stage}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

function CampaignRows({ items }: { items: Campaign[] }) {
  const fmt = useSpaceFormatters();
  return (
    <div className="sp-projects-rows">
      {items.map((c) => (
        <button key={c.id} type="button" className="sp-projects-row" onClick={() => navigateSpace('campaigns', { campaignId: c.id })} title="Open in Campaigns & Milestones">
          <span className="color-dot" style={{ background: c.color }} />
          <span className="grow ellipsis">{c.name || 'Untitled campaign'}</span>
          {(c.start || c.end) && (
            <span className="muted tiny nowrap">
              {fmt.dateShort(c.start)}
              {c.end && c.end !== c.start ? ` – ${fmt.dateShort(c.end)}` : ''}
            </span>
          )}
          <StatusBadge value={c.status} options={CAMPAIGN_STATUSES} />
        </button>
      ))}
    </div>
  );
}

function addContentItems(projectId: ID, project: ProjectSummary | undefined, content: ContentPiece[]): MenuItem[] {
  const free = content.filter((c) => !c.projectId).slice(0, 15);
  return [
    { label: 'New content piece for this project', icon: Plus, onClick: () => newContentFor({ id: projectId, title: project?.title, projectType: project?.projectType }) },
    { separator: true },
    { header: free.length ? 'Link existing content' : 'No unlinked content' },
    ...free.map((c) => ({ label: c.title || 'Untitled content', icon: FORMAT_BY_ID[c.format]?.icon, onClick: () => attachContent(c.id, projectId) })),
  ];
}

function LinkedCard({ project, refs, content }: { project: ProjectSummary; refs: Refs; content: ContentPiece[] }) {
  const fmt = useSpaceFormatters();
  const status = PROJECT_STATUSES.find((s) => s.value === project.status);
  const published = refs.content.filter((c) => c.stage === 'published').length;
  return (
    <div className="card sp-projects-card" style={{ ['--pj-color' as string]: project.color || '#6d4aff' }}>
      <div className="sp-projects-card-top">
        <button type="button" className="sp-projects-posterbtn" onClick={() => void openProjectById(project.id)} title="Open project">
          <Poster project={project} width={92} />
        </button>
        <div className="sp-projects-ident">
          <div className="sp-projects-kicker">
            {optionLabel(PROJECT_TYPES, project.projectType) || 'Project'}
            {status && (
              <Badge color={status.color}>
                <span className="dot" />
                {status.label}
              </Badge>
            )}
          </div>
          <h3 className="ellipsis" title={project.title}>
            {project.title || 'Untitled project'}
          </h3>
          {project.subtitle && <div className="sp-projects-sub ellipsis">{project.subtitle}</div>}
          <div className="sp-projects-meta">
            Last edited {relTime(project.updatedAt, (d) => fmt.dateMedium(d))}
            {refs.content.length > 0 && ` · ${plural(refs.content.length, 'content piece')}${published ? ` (${published} published)` : ''}`}
          </div>
          <div className="sp-projects-actions">
            <Button variant="primary" size="sm" icon={ArrowUpRight} onClick={() => void openProjectById(project.id)}>
              Open project
            </Button>
            <Menu align="start" trigger={<Button size="sm" icon={Plus}>Content</Button>} items={() => addContentItems(project.id, project, content)} />
            <div className="spacer" />
            <Menu
              align="end"
              trigger={<IconButton icon={MoreHorizontal} label="More actions" size="sm" />}
              items={[{ label: 'Unlink from this space', icon: Unlink, danger: true, onClick: () => void unlinkProject(project.id, project.title || 'this project', { content: refs.content.length, campaigns: refs.campaigns.length }) }]}
            />
          </div>
        </div>
      </div>
      <div className="sp-projects-card-body">
        <div className="sp-projects-block">
          <div className="sp-projects-block-title">
            Content <span className="badge">{refs.content.length}</span>
          </div>
          {refs.content.length ? (
            <ContentRows items={refs.content} />
          ) : (
            <div className="sp-projects-none">
              No content points to this project yet.{' '}
              <button type="button" className="sp-projects-link" onClick={() => newContentFor({ id: project.id, title: project.title, projectType: project.projectType })}>
                Create a piece
              </button>
            </div>
          )}
        </div>
        <div className="sp-projects-block">
          <div className="sp-projects-block-title">
            Campaigns <span className="badge">{refs.campaigns.length}</span>
          </div>
          {refs.campaigns.length ? (
            <CampaignRows items={refs.campaigns} />
          ) : (
            <div className="sp-projects-none">
              No campaign is tied to it.{' '}
              <button type="button" className="sp-projects-link" onClick={() => navigateSpace('campaigns')}>
                Open campaigns
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingCard({ id, refs }: { id: ID; refs: Refs }) {
  const n = { content: refs.content.length, campaigns: refs.campaigns.length };
  return (
    <div className="card sp-projects-card missing">
      <div className="sp-projects-card-top">
        <span className="sp-projects-poster missing" style={{ width: 92 }}>
          <FolderX size={28} />
        </span>
        <div className="sp-projects-ident">
          <div className="sp-projects-kicker">Linked project</div>
          <h3>Project not found</h3>
          <div className="sp-projects-meta">It may have been deleted, or moved out of the projects folder.</div>
          <div className="sp-projects-meta mono tiny">{id}</div>
          <div className="sp-projects-actions">
            <Button size="sm" icon={Unlink} onClick={() => void unlinkProject(id, 'the missing project', n)}>
              Unlink
            </Button>
            {n.content + n.campaigns > 0 && (
              <Button size="sm" variant="ghost" icon={Eraser} onClick={() => void clearReferences(id, n)}>
                Remove {n.content + n.campaigns} {n.content + n.campaigns === 1 ? 'reference' : 'references'}
              </Button>
            )}
          </div>
        </div>
      </div>
      {refs.content.length > 0 && (
        <div className="sp-projects-card-body single">
          <div className="sp-projects-block">
            <div className="sp-projects-block-title">
              Content still pointing to it <span className="badge">{refs.content.length}</span>
            </div>
            <ContentRows items={refs.content} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- module */

export default function LinkedProjectsModule() {
  const projectIds = useSpace((s) => s.projectIds) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const projects = useProjectList();
  const loading = useSpaceUI((s) => s.projects) === null;
  const [picker, setPicker] = useState<AnchorRect | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const refsFor = useMemo(() => {
    const m = new Map<ID, Refs>();
    const get = (id: ID) => {
      let r = m.get(id);
      if (!r) m.set(id, (r = { content: [], campaigns: [] }));
      return r;
    };
    for (const c of content) if (c.projectId) get(c.projectId).content.push(c);
    for (const c of campaigns) if (c.projectId) get(c.projectId).campaigns.push(c);
    return m;
  }, [content, campaigns]);
  const linked = useMemo(() => [...new Set(projectIds)], [projectIds]);
  const available = useMemo(() => projects.filter((p) => !linked.includes(p.id)), [projects, linked]);
  const unlinkedRefs = useMemo(() => [...refsFor.keys()].filter((id) => !linked.includes(id)), [refsFor, linked]);
  const empty: Refs = { content: [], campaigns: [] };

  const openPicker = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicker({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    if (!loading) void refreshProjectList();
  };

  const refresh = async () => {
    setRefreshing(true);
    await refreshProjectList();
    setRefreshing(false);
  };

  const found = linked.filter((id) => byId.has(id));
  const subtitle = linked.length ? `${plural(linked.length, 'linked production')}${found.length < linked.length && !loading ? ` · ${linked.length - found.length} missing` : ''}` : 'Productions this space promotes';

  return (
    <div className="module sp-projects">
      <ModuleHeader
        title="Linked Projects"
        icon={Link2}
        subtitle={subtitle}
        actions={
          <>
            <IconButton icon={RefreshCw} label="Refresh project list" className={refreshing ? 'sp-projects-spin' : undefined} onClick={() => void refresh()} />
            <Button variant="primary" icon={Link2} onClick={openPicker}>
              Link a project
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="sp-projects-page">
          <div className="sp-projects-intro">
            <Link2 size={16} />
            <span>
              Link the productions this space promotes: a film’s release campaign links the film, a channel links the videos it releases. Content pieces and campaigns can then point to the project, and you can jump straight into
              its script, shots and schedule from here.
            </span>
          </div>

          {loading && linked.length > 0 ? (
            <div className="sp-projects-loading muted">
              <RefreshCw size={14} className="spin" /> Loading projects…
            </div>
          ) : linked.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No linked projects"
              description={
                projects.length || loading
                  ? `Promoting a film or a video? Link its project to tie trailers, teasers and BTS pieces to it.${projects.length ? ` ${plural(projects.length, 'production project')} available.` : ''}`
                  : 'You have no production projects yet. Create one from the library (Projects tab), then link it here to tie trailers, teasers and BTS pieces to it.'
              }
              action={
                projects.length || loading ? (
                  <Button variant="primary" icon={Link2} onClick={openPicker}>
                    Link a project
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="sp-projects-grid">
              {linked.map((id) => {
                const p = byId.get(id);
                const refs = refsFor.get(id) ?? empty;
                return p ? <LinkedCard key={id} project={p} refs={refs} content={content} /> : <MissingCard key={id} id={id} refs={refs} />;
              })}
            </div>
          )}

          {!loading && unlinkedRefs.length > 0 && (
            <div className="sp-projects-section">
              <div className="section-title">Referenced but not linked</div>
              <div className="sp-projects-unlinked">
                {unlinkedRefs.map((id) => {
                  const p = byId.get(id);
                  const refs = refsFor.get(id) ?? empty;
                  const n = { content: refs.content.length, campaigns: refs.campaigns.length };
                  return (
                    <div key={id} className="sp-projects-ref">
                      {p ? (
                        <Poster project={p} width={40} />
                      ) : (
                        <span className="sp-projects-poster missing" style={{ width: 40 }}>
                          <FolderX size={16} />
                        </span>
                      )}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="strong ellipsis">{p ? p.title || 'Untitled project' : 'Deleted project'}</div>
                        <div className="muted small ellipsis">
                          {[n.content && plural(n.content, 'content piece'), n.campaigns && plural(n.campaigns, 'campaign')].filter(Boolean).join(' · ')} point to it
                          {p ? ', but it is not linked to this space' : ''}
                        </div>
                        {refs.content.length > 0 && (
                          <div className="sp-projects-chips">
                            {refs.content.slice(0, 6).map((c) => (
                              <button key={c.id} type="button" className="chip" onClick={() => openContent(c.id)}>
                                <span className="color-dot" style={{ background: STAGE_BY_ID[c.stage]?.color }} />
                                {c.title || 'Untitled'}
                              </button>
                            ))}
                            {refs.content.length > 6 && <span className="muted tiny">+{refs.content.length - 6} more</span>}
                            {refs.campaigns.map((c) => (
                              <button key={c.id} type="button" className="chip" onClick={() => navigateSpace('campaigns', { campaignId: c.id })}>
                                <Megaphone size={11} />
                                {c.name || 'Campaign'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {p ? (
                        <Button size="sm" icon={Link2} onClick={() => linkProject(p)}>
                          Link
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" icon={Eraser} onClick={() => void clearReferences(id, n)}>
                          Remove references
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <ProjectPicker anchor={picker} onClose={() => setPicker(null)} projects={available} loading={loading} onPick={(p) => linkProject(p)} />
    </div>
  );
}

