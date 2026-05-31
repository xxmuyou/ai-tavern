# spec-024: 聊天内关系可见化 + 每轮反馈（沉浸感阶段 0）

> **类型：** 前端接线  |  **依赖：** spec-006(chat), spec-005(relationships), spec-012/018(UI)  |  **估时：** 2-3 天  |  **状态：** 🟡 in-progress（实现 + 静态检查完成，待运行端到端验证）

---

## 实现记录（2026-05-29）

落地文件：
- `api/types.ts`：`RelationshipResponse` 补齐后端 `/relationships/:id` 已返回但前端类型遗漏的 `stage / stage_progress / next_goal / recommended_activity`，使其可直接喂 `relationshipGoalFromSummary`。
- `hooks/use-chat-relationship.ts`（新增）：`getRelationship` 取关系摘要 → `relationshipGoalFromSummary` 产出 `goal`，并暴露 `refresh()` 供每轮结束后拉服务端真值；失败保留旧值不拆 UI。
- `components/ChatRelationshipHud.tsx`（新增）：紧凑单/双行条（stage + 进度条 + next_goal 一句话），两端共用。
- `components/SignalFeedback.tsx`（新增）：每轮 `signals` 增量→过滤非 0 维度→正/负向着色 chip（正向 primary、负向 warning），按 `token` 每轮重触发，~2.8s 自动消失；hostility/tension/distance 上升判为负向。
- `app/chat/[companionId].tsx` / `.web.tsx`：接 `useChatRelationship`；`stream.send` 接 `onSignals`（存增量 + 自增 token）；回复落地后 `relationship.refresh()` 刷新 HUD。HUD 放 `PortraitBar` 下方（mobile）/ 左侧面板（web），反馈 chip 浮于会话区顶部。

验证：`apps/app` `tsc --noEmit` 与 `expo lint` 均通过。运行端到端（Web 友善/冒犯消息看反馈 + 进度条变化 + 立绘转向）待人工跑。

---

## Context

本 spec 是 [`docs/product/immersion-redesign.md`](../product/immersion-redesign.md) **阶段 0** 的落地。

阶段 0 原计划三件事：①情绪立绘切换 ②关系可见化 + 每轮反馈 ③场景钩子/心情/打字指示器。**摸过代码后确认 ① 和 ③ 已基本完成**，本 spec 只补真正的缺口 **②**。

**已完成、本 spec 不动：**
- **情绪立绘（S-α）**：`components/PortraitBar.tsx`（mobile）+ `app/chat/[companionId].web.tsx` 内联（web）已按当轮 emotion 切换立绘 + 回退 `art_url`。`hooks/use-chat-stream.ts` 已消费 SSE `emotion` 事件并通过 `onEmotion` 回调驱动。
- **场景钩子 / 心情 / 打字指示器（S-γ）**：`components/SceneDailyCompanion.tsx` 渲染 `companion.opener`（钩子台词）+ `DailyStateSummary`（mood/availability）；`components/StreamingBubble.tsx` 在首 chunk 前显示 "Thinking…" 动画；`utils/narration` 已分离旁白/台词渲染。

**真正的缺口（本 spec 范围）：**
1. **关系进度不在聊天里。** `RelationshipGoalPanel`（stage + 进度条 + next_goal）已存在，但只用在角色详情页（`app/companion/[id].tsx`）和首页 `TodayHub`。**聊天界面只 `getCompanion` 取立绘，不取关系**——玩家在"真空"里聊天，进度要切到别的屏才看得到。
2. **每轮没有反馈。** SSE 每轮已推送 `signals` 增量事件，`use-chat-stream.ts` 也留好了 `onSignals` 回调，但**两端聊天界面都没接**——发完消息没有"Trust +2 / 她对你冷淡了"的即时反馈，互动"落不了地"。

这正是"UI 潦草、没动力"残留的部分。（"很 AI / 出戏"的核心病根在支柱一 persona + 剧情，属阶段 1/2，不在本 spec。）

---

## 目标 / 非目标

### 目标
- 聊天界面内常驻一个**紧凑关系 HUD**：当前 stage + 进度条（`stage_progress`）+ next_goal 一句话。两端（`.tsx` / `.web.tsx`）。
- 每轮 companion 回复后，根据该轮 `signals` 增量给出**即时反馈**：高亮变化的维度（如 `Trust +2`、`Distance +1`），用短暂的 chip / toast 呈现；负向变化用对应措辞与颜色。
- 每轮结束后**刷新 HUD**（重新取 relationship 或用增量乐观更新），让进度条当场动一下——形成"我的话起作用了"的反馈闭环。

