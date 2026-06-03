# 付费设计

> 本文档定义产品的付费模型、免费额度、订阅价格、Stripe 集成方案。产品定位见 [`vision.md`](./vision.md)，玩法机制见 [`gameplay.md`](./gameplay.md)。
>
> **关于"暂定"标注：** 文档中标为 *(暂定)* 的数值是合理初稿，正式上线前需根据 LLM 实际成本与用户测试调优。

---

## 1. 核心模型

**免费 + 额度限制 / 订阅去除限制。**

不做内容墙、不做 demo wall —— 免费用户可以体验全部产品功能（场景、官方角色、自创角色、奇点系统），仅在使用量上有限制。

## 2. 免费层

### 2.1 限制项

免费用户每日有以下额度：

| 资源 | 免费额度 *(暂定)* |
|------|----------|
| AI 对话消息（用户发出的消息数） | **每日 30 条** |
| 自创角色数量 | **最多 3 个** |
| Memory 相册容量 | **最多保留 20 条**（超出后老的自动淡出） |
| 在场景中触发的事件 | 无单独限制（受对话额度间接限制） |

**日常生活玩法下的配额边界**（与 [`daily-life-sim.md`](./daily-life-sim.md) 对应）：

| 行为 | 是否计入对话额度 |
|---|---|
| 6 种活动（check_in / hang_out / invite / date / gift / repair）下的用户发言 | **计入**（统一按消息条数，不按活动类型区分） |
| daily state 的 `flavor_text` 生成 | **不计入**（系统行为，懒加载缓存，TTL ~24h） |
| memory 摘要生成 | **不计入**（里程碑触发后的系统行为） |
| 关系阶段更新 / 信号提取 | **不计入**（规则引擎，非对用户的额外 LLM 调用） |
| daily state 规则字段（位置 / mood / availability / activity_hint） | **不消耗**（全局共享缓存，零增量 LLM 成本） |
| Push notification 内容生成 | **不计入**（每天最多 1 条，系统行为） |

**设计意图：** 用户的额度感知应该等于"今天能聊多少话"，而不是"今天能用多少系统功能"。免费用户即使额度用完，也能查看 daily state、回看 memory 相册、看推荐拜访 —— 只是不能再发言。

### 2.2 设计原则

- **额度按"用户发出的消息"计量**，不按 LLM token 计量
  - 用户感知简单（"今天能聊 30 次"）
  - 后端用 KV 计数器实现，逻辑简单
- **额度每日 UTC 0 点重置**
  - 不做"按月分配 + 当月消费"，太复杂
- **超出额度时**：
  - 当前进行中的对话**允许说完最后一轮**（不要在中途截断）
  - 下一条新消息发出时返回 `402 Payment Required` + 友好提示 "Daily limit reached. Subscribe to keep going."
  - 提供"等待重置"或"订阅"两条出路

### 2.3 为什么 30 条/日

- 行业参考：
  - Character.ai：免费无明确上限但限速
  - Replika：免费版可聊但部分功能墙（关系深度、语音）
  - Talkie：免费每日 ~50 次
- 30 条 = 用户每天 5-10 分钟轻度玩家可满足，但深度玩家会触顶
- 给"订阅价值"留足空间（订阅去掉限制 → 不限量）
- 后端 LLM 成本可控（按平均 30 条/用户/日测算，单用户日成本约 $0.02-0.05，见 [`architecture/llm.md`](../architecture/llm.md)）

**注：** v1 上线后用真实数据调整。如果 LLM 成本超预期，降到 20 条；如果转化率低，升到 50 条。

## 3. 订阅层

### 3.1 价格方案 *(暂定)*

| 方案 | 价格 | 周期 | 包含 |
|------|------|------|------|
| Monthly | **$9.99 / 月** | 1 个月 | 全部解锁 |
| Annual | **$79.99 / 年**（约 $6.67/月） | 12 个月 | 全部解锁 + 33% 折扣 |

**v1 上线：仅推 Monthly。** Annual 在订阅产品有一定保留率数据后（v1.x）再上。

### 3.2 订阅去除的限制

- ✅ AI 对话消息：**不限量**（仅做软上限防滥用，比如 1000 条/日触发审查）
- ✅ 自创角色：**不限数量**
- ✅ Memory 相册：**无容量限制**（免费用户最多保留 20 条）
- ✅ 高清 milestone 装饰层 / 手绘专属 CG（v2+）：仅 Pro 可见
- ✅ 角色**表情立绘解锁**（neutral 之外的 playful/tense/…）：仅 Pro 可在角色图鉴手动解锁生成；免费用户聊天里只有 neutral + 基础情绪反馈（2026-06-01）
- ✅ 自创角色剧情增强（v1.x）：基础剧情包和手写免费；当前 spec-029 实现中 AI draft 为 Pro-only。credits 扣费需另行确认价格后接入。
- ❌ 不给"独家内容"（如订阅专属场景或角色）—— v1 不做内容墙，订阅核心价值是"去限制 + 相册无限"
- ❌ 不给"优先 LLM 模型"（如订阅用 GPT-4，免费用 GPT-3.5）—— v1 保持模型一致性

### 3.3 为什么 $9.99/月

- 类似产品定价区间：
  - Replika Pro：$19.99/月
  - Character.ai+：$9.99/月
  - Talkie Premium：$4.99-9.99/月
