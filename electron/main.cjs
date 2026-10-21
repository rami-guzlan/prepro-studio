/* PrePro Studio — Electron main process.
   - Serves the built UI from dist/ through the privileged app:// scheme
     (app://bundle/...), project images through app://asset/<projectId>/<file>
     and temporary print files through app://print/<file>.
   - Stores each project as a folder: <projectsDir>/<slug>__<id>/project.json
     with assets/ and backups/ sub-folders.
   - Renders PDFs with Chromium's printToPDF (exact @page sizes) and opens
     a print preview window for printing. */

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const DEV_URL = process.env.PREPRO_DEV_URL || '';
const SELFTEST_DIR = process.argv.includes('--selftest') ? process.env.PREPRO_SELFTEST_DIR || path.join(os.tmpdir(), 'prepro-selftest') : '';
/* PREPRO_DATA_DIR runs a fully separate instance (own settings + projects), used by the MCP test */
const ISOLATED_DIR = SELFTEST_DIR || process.env.PREPRO_DATA_DIR || '';
if (ISOLATED_DIR) {
  // isolate test data from the user's real projects
  app.setPath('userData', path.join(ISOLATED_DIR, 'userdata'));
}
if (SELFTEST_DIR) {
  // keep painting and timers at full speed when the test window is covered by other windows
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}
const APP_NAME = 'PrePro Studio';
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.preprostudio.app');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  },
]);

/* ------------------------------------------------------------------ config */

const userDir = app.getPath('userData');
const configPath = path.join(userDir, 'config.json');
let config = { projectsDir: '', windowBounds: null, maximized: false, mcp: { enabled: true, port: 39217 }, hiddenDemos: {} };

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch {
    /* first run */
  }
  if (!config.projectsDir) config.projectsDir = path.join(app.getPath('documents'), 'PrePro Studio Projects');
  if (ISOLATED_DIR) config.projectsDir = path.join(ISOLATED_DIR, 'projects');
  config.mcp = { enabled: true, port: MCP_DEFAULT_PORT, ...(config.mcp || {}) };
  config.hiddenDemos = { ...(config.hiddenDemos || {}) };
  fs.mkdirSync(config.projectsDir, { recursive: true });
}

function saveConfig() {
  try {
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('config save failed', e);
  }
}

const printDir = path.join(os.tmpdir(), 'prepro-studio-print');
const MCP_DEFAULT_PORT = 39217;
fs.mkdirSync(printDir, { recursive: true });

/* ------------------------------------------------------------------ helpers */

function slugify(s) {
  return (
    String(s || 'project')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'project'
  );
}

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 && name.length < 200 && !/[\\/]|\.\./.test(name);
}

const dirCache = new Map(); // projectId -> absolute folder

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function findProjectDir(id) {
  if (!isSafeName(id)) throw new Error('Invalid project id');
  const cached = dirCache.get(id);
  if (cached && fs.existsSync(path.join(cached, 'project.json'))) return cached;
  const entries = await fsp.readdir(config.projectsDir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith(`__${id}`)) {
      const dir = path.join(config.projectsDir, e.name);
      if (fs.existsSync(path.join(dir, 'project.json'))) {
        dirCache.set(id, dir);
        return dir;
      }
    }
  }
  // fallback: scan project.json ids (folders copied in by hand)
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(config.projectsDir, e.name);
    try {
      const data = await readJson(path.join(dir, 'project.json'));
      if (data && data.id === id) {
        dirCache.set(id, dir);
        return dir;
      }
    } catch {
      /* not a project */
    }
  }
  throw new Error('Project not found: ' + id);
}

/* Marketing Spaces: <projectsDir>/Marketing Spaces/<slug>__<id>/space.json (+ assets/, backups/) */
function spacesDir() {
  return path.join(config.projectsDir, 'Marketing Spaces');
}

const spaceDirCache = new Map();

async function findSpaceDir(id) {
  if (!isSafeName(id)) throw new Error('Invalid space id');
  const cached = spaceDirCache.get(id);
  if (cached && fs.existsSync(path.join(cached, 'space.json'))) return cached;
  const entries = await fsp.readdir(spacesDir(), { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith(`__${id}`) && fs.existsSync(path.join(spacesDir(), e.name, 'space.json'))) {
      spaceDirCache.set(id, path.join(spacesDir(), e.name));
      return path.join(spacesDir(), e.name);
    }
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(spacesDir(), e.name);
    try {
      const data = await readJson(path.join(dir, 'space.json'));
      if (data && data.id === id) {
        spaceDirCache.set(id, dir);
        return dir;
      }
    } catch {
      /* not a space */
    }
  }
  throw new Error('Space not found: ' + id);
}

/** Folder of a project or a space (assets are handled the same way for both). */
async function findDocDir(id) {
  try {
    return await findProjectDir(id);
  } catch (e) {
    try {
      return await findSpaceDir(id);
    } catch {
      throw e;
    }
  }
}

