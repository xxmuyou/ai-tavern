# spec-032: Web Public Companion Discovery Home

> **类型：** Web UI + API + content tags  |  **依赖：** spec-018, spec-017, spec-019, spec-022  |  **估时：** 2-4 天  |  **状态：** 🟡 in-progress

---

## Context

Web 端准备先上线，当前首页仍残留浅色营销 landing、未登录 fake catalog skeleton，以及 mobile 体验妥协后的布局。产品方向已改为：用户进入 web 第一屏就看到真实 companions，直接按偏好选人。

本 spec 是 spec-018 的 web 首页收口：只改 Web 首页和相关公开 discovery API，不重做 mobile。旧的“真实 / 二次元 JP / 二次元 KR”风格口径也在本 spec 收敛：用户侧只显示 **Realistic** 与 **Anime** 两个 bucket；`Anime JP` / `Anime KR` 继续作为 admin checkpoint 名称或运营标签存在，不作为首页独立筛选项。

---

## 目标 / 非目标

### 目标

- 未登录用户可在 web 首页浏览真实 active companions。
- 首页使用暗色、暧昧、角色优先的视觉方向，不再是产品营销页。
- 首页显眼位置提供 `Female / Male` 与 `Anime / Realistic` 筛选。
- `Anime` bucket 合并 JP/KR/其他二次元标签；admin/model catalog 仍保留 JP/KR 名称区分。
- 点击 companion：未登录进入登录流程并保留目标 redirect；已登录进入 companion 详情。
- 清理旧浅色 landing 与 fake catalog skeleton，不保留并行入口。

### 非目标

- 不重做 mobile/native 页面。
- 不新增正式 `companions.art_style` 字段。
- 不把 `anime_jp` / `anime_kr` 暴露为首页筛选项。
- 不改变 image model checkpoint catalog 的管理方式。

---

## Style Tag Policy

Companion discovery 使用 companion `tags` 承载用户侧风格 bucket：

- `style:anime`
- `style:realistic`

公开列表过滤兼容历史标签：

| Query | 匹配 tags |
|---|---|
| `art_style=anime` | `style:anime`, `anime`, `anime_jp`, `anime_kr`, `anime,jp`, `anime,kr` |
| `art_style=realistic` | `style:realistic`, `realistic` |

Admin/model catalog 保留更细名称：

- checkpoint label 可继续是 `Anime JP - Animagine XL`、`Anime KR - Ghost XL`。
- checkpoint tag 可继续是 `anime,jp` / `anime,kr`，用于运营识别和模型管理。
- 这些名称不直接暴露为用户侧首页筛选项。

当前内置官方 portrait 更接近二次元/插画风，backfill 默认给有内置 portrait 的 official companions 补 `style:anime`。后续真实风角色补 `style:realistic`。

---

## API / Data

### `GET /companions/public`

公开只读端点，不要求登录。

Query:

- `gender=male|female`
- `art_style=anime|realistic`
- `q=<name-or-tag>`
- `sort=popular|recent`

返回 active official companions 与已发布的 active public user companions：

```json
{
  "items": [
    {
      "id": "maya",
      "source": "official",
      "is_public": false,
      "name": "Maya Chen",
      "gender": "female",
      "relationship_role": "crush",
      "art_url": "portraits/maya/neutral.webp",
      "preferred_scenes": ["pier_coffee_shop"],
      "tags": ["style:anime"],
      "play_count": 12
    }
  ]
}
```

Security boundary:

- 不返回 private user companions。
- 不返回 owner-only fields (`want`, `secret`, `boundary`, `example_dialogues`)。
- 不返回当前用户 relationship state，因为未登录也可访问。
- 详情、聊天、favorite、create/edit/delete 仍走鉴权端点。

### Migration / backfill

新增 migration 只补 tags，不新增字段：

- official companions 的 `tags` 为空时写入 `["style:anime"]`。
- official companions 已有 tags 时追加 `style:anime`，去重。
- 后续真实风角色由内容或 admin 写入 `style:realistic`。

---

## Web Experience

- `/` 未登录：暗色 companion discovery 首页。
- `/` 已登录：同样优先展示 companion discovery，可保留登录后 create/favorites/actions。
- `/auth/login`：不再使用旧浅色营销 `WebLanding`，改为同一暗色登录体验或 discovery 登录弹窗。
- 筛选默认：`female + anime`。
- 无结果：展示暗色空态，提示切换筛选，不展示 fake skeleton people。
- 角色卡优先展示 portrait；没有 `art_url` 的角色可在首页隐藏，避免上线第一屏出现占位人。

---

## 实施步骤

1. 文档先行：新增本 spec，更新 README/spec-018/spec-020/spec-022/architecture/api/ops 文档。
2. 新增 `GET /companions/public` 与 API 测试。
3. 新增 tags backfill migration。
4. 前端新增公开 companions hook/client 方法。
5. 重做 web 首页为暗色 discovery UI，并移除旧 fake skeleton catalog。
6. `/auth/login.web.tsx` 迁移到暗色入口，不再引用旧 `WebLanding`。
7. 跑 typecheck/test/export 并手动检查桌面首页。

---

## 验证

```bash
pnpm --filter @xtbit/api test
pnpm --filter @xtbit/app typecheck
pnpm --filter @xtbit/app export:web
```

手动 QA：

- 未登录打开 `/` 可看到真实 companions。
- `Female/Male` 切换只改变性别。
- `Anime/Realistic` 切换只改变风格 bucket；`Anime` 匹配 JP/KR legacy tags。
- 未登录点击角色进入登录流程；登录后跳转目标详情。
- 旧浅色营销 landing 和 fake skeleton catalog 不再出现。

---

## 回滚

- 公开 API 可下线或让前端不调用；鉴权 `/companions` 不受影响。
- tags backfill 只追加 `style:*`，可通过后续 migration 移除或忽略。
- web 首页可恢复到旧 `index.web.tsx`，但不建议恢复 fake skeleton。

