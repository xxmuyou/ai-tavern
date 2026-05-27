# spec-021: Credits Ledger and Metering

> **类型：** 新建  |  **依赖：** spec-010  |  **估时：** 5-8 天  |  **状态：** 📝 draft

---

## Context

当前产品已有两类付费/额度能力：

- `spec-010` 已定义 Stripe Pro 订阅、free/pro entitlement、每日 chat message quota。
- Chat 侧已有 LLM usage/cost 日志，用于成本审计。

但后续 AI 生图成本明显高于普通 chat，不能继续只用“每日消息条数”控制。companion emotion art generation（[`spec-020`](./spec-020-companion-emotion-art-generation.md)）需要一个明确、可审计、可退款的积分系统：

- 用户知道每种任务消耗多少积分。
- 系统能在任务开始前确认余额足够。
- 异步任务失败时能释放预占或退款。
- Pro 用户获得更多月度积分，但不是无限生图。
- 用户可以通过 pay-as-you-go 购买额外积分包。

本 spec 定义统一 credits ledger，覆盖 chat、image generation 和未来高成本 AI 功能。

---

## 目标 / 非目标

### 目标

- 新增不可变积分流水账本，记录所有发放、扣减、预占、确认、退款和购买。
- Free/Pro 每月发放固定积分：Free 50/月，Pro 1000/月。
- 任务按固定积分价扣费：
  - `chat_message`: 1 credit
  - `image_generation`: 100 credits
- 购买积分包通过 Stripe 一次性 Checkout。
- 异步任务采用 reserve → commit/refund 模型。
- `/auth/me` 或 `/billing/status` 返回当前积分余额。
- 积分不足时返回 402，前端可识别并引导充值或升级。

### 非目标

- ❌ 不替代现有 free daily message quota；v1 可同时保留每日消息限制与 credits。
- ❌ 不在本 spec 内实现 companion emotion art generation；它属于 spec-020。
- ❌ 不做复杂动态定价、token 级计费或按真实 provider 成本实时换算。
- ❌ 不做优惠券、赠品码、团队账号、家庭共享。
- ❌ 不做 App Store / Google Play 内购；移动端合规入口另行规划。
- ❌ 不做积分提现吗、退款到现金、用户间转账。

---

## 产品规则

### 月度发放

| Tier | Monthly grant |
|---|---:|
| Free | 50 credits |
| Pro | 1000 credits |

规则：

- 月度赠送积分按 UTC 月份发放。
- 同一用户同一月份同一 tier 只发一次。
- Free 升级 Pro 后，本月可获得 Pro grant；若本月已发 Free grant，不追回。
- Pro 取消后，到订阅期结束前仍按 Pro 判断；下个发放周期按实际 tier 发放。
- 月度赠送积分在发放月份结束后过期。

### 购买积分

购买积分不过期。

初始积分包：

| Package | Credits | Suggested price |
|---|---:|---:|
| Small | 500 | $4.99 |
| Medium | 1200 | $9.99 |
| Large | 3000 | $19.99 |

价格 ID 不写死，使用环境变量配置：

```txt
STRIPE_PRICE_CREDITS_SMALL
STRIPE_PRICE_CREDITS_MEDIUM
STRIPE_PRICE_CREDITS_LARGE
```

### 固定扣费

| Task | Credits | 说明 |
|---|---:|---|
| `chat_message` | 1 | 用户主动发送并成功获得 companion 回复 |
| `image_generation` | 100 | 每生成 1 张图片 |
| `signal_extract` | 0 | 系统内部任务，不向用户扣费 |
| `summary` | 0 | 系统内部任务，不向用户扣费 |
| `admin_prewarm` | 0 | admin/system 成本审计，不扣普通用户积分 |

chat 在 v1 可继续受 free daily message quota 限制；credits 是额外的成本控制与商业化基础。

---

## 改动清单

### A. 数据模型

新增 `credit_accounts` 缓存当前余额，新增 `credit_ledger_entries` 作为不可变流水。

