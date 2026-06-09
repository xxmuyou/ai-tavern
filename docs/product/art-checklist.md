# 美术清单（场景图 + 角色立绘 + 情绪表情 + 里程碑装饰层）

> 单页对照表，照抄即可。所有资产的最终命名 / 路径以本表为准；上传到 R2 后把 URL 填回数据库（`scenes.art_url` / `companions.art_url` / `companions.art_emotions`）。
>
> 路径前缀：本地预览放在 `apps/app/assets/ai-companion/scenes/`、`apps/app/assets/ai-companion/portraits/`、`apps/app/assets/ai-companion/milestones/` 下；正式资源传 R2 `companions/v1/` bucket。
>
> **设计边界：** v1 不做手绘专属里程碑 CG。里程碑画面由现有立绘 + 场景图 + 通用装饰层程序合成（见 §4）。装饰层只增强视觉记忆点，不替代场景图、不替代聊天表情、也不改变 companion 的基础设定。手绘专属 CG 留给 v2+。

---

## 1. 场景图（V2：24 张，建议比例 16:9，至少 1600×900）

| # | 文件名 | 场景 ID | 中文名 | 氛围关键词 | 时间/光线 | 备注 |
|---|---|---|---|---|---|---|
| 1 | `central_station_plaza.png` | `central_station_plaza` | 中央车站广场 | 车站广场、玻璃雨棚、城市通勤、偶遇 | 清晨柔光 | 公共初遇场景，中心留白 |
| 2 | `pier_cafe.png` | `pier_cafe` | 码头咖啡馆 | 海边咖啡馆、木质柜台、窗外海面、温暖 | 傍晚金色阳光 | 旧码头咖啡馆的 V2 版本 |
| 3 | `midnight_convenience_store.png` | `midnight_convenience_store` | 深夜便利店 | 雨夜、便利店灯光、自动贩卖机、湿路面 | 深夜荧光 | 不要真实品牌或可读招牌 |
| 4 | `rainlit_bookshop.png` | `rainlit_bookshop` | 雨光书店 | 雨天玻璃、旧书架、阅读灯、安静 | 雨天下午 | 旧书店的 V2 版本 |
| 5 | `apartment_lobby.png` | `apartment_lobby` | 公寓大厅 | 信箱、电梯、绿植、住宅熟悉感 | 傍晚暖光 | 邻居/熟悉阶段 |
| 6 | `shared_laundry_room.png` | `shared_laundry_room` | 公共洗衣房 | 洗衣机、夜晚、生活琐事、低风险坦白 | 夜间冷白 | 机器靠边，不挡角色 |
| 7 | `neighborhood_park.png` | `neighborhood_park` | 社区公园 | 小公园、长椅、树、住宅天际线 | 傍晚柔光 | 无人，避免家庭/跑者 |
| 8 | `creative_studio.png` | `creative_studio` | 创意工作室 | 草图、模型、共享工作台、晚光 | 下午暖光 | 抽象草图不能有可读文字 |
| 9 | `indie_cinema.png` | `indie_cinema` | 独立影院 | 小影院大厅、软灯、红地毯、约会前奏 | 夜晚暖光 | 海报用抽象色块 |
| 10 | `dessert_parlor.png` | `dessert_parlor` | 甜品店 | 蛋糕柜、粉彩、明亮、轻约会 | 下午明亮 | 柜台在后方或侧边 |
| 11 | `vinyl_record_shop.png` | `vinyl_record_shop` | 黑胶唱片店 | 黑胶、试听角、暖灯、雨窗 | 傍晚/雨天 | 唱片封面不可读、不可像真实版权 |
| 12 | `riverside_walk.png` | `riverside_walk` | 河岸步道 | 蓝调时刻、栏杆、桥灯、水面反射 | 傍晚蓝调 | 步道中心留白 |
| 13 | `skyline_roof_garden.png` | `skyline_roof_garden` | 天际线屋顶花园 | 夜景、玻璃栏杆、绿植、坦白氛围 | 深夜冷暖混合 | 旧天台的 V2 版本，眼平视角 |
| 14 | `last_bus_stop.png` | `last_bus_stop` | 末班巴士站 | 雨后、路灯、空站台、将要离开 | 深夜 | 站牌和路线图不可读 |
| 15 | `crescent_reading_room.png` | `crescent_reading_room` | 弦月阅览室 | 图书馆、弧形阅览室、长桌灯、安静 | 室内暖白 | 旧图书馆的 V2 版本 |
| 16 | `rain_arcade.png` | `rain_arcade` | 雨后拱廊 | 商店街拱廊、雨后反光、怀旧、半空 | 夜晚 | 招牌全部抽象化 |
| 17 | `iron_forge_gym.png` | `iron_forge_gym` | 铁炉健身房 | 老派器械、橡胶地、晨光、努力 | 清晨冷光 | 旧健身房的 V2 版本 |
| 18 | `harbor_weekend_market.png` | `harbor_weekend_market` | 港口周末市集 | 摊位、海港、彩色遮阳棚、活力 | 白天明亮 | 旧港口市集的 V2 版本，无人群 |
| 19 | `underground_livehouse.png` | `underground_livehouse` | 地下 Livehouse | 小舞台、彩灯、乐器、空场后劲 | 夜晚舞台光 | 舞台在后方，前景空地 |
| 20 | `neon_game_arcade.png` | `neon_game_arcade` | 霓虹游戏厅 | 街机、柔和霓虹、玩笑、竞争感 | 夜晚霓虹 | 避免过饱和和拥挤机器 |
| 21 | `midnight_hotel_suite.png` | `midnight_hotel_suite` | 午夜酒店套房 | 套房卧室、雨窗、城市灯、成熟私密 | 深夜暖灯 | 可见整洁床，无人、无露骨 |
| 22 | `private_apartment_bedroom.png` | `private_apartment_bedroom` | 私人公寓卧室 | 整洁床、台灯、书、信任感 | 夜晚暖光 | 生活化私密，不要凌乱床铺 |
| 23 | `rainfall_window_lounge.png` | `rainfall_window_lounge` | 雨窗休息区 | 高层窗、雨、低沙发、成熟安静 | 深夜暖光 | 沙发靠边，不做暗示性构图 |
| 24 | `dawn_balcony.png` | `dawn_balcony` | 黎明阳台 | 雨后清晨、阳台、城市苏醒、长夜之后 | 黎明金光 | 阳台地面留白 |

