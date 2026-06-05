# xtbit-apps · AI Companion

一款面向海外英文市场的**现代都市互动陪伴 RPG**。用户以"你"的视角生活在都市中，与官方角色或自己创建的 AI 角色相遇、对话、建立持续发展的多维度关系。

## 一句话定义

> 在虚拟现代都市里相遇 AI 角色，通过对话、事件、选择推进多维度关系，关系深度解锁新的剧情和场景 —— 没有终点，只有持续发展的故事。

## 当前状态

🚧 **重新规划中（2026-05 启动）**

本仓库的产品方向与文档结构在 2026-05 整体重新梳理。

- **此 `docs/` 下的文档为新的权威参考。**
- 旧文档归档至 [`docs/_archive/2026-05/`](./_archive/2026-05/)（待归档），仅供查考，不应作为现行决策依据。
- 代码层面的现存实现处于过渡状态，新文档会标注"已实现 / 待重构 / 待新建"。

## 文档导航

### 产品（What & Why）
- [`product/vision.md`](./product/vision.md) — 产品愿景：定位、目标用户、世界观、核心循环
- [`product/gameplay.md`](./product/gameplay.md) — 玩法机制：主界面、场景、对话、奇点系统
- [`product/content.md`](./product/content.md) — v1 内容清单：场景与官方角色
- [`product/monetization.md`](./product/monetization.md) — 付费设计：免费额度与订阅

### 架构（How）
- [`architecture/overview.md`](./architecture/overview.md) — 整体架构与模块边界
- [`architecture/data-model.md`](./architecture/data-model.md) — D1 表设计与关系
- [`architecture/api.md`](./architecture/api.md) — HTTP API 端点清单
- [`architecture/llm.md`](./architecture/llm.md) — LLM 多供应商集成与 prompt 设计
- [`architecture/voice.md`](./architecture/voice.md) — MiniMax TTS 配置、voice catalog 与 companion voice 设置

### 运维（Where & When）
- [`ops/environments.md`](./ops/environments.md) — 本地 / dev / prod 环境
- [`ops/deployment.md`](./ops/deployment.md) — 三端部署流程
- [`ops/secrets.md`](./ops/secrets.md) — 密钥清单与管理
- [`ops/admin-settings-workspace.md`](./ops/admin-settings-workspace.md) — 管理员运行时运营设置（DB 覆盖层、生图/checkpoint 配置）

### 实施任务
- [`specs/`](./specs/) — 按功能模块切分的实施 spec（重新规划中，旧 spec 已归档）

## 技术栈速览

| 层 | 选型 |
|----|------|
| 前端三端 | Expo（React Native + React 19 + Expo Router）→ Web + iOS + Android |
| 后端 | Cloudflare Workers（TypeScript） |
| 数据库 | Cloudflare D1（SQLite） |
| 对象存储 | Cloudflare R2 |
| 状态服务 | Cloudflare Durable Objects |
| 异步任务 | Cloudflare Queues |
| 缓存 | Cloudflare KV |
| LLM | 多供应商架构（admin 可切换；OpenAI / Anthropic / Cloudflare AI 待定） |
| 支付 | Stripe（订阅模式） |
| 包管理 | pnpm workspaces |
| 本地环境 | WSL（Windows Subsystem for Linux）|

## v1 MVP 范围

- 8-10 个都市场景（咖啡馆、办公室、酒吧、公园等）
- 8-10 个官方精品角色
- 用户自创角色功能
- 完整奇点系统（多维度关系数值）
- Stripe 订阅可用（免费额度 + 订阅去限制）
- 三端发布：Web + iOS + Android
- 英文为主

详见 [`product/vision.md`](./product/vision.md)。

## 开发快速入口

```bash
pnpm run:local      # 启动本地：API:8787 + App:8081
pnpm typecheck      # 类型检查
pnpm test           # 测试
pnpm deploy:api:dev # 部署 API 到 dev
pnpm deploy:web:dev # 部署 Web 到 dev
```

环境与部署细节见 [`ops/environments.md`](./ops/environments.md)。
