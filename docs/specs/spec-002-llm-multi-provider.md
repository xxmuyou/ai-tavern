# spec-002: LLM 多供应商抽象层

> **类型：** 重写  |  **依赖：** spec-001, spec-003  |  **估时：** 3-5 天  |  **状态：** ⚪ todo

---

## Context

当前 `packages/api/src/llm/` 锁死 OpenAI 单家，且硬编码 `gpt-5-mini`（错误型号）。新方向（[`architecture/llm.md`](../architecture/llm.md)）：

- 多供应商抽象层（MiniMax M3 作为 chat 候选默认，DeepSeek / OpenAI / Anthropic / Doubao / Cloudflare AI 备选）
- admin 在后台切换 task ↔ provider/model
- 不同 task 用不同模型（对话可用 MiniMax M3，信号提取用 DeepSeek，摘要用 CF Workers AI）
- 错误降级（主供应商失败自动 fallback）
- 成本可观测（每次调用记录 token + cost）

本 spec 在 `spec-003` 的 D1 schema reset 完成后执行，必须完整接入 `llm_config` 与 `llm_logs`。不接受先用 console log、hard-coded config 或"后续再接表"作为完成状态。其他供应商（MiniMax / Anthropic / Doubao / Cloudflare AI）接入可在 spec-002.x 子 spec 增量加。

---

## 目标

