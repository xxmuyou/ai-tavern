# spec-037: Voice Labels, Image Job Continuity, Scene Invites, Events, and Gifts

> **类型：** 文档 + 前端 + 后端 API 收口 | **依赖：** spec-008, spec-027, spec-033, spec-036, voice architecture | **估时：** 2-3 天 | **状态：** 🟡 in-progress

## Context

2026-06-07 检查当前实现后确认：

- Voice options 由 `GET /voice/options` 原样返回 `config/minimax-voices.<env>.json`，Companion 创建/编辑表单直接显示 `language_label` 和 `voice.label`。因此编辑页里大量中文标签来自 catalog 展示文案，不是编辑模式特殊逻辑。
- `Capture this moment` 和 profile `Change outfit` 后端 job 都已持久化；切页面后“停下”主要是前端轮询状态存在组件局部，组件卸载后没有可靠恢复/通知。
- 聊天内场景邀请不是只写了文档：本地代码已有 invite-targets、`invite_scene_id`、prompt 注入、`invite_result` SSE 和前端弹窗。spec-036 仍标 in-progress，因为缺端到端验证和部署/可见性收口。
- Dev Web 线上 entry hash 与本地 `apps/app/dist/index.html` 一致，线上 bundle 中能搜到 `invite-targets`、`Invite to go somewhere`、`Capture this moment`、`Change outfit`。若用户仍看不到场景邀请，优先查 UI 入口可见性、目标列表为空、登录/权限、或 API/数据状态，而不是先假设未部署。

## Implementation Changes

- Voice 标签本地化/自语言展示：
  - 在 voice catalog 或 public voice options 派生字段中补 `display_label` / `display_language_label`，保留原 `label` / `language_label` 作为兼容字段。
  - `Language/Region` 分组显示该语言自己的名称：English, 日本語, 한국어, Español, Português, Français, Deutsch, Русский, Italiano, العربية, Türkçe, Українська, Nederlands, Tiếng Việt, ไทย, Polski, Română, Ελληνικά, Čeština, Suomi, हिन्दी；中文保持 `中文（普通话）` / `中文（粤语）`。
  - Voice 下拉优先显示对应语言声音名；已有英文 catalog 的非中文 voice 可直接复用原英文名，中文 voice 保持中文。若某语言只有英文名，先显示英文名，不做机器翻译。
- 图片任务不停下：
  - `Capture this moment`：保持后端 job 逻辑不变，前端在 chat history refresh / 新消息发送后继续读取 `moment_image`，对 `queued` / `pending` / `processing` 自动恢复轮询；轮询结果写回 `useChatHistory`。
  - Profile `Change outfit`：生成开始后把 active job id 挂在 profile 页状态可恢复的位置；重新进入 companion profile 时加载最近未完成的 profile outfit job，继续轮询直到 succeeded/failed/cancelled。
  - 当前新 UI 不恢复 legacy chat outfit 入口；旧 API 继续保留给历史兼容。
- 场景邀请 QA/可见性：
  - 去掉 API 文档中的 `draft` 标记，明确 spec-036 是“已实现、待端到端验证”。
  - 在 Web 和 mobile chat 中核查邀请按钮是否总能被用户发现；如果 invite targets 为空，弹窗要展示原因和下一步，而不是让用户误以为功能不存在。
  - 验证 accepted 后切 `sceneId` / `sceneArt`，后续消息带新 scene；refused 不切，只展示提示。
- 聊天内邀请换场景收口：
  - 邀请入口从纯图标改为清晰的 icon + text action，Web/mobile 都可见。
  - `GET /companions/:id/invite-targets` 改为列出所有已解锁 active scenes，继续支持 `from_scene_id` 排除当前场景；不再要求 `default_companions` 包含该 companion。
  - activity chat 中允许带 `invite_scene_id`；若 companion 同意，后端自动 complete 当前 activity，SSE `invite_result` 返回 `activity_completed: true`，前端清掉 active activity 并切场景。
  - 选择地点后发送可见的对话动作：`<narration>I glance toward the way out, then back at you.</narration>Would you come with me to {sceneName}?`。AI 先在当前 scene 中决定同意/拒绝；若同意，前端切 scene 后追加本地转场 narration：`<narration>You arrive at {sceneName} together.</narration>`。
