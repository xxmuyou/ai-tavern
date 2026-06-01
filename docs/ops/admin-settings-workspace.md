# 管理员配置工作台（运行时运营设置）

> 本文档说明管理员工作台里的「运营设置」面板：它如何在**不改 wrangler/.env、不重新部署**的前提下覆盖非敏感运行时配置，可改哪些项，以及与 env / secret 的关系。密钥总清单与轮换见 [`secrets.md`](./secrets.md)，环境总览见 [`environments.md`](./environments.md)，部署见 [`deployment.md`](./deployment.md)。

---

## 1. 它解决什么问题

历史上所有配置都写在 `wrangler.jsonc` 的 `vars` / Wrangler secret / `.env.*` 里，改一项就要重新部署。管理员工作台引入了一个**非敏感运行时覆盖层**：管理员在网页后台改运营配置，写入 D1 的 `app_settings` 表，~30 秒内生效，无需 redeploy。

**这不取代 env，而是叠加在 env 之上。** env 仍是 bootstrap / 兜底来源；工作台负责运行期临时调整、应急切换、运营试错。

**RunningHub workflow/checkpoint 例外：** `workflowId`、`promptNodeId`、`checkpointNodeId`、`checkpointFieldName`、默认 `ckptName`、`loadImageNodeId` 不是 secret，但也不应长期放在 `.env.*` / `wrangler.jsonc vars` 里手写。它们属于“生图流水线拓扑配置”，标准来源应是 repo 中按环境区分的配置文件，部署时覆盖同步到 D1 `app_settings`。Admin 可临时编辑救急，但下一次部署会以 repo 配置为准。

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
- **deployment-managed 例外：** RunningHub workflow/node/checkpoint 配置读 D1，但长期 SOT 是 repo 配置文件。部署同步会覆盖 D1，避免 admin 临时修改漂移成“隐形生产配置”。

### ⚠️ 最容易踩的坑

> **可编辑配置存在 DB 覆盖时，改 `wrangler.jsonc` / `.env` / Wrangler secret 不会生效。**

如果你在工作台改过某个可编辑项（哪怕只是试一下），它就被钉在 DB 里了。之后你改 env 重新部署，运行时仍读 DB 值，会出现「改了 env 没反应」的现象。

**解法：** 在工作台对应行点 **Reset**（仅当 `source: "db"` 时出现）——它会删除 DB 覆盖，回退到 env 默认。判断当前到底读的是哪层，看每行的 **source 标签**（`admin` = DB / `env default` = env / `unset` = 都没有）。

对 RunningHub workflow/node/checkpoint 配置，不要靠 Reset 回 env。正确做法是改 repo 中对应环境的 RunningHub workflow 配置文件，然后重新部署/同步。Admin 临时保存只用于验证或救急。

---

## 3. 管理员后台现在按业务模块归类

配置项仍在 [`packages/api/src/settings/registry.ts`](../../packages/api/src/settings/registry.ts) 声明式注册，但 Web Admin 不再把所有 env/settings 平铺在一个页面里。后台按业务模块展示：

| Admin 模块 | 内容 | 对应配置 |
|------|------|------|
| `Users` | admin 名单、用户查询、积分调整、ledger | `admin_user_allowlist`、credits endpoints |
| `Chat models` | companion 对话/相关 LLM task 的 provider/model 路由、DeepSeek/OpenAI key 配置状态 | `llm_config`、`llm.*` |
| `Portrait generation` | 生图 provider、RunningHub/OpenAI/R2 key 配置状态、WF1/WF2 workflow/node/checkpoint 状态、WF1 模型目录 | `image_gen.*`、`image_models` |
| `Prompts` | expression 立绘系统提示词；后续其他 prompt 也放这里 | `expression_prompts` |
| `Settings` | auth、billing、email、limits 等通用运营项 | `auth.*`、`billing.*`、`email.*`、`limits.*` |

新增通用配置项仍然只改 registry；如果它属于 LLM 或生图，应放入对应业务模块的过滤列表，而不是重新塞回 Settings。

### 类型与交互

- **editable**（默认）：后台可保存 D1 覆盖；空值表示 Reset 回 env fallback（deployment-managed 项除外）。
- **status-only secret**（`adminMode: "status_only"`）：后台只显示 `Configured` / `Missing`，不回传值，不允许 **View**，不允许保存覆盖。真实值只走 env/Wrangler secrets。
- **deployment-managed**：RunningHub workflow/node/checkpoint 配置可在后台临时编辑，但部署同步会覆盖。不要把 admin 值当成长期配置来源。
- **high 危险项**（`dangerLevel: "high"`，如 admin 邮箱 / CORS / 请求体上限）：保存前必须**输入该项的 key 名确认**，防误操作锁死自己。
- **json**（目前仅 `image_gen.create_workflows`）：用专用的 per-style 编辑器，见 §6。
- **number / boolean / text**：分别为数字输入 / 开关 / 文本框。

---

## 4. 访问控制

- 前端：[`AdminGuard`](../../apps/app/components/AdminGuard.tsx) 要求登录 + `is_admin`，否则重定向 `/me`。
- 后端：所有 `/admin/*` 端点首行 `requireAdminUser(env, request)`（`ADMIN_EMAILS` env + `admin_user_allowlist` 表，任一命中即 admin）。
- **高危运营配置仍主要在 Web 端操作**：[原生 admin](../../apps/app/app/admin/index.tsx) 只挂 `Users` / `Chat models`。生图 workflow、prompts、Settings 这些更适合桌面管理。

