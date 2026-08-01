'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';

// Other components announce balance changes via this window event; the bar listens.
// detail: number → set directly; no detail → re-fetch from the server.
export const CHIPS_EVENT = 'regicide-chips';
// GameBoard toggles this when a real match is running — the bar hides itself
// so the verdict beam owns the top edge alone.
export const MATCH_EVENT = 'regicide-in-match';

export default function AccountBar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [chips, setChips] = useState<number | null>(null);
  const [seals, setSeals] = useState<number | null>(null);
  const [inMatch, setInMatch] = useState(false);

  useEffect(() => {
    const onMatch = (e: Event) => setInMatch(Boolean((e as CustomEvent).detail));
    window.addEventListener(MATCH_EVENT, onMatch);
    return () => window.removeEventListener(MATCH_EVENT, onMatch);
  }, []);

  const refresh = useCallback(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.chips === 'number') setChips(data.chips);
        if (data && typeof data.seals === 'number') setSeals(data.seals);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setChips(null);
      setSeals(null);
      return;
    }
    refresh();
    const onChips = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'number') setChips(detail);
      else refresh();
    };
    window.addEventListener(CHIPS_EVENT, onChips);
    return () => window.removeEventListener(CHIPS_EVENT, onChips);
  }, [session?.user, refresh]);

  // Don't show the bar on the login page — the whole page IS the auth flow
  if (pathname === '/login') return null;
  // Or during an in-progress match — the verdict beam runs edge-to-edge up there
  if (inMatch) return null;

  return (
    <div className="fixed top-4 right-4 sm:top-6 sm:right-8 z-50 flex items-center gap-3 pointer-events-auto">
      {status === 'loading' ? (
        <span className="text-xs text-text-dim font-display tracking-wider">...</span>
      ) : session?.user ? (
        <>
          {/* Bankroll badge — the number the whole game revolves around */}
          {chips !== null && (
            <span
              className="flex items-center gap-2 px-3.5 py-1.5 border border-amber/50 bg-black/50 backdrop-blur-sm"
              style={{
                clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5), 0 0 14px rgba(196,154,48,0.15)',
              }}
              title="账户筹码余额"
            >
              <span className="w-2 h-2 rotate-45" style={{ background: '#c49a30', boxShadow: '0 0 6px rgba(196,154,48,0.8)' }} />
              <span className="text-amber-bright font-display font-black text-sm sm:text-base leading-none">{chips}</span>
            </span>
          )}
          {/* Seals — the cosmetic purse. Only shown once they have any, so a new player
              isn't greeted by a currency they've never heard of sitting at zero. */}
          {!!seals && (
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 border border-amber/30 bg-black/50 backdrop-blur-sm"
              style={{ clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)' }}
              title="金印 — 只用于当铺"
            >
              <span className="text-amber text-xs leading-none">◈</span>
              <span className="text-amber font-display font-bold text-sm leading-none">{seals}</span>
            </span>
          )}
          <span className="text-xs sm:text-sm text-text-secondary tracking-[3px] font-display">
            <span className="text-text-bright font-bold">{session.user.name || session.user.email}</span>
          </span>
          <span className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-xs text-text-muted hover:text-blood tracking-[3px] font-display uppercase transition-colors"
          >
            登出
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="group relative px-4 py-2 border border-border hover:border-blood text-text-secondary hover:text-blood-glow text-xs tracking-[4px] font-display uppercase transition-all duration-200"
          style={{ clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)' }}
        >
          登 录 / 注 册
        </button>
      )}
    </div>
  );
}