**风格统一要求**：Japanese visual novel background / anime dating sim BG。不要照片感、不要 3D 渲染、不要真实品牌或可读文字、不要人物；强中下部留白，稳定眼平透视，避免桌椅/器械/前景物件遮挡角色立绘。

**私密场景边界**：允许卧室、酒店套房、床、深夜室内等空间元素；必须无人、无裸露、无性行为、无露骨道具、无凌乱床铺，只保留成熟浪漫氛围。

---

## 2. 角色资产（10 人 × 7 张 = 70 张）

理想集每个官方角色 7 张：1 张默认立绘（`art_url`）+ 6 张情绪表情（`art_emotions`）。比例建议 **2:3 竖向（如 800×1200）**，官方可复用立绘优先透明背景 PNG，统一画师/风格。

**抠图边界（2026-06-03）：**
- 抠图 / 透明背景适合可复用立绘、情绪变体、里程碑合成层，因为这些资产会叠到不同 UI 或场景里。
- 自创角色的基础头像 / neutral 图不强制抠图；上传图可以直接作为最终 `art_url`。
- Chat Moment Image 是完整场景瞬间图，不做人物抠图、前景/背景合成或立绘替换，详见 [`spec-027`](../specs/spec-027-chat-moment-images.md)。
- 因此，不要把“所有图片都要抠图”当作生产要求；只有需要跨场景复用的 sprite-like 资产才要求透明背景。

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
   UPDATE scenes SET art_url = 'scenes/pier_cafe.png' WHERE id = 'pier_cafe';
   -- ...
   UPDATE companions
     SET art_url     = 'portraits/maya/maya.png',
         art_emotions= '{"neutral":"portraits/maya/maya_neutral.png","warm":"portraits/maya/maya_warm.png","playful":"portraits/maya/maya_playful.png","guarded":"portraits/maya/maya_guarded.png","tense":"portraits/maya/maya_tense.png","annoyed":"portraits/maya/maya_annoyed.png"}'
   WHERE id = 'maya';
   ```
3. App 端 `mediaUrl()` 会自动把相对路径补成 R2 完整 URL，不用改代码。
4. App 本地 `LOCAL_MEDIA` 映射只在 24 张 V2 scene 图片实际落到 `apps/app/assets/ai-companion/scenes/` 后更新，不要提前引用不存在的文件。
5. 4 套装饰层上传到 R2 `companions/v1/milestones/`，前端按 milestone 类型加载叠图；缺装饰层时 memory album 显示纯日记卡。
