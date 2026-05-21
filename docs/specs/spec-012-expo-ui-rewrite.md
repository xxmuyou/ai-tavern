# spec-012: Expo App UI 重做（v1 Web）

> **类型：** 重写  |  **依赖：** spec-004, 005, 006, 007, 010（009/011 已 done）  |  **估时：** 7-10 天，分 4 阶段  |  **状态：** ⚪ todo（文档已细化，分阶段实施）

---

## Context

`apps/app` 目前是过去综艺玩法（"心动信号" Dating Show、Chapter 1/2/3）的残留代码：`features/ai-companion/AiCompanionScreen.tsx` 一个文件 4400+ 行，把所有玩法揉成一坨；`app/(tabs)/explore.tsx` 是 Cloudflare 操作清单，跟游戏无关。v1 产品方向已经在 [`docs/product/vision.md`](../product/vision.md) 重新定义为"都市奇幻人际沙盒"，核心循环是**场景列表 → 进场景 → 与角色对话 → 关系数值变化**。

后端这边 spec-009（Auth）已 done，spec-011（admin LLM）已 done。剩下的上游 spec（004 companions、005 relationships、006 chat、007 scenes、010 billing）都是 ⚪ todo。本 spec 描述前端 UI 重写，**实施分 P1-P4 四阶段**，每阶段对应一组上游 spec 完成时机。

v1 上线只发 Web（Cloudflare Pages）；iOS/Android 原生 build 是 spec-015 的范围，本 spec 不在交付物里。但代码仍用 Expo 写，保留跨平台能力，方便 spec-015 直接拿来打包。

---

## 关键决策（开工前已敲定）

下面 7 条是开工前已经决定的边界，实施时不必再问：

1. **v1 只上 Web**：本 spec 验收只跑 web build（`apps/app/dist/`）。iOS/Android 原生发布到 spec-015 EAS Build；本 spec 不引入任何 web-only 库、不写 web-only 分支逻辑，以保留跨平台余地。
2. **删旧代码后重写**：第一步删除 `apps/app/features/ai-companion/AiCompanionScreen.tsx`、`apps/app/app/(tabs)/explore.tsx`、`apps/app/app/modal.tsx`、`apps/app/features/` 整个目录。`apps/app/api/companion-client.ts` 保留并裁剪（删旧 Chapter 1/2/3 方法，保留 SSE 工具 `readSseEvent`、token 存储助手、`applySessionFragment`）。
3. **NativeWind 替代 StyleSheet**：本 spec 新增唯一依赖 `nativewind` + peer `tailwindcss`。所有新组件用 `className` 写样式，禁止再写 `StyleSheet.create`。色板从现有 `apps/app/constants/theme.ts` 迁移到 `tailwind.config.js` 的 `theme.extend.colors`。
4. **状态管理不引入新库**：useState + useEffect + localStorage。跨页面的 session / quota / 当前 scene 通过 `localStorage` + 自定义 hook（`use-session.ts`、`use-quota.ts`）共享。**不**引入 Zustand、Redux、Jotai 等。
5. **路由结构 Expo Router file-based**：见下方"改动清单 §B"。三标签：Scenes / Companions / Me。Stack 路由覆盖 scene/[id]、companion/[id]、chat/[companionId]、auth/login、auth/success、billing/index。
6. **未登录守卫**：`<AuthGuard>` 包裹所有业务 tab。未登录访问任一业务页 → 跳 `auth/login`。`auth/login` 页同时提供 3 个入口：dev-session（dev 环境）、Google OAuth、Magic Link。
7. **错误展示统一**：API 错误（401 / 402 quota_exceeded / 429 rate_limited / 5xx）由顶部 `<ErrorBanner>` 组件展示，自动消失或手动关闭。404 / 网络错由 Expo Router 的 `+not-found.tsx` 与 `ErrorBoundary` 兜底。

---

## 目标

明确落地 8 个区域：

