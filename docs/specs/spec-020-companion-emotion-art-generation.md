# spec-020: Companion Emotion Art Generation

> **类型：** 新建  |  **依赖：** spec-004, spec-006, spec-010, spec-019, spec-021, spec-022  |  **估时：** 5-8 天  |  **状态：** 📝 draft

---

## Context

当前 companion 视觉资产链路已经具备基础字段，但产品体验不完整：

- `companions.art_url` 保存默认立绘。
- `companions.art_emotions` 保存 `emotion -> image key/url` 的 JSON map。
- Chat 已经输出并持久化 `messages.emotion`。
- 前端 `PortraitBar` 已经按当前 emotion 读取 `art_emotions[emotion]`，缺失时回退到 `art_url`。
- `POST /companions/upload-art` 已支持用户上传一张 companion 图片到 R2。

问题在于：用户创建 companion 时只上传一张图，后端当前会把 6 个 emotion 全部映射到同一张图片，导致情绪状态虽然变了，角色立绘却没有变化。这不符合一个可商业化 AI companion 产品的内容生成体验。

本 spec 把用户/管理员的工作流改为：**只上传或维护一张 neutral 基础图，其他情绪图在需要时由 AI 生成，生成后缓存复用。**

积分扣费、余额、充值、退款由 [`spec-021`](./spec-021-credits-ledger-and-metering.md) 定义。本 spec 只定义表情图生成链路以及与积分系统的对接点。

---

## 目标 / 非目标

### 目标

- companion 只要求有一张 `neutral` 基础图。
- 6 个 emotion 固定为：`neutral`, `warm`, `playful`, `guarded`, `tense`, `annoyed`。
- 缺失非 neutral 情绪图时，前端继续显示 neutral，不阻塞聊天。
- 用户或系统触发生成后，后端异步生成缺失的 emotion 图并上传到 R2。
- 生成成功后更新缓存，使后续读取直接命中 `art_emotions[emotion]`。
- 同一 `(companion_id, emotion)` 同时只能有一个 pending/processing 任务。
- 官方 companion 支持 admin 批量预热；用户自创 companion 仅 owner 可触发。
- 生图必须使用 neutral 图作为 reference/image-to-image，优先保证角色一致性。

### 非目标

- ❌ 不在本 spec 内实现积分账本、月度积分、pay-as-you-go 购买；这些属于 spec-021。
- ❌ 不做用户手动逐张上传 6 个 emotion 图。
- ❌ 不做公开角色市场、共享角色、fork/remix。
- ❌ 不做视频、live portrait、语音或 3D avatar。
- ❌ 不做 milestone CG；里程碑装饰层仍按现有产品文档处理。
- ❌ 不承诺所有 provider 都支持相同质量；provider 差异通过后端适配层封装。

---

## 改动清单

### A. Emotion 资产语义

`art_url` 与 `art_emotions` 的语义调整如下：

- `art_url`：companion 的基础 neutral 图，作为列表、详情页和所有 fallback 的默认图。
- `art_emotions.neutral`：必须等于 `art_url`，或在读取时视为 `art_url`。
- `art_emotions.<non-neutral>`：只有真正生成成功或人工填入对应 emotion 图时才存在。

用户创建/编辑 companion 时：

- 上传图片只写入 `art_url` 和 `art_emotions.neutral`。
- 不再把同一张图片填充到 `warm/playful/guarded/tense/annoyed`。
- 若更新了 `art_url`，应清空旧的非 neutral 自动生成图，或将它们标记为 stale，避免新基础图与旧表情图不一致。

### B. 新增生成任务表

新增 D1 表 `companion_art_jobs`，用于去重、状态追踪和失败重试。

建议结构：

```sql
CREATE TABLE companion_art_jobs (
  id              TEXT PRIMARY KEY,
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  user_id         TEXT REFERENCES users(id),
  emotion         TEXT NOT NULL,
  status          TEXT NOT NULL, -- pending / processing / succeeded / failed / cancelled
  source_art_url  TEXT NOT NULL,
  output_key      TEXT,
  provider        TEXT,
  model           TEXT,
  prompt          TEXT NOT NULL,
  error_code      TEXT,
  error_message   TEXT,
  credit_txn_id   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  UNIQUE (companion_id, emotion, source_art_url)
);

CREATE INDEX idx_companion_art_jobs_companion ON companion_art_jobs(companion_id, status);
CREATE INDEX idx_companion_art_jobs_user ON companion_art_jobs(user_id, created_at);
CREATE INDEX idx_companion_art_jobs_status ON companion_art_jobs(status, updated_at);
```

