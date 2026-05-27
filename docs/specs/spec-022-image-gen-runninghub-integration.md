# spec-022: Image Gen Provider — RunningHub Integration

> **类型：** 新建  |  **依赖：** spec-020, spec-021  |  **估时：** 3-5 天（不含 workflow 搭建周期）  |  **状态：** 📝 draft

---

## Context

[`spec-020`](./spec-020-companion-emotion-art-generation.md) 完成了 companion emotion art 生成的后端核心链路（jobs 表、queue consumer、`ImageGenProvider` 抽象、admin / system 端点），但目前只接了 mock provider —— mock 把 neutral 图原样复制到所有 5 个非 neutral emotion，仅用于跑通链路，不产生真实表情变化。

本 spec 把第一个**真实** image generation provider 接入：**RunningHub**（https://www.runninghub.ai/）。RunningHub 是一个托管 ComfyUI workflow 的云平台，提供 API 远程调用、按 RH Coins 计费、支持 image-to-image + 自定义节点参数覆盖，适合本项目对"角色一致性 + 可控 prompt + 多模型试错"的需求。

为什么选 RunningHub 作为首个 provider：

- **ComfyUI workflow 自由度**：可以用 IPAdapter / InstantID / ControlNet 等节点组合，把角色一致性方案做进 workflow，而不是依赖 API 厂商黑箱
- **成本可控**：消费版按 RH Coins 计费，企业版可洽谈
- **多模型并存**：同账户可挂多个 workflow（不同风格 / 不同质量档），后端通过 `workflowId` 切换
- **异步 webhook**：避免 Worker 占用 CPU 长轮询

本 spec **不替换 mock**。mock 留作本地开发 + CI 默认，runninghub 通过 env 切换启用，便于 staging / production 分别配置。

---

## 目标 / 非目标

### 目标

- 在 spec-020 的 `ImageGenProvider` 抽象下实现首个真实 provider `RunningHubImageGenProvider`
- 通过环境变量 `IMAGE_GEN_PROVIDER` 在 mock / runninghub 之间切换，默认 mock
- 通过 R2 签名 URL 把 neutral 图安全分发给 runninghub，无需公开 bucket
- 通过 webhook 异步接收任务结果，写回 R2 和 DB；不依赖长轮询
- 提供 cron 兜底，避免 webhook 丢失导致 job 永久 `processing`
- 失败路径与 spec-020 的 `markFailed` 复用，spec-021 落地后接退款

### 非目标

- ❌ 不替换 mock provider
- ❌ 不做多 provider 同时启用 / 路由 / 故障转移（仅二选一切换）
- ❌ 不做积分价格定档（属 spec-021）
- ❌ 不实现 workflow 本身（属 runninghub 网页上的人工 + 美术工作）
- ❌ 不做按模型 / 按风格的 workflow 路由（一期一个 workflowId）
- ❌ 不接入除 runninghub 之外的 provider

---

## 改动清单

### A. Workflow 能力清单（**本 spec 的核心交付物之一**）

实施前提：在 RunningHub 网页上搭出一个满足以下能力的 ComfyUI workflow，并跑通至少一次（RunningHub 要求 workflow 必须有过一次成功执行才能被 API 调用）。

#### A.1 输入节点

| 节点用途 | 节点类型示例 | 后端如何使用 |
|---|---|---|
| 加载 neutral 图 | `LoadImageFromURL` 或同等 | 通过 `nodeInfoList` 把 `fieldValue` 覆盖为短期签名 URL |
| Positive prompt | `CLIPTextEncode` 或同等 | 通过 `nodeInfoList` 把 `text` 覆盖为 spec-020 §E 的 emotion-specific prompt |
| Negative prompt | `CLIPTextEncode` 或同等 | workflow 内置默认值，后端**不覆盖** |
| Seed | `KSampler` / `RandomNoise` | 可选；后端可固定 seed 保证可复现，或留空让 workflow 随机 |

#### A.2 处理能力（保证角色一致性）

workflow 必须包含以下能力中至少**一项**用于人脸 / 角色一致性，**至少一项**用于姿态 / 构图保持：

- **角色一致性**：IPAdapter / InstantID / FaceID / Reference Only
- **构图保持**：ControlNet（OpenPose / Depth / Canny / Reference Only）

模型 + LoRA 选型留给 workflow 搭建阶段决定，要求覆盖二次元 + 半写实 + 写实三档（如果一个 workflow 难以兼容，再开第二个 workflow，通过 companion 字段路由的能力留到后续 spec）。

#### A.3 输出节点

- 使用 `SaveImageWithoutMetadata` 节点（runninghub 官方建议，避免 workflow 元数据写入图片 EXIF 泄露给下游）
- 输出格式 webp 或 png 均可；后端按 HTTP `content-type` 头探测
- 输出分辨率与 neutral 图一致或 1024×1024，由 workflow 决定

