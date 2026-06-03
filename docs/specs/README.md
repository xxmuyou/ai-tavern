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

**当前 UI 原则（2026-05）：** 从 spec-018 起，产品 UI 工作优先 Web 桌面端。Web 与 mobile 可以是完全不同的 UI；共享 API/hooks/session/types，Web 页面使用 `*.web.tsx` 和 `components/web/*`，mobile/native 页面使用默认 `.tsx`，mobile UI 日后单独规划。

| # | Spec | 类型 | 依赖 | 估时 | 状态 |
|---|------|------|------|------|------|
| 001 | [清理 multi-app 抽象与 .orig 备份](./spec-001-cleanup-multi-app.md) | 删除 | — | 1-2 天 | 🟢 done |
| 003 | [D1 schema reset（清库重建 v1 结构）](./spec-003-d1-schema-reset.md) | 重建 | 001 | 2-3 天 | 🟢 done |
| 007 | [scenes 模块新建](./spec-007-scenes-module.md) | 新建 | 003 | 2-3 天 | 🟢 done |
| 004 | [companions 角色卡简化（15+ → 6 字段，7 维度对齐）](./spec-004-companions-simplify.md) | 改写 | 003 | 2-3 天 | 🟢 done |
| 005 | [relationships 模块拆出](./spec-005-relationships-module.md) | 重构 | 003, 004 | 1-2 天 | 🟢 done |
| 002 | [LLM 多供应商抽象层](./spec-002-llm-multi-provider.md) | 重写 | 001, 003 | 3-5 天 | 🟢 done |
| 006 | [chat 重写（去掉章节制，场景内自由对话）](./spec-006-chat-rewrite.md) | 重写 | 002, 003, 005, 007 | 5-7 天 | 🟢 done |
| 008 | [events 模块新建](./spec-008-events-module.md) | 新建 | 003, 005, 006, 007 | 3-5 天 | 🟢 done |
| 009 | [Auth OIDC + Magic Link](./spec-009-auth-oidc-magic-link.md) | 新建 | 003 | 5-7 天 | 🟢 done |
| 010 | [Stripe Billing + Entitlements + Quota 计量](./spec-010-billing-entitlements-quota.md) | 新建 | 003, 009 | 5-7 天 | 🟢 done |
| 011 | [admin 端点（LLM 配置 + 测试）](./spec-011-admin-llm-endpoints.md) | 新建 | 002 | 2 天 | 🟢 done |
| 012 | [Expo app UI 重做（场景列表 + 角色页 + 进度条 + 对话）](./spec-012-expo-ui-rewrite.md) | 重写 | 004, 005, 006, 007, 010 | 7-10 天 | 🟢 done |
| 013 | [v1 内容 seed migration（10 场景 + 10 角色）](./spec-013-v1-content-seed.md) | 新建 | 003, 004, 007 | 1-2 天（+美术周期） | 🟢 done |
| 014 | [Cloudflare custom domain 绑定](./spec-014-cloudflare-custom-domain.md) | 配置 | — | 1 天 | ⚪ todo（详细） |
| 015 | [iOS / Android EAS Build pipeline](./spec-015-eas-build-pipeline.md) | 新建 | 012 | 3-5 天 | ⚪ todo（详细） |
| 016 | [本地密钥管理收敛（.env.dev SOT + sync）](./spec-016-local-secrets-mgmt.md) | 新建 | — | 0.5 天 | ⚪ todo（详细） |
| 017 | [恋爱偏好 + 加权 spawn（5 男 5 女）](./spec-017-romance-preference.md) | 新建 | 004, 007, 013 | 0.5-1 天 | 🟡 in-progress |
| 018 | [Web 桌面工作台 UI 独立化](./spec-018-web-ui-workspace.md) | 重做 | 012 | 5-8 天 | 🟡 in-progress |
| 019 | [User/VIP Companion Creation UI](./spec-019-companion-create-ui.md) | 新建 | 004, 010, 018 | 5-7 天 | 📝 draft |
| 020 | [Companion 美术生成（文生图创建 + 风格 + 表情变体 + 透明 + 编辑接口）](./spec-020-companion-emotion-art-generation.md) | 新建 | 004, 006, 010, 019, 021 | 5-8 天 | 📝 draft |
| 021 | [Credits Ledger and Metering](./spec-021-credits-ledger-and-metering.md) | 新建 | 010 | 5-8 天 | 🟢 done |
| 022 | [Image Gen Provider: RunningHub（3 workflow + 风格 checkpoint）](./spec-022-image-gen-runninghub-integration.md) | 新建 | 020, 021 | 3-5 天 | 🟡 in-progress（WF-1 create + checkpoint 切换 + WF1 模型目录落地，待回填 workflow id 端到端验证；WF-2/3 待做） |
| 023 | [Admin Workspace（管理员工作台：积分查看/调整）](./spec-023-admin-workspace.md) | 新建 | 009, 021 | 2-3 天 | 🟡 in-progress（积分端点 + 单测落地；工作台已扩展 Settings/图像模型/表情/LLM，见 [ops/admin-settings-workspace](../ops/admin-settings-workspace.md)） |
| 024 | [聊天内关系可见化 + 每轮反馈（沉浸感阶段 0）](./spec-024-in-chat-relationship-feedback.md) | 前端接线 | 006, 005, 012 | 2-3 天 | 🟡 in-progress（两端接线+HUD+每轮反馈已落地，typecheck/lint 通过，待运行端到端验证） |
| 025 | [角色深度 + 解锁系统（沉浸感阶段 1）](./spec-025-character-depth-and-unlocks.md) | 后端+前端 | 004, 006, 005, 013, 019, 024 | 6-9 天 | 🟡 in-progress（persona 字段+prompt 强化+解锁系统全链路已落地，API 366 单测通过、两端 typecheck/lint 通过，待运行端到端验证；表情/场景的 Pro 门禁见实现记录待确认） |
| 026 | [Companion Story Beats（角色剧情拍框架）](./spec-026-companion-story-beats.md) | 后端+前端+内容 | 005, 006, 007, 008, 024, 025 | 4-6 天 | 🟢 done（基础 story beat 框架、scene active beat、chat prompt 注入、官方示例 seed 已完成；自建角色剧情见 029） |
| 027 | [Chat Moment Images（场景聊天瞬间图）](./spec-027-chat-moment-images.md) | 后端+前端+image-gen | 006, 007, 020, 022, 024, 026 | 3-5 天 | 🟡 in-progress（最新 companion 回复旁小相机按钮；根据聊天/行为/场景/时间/人物/状态生成完整场景图） |
| 028 | [剧情引导与行动按钮重构（Web 优先）](./spec-028-guided-story-actions-ui.md) | 前端体验/UI | 024, 025, 026 | 2-3 天 | 🟡 in-progress（统一剧情拍/关系目标/日常状态的下一步引导，重排 Today/Scene/Chat 行动按钮） |
| 029 | [User-created Story Arcs（自建角色剧情线与剧情包）](./spec-029-user-created-story-arcs.md) | 后端+前端+LLM+内容 | 002, 010, 019, 021, 026, 028 | 5-8 天 | 🟡 in-progress（自建角色剧情包、轻量编辑、Pro-only AI draft、手动完成节点、公开角色可选共享已接线；待端到端 QA） |

