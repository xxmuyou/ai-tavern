# Project Mission

This repo hosts multiple app projects under one Cloudflare-first workspace. Each app can have its own product direction, but all apps must share the same engineering discipline: one primary domain, one centralized data strategy, explicit app-level routing, and a controlled promotion path from local development to dev and then production.

The default stack is:

- `apps/app`: Expo Router frontend for Web, Android, and iOS.
- `packages/api`: Cloudflare Worker backend/API.
- `packages/shared`: shared contracts, types, constants, and validation helpers.
- `packages/api/migrations`: database migrations.
- `docs/specs`: numbered feature and product specs.

# Local Environment

This repository is WSL-first. All local development, tests, builds, migrations, dev servers, and agent sandbox commands must run inside Ubuntu WSL2 from:

`/home/pgx123/private/xtbit/publisher-apps/xtbit-apps`

Do not run project npm commands from Windows PowerShell, CMD, or the old `/mnt/c/...` working copy. The project scripts intentionally fail fast outside Ubuntu WSL so Windows and Linux Node dependencies do not get mixed. Use native Linux Node.js `>=22` and run commands through `npm run ...` from the WSL repo root unless a spec says otherwise.

# Cloudflare-First Architecture

Cloudflare is the primary runtime and data plane. Prefer Cloudflare products before adding AWS services.

- Use Cloudflare Workers for API, app routing, authentication gateways, and backend orchestration.
- Use Cloudflare Pages for the web build output.
- Use Cloudflare D1 as the MVP relational database unless a spec explicitly chooses another database.
- Use Cloudflare R2 for primary object storage.
- Use Cloudflare KV for configuration, short-lived cache, and feature flags.
- Use Cloudflare Durable Objects for room state, session coordination, game state, and realtime coordination.
- Use Cloudflare Queues for async jobs and retries.
- Keep AWS as a fallback for backup, archive, or heavy compute that Cloudflare cannot reasonably handle.

# Multi-App Routing And Data Ownership

All apps are managed under one primary domain and one database strategy for now. App separation must be explicit.

Use path-based routing by default:

- Web routes: `/apps/{appKey}`
- API routes: `/api/{appKey}`

Every app-specific route, API handler, queue message, object key, and database record must include or derive an `appKey`. Database tables that hold app-owned data must include `app_key` or an equivalent ownership field unless the table is intentionally global and documented as global in the relevant spec.

Do not silently mix app behavior. If a change affects more than one app, the spec must name every affected app and explain the shared behavior.

# Spec-First Development

Every meaningful feature, product change, database change, API change, routing change, or deployment behavior change must create or update a numbered spec before implementation.

Specs live in `docs/specs` and use lowercase sequential numbering:

- `docs/specs/spec-001-short-name.md`
- `docs/specs/spec-002-short-name.md`

Each app must have documentation for:

- MVP scope.
- Expected future features.
- Frontend responsibilities.
- Backend/API responsibilities.
- Database responsibilities.

Each spec must include:

- Goal.
- App key.
- MVP behavior.
- Expected future behavior.
- Frontend changes.
- Backend/API changes.
- Database changes.
- Local validation.
- Dev validation.
- Prod validation.
- Rollback notes.

If a request is unclear, inspect the repo first. Ask only for product or tradeoff decisions that cannot be discovered from the repo.

# Local Dev Prod Pipeline

The required promotion order is:

`local -> dev -> prod`

Local comes first:

- Implement and verify locally before any dev deployment.
- Run relevant local checks such as typecheck, lint, migrations, Worker smoke tests, and app preview checks.
- Do not skip local verification because a change looks small.

Dev comes second:

- Deploy to dev only after local checks pass.
- Verify dev behavior against the spec.
- Dev may use placeholder data, test accounts, and non-production Cloudflare resources.

Prod comes last:

- Production deployment always requires explicit manual confirmation from the user in the current conversation.
- Prior intent, implied approval, a checklist item, or a previous approval does not count as prod approval.
- The confirmation must clearly identify what will be deployed to prod.

# Frontend Backend Database Responsibilities

Each app must be planned and implemented as three coordinated parts.

Frontend:

- Lives primarily under `apps/app`.
- Must route app-specific experiences through `/apps/{appKey}`.
- Must call backend APIs through `/api/{appKey}`.
- Must not hardcode production-only assumptions into local or dev flows.

Backend/API:

- Lives primarily under `packages/api`.
- Must validate or derive `appKey` before app-specific work.
- Must keep client credentials short-lived or server-side.
- Must access Cloudflare resources through bindings rather than public REST calls from inside Workers.

Database:

- Schema changes live under `packages/api/migrations`.
- App-owned data must include `app_key` or a documented equivalent.
- Migrations must be safe to run in local first, then dev, then prod.
- Shared/global tables must be documented in the relevant spec.

Shared contracts:

- Shared types and constants live under `packages/shared`.
- API request/response contracts used by frontend and backend should be defined or exported from shared code when practical.

# Deployment Rules

Deployment follows the same strict order as development:

1. Local verification.
2. Dev deployment and verification.
3. Prod deployment only after explicit manual confirmation.

Agents must not deploy to prod automatically.

Agents must not create, rotate, print, or transmit secrets unless the user explicitly asks for that exact action and the destination is clear.

Cloudflare resource IDs, account IDs, zone IDs, database IDs, KV IDs, bucket names, and queue names must be treated as environment-specific configuration. Do not hardcode production-only values into shared code.

# Git Rules

Do not run git commands unless the user explicitly asks for the specific git action.

Never automatically run:

- `git commit`
- `git push`
- `git reset`
- `git checkout`
- `git switch`
- `git rebase`
- `git merge`
- `git tag`
- branch deletion commands

If the user asks for a git operation, perform only the requested operation. Do not add adjacent cleanup, staging, committing, pushing, rebasing, or branch changes unless separately requested.

Do not use git commands just to inspect state unless the user has explicitly allowed git usage for that task.

# Testing Expectations

Before considering a change ready, run the checks relevant to the changed surface.

General checks:

- Typecheck affected workspaces.
- Lint affected workspaces.
- Read the relevant spec and confirm the implementation matches it.

Frontend checks:

- Verify Expo Web locally when frontend behavior changes.
- Use a browser check for meaningful UI changes.
- Confirm text, controls, and routes do not overlap or break on normal desktop/mobile widths.

Backend/API checks:

- Run Worker local dev smoke tests for changed endpoints.
- Verify `/health` still works.
- Verify app-specific endpoints include or derive `appKey`.
- Verify CORS and error responses when relevant.

Database checks:

- Run migrations locally first.
- Confirm migrations are compatible with dev and prod promotion.
- Confirm new app-owned tables or rows include `app_key` or a documented equivalent.

# Agent Behavior Checklist

Before implementation:

- Inspect existing code and docs first.
- Find or create the relevant `docs/specs/spec-001-name.md` style spec for meaningful changes.
- Identify the target `appKey`.
- Identify frontend, backend/API, and database impact.

During implementation:

- Keep Cloudflare-first defaults.
- Keep app separation explicit.
- Keep changes scoped to the spec.
- Avoid unrelated refactors.
- Do not run git commands unless explicitly requested.

Before dev deployment:

- Confirm local checks passed.
- Confirm the dev target and resources are non-production.

Before prod deployment:

- Stop and ask for explicit manual confirmation.
- State exactly what will be deployed to prod.
- Proceed only after the user confirms that specific prod deployment.