### 非目标
- ❌ 后端改动：`signals` / `emotion` SSE 事件、`/relationships/:id` 端点、关系引擎均已就绪，本 spec 纯前端接线。
- ❌ persona 深化 / prompt 强化（支柱一，阶段 1）。
- ❌ 剧情骨架 / story beats（支柱二，阶段 2）。
- ❌ 解锁系统、credits（解锁只靠订阅，已定；不在阶段 0）。
- ❌ 重做立绘 / 场景钩子 / 打字指示器（已完成）。
- ❌ 暴露全部 7 维原始数字给玩家（HUD 只显示 stage + 进度 + 目标；详情留在角色页的 `DimensionBoard`）。

---

## 现有可复用资产（不要重造）

| 用途 | 已有 | 位置 |
|---|---|---|
| 取关系摘要 | `getRelationship(id)` / `useRelationship(id)` | `api/companion-client.ts:398`、`hooks/use-companions.ts:16` |
| 关系摘要类型 | `RelationshipResponse` / `RelationshipSummary`（含 stage / stage_progress / next_goal / recommended_activity / dimensions） | `api/types.ts` |
| 阶段+进度+目标渲染 | `RelationshipGoalPanel`（含进度条），`relationshipGoalFromSummary` | `components/RelationshipGoalPanel.tsx`、`utils/relationship.ts` |
| 每轮增量回调 | `onSignals(signals: Partial<RelationshipDimensions>)` | `hooks/use-chat-stream.ts` |
| 维度键 | `RelationshipDimensionKey` / `RelationshipDimensions` | `api/types.ts` |

---

## 实现步骤

### 1. 聊天界面取关系
两个聊天屏（`app/chat/[companionId].tsx` 与 `.web.tsx`）在已有 `getCompanion` 之外，用 `useRelationship(companionId)`（或直接 `getRelationship`）拿到 `RelationshipSummary`，存入 state，供 HUD 与每轮刷新用。

### 2. 紧凑关系 HUD 组件 — 新增 `components/ChatRelationshipHud.tsx`
- 输入：`stage`、`stage_progress`、`next_goal`（可由 `relationshipGoalFromSummary` 产出的 `RelationshipGoal` 直接喂）。
- 形态：单行/双行紧凑条，放在 `PortraitBar` 下方或叠在其底部——比 `RelationshipGoalPanel`（整块卡片）更轻，适配聊天顶部。可内部复用同款进度条样式。
- 两端共用同一组件（nativewind className）。

### 3. 每轮反馈组件 — 新增 `components/SignalFeedback.tsx`（或内联）
- 在两个聊天屏的 `stream.send(..., { onSignals })` 接上回调。
- `onSignals` 收到增量后：过滤出非 0 的维度，按"正向/负向 + 维度名"生成 1-3 条简短反馈（例：`Trust +2`、`She pulled back · Distance +1`），以短暂出现（~2-3s 自动消失）的 chip / toast 呈现。负向用 warning 色，正向用 primary 色。
- 文案面向英文玩家（见 `vision.md §3`）。维度 → 文案映射建议集中到一个 map，便于调措辞。

### 4. 每轮结束刷新 HUD
- `onDone` 或 `onSignals` 后：要么对 `stage_progress` 做乐观增量、要么重新 `getRelationship` 刷新 HUD，让进度条当场变化。建议 `onSignals` 先乐观更新维度→重算 goal，`onDone` 再以服务端真值校正（避免漂移）。

### 5. 动效（可选 polish）
- 立绘 emotion 切换加淡入淡出（`PortraitBar` / web 内联）。
- 进度条变化加过渡动画。
- 列为"有余力再做"，不阻塞核心反馈闭环。

---

## 验证
1. 类型/lint：`apps/app` 跑 typecheck / lint。
2. Web（产品优先）：以普通账号登录 → 进角色聊天：
   - 顶部看到 stage + 进度条 + 目标；
   - 发一条友善消息 → 出现 `Trust +N` 之类反馈，进度条动一下；
   - 发一条冒犯消息 → 出现负向反馈（distance/tension +N、措辞冷淡），立绘转 guarded/annoyed（立绘已有，回归验证）；
   - 切到角色详情页，HUD 的 stage 与 `DimensionBoard` 一致（数据同源）。
3. Mobile：同样回归三屏在 `TopBar + PortraitBar + HUD` 下渲染正常。
4. 后端无改动；现有 `packages/api` 单测仍应通过。

---

## 完成定义
- 两端聊天界面常驻关系 HUD，数据与角色详情页同源一致。
- 每轮回复后有即时、会自动消失的维度变化反馈，正/负向区分清晰。
- 进度条在互动后可见地变化。
- 无后端改动，无新依赖。

---

## 后续（不在本 spec）
- 阶段 1：persona 字段扩展（want/secret/boundary/opinion）+ chat prompt Rules 强化 + 解锁系统 → 另开 spec。
- 阶段 2：轻量剧情骨架（每角色 1 条 3-5 拍，架在 `events` 引擎上）→ 另开 spec。
