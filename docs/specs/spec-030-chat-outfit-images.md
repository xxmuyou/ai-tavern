# spec-030: Chat Outfit Images（聊天换衣服图）

> **类型：** 后端 + 前端 + image-gen 接线  |  **依赖：** spec-006(chat), spec-020/022(image-gen), spec-027(chat moment images)  |  **估时：** 2-4 天  |  **状态：** 📝 draft / legacy

> **2026-06 修订：** 聊天内 `Change outfit` UI 已废弃。`profile_outfit`、`chat_outfit_images` 和旧 API 可保留用于历史数据/兼容，但新产品入口迁移到 [`spec-033 Profile Outfit Images and User Image Assets`](./spec-033-profile-outfit-image-assets.md)。聊天 UI 只保留 `Capture this moment`。

---

## Context

聊天里已经有 `Capture this moment` 的图片生成链路：companion message 下方按钮触发后端 job，队列调用 image-gen provider，RunningHub 或 mock 完成后写入 R2，再由前端轮询展示。换衣服属于同一类高成本、异步、可回看的聊天内图像动作，应该复用这套 job / webhook / 轮询基础设施，而不是另起一条同步生图链路。

Legacy 目标体验：

> 用户和 Maya 聊天时，点某条 companion 回复下方的“Change outfit”。系统给出 3 个与当前场景/时间相符的穿搭推荐，也允许用户输入自己的衣服提示词。生成成功后，该消息下方出现一张换装图。

新行为不再使用聊天消息作为入口。换装图现在属于 profile 图片管理：用户在 companion profile 图片旁生成并确认，确认后成为当前用户私有 profile 图片覆盖，详见 spec-033。

第一版使用 `art_url` 作为源图参考，通过 RunningHub 新 workflow `profile_outfit` 走现有 `variation` 图生图路径。这里不引入正式 `edit` mode，也不接 credits 扣费。

## 目标 / 非目标

### 目标

- ~~在聊天里的 companion message 下增加换衣服入口。~~ 已废弃；聊天 UI 不再渲染此入口。
- 支持系统推荐穿搭和用户自定义穿搭 prompt 两种输入。
- 系统推荐使用规则模板，不调用 LLM；根据 scene / time slot / activity / relationship stage 做稳定选择。
- 生成图片 job，完成后把图片挂回来源 message，作为聊天内可回看的 outfit image。
- 复用 `image_generation_jobs`、RunningHub generic image job、webhook/cron reconciliation、mock provider。
- 在 RunningHub 配置中新增 `profile_outfit`，mode 仍为 `variation`。

### 非目标

- 不替换角色长期图片，不清空或重算 `art_emotions`。
- 不改现有角色图片字段、展示逻辑或现有文案命名。
- 不提供“设为角色图片”按钮。
- 不接 credits 扣费；`billing_ref` 保持 `NULL`。
- 不引入正式 `ImageGenMode = "edit"`，不增加 mask/inpainting 协议。
- 不用 LLM 生成推荐穿搭，避免额外成本、延迟和安全过滤复杂度。
- 不允许一条消息保留多个换装版本；第一版每条消息最多一个结果。

## 产品体验（Legacy，仅供历史兼容）

- 入口：每条 server-side companion message 下方展示一个换衣服按钮；本地 streaming 占位消息不显示。当前前端不再展示该入口。
- 点击按钮后打开一个轻量面板：
  - 上方展示 3 个系统推荐穿搭。
  - 下方提供自定义输入框。
  - 用户选择推荐项或输入自定义 prompt 后点击生成。
- 状态：
  - `idle`：显示换衣服入口。
  - `choosing`：展示推荐 + 自定义输入。
  - `capturing`：按钮 loading，禁止重复提交。
  - `ready`：展示生成图。
  - `error`：展示 retry。
- 历史消息：
  - 若已有 `outfit_image` 且成功，直接展示图片。
  - 若已有 pending/processing，恢复轮询。
  - 若已有 failed/cancelled，允许重试。
- 文案建议：
  - 入口：`Change outfit`（当前不再展示）
  - 推荐按钮：展示简短标题，如 `Rainy cafe`, `Soft date`, `Street casual`
  - pending：`Changing...`
  - failed：`Try again`

## Prompt 策略

### 推荐穿搭

v1 使用内置规则模板池，后端根据上下文选择 3 个推荐项。推荐项结构：

