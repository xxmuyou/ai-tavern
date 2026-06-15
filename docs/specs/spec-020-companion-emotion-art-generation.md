# spec-020: Companion Expression Pack Generation

> **类型：** 新建  |  **依赖：** spec-004, spec-006, spec-010, spec-019, spec-021, spec-022  |  **估时：** 6-9 天  |  **状态：** 📝 draft

---

## Context

当前 companion 视觉资产链路已经具备基础字段，但产品体验不完整：

- `companions.art_url` 保存默认立绘。
- `companions.art_emotions` 保存 `emotion -> image key/url` 的 JSON map。
- Chat 已经输出并持久化 `messages.emotion`。
- 前端 `PortraitBar` 已经按当前 emotion 读取 `art_emotions[emotion]`，缺失时回退到 `art_url`。
- `POST /companions/upload-art` 已支持用户上传一张 companion 图片到 R2。

问题在于：companion 只有一张 neutral 图时，聊天中的 emotion 状态虽然会变化，但缺失的非 neutral 立绘只能回退到 neutral。要形成可商业化的视觉反馈，需要在 neutral 之外生成可复用的表情变体。

本 spec 的工作流为：**只要求一张 neutral 基础图，其他情绪图通过 Expression Pack 异步生成，生成后缓存复用。**

同时，本 spec 不把生图能力写死在 companion 模块里。表情包只是第一个业务场景；底层需要新增一个可复用的 `image-generation` 模块，后续 web/app 其他页面需要文生图、图生图、编辑、透明背景或 WebP 输出时，都复用同一套 provider adapter、任务表、队列处理和 R2 入库逻辑。

积分扣费、余额、充值、退款由 [`spec-021`](./spec-021-credits-ledger-and-metering.md) 定义。本 spec 只定义表情包生成链路、通用生图模块以及与积分系统的对接点。

### 本次范围补充（角色美术创建流水线）

在表情包之外，本 spec 把 companion 的**基础图来源**和**风格**也纳入：

1. **基础图来源新增「文生图创建」**：创建 companion 时，用户可以填提示词由后端文生图生成基础图；也可以上传本地图片并直接作为最终 neutral 图。当前产品创建流程不把上传图再送 RunningHub img2img 重画。
2. **模型属性**：创建生图由 admin 配置的 active workflow-model option 决定走哪条 workflow 与 checkpoint 文件；checkpoint fieldName 属于 workflow，默认 `ckpt_name`。旧的 3 风格枚举已降级为 checkpoint 上的自由 `tag`（spec-022 2026-06-02 修正）。
3. **变体输出统一透明背景**：5 个非 neutral 变体由生图链路对**角色立绘去背**，输出透明背景。这里的“背景抠图”不是生成场景背景图，也不是要求用户上传的基础 neutral 图必须抠图。
4. **新增编辑接口**：按 prompt（+可选 mask）换装 / 换姿势，**留接口、优先级最低**。

#### 创建流程顺序（重要）

用户创建 companion 的实际顺序是 **「先出基础图 → 再填属性 → 点完成才建角色」**，基础图先于 companion 记录存在：

1. 点「创建」弹浮窗，二选一拿到基础图：
   - **上传**：上传本地图片 → `POST /companions/upload-art` → 返回 key 直接作为最终 neutral 图；不调用 RunningHub，不做 img2img 重画。
   - **文生图**：选 active image model，填 prompt → 走 portrait_create `create` 的 txt2img。可选是否消耗积分由 UI 决定（见 spec-019）。
   - 文生图是异步的：浮窗里「生成中 → 预览 → 满意进下一步 / 不满意重抽（重抽再扣分）」。
2. 拿到满意的基础图后进入属性表单（name/gender/personality 等，**不参与出图**，只喂 chat 人设）。
3. 点「完成」才 `POST /companions` 建角色，把 `{属性 + 基础图 key}` 一起提交；文生图来源可携带模型/风格信息，供后续变体生成使用。

因此文生图基础图生成是一个**不绑 companion id 的草稿步骤**（companion 此时还不存在），不能挂在 `/companions/{id}/` 下；见 §F 端点设计。上传本地图片则是同步上传，直接返回可提交的 `art_url`。

> **上传图规则（2026-06-01 产品决策）**：创建角色时，上传图是用户选择的最终 neutral 图，不是 RunningHub 的参考图。底层 `source:"upload"` 能力可作为后续增强保留，但不属于当前创建流程。

