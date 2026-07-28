import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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
  await prisma.$transaction(async (tx) => {
    await tx.cardPlayEvent.create({
      data: { userId, role, card, round, betMultiplier: Math.floor(betMultiplier), won, folded, foldedSelf },
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
