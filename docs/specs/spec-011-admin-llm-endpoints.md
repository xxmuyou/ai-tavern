# spec-011: Admin LLM Endpoints

> **类型：** 新建  |  **依赖：** spec-002  |  **估时：** 2 天  |  **状态：** 🟢 done

---

## Context

[`architecture/llm.md`](../architecture/llm.md) 指出 admin 需要在运行时切换 task ↔ provider/model，不希望每次微调路由都重新部署。spec-002 落地 `llm_config` 表与 LLM router 后，admin 仍需 HTTP 接口来：

- 读写 `llm_config`（切换某个 task 的 provider/model/fallback）
- 试验新组合（"先试通了再保存"，避免改完直接打到真实用户）
- 看 token / cost 余额（哪个 task 哪个 provider 烧了多少钱）

本 spec 给出这组端点。**只做后端 API**，admin UI 推迟到独立 spec。鉴权沿用 spec-009 的 `requireAdminUser`（来源 `env.ADMIN_EMAILS`），暂不接 `admin_users` 表。

---

## 关键决策（开工前已敲定）

1. **admin 只能 update 已有 task，不能增删 task**：task 列表由 spec-002 启动 seed 决定，与代码常量绑定；增删 = 改代码。
2. **试调用 (`POST /admin/llm/test`) 不写 `llm_logs`**：避免 admin 调试污染生产统计。
3. **试调用支持 provider/model override**：admin 工作流是"先试 → 试通了再 PUT 保存"，比"先 PUT → 再试 → 不行回滚"安全。
4. **usage 端点不返回 raw log 行，只返回聚合**：raw 错误日志看 Cloudflare 后台。
5. **鉴权用 `env.ADMIN_EMAILS`，不接 `admin_users` 表**：表接入由独立 spec 启动；本 spec 只复用 spec-009 的 `requireAdminUser`。
6. **usage 时间窗默认 7 天**：支持 `?window=today|7d|30d`。

---

## 目标

- 4 个 HTTP 端点：
  - `GET    /admin/llm/config`
  - `PUT    /admin/llm/config/:task`
  - `POST   /admin/llm/test`
  - `GET    /admin/llm/usage`
- 全部走 `requireAdminUser` 守卫
- `test` 端点调用 spec-002 的 LLM router，但绕过 `llm_logs` 写入
- `usage` 端点直接对 `llm_logs` GROUP BY 聚合，不缓存
- 错误码可枚举，不暴露 SQL / 堆栈

## 非目标

- ❌ admin UI（前端推迟到独立 spec，本 spec 仅靠 curl 验证）
- ❌ `admin_users` 表接入（继续用 `env.ADMIN_EMAILS`）
- ❌ test 端点流式响应（同步返回，不走 SSE）
- ❌ 增删 task 类型（task 列表由代码常量决定）
- ❌ Raw log 查询端点（看 Cloudflare 后台）
- ❌ Cost 预算告警 / 触发限流（独立 spec）
- ❌ 调用频次限流（admin 自用，量很小，沿用全局 IP 限频即可）

---

## 改动清单

### A. 路由 dispatch

`packages/api/src/index.ts` 现有 `/admin/llm/*` 前缀已预留。spec-002 实施完成后，在本 spec 实施时把 4 个端点分派到 `packages/api/src/llm/admin.ts`：

```ts
if (pathname === "/admin/llm/config" && method === "GET") return handleListConfig(request, env);
const cfgMatch = pathname.match(/^\/admin\/llm\/config\/([^/]+)$/);
if (cfgMatch && method === "PUT") return handleUpdateConfig(request, env, cfgMatch[1]!);
if (pathname === "/admin/llm/test" && method === "POST") return handleTest(request, env);
if (pathname === "/admin/llm/usage" && method === "GET") return handleUsage(request, env);
```

### B. 鉴权

所有 handler entry 第一行：

```ts
const adminUser = await requireAdminUser(env, request);
```

- 无 Bearer / token 无效 → `requireAdminUser` 抛 401 `auth_required`
- 登录但不在 `env.ADMIN_EMAILS` 内 → 抛 403 `admin_required`
- 通过则 `adminUser` 为 `UserRecord`，用于写 `llm_config.updated_by`

### C. 端点契约

#### C.1 `GET /admin/llm/config`

