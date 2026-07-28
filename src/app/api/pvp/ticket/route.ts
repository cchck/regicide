import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { issueTicket } from '@/lib/ws-ticket';

// Hands a logged-in user a 60-second ticket for the PvP WebSocket server.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录 — 真人对战需要账户' }, { status: 401 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: '服务器缺少 AUTH_SECRET' }, { status: 500 });
  }
  const ticket = issueTicket(session.user.id, session.user.name ?? '无名氏', secret);
  return NextResponse.json({ ticket });
}
