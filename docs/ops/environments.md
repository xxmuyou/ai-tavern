# 环境配置

> 本文档定义本地 / dev / prod 三套环境的配置、域名、资源。部署流程见 [`deployment.md`](./deployment.md)，密钥管理见 [`secrets.md`](./secrets.md)。

---

## 1. 三环境总览

| 项 | local | dev | prod |
|----|-------|-----|------|
| **目的** | 开发调试 | 集成验证、内测 | 用户访问 |
| **API URL** | `http://localhost:8787` | `dev.aiappsbox.com/api` | `aiappsbox.com/api` |
| **Web URL** | `http://localhost:8081` | `dev.aiappsbox.com` | `aiappsbox.com` |
| **D1** | `xtbit-dev-local` | `xtbit-dev` | `xtbit-prod` |
| **R2** | `xtbit-assets-local` | `xtbit-assets-dev` | `xtbit-assets-prod` |
| **KV** | `xtbit-kv-local` | `xtbit-kv-dev` | `xtbit-kv-prod` |
| **Durable Object** | local 实例 | dev 命名空间 | prod 命名空间 |
| **Stripe** | test mode | test mode | live mode |
| **LLM** | dev key（DeepSeek） | dev key | prod key（独立计费） |
| **iOS / Android** | Expo Go / dev client | EAS dev build / TestFlight / Play Internal | App Store / Play Store |

**域名状态：** `aiappsbox.com` 已注册并接管在 Cloudflare。Worker / Pages 的具体 custom domain 路由按下文 §3.2 / §4.1 配置。

---

## 2. 本地开发

### 2.1 前置要求

- **WSL（Windows Subsystem for Linux）**（本项目强制：用户偏好/历史决策；不在 PowerShell / CMD 中开发）
- Node.js >= 22
- pnpm >= 9
- Cloudflare Wrangler CLI（`pnpm add -g wrangler`，或通过 workspace 依赖间接调用）

### 2.2 环境文件

```
.env.local                  ← 本地开发覆盖（git ignored）
.env.dev                    ← 远端 dev 部署/secret sync（git ignored）
.env.prod                   ← 远端 prod 部署/secret sync（git ignored）
```

**真实 secret 不进 git**，统一在 `secrets.md` 管理。

### 2.3 启动

```bash
pnpm install
cp .env.example .env.local
pnpm local  # 同时启 API:8787 + App:8081
```

启动脚本 `scripts/local-dev.sh` 会：
1. 启动 Wrangler dev (API)
2. 启动 Expo Web dev (App)
3. 监听日志（`tmp/local.log`）
4. 进程退出时清理两个子进程

### 2.4 本地登录

localhost 不走 Google OIDC，也不发送真实 Magic Link 邮件。打开 `http://localhost:8081/auth/login` 后使用同一套邮箱登录表单：

| 邮箱 | 本地身份 |
|------|----------|
| `admin@test.com` | admin + Pro，可进入后台 |
| `vip@test.com` | 普通 Pro/VIP 用户，不是 admin |
| `custom@test.com` | 普通 free 用户 |
| 其他合法邮箱 | 普通 free 用户 |

直登只在 API 请求 host 为 `localhost` / `127.0.0.1` / `[::1]` 且 `APP_ENV !== "prod"` 时生效。`dev.aiappsbox.com` 和 `aiappsbox.com` 仍走真实 Google OIDC + Magic Link。

### 2.5 本地数据

- D1：使用 Wrangler 本地 SQLite 文件（`.wrangler/state/d1/`）
- R2：本地模拟（Wrangler 内置）
- KV：本地模拟
- Migrations：`pnpm cf:d1:migrate:local`

---

## 3. Dev 环境

### 3.1 用途

- 集成验证（前后端 + Stripe webhook + LLM 真实调用）
- 内测（团队成员、早期 beta 用户）
- 真实 LLM 调用（用 test/dev key，单独配额）

### 3.2 域名规划

- Web: `dev.aiappsbox.com`（Cloudflare Pages 自定义域）
- API: `dev.aiappsbox.com/api/*`（同域 `/api/*` 路由到 Worker）
- Stripe webhook 回调: `https://dev.aiappsbox.com/api/billing/webhook`（统一路径；不使用旧 `/billing/stripe/webhook`）

**绑定步骤：**
1. 在 Cloudflare 注册 / 接管域名 `aiappsbox.com`
2. 在 Pages 项目里加 custom domain `dev.aiappsbox.com`
3. 在 Worker 配置 `dev.aiappsbox.com/api/*` route
4. SSL 自动签发

### 3.3 Cloudflare 资源

通过 `infra/cloudflare/wrangler.jsonc` 配置：

```jsonc
{
  "env": {
    "dev": {
      "name": "xtbit-api-dev",
      "vars": { "ENVIRONMENT": "dev" },
      "d1_databases": [{ "binding": "DB", "database_name": "xtbit-dev", "database_id": "..." }],
      "r2_buckets": [{ "binding": "ASSETS", "bucket_name": "xtbit-assets-dev" }],
      "kv_namespaces": [{ "binding": "CACHE", "id": "..." }],
      "queues": { "producers": [...], "consumers": [...] },
      "durable_objects": { "bindings": [...] }
    }
  }
}
```

