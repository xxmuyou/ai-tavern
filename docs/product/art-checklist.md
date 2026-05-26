# 美术清单（场景图 + 角色立绘 + 情绪表情 + 里程碑装饰层）

> 单页对照表，照抄即可。所有资产的最终命名 / 路径以本表为准；上传到 R2 后把 URL 填回数据库（`scenes.art_url` / `companions.art_url` / `companions.art_emotions`）。
>
> 路径前缀：本地预览放在 `apps/app/assets/ai-companion/scenes/`、`apps/app/assets/ai-companion/portraits/`、`apps/app/assets/ai-companion/milestones/` 下；正式资源传 R2 `companions/v1/` bucket。
>
> **设计边界：** v1 不做手绘专属里程碑 CG。里程碑画面由现有立绘 + 场景图 + 通用装饰层程序合成（见 §4）。装饰层只增强视觉记忆点，不替代场景图、不替代聊天表情、也不改变 companion 的基础设定。手绘专属 CG 留给 v2+。

---

## 1. 场景图（10 张，建议比例 16:9，至少 1600×900）

| # | 文件名 | 场景 ID | 中文名 | 氛围关键词 | 时间/光线 | 备注 |
|---|---|---|---|---|---|---|
| 1 | `scene_pier_coffee_shop.png` | `pier_coffee_shop` | 码头咖啡馆 | 木质柜台、咖啡机蒸汽、空荡却温暖、海风 | 傍晚金色阳光斜射 | 海边木栈道末端，落地窗 |
| 2 | `scene_sky_office.png` | `sky_office` | 高空办公室 | 27 楼开放工位、玻璃幕墙、键盘声、城市远景 | 午后白光 | 现代写字楼俯瞰城市 |
| 3 | `scene_twin_pines_park.png` | `twin_pines_park` | 双松公园 | 两排松树小径、长椅、慢跑者、家庭 | 傍晚柔金 | 中央公园式开阔绿地 |
| 4 | `scene_moon_bar.png` | `moon_bar` | 月亮酒吧 | 月牙霓虹、木吧台、低饱和爵士夜店感 | 深夜暖黄+霓虹 | 后街小巷氛围 |
| 5 | `scene_sunrise_apartment.png` | `sunrise_apartment` | 朝阳公寓 | 公共走廊、晨光、楼下面包香 | 清晨柔黄 | 居民楼楼道+门口 |
| 6 | `scene_brookside_bookshop.png` | `brookside_bookshop` | 溪边书店 | 两层旧书店、阅读角、雨天玻璃雾气 | 阴天/雨天 | 木质书架、灯泡昏黄 |
| 7 | `scene_skyline_rooftop.png` | `skyline_rooftop` | 天际线屋顶 | 屋顶花园、城市灯海、夜风 | 深夜 | 高视角，星点灯火 |
| 8 | `scene_iron_forge_gym.png` | `iron_forge_gym` | 铁炉健身房 | 老派铁片+杠铃、橡胶垫、汗与粉笔味 | 清晨冷白光 | 工业风、深色调 |
| 9 | `scene_crescent_library.png` | `crescent_library` | 弦月图书馆 | 高穹顶、弧形阅览室、长桌台灯 | 室内暖白 | 古典学术氛围 |
| 10 | `scene_harbor_market.png` | `harbor_market` | 港口集市 | 摊位、街头小吃、复古杂货、热闹人群 | 白天明亮 | 港口边露天市场 |

**风格统一建议**：现代日漫/CG 写实混合，色温对应表中"时间/光线"列，不出现角色——纯环境图。

---

## 2. 角色资产（10 人 × 7 张 = 70 张）

每个角色 7 张：1 张默认立绘（`art_url`）+ 6 张情绪表情（`art_emotions`）。比例建议 **2:3 竖向（如 800×1200）**，透明背景 PNG，统一画师/风格。

### 2.1 角色总览

