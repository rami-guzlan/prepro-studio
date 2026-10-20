# PrePro Studio — developer guide

Fully local pre-production / post-planning desktop app. **Electron + React 19 + TypeScript + Vite**.
Renderer code lives in `src/`, Electron main/preload in `electron/` (plain CommonJS).

Run (already running for development): `npm run dev` → http://localhost:5173 (browser mode, data in IndexedDB).
Type-check: `npx tsc --noEmit -p tsconfig.json` (path alias `@/` = `src/`).

---

Marketing Spaces (the second kind of workspace: personal brands, channels, release campaigns) have their own guide:
`docs/SPACES.md` (data model `src/spaces/types.ts`, store `src/store/space.ts`, modules `src/spaces/modules/<id>/`).

## Folder map

| Path | What |
|---|---|
| `src/types.ts` | **The whole data model** (`ProjectData` and every entity). Read it first. |
| `src/store/project.ts` | Project store: `useProject`, `update`, `listOps`, `getProject`, `useFormatters`, undo/redo |
| `src/store/app.ts` | UI state: `navigate(moduleId, params)`, `useApp(s => s.params)`, `openPrint(docId, options)`, `readLS/writeLS` |
| `src/derived/script.ts` | `useScriptModel()`, `useScenes()`, `useSceneMap()`, `sceneLabel()`, `getScriptModel(project)` |
| `src/derived/project.ts` | `locationForScene`, `charactersForCast`, `castForCharacter`, `characterById`, `scheduleInfo`, `dayDates`, `sceneDayIndex`, `crewByDepartment` |
| `src/script-core/*` | screenplay schema, parsing, pagination, Fountain/FDX (owned by the Script module) |
| `src/ui/*` | UI kit (import from `@/ui`) |
| `src/lib/*` | `constants` (option lists, colours), `format`, `dates`, `sun` (sunrise/sunset), `csv`, `text`, `images`, `id` (`uid()`), `commands` |
| `src/backend` | `assetUrl(name)`, `importImageFile(file)`, `pickImages(multiple)`, `importDroppedImages(files)`, `importAssetBytes(bytes, ext)`, `exportCsv(fileName, rows, cols)`, `saveTextFile`, `saveBinaryFile`, `backend` |
| `src/print/*` | Print/PDF framework: `types.ts` (PrintDocDef), `components.tsx` (DocHeader, PTable, PSection, KV, Box, Photo, Check, Dot, PBadge, Pre), `printCss.ts` (pp- classes) |
| `src/modules/<id>/` | One folder per module: `index.tsx` (default export screen), `print.tsx` (`export const printDocs: PrintDocDef[]`), `sample.ts` (`seedSample`) |
| `src/sample/` | Sample project builder; `context.ts` exports `SAMPLE_SCENES`, `SAMPLE_ELEMENTS`, `SampleContext` |

## Rules for module work

1. **Only create/edit files inside your own module folder(s)** (`src/modules/<id>/…`). Do not edit shared files
   (`src/types.ts`, `src/ui`, `src/store`, `src/lib`, `src/print`, `src/derived`, `registry.ts`, other modules).
   If you truly need a shared change (a new optional field, a UI-kit fix), describe it precisely in your final report.
   Small module-local helpers/components go in your folder.
2. Do **not** run `npm install`, `vite build`, or start/stop dev servers. Type-check with `npx tsc --noEmit -p tsconfig.json`
   and fix every error in your files (ignore errors in other modules — someone else is working there).
3. Styles: create `src/modules/<id>/<id>.css`, import it in your `index.tsx`, prefix every class with your module id
   (e.g. `.sb-frame`, `.light-canvas`). Use only the CSS variables from `src/styles/app.css` (`--bg`, `--bg-elev`,
   `--panel`, `--border`, `--text`, `--text-2`, `--text-3`, `--accent`, `--accent-soft`, `--danger`, `--success`,
   `--warning`, `--radius`, `--shadow` …) so light and dark themes both work. Reuse existing global classes
   (`.module`, `.module-body`, `.split`, `.card`, `.btn`, `.table`, `.badge`, `.chip`, `.row`, `.col`, `.muted` …).
