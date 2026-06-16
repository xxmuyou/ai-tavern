# spec-010: Stripe Billing + Entitlements + Quota 计量

> **类型：** 新建  |  **依赖：** spec-003, spec-009  |  **估时：** 5-7 天  |  **状态：** 🟢 done
>
> ⚠️ **2026-06-08 修订（产品转向纯积分制）**：每日**消息条数配额已下线**，聊天改为按积分扣费（见 [`spec-021`](./spec-021-credits-ledger-and-metering.md)）。本 spec 的订阅 / Stripe / customer 映射 / **自创角色上限 entitlement** 仍然有效——自创角色上限（Free 3 / Pro 不限）是少数保留的订阅 gating；rate-limit 也保留防滥用。下文涉及"每日消息 quota / 软阈值"的部分作为历史保留，已不再生效。
>
> **2026-06-15 补充（Billing 页面展示口径）**：Web billing 购买页只展示**当前已上线**的订阅权益与积分消耗，不把规划中能力写成现有卖点。用户可见文案应明确 `1 chat = 1 credit`、`1 image = 40 credits`、`首次 voice generation = 3 credits`，以及 Free/Pro 的当前差异：Free 注册赠送 `1000` credits、Pro 每月 `30000` credits、`3 / unlimited` 自创角色上限。完整页面结构归 Web UI 文档维护，本 spec 只承载这些展示约束。

---

## 1. Context

v1 的付费模型是"免费 + 额度限制 / 订阅去除限制"。免费用户可以体验完整产品，但每日消息和自创角色数量有限制；Pro 订阅用户解除这些限制。当前代码已经有 `usage_log`、KV quota、`/auth/me` 的 subscription/quota 占位，以及 companions/chat 中等待 spec-010 翻开的 quota 逻辑，但 billing 端点仍在 retired prefix 中，schema 也不足以安全处理 Stripe webhook、customer 映射和幂等。

本 spec 把 Stripe Billing、订阅权益、额度计量和 `/auth/me` 的付费字段一次性定清楚。实现者必须按本 spec 落地后端能力，不把套餐判断散落到 chat、companions 或 auth 模块里。

参考：

- 产品付费模型：[`docs/product/monetization.md`](../product/monetization.md)
- API 契约：[`docs/architecture/api.md`](../architecture/api.md)
- D1/KV 数据模型：[`docs/architecture/data-model.md`](../architecture/data-model.md)
- Auth 依赖：[`spec-009-auth-oidc-magic-link.md`](./spec-009-auth-oidc-magic-link.md)
- Stripe Checkout Sessions: <https://docs.stripe.com/api/checkout/sessions/create>
- Stripe Customer Portal Sessions: <https://docs.stripe.com/api/customer_portal/sessions/create>
- Stripe webhook signatures: <https://docs.stripe.com/webhooks/signature>

---

## 2. 目标 / 非目标

### 目标

- 实现 Stripe Pro Monthly 订阅购买：后端创建 Checkout Session，Stripe 托管支付页面完成支付。
- 实现 Stripe Customer Portal：用户自助取消、换卡、查看发票，后端只创建 portal session。
- 实现 webhook 验签、幂等处理和订阅状态落库。
- 引入统一 entitlement 层：调用方只问"当前用户是 free 还是 pro，有什么额度"，不直接理解 Stripe。
- 把 chat 日消息 quota 和 companions 自创角色 quota 接到 entitlement。
- `/auth/me` 返回真实 subscription/quota 字段。
- 统一 billing API 路径和 docs：webhook 路径固定为 `/billing/webhook`。

### 非目标

- ❌ 不做完整 Web/Expo 购买 UI；spec-010 只提供后端接口和最小 return URL 契约。
- ❌ 不做 iOS/Android 内购，不在 iOS app 内直接引导 Stripe Checkout；移动端合规入口留给 spec-015。
- ❌ 不做 Annual、多套餐、优惠码、免费试用、家庭计划或团队计划。
- ❌ 不做自助退款；退款先由人工客服处理。
- ❌ 不实现 `/billing/cancel`；订阅管理统一走 Stripe Customer Portal。
- ❌ 不做 admin billing 后台、发票后台或财务报表。

---

## 3. 改动清单

