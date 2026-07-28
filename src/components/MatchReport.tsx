'use client';

// The settlement plate — what rises out of the black once a finale has played out.
// One component serves all five endings; the theme table decides its face.

import { useEffect, useState } from 'react';
import DecoButton from './DecoButton';
import { audio, SfxName } from '@/lib/audio';
import { FinaleKind, FINALE_TIMINGS } from './TableScene';

// ————————————————————————— the shared stage clock —————————————————————————
// Both game pages (AI and PvP) drive the same sequence: cinema → cut → report.
// The scene layer runs its own copy of this timeline off the same FINALE_TIMINGS,
// so the DOM blackout lands exactly when the scene expects to disappear.

export type FinaleStage = 'idle' | 'cinema' | 'cut' | 'report';

// Audio cues, ms from finale start. The execution's hard cut silences everything
// itself — its later cues (thud, tinnitus) play into that silence.
const CUES: Record<FinaleKind, [number, SfxName][]> = {
  execution: [[1400, 'drillKill'], [2600, 'thud'], [2950, 'tinnitus']],
  // The slam is the needle landing, so it rides the same 1.35s beat as his head-snap.
  regicide: [[1000, 'drillKill'], [1350, 'cardSlam']],
  broke: [[1000, 'click'], [1600, 'click'], [2200, 'click']], // breakers tripping
  drained: [[800, 'cardSlam']],
  deserted: [[700, 'click']],
};
const PLATE_STING: Partial<Record<FinaleKind, SfxName>> = {
  regicide: 'winRound',
  drained: 'winRound',
  deserted: 'winRound',
  broke: 'loseRound',
};

export function useFinaleStage(kind: FinaleKind | null): FinaleStage {
  const [stage, setStage] = useState<FinaleStage>('idle');
  useEffect(() => {
    if (!kind) {
      setStage('idle');
      return;
    }
    setStage('cinema');
    const T = FINALE_TIMINGS[kind];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    for (const [ms, name] of CUES[kind]) at(ms, () => audio.sfx(name));
    at(T.cut * 1000, () => {
      setStage('cut');
      if (T.hardCut) {
        // The execution's cut is a full sensory amputation — music and motor die
        // with the image, and the thud/tinnitus arrive into genuine silence.
        audio.stopMusic();
        audio.stopDrillRumble();
      }
    });
    at(T.plate * 1000, () => {
      setStage('report');
      const sting = PLATE_STING[kind];
      if (sting) audio.sfx(sting);
      audio.playMusic('lobby');
    });
    return () => timers.forEach(clearTimeout);
  }, [kind]);
  return stage;
}

// ————————————————————————— the plate itself —————————————————————————

const THEME: Record<FinaleKind, {
  tag: string; title: string; sub: string; line: string;
  color: string; glow: string; won: boolean;
}> = {
  execution: {
    tag: '败 北', title: '处 刑', sub: 'EXECUTED', color: '#dd2222', glow: 'rgba(221,34,34,0.5)',
    line: '钻头停在了它该停的地方。', won: false,
  },
  regicide: {
    tag: '胜 利', title: '弑 君', sub: 'REGICIDE', color: '#e8b850', glow: 'rgba(232,184,80,0.5)',
    line: '王座易主。', won: true,
  },
  broke: {
    tag: '败 北', title: '身 无 分 文', sub: 'BANKRUPT', color: '#7a8494', glow: 'rgba(122,132,148,0.4)',
    line: '欢迎来到地下。', won: false,
  },
  drained: {
    tag: '胜 利', title: '尽 收 囊 中', sub: 'CLEANED OUT', color: '#e8b850', glow: 'rgba(232,184,80,0.5)',
    line: '他已经没有可以输的东西了。', won: true,
  },
  deserted: {
    tag: '胜 利', title: '不 战 而 胜', sub: 'DESERTION', color: '#e8b850', glow: 'rgba(232,184,80,0.5)',
    line: '对手逃离了赌桌。', won: true,
  },
};

function Stat({ label, value, accent, delay }: { label: string; value: string; accent?: string; delay: number }) {
  return (
    <div className="text-center fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <p
        className="font-display font-bold text-3xl sm:text-4xl leading-none"
        style={{ color: accent ?? '#e8e0d0', textShadow: accent ? `0 0 18px ${accent}55` : 'none' }}
      >
        {value}
      </p>
      <p className="text-[10px] tracking-[4px] text-text-muted font-display mt-2.5 uppercase">{label}</p>
    </div>
  );
}

