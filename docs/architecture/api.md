# API 端点清单

> 本文档定义所有 HTTP API 端点。架构总览见 [`overview.md`](./overview.md)，数据模型见 [`data-model.md`](./data-model.md)。
>
> **基础约定：** Base URL `https://aiappsbox.com/api`（prod）/ `https://dev.aiappsbox.com/api`（dev）/ `http://localhost:8787`（local）。所有请求 `Content-Type: application/json`，需要鉴权的请求带 `Authorization: Bearer <JWT>`。

---

## 1. 通用约定

### 1.1 错误响应格式

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Daily limit reached. Subscribe to keep going.",
    "details": { /* 可选 */ }
  }
}
```

### 1.2 通用错误码

| HTTP | code | 说明 |
|------|------|------|
| 400 | `INVALID_REQUEST` | 请求体格式或字段错误 |
| 401 | `UNAUTHENTICATED` | 未登录 / token 失效 |
| 403 | `FORBIDDEN` | 已登录但无权限（如 admin 端点） |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 状态冲突（如重复创建） |
| 402 | `QUOTA_EXCEEDED` | 当日额度用完 |
| 402 | `subscription_required` | 需 Pro 订阅的功能（如生成 companion 表情立绘）被免费用户触发 |
| 429 | `RATE_LIMITED` | 速率限制（10 条/分钟） |
| 500 | `INTERNAL` | 服务端错误 |
| 503 | `LLM_UNAVAILABLE` | 所有 LLM 供应商不可用 |

### 1.3 流式响应

对话端点用 SSE（Server-Sent Events）：

```
event: chunk
data: {"text": "Hello"}

event: chunk
data: {"text": " there"}

event: signals
data: {"closeness": 1, "romance": 1, ...}

event: emotion
data: {"value": "warm"}

event: done
data: {"message_id": "...", "usage": {...}}
```

### 1.4 鉴权

- 登录后获取 JWT（含 user_id、exp、jti）
- 每个需要鉴权的请求 `Authorization: Bearer <JWT>`
- JWT 过期时间 30 天（v1）
- 撤销机制：jti 加入 `sessions.revoked_at` 后即被拒

---

## 2. Auth 端点

### 2.0 v1 登录方式

| 方式 | 平台 | 优先级 | 说明 |
|------|------|--------|------|
| **Google Sign-In (OIDC)** | Web | 主推 | spec-009 第一版落地 |
| **Email Magic Link** | Web | 备选 | Resend 发送，无密码登录 |
| **Apple Sign-In (OIDC)** | iOS / Web | 预留 | spec-009 只定义 provider contract，完整实现跟移动端一起补 |

**不做：** 用户名/密码（v1 不引入密码管理）、验证码 6 位数邮件（用 Magic Link 替代，更现代且可点跳转）。

后端身份模型：
- 一个用户可以绑定多个第三方身份（同邮箱自动合并）
- `users.email` 仍是唯一标识

### 2.1 OIDC 登录

### `GET /auth/oidc/{provider}/start`

发起 OIDC 登录（302 重定向到 provider 授权页）。

```
provider: 'google'   // apple 在 spec-009 只预留接口
Query: ?redirect=<回调到 app 的路径>
Response: 302 Location: https://accounts.google.com/o/oauth2/v2/auth?...
```

服务端在 KV `oauth:state:{state_id}` 存 10 分钟的 state，防 CSRF。`redirect` 只允许同源相对路径或 `ALLOWED_ORIGINS` 内 URL，否则回落到 `AUTH_SUCCESS_URL`。

### `GET /auth/oidc/{provider}/callback`

OIDC provider 回调。

```
Query: ?code=...&state=...
后端：
  1. 校验 state（KV 查找 + 删除）
  2. 用 code 换取 id_token
  3. 验证 id_token 签名 / issuer / audience / expiration
  4. 取 email + sub，在 users 表 upsert（新用户创建，已存在则合并）
  5. 创建 sessions 记录并签发含 jti 的 JWT
  6. 302 重定向到 Web 成功页，token 放在 URL fragment 中