function spaceSummaryFrom(data, dir) {
  const m = data.meta || {};
  const content = Array.isArray(data.content) ? data.content : [];
  const today = new Date().toISOString().slice(0, 10);
  let nextPost;
  for (const c of content)
    for (const p of c.posts || [])
      if (p.date && p.date >= today && p.status !== 'published' && p.status !== 'skipped' && (!nextPost || p.date < nextPost)) nextPost = p.date;
  return {
    id: data.id,
    title: m.title || 'Untitled Space',
    type: m.type || 'other',
    color: m.color || '#e64980',
    emoji: m.emoji,
    cover: m.cover,
    description: m.description,
    updatedAt: m.updatedAt || new Date(0).toISOString(),
    createdAt: m.createdAt || new Date(0).toISOString(),
    path: dir,
    demo: !!m.demo,
    contentCount: content.length,
    publishedCount: content.filter((c) => c.stage === 'published').length,
    nextPost,
  };
}

async function writeFileAtomic(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

function summaryFrom(data, dir) {
  const m = data.meta || {};
  return {
    id: data.id,
    title: m.title || 'Untitled Project',
    subtitle: m.subtitle,
    projectType: m.projectType || 'other',
    status: m.status || 'development',
    color: m.color || '#7c5cff',
    poster: m.poster,
    updatedAt: m.updatedAt || new Date(0).toISOString(),
    createdAt: m.createdAt || new Date(0).toISOString(),
    path: dir,
    demo: !!m.demo,
  };
}

async function backupIfDue(dir, fileName = 'project.json') {
  const current = path.join(dir, fileName);
  if (!fs.existsSync(current)) return;
  const bdir = path.join(dir, 'backups');
  await fsp.mkdir(bdir, { recursive: true });
  const prefix = fileName.replace(/\.json$/, '') + '-';
  const files = (await fsp.readdir(bdir)).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  const last = files[files.length - 1];
  if (last) {
    const st = await fsp.stat(path.join(bdir, last));
    if (Date.now() - st.mtimeMs < 10 * 60 * 1000) return; // at most one backup per 10 minutes
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await fsp.copyFile(current, path.join(bdir, `${prefix}${stamp}.json`));
  const all = (await fsp.readdir(bdir)).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 40))) await fsp.unlink(path.join(bdir, f)).catch(() => {});
}

function uniqueAssetName(ext) {
  const clean = String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  return `a_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}.${clean}`;
}

async function listFilesRecursive(root, rel = '') {
  const out = [];
  const entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (r === 'backups' || r === 'exports') continue;
      out.push(...(await listFilesRecursive(root, r)));
    } else if (!e.name.endsWith('.tmp')) out.push(r);
  }
  return out;
}

/* ------------------------------------------------------------------ protocol */

function distDir() {
  return path.join(app.getAppPath(), 'dist');
}

function registerProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
      if (url.host === 'asset') {
        const [projectId, name] = parts;
        if (!isSafeName(projectId) || !isSafeName(name)) return new Response('Bad request', { status: 400 });
        const dir = await findDocDir(projectId);
        return net.fetch(pathToFileURL(path.join(dir, 'assets', name)).toString());
      }
      if (url.host === 'print') {
        const name = parts[0];
        if (!isSafeName(name)) return new Response('Bad request', { status: 400 });
        return net.fetch(pathToFileURL(path.join(printDir, name)).toString());
      }
      // app://bundle/__print/<file> — generated print pages & PDFs (same origin as the UI)
      if (parts[0] === '__print') {
        const name = parts[1];
        if (!isSafeName(name)) return new Response('Bad request', { status: 400 });
        return net.fetch(pathToFileURL(path.join(printDir, name)).toString());
      }
      // app://bundle/...
      const root = distDir();
      let rel = parts.join('/') || 'index.html';
      let file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      return net.fetch(pathToFileURL(file).toString());
    } catch (e) {
      return new Response(String(e && e.message ? e.message : e), { status: 404 });
    }
  });
}

/* ------------------------------------------------------------------ windows */

let mainWindow = null;
let allowClose = false;

