# spec-033: Profile Outfit Images and User Image Assets

> **类型：** 后端 + Web 前端 + image-gen 接线 | **依赖：** spec-019, spec-022, spec-030, spec-031 | **估时：** 2-4 天 | **状态：** 🟡 in-progress

## Context

聊天内同时出现 `Capture this moment` 和 profile image/style 生成入口会把两种不同语义混在一起：

- `Capture this moment` 是聊天消息的一次场景记忆。
- `Change style` 是 companion profile 上的角色形象管理动作。

本 spec 将 profile style 入口放在 companion profile 图片附近。用户可以反复生成 profile style 图，满意后确认设为当前 profile 图片。所有成功生成的 profile style 图都会进入 Me 的 `My image assets`。

2026-06 v1.1 更新：`Change outfit` 不再是纯 clothing-only edit，而是 profile restyle。它复用 Capture Moment 已验证较好的短 prompt 形态，允许改变 pose、camera view、背景、发型和服装，但仍保持独立 profile 按钮语义，不读取当前聊天场景。

2026-06 v1.2 更新：入口改名为 `Change style`。推荐按钮不再是随机 outfit recommendation，而是 curated profile style preset：每个按钮固定绑定 pose、camera、background、expression、hairstyle、makeup 和男女服装。自定义输入保留为自由兜底，但只作为 style request，不承诺与精选按钮相同质量。本功能独立于 Capture Moment，不读取聊天 scene，也不影响 Capture Moment extractor/final prompt。

2026-06 v1.3 更新：精选 preset 不再使用保守头像化构图，而是沉淀自 `capture-moment-camera-views-*` 预览中验证过的短 prompt 构图。`Change style` 的目标是保留原 profile 脸部身份，同时用精选按钮生成更精致的头像风格图；自定义输入继续作为自由兜底。

## Goals

- Web profile 图片旁显示 `Change style`。
- 用户可选择推荐风格或自定义 prompt，生成、重新生成、预览。
- `Change style` 生成 profile style：保脸，但允许换姿势、镜头、私密 profile 背景、发型和服装。
- 推荐按钮固定控制完整 profile style preset；自定义输入进入 style request 和 outfit 行，但不控制 pose/camera/background。
- 生成开始后即使切换页面或稍后回到 profile，也继续展示最终成功图或明确错误。
- 用户确认后，把该图设为当前用户私有的 profile 图片覆盖。
- 官方 companion 的 canonical `companions.art_url` 不被用户操作修改。
- 成功生成的 profile style 图自动保存到 `user_image_assets`。
- Me 的资产库支持下载和删除；删除当前 profile 覆盖图时回落到 canonical 图。
- 聊天 UI 不提供场景内 `Change outfit` 语义；如保留 profile 管理入口，应显示为 `Change style` / `Change profile style`。

## Non-goals

- 不新增 mobile profile style 生成体验；mobile 只移除错误聊天入口。
- 不删除历史 `chat_outfit_images` 表和旧 API，避免破坏已有 job/history。
- 不新增 credits 扣费策略；如需收费，后续由 credits spec 单独收口。
- 不按当前聊天 scene 改 profile 背景；如需场景同步，后续通过 API 显式传 scene context。
- 不新增 pose/camera/background UI 控件；第一版由后端稳定选择。

## Data Model

新增 `profile_outfit_images`：

- 记录用户对某个 companion 的每次 profile style 生成尝试。
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

## Prompt / Style Strategy

`profile_outfit` 继续复用现有 request/response shape 和 RunningHub workflow key，但产品入口显示为 `Change style`，最终 prompt 不使用 legacy `Only change the clothing` 模板。

