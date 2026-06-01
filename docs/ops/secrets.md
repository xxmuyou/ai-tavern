# 密钥管理

> 本文档定义所有 secret / API key 的清单、来源、存储位置、轮换流程。环境总览见 [`environments.md`](./environments.md)，部署见 [`deployment.md`](./deployment.md)。
>
> **核心原则：** 任何 secret **不进 git**。所有 secret 通过 Wrangler / EAS / 1Password（或团队选定的工具）注入运行时。
>
> **管理员工作台边界：** Admin UI 只管理非敏感运行时配置。API key / secret / signing key 只能通过 `.env.*`、Wrangler secrets、`pnpm upload:secrets:*` 或 `wrangler secret put` 管理。工作台只显示这些 secret 是否已配置，不显示值，也不允许覆盖；历史 D1 中如果存在同 key 覆盖值，运行时代码会忽略。
>
> **RunningHub workflow/checkpoint 配置不是 secret。** `workflowId`、`promptNodeId`、`checkpointNodeId`、`checkpointFieldName`、默认 `ckptName`、`loadImageNodeId` 不放本文件的 secret 清单，也不应长期放 `.env.*`。它们应由 repo 中按环境区分的 RunningHub workflow 配置文件管理，并在部署时同步到 D1 `app_settings`。

---

## 1. Secret 全清单

| 名称 | 用途 | 来源 | 注入位置 | dev / prod 是否独立 |
|------|------|------|----------|-------------------|
| `DEEPSEEK_API_KEY` | DeepSeek LLM 调用 | platform.deepseek.com | Wrangler secret | 独立 |
| `OPENAI_API_KEY` | OpenAI LLM（fallback / 备选） | platform.openai.com | Wrangler secret | 独立 |
| `ANTHROPIC_API_KEY` | Anthropic Claude（备选） | console.anthropic.com | Wrangler secret | 独立 |
| `DOUBAO_API_KEY` | 豆包 / 火山引擎（备选 / 未来中文版） | volcengine.com | Wrangler secret | 独立 |
| `CLOUDFLARE_AI_TOKEN` | Workers AI（摘要任务） | Cloudflare Dashboard | Wrangler secret | 独立（或同账户共享） |
| `STRIPE_SECRET_KEY` | Stripe 服务端 API（创建 Checkout 等） | stripe.com（test/live） | Wrangler secret | **强制独立**（test vs live） |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook 签名验证 | Stripe webhook endpoint 创建后获取 | Wrangler secret | 独立 |
| `STRIPE_PUBLISHABLE_KEY` | 前端用的 Stripe key | stripe.com | wrangler.jsonc `vars`（公开） | 独立 |
| `STRIPE_PRICE_PRO_MONTHLY` | Pro Monthly Stripe Price ID | Stripe Dashboard | wrangler.jsonc `vars`（公开） | 独立 |
| `STRIPE_PRICE_CREDITS_SMALL` / `_MEDIUM` / `_LARGE` | 积分包一次性 Price ID（spec-021） | Stripe Dashboard | 同 `STRIPE_PRICE_PRO_MONTHLY`（sync 脚本按 secret 处理） | 独立 |
| `STRIPE_CREDITS_SUCCESS_URL` / `_CANCEL_URL` | 积分 Checkout 成功/取消回跳 URL（缺省回退到 `STRIPE_SUCCESS_URL`/`_CANCEL_URL`） | 团队域名配置 | wrangler.jsonc `vars`（公开） | 独立 |
| `STRIPE_SUCCESS_URL` | Checkout 成功后回跳 Web URL | 团队域名配置 | wrangler.jsonc `vars`（公开） | 独立 |
| `STRIPE_CANCEL_URL` | Checkout 取消后回跳 Web URL | 团队域名配置 | wrangler.jsonc `vars`（公开） | 独立 |
| `STRIPE_PORTAL_RETURN_URL` | Customer Portal 返回 Web URL | 团队域名配置 | wrangler.jsonc `vars`（公开） | 独立 |
| `JWT_SIGNING_KEY` | 签发 JWT（HS256 或 RS256 私钥） | 本地生成（`openssl rand`） | Wrangler secret | 独立 |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Sign-In | console.cloud.google.com | wrangler.jsonc `vars`（公开） | 独立 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 服务端 | console.cloud.google.com | Wrangler secret | 独立 |
| `APPLE_SIGNIN_TEAM_ID` | Apple 开发者团队 ID | developer.apple.com | wrangler.jsonc `vars`（公开） | 通常共享（一个团队） |
| `APPLE_SIGNIN_KEY_ID` | Apple Sign-In key ID | developer.apple.com | wrangler.jsonc `vars` | 独立或共享 |
| `APPLE_SIGNIN_PRIVATE_KEY` | Apple Sign-In `.p8` 私钥内容 | developer.apple.com 下载 | Wrangler secret（base64 编码） | 独立或共享 |
| `APPLE_SIGNIN_CLIENT_ID` | Apple Sign-In client/service id | App Store Connect / Apple Developer | wrangler.jsonc `vars` | 独立或共享 |
| `EMAIL_PROVIDER_API_KEY` | Magic Link 邮件发送（Resend） | resend.com | Wrangler secret | 独立 |
| `EMAIL_FROM_ADDRESS` | 发件邮箱（如 `no-reply@aiappsbox.com`） | 团队邮箱配置 | Wrangler secret | 通常共享 |
| `RUNNINGHUB_API_KEY` | RunningHub 生图任务创建与结果查询 | RunningHub 个人菜单 / API 设置 | Wrangler secret | 独立 |
| `RUNNINGHUB_WEBHOOK_SECRET` | RunningHub webhook 回调校验 | 本地生成（`openssl rand`） | Wrangler secret | 独立 |
| `R2_SIGNING_KEY` | Worker 生成 R2 源图临时签名 URL | 本地生成（`openssl rand`） | Wrangler secret | 独立 |
| `AUTH_SUCCESS_URL` | OAuth / Magic Link 成功后的 Web 回调页 | app 域名 | wrangler.jsonc `vars` | 独立 |
| `SUPPORT_EMAIL` | 用户支持邮箱（退款、客诉） | 团队邮箱 | wrangler.jsonc `vars` + 前端 | 共享 |
| `ADMIN_INIT_EMAIL` | 首次部署 seed admin 用户的邮箱 | 团队约定（`admin@aiappsbox.com`） | wrangler.jsonc `vars` | 共享 |

