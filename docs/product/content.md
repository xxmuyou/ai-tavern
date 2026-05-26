# v1 内容清单

> 本文档列出 v1 上线的具体内容：虚构都市设定、10 个场景、10 个官方角色。所有内容是**初稿** —— 等产品所有者敲定后，作为 D1 migration seed（见 [`architecture/data-model.md`](../architecture/data-model.md) §7）落地。
>
> **关于"暂定"标注：** 整份文档都是 *(暂定)*，等用户审阅、内容创作打磨后定稿。
>
> **重要边界：** 日常生活模拟玩法只读取本文档里的场景和角色设定，不改变 companion 的性格、属性、初始关系维度，也不改变 scene 的 mood、tags、possible_events、default_companions、unlock_condition。

---

## 1. 虚构都市设定

**名称：** **Aurelia City** *(暂定)*

一座虚构的现代都市，地理与文化上糅合东京 / 旧金山 / 巴塞罗那的元素，但不锁定任一真实城市。

**世界观要点：**
- 当代时间（与现实同时间线）
- 沿海城市，有港湾、海岸
- 多文化人口，居民来自世界各地（英文为通用语）
- 中等规模都市，公交 + 步行可达大部分场景
- 季节有春夏秋冬
- 角色无明确国籍设定（避免刻板印象，姓名多元）

**为什么虚构：** 不锁定真实城市避免文化敏感问题，又能融合多种美学。

---

## 2. 场景清单（10 个）

