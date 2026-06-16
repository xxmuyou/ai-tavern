# spec-034: Chat Quality, Memory, and Prompt Governance（聊天质量、记忆与 Prompt 治理）

> **类型：** 后端 + LLM + 文档治理  |  **依赖：** spec-006(chat), spec-025(角色深度), spec-026(story beats), spec-029(user story arcs)  |  **估时：** 4-6 天  |  **状态：** 🟡 in-progress

---

## Context

当前 chat 已经具备角色卡、用户 persona、关系叙事、story beat、thread summary 与最近 50 条消息注入；spec-025 也补上了 `want / secret / boundary` 和主动性规则。但实际聊天质量仍有几个结构性风险：

- prompt 是单块 system 文本，缺少可审计的分段、优先级和裁剪原因。
- 长聊依赖一个散文 summary + 最近 50 条原文，无法稳定保留承诺、偏好、未完成剧情和关系事实。
- 所有长期信息主要在 system prompt 前部，缺少类似 SillyTavern Author's Note 的“贴近末尾强提醒”，模型在长历史下容易漂移。
- 没有 prompt inspector/debug snapshot，修复角色问题时只能猜哪段指令冲突或被裁剪。

本 spec 承接 spec-006 的基础 chat、spec-025 的角色深度、spec-026/029 的剧情上下文，专门补“聊天质量治理”这一层。目标不是复刻 SillyTavern 的完整复杂度，而是借鉴其分层 prompt、动态记忆和 prompt 审计思路，先保障单线程聊天质量。

---

## 决策记录

1. **记忆范围**：第一版只做当前 `(user, companion, thread)` 内的长期记忆。不跨 thread，不跨角色共享用户画像。
2. **记忆生成**：优先使用 AI 自动提取；提取失败必须静默降级，不影响主聊天链路。
3. **交付优先级**：优先保障角色稳定，包括身份、persona、关系事实、输出格式和边界感。
4. **复杂度边界**：不做完整 lorebook UI，不做用户可编辑 memory 面板，不做群聊 prompt manager。
5. **文档口径**：本 spec 是后续实现聊天记忆与 prompt 分层的唯一现行依据；旧文档里“长期记忆另开 spec”的位置统一指向本 spec。

---

## 目标 / 非目标

### 目标

- 将 chat prompt 从单块 system string 重构为 `PromptSegment[]`，每段带 id、role、位置、优先级、是否必保留和 token 估算。
- 增加 `post_history_guard`，在最近历史之后、最新用户消息之前注入短而强的身份/格式提醒。
- 新增单线程结构化 memory：保留关系事实、用户偏好、承诺、未完成剧情和角色状态。
- 新增 `memory_extract` LLM task，聊天落库后异步提取/更新 memory。
- 新增 admin/dev prompt debug snapshot，让每轮最终 prompt 可审计。
- 规定 token 预算和裁剪策略，避免“最近 50 条”在长聊里无差别挤掉关键上下文。

### 非目标

- ❌ 跨角色用户长期画像。
- ❌ 跨 thread 共享记忆。
- ❌ 完整 SillyTavern World Info / Lorebook 编辑器。
- ❌ 用户手动编辑 memory UI。
- ❌ 群聊 / 多角色同台。
- ❌ 重写 LLM provider、关系引擎、story beat 推进规则。
- ❌ 用 memory 替代 `threads.summary`；summary 仍负责压缩聊天历史，memory 负责可复用事实。

---

## Prompt Segments

### Segment 类型

```typescript
export type PromptSegment = {
  id: string;
  role: "system" | "user" | "assistant";
  position: "system_preamble" | "pre_history" | "in_history" | "post_history" | "final_user";
  priority: number;
  required: boolean;
  content: string;
  tokenEstimate?: number;
};
```

### 必保留段

以下 segment 即使历史被裁剪也必须保留：

| id | 作用 |
|----|------|
| `core_identity` | 明确模型正在扮演哪个 companion，不是 AI assistant |
| `character_card` | `personality / background / appearance / speech_style / want / boundary / unlocked secret` |
| `relationship_state` | 关系阶段、称呼和亲密度风味，使用叙事而不是裸数字 |
| `post_history_guard` | 贴近末尾的身份、persona、格式和边界强提醒 |
| `output_format` | `<narration>` 格式、语言跟随、禁止 JSON/meta |

