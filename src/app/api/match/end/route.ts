import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { LIMITS, take, tooMany } from '@/lib/rate-limit';
import { SEALS_PER_WIN, SEALS_PER_REGICIDE, MAX_REGICIDES_PER_MATCH } from '@/lib/shop';

// Settle a finished match: whatever the player walked away from the table with goes
// back into the persistent bankroll.
//
// The figure is still client-reported (the AI match runs in the browser), but it is no
// longer TRUSTED: settlement requires the open stake recorded at match/start, and
// E-card is zero-sum with both sides seated at identical stacks — no honest match can
// pay out more than 2× the stake. The claim closes on settlement, so it can't be
// replayed either. Ceiling for a dishonest client: what a legitimate flawless win
// against the AI would have paid anyway.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const gate = take(`match-end:${session.user.id}`, LIMITS.account);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const body = await req.json().catch(() => ({}));
  const finalChips = Number(body?.finalChips);
  if (!Number.isFinite(finalChips) || finalChips < 0) {
    return NextResponse.json({ error: '无效的结算额' }, { status: 400 });
  }

  // Seal payout. Both inputs are client-reported, so both are bounded: the win bonus is
  // only paid when the (already clamped) settlement shows a profit, and the regicide count
  // can't exceed what a Bo7 could physically contain.
  const claimedRegicides = Number(body?.regicides);
  const regicides = Number.isFinite(claimedRegicides)
    ? Math.min(Math.max(Math.floor(claimedRegicides), 0), MAX_REGICIDES_PER_MATCH)
    : 0;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { activeStake: true },
    });
    if (!user) return { error: '账号不存在', status: 404 } as const;
    if (user.activeStake === null) return { error: '没有进行中的对局', status: 409 } as const;

    const settled = Math.min(Math.floor(finalChips), user.activeStake * 2);
    const won = settled > user.activeStake;
    const seals = (won ? SEALS_PER_WIN : 0) + regicides * SEALS_PER_REGICIDE;

    const updated = await tx.user.update({
      where: { id: session.user.id },
      data: { chips: { increment: settled }, activeStake: null, stakeAt: null, seals: { increment: seals } },
      select: { chips: true, seals: true },
    });
    return { balance: updated.chips, seals: updated.seals, sealsEarned: seals } as const;
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
