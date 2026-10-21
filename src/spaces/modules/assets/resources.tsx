/* Downloadable resources — lead magnets, sequence maps, template docs, playbooks,
   one-pagers … They are brand assets (kind "resource", or any document with an
   uploaded file) stored in Brand Kit & Assets. Campaigns list theirs in
   "Resources in this campaign"; the brand kit groups them per campaign under
   Links & documents. This file holds the shared actions (upload, download, open),
   the viewer modal and the resource list. */
import './resources.css';
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Download, ExternalLink, File as FileIcon, FileArchive, FileSpreadsheet, FileText, Film, FolderOpen, Image as ImageIcon, Link2, Lock, Music, Presentation, Trash2, Upload, X } from 'lucide-react';
import type { ID } from '@/types';
import type { BrandAsset, ResourceType } from '@/spaces/types';
import { RESOURCE_TYPES } from '@/spaces/constants';
import { assetUrl, backend, getCurrentProjectId, importAssetBytes, saveBinaryFile } from '@/backend';
import { getSpace, useSpace } from '@/store/space';
import { optionColor, optionLabel } from '@/lib/constants';
import { plural, safeFileName } from '@/lib/text';
import { Badge, Button, Checkbox, Field, IconButton, Input, Modal, Select, Textarea, toast } from '@/ui';
import { addAssets, assetOps, deleteAsset, makeAsset, openUrl, TagInput } from './actions';

/* ---------------------------------------------------------------- helpers */

/** Asset kinds that belong to Links & documents (and can be campaign resources). */
export const RESOURCE_KINDS: BrandAsset['kind'][] = ['resource', 'doc', 'link', 'other'];

export const isCampaignResource = (a: BrandAsset) => RESOURCE_KINDS.includes(a.kind) || !!a.file;

export function fileExt(a: Pick<BrandAsset, 'file' | 'fileName'>): string {
  const n = a.fileName || a.file || '';
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i + 1).toLowerCase() : '';
}