---

## 1.5 Dev 阶段最小密钥集（开发期 vs 验证期）

> **结论：开发阶段 `.env.dev` 只需要 LLM key。** 其他大部分密钥都有 dev 自动回退；localhost 登录通过邮箱直登，不需要 OIDC 或邮件服务。
>
> 这一节回答："本地起 worker 跑代码，到底必填哪些？"

### 1.5.1 dev runtime 判定

`auth/types.ts` 的 `isDevRuntime(env)` 判 `env.APP_ENV !== "prod"`。`infra/cloudflare/wrangler.jsonc` 顶层 `vars.APP_ENV = "dev"` 已硬编码，所以 `wrangler dev` 默认就是 dev 模式，无需手工开关。

### 1.5.2 必填 keys（dev 也必填）

| Key | 缺失后果 | 备注 |
|---|---|---|
| `DEEPSEEK_API_KEY`（或任一 LLM key） | LLM 调用返回 500 | 至少配一个 provider；`LLM_DEFAULT_ROUTE` 决定走哪条 |
| `LLM_DEFAULT_ROUTE` | 路由不确定 | `.env.example` 默认 `cheap-dialogue` |
| `OPENAI_MODEL` | OpenAI 路径失败 | 仅当 OPENAI_API_KEY 配了才用得到 |
| `EXPO_PUBLIC_API_URL` | Expo 客户端不知道连哪儿 | dev 默认 `http://127.0.0.1:8787` |

> Stripe 相关：仅当**要测付费流程**时才需要 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`；纯 chat / 场景流程可空。

### 1.5.3 dev 可省 keys + 自动回退行为

| Key | dev 缺失时的实际行为 | 出处 |
|---|---|---|
| `AUTH_TOKEN_SECRET` / `JWT_SIGNING_KEY` | 自动回退到 `DEV_FALLBACK_SECRET = "xtbit-local-dev-auth-token-secret"`，session 仍可签发与校验 | `auth/types.ts:39` + `auth/session.ts:131` |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | localhost 不需要；dev/prod 域名走真实 Google 登录时才需要 | `auth/oauth.ts`（只有点 Google 登录才触发） |
| `EMAIL_PROVIDER_API_KEY` / `EMAIL_FROM_ADDRESS` | localhost 不需要；dev/prod 域名走真实 Magic Link 邮件时才需要 | `auth/email-link.ts` |
| `ALLOWED_ORIGINS` | `wrangler.jsonc` dev `vars` 已硬编码 `http://localhost:8081,http://127.0.0.1:8081,https://dev.aiappsbox.com` | wrangler.jsonc |
| `ADMIN_EMAILS` | `wrangler.jsonc` dev `vars` 已硬编码 `admin@aiappsbox.com` | wrangler.jsonc |
| `AUTH_SUCCESS_URL` | `wrangler.jsonc` dev `vars` 已硬编码 `https://dev.aiappsbox.com/auth/success` | wrangler.jsonc |
| Apple Sign-In 全套 | dev / v1 不实现 | spec-009 |

