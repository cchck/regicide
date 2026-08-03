'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { ChipIcon, SealIcon } from './CurrencyIcon';

const CHAMFER =
  'polygon(7px 0,calc(100% - 7px) 0,100% 7px,100% calc(100% - 7px),calc(100% - 7px) 100%,7px 100%,0 calc(100% - 7px),0 7px)';

// Deco plate, same chamfer as the in-match dock and the tier cards.
const PLATE: React.CSSProperties = {
  clipPath: CHAMFER,
  background: 'linear-gradient(180deg, rgba(30,24,12,0.85) 0%, rgba(6,6,10,0.9) 100%)',
  boxShadow: 'inset 0 0 0 1px rgba(196,154,48,0.5), inset 0 0 16px rgba(0,0,0,0.55), 0 0 18px rgba(196,154,48,0.16)',
  backdropFilter: 'blur(4px)',
};

const PLATE_DIM: React.CSSProperties = {
  clipPath: CHAMFER,
  background: 'linear-gradient(180deg, rgba(18,16,12,0.8) 0%, rgba(5,5,9,0.88) 100%)',
  boxShadow: 'inset 0 0 0 1px rgba(196,154,48,0.24), inset 0 0 12px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(4px)',
};

const RULE: React.CSSProperties = {
  background: 'linear-gradient(90deg, transparent, rgba(240,212,136,0.9), transparent)',
};

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
    <div className="fixed top-4 right-4 sm:top-6 sm:right-8 z-50 flex items-center gap-2.5 sm:gap-3 pointer-events-auto">
      {status === 'loading' ? (
        <span className="text-xs text-text-dim font-display tracking-wider">...</span>
      ) : session?.user ? (
        <>
          {/* Bankroll — the number the whole game revolves around, and sized like it. */}
          {chips !== null && (
            <span className="relative flex items-center gap-2.5 pl-3 pr-4 py-2" style={PLATE} title="账户筹码余额">
              <span className="absolute top-0 inset-x-0 h-px" style={RULE} />
              <ChipIcon size={19} className="text-amber-bright shrink-0" />
              <span
                className="text-amber-bright font-display font-black text-lg sm:text-xl leading-none tabular-nums"
                style={{ textShadow: '0 0 12px rgba(196,154,48,0.55)' }}
              >
                {chips}
              </span>
            </span>
          )}

          {/* Seals — the cosmetic purse. Only shown once they have any, so a new player
              isn't greeted by a currency they've never heard of sitting at zero. */}
          {!!seals && (
            <span className="relative flex items-center gap-2 pl-2.5 pr-3.5 py-2" style={PLATE_DIM} title="金印 — 只用于当铺">
              <SealIcon size={16} className="text-amber shrink-0" />
              <span className="text-amber font-display font-bold text-base leading-none tabular-nums">{seals}</span>
            </span>
          )}

          {/* The name is the door to the account menu. Signing out used to be a bare word
              sitting permanently in the corner: one stray click away, on every screen,
              next to the thing you click most. It lives behind this now. */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 px-3 py-2 text-text-bright hover:text-amber-bright transition-colors"
              style={PLATE_DIM}
            >
              <span className="text-xs sm:text-sm tracking-[3px] font-display font-bold max-w-[10ch] truncate">
                {session.user.name || session.user.email}
              </span>
              <span className={'text-[8px] text-text-muted transition-transform ' + (menuOpen ? 'rotate-180' : '')}>▼</span>
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
