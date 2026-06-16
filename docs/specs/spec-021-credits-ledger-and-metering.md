# spec-021: Credits Ledger and Metering

> **类型：** 修订  |  **依赖：** spec-010  |  **状态：** 🟡 修订中（产品转向**纯积分制**：聊天 + 生图均按积分计费、废弃每日消息配额；基础 ledger / grant / purchase helper 已实现并通过单测；消费侧接线[生图/聊天 reserve-commit-release]、注册赠送、前端付费墙为**待实现工作项**，见 §F / §实施步骤）

---

## Context

当前产品已有 Stripe Pro 订阅、free/pro entitlement，以及 chat 侧的 LLM usage/cost 日志（`spec-010`）。

**产品已转向纯积分制（本次修订核心）**：不再用"功能门控"区分免费/付费——所有功能（聊天、生图）人人可用，只看积分余额。订阅（Pro）的价值变为"定期发放更多积分 + 少量特权"，并叠加 pay-as-you-go 充值。配套要点：

- 统一以积分计量聊天与生图，**废弃 spec-010 的每日消息配额**（聊天改为按积分扣费）。
- 用户知道每种任务消耗多少积分；系统在任务开始前确认余额足够（不足返回 402）。
- 异步任务（生图）失败时释放预占。
- Pro 用户获得更多月度积分，但不是无限生图。
- 新用户注册即赠送一次性积分；用户可通过 pay-as-you-go 购买额外积分包。

**兑换率锚定 $1 = 1000 积分**（粒度调细，使聊天可表示 $0.001/条这类细价；相比早期 $1=100 草案所有积分数值 ×10，购买力不变）。

本 spec 定义统一 credits ledger，覆盖 chat、image generation 和未来高成本 AI 功能。

---

## 目标 / 非目标

### 目标

- 新增不可变积分流水账本，记录所有发放、扣减、预占、确认、退款和购买。
- 新用户注册赠送 1000 积分（一次性）；Free 不做月度赠送，Pro 每月发放固定积分 30000。
- 任务按固定积分价计费（兑换率 $1 = 1000 积分）：
  - `chat_message`: 1 credit（≈$0.001/条）
  - `voice_generation`: 3 credits（≈$0.003/次首次生成）
  - `image_generation`: 40 credits（≈$0.04/张）
- 聊天与生图**均实际扣费**；废弃每日消息配额，聊天改为按积分计费。
- 购买积分包通过 Stripe 一次性 Checkout。
- 异步任务采用 reserve → commit/release 模型。
- `/credits/balance` 返回当前积分余额。
- 积分不足时返回 402，前端可识别并引导充值或升级。

### 非目标

- ✅ 本次修订**替代** free daily message quota：聊天改为按积分计费，每日消息条数配额下线（rate-limit 仍保留防滥用，见 spec-010）。
- ❌ 不在本 spec 内实现 companion emotion art generation；它属于 spec-020。
- ❌ 不做复杂动态定价、token 级计费或按真实 provider 成本实时换算。
- ❌ 不做优惠券、赠品码、团队账号、家庭共享。
- ❌ 不做 App Store / Google Play 内购；移动端合规入口另行规划。
- ❌ 不做积分提现吗、退款到现金、用户间转账。

---

## 关键决策（已敲定）