> **术语统一**：产品语境里说的「6 个姿势 / 立绘」就是本 spec 的「6 个 emotion 变体」（`neutral` + 5 个非 neutral），是同一套图，喂给 chat 的 `PortraitBar`，不是另一套独立的姿势集合。
>
> 上述生图能力按 [`spec-022`](./spec-022-image-gen-runninghub-integration.md) 规划为 3 个 RunningHub workflow（create / variation / edit）。MVP 优先跑通 create + variation；edit 保留接口和方向，不阻塞创角闭环。

---

## 目标 / 非目标

### 目标

- companion 只要求有一张 `neutral` 基础图。
- 6 个 emotion 固定为：`neutral`, `warm`, `playful`, `guarded`, `tense`, `annoyed`。
- 缺失非 neutral 情绪图时，前端继续显示 neutral，不阻塞聊天。
- 用户或系统触发 Expression Pack 后，后端异步生成缺失的 5 个非 neutral emotion 图并上传到 R2。
- 生成成功后更新缓存，使后续读取直接命中 `art_emotions[emotion]`。
- 同一 `(companion_id, emotion, source_art_url)` 同时只能有一个 pending/processing 任务。
- 官方 companion 支持 admin 批量预热；用户自创 companion 仅 owner 可触发（**2026-06-08 改版**：表情生成从"Pro 订阅门控"改为**纯积分制**——人人可生，每张扣 40 积分，余额不足返回 `402 credits_insufficient`；admin 不扣费）。
- 生图必须使用 neutral 图作为 reference/image-to-image，优先保证角色一致性。
- 生图能力抽成独立模块，支持 `text_to_image`、`image_to_image`、`edit` 三类任务。
- Provider 切换成本必须低：切换模型优先通过配置完成；新增 provider 只新增 adapter，不改 companion workflow。
- 支持 RunningHub 作为 v1 默认 provider，同时预留 OpenAI `gpt-image-1.5`、ComfyUI 反代、FLUX、Seedream 等 provider adapter；RunningHub 具体接入由 [`spec-022`](./spec-022-image-gen-runninghub-integration.md) 落地。
- 模块能力声明必须覆盖：WebP 输出、透明背景、reference image、mask image、异步 provider task。

### 非目标

- ❌ 不在本 spec 内实现积分账本、月度积分、pay-as-you-go 购买；这些属于 spec-021。
- ❌ 不做用户手动逐张上传 6 个 emotion 图。
- ❌ 不做公开角色市场、共享角色、fork/remix。
- ❌ 不做视频、live portrait、语音或 3D avatar。
- ❌ 不做 milestone CG；里程碑装饰层仍按现有产品文档处理。
- ❌ 不承诺所有 provider 都支持相同质量；provider 差异通过后端适配层封装。
- ❌ v1 不要求每个 provider 都原生支持 WebP 或透明背景；不支持时由 capability 记录并降级。

---

## 改动清单

### A. Emotion 资产语义与风格字段

`art_url` 与 `art_emotions` 的语义调整如下：

- `art_url`：companion 的基础 neutral 图，作为列表、详情页和所有 fallback 的默认图。
- `art_emotions.neutral`：必须等于 `art_url`，或在读取时视为 `art_url`。
- `art_emotions.<non-neutral>`：只有真正生成成功或人工填入对应 emotion 图时才存在。

**风格字段历史修正（spec-032）：**

旧草案里的多风格枚举已废弃，不再新增正式字段。角色发现页的用户侧风格使用 companion `tags`：`style:anime` / `style:realistic`。生图模型选择继续走 admin checkpoint catalog；Admin 主分类同样只保留 `Anime` / `Realistic`，不再使用地区标签拆分 Anime。

**基础图来源**（`art_url` / `art_emotions.neutral` 二选一来源）—— 都在 companion **创建之前**确定：

- **(a) 上传**：先 `POST /companions/upload-art` 拿到原图 key，直接作为最终 neutral 图提交给 `POST /companions`。当前产品流程不再调用 `base-art/generate source:"upload"` 重画。
- **(b) 文生图**：调 `POST /companions/base-art/generate`（`source: "text"` + `prompt` + `model`），走 portrait_create txt2img 生成基础图（见 §F）。

只有文生图返回**草稿生图任务**（异步），前端轮询拿到生成图 R2 key，预览满意后带进创建表单。上传路径是同步上传，不产生生图任务。

用户创建/编辑 companion 时：

