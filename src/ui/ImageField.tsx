/* Image drop zone bound to a project asset name.
   <ImageDrop value={member.photo} onChange={(name) => ops.update(id, { photo: name })} aspect={3/4} /> */
import { useRef, useState, type CSSProperties } from 'react';
import { ImagePlus, Maximize2, RefreshCw, Trash2 } from 'lucide-react';
import { assetUrl, importImageFile, pickImages } from '@/backend';
import { isImageFile } from '@/lib/images';
import { toast } from './Toast';
import { Modal } from './Modal';

export interface ImageDropProps {
  value?: string;
  onChange: (asset: string | undefined) => void;
  /** width / height ratio (default 16/9) */
  aspect?: number;
  width?: number | string;
  height?: number | string;
  contain?: boolean;
  label?: string;
  round?: boolean;
  style?: CSSProperties;
  /** max pixel size of the stored image (long side) */
  maxSize?: number;
  /** also accept multiple files: first goes to onChange, all are passed here */
  onMultiple?: (assets: string[]) => void;
}

export function ImageDrop({ value, onChange, aspect = 16 / 9, width = '100%', height, contain, label = 'Drop image or click', round, style, maxSize, onMultiple }: ImageDropProps) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const url = assetUrl(value);

  const handleFiles = async (files: File[]) => {
    const imgs = files.filter(isImageFile);
    if (!imgs.length) {
      toast('That file is not an image', 'error');
      return;
    }
    setBusy(true);
    try {
      const names: string[] = [];
      for (const f of onMultiple ? imgs : imgs.slice(0, 1)) names.push(await importImageFile(f, maxSize));
      if (onMultiple && names.length > 1) onMultiple(names);
      else onChange(names[0]);
    } catch (e) {
      toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    try {
      const names = await pickImages(!!onMultiple);
      if (!names.length) return;
      if (onMultiple && names.length > 1) onMultiple(names);
      else onChange(names[0]);
    } catch (e) {
      toast(`Could not import image: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  return (
    <>
      <div
        ref={ref}
        tabIndex={0}
        className={['image-drop', url && 'has-image', contain && 'contain', dragging && 'dragging'].filter(Boolean).join(' ')}
        style={{ width, height, aspectRatio: height ? undefined : String(aspect), borderRadius: round ? '50%' : undefined, ...style }}
        onClick={() => (url ? setZoom(true) : pick())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
          if ((e.key === 'Delete' || e.key === 'Backspace') && value) onChange(undefined);
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.length) {
            e.preventDefault();
            handleFiles(files);
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(Array.from(e.dataTransfer.files));
        }}
        title={url ? 'Click to enlarge · paste or drop to replace' : 'Click to choose, drop a file, or paste (Ctrl+V)'}
      >
        {url ? (
          <>
            <img src={url} alt="" draggable={false} />
            {!round && (
              <div className="image-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm icon" title="View" onClick={() => setZoom(true)}>
                  <Maximize2 />
                </button>
                <button className="btn sm icon" title="Replace" onClick={pick}>
                  <RefreshCw />
                </button>
                <button className="btn sm icon" title="Remove" onClick={() => onChange(undefined)}>
                  <Trash2 />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="placeholder">
            <ImagePlus />
            {!round && <span>{busy ? 'Importing…' : label}</span>}
          </div>
        )}
      </div>
      <Modal
        open={zoom}
        onClose={() => setZoom(false)}
        size="xl"
        title="Image"
        footer={
          <>
            <button
              className="btn danger"
              onClick={() => {
                onChange(undefined);
                setZoom(false);
              }}
            >
              <Trash2 /> Remove
            </button>
            <div className="spacer" />
            <button
              className="btn"
              onClick={() => {
                setZoom(false);
                pick();
              }}
            >
              <RefreshCw /> Replace…
            </button>
            <button className="btn primary" onClick={() => setZoom(false)}>
              Done
            </button>
          </>
        }
      >
        <img src={url} alt="" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', background: '#000', borderRadius: 8 }} />
      </Modal>
    </>
  );
}

/** Simple read-only asset image. */
export function AssetImage({ name, alt = '', style, className, fit = 'cover' }: { name?: string; alt?: string; style?: CSSProperties; className?: string; fit?: 'cover' | 'contain' }) {
  const url = assetUrl(name);
  if (!url) return <div className={className} style={{ background: 'var(--bg-sunken)', ...style }} />;
  return <img src={url} alt={alt} className={className} draggable={false} style={{ objectFit: fit, display: 'block', ...style }} />;
}
