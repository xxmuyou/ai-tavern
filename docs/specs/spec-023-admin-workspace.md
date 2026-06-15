# spec-023: Admin Workspace（管理员工作台）

> **类型：** 新建  |  **依赖：** spec-009, spec-021  |  **估时：** 2-3 天  |  **状态：** 🟡 in-progress（后端 3 端点 + `adjustCredits` helper + 单测已落地；admin「用户积分」UI 归 spec-018，待做）

> **已落地范围超出本 spec 原始口径（2026-05）：** 管理员工作台实际已扩展为多面板——除本 spec 的「用户积分」外，还含 **Settings（运行时运营配置 / DB 覆盖层）**、**Portrait generation（checkpoint catalog + workflow catalog + Anime/Realistic asset lanes；2026-06-04 修正见 spec-022 顶部）**、**Expression prompts（retired emotion variation）**、**LLM 配置**。其中运营配置与生图/checkpoint 配置的完整说明见 [`../ops/admin-settings-workspace.md`](../ops/admin-settings-workspace.md)（含 `app_settings` 表 migration `0024`、`image_models` migration `0022`/`0026`、`image_workflows` migration `0028`）。本 spec 仍只承载积分端点契约，其余面板按各自模块（spec-011 / spec-022）演进。

> **2026-06 Web admin UI 收尾边界：** 本轮 admin web 改造归 [`spec-018`](./spec-018-web-ui-workspace.md)，只涉及桌面布局、导航形态、组件替换和信息密度提升；不新增 admin API，不改 credits / allowlist / settings / llm / image-gen 的后端契约。当前 Web Admin 顶层区域标准叫法为 `Analytics`、`Users`、`Chat models`、`Portrait generation`、`Prompts`、`Settings`。其中 `Analytics` 面板的概览/趋势/最近注册分页由 [`spec-039`](./spec-039-admin-analytics-dashboard.md) 承载；本 spec 继续只承载用户积分契约。

---

## Context

当前管理员能力散落在多个 spec，没有统一出口：

- [`spec-009`](./spec-009-auth-oidc-magic-link.md)：admin 鉴权基础（`ADMIN_EMAILS` env + `admin_user_allowlist` 表 + `requireAdminUser` 守卫）。
- [`spec-011`](./spec-011-admin-llm-endpoints.md)：admin LLM 配置/测试/usage 端点（🟢 done）。
- [`spec-018`](./spec-018-web-ui-workspace.md)：Web admin 工作台 UI（成员管理已实现，用户/订阅查询列为后续）。

本 spec 作为**管理员后端能力的统一出口**，沿用 spec-011 的范本（后端端点单独成 spec，admin UI 归 spec-018）。本 spec 渐进式扩展：v1 只落地**管理员查看 + 增加用户积分**，后续 admin 能力（用户查询、订阅查询、运行状态等）在本 spec 内增量补充。

首个具体需求来自运营/客服场景：[`spec-021`](./spec-021-credits-ledger-and-metering.md) 定义了积分账本，但只覆盖用户自己的接口。管理员需要按用户查余额并**补发**积分——退款补偿、活动赠送、异常修正。spec-021 的 ledger `type` 已预留 `adjustment`，数据模型层面已留好口子，本 spec 只补管理员端点。

---

## 目标 / 非目标

### 目标

- 管理员按邮箱搜用户，拿到 userId。
- 管理员按 userId 查积分余额（available / reserved）+ 最近流水。
- 管理员给指定用户**增加**积分，写入 `adjustment` ledger，操作可审计（记录操作人 + 原因）。
- 全部端点走 `requireAdminUser`。

### 非目标

- ❌ 扣减 / 清零用户积分（管理员只能增加，见关键决策）。
- ❌ 退款到现金、用户间转账。
- ❌ 细粒度角色 / 权限分级（沿用现有 admin / 非 admin 二分）。
- ❌ admin UI 实现细节（归 [`spec-018`](./spec-018-web-ui-workspace.md)，本 spec 只给 API 契约）。
- ❌ 改动 spec-021 的积分数据模型（直接复用 `credit_accounts` / `credit_ledger_entries`）。
- ❌ 全量用户列表 / 导出（搜索端点只返回有限匹配）。

---