- 基础图只写入 `art_url` 和 `art_emotions.neutral`，由 `POST /companions` 在「完成」时落库。
- 不再把同一张图片填充到 `warm/playful/guarded/tense/annoyed`。
- **（2026-06-08 改版）** companion 建好后**不再自动批量生成** 5 个非 neutral 变体。非 neutral 表情由用户在角色页**立绘图鉴手动触发生成**（纯积分制）：未生成格显示「模糊主立绘 + 生成（40 积分）」，任何用户点击即生成并扣 40 积分，余额不足跳充值。聊天里有图才显示该表情，否则回退 neutral。
- 若之后更新了 `art_url` 或所选生图模型，应清空旧的非 neutral 自动生成图，或将它们标记为 stale，避免新基础图 / 新模型与旧表情图不一致。

### B. 通用 Image Generation 模块

新增 / 演进 `packages/api/src/image-gen/` 模块，作为后端唯一的生图抽象层。Companion 表情包、后续活动图、场景图、用户自定义图片等都通过该模块创建任务。

模块职责：

- 创建通用生图任务。
- 按 task 解析 provider/model 配置。
- 封装 provider adapter 调用。
- 统一处理同步 provider 与异步 workflow provider。
- 将 provider 输出下载或接收后写入 R2。
- 写入 `asset_objects`，返回稳定 R2 key。
- 记录 provider 请求、响应摘要、成本、错误和 capability 降级。

建议内部 API：

```ts
type ImageGenerationMode = "text_to_image" | "image_to_image" | "edit";

type ImageGenerationTask =
  | "companion_emotion_art"
  | "generic_text_to_image"
  | "generic_image_to_image"
  | "generic_edit";

type ImageOutputFormat = "webp" | "png" | "jpeg";

type ImageGenerationRequest = {
  task: ImageGenerationTask;
  mode: ImageGenerationMode;
  userId: string | null;
  prompt: string;
  negativePrompt?: string | null;
  inputKeys?: string[];
  maskKey?: string | null;
  outputPrefix: string;
  outputFormat: ImageOutputFormat;
  transparentBackground?: boolean;
  size?: string | null;
  quality?: string | null;
  metadata?: Record<string, unknown>;
};

type ImageGenerationJobResult =
  | { status: "queued"; jobId: string }
  | { status: "processing"; jobId: string }
  | { status: "succeeded"; jobId: string; outputKey: string }
  | { status: "failed"; jobId: string; errorCode: string };
```

模块暴露函数：

- `createImageGenerationJob(env, request)`：创建通用任务。
- `enqueueImageGenerationJob(env, jobId)`：投递 queue。
- `processImageGenerationJob(env, jobId)`：queue consumer 调用。
- `loadImageGenerationJob(env, jobId)`：业务层或 API 查询状态。

### C. 通用生图表与配置

新增 D1 表 `image_generation_jobs`，用于所有业务的生图任务追踪。

```sql
CREATE TABLE image_generation_jobs (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT REFERENCES users(id),
  task                  TEXT NOT NULL,
  mode                  TEXT NOT NULL, -- text_to_image / image_to_image / edit
  status                TEXT NOT NULL, -- pending / processing / waiting_provider / succeeded / failed / cancelled
  provider              TEXT,
  model                 TEXT,
  fallback_provider     TEXT,
  fallback_model        TEXT,
  prompt                TEXT NOT NULL,
  negative_prompt       TEXT,
  input_keys            TEXT, -- JSON array of R2 keys/URLs
  mask_key              TEXT,
  output_prefix         TEXT NOT NULL,
  output_key            TEXT,
  output_content_type   TEXT,
  requested_format      TEXT NOT NULL, -- webp / png / jpeg
  actual_format         TEXT,
  transparent_requested INTEGER NOT NULL DEFAULT 0,
  transparent_delivered INTEGER,
  provider_task_id      TEXT,
  provider_request      TEXT,
  provider_response     TEXT,
  capability_miss       TEXT, -- JSON array, e.g. ["webp_output", "transparent_background"]
  cost_usd              REAL,
  latency_ms            INTEGER,
  error_code            TEXT,
  error_message         TEXT,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  billing_ref           TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  completed_at          INTEGER
);

CREATE INDEX idx_image_generation_jobs_user ON image_generation_jobs(user_id, created_at);
CREATE INDEX idx_image_generation_jobs_task_status ON image_generation_jobs(task, status, updated_at);
CREATE INDEX idx_image_generation_jobs_provider_task ON image_generation_jobs(provider, provider_task_id);
```

后续可新增 D1 表 `image_generation_config`，用于模型路由和 provider 切换。

