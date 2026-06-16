# 玩法机制

> 本文档定义玩家与系统的交互细节。产品愿景见 [`vision.md`](./vision.md)，日常生活模拟见 [`daily-life-sim.md`](./daily-life-sim.md)，v1 具体场景与角色清单见 [`content.md`](./content.md)。
>
> **关于"暂定"标注：** 文档中标为 *(暂定)* 的内容是基于产品愿景的合理初稿，未与产品所有者最终敲定，正式实施前需重新讨论。

---

## 1. 主界面：Today in Aurelia

**v1 形态：日常主页 + 场景列表。** *(暂定)*

用户打开 app 首先看到的不是单纯"地点列表"，而是今天的城市状态：

- 当前真实时间段：morning / afternoon / evening / night
- 今日推荐拜访：哪些 companion 在哪些场景、处于什么状态
- 关系目标提示：某个 companion 下一步适合 check in / hang out / invite / repair / date
- 关系动态摘要：最近一次关系变化、未完成事件、可生成回忆
- 场景入口：保留现有场景卡，作为拜访和活动的入口

**不做地图视图：** v1 不做可点击城市地图，避免美术和交互成本爆炸。生活感通过真实时间、角色状态、活动和回忆建立，而不是通过 3D 或大地图建立。

**为什么这样设计：**
- 比纯场景列表更有"角色在生活"的感觉
- 比 3D 地图更适合 Web / Expo 三端
- 能复用当前 scenes、companions、relationships、events、chat
- 用户决策路径仍然短：看到今天谁值得见 → 点进去 → 选择活动

## 2. 日常状态系统

日常状态系统详见 [`daily-life-sim.md`](./daily-life-sim.md)。它是新玩法层，不修改现有 companion 或 scene 数据。

### 2.1 时间段

v1 使用用户真实时间的粗粒度 time slot：

| Time slot | 用途 |
|---|---|
| `morning` | 通勤、咖啡、健身、邻居偶遇 |
| `afternoon` | 工作、书店、公园、日间邀约 |
| `evening` | 散步、晚餐、约会、下班后事件 |
| `night` | 酒吧、屋顶、深夜谈心、脆弱时刻 |

同一用户、同一日期、同一 time slot 内的 companion 状态应保持稳定，避免刷新后"人突然换地方"。

### 2.2 Companion daily state

每个 companion 在当前 time slot 有一个运行时状态：

| 字段 | 说明 |
|------|------|
| `scene_id` | 今日所在场景，必须来自现有场景 |
| `mood` | 今日心情标签，如 calm / busy / lonely / playful / guarded |
| `availability` | available / busy / away |
| `activity_hint` | 正在做什么，如 reading alone / finishing work |
| `flavor_text` | AI 生成的展示文案 |

**生成边界：**
- 规则决定位置、心情、可用性和活动提示
- AI 只写展示文案，不决定核心状态
- 状态必须服从 companion 既有人设、preferred_scenes 和 scene 设定
- 不改变角色性格、属性、关系维度初始值或场景加成

## 3. 场景系统

### 3.1 场景定义（预写，存数据库）

| 字段 | 说明 |
|------|------|
| `id` | 场景唯一标识 |
| `name` | 场景名（如 "Pier Cafe"） |
| `mood` | 氛围描述（注入 LLM prompt 的场景设定） |
| `tags` | 标签（cafe / office / bar / park / apartment...） |
| `possible_events` | 可能发生的事件类型 ID 列表 |
| `default_companions` | 偏好在此出现的官方角色 ID 列表（实际是否 spawn 受用户 `romance_preference` 加权抽样影响，见 §3.2） |
| `unlock_condition` | 解锁条件（可选 —— 默认全部解锁，部分场景需关系阈值） |

### 3.2 进入场景

用户点击场景 → 系统判定本次进入"在场角色"。v1 先保持 roster 克制，避免一个 scene 塞进太多 companion：

