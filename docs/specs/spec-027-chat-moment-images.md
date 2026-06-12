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
  - 若已有 `queued` / `pending` / `processing` moment image，自动恢复轮询直到成功或失败；切换页面、继续聊天或刷新 history 不应让任务在 UI 上“停下”。
  - 若没有 scene context，仍允许 private-chat moment fallback（当前后端支持 `scene_id = NULL`）；UI 是否展示入口由产品体验决定，但不能和后端契约冲突。
- 文案建议：
  - 按钮 tooltip / label：`Capture this moment`
  - pending：`Capturing...`
  - failed：`Try again`

## Prompt Context

v1.2 使用受控 `visual action extractor` / pose planner 提炼姿态，再由后端规则拼接最终生图 prompt。这个 extractor 不是聊天总结器；它只把当前这一轮转译成“companion 一个人在画面中可见的姿态、服装和反应”。最终 RunningHub prompt 仍由代码生成，并继续承担场景、单人约束和无 UI/文字等硬规则。

**身份策略（v1.4）**：底层是 Qwen-Image-Edit 编辑模型，已持有 companion cutout 作参考图。**脸由参考图像锁定，不由文字锁定**——模型直接保留输入图里那张脸。因此最终 prompt **不写任何 appearance/族裔/五官文字**：文字描脸对身份保持零增益，而 `appearance` 自由文本把不可变的脸与可变的发型/服装混在一起，写进去只会把旧发型旧服装带回来、与"随场景换装"自相矛盾。最终 prompt 只用一句 `Keep only this person's facial identity…` 配合参考图锁脸，并保留**一个 gender 单词锚点**防性别漂移；**发型、服装、表情、身体姿势、构图全部随场景同步变化**。

**最终图片 prompt 只放可渲染的具体视觉指令**。`appearance`、名字、relationship_role、relationship stage、personality 等**都不拼进最终图片 prompt**：appearance 因"脸靠参考图、文字会带回旧造型"而排除；名字是无视觉收益且易诱发画面文字的 token；relationship/personality 是不可渲染的抽象概念，仅作 pose planner 输入。

> 注意：这里的"放开服装/发型"是 `chat_moment` 这一 workflow 的策略；与 spec-030 的 `profile_outfit` 换装功能（独立 workflow，其 prompt 仍锁 hairstyle/body 以保持同一造型换装）是两套不同流程，不构成矛盾。

后端从来源 message 和上下文加载：

- `source_message`：最新 companion reply，只作为 pose planner 的上下文输入；不得把 `<narration>...</narration>` 或回复片段原样回退进最终图片 prompt。
- `previous_user_message`：同一 thread 中来源 message 前一条 user message，用来判断用户刚刚做了什么；该内容不能原样进入最终图片 prompt，必须转译成 companion 的单人可见反应。
- `scene`：`name / mood / tags / art_url`；prompt 使用 name、mood、tags，不依赖 art_url 合成。
- `time`：用户本地 `time_slot`，如 `morning / afternoon / evening / night`。
- `companion`：`name / appearance / personality / relationship_role / gender`。其中**仅 `gender`** 进最终图片 prompt（作单词锚点 `Companion gender: …`）；`appearance` **不进**最终图片 prompt（脸由参考图锁定，文字会带回旧造型）；`name / personality / relationship_role` 仅作 pose planner 输入。注意 `appearance` 字段本身不删，它在 profile_outfit / emotion_art / 聊天文本人设 / story-beats 等链路仍正常使用——只是不进 chat_moment 这一条 prompt。
- `relationship`：当前 stage，仅作 pose planner 输入（影响亲密程度、距离感、姿态氛围），不再以 `Relationship stage: …` 行进入最终图片 prompt。v1.5 起 stage 同时映射为 4 档造型尺度（`reserved / warm / romantic / intimate`，见 `moment-style.ts`）：正向阶段递进（first_contact/familiar→reserved，trusted/close_friend→warm，romantic_tension/dating→romantic，committed→intimate），负向阶段（strained/hostile/estranged）一律 reserved；尺度只作为 `Styling boldness:` 指令进入 planner 输入，硬上限为"性感不露点"（never nude / never topless / 不透视 / 公共场所不内衣）。
- `scene privacy / venue`（v1.5）：由 scene tags 推断、无 DB 改动。tags 含 `intimate / bedroom / hotel / home` 或无 scene（Private chat）→ private，否则 public；场所分 8 桶（nightlife / bedroom / home_private / dining / beach(预留) / active / outdoor_public / indoor_quiet），驱动 LLM 场所化换装与预设兜底造型。
- `emotion/status`：来源 message 的 emotion，如 `warm / playful / guarded / tense / annoyed`，映射为画面状态。
- `activity`：若聊天来自 activity，加入 `activity_type`、`activity_hint`、daily mood/availability。
- `story_beat`：若当前 scene 有 active story beat，加入 `title / objective`，但不强行剧透未完成内容。

