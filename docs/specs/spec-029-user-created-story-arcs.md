# spec-029: User-created Story Arcs（自建角色剧情线与剧情包）

> **类型：** 后端 + 前端 + LLM + 内容模板  |  **依赖：** spec-002(LLM), spec-010/021(entitlements + credits), spec-019(companion creation), spec-026(story beats), spec-028(guided action UI)  |  **估时：** 5-8 天  |  **状态：** 🟡 in-progress

> **2026-06-16 entry-point update：** 见 [spec-040](./spec-040-chat-scene-talk-story-modes.md)。`Make story` / story authoring 不再作为 companion create 的最后一步。故事编辑入口迁移到 Scene 页面：用户在某个 scene 下选择官方 preset story 或点击 `Create story` 创建私有 scene story。本文档中关于模板、手写、AI 辅助、任务编辑和进度的能力仍可复用，但 UI 入口不再挂在创角流程末尾。

---

## Context

产品定位是 AI 聊天向养成类游戏。官方 companion 数量有限，用户会大量自建角色；如果自建角色只能自由聊天 + 数值增长，就会回到“纯 sandbox，没有明确下一步”的老问题。

`spec-026` 已经提供了通用 `companion_story_beats` / `user_story_progress` 框架，但它的交付切片主要验证官方 seed beat 与 scene/chat 接线。当时写的“自创角色可无 beat”只代表该 spec 的范围边界，不代表当前产品方向。

本 spec 负责补上用户自定义剧情能力：用户可以在 Scene 页面选择剧情包、自己写轻量剧情线，或用 AI 辅助生成 3-5 个 story tasks/beats；推进时由用户或系统明确的 story action 标记完成，避免聊天一轮后系统误判剧情已经结束。

## 目标 / 非目标

### 目标

- 用户可以在 scene 下拥有一条或多条 user-owned story。
- 提供官方剧情包模板，例如 `Slow Burn Romance`、`Healing Trust`、`Workplace Tension`、`Mystery Stranger`。
- 支持轻量编辑：story title、task title、objective、opener/intro、stage gate、排序。
- 支持 AI 辅助：用户选择剧情包或写一句 outline，LLM 草拟 3-5 个 beats，用户确认后保存。
- 剧情完成改为用户显式操作：`Mark as done` / `Reopen`。
- 公开用户自建 companion 时，story arc 默认私有，可选择共享为只读剧情线。
- 免费用户可使用基础模板和手写；当前实现中 AI draft 走 Pro-only，credits 定价未定前不启用 credits 扣费。

### 非目标

- ❌ 不做复杂分支、失败线、多结局或长期记忆自动改写。
- ❌ 不让 LLM 自动判断 beat 是否完成。
- ❌ 不做完整公开角色市场、审核后台或商业分成。
- ❌ 不替换官方 scene preset story；官方线仍可按内容团队方式维护。
- ❌ 不重写 spec-028 的按钮布局；本 spec 只提供可被引导 UI 消费的剧情数据和完成动作。

## 数据模型

> **Compatibility note:** 本节的 `companion_story_arcs` / `companion_story_beats` 模型是早期 companion-owned story 设计与 legacy fallback。新入口以 [spec-040](./spec-040-chat-scene-talk-story-modes.md) 的 `scene_stories` / `scene_story_tasks` / `user_scene_story_progress` 为准：story authoring 属于 Scene，progress scope 为 `user + story + companion`。除非明确做 legacy 迁移，不应再把 companion create 结束后导向这里。

新增 arc 分组表：

```sql
CREATE TABLE companion_story_arcs (
  id                 TEXT PRIMARY KEY,
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  owner_user_id      TEXT REFERENCES users(id),
  title              TEXT NOT NULL,
  source_type        TEXT NOT NULL, -- official_seed | template | user_written | ai_assisted
  template_id        TEXT,
  outline            TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  shared_with_public INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
```

新增剧情包模板表：

```sql
CREATE TABLE story_arc_templates (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  relationship_role TEXT,
  description       TEXT NOT NULL,
  beat_blueprint    TEXT NOT NULL, -- JSON array: title/objective/stage_gate/scene_hint
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
```

扩展 `companion_story_beats`：

```sql
ALTER TABLE companion_story_beats ADD COLUMN arc_id TEXT REFERENCES companion_story_arcs(id);
ALTER TABLE companion_story_beats ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
ALTER TABLE companion_story_beats ADD COLUMN source_type TEXT NOT NULL DEFAULT 'official_seed';
ALTER TABLE companion_story_beats ADD COLUMN is_user_editable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companion_story_beats ADD COLUMN completion_mode TEXT NOT NULL DEFAULT 'manual';
```