### A. 模块边界

新增 `packages/api/src/billing/`，按职责拆开：

```txt
billing/
├── index.ts          # 路由聚合: /billing/checkout/status/portal/webhook
├── config.ts         # env 读取、price 白名单、return URL
├── stripe.ts         # Stripe SDK 初始化 + API 包装
├── repository.ts     # billing_* 表读写
├── webhooks.ts       # raw body 验签、event 分发、幂等
├── entitlements.ts   # free/pro 判断与配额定义
├── quota.ts          # KV 当日计数 + usage_log 读写入口
└── types.ts          # 对外 DTO / 内部类型
```

调用关系必须保持清晰：

- `chat` 只调用 `billing/quota` 或 `billing/entitlements`，不直接查 Stripe 表。
- `companions` 只调用 entitlement helper，判断是否绕过 3 个自创角色限制。
- `auth/me` 只调用 billing status helper 组装返回，不复制 SQL。
- `billing/webhooks` 是唯一处理 Stripe event 的入口。

### B. 路由接入

- 从 `packages/api/src/index.ts` 的 retired prefix 移除 `/billing/`。
- 在 auth/scenes/companions/chat/events 同级接入 `handleBillingRequest(request, env, ctx, pathname)`。
- `/billing/webhook` 必须在 handler 内使用 `await request.text()` 读取 raw body，再做 Stripe 签名校验。
- `packages/api/src/security.ts` 中 body limit 和 rate-limit bypass 路径统一为 `/billing/webhook`。
- `/billing/webhook` 不需要 app auth；其他 billing endpoint 必须 `requireAuthUser`。

### C. Stripe 依赖

允许新增 `stripe` npm 依赖。实现者必须使用官方 SDK，不手写 Stripe REST client。Worker 已启用 `nodejs_compat`，若 SDK 初始化需要特殊 crypto 设置，封装在 `billing/stripe.ts`，不得散落在业务代码。

Checkout Session 创建规则：

- `mode: "subscription"`
- price 只允许服务端配置的 Pro Monthly Price ID：Admin Settings / D1 `billing.pro_monthly_price` 优先，缺省回退 `STRIPE_PRICE_PRO_MONTHLY`
- `client_reference_id = user.id`
- `customer` 优先使用本地 `billing_customers.stripe_customer_id`
- 首次没有 customer 时创建 Stripe Customer，email 使用当前 auth user email，并在 Checkout Session 创建前立即 upsert `billing_customers`
- checkout session 和 subscription metadata 都写入 `user_id`
- success/cancel URL 分别来自 `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL`

Customer Portal 创建规则：

- 必须已有 `billing_customers` 记录，否则返回 404 `billing_customer_not_found`
- return URL 来自 `STRIPE_PORTAL_RETURN_URL`
- portal URL 只按需创建，不缓存

### D. Billing schema

新增 migration `packages/api/migrations/0006_billing_schema.sql`。

实现后应用层只读写 `billing_*` 表；旧 `subscriptions` 表不再作为权益来源。由于 prod 尚未上线，`0006_billing_schema.sql` 必须 destructive 地删除旧 `subscriptions` 表，不做旧数据迁移，避免后续误用。

目标结构：

```sql
CREATE TABLE billing_customers (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  livemode           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE billing_subscriptions (
  id                   TEXT PRIMARY KEY,        -- Stripe subscription id
  user_id              TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id   TEXT NOT NULL,
  status               TEXT NOT NULL,
  price_id             TEXT NOT NULL,
  current_period_start INTEGER NOT NULL,
  current_period_end   INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at          INTEGER,
  livemode             INTEGER NOT NULL DEFAULT 0,
  raw_json             TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE billing_webhook_events (
  id           TEXT PRIMARY KEY,                -- Stripe event id
  type         TEXT NOT NULL,
  livemode     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,                   -- processing / processed / failed / ignored
  error        TEXT,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX idx_billing_customers_stripe ON billing_customers(stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_user ON billing_subscriptions(user_id);
CREATE INDEX idx_billing_subscriptions_customer ON billing_subscriptions(stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX idx_billing_subscriptions_period_end ON billing_subscriptions(current_period_end);
CREATE INDEX idx_billing_webhook_events_type ON billing_webhook_events(type);
```

