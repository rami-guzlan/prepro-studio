/* Hosted-version README screenshots (Team, Connect, live presence, home) from a local
   server with two invented people, who are deleted again afterwards.

     node server/index.mjs     # STORAGE=disk, OWNER_EMAIL=alex@example.com, Identity Platform env (docs/CLOUD.md)
     CHROME_PATH=<chrome or edge> OUT_DIR=docs/screenshots node scripts/screenshots-hosted.mjs */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { createStore } from '../server/storage.mjs';
import { createAccess } from '../server/auth.mjs';
import { identity } from '../server/gcp.mjs';

const BASE = 'http://localhost:8080';
const OUT = process.env.OUT_DIR;
const auth = createAccess(createStore());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pw = () => `Shot-${Math.random().toString(36).slice(2)}-${Date.now()}`;

async function accept(link) {
  const r = await fetch(`${BASE}/api/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ token: new URL(link).searchParams.get('token'), password: pw() }) });
  return r.headers.get('set-cookie').split(';')[0];
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--hide-scrollbars'], defaultViewport: { width: 1440, height: 900 } });
try {
  // owner and a teammate (Productions + Marketing Spaces only)
  const owner = await accept((await auth.invite(BASE, { email: 'alex@example.com', name: 'Alex Morgan' })).link);
  const add = await fetch(`${BASE}/api/team`, { method: 'POST', headers: { Cookie: owner, Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jordan@example.com', name: 'Jordan Lee', tabs: { productions: { items: 'all' }, marketing: { items: 'all' }, business: null } }) });
  const member = await accept((await add.json()).link);

  const shot = async (page, name) => {
    await wait(900);
    await page.screenshot({ path: path.join(OUT, `${name}.webp`), type: 'webp', quality: 88 });
    console.log(name);
  };

  // sign-in page (signed out)
  const anon = await browser.newPage();
  await anon.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await shot(anon, 'hosted-sign-in');

  // the owner's app
  const page = await browser.newPage();
  await page.setCookie({ name: owner.split('=')[0], value: owner.split('=').slice(1).join('='), url: BASE });
  await page.goto(`${BASE}/team`, { waitUntil: 'networkidle0' });
  await shot(page, 'hosted-team');
  await page.goto(`${BASE}/connect`, { waitUntil: 'networkidle0' });
  await shot(page, 'hosted-connect');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  await wait(1500);

  // open the demo Marketing Space in the owner's tab through the MCP endpoint (tools run in the open tab)
  const pat = await (await fetch(`${BASE}/api/tokens`, { method: 'POST', headers: { Cookie: owner, Origin: BASE, 'Content-Type': 'application/json' }, body: '{"name":"screenshots"}' })).json();
  const call = async (name, args = {}) => (await (await fetch(`${BASE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${pat.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  const opened = JSON.parse((await call('open_demo_space')).content[0].text);
  await wait(2000);
  await call('show_in_app', { module: 'calendar' });
  await wait(1500);

  // the teammate joins the same space: the owner sees "Jordan Lee is here too"
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/live?client=jordan-tab`, { headers: { Cookie: member, Origin: BASE } });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'open', id: opened.opened ?? opened.id }));
  await wait(1500);
  await shot(page, 'hosted-live-presence');
  ws.close();

  // the library as the owner sees it
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  await call('show_in_app', { module: 'calendar' }).catch(() => {});
  await page.evaluate(() => document.querySelector('[aria-label="Back to the library"], button[title*="library" i]')?.click());
  await shot(page, 'hosted-home');
} finally {
  await browser.close();
  for (const e of ['alex@example.com', 'jordan@example.com']) {
    const u = await identity.lookupEmail(e).catch(() => null);
    if (u) await identity.remove(u.uid);
  }
  console.log('example accounts removed');
}
