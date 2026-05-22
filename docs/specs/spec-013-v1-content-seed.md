# spec-013: v1 内容 seed migration（10 场景 + 10 角色）

> **类型：** 新建  |  **依赖：** spec-003 (baseline schema), spec-004 (companions), spec-007 (scenes)  |  **估时：** 1 天（不含美术）  |  **状态：** 🟢 done

---

## Context

后端 v1 baseline schema 已就位（spec-003，migrations 0001~0006），`companions` 和 `scenes` 表的字段定义、`relationships` 7 维度引擎都已实现，但**数据库里一条官方角色和场景都没有**。前端 spec-012 的 Scenes 列表、Companions 列表、Chat 页全部是空的，无法体验产品核心循环（场景 → 角色 → 对话）。

[`docs/product/content.md`](../product/content.md) 已经把 **Aurelia City** 这座虚构都市的设定、10 个场景的 mood prompt + possible_events、10 个官方角色的 appearance/personality/background/speech_style + 7 维度 `initial_dims` 全部写完。本 spec 把那份产品初稿落地为一条可跑的 SQL migration，让 dev/local D1 一次性灌入这些种子数据。

不包含美术资源（角色立绘、场景图）。`art_url` 字段统一 `NULL`，前端用占位即可。美术接入是独立工作，留给 v1 上线后的内容打磨阶段。

---

## 目标

- 10 个官方场景（`scenes` 表 `is_active = 1`）入库
- 10 个官方角色（`companions` 表 `source = 'official'`、`is_active = 1`）入库
- 字段全部来自 `docs/product/content.md`，不重新设计
- 单一 migration 文件 `0007_v1_content_seed.sql`，幂等（重跑不重复）
- `GET /scenes`、`GET /companions` 在新 D1 上能立刻返回 10 条

## 非目标

- ❌ 角色立绘 / 场景插图（美术资源单独 pipeline）
- ❌ 用户自创角色样例数据（`source = 'user'` 留空）
- ❌ 完整的解锁矩阵（v1 只在 `skyline_rooftop` 留一条 `min_relationship` 条件作演示，其余默认解锁）
- ❌ 事件模板新增（`event_templates` 已由 `0005_event_templates_seed.sql` 备好 5 个 default）
- ❌ 关系初始化（用户首次进入对话时由 `ensureRelationship` 用 companion 的 `initial_dims` 写入 `relationships` 表，无需 seed）
- ❌ 内容中文化（v1 走 English-first）

---

## 改动清单

| 路径 | 操作 |
|---|---|
| `packages/api/migrations/0007_v1_content_seed.sql` | 新建：10 INSERT scenes + 10 INSERT companions |
| `docs/specs/README.md` | 修改：spec-013 状态 待办 → 🟢 done，并把链接指向本文件 |

`docs/product/content.md` 已经覆盖所有字段，本 spec 不需要修改它。

---

## 实施步骤

1. **核字段对齐**：核对 `packages/api/migrations/0001_v1_baseline.sql` 中 `companions` 与 `scenes` 表的字段定义，与 `docs/product/content.md` 给的数据逐一对应：
   - `companions`: id, source='official', created_by=NULL, is_active=1, name, appearance, personality, background, speech_style, relationship_role, preferred_scenes (JSON array), art_url=NULL, initial_dims (JSON object), created_at, updated_at
   - `scenes`: id, name, mood, tags (JSON array), possible_events (JSON array), default_companions (JSON array), unlock_condition (JSON or NULL), art_url=NULL, display_order (1-based), is_active=1, created_at

2. **写 migration**：新建 `packages/api/migrations/0007_v1_content_seed.sql`：
   - 用 `INSERT OR REPLACE INTO` 保证幂等
   - 时间戳统一用 `unixepoch() * 1000`
   - JSON 字段用合法 JSON 字符串（双引号），SQL 字面量用单引号包裹
   - 文本字段含单引号时用 `''` 转义
   - 文件顶部加注释说明数据来源（`docs/product/content.md`）

