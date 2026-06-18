# spec-033: Profile Outfit Images and User Image Assets

> **类型：** 后端 + Web 前端 + image-gen 接线 | **依赖：** spec-019, spec-022, spec-030, spec-031 | **估时：** 2-4 天 | **状态：** 🟡 in-progress

## Context

聊天内同时出现 `Capture this moment` 和 `Change outfit` 会把两种不同语义混在一起：

- `Capture this moment` 是聊天消息的一次场景记忆。
- `Change outfit` 是 companion profile 上的角色形象管理动作。

本 spec 将换装入口迁移到 companion profile 图片附近。用户可以反复生成换装图，满意后确认设为当前 profile 图片。所有成功生成的换装图都会进入 Me 的 `My image assets`。

2026-06 v1.1 更新：`Change outfit` 不再是纯 clothing-only edit，而是 profile restyle。它复用 Capture Moment 已验证较好的短 prompt 形态，允许改变 pose、camera view、背景、发型和服装，但仍保持独立 profile 按钮语义，不读取当前聊天场景。

## Goals

- Web profile 图片旁显示 `Change outfit`。
- 用户可选择推荐穿搭或自定义 prompt，生成、重新生成、预览。
- `Change outfit` 生成 profile restyle：保脸，但允许换姿势、镜头、私密 profile 背景、发型和服装。
- 推荐按钮和自定义输入只控制 outfit/accessory slot；pose/camera/background 由系统自动选择。
- 生成开始后即使切换页面或稍后回到 profile，也继续展示最终成功图或明确错误。
- 用户确认后，把该图设为当前用户私有的 profile 图片覆盖。
- 官方 companion 的 canonical `companions.art_url` 不被用户操作修改。
- 成功生成的 profile outfit 图自动保存到 `user_image_assets`。
- Me 的资产库支持下载和删除；删除当前 profile 覆盖图时回落到 canonical 图。
- 聊天 UI 移除 `Change outfit`，只保留 `Capture this moment`。

## Non-goals

- 不新增 mobile profile 换装体验；mobile 只移除错误聊天入口。
- 不删除历史 `chat_outfit_images` 表和旧 API，避免破坏已有 job/history。
- 不新增 credits 扣费策略；如需收费，后续由 credits spec 单独收口。
- 不按当前聊天 scene 改 profile 背景；如需场景同步，后续通过 API 显式传 scene context。
- 不新增 pose/camera/background UI 控件；第一版由后端稳定选择。

## Data Model

新增 `profile_outfit_images`：

- 记录用户对某个 companion 的每次 profile 换装生成尝试。
- 通过 `image_generation_jobs` 执行 provider job。
- `output_key` 成功后自动保存到 `user_image_assets`。

新增 `companion_profile_images`：

- 主键为 `(user_id, companion_id)`。
- 保存当前用户对该 companion 的 `art_key` 覆盖。
- 官方角色不改 `companions.art_url`；用户侧 detail/chat/moment source 优先使用覆盖图。

## API

- `GET /companions/{id}/profile-outfit/recommendations`
- `POST /companions/{id}/profile-outfit/generate`
- `GET /companions/{id}/profile-outfit/latest`
- `GET /profile-outfit-images/jobs/{job_id}`
- `PUT /companions/{id}/profile-image`
- `DELETE /companions/{id}/profile-image`

`GET /companions/{id}` 的 `art_url` 返回当前用户有效 profile 图；`GET /companions/public` 始终返回 canonical 图。

## Prompt / Restyle Strategy

`profile_outfit` 继续复用现有 request/response shape 和 RunningHub workflow key，但最终 prompt 不再使用 legacy `Only change the clothing` 模板。

- 推荐项仍返回 3 个 `OutfitRecommendation`：`profile_signature`、`profile_soft_lounge`、`profile_bold_restyle`。
- 推荐 prompt 来自 Capture Moment 的 curated outfit candidates，并结合 companion stable style profile 与 relationship stage。
- 自定义 prompt 保留 1-240 字符校验；后端只把它放入 outfit/accessory request 行，不把用户输入当作 pose、camera 或 background 控制。
- profile 背景固定为独立私密 profile/restyle 背景，例如 private editorial studio、private lounge、soft private room。
- pose/camera/background 使用稳定 bundle，按 `companionId + outfitPrompt` 选择，并按 relationship tier 限制亲密度。
- final prompt 使用短编辑指令：

```text
Edit the input image into a single-character profile restyle of the same companion.
Keep only this person's facial identity...
Change the reference pose to: [body_pose]. Do not keep the original portrait pose.
Camera view: [camera_view]. Keep the face visible and recognizable.
Outfit request (use only for clothing, accessories, and styling): [recommended/custom prompt].
Change the background to: [profile background]. The background is empty of other people.
Single companion only...
```

Source image selection is cutout-first: if the companion/effective profile image already has a cutout, `profile_outfit` uses it as the reference. If not, the job creates/reuses a companion cutout job and waits for it before submitting to RunningHub.

## Validation

- API：未登录生成返回 401。
- API：生成并完成 profile outfit 后，资产库出现对应图片。
- API：profile outfit prompt 包含 pose/camera/background restyle lines，不再包含 clothing-only / keep-framing wording。
- API：profile outfit 无 cutout 时先创建 cutout job 并等待；cutout 失败时 profile outfit 明确失败。
- API：用户不能 apply 其他用户的 generation。
- API：官方 companion 的 public discovery 图不受用户覆盖影响。
- API：删除当前 profile asset 后，覆盖被清除。
- Web：profile outfit job 在离开页面、返回 profile、重新打开 chooser 后继续轮询，直到 succeeded/failed/cancelled。
- App：`pnpm --filter @xtbit/api test`。
- App：`pnpm --filter @xtbit/app typecheck`。

## Rollback

- 前端可隐藏 profile `Change outfit` 入口。
- 后端保留新表不影响旧 companion/chat 流程。
- 清除 `companion_profile_images` 即可让用户回落到 canonical `art_url`。
