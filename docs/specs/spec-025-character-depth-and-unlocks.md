# spec-025: 角色深度 + 解锁系统（沉浸感阶段 1）

> **类型：** 后端 + 前端  |  **依赖：** spec-004(companions), spec-006(chat/prompt), spec-005(relationships/stage), spec-013(seed), spec-019(创建 UI), spec-024(阶段 0)  |  **估时：** 6-9 天  |  **状态：** 🟡 in-progress（实现 + 静态检查 + 单测完成，待运行端到端验证）

---

## 实现记录（2026-05-29）

**后端（`packages/api`）**
- 迁移 `0019_companion_persona_fields.sql`：`companions` 加 `want/secret/boundary`（可空）。
- 迁移 `0020_companion_persona_seed.sql`：`UPDATE`-by-id 回填 10 个官方角色（不动 0007）。
- 迁移 `0021_relationship_unlocks.sql`：`relationships.last_stage` 列 + `relationship_unlocks` 表 + 索引。
- `companions/index.ts`：行类型/`loadCompanion` SELECT/create/update/序列化/输入校验全部带上三字段；`getCompanion` 仅对**自创角色的所有者**回传 want/secret/boundary（官方角色不泄露 secret，走解锁端点）。
- `chat/loaders.ts`：`loadCompanionForChat` 读出三字段。
- `chat/prompt.ts`：注入 `want`（始终）、`boundary`（始终 + 触碰→守住）、`secret`（仅 `secretToReveal` 非空时）；新增议程/主动/保留 三条行为规则 + 按 stage 的称呼阶梯（`addressGuidanceForStage`）。`ChatPromptInput` 加 `secretToReveal` + `stage`。
- `relationships/unlocks.ts`（新）：stage 阶梯排名、`UNLOCK_DEFS`（title:familiar/expr:playful @familiar，secret/expr:tense @trusted，title:close @close_friend）、`unlockKeysForStage`、`isEmotionUnlocked`（neutral/warm/guarded/annoyed 始终可用）、`detectAndRecordUnlocks`（成就语义，永久 + 去重）、`buildUnlockStatus`。
- `chat/messages.ts`：建 prompt 前算 `stage` + 据解锁门控 `secretToReveal`；`applySignals` 后调 `detectAndRecordUnlocks`，新增 SSE `unlocks` 事件。
- `relationships/index.ts`：新增 `GET /relationships/:id/unlocks`（stage + items + scenes + secret(Pro/owner 才回文本) + is_pro/is_owner）；scenes 复用 `scenes/unlock.ts` 的 `evaluateUnlock`。
- 单测：`relationships/unlocks.test.ts`（纯函数 + 检测）、扩充 `chat/prompt.test.ts`；全套 **366 passed**。

**前端（`apps/app`）**
- `api/types.ts`：`CompanionDetail`/`CompanionCreateInput` 加 want/secret/boundary；新增 `ChatUnlock`、`RelationshipUnlock*`。
- `api/companion-client.ts`：`getCompanionUnlocks`。`use-companions.ts`：`useCompanionUnlocks`。
- `hooks/use-chat-stream.ts`：`onUnlocks` 回调 + 解析 `unlocks` SSE。
- `utils/expression-unlock.ts`：镜像后端的表情 stage 门控（`gateEmotion`），未解锁回退 neutral。
- `components/UnlockCelebration.tsx`：收到 `unlocks` 的轻量庆祝；`components/CompanionUnlocksPanel.tsx`：角色页“已解锁”区（秘密/称呼/表情/场景 + 锁态 + Pro 升级引导）。
- `utils/portrait.ts`：抽出共享的情绪展示常量（label/emoji/tint/比例/`resolvePortrait`），供 `PortraitBar` 与图鉴复用。`components/CompanionGalleryPanel.tsx` + `components/PortraitViewerModal.tsx`：角色页立绘图鉴网格 + 全屏查看器（见 §B4.4/§B5）。
- `CompanionForm.tsx`：新增“Inner life”面板（want/secret/boundary，带说明），create/edit 两端贯通。
- 两端聊天屏接 `onUnlocks` + 庆祝 + `gateEmotion` 门控立绘；两端角色页插入解锁面板。
- `tsc --noEmit` 与 `expo lint` 均通过。

