# 美术清单（场景图 + 角色立绘 + 情绪表情）

> 单页对照表，照抄即可。所有资产的最终命名 / 路径以本表为准；上传到 R2 后把 URL 填回数据库（`scenes.art_url` / `companions.art_url` / `companions.art_emotions`）。
>
> 路径前缀：本地预览放在 `apps/app/assets/ai-companion/scenes/`、`apps/app/assets/ai-companion/portraits/` 下；正式资源传 R2 `companions/v1/` bucket。

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
- ⏳ 60 张情绪立绘（可后补；缺哪个 key 就自动回退到默认立绘）

**总量统计：** 必做 20 张，理想 80 张（10 场景 + 70 角色资产）。

---

## 4. 上线后接入

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