```

### 2.2 Email Magic Link

### `POST /auth/email/send-link`

```json
// Request
{ "email": "user@example.com" }

// dev/prod Response 200
{ "ok": true, "expires_in": 900 }   // 15 分钟
```

dev/prod 域名下，服务端生成一次性 token，发邮件，邮件正文含 `https://aiappsbox.com/api/auth/email/verify?token=...`。
token 只以 SHA-256 hash 存入 KV `magic:{hash}`，TTL 15 分钟，一次性使用。邮件 provider v1 使用 Resend。

localhost 下，`POST /auth/email/send-link` 不发邮件，而是直接签发 session。该行为只允许 API 请求 host 为 `localhost` / `127.0.0.1` / `[::1]` 且 `APP_ENV !== "prod"`：

```json
{
  "ok": true,
  "expires_in": 2592000,
  "token": "...",
  "expiresAt": "2026-06-25T00:00:00.000Z",
  "email": "admin@test.com",
  "user": { "id": "...", "email": "admin@test.com" }
}
```

本地固定测试邮箱：`admin@test.com` 为 admin + Pro，`vip@test.com` 为普通 Pro/VIP，`custom@test.com` 与其他合法邮箱为普通 free。

### `GET /auth/email/verify`

```
Query: ?token=...

后端：
  1. 校验 token（一次性使用，存 KV hash）
  2. 在 users 表 upsert
  3. 创建 sessions 记录并签发含 jti 的 JWT
  4. 302 重定向到 Web 成功页，token 放在 URL fragment 中
```

### 2.3 通用

### `POST /auth/logout`

```json
// Header: Authorization
// Response 200: { "ok": true }
```

服务端将当前 JWT 的 `jti` 对应 `sessions.revoked_at` 置为当前时间；之后该 token 不再通过鉴权。

### `GET /auth/me`

```json
// Header: Authorization
// Response 200
{
  "user": {
    "id": "...",
    "email": "...",
    "display_name": "...",
    "created_at": ...,
    "linked_providers": ["google", "email"]
  },
  "romance_preference": "male" | "female" | "any",
  "subscription": {
    "tier": "free" | "pro",
    "status": "active" | "trialing" | "past_due" | "canceled" | "free",
    "price_id": "price_...",
    "current_period_end": ...,
    "cancel_at_period_end": false
  },
  "quota": {
    "messages_used_today": 12,
    "messages_limit_today": 30,
    "subscriber_soft_threshold_exceeded": false
  }
}
```

**说明：** `current_period_end` 为 Unix milliseconds；免费用户 `price_id/current_period_end` 为 `null`。`romance_preference` 默认 `any`。

### `PATCH /auth/me/preferences`

更新用户的恋爱偏好。**无频次限制**，随时可改、即时生效——下一次进入场景立即按新偏好做加权 spawn。

```json
// Header: Authorization
// Request
{ "romance_preference": "male" | "female" | "any" }

// Response 200
{ "romance_preference": "female" }

// 错误
// 400 invalid_romance_preference (值不在三档之内)
```

---

## 3. Companions 端点

### `GET /companions`

返回用户可见的 companion 列表（官方 + 自创）。

```json
// Header: Authorization
// Query: ?source=official|user|all (default: all)
// Response 200
{
  "items": [
    {
      "id": "...",
      "source": "official",
      "name": "Maya",
      "gender": "female" | "male" | null,
      "relationship_role": "crush",
      "art_url": "https://...",
      "preferred_scenes": ["pier_coffee_shop", "riverside_park"],
      "current_level": "Friend",          // 当前关系等级
      "last_interaction_at": ...
    },
    ...
  ]
}
```

### `GET /companions/{id}`

登录用户读取 companion 详情。响应中的 `art_url` 是当前用户有效 profile 图：如果用户已确认 profile outfit 覆盖，则优先返回覆盖图；否则返回 canonical `companions.art_url`。

响应可包含：

- `canonical_art_url`：数据库 canonical companion 图，不受用户覆盖影响。
- `profile_image_override`：当前用户覆盖图 key；没有覆盖时为 `null`。

