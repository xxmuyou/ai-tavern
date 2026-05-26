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

### 3.1 日界定义

为了让深夜玩家有合理体验（02:00 打开 app 仍处于"今晚"），日界以**本地时间凌晨 05:00** 为切点：

- 22:00 (Day1) → 04:59 (Day2) **算 Day1 的 night**
- 05:00 (Day2) → 11:59 算 Day2 的 morning
- 计算公式：`date_local = floor((now_local - 5h) / 24h)`

**timezone 来源：**
- 取设备时区（IANA 字符串，如 `Asia/Shanghai`），存到 `users.timezone`
- 客户端首次登录与每次启动时上报
- 无法获取时回退 UTC（不阻塞用户）

### 3.2 会话锁规则

避免用户与 companion 互动期间，因跨入新 slot 而"瞬移到别的场景"：

- 用户**进入场景或开始活动**时，该 companion 的 daily state 在本次会话期间**冻结**
- 会话结束（用户离开场景 / 完成活动 / 关闭 app）后，下一次读取按当时 slot 重新取
- 实现层：进入会话时把 daily state 快照写到 chat thread / activity context，整个 session 引用这份快照
- **主页 companion 列表不锁**：每次刷新都按当前 slot 算（仅浏览，不构成会话）

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

**字段分两类生成与缓存：**

| 字段 | 生成方式 | 缓存 key | 共享范围 |
|---|---|---|---|
| `scene_id` / `mood` / `availability` / `activity_hint` | 规则生成 | `(companion_id, date_local, time_slot)` | **全局共享**（所有用户看到同一份） |
| `flavor_text` | AI 生成 + 懒加载 | `(user_id, companion_id, date_local, time_slot)` | **用户级**（按关系状态略有差异） |

**关键策略：**
- **规则字段全局共享**：Maya 周二下午就是在咖啡馆，不会因为不同用户而不同。规则字段 = 一次生成，所有用户共用，零增量成本
- **flavor_text 用户级懒加载**：用户**点开 companion 详情卡才触发生成**，写 KV（TTL ~24h）。主页"Today in Aurelia"**只展示规则字段**，不展示 flavor_text → 主页加载零 LLM 调用
- flavor_text 生成**不消耗用户对话额度**（系统行为；详见 [`monetization.md`](./monetization.md)）
- 规则字段必须服从 companion 既有人设、`preferred_scenes` 和 scene 设定，不改变角色性格或属性
- 如果规则无法选择合适场景，回退到 companion 的 `preferred_scenes`

**官方 companion 行为：**
- 每个 slot 按规则在 `preferred_scenes` + 场景 `default_companions` 里加权选位置
- mood / availability / activity_hint 由规则随机抽取，符合 companion 性格

**用户自创 companion 行为（简化规则，降低门槛）：**

| 情况 | 行为 |
|---|---|
| **创建时必选一个"初始场景"** | 从 v1 的场景库里选 1 个作为默认锚点 |
| 用户填了 `preferred_scenes` | 在 preferred_scenes 里按 slot 轮转 |
| 用户没填 `preferred_scenes` | **固定在初始场景**，不轮转 |
| `availability` | **永远 `available`**（用户花精力创的角色不应该"今天不见你"） |
| `mood` | 规则随机抽（calm / playful / busy / lonely / guarded / tired） |
| `activity_hint` | 由 scene tag 决定（cafe → "having coffee"、park → "taking a walk"） |
| `flavor_text` | 同官方角色，AI 生成 + 用户级懒加载缓存 |
| 是否参与 `romance_preference` 加权抽样 | **不参与**（自建永远 spawn，与 [`content.md §5.3`](./content.md) 一致） |

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

### 6.1 committed 之后的持续玩法

`committed` 不是关系终点，而是"稳定期"。为支撑产品北极星（每天 / 每周持续回访），committed 阶段叠加三类持续玩法：

| 玩法 | 说明 | v1 / v1.x |
|---|---|---|
| **周期性 anniversary memory** | 认识满 30 / 100 / 365 天自动触发 milestone；每月生成 "this month with X" 小结日记卡。不消耗额度。在 PG-13 范围内可解锁更亲密的合成 CG（拥抱 / 牵手 / 依偎）。 | v1 |
| **关系状态回退（committed 后唯一衰减场景）** | 长期不互动时，关系数值缓慢下滑到 strained / estranged，制造维护压力 → 回访动机。**仅在 committed 之后启用**，其它阶段不衰减。 | v1 |
| `routine` / `deep_talk` / `support` 活动 | committed 专属维持关系活动：共同小习惯、深度私密话题、daily state mood=lonely/tired 时主动关怀。 | v1.x |

**关键设计原则：**
- 衰减速率、anniversary 间隔、support 触发阈值全部做成**可配置参数**，上线后根据数据调优，避免过度惩罚用户
- v1 上线时大部分用户还未到 committed 阶段，所以这部分玩法是"为长期留存留出空间"，不是上线 day1 必须打磨完美

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

