# 归档说明（2026-05）

此目录下的文档**已作废**，仅供历史查考。

## 为什么归档

2026-05-20 起，项目进入重新规划阶段：
- 产品方向从"多 app 平台 + AI Companion 之一"调整为"AI Companion 单产品"
- 当前的 Chapter 1（综艺问答）/ Chapter 2（三场景约会）/ Chapter 3 玩法废弃
- 改造为"开放沙盒互动陪伴 RPG"

详见现行文档：[`docs/product/vision.md`](../../product/vision.md) 与 [`docs/architecture/overview.md`](../../architecture/overview.md)。

## 归档内容

- `apps/ai-companion.md` —— 旧产品规格（综艺 / 约会模型）
- `cloud/architecture.md` / `cloud/auth.md` / `cloud/environment.md` / `cloud/permissions.md` —— 旧云架构与运维笔记
- `specs/spec-001` ~ `spec-006` —— 旧 spec（其中 spec-005 LLM admin model 的设计**思想**被新 [`architecture/llm.md`](../../architecture/llm.md) 继承）

## 不要做的

- ❌ 不要再据此修改代码或更新这些归档文件
- ❌ 不要把新文档的链接指向归档（除明确"曾经如此"的引用）

## 可以做的

- ✅ 查看历史决策上下文
- ✅ 用于 git blame / 责任追溯
- ✅ 偶尔检查"原本是否做过类似事情"
