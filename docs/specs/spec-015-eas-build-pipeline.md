# spec-015: iOS / Android EAS Build pipeline

> **类型：** 新建  |  **依赖：** 012（Expo UI 重做完成）  |  **估时：** 3-5 天  |  **状态：** ⚪ todo（详细）

---

## Context

`apps/app/` 目前是 Expo SDK 54 + React Native 0.81.5 + expo-router 6 项目，仅跑 `pnpm web` 导出静态站点到 Cloudflare Pages。原生 iOS / Android 客户端从未走过完整出包流程：

- 无 `eas.json` —— EAS Build / Submit 未初始化
- 无 iOS bundle id 申请、未在 App Store Connect 建 app
- 无 Android keystore、未在 Google Play Console 建 app
- 无 push notification 凭证（未来如需）
- `app.json` 的 `ios.bundleIdentifier` / `android.package` 字段缺失
- 深链 / 通用链接（universal link / app link）依赖 spec-014 的 `aiappsbox.com` 域名

v1 RC 上线门槛 [`README.md §4`](./README.md#4-v1-上线门槛) 要求 spec-001 ~ spec-015 全部 done。本 spec 把"从 git push 到 TestFlight + Internal Testing 拿到可装包"全流程跑通，作为 v1 上线前最后一块配置。

不动产品代码（除 `app.json` / `eas.json` / 几个常量），是配置 + 账号 + 凭证密集型 spec。

---

## 目标

- `eas.json` 三个 profile 落地：`development`（dev client，热 reload，可调试）、`preview`（内部分发 ad-hoc / TestFlight + Internal Testing）、`production`（store-ready 包）
- iOS：bundle id `com.aiappsbox.xtbit` 申请；App Store Connect app 建好；TestFlight 内部组拿到 build；可在真机安装并完成登录 → 进场景 → 对话
- Android：package `com.aiappsbox.xtbit` 申请；Google Play Console app 建好；Internal Testing track 拿到 build；可在真机 / 模拟器安装并完成同样流程
- universal link：`https://aiappsbox.com/.well-known/apple-app-site-association` 与 `assetlinks.json` 部署到 Cloudflare Pages，iOS / Android 真机点 magic link → 跳 app 而非浏览器
- 文档：`docs/ops/eas-build.md` 记录凭证位置、build 命令、submit 命令、回滚步骤
- CI 触发：`pnpm build:app:preview` / `pnpm build:app:prod` 可由本地或 GitHub Actions 触发（GHA 集成为非目标，仅留接口）

## 非目标

- ❌ Push notification 凭证（APNs / FCM）配置 —— v1 无 push 需求
- ❌ App Store / Google Play 正式上架审核流程 —— 仅到内部测试 track
- ❌ EAS Update（OTA）配置 —— v1 走 store 发版即可，OTA 留 v1.x
- ❌ GitHub Actions 自动 build —— 留接口，不实施
- ❌ iOS / Android 原生模块定制 —— 全部走 Expo managed workflow
- ❌ App Store / Google Play 截图、文案、隐私问卷 —— 由产品 / 市场负责，不在本 spec
- ❌ 多语言 localized metadata —— v1 仅中文 + 英文 fallback
- ❌ 应用内购买（IAP）—— v1 走 Stripe web，移动端订阅在 v1.x 才考虑 IAP

---

## 改动清单

| 路径 / 资源 | 操作 |
|---|---|
| `apps/app/eas.json` | 新建，三个 profile（development / preview / production） |
| `apps/app/app.json` | 加 `ios.bundleIdentifier`、`android.package`、`ios.associatedDomains`、`android.intentFilters`、`extra.eas.projectId` |
| `apps/app/credentials.json` | **不入库**（gitignore），EAS 管理凭证（远端方案） |
| `apps/app/package.json` | scripts 加 `build:dev` / `build:preview` / `build:prod` / `submit:ios` / `submit:android` |
| `apps/web/public/.well-known/apple-app-site-association` | 新建（无后缀 JSON），universal link 配置 |
| `apps/web/public/.well-known/assetlinks.json` | 新建，Android app link 配置 |
| `infra/cloudflare/wrangler.jsonc` | Pages 配置无需改（Pages 项目自动暴露 public 目录） |
| `docs/ops/eas-build.md` | 新建，凭证 / 命令 / 回滚 |
| `.gitignore` | 加 `apps/app/credentials.json`、`apps/app/*.p12`、`apps/app/*.jks`、`apps/app/google-services.json`（如果走本地凭证模式） |
| **EAS 账号** | 注册 Expo organization `aiappsbox`；`eas login` |
| **Apple Developer Program** | 加入（$99/年）；申请 App ID `com.aiappsbox.xtbit`；建 App Store Connect app |
| **Google Play Console** | 注册开发者账号（$25 一次性）；建 app；上传 keystore |
| **App Store Connect** | 建 app record、配 TestFlight 内部组 |
| **Google Play Console** | 建 Internal Testing track、加测试人员 email |

---

## 实施步骤

### 1. EAS 账号 + CLI

```bash
pnpm dlx eas-cli --version    # 确认 EAS CLI 可用（>= 16）
pnpm dlx eas-cli login        # 用 aiappsbox 组织账号登录
cd apps/app
pnpm dlx eas-cli init         # 创建 EAS project，写入 app.json 的 extra.eas.projectId
```

### 2. `eas.json` profile 定义

`apps/app/eas.json`：

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "env": { "EXPO_PUBLIC_API_URL": "https://dev.aiappsbox.com/api" }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "simulator": false },
      "env": { "EXPO_PUBLIC_API_URL": "https://dev.aiappsbox.com/api" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_API_URL": "https://aiappsbox.com/api" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "release@aiappsbox.com",
        "ascAppId": "<APP_STORE_CONNECT_APP_ID>",
        "appleTeamId": "<APPLE_TEAM_ID>"
      },
      "android": {
        "serviceAccountKeyPath": "./credentials/google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

### 3. `app.json` 字段补全

在现有 `expo` 对象内补：

```jsonc
{
  "expo": {
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.aiappsbox.xtbit",
      "associatedDomains": ["applinks:aiappsbox.com", "applinks:dev.aiappsbox.com"],
      "buildNumber": "1"
    },
    "android": {
      "package": "com.aiappsbox.xtbit",
      "versionCode": 1,
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [{ "scheme": "https", "host": "aiappsbox.com" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    "extra": {
      "eas": { "projectId": "<填 step 1 生成的 projectId>" }
    }
  }
}
```

### 4. Apple Developer 配置

1. 加入 Apple Developer Program（$99/年）—— 用 `release@aiappsbox.com` 账号
2. https://developer.apple.com → Identifiers → 注册 App ID `com.aiappsbox.xtbit`
   - 启用 **Associated Domains**（用于 universal link）
3. App Store Connect → My Apps → New App
   - Platform: iOS
   - Name: 用户面文案（参考 [`product/vision.md`](../product/vision.md)）
   - Bundle ID: `com.aiappsbox.xtbit`
   - SKU: `xtbit-001`
4. TestFlight → Internal Testing → 加测试人员（最多 100 个 Apple ID）

### 5. Google Play 配置

1. 注册 Google Play Console（$25）
2. Create app → 中文 / 英文双语
   - Package name: `com.aiappsbox.xtbit`
3. Setup → Internal testing track → 创建 release → 加测试邮箱列表
4. 准备 service account（用于 EAS Submit）：
   - Google Play Console → API access → 链接 Google Cloud project → 创建 service account → 下载 JSON key
   - 文件存 `apps/app/credentials/google-play-service-account.json`（不入库）

### 6. 凭证（EAS managed credentials）

iOS：

```bash
cd apps/app
pnpm dlx eas-cli credentials -p ios   # 进入交互界面，让 EAS 远端生成 distribution cert + provisioning profile
```

Android：

```bash
pnpm dlx eas-cli credentials -p android  # 让 EAS 生成 upload keystore，存远端
```

> 选择 **EAS 远端管理凭证**（推荐）。本地不留 keystore / .p12 文件。

### 7. universal link / app link 文件

iOS：`apps/web/public/.well-known/apple-app-site-association`（无后缀，content-type `application/json`）：

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<APPLE_TEAM_ID>.com.aiappsbox.xtbit",
        "paths": ["/auth/success", "/auth/success/*"]
      }
    ]
  }
}
```

Android：`apps/web/public/.well-known/assetlinks.json`：

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.aiappsbox.xtbit",
      "sha256_cert_fingerprints": ["<上传 keystore 后从 EAS 拿到的 SHA-256>"]
    }
  }
]
```

