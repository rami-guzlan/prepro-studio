/* Portfolio & Reels: showreels, work samples and case studies with thumbnails,
   client, year, your role, results and files — what you send to win work.
   Video files (uploaded or dropped) become pieces of their own and play in place. */
import '../../biz.css';
import '../../sales.css';
import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Film, FolderKanban, Loader2, Plus, Star, Trash2, Upload, UserRound } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { plural, safeFileName } from '@/lib/text';
import { assetUrl, backend, exportCsv } from '@/backend';
import { useFileDrop } from '@/spaces/modules/assets/resources';
import { Button, Checkbox, DateInput, EmptyState, ExportMenu, Field, IconButton, ImageDrop, Input, Modal, ModuleHeader, SearchInput, Select, Tabs, Textarea, confirmDialog, toast } from '@/ui';
import { PORTFOLIO_KINDS } from '../../constants';
import { clientLabel } from '../../derive';
import { addFiles, addItem, makePortfolioItem, removeItems, updateItem } from '../../ops';
import { FileBox, storeFiles } from '../../files';
import { OptionPill, clientOptions, useBiz, useNavParams, useToday } from '../../ui';
import type { PortfolioItem, PortfolioKind } from '../../types';
import { LinkSelect, Tags, TagsInput, allTags, bizProjectOptions, copyText, openUrl, useLinkOptions, videoThumb, yearOf } from '../pipeline/sales-shared';
import { ProofThumb, isVideoFile, kindInfo, videoFileOf } from './parts';