### 优先保留段

这些 segment 按 token budget 保留，预算不足时可裁剪或压缩：

| id | 作用 |
|----|------|
| `user_persona` | 用户正在扮演谁 |
| `current_scene` | 场景、activity、mood，防止瞬移 |
| `story_beat` | 当前剧情拍 opener/objective |
| `thread_memory` | 结构化长期记忆 |
| `thread_summary` | 旧消息摘要 |

### 用户人设入口

- Web 顶部导航提供 `Personas` 一级入口；Me 页保留 `Manage personas` 入口，直接打开 `/personas` 也应有清晰返回路径。
- Chat 内 persona selector 用于当前会话切换“用户正在扮演谁”；默认使用用户标记的 default persona。
- User persona 只描述用户身份并注入 prompt / memory extraction，不改 companion 角色卡、头像、公开资料或 Discover 排序。

### 可裁剪段

- 旧的 recent history。
- 低 importance memory。
- 已完成或过期的 `open_loop`。
- 非当前 scene/story beat 直接相关的上下文。

### 组装顺序

1. `core_identity`
2. `character_card`
3. `user_persona`
4. `current_scene`
5. `story_beat`
6. `relationship_state`
7. `output_format`
8. `thread_memory`
9. `thread_summary`
10. recent history（按时间 ASC）
11. `post_history_guard`
12. latest user message

`post_history_guard` 不应很长，只保留本轮最关键约束：

- You are `{companion.name}`.
- You are speaking to `{userPersona.name}` when present.
- Relationship stage / intimacy guidance.
- Never narrate or decide the user's actions, thoughts, or words.
- Use `<narration>...</narration>` for actions and plain text only for spoken dialogue.
- Match the user's current language.

---

## Thread Memory

### 数据模型

新增 `thread_memories`：

```sql
CREATE TABLE thread_memories (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  thread_id     TEXT NOT NULL REFERENCES threads(id),
  kind          TEXT NOT NULL,
  content       TEXT NOT NULL,
  importance    INTEGER NOT NULL DEFAULT 50,
  status        TEXT NOT NULL DEFAULT 'active',
  source        TEXT NOT NULL DEFAULT 'ai_extract',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_thread_memories_thread ON thread_memories(thread_id, status, importance, updated_at);
CREATE INDEX idx_thread_memories_user_companion ON thread_memories(user_id, companion_id, status);
```

`kind` 固定为：

- `relationship_fact`：关系事实，例如“他们曾因某件事冷战后和解”。
- `user_preference`：用户偏好，例如“用户喜欢被叫 Dr. Wen”。
- `promise`：任一方承诺要做的事。
- `open_loop`：未完成剧情、未回答问题、约定下次继续的话题。
- `character_state`：角色当前心情、顾虑、正在推进的个人目标。

`status` 固定为：

- `active`：可注入。
- `resolved`：已完成，默认不注入。
- `dismissed`：被系统判定不再 relevant，默认不注入。

### 注入策略

- 每轮最多注入 8 条 active memory。
- 排序：`importance DESC, updated_at DESC`。
- 内容必须是 standalone sentence，不能依赖原聊天片段才能理解。
- memory 注入段使用简短标题，例如 `# Stable memories from this conversation`。
- 若 token budget 不足，先裁剪低 importance memory，再裁剪 older history。

---

## Memory Extract

新增 LLM task：`memory_extract`。

触发时机：

- 聊天主回复和 signal extraction 完成后，通过 queue / waitUntil 异步执行。
- 不阻塞 SSE，不影响 quota，不影响 relationship apply。

输入：

- companion name + relationship role。
- 当前 user persona。
- 最近新增的用户消息和 companion 回复。
- 当前 active memories 的简短列表。
- 当前 relationship narrative。

输出 JSON schema：

```json
{
  "type": "object",
  "required": ["upserts", "resolves"],
  "additionalProperties": false,
  "properties": {
    "upserts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["kind", "content", "importance"],
        "additionalProperties": false,
        "properties": {
          "kind": { "type": "string", "enum": ["relationship_fact", "user_preference", "promise", "open_loop", "character_state"] },
          "content": { "type": "string", "maxLength": 500 },
          "importance": { "type": "integer", "minimum": 1, "maximum": 100 }
        }
      }
    },
    "resolves": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["memory_id", "reason"],
        "additionalProperties": false,
        "properties": {
          "memory_id": { "type": "string" },
          "reason": { "type": "string", "maxLength": 300 }
        }
      }
    }
  }
}
```

