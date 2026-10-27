/* End-to-end test of the hosted version against a running server
   (STORAGE=disk is fine) and the real Identity Platform.

     BASE=http://localhost:8080 OWNER_EMAIL=<test owner> MEMBER_EMAIL=<test member> node scripts/cloud-test.mjs

   Creates the two accounts through invites, checks sign-in, scopes, live
   updates, save conflicts, the MCP relay (personal token and OAuth with PKCE),
   then removes both accounts again. Uses the same environment as the server
   for the owner link (GOOGLE_CLOUD_PROJECT, IDENTITY_API_KEY, STORAGE, DATA_DIR). */
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { createStore } from '../server/storage.mjs';
import { createAccess } from '../server/auth.mjs';
import { identity } from '../server/gcp.mjs';

const BASE = (process.env.BASE || 'http://localhost:8080').replace(/\/$/, '');
const OWNER = process.env.OWNER_EMAIL;
const MEMBER = process.env.MEMBER_EMAIL;
const PASS_OWNER = `Own-${crypto.randomBytes(9).toString('base64url')}`;
const PASS_MEMBER = `Mem-${crypto.randomBytes(9).toString('base64url')}`;

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}

class Client {
  constructor() {
    this.cookie = '';
  }
  async req(path, { method = 'GET', body, headers = {}, raw = false, redirect = 'manual' } = {}) {
    const h = { Origin: BASE, ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    let b = body;
    if (body !== undefined && !raw && typeof body !== 'string') {
      b = JSON.stringify(body);
      h['Content-Type'] ??= 'application/json';
    }
    const r = await fetch(BASE + path, { method, body: b, headers: h, redirect });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    return r;
  }
  async json(path, opts) {
    const r = await this.req(path, opts);
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* not json */
    }
    return { status: r.status, body: j, headers: r.headers };
  }
}

const uid = (p) => `${p}_${crypto.randomBytes(5).toString('hex')}`;
const now = () => new Date().toISOString();
const project = (id, title) => ({ id, meta: { title, createdAt: now(), updatedAt: now() }, script: { doc: { type: 'doc', content: [] } }, scenes: [] });
const space = (id, title, kind) => ({ id, schemaVersion: 1, kind: 'space', meta: { title, kind, createdAt: now(), updatedAt: now() }, content: [], channels: [], campaigns: [], assets: [] });

