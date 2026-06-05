# spec-036: 聊天内邀约换场景（Invite & Switch Scene from Chat）

> **类型：** 后端 + 前端 + LLM  |  **依赖：** spec-006(chat), spec-007(scenes), spec-005(relationships), spec-035(关系引擎修正)  |  **估时：** 3-5 天  |  **状态：** 🟡 in-progress（全栈实现 + 后端单测 + 两端 typecheck/lint 完成，待运行端到端验证）

---

## 实现记录（2026-06-05）

落地文件：
- `scenes/invite.ts`（新）：`loadInviteTargets`（该角色出现 + `evaluateUnlock` 通过 + 排除当前场景）、`resolveInviteTarget`（校验单个目标，messages 用）、`handleInviteTargetsRequest`（`GET /companions/:id/invite-targets`，含 companion 可见性校验）。
- `companions/index.ts`：在 idMatch 前挂 `handleInviteTargetsRequest`。
- `chat/invite-resolve.ts`（新）：`resolveInvite` 分离 JSON 判定（仿 signal-extract，复用 `signal` task），失败一律回退 `accepted:false`。
- `chat/prompt.ts`：新增 `InviteForPrompt` 与 `# An invitation just now` 指令段（角色可拒绝/婉拒/反感不合适邀约）。
- `chat/messages.ts`：`PostBody` 加 `invite_scene_id`；activity 锁定时抑制邀约；解析+校验目标 → 注入 prompt → runChat 末尾跑 `resolveInvite` 并写 SSE `invite_result`（accepted 才带 scene_id/scene_art_url）。越界邀约的扣分由本轮既有 `extractSignals` 链路自然产生。
- 前端：`api/types.ts`（`InviteTarget`/`InviteTargetsResponse`/`ChatInviteResult`/`ChatMessageInput.invite_scene_id`）、`companion-client.ts`（`getInviteTargets`）、`hooks/use-chat-stream.ts`（`inviteSceneId` 入参 + `onInviteResult` + 解析 `invite_result`）。
- `components/InvitePopup.tsx`（新，两端共用）：目的地选择浮窗。
- `app/chat/[companionId].tsx` / `.web.tsx`：`sceneId`/`sceneArt` 提升为 state；组合器旁"邀请前往"按钮 → 浮窗 → 选中挂"待发邀约"小条（用户自行打字，保证按其语言回复）→ send 带 `invite_scene_id`；`onInviteResult` 接受则切 `sceneId`+背景并提示，拒绝仅提示不切。web 在会话区顶部加场景横幅（预设图 + 地名）作为可见的换场景呈现。

验证：`@xtbit/api` 510 测试全绿（含 6 个新 invite 用例：目的地过滤 / 锁定场景排除 / resolveInviteTarget 各分支）；两端 `tsc --noEmit` 通过、`expo lint` 仅既有无关 warning。端到端（同意切场景 / 拒绝不切 / 越界扣分 / 锁定亲密场景不出现在列表）待 dev 人工跑。

---

## Context

用户试玩时发现：聊天里和角色"约好去酒馆"之后**无处可去**——那只是 LLM 生成的对话文字，**没有任何机制**把对话里的约定变成真正的换场景。

现状（已核实）：场景（scene）和聊天（chat）是两套互不连通的流程。换场景只能走"浏览—进入"：Scenes tab → [`scene/[id].tsx`](../../apps/app/app/scene/%5Bid%5D.tsx) 调 `POST /scenes/:id/enter` → 列"在场角色" → 点角色才进 `/chat/:id?sceneId=...&sceneArt=...`。聊天界面内**没有任何换场景入口**，对话也驱动不了场景。玩家自然懵。

**已核实的关键技术事实（决定方案轻重）：**
- 聊天 POST 的 `scene_id` 是**每轮从请求体现读、scene 现查并注入 prompt** 的（[`messages.ts:67`](../../packages/api/src/chat/messages.ts)、L113、L159）。**客户端改发新的 `scene_id`，大模型的 "Current Scene" 与背景就自动跟着变**——后端 prompt 主体几乎不用动。
- 前端 `sceneId` / `sceneArt` 现在是**路由参数**（整页生命周期不可变，[`chat/[companionId].tsx:84-88`](../../apps/app/app/chat/%5BcompanionId%5D.tsx)）。要支持中途换场景，需提升为 **state**（用路由值做初值）。
- 场景已有 `default_companions`（JSON 角色 id 数组）与 `unlock_condition`，且已有 `evaluateUnlock`（[`scenes/unlock.ts`](../../packages/api/src/scenes/unlock.ts)）与按角色筛场景的 `loadCompanionSceneUnlocks`（[`relationships/index.ts:73`](../../packages/api/src/relationships/index.ts)）可复用。
- 每轮回复后已有一次"打分"分离调用 [`signal-extract.ts`](../../packages/api/src/chat/signal-extract.ts) 写关系维度 → **冒犯性邀约的扣分可直接借这条链路**，无需另造惩罚系统。
- 背景由 `PortraitBar` 的 `sceneArt` 渲染（[`PortraitBar.tsx:27`](../../apps/app/components/PortraitBar.tsx)）；换 `sceneArt` 即换背景。
- SSE 已有 `signals` / `emotion` / `unlocks` / `done` 事件模式（[`messages.ts:338-340`](../../packages/api/src/chat/messages.ts)），新事件照此添加。