公开 discovery（`GET /companions/public`）始终返回 canonical 图，不暴露用户私有覆盖。

### `GET /companions/public`

公开 companion discovery 列表，不要求登录。只返回 active official companions 与 active published public companions；不返回 relationship state 或 owner-only persona 字段。

```json
// Query:
//   ?gender=male|female
//   &art_style=anime|realistic
//   &q=<name-or-tag>
//   &sort=popular|recent
// Response 200
{
  "items": [
    {
      "id": "...",
      "source": "official",
      "is_public": false,
      "name": "Maya",
      "gender": "female",
      "relationship_role": "crush",
      "art_url": "portraits/maya/neutral.webp",
      "preferred_scenes": ["pier_coffee_shop"],
      "tags": ["style:anime"],
      "play_count": 0
    }
  ]
}
```

### Profile Outfit Images

- `GET /companions/{id}/profile-outfit/recommendations`：返回 profile 换装推荐。
- `POST /companions/{id}/profile-outfit/generate`：创建 profile 换装 job；body 为推荐或自定义 prompt。
- `GET /profile-outfit-images/jobs/{job_id}`：轮询 profile outfit job，成功后同步到用户资产。
- `PUT /companions/{id}/profile-image`：用当前用户自己的 succeeded generation 设置 profile 图覆盖。
- `DELETE /companions/{id}/profile-image`：清除当前用户的 profile 图覆盖。

profile 图覆盖按 `(user_id, companion_id)` 隔离，不修改官方 companion 的 canonical `art_url`。

`art_style=anime` 是用户侧 bucket，匹配 `style:anime`、`anime`、`anime_jp`、`anime_kr`、`anime,jp`、`anime,kr`。`art_style=realistic` 匹配 `style:realistic`、`realistic`。Admin/model catalog 可继续保留 `Anime JP` / `Anime KR` 名称区分。

### `GET /companions/{id}`

```json
// Response 200
{
  "id": "...",
  "source": "official",
  "name": "...",
  "gender": "female" | "male" | null,
  "appearance": "...",
  "personality": "...",
  "background": "...",
  "speech_style": "...",
  "art_url": "...",
  "preferred_scenes": [...],
  "relationship": {
    "level": "Friend",
    "dimensions": {
      "closeness": 42,
      "trust": 35,
      "romance": 18,
      "friendship": 50,
      "hostility": 0,
      "tension": 5,
      "distance": 10
    },
    "first_met_at": ...,
    "last_interaction_at": ...
  }
}
```

**说明：** 维度数值用于前端渲染 7 个进度条（gameplay.md §6.4）。前端**展示进度条但不显示原始数字**（如 "42 / 100"），由 UI 层决定可视化策略。

### `POST /companions` (创建用户角色)

```json
// Header: Authorization
// Request
{
  "name": "Alex",
  "gender": "male" | "female",     // 必填，决定场景加权 spawn 中的归属
  "appearance": "...",
  "personality": "...",
  "background": "...",
  "speech_style": "...",
  "relationship_role": "friend"
  // 不传 source（强制 'user'）, preferred_scenes 默认空
}

// Response 201
{ "id": "...", ... }

// 错误
// 400 gender_required 当未传 gender 字段
// 400 invalid_gender 当 gender 不是 'male'/'female'
// 402 QUOTA_EXCEEDED 当 active companion 数 >= 3 且非订阅用户
```

### `PUT /companions/{id}`

修改自创角色（官方角色不可改）。

```json
// Response 200 / 403 FORBIDDEN
```

### `DELETE /companions/{id}`

软删除（标记 `is_active=false`），关系数据保留。

```json
// Response 204
```

### `POST /companions/assist`

AI 辅助生成角色卡（用户填部分字段，AI 补全）。

```json
// Request
{ "seed": { "name": "Alex", "personality": "shy" } }

// Response 200
{
  "suggested": {
    "appearance": "...",
    "background": "...",
    "speech_style": "..."
  }
}
```

---

## 4. Scenes 端点

