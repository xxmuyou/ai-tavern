# spec-003: D1 schema reset（清库重建 v1 结构）

> **类型：** 重建  |  **依赖：** spec-001  |  **估时：** 2-3 天  |  **状态：** ⚪ todo

---

## Context

当前 D1 migrations 里混有旧 multi-app、综艺章节制、AI Companion 早期模型等历史结构。产品所有者已确认：当前阶段可以清空 local / dev 数据库重建，不需要旧数据平滑迁移。

本 spec 的目标是先把 v1 数据库结构一次性定稳，避免后续 LLM、scenes、chat、billing、frontend 都围绕半旧半新的表工作。

---

## 目标

- 用干净的 v1 D1 schema 支撑 [`architecture/data-model.md`](../architecture/data-model.md) 中的核心表
- local / dev 数据库允许清空重建，旧数据不保留
- 删除现行运行路径对旧 multi-app schema 的依赖，尤其是 `apps` / `app_key` / show chapter 相关表
- 提供 seed：admin、默认 LLM 配置、基础系统配置
- `pnpm cf:d1:migrate:local` 后，本地 API 能启动并访问 health/config 类基础端点
- `pnpm cf:d1:migrate:dev` 前必须显式确认 dev 可清空

## 非目标

- ❌ 不做旧数据 backfill 或兼容迁移
- ❌ 不碰 prod 数据库；prod reset 必须另开上线前 checklist 并再次确认
- ❌ 不实现业务模块逻辑（companions / scenes / chat / billing 后续 spec 做）
- ❌ 不放真实 secret 或环境资源 ID 到 migration

---

## 改动清单

### A. Migration 策略

采用**清库重建**策略，而不是在旧 schema 上渐进修补。

实施时二选一，优先选 A：

- **A. 重建 local / dev D1 数据库**：保留旧 migration 文件作历史参考，创建新的 v1 baseline migration，并在新/清空后的 D1 上应用。
- **B. destructive reset migration**：新增一条 migration，显式 drop 旧表后创建 v1 表。只有在 Cloudflare dev D1 不方便重建时使用。

无论选哪种，都要在 PR 描述里写清楚采用的方式。

### B. v1 核心表

至少落地以下表，字段以 [`architecture/data-model.md`](../architecture/data-model.md) 为准：

```
users
user_identities
sessions
companions
scenes
relationships
threads
messages
events
subscriptions        -- spec-010 会替换为 billing_* 新 schema
usage_log
llm_logs
llm_config
admin_users
```

如果实施时发现表名或字段需要调整，先更新 `architecture/data-model.md`，再写 migration，不能让文档和 schema 分叉。

### C. Seed 数据

必须包含：

- `llm_config` 默认 task 配置：`chat`、`signal`、`summary`、`character-assist`
- admin 初始入口：`admin@aiappsbox.com` 对应的初始化策略
- 最小可运行的官方内容占位：后续 `spec-013` 会补完整 10 场景 + 10 角色，但本 spec 至少要能让 scenes/companions 模块在空库下返回稳定空列表或占位数据

### D. 旧 schema 退场

清理目标包括：

- `apps` / `app_key` 多 app 抽象
- `ai_tv_dating_*` 旧综艺玩法表
- `show_*` 章节制调度表
- 旧 companion 平台中不再被 v1 模型使用的表

若某个旧表暂时保留，必须在本 spec 的实现 PR 里说明原因与删除时间点。

---

## 实施步骤

1. 完成 `spec-001`，确保代码里 multi-app 路由和 `.orig` 文件先清掉
2. 根据 `architecture/data-model.md` 冻结 v1 表结构
3. 选择 reset 方式：优先重建 local / dev D1；否则写 destructive reset migration
4. 编写 v1 baseline migration，包含表、索引、必要约束和 seed
5. 清空并重建本地 D1 状态，执行 `pnpm cf:d1:migrate:local`
6. 运行 API typecheck 和现有测试
7. 启动本地 API，验证 health/config 类基础端点不因空库报错
8. 在 dev 执行前再次确认"dev 数据可清空"，然后执行 `pnpm cf:d1:migrate:dev`
9. 在 PR 中记录：reset 方式、被删除的旧表、保留的旧表、后续依赖 spec

---

## 验证方式

- [x] `pnpm cf:d1:migrate:local` 在清空后的本地 D1 上成功
- [x] local D1 中存在 v1 核心表，旧 multi-app/show/ai_tv_dating 表不存在或有明确保留说明
- [x] `llm_config` 至少包含 4 个默认 task
- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 通过
- [x] 本地 API 启动后基础端点可访问，不因空库崩溃
- [x] dev reset 前有人工确认记录，prod 未被修改

---

## 回滚

- local：删除本地 D1 state 后重新应用上一版 migrations
- dev：如采用重建 D1，保留旧 database id 直到新 dev 验证通过；若采用 destructive migration，回滚只能从 Cloudflare 备份或重新建库恢复
- prod：本 spec 不触碰 prod

---

## 依赖

- ⬅️ 阻塞于：spec-001
- ➡️ 阻塞：spec-002、spec-004、spec-005、spec-006、spec-007、spec-008、spec-009、spec-010、spec-013

---

## 注意

- 不要修改已应用过的历史 migration 来"假装从头就是新 schema"，除非明确决定清空并重建所有目标环境
- 不要把真实用户数据、secret、Cloudflare resource id 写进 seed
- 本 spec 完成后，后续 spec 不应再读取旧 `app_key` / show chapter 表
