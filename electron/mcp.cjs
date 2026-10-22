/* PrePro Studio — local MCP server (Model Context Protocol).

   Lets an AI agent (Claude Desktop, Claude Code, Cursor, VS Code …) read and
   edit everything in the app. Runs inside the Electron main process while the
   app is open:

     POST http://127.0.0.1:<port>/mcp     Streamable HTTP transport (JSON responses)
     GET  http://127.0.0.1:<port>/health  status probe (used by the stdio bridge)

   Tools are defined and executed in the renderer (src/agent/), where the
   project store lives, so every change goes through the same code as the UI:
   it shows up live, is autosaved and can be undone with Ctrl+Z.

   Security: binds to the loopback interface only and rejects requests whose
   Origin / Host headers are not local (protects against browser pages and
   DNS rebinding). The server is stateless: no session ids, so an app restart
   never breaks a connected client. */

const http = require('node:http');
const crypto = require('node:crypto');

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 60 * 1024 * 1024; // images may arrive as base64
const CALL_TIMEOUT_MS = 10 * 60 * 1000;

function createMcpServer(opts) {
  const { appVersion, getWebContents, onActivity, log = () => {}, notOpenMessage = 'The PrePro Studio window is not open.' } = opts;

  let server = null;
  let port = 0;
  let status = { running: false, port: 0, error: '' };
  let describe = null; // { tools, prompts, instructions } from the renderer
  let readyWaiters = [];
  const pending = new Map(); // reqId -> { resolve, timer }
  let lastClient = null; // clientInfo from the latest initialize

  /* ------------------------------------------------------------ renderer link */

  function setDescribe(d) {
    describe = d;
    const w = readyWaiters;
    readyWaiters = [];
    for (const fn of w) fn();
  }

  function rendererGone() {
    describe = null;
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.resolve({ error: 'The PrePro Studio window was reloaded while the tool was running. Try again.' });
      pending.delete(id);
    }
  }

  function waitReady(ms) {
    if (describe) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        readyWaiters = readyWaiters.filter((f) => f !== done);
        resolve(false);
      }, ms);
      const done = () => {
        clearTimeout(t);
        resolve(true);
      };
      readyWaiters.push(done);
    });
  }

  function handleResult(msg) {
    const p = msg && pending.get(msg.reqId);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.reqId);
    p.resolve(msg);
  }

  async function callRenderer(name, args) {
    if (!(await waitReady(30000))) return { error: 'PrePro Studio is still starting up. Try again in a few seconds.' };
    const wc = getWebContents();
    if (!wc) return { error: notOpenMessage };
    const reqId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(reqId);
        resolve({ error: `Timed out waiting for "${name}" to finish.` });
      }, CALL_TIMEOUT_MS);
      pending.set(reqId, { resolve, timer });
      wc.send('mcp:call', { reqId, name, args: args ?? {} });
    });
  }

  /* ------------------------------------------------------------ JSON-RPC */

  /** prompts/list entry (without the message templates and argument defaults) */
  function publicPrompt(p) {
    const { messages, arguments: args, ...rest } = p;
    return { ...rest, ...(args ? { arguments: args.map(({ name, description, required }) => ({ name, description, required: !!required })) } : {}) };
  }

  function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }

  function instructionsText() {
    return describe?.instructions || 'PrePro Studio — local pre-production workspace. Call get_app_state first.';
  }

  async function handleMessage(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      if (msg && msg.jsonrpc === '2.0' && ('result' in msg || 'error' in msg)) return null; // response to us: ignore
      return rpcError(msg?.id, -32600, 'Invalid Request');
    }
    const isNotification = msg.id === undefined || msg.id === null;
    const { id, method, params = {} } = msg;
    if (isNotification) return null;

    switch (method) {
      case 'initialize': {
        await waitReady(15000);
        const requested = params.protocolVersion;
        lastClient = params.clientInfo || null;
        onActivity?.({ type: 'connect', client: lastClient, at: Date.now() });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
            capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
            serverInfo: { name: 'prepro-studio', title: 'PrePro Studio', version: appVersion },
            instructions: instructionsText(),
          },
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list': {
        if (!(await waitReady(30000))) return rpcError(id, -32603, 'PrePro Studio is still starting up');
        return { jsonrpc: '2.0', id, result: { tools: describe.tools } };
      }
      case 'prompts/list': {
        if (!(await waitReady(30000))) return rpcError(id, -32603, 'PrePro Studio is still starting up');
        return { jsonrpc: '2.0', id, result: { prompts: (describe.prompts || []).map(publicPrompt) } };
      }
      case 'prompts/get': {
        if (!(await waitReady(30000))) return rpcError(id, -32603, 'PrePro Studio is still starting up');
        const pr = (describe.prompts || []).find((p) => p.name === params.name);
        if (!pr) return rpcError(id, -32602, `Unknown prompt: ${params.name}`);
        const a = params.arguments || {};
        const defaults = Object.fromEntries((pr.arguments || []).map((x) => [x.name, x.default || '']));
        const fill = (s) => String(s).replace(/\{(\w+)\}/g, (_m, k) => (a[k] != null && a[k] !== '' ? String(a[k]) : defaults[k] || ''));
        return {
          jsonrpc: '2.0',
          id,
          result: { description: pr.description, messages: pr.messages.map((m) => ({ role: m.role, content: { type: 'text', text: fill(m.text) } })) },
        };
      }
      case 'resources/list':
        return { jsonrpc: '2.0', id, result: { resources: [] } };
      case 'resources/templates/list':
        return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } };
      case 'logging/setLevel':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/call': {
        const name = params.name;
        if (typeof name !== 'string') return rpcError(id, -32602, 'Missing tool name');
        if (!(await waitReady(30000))) return rpcError(id, -32603, 'PrePro Studio is still starting up');
        if (!describe.tools.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
        const started = Date.now();
        onActivity?.({ type: 'start', tool: name, at: started });
        const res = await callRenderer(name, params.arguments);
        const ok = !res.error && !res.result?.isError;
        onActivity?.({ type: 'end', tool: name, ok, ms: Date.now() - started, summary: res.summary, at: Date.now() });
        if (res.error) return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: res.error }], isError: true } };
        return { jsonrpc: '2.0', id, result: res.result };
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  }

  /* ------------------------------------------------------------ HTTP */

  function isLocalHost(hostHeader) {
    if (!hostHeader) return false;
    const h = hostHeader.replace(/:\d+$/, '').toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
  }

  function isAllowedOrigin(origin) {
    if (!origin || origin === 'null') return true; // non-browser clients
    try {
      const u = new URL(origin);
      return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.protocol === 'app:';
    } catch {
      return false;
    }
  }

  function send(res, code, body, headers = {}) {
    const data = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(data);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error('Request too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function onRequest(req, res) {
    try {
      if (!isLocalHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
        send(res, 403, { error: 'Forbidden: PrePro Studio only accepts local connections.' });
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/health' || url.pathname === '/') {
        send(res, 200, { name: 'prepro-studio', version: appVersion, ready: !!describe, mcp: `/mcp` });
        return;
      }
      if (url.pathname !== '/mcp') {
        send(res, 404, { error: 'Not found. The MCP endpoint is /mcp' });
        return;
      }
      if (req.method === 'GET') {
        // no server-initiated stream: every response comes back on its POST
        send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
        return;
      }
      if (req.method === 'DELETE') {
        send(res, 200, {});
        return;
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch (e) {
        send(res, 400, rpcError(null, -32700, `Parse error: ${e.message}`));
        return;
      }
      if (Array.isArray(payload)) {
        const out = (await Promise.all(payload.map(handleMessage))).filter(Boolean);
        if (!out.length) send(res, 202, null);
        else send(res, 200, out);
        return;
      }
      const out = await handleMessage(payload);
      if (!out) send(res, 202, null);
      else send(res, 200, out);
    } catch (e) {
      log('MCP request failed', e);
      if (!res.headersSent) send(res, 500, rpcError(null, -32603, String(e && e.message ? e.message : e)));
    }
  }

  function start(p) {
    return new Promise((resolve) => {
      stop();
      port = p;
      const s = http.createServer(onRequest);
      s.keepAliveTimeout = 65000;
      s.requestTimeout = 0; // long tool calls (PDF books) are fine
      s.on('error', (e) => {
        status = { running: false, port: p, error: e.code === 'EADDRINUSE' ? `Port ${p} is already in use by another program.` : String(e.message || e) };
        log('MCP server error', e);
        server = null;
        resolve(status);
      });
      s.listen(p, '127.0.0.1', () => {
        server = s;
        port = s.address().port;
        status = { running: true, port, error: '' };
        log(`MCP server listening on http://127.0.0.1:${port}/mcp`);
        resolve(status);
      });
    });
  }

  function stop() {
    if (server) {
      try {
        server.close();
        server.closeAllConnections?.();
      } catch {
        /* ignore */
      }
    }
    server = null;
    status = { running: false, port, error: '' };
  }

  return {
    start,
    stop,
    status: () => ({ ...status, ready: !!describe, client: lastClient }),
    setDescribe,
    handleResult,
    rendererGone,
    getDescribe: () => describe,
    /** one JSON-RPC message in, one response out (or null); used by the cloud server */
    handle: handleMessage,
  };
}

module.exports = { createMcpServer, SUPPORTED_VERSIONS };
