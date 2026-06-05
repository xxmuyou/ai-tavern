# 管理员配置工作台（运行时运营设置）

> 本文档说明管理员工作台里的「运营设置」面板：它如何在**不改 wrangler/.env、不重新部署**的前提下覆盖非敏感运行时配置，可改哪些项，以及与 env / secret 的关系。密钥总清单与轮换见 [`secrets.md`](./secrets.md)，环境总览见 [`environments.md`](./environments.md)，部署见 [`deployment.md`](./deployment.md)。

---

## 1. 它解决什么问题

历史上所有配置都写在 `wrangler.jsonc` 的 `vars` / Wrangler secret / `.env.*` 里，改一项就要重新部署。管理员工作台引入了一个**非敏感运行时覆盖层**：管理员在网页后台改运营配置，写入 D1 的 `app_settings` 表，~30 秒内生效，无需 redeploy。

**这不取代 env，而是叠加在 env 之上。** env 仍是 bootstrap / 兜底来源；工作台负责运行期临时调整、应急切换、运营试错。

**RunningHub workflow 例外：** workflow 接线、workflow API contract、latent/KSampler 参数映射、checkpoint/LoRA catalog 与 Anime/Realistic asset lane 不是 secret，也不应长期放在 `.env.*` / `wrangler.jsonc vars` 里手写。它们属于“生图流水线拓扑与资产配置”，由 repo 中按环境区分的配置文件 seed 到 D1 catalog，也可在 Admin 里运行期调整。checkpoint 文件名只在 `image_models`；LoRA 文件名只在 `image_loras`；可用组合由 semantic workflow 下的 Anime/Realistic lane 决定。

**MiniMax voice catalog 例外：** TTS GroupId、model、默认 voice、语速档位与系统音色列表也不是 secret，但本阶段不放 Admin UI 管理。它们由 `config/minimax-voices.<env>.json` 随代码部署打包；Admin 只继续管理现有运营设置、生图 catalog 和 LLM 路由。

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
- **RunningHub catalog 例外：** repo 配置文件负责 seed 默认 workflow contract、checkpoints、LoRA 与 Anime/Realistic lanes，Admin 负责运行期管理。runtime 读 D1 catalog；secret 仍只走 Wrangler/env。

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
| `Portrait generation` | 生图 provider、RunningHub/OpenAI/R2 key 配置状态、workflow contract、checkpoint/LoRA catalog、semantic workflow 的 Anime/Realistic asset lanes、`View logs` 出图诊断浮窗 | `image_gen.*`、`image_models`、`image_loras`、`image_workflows`、lane membership tables、`image_generation_jobs` |
| `Prompts` | expression 立绘系统提示词；后续其他 prompt 也放这里 | `expression_prompts` |
| `Settings` | auth、billing、email、limits 等通用运营项 | `auth.*`、`billing.*`、`email.*`、`limits.*` |

新增通用配置项仍然只改 registry；如果它属于 LLM 或生图，应放入对应业务模块的过滤列表，而不是重新塞回 Settings。

后续 Web Admin 可以调整 sidebar、cards、tabs、表单样式和信息密度，但这些 UI 改动不改变 `source: db/env/unset` 语义，不改变 RunningHub catalog 的 workflow contract / checkpoint / LoRA / Anime-Realistic lane 分工，也不把 workflow/node 配置重新搬回 `.env.*`。

### 类型与交互

- **editable**（默认）：后台可保存 D1 覆盖；空值表示 Reset 回 env fallback（deployment-managed 项除外）。
- **status-only secret**（`adminMode: "status_only"`）：后台只显示 `Configured` / `Missing`，不回传值，不允许 **View**，不允许保存覆盖。真实值只走 env/Wrangler secrets。
- **RunningHub catalog**：配置文件 seed 默认值，Admin 可继续新增/调整 workflow contract、checkpoint、LoRA 和 Anime/Realistic lanes。
- **high 危险项**（`dangerLevel: "high"`，如 admin 邮箱 / CORS / 请求体上限）：保存前必须**输入该项的 key 名确认**，防误操作锁死自己。
- **json**（legacy `image_gen.workflows`）：仅作旧 runtime fallback；日常使用 Portrait generation 的 catalog UI，见 §6。
- **number / boolean / text**：分别为数字输入 / 开关 / 文本框。

### 生图日志诊断

