# 弑君 · 部署手册

两部分：**A. 现在就能用的免费联机测试**（跟朋友测），**B. 正式上线到香港服务器**。

---

## A. 免费联机测试（跟朋友测一局，不用买服务器）

原理：本机同时跑网站(3000)和对战服务器(3801)，用 **Cloudflare Tunnel** 把这两个端口各开一条免费公网 HTTPS 隧道，把网站那条 URL 发给朋友即可。隧道支持 WebSocket、免费、无需账号。

### 一次性准备
```bash
brew install cloudflared        # macOS
```
在 `.env` 里补两行（本地测试也要，否则 NextAuth 会拒绝隧道域名）：
```
AUTH_TRUST_HOST=true
```

### 每次测试的步骤（按顺序）
```bash
# 终端 1 —— 先开对战服务器的隧道，拿到它的公网地址
npm run ws
# 终端 2
cloudflared tunnel --url http://localhost:3801
#   ↑ 记下它给的地址，形如 https://xxxx-yyyy.trycloudflare.com
```
把这个 WS 地址填进 `.env`：
```
NEXT_PUBLIC_WS_URL=https://xxxx-yyyy.trycloudflare.com
```
（这个变量是**构建时/启动时注入**的，所以必须在启动网站之前填好。）
```bash
# 终端 3 —— 启动网站（dev 即可）
npm run dev
# 终端 4 —— 再给网站开一条隧道，这条 URL 是发给朋友的
cloudflared tunnel --url http://localhost:3000
#   ↑ 把这条 https://....trycloudflare.com 发给朋友
```
你和朋友各自打开**网站那条 URL** → 注册/登录 → 进「决」→ 一人建房出码、一人输码入座。

### 注意
- 免费快速隧道的地址**每次重启都会变**，所以换测试场次要重填 `NEXT_PUBLIC_WS_URL` 并重启网站。
- 数据库仍用你本机的 Postgres，朋友的账号也会写进你本地库。
- 想要固定地址（不用每次改），需要 Cloudflare 账号+域名做「命名隧道」，那就接近正式部署了 → 见 B。

---

## B. 正式上线（香港单服务器）

### B0. 买服务器
1. 阿里云或腾讯云控制台 → **轻量应用服务器** → 地域选 **中国香港**（够到国内也够到国外，且**免 ICP 备案**）。
2. 规格 **2核2G** 起，镜像选 **Ubuntu 22.04**，买最短周期先测。
3. 创建后在**防火墙/安全组**放行端口 **22 / 80 / 443**。
4. 记下公网 IP，设一个 root 或 sudo 用户密码/密钥。

### B1. 域名与 DNS（用 Cloudflare）
1. 域名托管到 Cloudflare（改 NS 到 CF）。
2. 加一条 **A 记录**：`@` 或 `game` → 你的服务器公网 IP，**开橙色云**（走 CF 代理，拿到 CDN + 防护）。
3. SSL/TLS 模式设 **Full (strict)**；在 CF「源站证书」里生成一张证书，把 `.pem`/`.key` 存到服务器 `/etc/ssl/regicide/`（对应 nginx 配置里的路径）。

### B2. 装环境（SSH 上服务器后）
```bash
# Node 20 LTS
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc && nvm install 20
# Postgres / Nginx / PM2 / tsx
sudo apt update && sudo apt install -y postgresql nginx git
npm i -g pm2
```

### B3. 数据库
```bash
sudo -u postgres createdb regicide
sudo -u postgres createuser --superuser $USER   # 或建专用用户并授权
```

### B4. 拉代码、配环境、迁移、构建
```bash
git clone <你的仓库> regicide && cd regicide
npm install                     # 注意：不要加 --production（WS 用 devDeps 里的 tsx）
```
新建 `.env`：
```
DATABASE_URL="postgresql://<用户>@localhost:5432/regicide?schema=public"
AUTH_SECRET="<和本地同一个：Next 和 WS 靠它签/验票据，必须一致>"
AUTH_TRUST_HOST=true
NEXT_PUBLIC_WS_URL=https://你的域名     # 同域名即可，Nginx 会按 /socket.io/ 分流
```
```bash
npx prisma migrate deploy && npx prisma generate
npm run build                   # NEXT_PUBLIC_WS_URL 在这一步被烤进前端，改了它要重新 build
```

### B5. 起进程（PM2 双进程）
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup                     # 照它打印的命令再敲一次，实现开机自启
```

### B6. Nginx 反代
```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/regicide
sudo ln -s /etc/nginx/sites-available/regicide /etc/nginx/sites-enabled/
sudo sed -i 's/your.domain/你的域名/g' /etc/nginx/sites-available/regicide
sudo nginx -t && sudo systemctl reload nginx
```

打开 `https://你的域名` 应能进大厅；进「决」建房、另一台设备入座即可联机。

### 三个必查的坑
1. **`AUTH_TRUST_HOST=true`** —— 不设 NextAuth 报 `UntrustedHost`。
2. **`NEXT_PUBLIC_WS_URL` 是构建时注入** —— 改了必须重新 `npm run build`。
3. **Nginx 的 `Upgrade`/`Connection` 头** —— 漏了 WebSocket 连不上，前端报 `WEBSOCKET ERROR`。

### 更新上线
```bash
git pull && npm install && npx prisma migrate deploy && npm run build && pm2 reload ecosystem.config.js
```