4. Quality bar: production-ready. Polished layout, empty states with a clear call to action, keyboard friendly
   (Enter to confirm, Esc to close, Delete to remove selected where it makes sense), confirm destructive actions
   with `confirmDialog`, toasts for exports. Everything editable inline where natural. No placeholder text like
   "TODO". Must not crash on missing/old data (all optional fields may be undefined; ids may point to deleted items).
5. Every printable thing gets a `PrintDocDef` in `print.tsx` and a print/export button in the module header
   (`<ExportMenu docs={[...]} csv={[...]} />`). Tables also get CSV export (`exportCsv`).

## Screen skeleton

```tsx
import './mymod.css';
import { Plus } from 'lucide-react';
import { ModuleHeader, Button, ExportMenu, EmptyState } from '@/ui';

export default function MyModule() {
  return (
    <div className="module">
      <ModuleHeader title="Gear & Equipment" subtitle="12 items · $3,450" icon={Camera}
        actions={<><ExportMenu docs={[{ id: 'gear-list', label: 'Gear list' }]} csv={[{ label: 'Gear (CSV)', onClick: exportGear }]} />
                 <Button variant="primary" icon={Plus} onClick={add}>Add item</Button></>} />
      <div className="module-body padded"> … </div>
    </div>
  );
}
```
Use `<Toolbar>` under the header for filters/search, `<UnderlineTabs>` for sub-pages, `.split > .pane-left / .pane-main / .pane-right` for list/detail layouts.

## Reading & writing data

```ts
const cast = useProject((p) => p.cast);                 // select stored slices only (stable references)
const ops = listOps<CastMember>((d) => d.cast, 'cast');   // CRUD for any array of {id}
ops.add({ id: uid('cast'), name: 'New actor', status: 'considering' });
ops.update(id, { phone });                              // coalesces typing into one undo step
ops.remove(id); ops.moveBefore(id, beforeId); ops.duplicate(id, () => uid('cast'));
update((d) => { (d.scenes[sid] ??= { id: sid }).synopsis = text; }, { coalesce: `scene:${sid}:synopsis` });
const fmt = useFormatters();  // fmt.date(iso) fmt.dateMedium fmt.dateLong fmt.time('07:30') fmt.money(n) fmt.eighths(n) fmt.minutes(n) fmt.seconds(n)
```
- Never mutate objects from the store outside `update()` (they are frozen).
- Derived lists (filters/sorts/joins) must be computed with `useMemo`.
- Global undo/redo (Ctrl+Z/Y) covers every `update()`; no extra work needed.
- IDs: `uid('prefix')` from `@/lib/id`.

