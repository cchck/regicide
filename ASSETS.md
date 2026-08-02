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

---

# 第二批商城模型（2026-08-02）

设置同上：**智能拓扑 + 三角面 + 30000 面 + PBR + GLB**，不绑骨。

**写 prompt 的教训**：Meshy 只认**具体形态**。"ornate / luxurious / decorated" 这类抽象词
基本无效，必须写出**能被建模的结构**——"a ring of raised brass studs"、"eight scalloped
lobes"、"upswept lip"。抽象词换来的只是贴图上的花纹，不是几何。

**庄家装束和耳钻暂不做**：庄家带骨骼动画（换模型要重跑绑骨 + 重新解算 `SEAT_FIX` 胯骨偏移），
耳钻做了针身/机身几何切分（换模型要重新剖面）。这两个是「可能做完接不进去」的，等其余稳定再攻。

---

## ① `table_obsidian` — 黑曜石台（牌桌 ◈900）

> A single round casino card table carved from polished black obsidian, one standalone
> object. The circular tabletop edge is scalloped into twelve shallow lobes, each lobe
> rising into a raised lip. A band of protruding polished brass studs runs around the
> rim below the lip, one stud per lobe. Recessed dark grey suede playing surface inset
> in the center, ringed by a thin brass channel. The apron beneath the top is carved
> into deep vertical flutes. Faceted angular obsidian pedestal with sharp planes and
> brass corner brackets where it meets the tabletop, widening into a stepped hexagonal
> base with a brass foot ring. Glossy black volcanic glass, cold and severe.
> Empty tabletop.

**Negative:** `chairs, people, cards, playing cards, poker chips, dice, glasses, bottles, clutter, objects on table, rectangular table, wood, ornate floral carving, smooth plain edge, flat rim, low quality`

## ② `table_jade` — 血玉牌桌（牌桌 ◈2200 · 传世）

> A single round casino card table carved from blood jade, one standalone object.
> The tabletop rim is sculpted into eight upswept scrolling waves that curl upward like
> cresting foam, each wave tipped with a gold cap. Between the waves, raised carved
> dragon-scale panels in relief. A gold cloisonné band inlaid below the rim. Dark green
> baize inset in the center inside a raised gold ring. Translucent deep red jade shot
> through with darker crimson veins, subsurface glow, waxy polish. Heavy carved jade
> pedestal wrapped by a coiling gold dragon, standing on a black lacquer base with gold
> claw feet. Empty tabletop.

**Negative:** `chairs, people, cards, playing cards, poker chips, dice, glasses, bottles, clutter, objects on table, rectangular table, plastic, bright pink, smooth plain edge, flat rim, low quality`

## ③ `chandelier_skull` — 骨灯（灯具 ◈1000）

> A single hanging chandelier of bone and gold, one standalone object, symmetrical and
> radially arranged. A ring of pale skulls facing outward, each capped with a small gold
> crown and a lit candle standing on it, wax running down into the eye sockets. The
> skulls' jaws and brow ridges are plated with engraved gold. Curved polished brass arms
> radiate from a central gold hub cast with sunburst rays. Strings of small gold beads
> and bone finger-bones hang in swags between the arms. A short brass chain and mounting
> ring at the very top for hanging. Weathered ivory bone against warm gilt brass,
> dripping wax.

**Negative:** `ceiling, room, walls, floor, background, table, person, body, skeleton figure, standing lamp, floor lamp, cable, wire, plastic, low quality`

## ④ `throne_bone` — 骨王座（座椅 ◈1800 · 传世）

> A single high-backed throne of bone and gold, one standalone object, viewed from the
> front, symmetrical. Tall fan-shaped backrest of vertical rib bones bound together with
> gold bands, each rib tipped with a gold finial, and a row of gold-crowned skulls along
> the top edge. Armrests ending in gilded skulls with gold teeth. Oxblood leather seat
> cushion held by a gold-studded border. Heavy bone legs sheathed in engraved gold
> cuffs, standing on gold claw feet. Weathered ivory bone against warm gilt gold,
> barbaric but regal.

**Negative:** `person, sitting figure, body, skeleton sitting, table, room, floor, background, cushion pile, throne room, plain bone, low quality`

---

**每条 negative 里的针对性排除别删**：
- 两张桌子排掉 `cards / poker chips / glasses` —— 桌面上任何东西都会和我们已有的 3D 筹码堆打架
- 两张桌子排掉 `smooth plain edge, flat rim` —— 这批就是为了要边缘起伏，不排掉它会给你一个平边
- 骨灯排掉 `skeleton figure` —— 否则会得到一具站着的骷髅
- 骨王座排掉 `person / skeleton sitting` —— 否则椅子上自带一个人

