# spec-022: Image Gen Provider — RunningHub Integration

> **类型：** 新建  |  **依赖：** spec-020, spec-021  |  **估时：** 3-5 天（不含 workflow 搭建周期）  |  **状态：** 🟡 in-progress（WF-1 create 文生图切片已落地：通用 `image_generation_jobs` 表 + provider `create` 模式 + base-art 端点 + webhook/cron 识别 + 前端生成面板；待 RunningHub 回填 workflowId/promptNodeId 后端到端验证。WF-2 variation / WF-3 edit 仍待做）

> **重构（2026-06-02 修正）：「checkpoint catalog + workflow catalog + binding」统一结构。** 生图配置从「按写死 style 枚举」和错误的「model 自带 workflow/fieldName」收敛为三层（仅 RunningHub；OpenAI/mock 不受影响）：
> - **checkpoint/model 是独立目录。** `image_models` 只保存 `label` / `tag` / `ckpt_name` / active / 排序，用于命名、分类、管理 RunningHub 已上传 checkpoint。
> - **workflow 拥有节点接线。** `image_workflows` 保存 `workflowId` / `promptNodeId` / `checkpointNodeId` / `checkpointFieldName` / `loadImageNodeId`。`checkpointFieldName` 属于 workflow，默认 `ckpt_name`。
> - **workflow 与 checkpoint 多对多绑定。** `image_workflow_models` 决定某条 create workflow 可选哪些 checkpoint；同一个 checkpoint 可复用于多个 workflow。
> - **配置文件只做 seed。** `config/runninghub-workflows.<env>.json` 可声明默认 `checkpoints[]` 和 `workflows{}`，同步脚本 upsert 到 D1；运行时和 Admin 均读 DB catalog。
> - 生图请求 `ImageGenRequest`：`style?: ArtStyle` → `workflow_key?: string` + `ckpt_name?: string`；`checkpoint_field_name` 只允许来自 workflow 解析结果（详见 §C.0）。
>
> 下文历史小节中按 `style` 选 workflow、per-style `ckptName`/`checkpointFieldName` 的描述均已被本结构取代，保留作演进背景。

> **本期落地偏差（v1 WF-1 create 切片）：**
> - 仅 `create`（txt2img）路径落地。provider 覆盖 **prompt 节点**；**checkpoint 切换已落地**：用户选择 workflow-model option 后，后端解析 workflow 的 `checkpointFieldName`（默认 `ckpt_name`）+ checkpoint 的 `ckpt_name` 覆盖该节点。⚠️ 若 workflow 未配 `checkpointNodeId`，则选中的 checkpoint 文件名会被忽略（回退 workflow 内置底模），provider 会 `console.warn`。
> - **WF1 可选模型目录已落地并修正：** `image_models` 是 checkpoint catalog，`image_workflows` 是 workflow catalog，`image_workflow_models` 是绑定表。Admin「Portrait generation」面板分区管理 checkpoint 和 workflow。
> - 落地了 spec-020 §C 的通用 `image_generation_jobs` 表（migration `0018`）；**未建** `image_generation_config` 表。provider 配置通过 settings store 读取（`image_gen.*`，见 [`registry.ts`](../../packages/api/src/settings/registry.ts) 与 [`admin-settings-workspace.md`](../ops/admin-settings-workspace.md)）：secret / provider 开关可从 env 兜底，workflow/node/checkpoint 配置只以部署同步进 D1 的值为准。
> - base-art 草稿走 spec-020 §F 的 `POST /companions/base-art/generate` + `GET /companions/base-art/jobs/{jobId}`；结果落 `user-art/{user_id}/base-art/{uuid}.{ext}` + `asset_objects`。webhook（`/webhooks/runninghub`）与 cron 兜底（`pollStaleRunningHubArtJobs`）均已扩展为识别 `image_generation_jobs`。
> - **本期不接积分**（spec-021 扣费后续再接）。
> - **产品范围收敛（2026-06-01）**：创建角色时上传本地图片直接作为最终 neutral 图，不再走 RunningHub img2img 重画。`source:"upload"` / img2img 可作为底层兼容或后续增强保留，但不是当前 v1 创建入口。