1. 抽取该场景 `default_companions` 中的活跃官方伴侣，以及既有系统明确放置到该场景的 companion。
2. 过滤没有 effective profile image 的候选；effective image 使用当前用户 profile override，fallback 到 companion 原始 art
3. 不从全站 public / online / Discover companion 池自动补位；过滤后人少就是人少，场景可以为空。
4. 用用户的 `romance_preference` 对候选做加权抽样（见 §5.3 性别偏好与加权）
5. 0~N 个 companion 出现：
   - 0 个：场景空，触发"环境事件"（独自的氛围片段，无 AI 对话）
   - 1 个：常规模式，与该角色对话
   - 2+ 个：群聊模式（v1.x，暂不实现）*(暂定)*

### 3.3 在场景内

可执行动作（v1）：
- **观察**：系统生成场景描写（AI 实时生成，注入 mood + 当前在场角色）
- **活动**：选择 check in / hang out / invite / date / gift / repair（见 §4）
- **对话**：与在场角色对话（核心交互，见 §6）；同一场景可进入自由 Talk 或 Story mode
- **选择**：当事件触发时，呈现 2-4 个选项（见 §7）
- **离开**：回到主界面

## 4. 活动系统

活动系统是日常生活玩法的主循环。它给自由聊天增加明确上下文，但不替代自由输入。

| Activity | 目的 | 基础条件 |
|---|---|---|
| `check_in` | 日常问候，低成本维持关系 | companion present 或 daily state 可见 |
| `hang_out` | 一起做当前场景适配的小事 | companion available |
| `invite` | 邀请去另一个场景或未来约会 | closeness / trust 达到基础阈值 |
| `date` | 明确恋爱向约会 | romance 达到阈值，且 tension/hostility/distance 不高 |
| `gift` | 赠送或接收小礼物 | 冷却时间控制 |
| `repair` | 修复紧张、敌意或距离感 | tension / hostility / distance 达到阈值 |

活动流程：

```
选择 companion / scene
  ↓
选择 activity
  ↓
创建 activity context
  ↓
进入带 activity context 的 AI 对话 / 事件
  ↓
活动完成、失败或中断
  ↓
关系维度变化 + 关系目标进度更新
  ↓
必要时生成 memory
```

**活动原则：**
- 所有活动都使用现有 companion、scene、relationship、event、chat 作为输入
- 活动只改变上下文、事件触发机会和关系信号权重
- 活动不重写 companion 性格和 scenario/scene 属性
- 用户可以自由输入，不强制只能点选项

## 5. companion 系统

### 5.1 双轨

- **官方角色（v1 提供 8-10 个）：** 预写角色卡，质量基线
- **用户自创角色：** 用户填卡，私人体验；故事编辑不放在创角尾部，用户在 Scene 页面选择官方 preset story 或创建私有 scene story

两者共用同一数据模型与对话引擎，仅 `source` 字段区分。

### 5.2 角色卡字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识 |
| `source` | enum | `official` / `user` |
| `name` | string | 角色名（英文） |
| `gender` | enum | `male` / `female`（仅用于场景出现加权，不注入 LLM prompt） |
| `appearance` | text | 外貌描述（注入 LLM prompt） |
| `personality` | text | 性格描述 |
| `background` | text | 背景故事 |
| `speech_style` | text | 说话风格（口语化、正式、幽默...） |
| `preferred_scenes` | string[] | 偏好场景 ID |
| `relationship_role` | enum | 关系定位标签：`colleague` / `neighbor` / `friend` / `crush` / `stranger` / `family` |
| `art` | url | 角色立绘（动漫 / 二次元风格）|
| `created_by` | user_id? | 自创角色填用户 ID |

**对当前代码的延续：** 现有 `companion-engine.ts` 已有"15+ 人格字段"的设计。v1 简化为以上 ~6 个核心字段；过细的人格字段在用户创角时**可选填**，不是必填项（降低门槛）。

### 5.3 性别偏好与加权 spawn

用户在「Me」页面设置 `romance_preference: 'male' | 'female' | 'any'`，存于 `users.romance_preference`，**随时可改、即时生效**（PATCH `/auth/me/preferences`，无频次限制）。

