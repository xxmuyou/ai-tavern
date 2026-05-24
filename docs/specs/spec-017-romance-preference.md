# Spec 017 — Romance Preference & Weighted Companion Spawn

## 背景

v1 内容种子（[`spec-013`](./spec-013-v1-content-seed.md)）落地 10 个官方角色，原始配比是 5 女 / 4 男 / 1 非二元（Sora）。产品决定：
- 统一为 **5 男 5 女**：Sora 重新归类为女性。
- 给用户一个**恋爱偏好**开关：`male` / `female` / `any`（默认 `any`），影响场景中伴侣的**出现频率**而非可见性。
- 偏好可**随时修改、无频次限制**，下一次进入场景立即生效。

## 数据模型

新 migration: `packages/api/migrations/0009_gender_preference.sql`

```sql
ALTER TABLE companions ADD COLUMN gender TEXT;             -- 'male' / 'female'
ALTER TABLE users
  ADD COLUMN romance_preference TEXT NOT NULL DEFAULT 'any';
-- + UPDATE 10 个官方角色回填 gender
```

Seed 同步：`migrations/0007_v1_content_seed.sql` 的 INSERT OR REPLACE 列表新增 `gender` 字段；Sora 的 `appearance` 重写为女性化描述。

## 加权抽样

模块：`packages/api/src/companions/gender-weight.ts`

```ts
export const PREFERENCE_WEIGHTS = {
  preferred: 0.8,  // 偏好性别基础权重
  opposite: 0.2,   // 非偏好性别基础权重
  neutral: 0.5,    // any 偏好 / 未知性别
};
```

- `any` 偏好：**不抽样**，所有候选 spawn。
- `male`/`female` 偏好：对每个 `source='official'` 候选做伯努利试验。
- `source='user'` 的伴侣始终 spawn，不参与抽样。
- 保底：若加权抽样把所有 official 都剔除且没有 user 角色，强制保留权重最高的一个，避免场景空着。

应用点（`packages/api/src/scenes/index.ts`）：
- `GET /scenes` 列表：**不抽样**，按权重排序 `potential_companions`，让用户看到场景里的所有人。
- `POST /scenes/{id}/enter` 进入：调用 `sampleCompanionsByPreference()` 决定 `companions_present`。

## API 变更

- `GET /auth/me`：返回 `romance_preference`。
- `PATCH /auth/me/preferences`：body `{ romance_preference }`，无频控。
- `GET/POST /companions`、`GET /companions/{id}`：列出/返回 `gender`；POST 创建必填。

详见 [`docs/architecture/api.md`](../architecture/api.md)。

## App 端

- `apps/app/app/(tabs)/me.tsx` 新增 "Romance preference" 区块，三档切换按钮：Women / Men / Anyone。点击立即 PATCH，无确认弹窗。
- 列表页 / SceneCard / CompanionCard **不强调**性别标签（不显示图标），保持沉浸感。
- 类型：`apps/app/api/types.ts` 增 `Gender`、`RomancePreference`、`CompanionListItem.gender`、`CompanionDetail.gender`、`CompanionCreateInput.gender`、`MeResponse.romance_preference`。

## 验证

1. `pnpm --filter api test` 跑 `gender-weight.test.ts`、`scenes/index.test.ts`、`companions/index.test.ts`。
2. 本地 `pnpm --filter api dev` 自动跑 migration；`wrangler d1 execute --local … "SELECT id,name,gender FROM companions WHERE source='official'"` 检查 10 个角色性别都已填，Sora 是 female。
3. App 端切换偏好 → 反复进入同一多人场景，观察 `companions_present` 是否符合预期分布。
4. 偏好 `any` 行为与历史完全一致（无抽样，全员 present）。
5. 用户自建一个男性伴侣放进偏好女的场景，确认每次都出现。

## 后续可演进

- 权重常量迁到 `app_config` 表或环境变量，让运营热改。
- 创建伴侣表单 UI（apps 端尚未实现，后端 API 已就绪）。
- 解锁条件 / 关系系统是否也按性别细分（暂不做）。
