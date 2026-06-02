# spec-019: User/VIP Companion Creation UI

> **类型：** 新建  |  **依赖：** spec-004, spec-010, spec-018  |  **估时：** 5-7 天  |  **状态：** 📝 draft

---

## Context

后端 CRUD + 配额逻辑已 100% 实现（spec-004 / spec-010）：

- `POST /companions`：创建自定角色，含 `genre_guard`（非 official source 要求 owner），配额校验返回 402
- `PUT /companions/{id}`：编辑，仅 owner 可改
- `DELETE /companions/{id}`：软删（`is_active=0`），仅 owner 可删
- `GET /companions?source=user|official|all`：列表，含关系维度
- `GET /billing/status`：返回 `entitlements.custom_companion_limit`（free=3, Pro=null=无限）

本文档是创建/编辑自定义 companion 的当前产品契约。旧版“上传后必须重画”“上传一张图填满 6 个 emotion”的说法已废弃：创建时只确定一张 neutral 基础图，非 neutral 变体按 spec-020 的能力异步补齐或回退 neutral。

---

## 范围

### 包含（v1 MVP）

- Native（iOS/Android via Expo Go + EAS）+ Web 三端：创建页、编辑页、删除确认、配额提示
- 立绘来源：文生图创建，或上传本地图片直接作为最终 neutral 图
- 后端 `POST /companions/upload-art` 端点
- 文生图 prompt assistant：帮助用户把需求转为英文生图 prompt
- 手动保存个人图片资产，并在 Me 查看
- 配额 UX：免费用户上限 3 个，Pro 无限

### 不包含（v2）

- 6 emotion 分别上传不同图
- 角色公开 / 社区分享
- 角色 import/export
- 上传图片后再走 img2img 重画 / 身份保真

---

## 入口设计

### 创建入口

`companions` tab 列表页（`(tabs)/companions.tsx` / `companions.web.tsx`）右上角放 **+ IconButton**。

- 显示：所有登录用户均可见，右上角固定位置
- 点击：检查配额
  - 若已达上限（free + `used >= 3`）：弹 QuotaModal（见下文）
  - 否则：跳到创建页

### 路由

```
apps/app/app/companion-create.tsx          Native 创建页（独立 stack 全屏）
apps/app/app/companion-create.web.tsx      Web 创建页
apps/app/app/companion/[id]/edit.tsx       Native 编辑页（stack 路由，非 tab 子路由）
apps/app/app/companion/[id]/edit.web.tsx   Web 编辑页
```

> **Expo Router 约束**：`(tabs)/` 内部不允许子目录（否则 initialRouteName 崩溃）。编辑页放在 `companion/[id]/edit.tsx`，属于 tab 之外的普通 stack 路由，不受此约束。

### 编辑 / 删除入口

- `companion/[id].tsx`（native 详情页）：右上角 overflow 菜单（`…`）→ Edit / Delete
- `companion/[id].web.tsx`（web 详情页）：同样的 overflow 或 footer 操作栏
- 官方角色（`source === 'official'`）：隐藏 Edit / Delete 按钮（server 也会返回 403，前端是 defensive）

---

## 创建流程（基础图 → 属性 → 完成）

> 2026-05-28 用户确认的实际顺序：**先拿到基础图，再填属性，点「完成」才建角色**。基础图先于 companion 记录存在；详见 [`spec-020`](./spec-020-companion-emotion-art-generation.md) §A「创建流程顺序」与 §F。

### 第 1 步：基础图

点「+ 创建」弹浮窗（未达配额时；达上限走 QuotaModal）：

1. **选择生成模型**：从 `/image-models` 拉取 admin 配置的 active 模型（返回 `{id, label, tag}`）。模型决定走哪条 workflow（`workflow_key`）与 checkpoint（`ckpt_name` + `checkpoint_field_name`，后端解析）；前端只展示 label，不硬编码风格枚举。
2. **二选一拿基础图**：
   - **上传本地图片**：`POST /companions/upload-art` 拿到原图 key，直接作为最终 `art_url` / neutral 图；不调用 RunningHub，不做 img2img 重画，不消耗生图流程。
   - **文生图**：填外貌描述 prompt → 调 `POST /companions/base-art/generate`（`source:"text"` + `prompt` + `model`）。
