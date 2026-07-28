# 上线前状态清单（2026-07-18）

## 已修（P0）

| 项 | 修法 | 位置 |
|---|---|---|
| 结算金额客户端说了算（可无限刷筹码） | `match/start` 在 `User.activeStake` 记录实际入桌额；`match/end` 要求存在未结算记录、封顶 2×（零和博弈的理论极限）、结算即关闭。作弊上限 = 一场真实完胜的合法收益 | `api/match/start`, `api/match/end`, schema `activeStake` |
| AI 局刷新/崩溃 = 买入蒸发 | 每次 dispatch 把 `GameState` 快照进 localStorage（教程除外）；大厅检测到快照弹"重返牌桌/弃权"；弃权会以 0 关闭服务端的结算记录；对局中加 `beforeunload` 拦截 | `GameBoard` `RESUME_KEY` 一带, engine `RESTORE` action |
| 首次加载纯黑屏 | `LoadingVeil`：金线进度条 + 百分比，内嵌在 TableScene，所有 3D 页面共享；缓存热启动有 200ms 宽限不闪幕 | `TableScene` `LoadingVeil` |

## 未修（P1，上线周内）

- [ ] **移动端/竖屏无提示**：hover 选牌在触屏不存在。检测后提示横屏/桌面端。
- [ ] **WebGL 不可用直接白屏**：加 ErrorBoundary 兜底页。
- [ ] **救济金入口可见性**：目前只在 AI 设置页 balance<100 时出现；破产玩家在大厅看不到。
- [ ] favicon（OG 分享图已做，见打牌人格系统）。
- [ ] AI 局中途"返回大厅"没有二次确认（买入直接弃权）。

## 上线部署（决定：Railway PaaS + 崩溃退款）

**为什么不是 Cloudflare**：PvP 服务器（`server/index.ts`）是**常驻单实例 Socket.IO 进程**，房间状态
在内存 `Map` 里、计时器也是内存的。Cloudflare Workers/Pages 跑不了常驻 Node 进程，要上就得把 ws
重写成 Durable Object（扔掉 Socket.IO）+ Next 换 OpenNext + Prisma 换 Hyperdrive——好几天的重写。
所以 **Cloudflare 只当门面（DNS/CDN/SSL/DDoS）不托管应用**；应用本体上 PaaS。

**选 Railway**（先国外，国内暂不管；国内要顺畅得换 Fly.io 香港节点或香港 VM）。

### Railway 架构（两个服务，一个仓库）
- **web 服务**：`npm run build` + `npm start`，监听 `$PORT`。跑 Next（页面 + API + 出票 `/api/pvp/ticket`）。
- **ws 服务**：`npm run ws`，监听 `WS_PORT`。**必须锁死单实例、禁自动扩容、禁休眠**——房间在内存，
  多实例会导致"A 建的房 B 找不到"，而**启动退款逻辑在多实例下会把别的实例的活局全退掉（灾难）**。
- **Postgres**：Railway 托管插件，`DATABASE_URL` 自动注入。发布时跑 `prisma migrate deploy`。

### 两个服务必须对齐的环境变量
- `AUTH_SECRET`：**两个服务必须一模一样**。Next 用它签入场券，ws 用它验票，不一致就永远连不上。
- `NEXT_PUBLIC_WS_URL`：web 服务设成 ws 服务的公网地址（`wss://xxx.up.railway.app`）。默认值是
  `http://localhost:3801`，不改则线上连不到。
- `DATABASE_URL`：两个服务都要（ws 也直接读写 Prisma）。
- ws 的 CORS 现在是 `origin: true`（全放行）。上线应收紧到 web 域名（见下方待确认）。

### 断局恢复（已实现：重启后对局继续，不波及任何人）

**主路径是恢复，不是退款。** `PvpRoom` 表镜像每个活房（`armTimers` 是所有中途状态变化的
唯一收口，在那里 upsert）；进程启动时 `bootRecover()` 把所有活房读回内存、按**存下来的
deadline** 重装计时器（不重置 45 秒），玩家客户端自动重连即接着打。部署/重启**不影响任何
进行中的对局**。

`pvpStake` 退化为**每桌独立的安全网**：只有某一桌恢复失败（`STATE_VERSION` 变了、或解析
异常）才作废那一桌、退那两个人，**其他桌照常恢复**。改 GameState 形状时记得 bump
`STATE_VERSION`。

**已修的三个真 bug（评审时发现，都验证过）**：
1. **恢复中结束对局导致重复退款**：`rearmOnRestore` 遇到过期 deadline 会同步推进，可能直接
   结束对局；`settlePair` 是异步的，`refundOrphans` 抢在它提交前扫描 → 同一笔退两次。
   修法：`inFlightSettlements` 集合 + 孤儿扫描前 `await Promise.allSettled`。
2. **无条件 increment 造成重复退款**：`refundOrphans` / `voidRoomRow` 原本无条件加钱。
   改成 `updateMany({ where: { pvpStake: { not: null } } })`，靠影响行数判断是否真退了。
3. **等待房遇重启，房主永远卡在等待界面**：等待房不落库（没扣钱），重启即消失，但客户端
   不知道。加 `room-alive` 事件，客户端每次 (re)connect 用 `waitingCodeRef` 复查。