资源 ID 与 secret 不写在文件里 → 见 `secrets.md` §2 推荐做法。

### 3.4 部署

```bash
pnpm deploy:api:dev    # API 到 dev
pnpm deploy:web:dev    # Web 到 dev (Cloudflare Pages)
```

详见 [`deployment.md`](./deployment.md)。

### 3.5 数据隔离

- dev 数据库与 prod 完全独立
- 不会从 prod 拷贝数据到 dev（避免泄露真实用户数据）
- dev 与 prod 注册方式相同（Magic Link + Google OIDC），不启用 localhost 邮箱直登；admin 权限通过 `ADMIN_EMAILS` env var 或 `admin_user_allowlist` 表控制

---

## 4. Prod 环境

### 4.1 域名规划

- API: `aiappsbox.com/api/*`
- Web: `aiappsbox.com`
- Stripe webhook: `https://aiappsbox.com/api/billing/webhook`（统一路径；不使用旧 `/billing/stripe/webhook`）
- Google OAuth redirect URI: `https://aiappsbox.com/api/auth/oidc/google/callback`
- Apple Sign-In return URL: `https://aiappsbox.com/api/auth/oidc/apple/callback`（spec-009 只预留 provider contract）

### 4.2 资源创建顺序

prod 环境**首次部署前**需要按顺序创建：

1. Cloudflare 账户 + 域名接管
2. D1 数据库（`wrangler d1 create xtbit-prod`）→ 拿到 database_id
3. R2 bucket（`wrangler r2 bucket create xtbit-assets-prod`）
4. KV namespace（`wrangler kv:namespace create xtbit-kv-prod`）→ 拿到 id
5. Queues + Durable Objects（按 wrangler.jsonc 自动）
6. 把上述资源 ID 填进 `wrangler.jsonc` 的 prod env 块
7. **首次部署后**，运行 migrations：`pnpm cf:d1:migrate:prod`
8. 配置 secrets（见 `secrets.md`）
9. 配置自定义域（API + Web）
10. 配置 Stripe live mode + webhook endpoint
11. 配置 Apple Sign-In + Google OAuth（指向 prod 回调）
12. 提交 EAS Build → App Store / Play Store

### 4.3 Stripe live 切换

**先 dev / test 跑通之后再切：**

| 项 | test | live |
|----|------|------|
| Publishable key | `pk_test_...` | `pk_live_...` |
| Secret key | `sk_test_...` | `sk_live_...` |
| Webhook signing secret | `whsec_...test` | `whsec_...live` |
| Product / Price IDs | test 环境的 | live 环境的（需要重新创建） |

**切换 checklist：**
- [ ] 在 Stripe 后台切到 live mode
- [ ] 重新创建 Product `AI Companion Subscription`
- [ ] 重新创建 Price `$9.99/month`，记下 `price_xxx`
- [ ] 创建 webhook endpoint，复制 signing secret
- [ ] 把上述写入 prod secrets
- [ ] 切换前先空跑 1 次（仅 test 用户购买 → 确保 webhook 路径正确）

### 4.4 数据保护

- D1 自动备份（Cloudflare 内置，30 天保留）
- 每周手动导出 critical 表到 R2 archive（cron 自动化）
- R2 启用 versioning（对象误删可恢复）
- 用户数据删除请求（GDPR / 用户主动）走 admin 流程

---

## 5. 环境变量与 secret 命名

详细清单见 `secrets.md`。

**约定：**
- 应用代码通过 `env.DEEPSEEK_API_KEY` 等访问
- secret 名全大写 + 下划线
- dev / prod 共用变量名，值不同
- 公共非 secret 信息（如 publishable key）直接写 `wrangler.jsonc` 的 `vars`
- 真正的 secret 用 `wrangler secret put` 注入

---

## 6. 从旧 environment.md 修复的问题

参考 `_archive/2026-05/docs/cloud/environment.md`（归档后路径）中以下信息**作废**：

- ❌ "Dev web preview uses a Pages-generated domain" —— 新 dev 域统一为 `dev.aiappsbox.com`
- ❌ "Current dev Stripe return URLs point to a Pages-generated domain" —— 切到新域后更新
- ❌ "spec-002 假设 `dev.aiappsbox.com/api/*` 已配好" —— 实际未配，需走 §3.2 流程
- ❌ "测试 Stripe key 之前粘贴过需轮换" —— 走 `secrets.md` §3 轮换流程

---

## 7. 待最终敲定

- [ ] 是否注册 `aiappsbox.com`，或换其他域
- [ ] dev / prod 数据库是否需要异地备份（不在 Cloudflare 内）
- [ ] 各 Cloudflare 资源的 region 选择（默认 auto，是否锁定到 WNAM 或 EU）
- [ ] 是否需要 staging 环境（v1 简化为 local / dev / prod 三段，未来加 staging）
