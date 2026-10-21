// End-to-end test of PrePro Studio's MCP server with the official MCP SDK client.
//
//   1. Starts an isolated app instance (own data folder + port) unless MCP_TEST_URL is set
//   2. Drives every tool over Streamable HTTP like Claude Code / Cursor would
//   3. Connects through the stdio bridge like Claude Desktop would
//
//   npm run mcp-test            (builds nothing — run `npm run build` first)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MCP_TEST_PORT || 39299);
const DATA = path.join(os.tmpdir(), 'prepro-mcp-test');
const URL_ = process.env.MCP_TEST_URL || `http://127.0.0.1:${PORT}/mcp`;
// MCP_TEST_EXE = path of a packaged "PrePro Studio.exe" to test the release build instead of `electron .`
const electronExe = process.env.MCP_TEST_EXE || require('electron');
const appArgs = process.env.MCP_TEST_EXE ? [] : ['.'];
const bridgeScript = process.env.MCP_TEST_EXE ? path.join(path.dirname(process.env.MCP_TEST_EXE), 'resources', 'mcp-bridge.cjs') : path.join(root, 'electron', 'mcp-bridge.cjs');

let passes = 0;
const failures = [];
function check(label, cond, detail = '') {
  if (cond) passes++;
  else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? ` — ${String(detail).slice(0, 400)}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(url, ms = 40000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url.replace(/\/mcp$/, '/health'));
      if (r.ok && (await r.json()).ready) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

let app = null;
async function startApp() {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  app = spawn(electronExe, appArgs, { cwd: root, env: { ...process.env, PREPRO_DATA_DIR: DATA, PREPRO_MCP_PORT: String(PORT), PREPRO_TEST_UNLOCK_FINANCES: '1' }, stdio: 'ignore' });
  if (!(await waitHealthy(URL_))) throw new Error('app did not start');
}

/* ------------------------------------------------------------ client helpers */

let client;
async function call(name, args = {}, { expectError = false, quiet = false } = {}) {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
  const texts = (res.content ?? []).filter((c) => c.type === 'text').map((c) => c.text);
  let data;
  try {
    data = JSON.parse(texts[texts.length - 1]);
  } catch {}
  const ok = expectError ? !!res.isError : !res.isError;
  if (!quiet) check(`${name}${expectError ? ' (expected error)' : ''}`, ok, res.isError ? texts.join(' ') : expectError ? 'no error returned' : '');
  return { res, text: texts.join('\n'), data, images: (res.content ?? []).filter((c) => c.type === 'image') };
}

const FOUNTAIN = `Title: Night Shift
Credit: Written by
Author: Test Writer

INT. DINER - NIGHT
= Maya closes up; Leo arrives.

Rain streaks the windows. MAYA (30s) wipes the counter. A walkie-talkie crackles on the shelf.

MAYA
(to herself)
One more hour.

LEO enters, soaked, holding a red umbrella.

LEO
You still open?

MAYA
Depends who's asking.

EXT. PARKING LOT - NIGHT

Leo's car won't start. Maya watches from the window.

LEO (V.O.)
Some nights just don't end.

INT. DINER - LATER

Maya pours two coffees. The walkie-talkie crackles again.

MAYA
Sit. You're dripping on my floor.
`;

const SVG = `<svg viewBox="0 0 1600 900" width="1600" height="900"><rect width="1600" height="900" fill="#fff"/><rect x="40" y="40" width="1520" height="820" fill="none" stroke="#222" stroke-width="6"/><circle cx="800" cy="380" r="120" fill="none" stroke="#222" stroke-width="8"/><path d="M600 860 Q800 520 1000 860" fill="none" stroke="#222" stroke-width="8"/><text x="80" y="120" font-size="56" font-family="Arial">MS — Maya behind the counter</text></svg>`;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/* ------------------------------------------------------------ the scenario */

async function scenario() {
  const tools = await client.listTools();
  check('tools/list returns 50+ tools', tools.tools.length >= 50, `${tools.tools.length}`);
  check('every tool has an object input schema', tools.tools.every((t) => t.inputSchema?.type === 'object'));
  const prompts = await client.listPrompts();
  check('prompts/list', prompts.prompts.length >= 3);
  const pr = await client.getPrompt({ name: 'plan_the_shoot', arguments: { days: '2' } });
  check('prompts/get fills arguments', /over 2 shoot day/.test(pr.messages[0].content.text), pr.messages[0].content.text.slice(0, 120));
  check('server instructions', /PrePro Studio/.test(client.getInstructions() ?? ''));

  let r = await call('get_app_state');
  check('no project open at start', !r.data?.openProject);
  await call('list_items', { collection: 'cast' }, { expectError: true });

  // ---------------------------------------------------------------- project
  r = await call('create_project', { title: 'MCP Test Film', projectType: 'short', meta: { logline: 'A diner, a storm, a stranger.', director: 'Test Director' } });
  const projectId = r.data?.id;
  check('project created', !!projectId);
  r = await call('get_fields', { paths: ['meta.logline', 'meta.director', 'script'] });
  check('meta set on create', r.data?.['meta.logline'] === 'A diner, a storm, a stranger.' && r.data?.script?.mode === 'screenplay', JSON.stringify(r.data));

  // ---------------------------------------------------------------- script
  r = await call('write_script', { mode: 'append', fountain: FOUNTAIN });
  check('3 scenes written', r.data?.scenesWritten === 3 && r.data?.totalScenes === 3, JSON.stringify(r.data));
  check('characters detected', ['MAYA', 'LEO'].every((n) => r.data?.characters?.includes(n)), JSON.stringify(r.data?.characters));
  r = await call('list_scenes', { detail: true });
  const scenes = r.data?.scenes ?? [];
  check('scene list', scenes.length === 3 && scenes[0].heading === 'INT. DINER - NIGHT' && scenes[0].synopsis === 'Maya closes up; Leo arrives.', JSON.stringify(scenes[0]));
  const [s1, s2, s3] = scenes.map((s) => s.id);
  r = await call('get_script', { sceneIds: ['2'] });
  check('get_script scene subset', /PARKING LOT/.test(r.text) && !/DINER - LATER/.test(r.text), r.text.slice(0, 200));
  r = await call('get_fields', { paths: ['script.titlePage'] });
  check('title page from Fountain', r.data?.['script.titlePage']?.authors === 'Test Writer', JSON.stringify(r.data));

  r = await call('write_script', { mode: 'insert_after', sceneId: s1, fountain: 'INT. DINER KITCHEN - NIGHT\n\nA pot boils over.\n' });
  const extra = r.data?.scenes?.[0]?.id;
  check('insert_after', r.data?.totalScenes === 4 && r.data?.scenes?.[0]?.number === '2', JSON.stringify(r.data));
  r = await call('write_script', { mode: 'replace_scenes', sceneIds: [extra], fountain: 'INT. DINER KITCHEN - NIGHT\n\nThe pot is fine. MAYA turns off the stove.\n' });
  check('replace_scenes keeps id', r.data?.scenes?.[0]?.id === extra, JSON.stringify(r.data));
  r = await call('edit_script_text', { find: 'red umbrella', replace: 'broken umbrella' });
  check('find & replace', r.data?.replaced === 1, JSON.stringify(r.data));
  r = await call('rename_character', { from: 'LEO', to: 'Theo', inText: true });
  check('rename character', r.data?.cues >= 2 && r.data?.mentions >= 1, JSON.stringify(r.data));
  r = await call('update_scenes', { updates: [{ sceneId: s1, estMinutes: 120, scriptDay: 'Day 1', extras: '2 truckers', eighths: '1 2/8' }, { sceneId: '3', heading: 'ext. parking lot - night' }] });
  r = await call('list_scenes', {});
  const ls = r.data?.scenes ?? [];
  check('scene meta applied', ls[0].estMinutes === 120 && ls[0].length === '1 2/8' && ls[0].extras === '2 truckers', JSON.stringify(ls[0]));
  check('heading uppercased', ls[2]?.heading === 'EXT. PARKING LOT - NIGHT', JSON.stringify(ls[2]));
  check('THEO character exists', ls[0].characters.includes('THEO'), JSON.stringify(ls[0].characters));
  r = await call('move_scenes', { sceneIds: [extra], position: 'end' });
  check('move scene to end', /DINER KITCHEN/.test(r.data?.order?.[3] ?? ''), JSON.stringify(r.data));
  r = await call('tag_script', { text: 'walkie-talkie', category: 'props' });
  check('tag props', r.data?.tagged === 2 && r.data?.scenes?.length === 2, JSON.stringify(r.data));
  const walkieId = r.data?.id;
  r = await call('tag_script', { text: 'broken umbrella', category: 'props', name: 'UMBRELLA' });
  r = await call('add_script_note', { text: 'Make this line land harder', quote: 'One more hour', sceneId: s1 });
  check('script note', !!r.data?.id);
  r = await call('delete_scenes', { sceneIds: [extra] });
  check('delete scene', r.data?.remainingScenes === 3, JSON.stringify(r.data));
  r = await call('get_report', { report: 'breakdown' });
  check('breakdown has props', JSON.stringify(r.data).includes('WALKIE-TALKIE'), JSON.stringify(r.data).slice(0, 300));

  // ---------------------------------------------------------------- generic data
  r = await call('describe_data', {});
  check('describe_data index', r.data?.collections?.length >= 25, `${r.data?.collections?.length}`);
  r = await call('describe_data', { collection: 'cast' });
  check('describe_data fields', r.data?.fields?.some((f) => f.name === 'status' && f.values?.includes('confirmed')));
  r = await call('add_items', { collection: 'cast', items: [{ name: 'Ana Lima', status: 'confirmed', roles: ['MAYA'], phone: '555-0100', measurements: { height: "5'6\"", shoe: '8' } }, { name: 'Ben Ortiz', status: 'offered', roles: ['THEO'] }] });
  const [ana, ben] = r.data?.ids ?? [];
  check('cast added', r.data?.created === 2);
  r = await call('list_items', { collection: 'characters', fields: ['name', 'castId'] });
  const maya = r.data?.items?.find((c) => c.name === 'MAYA');
  check('roles linked', maya?.castId === ana && maya?._actor === 'Ana Lima', JSON.stringify(r.data?.items));
  r = await call('update_items', { collection: 'cast', updates: [{ id: 'Ana Lima', measurements: { shoe: null, waist: '28' }, phone: null, rate: '450', rateUnit: 'day' }] });
  r = await call('get_items', { collection: 'cast', ids: [ana] });
  const anaItem = r.data?.items?.[0];
  check('object merge + null clear + number coercion', anaItem?.measurements?.waist === '28' && !anaItem?.measurements?.shoe && anaItem?.measurements?.height && !anaItem?.phone && anaItem?.rate === 450, JSON.stringify(anaItem));
  await call('update_items', { collection: 'cast', updates: [{ id: ana, status: 'maybe' }] }, { expectError: true });
  await call('add_items', { collection: 'cast', items: [{ name: 'X', favouriteColor: 'blue' }] }, { expectError: true });
  await call('add_items', { collection: 'nope', items: [{}] }, { expectError: true });
  await call('add_items', { collection: 'cast' }, { expectError: true });

  r = await call('add_items', {
    collection: 'crew',
    items: [
      { name: 'Dee Park', department: 'Camera', position: 'Director of Photography', status: 'confirmed', defaultCall: '6:30 am', phone: '555-0200' },
      { name: 'Sam Roe', department: 'Sound', position: 'Production Sound Mixer', status: 'confirmed' },
    ],
  });
  const [dee, sam] = r.data?.ids ?? [];
  r = await call('get_items', { collection: 'crew', ids: ['Dee Park'] });
  check('12h time normalised', r.data?.items?.[0]?.defaultCall === '06:30', JSON.stringify(r.data?.items?.[0]));
  r = await call('add_items', { collection: 'locations', items: [{ name: 'Rosie’s Diner', status: 'confirmed', sets: ['diner'], address: '1 Main St', hospital: { name: 'St. Mary', phone: '555-0300' } }, { name: 'Lot behind the diner', status: 'option', sets: ['PARKING LOT'] }] });
  const [diner, lot] = r.data?.ids ?? [];
  r = await call('list_items', { collection: 'locations', fields: ['name', 'sets'] });
  check('sets uppercased & scenes mapped', r.data?.items?.[0]?.sets?.[0] === 'DINER' && r.data?.items?.[0]?._scenes?.length === 2, JSON.stringify(r.data?.items));
  r = await call('add_items', { collection: 'contacts', items: [{ name: 'Rental Co', category: 'rental', company: 'Rental Co' }] });
  r = await call('add_items', { collection: 'elements', items: [{ category: 'wardrobe', name: 'waitress apron', characterId: 'MAYA', sceneIds: ['1', '3'] }] });
  r = await call('add_items', { collection: 'shots', items: [{ sceneId: '1', description: 'Wide of the diner, rain outside', shotSize: 'WS', lens: '24mm' }, { sceneId: '1', description: 'MCU Maya', shotSize: 'MCU', lens: '50mm', characterIds: ['MAYA'] }, { description: 'Neon sign insert' }] });
  const [shot1, shot2, shot3] = r.data?.ids ?? [];
  r = await call('list_items', { collection: 'shots', fields: ['number', 'sceneId', 'description'] });
  const shots = r.data?.items ?? [];
  check('shots numbered per scene', shots.find((s) => s.id === shot1)?.number === '1' && shots.find((s) => s.id === shot2)?.number === '2' && shots.find((s) => s.id === shot3)?._scene === '(unassigned)', JSON.stringify(shots));
  r = await call('update_items', { collection: 'shots', updates: [{ id: shot3, sceneId: '2' }] });
  r = await call('get_items', { collection: 'shots', ids: [shot3] });
  check('shot moved to scene', r.data?.items?.[0]?.sceneId === s2 && r.data?.items?.[0]?.number === '1', JSON.stringify(r.data?.items?.[0]));
  r = await call('add_items', { collection: 'budget_categories', items: [{ name: 'Camera Package', section: 'btl' }] });
  const bcat = r.data?.ids?.[0];
  r = await call('add_items', { collection: 'budget_lines', parentId: 'Camera Package', items: [{ description: 'Camera body', qty: 2, unit: 'day', rate: 400, x: 1 }] });
  r = await call('list_items', { collection: 'budget_lines', parentId: bcat });
  check('budget line total', r.data?.items?.[0]?._total === 800, JSON.stringify(r.data));
  await call('add_items', { collection: 'budget_lines', items: [{ description: 'x' }] }, { expectError: true });
  r = await call('add_items', { collection: 'tasks', items: [{ title: 'Lock the diner', phase: 'pre', due: '2026-11-01' }, { title: 'Book rain towers', phase: 'pre' }] });
  const [t1, t2] = r.data?.ids ?? [];
  await call('add_items', { collection: 'tasks', items: [{ title: 'Bad date', due: '11/01/2026' }] }, { expectError: true });
  r = await call('move_items', { collection: 'tasks', ids: [t2], position: 'start' });
  r = await call('list_items', { collection: 'tasks', where: { phase: 'pre' }, fields: ['title'] });
  check('move_items', r.data?.items?.[0]?.id === t2, JSON.stringify(r.data?.items?.slice(0, 2)));
  r = await call('list_items', { collection: 'tasks', search: 'diner' });
  check('search', r.data?.total === 1);
  r = await call('add_items', { collection: 'milestones', items: [{ name: 'Picture lock', phase: 'post', date: '2026-12-15' }] });
  for (const [c, item] of [
    ['deliverables', { name: 'Festival DCP', platform: 'Festival' }],
    ['post_schedule', { name: 'Rough cut', start: '2026-11-20', end: '2026-11-30' }],
    ['vfx', { description: 'Rain enhancement', sceneId: '1' }],
    ['music_cues', { title: 'Diner theme', source: 'original' }],
    ['adr', { line: 'You still open?', characterId: 'THEO', sceneId: '1' }],
    ['graphics', { text: 'NIGHT SHIFT', kind: 'Title card' }],
    ['edit_notes', { note: 'Tighten the opening', version: 'v1' }],
    ['av_rows', { segment: 'Intro', video: 'Diner exterior', audio: 'Rain', duration: 5 }],
    ['contacts', { name: 'Diner owner', category: 'location' }],
  ]) {
    r = await call('add_items', { collection: c, items: [item] }, { quiet: true });
    check(`add ${c}`, !r.res.isError && r.data?.created === 1, r.text);
  }
  r = await call('delete_items', { collection: 'cast', ids: ['Ben Ortiz'] });
  r = await call('list_items', { collection: 'characters' });
  check('delete clears castId', !r.data?.items?.find((c) => c.name === 'THEO')?.castId, JSON.stringify(r.data?.items));

  r = await call('set_fields', { values: { 'meta.targetRuntime': '12:00', 'settings.print.watermark': 'DRAFT', 'script.titlePage.draft': 'Second Draft', 'budget.contingencyPct': 12, notes: 'Agent test notes', 'schedule.startDate': '2026-11-07', 'schedule.skipWeekends': true } });
  r = await call('get_fields', {});
  check('set_fields', r.data?.meta?.targetRuntime === '12:00' && r.data?.['settings.print']?.watermark === 'DRAFT' && r.data?.budget?.contingencyPct === 12 && r.data?.notes === 'Agent test notes', JSON.stringify(r.data).slice(0, 300));
  await call('set_fields', { values: { 'meta.nope': 1 } }, { expectError: true });
  await call('set_fields', { values: { 'settings.paperSize': 'tabloid' } }, { expectError: true });

  // ---------------------------------------------------------------- mind dump
  r = await call('mind_add_notes', { notes: ['Neon reflections in puddles', { text: 'Coffee steam close-ups', color: '#ffd6a5' }, 'Theo hums a song'], group: 'Look & sound' });
  const notes = r.data?.ids ?? [];
  check('mind notes + group', notes.length === 3 && !!r.data?.groupId);
  r = await call('mind_organize', { action: 'tidy_grid' });
  r = await call('mind_send_notes', { noteIds: [notes[0], notes[1]], to: 'shots' });
  r = await call('list_items', { collection: 'mind_notes', where: { used: true } });
  check('notes marked used', r.data?.total === 2, JSON.stringify(r.data));
  r = await call('add_items', { collection: 'mind_links', items: [{ from: notes[0], to: notes[2] }] });
  r = await call('delete_items', { collection: 'mind_notes', ids: [notes[2]] });
  r = await call('list_items', { collection: 'mind_links' });
  check('links removed with note', r.data?.total === 0, JSON.stringify(r.data));

  // boards: one per idea batch / category
  r = await call('mind_use_board', {});
  const firstBoard = r.data?.boards?.[0];
  check('one board by default', r.data?.boards?.length === 1 && firstBoard?.active === true, JSON.stringify(r.data));
  r = await call('mind_add_notes', { notes: ['Teaser: 6 s loop of the neon sign', 'BTS: the rain machine', 'Poster: Theo in the window'], board: 'Promo ideas' });
  check('notes on a new board', r.data?.board === 'Promo ideas' && r.data?.boardCreated === true && r.data?.ids?.length === 3, JSON.stringify(r.data));
  const promoNotes = r.data?.ids ?? [];
  r = await call('list_items', { collection: 'mind_notes' });
  check('mind_notes follow the active board', r.data?.total === 3, JSON.stringify(r.data?.total));
  await call('set_fields', { values: { 'script.mind.text': 'promo brain dump' } });
  r = await call('list_items', { collection: 'mind_boards' });
  const promo = r.data?.items?.find((b) => b.name === 'Promo ideas');
  check('mind_boards lists boards', r.data?.total === 2 && promo?._active === true && promo?._notes === 3 && promo?._words === 3, JSON.stringify(r.data));
  r = await call('mind_use_board', { board: firstBoard?.id });
  check('switch board', r.data?.name === firstBoard?.name && r.data?.created === undefined, JSON.stringify(r.data));
  r = await call('list_items', { collection: 'mind_notes' });
  check('other board keeps its notes', r.data?.total === 2, JSON.stringify(r.data?.total));
  r = await call('get_fields', { paths: ['script.mind'] });
  check('free text per board', r.data?.['script.mind']?.text !== 'promo brain dump', JSON.stringify(r.data));
  await call('mind_organize', { action: 'tidy_grid', board: 'No such board' }, { expectError: true });
  r = await call('mind_organize', { action: 'tidy_by_colour', board: 'promo ideas' });
  check('organize by board name', r.data?.board === 'Promo ideas' && r.data?.notes === 3, JSON.stringify(r.data));
  r = await call('mind_use_board', { board: 'Promo ideas', rename: 'Promo', color: '#e64980' });
  check('rename board', r.data?.name === 'Promo' && r.data?.boards?.length === 2, JSON.stringify(r.data));
  r = await call('mind_send_notes', { noteIds: [promoNotes[0]], to: 'tasks', board: 'Promo' });
  check('send from a named board', r.data?.sent === 1, JSON.stringify(r.data));
  r = await call('add_items', { collection: 'mind_boards', items: [{ name: 'Locations' }] });
  r = await call('list_items', { collection: 'mind_boards', fields: ['name'] });
  check('add board via add_items', r.data?.total === 3, JSON.stringify(r.data));
  r = await call('delete_items', { collection: 'mind_boards', ids: ['Locations'] });
  r = await call('get_app_state', {});
  check('app state lists boards', r.data?.openProject?.mindBoards?.length === 2 && r.data.openProject.mindBoards.some((x) => /Promo .*\(active\)/.test(x)), JSON.stringify(r.data?.openProject));

  // ---------------------------------------------------------------- images
  r = await call('import_image', { svg: SVG, attachTo: { collection: 'shots', id: shot2, field: 'image' } });
  check('svg storyboard frame', /\.svg$/.test(r.data?.asset ?? ''), JSON.stringify(r.data));
  r = await call('import_image', { base64: PNG_1PX, mimeType: 'image/png', attachTo: { collection: 'cast', id: 'Ana Lima', field: 'photo' } });
  check('base64 headshot', !!r.data?.asset);
  const pngPath = path.join(DATA, 'photo.png');
  writeFileSync(pngPath, Buffer.from(PNG_1PX, 'base64'));
  r = await call('import_image', { path: pngPath, attachTo: { collection: 'locations', id: diner, field: 'photos' } });
  r = await call('import_image', { path: pngPath, attachTo: { collection: 'locations', id: diner, field: 'photos' } });
  r = await call('get_items', { collection: 'locations', ids: [diner] });
  check('photos appended', r.data?.items?.[0]?.photos?.length === 2, JSON.stringify(r.data?.items?.[0]?.photos));
  r = await call('import_image', { svg: SVG, attachTo: { field: 'meta.logo' } });
  await call('import_image', { svg: SVG, attachTo: { collection: 'cast', id: ana, field: 'name' } }, { expectError: true });

  // ---------------------------------------------------------------- lighting
  r = await call('lighting_list_kinds', {});
  check('lighting library', r.data?.kinds?.length > 30 && r.data?.templates?.length >= 3);
  r = await call('lighting_create_diagram', { name: 'Diner counter', sceneIds: ['1'], shotIds: [shot2], locationId: "Rosie’s Diner" });
  const dg = r.data?.id;
  check('diagram created', !!dg && r.data?.width === 30, JSON.stringify(r.data));
  r = await call('lighting_add_items', {
    diagramId: dg,
    items: [
      { kind: 'person.actor', x: 15, y: 8, label: 'Maya' },
      { kind: 'set.counter', x: 15, y: 6.5, size: [10, 2] },
      { kind: 'camera.cinema', x: 15, y: 15, facing: 'Maya', props: { lens: 50 } },
      { kind: 'light.softbox', x: 10, y: 11, facing: 'Maya', props: { purpose: 'Key', fixture: 'Aputure LS 600d Pro', watts: 600 } },
      { kind: 'light.tube', x: 20, y: 4, facing: [15, 8], props: { purpose: 'Back/Rim' } },
      { kind: 'note.arrow', x: 12, y: 15, points: [[12, 15], [18, 15]] },
    ],
  });
  const added = r.data?.added ?? [];
  const cam = added.find((i) => i.kind === 'camera.cinema');
  check('camera faces actor (rotation 0 = up)', cam?.rotation === 0, JSON.stringify(cam));
  check('lights numbered', added.filter((i) => i.light).map((i) => i.light).join() === 'L1,L2', JSON.stringify(added.map((i) => i.light)));
  const key = added.find((i) => i.kind === 'light.softbox');
  r = await call('lighting_update_items', { diagramId: 'Diner counter', updates: [{ id: key.id, x: 9, props: { intensity: 70, watts: null } }], remove: [added.find((i) => i.kind === 'note.arrow').id] });
  r = await call('lighting_get_diagram', { diagramId: dg });
  const k2 = r.data?.items?.find((i) => i.id === key.id);
  check('lighting update', k2?.x === 9 && k2?.props?.intensity === 70 && k2?.props?.watts === undefined && r.data?.items?.length === 5, JSON.stringify(k2));
  r = await call('lighting_add_to_gear', { diagramId: dg });
  check('lights to gear', r.data?.added?.length >= 1, JSON.stringify(r.data));
  await call('lighting_create_diagram', { name: 'Interview', template: 'interview' });
  await call('lighting_add_items', { diagramId: dg, items: [{ kind: 'light.softbox' }] }, { expectError: true });

  // ---------------------------------------------------------------- schedule & call sheets
  r = await call('schedule_action', { action: 'add_days', count: 2 });
  const [d1, d2] = r.data?.added ?? [];
  r = await call('schedule_scenes', { sceneIds: ['1', '3'], dayId: 'Day 1' });
  r = await call('schedule_scenes', { sceneIds: ['2'], dayId: d2 });
  r = await call('schedule_action', { action: 'add_banner', dayId: 'Day 1', text: 'LUNCH — 1 HOUR', position: 1 });
  r = await call('schedule_action', { action: 'sync_project_dates' });
  check('dates from start date (skip weekend)', r.data?.shootStart === '2026-11-09' && r.data?.shootEnd === '2026-11-10', JSON.stringify(r.data));
  r = await call('get_schedule', { dood: true });
  check('schedule', r.data?.days?.length === 2 && r.data?.days?.[0]?.items?.length === 3 && r.data?.unscheduled?.length === 0, JSON.stringify(r.data?.days?.[0]));
  check('dood', r.data?.dayOutOfDays?.some((x) => x.character === 'MAYA'), JSON.stringify(r.data?.dayOutOfDays));
  r = await call('schedule_scenes', { sceneIds: ['2'], dayId: 'new', newDay: { date: '2026-11-12', label: 'Pickups' } });
  check('new day', r.data?.to === 'Pickups', JSON.stringify(r.data));
  r = await call('update_call_sheet', { dayId: 'Day 1', crewCall: '7:00 am', lunch: '13:00', estWrap: '19:00', weather: { summary: 'Rain', high: '12°C' }, castCalls: { 'Ana Lima': { call: '08:00', hmu: '08:15' } }, crewCalls: { 'Sam Roe': 'N/C', [dee]: { call: '06:30' } }, deptNotes: { Camera: 'Rain covers for the A cam' }, safetyNotes: 'Wet floors' });
  r = await call('get_call_sheet', { dayId: d1 });
  const cs = r.data;
  check('call sheet', cs?.times?.crewCall === '07:00' && cs?.cast?.[0]?.call === '08:00' && cs?.departmentNotes?.Camera === 'Rain covers for the A cam' && cs?.locations?.[0]?.name === 'Rosie’s Diner', JSON.stringify(cs).slice(0, 500));
  check('crew N/C', JSON.stringify(cs?.crew).includes('"call":"N/C"'), JSON.stringify(cs?.crew));
  await call('update_call_sheet', { dayId: 'Day 9', lunch: '13:00' }, { expectError: true });
  await call('update_call_sheet', { dayId: 'Day 1', lunch: 'noonish' }, { expectError: true });

  // ---------------------------------------------------------------- templates, budget, reports
  r = await call('apply_template', { kind: 'crew', id: 'small' });
  check('crew template', r.data?.added >= 3, JSON.stringify(r.data));
  r = await call('apply_template', { kind: 'gear', id: 'interview' });
  check('gear preset', r.data?.added >= 3, JSON.stringify(r.data));
  r = await call('budget_quick_fill', { what: ['people', 'gear'] });
  for (const rep of ['overview', 'readiness', 'timeline', 'breakdown', 'characters', 'budget', 'gear', 'sets']) {
    r = await call('get_report', { report: rep }, { quiet: true });
    check(`report ${rep}`, !r.res.isError && r.data != null, r.text.slice(0, 200));
  }
  r = await call('get_report', { report: 'budget' });
  check('budget report total', /\d/.test(r.data?.grandTotal ?? ''), JSON.stringify(r.data?.grandTotal));

  // ---------------------------------------------------------------- output
  r = await call('list_documents', {});
  check('documents', r.data?.length >= 50, `${r.data?.length}`);
  r = await call('preview_document', { docId: 'call-sheet', options: { dayId: '1' } });
  check('preview image', r.images.length === 1 && r.images[0].data.length > 5000, `${r.images[0]?.data?.length}`);
  r = await call('preview_document', { docId: 'screenplay' });
  check('screenplay preview', r.images.length === 1);
  r = await call('export_pdf', { documents: [{ docId: 'call-sheet', options: { dayId: '1' } }] });
  const pdf1 = r.data?.files?.[0];
  check('pdf exported', pdf1 && existsSync(pdf1) && statSync(pdf1).size > 10000 && readFileSync(pdf1).subarray(0, 4).toString() === '%PDF', pdf1);
  r = await call('export_pdf', { documents: [{ docId: 'screenplay' }, { docId: 'shot-list' }, { docId: 'lighting-diagram' }, { docId: 'storyboard' }], merge: true, fileName: 'Book' });
  const book = r.data?.files?.[0];
  check('merged book', book && /Book\.pdf$/.test(book) && statSync(book).size > 20000, book);
  for (const fmtx of ['fountain', 'fdx', 'archive']) {
    r = await call('export_project_file', { format: fmtx }, { quiet: true });
    const f = r.data?.file;
    check(`export ${fmtx}`, f && existsSync(f) && statSync(f).size > 200, r.text);
  }
  r = await call('export_pdf', { documents: [{ docId: 'nope' }] }, { expectError: true });

  // ---------------------------------------------------------------- undo / redo / UI
  r = await call('add_items', { collection: 'tasks', items: [{ title: 'Undo me' }] });
  r = await call('undo', {});
  r = await call('list_items', { collection: 'tasks', search: 'Undo me' });
  check('undo agent change', r.data?.total === 0, JSON.stringify(r.data));
  r = await call('redo', {});
  r = await call('list_items', { collection: 'tasks', search: 'Undo me' });
  check('redo', r.data?.total === 1);
  r = await call('write_script', { mode: 'append', fountain: 'EXT. ROOFTOP - DAWN\n\nThe rain stops.\n' });
  r = await call('undo', {});
  r = await call('list_scenes', {});
  check('undo script write', r.data?.sceneCount === 3, JSON.stringify(r.data?.sceneCount));
  r = await call('show_in_app', { module: 'script', params: { tab: 'mind' } });
  r = await call('screenshot_app', {});
  check('screenshot', r.images.length === 1 && r.images[0].data.length > 10000);
  r = await call('get_app_state', {});
  check('app state', r.data?.openProject?.title === 'MCP Test Film' && r.data?.screen?.module === 'script' && r.data?.recentAgentChanges?.length > 0, JSON.stringify(r.data?.screen));

  // ---------------------------------------------------------------- projects
  r = await call('open_demo_project', {});
  check('demo opened', /Last Take/.test(r.data?.title ?? ''), JSON.stringify(r.data));
  r = await call('list_scenes', {});
  check('demo has scenes', r.data?.sceneCount >= 4);
  r = await call('list_projects', {});
  check('two projects', r.data?.length === 2, JSON.stringify(r.data));
  r = await call('duplicate_project', { projectId: 'MCP Test Film', title: 'Copy to delete' });
  const copyId = r.data?.id;
  await call('delete_project', { projectId: copyId, confirm: false }, { expectError: true });
  r = await call('delete_project', { projectId: copyId, confirm: true });
  r = await call('open_project', { projectId: projectId, module: 'schedule' });
  r = await call('create_project', { title: 'Promo', projectType: 'trailer', start: 'blank', copyFrom: { projectId: 'MCP Test Film', cast: true, locations: true } });
  r = await call('list_items', { collection: 'cast' });
  check('copyFrom cast', r.data?.items?.some((c) => c.name === 'Ana Lima'), JSON.stringify(r.data?.items));
  r = await call('get_fields', { paths: ['script'] });
  check('trailer defaults to A/V', r.data?.script?.mode === 'av', JSON.stringify(r.data));
  r = await call('close_project', {});
  r = await call('get_app_state', {});
  check('closed', !r.data?.openProject);
}


/* ------------------------------------------------------------ Marketing Spaces */

const iso = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function spaceScenario() {
  let r = await call('list_spaces', {});
  check('no spaces yet', Array.isArray(r.data) && r.data.length === 0, JSON.stringify(r.data));
  r = await call('create_space', { title: 'My Personal Brand', type: 'personal_brand', projectIds: ['MCP Test Film'] });
  check('space created with template', r.data?.channels?.length === 5 && r.data?.pillars?.length === 4 && r.data?.content === 3, JSON.stringify(r.data));
  r = await call('get_app_state', {});
  check('space open', r.data?.openSpace?.title === 'My Personal Brand' && r.data?.modules?.some((m) => m.id === 'calendar'), JSON.stringify(r.data?.openSpace));
  await call('list_scenes', {}, { expectError: true });
  r = await call('describe_data', {});
  check('space collections', r.data?.open === 'space' && r.data?.collections?.some((c) => c.name === 'content') && r.data?.collections?.some((c) => c.name === 'posts'), JSON.stringify(r.data?.collections?.map((c) => c.name)));
  r = await call('describe_data', { collection: 'content' });
  check('content fields', r.data?.fields?.some((f) => f.name === 'stage' && f.values?.includes('published')));

  r = await call('add_items', {
    collection: 'content',
    items: [
      {
        title: 'Lighting trick #1: the bounce',
        format: 'short_video',
        stage: 'writing',
        pillarId: 'Craft & how-to',
        hook: 'One sheet of foam board = a softbox.',
        script: 'HOOK\nOne sheet of foam board = a softbox.\n\nBODY\nShow the before/after.\n\nCTA\nFollow for trick #2.',
        posts: [
          { channelId: 'Instagram', date: iso(2), time: '18:00', caption: 'The cheapest softbox you will ever own.', hashtags: '#lighting #filmmaking' },
          { channelId: 'TikTok', date: iso(2), time: '19:00', status: 'scheduled' },
        ],
        shots: [{ description: 'Before: hard light on face', kind: 'a_roll' }, 'After: bounce from the foam board'],
      },
      { title: 'Newsletter #1', format: 'newsletter', copy: 'Hi friends…', posts: [{ channelId: 'Newsletter', date: iso(5) }] },
    ],
  });
  const [piece, letter] = r.data?.ids ?? [];
  check('content with posts created', r.data?.created === 2);
  r = await call('get_items', { collection: 'content', ids: [piece] });
  const pc = r.data?.items?.[0];
  check('posts, shots and checklist built', pc?.posts?.length === 2 && pc?.shots?.length === 2 && pc?.checklist?.length >= 5 && pc?.posts?.[0]?.status === 'draft', JSON.stringify(pc).slice(0, 400));
  await call('add_items', { collection: 'content', items: [{ title: 'x', posts: [{ channelId: 'Myspace' }] }] }, { expectError: true });
  await call('update_items', { collection: 'content', updates: [{ id: piece, posts: [] }] }, { expectError: true });
  r = await call('list_items', { collection: 'posts', parentId: piece });
  check('posts listed', r.data?.total === 2 && r.data?.items?.[0]?._channel === 'Instagram', JSON.stringify(r.data?.items?.[0]));
  const postId = r.data?.items?.[0]?.id;
  r = await call('update_items', { collection: 'posts', updates: [{ id: postId, status: 'published', url: 'https://instagram.com/p/x', metrics: { views: 1200, likes: 90 } }] });
  r = await call('update_items', { collection: 'posts', updates: [{ id: postId, metrics: { saves: 14 } }] });
  r = await call('list_items', { collection: 'posts', where: { status: 'published' } });
  check('post published with merged metrics', r.data?.total === 1 && r.data?.items?.[0]?.metrics?.views === 1200 && r.data?.items?.[0]?.metrics?.saves === 14, JSON.stringify(r.data?.items));
  r = await call('update_items', { collection: 'content', updates: [{ id: piece, stage: 'editing', concept: 'Cheap lighting series' }] });
  r = await call('get_space_calendar', { from: iso(0), to: iso(7) });
  check('calendar shows posts', r.data?.posts?.length === 3 && r.data?.posts?.some((p) => p.channel === 'Newsletter'), JSON.stringify(r.data?.posts));

  r = await call('add_items', { collection: 'shoots', items: [{ title: 'Batch day #1', date: iso(1), callTime: '9:00 am', location: 'Home studio', contentIds: [piece] }] });
  const shootId = r.data?.ids?.[0];
  r = await call('get_items', { collection: 'content', ids: [piece] });
  check('shoot synced to content', r.data?.items?.[0]?.shootId === shootId && r.data?.items?.[0]?.shootDate === iso(1), JSON.stringify({ shootId: r.data?.items?.[0]?.shootId, d: r.data?.items?.[0]?.shootDate }));
  r = await call('add_items', { collection: 'goals', items: [{ title: '10k on Instagram', metric: 'Followers', target: 10000, current: 2500, baseline: 1000 }] });
  r = await call('list_items', { collection: 'goals' });
  check('goal progress', r.data?.items?.some((g) => g._progress === '17%'), JSON.stringify(r.data?.items?.map((g) => g._progress)));
  r = await call('add_items', { collection: 'campaigns', items: [{ name: 'Lighting series launch', start: iso(0), end: iso(21), channelIds: ['Instagram', 'TikTok'] }] });
  r = await call('add_items', { collection: 'milestones', items: [{ name: '10 tricks published', date: iso(21), campaignId: 'Lighting series launch' }] });
  r = await call('set_fields', { values: { 'strategy.voice': 'Practical, warm, no jargon.', 'strategy.tagline': 'Make it look expensive.', 'meta.description': 'My filmmaking brand' } });
  r = await call('get_fields', { paths: ['strategy', 'meta.description'] });
  check('strategy fields', r.data?.strategy?.voice === 'Practical, warm, no jargon.' && r.data?.['meta.description'] === 'My filmmaking brand', JSON.stringify(r.data));
  await call('set_fields', { values: { 'meta.logline': 'x' } }, { expectError: true });

  r = await call('mind_add_notes', { notes: ['Trick: practicals as key light', 'Trick: negative fill with a black tee'], group: 'Lighting series' });
  const ideaIds = r.data?.ids ?? [];
  check('ideas board notes', ideaIds.length === 2 && !!r.data?.groupId);
  r = await call('list_items', { collection: 'mind_notes' });
  check('notes on the space board', r.data?.total === 2, JSON.stringify(r.data?.total));
  r = await call('mind_send_notes', { noteIds: ideaIds, to: 'content', format: 'short_video' });
  check('notes → content ideas', r.data?.created?.length === 2, JSON.stringify(r.data));
  await call('mind_send_notes', { noteIds: ideaIds, to: 'scenes' }, { expectError: true });
  r = await call('mind_use_board', { board: 'Hooks' });
  check('space board created', r.data?.created === true && r.data?.boards?.length === 2, JSON.stringify(r.data));
  r = await call('list_items', { collection: 'mind_notes' });
  check('new space board starts empty', r.data?.total === 0, JSON.stringify(r.data?.total));
  r = await call('mind_add_notes', { notes: ['POV: you only get one take'] });
  check('notes land on the active space board', r.data?.board === 'Hooks', JSON.stringify(r.data));

  // ---------------------------------------------------------------- people & brands (CRM sheets)
  r = await call('crm_read', {});
  check('crm templates listed', r.data?.templates?.length >= 5 && r.data?.sheets?.length === 0, JSON.stringify(r.data?.sheets));
  r = await call('crm_sheet', { action: 'create', template: 'brand_deals' });
  check('crm sheet from template', r.data?.name === 'Brand deals' && r.data?.columns?.some((c) => c.name === 'Stage' && c.options?.includes('Negotiating')), JSON.stringify(r.data));
  r = await call('crm_rows', { sheet: 'Brand deals', add: [{ Brand: 'Acme Lights', Stage: 'Pitched', Fee: '1,500', Due: '2026-11-20', Paid: false, Campaign: 'Lighting series launch' }, { Brand: 'Gear Co', Stage: 'Brand new stage', Fee: 200, Due: '2000-01-01' }] });
  check('crm rows added', r.data?.added?.length === 2, JSON.stringify(r.data));
  r = await call('crm_read', { sheet: 'brand deals', where: { Stage: 'Pitched' } });
  check('crm where filter', r.data?.total === 1 && r.data.rows[0].Fee === 1500 && r.data.rows[0].Campaign === 'Lighting series launch' && r.data.rows[0].Due === '2026-11-20', JSON.stringify(r.data));
  const dealId = r.data?.rows?.[0]?.id;
  r = await call('crm_read', { sheet: 'Brand deals', due: true });
  check('crm due rows', r.data?.total === 1 && r.data.rows[0].Brand === 'Gear Co', JSON.stringify(r.data?.rows));
  check('crm new option', r.data?.sheet?.columns?.find((c) => c.name === 'Stage')?.options?.includes('Brand new stage'), JSON.stringify(r.data?.sheet?.columns));
  await call('crm_rows', { sheet: 'Brand deals', add: [{ Nope: 1 }] }, { expectError: true });
  await call('crm_rows', { sheet: 'Brand deals', add: [{ Brand: 'x', Fee: 'lots' }] }, { expectError: true });
  await call('crm_rows', { sheet: 'Brand deals', add: [{ Brand: 'x', Campaign: 'No such campaign' }] }, { expectError: true });
  r = await call('crm_rows', { sheet: 'Brand deals', update: [{ id: dealId, Stage: 'Contracted', Notes: 'Signed', Paid: true }] });
  r = await call('crm_read', { sheet: 'Brand deals', search: 'signed' });
  check('crm update + search', r.data?.total === 1 && r.data.rows[0].Stage === 'Contracted' && r.data.rows[0].Paid === true, JSON.stringify(r.data?.rows));
  r = await call('crm_sheet', { action: 'update', sheet: 'Brand deals', addColumns: [{ name: 'Priority', type: 'select', options: ['High', 'Low'] }], updateColumns: [{ column: 'Contact', type: 'select' }], view: 'board', boardColumn: 'Stage' });
  check('crm sheet update', r.data?.view === 'board' && r.data?.boardGroupsBy === 'Stage' && r.data?.columns?.some((c) => c.name === 'Priority' && c.options?.length === 2) && r.data?.columns?.find((c) => c.name === 'Contact')?.type === 'select', JSON.stringify(r.data));
  await call('crm_sheet', { action: 'update', sheet: 'Brand deals', boardColumn: 'Fee' }, { expectError: true });
  r = await call('crm_sheet', { action: 'create', name: 'Podcast guests', columns: [{ name: 'Guest' }, { name: 'Status', type: 'select', options: ['Asked', 'Booked'] }, { name: 'Date', type: 'date' }] });
  check('crm custom sheet', r.data?.columns?.length === 3 && r.data?.boardGroupsBy === 'Status', JSON.stringify(r.data));
  r = await call('crm_rows', { sheet: 'Podcast guests', add: [{ Guest: 'Test Guest', Status: 'Booked', Date: '2026-12-01', Topic: 'AI agents' }], createColumns: true });
  r = await call('crm_read', { sheet: 'Podcast guests' });
  check('crm createColumns', r.data?.sheet?.columns?.some((c) => c.name === 'Topic') && r.data?.rows?.[0]?.Topic === 'AI agents', JSON.stringify(r.data));
  r = await call('crm_rows', { sheet: 'Podcast guests', delete: [r.data?.rows?.[0]?.id] });
  check('crm delete row', r.data?.deleted === 1, JSON.stringify(r.data));
  r = await call('crm_sheet', { action: 'delete', sheet: 'Podcast guests' });
  r = await call('crm_read', {});
  check('crm sheets after delete', r.data?.sheets?.length === 1 && r.data.sheets[0].rows === 2, JSON.stringify(r.data?.sheets));
  r = await call('show_in_app', { module: 'people', params: { sheetId: 'Brand deals' } });
  check('show people', !r.res.isError, r.text.slice(0, 200));

  // ---------------------------------------------------------------- downloadable campaign resources
  r = await call('add_resource', { name: 'Lighting series playbook', campaignId: 'Lighting series launch', resourceType: 'playbook', fileName: 'playbook.md', text: '# Playbook\n\nStep 1: light it.' });
  check('add_resource from text', !!r.data?.id && r.data.file === 'playbook.md' && r.data.campaign === 'Lighting series launch', JSON.stringify(r.data));
  r = await call('add_resource', { name: 'Free lighting cheatsheet', gated: true, url: 'https://example.com/optin', campaignId: 'Lighting series launch' });
  check('add_resource link', !!r.data?.id, JSON.stringify(r.data));
  r = await call('add_resource', { fileName: 'one-pager.pdf', base64: PNG_1PX, resourceType: 'one_pager' });
  check('add_resource base64', r.data?.file === 'one-pager.pdf' && !r.data?.campaign, JSON.stringify(r.data));
  r = await call('list_items', { collection: 'assets', where: { kind: 'resource' } });
  check('resources listed', r.data?.total === 3 && r.data.items.some((a) => a._campaign === 'Lighting series launch' && a._hasFile && a.resourceType === 'playbook') && r.data.items.some((a) => a.gated === true), JSON.stringify(r.data?.items));
  r = await call('list_items', { collection: 'campaigns', where: { name: 'Lighting series launch' } });
  check('campaign resource count', r.data?.items?.[0]?._resources === 2, JSON.stringify(r.data?.items));
  await call('add_resource', { name: 'x', fileName: 'noext', text: 'hi' }, { expectError: true });
  await call('add_resource', { name: 'x', campaignId: 'No such campaign' }, { expectError: true });
  await call('add_resource', { text: 'a', base64: 'b', fileName: 'x.txt' }, { expectError: true });
  // documents from disk (the agent file reader accepts documents, not config / key files)
  const pdfPath = path.join(DATA, 'Brief one-pager.pdf');
  writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  r = await call('add_resource', { path: pdfPath, campaignId: 'Lighting series launch', resourceType: 'one_pager' });
  check('add_resource pdf from path', r.data?.file === 'Brief one-pager.pdf' && r.data?.size > 10 && r.data?.campaign === 'Lighting series launch', JSON.stringify(r.data));
  const docxPath = path.join(DATA, 'Sequence map.docx');
  writeFileSync(docxPath, Buffer.from('PK fake docx', 'binary'));
  r = await call('add_resource', { path: docxPath, assetId: 'Free lighting cheatsheet' });
  check('add_resource attach docx to existing', r.data?.file === 'Sequence map.docx', JSON.stringify(r.data));
  r = await call('get_items', { collection: 'assets', ids: ['Free lighting cheatsheet'] });
  check('attached file on asset', r.data?.items?.[0]?.fileName === 'Sequence map.docx' && r.data.items[0].gated === true, JSON.stringify(r.data?.items?.[0]));
  const envPath = path.join(DATA, 'secrets.env');
  writeFileSync(envPath, 'KEY=1');
  await call('add_resource', { path: envPath, name: 'nope' }, { expectError: true });

  r = await call('import_image', { svg: SVG, attachTo: { collection: 'content', id: piece, field: 'thumbnail' } });
  check('thumbnail attached', !!r.data?.asset);
  r = await call('import_image', { svg: SVG, attachTo: { field: 'meta.cover' } });
  check('space cover', !!r.data?.asset);

  for (const rep of ['overview', 'pipeline', 'cadence', 'results']) {
    r = await call('get_space_report', { report: rep }, { quiet: true });
    check(`space report ${rep}`, !r.res.isError && r.data != null, r.text.slice(0, 200));
  }
  r = await call('get_space_report', { report: 'results' });
  check('results totals', r.data?.posts === 1 && r.data?.totals?.views === 1200, JSON.stringify(r.data?.totals));

  r = await call('list_documents', {});
  const spaceDocs = (r.data ?? []).map((d) => d.id);
  check('space documents', spaceDocs.includes('space-ideas') && spaceDocs.includes('space-people') && spaceDocs.every((id) => id.startsWith('space-')), JSON.stringify(spaceDocs));
  r = await call('preview_document', { docId: 'space-people' });
  check('people preview image', r.images.length === 1);
  r = await call('preview_document', { docId: 'space-ideas' });
  check('space preview image', r.images.length === 1);
  r = await call('export_pdf', { documents: spaceDocs.slice(0, 3).map((docId) => ({ docId })), merge: true, fileName: 'Space plan' });
  check('space merged pdf', r.data?.files?.[0] && existsSync(r.data.files[0]) && statSync(r.data.files[0]).size > 5000, JSON.stringify(r.data));

  r = await call('link_projects', { remove: ['MCP Test Film'] });
  check('unlink project', Array.isArray(r.data?.linked) && r.data.linked.length === 0, JSON.stringify(r.data));
  r = await call('add_items', { collection: 'tactics', items: [{ title: 'Undo me tactic' }] });
  r = await call('undo', {});
  r = await call('list_items', { collection: 'tactics', search: 'Undo me' });
  check('undo in space', r.data?.total === 0, JSON.stringify(r.data));
  r = await call('show_in_app', { module: 'calendar' });
  r = await call('show_in_app', { content: { contentId: piece, tab: 'publish' } });
  await call('show_in_app', { module: 'lighting' }, { expectError: true });
  r = await call('delete_items', { collection: 'channels', ids: ['TikTok'] });
  check('channel delete removes its posts', r.data?.postsDeleted === 1, JSON.stringify(r.data));
  r = await call('delete_items', { collection: 'content', ids: [letter] });
  r = await call('screenshot_app', {});
  check('space screenshot', r.images.length === 1);

  r = await call('open_demo_space', {});
  check('demo space', /Last Take/.test(r.data?.title ?? ''), JSON.stringify(r.data));
  r = await call('list_items', { collection: 'content', fields: ['title', 'stage'] });
  check('demo content', r.data?.total >= 12, `${r.data?.total}`);
  r = await call('get_space_calendar', { from: iso(-30), to: iso(60) });
  check('demo calendar', r.data?.posts?.length >= 15 && r.data?.milestones?.length >= 5, `${r.data?.posts?.length} posts`);
  r = await call('list_spaces', {});
  check('two spaces', r.data?.length === 2, JSON.stringify(r.data));
  r = await call('open_project', { projectId: 'MCP Test Film' });
  r = await call('get_app_state', {});
  check('back to project', r.data?.openProject?.title === 'MCP Test Film' && !r.data?.openSpace, JSON.stringify(r.data?.openProject));
}

/* ------------------------------------------------------------ business, finances, training, coach */

async function kindsScenario() {
  let r;
  const iso = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  // ---------------------------------------------------------------- business management
  r = await call('create_business', { title: 'MCP Test Biz', type: 'freelance', legalName: 'MCP Test LLC', ownerName: 'Test Owner', jurisdiction: 'California' });
  check('business created', !r.res.isError, r.text.slice(0, 200));
  r = await call('list_spaces', { kind: 'business' });
  check('list businesses', Array.isArray(r.data) && r.data.length === 1 && r.data[0].kind === 'business' && r.data[0].type === 'freelance', JSON.stringify(r.data));
  r = await call('get_app_state', {});
  check('business modules', /Business/.test(r.data?.openSpace?.kind ?? '') && ['invoices', 'expenses', 'time', 'legal', 'contractors'].every((m) => r.data?.modules?.some((x) => x.id === m)), JSON.stringify(r.data?.modules?.map((m) => m.id)));
  r = await call('add_items', { collection: 'clients', items: [{ name: 'Ada Client', company: 'Analytical Co', email: 'ada@example.com', defaultRate: 100 }] });
  r = await call('add_items', { collection: 'time_entries', items: [{ date: iso(0), minutes: 90, clientId: 'Ada Client', billable: true, description: 'Trailer edit session' }] });
  check('time entry added', !r.res.isError, r.text.slice(0, 200));
  r = await call('biz_invoice', { action: 'create', client: 'Ada Client', lines: [{ description: 'Trailer edit', qty: 1, unitPrice: 500 }], includeUnbilledTime: true });
  check('invoice created', !r.res.isError, r.text.slice(0, 300));
  r = await call('list_items', { collection: 'invoices' });
  const inv = r.data?.items?.[0];
  check('invoice total incl. unbilled time', r.data?.total === 1 && inv?._total === 650 && String(inv?._client).startsWith('Ada Client'), JSON.stringify(r.data?.items));
  r = await call('biz_invoice', { action: 'status', invoice: inv?.number ?? inv?.id, status: 'paid' });
  r = await call('biz_report', { period: 'this_month' });
  check('report shows the paid invoice', !r.res.isError && r.text.includes('650'), r.text.slice(0, 300));
  r = await call('biz_generate_document', { template: 'nda', party: { kind: 'client', id: 'Ada Client' } });
  check('legal document generated', !r.res.isError && /Ada/.test(r.text) && /MCP Test LLC/.test(r.text), r.text.slice(0, 300));
  r = await call('biz_timer', { action: 'start' });
  r = await call('biz_timer', { action: 'stop' });
  check('timer stop', !r.res.isError, r.text.slice(0, 200));
  r = await call('show_in_app', { module: 'invoices' });
  await call('show_in_app', { module: 'content' }, { expectError: true });

  // strategy, growth, sales pipeline, projects, SOPs, resources
  r = await call('set_fields', { values: { 'business.strategy.mission': 'Make trailers that sell films', 'business.strategy.positioning': 'The trailer studio for indie films' } });
  check('strategy fields', !r.res.isError, r.text.slice(0, 200));
  r = await call('add_items', { collection: 'offers', items: [{ name: 'Trailer package', price: 2500, active: true }] });
  r = await call('add_items', { collection: 'goals', items: [{ title: 'Revenue this year', metric: 'revenue', target: 10000, period: 'ytd' }] });
  r = await call('list_items', { collection: 'goals' });
  check('goal progress computed', r.data?.items?.[0]?._current === 650, JSON.stringify(r.data?.items?.[0]));
  r = await call('add_items', { collection: 'initiatives', items: [{ title: 'Festival outreach', status: 'in_progress', kpi: 'Inbound leads / month', baseline: 2, target: 10 }] });
  check('initiative added', !r.res.isError, r.text.slice(0, 200));
  r = await call('add_items', { collection: 'deals', items: [{ title: 'Indie feature trailer', clientId: 'Ada Client', value: 4000, stage: 'proposal', nextStep: 'Follow up on proposal', nextStepDate: iso(0) }] });
  check('deal added', !r.res.isError, r.text.slice(0, 200));
  r = await call('biz_pipeline', { action: 'summary' });
  check('pipeline summary', !r.res.isError && r.text.includes('4000'), r.text.slice(0, 300));
  r = await call('biz_pipeline', { action: 'log_activity', deal: 'Indie feature trailer', kind: 'call', text: 'Talked budget' });
  check('deal activity', !r.res.isError, r.text.slice(0, 200));
  r = await call('biz_pipeline', { action: 'move', deal: 'Indie feature trailer', stage: 'won' });
  check('deal won', !r.res.isError, r.text.slice(0, 300));
  r = await call('list_items', { collection: 'biz_projects' });
  const proj = r.data?.items?.find((x) => x.name === 'Indie feature trailer');
  check('winning creates a project', !!proj && proj.fee === 4000, JSON.stringify(r.data?.items));
  r = await call('add_items', { collection: 'project_tasks', parentId: proj?.id, items: [{ title: 'Rough cut', due: iso(7) }, { title: 'Final delivery', due: iso(14), milestone: true }] });
  check('project tasks', !r.res.isError, r.text.slice(0, 200));
  r = await call('biz_project', { action: 'summary', project: proj?.id });
  check('project summary', !r.res.isError && r.text.includes('4000'), r.text.slice(0, 300));
  r = await call('add_items', { collection: 'testimonials', items: [{ quote: 'Best trailer we ever had.', author: 'Ada', permission: 'granted' }] });
  check('testimonial added', !r.res.isError, r.text.slice(0, 200));
  r = await call('add_items', { collection: 'portfolio', items: [{ title: 'Showreel 2026', kind: 'showreel', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] });
  check('portfolio added', !r.res.isError, r.text.slice(0, 200));
  r = await call('add_items', { collection: 'resources', items: [{ title: 'Follow-up email', section: 'enablement', kind: 'text', text: 'Hi {name}, following up on the proposal.' }, { title: 'Brand kit', section: 'library', kind: 'link', url: 'https://example.com/brand' }] });
  check('resources added', !r.res.isError, r.text.slice(0, 200));
  r = await call('add_items', { collection: 'sops', items: [{ title: 'Client onboarding', kind: 'checklist' }] });
  r = await call('list_items', { collection: 'sops' });
  const sop = r.data?.items?.[0];
  r = await call('add_items', { collection: 'sop_steps', parentId: sop?.id, items: [{ text: 'Send welcome email' }, { text: 'Share the brief form' }] });
  r = await call('biz_sop', { action: 'start_run', sop: sop?.id, label: 'Ada' });
  check('sop run started', !r.res.isError, r.text.slice(0, 200));
  r = await call('biz_strategy', { action: 'report' });
  check('strategy report', !r.res.isError && r.text.includes('Festival outreach'), r.text.slice(0, 300));
  r = await call('list_documents', {});
  const bizDocs = (r.data ?? []).map((d) => d.id);
  check('business documents', ['space-biz-pipeline', 'space-biz-projects', 'space-biz-strategy', 'space-biz-sops', 'space-biz-growth', 'space-biz-portfolio'].every((id) => bizDocs.includes(id)), JSON.stringify(bizDocs));
  r = await call('preview_document', { docId: 'space-biz-strategy' });
  check('strategy preview image', r.images.length === 1);
  r = await call('show_in_app', { module: 'pipeline' });
  check('show pipeline', !r.res.isError, r.text.slice(0, 200));

  // ---------------------------------------------------------------- personal finances (this test instance starts unlocked)
  r = await call('open_finances', {});
  check('open finances', !r.res.isError, r.text.slice(0, 200));
  const CSV = 'Date,Description,Amount\n2026-10-01,NETFLIX.COM,-15.99\n2026-10-02,Paycheck ACME,2500.00\n2026-10-03,WHOLE FOODS MARKET,-82.10\n';
  r = await call('finance_import_transactions', { createAccount: { name: 'Test Checking', type: 'checking' }, csvText: CSV });
  check('statement imported', !r.res.isError, r.text.slice(0, 300));
  r = await call('finance_import_transactions', { accountId: 'Test Checking', csvText: CSV });
  r = await call('list_items', { collection: 'transactions' });
  check('duplicates skipped', r.data?.total === 3, JSON.stringify(r.data?.total));
  r = await call('finance_report', { period: 'all' });
  check('finance report', !r.res.isError && r.text.includes('2500'), r.text.slice(0, 300));
  r = await call('finance_add_advice', { title: 'Test advice', body: 'Keep three months of expenses as a buffer.' });
  check('advice saved', !r.res.isError, r.text.slice(0, 200));
  r = await call('finance_budget', { action: 'read' });
  check('budget read', !r.res.isError && /ready/i.test(r.text), r.text.slice(0, 300));
  r = await call('list_items', { collection: 'categories' });
  const cat = r.data?.items?.find((c) => c.kind !== 'income' && c.kind !== 'transfer') ?? r.data?.items?.[0];
  r = await call('finance_budget', { action: 'assign', category: cat?.id, amount: 100 });
  check('budget assign', !r.res.isError, r.text.slice(0, 300));
  r = await call('finance_budget', { action: 'auto_assign', mode: 'underfunded', dryRun: true });
  check('budget auto-assign dry run', !r.res.isError, r.text.slice(0, 300));
  r = await call('show_in_app', { module: 'budgets' });
  check('show budget', !r.res.isError, r.text.slice(0, 200));

  // ---------------------------------------------------------------- training
  r = await call('open_training', {});
  check('open training', !r.res.isError, r.text.slice(0, 200));
  r = await call('training_log', { weight: 80, weightUnit: 'kg', checkIn: { text: 'Feeling strong today', mood: 4, energy: 4 }, workout: { name: 'Test session', exercises: [{ exercise: 'Bench Press', sets: [{ weight: 60, reps: 8 }, { weight: 62.5, reps: 6 }] }] } });
  check('training logged', !r.res.isError, r.text.slice(0, 300));
  r = await call('list_items', { collection: 'check_ins' });
  check('check-in stored', r.data?.total >= 1, JSON.stringify(r.data?.total));
  r = await call('list_items', { collection: 'sessions' });
  check('session stored', r.data?.total >= 1, JSON.stringify(r.data?.total));
  r = await call('training_report', { period: '28d' });
  check('training report', !r.res.isError, r.text.slice(0, 200));

  // ---------------------------------------------------------------- holistic coach
  r = await call('studio_context', {});
  check('studio context', !!r.data?.training && !r.data?.finance?.locked && Array.isArray(r.data?.business) && r.data.business.length === 1 && Array.isArray(r.data?.productions), JSON.stringify(r.data).slice(0, 400));
}

/* ------------------------------------------------------------ main */

async function main() {
  if (!process.env.MCP_TEST_URL) {
    console.log('Starting an isolated PrePro Studio…');
    await startApp();
  }
  console.log(`HTTP client → ${URL_}`);
  client = new Client({ name: 'prepro-mcp-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  try {
    await scenario();
    await spaceScenario();
    await kindsScenario();
  } finally {
    await client.close().catch(() => {});
  }

  // ---------------------------------------------------------------- stdio bridge (Claude Desktop style)
  console.log('stdio bridge…');
  const bridge = new Client({ name: 'prepro-bridge-test', version: '1.0.0' });
  await bridge.connect(
    new StdioClientTransport({
      command: electronExe,
      args: [bridgeScript],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PREPRO_MCP_PORT: String(PORT), PREPRO_USER_DIR: path.join(DATA, 'userdata'), PREPRO_DATA_DIR: DATA },
      stderr: 'ignore',
    }),
  );
  const bt = await bridge.listTools();
  check('bridge tools/list', bt.tools.length >= 50);
  const st = await bridge.callTool({ name: 'list_projects', arguments: {} });
  check('bridge tools/call', !st.isError && /MCP Test Film/.test(st.content[0].text), st.content?.[0]?.text?.slice(0, 200));

  // app closed: handshake from cache, then auto-start on the first tool call
  if (app) {
    app.kill();
    await sleep(2500);
    const off = await fetch(URL_.replace(/\/mcp$/, '/health')).then(() => true, () => false);
    check('app stopped', !off);
    const bt2 = await bridge.listTools();
    check('bridge offline tools/list from cache', bt2.tools.length >= 50);
    const t0 = Date.now();
    const st2 = await bridge.callTool({ name: 'list_projects', arguments: {} }, undefined, { timeout: 90000 });
    check('bridge auto-starts the app', !st2.isError && /MCP Test Film/.test(st2.content[0].text), st2.content?.[0]?.text?.slice(0, 200));
    console.log(`  (app auto-started in ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  await bridge.close().catch(() => {});

  // security: requests from a web page origin are refused
  const evil = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' }).then((r) => r.status, () => 0);
  check('foreign Origin refused', evil === 403, `${evil}`);

  console.log(`\n${passes} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // stop any app instance we started (incl. the auto-started one)
    if (!process.env.MCP_TEST_URL && !process.env.MCP_TEST_KEEP) {
      app?.kill();
      // the instance auto-started by the bridge records its pid in the isolated settings folder
      try {
        const st = JSON.parse(readFileSync(path.join(DATA, 'userdata', 'mcp-server.json'), 'utf8'));
        if (st.pid && st.pid !== app?.pid) process.kill(st.pid);
      } catch {}
    }
  });