进入场景时（`POST /scenes/{id}/enter`）：

- **`any`**：不做抽样，所有候选 spawn（保留 v1 默认行为）。
- **`male` / `female`**：对每个 official 候选做伯努利试验——偏好性别权重 0.8，非偏好 0.2（`packages/api/src/companions/gender-weight.ts:PREFERENCE_WEIGHTS`）。
- **`source = 'user'`**：用户自建伴侣**永远 spawn**，不参与抽样。
- **保底**：如果加权后所有 official 候选都被剔除且没有 user 伴侣，则强制保留权重最高的一个（不让场景空着）。

场景列表（`GET /scenes`）始终展示场景的全集成员，仅按偏好做排序，便于用户掌握"这个场景里都有谁"。

## 6. 对话系统

### 6.1 对话流

```
用户进入场景 / 活动 → 选择 Talk 或 Story 上下文
  ↓
用户输入（自由文本，无选项约束）
  ↓
后端构造 prompt：
  [系统设定] + [角色卡] + [场景设定] + [活动上下文] + [关系数值快照] + [对话历史摘要] + [最近对话] + [用户输入]
  ↓
LLM 流式生成回应
  ↓
后端解析回应中的"关系信号"（见 §8.2），更新关系数值
  ↓
持久化对话 + 数值变化
  ↓
前端展示回应（流式）+ 数值变化（可选 UI 反馈，避免过度游戏化）
```

### 6.2 对话历史管理

- 每对（用户, 角色）一条 thread
- D1 存最近 N 条原文（v1 暂定 N=50）
- 超过 N 条时，旧消息由"对话摘要"代替（异步 LLM 任务生成摘要）*(暂定)*
- prompt 注入策略：摘要 + 最近 10-20 条

### 6.3 用户输入约束

- v1：纯自由文本输入
- v1.x：可加快捷选项（"问候 / 邀请 / 告别 / 道歉 / 送礼"），但不是约束
- 不做严格的输入分类或限制（避免破坏 RPG 沉浸感）

## 7. 事件系统

### 7.1 事件类型（v1 候选） *(暂定)*

| 类型 | 触发条件 | 例子 |
|------|---------|------|
| `daily_encounter` | 进入场景默认 | 在咖啡馆遇到 A，A 正在看书 |
| `invitation` | 关系数值阈值 + 随机 | A 邀请你周末去公园 |
| `conflict` | 关系数值变化触发 | A 因为你之前的话生气了 |
| `gift` | 节日 / 时间触发 | A 送你一杯咖啡 |
| `confession` | 浪漫值高阈值触发 | A 表白 |
| `milestone` | 累积时间 / 互动次数触发 | 认识 A 满 30 天 |

### 7.2 事件结构

- **预写部分：** 事件类型、触发条件、可选选项的"语义标签"（如：温柔接受 / 礼貌拒绝 / 反追求）
- **AI 生成部分：** 具体描述、对话、角色反应

### 7.3 事件触发器

- 进入场景或开始活动时执行触发器评估（基于关系数值、最近事件、时间、activity context）
- 触发概率 + 优先级排序，挑选一个事件
- 每个角色对每种事件类型有冷却时间，避免重复

## 8. 关系奇点系统

这是 RPG 化的核心机制。

### 8.1 维度设计（v1） *(暂定，正式实施前需与产品所有者敲定)*

**4 个正向维度 + 3 个负向维度，共 7 个。**

#### 正向维度

| 维度 | 中文 | 说明 | 范围 |
|------|------|------|------|
| `closeness` | 亲密度 | 日常熟悉程度（聊天频率、共处时间） | 0-100 |
| `trust` | 信任度 | 角色对你的诚实、可靠、保密的判断 | 0-100 |
| `romance` | 浪漫值 | 浪漫互动倾向（暧昧、表白、亲密话题） | 0-100 |
| `friendship` | 友谊值 | 陪伴、支持、共同兴趣 | 0-100 |

#### 负向维度