export function formatBytes(n: number | undefined): string {
  if (!n || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'log', 'yml', 'yaml', 'tsv', 'html', 'htm'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v'];
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'];

export type PreviewKind = 'pdf' | 'image' | 'text' | 'video' | 'audio' | 'none';

export function previewKind(ext: string): PreviewKind {
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (TEXT_EXT.includes(ext)) return 'text';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  return 'none';
}

export function ResourceIcon({ a, size = 18 }: { a: BrandAsset; size?: number }) {
  const ext = fileExt(a);
  const k = previewKind(ext);
  if (!a.file && a.url?.trim()) return <Link2 size={size} />;
  if (k === 'image') return <ImageIcon size={size} />;
  if (k === 'video') return <Film size={size} />;
  if (k === 'audio') return <Music size={size} />;
  if (['xls', 'xlsx', 'csv', 'numbers', 'tsv'].includes(ext)) return <FileSpreadsheet size={size} />;
  if (['ppt', 'pptx', 'key'].includes(ext) || a.resourceType === 'slides') return <Presentation size={size} />;
  if (['zip', 'rar', '7z'].includes(ext)) return <FileArchive size={size} />;
  if (ext || a.kind === 'doc' || a.kind === 'resource') return <FileText size={size} />;
  return <FileIcon size={size} />;
}

/** Guess the resource type from a file name. */
export function guessResourceType(name: string): ResourceType {
  const n = name.toLowerCase();
  if (/playbook/.test(n)) return 'playbook';
  if (/sequence|email[ -]?(flow|map)|nurture|drip/.test(n)) return 'sequence_map';
  if (/one[ -]?pager|onepager|fact ?sheet|press ?kit|epk/.test(n)) return 'one_pager';
  if (/check ?list/.test(n)) return 'checklist';
  if (/worksheet|workbook/.test(n)) return 'worksheet';
  if (/swipe/.test(n)) return 'swipe_file';
  if (/template/.test(n)) return 'template';
  if (/deck|slides|\.(pptx?|key)$/.test(n)) return 'slides';
  if (/guide|e-?book|handbook|manual/.test(n)) return 'guide';
  return 'other';
}

const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName;

/* ---------------------------------------------------------------- actions */

export interface UploadFile {
  name: string;
  data: Uint8Array;
}

/** Store files in the space and add them as resources (one undo step). Returns the new asset ids. */
export async function uploadResources(files: UploadFile[], patch: Partial<BrandAsset> = {}): Promise<ID[]> {
  if (!files.length) return [];
  const made: BrandAsset[] = [];
  for (const f of files) {
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : 'bin';
    const stored = await importAssetBytes(f.data, ext);
    made.push(
      makeAsset('resource', {
        name: baseName(f.name),
        file: stored,
        fileName: f.name,
        fileSize: f.data.length,
        resourceType: guessResourceType(f.name),
        image: IMAGE_EXT.includes(ext) ? stored : undefined,
        ...patch,
      }),
    );
  }
  const ids = addAssets(made);
  const camp = patch.campaignId ? getSpace().campaigns.find((c) => c.id === patch.campaignId) : undefined;
  toast(`Added ${plural(ids.length, 'resource')}${camp ? ` to ${camp.name || 'the campaign'}` : ''} — stored in Brand Kit & Assets`);
  return ids;
}

/** Open dialog → upload as resources. */
export async function pickResources(patch: Partial<BrandAsset> = {}): Promise<ID[]> {
  try {
    const files = await backend.openFiles({ multiple: true, title: 'Add resources (PDF, docs, slides, sheets, images …)' });
    return await uploadResources(
      files.map((f) => ({ name: f.name, data: f.data })),
      patch,
    );
  } catch (e) {
    toast(`Could not add the files: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return [];
  }
}

/** Files dropped from the desktop → resources. */
export async function dropResources(files: File[], patch: Partial<BrandAsset> = {}): Promise<ID[]> {
  try {
    const list = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
    return await uploadResources(list, patch);
  } catch (e) {
    toast(`Could not add the files: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return [];
  }
}

/** Put a (new) file on an existing resource. */
export async function replaceResourceFile(a: BrandAsset, file?: UploadFile) {
  try {
    const f = file ?? (await backend.openFiles({ multiple: false, title: a.file ? 'Replace the file' : 'Choose the file' }))[0];
    if (!f) return;
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : 'bin';
    const stored = await importAssetBytes(f.data, ext);
    assetOps.update(
      a.id,
      {
        file: stored,
        fileName: f.name,
        fileSize: f.data.length,
        kind: a.kind === 'link' || a.kind === 'other' ? 'resource' : a.kind,
        image: IMAGE_EXT.includes(ext) ? stored : a.image && a.image === a.file ? undefined : a.image,
        resourceType: a.resourceType ?? guessResourceType(f.name),
      },
      false,
    );
    toast(a.file ? 'File replaced' : 'File added');
  } catch (e) {
    toast(`Could not add the file: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

export function downloadName(a: BrandAsset): string {
  const ext = fileExt(a);
  if (a.fileName) return a.fileName;
  return `${safeFileName(a.name || 'resource')}${ext ? `.${ext}` : ''}`;
}

/** Save a copy of the resource's file where the user chooses. */
export async function downloadResource(a: BrandAsset) {
  if (!a.file) return;
  try {
    const bytes = await backend.readAsset(getCurrentProjectId(), a.file);
    if (!bytes) {
      toast('The file is missing from the space folder', 'error');
      return;
    }
    const ext = fileExt(a);
    const path = await saveBinaryFile(downloadName(a), bytes, ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined);
    if (path) toast(`Saved ${path.split(/[\\/]/).pop()}`);
  } catch (e) {
    toast(`Could not save: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/** Desktop: open the stored file in its default app (Word, Keynote, Acrobat …). */
export async function openResourceExternally(a: BrandAsset) {
  if (!a.file || !backend.assetPath || !backend.openPath) return;
  backend.openPath(await backend.assetPath(getCurrentProjectId(), a.file));
}

/** Remove a resource from its campaign (it stays in the brand kit). */
export function unassignResource(a: BrandAsset) {
  assetOps.update(a.id, { campaignId: undefined }, false);
}

/* ---------------------------------------------------------------- drop target */

/** Props + state for an element that accepts files dragged from the desktop. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const has = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  return {
    over,
    props: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!has(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!has(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}

/* ---------------------------------------------------------------- list */

export function ResourceMeta({ a }: { a: BrandAsset }) {
  const ext = fileExt(a);
  const bits = [
    a.resourceType ? optionLabel(RESOURCE_TYPES, a.resourceType) : a.kind === 'link' ? 'Link' : a.kind === 'doc' ? 'Document' : '',
    ext ? ext.toUpperCase() : '',
    formatBytes(a.fileSize),
    !a.file && a.url?.trim() ? a.url.replace(/^https?:\/\//, '') : '',
    !a.file && !a.url?.trim() ? 'No file yet' : '',
  ].filter(Boolean);
  return <span className="sp-res-meta ellipsis">{bits.join(' · ')}</span>;
}

export function GatedBadge() {
  return (
    <span className="sp-res-gated" title="Gated: given in exchange for an email / opt-in">
      <Lock size={10} /> Gated
    </span>
  );
}

/** Resource rows: click to open the viewer; download / link / remove buttons. */
export function ResourceList({ items, onOpen, onRemove, removeLabel = 'Remove from campaign', empty }: { items: BrandAsset[]; onOpen: (id: ID) => void; onRemove?: (a: BrandAsset) => void; removeLabel?: string; empty?: ReactNode }) {
  if (!items.length) return empty ? <div className="sp-res-empty">{empty}</div> : null;
  return (
    <div className="sp-res-list">
      {items.map((a) => {
        const color = a.resourceType ? optionColor(RESOURCE_TYPES, a.resourceType) : undefined;
        return (
          <div key={a.id} className="sp-res-row" data-id={a.id}>
            <button type="button" className="sp-res-main" onClick={() => onOpen(a.id)} title="Open">
              <span className="sp-res-icon" style={color ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}>
                {a.image ? <img src={assetUrl(a.image)} alt="" draggable={false} /> : <ResourceIcon a={a} size={16} />}
              </span>
              <span className="sp-res-text">
                <span className="sp-res-name ellipsis">{a.name?.trim() || a.fileName || 'Untitled resource'}</span>
                <ResourceMeta a={a} />
              </span>
              {a.gated && <GatedBadge />}
            </button>
            <div className="sp-res-actions">
              {a.file && <IconButton icon={Download} size="sm" label="Download" onClick={() => void downloadResource(a)} />}
              {a.url?.trim() && <IconButton icon={ExternalLink} size="sm" label="Open link" onClick={() => openUrl(a.url)} />}
              {onRemove && <IconButton icon={X} size="sm" label={removeLabel} onClick={() => onRemove(a)} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- viewer / editor */

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.text())
      .then((t) => alive && setText(t.length > 300_000 ? `${t.slice(0, 300_000)}\n\n…` : t))
      .catch(() => alive && setText(''));
    return () => {
      alive = false;
    };
  }, [url]);
  if (text == null) return <div className="sp-res-none muted">Loading…</div>;
  return <pre className="sp-res-text-preview">{text || '(empty file)'}</pre>;
}

function Preview({ a }: { a: BrandAsset }) {
  const ext = fileExt(a);
  const kind = a.file ? previewKind(ext) : 'none';
  const url = a.file ? assetUrl(a.file) : '';
  const drop = useFileDrop((files) => {
    const f = files[0];
    if (f) void f.arrayBuffer().then((buf) => replaceResourceFile(a, { name: f.name, data: new Uint8Array(buf) }));
  });
  if (a.file && url) {
    if (kind === 'pdf') return <iframe className="sp-res-frame" src={url} title={a.name || 'PDF'} />;
    if (kind === 'image') return <div className="sp-res-imgstage"><img src={url} alt={a.name ?? ''} /></div>;
    if (kind === 'text') return <TextPreview url={url} />;
    if (kind === 'video') return <video className="sp-res-media" src={url} controls />;
    if (kind === 'audio') return <div className="sp-res-none"><Music size={34} /><audio src={url} controls /></div>;
  }
  return (
    <div className={`sp-res-none ${drop.over ? 'over' : ''}`} {...drop.props}>
      <span className="sp-res-bigicon">
        <ResourceIcon a={a} size={36} />
      </span>
      {a.file ? (
        <>
          <b>{a.fileName || a.name}</b>
          <span className="muted small">No preview for {ext ? `.${ext.toUpperCase()}` : 'this kind of'} files: open it in its app or download a copy.</span>
          <div className="row" style={{ gap: 6 }}>
            {backend.assetPath && (
              <Button icon={FolderOpen} onClick={() => void openResourceExternally(a)}>
                Open in its app
              </Button>
            )}
            <Button icon={Download} onClick={() => void downloadResource(a)}>
              Download
            </Button>
          </div>
        </>
      ) : (
        <>
          <b>{a.url?.trim() ? 'This resource is a link' : 'No file yet'}</b>
          <span className="muted small">{a.url?.trim() ? a.url : 'Upload the PDF, doc, slides or sheet — or drop it here.'}</span>
          <div className="row" style={{ gap: 6 }}>
            {a.url?.trim() && (
              <Button icon={ExternalLink} onClick={() => openUrl(a.url)}>
                Open link
              </Button>
            )}
            <Button variant={a.url?.trim() ? undefined : 'primary'} icon={Upload} onClick={() => void replaceResourceFile(a)}>
              Upload file…
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** The resource viewer: preview on the left, details on the right. */
export function ResourceModal({ asset, onClose }: { asset: BrandAsset; onClose: () => void }) {
  const campaigns = useSpace((s) => s.campaigns);
  const assets = useSpace((s) => s.assets);
  const allTags = useMemo(() => [...new Set(assets.flatMap((x) => x.tags ?? []))].sort(), [assets]);
  const up = (patch: Partial<BrandAsset>, coalesce = true) => assetOps.update(asset.id, patch, coalesce);
  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: c.name || 'Untitled campaign' }));
  const ext = fileExt(asset);

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={asset.name?.trim() || asset.fileName || 'Resource'}
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              if (await deleteAsset(asset)) onClose();
            }}
          >
            Delete
          </Button>
          <div className="spacer" />
          {asset.file && backend.assetPath && (
            <Button icon={FolderOpen} onClick={() => void openResourceExternally(asset)}>
              Open in its app
            </Button>
          )}
          {asset.file && (
            <Button icon={Download} onClick={() => void downloadResource(asset)}>
              Download
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sp-res-viewer">
        <div className="sp-res-stage">
          <Preview a={asset} />
        </div>
        <div className="sp-res-side">
          <Field label="Name">
            <Input autoFocus={!asset.file} value={asset.name} placeholder="e.g. Launch playbook" onChange={(name) => up({ name })} />
          </Field>
          <Field label="Type">
            <Select value={asset.resourceType ?? ''} options={RESOURCE_TYPES} placeholder="Choose…" onChange={(v) => up({ resourceType: (v || undefined) as ResourceType | undefined }, false)} />
          </Field>
          <Field label="Campaign">
            <Select value={asset.campaignId ?? ''} options={campaignOptions} placeholder={campaignOptions.length ? 'None (general)' : 'No campaigns yet'} onChange={(v) => up({ campaignId: v || undefined }, false)} />
          </Field>
          <Checkbox checked={asset.gated} onChange={(v) => up({ gated: v || undefined }, false)} label="Gated — given for an email / opt-in" />
          <Field label="File">
            <div className="sp-res-filebox">
              <span className="ellipsis">{asset.file ? `${asset.fileName || 'File'}${asset.fileSize ? ` · ${formatBytes(asset.fileSize)}` : ''}` : <span className="muted">No file</span>}</span>
              <div className="spacer" />
              <Button size="sm" icon={Upload} onClick={() => void replaceResourceFile(asset)}>
                {asset.file ? 'Replace…' : 'Upload…'}
              </Button>
            </div>
            {asset.file && ext && <span className="muted small">Stored in this space’s folder, so it travels with archives and backups.</span>}
          </Field>
          <Field label="Link (landing page, Drive, Notion …)">
            <div className="row" style={{ gap: 4 }}>
              <Input value={asset.url} placeholder="https://…" onChange={(url) => up({ url: url || undefined })} />
              <IconButton icon={ExternalLink} label="Open link" variant="default" disabled={!asset.url?.trim()} onClick={() => openUrl(asset.url)} />
            </div>
          </Field>
          <Field label="Tags">
            <TagInput value={asset.tags ?? []} suggestions={allTags} onChange={(tags) => up({ tags: tags.length ? tags : undefined }, false)} />
          </Field>
          <Field label="Notes">
            <Textarea autoGrow minRows={3} value={asset.notes} placeholder="What it’s for, where it’s offered, version, who owns it…" onChange={(notes) => up({ notes: notes || undefined })} />
          </Field>
          {asset.gated && <Badge tone="warning">Mention the opt-in in the campaign’s call to action</Badge>}
        </div>
      </div>
    </Modal>
  );
}

/** A new empty resource (link / placeholder) — returns its id so the caller can open the viewer. */
export function addResourcePlaceholder(patch: Partial<BrandAsset> = {}): ID {
  return addAssets([makeAsset('resource', { name: 'New resource', ...patch })])[0];
}
