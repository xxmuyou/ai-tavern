# 日常生活关系模拟

> 本文档定义下一阶段玩法拓展方向：在不改 companion 人设、属性、场景设定、scenario 加成的前提下，增加一层"日常生活模拟"系统。它是 [`vision.md`](./vision.md) 与 [`gameplay.md`](./gameplay.md) 的玩法补充。

---

## 1. 设计目标

当前产品已有场景、角色、关系维度、事件、对话和美术资产，但核心体验仍偏"进入场景后聊天"。下一阶段要让用户感觉 companion 生活在 Aurelia City 中，而不是只在聊天窗口里等待用户。

**目标体验：**
- 用户每天打开 app，看到今天的城市状态和 companion 状态
- companion 会出现在不同场景，拥有 mood、availability、activity hint
- 用户通过拜访、活动、约会、送礼、修复关系等行为推动关系
- 关系推进产生明确阶段目标和里程碑回忆
- 关键 CG 作为重要里程碑奖励进入相册，形成长期收藏价值

**不做：**
- 不改现有 companion 性格、外貌、背景、说话风格、初始关系维度
- 不改现有 scene mood、tags、possible_events、default_companions、unlock_condition
- 不做 3D、捏脸、建模、建造、开放地图
- 不做按角色重写的固定剧情章节

## 2. 核心循环

```
用户打开 app
  ↓
Today in Aurelia：显示当前真实时间段、推荐拜访、角色状态
  ↓
用户选择 companion 或场景
  ↓
系统展示该 companion 今日所在地点、心情、正在做什么、可用活动
  ↓
用户选择活动：Check in / Hang out / Invite / Gift / Repair / Date
  ↓
进入活动上下文下的 AI 对话与事件
  ↓
关系维度变化，关系阶段目标更新
  ↓
达到阈值时生成 milestone memory，可附带关键 CG
  ↓
回到日常主页或继续聊天
```

## 3. 现实时间模型

v1 使用用户真实日期与粗粒度时间段，不使用复杂游戏内时钟。

| Time slot | 建议时间 | 体验用途 |
|---|---:|---|
| `morning` | 05:00-11:59 | 通勤、咖啡、健身、邻居偶遇 |
| `afternoon` | 12:00-16:59 | 工作、书店、公园、日间邀约 |
| `evening` | 17:00-21:59 | 散步、晚餐、约会、下班后事件 |
| `night` | 22:00-04:59 | 酒吧、屋顶、深夜谈心、脆弱时刻 |

**规则：**
- 同一用户、同一自然日、同一 time slot 内的 companion state 应保持稳定
- 切换 time slot 后可以刷新状态
- 允许用户在任意时间进入已解锁场景，但推荐状态应优先匹配当前 time slot
- v1 不做天气、季节、节假日的硬规则；这些可作为后续扩展

## 4. Companion Daily State

Daily state 是日常生活感的核心。它只是一层运行时状态，不修改 companion 原始设定。

### 4.1 状态字段

| 字段 | 说明 |
|---|---|
| `companion_id` | 对应现有 companion |
| `date_local` | 用户本地日期 |
| `time_slot` | `morning` / `afternoon` / `evening` / `night` |
| `scene_id` | 今日所在场景，必须来自现有 scene |
| `mood` | 今日心情标签，如 `calm` / `busy` / `lonely` / `playful` / `guarded` / `tired` |
| `availability` | `available` / `busy` / `away` |
| `activity_hint` | 规则生成的短语，如 "reading alone" / "finishing work" |
| `flavor_text` | AI 生成的展示文案，必须服从 companion 既有人设 |

### 4.2 生成原则

- 规则决定 `scene_id`、`mood`、`availability`、`activity_hint`
- AI 只根据规则结果、companion 卡、scene mood 写 `flavor_text`
- 如果规则无法选择合适场景，回退到 companion 的 `preferred_scenes`
- 如果 companion 不可用，仍可显示状态，但活动入口减少
- 用户自创 companion 使用其 `preferred_scenes`；没有偏好时进入通用可用场景池

## 5. 活动系统

活动是用户每天可执行的核心玩法。它不是替代聊天，而是给聊天增加目标和上下文。

| Activity | 用途 | 条件 |
|---|---|---|
| `check_in` | 简短问候，低成本建立日常感 | companion available/busy 均可 |
| `hang_out` | 一起做当前场景适配的小活动 | companion available |
| `invite` | 邀请去另一个场景或未来约会 | closeness / trust 达到基础阈值 |
| `date` | 明确恋爱向约会活动 | romance 或 relationship role 适配，且负向维度不过高 |
| `gift` | 送小礼物或接受礼物事件 | 每日/冷却限制 |
| `repair` | 修复 tension / hostility / distance | 负向维度达到阈值 |

**活动原则：**
- 活动只改变上下文、事件触发机会和关系信号权重，不改 companion 人设
- 每个活动应有开始、对话推进、完成/中断三个状态
- 活动完成后可以触发关系变化、事件、关系阶段进度或 memory
- 免费用户可体验所有活动，但受每日消息额度影响