## 关键决策（开工前已敲定）

1. **只增不减**：调整端点 `amount` 必须为正整数；负数 / 0 / 非整数一律 400 `invalid_amount`。理由：积分不可被管理员删减，避免误操作与滥用；扣减场景（如违规处罚）若将来需要，另立 spec 并单独评审权限。
2. **复用 spec-021 ledger，不新建表**：调整写 `credit_ledger_entries`，`type = adjustment`，`amount` 为正数，`metadata` 记 `{ admin_id, reason }`。`available_credits` / `balance_after` 由 ledger helper 原子维护。
3. **必须经 spec-021 的 helper**：新增 `adjustCredits` 到 `packages/api/src/credits/ledger.ts`，业务端点不得直接写 `credit_accounts`（与 spec-021「所有积分变更必须通过 helper」原则一致）。本 spec 实施前提是 spec-021 已落地。
4. **原因必填**：adjustment 必须带非空 `reason`，写入 ledger metadata，用于审计追溯。
5. **搜索只返回有限匹配**：按邮箱精确或前缀匹配，结果上限固定（20 条），不提供全量用户列表，降低数据暴露面。
6. **鉴权沿用 spec-009**：复用 `requireAdminUser`（`ADMIN_EMAILS` + `admin_user_allowlist`），不引入新权限模型。

---

## 改动清单

### A. 路由分派

在 `packages/api/src/admin/index.ts` 链式分派中接入 `handleAdminCreditsRequest`，与现有 `handleAdminAllowlistRequest` / `handleAdminCompanionArtRequest` 同模式（`(request, env, pathname) => Promise<Response | null>`，命中返回 `Response`，否则返回 `null` 继续下一个）：

```ts
const creditsResponse = await handleAdminCreditsRequest(request, env, pathname);
if (creditsResponse) return creditsResponse;
```

### B. 新模块 `packages/api/src/admin/credits.ts`

每个 handler 首行 `await requireAdminUser(env, request)`。

#### B.1 `GET /admin/users?search=<email>`

按邮箱精确或前缀匹配用户，供管理员拿到 userId。

- `search` 为空 / 缺失 → 400 `search_required`。
- 无匹配 → 200 空数组（不报错）。
- 结果上限 20 条。

**Response 200：**

```json
{
  "users": [
    { "user_id": "usr_abc", "email": "user@example.com", "tier": "pro" }
  ]
}
```

#### B.2 `GET /admin/users/:userId/credits`

- 用户不存在 → 404 `user_not_found`。
- 返回余额 + 最近 N 条（如 20）ledger。

**Response 200：**

```json
{
  "user_id": "usr_abc",
  "available_credits": 320,
  "reserved_credits": 0,
  "recent_ledger": [
    {
      "id": "led_1",
      "type": "adjustment",
      "amount": 200,
      "balance_after": 320,
      "reason": "compensation for failed generation",
      "created_at": "2026-05-28T10:00:00.000Z"
    }
  ]
}
```

#### B.3 `POST /admin/users/:userId/credits/adjustment`

**Request body：**

```json
{
  "amount": 200,
  "reason": "compensation for failed generation"
}
```

校验：

- `amount` 必须为正整数，否则 400 `invalid_amount`。
- `reason` 必填非空 string，否则 400 `reason_required`。
- 用户不存在 → 404 `user_not_found`。

调用 `adjustCredits(env, { userId, amount, adminId: adminUser.id, reason })`，写 `type = adjustment` ledger，`metadata` 含 `admin_id` + `reason`。

**Response 200：** 返回调整后余额 + 新写入的 ledger 条目（格式同 B.2 单条）。

### C. credits 模块 helper

`packages/api/src/credits/ledger.ts` 新增（仅正数路径）：

```ts
adjustCredits(env, { userId, amount, adminId, reason }): Promise<{ balance_after: number; entry: CreditLedgerEntry }>
```

- 与 grant / purchase 同样走原子更新：`available_credits += amount`，写 ledger `type = adjustment`、`amount = +N`、`balance_after`、`metadata = { admin_id, reason }`。
- `amount <= 0` 应在端点层已拦截；helper 内再做一次防御性断言（非正数抛错），不写库。

### D. 鉴权

复用 `packages/api/src/auth/guards.ts` 的 `requireAdminUser`：

