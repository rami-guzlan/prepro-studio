/* Live connection to every open app tab (WebSocket at /api/live):
   - presence: who has which Production / Space open
   - changes:  "doc X is now at rev N" so other tabs pull and merge it
   - access:   "your access changed" so a tab reloads
   - MCP relay: an AI agent's tool calls run in the person's open tab, the
     same way the desktop app runs them in its window. */
import { WebSocketServer } from 'ws';

export function createLive({ auth, log = console }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  const conns = new Set(); // { ws, user, clientId, docId, agent, lastActive }
  const resultHandlers = new Map(); // uid -> (msg) => void
  const readyWaiters = new Map(); // uid -> Set<() => void>
  let describe = null;
  const describeListeners = new Set();

  function send(c, msg) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }

  function presence(docId) {
    if (!docId) return;
    const here = [...conns].filter((c) => c.docId === docId && !c.headless);
    const people = [];
    const seen = new Set();
    for (const c of here) {
      if (seen.has(c.user.uid)) continue;
      seen.add(c.user.uid);
      people.push({ uid: c.user.uid, name: c.user.name, email: c.user.email });
    }
    for (const c of here) send(c, { t: 'presence', id: docId, people: people.filter((p) => p.uid !== c.user.uid) });
  }

  async function handleUpgrade(req, socket, head) {
    const user = await auth.fromRequest(req).catch(() => null);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const url = new URL(req.url, 'http://x');
      // headless: an agent tab the server opened (server/headless.mjs); it stays out of presence
      const c = { ws, user, clientId: url.searchParams.get('client') || '', docId: null, agent: false, headless: url.searchParams.get('agent') === '1', lastActive: Date.now() };
      conns.add(c);
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        onMessage(c, msg).catch((e) => log.error('live message failed', e));
      });
      ws.on('close', () => {
        conns.delete(c);
        presence(c.docId);
      });
      // drop connections that stopped answering (their tab is gone without a goodbye)
      let alive = true;
      ws.on('pong', () => (alive = true));
      ws.on('message', () => (alive = true));
      const ping = setInterval(() => {
        if (ws.readyState !== 1) return;
        if (!alive) return ws.terminate();
        alive = false;
        ws.ping();
      }, 30000);
      ws.on('close', () => clearInterval(ping));
    });
  }

  async function onMessage(c, msg) {
    switch (msg.t) {
      case 'open': {
        const prev = c.docId;
        c.docId = typeof msg.id === 'string' ? msg.id : null;
        presence(prev);
        presence(c.docId);
        break;
      }
      case 'active':
        c.lastActive = Date.now();
        break;
      case 'ping':
        send(c, { t: 'pong' });
        break;
      case 'mcp:ready':
        c.agent = true;
        c.lastActive = Date.now();
        for (const fn of readyWaiters.get(c.user.uid) ?? []) fn();
        readyWaiters.delete(c.user.uid);
        if (msg.describe && Array.isArray(msg.describe.tools)) {
          const changed = JSON.stringify(msg.describe) !== JSON.stringify(describe);
          describe = msg.describe;
          if (changed) for (const fn of describeListeners) fn(describe);
        }
        break;
      case 'mcp:result':
        resultHandlers.get(c.user.uid)?.(msg);
        break;
    }
  }

  /** Tell every other tab with this document open that it changed. */
  function changed(docId, rev, by, exceptClientId) {
    for (const c of conns) if (c.docId === docId && c.clientId !== exceptClientId) send(c, { t: 'changed', id: docId, rev, by: by?.name });
  }

  /** Library lists changed (created / deleted). */
  function library() {
    for (const c of conns) send(c, { t: 'library' });
  }

  /** Someone's access changed: their tabs reload (and are signed out if turned off). */
  function accessChanged(uid) {
    for (const c of conns) if (c.user.uid === uid) send(c, { t: 'access' });
  }

  /** The tab an agent should work in for this person: their most recently used real tab, else the agent tab. */
  function agentTab(uid) {
    let best = null;
    const rank = (c) => (c.headless ? 0 : 1);
    for (const c of conns) {
      if (c.user.uid !== uid || !c.agent || c.ws.readyState !== 1) continue;
      if (!best || rank(c) > rank(best) || (rank(c) === rank(best) && c.lastActive > best.lastActive)) best = c;
    }
    return best;
  }

  /** Resolves true once one of this person's tabs is ready for agent calls. */
  function waitAgent(uid, ms) {
    if (agentTab(uid)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const set = readyWaiters.get(uid) ?? new Set();
      readyWaiters.set(uid, set);
      const done = () => {
        clearTimeout(t);
        resolve(true);
      };
      const t = setTimeout(() => {
        set.delete(done);
        resolve(false);
      }, ms);
      set.add(done);
    });
  }

  /** Adapter with the Electron webContents shape used by electron/mcp.cjs. */
  function webContentsFor(uid) {
    const c = agentTab(uid);
    if (!c) return null;
    return { send: (channel, payload) => send(c, { t: channel, ...payload }) };
  }

  function activity(uid, ev) {
    for (const c of conns) if (c.user.uid === uid && c.agent) send(c, { t: 'mcp:activity', ev });
  }

  return {
    handleUpgrade,
    changed,
    library,
    accessChanged,
    webContentsFor,
    waitAgent,
    activity,
    onResult: (uid, fn) => resultHandlers.set(uid, fn),
    getDescribe: () => describe,
    setDescribe: (d) => (describe = d),
    onDescribe: (fn) => describeListeners.add(fn),
  };
}
