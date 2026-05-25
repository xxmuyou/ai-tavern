# 架构总览

> 本文档定义系统的整体架构、模块边界与数据流。详细的数据模型见 [`data-model.md`](./data-model.md)，HTTP API 见 [`api.md`](./api.md)，LLM 集成见 [`llm.md`](./llm.md)。

---

## 1. 高层架构

```
                       ┌────────────────────────────────────────────┐
                       │              用户三端 (Expo)               │
                       │  Web (CF Pages)  /  iOS  /  Android        │
                       └──────────────────┬─────────────────────────┘
                                          │ HTTPS
                                          ▼
                       ┌────────────────────────────────────────────┐
                       │       Cloudflare Workers (API)             │
                       │   /auth  /companions  /scenes  /chat       │
                       │   /events /billing /admin /quota           │
                       └──┬───┬───┬─────────┬───────────┬───────────┘
                          │   │   │         │           │
                ┌─────────▼┐ ┌▼──▼──┐  ┌───▼────┐ ┌────▼────┐
                │   D1     │ │  R2  │  │   KV   │ │Durable  │
                │ (SQLite) │ │assets│  │ cache  │ │ Objects │
                └──────────┘ └──────┘  └────────┘ └─────────┘
                                          │
                                          ▼
                                    ┌──────────┐
                                    │ Queues   │ → 异步任务（摘要、归档、邮件）
                                    └──────────┘

                       ┌────────────────────────────────────────────┐
                       │             外部服务                        │
                       │   LLM 供应商（多供应商，admin 切换）        │
                       │   Stripe（订阅 + Webhook）                  │
                       └────────────────────────────────────────────┘
```

## 2. 模块边界

### 2.1 前端：`apps/app/` （Expo 单 App，Web / Mobile UI 分离）

**职责：**
- Web 与 iOS / Android 共用一个 Expo app、同一套路由体系与构建链路
- API client、hooks、session、types、utils 共享；业务数据流不按平台分叉
- Web UI 和 mobile UI 可以完全不同：Web 使用 `*.web.tsx` 与 `components/web/*`，mobile/native 使用默认 `.tsx`
- 路由（expo-router 文件式路由）
- 主界面（场景列表）、场景详情、对话、角色管理、订阅页
- 调用 API（fetch）+ 流式响应处理（SSE / fetch streaming）

**当前 UI 开发原则（2026-05）：**
- 后续产品 UI 优先开发 Web 桌面体验，mobile UI 日后单独设计
- 不为了适配 Web 去改 mobile 页面；Web 需要独立布局时新增或修改 `*.web.tsx`
- mobile 端当前以“不破坏现状”为目标，除非明确进入 mobile 阶段

**不做：**
- 业务逻辑（关系数值变化、prompt 构造）一律在后端
- 直接调用 LLM（永远经后端代理）

### 2.2 后端：`packages/api/` （Cloudflare Workers）

**职责：**
- 全部业务逻辑
- LLM 供应商集成（统一接口）
- 数据持久化（D1 / R2 / KV）
- 实时对话状态（Durable Objects）
- 用户配额计量 + 订阅校验
- Stripe Webhook 处理

**模块切分（重构后目标）：**
```
packages/api/src/
├── index.ts                ← 入口路由
├── auth/                   ← 认证（邮箱登录 → 后续 OIDC/Magic Link）
├── companions/             ← 角色 CRUD（官方 + 用户自创）
├── scenes/                 ← 场景列表、进入场景
├── chat/                   ← 对话流（流式、信号提取）
├── events/                 ← 事件触发与解析
├── relationships/          ← 奇点数值更新与解锁判定
├── billing/                ← Stripe 集成、配额计量
├── llm/                    ← 多供应商抽象层
├── admin/                  ← admin 管理（LLM 切换、内容审核）
├── domain/                 ← 共享领域逻辑（无副作用）
├── infra/                  ← 共享基础设施（http、security、cors）
└── migrations/             ← D1 migrations
```

### 2.3 共享类型：`packages/shared/`

**职责：** 前后端共用的 TypeScript 类型定义（角色卡 schema、API 请求/响应类型）。

**不做：** 不放业务逻辑、不放运行时代码。

## 3. 数据流：典型对话场景

```
用户在场景中发一条消息
   │
   ▼
[App]  POST /chat/{companion_id}/messages
       body: { scene_id, text }
       header: Authorization
       Accept: text/event-stream
   │
   ▼
[Worker chat handler]
   1. 验证 auth + 订阅状态
   2. 检查配额（KV 计数器）
   3. 加载 thread 历史（D1）+ 角色卡 + 场景定义
   4. 加载关系数值快照（D1）
   5. 构造 prompt（pseudo-code）：
        system: 全局角色扮演规则
        + 角色卡（personality / speech_style）
        + 场景设定（mood, possible_events）
        + 关系状态（隐式表达："你和 Maya 已经聊了 5 次，关系亲密"）
        + 对话历史（最近 N 条 + 摘要）
        + structured output schema（要求 AI 返回 reply + signals）
   6. 调用 LLM（多供应商抽象层，流式）
   7. 流式将 reply 推回前端（SSE）
   8. 同时拿 signals → 规则引擎 → 关系数值更新（D1）
   9. 持久化对话（D1）+ 增加配额计数（KV）
   │
   ▼
[App] 流式接收 → 渲染对话 → 关系等级若变化弹提示
```

