# 管理员配置工作台（运行时运营设置）

> 本文档说明管理员工作台里的「运营设置」面板：它如何在**不改 wrangler/.env、不重新部署**的前提下覆盖非敏感运行时配置，可改哪些项，以及与 env / secret 的关系。密钥总清单与轮换见 [`secrets.md`](./secrets.md)，环境总览见 [`environments.md`](./environments.md)，部署见 [`deployment.md`](./deployment.md)。

---

## 1. 它解决什么问题

历史上所有配置都写在 `wrangler.jsonc` 的 `vars` / Wrangler secret / `.env.*` 里，改一项就要重新部署。管理员工作台引入了一个**非敏感运行时覆盖层**：管理员在网页后台改运营配置，写入 D1 的 `app_settings` 表，~30 秒内生效，无需 redeploy。

**这不取代 env，而是叠加在 env 之上。** env 仍是 bootstrap / 兜底来源；工作台负责运行期临时调整、应急切换、运营试错。

**RunningHub workflow 例外：** workflow 接线（`workflowId`、`promptNodeId`、`checkpointNodeId`、`checkpointFieldName`、`loadImageNodeId`）不是 secret，也不应长期放在 `.env.*` / `wrangler.jsonc vars` 里手写。它们属于“生图流水线拓扑配置”，由 repo 中按环境区分的配置文件 seed 到 D1 catalog，也可在 Admin 里运行期调整。checkpoint 文件名只在 `image_models`；workflow 与 checkpoint 的可选关系在 `image_workflow_models`。

**API key / secret / signing key 不属于运行时覆盖层。** 这些值只通过 `.env.*`、Wrangler secrets、`pnpm upload:secrets:*` 或 `wrangler secret put` 管理。后台只显示它们是否已配置，不显示值，也不能编辑。

---

## 2. 三层优先级（务必理解）

大多数可编辑配置项按以下顺序解析（[`packages/api/src/settings/store.ts`](../../packages/api/src/settings/store.ts)）：

```
DB 覆盖 (app_settings 表)  →  env 兜底 (wrangler vars / secret)  →  unset
   source: "db"                    source: "env"                  source: "unset"
```

- **DB 覆盖优先级最高。** 一旦某项在工作台保存过，读取的就是 DB 值，env 被忽略。
- **缓存：** 设置在内存缓存 30 秒（`TTL_MS`），保存时立即失效。所以改动 ~30 秒内全量生效。
- **per-environment：** dev / prod 各自独立的 D1，互不影响。
- **status-only secret 例外：** API key / secret / signing key 永远只读 env/Wrangler secret，代码会忽略 D1 中同 key 的旧覆盖值。
- **RunningHub catalog 例外：** repo 配置文件负责 seed 默认 checkpoints/workflows/bindings，Admin 负责运行期管理。runtime 读 D1 catalog；secret 仍只走 Wrangler/env。

### ⚠️ 最容易踩的坑

> **可编辑配置存在 DB 覆盖时，改 `wrangler.jsonc` / `.env` / Wrangler secret 不会生效。**

如果你在工作台改过某个可编辑项（哪怕只是试一下），它就被钉在 DB 里了。之后你改 env 重新部署，运行时仍读 DB 值，会出现「改了 env 没反应」的现象。

**解法：** 在工作台对应行点 **Reset**（仅当 `source: "db"` 时出现）——它会删除 DB 覆盖，回退到 env 默认。判断当前到底读的是哪层，看每行的 **source 标签**（`admin` = DB / `env default` = env / `unset` = 都没有）。

对 RunningHub workflow/node 接线，不要靠 Reset 回 env。正确做法是改 repo 中对应环境的 RunningHub workflow 配置文件，然后重新部署/同步。Admin 临时保存只用于验证或救急。

---

## 3. 管理员后台现在按业务模块归类

配置项仍在 [`packages/api/src/settings/registry.ts`](../../packages/api/src/settings/registry.ts) 声明式注册，但 Web Admin 不再把所有 env/settings 平铺在一个页面里。后台按业务模块展示：