> **当前实现状态**：已落地 `image_generation_jobs`（migration `0018`），但尚未创建 `image_generation_config`。RunningHub provider 配置通过 settings store 读取；secret / provider 开关保留 env 兜底，workflow/node/checkpoint 配置由 repo 中按环境区分的 RunningHub workflow 配置文件在部署时同步到 D1。下表是更完整的后续演进方向，不是当前必做项。

```sql
CREATE TABLE image_generation_config (
  task                  TEXT PRIMARY KEY,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  fallback_provider     TEXT,
  fallback_model        TEXT,
  default_size          TEXT,
  default_quality       TEXT,
  default_output_format TEXT NOT NULL DEFAULT 'webp',
  transparent_default   INTEGER NOT NULL DEFAULT 1,
  provider_options      TEXT, -- JSON, e.g. workflow_id/node mappings/base_url
  updated_at            INTEGER NOT NULL
);
```

v1 默认配置：

| task | provider | model | output |
|---|---|---|---|
| `companion_emotion_art` | `runninghub` | `companion-expression-pack-v1` | `webp` |
| `generic_text_to_image` | `runninghub` | `generic-text-to-image-v1` | `webp` |
| `generic_image_to_image` | `runninghub` | `generic-image-to-image-v1` | `webp` |
| `generic_edit` | `runninghub` | `generic-edit-v1` | `webp` |

> `model` 字段记录的是逻辑 workflow 名（与 v1 阶段使用的 ComfyUI workflow 一一对应）；实际 `workflowId` 与节点映射放在 `provider_options` JSON，由 spec-022 在 RunningHub 平台搭好 workflow 后填回。

### D. Provider Adapter 策略

所有 provider 必须实现统一 adapter，不允许业务层直接调用 provider API。

```ts
type ImageProviderCapabilities = {
  textToImage: boolean;
  imageToImage: boolean;
  edit: boolean;
  webpOutput: boolean;
  transparentBackground: boolean;
  referenceImage: boolean;
  maskImage: boolean;
  asyncTask: boolean;
};

type ImageProviderResult =
  | {
      type: "completed";
      bytes: ArrayBuffer;
      contentType: string;
      format: "webp" | "png" | "jpeg";
      transparentDelivered: boolean | null;
      costUsd?: number | null;
      rawResponse?: unknown;
    }
  | {
      type: "pending";
      providerTaskId: string;
      rawResponse?: unknown;
    };

type ImageProvider = {
  capabilities: ImageProviderCapabilities;
  generateImage(env: Env, request: ImageProviderRequest): Promise<ImageProviderResult>;
  pollImage?: (env: Env, providerTaskId: string) => Promise<ImageProviderResult>;
};
```

v1 provider 策略：

- RunningHub 作为 v1 默认 provider，真实生图 task 默认走 RunningHub workflow（见 [`spec-022`](./spec-022-image-gen-runninghub-integration.md)）；本地 / CI 仍使用 mock。
- RunningHub adapter 是异步 workflow provider：
  - 后续统一后通过 `provider_options.workflow_id` 与节点映射提交任务；当前过渡态仍从 env 读取 RunningHub 节点配置，详见 [`spec-022`](./spec-022-image-gen-runninghub-integration.md) §A/§C。
  - **模型/风格**：按用户选择的 workflow-model option 解析 checkpoint catalog，并覆盖 workflow 的 checkpoint 节点（`ckpt_name`）；不读取 `companions.art_style`。
  - 保存 `provider_task_id`。
  - queue 后续轮询任务状态，或接收 webhook 后补齐 job。
  - provider 返回图片 URL 后由 Worker 下载并转存 R2。
  - 通过 ComfyUI workflow 节点配置实现 image-to-image、reference image、角色立绘去背、WebP 输出和同一 companion 变体一致性。
- **产品 mode ↔ 生成 mode 映射**：本 spec 通用 `ImageGenerationMode`（`text_to_image` / `image_to_image` / `edit`）是底层操作；spec-022 的产品 mode 是 `create` / `variation` / `edit`，对应关系：`create` → 文生图（或上传时 image_to_image）、`variation` → image_to_image（参考基础图 + 角色一致性）、`edit` → edit。当前代码里的窄版 `ImageGenRequest` 已支持 `create | variation`，`edit` 仍是后续。
- OpenAI `gpt-image-1.5` adapter 预留，作为 RunningHub 不可用 / 验证基准时的 fallback；启用与否后续可由 `image_generation_config.fallback_provider` 控制，本期不强制实施。
- 反代 provider 使用同一 adapter 形态，只允许通过配置切换 `base_url`、`workflow_id`、`model`、节点参数，不允许 companion 模块感知这些差异。
- Provider 不支持 WebP 或透明背景时，不在 companion 层写特殊逻辑；adapter 记录 `capability_miss`，实际输出格式写入 `actual_format` 和 `output_content_type`。