---

# 第三批：桌面陈设套装（2026-08-02）

`props` 槽是一整套三件，摆在绒布上**同样的三个锚点**（`PROP_ANCHORS` 在 TableScene 里）：
左（-1.9, -1.05）、右（1.9, -1.0）、远（-1.3, -1.95）。这三个位置一次性验算过和筹码堆、
底池、庄家双手的间距（最近 0.46，距桌沿 2.38 内），新套装直接继承，不用重新审。

设置同前：**智能拓扑 + 三角面 + 30000 面 + PBR + GLB**。

**每件都是"一个物件"**——托盘/碟子上摆着东西算一个物件，Meshy 能做；让它同时生成三件
散落的东西只会糊成一团（hand 那次的教训）。

---

## 套装 A · `props.collateral` 抵押物（◈550 · 珍稀）

> 主题：输红眼的人押在桌上的东西。和「当铺」这个店名互文——你买的装饰，是别人的家当。

### A1 `prop_ring` — 婚戒与怀表（左锚点）
> A single small pewter dish holding a woman's gold wedding ring and an open silver
> pocket watch with a cracked crystal, one standalone object seen from above at a slight
> angle. The watch chain spills over the rim of the dish. Tarnished metal, worn gold,
> a hairline crack across the watch face. Shallow, compact, sits flat on a table.

**Negative:** `hand, fingers, person, table, cloth, background, jewelry box, many rings, pile of jewelry, floating, low quality`

### A2 `prop_ticket` — 当票与火漆（右锚点）
> A single short stack of yellowed pawn tickets on a table, one standalone object.
> The top ticket is stamped with a red wax seal and pierced by a brass spike stand that
> holds the stack together. A stubby ink stamp lies against the base of the spike.
> Foxed paper, dried red wax, tarnished brass. Compact and flat.

**Negative:** `hand, person, table, desk, background, books, scroll, open book, floating, tall stack, low quality`

### A3 `prop_teeth` — 义眼与金牙（远锚点）
> A single small open velvet-lined box on a table, one standalone object, seen from
> above at a slight angle. Inside on dark red velvet lie three gold teeth and one glass
> eye. The box lid is open and folded back. Worn black leather outside, deep red velvet
> inside, dull gold, glossy glass. Small, shallow, sits flat.

**Negative:** `hand, person, skull, full denture, mouth, table, background, jewelry, coins, closed box, floating, low quality`

---

## 套装 B · `props.eastern` 东方局（◈550 · 珍稀）

> 主题：同样的恶习，另一套器物。香炉带烟——复用雪茄那套烟雾系统。

### B1 `prop_teapot` — 紫砂壶与杯（左锚点）
> A single small purple-clay Yixing teapot with one matching tea cup beside it on a
> round clay tray, one standalone object. Unglazed dark purple-brown clay with a matte
> stony surface, a simple bamboo-knot handle and spout. The cup is half full of dark
> tea. Compact, low, sits flat on a table.

**Negative:** `hand, person, table, cloth, background, tea set, many cups, porcelain, glossy glaze, bright colors, teapot on stove, floating, low quality`

### B2 `prop_coins` — 铜钱串与算珠（右锚点）
> A single coiled string of antique Chinese square-holed bronze coins lying on a table,
> one standalone object, with three loose coins fallen beside the coil and a small
> counting-bead marker resting on top. Dark green-black patina on aged bronze, frayed
> red silk cord. Flat, compact, sits directly on the surface.

**Negative:** `hand, person, table, background, purse, bag, modern coins, gold ingots, stacked tall, abacus frame, floating, low quality`

### B3 `prop_incense` — 铜香炉（远锚点·带烟）
> A single small bronze incense burner on three short legs, one standalone object, with
> two lit incense sticks standing upright in its ash bed and glowing orange at the tips.
> A squat round belly, two loop handles at the rim, engraved cloud patterns. Dark
> patinated bronze, pale grey ash. Compact and low.

**Negative:** `smoke, fog, mist, hand, person, table, altar, background, temple, large censer, tall pedestal, many sticks, floating, low quality`

> ⚠️ B3 的 negative 里**必须排掉 smoke/fog** —— 烟是我们代码里的粒子系统画的
> （`Smoke` 组件，接在 `smokeTip` 上）。让 Meshy 把烟建成几何，只会得到一坨白色多边形。

