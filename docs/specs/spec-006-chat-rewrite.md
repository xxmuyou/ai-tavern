# spec-006: chat 重写（自由对话 + 两次 LLM 调用编排）

> **类型：** 重写  |  **依赖：** spec-002, spec-003, spec-005, spec-007  |  **估时：** 5-7 天  |  **状态：** ⚪ todo

---

## Context

v1 玩法是「场景内自由对话」（[`product/gameplay.md §4`](../product/gameplay.md#4-对话系统)），原综艺章节制 chat 代码已在 spec-001 阶段归档；`packages/api/src/index.ts` 的 `RETIRED_PREFIXES` 把 `/chat/*` 暂时挡成 410 Gone。本 spec 把以下已落地的零件串成可用的对话端点：

- **LLM 路由 + 流式**（spec-002）：`llmCall` / `llmStream`，自带 provider 路由与降级、`llm_logs` 写入
- **relationships 引擎**（spec-005）：`ensureRelationship` / `applySignals`，clamp 与 level 计算都已封装
- **companions / scenes**（spec-004 / 007）：角色卡 + 场景行加载
- **D1 schema**（spec-003）：`threads`、`messages`、`usage_log` 表已就位

本 spec 还需要把**配额 + rate limit** 落地。spec-010（Stripe）会接入真正的订阅判断，因此本 spec 内的「是否订阅」做成 stub（默认全员 free），但完整跑通 30/日 + 10/分钟两道闸门。

---

## 目标

- 实现 `packages/api/src/chat/` 模块，落地三条端点（[`api.md §5`](../architecture/api.md#5-chat-端点)）：
  - `POST /chat/{companion_id}/messages`（SSE 流式，核心）
  - `GET /chat/{companion_id}/history`（游标分页）
  - `DELETE /chat/{companion_id}/history`（硬删，保留 relationships）
- **两次 LLM 调用编排**（决策 A）：
  - call 1 流式 + `task='chat'`：纯文本 reply 透传到 SSE
  - call 2 非流式 + `task='signal'` + `json_schema`：抽出 `{signals, emotion}`，再触发 `applySignals` + DB UPDATE
- **配额完整实现**（决策 A）：
  - KV `quota:{user_id}:{YYYY-MM-DD}`（UTC）—— 30 条/日 free → 402
  - KV `ratelimit:{user_id}:{YYYY-MM-DDTHH:MM}` —— 10/分钟 → 429
  - subscription 判断 stub 成 `false`（spec-010 会替换为 billing entitlement helper）
- **摘要触发点**（决策 C）：消息数 > 50 时投递 `JOB_QUEUE` 桩 payload，consumer 留到后续 spec
- **DELETE = 硬删**（决策 A）：清 `messages` + 重置 `threads.message_count/summary`，relationships 不动
- 关闭 `/chat/*` 的 410 Gone，挂上真实 handler
- 测试：约 22 个新增单测；现有 62 个不破

## 非目标

- ❌ 摘要 LLM 消费者实现（只投递 stub payload，不消费）
- ❌ Stripe / 订阅查询接入（spec-010）
- ❌ 群聊 / 多角色同台
- ❌ 场景进入时主动生成「开场白」（在 spec-007 `POST /scenes/{id}/enter` 已落地，不在本 spec 重做）
- ❌ events 触发器（spec-008）
- ❌ Moderation / 内容过滤（短期内依赖 provider 内置 safety，本 spec 不接 OpenAI moderation API）

---

## 改动清单

### A. 新建 `packages/api/src/chat/sse.ts`

`ReadableStream` + `TransformStream` 封装：

```typescript
export function createSSEStream(): {
  response: Response;          // 已设好 content-type / cache-control / x-accel-buffering
  writeEvent(name: string, data: unknown): Promise<void>;
  close(): Promise<void>;
};
```

事件编码格式：`event: {name}\ndata: {JSON}\n\n`。Headers：
- `content-type: text/event-stream`
- `cache-control: no-cache, no-transform`
- `connection: keep-alive`
- `x-accel-buffering: no`

### B. 新建 `packages/api/src/chat/narrative.ts`

纯函数：把 7 维度 → 英文叙事字符串（[`llm.md §5.3`](../architecture/llm.md#53-关系叙事注入关键)）。**不能让数字泄露到 prompt**。

```typescript
export function buildRelationshipNarrative(
  state: { dimensions: DimensionValues; level: RelationshipLevel; first_met_at: number },
  now: number,
): string;
```

规则（按优先级拼接，每条独立成行）：
1. 时长：`now - first_met_at` → "You first met N days ago." / "earlier today"
2. 等级：`computeLevel` → "You think of them as a {level}."
3. closeness ≥ 70 → "You feel close and familiar with the user."
4. trust ≥ 60 → "You trust them."
5. trust ≤ 20 && closeness ≥ 40 → "You're close but still guarded around them."
6. romance ≥ 80 → "You're deeply in love with them."；50-79 → "There is growing romantic tension between you."
7. friendship ≥ 60 → "They are a good friend to you."
8. hostility ≥ 50 → "You feel real anger toward this user."
9. tension ≥ 50 → "Recent interactions have left things awkward."
10. distance ≥ 60 → "You've been keeping them at arm's length lately."
11. 兜底：刚见面且全 0 → "You barely know them yet."

### C. 新建 `packages/api/src/chat/prompt.ts`

```typescript
export function buildChatPrompt(input: {
  companion: CompanionRow;
  scene: SceneRow | null;
  narrative: string;
  threadSummary: string | null;
  recentMessages: Array<{ role: 'user' | 'companion'; content: string }>;
  userText: string;
}): LLMMessage[];
```

输出 `messages[]`：
- 一条 system message（角色卡 + 场景 + 关系叙事 + 摘要 + 规则）
- 历史消息按 ASC 时间拼成 user / assistant 交替
- 最末追加 `{role: 'user', content: userText}`

`max_tokens: 400, temperature: 0.85`（在调用方注入）。

### D. 新建 `packages/api/src/chat/signal-extract.ts`

```typescript
export async function extractSignals(
  env: Env,
  ctx: { userId: string },
  args: { userText: string; companionReply: string; narrative: string },
): Promise<{
  signals: DimensionValues;       // 各维度 -3..+3
  emotion: Emotion;
  cost_usd: number;
  ok: boolean;                    // false 时表示 LLM 失败/parse 失败，已 fallback 到 zeros + neutral
}>;
```

内部走 `llmCall(env, { task: 'signal', messages, json_schema, max_tokens: 256, temperature: 0 }, { user_id })`。

`json_schema`：
```json
{
  "type": "object",
  "required": ["signals", "emotion"],
  "additionalProperties": false,
  "properties": {
    "signals": {
      "type": "object",
      "required": ["closeness","trust","romance","friendship","hostility","tension","distance"],
      "additionalProperties": false,
      "properties": {
        "closeness":  { "type": "integer", "minimum": -3, "maximum": 3 },
        "trust":      { "type": "integer", "minimum": -3, "maximum": 3 },
        "romance":    { "type": "integer", "minimum": -3, "maximum": 3 },
        "friendship": { "type": "integer", "minimum": -3, "maximum": 3 },
        "hostility":  { "type": "integer", "minimum": -3, "maximum": 3 },
        "tension":    { "type": "integer", "minimum": -3, "maximum": 3 },
        "distance":   { "type": "integer", "minimum": -3, "maximum": 3 }
      }
    },
    "emotion": { "type": "string", "enum": ["warm","neutral","guarded","playful","tense","annoyed"] }
  }
}
```

兜底：parse 失败 / `structured` 缺失 / 超界 → `ok=false`，signals 全 0，emotion=`neutral`，不抛错（让 messages handler 决定是否给 `done.warning="signal_extract_failed"`）。

### E. 新建 `packages/api/src/chat/quota.ts`

```typescript
export async function checkRateLimit(env: Env, userId: string, now: number): Promise<{ ok: boolean }>;
export async function checkQuota(env: Env, userId: string, now: number): Promise<{ ok: boolean; remaining: number }>;
export async function incrementQuota(env: Env, userId: string, now: number): Promise<void>;
export async function isSubscriberActive(env: Env, userId: string, now: number): Promise<boolean>;
```

`isSubscriberActive` 在 spec-006 阶段只作为过渡入口；spec-010 必须移除 chat 模块对旧 `subscriptions` 表的直接依赖，改为调用 billing entitlement helper。

KV 键：
- `quota:{uid}:{YYYY-MM-DD}` UTC，read+write +1，`expirationTtl: 90000`（~25h），≥ 30 → `ok=false`
- `ratelimit:{uid}:{YYYY-MM-DDTHH:mm}` UTC，read+write +1，`expirationTtl: 120`，≥ 10 → `ok=false`

非订阅用户跑 free counter；订阅 stub 翻开后跑独立 `quota:{uid}:{YYYY-MM-DD}:sub`（软上限 1000，超 → 402）。

### F. 新建 `packages/api/src/chat/usage.ts`

```typescript
export async function recordUsage(
  env: Env, userId: string, dateUtc: string, msgCount: number, costUsd: number,
): Promise<void>;
```

SQL：`INSERT INTO usage_log ... ON CONFLICT(user_id, date_utc) DO UPDATE SET message_count = message_count + excluded.message_count, llm_cost_usd = llm_cost_usd + excluded.llm_cost_usd`。

### G. 新建 `packages/api/src/chat/summary-queue.ts`

```typescript
export async function maybeEnqueueSummary(
  env: Env, threadId: string, messageCount: number,
): Promise<void>;
```

当 `messageCount > 50 && messageCount % 10 === 0`（每涨 10 触发一次，避免重复）→ `env.JOB_QUEUE.send({ type: 'chat.summary', thread_id, message_count })`。consumer 留 stub。

### H. 新建 `packages/api/src/chat/history.ts`

`getHistory(env, user, companionId, query)`：
- 校验 companion 存在 + 可见
- 取 thread；不存在直接返回 `{ messages: [], thread: null, next_cursor: null }`
- 分页：`?limit=<1..100, default 50>&before_id=<id>`
  - 有 before_id：先 `SELECT created_at FROM messages WHERE id=? AND thread_id=?`
  - 主查询：`SELECT id, role, content, signals, emotion, created_at FROM messages WHERE thread_id=? [AND created_at < ?] ORDER BY created_at DESC LIMIT ?+1`
  - 多取一条决定 `next_cursor`
  - 返给前端时翻转为 ASC

`deleteHistory(env, user, companionId)`：硬删 + 重置 thread，relationships 不动。返回 204。

### I. 新建 `packages/api/src/chat/messages.ts`

`postMessage(request, env, ctx, user, companionId)`：

**前置（同步、未开流前）：**
1. `readJson` 拿 `{ text, scene_id? }`，缺 text → 400
2. 加载 companion（404 / 403）
3. `checkRateLimit` → 429 + `Retry-After: 60`
4. `isSubscriberActive` + `checkQuota` → 402（订阅 stub 返回 false 时跑 free counter）
5. ensureRelationship + loadRelationship（拿叙事素材）
6. 拼 prompt：取最近 50 条 `messages`（ASC）

**SSE 流（开始流式响应）：**
7. `llmStream(env, { task:'chat', messages, max_tokens:400, temperature:0.85 }, { user_id })`
8. 边收 chunk 边 `writeEvent('chunk', { text })`；累 `replyBuffer`；done chunk 拿 usage + cost
9. **call 1 done 后立即（事务性，按序）：**
   - INSERT user message（role='user'）
   - INSERT companion message（role='companion'，signals/emotion=null 占位）
   - UPDATE threads SET message_count = message_count + 2, updated_at = ?
   - `incrementQuota`（call 1 失败时不扣的关键）
10. **call 2**：`extractSignals(...)`
11. 若 `ok`：UPDATE messages SET signals=?, emotion=? WHERE id=?；`applySignals(env, user.id, companionId, signals, now)`
12. `writeEvent('signals', signals)` / `writeEvent('emotion', { value })`
13. `writeEvent('done', { message_id, usage, warning: ok ? null : 'signal_extract_failed' })`
14. `ctx.waitUntil(recordUsage(...))`、`ctx.waitUntil(maybeEnqueueSummary(...))`
15. `close()`

**错误处理：**
- 步骤 1-6 失败 → 标准 JSON 错误（401/402/403/404/429）
- 步骤 7（开流前）`LLMError` → 503 JSON `LLM_UNAVAILABLE`
- 步骤 8 中途抛 → `writeEvent('error', { code:'LLM_UNAVAILABLE', message })` + close；**不写库、不扣 quota**
- 步骤 9 DB 异常 → `writeEvent('error', { code:'INTERNAL' })` + close
- 步骤 10 异常 → 已被 `extractSignals` 内部兜底，`ok=false`，正常走 11-13 给 warning

### J. 新建 `packages/api/src/chat/index.ts`

```typescript
export async function handleChatRequest(
  request: Request, env: Env, ctx: ExecutionContext, pathname: string,
): Promise<Response | null>;
```

路径匹配：
- `POST /chat/{cid}/messages` → `postMessage`
- `GET /chat/{cid}/history` → `getHistory`
- `DELETE /chat/{cid}/history` → `deleteHistory`
- 其他 → `null`

### K. 修 `packages/api/src/index.ts`

- 从 `RETIRED_PREFIXES` 删 `"/chat/"`
- import `handleChatRequest`
- 在 dispatch 表（relationships 之后、retired 检查之前）加：
  ```typescript
  const chatResponse = await handleChatRequest(request, env, ctx, url.pathname);
  if (chatResponse) return chatResponse;
  ```
- 把 worker fetch handler 的 `ctx: ExecutionContext` 一路传入 dispatch（其他模块签名不动；只在 chat 的 dispatch 调用点用 `ctx`）

### L. 测试

约 22 个新测试，按模块拆：

- `sse.test.ts`：writeEvent 格式 / 多事件分隔 / close
- `narrative.test.ts`：零维度 → barely know；高 romance+trust → in love；hostile 覆盖 friend；输出无数字（正则）；first_met < 1 day → earlier today
- `prompt.test.ts`：system 含 companion.name / scene.mood / narrative；历史按 role 映射 user/assistant；末尾追加 userText；空历史 OK
- `signal-extract.test.ts`：stub llmCall 返回合法 structured → 解析；invalid JSON → ok=false + zeros + neutral；超界值被 clamp
- `quota.test.ts`：KV +1 算术；分钟桶跨 UTC 边界；订阅 stub 返回 false；ratelimit 10 → 429；quota 30 → 402
- `history.test.ts`：游标 next_cursor；limit clamp 1..100；空 thread → 空 messages；signals JSON parse 还原
- `delete-history.test.ts`：messages 清空 + thread 重置；relationships 不动
- `summary-queue.test.ts`：51/60/70 触发；50 不触发；payload 形状
- `messages.test.ts`：成功路径（chunk → signals → emotion → done）；call 1 mid-stream 抛 → event:error + 不写库；call 2 抛 → done.warning + signals null in DB；rate-limit / quota / 404 / 403 / 401 各 1 条

---

## 实施步骤

1. **先写本 spec**（你正在读的这份）
2. 纯函数层：`narrative.ts` + `prompt.ts` + `sse.ts` + 测试
3. `signal-extract.ts` + 测试（mock `llmCall`）
4. `quota.ts` + 测试（mock KV）
5. `history.ts` + 测试（mock D1）
6. `summary-queue.ts` + 测试
7. `messages.ts` 增量：先非流式打通 DB 顺序，再切 SSE + call 2
8. `chat/index.ts` dispatch
9. `packages/api/src/index.ts` 接线（删 retired prefix + 传 ctx + 挂 dispatch）
10. `pnpm --filter @xtbit/api typecheck && pnpm --filter @xtbit/api test`
11. `pnpm cf:dev` + curl 全链路验证

---

## 验证

**自动化：**
- [ ] `pnpm --filter @xtbit/api typecheck` 0 错
- [ ] `pnpm --filter @xtbit/api test` 通过（≥ 84 测试全绿）

**手动 dev：**
- [ ] `/chat/{cid}/messages` 在未带 token 时 401
- [ ] dev-session 后 POST → SSE 流：先若干 `event: chunk`，再 `event: signals`、`event: emotion`、`event: done`
- [ ] `GET /chat/{cid}/history` 返回刚写入的 2 条
- [ ] 连发 30 条 → 第 31 条 402 `QUOTA_EXCEEDED`
- [ ] 同分钟 11 条 → 第 11 条 429 `RATE_LIMITED` + `Retry-After: 60`
- [ ] `DELETE /chat/{cid}/history` → 204；再 GET → 空 messages、`thread.message_count=0`；`GET /relationships/{cid}` 数值保留
- [ ] `SELECT * FROM llm_logs` 看到每次对话两行（chat + signal），失败时 status='error'
- [ ] `SELECT * FROM usage_log` 当日 message_count / llm_cost_usd 增长

---

## 回滚

- `git revert` 整个 spec-006 commit
- 没有 schema / KV migration
- `/chat/*` 自动回到 410 Gone（把 `"/chat/"` 加回 `RETIRED_PREFIXES`）

---

## 依赖

- ⬅️ 阻塞于：spec-002（llm 路由）、spec-003（threads/messages/usage_log 表）、spec-005（applySignals）、spec-007（scene 行加载）
- ➡️ 阻塞：spec-008（events 在 chat 上下文里触发）、spec-012（Expo UI 对话界面）、spec-010（订阅判断翻 stub）

---

## 注意

- **KV 非原子**：quota/rate-limit 读+写有微小竞态（per-user 量级可接受）；要严格原子需上 Durable Object，v1 不做
- **subscription stub 翻开关位置**：`chat/quota.ts:isSubscriberActive` 一个函数，spec-010 时去掉早返回
- **summary consumer**：本 spec 只投递 payload；JOB_QUEUE consumer 路由当前为空，需后续 spec 实现
- **call 1 mid-stream 抛 ≠ call 1 开流前抛**：前者已经吐了 token 给前端，必须用 SSE `event: error`；后者还没开流，用 503 JSON
- **call 2 失败不影响 reply 持久化**：messages 已存（signals=null），用户体验上对话仍然推进，只是关系数值这一帧不动；后续可考虑离线补抽
- **prompt 中不能出现数字**：narrative 翻译规则全部用文字描述等级，LLM 不擅长读数字（[`llm.md §5.3`](../architecture/llm.md#53-关系叙事注入关键)）
- **clamp 防御**：signal 维度被 LLM schema 限制在 -3..+3；`applySignals` 内部还会再 clamp ±5 → 0..100，双层防御
- **历史长度**：v1 取最近 50 条原文；超 50 时虽然投递摘要任务，但 consumer 未实现 → `thread.summary` 一直为 null，prompt 仅含最近 50 条
