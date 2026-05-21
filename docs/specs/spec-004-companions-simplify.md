# spec-004: companions 角色卡 CRUD + 字段简化

> **类型：** 改写  |  **依赖：** spec-003  |  **估时：** 2-3 天  |  **状态：** ⚪ todo

---

## Context

v1 数据模型已经把 companions 字段从原来 15+ 个简化到 6 个核心字段（[`architecture/data-model.md §3.3`](../architecture/data-model.md#33-companions)）：
`name / appearance / personality / background / speech_style / preferred_scenes`（加 `relationship_role` 等系统字段）。

spec-003 把表建好了，但没人能创建、读取或修改角色。本 spec 把 `/companions` 端点全部落地，并强制执行"免费用户最多 3 个自创角色"的额度。

LLM 辅助创角（`POST /companions/assist`）依赖 spec-002 的多供应商路由，本 spec 不实现 —— 等 spec-002 完成后由独立 PR 接入。

---

## 目标

- 实现 `packages/api/src/companions/` 模块（与 `scenes/` 同等结构）
- 落地以下端点（合约严格按 [`architecture/api.md §3`](../architecture/api.md#3-companions-端点)）：
  - `GET /companions` —— 列出官方 + 当前用户自创，按 `?source=official|user|all` 过滤
  - `GET /companions/{id}` —— 详情，包含 7 维度数值 + 关系等级
  - `POST /companions` —— 创建自创角色（强制 `source='user'`，6 字段 + 可选 `relationship_role`）
  - `PUT /companions/{id}` —— 仅自创可改；官方角色返回 403
  - `DELETE /companions/{id}` —— 软删（`is_active=0`）；保留 relationships 历史
- Quota 检查：用户 active 自创角色数 ≥ 3 时 POST 返回 402（v1 阶段：所有用户走免费路径，spec-010 上线后订阅用户绕开此检查）
- 6 个核心字段除 `name` 外全部允许 null（降低创建门槛）
- 单元测试覆盖 happy path + 鉴权 + 配额 + 越权改/删

## 非目标

- ❌ `POST /companions/assist`（依赖 LLM 路由 spec-002，单独 PR 接入）
- ❌ 实际计算关系等级 `level_label`（spec-005 写关系数值时同步更新）
- ❌ Stripe 订阅识别 + 绕过 quota（spec-010）
- ❌ 角色立绘上传 / R2 绑定（暂不实现，`art_url` 接受字符串即可）

---

## 改动清单

### A. 新建 `packages/api/src/companions/index.ts`

导出 `handleCompanionsRequest(request, env, pathname)`，按路径 + 方法分派：

- `GET /companions` → `listCompanions(env, user, sourceFilter)`
- `GET /companions/{id}` → `getCompanion(env, user, id)`
- `POST /companions` → `createCompanion(env, user, body)`
- `PUT /companions/{id}` → `updateCompanion(env, user, id, body)`
- `DELETE /companions/{id}` → `deleteCompanion(env, user, id)`
- 其它 `/companions/...`（如 `/companions/assist`）→ 返回 `null`（让 index.ts 走 404）

### B. 可见性规则

| Source | 谁能 read | 谁能 update / delete |
|--------|----------|---------------------|
| official | 所有登录用户 | 仅平台 admin（v1 不开放此入口；403 to 普通用户） |
| user-created | 仅 owner（`created_by = user.id`） | 仅 owner |

GET 列表的 `?source` query：
- `official`: 仅返回 `source='official' AND is_active=1`
- `user`: 仅返回 `source='user' AND created_by = user.id AND is_active=1`
- `all`（默认）: 上面两组的并集

### C. POST 创建的输入校验

```typescript
type CreateInput = {
  name: string;                     // required, 1-80 chars
  appearance?: string;
  personality?: string;
  background?: string;
  speech_style?: string;
  relationship_role?: string;       // optional: friend/crush/colleague/neighbor/stranger/family
  preferred_scenes?: string[];      // optional, default []
  art_url?: string;
};
```

字段长度上限（防滥用）：
- `name`: 80
- 其他 text 字段：4000 字符

`relationship_role` 若非已知枚举值则忽略（不报错）。

`preferred_scenes` 不校验场景 ID 是否存在 —— 允许引用未来才存在的场景。

### D. PUT 更新

- 仅接受同上字段子集；body 中未给出的字段不动
- `name` 不接受 null/空字符串（更新时 name 仍必须有值）
- 官方角色返回 `403 forbidden_official`

### E. DELETE

- 软删除（`is_active=0` + `updated_at=now()`）
- 不实际删除 row，保留 relationships 历史
- 官方角色返回 `403 forbidden_official`

### F. GET 详情返回 7 维度

从 `relationships` 表 left join 取当前用户与该 companion 的维度值；若无 row 返回全 0 + `level: null`。

```json
{
  "id": "...",
  "source": "official",
  "name": "Maya",
  "appearance": "...",
  ...
  "relationship": {
    "level": "Friend" | null,
    "dimensions": {
      "closeness": 42, "trust": 35, "romance": 18, "friendship": 50,
      "hostility": 0, "tension": 5, "distance": 10
    },
    "first_met_at": null | 1747700000000,
    "last_interaction_at": null | 1747700000000
  }
}
```

### G. 更新 `packages/api/src/index.ts`

- 从 `RETIRED_PREFIXES` 移除 `"/companions/"`
- import `handleCompanionsRequest`
- 在 scenes dispatch 之后调用

### H. 单元测试 `packages/api/src/companions/index.test.ts`

至少覆盖：

- 401: 列表 / 详情 / 创建 / 更新 / 删除全部需要 token
- list 默认返回官方 + 自创（自创只属于当前用户）
- list `?source=user` 仅自创、`?source=official` 仅官方
- get 详情：无 relationship 返回全 0 dimensions + `level: null`
- get 详情：有 relationship 返回正确 dimensions + level_label
- create: 成功返 201 + 完整对象
- create: 缺 name 返 400
- create: 第 4 个 active user companion 返 402 `quota_exceeded`
- update: owner 改自创成功
- update: 改官方返 403
- update: 改他人自创返 403
- delete: 软删后 list 不再出现
- delete: 官方返 403

---

## 实施步骤

1. 写 `companions/index.ts`（CRUD + quota check）
2. 写 `companions/index.test.ts`
3. 更新 `index.ts`（移除 retired + 加 dispatch）
4. 跑 `pnpm typecheck && pnpm test`
5. 跑 `pnpm dev`，curl 验证一遍
6. PR + merge

---

## 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（新增 12+ 测试）
- [ ] dev: 未登录任意 /companions 端点 → 401
- [ ] dev: 登录后 POST /companions 成功创建，自创角色 ≤ 3
- [ ] dev: 第 4 个 → 402 quota_exceeded
- [ ] dev: GET /companions/{id} 返回 7 维度（无关系时全 0）
- [ ] dev: 改 / 删官方 → 403
- [ ] dev: 改 / 删他人自创 → 403

---

## 回滚

- git revert
- 不动 D1 schema，安全

---

## 依赖

- ⬅️ 阻塞于：spec-003
- ➡️ 阻塞：spec-006（chat 加载角色卡）、spec-012（前端角色页）
- ⏸️ 不阻塞但相关：spec-005（关系数值的实际写入逻辑）、spec-002（/companions/assist）

---

## 注意

- 6 字段简化已在 spec-003 的 schema 中落地；本 spec 不改 schema
- v1 暂时所有用户走免费路径（quota=3），spec-010 上线后通过 billing entitlement helper 给 Pro 用户绕过
- 不要在本 spec 中实现 `/companions/assist` —— 它会拉进 LLM 依赖，破坏"小而专"的 spec 边界
- 删除官方角色路径暂不开放（管理后台是 spec-011 的工作）
