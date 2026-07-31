'use client';

import { useIsPortraitPhone } from '@/lib/device';

// The table is a wide, seated composition — held upright on a phone the dealer, the drills
// and the card fan all fight for a sliver of width. Rather than reflow the whole scene for
// portrait, ask for the turn: it's one gesture, and landscape is genuinely the right way
// to sit at this table.
export default function RotatePrompt() {
  const portrait = useIsPortraitPhone();
  if (!portrait) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-void flex flex-col items-center justify-center gap-8 px-8 text-center">
      {/* A phone rotating — the whole instruction in one glyph */}
      <svg width="76" height="76" viewBox="0 0 100 100" fill="none" stroke="#c49a30" strokeWidth="3" aria-hidden>
        <rect x="34" y="14" width="32" height="56" rx="4" style={{ transformOrigin: '50px 42px', animation: 'rotate-hint 2.4s ease-in-out infinite' }} />
        <path d="M20 78 Q50 92 80 78" strokeWidth="2.4" opacity="0.55" />
        <path d="M80 78 L74 71 M80 78 L72 82" strokeWidth="2.4" opacity="0.55" />
      </svg>

      <div>
        <p className="font-gothic text-cracked text-3xl tracking-[8px] text-blood leading-none">横 屏 入 座</p>
        <p className="text-xs tracking-[3px] text-text-muted font-display mt-5">这张牌桌需要横过来看</p>
      </div>

      <style>{`@keyframes rotate-hint {
        0%, 40% { transform: rotate(0deg); }
        60%, 100% { transform: rotate(-90deg); }
      }`}</style>
    </div>
  );
}
