# 玩法机制

> 本文档定义玩家与系统的交互细节。产品愿景见 [`vision.md`](./vision.md)，v1 具体场景与角色清单见 [`content.md`](./content.md)。
>
> **关于"暂定"标注：** 文档中标为 *(暂定)* 的内容是基于产品愿景的合理初稿，未与产品所有者最终敲定，正式实施前需重新讨论。

---

## 1. 主界面

**v1 形态：场景列表（带场景插图 / 横幅）。** *(暂定)*

- 用户打开 app 看到的核心视图是"可去的地点列表"
- 每个场景一张代表性插图 + 名称 + 简短氛围描述（如 "Late afternoon, the cafe is calm"）
- 列表上方可放置：今日提示、关系动态摘要、未读对话入口（v1.x 增量）
- **不做地图视图：** v1 不做可点击的城市地图，避免美术成本爆炸。v2+ 可升级。

**为什么列表先行：**
- 移动三端一致性更好（地图在 web 与原生端表现差异大）
- 美术资源压力小（每个场景一张插图即可）
- 用户决策路径短（看到 → 选 → 进）

## 2. 场景系统

### 2.1 场景定义（预写，存数据库）

| 字段 | 说明 |
|------|------|
| `id` | 场景唯一标识 |
| `name` | 场景名（如 "Pier Coffee Shop"） |
| `mood` | 氛围描述（注入 LLM prompt 的场景设定） |
| `tags` | 标签（cafe / office / bar / park / apartment...） |
| `possible_events` | 可能发生的事件类型 ID 列表 |
| `default_companions` | 偏好在此出现的官方角色 ID 列表（实际是否 spawn 受用户 `romance_preference` 加权抽样影响，见 §2.2） |
| `unlock_condition` | 解锁条件（可选 —— 默认全部解锁，部分场景需关系阈值） |

### 2.2 进入场景

用户点击场景 → 系统判定本次进入"在场角色"：

1. 抽取该场景 `default_companions` 中的活跃官方伴侣 + 任何把此场景列入 `preferred_scenes` 的用户自建伴侣
2. 用用户的 `romance_preference` 对候选做加权抽样（见 §3.3 性别偏好与加权）
3. 0~N 个 companion 出现：
   - 0 个：场景空，触发"环境事件"（独自的氛围片段，无 AI 对话）
   - 1 个：常规模式，与该角色对话
   - 2+ 个：群聊模式（v1.x，暂不实现）*(暂定)*

### 2.3 在场景内

可执行动作（v1）：
- **观察**：系统生成场景描写（AI 实时生成，注入 mood + 当前在场角色）
- **对话**：与在场角色对话（核心交互，见 §4）
- **选择**：当事件触发时，呈现 2-4 个选项（见 §5）
- **离开**：回到主界面

## 3. companion 系统

### 3.1 双轨

- **官方角色（v1 提供 8-10 个）：** 预写角色卡，质量基线
- **用户自创角色：** 用户填卡，私人体验

两者共用同一数据模型与对话引擎，仅 `source` 字段区分。

### 3.2 角色卡字段

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

### 3.3 性别偏好与加权 spawn

用户在「Me」页面设置 `romance_preference: 'male' | 'female' | 'any'`，存于 `users.romance_preference`，**随时可改、即时生效**（PATCH `/auth/me/preferences`，无频次限制）。

进入场景时（`POST /scenes/{id}/enter`）：

- **`any`**：不做抽样，所有候选 spawn（保留 v1 默认行为）。
- **`male` / `female`**：对每个 official 候选做伯努利试验——偏好性别权重 0.8，非偏好 0.2（`packages/api/src/companions/gender-weight.ts:PREFERENCE_WEIGHTS`）。
- **`source = 'user'`**：用户自建伴侣**永远 spawn**，不参与抽样。
- **保底**：如果加权后所有 official 候选都被剔除且没有 user 伴侣，则强制保留权重最高的一个（不让场景空着）。

场景列表（`GET /scenes`）始终展示场景的全集成员，仅按偏好做排序，便于用户掌握"这个场景里都有谁"。