**与 §B5 的一处范围取舍（待 product owner 确认）**：§B5 把“高阶表情显示”“进入新解锁场景”也列为 Pro 权益。本期：
- **secret 文本**严格 Pro 门控（服务端，仅 Pro/owner 返回文本）✅ 完全按 §B5。
- **高阶表情**：实现为 **stage 门控（对所有用户一致）**，未额外加 Pro 门——理由：把已到阶段的免费用户的实时立绘锁掉会损伤核心视觉反馈闭环、上销价值低、且需把 is_pro 塞进聊天热路径。
- **新解锁场景的进入**：维持现有维度阈值判定（`scenes/unlock.ts`），未加 Pro 进入门——属 scenes/enter 改动，留作后续。
- 解锁面板已对 secret 呈现 Pro 升级引导。若需严格按 §B5 给表情/场景也加 Pro 门，可另起小改动。

---

## Context

本 spec 是 [`docs/product/immersion-redesign.md`](../product/immersion-redesign.md) **阶段 1** 的落地，直击玩家反馈的核心病根——"很 AI、出戏、不像好 NPC"。

[`spec-024`](./spec-024-in-chat-relationship-feedback.md)（阶段 0）解决了"潦草、没动力"（关系可见 + 每轮反馈），但 **"很 AI" 的根源在支柱一：角色是扁的，且互动没有"追求的目标"**。本 spec 补两件事：

- **支柱一·角色（S-δ）**：给角色补"驱动行为"的结构化维度（want / secret / boundary），并强化 chat prompt，让角色**有自己的议程、会主动推进、会保留、会守住底线**，而不是有求必应的助手。
- **支柱二·解锁（S-ε）**：关系阶段跃迁 → 解锁角色秘密 / 新场景 / 新称呼 / 新立绘表情，给玩家**值得追求的目标**与"我把关系推进了"的实感。

### 现状基线（已确认）
- 角色表 `companions`（`migrations/0001`）：有 `personality / background / appearance / speech_style / relationship_role / initial_dims`，**无** want/secret/boundary。
- `chat/prompt.ts`：平铺人设 + scene/activity/narrative + narration 规则，但**未让角色主动、有议程、会保留、带"对玩家看法"回应**。
- `relationships` 表：存 7 维 + `level_label`（`computeLevel`），**不存 stage**（stage 由 `relationships/stage.ts` 的 `deriveStage` 实时推导）。
- `relationships/engine.ts` 的 `applySignals` 是每轮信号落库处——**天然的"阶段跃迁检测"钩子**。
- **新场景解锁已存在**：`scenes.unlock_condition` 列 + `scenes/unlock.ts` 的 `evaluateUnlock`（维度阈值判定）。S-ε 对"新场景"主要是复用 + 庆祝呈现。
- 立绘：`PortraitBar` 按当轮 emotion 实时切换 + neutral 回退，**当前不设门槛**。

---

## 决策记录（已与 product owner 确认，2026-05-29）

1. **范围**：persona 深化（S-δ）+ 解锁系统（S-ε）**一起做**。
2. **persona 实现**：prompt 强化 **+ 新增核心结构化字段 want / secret / boundary**（**不做**动态 `opinion_of_player`，留待"记忆"功能）。
3. **自创角色**：spec-019 创建/编辑流程**也纳入**新 persona 字段。
4. **解锁目标（全选）**：① 角色秘密/背景片段 ② 新场景 ③ 称呼变化 ④ 新立绘表情。
5. **解锁触发**：以**关系阶段跃迁**（`deriveStage`：first_contact → … → committed）为准。
6. **付费**：解锁**只靠订阅，不消费 credits**（credits 仅用于自创角色生图）。免费用户照常解锁、但查看解锁内容需 Pro（锁定在呈现端）——详见 §B5。

