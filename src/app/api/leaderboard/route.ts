import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// The blood ledger. Five boards on one endpoint:
//   chips    — account balance, all time
//   winrate  — round win rate (min 10 rounds to qualify)
//   wins     — rounds won, all time
//   weekly   — rounds won in the last 7 days
//   regicide — successful slave-kills-emperor at showdown
const BOARDS = ['chips', 'winrate', 'wins', 'weekly', 'regicide'] as const;
type Board = (typeof BOARDS)[number];

const TOP_N = 50;
const WINRATE_MIN_ROUNDS = 10;

interface Entry {
  userId: string;
  value: number;
  sub?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const board = (url.searchParams.get('board') ?? 'chips') as Board;
  if (!BOARDS.includes(board)) {
    return NextResponse.json({ error: '未知榜单' }, { status: 400 });
  }
  const session = await auth();
  const meId = session?.user?.id ?? null;

  let entries: Entry[] = [];

  if (board === 'chips') {
    const users = await prisma.user.findMany({
      orderBy: { chips: 'desc' },
      select: { id: true, chips: true },
    });
    entries = users.map((u) => ({ userId: u.id, value: u.chips }));
  } else if (board === 'winrate') {
    const [totals, wins] = await Promise.all([
      prisma.cardPlayEvent.groupBy({ by: ['userId'], _count: { _all: true } }),
      prisma.cardPlayEvent.groupBy({ by: ['userId'], where: { won: true }, _count: { _all: true } }),
    ]);
    const winMap = new Map(wins.map((w) => [w.userId, w._count._all]));
    entries = totals
      .filter((t) => t._count._all >= WINRATE_MIN_ROUNDS)
      .map((t) => {
        const w = winMap.get(t.userId) ?? 0;
        return { userId: t.userId, value: w / t._count._all, sub: `${w}/${t._count._all} 回合` };
      });
    entries.sort((a, b) => b.value - a.value);
  } else {
    const where =
      board === 'weekly'
        ? { won: true, createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } }
        : board === 'regicide'
          ? { won: true, folded: false, role: 'SLAVE' as const, card: 'SLAVE' as const }
          : { won: true }; // wins
    const grouped = await prisma.cardPlayEvent.groupBy({ by: ['userId'], where, _count: { _all: true } });
    entries = grouped.map((g) => ({ userId: g.userId, value: g._count._all }));
    entries.sort((a, b) => b.value - a.value);
  }

  // Resolve display names for the visible slice (+ the viewer, wherever they rank).
  const top = entries.slice(0, TOP_N);
  const meIndex = meId ? entries.findIndex((e) => e.userId === meId) : -1;
  const idsNeeded = [...new Set([...top.map((e) => e.userId), ...(meIndex >= 0 ? [entries[meIndex].userId] : [])])];
  const users = await prisma.user.findMany({
    where: { id: { in: idsNeeded } },
    select: { id: true, displayName: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, u.displayName]));

  const rows = top.map((e, i) => ({
    rank: i + 1,
    name: nameMap.get(e.userId) ?? '无名氏',
    value: e.value,
    sub: e.sub ?? null,
    isMe: e.userId === meId,
  }));

  const me =
    meIndex >= 0
      ? { rank: meIndex + 1, value: entries[meIndex].value, sub: entries[meIndex].sub ?? null }
      : null;

  return NextResponse.json({ board, rows, me });
}
