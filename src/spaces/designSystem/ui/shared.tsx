/* Shared hooks and controls of the design-system screens. */
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2, Upload, X, type LucideIcon } from 'lucide-react';
import type { ID } from '@/types';
import type { BrandAsset } from '@/spaces/types';
import { useSpace } from '@/store/space';
import { asOneSpaceStep } from '@/store/space';
import { assetUrl, importDroppedImages, pickImages } from '@/backend';
import { isImageFile } from '@/lib/images';
import { IconButton, Popover, confirmDialog, toast, type AnchorRect } from '@/ui';
import { addImageAssets } from '@/spaces/modules/assets/actions';
import { dsOf } from '../compile';
import type { DesignSystem, DSLevel, DSReference } from '../types';
import { LEVELS, VERDICTS } from './options';

/* ---------------------------------------------------------------- data hooks */

const NO_ASSETS: BrandAsset[] = [];

/** The live design system of the open space (normalized, memoized). */
export function useDS(): DesignSystem {
  const raw = useSpace((s) => s.designSystem);
  return useMemo(() => dsOf({ designSystem: raw }), [raw]);
}

export function useAssets(): BrandAsset[] {
  return useSpace((s) => s.assets) ?? NO_ASSETS;
}

/** Images and logos that can be used as previews / references. */
export function useImageAssets(): BrandAsset[] {
  const assets = useAssets();
  return useMemo(() => assets.filter((a) => (a.kind === 'image' || a.kind === 'logo' || a.kind === 'template' || a.kind === 'resource') && a.image), [assets]);
}

export function useCampaignOptions() {
  const campaigns = useSpace((s) => s.campaigns);
  return useMemo(() => (campaigns ?? []).map((c) => ({ value: c.id, label: c.name || 'Untitled campaign', color: c.color })), [campaigns]);
}

/* ---------------------------------------------------------------- layout */

export function SectionHead({ title, intro, actions, icon: Icon }: { title: ReactNode; intro?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="ds-head">
      <div className="ds-head-text">
        <h2>
          {Icon && <Icon size={17} />}
          {title}
        </h2>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="ds-head-actions">{actions}</div>}
    </div>
  );
}

export function SubHead({ title, hint, actions }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ds-subhead">
      <h3>{title}</h3>
      {hint && <span className="muted small ds-subhead-hint">{hint}</span>}
      <div className="spacer" />
      {actions}
    </div>
  );
}

/** Empty state that teaches what a list is for. */
export function Teach({ icon: Icon, title, children, actions }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ds-teach">
      {Icon && (
        <div className="ds-teach-icon">
          <Icon size={20} />
        </div>
      )}
      <div className="grow">
        <h4>{title}</h4>
        {children && <div className="ds-teach-body">{children}</div>}
        {actions && <div className="row wrap ds-teach-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** Move up / down / delete buttons of a list item. */
export function ItemActions({ index, count, onMove, onDelete, label = 'item' }: { index: number; count: number; onMove?: (from: number, to: number) => void; onDelete?: () => void; label?: string }) {
  return (
    <div className="ds-item-actions">
      {onMove && count > 1 && (
        <>
          <IconButton icon={ArrowUp} size="sm" label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)} />
          <IconButton icon={ArrowDown} size="sm" label={`Move ${label} down`} disabled={index >= count - 1} onClick={() => onMove(index, index + 1)} />
        </>
      )}
      {onDelete && <IconButton icon={Trash2} size="sm" label={`Delete ${label}`} onClick={onDelete} />}
    </div>
  );
}

