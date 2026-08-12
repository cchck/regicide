// 一次性给某个账号发金印。
//
//   npx tsx --env-file=.env scripts/grant-seals.ts <displayName 或 email> <数量>
//
// 只动 seals，不碰 chips —— 两种货币是刻意分开的（见 schema 里 User.seals 上的注释）：
// 金印只买外观，永远不能拿去赌。所以发金印不影响任何对局的收支平衡，也绕不过
// activeStake / pvpStake 那套结算钳制。

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const [who, amountRaw] = process.argv.slice(2);
if (!who || !amountRaw) {
  console.error('用法: npx tsx --env-file=.env scripts/grant-seals.ts <displayName 或 email> <数量>');
  process.exit(1);
}
const amount = Number(amountRaw);
if (!Number.isInteger(amount) || amount === 0) {
  console.error('数量必须是非零整数');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Wrapped rather than top-level await: tsx transpiles .ts in this project to CJS, which
// has no top-level await.
async function main() {
const user = await prisma.user.findFirst({
  // 不区分大小写：显示名是用户自己填的，记不住大小写不该成为障碍。
  where: {
    OR: [
      { displayName: { equals: who, mode: 'insensitive' } },
      { email: { equals: who, mode: 'insensitive' } },
    ],
  },
  select: { id: true, displayName: true, email: true, seals: true, chips: true },
});

if (!user) {
  console.error(`找不到账号: ${who}`);
    await prisma.$disconnect();
  process.exit(1);
}

const after = await prisma.user.update({
  where: { id: user.id },
  data: { seals: { increment: amount } },
  select: { seals: true },
});

console.log(`${user.displayName} <${user.email}>`);
console.log(`  金印  ${user.seals} → ${after.seals}   (${amount > 0 ? '+' : ''}${amount})`);
console.log(`  筹码  ${user.chips}   (未改动)`);

  await prisma.$disconnect();
}

main();
