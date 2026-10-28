import type { PaperSize, ProjectData, ProjectSummary } from '@/types';
import type { SpaceData, SpaceSummary } from '@/spaces/types';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenedFile {
  name: string;
  data: Uint8Array;
  path?: string;
}

export interface PdfJob {
  /** complete HTML document produced by buildPrintHtml() */
  html: string;
  /** suggested file name, e.g. 'My Film - Shot List.pdf' */
  fileName: string;
  /** document title (PDF metadata / window title) */
  title: string;
  paper: PaperSize;
  landscape: boolean;
}

export interface BackupInfo {
  name: string;
  date: string;
  size: number;
}

/** Demo cards the user removed from the home screen (the demos stay in the Help menu). */
export interface HiddenDemos {
  project?: boolean;
  space?: boolean;
}

export interface AppInfo {
  version: string;
  platform: string;
  projectsDir?: string;
  electron?: string;
  hiddenDemos?: HiddenDemos;
  /** hosted version: who is signed in and which tabs they may see */
  account?: import('./cloud').CloudAccount;
  /** automated tests with an isolated data folder only */
  testUnlockFinances?: boolean;
}

export interface Backend {
  kind: 'electron' | 'web' | 'cloud';
  info(): Promise<AppInfo>;
  /** Personal Finances PIN (stored as a salted hash, never the PIN itself). */
  financePin: {
    status(): Promise<{ set: boolean }>;
    verify(pin: string): Promise<{ ok: boolean; error?: string }>;
    /** current is required when a PIN is already set */
    set(current: string | null, next: string): Promise<{ ok: boolean; error?: string }>;
  };
  /** Show / hide the demo cards on the home screen. */
  setDemosHidden(patch: HiddenDemos): Promise<HiddenDemos>;

  listProjects(): Promise<ProjectSummary[]>;
  loadProject(id: string): Promise<ProjectData>;
  createProject(p: ProjectData): Promise<void>;
  saveProject(p: ProjectData): Promise<void>;
  /** Desktop: moves the folder to the Recycle Bin. */
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string, newId: string, newTitle: string): Promise<void>;

  /* Marketing Spaces (assets use the same importAsset / assetUrl with the space id) */
  listSpaces(): Promise<SpaceSummary[]>;
  loadSpace(id: string): Promise<SpaceData>;
  createSpace(s: SpaceData): Promise<void>;
  saveSpace(s: SpaceData): Promise<void>;
  /** Desktop: moves the folder to the Recycle Bin. */
  deleteSpace(id: string): Promise<void>;
  duplicateSpace(id: string, newId: string, newTitle: string): Promise<void>;

  /** Store image/file bytes inside the project; returns the asset name. */
  importAsset(projectId: string, bytes: Uint8Array, ext: string): Promise<string>;
  /** Hosted version: store a (large) file straight from disk, without reading it into memory. */
  importAssetBlob?(projectId: string, blob: Blob, ext: string): Promise<string>;
  readAsset(projectId: string, name: string): Promise<Uint8Array | null>;
  /** Synchronous URL usable in <img src>. */
  assetUrl(projectId: string, name: string): string;
  /** Prepare asset URLs for a project (web backend loads blobs). */
  prepareAssets(projectId: string): Promise<void>;

  /** Render + ask where to save. Returns saved path or null (cancelled / browser download). */
  exportPdf(job: PdfJob): Promise<string | null>;
  /** Open a print preview (desktop: PDF viewer window; web: browser print dialog). */
  printPdf(job: PdfJob): Promise<void>;
  /** Desktop only: render PDF bytes (used to merge the production book). */
  renderPdfBytes?(job: PdfJob): Promise<Uint8Array>;
  /** Save already-rendered PDF bytes. */
  savePdfBytes?(bytes: Uint8Array, fileName: string): Promise<string | null>;
  /** Open PDF bytes in a preview window. */
  previewPdfBytes?(bytes: Uint8Array, title: string): Promise<void>;
  /** Desktop only: render to a temporary PDF; returns a URL loadable in an iframe + the bytes. */
  tempPdf?(payload: PdfJob | Uint8Array): Promise<{ url: string; bytes: Uint8Array }>;

  saveFile(opts: { fileName: string; data: string | Uint8Array; filters?: FileFilter[]; title?: string }): Promise<string | null>;
  openFiles(opts: { filters?: FileFilter[]; multiple?: boolean; title?: string }): Promise<OpenedFile[]>;

  /** All files of a project folder (project.json + assets/...) for archiving. */
  readAllProjectFiles(id: string): Promise<{ path: string; data: Uint8Array }[]>;
  /** Write an imported project folder. */
  writeProjectFiles(id: string, title: string, files: { path: string; data: Uint8Array }[]): Promise<void>;

  listBackups(id: string): Promise<BackupInfo[]>;
  restoreBackup(id: string, name: string): Promise<ProjectData>;

  openProjectFolder?(id: string): Promise<void>;
  /** Desktop: absolute path of a stored asset (to open it in its default app). */
  assetPath?(docId: string, name: string): Promise<string>;
  reveal?(path: string): void;
  openPath?(path: string): void;
  openExternal?(url: string): void;
  chooseProjectsDir?(): Promise<string | null>;
  setWindowTitle?(title: string): void;
}
