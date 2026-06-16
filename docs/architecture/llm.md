# LLM 集成

> 本文档定义 LLM 多供应商架构、prompt 设计、成本估算、错误降级。架构总览见 [`overview.md`](./overview.md)，付费模式见 [`product/monetization.md`](../product/monetization.md)。

---

## 1. 设计目标

1. **多供应商支持，admin 可在运行时切换**（继承现有 spec-005 思想）
2. **不同任务用不同模型**（对话用大模型，信号提取用小模型）
3. **统一抽象层**，业务代码不感知供应商差异
4. **错误降级**（主供应商不可用时自动 fallback）
5. **成本可观测**（每次调用记录 token + 成本）

## 2. 供应商选择

### 2.1 候选供应商

v1 集成的供应商列表（admin 可在后台启用 / 禁用 / 切换）：

| 供应商 | 价格水平 | 优势 | 劣势 | 推荐角色 |
|--------|---------|------|------|---------|
| **DeepSeek** | 极低 | API 兼容 OpenAI 协议、英文角色扮演稳定、JSON output 支持 | 国内供应商，海外用户网络偶有抖动（用 Workers 作为代理可缓解） | fallback / 信号提取默认 |
| **MiniMax M3** | 低 | OpenAI 兼容接口、长上下文、价格仍明显低于高端 GPT | 需要实测角色扮演稳定性；API 域名必须用 `.com` 的 `api.minimaxi.com` | 低成本 chat 主力候选 |
| **Doubao（豆包）** | 极低（lite 版） | 字节稳定供应、价格在国内最低之一 | 中文优化为主，英文表现略弱于 DeepSeek | 候选 / 未来中文版本主力 |
| **OpenAI** | 中等 | 生态成熟、JSON mode 稳定、moderation API 一并提供 | 价格高于 DeepSeek 约 2-3× | 高质量备选 / fallback |
| **Anthropic Claude** | 较高 | 长文本表现强、角色扮演品质上限高 | 价格最高、structured output 不如 OpenAI 严格 | 高质量备选 |
| **Cloudflare Workers AI** | 极低 | 同账户、低延迟、按 CF 用量计费 | 模型选择有限、质量参差 | 仅低优先级任务（如对话摘要） |

**v1 不集成：** OpenRouter（多一层延迟）、本地自托管模型（运维成本高）。

### 2.2 v1 默认配置 *(暂定，admin 可改)*

| 任务 | 默认模型 | 备选 |
|------|---------|------|
| **对话生成**（主要支出） | **MiniMax `MiniMax-M3`** | DeepSeek `deepseek-chat` / Doubao `doubao-1.5-lite-32k` / OpenAI `gpt-4o-mini` |
| **信号提取**（解析关系变化） | DeepSeek `deepseek-chat`（同次调用，JSON output） | OpenAI `gpt-4o-mini` |
| **对话历史摘要**（异步） | Cloudflare Workers AI `@cf/meta/llama-3.1-8b-instruct` | DeepSeek `deepseek-chat` |
| **对话记忆提取**（异步） | DeepSeek `deepseek-chat`（JSON output） | OpenAI `gpt-4o-mini` |
| **角色卡生成辅助**（用户自创角色时 AI 帮补全） | DeepSeek `deepseek-chat` | OpenAI `gpt-4o-mini` |

**为什么把 MiniMax M3 作为 chat 候选默认：**
- 成本低于高端 GPT，且更适合先实测沉浸式角色对话。
- 官方提供 OpenAI-compatible Chat Completions 路径，接入成本低。
- 当前实现使用 `https://api.minimaxi.com/v1`，不要改成 `.io` 域名。
- `max_tokens` 对 MiniMax 路径已改用 `max_completion_tokens`，避免使用废弃字段。

**为什么保留 DeepSeek 作为 fallback / 信号提取默认：**
- 价格约 input $0.14 / 1M、output $0.28 / 1M（cache miss）；cache hit input 约 $0.014 / 1M
- 英文表现足以承担 RPG 对话场景
- API 协议兼容 OpenAI（接入简单，迁移成本低）
- 30 条/用户/日 ≈ **$0.011 / 用户日成本**（见 §7）