## 9. 里程碑 CG（程序化合成）

**v1 不做手绘专属 CG。** 里程碑画面由现有立绘 + 场景图 + 通用装饰层程序合成。

**合成公式：**

| 元素 | 来源 |
|---|---|
| 背景 | 现有 scene 图（已有 10 张） |
| 主体 | companion 的 neutral 立绘（已有 10 张） |
| 装饰层 | 对应 milestone 类型的边框 / 光效 / 标题卡（v1 做 4 套通用模板） |
| 文字 | 动态生成（如 "First Date with Maya · An evening at Pier Coffee Shop · 2026-05-26"） |

**v1 装饰层模板（4 套）：**

| Milestone | 装饰基调 |
|---|---|
| `first_date` | 暖金色光晕、柔光边框、星点粒子 |
| `confession` | 玫红 / 樱色渐变边框、心形或羽毛轻点缀 |
| `repair` | 蓝紫色柔光、雨后初晴质感 |
| `anniversary` | 暖橙色 + 金箔风、纪念邮票感边框 |

**关键设计原则：**
- 零额外角色资产——10 角色 × 4 milestone × N 场景全覆盖
- 自创 companion（用户传的立绘）自动适配
- 装饰层只增强视觉记忆点，不改变 companion 外貌、服装气质或 PG-13 边界
- 缺资产时仍生成 memory 日记卡，不阻塞玩法

**v1.x / v2+ 扩展空间：** 高付费意愿用户可能解锁手绘专属 CG（如 Maya 的"first kiss"独家版），作为收藏差异化付费。v1 完全不做这一层。

详细资产清单与命名规范见 [`art-checklist.md §4`](./art-checklist.md)。

## 10. 付费体验边界

v1 仍保持"免费可完整体验"，不做硬内容墙。

- 免费用户能见到日常状态、进行活动、触发约会、生成 memory
- daily state 的 `flavor_text` 生成、memory 摘要、关系阶段更新均为**系统行为，不消耗用户对话额度**
- 6 种活动统一按"用户发出消息条数"计入额度（30 条/日免费），不按活动类型区分
- CG 查看**免费可看**，但 memory 相册容量受限（如最多 20 条，老的淡出）；Pro = 无限相册 + 高清 / 手绘 CG（v2+）
- Pro 主要价值是解除消息额度、自创 companion 数量限制、相册容量

详细配额规则见 [`monetization.md`](./monetization.md)。

## 11. 用户回流机制（v1 最小集）

产品北极星 = "用户每天或每周打开 app 时，想知道某个 companion 今天在哪里"。v1 用克制的最小机制支撑这个目标，不做"刷打卡焦虑"。

**v1 做：**
- **Push notification（移动端）：**
  - 关系达到新阶段且未通知（如 Maya 进入 `romantic_tension`）
  - daily state 出现"特别事件"（如 mood=lonely 的 companion 在用户偏好场景）
  - 24h+ 未打开时温和提醒
  - **每天最多 1 条**，可在「Me」一键关全
  - 内容不剧透（"Maya 今晚在 Moon Bar" 而不是 "Maya 想和你告白"）
- **首屏"今日推荐拜访"**（在 Today in Aurelia 主页里）

**v1.x 推迟：**
- 每日 summary email
- Streak 连续登录奖励（与"日常陪伴感"调性不一致，先观察自然回访）
- companion 主动发消息找你（24h 不联系 Maya 给你发"想你了"）

## 12. 实施顺序建议（v1 / v1.x 切分）

**v1 上线必须做：**
1. **Daily hub：** 展示当前 time slot、推荐 companion、规则字段
2. **Companion state：** 稳定生成每日位置、心情、可用性、活动提示（规则字段全局共享缓存，flavor_text 用户级懒加载）
3. **6 种活动：** check_in / hang_out / invite / date / gift / repair 全做（数据流统一）
4. **Relationship goals：** 在角色详情和 daily hub 显示下一关系目标（默认视图 = 等级标签 + 阶段进度条）
5. **Memory album：** 里程碑后生成日记卡（7 种类型，`cg_url` 字段保留 nullable）
6. **程序合成 milestone CG：** 4 套通用装饰层模板上线
7. **周期性 anniversary memory + committed 衰减：** committed 阶段持续玩法的 v1 部分
8. **Push notification：** 回流机制 v1 最小集

**v1.x 推迟：**
- 7 维进度条详细模式（默认视图够用）
- `routine` / `deep_talk` / `support` 活动（committed 后玩法）
- 关系动态摘要 / 未完成事件主页提示
- 群聊（2+ companion 同场景）
- email summary / streak / companion 主动找你
- 用户自改城市名
- 手绘专属 CG

这个顺序最大化复用当前场景、角色、事件、聊天和关系系统，同时避免先陷入大规模内容生产或美术工程。
