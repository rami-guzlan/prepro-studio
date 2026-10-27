# PrePro Studio

A fully local pre-production and post-production planning workspace for video projects:
short films, commercials, corporate and training videos, social content, music videos and documentaries.
Write the script, build storyboards and shot lists, draw lighting plots, manage cast, crew and locations,
break down the script, schedule the shoot, send call sheets, plan gear, budget and post. Run your marketing in
**Marketing Spaces**: strategy, ideas, multiformat content from first draft to published post, a visual content
calendar and results. Run the business side in **Business Management**, keep your money in a PIN-locked
**Personal Finances** space and your health in **Training**. Then **print or export everything as PDF**.

It runs two ways, from the same code:

- **Desktop app** (Windows, Electron): fully local. Everything is a normal folder on your computer and nothing goes
  to the cloud.
- **Hosted version** (Google Cloud Run, self-hosted in your own Google Cloud project): the same app in any browser,
  on a laptop or a phone, with sign-in, per-person access, **several people editing at once with live updates**, and
  an MCP endpoint so Claude and other AI agents can work in it, even when nobody has it open. See
  [Hosted version](#hosted-version-google-cloud) below and [docs/CLOUD.md](docs/CLOUD.md).

The library has four tabs: **Productions** · **Spaces ▾** (Marketing Spaces / Business Management) ·
**Personal Finances** · **Training**.

---

## Running it

Requirements: [Node.js](https://nodejs.org) 20 or newer. Built and tested on Windows 11; the desktop app is
Electron, so `npm run start` should also work on macOS and Linux (untested).

### Build the desktop app (Windows)
```
git clone https://github.com/rami-guzlan/prepro-studio.git
cd prepro-studio
npm install
npm run package
```
Then double-click **`release\PrePro Studio-win32-x64\PrePro Studio.exe`**.
You can pin it to the taskbar or create a desktop shortcut (right-click the .exe → *Send to → Desktop*).

### Developer commands
```
npm install
npm run start       # build the UI and launch the desktop app
npm run package     # rebuild the standalone Windows app into release/
npm run dev         # browser-only UI at http://localhost:5173 (data stored in the browser)
npm run selftest    # automated check: renders every document to PDF into %TEMP%\prepro-selftest
npm run mcp-test    # drives every AI-agent (MCP) tool through the official MCP client, HTTP + stdio bridge
```

### Run the hosted version locally
```
npm run build
node server/index.mjs          # http://localhost:8080, data in ./cloud-data (STORAGE=disk)
node scripts/cloud-test.mjs    # end-to-end checks against a running server (see docs/CLOUD.md)
```
Sign-in uses Google Identity Platform even locally, so set the environment described in [docs/CLOUD.md](docs/CLOUD.md).

## Where your data lives
Desktop app (the hosted version keeps the same documents in a Cloud Storage bucket instead, see [docs/CLOUD.md](docs/CLOUD.md)):
- Projects: `Documents\PrePro Studio Projects\<project-name>__<id>\`
  - `project.json` — all project data
  - `assets\` — images (storyboard frames, headshots, location photos, logos)
  - `backups\` — automatic snapshots (every 10 minutes while you work, last 40 kept)
- Change the folder from the Project Library (bottom of the screen).
- **Export project archive (.zip)** to back up or move a project to another computer, and **Import archive** to bring it back.
- Saving is automatic. *Project Settings → Automatic backups* restores an earlier snapshot.
- Deleting a project moves its folder to the Windows Recycle Bin.
- Spaces live next to them: `Marketing Spaces\`, `Businesses\`, `Personal Finances\` and `Training\` (each `<name>__<id>\space.json`
  + `assets\` + `backups\`).
- **Personal Finances are locked with a PIN** (stored only as a salted hash in the app's settings, never in this repository).
  They unlock for the session and lock again after 15 idle minutes or when the app closes. It is a screen lock only —
  connected AI agents can use them either way, and the files themselves are not encrypted.

## Demo project
*The Last Take* is a complete sample production with every module filled in (script, mind dump, storyboard, lighting
plots, schedule, call sheets, budget, post…). It sits on the home screen next to your projects (the **Demo** card);
the Marketing Spaces tab has a demo space too (*The Last Take — release campaign*). Edit them freely.

- **Remove a demo** from the home screen with its card menu (⋯ → *Remove from home screen* or *Delete demo*).
- The demos are **always in the Help menu**: **Help → Open Demo Project / Open Demo Marketing Space**,
  **Help → Reset Demo …** for a fresh copy, and **Help → Show Demos on the Home Screen** to bring the cards back.

## New projects
**New project** asks what you're making — short, feature, commercial, music video, **trailer / teaser / promo**,
corporate, training, social, documentary, **mini-doc**, interview, episodic — and how to start:
- **Template** pre-fills a checklist, post schedule, deliverables, budget lines and gear for that type.
  Trailers get a beat structure (hook → setup → escalation → title → button → end card) and mini-docs a story
  structure (cold open → subject → challenge → journey → resolution) in the A/V script.
- **Blank** starts completely empty. An empty A/V script can still pull in a trailer or mini-doc structure later.
- **Based on an existing project** copies branding, cast & characters, crew & contacts and locations (with photos) —
  ideal for a trailer or behind-the-scenes mini-doc of a film you already planned.

Printable **blank templates** (Print & Export → Blank Templates): A/V script, trailer beat sheet, interview sheet,
shot list and storyboard.

## Modules

| Area | Module | What you can do |
|---|---|---|
| Overview | **Overview** | Dashboard, key info, readiness checklist, timeline, notes. Print a project one-sheet. |
| | **Tasks & Milestones** | Pre-production checklist (kanban or list), milestones. |
| Writing | **Script** | Screenplay editor (Final Draft-style) or two-column **A/V script**; title page; index cards; scene navigator; notes; breakdown tagging; find & replace. |
| Visuals | **Storyboard** | Frames per scene from imported/pasted images, sketch & annotate tool, animatic player, export frames as PNGs for Miro. |
| | **Shot List** | Every shot with size, angle, movement, lens, gear, timing and status. |
| | **Lighting Diagrams** | Top-down lighting & camera plots with a fixture library, beams, legend and gear export. |
| People | **Cast & Characters** | Characters from the script, actors, headshots, sizes, contacts, releases. |
| | **Crew** | Crew by department, rates, call times, deal memos. |
| | **Contacts & Vendors** | Clients, rental houses, vendors. |
| Production | **Script Breakdown** | Industry breakdown sheets per scene (cast, extras, props, wardrobe, vehicles, SFX/VFX…). |
| | **Props, Wardrobe & Elements** | Everything from the breakdown with status, source, cost, photos. |
| | **Locations & Sets** | Locations with photos, permits, parking, power, hospital; map script sets to real locations. |
| | **Shooting Schedule** | Drag-and-drop stripboard, shoot days, calendar, Day Out of Days. |
| | **Call Sheets** | Daily call sheets built from the schedule (sunrise/sunset calculated offline). |
| | **Gear & Equipment** | Equipment lists, rentals, packing checklist. |
| | **Budget** | Top sheet, line items, fringes, contingency, actuals. |
| Post | **Post-Production** | Post schedule (Gantt), deliverables specs, graphics & lower thirds, music cue sheet, VFX, ADR, edit notes, media workflow. |
| Output | **Print & Export** | Every document in one place, plus a merged **Production Book** PDF. |

## Marketing Spaces
Next to **Productions** (one film or video with its script, team, shoot and post), **Marketing Spaces** hold ongoing
marketing for a goal: your personal brand, a YouTube channel, a film's release campaign. **New marketing space** (Ctrl+Shift+M) asks for the kind of space and starts from a template (channels
with cadences, content pillars, goals, campaign phases with dated milestones, starter content ideas) or blank, and can
link production projects (a release campaign links its film and uses its poster as the cover).

| Module | What you can do |
|---|---|
| **Overview** | What's next (posts in the next 14 days), pipeline, goals progress, active campaigns, channel cadence this week, overdue / at-risk content, getting-started checklist. |
| **Strategy** | Goals (metric, baseline → target), audience personas, content pillars (target vs actual share; click a pillar to see and edit all its content — stage, pillar, new pieces — or sort the pieces without a pillar), positioning, value proposition, voice, key messages, tactics, and a shared **Calculator** (see Business Management). |
| **Campaigns & Milestones** | Roadmap timeline of campaign phases, milestones and posts; each campaign's objective, dates, channels, CTA, content and **resources** (the downloadable gated resources, sequence maps, template docs, playbooks and one-pagers it uses — upload or drop files, open them in a viewer, download them). |
| **Ideas** | The same brainstorm boards as the script's Mind Dump (one board per idea batch or category); turn notes into content ideas (short video, long-form, carousel, thread, newsletter …) or milestones. |
| **Content** | Every piece from **idea → writing → planning → shooting → editing → ready → published** as a kanban board or list. The content editor has a brief (concept, hook, CTA, audience, goals), a script / copy editor (structure templates, two-column A/V, word and character counts vs platform limits), production (shoot day, shot list, checklist, references), publishing (one post per channel: date, time, title, caption, hashtags, link, status) and results. Repurpose a piece into cut-downs. |
| **Production** | Batch shoot days: several pieces filmed together, combined shot list, run of show. |
| **Calendar** | Month / week / agenda views of posts (coloured by channel), shoot days, milestones and campaigns; drag posts to reschedule, drag unscheduled content onto a day, weekly cadence per channel. |
| **Channels** | Platforms and handles, cadence targets, best times, followers, per-channel stats and platform limits. |
| **Results** | Views, engagement, clicks, followers gained by period, channel, format and pillar; top posts; quick results entry. |
| **People & Brands** | CRM-style sheets: relationships, leads, brand deals, collaborators & guests, press — or your own. Typed columns (single / multi select with colours, money with totals, dates with follow-up reminders, email, links, checkbox, campaign), a spreadsheet and a pipeline board per sheet, CSV import / export. |
| **Brand Kit & Assets** | Logos, colours, fonts, images, templates, music and links. Links & documents also holds every campaign's downloadable resources, grouped per campaign (files are stored in the space folder). The **Design system** tab turns the kit into a design system agents can follow: themes and semantic tokens, palettes with roles and CSS variables, type styles, spacing and shape tokens, components and layouts, plus art direction for generated imagery (intent, imagery, composition, colour behaviour, treatments, rules by level, annotated references, formats, briefs, review checklist). **Import** a Claude Design design-system zip (or README / tokens.css / tokens.json / images / fonts); **export** a bundle (README guide, tokens, logos, fonts, briefs) for Claude Design, image models and coding agents. |
| **Linked Projects** | Productions this space promotes, with their linked content and campaigns. |
| **Print & Export** | One-sheet, strategy brief, campaign plan, content briefs, content plan, calendar, posting schedule, shoot plan, results report, brand kit, design system book, ideas board, People & Brands sheets — or one merged **marketing plan** PDF. |

Spaces are saved in `Documents\PrePro Studio Projects\Marketing Spaces\<name>__<id>\space.json` (+ `assets\`,
`backups\`). **Help → Open Demo Marketing Space** opens *The Last Take — Release Campaign* with every screen filled in.
AI agents connected over MCP can open, create and fill spaces too (content with posts, the calendar, strategy, ideas,
reports and PDFs).

## Business Management
One space per side hustle, business you're part of or income stream (Spaces ▾ → Business Management → **New business**).
Link the Marketing Spaces and Productions it runs (Work → Marketing & Productions). Inside:
- **Overview** — income first (month / year, profit, receivables), then the sales pipeline and open projects, goals and
  growth initiatives, due dates and the 12-month chart.
- **Strategy** opens with **Our strategy**, the big picture written in your own words in large, conversational text,
  then mission, positioning, offers and prices, goals with live progress, priorities, SWOT, competitors and a shared
  **Calculator**: named lines with numbers or formulas that use each other (`Monthly revenue = Day rate * Shoots per
  month`), shown as numbers, money or percentages. In the hosted version everyone in the space sees it change live.
- **Ideas**: the same brainstorm boards as Marketing Spaces; turn notes into growth initiatives, priorities for the
  quarter, offers, sales leads or workflows to write.
- **Growth** opens on a **dashboard** of every initiative (Now / Up next / Finished): KPI progress from baseline to
  target, steps, budget used, due date and the last check-in, flagged when one is overdue. Also a status board and an
  impact / effort matrix; each initiative has check-ins, budget vs spend and steps.
- **Sales** — a pipeline board from lead to won (winning a deal creates the project), Sales Enablement (pitch decks, case
  studies, pricing, scripts and email templates to copy), Testimonials (with permission to use them) and Portfolio & Reels.
- **Work** — Projects with tasks and milestones, fee, invoices, money received, costs, contractors and legal documents
  linked together; Marketing & Productions.
- **Money / People / Legal** — invoices with PDF, income streams, expenses with receipts, time tracking, clients,
  contractors and the pay you agreed, legal documents generated from templates (contractor agreement, NDA, statement of
  work, services, revenue share, release, sponsorship …).
- **Library** — Workflows & SOPs you can run as checklists, and Resources (templates, brand assets, files and links).
Every section exports to PDF (and CSV where it is a list) from its Print / Export menu and from Print & Export.
Generated documents are templates, not legal advice: have a lawyer review them before signing.

## Personal Finances
Import debit and credit card statements (CSV, OFX/QFX, PDF), categorise transactions with rules, and get a dashboard,
budgets, goals, a debt payoff and savings planner, and insights. Connected AI agents can import statements they find in your
email (with their own email connector), report on spending and save advice (the PIN only locks your screen).
Not financial advice.

## Training
**Ramp up** is a gentle, game-like way into the gym for anyone finding it hard to start. A four-question setup builds
an eight-week ramp in four stages (*Show up*, *Make it a habit*, *Build*, *Own it*), at home or in the gym. A stage moves
on only after weeks where you hit the target, so a missed week never pushes you into harder work. Today's mission lists
the exact moves, with a 10-minute bad-day version that still counts. Points, levels with a reward you choose, a
forgiving weekly streak, badges and "what unlocks next" keep it fun; a stage can go straight into your workout Program.
Any connected AI can coach you through it with the `training_ramp` tool (copy the prompt on the page).

Also: goals, a macro calculator, a meal library with a weekly meal plan and generated grocery lists, a workout program with
session logging and progress charts, body metrics, daily check-ins, and daily progress photos with a timelapse player
(adjustable speed, export as video). Log conversationally through any connected AI; the `studio_context` tool lets it coach
holistically across work, money and training. Not medical advice.

## Writing the script (Final Draft-style)

| Key | Action |
|---|---|
| **Enter** | Next element (Scene Heading → Action, Character → Dialogue, Dialogue → Action, Transition → Scene Heading…) |
| **Tab** | On an empty line: change element (Action → Character, Character → Transition, Dialogue → Parenthetical). After text: start the next element (Character → Parenthetical, Dialogue → Parenthetical, Action → Character). |
| **Shift+Tab** | Previous element |
| **Ctrl+1 … Ctrl+7, Ctrl+0** | Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, General |
| **Shift+Enter** | Line break inside an element |
| **Ctrl+B / I / U** | Bold / italic / underline |
| **Ctrl+D** | Dual dialogue (on the second speaker) |
| **Ctrl+F / Ctrl+H** | Find / replace |
| **Ctrl+G** | Go to scene |
| **Ctrl+Alt+M** | Add a script note |
| **Ctrl+Alt+T** | Tag the selection for the breakdown |
| **Ctrl+P** | Print / PDF |

- Corporate, training and documentary projects can use the **two-column A/V script** instead (Script → *A/V Script*):
  picture on the left, narration/dialogue on the right, durations suggested from word count, running time vs. target,
  thumbnails from your storyboard. **Ctrl+Enter** adds a row, **Alt+↑/↓** moves it, **Ctrl+Shift+S** adds a segment band.
- **SmartType** suggests INT./EXT., locations you've used, times of day, character names, extensions (V.O., O.S.,
  CONT'D) and transitions. **Enter** or **Tab** accepts, **Esc** dismisses.
- **Smart formatting**: typing `int.` + space at the start of an action line makes it a scene heading;
  typing an all-caps line ending in `TO:` makes it a transition.
- The editor shows **real pages** (page breaks, (MORE)/(CONT'D), automatic (CONT'D)), identical to the PDF.
- The Tab/Enter flow is configurable per element in **Project Settings → Element flow**, like *Final Draft › Elements*.
- Import and export **Final Draft (.fdx)**, **Fountain** and plain text.
- Tag props, wardrobe, cast, vehicles and more from the script (select text → *Tag*, or right-click). Tags feed the breakdown
  sheets, elements lists, schedule and call sheets automatically.

## Mind Dump (Script → Mind Dump)
Get your thoughts out first, structure them later:
- **Boards**: keep each batch or category of ideas on its own board (e.g. *Story*, *Look*, *BTS mini-doc*). Every board
  has its own free writing, notes, groups and arrows, and remembers its Write / Split / Board layout. **+ New board**
  adds one; double-click a tab to rename it; right-click (or ⋯) to recolour, duplicate, reorder or delete it.
  Right-click notes → **Move to board** to re-file ideas.
- **Write** freely in the brain-dump panel, or type a **quick thought** and press Enter to pin it on the board.
- **Make notes** turns every line (or paragraph) into a sticky note.
- On the **board**: double-click to add a note, drag to move, drag on empty space to select several, colour them,
  **Group** them into titled frames, and drag the dot on a note's right edge onto another note to draw an arrow.
  **Tidy** arranges notes in a grid or in columns by colour. Scroll to move around, Ctrl+scroll to zoom.
- **Turn into** sends notes to the script (new scenes, with the note as the index-card synopsis, or action),
  to the A/V script, the shot list or the task list. Used notes get a green tick.
- **Print** gives each board as a picture, an outline of every note by group, and your free-written text
  (the **Boards** option picks which boards; empty prints all of them).

## Printing & PDFs
Every module has a **Print / Export** button. The preview shows the exact PDF. You can then:
- **Export PDF**: choose where to save. The page size (US Letter or A4) comes from Project Settings and can be changed per export.
- **Print…**: opens the PDF in a print-ready window. Press **Ctrl+P** there for your printer.
- Optional for every document: project logo, *CONFIDENTIAL* footer, a watermark (e.g. *DRAFT*), or black-and-white images.
- **Print & Export → Production Book**: one merged PDF with any documents you choose, in your order.
- Spreadsheets: most tables export to **CSV** (opens in Excel / Google Sheets).

## Working with an AI agent (MCP)
While PrePro Studio is open it runs a local **MCP server** (Model Context Protocol), so Claude, or any AI tool that
supports MCP, can plan shoots with you conversationally. The agent can read and edit everything you can: the script
(as Fountain), Mind Dump, storyboard frames (including SVG sketches it draws), shots, lighting plots, cast, crew,
contacts, locations, breakdown tags, schedule, call sheets, gear, budget, post, tasks and settings. It can also export
PDFs and look at page previews. In a Marketing Space, agents read the brand's design system with the `design_system`
tool before they design or generate anything visual, and can import or export design-system files. Changes appear live in the window, are saved automatically, and **Ctrl+Z** undoes them
(each agent action is one undo step). The sidebar shows when an agent is connected or working.

**Help → Connect an AI Agent (MCP)…** (also in the library and the sidebar) shows the server status and setup:
- **Claude Desktop:** click **Add PrePro Studio to Claude Desktop**, then quit Claude from the tray and reopen it.
  If PrePro Studio is closed when Claude needs it, it starts automatically.
- **Claude Code:** run once in a terminal:
  ```
  claude mcp add --transport http --scope user prepro-studio http://127.0.0.1:39217/mcp
  ```
- **Other MCP clients** (Cursor, VS Code, Windsurf …): server URL `http://127.0.0.1:39217/mcp` (Streamable HTTP),
  or the stdio command shown in the dialog.

Things to ask: *"Open my short film project and break down the script"*, *"Brainstorm a cold open on the Mind Dump"*,
*"Write scene 4 where June finds the camera"*, *"Plan a 2-day shoot starting Nov 7 and fill the call sheets"*,
*"Shot-list scene 1 and sketch storyboard frames"*, *"Light the rooftop scene for magic hour"*,
*"Export the production book as PDF"*, *"Import this Claude Design zip into the brand kit and write a brief for the
premiere poster"*. Built-in prompts: *plan the shoot*, *break down the script*, *brainstorm*,
*shot list & storyboard*.

The server only accepts connections from this computer (127.0.0.1) and refuses requests from web pages. Your AI tool
sends what it reads to its own AI service as usual. You can turn the server off or change the port in the dialog.

**Hosted version:** the MCP endpoint is `https://<your address>/mcp`. In Claude, add it as a **custom connector**
(Settings → Connectors); Claude signs in through PrePro Studio and you press Allow (OAuth 2.1 with PKCE). Claude Code,
Cursor and other tools use a personal token from **Connect an AI agent**. An agent acts as the person who connected it
and sees only what they can see. Tools run in that person's open tab, so changes appear live; when nobody has the app
open, the server opens a hidden one for them (a headless Chromium) so agents keep working.

## Hosted version (Google Cloud)
The same app served from Google Cloud Run in your own Google Cloud project, so you control the account, the data and
the cost (it scales to zero; a small team typically stays within Google's free tier).

- **Sign-in and access.** Accounts live in Google Identity Platform with self sign-up turned off: the owner invites
  people from **Team and access** with a one-time link. The owner sees all five tabs; everyone else sees at most
  Productions, Marketing Spaces and Business Management, each with everything or only chosen items.
  **Personal Finances and Training are owner only**, enforced by the server on every request, not just hidden.
- **Live editing.** Everyone in a Production or Space sees each other's changes within a second or two, plus who
  else is there. Edits merge item by item and, inside one field, letter by letter, so two people can type in the
  same text at the same time (screenplay included) without losing anything or their cursor jumping. Tabs reconnect
  and catch up on their own after a laptop sleeps or the network drops.
- **AI agents** connect over MCP as described above.
- **Data** lives in a private Cloud Storage bucket with versioning; deleted items go to a trash folder, never erased by
  the app. Exports to PDF use the browser's print dialog.

Setting it up from scratch (about 20 minutes with the `gcloud` CLI), deploying updates, adding people and testing are
all in [docs/CLOUD.md](docs/CLOUD.md). Deploying is one command: `powershell -File scripts/deploy-cloud.ps1`.

## Working with Miro
PrePro Studio is fully local. To share with your team on Miro:
- **Storyboard → Export frames for Miro**: a .zip of numbered PNG frames you can drop onto a Miro board.
- Export any document as PDF and drag it onto Miro. Miro shows every page.
- Images exported from Miro (PNG/JPG) can be dropped straight onto storyboard frames, locations or headshots.