### ✅ 已交付（2026-08-02）— 附两个坑

三件都进游戏了，压缩后 24.4MB → 0.71MB。但**有两件几何是错的**，修正脚本在
`scripts/fix-eastern-props.mjs`，必须在 `optimize-models.mjs` 之前跑：

- **`prop_coins` 是立着的。** 最薄轴是 Z（±0.20），最高轴是 Y（±0.95）—— 整串铜钱
  被生成成一块面朝 ±Z 的薄板，像贴墙的牌子而不是摊在桌上。绕 X 转 -90° 修正。
  → 教训：prompt 里写了 "lying on a table / flat"，Meshy 照样按正视图出。
  **收到扁平类物件先量 bbox，最薄的那个轴必须是 Y。**

- **`prop_incense` 带悬空碎片。** 沿 Y 切片：炉身在 [-0.93, -0.19]，中间六个 bin
  **完全是空的**，然后 [0.46, 0.93] 有 342 个顶点缩在 X[0.34,0.48] Z[0.36,0.46] 一个
  角落里。那是本该插在灰里的两支香，被甩到了半空。切掉，香改用两根圆柱程序化生成
  （`PropDef.sticks`），顺带拿到准确的烟源点。
  → 教训：**negative 里排掉 smoke 不等于香会长对地方。** 细长附属物（香、签、羽毛）
  Meshy 经常做成不连接的独立块。收到后按主轴切片看有没有断层。

> 几何修正一律在压缩前做。meshopt 会把顶点位置量化成归一化 int16 + 节点级反量化缩放，
> 压完之后读到的坐标不再是模型空间数值 —— 耳钻那次分裂就是栽在这。

---

## 拿到之后

丢进 `public/models/`，在 `scripts/optimize-models.mjs` 的 PLAN 里加条目（`ratio: null, tex: 512`
就够，这些在桌上只占几十像素），跑一次压缩；然后在 TableScene 的 `PROP_SETS` 里加两个数组、
`lib/shop.ts` 里加两件商品。摆放尺寸按真实物件大小填（茶壶 ~14cm，香炉 ~12cm，碟子 ~11cm）。

---

# 第四批：庄家面具（新槽位 · 2026-08-02）

**为什么是面具而不是整套装束**：庄家是**带骨骼动画**的，换整个模型要重跑绑骨 + 重新解算
`SEAT_FIX` 的三轴胯骨偏移（当初为了修"屁股穿过椅子"，那些数字是从 GLB 的 Hips 通道里
一帧帧读出来的）。而面具是**静态道具挂在头骨上**——和眼睛发光一样用 `createPortal` 挂到
`Head` bone，零绑骨、零重算，而且它盖住的正好是画面焦点。

头骨实测（模型空间，坐姿）：宽 0.213 / 高 0.288 / 深 0.340，`DEALER_SCALE` 1.85 之后
世界尺寸约 39 × 53 × 63cm。面具做到脸宽即可。

设置同前：**智能拓扑 + 三角面 + 30000 面 + PBR + GLB**，不绑骨、不要 A-pose。

---

## ① `mask_porcelain` — 白瓷面具（◈500 · 精制）

> A single ceramic face mask, one standalone object, front view, hollow on the back.
> A smooth featureless white porcelain face with no mouth, only two narrow almond eye
> slits and a faint nose ridge. A single hairline crack runs from the left eye slit down
> to the jaw, its edges stained brown with age. Glazed bone-white ceramic with fine
> crazing. Two small holes at the temples for a cord.

**Negative:** `head, skull, face of a person, person, mannequin, bust, neck, hair, wall, wall mount, stand, display case, full helmet, solid back, smiling, low quality`

## ② `mask_plague` — 鸟嘴面具（◈900 · 珍稀）

> A single plague doctor mask, one standalone object, front view, hollow on the back.
> A long tapering leather beak curving downward, two round glass lenses in brass rims
> set above it, and riveted brass bands running along the seams. Dark oiled blackened
> leather, tarnished brass rivets, smoked amber glass. Buckled leather straps hanging
> loose at the sides.

**Negative:** `head, skull, person, mannequin, bust, neck, hat, wide brim hat, robe, body, wall, stand, display case, solid back, bird, crow, low quality`

## ③ `mask_gilt` — 金裂面具（◈1600 · 传世）

