# API 端点清单

> 本文档定义所有 HTTP API 端点。架构总览见 [`overview.md`](./overview.md)，数据模型见 [`data-model.md`](./data-model.md)。
>
> **基础约定：** Base URL `https://aiappsbox.com/api`（prod）/ `https://dev.aiappsbox.com/api`（dev）/ `http://localhost:8787`（local）。所有请求 `Content-Type: application/json`，需要鉴权的请求带 `Authorization: Bearer <JWT>`。

---

## 1. 通用约定

### 1.1 错误响应格式

错误体是**扁平结构**，`error` 直接是 snake_case 字符串码（不是嵌套对象）。个别端点会附带 `message` 等额外字段。

```json
{ "error": "quota_exceeded" }
```

```json
// 带附加说明的例子（如已退役端点）
{ "error": "feature_retired", "message": "Companion emotion-art generation has been retired." }
```

### 1.2 通用错误码

> 错误码均为 snake_case 小写。下表为跨模块通用码，各端点专属码（如 `invalid_companion_id`、`gender_required`）见对应小节。

| HTTP | code | 说明 |
|------|------|------|
| 400 | `invalid_request` / `invalid_body` | 请求体格式或字段错误 |
| 401 | `auth_required` / `invalid_token` | 未登录 / token 失效 |
| 403 | `forbidden` / `admin_required` / `forbidden_not_owner` | 已登录但无权限 |
| 404 | `not_found` | 资源不存在 |
| 405 | `method_not_allowed` | 方法不允许 |
| 402 | `quota_exceeded` | 当日额度用完 / 额度限制 |
| 410 | `endpoint_retired` / `feature_retired` | 端点或功能已退役（见 §13） |
| 413 | `request_body_too_large` | 请求体超过大小限制（默认 1MB） |
| 429 | `rate_limited` | 速率限制 |
| 500 | `internal_error` | 服务端错误 |
| 503 | `llm_unavailable` | 所有 LLM 供应商不可用 |

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
// Response 200 —— 扁平结构，字段不包在 user{} 里
{
  "id": "...",
  "email": "...",
  "email_verified": true,
  "display_name": "...",
  "romance_preference": "male" | "female" | "any",
  "timezone": "Asia/Shanghai",
  "push_enabled": false,
  "linked_providers": ["google", "email"],
  "is_admin": false,
  "subscription": {
    "tier": "free" | "pro",
    "status": "active" | "trialing" | "past_due" | "canceled" | "free",
    "price_id": "price_...",
    "current_period_end": ...,
    "cancel_at_period_end": false
  },
  "quota": {
    "messages_limit_today": 30,
    "messages_used_today": 12,
    "subscriber_soft_threshold_exceeded": false
  }
}
```

**说明：** `current_period_end` 为 Unix milliseconds；免费用户 `price_id/current_period_end` 为 `null`。`romance_preference` 默认 `any`。`is_admin` 来自邮箱白名单覆盖。

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

`art_style=anime` 是用户侧 bucket，只匹配 `style:anime`、`anime`。`art_style=realistic` 匹配 `style:realistic`、`realistic`。Admin/model catalog 的主分类同样只保留 `Anime` / `Realistic`。

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
  "relationship_role": "friend",
  "voice_id": "Arrogant_Miss",
  "voice_speed": "slow" | "medium" | "fast"
  // 不传 source（强制 'user'）, preferred_scenes 默认空
}

// Response 201
{ "id": "...", ... }

// 错误
// 400 gender_required 当未传 gender 字段
// 400 invalid_gender 当 gender 不是 'male'/'female'
// 400 invalid_voice_id 当 voice_id 不在当前 MiniMax voice catalog 中
// 400 invalid_voice_speed 当 voice_speed 不是 slow/medium/fast
// 402 QUOTA_EXCEEDED 当 active companion 数 >= 3 且非订阅用户
```

### `PUT /companions/{id}`

修改自创角色（官方角色不可改）。

```json
// Request 可部分更新 POST /companions 的字段，也包括:
{
  "voice_id": "English_Graceful_Lady",
  "voice_speed": "fast"
}

// Response 200 / 403 FORBIDDEN
```

### `GET /voice/options`

返回 MiniMax voice catalog、默认 voice 和语速档位，供创建/编辑 companion 时选择。
`group_id` 属于服务端 TTS 调用配置，不在此响应中返回。