### 1.5.4 admin 动态名单

admin 身份由两层控制：

1. **Built-in admin**（不可被 UI 删除）：`ADMIN_EMAILS` env var，逗号分隔的邮箱列表，写在 `wrangler.jsonc vars`。dev 默认 `admin@aiappsbox.com`。
2. **动态 admin**（可在 Admin 页面增删）：`admin_user_allowlist` DB 表（原 `dev_login_allowlist`，migration 0013 重命名）。

`isAdminUser(env, email)` 同时检查两层，任一命中即视为 admin。dev 与 prod 注册方式相同（Magic Link + Google OIDC），不限制注册邮箱。

### 1.5.5 何时该补齐这些"可省" keys

| 触发场景 | 应补的 keys |
|---|---|
| 要在 dev/prod 域名走真实 Google 登录流程 | `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`（redirect URI 使用对应域名的 `/api/auth/oidc/google/callback`） |
| 要测真实 Magic Link 邮件 | `EMAIL_PROVIDER_API_KEY` + `EMAIL_FROM_ADDRESS`（Resend dev 用 `onboarding@resend.dev` 默认 sender，仅能发到 verify 过的邮箱） |
| 要测 Stripe 订阅流程 | `STRIPE_SECRET_KEY`（test mode）+ `STRIPE_WEBHOOK_SECRET`（Stripe CLI listen 转发 webhook 时给出）|
| 要测真实 RunningHub 生图 | `RUNNINGHUB_API_KEY` + `RUNNINGHUB_WEBHOOK_SECRET` + `R2_SIGNING_KEY`，并确保对应环境的 RunningHub workflow 配置已通过部署同步到 D1 |
| 准备发布到 prod | 全部按 §1 表格逐项准备，且独立 dev / prod |

### 1.5.6 dev 启动最快路径

```bash
# 主仓库
cp .env.example .env.dev      # 首次
vim .env.dev                  # 只填 DEEPSEEK_API_KEY / EXPO_PUBLIC_API_URL / LLM_DEFAULT_ROUTE / OPENAI_MODEL
pnpm install                  # 装 husky + dev deps
pnpm dev                      # 自动准备本地 env，再起 worker (8787) + Expo (8081)

# 登录：打开 http://localhost:8081/auth/login
# 输入 admin@test.com  → 本地 admin + Pro
# 输入 vip@test.com    → 本地普通 Pro/VIP 用户
# 输入 custom@test.com → 本地普通 free 用户
# 其他合法邮箱          → 本地普通 free 用户
```

---

## 2. 注入方式

### 2.1 Wrangler secret（Workers 后端）

```bash
# 从 .env.dev / .env.prod 批量同步远端 Worker secrets
pnpm upload:secrets:dev
pnpm upload:secrets:prod

# 查看（仅列表，不显示值）
npx wrangler secret list --config infra/cloudflare/wrangler.jsonc --env=
npx wrangler secret list --config infra/cloudflare/wrangler.jsonc --env prod
```

### 2.2 wrangler.jsonc vars（公开非 secret）

公开值（如 `STRIPE_PUBLISHABLE_KEY` 是给前端的）可以直接写：

```jsonc
{
  "env": {
    "dev": {
      "vars": {
        "ENVIRONMENT": "dev",
        "STRIPE_PUBLISHABLE_KEY": "pk_test_xxx",
        "SUPPORT_EMAIL": "support@aiappsbox.com",
        "GOOGLE_OAUTH_CLIENT_ID": "...apps.googleusercontent.com"
      }
    }
  }
}
```

**注意：** 即使是 publishable key，也建议 dev / prod 用不同的（隔离测试环境）。

### 2.3 EAS secrets（移动端 build 时注入）