**Doubao 暂不作为 v1 默认，因为：**
- 英文输出表现不如 DeepSeek（v1 海外英文为主）
- 集成抽象层中保留，admin 可切换；为未来中文版本预留路径

**注意：** 当前代码里的 `gpt-5-mini` 是错的型号，重写时按 admin 配置；chat 默认候选为 MiniMax M3，DeepSeek 作为低成本 fallback / 信号提取默认。

## 3. 抽象层设计

### 3.1 统一接口

```typescript
// packages/api/src/llm/types.ts
export interface LLMRequest {
  task: 'chat' | 'signal' | 'summary' | 'memory_extract' | 'character-assist';
  messages: ChatMessage[];
  schema?: JSONSchema; // structured output（信号提取 / memory_extract 必填）
  stream?: boolean;
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  structured?: unknown; // 若提供了 schema
  usage: { input: number; output: number; cost_usd: number };
  provider: string;
  model: string;
}

export interface LLMProvider {
  name: string;
  call(req: LLMRequest): Promise<LLMResponse>;
  stream(req: LLMRequest): AsyncIterable<LLMStreamChunk>;
  estimateCost(req: LLMRequest): number;
}
```

### 3.2 模块结构

```
packages/api/src/llm/
├── types.ts            ← 统一类型
├── router.ts           ← 根据 task + admin 配置选 provider
├── providers/
│   ├── deepseek.ts     ← DeepSeek（OpenAI 协议兼容）
│   ├── openai.ts       ← OpenAI
│   ├── anthropic.ts    ← Anthropic
│   ├── doubao.ts       ← 豆包（火山引擎）
│   ├── minimax.ts      ← MiniMax M3（OpenAI 协议兼容，api.minimaxi.com）
│   └── cloudflare.ts   ← CF Workers AI
├── prompts/            ← prompt 模板
│   ├── chat.ts
│   ├── signal.ts
│   ├── summary.ts
│   └── memory.ts
├── cost.ts             ← 成本计算（按 provider/model 维护价目表）
└── fallback.ts         ← 错误降级逻辑
```

**DeepSeek / MiniMax 因为协议兼容 OpenAI，provider 实现可继承自 openai.ts，仅改 baseURL + API key。**

### 3.3 调用示例

```typescript
import { llm } from './llm/router';

const response = await llm.call({
  task: 'chat',
  messages: [
    { role: 'system', content: buildSystemPrompt(companion, scene, relationship) },
    ...conversationHistory,
    { role: 'user', content: userInput },
  ],
  stream: true,
});
```

业务代码**不感知**当前用的是 OpenAI 还是 Anthropic —— 由 router 根据 admin 配置决定。

## 4. Admin 切换机制

### 4.1 配置存储

D1 表 `llm_config`（继承现有 spec-005 设计）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `task` | string | `chat` / `signal` / `summary` / ... |
| `provider` | string | `deepseek` / `openai` / `doubao` / `minimax` / `anthropic` / `cloudflare` |
| `model` | string | 具体模型名 |
| `is_active` | boolean | 当前是否启用 |
| `updated_at` | timestamp | 最后更新时间 |
| `updated_by` | user_id | admin 用户 ID |

### 4.2 admin API

- `GET /admin/llm/config` — 查看当前配置
- `PUT /admin/llm/config` — 更新某个 task 的 provider/model
- `POST /admin/llm/test` — 测试某个 provider/model（不影响线上）

### 4.3 admin 身份

继承现有设计：保留 `admin@aiappsbox.com` 作为内置 admin 邮箱（也可在 D1 中扩展 admin 用户列表）。

详见现有 [`_archive/2026-05/specs/spec-005-llm-admin-model-selection.md`](../_archive/2026-05/specs/) (归档后路径)。

## 5. Prompt 设计

### 5.1 对话 prompt 模板（核心）