const VIDEO_FILTERS = [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v'] }];
const titleOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName;

/** Store video files, with a note while big ones upload. */
async function storeVideos(files: { name: string; data: Uint8Array }[]) {
  const mb = files.reduce((n, f) => n + f.data.length, 0) / 1048576;
  if (mb > 20) toast(`Uploading ${plural(files.length, 'video')} (${Math.round(mb)} MB)…`, 'info');
  return storeFiles(files);
}

type KindFilter = 'all' | PortfolioKind;

export default function PortfolioModule() {
  const b = useBiz();
  const title = useSpace((s) => s.meta.title);
  const today = useToday();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [tag, setTag] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sel, setSel] = useState<ID | null>(null);
  const tags = useMemo(() => allTags(b.portfolio), [b.portfolio]);

  const add = (k: PortfolioKind = 'video') => {
    const it = makePortfolioItem({ kind: k, date: today });
    addItem('portfolio', it);
    setSel(it.id);
  };

  /** Each video file becomes a piece of its own (title from the file name). */
  const [uploading, setUploading] = useState(false);
  const addVideos = async (files: { name: string; data: Uint8Array }[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const stored = await storeVideos(files);
      for (const f of stored) addItem('portfolio', makePortfolioItem({ kind: kind === 'showreel' ? 'showreel' : 'video', title: titleOf(f.fileName), date: today, files: [f] }));
      toast(`Added ${plural(stored.length, 'video')} to the portfolio`);
    } catch (e) {
      toast(`Could not upload: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setUploading(false);
    }
  };
  const pickVideos = async () => {
    try {
      const files = await backend.openFiles({ multiple: true, filters: VIDEO_FILTERS, title: 'Upload videos' });
      await addVideos(files.map((f) => ({ name: f.name, data: f.data })));
    } catch (e) {
      toast(`Could not upload: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };
  const drop = useFileDrop((files) => {
    const vids = files.filter((f) => isVideoFile(f.name));
    if (!vids.length) {
      toast('Drop video files here (MP4, MOV, WebM). Other files go in a piece’s Files.', 'info');
      return;
    }
    void Promise.all(vids.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))).then(addVideos);
  });

  useNavParams((p) => {
    const id = p.itemId ?? p.portfolioId;
    if (id && b.portfolio.some((x) => x.id === id)) setSel(id);
    if (p.kind && PORTFOLIO_KINDS.some((k) => k.value === p.kind)) setKind(p.kind);
    if (p.new) add(p.kind && PORTFOLIO_KINDS.some((k) => k.value === p.kind) ? p.kind : 'video');
  });

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: b.portfolio.length };
    for (const x of b.portfolio) m[x.kind] = (m[x.kind] ?? 0) + 1;
    return m;
  }, [b.portfolio]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return b.portfolio
      .filter((x) => {
        if (kind !== 'all' && x.kind !== kind) return false;
        if (tag && !(x.tags ?? []).includes(tag)) return false;
        if (featuredOnly && !x.featured) return false;
        if (!s) return true;
        return [x.title, x.role, x.description, x.results, clientLabel(b, x.clientId), ...(x.tags ?? [])].join(' ').toLowerCase().includes(s);
      })
      .sort((a, z) => Number(!!z.featured) - Number(!!a.featured) || (z.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(z.title));
  }, [b, q, kind, tag, featuredOnly]);

  const item = b.portfolio.find((x) => x.id === sel);

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Portfolio`), b.portfolio, [
      { header: 'Title', value: (x) => x.title },
      { header: 'Kind', value: (x) => kindInfo(x.kind).label },
      { header: 'Link', value: (x) => x.url },
      { header: 'Client', value: (x) => clientLabel(b, x.clientId) },
      { header: 'Date', value: (x) => x.date },
      { header: 'Role', value: (x) => x.role },
      { header: 'Description', value: (x) => x.description },
      { header: 'Results', value: (x) => x.results },
      { header: 'Tags', value: (x) => (x.tags ?? []).join(', ') },
      { header: 'Featured', value: (x) => (x.featured ? 'yes' : '') },
      { header: 'Files', value: (x) => (x.files ?? []).map((f) => f.fileName).join('; ') },
    ]);
    if (path) toast(`Exported ${plural(b.portfolio.length, 'item')}`);
  };

  const tabs = [{ id: 'all' as KindFilter, label: 'All', count: counts.all }, ...PORTFOLIO_KINDS.filter((k) => counts[k.value]).map((k) => ({ id: k.value as KindFilter, label: k.label, count: counts[k.value] }))];

  return (
    <div className="module biz">
      <ModuleHeader
        title="Portfolio & Reels"
        icon={Film}
        subtitle={b.portfolio.length ? `${plural(b.portfolio.length, 'piece')} · ${b.portfolio.filter((x) => x.featured).length} featured` : 'Showreels, work samples and case studies'}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-biz-portfolio', label: 'Portfolio / case studies', options: { kind: kind === 'all' ? '' : kind, featuredOnly } },
                { id: 'space-biz-portfolio', label: 'Featured work only', options: { kind: '', featuredOnly: true } },
              ]}
              csv={[{ label: 'Portfolio (CSV)', onClick: () => void exportList() }]}
            />
            <Button icon={uploading ? Loader2 : Upload} disabled={uploading} title="Each video becomes a piece of its own. You can also drop video files on this page." onClick={() => void pickVideos()}>
              {uploading ? 'Uploading…' : 'Upload videos'}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => add(kind === 'all' ? 'video' : kind)}>
              Add work
            </Button>
          </>
        }
      />
      <div className={`module-body sl-page ${drop.over ? 'sl-pf-dropping' : ''}`} {...drop.props}>
        {b.portfolio.length === 0 ? (
          <EmptyState
            icon={Film}
            title="Show what you’ve made"
            description="Add your showreel and your best work — upload or drop the video files, or paste a YouTube or Vimeo link, note the client, your role and the results. Feature the strongest pieces so they show up in Sales Enablement and the printed portfolio."
            action={
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button icon={Upload} disabled={uploading} onClick={() => void pickVideos()}>
                  Upload videos
                </Button>
                <Button variant="primary" icon={Plus} onClick={() => add('showreel')}>
                  Add your showreel
                </Button>
                <Button icon={Plus} onClick={() => add('case_study')}>
                  Add a case study
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div className="sl-toolbar">
              <Tabs<KindFilter> value={kind} onChange={setKind} tabs={tabs} />
              <SearchInput value={q} onChange={setQ} placeholder="Search work…" width={200} />
              {tags.length > 0 && <Select size="sm" value={tag} placeholder="All tags" options={tags} onChange={setTag} aria-label="Tag" />}
              <Checkbox checked={featuredOnly} onChange={setFeaturedOnly} label="Featured only" />
            </div>
            {list.length === 0 ? (
              <div className="biz-empty-line">Nothing matches.</div>
            ) : (
              <div className="sl-pf-grid">
                {list.map((x) => (
                  <article key={x.id} className={`sl-pf ${x.featured ? 'featured' : ''}`}>
                    <button type="button" className="sl-pf-thumb" onClick={() => setSel(x.id)} aria-label={`Open ${x.title || 'item'}`}>
                      <ProofThumb item={x} />
                      <span className="sl-pf-kind">
                        <OptionPill value={x.kind} options={PORTFOLIO_KINDS} />
                      </span>
                    </button>
                    <div className="sl-pf-body">
                      <div className="row" style={{ gap: 4 }}>
                        <button type="button" className="sl-res-title" onClick={() => setSel(x.id)}>
                          {x.title || <span className="muted">Untitled</span>}
                        </button>
                        <IconButton icon={Star} size="sm" className={x.featured ? 'sl-star-on' : ''} label={x.featured ? 'Featured — click to unfeature' : 'Feature it'} onClick={() => updateItem('portfolio', x.id, { featured: !x.featured || undefined }, false)} />
                      </div>
                      <div className="muted small ellipsis">{[clientLabel(b, x.clientId), yearOf(x.date)].filter(Boolean).join(' · ') || ' '}</div>
                      {x.role && <div className="small ellipsis">{x.role}</div>}
                      <Tags tags={x.tags} onClick={(t) => setTag(tag === t ? '' : t)} active={tag} />
                      {x.url && (
                        <div className="sl-res-actions">
                          <Button size="sm" icon={ExternalLink} onClick={() => openUrl(x.url)}>
                            Open
                          </Button>
                          <IconButton icon={Copy} size="sm" label="Copy link" onClick={() => void copyText(x.url!, 'Link copied')} />
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {item && <PortfolioDialog key={item.id} x={item} onClose={() => setSel(null)} />}
    </div>
  );
}

function PortfolioDialog({ x, onClose }: { x: PortfolioItem; onClose: () => void }) {
  const b = useBiz();
  const links = useLinkOptions();
  const up = (patch: Partial<PortfolioItem>, coalesce = true) => updateItem('portfolio', x.id, patch, coalesce);
  const isEmpty = !x.title.trim() && !x.url && !x.image && !x.description && !(x.files ?? []).length;
  const close = () => {
    if (isEmpty) removeItems('portfolio', [x.id]);
    onClose();
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${x.title || 'item'}”?`, message: 'You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true })) {
      removeItems('portfolio', [x.id]);
      onClose();
    }
  };
  const yt = videoThumb(x.url);
  const vid = videoFileOf(x.files);
  const [busy, setBusy] = useState(false);
  const uploadVideo = async () => {
    try {
      const files = await backend.openFiles({ multiple: false, filters: VIDEO_FILTERS, title: 'Upload the video' });
      if (!files.length) return;
      setBusy(true);
      addFiles({ list: 'portfolio', id: x.id, field: 'files' }, await storeVideos(files.map((f) => ({ name: f.name, data: f.data }))));
    } catch (e) {
      toast(`Could not upload: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={close}
      title={x.title || 'New portfolio piece'}
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          {x.clientId && (
            <Button icon={UserRound} onClick={() => navigateSpace('clients', { clientId: x.clientId })}>
              Client
            </Button>
          )}
          {x.bizProjectId && (
            <Button icon={FolderKanban} onClick={() => navigateSpace('projects', { projectId: x.bizProjectId })}>
              Project
            </Button>
          )}
          {x.url && (
            <Button icon={ExternalLink} onClick={() => openUrl(x.url)}>
              Open link
            </Button>
          )}
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="sl-pf-edit">
        <div className="sl-pf-edit-media">
          {vid ? (
            <video className="sl-pf-video" src={assetUrl(vid.file)} poster={x.image ? assetUrl(x.image) : undefined} controls playsInline preload="metadata" />
          ) : (
            <Button icon={busy ? Loader2 : Upload} disabled={busy} onClick={() => void uploadVideo()}>
              {busy ? 'Uploading…' : 'Upload the video'}
            </Button>
          )}
          <ImageDrop value={x.image} onChange={(img) => up({ image: img }, false)} aspect={16 / 9} label={yt ? 'Using the YouTube thumbnail — drop a still to replace it' : 'Drop a still / thumbnail or click'} />
          {!x.image && yt && (
            <div className="sl-pf-yt">
              <ProofThumb item={x} />
            </div>
          )}
        </div>
        <div className="biz-form">
          <Field label="Title" span="all">
            <Input autoFocus={!x.title} value={x.title} placeholder="e.g. Brightline Coffee — Origins brand film" onChange={(v) => up({ title: v })} />
          </Field>
          <Field label="Kind">
            <Select value={x.kind} options={PORTFOLIO_KINDS} onChange={(v) => up({ kind: v as PortfolioKind }, false)} />
          </Field>
          <Field label="Date">
            <DateInput value={x.date} onChange={(v) => up({ date: v }, false)} />
          </Field>
          <Field label="Link" span="all" hint="YouTube, Vimeo, website, Behance, Google Drive …">
            <Input value={x.url} placeholder="https://…" onChange={(v) => up({ url: v || undefined })} />
          </Field>
          <Field label="Client">
            <LinkSelect value={x.clientId} options={clientOptions(b, x.clientId)} onChange={(v) => up({ clientId: v }, false)} />
          </Field>
          <Field label="Your role">
            <Input value={x.role} placeholder="e.g. Director & editor" onChange={(v) => up({ role: v || undefined })} />
          </Field>
          <Field label="Business project">
            <LinkSelect value={x.bizProjectId} options={bizProjectOptions(b, x.bizProjectId)} onChange={(v) => up({ bizProjectId: v }, false)} />
          </Field>
          <Field label="Production">
            <LinkSelect value={x.projectId} options={links.projects} onChange={(v) => up({ projectId: v }, false)} />
          </Field>
          <Field label="Description" span="all">
            <Textarea autoGrow minRows={3} value={x.description} placeholder="The brief, the idea, how it was made…" onChange={(v) => up({ description: v || undefined })} />
          </Field>
          <Field label="Results" span="all" hint="Numbers sell: views, conversions, sales lift, awards, what the client said">
            <Textarea autoGrow minRows={2} value={x.results} placeholder="e.g. 1.2M views in 30 days · +18% online sales in launch week" onChange={(v) => up({ results: v || undefined })} />
          </Field>
          <Field label="Tags" span={2}>
            <TagsInput value={x.tags} onChange={(tags) => up({ tags }, false)} />
          </Field>
          <Field label=" ">
            <Checkbox checked={x.featured} onChange={(v) => up({ featured: v || undefined }, false)} label="Featured (proof to send)" />
          </Field>
        </div>
        <FileBox target={{ list: 'portfolio', id: x.id, field: 'files' }} files={x.files} label="Files" empty="Drop the case study PDF, stills, a deck or the master file here." />
      </div>
    </Modal>
  );
}