/** Ask before removing something with content; empty items go without asking. */
export async function confirmRemove(what: string, hasContent: boolean): Promise<boolean> {
  if (!hasContent) return true;
  return confirmDialog({ title: `Delete ${what}?`, message: 'You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true });
}

/* ---------------------------------------------------------------- pills */

export function LevelSelect({ value, onChange, compact }: { value: DSLevel; onChange: (v: DSLevel) => void; compact?: boolean }) {
  const cur = LEVELS.find((l) => l.value === value);
  return (
    <select className={`ds-pill ds-level-${value}`} value={value} title={cur?.hint} aria-label="Level" onChange={(e) => onChange(e.target.value as DSLevel)}>
      {LEVELS.map((l) => (
        <option key={l.value} value={l.value}>
          {compact ? l.label : `${l.label} — ${l.hint.toLowerCase()}`}
        </option>
      ))}
    </select>
  );
}

export function LevelBadge({ value }: { value: DSLevel }) {
  return <span className={`ds-pill static ds-level-${value}`}>{LEVELS.find((l) => l.value === value)?.label}</span>;
}

export function VerdictSelect({ value, onChange }: { value: DSReference['verdict']; onChange: (v: DSReference['verdict']) => void }) {
  return (
    <select className={`ds-pill ds-verdict-${value}`} value={value} aria-label="Verdict" title={VERDICTS.find((v) => v.value === value)?.hint} onChange={(e) => onChange(e.target.value as DSReference['verdict'])}>
      {VERDICTS.map((v) => (
        <option key={v.value} value={v.value}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------------------------------------- colour values */

/** True when a CSS colour value (hex, rgb(), named, gradient …) can be painted. */
export function paintable(v: string | undefined): boolean {
  const s = (v ?? '').trim();
  if (!s) return false;
  try {
    if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', s) || CSS.supports('background-image', s);
  } catch {
    /* ignore */
  }
  return /^#([0-9a-f]{3,8})$/i.test(s);
}

/** Swatch for any CSS colour value; var(--x) is resolved against the palette when possible. */
export function ValueSwatch({ value, size = 22, palette }: { value: string | undefined; size?: number; palette?: Map<string, string> }) {
  let v = (value ?? '').trim();
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m && palette?.get(m[1])) v = palette.get(m[1])!;
  const ok = paintable(v);
  return <span className={`ds-vswatch ${ok ? '' : 'none'}`} style={{ width: size, height: size, background: ok ? v : undefined }} aria-hidden />;
}

/* ---------------------------------------------------------------- image asset picker */

async function importFilesAsImages(files: File[]): Promise<ID[]> {
  const imgs = files.filter(isImageFile);
  if (!imgs.length) {
    toast('Only images can be dropped here', 'error');
    return [];
  }
  const names = await importDroppedImages(imgs);
  return addImageAssets(names);
}

/** Pick (or upload) image assets; new uploads become image assets in the brand kit. */
export async function uploadImageAssets(multiple = false): Promise<ID[]> {
  try {
    const names = await pickImages(multiple);
    if (!names.length) return [];
    return addImageAssets(names);
  } catch (e) {
    toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return [];
  }
}

/** Drop target props for image files (desktop drag); calls back with new image asset ids. */
export function useImageDrop(onIds: (ids: ID[]) => void) {
  const [over, setOver] = useState(false);
  const has = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  return {
    over,
    props: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!has(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!has(e)) return;
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        void asOneSpaceStep(async () => {
          try {
            const ids = await importFilesAsImages(files);
            if (ids.length) onIds(ids);
          } catch (err) {
            toast(`Could not import: ${err instanceof Error ? err.message : String(err)}`, 'error');
          }
        });
      },
    },
  };
}

/** A thumbnail that picks an image asset: click → choose from the brand kit or upload; drop an image file on it. */
export function AssetPick({ value, onChange, label = 'Choose image', aspect = 4 / 3, contain, className }: { value: ID | undefined; onChange: (id: ID | undefined) => void; label?: string; aspect?: number; contain?: boolean; className?: string }) {
  const images = useImageAssets();
  const assets = useAssets();
  const cur = value ? assets.find((a) => a.id === value) : undefined;
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const drop = useImageDrop((ids) => onChange(ids[0]));
  const url = cur?.image ? assetUrl(cur.image) : '';
  return (
    <>
      <button
        type="button"
        className={`ds-assetpick ${url ? 'has' : ''} ${drop.over ? 'over' : ''} ${className ?? ''}`}
        style={{ aspectRatio: String(aspect) }}
        title={cur ? `${cur.name || 'Image'} — click to change` : label}
        aria-label={cur ? `Image: ${cur.name || 'untitled'}. Change` : label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
        {...drop.props}
      >
        {url ? (
          <img src={url} alt="" draggable={false} style={{ objectFit: contain ? 'contain' : 'cover' }} />
        ) : (
          <span className="ds-assetpick-empty">
            <ImagePlus size={18} />
            <span>{drop.over ? 'Drop to add' : label}</span>
          </span>
        )}
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="ds-pickpop">
          <div className="row" style={{ gap: 6 }}>
            <b className="small">Brand kit images</b>
            <div className="spacer" />
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                setAnchor(null);
                const ids = await uploadImageAssets(false);
                if (ids[0]) onChange(ids[0]);
              }}
            >
              <Upload /> Upload…
            </button>
            {value && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  setAnchor(null);
                  onChange(undefined);
                }}
              >
                <X /> Remove
              </button>
            )}
          </div>
          {images.length ? (
            <div className="ds-pickgrid">
              {images.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={a.id === value ? 'on' : ''}
                  title={a.name || 'Untitled image'}
                  onClick={() => {
                    setAnchor(null);
                    onChange(a.id);
                  }}
                >
                  <img src={assetUrl(a.image)} alt={a.name ?? ''} draggable={false} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              No images in the brand kit yet. Upload one, or drop an image file on the thumbnail.
            </p>
          )}
        </div>
      </Popover>
    </>
  );
}

/* ---------------------------------------------------------------- imported specimens */

const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;

/** Preview of an imported specimen (stored html or image). Html is untrusted: sandboxed, no scripts. */
export function SpecimenFrame({ file, title, thumb }: { file: string; title?: string; thumb?: boolean }) {
  const url = assetUrl(file);
  if (!url) return <div className="ds-specimen none muted small">Missing file</div>;
  if (IMG_RE.test(file))
    return (
      <div className={`ds-specimen img ${thumb ? 'thumb' : ''}`}>
        <img src={url} alt={title ?? ''} draggable={false} />
      </div>
    );
  return <HtmlSpecimen url={url} title={title} thumb={thumb} />;
}

const htmlCache = new Map<string, string>();

/** Html specimens are fetched and shown through srcdoc in a sandbox without scripts, so they never run code
    or reach the app (works for blob:, file and custom-protocol asset urls alike). */
function HtmlSpecimen({ url, title, thumb }: { url: string; title?: string; thumb?: boolean }) {
  const [html, setHtml] = useState<string | null>(() => htmlCache.get(url) ?? null);
  useEffect(() => {
    if (htmlCache.has(url)) {
      setHtml(htmlCache.get(url)!);
      return;
    }
    let alive = true;
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        const v = t.length > 600_000 ? t.slice(0, 600_000) : t;
        htmlCache.set(url, v);
        if (alive) setHtml(v);
      })
      .catch(() => alive && setHtml(''));
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className={`ds-specimen ${thumb ? 'thumb' : ''}`}>
      {html == null ? <span className="muted small ds-specimen-msg">Loading…</span> : html ? <iframe srcDoc={html} title={title || 'Specimen'} sandbox="" referrerPolicy="no-referrer" tabIndex={thumb ? -1 : undefined} /> : <span className="muted small ds-specimen-msg">Could not load the file</span>}
    </div>
  );
}
