# spec-002-dev-environment-bootstrap

## Goal

Complete the shared dev environment before starting the first app: real Cloudflare bindings, `/api` route compatibility, dev-only deployment, and a clear custom domain path.

## App key

Global project infrastructure. This applies to every app that will later use `/apps/{appKey}` and `/api/{appKey}`.

## MVP behavior

- Dev API uses `dev.aiappsbox.com/api/*`.
- Prod API is configured for `aiappsbox.com/api/*` but must not be deployed without explicit manual confirmation.
- Worker code accepts both local paths like `/health` and domain-routed paths like `/api/health`.
- Real dev/prod D1 and KV IDs are written into Wrangler config.
- Workers.dev public trigger is disabled for this project.
- Dev scripts use cross-platform Node wrappers instead of shell-specific `sh`, PowerShell, or CMD command chains.

## Expected future behavior

- Pages serves the dev frontend at `dev.aiappsbox.com`.
- Worker route handles `dev.aiappsbox.com/api/*` and Pages handles other paths.
- First app adds app-specific routes under `/apps/{appKey}` and `/api/{appKey}`.

## Frontend changes

No product frontend changes. Expo Web export remains the dev frontend build artifact.

## Backend/API changes

- Normalize incoming Worker request paths by stripping `/api`.
- Keep route behavior unchanged for local development paths.

## Database changes

No schema changes beyond applying existing migrations to dev D1.

## Local validation

- Run Cloudflare type generation.
- Run local D1 migration.
- Run typecheck and lint.
- Export Expo Web.
- Smoke test Worker locally.
- Run `npm run cf:secrets:dev` with an empty ignored tmp template to confirm the script works cross-platform without uploading blank secrets.
- Run representative root commands through `npm run ...` rather than directly invoking platform-specific shell scripts.

## Dev validation

- Apply D1 migrations to remote dev.
- Deploy Worker to dev only.
- Smoke test `/api/health`, `/api/db/ping`, R2 object read/write, Durable Object room state, and Queue enqueue through the dev route.

## Prod validation

No prod deployment in this spec.

## Rollback notes

- Remove the dev route from Wrangler config if the domain is not ready.
- Re-enable `workers_dev` only if a temporary account-level URL is intentionally needed.
