import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normalizeLoadout, itemById, SLOTS } from '@/lib/shop';

// The player's wallet, wardrobe, and what they're currently wearing.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const [user, owned] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { seals: true, loadout: true } }),
    prisma.ownedItem.findMany({ where: { userId: session.user.id }, select: { itemId: true } }),
  ]);
  if (!user) return NextResponse.json({ error: '账号不存在' }, { status: 404 });

  return NextResponse.json({
    seals: user.seals,
    // Free defaults aren't stored as rows, so fold them in — the client shouldn't have to
    // know that "owned" has two sources.
    owned: [...new Set([...owned.map((o) => o.itemId), ...SLOTS.map((s) => defaultOf(s.key))])],
    loadout: normalizeLoadout(user.loadout as Record<string, string> | null),
  });
}

function defaultOf(slot: string): string {
  return normalizeLoadout(null)[slot as keyof ReturnType<typeof normalizeLoadout>];
}

// Buy an item. Price and ownership are settled server-side inside one transaction — the
// client sends only an id, never a price.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const item = itemById(String(body?.itemId ?? ''));
  if (!item) return NextResponse.json({ error: '没有这件东西' }, { status: 400 });
  if (!item.ready) return NextResponse.json({ error: '这件还没上架' }, { status: 400 });
  if (item.price <= 0) return NextResponse.json({ error: '这件本来就是你的' }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: session.user.id }, select: { seals: true } });
    if (!user) return { error: '账号不存在', status: 404 } as const;

    const already = await tx.ownedItem.findUnique({
      where: { userId_itemId: { userId: session.user.id, itemId: item.id } },
      select: { id: true },
    });
    if (already) return { error: '你已经有这件了', status: 409 } as const;
    if (user.seals < item.price) return { error: `金印不足 — 还差 ${item.price - user.seals}`, status: 400 } as const;

    const updated = await tx.user.update({
      where: { id: session.user.id },
      data: { seals: { decrement: item.price } },
      select: { seals: true },
    });
    await tx.ownedItem.create({ data: { userId: session.user.id, itemId: item.id, paid: item.price } });
    return { seals: updated.seals } as const;
  });

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