**账目验证**：埋一个 deadline 已过期的活局跑恢复，`chips + pvpStake` 总额零和守恒（1200），
无重复退款、无蒸发。

**玩家提示**：`PvpNotice` 表存"待领回执"。作废退款时写一条，玩家下次连上 ws 推给他并删除，
大厅显示「上一场对局已作废 · 买入 N 筹码已全额退回」——而不是让他对着空大厅以为是 bug。

### 旧方案（已废弃）：崩溃即全部作废退款
PaaS 会因部署/健康检查/机器迁移**主动重启** ws 进程，一重启内存里的活局全没。做法照搬 AI 模式的
`activeStake`：
- `User.pvpStake Int?`：**入座**（join-room 那个原子事务）时和扣买入一起写上 `pvpStake = buyIn`。
- **正常结算**（finishMatch / forfeit 里的 `settle`）：`chips += 带出额`，**同一条 update 里 `pvpStake = null`**。
  破产方带出额为 0 也要清（否则会被下面的启动退款误退）。
- **进程启动**：查所有 `pvpStake != null` 的用户 = 崩溃遗留的活局，`chips += pvpStake; pvpStake = null`，
  **对局作废、双方各退买入**（不判胜负、不记战绩）。因为新进程启动时没有任何活房，所以所有非空
  stake 一定都是孤儿，全退是对的——**前提是单实例**。
- **读心购买不退**：读心花的 20% 是即时消费（信息已给），不进 pvpStake，崩溃不退，可接受。

状态：schema 已加 `pvpStake` 字段，迁移和 server 改动**待完成**（等确认下方产品决策后落地）。

### 成本 / 注意
- 两个常驻服务 + Postgres，ws 不能休眠 → 实测约 **$5–15/月**，非永久免费。
- 4MB 模型由 Next 直接发，够用；以后想加速再把 Cloudflare 挂前面缓存 `/models`。

## 打牌人格系统（16型 · MBTI 式）

- `src/lib/persona-data.ts` — 16 型定义（大名号/小名/一句话/描述/天敌/流派/拉丁码）
- `src/lib/persona.ts` — 纯函数，从战绩算四轴（血性/时机/止损/虚实）。阈值都标了理由，
  上线后可整体切成"人群中位数切分"保证每型都有人。**≥30 摊牌回合**才解锁。
- `src/components/PersonaBadge.tsx` + `FactionSigil.tsx` — 徽章卡（密档 & 公开页共用）
- 密档页顶部人格英雄区（火漆裂开式 `persona-reveal` 揭晓）；未满 30 场显示"人格待定 · 再打 N 场"
- 公开页 `/type/[latin]`（16 型预生成）+ 病毒回流 CTA；分享链接用 `?a=&u=&h=&r=` 带个人数据
- 动态 OG 图 `/type/[latin]/opengraph-image`

### OG 图的中文字体（真正的坑在哪）

OG 是**全中文**的（思源宋 Bold），字体在 `public/fonts/persona-sc.ttf`（84KB，Google Fonts
`&text=` 子集，只含 16 型名号 + 固定串用到的 ~240 个字形）。

**踩过的坑，务必记住**：satori 报的 `Cannot read properties of undefined (reading '258')`
**不是字体问题**（换了三种字体都报，误导了半天）——真正原因是 JSX 里用了
**8 位带透明度的 hex 颜色**（`#c49a3022` 这种）和**动态计算的样式键**，satori 的颜色解析器不认。
修法：OG 里所有颜色预转成 `rgba()`，每个 div 显式 `display:flex`，不用 textShadow。改完字体一次就过。

字体是子集，**改了任何人格名号就要重新子集化**：`fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&text=<所有中文字>`
拿 url，下下来放回 `public/fonts/persona-sc.ttf`。

## 主界面（全 3D 场景 + 底部悬浮牌匾）

大厅 = 真实赌桌场景的门口机位（庄家每 14s 鼓掌招呼一次）。入口是**一整块黄铜牌匾**：
五个分段由发丝级竖线分隔、共享一条不断的顶部铜轨，切角为两端尖的六边形，
悬浮在离底边 56px 处——牌桌的金环仍能从下方读出来。悬停时该分段顶部亮起一道
accent 条 + 暖色渐层上涌。
点「习/弈」相机滑入座位（1.9s）再进入流程；「决/档/榜」直接跳页（不属于这张桌子）。

### 试过但放弃的方案

**入口做进 3D 场景**（绒布上的实体黄铜牌位，几何全部解算过：弧线半径 1.85 / 张角 92° /
逐块朝向机位把视线夹角压进 7°）——实际观感不好，已完整移除。若将来重试，几何笔记见
git 历史；关键教训是牌位若跟随弧线法向而非各自朝向相机，最外两块会侧倾 65° 完全读不清。

### 布局陷阱（已踩过）

- 大厅 DOM 层必须用 `fixed`，不能用 `absolute`：下面的场景层是 `fixed`，而 DOM 树里没有
  定位祖先，两者会解析到**不同的包含块** —— 这正是当初底栏偏离画面中心的原因。
- 居中要落在 flex 行本身，不要靠子元素的 `max-w + mx-auto`（同样会被包含块问题带偏）。