3. **场景顺序按 content.md 的总览表**：
   ```
   1. pier_coffee_shop, 2. sky_office, 3. twin_pines_park, 4. moon_bar,
   5. sunrise_apartment, 6. brookside_bookshop, 7. skyline_rooftop,
   8. iron_forge_gym, 9. crescent_library, 10. harbor_market
   ```

4. **角色顺序按 content.md 的总览表**：
   ```
   1. maya, 2. ryan, 3. lila, 4. ethan, 5. sora,
   6. marcus, 7. aiko, 8. jordan, 9. iris, 10. theo
   ```

5. **解锁条件**：只有 `skyline_rooftop` 的 `unlock_condition` 写：
   ```json
   {"type":"min_relationship","companion_id":"sora","dim":"closeness","value":30}
   ```
   注意：v1 解锁引擎（`packages/api/src/scenes/unlock.ts`）只判断单个 `min_relationship`。本条覆盖 content.md 中的"Sora 或 Marcus closeness > 30"——v1 简化为只看 Sora；Marcus 条件归 spec-008 events 后续扩展。

6. **跑 migration 冒烟**：
   ```bash
   cd infra/cloudflare
   wrangler d1 migrations apply xtbit-apps-api --local --persist-to=.wrangler/state
   wrangler d1 execute xtbit-apps-api --local --persist-to=.wrangler/state \
     --command "SELECT COUNT(*) AS n FROM scenes WHERE is_active=1;"
   wrangler d1 execute xtbit-apps-api --local --persist-to=.wrangler/state \
     --command "SELECT COUNT(*) AS n FROM companions WHERE source='official' AND is_active=1;"
   ```
   两条都应该返回 10。

7. **更新 README 状态**：把 `docs/specs/README.md` 表中 spec-013 行的链接指向本文件，状态改 🟢 done。

---

## 验证方式

- migration 应用成功，无 SQL 错误
- `SELECT COUNT(*) FROM scenes WHERE is_active=1` = 10
- `SELECT COUNT(*) FROM companions WHERE source='official' AND is_active=1` = 10
- 启 worker 后 `GET /scenes` 返回 10 条，含完整 mood/tags/possible_events
- `GET /companions` 返回 10 条 official，含完整角色卡字段
- 进入任意场景的聊天页能 `ensureRelationship` 用 companion 的 `initial_dims` 初始化关系（用 `GET /relationships/{companionId}` 比对值）

---

## 回滚

基于 spec-003 的"接受 local/dev 清库"原则：

```bash
# 撤销本 migration
wrangler d1 execute xtbit-apps-api --local --persist-to=.wrangler/state \
  --command "DELETE FROM scenes; DELETE FROM companions WHERE source='official';"
```

或直接清库重跑：

```bash
rm -rf infra/cloudflare/.wrangler/state
wrangler d1 migrations apply xtbit-apps-api --local --persist-to=.wrangler/state
```

prod 暂不应用本 migration——v1 上线时统一走 production migration apply。

---

## 依赖

- [spec-003 D1 schema reset](./spec-003-d1-schema-reset.md) —— 提供 `companions` / `scenes` 表
- [spec-004 companions 简化](./spec-004-companions-simplify.md) —— 字段定义来源
- [spec-007 scenes 模块](./spec-007-scenes-module.md) —— 解锁条件引擎
- [`docs/product/content.md`](../product/content.md) —— 内容初稿（本 spec 的唯一权威来源）
- [`docs/architecture/data-model.md`](../architecture/data-model.md) —— 表字段语义

## 后续工作（不在本 spec 范围）

- 美术资源（10 场景插图 + 10 角色立绘）—— content.md §6.2 / §6.3
- 完整解锁矩阵（content.md §5）—— 由 spec-008 events 模块扩展
- prod migration apply —— v1 上线 checklist
- 内容中文化 / 多语言（v2+）
