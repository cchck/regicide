'use client';

import { STARTING_CHIPS } from '@/lib/types';

interface BloodMeterProps {
  chips: number;
  side: 'left' | 'right';
  label: string;
  color?: 'red' | 'teal';
}

const GRIDLINES = 8;
const CEILING = STARTING_CHIPS * 2; // meter reads "full" at double your starting stack
const CUT = 14; // corner-cut size, matching DecoButton's Art Deco plaque language
const VESSEL_CLIP = `polygon(${CUT}px 0,calc(100% - ${CUT}px) 0,100% ${CUT}px,100% calc(100% - ${CUT}px),calc(100% - ${CUT}px) 100%,${CUT}px 100%,0 calc(100% - ${CUT}px),0 ${CUT}px)`;

export default function BloodMeter({
  chips,
  side,
  label,
  color = 'red',
}: BloodMeterProps) {
  const fillPercent = Math.min((chips / CEILING) * 100, 100);
  const isOverflow = chips > CEILING;
  const delta = chips - STARTING_CHIPS;
  const intensity = Math.min(Math.abs(delta) / STARTING_CHIPS, 1);

  const colors = {
    red: {
      bg: '#0f0505',
      fill: '#8b0000',
      fillBright: '#aa1111',
      glow: 'rgba(170, 17, 17, ',
      wave1: '#991111',
      wave2: '#770808',
      text: '#dd2222',
      textDim: '#aa1111',
      bubble: '#cc2222',
    },
    teal: {
      bg: '#050f0f',
      fill: '#0e4444',
      fillBright: '#1a6666',
      glow: 'rgba(42, 138, 138, ',
      wave1: '#1a5c5c',
      wave2: '#0e3535',
      text: '#2a8a8a',
      textDim: '#1a5c5c',
      bubble: '#2a8a8a',
    },
  };

  const c = colors[color];

  return (
    <div
      className={`fixed top-0 bottom-0 ${side === 'left' ? 'left-0' : 'right-0'} w-[104px] sm:w-[126px] z-40 flex flex-col`}
      style={{ background: c.bg }}
    >
      {/* Label at top */}
      <div className="py-3 text-center">
        <span
          className="text-[15px] sm:text-[17px] tracking-[3px] uppercase font-display font-bold block"
          style={{ color: c.text, writingMode: 'vertical-rl', textOrientation: 'mixed', margin: '0 auto', textShadow: `0 0 8px ${c.glow}0.5)` }}
        >
          {label}
        </span>
      </div>

      {/* Meter body — the clipped fill/wave visuals live here */}
      <div className="flex-1 relative mx-1.5 mb-2">
        <div className="absolute inset-0 overflow-hidden border" style={{ borderColor: `${c.glow}0.25)`, clipPath: VESSEL_CLIP }}>
          {/* Background grid lines */}
          {Array.from({ length: GRIDLINES }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t"
              style={{
                bottom: `${((i + 1) / GRIDLINES) * 100}%`,
                borderColor: `${c.glow}0.08)`,
              }}
            />
          ))}

          {/* Blood fill */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
            style={{ height: `${fillPercent}%` }}
          >
            {/* Main fill */}
            <div className="absolute inset-0" style={{ background: c.fill }} />

            {/* Wave layer 1 */}
            <div className="absolute top-0 left-0 right-0 h-3 overflow-hidden" style={{ transform: 'translateY(-50%)' }}>
              <svg
                viewBox="0 0 120 20"
                preserveAspectRatio="none"
                className="w-[200%] h-full"
                style={{
                  animation: `wave-scroll ${3 - intensity * 1.5}s linear infinite`,
                }}
              >
                <path
                  d="M0,10 Q15,4 30,10 Q45,16 60,10 Q75,4 90,10 Q105,16 120,10 L120,20 L0,20 Z"
                  fill={c.wave1}
                />
              </svg>
            </div>

            {/* Wave layer 2 (offset) */}
            <div className="absolute top-0 left-0 right-0 h-2 overflow-hidden" style={{ transform: 'translateY(-30%)' }}>
              <svg
                viewBox="0 0 120 20"
                preserveAspectRatio="none"
                className="w-[200%] h-full"
                style={{
                  animation: `wave-scroll-reverse ${4 - intensity * 2}s linear infinite`,
                  opacity: 0.6,
                }}
              >
                <path
                  d="M0,10 Q15,5 30,10 Q45,15 60,10 Q75,5 90,10 Q105,15 120,10 L120,20 L0,20 Z"
                  fill={c.wave2}
                />
              </svg>
            </div>

            {/* Bubbles — more as the stakes swing further from the starting stack */}
            {chips > 0 && (
              <div className="absolute inset-0 overflow-hidden">
                {Array.from({ length: Math.min(Math.floor(intensity * 8) + 1, 8) }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: `${3 + Math.random() * 4}px`,
                      height: `${3 + Math.random() * 4}px`,
                      left: `${10 + (i * 10) % 80}%`,
                      bottom: `${Math.random() * 60}%`,
                      background: c.bubble,
                      opacity: 0.3 + intensity * 0.3,
                      animation: `bubble-rise ${2 + Math.random() * 3}s ease-in infinite`,
                      animationDelay: `${Math.random() * 2}s`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Glow overlay when the stakes are running high */}
            {intensity > 0.4 && (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to top, ${c.glow}${0.1 + intensity * 0.15}), transparent)`,
                  animation: 'blood-breathe 2s ease-in-out infinite',
                }}
              />
            )}
          </div>

          {/* Overflow pulsing border — scoped to the meter body, not the whole column */}
          {isOverflow && (
            <div
              className="absolute inset-0 pointer-events-none rounded-sm"
              style={{
                boxShadow: `inset 0 0 20px ${c.glow}0.3)`,
                animation: 'blood-breathe 1s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* Chip count — deliberately NOT clipped by the meter's overflow-hidden.
            It's allowed to spill past the narrow rail so the number stays big and legible. */}
        <div
          className={'absolute inset-y-0 flex flex-col items-center justify-center gap-1 z-10 pointer-events-none w-max ' + (side === 'left' ? 'left-1/2 -translate-x-1/2' : 'right-1/2 translate-x-1/2')}
        >
          <span
            className="text-5xl sm:text-6xl font-display font-black transition-all duration-300 leading-none whitespace-nowrap"
            style={{
              color: c.fillBright,
              textShadow: `0 0 ${14 + intensity * 30}px ${c.glow}0.8), 0 2px 4px rgba(0,0,0,0.9)`,
              transform: isOverflow ? 'scale(1.12)' : 'scale(1)',
              WebkitTextStroke: `0.6px ${c.glow}0.9)`,
            }}
          >
            {chips}
          </span>
          <span
            className={'text-sm sm:text-base font-display font-bold tracking-wider whitespace-nowrap ' + (delta > 0 ? 'text-blood-glow' : delta < 0 ? 'text-text-muted' : 'text-text-dim')}
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
          >
            {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : '— 0'}
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes wave-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes wave-scroll-reverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes bubble-rise {
          0% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { opacity: 0.6; }
          100% { transform: translateY(-200%) scale(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
