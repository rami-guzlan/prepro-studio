/* Stored files of business spaces: receipts, signed copies, sent invoice PDFs,
   contractor invoices. Files live in the space's asset folder (they travel with
   backups and archives). Reuses the resource helpers of Brand Kit & Assets for
   type detection, drag & drop, download and "open in its app". */
import { useEffect, useState } from 'react';
import { Download, Eye, FileText, FolderOpen, Paperclip, Trash2, Upload } from 'lucide-react';
import type { BrandAsset } from '@/spaces/types';
import { assetUrl, backend, importAssetBlob, importAssetBytes, pickFileBlobs } from '@/backend';
import { toJob } from '@/print/build';
import { buildSpaceDoc } from '@/spaces/print/run';
import { plural, safeFileName } from '@/lib/text';
import { Button, IconButton, Modal, confirmDialog, toast } from '@/ui';
import { downloadResource, fileExt, formatBytes, openResourceExternally, previewKind, useFileDrop } from '@/spaces/modules/assets/resources';
import type { BizFile } from './types';
import { addFiles, makeFile, removeFile, type FileTarget } from './ops';

/* ---------------------------------------------------------------- actions */

/** A file to store: its bytes, or the file itself (a File / Blob — big videos upload straight from disk). */
export type UploadFile = { name: string; data: Uint8Array | Blob };
export const uploadSize = (files: UploadFile[]) => files.reduce((n, f) => n + (f.data instanceof Blob ? f.data.size : f.data.length), 0);

export async function storeFiles(files: UploadFile[]): Promise<BizFile[]> {
  const out: BizFile[] = [];
  const total = uploadSize(files);
  if (total > 20 * 1024 * 1024) toast(`Uploading ${plural(files.length, 'file')} (${formatBytes(total)})… keep this tab open`, 'info');
  for (const f of files) {
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : 'bin';
    const stored = f.data instanceof Blob ? await importAssetBlob(f.data, ext) : await importAssetBytes(f.data, ext);
    out.push(makeFile(stored, f.name, uploadSize([f])));
  }
  return out;
}