function createWindow() {
  const b = config.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: b.width || 1480,
    height: b.height || 940,
    x: b.x,
    y: b.y,
    minWidth: 1024,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16161a' : '#f6f6f8',
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: !SELFTEST_DIR,
      plugins: true, // Chromium PDF viewer for print previews
      additionalArguments: SELFTEST_DIR ? ['--prepro-selftest'] : [],
    },
  });
  if (config.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadURL('app://bundle/index.html');

  // native context menu for text fields: spelling suggestions + clipboard
  mainWindow.webContents.on('context-menu', (_e, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const wc = mainWindow.webContents;
    const items = [];
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 6)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      if (!params.dictionarySuggestions.length) items.push({ label: 'No spelling suggestions', enabled: false });
      items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    else items.push({ role: 'copy' });
    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return;
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  const rememberBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    config.maximized = mainWindow.isMaximized();
    if (!config.maximized && !mainWindow.isMinimized()) config.windowBounds = mainWindow.getBounds();
  };
  mainWindow.on('resize', rememberBounds);
  mainWindow.on('move', rememberBounds);

  mainWindow.on('close', (e) => {
    rememberBounds();
    saveConfig();
    // localStorage (last project / module, theme, board views) is written lazily: force it to disk
    try {
      mainWindow.webContents.session.flushStorageData();
    } catch {
      /* ignore */
    }
    if (allowClose) return;
    e.preventDefault();
    // ask the renderer to flush unsaved changes, then close
    mainWindow.webContents.send('app:request-close');
    setTimeout(() => {
      allowClose = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    }, 4000);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    mcp.rendererGone();
  });
  // a reload drops the renderer's tool handlers until it reports ready again
  mainWindow.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
    const main = e && typeof e.isMainFrame === 'boolean' ? e.isMainFrame : isMainFrame;
    const same = e && typeof e.isSameDocument === 'boolean' ? e.isSameDocument : isInPlace;
    if (main && !same) mcp.rendererGone();
  });
  mainWindow.webContents.on('render-process-gone', () => mcp.rendererGone());
}

/** Demo project / space cards on the home screen: removed by the user, still in the Help menu. */
function setHiddenDemos(patch) {
  for (const k of ['project', 'space']) if (patch && typeof patch[k] === 'boolean') config.hiddenDemos[k] = patch[k];
  saveConfig();
  buildMenu();
  sendCommand('demos-changed');
  return { ...config.hiddenDemos };
}

function sendCommand(cmd) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:command', cmd);
}