| Admin 模块 | 内容 | 对应配置 |
|------|------|------|
| `Users` | admin 名单、用户查询、积分调整、ledger | `admin_user_allowlist`、credits endpoints |
| `Chat models` | companion 对话/相关 LLM task 的 provider/model 路由、MiniMax/DeepSeek/OpenAI key 配置状态 | `llm_config`、`llm.*` |
| `Portrait generation` | 生图 provider、RunningHub/OpenAI/R2 key 配置状态、checkpoint catalog、workflow catalog、workflow-model 绑定 | `image_gen.*`、`image_models`、`image_workflows`、`image_workflow_models` |
| `Prompts` | expression 立绘系统提示词；后续其他 prompt 也放这里 | `expression_prompts` |
| `Settings` | auth、billing、email、limits 等通用运营项 | `auth.*`、`billing.*`、`email.*`、`limits.*` |

新增通用配置项仍然只改 registry；如果它属于 LLM 或生图，应放入对应业务模块的过滤列表，而不是重新塞回 Settings。

后续 Web Admin 可以调整 sidebar、cards、tabs、表单样式和信息密度，但这些 UI 改动不改变 `source: db/env/unset` 语义，不改变 RunningHub catalog 的 checkpoint / workflow / binding 三层分工，也不把 workflow/node 配置重新搬回 `.env.*`。

### 类型与交互

- **editable**（默认）：后台可保存 D1 覆盖；空值表示 Reset 回 env fallback（deployment-managed 项除外）。
- **status-only secret**（`adminMode: "status_only"`）：后台只显示 `Configured` / `Missing`，不回传值，不允许 **View**，不允许保存覆盖。真实值只走 env/Wrangler secrets。
- **RunningHub catalog**：配置文件 seed 默认值，Admin 可继续新增/调整 checkpoint、workflow 和绑定。
- **high 危险项**（`dangerLevel: "high"`，如 admin 邮箱 / CORS / 请求体上限）：保存前必须**输入该项的 key 名确认**，防误操作锁死自己。
- **json**（legacy `image_gen.workflows`）：仅作旧 runtime fallback；日常使用 Portrait generation 的 catalog UI，见 §6。
- **number / boolean / text**：分别为数字输入 / 开关 / 文本框。

---

## 4. 访问控制

- 前端：[`AdminGuard`](../../apps/app/components/AdminGuard.tsx) 要求登录 + `is_admin`，否则重定向 `/me`。
- 后端：所有 `/admin/*` 端点首行 `requireAdminUser(env, request)`（`ADMIN_EMAILS` env + `admin_user_allowlist` 表，任一命中即 admin）。
- **高危运营配置仍主要在 Web 端操作**：[原生 admin](../../apps/app/app/admin/index.tsx) 只挂 `Users` / `Chat models`。生图 workflow、prompts、Settings 这些更适合桌面管理。

---

## 5. 与 env / secret 的关系（SOT 调和）

- `.env.dev` / `.env.prod` 仍是**secret 与环境开关的 SOT**（见 [`secrets.md`](./secrets.md)）：首次部署、CI、Wrangler secret 注入都靠它，工作台为空时也靠它兜底。
- RunningHub workflow/checkpoint 默认值来自 repo 中按环境区分的配置文件；部署时同步进 D1 catalog。它们不是 secret，也不属于 `.env.*`。
- 工作台是**非敏感运行期覆盖**：应急切 provider、调限流、临时验证 workflow/node 接线，不想等一次完整部署时用。长期接线配置必须回写 repo。
- **secret 轮换只有一条权威路径**：走 `.env.*` + `pnpm upload:secrets:dev/prod` 或 `wrangler secret put` 注入 Wrangler secret（见 secrets.md §3）。后台不能查看、不能替换、不能临时覆盖 secret。

---

## 6. 生图配置：checkpoint catalog + workflow binding How-to（2026-06-02 修正）

> **重构背景：** 旧版把 checkpoint 录在多处，还曾把 `Realistic` / `Anime_JP` / `Anime_KR` 这类 style 名误当成 RunningHub node fieldName。现已统一成三层：checkpoint catalog、workflow catalog、workflow-model binding。详见 spec-022 顶部 2026-06-02 修正。

这一节回答常见疑问：**「我想让用户选不同底模 / 用我自己上传的 checkpoint，要不要为每个 checkpoint 单独建一个 workflow？」**

**结论：同一架构下不需要。** 先把 checkpoint 加到 catalog，再在 workflow 上勾选它。一条 WF1 workflow 靠 `checkpointNodeId` + `checkpointFieldName` 切底模；只有 checkpoint 的底层架构/节点图不同（SD1.5 / SDXL / Flux / Pony 等需要不同采样器、VAE、分辨率）时，才新增 workflow。

