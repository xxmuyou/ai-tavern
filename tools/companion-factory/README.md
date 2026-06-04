# companion-factory（临时内容播种工具，用完即删）

把"批量生成 prompt + 批量生图"这件**临时**的事独立成一个文件夹。它不进 pnpm workspace、零依赖（纯 Node ESM），删除时 `rm -rf tools/companion-factory` 即净，再回退产品侧那点 `wf_scene` 管线即可。

## 它做什么
1. 用你自己的 LLM key **批量起草** companion 人设 / 场景 → 落本地 JSON（`drafts/`）。
2. 你**手动编辑** `drafts/personas.json`、`drafts/scenes.json`：改名、删（把 `status` 设成 `"rejected"`）、调字段。
3. **发布**：驱动产品**现有**接口跑图，再把官方角色 / 场景行写进 D1。
   - 角色：`POST /companions/base-art/generate`(WF1 底图) → 轮询 → 写 `companions` 行 → `POST /admin/companions/{id}/emotion-art/prewarm`(WF2 表情)。
   - 场景：同一个 base-art 接口选 `wf_scene` 跑背景 → 写 `scenes` 行（解锁条件按 tier 推导）。

> 真正出图的是产品里配置的 RunningHub/OpenAI 工作流；本工具只负责"堆 prompt + 编排"。出图引擎、`wf_scene` 工作流属于产品永久基建，不在本文件夹内。

## 准备
1. `cp config.example.json config.json`（`config.json` 已 gitignore），填：
   - `apiBaseUrl`、`adminToken`（一个 admin 账号的 JWT）
   - `llm.{provider,apiKey,model,baseUrl}`
   - `wrangler.{dbName,configPath,remote}`（dev 用 `remote:false`）
2. 在 admin 工作流目录里配好 WF1 与 `wf_scene` 工作流，然后：
   ```bash
   node tools/companion-factory/factory.mjs models
   ```
   把对应的 option id 填进 `config.json` 的 `wf1Model` / `wfSceneModel`。

## 用法
```bash
cd <repo-root>
node tools/companion-factory/factory.mjs gen-personas --count 8 --brief "都市职场恋爱向，性别均衡"
node tools/companion-factory/factory.mjs gen-scenes   --count 6 --brief "游泳馆、台球厅、约会餐厅、野外爬山、酒店(intimate)"
# 编辑 drafts/*.json 审核
node tools/companion-factory/factory.mjs status
node tools/companion-factory/factory.mjs publish-personas
node tools/companion-factory/factory.mjs publish-scenes
```

发布是**断点续跑**的：每条处理完即写回 JSON，失败的标 `status:"failed"` 并记 `error`，重跑只处理未完成的。

## 注意
- 表情（WF2）在 worker 里**异步**完成，`publish-personas` 只负责入队。
- 场景非 `public` 档需要 `default_companions[0]` 作为解锁锚点；缺锚点则该场景留作不锁并告警。
- 默认写 **dev** 库（`remote:false`）。要写线上把 `wrangler.remote` 设 `true` 并确认 `dbName`。

## 收尾
内容播种完成后：`rm -rf tools/companion-factory`，并在一个单独 commit 里回退本工具相关改动（产品侧 `wf_scene` 管线保留）。
