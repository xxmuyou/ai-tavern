# spec-001-local-cloud-resource-inventory

## Goal

Create an ignored local `tmp/` inventory for Cloudflare resource IDs, permission notes, and migration references so the project can be recreated or moved later without committing environment-specific values.

## App key

Global project infrastructure. This spec applies to all apps under the shared domain and shared database strategy.

## MVP behavior

- Store non-secret Cloudflare account, domain, R2, D1, KV, Queue, and Worker routing references under `tmp/`.
- Ignore `tmp/` through `.gitignore`.
- Do not store OAuth tokens, API tokens, passwords, or secret values in the repo or local inventory.
- Keep tracked config templates safe to commit; keep local resource IDs available for migration/reference.

## Expected future behavior

- Add generated migration notes for new environments when dev/prod resources change.
- Add AWS backup inventory later if/when S3 fallback buckets are created.
- Add a sanitized tracked template if more developers need to bootstrap their own local inventories.

## Frontend changes

No frontend behavior changes.

## Backend/API changes

No API behavior changes in this spec. Future implementation may update Wrangler config from the local inventory.

## Database changes

No database schema changes.

## Local validation

- Confirm `tmp/` exists locally.
- Confirm `tmp/` is listed in `.gitignore`.
- Confirm local inventory files contain resource IDs but no secrets.

## Dev validation

No dev deployment required.

## Prod validation

No prod deployment required.

## Rollback notes

Remove `tmp/` from `.gitignore` only if the team intentionally chooses a different ignored location. Delete local `tmp/` files if they become stale or if the machine is transferred.