- $9.99 是英文消费市场"心理舒适价位"
- 比 Replika 便宜（突出价值差），与 Character.ai+ 持平
- 给后续涨价留余量

## 4. Stripe 集成方案

### 4.1 产品 / 价格在 Stripe 后台预先创建

- Product: `AI Companion Subscription`
- Prices:
  - Pro Monthly: $9.99 / month, recurring（Stripe price id 写入 `STRIPE_PRICE_PRO_MONTHLY`）
  - Pro Annual: $79.99 / year, recurring（v1.x 启用，不进 spec-010）

价格 ID 配置在 `wrangler.jsonc` 的环境变量里（不写死代码）。

### 4.2 订阅流程

```
用户在 Web 端点击 "Subscribe"
  ↓
Web 调 POST /billing/checkout
  ↓
Worker 调 Stripe Checkout Session 创建（带 user_id、Stripe Customer、Pro Monthly price）
  ↓
Worker 返回 Stripe Checkout URL
  ↓
Web 跳转到 Stripe Checkout 页
  ↓
用户完成支付
  ↓
Stripe Webhook 推送 `checkout.session.completed` → Worker
  ↓
Worker 验证签名 + 更新 D1 用户订阅状态（active / period_end）
  ↓
用户回到 app，订阅生效
```

**移动端合规：** iOS app 内不直接引导到 Stripe Checkout；v1 先提供后端能力和 Web return URL，移动端入口与 App Store 合规路径由 spec-015 处理。

### 4.3 订阅状态校验

业务模块通过 entitlement helper 判断：
1. 从 JWT 取出 user_id
2. 查 D1 `billing_subscriptions`：
   - `status IN ('active', 'trialing')` 且 `current_period_end > now()` → Pro
   - `current_period_end` 存 Unix milliseconds，Stripe seconds timestamp 在 webhook sync 边界转换
   - 否则按免费用户处理
3. 不要求每日 cron 清理；过期订阅只要超过 `current_period_end` 就不会被判定为 Pro

### 4.4 关键 Webhook 事件

需要 handle 的 Stripe 事件：

| 事件 | 处理 |
|------|------|
| `checkout.session.completed` | 创建/更新订阅记录 |
| `customer.subscription.created` | 同步新订阅状态 |
| `customer.subscription.updated` | 同步订阅状态变化（如取消、降级） |
| `customer.subscription.deleted` | 标记订阅已终止 |
| `invoice.payment_succeeded` | 续费成功，延长 `current_period_end` |
| `invoice.payment_failed` | 拉取并同步 subscription 当前状态，不手动猜测权益 |

### 4.5 退款 / 取消政策

- **取消订阅**：用户进入 Stripe Customer Portal 自助取消（取消后到期前仍可用）
- **退款**：v1 不做自助退款，用户发邮件联系 → 人工处理
  - 联系邮箱：**TBD**（待填写，在 `ops/secrets.md` 或 app 内 Help 页统一引用）
  - 退款窗口：暂定订阅生效后 7 天内可全额退（v1 上线前敲定）
- **试用**：v1 不做免费试用（用免费额度替代试用）

## 5. 配额计量实现

### 5.1 数据结构

KV key 设计：

```
quota:{user_id}:{date_utc}:messages → 12
```

- 每用户每日一个 key
- 写入时按当前 KV 读写整数递增（v1 接受小竞态）
- TTL 约 90,000 秒，覆盖 UTC 日切换后的短时间读取

### 5.2 计量时机

- **AI 对话消息**：用户发出的每条消息计 1
- LLM 在打开 SSE 前失败，不扣额度
- 主回复成功并持久化后计 1；后续信号提取失败不退额度

### 5.3 订阅用户

- 不因消息数被硬阻断
- 仍写 KV 和 `usage_log`，用于 usage 展示、成本分析和欺诈检测
- 1000 条/日是软阈值，只记录/展示，不返回 402

## 6. 反作弊与边界

### 6.1 防滥用 *(暂定)*

- 订阅用户每日 1000 条对话为软阈值，不硬拦
- 单分钟速率限制：10 条
- 注册需邮箱验证（防机器人）

### 6.2 多账号问题

- v1 不做强反多账号
- 接受"一人多账号薅免费额度"的损耗（30 条/日 ×多账号 ≈ 仍可控成本）
- 监测异常行为（同 IP 大量新账号）→ 软封禁

## 7. 与现有代码的关系

- 当前 `/billing/*` 仍是 retired prefix，spec-010 会新增 `packages/api/src/billing/`
- 当前 `wrangler.jsonc` 第 30-33、102-105 行的 Stripe 配置是空
- 完整实现需要：
  - Stripe SDK 接入
  - Webhook endpoint + 签名验证
  - D1 `billing_customers` / `billing_subscriptions` / `billing_webhook_events` 表（见 [`data-model.md`](../architecture/data-model.md)）
  - KV 配额计量
  - middleware webhook bypass + auth 校验
  - 后端 checkout/status/portal/webhook 接口

具体改造任务进 `specs/`。

## 8. 待最终敲定

- [ ] 免费每日消息额度：30 条？（v1 上线后用数据调）
- [ ] 订阅价格：$9.99/月？
- [x] 是否上线即推 Annual？v1 不推，仅 Pro Monthly
- [ ] 退款政策措辞（需要法务审）
- [x] 试用策略：v1 不做免费试用
