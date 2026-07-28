import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
try { process.loadEnvFile('.env'); } catch {}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const users = await prisma.user.findMany({ select: { id: true, email: true, displayName: true } });
console.log('用户列表:');
for (const u of users) console.log(`  ${u.id.slice(0,10)}…  ${u.displayName ?? '-'}  ${u.email}`);

const grouped = await prisma.cardPlayEvent.groupBy({
  by: ['userId', 'role', 'round'],
  _count: { _all: true },
  orderBy: [{ userId: 'asc' }, { role: 'asc' }, { round: 'asc' }],
});
console.log('\nrole/round 事件数分布:');
let last = null;
for (const g of grouped) {
  if (g.userId !== last) { console.log(`\n用户 ${g.userId.slice(0,10)}…`); last = g.userId; }
  console.log(`   ${g.role.padEnd(8)}  round=${g.round}   ${g._count._all}`);
}
await prisma.$disconnect();
