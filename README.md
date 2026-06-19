# xtbit-apps

> **CharaPal / AI Companion** — 现代都市互动陪伴 RPG。Cloudflare 全栈 + Expo 三端（Web / iOS / Android）。

## 当前状态

- **Web 端已上线生产首版**：当前本地 `main` 已标记为 `v1.0.0`，作为第一版生产发布基线。
- **移动端仍在后续迭代中**：iOS / Android 代码与 Web 共用 Expo app，但当前生产上线重点是 Web。
- **生产资料已补齐**：Web 端已包含 Terms、Privacy、Refund、Safety、Contact 等外部审核所需页面与站内浮窗入口。
- **日常开发仍以 local/dev 环境为准**：本地开发走 local API + local D1，dev 环境用于集成验收，prod 仅用于正式发布。

## 文档入口

完整项目文档：**[`docs/README.md`](./docs/README.md)**

- [产品愿景](./docs/product/vision.md)
- [玩法机制](./docs/product/gameplay.md)
- [v1 内容清单](./docs/product/content.md)
- [付费设计](./docs/product/monetization.md)
- [架构总览](./docs/architecture/overview.md)
- [数据模型](./docs/architecture/data-model.md)
- [API 端点](./docs/architecture/api.md)
- [LLM 集成](./docs/architecture/llm.md)
- [环境配置](./docs/ops/environments.md)
- [部署流程](./docs/ops/deployment.md)
- [密钥管理](./docs/ops/secrets.md)

> 旧文档（2026-05 之前）归档在 [`docs/_archive/2026-05/`](./docs/_archive/2026-05/)，仅供历史查考。

## 仓库结构

| 路径 | 说明 |
|------|------|
| `apps/app/` | Expo 三端 app（Web + iOS + Android） |
| `packages/api/` | Cloudflare Workers API |
| `packages/shared/` | 共享类型与常量 |
| `infra/cloudflare/` | Wrangler 配置 |
| `scripts/` | 开发与部署脚本 |
| `docs/` | 项目文档（权威） |

## 本地开发

详见 [`docs/ops/environments.md`](./docs/ops/environments.md)。

**前置：** WSL（Linux 子系统）+ Node.js >= 22 + pnpm。

```bash
pnpm install
cp .env.example .env.local
pnpm run:local    # 同时启动本地 API (8787) 与本地 App (8081)
pnpm preview:web:local  # 可选：导出静态 Web，并在 19006 预览；仍连接本地 API (8787)
pnpm typecheck
pnpm test
```

本地测试默认全链路走本地：Web -> `http://127.0.0.1:8787` -> local D1。dev API 只用于特殊集成排查或部署验收，不作为日常本地测试默认依赖。

## 部署

详见 [`docs/ops/deployment.md`](./docs/ops/deployment.md)。

```bash
pnpm deploy:api:dev    # API 到 dev
pnpm deploy:web:dev    # Web 到 dev
pnpm deploy:api:prod   # API 到 prod
pnpm deploy:web:prod   # Web 到 prod
pnpm deploy:prod       # API + Web 到 prod
```

## 状态

✅ Web 端生产首版已上线；后续功能与体验优化继续按 [`docs/specs/`](./docs/specs/) 中的 spec 推进。
