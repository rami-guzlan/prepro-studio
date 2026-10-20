/* Brand Kit & Assets: the asset details dialog and the image lightbox. */
import { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Copy, ExternalLink, FolderOpen, Trash2 } from 'lucide-react';
import type { ID } from '@/types';
import type { AssetKind, BrandAsset } from '@/spaces/types';
import { ASSET_KINDS } from '@/spaces/constants';
import { assetUrl } from '@/backend';
import { Button, ColorPicker, Field, IconButton, ImageDrop, Input, Modal, Select, Textarea } from '@/ui';
import { assetOps, canOpenValue, copyText, deleteAsset, fontAvailable, HexInput, openUrl, openValue, TagInput } from './actions';
import { fontStack, inkOn, normalizeHex } from './util';

const VALUE_LABEL: Partial<Record<AssetKind, [string, string]>> = {
  font: ['Font family', 'e.g. Bebas Neue'],
  template: ['File or location', 'e.g. D:\\Brand\\Thumbnail.psd or a Canva link'],
  video: ['File or location', 'e.g. D:\\Footage\\Intro_v3.mov'],
  audio: ['File or location', 'e.g. D:\\Music\\Theme_final.wav'],
  doc: ['File or location', 'e.g. D:\\Press\\EPK.pdf'],
  other: ['Value', ''],
  logo: ['File or variant', 'e.g. SVG master in D:\\Brand\\Logo'],
  image: ['Credit / source', 'Photographer, film, link …'],
};

const IMAGE_KINDS: AssetKind[] = ['logo', 'image', 'template', 'video', 'audio', 'doc', 'other'];

