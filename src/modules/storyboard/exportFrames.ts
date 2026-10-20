/* "Export frames for Miro": every frame composited (image + sketch layer) with a
   caption strip, saved as PNGs in one .zip (drag the files onto a Miro board). */
import { zipSync, type Zippable } from 'fflate';
import type { Shot } from '@/types';
import type { SceneInfo } from '@/derived/script';
import { saveBinaryFile } from '@/backend';
import { canvasToPng } from '@/lib/images';
import { safeFileName } from '@/lib/text';
import { shotSeconds, shotSpecs } from '../shots/shotData';
import { drawShotFrame, wrapLines } from './canvasUtils';
import { FONT_STACK } from './sketch';

export interface ExportItem {
  shot: Shot;
  scene?: SceneInfo;
}

function padPart(n: string | undefined, fallback: string): string {
  const s = (n ?? '').trim();
  if (!s) return fallback;
  const m = /^(\d+)(.*)$/.exec(s);
  const clean = (x: string) => x.replace(/[^A-Za-z0-9-]/g, '');
  if (!m) return clean(s) || fallback;
  return m[1].padStart(2, '0') + clean(m[2]);
}

/** S01_SH02.png (S00 = no scene) */
export function frameFileName(shot: Shot, scene: SceneInfo | undefined): string {
  return `S${scene ? padPart(scene.number, '00') : '00'}_SH${padPart(shot.number, '00')}.png`;
}

export async function exportFramesForMiro(items: ExportItem[], aspect: number, projectTitle: string, onProgress?: (done: number, total: number) => void): Promise<string | null | false> {
  if (!items.length) return false;
  if (document.fonts?.ready) await document.fonts.ready;
  const FW = aspect >= 1 ? 1600 : 1080;
  const FH = Math.round(FW / (aspect > 0 ? aspect : 16 / 9));
  const k = FW / 1600;
  const pad = Math.round(36 * k);
  const capH = Math.round(210 * k);
  const canvas = document.createElement('canvas');
  canvas.width = FW;
  canvas.height = FH + capH;
  const ctx = canvas.getContext('2d')!;
  const files: Zippable = {};
  const used = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length);
    const { shot, scene } = items[i];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (shot.image || shot.drawing) await drawShotFrame(ctx, shot, 0, 0, FW, FH);
    else {
      ctx.fillStyle = '#f1f1f4';
      ctx.fillRect(0, 0, FW, FH);
      ctx.fillStyle = '#b4b4bd';
      ctx.font = `700 ${Math.round(64 * k)}px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Shot ${shot.number || '—'}`, FW / 2, FH / 2 - 20 * k);
      ctx.font = `500 ${Math.round(28 * k)}px ${FONT_STACK}`;
      ctx.fillText('No frame yet', FW / 2, FH / 2 + 40 * k);
      ctx.textAlign = 'left';
    }

    // caption strip
    ctx.fillStyle = '#e2e2e8';
    ctx.fillRect(0, FH, FW, Math.max(1, Math.round(2 * k)));
    ctx.textBaseline = 'top';
    let y = FH + pad * 0.8;
    const title = scene ? `SCENE ${scene.number}  ·  SHOT ${shot.number || '—'}` : `SHOT ${shot.number || '—'}`;
    ctx.fillStyle = '#141418';
    ctx.font = `800 ${Math.round(34 * k)}px ${FONT_STACK}`;
    ctx.fillText(title, pad, y);
    const right = [shotSpecs(shot), `${shotSeconds(shot)}s`].filter(Boolean).join('  ·  ');
    ctx.font = `600 ${Math.round(24 * k)}px ${FONT_STACK}`;
    ctx.fillStyle = '#6b6b75';
    ctx.textAlign = 'right';
    ctx.fillText(right, FW - pad, y + 6 * k);
    ctx.textAlign = 'left';
    y += 50 * k;
    if (scene?.heading) {
      ctx.font = `600 ${Math.round(20 * k)}px ${FONT_STACK}`;
      ctx.fillStyle = '#85858f';
      ctx.fillText(wrapLines(ctx, scene.heading.toUpperCase(), FW - pad * 2, 1)[0] ?? '', pad, y);
      y += 30 * k;
    }
    ctx.font = `500 ${Math.round(26 * k)}px ${FONT_STACK}`;
    ctx.fillStyle = '#26262c';
    const desc = wrapLines(ctx, shot.description || '', FW - pad * 2, shot.audio ? 1 : 2);
    for (const line of desc) {
      ctx.fillText(line, pad, y);
      y += 34 * k;
    }
    if (shot.audio) {
      ctx.font = `italic 500 ${Math.round(24 * k)}px ${FONT_STACK}`;
      ctx.fillStyle = '#55555e';
      ctx.fillText(wrapLines(ctx, `♪ ${shot.audio}`, FW - pad * 2, 1)[0] ?? '', pad, y);
    }

    let name = frameFileName(shot, scene);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = frameFileName(shot, scene).replace(/\.png$/, `_${n}.png`);
    used.add(name.toLowerCase());
    files[name] = [await canvasToPng(canvas), { level: 0 }];
    // let the UI breathe between frames
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress?.(items.length, items.length);
  const zip = zipSync(files);
  return saveBinaryFile(`${safeFileName(projectTitle)} storyboard frames.zip`, zip, [{ name: 'ZIP archive', extensions: ['zip'] }]);
}