---

## Context

[`spec-020`](./spec-020-companion-emotion-art-generation.md) 完成了 companion emotion art 生成的后端核心链路（jobs 表、queue consumer、`ImageGenProvider` 抽象、admin / system 端点），但目前只接了 mock provider —— mock 把 neutral 图原样复制到所有 5 个非 neutral emotion，仅用于跑通链路，不产生真实表情变化。

本 spec 把第一个**真实** image generation provider 接入：**RunningHub**（https://www.runninghub.ai/）。RunningHub 是一个托管 ComfyUI workflow 的云平台，提供 API 远程调用、按 RH Coins 计费、支持 image-to-image + 自定义节点参数覆盖，适合本项目对"同一 companion 变体一致性 + 可控 prompt + 多模型试错"的需求。

为什么选 RunningHub 作为首个 provider：

- **ComfyUI workflow 自由度**：可以用 reference / ControlNet / 去背等节点组合，把 companion 变体一致性和透明立绘输出做进 workflow，而不是依赖 API 厂商黑箱
- **成本可控**：消费版按 RH Coins 计费，企业版可洽谈
- **多模型并存**：同账户可挂多个 workflow（不同风格 / 不同质量档），后端通过 `workflowId` 切换
- **异步 webhook**：避免 Worker 占用 CPU 长轮询

本 spec 把 RunningHub 定位为 **v1 生产环境默认 provider**（与 [`spec-020`](./spec-020-companion-emotion-art-generation.md) v1 默认配置一致）。mock provider 保留作为本地开发 + CI 测试默认，避免空配置时意外烧钱；staging / production 的 provider 开关必须显式设为 `runninghub`，workflow/node/checkpoint 配置通过 repo 配置文件随部署同步到 D1。

### 范围（与早期草案的差异）

本 spec 承载的是一条**角色美术创建流水线**，不再是「单 workflow 只做表情包」。产品规划固定为 **3 个 ComfyUI workflow**，但 MVP 交付顺序是先跑通 WF-1 create 与 WF-2 variation；WF-3 edit 只保留接口和方向，等创角闭环稳定后再接。风格优先通过 checkpoint 参数在同一 workflow 内切换；如果 RunningHub 实操上用“一风格一 workflow”更稳定，也由 repo workflow 配置文件承载，不再新增 env JSON。

| Workflow | 用途 | 入口 mode |
|---|---|---|
| **WF-1 角色生成** | 文生图创建基础图；上传 img2img 仅为底层保留能力 | `create` |
| **WF-2 变体 + 抠图** | 从确认的基础图生成 5 个非 neutral 情绪变体，尾部去背输出透明背景 | `variation` |
| **WF-3 编辑** | 按 prompt（+可选 mask）换装 / 换姿势；MVP 暂不交付 | `edit` |

风格不再是代码枚举。Admin 用 checkpoint 的 `tag` 做分类（如 `realistic`、`anime,jp`、`anime,kr`），并在 workflow 上勾选可用 checkpoint。后端通过 workflow 的 `checkpointNodeId` + `checkpointFieldName` 覆盖底模，checkpoint 文件名来自用户选择的 catalog row。运营操作步骤（含上传自有 checkpoint）见 [`admin-settings-workspace.md`](../ops/admin-settings-workspace.md) §6。

> 术语统一：[`spec-020`](./spec-020-companion-emotion-art-generation.md) 的「6 emotion 变体」就是产品语境里说的「6 个姿势/立绘」，本 spec 的 WF-2 即生成这套变体，不是额外的姿势集合。

---

## 目标 / 非目标

### 目标