> A single ceremonial face mask, one standalone object, front view, hollow on the back.
> A serene closed-eyed face broken into several pieces and rejoined, every crack filled
> with a thick raised seam of gold in the kintsugi manner. The base material is matte
> black lacquer, so the gold veins blaze across it. Narrow eye slits, a closed line of a
> mouth, a small gold crown ridge across the brow.

**Negative:** `head, skull, person, mannequin, bust, neck, hair, wall, stand, display case, solid back, whole unbroken face, smiling, low quality`

---

**三条 negative 的共同要点**：
- 排掉 `head / skull / person / mannequin / bust / neck` —— 否则会连一颗头一起生成，
  挂到骨头上就是两颗头
- 排掉 `wall / stand / display case` —— 否则会得到一个挂在墙上的展品
- 排掉 `solid back` + 正面写 `hollow on the back` —— 它要罩在脸上，背面实心会插进头里

拿到之后：`useGLTF` 加载 → `createPortal` 到 `Head` bone（和 `eyes` 一样）→ 面具本地坐标
约 `[0, 0.02, 0.13]`（眼睛在 z=0.11，面具要再往外一点）→ 尺寸按头宽 0.213 反推缩放。

---

# 第五批：东方套补全 + 黄铜耳钻（2026-08-02）

盘过一遍后剩下的**全部**待生成项。设置同前：**智能拓扑 + 三角面 + 30000 面 + PBR + GLB**，
不绑骨、不要 A-pose。

**不需要 Meshy 的三件**（别浪费额度）：
- `cardBack.gilt` / `cardBack.blood` —— 牌背是平面，canvas 画贴图
- `dealer.priest / general / child` —— 庄家带骨骼动画，换整模要重绑骨 + 重解 `SEAT_FIX`
  的三轴胯骨偏移。**建议从 shop.ts 里删掉这三条**，第四批的面具就是它们的替代方案

---

## 为什么是"东方套"

商城现在有一条完整的 Deco 线（装饰艺术赌桌 / 黄铜吊灯 / 鎏金王座 / 午夜沙龙 / 绅士的恶习），
但东方向只有孤零零两件：`table.jade` 血玉牌桌 和 `props.eastern` 东方局。再补四件就凑成
**第二条可收集的完整审美线**，玩家有第二个攒金印的目标，而不是买完 Deco 就没东西买了。

补完之后：血玉牌桌 + 东方局 + 太师椅 + 檀木厅 + 宫灯 + 傩面。

---

## ① `seat_taishi` — 太师椅（`seat.taishi` ◈700 · 珍稀）

对面那位坐的东西。参照现有 `chair.glb`（鎏金王座）的体量：高背、有扶手、正面朝镜头。

> A single traditional Chinese taishi armchair, one standalone object, front view.
> A tall straight rectangular back panel of dark rosewood inlaid with a single oval slab
> of grey-veined marble at its centre, flat horizontal armrests on curved supports, and a
> deep carved apron under the seat. Pierced lattice fretwork in the corners of the
> backrest. Nearly black lacquered rosewood with worn brass corner fittings, and a thin
> crimson silk cushion on the seat. Heavy, upright, symmetrical.

**Negative:** `person, seated figure, table, desk, room, background, floor, pair of chairs, two chairs, cushion only, stool, folding chair, modern chair, office chair, wheels, low quality`

## ② `column_rosewood` — 檀木格栅立柱（`room.eastern` 之一）

远景立柱，会**复制 4 份**且占满画面高度，所以轮廓比细节重要。参照 `column.glb`。

> A single tall vertical architectural column of dark carved rosewood, one standalone
> object, front view, standing upright. A square-section post with pierced geometric
> lattice screens set into its upper two thirds, a lotus-carved capital at the top and a
> plain stone plinth at the base. Very dark red-brown wood with worn gilt edging on the
> lattice ribs. Tall and narrow, straight, symmetrical.

**Negative:** `person, room, building, temple, wall, floor, background, multiple columns, colonnade, pagoda, roof, lantern hanging, horizontal, tilted, broken, low quality`

## ③ `ceiling_rosewood` — 藻井（`room.eastern` 之二）

天花板中央装饰，抬头才看得到。参照 `ceiling_rose.glb`：**扁平、朝下、无厚度支撑**。

> A single square coffered ceiling medallion in the Chinese caisson manner, one standalone
> object, viewed from directly below, flat and shallow. Concentric recessed square and
> octagonal frames stepping inward to a central carved lotus boss, every frame edged with
> pierced lattice and painted panels in faded vermilion and jade green. Dark rosewood with
> flaking gold leaf on the raised mouldings. Flat back, shallow depth.