### 6.1 三层配置的分工

| 在哪配 | 配什么 | 长期来源 |
|--------|--------|------|
| Checkpoint catalog | `label` / `tag` / `ckpt_name` / active / sort | `image_models`，由 config seed + Admin 管理 |
| Workflow catalog | `workflowId` / node ids / `checkpointFieldName` / mode / active / sort | `image_workflows`，由 config seed + Admin 管理 |
| Workflow-model binding | 某条 workflow 可选哪些 checkpoint | `image_workflow_models`，由 config seed + Admin 多选管理 |

Admin 的 Portrait generation 页面分为 `Checkpoint catalog` 和 `RunningHub workflows`。先添加 checkpoint，再新增或编辑 workflow，并在 workflow 上多选可用 checkpoint。

用户侧 discovery 的风格 bucket 只有 `Anime` / `Realistic`。Admin 里仍可用 `Anime JP`、`Anime KR` 作为 checkpoint label，或用 `anime,jp` / `anime,kr` 作为 checkpoint tag；这些细分只服务模型管理，都会归入用户侧 `Anime` bucket。

> **关键边界：** checkpoint 文件名只在 model 上；checkpoint node fieldName 只在 workflow 上。不要把分类标签或 style 名填进 fieldName。

生成时后端 [`runninghub-provider.ts`](../../packages/api/src/image-gen/runninghub-provider.ts) 会下发：
```
nodeInfoList = [
  { nodeId: promptNodeId,     fieldName: "text",                       fieldValue: prompt },
  { nodeId: checkpointNodeId, fieldName: <workflow.checkpointFieldName>, fieldValue: <model.ckpt_name> },  // ← 仅当 workflow 配了 checkpointNodeId 且 model 选了 ckpt_name
]
```
`checkpointFieldName` 缺省为 `ckpt_name`。没有 model 选择就不注入 checkpoint。

> ⚠️ **`checkpointFieldName` 必须是 checkpoint 节点上真实存在的输入字段名**。填了节点上没有的字段名，RunningHub 会直接拒：`NODE_INFO_MISMATCH(..., field_not_found_in_node_inputs)`。`fieldName=Anime_JP` 代表旧数据把 style 名当字段名，应把 workflow 的 `checkpointFieldName` 设为真实字段（通常 `ckpt_name`）。

### 6.2 接入「自己上传的 checkpoint」的步骤

1. 在 **RunningHub 账号**里上传该 checkpoint 文件（应用本身不负责上传），记下它在 RunningHub 里的**确切文件名**（如 `myCustom_v1.safetensors`）。
2. 在 Portrait generation → `Checkpoint catalog` 新增一行：`label` 任取，`tag` 任意标注，`ckpt_name` 填第 1 步的文件名。
3. 确认目标 WF1 workflow 里有一个 **Load Checkpoint 节点**，在 `RunningHub workflows` 里填写 `checkpointNodeId` 和 `checkpointFieldName`（通常 `ckpt_name`）。
4. 在该 workflow 的 checkpoint 多选里勾选第 2 步新增的 checkpoint。
5. 完成——用户创建角色时选这个 workflow-model option，就会用你的 checkpoint 出图。

### 6.3 ⚠️ checkpointNodeId 依赖（静默失效已加警告）

如果某 create workflow **没填 `checkpointNodeId`**，那么它绑定的 checkpoint 文件名都会被**忽略**，悄悄用 workflow 内置的默认底模。

后端生成时会 `console.warn` 留痕。看到警告就补 workflow 的 checkpoint node id 和 fieldName。

### 6.4 什么时候才真的要新建 workflow

- checkpoint 属于**不同底层架构**，单纯换 `ckpt_name` 跑不通（节点图、采样器、VAE 都得换）。
- 做法：在 Admin 新增 workflow，或在 `config/runninghub-workflows.<env>.json` 的 `workflows` 里加一条新 key，并用 `modelIds` 绑定可用 checkpoint。

### 6.5 WF2（表情变体）

WF2 是 img2img workflow（载图 + prompt），当前不切 checkpoint、不绑定 model。表情语义由 Expression prompts 面板管理。
