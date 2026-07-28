import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// Current account snapshot — the chip balance shown in the corner bar and setup screen.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { chips: true, displayName: true },
  });
  if (!user) return NextResponse.json({ error: '账号不存在' }, { status: 404 });
  return NextResponse.json(user);
}
