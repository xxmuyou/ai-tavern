# spec-009: Auth OIDC + Magic Link

> **类型：** 新建  |  **依赖：** spec-003  |  **估时：** 5-7 天  |  **状态：** 🟢 done（Google OIDC + Magic Link + localhost 邮箱直登）

---

## Context

v1 需要真实账号体系承接后续 billing、配额、跨设备进度和 admin 权限。旧的本地调试登录不能作为生产登录：用户可以直接输入 email，服务端也没有可撤销 session、第三方身份绑定、Magic Link 一次性 token、或 `/auth/me` 这样的统一会话入口。

`0001_v1_baseline.sql` 已经预留 `users`、`user_identities`、`sessions` 三张表；[`architecture/api.md §2`](../architecture/api.md#2-auth-端点) 也定义了 OIDC、Magic Link、logout、me 的方向。本 spec 把 auth 做成可维护模块，先落地 **Google OIDC + Resend Magic Link + JWT session revoke**。Apple Sign-In 在本 spec 中只定义 provider contract 和配置边界，不作为 done 阻塞项；移动端 native 深链也不纳入本 spec，先服务 Web 回调。

---

## 关键决策（实施前已敲定）

下面 8 条是 spec 评审阶段已决断的边界，实施时不必再问：

1. **旧 JWT 兼容**：一刀切。`JWT_SIGNING_KEY` 上线即生效，所有现存（`AUTH_TOKEN_SECRET` 签发、无 `jti`）token 一律 401，用户重登。代码层不留 "无 jti 即跳过 sessions 查询" 的兼容分支。
2. **旧本地登录端点已移除**：dev 和 prod 环境均使用 Magic Link + Google OIDC 正式登录。localhost 通过 `POST /auth/email/send-link` 的邮箱直登分支签发真实 session。测试 token 通过 `issueTestSessionToken()` 内部函数签发（仅测试套件用）。
3. **verify/callback 302 时相对 redirect**：worker 用 `AUTH_SUCCESS_URL` 的 origin 拼出完整 URL 再放进 `Location` 头。`AUTH_SUCCESS_URL` 必须是绝对 URL（启动时校验，否则 500 `auth_success_url_invalid`）。
4. **Web callback 落点页（`/auth/success`）**：整体推迟到 spec-012。本 spec 的 verify/callback 仍按既定方案 302 到 fragment URL；落点页 404 是预期，不阻塞 spec-009 完成。
5. **fragment 字段格式**：`token`、`expires_at`、`email` 三个字段都放 fragment。`expires_at` 用 ISO 字符串（与 session response JSON 一致），需 URL-encode。
6. **callback 失败响应**：所有 OAuth / Magic Link 流程错误一律 302 到 `${AUTH_SUCCESS_URL}?error=<code>`，前端在落点页读 query 展示。error code 枚举固定（不暴露内部异常文本）。
7. **dev 环境数据隔离**：不需要表名/字段前缀——wrangler 已物理隔离 dev/prod 的 D1 (`xtbit-apps-dev` vs `xtbit-apps-prod`) 与 KV namespace。
8. **admin 动态名单**：`dev_login_allowlist` 表已重命名为 `admin_user_allowlist`（migration 0013）。admin 身份由两部分决定：`ADMIN_EMAILS` env var（built-in，不可被 UI 删除）+ `admin_user_allowlist` DB 表（动态，可在 Admin 页面增删）。dev/prod 注册方式统一为 Magic Link + Google OIDC，不限制注册邮箱（白名单仅控制 admin 权限）。localhost 的 `admin@test.com` 会自动写入动态 admin 名单。

---

## 目标

- 将现有 `packages/api/src/auth.ts` 拆成可维护的 `auth/` 模块，避免把 OIDC、Magic Link、session、identity 全塞进一个文件
- 新增端点：
  - `GET /auth/oidc/google/start?redirect=...`
  - `GET /auth/oidc/google/callback?code=...&state=...`
  - `POST /auth/email/send-link`
  - `GET /auth/email/verify?token=...`
  - `POST /auth/logout`
  - `GET /auth/me`
- app session 继续使用 `Authorization: Bearer <JWT>`，但 JWT 必须包含 `sub/email/jti/iat/exp`
- 每次签发 JWT 同步写入 `sessions`，logout 将当前 `jti` 标记为 revoked
- 使用 `user_identities` 记录 `google` 与 `email` 登录身份；同 email 自动合并到同一个 `users` 记录
- Google OIDC 必须验证 `id_token` 签名、issuer、audience、expiration，并要求 `email_verified=true`
- Magic Link 使用 Resend 发送邮件；token 只存 hash 到 KV，15 分钟 TTL，一次性使用
- `redirect` 参数必须做白名单校验，防 open redirect
- 更新 API、ops/env 文档，使实现者不会误接 native deep link 或未定 provider

## 非目标

- ❌ Apple Sign-In 完整实现（只定义 provider interface、env 字段、测试占位）
- ❌ Expo native OAuth/deep link 登录流程
- ❌ 短码交换式 callback（`callback -> code -> token`）
- ❌ 用户名/密码、邮件验证码、短信登录
- ❌ 账号合并确认 UI（v1 自动按 normalized email 合并）
- ❌ 前端完整登录 UI 与 Web callback 落点页 `/auth/success`（fragment 解析、token 存储、错误展示均推迟到 spec-012；本 spec 仅提供 client helper）
- ❌ refresh token / rolling session（v1 JWT 固定 30 天）

---

## 改动清单

### A. 模块结构

把现有 `packages/api/src/auth.ts` 拆成目录模块：

```text
packages/api/src/auth/
├── index.ts          # 路由聚合；导出 requireAuthUser / requireAdminUser 等公共守卫
├── session.ts        # JWT 签发/校验、jti、sessions 写入与 revoke
├── repository.ts     # users / user_identities / sessions 数据访问
├── oauth.ts          # OAuth state、redirect 校验、provider 分派
├── providers.ts      # Google provider 实现 + Apple provider contract 占位
├── email-link.ts     # Magic Link token、Resend 发送、verify
├── redirects.ts      # redirect allowlist 与成功页拼装
├── guards.ts         # requireAuthUser / requireAdminUser / isAdminUser 守卫
└── types.ts          # AuthEnv、AuthPayload、IdentityProvider 等共享类型
```

`index.ts` 保持现有导出名兼容调用方：

- `handleAuthRequest(request, env, pathname)`
- `requireAuthEmail(env, request, fallbackEmail?)`
- `optionalAuthEmail(env, request, fallbackEmail?)`
- `requireAuthUser(env, request, fallbackEmail?)`
- `optionalAuthUser(env, request, fallbackEmail?)`
- `requireAdminUser(env, request, fallbackEmail?)`
- `requireAdminEmail(env, request, fallbackEmail?)`
- `isDevRuntime(env)`
- `isAdminEmail(env, email)`

这样 `scenes`、`companions`、`relationships`、`chat`、`events` 不需要改 import 语义。

### B. Dependencies

允许在 `@xtbit/api` 增加运行时依赖：

```json
{
  "dependencies": {
    "jose": "^6"
  }
}
```

用途：

- 验证 Google `id_token` 的 JWK/JWT
- 未来 Apple provider 生成 client secret、验证 `id_token`
- 签发/验证 app session JWT，避免继续手写安全敏感代码

不允许为了 OAuth 引入大型 Web 框架或 Node-only SDK；代码必须兼容 Cloudflare Workers。

### C. Session JWT

JWT payload：

```ts
type AuthPayload = {
  sub: string;       // users.id
  email: string;     // normalized users.email
  jti: string;       // sessions.jwt_jti
  iat: number;       // unix seconds
  exp: number;       // unix seconds, 30 days by default
};
```

签发流程：

1. 生成 `sessionId = crypto.randomUUID()` 与 `jti = crypto.randomUUID()`
2. 计算 `issuedAt` / `expiresAt`
3. `INSERT INTO sessions (id, user_id, jwt_jti, created_at, expires_at)`
4. 使用 `JWT_SIGNING_KEY` 签发 HS256 JWT
5. 返回统一 session response：

```json
{
  "token": "...",
  "expiresAt": "2026-06-20T00:00:00.000Z",
  "email": "player@example.com",
  "user": { "id": "u_...", "email": "player@example.com" }
}
```

校验流程：

1. 读取 `Authorization: Bearer <token>`
2. 校验签名、`exp`、payload shape
3. 查 `sessions`：`jwt_jti = payload.jti AND user_id = payload.sub`
4. 若 session 不存在、过期、或 `revoked_at IS NOT NULL`，返回 401
5. 返回 user record

配置：

- 主 secret：`JWT_SIGNING_KEY`
- 迁移兼容：如果缺少 `JWT_SIGNING_KEY`，允许读取旧 `AUTH_TOKEN_SECRET` **仅用于签发**（避免 deploy 顺序问题）；校验路径只信任新 payload shape（必须含 `jti`）
- prod 两者都缺失时返回 500 `auth_secret_missing`
- dev/local 两者都缺失时允许使用现有 dev fallback secret，但测试必须覆盖 prod 缺失失败

**旧 token 一刀切**：

- 上线即所有现存 token 失效（旧 token payload 无 `jti`，校验时 `sessions` 查不到 → 401）
- 代码层**不留** "无 jti 即跳过 sessions 查询" 的兼容分支
- ops 在发布前需公告用户重登；prod 当前几乎无活跃用户，影响面可接受

### D. Identity Repository

新增 repository 函数：

```ts
type IdentityProvider = "google" | "apple" | "email";

async function upsertUserFromIdentity(env, input: {
  provider: IdentityProvider;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string | null;
  now: number;
}): Promise<UserRecord>;
```

语义：

- 先查 `user_identities(provider, provider_subject)`，存在则返回对应 user
- 不存在时按 normalized email 查 `users.email`
- email 已存在：复用该 user 并插入 identity
- email 不存在：创建 user，再插入 identity
- `emailVerified=true` 时更新 `users.email_verified=1`
- `displayName` 只在 user 当前 `display_name IS NULL` 时填入
- 对 `UNIQUE(provider, provider_subject)` 冲突要再读一次，保证并发 callback 不重复创建 user

`ensureUserByEmail` 可继续服务 dev fallback，但应尽量复用 repository 内部逻辑，避免两套 user 创建语义漂移。

**Email normalize 规则**（所有入口必须用同一个 `normalizeEmail()` 函数）：

- lowercase + trim
- **不** 处理 plus addressing（`a+x@gmail.com` 与 `a@gmail.com` 视为不同 user）
- **不** 去 gmail 的 `.`（`a.b@gmail.com` 与 `ab@gmail.com` 视为不同 user）
- 选择"简单可预测"而非"用户友好"——避免 attacker 通过 alias 绕过白名单或合并意外账号
- 现有 `packages/api/src/auth.ts` 若已有 normalize 实现，迁移到 `auth/repository.ts` 中作为唯一来源

### E. OAuth Provider Contract

```ts
type OAuthProvider = {
  id: "google" | "apple";
  buildAuthorizationUrl(input: {
    state: string;
    redirectUri: string;
  }): URL;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<{
    providerSubject: string;
    email: string;
    emailVerified: boolean;
    displayName?: string | null;
  }>;
};
```

Google provider v1 必须完整实现：

- authorize URL：`https://accounts.google.com/o/oauth2/v2/auth`
- token URL：`https://oauth2.googleapis.com/token`
- issuer：`https://accounts.google.com`
- JWKS：`https://www.googleapis.com/oauth2/v3/certs`
- scope：`openid email profile`
- `aud` 必须等于 `GOOGLE_OAUTH_CLIENT_ID`
- `email_verified` 必须为 true

Apple provider 本 spec 只预留：

- `APPLE_SIGNIN_TEAM_ID`
- `APPLE_SIGNIN_KEY_ID`
- `APPLE_SIGNIN_PRIVATE_KEY`
- `APPLE_SIGNIN_CLIENT_ID`
- provider contract 测试占位：确认未知/未配置 provider 返回 `provider_not_configured`
- v1 `GET /auth/oidc/apple/start` 和 `/callback` 返回 `400 { "error": "provider_not_configured" }`（不是 404；让前端能识别"功能已规划但未启用"，与未知 provider 返回 `unknown_provider` 区分）

**PKCE / nonce**：v1 **不使用**。理由：

- Workers 是 confidential client（拿得到 `client_secret`），不是 SPA/native public client
- 采用 authorization code flow（不是 implicit / hybrid），id_token 是通过后端直接交换得到，不会经过浏览器历史
- `state` 已防 CSRF，code 单次使用
- 等 spec-015 引入 native 客户端时再加 PKCE

### F. OAuth State 与 Redirect

`GET /auth/oidc/google/start?redirect=...`：

1. 校验 provider（未知/未配置 → 400 `unknown_provider` 或 `provider_not_configured`）
2. 规范化 redirect（见下方 **redirect allowlist 规则**）；不合法时 fallback 到 `AUTH_SUCCESS_URL`
3. 生成 state id
4. KV 写入 `oauth:state:{state}`，TTL 600 秒：

```json
{
  "provider": "google",
  "redirect": "https://dev.aiappsbox.com/auth/success",
  "created_at": 1779300000000
}
```

5. 302 到 provider authorize URL

`GET /auth/oidc/google/callback?code=...&state=...`：

1. 读取并删除 KV state；缺失/过期/provider 不匹配 → 302 错误响应 `?error=invalid_oauth_state`
2. 用 code 换 token 并验证 id_token；任一校验失败 → 302 错误响应 `?error=invalid_oauth_token`
3. `email_verified=false` → 302 错误响应 `?error=email_unverified`
4. `upsertUserFromIdentity(provider='google')`
5. 签发 app session（写 sessions 表 + 生成 jti）
6. **302 到成功 URL**（见下方 **302 redirect 规则**）：

```text
https://dev.aiappsbox.com/auth/success#token=eyJ...&expires_at=2026-06-20T00%3A00%3A00.000Z&email=player%40example.com
```

fragment 不会被浏览器发送给服务端，比 query 更适合承载 bearer token。落点页 `/auth/success` 不在本 spec 范围（spec-012 实现），fragment URL 落到 404 是预期。

### F.1 redirect allowlist 规则

调用方传入的 `redirect` 参数必须通过 `normalizeRedirect()` 校验，违反任一条件即 fallback 到 `AUTH_SUCCESS_URL`：

| 输入形式 | 处理 |
|---|---|
| 相对路径（`/auth/success?next=/scenes`） | ✅ 允许 |
| 绝对 URL，origin ∈ `ALLOWED_ORIGINS` | ✅ 允许 |
| 绝对 URL，origin ∉ `ALLOWED_ORIGINS` | ❌ fallback |
| 以 `//` 开头（protocol-relative，如 `//evil.com/x`） | ❌ fallback（URL parser 会判定为绝对 URL，origin 不在 allowlist 也可能漏过） |
| 包含 CR（`\r`）/ LF（`\n`） | ❌ fallback（防 HTTP header injection） |
| 空字符串 / 未传 | ✅ fallback 到 `AUTH_SUCCESS_URL` |

### F.2 302 redirect 规则

worker 不能直接把相对路径写进 `Location` 头——浏览器会基于**请求 URL（API 域）**解析，落到错的 origin（比如 dev 环境 API 在 `dev.aiappsbox.com/api`，前端落点必须显式使用 `AUTH_SUCCESS_URL`）。

统一处理：

```ts
const successUrl = new URL(env.AUTH_SUCCESS_URL); // 必须是绝对 URL，启动时校验
const target = new URL(redirectPathOrUrl, successUrl); // 相对路径基于 AUTH_SUCCESS_URL.origin 展开
target.hash = `token=${jwt}&expires_at=${encodeURIComponent(expiresIso)}&email=${encodeURIComponent(email)}`;
return Response.redirect(target.toString(), 302);
```

**失败 302 同样基于 `AUTH_SUCCESS_URL`**：

```text
${AUTH_SUCCESS_URL}?error=invalid_oauth_state
${AUTH_SUCCESS_URL}?error=invalid_oauth_token
${AUTH_SUCCESS_URL}?error=email_unverified
${AUTH_SUCCESS_URL}?error=invalid_magic_link
${AUTH_SUCCESS_URL}?error=provider_not_configured
```

error code 是固定枚举（不暴露内部异常文本）。前端在落点页读 `?error=` 展示对应文案。

### G. Magic Link + Resend

`POST /auth/email/send-link`

Request:

```json
{ "email": "player@example.com", "redirect": "/auth/success" }
```

dev/prod Response:

```json
{ "ok": true, "expires_in": 900 }
```

localhost Response:

```json
{
  "ok": true,
  "expires_in": 2592000,
  "token": "...",
  "expiresAt": "2026-06-25T00:00:00.000Z",
  "email": "admin@test.com",
  "user": { "id": "...", "email": "admin@test.com" }
}
```

实现语义：

1. 标准化 email（见 §D normalize 规则）；无效则 400 `email_required`
2. 若 API 请求 host 是 `localhost` / `127.0.0.1` / `[::1]` 且 `APP_ENV !== "prod"`，直接创建/复用用户并签发 session：
   - `admin@test.com`：写入 `admin_user_allowlist`，admin + Pro
   - `vip@test.com`：写入本地有效 `billing_customers` + `billing_subscriptions(active)`，普通 Pro/VIP
   - `custom@test.com` 与其他合法邮箱：普通 free
3. **滥用防护**（dev/prod Magic Link，在生成 token 之前）：
   - 全局 IP 限频沿用 `RATE_LIMIT_PER_MINUTE`
   - 额外 KV throttle：`magic_throttle:{sha256(email)}`，TTL 3600 秒；每发一次 increment
   - 同一 email 1 小时内超过 3 次 → **仍返回 `{ "ok": true, "expires_in": 900 }`**（不暴露 email 是否被刷），但**不发邮件**、不写 `magic:{hash}`
   - 这样 attacker 无法通过响应差异枚举 email 状态
4. 规范化 redirect，与 OAuth 使用同一套 allowlist（见 §F.1）
5. 生成高熵 token，计算 SHA-256 hash
6. KV 写入 `magic:{hash}`，TTL 900 秒：

```json
{
  "email": "player@example.com",
  "redirect": "https://dev.aiappsbox.com/auth/success",
  "created_at": 1779300000000
}
```

7. 用 Resend `POST https://api.resend.com/emails` 发送邮件；Resend HTTP 错误 → 500 `email_send_failed`（不删 KV，用户重试 send-link 即可拿到新 token）
8. 邮件链接指向 API verify endpoint：

```text
https://dev.aiappsbox.com/api/auth/email/verify?token=...
```

`GET /auth/email/verify?token=...`

1. hash token，读取并删除 KV；缺失/过期 → 302 错误响应 `?error=invalid_magic_link`（见 §F.2）
2. `upsertUserFromIdentity(provider='email', providerSubject=email, emailVerified=true)`
3. 签发 app session（写 sessions 表 + 生成 jti）
4. 302 到 redirect（按 §F.2 规则用 `AUTH_SUCCESS_URL.origin` 补全相对路径），fragment 字段格式与 OAuth callback 一致：

```text
https://dev.aiappsbox.com/auth/success#token=eyJ...&expires_at=2026-06-20T00%3A00%3A00.000Z&email=player%40example.com
```

Resend 配置：

- `EMAIL_PROVIDER_API_KEY`：Resend API key，secret
- `EMAIL_FROM_ADDRESS`：例如 `no-reply@aiappsbox.com`
- 缺 API key：
  - localhost：走邮箱直登，不需要邮件 key
  - dev 域名：dry-run，不发邮件，返回 `verify_url`
  - prod：500 `email_provider_not_configured`

### H. 通用端点

`POST /auth/logout`

- 要求 Authorization
- 校验 token 后更新当前 `sessions.revoked_at = now`
- 返回 `{ "ok": true }`
- 重复 logout 对已 revoked session 返回 401 即可，不需要幂等成功

`GET /auth/me`

Response:

```json
{
  "user": {
    "id": "u_...",
    "email": "player@example.com",
    "display_name": "Player",
    "created_at": 1779300000000,
    "linked_providers": ["google", "email"]
  },
  "subscription": {
    "status": "free",
    "current_period_end": null
  },
  "quota": {
    "messages_used_today": 0,
    "messages_limit_today": 30
  }
}
```

当前实现读取 `billing_*` 表和 KV quota。admin override 返回 Pro entitlement；localhost 的 `vip@test.com` 通过本地 subscription row 模拟 Pro，不连接 Stripe。

### I. Frontend Minimal Hook

本 spec **不实现登录 UI 也不实现 `/auth/success` 落点页面**——这些都属于 spec-012。本 spec 只在 `apps/app` 加 API client helper：

- `apps/app/api/companion-client.ts` 增加：
  - `startGoogleLogin(redirect?: string): string`（返回 `/auth/oidc/google/start?redirect=...` 完整 URL，调用方 `window.location.href = ...`）
  - `sendMagicLink(email: string, redirect?: string): Promise<{ ok: true; expires_in: number; verify_url?: string; token?: string; expiresAt?: string; email?: string; user?: { id: string; email: string } }>`
  - `logout(): Promise<void>`（带 Authorization header，成功后清 localStorage）
  - `fetchMe(): Promise<AuthMeResponse>`
- `apps/app/hooks/use-session.ts`：能消费 localhost 邮箱直登响应、Google callback fragment、Magic Link verify 三方返回的统一 session response shape

**明确不在本 spec 范围**：

- `/auth/success` 路由/页面（fragment 解析、token 写 localStorage、错误展示）
- 完整登录界面、native OAuth、深链、App Store 合规
- 上述均放到 spec-012/015

`/auth/success` 由前端消费 fragment 并写入本地 session。

### J. Ops 与配置

`infra/cloudflare/wrangler.jsonc` vars 增加公开配置：

- `GOOGLE_OAUTH_CLIENT_ID`
- `EMAIL_FROM_ADDRESS`
- `AUTH_SUCCESS_URL`
- Apple 占位：`APPLE_SIGNIN_TEAM_ID`、`APPLE_SIGNIN_KEY_ID`、`APPLE_SIGNIN_CLIENT_ID`

Wrangler secrets：

- `JWT_SIGNING_KEY`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `EMAIL_PROVIDER_API_KEY`
- Apple 占位：`APPLE_SIGNIN_PRIVATE_KEY`

`.env.example` 同步列出上述变量，secret 值留空。

Redirect URI（Google Console 中需登记）：

- local Google：`http://127.0.0.1:8787/auth/oidc/google/callback`
- dev Google：`https://dev.aiappsbox.com/api/auth/oidc/google/callback`
- prod Google：`https://aiappsbox.com/api/auth/oidc/google/callback`

Worker 已经会 normalize `/api/*`，所以代码中路由仍匹配 `/auth/...`。

`AUTH_SUCCESS_URL`（前端落点页面，必须是绝对 URL；本 spec verify/callback 用其 origin 补全相对路径）各环境示例：

- local：`http://localhost:8081/auth/success`
- dev：`https://dev.aiappsbox.com/auth/success`
- prod：`https://aiappsbox.com/auth/success`

启动时校验 `AUTH_SUCCESS_URL`：

- 缺失或不是合法绝对 URL → worker 启动失败 / 任何 auth 路径返回 500 `auth_success_url_invalid`
- 通过校验后挂在 env 上，供 §F.2 的 redirect 拼接复用

**Sessions 表 cleanup**：

- v1 不做定期清理；`revoked_at IS NOT NULL` 或 `expires_at < now` 的行长期保留
- 未来如有性能需要再加 cron job（Workers Cron Trigger）

**`.env.example` 同步**（实施步骤 12 的核心动作）：

当前 `.env.example` 缺以下变量，必须补齐占位符（secret 留空）：

- `JWT_SIGNING_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`
- `EMAIL_PROVIDER_API_KEY`、`EMAIL_FROM_ADDRESS`
- `AUTH_SUCCESS_URL`
- `APPLE_SIGNIN_TEAM_ID`、`APPLE_SIGNIN_KEY_ID`、`APPLE_SIGNIN_CLIENT_ID`、`APPLE_SIGNIN_PRIVATE_KEY`

---

## 实施步骤

1. 创建分支 `feature/spec-009-auth`
2. 增加 `jose` 依赖，跑一次 lockfile 更新
3. 拆 `packages/api/src/auth.ts` 为 `auth/` 目录，先保持现有测试通过
4. 实现 `session.ts`：签发 JWT、写 sessions、校验 jti、logout revoke
5. 实现 `repository.ts`：user + identity upsert/link，覆盖 email 合并与并发冲突
6. 实现 `redirects.ts`：相对路径/allowed origin/default success URL
7. 实现 `oauth.ts` + Google provider：state KV、authorize redirect、callback exchange、id_token 校验
8. 实现 `email-link.ts`：Magic Link token hash、KV TTL、Resend 发送、localhost 邮箱直登、dev 域名 dry-run
9. 实现 `/auth/me`、`/auth/logout`
10. 在 `index.ts` 保持 auth dispatch 顺序最靠前
11. 做前端 client helper（`startGoogleLogin`/`sendMagicLink`/`logout`/`fetchMe` + session response 消费）
12. 更新 `.env.example`、`wrangler.jsonc`、`docs/ops/secrets.md`、`docs/architecture/api.md`
13. 跑 typecheck/test；手动用 localhost 邮箱直登、Magic Link、Google OAuth dev app 验证

---

## 验证

- [ ] `pnpm --filter @xtbit/api typecheck` 通过
- [ ] `pnpm --filter @xtbit/api test` 通过
- [ ] `pnpm --filter @xtbit/app typecheck` 通过（如改前端 helper）
- [ ] 旧本地登录端点不存在；localhost 邮箱直登复用 `POST /auth/email/send-link`
- [ ] session：JWT payload 含 `sub/email/jti/iat/exp`
- [ ] session：revoked `jti` 再访问 protected endpoint 返回 401
- [ ] session：旧 `AUTH_TOKEN_SECRET` 签发的无 `jti` token → 401（**不留兼容分支**）
- [ ] session：prod 缺 `JWT_SIGNING_KEY` 与 `AUTH_TOKEN_SECRET` 返回 `auth_secret_missing`
- [ ] config：`AUTH_SUCCESS_URL` 不是合法绝对 URL → worker 启动失败 / auth 路径返回 `auth_success_url_invalid`
- [ ] OAuth start：写入 `oauth:state:*`，302 到 Google authorize URL
- [ ] OAuth callback：state 一次性使用，invalid/replay state → 302 `?error=invalid_oauth_state`
- [ ] OAuth callback：unverified email → 302 `?error=email_unverified`，不创建用户
- [ ] OAuth callback：同 email 新 provider 自动 link，不创建重复 user
- [ ] redirect allowlist：相对路径允许、`//evil.com` 拒、含 `\r\n` 拒、非 allowlist origin 拒
- [ ] redirect 补全：worker 用 `AUTH_SUCCESS_URL.origin` 拼绝对 URL；Location 头始终是完整 URL
- [ ] fragment 格式：`expires_at` 是 URL-encoded ISO 字符串，与 session response JSON 一致
- [ ] Magic Link：send-link 写 KV hash，不存明文 token
- [ ] Magic Link：Resend 失败返回 `email_send_failed`；localhost 直接返回 session；dev 域名缺 key 返回 dry-run `verify_url`
- [ ] Magic Link：同 email 1 小时内 4 次 send-link，第 4 次仍返回 `{ ok: true }` 但**不发邮件**、不写 KV
- [ ] Magic Link：verify 成功后删除 token、创建/link email identity、签发 session
- [ ] Magic Link：重放 token → 302 `?error=invalid_magic_link`
- [ ] Apple endpoint：`/auth/oidc/apple/start` 返回 `400 provider_not_configured`
- [ ] `/auth/me`：返回 user、linked_providers、真实 billing/quota；admin override 与本地 VIP 能返回 Pro
- [ ] `/auth/logout`：只 revoke 当前 session，不影响同 user 其它 session

---

## 回滚

- 代码回滚到上一提交即可恢复上一版 auth 行为
- D1 schema 不需要新增 migration；本 spec 使用 `0001_v1_baseline.sql` 已有表
- **上线即一刀切**：`JWT_SIGNING_KEY` 启用后所有旧 token（`AUTH_TOKEN_SECRET` 签发、无 `jti`）立刻 401。发布前必须公告用户重登，prod 当前几乎无活跃用户，影响面可接受
- 回滚到旧实现时，新签发的含 `jti` token 在旧代码下仍可校验签名（jti 字段会被旧代码忽略）；但已写入 `sessions` 表的行不会自动清理，旧代码不查表所以无影响
- 若 Resend 配置错误，可临时关闭 Magic Link 入口（让 send-link 直接返回 500 `email_provider_not_configured`），保留 Google OIDC 与 localhost 邮箱直登
- 若 Google OAuth 配置错误，可让 `/auth/oidc/google/start` 返回 `provider_not_configured`，保留 localhost 邮箱直登与 Magic Link

---

## 依赖

- spec-003：`users/user_identities/sessions` 表已存在
- spec-010：`/auth/me` 中 subscription/quota 字段后续接入真实 billing/usage
- spec-012：完整 Expo 登录 UI、`/auth/success` 落点页（fragment 解析、token 写 localStorage、错误展示）、移动端体验
- spec-015：iOS/Android EAS、Apple Sign-In native 合规与深链
- [`docs/architecture/api.md §2`](../architecture/api.md#2-auth-端点)
- [`docs/ops/secrets.md §5.3-§5.4`](../ops/secrets.md#53-oauth)
