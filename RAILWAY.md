# Railway 部署清单

仓库：<https://github.com/cchck/regicide>（private）

架构：**一个仓库、两个服务**（web + ws）+ 一个 Postgres。为什么不是 Cloudflare、
以及各项设计取舍见 [LAUNCH.md](LAUNCH.md)。

---

## 1. 建项目 + 数据库

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo** → 选 `regicide`
   （首次需授权 Railway 访问 GitHub；私有仓库要勾上）
2. 项目里 **+ New** → **Database** → **Add PostgreSQL**

Railway 会自动把 `DATABASE_URL` 注入同项目的服务。

## 2. 配 web 服务

刚才那次 GitHub 部署生成的服务就是 web。Settings 里改：

| 项 | 值 |
|---|---|
| Service Name | `web` |
| Build Command | 留空（默认 `npm run build`） |
| Start Command | `npm run start:web` |
| Networking | **Generate Domain**（记下这个域名，下一步要用） |

`start:web` = `prisma migrate deploy && next start`，所以**每次部署自动跑迁移**。

## 3. 配 ws 服务

**+ New** → **GitHub Repo** → 同一个 `regicide` 仓库（同仓库可建多个服务）。

| 项 | 值 |
|---|---|
| Service Name | `ws` |
| Start Command | `npm run start:ws` |
| Networking | **Generate Domain**（记下来） |

### ⚠️ 三个必须关掉的开关（不是可选项）

房间状态存在 ws 进程的内存里，崩溃恢复逻辑**假设只有一个写者**。多实例会导致
"A 建的房 B 找不到"，更糟的是启动恢复会互相干扰。

- **Replicas = 1**（Settings → Deploy → Replicas，绝不能 >1）
- **关闭 Autoscaling**
- **关闭 App Sleeping / Serverless**（睡了就断线判负）

## 4. 环境变量

两个服务都要 `DATABASE_URL`（Railway 自动注入，确认存在即可）。

### 生成 AUTH_SECRET

```bash
openssl rand -base64 32
```

**同一个值必须同时填进 web 和 ws** —— web 用它签发入场券，ws 用它验票。不一致的话
PvP 永远连不上（前端会一直显示"连接对战服务器中…"）。

### web 服务

| 变量 | 值 |
|---|---|
| `AUTH_SECRET` | 上面生成的值 |
| `AUTH_TRUST_HOST` | `true` |
| `NEXTAUTH_URL` | `https://<web 域名>` |
| `NEXT_PUBLIC_WS_URL` | `https://<ws 域名>` ← **ws 的域名，不是 web 的** |

`NEXT_PUBLIC_*` 是构建时嵌入的，**改了必须 redeploy web 才生效**。

### ws 服务

| 变量 | 值 |
|---|---|
| `AUTH_SECRET` | 与 web **完全相同** |
| `ALLOWED_ORIGIN` | `https://<web 域名>`（锁 CORS，留空则全放行） |

## 5. 验证

打开 `https://<web 域名>`：

1. 注册账号 → 大厅出现，右上角有筹码余额
2. 「习」新手引导能走完 → 3D 场景和音频正常
3. 「弈」AI 对战能打完一局 → 结算后余额变化
4. 「决」真人对战 → 建房拿到房间码，**换一个浏览器/无痕窗口**注册第二个账号，输码进房
   → 双方能对打（这一步能通过说明 `AUTH_SECRET` 和 `NEXT_PUBLIC_WS_URL` 都对了）

### 出问题先看这里

| 症状 | 原因 |
|---|---|
| 一直"连接对战服务器中…" | `NEXT_PUBLIC_WS_URL` 没配 / 配成了 web 域名 / 改了没 redeploy |
| "入场券无效或已过期" | 两个服务的 `AUTH_SECRET` 不一致 |
| ws 日志报 CORS | `ALLOWED_ORIGIN` 和实际 web 域名不匹配 |
| 页面 500、日志报表不存在 | 迁移没跑；确认 web 的 Start Command 是 `start:web` |

## 6. 成本

两个常驻服务 + Postgres，且 ws 不能睡 → 实测约 **$5–15/月**。Railway 有 $5 试用额度，
之后需要绑卡。

## 7. 部署后的日常

- **推 main 就自动部署**（web 和 ws 都会重新构建）
- ws 重启时**进行中的对局会自动恢复**（状态落库 + 计时器按存下来的 deadline 续上），
  玩家经历几十秒重连后继续。只有极个别恢复失败的桌会作废退款，并在大厅告知玩家。
- **改了 `GameState` 的结构**（`src/lib/types.ts`）→ 必须 bump `server/index.ts` 里的
  `STATE_VERSION`，否则旧存档会被当成能恢复的，反序列化出畸形状态。