#### A.4 workflow 验收测试

workflow 搭建完成后必须用以下样本通过肉眼验收：

- 5 类不同风格的 neutral 图（少年 / 御姐 / 大叔 / 萝莉 / 中性）× 5 个 emotion = 25 张
- **一致性**：同一 neutral + 同一 prompt 多次跑，脸 / 发型 / 服装 / 镜头基本保持
- **表情区分度**：5 个 emotion 表情明显可辨（warm vs guarded vs annoyed 不能糊在一起）
- **性能**：单次 workflow 执行 ≤ 30 秒为目标，超过考虑换模型 / 简化节点

#### A.5 交付清单（workflow 搭好后填回）

- `workflowId`（runninghub 平台分配）
- 各可覆盖节点的 `nodeId`：
  - `LOAD_IMAGE_NODE_ID`
  - `POSITIVE_PROMPT_NODE_ID`
- 验收测试样本截图（5×5）

### B. API 集成规格

#### B.1 Endpoints

| Endpoint | 用途 | 状态 |
|---|---|---|
| `POST https://www.runninghub.ai/task/openapi/create` | 创建任务（路径推测，**待客服确认**） | OPEN |
| `POST https://www.runninghub.ai/task/openapi/status` | 任务状态查询（路径推测，**待客服确认**） | OPEN |
| `POST https://www.runninghub.ai/task/openapi/retryWebhook` | 重发 webhook 事件 | ✅ 已知 |

#### B.2 认证

```
Authorization: Bearer ${RUNNINGHUB_API_KEY}
Host: www.runninghub.ai
Content-Type: application/json
```

`RUNNINGHUB_API_KEY` 是 32 位字符串，在 RunningHub 网页右上角个人菜单查看；走 Cloudflare Worker secret，不入仓库。

#### B.3 创建任务请求体（推测，待客服确认）

```json
{
  "apiKey": "...",
  "workflowId": "...",
  "nodeInfoList": [
    { "nodeId": "<LOAD_IMAGE_NODE_ID>", "fieldName": "url", "fieldValue": "<signed neutral url>" },
    { "nodeId": "<POSITIVE_PROMPT_NODE_ID>", "fieldName": "text", "fieldValue": "<emotion prompt>" }
  ],
  "webhookUrl": "https://api.<our-domain>/webhooks/runninghub"
}
```

#### B.4 响应（推测）

```json
{
  "code": 0,
  "msg": "",
  "data": { "taskId": "..." }
}
```

任务异步。立即返回 `taskId`；最终结果通过 webhook 推送或 status 接口拉取。

#### B.5 已知错误码

| 错误码 | 含义 | 后端归类 |
|---|---|---|
| `APIKEY_INVALID_NODE_INFO` | workflow 未成功跑过 / nodeId 无效 | `provider_config_error`（不可重试） |
| 其它 | **待客服补充** | 默认 `provider_error`（可重试） |

### C. 后端代码改动

#### C.1 新建 `packages/api/src/image-gen/runninghub-provider.ts`

实现 `ImageGenProvider` 接口。`generate()` 内：

1. 读 env 配置（apiKey、workflowId、节点 id 映射、webhookUrl）；缺失任一抛 `ImageGenError("provider_not_configured", retryable=false)`
2. 用 `signed-url.ts` 把 `source_art_url` 转成短期签名 URL
3. 拼接 `nodeInfoList`：load-image 节点覆盖 URL，positive-prompt 节点覆盖 emotion prompt
4. `POST .../task/openapi/create` 创建任务，收到 `taskId`
5. **不下载图、不写 R2、不标 succeeded**；返回特殊结果让 consumer 知道"已委托给 runninghub，等 webhook"

> **架构调整**：spec-020 的 consumer 模式是"调 provider 直到拿到图 bytes 然后写 R2 标 succeeded"。runninghub 是异步的，无法在 consumer 单次执行内完成。两个选择：
> - 方案 1：consumer 调 `create`，把 `taskId` 写入 `companion_art_jobs.external_task_id`，job 留在 `processing`，ack 消息，等 webhook
> - 方案 2：consumer 调 `create` + 内部 setTimeout 轮询（Worker CPU 受限，不推荐）
>
> **采用方案 1**。需要给 `companion_art_jobs` 表加一列 `external_task_id TEXT`（小迁移）。

#### C.2 修改 `packages/api/src/image-gen/index.ts`

```ts
export function getImageGenProvider(env: Env): ImageGenProvider {
  switch (env.IMAGE_GEN_PROVIDER) {
    case "runninghub":
      return new RunningHubImageGenProvider();
    case "mock":
    default:
      return new MockImageGenProvider();
  }
}
```

