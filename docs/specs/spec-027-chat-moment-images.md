# spec-027: Chat Moment Images（场景聊天瞬间图）

> **类型：** 后端 + 前端 + image-gen 接线  |  **依赖：** spec-006(chat), spec-007(scenes), spec-014/024(life + HUD), spec-020/022(image-gen), spec-026(story beats), spec-040(scene/mode split)  |  **估时：** 3-5 天  |  **状态：** 🟡 in-progress

---

## Context

当前聊天已经能携带 `scene_id`、`activity_id`、relationship stage、每轮 emotion/signals；spec-026 又让 Story mode 能消费 companion 当前 story beat。下一步可以把这些上下文转成一张“这一刻”的场景图，让用户在对话里产生更强的共同经历感。根据 spec-040，`scene_id` 本身只代表物理场景；只有 Story mode 才把 active story beat 纳入上下文。

典型体验：

> 用户在 Pier Coffee Shop 和 Maya 聊天。刚刚的对话里提到“点了咖啡”，当前时间是 morning，Maya 的 emotion 是 `warm` 或 `tense`。用户点击最新 companion 回复旁的小相机按钮，系统生成一张完整场景图：Maya 坐在对面，手边有咖啡，早晨光线落在桌面上，她略显害羞地看向用户。

本 spec 不做手工前景/背景合成，不要求和 portrait 像素级一致。当前 moment pipeline 会使用 companion cutout/source image 作为参考图来保持脸部身份；生成结果仍是一张完整的场景瞬间图（story/chat moment），不是 companion portrait。

## 目标 / 非目标

### 目标

- 在有 scene context 的聊天中，最新 companion 回复旁显示生成按钮。
- 根据最近一轮聊天内容 + scene/Private chat fallback + time slot + companion + activity + relationship stage + emotion/status 拼接 Capture Moment 图片 prompt；active story beat 只做记录关联与未来扩展，不进入 v1.7 图片 prompt。
- Story mode 下，active story beat 仍进入聊天对话 prompt（见 spec-040），用于让 companion 按 story 剧情引导用户完成 story；该聊天上下文不透传给 Capture Moment 图片 prompt。
- 生成图片 job，完成后把图片挂回来源 message，作为可回看的 moment。
- 复用现有 `image_generation_jobs`、provider、RunningHub workflow 配置和 mock provider。
- 为后续回忆相册、scene history、companion gallery 留出数据字段。

### 非目标

- ❌ 不做手工前景/背景合成；cutout/reference source 只用于保脸与保单人主体。
- ❌ 不做 pose/controlnet 强控制。
- ❌ 不承诺与 companion portrait 完全一致。
- ❌ 不开放用户编辑 prompt；v1 保持沉浸式一键生成。
- ❌ 不把无 scene 的入口策略写死为后端限制；后端允许 `scene_id = NULL` 的 Private chat fallback，前端是否展示入口由产品体验决定。
- ❌ 不替代表情立绘；emotion-art 仍是聊天 UI 表情层，moment image 是场景记忆层。

## 产品体验

- 入口：最新 companion message 旁的小相机按钮；前端可默认只在该 message 有 `scene_id` 且属于当前用户可访问的 thread 时显示，但后端契约允许 `scene_id = NULL` 的 Private chat moment fallback。
- 点击后：
  - 立即进入 `queued` / `processing` 状态。
  - 按钮变为 loading，避免重复创建多个 job。
  - 成功后在该消息下方展示图片 card。
  - 失败后展示 retry 状态和简短错误。
- 历史消息：
  - 若已有 moment image，直接展示。
  - 若已有 `queued` / `pending` / `processing` moment image，自动恢复轮询直到成功或失败；切换页面、继续聊天或刷新 history 不应让任务在 UI 上“停下”。
  - 前端轮询只在存在 pending moment image 时发生；没有触发生图或没有未完成 job 时，不会空转查询 RunningHub。
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
- `scene`：`name / mood / tags / art_url`；prompt 使用 name、mood、tags，不依赖 art_url 合成。若 message 无 scene context，则使用 `Private chat`、`private conversation`、空 tags 的 fallback。
- `time`：用户本地 `time_slot`，如 `morning / afternoon / evening / night`。
- `companion`：`name / appearance / personality / relationship_role / gender`。其中**仅 `gender`** 进最终图片 prompt（作单词锚点 `Companion gender: …`）；`appearance` **不进**最终图片 prompt（脸由参考图锁定，文字会带回旧造型）；`name / personality / relationship_role` 仅作 pose planner 输入。注意 `appearance` 字段本身不删，它在 profile_outfit / emotion_art / 聊天文本人设 / story-beats 等链路仍正常使用——只是不进 chat_moment 这一条 prompt。
- `relationship`：当前 stage，仅作 pose planner 输入（影响亲密程度、距离感、姿态氛围），不再以 `Relationship stage: …` 行进入最终图片 prompt。v1.5 起 stage 同时映射为 4 档造型尺度（`reserved / warm / romantic / intimate`，见 `moment-style.ts`）：正向阶段递进（first_contact/familiar→reserved，trusted/close_friend→warm，romantic_tension/dating→romantic，committed→intimate），负向阶段（strained/hostile/estranged）一律 reserved；尺度只作为 `Styling boldness:` 指令进入 planner 输入，硬上限为"性感不露点"（never nude / never topless / 不透视 / 公共场所不内衣）。
- `scene privacy / venue`（v1.5）：由 scene tags 推断、无 DB 改动。tags 含 `intimate / bedroom / hotel / home` 或无 scene（Private chat）→ private，否则 public；场所分 8 桶（nightlife / bedroom / home_private / dining / beach(预留) / active / outdoor_public / indoor_quiet），驱动 LLM 场所化换装与预设兜底造型。
- `emotion/status`：来源 message 的 emotion，如 `warm / playful / guarded / tense / annoyed`，映射为画面状态。
- `activity`：若聊天来自 activity，加入 `activity_type`、`activity_hint`、daily mood/availability。
- `story_beat`：Story mode 的 active story beat 会进入聊天对话 prompt，用于让 companion 按剧情推进并引导用户完成 story；但在 Capture Moment v1.7 中仅作为 `story_moment_images.story_beat_id` 的记录关联与未来扩展上下文，不进入 extractor，也不进入最终图片 prompt，避免抽象 objective、剧透或第二人文字污染画面。

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

