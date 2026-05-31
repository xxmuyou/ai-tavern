# 管理员配置工作台（运行时运营设置）

> 本文档说明管理员工作台里的「运营设置」面板：它如何在**不改 wrangler/.env、不重新部署**的前提下覆盖运行时配置，可改哪些项，以及与 env / secret 的关系。密钥总清单与轮换见 [`secrets.md`](./secrets.md)，环境总览见 [`environments.md`](./environments.md)，部署见 [`deployment.md`](./deployment.md)。

---

## 1. 它解决什么问题

历史上所有配置都写在 `wrangler.jsonc` 的 `vars` / Wrangler secret / `.env.*` 里，改一项就要重新部署。管理员工作台引入了一个**运行时覆盖层**：管理员在网页后台改配置，写入 D1 的 `app_settings` 表，~30 秒内生效，无需 redeploy。

**这不取代 env，而是叠加在 env 之上。** env 仍是 bootstrap / 兜底来源；工作台负责运行期临时调整、应急切换、运营试错。

---

## 2. 三层优先级（务必理解）

每个配置项按以下顺序解析（[`packages/api/src/settings/store.ts`](../../packages/api/src/settings/store.ts)）：

```
DB 覆盖 (app_settings 表)  →  env 兜底 (wrangler vars / secret)  →  unset
   source: "db"                    source: "env"                  source: "unset"
```

- **DB 覆盖优先级最高。** 一旦某项在工作台保存过，读取的就是 DB 值，env 被忽略。
- **缓存：** 设置在内存缓存 30 秒（`TTL_MS`），保存时立即失效。所以改动 ~30 秒内全量生效。
- **per-environment：** dev / prod 各自独立的 D1，互不影响。

### ⚠️ 最容易踩的坑

> **存在 DB 覆盖时，改 `wrangler.jsonc` / `.env` / Wrangler secret 不会生效。**

如果你在工作台改过某项（哪怕只是试一下），它就被钉在 DB 里了。之后你改 env 重新部署，运行时仍读 DB 值，会出现「改了 env 没反应」的灵异现象。

**解法：** 在工作台对应行点 **Reset**（仅当 `source: "db"` 时出现）——它会删除 DB 覆盖，回退到 env 默认。判断当前到底读的是哪层，看每行的 **source 标签**（`admin` = DB / `env default` = env / `unset` = 都没有）。

---

## 3. 可改哪些项

配置项在 [`packages/api/src/settings/registry.ts`](../../packages/api/src/settings/registry.ts) 声明式注册，UI（[`SettingsSection.tsx`](../../apps/app/components/admin/SettingsSection.tsx)）按 6 个分组自动渲染：

| 分组 | 内容 | 备注 |
|------|------|------|
| `auth` | admin 邮箱、CORS origins、JWT key、Google OAuth | 多为高危 |
| `billing` | Stripe secret/webhook、各 Price ID、回跳 URL | |
| `image_gen` | RunningHub provider / api key / webhook / WF1 create workflows / WF2 节点 id | 见 §6 |
| `llm` | DeepSeek / OpenAI key | |
| `limits` | 各类速率与请求体上限 | 部分高危 |
| `email` | Resend key、发件地址 | |

新增配置项**只改 registry 一处**即可自动出现在 UI，无需动 UI 代码。

### 类型与交互

- **secret**（`type: "secret"`）：值**永不回传客户端**，API 只报 `is_set`。UI 显示 `•••••• set — type to replace`，输入新值即覆盖。
- **high 危险项**（`dangerLevel: "high"`，如 admin 邮箱 / JWT key / 请求体上限）：保存前必须**输入该项的 key 名确认**，防误操作锁死自己。
- **json**（目前仅 `image_gen.create_workflows`）：用专用的 per-style 编辑器，见 §6。
- **number / boolean / text**：分别为数字输入 / 开关 / 文本框。

---

## 4. 访问控制

- 前端：[`AdminGuard`](../../apps/app/components/AdminGuard.tsx) 要求登录 + `is_admin`，否则重定向 `/me`。
- 后端：所有 `/admin/*` 端点首行 `requireAdminUser(env, request)`（`ADMIN_EMAILS` env + `admin_user_allowlist` 表，任一命中即 admin）。
- **「运营设置」与「图像模型」面板目前只在 Web 端**：[原生 admin](../../apps/app/app/admin/index.tsx) 只挂了 `members` / `credits` / `llm`。这是有意拆分——运营配置在桌面操作更稳，移动端不暴露这些高危旋钮。

