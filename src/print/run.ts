/* Export / print entry points usable from anywhere:
     exportDocPdf('cast-list')   printDoc('call-sheet', { dayId })
   and the merged "production book" PDF. */
import { PDFDocument } from 'pdf-lib';
import type { PaperSize } from '@/types';
import type { Orientation } from './types';
import { getPrintDoc } from './registry';
import { buildDocument, makeContext, toJob, type BuiltDoc } from './build';
import { backend } from '@/backend';
import { getProject } from '@/store/project';
import { toast } from '@/ui/Toast';
import { safeFileName } from '@/lib/text';

export function buildDoc(docId: string, options: Record<string, unknown> = {}, paper?: PaperSize, orientation?: Orientation): BuiltDoc {
  const def = getPrintDoc(docId);
  if (!def) throw new Error(`Unknown document: ${docId}`);
  const project = getProject();
  return buildDocument(def, makeContext(project, def, options, paper, orientation));
}

export async function exportBuiltPdf(doc: BuiltDoc): Promise<void> {
  try {
    const path = await backend.exportPdf(toJob(doc));
    if (path) toast(`Saved ${doc.fileName}`, 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
  } catch (e) {
    toast(`PDF export failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

export async function exportDocPdf(docId: string, options: Record<string, unknown> = {}) {
  await exportBuiltPdf(buildDoc(docId, options));
}

export async function printDoc(docId: string, options: Record<string, unknown> = {}) {
  try {
    await backend.printPdf(toJob(buildDoc(docId, options)));
  } catch (e) {
    toast(`Print failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

export interface BookPart {
  docId: string;
  options?: Record<string, unknown>;
}

/** Desktop: render several documents and merge them into one PDF. */
export async function buildBookPdf(parts: BookPart[], onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  if (!backend.renderPdfBytes) throw new Error('Merged PDFs need the desktop app');
  const merged = await PDFDocument.create();
  const project = getProject();
  merged.setTitle(`${project.meta.title} — Production Book`);
  merged.setCreator('PrePro Studio');
  let i = 0;
  for (const part of parts) {
    onProgress?.(i, parts.length);
    const doc = buildDoc(part.docId, part.options ?? {});
    const bytes = await backend.renderPdfBytes(toJob(doc));
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const pg of pages) merged.addPage(pg);
    i++;
  }
  onProgress?.(parts.length, parts.length);
  return merged.save();
}

export async function exportBook(parts: BookPart[], onProgress?: (done: number, total: number) => void) {
  const project = getProject();
  const fileName = `${safeFileName(project.meta.title)} - Production Book.pdf`;
  if (backend.kind !== 'electron') {
    // browser: print documents one after another
    for (const p of parts) await printDoc(p.docId, p.options ?? {});
    return;
  }
  const bytes = await buildBookPdf(parts, onProgress);
  const path = await backend.savePdfBytes!(bytes, fileName);
  if (path) toast(`Saved ${fileName}`, 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
}