**估时总计：** 约 60-88 工程日（不含美术、QA、市场准备）

---

## 3. 并行路径

可以并行的几组：

- **A 路径（基础）：** 001 → 003 → 007 → 004 → 005 → 002 → 006 → 008
- **B 路径（auth/billing）：** 003 → 009 → 010
- **C 路径（场景）：** 003 → 007 → 008
- **D 路径（内容）：** 003 → 004 → 013
- **E 路径（前端）：** 等 004 + 005 + 006 + 007 + 010 完成后开 012
- **E2 路径（Web UI）：** 012 → 018，优先把 Web 做成桌面工作台；mobile UI 另开后续 spec
- **F 路径（部署）：** 014 + 015 可任意时间开（独立基础）
- **G 路径（开发体验）：** 016 独立可开（密钥管理收敛，不阻塞他者）
- **H 路径（自创角色商业化）：** 019 → 021 → 020 → 022，先完成创建 UI 和积分账本，再接角色美术生成；spec-020 用 mock provider 跑通链路（文生图创建 + 风格 + 表情变体 + 透明背景 + 编辑接口），spec-022 接入首个真实 image gen provider（RunningHub，3 个 workflow create/variation/edit + 3 风格 checkpoint 参数）。积分账本（021）落地后可并行开 spec-023（管理员查看/调整用户积分）
- **I 路径（管理员后端）：** 011（LLM 端点，已 done）+ 023（积分查看/调整），管理员后端能力统一沿用 `requireAdminUser` 与 `admin/` 分派模式，UI 归 spec-018
- **J 路径（自建角色剧情）：** 019 → 026 → 028 → 029。spec-026 提供通用 story beat 基础设施，spec-028 负责把下一步行动讲清楚，spec-029 让自建角色拥有剧情包、用户自写 arc、AI 辅助草稿与手动完成机制。自建角色不再按“纯 sandbox + 数值”作为长期路线。

---

## 4. v1 上线门槛

下列 spec 全部 `done` 后可考虑 v1 RC：

- 001 ~ 016 全部完成
- E2E 测试通过（至少：登录 → 进场景 → 与官方角色对话 → 触发事件 → 数值变化 → 订阅）
- 内容 seed（10 场景 + 10 角色 + 美术资源）就位
- 若以“AI 聊天向养成游戏”作为 v1.x 体验验收口径，spec-028 与 spec-029 需要进入 RC 前检查项：用户必须知道下一步做什么，自建角色必须能拥有可推进剧情线。
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
- 📝 **draft** — 已展开但未开始实施
- 📝 **stub** — 仅占位，未展开

---

## 6. 与归档 spec 的关系

旧 spec（spec-001 ~ spec-006，2026-05 前）已归档到 [`docs/_archive/2026-05/specs/`](../_archive/2026-05/specs/)。

- 大部分**作废**（综艺玩法 / 章节制相关）
- 部分**思想被继承**：
  - 旧 spec-005 LLM admin model selection → 新 [`spec-002`](./spec-002-llm-multi-provider.md) + [架构/llm.md](../architecture/llm.md)
  - 旧 spec-003 Stripe webhook → 新 spec-010

不要直接引用归档 spec 作为现行依据。