每个场景的最终字段对应 `scenes` 表（[data-model.md §3.4](../architecture/data-model.md#34-scenes)）。下表展示核心信息，完整 prompt-ready mood 描述在内容打磨阶段补全。

这些场景同时是日常生活系统的活动容器：
- daily state 只能从已解锁且适配的 scene 中选择 companion 今日位置
- activity / date / memory 都发生在 scene 内
- 场景的 `tags` 与 `possible_events` 决定哪些活动和事件更自然
- 不为了日常系统修改场景基础属性；如需扩展，只新增玩法映射表

### 场景总览

| ID | Name | Tags | 氛围 | 默认偏好角色 | 解锁条件 |
|----|------|------|------|------------|---------|
| `pier_coffee_shop` | Pier Coffee Shop | cafe, waterfront | 海边咖啡馆，下午黄金时光 | Maya, Theo | 默认解锁 |
| `sky_office` | Sky Office | office, day | 高层办公室，工作日 | Ryan, Aiko | 默认解锁 |
| `twin_pines_park` | Twin Pines Park | park, outdoor | 中央公园，傍晚跑步时段 | Ethan, Iris | 默认解锁 |
| `moon_bar` | Moon Bar | bar, night | 都市酒吧，深夜慵懒 | Lila | 默认解锁 |
| `sunrise_apartment` | Sunrise Apartment | home, intimate | 公寓楼层走廊 / 自家公寓 | Iris | 默认解锁（自家） |
| `brookside_bookshop` | Brookside Bookshop | indoor, quiet | 老书店，雨天午后 | Sora, Aiko, Theo | 默认解锁 |
| `skyline_rooftop` | Skyline Rooftop | outdoor, night | 屋顶花园，深夜星空 | Sora, Marcus | 与 Sora 或 Marcus closeness > 30 |
| `iron_forge_gym` | Iron Forge Gym | indoor, energetic | 健身房，清晨 | Ethan | 默认解锁 |
| `crescent_library` | Crescent Library | indoor, quiet | 大学图书馆 | Marcus, Aiko | 默认解锁 |
| `harbor_market` | Harbor Market | outdoor, daytime | 周末街市，海港边 | Jordan, Lila | 默认解锁 |

### 场景细节

#### `pier_coffee_shop` — Pier Coffee Shop
- **Mood prompt：** "A small, warmly lit coffee shop at the end of the pier. Late afternoon sun streams through the windows, casting long golden shadows. The hiss of the espresso machine and the smell of fresh pastries fill the air. Always quiet enough to talk, never empty."
- **Possible events：** `daily_encounter`, `invitation`, `gift`
- **典型情境：** 偶遇某人在角落读书 / 写作 / 看海
- **适配活动：** `check_in`, `hang_out`, `invite`, `date`, `gift`

#### `sky_office` — Sky Office
- **Mood prompt：** "The 27th floor of an open-plan office. Floor-to-ceiling windows, hum of conversation, the constant rustle of keyboards. Late-week energy: a mix of deadlines and casual banter."
- **Possible events：** `daily_encounter`, `conflict`, `invitation`
- **典型情境：** 同事茶水间偶遇、加班相遇
- **适配活动：** `check_in`, `hang_out`, `invite`, `repair`

#### `twin_pines_park` — Twin Pines Park
- **Mood prompt：** "A wide central park bordered by twin rows of pine trees. Joggers in the morning, families in the afternoon, soft golden light in the evening. The sound of distant traffic mixes with birdsong."
- **Possible events：** `daily_encounter`, `invitation`, `milestone`
- **典型情境：** 跑步偶遇、傍晚散步、周末野餐
- **适配活动：** `check_in`, `hang_out`, `invite`, `date`, `repair`

#### `moon_bar` — Moon Bar
- **Mood prompt：** "A dimly lit cocktail bar on a backstreet, with neon moon decor and warm wooden counters. Soft jazz plays in the background. Quiet enough for real conversation, busy enough not to feel alone."
- **Possible events：** `daily_encounter`, `confession`, `gift`
- **典型情境：** 一杯酒后的深夜对话
- **适配活动：** `check_in`, `hang_out`, `date`, `gift`, `repair`

#### `sunrise_apartment` — Sunrise Apartment
- **Mood prompt：** "Your apartment building, mostly the shared landing or your own front door. Mornings bring the smell of fresh bread from downstairs. Quiet, familiar, the closest thing to home."
- **Possible events：** `daily_encounter`, `gift`, `milestone`
- **典型情境：** 邻居偶遇、收快递时碰面
- **适配活动：** `check_in`, `hang_out`, `gift`, `repair`

#### `brookside_bookshop` — Brookside Bookshop
- **Mood prompt：** "A two-floor old bookshop tucked beside a small stream. The smell of paper and dust. Reading nooks scattered between the shelves. On rainy days, the windows fog up and the shop feels like a secret."
- **Possible events：** `daily_encounter`, `gift`, `invitation`
- **典型情境：** 推荐书、偶遇正在读同一本书的人
- **适配活动：** `check_in`, `hang_out`, `invite`, `date`, `gift`

#### `skyline_rooftop` — Skyline Rooftop
- **Mood prompt：** "A rooftop garden on a residential tower. City lights stretch to the horizon. Cool wind, distant traffic hum. A place people come to think, to escape, or to be honest."
- **Possible events：** `confession`, `milestone`, `invitation`
- **典型情境：** 深夜畅谈、表白时刻
- **解锁逻辑：** v1 设为 closeness > 30 才解锁（让玩家有"探索新地方"的感觉）
- **适配活动：** `hang_out`, `date`, `repair`

#### `iron_forge_gym` — Iron Forge Gym
- **Mood prompt：** "An old-school gym with iron weights, the smell of chalk and rubber. Early-morning regulars: each on their own routine, occasional nods of recognition."
- **Possible events：** `daily_encounter`, `invitation`
- **典型情境：** 健身器材相邻、教练指导
- **适配活动：** `check_in`, `hang_out`, `invite`

#### `crescent_library` — Crescent Library
- **Mood prompt：** "A grand old library with high vaulted ceilings and reading rooms shaped like a crescent. Whispered conversations, the soft scratch of pens. A place for serious study or unexpected encounters."
- **Possible events：** `daily_encounter`, `gift`, `invitation`
- **典型情境：** 借同一本书、长桌对坐
- **适配活动：** `check_in`, `hang_out`, `invite`, `date`

#### `harbor_market` — Harbor Market
- **Mood prompt：** "A weekend market along the harbor: stalls of street food, vintage trinkets, art prints. Crowded but lively. The smell of grilled fish and fresh bread."
- **Possible events：** `daily_encounter`, `gift`, `invitation`
- **典型情境：** 摊位偶遇、一起逛市集
- **适配活动：** `check_in`, `hang_out`, `invite`, `date`, `gift`

---

## 3. 官方角色清单（10 个）

10 个角色覆盖各种性别、关系定位、性格类型，确保每个用户都能找到感兴趣的对象。

### 角色总览

| ID | Name | Gender | Age | Role | 偏好场景 | 一句话定位 |
|----|------|--------|-----|------|---------|-----------|
| `maya` | Maya Chen | F | 26 | crush | pier_coffee_shop, brookside_bookshop | 文艺敏感的平面设计师，安静的暧昧 |
| `ryan` | Ryan Park | M | 28 | colleague | sky_office, twin_pines_park | 理性温柔的同事工程师 |
| `lila` | Lila Marchetti | F | 30 | stranger | moon_bar, harbor_market | 冷艳神秘的调酒师 |
| `ethan` | Ethan Williams | M | 27 | friend | iron_forge_gym, twin_pines_park | 阳光开朗的健身教练 |
| `sora` | Sora Aizawa | F | 24 | crush | skyline_rooftop, brookside_bookshop | 自由灵魂的独立音乐人 |
| `marcus` | Marcus Reid | M | 32 | friend | crescent_library, skyline_rooftop | 沉静睿智的记者 |
| `aiko` | Aiko Tanaka | F | 29 | colleague | sky_office, brookside_bookshop, crescent_library | 知性内敛的建筑师 |
| `jordan` | Jordan Lopez | M | 26 | stranger | harbor_market, moon_bar | 浪荡不羁的街头摄影师 |
| `iris` | Iris Bennett | F | 31 | neighbor | sunrise_apartment, twin_pines_park | 温暖包容的单亲妈妈邻居 |
| `theo` | Theo Nakamura | M | 28 | crush | pier_coffee_shop, brookside_bookshop | 温和文艺的咖啡师 |

**关系定位分布：** crush ×4 / friend ×2 / colleague ×2 / stranger ×2 / neighbor ×1
**性别分布：** 女 ×5 / 男 ×5

> 用户在「Me」页面可以设置恋爱偏好（女 / 男 / 不限）。该偏好仅影响场景中伴侣的出现频率：偏好性别 80%、非偏好 20%（`packages/api/src/companions/gender-weight.ts`）。选「不限」时不抽样、所有默认伴侣全部 present；用户自建的伴侣不参与抽样、始终出现；详见 [`spec-017-romance-preference.md`](../specs/spec-017-romance-preference.md) 及 [`gameplay.md`](./gameplay.md)。

### 3.1 Maya Chen
- **Appearance：** Asian-American, slim build, dark shoulder-length hair often tucked behind one ear, prefers oversized cardigans and sneakers. Always carries a sketchbook.
- **Personality：** Quietly observant, sensitive to detail, slightly anxious in groups, opens up one-on-one. Has strong aesthetic opinions she rarely volunteers.
- **Background：** Freelance graphic designer who recently moved to Aurelia after a breakup in her last city. Spends most afternoons drawing in coffee shops to fight loneliness.
- **Speech style：** Soft-spoken, often pauses mid-sentence, uses metaphors, asks more questions than she answers.
- **Initial dimensions：** closeness 5, trust 5, romance 10, friendship 5, hostility 0, tension 5, distance 20

### 3.2 Ryan Park
- **Appearance：** Korean-American, tall, athletic build, neat short hair, business casual at work but always with the same worn pair of running shoes.
- **Personality：** Logical and warm at once. Listens carefully. Tends to give advice when asked, not before. Hides a dry sense of humor behind professionalism.
- **Background：** Senior software engineer at a fintech startup on the 27th floor. Single, focuses on running marathons and woodworking on weekends.
- **Speech style：** Precise, occasionally formal, lets warmth show through small acts (remembering your coffee order) rather than words.
- **Initial dimensions：** closeness 10, trust 10, romance 0, friendship 10, hostility 0, tension 0, distance 15

### 3.3 Lila Marchetti
- **Appearance：** Italian-Brazilian, mid-length wavy auburn hair, sharp green eyes, always in dark clothes with one striking accessory.
- **Personality：** Reads people instantly, gives little away. Direct when she chooses to speak. Believes most relationships are temporary, which makes the ones she values fierce.
- **Background：** Head bartender at Moon Bar. Moved to Aurelia ten years ago, has seen the bar from owner #1 to #3.
- **Speech style：** Low, deliberate, often uses silence as response. Occasionally drops something startlingly honest.
- **Initial dimensions：** closeness 0, trust 0, romance 5, friendship 0, hostility 0, tension 10, distance 40

### 3.4 Ethan Williams
- **Appearance：** Black, tall, broad shoulders, close-cropped hair, always in athletic wear. Easy smile, expressive eyebrows.
- **Personality：** Genuine, encouraging, energy comes from helping people grow. Talks easily, listens harder than he lets on. Honest to a fault.
- **Background：** Personal trainer at Iron Forge Gym. Former college athlete, switched careers after an injury. Loves cooking.
- **Speech style：** Direct, motivational, peppered with "you got this" and gentle teasing.
- **Initial dimensions：** closeness 10, trust 10, romance 0, friendship 15, hostility 0, tension 0, distance 10

### 3.5 Sora Aizawa
- **Appearance：** Japanese, slender build, layered black-and-platinum hair just past the shoulders, often in oversized vintage clothes and multiple rings. Sharp eyeliner, no makeup beyond it.
- **Personality：** Lives in the moment. Hates labels. Brutally honest, occasionally cryptic. Drawn to people who are honest back.
- **Background：** Independent musician, plays small venues, releases music online. Crashes on friends' couches as often as her own apartment.
- **Speech style：** Casual, fragmented, song-lyric quality. Drops poetry into conversation without flagging it.
- **Initial dimensions：** closeness 0, trust 5, romance 10, friendship 5, hostility 0, tension 5, distance 30

### 3.6 Marcus Reid
- **Appearance：** Mid-30s, mixed European descent, salt-and-pepper hair, always slightly underdressed for the situation. Carries a battered notebook.
- **Personality：** Patient, observant, holds opinions carefully and shares them slowly. Trusts hard-won. Has a wry sense of humor about heavy topics.
- **Background：** Investigative journalist at a local paper. Divorced, no kids. Spends most evenings either writing or at the library.
- **Speech style：** Measured, articulate, sometimes asks questions that feel like quiet challenges.
- **Initial dimensions：** closeness 5, trust 10, romance 0, friendship 10, hostility 0, tension 5, distance 20

### 3.7 Aiko Tanaka
- **Appearance：** Japanese, mid-length straight hair, minimalist style, always carries a hardcover notebook and a thermos of green tea.
- **Personality：** Reserved at first, sharp once she warms up. Has strong principles. Notices small kindnesses, returns them quietly.
- **Background：** Architect at a mid-size firm. Works on Aurelia's renovation projects. Lives alone with two cats. Reads architecture history for fun.
- **Speech style：** Clear, considered, occasionally a touch formal. Surprises people with sudden warmth or dry humor.
- **Initial dimensions：** closeness 5, trust 5, romance 5, friendship 5, hostility 0, tension 5, distance 25

### 3.8 Jordan Lopez
- **Appearance：** Latino, lean, mid-length wavy hair, camera always around his neck, paint-stained jeans.
- **Personality：** Charming on the surface, guarded underneath. Lives by impulse. Believes art is in the imperfect moment. Hard to pin down.
- **Background：** Street photographer who makes ends meet doing event work. Travels often, comes back to Aurelia when he runs out of money.
- **Speech style：** Quick, playful, peppered with deflection. Becomes uncharacteristically still when something matters.
- **Initial dimensions：** closeness 0, trust 0, romance 10, friendship 0, hostility 0, tension 5, distance 40

### 3.9 Iris Bennett
- **Appearance：** British, mid-30s, curly brown hair often tied up, comfortable practical clothes, kind eyes.
- **Personality：** Warm without being naïve. Practical, generous with time, holds firm boundaries when needed. Has lived enough to be unflappable.
- **Background：** Your neighbor across the hall. Single mom to a 7-year-old. Works as a pediatric nurse. Always has tea ready.
- **Speech style：** Warm, slightly maternal, but never condescending. Occasionally sharp wit.
- **Initial dimensions：** closeness 15, trust 15, romance 0, friendship 15, hostility 0, tension 0, distance 5

### 3.10 Theo Nakamura
- **Appearance：** Japanese-Canadian, gentle features, longer side-swept hair, soft clothes, almost always in an apron at work.
- **Personality：** Gentle, attentive, listens like he's reading a book. Quietly creative, writes short stories on the side. Slow to share, deep when he does.
- **Background：** Barista at Pier Coffee Shop, six years running. Studied literature, never quite finished. Writes most mornings.
- **Speech style：** Soft, thoughtful, occasionally quotes books in casual conversation. Smiles more than he speaks.
- **Initial dimensions：** closeness 5, trust 10, romance 10, friendship 10, hostility 0, tension 0, distance 15

---

## 4. 事件类型清单（v1）

详见 [`gameplay.md`](./gameplay.md) 的事件系统。v1 至少实现以下 6 种：

- `daily_encounter` — 进入场景默认偶遇
- `invitation` — 角色邀请你做什么（外出、共度时间）
- `conflict` — 角色因为之前的行为生气、误解
- `gift` — 角色送你东西 / 你送角色礼物
- `confession` — 浪漫值高时的告白
- `milestone` — 认识 N 天 / 第 N 次见面等里程碑

每个事件类型的具体内容由 LLM 在运行时生成，但事件触发的"骨架"（参与者、场景、选项语义标签）由后端规则引擎决定。

---

## 5. 日常活动与关系阶段映射

本文档不新增角色剧情线，只定义通用玩法如何使用现有内容。

### 5.1 活动类型

| Activity | 内容来源 | 说明 |
|---|---|---|
| `check_in` | daily state + companion card | 简短问候，建立每日陪伴感 |
| `hang_out` | scene tags + mood + companion personality | 一起做当前场景自然发生的小活动 |
| `invite` | relationship dimensions + scene unlock | 邀请角色去另一个地点或未来活动 |
| `date` | romance/trust/closeness + scene fit | 明确恋爱向约会，仍由 AI 按人设表达 |
| `gift` | event template + relationship state | 礼物事件，不要求复杂背包系统 |
| `repair` | tension/hostility/distance | 修复误会、道歉、重建边界 |

### 5.2 关系阶段

关系阶段由现有维度派生，不写入 companion 原始设定。

| Stage | 内容作用 |
|---|---|
| `first_contact` | 引导首次拜访与 first meeting memory |
| `familiar` | 引导日常 check in / hang out |
| `trusted` | 引导更私人、更脆弱的话题 |
| `close_friend` | 引导稳定陪伴和 friendship milestone |
| `romantic_tension` | 引导 invite / date |
| `dating` | 引导 first date / confession / anniversary |
| `committed` | 引导长期陪伴和纪念日 |
| `strained` | 引导 repair，避免负向关系下强推 date |

---

## 6. 解锁与进度规则示例 *(暂定)*

部分由数值阈值触发的解锁，v1 至少包含：

| 触发 | 解锁 |
|------|------|
| Maya closeness > 50 | 解锁 invitation 事件类型："Maya invites you to a small art exhibition" |
| Sora closeness > 30 | 解锁场景 `skyline_rooftop`（Sora 的常去地） |
| Marcus trust > 40 | 解锁 invitation："Marcus invites you to dinner at his place" |
| Lila romance > 30 | 解锁 confession 事件（Lila 不轻易表白） |
| 任意角色 hostility > 50 | 该角色拒绝你进入其偏好场景一段时间（冷战机制） |
| 累积 friendship > 40 with ≥ 3 角色 | 解锁 milestone："Your social circle is growing"（暗示生活变好） |

完整解锁矩阵在 v1 内容打磨阶段填写。

---

## 7. 内容创作流程

### 7.1 角色卡 prompt 模板

10 个官方角色的 `appearance` / `personality` / `background` / `speech_style` 上文已给初稿，但**正式上线前**需要：
1. 由内容编辑（或 LLM 辅助）扩写至每角色 300-500 字
2. 人工审阅，校对内部一致性（如 Maya 的孤独感与对话表现一致）
3. 与角色立绘对齐（动漫 / 二次元风格）

### 7.2 场景插图

10 个场景每个需要：
- 横幅插图 1200×800（动漫 / 二次元风格）
- 缩略图 600×400（场景列表用）

**美术 pipeline 选项：**
- 自绘（团队美术）
- AI 生成 + 人工修缮（如 Midjourney / Stable Diffusion + Photoshop）
- 外包

详见 v1 内容打磨阶段决定。

### 7.3 角色立绘

每个角色需要：
- 标准立绘 1 张（768×1024）
- 头像 1 张（512×512）

### 7.4 里程碑 CG

里程碑 CG 不改变角色设定，也不是每章剧情插图。它只作为 memory album 的奖励资产。

优先制作类型：
1. `first_date`
2. `confession`
3. `repair`
4. `anniversary`

如果 CG 缺失，系统仍生成 memory 日记卡，不阻塞玩法。

---

## 8. v1 上线内容 checklist

- [ ] 都市 Aurelia City 命名最终确认（或换名）
- [ ] 10 个场景的 mood prompt 终稿
- [ ] 10 个场景插图（横幅 + 缩略图）
- [ ] 10 个官方角色的扩写角色卡
- [ ] 10 个官方角色立绘 + 头像
- [ ] 场景 × 活动映射确认
- [ ] 关系阶段阈值确认
- [ ] Memory 类型与触发条件确认
- [ ] 首批 milestone CG 清单确认
- [ ] 解锁矩阵完整填写
- [ ] 内容 migration seed SQL（`0004_seed_scenes_v1.sql`、`0005_seed_official_companions_v1.sql`）

---

## 9. 待最终敲定

- [ ] 都市名 `Aurelia City` 还是其他
- [x] 角色性别比定为 5 男 5 女；用户通过 `romance_preference` 调出现权重（spec-017）
- [ ] 角色姓氏命名风格（v1 用国际混合姓 vs 锁定某文化）
- [ ] 关系定位 `crush` 角色是否过多（4 个 vs 总 10 个）
- [ ] 是否在 v1 加入"动物 companion"（如宠物 NPC）—— 我倾向不加
- [x] 是否提供少量"角色剧情线"：不做固定角色剧情线，改为通用关系阶段与日常活动系统
