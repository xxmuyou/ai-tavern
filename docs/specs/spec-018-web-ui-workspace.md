# spec-018 — Web 桌面工作台 UI 独立化

## Context

当前 Expo app 已经能同时输出 Web / iOS / Android，但早期 UI 为了兼容手机端，Web 上呈现为“移动端页面放大版”：底部 tabs、窄卡片、低信息密度、聊天与管理页都不符合桌面使用习惯。

产品方向已明确：从现在开始优先开发 Web 端体验，mobile UI 日后单独设计。后端、API、hooks、session 和类型仍共享，不拆成独立后端或独立业务逻辑。

## 目标

- Web 端作为桌面工作台独立设计，不再受 mobile UI 妥协限制。
- 未登录 Web 首页使用营销 + 登录入口；已登录进入应用工作台。
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

- Web 专属 landing/login。
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

- 未登录 `https://dev.aiappsbox.com` 显示 Web landing。
- 登录后进入 Web 工作台而不是 mobile tabs。
- `/scenes`、`/companions`、`/chat/{id}`、`/billing`、`/admin` 使用桌面布局。
- mobile 默认 `.tsx` 页面未因 Web 变更被删除或强行改造成桌面布局。

## 回滚

- 删除新增的 `*.web.tsx` 页面与 `components/web/*` 后，Expo 会回退到默认 `.tsx` 页面。
- 保留共享 API/hooks/session/types，不需要回滚后端或数据库。