function wsOpen(client, clientId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/live?client=${clientId}`, { headers: { Cookie: client.cookie, Origin: BASE } });
    ws.msgs = [];
    ws.on('message', (d) => ws.msgs.push(JSON.parse(String(d))));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
const waitFor = async (fn, ms = 4000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
};

async function main() {
  if (!OWNER || !MEMBER) throw new Error('Set OWNER_EMAIL and MEMBER_EMAIL (test accounts)');
  const auth = createAccess(createStore());

  /* ---- owner: first sign-in link, set password */
  const owner = new Client();
  const { link } = await auth.invite(BASE, { email: OWNER, name: 'Test Owner' });
  const token = new URL(link).searchParams.get('token');
  check('invite page renders', (await owner.req(`/invite?token=${token}`)).status === 200);
  check('short password refused', (await owner.json('/api/invite', { method: 'POST', body: { token, password: 'short' } })).status === 400);
  const acc = await owner.json('/api/invite', { method: 'POST', body: { token, password: PASS_OWNER } });
  check('owner sets password and is signed in', acc.status === 200 && !!owner.cookie, JSON.stringify(acc.body));
  check('invite link works only once', (await new Client().json('/api/invite', { method: 'POST', body: { token, password: PASS_OWNER } })).status === 400);

  const anon = new Client();
  check('signed-out app redirects to sign-in', (await anon.req('/')).headers.get('location')?.startsWith('/login'));
  check('signed-out API is refused', (await anon.json('/api/projects')).status === 401);
  check('wrong password refused', (await anon.json('/api/login', { method: 'POST', body: { email: OWNER, password: 'nope-nope-nope' } })).status === 401);
  const owner2 = new Client();
  check('owner signs in with password', (await owner2.json('/api/login', { method: 'POST', body: { email: OWNER, password: PASS_OWNER } })).status === 200);
  const me = (await owner.json('/api/me')).body;
  check('owner has all 5 tabs', me.owner && ['productions', 'marketing', 'business', 'finance', 'training'].every((t) => me.tabs[t]), JSON.stringify(me));
  const page = await (await owner.req('/')).text();
  check('app page carries the account', page.includes('__PREPRO_CLOUD__') && page.includes(OWNER));
  check('cross-site POST refused', (await owner.json('/api/docs', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } })).status === 403);

  /* ---- owner creates one of everything */
  const P = uid('prj');
  const M1 = uid('spc');
  const M2 = uid('spc');
  const B = uid('spc');
  const F = uid('spc');
  const T = uid('spc');
  for (const [type, doc] of [['project', project(P, 'Test Film')], ['space', space(M1, 'Shared Marketing', 'marketing')], ['space', space(M2, 'Private Marketing', 'marketing')], ['space', space(B, 'Test Business', 'business')], ['space', space(F, 'Finances', 'finance')], ['space', space(T, 'Training', 'training')]]) {
    const r = await owner.json('/api/docs', { method: 'POST', body: { type, doc } });
    check(`owner creates ${doc.meta.title}`, r.status === 200, JSON.stringify(r.body));
  }

  /* ---- owner invites a member: Productions, one Marketing Space, Business */
  const inv = await owner.json('/api/team', { method: 'POST', body: { email: MEMBER, name: 'Test Member', tabs: { productions: { items: 'all' }, marketing: { items: [M1] }, business: { items: 'all' } } } });
  check('owner invites a member', inv.status === 200 && inv.body.link, JSON.stringify(inv.body));
  const member = new Client();
  check('member sets password', (await member.json('/api/invite', { method: 'POST', body: { token: new URL(inv.body.link).searchParams.get('token'), password: PASS_MEMBER } })).status === 200);
  const mm = (await member.json('/api/me')).body;
  check('member has exactly 3 tabs', !mm.owner && mm.tabs.productions && mm.tabs.marketing && mm.tabs.business && !mm.tabs.finance && !mm.tabs.training, JSON.stringify(mm.tabs));
  check('member is refused the Team page', (await member.req('/team')).status === 403);

  const spaces = (await member.json('/api/spaces')).body.map((s) => s.id);
  check('member sees the shared Marketing Space and the Business', spaces.includes(M1) && spaces.includes(B), JSON.stringify(spaces));
  check('member does not see the other Marketing Space', !spaces.includes(M2));
  check('member does not see Finances or Training in lists', !spaces.includes(F) && !spaces.includes(T));
  check('member sees the Production', (await member.json('/api/projects')).body.some((p) => p.id === P));
  check('member cannot open Finances', (await member.json(`/api/docs/${F}`)).status === 404);
  check('member cannot open Training', (await member.json(`/api/docs/${T}`)).status === 404);
  check('member cannot save over Finances', (await member.json(`/api/docs/${F}`, { method: 'PUT', body: space(F, 'x', 'finance') })).status === 404);
  check('member cannot open the private Marketing Space', (await member.json(`/api/docs/${M2}`)).status === 404);
  check('member cannot create a Training space', (await member.json('/api/docs', { method: 'POST', body: { type: 'space', doc: space(uid('spc'), 'Mine', 'training') } })).status === 403);
  check('member cannot read Finance assets', (await member.req(`/api/docs/${F}/assets/a.png`)).status === 404);
  check('member cannot use the Finance PIN', (await member.json('/api/finance-pin')).status === 403);
  const sm = await member.json(`/api/docs/${M1}`);
  check('member opens the shared Marketing Space', sm.status === 200);
  check('a space cannot be turned into Finances by a save', (await member.json(`/api/docs/${M1}`, { method: 'PUT', body: { ...sm.body, meta: { ...sm.body.meta, kind: 'finance' } }, headers: { 'X-Base-Rev': sm.headers.get('x-rev') } })).status === 400);
  const own = uid('spc');
  check('member creates their own Marketing Space', (await member.json('/api/docs', { method: 'POST', body: { type: 'space', doc: space(own, 'Member Space', 'marketing') } })).status === 200);
  check('member keeps access to what they created', (await member.json(`/api/docs/${own}`)).status === 200);

  /* ---- assets */
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const up = await member.json(`/api/docs/${M1}/assets?ext=png`, { method: 'POST', body: png, raw: true, headers: { 'Content-Type': 'application/octet-stream' } });
  check('member uploads an image', up.status === 200 && up.body.name);
  const got = await owner.req(`/api/docs/${M1}/assets/${up.body.name}`);
  check('owner downloads it', got.status === 200 && got.headers.get('content-type') === 'image/png');

  /* ---- live updates and conflicts */
  const wsOwner = await wsOpen(owner, 'owner-tab');
  const wsMember = await wsOpen(member, 'member-tab');
  wsOwner.send(JSON.stringify({ t: 'open', id: M1 }));
  wsMember.send(JSON.stringify({ t: 'open', id: M1 }));
  const pres = await waitFor(() => wsMember.msgs.find((m) => m.t === 'presence' && m.people.some((p) => p.email === OWNER)));
  check('presence: member sees the owner in the same space', !!pres);
  const o = await owner.json(`/api/docs/${M1}`);
  const rev0 = Number(o.headers.get('x-rev'));
  const edited = { ...o.body, channels: [{ id: 'ch1', name: 'LinkedIn' }] };
  const s1 = await owner.json(`/api/docs/${M1}`, { method: 'PUT', body: edited, headers: { 'X-Base-Rev': String(rev0), 'X-Client-Id': 'owner-tab' } });
  check('owner saves with the current rev', s1.status === 200 && s1.body.rev === rev0 + 1);
  const ch = await waitFor(() => wsMember.msgs.find((m) => m.t === 'changed' && m.id === M1));
  check('member is told live that the space changed', ch && ch.rev === rev0 + 1 && ch.by === 'Test Owner', JSON.stringify(ch));
  check('the saver is not told about their own save', !wsOwner.msgs.some((m) => m.t === 'changed'));
  const stale = await member.json(`/api/docs/${M1}`, { method: 'PUT', body: { ...o.body, campaigns: [{ id: 'c1', name: 'Launch' }] }, headers: { 'X-Base-Rev': String(rev0) } });
  check('a save from an old rev is refused (409) for merging', stale.status === 409 && stale.body.rev === rev0 + 1);
  const latest = await member.json(`/api/docs/${M1}`);
  check('member reads the owner\'s change', latest.body.channels?.[0]?.name === 'LinkedIn');

  /* ---- MCP: personal token, relayed to the member's open tab */
  const noAuth = await anon.json('/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } });
  check('MCP without a token is 401 with OAuth metadata', noAuth.status === 401 && /resource_metadata=/.test(noAuth.headers.get('www-authenticate') || ''));
  const pat = await member.json('/api/tokens', { method: 'POST', body: { name: 'cloud-test' } });
  check('member creates a personal token', pat.status === 200 && pat.body.token?.startsWith('ppt_'));
  const mcp = (body, tok = pat.body.token) => anon.json('/mcp', { method: 'POST', body, headers: { Authorization: `Bearer ${tok}` } });
  // the member's tab announces its tools (as the app does) and answers calls
  wsMember.send(JSON.stringify({ t: 'mcp:ready', describe: { instructions: 'test', prompts: [], tools: [{ name: 'get_app_state', description: 'x', inputSchema: { type: 'object' } }, { name: 'finance_report', description: 'x', inputSchema: { type: 'object' }, _meta: { 'prepro/area': 'finance' } }] } }));
  wsMember.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'mcp:call') wsMember.send(JSON.stringify({ t: 'mcp:result', reqId: m.reqId, result: { content: [{ type: 'text', text: `ran ${m.name} in the member tab` }] } }));
  });
  await waitFor(() => false, 300);
  const init = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'cloud-test' } } });
  check('MCP initialize with a personal token', init.status === 200 && init.body.result?.serverInfo?.name === 'prepro-studio', JSON.stringify(init.body));
  const list = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = list.body.result?.tools?.map((t) => t.name) ?? [];
  check('member\'s agent does not get Finance tools', names.includes('get_app_state') && !names.includes('finance_report'), JSON.stringify(names));
  const call = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_app_state', arguments: {} } });
  check('tool call is relayed to the member\'s open tab', call.body.result?.content?.[0]?.text === 'ran get_app_state in the member tab', JSON.stringify(call.body));
  const ownerPat = await owner.json('/api/tokens', { method: 'POST', body: { name: 'owner-test' } });
  const ownerList = await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, ownerPat.body.token);
  check('owner\'s agent gets the Finance tools', ownerList.body.result?.tools?.some((t) => t.name === 'finance_report'));
  const ownerCall = await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_app_state', arguments: {} } }, ownerPat.body.token);
  const ownerText = ownerCall.body.result?.content?.[0]?.text ?? '';
  check('owner\'s agent never runs in the member\'s tab', !ownerText.includes('member tab'), ownerText.slice(0, 200));
  if (process.env.CHROME_PATH) check('with no tab open, the owner\'s agent runs in an agent tab', !ownerCall.body.result?.isError && ownerText.includes('"app"'), ownerText.slice(0, 200));
  else check('without CHROME_PATH, the owner\'s agent reports no open tab', ownerCall.body.result?.isError && /not open/.test(ownerText), ownerText.slice(0, 200));

  /* ---- OAuth (Claude custom connector flow) */
  const meta = (await anon.json('/.well-known/oauth-protected-resource/mcp')).body;
  check('protected resource metadata', meta.resource === `${BASE}/mcp` && meta.authorization_servers?.[0] === BASE);
  const as = (await anon.json('/.well-known/oauth-authorization-server')).body;
  check('authorization server metadata', as.registration_endpoint && as.code_challenge_methods_supported.includes('S256'));
  const reg = await anon.json('/oauth/register', { method: 'POST', body: { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' } });
  check('dynamic client registration', reg.status === 201 && reg.body.client_id);
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.body.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'prepro' });
  check('authorize sends signed-out people to sign in', (await anon.req(`/oauth/authorize?${q}`)).headers.get('location')?.startsWith('/login?next='));
  const consent = await (await member.req(`/oauth/authorize?${q}`)).text();
  check('consent page names the client and the person', consent.includes('Allow Claude?') && consent.includes(MEMBER));
  const form = new URLSearchParams([...consent.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"')]));
  form.set('decision', 'allow');
  const allow = await member.req('/oauth/authorize', { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const back = new URL(allow.headers.get('location') || 'http://x/');
  check('approval redirects back with a code and the state', back.origin === 'https://claude.ai' && back.searchParams.get('code') && back.searchParams.get('state') === 'xyz');
  const badPkce = await anon.json('/oauth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code'), client_id: reg.body.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: 'wrong' }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  check('a wrong PKCE verifier is refused (and burns the code)', badPkce.status === 400);
  // run the flow again for a fresh code
  const allow2 = await member.req('/oauth/authorize', { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const code2 = new URL(allow2.headers.get('location')).searchParams.get('code');
  const tok = await anon.json('/oauth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: code2, client_id: reg.body.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: verifier }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  check('token exchange with PKCE', tok.status === 200 && tok.body.access_token && tok.body.refresh_token, JSON.stringify(tok.body));
  const viaOauth = await mcp({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_app_state', arguments: {} } }, tok.body.access_token);
  check('an OAuth access token works on /mcp as the member', viaOauth.body.result?.content?.[0]?.text === 'ran get_app_state in the member tab');
  const ref = await anon.json('/oauth/token', { method: 'POST', body: { grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id: reg.body.client_id } });
  check('refresh token rotates', ref.status === 200 && ref.body.access_token && ref.body.refresh_token !== tok.body.refresh_token);
  check('an old refresh token is refused', (await anon.json('/oauth/token', { method: 'POST', body: { grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id: reg.body.client_id } })).status === 400);

  /* ---- the member closes their tab: their agent keeps working, in their own agent tab */
  if (process.env.CHROME_PATH) {
    wsMember.close();
    await waitFor(() => false, 300);
    const solo = await mcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'list_spaces', arguments: {} } });
    const soloText = solo.body.result?.content?.map((c) => c.text).join(' ') ?? '';
    check('with the app closed, the member\'s agent still works', !solo.body.result?.isError && soloText.includes(M1), soloText.slice(0, 200));
    check('and it sees only the member\'s spaces', !soloText.includes(F) && !soloText.includes(T) && !soloText.includes(M2));
    const opened = await mcp({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'open_space', arguments: { spaceId: M1 } } });
    const renamed = await mcp({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'set_fields', arguments: { values: { 'meta.description': 'Written by an agent with no app open' } } } });
    check('the agent edits a space with no app open', !opened.body.result?.isError && !renamed.body.result?.isError, JSON.stringify(renamed.body).slice(0, 200));
    const saved = await owner.json(`/api/docs/${M1}`);
    check('and the edit is saved on the server right away', saved.body.meta?.description === 'Written by an agent with no app open', saved.body.meta?.description);
    const wsOwner2 = await wsOpen(owner, 'owner-tab-2');
    wsOwner2.send(JSON.stringify({ t: 'open', id: M1 }));
    await waitFor(() => false, 500);
    check('agent tabs do not show up as people in presence', !wsOwner2.msgs.some((m) => m.t === 'presence' && m.people.length));
    wsOwner2.close();
  }

  /* ---- review links: chosen Brand Kit sections, no sign-in, feedback back to the space */
  {
    const up = async (bytes, ext) => (await owner.json(`/api/docs/${M1}/assets?ext=${ext}`, { method: 'POST', body: Buffer.from(bytes), raw: true, headers: { 'Content-Type': 'application/octet-stream' } })).body.name;
    const img = await up([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4], 'png');
    const vid = await up(Array.from({ length: 2000 }, (_, i) => i % 256), 'mp4');
    const pdf = await up([0x25, 0x50, 0x44, 0x46], 'pdf');
    const cur = await owner.json(`/api/docs/${M1}`);
    const assets = [
      { id: 'as_img', kind: 'image', name: 'Key art', image: img, notes: 'Option A' },
      { id: 'as_vid', kind: 'video', name: 'Teaser', file: vid, fileName: 'teaser.mp4', fileSize: 2000, value: 'D:\Footage\teaser.mp4' },
      { id: 'as_yt', kind: 'video', name: 'Trailer', url: 'https://youtu.be/abc123' },
      { id: 'as_pdf', kind: 'resource', name: 'Internal plan', file: pdf, fileName: 'plan.pdf' },
    ];
    const put = await owner.json(`/api/docs/${M1}`, { method: 'PUT', body: { ...cur.body, assets }, headers: { 'X-Base-Rev': cur.headers.get('x-rev') } });
    check('space gets brand kit assets', put.status === 200, JSON.stringify(put.body));
    check('a review link needs a section', (await owner.json(`/api/docs/${M1}/reviews`, { method: 'POST', body: { sections: ['nope'] } })).status === 400);
    check('no review links for Business spaces', (await owner.json(`/api/docs/${B}/reviews`)).status === 400);
    const made = await owner.json(`/api/docs/${M1}/reviews`, { method: 'POST', body: { title: 'Launch review', message: 'Look at these', sections: ['images', 'video'], days: 30 } });
    check('owner creates a review link', made.status === 200 && made.body.token, JSON.stringify(made.body));
    const tok = made.body.token;
    const anon = new Client();
    const pg = await anon.req(`/review/${tok}`);
    check('review page opens with no sign-in', pg.status === 200 && (await pg.text()).includes(`data-token="${tok}"`));
    const view = await anon.json(`/api/review/${tok}`);
    const ids = view.body?.sections?.flatMap((x) => x.items.map((i) => i.id)) ?? [];
    check('it shows only the chosen sections', view.status === 200 && view.body.sections.length === 2 && ids.join() === 'as_img,as_vid,as_yt', JSON.stringify(ids));
    check('a video never shows its path on someone’s computer', view.body.sections[1].items[0].value === '');
    check('a shown file can be fetched', (await anon.req(`/api/review/${tok}/file/${img}`)).status === 200);
    check('a file outside the chosen sections cannot', (await anon.req(`/api/review/${tok}/file/${pdf}`)).status === 404);
    const rng = await anon.req(`/api/review/${tok}/file/${vid}`, { headers: { Range: 'bytes=0-99' } });
    check('videos stream in ranges (seeking)', rng.status === 206 && rng.headers.get('content-range') === 'bytes 0-99/2000' && (await rng.arrayBuffer()).byteLength === 100);
    check('feedback needs a name', (await anon.json(`/api/review/${tok}/feedback`, { method: 'POST', body: { decision: 'approve' } })).status === 400);
    wsOwner.send(JSON.stringify({ t: 'open', id: M1 }));
    await waitFor(() => false, 300);
    const fb = await anon.json(`/api/review/${tok}/feedback`, { method: 'POST', body: { name: 'Sam Reviewer', decision: 'changes', overall: 'Close', items: { as_img: { decision: 'approve', comment: 'Love it' }, as_pdf: { decision: 'approve' } } } });
    check('reviewer sends feedback', fb.status === 200, JSON.stringify(fb.body));
    const note = await waitFor(() => wsOwner.msgs.find((m) => m.t === 'review'), 3000);
    check('the open space hears about it live', note && note.by === 'Sam Reviewer' && note.title === 'Launch review', JSON.stringify(note));
    const list = await member.json(`/api/docs/${M1}/reviews`);
    const r0 = list.body?.[0]?.responses?.[0];
    check('people with the space see the feedback', list.status === 200 && r0?.name === 'Sam Reviewer' && r0.items.as_img?.comment === 'Love it' && !r0.items.as_pdf, JSON.stringify(r0));
    check('views are counted', list.body[0].views >= 1);
    const big = await owner.json(`/api/docs/${M1}/assets/upload`, { method: 'POST', body: { ext: 'mp4', size: 200 * 1024 * 1024 } });
    check('big uploads get a name (and a bucket address on Cloud Storage)', big.status === 200 && /^a_.*.mp4$/.test(big.body.name) && 'uploadUrl' in big.body, JSON.stringify(big.body));
    check('owner turns the link off', (await owner.json(`/api/docs/${M1}/reviews/${tok}`, { method: 'PATCH', body: { revoked: true } })).status === 200);
    check('a turned-off link stops working', (await anon.json(`/api/review/${tok}`)).status === 410 && (await anon.json(`/api/review/${tok}/feedback`, { method: 'POST', body: { name: 'x', overall: 'y' } })).status === 410);
    check('unknown links do not work', (await anon.json('/api/review/abcdefghijklmnopqrstuvwxyz')).status === 404);
    check('owner deletes the link', (await owner.json(`/api/docs/${M1}/reviews/${tok}`, { method: 'DELETE' })).status === 200 && (await owner.json(`/api/docs/${M1}/reviews`)).body.length === 0);
  }

  /* ---- turning a person off ends everything at once */
  const team = (await owner.json('/api/team')).body.people;
  const memberUid = team.find((p) => p.email === MEMBER).uid;
  check('owner turns the member off', (await owner.json(`/api/team/${memberUid}`, { method: 'PATCH', body: { disabled: true } })).status === 200);
  check('their session ends', (await member.json('/api/projects')).status === 401);
  check('their agents are signed out', (await mcp({ jsonrpc: '2.0', id: 7, method: 'tools/list' }, ref.body.access_token)).status === 401);
  check('they cannot sign in', (await new Client().json('/api/login', { method: 'POST', body: { email: MEMBER, password: PASS_MEMBER } })).status === 401);

  wsOwner.close();
  wsMember.close();

  /* ---- clean up: delete the documents and both test accounts */
  for (const id of [P, M1, M2, B, F, T, own]) await owner.json(`/api/docs/${id}`, { method: 'DELETE' });
  check('documents deleted (moved to trash)', (await owner.json('/api/spaces')).body.length === 0);
  await owner.json(`/api/team/${memberUid}`, { method: 'DELETE' });
  const ownerAcc = await identity.lookupEmail(OWNER);
  if (ownerAcc) await identity.remove(ownerAcc.uid);
  check('test accounts removed', !(await identity.lookupEmail(MEMBER)) && !(await identity.lookupEmail(OWNER)));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