- **A. `auth/success` 页**：消化 spec-009 fragment（`#token=...&expires_at=...&email=...`）和 error query（`?error=<code>`），写入 localStorage，跳首页
- **B. `auth/login` 页**：3 个登录入口（dev / Google / Magic Link）
- **C. Scenes 列表 + scene/[id]**：消费 spec-007 `GET /scenes`、`POST /scenes/{id}/enter`
- **D. Companions 列表 + companion/[id]**：消费 spec-004 `GET /companions`、`GET /companions/{id}`，含 7 维度进度条
- **E. Chat 页 `chat/[companionId]`**：消费 spec-006 SSE `POST /chat/{id}/messages`、`GET /chat/{id}/history`
- **F. Me 页**：消费 spec-009 `GET /auth/me` + spec-010 `GET /billing/status`
- **G. Billing 升级/管理页**：消费 spec-010 `POST /billing/checkout`、`POST /billing/portal`
- **H. 通用基础设施**：AuthGuard、ErrorBanner、QuotaBadge、HTTP client、NativeWind 配置、root layout

## 非目标

- ❌ iOS / Android 原生 build（spec-015）
- ❌ 推送通知
- ❌ Admin UI（独立 spec，本 spec 不消费 `/admin/llm/*`）
- ❌ 多语言 i18n（v1 仅中文）
- ❌ 用户角色定制 / persona 切换（[`vision.md §12`](../product/vision.md) 出 v1）
- ❌ Chapter 1 / 2 / 3 旧玩法（删除）
- ❌ 角色社区分享 / 公开浏览（[`vision.md §12`](../product/vision.md) 出 v1）
- ❌ 角色离线缓存 / PWA service worker
- ❌ Zustand / Redux / Tamagui 等额外大依赖
- ❌ 自定义 SSE 实现（复用现有 `readSseEvent`）
- ❌ Chat history 全量加载（必须用 cursor 分页）
- ❌ 图片懒加载 / CDN 上的 thumbnail 协商（v1 静态 R2 URL）

---

## 改动清单

### A. 依赖与基建

新 deps 写到 `apps/app/package.json`：

```json
{
  "dependencies": {
    "nativewind": "^4"
  },
  "devDependencies": {
    "tailwindcss": "^3.4"
  }
}
```

新增配置文件：

- **`apps/app/tailwind.config.js`**：`content` 覆盖 `app/**/*.{tsx,ts}` 与 `components/**/*.{tsx,ts}`；`theme.extend.colors` 把现有 `constants/theme.ts` 的 light / dark 色板搬过去（用 CSS 变量或两套 palette）；`presets: [require('nativewind/preset')]`。
- **`apps/app/babel.config.js`**：加 `presets: ['nativewind/babel']`，`jsxImportSource: 'nativewind'`。
- **`apps/app/global.css`**：`@tailwind base; @tailwind components; @tailwind utilities;` —— Expo Router web 入口（`_layout.tsx`）import 此文件。
- **`apps/app/nativewind-env.d.ts`**：`/// <reference types="nativewind/types" />`。

`constants/theme.ts` 可保留为 `tailwind.config.js` 的 source of truth，避免散两份色板。

### B. 路由结构（Expo Router）

```
apps/app/app/
├── _layout.tsx                    # 根布局；挂 <ErrorBanner/> + import global.css
├── +not-found.tsx                 # 404 兜底页
├── auth/
│   ├── login.tsx                  # 登录页：dev / Google / Magic Link 三入口
│   └── success.tsx                # 落点页：fragment 解析 + error 展示 + 跳首页
├── (tabs)/
│   ├── _layout.tsx                # 三标签布局：Scenes / Companions / Me
│   ├── scenes/index.tsx           # 场景列表（默认首页）
│   ├── companions/index.tsx       # 我的角色列表（official + user）
│   └── me/index.tsx               # 个人页 + 订阅状态 + 登出
├── scene/[id].tsx                 # 场景详情：companions present + 进入按钮
├── companion/[id].tsx             # 角色详情：关系级别 + 7-dim 进度条
├── chat/[companionId].tsx         # 对话页：SSE 流 + history 分页
└── billing/index.tsx              # 订阅升级 / Portal 跳转
```

