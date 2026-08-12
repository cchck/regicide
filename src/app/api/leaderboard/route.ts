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

/**
 * How long a computed board may be served from memory.
 *
 * The four aggregate boards each run a groupBy across the whole CardPlayEvent table on
 * every request — fine at a few hundred rows, a full scan per page view once the table is
 * real. Nobody is watching a leaderboard for second-by-second movement, so a minute of
 * staleness buys back almost all of that cost.
 *
 * Same caveat as the rate limiter: this cache lives in one process. A second replica keeps
 * its own copy, which for a leaderboard means two viewers might see boards a minute apart.
 * Acceptable here in a way it would not be for anything transactional.
 */
const CACHE_MS = 60_000;
const cache = new Map<Board, { at: number; entries: Entry[] }>();

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

  // The chips board never needs the full ordering: the page is a LIMIT and the viewer's
  // rank is "how many people are above me", which is one indexed count. Loading every user
  // into memory to slice fifty off the top was the old shape, and it got linearly worse
  // with every account created.
  if (board === 'chips') {
    const [top, meRow] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ chips: 'desc' }, { id: 'asc' }],
        take: TOP_N,
        select: { id: true, chips: true, displayName: true },
      }),
      meId ? prisma.user.findUnique({ where: { id: meId }, select: { chips: true } }) : null,
    ]);
    // Must reproduce the LIST POSITION, not a competition rank. The ordering is
    // [chips desc, id asc], so the people ahead of you are everyone richer PLUS everyone
    // tied with you whose id sorts first. Counting only the richer gives tied players a
    // shared rank — mathematically defensible, but it reads as a bug when the board shows
    // you third and the line underneath says you are second.
    const above = meRow && meId
      ? (await prisma.user.count({ where: { chips: { gt: meRow.chips } } })) +
        (await prisma.user.count({ where: { chips: meRow.chips, id: { lt: meId } } }))
      : 0;
    return NextResponse.json({
      board,
      rows: top.map((u, i) => ({
        rank: i + 1,
        name: u.displayName,
        value: u.chips,
        sub: null,
        isMe: u.id === meId,
      })),
      me: meRow ? { rank: above + 1, value: meRow.chips, sub: null } : null,
    });
  }

  let entries: Entry[] = [];
  const cached = cache.get(board);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    entries = cached.entries;
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
  // Cached AFTER sorting, and without the viewer folded in — `entries` is the same for
  // everyone, and only the name resolution below is per-request.
  if (!cached || Date.now() - cached.at >= CACHE_MS) cache.set(board, { at: Date.now(), entries });

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
