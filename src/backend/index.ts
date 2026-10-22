/* Backend access for the whole app.
   - `backend` is the Electron (disk), cloud (hosted server) or web (IndexedDB) implementation.
   - assetUrl(name) resolves an asset of the currently open project.
   - importImageFile(file) stores an image in the current project and returns its asset name. */
import type { Backend, FileFilter } from './types';
import { createElectronBackend } from './electron';
import { createWebBackend } from './web';
import { cloudBoot, createCloudBackend } from './cloud';
import { prepareImage, isImageFile } from '@/lib/images';
import { toCSV, type CsvColumn } from '@/lib/csv';

export type { Backend, FileFilter, OpenedFile, PdfJob, BackupInfo, AppInfo, HiddenDemos } from './types';

export const backend: Backend = typeof window !== 'undefined' && window.prepro?.isElectron ? createElectronBackend(window.prepro) : cloudBoot ? createCloudBackend() : createWebBackend();

export const isCloud = backend.kind === 'cloud';

export const isDesktop = backend.kind === 'electron';

let currentProjectId = '';

/** Called by the project store when a project is opened / closed. */
export function setCurrentProjectId(id: string) {
  currentProjectId = id;
}

export function getCurrentProjectId(): string {
  return currentProjectId;
}

/** URL for an asset of the open project ('' if none). */
export function assetUrl(name?: string | null): string {
  if (!name || !currentProjectId) return '';
  return backend.assetUrl(currentProjectId, name);
}

/** Store an image (File/Blob) in the open project; returns its asset name. Large photos are downscaled. */
export async function importImageFile(file: Blob, maxSize = 2400): Promise<string> {
  if (!currentProjectId) throw new Error('No project open');
  const img = await prepareImage(file, maxSize);
  return backend.importAsset(currentProjectId, img.bytes, img.ext);
}

/** Store raw bytes (e.g. a PNG drawn on a canvas) in the open project. */
export async function importAssetBytes(bytes: Uint8Array, ext: string): Promise<string> {
  if (!currentProjectId) throw new Error('No project open');
  return backend.importAsset(currentProjectId, bytes, ext);
}

export const IMAGE_FILTERS: FileFilter[] = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }];

/** Show an open dialog for images and import them into the project. Returns asset names. */
export async function pickImages(multiple = false): Promise<string[]> {
  const files = await backend.openFiles({ filters: IMAGE_FILTERS, multiple, title: multiple ? 'Choose images' : 'Choose an image' });
  const out: string[] = [];
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    out.push(await importImageFile(new Blob([f.data as BlobPart], { type: mime })));
  }
  return out;
}

/** Import images from a drop / paste event's files. Non-images are ignored. */
export async function importDroppedImages(files: FileList | File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of Array.from(files)) if (isImageFile(f)) out.push(await importImageFile(f));
  return out;
}

export async function saveTextFile(fileName: string, text: string, filters?: FileFilter[]): Promise<string | null> {
  return backend.saveFile({ fileName, data: text, filters });
}

export async function saveBinaryFile(fileName: string, data: Uint8Array, filters?: FileFilter[]): Promise<string | null> {
  return backend.saveFile({ fileName, data, filters });
}

/** Export rows to a CSV file (opens in Excel / Google Sheets / Numbers). */
export async function exportCsv<T>(fileName: string, rows: T[], columns: CsvColumn<T>[]): Promise<string | null> {
  return backend.saveFile({
    fileName: fileName.endsWith('.csv') ? fileName : `${fileName}.csv`,
    data: toCSV(rows, columns),
    filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  });
}