语义：
- 官方 seed beat 可回填一个 `official_seed` arc，保持旧数据兼容。
- 用户自建角色的 arc owner 必须是 companion owner。
- 公开共享只影响 arc/beat 是否可被其他用户看到；每个用户自己的 `user_story_progress` 仍独立。
- `completion_mode = manual` 是新路线默认值。旧的自动完成只作为 spec-026 历史切片兼容，不再作为 UI-managed arc 的默认体验。

## API / LLM / UI

### API

- `GET /companions/{id}/story-arcs`
  - owner 可看到私有 + 共享 arc；非 owner 只能看到 official/shared arc。
- `POST /companions/{id}/story-arcs/from-template`
  - 从 `story_arc_templates` 创建用户可编辑 arc。
- `POST /companions/{id}/story-arcs/assist`
  - Pro-only。
  - 输入 `template_id?`、`outline?`、`relationship_role`、companion card 摘要。
  - 返回未保存 draft beats，用户确认后保存。
- `PUT /companions/{id}/story-beats/{beatId}`
  - 仅 owner 可编辑 user-owned beat。
- `POST /companions/{id}/story-beats/{beatId}/complete`
  - 用户手动完成当前 beat，写入 `user_story_progress.completed_beat_ids`。
- `POST /companions/{id}/story-beats/{beatId}/reopen`
  - owner 或当前进度用户可重新打开已完成 beat，用于误点修正。

权限：
- 官方 companion 的 official seed beats 不允许普通用户编辑。
- 自建 companion 的 private arcs 只允许 owner 读写。
- 共享 arc 对其他用户只读；其他用户推进时只写自己的 progress，不改原作者内容。

### LLM

新增 task：`story_beat_assist`。

输入：
- companion card：`name / relationship_role / personality / background / want / secret / boundary / speech_style`
- 用户 outline 或 template blueprint
- 目标 beat 数：默认 4，允许 3-5

输出必须是结构化 JSON：

```json
{
  "arc_title": "string",
  "beats": [
    {
      "title": "string",
      "stage_gate": "first_contact | familiar | trusted | close_friend | romantic_tension | dating | committed",
      "scene_hint": "string",
      "opener": "string",
      "objective": "string"
    }
  ]
}
```

后端校验：
- beat 数必须在 3-5。
- opener/objective 必须短，避免把整段剧情写死。
- 不允许输出露骨性内容、违法内容、未成年人恋爱/性内容。
- 不允许直接泄露 `secret`，只能把它作为后续揭露方向。

### UI

- Scene 页面增加 `Create story`，故事编辑不放在 companion create 的最后一步：
  - `Use a story pack`
  - `Write my own`
  - `Ask AI to draft`
  - `Skip for now`
- Scene story editor：
  - 当前 active beat、下一目标、完成状态。
  - 轻量编辑入口。
  - `Mark as done` / `Reopen`。
- Chat / Scene 使用 spec-028 的 guided action：
  - 有 active beat 时主 CTA 是 `Continue story`。
  - beat 内显示明确 objective。
  - 完成只能由用户点击 `Mark as done`，不会因为一轮聊天自动跳下一拍。
- 发布/分享策略待 spec-040 的 scene story ownership 决策确认后再接，不从 companion create 强行暴露。

## 实施步骤

1. Migration：新增 `companion_story_arcs`、`story_arc_templates`，扩展 `companion_story_beats`，回填 official seed arc。
2. Seed：写入 4-6 个基础 story arc templates。
3. API：实现 arc list、from-template、assist draft、beat edit、complete、reopen。
4. LLM：新增 `story_beat_assist` prompt、schema validation、Pro entitlement 检查。
5. UI：Scene page `Create story`、scene story editor、chat/scene 的手动完成入口。
6. Completion：对 UI-managed/user-owned arc 禁用旧自动完成；保留旧 official fallback，后续可统一迁移为 manual。
7. Publish：公开自建 companion 时保存共享开关；非 owner 只读 shared arc。

## 验证

1. 用户创建 companion 后不会被强制进入 story setup，角色仍可 sandbox chat。
2. 用户在 Scene 页面从 template 创建 story 后，scene/chat 能看到 active task/beat。
3. AI assist 返回 draft，不自动保存；确认后才落库。
4. 非 owner 不能读 private arc，不能编辑 shared arc。
5. `Mark as done` 后返回下一 beat 或等待 stage 目标；`Reopen` 后可恢复。
6. 一轮聊天不会自动完成 UI-managed beat。
7. 免费用户可用基础模板和手写；Pro 门禁只挡 AI draft。credits 扣费需要另行确认价格后再接入。
8. `pnpm --filter @xtbit/api test`
9. `pnpm --filter @xtbit/app typecheck`
10. `pnpm --filter @xtbit/app lint`

## 回滚

- 可隐藏 story setup 和 Story panel；已有 arc/beat 数据不影响普通 chat。
- 若 AI assist 不稳定，可关闭 assist 入口，保留 template + 手写。
- 若共享能力暂不开放，发布页隐藏 toggle，所有 user-owned arcs 默认 private。