export default function MatchReport({
  kind, sets, chipDelta, finalChips, regicides, folds, durationSec, oppName, settled, onExit,
}: {
  kind: FinaleKind;
  /** [yours, theirs] */
  sets: [number, number];
  /** Net chips versus the buy-in; null when unknown. */
  chipDelta: number | null;
  finalChips: number;
  regicides?: number;
  folds?: number;
  durationSec?: number | null;
  oppName?: string;
  settled: boolean;
  onExit: () => void;
}) {
  const t = THEME[kind];
  const stats: { label: string; value: string; accent?: string }[] = [
    { label: '比 分', value: `${sets[0]} — ${sets[1]}` },
    ...(chipDelta !== null
      ? [{
          label: '筹 码 净 变 动',
          value: `${chipDelta >= 0 ? '+' : ''}${chipDelta}`,
          accent: chipDelta > 0 ? '#e8b850' : chipDelta < 0 ? '#dd2222' : undefined,
        }]
      : []),
    { label: '带 出', value: String(finalChips) },
    ...(regicides !== undefined ? [{ label: '弑 君', value: String(regicides), accent: regicides > 0 ? '#dd2222' : undefined }] : []),
    ...(folds !== undefined ? [{ label: '弃 牌', value: String(folds) }] : []),
    ...(durationSec ? [{ label: '用 时', value: `${Math.floor(durationSec / 60)}′${String(Math.round(durationSec % 60)).padStart(2, '0')}″` }] : []),
  ];

  return (
    // Scrolls rather than centres-and-clips: six stats under a 96px title can outgrow a
    // short viewport, and `items-center` + `overflow-hidden` resolves that by overlapping
    // the button onto the last stat row instead of letting anything move.
    <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
      {/* A single breath of the verdict color, from below — like a stage light coming up */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 75% 45% at 50% 108%, ${t.glow} 0%, transparent 62%)` }}
      />

      <div className="relative min-h-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl text-center">
          {/* The verdict banner — reads at a glance from across the room, which the old
              12px caption under a 96px title never did. */}
          <div className="flex items-center justify-center gap-5 slide-up">
            <span className="h-px flex-1 max-w-[100px]" style={{ background: `linear-gradient(to right, transparent, ${t.color}99)` }} />
            <span
              className="font-display font-bold text-2xl sm:text-3xl tracking-[12px] uppercase whitespace-nowrap"
              style={{ color: t.color, textShadow: `0 0 22px ${t.glow}` }}
            >
              {t.tag}
            </span>
            <span className="h-px flex-1 max-w-[100px]" style={{ background: `linear-gradient(to left, transparent, ${t.color}99)` }} />
          </div>

          <h1
            className="font-gothic text-cracked leading-none my-6 text-6xl sm:text-7xl md:text-8xl tracking-[14px] slide-up"
            style={{ color: t.color, textShadow: `0 0 34px ${t.glow}`, animationDelay: '120ms' }}
          >
            {t.title}
          </h1>

          <p className="text-[10px] tracking-[8px] text-text-muted font-mono uppercase fade-in-up" style={{ animationDelay: '280ms' }}>
            {t.sub}
          </p>

          <p className="text-sm sm:text-base tracking-[4px] text-text-secondary font-display mt-6 fade-in-up" style={{ animationDelay: '420ms' }}>
            {t.line}
            {kind === 'deserted' && oppName ? `（${oppName}）` : ''}
          </p>

          <div className="h-px my-8 bg-gradient-to-r from-transparent via-border to-transparent fade-in-up" style={{ animationDelay: '520ms' }} />

          <div
            className="grid gap-y-7"
            style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, minmax(0, 1fr))` }}
          >
            {stats.map((s, i) => (
              <Stat key={s.label} label={s.label} value={s.value} accent={s.accent} delay={600 + i * 110} />
            ))}
          </div>

          {settled && (
            <p className="text-[11px] tracking-[3px] text-text-muted font-display mt-8 fade-in-up" style={{ animationDelay: '1200ms' }}>
              已 结 算 至 账 户
            </p>
          )}

          <div className="mt-8 fade-in-up" style={{ animationDelay: '1350ms' }}>
            <DecoButton onClick={onExit} color="neutral" size="lg">返 回 大 厅</DecoButton>
          </div>
        </div>
      </div>
    </div>
  );
}