```json
{
  "provider": "minimax",
  "defaults": {
    "female_voice_id": "Arrogant_Miss",
    "male_voice_id": "male-qn-qingse",
    "speed": "medium"
  },
  "speed_presets": [
    { "id": "slow", "label": "Slow", "value": 0.8 },
    { "id": "medium", "label": "Medium", "value": 1 },
    { "id": "fast", "label": "Fast", "value": 1.25 }
  ],
  "voices": [
    {
      "id": "Arrogant_Miss",
      "label": "嚣张小姐",
      "language": "zh-mandarin",
      "language_label": "中文 (普通话)",
      "gender_hint": "female"
    }
  ]
}
```

`language` 只用于 UI 分组/筛选；语音合成仍使用 MiniMax
`language_boost: "auto"`。`gender_hint` 只用于推荐排序，不限制选择。

### `POST /voice/preview`

为创建/编辑 companion 表单中选定的 voice id 生成或复用试听音频 URL。试听文本固定为
`Hi, I’m here with you. Let’s take this one moment at a time.`，试听语速固定为
`medium`，不读取 companion 表单中的 `voice_speed`。试听音频是全局 R2 缓存，不按用户、
companion 或 message 分桶。

```json
// Header: Authorization
// Request
{
  "voice_id": "Arrogant_Miss"
}

// Response 200
{
  "url": "https://..."
}

// 错误
// 400 invalid_voice_id 当 voice_id 不在当前 MiniMax voice catalog 中
// 503 voice_not_configured 当缓存未命中且 MiniMax/R2 签名配置不足
// 502 voice_provider_error 当 MiniMax 试听合成失败
```

缓存 key 包含 render version、MiniMax model、固定试听文本、voice id 和 `medium`，
因此同一 voice id 的重复试听不会重复调用 MiniMax。

### `DELETE /companions/{id}`

软删除（标记 `is_active=false`），关系数据保留。

```json
// Response 204
```

### `POST /companions/assist` *(已废弃 / 暂未实现)*

> **状态：** 这是早期设想的功能（AI 辅助补全角色卡文本字段），目前**暂时废弃**。后端未接线，路由直接 404（`companions/index.ts` 注释 `spec-002 will wire`）；前端无调用。若日后恢复需重新立 spec。
>
> 注意：现有的 `POST /companions/base-art/prompt-assist`（出图 prompt 辅助，见 §11.7）与 `POST /companions/{id}/story-arcs/assist`（剧情线 AI 起草，见 §11.6）是**不同的功能**，与本端点无关。

原设想形态（仅存档，未实现）：

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

### `POST /chat/{companion_id}/messages/{message_id}/voice`

为一条 companion 回复生成或复用语音 URL。

服务端根据 companion 的 `voice_id` 与 `voice_speed` 调用 MiniMax T2A；旧角色缺少
voice 设置时按 `config/minimax-voices.<env>.json` 的默认值回退。生成结果以 voice id、
speed、文本和 render version 参与缓存 key，避免改声音后复用旧音频。

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

### `GET /admin/chat/{thread_id}/prompt-debug/latest` (spec-034, draft)

只读诊断：返回某个 thread 最近一次 prompt 分段快照，用于定位角色身份、格式、记忆注入或 token 裁剪问题。仅 admin/dev 可用，普通用户没有 memory 或 prompt debug 管理端点。

```json
// Response 200
{
  "snapshot": {
    "id": "snap_1",
    "thread_id": "thr_1",
    "companion_id": "maya",
    "message_id": "msg_123",
    "token_estimate": 2450,
    "created_at": 1780675200000,
    "segments": [
      { "id": "core_identity", "role": "system", "position": "system_preamble",
        "priority": 1000, "token_estimate": 42, "included": true, "trim_reason": null },
      { "id": "thread_memory", "role": "system", "position": "pre_history",
        "priority": 650, "token_estimate": 220, "included": true, "trim_reason": null },
      { "id": "recent_history:oldest", "role": "user", "position": "in_history",
        "priority": 100, "token_estimate": 180, "included": false, "trim_reason": "budget" }
    ]
  }
}
```

错误：thread 不存在或无 snapshot → 404 `prompt_debug_not_found`；非 admin → 403 `admin_required`。

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

### `GET /admin/image-gen-jobs?status=<failed|...>&limit=<N>&created_from=<ms>&created_to=<ms>` (2026-06-01)

只读诊断：列出最近的出图任务及其**真实失败原因**（`error_message` 存 RunningHub 原文，如 `NODE_INFO_MISMATCH`），免去手连 D1。`status` 可选（缺省返回全部最近任务），`limit` 默认 50、上限 200。`created_from` / `created_to` 为 epoch milliseconds，前端用管理员浏览器的本地自然日计算范围，后端只按时间戳过滤。

