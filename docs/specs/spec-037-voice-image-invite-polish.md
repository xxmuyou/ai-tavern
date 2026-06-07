# spec-037: Voice Labels, Image Job Continuity, and Scene Invite QA

> **类型：** 文档 + 前端 + 小幅 API 契约收口 | **依赖：** spec-027, spec-033, spec-036, voice architecture | **估时：** 1-2 天 | **状态：** 📝 draft

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
- 部署核查：
  - dev：运行 `pnpm deploy:dev` 或至少使用脚本里的 `assert_web_entry_matches` 思路验证线上 Pages entry 与本地 dist 一致，并检查 `/api/health`。
  - prod：同样用 `pnpm deploy:prod` 的二次确认流程；部署后抽查 bundle 是否包含 invite/image/voice 新文案。

## Test Plan

- `pnpm --filter @xtbit/app typecheck`
- `pnpm --filter @xtbit/app lint`
- `pnpm --filter @xtbit/api test -- voice moment outfit invite`
- Web 手测：
  - Companion edit：不同语言 voice 的语言分组和 voice 标签不再全部显示中文。
  - Chat：点击 `Capture this moment` 后切到别页、继续发消息、再回来，任务要继续到成功图或错误。
  - Companion profile：点击 `Change outfit` 后切页再回来，任务继续到成功预览或错误。
  - Chat invite：按钮可见；有目标时能选、发送、收到同意后切场景；无目标时有明确空态。

## Assumptions

- “voice 是什么语言，就把标签改为那个语言”默认覆盖语言分组和声音名展示；不改 MiniMax `voice_id`。
- “outfit change”默认指当前可见的 profile `Change outfit`，不是已废弃的 legacy chat outfit 入口。
- 图片生成不会因为前端离开而取消；目标是恢复轮询、展示最终成功或错误。