### Scenes & script (read-only for modules)
`const model = useScriptModel();` → `model.scenes: SceneInfo[]` with `id, index, number, heading, intExt, set, time,
dayNight, stripKey, page, eighths, speaking, characterIds, elementIds, tagged, synopsis, firstAction, meta`.
`model.sceneById`, `model.sets`, `model.nameStats`, `model.pageCount`, `model.estMinutes`.
Per-scene editable data lives in `project.scenes[sceneId]` (`SceneMeta`). Characters are `project.characters`
(auto-created from the script's character cues; `Character.castId` links the actor). Strip colours:
`STRIP_COLORS[scene.stripKey]`. Breakdown categories & colours: `BREAKDOWN_CATEGORIES`, `CATEGORY_BY_ID`.

### Images
`<ImageDrop value={x.photo} onChange={(name) => ops.update(x.id, { photo: name })} aspect={3/4} />` handles click,
drag & drop and paste. Show stored images with `assetUrl(name)` / `<AssetImage name=… />` / `<Avatar name photo />`.
For canvas output: `importAssetBytes(pngBytes, 'png')` (see `canvasToPng` in `@/lib/images`).

### Navigation between modules
`navigate('script', { sceneId })`, `navigate('callsheets', { dayId })`. Read params with `useApp((s) => s.params)`
(re-read when `useApp((s) => s.navKey)` changes).

### Commands
`useCommand('find', () => { focusSearch(); return true; })` to handle Ctrl+F while your module is mounted.

## Printing (PDF + print)

```tsx
// src/modules/gear/print.tsx
export const printDocs: PrintDocDef[] = [{
  id: 'gear-list', title: 'Gear List', group: 'Budget & Gear', orientation: 'portrait',
  description: 'Equipment grouped by category with packing checkboxes',
  options: [{ key: 'showCosts', label: 'Show costs', type: 'boolean', default: true }],
  emptyReason: (p) => (p.gear.length ? false : 'No gear yet'),
  render: (ctx) => ({ body: <>
      <DocHeader ctx={ctx} title="Gear List" subtitle={`${ctx.project.gear.length} items`} />
      <PTable columns={[...]} rows={...} groupBy={(g) => g.category} />
    </> }),
}];
```
- `ctx`: `project`, `model` (ScriptModel), `options`, `paper`, `orientation`, `fmt`, `asset(name)` (absolute image URL), `today`.
- Default `mode: 'flow'`: the page size/margins, running header (project · doc title) and footer (date · Page X of Y)
  are automatic. Use `pp-avoid` to keep blocks together and `pp-break` / `pp-break-before` for page breaks.
- Print components are rendered with `renderToStaticMarkup` — **no hooks, no state, no event handlers, no CSS files**.
  Put document-specific CSS in `render(...).css` (prefix classes, sizes in pt/in). Colours must be literal (not CSS variables from the app).
- Return `orientation` in the output to switch per option; `group` must be one of the PrintDocDef groups.
- Open a preview from the UI with `openPrint('gear-list', { … options })` or `<ExportMenu docs=[…]>`.
- Images: `<img src={ctx.asset(name)}>` or `<Photo src={ctx.asset(name)} aspect={16/9} />`. Never use `loading="lazy"`.

## Sample data
`src/modules/<id>/sample.ts`: `export async function seedSample(p: ProjectData, ctx: SampleContext)` — mutate `p`
(plain object, not frozen). Core data already exists when your seeder runs: script (scenes `SAMPLE_SCENES.roof1/stairs/roof2/edit`,
elements `SAMPLE_ELEMENTS.*`), characters MAYA/JUNE/LEO/SAM (with cast), 12 crew, 4 contacts, 3 locations,
2 shoot days (2026-11-07 and 2026-11-08), budget/gear/tasks/post templates. Add your module's demo data so every
screen and every printable document looks great in the sample. `ctx.addSvg(svgString)` stores an SVG image asset
(handy for storyboard sketches / placeholder photos) and returns its asset name.

## Browser testing (optional)
The dev server is running at http://localhost:5173. If you use the browser tools: open **your own tab**
(`tabs_create`), only ever pass your own `tabId`, never call `preview_start`, `preview_stop` or `resize_window`,
and create your own sample project from the library ("Add sample project") so you don't collide with others.

## AI agent tools (MCP)
`electron/mcp.cjs` is a stateless MCP server (Streamable HTTP, JSON responses) on `127.0.0.1:39217/mcp`, started with
the app (`config.mcp` in `%APPDATA%\PrePro Studio\config.json`; `PREPRO_MCP_PORT` overrides the port).
`electron/mcp-bridge.cjs` is a stdio ⇄ HTTP bridge for command-style clients (Claude Desktop), shipped in
`resources/` and run with the app's exe + `ELECTRON_RUN_AS_NODE=1`; it answers the handshake from
`mcp-describe.json` and starts the app on the first tool call when it is closed.

Tools live in the renderer (`src/agent/`, lazily loaded) so they use the same store as the UI:
- `collections.ts` describes every list (path, fields, enums, refs, defaults). New list in `ProjectData`? Add it there
  and the generic tools (`describe_data`, `list_items`, `add_items`, `update_items`, `delete_items`, `move_items`)
  cover it, including reference clean-up on delete.
- `singletons.ts` lists single values for `get_fields` / `set_fields`.
- `tools/*.ts` hold the specialised tools (script, mind, images, lighting, schedule, call sheets, reports, PDFs, app).
- Each call is validated against its JSON schema and wrapped in **one undo step** (`asOneStep`); screenplay edits are
  journalled so the `undo` tool can restore the text too. The editor applies outside doc changes as one transaction,
  so Ctrl+Z in the script editor reverts an agent's script edit.
- `npm run mcp-test` (after `npm run build`) starts an isolated instance (`PREPRO_DATA_DIR`) and exercises every tool
  with the official MCP SDK client over HTTP and the stdio bridge.
