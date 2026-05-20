# 部署流程

> 本文档定义三端的部署流程：API（Cloudflare Workers）、Web（Cloudflare Pages）、iOS/Android（Expo EAS）。环境配置见 [`environments.md`](./environments.md)，密钥见 [`secrets.md`](./secrets.md)。

---

## 1. 总览

| 组件 | 工具 | 触发 |
|------|------|------|
| API（Workers） | Wrangler | `pnpm deploy:api:{env}` |
| Web | Wrangler Pages | `pnpm deploy:web:{env}` |
| iOS | EAS Build → TestFlight → App Store | `eas build --platform ios --profile {profile}` |
| Android | EAS Build → Play Internal → Play Store | `eas build --platform android --profile {profile}` |
| D1 migrations | Wrangler | `pnpm cf:d1:migrate:{env}` |

**部署原则：**
- 不允许自动部署到 prod —— 始终需要 admin 手动确认 + 触发
- dev 可以频繁部署（开发分支 push 后人工 + 一键即可）
- 所有部署前必须本地 `pnpm typecheck && pnpm test` 通过

---

## 2. API 部署（Cloudflare Workers）

### 2.1 dev 部署

```bash
# 在 main 或 feature 分支
pnpm typecheck
pnpm test
pnpm deploy:api:dev
```

`deploy:api:dev` 执行：
```bash
wrangler deploy --env dev
```

### 2.2 prod 部署

```bash
# 需在 main 分支，必须有 release tag
git tag v1.0.0 -m "v1.0.0 release"
git push --tags
pnpm typecheck && pnpm test
pnpm deploy:api:prod   # 会要求二次确认
```

`deploy:api:prod` 执行：
```bash
wrangler deploy --env prod
```

**prod 部署前 checklist：**
- [ ] 当前分支 == `main`
- [ ] 本地测试通过
- [ ] migrations 已 dev 验证
- [ ] secrets 已配置（`secrets.md` §2）
- [ ] 关键 KPI 监测可用（Workers Analytics）

### 2.3 回滚

```bash
# Wrangler 不支持自动回滚 → 重新 deploy 上一个版本的代码
git checkout v0.9.x
pnpm deploy:api:prod
git checkout main
```

更稳的方式：用 Cloudflare Workers 的 **Versions / Gradual Deployment**（v1.x 引入）。

---

## 3. Web 部署（Cloudflare Pages）

### 3.1 构建

Expo Web 输出静态文件到 `apps/app/dist/`：

```bash
cd apps/app
pnpm build:web    # = expo export --platform web
```

### 3.2 dev 部署

```bash
pnpm deploy:web:dev
```

底层执行（脚本里）：
```bash
cd apps/app
expo export --platform web
wrangler pages deploy dist --project-name xtbit-web-dev --branch=dev
```

### 3.3 prod 部署

```bash
pnpm deploy:web:prod
```

底层：
```bash
expo export --platform web
wrangler pages deploy dist --project-name xtbit-web --branch=main
```

### 3.4 SPA 路由 fallback

Cloudflare Pages 默认不会把所有 `/*` 请求 fallback 到 `index.html`。需要在 `apps/app/public/_redirects` 文件里加：

```
/*    /index.html   200
```

避免 deep link 跳转后 404。

### 3.5 静态资源 vs 动态 API

- Web SPA 静态文件 → Cloudflare Pages
- API 请求 → 同域 `/api/*` 路由到 Worker（`dev.aiappsbox.com/api/*` / `aiappsbox.com/api/*`）
- 这样 Web 与 API 同域访问，但仍由 Pages 与 Worker 分别承载和部署

---

## 4. iOS 部署

### 4.1 前置

- Apple Developer 账号（个人或公司）
- App Store Connect app 已创建（bundle id 如 `com.aiappsbox.companion`）
- EAS 账号 + 项目已配置

### 4.2 EAS 配置