---

## 目标 / 非目标

### 目标
- 角色卡新增 want / secret / boundary 三字段（schema + 类型 + 创建/编辑 UI + 校验）。
- 10 个官方 seed 角色回填这三字段内容。
- chat prompt 强化：注入新字段 + 加入"议程 / 主动 / 保留 / 底线 / 称呼"行为规则。
- 解锁系统：阶段跃迁触发，解锁四类目标，订阅门槛，前端庆祝 + 角色页"已解锁"区。
- 全链路无 credits 介入。

### 非目标
- ❌ 动态 `opinion_of_player` / 长期记忆（另开 spec）。
- ❌ 剧情骨架 / story beats（阶段 2，另开 spec）。
- ❌ credits 计费（解锁靠订阅）。
- ❌ 重做阶段 0 的关系 HUD / 立绘切换 / 每轮反馈（spec-024 已覆盖）。
- ❌ 重写场景解锁判定（复用现有 `scenes/unlock.ts`，仅扩展呈现）。

---

## Part A — 角色深度（S-δ）

### A1. Schema：新增 persona 字段
新 migration（紧接现有最大编号），给 `companions` 加三列，均可空（兼容存量）：
```sql
ALTER TABLE companions ADD COLUMN want      TEXT;  -- 当下渴望/动机
ALTER TABLE companions ADD COLUMN secret    TEXT;  -- 秘密/软肋（高阶段解锁揭露）
ALTER TABLE companions ADD COLUMN boundary  TEXT;  -- 底线/雷区（触碰→guarded/annoyed/疏远）
```
更新 `companions/index.ts`：SELECT 列、行映射、`createCompanion` INSERT、companion 详情/列表的序列化都带上三字段。

### A2. Seed 回填
为 `migrations/0007_v1_content_seed.sql` 的 10 个官方角色补写 want / secret / boundary（英文，见 `vision.md §3`）。
- 实施方式：新 migration 用 `UPDATE companions SET want=?, secret=?, boundary=? WHERE id=?`（不改 0007，避免重跑已应用迁移）。
- 内容要与各角色已有 prose 一致（例：Maya 的 want=被认真对待、secret=上一段感情的伤、boundary=被催促或被当备胎）。

### A3. Prompt 强化（`chat/prompt.ts`）
- **注入新字段**：在 `# Character` 段加入 `What you want right now: {want}`、`Your boundary: {boundary}`。**secret 默认不注入**——仅当该角色对该用户已解锁 secret（见 §B4.1）才注入，措辞为"你可以在合适时机透露：{secret}"。
- **新增行为规则（# Rules，英文）**：
  - 你有自己的目标和情绪，不是有求必应的助手；可以追问、调侃、回避、转移话题、拒绝、表达不耐。
  - 适当主动推进：可以先开口、改变话题、提出一起做某事，而不只是被动应答。
  - 回应时带上 want 的色彩；触碰 boundary 时表现出 guarded/annoyed/疏远（与现有 `chat/hostility.ts` 协同，不冲突）。
  - 保持"未完成感"：不要每句都给出完整答案，留钩子。
- **称呼规则**：按当前 stage 决定对玩家的称呼亲密度（见 §B4.3），作为一行规则注入。
- 注意保留现有 narration/dialogue 格式规则与语言镜像规则不变。

### A4. 创建 / 编辑流程纳入新字段（自创角色）
- 后端：`createCompanion` 的输入类型 + 校验加上 want/secret/boundary（均可选；长度上限与现有字段一致）；编辑端点（spec-019）同步。
- 前端（`CompanionForm` / companion-create / `companion/[id]/edit` 两端）：表单加三个多行输入，附简短说明（want=ta 现在想要什么 / secret=高信任才揭露 / boundary=会让 ta 反感的事）。
- 类型：`apps/app/api/types.ts` 的 companion 相关类型补三字段。