> sha256_cert_fingerprints 在 step 6 EAS 生成 upload keystore 后通过 `pnpm dlx eas-cli credentials -p android` 查看。

部署：push 到 main → Cloudflare Pages 自动 publish → 验证 `curl https://aiappsbox.com/.well-known/apple-app-site-association` 返回 JSON。

### 8. 首个 dev build

```bash
cd apps/app
pnpm dlx eas-cli build --profile development --platform ios
pnpm dlx eas-cli build --profile development --platform android
```

完成后 EAS 给出可装包链接，iOS 走 Apple Configurator 或扫码装、Android 直接 APK 装真机 / 模拟器。

### 9. 首个 preview build（TestFlight + Internal Testing）

```bash
pnpm dlx eas-cli build --profile preview --platform ios
pnpm dlx eas-cli build --profile preview --platform android
```

iOS build 完成后：

```bash
pnpm dlx eas-cli submit --profile production --platform ios --latest
```

→ 自动上传到 App Store Connect → 等 Apple 处理（约 30 分钟）→ TestFlight 内部组成员收到推送

Android build 完成后：

```bash
pnpm dlx eas-cli submit --profile production --platform android --latest
```

→ 自动上传到 Google Play Internal Testing track → 测试人员通过 opt-in 链接装包

### 10. `package.json` scripts

