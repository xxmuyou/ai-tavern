# Cloudflare infra

`wrangler.jsonc` is the source of truth for the API Worker and its bindings.

Before production deploys, replace placeholder resource IDs with real values:

- D1 `database_id`
- KV namespace `id`
- R2 bucket names if the account naming policy differs
- Queue names if the account naming policy differs

Useful commands:

Run these from Linux at `/home/pgx123/private/xtbit/publisher-apps/xtbit-apps`:

```bash
npm run cf:types
npm run dev:api
npm run cf:d1:migrate:local
npm run deploy:api:dev
```