打开 app 默认进 `(tabs)/scenes/index.tsx`（`(tabs)/_layout.tsx` 的 `initialRouteName`）。未登录 → `<AuthGuard>` 触发 `router.replace('/auth/login')`。

### C. 组件清单（`apps/app/components/`）

每个一行说明，要求每个组件 ≤ 120 行、单一职责：

- **`ErrorBanner.tsx`** —— 顶部 dismissable banner，从 `useErrorContext()` 读 error 队列
- **`AuthGuard.tsx`** —— `useSession()` 检查 token + 未过期，否则 redirect 到 `/auth/login`
- **`TopBar.tsx`** —— 业务页通用顶栏：返回按钮 + 标题 + 右侧 QuotaBadge
- **`QuotaBadge.tsx`** —— 显示 `messages_used_today / message_limit_daily`；free 用户接近上限变橙红，Pro 显示"Pro"标签
- **`SceneCard.tsx`** —— 场景卡：banner 图 + 名字 + mood 短描述 + locked 锁标
- **`CompanionCard.tsx`** —— 角色卡：头像 + 名字 + relationship.level 标签
- **`DimensionBar.tsx`** —— 单条 7-dim 进度条；接 props `{ label, value, polarity: 'positive'|'negative' }`
- **`DimensionBoard.tsx`** —— 7 条 DimensionBar 聚合，按正/负分组展示
- **`MessageBubble.tsx`** —— 一条对话气泡（user 右、companion 左 + 头像 + 情绪 emoji）
- **`StreamingBubble.tsx`** —— 流式渲染中的 companion 气泡（"思考中..."→ 渐入文字）
- **`Button.tsx`** —— 全局按钮（primary / secondary / danger）
- **`LoadingScreen.tsx`** —— 全屏 spinner（loading state 复用）
- **`EmptyState.tsx`** —— 空列表占位（图标 + 文案 + CTA）

### D. Hook 清单（`apps/app/hooks/`）

- **`use-session.ts`**（替换现有 `use-auth-email.ts`）—— `{ session, signInDev, signInGoogle, sendMagicLink, signOut, isLoading, error }`。内部：localStorage 读写、token 过期判断、未登录返回 null
- **`use-api.ts`** —— 基础 fetch 包装。自动注入 `Authorization: Bearer`；统一错误处理：401 → 清 session + 跳 login、402 → 抛 `QuotaExceededError`、429 → 抛 `RateLimitedError(retryAfter)`、5xx → 抛 `ServerError`。返回 `{ data, error, isLoading, refetch }`
- **`use-error-banner.ts`** —— 全局错误队列。`pushError(message)` / `dismissError(id)`，配合 `<ErrorBanner/>` 组件
- **`use-scenes.ts`** —— `GET /scenes` 包装；缓存到 `useState`，刷新页面重新拉
- **`use-companions.ts`** —— `GET /companions?source=...` 包装
- **`use-companion.ts`** —— `GET /companions/{id}` 单角色 + 关系状态
- **`use-relationship.ts`** —— `GET /relationships/{companion_id}`，含 7-dim 和 level
- **`use-chat-history.ts`** —— `GET /chat/{id}/history` 分页（cursor `before_id`）
- **`use-chat-stream.ts`** —— `POST /chat/{id}/messages` SSE 客户端，封装 chunk / signals / emotion / done / error 事件
- **`use-me.ts`** —— `GET /auth/me`，含订阅信息
- **`use-billing.ts`** —— `GET /billing/status`、`POST /billing/checkout` 返回 url、`POST /billing/portal` 返回 url

### E. API client 清单（`apps/app/api/companion-client.ts`）