读 `llm_config` 全表，join `users` 表把 `updated_by` 解成 email。

**Response 200：**

```json
{
  "tasks": [
    {
      "task": "chat",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "fallback_provider": "openai",
      "fallback_model": "gpt-4o-mini",
      "updated_at": "2026-05-20T10:00:00.000Z",
      "updated_by": "admin@aiappsbox.com"
    }
  ]
}
```

- `updated_at` 用 ISO 字符串（与 spec-009 session response 一致）
- `updated_by` 若为 NULL（spec-002 seed 时无 user）返回 `null`
- 表为空：`tasks: []`（不报错；spec-002 必须 seed 默认配置避免该分支）

#### C.2 `PUT /admin/llm/config/:task`

**Request body：**

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "fallback_provider": "deepseek",
  "fallback_model": "deepseek-chat"
}
```

校验：

- `:task` 必须已存在于 `llm_config`，否则 404 `task_not_found`
- `provider` / `model` 必填、非空 string，且 `provider` ∈ `KNOWN_PROVIDERS`、`model` ∈ `KNOWN_MODELS[provider]`（来自 spec-002 export，见 D 节）。否则 400 `unknown_provider` / `unknown_model`
- `fallback_provider` / `fallback_model` 可选；必须同时传或同时不传（半边 → 400 `invalid_fallback`）。若传了，同样要过 `KNOWN_*` 校验
- 写入：

```sql
UPDATE llm_config
SET provider = ?, model = ?, fallback_provider = ?, fallback_model = ?,
    updated_at = ?, updated_by = ?
WHERE task = ?
```

`updated_at` 写 unix ms，`updated_by` 写 `adminUser.id`。

**Response 200：** 与 C.1 单行格式一致（返回更新后行）。

#### C.3 `POST /admin/llm/test`

**Request body：**

```json
{
  "task": "chat",
  "prompt": "你好",
  "provider": "deepseek",
  "model": "deepseek-r1"
}
```

校验：

- `task` 必填，必须存在于 `llm_config`（否则 404 `task_not_found`）
- `prompt` 必填、非空 string、≤ 4 KB（utf-8 字节）。空 → 400 `prompt_required`；超长 → 400 `prompt_too_large`
- `provider` + `model` 可选，但必须**成对出现**（要么都不传，要么都传）：
  - 都不传 → 用 `llm_config` 当前配置
  - 都传 → 用 override，且各自要过 `KNOWN_*` 校验
  - 只传一个 → 400 `invalid_override`

调用：

```ts
const result = await invokeLlm(env, {
  task: body.task,
  prompt: body.prompt,
  providerOverride: hasOverride ? { provider, model } : undefined,
  dryRun: true,           // 跳过 llm_logs 写入
  userId: adminUser.id,   // 仍传，供 spec-002 路由内部日志（非 llm_logs）
});
```

**Response 200（成功）：**

```json
{
  "ok": true,
  "text": "你好！有什么可以帮你的？",
  "provider": "deepseek",
  "model": "deepseek-r1",
  "tokens": { "input": 10, "output": 18 },
  "cost_usd": 0.00012,
  "latency_ms": 824
}
```

**Response 200（provider 调用失败，仍 ok:false）：**

```json
{
  "ok": false,
  "provider": "deepseek",
  "model": "deepseek-r1",
  "error_code": "provider_request_failed",
  "error_message": "deepseek_api: 401 invalid_api_key",
  "latency_ms": 123
}
```

> ⚠️ provider 失败用 `200 ok:false` 而**不**是 4xx/5xx——admin 试调用就是为了看哪里出问题，500 会丢失上下文。本端点的 4xx 只用于"请求本身格式错"（prompt 缺失、未知 provider 等）。

#### C.4 `GET /admin/llm/usage`

**Query string：**

- `window`: `today` | `7d`（默认） | `30d`
  - `today`: from = 今日 00:00:00 UTC，to = now
  - `7d`: from = now - 7 × 24h，to = now
  - `30d`: from = now - 30 × 24h，to = now
- 其他值 → 400 `invalid_window`

**Response 200：**

```json
{
  "window": "7d",
  "from": "2026-05-14T00:00:00.000Z",
  "to": "2026-05-21T00:00:00.000Z",
  "totals": {
    "calls": 248,
    "token_input": 120000,
    "token_output": 50000,
    "cost_usd": 1.34,
    "error_calls": 2
  },
  "by_task_provider": [
    {
      "task": "chat",
      "provider": "deepseek",
      "calls": 230,
      "token_input": 100000,
      "token_output": 40000,
      "cost_usd": 1.10,
      "error_calls": 2
    }
  ]
}
```

**SQL（两次查询）：**

```sql
-- totals
SELECT
  COUNT(*) AS calls,
  COALESCE(SUM(token_input), 0)   AS token_input,
  COALESCE(SUM(token_output), 0)  AS token_output,
  COALESCE(SUM(cost_usd), 0)      AS cost_usd,
  SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS error_calls