---

## 5. 与 env / secret 的关系（SOT 调和）

- `.env.dev` / `.env.prod` 仍是**本地与部署的 SOT**（见 [`secrets.md`](./secrets.md)）：首次部署、CI、Wrangler secret 注入都靠它，工作台为空时也靠它兜底。
- 工作台是**运行期覆盖**：应急切 provider、临时换 key、调限流，不想等一次完整部署时用。
- **secret 轮换有两条路**：① 长期/权威轮换走 `pnpm cf:secrets:prod` 注入 Wrangler secret（见 secrets.md §3）；② 应急可先在工作台覆盖。注意工作台覆盖后，记得最终把权威值写回 env 并 **Reset** 工作台项，避免两处漂移。

---

## 6. 生图配置：模型目录 + checkpoint 切换 How-to

这一节回答常见疑问：**「我想让用户选不同底模 / 用我自己上传的 checkpoint，要不要为每个 checkpoint 单独建一个 workflow？」**

**结论：同一架构下不需要。** 一个 style 共用一个 WF1 workflow，靠覆盖 checkpoint 节点的 `ckpt_name` 切换底模。只有当 checkpoint 的**底层架构 / 节点图不同**（SD1.5 / SDXL / Flux / Pony 等需要不同采样器、VAE、分辨率）时，才需要另建 workflow。

### 6.1 两张配置的分工

| 在哪配 | 配什么 | 文件 |
|--------|--------|------|
| Settings → Image generation → **WF1 create workflows**（json） | 每个 style 的 `workflowId` / `promptNodeId` / **`checkpointNodeId`** | `image_gen.create_workflows` |
| **Image models** 面板（WF1 模型目录） | 每个可选模型的 `label` / `style_tag` / **`ckpt_name`** | `image_models` 表（migration 0022） |

生成时后端 [`runninghub-provider.ts`](../../packages/api/src/image-gen/runninghub-provider.ts) 会下发：
```
nodeInfoList = [
  { nodeId: promptNodeId,     fieldName: "text",      fieldValue: prompt },
  { nodeId: checkpointNodeId, fieldName: "ckpt_name", fieldValue: ckptName },  // ← 仅当 checkpointNodeId 已配
]
```
`ckptName` 优先级：请求级用户所选模型的 `ckpt_name` > workflow 配置里的默认 `ckptName`。

### 6.2 接入「自己上传的 checkpoint」的步骤

1. 在 **RunningHub 账号**里上传该 checkpoint 文件（应用本身不负责上传），记下它在 RunningHub 里的**确切文件名**（如 `myCustom_v1.safetensors`）。
2. 确认对应 style 的 WF1 workflow 里有一个 **Load Checkpoint 节点**，把它的节点 id 填进 Settings → WF1 create workflows 的 `checkpointNodeId`。
3. 在 **Image models** 面板新增一行：`label` 任取，`style_tag` 选**已配 checkpointNodeId 的那个 style**，`ckpt_name` 填第 1 步的文件名。
4. 完成——用户创建角色时选这个模型，就会用你的 checkpoint 出图。**不用新建 workflow。**

### 6.3 ⚠️ checkpointNodeId 依赖（静默失效已加警告）

如果某 style 的 WF1 workflow **没填 `checkpointNodeId`**，那么该 style 下所有模型的 `ckpt_name` 都会被**忽略**，悄悄用 workflow 内置的默认底模。

为此 Image models 面板现在会在受影响的模型行显示红色警告（`checkpoint_applies = false`），后端生成时也会 `console.warn` 留痕。看到警告就去 Settings 给该 style 补 `checkpointNodeId`。

### 6.4 什么时候才真的要新建 workflow

- checkpoint 属于**不同底层架构**，单纯换 `ckpt_name` 跑不通（节点图、采样器、VAE 都得换）。
- 当前 workflow 按 3 个固定 style（`realistic` / `anime_jp` / `anime_kr`）切。若出现「同 style 下要并存不同架构 checkpoint」的需求，需要扩展模型目录结构（让模型可绑定独立 workflowId）——这是后续工作，当前未实现。
