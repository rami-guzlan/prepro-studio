/* Progress photos: storing images in the space and loading them for canvas use
   (blob URLs keep the canvas origin-clean so the timelapse can be recorded). */
import { backend, importImageFile } from '@/backend';
import { useSpaceStore } from '@/store/space';
import { uid } from '@/lib/id';
import { updateTraining } from './ops';
import type { ISODate, Pose, ProgressPhoto } from './types';

/** Longest side of stored progress photos (px). */
export const PHOTO_MAX = 1600;

export async function storePhoto(file: Blob, date: ISODate, pose: Pose, notes?: string): Promise<string> {
  const asset = await importImageFile(file, PHOTO_MAX);
  const id = uid('pho');
  updateTraining((t) => {
    const p: ProgressPhoto = { id, date, pose, asset };
    if (notes) p.notes = notes;
    t.photos.push(p);
    t.photos.sort((a, b) => a.date.localeCompare(b.date));
  });
  return id;
}

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Load an asset of the open space as an <img> from a blob URL (cached). */
export function loadPhoto(asset: string): Promise<HTMLImageElement> {
  const sid = useSpaceStore.getState().space?.id ?? '';
  const key = `${sid}/${asset}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const bytes = await backend.readAsset(sid, asset);
      if (!bytes) throw new Error('Photo file missing');
      const ext = asset.split('.').pop()?.toLowerCase();
      const type = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Could not decode the photo'));
        img.src = url;
      });
      return img;
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Draw an image to cover/contain a box on a canvas context. */
export function drawFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, mode: 'contain' | 'cover' = 'contain') {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const s = mode === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