### Visual Action Extraction

`visual action extractor` 优先复用现有 `image_prompt_assist` LLM task。默认模型配置为最低成本 DeepSeek 路径：`deepseek / deepseek-chat`；首次调用 `temperature: 0`、`max_tokens: 260`，并要求结构化 JSON 输出。若 dev/prod 环境缺少 `image_prompt_assist` 的 `llm_config`，实现阶段补 seed/migration；当前迁移已包含默认 DeepSeek 配置。

内部输出形状：

```ts
type MomentVisualAction = {
  body_pose: string;
  hand_action?: string;
  gaze?: string;
  expression?: string;
  outfit?: string; // 贴合场所/季节/活动的单人服装，覆盖参考图原服装（schema 层 required）
  hairstyle?: string; // v1.5：随场景换发型，命令式行注入（schema 层 required）
  makeup?: string; // v1.5：可选妆容
  held_or_nearby_props?: string;
  scene_position?: string;
};
```

提取规则：

- 输出必须只描述 companion 一个人；禁止出现 `user`、`another person`、`two people`、`couple`、`crowd`、`together`、`lap`、`embrace`、`kiss`、`held by`、`holding hands`、`reflection`、`duplicate body` 等会引入第二人、亲密身体接触或重复肢体的描述。
- 用户动作要转译成 companion 的单人反应：用户送花 → `she holds a small bouquet close to her chest`；用户点咖啡 → `she sits with a coffee cup near her hands`；用户邀请去某处 → `she stands near the doorway, turning back toward the viewer`。
- 亲密互动不画第二个人，也不逐字保留身体接触：牵手、拥抱、靠近、从某人腿上起身等动作转译成 viewer 视角的单人姿态，例如 `she reaches one hand slightly toward the viewer`、`she leans a little closer while looking at the viewer`、`she sits alone near the bed edge, adjusting fabric with one hand`。
- companion narration 只作为上下文，不允许原样复制；用户消息只补足 props、触发动作和可见反应。
- **强制换装（v1.5）**：`outfit` 与 `hairstyle` 必须是为当前场所刻意选择的新造型，禁止默认素色便装（cardigan/sweater/jeans 仅限寒冷户外）；场所→造型映射示例写入 system prompt（夜店→裙装+妆发、白天广场/公园→俏皮街拍、卧室→居家/睡衣、海滩→泳装/夏裙、健身房→运动装），尺度按 `Styling boldness:`（stage 4 档）执行，硬上限不露点。
- **背景锁定（v1.5）**：背景位置已固定并单独渲染，extractor 不得迁移场景；`body_pose` / `scene_position` 必须发生在给定 scene 内。
- **重试与预设兜底（v1.5）**：首次调用失败（异常/JSON 不合法/风险词命中）时升温重试一次（`temperature: 0.5` + 追加 strict reminder user message；temp=0 重复相同输入会复现同样的坏输出）。两次均失败时使用按 场所×尺度档 的预设造型表（`presetMomentStyle`，女表 8×4 + 男装精简表）拼出 fallback action，保证任何路径出图都换装换发型；旧的 `an outfit that naturally fits the scene` 泛化兜底已废弃。extractor 成功但缺 outfit/hairstyle 时由 `ensureRestyle` 用同一预设表补齐。图片生成不能因为动作提取失败而失败，也不能回退到 raw narration。

最终 prompt 示例结构（v1.4：脸靠参考图锁定；无 appearance/名字/relationship/personality，仅留 gender 锚点）：

```text
Edit the input image into a single-character scene image of the same companion.
Keep only this person's facial identity: the same recognizable face and facial features as the input image. The hairstyle, outfit, expression, body pose, and camera framing may all change to match the new scene.
Keep exactly one person in the image — this companion only. Do not add any other people, ...
The companion looks directly at the viewer, ...; do not render any camera, phone, or photographic device.
Moment pose: sits alone at the cafe table.
Hands/props: one hand near a coffee cup, coffee cup.
Outfit (overrides any clothing mentioned in the reference): light summer dress.
Change the hairstyle to: soft curled hair.
Makeup: natural date makeup.
Gaze: eyes toward the viewer.
Expression: shy warm smile.
Position in scene: near the cafe window.
Exactly one person: this companion only. The viewer/user is not visible. No second person, no crowd, no extra body, no hand from another person.
Companion gender: female.
Change the background to: Pier Coffee Shop, morning, warm cafe atmosphere, ...tags. The background is empty of other people.
Single companion only, natural composition, no other people, ..., no text, no UI, no speech bubbles, no visible camera or photographic device.
```