- 聊天快捷动作（咖啡 / 鲜花）：
  - 聊天输入区新增 `Order coffee` / `Send flowers`；咖啡仅当前 scene name/mood/tags 含 `cafe` 或 `coffee` 时显示，鲜花任意场景显示。
  - 点击后一键发送可见的对话动作：咖啡为 `<narration>I set a coffee down near you.</narration>I got this for us.`；鲜花为 `<narration>I offer you a small bouquet, a little nervous.</narration>These are for you.`
  - `POST /chat/:id/messages` 新增 `quick_action: { type: "gift", item_id: "coffee" | "flowers" }`。后端校验 scene 与 6 小时同 companion/item 冷却，不扣 credits。
  - `quick_action` 只负责结构化记录：后端创建已完成 `activity_contexts` 记录，`metadata` 写入 `{ "quick_action": true, "item_id": "coffee" | "flowers" }`，触发 memory hook；AI 主要从用户可见消息接住动作。
  - 固定关系加成：coffee `{ closeness:+1, trust:+1 }`；flowers `{ romance:+2, closeness:+1, tension:-1 }`。普通聊天 signal extraction 仍照常运行。
  - 有当前 scene 时，prompt 明确角色“physically at”该地点，并要求本轮至少用一个轻量 `<narration>` 细节自然落地场景。
- 场景事件前端闭环：
  - 补齐前端 `EventResponseItem` / option / resolve result 类型和 client。
  - Scene/Chat 页面拉取全部 pending events；优先展示本次 `scenes/:id/enter` 返回的新 event，再展示旧 pending events。
  - 共享 `EventPopup` 展示事件说明与选项，选择后调用 `/events/:id/resolve`，显示结果并刷新关系/解锁。
- 场景解锁呈现：
  - 聊天收到 `unlocks` 时，除轻 toast 外，对新解锁场景显示 `Invite now` / `View scene` 可行动入口。
- 部署核查：
  - dev：运行 `pnpm deploy:dev` 或至少使用脚本里的 `assert_web_entry_matches` 思路验证线上 Pages entry 与本地 dist 一致，并检查 `/api/health`。
  - prod：同样用 `pnpm deploy:prod` 的二次确认流程；部署后抽查 bundle 是否包含 invite/image/voice 新文案。

## Test Plan

- `pnpm --filter @xtbit/app typecheck`
- `pnpm --filter @xtbit/app lint`
- `pnpm --filter @xtbit/api test -- voice moment outfit invite`
- `pnpm --filter @xtbit/api test -- quick-action invite events activity memory`
- Web 手测：
  - Companion edit：不同语言 voice 的语言分组和 voice 标签不再全部显示中文。
  - Chat：点击 `Capture this moment` 后切到别页、继续发消息、再回来，任务要继续到成功图或错误。
  - Companion profile：点击 `Change outfit` 后切页再回来，任务继续到成功预览或错误。
  - Chat invite：按钮可见；有目标时能选、发送、收到同意后切场景；无目标时有明确空态。
  - Chat quick actions：咖啡馆聊天可点咖啡，非咖啡馆隐藏咖啡；任意场景可送花；动作写关系与 memory；6 小时同 item 冷却。
  - Scene/Chat event：进入场景或打开聊天时 pending event 弹出，选项 resolve 后展示结果并刷新关系。

## Assumptions

- “voice 是什么语言，就把标签改为那个语言”默认覆盖语言分组和声音名展示；不改 MiniMax `voice_id`。
- “outfit change”默认指当前可见的 profile `Change outfit`，不是已废弃的 legacy chat outfit 入口。
- 图片生成不会因为前端离开而取消；目标是恢复轮询、展示最终成功或错误。
- 咖啡/鲜花不接 credits、不接商品 catalog、不触发生图；本期只做聊天快捷动作、关系、memory。
