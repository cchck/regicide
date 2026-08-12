import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { LIMITS, take, tooMany } from '@/lib/rate-limit';

/**
 * The most rows one match may report.
 *
 * Worked out rather than guessed, because the obvious number is wrong. Showdowns cap at
 * 5 per set × 7 sets = 35 — but a FOLD returns both cards, so it replays a slot without
 * consuming one and is not covered by that. Folds are limited only by the escalating
 * penalty draining the stack ((n+1) × ANTE 5, cumulative): about 5 per set at the 100
 * table, 10 at 300, and 19 at 1000. A high-stakes match can therefore legitimately
 * produce well over a hundred rows, and capping at 35 would have started rejecting real
 * play from exactly the most active players.
 *
 * 250 sits far above any honest match and still stops one buy-in being used to write a
 * hundred thousand rows.
 */
const MAX_ROWS_PER_MATCH = 250;

const ROLE_MAP = { emperor: 'EMPEROR', slave: 'SLAVE' } as const;
const CARD_MAP = { emperor: 'EMPEROR', citizen: 'CITIZEN', slave: 'SLAVE' } as const;

// One round of play, reported at round resolution.
// Every event goes into the raw log; only showdown (non-folded) plays also bump the
// public-tendency aggregate — a fold never reveals the card, so opponents don't get it.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const gate = take(`stats:${session.user.id}`, LIMITS.statsPlay);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const body = await req.json().catch(() => null);
  const role = ROLE_MAP[body?.role as keyof typeof ROLE_MAP];
  const card = CARD_MAP[body?.card as keyof typeof CARD_MAP];
  const round = Number(body?.round);
  const betMultiplier = Number(body?.betMultiplier);
  const won = Boolean(body?.won);
  const folded = Boolean(body?.folded);
  const foldedSelf = Boolean(body?.foldedSelf);

  if (!role || !card || !Number.isInteger(round) || round < 1 || round > 5 || !Number.isFinite(betMultiplier)) {
    return NextResponse.json({ error: '无效的对局数据' }, { status: 400 });
  }

  const userId = session.user.id;

  // ————— Bind the claim to a real match —————
  //
  // This endpoint is the only writer of the tendency log on the AI path, and the log is
  // what both the leaderboard and the PvP mind-read are built from. Unbound, it was free
  // to forge: POST the same "slave beats emperor, won" row ten thousand times and top the
  // regicide board, or seed a false read for anyone who pays to look at you.
  //
  // Two gates, neither of which an honest client notices:
  //   · there must be an open buy-in, so forging costs a stake and only one match at a time
  //   · a single match may not report more rows than a match can physically produce
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeStake: true, stakeAt: true },
  });
  if (!account?.activeStake) {
    return NextResponse.json({ error: '没有进行中的对局' }, { status: 409 });
  }
  if (account.stakeAt) {
    const reported = await prisma.cardPlayEvent.count({
      where: { userId, createdAt: { gte: account.stakeAt } },
    });
    if (reported >= MAX_ROWS_PER_MATCH) {
      return NextResponse.json({ error: '本局记录已达上限' }, { status: 429 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cardPlayEvent.create({
      data: { userId, role, card, round, betMultiplier: Math.floor(betMultiplier), won, folded, foldedSelf, source: 'AI' },
    });
    if (!folded) {
      await tx.cardPlayStat.upsert({
        where: { userId_role_cardKind_round: { userId, role, cardKind: card, round } },
        create: { userId, role, cardKind: card, round, count: 1 },
        update: { count: { increment: 1 } },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