`usage_log` 保留现状，用于冷数据审计。KV 继续作为日额度热路径，不迁移到 D1。

时间戳单位：

- D1 中所有 `*_at`、`current_period_start`、`current_period_end` 统一存 Unix milliseconds。
- API response 中的 `current_period_end` 也返回 Unix milliseconds。
- Stripe event/API 返回的 seconds timestamp 必须只在 `billing/repository.ts` 或 webhook sync 边界转换为 milliseconds，业务层不得混用 seconds。

### E. API 契约

#### `POST /billing/checkout`

Auth required。创建 Pro Monthly Checkout Session。

```json
// Request body 可以为空；服务端不接受客户端 price_id
{}

// Response 200
{
  "checkout_url": "https://checkout.stripe.com/c/..."
}
```

错误：

- 401 `auth_required`
- 500 `billing_config_missing`：prod 缺 `STRIPE_SECRET_KEY`、Pro Monthly Price ID、success/cancel URL
- 502 `stripe_error`：Stripe API 失败

#### `POST /billing/portal`

Auth required。创建 Stripe Customer Portal Session。

```json
// Response 200
{
  "portal_url": "https://billing.stripe.com/p/session/..."
}
```

错误：

- 401 `auth_required`
- 404 `billing_customer_not_found`
- 500 `billing_config_missing`
- 502 `stripe_error`

#### `GET /billing/status`

Auth required。返回当前用户订阅、权益和当日 usage。

```json
{
  "subscription": {
    "tier": "free",
    "status": "free",
    "price_id": null,
    "current_period_end": null,
    "cancel_at_period_end": false
  },
  "entitlements": {
    "tier": "free",
    "message_limit_daily": 30,
    "custom_companion_limit": 3,
    "subscriber_soft_message_threshold_daily": null
  },
  "usage": {
    "date_utc": "2026-05-21",
    "messages_used_today": 12,
    "message_limit_daily": 30,
    "subscriber_soft_threshold_exceeded": false
  }
}
```

Pro 用户：

```json
{
  "subscription": {
    "tier": "pro",
    "status": "active",
    "price_id": "price_...",
    "current_period_end": 1779300000000,
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
    "messages_used_today": 1203,
    "message_limit_daily": null,
    "subscriber_soft_threshold_exceeded": true
  }
}
```

#### `POST /billing/webhook`

Stripe 调用，无 auth。必须校验 `Stripe-Signature`。

```txt
Header: Stripe-Signature
Body: raw Stripe event JSON
Response 200: { "ok": true }
```

错误：

- 400 `stripe_signature_invalid`
- 400 `stripe_event_invalid`
- 500 `billing_config_missing`

重复 event 直接返回 200 `{ "ok": true, "duplicate": true }`。

### F. Webhook event 处理

必须处理：

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

处理规则：

- `checkout.session.completed` 用 `client_reference_id` 或 metadata `user_id` 绑定用户，写入/更新 `billing_customers`。如果 event 含 subscription id，拉取 Stripe subscription 或使用 expanded object 同步 `billing_subscriptions`。
- subscription created/updated/deleted 都走同一个 `upsertSubscriptionFromStripe()`，按 Stripe subscription 当前字段覆盖本地状态。
- invoice succeeded/failed 不直接猜权益；只用于必要时拉取并同步对应 subscription。
- 无法解析 user_id/customer/subscription 的 event 标记 `ignored`，返回 200，不重试卡住 Stripe。
- event id 已存在且 status 为 `processed` 或 `ignored` 时，不再执行副作用。
- event id 已存在且 status 为 `processing` 时视为并发重复请求，直接返回 200，不重复执行副作用。
- event id 已存在且 status 为 `failed` 时，Stripe 重试可把该行重新置为 `processing` 并再次执行。
- 处理失败时记录 `failed` 和 error，返回 500，让 Stripe 重试。

subscription event 解析 `user_id` 顺序：

1. `subscription.metadata.user_id`
2. `billing_customers` 通过 `stripe_customer_id` 查到的 `user_id`
3. `checkout.session.completed` 的 `client_reference_id` / metadata（仅 checkout event 可用）
4. 仍无法解析则标记 `ignored`