裁剪现有文件，**删**：

- `createDevSession`（保留）
- `fetchShowCharacters / fetchShowWorkspace / joinWorkspaceGuest / createShowCharacter / fetchShowCharacterPackage / updateShowCharacterPackage` —— Chapter 1 / 2 / 3 全删
- `createChapterOneSession / fetchShowSession / answerShowTurn / answerShowTurnStream / previewShowSpeech / finalizeShowSession` —— 删
- `createChapterTwoDateSession / fetchChapterTwoDateSession / answerChapterTwoDateTurn / fetchChapterTwoLocations` —— 删
- `fetchCharacters / fetchCharacter / fetchRelationship / createRelationship / fetchScenes / createSceneSession / answerSceneTurn` —— 删（与新 spec 路径不同）
- `uploadSystemAsset` —— 删（admin 独立 spec）

**保留**：

- `AUTH_TOKEN_STORAGE_KEY` / `AUTH_EXPIRES_STORAGE_KEY` / `EMAIL_STORAGE_KEY` 等常量
- `readStoredAuthToken / writeStoredAuthSession / clearStoredAuthSession / applySessionFragment / startGoogleLogin / sendMagicLink / fetchMe / logout` —— spec-009 已加，不动
- `objectUrl(key)` —— R2 asset URL 拼接，DimensionBar / SceneCard 用
- `requestJson` 与 `readSseEvent` 内部工具

**新增**：

```ts
// scenes (spec-007)
getScenes(): Promise<ScenesListResponse>
enterScene(sceneId: string): Promise<SceneEnterResponse>

// companions (spec-004)
listCompanions(source?: 'official' | 'user' | 'all'): Promise<CompanionsListResponse>
getCompanion(id: string): Promise<CompanionDetailResponse>
createCompanion(input: CompanionCreateInput): Promise<CompanionDetailResponse>
updateCompanion(id: string, input: Partial<CompanionCreateInput>): Promise<CompanionDetailResponse>
deleteCompanion(id: string): Promise<{ ok: true }>

// relationships (spec-005)
getRelationship(companionId: string): Promise<RelationshipResponse>

// chat (spec-006)
getChatHistory(companionId: string, opts: { limit?: number; beforeId?: string }): Promise<ChatHistoryResponse>
clearChatHistory(companionId: string): Promise<{ ok: true }>
// sendChatMessage 是流式，单独导出，返回 AsyncIterable<SseEvent>

// billing (spec-010)
getBillingStatus(): Promise<BillingStatusResponse>
startCheckout(): Promise<{ checkout_url: string }>
openBillingPortal(): Promise<{ portal_url: string }>
```

类型定义放在 `apps/app/api/types.ts`，与上游 spec 文档的 response shape 对齐（实施时若 spec 字段名跟实际 API 实现有差，以 API 实现为准并回填 spec 文档）。

### F. 关键交互（每区写状态机 + 错误处理）

#### F.1 `auth/success.tsx`（区 A）

**入参**：URL 形如 `https://aiappsbox.com/auth/success#token=...&expires_at=...&email=...` 或 `https://aiappsbox.com/auth/success?error=invalid_oauth_state`。

**流程**：

1. 进入页面立刻 read `window.location.hash` + `window.location.search`
2. 若 hash 里有 `token=` → 调 `applySessionFragment(hash)` → 写 localStorage → `router.replace('/(tabs)/scenes')`
3. 若 query 里有 `error=<code>` → 按下表映射文案，渲染 ErrorScreen，下方"重新登录"按钮跳 `/auth/login`
4. 都没有 → 跳 `/auth/login`

**错误码 → 文案表**：

| code | 文案 |
|------|------|
| `invalid_oauth_state` | 登录会话已过期，请重试 |
| `invalid_oauth_token` | 第三方登录验证失败，请重试 |
| `email_unverified` | 您的 Google 账户邮箱尚未验证，请验证后重试 |
| `invalid_magic_link` | 此登录链接已失效，请重新发送 |
| `provider_not_configured` | 该登录方式暂未开放 |
| 其他 | 登录失败，请稍后重试 |

