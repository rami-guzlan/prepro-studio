/* PNG / SVG / CSV export of lighting diagrams. The SVG is the same static
   renderer used for print, serialised with inline attributes (no CSS),
   background images embedded as data URIs so the file is self-contained. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LightingDiagram, ProjectData } from '@/types';
import { backend, exportCsv, saveBinaryFile, saveTextFile } from '@/backend';
import { bytesToBase64, extToMime } from '@/lib/images';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui';
import { DiagramSvg, type StaticOpts } from './render';
import { cameraRows, dims, fixtureName, lightRows } from './model';

export const EXPORT_OPTS: StaticOpts = { beams: true, fov: true, grid: true, labels: true, crop: true, legend: true, scaleBar: true };

async function backgroundDataUrl(projectId: string, name?: string): Promise<string | undefined> {
  if (!name) return undefined;
  try {
    const bytes = await backend.readAsset(projectId, name);
    if (!bytes) return undefined;
    const ext = name.split('.').pop() ?? 'png';
    return `data:${extToMime(ext)};base64,${bytesToBase64(bytes)}`;
  } catch {
    return undefined;
  }
}

export async function diagramSvgString(d: LightingDiagram, projectId: string, opts: StaticOpts = EXPORT_OPTS): Promise<string> {
  const bgHref = await backgroundDataUrl(projectId, d.background);
  const markup = renderToStaticMarkup(createElement(DiagramSvg, { d, opts: { ...opts, title: d.name }, bgHref, idp: 'x' }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

function baseName(project: ProjectData, d: LightingDiagram) {
  return safeFileName(`${project.meta.title} - ${d.name || 'Lighting diagram'}`);
}

export async function exportDiagramSvg(project: ProjectData, d: LightingDiagram) {
  try {
    const svg = await diagramSvgString(d, project.id);
    const path = await saveTextFile(`${baseName(project, d)}.svg`, svg, [{ name: 'SVG image', extensions: ['svg'] }]);
    if (path !== null || backend.kind !== 'electron') toast('SVG exported');
  } catch (e) {
    toast(`SVG export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render the diagram image'));
    img.src = url;
  });
}

/** Render the diagram to PNG bytes at `scale`× its canvas size. */
export async function diagramPngBytes(d: LightingDiagram, projectId: string, scale = 2): Promise<Uint8Array> {
  const svg = await diagramSvgString(d, projectId);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const w = Math.max(1, Math.round((img.naturalWidth || 1200) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 800) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportDiagramPng(project: ProjectData, d: LightingDiagram) {
  try {
    const bytes = await diagramPngBytes(d, project.id, 2);
    const path = await saveBinaryFile(`${baseName(project, d)}.png`, bytes, [{ name: 'PNG image', extensions: ['png'] }]);
    if (path !== null || backend.kind !== 'electron') toast('PNG exported');
  } catch (e) {
    toast(`PNG export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

/** Light legend of one diagram as CSV (for the gaffer's spreadsheet). */
export async function exportLegendCsv(project: ProjectData, d: LightingDiagram) {
  const { units } = dims(d);
  const rows = [
    ...lightRows(d).map((r) => ({
      id: `L${r.n}`,
      kind: 'Light',
      purpose: r.purpose,
      name: fixtureName(r),
      type: r.type,
      power: r.watts ?? '',
      cct: r.cct ?? '',
      gel: r.gel,
      modifier: r.modifier === 'None' ? '' : r.modifier,
      intensity: `${r.intensity}%`,
      height: r.height != null ? `${r.height} ${units}` : '',
      channel: r.channel,
      notes: r.notes,
    })),
    ...cameraRows(d).map((c) => ({
      id: `Cam ${c.letter}`,
      kind: 'Camera',
      purpose: '',
      name: c.body || c.type,
      type: c.type,
      power: '',
      cct: '',
      gel: '',
      modifier: c.lens ? `${c.lens}mm` : '',
      intensity: '',
      height: c.height != null ? `${c.height} ${units}` : '',
      channel: c.support,
      notes: c.notes,
    })),
  ];
  try {
    const path = await exportCsv(`${baseName(project, d)} - key`, rows, [
      { header: '#', value: (r) => r.id },
      { header: 'Kind', value: (r) => r.kind },
      { header: 'Purpose', value: (r) => r.purpose },
      { header: 'Fixture / body', value: (r) => r.name },
      { header: 'Type', value: (r) => r.type },
      { header: 'Watts', value: (r) => r.power },
      { header: 'CCT (K)', value: (r) => r.cct },
      { header: 'Gel', value: (r) => r.gel },
      { header: 'Modifier / lens', value: (r) => r.modifier },
      { header: 'Intensity', value: (r) => r.intensity },
      { header: 'Height', value: (r) => r.height },
      { header: 'Channel / support', value: (r) => r.channel },
      { header: 'Notes', value: (r) => r.notes },
    ]);
    if (path !== null || backend.kind !== 'electron') toast('Key exported to CSV');
  } catch (e) {
    toast(`CSV export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
