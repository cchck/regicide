# 弑君 · 3D 资产生成指南（Phase 2）

工作流和音乐一样：**你拿下面的 prompt 去 AI 工具出资产 → 按约定文件名丢进 `public/models/` → 我来接骨骼动画和游戏事件**。

---

## ⚠️ 铁律：先减面，再绑骨

2026-07 实测：Meshy 默认导出的模型是 **569,304 三角面 / 27MB**，直接送去绑骨必挂，网页也加载不动。

**任何绑骨动作之前，先在 Meshy 里 Remesh 到约 3 万面再导出。**
顺序不能反——先绑骨再减面会把蒙皮权重毁掉。

目标规格：

| 项 | 目标值 |
|---|---|
| 面数 | **≤ 30k 三角面**（Meshy Remesh 里设 target） |
| 贴图 | 1K 或 2K（4K 是浪费，网页看不出差别） |
| 单模型体积 | ≤ 5MB |
| 文件名 | **纯 ASCII**，不要中文/①/全角冒号 —— Mixamo 遇到非 ASCII 文件名必挂 |

---

## 绑骨方案（按推荐度排序）

### 方案 A · Meshy 自带 Rig + Animate（推荐）

Meshy 现在内置绑骨和动画库，对我们这个角色是最优解：

- 认识自己生成的模型拓扑，**长袍及地、没有分开的腿**这种情况比 Mixamo 宽容得多
- 直接导出**带动画轨道的 GLB**，正好是项目要的格式，省掉格式转换
- 动画库里就有嘲讽/得意/愤怒这类情绪动作

步骤：Meshy 项目页 → **Remesh 到 30k** → **Rig** → **Animate**（逐个挑下表的动作）→ 导出 **GLB**

### 方案 B · Mixamo（长袍角色成功率不高）

只在方案 A 走不通时用。前提：已 Remesh 到 30k + 文件名纯 ASCII（`dealer.fbx`）。
Mixamo 靠识别四肢来绑骨，及地长袍找不到腿，很可能失败或绑出鬼东西。

### 方案 C · AccuRIG（Reallusion 免费桌面工具）

比 Mixamo 宽容，绑好后可以再套 Mixamo/ActorCore 的动画。方案 A、B 都挂了再考虑。

---

## ① 主角：兜帽庄家（最重要的一个）

### 血泪经验（来自 hand 的三次失败，务必先读）

**Meshy 对"形态"敏感，对"意图"迟钝。**

- ❌ 说 `fingers curled as if holding cards`（描述意图）→ 给你一只五指张开的平摊手
- ❌ 让它把牌一起生成（加物体）→ 主体细节被吞，手指糊成连指手套
- ✅ 说 `closed into a firm fist, individual fingers clearly defined`（描述形状）→ 成了

**所以下面 prompt 的每一句都在描述形状，不描述气质。**

### ⚠️ 腿必须露出来

上一版 dealer 绑骨失败，八成是因为**及地长袍把腿藏死了**——Meshy 绑骨文档明确要求 "clearly defined limbs and body structure"，找不到腿就失败。

**解法**：让袍子开衩、露出分开的双腿和靴子。**游戏里他坐在桌后，下半身你根本看不见**，但绑骨器需要看见。这是纯技术让步，不影响观感。

### Prompt（直接复制）

```
A tall hooded figure standing upright, arms held down and away from the body,
legs straight and clearly separated apart, both boots visible. A deep pointed hood
with a hollow dark empty opening where the face would be, no face. Long black robe
that opens at the front below the waist, showing both legs and knee-high boots.
Heavy cloth folds, a dark red sash across the chest, a small round red medallion on
a gold chain, black gloves on both hands. Matte fabric, completely non-reflective.
Symmetrical. Full body from head to boots.
```

### Negative prompt（也直接复制）

```
shiny, glossy, latex, wet look, plastic, bright colors, cartoon, cute, visible face,
eyes, skin, weapons, asymmetry, floor-length dress hiding legs, legs together,
fused legs, mermaid tail, sitting, crossed arms, T-pose arms raised
```

### 生成设置

