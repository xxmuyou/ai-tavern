# spec-005: relationships 模块（7 维度引擎 + level 计算）

> **类型：** 新建  |  **依赖：** spec-003, spec-004  |  **估时：** 1-2 天  |  **状态：** ⚪ todo

---

## Context

v1 关系奇点系统是 4 正向 + 3 负向 = 7 个数值维度（[`product/gameplay.md §6`](../product/gameplay.md#6-关系奇点系统)）。当前数据库已经把 `relationships` 表建好（spec-003），但没有代码：
- 创建关系记录
- 把对话生成的 signal 写入数值
- 计算关系等级 `level_label`
- 暴露关系状态查询端点

本 spec 把关系数值的**写入引擎**与**读取端点**全部落地，作为内部库供 spec-006（chat）调用，作为 HTTP 端点供前端展示进度条。

---

## 目标

- 实现 `packages/api/src/relationships/` 模块
- **引擎层（无 HTTP，给其他 spec 调）：**
  - `computeLevel(dims): string` —— 纯函数，按 [`gameplay.md §6.1`](../product/gameplay.md#61-维度设计v1) 规则把 7 维度映射到等级标签
  - `ensureRelationship(env, userId, companionId, now): Promise<void>` —— `INSERT OR IGNORE` 一条全 0 + first_met_at 行
  - `applySignals(env, userId, companionId, signals, now): Promise<RelationshipState>` —— 内部使用：clamp signals (-5 ~ +5 per dim)，加到现有数值上，clamp 0-100，重算 level_label，UPSERT 写回
- **HTTP 层：**
  - `GET /relationships/{companion_id}` —— 按 [`api.md §7`](../architecture/api.md#7-relationships-端点只读)：返回 dimensions + level + first_met_at + last_interaction_at + milestones
- **小修：** spec-004 的 `GET /companions/{id}` 在没有 relationships 行时返回 `level: "Stranger"` 而非 `null`，与新的 level 计算函数保持一致
- 单元测试：computeLevel 等级表 + applySignals clamp + GET 端点 happy path

## 非目标

- ❌ Milestone 历史（除 `first_met`）—— level 变化跟踪等 spec-008 接事件系统时补
- ❌ 时间衰减 —— v1 不做（gameplay.md §6.3）
- ❌ 把 applySignals 接到任何 HTTP 端点 —— spec-006（chat）会接

---

## 改动清单

### A. 新建 `packages/api/src/relationships/level.ts`

纯函数 + 等级规则。

```typescript
export const ALL_DIMENSIONS = [
  'closeness', 'trust', 'romance', 'friendship',
  'hostility', 'tension', 'distance',
] as const;
export type Dimension = typeof ALL_DIMENSIONS[number];
export type DimensionValues = Record<Dimension, number>;
export const ZERO_DIMENSIONS: DimensionValues = { ... };

export type RelationshipLevel =
  | 'Stranger'
  | 'Acquaintance'
  | 'Friend'
  | 'Close Friend'
  | 'Romantic Interest'
  | 'Lover'
  | 'Strained'
  | 'Estranged'
  | 'Hostile';

export function computeLevel(dims: DimensionValues): RelationshipLevel;
```

判定顺序（负向优先于正向，匹配 gameplay.md §6.1 末段"负向等级优先级高于正向"）：

1. `Hostile` if `hostility > 50`
2. `Estranged` if `distance > 60`
3. `Strained` if `tension > 50`
4. `Lover` if `romance > 70 && trust > 50`
5. `Romantic Interest` if `romance > 30`
6. `Close Friend` if `closeness > 60 && friendship > 50 && trust > 40`
7. `Friend` if `closeness > 40 && friendship > 30`
8. `Acquaintance` if `closeness > 20`
9. `Stranger`（默认）

### B. 新建 `packages/api/src/relationships/engine.ts`

`ensureRelationship` + `applySignals` + `loadRelationship`。

```typescript
type Signals = Partial<DimensionValues>;
type RelationshipState = {
  dimensions: DimensionValues;
  level: RelationshipLevel;
  first_met_at: number;
  last_interaction_at: number;
};

export async function ensureRelationship(
  env: Env, userId: string, companionId: string, now: number,
): Promise<void>;
export async function loadRelationship(
  env: Env, userId: string, companionId: string,
): Promise<RelationshipState | null>;
export async function applySignals(
  env: Env, userId: string, companionId: string, signals: Signals, now: number,
): Promise<RelationshipState>;
```

**applySignals 行为：**
1. `ensureRelationship` 先确保行存在（first_met_at = now if new）
2. SELECT 当前维度
3. 对每个传入 signal：`clamp(signal, -5, +5)` 然后加到对应维度
4. 每个维度 `clamp(0, 100)`
5. `computeLevel(newDims)`
6. UPDATE `relationships` SET (所有维度 + level_label + last_interaction_at) WHERE PK
7. 返回新状态

### C. 新建 `packages/api/src/relationships/index.ts`

`handleRelationshipsRequest(request, env, pathname)`：

- `GET /relationships/{companion_id}` → load relationship + companion，返回：
  ```json
  {
    "companion_id": "...",
    "level": "Stranger" | "Friend" | ...,
    "dimensions": { 7 dims },
    "first_met_at": null | number,
    "last_interaction_at": null | number,
    "milestones": [
      { "type": "first_met", "at": <first_met_at> }
    ] | []
  }
  ```
- 404 if companion 不存在 / 不可见（user 自创且非 owner）
- 用 `computeLevel` 而非 DB 的 `level_label` 兜底（防止 DB 中 level_label 与 dimensions 漂移）
- v1 milestones 只含 first_met（如果 first_met_at 存在）；level_up 等留给 spec-008

### D. 更新 `packages/api/src/index.ts`

- import `handleRelationshipsRequest`
- 加 dispatch 到 scenes/companions 之后

### E. 修 `packages/api/src/companions/index.ts`

把 `getCompanion` 里"无 relationship → level: null"改为 `computeLevel(ZERO_DIMENSIONS)` = `"Stranger"`，并用 `computeLevel(relationship.dims)` 替代直接读 `relationship.level_label`（保持单一真理源）。

### F. 测试

`packages/api/src/relationships/level.test.ts`：纯函数测试，覆盖 9 个等级的边界条件 + 负向覆盖正向规则。

`packages/api/src/relationships/engine.test.ts`：
- `ensureRelationship` 创建新行 + 二次调用幂等
- `applySignals` 把维度 clamp 到 0-100 上下边界
- `applySignals` clamp signal 自身在 ±5
- `applySignals` 自动建关系然后更新

`packages/api/src/relationships/index.test.ts`：
- GET /relationships/missing → 404
- GET /relationships/{id} 无关系记录 → level Stranger + zero dims + 空 milestones
- GET /relationships/{id} 有关系记录 → 返回数值 + first_met milestone

---

## 实施步骤

1. 写 `relationships/level.ts` + 单测
2. 写 `relationships/engine.ts` + 单测
3. 写 `relationships/index.ts` + 端点测试
4. 改 `companions/index.ts` 用 `computeLevel` 替代 `level_label` 读取
5. 改 `index.ts` 加 dispatch
6. 跑 `pnpm typecheck && pnpm test`
7. `pnpm dev` + curl 验证

---

## 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（新增 ~12 测试，预期 40+/40+）
- [ ] dev: GET /relationships/{nonexistent} → 404
- [ ] dev: GET /relationships/{companion} 无 relationship → 200 + `level: "Stranger"` + zeros
- [ ] dev: GET /companions/{id} 无 relationship → `level: "Stranger"`（之前是 null）

---

## 回滚

- git revert
- 不动 D1 schema，安全

---

## 依赖

- ⬅️ 阻塞于：spec-003, spec-004（companions GET endpoint refactor 是 spec-004 的延续）
- ➡️ 阻塞：spec-006（chat 调 applySignals）、spec-008（events 触发 milestone）

---

## 注意

- signal 的 clamp ±5 是防御 LLM 偶发 +20 之类 prompt injection 的护栏
- 不要把 applySignals 直接暴露成 HTTP 端点 —— 它只能被服务端（chat handler）内部调用
- `relationships.level_label` 列保留（spec-003 schema 设计），但**真理源**是即时计算的 `computeLevel`；DB 中的 level_label 由 applySignals 写入只作缓存 / 索引候选用途