**背景路人双措辞（v1.5）**：上面示例是 private 场景的严格措辞。public 场景（如 Plaza/Livehouse）为真实感放宽为远景虚化路人，但单主体守卫保留：

```text
Keep exactly one person in focus — this companion only. Do not add a second main subject, the user, an opponent, or anyone near the companion; no duplicate bodies.
...
Exactly one person in focus: this companion only. The viewer/user is not visible. No second main subject, no hand from another person.
...
Change the background to: ... A few distant passersby may appear far behind, small and blurred, none near the companion, no other face in focus.
Single companion in focus, natural composition, no crowd, no second main character, no one near the companion, no text, no UI, no speech bubbles, no visible camera or photographic device.
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
- `mode = 'create'`；当存在 companion cutout/source image 时，RunningHub provider 会走 load-image + prompt 的 img2img/参考图路径。
- `workflow_key = 'chat_moment'`（若未配置，dev/mock 可 fallback）
- `output_prefix = 'chat-moments'`

## Workflow / Provider

- RunningHub 可配置 workflow key：`chat_moment`。
- 当前 RunningHub workflow 是 URL 输入型 workflow：`loadImageFieldName = "url"`，不绑定 checkpoint/LoRA；workflow 不声明底模架构。
- 需要同时配置 load-image node 和 prompt node；业务 prompt 仍注入 prompt node，source image 传短期签名 URL。
- 旧 `loadImageFieldName = "image"` 会触发 upload/fileName 路径，不适用于当前 URL 输入 workflow。
- mock provider 返回可预测图片 key，保证 API 和前端测试不依赖外部生图服务。

## 验证

1. API：
   - user message 不能生成 moment image。
   - companion message 无 `scene_id` 时返回 422。
   - message 不属于当前用户时返回 404/403。
   - 同一 message 重复点击返回已有 pending/succeeded 记录。
   - `prompt_snapshot` 包含 scene、time slot、companion、emotion 和净化后的单人姿态，不直接包含会引入第二人的 user action 原文。
   - 任何路径（extractor 成功/失败/兜底）的 `prompt_snapshot` 都必须含 `Outfit (overrides...)` 与 `Change the hairstyle to:` 行（v1.5 强制换装保证）。
   - DeepSeek / `image_prompt_assist` 不可用或返回非法 JSON 时先升温重试一次，仍失败则使用 场所×尺度 预设造型 fallback，不回退旧 narration 抽取。
2. Job：
   - `chat_moment_image` job 入队并调用 image-gen provider，RunningHub 请求包含 signed URL 和 prompt。
   - job succeeded 后更新 `story_moment_images.output_key/status`。
   - job failed 后保留错误码，前端可 retry。
   - 送花场景最终 prompt 只描述 companion 拿花，不出现第二个人。
   - 咖啡场景最终 prompt 捕捉杯子、手部、桌前姿态。
   - 邀请换场景最终 prompt 捕捉 companion 的单人转身、门口或回望动作。
   - LLM 输出多人风险词时 validator 拦截并 fallback。
   - public 场景措辞允许远景虚化路人但保留单主体守卫；private 场景维持严格无人措辞。
   - committed + 卧室/酒店类 private 场景兜底造型为浴巾/真丝睡裙档；first_contact 同场景为居家保守档。
3. 前端：
   - 最新 companion message 有 scene context 时显示小相机按钮。
   - queued/processing/succeeded/failed 状态展示正确。
   - 历史已有 moment image 时直接展示。
   - pending/processing 状态在页面切换、发送新消息、history refresh 后恢复轮询。
4. 静态检查：
   - `pnpm --filter @xtbit/api test`
   - `pnpm --filter @xtbit/api typecheck`
   - `pnpm --filter @xtbit/app typecheck`
   - `pnpm --filter @xtbit/app lint`

## 回滚

- 前端可隐藏按钮，已有 `story_moment_images` 记录不影响聊天。
- API 字段对旧客户端不可见；message 历史仍按原逻辑返回。
- 若 `chat_moment` 未配置，生产应返回明确 `provider_not_configured`，dev/mock 可继续通过测试。
