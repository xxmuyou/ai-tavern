# spec-031: Companion 抠图与瞬间图合成（精简表情立绘 + 干净底图 + 聊天时 matting）

> **类型：** 后端 + 前端 + image-gen 接线  |  **依赖：** spec-006(chat), spec-020(emotion-art), spec-022(RunningHub), spec-027(moment images)  |  **估时：** 4-6 天  |  **状态：** 📝 draft

---

## Context

生图模块 `packages/api/src/image-gen/` 独立于 chat/LLM，目前有 4 条工作流：
WF1 基础立绘（spec-022, txt2img）、**WF2 六表情立绘**（spec-020, img2img）、
WF_Moment 瞬间图（spec-027, 场景图）、WF_Outfit 换装（spec-030, draft，仅在 codex worktree）。

矛盾点在 **WF2**：每角色用 img2img 生 6 张表情立绘（neutral/warm/playful/guarded/tense/annoyed），
成本高、一致性漂移；而聊天 UI 大多 fallback 到 neutral（[portrait.ts:60-67](../../apps/app/utils/portrait.ts#L60-L67)），
只有 playful/tense 走解锁——产出与成本严重不匹配。

调研 candy.ai / spicychat 的结论：**它们不逐条消息切换整张表情立绘**。情绪存在感来自
① 一张始终一致的主形象 ② 情绪靠文字语气 + 语音（便宜即时） ③ 按需生成的"瞬间/场景图"（高光 + 变现）。

同时 spec-027 当初明确写了"不做抠图"，spec-020 §（透明背景）虽提过透明，但前端从未用起来：
RunningHub 工作流内部已能产出去背景图，可 app 端把它当普通图塞进 PortraitBar，没利用透明通道。

**本 spec 修订前序决策：**
- 修订 spec-020：**退役 WF2 表情立绘生成**（停写保数据），情绪改为只驱动 UI。
- 修订 spec-027 的"不做抠图"非目标：**瞬间图改为用抠好的透明角色作合成/参考源**，提升跨场景角色一致性。
- spec-030（WF_Outfit）**后端配置保留**（runninghub workflow / image_workflows 中的 `wf_outfit` 不动），**前端本轮不实现**。

**关键技术判断（抠图难度）：** 现代 matting（BiRefNet / RMBG-2.0 / BEN2）按"显著主体"分割，不依赖纯色背景；
但复杂/鲜艳背景会在**发丝、低对比边缘**留瑕疵（写实风尤甚）。故主形象刻意用**干净/影棚背景**，
既适合直接展示，又保证聊天时抠图抠得干净。

---

## 目标 / 非目标

### 目标
- **主形象走干净底图**：WF1 输出"soft studio / 干净渐变 / bokeh 背景、主体居中"的展示图，直接展示、不抠图。
- **新增可配置的抠图 workflow 接口**：`wf_cutout` + 新 `cutout` mode，聊天时按需对主形象做 AI matting（RunningHub），结果缓存。
- **瞬间图消费抠图角色**：WF_Moment 用透明角色作 img2img/参考源合成进场景，角色跨场景一致。
- **情绪只驱动 UI**：复用每轮 `emotion` 信号 → tint / emoji / 氛围 / 轻动效，不再逐条重生成立绘。
- **退役 WF2**：路由/消费/admin/config/前端消费全部下线；历史数据停写保留。
- 复用现有 `image_generation_jobs`、provider 抽象、RunningHub workflow 配置与 mock provider。

### 非目标
- ❌ 不做图生视频 / 动画（本轮静态图为主，留架构余地）。
- ❌ 不做 Live2D / 可动模型。
- ❌ 不做自动随剧情出图（瞬间图仍是用户手动触发）。
- ❌ 不删除历史 `art_emotions` / `companion_art_jobs` 数据。
- ❌ 不在主形象 PortraitBar 上做透明合成（抠图只发生在后端瞬间图管线）。
- ❌ 本轮不做 WF_Outfit 前端（spec-030）；但**其后端配置保留不动**。

---

## 产品体验

- **日常聊天**：PortraitBar 展示单张干净底图主形象；每轮 SSE `emotion` 事件即时改变 tint 叠色 / 情绪 emoji /
  氛围色 / 轻微呼吸动效——形象"有情绪"但不换图、不触发生成。
- **捕拍瞬间**（沿用 spec-027 入口）：最新 companion 回复旁小相机按钮 → 生成场景瞬间图。
  与 spec-027 的差异：后台先（懒）抠出一致的透明角色，再合成/参考进场景，角色更像"同一个人"。
- **画廊**：角色页画廊从"表情立绘集"改为"主形象 + 已捕捉的瞬间图集"。

---

## 目标架构（工作流全景）

| key | 作用 | mode | 输入 → 输出 | 状态 |
|---|---|---|---|---|
| `wf1` | 主形象（**干净/影棚背景**） | `create` | prompt(+可选上传) → 干净背景展示图 | 改 prompt 约束 |
| `wf_cutout` | **抠图（AI matting）** | **新增 `cutout`** | base art(`source_art_url`) → 透明 PNG 角色 | **新增** |
| `wf_moment` | 瞬间/场景图 | `create`/`variation` | 透明角色作参考/合成 + 场景 prompt → 场景图 | 改：吃 cutout |
| ~~`wf2`~~ | ~~六表情立绘~~ | — | — | **退役（停写保数据）** |
| `wf_outfit` | 换装 | `variation` | — | **后端配置保留，前端暂不实现** |

数据流：
```
companions.art_url (wf1, 干净背景)
   └─(首次按需→缓存 art_cutout_key)→ wf_cutout (matting) → 透明角色
                                                 └─→ wf_moment img2img/参考源 → 场景瞬间图
```

---

## API / Data Model

### 新增列（migration）
```sql
ALTER TABLE companions ADD COLUMN art_cutout_key TEXT;        -- 缓存的透明角色 R2 key（matting 产物）
-- 标记 WF2 退役：art_emotions / companion_art_jobs 保留不删，停止写入（迁移内注释说明）
```

### 复用 `image_generation_jobs`（抠图作业）
- `task = 'companion_cutout'`
- `mode = 'cutout'`
- `workflow_key = 'wf_cutout'`
- `output_prefix = 'companion-cutout'`（R2 `companions/.../cutout/{uuid}.png`，**保 alpha**）

### 端点
- 抠图**无独立公开端点**：由 WF_Moment 生成前内部触发（`art_cutout_key` 为空时懒生成）。
  （如后续需要前端直接调，再补 `POST /companions/{id}/cutout/generate`，本轮不开。）
- 退役端点：`/companions/{id}/emotion-art/*`（[emotion-art-routes.ts](../../packages/api/src/image-gen/emotion-art-routes.ts)）
  返回明确下线状态码（如 410 Gone / `feature_retired`）。
- 沿用 spec-027：`POST /chat/messages/{id}/moment-image/generate`、`GET /moment-images/jobs/{id}`，行为不变，仅内部源改变。

---

## Workflow / Provider

### 扩展 provider 抽象（核心接口）
- [types.ts:38](../../packages/api/src/image-gen/types.ts#L38)：`ImageGenMode` 增 `"cutout"` → `"create" | "variation" | "cutout"`。
  复用现有 `ImageGenRequest.source_art_url` 作抠图输入；`prompt`/`emotion` 对 cutout 可空。
- [index.ts:68-89](../../packages/api/src/image-gen/index.ts#L68-L89) `getImageGenProvider`：为 `wf_cutout` 增一支
  （`cfg.wfCutoutProvider`，空回落 default → mock），与现有 `wf_moment` 分流写法一致。
- `packages/api/src/settings/store.ts` `resolveImageGenConfig`：新增 `wfCutoutProvider`（仿 `wfMomentProvider`），
  并接入 env 注入白名单（worker secret 须进 generate-env-files / upload-worker-secrets 白名单，否则不生效）。

### RunningHub matting 路径
- `runninghub-provider.ts`：新增 `generateCutout()`——复用 `uploadSourceImage()` 把 base art 推到
  `wf_cutout.loadImageNodeId`，提交 matting workflow，返回 `PendingImageGenResponse`，走现有
  webhook/poll 完成链路（[runninghub-results.ts](../../packages/api/src/image-gen/runninghub-results.ts)）。
- mock-provider：`cutout` 返回带透明像素的 PNG。
- openai-provider：无原生 matting → `cutout` 报 `provider_not_supported`（RunningHub-only）。
- **输出存 PNG 保 alpha**，不转 webp 丢透明（或确认 webp 编码保留 alpha）。

### 抠图作业（"聊天时抠图"落地）
- 新增 `packages/api/src/image-gen/cutout.ts`（对照 [moment-image.ts](../../packages/api/src/image-gen/moment-image.ts)）：
  `createCutoutJob()` / `processCutoutJob()`；完成后写 `companions.art_cutout_key`。
- dispatcher（[queue-dispatcher.ts](../../packages/api/src/queue-dispatcher.ts)）识别 `companion_cutout` 分支。
- **缓存与失效**：同一 base art 只抠一次；`art_url` 重生成/替换时清空 `art_cutout_key` 重抠。

### WF_Moment 改造
- [moment-image.ts](../../packages/api/src/image-gen/moment-image.ts) `processMomentImageJob`：源从
  `loadCompanionArtUrl`（带背景 base art）改为**优先用 `art_cutout_key`（透明角色）**；为空则先触发抠图。
- 合成方式（RunningHub workflow 图内，**二选一见待定**）：(a) alpha 合成到生成场景 + 协调重打光；
  (b) 透明角色作 IP-Adapter/参考引导场景重绘。
- `buildMomentPrompt` 已接入 scene/appearance/emotion/stage/上条用户文本，本轮重点提升构图与一致性稳定度。

### 配置
- `config/runninghub-workflows.{dev,prod}.json`：移除 `wf2`；**保留 `wf_outfit` 不动**；新增 `wf_cutout`（mode=cutout，声明 `loadImageNodeId`）。
- `image_workflows` 目录：WF2 停用（sync 只 upsert 不剪枝，需手动 deactivate），新增 wf_cutout 行；
  loadimage 字段名遵循 `image`。

### WF1 prompt
- `base-art.ts` 的 prompt 构造补"soft studio / clean gradient / bokeh 背景、主体居中、无杂物"约束，避免复杂场景背景。

---

## 前端改动清单

- [PortraitBar.tsx](../../apps/app/components/PortraitBar.tsx)：渲染单张 `art_url`；emotion → tint/emoji/氛围/呼吸动效
  （tint/emoji 常量已在 [portrait.ts:35-51](../../apps/app/utils/portrait.ts#L35-L51)）；**不再按 emotion 换图**。
- [portrait.ts](../../apps/app/utils/portrait.ts)：`resolvePortrait` 简化为始终用 `art_url`；移除立绘画廊的 emotion-set 语义，保留 tint/emoji。
- [use-emotion-art.ts](../../apps/app/hooks/use-emotion-art.ts)：删除按需生成 emotion-art。
- [expression-unlock.ts](../../apps/app/utils/expression-unlock.ts)：`gateEmotion` 解锁逻辑作废。
- [CompanionGalleryPanel.tsx](../../apps/app/components/CompanionGalleryPanel.tsx)、
  [PortraitViewerModal.tsx](../../apps/app/components/PortraitViewerModal.tsx)：画廊改为"主形象 + 瞬间图集"。
- [MomentImageCapture.tsx](../../apps/app/components/MomentImageCapture.tsx)：打磨触发/loading/重试/入画廊。
- [types.ts](../../apps/app/api/types.ts)：`art_emotions`/`ChatEmotionKey` 消费收敛（类型可留，前端停止依赖）。

---

## 实施步骤

**P1 地基（先成立新体验）**
1. WF1 prompt 改干净底图 + 端到端验证 alpha 存储不被 flatten。
2. `ImageGenMode` 加 `cutout` + `getImageGenProvider`/`resolveImageGenConfig` 加 `wfCutoutProvider`。
3. `runninghub-provider.generateCutout()` + mock + openai 报错路径。
4. 新增 `cutout.ts` 作业 + dispatcher 分支 + `art_cutout_key` migration 与缓存/失效。
5. WF_Moment 改吃 `art_cutout_key`（空则先抠）。
6. 前端 PortraitBar 单图 + UI 情绪 + 轻动效。

**P2 收尾**
7. 退役 WF2：路由 410、移除消费/prompts/expression-prompts/admin、config 停用、前端 hook/解锁清理。
8. WF_Outfit：后端配置保留不动，前端暂不实现（无改动，仅确认未被本 spec 误删）。
9. 画廊改版为"主形象 + 瞬间图集"。

---

## 验证
1. **WF1 干净底图**：生成主形象，背景干净、主体居中、利于抠图。
2. **抠图链路**：触发 `wf_cutout` 输出透明 PNG、alpha 保留、缓存命中（二次不重抠）；`art_url` 变更后失效重抠。
3. **瞬间图一致性**：多 scene/stage 捕拍，角色身份一致、构图稳定、失败可重试、入画廊。
4. **情绪 UI**：聊天切 emotion，PortraitBar tint/emoji/动效随 SSE 即时变化，且**不再触发任何 emotion-art 生成**
   （job 表无新 `companion.emotion_art.generate`）。
5. **WF2 下线**：`/companions/{id}/emotion-art/*` 返回下线；queue 不处理该类型；admin 不暴露 expression_prompts；历史 `art_emotions` 仍在库。
6. **静态检查**：
   - `pnpm --filter @xtbit/api test`
   - `pnpm --filter @xtbit/api typecheck`
   - `pnpm --filter @xtbit/app typecheck`
   - `pnpm --filter @xtbit/app lint`

---

## 回滚
- 前端：恢复按 emotion 取图的 `resolvePortrait` + 恢复 emotion-art hook 即回到旧表情立绘体验。
- 抠图/`art_cutout_key`：列可空，WF_Moment 回落用原始 base art 作源即恢复 spec-027 行为。
- WF2：数据未删，重新激活路由/config/消费即可恢复。
- `wf_cutout` 未配置：生产返回明确 `provider_not_configured`，dev/mock 继续通过测试。

---

## 依赖
- spec-006（chat）、spec-020（emotion-art，**本 spec 退役其 WF2 部分**）、
  spec-022（RunningHub provider/workflow 配置）、spec-027（moment images，**本 spec 修订其"不做抠图"非目标**）。
- spec-030（outfit）：后端配置保留不动，前端本轮不实现，不阻塞本 spec。

---

## 待定（落库前需用户给定，不得脑补）
1. **wf_cutout 的 RunningHub workflow**：matting workflow id + loadImage 节点 id + matting 模型（BiRefNet / RMBG-2.0 / BEN2）。
2. **WF_Moment 合成方式**：(a) alpha 合成+协调 还是 (b) IP-Adapter/参考重绘？需对应 RunningHub workflow id/节点。
3. **alpha 存储**：确认 R2 与下游全程不丢透明通道。
4. **历史依赖核对**：确认无现存功能强依赖读 `art_emotions`/`companion_art_jobs`。