1. **v1 赠送积分不过期**：月度赠送积分滚存累计，不在月末过期；过期机制（`expire` ledger + 分桶记账）推迟到 v1.1。理由：避免在缺少分桶记账时错误过期掉购买积分；`available_credits` 是单一整数，无法区分"未花掉的赠送"与"购买"，强行过期会有边界 bug。`expires_at` 列与 `expire` type 保留占位，v1 grant 写 `expires_at = NULL`。
2. **并发防超扣用原子条件 UPDATE**：D1 无交互式事务/行锁，所有扣减走 `UPDATE ... WHERE available >= N` 并按影响行数判断成功/不足，与 ledger 写入放在同一个 `DB.batch()`。禁止"先 SELECT 读余额再扣"的非原子写法。
3. **聊天按积分扣费（取代每日配额）**：纯积分制下，chat 与 image generation 一样实际扣费——每条成功消息扣 1 积分。采用 reserve→commit/release：发送前 `reserveCredits(chat_message=1)`（余额不足直接 402 拦截，不进 LLM）、回复成功持久化后 `commitReservation`、LLM 失败/中断 `releaseReservation`。spec-010 的每日消息条数配额下线；rate-limit 保留防滥用。理由：产品转向"只看积分余额"，聊天不再免费无限，但单价极低（$0.001/条）几乎不影响体验。
4. **helper 语义钉死**：`reserveCredits` 返回的 `reservationId` 即那条 `reserve` ledger 的 `id`；`commitReservation` / `releaseReservation` 用它反查原始预占额来结算 reserved；reserve 幂等由 `idx_credit_ledger_reference`（`type + reference_type + reference_id` 唯一）保证，同 reference 重复 reserve 返回已存在预占而非报错。
5. **消费侧接线为本轮待实现工作项**：ledger helper（reserve/commit/release/grant/purchase）已实现并通过单测；本轮要把它们接进业务流程——生图（创建 job 前 reserve、job 落终态统一 commit/release）、聊天（发送前 reserve、产出后结算）、注册赠送、前端 402 付费墙。接线点见 §F 与 §实施步骤。
6. **纯积分制（放弃功能门控）**：所有功能人人可用，只看积分余额。订阅 Pro 不再门控功能，改为"月度发放更多积分（30000 vs Free 无月度赠送）+ 少量特权（更多自创角色上限、专属/抢先内容）"。自创角色上限是少数保留的订阅 gating（见 [`spec-010`](./spec-010-billing-entitlements-quota.md)）。
7. **兑换率 $1 = 1000 积分，注册赠送 1000**：粒度调细以表示聊天 $0.001/条；新用户注册一次性赠送 1000 积分（≈25 张图），懒发放、reference `{user_id}:signup` 唯一保证只发一次。

---

## 产品规则

### 注册赠送

新用户注册一次性赠送 **1000 credits**（≈25 张图），不过期。懒发放：用户首次访问 `/credits/balance` 时入账，reference `{user_id}:signup` 唯一保证只发一次（见 §E）。

### 月度发放

| Tier | Monthly grant |
|---|---:|
| Free | 0 credits |
| Pro | 30000 credits |

规则：

- 月度赠送积分按 UTC 月份发放。
- 仅 Pro 参与月度发放；同一用户同一月份的 Pro grant 只发一次。
- Free 升级 Pro 后，本月可获得 Pro grant。
- Pro 取消后，到订阅期结束前仍按 Pro 判断；下个发放周期按实际 tier 发放。
- v1 月度赠送积分不过期，未用完的额度滚存累计（过期机制推迟到 v1.1，见 §关键决策 1 与 §E）。

### 购买积分

购买积分不过期。

初始积分包：

| Package | Credits | Suggested price |
|---|---:|---:|
| Small | 5000 | $4.99 |
| Medium | 15000 | $9.99 |
| Large | 40000 | $19.99 |

买多送多（兑换率 $1=1000 为基准）：Small 约平价、Medium 送约 50%、Large 约翻倍。

价格 ID 不写死。Admin Settings / D1 可覆盖环境变量 fallback：

```txt
billing.credits_small_price  -> STRIPE_PRICE_CREDITS_SMALL
billing.credits_medium_price -> STRIPE_PRICE_CREDITS_MEDIUM
billing.credits_large_price  -> STRIPE_PRICE_CREDITS_LARGE
```

### 固定扣费

| Task | Credits | 说明 |
|---|---:|---|
| `chat_message` | 1 | 用户主动发送并成功获得 companion 回复（≈$0.001/条，实际扣费） |
| `voice_generation` | 3 | 同一用户同一回复同一 voice/speed 的首次语音生成（≈$0.003/次，重复播放免费） |
| `image_generation` | 40 | 每生成 1 张图片（≈$0.04/张，实际扣费） |
| `signal_extract` | 0 | 系统内部任务，不向用户扣费 |
| `summary` | 0 | 系统内部任务，不向用户扣费 |
| `admin_prewarm` | 0 | admin/system 成本审计，不扣普通用户积分 |

纯积分制下 chat 与 image generation 均按上表实际扣费；每日消息条数配额已下线（见 §关键决策 3 与 [`spec-010`](./spec-010-billing-entitlements-quota.md)）。signal extract / summary / admin prewarm 等系统任务不向用户扣费。

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

#### 并发与原子性（见 §关键决策 2）

