# Build and deploy the hosted version to Cloud Run (see docs/CLOUD.md).
#   powershell -File scripts/deploy-cloud.ps1
# Needs: gcloud signed in (gcloud auth login) with access to the project.
param(
  # defaults come from gcloud: the current project and the signed-in account (the owner)
  [string]$Project = (gcloud config get-value project 2>$null),
  [string]$Region = "us-east1",
  [string]$Service = "prepro-studio",
  [string]$OwnerEmail = (gcloud config get-value account 2>$null)
)
$ErrorActionPreference = "Stop"
$bucket = "$Project-data"
$sa = "prepro-run@$Project.iam.gserviceaccount.com"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Project -or -not $OwnerEmail) { throw "Set a project (gcloud config set project ...) and sign in (gcloud auth login), or pass -Project and -OwnerEmail" }
# the address people use (sign-in links, OAuth for AI agents): the stable https://<service>-<project number>.<region>.run.app
$number = gcloud projects describe $Project --format "value(projectNumber)"
$PublicUrl = "https://$Service-$number.$Region.run.app"

# --max-instances 1: open documents live in the server's memory (live editing); see server/docs.mjs
# --timeout 3600: live-editing WebSockets stay open up to an hour, then reconnect
# --memory 2Gi: room for the headless Chromium that runs agent tabs
gcloud run deploy $Service --project $Project --region $Region --source $root --quiet `
  --service-account $sa --allow-unauthenticated `
  --min-instances 0 --max-instances 1 --concurrency 250 --cpu 1 --memory 2Gi --timeout 3600 `
  --session-affinity --cpu-boost `
  --set-env-vars "STORAGE=gcs,DATA_BUCKET=$bucket,GOOGLE_CLOUD_PROJECT=$Project,OWNER_EMAIL=$OwnerEmail" `
  --set-secrets "IDENTITY_API_KEY=prepro-identity-api-key:latest,SESSION_SECRET=prepro-session-secret:latest"

gcloud run services update $Service --project $Project --region $Region --quiet --update-env-vars "PUBLIC_URL=$PublicUrl" | Out-Null
Write-Host "Deployed: $PublicUrl"
