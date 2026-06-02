# 脚本与 pnpm 命令参考

> 本文档是 `scripts/` 下脚本与对应 `pnpm` 命令的权威清单。环境配置见 [`environments.md`](./environments.md),密钥管理见 [`secrets.md`](./secrets.md),部署流程见 [`deployment.md`](./deployment.md)。

命名遵循「**动作 : 对象 : 目标**」,读命令名即知职责,例如 `run:local`(运行本地)、`generate:env:dev`(生成 dev env 文件)、`upload:secrets:dev`(上传 dev 密钥)、`migrate:db:prod`(迁移 prod 数据库)。

---

## 1. 速查表

| pnpm 命令 | 底层脚本 | 作用 |
|---|---|---|
| `run:local` | `scripts/run-local-stack.sh` | 启动本地全栈:API(:8787)+ Expo Web(:8081) |
| `run:local:api` | `tasks/run.sh api:local` | 只启动本地 API(Wrangler dev) |
| `run:local:app` | `tasks/run.sh app:local` | 只启动本地 App(Expo Web) |
| `generate:env` | `scripts/generate-env-files.sh local` | 同 `generate:env:local` |
| `generate:env:local` | `scripts/generate-env-files.sh local` | 从 `.env.local` 派生本地 env 文件 + `.dev.vars` |
| `generate:env:dev` | `scripts/generate-env-files.sh dev` | 从 `.env.dev` 派生 `apps/app/.env.dev` |
| `generate:env:prod` | `scripts/generate-env-files.sh prod` | 从 `.env.prod` 派生 `apps/app/.env.prod` |
| `generate:cf-types` | `tasks/run.sh api:cf-types` | 生成 Worker 类型定义 `worker-configuration.d.ts` |
| `migrate:db:local` | `tasks/run.sh api:d1-migrate-local` | 在本地 D1(SQLite)上应用迁移 |
| `migrate:db:dev` | `tasks/run.sh api:d1-migrate-dev` | 在远端 dev D1 上应用迁移 |
| `migrate:db:prod` | `tasks/run.sh api:d1-migrate-prod` | 在远端 prod D1 上应用迁移 |
| `sync:runninghub:dev` | `tasks/run.sh api:sync-runninghub-dev` | 把 dev RunningHub workflow/checkpoint 配置同步到 D1 |
| `sync:runninghub:prod` | `tasks/run.sh api:sync-runninghub-prod` | 把 prod RunningHub workflow/checkpoint 配置同步到 D1 |
| `upload:secrets:dev` | `scripts/upload-worker-secrets.sh dev` | 把 `.env.dev` 的 Worker 密钥推到 Cloudflare(dev) |
| `upload:secrets:prod` | `scripts/upload-worker-secrets.sh prod` | 把 `.env.prod` 的 Worker 密钥推到 Cloudflare(prod) |
| `deploy:dev` | `scripts/deploy-api-and-web.sh dev` | 校验 + 迁移 + 部署 API + Web 到 dev(一键) |
| `deploy:prod` | `scripts/deploy-api-and-web.sh prod` | 同上,部署到 prod(需二次确认) |
| `deploy:api:dev` / `:prod` | `tasks/run.sh api:deploy-{dev,prod}` | 只部署 API |
| `deploy:web:dev` / `:prod` | `tasks/run.sh deploy:web-{dev,prod}` | 只部署 Web(Cloudflare Pages) |

> `pnpm dev` / `dev:app` / `dev:api` 已**禁用**(避免 local 与 dev 概念混淆),运行会提示改用 `run:local*`。

---

## 2. 脚本详解

### `run-local-stack.sh`(`pnpm run:local`)

启动本地开发全栈,流程:

1. 杀掉占用 8081 / 8787 的旧进程。
2. 调 `generate-env-files.sh local` 准备本地 env 文件(失败则拒绝启动,避免用陈旧 env)。
3. 应用本地 D1 迁移(`--skip-migrate` 可跳过)。
4. 并行启动 API(`run:local:api`)与 App(`run:local:app`),日志同时输出到终端与 `tmp/local.log`。
5. `Ctrl+C` 或任一子进程退出时,清理另一个并退出。

```bash
pnpm run:local                 # 完整本地栈
pnpm run:local --skip-migrate  # 跳过 D1 迁移(schema 已是最新时更快)
pnpm run:local:api             # 只跑 API
pnpm run:local:app             # 只跑 App
```

本地拓扑:API 在 `http://127.0.0.1:8787`(无 `/api` 前缀),Web 在 `http://localhost:8081`。

### `generate-env-files.sh`(`pnpm generate:env:*`)

