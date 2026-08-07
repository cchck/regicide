// 手工给某个账号改密码。
//
//   npx tsx --env-file=.env scripts/set-password.ts <displayName 或 email> <新密码>
//
// 这是目前唯一的密码找回途径，而且是刻意的：发信通道要么发不进国内邮箱（Resend 之类），
// 要么要备案域名加实名（阿里云/腾讯云），为一个还没上线的游戏搭那套不划算。所以注册页
// 明说了「密码无法找回」，真有人找上来，就用这个脚本救一个。
//
// ⚠️ 接充值入口之前必须补上正规的重置流程。到那时「付了钱、忘了密码、没有任何办法」
// 就不再是体验问题，而是退款和投诉。
//
// 注意：session 用的是 JWT 策略，所以改完密码之后那个人已经签发的 token 仍然有效，
// 不会被踢下线。要做到「改密码即下线」得给 User 加 passwordChangedAt 并在 jwt 回调里
// 比对签发时间 —— 现在没做。

import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const PASSWORD_MIN = 6;
const PASSWORD_MAX_BYTES = 72; // bcrypt 静默截断的边界，和 signup 保持一致

async function main() {
  const [who, password] = process.argv.slice(2);
  if (!who || !password) {
    console.error('用法: npx tsx --env-file=.env scripts/set-password.ts <displayName 或 email> <新密码>');
    process.exit(1);
  }
  if (password.length < PASSWORD_MIN) {
    console.error(`密码至少 ${PASSWORD_MIN} 位`);
    process.exit(1);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    console.error(`密码最多 ${PASSWORD_MAX_BYTES} 字节`);
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const user = await prisma.user.findFirst({
    // 不区分大小写，和 grant-seals 一致：显示名是用户自己填的。
    where: {
      OR: [
        { displayName: { equals: who, mode: 'insensitive' } },
        { email: { equals: who, mode: 'insensitive' } },
      ],
    },
    select: { id: true, displayName: true, email: true },
  });

  if (!user) {
    console.error(`找不到账号: ${who}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  console.log(`${user.displayName} <${user.email}>`);
  console.log('  密码已重设。对方现有的登录状态不会失效（见文件头说明）。');

  await prisma.$disconnect();
}

main();
