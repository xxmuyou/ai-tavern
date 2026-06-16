# spec-040: Chat Scene, Talk Mode, and Story Mode Decoupling

> **类型：** 文档治理 + 后端 API + Web/native chat UX | **依赖：** spec-006(chat), spec-007(scenes), spec-026(story beats), spec-028(guided story actions), spec-036(invite scene), spec-038(web scene immersion) | **估时：** 3-5 天 | **状态：** 🚧 minimum implementation

---

## Context

当前实现和历史文档把 `scene_id` 同时当作“物理地点”和“剧情模式开关”。这会导致普通闲聊只要带上场景，就可能被注入 active story beat，进而让 companion 说话像在推进剧本，而不是在当前地点自然聊天。

本 spec 是后续 chat 场景体验的权威边界：`scene_id` 只表示当前位置；`chat_mode` 才决定本轮是否启用 story beat / StoryActionBar / story choices。

## Minimum Implementation Decision

本轮只做最小可用的 Story mode：

- 如果用户在某个 scene 下开启 Story mode，且该 scene/companion 刚好有 active story beat / story moment，就把这个故事注入对话并显示 StoryActionBar。
- 如果该 scene/companion 没有故事，Story mode 不编造剧情，不从其它 scene/companion 借故事，聊天仍可在当前 scene 中继续。
- Scene roster 只做“删掉无头像候选”的质量修复；不做动态扩容，不把全站 public / online / Discover companion 池灌进 scene。
- 更复杂的案件、灾难、生存、线索、失败条件和多结局玩法，后续另开 Story Scenario Engine spec。

2026-06-16 追加产品决定：

- `Make story` / story authoring 不再放在 companion create 的最后一步。故事编辑属于 Scene 页面，而不是 companion 创建流程。
- Scene 页面主信息不再强调“哪些 companion 在这里”。点击 scene 后，用户首先看到的是当前 scene 可选择/确认的 stories，以及 `Create story` 入口。
- Story mode 应该由用户选择某个 scene story 后自动开启；`scene_id` 仍是物理场景，`story_id` 才指向本次要推进的故事。
- Story 需要显式进度与任务列表，让 UI 和 AI 都知道“下一步应该引导用户完成什么”，而不是只靠一段 objective。

## Goals

- 普通入口进入 chat 时默认 `Talk + Daily Scene`：有地点、有背景、有 scene action，但不注入剧本目标。
- Scene 页面进入 companion chat 时默认 `Story + 当前 scene`：有地点；只有该 companion 在该 scene 有 active story beat / story moment 时，才启用 story beat / story choices。
- 用户可在同一个 scene 内切换 `Talk` 和 `Story`；切换 mode 不清空 scene。
- 邀请到达新 scene 时只更新当前位置，不强制切换 mode。
- Scene roster 必须保持克制：过滤无有效头像的 companion，但不为了“补满场景”把全站公开/线上 companion 强行注入 scene。
- Scene 页面提供 `Create story`，创建/编辑的是 scene-owned story，不是 companion create 的尾部步骤。
- Story selection 是进入 Story mode 的主入口：用户先选择/确认 story，再进入对应 scene 的 Story mode。
- Story 数据提供 progress/tasks，使 AI 可以根据当前任务进行旁白、事件推进和对话引导。

## Non-goals

- 不把 `scene_id` 从普通聊天里移除；自由聊天也可以发生在 scene 中。
- 不把 Story mode 做成线性剧情锁；用户仍可自由输入。
- 不删除无头像 companion 本体数据；本 spec 只要求 Scene 玩法入口不展示无头像候选。
- 不扩容 Scene roster，不把 Discover/public/online companion 池当作 scene 自动补位来源。
- 不实现复杂案件、灾难求生、道具、线索、失败条件或多结局状态机；这类玩法后续另开 Story Scenario Engine spec。
- 不改 billing、credits、voice、image generation 的计费语义。
- 不在 companion create 最后增加 story setup；相关历史入口应移除或改为跳转到 scene story editor。
- 不让 Scene 页面继续把“companions nearby / companions present”作为主要体验文案；这些数据可保留给兼容接口，但新 UI 不应突出展示。

## Core Concepts

### `scene_id`

`scene_id` 是物理场景上下文。它决定：