- 在 spec-020 的 `ImageGenProvider` 抽象下实现首个真实 provider `RunningHubImageGenProvider`
- 规划支持 **3 个 workflow（create / variation / edit）**；MVP 先支持 create + variation，edit 接口可先返回 `501 edit_not_ready`
- 支持 **3 种风格（realistic / anime_jp / anime_kr）**；目标形态按 `style` 覆盖 checkpoint 节点的 configured fieldName（默认 `ckpt_name`），当前 create 切片也允许一风格一 workflow 的配置 map
- 通过环境变量 `IMAGE_GEN_PROVIDER` 在 mock / runninghub 之间切换；本地 / CI 默认 mock，staging / production 显式配 `runninghub`
- 通过 R2 签名 URL 把源图安全分发给 runninghub，无需公开 bucket
- 通过 webhook 异步接收任务结果，写回 R2 和 DB；不依赖长轮询
- 提供 cron 兜底，避免 webhook 丢失导致 job 永久 `processing`
- 失败路径与 spec-020 的 `markFailed` 复用，spec-021 落地后接退款

### 非目标

- ❌ 不替换 mock provider
- ❌ 不做多 provider 同时启用 / 路由 / 故障转移（仅二选一切换）
- ❌ 不做积分价格定档（属 spec-021）
- ❌ 不实现 workflow 本身（属 runninghub 网页上的人工 + 美术工作）
- ❌ **上传人像不进入 RunningHub 创建链路**：当前产品创建流程中，上传图片直接作为 neutral 图；不做身份保真，也不做 img2img 重画
- ❌ 不做超过 3 种风格 / 超过 3 个 workflow 的扩展（一期固定）
- ❌ 不接入除 runninghub 之外的 provider

---

## 改动清单

### A. Workflow 能力清单（**本 spec 的核心交付物之一**）

实施前提：在 RunningHub 网页上按规划搭出 **3 个** ComfyUI workflow，每个都跑通至少一次（RunningHub 要求 workflow 必须有过一次成功执行才能被 API 调用）。MVP 阶段只阻塞于 WF-1 / WF-2；WF-3 可暂缓。目标形态下三个 workflow 都接受一个 **checkpoint 节点**，后端按 `style` 覆盖 configured checkpoint field 实现风格切换。workflow/node id、checkpoint fieldName、默认 checkpoint 文件名的长期来源是 repo workflow 配置文件，部署时同步到 D1。

#### A.0 三个 workflow 的可覆盖节点总览

| Workflow | mode | 必须可覆盖的节点（fieldName）|
|---|---|---|
| WF-1 角色生成 | `create` | prompt（`text`）、checkpoint（fieldName 默认 `ckpt_name`，可配置）；load-image（`url`）仅保留给后续 img2img 能力 |
| WF-2 变体 + 抠图 | `variation` | load-image（`url`，基础图）、prompt（`text`，emotion 变体）、checkpoint（fieldName 默认 `ckpt_name`，可配置）|
| WF-3 编辑（后续） | `edit` | load-image（`url`，基础图）、prompt（`text`，编辑指令）、checkpoint（fieldName 默认 `ckpt_name`，可配置）、**可选** mask（`url`）|

公共约定：
- **Negative prompt**：每个 workflow 内置默认值，后端**不覆盖**。
- **Seed**：可选；后端可固定保证可复现，或留空随机。
- **checkpoint 节点**：风格切换的关键。后端使用 workflow 配置中的 checkpoint 节点 id 和 fieldName，并用用户所选 image model 的 `ckpt_name` 覆盖进去；没有用户选择时使用 workflow 配置的默认 `ckptName`。
- **输出节点**：统一用 `SaveImageWithoutMetadata`（runninghub 官方建议，避免 EXIF 元数据泄露）。

#### A.1 WF-1 角色生成

- **能力**：txt2img（MVP 必需）。img2img/load-image 可保留为后续能力，但当前创建角色 UI 不调用。
- **上传图片归属**：本地上传由 `POST /companions/upload-art` 直接成为 neutral 图，不进入 WF-1。
- **输出**：1 张基础图（即 companion 的 neutral 立绘）。

#### A.2 WF-2 变体 + 抠图（角色一致性 + 透明背景）

