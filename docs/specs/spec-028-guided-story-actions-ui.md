# spec-028: 剧情引导与行动按钮重构（Web 优先）

> **类型：** 前端体验/UI 重构 | **依赖：** spec-024/025/026 | **估时：** 2-3 天 | **状态：** 🟡 in-progress

---

## Context

产品定位是 AI 聊天向养成类游戏，但当前体验仍有两个断点：

- 关系、剧情拍、日常状态都已经存在，但用户进入 Today / Scene / Chat 后，仍不容易判断“下一步该做什么”。
- Activity 按钮直接平铺，推荐项、剧情项、普通项层级接近；场景页还同时存在 “Companions present” 和 “Today here” 两套入口，造成重复和混乱。

本 spec 接在已完成的 `spec-026` 后面，不重做 story beat 框架，而是把现有 `active_story_beat`、`next_goal`、`suggested_activity`、`recommended_activity`、`availability` 组织成明确的下一步行动。自建角色剧情线、剧情包、AI 辅助和手动完成动作由后续 `spec-029` 提供；本 spec 的 UI helper 只消费当前可见的 active beat。

## 目标 / 非目标

### 目标

- Web 优先重构 Today、Scene、Chat 三处行动入口。
- 建立统一的前端 `Guided Next Action` 视图模型，让剧情拍优先于关系目标，关系目标优先于日常推荐。
- 每个角色卡只展示一个主 CTA，最多两个次级 CTA；其余 activity 收进 `More actions`，不再同权重平铺。
- Scene Web 页面合并重复的 companion 区域，以 companion-driven action card 展示剧情目标、今日状态和下一步。
- Chat Web 的 activity banner 强化当前活动目标和完成/取消按钮层级，但不加入快捷话术 chips。

### 非目标

- ❌ 后端 API 改动或新增数据库字段。
- ❌ 重写 story beat 推进规则、关系阶段规则或 activity 完成规则。
- ❌ 生成快捷回复 / 建议下一句。
- ❌ Mobile 完整视觉重构；本期只做不破坏一致性的轻量同步。
- ❌ 改动 image generation、unlock、billing 或 credits 逻辑。

## 引导优先级

统一规则：

1. **剧情拍优先。** 若 `active_story_beat.status === "active"`，主 CTA 为 `Continue story`，副文案使用 beat `objective`。
2. **等待剧情门槛时退回关系目标。** 若 `status === "waiting_stage"`，主文案提示需要达到目标 stage，主 CTA 使用关系/推荐 activity。
3. **无剧情拍时使用关系目标。** 使用 `next_goal.label` 与 `recommended_activity` / `suggested_activity`。
4. **关系目标缺失时使用日常状态。** 使用 `activity_hint` 和可用 activity。
5. **不可用状态降级。** `availability === "away"` 时不展示启动 activity 的主 CTA，只展示 `View profile` / `Browse scenes` 等非活动入口。

## 实现步骤

### 1. 新增 Guided Action helper

- 新增前端 helper（建议 `apps/app/utils/guided-action.ts`）。
- 输入：story beat、relationship goal、recommended activity、daily state/activity hint、availability。
- 输出：主标题、副文案、主 activity、状态标签、是否可启动活动、fallback 操作。
- 文案面向英文玩家，保持短句和行动导向。

### 2. 重构 ActivityButtons

- 由“平铺多个同权重按钮”改为：
  - 主 CTA：推荐 activity 或剧情继续行动。
  - 次级 CTA：最多 1-2 个。
  - `More actions` 展开区：其余 activity。
- 保留现有 `start activity -> chat` 跳转行为。
- `availability === away` 时只显示不可用说明，不允许启动 activity。

### 3. Web Scene 页面重排

- 合并 “In the room” 与 “Today, with them” 的重复展示。
- 每个 companion 使用统一 action card：
  - 角色头像 / 名称。
  - 剧情拍状态：active / waiting stage / none。
  - 今日状态摘要。
  - 一句明确下一步文案。
  - 主 CTA + 次级 CTA。
- Scene hero 只承载场景氛围和标签，不再承担“下一步怎么做”的说明。

### 4. Today 与 Chat 同步

- Today card 使用同一套 guided action 文案和 ActivityButtons 层级。
- Chat Web 的 ActivityContextBanner 强化当前活动：
  - 当前活动标题 + scene。
  - activity_hint / daily state。
  - `Complete activity` 为主按钮，`Cancel` 为弱按钮。
- 不加入建议回复 chips，保持自由输入为核心。

### 5. Mobile 轻量同步

- Mobile Scene/Today 复用 ActivityButtons 的新层级，避免按钮继续平铺。
- 不做移动端页面结构大改。

## 验证

1. `pnpm --filter @xtbit/app typecheck`
2. `pnpm --filter @xtbit/app lint`
3. Web 手测：
   - 有 active story beat 的 Scene card 显示剧情目标和 `Continue story`。
   - waiting stage 显示目标 stage，并推荐推进关系的 activity。
   - 无 story beat 时回退到 relationship goal / daily activity。
   - away 状态不显示可启动 activity。
   - Today、Scene、Chat 三处 CTA 不互相矛盾。
4. 回归：
   - 启动 activity 后仍进入 chat，并携带 `activityId` / `sceneId` / `sceneArt`。
   - Chat relationship HUD、unlock celebration、moment image capture 不受影响。

## 回滚

- Helper 和 UI 组件均为前端本地改动；若出现问题，可恢复旧 `ActivityButtons` 与 Scene Web 的双区域布局。
- API 新字段没有新增，旧客户端兼容性不受影响。