| 维度 | 中文 | 说明 | 范围 |
|------|------|------|------|
| `hostility` | 敌意 | 角色对你的愤怒、敌对、攻击性 | 0-100 |
| `tension` | 紧张 | 当下气氛紧绷、不自在（短期情绪） | 0-100 |
| `distance` | 距离感 | 心理疏离、刻意保持距离（长期态度） | 0-100 |

**说明：**
- 7 个维度足够呈现复杂关系（包括"亲密但有距离"或"是朋友却有紧张"这种真实关系）
- 维度互相不互斥
- **正负维度不是简单反向**：closeness 是"熟悉度"，distance 是"心理距离"——一个家人可以亲密但有距离感
- 每个角色对每个维度有**初始值**（首次进入对话时由 `ensureRelationship` 写入 `relationships` 表）。
  开局种子走一条**优先级链**（单一来源、不重复）：
  1. `companion.initial_dims`（每角色一份手写 7 维 JSON，官方角色精调起点；有效则用）
  2. 为空 → 按 `relationship_role` 查**默认兜底表**（用户自建/工厂角色 `initial_dims` 恒空，走这里）
  3. 仍无 → 全 0（Stranger）

  **relationship_role 默认兜底表**（保守·临门一脚：只把 closeness 抬过 Stranger 线，其余压低，距下一
  里程碑留 15+ 点，升级要真聊；未列维度=0）：

  | role | closeness | trust | romance | friendship | → 等级 |
  |---|---|---|---|---|---|
  | stranger | 0 | 0 | 0 | 0 | Stranger |
  | neighbor | 21 | 3 | 0 | 5 | Acquaintance |
  | colleague | 22 | 6 | 0 | 8 | Acquaintance |
  | friend | 24 | 10 | 0 | 14 | Acquaintance |
  | family | 25 | 12 | 0 | 12 | Acquaintance |
  | crush | 22 | 4 | 14 | 5 | Acquaintance |

  数字为平衡旋钮，按试玩手感微调。校验：全部 `closeness<40`（不误升 Friend）、`trust<30 且
  closeness<40`（不进 trusted/不预解锁秘密）、`romance<30`（crush 不进 romantic_tension）。
- 这些维度在 UI 上**不直接展示数字**（见 §8.4），通过"关系等级"间接反映

#### 关系等级表（v1 初稿） *(暂定)*

数值组合 → 等级（仅作为对玩家的间接呈现）：

| 等级 | 触发条件（示例） |
|------|----------------|
| Stranger | 全部维度低（默认起步） |
| Acquaintance | closeness > 20 |
| Friend | closeness > 40 & friendship > 30 |
| Close Friend | closeness > 60 & friendship > 50 & trust > 40 |
| Romantic Interest | romance > 30 |
| Lover | romance > 70 & trust > 50 |
| Strained | tension > 50（其他无论高低） |
| Estranged | distance > 60 |
| Hostile | hostility > 50 |

负向等级优先级高于正向（即使 friendship 80，若 hostility 60，仍显示 Hostile）。

### 8.2 数值变化规则（规则引擎，非 AI 直接给分）

为什么不让 AI 直接打分：AI 给的分数不稳定、不可解释、难调优。

**正确做法：**
1. AI 生成对话回应时，**同时输出结构化的"信号标签"**（如：`{closeness: +2, romance: +1, trust: 0, friendship: +1}`）
2. 规则引擎根据信号 + 当前数值 + 角色性格做加权调整
3. 数值变化写入数据库

**为什么 AI 输出标签可控：** 通过严格的 system prompt + structured output（OpenAI / Anthropic 均支持）。

**对当前代码的对照：** 现有 `companion-engine.ts` 已有 dimensions + signal extraction 设计基础，维度命名与规则需要调整。`show-engine.ts/` 整体下线（见 §12），关系信号提取在新引擎里从头实现。

### 8.3 数值上限与衰减

