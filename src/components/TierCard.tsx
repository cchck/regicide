'use client';

export interface StakesTier {
  key: 'flicker' | 'pact' | 'regicide';
  name: string;
  buyIn: number;
  description: string;
  color: 'teal' | 'amber' | 'blood';
  // Stakes and opponent strength are one dial: higher table, sharper AI.
  difficulty: 'easy' | 'normal' | 'hard';
  difficultyLabel: string;
}

export const STAKES_TIERS: StakesTier[] = [
  { key: 'flicker', name: '血 引', buyIn: 100, description: '浅尝辄止，先见见血', color: 'teal', difficulty: 'easy', difficultyLabel: '简单' },
  { key: 'pact', name: '血 契', buyIn: 300, description: '以筹码起誓的契约', color: 'amber', difficulty: 'normal', difficultyLabel: '普通' },
  { key: 'regicide', name: '弑 君', buyIn: 1000, description: '赌上一切，弑君夺位', color: 'blood', difficulty: 'hard', difficultyLabel: '困难' },
];

const COLOR_VARS: Record<StakesTier['color'], { text: string; border: string; glow: string; bg: string }> = {
  teal: { text: '#2a8a8a', border: '#1a5c5c', glow: 'rgba(42,138,138,', bg: '#0a1818' },
  amber: { text: '#c49a30', border: '#8a6a20', glow: 'rgba(196,154,48,', bg: '#141008' },
  blood: { text: '#dd2222', border: '#aa1111', glow: 'rgba(170,17,17,', bg: '#1a0808' },
};

const CUT = 12;
const CLIP = `polygon(${CUT}px 0,calc(100% - ${CUT}px) 0,100% ${CUT}px,100% calc(100% - ${CUT}px),calc(100% - ${CUT}px) 100%,${CUT}px 100%,0 calc(100% - ${CUT}px),0 ${CUT}px)`;

interface TierCardProps {
  tier: StakesTier;
  selected: boolean;
  onClick: () => void;
}

export default function TierCard({ tier, selected, onClick }: TierCardProps) {
  const c = COLOR_VARS[tier.color];
  const isTopTier = tier.key === 'regicide';

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex-1 text-left transition-transform duration-200 active:scale-[0.98]"
      style={{
        clipPath: CLIP,
        background: selected ? c.bg : 'rgba(0,0,0,0.32)',
        border: `1px solid ${selected ? c.text : c.border}`,
        boxShadow: selected
          ? `0 0 ${isTopTier ? 40 : 26}px ${c.glow}${isTopTier ? 0.5 : 0.35}), inset 0 0 16px rgba(0,0,0,0.35)`
          : 'none',
        padding: '20px 22px 22px',
        animation: selected && isTopTier ? 'pulse-glow 1.8s ease-in-out infinite' : undefined,
      }}
    >
      <span
        className="absolute pointer-events-none"
        style={{ inset: '4px', clipPath: CLIP, border: `1px solid ${selected ? 'rgba(240,236,228,0.3)' : c.glow + '0.25)'}` }}
      />

      {isTopTier && (
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            clipPath: CLIP,
            background: `radial-gradient(ellipse at 50% 120%, ${c.glow}${selected ? '0.22)' : '0.08)'}, transparent 70%)`,
          }}
        />
      )}

      <div className="relative flex flex-col items-center gap-2 py-2">
        <p
          className={
            (isTopTier ? 'font-gothic text-cracked text-2xl sm:text-3xl' : 'font-display font-bold text-xl sm:text-2xl') +
            ' tracking-[6px] leading-none'
          }
          style={{ color: selected ? c.text : '#908880' }}
        >
          {tier.name}
        </p>

        <p
          className="font-display font-black text-2xl sm:text-3xl leading-none mt-1"
          style={{
            color: selected ? '#f0ece4' : c.text,
            textShadow: selected ? `0 0 ${14 + (isTopTier ? 10 : 0)}px ${c.glow}0.7)` : 'none',
          }}
        >
          {tier.buyIn}
        </p>
        <p className="text-[10px] tracking-[2px] text-text-dim uppercase font-display -mt-1">筹码起</p>

        <div className="w-8 h-px my-1" style={{ background: selected ? c.text : '#2a2a3a' }} />

        <p className="text-[11px] sm:text-xs text-text-muted tracking-wider font-display text-center leading-relaxed">
          {tier.description}
        </p>

        {/* Difficulty rides the tier — no separate dial anywhere else */}
        <p
          className="text-[10px] tracking-[3px] font-display px-2.5 py-0.5 mt-1.5 border"
          style={{ color: selected ? c.text : '#908880', borderColor: selected ? c.border : '#2a2a3a' }}
        >
          对手 · {tier.difficultyLabel}
        </p>
      </div>
    </button>
  );
}