`apps/app/package.json`：

```jsonc
{
  "scripts": {
    "build:dev:ios":  "eas build --profile development --platform ios",
    "build:dev:android": "eas build --profile development --platform android",
    "build:preview":  "eas build --profile preview --platform all",
    "build:prod":     "eas build --profile production --platform all",
    "submit:ios":     "eas submit --profile production --platform ios --latest",
    "submit:android": "eas submit --profile production --platform android --latest"
  }
}
```

### 11. 文档落地

`docs/ops/eas-build.md` 写：

- 各 profile 用途、何时跑
- 凭证存哪（EAS 远端 / Google Play service account 本地）
- build 状态查询命令（`eas build:list`）
- 失败时常见原因 + 修复
- 版本号 / build 号管理规则（`autoIncrement`）
- 撤回 build：`eas build:cancel` / TestFlight 下架 / Play Console 关 release
- 凭证轮换：`eas credentials` 选项

---

## 验证方式

### EAS project 初始化

```bash
cd apps/app
pnpm dlx eas-cli whoami    # 期望：登录账号
pnpm dlx eas-cli project:info  # 期望：projectId、ownerAccount 输出正确
```

### Universal link / App link

```bash
curl -I https://aiappsbox.com/.well-known/apple-app-site-association
# 期望：HTTP/2 200，content-type: application/json
curl https://aiappsbox.com/.well-known/assetlinks.json | jq .
# 期望：返回正确的 sha256 指纹与 package name
```

iOS 真机 Safari 打开：`https://aiappsbox.com/auth/success#token=test`
→ 应弹"在 xtbit app 中打开"  
Android 同样路径 Chrome 打开 → 应直接跳 app（autoVerify 已开）

### Dev build 真机跑通

iOS / Android 真机装 dev build → 启动 → 看到登录页 → Magic link → 进场景 → 与角色对话一轮 → 收到 LLM 回复

### Preview build TestFlight / Internal Testing

- iOS：TestFlight app 内看到 build → 安装 → 完成上述 dev build 同款流程
- Android：Play Store opt-in 链接装包 → 完成同样流程

### Submit 流程

```bash
pnpm submit:ios   # 期望：上传成功、ASC 收到 build
pnpm submit:android   # 期望：Play Console 收到 AAB
```

---

## 回滚

- **EAS Project**：误建 project → `eas project:info` 拿到 id → 在 expo.dev dashboard delete；删 `app.json` 中 `extra.eas.projectId`
- **iOS Bundle ID**：申请后不可改名，但可在 Apple Developer 删 App ID；App Store Connect app 可删（未提交审核前）
- **Android Package**：Play Console app 创建后**不可删**（只能 unpublish）—— 提交前确认 package name 无误
- **TestFlight build**：Apple Developer → TestFlight → 选 build → "Expire Build"
- **Play Internal Testing**：Play Console → Internal testing → Releases → 选 release → "Halt rollout"
- **EAS Credentials**：误生成证书 → `eas credentials` → Remove → 重新生成
- **universal link / app link 文件**：删 `apps/web/public/.well-known/*` → push → Cloudflare Pages 自动重发；iOS 缓存 24h，Android 缓存数小时

回滚不可逆步骤：
- Apple Developer Program / Google Play Console 注册费不退
- 一旦提交 App Store / Play Store 审核（即使审核被拒），bundle id 仍占用，不能被其他账号申请

---

## 依赖

- **spec-012**：Expo UI 重做完成（已 done），是出包的前提
- **spec-014**：custom domain 绑定完成（特别是 `https://aiappsbox.com` 的 `/.well-known/*` 路径可访问），universal link / app link 依赖此
- **外部账号**：
  - Apple Developer Program 会员（$99/年）
  - Google Play Console 开发者账号（$25 一次性）
  - Expo organization `aiappsbox`（免费 plan 即可起步，重 build 后按需升 Production / Enterprise）
  - Google Cloud service account（Play Submit 用）

---

## 后续工作

- **EAS Update（OTA）**：v1.x 加入，让小 JS-only 改动绕过 store 审核
- **GitHub Actions 自动 build**：push tag 触发 `build:prod` + `submit`，本 spec 仅留 script 接口
- **Push notification**：APNs key + FCM Server Key，配 `expo-notifications`
- **App Store / Play Store 上架**：截图、文案、隐私问卷、年龄分级 —— 由产品 / 市场负责
- **多语言 store metadata**：日 / 韩 / 英文 store listing
- **崩溃监控**：Sentry React Native（`@sentry/react-native`）
- **审核失败 playbook**：常见审核拒绝原因（IAP 缺失、隐私政策链接、广告 ID 使用等）应对策略文档化