#### F.2 `auth/login.tsx`（区 B）

**布局**：居中卡片，从上到下：

- Logo / 标题
- Email 输入框 + 「发送登录链接」按钮（→ `sendMagicLink(email)`，成功后切 toast "登录链接已发送至 <email>，请在 15 分钟内点击"）
- 「使用 Google 登录」按钮 → `startGoogleLogin(redirect='/auth/success')`
- dev 环境额外显示「Dev Sign-In（仅开发环境）」面板：email 输入 + 按钮 → `createDevSession(email)` → `applySession()` → 跳 `/(tabs)/scenes`

**dev 检测**：`process.env.EXPO_PUBLIC_API_URL` 包含 `localhost` 或 `127.0.0.1` 或 `dev` 时显示 dev 入口；prod build 隐藏。

#### F.3 Scenes 列表（区 C，`(tabs)/scenes/index.tsx`）

**状态机**：loading（spinner）→ ready（render list）/ empty（"还没有场景" + dev 提示）/ error（ErrorBanner + 重试）

**渲染**：垂直滚动 `FlatList`，每个 `SceneCard` 占满宽度 + 16px 间距。卡片内容：

- 场景 banner 图（`objectUrl(scene.image_url)`），按 16:9 比例
- 场景名字（大字号）
- mood 描述（次要字号）
- locked 标：右上角锁图标 + "需要 与 <companion> 的 <dimension> ≥ <value>"（来自 `unlock_hint`）
- 点击：解锁 → 跳 `/scene/[id]`；锁定 → 显示 Tooltip 提示解锁条件，不跳转

#### F.4 Scene 详情（区 C，`scene/[id].tsx`）

**数据源**：`POST /scenes/{id}/enter` 进入即调，返回 scene meta + `companions_present`。

**渲染**：

- Top：场景 banner + 名字 + mood
- Middle：companions_present 横向滚动头像列表，每个 `CompanionCard` 显示头像 + 名字 + level 标签
- Bottom：单个「进入对话」按钮（如果只有 1 个 companion） 或 点 companion 卡进对话（多个时）

**特殊**：locked → 返回 403 → 跳回 scenes list + push error "该场景未解锁"

#### F.5 Companions 列表（区 D，`(tabs)/companions/index.tsx`）

**渲染**：

- Tab 切换：「全部」「我创建的」「官方」对应 `?source=all|user|official`
- Grid（2 列）`CompanionCard`：头像 + 名字 + level
- 右下角 FAB「+ 创建新角色」（仅 source=user 时显示，free 用户上限 3）
- 点击卡 → `/companion/[id]`

#### F.6 Companion 详情（区 D，`companion/[id].tsx`）

**布局**：

- Top：大头像 + 名字 + level 大标签
- Middle：「关系」section，渲染 `<DimensionBoard/>` —— 7 条进度条：
  - **正向 4 条**（绿/橙渐变）：亲密度 closeness、信任 trust、爱意 romance、友谊 friendship
  - **负向 3 条**（蓝/紫渐变）：敌意 hostility、紧张 tension、疏离 distance
  - 每条标 0-100 数值；柔和过渡动画（width transition 300ms ease）
- Middle 2：「初遇时间」（first_met_at 格式化）+「最近互动」（last_interaction_at）
- Bottom：「开始对话」按钮 → `/chat/[id]`
- 若是 user-created：底部加「编辑」「删除」按钮

#### F.7 Chat 页（区 E，`chat/[companionId].tsx`）

**状态**：

- `messages: Message[]`（user / companion，按时间正序）
- `streaming: { text: string; partialEmotion?: string } | null`（当前流式中的 companion 回复）
- `hasMore: boolean` + `nextCursor: string | null`（history 分页）
- `quotaError: QuotaExceededError | null`