**审美控制层（v1.6）**：`chat_moment` 的换装不再让 LLM 完全自由发挥。后端在 image-gen 模块内用纯函数生成三层可独立调整的审美控制，不新增 DB 字段、不改前端、不改 RunningHub workflow：

- `MomentStyleProfile`：按 `companionId + gender` deterministic 选择稳定角色审美 archetype（如 elegant minimalist / soft romantic / sharp urban / relaxed premium），包含色系、廓形、材质/气质和身材线条偏好。同一 companion 的 moment 图应保持稳定穿搭方向。
- `suggestMomentOutfitOptions`：按 `venue + style tier + gender + profile` 返回 3 个高质量候选 outfit。extractor 必须从候选中选择，可轻微改写但不能改变 profile 方向；fallback 也从候选取默认项，避免随机低质服装。
- `MOMENT_POSE_BODY_QUALITY`：独立控制姿态/身材审美，例如自然比例、优雅姿态、放松肩颈、自然手部、清晰腰线、三分之四角度、平衡解剖。该规则同时进入 extractor 和最终 prompt，但不改变单人约束。

这三层互相解耦：profile 负责角色审美方向，outfit candidates 负责具体穿搭，pose/body quality 负责姿态和身体线条。调整某一层不需要改 API、DB、前端或 job 流程。

**姿态/表情/服装候选库（v1.7）**：在 v1.6 的服装审美层上继续收紧 prompt 选择，不让 LLM 自由发明 posture/expression/outfit。后端仍只改 image-gen prompt 生成层，不改公开 API、DB、前端或 RunningHub workflow。v1.7 的核心分层是：

- **主 pose**：由 `venue + gender + sceneTags/name` 选择候选，负责坐、站、靠、转身、躺椅等身体骨架；全身优先展示整体身材和穿搭，但不写 `feet / shoes / legs-to-feet` 等强制脚部入镜词。
- **主动作/道具**：由当前聊天决定，优先级为 `companion reply > previous user message > activity > scene default`。只允许一个 primary hand action / primary prop。
- **情绪**：不再生成另一套 pose；只提供 `expression + body attitude modifier`。情绪可以改变肩颈、重心、靠近/后退、手部紧张度，但不能覆盖主 pose、不能新增第二个道具、不能抢主手部动作。
- **服装**：使用重写后的 `venue + tier + gender + style profile` 候选库。服装候选本身不写具体颜色，颜色主要交给 style profile / workflow / LoRA；公共场景整体性感度上调但不拉满，私密场景更大胆但仍不写 nude/topless/explicit。
- **脸部策略不变**：使用 cutout 后的 companion 图片作为参考图保证脸不变；`appearance` 原文不进最终生图 prompt。

**Primary action / prop conflict rules（v1.7）**：

- Extractor 必须先识别当前 turn 的 primary action / prop；如果 companion reply 里有明确动作或道具，以 companion reply 为准。
- Extractor 输出保持短句：`body_pose <= 160 chars`，其他字段尽量 `<= 120 chars`；不要在复制候选后继续追加长从句。
- Scene pose 自带的 cup/book/towel/bag 等只作为可替换的 scene prop hint，不是硬约束。
- 如果主动作与场景默认道具冲突，场景道具只能降级为 nearby prop。例如咖啡厅 pose 默认有 cup，但 reply 是接花：输出应是 companion 拿花，coffee cup 可放在桌上 nearby；不能同时写双手拿花和双手捧咖啡。
- Emotion body attitude 只能修饰已有主 pose 和主动作。例如 `tense` 可以让 fingers lightly grip the current prop；如果没有 compatible prop 才可改为 grip hem/sleeve。
- Fallback 走少道具策略：extractor 两次失败时只用安全 pose / expression / outfit 候选，不主动加咖啡、花、书等具体道具，避免错配。

