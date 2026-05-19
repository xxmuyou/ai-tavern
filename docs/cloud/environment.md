# Environment setup

## Environment files

The repo uses exactly three env files:

- `.env.example`: tracked template with the complete variable list.
- `.env.dev`: local development and dev deploy values.
- `.env.prod`: production values.

The variable names should stay the same across all three files. Only the values differ by environment.

Create local files from the template:

```bash
cp .env.example .env.dev
cp .env.example .env.prod
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.dev
Copy-Item .env.example .env.prod
```

Local commands run through `scripts/tasks/run.mjs` load `.env.dev` by default for `npm run dev:app`, `npm run dev:api`, and dev deploy/export tasks. Production secrets should be filled in `.env.prod` and uploaded to the production platform explicitly; do not rely on `.env.dev` for prod.

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
npm run dev
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

## One-command local restart

Use the local dev launcher when you want to restart both the API and web app after changing `.env.dev`.

Windows PowerShell, CMD, macOS, and Linux:

```text
node scripts/local-dev.mjs
```

The launcher stops existing local listeners on ports `8081` and `8787`, then starts:

- API: `http://127.0.0.1:8787`
- Web: `http://localhost:8081`

It keeps both services attached to the terminal. Keep that terminal open. Press `Ctrl+C` in that terminal to stop both. Logs are also written to `tmp/local-dev.log`.

## Cloudflare secrets

Use the ignored local `.env.dev` file for local process env. Use the ignored local tmp secrets file for uploading dev Worker secrets. Do not commit `.dev.vars`, `.env.dev`, `.env.prod`, or anything under `tmp/`. The upload command is cross-platform and runs through Node, so it works on Windows PowerShell, Windows CMD, macOS, and Linux.

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

Local development loads `.env.dev` through the task runner. Wrangler-only workflows may also use `.dev.vars`, but the preferred shared machine workflow is `.env.dev` for local commands and `tmp/cloudflare-dev-secrets.env` for uploading dev Worker secrets:

```text
STRIPE_SECRET_KEY=sk_test_rotated_value
STRIPE_WEBHOOK_SECRET=whsec_local_or_dev_value
DEEPSEEK_API_KEY=
ARK_API_KEY=
```

Dev Workers need secrets uploaded from the ignored tmp file:

```bash
npm run cf:secrets:dev
```

The test secret key previously pasted into chat should be rotated in Stripe before use.