### `GET /scenes`

主界面场景列表。

```json
// Header: Authorization
// Response 200
{
  "scenes": [
    {
      "id": "pier_coffee_shop",
      "name": "Pier Coffee Shop",
      "mood": "Late afternoon, calm",
      "tags": ["cafe"],
      "art_url": "...",
      "unlocked": true,
      "unlock_hint": null,                 // 未解锁时给提示
      "potential_companions": [             // 当前可能在此出现的角色（仅展示已认识的）
        { "id": "maya", "name": "Maya", "level": "Friend" }
      ]
    },
    ...
  ]
}
```

### `POST /scenes/{scene_id}/enter`

进入场景，触发判定 + 可能的开场事件。

```json
// Response 200
{
  "scene": { /* scene 详情 */ },
  "companions_present": [
    { "id": "maya", "name": "Maya", "opener": "Oh, hey! You're back." }
  ],
  "event": null | { /* 触发的事件，见 §6 */ }
}

// 错误
// 403 FORBIDDEN 场景未解锁
```

---

## 5. Chat 端点

### `POST /chat/{companion_id}/messages` （核心，流式）

```
// Header: Authorization, Accept: text/event-stream
// Request
{
  "text": "Hey, what are you reading?",
  "scene_id": "pier_coffee_shop"
}

// Response: SSE 流（见 §1.3）

// 错误
// 402 QUOTA_EXCEEDED 当日 30 条用完
// 429 RATE_LIMITED 一分钟 10 条
// 503 LLM_UNAVAILABLE 所有 provider 失败
```

**服务端处理：**
1. 校验 auth + 订阅
2. 检查 free quota（KV read/write 计数，v1 接受小竞态）
3. 加载 thread + 关系 + 场景 + 角色卡
4. 构造 prompt，调用 LLM（流式）
5. 流式回传 text
6. 流结束时返回 signals + emotion
7. 更新 relationships 数值
8. 写入 messages 表
9. 成功持久化消息后 increment quota，并异步触发 usage_log + llm_logs

### `GET /chat/{companion_id}/history`

```
// Query: ?limit=50&before_id=xxx (分页)
// Response 200
{
  "messages": [
    { "id": "...", "role": "user", "content": "...", "created_at": ... },
    { "id": "...", "role": "companion", "content": "...", "emotion": "warm", "created_at": ... },
    ...
  ],
  "thread": { "summary": "...", "message_count": 142 },
  "next_cursor": "..."
}
```

### `DELETE /chat/{companion_id}/history`

清空对话历史（保留关系数值）。

```
// Response 204
```

---

## 6. Events 端点

### `GET /events?status=pending`

获取当前待处理事件。

```json
// Response 200
{
  "events": [
    {
      "id": "...",
      "companion_id": "maya",
      "scene_id": "pier_coffee_shop",
      "event_type": "invitation",
      "payload": {
        "description": "Maya invites you to the park this weekend.",
        "options": [
          { "id": "accept_eager", "label": "Sure, I'd love to" },
          { "id": "accept_casual", "label": "Sounds fine" },
          { "id": "decline_busy", "label": "Sorry, I have plans" },
          { "id": "decline_cold", "label": "Not interested" }
        ]
      },
      "created_at": ...
    }
  ]
}
```

### `POST /events/{event_id}/resolve`

```json
// Request
{ "option_id": "accept_eager" }

// Response 200
{
  "result": {
    "description": "Maya beams. 'Great, let's meet here Saturday!'",
    "signals": { "closeness": 2, "romance": 2, "friendship": 1, ... }
  },
  "level_changed": null | "Romantic Interest"  // 等级若变化则告知
}
```

---

## 7. Relationships 端点（只读）

### `GET /relationships/{companion_id}`

```json
// Response 200
{
  "companion_id": "...",
  "level": "Friend",
  "dimensions": {
    "closeness": 42, "trust": 35, "romance": 18, "friendship": 50,
    "hostility": 0, "tension": 5, "distance": 10
  },
  "first_met_at": ...,
  "last_interaction_at": ...,
  "milestones": [                         // 关键里程碑（前端可展示）
    { "type": "first_met", "at": ... },
    { "type": "level_up", "to": "Friend", "at": ... }
  ]
}
```

