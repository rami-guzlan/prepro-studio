/* Location photo gallery: add (pick / drop / paste), drag to reorder, first photo = cover, lightbox. */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Maximize2, Star, Trash2 } from 'lucide-react';
import { assetUrl, importDroppedImages, pickImages } from '@/backend';
import { undo } from '@/store/project';
import { Button, Modal, toast } from '@/ui';

export function PhotoGallery({ photos, onChange, name }: { photos: string[]; onChange: (photos: string[]) => void; name: string }) {
  const [view, setView] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const names = await importDroppedImages(files);
      if (!names.length) toast('Those files are not images', 'error');
      else {
        onChange([...photos, ...names]);
        toast(`Added ${names.length} ${names.length === 1 ? 'photo' : 'photos'}`);
      }
    } catch (e) {
      toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    try {
      setBusy(true);
      const names = await pickImages(true);
      if (names.length) onChange([...photos, ...names]);
    } catch (e) {
      toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || from >= photos.length) return;
    const arr = [...photos];
    const [x] = arr.splice(from, 1);
    arr.splice(Math.max(0, Math.min(arr.length, to)), 0, x);
    onChange(arr);
  };

  const remove = (i: number) => {
    onChange(photos.filter((_, j) => j !== i));
    toast('Photo removed', 'success', { action: { label: 'Undo', onClick: () => undo() } });
  };

  return (
    <div
      className={`loc-gallery ${fileOver ? 'fileover' : ''}`}
      tabIndex={-1}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          addFiles(files);
        }
      }}
      onDragOver={(e) => {
        if (dragIdx == null && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setFileOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setFileOver(false);
      }}
      onDrop={(e) => {
        if (dragIdx != null) return;
        e.preventDefault();
        setFileOver(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {photos.map((ph, i) => (
        <div
          key={`${ph}-${i}`}
          className={['loc-photo', i === 0 && 'cover', overIdx === i && dragIdx !== i && 'over', dragIdx === i && 'dragging'].filter(Boolean).join(' ')}
          draggable
          tabIndex={0}
          title="Click to view · drag to reorder"
          onClick={() => setView(i)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setView(i);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              e.stopPropagation();
              remove(i);
            }
          }}
          onDragStart={(e) => {
            setDragIdx(i);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          }}
          onDragEnd={() => {
            setDragIdx(null);
            setOverIdx(null);
          }}
          onDragOver={(e) => {
            if (dragIdx == null) return;
            e.preventDefault();
            if (overIdx !== i) setOverIdx(i);
          }}
          onDrop={(e) => {
            if (dragIdx == null) return;
            e.preventDefault();
            e.stopPropagation();
            move(dragIdx, i);
            setDragIdx(null);
            setOverIdx(null);
          }}
        >
          <img src={assetUrl(ph)} alt="" draggable={false} />
          {i === 0 && (
            <span className="loc-cover-badge">
              <Star size={10} /> Cover
            </span>
          )}
          <div className="loc-photo-actions" onClick={(e) => e.stopPropagation()}>
            {i > 0 && (
              <button type="button" className="btn sm icon" title="Make cover photo" onClick={() => move(i, 0)}>
                <Star />
              </button>
            )}
            <button type="button" className="btn sm icon" title="View" onClick={() => setView(i)}>
              <Maximize2 />
            </button>
            <button type="button" className="btn sm icon" title="Remove" onClick={() => remove(i)}>
              <Trash2 />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="loc-photo-add" onClick={pick} disabled={busy}>
        {busy ? <Loader2 className="spin" /> : <ImagePlus />}
        <span className="strong">{busy ? 'Importing…' : photos.length ? 'Add photos' : 'Add location photos'}</span>
        <span className="tiny">Click, drop files or paste</span>
      </button>
      {view != null && photos[view] && (
        <Lightbox
          photos={photos}
          index={view}
          name={name}
          onIndex={setView}
          onClose={() => setView(null)}
          onCover={(i) => {
            move(i, 0);
            setView(0);
          }}
          onRemove={(i) => {
            remove(i);
            if (photos.length <= 1) setView(null);
            else setView(Math.min(i, photos.length - 2));
          }}
        />
      )}
    </div>
  );
}

function Lightbox({
  photos,
  index,
  name,
  onIndex,
  onClose,
  onCover,
  onRemove,
}: {
  photos: string[];
  index: number;
  name: string;
  onIndex: (i: number) => void;
  onClose: () => void;
  onCover: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const n = photos.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onIndex((index - 1 + n) % n);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onIndex((index + 1) % n);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, n, onIndex]);

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`${name || 'Location'} — photo ${index + 1} of ${n}`}
      bodyStyle={{ padding: 0, background: '#000' }}
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={() => onRemove(index)}>
            Remove
          </Button>
          <Button icon={Star} disabled={index === 0} onClick={() => onCover(index)}>
            {index === 0 ? 'Cover photo' : 'Make cover'}
          </Button>
          <div className="spacer" />
          <span className="muted small">← → to browse</span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="loc-lightbox">
        <img src={assetUrl(photos[index])} alt="" />
        {n > 1 && (
          <>
            <button type="button" className="loc-lb-nav prev" aria-label="Previous photo" onClick={() => onIndex((index - 1 + n) % n)}>
              <ChevronLeft />
            </button>
            <button type="button" className="loc-lb-nav next" aria-label="Next photo" onClick={() => onIndex((index + 1) % n)}>
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="loc-lb-strip">
          {photos.map((ph, i) => (
            <button key={`${ph}-${i}`} type="button" className={i === index ? 'on' : ''} onClick={() => onIndex(i)} aria-label={`Photo ${i + 1}`}>
              <img src={assetUrl(ph)} alt="" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
