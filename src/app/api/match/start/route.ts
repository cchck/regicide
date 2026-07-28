import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// Buy into a match: deduct the stake from the persistent bankroll up front.
// If the balance can't cover the full buy-in, the player sits down with whatever
// remains (agreed rule) — a zero balance can't enter at all.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const buyIn = Number(body?.buyIn);
  if (!Number.isFinite(buyIn) || buyIn <= 0) {
    return NextResponse.json({ error: '无效的买入额' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { chips: true },
    });
    if (!user) return { error: '账号不存在', status: 404 } as const;

    const stack = Math.min(Math.floor(buyIn), user.chips);
    if (stack <= 0) return { error: '筹码不足，无法入场', status: 400 } as const;

    // Recording the stake opens a bounded settlement claim (see match/end). Starting a
    // new match while one is open simply replaces it — the abandoned stake was already
    // forfeited by the mid-match-exit rule, and its claim dies with the overwrite.
    const updated = await tx.user.update({
      where: { id: session.user.id },
      data: { chips: { decrement: stack }, activeStake: stack },
      select: { chips: true },
    });
    return { stack, balance: updated.chips } as const;
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
