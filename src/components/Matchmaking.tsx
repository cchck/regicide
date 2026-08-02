'use client';

// The moment between pressing "sit down" and a game existing.
//
// Two honest states, and the honesty is the design:
//   searching — the house is genuinely asking the other tables. There is a real queue
//               behind this on the server; the rings are not a fake progress bar.
//   seated    — someone took the chair. Either a real player, or, when nobody answers,
//               the house itself. We say WHICH. An AI wearing a fake player name would
//               poison the one feature that reads real opponents (读心), so it is named.
//
// Visually this is the empty chair opposite you, lit and watched: octagonal rings pushing
// outward from the seat, a slow gold arm sweeping the room, and a clock that keeps count.

import { useEffect, useState } from 'react';
import { StakesTier } from './TierCard';
import DecoButton from './DecoButton';

export type SeatPhase = 'searching' | 'seated';

const CLIP_8 =
  'polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)';

// Octagon, drawn as a border so the ring is a hairline rather than a filled disc.
const OCTAGON = 'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)';

const TIER_INK: Record<StakesTier['color'], string> = {
  teal: '42,138,138',
  amber: '196,154,48',
  blood: '170,17,17',
};

/** What the house says while it looks. It gets less hopeful the longer you wait. */
function seekingLine(seconds: number): string {
  if (seconds < 4) return '正在叩问牌桌的另一侧';
  if (seconds < 9) return '大厅里还有人醒着';
  if (seconds < 14) return '有人在门口犹豫';
  return '几乎没人敢坐这张台子';
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface MatchmakingProps {
  tier: StakesTier;
  phase: SeatPhase;
  /** Who took the seat. `null` while still searching. */
  opponent: { name: string; isHouse: boolean } | null;
  myName: string;
  onCancel: () => void;
}

export default function Matchmaking({ tier, phase, opponent, myName, onCancel }: MatchmakingProps) {
  const ink = TIER_INK[tier.color];
  const [elapsed, setElapsed] = useState(0);

  // The clock stops the instant the chair is taken — it's a record of the wait, not a timer.
  useEffect(() => {
    if (phase !== 'searching') return;
    setElapsed(0);
    const started = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(iv);
  }, [phase]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center px-6 fade-in pointer-events-auto">
      {/* Everything else in the room dims down to the one empty chair. */}
      <div
        className="absolute inset-0 backdrop-blur-[3px]"
        style={{
          background:
            `radial-gradient(ellipse 55% 45% at 50% 44%, rgba(${ink},0.10) 0%, transparent 60%),` +
            'radial-gradient(ellipse 90% 80% at 50% 50%, rgba(2,2,6,0.72) 0%, rgba(2,2,6,0.95) 100%)',
        }}
      />

      {/* ————— The table this is happening at ————— */}
      <div className="relative text-center mb-2">
        <p className="text-[10px] sm:text-[11px] tracking-[7px] text-text-dim font-display uppercase">
          {tier.tableLabel}
        </p>
        <p
          className="font-display font-bold text-lg sm:text-xl tracking-[8px] mt-2"
          style={{ color: `rgb(${ink})` }}
        >
          {tier.name}
        </p>
        <p className="text-[11px] tracking-[3px] text-text-muted font-display mt-1.5">
          买入 <span className="text-text-bright font-bold">{tier.buyIn}</span> 筹码
        </p>
      </div>

      {phase === 'searching' ? (
        /* ————————————————— searching ————————————————— */
        <div className="relative flex flex-col items-center">
          {/* The empty chair, watched. */}
          <div className="relative w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] flex items-center justify-center my-2">
            {/* Rings pushing outward. Three, staggered, so there is always one mid-flight. */}
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute inset-0 deco-ping pointer-events-none"
                style={{
                  clipPath: OCTAGON,
                  boxShadow: `inset 0 0 0 1px rgba(${ink},0.55)`,
                  animationDelay: `${i * 1.07}s`,
                }}
              />
            ))}

            {/* A single arm of light going round the room, looking. */}
            <span
              className="absolute inset-0 seek-sweep pointer-events-none opacity-70"
              style={{
                clipPath: OCTAGON,
                background: `conic-gradient(from 0deg, rgba(${ink},0.30) 0deg, rgba(${ink},0.06) 26deg, transparent 60deg, transparent 360deg)`,
              }}
            />

            {/* Fixed frame the sweep runs inside. */}
            <span
              className="absolute inset-[14%] pointer-events-none"
              style={{ clipPath: OCTAGON, boxShadow: `inset 0 0 0 1px rgba(${ink},0.28)` }}
            />

            {/* The seat itself: empty, and saying so. */}
            <div className="relative text-center">
              <p
                className="font-gothic text-6xl sm:text-7xl leading-none"
                style={{ color: `rgba(${ink},0.9)`, textShadow: `0 0 34px rgba(${ink},0.55)` }}
              >
                空
              </p>
              <p className="text-[10px] tracking-[5px] text-text-dim font-display mt-3 uppercase">对面无人</p>
            </div>
          </div>

          {/* Clock + what the house is doing. */}
          <p
            className="font-display font-black text-3xl sm:text-4xl tabular-nums tracking-[4px] text-text-bright mt-1"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
          >
            {clock(elapsed)}
          </p>
          <div
            className="w-28 h-px mt-3 seek-breathe"
            style={{ background: `linear-gradient(90deg, transparent, rgba(${ink},0.9), transparent)` }}
          />
          <p className="text-sm tracking-[4px] text-text-secondary font-display mt-4 text-center">
            {seekingLine(elapsed)}
            <span className="inline-block w-6 text-left">
              {'·'.repeat((Math.floor(elapsed * 1.5) % 3) + 1)}
            </span>
          </p>
          <p className="text-[10px] tracking-[3px] text-text-dim font-display mt-2.5 text-center max-w-sm leading-relaxed">
            找不到人时，庄家会亲自坐下来 — 届时会明说
          </p>

          <div className="mt-9">
            <DecoButton color="neutral" size="md" onClick={onCancel}>
              取 消 匹 配
            </DecoButton>
          </div>
        </div>
      ) : (
        /* ————————————————— seated ————————————————— */
        <div className="relative flex flex-col items-center mt-4">
          <p
            className="text-xs tracking-[8px] font-display uppercase mb-8"
            style={{ color: opponent?.isHouse ? '#c49a30' : `rgb(${ink})` }}
          >
            {opponent?.isHouse ? '无 人 应 答' : '有 人 入 座'}
          </p>

          {/* The two of you, arriving from opposite sides. */}
          <div className="flex items-stretch gap-0">
            <Nameplate name={myName} caption="你" side="left" ink={ink} />

            {/* The stamp that lands between them last. */}
            <div className="relative w-16 sm:w-20 flex items-center justify-center">
              <span
                className="absolute w-11 h-11 sm:w-12 sm:h-12 lozenge-stamp"
                style={{
                  border: '1px solid rgba(196,154,48,0.85)',
                  background: '#0a0a12',
                  boxShadow: '0 0 26px rgba(196,154,48,0.4)',
                }}
              />
              {/* The glyph fades in on the stamp's beat but must NOT inherit its 45°
                  rotation — that belongs to the lozenge behind it. */}
              <span
                className="relative font-gothic text-2xl sm:text-3xl text-amber-bright fade-in"
                style={{ animationDelay: '0.42s', animationFillMode: 'both' }}
              >
                決
              </span>
            </div>

            <Nameplate
              name={opponent?.name ?? '—'}
              caption={opponent?.isHouse ? '庄家' : '对家'}
              side="right"
              ink={opponent?.isHouse ? '196,154,48' : ink}
              house={opponent?.isHouse}
            />
          </div>

          <p
            className="text-[11px] tracking-[3px] text-text-muted font-display mt-9 text-center max-w-md leading-relaxed fade-in"
            style={{ animationDelay: '600ms', animationFillMode: 'both' }}
          >
            {opponent?.isHouse
              ? '此刻大厅里没有别人。庄家脱下手套，在你对面坐下。'
              : `双方各押 ${tier.buyIn} 筹码 · 牌已经在发了`}
          </p>
        </div>
      )}
    </div>
  );
}

