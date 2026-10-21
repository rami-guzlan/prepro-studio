/* Exposes a narrow, typed bridge to the renderer (window.prepro). */
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('prepro', {
  isElectron: true,
  selftest: process.argv.includes('--prepro-selftest'),
  selftestWrite: (name, bytes) => invoke('selftest:write', name, bytes),
  selftestDone: (summary) => ipcRenderer.send('selftest:done', summary),
  selftestCapture: (name) => invoke('selftest:capture', name),
  spell: {
    isMisspelled: (word) => {
      try {
        return webFrame.isWordMisspelled(word);
      } catch {
        return false;
      }
    },
    suggestions: (word) => {
      try {
        return webFrame.getWordSuggestions(word);
      } catch {
        return [];
      }
    },
    add: (word) => invoke('spell:add', word),
  },
  info: () => invoke('app:info'),
  setDemosHidden: (patch) => invoke('demos:setHidden', patch),
  financePin: {
    status: () => invoke('finance:pinStatus'),
    verify: (pin) => invoke('finance:pinVerify', pin),
    set: (current, next) => invoke('finance:pinSet', current, next),
  },
  listProjects: () => invoke('projects:list'),
  loadProject: (id) => invoke('project:load', id),
  createProject: (data) => invoke('project:create', data),
  saveProject: (data) => invoke('project:save', data),
  deleteProject: (id) => invoke('project:delete', id),
  duplicateProject: (id, newId, newTitle) => invoke('project:duplicate', id, newId, newTitle),
  readAllProjectFiles: (id) => invoke('project:readAll', id),
  writeProjectFiles: (id, title, files) => invoke('project:writeAll', id, title, files),
  openProjectFolder: (id) => invoke('project:openFolder', id),
  listSpaces: () => invoke('spaces:list'),
  loadSpace: (id) => invoke('space:load', id),
  createSpace: (data) => invoke('space:create', data),
  saveSpace: (data) => invoke('space:save', data),
  deleteSpace: (id) => invoke('space:delete', id),
  duplicateSpace: (id, newId, newTitle) => invoke('space:duplicate', id, newId, newTitle),
  projectDir: (id) => invoke('project:dir', id),
  importAsset: (projectId, bytes, ext) => invoke('asset:import', projectId, bytes, ext),
  readAsset: (projectId, name) => invoke('asset:read', projectId, name),
  listBackups: (id) => invoke('backups:list', id),
  restoreBackup: (id, name) => invoke('backups:restore', id, name),
  renderPdf: (html, opts) => invoke('pdf:render', html, opts),
  savePdf: (html, opts) => invoke('pdf:save', html, opts),
  savePdfBytes: (bytes, opts) => invoke('pdf:saveBytes', bytes, opts),
  previewPdf: (payload, opts) => invoke('pdf:preview', payload, opts),
  tempPdf: (payload, opts) => invoke('pdf:temp', payload, opts),
  saveFile: (opts) => invoke('file:save', opts),
  openFiles: (opts) => invoke('file:open', opts),
  reveal: (p) => invoke('shell:reveal', p),
  openPath: (p) => invoke('shell:open', p),
  openExternal: (url) => invoke('shell:external', url),
  chooseProjectsDir: () => invoke('settings:chooseProjectsDir'),
  setTitle: (title) => invoke('app:setTitle', title),
  onMenuCommand: (cb) => {
    const handler = (_e, cmd) => cb(cmd);
    ipcRenderer.on('menu:command', handler);
    return () => ipcRenderer.removeListener('menu:command', handler);
  },
  onRequestClose: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:request-close', handler);
    return () => ipcRenderer.removeListener('app:request-close', handler);
  },
  closeReady: () => ipcRenderer.send('app:close-ready'),
  /* local MCP server for AI agents (electron/mcp.cjs); tools run in the renderer (src/agent) */
  mcp: {
    onCall: (cb) => {
      const handler = (_e, req) => cb(req);
      ipcRenderer.on('mcp:call', handler);
      return () => ipcRenderer.removeListener('mcp:call', handler);
    },
    respond: (msg) => ipcRenderer.send('mcp:result', msg),
    ready: (describe) => ipcRenderer.send('mcp:ready', describe),
    onActivity: (cb) => {
      const handler = (_e, ev) => cb(ev);
      ipcRenderer.on('mcp:activity', handler);
      return () => ipcRenderer.removeListener('mcp:activity', handler);
    },
    status: () => invoke('mcp:status'),
    setConfig: (patch) => invoke('mcp:setConfig', patch),
    installClaudeDesktop: () => invoke('mcp:installClaudeDesktop'),
    readFile: (p) => invoke('mcp:readFile', p),
    fetchUrl: (url) => invoke('mcp:fetchUrl', url),
    writeFile: (p, data) => invoke('mcp:writeFile', p, data),
    capture: (maxWidth) => invoke('mcp:capture', maxWidth),
    snapshot: (html, opts) => invoke('mcp:snapshot', html, opts),
  },
});
