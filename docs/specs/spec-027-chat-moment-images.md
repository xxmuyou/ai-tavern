# spec-027: Chat Moment Images（场景聊天瞬间图）

> **类型：** 后端 + 前端 + image-gen 接线  |  **依赖：** spec-006(chat), spec-007(scenes), spec-014/024(life + HUD), spec-020/022(image-gen), spec-026(story beats)  |  **估时：** 3-5 天  |  **状态：** 🟡 in-progress

---

## Context

当前聊天已经能携带 `scene_id`、`activity_id`、relationship stage、每轮 emotion/signals；spec-026 又让 scene 能返回 companion 当前 story beat。下一步可以把这些上下文转成一张“这一刻”的场景图，让用户在对话里产生更强的共同经历感。

典型体验：

> 用户在 Pier Coffee Shop 和 Maya 聊天。刚刚的对话里提到“点了咖啡”，当前时间是 morning，Maya 的 emotion 是 `warm` 或 `tense`。用户点击最新 companion 回复旁的小相机按钮，系统生成一张完整场景图：Maya 坐在对面，手边有咖啡，早晨光线落在桌面上，她略显害羞地看向用户。

本 spec 不做抠图、不做立绘替换、不要求和 portrait 像素级一致。它生成的是完整的场景瞬间图（story/chat moment），不是 companion portrait。

## 目标 / 非目标

### 目标

- 在有 scene context 的聊天中，最新 companion 回复旁显示生成按钮。
- 根据最近一轮聊天内容 + scene + time slot + companion + activity + relationship stage + emotion/status + active story beat 规则拼接 prompt。
- 生成图片 job，完成后把图片挂回来源 message，作为可回看的 moment。
- 复用现有 `image_generation_jobs`、provider、RunningHub workflow 配置和 mock provider。
- 为后续回忆相册、scene history、companion gallery 留出数据字段。

### 非目标

- ❌ 不做人物抠图或前景/背景合成。
- ❌ 不做 pose/controlnet 强控制。
- ❌ 不承诺与 companion portrait 完全一致。
- ❌ 不开放用户编辑 prompt；v1 保持沉浸式一键生成。
- ❌ 不在无 scene 的普通聊天中展示按钮。
- ❌ 不替代表情立绘；emotion-art 仍是聊天 UI 表情层，moment image 是场景记忆层。

## 产品体验

- 入口：最新 companion message 旁的小相机按钮，仅当该 message 有 `scene_id` 且属于当前用户可访问的 thread 时显示。
- 点击后：
  - 立即进入 `queued` / `processing` 状态。
  - 按钮变为 loading，避免重复创建多个 job。
  - 成功后在该消息下方展示图片 card。
  - 失败后展示 retry 状态和简短错误。
- 历史消息：
  - 若已有 moment image，直接展示。
  - 若没有 scene context，不展示生成入口。
- 文案建议：
  - 按钮 tooltip / label：`Capture this moment`
  - pending：`Capturing...`
  - failed：`Try again`

## Prompt Context

v1 使用规则拼接，不额外调用 LLM 提炼 prompt。后端从来源 message 和上下文加载：

- `source_message`：最新 companion reply，优先提取 `<narration>...</narration>` 中的动作、表情、场景描述；没有 narration 时使用回复摘要片段。
- `previous_user_message`：同一 thread 中来源 message 前一条 user message，提取用户刚刚做了什么或说了什么。
- `scene`：`name / mood / tags / art_url`；prompt 使用 name、mood、tags，不依赖 art_url 合成。
- `time`：用户本地 `time_slot`，如 `morning / afternoon / evening / night`。
- `companion`：`name / appearance / personality / relationship_role / gender`。
- `relationship`：当前 stage，用于亲密程度、距离感、姿态氛围。
- `emotion/status`：来源 message 的 emotion，如 `warm / playful / guarded / tense / annoyed`，映射为画面状态。
- `activity`：若聊天来自 activity，加入 `activity_type`、`activity_hint`、daily mood/availability。
- `story_beat`：若当前 scene 有 active story beat，加入 `title / objective`，但不强行剧透未完成内容。

示例 prompt 结构：

```text
Create a cinematic in-scene moment, first-person perspective from across the table.
Companion: Maya, [appearance], [personality].
Scene: Pier Coffee Shop, morning, warm cafe light, quiet harbor atmosphere.
Recent action: the user just ordered coffee; Maya sits opposite them with a cup in her hands.
Emotional state: shy but warm.
Relationship stage: familiar; keep the body language gentle and not overly intimate.
Story objective: Maya is trying to decide whether to share what she was sketching.
Full environment image, natural composition, no text, no UI, no speech bubbles.
```

## API / Data Model

新增 API：

- `POST /chat/messages/{message_id}/moment-image/generate`
  - 只允许生成 companion message。
  - message 必须属于当前用户 thread。
  - message 必须有 `scene_id`。
  - 若该 message 已有 pending/succeeded moment image，返回现有记录，避免重复扣费。
- `GET /moment-images/jobs/{job_id}`
  - 返回 job 状态、错误信息和成功后的 `output_key` / image URL。

新增表：

```sql
CREATE TABLE story_moment_images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  thread_id       TEXT NOT NULL REFERENCES threads(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  scene_id        TEXT NOT NULL REFERENCES scenes(id),
  activity_id     TEXT REFERENCES activity_contexts(id),
  story_beat_id   TEXT REFERENCES companion_story_beats(id),
  emotion         TEXT,
  prompt_snapshot TEXT NOT NULL,
  job_id          TEXT NOT NULL REFERENCES image_generation_jobs(id),
  output_key      TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (user_id, message_id)
);
```

`image_generation_jobs` 复用现有队列表，新增：

- `task = 'chat_moment_image'`
- `mode = 'text_to_image'`
- `workflow_key = 'chat_moment'`（若未配置，dev/mock 可 fallback）
- `output_prefix = 'chat-moments'`

## Workflow / Provider

- RunningHub 新增可配置 workflow key：`chat_moment`。
- v1 只要求 prompt node；不要求 load image node。
- 如果未来 workflow 支持参考图，可选传 companion neutral portrait 作为软参考，但这不属于 v1 验收条件。
- mock provider 返回可预测图片 key，保证 API 和前端测试不依赖外部生图服务。

## 验证

1. API：
   - user message 不能生成 moment image。
   - companion message 无 `scene_id` 时返回 422。
   - message 不属于当前用户时返回 404/403。
   - 同一 message 重复点击返回已有 pending/succeeded 记录。
   - `prompt_snapshot` 包含 scene、time slot、companion、emotion、最近聊天内容。
2. Job：
   - `chat_moment_image` job 入队并调用 image-gen provider。
   - job succeeded 后更新 `story_moment_images.output_key/status`。
   - job failed 后保留错误码，前端可 retry。
3. 前端：
   - 最新 companion message 有 scene context 时显示小相机按钮。
   - queued/processing/succeeded/failed 状态展示正确。
   - 历史已有 moment image 时直接展示。
4. 静态检查：
   - `pnpm --filter @xtbit/api test`
   - `pnpm --filter @xtbit/api typecheck`
   - `pnpm --filter @xtbit/app typecheck`
   - `pnpm --filter @xtbit/app lint`

## 回滚

- 前端可隐藏按钮，已有 `story_moment_images` 记录不影响聊天。
- API 字段对旧客户端不可见；message 历史仍按原逻辑返回。
- 若 `chat_moment` 未配置，生产应返回明确 `provider_not_configured`，dev/mock 可继续通过测试。
