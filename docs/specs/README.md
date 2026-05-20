# v1 实施 Spec 清单

> 本目录定义从当前代码状态走到 v1 上线的具体实施任务。每个 spec 聚焦一块代码改造，独立可执行。
>
> **不在此目录的：** 产品定义（见 [`docs/product/`](../product/)）、架构设计（见 [`docs/architecture/`](../architecture/)）、运维（见 [`docs/ops/`](../ops/)）。本目录只放"接下来 N 周要写哪些代码"。

---

## 1. 当前代码状态简述

参考 [`docs/architecture/overview.md §7`](../architecture/overview.md#7-当前代码状态对照2026-05-20-快照)：约 60% 旧代码保留，40% 改写 / 新建。

**保留：** auth、Cloudflare 基建、Expo 三端框架  
**大手术：** scenes / chat / events / llm / multi-app 抽象删除  
**小手术：** companions 角色卡简化、relationships 拆模块、billing 补完整

---

## 2. Spec 路线图

按推荐执行顺序排列。编号用于追踪主题，不强制代表执行先后；若依赖关系冲突，以本表顺序与"依赖"列为准。

**当前执行原则：** 接受 local / dev 数据库清空重建，不做旧数据平滑迁移；不接受半成品 spec 作为 done。

| # | Spec | 类型 | 依赖 | 估时 | 状态 |
|---|------|------|------|------|------|
| 001 | [清理 multi-app 抽象与 .orig 备份](./spec-001-cleanup-multi-app.md) | 删除 | — | 1-2 天 | 待办（详细） |
| 003 | [D1 schema reset（清库重建 v1 结构）](./spec-003-d1-schema-reset.md) | 重建 | 001 | 2-3 天 | 待办（详细） |
| 007 | scenes 模块新建 | 新建 | 003 | 2-3 天 | 待办（stub，提前） |
| 004 | companions 角色卡简化（15+ → 6 字段，7 维度对齐） | 改写 | 003 | 2-3 天 | 待办（stub） |
| 005 | relationships 模块拆出 | 重构 | 003, 004 | 1-2 天 | 待办（stub） |
| 002 | [LLM 多供应商抽象层](./spec-002-llm-multi-provider.md) | 重写 | 001, 003 | 3-5 天 | 待办（详细） |
| 006 | chat 重写（去掉章节制，场景内自由对话） | 重写 | 002, 003, 005, 007 | 5-7 天 | 待办（stub） |
| 008 | events 模块新建 | 新建 | 003, 007 | 3-5 天 | 待办（stub） |
| 009 | OIDC 集成（Google + Apple + Email Magic Link） | 新建 | 003 | 5-7 天 | 待办（stub） |
| 010 | Stripe billing + 配额计量（KV） | 新建 | 003, 009 | 5-7 天 | 待办（stub） |
| 011 | admin 端点（LLM 配置 + 测试） | 新建 | 002 | 2 天 | 待办（stub） |
| 012 | Expo app UI 重做（场景列表 + 角色页 + 进度条 + 对话） | 重写 | 004, 005, 006, 007, 010 | 7-10 天 | 待办（stub） |
| 013 | v1 内容 seed migration（10 场景 + 10 角色） | 新建 | 003, 004, 007 | 1-2 天（+美术周期） | 待办（stub） |
| 014 | Cloudflare custom domain 绑定 | 配置 | — | 1 天 | 待办（stub） |
| 015 | iOS / Android EAS Build pipeline | 新建 | 012 | 3-5 天 | 待办（stub） |

**估时总计：** 约 45-65 工程日（不含美术、QA、市场准备）

---

## 3. 并行路径

可以并行的几组：

- **A 路径（基础）：** 001 → 003 → 007 → 004 → 005 → 002 → 006 → 008
- **B 路径（auth/billing）：** 003 → 009 → 010
- **C 路径（场景）：** 003 → 007 → 008
- **D 路径（内容）：** 003 → 004 → 013
- **E 路径（前端）：** 等 004 + 005 + 006 + 007 + 010 完成后开 012
- **F 路径（部署）：** 014 + 015 可任意时间开（独立基础）

---

## 4. v1 上线门槛

下列 spec 全部 `done` 后可考虑 v1 RC：

- 001 ~ 015 全部完成
- E2E 测试通过（至少：登录 → 进场景 → 与官方角色对话 → 触发事件 → 数值变化 → 订阅）
- 内容 seed（10 场景 + 10 角色 + 美术资源）就位
- v1 上线 checklist（[`ops/secrets.md §5`](../ops/secrets.md#5-待获取--待配置v1-上线前-checklist)）全部清零
- 不允许任何 spec 以"临时 hard-code / console fallback / 后续再接表"作为 done 状态

---

## 5. Spec 写作约定

每个 spec 文档必须包含：

- **Context** —— 为什么做这件事（链接到产品 / 架构 / ops 决策）
- **目标 / 非目标** —— 范围明确
- **改动清单** —— 哪些文件 / 表 / 端点 / 配置变动
- **实施步骤** —— 可按顺序执行的 todo
- **验证方式** —— 怎么验证 spec 完成
- **回滚** —— 出错怎么撤
- **依赖** —— 引用哪些其他 spec / 文档

### 状态标记

- 🟢 **done** — 已实施 + 验证
- 🟡 **in-progress** — 正在做
- 🔴 **blocked** — 等其他 spec / 决策
- ⚪ **todo** — 待开始
- 📝 **stub** — 仅占位，未展开

---

## 6. 与归档 spec 的关系

旧 spec（spec-001 ~ spec-006，2026-05 前）已归档到 [`docs/_archive/2026-05/specs/`](../_archive/2026-05/specs/)。

- 大部分**作废**（综艺玩法 / 章节制相关）
- 部分**思想被继承**：
  - 旧 spec-005 LLM admin model selection → 新 [`spec-002`](./spec-002-llm-multi-provider.md) + [架构/llm.md](../architecture/llm.md)
  - 旧 spec-003 Stripe webhook → 新 spec-010

不要直接引用归档 spec 作为现行依据。