## 4. 部署拓扑

| 组件 | 部署位置 | 触发方式 |
|------|---------|---------|
| Workers API | Cloudflare Workers（全球边缘） | `wrangler deploy` |
| Web app | Cloudflare Pages | `pnpm deploy:web:dev` |
| iOS app | EAS Build → App Store | `eas build --platform ios` |
| Android app | EAS Build → Play Store | `eas build --platform android` |
| D1 | Cloudflare D1（区域主 + 全球只读） | migrations 经 wrangler |
| R2 | Cloudflare R2（无区域） | API 上传或 wrangler |

详见 [`ops/deployment.md`](../ops/deployment.md)。

## 5. 环境分层

| 环境 | 用途 | 域名（暂定） | LLM | Stripe |
|------|------|------|-----|--------|
| local | 开发 | `localhost:8787` + `localhost:8081` | mock 或开发 key | test mode |
| dev | 集成验证 | `dev.aiappsbox.com` | test key | test mode |
| prod | 用户访问 | `aiappsbox.com`（待定） | live key | live mode |

环境配置详见 [`ops/environments.md`](../ops/environments.md)。

## 6. 关键技术决策

### 6.1 为什么选 Cloudflare Workers 全栈

- 全球边缘部署，延迟低
- D1 + R2 + Durable Objects + Queues 形成完整数据栈，单一供应商运维成本低
- 与 Expo Web (Cloudflare Pages) 部署同账户，集成顺畅
- 成本可控（按请求计费）

**权衡：** Workers 单请求 30s 上限、CPU time 限制 —— 对长 LLM 流式响应需要小心管理。

### 6.2 为什么 LLM 多供应商抽象

- 避免单点依赖（任何一家 API 抖动、价格涨、政策变都不致命）
- 不同任务用不同模型（如：对话用大模型，信号提取用小模型省成本）
- admin 可在运行时切换（继承已有 spec-005 的设计思路）

详见 [`llm.md`](./llm.md)。

### 6.3 为什么对话状态在 D1 而不在 Durable Object

**选 D1：**
- 对话历史是持久化数据，天然需要 SQL 查询（按用户、按角色、按时间）
- D1 性能足够（每秒数千次写入）

**Durable Object 仅用于：**
- 实时 session 状态（如果引入"在线协作"或"多角色群聊"）
- v1 实际上 DO 可能用得很少 —— 主要是"流式对话期间的临时上下文缓存"

### 6.4 为什么前端用 Expo

- 三端单一代码库（重大节省）
- React 生态完整
- Cloudflare Pages 兼容 Expo Web 输出
- EAS Build 简化原生打包

**权衡：** Web 体验不如纯 Next.js 原生，移动 RN 仍需对接部分原生 API。

## 7. 当前代码状态对照（2026-05-20 快照）

| 模块 | 当前状态 | 目标状态 | 差距 |
|------|---------|---------|------|
| auth | 邮箱登录已实现 | 保留 + 后续接 OIDC | 小 |
| companions | `companion-engine.ts` 1700+ LOC，含 dimensions | 简化角色卡到 ~6 核心字段，dimensions 维度调整 | 中 |
| scenes | 不存在独立 scenes 模块（在 show-engine 里耦合） | 独立 `scenes/` 模块 | 大 |
| chat | 通过 `show-engine.ts` 章节式调度 | 重写为场景内自由对话 | 大 |
| events | 不存在 | 新建 `events/` 模块 | 大 |
| relationships | dimensions + signal extraction 已有（在 `companion-engine` 内） | 独立 `relationships/` 模块 | 中 |
| billing | 占位，Stripe key 未配 | 完整实现 + 配额计量 | 中 |
| llm | OpenAI 单供应商，模型名 `gpt-5-mini`（错） | 多供应商抽象层 | 大 |
| admin | LLM 切换 stub 已有 | 完整 | 中 |
| multi-app 路由 | `/apps/{appKey}` 抽象存在 | **删除** —— 单产品不需要 | 中 |
| `.orig` 备份 | 存在（show-engine.ts.orig, AiCompanionScreen.tsx.orig） | **删除** —— 重构稳定后移除 | 小 |

**改造路径：** 不是推翻重写，而是按模块拆解重组 + 删除不再需要的章节式调度。详见 `specs/`。

## 8. 非目标

为避免架构过度设计，明确以下**不做**：

- ❌ 微服务拆分（Workers API 单服务）
- ❌ GraphQL（用 REST + SSE）
- ❌ 自建 LLM（用外部供应商）
- ❌ 自建认证体系（先邮箱，后接 Cloudflare Access / Magic Link）
- ❌ 跨账户多租户（单产品单数据集）
- ❌ 区域化数据合规（v1 全球单数据集，v2+ 再考虑 EU/CN 分区）
- ❌ 实时多人协作（不是社交产品）

## 9. 待最终敲定

- [ ] 默认 LLM 供应商（OpenAI / Anthropic / Cloudflare AI）→ `llm.md`
- [ ] D1 表结构最终定型 → `data-model.md`
- [ ] 完整 API 端点清单 → `api.md`
- [ ] prod 域名（`aiappsbox.com` 或其他？）→ `ops/environments.md`