- 推荐项返回 6 个 `OutfitRecommendation`，但语义是 curated style preset：`profile_signature`、`profile_cafe_date`、`profile_soft_angle`、`profile_soft_lounge`、`profile_hotel_soft`、`profile_bold_restyle`。
- 每个 preset 固定包含 pose、camera、background、expression、hairstyle、makeup、male outfit、female outfit；用户选哪个按钮就使用哪个完整 preset。
- 推荐 prompt 是短 style summary，不代表完整 final prompt；final prompt 由后端 preset 渲染。
- 自定义 prompt 保留 1-240 字符校验；后端把它放入 `Style request` 和 `Outfit` 行，但不把用户输入当作 pose、camera 或 background 控制。
- custom 默认使用安全 studio preset：standing slight side turn + front three-quarter portrait view + private editorial studio；质量不承诺与精选按钮一致。
- profile 背景固定为独立私密 profile/style 背景，不读取当前聊天 scene。
- 推荐 preset 可以使用已经验证过的高角度、低角度、半躺/侧躺和动态角度，但必须保持单人、脸可识别、背景无人。
- 本功能不修改 `spec-027` 的 Capture Moment prompt/extractor 行为，也不复用 Capture Moment 当前实现常量。
- 当前精选按钮：

| ID | Title | Pose | Camera |
| --- | --- | --- | --- |
| `profile_signature` | Studio Icon | standing slight side turn, face toward viewer | front three-quarter portrait view |
| `profile_cafe_date` | Cafe Date | expressive seated turn, face toward viewer | side-view table-side composition |
| `profile_soft_angle` | Soft Angle | seated S-curve pose, torso angled, face toward viewer | high-angle table-side view |
| `profile_soft_lounge` | Lounge Glow | reclining side pose, face toward viewer | low-angle sofa-side view from below eye level |
| `profile_hotel_soft` | Hotel Soft | half-reclining pose, torso slightly raised, face toward viewer | high-angle view from above, close intimate crop |
| `profile_bold_restyle` | Neon Night | turning under neon light, one shoulder forward, confident stance | dynamic angled composition |

- final prompt 使用短编辑指令：

```text
Edit the input image into a single-character profile style image of the same companion.
Keep only this person's facial identity...
Change the reference pose to: [body_pose]. Do not keep the original portrait pose.
Camera view: [camera_view]. Keep the face visible and recognizable.
Style request (use only for clothing, accessories, colors, and overall styling; ignore any requested pose, camera, background, extra people, or body count): [recommended/custom prompt].
Outfit (overrides any clothing mentioned in the reference): [preset gendered outfit or custom prompt].
Change the background to: [profile background]. The background is empty of other people.
Single companion only, no background figures, no mannequins, no posters of people, no person reflections...
```

Source image selection is cutout-first: if the companion/effective profile image already has a cutout, `profile_outfit` uses it as the reference. If not, the job creates/reuses a companion cutout job and waits for it before submitting to RunningHub.

## Validation

- API：未登录生成返回 401。
- API：生成并完成 profile style 后，资产库出现对应图片。
- API：profile style prompt 包含固定 preset 的 pose/camera/background lines，不再包含 clothing-only / keep-framing wording。
- API：recommended preset 包含 6 个固定精选构图，prompt 使用对应 pose/camera/background。
- API：custom prompt 进入 `Style request` 和 `Outfit` 行，系统 pose/camera/background 仍来自安全 studio preset。
- API：profile style 无 cutout 时先创建 cutout job 并等待；cutout 失败时 profile style 明确失败。
- API：用户不能 apply 其他用户的 generation。
- API：官方 companion 的 public discovery 图不受用户覆盖影响。
- API：删除当前 profile asset 后，覆盖被清除。
- Web：profile style job 在离开页面、返回 profile、重新打开 chooser 后继续轮询，直到 succeeded/failed/cancelled。
- App：`pnpm --filter @xtbit/api test`。
- App：`pnpm --filter @xtbit/app typecheck`。

## Rollback

- 前端可隐藏 profile `Change style` 入口。
- 后端保留新表不影响旧 companion/chat 流程。
- 清除 `companion_profile_images` 即可让用户回落到 canonical `art_url`。
