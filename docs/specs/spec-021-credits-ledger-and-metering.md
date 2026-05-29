# spec-021: Credits Ledger and Metering

> **类型：** 新建  |  **依赖：** spec-010  |  **估时：** 5-8 天  |  **状态：** 🟢 done（后端 + 单测；前端 Billing 积分面板：余额/购买包/最近流水，web + native。402 `credits_insufficient` 拦截无 v1 触发点——chat 不扣费、生图未接线——随 spec-020 生图入口落地）

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
- 任务按固定积分价计费（价格表统一定义；v1 只对 `image_generation` 实际扣费）：
  - `chat_message`: 1 credit（v1 不启用扣费，见 §关键决策 3）
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

## 关键决策（已敲定）

1. **v1 赠送积分不过期**：月度赠送积分滚存累计，不在月末过期；过期机制（`expire` ledger + 分桶记账）推迟到 v1.1。理由：避免在缺少分桶记账时错误过期掉购买积分；`available_credits` 是单一整数，无法区分"未花掉的赠送"与"购买"，强行过期会有边界 bug。`expires_at` 列与 `expire` type 保留占位，v1 grant 写 `expires_at = NULL`。
2. **并发防超扣用原子条件 UPDATE**：D1 无交互式事务/行锁，所有扣减走 `UPDATE ... WHERE available >= N` 并按影响行数判断成功/不足，与 ledger 写入放在同一个 `DB.batch()`。禁止"先 SELECT 读余额再扣"的非原子写法。
3. **v1 chat 不扣积分**：credits 只对 `image_generation` 实际扣费；chat 继续走 spec-010 的每日消息 quota。`chat_message` 价格在价格表里先定义不启用，待观察成本后再决定是否开启。理由：chat 扣费是"回复已生成后的事后扣"，无法干净地 402 拦截，且本期商业化重点是高成本生图。
4. **helper 语义钉死**：`reserveCredits` 返回的 `reservationId` 即那条 `reserve` ledger 的 `id`；`commitReservation` / `releaseReservation` 用它反查原始预占额来结算 reserved；reserve 幂等由 `idx_credit_ledger_reference`（`type + reference_type + reference_id` 唯一）保证，同 reference 重复 reserve 返回已存在预占而非报错。
5. **本 spec 只交付 ledger helper + 单测，不接业务流程**：reserve→enqueue、webhook 成功 commit、失败 release 接进 `art-consumer` 的接线，等生图流程跑通后随 [`spec-020`](./spec-020-companion-emotion-art-generation.md) 落地，见 §F。

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
- v1 月度赠送积分不过期，未用完的额度滚存累计（过期机制推迟到 v1.1，见 §关键决策 1 与 §E）。

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
| `chat_message` | 1 | 用户主动发送并成功获得 companion 回复（v1 价格已定义但不实际扣费） |
| `image_generation` | 100 | 每生成 1 张图片 |
| `signal_extract` | 0 | 系统内部任务，不向用户扣费 |
| `summary` | 0 | 系统内部任务，不向用户扣费 |
| `admin_prewarm` | 0 | admin/system 成本审计，不扣普通用户积分 |

v1 chat 不扣 credits，继续只受 free daily message quota 限制；credits 系统本期只服务 `image_generation`，是高成本生图的成本控制与商业化基础。

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
- `amount = 50` 或 `1000`
- `expires_at = NULL`（v1 不过期，见 §关键决策 1）

过期处理（推迟到 v1.1）：

- v1 不实现过期：赠送积分滚存累计，`expire` ledger type 与 `expires_at` 列、`idx_credit_ledger_expiry` 索引均保留占位但不写入。
- v1.1 再做过期时，需要先引入分桶/lot 记账以区分"未花掉的赠送"与"购买积分"，否则无法正确只过期赠送部分。届时另议。

### F. 与现有业务集成

Chat（v1 不扣积分，见 §关键决策 3）：

