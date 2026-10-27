/* Access for AI agents (MCP clients) to /mcp, as a specific person:

   - OAuth 2.1 for Claude's custom connectors and other MCP clients that sign
     in by themselves: dynamic client registration, authorization code with
     PKCE (S256), refresh tokens. The person signs in to PrePro Studio and
     approves the agent on a consent page.
   - Personal access tokens (Claude Code, Cursor, VS Code …), created on the
     "Connect an AI agent" page and sent as "Authorization: Bearer <token>".

   Every token acts as its person, so an agent sees exactly what they see.
   Only token hashes are stored (_system/tokens.json). */
import crypto from 'node:crypto';
import { randomToken, sha256, httpError } from './auth.mjs';
import { readJson, updateJson } from './storage.mjs';

const KEY = '_system/tokens.json';
const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 90 * 86400000;
const CODE_TTL = 5 * 60 * 1000;
const EMPTY = { clients: {}, access: {}, refresh: {}, pats: {} };

export function createOAuth(store) {
  let cache = null;
  const codes = new Map(); // code -> { clientId, redirectUri, challenge, uid, exp }

  async function load() {
    if (!cache) {
      cache = (await readJson(store, KEY, EMPTY)).value;
      for (const k of Object.keys(EMPTY)) cache[k] ??= {};
    }
    return cache;
  }
  async function update(fn) {
    cache = await updateJson(store, KEY, EMPTY, (t) => {
      for (const k of Object.keys(EMPTY)) t[k] ??= {};
      const now = Date.now();
      for (const m of [t.access, t.refresh]) for (const [h, v] of Object.entries(m)) if (v.exp < now) delete m[h];
      return fn(t) ?? t;
    });
    return cache;
  }

  function metadata(base) {
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      revocation_endpoint: `${base}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: ['prepro'],
    };
  }

  function resourceMetadata(base) {
    return { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['prepro'], bearer_methods_supported: ['header'], resource_name: 'PrePro Studio' };
  }

  const okRedirect = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)) || /^[a-z][a-z0-9+.-]*:$/.test(x.protocol) && !['http:', 'javascript:', 'data:', 'file:'].includes(x.protocol);
    } catch {
      return false;
    }
  };

  async function register(body) {
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === 'string') : [];
    if (!uris.length || !uris.every(okRedirect)) throw oauthError(400, 'invalid_redirect_uri', 'redirect_uris must be https (or http://localhost)');
    const clientId = `ppc_${randomToken(12)}`;
    const method = body.token_endpoint_auth_method || 'none';
    const secret = method === 'none' ? null : randomToken(24);
    const client = { name: String(body.client_name || 'AI agent').slice(0, 100), redirectUris: uris.slice(0, 10), method, secretHash: secret ? sha256(secret) : null, created: Date.now() };
    await update((t) => {
      t.clients[clientId] = client;
    });
    return {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(client.created / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
    };
  }

  /** Validate an authorize request; returns the client. */
  async function checkAuthorize(q) {
    const t = await load();
    const client = t.clients[q.client_id];
    if (!client) throw httpError(400, 'Unknown client. Remove the connector and add it again.');
    if (!client.redirectUris.includes(q.redirect_uri)) throw httpError(400, 'This redirect address is not registered for the client.');
    if (q.response_type !== 'code') throw httpError(400, 'Only response_type=code is supported.');
    if (!q.code_challenge || (q.code_challenge_method || 'plain') !== 'S256') throw httpError(400, 'PKCE with S256 is required.');
    return client;
  }

  function issueCode(q, uid) {
    const code = randomToken(24);
    codes.set(code, { clientId: q.client_id, redirectUri: q.redirect_uri, challenge: q.code_challenge, uid, exp: Date.now() + CODE_TTL });
    return code;
  }

  async function issueTokens(uid, clientId) {
    const access = `ppa_${randomToken(32)}`;
    const refresh = `ppr_${randomToken(32)}`;
    await update((t) => {
      t.access[sha256(access)] = { uid, clientId, exp: Date.now() + ACCESS_TTL };
      t.refresh[sha256(refresh)] = { uid, clientId, exp: Date.now() + REFRESH_TTL };
    });
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: 'prepro' };
  }

  async function checkClientSecret(client, body, authHeader) {
    if (client.method === 'none') return;
    let secret = body.client_secret;
    if (!secret && /^Basic /i.test(authHeader || '')) secret = Buffer.from(authHeader.slice(6), 'base64').toString().split(':').slice(1).join(':');
    if (!secret || sha256(secret) !== client.secretHash) throw oauthError(401, 'invalid_client', 'Client authentication failed');
  }

  async function token(body, authHeader) {
    let clientId = body.client_id;
    if (!clientId && /^Basic /i.test(authHeader || '')) clientId = decodeURIComponent(Buffer.from(authHeader.slice(6), 'base64').toString().split(':')[0]);
    const t = await load();
    const client = t.clients[clientId];
    if (!client) throw oauthError(401, 'invalid_client', 'Unknown client');
    await checkClientSecret(client, body, authHeader);
    if (body.grant_type === 'authorization_code') {
      const c = codes.get(body.code);
      codes.delete(body.code);
      if (!c || c.exp < Date.now() || c.clientId !== clientId) throw oauthError(400, 'invalid_grant', 'The code is invalid or expired');
      if (body.redirect_uri && body.redirect_uri !== c.redirectUri) throw oauthError(400, 'invalid_grant', 'redirect_uri does not match');
      const verifier = String(body.code_verifier || '');
      const challenge = Buffer.from(sha256Bytes(verifier)).toString('base64url');
      if (!verifier || challenge !== c.challenge) throw oauthError(400, 'invalid_grant', 'PKCE verification failed');
      return issueTokens(c.uid, clientId);
    }
    if (body.grant_type === 'refresh_token') {
      const h = sha256(body.refresh_token || '');
      const r = t.refresh[h];
      if (!r || r.exp < Date.now() || r.clientId !== clientId) throw oauthError(400, 'invalid_grant', 'The refresh token is invalid or expired');
      await update((x) => {
        delete x.refresh[h]; // rotate
      });
      return issueTokens(r.uid, clientId);
    }
    throw oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  async function revoke(tok) {
    const h = sha256(tok || '');
    await update((t) => {
      delete t.access[h];
      delete t.refresh[h];
    });
  }

  /** uid for a bearer token (OAuth access token or personal token), or null. */
  async function resolve(bearer) {
    if (!bearer) return null;
    const t = await load();
    const h = sha256(bearer);
    const a = t.access[h];
    if (a && a.exp > Date.now()) return { uid: a.uid, client: t.clients[a.clientId]?.name };
    const p = t.pats[h];
    if (p) return { uid: p.uid, client: p.name };
    return null;
  }

  /* ---------------- personal access tokens */

  async function createPat(uid, name) {
    const tok = `ppt_${randomToken(32)}`;
    const id = randomToken(6);
    await update((t) => {
      t.pats[sha256(tok)] = { id, uid, name: String(name || 'AI agent').slice(0, 60), created: Date.now() };
    });
    return { id, token: tok };
  }
  async function listPats(uid) {
    const t = await load();
    return Object.values(t.pats)
      .filter((p) => p.uid === uid)
      .map(({ id, name, created }) => ({ id, name, created }));
  }
  async function revokePat(uid, id) {
    await update((t) => {
      for (const [h, p] of Object.entries(t.pats)) if (p.id === id && p.uid === uid) delete t.pats[h];
    });
  }
  /** Connected OAuth apps for a person (newest refresh token per client). */
  async function listApps(uid) {
    const t = await load();
    const out = new Map();
    for (const r of Object.values(t.refresh)) if (r.uid === uid && r.exp > Date.now()) out.set(r.clientId, { clientId: r.clientId, name: t.clients[r.clientId]?.name || 'AI agent' });
    return [...out.values()];
  }
  async function revokeApp(uid, clientId) {
    await update((t) => {
      for (const m of [t.access, t.refresh]) for (const [h, v] of Object.entries(m)) if (v.uid === uid && v.clientId === clientId) delete m[h];
    });
  }
  /** Sign a person's agents out (when they are turned off or removed). */
  async function revokeAllFor(uid) {
    await update((t) => {
      for (const m of [t.access, t.refresh, t.pats]) for (const [h, v] of Object.entries(m)) if (v.uid === uid) delete m[h];
    });
  }

  return { metadata, resourceMetadata, register, checkAuthorize, issueCode, token, revoke, resolve, createPat, listPats, revokePat, listApps, revokeApp, revokeAllFor };
}

const sha256Bytes = (s) => crypto.createHash('sha256').update(s).digest();

export function oauthError(status, error, description) {
  const e = new Error(description);
  e.status = status;
  e.oauth = { error, error_description: description };
  return e;
}