Web Admin 的 Portrait generation 页面只保留 `View logs` 入口；日志在浮窗中查看，默认摘要展示，点击单条 job 后展开完整详情。

```json
// Response 200
{
  "jobs": [
    { "id": "job_1", "status": "failed", "task": "companion_base_art", "workflow_key": "portrait_create",
      "model": "anime_animagine", "provider": "runninghub", "error_code": "provider_error",
      "error_message": "NODE_INFO_MISMATCH(nodeId=1, fieldName=style_name, reason=field_not_found_in_node_inputs)",
      "prompt_excerpt": "Create a portrait...",
      "provider_task_id": null, "created_at": 1748785108000, "completed_at": 1748785109000 }
  ]
}
```

`fieldName=style_name` 代表旧数据把 style/model 标签误写成 RunningHub 节点字段名；新任务应由 workflow contract 校验后的 `checkpointFieldName` 提供字段名。

> 配套：base-art job status（`GET /companions/base-art/jobs/{jobId}`）现也透传 `error_message`。
>
> **已退役（spec-031）：** companion 表情立绘生成（`POST /companions/{id}/emotion-art/{emotion}/generate`、`/companions/{id}/emotion-art/jobs`）已停用，现统一返回 **410 `feature_retired`**。历史 `art_emotions` 数据仍可随 companion 记录读取，但不再启动/列出生成任务。`subscription_required` 这一错误码也随之不再使用。

---

## 10. 健康 / 诊断端点

### `GET /health`

```json
// Response 200
{ "ok": true, "service": "xtbit-apps-api", "version": "1.0.0-rc.1", "environment": "dev" }
```

`environment` 来自 `APP_ENV`。Workers 无常驻进程，不提供 uptime 字段。

### `GET /config/bootstrap`

返回 KV `client:bootstrap` 中的公共配置，原样透传。

```json
// Response 200
{ "config": { /* KV client:bootstrap 的内容；未设置时为 {} */ } }
```

> **现状：** KV `client:bootstrap` 目前在仓库内无任何 seed/写入流程，前端也尚未调用此端点，因此实际通常返回 `{ "config": {} }`。早期设想的 `stripe_publishable_key` / `feature_flags` / `support_email` 等结构化字段**从未实现**；如需公开这些配置，应另立 spec 决定是放进 KV payload 还是改为专门字段。

### `GET /db/ping`

D1 连通性诊断（仅 admin / 内部）。

---

## 11. 其他已实现端点（简明清单）

> 以下端点均已在代码中实现并接线，但本文档前面章节尚未展开完整契约。此处给出**路径 + 方法 + 一句话**，详细请求/响应以对应 spec 与代码为准，避免重复维护导致再次漂移。

### 11.1 Credits（积分账本，spec-021）

- `GET /credits/balance` — 当前用户积分余额（含每月发放 grant）。
- `GET /credits/ledger` — 积分流水。
- `POST /credits/checkout` — 创建积分购买 Checkout。

### 11.2 Personas（用户人设，spec-034 / user-persona）

- `GET /personas`、`POST /personas` — 列出 / 创建用户 persona。
- `PATCH /personas/{id}`、`DELETE /personas/{id}` — 更新 / 删除。

### 11.3 Life / 日常模拟（daily-life-sim）

- `GET /today` — 今日状态聚合。
- `GET /activities`、`POST /activities/{id}/complete`、`POST /activities/{id}/cancel` — 日常活动。
- `GET /memories` — 记忆列表。
- `POST /push/tokens`、`DELETE /push/tokens/{token}` — 推送 token 注册 / 注销。

### 11.4 Me / 用户资产（spec-033）

- `GET /me/image-assets`、`POST /me/image-assets`、`DELETE /me/image-assets/{id}` — 用户私有图片资产收口。

### 11.5 Chat 扩展（spec-006 / 024 / voice / variants）

- `POST /chat/{companion_id}/messages/{message_id}/regenerate` — 重生成回复。
- `POST /chat/{companion_id}/messages/{message_id}/edit` — 编辑消息。
- `POST /chat/{companion_id}/messages/{message_id}/voice` — 生成语音。
- `POST /chat/{companion_id}/messages/{message_id}/variant` — 候选回复切换。

### 11.6 Companions 扩展