---

## 5. 与 env / secret 的关系（SOT 调和）

- `.env.dev` / `.env.prod` 仍是**secret 与环境开关的 SOT**（见 [`secrets.md`](./secrets.md)）：首次部署、CI、Wrangler secret 注入都靠它，工作台为空时也靠它兜底。
- RunningHub workflow/node/checkpoint 配置的 SOT 是 repo 中按环境区分的 workflow 配置文件；部署时同步进 D1。它们不是 secret，但也不属于 `.env.*`。
- 工作台是**非敏感运行期覆盖**：应急切 provider、调限流、临时验证 workflow/node/checkpoint 配置，不想等一次完整部署时用。长期配置必须回写 repo。
- **secret 轮换只有一条权威路径**：走 `.env.*` + `pnpm upload:secrets:dev/prod` 或 `wrangler secret put` 注入 Wrangler secret（见 secrets.md §3）。后台不能查看、不能替换、不能临时覆盖 secret。

---

## 6. 生图配置：模型目录 + checkpoint 切换 How-to

这一节回答常见疑问：**「我想让用户选不同底模 / 用我自己上传的 checkpoint，要不要为每个 checkpoint 单独建一个 workflow？」**

**结论：同一架构下不需要。** 一个 style 共用一个 WF1 workflow，靠覆盖 checkpoint 节点的 checkpoint field 切换底模；默认 fieldName 是 `ckpt_name`，但以 repo workflow 配置为准。只有当 checkpoint 的**底层架构 / 节点图不同**（SD1.5 / SDXL / Flux / Pony 等需要不同采样器、VAE、分辨率）时，才需要另建 workflow。

### 6.1 两张配置的分工

| 在哪配 | 配什么 | 长期来源 |
|--------|--------|------|
| Repo RunningHub workflow config → deployment sync → D1 `app_settings` | 每个 style 的 `workflowId` / `promptNodeId` / **`checkpointNodeId`** / **`checkpointFieldName`** / 默认 **`ckptName`** | dev/prod workflow config 文件；D1 key 为 `image_gen.create_workflows` |
| Portrait generation → **WF1 model catalog** | 每个可选模型的 `label` / `style_tag` / **`ckpt_name`** | `image_models` 表（migration 0022） |

Admin 的 Portrait generation → RunningHub workflow/node 面板读取的是 D1 当前值，可用于查看、临时修复、现场验证。长期修改必须更新 repo 配置文件并部署同步，否则下次部署会被覆盖。

生成时后端 [`runninghub-provider.ts`](../../packages/api/src/image-gen/runninghub-provider.ts) 会下发：
```
nodeInfoList = [
  { nodeId: promptNodeId,     fieldName: "text",      fieldValue: prompt },
  { nodeId: checkpointNodeId, fieldName: checkpointFieldName, fieldValue: ckptName },  // ← 仅当 checkpointNodeId 已配
]
```
`checkpointFieldName` 默认是 `ckpt_name`。`ckptName` 优先级：请求级用户所选模型的 `ckpt_name` > workflow 配置里的默认 `ckptName`。

### 6.2 接入「自己上传的 checkpoint」的步骤

1. 在 **RunningHub 账号**里上传该 checkpoint 文件（应用本身不负责上传），记下它在 RunningHub 里的**确切文件名**（如 `myCustom_v1.safetensors`）。
2. 确认对应 style 的 WF1 workflow 里有一个 **Load Checkpoint 节点**，把它的节点 id、checkpoint fieldName（通常是 `ckpt_name`）写入对应环境的 RunningHub workflow 配置文件，并通过部署同步到 `image_gen.create_workflows`。
3. 在 Portrait generation → **WF1 model catalog** 新增一行：`label` 任取，`style_tag` 选**已配 checkpointNodeId 的那个 style**，`ckpt_name` 填第 1 步的文件名。
4. 完成——用户创建角色时选这个模型，就会用你的 checkpoint 出图。**不用新建 workflow。**

### 6.3 ⚠️ checkpointNodeId 依赖（静默失效已加警告）

如果某 style 的 WF1 workflow **没填 `checkpointNodeId`**，那么该 style 下所有模型的 `ckpt_name` 都会被**忽略**，悄悄用 workflow 内置的默认底模。

为此 Portrait generation 的 WF1 model catalog 会在受影响的模型行显示红色警告（`checkpoint_applies = false`），后端生成时也会 `console.warn` 留痕。看到警告就补对应环境的 RunningHub workflow 配置文件，再部署同步；admin 面板只用于临时验证。

### 6.4 什么时候才真的要新建 workflow

- checkpoint 属于**不同底层架构**，单纯换 `ckpt_name` 跑不通（节点图、采样器、VAE 都得换）。
- 当前 workflow 按 3 个固定 style（`realistic` / `anime_jp` / `anime_kr`）切。若出现「同 style 下要并存不同架构 checkpoint」的需求，需要扩展模型目录结构（让模型可绑定独立 workflowId）——这是后续工作，当前未实现。
