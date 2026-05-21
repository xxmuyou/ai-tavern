# spec-009: Auth OIDC + Magic Link

> **类型：** 新建  |  **依赖：** spec-003  |  **估时：** 5-7 天  |  **状态：** ⚪ todo

---

## Context

v1 需要真实账号体系承接后续 billing、配额、跨设备进度和 admin 权限。当前 API 只有 `/auth/dev-session`，适合 local/dev 调试，但不能作为生产登录：用户可以在旧接口里直接输入 email，服务端也没有可撤销 session、第三方身份绑定、Magic Link 一次性 token、或 `/auth/me` 这样的统一会话入口。

`0001_v1_baseline.sql` 已经预留 `users`、`user_identities`、`sessions` 三张表；[`architecture/api.md §2`](../architecture/api.md#2-auth-端点) 也定义了 OIDC、Magic Link、logout、me 的方向。本 spec 把 auth 做成可维护模块，先落地 **Google OIDC + Resend Magic Link + JWT session revoke**。Apple Sign-In 在本 spec 中只定义 provider contract 和配置边界，不作为 done 阻塞项；移动端 native 深链也不纳入本 spec，先服务 Web 回调。

---

## 目标

- 保留 `/auth/dev-session`，继续支持 local/dev 快速生成登录 token；prod 必须禁用
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
- ❌ 前端完整登录 UI 重做（可做最小 Web callback/token 存储；完整 UI 留给 spec-012）
- ❌ refresh token / rolling session（v1 JWT 固定 30 天）

---

## 改动清单

### A. 模块结构

把现有 `packages/api/src/auth.ts` 拆成目录模块：

```text
packages/api/src/auth/
├── index.ts          # 路由聚合；导出 requireAuthUser / requireAdminUser 等公共守卫
├── dev-session.ts    # /auth/dev-session，仅 dev/local 可用
├── session.ts        # JWT 签发/校验、jti、sessions 写入与 revoke
├── repository.ts     # users / user_identities / sessions 数据访问
├── oauth.ts          # OAuth state、redirect 校验、provider 分派
├── providers.ts      # Google provider 实现 + Apple provider contract 占位
├── email-link.ts     # Magic Link token、Resend 发送、verify
├── redirects.ts      # redirect allowlist 与成功页拼装
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
- 迁移兼容：如果缺少 `JWT_SIGNING_KEY`，允许读取旧 `AUTH_TOKEN_SECRET`
- prod 两者都缺失时返回 500 `auth_secret_missing`
- dev/local 两者都缺失时允许使用现有 dev fallback secret，但测试必须覆盖 prod 缺失失败

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

### F. OAuth State 与 Redirect

`GET /auth/oidc/google/start?redirect=...`：

1. 校验 provider
2. 规范化 redirect：
   - 相对路径：允许，例如 `/auth/success?next=/scenes`
   - 绝对 URL：origin 必须在 `ALLOWED_ORIGINS`
   - 不合法时 fallback 到 `AUTH_SUCCESS_URL`，再 fallback 到 request origin `/auth/success`
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

1. 读取并删除 KV state；缺失或 provider 不匹配返回 400 `invalid_oauth_state`
2. 用 code 换 token 并验证 id_token
3. `upsertUserFromIdentity(provider='google')`
4. 签发 app session
5. 302 到已校验 redirect，并把 token 放到 fragment：

```text
https://dev.aiappsbox.com/auth/success#token=...&expires_at=...&email=player%40example.com
```

fragment 不会被浏览器发送给服务端，比 query 更适合承载 bearer token。完整前端成功页可在 spec-012 做；本 spec 只需最小 Web callback 能读取并存储 token。

### G. Magic Link + Resend

`POST /auth/email/send-link`

Request:

```json
{ "email": "player@example.com", "redirect": "/auth/success" }
```

Response:

```json
{ "ok": true, "expires_in": 900 }
```

dev/local dry-run response 可额外包含：

```json
{ "verify_url": "http://localhost:8787/auth/email/verify?token=..." }
```

实现语义：

1. 标准化 email；无效则 400 `email_required`
2. 规范化 redirect，与 OAuth 使用同一套 allowlist
3. 生成高熵 token，计算 SHA-256 hash
4. KV 写入 `magic:{hash}`，TTL 900 秒：

```json
{
  "email": "player@example.com",
  "redirect": "https://dev.aiappsbox.com/auth/success",
  "created_at": 1779300000000
}
```

5. 用 Resend `POST https://api.resend.com/emails` 发送邮件
6. 邮件链接指向 API verify endpoint：

```text
https://dev.aiappsbox.com/api/auth/email/verify?token=...
```

`GET /auth/email/verify?token=...`

1. hash token，读取并删除 KV；缺失则 400 `invalid_magic_link`
2. `upsertUserFromIdentity(provider='email', providerSubject=email, emailVerified=true)`
3. 签发 app session
4. 302 到 redirect fragment：

```text
https://dev.aiappsbox.com/auth/success#token=...&expires_at=...&email=player%40example.com
```

Resend 配置：

- `EMAIL_PROVIDER_API_KEY`：Resend API key，secret
- `EMAIL_FROM_ADDRESS`：例如 `no-reply@aiappsbox.com`
- 缺 API key：
  - dev/local：dry-run，不发邮件，返回 `verify_url`
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

v1 允许 `subscription/quota` 先按现有 `subscriptions` 和 KV 读取；若 spec-010 尚未完成，可返回 deterministic free/quota 默认值，但字段 shape 必须稳定。

### I. Frontend Minimal Hook

本 spec 不重做登录 UI，但需要给 Web callback 留最小落点：

- `apps/app/api/companion-client.ts` 增加真实 auth client 函数：
  - `startGoogleLogin(redirect?: string): string`
  - `sendMagicLink(email, redirect?)`
  - `logout()`
  - `fetchMe()`
- `apps/app/hooks/use-auth-email.ts` 可以先改名或保留，但内部要能写入真实 session response
- Web callback 页面或现有入口必须能读取 `location.hash` 里的 `token/expires_at/email` 并写入 localStorage

完整登录界面、native OAuth、深链、App Store 合规检查放到 spec-012/015。

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

Redirect URI：

- local Google：`http://127.0.0.1:8787/auth/oidc/google/callback`
- dev Google：`https://dev.aiappsbox.com/api/auth/oidc/google/callback`
- prod Google：`https://aiappsbox.com/api/auth/oidc/google/callback`

Worker 已经会 normalize `/api/*`，所以代码中路由仍匹配 `/auth/...`。

---

## 实施步骤

1. 创建分支 `feature/spec-009-auth`
2. 增加 `jose` 依赖，跑一次 lockfile 更新
3. 拆 `packages/api/src/auth.ts` 为 `auth/` 目录，先保持 dev-session 与现有测试通过
4. 实现 `session.ts`：签发 JWT、写 sessions、校验 jti、logout revoke
5. 实现 `repository.ts`：user + identity upsert/link，覆盖 email 合并与并发冲突
6. 实现 `redirects.ts`：相对路径/allowed origin/default success URL
7. 实现 `oauth.ts` + Google provider：state KV、authorize redirect、callback exchange、id_token 校验
8. 实现 `email-link.ts`：Magic Link token hash、KV TTL、Resend 发送、dev dry-run
9. 实现 `/auth/me`、`/auth/logout`
10. 在 `index.ts` 保持 auth dispatch 顺序最靠前
11. 做最小前端 client/helper，确保 Web callback 能存 token
12. 更新 `.env.example`、`wrangler.jsonc`、`docs/ops/secrets.md`、`docs/architecture/api.md`
13. 跑 typecheck/test；手动用 dev-session、Magic Link dry-run、Google OAuth dev app 验证

---

## 验证

- [ ] `pnpm --filter @xtbit/api typecheck` 通过
- [ ] `pnpm --filter @xtbit/api test` 通过
- [ ] `pnpm --filter @xtbit/app typecheck` 通过（如改前端 helper）
- [ ] dev-session：dev/local `POST /auth/dev-session` 返回 token；prod 返回 403
- [ ] session：JWT payload 含 `sub/email/jti/iat/exp`
- [ ] session：revoked `jti` 再访问 protected endpoint 返回 401
- [ ] session：prod 缺 `JWT_SIGNING_KEY` 与 `AUTH_TOKEN_SECRET` 返回 `auth_secret_missing`
- [ ] OAuth start：写入 `oauth:state:*`，302 到 Google authorize URL
- [ ] OAuth callback：state 一次性使用，invalid/replay state 返回 400
- [ ] OAuth callback：unverified email 不创建用户
- [ ] OAuth callback：同 email 新 provider 自动 link，不创建重复 user
- [ ] redirect：非白名单 redirect fallback 到默认成功页
- [ ] Magic Link：send-link 写 KV hash，不存明文 token
- [ ] Magic Link：Resend 失败返回可诊断错误；dev 缺 key 返回 dry-run `verify_url`
- [ ] Magic Link：verify 成功后删除 token、创建/link email identity、签发 session
- [ ] Magic Link：重放 token 返回 400
- [ ] `/auth/me`：返回 user、linked_providers、subscription、quota
- [ ] `/auth/logout`：只 revoke 当前 session，不影响同 user 其它 session

---

## 回滚

- 代码回滚到上一提交即可恢复 dev-session-only auth
- D1 schema 不需要新增 migration；本 spec 使用 `0001_v1_baseline.sql` 已有表
- 若已发出 JWT，回滚后旧 token 可能无法被新旧实现同时识别；dev 阶段可清 sessions，prod 上线前必须避免半切换
- 若 Resend 配置错误，可临时关闭 Magic Link 入口，保留 Google OIDC 与 dev-session

---

## 依赖

- spec-003：`users/user_identities/sessions` 表已存在
- spec-010：`/auth/me` 中 subscription/quota 字段后续接入真实 billing/usage
- spec-012：完整 Expo 登录 UI、Web callback 页面、移动端体验
- spec-015：iOS/Android EAS、Apple Sign-In native 合规与深链
- [`docs/architecture/api.md §2`](../architecture/api.md#2-auth-端点)
- [`docs/ops/secrets.md §5.3-§5.4`](../ops/secrets.md#53-oauth)