## 4. 对话系统

### 4.1 对话流

```
用户进入场景 → 在场 companion 主动起话（AI 生成开场白）
  ↓
用户输入（自由文本，无选项约束）
  ↓
后端构造 prompt：
  [系统设定] + [角色卡] + [场景设定] + [关系数值快照] + [对话历史摘要] + [最近对话] + [用户输入]
  ↓
LLM 流式生成回应
  ↓
后端解析回应中的"关系信号"（见 §6.3），更新关系数值
  ↓
持久化对话 + 数值变化
  ↓
前端展示回应（流式）+ 数值变化（可选 UI 反馈，避免过度游戏化）
```

### 4.2 对话历史管理

- 每对（用户, 角色）一条 thread
- D1 存最近 N 条原文（v1 暂定 N=50）
- 超过 N 条时，旧消息由"对话摘要"代替（异步 LLM 任务生成摘要）*(暂定)*
- prompt 注入策略：摘要 + 最近 10-20 条

### 4.3 用户输入约束

- v1：纯自由文本输入
- v1.x：可加快捷选项（"问候 / 邀请 / 告别"），但不是约束
- 不做严格的输入分类或限制（避免破坏 RPG 沉浸感）

## 5. 事件系统

### 5.1 事件类型（v1 候选） *(暂定)*

| 类型 | 触发条件 | 例子 |
|------|---------|------|
| `daily_encounter` | 进入场景默认 | 在咖啡馆遇到 A，A 正在看书 |
| `invitation` | 关系数值阈值 + 随机 | A 邀请你周末去公园 |
| `conflict` | 关系数值变化触发 | A 因为你之前的话生气了 |
| `gift` | 节日 / 时间触发 | A 送你一杯咖啡 |
| `confession` | 浪漫值高阈值触发 | A 表白 |
| `milestone` | 累积时间 / 互动次数触发 | 认识 A 满 30 天 |

### 5.2 事件结构

- **预写部分：** 事件类型、触发条件、可选选项的"语义标签"（如：温柔接受 / 礼貌拒绝 / 反追求）
- **AI 生成部分：** 具体描述、对话、角色反应

### 5.3 事件触发器

- 进入场景时执行触发器评估（基于关系数值、最近事件、时间）
- 触发概率 + 优先级排序，挑选一个事件
- 每个角色对每种事件类型有冷却时间，避免重复

## 6. 关系奇点系统

这是 RPG 化的核心机制。

### 6.1 维度设计（v1） *(暂定，正式实施前需与产品所有者敲定)*

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
- 每个角色对每个维度有**初始值**（性格决定起点）：
  - "暧昧对象"角色：romance 20、friendship 10、其他 0
  - "已经讨厌你的同事"：hostility 30、distance 40、其他低
  - "陌生人"：全部 0
- 这些维度在 UI 上**不直接展示数字**（见 §6.4），通过"关系等级"间接反映

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

### 6.2 数值变化规则（规则引擎，非 AI 直接给分）

为什么不让 AI 直接打分：AI 给的分数不稳定、不可解释、难调优。

**正确做法：**
1. AI 生成对话回应时，**同时输出结构化的"信号标签"**（如：`{closeness: +2, romance: +1, trust: 0, friendship: +1}`）
2. 规则引擎根据信号 + 当前数值 + 角色性格做加权调整
3. 数值变化写入数据库

**为什么 AI 输出标签可控：** 通过严格的 system prompt + structured output（OpenAI / Anthropic 均支持）。

**对当前代码的对照：** 现有 `companion-engine.ts` 与 `show-engine.ts/domain/` 已有 dimensions + signal extraction 系统。这部分**可重用**，仅需调整维度名与规则。

### 6.3 数值上限与衰减

- 每个维度上限 100（v1 暂定）
- **不衰减：** v1 不做时间衰减（关系数值不随时间下降），降低系统复杂度

### 6.4 数值的可见性

**v1 用进度条形式可视化展示 7 个维度。**