```ts
type OutfitRecommendation = {
  id: string;
  title: string;
  prompt: string;
};
```

上下文来源：

- `scene`: 当前 message 的 `scene_id` 对应的 `name / mood / tags`；无 scene 时使用 `Private chat`。
- `timeSlot`: 用户 timezone 推导出的 `morning / afternoon / evening / night`。
- `activity`: 若 message 有 `activity_id`，加入 activity type / mood / hint。
- `relationshipStage`: 当前 relationship stage，用于避免过度亲密或不合关系阶段的服装。
- `companion`: `name / gender / appearance / personality / relationship_role`。

推荐选择规则：

- 每次返回 3 个稳定候选，优先覆盖不同风格：日常、场景适配、稍正式/约会感。
- scene tags 命中 cafe / office / gym / rooftop / bar / park / library / market 等关键词时，优先选择对应模板。
- night / evening 可偏向晚间外套、柔和灯光、稍正式；morning / afternoon 偏向清爽日常。
- 关系 stage 低时避免过于亲密或暴露的描述；高 stage 也只提升精致度，不生成 NSFW。

### 自定义 prompt

- 后端 trim 后接受 1-240 字符。
- 空 prompt 返回 `400 prompt_required`。
- 超长返回 `400 prompt_too_long`。
- 命中裸露、性暗示、未成年化等基础 unsafe 词返回 `422 unsafe_prompt`。
- 自定义 prompt 只描述服装/配饰/风格；最终 prompt 仍由后端包裹身份保持和安全约束。

### 最终 prompt

最终发送给 provider 的 prompt 使用规则拼接：

```text
Create a single-character outfit variation using the provided companion image as the visual reference.
Keep the same identity, face structure, hairstyle, body type, age impression, art style, camera angle, and framing.
Only change the clothing, accessories, and small styling details requested below.
Outfit request: [recommended/custom prompt].
Companion: [name], [gender], [appearance].
Scene context: [scene/time/activity summary]. Use this only to choose outfit mood, not to add extra people.
The character has exactly one head, two arms, two hands, and one body. No duplicate body parts.
Single companion only. No text, no UI, no speech bubbles, no logos, no extra characters, no nudity, no lingerie, no fetish outfit.
```

RunningHub negative prompt 继续使用现有 `ANATOMY_NEGATIVE`，并通过 `profile_outfit.negativePromptNodeId` 注入。

## API / Data Model

新增 API：

- `GET /chat/messages/{message_id}/outfit-image/recommendations`
  - 只允许当前用户可访问的 companion message。
  - 返回 `{ recommendations: OutfitRecommendation[] }`，固定 3 个。
- `POST /chat/messages/{message_id}/outfit-image/generate`
  - 只允许当前用户可访问的 companion message。
  - request body 二选一：

```json
{ "source": "recommended", "recommendation_id": "rainy_cafe_layered" }
```

```json
{ "source": "custom", "prompt": "a black oversized hoodie with silver zipper details" }
```

  - 若该 message 已有 pending/processing/succeeded outfit image，返回现有记录，避免重复生成。
  - 若已有 failed/cancelled outfit image，允许用新 prompt 重试并 relink 新 job。
  - companion 缺少 `art_url` 时返回 `422 source_image_required`。
- `GET /outfit-images/jobs/{job_id}`
  - 返回 job 状态、错误信息和成功后的 `output_key`。

新增表：

```sql
CREATE TABLE chat_outfit_images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  thread_id       TEXT NOT NULL REFERENCES threads(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  prompt_source   TEXT NOT NULL, -- recommended / custom
  outfit_prompt   TEXT NOT NULL,
  prompt_snapshot TEXT NOT NULL,
  job_id          TEXT NOT NULL REFERENCES image_generation_jobs(id),
  output_key      TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (user_id, message_id)
);

CREATE INDEX idx_chat_outfit_images_message ON chat_outfit_images (message_id);
CREATE INDEX idx_chat_outfit_images_job ON chat_outfit_images (job_id);
```

`image_generation_jobs` 复用现有表：

- `task = 'chat_outfit_image'`
- `mode = 'image_to_image'`
- `workflow_key = 'profile_outfit'`
- `prompt = prompt_snapshot`
- `output_prefix = 'chat-outfits'`
- `billing_ref = NULL`

Chat history response 新增字段：

```ts
type ChatOutfitImage = {
  job_id: string;
  status: MomentImageStatus;
  output_key: string | null;
};

type ChatMessage = {
  outfit_image?: ChatOutfitImage | null;
};
```