**初次渲染**：

1. `useChatHistory(companionId, { limit: 30 })` 拉初始 30 条 → 倒序展示（最新在底）
2. ScrollView 自动滚到底
3. 顶部"上拉加载更多"触发 `getChatHistory({ before_id: messages[0].id })`

**发送消息**：

1. 用户在底部 input 输入 → 「发送」
2. 立即把 user message append 到本地列表，input 清空
3. 显示 `<StreamingBubble text="" />` 占位
4. 启动 `useChatStream({ companionId, text, sceneId })`
5. 事件处理：
   - `chunk` → append 到 streaming.text，触发滚动跟随
   - `signals` → 暂存（不立即显示）
   - `emotion` → 暂存
   - `done` → message_id 落地、StreamingBubble 转为正式 MessageBubble（含 emotion emoji）、刷新 relationship 触发 DimensionBoard 动画（如果当前页有可见 board，否则下次进 companion/[id] 看到新数值）
   - `error` → push error banner，对话失败的占位气泡删掉
6. quota 错误（402）→ 弹 modal "今日 30 条已用完，升级到 Pro 解锁无限对话" + 按钮跳 `/billing`
7. rate 错误（429）→ banner "请求过快，<Retry-After>秒后再试"，按钮 disable，倒计时

**情绪 emoji 映射**（spec-006 emotion 枚举）：

| emotion | emoji |
|---------|-------|
| warm | 😊 |
| neutral | 😐 |
| guarded | 😶 |
| playful | 😏 |
| tense | 😟 |
| annoyed | 😤 |

**清空 history**：右上角菜单「清空对话」→ 二次确认 → `clearChatHistory` → 重置消息列表

#### F.8 Me 页（区 F，`(tabs)/me/index.tsx`）

**数据源**：

- `GET /auth/me`（spec-009）—— user.email、display_name、linked_providers、email_verified
- `GET /billing/status`（spec-010）—— tier、quota、subscription period

**渲染**：

- Top：头像（v1 用默认）+ display_name 或 email
- Section "账户"：email、已绑定登录方式（Google / Email Magic Link 标签）
- Section "订阅"：
  - free：「免费版」+「30 条/天，3 个角色」+ 大按钮「升级到 Pro」→ `/billing`
  - pro：「Pro」+「无限对话」+ next billing date + 「管理订阅」按钮 → 调 `openBillingPortal()` → 跳 portal URL
- Section "用量"：今日 `messages_used_today / message_limit_daily`（free）或 `messages_used_today + 软上限提示`（pro）
- Section "其他"：版本号、退出登录按钮

#### F.9 Billing 页（区 G，`billing/index.tsx`）

**入口**：从 Me 页「升级」按钮、或 chat quota error modal 跳过来。

**渲染**：

- 价格卡：「Pro 订阅，¥XX/月」+ 特性列表（无限对话、无限角色、优先体验新场景）
- 大按钮「立即升级」→ `startCheckout()` 返回 `checkout_url` → `window.location.href = url`（web）/ `Linking.openURL(url)`（native，本 spec 不验）
- 已是 Pro：渲染「您已是 Pro 会员」+ 管理订阅按钮 → `openBillingPortal()`

**回跳**：Stripe Checkout 完成后 redirect 到 `STRIPE_SUCCESS_URL`（spec-010 wrangler 里配，比如 `/billing?status=success`）→ 本页读 `?status=success` 显示 toast + 5 秒后跳回 `/(tabs)/scenes`。

### G. 通用基础设施（区 H）

**`<ErrorBanner/>` 全局挂载**：在 `_layout.tsx` 根布局顶部固定，z-index 高于内容。多个 error 排队展示，每个 4 秒自动消失或点 X 关闭。

**`<AuthGuard/>` 守卫**：包裹 `(tabs)/_layout.tsx` 和所有需要登录的 stack 页。loading 中 → 显示全屏 spinner；无 session → `router.replace('/auth/login')`；有 session → render children。

