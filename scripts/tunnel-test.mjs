// 一条命令拉起完整的"和朋友联机测试"环境：
//   1. 启动对战服务器 (3801)
//   2. 给它开 Cloudflare 隧道，抓到公网地址
//   3. 把地址写进 .env 的 NEXT_PUBLIC_WS_URL
//   4. 启动网站 (3000)
//   5. 给网站开隧道，打印发给朋友的链接
// 按 Ctrl+C 一次性关掉全部。
//
//   npm run tunnel-test

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const ROOT = process.cwd();
const ENV_PATH = `${ROOT}/.env`;
const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`\x1b[36m[联机测试]\x1b[0m ${msg}`);
}
function warn(msg) {
  console.log(`\x1b[33m[联机测试]\x1b[0m ${msg}`);
}
function die(msg) {
  console.error(`\x1b[31m[联机测试] ${msg}\x1b[0m`);
  shutdown(1);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('正在关闭全部进程…');
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// —— 前置检查 ——
if (spawnSync('cloudflared', ['--version']).status !== 0) {
  die('没找到 cloudflared。先装：brew install cloudflared');
}
if (!existsSync(ENV_PATH)) {
  die('没找到 .env。先复制 .env.example 为 .env 并填好 DATABASE_URL / AUTH_SECRET。');
}

// 确保 AUTH_TRUST_HOST=true 存在（隧道域名鉴权需要）。
function ensureEnvLine(key, value) {
  let text = readFileSync(ENV_PATH, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text = text.replace(/\s*$/, '') + `\n${key}=${value}\n`;
  writeFileSync(ENV_PATH, text);
}
ensureEnvLine('AUTH_TRUST_HOST', 'true');

// 启动一个子进程，转发它的输出，并在输出里搜隧道地址。
function start(name, cmd, args, onUrl) {
  const child = spawn(cmd, args, { cwd: ROOT, env: process.env });
  children.push(child);
  const scan = (buf) => {
    const s = buf.toString();
    process.stdout.write(`\x1b[90m[${name}]\x1b[0m ${s}`);
    if (onUrl) {
      const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        const cb = onUrl;
        onUrl = null; // 只回调一次
        cb(m[0]);
      }
    }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.on('exit', (code) => {
    if (!shuttingDown) warn(`${name} 退出了（code ${code}）。`);
  });
  return child;
}

function tunnel(name, port, onUrl) {
  const timer = setTimeout(() => die(`${name} 隧道 30 秒内没拿到地址，检查网络后重试。`), 30_000);
  start(name, 'cloudflared', ['tunnel', '--url', `http://localhost:${port}`], (url) => {
    clearTimeout(timer);
    onUrl(url);
  });
}

// —— 编排 ——
// 通过 npm run 间接启动，避免直接依赖 node_modules/.bin 里的 binary 路径。
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

log('① 启动对战服务器 (3801)…');
start('对战服务器', npm, ['run', 'ws']);

log('② 给对战服务器开隧道…');
tunnel('WS隧道', 3801, (wsUrl) => {
  log(`对战服务器公网地址：${wsUrl}`);
  ensureEnvLine('NEXT_PUBLIC_WS_URL', wsUrl);
  log('③ 已写入 .env → NEXT_PUBLIC_WS_URL');

  log('④ 启动网站 (3000)…');
  start('网站', npm, ['run', 'dev']);

  // 给 next 一点启动时间再开它的隧道。
  setTimeout(() => {
    log('⑤ 给网站开隧道…');
    tunnel('网站隧道', 3000, (siteUrl) => {
      const line = '═'.repeat(60);
      console.log(`\n\x1b[32m${line}\n  发给朋友的链接（你自己也用这条）：\n\n      ${siteUrl}\n\n  你和朋友各自打开 → 注册 → 进「决」→ 建房/输码入座\n  关闭：在本窗口按 Ctrl+C\n${line}\x1b[0m\n`);
    });
  }, 4000);
});
