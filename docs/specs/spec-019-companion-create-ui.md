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

前端当前 0% 实现：没有创建/编辑/删除 UI，没有配额提示，没有立绘上传入口。

**Emotion 立绘约定（2026-05-25 用户确认）：** 用户上传一张图，后端在 `companions` 表的 6 个 emotion 列（`art_emotion_warm/neutral/guarded/playful/tense/annoyed`）全部写入该 URL。用户不需要在 UI 感知"多 emotion"——只上传一张。

---

## 范围

### 包含（v1 MVP）

- Native（iOS/Android via Expo Go + EAS）+ Web 三端：创建页、编辑页、删除确认、配额提示
- 立绘上传：用户上传一张图 → R2 → URL，后端填充全部 emotion 列
- 后端新增 `POST /companions/upload-art` 端点
- 配额 UX：免费用户上限 3 个，Pro 无限

### 不包含（v2）

- `/companions/assist` LLM 辅助创角
- 6 emotion 分别上传不同图
- 角色公开 / 社区分享
- 角色 import/export
- AI 生成立绘

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

## 后端新增：`POST /companions/upload-art`

### 路由

`POST /companions/upload-art`，鉴权必须（`requireAuthUser`）。

### 请求

- `Content-Type: multipart/form-data`
- 字段 `file`：图片文件
- 限制：最大 **5MB**；`image/webp`、`image/jpeg`、`image/png` 三种 MIME 类型

### 处理

1. 校验文件大小 / MIME 类型
2. 生成 R2 key：`user-art/{user_id}/{uuid}.{ext}`
3. 上传到 `env.ASSETS`（R2 binding）
4. 返回 `{ "key": "user-art/{user_id}/{uuid}.webp" }`（相对 key，非绝对 URL；前端通过 `objectUrl(key)` 转 preview URL）

### 错误

| HTTP | error code | 场景 |
|------|-----------|------|
| 400 | `file_required` | 未传 file 字段 |
| 400 | `file_too_large` | 超过 5MB |
| 400 | `invalid_file_type` | 非允许 MIME |
| 401 | `auth_required` | 未登录 |

### 文件位置

新增 `packages/api/src/companions/upload-art.ts`，在 companions `index.ts` 路由表中注册 `POST /companions/upload-art`。

---

## Emotion 填充逻辑（后端）

在 `companions/index.ts` 的 `createCompanion()` 函数中（INSERT 前）：

```typescript
if (input.art_url && !input.art_emotions) {
  // fill all 6 emotions with the single uploaded art_url
  input.art_emotions = {
    warm: input.art_url,
    neutral: input.art_url,
    guarded: input.art_url,
    playful: input.art_url,
    tense: input.art_url,
    annoyed: input.art_url,
  };
}
```

`PUT /companions/{id}`（编辑）同理处理：若 `body.art_url` 更新了但 `body.art_emotions` 未传，则全量覆盖 6 个 emotion 列。

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
| 立绘（`art_url`） | 图片上传（预览 + 重选） | ❌ | 见上传端点 |

---

## 立绘上传 UX

1. 占位区：圆角矩形，`aspect-[4/5]`，虚线边框，居中「Upload portrait」文案
2. 点击触发文件选择：
   - Native：`expo-image-picker` → `MediaTypeOptions.Images`
   - Web：`<input type="file" accept="image/*">`
3. 选择后立即 `POST /companions/upload-art`，显示上传 spinner
4. 成功：预览图替换占位区，同时记录 `artKey` 到表单 state
5. 失败：toast 错误，占位区恢复
6. 支持重新选择（点击预览图 → 重新选）

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

- 两列布局：左侧立绘上传区（1/3 宽），右侧字段分组卡片（2/3 宽）
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

- [ ] emotion 填充：POST 只给 `art_url` → 所有 6 emotion 列均写入该 URL
- [ ] emotion 填充：PUT 更新 `art_url` 但不传 `art_emotions` → 覆盖全部 emotion 列
- [ ] emotion 填充：POST 同时给 `art_url` + `art_emotions` → 不覆盖，以 `art_emotions` 为准

### 单元测试（`companions/upload-art.test.ts`）

- [ ] 未登录 → 401
- [ ] 超过 5MB → 400 `file_too_large`
- [ ] 不支持的 MIME → 400 `invalid_file_type`
- [ ] 正常上传 → 200 `{ key: "user-art/..." }`；R2 存储被调用

### 集成测试（前端手动）

- [ ] 创建 → 列表可见 → 详情 → 编辑 → 删除流程
- [ ] 免费用户创建第 4 个 → QuotaModal
- [ ] Pro 用户无 QuotaModal，无分母计数

---

## 依赖与前置

| 依赖 | 状态 |
|------|------|
| `POST /companions` 后端 | ✅ done (spec-004) |
| `PUT /companions/{id}` 后端 | ✅ done (spec-004) |
| `DELETE /companions/{id}` 后端 | ✅ done (spec-004) |
| `GET /billing/status` → `custom_companion_limit` | ✅ done (spec-010) |
| `POST /companions/upload-art` 后端 | ❌ 本 spec 新增 |
| R2 `ASSETS` binding 已配置 | ✅ done (wrangler.jsonc) |

---

## 不做 / v2 留位

- `/companions/assist` LLM 辅助创角
- 6 emotion 分别配不同立绘
- 角色公开 / 分享 / 社区浏览
- 角色 import/export
- AI 生成立绘
- 批量删除