```
[SYSTEM]
You are roleplaying as {companion.name}, a {companion.relationship_role}.

# Character
{companion.personality}
{companion.background}
Speech style: {companion.speech_style}
Appearance: {companion.appearance}

# Current Scene
Location: {scene.name}
Mood: {scene.mood}
Time: {time_of_day}

# Relationship with the user
{relationship_narrative}  ← 隐式表达，例：
"You've known the user for 3 weeks. You consider them a close friend.
There's growing romantic tension. You trust them, mostly.
You've been a bit tense after the misunderstanding last week."

# Conversation history (summary + recent)
{summary}
... last 15 messages ...

# Rules
Always reply in the same language the user writes in (e.g. user writes Chinese → reply Chinese),
regardless of the language used in this prompt or the character description.
Stay strictly in character; do not break the fourth wall.

# Output format
Respond in character as prose only. Stream text to the user. Actions, gestures,
facial expressions, scene description, and inner observations use
<narration>...</narration>; spoken dialogue stays outside tags.
```

Chat reply text is also passed through a deterministic markup sanitizer before
streaming, persistence, prompt-history reuse, voice extraction, and moment-image
context. The sanitizer allows only `<narration>` / `</narration>` tags:
malformed narration-like tags such as `<n narration>` or `<x narrative>` are
canonicalized, and other XML-like tags are stripped while keeping their body
text. This is a lightweight string pass; it does not retry the LLM, change
credits, or change the SSE wire format.

当前 chat 主调用只负责**流式文本回复**。关系 `signals` 与 `emotion` 由第二次 `task='signal'` structured-output 调用独立提取；长期 thread memory 由异步 `task='memory_extract'` 提取。不要把 chat 回复重新设计为 JSON，否则会破坏 SSE 文本体验与现有 signal extraction 分工。

### 5.2 信号值约束

- 每维度变化幅度限制在 **-3 ~ +3**（每条消息）
- 模型不能直接给"亲密度变成 80"这种绝对值
- 规则引擎做最终加权和限幅

### 5.3 关系叙事注入（关键）

不直接写"closeness=72, romance=45"给 LLM —— LLM 不擅长读数字。

**做法：** 后端把数值翻译成英文叙事，注入 prompt。
- closeness 70+ → "You feel close and familiar with the user."
- romance 50+ → "There is growing romantic tension between you."
- hostility 50+ → "You feel real anger toward this user."
- tension 50+ → "Recent interactions have left things awkward."

翻译规则在 `packages/api/src/llm/prompts/relationship.ts` 维护。

### 5.4 安全 / 拒绝边界

- 系统 prompt 包含安全护栏（不生成未成年色情、自残诱导、人身攻击等）
- 利用供应商内置的 safety filter（OpenAI moderation API、Anthropic safety）
- 用户输入预过滤（明显违规的提前拒绝，节省 LLM 成本）

### 5.5 Prompt 分层与记忆治理

聊天质量治理见 [`spec-034`](../specs/spec-034-chat-quality-memory-prompt-governance.md)。后续 chat prompt 应先构建 `PromptSegment[]`，再组装为 provider messages；`core_identity`、`character_card`、`relationship_state`、`post_history_guard`、`output_format` 是必保留段。`memory_extract` 只提取当前 thread 内的结构化记忆，不跨角色共享用户画像。

## 6. 错误降级

### 6.1 降级链

```
主供应商（OpenAI gpt-4o-mini）调用
   ↓ 失败/超时
备选供应商（Anthropic claude-haiku-4-5）调用
   ↓ 失败/超时
返回友好错误："The character is thinking... please try again in a moment."
不扣用户额度（重试不消耗 quota）
```

### 6.2 错误类型与处理

| 错误 | 处理 |
|------|------|
| 429 rate limit | 重试 1 次（带 backoff）→ 失败则降级 |
| 5xx 服务错误 | 重试 1 次 → 失败则降级 |
| 4xx 配置错误（模型不存在、key 失效） | 不重试，立即降级 + 报警 |
| timeout（> 30s） | 不重试，立即降级 |
| content filter 触发 | 不降级，返回友好"角色不愿继续这个话题"消息 |

### 6.3 监测与报警