| # | ID | Name（英文） | 中文称呼 | 性别 | 年龄 | 关系定位 | 一句话画感提示 |
|---|---|---|---|---|---|---|---|
| 1 | `maya` | Maya Chen | 玛雅 | F | 26 | crush | 亚裔，肩长黑发常掖耳后，oversized 米色开衫，怀里抱速写本，安静敏感 |
| 2 | `ryan` | Ryan Park | 瑞恩 | M | 28 | colleague | 韩裔，高大，干净短发，灰蓝衬衫+卡其裤+旧跑鞋，温和理性 |
| 3 | `lila` | Lila Marchetti | 莉拉 | F | 30 | stranger | 意大利-巴西混血，波浪 auburn 发，绿眼，黑色服+一件亮眼配饰，冷艳神秘 |
| 4 | `ethan` | Ethan Williams | 伊森 | M | 27 | friend | 黑人，高大宽肩，平头，黑色运动服，灿烂笑容，阳光教练 |
| 5 | `sora` | Sora Aizawa | 苍空 | F | 24 | crush | 日本，瘦削，黑白渐变层次长发过肩，oversized 复古衣+多戒指，锐利眼线 |
| 6 | `marcus` | Marcus Reid | 马库斯 | M | 32 | friend | 欧裔混血，椒盐发，宽松毛衣+随身破旧笔记本，沉静睿智 |
| 7 | `aiko` | Aiko Tanaka | 爱子 | F | 29 | colleague | 日本，中长直发，极简米/黑装束，手持硬壳本+保温杯 |
| 8 | `jordan` | Jordan Lopez | 乔丹 | M | 26 | stranger | 拉丁裔，精瘦，棕卷发到肩，相机斜挂，颜料痕牛仔裤 |
| 9 | `iris` | Iris Bennett | 艾莉丝 | F | 31 | neighbor | 英国，棕卷发束起，舒适针织外套，温柔眼神，邻家妈妈感 |
| 10 | `theo` | Theo Nakamura | 西奥 | M | 28 | crush | 日裔加拿大，斜刘海，浅蓝/米软衫+围裙，温柔文艺 |

**性别配比**：5 男 5 女。用户在 app 的「Me」页面选偏好（Women / Men / Anyone），影响场景中出现频率。

### 2.2 情绪表情清单（每人 6 个）

| Key | 中文 | 表情提示 |
|---|---|---|
| `neutral` | 中性/默认 | 自然神情、嘴角放松、眼神专注 |
| `warm` | 温暖 | 眼神柔和，嘴角微微上扬，氛围温柔 |
| `playful` | 调皮 | 单边挑眉/斜眼一笑，半开玩笑感 |
| `guarded` | 戒备 | 抿唇、眼神收敛、稍微撇头 |
| `tense` | 紧张/不安 | 眉头微皱、嘴唇紧绷、视线略低 |
| `annoyed` | 烦躁/不满 | 皱眉、嘴角下压，明显不悦 |

> 表情图沿用默认立绘的构图、服装、配色，只换面部表情和身体微姿态，方便聊天界面平滑切换。

### 2.3 文件命名模板

每个角色一个子文件夹，命名规则：

```
portraits/<id>/<id>.png          # 默认立绘（art_url）
portraits/<id>/<id>_neutral.png  # neutral 表情
portraits/<id>/<id>_warm.png
portraits/<id>/<id>_playful.png
portraits/<id>/<id>_guarded.png
portraits/<id>/<id>_tense.png
portraits/<id>/<id>_annoyed.png
```

具体一份示例（maya 全集）：

```
portraits/maya/maya.png
portraits/maya/maya_neutral.png
portraits/maya/maya_warm.png
portraits/maya/maya_playful.png
portraits/maya/maya_guarded.png
portraits/maya/maya_tense.png
portraits/maya/maya_annoyed.png
```

10 人全集 = 10×7 = **70 张**。

### 2.4 角色 × 表情 完整勾选表

复制下表当 checklist 用，画完打 ✅：

| 角色 | default | neutral | warm | playful | guarded | tense | annoyed |
|---|---|---|---|---|---|---|---|
| maya |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| ryan |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| lila |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| ethan |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| sora |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| marcus |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| aiko |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| jordan |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| iris |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |
| theo |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |  ☐ |

---

## 3. 最低可玩集（先做这些就能跑）

