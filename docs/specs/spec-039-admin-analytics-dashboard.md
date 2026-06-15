# spec-039 — Admin 用户数据看板（Web，本地验证优先）

> **类型：** 新建  |  **依赖：** spec-018, spec-023, spec-010, spec-021  |  **估时：** 2-4 天  |  **状态：** 🟡 in-progress（代码实现 + 本地自动验证已完成，待本地手工验收；本轮不含 dev 发布）

---

## Context

当前 `/admin` 已经有 Web 单页工作台，但管理员查看用户、会员、收入仍要在多处信息源之间切换：D1 看用户真相，Stripe 看收入真相，admin 用户积分面板只覆盖单用户查询。运营想先拿到一个“看全局”的入口：先看总用户数、新增用户、活跃用户、会员分布、收入趋势，再决定是否展开到用户明细。

本 spec 的第一版只做 **Web admin Analytics 面板**，坚持两条原则：

1. **用户与会员状态以 D1 为真相来源**。
2. **收入以 Stripe 为真相来源**，不做 D1 金额反推。

同时，本轮交付明确停在“**本地可运行、可验证**”，不直接发布到 `dev` 环境。

---

## 目标

- 在现有 `/admin` 单页工作台中新增 `Analytics` 顶层区域（仅 Web）。
- 支持 `today / 7d / 30d` 时间窗切换。
- 进入 `Analytics` 后自动拉取一次；后续仅在切换时间窗或点击手动刷新时重新拉取。
- 汇总展示：
  - 用户：总用户数、新增用户数、活跃用户快照、最近注册用户摘要
  - 会员：`Free / Pro` 分布、订阅状态分布
  - 收入：毛收入、`subscription revenue`、`credits revenue`
  - 趋势：新增用户按天趋势、收入按天趋势
- `recent_signups` 接口仍返回 dashboard 摘要数据；页面默认只展示最近 5 个摘要，查看更多走单独分页接口。
- 同步更新 spec 与 API 文档，明确“摘要”和“明细分页”的边界。

---

## 非目标

- 不新增数据库表。
- 不做 migration。
- 不做移动端 admin。
- 不做退款抵扣、净收入、财务级对账报表。
- 不把完整用户列表塞进 `overview` 响应。
- 不在本轮执行 `dev` 部署。

---

## 数据口径

### 1. 用户与会员

- `total_users`：`users` 总数
- `new_users`：`users.created_at` 落在所选窗口内
- `active_users`：当前快照，`users.last_seen_at >= range.fromMs`
- `tier_breakdown`：按当前有效订阅判断 `free / pro`
- `subscription_status_breakdown`：`billing_subscriptions` 每个用户最新一条状态的聚合

### 2. 收入

- `credits_revenue_usd`：Stripe 成功 credits checkout sessions，要求 `metadata.credit_package` 存在，按 `amount_total` 汇总
- `subscription_revenue_usd`：Stripe 已支付 Pro Monthly invoices，按 `amount_paid` 汇总
- `gross_revenue_usd`：以上两者相加
- 第一版不扣退款，不做净收入

### 3. 最近注册用户

- `recent_signups` 是 **dashboard 摘要列表**，页面默认展示前 5 条
- 需要查看更多时，走 `GET /admin/users/list?sort=recent_signup`
- `overview` 不承担全量列表职责

---

## 改动清单

### 后端

- 新增 `packages/api/src/admin/analytics.ts`
- 在 `packages/api/src/admin/index.ts` 接入 `handleAdminAnalyticsRequest`
- 新增：
  - `GET /admin/analytics/overview?window=today|7d|30d`
  - `GET /admin/users/list?sort=recent_signup&cursor=<optional>&limit=<optional>`

### 前端

- Web admin 顶层区域从 5 个扩展为 6 个：`Analytics / Users / Chat models / Portrait generation / Prompts / Settings`
- 新增：
  - `apps/app/components/admin/AnalyticsSection.tsx`
  - `apps/app/hooks/use-admin-analytics.ts`
- 扩展：
  - `apps/app/components/admin/AdminSectionTabs.tsx`
  - `apps/app/app/admin/index.web.tsx`
  - `apps/app/api/types.ts`
  - `apps/app/api/companion-client.ts`

### 文档

- 新增本 spec
- 更新：
  - `docs/specs/README.md`
  - `docs/specs/spec-018-web-ui-workspace.md`
  - `docs/specs/spec-023-admin-workspace.md`
  - `docs/architecture/api.md`

---

## API 契约

### `GET /admin/analytics/overview`

Response 固定包含：

- `window`
- `from`
- `to`
- `summary`
- `tier_breakdown`
- `subscription_status_breakdown`
- `signups_by_day`
- `revenue_by_day`
- `recent_signups`
- `revenue_status`

其中 `recent_signups` 只代表摘要列表；dashboard 默认展示前 5 条。

### `GET /admin/users/list`

第一版只支持：

- `sort=recent_signup`
- `cursor` 分页
- `limit` 控制页大小

用于 `Analytics` 的 `View all`。

---

## UI 约定

- `Analytics` 只出现在 Web admin
- 顶部概览拆成两个主面板：
  - `Users`：`Total users / New users / Active users / Free users / Pro users / Active subscriptions`
  - `Revenue`：`Gross revenue / Credits revenue / Subscription revenue`
- 趋势区：
  - `Signups by day`
  - `Revenue by day`
- 明细区：
  - `Recent signups` 摘要列表，默认 5 条
  - `Membership breakdown` 独立保留，但归在 Users 相关阅读流里
- `View all` 在同一 admin 区域内打开扩展明细视图，继续分页加载

---

## 验证方式

### 自动验证

```bash
pnpm --filter @xtbit/api test -- src/admin/analytics.test.ts
pnpm --filter @xtbit/api typecheck
pnpm --dir apps/app typecheck
pnpm --dir apps/app export:web
```

### 本地手工验证

- 启动本地 web/admin
- 进入 `/admin`，确认有 `Analytics` tab
- 验证：
  - 初次进入加载
  - 切换 `today / 7d / 30d`
  - 手动刷新
  - 页面停留时无自动轮询
  - `Recent signups` 默认 5 条
  - `View all` 后继续分页查看更多
  - 无数据态 / 接口失败态 / Stripe 配置缺失态可见提示

---

## 发布边界

- 本轮默认只要求 **本地验证**
- **不包含 `dev` 发布**
- 等本地验收通过后，再单独规划 `dev` 环境发布与环境核对

---

## 依赖

- [`spec-018`](./spec-018-web-ui-workspace.md)：承载 Web admin 单页工作台与顶层区域
- [`spec-023`](./spec-023-admin-workspace.md)：承载 admin 用户/积分契约；Analytics 的用户明细分页沿用同一 admin workspace 路线
- [`spec-010`](./spec-010-billing-entitlements-quota.md)：Stripe 订阅口径
- [`spec-021`](./spec-021-credits-ledger-and-metering.md)：credits 收入口径上下文