- 实现 `packages/api/src/llm/` 模块完整结构（按 [`architecture/llm.md §3.2`](../architecture/llm.md#32-模块结构)）
- DeepSeek provider 完整接入（OpenAI 协议兼容）
- OpenAI provider 接入（作为 fallback）
- 统一接口 `LLMRequest` / `LLMResponse`
- 流式响应支持（核心是 chat task）
- structured output 支持（信号提取必需）
- 成本计算（按 provider/model 价目表）
- llm_logs 表的写入接入
- admin 配置存 D1（`llm_config` 表）+ 读取
- 简单 fallback 降级链

## 非目标

- ❌ admin UI（spec-011 做）
- ❌ Anthropic / Doubao / Cloudflare AI 完整接入（v1.x 增量）
- ❌ context cache 优化（v1.x）
- ❌ safety / moderation 中间层（独立 spec）

---

## 改动清单

### A. 文件结构

新建：
```
packages/api/src/llm/
├── types.ts            ← 统一类型
├── router.ts           ← 根据 task + admin 配置选 provider
├── providers/
│   ├── deepseek.ts     ← v1 默认
│   ├── openai.ts       ← v1 fallback
│   └── (anthropic / doubao / cloudflare 留空文件作为占位)
├── prompts/
│   ├── chat.ts         ← 对话 prompt 模板
│   ├── signal.ts       ← 信号提取 schema
│   └── relationship.ts ← 关系叙事化（数值 → 英文）
├── cost.ts             ← 价目表
└── fallback.ts         ← 降级逻辑
```

删除 / 重写：
```
packages/api/src/llm/index.ts         ← 删除，由 router.ts 取代
packages/api/src/llm/admin.ts         ← 保留，调整为读 D1 llm_config 表
```

### B. 类型定义（types.ts）

按 [`architecture/llm.md §3.1`](../architecture/llm.md#31-统一接口)：

```typescript
export type LLMTask = 'chat' | 'signal' | 'summary' | 'character-assist';
export type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'doubao' | 'cloudflare';

export interface LLMRequest { ... }
export interface LLMResponse { ... }
export interface LLMStreamChunk { ... }
export interface ProviderImpl { ... }
```

### C. DeepSeek provider

- 使用 OpenAI 协议（`baseURL: https://api.deepseek.com/v1`）
- 支持 streaming
- 支持 JSON mode（structured output）
- 错误处理：429 / 5xx / timeout

### D. OpenAI provider

- 标准 OpenAI SDK 或 fetch
- 同样 streaming + JSON mode
- 作为 DeepSeek 失败的 fallback

### E. Router

```typescript
async function call(req: LLMRequest): Promise<LLMResponse> {
  const config = await loadConfig(req.task);  // 从 llm_config 表读
  try {
    return await providers[config.provider].call(req, config.model);
  } catch (err) {
    if (config.fallback_provider) {
      log.warn('llm.fallback', { task, primary, fallback });
      return await providers[config.fallback_provider].call(req, config.fallback_model);
    }
    throw err;
  } finally {
    writeLog(...);  // 异步写 llm_logs
  }
}
```

### F. Cost 价目表

`cost.ts` 维护：

```typescript
export const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek:deepseek-chat':       { input: 0.14e-6, output: 0.28e-6 },
  'openai:gpt-4o-mini':           { input: 0.15e-6, output: 0.60e-6 },
  // ...
};

export function estimateCost(provider, model, usage) { ... }
```

### G. 删除硬编码

- 删除所有 `gpt-5-mini` 引用
- 删除任何"OpenAI"硬编码假设
- 业务代码统一通过 `llm.call({ task: 'chat', ... })` 调用

### H. 配置注入

`wrangler.jsonc` env 加 secrets：
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `MINIMAX_API_KEY`
- （其他 provider 留 binding，未来填）

MiniMax M3 作为后续 chat 默认候选接入时复用 OpenAI-compatible provider；base URL 固定使用 `https://api.minimaxi.com/v1`，不要使用 `.io` 域名。

---

## 实施步骤

1. 先完成 spec-001 cleanup 与 spec-003 D1 schema reset
2. 创建分支 `feature/spec-002-llm-multi-provider`
3. 起 `types.ts` / `cost.ts`（无业务依赖，先骨架）
4. 实现 `providers/deepseek.ts`（最小可用：call + stream）
5. 实现 `providers/openai.ts`（同上）
6. 实现 `router.ts`，从 D1 `llm_config` 读取 task → provider/model/fallback 配置
7. 业务代码（chat / signal 等）改为通过 `router.call(...)` 调用
8. 跑通本地 dev：能用 DeepSeek 完成一次对话
9. 写入 `llm_logs`（包含 task / provider / model / status / latency / token / cost / error）
10. 实现缺省配置 seed 读取：若 `llm_config` 缺失必需 task，启动或请求时返回明确配置错误，不静默退回硬编码
11. 集成测试：人为关掉 DeepSeek key 看 fallback 是否触发
12. PR + 审阅 + merge

---

## 验证方式

- [x] DeepSeek 调用：本地 `pnpm dev`，发起一次 chat，DeepSeek 返回正常
- [x] OpenAI fallback：mock DeepSeek 失败，OpenAI 被调用
- [x] 流式响应：SSE chunk 正常
- [x] JSON 输出：signal 字段正确解析
- [x] `pnpm typecheck && pnpm test` 通过
- [x] `grep -rn "gpt-5-mini" packages/api/src/` 输出为空
- [x] cost 估算：日志中能看到合理的 `cost_usd` 数值
- [x] `llm_config` 为空或缺 task 时返回明确错误，不出现隐式 hard-code 线上配置
- [x] `llm_logs` 能在本地 D1 查到成功与失败记录

---

## 回滚

- git revert 即可
- 不新增 D1 schema（依赖 spec-003 已建好的 `llm_config` / `llm_logs`）
- 但有可能阻塞 chat 端点 —— 回滚前确保 fallback 至少 OpenAI key 有效

---

## 依赖

- ⬅️ 阻塞于：spec-001、spec-003
- ➡️ 阻塞：spec-006（chat 重写）、spec-011（admin 端点）

---

## 注意

- DeepSeek 在海外用户网络可能抖动 —— 上线后监测；若问题严重，考虑 CF Workers Subrequest 代理或换 fallback
- OpenAI / DeepSeek 的 JSON mode 行为略有差异（DeepSeek 的 strict mode 较新），prompt 模板需测试两个 provider 都通过
- 不要在 client 端引用任何 LLM key（绝对不要）