**Body attitude modifiers（v1.7）**：

| Emotion | Modifier |
|---|---|
| `warm` | `relaxed shoulders, body subtly leaning toward the viewer, gentle open posture` |
| `playful` | `weight shifted to one side, slight head tilt, playful hand near hair or waist only if hands are free` |
| `guarded` | `torso held slightly back, composed shoulders, hands close to body only if hands are free` |
| `tense` | `shoulders slightly drawn in, fingers lightly gripping the current prop, hem, or sleeve only if compatible` |
| `annoyed` | `chin slightly lifted, weight shifted slightly away, one hand at waist only if hands are free` |
| `neutral` | `balanced posture, relaxed shoulders, natural hands, clean silhouette` |

### v1.7 Candidate Library Appendix

以下英文为进入 prompt 的候选原文；中文说明仅用于审查。候选库先作为代码常量维护，不做后台配置。全局审美规则：脸朝 viewer；眼神可低垂、害羞或不完全直视；不用 `S-curve` 这类土味曲线词，改用具体身体语言如 `weight shifted`、`defined waistline`、`angled torso`、`clean silhouette`。

#### Pose Candidates

**Dining（cafe / restaurant / dessert）**

Female:

1. `full-body seated cross-legged at a cafe table, face toward the viewer, torso leaning forward, one hand near cup, teasing defined waistline`
2. `full-body leaning forward lightly against the cafe counter, face toward the viewer, hips angled, one hand at the waist, flirtatious body angle`
3. `full-body standing beside a window table, face toward the viewer, one hand brushing hair away from the neck, alluring fitted silhouette`
4. `full-body half-turn beside the table, face toward the viewer, one hand on the chair back, subtle hip pop, inviting playful stance`

Male:

1. `full-body seated sideways at a cafe table, face toward the viewer, one forearm resting on the table, relaxed confident shoulders`
2. `full-body leaning lightly against the cafe counter, face toward the viewer, one hand in pocket, clean shoulder-to-waist line`
3. `full-body standing beside a window table, face toward the viewer, one hand adjusting cuff or collar, fitted torso line`
4. `full-body half-turn beside the table, face toward the viewer, one hand on the chair back, confident stance`

**Nightlife（livehouse / bar / lounge / club）**

Female:

1. `full-body leaning forward over a lounge bar counter, face toward the viewer, hips angled back, one elbow on the counter, flirtatious body angle`
2. `full-body seated cross-legged on a lounge sofa, face toward the viewer, torso leaning forward, one hand on sofa edge, teasing confident pose`
3. `full-body standing in stage light, face toward the viewer, one hand behind the neck, arched posture, sharp waist-to-hip line`
4. `full-body slow dance-floor turn, face toward the viewer, one hand brushing over the hip, playful provocative body angle`

Male:

1. `full-body leaning against the bar counter, face toward the viewer, one hand in pocket, relaxed confident shoulders`
2. `full-body seated on a lounge sofa, face toward the viewer, one arm resting along the sofa back, composed confident posture`
3. `full-body standing near stage lights, face toward the viewer, one hand adjusting jacket or collar, sharp torso line`
4. `full-body half-turn beside the bar, face toward the viewer, sleeves rolled, confident stance`

**Bedroom（hotel suite / apartment bedroom）**

Female:

1. `full-body seated on the bed edge, face toward the viewer, eyes lowered softly, one hand holding robe collar, shy defined waistline`
2. `full-body sitting sideways on the bed edge, face toward the viewer, legs angled aside, hands on knees, bashful covered silhouette`
3. `full-body standing beside the bed, face toward the viewer, one hand behind the neck, softly arched back, clear waist-to-hip curve`
4. `full-body leaning against the bedroom doorway, face toward the viewer, one knee subtly bent, hips angled, flirtatious private stance`

Male:

1. `full-body seated on the bed edge, face toward the viewer, forearms resting on knees, relaxed shoulders and confident torso line`
2. `full-body standing beside the window, face toward the viewer, one hand adjusting collar, calm intimate stance`
3. `full-body leaning against the bedroom doorway, face toward the viewer, one hand in pocket, relaxed confident posture`
4. `full-body sitting sideways on the bed edge, face toward the viewer, one hand resting beside the body, composed private pose`

**Home Private（Private chat / lobby / laundry / lounge / balcony）**

Female:

1. `full-body seated cross-legged on a scene-matched seat, face toward the viewer, one arm held close softly, shy cozy posture with a defined waistline`
2. `full-body leaning lightly against a scene-matched counter, railing, or window frame, face toward the viewer, soft bashful body angle`
3. `full-body standing near a doorway, window, or railing, face toward the viewer, weight shifted, one hand on the frame, quiet intimate posture`
4. `full-body half-turn beside a scene-matched fixture, face toward the viewer, one hand lightly fixing hair or sleeve, playful private posture`

Male:

1. `full-body seated on a scene-matched seat, face toward the viewer, one forearm resting on the knee, relaxed domestic confidence`
2. `full-body leaning lightly against a scene-matched counter, railing, or window frame, face toward the viewer, easy calm posture`
3. `full-body standing near a doorway, window, or railing, face toward the viewer, one hand in pocket, relaxed confident stance`
4. `full-body half-turn beside a scene-matched fixture, face toward the viewer, one hand adjusting sleeve or collar, clean torso line`

Scene-matched anchor hints:

- `Private chat/no scene`: `sofa, soft chair, desk edge`
- `home/lobby/neighbor`: `entryway wall, lobby bench, mailboxes as background shapes`
- `laundry`: `washing machine counter, folded towel, laundry basket nearby`
- `lounge/rain/window`: `window frame, lounge chair, rain-streaked glass`
- `balcony`: `balcony railing, simple chair, drying rack if activity mentions laundry`
- fallback: `soft chair or doorway`

**Indoor Quiet（bookshop / library / cinema / studio / record shop）**

Female:

1. `full-body standing in a quiet aisle or lobby, face toward the viewer, one hand near a scene-matched prop, shy poised waistline`
2. `full-body seated cross-legged on a quiet chair, face toward the viewer, a scene-matched prop held low or nearby, quiet alluring posture`
3. `full-body leaning lightly against a shelf, wall, or window, face toward the viewer, one hand brushing hair aside, softly angled body line`
4. `full-body half-turn in the aisle or lobby, face toward the viewer, one hand reaching toward a nearby scene fixture, elegant fitted body line`

Male:

1. `full-body standing in a quiet aisle or lobby, face toward the viewer, one hand near a scene-matched prop, calm composed posture`
2. `full-body seated on a quiet chair, face toward the viewer, one ankle crossed, relaxed shoulders and clean torso line`
3. `full-body leaning lightly against a shelf, wall, or window, face toward the viewer, one hand in pocket, thoughtful stance`
4. `full-body half-turn in the aisle or lobby, face toward the viewer, one hand reaching toward a nearby scene fixture, quiet confident posture`

Scene-matched prop hints:

- `bookshop/library/study`: `book, bookshelf, reading chair`
- `cinema`: `ticket stub, popcorn cup, lobby poster wall as unreadable shapes`
- `studio/creative/work`: `sketchbook, portfolio, drawing table`
- `music/record`: `vinyl record sleeve, listening station`
- fallback: `no required prop`

**Outdoor Public（plaza / park / riverside / rooftop / market / street）**

Female:

1. `full-body leaning lightly against a railing or bench, face toward the viewer, one hand at the waist, playful hip angle`
2. `full-body mid-step turn on a walkway or plaza, face toward the viewer, hair or jacket moving slightly, lively fitted body line`
3. `full-body seated cross-legged on a bench or low wall, face toward the viewer, torso angled forward, teasing public pose`
4. `full-body standing beside a street fixture or market stall, face toward the viewer, one hand brushing hair back, clean angled silhouette`

Male:

1. `full-body leaning lightly against a railing or bench, face toward the viewer, one hand in pocket, relaxed confident posture`
2. `full-body mid-step turn on a walkway or plaza, face toward the viewer, jacket moving slightly, clean athletic body line`
3. `full-body seated on a bench or low wall, face toward the viewer, one forearm resting on the knee, composed casual stance`
4. `full-body standing beside a street fixture or market stall, face toward the viewer, one hand adjusting jacket, confident silhouette`

Scene-matched prop hints:

- `park`: `bench, path, trees`
- `riverside/harbor/waterfront`: `railing, water view, small food bag if activity mentions food`
- `rooftop/balcony`: `glass railing, city lights, plants`
- `market`: `small snack bag, shopping bag, stall counter`
- `transit/plaza/city`: `ticket, small bag, station railing`
- fallback: `no required prop`

**Active（gym / arcade / game / sport / hiking future tags）**

Female:

1. `full-body leaning lightly against gym equipment or an arcade cabinet, face toward the viewer, one hand at the waist, athletic angled posture`
2. `full-body seated on a workout bench or game stool, face toward the viewer, legs angled to one side, energetic teasing posture`
3. `full-body mid-action turn beside the activity area, face toward the viewer, one hand adjusting ponytail or jacket, dynamic fitted body line`
4. `full-body standing beside an activity station, face toward the viewer, one hand holding a scene-matched prop, confident playful stance`

Male:

1. `full-body leaning lightly against gym equipment or an arcade cabinet, face toward the viewer, one hand resting at the side, athletic confident posture`
2. `full-body seated on a workout bench or game stool, face toward the viewer, forearms resting on knees, strong shoulder line`
3. `full-body mid-action turn beside the activity area, face toward the viewer, one hand adjusting towel or jacket, dynamic torso line`
4. `full-body standing beside an activity station, face toward the viewer, one hand holding a scene-matched prop, relaxed competitive stance`

Scene-matched prop hints:

- `gym/sport/training`: `water bottle, towel, training bench, weights in background`
- `arcade/game/playful`: `game cabinet, prize token, claw machine prize nearby`
- future `mountain/hiking/trail`: `hiking pole, backpack strap, trail railing`
- fallback: `no required prop`