FROM llm_logs
WHERE created_at >= ? AND created_at < ?;

-- by_task_provider
SELECT
  task, provider,
  COUNT(*) AS calls,
  COALESCE(SUM(token_input), 0)   AS token_input,
  COALESCE(SUM(token_output), 0)  AS token_output,
  COALESCE(SUM(cost_usd), 0)      AS cost_usd,
  SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS error_calls
FROM llm_logs
WHERE created_at >= ? AND created_at < ?
GROUP BY task, provider
ORDER BY cost_usd DESC;
```

`provider` 字段是 `llm_logs` 里写的**实际命中** provider（可能是 fallback），不是 `llm_config.provider`。这样 admin 能看到 fallback 触发情况。

D1 容量：spec-002 设计的 `llm_logs` 30 天后归档 R2；本 spec usage 端点最多查 30d，行数可控。

### D. 与 spec-002 的接口契约（spec-002 实施时必须提供）

本 spec 实施前提是 spec-002 export 以下符号；如 spec-002 未提供，需先补：

```ts
// packages/api/src/llm/types.ts
export const KNOWN_PROVIDERS = ["openai", "deepseek", "anthropic", "doubao", "cloudflare"] as const;
export type KnownProvider = typeof KNOWN_PROVIDERS[number];
export const KNOWN_MODELS: Record<KnownProvider, readonly string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", /* ... */],
  deepseek: ["deepseek-chat", "deepseek-r1", /* ... */],
  // ...
};

// packages/api/src/llm/router.ts
export type LLMRequest = {
  task: string;
  prompt: string;
  providerOverride?: { provider: string; model: string };
  dryRun?: boolean;     // true = 跳过 llm_logs 写入
  userId?: string;      // 供 router 内部日志记录
};

export type LLMResponse = {
  text: string;
  provider: string;     // 实际命中 provider
  model: string;
  tokens: { input: number; output: number };
  costUsd: number;
  latencyMs: number;
};

export async function invokeLlm(env: Env, req: LLMRequest): Promise<LLMResponse>;

// packages/api/src/llm/repository.ts
export type LlmConfigRecord = {
  task: string;
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
  updated_at: number;        // unix ms
  updated_by: string | null; // users.id
};