- 无 Bearer / token 失效 → 401 `auth_required`。
- 登录但非 admin → 403 `admin_required`。
- 通过则 `adminUser` 为 `UserRecord`，其 `id` 写入 ledger metadata `admin_id`。

### E. 错误码枚举

| code | HTTP | 触发 |
|------|------|------|
| `auth_required` | 401 | 无 Bearer / token 失效（spec-009 guard） |
| `admin_required` | 403 | 登录但非 admin（spec-009 guard） |
| `method_not_allowed` | 405 | 端点存在但方法不对 |
| `search_required` | 400 | 搜索端点 `search` 为空 |
| `user_not_found` | 404 | `:userId` 不存在 |
| `invalid_amount` | 400 | adjustment `amount` 非正整数 |
| `reason_required` | 400 | adjustment `reason` 为空 |

错误响应 `{ "error": "<code>" }`，不暴露 SQL / 堆栈 / 内部异常文本。

### F. 前端（归 spec-018，本 spec 只给契约）

admin 工作台新增「用户积分」面板：搜用户 → 看余额 / 流水 → 增加积分表单（amount + reason）。本 spec 不实现 UI，只提供上述 API 契约供 [`spec-018`](./spec-018-web-ui-workspace.md) 消费。

---

## 实施步骤

> 前提：[`spec-021`](./spec-021-credits-ledger-and-metering.md) 已落地（`credit_accounts` / `credit_ledger_entries` 表与 ledger helper 存在）。

1. `credits/ledger.ts` 新增 `adjustCredits`（仅正数路径）。
2. 新建 `admin/credits.ts`，实现 B.1 / B.2 / B.3 三个 handler。
3. `admin/index.ts` 链式接入 `handleAdminCreditsRequest`。
4. 单元测试 `admin/credits.test.ts`（参考 `auth/*.test.ts` 的 in-memory DB mock）：
   - 搜索：命中、空 `search` 400、无匹配返回空数组、上限截断。
   - 查余额：成功、用户不存在 404。
   - 调整：成功且余额上升、负数 / 0 / 非整数 400、reason 缺失 400、ledger 写入 `adjustment` 且 metadata 含 `admin_id` + `reason`。
   - 鉴权：401 / 403 / 200 三档。
5. spec-018 admin 页加「用户积分」面板（消费本 spec 端点）。
6. 文档同步：`docs/architecture/api.md` 加 3 个端点说明；README 把 spec-023 状态推进。

---

## 验证方式

- [ ] 单元测试全部通过。
- [ ] `pnpm --filter @xtbit/api typecheck` 干净。
- [ ] curl 三档鉴权（admin token / 非 admin token / 无 token），非 admin 返回 403 `admin_required`。
- [ ] `GET /admin/users?search=` 命中、空 search 400、无匹配空数组。
- [ ] 调整后 `GET /admin/users/:id/credits` 余额上升、`recent_ledger` 多一条 `adjustment`。
- [ ] 负数 / 0 / 非整数 amount、空 reason 分别返回对应 400。
- [ ] 用户视角 `GET /credits/ledger` 能看到这条 adjustment（与用户自助接口数据一致）。

---

## 回滚

- 单 commit 删除：`admin/credits.ts`、`admin/credits.test.ts`、`index.ts` 中的一条 dispatch、`ledger.ts` 的 `adjustCredits`、`api.md` 相关章节。
- 不动 schema、不动已写入的 `adjustment` ledger 数据。
- spec-018 的「用户积分」面板若已上线，一并下线或隐藏即可。

---

## 依赖

- ⬅️ 阻塞：[`spec-021`](./spec-021-credits-ledger-and-metering.md)（积分账本与 ledger helper，必须先落地）。
- ⬅️ 软依赖：[`spec-009`](./spec-009-auth-oidc-magic-link.md)（`requireAdminUser` 守卫；已 done）。
- ➡️ 解锁：[`spec-018`](./spec-018-web-ui-workspace.md)（消费本 spec 端点实现 admin 用户积分面板）。
- 与 [`spec-011`](./spec-011-admin-llm-endpoints.md) 同属管理员后端能力，互不交叉，共享 `requireAdminUser` 与 `admin/` 分派模式。