- v1 chat **不扣 credits**，继续只受现有 free daily message quota 限制。
- `chat_message` 价格在 `pricing.ts` 里定义占位，但本期不接任何扣费调用；待观察成本后再决定是否开启（开启时再补"成功持久化后扣 1、LLM 早失败不扣、daily quota 满优先返回 quota error"等规则）。
- signal extract / summary 始终不扣。

Image generation（本 spec 只交付 helper，接线随 spec-020 落地，见 §关键决策 5）：

- 计费契约：创建 job 前 `reserveCredits(image_generation = 100)`；job 成功后 `commitReservation`；failed/cancelled 后 `releaseReservation`。
- 若 provider 已扣真实成本但输出不可用，仍按产品口径 release 给用户；真实成本进入运营成本。
- **接线归属**：上述 reserve/commit/release 调用接进 `art-consumer`（reserve 在入队前、commit 在 webhook 成功路径、release 在失败/取消路径）属于生图流程落地工作，待生图 workflow 跑通后随 [`spec-020`](./spec-020-companion-emotion-art-generation.md) 实施。本 spec 只负责把 helper 实现好并通过单测。

Admin/system：

- admin prewarm 和后台系统任务不扣用户 credits。
- 仍记录 provider cost 到 LLM/image usage 日志。
- 管理员查看/调整指定用户积分（写 `adjustment` ledger，只增不减）由 [`spec-023`](./spec-023-admin-workspace.md) 承载；本 spec 只暴露 ledger helper，不定义管理员端点。

### G. 前端展示

- `Me` 或 `Billing` 页展示 available/reserved credits。
- 触发 image generation 前展示消耗：`Generate expression - 100 credits`。
- 积分不足时展示充值入口和 Pro 升级入口。
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

> 不在本 spec 范围：chat 扣费（v1 不启用）、将 reserve/commit/release 接进 `art-consumer`（随 spec-020 落地，见 §F / §关键决策 5）。

---

## 验证方式

- 新用户首次访问 `/credits/balance` 获得 Free 50 credits。
- Pro 用户获得 1000 credits。
- 同一用户同一月份重复访问不会重复发放。
- `reserveCredits(image_generation = 100)` 后 available 减少、reserved 增加（helper 单测，可不经业务流程）。
- commit 后 reserved 减少，available 不增加。
- release 后 reserved 减少、available 恢复。
- 并发两次 reserve 超过余额时只有一次成功，账户不出现负 available（并发不超扣）。
- 余额不足时 helper 返回 402 `credits_insufficient`，不写 ledger。
- Stripe credits checkout completed 后 purchase ledger 入账一次，重复 webhook 不重复加积分。
- v1 月度赠送积分跨月不过期、可继续消费；购买积分同样不过期。

---

## 回滚

- 若 credits 系统故障，可临时关闭业务扣费开关，保留 ledger 数据。
- Chat 可回退到只使用现有 daily quota。
- Image generation 可回退为 admin-only 或完全关闭生成端点。
- Stripe credits checkout 可从 UI 隐藏，webhook 保留幂等处理。
- 回滚 migration 前需确认没有业务代码依赖 `credit_accounts`；ledger 历史建议归档后再删除。

---

## 依赖

- ⬅️ 阻塞前置：[`spec-010`](./spec-010-billing-entitlements-quota.md)（Stripe SDK、customer 映射、订阅 tier、billing status）。
- ➡️ 下游消费方（非前置）：[`spec-020`](./spec-020-companion-emotion-art-generation.md)，首个高成本积分消费场景；本 spec 交付 reserve/commit/release helper，由 spec-020 在生图流程落地时接线（见 §F / §关键决策 5）。
- ➡️ 下游消费方：[`spec-023`](./spec-023-admin-workspace.md)，复用本 spec 的 ledger（新增 `adjustCredits` helper，管理员只增不减）。