**Beach（beach / pool / seaside / hot spring future tags）**

Female:

1. `full-body standing near the shoreline or pool edge, face toward the viewer, one hand holding a light cover-up, relaxed resort body angle`
2. `full-body reclining on a beach lounge chair, face toward the viewer, one knee softly bent, hand near cover-up, teasing resort posture`
3. `full-body leaning lightly against a pool railing or beach umbrella pole, face toward the viewer, hips angled, clean waistline`
4. `full-body walking turn along the beach or poolside, face toward the viewer, hair moving slightly, playful resort body line`

Male:

1. `full-body standing near the shoreline or pool edge, face toward the viewer, one hand adjusting the shirt collar, relaxed athletic posture`
2. `full-body reclining on a beach lounge chair, face toward the viewer, one forearm resting behind the head, relaxed confident resort posture`
3. `full-body leaning lightly against a pool railing or beach umbrella pole, face toward the viewer, one hand in pocket, clean torso line`
4. `full-body walking turn along the beach or poolside, face toward the viewer, shirt moving slightly, easy confident body line`

Scene-matched prop hints:

- `beach/seaside`: `light cover-up, beach towel, shoreline`
- `pool`: `pool railing, lounge chair, towel`
- `hot spring/onsen`: `towel or robe only if tier/privacy allows`
- fallback: `no required prop`

#### Expression Candidates

**Warm**

Female:

1. `soft genuine smile, warm eyes, relaxed brows, lips gently curved`
2. `shy warm smile, eyes lowered softly, gentle brows, small closed-mouth smile`
3. `relieved tender smile, softened eyes, brows easing, natural mouth curve`
4. `bright affectionate smile, clear eyes, lifted cheeks, relaxed lips`

Male:

1. `gentle confident smile, warm eyes, relaxed brows, natural mouth curve`
2. `quiet shy smile, softened eyes, calm brows, small closed-mouth smile`
3. `relieved soft smile, steady eyes, brows easing, relaxed mouth`
4. `bright easy smile, clear eyes, lifted cheeks, relaxed lips`

**Playful**

Female:

1. `mischievous bright smile, lively eyes, one brow slightly raised, teasing mouth curve`
2. `teasing half-smile, eyes playful, brows lifted softly, lips gently curved`
3. `playful wink, one eye closed, bright smile, lifted brow, lips softly curved`
4. `tiny tongue-out grin, lively eyes, raised brows, playful cute mouth shape`

Male:

1. `mischievous confident smile, lively eyes, one brow slightly raised, teasing mouth curve`
2. `playful half-smirk, amused eyes, brows lifted softly, lips curved`
3. `easy amused grin, smiling eyes, relaxed brows, natural mouth shape`
4. `bright competitive smile, clear eyes, raised brows, relaxed lips`

**Guarded**

Female:

1. `guarded half-smile, cautious eyes, slightly knit brows, closed lips`
2. `composed reserved look, steady eyes, controlled brows, calm mouth`
3. `conflicted soft gaze, brows drawn gently, faint uncertain smile`
4. `cool polite smile, measuring eyes, small restrained mouth curve`

Male:

1. `guarded half-smile, cautious eyes, slightly knit brows, closed lips`
2. `composed reserved look, steady eyes, controlled brows, firm calm mouth`
3. `conflicted quiet gaze, brows drawn gently, faint uncertain smile`
4. `cool polite smile, assessing eyes, small restrained mouth curve`

**Tense**

Female:

1. `anxious controlled gaze, widened eyes, knitted brows, lips pressed lightly`
2. `vulnerable worried look, soft eyes, tense brows, small uncertain mouth`
3. `breath-held faint smile, uneasy eyes, brows lifted at the center, lips slightly parted`
4. `nervous shy look, eyes lowered softly, worried brows, small closed-mouth smile`

Male:

1. `anxious controlled gaze, steady widened eyes, knitted brows, lips pressed lightly`
2. `worried restrained look, softened eyes, tense brows, firm uncertain mouth`
3. `breath-held faint smile, uneasy eyes, brows lifted at the center, lips slightly parted`
4. `quiet tense look, eyes lowered softly, worried brows, small closed-mouth smile`

**Annoyed**

Female:

1. `cute sulky pout, cheeks puffed, big annoyed eyes, brows pinched softly`
2. `puffed-cheek grumpy face, eyes lifted toward the viewer, brows knitted, small frown`
3. `annoyed pout with one brow raised, cheeks tense, lips pursed in a cute way`
4. `frustrated cute frown, softened angry eyes, brows furrowed, small pressed mouth`

Male:

1. `cool composed stare, narrowed eyes, one brow raised, lips pressed`
2. `restrained annoyed look, sharp eyes, tense brows, firm tight mouth`
3. `irritated half-smirk, cutting eyes, controlled brows, lips curved faintly`
4. `skeptical look, brows arched, eyes direct, mouth turned slightly down`

**Neutral**

Female:

