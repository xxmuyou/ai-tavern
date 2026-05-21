# spec-008: events 模块（触发器 + 生成器 + 选项 resolve）

> **类型：** 新建  |  **依赖：** spec-003, spec-004, spec-005, spec-006, spec-007  |  **估时：** 3-5 天  |  **状态：** ⚪ todo

---

## Context

v1 玩法里"事件系统"是除自由对话外的另一种节奏机制（[`product/gameplay.md §5`](../product/gameplay.md#5-事件系统)）：玩家进场景或聊天后，可能弹出一个"角色邀请你周末去公园"之类的有选项的小情节。这是 RPG 化的核心抓手，没它整个产品就只是"AI 聊天 + 进度条"。

`/events/*` 当前在 `RETIRED_PREFIXES`（410 Gone）。`POST /scenes/{id}/enter` 响应已经预留了 `event: null` 字段（spec-007），等本 spec 把它填上。

本 spec 落地：
- 触发器引擎（关系数值阈值 + 冷却时间 + 概率掷骰 + 优先级）
- 事件生成器（同步调 LLM 写出 description + 选项 label）
- `GET /events?status=pending` / `POST /events/{id}/resolve` 两个 HTTP 端点
- 把触发器接到 `scenes/enter`（机会型事件）和 `chat/messages`（反应型 conflict）

---

## 目标

- 实现 `packages/api/src/events/` 模块，落地两条端点（[`api.md §6`](../architecture/api.md#6-events-端点)）
- 新增 D1 表 `event_templates`（决策 6 = B），admin 可调概率/冷却/阈值/选项语义而无需 deploy
- 5 种事件类型全部跑通：**invitation / conflict / gift / confession / milestone**
- daily_encounter 不入 events，作为 `scenes/enter` 响应里 companion.opener 字段的预写文案
- 触发器分两处接入：
  - `scenes/enter` 触发**机会型**（invitation / gift / confession / milestone）
  - `chat/messages` 在 applySignals 之后触发**反应型**（conflict）
- 同步生成 payload（决策 2 = A），玩家进场景 / 聊天结束时直接拿到完整事件
- signals 预写在 `event_templates.options_json`（决策 3 = A），LLM 只生成场景化文字
- 同场景多角色按优先级**最多 1 个事件**（决策 5 = A）
- 一次性事件（confession / milestone）通过查 events 表 `status='resolved'` 去重，不另起 cooldown 表（决策 7）
- 测试：约 25 个新增单测

## 非目标

- ❌ 异步事件生成 / 队列消费者（决策 2 锁定同步）
- ❌ 单独的 `event_cooldowns` 或 `companion_openers` 表（用现有 events 表 + 代码常量）
- ❌ Multiplayer / 共享事件（v1 全部按 user_id 隔离）
- ❌ 玩家自定义事件类型（v1.x）
- ❌ 事件链 / 事件序列（confession 之后自动 unlock "first date" 事件等）—— v1.x
- ❌ spec-013 的具体 opener 文案内容 / event_templates 的内容性 seed（本 spec 只写最小默认 seed，让管线跑通）

---

## 改动清单

### A. 新建 migration `0003_event_templates.sql`

```sql
CREATE TABLE event_templates (
  id                  TEXT PRIMARY KEY,
  event_type          TEXT NOT NULL,           -- 'invitation' | 'conflict' | 'gift' | 'confession' | 'milestone'
  companion_filter    TEXT NOT NULL DEFAULT 'all',  -- 'all' 或具体 companion_id
  trigger_probability REAL NOT NULL,           -- 0..1
  cooldown_seconds    INTEGER NOT NULL,        -- -1 = lifetime（一次性，confession/milestone）
  priority            INTEGER NOT NULL DEFAULT 0,
  -- 触发阈值（NULL = 该维度不参与）
  min_closeness       INTEGER, min_trust       INTEGER,
  min_romance         INTEGER, min_friendship  INTEGER,
  -- 抑制阈值（NULL = 该维度不参与；命中即抑制）
  max_hostility       INTEGER, max_tension     INTEGER, max_distance INTEGER,
  -- conflict 专用：本次对话单次 signal 超过该值触发
  signal_trigger      TEXT,                    -- 'hostility:2' 或 'tension:2'；NULL = 不参与
  options_json        TEXT NOT NULL,           -- 见 §A.2
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_event_templates_active ON event_templates(is_active, event_type);
CREATE INDEX idx_event_templates_filter ON event_templates(companion_filter, is_active);
```

#### A.1 companion_filter 语义

评估某角色的触发器时：
1. 先查 `(event_type=X AND companion_filter=<companion_id> AND is_active=1)`
2. 没找到则查 `(event_type=X AND companion_filter='all' AND is_active=1)`
3. 都没找到 → 该事件类型对该角色未配置 → 跳过

v1 seed 只填 5 行 `companion_filter='all'`；spec-013 / 后续可加 per-companion 覆盖行。

#### A.2 `options_json` 结构

```json
[
  {
    "id": "accept_eager",
    "semantic": "warm acceptance",
    "prompt_hint": "enthusiastic yes",
    "signals": { "closeness": 2, "romance": 2, "friendship": 1, "trust": 1 }
  },
  {
    "id": "accept_casual",
    "semantic": "polite acceptance",
    "prompt_hint": "low-key yes",
    "signals": { "closeness": 1, "friendship": 1 }
  },
  ...
]
```

- `id` 稳定字符串，前端按此提交
- `semantic` 给 LLM 看的语义提示
- `prompt_hint` 给 LLM 看的"措辞方向"，让生成的 label 文字符合该选项的语气
- `signals` resolve 时直接应用（经 `applySignals` 的 clamp ±5）

### B. v1 seed migration `0004_event_templates_seed.sql`

5 行 `companion_filter='all'`：

| event_type | probability | cooldown_seconds | priority | min/max 条件 | signal_trigger | 选项数 |
|---|---|---|---|---|---|---|
| invitation | 0.20 | 259200 (3d) | 30 | closeness≥30, trust≥25; max_hostility=30 | NULL | 4 |
| conflict | 1.0 | 172800 (2d) | 80 | — | hostility:2 | 3 |
| gift | 0.10 | 604800 (7d) | 20 | closeness≥40; max_hostility=40 | NULL | 3 |
| confession | 0.50 | -1 | 90 | romance≥65, trust≥45 | NULL | 4 |
| milestone | 1.0 | -1 | 70 | —（外部命中条件由代码判定） | NULL | 2 |

优先级（数值越大越优先）：**confession(90) > conflict(80) > milestone(70) > invitation(30) > gift(20)**。

`options_json` 每个事件类型预先定义好语义标签（具体内容详见 spec doc 内附录 G）。

### C. 新建 `packages/api/src/events/engine.ts`

```typescript
export type TriggerCandidate = {
  template: EventTemplate;
  companionId: string;
};

export async function evaluateTriggersForScene(
  env: Env,
  userId: string,
  companions: Array<{ id: string }>,
  now: number,
): Promise<TriggerCandidate | null>;

export async function evaluateConflictTrigger(
  env: Env,
  userId: string,
  companionId: string,
  signalsDelta: DimensionValues,
  now: number,
): Promise<TriggerCandidate | null>;
```

**evaluateTriggersForScene 算法：**
1. 加载场景里每个 companion 的当前 relationship（loadRelationship）
2. 对每个 (companion, event_type ∈ {invitation, gift, confession, milestone}) 组合：
   a. 加载模板（per-companion 优先 → 'all' fallback）
   b. 检查冷却：查 `SELECT MAX(created_at) FROM events WHERE user_id=? AND companion_id=? AND event_type=?`
      - `cooldown_seconds = -1`：若有 `status='resolved'` 行则跳过（一次性）
      - 普通 cooldown：若 `now - latest < cooldown_seconds * 1000` 跳过
   c. 检查阈值：min_* 全部 ≤ dimensions[*]、max_* 全部 ≥ dimensions[*]
   d. milestone 特判：用聊天总数 / 认识天数判定，详见 §F
   e. 概率掷骰：`Math.random() < trigger_probability`
   f. 通过 → 加入 candidates
3. 按 priority DESC 排序，取第一个返回；空 → null

**evaluateConflictTrigger 算法：**
- 只处理 event_type='conflict'：检查 `signal_trigger='hostility:2'`，看本次 signalsDelta.hostility ≥ 2
- 同样查冷却（避免一次对话连发多个 conflict）
- 通过返回 candidate

### D. 新建 `packages/api/src/events/generator.ts`

```typescript
export async function generateEventPayload(
  env: Env,
  args: {
    userId: string;
    companion: CompanionForPrompt;
    scene: SceneForPrompt | null;
    narrative: string;
    template: EventTemplate;
  },
): Promise<{
  description: string;
  options: Array<{ id: string; label: string }>;
}>;
```

调 `llmCall(env, { task: 'character-assist', json_schema, ... })`：

**Prompt 模板：**
```
You are roleplaying as {companion.name}. Generate an event scene of type "{event_type}".

# Character
{companion.personality}
Speech style: {companion.speech_style}

# Scene
{scene.name}, {scene.mood}

# Relationship narrative
{narrative}

# Required options (in order)
{template.options[*].semantic} — hint: {prompt_hint}
...

Output JSON:
{
  "description": "<2-3 sentences in third-person describing what just happened, from a neutral narrator>",
  "options": [
    { "id": "<option id>", "label": "<short first-person response from the user's POV, 3-10 words>" },
    ...
  ]
}
```

**json_schema** 锁死 options 顺序和 id 集合（防止 LLM 漏 / 错 id）。失败兜底：用 `template.options[i].prompt_hint` 作为 label（保证可玩）。

`max_tokens: 400, temperature: 0.7`。

### E. 新建 `packages/api/src/events/resolve.ts` / `list.ts`

**`POST /events/{event_id}/resolve`：**
1. 加载 event（404 / 403 / 409 if not pending）
2. 解析 `payload.options` 找 `option_id`（400 if not found）
3. 加载 template（按 event_type + companion_filter / 'all'）取该 option 的预写 signals
4. `applySignals(env, user.id, event.companion_id, signals, now)` → 拿到 level 变化
5. UPDATE events SET status='resolved', resolution=JSON.stringify({option_id, signals_applied}), resolved_at=now
6. 调 `generateResolutionDescription`（一次额外 LLM 调用，生成 result.description，~150 tokens）
   - 也可以选择把 description 在 resolve 时不重新生成，直接拼"You chose {option.label}. {companion} {emotion}."
   - **决策**：生成（v1 体验优先）
7. 返回 `{ result: { description, signals }, level_changed: oldLevel === newLevel ? null : newLevel }`

**`GET /events?status=pending&limit=20`：**
- 按 user_id + status 过滤；分页 `?before_id`；返回 events.id / event_type / companion_id / scene_id / payload / created_at
- payload 已经是 JSON 字符串，直接 parse 返给前端

### F. milestone 触发的特殊逻辑

milestone 有两个候选触发条件，**代码内固化**（不在 template 阈值里）：
- "first_30_days"：`(now - relationship.first_met_at) > 30 * 86400 * 1000` 且未触发过
- "chat_100"：该 companion 的 thread.message_count > 100 且未触发过

milestone 模板的 options_json 只配通用 2 个："reflect_fondly"（+closeness +1）和 "reflect_neutrally"（无变化）。description 由 LLM 生成。

milestone 命中只在 `scenes/enter` 评估一次：进任何场景都可能弹（与 companion 在该场景在场无关）。

### G. 新建 `packages/api/src/events/openers.ts`

不入 events 系统，但属于 events 模块的责任 —— 给 `scenes/enter` 用。

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
- 代码内常量数组 `GENERIC_OPENERS`（约 20 条模板，用 `{name}` / `{scene}` 占位）
- 选择算法：`hash(userId, companionId, sceneId, floor(now / 24h))` → index → 同一用户在同一场景遇到同一角色"今天"句子稳定，明天换一句
- 内容范例：
  - "{name} is reading by the window, glancing up as you arrive."
  - "{name} is mid-conversation with someone on the phone, signaling you to wait."
  - "{name} looks lost in thought, then notices you and smiles."
  - ...
- 模板池小但 hash 切片让"重复感"摊到天为单位

spec-013（内容 seed）阶段会替换为 per-companion 专属池；本 spec 只交付通用池。

### H. 新建 `packages/api/src/events/index.ts`

```typescript
export async function handleEventsRequest(
  request, env, pathname,
): Promise<Response | null>;
```

匹配：
- `GET /events` → list
- `POST /events/{id}/resolve` → resolve
- 其他 → null

### I. 改 `packages/api/src/scenes/index.ts`

`POST /scenes/{id}/enter` 增量：
1. 加载场景 + companions_present 之后
2. 调 `evaluateTriggersForScene(env, user.id, companions, now)`
3. 命中：调 `generateEventPayload` → 写 events 表 → `event = { id, type, payload, created_at }`
4. 给 `companions_present[*]` 填 `opener: pickOpener(...)`
5. 响应：`{ scene, companions_present, event }`

未命中：`event: null` 保持现状，opener 仍填。

### J. 改 `packages/api/src/chat/messages.ts`

call 2 成功 + `applySignals` 之后追加：
1. 调 `evaluateConflictTrigger(env, user.id, companionId, extract.signals, now)`
2. 命中：`generateEventPayload(event_type='conflict')` → 写 events 表（**不出现在本次 SSE 流里**）
3. 全部走 `ctx.waitUntil` 异步（不阻塞 done 事件）

下次前端调 `GET /events?pending` 时拿到该 conflict 事件。

### K. 主 `packages/api/src/index.ts` 接线

- 从 `RETIRED_PREFIXES` 删 `"/events/"`
- import `handleEventsRequest`
- dispatch（在 chat 之后、retired 检查之前）

### L. 测试

约 25 个新测试：
- `engine.test.ts`：阈值过滤、冷却时间（普通 + 一次性）、概率取样（mock Math.random）、优先级排序、多角色 → 取 1 个、抑制条件（hostility 高时不弹 invitation）
- `signal-trigger.test.ts`：hostility +2 命中 conflict、+1 不命中、冷却内不命中
- `generator.test.ts`：mock llmCall → 验证 json_schema、选项 id 全对齐、option 缺失走兜底
- `resolve.test.ts`：404 / 403 / 409 / 400（option_id 错）；正常路径写库 + applySignals + level_changed 检测
- `list.test.ts`：filter by status、limit clamp、分页 cursor
- `openers.test.ts`：相同 (user, companion, scene, day) 稳定；不同 day 切换；模板池大小 ≥ 20
- `scenes-enter.test.ts`（改老测试）：触发命中 → event 在响应；未命中 → event:null + opener 填了文字
- `chat-conflict.test.ts`（messages.test.ts 扩展）：hostility +2 → events 表新增 pending conflict；冷却内不再加

---

## 实施步骤

1. **写本 spec**（你正在读的）
2. migration `0003_event_templates.sql` + `0004_event_templates_seed.sql`；本地 + dev D1 跑 migrate
3. `events/engine.ts` 触发器 + 测试（含冷却、阈值、概率、优先级）
4. `events/generator.ts` LLM 调用 + 测试
5. `events/openers.ts` + 测试
6. `events/resolve.ts` + 测试
7. `events/list.ts` + 测试
8. `events/index.ts` dispatch
9. 改 `scenes/index.ts` 接 engine + openers（扩展现有测试）
10. 改 `chat/messages.ts` 末尾接 conflict 触发（扩展现有测试）
11. 主 `index.ts` 接线 + 去 retired prefix
12. `pnpm --filter @xtbit/api typecheck && pnpm --filter @xtbit/api test` 跑绿
13. `pnpm cf:dev` + curl 验证

---

## 验证

**自动化：**
- [ ] `pnpm --filter @xtbit/api typecheck` 0 错
- [ ] `pnpm --filter @xtbit/api test` ≥ 135 测试全绿

**手动 dev：**
- [ ] `POST /scenes/{id}/enter` 在关系数值低时 → `event: null`、companion 有 opener
- [ ] 把某 companion 的 relationship 数值手工调到 invitation 阈值（closeness=40, trust=30） → enter → `event: { event_type: 'invitation', payload: {...4 options...} }`
- [ ] `POST /events/{id}/resolve` 选 `accept_eager` → `result.description` 文案合理、relationship 数值上涨、`level_changed` 反映新等级
- [ ] 同角色 3 天内不再触发 invitation（冷却生效）
- [ ] `POST /chat/{cid}/messages` 说狠话致 hostility +2 → SSE 结束后 `GET /events?pending` 看到 conflict
- [ ] confession 触发一次后再调 enter 永不再弹（lifetime cooldown）
- [ ] 同场景两角色都满足条件 → 只弹 1 个（按 priority）
- [ ] `SELECT * FROM events` 看到 status 流转 pending → resolved + resolution JSON

---

## 回滚

- `git revert` 整个 spec-008 commit
- D1 migration 回滚（dev 环境 wipe 重建；prod 还未上线）：
  ```sql
  DROP TABLE event_templates;
  DELETE FROM events; -- 可选，留空也行
  ```
- `/events/*` 回到 410 Gone（把 `"/events/"` 加回 `RETIRED_PREFIXES`）
- scenes/enter 和 chat/messages 的扩展点用 git revert 退回

---

## 依赖

- ⬅️ 阻塞于：spec-003（events 表）、spec-004（companion 卡）、spec-005（applySignals）、spec-006（chat 末尾接 conflict）、spec-007（scenes/enter 入口）
- ➡️ 阻塞：spec-012（Expo UI 渲染事件弹窗）、spec-013（具体 event_templates 内容 + per-companion opener 池）

---

## 注意

- **概率掷骰用 `Math.random()`**：Workers 沙箱里非密码学随机，但事件触发不要求安全随机
- **同步 LLM 调用对场景延迟敏感**：scenes/enter 命中事件时延迟 2-3s，前端 loading 必须做好；未命中只 200ms
- **conflict 冷却 = 2 天**：玩家可能在同一对话里多次说狠话，但同一窗口期只能触发 1 个 conflict 事件（避免事件刷屏）
- **milestone 在场景任意性**：第 30 天进任何场景都可能弹 "认识 30 天" 事件；不绑定特定场景
- **clamping**：所有 signals 都走 `applySignals` 的 ±5 clamp + 0..100 clamp，event 选项配 +2 之类的小数值不会爆维度
- **opener 池规模**：v1 通用池 20 条，覆盖 1 天循环；spec-013 补 per-companion 池后摊到 80+ 条
- **events 表无 user_id 索引联合 status**：现有索引是 `idx_events_user_companion` 和 `idx_events_status`，list 端点的 `WHERE user_id=? AND status=?` 用前者扫 user_id 后内存过滤 status；若上线后慢可补 `CREATE INDEX idx_events_user_status ON events(user_id, status)`
- **per-companion 覆盖行的写入路径**：v1 无 admin 写入（spec-011 提供）；本 spec 只交付 5 行 'all' seed，per-companion 行靠后续 admin 端点写

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