## Workflow / Provider

- `config/runninghub-workflows.dev.json` 与 `config/runninghub-workflows.prod.json` 新增 `profile_outfit`。
- `profile_outfit.mode = "variation"`，不扩展 `image_workflows.mode` CHECK。
- 必填配置：
  - `workflowId`
  - `loadImageNodeId`
  - `promptNodeId`
  - `promptFieldName`
- 推荐配置：
  - `negativePromptNodeId`
  - `negativePromptFieldName`
- dev 可回填真实 workflow/node id；prod 可先留空，生产未配置时返回明确 provider config error。
- `scripts/sync-runninghub-workflows.sh` 必须同步 `negativePromptNodeId` / `negativePromptFieldName` 到 D1，否则 JSON 中配置的负面提示节点不会生效。

## 实施步骤

1. 新增 migration：创建 `chat_outfit_images` 表和索引。
2. 新增 `image-gen/outfit-image.ts`：
   - prompt/recommendation builder。
   - create/retry job。
   - process job。
   - reconcile outfit row from generic image job。
3. 新增 `chat/outfit-routes.ts`：
   - recommendations endpoint。
   - generate endpoint。
   - job status endpoint。
4. 在 `index.ts` 注册 outfit routes。
5. 在 `queue-dispatcher.ts` 里把 `chat_outfit_image` 路由到 outfit processor。
6. 在 chat history 加载 companion messages 的 `outfit_image`。
7. 更新 shared app API types 与 `companion-client`。
8. ~~新增 `OutfitImageCapture` 前端组件，并接入 mobile/web chat screen。~~ 已由 spec-033 废弃；当前前端不再保留该组件。
9. 更新 RunningHub dev/prod config 与 sync 脚本。
10. 补 API、job、config、前端 typecheck/lint 验证。

## 验证方式

API：

- 非 companion message 返回 422。
- 不属于当前用户的 message/thread 返回 404。
- companion 缺少 `art_url` 返回 `source_image_required`。
- 自定义空 prompt / 超长 prompt / unsafe prompt 返回对应错误。
- 同一 message 重复点击 pending/succeeded 返回已有记录，不重复入队。
- failed/cancelled 记录可重试并更新新 job。
- recommendations 始终返回 3 个安全候选。

Job：

- `chat_outfit_image` job 入队后调用 provider。
- provider request 使用 `source_art_url = companion.art_url`、`workflow_key = profile_outfit`。
- webhook/cron 完成 generic image job 后，job status endpoint 能 reconcile `chat_outfit_images.output_key/status`。

Config：

- `parseWorkflows` 能读取 `profile_outfit` 和 negative prompt 字段。
- `scripts/sync-runninghub-workflows.sh dev --dry-run` 输出 `profile_outfit`，且 SQL 包含 negative prompt columns。

前端：

- 历史已有 outfit image 时直接展示。
- pending/processing 状态恢复轮询。
- idle 状态可打开推荐/自定义面板。
- 生成成功后图片展示在对应 message 下方。

静态检查：

```bash
pnpm --filter @xtbit/api test
pnpm --filter @xtbit/api typecheck
pnpm --filter @xtbit/app typecheck
pnpm --filter @xtbit/app lint
```

## 回滚

- 当前前端已移除 `OutfitImageCapture`；如需回滚 spec-033，只隐藏 profile 换装入口即可，旧 chat outfit API 仍保留。
- API 字段对旧客户端向后兼容；旧客户端忽略 `outfit_image`。
- 已存在 `chat_outfit_images` 不影响聊天主流程。
- 若 `profile_outfit` 未配置或 RunningHub 不稳定，生成端点返回 provider config/provider error，聊天仍可正常使用。
- 不涉及 credits 扣费，因此无需退款或释放预占积分。

## 依赖

- [`spec-006-chat-rewrite`](./spec-006-chat-rewrite.md)：messages / threads / chat history 基础。
- [`spec-020-companion-emotion-art-generation`](./spec-020-companion-emotion-art-generation.md)：image provider 抽象与 generic image jobs。
- [`spec-022-image-gen-runninghub-integration`](./spec-022-image-gen-runninghub-integration.md)：RunningHub workflow 配置和 webhook/cron 结果处理。
- [`spec-027-chat-moment-images`](./spec-027-chat-moment-images.md)：聊天内异步图片生成 UI/API 模式。