### E. Companion 表情包任务表

新增 D1 表 `companion_art_jobs`，只保存 companion 业务语义，并关联通用 `image_generation_jobs`。

```sql
CREATE TABLE companion_art_jobs (
  id              TEXT PRIMARY KEY,
  image_job_id    TEXT REFERENCES image_generation_jobs(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  user_id         TEXT REFERENCES users(id),
  emotion         TEXT NOT NULL,
  status          TEXT NOT NULL, -- pending / processing / succeeded / failed / cancelled
  source_art_url  TEXT NOT NULL,
  output_key      TEXT,
  prompt          TEXT NOT NULL,
  error_code      TEXT,
  error_message   TEXT,
  credit_txn_id   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  UNIQUE (companion_id, emotion, source_art_url)
);

CREATE INDEX idx_companion_art_jobs_companion ON companion_art_jobs(companion_id, status);
CREATE INDEX idx_companion_art_jobs_user ON companion_art_jobs(user_id, created_at);
CREATE INDEX idx_companion_art_jobs_image_job ON companion_art_jobs(image_job_id);
CREATE INDEX idx_companion_art_jobs_status ON companion_art_jobs(status, updated_at);
```

说明：

- `source_art_url` 参与唯一约束，用来处理用户更换 neutral 图后的重新生成。
- `image_job_id` 是通用生图任务引用；provider、model、成本、输出格式等通用字段不重复存在 companion 表。
- `credit_txn_id` 关联 spec-021 的预占/扣费流水；admin/system free bypass 可为空。
- 任务成功后 `output_key` 写 R2 key，例如 `companions/user/{user_id}/{companion_id}/emotions/{emotion}-{uuid}.webp`。

### F. 后端接口

新增或扩展 companion art API：

```txt
POST /companions/base-art/generate               # 新增：创建前的文生图草稿，不绑 companion id
GET  /companions/base-art/jobs/{jobId}            # 新增：轮询基础图草稿任务状态
POST /companions/{id}/expression-pack/generate
POST /companions/{id}/emotion-art/{emotion}/generate
POST /companions/{id}/art/edit                    # 新增：换装/换姿势编辑（留接口）
GET  /companions/{id}/emotion-art/jobs
POST /admin/companions/{id}/emotion-art/prewarm
```

> **顺序说明**：文生图时，`base-art/generate` 在 companion **创建之前**调用（companion 还不存在，故不带 `{id}`），产出基础图草稿；上传本地图片时，`upload-art` 直接返回可提交的 key。`POST /companions`（spec-004）在「完成」时带 `art_url` 落库；文生图来源可继续为 5 个非 neutral emotion 异步触发变体（等价于内部调用 expression pack）。`expression-pack/generate` 保留供后续 retry / 手动重生成。

`POST /companions/{id}/expression-pack/generate`

- Auth required。
- user companion：仅 owner 可触发。
- official companion：普通用户不可触发；admin 使用 prewarm。
- 一次为 5 个非 neutral emotion 创建缺失任务：`warm/playful/guarded/tense/annoyed`。
- 已存在 `art_emotions[emotion]` 的 emotion 返回 cached，不创建任务。
- 已有 pending/processing job 的 emotion 返回 processing，不重复创建。
- 若缺少 neutral/art_url，返回 `400 neutral_art_required`。
- 若积分系统已启用但余额不足，透传 spec-021 的 `402 credits_insufficient`。
- 创建至少一个 job 后返回 `202 { status: "queued", pack_id, jobs }`。
- 全部 emotion 已 cached 时返回 `200 { status: "cached", jobs }`。

`POST /companions/{id}/emotion-art/{emotion}/generate`

- Auth required。
- `emotion` 只能是非 neutral 的 5 个值。
- 用于单张 retry、debug 或后续高级 UI。
- 权限、缓存、去重、neutral 校验与 pack endpoint 一致。
- 创建 job 后返回 `202 { status: "queued", job_id, image_job_id }`。

`GET /companions/{id}/emotion-art/jobs`

- Auth required。
- owner/admin 可查看任务状态。
- 返回最近任务列表，用于前端显示 generating/failed/retry。
- 返回 companion job 字段，同时包含关联 image job 的 `provider/model/status/output_content_type/capability_miss` 摘要。

`POST /admin/companions/{id}/emotion-art/prewarm`