- 当前背景 / scene art / stage 展示。
- 当前地点名、mood、tags。
- Scene action menu 和 custom scene action 是否可用。
- Chat moment image、activity、memory 中的发生地点。
- 消息落库时的 `messages.scene_id`。

`scene_id` 不决定是否注入 story beat。

`scene_id` 可以影响关系结算节奏，但这仍然不等于 Story mode：如果当前 scene 命中 companion 的 `preferred_scenes`，本轮最终关系 signals 可按关系 modifier 放大；这是确定性的结算规则，不注入 prompt，也不改变聊天模式。

### `chat_mode`

`chat_mode` 是对话模式：

- `talk`：自由闲聊。可带 `scene_id`，但不加载、不注入 `# Current story beat`，不显示 StoryActionBar。
- `story`：剧情模式。必须带 `scene_id`。如果当前 companion 在当前 scene 有 active story beat / story moment，则加载并注入 story objective，展示 StoryActionBar/story choices；如果没有故事，则只保留 scene context，不编造剧情。

默认值为 `talk`，防止旧客户端或漏传客户端因为带 `scene_id` 就误入剧情。

### `story_id`

`story_id` 是 Story mode 的具体故事选择。它和 `scene_id` 分工如下：

- `scene_id`：故事发生在哪里。
- `chat_mode`：当前是自由聊天还是剧情模式。
- `story_id`：Story mode 要推进哪一个 scene story。

v1 的兼容路径仍可从 `companion_story_beats` 推导 story moment；vNext 应新增 scene-owned story API，并让 Story mode 优先读取用户选择的 `story_id`。没有 `story_id` 时，Story mode 可以回退到当前 scene 的默认/官方 active story；如果没有故事，则显示 `No story here yet`，不编造剧情。

### Story Tasks and Progress

Scene story 不是一段静态 prompt。每个 story 至少需要：

- `title`：用户可理解的故事名。
- `synopsis`：短简介，用于 Scene 页面选择/确认。
- `tasks[]`：任务列表，按顺序描述当前故事要完成的步骤。
- `current_task_id` / `progress_percent`：当前进度。
- `ai_guidance`：给 chat prompt 的内部引导，告诉 AI 当前应该推进什么、旁白可以发生什么事件、不要剧透什么。

AI 在 Story mode 下只能使用当前 task/progress 引导用户；不能自行跳到后续任务、不能宣称用户已经完成系统未确认的任务。

## Relationship Pacing Modifier

Talk / Story 解耦后，关系升温可以独立于剧情开关做轻量加速。v1 使用一个确定性 modifier，发生在关系 signals 抽取之后、保存和应用之前：

- Favorite scene boost：本轮有合法 `scene_id`，且该 scene 在 companion `preferred_scenes` 中。Talk 和 Story 都生效。
- Story progress boost：`chat_mode === "story"`，当前 scene story 有 active task，或 legacy scene/companion story beat 有 active 且可自动完成的 beat，并且本轮不是 scene action、custom scene action、legacy gift 或 invite-only 这类辅助动作。
- 多个条件同时满足时不叠加；最多应用一次 `1.5x`。
- 所有非 0 signals 都放大，包括正向和负向：表现好时 `closeness/trust/romance/friendship` 更快上涨；表现差时 `hostility/tension/distance` 或负向 `trust` 也会更快变化。
- 放大后的 signals 继续受现有单轮 clamp 保护，并作为 `messages.signals`、SSE `signals`、relationship apply 和 unlock detection 的最终输入。

这个 modifier 不进入 prompt，不让 companion 直接谈论“这里加分更快”，避免角色话术变得系统化。前端可以在 chat chrome 中显示轻提示，例如 `Relationship grows faster here` 或 `Story progress affects relationship more`，但不弹窗、不打断消息流。

## Entry Rules

| 入口 | 默认 mode | 默认 scene |
|---|---|---|
| Discover / Companion card / Profile `Start chat` | `talk` | companion Daily Scene |
| Scene page story card / `Start story` | `story` | 当前 scene + selected `story_id` |
| Activity start from Today/Scene | `talk` unless explicitly story CTA | activity scene |
| Chat invite accepted + user clicks arrive | keep current mode | target scene |
| User manually switches mode | selected mode | keep current scene |