- 每次 LLM 调用记录到 D1 `llm_logs` 表（task / provider / model / latency / cost / status）
- admin 看板展示：成功率、平均延迟、每小时成本
- 失败率 > 5% 触发邮件报警 *(暂定)*

## 7. 成本估算

### 7.1 单次对话成本

假设：
- 系统 prompt + 历史 + 用户输入 ≈ 2000 input tokens
- 回应 + 信号 ≈ 300 output tokens

| 模型 | 单次成本 |
|------|---------|
| DeepSeek `deepseek-chat`（fallback / signal 默认） | `2000 × 0.14/1M + 300 × 0.28/1M` ≈ **$0.00036** |
| DeepSeek 配 cache hit（系统 prompt 缓存） | ≈ **$0.000084** |
| MiniMax `MiniMax-M3` | `2000 × 0.30/1M + 300 × 1.20/1M` ≈ **$0.00096** |
| OpenAI `gpt-4o-mini`（备选） | ≈ **$0.0006** |
| Anthropic `claude-haiku-4-5`（备选） | ≈ **$0.0017** |
| Doubao `doubao-1.5-lite-32k` | ≈ **$0.00015**（最低） |

### 7.2 单用户单日成本（用 MiniMax M3 chat 默认）

- 免费用户（30 条/日上限）：$0.00096 × 30 ≈ **$0.029 / 日**
- 订阅用户（重度，假设 200 条/日）：$0.00096 × 200 ≈ **$0.192 / 日**

### 7.3 v1 财务可持续性

- 订阅价 $9.99/月 ≈ $0.33/日
- 重度订阅用户 LLM 成本 $0.192/日 → **LLM 毛利约 42%**
- 免费用户每月 LLM 成本 ≈ $0.87

**转化率盈亏平衡（仅看 LLM 成本，不含 CF/运营/团队）：**
- 100 免费 × $0.87 = $87 LLM 成本
- 需要约 9% 免费转付费即可覆盖
- 大幅低于行业平均（5-10%）

**进一步压缩成本的手段：**
- 如 MiniMax M3 实测成本/质量不理想，将 chat 切回 DeepSeek 或 Doubao-lite
- 启用供应商 context cache（系统 prompt 重复，input 成本可降）
- 历史摘要交给 Cloudflare Workers AI（几乎免费）
- 短对话场景用 Doubao-lite（成本再降一半）
- prompt 紧凑化（去掉冗余 system message）

**结论：** v1 财务仍可控，但 MiniMax M3 比 DeepSeek 路径更贵；需要用 admin usage 持续观察真实每轮输出长度。

## 8. 与现有代码的关系

| 现有代码 | 处理 |
|---------|------|
| `packages/api/src/llm/index.ts`（当前 OpenAI 单一） | **重写为多供应商抽象层** |
| `packages/api/src/llm/admin.ts`（当前有 admin stub） | **保留并完善**（成为 §4 的实现） |
| 硬编码 `gpt-5-mini` | **删除**，替换为 admin 配置 + chat 默认 MiniMax `MiniMax-M3` |
| `wrangler.jsonc` 中 LLM 相关环境变量 | **扩展**：`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`DOUBAO_API_KEY`、`MINIMAX_API_KEY`、`CLOUDFLARE_AI_TOKEN` |

具体改造见 `specs/`。

## 9. 待最终敲定

- [ ] DeepSeek 在海外用户网络的实际抖动测试（如不稳定，需用 Workers Subrequest 走 CF 网络代理）
- [ ] v1 实际集成几个供应商：建议 v1 至少 DeepSeek + OpenAI 两个（保证 fallback 有路径）
- [ ] 各 API key 获取与轮换流程（见 [`ops/secrets.md`](../ops/secrets.md)）
- [ ] 是否启用 DeepSeek context cache（额外节省，但需要稳定的系统 prompt 结构）
- [ ] cost log 是否要异步写（避免阻塞对话流）
- [ ] safety 模块的具体策略（DeepSeek 自带 safety、是否补 OpenAI moderation API 或自建关键词过滤）