**用户期望的体验：** 聊天界面有"邀请前往"选项 → 浮窗"去 xxx" → 大模型能感知并判断 → **同意才**切背景到预设图 + 切 scene；**拒绝则不切**；且**不合适的邀约（关系不熟却约去酒店之类）要扣关系分**。

**用户确认的设计选择：**
- 目的地来源：**该角色出现的已解锁场景**（`default_companions` 含该角色 **且** `unlock_condition` 通过）。
- 拒绝处理：**拒绝则不切**；不合适场景的邀约还要**扣关系分**（关系不熟、对方不是随便的人，却邀请去酒店之类）。

---

## 目标 / 非目标

### 目标
- 聊天界面内新增"邀请前往"入口 → 浮窗列出**该角色出现的已解锁场景**（排除当前所在场景）。
- 选定并确认后，本轮把邀约作为上下文喂给大模型；大模型**在角色身份下自行决定**接受或拒绝。
- **接受** → 切换聊天背景到目标场景预设图 + 切 `scene_id`，后续对话发生"在新场景里"。
- **拒绝** → 不切场景，仅展示角色（婉拒的）回复。
- **不合适的邀约**（如关系不到位却约去亲密场景）→ 借现有每轮打分链路自然**扣关系分**（distance / tension 上升）。
- 两端（`.tsx` / `.web.tsx`），Web 优先验收。

### 非目标
- ❌ 重做 Scenes tab 的浏览—进入流程（保留）。
- ❌ 进入目标场景时跑完整 `enter`（openers / 触发事件 / story beat 全套）——本 spec 走**轻量切换**：只更新活动 `scene_id` + 背景，不强插开场白/事件（后续可加）。
- ❌ 多人在场/群聊。
- ❌ 新增"地点"数据模型——复用现有 `scenes` 表与 `default_companions` / `unlock_condition`。
- ❌ 把邀约做成 `activities`/`events`（那是另一套日常/事件系统；本 spec 是轻量场景切换，不混用）。

---

## 现有可复用资产（不要重造）

| 用途 | 已有 | 位置 |
|---|---|---|
| 场景解锁判定 | `evaluateUnlock(env, userId, unlock_condition)` | `packages/api/src/scenes/unlock.ts` |
| 按角色筛已解锁场景的模式 | `loadCompanionSceneUnlocks` | `packages/api/src/relationships/index.ts:73` |
| 聊天时取场景 | `loadSceneForChat` | `packages/api/src/chat/loaders.ts` |
| 分离 JSON 判定调用模式 | `extractSignals`（JSON schema + 失败回退） | `packages/api/src/chat/signal-extract.ts` |
| SSE 事件写法 | `sse.writeEvent("signals"/"emotion"/...)` | `packages/api/src/chat/messages.ts:338` |
| 流式发送 + 回调 | `useChatStream` 的 `onSignals/onEmotion/onUnlocks/onDone` | `apps/app/hooks/use-chat-stream.ts` |
| 背景渲染 | `PortraitBar` 的 `sceneArt` | `apps/app/components/PortraitBar.tsx:27` |
| 浮窗 | 现有 `Modal` 用法（web 已用） | `apps/app/app/chat/[companionId].tsx` 的 Modal 段 |

---

## 实现步骤

### 1. 后端：可邀约目的地端点
- 新增 `GET /companions/:id/invite-targets`（可选 query `from_scene_id` 用于排除当前所在场景）。
- 逻辑：查 `scenes` 中 `is_active = 1`、`default_companions` 含该角色、且 `evaluateUnlock(user, unlock_condition)` 通过的场景；排除 `from_scene_id`。
- 返回：`{ targets: Array<{ id, name, mood, art_url }> }`。
- 复用 `evaluateUnlock` 与 scenes 查询模式；放在 `packages/api/src/scenes/` 下（新函数或新文件 `invite.ts`），路由挂到现有 companions 或 scenes 分派。
- **门禁天然生效**：亲密场景（如酒店）若设了高关系门槛的 `unlock_condition`，关系不到位时根本不出现在列表里。

