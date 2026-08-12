import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { LIMITS, clientIp, take, tooMany } from '@/lib/rate-limit';

// Pragmatic, not RFC-complete: something before an @, something after it with a dot, and
// no whitespace anywhere. The goal is to stop "abc" becoming an account — an address that
// can never receive a password reset and that its owner will mistype forever.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_MAX = 254; // the practical limit on an address
const NAME_MIN = 2;
// 24 rather than something tidier like 16: an existing account already uses a 23-character
// display name, and a rule that makes live data invalid is a rule that will bite later.
const NAME_MAX = 24;
const PASSWORD_MIN = 6;
// bcrypt silently truncates at 72 bytes. Without a ceiling, two different long passwords
// can hash identically and both open the same account.
const PASSWORD_MAX_BYTES = 72;

export async function POST(req: Request) {
  // Per IP, before any work: account creation is the cheapest thing to automate and the
  // most expensive to clean up afterwards.
  const gate = take(`signup:${clientIp(req)}`, LIMITS.signup);
  if (!gate.ok) return tooMany(gate.retryAfter, '注册太频繁了，请稍后再试');

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: '邮箱、密码和昵称都不能为空' }, { status: 400 });
  }
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: '邮箱格式不对' }, { status: 400 });
  }
  if (displayName.length < NAME_MIN || displayName.length > NAME_MAX) {
    return NextResponse.json({ error: `昵称需要 ${NAME_MIN}–${NAME_MAX} 个字符` }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json({ error: `密码至少需要 ${PASSWORD_MIN} 位` }, { status: 400 });
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return NextResponse.json({ error: '密码太长了（最多 72 字节）' }, { status: 400 });
  }

  // Fast path with a friendly message. It is NOT the guarantee — see the catch below.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
    });
    return NextResponse.json({ id: user.id });
  } catch (err) {
    // The check above and this insert are two separate round-trips, so two requests for the
    // same address can both pass the check and race here. The unique index is what actually
    // decides it; P2002 means we lost that race, which is the same outcome as the fast path
    // and deserves the same answer rather than an unhandled 500.
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
    }
    console.error('signup', err);
    return NextResponse.json({ error: '注册失败，请稍后再试' }, { status: 500 });
  }
}
