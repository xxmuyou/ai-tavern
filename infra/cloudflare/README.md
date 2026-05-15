# Cloudflare infra

`wrangler.jsonc` is the source of truth for the API Worker and its bindings.

Before production deploys, replace placeholder resource IDs with real values:

- D1 `database_id`
- KV namespace `id`
- R2 bucket names if the account naming policy differs
- Queue names if the account naming policy differs

Useful commands:

```powershell
npm run cf:types
npm run dev:api
npm run cf:d1:migrate:local
npm --workspace @xtbit/api run deploy
```
