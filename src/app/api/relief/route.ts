import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { chips: true },
    });
    if (!user) return { error: '账号不存在', status: 404 } as const;
    if (user.chips >= RELIEF_THRESHOLD) {
      return { error: '还没到山穷水尽的地步', status: 400 } as const;
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
