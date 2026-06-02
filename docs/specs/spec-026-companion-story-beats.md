# spec-026: Companion Story Beats（角色剧情拍框架）

> **类型：** 后端 + 前端 + 内容 seed  |  **依赖：** spec-005(relationships), spec-006(chat), spec-007(scenes), spec-008(events), spec-024/025(沉浸感)  |  **估时：** 4-6 天  |  **状态：** ✅ done（已合并 `0b8f31c` / 合并点 `99a0548`）

> **进度备注：** 本 spec 已实现并合入 main。已完成项：阶段边界 `closeness >= 20 → familiar`（[stage.ts](../../packages/api/src/relationships/stage.ts)）、`title:familiar` unlock 接入 chat 与 event resolve（[unlocks.ts](../../packages/api/src/relationships/unlocks.ts)）、`companion_story_beats` / `user_story_progress`（migration 0027）、`/scenes/{id}/enter` 返回 `active_story_beat`、chat prompt 注入 active beat、官方 companion 示例 seed。spec-027 在此基础上消费 scene/chat 上下文。

---

## Context

当前 scenes 更像“地点容器”：`/scenes/{id}/enter` 返回 scene、在场 companion、普通 opener、可选 event。关系 HUD 和 unlock 已经接进聊天，但缺一层“这个 companion 当前为什么值得来见”的剧情目标。

同时，`first_contact` 存在明显体验断点：UI 进度按 `closeness / 20` 显示，`closeness = 20` 时会到 100%，但后端 `familiar` 条件是 `closeness > 20`，所以玩家看到 100% 仍停在 `first_contact`，且 `first_contact` 没有任何 unlock。

本 spec 解决两件事：
- 修复关系阶段边界，让 100% 代表已进入下一阶段。
- 新增通用 companion story beat 框架，让 scene 承载 companion 当前剧情拍，而不是写死某个角色的专属逻辑。

## Related Spec

- [`spec-027: Chat Moment Images`](./spec-027-chat-moment-images.md) 是本框架的后续视觉奖励层：story beat 负责“当前 companion 正在推进什么剧情目标”，Chat Moment Image 负责把某一轮有场景上下文的聊天捕捉成图片记忆。
- spec-026 不直接实现生图按钮、prompt snapshot 或图片 job；只保证 scene/chat 能提供足够稳定的 companion、scene、activity、stage、story beat 上下文，供 spec-027 后续复用。

## 目标 / 非目标

### 目标
- `closeness = 20` 进入 `familiar`，并触发 `title:familiar` unlock。
- event resolve 后和 chat 一样跑 `detectAndRecordUnlocks`，返回新增 unlocks。
- 新增 `companion_story_beats` 与 `user_story_progress`，支持任意 companion 挂 3-5 拍线性 arc。
- `/scenes/{id}/enter` 的 `companions_present[]` 返回 `active_story_beat`。
- chat prompt 注入 active beat 的 `opener/objective`，让 companion 主动推进当前剧情。
- seed 少量官方 companion 示例内容，但实现不得绑定具体角色。

### 非目标
- ❌ 复杂分支剧情 / 失败线 / 多结局。
- ❌ 动态改写 companion 长期记忆。
- ❌ 新建独立剧情编辑后台。
- ❌ 把自创 companion 强行生成完整 arc；自创角色可无 beat，走现有 sandbox。
- ❌ 聊天瞬间图生成；该功能单独放入 spec-027，避免把剧情拍框架和 image-gen 管线耦合。

## 数据模型

新增 migration：

```sql
CREATE TABLE companion_story_beats (
  id                TEXT PRIMARY KEY,
  companion_id      TEXT NOT NULL REFERENCES companions(id),
  beat_order        INTEGER NOT NULL,
  title             TEXT NOT NULL,
  stage_gate        TEXT NOT NULL,
  scene_id          TEXT REFERENCES scenes(id),
  opener            TEXT NOT NULL,
  objective         TEXT NOT NULL,
  reward_unlock_key TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  UNIQUE (companion_id, beat_order)
);

CREATE TABLE user_story_progress (
  user_id             TEXT NOT NULL REFERENCES users(id),
  companion_id        TEXT NOT NULL REFERENCES companions(id),
  current_beat_id     TEXT REFERENCES companion_story_beats(id),
  completed_beat_ids  TEXT NOT NULL DEFAULT '[]',
  updated_at          INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);
```