- `POST /companions/upload-art` — 上传角色图（admin / 自创）。
- `GET /companions/{id}/export` — 导出角色卡（companion-import 配套）。
- `POST /companions/{id}/publish` — 发布为公开角色（spec-031）。
- `POST/DELETE /companions/{id}/favorite` — 收藏 / 取消收藏。
- `GET /companions/{id}/daily-state` — 角色当日状态（life-sim）。
- `GET/POST /companions/{id}/story-arcs`、`/story-arcs/from-template`、`/story-arcs/assist`、`/story-beats/{id}`(+`/complete`/`/reopen`) — 角色剧情拍（spec-026 / 029）。
- `GET /companions/{id}/moment-images` — 角色瞬间图列表（spec-027）。
- `GET /story-arc-templates` — 剧情包模板（spec-029）。

### 11.7 Companion 底图 / 出图（spec-020 / 022 / 027 / 030 / 031 / 033）

- `GET /image-models` — 可选出图模型（用户侧）。
- `POST /companions/base-art/generate` — 生成角色底图。
- `POST /companions/base-art/prompt-assist` — 出图 prompt 辅助。
- `GET /companions/base-art/jobs/{id}` — 底图 job 轮询。
- `POST /chat/{companion_id}/messages/{message_id}/moment-image/generate`、`GET /moment-images/jobs/{id}` — 聊天瞬间图（spec-027）。
- `POST /chat/.../outfit-image`（推荐 / 自定义）、`GET /outfit-images/jobs/{id}` — 聊天换装图（spec-030，legacy/deprecated 入口）。
- profile 换装图见 §3「Profile Outfit Images」。

### 11.8 Relationships 扩展

- `GET /relationships/{companion_id}/unlocks` — 关系解锁状态（spec-025）。

### 11.9 Admin 扩展（需 admin 权限）

- `GET /admin/llm/config/{task}`、`GET /admin/llm/usage` — 单任务配置 / LLM 用量。
- `GET/POST /admin/admin-allowlist`、`DELETE /admin/admin-allowlist/{id}` — 管理员白名单。
- `GET /admin/settings`、`PUT/DELETE /admin/settings/{key}`、`POST /admin/settings/{key}/reveal` — 运行配置（见 [ops/admin-settings-workspace](../ops/admin-settings-workspace.md)）。
- `/admin/image-models`、`/admin/image-workflows`、`/admin/expression-prompts`（GET/POST/PUT/DELETE）— 出图模型 / workflow / 表情 prompt 目录（spec-022）。

### 11.10 平台 / 基础设施

- `POST /jobs` — 投递通用 job 到队列。
- `GET/PUT /objects/{key}`、`GET /objects/signed/{key}` — R2 资产读写 / 签名访问。
- `/rooms/{id}`(+`/events`) — Durable Object GameRoom。
- RunningHub 出图回调 webhook（由 `image-gen/runninghub-results` 处理，路径见代码）。

---

## 12. 路由优先级与中间件

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

## 13. 移除 / 弃用的端点（与现有代码对照）

现有代码（参考 `_archive/2026-05/`）含但 v1 删除的端点：

- `/show/*` — 章节式综艺玩法，全部废弃
- `/companion/*/dimensions` — 直接读维度数值的接口，前端不应使用
- `/apps/{appKey}/*`、`/api/{appKey}/*` — multi-app 路由抽象删除

v1 期间被退役 / 暂停的端点（代码仍在但不再提供功能）：

- `/companions/{id}/emotion-art/*` — 表情立绘生成，spec-031 退役，返回 410 `feature_retired`（见 §9）。
- `POST /companions/assist` — AI 补全角色卡，暂时废弃、未接线，路由 404（见 §3）。
- `POST /chat/.../outfit-image`（聊天内换装）— 后端保留为 legacy/deprecated，新 UI 入口改走 profile 换装（spec-033）。

---

## 14. 待最终敲定

- [ ] Google OAuth client ID / secret 获取（dev + prod 各一套，存 wrangler）
- [ ] Apple Sign-In key / team id / client id（dev + prod，spec-009 只预留）
- [ ] Email Magic Link 邮件发送服务（spec-009 选择 Resend）
- [ ] JWT 时长（30 天 vs 7 天 + refresh token）
- [ ] WebSocket 是否替代 SSE 做对话流（v1 用 SSE 简单，v2 看需要）
- [ ] ~~`/companions/assist` 是否计入用户配额~~（该端点已废弃，见 §3 / §13；若恢复需重新立 spec 并决定配额）
- [ ] admin 端点的鉴权细节（除邮箱白名单，是否要二级验证）
- [ ] 国际化 / i18n 接口（错误消息走 `accept-language`？v1 仅英文）
