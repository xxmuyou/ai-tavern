# xtbit-apps

Cloudflare-first Expo application workspace for Web, Android, and iOS.

## Stack

- `apps/app`: Expo Router app for Web, Android, and iOS.
- `packages/api`: Cloudflare Worker API with R2, D1, KV, Queues, and Durable Objects bindings.
- `packages/shared`: shared constants and TypeScript types.
- `infra/cloudflare`: Wrangler configuration and Cloudflare deployment source of truth.
- `docs/cloud`: Cloudflare/AWS responsibility boundary and permission request notes.

## Local setup

All local development for this repo runs on Linux from:

```bash
cd /home/pgx123/private/xtbit/publisher-apps/xtbit-apps
```

Use native Linux Node.js `>=22`; do not run project commands from Windows PowerShell or CMD.

```bash
npm install
npm run cf:types
npm run typecheck
```

Run the API:

```bash
npm run dev:api
```

Run the Expo web app:

```bash
npm run dev:app
```

The app defaults to `http://127.0.0.1:8787` for local API calls. Override it with `EXPO_PUBLIC_API_BASE_URL`.

## Cloud posture

Cloudflare is the primary runtime and data plane. AWS is reserved for backup, archive, and future heavy compute escape hatches. See [docs/cloud/permissions.md](docs/cloud/permissions.md) and [docs/cloud/architecture.md](docs/cloud/architecture.md).
