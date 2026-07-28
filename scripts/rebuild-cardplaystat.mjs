// Rebuild CardPlayStat from CardPlayEvent — the aggregate is a pure function of the raw
// showdown log, but the round-shift migration only touched the events, leaving this cache
// stale (and inconsistent with the dossier, which reads events directly). One-time repair;
// safe to re-run.
//
//   node scripts/rebuild-cardplaystat.mjs           # dry run
//   node scripts/rebuild-cardplaystat.mjs --apply

import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
try { process.loadEnvFile('.env'); } catch {}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

// The public tendency = showdown plays only (folds never reveal a card). Group by
// userId/role/card/round exactly as recordRound would have, had it always been correct.
const events = await prisma.cardPlayEvent.findMany({ where: { folded: false } });
const agg = new Map(); // key -> count
for (const e of events) {
  const round = Math.min(Math.max(e.round, 1), 5);
  const k = `${e.userId}|${e.role}|${e.card}|${round}`;
  agg.set(k, (agg.get(k) ?? 0) + 1);
}

const before = await prisma.cardPlayStat.count();
console.log(`当前 CardPlayStat 行数: ${before}`);
console.log(`从 ${events.length} 个摊牌事件聚合出 ${agg.size} 行`);

if (!apply) {
  console.log('\n(dry run — 加 --apply 执行重建)');
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction([
  prisma.cardPlayStat.deleteMany({}),
  ...[...agg.entries()].map(([k, count]) => {
    const [userId, role, cardKind, round] = k.split('|');
    return prisma.cardPlayStat.create({
      data: { userId, role, cardKind, round: Number(round), count },
    });
  }),
]);

const after = await prisma.cardPlayStat.count();
console.log(`\n重建完成: ${before} → ${after} 行`);
await prisma.$disconnect();