- 每个维度上限 100（v1 暂定）
- **大部分阶段不衰减：** v1 不做普遍的时间衰减，降低系统复杂度
- **唯一例外：committed 阶段的关系回退** —— `committed` 后长期不互动，关系数值会缓慢下滑到 `strained` / `estranged`，制造维护压力 → 回访动机。衰减速率、阈值做成可配置参数，参考 [`daily-life-sim.md §6.1`](./daily-life-sim.md#61-committed-之后的持续玩法)。

### 8.4 数值的可见性

**v1 分两层展示，避免过度游戏化。**

**默认视图**（角色卡顶部 / 关系页主区）：
- **关系等级标签**（Stranger / Acquaintance / Friend / Close Friend / Romantic Interest / Lover / Strained / Estranged / Hostile）
- **当前关系阶段**（如 `romantic_tension`）
- **1 条阶段进度条**（距离下个阶段还差多少）
- **下一阶段提示文案**（如 "Maya might be open to a quiet walk soon."）

**折叠详细模式**（用户主动展开）：
- 7 维进度条（正向暖色 / 负向冷色），维度名清楚标注
- **不显示原始数字**（如 "73 / 100"），只展示进度条长度
- 数值变化时进度条平滑动画 + 简短文字提示（如 "Your friendship with Maya grew."）
- 移动端默认收起，节省屏幕

**v1 范围说明：** 默认视图为 v1 必须做；折叠详细模式（7 维进度条）推迟到 v1.x，初期用阶段进度条就够。

**设计原则：**
- 默认视图聚焦"关系往哪去"，不是"我刷了多少分"
- 7 维进度条只对深度玩家开放
- 进度条比"73 / 100"更柔和，不会过度引导刷分

**隐私边界：**
- 用户只能看到自己与某 companion 的关系数值
- 不展示"其他用户与 Maya 关系如何"

### 8.5 关系阶段 / 目标

关系阶段是"章节任务"的替代方案。它不是每个角色的固定剧情线，而是由当前关系维度决定的通用目标。

| Stage | 说明 |
|---|---|
| `first_contact` | 第一次认识 |
| `familiar` | 日常见面习惯形成 |
| `trusted` | 可以聊更私人的话题 |
| `close_friend` | 稳定友谊和陪伴 |
| `romantic_tension` | 出现明确暧昧 |
| `dating` | 可以发起约会活动 |
| `committed` | 告白、承诺或稳定亲密关系 |
| `strained` | 需要 repair 活动修复关系 |

UI 应展示当前阶段、下一阶段目标和推荐活动，但不展示为固定章节列表。

## 9. 解锁规则

数值阈值解锁内容：

| 解锁内容 | 触发条件示例 |
|---------|------------|
| 新对话选项 | 亲密度 > 30 |
| 新场景 | 与角色 X 浪漫值 > 50 → 解锁"角色 X 的公寓" |
| 新角色登场 | 累积 5 个角色，友谊值都 > 40 → 引入新角色"朋友圈聚会" |
| 特定剧情事件 | 浪漫值 > 80 → 触发表白事件 |

解锁规则在 `content.md` 里逐角色 / 场景列出。

## 10. Companion Story Beats

关系阶段是通用进度，但只靠阶段名仍然不够“像游戏”。v1.x 先实现了 companion story beat 框架；新的产品口径把故事体验迁移到 Scene：用户在某个 scene 下选择/创建 story，story 再通过任务进度引导聊天、旁白和事件推进。

**核心原则：**
- story beat/task 是通用框架；官方 preset story、用户私有 scene story、后续内容包都应走同一套进度与任务模型。
- 每个 task 都是“当前这个 scene story 下一步要发生什么”的理由，包含 opener/intro、objective、推荐动作和奖励。
- beat 可以由关系阶段、活动完成、事件选择或后续扩展条件解锁；v1.x 先做线性推进，不做复杂分支。
- 官方内容优先使用 authored scene stories；用户可在 Scene 页面使用剧情包模板、轻量编辑或 AI 辅助生成 3-5 个 tasks/beats。
- UI-managed beats 默认由用户手动 `Mark as done` 完成，不让一轮聊天自动跳过剧情。旧自动完成只作为早期基础框架兼容。
- Talk / sandbox chat 仍然存在；story beat 只在 Story mode 中给方向和钩子，不强制用户只能点选项。
- `scene_id` 只是物理场景，不是剧情开关；同一个 scene 可以进行 Talk，也可以切到 Story。具体边界见 [`spec-040`](../specs/spec-040-chat-scene-talk-story-modes.md)。
- 关系升温节奏可以被场景和故事轻量放大：在 companion 喜欢的 scene 里聊天，或在 Story mode 推进可完成的 active beat，本轮关系变化按固定倍率放大；正向亲密会升得更快，负向紧张/疏远也会更明显。该规则只影响关系结算，不改变角色 prompt 或 scene/story 的边界。

**默认 3-5 拍结构：**

| Beat | 作用 | 常见门槛 |
|---|---|---|
| 初见钩子 | 建立第一印象，让玩家知道 ta 当前在意什么 | `first_contact` |
| 熟悉阻力 | 暴露小矛盾、边界或未完成心事 | `familiar` |
| 私人秘密 | 让 want / secret / boundary 进入体验 | `trusted` |
| 关键选择 | 邀请、冲突、告白或共同决定 | `close_friend` / `romantic_tension` |
| 后续留钩子 | 关系稳定后开启新地点、回忆或长期目标 | `dating` / `committed` |

**场景入口呈现：**
- `scenes/enter` 返回在场 companion 时，可以附带当前 active story beat 作为 Story CTA / Story mode 上下文。
- 只有进入 Story mode 且当前 scene/companion 确实有 active beat 时，前端才展示 beat opener / objective 并把 beat 注入 chat；Talk mode 回退到普通 opener、scene action 和 daily state。
- Story mode 没有 active beat 时，不从其它 scene 或其它 companion 借剧情，也不让 AI 临时编一个大事件；保持当前场景自由聊天。
- 当 beat 已完成但下一拍门槛未达成时，UI 显示明确的等待目标，而不是让玩家感觉“什么也没发生”。
- Favorite scene 与 Story progress 的关系加速不叠加；两个条件同时满足时仍只应用一次。前端可用轻提示告诉玩家“这里关系变化更快”，但不应打断聊天。

**完成语义：**
- first_contact 进度条到 100% 时必须已经进入 `familiar`，并触发可见反馈。
- beat 完成后应至少产生一种反馈：关系 HUD 变化、unlock 庆祝、memory、事件结果或下一 beat 提示。
- 对自建角色和其他 UI-managed arc，完成动作必须来自用户显式确认；聊天、事件或 activity 可以提示“可以完成了”，但不直接替用户完成。
- 事件选项推进关系时，也要和聊天一样触发阶段解锁检测。

**Scene story setup：**
- Scene 页面提供 `Create story`：剧情包、自写、AI 辅助、稍后再说。
- 没有 story 的 scene 仍可自由聊天和使用 scene actions；Scene 页面用空状态提示“这里还没有 story”，而不是在 companion create 里强迫补建。
- Story progress 应包含当前 task、完成状态和下一步目标，供 UI 展示和 AI 引导使用。
- 进入 story 不是静默开始：用户先选择 story，再邀请一个可聊天 companion；接受后自动进入 `Story + scene_id + story_id` chat，拒绝则留在 Scene 页面。
- Scene-side story invite 按一次 `chat_message` credits 扣费；provider 失败释放预留，不保存真实 chat message。
- 分享/公开策略待 scene story ownership 规则确认后再接；不从 companion create 强行暴露。

**Chat Moment Image（后续视觉反馈层）：**
- story beat 和 activity 让玩家知道“正在发生什么”，Chat Moment Image 负责把某一轮场景聊天捕捉成“这件事发生过”的图片记忆。
- 入口放在最新 companion 回复旁；仅当聊天带有 scene context 时出现。
- prompt 由规则拼接：最近聊天内容、行为/activity、scene、time slot、companion 外貌、relationship stage、emotion/status；若当前为 Story mode 且有 active story beat，再加入 story beat。
- v1 生成完整场景图，不做抠图、不做立绘替换、不承诺与 portrait 完全一致；详细见 [`spec-027`](../specs/spec-027-chat-moment-images.md)。

## 11. 回忆相册

关系里程碑沉淀为 memory，作为长期付费价值的核心资产。

**触发链路（gameplay 关注）：** activity / event / 关系阶段推进 → 满足 milestone 条件 → 写入 memory（含 companion / scene / 日期 / 摘要 / 关键选择 / 关系变化 / 可选 `cg_url`）。

**完整 memory 类型、字段、生成规则、CG 程序合成方案见 [`daily-life-sim.md §8 Memory Album`](./daily-life-sim.md#8-memory-album) 与 [`daily-life-sim.md §9 里程碑 CG`](./daily-life-sim.md#9-里程碑-cg程序化合成)。**

## 12. 玩家旅程示例

**Tom（用户）打开 app 的一个 session：**

```
1. 进入主界面
   看到 Today in Aurelia：
   Evening. Maya is at Pier Cafe, quiet but available.
   Suggested: Check in with Maya or invite her for a short walk.

2. 点击 Pier Cafe
   场景加载：Pier Cafe 插图 + 描述 "The afternoon sun streams in. Maya is at her usual corner, reading."
   在场角色：Maya（官方角色，关系定位：crush，当前 closeness 28, romance 35）

3. Tom 选择 activity：hang_out

4. Maya 主动起话（AI 生成）
   "Oh, hey Tom! You're back. I was just reading this novel..."

5. Tom 输入回应（自由文本）
   "What's the book about?"

6. AI 生成 Maya 回应 + 信号标签
   "It's about two strangers meeting in a foreign city... [描述] Want me to lend it to you when I'm done?"
   信号：{closeness: +1, romance: +1, trust: 0, friendship: +1}

7. 规则引擎更新：closeness 29, romance 36, friendship +1

8. hang_out 完成，关系目标更新：
   "You're close to asking Maya out somewhere quieter."

9. 若达到 milestone，生成 memory：
   "An evening at the Pier Cafe"（可选 CG）

10. 离开场景，回到主界面
   通知："Your romance with Maya is growing." (隐式提示)
```

## 13. 与现有代码的关系

当前 `packages/api/src/` 里：

| 模块 | v1 处理 |
|------|---------|
| `companion-engine.ts` | **大部分保留**，需要调整 dimensions 命名与规则 |
| `scenes/` | **保留并扩展入口语义** —— 场景仍是拜访与活动发生地 |
| `events/` | **保留并扩展触发上下文** —— 增加 activity / daily state 触发条件 |
| `story-beats/` | **新增通用剧情拍层** —— companion 当前剧情目标、场景钩子、完成状态 |
| `chat/` | **保留并扩展 prompt** —— 注入 activity context / daily state |
| `relationships/` | **保留** —— 关系阶段和目标从现有维度派生 |
| `show-engine.ts/`（整个目录，含 Chapter 1/2/3 与 domain/） | **整体删除，不留任何代码** —— 固定章节制、三场景 3 回合机制与新方向完全不兼容；关系信号提取、维度规则在新引擎里从头实现，不做逻辑迁移 |
| `room.ts` Durable Object | **保留** —— 可用于实时对话状态管理 |
| Guest 创建流程 | **保留并简化** —— 角色卡字段从 15+ 减到 ~6 |

详细改造任务见 `specs/`。

## 14. 待最终敲定（在 v1 设计阶段必须落地）

- [ ] 4 个奇点维度（closeness / trust / romance / friendship）的精确定义
- [ ] 关系等级表（数值组合 → 等级名）
- [ ] Daily state 生成规则与 time slot 边界
- [ ] Activity 类型的阈值、冷却和关系信号权重
- [ ] Memory 类型与生成条件
- [ ] 8-10 个场景的具体清单（`content.md`）
- [ ] 8-10 个官方角色的具体设定（`content.md`）
- [ ] 事件类型的完整列表（v1 至少 4-5 种基础类型）
- [ ] 解锁规则的具体阈值
