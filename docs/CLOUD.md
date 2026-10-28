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

Edits merge item by item (lists with ids), list item by list item (lists without ids, such as screenplay
paragraphs) and, inside one text field, letter by letter, so two people can type in the same field at once. Text
fields keep the caret where it was when someone else's edit arrives, and the screenplay editor replaces only the
changed range. Tabs ping every 20 s and reconnect when nothing has arrived for 50 s (laptop sleep, phone in a
pocket, network change); coming back to a tab reconnects at once and fetches what changed meanwhile.

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

## Review links (no sign-in)

In a Marketing Space, **Brand Kit & Assets → Share for review** makes a link for chosen sections (for example
Images & references and Video / footage) that anyone can open without an account. The reviewer marks each item
**Approve** or **Needs changes**, comments, and sends it; the feedback appears in the same dialog, and anyone with the
space open sees a notice right away.

- The page always shows the current items of those sections, and nothing else from the space: only the files those
  items point to can be fetched with the link, and a video's local path is never shown.
- Links expire (7, 30 or 90 days, or never) and can be turned off or deleted at any time. They live in
  `_system/reviews.json` (`server/reviews.mjs`), with the feedback.
- Anyone who can edit the space can make links for it, so only share a space with people you'd trust to share it.

## Set up your own (from scratch)

You need a Google Cloud project with billing turned on, the [gcloud CLI](https://cloud.google.com/sdk/docs/install)
signed in (`gcloud auth login`) and Node.js 20+. Replace `<project>` with your project ID and `<you@example.com>`
with the owner's email. The commands are PowerShell; in bash, use `\` for line breaks.

```powershell
gcloud config set project <project>

# 1. services
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com identitytoolkit.googleapis.com secretmanager.googleapis.com apikeys.googleapis.com iam.googleapis.com

# 2. a private data bucket with versioning (old versions removed after 30 days)
gcloud storage buckets create gs://<project>-data --location=us-east1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://<project>-data --versioning
'{"rule":[{"action":{"type":"Delete"},"condition":{"daysSinceNoncurrentTime":30,"isLive":false}}]}' | Out-File -Encoding ascii lifecycle.json
gcloud storage buckets update gs://<project>-data --lifecycle-file=lifecycle.json
# big files (videos) upload from the browser straight to the bucket: allow the app's address (set it after the first deploy)
'[{"origin":["https://prepro-studio-<project number>.us-east1.run.app"],"method":["PUT"],"responseHeader":["Content-Type","Content-Range","Range"],"maxAgeSeconds":3600}]' | Out-File -Encoding ascii cors.json
gcloud storage buckets update gs://<project>-data --cors-file=cors.json

# 3. the app's own service account, with access to that bucket only
gcloud iam service-accounts create prepro-run --display-name="PrePro Studio app"
$sa = "prepro-run@<project>.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://<project>-data --member="serviceAccount:$sa" --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding <project> --member="serviceAccount:$sa" --role=roles/identitytoolkit.admin --condition=None
gcloud projects add-iam-policy-binding <project> --member="serviceAccount:$sa" --role=roles/serviceusage.serviceUsageConsumer --condition=None
```

**4. Sign-in (Identity Platform).** In the Cloud console open *Identity Platform*, enable it, add the
**Email / Password** provider, and under *Settings → User actions* untick **Enable create (sign-up)** so people can
only join by invite. (Or with the REST API: `identityPlatform:initializeAuth`, then patch the project config with
`signIn.email.enabled` and `client.permissions.disabledUserSignup`.)

```powershell
# 5. a sign-in API key restricted to Identity Toolkit, and a session secret, in Secret Manager
gcloud services api-keys create --display-name="PrePro Studio sign-in (server only)" --api-target=service=identitytoolkit.googleapis.com
$key = gcloud services api-keys list --filter="displayName='PrePro Studio sign-in (server only)'" --format="value(name)"
gcloud services api-keys get-key-string $key --format="value(keyString)" | Out-File -NoNewline -Encoding ascii key.txt
-join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }) | Out-File -NoNewline -Encoding ascii secret.txt
gcloud secrets create prepro-identity-api-key --replication-policy=automatic --data-file=key.txt
gcloud secrets create prepro-session-secret --replication-policy=automatic --data-file=secret.txt
Remove-Item key.txt, secret.txt
foreach ($s in "prepro-identity-api-key","prepro-session-secret") { gcloud secrets add-iam-policy-binding $s --member="serviceAccount:$sa" --role=roles/secretmanager.secretAccessor }

# 6. deploy (builds the container with Cloud Build; the owner defaults to the signed-in gcloud account)
powershell -File scripts/deploy-cloud.ps1 -Project <project> -OwnerEmail <you@example.com>
```

**7. First sign-in.** Create the owner's one-time sign-in link (see *Everyday tasks*), open it, set a password, and
you are in with all five tabs. Add a budget alert in *Billing → Budgets & alerts* so a surprise can't grow quietly.

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

`scripts/cloud-test.mjs` runs up to 94 end-to-end checks (sign-in, invites, scopes, Finance/Training lock-out,
live updates, conflicts, MCP relay, OAuth with PKCE, agent tabs, review links, turning a person off) against a running server and
the real Identity Platform, then removes its two test accounts. Set `CHROME_PATH` to Chrome or Edge to include the
agent-tab checks. Run the server locally with `STORAGE=disk`
(or a throwaway bucket), `OWNER_EMAIL` set to the test owner, then:

```powershell
$env:BASE="http://localhost:8080"; $env:OWNER_EMAIL="prepro-owner-test@example.com"; $env:MEMBER_EMAIL="prepro-member-test@example.com"
node scripts/cloud-test.mjs
```

## Limits to know

- Files up to 24 MB upload through the server; bigger ones (videos, up to 5 GB) go from the browser straight to the
  bucket, which needs the bucket's CORS rule from step 2. Files are streamed back with byte ranges, so videos seek.
- The first visit after a quiet spell takes a few seconds while the instance starts.
- Export PDF uses the browser's print dialog (Save as PDF); the merged production book is desktop only.
- If two people type at the very same spot of a field in the same second, both pieces of text are kept side by side; tidy them up by hand.