### G. Entitlements / quota

权益层只暴露两种 tier：

```ts
type BillingTier = "free" | "pro";
```

Pro 判定：

- `billing_subscriptions.status IN ('active', 'trialing')`
- `current_period_end > Date.now()`
- 多条订阅时取 `current_period_end` 最新且仍有效的一条

配额：

| 资源 | free | pro | 现状 |
|---|---:|---:|---|
| 用户消息 | ~~30 / UTC day~~ | ~~unlimited~~ | ⚠️ 已下线，改按积分扣费（spec-021） |
| 自创角色 | 3 active | unlimited | ✅ 仍生效（保留的订阅 gating） |
| 订阅软阈值 | ~~n/a~~ | ~~1000 / UTC day~~ | ⚠️ 随消息配额一并下线 |

> 下方 KV 消息计数、消息计量时机等内容仅作历史保留；聊天计费现走 spec-021 的 reserve→commit/release。rate-limit（10/分）仍保留防滥用。

KV key：

```txt
quota:{user_id}:{YYYY-MM-DD}:messages
```

值为整数。TTL 使用 90,000 秒，和当前 chat quota 行为保持一致。旧 key 形态 `quota:{user_id}:{YYYY-MM-DD}` 可以在 spec-010 实现时停止写入；不要求迁移历史 key。

v1 接受 KV read/write 的小竞态，不引入 Durable Object 或 D1 transactional counter 做强一致计数；如果真实滥用显著，再单独开后续 spec。

消息计量时机：

- chat 先检查 free quota，再调用 LLM。
- 成功持久化用户消息 + companion 回复后再 increment。
- LLM 在打开 SSE 前失败，不扣 quota。
- 信号提取失败不影响消息 quota，因为主回复已经完成。
- Pro 用户也 increment KV，用于 usage/status 和软阈值，但不因 1000 条被阻断。

`usage_log`：

- chat 成功后继续异步写 `usage_log.message_count += 1`。
- spec-010 不要求把所有 KV increment 同步写 D1；D1 是审计/分析，KV 是实时额度。

### H. `/auth/me` 接入

spec-009 的 `/auth/me` 必须复用 billing status helper，返回稳定字段：

```json
{
  "user": {
    "id": "u_...",
    "email": "user@example.com",
    "display_name": "Player",
    "linked_providers": ["google", "email"]
  },
  "subscription": {
    "tier": "pro",
    "status": "active",
    "price_id": "price_...",
    "current_period_end": 1779300000000,
    "cancel_at_period_end": false
  },
  "quota": {
    "messages_used_today": 12,
    "messages_limit_today": null,
    "subscriber_soft_threshold_exceeded": false
  }
}
```

如果 spec-009 先于 spec-010 实现，spec-009 可以返回 deterministic free 默认值；spec-010 完成后必须改成真实读取。

### I. Env / 配置

使用现有 env 名称：

- `STRIPE_SECRET_KEY`：Wrangler secret
- `STRIPE_WEBHOOK_SECRET`：Wrangler secret
- `STRIPE_PUBLISHABLE_KEY`：public var
- `STRIPE_PRICE_PRO_MONTHLY`：public var，不是 secret；作为 `billing.pro_monthly_price` 的 env fallback
- `STRIPE_SUCCESS_URL`：public var
- `STRIPE_CANCEL_URL`：public var
- `STRIPE_PORTAL_RETURN_URL`：public var

Stripe Price ID 不是 secret。Admin Settings / D1 可覆盖 env fallback，便于 dev 验证或临时切换 Price ID；稳定环境也可直接使用 env 默认值。

缺配置行为：

- prod：checkout/portal/webhook 必需配置缺失时返回 500 `billing_config_missing`。
- dev/local：同样不假成功，但 response 可包含 `missing: ["STRIPE_SECRET_KEY"]` 便于调试。

---

## 4. 实施步骤