Portrait generation 页面不直接铺开最近 job 列表；只保留 **View logs** 入口。点击后打开只读浮窗：

- 顶部选择一个本地自然日，只看该日 `created_at` 落入范围内的 jobs。
- `Failed` / `All` 切换仍保留；默认看失败日志。
- 列表默认只显示摘要：status、task、workflow、error code、创建时间。
- 点击单条日志展开完整详情：provider、model、provider task id、completed at、error message、prompt excerpt。

这个浮窗只做诊断，不承担配置保存。常见含义：

- `provider_not_configured` + `missing workflow id`：运行时 D1 `image_workflows` 里该 workflow 没有有效 `workflow_id`。即使 `config/runninghub-workflows.<env>.json` 已经写了值，也必须同步到 D1 catalog。
- `source_art_not_found` / `source_art_not_available`：源图 key 对后端不可访问；前端 bundle 能显示不代表 R2 里有同名对象。

---

## 4. 访问控制

- 前端：[`AdminGuard`](../../apps/app/components/AdminGuard.tsx) 要求登录 + `is_admin`，否则重定向 `/me`。
- 后端：所有 `/admin/*` 端点首行 `requireAdminUser(env, request)`（`ADMIN_EMAILS` env + `admin_user_allowlist` 表，任一命中即 admin）。
- **高危运营配置仍主要在 Web 端操作**：[原生 admin](../../apps/app/app/admin/index.tsx) 只挂 `Users` / `Chat models`。生图 workflow、prompts、Settings 这些更适合桌面管理。

---

## 5. 与 env / secret 的关系（SOT 调和）

- `.env.dev` / `.env.prod` 仍是**secret 与环境开关的 SOT**（见 [`secrets.md`](./secrets.md)）：首次部署、CI、Wrangler secret 注入都靠它，工作台为空时也靠它兜底。
- RunningHub workflow contract、checkpoint/LoRA 默认值、base architecture 和 Anime/Realistic lanes 来自 repo 中按环境区分的配置文件；部署时同步进 D1 catalog。它们不是 secret，也不属于 `.env.*`。
- 修改 `config/runninghub-workflows.dev.json` / `config/runninghub-workflows.prod.json` 后，必须执行 `pnpm sync:runninghub:dev` / `pnpm sync:runninghub:prod`，或走完整部署流程。运行时读取 D1 catalog，不直接读取 repo JSON。
- 工作台是**非敏感运行期覆盖**：应急切 provider、调限流、临时验证 workflow/node 接线，不想等一次完整部署时用。长期接线配置必须回写 repo。
- **secret 轮换只有一条权威路径**：走 `.env.*` + `pnpm upload:secrets:dev/prod` 或 `wrangler secret put` 注入 Wrangler secret（见 secrets.md §3）。后台不能查看、不能替换、不能临时覆盖 secret。

---

## 6. 生图配置：RunningHub semantic workflows + Anime/Realistic asset lanes（2026-06-04 修正）

> **重构背景：** 旧版把 checkpoint 录在多处，还曾把 style 名误当成 RunningHub node fieldName。2026-06-04 起统一改为：**semantic workflow 表达用途，base architecture 表达底模兼容边界，Anime/Realistic lane 表达资产类别，workflow API contract 是 nodeId/fieldName 的唯一事实来源**。不要再使用数字 workflow key，也不要再使用地区标签拆分二次元资产。

这一节回答常见疑问：**「我有 N 个基座和 N 个 LoRA，未来要批量出图，怎么管理才不靠记忆、不容易报错？」**

**结论：不要按 SDXL/SD/ILXL/FLUX 这类基座名推断 `prompt` / `text` / LoRA 字段，也不要按地区细分 Anime。** RunningHub 的 `nodeInfoList.fieldName` 必须来自该 workflow API JSON 中对应 `nodeId.inputs` 的真实 key。正确分工是：

