# Cloud architecture

## Decision

Use Cloudflare first. AWS stays available for backup, archive, and future heavy compute.

## Runtime boundary

- Cloudflare Workers: API, authentication gateway, game logic, and R2/D1/Queue/DO access.
- Cloudflare Pages: exported Expo web app.
- Cloudflare R2: primary object storage for uploads, generated assets, and game resources.
- Cloudflare D1: MVP relational data.
- Cloudflare Durable Objects: room state, session coordination, match state, and future realtime flows.
- Cloudflare Queues: asynchronous jobs and retries.
- AWS S3: backup buckets, archive buckets, and migration escape hatch.

## Default data flow

1. Web, Android, and iOS call the Worker API.
2. The Worker validates the request and uses Cloudflare bindings.
3. Files go to R2 through the Worker, never through long-lived client credentials.
4. Room state goes to Durable Objects.
5. Background work goes to Queues.
6. AWS receives only backup/archive copies when that pipeline is added.

## Scale escape hatches

- If D1 becomes too small for the write/query workload, migrate the relational system to external Postgres through Cloudflare Hyperdrive or AWS RDS/Aurora.
- If Workers are too constrained for CPU-heavy jobs, move that workload to AWS Lambda, ECS, or Fargate and keep Workers as the public API edge.
- If media processing grows, evaluate Cloudflare Images/Stream first, then AWS MediaConvert or ECS workers.