function buildMenu() {
  const cmd = (label, id, accelerator) => ({ label, accelerator, registerAccelerator: false, click: () => sendCommand(id) });
  const template = [
    {
      label: '&File',
      submenu: [
        cmd('New Project…', 'new-project', 'CmdOrCtrl+Shift+N'),
        cmd('New Marketing Space…', 'new-space', 'CmdOrCtrl+Shift+M'),
        cmd('Library', 'home', 'CmdOrCtrl+Shift+H'),
        { type: 'separator' },
        cmd('Import Script (Fountain / FDX / TXT)…', 'import-script'),
        cmd('Export Project Archive…', 'export-archive'),
        cmd('Import Project Archive…', 'import-archive'),
        { type: 'separator' },
        cmd('Print & Export Center', 'print-center', 'CmdOrCtrl+P'),
        cmd('Open Project Folder', 'project-folder'),
        { type: 'separator' },
        cmd('Save Now', 'save', 'CmdOrCtrl+S'),
        cmd('Project Settings', 'settings', 'CmdOrCtrl+,'),
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        cmd('Undo', 'undo', 'CmdOrCtrl+Z'),
        cmd('Redo', 'redo', 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        cmd('Find…', 'find', 'CmdOrCtrl+F'),
      ],
    },
    {
      label: '&View',
      submenu: [
        cmd('Toggle Sidebar', 'toggle-sidebar', 'CmdOrCtrl+\\'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload', label: 'Reload Interface' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        cmd('Keyboard Shortcuts', 'shortcuts', 'F1'),
        cmd('User Guide', 'guide'),
        cmd('Connect an AI Agent (MCP)…', 'agent-connect'),
        { type: 'separator' },
        cmd('Open Demo Project', 'open-demo'),
        cmd('Open Demo Marketing Space', 'open-demo-space'),
        cmd('Reset Demo Project…', 'reset-demo'),
        cmd('Reset Demo Marketing Space…', 'reset-demo-space'),
        {
          label: 'Show Demos on the Home Screen',
          type: 'checkbox',
          checked: !config.hiddenDemos.project && !config.hiddenDemos.space,
          click: (item) => setHiddenDemos({ project: !item.checked, space: !item.checked }),
        },
        { type: 'separator' },
        {
          label: 'Open Projects Folder',
          click: () => shell.openPath(config.projectsDir),
        },
        {
          label: `About ${APP_NAME}`,
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: `${APP_NAME} ${app.getVersion()}`,
              detail: 'Local pre-production & post-production planning workspace.\nAll projects are stored on this computer.\n\nProjects folder:\n' + config.projectsDir,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ PDF */

async function renderPdf(html, opts = {}) {
  const id = `print-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.html`;
  const file = path.join(printDir, id);
  await fsp.writeFile(file, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 1400,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });
  try {
    await win.loadURL(`app://bundle/__print/${id}`);
    // wait for fonts and images (the print HTML defines window.__printReady)
    await Promise.race([
      win.webContents.executeJavaScript('window.__printReady ? window.__printReady() : true', true),
      new Promise((r) => setTimeout(r, 20000)),
    ]);
    if (opts.title) await win.webContents.executeJavaScript(`document.title = ${JSON.stringify(opts.title)}; true`, true).catch(() => {});
    const landscape = !!opts.landscape;
    const pageSize = opts.paper === 'a4' ? 'A4' : 'Letter';
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      landscape,
      pageSize,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      generateDocumentOutline: true,
    });
    return pdf;
  } finally {
    win.destroy();
    fsp.unlink(file).catch(() => {});
  }
}

function cleanupPrintDir() {
  try {
    for (const f of fs.readdirSync(printDir)) {
      const p = path.join(printDir, f);
      if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) fs.unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ MCP (AI agents) */

const { createMcpServer, SUPPORTED_VERSIONS } = require('./mcp.cjs');

const mcpActivity = []; // recent tool calls, newest last
const mcp = createMcpServer({
  appVersion: app.getVersion(),
  getWebContents: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
  log: (...a) => console.log('[mcp]', ...a),
  onActivity: (ev) => {
    if (ev.type === 'end' || ev.type === 'connect') {
      mcpActivity.push(ev);
      if (mcpActivity.length > 60) mcpActivity.splice(0, mcpActivity.length - 60);
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mcp:activity', ev);
  },
});

function mcpBridgePath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'mcp-bridge.cjs') : path.join(__dirname, 'mcp-bridge.cjs');
}

function mcpPort() {
  if (process.env.PREPRO_MCP_PORT) return Number(process.env.PREPRO_MCP_PORT);
  if (SELFTEST_DIR) return 0; // random free port: never clash with the real app
  return Number(config.mcp.port) || MCP_DEFAULT_PORT;
}

function writeMcpStatusFile() {
  const st = mcp.status();
  try {
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDir, 'mcp-server.json'),
      JSON.stringify(
        { port: st.port, url: `http://127.0.0.1:${st.port}/mcp`, running: st.running, pid: process.pid, version: app.getVersion(), exe: process.execPath, bridge: mcpBridgePath(), updatedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error('could not write mcp-server.json', e);
  }
}

async function applyMcpConfig() {
  if (config.mcp.enabled === false && !process.env.PREPRO_MCP_PORT) mcp.stop();
  else await mcp.start(mcpPort());
  writeMcpStatusFile();
  return mcp.status();
}

/** Claude Desktop config files (classic install and Microsoft Store / MSIX install). */
function claudeDesktopConfigPaths() {
  const out = [];
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    out.push(path.join(roaming, 'Claude', 'claude_desktop_config.json'));
    const pkgRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Packages');
    try {
      for (const d of fs.readdirSync(pkgRoot)) {
        if (/^(AnthropicPBC\.)?Claude_/i.test(d)) {
          const dir = path.join(pkgRoot, d, 'LocalCache', 'Roaming', 'Claude');
          if (fs.existsSync(dir)) out.push(path.join(dir, 'claude_desktop_config.json'));
        }
      }
    } catch {
      /* no Store packages */
    }
  } else if (process.platform === 'darwin') {
    out.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  } else {
    out.push(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude', 'claude_desktop_config.json'));
  }
  return out;
}

function mcpStdioEntry() {
  return { command: process.execPath, args: [mcpBridgePath()], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

function claudeDesktopState() {
  return claudeDesktopConfigPaths().map((file) => {
    let installed = false;
    const exists = fs.existsSync(file);
    try {
      if (exists) installed = !!JSON.parse(fs.readFileSync(file, 'utf8'))?.mcpServers?.['prepro-studio'];
    } catch {
      /* unreadable */
    }
    return { file, exists, installed, dirExists: fs.existsSync(path.dirname(file)) };
  });
}

/* Files an AI agent may read (images, scripts, and documents / media it can attach as campaign resources).
   An allowlist on purpose: no config, key or code files. */
const READ_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|fountain|spmd|fdx|txt|md|markdown|pdf|docx?|pptx?|xlsx?|csv|tsv|rtf|odt|ods|odp|key|pages|numbers|epub|html?|mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg|flac|zip)$/i;
const READ_EXT_HINT = 'images, scripts (fountain, fdx, txt, md), documents (pdf, doc/docx, ppt/pptx, xls/xlsx, csv, rtf, odt, key, pages, numbers, epub, html), audio / video and zip';

function registerMcpIpc() {
  ipcMain.on('mcp:ready', (_e, describe) => {
    mcp.setDescribe(describe);
    try {
      fs.writeFileSync(
        path.join(userDir, 'mcp-describe.json'),
        JSON.stringify({ version: app.getVersion(), versions: SUPPORTED_VERSIONS, instructions: describe.instructions, tools: describe.tools, prompts: describe.prompts }, null, 1),
      );
    } catch (e) {
      console.error('could not cache MCP tools', e);
    }
  });
  ipcMain.on('mcp:result', (_e, msg) => mcp.handleResult(msg));

  ipcMain.handle('mcp:status', () => {
    const st = mcp.status();
    return {
      ...st,
      enabled: config.mcp.enabled !== false,
      configuredPort: Number(config.mcp.port) || MCP_DEFAULT_PORT,
      url: `http://127.0.0.1:${st.port || mcpPort()}/mcp`,
      exe: process.execPath,
      bridge: mcpBridgePath(),
      stdio: mcpStdioEntry(),
      packaged: app.isPackaged,
      claudeDesktop: claudeDesktopState(),
      activity: mcpActivity.slice(-40),
    };
  });

  ipcMain.handle('mcp:setConfig', async (_e, patch) => {
    if (patch && typeof patch.enabled === 'boolean') config.mcp.enabled = patch.enabled;
    if (patch && Number.isInteger(patch.port) && patch.port > 1023 && patch.port < 65536) config.mcp.port = patch.port;
    saveConfig();
    return applyMcpConfig();
  });

  // add (or update) the "prepro-studio" entry in Claude Desktop's config (the user clicks a button for this)
  ipcMain.handle('mcp:installClaudeDesktop', async () => {
    const all = claudeDesktopState();
    const targets = all.filter((t) => t.exists || t.dirExists);
    if (!targets.length) targets.push(all[0]);
    const written = [];
    for (const t of targets) {
      let data = {};
      if (t.exists) {
        const raw = await fsp.readFile(t.file, 'utf8');
        try {
          data = raw.trim() ? JSON.parse(raw) : {};
        } catch {
          throw new Error(`${t.file} is not valid JSON. Fix or remove it first.`);
        }
        await fsp.writeFile(t.file + '.prepro-backup', raw);
      }
      data.mcpServers = { ...(data.mcpServers || {}), 'prepro-studio': mcpStdioEntry() };
      await fsp.mkdir(path.dirname(t.file), { recursive: true });
      await writeFileAtomic(t.file, JSON.stringify(data, null, 2));
      written.push(t.file);
    }
    return { written };
  });

  ipcMain.handle('mcp:readFile', async (_e, p) => {
    if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('Use an absolute file path');
    if (!READ_EXT.test(p)) throw new Error(`This file type can't be read. Allowed: ${READ_EXT_HINT}`);
    const st = await fsp.stat(p);
    if (st.size > 40 * 1024 * 1024) throw new Error('File is larger than 40 MB');
    return { name: path.basename(p), data: new Uint8Array(await fsp.readFile(p)) };
  });

  ipcMain.handle('mcp:fetchUrl', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs can be downloaded');
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 40 * 1024 * 1024) throw new Error('File is larger than 40 MB');
    return { data: buf, contentType: res.headers.get('content-type') || '' };
  });

  ipcMain.handle('mcp:writeFile', async (_e, p, data) => {
    if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('Use an absolute path');
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, typeof data === 'string' ? data : Buffer.from(data));
    return p;
  });

  // what the user sees right now (for the agent's screenshot tool)
  ipcMain.handle('mcp:capture', async (_e, maxWidth = 1400) => {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The window is not open');
    let img = await mainWindow.webContents.capturePage();
    if (img.getSize().width > maxWidth) img = img.resize({ width: maxWidth, quality: 'good' });
    return { data: img.toJPEG(82).toString('base64'), mimeType: 'image/jpeg', ...img.getSize() };
  });

  // picture of one page of a print document (for the agent's preview tool)
  ipcMain.handle('mcp:snapshot', async (_e, html, opts = {}) => {
    const wIn = opts.landscape ? (opts.paper === 'a4' ? 11.69 : 11) : opts.paper === 'a4' ? 8.27 : 8.5;
    const hIn = opts.landscape ? (opts.paper === 'a4' ? 8.27 : 8.5) : opts.paper === 'a4' ? 11.69 : 11;
    const W = Math.round(wIn * 96);
    const H = Math.round(hIn * 96);
    const id = `snap-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.html`;
    const file = path.join(printDir, id);
    await fsp.writeFile(file, html, 'utf8');
    const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true } });
    try {
      await win.loadURL(`app://bundle/__print/${id}`);
      await Promise.race([win.webContents.executeJavaScript('window.__printReady ? window.__printReady() : true', true), new Promise((r) => setTimeout(r, 15000))]);
      const page = Math.max(1, Number(opts.page) || 1);
      const info = await win.webContents.executeJavaScript(
        `(function(){var st=document.createElement('style');
          st.textContent='html{background:#fff!important}html,body{overflow:hidden!important}body.pp-screen-flow{margin:0!important;box-shadow:none!important;box-sizing:border-box!important}body.pp-screen-fixed{padding:0!important}body.pp-screen-fixed .pp-page{margin:0!important;box-shadow:none!important}';
          document.head.appendChild(st);var pages=document.querySelectorAll('.pp-page');
          if(pages.length){var p=pages[Math.min(pages.length,${page})-1];window.scrollTo(0,p.getBoundingClientRect().top+window.scrollY);return {pages:pages.length,fixed:true};}
          var h=document.body.scrollHeight;window.scrollTo(0,(${page}-1)*${H});return {pages:Math.max(1,Math.ceil(h/${H})),fixed:false};})()`,
        true,
      );
      await new Promise((r) => setTimeout(r, 200));
      let img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
      if (img.getSize().width > 1100) img = img.resize({ width: 1100, quality: 'best' });
      return { data: img.toPNG().toString('base64'), mimeType: 'image/png', pages: info.pages, approximate: !info.fixed };
    } finally {
      win.destroy();
      fsp.unlink(file).catch(() => {});
    }
  });
}

/* ------------------------------------------------------------------ IPC */

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    projectsDir: config.projectsDir,
    electron: process.versions.electron,
    hiddenDemos: { ...config.hiddenDemos },
  }));
  ipcMain.handle('demos:setHidden', (_e, patch) => setHiddenDemos(patch));

  ipcMain.on('app:close-ready', (e) => {
    try {
      e.sender.session.flushStorageData();
    } catch {
      /* ignore */
    }
    allowClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  ipcMain.handle('projects:list', async () => {
    const out = [];
    const entries = await fsp.readdir(config.projectsDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(config.projectsDir, e.name);
      const file = path.join(dir, 'project.json');
      if (!fs.existsSync(file)) continue;
      try {
        const data = await readJson(file);
        if (!data || !data.id) continue;
        dirCache.set(data.id, dir);
        out.push(summaryFrom(data, dir));
      } catch (err) {
        console.error('Could not read', file, err);
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  });

  ipcMain.handle('project:load', async (_e, id) => {
    const dir = await findProjectDir(id);
    return readJson(path.join(dir, 'project.json'));
  });

  ipcMain.handle('project:create', async (_e, data) => {
    if (!data || !isSafeName(data.id)) throw new Error('Invalid project');
    const dir = path.join(config.projectsDir, `${slugify(data.meta && data.meta.title)}__${data.id}`);
    await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFileAtomic(path.join(dir, 'project.json'), JSON.stringify(data, null, 1));
    dirCache.set(data.id, dir);
    return summaryFrom(data, dir);
  });

  ipcMain.handle('project:save', async (_e, data) => {
    if (!data || !isSafeName(data.id)) throw new Error('Invalid project');
    let dir;
    try {
      dir = await findProjectDir(data.id);
    } catch {
      dir = path.join(config.projectsDir, `${slugify(data.meta && data.meta.title)}__${data.id}`);
      await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
      dirCache.set(data.id, dir);
    }
    await backupIfDue(dir).catch((err) => console.error('backup failed', err));
    await writeFileAtomic(path.join(dir, 'project.json'), JSON.stringify(data, null, 1));
    return true;
  });

  ipcMain.handle('project:delete', async (_e, id) => {
    const dir = await findProjectDir(id);
    await shell.trashItem(dir); // to the Recycle Bin, never a hard delete
    dirCache.delete(id);
    return true;
  });

  ipcMain.handle('project:duplicate', async (_e, id, newId, newTitle) => {
    if (!isSafeName(newId)) throw new Error('Invalid id');
    const src = await findProjectDir(id);
    const data = await readJson(path.join(src, 'project.json'));
    data.id = newId;
    data.meta = { ...(data.meta || {}), title: newTitle, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const dir = path.join(config.projectsDir, `${slugify(newTitle)}__${newId}`);
    await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
    if (fs.existsSync(path.join(src, 'assets'))) await fsp.cp(path.join(src, 'assets'), path.join(dir, 'assets'), { recursive: true });
    await writeFileAtomic(path.join(dir, 'project.json'), JSON.stringify(data, null, 1));
    dirCache.set(newId, dir);
    return summaryFrom(data, dir);
  });

  ipcMain.handle('project:readAll', async (_e, id) => {
    const dir = await findDocDir(id);
    const files = await listFilesRecursive(dir);
    const out = [];
    for (const rel of files) out.push({ path: rel, data: new Uint8Array(await fsp.readFile(path.join(dir, rel))) });
    return out;
  });

  ipcMain.handle('project:writeAll', async (_e, id, title, files) => {
    if (!isSafeName(id)) throw new Error('Invalid id');
    const dir = path.join(config.projectsDir, `${slugify(title)}__${id}`);
    await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
    for (const f of files) {
      const rel = String(f.path).replace(/\\/g, '/');
      if (rel.includes('..') || path.isAbsolute(rel)) continue;
      const target = path.join(dir, rel);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, Buffer.from(f.data));
    }
    dirCache.set(id, dir);
    const data = await readJson(path.join(dir, 'project.json'));
    return summaryFrom(data, dir);
  });

  /* ---------------- Marketing Spaces */
  ipcMain.handle('spaces:list', async () => {
    const out = [];
    const entries = await fsp.readdir(spacesDir(), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(spacesDir(), e.name);
      const file = path.join(dir, 'space.json');
      if (!fs.existsSync(file)) continue;
      try {
        const data = await readJson(file);
        if (!data || !data.id) continue;
        spaceDirCache.set(data.id, dir);
        out.push(spaceSummaryFrom(data, dir));
      } catch (err) {
        console.error('Could not read', file, err);
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  });

  ipcMain.handle('space:load', async (_e, id) => readJson(path.join(await findSpaceDir(id), 'space.json')));

  ipcMain.handle('space:create', async (_e, data) => {
    if (!data || !isSafeName(data.id)) throw new Error('Invalid space');
    const dir = path.join(spacesDir(), `${slugify(data.meta && data.meta.title)}__${data.id}`);
    await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFileAtomic(path.join(dir, 'space.json'), JSON.stringify(data, null, 1));
    spaceDirCache.set(data.id, dir);
    return spaceSummaryFrom(data, dir);
  });

  ipcMain.handle('space:save', async (_e, data) => {
    if (!data || !isSafeName(data.id)) throw new Error('Invalid space');
    let dir;
    try {
      dir = await findSpaceDir(data.id);
    } catch {
      dir = path.join(spacesDir(), `${slugify(data.meta && data.meta.title)}__${data.id}`);
      await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
      spaceDirCache.set(data.id, dir);
    }
    await backupIfDue(dir, 'space.json').catch((err) => console.error('backup failed', err));
    await writeFileAtomic(path.join(dir, 'space.json'), JSON.stringify(data, null, 1));
    return true;
  });

  ipcMain.handle('space:delete', async (_e, id) => {
    const dir = await findSpaceDir(id);
    await shell.trashItem(dir); // Recycle Bin, never a hard delete
    spaceDirCache.delete(id);
    return true;
  });

  ipcMain.handle('space:duplicate', async (_e, id, newId, newTitle) => {
    if (!isSafeName(newId)) throw new Error('Invalid id');
    const src = await findSpaceDir(id);
    const data = await readJson(path.join(src, 'space.json'));
    data.id = newId;
    data.meta = { ...(data.meta || {}), title: newTitle, demo: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const dir = path.join(spacesDir(), `${slugify(newTitle)}__${newId}`);
    await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
    if (fs.existsSync(path.join(src, 'assets'))) await fsp.cp(path.join(src, 'assets'), path.join(dir, 'assets'), { recursive: true });
    await writeFileAtomic(path.join(dir, 'space.json'), JSON.stringify(data, null, 1));
    spaceDirCache.set(newId, dir);
    return spaceSummaryFrom(data, dir);
  });

  ipcMain.handle('project:openFolder', async (_e, id) => {
    const dir = await findDocDir(id);
    await shell.openPath(dir);
    return dir;
  });

  ipcMain.handle('project:dir', async (_e, id) => findDocDir(id));

  ipcMain.handle('asset:import', async (_e, projectId, bytes, ext) => {
    const dir = await findDocDir(projectId);
    await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
    const name = uniqueAssetName(ext);
    await fsp.writeFile(path.join(dir, 'assets', name), Buffer.from(bytes));
    return name;
  });

  ipcMain.handle('asset:read', async (_e, projectId, name) => {
    if (!isSafeName(name)) return null;
    const dir = await findDocDir(projectId);
    try {
      return new Uint8Array(await fsp.readFile(path.join(dir, 'assets', name)));
    } catch {
      return null;
    }
  });

  ipcMain.handle('backups:list', async (_e, id) => {
    const dir = await findDocDir(id);
    const bdir = path.join(dir, 'backups');
    const files = (await fsp.readdir(bdir).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse();
    const out = [];
    for (const f of files) {
      const st = await fsp.stat(path.join(bdir, f));
      out.push({ name: f, date: st.mtime.toISOString(), size: st.size });
    }
    return out;
  });

  ipcMain.handle('backups:restore', async (_e, id, name) => {
    if (!isSafeName(name)) throw new Error('Invalid backup');
    const dir = await findDocDir(id);
    return readJson(path.join(dir, 'backups', name));
  });

  ipcMain.handle('pdf:render', async (_e, html, opts) => renderPdf(html, opts));

  ipcMain.handle('pdf:save', async (_e, html, opts) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: path.join(opts.defaultDir || app.getPath('documents'), opts.fileName || 'document.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return null;
    const pdf = await renderPdf(html, opts);
    await fsp.writeFile(res.filePath, pdf);
    return res.filePath;
  });

  ipcMain.handle('pdf:saveBytes', async (_e, bytes, opts) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: path.join(opts.defaultDir || app.getPath('documents'), opts.fileName || 'document.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, Buffer.from(bytes));
    return res.filePath;
  });

  // render to a temporary PDF served at app://bundle/__print/<name> (shown in the in-app preview)
  ipcMain.handle('pdf:temp', async (_e, payload, opts) => {
    const pdf = typeof payload === 'string' ? await renderPdf(payload, opts || {}) : Buffer.from(payload);
    const name = `preview-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.pdf`;
    await fsp.writeFile(path.join(printDir, name), pdf);
    return { url: `app://bundle/__print/${name}`, bytes: new Uint8Array(pdf) };
  });

  ipcMain.handle('pdf:preview', async (_e, payload, opts) => {
    // payload: html string or PDF bytes
    const pdf = typeof payload === 'string' ? await renderPdf(payload, opts) : Buffer.from(payload);
    const name = `preview-${Date.now().toString(36)}.pdf`;
    const file = path.join(printDir, name);
    await fsp.writeFile(file, pdf);
    const win = new BrowserWindow({
      width: 1000,
      height: 1200,
      title: `${opts.title || 'Print Preview'} — ${APP_NAME}`,
      parent: undefined,
      autoHideMenuBar: true,
      webPreferences: { plugins: true, sandbox: true, contextIsolation: true },
    });
    win.loadURL(pathToFileURL(file).toString());
    return file;
  });

  ipcMain.handle('file:save', async (_e, opts) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: opts.title || 'Save',
      defaultPath: path.join(opts.defaultDir || app.getPath('documents'), opts.fileName || 'export'),
      filters: opts.filters && opts.filters.length ? opts.filters : undefined,
    });
    if (res.canceled || !res.filePath) return null;
    const data = typeof opts.data === 'string' ? opts.data : Buffer.from(opts.data);
    await fsp.writeFile(res.filePath, data);
    return res.filePath;
  });

  ipcMain.handle('file:open', async (_e, opts) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: opts.title || 'Open',
      properties: opts.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: opts.filters && opts.filters.length ? opts.filters : undefined,
    });
    if (res.canceled) return [];
    const out = [];
    for (const p of res.filePaths) out.push({ name: path.basename(p), path: p, data: new Uint8Array(await fsp.readFile(p)) });
    return out;
  });

  ipcMain.handle('shell:reveal', (_e, p) => {
    if (typeof p === 'string' && p) shell.showItemInFolder(p);
  });
  ipcMain.handle('shell:open', (_e, p) => {
    if (typeof p === 'string' && p) return shell.openPath(p);
  });
  ipcMain.handle('shell:external', (_e, url) => {
    if (typeof url === 'string' && /^(https?:|mailto:|tel:)/i.test(url)) return shell.openExternal(url);
  });

  ipcMain.handle('settings:chooseProjectsDir', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder for your projects',
      defaultPath: config.projectsDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    config.projectsDir = res.filePaths[0];
    dirCache.clear();
    spaceDirCache.clear();
    saveConfig();
    return config.projectsDir;
  });

  // automated self-test (npm run selftest): the renderer renders documents and sends PDFs here
  ipcMain.handle('selftest:write', async (_e, name, bytes) => {
    if (!SELFTEST_DIR || !isSafeName(name)) return false;
    await fsp.mkdir(SELFTEST_DIR, { recursive: true });
    await fsp.writeFile(path.join(SELFTEST_DIR, name), typeof bytes === 'string' ? bytes : Buffer.from(bytes));
    return true;
  });
  ipcMain.handle('selftest:capture', async (_e, name) => {
    if (!SELFTEST_DIR || !isSafeName(name) || !mainWindow) return false;
    const img = await mainWindow.webContents.capturePage();
    await fsp.mkdir(SELFTEST_DIR, { recursive: true });
    await fsp.writeFile(path.join(SELFTEST_DIR, name), img.toPNG());
    return true;
  });
  ipcMain.on('selftest:done', (_e, summary) => {
    if (!SELFTEST_DIR) return;
    try {
      fs.writeFileSync(path.join(SELFTEST_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    } catch {
      /* ignore */
    }
    allowClose = true;
    app.quit();
  });

  ipcMain.handle('spell:add', (e, word) => {
    if (typeof word === 'string' && word.length < 64) e.sender.session.addWordToSpellCheckerDictionary(word);
  });

  ipcMain.handle('app:setTitle', (_e, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title ? `${title} — ${APP_NAME}` : APP_NAME);
  });
}

/* ------------------------------------------------------------------ lifecycle */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadConfig();
    registerProtocol();
    registerIpc();
    registerMcpIpc();
    buildMenu();
    cleanupPrintDir();
    createWindow();
    applyMcpConfig();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    mcp.stop();
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.session.flushStorageData();
      } catch {
        /* ignore */
      }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
