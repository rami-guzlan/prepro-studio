# Marketing Spaces — developer guide

Marketing Spaces are the second kind of workspace next to Projects. A **Project** is one production (a film or
video with script, team, shoot, post). A **Space** is ongoing marketing: a personal brand, a YouTube channel, a
film's release campaign. It holds the strategy, an ideas board, **multiformat content from idea to published**
(videos, shorts, carousels, threads, newsletters, articles …), a visual calendar, batch shoot days, campaigns &
milestones, a brand kit, results and optional links to Projects.

Read `docs/DEVELOPING.md` first (UI kit, CSS variables, print framework, quality bar). Everything there applies;
the differences for spaces are below.

## Files

| Path | What |
|---|---|
| `src/spaces/types.ts` | **The space data model** (`SpaceData`, `ContentPiece`, `ContentPost`, `Channel`, `Campaign` …). Read it first. |
| `src/spaces/constants.ts` | `SPACE_TYPES`, `PLATFORMS` (+ colours, caption/title limits), `FORMATS` (+ icons, video/text flags), `STAGES`, `POST_STATUSES`, `GOAL_STATUSES`, `CAMPAIGN_STATUSES`, `TACTIC_STATUSES`, `SHOT_KINDS`, `ASSET_KINDS`, `METRICS`, `PILLAR_COLORS`, lookups `PLATFORM_BY_ID`, `FORMAT_BY_ID`, `STAGE_BY_ID` |
| `src/spaces/defaults.ts` | factories: `makeContent`, `makePost`, `makeShot`, `makeChecklistItem`, `makeChannel`, `makeShoot`, `makeGoal`, `makeCampaign`, `makePillar`, `defaultChecklist(format)`; `createSpace`, `normalizeSpace` |
| `src/spaces/derive.ts` | pure helpers: `channelColor`, `channelById`, `contentById`, `allPosts` (→ `PostRef {post, content, channel, sortKey}`), `postsInRange`, `upcomingPosts`, `overduePosts`, `atRiskContent`, `firstPostDate`, `countByStage`, `sumMetrics`, `engagement`, `goalProgress`, `weekStart`, `cadenceForWeek`, `isFullyPublished` |
| `src/spaces/ui.ts` | `openContent(id, tab?)` opens the content editor over any screen (tabs `brief` `write` `produce` `publish` `results`), `closeContent()`, `useSpaceUI`, `useProjectList()` (production projects for linking) |
| `src/spaces/mind.ts` | connects the shared Mind Dump board to the space; `notesToContent(notes, {format, stage})` |
| `src/spaces/crm.ts` | People & Brands model: `CRM_TEMPLATES`, `CRM_COLUMN_TYPES`, `makeSheet` / `makeColumn` / `makeRow`, `displayValue`, `parseValue` (labels → option ids, dates, money …), `convertColumn`, `dueRows`, CSV `sheetFromCsv` / `sheetCsvColumns` |
| `src/spaces/modules/assets/resources.tsx` | downloadable campaign resources: `uploadResources` / `pickResources` / `dropResources`, `downloadResource`, `openResourceExternally`, `ResourceModal` (viewer: PDF, image, text, media), `ResourceList`, `useFileDrop` |
| `src/store/space.ts` | the space store (below) |
| `src/spaces/registry.ts` | sidebar modules; each screen is `src/spaces/modules/<id>/index.tsx` (default export) |
| `src/spaces/print/*` | `SpacePrintDocDef`, `SpacePrintContext`, `SpaceDocHeader`, registry |

## Reading & writing data

```ts
import { useSpace, updateSpace, spaceListOps, getSpace, useSpaceFormatters } from '@/store/space';
const content = useSpace((s) => s.content);             // select stored slices only (stable references)
const channels = useSpace((s) => s.channels);
const ops = spaceListOps<Channel>((d) => d.channels, 'channels');
ops.add(makeChannel('instagram', { name: 'Instagram' })); ops.update(id, { handle }); ops.remove(id);
updateSpace((d) => { const c = d.content.find((x) => x.id === id); if (c) c.stage = 'editing'; });
updateSpace((d) => { ... }, { coalesce: `content:${id}:script` });   // typing in a field → one undo step
const fmt = useSpaceFormatters();   // fmt.date(iso) fmt.dateMedium fmt.time('18:00') fmt.money(n) …
```
- Never mutate store objects outside `updateSpace()` (they are frozen). Compute filtered / joined lists in `useMemo`.
- Ctrl+Z / Ctrl+Y undo every `updateSpace()`; autosave is automatic.
- IDs: `uid('prefix')` from `@/lib/id` (factories already do it).
- Images: `<ImageDrop value={x.image} onChange={(name) => …} aspect={16/9} />` and `assetUrl(name)` /
  `<AssetImage name=… />` work exactly like in projects (assets are stored in the space folder).
- Dates `YYYY-MM-DD` (`todayISO`, `addDays`, `parseISODate`, `diffDays` in `@/lib/dates`), times `HH:MM`.
- Navigation: `navigateSpace('calendar', { date })`, read params with `useApp((s) => s.params)` (re-read on `navKey`).
  Content pieces open with `openContent(id, 'publish')` — never build a second content editor.
- Production projects: `useProjectList()` → `ProjectSummary[]` (id, title, poster, status, projectType).
  Open one with `openProjectById(id)` from `@/shell/projectActions` (switches the app to that project).
- Toasts `toast()`, confirmations `confirmDialog()` and context menus `openContextMenu()` come from `@/ui`.

