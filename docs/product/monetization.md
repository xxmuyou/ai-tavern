# 付费设计

> 本文档定义产品的付费模型（**纯积分制**）、积分获取与消费、订阅、充值与 Stripe 集成。产品定位见 [`vision.md`](./vision.md)，玩法机制见 [`gameplay.md`](./gameplay.md)。积分账本与扣费实现见 [`spec-021`](../specs/spec-021-credits-ledger-and-metering.md)。
>
> **2026-06-08 改版：** 付费模型从"免费额度 + 订阅去除限制"转向**纯积分制**——所有功能人人可用，只看积分余额。订阅（Pro）的价值变为"定期发放更多积分 + 少量特权"，并叠加 pay-as-you-go 充值。
>
> **关于"暂定"标注：** 标为 *(暂定)* 的数值是合理初稿，正式上线前需根据真实成本与用户测试调优。

---

## 1. 核心模型：纯积分制

**所有功能人人可用，只看积分余额。**

- 不做内容墙、不做功能门控 —— 免费用户也能体验全部产品功能（场景、官方角色、自创角色、奇点系统、聊天、生图），区别只在"账上还有多少积分"。
- **积分来源**：注册赠送（一次性）、Pro 月度赠送、pay-as-you-go 充值。
- **积分消费**：聊天、生图等高/低成本 AI 任务。
- **兑换率锚定 $1 = 1000 积分**（粒度足够细，可表示聊天 $0.001/条这类细价）。
- **订阅（Pro）= 月度发放更多积分 + 少量特权**，不再用订阅"去除限制"。

---

## 2. 积分获取

### 2.1 注册赠送

- 新用户注册一次性赠送 **1000 credits**（≈25 张图），不过期。
- 懒发放：首次访问 `/credits/balance` 时入账，reference `{user_id}:signup` 唯一保证只发一次。

### 2.2 月度赠送

| Tier | 月度赠送 |
|---|---:|
| Free | **0 credits** |
| Pro | **30000 credits** |

- 按 UTC 月份发放，同一用户同一月份同一 tier 只发一次。
- v1 **不过期**，未用完滚存累计（过期机制推迟到 v1.1，见 spec-021 §关键决策 1）。
- 仅 Pro 发放月度 grant；Free 升 Pro 后本月可再获 Pro grant；Pro 取消后到期前仍按 Pro 判定。

### 2.3 充值积分包（pay-as-you-go）

| Package | Credits | 价格 *(暂定)* |
|---|---:|---:|
| Small | **5000** | $4.99 |
| Medium | **15000** | $9.99 |
| Large | **40000** | $19.99 |

- 兑换率基准 $1 = 1000 积分；**买多送多**：Small 约平价、Medium 送约 50%、Large 约翻倍。
- 购买积分不过期。Stripe 一次性 Checkout（`mode: payment`），price ID 走环境变量配置。
- Billing 页面展示这些 package 时，除价格与 credits 外，应补充用户可理解的**使用量示例**，例如：
  - `5000 credits ≈ 125 张图`
  - `5000 credits ≈ 5000 条 chat`
  - 使用 `≈ / about` 语义表达，不作为精确承诺

---

## 3. 积分消费

| 任务 | 积分 | 折美元 | 说明 |
|---|---:|---:|---|
| `chat_message` | 1 / 条 | ≈$0.001 | 用户发送并成功获得回复 |
| `voice_generation` | 3 / 首次语音 | ≈$0.003 | 同一用户同一回复同一 voice/speed 首次生成语音；重复播放免费 |
| `image_generation` | 40 / 张 | ≈$0.04 | 每生成 1 张图（表情立绘 / 瞬间图 / 服装图 / 主形象） |
| `signal_extract` / `summary` / `admin_prewarm` | 0 | — | 系统任务，不向用户扣费 |

- **扣费模型**：reserve → commit/release。生图、聊天发送、聊天语音首次生成先预占，成功后确认、失败后释放（异步生图同理，见 spec-021 §F）。
- **语音试听**：voice preview 使用固定试听文本和全局缓存，不扣 `voice_generation` credits。
- **余额不足**：返回 `402 credits_insufficient`，前端弹付费墙（充值入口 + Pro 升级入口）。
- **成本健康度**：生图真实成本（RunningHub）<$0.01/张，用户侧 $0.04/张 仍有 4 倍以上毛利；聊天 LLM 成本约 $0.001~0.005/条（见 [`architecture/llm.md`](../architecture/llm.md)）。

> 系统行为（daily state `flavor_text`、memory 摘要、关系阶段更新、信号提取、push 内容生成）一律**不扣积分**，与 [`daily-life-sim.md`](./daily-life-sim.md) 一致。

---

## 4. 订阅层（Pro）

### 4.1 价格方案 *(暂定)*

| 方案 | 价格 | 周期 | 包含 |
|------|------|------|------|
| Monthly | **$9.99 / 月** | 1 个月 | 30000 积分/月 + 特权 |
| Annual | **$79.99 / 年**（约 $6.67/月） | 12 个月 | 同上 + 折扣 |

**v1 上线：仅推 Monthly。** Annual 在有保留率数据后（v1.x）再上。

### 4.2 Pro 的价值

