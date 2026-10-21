import type { Backend, PdfJob } from './types';
import type { ProjectData } from '@/types';
import type { SpaceData, SpaceSummary } from '@/spaces/types';

/** Shape of window.prepro exposed by electron/preload.cjs */
export interface PreproBridge {
  isElectron: true;
  info(): Promise<any>;
  setDemosHidden(patch: { project?: boolean; space?: boolean }): Promise<{ project?: boolean; space?: boolean }>;
  financePin: {
    status(): Promise<{ set: boolean }>;
    verify(pin: string): Promise<{ ok: boolean; error?: string }>;
    set(current: string | null, next: string): Promise<{ ok: boolean; error?: string }>;
  };
  listProjects(): Promise<any[]>;
  loadProject(id: string): Promise<any>;
  createProject(data: any): Promise<any>;
  saveProject(data: any): Promise<boolean>;
  deleteProject(id: string): Promise<boolean>;
  duplicateProject(id: string, newId: string, newTitle: string): Promise<any>;
  readAllProjectFiles(id: string): Promise<{ path: string; data: Uint8Array }[]>;
  writeProjectFiles(id: string, title: string, files: { path: string; data: Uint8Array }[]): Promise<any>;
  openProjectFolder(id: string): Promise<string>;
  listSpaces(): Promise<SpaceSummary[]>;
  loadSpace(id: string): Promise<SpaceData>;
  createSpace(data: SpaceData): Promise<unknown>;
  saveSpace(data: SpaceData): Promise<boolean>;
  deleteSpace(id: string): Promise<boolean>;
  duplicateSpace(id: string, newId: string, newTitle: string): Promise<unknown>;
  projectDir(id: string): Promise<string>;
  importAsset(projectId: string, bytes: Uint8Array, ext: string): Promise<string>;
  readAsset(projectId: string, name: string): Promise<Uint8Array | null>;
  listBackups(id: string): Promise<any[]>;
  restoreBackup(id: string, name: string): Promise<any>;
  renderPdf(html: string, opts: any): Promise<Uint8Array>;
  savePdf(html: string, opts: any): Promise<string | null>;
  savePdfBytes(bytes: Uint8Array, opts: any): Promise<string | null>;
  previewPdf(payload: string | Uint8Array, opts: any): Promise<string>;
  tempPdf(payload: string | Uint8Array, opts: any): Promise<{ url: string; bytes: Uint8Array }>;
  saveFile(opts: any): Promise<string | null>;
  openFiles(opts: any): Promise<{ name: string; path: string; data: Uint8Array }[]>;
  reveal(p: string): Promise<void>;
  openPath(p: string): Promise<string>;
  openExternal(url: string): Promise<void>;
  chooseProjectsDir(): Promise<string | null>;
  setTitle(title: string): Promise<void>;
  onMenuCommand(cb: (cmd: string) => void): () => void;
  onRequestClose(cb: () => void): () => void;
  closeReady(): void;
  /** local MCP server for AI agents (electron/mcp.cjs) */
  mcp?: McpBridge;
}

export interface McpStatus {
  running: boolean;
  ready: boolean;
  port: number;
  error: string;
  enabled: boolean;
  configuredPort: number;
  url: string;
  exe: string;
  bridge: string;
  stdio: { command: string; args: string[]; env: Record<string, string> };
  packaged: boolean;
  client: { name?: string; title?: string; version?: string } | null;
  claudeDesktop: { file: string; exists: boolean; installed: boolean; dirExists: boolean }[];
  activity: { type: string; tool?: string; ok?: boolean; ms?: number; summary?: string; at: number; client?: { name?: string; title?: string } }[];
}

