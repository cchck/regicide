# 上线到 Railway（一步步）

目标：玩家打开一个网址就能注册、建房、发房间码给朋友联机。约 30 分钟。

架构 = **同一个仓库、三个东西**：`web`（Next）+ `ws`（Socket.IO）+ Postgres。
关键约束：**`ws` 必须单实例、禁自动扩容、禁休眠**（房间状态在内存，靠 DB 落库恢复；多实例会互相误退款）。

---

## 0. 前置
- 代码推到 GitHub（Railway 从 GitHub 部署）。
- 注册 railway.app（GitHub 登录即可）。

## 1. 建项目 + Postgres
1. Railway → New Project → Deploy from GitHub repo → 选这个仓库。它会自动建**第一个服务**（先当作 `web`）。
2. 项目里 → New → Database → **Add PostgreSQL**。建好后 Railway 自动提供 `DATABASE_URL` 变量引用。

## 2. 配 web 服务
在这个服务的 **Settings / Variables**：
- **Variables**（Reference 里选 Postgres 的 `DATABASE_URL`，其余手填）：
  - `DATABASE_URL` = 引用 Postgres
  - `AUTH_SECRET` = 一串随机 32+ 字符（`openssl rand -base64 32`）。**记住它，ws 要用一模一样的。**
  - `NEXT_PUBLIC_WS_URL` = 先留空，等第 3 步拿到 ws 域名再填（**它会被打进前端包，必须在 build 前设好**）
- **Settings → Deploy**：
  - Build Command：留空（用默认 `npm run build`，`postinstall` 会自动 `prisma generate`）
  - **Start Command：`npm run start:web`**（= `prisma migrate deploy && next start`，迁移只在 web 跑）
- 先别急着让它成功，等 ws 建好拿到域名。

## 3. 建 ws 服务
1. 项目里 → New → **GitHub Repo**（同一个仓库，再加一个服务）→ 命名 `ws`。
2. 这个服务的 **Variables**：
  - `DATABASE_URL` = 引用同一个 Postgres
  - `AUTH_SECRET` = **和 web 完全相同的那串**
  - `WS_PORT` = 不用设，代码已优先读 Railway 注入的 `PORT`
  - `ALLOWED_ORIGIN` = web 服务的公网地址（第 4 步拿到后回填，例 `https://regicide-web.up.railway.app`）
3. **Settings → Deploy → Start Command：`npm run start:ws`**（跳过 next build，tsx 直接跑 TS）。
4. **Settings → Networking → Generate Domain**，拿到 ws 公网域名，例 `regicide-ws.up.railway.app`。
5. ⚠️ **Settings → 关掉 autoscaling / 副本数锁 1 / 不休眠**（Railway 默认单实例，别手动开多副本）。