失败处理：

- JSON parse 失败、schema validation 失败、provider 失败：记录 warning/log，丢弃结果。
- 不重试到影响用户体验；可由 queue 自身 retry 非配置类错误。
- 不覆盖用户消息，不修改 relationship，不回滚 companion reply。

---

## Prompt Debug

新增可选 `prompt_debug_snapshots`，仅 dev/admin 使用：

```sql
CREATE TABLE prompt_debug_snapshots (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id),
  companion_id   TEXT,
  thread_id      TEXT,
  message_id     TEXT,
  segments_json  TEXT NOT NULL,
  token_estimate INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_prompt_debug_thread ON prompt_debug_snapshots(thread_id, created_at);
```

`segments_json` 记录：

- segment id / role / position / priority。
- token estimate。
- `included: true | false`。
- `trim_reason`：`budget`、`empty`、`not_applicable`、`inactive_memory` 等。

约束：

- 仅 admin/dev API 可读。
- 不记录 API keys、provider secrets、authorization headers。
- 普通用户没有 memory 或 prompt debug 管理接口。
- 生产可通过 feature flag 关闭写入。

草案端点：

- `GET /admin/chat/{threadId}/prompt-debug/latest`
- 只返回最新 snapshot。
- 走 `requireAdminUser`。

---

## 实施步骤

1. 文档和 architecture 对齐：本 spec、LLM task、data model、admin debug API 口径一致。
2. 新增 migration：`thread_memories`，可选 `prompt_debug_snapshots`。
3. 将 `buildChatPrompt` 改成先产出 `PromptSegment[]`，再组装 `LLMMessage[]`。
4. 增加 token budget 裁剪器，必保留段不可裁剪。
5. 实现 `post_history_guard` 注入。
6. 实现 active thread memory 加载和注入。
7. 实现 `memory_extract` task + schema validation + upsert/resolve。
8. 增加 prompt debug snapshot 写入和 admin/dev 读取端点。
9. 补测试和长聊验收脚本。

---

## 验证

### 自动化测试

- `prompt.test.ts`：必保留 segment 全部存在；`post_history_guard` 出现在 latest user message 之前。
- token budget：预算不足时裁剪 older history 和低 importance memory，不裁剪 identity / output format。
- memory 注入：只注入当前 thread active memory，`resolved/dismissed` 不注入。
- memory extraction：合法 JSON 写入；坏 JSON / schema 不合法静默降级。
- admin prompt debug：非 admin 不能读；admin 可看到 segment include/trim 状态。

### 手工验收

- 60+ 轮长聊后，角色仍能引用已提取的 `promise` / `open_loop`。
- 用户要求角色改变身份或承认是 AI 时，下一轮仍保持角色身份。
- 用户中文输入时继续中文回复。
- `<narration>` 格式规则在长历史下仍保留。
- memory extraction LLM 返回坏 JSON 时，主回复仍正常落库并继续聊天。

### 不算完成

- 只新增 prompt 文案但没有 prompt 分段审计。
- 只保留 summary，没有结构化 memory。
- 只做跨角色用户画像，反而没有解决单线程角色稳定。
- prompt debug 无法解释哪些段被注入、哪些段被裁剪。
- memory extraction 失败会中断聊天主链路。

---

## 回滚

- 关闭 `memory_extract` queue / waitUntil 调用：聊天继续使用 summary + recent history。
- 跳过 `thread_memory` segment 注入：不影响基础 chat prompt。
- 关闭 prompt debug snapshot 写入：不影响主链路。
- 若 `PromptSegment[]` 组装出现问题，可临时回退到旧 `buildChatPrompt` 单块 system 结构，但必须保留 spec-034 文档作为后续修复依据。

---

## 依赖与后续

- 依赖 spec-006 的 chat 基础端点、summary queue、messages/threads 表。
- 依赖 spec-025 的角色深度字段与 stage prompt guidance。
- 消费 spec-026/029 的 active story beat / user-created story arc 上下文。
- 后续若要做跨 thread / 跨角色用户画像，必须另开 spec，并先解决隐私、串戏和用户可控删除问题。
