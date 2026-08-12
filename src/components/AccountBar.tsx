'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { ChipIcon, SealIcon } from './CurrencyIcon';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMatch = (e: Event) => setInMatch(Boolean((e as CustomEvent).detail));
    window.addEventListener(MATCH_EVENT, onMatch);
    return () => window.removeEventListener(MATCH_EVENT, onMatch);
  }, []);

  // Dismiss the account menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // Never leave the menu hanging open across a route change or into a match.
  useEffect(() => { setMenuOpen(false); }, [pathname, inMatch]);

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
  // The shop has its own, richer wallet — two of them collide in the same corner.
  if (pathname === '/shop') return null;
  // Or during an in-progress match — the verdict beam runs edge-to-edge up there
  if (inMatch) return null;

  return (
    <div className="fixed top-3 right-4 sm:top-5 sm:right-8 z-50 flex flex-col items-end gap-1.5 pointer-events-auto">
      {/* One soft scrim behind the whole cluster instead of a frame around each number.
          The chamfered plates crowded the digits — at these sizes the cut corners eat into
          the numerals — and boxing every value made three little windows in a row. Legibility
          over a bright scene is the frame's only real job, and a wash does that without
          touching the type. */}
      <div
        className="absolute -inset-x-6 -inset-y-4 pointer-events-none -z-10"
        style={{ background: 'radial-gradient(ellipse 75% 100% at 78% 30%, rgba(3,3,7,0.82) 0%, rgba(3,3,7,0.45) 55%, transparent 100%)' }}
      />

      {status === 'loading' ? (
        <span className="text-xs text-text-dim font-display tracking-wider">...</span>
      ) : session?.user ? (
        <>
          {/* Row 1 — the money, unboxed. */}
          <div className="flex items-center gap-4 sm:gap-5">
            {chips !== null && (
              <span className="flex items-center gap-2" title="账户筹码余额">
                <ChipIcon size={20} className="text-amber-bright shrink-0 drop-shadow-[0_0_6px_rgba(196,154,48,0.5)]" />
                <span
                  className="text-amber-bright font-display font-black text-xl sm:text-2xl leading-none tabular-nums"
                  style={{ textShadow: '0 0 14px rgba(196,154,48,0.5), 0 2px 4px rgba(0,0,0,0.95)' }}
                >
                  {chips}
                </span>
              </span>
            )}

            {/* Seals — the cosmetic purse. Only shown once they have any, so a new player
                isn't greeted by a currency they've never heard of sitting at zero. */}
            {!!seals && (
              <>
                <span className="w-px h-5 bg-amber/25" />
                <span className="flex items-center gap-2" title="金印 — 只用于当铺">
                  <SealIcon size={17} className="text-amber shrink-0" />
                  <span
                    className="text-amber font-display font-bold text-lg sm:text-xl leading-none tabular-nums"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}
                  >
                    {seals}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Row 2 — the account. Its own line so a long name has somewhere to go; the old
              single row squeezed it to ten characters and truncated most of them.
              Signing out used to be a bare word sitting permanently in the corner, one
              stray click from the thing you click most. It lives behind this now. */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 pb-0.5 border-b border-amber/25 hover:border-amber/60 text-text-secondary hover:text-amber-bright transition-colors"
            >
              <span
                className="text-[11px] sm:text-xs tracking-[3px] font-display font-bold max-w-[22ch] truncate"
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}
              >
                {session.user.name || session.user.email}
              </span>
              <span className={'text-[7px] opacity-70 transition-transform ' + (menuOpen ? 'rotate-180' : '')}>▼</span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 min-w-[140px] border border-amber/35 bg-black/92 backdrop-blur-md fade-in"
                style={{ boxShadow: '0 12px 30px rgba(0,0,0,0.7), inset 0 0 14px rgba(0,0,0,0.5)' }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="w-full px-4 py-2.5 text-left text-xs text-text-secondary hover:text-blood-glow hover:bg-blood-surface/50 tracking-[3px] font-display transition-colors"
                >
                  登 出
                </button>
              </div>
            )}
          </div>
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
