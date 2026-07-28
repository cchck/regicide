// 一次性数据修复：把 CardPlayEvent.round 向下移一位。
//
// 背景：客户端 AI 模式的 stats/play POST 一直发的是 state.roundNumber，而 applyRoundResult
// 已经在结算时把 roundNumber +1 了。所以第 N 回合被记成了 round=N+1。GameBoard.tsx
// 已经修好了发送 state.roundHistory.length；这个脚本清理历史遗留。
//
// PvP 服务端 recordRound 用的是 prev.roundNumber（正确），但它跟客户端混在同一张表里。
// 保守起见：所有 round >= 2 都 -1，round == 1 的少量事件删掉（大部分是错位后落地的"回合 0"
// 也即根本不该存在的边界残留，加上极少数正确的 PvP round=1）。
//
// 用法：node scripts/fix-round-shift.mjs           → 打印会做什么
//       node scripts/fix-round-shift.mjs --apply   → 真的做

import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
try { process.loadEnvFile('.env'); } catch {}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

const before = await prisma.cardPlayEvent.groupBy({
  by: ['role', 'round'],
  _count: { _all: true },
  orderBy: [{ role: 'asc' }, { round: 'asc' }],
});
console.log('修改前：');
for (const g of before) console.log(`  ${g.role.padEnd(8)} round=${g.round}   ${g._count._all}`);

const round1 = await prisma.cardPlayEvent.count({ where: { round: 1 } });
const others = await prisma.cardPlayEvent.count({ where: { round: { gte: 2 } } });
console.log(`\n计划：`);
console.log(`  删除 round=1 的事件: ${round1} 条`);
console.log(`  将 round >= 2 的事件 -1: ${others} 条`);

if (!apply) {
  console.log('\n(dry run — 加 --apply 真的执行)');
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction([
  prisma.cardPlayEvent.deleteMany({ where: { round: 1 } }),
  prisma.$executeRaw`UPDATE "CardPlayEvent" SET "round" = "round" - 1 WHERE "round" >= 2`,
]);

const after = await prisma.cardPlayEvent.groupBy({
  by: ['role', 'round'],
  _count: { _all: true },
  orderBy: [{ role: 'asc' }, { round: 'asc' }],
});
console.log('\n修改后：');
for (const g of after) console.log(`  ${g.role.padEnd(8)} round=${g.round}   ${g._count._all}`);
await prisma.$disconnect();
