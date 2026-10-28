/* README screenshots from the demo data (no personal data): runs against the
   browser build (`npm run dev`, data in the browser) and saves WebP images to
   docs/screenshots/.

     npm run dev                       # in another terminal
     CHROME_PATH=<chrome or edge> node scripts/screenshots.mjs

   Uses the built-in demo production ("The Last Take"), its release-campaign
   Marketing Space and the sample business, finances and training. */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.DEV_URL || 'http://localhost:5173';
const OUT = path.resolve(process.env.OUT_DIR || 'docs/screenshots');
const CHROME = process.env.CHROME_PATH;
if (!CHROME) throw new Error('Set CHROME_PATH to Chrome or Edge');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--hide-scrollbars'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.warn('page error:', e.message));
await page.goto(BASE, { waitUntil: 'networkidle0' });
// no pop-up messages in the pictures
await page.addStyleTag({ content: '.toasts { display: none !important; }' });

/** Run code in the app with its own modules (Vite serves them by path, shared with the running app). */
const app = (fn, ...args) => page.evaluate(fn, ...args);

async function settle(extra = 700) {
  await page.waitForFunction(() => !document.body.innerText.includes('Loading…') && !document.body.innerText.includes('Loading...'), { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, extra));
}
async function shot(name, prep) {
  if (prep) await prep();
  await settle();
  const file = path.join(OUT, `${name}.webp`);
  await page.screenshot({ path: file, type: 'webp', quality: 88 });
  console.log(`${name}.webp  ${Math.round(fs.statSync(file).size / 1024)} KB`);
}
const nav = (moduleId, params = {}) => app(async (m, p) => (await import('/src/store/app.ts')).navigate(m, p), moduleId, params);
const navSpace = (moduleId, params = {}) => app(async (m, p) => (await import('/src/store/app.ts')).navigateSpace(m, p), moduleId, params);

// light theme, demos on the home screen
await app(async () => (await import('/src/store/app.ts')).setTheme('light'));

// sample business, finances and training (as the self-test builds them), with the newer features filled in
const ids = await app(async () => {
  const { createSpace } = await import('/src/spaces/defaults.ts');
  const { backend } = await import('/src/backend/index.ts');
  const { sampleBusiness } = await import('/src/spaces/business/sample.ts');
  const { sampleFinance } = await import('/src/spaces/finance/sample.ts');
  const { sampleTraining, seedSamplePhotos } = await import('/src/spaces/training/sample.ts');
  const { setupRamp, addWin } = await import('/src/spaces/training/ramp.ts');
  const { addDays, todayISO } = await import('/src/lib/dates.ts');
  const today = todayISO();

  const biz = sampleBusiness();
  biz.strategy.narrative =
    'We make short, cinematic films for small brands that want to look bigger than they are. This year we grow by turning every project into a package (a hero film plus social cut-downs), building two referral partnerships, and raising the day rate once the calendar is full. We say no to one-off edits with no story.';
  const b = createSpace({ title: 'Riverside Studio', kind: 'business', type: 'business', kindData: biz });
  b.calc = [
    { id: 'c1', label: 'Day rate', expr: '1800', format: 'money' },
    { id: 'c2', label: 'Shoot days per month', expr: '6' },
    { id: 'c3', label: 'Monthly revenue', expr: 'Day rate * Shoot days per month', format: 'money' },
    { id: 'c4', label: 'Monthly costs', expr: '3.2k', format: 'money' },
    { id: 'c5', label: 'Margin', expr: '(Monthly revenue - Monthly costs) / Monthly revenue * 100', format: 'percent' },
  ];
  await backend.createSpace(b);

  const f = createSpace({ title: 'Personal Finances', kind: 'finance', type: 'other', kindData: sampleFinance() });
  await backend.createSpace(f);

  const tr = sampleTraining();
  setupRamp(tr, { where: 'gym', goalDays: 3, minutesNow: 20, why: 'More energy on shoot days', reward: 'New running shoes', startDate: addDays(today, -16) });
  for (const [d, k] of [[-16, 'full'], [-14, 'mini'], [-9, 'full'], [-7, 'full'], [-2, 'full']]) addWin(tr, { date: addDays(today, d), kind: k });
  const t = createSpace({ title: 'Training', kind: 'training', type: 'other', kindData: tr });
  await backend.createSpace(t);
  await seedSamplePhotos(t.id, t.training);
  await backend.saveSpace(t);
  return { biz: b.id, fin: f.id, tr: t.id };
});

/* ---------------- the library */
await shot('home', async () => {
  await app(async () => (await import('/src/shell/projectActions.ts')).openDemo());
  await settle();
  await app(async () => (await import('/src/shell/projectActions.ts')).leaveProject());
  await app(async () => (await import('/src/shell/spaceActions.ts')).openDemoSpace());
  await settle();
  await app(async () => (await import('/src/shell/spaceActions.ts')).leaveSpace());
  await app(async () => (await import('/src/store/app.ts')).setHomeTab('spaces'));
});

/* ---------------- a production */
await app(async () => (await import('/src/shell/projectActions.ts')).openDemo());
await settle(1200);
await shot('production-overview', () => nav('overview'));
await shot('script', () => nav('script'));
await shot('storyboard', () => nav('storyboard'));
await shot('shot-list', () => nav('shots'));
await shot('lighting', () => nav('lighting'));
await shot('schedule', () => nav('schedule'));
await shot('call-sheet', () => nav('callsheets'));
await shot('budget', () => nav('budget'));
await app(async () => (await import('/src/shell/projectActions.ts')).leaveProject());

/* ---------------- a Marketing Space */
await app(async () => (await import('/src/shell/spaceActions.ts')).openDemoSpace());
await settle(1200);
await shot('marketing-overview', () => navSpace('overview'));
await shot('marketing-content', () => navSpace('content'));
await shot('marketing-calendar', () => navSpace('calendar'));
await shot('marketing-strategy', () => navSpace('strategy', { tab: 'pillars' }));
await shot('marketing-ideas', () => navSpace('ideas'));
await shot('design-system', () => navSpace('assets', { tab: 'system' }));

/* ---------------- Business Management */
const open = (id, mod) => app(async (i, m) => (await import('/src/shell/spaceActions.ts')).openSpaceById(i, m), id, mod);
await open(ids.biz, 'overview');
await settle(1200);
await shot('business-overview', () => navSpace('overview'));
await shot('business-strategy', () => navSpace('strategy'));
await shot('business-calculator', async () => {
  await navSpace('strategy');
  await settle();
  await app(() => document.getElementById('biz-strat-calc')?.scrollIntoView({ block: 'center' }));
});
await shot('business-growth', () => navSpace('growth'));
await shot('business-pipeline', () => navSpace('pipeline'));
await shot('business-invoices', () => navSpace('invoices'));

/* ---------------- Personal Finances (unlocked for the picture; the demo has no PIN) */
await app(async () => (await import('/src/spaces/finance/lock.tsx')).useFinanceLock.setState({ unlocked: true, lastActive: Date.now() }));
await open(ids.fin, 'overview');
await settle(1200);
await shot('finances-overview', () => navSpace('overview'));
await shot('finances-budgets', () => navSpace('budgets'));

/* ---------------- Training */
await open(ids.tr, 'overview');
await settle(1200);
await shot('training-today', () => navSpace('overview'));
await shot('training-ramp-up', () => navSpace('ramp'));
await shot('training-workouts', () => navSpace('workouts'));

await browser.close();
console.log(`saved to ${OUT}`);