```bash
# 前端 build 时需要的（如 EXPO_PUBLIC_API_URL 不算 secret，但 sensitive build settings 算）
eas secret:create --scope project --name SENTRY_DSN --value "..."
```

**注意：** Expo 中以 `EXPO_PUBLIC_` 开头的环境变量会**打包进 client bundle**——绝不能放真正的 secret。仅 API base URL 等公开值用 `EXPO_PUBLIC_*`。

### 2.4 GitHub Actions secrets（v1.x CI 用）

在 GitHub 仓库 Settings > Secrets 添加：
- `CLOUDFLARE_API_TOKEN`（仅给 dev 部署用，scope 受限）
- `CLOUDFLARE_ACCOUNT_ID`

**prod 部署不进 CI** → 不放 prod secret 在 GitHub。

### 2.5 本地开发（`.env.dev` 作为 SOT + `pnpm generate:env:dev` 派生）

> 详细 spec：[`docs/specs/spec-016-local-secrets-mgmt.md`](../specs/spec-016-local-secrets-mgmt.md)

**单一来源（Source of Truth）：** 根目录 `.env.dev`（dev）和 `.env.prod`（prod）。两者都 gitignored，从 `.env.example` 复制模板填值。

**派生流程：**

```
.env.dev (root, SOT, gitignored)
   │
   │ pnpm generate:env:dev  ───►  apps/app/.env.dev      （仅 EXPO_PUBLIC_*）
   │
   └───────────────────────►  infra/cloudflare/.dev.vars  （worker 消费 secrets，白名单）
```

派生文件 `apps/app/.env.dev` / `infra/cloudflare/.dev.vars` 都加 banner `# AUTO-GENERATED by scripts/generate-env-files.sh — DO NOT EDIT`，**不要手改**。

**白名单维护：** `scripts/generate-env-files.sh` 顶部 `WORKER_KEYS` 数组定义哪些 key 派生到 `.dev.vars`。新增 worker key 需同时改：
- `.env.example`（schema）
- `scripts/generate-env-files.sh` 的 `WORKER_KEYS`
- `scripts/upload-worker-secrets.sh` 的 `ALLOWED_WORKER_KEYS`

**常用命令：**

```bash
pnpm generate:env:dev           # dev：派生 apps/app/.env.dev（EXPO_PUBLIC_*）
pnpm generate:env:dev --dry-run # 只打印计划，不写文件
pnpm generate:env:prod      # prod：仅派生 apps/app/.env.prod，prod worker secrets 走 pnpm upload:secrets:prod
pnpm run:local             # 自动准备本地 env，再启动 worker + Expo
```

**新机器上手：**

1. `cp .env.example .env.dev` → 填入真实 dev 值
2. （可选）`cp .env.example .env.prod` → 填入 prod 值（仅用于 `expo export` 时打 prod bundle）
3. `pnpm install` → 触发 husky 初始化 pre-commit hook
4. （可选）`brew install gitleaks` → pre-commit hook 会扫描，未装时 graceful skip
5. `pnpm dev` → 一切就绪

---

## 3. Secret 轮换流程

### 3.1 LLM API key（DeepSeek / OpenAI / 其他）

LLM API key 只能通过 Wrangler secret 轮换；Admin UI 只显示 configured / missing 状态，不能查看或替换 key。

```bash
# 1. 在 provider 后台创建新 key
# 2. 注入新 key（不删旧 key）
pnpm wrangler secret put DEEPSEEK_API_KEY --env prod   # 输入新值

# 3. 部署一次
pnpm deploy:api:prod

# 4. 监测 24 小时（确保新 key 工作）
# 5. 在 provider 后台撤销旧 key
```

### 3.2 Stripe key

Stripe secret key 和 webhook signing secret 只能通过 Wrangler secret 管理；Admin UI 不显示、不替换真实值。

**注意：rotate Stripe live key 需要联系 Stripe 支持**（live key 不支持自助删除，只能 deactivate）。

- test mode key 可随时换
- live mode key 一旦下发，**视为长期持久**，仅在泄露时联系 Stripe rotate

### 3.3 JWT signing key

JWT signing key 只能通过 Wrangler secret 管理；Admin UI 不显示、不替换真实值。