- **角色一致性（必需）**：以确认的基础图为参考，保证 5 张变体与基础图是**同一 companion**。这里的一致性是“同一张基础角色图的表情变体一致”，不是“贴合用户上传真人”。可用 Reference Only / IPAdapter / ControlNet 等参考方案，但不要求 FaceID / InstantID 级别的真人身份保真。
- **抠图**：workflow **尾部接去背节点**（rembg / RMBG / SAM 等），输出**透明背景** webp 或 png（带 alpha）。这里的“背景”指角色立绘背景去除，不包含场景背景生成，也不适用于 Chat Moment Image 这类完整场景图。
- **调用方式**：后端按 5 个非 neutral emotion **调用 5 次**，每次只换 prompt（emotion 变体），不在 workflow 内部循环。

#### A.3 WF-3 编辑（换装 / 换姿势，后续）

- **能力**：inpainting（带 mask 局部重绘换装）或 prompt 驱动的整体编辑。
- **mask 可选**：带 mask 走局部重绘；不带 mask 走整体 prompt 编辑。
- **优先级最低**：留接口，MVP 可返回 `501 edit_not_ready`；跑通 WF-1 / WF-2 后再做。

#### A.4 workflow 验收测试

每个 workflow 搭好后按下表肉眼验收：

| Workflow | 验收样本 | 验收点 |
|---|---|---|
| WF-1 | active image model × 文生图 | 模型/checkpoint 正确；prompt 能产出可用基础图 |
| WF-2 | 3 风格基础图 × 5 emotion = 15 张 | **一致性**（脸/发/服装/镜头保持）；**表情区分度**（warm vs guarded vs annoyed 可辨）；**背景透明**（alpha 正确）|
| WF-3 | 后续：3 风格基础图 × {带 mask 换装, 无 mask 换姿势} | 编辑生效且角色不崩 |

性能目标：单次 workflow 执行 ≤ 30 秒，超过考虑换模型 / 简化节点。

#### A.5 交付清单（已接入 workflow 搭好后填回）

每个已接入 workflow 回填到 repo 中对应环境的 RunningHub workflow 配置文件，并由部署同步到 D1：

- `workflowId`（runninghub 平台分配）
- 各可覆盖节点的 `nodeId`：load-image / prompt / checkpoint / mask（按 §A.0 总览，WF-1 的 load-image、WF-3 的 mask 为可选）
- 3 种风格各自的 checkpoint 节点映射和 fieldName；用户可选 checkpoint 文件名由 `image_models.ckpt_name` 管理，workflow 默认文件名由 repo workflow 配置的 `ckptName` 管理
- 验收测试样本截图

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

目标形态下 `workflowId` 按请求 `mode` 选（create/variation/edit 各一个）；`nodeInfoList` 按 mode 拼装，并始终注入 checkpoint 覆盖。workflow/node 映射来自 D1 `app_settings`，由 repo workflow 配置文件在部署时同步。下例为 `variation` mode：

```json
{
  "apiKey": "...",
  "workflowId": "<RUNNINGHUB_VARIATION_WORKFLOW_ID>",
  "nodeInfoList": [
    { "nodeId": "<VARIATION_LOAD_IMAGE_NODE_ID>", "fieldName": "url", "fieldValue": "<signed base-art url>" },
    { "nodeId": "<VARIATION_PROMPT_NODE_ID>", "fieldName": "text", "fieldValue": "<emotion prompt>" },
    { "nodeId": "<VARIATION_CHECKPOINT_NODE_ID>", "fieldName": "<CHECKPOINT_FIELD_NAME>", "fieldValue": "<style → ckpt_name>" }
  ],
  "webhookUrl": "https://api.<our-domain>/webhooks/runninghub"
}
```

各 mode 的 `nodeInfoList` 差异：
- `create`：prompt + checkpoint（必）；load-image 仅保留给后续 img2img 能力，当前创建 UI 不使用。
- `variation`：load-image（基础图）+ prompt + checkpoint（均必）。
- `edit`：load-image（基础图）+ prompt + checkpoint（必）；mask（可选）；MVP 未接入时返回 `501 edit_not_ready`。

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
| `NODE_INFO_MISMATCH(nodeId=…, fieldName=…, field_not_found_in_node_inputs)` | `nodeInfoList` 里给某节点指定的 **fieldName 在该节点的输入里不存在** | `provider_error`（原文存入 `error_message`） |
| 其它 | **待客服补充** | 默认 `provider_error`（可重试） |

