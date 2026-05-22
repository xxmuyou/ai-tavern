# spec-014: Cloudflare custom domain 绑定

> **类型：** 配置  |  **依赖：** — （独立，可任意时间开）  |  **估时：** 1 天  |  **状态：** ⚪ todo（详细）

---

## Context

目前 dev/prod 的 web 前端通过 `*.xtbit-apps.pages.dev` 临时域名访问，worker 通过 `aiappsbox.com/api/*` 路由暴露（已配，见 `infra/cloudflare/wrangler.jsonc`）。但 Pages 前端的真实域名（`aiappsbox.com` / `dev.aiappsbox.com`）尚未绑定到 Pages 项目，且 prod worker 的 `ALLOWED_ORIGINS`、`AUTH_SUCCESS_URL`、`STRIPE_*_URL` 还指向 `aiappsbox.com`（已是目标域，但 Pages 前端没接上）。

v1 RC 上线 [`README.md §4`](./README.md#4-v1-上线门槛) 要求所有配置 checklist 清零，自定义域是其中一项。本 spec 定义"把 `aiappsbox.com` / `dev.aiappsbox.com` 真正绑定到 Pages + 验证 worker 路由可达 + 跑通跨域回调"所需的全部步骤。

不动 DNS 之外的产品代码。本 spec 是纯运维配置 + 配置文件 commit。

---

## 目标

- prod 前端可经 `https://aiappsbox.com` 访问，dev 前端可经 `https://dev.aiappsbox.com` 访问
- prod worker 可经 `https://aiappsbox.com/api/*` 访问，dev worker 可经 `https://dev.aiappsbox.com/api/*` 访问（已是当前 routes 配置）
- 自动 TLS（Cloudflare Universal SSL）+ HSTS 启用 + HTTP → HTTPS 自动 301
- OAuth callback (`/auth/oidc/google/callback`) 与 Magic Link verify (`/auth/email/verify`) 在真实域名下回跳成功
- Stripe webhook (`/billing/webhook`) 在 Stripe Dashboard 上注册到 `https://aiappsbox.com/api/billing/webhook`
- 浏览器开发者工具：response headers 包含 `cf-ray`、`strict-transport-security`、`content-security-policy`（可选）

## 非目标

- ❌ Email 域名（如 `mail.aiappsbox.com`）配置 —— Resend 自有 sender domain
- ❌ Apex 域 `aiappsbox.com` 用作邮件 MX —— 仅 web/api
- ❌ CDN 缓存策略调整 —— Pages + Worker 默认即可
- ❌ Cloudflare Workers Custom Domain（worker.aiappsbox.com）—— 不需要，worker 走 zone routes
- ❌ 多区域 Anycast 调优 —— Cloudflare 默认 PoP
- ❌ 自动续期 TLS（Cloudflare 自动 90 天续）

---

## 改动清单

| 路径 / 资源 | 操作 |
|---|---|
| **Cloudflare DNS** | 新增 4 条记录（见 §实施步骤 1） |
| **Cloudflare Pages → xtbit-apps 项目** | "Custom domains" 添加 `aiappsbox.com`（prod 分支）、`dev.aiappsbox.com`（dev 分支） |
| **Cloudflare Workers** | worker routes 已配，仅需确认 `*.aiappsbox.com/api/*` 命中 prod、`dev.aiappsbox.com/api/*` 命中 dev |
| **Cloudflare SSL/TLS** | 设 "Full (strict)" 模式；开 HSTS（max-age=31536000；includeSubDomains；preload） |
| **Cloudflare Rules → Page Rules / Bulk Redirects** | 强制 HTTP → HTTPS（Always Use HTTPS = ON） |
| **Stripe Dashboard → Developers → Webhooks** | 端点 URL 改为 `https://aiappsbox.com/api/billing/webhook`，签名 secret 同步到 `STRIPE_WEBHOOK_SECRET` |
| **Google Cloud Console → OAuth 2.0 client** | Authorized redirect URI 加 `https://aiappsbox.com/api/auth/oidc/google/callback` 和 `https://dev.aiappsbox.com/api/auth/oidc/google/callback` |
| **Resend → Sender domain** | 验证 `aiappsbox.com` 或 `mail.aiappsbox.com`（SPF / DKIM 记录） |
| `infra/cloudflare/wrangler.jsonc` | 无修改 —— `ALLOWED_ORIGINS` / `AUTH_SUCCESS_URL` / `STRIPE_*_URL` 已是目标域 |
| `apps/app/.env.dev` / `apps/app/.env.prod` | 确认 `EXPO_PUBLIC_API_URL` 指向新域（dev: `https://dev.aiappsbox.com/api`、prod: `https://aiappsbox.com/api`） |

---

## 实施步骤

### 1. DNS 记录（Cloudflare DNS for `aiappsbox.com` zone）

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| CNAME | `aiappsbox.com` (apex / `@`) | `xtbit-apps.pages.dev` | Proxied (orange cloud) | Auto |
| CNAME | `dev` | `xtbit-apps.pages.dev` | Proxied | Auto |
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:dmarc@aiappsbox.com` | — | Auto |
| TXT | `@` (SPF) | `v=spf1 include:resend.com -all` | — | Auto |

> Pages 默认会为每个 custom domain 自动颁发 SSL 证书，无需手工签发。

### 2. Cloudflare Pages 项目绑定 custom domain

在 Cloudflare Dashboard → Workers & Pages → `xtbit-apps` 项目 → Custom domains：

1. Add custom domain → `aiappsbox.com` → 选 production branch（prod 分支）
2. Add custom domain → `dev.aiappsbox.com` → 选 dev 分支
3. 等候 Cloudflare 自动校验 DNS + 颁发证书（一般 < 5 分钟）

### 3. Cloudflare SSL/TLS 设置

- Dashboard → SSL/TLS → Overview：**Full (strict)**
- Edge Certificates → Always Use HTTPS：**On**
- Edge Certificates → HSTS：**Enable**，max-age = 12 months，include subdomains = On，preload = On
- Edge Certificates → Minimum TLS Version：**TLS 1.2**
- Edge Certificates → Automatic HTTPS Rewrites：**On**

### 4. Worker routes 验证

`infra/cloudflare/wrangler.jsonc` 已有：

```jsonc
// dev
"routes": [{ "pattern": "dev.aiappsbox.com/api/*", "zone_name": "aiappsbox.com" }]
// prod
"routes": [{ "pattern": "aiappsbox.com/api/*", "zone_name": "aiappsbox.com" }]
```

跑 `pnpm deploy:api:dev` 后 Cloudflare Dashboard → Workers → `xtbit-apps-api` → Routes 应列出 dev pattern。手工 deploy prod 后同理。

### 5. 外部 provider 重定向 URI / Webhook 注册

- **Google OAuth**：Google Cloud Console → APIs & Services → Credentials → 选 OAuth 2.0 client → Authorized redirect URIs 添加两条
- **Stripe**：Stripe Dashboard → Developers → Webhooks → Add endpoint → 填 `https://aiappsbox.com/api/billing/webhook`，监听 `customer.subscription.*`、`invoice.*`、`checkout.session.completed` 事件 → 复制 signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET --env production`
- **Resend**：Resend Dashboard → Domains → Add → `aiappsbox.com` → 按提示加 SPF + DKIM 记录到 Cloudflare DNS → 等候验证通过

### 6. 前端环境变量同步

确认 `apps/app/.env.dev` 与 `apps/app/.env.prod` 中：

```bash
EXPO_PUBLIC_API_URL=https://dev.aiappsbox.com/api    # dev
EXPO_PUBLIC_API_URL=https://aiappsbox.com/api        # prod
```

### 7. 端到端验证

参见下节 §验证方式。

---

## 验证方式

### DNS / TLS

```bash
dig +short aiappsbox.com
dig +short dev.aiappsbox.com
# 两条都应返回 Cloudflare Anycast IP

curl -I https://aiappsbox.com
# 期望：HTTP/2 200，含 strict-transport-security 头

curl -I http://aiappsbox.com
# 期望：HTTP/1.1 301 → https://aiappsbox.com/
```

### Worker 端点

```bash
curl https://aiappsbox.com/api/health
# 期望：{"ok":true,"service":"xtbit-apps-api",...}

curl https://dev.aiappsbox.com/api/health
# 期望：dev 环境响应
```

### OAuth 回跳

浏览器打开 `https://aiappsbox.com`：
1. 点 Google 登录
2. 跳转到 Google 同意页
3. 同意后回到 `https://aiappsbox.com/auth/success#token=...`
4. localStorage 拿到 token，跳首页

### Magic Link

```bash
curl -X POST https://aiappsbox.com/api/auth/email/send-link \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","redirect_to":"https://aiappsbox.com/"}'
# 期望：{"ok":true,"sent":true}
# 检邮箱收到从 no-reply@aiappsbox.com 发的邮件
# 点链接 → 跳 https://aiappsbox.com/auth/success#token=...
```

### Stripe webhook

Stripe Dashboard → Developers → Webhooks → 选 endpoint → Send test event (`customer.subscription.created`)。Cloudflare worker tail 应看到 `/api/billing/webhook` 收到请求，返回 200。

### Pages build

Push 一个 commit 到 main → Cloudflare Pages 自动 build → 部署完成后访问 `https://aiappsbox.com` 看到最新页面。

---

## 回滚

- **DNS**：删除 Cloudflare DNS 中的 apex CNAME + dev CNAME（10 分钟内全球传播）；前端回退到 `*.xtbit-apps.pages.dev`
- **Pages**：解除 custom domain 绑定（Custom domains → Remove）
- **Worker routes**：暂时无需回滚（routes 即便对应 DNS 不存在也不影响 worker 本身）
- **Stripe webhook**：Dashboard → 暂停 endpoint 或改回旧地址
- **Google OAuth**：Console 删除新 redirect URI
- **wrangler.jsonc**：把 `ALLOWED_ORIGINS` / `AUTH_SUCCESS_URL` 等改回 `*.xtbit-apps.pages.dev`，re-deploy

回滚不可逆步骤：HSTS preload 一旦提交到 `hstspreload.org`，浏览器会硬编码 HTTPS 6 个月以上，回滚到 HTTP 不可能。**v1 上线前若仍可能放弃 `aiappsbox.com` 域，先不要 preload**。

---

## 依赖

- 无 spec 依赖
- 外部依赖：拥有 `aiappsbox.com` 域名所有权 + Cloudflare 账户能管理该 zone
- 外部账号：Google Cloud Console（OAuth）、Stripe（webhook）、Resend（email sender domain）

## 后续工作

- spec-015 EAS Build：iOS/Android 客户端的 deep link / universal link 也需要 `aiappsbox.com` 域配置
- `docs/ops/secrets.md` 把 `STRIPE_WEBHOOK_SECRET`、`GOOGLE_OAUTH_CLIENT_SECRET`、`EMAIL_PROVIDER_API_KEY` 实际值灌到 prod 环境
- 监控：Cloudflare Analytics → Pages 流量、Worker 流量、错误率