export async function listLlmConfig(env: Env): Promise<LlmConfigRecord[]>;
export async function getLlmConfig(env: Env, task: string): Promise<LlmConfigRecord | null>;
export async function updateLlmConfig(env: Env, task: string, input: {
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
  updated_by: string;
  now: number;
}): Promise<LlmConfigRecord>;
```

> spec-011 实施时若发现 spec-002 没给上述某些符号，应在本 spec PR 里补，并同步回填 spec-002 文档。

### E. 错误码枚举

| code | HTTP | 触发 |
|------|------|------|
| `auth_required` | 401 | 无 Bearer / token 失效（来自 spec-009 guard） |
| `admin_required` | 403 | 登录但非 admin（来自 spec-009 guard） |
| `method_not_allowed` | 405 | 端点存在但方法不对 |
| `task_not_found` | 404 | `:task` 不在 `llm_config` |
| `unknown_provider` | 400 | provider 不在 `KNOWN_PROVIDERS` |
| `unknown_model` | 400 | model 不在 `KNOWN_MODELS[provider]` |
| `invalid_fallback` | 400 | PUT 时 fallback 半边 |
| `invalid_override` | 400 | test 时 provider/model override 半边 |
| `prompt_required` | 400 | test 端点 prompt 为空 |
| `prompt_too_large` | 400 | test 端点 prompt > 4 KB |
| `invalid_window` | 400 | usage 端点 window 不在枚举 |
| `provider_request_failed` | 200 (ok:false) | test 端点：provider 调用失败 |

错误响应格式（除 test 端点失败的 200 ok:false 外）：

```json
{ "error": "task_not_found" }
```

不暴露 SQL 错误、堆栈、内部异常文本。

---

## 实施步骤

> 本节在 spec-002 完成后执行。spec-002 必须先 export D 节列出的符号。

1. **新增 `packages/api/src/llm/admin.ts`**，按 C 节实现 4 个 handler（`handleListConfig` / `handleUpdateConfig` / `handleTest` / `handleUsage`）。
2. **`packages/api/src/index.ts`** 把 `/admin/llm/*` 分派到 `admin.ts`（按 A 节四条 if/match）。
3. **核对 spec-002 export**：`KNOWN_PROVIDERS` / `KNOWN_MODELS`、router 支持 `dryRun` 与 `providerOverride`、`llm/repository.ts` 提供 config CRUD。缺哪个补哪个，并回填 spec-002 文档。
4. **单元测试 `packages/api/src/llm/admin.test.ts`**（参考 spec-009 `auth/*.test.ts` 模式：in-memory DB mock + invokeLlm mock）：
   - `GET config`：空表、有数据、updated_by join users 邮箱
   - `PUT config`：成功、task 不存在 404、未知 provider 400、fallback 半边 400、updated_by 写入正确 user.id
   - `POST test`：成功、provider 失败返回 ok:false、prompt 校验、override 生效、dryRun=true 不写 llm_logs（spy invokeLlm 调用参数）
   - `GET usage`：各 window、空表 totals=0、多 task GROUP BY、error_calls 计数
   - 鉴权：401 / 403 / 200 三档（复用 spec-009 已验证的 guard）
5. **手测脚本**：在 `docs/ops/runbook.md` 加一节 "Admin LLM endpoints 手测"，列 4 个端点的 curl 成功 + 失败示例。
6. **文档同步**：
   - `docs/architecture/api.md` 加 4 个端点说明
   - `docs/specs/README.md` 把 spec-011 状态从 "待办（stub）" 改为 "🟢 done"

---

## 验证方式

实施完成后逐条核对：

- [ ] 单元测试全部通过
- [ ] `pnpm --filter @xtbit/api typecheck` 干净
- [ ] curl 走通 4 个端点（admin token / 非 admin token / 无 token 三种情况）
- [ ] `PUT` 后 `GET` 看到变化、`updated_by` 是 admin 邮箱、`updated_at` 是新时间
- [ ] `POST test` override 不写 `llm_logs`（前后查 `llm_logs` 行数不变）
- [ ] `POST test` provider 失败时返回 `200 ok:false`，`error_code` / `error_message` 有内容
- [ ] `GET usage` 与 D1 手算 `SUM` 一致；`window=today / 7d / 30d` 边界正确
- [ ] `GET usage` 在 `by_task_provider` 里把 fallback 触发归到实际命中 provider（不是 config 配置的那个）
- [ ] 非 admin 邮箱（不在 `env.ADMIN_EMAILS`）调任一端点返回 403 `admin_required`

---

## 回滚

- 单 commit 删除：`llm/admin.ts`、`llm/admin.test.ts`、`index.ts` 中的 4 条 dispatch、`api.md` / `runbook.md` 的相关章节
- 不动 schema、不动 `llm_config` 数据
- 用户侧无感（这组端点纯 admin 用）
- 若已通过 PUT 改过 `llm_config`，回滚后 admin 无法再通过 HTTP 改配置，但已写入的值保留；如需恢复默认，手动跑 `wrangler d1 execute` 改回

---

## 依赖

- ⬅️ 阻塞：**spec-002**（必须先 export `KNOWN_PROVIDERS` / `KNOWN_MODELS`、router 支持 `dryRun` + `providerOverride`、`llm/repository.ts` 提供 config CRUD；见 D 节）
- ⬅️ 软依赖：spec-009（`requireAdminUser` 守卫；已 done）
- ➡️ 解锁：admin UI spec（独立 spec，消费本 spec 的 4 个端点）
- 与 spec-010（billing）无交叉