3. **Prompt assistant**：生图输入旁增加小栏，英文提示文案固定为 `Not sure what kind of portrait you want? Ask me.`。用户在小对话框里描述需求后，后端返回一段可编辑的英文生图 prompt；该接口只生成 prompt，不直接触发生图，不保存资产。
4. **异步预览 / 重抽**：文生图的 `base-art/generate` 返回 `job_id`，前端轮询 `GET /companions/base-art/jobs/{jobId}`：
   - `processing` → 显示「生成中」spinner。
   - `succeeded` → 预览基础图；满意则「下一步」，不满意可「重新生成」。
   - `failed` → toast 错误，可重试。
5. **预览尺寸**：基础图预览和空状态占位都用较小的居中 `4:5` 画幅。Web/tablet 最大宽度约 `320px`，窄屏约 `240px`；图片不再 `width:100%` 撑满整块面板。
6. **手动保存资产**：文生图成功后显示 `Save to My assets`。只有用户点击后才写入个人资产库；未保存的废稿仍可继续用于本次创建，但不出现在 Me。
7. 拿到满意的基础图后，把 `art_key` / `art_url` 暂存到创建表单 state，进入第 2 步。

### 第 2 步：属性表单

填 name / gender / personality / background 等（见下文表单字段映射）。**这些属性只喂 chat 人设，不参与立绘出图**，所以放在图之后无影响。

### 第 3 步：点「完成」建角色

`POST /companions` 带 `{属性 + art_url}` 落库（文生图结果和上传结果都作为 `art_url` 提交）：

- 后端写 `art_url` + `art_emotions.neutral`，**不填满 6 列**。
- 文生图可携带对应模型/风格信息供后续表情变体使用；上传本地图片没有强制风格重画。
- 非 neutral 变体未生成或不适用时，PortraitBar 回退 neutral，角色仍立即可用。

---

## 后端新增：`POST /companions/upload-art`

### 路由

`POST /companions/upload-art`，鉴权必须（`requireAuthUser`）。

### 请求

- `Content-Type: multipart/form-data`
- 字段 `file`：图片文件
- 限制：最大 **5MB**；`image/webp`、`image/jpeg`、`image/png` 三种 MIME 类型

### 处理

1. 校验文件大小 / MIME 类型
2. 生成 R2 key：`companions/user/{user_id}/{uuid}.{ext}`
3. 上传到 `env.ASSETS`（R2 binding）
4. 返回 `{ "key": "companions/user/{user_id}/{uuid}.webp" }`（相对 key，非绝对 URL；前端通过 `objectUrl(key)` 转 preview URL）

### 错误

| HTTP | error code | 场景 |
|------|-----------|------|
| 400 | `file_required` | 未传 file 字段 |
| 400 | `file_too_large` | 超过 5MB |
| 400 | `invalid_file_type` | 非允许 MIME |
| 401 | `auth_required` | 未登录 |

### 文件位置

端点实现位于 `packages/api/src/companions/upload-art.ts`，在 companions `index.ts` 路由表中注册 `POST /companions/upload-art`。

---

## Emotion 填充逻辑（后端）

当前约定：不再「一张图填满 6 列」。基础图只写 `neutral`，其余 5 个非 neutral 变体由 spec-020 异步生成（透明背景）或回退 neutral。

在 `companions/index.ts` 的 `createCompanion()` 函数中（INSERT 前）：

```typescript
if (input.art_url && !input.art_emotions) {
  // 基础图只写 neutral；其余 5 个 emotion 由 spec-020 异步生成后回填
  input.art_emotions = { neutral: input.art_url };
}
```

- `art_emotions.neutral` 等于 `art_url`；`warm/playful/guarded/tense/annoyed` 留空，等异步变体生成或回退 neutral。
- 文生图创建可自动触发后续变体生成（见 spec-020 §A / §F）；上传本地图片直接作为 neutral，不强制接 RunningHub 重画。
- `PUT /companions/{id}`（编辑）：若更新 `art_url` 或 `art_style`，清空或标记 stale 旧的非 neutral 变体，避免新基础图 / 新风格与旧变体串味。

---

## 表单字段映射

对应后端 `CreateValue` / `UpdateValue` schema：