- ✅ 10 张场景图（必须，否则 SceneCard 显示占位绿）
- ✅ 10 张角色默认立绘（必须，否则聊天界面 PortraitBar 显示首字母+表情符号占位）
- ✅ **4 套通用 milestone 装饰层模板**（first_date / confession / repair / anniversary 各一套）
- ⏳ 60 张情绪立绘（可后补；缺哪个 key 就自动回退到默认立绘）

**总量统计：** v1 必做 24 张（10 场景 + 10 立绘 + 4 装饰层），理想基础 84 张（再加 60 情绪立绘）。**v1 不做任何手绘专属 milestone CG**。

---

## 4. 里程碑装饰层（程序化合成方案）

**v1 不做手绘专属 milestone CG。** 里程碑画面在运行时由现有资产合成：

```
最终画面 = 现有 scene 图（背景） + companion neutral 立绘（主体） + 装饰层（边框/光效/标题卡） + 动态文字
```

10 角色 × 4 milestone × N 场景全自动覆盖，包括用户自创角色。

### 4.1 装饰层模板（4 套，v1 必做）

每套装饰层是一组**透明背景 PNG**，按图层叠在合成画面上。建议比例 16:9（匹配场景图），分辨率至少 1600×900。

| Milestone | 文件名 | 装饰基调 | 备注 |
|---|---|---|---|
| `first_date` | `milestone_first_date.png` | 暖金色光晕、柔光边框、星点粒子 | 浪漫开端的"特别瞬间"感 |
| `confession` | `milestone_confession.png` | 玫红 / 樱色渐变边框、心形或羽毛轻点缀 | 心意明朗化的高光 |
| `repair` | `milestone_repair.png` | 蓝紫色柔光、雨后初晴质感 | 脆弱后的和解 |
| `anniversary` | `milestone_anniversary.png` | 暖橙色 + 金箔风、纪念邮票感边框 | 长期陪伴的仪式感 |

### 4.2 装饰层制作规则

- **透明背景**，让 scene 图和立绘穿透
- **不出现具体角色或人物**——避免和 companion 立绘冲突
- 中心区域要"让位"给立绘（避免装饰挡脸或挡身体）
- 标题卡区域固定在画面顶部或底部（程序合成时叠文字）
- 装饰强度适中：要"特别"但不要"喧宾夺主"

### 4.3 标题文字（动态生成）

合成时由前端按模板填充，不需要美术制作。示例：

```
First Date with Maya
An evening at Pier Coffee Shop
2026-05-26
```

### 4.4 文件命名与路径

装饰层文件传到 R2：

```
companions/v1/milestones/milestone_first_date.png
companions/v1/milestones/milestone_confession.png
companions/v1/milestones/milestone_repair.png
companions/v1/milestones/milestone_anniversary.png
```

### 4.5 自创 companion 适配

用户自传的立绘自动用同一套装饰层合成 milestone 画面，零额外工作量。

### 4.6 v2+ 扩展（不在 v1 范围）

高付费意愿用户可解锁手绘专属 CG（如 Maya 的 `first_kiss` 独家版）作为收藏。v1 完全不做这一层，相关 memory `cg_url` 字段保留 nullable，给未来留接口。

---

## 5. 上线后接入

1. 把图片传到 R2 `companions/v1/scenes/...` 和 `companions/v1/portraits/<id>/...`。
2. 跑一次 update：
   ```sql
   UPDATE scenes SET art_url = 'scenes/scene_pier_coffee_shop.png' WHERE id = 'pier_coffee_shop';
   -- ...
   UPDATE companions
     SET art_url     = 'portraits/maya/maya.png',
         art_emotions= '{"neutral":"portraits/maya/maya_neutral.png","warm":"portraits/maya/maya_warm.png","playful":"portraits/maya/maya_playful.png","guarded":"portraits/maya/maya_guarded.png","tense":"portraits/maya/maya_tense.png","annoyed":"portraits/maya/maya_annoyed.png"}'
   WHERE id = 'maya';
   ```
3. App 端 `mediaUrl()` 会自动把相对路径补成 R2 完整 URL，不用改代码。
4. 4 套装饰层上传到 R2 `companions/v1/milestones/`，前端按 milestone 类型加载叠图；缺装饰层时 memory album 显示纯日记卡。
