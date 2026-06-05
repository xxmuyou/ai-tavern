# spec-035: 关系进度可见化与晋级手感修正

> **类型：** 后端（关系引擎 + 打分提示）  |  **依赖：** spec-005(relationships), spec-006(chat signal-extract), spec-024(in-chat HUD)  |  **估时：** 1-2 天  |  **状态：** 🟡 in-progress（实现 + 单测完成，待运行端到端验证手感）

---

## 实现记录（2026-06-05）

落地文件：
- `relationships/stage.ts`：①`familiar` 进度从 `(trust-20)/15` 改为 `max(trust/30, min(closeness/40, friendship/30))`——closeness/friendship 现在能推动进度，不再卡 0%；②`trusted` 晋级谓词从 `trust>=35` 改为多路径 `trust>=30 || (closeness>=40 && friendship>=30)`，后者对齐 `computeLevel` 的 "Friend" 等级口径；③`trusted` 进度改综合 `(closeness/60+friendship/50+trust/40)/3`；④`dating` 进度并入 trust（朝 committed 的 trust>=55）；⑤`familiar` next_goal 文案改为"多花时间、变更近"。
- `chat/signal-extract.ts`：打分提示新增——用户认真倾听/记住对方/说到做到/坦诚时给 `trust +1`（此前普通闲聊几乎恒 0）；辱骂/越界负向逻辑不变。
- `relationships/stage.test.ts`：新增 3 组回归（trust=11 进度>0；closeness+friendship 单独可达 trusted；连续 30 轮友好进度单调上升并晋级）。
- `relationships/index.test.ts`：原把 "Friend" 关系（closeness50/friendship40）断言成 `familiar` 的 fixture 按新口径改为 `trusted`。

验证：`@xtbit/api` 510 测试全绿、typecheck 通过。手感（连续友好对话进度条可见上涨 + 能真正晋级）待 dev 端到端跑。

> 可调旋钮（产品平衡）：trusted 的 trust 门槛 30、替代路径 closeness40/friendship30、trust 闲聊 +1 力度——若升级太快/太慢按体感调整。

---

## Context

用户实际试玩时停在 `Familiar` 阶段，聊天顶部进度条长期 0%、关系也升不上去。摸过代码后定位到根因（已核实）：

1. **进度条只挂钩单一维度 `trust`。**
   `Familiar` 阶段的 `stage_progress` 在 [`stage.ts:103`](../../packages/api/src/relationships/stage.ts) 是 `clamp01((trust - 20) / 15)` —— `trust < 20` 时**恒为 0%**。

2. **进入阶段与晋级阶段用了不同维度，互相打架。**
   进入 `Familiar` 靠 `closeness >= 20`（[`stage.ts:96`](../../packages/api/src/relationships/stage.ts)），但晋级到 `trusted` 又要 `trust >= 35`（[`stage.ts:85`](../../packages/api/src/relationships/stage.ts)）。玩家闲聊时 closeness / friendship 在涨，进度条与晋级却都只看 trust。

3. **`trust` 在普通闲聊里几乎不动。**
   trust 增量来自每轮一次的打分 LLM（[`signal-extract.ts`](../../packages/api/src/chat/signal-extract.ts)），其提示词明确要求"保守，大多数普通对话维度变化为 0 或 ±1"，且把 trust 框定为"倾听 / 说到做到 / 出现在该出现的时候"才加分。用户实测 `trust == 11` 卡住。

**合并结果：** 玩家正常聊天 → closeness / friendship 慢慢涨，但进度条（只看 trust）和晋级（也卡 trust）都纹丝不动 → "我在玩，进度却不动"。这是 spec-024 接线之上残留的**手感**缺陷，不是偶发 bug。

**用户决策：显示 + 晋级一起修。**

> 运行时旁证（可选，排除叠加因素）：可查 `llm_logs` 中 `task='signal'` 是否有 error/fallback，确认打分调用未静默失败。配置上 signal 已配（deepseek 主 / openai 备，[`0002_v1_seed.sql:18`](../../packages/api/migrations/0002_v1_seed.sql)），默认链路通。

---

## 目标 / 非目标

### 目标
- 普通正向互动时，聊天 HUD 进度条**可见地**向前走，而不是卡 0%。
- 玩家持续正向互动能**真正晋级**到下一阶段，不被单一 `trust` 卡死。
- `stage_progress` 的语义统一为"距离下一阶段晋级条件还差多少"的**综合度量**，与晋级门槛同源，避免"条满却不晋级"或"晋级了条还在 0%"。

### 非目标
- ❌ 前端结构性改动：HUD（[`ChatRelationshipHud.tsx`](../../apps/app/components/ChatRelationshipHud.tsx)）已显示 `stage_progress` 且每轮 `relationship.refresh()`，改动集中在后端。
- ❌ 改 7 维模型本身或 `computeLevel` 的等级标签（[`level.ts`](../../packages/api/src/relationships/level.ts) 等级标签不动）。
- ❌ 负向阶段（hostile / estranged / strained）的判定与 repair 逻辑（保持不变）。
- ❌ 暴露原始维度数字给玩家。

---

## 现有结构（不要重造）