If `story` is requested without a valid `scene_id`, the client must block the transition and the API should return `400 story_mode_requires_scene`.

Scene story entry is an invite flow, not a silent start: the user selects a story, selects a companion, and the companion can accept or refuse. Accepted opens Story chat with `sceneId + storyId + chatMode=story`; refused keeps the user on the Scene page.

## API Plan

### `POST /chat/{companion_id}/messages`

Request adds:

```ts
chat_mode?: "talk" | "story"; // default "talk"
scene_id?: string;
story_id?: string; // optional selected scene story for Story mode
```

Behavior:

- Always load and inject `Current Scene` when `scene_id` is valid.
- Load and inject `story_beat` only when `chat_mode === "story"` and an active beat exists for the current user, companion, and scene.
- When `story_id` is provided, validate that it belongs to the current `scene_id`, is visible to the current user, and has a current task/progress state. The selected story task becomes the primary Story mode context.
- `chat_mode === "story"` with no active beat is still a valid chat state; it must not invent a scenario or pull story content from another scene.
- Persist `scene_id` on messages in both modes.
- Keep `invite_scene_id` behavior separate: invites are a turn-level action and do not imply Story mode.
- Scene actions and custom scene actions may be sent in either mode, but they are not Story choices and must not auto-complete the active story beat.

### Scene story authoring API

Story authoring belongs under Scene routes. Initial interface work should avoid changing the story engine deeply; the goal is to create stable contracts first.

Proposed endpoints:

- `GET /scenes/{scene_id}/stories`
  - Returns official preset stories and the current user's private stories for this scene.
  - Response items include `{ id, scene_id, title, synopsis, source_type, can_edit, task_count, progress_percent, current_task }`.
- `POST /scenes/{scene_id}/stories`
  - Creates a user-owned scene story draft.
  - Body: `{ title, synopsis?, tasks: StoryTaskDraft[] }`.
  - v1 requires at least one manual task and does not expose AI draft.
- `PATCH /scenes/{scene_id}/stories/{story_id}`
  - Edits title/synopsis/tasks for stories the user can edit.
- `GET /scenes/{scene_id}/stories/{story_id}`
  - Returns full story detail, ordered tasks, and current user's progress. `companion_id` may be supplied so progress resolves at `user + story + companion`.
- `POST /scenes/{scene_id}/stories/{story_id}/tasks/{task_id}/complete`
  - Manually marks the current task complete for `user + story + companion`.
- `POST /scenes/{scene_id}/stories/{story_id}/tasks/{task_id}/reopen`
  - Reopens a completed task for `user + story + companion`.
- `GET /scenes/{scene_id}/story-invite-companions`
  - Returns current-user chatable companion candidates with effective art. This is not the scene roster and does not inject companions into the scene.
- `POST /scenes/{scene_id}/stories/{story_id}/invite`
  - Body: `{ companion_id, message? }`.
  - Runs one structured LLM decision. Accepted and refused both cost one `chat_message` credit; provider/parse failure releases the reservation.
  - Accepted initializes/reads progress and returns chat launch params. Refused returns the companion reply and no chat params.
  - Does not save real chat messages.

Data shape:

```ts
type SceneStory = {
  id: string;
  scene_id: string;
  title: string;
  synopsis: string | null;
  source_type: "official_preset" | "user_written" | "ai_assisted";
  can_edit: boolean;
  progress_percent: number;
  current_task: SceneStoryTask | null;
};

type SceneStoryTask = {
  id: string;
  order: number;
  title: string;
  objective: string;
  ai_guidance: string;
  completion_hint?: string | null;
  status: "locked" | "active" | "completed";
};
```

Resolved product decision: chat still requires a `companion_id`, so Scene story entry asks the user which companion to invite. Stories do not declare a forced cast in v1.

### Edit and regenerate

Edit/regenerate must preserve the active `chat_mode` supplied by the client. A historical message having `scene_id` is not enough to re-enable story beat injection.

## Frontend Plan

