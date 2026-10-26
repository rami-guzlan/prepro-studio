/* Import / export of the design system from the screens (toasts + error handling). */
import { toast, type MenuItem } from '@/ui';
import { FileArchive, FileCode2, FileJson, FileText } from 'lucide-react';
import { importDesignSystemFiles, pickAndImportDesignSystem, type DSImportResult } from '../importer';
import { exportDesignSystem, type DSExportFormat } from '../exporters';

function report(r: DSImportResult) {
  toast(`Design system imported: ${r.summary}`, 'success', { duration: 6000 });
  if (r.warnings.length) {
    const more = r.warnings.length > 3 ? ` (+${r.warnings.length - 3} more)` : '';
    toast(`${r.warnings.slice(0, 3).join(' · ')}${more}`, 'info', { duration: 9000 });
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** File picker → import. Returns true when something was imported. */
export async function pickImport(): Promise<boolean> {
  try {
    const r = await pickAndImportDesignSystem();
    if (!r) return false;
    report(r);
    return true;
  } catch (e) {
    toast(`Could not import: ${errText(e)}`, 'error');
    return false;
  }
}

/** Dropped files (a Claude Design design-system .zip …) → import. */
export async function importDroppedDesignSystem(files: File[]): Promise<boolean> {
  try {
    const list = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
    const r = await importDesignSystemFiles(list);
    report(r);
    return true;
  } catch (e) {
    toast(`Could not import: ${errText(e)}`, 'error');
    return false;
  }
}

export const isZipFile = (f: File) => /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';

export async function runExport(format: DSExportFormat) {
  try {
    await exportDesignSystem(format);
  } catch (e) {
    toast(`Could not export: ${errText(e)}`, 'error');
  }
}

export const EXPORT_ITEMS: { format: DSExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: 'zip', label: 'Design system bundle (.zip)', hint: 'README guide, tokens, logos, fonts, images, briefs', icon: FileArchive },
  { format: 'md', label: 'Agent guide (.md)', hint: 'The guide as one Markdown file', icon: FileText },
  { format: 'json', label: 'Tokens (.json)', hint: 'Design tokens (W3C format)', icon: FileJson },
  { format: 'css', label: 'Tokens (.css)', hint: 'CSS custom properties, one block per theme', icon: FileCode2 },
];

export const exportMenuItems = (): MenuItem[] => [{ header: 'Design system' }, ...EXPORT_ITEMS.map((x) => ({ label: x.label, icon: x.icon, onClick: () => void runExport(x.format) }))];