说明：

- `source_art_url` 参与唯一约束，用来处理用户更换 neutral 图后的重新生成。
- `credit_txn_id` 关联 spec-021 的预占/扣费流水；admin/system free bypass 可为空。
- 任务成功后 `output_key` 写 R2 key，例如 `companions/user/{user_id}/{companion_id}/emotions/{emotion}-{uuid}.webp`。

### C. 后端接口

新增或扩展 companion art API：

```txt
POST /companions/{id}/emotion-art/{emotion}/generate
GET  /companions/{id}/emotion-art/jobs
POST /admin/companions/{id}/emotion-art/prewarm
```

`POST /companions/{id}/emotion-art/{emotion}/generate`

- Auth required。
- `emotion` 只能是非 neutral 的 5 个值。
- official companion：普通用户不可触发生成；admin 可触发。
- user companion：仅 owner 可触发。
- 若已有 `art_emotions[emotion]`，返回 `{ status: "cached", key }`。
- 若已有 pending/processing job，返回 `{ status: "processing", job_id }`。
- 若缺少 neutral/art_url，返回 `400 neutral_art_required`。
- 若积分不足，透传 spec-021 的 `402 credits_insufficient`。
- 创建 job 后返回 `202 { status: "queued", job_id }`。

`GET /companions/{id}/emotion-art/jobs`

- Auth required。
- owner/admin 可查看任务状态。
- 返回最近任务列表，用于前端显示 generating/failed/retry。

`POST /admin/companions/{id}/emotion-art/prewarm`

- Admin only。
- 为指定 official/user companion 生成所有缺失情绪图。
- 默认只补缺失项，不覆盖已有图。
- 请求可选 `{ "force": true }`，强制重新生成并替换非 neutral 图。

### D. 异步生成流程

> Provider 默认 mock（仅用于跑通链路），首个真实 provider 接入见 [`spec-022`](./spec-022-image-gen-runninghub-integration.md)。

使用 Worker queue 或现有 `JOB_QUEUE` 处理 `companion.emotion_art.generate`：

1. API 校验权限、emotion、neutral 图、缓存命中和积分余额。
2. 调用 spec-021 reserve 接口预占 image generation 积分；admin/system 任务跳过。
3. 插入或复用 `companion_art_jobs` pending 记录。
4. 投递 queue job，API 返回 202。
5. Consumer 将任务置为 processing。
6. 从 R2 读取 neutral 图，构造 image-to-image/reference image 请求。
7. Provider 返回图片后，上传到 R2，并记录 `asset_objects`。
8. 更新 `companions.art_emotions[emotion] = output_key`。
9. 任务置为 succeeded，并 commit 预占积分。
10. 失败时任务置为 failed，并 refund/release 预占积分。

失败不影响聊天、消息保存或关系数值；前端继续使用 neutral fallback。

### E. Prompt 模板

每个 emotion 使用固定 prompt 模板，并注入 companion 字段：

- `name`
- `gender`
- `appearance`
- `personality`
- `relationship_role`
- `source_art_url`
- `emotion`

统一基础约束：

```txt
Create a consistent portrait variation of the same companion using the provided neutral portrait as the visual reference.
Keep the same identity, face structure, hairstyle, body type, outfit style, color palette, camera angle, and portrait composition.
Only change facial expression and subtle body posture to match the requested emotion.
Transparent or clean simple background. No text. No extra characters. No age change. No style change.
```

Emotion 差异：

| Emotion | Prompt intent |
|---|---|
| `warm` | soft eyes, gentle smile, approachable posture |
| `playful` | teasing smile, slight eyebrow raise, light mischievous energy |
| `guarded` | reserved expression, lips pressed, slightly turned away |
| `tense` | worried or conflicted expression, tightened mouth, subtle anxiety |
| `annoyed` | irritated expression, frown, clear displeasure without caricature |