**语义：**
- `stage_gate` 是该 beat 可展示/推进所需的最低正向 stage。
- `scene_id` 为空表示任意 scene 可用；有值时仅在对应 scene 优先展示。
- `reward_unlock_key` 预留给后续 story unlock / memory / scene reward；v1.x 可为空。
- `completed_beat_ids` 存 JSON 字符串，保持 schema 简单，后续需要审计时再拆表。

## API / Prompt

- `GET /scenes` 可保持现状；不强制列表页暴露 story beat。
- `POST /scenes/{id}/enter` 扩展：
  - `companions_present[].active_story_beat`
  - shape：`{ id, title, beat_order, stage_gate, opener, objective, scene_id, reward_unlock_key, status }`
  - `status` 为 `active | waiting_stage | completed`
- `POST /chat/{companionId}/messages` 请求不新增必填字段；若传 `scene_id`，后端自动查该 user/companion/scene 的 active beat 并注入 prompt。
- prompt 新增一小段 `# Current story beat`：
  - `Beat title`
  - `Opening hook`
  - `Current objective`
  - 规则：companion 可以主动提起或推进，但不要强制替玩家做选择。

## 推进规则

- active beat 选择：
  - 按 `beat_order` 找第一个未完成、`stage_gate` 已满足、且 scene 匹配或 scene 为空的 beat。
  - 如果最早未完成 beat 的 stage 未满足，返回 `waiting_stage` 提示。
  - 如果全部完成，返回 `completed` 或 null，前端回退普通 opener。
- 自动完成：
  - 当 user/companion 当前 stage 达到该 beat 的 `stage_gate` 且发生一次 chat turn、event resolve 或 activity completion 时，可标记该 beat 完成。
  - 本期只实现 chat 与 event resolve 两条路径；activity completion 后续接入。
- 完成后：
  - 写入 `user_story_progress.completed_beat_ids`。
  - 若有 `reward_unlock_key`，写入 `relationship_unlocks` 作为 story reward。
  - 下一次进入 scene 返回下一拍或等待下一阶段状态。
  - 后续可由 spec-027 在同一轮聊天或完成活动后生成 Chat Moment Image，作为“这一刻发生过”的视觉记忆。

## 内容 Seed

- 新增 seed migration 写入少量官方 companion 示例 beat，作为框架验证。
- 内容必须使用同一 schema；不在代码里判断特定 companion id。
- 每条 arc 推荐 3-5 拍，示例覆盖不同 stage gate：
  - `first_contact`：初见钩子
  - `familiar`：熟悉阻力
  - `trusted`：私人秘密
  - `close_friend` 或 `romantic_tension`：关键选择

## 验证

1. `relationships/stage.test.ts`：`closeness = 20` 为 `familiar`。
2. `relationships/unlocks.test.ts`：首次到 `familiar` 返回 `title:familiar`。
3. `events/resolve`：事件选项推进阶段时返回 `unlocks`。
4. story beat 单测：
   - 无 beat 时保持兼容。
   - 有 active beat 时 `/scenes/{id}/enter` 返回 `active_story_beat`。
   - stage 未满足时返回 `waiting_stage`。
   - 完成 beat 后下一次返回下一拍。
5. `pnpm --filter @xtbit/api test`。
6. `pnpm --filter @xtbit/app typecheck` 与 `pnpm --filter @xtbit/app lint`。

## 回滚

- 删除 story beat 相关前端展示时，API 新字段可被客户端忽略。
- 删除 migration 需 drop `user_story_progress` 与 `companion_story_beats`；已写入的 `relationship_unlocks` story reward 可保留为孤儿成就，或按 `unlock_key LIKE 'story:%'` 清理。