---

## Part B — 解锁系统（S-ε）

### B1. 解锁模型总览
- **触发**：关系 **stage 跃迁**（`deriveStage` 结果较上次变化，且为正向前进）。
- **每个解锁项** = `(unlock_key, 触发 stage, 解锁目标)`。stage 阶梯：`first_contact → familiar → trusted → close_friend →（romantic_tension → dating → committed）`。
- **门槛**：订阅（见 §B5）。**不消费 credits**。

### B2. 数据模型
1. `relationships` 加列 `last_stage TEXT`：记录上次已处理的 stage，用于在 `applySignals` 后检测跃迁。
2. 新表 `relationship_unlocks`：记录每个 (user, companion) 已解锁了什么，供庆祝去重 + 角色页持久展示。
```sql
ALTER TABLE relationships ADD COLUMN last_stage TEXT;

CREATE TABLE relationship_unlocks (
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  unlock_key    TEXT NOT NULL,         -- 如 'secret' | 'expr:warm' | 'scene:<id>' | 'title:familiar'
  unlocked_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id, unlock_key)
);
```

### B3. 解锁判定（接 `relationships/engine.ts` 的 `applySignals`）
- `applySignals` 算出 `next` 维度后：`prevStage = deriveStage(current).stage`、`nextStage = deriveStage(next).stage`。
- 若 `nextStage` 较 `prevStage` 正向前进：根据 `nextStage` 查"该 stage 应解锁的项"，对尚未在 `relationship_unlocks` 的项写入记录，并把**新解锁项**随返回值带出（供 chat 层通过 SSE 推给前端，做庆祝）。
- 持久化 `last_stage = nextStage`。
- 解锁规则表（stage → unlock_keys）建议集中到一个常量模块（如 `relationships/unlocks.ts`），便于调内容。
- **SSE**：在 `chat/messages.ts` 的流里新增一个 `unlocks` 事件（数组，可为空），`use-chat-stream.ts` 加 `onUnlocks` 回调。

### B4. 四类解锁目标实现
1. **角色秘密 / 背景片段**：默认 stage（建议 `trusted` 或 `close_friend`）解锁 `secret`。解锁后：① prompt 注入 secret（§A3）② 角色页"已解锁"区展示该片段。
2. **新场景**：复用 `scenes.unlock_condition` + `scenes/unlock.ts`（已是维度阈值判定）。本 spec 不改判定逻辑，**只**：① 在解锁瞬间（维度过阈）纳入庆祝呈现 ② 角色/场景页明确显示"已解锁/未解锁 + 提示"。（若要改为 stage 触发可后续再议，本期保持现有维度阈值。）
3. **称呼变化**：纯 prompt 层。按 stage 给一个称呼亲密度阶梯（陌生：礼貌/不称呼 → familiar：名字 → close_friend/恋爱阶段：昵称），作为规则注入 §A3。无需存储，跟随 stage 即时生效。
4. **新立绘表情**：把**部分表情**锁在更高 stage，核心表情始终可用以**不破坏阶段 0 的实时立绘体验**：
   - 始终可用：`neutral / warm / guarded`（基础情绪，早期就需要）。
   - 阶段解锁：`playful`（familiar）、`tense`（trusted）、`annoyed` 已由 hostility 路径触发可保持可用——**最终表集合需 §B5 末确认**。
   - 未解锁的情绪 → `PortraitBar` 回退到 neutral（回退已存在），玩家无感报错。
   - **回看入口**：除了聊天中实时切换/回退，角色详情页提供**立绘图鉴**（§B5），让玩家能主动浏览全部已解锁立绘——解决"解锁了却无处查看"的问题。

