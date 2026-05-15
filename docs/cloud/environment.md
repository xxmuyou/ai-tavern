# Environment setup

## Local app

Set `EXPO_PUBLIC_API_BASE_URL` when the API is not running at the default local URL:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:8787"
npm run dev:app
```

On macOS/Linux:

```bash
EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:8787" npm run dev:app
```

## Cross-platform scripts

Team commands should be run through `npm run ...` from the repo root. Project task wrappers are Node scripts, not `sh`, PowerShell, or CMD scripts, so the same commands work on Windows PowerShell, Windows CMD, macOS, and Linux as long as Node/npm are available.

Important shared commands:

```bash
npm run dev:app
npm run dev:api
npm run typecheck
npm run lint
npm run cf:types
npm run cf:d1:migrate:local
npm run cf:d1:migrate:dev
npm run cf:secrets:dev
npm run deploy:api:dev
npm run deploy:web:dev
```

Prod deploys and prod migrations still require explicit manual confirmation in the current conversation before running.

## Cloudflare secrets

Use the ignored local tmp secrets file for dev secrets. Do not commit `.dev.vars` or anything under `tmp/`. The upload command is cross-platform and runs through Node, so it works on Windows PowerShell, Windows CMD, macOS, and Linux.

```powershell
notepad .\tmp\cloudflare-dev-secrets.env
npm run cf:secrets:dev
```

On macOS/Linux:

```bash
nano ./tmp/cloudflare-dev-secrets.env
npm run cf:secrets:dev
```

The upload script reads `tmp/cloudflare-dev-secrets.env`, uploads allowlisted secrets to the dev Worker, and does not print secret values. It targets the top-level dev Worker config with `--env=""`.

## Cloudflare resource creation order

1. Add domain to Cloudflare DNS.
2. Create R2 buckets: `xtbit-apps-dev-assets`, `xtbit-apps-prod-assets`.
3. Create D1 databases: `xtbit-apps-dev`, `xtbit-apps-prod`.
4. Create KV namespaces for `CONFIG`.
5. Create Queues: `xtbit-apps-dev-jobs`, `xtbit-apps-prod-jobs`.
6. Replace placeholder IDs in `infra/cloudflare/wrangler.jsonc`.
7. Run `npm run cf:types`.
8. Run D1 migrations.
9. Deploy Worker and Pages.

## Pages deploy output

The Expo web app exports static assets to `apps/app/dist`.

## Current dev routing

- Dev web preview: `https://dev.xtbit-apps.pages.dev`
- Planned dev custom domain: `https://dev.aiappsbox.com`
- Dev API route: `https://dev.aiappsbox.com/api/*`
- Production domain: `https://aiappsbox.com`

Bind `dev.aiappsbox.com` to the `xtbit-apps` Pages project in Cloudflare before relying on the custom dev domain. The Worker route `dev.aiappsbox.com/api/*` is already configured for dev API traffic.

## Stripe test billing

The public Stripe test publishable key and test price ID are configured in Wrangler vars. Do not store secret keys in tracked files.

Current dev Stripe return URLs point to `https://dev.xtbit-apps.pages.dev` because `dev.aiappsbox.com/api/*` is routed to Workers and the Pages root custom domain still needs a clean dev-only mapping.

Local development may use `.dev.vars` in the repo root when running `wrangler dev`, but the preferred shared machine workflow is `tmp/cloudflare-dev-secrets.env`:

```text
STRIPE_SECRET_KEY=sk_test_rotated_value
STRIPE_WEBHOOK_SECRET=whsec_local_or_dev_value
```

Dev Workers need secrets uploaded from the ignored tmp file:

```bash
npm run cf:secrets:dev
```

The test secret key previously pasted into chat should be rotated in Stripe before use.
