# Hosted version (Google Cloud)

The same app, served from Cloud Run, with sign-in, per-person access, live
editing for several people at once, and an MCP endpoint for AI agents. The
desktop app is unchanged and keeps its own local data.

Address: `https://prepro-studio-<project number>.us-east1.run.app`. Below, `<project>` is your Google Cloud project ID.

## How it fits together

| Piece | What it does |
|---|---|
| Cloud Run service `prepro-studio` | `server/index.mjs`: serves `dist/`, the documents API, the Team and Connect pages, OAuth and `/mcp` |
| Cloud Storage bucket `<project>-data` | Productions and Spaces (`docs/<id>/doc.json`, `assets/`, `backups/`), `_system/*.json`, deleted items in `_trash/`. Versioning on; old versions removed after 30 days |
| Identity Platform | Accounts and passwords. Self sign-up is off; people join only by invite |
| Secret Manager | `prepro-identity-api-key` (sign-in API key, server only), `prepro-session-secret` |
| Service account `prepro-run@…` | Object Admin on the data bucket only, Identity Toolkit Admin, Service Usage Consumer, and access to the two secrets |
| Budget | $10 a month alert at 50 / 90 / 100 % |

## Who sees what

- The owner (`OWNER_EMAIL`, set at deploy time) sees all five tabs and everything in them, and manages people on **Team and access** (`/team`).
- Everyone else sees at most **Productions, Marketing Spaces and Business Management**, each either everything in it or only chosen items. Things they create are added to their list.
- **Personal Finances and Training are owner only.** The server enforces this on every request (lists, open, save, files, backups, create), and a save can never change a space's kind.
- Turning a person off or changing their access ends their sessions and signs out their AI agents.

## Live editing

Every open tab keeps a WebSocket to `/api/live`. When someone saves, the other
tabs with that document open fetch it and merge it into theirs
(`src/lib/merge3.ts`; the undo history is rebased too). A save that loses a
race gets a 409 and is merged and saved again. The bar at the bottom right
shows who else is in the same document.

Open documents are kept in the server's memory and written to Cloud Storage at
most every 2.5 s (Cloud Storage allows about one write per second per object),
so the service runs as **one instance** (`--max-instances 1`). Pending writes
are flushed when Cloud Run stops the instance.

## AI agents (MCP)

`/mcp` is the same MCP server as the desktop app (`electron/mcp.cjs`). Tool calls
run in the app itself, as that person:

- If they have PrePro Studio open, the call runs in their most recently used tab, so they see the change live.
- If not, the server opens an **agent tab** for them: a headless Chromium inside the container, signed in as
  them (`server/headless.mjs`). It stays out of presence, saves before every reply, and closes after
  10 idle minutes. The first call after that takes a few extra seconds while it starts.

An agent tab is a fresh browser, so Personal Finances start locked there (the PIN is never given to agents);
the owner's Finance tools work only while the owner has Finances unlocked in a real tab.

- **Claude (claude.ai, Claude app):** Settings, Connectors, Add custom connector, URL `https://…run.app/mcp`. Claude registers itself, opens the sign-in page, and the person presses Allow (OAuth 2.1 with PKCE).
- **Claude Code, Cursor, VS Code:** create a personal token on **Connect an AI agent** (`/connect`) and send it as `Authorization: Bearer <token>`.

An agent acts as its person and never gets the Finance or Training tools unless that person is the owner.

## Everyday tasks

```powershell
# deploy the current code (project and owner default to gcloud's current project and signed-in account)
powershell -File scripts/deploy-cloud.ps1

# owner sign-in link (first time, or a forgotten password); valid 7 days, works once
$env:STORAGE="gcs"; $env:DATA_BUCKET="<project>-data"; $env:GOOGLE_CLOUD_PROJECT="<project>"
$env:IDENTITY_API_KEY = gcloud secrets versions access latest --secret=prepro-identity-api-key
$env:OWNER_EMAIL="<owner email>"; $env:PUBLIC_URL="https://prepro-studio-<project number>.us-east1.run.app"
node scripts/cloud-admin.mjs owner-link
```

On a network with TLS inspection, point gcloud at a bundle of the Windows certificates
(`gcloud config set core/custom_ca_certs_file …`) and set `NODE_EXTRA_CA_CERTS` to the same file for Node.

## Tests

`scripts/cloud-test.mjs` runs 74 end-to-end checks (set `CHROME_PATH` to Chrome or Edge to include agent tabs) (sign-in, invites, scopes,
Finance/Training lock-out, live updates, conflicts, MCP relay, OAuth with PKCE,
turning a person off) against a running server and the real Identity Platform,
then removes its two test accounts. Run the server locally with `STORAGE=disk`
(or a throwaway bucket), `OWNER_EMAIL` set to the test owner, then:

```powershell
$env:BASE="http://localhost:8080"; $env:OWNER_EMAIL="prepro-owner-test@example.com"; $env:MEMBER_EMAIL="prepro-member-test@example.com"
node scripts/cloud-test.mjs
```

## Limits to know

- Uploads are capped at about 31 MB per file (Cloud Run's request limit is 32 MB).
- The first visit after a quiet spell takes a few seconds while the instance starts.
- Export PDF uses the browser's print dialog (Save as PDF); the merged production book is desktop only.
- If two people edit the very same text field at the same moment, the later save wins for that field; everything else merges.