| 设置项 | 值 | 为什么 |
|---|---|---|
| **Model type** | **智能拓扑**（Smart Topology） | 描述里直接写着"适合游戏、实时使用"；「标准」是给 3D 打印/渲染的高密度三角面糊 |
| **Topology** | **四边面（Quad）** | **绑骨角色必须**。边环顺着形体走，骨头一弯褶皱自然折叠；三角面在关节处会挤压破面。three.js 加载时自动三角化，运行时零代价 |
| **Target polycount** | **30000** | 绑骨 API 上限 30 万，但实际 3 万最稳；网页也加载得动 |
| **Pose** | **A-pose** | 绑骨的绑定姿势，**必须**。不是最终姿势，坐姿由动画决定 |
| **PBR** | 开 | 要 normal/roughness 贴图，补回智能拓扑省掉的褶皱细节 |
| **格式** | **GLB** | 项目直接用这个 |

> **静态道具（hand / eardrill / chair / 吊灯…）反而该选三角面 + 标准**——它们不绑骨，不存在形变问题。四边面只对要动的角色重要。

### 之后的步骤

1. **Rig（绑骨）**：`height_meters` 填 **1.8**。绑完先在 Meshy 的预览里转一圈看骨骼有没有绑歪
2. **Animate（套动画）**：按下面清单逐个加
3. **导出单个 GLB**，放 `public/models/dealer.glb`

### 动画清单

对手是这游戏里唯一的"人"，他的情绪就是心理博弈的一半。每个动作我都会绑到具体的对局事件上。

> **网页 UI 里按名字搜，不显示 action_id**（数字只有 API 用得上）。下表的"搜这个"列直接拿去搜。

| 我们的轨道名 | 触发时机 | **在 UI 里搜这个名字** | 坐/站 | action_id |
|---|---|---|---|---|
| `idle` | 平时待机 | **`Chair_Sit_Idle_M`** | ✅ 坐 | 33 |
| `taunt` | **他加注**（挑衅） | **`Chest_Pound_Taunt`** | 站 | 88 |
| `win` | 他赢下一局 | **`Sitting_Clap`** | ✅ 坐 | 354 |
| `think` | 轮到他决策 | `Confused_Scratch` | 站 | 36 |
| `angry` | 他输掉一局 | `Stand_Talking_Angry` | 站 | 311 |
| `hit` | 被弑君 | `Hit_Reaction` | 站 | 178 |
| `idle` 备选 | | `Sit_on_Chair_Arms_Crossed` | ✅ 坐 | 364 |

搜不到全名就搜关键词：`Chair` / `Sit` 能翻出坐姿那几个，`Taunt` 只有一个结果。

**优先级**：额度有限就先要 **`Chair_Sit_Idle_M`** 和 **`Chest_Pound_Taunt`**，这俩占 90% 出场时间。

**库的限制（重要）**：**整个库里坐姿动画只有 4 个** —— `Chair_Sit_Idle_F`(32)、`Chair_Sit_Idle_M`(33)、`Sit_on_Chair_Arms_Crossed`(364)、`Sitting_Clap`(354)。其余全是站姿。

但站姿动画**能用**：他坐在桌后，下半身被桌子完全挡住，迈步和重心晃动看不见，露出来的只有上半身手势。`Chest_Pound_Taunt`（捶胸挑衅）正好是纯上半身动作。

**「逗乐」库里没有笑的动画**，最接近的 `Joyful_Dance_with_Hand_Sway`(405) 太蹦跶了。先跳过。

**导出**：加完动作后导出**单个 GLB** → `public/models/dealer.glb`

> **动画轨道名不用纠结**——GLB 丢给我，我读出里面实际的轨道名再对着绑事件，改名是我这边的事。

### 交付给我时说一声

我拿到 `dealer.glb` 后会做：加载接入、动画状态机（按对局事件切动作+平滑过渡）、发光眼睛和读心红眼迁移到新模型头骨、材质压掉生成器烤进去的反光、坐姿位置和椅子。

## ② 优先级排序（按"屏幕停留时间 × 当前粗糙度"）