- Chat owns two states: `sceneId` and `chatMode`.
- `Talk / Story` switch is visible in chat chrome; Chinese UI may show `闲聊 / 剧情`.
- Scene actions are available whenever `sceneId` exists, regardless of mode.
- Story moment fetch can run only when `chatMode === "story" && sceneId`; StoryActionBar, story objective labels, and story choice resolve render only when that fetch returns a real story moment.
- If Story mode is selected but no story exists for this scene/companion, show a quiet “No story here yet” state or hide StoryActionBar; keep free chat usable.
- 普通入口的 Daily Scene 只设置物理场景；不展示 Story UI。

### Scene page vNext

Scene page should become a story selection surface:

- Primary CTA: `Create story`.
- Main content: list official preset stories and user-created stories for this scene.
- Story card copy: title, short synopsis, current progress, current task, and `Start story` / `Continue story`.
- Remove prominent `X companions nearby` / `Companion is here` copy from Scene page and Scene cards. This wording has low gameplay value and distracts from the story choice.
- If no stories exist, show an empty state that explains this scene has no story yet and offers `Create story`.
- Starting a story opens a companion selector, then sends a story invite. Accepted opens Story mode with the selected `sceneId` + `storyId`; refused stays on the Scene page with the companion reply. It should not depend on the old “companion present” roster UI.

## Scene Roster Quality

Scene roster stays curated and small. It may use the current scene's existing authored/default roster and any existing explicit placement rules, but this spec does not add dynamic backfill from all public, online, Discover, or recently active companions.

Scene roster must use the current user's effective profile image:

```sql
COALESCE(companion_profile_images.art_key, companions.art_url)
```

Rows whose effective art is null must be excluded from `potential_companions` and `companions_present`. This removes historical no-avatar companions from Scene gameplay without deleting them from Discover/Profile/Chat. If filtering leaves a scene with fewer companions, the scene may simply show fewer companions or none; do not compensate by auto-injecting unrelated online companions.

For vNext Scene UI, roster data is compatibility/supporting data only. The Scene page should not market the scene as a list of companions present; story selection is the primary interaction.

## Documentation Cleanup Required

- `spec-026` must no longer say that passing `scene_id` automatically injects story beat.
- `spec-028` must state StoryActionBar/story moments are Story mode UI, not generic scene UI.
- `spec-029` must no longer define story setup as the final companion create step; scene story authoring supersedes that entry point.
- `spec-036` / `spec-038` must state invite arrival changes scene only and keeps current chat mode.
- Product docs must describe Daily Scene as physical location, not剧情 mode.
- Product/API docs must state Scene roster filtering is not scene roster expansion.
- Product/API docs must state Scene stories own story authoring/progress; companion create should not contain `Make story` as a required final step.

## Validation

- Prompt debug for `talk + scene_id` includes `current_scene` and excludes `story_beat`.
- Prompt debug for `story + scene_id` includes both `current_scene` and `story_beat`.
- Favorite scene / active Story progress relationship boost only changes final signals; it must not inject additional prompt text.
- Favorite scene and Story progress boost do not stack; SSE `signals` and `messages.signals` contain the same boosted final values.
- From Profile/Discover, chat opens in Talk with Daily Scene and no StoryActionBar.
- From Scene, chat opens in Story; StoryActionBar appears only when an active moment exists for that scene/companion.
- From Scene, the user first sees selectable stories or `Create story`; choosing a story opens Story mode with `story_id`.
- From Scene with no story moment, chat remains usable in Story mode without injected story objective.
- Scene story cards show task progress and current objective; AI prompt receives only the active task/progress, not future spoilers.
- Switching Talk/Story never clears scene.
- `/scenes` and `/scenes/{id}/enter` do not return no-avatar companion rows.
- `/scenes` and `/scenes/{id}/enter` do not backfill from all public/online companions when rows are filtered.

## Decisions Locked For This Implementation

1. Chat still needs a `companion_id`; Scene story entry asks the user to invite a companion.
2. Story progress is scoped to `user + story + companion`.
3. All users may create/edit their own private scene stories. Official presets are read-only for regular users.
4. `Create story` is manual-only in v1. AI draft belongs to a later task once pricing and quality are settled.

## Rollback

- If mode UI causes issues, clients can temporarily send only `chat_mode: "talk"` while preserving `scene_id`.
- API defaults to `talk`, so old clients remain usable.
- Scene roster filtering is additive safety; no data deletion is required to roll it back.
