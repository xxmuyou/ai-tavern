# spec-028: 剧情引导与行动按钮重构（Web 优先）

> **类型：** 前端体验/UI 重构 | **依赖：** spec-024/025/026 | **估时：** 2-3 天 | **状态：** 🟡 in-progress

> **2026-06-08 addendum：** 当前实现把 story beat 主要作为 prompt 目标，并可能在普通 chat turn 后自动完成，用户缺少“剧情在场景中发生”的体感。本 addendum 扩展 spec-028 的范围：引入 scene-driven story moment，把剧情推进落到可见事件、选择、narration 和受校验的 scene transition。下面新增内容覆盖本 spec 早期“后端 API 不改 / 不重写推进规则”的非目标，仅限本 addendum 范围。
>
> **2026-06-16 口径更新：** 见 [spec-040](./spec-040-chat-scene-talk-story-modes.md)。StoryActionBar / story moment 是 `chat_mode = "story"` 的 UI，不是所有带 `scene_id` 的聊天都显示。Talk mode 可以在同一 scene 里自由聊天和使用 scene actions，但不注入 story beat。Story mode 也只消费当前 scene/companion 或用户选择的 scene story 真实存在的 active story moment；没有故事时不编造剧情、不从其它 scene 借剧情。Scene 页面 vNext 先展示 story list / `Create story`，不再把“companion 在这里”作为主入口。

---

## Context

产品定位是 AI 聊天向养成类游戏，但当前体验仍有两个断点：

- 关系、剧情拍、日常状态都已经存在，但用户进入 Today / Scene / Chat 后，仍不容易判断“下一步该做什么”。
- Activity 按钮直接平铺，推荐项、剧情项、普通项层级接近；场景页还同时存在 “Companions present” 和 “Today here” 两套入口，造成重复和混乱。

本 spec 接在已完成的 `spec-026` 后面，不重做 story beat 框架，而是把现有 `active_story_beat`、`next_goal`、`suggested_activity`、`recommended_activity`、`availability` 组织成明确的下一步行动。自建角色剧情线、剧情包、AI 辅助和手动完成动作由后续 `spec-029` 提供；本 spec 的 UI helper 只消费当前可见的 active beat。

## 目标 / 非目标

### 目标

- Web 优先重构 Today、Scene、Chat 三处行动入口。
- 建立统一的前端 `Guided Next Action` 视图模型，让剧情拍优先于关系目标，关系目标优先于日常推荐。
- 每个角色卡只展示一个主 CTA，最多两个次级 CTA；其余 activity 收进 `More actions`，不再同权重平铺。
- Scene Web 页面合并重复的 companion 区域，以 companion-driven action card 展示剧情目标、今日状态和下一步。
- Chat Web 的 activity banner 强化当前活动目标和完成/取消按钮层级，但不加入快捷话术 chips。Story CTA 只在 Story mode 显示，不能污染普通 Talk mode。

### 非目标

- ❌ 后端 API 改动或新增数据库字段。
- ❌ 重写 story beat 推进规则、关系阶段规则或 activity 完成规则。
- ❌ 生成快捷回复 / 建议下一句。
- ❌ Mobile 完整视觉重构；本期只做不破坏一致性的轻量同步。
- ❌ 改动 image generation、unlock、billing 或 credits 逻辑。

## 引导优先级

统一规则：

1. **剧情拍优先。** 若 `active_story_beat.status === "active"`，主 CTA 为 `Continue story`，副文案使用 beat `objective`。
2. **等待剧情门槛时退回关系目标。** 若 `status === "waiting_stage"`，主文案提示需要达到目标 stage，主 CTA 使用关系/推荐 activity。
3. **无剧情拍时使用关系目标。** 使用 `next_goal.label` 与 `recommended_activity` / `suggested_activity`。
4. **关系目标缺失时使用日常状态。** 使用 `activity_hint` 和可用 activity。
5. **不可用状态降级。** `availability === "away"` 时不展示启动 activity 的主 CTA，只展示 `View profile` / `Browse scenes` 等非活动入口。

## 实现步骤

### 1. 新增 Guided Action helper