- Admin only。
- 为指定 official/user companion 生成所有缺失情绪图。
- 默认只补缺失项，不覆盖已有图。
- 请求可选 `{ "force": true }`，强制重新生成并替换非 neutral 图。

> **实施进度（spec-022 portrait_create create 切片已落地）：** `base-art/generate` + `base-art/jobs/{jobId}` 两个端点、通用 `image_generation_jobs` 表（migration `0018`）、provider `create`（txt2img）模式、webhook/cron 识别均已实现并跑通（mock + 单测）。当前产品创建流程只使用文生图路径；`source:"upload"` img2img 重画属于保留的底层能力，不作为 v1 创建入口。变体生成、积分扣费仍待做。详见 [`spec-022`](./spec-022-image-gen-runninghub-integration.md) 状态说明。

`POST /companions/base-art/generate`（新增，创建前的文生图基础图草稿，**不绑 companion id**）

- Auth required（`requireAuthUser`）。companion 此时还不存在，所以不挂在 `/companions/{id}/` 下。
- body：`{ "source": "text", "model": "<image model id>", "prompt": "...", "lora_id"?: "...", "size_preset"?: "portrait_3_5", "batch_size"?: 1, "seed"?: 123 }`。`style` 仍可作为旧兼容参数，但新 UI 应传 `model`。
  - `source: "text"`：必须带 `prompt`，走 portrait_create `create` 的 txt2img（无 `source_art_url`）。
  - `source: "upload"`：底层兼容能力，可带 `upload_key` 做 img2img；当前创建 UI 不使用。
- 校验：`source` 非法 → `400 invalid_source`；text 缺 `prompt` → `400 prompt_required`；upload 缺 `upload_key` → `400 upload_key_required`；模型或兼容 `style` 非法 → `400 invalid_model`；LoRA 未命中 workflow/model allowlist → `400 invalid_model_lora_combination`；参数模板或范围非法 → `400 invalid_generation_params`。
- 异步返回 `202 { status: "queued", job_id }`（`job_id` 为 `image_generation_jobs` 任务）。前端用 `GET /companions/base-art/jobs/{jobId}` 轮询。
- **不写任何 companion 字段**（companion 尚不存在）；产出仅为一张风格化基础图的 R2 key，由前端带进创建表单。
- 积分系统启用后透传 spec-021 的 `402 credits_insufficient`；重抽 = 再次调用 = 再次扣费。

`GET /companions/base-art/jobs/{jobId}`（新增，轮询基础图草稿任务）

- Auth required；仅任务发起者可查。
- 返回 `{ status, art_key?, error_code? }`：`processing`（生成中）/ `succeeded`（带 `art_key`，风格化基础图）/ `failed`（带 `error_code`）。
- `art_key` 即创建 companion 时提交的 `art_url`/`art_key` 来源。

> **落库时机**：文生图草稿成功后，前端把 `art_key` 暂存在创建表单；上传图片成功后，前端把上传 key 暂存在创建表单。用户填完属性点「完成」时由 `POST /companions`（spec-004）写入 `art_url` / `art_emotions.neutral`。基础图草稿任务本身不落 companion 字段。

`POST /companions/{id}/art/edit`（新增，换装/换姿势，**留接口、优先级最低**）

- Auth required；权限同上。
- body：`{ "prompt": "...", "mask"?: "<r2 key>", "target"?: "<emotion|new key>" }`。
- 未来走 portrait_edit `edit` mode；带 `mask` 走局部重绘换装，不带走整体 prompt 编辑。
- 风格沿用创建或编辑时选择的 workflow-model option；不读取 `companions.art_style`。
- MVP 可先返回 `501 edit_not_ready`，等 portrait_edit workflow 接好再开放——这是范围声明，不是占位 hack。

### G. 异步生成流程

> 本 spec 后端骨架已用 mock provider 跑通基础链路；首个真实 provider 接入由 [`spec-022`](./spec-022-image-gen-runninghub-integration.md)（RunningHub）落地。

使用 Worker queue 或现有 `JOB_QUEUE` 处理两类 payload：

- `image.generate`：通用生图任务。
- `companion.emotion_art.finalize`：生图成功后更新 companion 业务状态。

Expression Pack 流程：