**HTTP 错误统一处理**（在 `use-api.ts`）：

| HTTP | 处理 |
|------|------|
| 200 | return data |
| 401 | clear session + redirect to /auth/login + push error "登录已过期，请重新登录" |
| 402 quota_exceeded | throw QuotaExceededError，caller 自决（chat 弹 modal、companion create 弹 modal） |
| 429 rate_limited | throw RateLimitedError（带 Retry-After），caller 显示倒计时 |
| 403 | throw ForbiddenError，push error "无权限" |
| 404 | throw NotFoundError |
| 5xx | throw ServerError，push error "服务器开小差，请稍后重试" |
| 网络错 | throw NetworkError，push error "网络连接异常" |

---

## 阶段化实施步骤

### P1（spec-009 完成即可启动；约 2 天）

**目标**：基建 + 登录链路跑通。验证完即可上 dev Pages。

1. 装依赖、加配置（NativeWind / tailwind config / global.css）
2. 删旧文件（AiCompanionScreen / explore.tsx / features/ / modal.tsx）
3. 裁剪 `companion-client.ts`
4. 写 `use-session.ts` + `use-api.ts` + `use-error-banner.ts`
5. 路由骨架：`_layout.tsx`、`(tabs)/_layout.tsx`、三个 tab index 占位、`auth/login`、`auth/success`、`+not-found`
6. `<AuthGuard/>` + `<ErrorBanner/>` + `<TopBar/>` + `<Button/>`
7. `me/index.tsx` 占位实现（接 fetchMe，只显示 email + 登出按钮）
8. 验证：本地 + dev pages 走 Google → success → tabs；dev-sign-in → success → tabs；Magic Link → email → success → tabs

### P2（依赖 spec-004 + 005 + 007；约 3 天）

9. `use-scenes` + `<SceneCard/>` + `(tabs)/scenes/index.tsx`
10. `scene/[id].tsx`
11. `use-companions` + `use-companion` + `<CompanionCard/>` + `(tabs)/companions/index.tsx`
12. `<DimensionBar/>` + `<DimensionBoard/>` + `companion/[id].tsx`
13. 验证：scene 列表锁/解锁两组数据；进入 scene 看到 companions；点角色看到 7 维度条；进度条 0/50/100 视觉

### P3（依赖 spec-006；约 2-3 天）

14. `use-chat-history` + `use-chat-stream` + `<MessageBubble/>` + `<StreamingBubble/>` + `chat/[companionId].tsx`
15. 顶部"加载更多" + 底部 input + 发送 + emotion emoji
16. quota / rate-limit / error 三类错误 UI
17. 清空对话二次确认
18. 验证：单 turn / 多 turn / 触发 quota / 触发 rate / SSE 中断重连

### P4（依赖 spec-010；约 1-2 天）

19. `use-billing` + `<QuotaBadge/>`（挂到 TopBar）
20. Me 页订阅 section 接真实 `/billing/status`
21. `billing/index.tsx` + checkout / portal 跳转
22. Stripe 完成回跳 `?status=success` 处理
23. 验证：free 用户走完 checkout → 显示 Pro；pro 用户走 portal 取消

---

## 验证方式

每阶段实施完成后逐条 check：

**P1**：
- [ ] `pnpm --filter @xtbit/app build` 干净（web build 产物在 `dist/`）
- [ ] `pnpm --filter @xtbit/app typecheck` 干净
- [ ] 本地开发 server `pnpm --filter @xtbit/app web` 启动，访问 `localhost:8081` 看到登录页
- [ ] 三种登录方式各跑一次端到端（dev / Google / Magic Link）
- [ ] 部署 dev Cloudflare Pages 一次验证
- [ ] 主动失效 token 后访问业务页 → 跳登录