- 在角色详情页 / 关系页用 7 个进度条展示 7 个维度（0-100）
  - 正向维度（亲密 / 信任 / 浪漫 / 友谊）用暖色调
  - 负向维度（敌意 / 紧张 / 距离感）用冷色调
- **不显示原始数字**（如 "73 / 100"），只展示进度条长度与维度名
- 关系等级在角色卡顶部显示（如 "Friend" / "Lover" / "Hostile"），由维度组合实时判定
- 数值变化时进度条平滑动画 + 简短文字提示（如 "Your friendship with Maya grew."）

**为什么显示而非隐藏：**
- 进度条是 RPG / 恋爱模拟游戏的经典呈现方式（Persona social link、galgame 好感度条等）
- 数据可视化能让玩家感受"投入有回报"
- 比纯文字提示更直观
- 进度条比"73 / 100"更柔和，不会过度引导刷分

**隐私边界：**
- 用户只能看到自己与某 companion 的关系数值
- 不展示"其他用户与 Maya 关系如何"

## 7. 解锁规则

数值阈值解锁内容：

| 解锁内容 | 触发条件示例 |
|---------|------------|
| 新对话选项 | 亲密度 > 30 |
| 新场景 | 与角色 X 浪漫值 > 50 → 解锁"角色 X 的公寓" |
| 新角色登场 | 累积 5 个角色，友谊值都 > 40 → 引入新角色"朋友圈聚会" |
| 特定剧情事件 | 浪漫值 > 80 → 触发表白事件 |

解锁规则在 `content.md` 里逐角色 / 场景列出。

## 8. 玩家旅程示例

**Tom（用户）打开 app 的一个 session：**

```
1. 进入主界面
   看到场景列表：Pier Coffee Shop / Office / Riverside Park / The Bar / Tom 的公寓
   今日提示："Maya seems to be at the cafe today."

2. 点击 Pier Coffee Shop
   场景加载：cafe 插图 + 描述 "The afternoon sun streams in. Maya is at her usual corner, reading."
   在场角色：Maya（官方角色，关系定位：crush，当前 closeness 28, romance 35）

3. Maya 主动起话（AI 生成）
   "Oh, hey Tom! You're back. I was just reading this novel..."

4. Tom 输入回应（自由文本）
   "What's the book about?"

5. AI 生成 Maya 回应 + 信号标签
   "It's about two strangers meeting in a foreign city... [描述] Want me to lend it to you when I'm done?"
   信号：{closeness: +1, romance: +1, trust: 0, friendship: +1}

6. 规则引擎更新：closeness 29, romance 36, friendship +1

7. Tom 继续对话或离开
   ...

8. 离开场景，回到主界面
   通知："Your romance with Maya is growing." (隐式提示)
```

## 9. 与现有代码的关系

当前 `packages/api/src/` 里：

| 模块 | v1 处理 |
|------|---------|
| `companion-engine.ts` | **大部分保留**，需要调整 dimensions 命名与规则 |
| `show-engine.ts` Chapter 1（综艺问答） | **废弃** —— 不符合新方向 |
| `show-engine.ts` Chapter 2（三场景约会） | **重构** —— 三场景固定 3 回合的设计要拆掉，改为"场景 + 自由对话 + 事件"模型 |
| `show-engine.ts` Chapter 3 | **废弃** —— 章节制不适用 |
| `room.ts` Durable Object | **保留** —— 可用于实时对话状态管理 |
| Guest 创建流程 | **保留并简化** —— 角色卡字段从 15+ 减到 ~6 |

详细改造任务见 `specs/`。

## 10. 待最终敲定（在 v1 设计阶段必须落地）

- [ ] 4 个奇点维度（closeness / trust / romance / friendship）的精确定义
- [ ] 关系等级表（数值组合 → 等级名）
- [ ] 8-10 个场景的具体清单（`content.md`）
- [ ] 8-10 个官方角色的具体设定（`content.md`）
- [ ] 事件类型的完整列表（v1 至少 4-5 种基础类型）
- [ ] 解锁规则的具体阈值