> **checkpoint fieldName 属于 workflow，不属于 model。** provider 把 workflow 的 `checkpointFieldName` 当作 checkpoint 节点（workflow 的 `checkpointNodeId`）上的输入字段名发给 RunningHub（缺省 `ckpt_name`）；checkpoint/model 只提供 `ckpt_name` 文件名。
>
> 真实踩坑（2026-06-02，dev）：旧迁移曾把三个 model 的 `checkpoint_field_name` 回填为 `Realistic`/`Anime_JP`/`Anime_KR`。生成 `anime_jp` 时 RunningHub 收到 `fieldName=Anime_JP`，但节点 1 没有这个输入 → `NODE_INFO_MISMATCH(nodeId=1, fieldName=Anime_JP, reason=field_not_found_in_node_inputs)`。修正后新 job 不再读取 model 上的 legacy `checkpoint_field_name`，统一使用 workflow 的 `checkpointFieldName = ckpt_name`。

#### B.5.1 失败可观测性（2026-06-01）

- 每个 job 的失败原因**原文**写入 `image_generation_jobs.error_message`（截断 1000 字），错误归类写 `error_code`。
- base-art job status 接口（`GET /companions/base-art/jobs/{jobId}`）现一并透传 `error_message`，前端生成面板在友好文案下方展示原始原因（不再只显示 "Generation failed"）。
- Admin 诊断端点 `GET /admin/image-gen-jobs?status=failed&limit=N`（admin-only）列出最近任务的 `error_code`/`error_message`/`workflow_key`/model/`provider_task_id`，挂在 admin「Portrait generation」面板，免去手连 D1。

### C. 后端代码改动

#### C.0 扩展 `packages/api/src/image-gen/types.ts` 的 `ImageGenRequest`

目标形态把 `ImageGenRequest` 扩展为三 mode。当前已落地的窄版支持 `create | variation`；`edit` 与 `mask_url` 是后续扩展：

```ts
type ImageGenMode = "create" | "variation" | "edit"; // 当前代码先支持 create | variation

type ImageGenRequest = {
  mode?: ImageGenMode;
  /** 选哪条 workflow（image_gen.workflows 的 key）。create 由所选 model 决定，缺省 wf1；variation 缺省 wf2 */
  workflow_key?: string;
  prompt: string;
  /** 切 checkpoint 时的文件名（来自所选 checkpoint catalog row） */
  ckpt_name?: string;
  /** workflow checkpoint 节点上的字段名（来自 workflow，缺省 ckpt_name） */
  checkpoint_field_name?: string;
  /** variation/edit 必填；create 当前不使用，后续 img2img 能力可复用 */
  source_art_url?: string;
  /** 仅 edit 局部重绘时有值 */
  mask_url?: string;
  /** 仅 variation：目标 emotion */
  emotion?: NonNeutralEmotion;
  companion?: CompanionPromptContext;
};
```

> 重构（2026-06-02 修正）：原 `style: ArtStyle` 已删除，改由 workflow-model option 解析 `workflow_key` 与 checkpoint 文件名；checkpoint 字段名只来自 workflow。

mock provider 与既有 variation 路径保持兼容（mode 缺省视为 `variation`）。

#### C.1 改写 `packages/api/src/image-gen/runninghub-provider.ts`

实现 `ImageGenProvider` 接口。`generate()` 内：

1. 通过 settings store 读取配置：apiKey / webhook secret 仍来自 env/Wrangler secret；workflowId + node id 映射来自 D1 `app_settings`（由 repo 配置部署同步）；缺失任一抛 `ImageGenError("provider_not_configured", retryable=false)`
2. 若有 `source_art_url`，用 `signed-url.ts` 转成短期签名 URL（create 文生图时跳过）
3. 拼接 `nodeInfoList`：按 mode 覆盖 load-image / prompt / mask，并在 workflow 配置存在 `checkpointNodeId` 时注入 checkpoint 覆盖（fieldName 来自 workflow 的 `checkpointFieldName`，文件名来自所选 checkpoint 的 `ckpt_name`；无 checkpoint 选择则不注入 checkpoint；找不到 `workflow_key` 对应 workflow 抛 `provider_not_configured`）
4. `POST .../task/openapi/create`（workflowId = 按 mode 选）创建任务，收到 `taskId`
5. **不下载图、不写 R2、不标 succeeded**；返回 `{ type: "pending", external_task_id, ... }`，consumer 等 webhook
6. `MODEL` 写死值改为按 mode 派生（如 `companion-create-v1` / `companion-variation-v1` / `companion-edit-v1`），写入 job 便于审计

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

