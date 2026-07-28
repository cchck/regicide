'use client';

import { io, Socket } from 'socket.io-client';

// Connects to the PvP server with a fresh one-minute ticket from our API.
export async function connectPvp(): Promise<Socket> {
  const res = await fetch('/api/pvp/ticket', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `无法获取入场券（HTTP ${res.status}）`);

  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3801';
  return io(url, {
    auth: { ticket: data.ticket },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1500,
  });
}
