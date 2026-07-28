'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import type { DealerAction } from './TableScene';

// The wire names, and how each one reads on the opponent's table.
export const EMOTES = ['taunt', 'clap', 'doze', 'angry', 'think'] as const;
export type Emote = (typeof EMOTES)[number];

// Emote → the clip the opponent's figure plays.
export const EMOTE_ACTION: Record<Emote, DealerAction> = {
  taunt: 'taunt',
  clap: 'win', // Sitting_Clap — slow, seated applause. Withering.
  doze: 'doze',
  angry: 'angry',
  think: 'think',
};

// Single-glyph icons, same language as the hub cards.
const DEF: { key: Emote; glyph: string; label: string; hint: string; color: string }[] = [
  { key: 'taunt', glyph: '嘲', label: '嘲 讽', hint: '捶胸挑衅', color: '#dd2222' },
  { key: 'clap', glyph: '掌', label: '鼓 掌', hint: '慢条斯理的掌声', color: '#c49a30' },
  { key: 'doze', glyph: '眠', label: '打 盹', hint: '你太慢了', color: '#2a8a8a' },
  { key: 'angry', glyph: '怒', label: '愤 怒', hint: '拍案而起', color: '#dd2222' },
  { key: 'think', glyph: '思', label: '沉 吟', hint: '故作犹豫', color: '#908880' },
];

const COOLDOWN_MS = 2500;
const CLIP = 'polygon(7px 0,calc(100% - 7px) 0,100% 7px,100% calc(100% - 7px),calc(100% - 7px) 100%,7px 100%,0 calc(100% - 7px),0 7px)';

export default function EmoteDock({ onEmote }: { onEmote: (e: Emote) => void }) {
  const [until, setUntil] = useState(0);
  const [sent, setSent] = useState<Emote | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick only while cooling down.
  useEffect(() => {
    if (until <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(t);
  }, [until]);

  useEffect(() => () => { if (sentTimer.current) clearTimeout(sentTimer.current); }, []);

  const cooling = until > now;
  const remain = cooling ? (until - now) / COOLDOWN_MS : 0;

  const fire = useCallback((e: Emote) => {
    if (until > Date.now()) return;
    audio.sfx('click');
    onEmote(e);
    setUntil(Date.now() + COOLDOWN_MS);
    setNow(Date.now());
    // You're in first person — you never see your own figure, so confirm it landed.
    setSent(e);
    if (sentTimer.current) clearTimeout(sentTimer.current);
    sentTimer.current = setTimeout(() => setSent(null), 1600);
  }, [onEmote, until]);

  return (
    <div className="absolute bottom-5 left-4 sm:left-6 z-20 pointer-events-auto flex flex-col items-start gap-2.5">
      {/* Confirmation — the only feedback you get that your taunt went out */}
      <div className="h-5 flex items-end">
        {sent && (
          <span
            className="text-[11px] tracking-[3px] font-display fade-in"
            style={{ color: DEF.find((d) => d.key === sent)!.color }}
          >
            已发出 · {DEF.find((d) => d.key === sent)!.label}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {DEF.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => fire(d.key)}
            disabled={cooling}
            title={`${d.label} — ${d.hint}`}
            className={
              'group relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center border bg-black/45 backdrop-blur-sm transition-all duration-200 ' +
              (cooling ? 'opacity-35 cursor-not-allowed' : 'hover:-translate-y-0.5 active:scale-95')
            }
            style={{
              clipPath: CLIP,
              borderColor: cooling ? '#2a2a3a' : d.color + '80',
              boxShadow: cooling ? 'none' : `inset 0 0 10px rgba(0,0,0,0.5)`,
            }}
          >
            <span
              className="font-gothic text-2xl sm:text-3xl leading-none transition-all duration-200"
              style={{ color: d.color, textShadow: cooling ? 'none' : `0 0 12px ${d.color}60` }}
            >
              {d.glyph}
            </span>

            {/* Label slides out on hover — keeps the dock tiny until you need it */}
            <span
              className="absolute left-full ml-2 px-2.5 py-1 whitespace-nowrap text-[11px] tracking-[3px] font-display bg-black/85 border border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ color: d.color }}
            >
              {d.label}
            </span>
          </button>
        ))}
      </div>

      {/* Cooldown bar — drains left to right under the whole dock */}
      <div className="w-12 sm:w-14 h-0.5 bg-black/60 overflow-hidden">
        <div
          className="h-full bg-amber/70"
          style={{ width: `${remain * 100}%`, transition: cooling ? 'none' : 'width 0.2s' }}
        />
      </div>
    </div>
  );
}