function Nameplate({
  name,
  caption,
  side,
  ink,
  house = false,
}: {
  name: string;
  caption: string;
  side: 'left' | 'right';
  ink: string;
  house?: boolean;
}) {
  return (
    <div
      className={
        'relative w-[130px] sm:w-[168px] px-4 py-6 text-center ' +
        (side === 'left' ? 'plate-in-left' : 'plate-in-right')
      }
      style={{
        clipPath: CLIP_8,
        background: `linear-gradient(${side === 'left' ? '100deg' : '260deg'}, rgba(${ink},0.16) 0%, rgba(8,8,15,0.94) 70%)`,
        boxShadow: `inset 0 0 0 1px rgba(${ink},0.42), 0 12px 30px rgba(0,0,0,0.6)`,
        animationDelay: side === 'left' ? '0ms' : '110ms',
      }}
    >
      {/* Colour rule on the outer edge — the two plates mirror each other. */}
      <span
        className="absolute inset-y-0 w-[2px]"
        style={{
          [side === 'left' ? 'left' : 'right']: 0,
          background: `linear-gradient(180deg, transparent, rgba(${ink},0.95), transparent)`,
        }}
      />

      <p
        className={(house ? 'font-gothic text-4xl sm:text-5xl' : 'font-display font-black text-2xl sm:text-3xl') + ' leading-none'}
        style={{ color: house ? `rgb(${ink})` : '#f0ece4', textShadow: `0 0 20px rgba(${ink},0.45)` }}
      >
        {house ? '庄' : name}
      </p>
      {!house && (
        <div className="w-6 h-px mx-auto my-3" style={{ background: `rgba(${ink},0.6)` }} />
      )}
      <p
        className={'text-[10px] tracking-[4px] font-display uppercase ' + (house ? 'mt-3.5' : '')}
        style={{ color: `rgba(${ink},0.95)` }}
      >
        {caption}
      </p>
    </div>
  );
}