#### C.7 RunningHub workflow 配置治理

workflowId / nodeId 不是 secret，但也不适合继续放在 `.env.*` 或 `wrangler.jsonc vars`。目标形态：

1. repo 中维护按环境区分的 RunningHub workflow 配置文件：`config/runninghub-workflows.dev.json` / `config/runninghub-workflows.prod.json`。
2. 部署脚本在 D1 migration 后通过 `scripts/sync-runninghub-workflows.sh` 读取对应环境配置，并覆盖同步到 `app_settings`。
3. runtime 继续通过 settings store 读取 `image_gen.*`。
4. Admin UI 可查看和临时编辑 D1 当前值；长期修改必须回写 repo 配置文件，否则下一次部署会被覆盖。

配置内容只包含非 secret，并作为 DB catalog 的默认 seed：

```json
{
  "checkpoints": [
    { "id": "anime_jp_animagine", "label": "Anime JP - Animagine XL", "ckptName": "animagineXL40_v4Opt.safetensors", "tags": ["anime", "jp"] }
  ],
  "workflows": {
    "wf1": { "label": "WF1 - base portrait", "mode": "create", "workflowId": "", "promptNodeId": "", "checkpointNodeId": "", "checkpointFieldName": "ckpt_name", "modelIds": ["anime_jp_animagine"] },
    "wf2": { "mode": "variation", "workflowId": "", "loadImageNodeId": "", "promptNodeId": "" }
  }
}
```

- `checkpoints[]`：默认 checkpoint/model catalog，部署同步 upsert 到 `image_models`。
- `create` workflow：`workflowId` + `promptNodeId` +（可选）`checkpointNodeId` + `checkpointFieldName` + `modelIds`。
- `variation` workflow：`workflowId` + `promptNodeId` + `loadImageNodeId`，无 checkpoint。
- 要新增 workflow，在此列表加一个 key，或直接在 Admin 里新增；`modelIds` 负责绑定可选 checkpoint。

同步后写入 D1 catalog 表，并保留 `image_gen.workflows` 作为旧 runtime fallback：

| D1 位置 | 来源 |
|---|---|
| `image_models` | `checkpoints[]` |
| `image_workflows` | `workflows{}` 的 node wiring |
| `image_workflow_models` | 每条 workflow 的 `modelIds` |
| `app_settings.image_gen.workflows` | legacy fallback JSON |

> 同步脚本会顺带 `DELETE` 旧键 `image_gen.create_workflows` / `image_gen.wf2_workflow_id` / `image_gen.wf2_load_image_node_id` / `image_gen.wf2_prompt_node_id`，清理历史漂移。

> `.env.*` 与 `wrangler.jsonc vars` 不承载 workflow/node id。checkpoint 文件名由 `image_models` 管；checkpoint fieldName 由 `image_workflows` 管；Admin 和 config sync 都写同一套 DB catalog。

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

`packages/api/migrations/0026_workflow_models_refactor.sql` 是历史过渡迁移，曾新增 `workflow_key` / `checkpoint_field_name`。这些列保留兼容旧 DB，但新代码不再读取 model 上的 `checkpoint_field_name`。

`packages/api/migrations/0028_runninghub_workflow_catalog.sql`（历史修正）：

