/* Image preparation before storing in a project: downscales very large
   photos (phones produce 12+ MP) so storyboards & PDFs stay light. */

export interface PreparedImage {
  bytes: Uint8Array;
  ext: 'jpg' | 'png' | 'webp' | 'gif' | 'svg';
  mime: string;
  width: number;
  height: number;
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp';

export function isImageFile(f: File | Blob): boolean {
  return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test((f as File).name ?? '');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

function canvasHasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // sample a grid of pixels for transparency
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] < 250) return true;
    }
  }
  return false;
}

export async function prepareImage(file: Blob, maxSize = 2400, quality = 0.9): Promise<PreparedImage> {
  const type = file.type || '';
  // keep SVG and GIF as-is (vector / animation)
  if (type === 'image/svg+xml' || type === 'image/gif') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let width = 0;
    let height = 0;
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      width = img.naturalWidth;
      height = img.naturalHeight;
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    return { bytes, ext: type === 'image/gif' ? 'gif' : 'svg', mime: type, width, height };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const scale = Math.min(1, maxSize / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const needsResize = scale < 1;
    const isPng = type === 'image/png' || type === 'image/webp' || type === 'image/bmp';

    // small enough jpeg/png: keep original bytes (no re-encode quality loss)
    if (!needsResize && (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') && file.size < 4_000_000) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
      return { bytes, ext, mime: type, width: w0, height: h0 };
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: isPng })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const alpha = isPng && canvasHasAlpha(ctx, w, h);
    const mime = alpha ? 'image/png' : 'image/jpeg';
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), mime, quality),
    );
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: alpha ? 'png' : 'jpg', mime, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert a canvas to PNG bytes. */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function extToMime(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  return (
    { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', pdf: 'application/pdf' } as Record<string, string>
  )[e] ?? 'application/octet-stream';
}