| 字段 | UI 控件 | 必填 | 约束 |
|------|---------|------|------|
| `name` | TextInput | ✅ | 1-80 字符 |
| `gender` | 单选（male / female） | ✅ | — |
| `appearance` | 多行 TextInput | ❌ | 最大 4000 字符 |
| `personality` | 多行 TextInput | ❌ | 最大 4000 字符 |
| `background` | 多行 TextInput | ❌ | 最大 4000 字符 |
| `speech_style` | 多行 TextInput | ❌ | 最大 4000 字符 |
| `relationship_role` | 下拉（colleague/neighbor/friend/crush/stranger/family） | ❌ | — |
| `preferred_scenes` | 场景多选（从 `GET /scenes` 拉清单） | ❌ | 最多 32 个 |
| `want` | 多行 TextInput + preset chips | ❌ | 最大 4000 字符 |
| `secret` | 多行 TextInput | ❌ | 最大 4000 字符 |
| `boundary` | 多行 TextInput + preset chips | ❌ | 最大 4000 字符 |
| 立绘（`art_url`） | 图片上传（预览 + 重选） | ❌ | 见上传端点 |

### Persona 预设 UX

为降低创建门槛，以下字段提供可点击 preset chips，并保留 `Other` 自由输入：

- `personality`：如 warm / reserved / playful / protective / ambitious / mysterious。
- `speech_style`：如 soft-spoken / direct / teasing / formal / poetic。
- `want`：如 to be understood / to feel safe / to be taken seriously / to find excitement。
- `boundary`：如 being lied to / being rushed / being ignored / being treated as a backup。

点击 preset 只填充或追加到可编辑文本里，用户最终提交的仍是普通字符串。`Other` 不是后端枚举值，只是打开自由输入的 UI 状态。

---

## 立绘上传 UX

1. 占位区：小尺寸居中圆角矩形，`aspect-[4/5]`，虚线边框，居中「Upload portrait」文案；Web/tablet 最大宽度约 `320px`，窄屏约 `240px`
2. 点击触发文件选择：
   - Native：`expo-image-picker` → `MediaTypeOptions.Images`
   - Web：`<input type="file" accept="image/*">`
3. 选择后立即 `POST /companions/upload-art`，显示上传 spinner
4. 成功：预览图替换占位区，同时记录 `artKey` 到表单 state
5. 失败：toast 错误，占位区恢复
6. 支持重新选择（点击预览图 → 重新选）

---

## 个人图片资产

用户对文生图结果有手动保存为个人资产的权利，入口在生成预览旁。

### API

- `POST /me/image-assets`：手动保存一张图片资产。
  - 请求：`{ "art_key": "<r2 key>", "source": "generated" | "upload", "prompt"?: "...", "model_id"?: "..." }`
  - 返回：`{ "id": "...", "art_key": "...", "created_at": ... }`
- `GET /me/image-assets`：列出当前用户保存过的图片资产，按 `created_at DESC` 返回。
- `DELETE /me/image-assets/{id}`：从个人资产库移除记录；不删除 R2 原图，也不影响已经创建的 companion。

### 数据

新增 `user_image_assets` 表承载用户资产语义，不复用 `image_generation_jobs` 作为长期图库：

```sql
CREATE TABLE user_image_assets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  art_key     TEXT NOT NULL,
  source      TEXT NOT NULL,
  prompt      TEXT,
  model_id    TEXT,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
```

Me 页面新增 `My image assets` 区块，显示缩略图网格。空状态不提示配置或接口细节，只显示简短空状态。

---

## 配额 UX

### 计数显示

`companions` 列表页右上 + 按钮旁（或下方）显示 `2/3 companions`。

- 数据来源：`GET /billing/status` 的 `entitlements.custom_companion_limit`（free=3, Pro=null）+ `GET /companions?source=user` 的列表长度
- Pro 用户：不显示分母（`X companions`）

### QuotaModal

触发条件：用户点 + 按钮但 `user_count >= 3 && !isPro`。

```
┌─────────────────────────────────────────┐
│  You've reached the free limit           │
│                                          │
│  Free accounts can create up to 3        │
│  custom companions. Upgrade to Pro for   │
│  unlimited companion creation.           │
│                                          │
│  [Not now]           [Upgrade to Pro →] │
└─────────────────────────────────────────┘
```

- 「Upgrade to Pro →」：跳 `/billing`
- 后端返回 402 `quota_exceeded` 时，相同 Modal 兜底

---

## 删除 UX

1. 详情页 overflow 菜单 → "Delete companion"
2. AlertDialog：
   ```
   Delete [name]?
   This will permanently remove [name]. Your conversation history will remain in your records. This action cannot be undone.
   [Cancel]  [Delete]
   ```