**Negative:** `person, room, building, temple interior, walls, floor, hanging lamp, chandelier, chain, deep dome, tall, side view, perspective view, low quality`

## ④ `lantern_palace` — 宫灯（`light.palace` ◈850 · 珍稀）

吊灯槽位。会挂在 `CHANDELIER_BOTTOM`，代码按实测半高定位，所以**要一个自带吊挂结构的
完整灯具**，不需要天花板。参照 `chandelier.glb`。

> A single hanging Chinese palace lantern, one standalone object, front view, hanging.
> A six-sided lantern with a carved rosewood frame, each panel a pane of aged silk glowing
> warm amber, painted with faint ink landscapes. A tiered pagoda-style cap above, six
> small brass bells at the lower corners, and long crimson silk tassels hanging beneath.
> A short chain and ring at the very top for hanging. Dark wood, tarnished brass, warm
> translucent silk.

**Negative:** `ceiling, room, background, person, hand holding, pole, stand, floor lamp, table lamp, multiple lanterns, string of lanterns, candle, fire, smoke, low quality`

## ⑤ `mask_nuo` — 傩面（`mask.nuo` ◈1100 · 珍稀）

面具槽位第四件，配东方套。约束同第四批那三条（挂 `Head` bone，背面必须是空的）。

> A single Chinese Nuo opera exorcism mask, one standalone object, front view, hollow on
> the back. A fierce carved wooden face with bulging round eyes, thick arched brows, bared
> teeth and a pair of short curved horns at the temples. Painted in cracked vermilion,
> black and gold lacquer over visible woodgrain, the paint chipped away at the nose and
> chin. Two cord holes at the sides.

**Negative:** `head, skull, person, mannequin, bust, neck, hair, beard, body, wall, wall mount, stand, display case, solid back, helmet, low quality`

---

## ⑥ `drill_brass` — 黄铜耳钻（`drill.brass` ◈380 · 精制）

### ⚠️ 这条的 prompt 和直觉是反的：**不要针**

现有 `eardrill.glb` 的针是从模型里**切出来**的——`SPIKE_SPLIT_X = -0.5` 配合
`NEEDLE_MAX_R = 0.16` 做双条件切分，再把切出来的针单独做伸出和旋转。那四个常数是
**针对那一个模型解出来的**，换个模型全部作废，而且 Meshy 未必给你一根轴向干净的细针
（第一次那个模型的针实际范围是 x ∈ [-0.953, -0.50]，我按 -0.62 切，直接切在针身中间，
结果输一局就裂开）。

但代码里**本来就有一根程序化的 shaft**（`TableScene.tsx` 那个 `visible={false}` 的
cylinder）。所以新钻头只要机身，针我用圆柱画 —— 切分问题直接不存在，顺带还能精确控制
伸出速度和震动。

> A single brass ear-drilling machine head on an articulated arm mount, one standalone
> object, side view. A polished brass cylindrical motor housing with cooling fins and a
> knurled adjustment collar, mounted on a jointed arm with visible pivot bolts and a
> counterweight at the rear. An empty chuck at the front where a bit would be fitted,
> its three jaws open and holding nothing. Engraved maker's plate on the housing.
> Polished yellow brass with tarnish in the recesses, dark steel pivots.

**Negative:** `needle, spike, drill bit, pin, spear, long thin rod, sharp point, person, ear, head, table, floor, stand, tripod, background, dentist chair, low quality`

> `empty chuck ... holding nothing` + negative 里的 `needle / drill bit / spike / long thin
> rod` 是同一件事说两遍，因为"钻头"这个词天然会拽出一根针。拿到之后先量 bbox：
> 最长轴不应该超过第二长轴的 2 倍，超了就说明还是长了根针出来。

---

## 拿到之后要写的代码

| 件 | 代码量 | 说明 |
|---|---|---|
| 面具 ×4 | 中 | 新槽位 `mask`，`createPortal` 到 `Head` bone，本地约 `[0, 0.02, 0.13]` |
| 太师椅 | 小 | `SEAT_MODEL` 表加一行 |
| 宫灯 | 小 | `LIGHT_MODEL` 表加一行 |
| 檀木厅 ×2 | **中** | `room` 现在是 `look.room === 'room.deco'` 的布尔开关，要改成表驱动 |
| 黄铜耳钻 | 中 | `DRILL_MODEL` 表 + 把现有那根程序化 shaft 从 `visible={false}` 接出来 |