```sql
CREATE TABLE image_workflows (... checkpoint_field_name TEXT NOT NULL DEFAULT 'ckpt_name' ...);
CREATE TABLE image_workflow_models (... PRIMARY KEY (workflow_key, model_id));
-- 从旧 image_models.workflow_key 回填绑定；忽略旧 checkpoint_field_name，防止 Anime_JP 等 style 名继续进入 RunningHub fieldName。
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
2. **先搭建 WF-1 / WF-2** 并按 §A.4 验收；WF-3 edit 后续再接。最终仍按 §A.5 回填已接入 workflow 的交付清单到 repo workflow 配置文件
3. 新增 migration 0016 增 `external_task_id` 列（已存在）
4. 实现 `signed-url.ts`（先 R2 原生 presign，落不通走自建路由）
5. 扩展 `ImageGenRequest`（§C.0）+ 改写 `runninghub-provider.ts`（MVP 先按 create/variation 选 workflow、按 style 注入 checkpoint 或读取 D1 create workflow map）+ provider 开关 + repo workflow 配置同步
6. 实现 `/webhooks/runninghub` 路由 + 签名验证
7. 重构 `art-consumer.ts` 支持 async 委托结果 + 把 succeeded / failed 落地路径抽成 helper 供 webhook 复用
8. 配置 Cloudflare Cron Trigger 兜底轮询
9. dev 环境端到端验证：先跑通 **WF-1 create 文生图**（active image models），再 admin prewarm 一个 companion 跑通 **WF-2 variation** 的 5 个 emotion（透明背景）；img2img 与 **WF-3 edit** 后续再接
10. spec-021 落地后，开放普通用户端点，把 501 改为正常流程
11. 将 spec 状态从 📝 draft 推到 🟡 in-progress → 🟢 done

---

## 验证方式

### 单元 / 集成

- `IMAGE_GEN_PROVIDER=mock` 时既有 322 个测试全过（行为不变）
- runninghub provider 单元测试：mock fetch，验证请求体结构 / 节点 id 注入 / 签名 URL 替换
- webhook 端点单元测试：错 secret 拒绝、未知 taskId 拒绝、正常路径落地 R2 + DB

### 端到端（dev 环境）

0. 配置 `IMAGE_GEN_PROVIDER=runninghub` + `RUNNINGHUB_API_KEY`，并确认已接入 workflow 的 id / 节点映射已由 repo 配置同步到 D1
1. **WF-1 create**：先用 active image models 做文生图创建，预期产出基础图写入 `art_url`/`art_emotions.neutral`；上传本地图片不进入 RunningHub
2. **WF-2 variation**：对一个有基础图的 companion 调 `POST /admin/companions/{id}/emotion-art/prewarm`
3. 预期：5 个 job 创建，每个写入 `external_task_id`，状态 `processing`
4. 等 ≤ 5 分钟，webhook 应陆续触发，5 个 job 全部 succeeded
5. R2 存在 5 个 emotion 输出 key（**透明背景**）；`companions.art_emotions` 含 6 个 key
6. 肉眼验收：5 张图角色一致、表情可辨、背景透明
7. **WF-3 edit**（后续接好后）：对基础图发一次换装 / 换姿势编辑，预期产出编辑图且角色不崩；未接入时 API 返回 `501 edit_not_ready`

### 失败路径

- apiKey 错 → `provider_config_error`（不重试）
- workflowId 错 → `APIKEY_INVALID_NODE_INFO`（不重试）
- webhook 不可达 → 5 分钟后 cron 兜底拉 status
- 15 分钟仍 processing → 标 failed `code=timeout`
- webhook 端点拒绝无签名 / 错签名请求

---

## 回滚

- **代码回滚**：切回 `IMAGE_GEN_PROVIDER=mock`，链路恢复 mock 行为；runninghub 模块代码保留不删。若回滚版本包含 workflow 配置变化，也要同步对应版本的 repo workflow 配置，避免 D1 漂移。
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

1. **workflow 注册流程**：用户 / 客服先搭符合 §A 的 **WF-1 / WF-2**，各跑通至少一次，回填每个 `workflowId`、各可覆盖节点 `nodeId`、checkpoint fieldName、默认 checkpoint 文件名到 repo workflow 配置文件；用户可选 checkpoint 文件名由 `image_models` 管理；WF-3 edit 后续再补
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