- 新增前端 helper（建议 `apps/app/utils/guided-action.ts`）。
- 输入：story beat、relationship goal、recommended activity、daily state/activity hint、availability。
- 输出：主标题、副文案、主 activity、状态标签、是否可启动活动、fallback 操作。
- 文案面向英文玩家，保持短句和行动导向。

### 2. 重构 ActivityButtons

- 由“平铺多个同权重按钮”改为：
  - 主 CTA：推荐 activity 或剧情继续行动。
  - 次级 CTA：最多 1-2 个。
  - `More actions` 展开区：其余 activity。
- 保留现有 `start activity -> chat` 跳转行为。
- `availability === away` 时只显示不可用说明，不允许启动 activity。

### 3. Web Scene 页面重排

- 合并 “In the room” 与 “Today, with them” 的重复展示。
- 每个 companion 使用统一 action card：
  - 角色头像 / 名称。
  - 剧情拍状态：active / waiting stage / none。
  - 今日状态摘要。
  - 一句明确下一步文案。
  - 主 CTA + 次级 CTA。
- Scene hero 只承载场景氛围和标签，不再承担“下一步怎么做”的说明。

### 4. Today 与 Chat 同步

- Today card 使用同一套 guided action 文案和 ActivityButtons 层级。
- Chat Web 的 ActivityContextBanner 强化当前活动：
  - 当前活动标题 + scene。
  - activity_hint / daily state。
  - `Complete activity` 为主按钮，`Cancel` 为弱按钮。
- 不加入建议回复 chips，保持自由输入为核心。

### 5. Mobile 轻量同步

- Mobile Scene/Today 复用 ActivityButtons 的新层级，避免按钮继续平铺。
- 不做移动端页面结构大改。

## 验证

1. `pnpm --filter @xtbit/app typecheck`
2. `pnpm --filter @xtbit/app lint`
3. Web 手测：
   - 有 active story beat 的 Scene card 显示剧情目标和 `Continue story`。
   - waiting stage 显示目标 stage，并推荐推进关系的 activity。
   - 无 story beat 时回退到 relationship goal / daily activity。
   - away 状态不显示可启动 activity。
   - Today、Scene、Chat 三处 CTA 不互相矛盾。
4. 回归：
   - 启动 activity 后仍进入 chat，并携带 `activityId` / `sceneId` / `sceneArt`。
   - Chat relationship HUD、unlock celebration、moment image capture 不受影响。

## 回滚

- Helper 和 UI 组件均为前端本地改动；若出现问题，可恢复旧 `ActivityButtons` 与 Scene Web 的双区域布局。
- API 新字段没有新增，旧客户端兼容性不受影响。

---

## 2026-06-08 Addendum：Scene-driven Story Moments

### 背景

当前产品在剧情推进上有明显割裂：AI 可能在聊天里说“我送她回家了 / 我们去了某处”，但前端没有 scene transition、没有可见事件、没有玩家选择，用户不知道自己究竟在哪里。现有 `active_story_beat` 只把 `opener/objective` 注入 prompt，并在 chat/event 后 best-effort 完成；这更像“聊天目标”，不像游戏里的“场景剧情”。

本 addendum 的目标是把 story beat 变成可玩的 scene moment；该 moment 只在 Story mode 中呈现：

- 进入场景或打开聊天时，当前 scene/companion 的 active beat 能呈现为一个可见剧情事件。
- 玩家通过按钮选择动作，系统插入 narration、写进度/记忆/关系，并在合法时切换 scene。
- AI 可以写剧情意图和 `scene_hint`，但最终 `scene_id` 必须由系统从预设 scene 表中匹配和校验。

### 产品规则

1. **只有预设 scene 才能成为可持续聊天地点。**
   - 如果 choice 解析出合法且已解锁的 `target_scene_id`，点击后可以切换 scene，后续聊天带新 `scene_id`。
   - 如果没有匹配 scene，不能假装进入不存在的地点。

2. **没有目标 scene 时只能 stay 或 offstage。**
   - `stay`：动作发生在当前 scene，例如 `Offer to walk her home`、`Ask if she wants company`。
   - `offstage`：剧情可以一次性发生并完成，例如 `<narration>You walk her home through the quiet street...</narration>`，但不进入新聊天地点。