## 6. 关系阶段与目标

"章节"在本产品中应理解为关系阶段或关系目标，不是预写角色剧情线。

| Stage | 目标感 | 示例触发 |
|---|---|---|
| `first_contact` | 认识并留下第一印象 | first met |
| `familiar` | 建立日常见面习惯 | closeness > 20 |
| `trusted` | 建立信任与私人话题 | trust > 35 |
| `close_friend` | 形成稳定陪伴关系 | friendship > 45 & trust > 35 |
| `romantic_tension` | 出现暧昧和约会机会 | romance > 30 |
| `dating` | 可以发起明确约会活动 | romance > 50 & tension/hostility 不高 |
| `committed` | 告白、承诺或稳定亲密关系 | romance > 75 & trust > 55 |
| `strained` | 需要修复关系 | tension / hostility / distance 达到阈值 |

**呈现方式：**
- UI 展示当前关系 level、下一阶段目标和推荐活动
- 不展示为固定章节列表，避免用户以为每个角色有硬编码剧情线
- 同一阶段在不同 companion 身上表现不同，由既有人设和 AI 对话决定

## 7. 约会流程

约会是活动系统中的高价值活动，不是独立剧情模式。

```
Invite
  ↓
Accept / Decline / Postpone（由关系维度、daily state、AI 反应决定）
  ↓
Choose or confirm scene
  ↓
Date activity starts with scene-specific context
  ↓
Free chat + event option
  ↓
Date closes with relationship changes
  ↓
If milestone reached: create memory + optional CG
```

**约会边界：**
- PG-13：暧昧、牵手、拥抱、告白、情绪亲密
- 不做露骨性内容
- companion 可以拒绝、推迟或设置边界；拒绝应尊重人设和关系状态
- 高 hostility / tension / distance 时，优先引导 repair，而不是强行 date

## 8. Memory Album

Memory 是用户长期付费价值的核心资产。它把 AI 过程沉淀成可回看的收藏。

### 8.1 Memory 类型

| Type | 说明 |
|---|---|
| `first_meeting` | 第一次认识 |
| `first_hangout` | 第一次有效 hang out |
| `first_date` | 第一次 date |
| `gift_received` | 重要礼物 |
| `confession` | 告白 / 明确心意 |
| `repair` | 修复一次重要冲突 |
| `anniversary` | 认识 N 天或互动 N 次 |

### 8.2 Memory 内容

| 字段 | 说明 |
|---|---|
| `companion_id` | 关联 companion |
| `scene_id` | 发生地点 |
| `activity_id` | 可选，关联活动 |
| `memory_type` | 类型 |
| `title` | 简短标题 |
| `summary` | AI 辅助生成的日记式摘要 |
| `key_choice` | 用户当时的关键选择或关键话语 |
| `relationship_delta` | 本次关系变化摘要 |
| `cg_url` | 可选关键 CG |
| `created_at` | 生成时间 |

**规则：**
- 同一 companion 的同一 milestone 默认只生成一次
- 没有 CG 时仍生成日记卡，不阻塞玩法
- Memory 出现在全局相册和 companion 详情页时间线

## 9. 关键 CG 策略

关键 CG 是里程碑奖励，不是聊天表情，也不是每个场景的通用背景。

**优先级：**
1. `first_date`：第一次明确约会
2. `confession`：告白 / 明确心意
3. `repair`：冲突修复后的脆弱时刻
4. `anniversary`：长期陪伴纪念

**制作原则：**
- 保持现有角色外貌、服装气质和场景风格一致
- 不改变 companion 基础设定
- 画面重点是情绪与瞬间，不做复杂多人构图
- 可先做通用 milestone CG 模板，再逐步补角色专属版本

## 10. 付费体验边界

v1 仍保持"免费可完整体验"，不做硬内容墙。

- 免费用户能见到日常状态、进行活动、触发约会、生成 memory
- Pro 主要价值是解除消息额度、自创 companion 数量限制，并支持更长时间沉浸
- CG 和相册应增强付费意愿，但不应让免费用户无法理解核心体验
- 如果后续引入高级相册展示、高清 CG、更多自创 companion 记忆空间，应作为 Pro 增强项，而不是主线体验断点

## 11. 实施顺序建议

1. **Daily hub：** 展示当前 time slot、推荐 companion、今日状态
2. **Companion state：** 稳定生成每日位置、心情、可用性、活动提示
3. **Activity start：** 增加 activity context，让聊天知道用户正在做什么
4. **Relationship goals：** 在角色详情和 daily hub 显示下一关系目标
5. **Memory album：** 里程碑后生成日记卡
6. **Milestone CG：** 给关键 memory 挂 CG 资产

这个顺序能最大化复用当前场景、角色、事件、聊天和关系系统，同时避免先陷入大规模内容生产。