- **semantic workflow 负责表达用途。** 例如 `portrait_create`、`chat_moment`、`companion_cutout`、`profile_outfit`。workflow key 必须可读，不能使用数字编号。
- **base architecture 负责底模兼容。** `sdxl` / `sd15` / `ilxl` / `flux1` 是独立字段，不是自由 tag。workflow、checkpoint、LoRA 必须三者一致；不一致不能保存、同步或入队。workflow 额外允许 `none`，表示 URL 输入型/无基座 workflow，不能绑定 checkpoint 或 LoRA。
- **Anime/Realistic lane 负责资产分类。** 每条有基座的 workflow 下只有 `Anime` 和 `Realistic` 两个主 lane；同一 architecture + 同一 lane 内的 active checkpoint 与 active LoRA 默认可以组合。`architecture=none` 的 workflow 不配置资产 lane。
- **workflow contract 负责不报节点错误。** 先从 RunningHub 拉取或导出 workflow API JSON，再校验 `nodeId + fieldName` 是否存在。
- **asset catalog 只保存文件名和展示信息。** checkpoint 文件名来自 `image_models.ckpt_name`；LoRA 文件名来自 `image_loras.lora_name`；它们不决定节点字段名。

禁止事项：

- 不使用数字编号式 workflow 命名。
- 不使用地区标签拆分 Anime；资产分类只允许 `anime` / `realistic`。
- 不把风格名、类别名、checkpoint id 或 LoRA id 写成 RunningHub `fieldName`。

### 6.1 配置分层

| 在哪配 | 配什么 | 长期来源 |
|--------|--------|------|
| Workflow contract | semantic key、`workflowId`、mode、`architecture`、可注入节点、latent/KSampler 参数映射、每个节点的 `inputs` 字段、contract hash、active/sort | RunningHub `getJsonApiFormat` + config seed + Admin 刷新 |
| Anime/Realistic lane | 某条 workflow 下的 `anime` / `realistic` 资产池 | config seed + Admin 管理 |
| Checkpoint catalog | `label`、`ckpt_name`、`architecture`、`style_family`、free tags、active/sort | `image_models`，由 config seed + Admin 管理 |
| LoRA catalog | `label`、`lora_name`、`architecture`、默认 strength、`style_family`、free tags、active/sort | `image_loras`，由 config seed + Admin 管理 |
| Lane membership | 某条 workflow 的某个 lane 包含哪些 checkpoint/LoRA | lane membership tables；批量出图前必须命中 |

Admin 的 Portrait generation 页面应围绕 workflow 展开：先选 semantic workflow 和底模架构，再选 `Anime` 或 `Realistic` lane，在 lane 里维护 checkpoint 与 LoRA 资产池。不要让运营人员维护三元组合表。

用户侧 discovery 和 Admin 资产主分类都只有 `Anime` / `Realistic`。自由 tags 只作补充备注，不能引入新的主分类。

### 6.2 Workflow contract 的防错原则

RunningHub 文档说明：workflow API JSON 里每个 `nodeId` 都有 `inputs`，`inputs` 的 key 才是可通过 `nodeInfoList` 覆盖的 `fieldName`。如果 API 格式工作流里找不到某个 `fieldName`，就不能通过 API 改它。参考：

- https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287336
- https://www.runninghub.cn/runninghub-api-doc-cn/api-425749014

因此，保存或同步 workflow 时必须校验：

```ts
nodeInfoList = [
  {
    nodeId: workflow.promptNodeId,
    fieldName: workflow.promptFieldName, // from contract, e.g. "text" or "prompt"
    fieldValue: prompt,
  },
  {
    nodeId: workflow.checkpointNodeId,
    fieldName: workflow.checkpointFieldName, // from contract
    fieldValue: checkpoint.ckpt_name,
  },
]
```

`promptFieldName` 可能是 `text`，也可能是 `prompt`，还可能是某个自定义节点的其他字段。不要在文档、配置或代码里写“某基座固定用 prompt/text 节点”。

> ⚠️ **任何 `nodeId + fieldName` 不存在于 workflow contract 时，都不能保存或入队。** 旧踩坑是把 style 标签误当成 checkpoint 节点字段，RunningHub 会拒绝：`NODE_INFO_MISMATCH(..., field_not_found_in_node_inputs)`。

### 6.3 标准运营步骤