### F. 前端行为

前端不需要等待生成完成才能聊天。

- `PortraitBar` 继续按 `art_emotions[emotion] || art_url` 显示。
- 当当前 emotion 缺图时，可显示一个低干扰状态：`Generating expression...` 或图标 spinner。
- 用户自创 companion 的详情/编辑页提供 `Generate expressions` 入口，一次生成所有缺失情绪图。
- 单个 emotion 生成失败时显示 retry，不影响其他 emotion。
- 刷新 companion detail 或重新进入 chat 后，应直接使用新生成图。

v1 可以不做实时推送；轮询 `GET /companions/{id}/emotion-art/jobs` 或用户刷新即可。

### G. 安全与风控

- 上传的 neutral 图仍沿用现有文件大小和 MIME 限制。
- Provider 请求前应做基础 prompt safety：
  - 禁止未成年色情化、裸露、仇恨符号、自残血腥、真人名人仿冒。
  - 不允许 prompt 注入改变年龄、身份、画风或生成额外人物。
- 生成图失败时不自动无限重试；同一 job 最多重试 2 次。
- 对同一 user 的 image generation 做速率限制，避免批量刷任务。
- Provider 成本必须写入可审计日志，供运营评估积分价格是否合理。

---

## 实施步骤

1. 新增 migration：创建 `companion_art_jobs` 表。
2. 调整 companion create/update：上传图只写 `art_url` 和 `art_emotions.neutral`。
3. 新增 emotion art service：解析/更新 `art_emotions` JSON，封装 cache hit、job 去重和 stale 判断。
4. 新增用户生成端点和 admin prewarm 端点。
5. 接入 spec-021 的 reserve/commit/refund 接口；在 spec-021 未完成前允许 admin/system bypass，普通用户端点返回 `501 credits_not_ready`。
6. 新增 queue consumer：处理 image-to-image provider 调用、R2 写入、DB 状态更新。
7. 前端 chat/detail/edit 页面接入生成状态与 retry UI。
8. 为 official companion 提供 admin 预热路径，支持一次补齐 5 个非 neutral emotion。
9. 补充测试并更新相关 docs。

---

## 验证方式

- 创建用户 companion 并上传 neutral 图后，`art_emotions` 只包含 `neutral`。
- Chat 中 emotion 变为 `warm` 且缺图时，前端仍显示 neutral，不报错。
- 触发 `warm` 生成后返回 202，并插入 pending job。
- 重复触发同一 emotion 不创建第二个 processing job。
- 生成成功后 R2 有 output key，`companions.art_emotions.warm` 更新为该 key。
- 生成失败时 job 为 failed，前端仍使用 neutral fallback，积分预占被释放或退款。
- admin prewarm 能补齐 official companion 的所有缺失 emotion。
- owner 之外用户无法触发 user companion 的生图。
- official companion 的普通用户无法触发生图。

---

## 回滚

- 前端回滚到只使用 `art_url` fallback 时，已有 `art_emotions` 不影响基础聊天。
- 后端可以关闭生成端点，保留历史生成图和 `art_emotions` 缓存。
- 若 provider 故障，queue job 置为 failed，不删除 neutral 图。
- migration 回滚时可删除 `companion_art_jobs`；R2 中已生成对象可保留为孤儿资产，后续批处理清理。

---

## 依赖

- [`spec-004`](./spec-004-companions-simplify.md)：companion 数据模型与 CRUD。
- [`spec-006`](./spec-006-chat-rewrite.md)：chat emotion 输出与消息保存。
- [`spec-010`](./spec-010-billing-entitlements-quota.md)：订阅权益和 Stripe 基础能力。
- [`spec-019`](./spec-019-companion-create-ui.md)：用户创建/编辑 companion 与 neutral 图上传入口。
- [`spec-021`](./spec-021-credits-ledger-and-metering.md)：积分账本、扣费、退款和充值。
- [`spec-022`](./spec-022-image-gen-runninghub-integration.md)：首个真实 image gen provider（RunningHub）接入；本 spec 默认 mock，真实 provider 由 spec-022 提供。