- ✅ **月度发放 30000 积分**（vs Free 1000）——核心价值。
- ✅ **自创角色不限数量**（Free 限 3 个）——少数保留的订阅 gating（见 [`spec-010`](../specs/spec-010-billing-entitlements-quota.md)）。
- ✅ 专属 / 抢先内容（角色、场景、玩法）——**规划中**，本轮先预留，不做完整实现。
- ❌ 不再以"去除消息/生图限制"作为卖点——纯积分制下所有功能本就人人可用，区别只在积分量。
- ❌ 不给"优先 LLM 模型"——v1 保持模型一致性。

### 4.3 Billing 页面口径（Web）

- Billing 页面应优先回答用户的购买决策问题，而不只是展示价格卡。
- 页面至少要明确说明：
  - credits 可用于 `chat_message`、`image_generation`、`voice_generation`
  - 当前成本：`1 chat = 1 credit`、`1 image = 40 credits`、`首次 voice generation = 3 credits`
  - Free 与 Pro 的**已上线**差异：Free 注册赠送 `1000` credits、Pro 每月 `30000` credits、`3 / unlimited` 自创角色上限
- Billing 页面上的 Pro 卖点只写**当前真实已上线权益**；像“专属 / 抢先内容”这类规划项，不作为当前购买页主卖点展示。

### 4.4 为什么 $9.99/月

- 同类定价：Replika Pro $19.99、Character.ai+ $9.99、Talkie Premium $4.99-9.99。
- $9.99 是英文消费市场心理舒适价位，且 Pro 月度 30000 积分（≈750 张图）对重度用户极具吸引力。

---

## 5. Stripe 集成方案

### 5.1 Stripe 后台预建 Product / Price

- 订阅：`Pro Monthly` $9.99/month、`Pro Annual` $79.99/year（v1.x）。
- 积分包：Small / Medium / Large 一次性 price，price ID 写入环境变量：
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_CREDITS_SMALL` / `_MEDIUM` / `_LARGE`

### 5.2 订阅流程

```
Web 点 "Subscribe" → POST /billing/checkout → Worker 建 Stripe Checkout Session
  → 返回 Checkout URL → 用户支付 → Webhook checkout.session.completed
  → Worker 验签 + 更新 D1 订阅状态 → 订阅生效
```

### 5.3 充值流程

```
Web 点积分包 → POST /credits/checkout {package} → Worker 建一次性 Checkout Session（mode:payment）
  → 用户支付 → Webhook checkout.session.completed（含 credit_package metadata）
  → recordPurchase 入账 credit_ledger（type=purchase，stripe_session_id 幂等）
```

**移动端合规：** iOS app 内不直接引导到 Stripe Checkout；v1 先提供后端能力和 Web return URL，移动端入口与 App Store 合规路径由 spec-015 处理。

### 5.4 关键 Webhook 事件

| 事件 | 处理 |
|------|------|
| `checkout.session.completed` | 订阅生效 / 或积分包入账（按 metadata 区分） |
| `customer.subscription.created/updated/deleted` | 同步订阅状态 |
| `invoice.payment_succeeded` | 续费成功，延长 `current_period_end` |
| `invoice.payment_failed` | 拉取并同步 subscription 当前状态 |

### 5.5 退款 / 取消政策

- **取消订阅**：用户进入 Stripe Customer Portal 自助取消（到期前仍可用）。
- **退款**：v1 不做自助退款；积分不退现金、不提现、不在用户间转让（见 spec-021 非目标）。联系邮箱 **TBD**。
- **试用**：v1 不做免费试用（用注册赠送 + 月度赠送替代）。

---

## 6. 反作弊与边界

- **速率限制**：单分钟 10 条消息（保留防滥用，独立于积分）。
- **注册需邮箱验证**（防机器人）。
- **多账号**：v1 不做强反多账号；注册赠送 1000 是一次性、与设备/邮箱绑定的主要薅羊毛面，监测同 IP 大量新账号 → 软封禁。相比旧的"每日 30 条免费"，一次性赠送更难规模化薅。

---

## 7. 与现有代码 / 数据模型的关系

- 积分系统在 `packages/api/src/credits/`（ledger / pricing / grants / checkout / webhooks），账本基础设施已实现并有单测；本轮补消费侧接线（生图/聊天扣费）、注册赠送、前端付费墙，见 [`spec-021`](../specs/spec-021-credits-ledger-and-metering.md) §实施步骤。
- 订阅在 `packages/api/src/billing/`（spec-010 已实现）。
- 数据表 `credit_accounts` / `credit_ledger_entries` / `billing_subscriptions` 等见 [`data-model.md`](../architecture/data-model.md)。

---

## 8. 待最终敲定

- [ ] 充值积分包价格 / 积分量（$4.99=5000 等，上线后用数据调）
- [ ] 订阅价格：$9.99/月？
- [x] 兑换率：$1 = 1000 积分
- [x] 注册赠送：1000；月度 Free 0 / Pro 30000
- [x] 生图 50/张、聊天 1/条
- [x] 是否上线即推 Annual？v1 不推，仅 Pro Monthly
- [ ] Pro 专属 / 抢先内容的具体范围
- [ ] 退款政策措辞（需法务审）+ 联系邮箱