场景里还是代码拼基本体的东西，按性价比排：

### Tier 1 — 必做

| 文件名 | 现状 | 为什么优先 |
|---|---|---|
| `dealer.glb` | 旋转体+圆管 | 唯一的"人"，见上文 ① |
| `hand.glb` | **2 胶囊+1 圆柱+1 球+1 环** | **离相机最近、100% 时间在屏幕上**，第一人称里玩家的手是廉价感的第一告密者 |
| `eardrill.glb` | 方块+圆柱+圆锥 | **游戏的灵魂道具**，转头就在耳边，Kaiji 的符号 |
| `spectator.glb` | **1 个胶囊体** | 9 个药丸围一圈，最假的东西 |

### Tier 2 — 值得做

| 文件名 | 现状 |
|---|---|
| `chair.glb` | 不存在（坐姿庄家需要） |
| `chandelier.glb` | 圆环+球+圆锥 |
| `column.glb` | 方块+阶梯帽 |

### ❌ 别浪费额度

- **卡牌** —— 是平的，美术是 canvas 画的 2D 矢量图，3D 模型没意义
- **筹码** —— InstancedMesh 批量渲染几百个，圆柱+金边够用；换模型反而拖性能
- **地板/墙/幕布** —— 平面 + PBR 贴图就是正确做法
- **牌桌** —— 大部分被毡面/牌/筹码盖住，只露一圈桌沿

---

## ③ Prompt 清单

**通用后缀**（每条都加）：`Game-ready, clean topology, PBR materials, low poly, dark Art Deco, muted colors: matte black, deep blood red, antique gold.`

### Tier 1

**`hand.glb`** —— 只要**一只**，我在代码里镜像出另一只
> A single gloved left hand, palm up, fingers curled as if holding playing cards.
> Elegant black leather glove, dark red cuff band at the wrist, short sleeve stub.
> 1920s formal gambler. Isolated hand only, no arm, no body.

**`eardrill.glb`** —— 别怕做得夸张，这东西就该吓人
> A menacing antique torture machine: a long sharp steel spike on a threaded screw
> feed rail, mounted on a heavy iron gallows post bolted to the floor. Brass ratchet
> gear, pressure gauge dial, small red warning lamp, a restraint ring at the tip.
> Rusted iron and tarnished brass, old bloodstains near the needle. Industrial horror,
> 1920s. Sinister execution device.

**`spectator.glb`** —— 站姿，我会复制一圈并各自微调
> A man in a 1920s black three-piece suit standing still, hands clasped in front,
> head slightly lowered, face completely in shadow / featureless. Motionless observer,
> ominous silhouette.

### Tier 2

**`chair.glb`**
> An ornate Art Deco high-back armchair, dark wood frame with gold inlay, deep red
> velvet upholstery, fan-shaped back. Throne-like, sinister elegance.

**`chandelier.glb`**
> An Art Deco chandelier: a brass ring with eight candle holders, stepped geometric
> finial below, hanging rod above. Tarnished gold, crystal accents.

**`column.glb`**
> A fluted Art Deco column with a stepped capital, dark stone with vertical gold
> inlay strips.

---

## ④ 氛围道具（额度充裕时，收益比换柱子高）

这些**现在场景里压根没有**，是赌博默示录的经典符号：

| 文件名 | Prompt 核心 |
|---|---|
| `cigar.glb` | A lit cigar resting on an ornate brass ashtray, ash tip glowing（我会配烟雾粒子） |
| `whiskey.glb` | A crystal whiskey decanter and a half-full tumbler, amber liquid |
| `cash.glb` | Stacks of banded 1920s banknotes, tied bundles（堆桌边，提醒你在赌什么） |
| `cardshoe.glb` | A casino card dealing shoe, dark wood and brass |
| `camera.glb` | An old surveillance camera on a wall bracket, 1920s industrial（墙角，压迫感） |

**放置路径**：全部 `public/models/` 下按上表命名。

## ③ 排错记录（踩过的坑）

**症状：Mixamo 上传一直失败。** 2026-07 实测原因有三，通常是叠加的：