### B5. 前端 + 订阅门槛
- **庆祝**：收到 `unlocks` 事件 → 轻量庆祝提示（"You've unlocked: Maya's story" / "New expression unlocked"）。
- **角色页"已解锁"区**：列出该角色已解锁的秘密片段 / 场景 / 称呼阶段 / 表情；未解锁项显示锁 + 下一阶段提示（复用 `evaluateUnlock` 的 hint 风格）。
- **立绘图鉴（`CompanionGalleryPanel`，挂在角色详情页"已解锁"区下方）**：把表情解锁从纯文字行升级为**可视化网格**——
  - 网格展示该角色 6 种情绪立绘。已解锁且有图的显示缩略图，点击进入**全屏查看器**（`PortraitViewerModal`），可在已解锁情绪间切换大图。
  - 未解锁的情绪显示**锁定占位 + 所需阶段**（`Reach <stage>`，stage 取自 `expr:<emotion>` 解锁项，与后端门控一致）。
  - 用户自创角色尚未在聊天中生成的情绪显示"聊天中生成"占位。
  - 门控复用 `utils/expression-unlock.ts` 的 `isEmotionUnlocked(emotion, stage)`，stage 取自 `useCompanionUnlocks`；情绪展示常量（label/emoji/比例）抽到 `utils/portrait.ts`，与 `PortraitBar` 共用。
- **订阅门槛（已确认，2026-05-29）**：依"解锁只靠订阅"的决策：
  - 关系推进与阶段跃迁对**所有用户开放**，解锁照常触发并写入 `relationship_unlocks`（§B3 判定门槛不区分用户类型）。
  - **解锁内容的访问（查看秘密、进入新解锁场景、高阶表情显示）为 Pro 权益**：免费用户在解锁点**看到内容但带锁 + 升级引导**（复用现有 billing 升级入口），不消费 credits。
  - 即：免费用户能"解锁"（看到"已解锁 Maya 的故事"的庆祝与条目），但**查看具体内容需 Pro**——锁定层在呈现端，不在判定端。

---

## 验证
1. 类型/lint：`apps/app` typecheck/lint；`packages/api` vitest（新增 `relationships/unlocks` 与 prompt 单测）。
2. **persona**：以官方角色对话，验证角色会主动开口/追问/保留；触碰 boundary（如催促 Maya）→ 转 guarded/annoyed + 立绘相应变化；未解锁前 secret 不出现在回复里。
3. **创建**：自创角色填 want/secret/boundary → 落库 → 对话生效。
4. **解锁**：刷关系到 stage 跃迁 → 收到 `unlocks` 事件 + 庆祝 + 角色页"已解锁"区更新；秘密在解锁后才注入 prompt；重复跃迁不重复庆祝（`relationship_unlocks` 去重）。
   - **立绘图鉴**：角色详情页图鉴网格显示 6 情绪——低 stage 时 `playful`/`tense` 为锁定占位并提示所需阶段、其余显示缩略图；点已解锁缩略图弹出全屏查看器、底部 chip 可切换情绪、可关闭；用户自创角色未生成的情绪显示"聊天中生成"占位；Web 端同样正常。
5. **订阅门槛**：免费 vs Pro 账号在解锁点的差异符合 §B5 最终确认的方案。
6. **回归**：阶段 0 的关系 HUD / 每轮反馈 / 立绘切换不受影响。

## 完成定义
- 角色卡含 want/secret/boundary，官方 10 角色已回填，自创角色可填。
- prompt 让角色有议程/主动/保留/底线/分阶段称呼；secret 仅解锁后注入。
- 阶段跃迁触发四类解锁，订阅门槛按确认方案生效，全程无 credits。
- 前端有庆祝 + 角色页已解锁区；阶段 0 功能回归通过。

## 后续（不在本 spec）
- 动态 `opinion_of_player` / 长期记忆。
- **阶段 2：轻量剧情骨架**（每角色 1 条 3-5 拍，架在 `events` 引擎上）——解锁系统可作为剧情节拍的奖励载体。