#### C.3 修改 `packages/api/src/companions/art-consumer.ts`

- provider 返回特殊 sentinel `{ async: true, external_task_id }` 时：
  - 把 `external_task_id` 写入 job 行
  - 保持 job 状态 `processing`
  - ack queue 消息（任务已成功委托）
- provider 返回正常 `{ image_bytes, content_type, ... }` 时：走 spec-020 既有路径（mock 仍走这条）

#### C.4 新建 `packages/api/src/image-gen/signed-url.ts`

封装短期 URL 签发：

- 优先使用 Cloudflare R2 原生 presign（需要核实 worker R2 binding 是否支持；**OPEN QUESTION**）
- 兜底自建路由 `/objects/signed/{key}?token=<hmac>&exp=<unix>`，在 worker 入口验签
- 默认 15 分钟有效

#### C.5 新建 `packages/api/src/webhooks/runninghub.ts`

- 端点：`POST /webhooks/runninghub`
- 验证签名 / secret query param（**机制待客服确认**；最低要求是匹配 `RUNNINGHUB_WEBHOOK_SECRET`）
- 按 webhook payload 提取 `taskId` 和结果图 URL（**字段名待确认**）
- 用 `taskId` 查 `companion_art_jobs.external_task_id` 找到对应 job
- 下载结果图 → 写 R2 → 更新 `companions.art_emotions[emotion]` → 标 job succeeded
- 失败 payload：标 job failed
- 复用 `art-consumer.ts` 的 `markFailed` 和 succeeded 落地逻辑（重构成共享 helper）

#### C.6 修改 `packages/api/src/index.ts`

注册 webhook 路由（早于一般路由，因为是公开端点）。

#### C.7 修改 `wrangler.jsonc`

新增配置：

```jsonc
{
  "vars": {
    "IMAGE_GEN_PROVIDER": "mock",
    "RUNNINGHUB_WORKFLOW_ID": "",
    "RUNNINGHUB_LOAD_IMAGE_NODE_ID": "",
    "RUNNINGHUB_PROMPT_NODE_ID": ""
  }
}
```

secrets（不入仓库，`wrangler secret put`）：

- `RUNNINGHUB_API_KEY`
- `RUNNINGHUB_WEBHOOK_SECRET`
- `R2_SIGNING_KEY`（若走自建签名路由）

#### C.8 新增 migration

`packages/api/migrations/0016_companion_art_jobs_external_task_id.sql`：

```sql
ALTER TABLE companion_art_jobs ADD COLUMN external_task_id TEXT;
CREATE INDEX idx_companion_art_jobs_external_task_id ON companion_art_jobs(external_task_id);
```

#### C.9 Cron 兜底（防止 webhook 丢失）

新增 Cloudflare Cron Trigger（5 分钟一次）`packages/api/src/scheduled/art-job-poll.ts`：

- 扫描 `status = 'processing' AND updated_at < now - 5min AND external_task_id IS NOT NULL`
- 调 runninghub status 接口确认任务状态
- 状态终结（成功 / 失败）则走 webhook 同款落地逻辑
- 超过 15 分钟仍 processing 标 failed `code=timeout`

`wrangler.jsonc` 增加：

```jsonc
{
  "triggers": { "crons": ["*/5 * * * *"] }
}
```

### D. 安全与风控

- **签名 URL**：15 分钟有效；一次性 token 可选；只允许 GET
- **webhook 验证**：必须 secret 匹配 + 任务 id 存在于 DB；不信任 payload 里的 emotion / companion_id
- **结果图大小限制**：下载时设 max body size（≤ 10MB），防 OOM
- **失败重试**：runninghub 任务失败不自动重试 runninghub（避免烧 RH Coins）；标 failed 让用户 / admin 显式重试
- **审计日志**：每次 runninghub 调用记录 `request_id` + `cost` (如响应有 RHC 字段) + `duration`，供运营评估
- **prompt safety**：spec-020 §G 的基础约束不变；本 spec 不引入新的 prompt filter

### E. 与 spec-020 / spec-021 的对接点

- **spec-020**：本 spec 是 spec-020 §D step 6 "provider 返回图片后" 的具体实现路径
- **spec-021**：实施 spec-021 后，本 spec 的 webhook 成功 / 失败分支需调用 spec-021 的 `commitReservation` / `releaseReservation`；本 spec 范围内 admin / system 任务仍 bypass

---

## 实施步骤

> **前置**：本 spec **不能仅靠写代码完成**。前 2 步是阻塞性人工 / 通信任务。

