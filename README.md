# xtbit-apps

> **AI Companion** — 现代都市互动陪伴 RPG。Cloudflare 全栈 + Expo 三端（Web / iOS / Android）。

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
pnpm local        # 同时启动 API (8787) 与 App (8081)
pnpm typecheck
pnpm test
```

## 部署

详见 [`docs/ops/deployment.md`](./docs/ops/deployment.md)。

```bash
pnpm deploy:api:dev    # API 到 dev
pnpm deploy:web:dev    # Web 到 dev
```

## 状态

🚧 项目在 2026-05 进入重新规划阶段，正在按 [`docs/specs/`](./docs/specs/) 中的 spec 推进 v1 实现。