`apps/app/eas.json`（待新建）：

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "http://localhost:8787" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "https://dev.aiappsbox.com/api" }
    },
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://aiappsbox.com/api" }
    }
  },
  "submit": {
    "production": { "ios": { "appleTeamId": "...", "ascAppId": "..." } }
  }
}
```

### 4.3 dev build（开发版，TestFlight）

```bash
cd apps/app
eas build --platform ios --profile preview
# 等 EAS 构建完成 → 自动上传到 TestFlight
```

### 4.4 prod build

```bash
eas build --platform ios --profile production
eas submit --platform ios   # 提交到 App Store Connect 审核
```

### 4.5 iOS 特别注意

- **Apple Sign-In 必须**（`secrets.md` §4 配 Apple Sign-In key + team id）
- IAP（应用内购）vs Stripe：v1 用 Stripe（外部支付）。**注意：苹果不允许在 app 内引导到 Stripe checkout** —— 需要走"用户在 Web 端订阅 → 登录后状态生效"的合规路径。详见 §6。

---

## 5. Android 部署

### 5.1 前置

- Google Play Console 账号
- 应用已注册（package name 同 iOS bundle id）
- EAS 已配置 Google service account credentials

### 5.2 dev build

```bash
eas build --platform android --profile preview
# 输出 APK 或 AAB，可下载分发，或自动上传 Play Internal Testing
```

### 5.3 prod build

```bash
eas build --platform android --profile production
eas submit --platform android   # 提交到 Play Console 审核
```

### 5.4 Android 特别注意

- Google Sign-In：用 `expo-auth-session` 或 `@react-native-google-signin/google-signin`
- 支付：Google Play 比苹果宽松 —— **Stripe 可以直接用**，无需走 Play Billing
- Play Store 审核：消费类 AI 应用近年审核严格，需要明确的 safety policy 与 content rating

---

## 6. Stripe 与 App Store 合规路径

苹果规定：app 内不能引导用户去第三方支付（Stripe 算第三方）。处理：

**方案 A（推荐 v1）：External Linking + Reader App 模式**
- iOS app 内 **不显示订阅按钮**（或仅显示 "View pricing on web"）
- 用户点击 → 在浏览器打开 `https://aiappsbox.com/billing`
- 用户在 web 订阅成功后，回 app 自动同步状态
- 这是 Reader App 类规则，但要在 App Store Connect 申请 entitlement

**方案 B（备选）：Apple IAP**
- 接入 Apple In-App Purchase
- 苹果抽 30%（小型开发者计划 15%）
- v1.x 实现，v1 用方案 A

**Android：** 无此限制，Stripe 直接用。

---

## 7. D1 Migrations 部署

```bash
# 写新 migration
echo "-- 0006_add_xyz.sql" > packages/api/migrations/0006_add_xyz.sql
# 编辑 ...

# 本地验证
pnpm cf:d1:migrate:local

# dev 应用
pnpm cf:d1:migrate:dev

# prod 应用（必须二次确认）
pnpm cf:d1:migrate:prod
```

**约束：**
- 一个 migration 一旦在 dev 应用过，不能改动文件（破坏 hash 一致性）—— 改动要写新 migration
- prod migration 在低峰期执行
- 大表的 migration 要拆分（D1 单语句有时间限制）

---

## 8. CI/CD（v1 简化版）

**v1：本地手动触发部署**（保持简单，确保每次部署都有人审）

**v1.x：GitHub Actions（轻量自动化）**

```yaml
# .github/workflows/dev-deploy.yml (待新建)
on:
  push:
    branches: [dev]
jobs:
  deploy-dev:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm deploy:api:dev
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**prod 部署不进 CI**：始终手动 + 二次确认。

---

## 9. 版本与发布管理

- **后端 API 版本**：URL 不带 version（`/companions` 不是 `/v1/companions`）；用 `GET /health` 返回 `version` 字段供前端探测
- **App 版本**：`apps/app/app.json` 的 `version` 字段，每次发布递增（`1.0.0` → `1.0.1` → `1.1.0`）
- **EAS build number** 自动递增（iOS `buildNumber`、Android `versionCode`）

**App 与 API 兼容性：** 
- 旧 App 仍可用新 API（API 保持向后兼容）
- API 重大变更需要前端跟进升级（用 `feature_flags` + 灰度发布）

---

## 10. 部署后验证

每次部署完跑：

```bash
# dev
curl https://dev.aiappsbox.com/api/health
# prod
curl https://aiappsbox.com/api/health
# 期望: {"ok": true, "version": "..."}

# Web
curl -I https://{env}.aiappsbox.com
# 期望: 200 OK + 正常静态资源

# Stripe webhook（dev 测试用 Stripe CLI 转发）
stripe listen --forward-to https://dev.aiappsbox.com/api/billing/webhook
```

prod 部署后还要：
- [ ] 用 admin 账号登录验证
- [ ] 走一遍订阅流程（test 卡）
- [ ] 抽 1-2 个角色对话测试
- [ ] 检查 Workers Analytics 错误率

---

## 11. 待最终敲定

- [ ] 是否引入 Cloudflare Workers Versions / Gradual Deployment（v1.x）
- [ ] EAS 是否用 over-the-air updates（`expo-updates`，能不发版热更新 JS）
- [ ] App Store Reader App entitlement 申请时机与材料
- [ ] CI/CD 工具最终选择（GitHub Actions vs Cloudflare 内置）
- [ ] 版本号约定文档（SemVer 严格遵守 vs 灵活）