1. API 校验权限、neutral 图、缓存命中、pending/processing 去重和积分余额。
2. 为每个缺失 emotion 构造 prompt。
3. 插入或复用 `companion_art_jobs` pending 记录。
4. 调用 `createImageGenerationJob` 创建 `image_generation_jobs`。
5. 将 `image_job_id` 回写到 `companion_art_jobs`。
6. 投递 `image.generate` queue，API 返回 202。
7. Consumer 将 image job 置为 processing。
8. 从 R2 读取 neutral 图，构造 image-to-image/reference image provider 请求。
9. 同步 provider 成功时直接获取图片 bytes；异步 provider 返回 `provider_task_id` 时置为 `waiting_provider` 并继续轮询。
10. Provider 返回图片后，Worker 写入 R2，并记录 `asset_objects`。
11. image job 置为 succeeded，投递或调用 companion finalize。
12. finalize 更新 `companions.art_emotions[emotion] = output_key`，并将 companion job 置为 succeeded。
13. 失败时 image job 和 companion job 均置为 failed，并 release/refund 预占积分。

失败不影响聊天、消息保存或关系数值；前端继续使用 neutral fallback。

### H. Prompt 模板

每个 emotion 使用固定 prompt 模板，并注入 companion 字段：

- `name`
- `gender`
- `appearance`
- `personality`
- `relationship_role`
- `source_art_url`
- `emotion`

统一基础约束：

```txt
Create a consistent portrait variation of the same companion using the provided neutral portrait as the visual reference.
Keep the same identity, face structure, hairstyle, body type, outfit style, color palette, camera angle, and portrait composition.
Only change facial expression and subtle body posture to match the requested emotion.
Transparent background for the character portrait. No text. No extra characters. No age change. No style change.
```

Emotion 差异：

| Emotion | Prompt intent |
|---|---|
| `warm` | soft eyes, gentle smile, approachable posture |
| `playful` | teasing smile, slight eyebrow raise, light mischievous energy |
| `guarded` | reserved expression, lips pressed, slightly turned away |
| `tense` | worried or conflicted expression, tightened mouth, subtle anxiety |
| `annoyed` | irritated expression, frown, clear displeasure without caricature |

### I. 前端行为

前端不需要等待生成完成才能聊天。

- `PortraitBar` 继续按 `art_emotions[emotion] || art_url` 显示。
- 用户自创 companion 的详情/编辑页提供 `Generate expressions` 入口，一次生成所有缺失情绪图。
- 当当前 emotion 缺图且存在 pending/processing job 时，可显示一个低干扰状态：`Generating expression...` 或图标 spinner。
- 单个 emotion 生成失败时显示 retry，不影响其他 emotion。
- 刷新 companion detail 或重新进入 chat 后，应直接使用新生成图。

v1 可以不做实时推送；轮询 `GET /companions/{id}/emotion-art/jobs` 或用户刷新即可。

### J. 安全与风控

- 上传的 neutral 图仍沿用现有文件大小和 MIME 限制。
- Provider 请求前应做基础 prompt safety：
  - 禁止未成年色情化、裸露、仇恨符号、自残血腥、真人名人仿冒。
  - 不允许 prompt 注入改变年龄、身份、画风或生成额外人物。
- 生成图失败时不自动无限重试；同一 job 最多重试 2 次。
- 对同一 user 的 image generation 做速率限制，避免批量刷任务。
- Provider 成本必须写入可审计日志，供运营评估积分价格是否合理。
- `provider_request` 和 `provider_response` 只能保存必要摘要，不能保存 provider 密钥或完整敏感 headers。

---

## 实施步骤

1. 新增 migration：创建 `image_generation_jobs`、`companion_art_jobs`。旧 `art_style` 字段方案已废弃；角色 discovery 风格走 companion tags，生图模型走 checkpoint catalog。`image_generation_config` 暂不作为 MVP 必需项，当前配置走 env。
2. 调整 companion create/update：`POST /companions` 接受 `art_url`，只写 `art_url` 和 `art_emotions.neutral`；文生图来源可记录模型/风格并触发 5 个非 neutral 变体（内部调用 expression pack），上传来源无可用模型/风格时回退 neutral。文生图草稿在创建之前由 `base-art/generate` 单独产出。
3. 演进 `packages/api/src/image-gen/` 通用模块，封装 job 创建、配置解析、queue 处理、R2 写入和 `asset_objects` 记录。
4. 新增 RunningHub workflow provider adapter，v1 默认；MVP 先支持 portrait_create create 与 portrait_variation variation，portrait_edit edit 保留接口和文档方向。详细接入见 [`spec-022`](./spec-022-image-gen-runninghub-integration.md)。
5. OpenAI image provider adapter 仅作为后续 fallback 方向，本期不强制启用。
6. 新增 companion expression pack service：解析/更新 `art_emotions` JSON，封装 cache hit、job 去重和 stale 判断。
7. 新增端点：`base-art/generate`（创建前的文生图草稿，不绑 id）+ `base-art/jobs/{jobId}`（轮询）、pack endpoint、单张 retry endpoint、admin prewarm endpoint；`art/edit`（portrait_edit，可先 `501 edit_not_ready`）。
8. 接入 spec-021 的 reserve/commit/release 接口（helper 已就绪）：创建 job 前 reserve 50、job 落终态统一 commit/release（`settleImageJobReservation`）；admin/system 任务 bypass 不扣费。
9. 扩展 queue consumer：处理 `image.generate` 和 `companion.emotion_art.finalize`。
10. 前端 chat/detail/edit 页面接入生成状态、pack 入口与 retry UI。
11. 补充测试并更新相关 docs。