3. **AI 不能直接落地结构化 ID。**
   - AI/AI-assisted arc 只能生成 `intent`、`scene_hint`、按钮文案和 narration。
   - 系统根据 `scene_hint` 匹配 active/unlocked scenes，填充最终 `target_scene_id` 和 `transition_mode`。
   - AI 写出的疑似 scene id 只能当 hint，不能直接信任。

4. **AI 不能私自完成物理剧情推进。**
   - Chat prompt 要禁止 companion 自己宣称“我们已经到了 / 我已经送你回家了 / 我们换到某处了”。
   - AI 可以提出、接受、拒绝或情绪化回应行动；真正的移动和完成由 story action / event resolve 承载。

### 数据与接口计划

扩展 story beat 的可玩内容，优先作为后端派生字段返回，后续再决定是否落 DB 字段：

```ts
type StoryMoment = {
  beat_id: string;
  title: string;
  arrival_narration: string;
  objective: string;
  choices: StoryChoice[];
};

type StoryChoice = {
  id: string;
  label: string;
  intent: string;
  user_narration: string;
  result_narration: string;
  scene_hint: string | null;
  target_scene_id: string | null; // 系统解析后填；AI 不可直接落地
  transition_mode: "stay" | "offstage" | "scene";
  completes_beat: boolean;
};
```

API 增量：

- `POST /scenes/{id}/enter`
  - 在 `companions_present[].active_story_beat` 旁返回可选 `story_moment`。
  - 当 active beat 与当前 scene 匹配且 stage 已满足时生成。
- `GET /chat/{companionId}/story-moment?scene_id=...`
  - 聊天页处于 `chat_mode = "story"` 时读取当前可触发 moment，避免只依赖 scene enter。
  - Talk mode 不调用或不展示该结果。
  - 若当前 scene/companion 没有 active moment，返回 `story_moment: null`；客户端隐藏 StoryActionBar。
- `POST /companions/{companionId}/story-choices/{choiceId}/resolve`
  - 请求带当前 `scene_id`、可选 `activity_id`。
  - 后端重新校验 beat 是否 active、choice 是否属于该 beat、target scene 是否 active/unlocked。
  - 返回 `{ result_narration, transition_mode, target_scene, completed_beat, unlocks }`。

兼容策略：

- 不删除现有 `active_story_beat` 字段；旧客户端继续只看到目标/CTA。
- v1 可先从 `opener/objective` 派生 2-3 个通用 choices；AI-assisted/user-written arc 后续可保存更精细 choices。
- 若无法解析或目标 scene 不合法，choice 自动降级为 `stay` 或 `offstage`，不报错、不切 scene。

### Scene 匹配规则

系统匹配 `scene_hint` 时按保守顺序：

1. exact id/name match（忽略大小写和空格/短横线差异）。
2. scene tags / mood 包含 hint 关键词。
3. intent 白名单映射，例如：
   - `walk_home` → 优先 `apartment_door` / `night_street` / `residential_street`
   - `go_for_coffee` → `cafe` / `coffee_shop`
   - `walk_outside` → `park` / `street` / `riverside`
4. 多个候选时选 display_order 最小且 unlocked 的 scene。
5. 无候选或未解锁时不切 scene，降级为：
   - `stay`，如果 choice 是询问/提出行动。
   - `offstage`，如果 choice 是一次性完成行动。

### 前端体验计划

- **Scene enter / story selection：** vNext Scene 页面先展示当前 scene stories 和 `Create story`。用户选择 `Start story` / `Continue story` 后，如果返回 `story_moment`，再显示 `EventPopup` 风格的剧情弹窗。
  - 顶部显示当前 scene 名和 beat title。
  - 正文显示 `arrival_narration`。
  - 按钮显示 `choices[].label`。

- **Chat：** 仅在 `chat_mode = "story" && scene_id` 时，在输入框上方显示 `Story Action Bar`。
  - 文案：当前 objective。
  - 主按钮：第一个推荐 choice。
  - 次级按钮：展开全部 choices。
  - 用户点击 choice 后，聊天中插入 `user_narration`，resolve 成功后插入 `result_narration`。
  - Talk mode 即使有 `scene_id` 也不显示 Story Action Bar；只保留自由输入和 scene actions。