```sql
CREATE TABLE credit_accounts (
  user_id              TEXT PRIMARY KEY REFERENCES users(id),
  available_credits    INTEGER NOT NULL DEFAULT 0,
  reserved_credits     INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE credit_ledger_entries (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  type                 TEXT NOT NULL,
  amount               INTEGER NOT NULL,
  balance_after        INTEGER,
  reserved_after       INTEGER,
  task_type            TEXT,
  reference_type       TEXT,
  reference_id         TEXT,
  stripe_session_id    TEXT,
  stripe_payment_id    TEXT,
  expires_at           INTEGER,
  metadata             TEXT,
  created_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_credit_ledger_reference
  ON credit_ledger_entries(type, reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE INDEX idx_credit_ledger_user_time ON credit_ledger_entries(user_id, created_at);
CREATE INDEX idx_credit_ledger_expiry ON credit_ledger_entries(expires_at);
```

Ledger `type` 固定值：

```txt
grant_monthly
purchase
reserve
commit
release
refund
expire
adjustment
```

金额约定：

- 正数：增加可用积分或释放预占。
- 负数：减少可用积分或确认消费。
- `reserve` 从 available 转入 reserved，ledger `amount` 记录负数。
- `commit` 从 reserved 中确认扣除，ledger `amount` 记录 0 或负数均可；实现必须在文档内选定一种。v1 采用 `amount = 0`，通过 `metadata.reserved_delta = -N` 记录 reserved 变化。
- `release/refund` 将 reserved 或已扣积分返还 available。

### B. 后端模块

新增 `packages/api/src/credits/`：

```txt
credits/
├── index.ts          # 路由聚合
├── ledger.ts         # account + ledger 原子更新
├── pricing.ts        # task 固定价格
├── grants.ts         # 月度发放
├── checkout.ts       # Stripe 一次性积分包购买
├── webhooks.ts       # checkout.session.completed 入账
└── types.ts
```

对业务模块暴露 helper：

```ts
getCreditBalance(env, userId): Promise<CreditBalance>
ensureMonthlyGrant(env, userId, tier, now): Promise<void>
reserveCredits(env, { userId, taskType, referenceType, referenceId, amount }): Promise<ReserveResult>
commitReservation(env, reservationId): Promise<void>
releaseReservation(env, reservationId, reason): Promise<void>
refundCredits(env, { userId, referenceType, referenceId, amount, reason }): Promise<void>
```

所有积分变更必须通过 helper，业务模块不得直接写 `credit_accounts`。

### C. API 契约

`GET /credits/balance`

返回：

```json
{
  "available_credits": 125,
  "reserved_credits": 100,
  "monthly_grant": {
    "tier": "free",
    "period": "2026-05",
    "amount": 50,
    "granted": true
  }
}
```

`GET /credits/ledger?limit=50&before_id=...`

- Auth required。
- 返回用户自己的积分流水，用于账单解释。

`POST /credits/checkout`

请求：

```json
{
  "package": "small"
}
```

返回：

```json
{
  "checkout_url": "https://checkout.stripe.com/c/..."
}
```

错误：

| HTTP | error | 场景 |
|---|---|---|
| 400 | `invalid_credit_package` | 未知积分包 |
| 401 | `auth_required` | 未登录 |
| 500 | `billing_config_missing` | Stripe price 未配置 |
| 502 | `stripe_error` | Stripe API 失败 |

业务扣费错误：

| HTTP | error | 场景 |
|---|---|---|
| 402 | `credits_insufficient` | 可用积分不足 |
| 409 | `credit_reference_exists` | 同一 reference 重复扣费 |

### D. Stripe 一次性购买

沿用 spec-010 的 Stripe SDK 和 customer 管理。

Checkout Session 创建规则：

- `mode: "payment"`
- price 只能来自 `STRIPE_PRICE_CREDITS_*`
- `client_reference_id = user.id`
- metadata 写入：
  - `user_id`
  - `credit_package`
  - `credits`
- success/cancel URL 使用新增配置：
  - `STRIPE_CREDITS_SUCCESS_URL`
  - `STRIPE_CREDITS_CANCEL_URL`

Webhook：