### 2. 后端：聊天流接收邀约 + 注入 prompt
- 聊天 POST body 新增可选 `invite_scene_id`（[`messages.ts` `PostBody`](../../packages/api/src/chat/messages.ts) L44）。
- 校验：`invite_scene_id` 必须是该角色的合法可邀约目标（复用第 1 步逻辑）；非法则忽略（不报错、当普通消息）。
- 在 `buildChatPrompt` / `prompt.ts` 注入一段（放在 `# Current Scene` 之后）：
  > The user is inviting you to go to **{target.name}** ({target.mood}). Decide in character whether you would go, given how well you know them, who you are, and your boundaries. You may decline if it feels too forward or premature. Respond naturally — accept or refuse in your own voice.
- **本轮仍用当前 `scene_id`** 生成回复（人还没到目的地），邀约只是附加指令。

### 3. 后端：接受/拒绝判定（新增 `chat/invite-resolve.ts`，仿 signal-extract）
- 回复结束后，新增一次 JSON-schema 小调用 `resolveInvite`：输入 = 用户邀约目标 + 角色回复 + 关系 narrative；输出 `{ accepted: boolean, reason: string }`。
- 用独立 `task`（如复用 `signal` 任务或新增轻量任务；实现时确认 `llm_config` 路由，沿用 router）。失败 → **回退 `accepted: false`**（绝不误切）。
- 通过 SSE 新事件 `invite_result` 推前端：`{ accepted, scene_id, scene_art_url, reason }`（参照现有 `sse.writeEvent` 模式）。
- **扣分天然发生**：本轮照常跑 `extractSignals` + `applySignals`。冒犯性/越界邀约会让角色回复带敌意/疏远，打分自然产出负向维度。可在 `signal-extract.ts` guidance 补一句："对明显越界、与关系阶段不符的邀约（如关系尚浅却邀约私密场所），适度提高 distance / tension。"

### 4. 前端：场景提升为 state + 邀约入口 + 浮窗（两端）
- `chat/[companionId].tsx` 与 `.web.tsx`：把 `sceneId` / `sceneArt` 从路由参数**提升为 state**（路由值作初值）。
- 新增"邀请前往"入口（组合器附近的小按钮/图标）：点击 → `getInviteTargets(companionId, currentSceneId)` → 浮窗（Modal）列目的地（名称 + mood + 缩略图）。
- 选中并确认 → 本轮 `stream.send(text, { ..., inviteSceneId })`；`text` 可为用户自填或默认一句邀约文案。
- `use-chat-stream.ts`：新增入参 `inviteSceneId` 与回调 `onInviteResult`；解析 SSE `invite_result` 事件。
- 收到 `accepted === true` → 更新 state：`sceneId = scene_id`、`sceneArt = scene_art_url`（PortraitBar 背景随之切换），后续轮次自动带新 `scene_id`。
- `accepted === false` → 不切，仅展示角色回复；可附一行轻提示（复用 `SignalFeedback` 同款 chip："她没有答应"），不打断会话。

### 5. 类型与 API 契约
- `apps/app/api/types.ts`：新增 invite-targets 响应类型、`invite_result` SSE 事件类型、`inviteSceneId` 入参。
- `apps/app/api/companion-client.ts`：新增 `getInviteTargets`。
- 更新 [`docs/architecture/api.md`](../architecture/api.md)：新增 invite-targets 端点、chat POST 的 `invite_scene_id` 字段、`invite_result` SSE 事件。

---

## 验证

1. **后端单测：**
   - invite-targets 过滤：角色不在该场景 `default_companions` / 场景未解锁 → 应排除；当前所在场景 → 排除。
   - `resolveInvite`：解析正常 JSON；调用失败 → 回退 `accepted:false`（不误切）。
   - `pnpm --filter @app/api test` 全绿。
2. **手测（Web 优先）：** 进角色聊天 → 点"邀请前往"：
   - 浮窗只列该角色出现的已解锁场景；关系不到位的亲密场景**不出现**；
   - 角色**同意** → 背景与 `scene_id` 切换，后续消息带新场景上下文；
   - 角色**拒绝** → 不切，展示婉拒回复 + 轻提示；
   - 关系尚浅却邀约私密场所 → 角色拒绝 **且**该轮关系维度向负向变化（distance/tension 上升）。
3. **Mobile：** 同样三屏渲染与切换正常。
4. `pnpm typecheck` / `pnpm lint` 两端通过。

---

## 完成定义
- 聊天内可发起邀约、浮窗目的地正确过滤、大模型在角色身份下决定接受/拒绝。
- 接受 → 背景 + scene_id 切换；拒绝 → 不切；越界邀约 → 经现有打分链路扣关系分。
- 复用 `evaluateUnlock` / `loadSceneForChat` / SSE 模式 / signal-extract 模式 / PortraitBar 背景；无新数据模型、无新依赖。

---

## 后续（不在本 spec）
- 切换到目标场景时可选触发 opener / 场景事件 / story beat（复用 scenes `enter` 的部分逻辑）。
- 邀约目的地的精排（按 mood / 时段 / 关系阶段推荐）。