```bash
# 1. 生成新 key
openssl rand -base64 64

# 2. 配置双 key 期（v1.x 实现支持）：
#    - JWT_SIGNING_KEY_OLD（验证旧 token）
#    - JWT_SIGNING_KEY_NEW（签发新 token）

# 3. 部署 → 监控 30 天（覆盖大部分用户的 JWT 过期）
# 4. 移除 OLD key
```

**v1 暂时不做双 key**（不轮换）。出问题时一次性切换 + 强制所有用户重新登录。

### 3.4 OAuth client secret

OAuth client secret 只能通过 Wrangler secret 管理；Admin UI 不显示、不替换真实值。

- Google / Apple 控制台都可创建新 secret
- 同 LLM key 流程：旧新共存，部署，撤销旧

---

## 4. 安全约束

### 4.1 不能进 git 的文件

`.gitignore` 必须包含：
```
.env
.env.*
!.env.example
.dev.vars
*.p8
*.pem
*-private.json
secrets/
```

### 4.2 提交前检查

通过 husky 9 + gitleaks 实施（spec-016 落地）：

- `pnpm install` 自动激活 `.husky/pre-commit`
- hook 跑 `gitleaks protect --staged --config=.gitleaks.toml`
- 扫描默认规则集（`sk-*` / `sk_test_*` / `sk_live_*` / 高熵字符串 / 各 SaaS API key 格式）
- 误报通过 `.gitleaks.toml` `[allowlist].paths` 加白名单（schema 文件、test 文件、文档）
- 用户本地未装 `gitleaks` 时 hook 打印安装提示并 skip（不阻塞 commit）

### 4.3 团队分发

- secret 不要发邮件 / 微信 / Slack
- 用 1Password / Bitwarden 共享 vault
- prod secret 仅 admin 持有
- 新人入职：仅给 dev secrets，prod 按需逐项授权

### 4.4 误提交应急

如果 secret 被误推到 git：

1. 立刻在 provider 后台撤销该 key
2. 创建新 key 注入
3. 部署
4. 用 `git filter-repo` 或 GitHub support 清除历史
5. 强制 force-push 到所有分支（如未公开）
6. 通知团队 reclone

---

## 5. 待获取 / 待配置（v1 上线前 checklist）

### 5.1 LLM
- [ ] DeepSeek API key（dev + prod）
- [ ] OpenAI API key（fallback，dev + prod）
- [ ] （可选）Anthropic / Doubao key

### 5.2 Stripe
- [ ] Stripe 账户注册
- [ ] Stripe test secret + publishable key（dev）
- [ ] Stripe live secret + publishable key（prod）
- [ ] 创建 Product `AI Companion Subscription`（dev + prod）
- [ ] 创建 Price `$9.99/month`，记录 ID（dev + prod）
- [ ] webhook endpoint + signing secret（dev + prod）

### 5.3 OAuth
- [ ] Google Cloud project 创建
- [ ] OAuth consent screen 配置
- [ ] Google OAuth client ID + secret（web + Android + iOS 各一套）
- [ ] Apple Developer 账户
- [ ] Apple Sign-In service ID + key（.p8 文件）

### 5.4 Email
- [ ] 邮件发送服务选择（推荐 Resend，CF Workers 友好）
- [ ] 域名 SPF / DKIM / DMARC 配置
- [ ] `no-reply@aiappsbox.com` 发件邮箱
- [ ] 支持邮箱（**用户待填写**，用于退款 / 客诉）

### 5.5 域名
- [x] `aiappsbox.com` 已注册并接管在 Cloudflare
- [ ] 各子域 custom domain 路由配置（`api.` / `dev-api.` / `dev.` → Worker / Pages）
- [ ] SSL 自动签发验证（CF 自动，部署时检查）

### 5.6 移动端
- [ ] Apple Developer 个人 / 公司账户
- [ ] App Store Connect app 注册
- [ ] Google Play Console 账户
- [ ] Google Play app 注册
- [ ] EAS 项目配置 + credentials

---

## 6. 待最终敲定

- [ ] 团队 secret 共享工具（v1 暂用 `.env.dev` SOT + sync 派生；v1.x 团队化时迁 1Password CLI，见 spec-016 §后续工作）
- [ ] 支持邮箱地址（退款 / 客诉，用户提供）
- [ ] DKIM / DMARC 配置策略（防止退款邮件被识别为垃圾）
- [x] ~~secret 误提交检测工具~~ → gitleaks（spec-016 落地，见 §4.2）
- [ ] 是否引入 Cloudflare Secrets Store（v1.x 统一管理）