export interface McpBridge {
  onCall(cb: (req: { reqId: string; name: string; args: unknown }) => void): () => void;
  respond(msg: { reqId: string; result?: unknown; error?: string; summary?: string }): void;
  ready(describe: unknown): void;
  onActivity(cb: (ev: any) => void): () => void;
  status(): Promise<McpStatus>;
  setConfig(patch: { enabled?: boolean; port?: number }): Promise<{ running: boolean; port: number; error: string }>;
  installClaudeDesktop(): Promise<{ written: string[] }>;
  readFile(path: string): Promise<{ name: string; data: Uint8Array }>;
  fetchUrl(url: string): Promise<{ data: Uint8Array; contentType: string }>;
  writeFile(path: string, data: string | Uint8Array): Promise<string>;
  capture(maxWidth?: number): Promise<{ data: string; mimeType: string; width: number; height: number }>;
  snapshot(html: string, opts: { paper: string; landscape: boolean; page: number }): Promise<{ data: string; mimeType: string; pages: number; approximate: boolean }>;
}

declare global {
  interface Window {
    prepro?: PreproBridge;
  }
}

function pdfOpts(job: PdfJob) {
  return { fileName: job.fileName, title: job.title, paper: job.paper, landscape: job.landscape };
}

export function createElectronBackend(bridge: PreproBridge): Backend {
  return {
    kind: 'electron',
    info: () => bridge.info(),
    setDemosHidden: (patch) => bridge.setDemosHidden(patch),
    financePin: bridge.financePin,
    listProjects: () => bridge.listProjects(),
    loadProject: (id) => bridge.loadProject(id) as Promise<ProjectData>,
    createProject: async (p) => {
      await bridge.createProject(p);
    },
    saveProject: async (p) => {
      await bridge.saveProject(p);
    },
    deleteProject: async (id) => {
      await bridge.deleteProject(id);
    },
    duplicateProject: async (id, newId, newTitle) => {
      await bridge.duplicateProject(id, newId, newTitle);
    },
    listSpaces: () => bridge.listSpaces(),
    loadSpace: (id) => bridge.loadSpace(id),
    createSpace: async (s) => {
      await bridge.createSpace(s);
    },
    saveSpace: async (s) => {
      await bridge.saveSpace(s);
    },
    deleteSpace: async (id) => {
      await bridge.deleteSpace(id);
    },
    duplicateSpace: async (id, newId, newTitle) => {
      await bridge.duplicateSpace(id, newId, newTitle);
    },
    importAsset: (projectId, bytes, ext) => bridge.importAsset(projectId, bytes, ext),
    readAsset: (projectId, name) => bridge.readAsset(projectId, name),
    assetUrl: (projectId, name) => `app://asset/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}`,
    prepareAssets: async () => {},
    exportPdf: (job) => bridge.savePdf(job.html, pdfOpts(job)),
    printPdf: async (job) => {
      await bridge.previewPdf(job.html, pdfOpts(job));
    },
    renderPdfBytes: async (job) => new Uint8Array(await bridge.renderPdf(job.html, pdfOpts(job))),
    savePdfBytes: (bytes, fileName) => bridge.savePdfBytes(bytes, { fileName }),
    previewPdfBytes: async (bytes, title) => {
      await bridge.previewPdf(bytes, { title });
    },
    tempPdf: (payload) => (payload instanceof Uint8Array ? bridge.tempPdf(payload, {}) : bridge.tempPdf(payload.html, pdfOpts(payload))),
    saveFile: (opts) => bridge.saveFile(opts),
    openFiles: (opts) => bridge.openFiles(opts),
    readAllProjectFiles: (id) => bridge.readAllProjectFiles(id),
    writeProjectFiles: async (id, title, files) => {
      await bridge.writeProjectFiles(id, title, files);
    },
    listBackups: (id) => bridge.listBackups(id),
    restoreBackup: (id, name) => bridge.restoreBackup(id, name),
    assetPath: async (id, name) => {
      const dir = await bridge.projectDir(id);
      const sep = dir.includes('\\') ? '\\' : '/';
      return `${dir}${sep}assets${sep}${name}`;
    },
    openProjectFolder: async (id) => {
      await bridge.openProjectFolder(id);
    },
    reveal: (p) => void bridge.reveal(p),
    openPath: (p) => void bridge.openPath(p),
    openExternal: (url) => void bridge.openExternal(url),
    chooseProjectsDir: () => bridge.chooseProjectsDir(),
    setWindowTitle: (t) => void bridge.setTitle(t),
  };
}