## Content model in one minute
- `ContentPiece` = the creative unit (a reel, a trailer, a newsletter). `stage`: idea → writing → planning →
  production (shooting) → editing → ready → published. `format` decides the editor: `FORMAT_BY_ID[f].video`
  (script + shots), `.audio`, `.text` (copy).
- `posts: ContentPost[]` = where & when it goes out: one per channel, with `date`, `time`, `status`
  (draft / scheduled / published / skipped), platform `title`, `caption`, `hashtags`, `url` and `metrics`.
  **The calendar shows posts.** A piece with no posts (or undated posts) is "unscheduled".
- `shootId` links a piece to a `ShootSession` (a batch filming day with several pieces); `shots` is the piece's
  own shot list; `checklist` its to-dos (`defaultChecklist(format)` on creation).
- `pillarId` / `campaignId` / `goalIds` / `personaId` / `projectId` / `sourceId` (repurposed from) are optional links.
- Channel colour: `channelColor(channel)`; stage colour: `STAGE_BY_ID[stage].color`; pillar colour: `pillar.color`.

## Rules for module work
1. Only create / edit files inside your own folder(s) `src/spaces/modules/<id>/`. Do not edit shared files
   (`src/spaces/*.ts`, `src/store`, `src/ui`, `src/shell`, other modules). If you truly need a shared change,
   describe it precisely in your final report (small module-local helpers belong in your folder).
2. Do not run `npm install`, `vite build`, dev servers or Electron. Type-check with
   `npx tsc --noEmit -p tsconfig.json` and fix every error in your files (ignore errors in other modules —
   others are working there in parallel).
3. CSS: `src/spaces/modules/<id>/<id>.css`, imported in your `index.tsx`; prefix every class with `sp-<id>-`
   (e.g. `.sp-calendar-day`). Only app CSS variables (`--bg`, `--bg-elev`, `--panel`, `--border`, `--text`,
   `--text-2`, `--text-3`, `--accent`, `--accent-soft`, `--danger`, `--success`, `--warning`, `--radius`, `--shadow` …)
   so light and dark themes work. Reuse global classes (`.module`, `.module-body`, `.padded`, `.split`, `.card`,
   `.row`, `.col`, `.muted`, `.small`, `.table` …) and the UI kit (`ModuleHeader`, `Toolbar`, `Tabs`,
   `UnderlineTabs`, `Button`, `IconButton`, `Menu`, `Input`, `Textarea`, `NumberInput`, `Select`, `Combo`,
   `MultiSelect`, `DateInput`, `TimeInput`, `Checkbox`, `Switch`, `ColorPicker`, `Field`, `FormGrid`, `Badge`,
   `StatusBadge`, `Card`, `Stat`, `Progress`, `EmptyState`, `ImageDrop`, `AssetImage`, `Avatar`, `Modal`,
   `ExportMenu`, `DataTable`, `SearchInput` — look at `src/ui/*` and existing project modules for usage).
4. Quality bar = production-ready, same as the project modules: polished layout, clear empty states with a call to
   action (a blank space has no channels, pillars or content!), keyboard friendly (Enter confirms, Esc closes,
   Delete removes selection where natural), confirm destructive actions, inline editing, no "TODO" text, never
   crash on missing data (every optional field may be undefined; ids may point to deleted items).
5. Content creators batch work: favour fast capture (quick-add inputs, keyboard), drag & drop, and seeing
   everything at a glance (colour by channel / stage / pillar). The calendar and content board are the heart.
6. Printables: add `SpacePrintDocDef`s to your module's `print.tsx` (`export const spacePrintDocs`), ids start with
   `space-`. Render like project docs (`@/print/components`: `PSection`, `PTable`, `KV`, `Box`, `Photo`, `Check`,
   `Dot`, `PBadge`, `Pre`) but use `SpaceDocHeader` from `@/spaces/print/components` and `ctx.space`, `ctx.fmt`,
   `ctx.asset(name)`, `ctx.today`, `ctx.todayISO`. No hooks / state / handlers in print components; literal colours;
   doc CSS in `render(...).css` with prefixed classes. Put a print / export button in your module header:
   `<Button icon={Printer} onClick={() => openPrint('space-…', { …options })}>` (`openPrint` from `@/store/app`).
7. Never call the project store (`@/store/project`) from space modules.

## Campaign resources
- A resource is a `BrandAsset` with `kind: 'resource'` (or any links-section asset with an uploaded `file`): `file`
  (stored asset name), `fileName`, `fileSize`, `resourceType` (`RESOURCE_TYPES`), `gated`, `url`, and `campaignId`.
- Brand Kit → Links & documents shows general items, then one collapsible group per campaign. The campaign detail
  shows the same assets in "Resources in this campaign". Both use `ResourceList` + `ResourceModal`.
- Deleting a campaign keeps its resources (their `campaignId` is cleared). Starter templates (`campaign`, `event`)
  create placeholder resources per campaign; the demo space has real files (PDFs made with pdf-lib, Markdown).

## People & Brands
- `space.crm: CrmSheet[]`; a sheet has `columns: CrmColumn[]` (`type`: text, longtext, select, multi, number, money,
  date, email, phone, url, checkbox, campaign; select / multi have `options` with stable ids) and `rows: CrmRow[]`
  with `values: { [columnId]: value }` (option ids for selects, campaign id for campaign columns, ISO dates).
- Edits go through `src/spaces/modules/people/ops.ts` (one undo step each). The board groups by `boardColumnId`
  (a single-select column). Follow-up / due dates (`isFollowUpColumn`) feed `dueRows` (tab badge, subtitle, print).
- Agents: `crm_read`, `crm_sheet`, `crm_rows` (values keyed by column name) and `add_resource` (src/agent/tools/crm.ts).