export async function pickFiles(title = 'Attach files (PDF, images, documents, videos)'): Promise<BizFile[]> {
  try {
    const files = await pickFileBlobs({ multiple: true, title });
    return await storeFiles(files.map((f) => ({ name: f.name, data: f })));
  } catch (e) {
    toast(`Could not add the files: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return [];
  }
}

export async function droppedFiles(files: File[]): Promise<BizFile[]> {
  try {
    return await storeFiles(files.map((f) => ({ name: f.name, data: f })));
  } catch (e) {
    toast(`Could not add the files: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return [];
  }
}

const asAsset = (f: BizFile): BrandAsset => ({ id: f.id, kind: 'doc', name: f.fileName, file: f.file, fileName: f.fileName, fileSize: f.fileSize }) as BrandAsset;

export const downloadBizFile = (f: BizFile) => downloadResource(asAsset(f));

/** Desktop: render a print document to PDF and store it on an item (e.g. the sent invoice). */
export const canStorePdf = () => !!backend.renderPdfBytes;

export async function storePdfCopy(target: FileTarget, docId: string, options: Record<string, unknown>, fileName: string): Promise<boolean> {
  if (!backend.renderPdfBytes) {
    toast('Saving a PDF copy needs the desktop app. Export the PDF and attach it instead.', 'info');
    return false;
  }
  try {
    const bytes = await backend.renderPdfBytes(toJob(buildSpaceDoc(docId, options)));
    const name = `${safeFileName(fileName)}.pdf`;
    const stored = await importAssetBytes(bytes, 'pdf');
    addFiles(target, [makeFile(stored, name, bytes.length)]);
    toast(`Saved ${name} with it`);
    return true;
  } catch (e) {
    toast(`Could not create the PDF: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return false;
  }
}

/* ---------------------------------------------------------------- viewer */

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.text())
      .then((t) => alive && setText(t.length > 200_000 ? `${t.slice(0, 200_000)}\n…` : t))
      .catch(() => alive && setText(''));
    return () => {
      alive = false;
    };
  }, [url]);
  return <pre className="biz-file-text">{text == null ? 'Loading…' : text || '(empty file)'}</pre>;
}

export function FileViewer({ file, onClose }: { file: BizFile; onClose: () => void }) {
  const kind = previewKind(fileExt({ file: file.file, fileName: file.fileName }));
  const url = assetUrl(file.file);
  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={file.fileName}
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <span className="muted small">{[formatBytes(file.fileSize), file.addedAt].filter(Boolean).join(' · ')}</span>
          <div className="spacer" />
          {backend.assetPath && (
            <Button icon={FolderOpen} onClick={() => void openResourceExternally(asAsset(file))}>
              Open in its app
            </Button>
          )}
          <Button icon={Download} onClick={() => void downloadBizFile(file)}>
            Download
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="biz-file-stage">
        {kind === 'pdf' ? (
          <iframe src={url} title={file.fileName} />
        ) : kind === 'image' ? (
          <img src={url} alt={file.fileName} />
        ) : kind === 'text' ? (
          <TextPreview url={url} />
        ) : kind === 'video' ? (
          <video src={url} controls />
        ) : kind === 'audio' ? (
          <audio src={url} controls />
        ) : (
          <div className="biz-file-none">
            <FileText size={34} />
            <b>{file.fileName}</b>
            <span className="muted small">No preview for this kind of file — open it in its app or download a copy.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- list */

/** Attachments of an item: list + upload button + drop zone. */
export function FileBox({ target, files, label = 'Attachments', empty = 'Drop files here or click Attach', compact }: { target: FileTarget; files: BizFile[] | undefined; label?: string; empty?: string; compact?: boolean }) {
  const [open, setOpen] = useState<BizFile | null>(null);
  const list = files ?? [];
  const drop = useFileDrop(async (fs) => {
    const made = await droppedFiles(fs);
    if (made.length) {
      addFiles(target, made);
      toast(`Attached ${plural(made.length, 'file')}`);
    }
  });
  const attach = async () => {
    const made = await pickFiles();
    if (made.length) {
      addFiles(target, made);
      toast(`Attached ${plural(made.length, 'file')}`);
    }
  };
  const remove = async (f: BizFile) => {
    if (await confirmDialog({ title: `Remove “${f.fileName}”?`, message: 'The file is removed from this item. You can undo with Ctrl+Z.', confirmLabel: 'Remove', danger: true })) removeFile(target, f.id);
  };
  return (
    <div className={`biz-files ${drop.over ? 'over' : ''} ${compact ? 'compact' : ''}`} {...drop.props}>
      <div className="biz-files-head">
        <Paperclip size={14} />
        <b>{label}</b>
        {list.length > 0 && <span className="muted small">{list.length}</span>}
        <div className="spacer" />
        <Button size="sm" icon={Upload} onClick={() => void attach()}>
          Attach
        </Button>
      </div>
      {list.length === 0 ? (
        <div className="biz-files-empty muted small">{empty}</div>
      ) : (
        <div className="biz-files-list">
          {list.map((f) => {
            const kind = previewKind(fileExt({ file: f.file, fileName: f.fileName }));
            return (
              <div key={f.id} className="biz-file-row">
                <button type="button" className="biz-file-main" onClick={() => setOpen(f)} title="Open">
                  <span className="biz-file-icon">{kind === 'image' ? <img src={assetUrl(f.file)} alt="" /> : <FileText size={15} />}</span>
                  <span className="biz-file-name ellipsis">{f.fileName}</span>
                  <span className="muted tiny">{formatBytes(f.fileSize)}</span>
                </button>
                <IconButton icon={Eye} size="sm" label="View" onClick={() => setOpen(f)} />
                <IconButton icon={Download} size="sm" label="Download" onClick={() => void downloadBizFile(f)} />
                <IconButton icon={Trash2} size="sm" label="Remove" onClick={() => void remove(f)} />
              </div>
            );
          })}
        </div>
      )}
      {open && <FileViewer file={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
