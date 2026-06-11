# spec-038: Web 场景沉浸、待到达切换与解锁反馈

> **类型：** Web 前端 + API/types + 文档治理 | **依赖：** spec-024, spec-025, spec-031, spec-036, spec-037 | **估时：** 3-5 天 | **状态：** 📝 draft

---

## Context

spec-036 已把“聊天内邀约去某个场景”接进了 chat prompt、SSE 与前端切换，但当前体验仍偏功能性：

- companion 同意邀约后前端立即切场景，用户没有“确认出发/稍后再去”的控制感。
- Web 场景呈现仍像普通聊天页，切换生硬，未充分利用 scene 图预留空间、背景模糊与 companion cutout。
- 行为反馈、邀约提示、快捷动作提示等本地 UI 文案仍以英文为主，和 chat 回复的语言跟随不一致。
- spec-025/037 写到的解锁/成就反馈在 Web 上不够显性，用户不容易感到“关系推进了”或“新场景解锁了”。

本 spec 是 Web 端沉浸体验的新权威：mobile/native 暂不做视觉改造，只允许共享 API/types/hooks 层随本轮一起更新。

---

## 目标 / 非目标

### 目标

- companion 同意邀约后，Web 不再自动到达；改为“立即到达 / 稍后”的 pending arrival 流程。
- “稍后”后按 companion/thread 维度保留悬浮入口，刷新或离开再回来仍可到达。
- Web chat 改为“场景舞台 + 聊天停靠”：模糊 scene image 作背景，companion cutout 站在 center-lower 区域，聊天面板桌面右侧停靠、窄 Web 视口底部停靠。
- 后端把 cached cutout 暴露给前端，并提供幂等 ensure cutout 端点。
- 本地插入的 action/narration/notice/chrome 支持中英语言跟随。
- Web 解锁反馈进入显著 celebration overlay 队列，覆盖 scene/title/secret/relationship/milestone 类结果。

### 非目标

- 不重做 native/mobile 聊天视觉；默认 `.tsx` 保持现状。
- 不把 pending arrival 服务端持久化；Web 使用 localStorage。
- 不重写 LLM prompt 主体；chat 回复语言规则保持现状。
- 不做完整多语言 i18n；本轮只落地中文/英文，其他语言暂 fallback 英文。

---

## API / Types

### Cutout 展示字段

后端统一暴露：

```ts
art_cutout_url: string | null
```

取值规则与现有 `art_url` 一致：可为对象 key、绝对 URL、data URL 或 blob URL。它是前端展示字段，不暴露内部 job 表结构。

需要补齐的响应：

- `CompanionDetail`
- `SceneCompanionPreview`
- `SceneCompanionPresent`

### Cutout 状态端点

新增认证端点：

- `GET /companions/{id}/cutout`：读取当前 cutout cache 或最近 cutout job 状态。
- `POST /companions/{id}/cutout/ensure`：幂等创建/复用 cutout job。

响应 shape：

```ts
{
  companion_id: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
  art_cutout_url: string | null;
  job_id: string | null;
  error_code: string | null;
  error_message: string | null;
}
```

### invite_result 语义调整

`invite_result.accepted === true` 只表示 companion 同意邀约；不代表用户已经到达，也不要求前端立刻切 `scene_id`。

activity chat 的完成时机改为：用户点击“立即到达”或悬浮入口后，由 Web 前端调用现有 complete activity。后端不在 accepted 时自动 complete activity。

---

## Web Chat UX

### Accepted invite flow

1. 用户从 Web chat 选择目的地并发出可见邀约。
2. SSE 收到 `invite_result.accepted === true` 后创建 `pendingArrival`。
3. Web 显示浮层：`{companion} agreed to go to {scene}` / `{companion}同意一起去{scene}`。
4. 点击“立即到达”：
   - 设置 `sceneId` / `sceneArt` / `sceneName`。
   - 追加本地转场 narration。
   - 若当前有 active activity，调用现有 complete activity 并清理本地 activity。
5. 点击“稍后”：
   - 当前 scene 不变。
   - pending arrival 写入 Web localStorage。
   - 舞台上显示悬浮入口，用户可随时点击到达。
6. 到达或关闭 pending 后清理 localStorage。

所有 Web chat 内 scene 切换共用同一套转场视觉；确认浮层只用于 invite accepted。story transition 可复用转场动画，但不进入 pending arrival 流程。

### Immersive stage layout

- 主背景：当前 scene image 放大、模糊、加暗色 scrim。
- 人物：优先使用 `art_cutout_url`，站在 scene 图预留的 center-lower 区域。
- fallback：缺 cutout 时先用 `art_url`，同时后台调用 ensure cutout；cutout 成功后淡入替换。
- 桌面：聊天面板停靠右侧。
- 窄 Web：聊天面板停靠底部，舞台仍保留人物与 pending arrival 入口。

### Scene naming

- Web 端 `scene.name` 使用直观地点类型名，例如 `Plaza`、`Cafe`、`Restaurant`、`Hotel`、`Park`。
- 氛围、时间、天气、情绪等文学修饰只放在 `mood`/描述里，不塞进 `name`。
- `scene.id` 保持稳定，不因显示名简化而迁移历史消息、story beats 或 events。
- 新增 `restaurant` 是普通日常/约会地点，低门槛通过 `closeness`/`trust` 解锁；不得使用 romance/intimate 类高门槛。

