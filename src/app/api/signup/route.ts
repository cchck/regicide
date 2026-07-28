import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: '邮箱、密码和昵称都不能为空' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
  });

  return NextResponse.json({ id: user.id });
}