3. 确认后 → `DELETE /companions/{id}`
4. 成功：toast "Companion removed." + 返回列表（`router.back()`）
5. 后端软删（`is_active=0`），列表页不再显示（`GET /companions` 默认过滤 inactive）

---

## 错误码处理

| HTTP | error | 前端处理 |
|------|-------|---------|
| 400 | `invalid_input` | 行内字段错误（highlight 对应 TextInput） |
| 401 | `auth_required` | 跳登录页 |
| 402 | `quota_exceeded` | QuotaModal |
| 403 | `forbidden` | toast "Official companions can't be edited"（UI 不应该暴露这些操作，但 defensive 兜底） |
| 404 | — | 通用 404 页 / toast "Not found" |

---

## 三端差异

### Native (iOS/Android)

- 全屏 stack push（无 modal sheet）
- 表单单列布局
- 底部 sticky "Create" / "Save changes" 按钮
- 图片选择：`expo-image-picker`

### Web (`companion-create.web.tsx`)

- 两列布局：左侧小尺寸立绘区（最大约 `320px`），右侧字段分组卡片
- 最大宽度 720px 居中
- 图片选择：`<input type="file">`
- "Create" 按钮在表单底部（非 sticky）

---

## API Client 新增

在 `apps/app/api/companion-client.ts` 新增：

```typescript
export async function uploadCompanionArt(file: File | Blob): Promise<{ key: string }> { ... }
```

Native 端将 `expo-image-picker` 返回的 `uri` 转为 `Blob` 后调用。

---

## 测试清单

### 单元测试（`companions/index.test.ts`）

- [ ] emotion 填充：POST 只给 `art_url` → 仅 `art_emotions.neutral` 写入该 URL，其余 5 列留空
- [ ] emotion 填充：POST 同时给 `art_url` + `art_emotions` → 以传入 `art_emotions` 为准
- [ ] 创建带文生图 `art_url` → `neutral` 正确写入，后续变体可异步触发或回退 neutral
- [ ] 创建带上传 `art_url` → 不触发 RunningHub upload 重画，`neutral` 使用上传 key

### 单元测试（`companions/upload-art.test.ts`）

- [ ] 未登录 → 401
- [ ] 超过 5MB → 400 `file_too_large`
- [ ] 不支持的 MIME → 400 `invalid_file_type`
- [ ] 正常上传 → 200 `{ key: "companions/user/..." }`；R2 存储被调用

### 单元测试（`me/image-assets.test.ts`）

- [ ] 未登录 → 401
- [ ] 保存不属于当前用户可访问范围的 key → 403 或 404
- [ ] 正常保存 → 返回 asset id，`GET /me/image-assets` 可见
- [ ] 删除资产 → `GET /me/image-assets` 不再返回；R2 对象不删除

### 集成测试（前端手动）

- [ ] 创建 → 列表可见 → 详情 → 编辑 → 删除流程
- [ ] 免费用户创建第 4 个 → QuotaModal
- [ ] Pro 用户无 QuotaModal，无分母计数
- [ ] 文生图预览尺寸不会撑满页面；移动端和 Web 都保持小尺寸
- [ ] 文生图成功后，未点击 `Save to My assets` 不出现在 Me；点击后出现在 Me
- [ ] prompt assistant 返回英文 prompt，用户可编辑后再生成
- [ ] persona preset chips 能填充字段，`Other` 可自由输入

---

## 依赖与前置

| 依赖 | 状态 |
|------|------|
| `POST /companions` 后端 | ✅ done (spec-004) |
| `PUT /companions/{id}` 后端 | ✅ done (spec-004) |
| `DELETE /companions/{id}` 后端 | ✅ done (spec-004) |
| `GET /billing/status` → `custom_companion_limit` | ✅ done (spec-010) |
| `POST /companions/upload-art` 后端 | ✅ done |
| R2 `ASSETS` binding 已配置 | ✅ done (wrangler.jsonc) |
| `POST /me/image-assets` / `GET /me/image-assets` | ❌ 本 spec 新增 |
| prompt assistant 端点 | ❌ 本 spec 新增 |

---

## 不做 / v2 留位

- 6 emotion 分别配不同立绘
- 角色公开 / 分享 / 社区浏览
- 角色 import/export
- 上传后 RunningHub img2img 重画 / 身份保真
- 批量删除