1. **联系 runninghub 客服**（`jason@runninghub.ai`）落实 Open Questions 1-4
2. **搭建 workflow** 并按 §A.4 通过验收；填回 §A.5 交付清单
3. 新增 migration 0016 增 `external_task_id` 列
4. 实现 `signed-url.ts`（先 R2 原生 presign，落不通走自建路由）
5. 实现 `runninghub-provider.ts` + env 切换 + wrangler.jsonc 配置
6. 实现 `/webhooks/runninghub` 路由 + 签名验证
7. 重构 `art-consumer.ts` 支持 async 委托结果 + 把 succeeded / failed 落地路径抽成 helper 供 webhook 复用
8. 配置 Cloudflare Cron Trigger 兜底轮询
9. dev 环境端到端验证（admin prewarm 一个 official companion，跑通 5 个 emotion）
10. spec-021 落地后，开放普通用户端点，把 501 改为正常流程
11. 将 spec 状态从 📝 draft 推到 🟡 in-progress → 🟢 done

---

## 验证方式

### 单元 / 集成

- `IMAGE_GEN_PROVIDER=mock` 时既有 322 个测试全过（行为不变）
- runninghub provider 单元测试：mock fetch，验证请求体结构 / 节点 id 注入 / 签名 URL 替换
- webhook 端点单元测试：错 secret 拒绝、未知 taskId 拒绝、正常路径落地 R2 + DB

### 端到端（dev 环境）

1. 配置 `IMAGE_GEN_PROVIDER=runninghub` + `RUNNINGHUB_API_KEY` + `RUNNINGHUB_WORKFLOW_ID` + 节点 id 映射
2. 对一个有 neutral 图的 companion 调 `POST /admin/companions/{id}/emotion-art/prewarm`
3. 预期：5 个 job 创建，每个写入 `external_task_id`，状态 `processing`
4. 等 ≤ 5 分钟，webhook 应陆续触发，5 个 job 全部 succeeded
5. R2 存在 5 个 emotion 输出 key；`companions.art_emotions` 含 6 个 key
6. 肉眼验收：5 张图角色一致、表情可辨

### 失败路径

- apiKey 错 → `provider_config_error`（不重试）
- workflowId 错 → `APIKEY_INVALID_NODE_INFO`（不重试）
- webhook 不可达 → 5 分钟后 cron 兜底拉 status
- 15 分钟仍 processing → 标 failed `code=timeout`
- webhook 端点拒绝无签名 / 错签名请求

---

## 回滚

- **代码回滚**：切回 `env.IMAGE_GEN_PROVIDER=mock`，链路恢复 mock 行为；runninghub 模块代码保留不删
- **migration 回滚**：`external_task_id` 列保留即可（mock 不写，不影响）；如需删列 D1 不直接支持 DROP COLUMN，重建表代价大，不建议
- **R2**：已生成图保留不删
- **runninghub 端**：可在 runninghub 平台禁用 webhook URL，停止账户费用

---

## 依赖

- [`spec-020`](./spec-020-companion-emotion-art-generation.md)：provider 抽象、jobs 表、queue consumer、admin 端点
- [`spec-021`](./spec-021-credits-ledger-and-metering.md)：积分账本（实施完成后开放普通用户）

---

## Open Questions

实施阶段必须落实以下 7 项；落实方式见 §实施步骤 step 1-2。

1. **workflow 注册流程**：用户 / 客服去搭符合 §A 的 workflow，跑通至少一次，回填 `workflowId` 和各可覆盖节点 `nodeId`
2. **webhook 注册方式**：创建 task 时带 `webhookUrl`，还是 workflow / 账户级全局设置？联系 `jason@runninghub.ai`
3. **webhook payload 结构**：`taskId`、`status`、`outputs`、`imageUrl` 字段的确切名字 / 层级
4. **webhook 签名验证**：runninghub 是否提供 HMAC 签名头？若无则走 secret query param + 白名单 IP
5. **R2 presigned URL**：本项目 R2 binding 是否支持原生 presign？还是必须自建签名路由
6. **价格 / 并发**：消费版 RH Coins 单次表情图生成约多少 RHC？企业版定价？影响 spec-021 积分定档
7. **失败时 RH Coins 退款策略**：runninghub 任务失败是否退还 RHC？影响 spec-021 退款逻辑

---

## 信息来源

- [RunningHub 首页](https://www.runninghub.ai/)
- [Instructions for Use](https://www.runninghub.ai/runninghub-api-doc-en/doc-8287463)
- [About Enterprise ComfyUI API](https://www.runninghub.ai/runninghub-api-doc-en/doc-8287465)
- [Resend Specific Webhook Event](https://www.runninghub.ai/runninghub-api-doc-en/api-425761036)
- [RunningHUB API Node Documentation (ComfyUI-WBLESS)](https://comfyai.run/documentation/RunningHUB%20API)
- [comfyui_qwen_runninghub on GitHub](https://github.com/marduk191/comfyui_qwen_runninghub)