| 用途 | 已有 | 位置 |
|---|---|---|
| 阶段判定 + 进度 + 目标 | `deriveStage(dims)`、`POSITIVE_RULES` | `packages/api/src/relationships/stage.ts` |
| 维度键 / 范围 / clamp | `ALL_DIMENSIONS`、`clampDimension`(0..100)、`clampSignal`(-5..5) | `packages/api/src/relationships/level.ts` |
| 每轮打分 → 维度增量 | `extractSignals` → `applySignals` | `packages/api/src/chat/signal-extract.ts`、`relationships/engine.ts` |
| 单测 | `stage.test.ts` | `packages/api/src/relationships/stage.ts` 同目录 |

---

## 实现步骤

### 1. 进度条改为"朝下一阶段门槛推进"的综合度量（`stage.ts`）

把各正向阶段 `progress(dims)` 从"单维度差值"改为**该阶段真实成长维度的综合**，并与该阶段的**晋级谓词同源**：进度 = 当前维度组合相对"下一阶段 predicate 所需阈值"的完成度（多条件取均值或加权均值，clamp 到 0..1）。

具体（在保持现有阶段顺序与谓词框架下）：
- `first_contact → familiar`：进度按 `closeness / 20`（保持）。
- `familiar → trusted`：进度从只看 `trust` 改为 **closeness / friendship / trust 朝 `trusted` 门槛的综合**（见第 2 步把门槛改成多维度后，进度对齐这些条件）。
- `trusted → close_friend`：综合 `closeness / friendship / trust` 朝 close_friend 门槛。
- `close_friend → romantic_tension`、`romantic_tension → dating`、`dating → committed`：进度对齐各自下一阶段 predicate 的主导维度组合（romance 为主，trust 为辅）。

**原则：** 每个阶段的 `progress` 与"下一阶段 predicate 的达成度"一一对应——条满 ⇒ 谓词将成立 ⇒ 真能晋级。

### 2. 晋级门槛改为多路径达标（`stage.ts` `POSITIVE_RULES`）

让 `familiar → trusted`、`trusted → close_friend` 等不再被单一 `trust` 卡死：
- `trusted` 谓词由 `trust >= 35` 调整为 **多路径**：`trust >= 30` **或**（`closeness >= 35 && friendship >= 30`）等——即足够的亲近 + 友好也能视作"建立了基础信任"。具体阈值在实现时结合 `computeLevel`（[`level.ts:51-53`](../../packages/api/src/relationships/level.ts)）的等级口径校准，保持二者方向一致。
- 适度下调过严阈值，使"持续正向互动 N 轮"能在合理体感内跨阶段（N 由单测固化，见验证）。

> 注意保持**单调性**：高阶段谓词在表中先于低阶段判断（现有顺序 committed → … → first_contact），调阈值时不要造成阶段回跳或空档。

### 3. 放宽 `trust` 在正向闲聊中的累积（`signal-extract.ts` 提示词）

在 [`SIGNAL_SYSTEM_PROMPT`](../../packages/api/src/chat/signal-extract.ts)（L54-69）的 scoring guidance 中：
- 明确：**持续、稳定、被认真倾听、被记住的正向闲聊**可以给 `trust +1`（当前提示过于保守，普通闲聊几乎只给 0）。
- 保留：对辱骂 / 越界 / 威胁的 hostility / tension / distance 负向逻辑**不变**。
- 不改 JSON schema 与 -3..3 范围，只调 guidance 文字。

### 4. 单测（`stage.test.ts`）

- 新增/更新：给定一串"友好正向"信号序列（如每轮 closeness/friendship/trust 各 +1~+2），断言 `stage_progress` 单调上升，并在合理轮次内从 `familiar` 跨到 `trusted`。
- 边界：纯 closeness 增长（trust=0）也应推动 `familiar` 进度 > 0（核心回归用例，对应用户 `trust==11` 场景）。
- 回归：负向阶段（hostile/strained/estranged）判定与进度公式不受影响。

---

## 验证

1. **单测：** `pnpm --filter @app/api test`，`stage.test.ts` 全绿；新用例覆盖"闲聊式正向累积推进进度 + 晋级"和"trust 偏低但 closeness 高时进度 > 0"。
2. **手测（Web 优先）：** dev 起服，连续友好对话若干轮：
   - HUD 进度条**可见上涨**（不再卡 0%）；
   - 持续正向互动能真正从 `Familiar` 升到 `Trusted`；
   - 冒犯消息仍触发负向反馈、进度不升（回归 spec-024）。
3. **数据同源：** 切到角色详情页，HUD 的 stage 与 `DimensionBoard` 口径一致。
4. `pnpm typecheck` / `pnpm lint` 通过。

---

## 完成定义
- 进度条在普通正向互动后可见变化，且语义 = 距下一阶段达成度。
- 持续正向互动能真正晋级，不被单一 `trust` 卡死。
- 负向阶段逻辑、等级标签、7 维模型不变；无前端结构改动、无新依赖。

---

## 后续（不在本 spec）
- 聊天内邀约换场景：见 [spec-036](./spec-036-in-chat-scene-invitation.md)（其"冒犯性邀约扣分"接回本 spec 修正后的关系引擎）。