**说明：** 维度数值用于前端渲染 7 个进度条。`milestones` 给关系时间线视图用。

### `GET /relationships/{companion_id}/timeline` *(v1.x，暂不实现)*

用户与某角色的时间线（关键事件 + 关系等级变化）。

---

## 8. Billing 端点

### `POST /billing/checkout`

创建 Stripe Pro Monthly Checkout Session。服务端只使用 `STRIPE_PRICE_PRO_MONTHLY`，不接受客户端传任意 price。

```json
// Request body 可以为空
{}

// Response 200
{ "checkout_url": "https://checkout.stripe.com/..." }
```

### `POST /billing/portal`

```json
// Response 200
{ "portal_url": "https://billing.stripe.com/p/session/..." }
```

### `GET /billing/status`

```json
{
  "subscription": {
    "tier": "pro",
    "status": "active",
    "price_id": "price_...",
    "current_period_end": ...,
    "cancel_at_period_end": false
  },
  "entitlements": {
    "tier": "pro",
    "message_limit_daily": null,
    "custom_companion_limit": null,
    "subscriber_soft_message_threshold_daily": 1000
  },
  "usage": {
    "date_utc": "2026-05-21",
    "messages_used_today": 12,
    "message_limit_daily": null,
    "subscriber_soft_threshold_exceeded": false
  }
}
```

### `POST /billing/webhook` *(Stripe 调用，无 auth)*

```
// Header: Stripe-Signature
// Body: Stripe event JSON

// 处理事件：见 docs/product/monetization.md §4.4

// Response 200 OK
```

**说明：** 订阅取消、换卡、发票等自助管理统一走 Stripe Customer Portal；v1 不实现 `/billing/cancel`。

---

## 9. Admin 端点 *(需 admin 权限)*

### `GET /admin/llm/config`

```json
// Response 200
{
  "configs": [
    { "task": "chat", "provider": "minimax", "model": "MiniMax-M3", "fallback_provider": "deepseek", "fallback_model": "deepseek-chat" },
    ...
  ]
}
```

### `PUT /admin/llm/config`

```json
// Request
{ "task": "chat", "provider": "minimax", "model": "MiniMax-M3" }

// Response 200
{ "ok": true }
```

### `POST /admin/llm/test`

```json
// Request
{ "provider": "minimax", "model": "MiniMax-M3", "prompt": "Hello, who are you?" }

// Response 200
{ "response": "...", "latency_ms": 1230, "cost_usd": 0.0001 }
```

### `GET /admin/users?search=<email>` (spec-023)

按邮箱精确或前缀匹配用户，供管理员定位 userId。结果上限 20 条。

```json
// Response 200
{ "users": [ { "user_id": "usr_abc", "email": "user@example.com", "tier": "pro" } ] }
```

错误：`search` 为空 → 400 `search_required`；无匹配 → 200 空数组。

### `GET /admin/users/{user_id}/credits` (spec-023)

查指定用户积分余额 + 最近 20 条流水。

```json
// Response 200
{
  "user_id": "usr_abc",
  "available_credits": 320,
  "reserved_credits": 0,
  "recent_ledger": [
    { "id": "led_1", "type": "adjustment", "amount": 200, "balance_after": 320,
      "reason": "compensation for failed generation", "created_at": "2026-05-28T10:00:00.000Z" }
  ]
}
```

错误：用户不存在 → 404 `user_not_found`。

### `POST /admin/users/{user_id}/credits/adjustment` (spec-023)

给用户**增加**积分（只增不减），写 `adjustment` ledger，metadata 记 `admin_id` + `reason`。

```json
// Request
{ "amount": 200, "reason": "compensation for failed generation" }

// Response 200
{
  "user_id": "usr_abc",
  "available_credits": 320,
  "entry": { "id": "led_1", "type": "adjustment", "amount": 200, "balance_after": 320,
             "reason": "compensation for failed generation", "created_at": "2026-05-28T10:00:00.000Z" }
}
```

