# spec-001: 清理 multi-app 抽象与 .orig 备份

> **类型：** 删除  |  **依赖：** 无  |  **估时：** 1-2 天  |  **状态：** ⚪ todo

---

## Context

当前代码包含两类"过度抽象"，需要先清理掉再进入后续 spec：

1. **multi-app 路由抽象** —— 旧设计假设这是个"多 app 平台"，路由用 `/apps/{appKey}/*` 和 `/api/{appKey}/*`。新决策（[`product/vision.md`](../product/vision.md)）明确**就是 AI Companion 单产品**，多 app 抽象作废。
2. **`.orig` 备份文件** —— 上一次重构留下的备份（`show-engine.ts.orig`、`AiCompanionScreen.tsx.orig` 等），保留只会让后续开发者困惑。

先清理这两块再做后续重构，避免被旧代码干扰。

---

## 目标

- 删除所有 `/apps/{appKey}` 与 `/api/{appKey}` 路由抽象
- 删除全部 `.orig` 备份文件
- 数据库 schema 中 `app_key` 字段（如果有）标记 deprecation（具体删除在 spec-003 一并做）
- typecheck + 现有测试通过

## 非目标

- ❌ 不改 chat/show 业务逻辑（spec-006 做）
- ❌ 不动 D1 schema（spec-003 做）
- ❌ 不删 `companion-engine.ts` 等 large 文件（后续 spec 重构）

---

## 改动清单

### A. 删除文件

```
packages/api/src/show-engine.ts.orig
apps/app/features/ai-companion/AiCompanionScreen.tsx.orig
（及任何其他 .orig 文件 —— 由 grep 确定）
```

执行前先 `find . -name "*.orig"` 确认全部清单，跟用户确认列表后再删。

### B. 删除 multi-app 路由

`packages/api/src/` 下任何引用：
- `appKey` 参数解析
- `/apps/{appKey}` 路由
- `/api/{appKey}` 路由
- multi-app 相关 middleware

具体文件待 grep 确认（建议执行 `grep -rn "appKey\|app_key\|/apps/" packages/api/src/` 找出）。

### C. 前端对应清理

`apps/app/` 下任何引用 `appKey` 的路由或 fetch 路径，改为直接调用根级 API（如 `/companions` 而不是 `/api/{appKey}/companions`）。

### D. 配置清理

- `infra/cloudflare/wrangler.jsonc` 中如有 multi-app 相关 routes，删除
- 任何环境变量提到 `APP_KEY`、`DEFAULT_APP_KEY` 的，删除

### E. 文档脚注

更新现有代码顶部注释，去掉 multi-app 假设。

---

## 实施步骤

1. **审计**：grep 全仓库找 `appKey` / `app_key` / `.orig`，列出全部出现位置
2. **与用户确认清单**：哪些一定删、哪些有疑问
3. **创建分支** `cleanup/spec-001-multi-app`
4. **批量删除 `.orig` 文件**（`git rm`）
5. **删除 multi-app 路由代码**（按 grep 清单）
6. **更新前端 fetch 路径**
7. **更新 wrangler.jsonc**
8. **跑 `pnpm typecheck && pnpm test`** —— 修复任何报错
9. **跑 `pnpm dev`** —— 本地启动确认无崩溃
10. **PR + 审阅 + merge**

---

## 验证方式

- [x] `find . -name "*.orig"` 输出为空
- [x] `grep -rn "appKey\|app_key\|/apps/" packages/api/src/ apps/app/` 输出为空（除测试或注释明确说明的）
- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 通过
- [x] `pnpm dev` 启动后 health check 正常
- [x] 现有的官方 demo 路径（如有）仍可访问

---

## 回滚

- 通过 git revert 此 commit
- `.orig` 文件可从 git 历史中恢复
- 不影响 D1 schema 或外部服务

---

## 依赖

- 无（这是第一个 spec）
- 阻塞后续：spec-002 / spec-003 等所有改造

---

## 注意

- 删除前用 grep 确认范围，避免误删测试或注释中合法引用
- multi-app 抽象删除后，数据库 `app_key` 字段（如果存在）暂不删除，等 spec-003 schema migration 一并清理
- 旧 `_archive/2026-05/specs/spec-001-local-cloud-resource-inventory.md` 是不同主题，与本 spec 无关