1. `calm attentive expression, clear eyes, relaxed brows, soft natural mouth`
2. `curious slight smile, bright eyes, gently lifted brows, small mouth curve`
3. `thoughtful soft look, eyes calm, brows relaxed, lips gently closed`
4. `composed confident gaze, steady eyes, relaxed brows, clean mouth line`

Male:

1. `calm attentive expression, clear eyes, relaxed brows, natural mouth`
2. `curious slight smile, steady eyes, gently lifted brows, small mouth curve`
3. `thoughtful composed look, eyes calm, brows relaxed, lips gently closed`
4. `composed confident gaze, steady eyes, relaxed brows, clean mouth line`

#### Outfit Candidates

服装候选不写具体颜色；具体颜色由 style profile / workflow / LoRA 共同决定。所有候选都必须避免 cheap cosplay、oversized shapeless、random neon、plain cardigan/jeans 等低质方向。

**Female Dining**

Reserved:

1. `fitted knit mini dress with sheer stockings and delicate accessories`
2. `cropped jacket over a fitted camisole with a pleated mini skirt`
3. `fitted blouse with a high-waisted short skirt and sheer stockings`

Warm:

1. `body-hugging midi dress with a subtle side slit and delicate accessories`
2. `fitted camisole under a cropped cardigan with a short skirt and sheer stockings`
3. `off-shoulder knit top with a tailored mini skirt`

Romantic:

1. `fitted slip dress with delicate jewelry and sheer stockings`
2. `off-shoulder dinner dress with thigh-high stockings and refined accessories`
3. `satin camisole top with a high-waisted mini skirt and cropped jacket`

Intimate:

1. `bodycon cocktail dress with sheer stockings and polished accessories`
2. `curve-hugging dinner dress with an elegant side slit and refined jewelry`
3. `corset-style fitted top with a tailored mini skirt and sheer stockings`

**Female Nightlife**

Reserved:

1. `fitted party mini dress with a modest neckline and sheer stockings`
2. `tailored party top with a high-waisted mini skirt and a sleek jacket`
3. `fitted evening top with a structured short skirt and polished accessories`

Warm:

1. `satin party dress with thigh-high stockings and refined jewelry`
2. `cropped jacket over a fitted bustier-style top with a tailored mini skirt`
3. `wrap mini dress with sheer stockings and elegant accessories`

Romantic:

1. `off-shoulder bodycon party dress with thigh-high stockings`
2. `halter mini dress with sheer stockings and delicate jewelry`
3. `lace-trim camisole top with a fitted leather skirt and polished accessories`

Intimate:

1. `backless high-slit evening dress with sheer stockings`
2. `corset mini dress with thigh-high stockings and polished accessories`
3. `strappy fitted party dress with an elegant waist cutout`

**Female Bedroom**

Reserved:

1. `fitted short nightdress with subtle lace trim and a soft robe`
2. `fitted camisole pajama set with tailored short lounge shorts`
3. `crisp short sleep shirt styled with a defined waist and bare-leg silhouette`

Warm:

1. `lace-trim short nightdress under a light robe`
2. `satin camisole set with thigh-high socks and a soft robe`
3. `silk pajama shirt worn slightly off-shoulder with tailored lounge shorts`

Romantic:

1. `short lace-trim slip nightdress with a sheer robe`
2. `satin short nightdress with thigh-high stockings and delicate accessories`
3. `silk robe over a fitted camisole set with a clean waistline`

Intimate:

1. `wrapped only in a bath towel, covered silhouette with a defined waist`
2. `lace-trim short slip nightdress with thigh-high stockings`
3. `strappy satin short nightdress under an open robe`

**Female Home Private**

Reserved:

1. `fitted knit lounge top with high-waisted lounge shorts`
2. `cropped lounge cardigan over a fitted camisole with a short skirt`
3. `soft fitted lounge dress with a defined waist`

Warm:

1. `off-shoulder fitted lounge top with tailored lounge shorts`
2. `cropped knit top with a fitted lounge skirt`
3. `silky camisole with premium lounge shorts and a light robe`

Romantic:

1. `silk robe over a fitted camisole set with short lounge shorts`
2. `fitted ribbed mini lounge dress with thigh-high socks`
3. `satin wrap top with tailored lounge shorts and delicate accessories`

Intimate:

1. `crisp long shirt styled as a mini lounge dress with a defined waist`
2. `silk robe over a lace-trim camisole set with thigh-high stockings`
3. `satin camisole with short lounge shorts under an open robe`

**Female Indoor Quiet**

Reserved:

1. `fitted turtleneck mini dress with sheer stockings`
2. `cropped cardigan over a fitted camisole with a pleated mini skirt`
3. `tailored blouse with a high-waisted short skirt and sheer stockings`

Warm:

1. `ribbed fitted top with a tailored mini skirt and thigh-high socks`
2. `off-shoulder knit dress with a clean waistline`
3. `fitted camisole under a cropped jacket with a pleated mini skirt`

Romantic:

1. `fitted knit dress with a subtle side slit and sheer stockings`
2. `silk blouse with a fitted mini skirt and thigh-high stockings`
3. `lace-trim camisole under a long open cardigan with a short skirt`