错误：`amount` 非正整数 → 400 `invalid_amount`；`reason` 为空 → 400 `reason_required`；用户不存在 → 404 `user_not_found`。

> 三个端点均走 `requireAdminUser`（401 `auth_required` / 403 `admin_required`），与 §9 其余 admin 端点一致。其他后台统计接口（`GET /admin/usage` 等）v1 暂不实现完整 dashboard。

### `GET /admin/image-gen-jobs?status=<failed|...>&limit=<N>` (2026-06-01)

只读诊断：列出最近的出图任务及其**真实失败原因**（`error_message` 存 RunningHub 原文，如 `NODE_INFO_MISMATCH`），免去手连 D1。`status` 可选（缺省返回全部最近任务），`limit` 默认 50、上限 200。

```json
// Response 200
{
  "jobs": [
    { "id": "job_1", "status": "failed", "task": "companion_base_art", "workflow_key": "wf1",
      "model": "anime_jp_animagine", "provider": "runninghub", "error_code": "provider_error",
      "error_message": "NODE_INFO_MISMATCH(nodeId=1, fieldName=Anime_JP, reason=field_not_found_in_node_inputs)",
      "provider_task_id": null, "created_at": 1748785108000, "completed_at": 1748785109000 }
  ]
}
```

`fieldName=Anime_JP` 代表旧数据把 style/model 标签误写成 RunningHub 节点字段名；新任务应由 workflow 的 `checkpointFieldName`（通常 `ckpt_name`）提供字段名。

> 配套：base-art job status（`GET /companions/base-art/jobs/{jobId}`）现也透传 `error_message`；生成 companion 表情立绘（`POST /companions/{id}/emotion-art/{emotion}/generate`）对非 Pro 用户返回 402 `subscription_required`。

---

## 10. 健康 / 诊断端点

### `GET /health`

```json
// Response 200
{ "ok": true, "version": "1.0.0-rc.1", "uptime_s": 12345 }
```

### `GET /config/bootstrap`

前端初始化时调用，拉公共配置。

```json
// Response 200
{
  "stripe_publishable_key": "pk_test_...",
  "feature_flags": { "user_companion_creation": true },
  "support_email": "support@aiappsbox.com"   // 来自 ops/secrets.md，TBD
}
```

### `GET /db/ping`

D1 连通性诊断（仅 admin / 内部）。

---

## 11. 路由优先级与中间件

请求处理顺序（Workers 入口 `index.ts`）：

```
1. CORS 校验
2. Body size 限制（默认 1MB）
3. Rate limit（除 webhook 外 10/min/user）
4. Auth 解析（除公共端点：/auth/*, /health, /config/bootstrap, /billing/webhook）
5. 业务路由分发
6. Error 统一格式化
```

---

## 12. 移除 / 弃用的端点（与现有代码对照）

现有代码（参考 `_archive/2026-05/`）含但 v1 删除的端点：

- `/show/*` — 章节式综艺玩法，全部废弃
- `/companion/*/dimensions` — 直接读维度数值的接口，前端不应使用
- `/apps/{appKey}/*`、`/api/{appKey}/*` — multi-app 路由抽象删除

---

## 13. 待最终敲定

- [ ] Google OAuth client ID / secret 获取（dev + prod 各一套，存 wrangler）
- [ ] Apple Sign-In key / team id / client id（dev + prod，spec-009 只预留）
- [ ] Email Magic Link 邮件发送服务（spec-009 选择 Resend）
- [ ] JWT 时长（30 天 vs 7 天 + refresh token）
- [ ] WebSocket 是否替代 SSE 做对话流（v1 用 SSE 简单，v2 看需要）
- [ ] `/companions/assist` 是否计入用户配额（一次辅助生成 ≈ 0.5 对话条）
- [ ] admin 端点的鉴权细节（除邮箱白名单，是否要二级验证）
- [ ] 国际化 / i18n 接口（错误消息走 `accept-language`？v1 仅英文）