D1 无交互式事务/行锁，扣减必须用**条件原子 UPDATE** 防超扣，禁止"先 SELECT 再扣"：

```sql
UPDATE credit_accounts
   SET available_credits = available_credits - :n,
       reserved_credits  = reserved_credits + :n,
       updated_at = :now
 WHERE user_id = :uid AND available_credits >= :n;
```

- 影响行数 = 0 → 余额不足，返回 402 `credits_insufficient`，不写 ledger。
- 影响行数 = 1 → 与对应 ledger 写入放进同一个 `DB.batch([...])` 一起提交，保证账户与流水一致。
- `release` / `refund` / `grant` / `purchase` 同理用单条 UPDATE + 同批 ledger 写入。

#### helper 语义（见 §关键决策 4）

- `reserveCredits(...)` 返回的 `reservationId` **即那条 `reserve` ledger 的 `id`**。
- `commitReservation(env, reservationId)` / `releaseReservation(env, reservationId, reason)` 通过该 id 反查原始 `reserve` 条目，得到预占额后结算 `reserved_credits`（commit 真正扣除，release 退回 available）。
- reserve 幂等由 `idx_credit_ledger_reference`（`type + reference_type + reference_id` 唯一）保证：同一 `(reserve, referenceType, referenceId)` 重复调用返回**已存在的**预占，而非报错；只有非 reserve 路径的重复扣费才返回 409 `credit_reference_exists`。
- commit / release 必须对已结算的预占幂等（重复 commit/release 不再二次改账）。

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
    "amount": 1000,
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

### E. 月度发放与注册赠送

触发时机：

- 用户调用 `/credits/balance` 时懒发放（积分的规范查看/消费入口；`/auth/me`、`/billing/status` 响应不含积分余额，且为避免 GET 读时写入的副作用，不在这两个端点触发发放）。
- reserve 等扣费路径会先 `ensureAccount` 建账户行，但不触发月度发放。
- 发放逻辑必须幂等。

reference 约定：

```txt
reference_type = "monthly_grant"
reference_id = "{user_id}:{tier}:{YYYY-MM}"
```

发放后写 ledger：

- `type = grant_monthly`
- `amount = 30000`（仅 Pro）
- `expires_at = NULL`（v1 不过期，见 §关键决策 1）

**注册赠送**（与月度发放同处懒发放，新用户一次性）：

- 同样在 `/credits/balance` 首次访问时入账（与月度发放同批）。
- `reference_type = "signup_grant"`，`reference_id = "{user_id}:signup"`，唯一索引保证一生只发一次。
- `type = grant_monthly`、`amount = 1000`、`expires_at = NULL`（不过期）。

过期处理（推迟到 v1.1）：

- v1 不实现过期：赠送积分滚存累计，`expire` ledger type 与 `expires_at` 列、`idx_credit_ledger_expiry` 索引均保留占位但不写入。
- v1.1 再做过期时，需要先引入分桶/lot 记账以区分"未花掉的赠送"与"购买积分"，否则无法正确只过期赠送部分。届时另议。

### F. 与现有业务集成

Chat（纯积分制，按积分扣费，见 §关键决策 3）：

- 发送前 `reserveCredits(chat_message=1)`：余额不足直接返回 402 `credits_insufficient`，不调用 LLM。
- 回复成功持久化后 `commitReservation`；LLM 早失败/中断 `releaseReservation` 退回预占。
- 每日消息条数配额下线；rate-limit（10/分）保留防滥用。
- **接线点**：`chat/messages.ts` 的 `handlePostMessage`，重生成走 `chat/regenerate.ts` 同样处理。
- signal extract / summary 始终不扣。

Image generation（本轮接线，见 §关键决策 5）：

- 计费契约：创建 job 前 `reserveCredits(image_generation = 40)`（referenceId = 预生成 jobId，余额不足 402 且不创建 job）；job 落终态后统一结算——`succeeded` → `commitReservation`，`failed` / `cancelled` → `releaseReservation`。
- 若 provider 已扣真实成本但输出不可用，仍按产品口径 release 给用户；真实成本进入运营成本。
- **接线点**：复用 `image_generation_jobs.billing_ref` 列（migration `0018` 已有）记录预占 `reservation_id`，无需新增列；reserve 在各生图入口（moment / outfit / base-art 路由）创建 job 前；commit/release 在 job 落终态的**统一收敛点**——`art-consumer`、moment reconcile、runninghub 轮询都汇聚到一个 `settleImageJobReservation`。覆盖范围见 [`spec-020`](./spec-020-companion-emotion-art-generation.md)。

