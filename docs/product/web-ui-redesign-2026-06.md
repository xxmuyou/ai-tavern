# Web UI 视觉重构规范 — 暗色夜场「电子魅魔」主题（2026-06）

> 状态：已批准，实施中（仅 web 端；mobile 端放弃维护）
> 对标产品：candy.ai / spicychat / crushon.ai
> 关联代码：`apps/app/tailwind.config.js`、`apps/app/global.css`、`apps/app/constants/palette.ts`、`apps/app/constants/brand.ts`、`apps/app/components/web/**`

## 1. 背景与目标

旧 UI 为暖色奶油 editorial 亮色主题 + 局部暗色 twilight 页面混搭，且组件内散落 ~119 处硬编码颜色，出现暗底暗字、页面割裂等问题。本次重构目标：

1. 全站统一为**暗色夜场风**：深紫黑底 + 霓虹玫红主色 + 暧昧紫/暖橙辅助，撑起「电子魅魔 / 夜晚邂逅」的产品氛围。
2. 首页重构为**发现门户**：搜索 + 筛选 + 标签 + 分区（热门/新上架/官方精选/社区创作），为上百个 companion 与用户公开 companion 做结构准备。
3. 品牌展示名集中为常量，便于更换。
4. 暧昧但克制，不做 NSFW（既有产品决策）。

## 2. 品牌候选（待用户勾选，实施期默认用 ①）

| # | 名称 | 标语 | 气质 |
|---|------|------|------|
| ① | **Nocturne** | Who will you meet tonight? | 夜曲，古典+夜场，耐看 |
| ② | **Velvet Hour** | Every night, a new her. | 天鹅绒时刻，丝绒触感 |
| ③ | **Afterglow** | Stay a little longer. | 余温，亲密后的暧昧 |
| ④ | **Sirenia** | Voices you shouldn't follow. | 塞壬系，魅惑危险感 |

落地：`apps/app/constants/brand.ts` 导出 `BRAND_NAME` / `BRAND_TAGLINE` / `BRAND_MONOGRAM`，全站引用此常量；换名只改这个文件。

## 3. 色板（token 全表）

命名空间 `app.*`（tailwind.config.js），**复用旧 token 名、重指新值**，旧调用点自动变暗。

### 语义规则（最重要）

- **`-soft` = 深色 tinted 容器底**；**`-deep` = 容器上的亮色文字/强调**。
- 配对用法固定：`bg-app-rose-soft` + `text-app-rose-deep`（或 `text-app-ink`），对比度天然安全。
- 与旧亮色主题语义相反——亮色时代把 `-soft` 当浅色底的用法在暗色下不可再用。

### Token 表

| token | 值 | 用途 |
|-------|-----|------|
| canvas | `#0B0710` | 页面底（深夜紫黑） |
| surface | `#15101D` | 卡片表面 |
| sunken | `#070409` | 凹陷区 / 输入框底 |
| line | `#2C2138` | 标准边框 |
| lineSoft | `#1E1628` | 弱边框 |
| ink | `#F5EDF3` | 主文字（暖白，on canvas ≈15:1） |
| ink-soft | `#C9B8CF` | 次级文字 |
| muted | `#9A89A6` | 三级/提示（on canvas ≈5.5:1，过 AA） |
| muted-soft | `#6E5F7B` | 最弱文字（仅装饰，不承载信息） |
| rose | `#FF4D7E` | **主色**：魅魔玫红（霓虹感），CTA/选中态/发光 |
| rose-soft | `#3A1424` | 玫红容器底 |
| rose-deep | `#FF8FAD` | 玫红容器上的文字 / hover 亮态 |
| brand | `#A66BFA` | 副色：暧昧紫（替代旧森林绿） |
| brand-soft | `#2A1B3F` | 紫容器底 |
| brand-deep | `#CDA9F7` | 紫容器文字 |
| ember | `#FF9D5C` | 暖橙（烛光/能量/辅助 CTA） |
| ember-soft | `#3A2316` | 橙容器底 |
| wine | `#D9587E` | 酒红点缀 |
| wine-soft | `#381726` | 酒红容器底 |
| success / -soft | `#3EDC97` / `#0E2E20` | 状态色（亮色字 + 深色容器） |
| warning / -soft | `#FFC163` / `#3A2B12` | 〃 |
| danger / -soft | `#FF6B6B` / `#3A1518` | 〃 |
| info / -soft | `#6FA8FF` / `#16243C` | 〃 |
| twilight / twilight-soft | `#0E0B14` / `#1A1320` | 聊天页深底（保持） |
| inverse | `#F5EDF3` | 反色（亮） |
| bg / card / text / primary / primarySoft / accent | = canvas / surface / ink / rose / rose-soft / ember | 旧别名 |