1. **文件名非 ASCII** —— Meshy 导出的名字带 `①`、中文、**全角冒号 `：`**，Mixamo 几乎必挂。改成 `dealer.fbx`。
2. **面数爆炸** —— 默认导出 569,304 面，远超自动绑骨的实际承受量（~5 万）。先 Remesh。
3. **及地长袍没有分开的腿** —— Mixamo 靠识别四肢绑骨，找不到腿就失败。这也是推荐改用 Meshy 自带绑骨的主要原因。

## ④ 注意事项

- 单个模型面数控制在 **30k 三角面以内**（Meshy 导出时可选目标面数），全套资产 gzip 后控制在 ~15MB
- 材质选 **PBR**（会带 albedo/normal/roughness 贴图），贴图 1K 或 2K
- 拿到文件后丢进 `public/models/`，告诉我一声，我来做：加载接入、骨骼动画绑游戏事件（下注时前倾、开牌甩袖、被弑君踉跄）、发光眼睛和读心红眼迁移到头骨、材质微调进主题色

---

## 已入库的道具（2026-07-17）

五个 Meshy 道具已接入 `TableScene`。**每一个的尺寸都不是估的**：Meshy 会把所有导出归一化到
~1.9 的盒子里，所以模型自带的尺寸毫无意义，全部按"这东西现实里多大"重新定标。

场景比例：**1 米 ≈ 1.85 单位**（1.8 米的庄家是 3.33 单位高）。

| 模型 | 现实尺寸 | 缩放 | 位置 | 备注 |
|---|---|---|---|---|
| `chandelier.glb` | 直径 113cm | 1.1 | 底部锁死在 y=2.575 | 底部高度是取景约束，见下 |
| `column.glb` | 柱身直径 89cm | 3.68 | x=±3.2/±6.0, z=-5.4 | 地板→天花板 7.0 单位，缩放是推导的 |
| `cigar.glb` | 烟灰缸宽 14cm | 0.136 | (-1.9, -1.0) | |
| `whiskey.glb` | 酒瓶+杯 共宽 26cm | 0.256 | (1.9, -1.0) | X 剖面中间是空的 → 两个独立物件 |
| `cash.glb` | 钞票堆宽 30cm | 0.292 | (-1.3, -1.95) | |

### 关键约束（别手贱改成写死的值）

- **道具的 Y 永远不要手填**。代码里是 `TABLE_SURFACE_Y - minY * scale`，`minY` 是从 GLB 量出来的
  包围盒下沿。这样调桌子高度时道具会自动跟着走，不会悬空也不会陷进桌面。
- **吊灯从 `CHANDELIER_BOTTOM` 反推**，不是从中心。2.175 会挡住庄家的头（头顶在 2.262），
  3.575 会完全飞出画面。2.575 是唯一可用的。换模型/改缩放都不会破坏取景。
- **柱子的缩放是推导的**（`(CEILING_Y - FLOOR_Y) / 1.9`），改层高会自动跟。旧的程序化柱子
  间距 1.2，对 0.9 宽的方块没问题，但这个模型底座直径 2.05，会互相穿模——所以布局重排过。

## 压缩管线（`node scripts/optimize-models.mjs`）

**244MB → 4.1MB。** 原始文件备份在 `public/models/_raw/`，脚本每次都从备份重压，可反复运行。

四步：减面 → 贴图缩放 → WebP → **meshopt**。

### 两个踩过的坑

1. **`cash` 减面减不动**。ratio 设 0.015（目标 2.3 万面）实际只到 10.7 万，而且把 error 从
   0.02 放宽到 0.12 只多减了 12 个三角形——说明卡住的不是误差限制，是拓扑。它是几百张独立的
   钞票，每张一个 UV 岛，meshoptimizer 不跨接缝合并，几乎每条边都是不可折叠的边界。`weld`
   也没用（焊完顶点数一个没少 = 顶点是真的不同，不是重复）。
   **面数减不下去就压体积**：meshopt 把它从 5.3MB 压到 1.34MB。