把根目录单一来源 `.env.<target>` 派生到下游消费位置。**派生文件均带 `# AUTO-GENERATED ... DO NOT EDIT` banner,不要手改。**

- 所有 target:派生 `apps/app/.env.<target>`(仅 `EXPO_PUBLIC_*`,给 Expo 打包用)。
- 仅 `local` target:额外派生 `infra/cloudflare/.dev.vars`(本地 Worker 运行时读取,按脚本顶部 `WORKER_KEYS` 白名单)。

```bash
pnpm generate:env:local            # 本地:apps/app/.env.local + .dev.vars
pnpm generate:env:dev              # dev:仅 apps/app/.env.dev
pnpm generate:env:dev --dry-run    # 只打印计划,不写文件
```

远端 Worker 的密钥不走这里,走 `upload:secrets:*`(见下)。

### `upload-worker-secrets.sh`(`pnpm upload:secrets:*`)

把 `.env.<target>` 中**仅 Worker 运行时需要的密钥**(脚本顶部 `ALLOWED_WORKER_KEYS` 白名单)通过 `wrangler secret put` 推到 Cloudflare。刻意**不上传**部署凭证(`CLOUDFLARE_*`)、前端公开变量(`EXPO_PUBLIC_*`)、备份用 `AWS_*`。

```bash
pnpm upload:secrets:dev             # 推 dev 密钥到远端
pnpm upload:secrets:dev --dry-run   # 只列「Would upload …」,不实际推送
pnpm upload:secrets:prod            # 推 prod 密钥
```

> 新增一个 Worker 密钥 key 时,需同时改三处:`.env.example`(schema)、`generate-env-files.sh` 的 `WORKER_KEYS`、`upload-worker-secrets.sh` 的 `ALLOWED_WORKER_KEYS`。

### `sync-runninghub-workflows.sh`(`pnpm sync:runninghub:*`)

把 repo 中的 RunningHub 默认 checkpoint/workflow 配置同步到对应环境 D1 catalog。配置文件包含 `checkpoints[]` 与 `workflows{}`；同步会 upsert `image_models`、`image_workflows`、`image_workflow_models`，并保留写入 legacy `app_settings.image_gen.workflows` 作为旧 runtime fallback。

- dev 来源:`config/runninghub-workflows.dev.json`
- prod 来源:`config/runninghub-workflows.prod.json`
- 写入 catalog 表，并顺带 `DELETE` 旧键 `image_gen.create_workflows` / `image_gen.wf2_workflow_id` / `image_gen.wf2_load_image_node_id` / `image_gen.wf2_prompt_node_id` 清理历史漂移。

```bash
pnpm sync:runninghub:dev              # 同步 dev 配置到 dev D1
bash scripts/sync-runninghub-workflows.sh dev --dry-run
pnpm sync:runninghub:prod             # 同步 prod 配置到 prod D1
```

### `deploy-api-and-web.sh`(`pnpm deploy:{dev,prod}`)

一键部署,顺序:本地校验(`typecheck` + `test`)→ D1 迁移 → RunningHub workflow/checkpoint 同步 → 部署 API → 部署 Web → 健康检查 + Web 入口比对。

```bash
pnpm deploy:dev                 # 部署到 dev
pnpm deploy:dev --skip-checks   # 跳过 typecheck/test(慎用)
pnpm deploy:prod                # 部署到 prod,会要求输入 'prod' 二次确认
```

只想部署其中一端时用 `deploy:api:{env}` / `deploy:web:{env}`。

### `tasks/run.sh`(内部分发,一般不直接调)

被上面脚本与 package.json 复用的底层任务分发器,负责加载 `.env.<target>` 并执行单条 wrangler / expo 命令(`api:deploy-dev`、`deploy:web-prod` 等)。用户通常通过上面的 pnpm 命令间接调用,无需直接使用。

---

## 3. 典型流程

**新机器起步**

```bash
pnpm install
cp .env.example .env.local      # 填入本地值(gitignored)
pnpm run:local                  # 自动派生 env + 迁移 + 启动 API/App
```

**改了密钥 / 新增 Worker 密钥后同步到远端 dev**

```bash
# 编辑 .env.dev
pnpm upload:secrets:dev         # 推送密钥(--dry-run 可先预览)
pnpm deploy:dev                 # 如改了非密钥的 vars/代码,再部署
```

**新增一条 D1 迁移**

```bash
pnpm migrate:db:local           # 本地验证
pnpm migrate:db:dev             # dev 应用
pnpm migrate:db:prod            # prod 应用(需确认 dev/prod 可变更)
```