1. 新建分支 `feature/spec-010-billing`.
2. 新增 migration `0006_billing_schema.sql`，DROP 旧 `subscriptions` 表并建立 `billing_*` 表。
3. 新增 `stripe` 依赖，封装 `billing/stripe.ts`。
4. 实现 `billing/config.ts`：读取 env、校验 Pro Monthly price、return URL。
5. 实现 `billing/repository.ts`：customer/subscription/webhook event upsert 与查询。
6. 实现 `billing/entitlements.ts`：free/pro 判断和 quota limit 常量。
7. 实现 `billing/quota.ts`：KV message counter、soft threshold、status DTO。
8. 实现 `billing/webhooks.ts`：raw body 验签、幂等、event 分发和失败记录。
9. 实现 `billing/index.ts`：checkout/status/portal/webhook 路由。
10. 在 API 主路由接入 billing，并修正 security webhook path。
11. 改 chat：使用 billing quota helper，移除 `chat/quota.ts` 中直接查旧 `subscriptions` 的逻辑。
12. 改 companions：使用 entitlement helper，让 Pro 绕过 3 个自创角色限制。
13. 改 `/auth/me`：接真实 billing status/quota。
14. 更新测试与文档，跑 typecheck/test。

---

## 5. 验证方式

### Endpoint tests

- 未登录访问 `POST /billing/checkout`、`POST /billing/portal`、`GET /billing/status` 返回 401。
- checkout 创建或复用 Stripe customer，且只使用服务端配置的 Pro Monthly Price ID，不接受客户端传任意 price。
- checkout response 字段是 `checkout_url`，不是旧的 `url`。
- portal 无 customer 返回 404 `billing_customer_not_found`。
- status 对 free、active pro、past_due、canceled 都返回稳定 shape。

### Webhook tests

- 缺 `Stripe-Signature` 返回 400。
- 签名错误或 raw body 被篡改返回 400。
- 同一个 Stripe event 重放不会重复 upsert subscription。
- `checkout.session.completed` 写入 `billing_customers` 并同步 subscription。
- `customer.subscription.updated` 更新 status、period、cancel flags。
- `customer.subscription.deleted` 不再让用户被判定为 Pro。
- `invoice.payment_failed` 不直接判定 active，只同步 Stripe subscription 当前状态。

### Entitlement / quota tests

- free 用户第 31 条消息返回 402 `quota_exceeded`。
- Pro 用户超过 1000 条不阻断，`subscriber_soft_threshold_exceeded=true`。
- free 用户创建第 4 个 active user companion 返回 402。
- Pro 用户创建第 4 个 active user companion 成功。
- chat/companions 单测不 mock Stripe，只 mock entitlement/quota helper 或 DB 状态。

### Integration checks

- `/billing/webhook` 不被全局 rate limit 和 app auth 拦截。
- `/auth/me` 返回真实 subscription/quota 字段。
- `GET /billing/status` 与 `/auth/me.subscription/quota` 语义一致。
- `docs/specs/README.md` 010 从 stub 改为详细 spec 链接。
- `docs/architecture/api.md`、`docs/architecture/data-model.md`、`docs/product/monetization.md`、`docs/ops/environments.md` 中 billing 路径和 schema 不再冲突。

---

## 6. 回滚

- 代码回滚：`git revert` spec-010 implementation commit。
- Stripe 后台：禁用 webhook endpoint 或切回旧 endpoint。
- DB：由于 prod 尚未上线，local/dev 可清库重建；若已部署 dev 并需要保留数据，先导出 `billing_*` 表再回滚 migration。
- 前端：隐藏订阅入口；free quota 继续按现有 chat/companions 限制工作。

---

## 7. 依赖

- ⬅️ 阻塞于：spec-003（users、usage_log、基础 D1/KV）、spec-009（真实 auth user、`/auth/me`）。
- ➡️ 阻塞：spec-012（完整 Expo/Web billing UI）、spec-015（iOS/Android 上架与支付合规）。
- 相关但不阻塞：spec-011（admin 可查看订阅/成本后续做），ops Stripe live/test key 配置。

---

## 8. 决策记录

- v1 只做 Pro Monthly，Annual 和多套餐留给 v1.x。
- Pro 用户消息不硬拦，1000/日只是软阈值信号。
- Stripe Portal 是唯一订阅管理入口，不做 `/billing/cancel`。
- 应用层使用 `billing_*` 新 schema，不再读取旧 `subscriptions` 表。
- webhook 路径统一为 `/billing/webhook`。