export function AssetEditor({ asset, allTags, onClose }: { asset: BrandAsset; allTags: string[]; onClose: () => void }) {
  const up = (patch: Partial<BrandAsset>) => assetOps.update(asset.id, patch);
  const kind = asset.kind;
  const valueLabel = VALUE_LABEL[kind];
  const hex = normalizeHex(asset.value);
  const fontOk = kind === 'font' && asset.value?.trim() ? fontAvailable(asset.value) : true;
  const kindLabel = ASSET_KINDS.find((k) => k.value === kind)?.label ?? 'Asset';

  return (
    <Modal
      open
      size="md"
      title={asset.name?.trim() || kindLabel}
      onClose={onClose}
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
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sp-assets-editor">
        {IMAGE_KINDS.includes(kind) && (
          <div className="sp-assets-editor-image">
            <ImageDrop
              value={asset.image}
              onChange={(image) => up({ image })}
              aspect={kind === 'logo' ? 4 / 3 : 16 / 9}
              contain={kind === 'logo'}
              label={kind === 'logo' ? 'Drop the logo file' : kind === 'image' ? 'Drop an image' : 'Optional preview / thumbnail'}
            />
          </div>
        )}
        {kind === 'color' && (
          <div className="sp-assets-editor-swatch" style={{ background: hex ?? 'var(--bg-sunken)', color: inkOn(hex ?? undefined) }}>
            <span className="mono">{hex ?? 'No colour'}</span>
          </div>
        )}
        {kind === 'font' && (
          <div className="sp-assets-editor-font" style={{ fontFamily: fontStack(asset.value) }}>
            Aa Bb Cc 123
          </div>
        )}
        <div className="sp-assets-editor-grid">
          <Field label={kind === 'font' ? 'Role' : 'Name'}>
            <Input autoFocus value={asset.name} placeholder={kind === 'font' ? 'e.g. Headlines, Body, Captions' : kind === 'image' ? 'Caption' : 'Name'} onChange={(name) => up({ name })} />
          </Field>
          <Field label="Type">
            <Select value={kind} options={ASSET_KINDS} onChange={(k) => up({ kind: k as AssetKind })} />
          </Field>
          {kind === 'color' ? (
            <Field label="Colour" span="all">
              <div className="row wrap" style={{ gap: 10 }}>
                <HexInput value={asset.value} onChange={(value) => up({ value })} className="sp-assets-hex" />
                {hex && <IconButton icon={Copy} label="Copy hex" variant="default" size="sm" onClick={() => copyText(hex)} />}
                <ColorPicker value={hex ?? undefined} onChange={(v) => v && up({ value: v })} />
              </div>
            </Field>
          ) : kind === 'link' ? null : valueLabel ? (
            <Field label={valueLabel[0]} span="all" hint={kind === 'font' && asset.value?.trim() && !fontOk ? 'Not installed on this computer: previews use a fallback font.' : undefined}>
              <div className="row" style={{ gap: 4 }}>
                <Input value={asset.value} placeholder={valueLabel[1]} onChange={(value) => up({ value })} />
                {canOpenValue(asset.value) && <IconButton icon={FolderOpen} label="Open" variant="default" onClick={() => openValue(asset.value)} />}
              </div>
            </Field>
          ) : null}
          {kind !== 'color' && (
            <Field label={kind === 'font' ? 'Download / licence link' : 'Link'} span="all">
              <div className="row" style={{ gap: 4 }}>
                <Input value={asset.url} placeholder="https://…" onChange={(url) => up({ url })} />
                <IconButton icon={ExternalLink} label="Open link" variant="default" disabled={!asset.url?.trim()} onClick={() => openUrl(asset.url)} />
              </div>
            </Field>
          )}
          <Field label="Tags" span="all">
            <TagInput value={asset.tags ?? []} suggestions={allTags} onChange={(tags) => up({ tags: tags.length ? tags : undefined })} />
          </Field>
          <Field label={kind === 'font' ? 'Usage notes' : 'Notes'} span="all">
            <Textarea
              autoGrow
              minRows={2}
              value={asset.notes}
              placeholder={kind === 'font' ? 'Sizes, weights, where to use it, licence…' : kind === 'color' ? 'Where to use it, contrast rules…' : 'Usage rules, credits, licence…'}
              onChange={(notes) => up({ notes })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- lightbox */

export function ImageLightbox({ images, id, onId, onClose, allTags }: { images: BrandAsset[]; id: ID; onId: (id: ID) => void; onClose: () => void; allTags: string[] }) {
  const index = Math.max(0, images.findIndex((a) => a.id === id));
  const a = images[index];
  const n = images.length;
  const go = (d: number) => n > 1 && onId(images[(index + d + n) % n].id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const url = useMemo(() => assetUrl(a?.image), [a?.image]);
  if (!a) return null;
  const up = (patch: Partial<BrandAsset>) => assetOps.update(a.id, patch);

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`${a.name?.trim() || 'Image'} — ${index + 1} of ${n}`}
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              const next = n > 1 ? images[(index + 1) % n].id : null;
              if (await deleteAsset(a)) {
                if (next) onId(next);
                else onClose();
              }
            }}
          >
            Delete
          </Button>
          <div className="spacer" />
          {n > 1 && <span className="muted small">← → to browse</span>}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sp-assets-lightbox">
        <div className="sp-assets-lb-stage">
          {url ? <img src={url} alt={a.name ?? ''} /> : <span className="muted">No image</span>}
          {n > 1 && (
            <>
              <button type="button" className="sp-assets-lb-nav prev" aria-label="Previous image" onClick={() => go(-1)}>
                <ChevronLeft />
              </button>
              <button type="button" className="sp-assets-lb-nav next" aria-label="Next image" onClick={() => go(1)}>
                <ChevronRight />
              </button>
            </>
          )}
        </div>
        <div className="sp-assets-lb-side">
          <Field label="Caption">
            <Input value={a.name} placeholder="What is this reference for?" onChange={(name) => up({ name })} />
          </Field>
          <Field label="Tags">
            <TagInput value={a.tags ?? []} suggestions={allTags} onChange={(tags) => up({ tags: tags.length ? tags : undefined })} />
          </Field>
          <Field label="Credit / source">
            <Input value={a.value} placeholder="Photographer, film, link…" onChange={(value) => up({ value })} />
          </Field>
          <Field label="Link">
            <div className="row" style={{ gap: 4 }}>
              <Input value={a.url} placeholder="https://…" onChange={(url) => up({ url })} />
              <IconButton icon={ExternalLink} label="Open link" variant="default" disabled={!a.url?.trim()} onClick={() => openUrl(a.url)} />
            </div>
          </Field>
          <Field label="Notes">
            <Textarea autoGrow minRows={3} value={a.notes} placeholder="What to take from it: light, colour, framing…" onChange={(notes) => up({ notes })} />
          </Field>
        </div>
      </div>
      {n > 1 && (
        <div className="sp-assets-lb-strip">
          {images.map((im) => (
            <button key={im.id} type="button" className={im.id === a.id ? 'on' : ''} onClick={() => onId(im.id)} aria-label={im.name || 'Image'}>
              {im.image ? <img src={assetUrl(im.image)} alt="" /> : null}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
