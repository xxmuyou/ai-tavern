# spec-008: events 模块（触发器 + 生成器 + 选项 resolve）

> **类型：** 新建  |  **依赖：** spec-003, spec-004, spec-005, spec-006, spec-007  |  **估时：** 3-5 天  |  **状态：** 🟢 done

---

## Context

v1 玩法里"事件系统"是除自由对话外的另一种节奏机制（[`product/gameplay.md §5`](../product/gameplay.md#5-事件系统)）：玩家进场景或聊天后，可能弹出一个"角色邀请你周末去公园"之类的有选项的小情节。这是 RPG 化的核心抓手，没它整个产品就只是"AI 聊天 + 进度条"。

`/events/*` 当前在 `RETIRED_PREFIXES`（410 Gone）。`POST /scenes/{id}/enter` 响应已经预留了 `event: null` 字段（spec-007），等本 spec 把它填上。

本 spec 也修正 `events` 基础 schema 的几个 v1 必需点：

- chat 触发的 conflict 不一定有 `scene_id`，所以 `events.scene_id` 需要允许 `NULL`
- pending 事件必须按用户和 companion 去重，否则玩家可能堆多个未处理事件
- 事件 resolve 必须使用创建时的 template snapshot，不能依赖后续可能被 admin 改过的模板
- 场景事件必须遵守 `scenes.possible_events`，不能所有场景都触发所有事件

---

## 目标

- 实现 `packages/api/src/events/` 模块，落地两条端点（[`api.md §6`](../architecture/api.md#6-events-端点)）：
  - `GET /events?status=pending`
  - `POST /events/{event_id}/resolve`
- 调整 `events` 表，使 chat conflict 可在无 scene 上下文时创建事件，并持久化 template snapshot
- 新增 `event_templates` 表，支持 admin 后续调概率、冷却、阈值、选项语义而无需 deploy
- 5 种事件类型全部跑通：**invitation / conflict / gift / confession / milestone**
- `daily_encounter` 不入 `events`，作为 `scenes/enter` 响应里 `companions_present[*].opener` 的 deterministic 文案
- 触发器分两处接入：
  - `scenes/enter` 触发**机会型**（invitation / gift / confession / milestone）
  - `chat/messages` 在 `applySignals` 成功后触发**反应型**（conflict）
- 同步生成 event payload：`scenes/enter` 命中事件时直接返回完整事件；chat conflict 在 SSE `done` 后后台创建 pending 事件
- signals 预写在 template snapshot 的 `options[*].signals`，LLM 只生成场景化文字和选项 label
- 同场景多角色按优先级**最多 1 个事件**
- 每个 `(user, companion)` 同一时间最多 1 个 pending 事件
- 一次性事件（confession / milestone subtype）pending 或 resolved 后都不得重复触发
- 测试：约 30 个新增或扩展单测

## 非目标

- ❌ 队列消费者或异步 event payload 生成服务
- ❌ 单独的 `event_cooldowns` 或 `companion_openers` 表（用现有 `events` 表 + 代码常量）
- ❌ Multiplayer / 共享事件（v1 全部按 `user_id` 隔离）
- ❌ 玩家自定义事件类型（v1.x）
- ❌ 事件链 / 事件序列（confession 之后自动 unlock "first date" 事件等）
- ❌ admin 写 event template 的 HTTP 端点（spec-011）
- ❌ spec-013 的内容性 seed（本 spec 只写最小默认 seed，让管线跑通）

---

## 改动清单

### A. 新建 migration `0003_events_adjustments.sql`

当前 `0001_v1_baseline.sql` 已有 `events` 表，但 `scene_id` 是 `NOT NULL`，且没有 template snapshot。因为 local / dev 接受清库重建，本 migration 可以用 SQLite/D1 的 copy-table 模式调整表结构。

目标 schema：

```sql
CREATE TABLE events_new (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  scene_id           TEXT REFERENCES scenes(id),
  event_type         TEXT NOT NULL,
  template_id        TEXT,
  template_snapshot  TEXT NOT NULL,
  payload            TEXT,
  metadata           TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  resolution         TEXT,
  created_at         INTEGER NOT NULL,
  resolved_at        INTEGER
);

INSERT INTO events_new (
  id, user_id, companion_id, scene_id, event_type,
  template_id, template_snapshot, payload, metadata,
  status, resolution, created_at, resolved_at
)
SELECT
  id, user_id, companion_id, scene_id, event_type,
  NULL,
  '{"version":1,"options":[]}',
  payload,
  NULL,
  status, resolution, created_at, resolved_at
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_user_companion ON events(user_id, companion_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_user_status_created ON events(user_id, status, created_at);
CREATE INDEX idx_events_pending_companion ON events(user_id, companion_id, status);
```

**字段语义：**

- `scene_id`: nullable。`scenes/enter` 事件必须写当前 scene；chat conflict 有 `scene_id` 时写入，没有则 `NULL`
- `template_id`: 创建事件时使用的 `event_templates.id`
- `template_snapshot`: 创建事件时冻结的 template 子集，resolve 必须读它，不得重查当前 template
- `metadata`: 事件内部元信息，例如 milestone subtype

`template_snapshot` v1 结构：

```json
{
  "version": 1,
  "template_id": "tpl_invitation_default",
  "event_type": "invitation",
  "companion_filter": "all",
  "options": [
    {
      "id": "accept_eager",
      "semantic": "warm acceptance",
      "prompt_hint": "enthusiastic yes",
      "signals": { "closeness": 2, "romance": 2, "friendship": 1, "trust": 1 }
    }
  ]
}
```

### B. 新建 migration `0004_event_templates.sql`

```sql
CREATE TABLE event_templates (
  id                  TEXT PRIMARY KEY,
  event_type          TEXT NOT NULL,                 -- invitation | conflict | gift | confession | milestone
  companion_filter    TEXT NOT NULL DEFAULT 'all',   -- all 或具体 companion_id
  trigger_probability REAL NOT NULL,                 -- 0..1
  cooldown_seconds    INTEGER NOT NULL,              -- -1 = lifetime
  priority            INTEGER NOT NULL DEFAULT 0,

  min_closeness       INTEGER,
  min_trust           INTEGER,
  min_romance         INTEGER,
  min_friendship      INTEGER,

  max_hostility       INTEGER,
  max_tension         INTEGER,
  max_distance        INTEGER,

  signal_trigger      TEXT,                          -- conflict 专用，如 hostility:2
  options_json        TEXT NOT NULL,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,

  UNIQUE(event_type, companion_filter)
);

CREATE INDEX idx_event_templates_active ON event_templates(is_active, event_type);
CREATE INDEX idx_event_templates_filter ON event_templates(companion_filter, is_active);
```

**template 选择语义：**

1. 评估某角色的某事件类型时，先查 `(event_type = X AND companion_filter = companion_id AND is_active = 1)`
2. 没有 per-companion 行时，查 `(event_type = X AND companion_filter = 'all' AND is_active = 1)`
3. 两者都没有则该事件类型对该角色不可触发
4. `UNIQUE(event_type, companion_filter)` 保证选择结果确定；v1 不做多模板 AB 测试

**场景限制：**

- 不在 `event_templates` 增加 `allowed_scene_tags`
- 统一使用已有 `scenes.possible_events` 过滤
- `daily_encounter` 只用于 opener，不参与 event template 查询

### C. 新建 migration `0005_event_templates_seed.sql`

5 行 `companion_filter='all'`：

| id | event_type | probability | cooldown_seconds | priority | 条件 | signal_trigger | 选项数 |
|---|---|---:|---:|---:|---|---|---:|
| `tpl_invitation_default` | invitation | 0.20 | 259200 | 30 | closeness≥30, trust≥25, max_hostility=30 | NULL | 4 |
| `tpl_conflict_default` | conflict | 1.0 | 172800 | 80 | 无 relationship 阈值 | hostility:2 | 3 |
| `tpl_gift_default` | gift | 0.10 | 604800 | 20 | closeness≥40, max_hostility=40 | NULL | 3 |
| `tpl_confession_default` | confession | 0.50 | -1 | 90 | romance≥65, trust≥45 | NULL | 4 |
| `tpl_milestone_default` | milestone | 1.0 | -1 | 70 | 外部 subtype 命中 | NULL | 2 |

优先级：**confession(90) > conflict(80) > milestone(70) > invitation(30) > gift(20)**。

`options_json` 默认内容见附录 G。

### D. 新建 `packages/api/src/events/types.ts`

```typescript
export type EventType = "invitation" | "conflict" | "gift" | "confession" | "milestone";

export type EventTemplate = {
  id: string;
  event_type: EventType;
  companion_filter: string;
  trigger_probability: number;
  cooldown_seconds: number;
  priority: number;
  min_closeness: number | null;
  min_trust: number | null;
  min_romance: number | null;
  min_friendship: number | null;
  max_hostility: number | null;
  max_tension: number | null;
  max_distance: number | null;
  signal_trigger: string | null;
  options: EventTemplateOption[];
};

export type EventTemplateOption = {
  id: string;
  semantic: string;
  prompt_hint: string;
  signals: Partial<DimensionValues>;
};

export type EventTemplateSnapshot = {
  version: 1;
  template_id: string;
  event_type: EventType;
  companion_filter: string;
  options: EventTemplateOption[];
};

export type TriggerCandidate = {
  template: EventTemplate;
  snapshot: EventTemplateSnapshot;
  companionId: string;
  sceneId: string | null;
  metadata: Record<string, unknown> | null;
};
```

### E. 新建 `packages/api/src/events/engine.ts`

```typescript
export type SceneForEventTrigger = {
  id: string;
  name: string;
  mood: string;
  possible_events: string | null;
};

export async function evaluateTriggersForScene(
  env: Env,
  userId: string,
  scene: SceneForEventTrigger,
  companions: Array<{ id: string }>,
  now: number,
): Promise<TriggerCandidate | null>;

export async function evaluateConflictTrigger(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string | null,
  signalsDelta: Partial<DimensionValues>,
  now: number,
): Promise<TriggerCandidate | null>;
```

**`evaluateTriggersForScene` 算法：**

1. 解析 `scene.possible_events`，只保留 `invitation/gift/confession/milestone`，排除 `daily_encounter`、`conflict` 和未知值
2. 对 `companions_present` 里的每个 companion 评估，不跨场景召唤不在场角色
3. 若该 `(user, companion)` 已存在任意 `status='pending'` event，跳过该 companion
4. 加载 relationship；没有 relationship 则按全 0 维度处理，并不自动创建 relationship
5. 对每个允许的 event type 加载 template（per-companion 优先，`all` fallback）
6. 检查冷却：
   - 普通 cooldown：查同 `(user, companion, event_type)` 最新 `created_at`，若 `now - latest < cooldown_seconds * 1000` 跳过
   - lifetime：若同 `(user, companion, event_type)` 已有 `status IN ('pending', 'resolved')`，跳过
7. 检查阈值：所有 `min_*` 必须满足，所有 `max_*` 命中则抑制
8. milestone 特判：只在 `event_type='milestone'` 时检查 subtype，详见 §I
9. 概率掷骰：`Math.random() < trigger_probability`
10. 通过者加入 candidates；按 `priority DESC`、`created candidate order ASC` 排序，返回第一个；空则 `null`

**`evaluateConflictTrigger` 算法：**

1. 只加载 `event_type='conflict'` template
2. 若该 `(user, companion)` 已存在任意 pending event，跳过
3. 解析 `signal_trigger`，v1 支持 `dimension:threshold`，如 `hostility:2`
4. 本次 `signalsDelta[dimension] >= threshold` 才命中
5. 普通 cooldown 按同 `(user, companion, event_type)` 最新事件检查
6. 命中后返回 candidate，`sceneId` 使用当前 chat request 的 `scene_id` 或 `null`

### F. 新建 `packages/api/src/events/generator.ts`

```typescript
export async function generateEventPayload(
  env: Env,
  args: {
    userId: string;
    companion: CompanionForPrompt;
    scene: SceneForPrompt | null;
    narrative: string;
    template: EventTemplate;
    metadata: Record<string, unknown> | null;
  },
): Promise<{
  description: string;
  options: Array<{ id: string; label: string }>;
}>;

export async function generateResolutionDescription(
  env: Env,
  args: {
    companion: CompanionForPrompt;
    eventPayload: EventPayload;
    chosenOption: { id: string; label: string };
    signals: Partial<DimensionValues>;
  },
): Promise<string>;
```

`generateEventPayload` 调 `llmCall(env, { task: 'character-assist', json_schema, ... })`。

Prompt 要点：

- 包含 companion `personality` 和 `speech_style`
- scene 为非 null 时注入 `scene.name` / `scene.mood`
- scene 为 null 时写明 "No specific scene context is available"，不得访问 `scene.name`
- 注入 relationship narrative
- 注入 required options，顺序来自 `template.options`
- 对 milestone 注入 `metadata.milestone_type`

输出 JSON：

```json
{
  "description": "<2-3 sentences in third-person from a neutral narrator>",
  "options": [
    { "id": "<option id>", "label": "<short first-person response from user's POV, 3-10 words>" }
  ]
}
```

**LLM 结果校验：**

- 必须包含所有 template option id
- 返回乱序时按 template option 顺序重排
- 缺失、重复或未知 id 时，用 deterministic fallback 生成整组 options
- fallback label 使用 `prompt_hint`，并做首字母大写

**resolution description 失败策略：**

- resolve 已经应用 signals 后，LLM 失败不得让事件卡在 pending
- fallback：`You chose "{option.label}". {companion.name} takes a moment to respond.`

### G. 新建 `packages/api/src/events/repository.ts`

封装事件创建和查询，避免 `scenes` / `chat` 直接拼 SQL。

```typescript
export async function createPendingEvent(
  env: Env,
  args: {
    userId: string;
    companionId: string;
    sceneId: string | null;
    eventType: EventType;
    template: EventTemplate;
    snapshot: EventTemplateSnapshot;
    payload: EventPayload;
    metadata: Record<string, unknown> | null;
    now: number;
  },
): Promise<EventResponseItem>;
```

写库字段：

- `id = crypto.randomUUID()`
- `template_id = template.id`
- `template_snapshot = JSON.stringify(snapshot)`
- `payload = JSON.stringify(payload)`
- `metadata = metadata ? JSON.stringify(metadata) : null`
- `status = 'pending'`

`EventResponseItem` 必须对齐 `architecture/api.md §6`：

```json
{
  "id": "...",
  "companion_id": "...",
  "scene_id": null,
  "event_type": "conflict",
  "payload": { "description": "...", "options": [] },
  "created_at": 1740000000000
}
```

### H. 新建 `packages/api/src/events/list.ts` / `resolve.ts`

**`GET /events?status=pending&limit=20&before_id=...`：**

- `status` default: `pending`
- v1 允许 `pending/resolved/dismissed`，未知 status 返回 400
- `limit` default 20，最大 50
- 按 `user_id + status` 过滤，`created_at DESC`
- `before_id` 查询该事件的 `created_at` 后做 cursor，找不到返回 400
- payload JSON parse 失败时返回 `{ description: "", options: [] }` 并保留事件行

**`POST /events/{event_id}/resolve`：**

1. 加载 event；不存在 404，`user_id` 不匹配 403，`status !== 'pending'` 返回 409
2. 解析请求 body `{ "option_id": "..." }`
3. 解析 `event.payload` 找 option label；找不到 400
4. 解析 `event.template_snapshot` 找 option signals；找不到 400
5. `oldState = await loadRelationship(...)`
6. `newState = await applySignals(env, user.id, event.companion_id, signals, now)`
7. 调 `generateResolutionDescription`；失败用 deterministic fallback
8. `UPDATE events SET status='resolved', resolution=?, resolved_at=?`
9. 返回：

```json
{
  "result": {
    "description": "...",
    "signals": { "closeness": 2, "romance": 2 }
  },
  "level_changed": null
}
```

`level_changed` 规则：

- `oldLevel = oldState?.level ?? "Stranger"`
- `newLevel = newState.level`
- 相同返回 `null`，不同返回 `newLevel`

`resolution` JSON：

```json
{
  "option_id": "accept_eager",
  "option_label": "Sure, I'd love to",
  "signals_applied": { "closeness": 2 },
  "result_description": "..."
}
```

### I. milestone 特殊逻辑

v1 milestone 只对当前 `scenes/enter` 返回的 `companions_present` 评估，不对不在场 companion 触发。

候选 subtype：

- `first_30_days`: `relationship.first_met_at` 存在，且 `now - first_met_at >= 30 * 86400 * 1000`
- `chat_100`: 该 `(user, companion)` 的 `threads.message_count >= 100`

去重：

- 对每个 subtype 查 `events` 表中同 `(user_id, companion_id, event_type='milestone')` 且 `status IN ('pending', 'resolved')` 的事件
- 解析 `metadata.milestone_type`
- 同 subtype 已存在则跳过

命中策略：

1. 先检查 `first_30_days`
2. 再检查 `chat_100`
3. 同一 companion 同次评估最多返回一个 milestone subtype
4. metadata 写入 `{ "milestone_type": "first_30_days" }` 或 `{ "milestone_type": "chat_100" }`

### J. 新建 `packages/api/src/events/openers.ts`

opener 不写入 `events` 表，但由 events 模块提供给 `scenes/enter`。

```typescript
export function pickOpener(args: {
  userId: string;
  companionId: string;
  sceneId: string;
  companionName: string;
  sceneName: string;
  now: number;
}): string;
```

实现：

- 代码内常量 `GENERIC_OPENERS`，至少 20 条模板
- 模板支持 `{name}` / `{scene}` 占位
- 选择算法：`hash(userId, companionId, sceneId, floor(now / 86400000)) % GENERIC_OPENERS.length`
- 同一用户、同一角色、同一场景、同一天稳定；第二天可能变化

内容范例：

- `{name} is reading by the window, glancing up as you arrive.`
- `{name} is checking something on their phone near the entrance of {scene}.`
- `{name} looks lost in thought, then notices you and smiles.`

### K. 新建 `packages/api/src/events/index.ts`

```typescript
export async function handleEventsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null>;
```

匹配：

- `GET /events` -> list
- `POST /events/{id}/resolve` -> resolve
- 其他 `/events/...` -> `null`

所有端点使用 `requireAuthUser`。

### L. 改 `packages/api/src/scenes/index.ts`

`POST /scenes/{id}/enter` 增量：

1. 加载 scene 时额外读 `possible_events`
2. 加载 `companions_present`
3. 对每个 companion 填 `opener: pickOpener(...)`
4. 调 `evaluateTriggersForScene(env, user.id, scene, companions, now)`
5. 命中 candidate：
   - 加载 companion prompt 信息
   - 构造 relationship narrative
   - `generateEventPayload`
   - `createPendingEvent`
   - 响应中的 `event` 使用 repository 返回值
6. 未命中：`event: null`

响应形状：

```json
{
  "scene": { "id": "...", "name": "...", "mood": "...", "tags": [], "art_url": null },
  "companions_present": [
    { "id": "maya", "name": "Maya", "opener": "Maya looks up as you arrive." }
  ],
  "event": null
}
```

命中事件时：

```json
{
  "event": {
    "id": "...",
    "companion_id": "maya",
    "scene_id": "pier_coffee_shop",
    "event_type": "invitation",
    "payload": { "description": "...", "options": [] },
    "created_at": 1740000000000
  }
}
```

### M. 改 `packages/api/src/chat/messages.ts`

在 `runChat` 中，signal extraction 成功且 `applySignals` 成功后记录一个后台任务：

```typescript
ctx.waitUntil(
  maybeCreateConflictEvent({
    env,
    userId: user.id,
    companionId,
    sceneId: scene_id,
    signalsDelta: extract.signals,
    narrative,
    now,
  }),
);
```

行为要求：

- SSE 的 `signals` / `emotion` / `done` 不等待 conflict event 生成
- conflict event 不出现在当前 SSE 流里
- 前端通过下一次 `GET /events?status=pending` 拿到
- `scene_id` 可为 `null`，插库必须成功
- conflict 创建失败只记录 warning/log，不影响 chat 回复成功

### N. 改 `packages/api/src/index.ts`

- 从 `RETIRED_PREFIXES` 删除 `"/events/"`
- import `handleEventsRequest`
- dispatch 顺序：auth / companions / scenes / chat / events / retired / legacy fallback

---

## 测试

### engine tests

- 按 `scene.possible_events` 过滤事件类型，scene 不允许 invitation 时不触发
- `daily_encounter` 被忽略，不查 template
- companion 已有任意 pending event 时不生成新事件
- 普通 cooldown 生效
- lifetime 事件 pending 或 resolved 后都不重复
- 阈值过滤和 max 抑制条件生效
- priority 排序只在通过所有过滤后的 candidates 中进行
- 多 companion 同时满足时只返回 1 个最高优先级 candidate
- milestone `first_30_days` subtype 命中和去重
- milestone `chat_100` subtype 命中和去重
- conflict `hostility:2` 命中，`hostility:1` 不命中
- conflict 在 cooldown 内不命中

### generator tests

- scene 为 null 时 prompt 不访问 `scene.name`
- LLM 返回完整 options 时按 template 顺序输出
- LLM 返回乱序 options 时重排
- LLM 返回缺失、重复或未知 id 时使用 fallback
- fallback label 来自 `prompt_hint`
- 创建事件时写入 `template_snapshot`，snapshot 包含 options/signals

### list / resolve tests

- list 按 `user_id + status` 过滤
- list `limit` default / clamp 生效
- list `before_id` cursor 生效
- resolve 404 / 403 / 409 / invalid body / unknown option
- template 后续被改，resolve 仍按 `template_snapshot` signals 生效
- resolve 前后 level 变化正确返回 `level_changed`
- resolution description LLM 失败时仍 resolve 成功并返回 fallback
- resolution JSON 写入 option id、label、signals、result description

### integration tests

- `POST /scenes/{id}/enter` 低关系返回 `event:null`，且 companion 有 opener
- `POST /scenes/{id}/enter` 命中 invitation 时响应 event 字段对齐 `api.md`
- `POST /scenes/{id}/enter` 中 scene 不允许某事件时，即使关系满足也不触发
- 同场景两角色都满足时只弹 1 个事件
- `POST /chat/{cid}/messages` hostility +2 后后台创建 pending conflict
- `POST /chat/{cid}/messages` 无 `scene_id` 时 conflict 仍可插入，`events.scene_id = NULL`
- `GET /events?status=pending` 能读到 chat conflict

---

## 实施步骤

1. 写 migration `0003_events_adjustments.sql`
2. 写 migration `0004_event_templates.sql`
3. 写 migration `0005_event_templates_seed.sql`
4. 新建 `events/types.ts`、`events/repository.ts`
5. 新建 `events/engine.ts` + engine tests
6. 新建 `events/generator.ts` + generator tests
7. 新建 `events/openers.ts` + opener tests
8. 新建 `events/list.ts`、`events/resolve.ts` + endpoint tests
9. 新建 `events/index.ts`
10. 改 `scenes/index.ts` 接入 opener、trigger、event creation
11. 改 `chat/messages.ts` 接入 conflict background creation
12. 改主 `index.ts` 删除 events retired prefix 并接入 dispatch
13. 跑 `pnpm --filter @xtbit/api typecheck`
14. 跑 `pnpm --filter @xtbit/api test`
15. 跑本地 D1 migration + curl 验证

---

## 验证

**自动化：**

- [ ] `pnpm --filter @xtbit/api typecheck` 0 错
- [ ] `pnpm --filter @xtbit/api test` 全绿

**手动 dev：**

- [ ] `POST /scenes/{id}/enter` 在关系数值低时 -> `event: null`、companion 有 opener
- [ ] scene 的 `possible_events` 不含 invitation 时，即使 closeness/trust 达标也不触发 invitation
- [ ] scene 的 `possible_events` 含 invitation，且 relationship 达标时 -> event 有 4 个 options
- [ ] `POST /events/{id}/resolve` 选 `accept_eager` -> relationship 数值上涨，event 变 resolved
- [ ] 修改 template seed 后 resolve 旧 pending event -> 仍使用旧 snapshot signals
- [ ] 同角色已有 pending event 时，再 enter 不生成新事件
- [ ] 同角色 3 天内不再触发 invitation
- [ ] confession pending 或 resolved 后再 enter 永不重复
- [ ] `POST /chat/{cid}/messages` 说狠话致 hostility +2 -> SSE done 后 `GET /events?status=pending` 看到 conflict
- [ ] chat request 不传 `scene_id` 时 conflict 事件 `scene_id` 为 null 且可 resolve
- [ ] milestone `first_30_days` 和 `chat_100` 各自最多触发一次

---

## 回滚

- `git revert` spec-008 implementation commit
- local / dev D1 可 wipe 重建
- 若要手动回滚 migration：
  ```sql
  DROP TABLE event_templates;
  -- local/dev only: rebuild events from 0001_v1_baseline.sql if needed
  ```
- `/events/*` 回到 410 Gone：把 `"/events/"` 加回 `RETIRED_PREFIXES`
- 移除 scenes/enter 和 chat/messages 的 events 接入点

---

## 依赖

- ⬅️ 阻塞于：spec-003（baseline schema）、spec-004（companion prompt 字段）、spec-005（relationship engine）、spec-006（chat signal extraction）、spec-007（scenes/enter）
- ➡️ 阻塞：spec-012（Expo UI 渲染事件弹窗）、spec-013（内容 seed + per-companion opener/template 内容）

---

## 注意

- **`events.scene_id` nullable 是 v1 必需修正**：chat API 当前允许不传 `scene_id`，conflict 不能因此插库失败
- **resolve 只读 snapshot**：当前 template 只影响新事件，不能改变旧 pending 事件的选项后果
- **pending 去重优先于概率**：已有 pending event 时不要掷骰，不要生成新 payload
- **`scenes.possible_events` 是硬约束**：内容表不允许的事件类型不得触发
- **同步 LLM 对 `scenes/enter` 延迟敏感**：命中事件时可能 2-3s；未命中应保持轻量
- **chat conflict 不阻塞 SSE**：生成失败只影响 pending event，不影响玩家收到聊天回复
- **概率掷骰用 `Math.random()`**：事件触发不要求安全随机
- **signals clamp**：所有 signals 走 `applySignals` 的 ±5 和 0..100 clamp
- **opener 池规模**：v1 通用池至少 20 条；spec-013 再补 per-companion 专属池

---

## 附录 G：options_json 默认内容（v1 seed）

### invitation（4 options）

```json
[
  {"id":"accept_eager","semantic":"warm acceptance","prompt_hint":"enthusiastic yes","signals":{"closeness":2,"romance":2,"friendship":1,"trust":1}},
  {"id":"accept_casual","semantic":"polite acceptance","prompt_hint":"low-key yes","signals":{"closeness":1,"friendship":1}},
  {"id":"decline_busy","semantic":"polite decline with reason","prompt_hint":"warm no","signals":{"friendship":1,"distance":1}},
  {"id":"decline_cold","semantic":"cold refusal","prompt_hint":"flat no","signals":{"hostility":1,"distance":2,"tension":1}}
]
```

### conflict（3 options）

```json
[
  {"id":"apologize","semantic":"apologize sincerely","prompt_hint":"genuine apology","signals":{"hostility":-2,"tension":-1,"trust":1}},
  {"id":"explain","semantic":"explain calmly","prompt_hint":"defensive but civil","signals":{"hostility":-1,"distance":1}},
  {"id":"escalate","semantic":"push back","prompt_hint":"escalate","signals":{"hostility":2,"tension":2,"trust":-1}}
]
```

### gift（3 options）

```json
[
  {"id":"accept_grateful","semantic":"grateful acceptance","prompt_hint":"warm thanks","signals":{"closeness":1,"friendship":1,"trust":1}},
  {"id":"accept_awkward","semantic":"awkward acceptance","prompt_hint":"shy thanks","signals":{"closeness":1,"tension":1}},
  {"id":"decline","semantic":"polite decline","prompt_hint":"warm no","signals":{"distance":1}}
]
```

### confession（4 options）

```json
[
  {"id":"reciprocate","semantic":"reciprocate love","prompt_hint":"heartfelt yes","signals":{"romance":3,"closeness":2,"trust":2,"friendship":1}},
  {"id":"need_time","semantic":"ask for time","prompt_hint":"warm but unsure","signals":{"romance":1,"tension":2,"trust":1}},
  {"id":"reject_gently","semantic":"gentle rejection","prompt_hint":"kind no","signals":{"romance":-2,"distance":2,"tension":1,"friendship":1}},
  {"id":"reject_firm","semantic":"firm rejection","prompt_hint":"hard no","signals":{"romance":-3,"distance":3,"hostility":1}}
]
```

### milestone（2 options）

```json
[
  {"id":"reflect_fondly","semantic":"acknowledge fondly","prompt_hint":"warm reflection","signals":{"closeness":1,"friendship":1}},
  {"id":"reflect_neutrally","semantic":"neutral nod","prompt_hint":"polite ack","signals":{}}
]
```
