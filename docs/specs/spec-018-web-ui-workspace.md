# spec-018 — Web 桌面工作台 UI 独立化

## Context

当前 Expo app 已经能同时输出 Web / iOS / Android，但早期 UI 为了兼容手机端，Web 上呈现为“移动端页面放大版”：底部 tabs、窄卡片、低信息密度、聊天与管理页都不符合桌面使用习惯。

产品方向已明确：从现在开始优先开发 Web 端体验，mobile UI 日后单独设计。后端、API、hooks、session 和类型仍共享，不拆成独立后端或独立业务逻辑。

## 目标

- Web 端作为桌面工作台独立设计，不再受 mobile UI 妥协限制。
- 未登录 Web 首页使用公开 companion discovery + 登录入口；已登录进入应用工作台。
- 登录后 Web 使用左侧导航、宽屏主内容区和桌面密度布局。
- 覆盖 Web 核心链路：landing/login、scenes、companions、scene detail、companion detail、chat、me、billing、admin。
- 保持 mobile 现有 UI 不被 Web 改造破坏。

## 非目标

- 不新增独立 Next.js / Vite web app。
- 不重做 mobile UI。
- 不改后端 API shape、D1 schema、auth/session 机制。
- 不把 Web 专属视觉逻辑塞回 mobile 默认页面。

## 实现约定

- Web 页面使用 `*.web.tsx`，例如 `scenes.web.tsx`。
- Mobile/native 页面继续使用默认 `.tsx`。
- Web 专属组件放在 `apps/app/components/web/*`。
- 继续共享：
  - `apps/app/api/*`
  - `apps/app/hooks/*`
  - `apps/app/utils/*`
  - `apps/app/constants/*`
  - `packages/shared/*`
- 后续 UI 需求默认先实现 Web；只有明确进入 mobile 阶段时才改 mobile 页面。

## 当前已实施

- Web 专属 public companion discovery home / login。
- Web 专属 app shell：左侧导航、顶部状态区、宽屏内容区。
- Web 专属页面：
  - scenes
  - companions
  - scene detail
  - companion detail
  - chat
  - me
  - billing
  - admin
- Mobile 端保留现有 tabs 与页面。

## 后续工作

- 视觉 polish：统一桌面间距、字号、按钮层级、表格/列表密度。
- Web chat 优化：消息区滚动、右侧关系状态、角色上下文与 scene context。
- Web admin 扩展：LLM 配置、usage、用户/订阅查询、运行状态。
- Web admin 用户积分面板：搜用户 → 看余额/流水 → 增加积分，消费 [`spec-023`](./spec-023-admin-workspace.md) 的管理员积分端点。
- **已落地（2026-05）：** Web admin 已扩展出 **Settings（运行时运营配置）/ Image models（portrait_create 模型目录）/ Expression prompts（portrait_variation）/ LLM** 多面板（仅 Web，原生端保留 members/credits/llm）。运营配置与生图/checkpoint 操作说明见 [`../ops/admin-settings-workspace.md`](../ops/admin-settings-workspace.md)。
- Web billing 完整 QA：checkout、portal、success/cancel return。
- 增加浏览器级 smoke 或 Playwright 检查。

## 验证方式

```bash
pnpm --filter @xtbit/app lint
pnpm -r typecheck
pnpm test
pnpm --filter @xtbit/app export:web
```

dev 部署后至少验证：

- 未登录 `https://dev.aiappsbox.com` 显示 Web public companion discovery home。
- 登录后进入 Web 工作台而不是 mobile tabs。
- `/scenes`、`/companions`、`/chat/{id}`、`/billing`、`/admin` 使用桌面布局。
- mobile 默认 `.tsx` 页面未因 Web 变更被删除或强行改造成桌面布局。

## 回滚

- 删除新增的 `*.web.tsx` 页面与 `components/web/*` 后，Expo 会回退到默认 `.tsx` 页面。
- 保留共享 API/hooks/session/types，不需要回滚后端或数据库。

## 2026-06 收尾范围（web-only）

本轮 Web UI Redesign 收尾以 `/.codex/worktrees/web-ui-redesign` worktree、`codex/web-ui-redesign` 分支为准。附件或会话里的旧长计划不再作为权威来源；后续范围变化先回写本 spec，再动代码。

### 范围

- 只处理 Web 页面与 `apps/app/components/web/*`、`apps/app/components/admin/*` 的视觉层。
- 不改 mobile/native 页面，不改共享 hooks，不改 API shape，不提交 commit。
- 收尾页面为：
  - `apps/app/app/billing/index.web.tsx`
  - `apps/app/app/memories.web.tsx`
  - `apps/app/app/companion-create.web.tsx`
  - `apps/app/app/admin/index.web.tsx` 及现有 admin web 子组件
- Admin 范围按当前真实结构表述为 5 个顶层区域 + 若干已存在子面板：`Users`、`Chat models`、`Portrait generation`、`Prompts`、`Settings`。不要再使用旧的多 section 口径。

### 实现约定

- `WebSidebar` 允许通过 `activeId` 驱动选中态；admin web 仍用单页 state 切换当前区域，不拆新路由。
- `WebFieldRow` 扩展为 `value?: ReactNode` 与 `trailing?: ReactNode`，以便承载只读值、状态 tag、行级按钮或轻量操作区。
- `WebTabs` 继续只接受 `string` id。筛选“全部”用 `'all'` 这类 UI sentinel，在组件外映射回 hook/API 需要的 `null`。

### 验证方式

```bash
pnpm --dir apps/app typecheck
pnpm --dir apps/app export:web
```

文档与实现都应保持以下检查标准：

- `spec-018` 能单独回答本轮改哪些页面、哪些不改、如何验证。
- 文档不再出现与当前代码结构不一致的旧 admin section 口径。
- 命令、组件接口假设、admin 顶层区域名称与当前仓库保持一致。
- `spec-023` 与 `docs/ops/admin-settings-workspace.md` 不暗示本轮会改后端或配置语义。

## 2026-06 首页修订（spec-032）

`spec-032` 取代早期“未登录营销 landing”的口径：Web 上线优先让用户在第一屏浏览真实 companions，并通过 `Female/Male` 与 `Anime/Realistic` 两组筛选直接选择角色。旧浅色营销首页与 fake catalog skeleton 不再作为并行入口保留；mobile/native 页面仍按本 spec 原原则暂不重做。
