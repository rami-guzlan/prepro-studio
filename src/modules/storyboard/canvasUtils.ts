/* Canvas helpers for the storyboard (sketch editor, frame export). Images are
   loaded from the project's asset bytes through blob: URLs so canvases never
   become "tainted" (toBlob keeps working in the desktop app and the browser). */
import type { Shot } from '@/types';
import { backend, getCurrentProjectId } from '@/backend';
import { extToMime } from '@/lib/images';

export interface LoadedImage {
  img: HTMLImageElement;
  release: () => void;
}

export async function loadAssetImage(name: string): Promise<LoadedImage> {
  const bytes = await backend.readAsset(getCurrentProjectId(), name);
  if (!bytes) throw new Error(`Image ${name} is missing from the project folder`);
  const ext = name.split('.').pop() ?? 'png';
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: extToMime(ext) }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read image ${name}`));
      el.src = url;
    });
    return { img, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Load a File/Blob (e.g. from the clipboard) as an image element. */
export async function loadBlobImage(blob: Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read image'));
    el.src = url;
  });
  return { img, release: () => URL.revokeObjectURL(url) };
}

function sourceSize(src: CanvasImageSource): { w: number; h: number } {
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  if (src instanceof HTMLCanvasElement) return { w: src.width, h: src.height };
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) return { w: src.width, h: src.height };
  const any = src as { width?: number; height?: number };
  return { w: Number(any.width) || 1, h: Number(any.height) || 1 };
}

/** drawImage with object-fit: cover semantics. */
export function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const { w: iw, h: ih } = sourceSize(src);
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
}

/** Internal pixel size of a frame for the project aspect ratio (long side = `long`). */
export function frameSize(aspect: number, long = 1600): { w: number; h: number } {
  const a = aspect > 0 ? aspect : 16 / 9;
  return a >= 1 ? { w: long, h: Math.round(long / a) } : { w: Math.round(long * a), h: long };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n|\r/);
}

/** Wrap text into at most `maxLines` lines that fit `width` (adds … when cut). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const all: string[] = [];
  for (const para of splitLines(text)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (!line || ctx.measureText(test).width <= width) line = test;
      else {
        all.push(line);
        line = w;
      }
    }
    if (line) all.push(line);
  }
  const fit = (s: string) => {
    let t = s;
    while (t.length > 1 && ctx.measureText(t).width > width) t = t.slice(0, -1);
    return t;
  };
  if (all.length <= maxLines) return all.map((l) => (ctx.measureText(l).width > width ? `${fit(l).slice(0, -1)}…` : l));
  const lines = all.slice(0, maxLines);
  let last = lines[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  lines[maxLines - 1] = `${last.trimEnd()}…`;
  return lines;
}

/** Draws image + drawing of a shot into the given rect (white when there is no image). */
export async function drawShotFrame(ctx: CanvasRenderingContext2D, shot: Pick<Shot, 'image' | 'drawing'>, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  if (shot.image) {
    try {
      const l = await loadAssetImage(shot.image);
      drawCover(ctx, l.img, x, y, w, h);
      l.release();
    } catch {
      /* missing image: keep white */
    }
  }
  if (shot.drawing) {
    try {
      const l = await loadAssetImage(shot.drawing);
      ctx.drawImage(l.img, x, y, w, h);
      l.release();
    } catch {
      /* ignore */
    }
  }
  ctx.restore();
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error('Encode failed'));
        b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      },
      'image/jpeg',
      quality,
    ),
  );
}

/** true when every pixel is fully transparent. */
export function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}