### Scene Action menu

- Web chat 的右侧工具区使用 `Action` 入口，不再把所有场景动作直接铺在舞台边缘。
- 点击 `Action` 后展开当前 scene 的预设动作，预设动作来源以
  [`scene-catalog-v2.md`](../product/scene-catalog-v2.md#scene-action-catalog) 为权威。
- 同一面板提供一次性自定义动作输入。自定义动作通过
  `{ type: "custom_scene_action", text }` 发送到 `POST /chat/{companion_id}/messages`。
- 自定义动作只在当前 turn 发生：不保存到 scene catalog，不变成用户常用按钮，不新增数据库表。
- 后端 trim 文本、要求当前 scene、限制 120 字符，并把动作作为“刚刚发生的可见行为”注入 prompt；前端本地插入对应语言的 narration。
- 自定义动作不应用固定关系分，避免系统误判自由文本；由 companion 回复和普通 relationship signal extraction 承担情绪后果。
- 前端不做本地敏感词系统。若上游模型/API 返回 `content_filter`，Web 显示“换一种描述”的明确提示，不把它当成通用服务器错误。

---

## Language Follow

新增最近用户语言检测：

- 优先从当前 thread 最近一条 user message 判断中文/英文。
- 当前输入 draft 有明显 CJK 时可提前切中文。
- 无历史时用 `navigator.language` 兜底。
- 无法判断或其他语言时 fallback 英文。

本轮本地插入文本覆盖：

- invite narration
- quick action narration
- scene transition narration
- invite accepted/refused notice
- pending arrival 浮层/悬浮入口文案
- unlock/achievement overlay UI chrome

LLM 回复语言规则保持现状，不重写 prompt 主体。

---

## Unlock / Achievement Overlay

Web 新增 `WebUnlockCelebrationOverlay`，替代当前 Web 上的轻量卡片体验。所有触发来源统一进入 celebration queue：

- chat SSE `unlocks`
- story choice resolve 返回的 `unlocks`
- event resolve 返回的 `unlocks`
- event `level_changed` / milestone 类结果映射为 achievement item

Overlay 显示：

- 解锁类型
- 标题
- 简短说明或类型 eyebrow
- CTA

CTA 规则：

- scene unlock：`Invite now` 或 `View scene`
- secret/title/relationship unlock：`View profile`
- milestone/achievement：`Keep chatting`

覆盖层必须显著，但不能永久阻塞：可自动收起，也可由用户手动关闭。

---

## Implementation Notes

- 仅改 `.web.tsx` 和 web 专用组件；共享 API/types/hooks 可改，但 native/mobile 视觉不动。
- localStorage key 需要按 companion/thread 维度隔离。
- cutout ensure 是增强项：失败不影响聊天，继续展示 `art_url` fallback。
- `art_cutout_url` 不保证为公开 URL；前端继续通过现有 `mediaSource` 解析对象 key。
- 旧 spec 中关于 accepted 后“立即切 scene / 后端自动 complete activity”的描述均被本 spec 取代。

---

## Test Plan

### 文档一致性

- README 有 spec-038 条目。
- spec-036/037/031/025 均不再与本 spec 的新体验冲突。

### API tests

- cutout `GET/POST ensure` 权限、幂等、已有 cache、processing job、failed job。
- accepted invite 不再自动完成 activity；activity 在用户点击到达后由前端调用完成。

### Frontend checks

- `pnpm --filter @xtbit/app typecheck`
- `pnpm --filter @xtbit/app lint`
- `pnpm --filter @xtbit/api test -- cutout invite unlock`

### Web manual QA

- 邀约被同意后出现到达浮层，不自动切场景。
- “稍后”后刷新页面仍显示 pending arrival 悬浮入口。
- 点击到达后背景、`scene_id`、转场 narration、后续 prompt scene 均更新。
- cutout 缺失时 fallback 可用，生成完成后透明角色叠入模糊背景。
- 中文用户看到中文动作/反馈；英文用户看到英文动作/反馈。
- 解锁 scene/title/secret/milestone 时出现显著覆盖层和正确 CTA。

---

## Rollback

- API 字段 `art_cutout_url` 可保持向后兼容；旧前端忽略即可。
- 若 Web stage 体验需回滚，可恢复 `.web.tsx` 旧布局，但保留 cutout API 与 invite_result 新语义，避免后端重新自动 complete activity。
- pending arrival localStorage 可安全清理；它不影响服务端状态。

---

## Dependencies

- [`spec-024`](./spec-024-in-chat-relationship-feedback.md)：关系 HUD 与每轮反馈基础。
- [`spec-025`](./spec-025-character-depth-and-unlocks.md)：解锁模型与 SSE unlocks。
- [`spec-031`](./spec-031-companion-cutout-moment-compositing.md)：cutout workflow 与 cache。
- [`spec-036`](./spec-036-in-chat-scene-invitation.md)：聊天内邀约基础。
- [`spec-037`](./spec-037-voice-image-invite-polish.md)：invite 可见性、快捷动作、event/unlock QA 收口。
