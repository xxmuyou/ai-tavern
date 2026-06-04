# spec-033: Profile Outfit Images and User Image Assets

> **类型：** 后端 + Web 前端 + image-gen 接线 | **依赖：** spec-019, spec-022, spec-030, spec-031 | **估时：** 2-4 天 | **状态：** 🟡 in-progress

## Context

聊天内同时出现 `Capture this moment` 和 `Change outfit` 会把两种不同语义混在一起：

- `Capture this moment` 是聊天消息的一次场景记忆。
- `Change outfit` 是 companion profile 上的角色形象管理动作。

本 spec 将换装入口迁移到 companion profile 图片附近。用户可以反复生成换装图，满意后确认设为当前 profile 图片。所有成功生成的换装图都会进入 Me 的 `My image assets`。

## Goals

- Web profile 图片旁显示 `Change outfit`。
- 用户可选择推荐穿搭或自定义 prompt，生成、重新生成、预览。
- 用户确认后，把该图设为当前用户私有的 profile 图片覆盖。
- 官方 companion 的 canonical `companions.art_url` 不被用户操作修改。
- 成功生成的 profile outfit 图自动保存到 `user_image_assets`。
- Me 的资产库支持下载和删除；删除当前 profile 覆盖图时回落到 canonical 图。
- 聊天 UI 移除 `Change outfit`，只保留 `Capture this moment`。

## Non-goals

- 不新增 mobile profile 换装体验；mobile 只移除错误聊天入口。
- 不删除历史 `chat_outfit_images` 表和旧 API，避免破坏已有 job/history。
- 不新增 credits 扣费策略；如需收费，后续由 credits spec 单独收口。

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
- `GET /profile-outfit-images/jobs/{job_id}`
- `PUT /companions/{id}/profile-image`
- `DELETE /companions/{id}/profile-image`

`GET /companions/{id}` 的 `art_url` 返回当前用户有效 profile 图；`GET /companions/public` 始终返回 canonical 图。

## Validation

- API：未登录生成返回 401。
- API：生成并完成 profile outfit 后，资产库出现对应图片。
- API：用户不能 apply 其他用户的 generation。
- API：官方 companion 的 public discovery 图不受用户覆盖影响。
- API：删除当前 profile asset 后，覆盖被清除。
- App：`pnpm --filter @xtbit/api test`。
- App：`pnpm --filter @xtbit/app typecheck`。

## Rollback

- 前端可隐藏 profile `Change outfit` 入口。
- 后端保留新表不影响旧 companion/chat 流程。
- 清除 `companion_profile_images` 即可让用户回落到 canonical `art_url`。
