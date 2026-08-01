import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normalizeLoadout, itemById, DEFAULT_LOADOUT } from '@/lib/shop';

// Put an owned item on. Ownership is re-checked here rather than trusted from the client —
// otherwise anyone could wear anything by posting its id.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const item = itemById(String(body?.itemId ?? ''));
  if (!item) return NextResponse.json({ error: '没有这件东西' }, { status: 400 });
  if (!item.ready) return NextResponse.json({ error: '这件还没上架' }, { status: 400 });

  // Free defaults have no OwnedItem row; everything else must be in the wardrobe.
  const isDefault = DEFAULT_LOADOUT[item.slot] === item.id;
  if (!isDefault) {
    const owned = await prisma.ownedItem.findUnique({
      where: { userId_itemId: { userId: session.user.id, itemId: item.id } },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: '你还没有这件' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { loadout: true } });
  const next = { ...normalizeLoadout(user?.loadout as Record<string, string> | null), [item.slot]: item.id };
  await prisma.user.update({ where: { id: session.user.id }, data: { loadout: next } });

  return NextResponse.json({ loadout: next });
}
