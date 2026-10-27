/* Agent tabs: when an AI agent calls a tool and its person has no PrePro
   Studio tab open, the server opens one itself, in a headless Chromium,
   signed in as that person. The tool then runs there exactly as it would in
   a real tab (same code, same access checks, same live sync).

   - A real tab, when there is one, always wins (src/live.mjs agentTab).
   - Agent tabs close after IDLE_MS without tool calls; the browser closes
     when it has no tabs left.
   - The page loads from this server's own port (loopback), with ?agent=1 so
     it stays out of presence. Chromium comes from CHROME_PATH. */
import puppeteer from 'puppeteer-core';

const IDLE_MS = 10 * 60 * 1000;
const READY_MS = 60 * 1000;

export function createHeadless({ auth, live, port, log = console }) {
  const CHROME = process.env.CHROME_PATH || '';
  let browser = null;
  let launching = null;
  const tabs = new Map(); // uid -> { page, timer, opening }

  const available = () => !!CHROME;

  async function getBrowser() {
    if (browser?.connected) return browser;
    if (!launching) {
      launching = puppeteer
        .launch({
          executablePath: CHROME,
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--mute-audio', '--window-size=1440,900'],
          defaultViewport: { width: 1440, height: 900 },
        })
        .then((b) => {
          browser = b;
          b.on('disconnected', () => {
            browser = null;
            for (const t of tabs.values()) clearTimeout(t.timer);
            tabs.clear();
          });
          return b;
        })
        .finally(() => (launching = null));
    }
    return launching;
  }

  function touch(uid) {
    const t = tabs.get(uid);
    if (!t) return;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => void close(uid), IDLE_MS);
  }

  async function close(uid) {
    const t = tabs.get(uid);
    if (!t) return;
    tabs.delete(uid);
    clearTimeout(t.timer);
    try {
      // let the page save what it still holds before it goes
      await t.page.evaluate(() => (window).__preproFlush?.()).catch(() => {});
      await t.page.close();
    } catch {
      /* already gone */
    }
    if (!tabs.size && browser) {
      const b = browser;
      browser = null;
      await b.close().catch(() => {});
    }
  }

  async function open(user) {
    const b = await getBrowser();
    const page = await b.newPage();
    page.on('pageerror', (e) => log.warn(`[agent tab ${user.email}]`, e.message));
    const base = `http://127.0.0.1:${port}`;
    const cookie = auth.sessionCookie(user.uid, user.epoch, false).split(';')[0];
    const [name, ...rest] = cookie.split('=');
    await page.setCookie({ name, value: rest.join('='), url: base, httpOnly: true, sameSite: 'Lax' });
    const ready = live.waitAgent(user.uid, READY_MS);
    await page.goto(`${base}/?agent=1`, { waitUntil: 'domcontentloaded', timeout: READY_MS });
    if (!(await ready)) {
      await page.close().catch(() => {});
      throw new Error('The agent tab did not start in time');
    }
    return page;
  }

  /** Make sure this person has a tab an agent can work in. */
  async function ensure(user) {
    if (live.webContentsFor(user.uid)) {
      touch(user.uid);
      return true;
    }
    if (!available()) return false;
    let t = tabs.get(user.uid);
    if (t?.opening) await t.opening.catch(() => {});
    else {
      t = { page: null, timer: null, opening: null };
      tabs.set(user.uid, t);
      t.opening = open(user)
        .then((page) => (t.page = page))
        .catch((e) => {
          tabs.delete(user.uid);
          throw e;
        })
        .finally(() => (t.opening = null));
      try {
        await t.opening;
      } catch (e) {
        log.error('agent tab failed to open', e);
        return false;
      }
    }
    touch(user.uid);
    return !!live.webContentsFor(user.uid);
  }

  async function closeAll() {
    await Promise.all([...tabs.keys()].map((uid) => close(uid)));
  }

  return { ensure, close, closeAll, available };
}
