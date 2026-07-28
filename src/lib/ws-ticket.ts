import { createHmac, timingSafeEqual } from 'node:crypto';

// Short-lived HMAC tickets that let the WebSocket server trust a user identity
// without sharing NextAuth's cookie machinery. The Next API signs; the ws server
// verifies with the same AUTH_SECRET.

const TICKET_TTL_MS = 60_000;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueTicket(userId: string, name: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, name, exp: Date.now() + TICKET_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyTicket(ticket: string, secret: string): { userId: string; name: string } | null {
  const dot = ticket.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.userId !== 'string' || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
    return { userId: data.userId, name: typeof data.name === 'string' ? data.name : '无名氏' };
  } catch {
    return null;
  }
}