- 处理 `checkout.session.completed`。
- 只处理 metadata 中含 `credit_package` 的 session。
- 使用 `stripe_session_id` 做幂等。
- 入账 ledger type = `purchase`。

### E. 月度发放

触发时机：

- 用户调用 `/auth/me`、`/billing/status` 或 `/credits/balance` 时懒发放。
- 发放逻辑必须幂等。

reference 约定：

```txt
reference_type = "monthly_grant"
reference_id = "{user_id}:{tier}:{YYYY-MM}"
```

发放后写 ledger：

- `type = grant_monthly`
- `amount = 50` 或 `1000`
- `expires_at = 下个月 UTC 1 日 00:00`

过期处理：

- v1 可懒处理：读取余额前计算已过期 grant 的剩余额并写 `expire`。
- 若实现复杂，可先用定时 cron，但必须保证不会重复过期。

### F. 与现有业务集成

Chat：

- 主回复成功并持久化后扣 `chat_message = 1`。
- 若 LLM 在打开 SSE 前失败，不扣。
- signal extract / summary 不扣。
- 保留现有 free daily quota；若 daily quota 已满，先返回现有 quota error，不再扣 credits。

Image generation：

- spec-020 在创建 job 前 reserve `image_generation = 100`。
- job 成功后 commit。
- job failed/cancelled 后 release。
- 若 provider 已扣真实成本但输出不可用，仍按产品口径 release 给用户；真实成本进入运营成本。

Admin/system：

- admin prewarm 和后台系统任务不扣用户 credits。
- 仍记录 provider cost 到 LLM/image usage 日志。

### G. 前端展示

- `Me` 或 `Billing` 页展示 available/reserved credits。
- 触发 image generation 前展示消耗：`Generate expression - 100 credits`。
- 积分不足时展示充值入口和 Pro 升级入口。
- Ledger 页面可后置；v1 至少在 Billing 页显示最近 20 条流水。

---

## 实施步骤

1. 新增 credits migration：`credit_accounts`、`credit_ledger_entries`。
2. 新增 credits 模块和 pricing 常量。
3. 实现 account/ledger 原子更新 helper，覆盖 grant、reserve、commit、release、refund、purchase。
4. 接入 lazy monthly grant 到 `/auth/me`、`/billing/status`、`/credits/balance`。
5. 新增 `/credits/balance`、`/credits/ledger`、`/credits/checkout`。
6. 扩展 Stripe webhook：识别 credits checkout session 并幂等入账。
7. Chat 成功持久化后扣 1 credit，同时保留现有 daily quota。
8. 为 spec-020 暴露 reserve/commit/release helper。
9. 前端 Billing/Me 页面展示 credits，并处理 `credits_insufficient`。
10. 补测试和 docs。

---

## 验证方式

- 新用户首次访问 `/credits/balance` 获得 Free 50 credits。
- Pro 用户获得 1000 credits。
- 同一用户同一月份重复访问不会重复发放。
- `chat_message` 成功扣 1 credit，LLM 失败不扣。
- `image_generation` reserve 100 后 available 减少、reserved 增加。
- commit 后 reserved 减少，available 不增加。
- release 后 reserved 减少、available 恢复。
- 余额不足时业务接口返回 402 `credits_insufficient`。
- Stripe credits checkout completed 后 purchase ledger 入账一次，重复 webhook 不重复加积分。
- 月度赠送积分过期后不可继续消费；购买积分不过期。

---

## 回滚

- 若 credits 系统故障，可临时关闭业务扣费开关，保留 ledger 数据。
- Chat 可回退到只使用现有 daily quota。
- Image generation 可回退为 admin-only 或完全关闭生成端点。
- Stripe credits checkout 可从 UI 隐藏，webhook 保留幂等处理。
- 回滚 migration 前需确认没有业务代码依赖 `credit_accounts`；ledger 历史建议归档后再删除。

---

## 依赖

- [`spec-010`](./spec-010-billing-entitlements-quota.md)：Stripe SDK、customer 映射、订阅 tier、billing status。
- [`spec-020`](./spec-020-companion-emotion-art-generation.md)：image generation 作为首个高成本积分消费场景。