---

## 验证方式

### 通用 Image Generation 模块

- 当前 env 配置能按 task/mode 解析 provider/model/default output；后续若引入 `image_generation_config`，再补配置表解析测试。
- RunningHub adapter 能提交 workflow task，保存 `provider_task_id`，并在 webhook / 轮询成功后写入 R2。
- OpenAI adapter 为后续 fallback 方向；本期不要求实现或测试。
- Provider 不支持 WebP/透明背景时，job 记录 `capability_miss`，并正确保存 `actual_format`。
- Provider 输出成功后 R2 有对象，`asset_objects` 有对应记录。
- Provider 失败后 job 为 failed，错误码和错误消息可查询。

### Companion Expression Pack

- **文生图基础图草稿（创建前）**：`source:"text"` + prompt + model 调 `base-art/generate` 返回 202 + `job_id`，轮询 `base-art/jobs/{jobId}` 最终 `succeeded` 带 `art_key`；此时**不写任何 companion 字段**。空 prompt / 非法 source / 非法 model 返回对应 400。
- **上传最终图**：先 `upload-art` 拿 key，直接作为 `art_url` 提交创建；不调用 RunningHub 重画。
- **完成建角色**：带 `art_url` 调 `POST /companions`，落库后 `art_url`/`art_emotions.neutral` 有图，且 `art_emotions` 只包含 `neutral`。文生图来源可继续触发 5 个变体；上传来源在无模型/风格时回退 neutral。
- 5 个变体生成后**背景透明**（alpha 正确），且风格与对应模型/风格一致。
- Chat 中 emotion 变为 `warm` 且缺图时，前端仍显示 neutral，不报错。
- 触发 expression pack 后返回 202，并为缺失 emotion 插入 pending jobs。
- 已有 emotion 图返回 cached，不创建 image job。
- 重复触发同一 emotion 不创建第二个 processing job。
- 生成成功后 R2 有 output key，`companions.art_emotions.warm` 更新为该 key。
- 生成失败时 companion job 为 failed，前端仍使用 neutral fallback，积分预占被释放或退款。
- admin prewarm 能补齐 official companion 的所有缺失 emotion。
- owner 之外用户无法触发 user companion 的生图。
- official companion 的普通用户无法触发生图。

---

## 回滚

- 前端回滚到只使用 `art_url` fallback 时，已有 `art_emotions` 不影响基础聊天。
- 后端可以关闭 expression pack 端点，保留历史生成图和 `art_emotions` 缓存。
- 若 provider 故障，queue job 置为 failed，不删除 neutral 图。
- 若切换 provider 失败，只需回滚 env provider 配置或关闭对应 provider adapter；后续若引入 `image_generation_config` 再支持表配置回滚。
- migration 回滚时可删除 `companion_art_jobs`、`image_generation_jobs`；R2 中已生成对象可保留为孤儿资产，后续批处理清理。

---

## 依赖

- [`spec-004`](./spec-004-companions-simplify.md)：companion 数据模型与 CRUD。
- [`spec-006`](./spec-006-chat-rewrite.md)：chat emotion 输出与消息保存。
- [`spec-010`](./spec-010-billing-entitlements-quota.md)：订阅权益和 Stripe 基础能力。
- [`spec-019`](./spec-019-companion-create-ui.md)：用户创建/编辑 companion 与 neutral 图上传入口。
- [`spec-021`](./spec-021-credits-ledger-and-metering.md)：积分账本、扣费、退款和充值。
- [`spec-022`](./spec-022-image-gen-runninghub-integration.md)：v1 默认 image gen provider（RunningHub）接入；workflow 搭建、签名 URL、webhook 接收等具体集成由 spec-022 落地。