### 渐变与阴影

- `gradient-canvas`: `linear-gradient(180deg, #0B0710 0%, #120A1A 100%)`
- `gradient-glow`: `radial-gradient(ellipse at top, rgba(255,77,126,0.18) 0%, transparent 60%)` — 页面顶部氛围光
- `gradient-hero`: `linear-gradient(135deg, #1A0F22 0%, #2C1024 55%, #3A1424 100%)` — hero 紫黑→玫红
- `gradient-card-fade`: `linear-gradient(180deg, transparent 0%, rgba(5,2,8,0.92) 100%)` — 卡片底部渐隐压字区
- shadow `card`/`card-lg`/`float`: 黑色系加深（rgba(0,0,0,0.4~0.6)）
- shadow `glow`: `0 0 24px rgba(255,77,126,0.35)` — hover 玫红发光
- shadow `glow-soft`: `0 0 18px rgba(166,107,250,0.25)` — 紫色弱光

### 非 className 场景

`Ionicons color=` / `ActivityIndicator color=` 等 prop 统一引用 `apps/app/constants/palette.ts`（`PALETTE.*`，与 tailwind 同值镜像）。禁止再写裸 hex。

## 4. 字体

- 标题 serif：**Fraunces**（替代 Lora；Google Fonts，`display=swap`）
- 正文：Inter（不变）；数字：JetBrains Mono（不变）
- 字号 scale（display-2xl…overline）不变

## 5. 组件规范（components/web/ui/）

- **WebCard/WebPanel**：elevated = `bg-app-surface border-app-line shadow-card`；glass = `bg-white/[0.04] backdrop-blur border-white/10`；新增 glow hover（边框 rose/40 + shadow-glow）
- **WebButton**：primary = 玫红实底 `bg-app-rose text-white hover:shadow-glow`；outline = 白/10 边框；ghost/danger 同规则；google 保持白底（识别度）
- **WebTag**：一律 soft 容器 + deep 文字
- **WebSidebar**：`bg-app-surface/60`，active 项 soft 底 + deep 字 + 左侧 2px 玫红指示条
- **WebTopBar**：sticky + `bg-app-canvas/85 backdrop-blur`
- **WebInput/WebTextarea**：`bg-app-sunken border-app-line focus:border-app-rose` + 玫红 focus ring
- **WebTabs**：underline 玫红；pill 走 soft 容器

## 6. 首页信息架构（发现门户）

```
DiscoverTopBar（sticky blur）: monogram+品牌名 | 搜索框 | 积分/登录/头像
DiscoverHero: gradient-hero + 标语大字 + 副文案
FilterBar: [Female|Male] [Anime|Realistic] + TagChips（数据聚合 top N）
🔥 Trending       横滑大卡（popular 前 8-10，排名角标）
✨ New arrivals   横滑（recent 前 10）
👑 Official picks 网格（source=official）
🌐 Community      网格 + Load more（source=user，30 条递增）
```

- 数据：`usePublicCompanions` 两次调用（sort popular / recent）；搜索走 API `q`（300ms debounce），搜索态收起分区只显示结果网格；标签 chips 客户端过滤。
- **CompanionCard**：全出血人像（cover）、底部 gradient-card-fade 压名字/角色/标签、左上性别徽标、右下 🔥 play_count；hover：图 scale-105 + 边框 rose/50 + shadow-glow。
- 未登录可浏览，点卡片跳 `/auth/login?redirect=`。

## 7. 实施与验证

实施顺序：token 层 → 硬编码清理 → ui 组件库 → 首页门户 → 子页面（login→companions→detail→chat→scenes→me→billing→admin）→ 收尾。
验证：`pnpm typecheck`；`pnpm web` 逐页人工过；`-soft` 容器上文字必须 `-deep`/ink；admin 只保底可读不重设计。