Intimate:

1. `chic slip dress under a long open cardigan with sheer stockings`
2. `fitted satin blouse with a high-waisted mini skirt and thigh-high stockings`
3. `body-hugging knit mini dress with delicate accessories`

**Female Outdoor Public**

Reserved:

1. `fitted top with a pleated mini skirt and a light jacket`
2. `tailored short dress with a cropped jacket`
3. `fitted blouse with high-waisted shorts and polished accessories`

Warm:

1. `ribbed fitted top with a mini skirt and a cropped jacket`
2. `sporty fitted tank with tailored shorts and a light jacket`
3. `off-shoulder day top with a short skirt and delicate accessories`

Romantic:

1. `fitted crop top with a high-waisted short skirt and a light coat`
2. `body-hugging day dress with a cropped jacket`
3. `silk camisole with tailored shorts under a light trench coat`

Intimate:

1. `fitted mini dress with a long light coat and sheer stockings`
2. `corset-style day top with tailored shorts and a cropped jacket`
3. `fitted camisole with a short skirt under a light trench coat`

**Female Active**

Reserved:

1. `fitted training tee with high-waisted biker shorts`
2. `cropped technical jacket over a fitted tank with an athletic skirt`
3. `fitted tennis dress with clean sporty accessories`

Warm:

1. `fitted athletic tank with high-waisted training shorts`
2. `cropped sports top with sculpting leggings`
3. `fitted zip-front training top with a short athletic skirt`

Romantic:

1. `sleek cropped workout top with high-waisted biker shorts`
2. `fitted dance wrap top with a short athletic skirt`
3. `form-fitting racerback tank with sculpting leggings`

Intimate:

1. `strappy athletic crop top with high-waisted training shorts`
2. `sports-bra-style top under a cropped zip jacket with sculpting shorts`
3. `sleek zip-front training top over a fitted athletic top with a short skirt`

**Female Beach**

Reserved:

1. `fitted resort mini dress over a modest swimsuit`
2. `cropped resort shirt over a fitted one-piece swimsuit with a wrap skirt`
3. `fitted tank with high-waisted beach shorts and a sheer cover-up`

Warm:

1. `cutout one-piece swimsuit with a wrap skirt`
2. `bikini top under an open resort shirt with a high-waisted beach skirt`
3. `halter resort mini dress with a swimsuit underneath`

Romantic:

1. `strappy bikini with an elegant sheer sarong`
2. `sleek one-piece swimsuit with a gauzy wrap skirt`
3. `fitted resort camisole with a flowing beach mini skirt`

Intimate:

1. `daring strappy bikini with an elegant sheer sarong`
2. `minimal bikini under an open linen cover-up`
3. `cutout one-piece swimsuit with an open wrap cover-up`

**Male Active**

Modest:

1. `fitted technical tee with tailored training shorts`
2. `light zip training jacket over a fitted athletic top with joggers`
3. `clean sleeveless training top layered under a sporty jacket with athletic shorts`

Bold:

1. `fitted sleeveless training top with tailored athletic shorts`
2. `open training vest over a fitted tank with slim joggers`
3. `sculpted compression top with athletic shorts`

**Male Beach**

Modest:

1. `resort shirt with tailored swim shorts`
2. `open summer shirt over a fitted tank with swim shorts`
3. `lightweight knit polo with clean swim shorts`

Bold:

1. `unbuttoned resort shirt with fitted swim trunks`
2. `fitted tank with swim shorts and an open cover-up shirt`
3. `tailored swim shorts with an open linen shirt`

**Male Bedroom**

Modest:

1. `fitted lounge tee with soft knit pants`
2. `clean pajama shirt with tailored lounge pants`
3. `premium henley with relaxed lounge shorts`

Bold:

1. `open-collar pajama shirt with tailored lounge pants`
2. `loose half-buttoned linen shirt with lounge pants`
3. `fitted tank with loose lounge pants`

**Male Dining**

Modest:

1. `tailored knit polo with slim trousers`
2. `casual blazer over a fitted tee with polished trousers`
3. `button-up shirt with rolled sleeves and tailored trousers`

Bold:

1. `open-collar fitted dress shirt with rolled sleeves`
2. `satin shirt with tailored trousers`
3. `fitted vest over a low-collar shirt with tailored trousers`

**Male Home Private**

Modest:

1. `fitted tee with slim lounge joggers`
2. `lounge cardigan over a fitted tee with knit pants`
3. `soft knit henley with tailored lounge pants`

Bold:

1. `fitted tank with lounge pants`
2. `open-collar knit shirt with tailored lounge pants`
3. `sleeveless lounge top with relaxed slim joggers`

**Male Indoor Quiet**

Modest:

1. `fitted turtleneck with tailored trousers`
2. `tailored overshirt over a fitted tee with slim trousers`
3. `clean knit polo with relaxed tailored trousers`

Bold:

1. `sleek fitted knit shirt with tailored trousers`
2. `low-collar knit shirt with a sharp cardigan and slim trousers`
3. `fitted vest over a clean shirt with tailored trousers`

