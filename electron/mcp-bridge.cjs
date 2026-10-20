/* PrePro Studio — stdio ⇄ HTTP bridge for MCP clients that launch servers as
   a command (Claude Desktop, most "command"-style configs).

   Run with the app's own executable in Node mode:
     ELECTRON_RUN_AS_NODE=1 "PrePro Studio.exe" "<resources>\mcp-bridge.cjs"

   It forwards newline-delimited JSON-RPC from stdin to the app's local MCP
   server (http://127.0.0.1:<port>/mcp) and writes the responses to stdout.
   If PrePro Studio isn't running, the connection handshake is answered from
   a cache the app writes, and the app is started on the first tool call. */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const APP_NAME = 'PrePro Studio';
const DEFAULT_PORT = 39217;
const userDir =
  process.env.PREPRO_USER_DIR ||
  (process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME)
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME));
const statusFile = path.join(userDir, 'mcp-server.json');
const describeFile = path.join(userDir, 'mcp-describe.json');

const log = (...a) => process.stderr.write(`[prepro-mcp] ${a.join(' ')}\n`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function port() {
  if (process.env.PREPRO_MCP_PORT) return Number(process.env.PREPRO_MCP_PORT);
  return readJson(statusFile)?.port || DEFAULT_PORT;
}

function endpoint() {
  return `http://127.0.0.1:${port()}/mcp`;
}

function write(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function post(msg, timeoutMs = 10 * 60 * 1000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(msg),
      signal: ac.signal,
    });
    if (res.status === 202) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(t);
  }
}

async function healthy() {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const res = await fetch(`http://127.0.0.1:${port()}/health`, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const j = await res.json();
    return !!j.ready;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ launching the app */

let launching = null;

function launchApp() {
  if (launching) return launching;
  launching = (async () => {
    if (await healthy()) return true;
    const packaged = path.basename(__dirname).toLowerCase() === 'resources';
    const exe = process.execPath;
    const args = packaged ? [] : [path.join(__dirname, '..')];
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    log(`starting ${APP_NAME}…`);
    try {
      const child = spawn(exe, args, { detached: true, stdio: 'ignore', env, windowsHide: false });
      child.unref();
    } catch (e) {
      log('could not start the app:', e.message);
      return false;
    }
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 700));
      if (await healthy()) return true;
    }
    return false;
  })().finally(() => {
    setTimeout(() => (launching = null), 1000);
  });
  return launching;
}

/* ------------------------------------------------------------ offline answers */

function offlineAnswer(msg) {
  const cache = readJson(describeFile);
  switch (msg.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: (cache?.versions || ['2025-06-18']).includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : cache?.versions?.[0] || '2025-06-18',
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: { name: 'prepro-studio', title: APP_NAME, version: cache?.version || '1.0.0' },
          instructions: cache?.instructions || `${APP_NAME} is not running; it starts automatically on the first tool call.`,
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/list':
      return cache?.tools ? { jsonrpc: '2.0', id: msg.id, result: { tools: cache.tools } } : null;
    case 'prompts/list':
      return cache?.prompts
        ? {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              prompts: cache.prompts.map(({ messages, arguments: args, ...p }) => ({ ...p, ...(args ? { arguments: args.map(({ name, description, required }) => ({ name, description, required: !!required })) } : {}) })),
            },
          }
        : null;
    case 'resources/list':
      return { jsonrpc: '2.0', id: msg.id, result: { resources: [] } };
    case 'resources/templates/list':
      return { jsonrpc: '2.0', id: msg.id, result: { resourceTemplates: [] } };
    case 'logging/setLevel':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    default:
      return null; // needs the app
  }
}

function isConnRefused(e) {
  const c = e && (e.cause?.code || e.code);
  return c === 'ECONNREFUSED' || c === 'ECONNRESET' || c === 'UND_ERR_SOCKET' || /fetch failed/i.test(String(e?.message));
}

async function handle(msg) {
  const isNotification = msg.id === undefined || msg.id === null;
  try {
    const out = await post(msg);
    if (out && !isNotification) (Array.isArray(out) ? out : [out]).forEach(write);
    return;
  } catch (e) {
    if (!isConnRefused(e)) {
      if (!isNotification) write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `PrePro Studio bridge: ${e.message}` } });
      return;
    }
  }
  if (isNotification) return;
  const offline = offlineAnswer(msg);
  if (offline) {
    write(offline);
    return;
  }
  // the app is needed: start it and retry once
  const ok = await launchApp();
  if (ok) {
    try {
      const out = await post(msg);
      if (out) (Array.isArray(out) ? out : [out]).forEach(write);
      return;
    } catch (e) {
      log('retry failed:', e.message);
    }
  }
  if (msg.method === 'tools/call') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: { isError: true, content: [{ type: 'text', text: `${APP_NAME} is not running and could not be started. Open PrePro Studio on this computer and try again.` }] },
    });
  } else {
    write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `${APP_NAME} is not running. Open it and try again.` } });
  }
}

/* ------------------------------------------------------------ stdin loop */

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
  }
});
process.stdin.on('end', () => setTimeout(() => process.exit(0), 200));
log(`bridge ready → ${endpoint()}`);
