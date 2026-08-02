'use client';

// A table you can sit at, not a difficulty setting.
//
// The three buy-ins are discrete on purpose. A zero-sum table needs both seats to post the
// SAME stake, so letting players type any amount would shatter the matching pool into
// singletons and nobody would ever get seated. Real card rooms use fixed stakes for the
// same reason. Opponent strength rides along with the money — the big table is where the
// dangerous people sit — which keeps it one dial instead of two.

export interface StakesTier {
  key: 'flicker' | 'pact' | 'regicide';
  name: string;
  buyIn: number;
  description: string;
  color: 'teal' | 'amber' | 'blood';
  /** Where this table sits in the room. */
  tableLabel: string;
  /** Engine dial. Never shown as "difficulty" — the player picks stakes, not a level. */
  difficulty: 'easy' | 'normal' | 'hard';
  /** Who you can expect across the felt at this money. */
  oppLabel: string;
}

export const STAKES_TIERS: StakesTier[] = [
  {
    key: 'flicker',
    name: '血 引',
    buyIn: 100,
    description: '浅尝辄止，先见见血',
    color: 'teal',
    tableLabel: '低 台',
    difficulty: 'easy',
    oppLabel: '生 手',
  },
  {
    key: 'pact',
    name: '血 契',
    buyIn: 300,
    description: '以筹码起誓的契约',
    color: 'amber',
    tableLabel: '中 台',
    difficulty: 'normal',
    oppLabel: '老 手',
  },
  {
    key: 'regicide',
    name: '弑 君',
    buyIn: 1000,
    description: '赌上一切，弑君夺位',
    color: 'blood',
    tableLabel: '高 台',
    difficulty: 'hard',
    oppLabel: '狠 角 色',
  },
];

const COLOR_VARS: Record<StakesTier['color'], { text: string; rgb: string; bg: string }> = {
  teal: { text: '#2a8a8a', rgb: '42,138,138', bg: '#0a1818' },
  amber: { text: '#c49a30', rgb: '196,154,48', bg: '#141008' },
  blood: { text: '#dd2222', rgb: '170,17,17', bg: '#1a0808' },
};

const CUT = 12;
const CLIP = `polygon(${CUT}px 0,calc(100% - ${CUT}px) 0,100% ${CUT}px,100% calc(100% - ${CUT}px),calc(100% - ${CUT}px) 100%,${CUT}px 100%,0 calc(100% - ${CUT}px),0 ${CUT}px)`;

interface TierCardProps {
  tier: StakesTier;
  selected: boolean;
  /** Below the buy-in — the card greys out and says why. */
  affordable?: boolean;
  onClick: () => void;
}

export default function TierCard({ tier, selected, affordable = true, onClick }: TierCardProps) {
  const c = COLOR_VARS[tier.color];
  const isTopTier = tier.key === 'regicide';
  const dim = !affordable;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group relative flex-1 min-w-0 text-left transition-all duration-300 active:translate-y-0 ' +
        (selected ? 'sm:-translate-y-1.5' : 'hover:-translate-y-1')
      }
      style={{
        clipPath: CLIP,
        background: selected
          ? `linear-gradient(180deg, ${c.bg} 0%, rgba(4,4,9,0.96) 100%)`
          : 'linear-gradient(180deg, rgba(14,14,22,0.72) 0%, rgba(4,4,9,0.88) 100%)',
        boxShadow: selected
          ? `inset 0 0 0 1px ${c.text}, inset 0 0 26px rgba(${c.rgb},0.14), 0 0 ${isTopTier ? 44 : 28}px rgba(${c.rgb},${isTopTier ? 0.45 : 0.3}), 0 14px 30px rgba(0,0,0,0.6)`
          : `inset 0 0 0 1px rgba(${c.rgb},0.28), 0 10px 24px rgba(0,0,0,0.5)`,
        padding: '18px 14px 16px',
        opacity: dim ? 0.42 : 1,
        filter: dim ? 'saturate(0.35)' : undefined,
      }}
    >
      {/* Top rule — the card's identity stripe, lit only when chosen. */}
      <span
        className="absolute top-0 inset-x-0 h-[2px] transition-opacity duration-300 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${c.text}, transparent)`,
          boxShadow: `0 0 12px rgba(${c.rgb},0.7)`,
          opacity: selected ? 1 : 0.3,
        }}
      />

      {/* Inset hairline frame. */}
      <span
        className="absolute pointer-events-none transition-opacity duration-300"
        style={{ inset: '5px', clipPath: CLIP, border: `1px solid rgba(${c.rgb},${selected ? 0.5 : 0.16})` }}
      />

      {/* Floor glow, strongest on the top table. */}
      <span
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          clipPath: CLIP,
          background: `radial-gradient(ellipse 80% 50% at 50% 118%, rgba(${c.rgb},${isTopTier ? 0.3 : 0.2}), transparent 72%)`,
          opacity: selected ? 1 : 0.35,
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* Where in the room this table is. */}
        <p
          className="text-[9px] sm:text-[10px] tracking-[4px] font-display uppercase leading-none"
          style={{ color: selected ? `rgba(${c.rgb},0.95)` : '#555048' }}
        >
          {tier.tableLabel}
        </p>

        <p
          className={
            (isTopTier ? 'font-gothic text-cracked text-2xl sm:text-[1.75rem]' : 'font-display font-bold text-xl sm:text-2xl') +
            ' tracking-[5px] leading-none mt-3 whitespace-nowrap'
          }
          style={{ color: selected ? c.text : '#908880' }}
        >
          {tier.name}
        </p>

        {/* The money. The biggest thing on the card, because it IS the choice. */}
        <p
          className="font-display font-black text-[2rem] sm:text-[2.6rem] leading-none mt-3 tabular-nums transition-all duration-300"
          style={{
            color: selected ? '#f0ece4' : c.text,
            textShadow: selected ? `0 0 ${16 + (isTopTier ? 12 : 0)}px rgba(${c.rgb},0.8)` : 'none',
          }}
        >
          {tier.buyIn}
        </p>
        <p className="text-[9px] tracking-[3px] text-text-dim uppercase font-display mt-1">买入筹码</p>

        <div
          className="w-10 h-px my-3.5 transition-colors duration-300"
          style={{ background: selected ? `rgba(${c.rgb},0.8)` : '#2a2a3a' }}
        />

        <p className="text-[10px] sm:text-[11px] text-text-muted tracking-[1px] font-display text-center leading-relaxed px-1 min-h-[2.2em]">
          {tier.description}
        </p>

        {/* Who's sitting at this money — stakes and opponent are one dial. */}
        <p
          className="text-[9px] sm:text-[10px] tracking-[3px] font-display px-3 py-1 mt-3 whitespace-nowrap transition-colors duration-300"
          style={{
            color: selected ? c.text : '#767068',
            border: `1px solid ${selected ? `rgba(${c.rgb},0.65)` : '#252533'}`,
            background: selected ? `rgba(${c.rgb},0.08)` : 'transparent',
          }}
        >
          对家 · {tier.oppLabel}
        </p>

        {dim && (
          <p className="text-[9px] tracking-[2px] text-blood-glow font-display mt-2.5 whitespace-nowrap">筹码不足</p>
        )}
      </div>
    </button>
  );
}