2. **用 meshopt，不要用 Draco**。效果差不多，但 Draco 的解码器默认从 `gstatic.com` 的 CDN 拉，
   **国内访问会挂**——而这个项目是要国内外兼顾的。meshopt 的解码器来自 `three-stdlib`，
   打包在本地。drei 的 `useGLTF` 默认 `useMeshopt=true`，所以前端一行都不用改。

---

# 商城 / 场景升级：三个待生成模型（2026-08-02）

三个都是**静态道具**，不绑骨、不需要 A-pose。共用设置：

| 设置项 | 值 |
|---|---|
| Model type | **智能拓扑**（Smart Topology） |
| Topology | **三角面**（Triangle）— 不绑骨就不需要 Quad |
| Target polycount | **30000** |
| Pose | 不适用 |
| PBR | **开** |
| 格式 | **GLB** |

**通用铁律**（血泪来自 hand 那三次失败）：Meshy 只认**形态**，不认**意图**。
永远只让它生成**一个物件**——让它"顺便"生成配套物品，结果一定是糊在一起、且和我们自己的美术冲突。

---

## ① `table_deco` — 装饰艺术赌桌

> A single round Art Deco casino card table, viewed as one standalone object.
> Circular tabletop with dark green felt inset in the center, surrounded by a wide
> padded leather armrest rail in oxblood red. Polished black lacquer edge banding with
> thin inlaid brass pinstripes forming concentric rings. Heavy fluted central pedestal
> column widening into a stepped octagonal base. 1930s luxury, symmetrical, clean
> geometry, empty tabletop.

**Negative:**
> chairs, stools, people, cards, playing cards, poker chips, dice, glasses, bottles,
> ashtray, clutter, objects on table, rectangular table, modern, plastic, low quality

**要点**：`empty tabletop` + negative 里排掉牌/筹码是关键——桌上任何东西都会和我们已有的
3D 筹码堆、牌、道具打架。

---

## ② `sconce_deco` — 扇形壁灯

> A single Art Deco wall sconce, one standalone object. A fan of nine slender vertical
> brass blades spreading upward and outward from a stepped semicircular base, like a
> sunburst. Frosted glass panels between the blades. Polished aged brass with dark
> patina in the recesses. The back is completely flat for flush wall mounting.
> Symmetrical, 1930s theater lighting fixture.

**Negative:**
> wall, background, ceiling, lamp post, floor lamp, chandelier, cable, wire, plug,
> round back, deep body, people, low quality

**要点**：`back is completely flat` 必须写进正面词，negative 里再排一次 `round back`。
它要贴墙，背面鼓出来就会穿模。同时排掉 `wall`，否则会连一整块墙一起生成。

---

## ③ `ceiling_rose` — 天花板藻井

> A single Art Deco ceiling rosette medallion, one standalone object, shallow relief.
> Concentric stepped rings radiating from a central circular boss, with a sunburst
> pattern of tapered rays between the rings. Sharp geometric chevron detailing.
> Dark bronze with gold leaf highlights on the raised edges. Flat back, shallow depth
> like architectural plaster molding. Symmetrical, viewed from directly below.

**Negative:**
> chandelier, lamp, light bulb, hanging fixture, chain, deep dome, sphere, room,
> ceiling, walls, furniture, people, low quality

**要点**：`shallow relief` + `flat back` + negative 排掉 `deep dome`。它是贴在天花板上的
浅浮雕，做成深穹顶就会垂下来撞到吊灯。也要排掉 `chandelier`——藻井和吊灯是两件东西，
让它一起生成会得到一个四不像。

---

## 拿到 GLB 之后

1. 丢进 `public/models/`，命名 `table_deco.glb` / `sconce_deco.glb` / `ceiling_rose.glb`
2. 在 `scripts/optimize-models.mjs` 的 `PLAN` 里加三条（参考现有条目的 ratio/tex 写法）
3. `node scripts/optimize-models.mjs`
4. 接线：桌子/壁灯/藻井分别替换 `Table()` / `FanSconce()` / `Ceiling()` 里的程序化几何，
   并在 `lib/shop.ts` 把对应商品的 `ready` 改成 `true`