**P2**：
- [ ] D1 dev 库 seed 至少 2 个解锁 + 2 个锁定的 scene
- [ ] 每个 scene 至少 1 个 companion
- [ ] DimensionBar 视觉过 0 / 25 / 50 / 75 / 100 五档对齐
- [ ] 正负向条颜色规范

**P3**：
- [ ] 单 turn 流式响应 chunks 正确拼接
- [ ] signals 后 dimension 变化在 companion 详情页能看到
- [ ] emotion emoji 在 message bubble 上正确显示
- [ ] 第 31 条消息（free 账号）触发 quota modal
- [ ] 高频发送触发 429（mock 或本地 rate-limit lower 阈值）
- [ ] SSE 中途断网 → error banner

**P4**：
- [ ] free → checkout → Stripe 测试卡 → pro
- [ ] pro → portal → 取消订阅 → 期末降为 free
- [ ] QuotaBadge 在 free/pro 两种状态显示正确
- [ ] webhook 由 spec-010 验证，本 spec 不验证

---

## 回滚

- **整 spec 回滚不现实**（删了旧 AiCompanionScreen），实施前 tag `pre-spec-012` 保留旧分支
- **按阶段独立 PR**，每阶段失败只回滚该阶段提交
- **数据层不动**，回滚只影响前端 build
- Web 部署：Cloudflare Pages 支持回滚到上一个 deployment，分钟级生效

---

## 依赖

- ⬅️ 阻塞：spec-004（companions API）、spec-005（relationships API）、spec-006（chat SSE）、spec-007（scenes API）、spec-010（billing API）
- ⬅️ 软依赖：spec-009（auth，已 done）、spec-011（admin，已 done，本 spec 不消费）
- ➡️ 解锁：spec-013（v1 内容 seed，无前端依赖但内容看得见才有意义）、spec-015（EAS Build 上原生，直接拿 spec-012 代码打包）
- 与 spec-014（Cloudflare 自定义域）无依赖，但 prod 上线前必须先完成 014

---

## 关键参考文档（实施者必读）

- [`docs/product/vision.md §7`](../product/vision.md) 核心循环（场景 → 对话 → 关系）
- [`docs/product/gameplay.md §1`](../product/gameplay.md) 主界面（场景列表）
- [`docs/product/gameplay.md §4`](../product/gameplay.md) 对话系统
- [`docs/product/gameplay.md §6.4`](../product/gameplay.md) 数值可见性（7 维度展示规范）
- [`docs/product/content.md §2`](../product/content.md) 10 场景清单（spec-013 才 seed，本 spec 只需路由路径稳定）
- [`docs/architecture/overview.md §2.1`](../architecture/overview.md) 前端架构
- [`docs/architecture/api.md`](../architecture/api.md) 端点总表（各上游 spec 实施完成后回填）
- 上游 spec：`spec-004 §改动清单`、`spec-005 §API`、`spec-006 §SSE`、`spec-007 §端点`、`spec-009 §F/G`、`spec-010 §端点`

---

## 与 spec-009 / 011 的交接清单

**spec-009 留给本 spec 的钩子**：

- `applySessionFragment(hash)` —— 在 `auth/success.tsx` 调用
- `startGoogleLogin(redirect)` —— 在 `auth/login.tsx` Google 按钮
- `sendMagicLink(email, redirect?)` —— 在 `auth/login.tsx` Email 表单
- `fetchMe()` —— 在 me 页
- `logout()` —— 在 me 页登出
- `clearStoredAuthSession()` / `writeStoredAuthSession()` —— `use-session.ts` 内部调用

spec-009 实施时已在 `apps/app/api/companion-client.ts` 加好这些函数；spec-012 P1 阶段不需要回头改 spec-009 的代码，只消费即可。

**spec-011 的 admin 端点不在本 spec 范围**：本 spec 任何地方不调 `/admin/llm/*`。后续 admin UI 是独立 spec，可能基于 spec-012 的组件库（DimensionBar、Button、ErrorBanner）做。