- **Scene transition：**
  - `transition_mode === "scene"`：前端切 `scene_id` / `scene_art`，再插入 `<narration>You arrive at {sceneName} together.</narration>`。
  - `transition_mode === "offstage"`：不切 scene，只插入 result narration 并提示 `Story moment completed`。
  - `transition_mode === "stay"`：不切 scene，继续当前聊天。

- **可见性：**
  - 没有 choices 时不显示空按钮。
  - 目标 scene 未解锁时不显示“Go there”式按钮，只显示 `Ask / Offer / Stay` 这类当前场景动作。
  - 已完成 beat 不再反复弹出；只在 timeline/memory 中保留结果。

### Prompt 约束

Chat prompt 增加规则：

- 当前 scene 是物理现实；不能自行切换地点。
- 如果剧情需要离开当前 scene，只能提出邀请/请求/选择，不要直接叙述已经抵达。
- 如果系统提供了 `story_moment` 或用户点击了 story choice，AI 要承认这个事件，但不要重复宣称系统状态、choice id、points 或 metadata。

AI-assisted story arc prompt 增加规则：

- 生成 `intent` 和 `scene_hint`，不要生成可信 `target_scene_id`。
- 每个 choice 必须能在 `stay/offstage/scene` 三种模式之一里成立。
- 不确定目标 scene 是否存在时，优先写成 `offer/ask/stay` 类型 choice。

### 实现步骤

1. **后端 story moment 派生**
   - 新增 helper：从 active story beat、当前 scene、companion、可用 scenes 派生 `StoryMoment`。
   - 先用 deterministic 模板生成 2-3 个 choices；AI-assisted choices 后续接入。
   - 实现 scene hint 解析与 transition_mode 降级。

2. **Resolve 端点**
   - 新增 story choice resolve route。
   - 插入/返回 narration，不直接调用 chat LLM。
   - 根据 choice 更新 story progress、relationship unlocks、memory hook；scene transition 只返回目标，由前端切。

3. **前端 scene/chat 呈现**
   - Scene 页面复用 `EventPopup` 或新增 `StoryMomentPopup`。
   - Chat 页面增加 `StoryActionBar`。
   - resolve 后向本地 history append user/result narration；scene transition 时更新背景和 scene state。

4. **关闭旧自动完成坑**
   - 对 UI-managed / user-owned arcs，普通 chat turn 不再自动完成 beat。
   - legacy official `completion_mode: auto` 可短期保留，但 prompt 要禁止物理转场由 AI 私自完成。
   - 新增测试覆盖“普通聊天不会把 manual/story-choice beat 标记完成”。

5. **文档与内容治理**
   - 更新 story authoring 说明：所有“去某地”的 choice 必须有 `scene_hint`，且必须能在无 scene 时降级。
   - 官方 seed 内容避免写无法落地的固定地点；若写“home”，必须提供可替代的 `street/building door/offstage` 方案。

### Test Plan

- API tests：
  - 有 active beat 时 scene enter 返回 `story_moment`。
  - choice resolve with unlocked target scene 返回 `transition_mode: "scene"` 和 target scene。
  - choice resolve with missing/locked target scene 降级为 `stay` 或 `offstage`。
  - AI/choice 伪造不存在 scene id 不会被信任。
  - manual/story-choice beat 不会因普通 chat turn 自动完成。

- App typecheck/lint：
  - `pnpm --filter @xtbit/app typecheck`
  - `pnpm --filter @xtbit/app lint`

- API suite：
  - `pnpm --filter @xtbit/api test -- src/story-beats src/scenes src/chat`

- Manual QA：
  - 进入含 active beat 的 scene，弹出剧情 moment。
  - 点击 stay choice，聊天里出现用户动作和结果 narration，scene 不变。
  - 点击 offstage choice，beat 完成但 scene 不变。
  - 点击 scene choice，scene/background 切换，后续 AI 知道新 scene。
  - 缺少目标 scene 时不显示假“去那里”按钮。
