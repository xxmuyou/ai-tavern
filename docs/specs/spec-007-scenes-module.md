# spec-007: scenes 模块新建

> **类型：** 新建  |  **依赖：** spec-003  |  **估时：** 2-3 天  |  **状态：** ⚪ todo

---

## Context

v1 主界面是「场景列表 → 选择场景 → 在场角色」的循环（[`product/gameplay.md §1-§2`](../product/gameplay.md)）。spec-003 已经把 `scenes` 表写进 v1 schema，但目前没有任何 HTTP 端点暴露场景数据，前端没法画主界面。

本 spec 把 `/scenes` 与 `/scenes/{id}/enter` 两个端点落地，前端可以开始拉场景列表 + 进场景。

---

## 目标

- 新建 `packages/api/src/scenes/` 模块（按 [`architecture/overview.md §2.2`](../architecture/overview.md#22-后端packagesapi-cloudflare-workers) 的模块结构）
- 实现：
  - `GET /scenes`：返回当前用户可见的场景列表（含解锁状态、在场可能角色）
  - `POST /scenes/{scene_id}/enter`：进入场景，返回场景详情 + 在场 companion 列表 + 触发的事件（v1 事件先返 null）
- 端点契约严格按 [`architecture/api.md §4`](../architecture/api.md#4-scenes-端点)
- 接入现有 auth middleware（`requireAuthUser`），非 prod 环境支持 dev-session fallback
- 解锁判定：解析 `scenes.unlock_condition` JSON（v1 仅支持 `min_relationship` 模式），未满足条件返回 `unlocked=false` + `unlock_hint`
- 在场判定：抽 companion 的 `preferred_scenes` 字段，过滤已与用户建立 relationships 的角色
- 单元测试覆盖 happy path + 错误路径

## 非目标

- ❌ companion 角色卡 CRUD（spec-004）
- ❌ 关系数值更新（spec-005，本 spec 仅只读关系等级）
- ❌ 事件触发与解决（spec-008，本 spec 进场景固定返 `event: null`）
- ❌ 场景预写内容（spec-013，本 spec 验证用空表 / 手插一条记录即可）
- ❌ AI 生成 opener / 描写（spec-006）

---

## 改动清单

### A. 新建 `packages/api/src/scenes/index.ts`

导出 `handleScenesRequest(request, env, pathname): Promise<Response | null>`，按路径分派：

- `GET /scenes` → `listScenes(env, user)`
- `POST /scenes/{scene_id}/enter` → `enterScene(env, user, scene_id)`
- 其它 `/scenes/...` → 返回 `null`（让 index.ts 走 404）

### B. 数据访问

读 `scenes`、`companions`、`relationships` 三表，无写操作。

**listScenes：**
- `SELECT * FROM scenes WHERE is_active = 1 ORDER BY display_order`
- 对每个 scene 解析 `unlock_condition` JSON → 调 `evaluateUnlock(env, user_id, condition)` 判定 unlocked
- 解析 `default_companions` JSON → 抽对应 companions（仅 `is_active=1` 的官方角色）→ 与 `relationships` JOIN 取 level_label
- 仅在 unlocked=true 时返回 `potential_companions`，否则返 `[]`

**enterScene：**
- `SELECT * FROM scenes WHERE id = ? AND is_active = 1` → 404 if not found
- 同样跑解锁判定 → 403 `scene_locked` if 未解锁
- 抽 default_companions 列表 → 同 listScenes
- v1 不生成 opener（spec-006 才用 LLM），返 `opener: null`
- v1 不触发事件，返 `event: null`

### C. 解锁判定（`scenes/unlock.ts`）

```typescript
type UnlockCondition =
  | { type: 'min_relationship', companion_id: string, dim: SingularityDim, value: number }
  | null;

async function evaluateUnlock(env, userId, raw: string | null): Promise<{
  unlocked: boolean;
  hint: string | null;
}>;
```

JSON parse 失败 → 视为 unconditional unlocked（防御性）。

### D. 修改 `packages/api/src/index.ts`

- 从 `RETIRED_PREFIXES` 移除 `"/scenes/"`
- import `handleScenesRequest`
- 在 auth dispatch 之后、retired check 之前调用

### E. 单元测试 `packages/api/src/scenes/index.test.ts`

至少覆盖：

- GET /scenes 未带 token → 401
- GET /scenes 带有效 dev-session token，scenes 表为空 → 200 + `{ scenes: [] }`
- GET /scenes 带 1 条已解锁场景 + 1 条未解锁场景 → 200 + 各自的 `unlocked`/`unlock_hint`
- POST /scenes/missing/enter → 404
- POST /scenes/{id}/enter 未解锁 → 403 + `error: scene_locked`
- POST /scenes/{id}/enter 已解锁、空 companions → 200 + `companions_present: [], event: null`

测试用 in-memory mock D1（参考现有 `auth.test.ts` 的 mock 风格）。

---

## 实施步骤

1. 创建分支 `feature/spec-007-scenes`
2. 写 `scenes/unlock.ts`（纯函数 + 一个 D1 查询）
3. 写 `scenes/index.ts`（路由 + DB 访问）
4. 写 `scenes/index.test.ts`
5. 更新 `index.ts` 路由（移除 retired 标记，加 dispatch）
6. 跑 `pnpm typecheck` + `pnpm test`
7. 跑 `pnpm dev`，curl 验证 happy path（手动插一条 scene 记录测）
8. PR + merge

---

## 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（新增 6+ 测试）
- [ ] `curl http://localhost:8787/scenes`（无 token）→ 401
- [ ] dev-session 拿 token 后 `curl -H "Authorization: Bearer ..." http://localhost:8787/scenes` → 200 + `{ scenes: [] }`
- [ ] 手插 1 条 scene 记录，curl 列表 → 看到该场景，unlocked=true
- [ ] `curl -X POST http://localhost:8787/scenes/{id}/enter` → 200 + scene 详情

---

## 回滚

- git revert
- 不动 D1 schema，安全

---

## 依赖

- ⬅️ 阻塞于：spec-003
- ➡️ 阻塞：spec-008（事件触发用 scenes 表）、spec-012（前端主界面）

---

## 注意

- 端点仅读，无写，零副作用 —— 是个相对小的 spec
- `unlock_condition` 的 schema 在本 spec 中先支持 `min_relationship` 一种类型；其它类型（时间触发、累积事件触发）由 spec-008 扩展时再加
- 不要在本 spec 里塞 v1 的 10 个场景 seed —— 那是 spec-013 的工作
