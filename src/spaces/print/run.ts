/* Export / print entry points for Marketing Space documents, and the merged
   "marketing plan" PDF (same idea as the projects' production book). */
import { PDFDocument } from 'pdf-lib';
import type { PaperSize } from '@/types';
import type { Orientation } from '@/print/types';
import { toJob, type BuiltDoc } from '@/print/build';
import { exportBuiltPdf } from '@/print/run';
import { backend } from '@/backend';
import { getSpace } from '@/store/space';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui/Toast';
import { getSpacePrintDoc } from './registry';
import { buildSpaceDocument, makeSpaceContext } from './build';

export function buildSpaceDoc(docId: string, options: Record<string, unknown> = {}, paper?: PaperSize, orientation?: Orientation): BuiltDoc {
  const def = getSpacePrintDoc(docId);
  if (!def) throw new Error(`Unknown document: ${docId}`);
  const space = getSpace();
  return buildSpaceDocument(def, makeSpaceContext(space, def, options, paper, orientation));
}

export async function exportSpaceDocPdf(docId: string, options: Record<string, unknown> = {}) {
  await exportBuiltPdf(buildSpaceDoc(docId, options));
}

export async function printSpaceDoc(docId: string, options: Record<string, unknown> = {}) {
  try {
    await backend.printPdf(toJob(buildSpaceDoc(docId, options)));
  } catch (e) {
    toast(`Print failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

export interface SpaceBookPart {
  docId: string;
  options?: Record<string, unknown>;
}

/** Desktop: render several documents and merge them into one PDF. */
export async function buildSpaceBookPdf(parts: SpaceBookPart[], onProgress?: (done: number, total: number) => void, paper?: PaperSize): Promise<Uint8Array> {
  if (!backend.renderPdfBytes) throw new Error('Merged PDFs need the desktop app');
  const space = getSpace();
  const merged = await PDFDocument.create();
  merged.setTitle(`${space.meta.title} — Marketing Plan`);
  merged.setCreator('PrePro Studio');
  let i = 0;
  for (const part of parts) {
    onProgress?.(i, parts.length);
    const bytes = await backend.renderPdfBytes(toJob(buildSpaceDoc(part.docId, part.options ?? {}, paper)));
    const src = await PDFDocument.load(bytes);
    for (const pg of await merged.copyPages(src, src.getPageIndices())) merged.addPage(pg);
    i++;
  }
  onProgress?.(parts.length, parts.length);
  return merged.save();
}

export async function exportSpaceBook(parts: SpaceBookPart[], onProgress?: (done: number, total: number) => void) {
  const space = getSpace();
  const k = space.meta.kind ?? 'marketing';
  const fileName = `${safeFileName(space.meta.title)} - ${k === 'business' ? 'Business Book' : k === 'finance' ? 'Finance Report' : k === 'training' ? 'Training Report' : 'Marketing Plan'}.pdf`;
  if (backend.kind !== 'electron') {
    for (const p of parts) await printSpaceDoc(p.docId, p.options ?? {});
    return;
  }
  const bytes = await buildSpaceBookPdf(parts, onProgress);
  const path = await backend.savePdfBytes!(bytes, fileName);
  if (path) toast(`Saved ${fileName}`, 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
}