**Male Nightlife**

Modest:

1. `fitted open-collar shirt with slim trousers`
2. `tailored jacket over a fitted tee with polished trousers`
3. `smart shirt with rolled sleeves and tailored trousers`

Bold:

1. `open-collar fitted shirt with sleeves rolled up`
2. `satin shirt with slim trousers`
3. `sleeveless stage vest with fitted trousers`

**Male Outdoor Public**

Modest:

1. `fitted tee with a light jacket and chinos`
2. `tailored overshirt over a fitted tee with casual trousers`
3. `fitted henley with relaxed tailored trousers`

Bold:

1. `fitted tank under a cropped jacket with chinos`
2. `open short-sleeve shirt over a tank with tailored shorts`
3. `fitted knit polo with tailored shorts or slim trousers`

最终 prompt 示例结构（v1.7：脸靠 cutout/reference 锁定；无 appearance/名字/relationship/personality/story_beat，仅留 gender 锚点）：

```text
Edit the input image into a single-character scene image of the same companion.
Keep only this person's facial identity: the same recognizable face and facial features as the input image. The hairstyle, outfit, expression, body pose, and camera framing may all change to match the new scene.
Keep exactly one person in the image — this companion only. Do not add any other people, ...
The companion's face is oriented toward the viewer; the eyes may meet the viewer or lower softly to match the expression. Do not render any camera, phone, or photographic device.
Moment pose: full-body seated cross-legged at a cafe table, face toward the viewer, torso leaning forward, one hand near cup, teasing defined waistline.
Hands/props: one hand near a coffee cup.
Outfit (overrides any clothing mentioned in the reference): fitted blouse with a high-waisted short skirt and sheer stockings.
Change the hairstyle to: soft curled hair.
Makeup: natural date makeup.
Gaze: face oriented toward the viewer, eyes may meet the viewer or lower softly.
Expression: shy warm smile.
Position in scene: near the cafe window.
Style profile: soft romantic; soft feminine styling with graceful fabrics and romantic detail; palette: ivory, rose, warm beige, soft blue, delicate gold accents; silhouette: fitted waist, flowing hems, delicate but intentional styling; body aesthetic: soft curves, poised shoulders, gentle flattering angles.
Body attitude: relaxed shoulders, body subtly leaning toward the viewer, gentle open posture.
Pose/body quality: flattering full-body proportions, elegant posture, relaxed shoulders, natural hands, defined waistline, clean silhouette, balanced anatomy, face toward viewer.
Pose variety: use the selected full-body moment pose as the body skeleton; do not collapse it into a generic standing pose.
Expression quality: visibly emotion-specific facial expression, not the neutral expression from the reference.
Primary action rule: keep only one primary hand action or prop. If the chat action conflicts with a scene prop, keep the chat action and move the scene prop nearby or omit it.
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
  - message 可以有 `scene_id`；无 `scene_id` 时后端使用 `Private chat` fallback，`story_moment_images.scene_id = NULL`。
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
  scene_id        TEXT REFERENCES scenes(id),
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
- source image 选择顺序：已有 `companions.art_cutout_key` 时直接把该 cutout 作为参考图传给 `chat_moment`；没有 cutout 时创建/复用同一 `(companion, source_art_url)` 的 `companion_cutout` job，并等待 cutout 成功后重新 enqueue moment job；只有完全没有 source art 时才退回纯文生图。
- `workflow_key = 'chat_moment'`（若未配置，dev/mock 可 fallback）
- `output_prefix = 'chat-moments'`

## Workflow / Provider

- RunningHub 可配置 workflow key：`chat_moment`。
- 当前 RunningHub workflow 是 `LoadImageFromUrl.image` 输入型 workflow：`loadImageFieldName = "image"`，不绑定 checkpoint/LoRA；workflow 不声明底模架构。
- 需要同时配置 load-image node 和 prompt node；业务 prompt 仍注入 prompt node，source image 通过 `LoadImageFromUrl.image` 字段传短期签名 URL。
- 这里的 `image` 不是旧 upload/fileName 路径；provider 会通过 workflow contract 识别 `LoadImageFromUrl` 并继续传 signed URL。只有非 URL loader 字段才默认走 upload API。
- mock provider 返回可预测图片 key，保证 API 和前端测试不依赖外部生图服务。

`GET /moment-images/jobs/{jobId}` 只在当前 job 非终态、超过 1 分钟且该 job 最近 1 分钟没有主动查过 RunningHub 时，执行一次单 job RunningHub outputs/status poll。前端仍只在存在 pending moment image 时按 2.5 秒查询我们自己的状态接口；无 pending 生图时不会后台轮询。RunningHub 返回 pending 时只更新 `provider_last_polled_at`，不更新 `updated_at`，因此 15 分钟 hard timeout 仍按 job 生命周期生效。

## 验证

1. API：
   - user message 不能生成 moment image。
   - companion message 无 `scene_id` 时可以生成 Private chat moment，写入 `scene_id = NULL`。
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
