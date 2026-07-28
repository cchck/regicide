'use client';

import { useRouter } from 'next/navigation';
import Leaderboard from '@/components/Leaderboard';
import BackButton from '@/components/BackButton';
import Flourish from '@/components/Flourish';

// The blood ledger, full page — who owns this hall.
export default function LedgerPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-4 py-14 relative overflow-hidden">
      {/* Ambient wash — blood above, gold below */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(170,17,17,0.08) 0%, transparent 60%),' +
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(196,154,48,0.05) 0%, transparent 60%)',
        }}
      />
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blood-dim to-transparent" />

      <BackButton onClick={() => router.push('/')} />

      <div className="relative w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12 slide-up">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 sm:w-24 h-px bg-gradient-to-r from-transparent to-blood/60" />
            <Flourish />
          </div>
          <h1 className="font-gothic text-cracked text-5xl sm:text-6xl tracking-[12px] text-blood leading-none">血 榜</h1>
          <p className="text-xs tracking-[8px] text-text-dim font-display mt-4 uppercase">The Ledger</p>
          <p className="text-sm tracking-[4px] text-text-secondary font-display mt-3">谁 主 宰 这 座 大 厅</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Flourish flip />
            <div className="w-16 sm:w-24 h-px bg-gradient-to-l from-transparent to-blood/60" />
          </div>
        </div>

        {/* Ledger panel — corner-bracket frame, same language as the dossier */}
        <div
          className="relative border border-border/70 bg-abyss/70 backdrop-blur-sm px-4 sm:px-10 py-10 fade-in-up"
          style={{ animationDelay: '150ms' }}
        >
          <span className="absolute top-2 left-2 w-6 h-6 border-t border-l border-blood/70" />
          <span className="absolute top-2 right-2 w-6 h-6 border-t border-r border-blood/70" />
          <span className="absolute bottom-2 left-2 w-6 h-6 border-b border-l border-blood/70" />
          <span className="absolute bottom-2 right-2 w-6 h-6 border-b border-r border-blood/70" />
          <span className="absolute inset-3 border border-border-subtle/60 pointer-events-none" />

          <Leaderboard />
        </div>

        <p className="text-center text-[10px] tracking-[3px] text-text-dim font-display mt-8">
          每一枚筹码、每一次摊牌、每一场弑君 — 都记在这本账上
        </p>
      </div>
    </div>
  );
}