Admin/system：

- admin prewarm 和后台系统任务不扣用户 credits。
- 仍记录 provider cost 到 LLM/image usage 日志。
- 管理员查看/调整指定用户积分（写 `adjustment` ledger，只增不减）由 [`spec-023`](./spec-023-admin-workspace.md) 承载；本 spec 只暴露 ledger helper，不定义管理员端点。

### G. 前端展示

- `Me` 或 `Billing` 页展示 available/reserved credits。
- 触发 image generation 前展示消耗：`Generate expression - 40 credits`。
- 收到 402 `credits_insufficient` 时弹付费墙（充值入口 + Pro 升级入口）。
- Ledger 页面可后置；v1 至少在 Billing 页显示最近 20 条流水。

---

## 实施步骤

1. 新增 credits migration：`credit_accounts`、`credit_ledger_entries`（含 §A 索引）。
2. 新增 credits 模块和 pricing 常量（`chat_message` 价格定义但不接调用）。
3. 实现 account/ledger 原子更新 helper（条件 UPDATE + 同批 ledger，见 §B 并发约定），覆盖 grant、reserve、commit、release、refund、purchase；含 helper 单测（grant/reserve/commit/release/refund、并发不超扣、幂等）。
4. 接入 lazy monthly grant 到 `/credits/balance`（幂等、不过期）。
5. 新增 `/credits/balance`、`/credits/ledger`、`/credits/checkout`。
6. 扩展 Stripe webhook：识别 credits checkout session 并幂等入账。
7. 前端 Billing/Me 页面展示 available/reserved credits，并处理 `credits_insufficient`。
8. 补测试和 docs。

> 本轮修订新增工作项（消费侧接线）：① pricing 数值更新（生图 40、聊天 1、语音 3、月度 0/30000、充值 5000/15000/40000）+ 注册赠送 `SIGNUP_GRANT=1000`；② 生图 reserve/commit/release 接线（用 `image_generation_jobs.billing_ref` 记录预占 + 统一 `settleImageJobReservation`）；③ 聊天 reserve/commit/release 接线 + 下线每日条数配额；④ 前端 402 付费墙。

---

## 验证方式

- 新用户首次访问 `/credits/balance` 获得注册赠送 1000 credits。
- Pro 用户当月获得 30000 credits。
- Free 用户重复访问不会产生月度 grant；Pro 用户同一月份重复访问不会重复发放。
- `reserveCredits(image_generation = 40)` 后 available 减少、reserved 增加（helper 单测，可不经业务流程）。
- commit 后 reserved 减少，available 不增加。
- release 后 reserved 减少、available 恢复。
- 并发两次 reserve 超过余额时只有一次成功，账户不出现负 available（并发不超扣）。
- 余额不足时 helper 返回 402 `credits_insufficient`，不写 ledger。
- Stripe credits checkout completed 后 purchase ledger 入账一次，重复 webhook 不重复加积分。
- v1 月度赠送积分跨月不过期、可继续消费；购买积分同样不过期。

---

## 回滚

- 若 credits 系统故障，可临时关闭业务扣费开关，保留 ledger 数据。
- Chat 可临时关闭积分扣费（放行）并仅保留 rate-limit。
- Image generation 可回退为 admin-only 或完全关闭生成端点。
- Stripe credits checkout 可从 UI 隐藏，webhook 保留幂等处理。
- 回滚 migration 前需确认没有业务代码依赖 `credit_accounts`；ledger 历史建议归档后再删除。

---

## 依赖

- ⬅️ 阻塞前置：[`spec-010`](./spec-010-billing-entitlements-quota.md)（Stripe SDK、customer 映射、订阅 tier、billing status）。
- ➡️ 下游消费方（非前置）：[`spec-020`](./spec-020-companion-emotion-art-generation.md)，首个高成本积分消费场景；本 spec 交付 reserve/commit/release helper，由 spec-020 在生图流程落地时接线（见 §F / §关键决策 5）。
- ➡️ 下游消费方：[`spec-023`](./spec-023-admin-workspace.md)，复用本 spec 的 ledger（新增 `adjustCredits` helper，管理员只增不减）。
