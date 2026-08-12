import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { LIMITS, take, tooMany } from '@/lib/rate-limit';

const RELIEF_AMOUNT = 200;
// Below the cheapest buy-in (血引 100) you're locked out of every table — that's when
// the house extends a hand. Only claimable while actually broke, so it can't be farmed
// into a meaningful edge (you must lose it all at the tables first).
const RELIEF_THRESHOLD = 100;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const gate = take(`relief:${session.user.id}`, LIMITS.account);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { chips: true, activeStake: true, pvpStake: true },
    });
    if (!user) return { error: '账号不存在', status: 404 } as const;

    // Everything the player owns, INCLUDING what is currently on a table. Testing `chips`
    // alone was an unlimited money printer: buying into a match moves the whole balance
    // into activeStake, leaving chips at 0, which read as destitute. Buy in → claim 200 →
    // buy in with that → claim again. No cards ever had to be played.
    //
    // Money staked on a table is still yours. You are not broke, it is just not in your
    // hand — so no relief until the table gives it back and it is genuinely gone.
    const holdings = user.chips + (user.activeStake ?? 0) + (user.pvpStake ?? 0);
    if (holdings >= RELIEF_THRESHOLD) {
      return {
        error: user.chips < RELIEF_THRESHOLD ? '你还有筹码押在桌上' : '还没到山穷水尽的地步',
        status: 400,
      } as const;
    }
    const updated = await tx.user.update({
      where: { id: session.user.id },
      data: { chips: { increment: RELIEF_AMOUNT } },
      select: { chips: true },
    });
    return { balance: updated.chips, granted: RELIEF_AMOUNT } as const;
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