1. 在 RunningHub 搭好 workflow，并在平台上手动成功跑通至少一次。
2. 把 `workflowId` 加到 repo 对应环境配置，或在 Admin 新增 semantic workflow；key 必须表达用途，例如 `portrait_create`。
3. 在 Admin 点击刷新 contract，或由 sync 脚本调用 RunningHub `getJsonApiFormat`，缓存 API JSON 里的节点与 inputs。
4. 从 contract 里选择 prompt、checkpoint、load image、negative prompt、LoRA、latent 宽高/batch、KSampler seed 等要覆盖的节点和字段。
5. 给有基座的 workflow、checkpoint、LoRA 填同一个底模架构，例如 `sdxl`。URL 输入型无基座 workflow 填 `none`，并保持 checkpoint/LoRA 绑定为空；`style_family` 不能代替 architecture。
6. 在该 workflow 下选择 `Anime` 或 `Realistic` lane。
7. 添加 checkpoint：记录 RunningHub 中的准确 `ckpt_name`，放入对应 lane。
8. 添加 LoRA：记录 RunningHub 中的准确 `lora_name`，填写默认 strength，放入对应 lane。第一阶段单次生成只支持 0-1 个 LoRA。
9. 批量出图前，系统先验证 workflow/checkpoint/LoRA architecture 一致，再验证 lane membership 和 contract；`architecture=none` 时拒绝任何 checkpoint/LoRA 绑定；latent/KSampler 参数字段也必须命中 contract，任一失败都拒绝入队。

### 6.4 接入「自己上传的 checkpoint」的步骤

1. 在 RunningHub 账号里上传 checkpoint 文件，记下它在 RunningHub 里的确切文件名（如 `myCustom_v1.safetensors`）。
2. 在 Portrait generation 里选择目标 semantic workflow 和 `Anime` / `Realistic` lane。
3. 在该 lane 新增 checkpoint：填 `label`、`ckpt_name`、`architecture`、`style_family`。
4. 确认目标 workflow 的 contract 中存在 checkpoint 节点及字段；从 contract 中选择 `checkpointNodeId` 与 `checkpointFieldName`。
5. 批量或用户创建时选这个 workflow/lane/checkpoint，就会用该 checkpoint 出图。

### 6.5 接入 LoRA 的步骤

1. 在 RunningHub 上传 LoRA，并按 RunningHub 文档在 workflow 中使用 `RHLoraLoader` 或对应 LoRA 节点。
2. 手动跑通 workflow 一次，确认该 LoRA workflow 可正常执行。
3. 刷新 workflow contract，确认 LoRA 节点和所有需要覆盖的字段都出现在 API JSON 的 `inputs` 中。
4. 在目标 workflow 的 `Anime` 或 `Realistic` lane 新增 LoRA：填 `lora_name`、`architecture`、默认 strength、`style_family`。
5. 同一 workflow + 同一 architecture + 同一 lane 内的 active LoRA 默认可与该 lane 的 active checkpoint 组合；发现个别坏组合时再引入 denylist，不把 denylist 当日常运营入口。

### 6.6 什么时候才真的要新建 workflow

- checkpoint 或 LoRA 属于不同底层架构，单纯换文件名跑不通，节点图、采样器、VAE、尺寸或 LoRA loader 都需要换。
- 同一架构下 prompt/checkpoint/LoRA 节点 contract 不同，也应新增 workflow 或刷新 contract 后单独管理。
- 做法：在 Admin 新增 semantic workflow，或在 `config/runninghub-workflows.<env>.json` 的 `workflows` 里加一个新 key；key 表达拓扑和用途，例如 `portrait_create`、`portrait_create_flux`、`companion_cutout`，不要把具体 checkpoint/LoRA 名塞进 key，也不要用数字编号。

### 6.7 官方素材与 R2

官方 seed companion / scene 的 `art_url` 保持稳定 key，例如 `portraits/aiko/neutral.webp`、`scenes/pier_coffee_shop.png`。这些 key 有两种消费者：

- 前端 `mediaSource()` 可把它们映射到 app bundle 里的本地静态资源。
- 后端 image-gen 只能读取 R2 object key、`/objects/...` URL 或外部 `https://...` URL。

因此，所有 `apps/app/assets/ai-companion/portraits/**` 和 `apps/app/assets/ai-companion/scenes/**` 中的官方素材，都必须以相同 object key 上传到当前环境 R2，并写入 `asset_objects`。如果只存在于前端 bundle，profile outfit、chat moment cutout、RunningHub signed URL / upload path 都会在后端报源图不可用。

同步命令：

```bash
bash ./scripts/upload-official-media.sh dev --dry-run
pnpm upload:official-media:dev
```

prod 同理使用 `prod` / `pnpm upload:official-media:prod`。
