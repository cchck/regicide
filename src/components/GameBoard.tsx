'use client';

import { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { gameReducer, initialState } from '@/lib/game-engine';
import { aiSelectCard, aiSetOpeningBet, aiRespondToBet, aiBetResponse } from '@/lib/ai';
import { CardType, BetAction, GameState, ANTE, BET_UNIT, STARTING_CHIPS } from '@/lib/types';

// Crash-recovery snapshot slot (localStorage). Bump the version to orphan old shapes.
const RESUME_KEY = 'regicide-resume-v1';
import { TUTORIAL_SCENES } from '@/lib/tutorial';
import { audio } from '@/lib/audio';
import CardArt from './CardArt';
import TableScene, { Quality, DealerAction, FinaleKind, FINALE_TIMINGS, ViewMode } from './TableScene';
import MatchReport, { useFinaleStage } from './MatchReport';
import { useQuality } from '@/lib/device';
import { useLoadout } from '@/lib/useLoadout';
import RotatePrompt from './RotatePrompt';
import DecoButton from './DecoButton';
import Flourish from './Flourish';
import { STAKES_TIERS } from './TierCard';

/** Drawn blind when the house sits down. Never surfaced — see the handoff effect below. */
const AI_TEMPERAMENTS = ['aggressive', 'cautious', 'deceptive'] as const;
import { CHIPS_EVENT, MATCH_EVENT } from './AccountBar';
import BackButton from './BackButton';

function ScreenFlash({ type }: { type: 'emperor-win' | 'slave-kill' | 'fold' | null }) {
  if (!type) return null;
  const colors = { 'emperor-win': 'bg-amber/5', 'slave-kill': 'bg-blood/15', fold: 'bg-teal/5' };
  return <div className={'fixed inset-0 z-[60] pointer-events-none ' + colors[type]} style={{ animation: 'flash-out 0.8s ease-out forwards' }} />;
}

export function BetPicker({ onConfirm, lockBet }: { onConfirm: (bet: number) => void; lockBet?: number }) {
  // The tutorial locks the multiplier so the guided line can't be deviated from.
  const [bet, setBet] = useState(lockBet ?? 1);
  const locked = lockBet !== undefined;
  const betChips = bet * BET_UNIT;
  const total = ANTE + betChips;
  return (
    <div className="flex flex-col items-center gap-3 fade-in-up bg-black/45 backdrop-blur-md border border-amber/15 rounded-md px-6 py-4"
      style={{ boxShadow: 'inset 0 0 18px rgba(0,0,0,0.45), 0 4px 24px rgba(0,0,0,0.5)' }}>
      <p className="text-sm text-text-secondary tracking-[3px] font-display uppercase">设置初始筹码</p>
      <div className="flex items-center gap-4">
        <DecoButton onClick={() => setBet(Math.max(1, bet - 1))} disabled={locked || bet <= 1} size="sm" color="neutral" className="!px-0 w-12 h-12 text-xl">{'−'}</DecoButton>
        <div className="text-blood text-3xl font-display font-black min-w-[50px] text-center" style={{ textShadow: bet > 2 ? `0 0 ${bet * 6}px rgba(170,17,17,0.4)` : 'none' }}>{'×'}{bet}</div>
        <DecoButton onClick={() => setBet(Math.min(5, bet + 1))} disabled={locked || bet >= 5} size="sm" color="neutral" className="!px-0 w-12 h-12 text-xl">+</DecoButton>
      </div>
      <p className="text-sm text-text-muted tracking-wider font-display">
        底注 {ANTE} + 下注 {betChips} = 押入底池 <span className="text-blood-glow font-bold">{total}</span> 筹码
      </p>
      <DecoButton onClick={() => onConfirm(bet)} color="blood" size="lg" className="mt-1 min-w-[180px]">出牌</DecoButton>
    </div>
  );
}

// ————— The verdict beam: a full-width tribunal header. Each lit diamond is a set
// that side has LOST — one more notch of the drill. Lit diamonds bleed. —————

function VerdictDiamond({ lit, color, pulse }: { lit: boolean; color: 'blood' | 'teal'; pulse: boolean }) {
  const c = color === 'blood'
    ? { fill: '#aa1111', glow: 'rgba(221,34,34,0.75)', drip: 'rgba(170,17,17,0.85)' }
    : { fill: '#1a6a6a', glow: 'rgba(42,138,138,0.75)', drip: 'rgba(42,138,138,0.85)' };
  return (
    <span className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
      <span
        className="w-5 h-5 sm:w-6 sm:h-6 rotate-45 border-2 transition-all duration-700"
        style={lit ? {
          background: c.fill,
          borderColor: 'transparent',
          boxShadow: `0 0 16px ${c.glow}, inset 0 0 6px rgba(0,0,0,0.5)`,
          animation: pulse ? 'pulse-glow 1.2s ease-in-out infinite' : undefined,
        } : { borderColor: '#2a2a3a', background: 'rgba(0,0,0,0.35)' }}
      />
      {/* A lit verdict bleeds */}
      {lit && (
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full w-px h-4"
          style={{ background: `linear-gradient(180deg, ${c.drip}, transparent)` }}
        />
      )}
    </span>
  );
}

// The persistent chip readout: a rolling total that flashes on change and throws a
// floating +N/−N as it moves — the game's lifeblood, kept in view like a health bar.
function ChipCounter({ chips, color, align }: {
  chips: number; color: 'blood' | 'teal'; align: 'left' | 'right';
}) {
  const [display, setDisplay] = useState(chips);
  const [floats, setFloats] = useState<{ id: number; delta: number }[]>([]);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prev = useRef(chips);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = prev.current;
    const to = chips;
    if (from === to) return;
    prev.current = to;

    // The floating delta, keyed so several can stack if chips move in quick succession.
    const delta = to - from;
    const id = Date.now() + Math.random();
    setFloats((f) => [...f, { id, delta }]);
    setFlash(delta > 0 ? 'up' : 'down');
    const t1 = setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
    const t2 = setTimeout(() => setFlash(null), 600);

    // Tween the readout from→to over ~500ms so it visibly rolls, not jumps.
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 500, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { clearTimeout(t1); clearTimeout(t2); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [chips]);

  const gold = color === 'blood' ? '#c49a30' : '#c49a30';
  const flashColor = flash === 'up' ? '#e8c060' : flash === 'down' ? '#e83a3a' : gold;

  return (
    <div className={'relative flex items-baseline gap-1.5 ' + (align === 'right' ? 'flex-row-reverse' : '')}>
      <span
        className="font-display font-black text-2xl sm:text-3xl leading-none tabular-nums transition-colors duration-200"
        style={{ color: flashColor, textShadow: `0 0 16px ${flashColor}55` }}
      >
        {display}
      </span>
      <span className="text-[10px] tracking-[2px] text-text-muted font-display">筹码</span>

      {/* Floating deltas rise off the total */}
      {floats.map((fl) => (
        <span
          key={fl.id}
          className="chip-float absolute left-1/2 -top-1 font-display font-bold text-base sm:text-lg tabular-nums pointer-events-none whitespace-nowrap"
          style={{ color: fl.delta > 0 ? '#e8c060' : '#e83a3a', textShadow: `0 0 12px ${fl.delta > 0 ? 'rgba(232,192,96,0.7)' : 'rgba(232,58,58,0.7)'}` }}
        >
          {fl.delta > 0 ? '+' : '−'}{Math.abs(fl.delta)}
        </span>
      ))}
    </div>
  );
}

function VerdictWing({ label, lost, color, align, chips }: {
  label: string; lost: number; color: 'blood' | 'teal'; align: 'left' | 'right'; chips?: number;
}) {
  const matchPoint = lost >= 3;
  const labelColor = color === 'blood' ? 'text-blood-glow' : 'text-teal-bright';
  const fuse = color === 'blood' ? 'rgba(170,17,17,0.5)' : 'rgba(42,138,138,0.5)';
  // First lit diamond sits nearest the owner's label at the screen edge.
  const diamonds = [0, 1, 2, 3].map((i) => (
    <VerdictDiamond key={i} lit={i < lost} color={color} pulse={matchPoint && i < lost} />
  ));
  return (
    <div className={'flex flex-col gap-1.5 flex-1 min-w-0 ' + (align === 'right' ? 'items-end' : 'items-start')}>
      <div className={'flex items-center gap-3 sm:gap-4 w-full ' + (align === 'right' ? 'flex-row-reverse' : '')}>
        <span className={'text-base sm:text-lg tracking-[5px] font-display font-bold shrink-0 ' + labelColor}>{label}</span>
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {align === 'right' ? [...diamonds].reverse() : diamonds}
        </div>
        {/* Fuse line burning from the diamonds toward the center verdict */}
        <div
          className="flex-1 h-px min-w-4"
          style={{ background: align === 'left' ? `linear-gradient(90deg, ${fuse}, transparent)` : `linear-gradient(270deg, ${fuse}, transparent)` }}
        />
      </div>
      {chips != null && <ChipCounter chips={chips} color={color} align={align} />}
    </div>
  );
}

export function VerdictBar({ side, roundNumber, initiative, playerLost, opponentLost, oppLabel = 'AI', playerChips, opponentChips }: {
  side: 'emperor' | 'slave'; roundNumber: number; initiative: 'player' | 'opponent';
  playerLost: number; opponentLost: number; oppLabel?: string;
  playerChips?: number; opponentChips?: number;
}) {
  const anyMatchPoint = playerLost === 3 || opponentLost === 3;
  const sideColor = side === 'emperor' ? 'text-amber-bright' : 'text-blood-glow';
  return (
    <div className="relative w-full z-20 pointer-events-none select-none">
      {/* Smoked backdrop dissolving into the scene below */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(2,2,6,0.94) 0%, rgba(4,3,9,0.8) 55%, transparent 100%)' }} />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blood to-transparent" />
      {/* Match point: the whole beam breathes red */}
      {anyMatchPoint && (
        <div className="absolute inset-0" style={{ boxShadow: 'inset 0 20px 60px rgba(170,17,17,0.28)', animation: 'blood-breathe 2s ease-in-out infinite' }} />
      )}

      <div className="relative flex items-start justify-between gap-4 sm:gap-8 px-5 sm:px-10 pt-9 pb-3">
        <VerdictWing label="你" lost={playerLost} color="blood" align="left" chips={playerChips} />

        <div className="text-center shrink-0">
          <p className={'font-gothic text-cracked text-3xl sm:text-4xl tracking-[10px] leading-none ' + sideColor}>
            {side === 'emperor' ? '皇 帝 方' : '奴 隶 方'}
          </p>
          <div className="flex items-center justify-center gap-3 mt-2.5">
            <span className="text-sm sm:text-base text-text-bright font-display font-bold tracking-wider">第 {Math.min(roundNumber, 5)}/5 回合</span>
            <span className="w-1 h-1 rotate-45 bg-border" />
            <span className={'text-sm sm:text-base tracking-wider font-display font-bold ' + (initiative === 'player' ? 'text-blood-glow' : 'text-teal-bright')}>
              {initiative === 'player' ? '你先手' : `${oppLabel}先手`}
            </span>
          </div>
        </div>

        <VerdictWing label={oppLabel} lost={opponentLost} color="teal" align="right" chips={opponentChips} />
      </div>

      {/* Stepped Art-Deco bottom edge */}
      <div className="relative h-px bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
      <div className="relative mx-auto w-40 h-px mt-[3px] bg-gradient-to-r from-transparent via-blood-dim to-transparent" />
    </div>
  );
}

function SideSwitchOverlay({ side, show }: { side: 'emperor' | 'slave'; show: boolean }) {
  if (!show) return null;
  const color = side === 'emperor' ? 'text-amber' : 'text-blood';
  const colorBright = side === 'emperor' ? 'text-amber-bright' : 'text-blood-glow';
  const lineBg = side === 'emperor' ? 'bg-amber' : 'bg-blood';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-void/95" style={{ animation: 'side-switch 2s ease-in-out forwards' }}>
      <div className="text-center">
        <div className={color + ' text-lg tracking-[8px] uppercase mb-4'} style={{ animation: 'fade-in-up 0.6s 0.3s both' }}>换边</div>
        <div className={colorBright + ' text-4xl sm:text-5xl font-display tracking-[12px] font-bold'} style={{ animation: 'fade-in-up 0.6s 0.5s both' }}>
          {side === 'emperor' ? '皇 帝 方' : '奴 隶 方'}
        </div>
        <div className={lineBg + ' w-16 h-px mx-auto mt-6'} style={{ animation: 'fade-in-up 0.6s 0.7s both' }} />
      </div>
    </div>
  );
}

// Slim smoked-glass status pill under the top bar — routine prompts live here now,
// so the table itself stays free of floating text.
export function StatusStrip({ text, tone = 'neutral', thinking = false }: {
  text: string | null; tone?: 'teal' | 'amber' | 'blood' | 'neutral'; thinking?: boolean;
}) {
  if (!text) return null;
  const toneColor = { teal: 'text-teal-bright', amber: 'text-amber', blood: 'text-blood-glow', neutral: 'text-text-secondary' }[tone];
  const dotColor = { teal: 'bg-teal', amber: 'bg-amber', blood: 'bg-blood', neutral: 'bg-text-muted' }[tone];
  return (
    <div className="flex justify-center mt-2.5 pointer-events-none">
      <div
        className="flex items-center gap-2.5 px-5 py-1.5 bg-black/35 backdrop-blur-md border border-amber/15 rounded-full fade-in"
        style={{ boxShadow: 'inset 0 0 14px rgba(0,0,0,0.45), 0 2px 18px rgba(0,0,0,0.4)' }}
      >
        {thinking && (
          <div className="flex gap-1.5">
            {[0, 200, 400].map((d) => (
              <div key={d} className={'w-1.5 h-1.5 rounded-full animate-pulse ' + dotColor} style={{ animationDelay: d + 'ms' }} />
            ))}
          </div>
        )}
        <span className={'text-xs sm:text-sm tracking-[3px] font-display ' + toneColor}>{text}</span>
      </div>
    </div>
  );
}

export function BetActions({ onAction, allowedAction }: { onAction: (a: BetAction) => void; allowedAction?: BetAction | null }) {
  // The tutorial narrows the choice down to the guided action.
  const blocked = (a: BetAction) => (allowedAction ? a !== allowedAction : false);
  return (
    <div className="flex flex-col gap-2.5 fade-in-up items-stretch">
      <DecoButton onClick={() => onAction('call')} disabled={blocked('call')} color="teal" size="md" className="min-w-[150px]">跟 注</DecoButton>
      <DecoButton onClick={() => onAction('raise')} disabled={blocked('raise')} color="blood" size="md" className="min-w-[150px]">加 注</DecoButton>
      <DecoButton onClick={() => onAction('fold')} disabled={blocked('fold')} color="neutral" size="md" className="min-w-[150px]">弃 牌</DecoButton>
    </div>
  );
}

export default function GameBoard() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [pendingAiCard, setPendingAiCard] = useState<CardType | null>(null);
  const [flashType, setFlashType] = useState<'emperor-win' | 'slave-kill' | 'fold' | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [showSideSwitch, setShowSideSwitch] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const [firstPlayCard, setFirstPlayCard] = useState<CardType | null>(null);
  const [secondPlayCard, setSecondPlayCard] = useState<CardType | null>(null);
  // Which fan slot is raised — tracked by index because duplicate citizens share a CardType.
  const [selectedFanIndex, setSelectedFanIndex] = useState<number | null>(null);
  const [matchBuyIn, setMatchBuyIn] = useState(STARTING_CHIPS);

  // Graphics quality — persisted so a laptop that runs hot stays on its chosen tier, and
  // defaulted down on phones (see useQuality).
  const [quality, changeQuality] = useQuality();

  // ————— Finale: match-end plays out in-scene before any UI switches —————
  // Which ending this is. Order matters: bankruptcy can co-occur with 4 set-wins
  // (the killing blow both bankrupts and clinches), and the chips are the louder story.
  const finaleKind: FinaleKind | null = state.phase === 'match-end'
    ? state.opponentChips <= 0 ? 'drained'
      : state.playerChips <= 0 ? 'broke'
        : state.playerSetsWon >= 4 ? 'regicide'
          : 'execution'
    : null;
  const finaleStage = useFinaleStage(finaleKind);

  // Signal the AccountBar to hide during actual play — and during the finale cinema,
  // where a chip badge floating over an execution would be absurd.
  useEffect(() => {
    const active = state.phase !== 'menu' && !(state.phase === 'match-end' && finaleStage === 'report');
    window.dispatchEvent(new CustomEvent(MATCH_EVENT, { detail: active }));
    return () => { window.dispatchEvent(new CustomEvent(MATCH_EVENT, { detail: false })); };
  }, [state.phase, finaleStage]);

  // BGM follows the room: lounge in the menus, the table underscore in play. At
  // match-end the finale hook owns the transition (it brings lobby back at the plate,
  // or hard-cuts to silence first for the execution).
  useEffect(() => {
    if (state.phase === 'menu') audio.playMusic('lobby');
    else if (state.phase !== 'match-end') audio.playMusic('table');
  }, [state.phase]);

  // Match duration for the report.
  const matchStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase === 'menu') matchStartRef.current = null;
    else if (matchStartRef.current === null) matchStartRef.current = Date.now();
  }, [state.phase]);

  // Match point: a low heartbeat under everything.
  const matchPointNow =
    state.phase !== 'menu' && state.phase !== 'match-end' &&
    (state.playerSetsWon === 3 || state.opponentSetsWon === 3);
  useEffect(() => {
    if (matchPointNow) audio.startHeartbeat();
    else audio.stopHeartbeat();
    return () => audio.stopHeartbeat();
  }, [matchPointNow]);

  // ————— Menu routing + tutorial state machine —————
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ————— Hub stagecraft: the lobby camera, the host's beckons, the sit-down —————
  // `sitting` runs the camera glide; when it lands, the queued action fires (open the
  // AI setup, start the tutorial). Destinations that aren't THIS table (pvp/dossier/
  // ledger pages) navigate directly — you don't sit down to walk elsewhere.
  const [sitting, setSitting] = useState(false);
  const sitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sitDown = useCallback((after: () => void) => {
    if (sitTimer.current) return; // one glide at a time
    setSitting(true);
    audio.sfx('click');
    sitTimer.current = setTimeout(() => {
      sitTimer.current = null;
      after();
      setSitting(false);
    }, 2000); // SIT_SECONDS(1.9s) + a settling beat
  }, []);
  // Clearing the handle is not enough — the ref has to be released too. `sitDown` treats a
  // non-null ref as "a glide is already running", so a cleanup that cancels the timeout but
  // leaves the ref set locks out every future glide for the life of the component. In dev
  // that fires on the very first mount, because StrictMode unmounts and remounts once.
  useEffect(() => () => {
    if (sitTimer.current) clearTimeout(sitTimer.current);
    sitTimer.current = null;
  }, []);

  // Watchdog. `sitting` hides the entire hub and parks the camera in the seat, so if it
  // ever sticks the player is left staring at a dead room with no way out — which is
  // exactly what the StrictMode bug above produced. Nothing legitimate holds it for more
  // than a glide plus one network round-trip, so anything past 12s is a fault: give the
  // hub back and leave a trace rather than stranding them.
  useEffect(() => {
    if (!sitting) return;
    const t = setTimeout(() => {
      console.warn('[hub] sit-down glide never landed — releasing the camera');
      setSitting(false);
    }, 12_000);
    return () => clearTimeout(t);
  }, [sitting]);

  // The host acknowledges you now and then — a slow seated clap, "the seat is open".
  const [hubDealer, setHubDealer] = useState<DealerAction>('idle');
  useEffect(() => {
    if (state.phase !== 'menu') return;
    let inner: ReturnType<typeof setTimeout> | null = null;
    const iv = setInterval(() => {
      setHubDealer('taunt');
      inner = setTimeout(() => setHubDealer('idle'), 2600);
    }, 14000);
    return () => { clearInterval(iv); if (inner) clearTimeout(inner); };
  }, [state.phase]);
  const [tutorial, setTutorial] = useState<{ scene: number; step: number } | null>(null);
  const [tutorialDone, setTutorialDone] = useState(true); // optimistic until localStorage read
  useEffect(() => {
    setTutorialDone(localStorage.getItem('regicide-tutorial-done') === '1');
  }, []);

  const tutScene = tutorial ? TUTORIAL_SCENES[tutorial.scene] : null;
  const tutStep = tutorial && tutScene ? tutScene.steps[tutorial.step] : null;

  const startTutorialScene = useCallback((sceneIdx: number) => {
    const scene = TUTORIAL_SCENES[sceneIdx];
    settledRef.current = true; // tutorial chips are stage props — never settled to the bankroll
    setMatchBuyIn(100);
    setTutorial({ scene: sceneIdx, step: 0 });
    dispatch({ type: 'START_GAME', difficulty: 'easy', personality: 'cautious', buyIn: 100, side: scene.side });
  }, []);

  // Move one step forward within the current scene (never crosses scene boundaries).
  const advanceTutorialStep = useCallback(() => {
    setTutorial((t) => {
      if (!t) return t;
      const scene = TUTORIAL_SCENES[t.scene];
      return t.step + 1 < scene.steps.length ? { ...t, step: t.step + 1 } : t;
    });
  }, []);

  // The coach's continue/finish button.
  const handleCoachButton = useCallback(() => {
    if (!tutorial || !tutScene || !tutStep) return;
    if (tutStep.waitFor === 'finish') {
      localStorage.setItem('regicide-tutorial-done', '1');
      setTutorialDone(true);
      setTutorial(null);
      dispatch({ type: 'BACK_TO_MENU' });
      return;
    }
    if (tutorial.step + 1 < tutScene.steps.length) {
      setTutorial({ ...tutorial, step: tutorial.step + 1 });
    } else if (tutorial.scene + 1 < TUTORIAL_SCENES.length) {
      startTutorialScene(tutorial.scene + 1);
    }
  }, [tutorial, tutScene, tutStep, startTutorialScene]);

  // Auto-advancing steps: the scripted opponent responded / the round resolved.
  useEffect(() => {
    if (!tutStep) return;
    if (tutStep.waitFor === 'opponent-response' && state.phase === 'betting' && state.bettingTurn === 'player') {
      advanceTutorialStep();
    }
    if (tutStep.waitFor === 'round-end' && state.phase === 'round-end') {
      advanceTutorialStep();
    }
  }, [tutStep, state.phase, state.bettingTurn, advanceTutorialStep]);

  const router = useRouter();

  // Persistent bankroll wiring — logged-in players buy in from the database balance
  // and settle back to it when the match ends. Guests play with local chips only.
  const { data: session, status: sessionStatus } = useSession();
  const loggedIn = !!session?.user;
  // The room the player has earned/bought. Guests keep the free defaults.
  const look = useLoadout(loggedIn);
  const [starting, setStarting] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const settledRef = useRef(false);
  // Seals paid out for this match, filled in when settlement returns so the report can
  // show what the win was actually worth.
  const [sealsEarned, setSealsEarned] = useState<number | null>(null);

  // Account balance — mirrored locally for the setup screen, broadcast to the corner bar.
  const [balance, setBalance] = useState<number | null>(null);
  const updateBalance = useCallback((value: number) => {
    setBalance(value);
    window.dispatchEvent(new CustomEvent(CHIPS_EVENT, { detail: value }));
  }, []);
  useEffect(() => {
    if (!loggedIn) {
      setBalance(null);
      return;
    }
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.chips === 'number') setBalance(data.chips);
      })
      .catch(() => {});
  }, [loggedIn]);

  // ————— Crash/refresh recovery —————
  // The buy-in is deducted at match/start; before this existed, a refresh or crash
  // simply vaporised it (the match lived only in memory). GameState is plain JSON, so
  // every dispatch snapshots it; the hub offers to rehydrate.
  useEffect(() => {
    if (tutorial) return; // scripted rounds hold no stake and must not be resumed
    const live = state.phase !== 'menu' && state.phase !== 'match-end';
    if (live) {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ v: 1, uid: session?.user?.id ?? null, buyIn: matchBuyIn, state }));
    } else {
      localStorage.removeItem(RESUME_KEY);
    }
  }, [state, tutorial, matchBuyIn, session?.user?.id]);

  // A native "sure you want to leave?" while the stake is on the table.
  useEffect(() => {
    if (tutorial || state.phase === 'menu' || state.phase === 'match-end') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.phase, tutorial]);

  const [resumable, setResumable] = useState<{ state: GameState; buyIn: number } | null>(null);
  useEffect(() => {
    if (state.phase !== 'menu') return;
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return setResumable(null);
      const snap = JSON.parse(raw);
      const s = snap?.state as GameState | undefined;
      const mine = (snap?.uid ?? null) === (session?.user?.id ?? null);
      if (snap?.v === 1 && mine && s?.phase && s.phase !== 'menu' && s.phase !== 'match-end') {
        setResumable({ state: s, buyIn: Number(snap.buyIn) || STARTING_CHIPS });
      } else {
        setResumable(null);
      }
    } catch {
      setResumable(null);
    }
  }, [state.phase, session?.user?.id]);

  const resumeMatch = useCallback(() => {
    if (!resumable) return;
    setMatchBuyIn(resumable.buyIn);
    dispatch({ type: 'RESTORE', state: resumable.state });
    setResumable(null);
  }, [resumable]);

  const abandonMatch = useCallback(() => {
    localStorage.removeItem(RESUME_KEY);
    setResumable(null);
    // Close the open settlement claim at zero — the stake is forfeit by the
    // mid-match-exit rule, and an open claim shouldn't linger.
    if (loggedIn) {
      fetch('/api/match/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalChips: 0 }),
      }).catch(() => {});
    }
  }, [loggedIn]);

  // Bankruptcy relief now lives on /pvp, next to the buy-in cards — that's the only screen
  // where "I can't afford any table" is something the player can act on.

  const handleStart = useCallback(async (
    d: 'easy' | 'normal' | 'hard',
    p: 'aggressive' | 'cautious' | 'deceptive',
    buyIn: number,
  ) => {
    setMenuError(null);
    if (!loggedIn) {
      settledRef.current = true; // nothing to settle for guests
      setMatchBuyIn(buyIn);
      dispatch({ type: 'START_GAME', difficulty: d, personality: p, buyIn });
      return;
    }
    setStarting(true);
    try {
      const res = await fetch('/api/match/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyIn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMenuError(data.error || `入场失败（HTTP ${res.status}）`);
        return;
      }
      // The stake may be smaller than the tier buy-in if the balance couldn't cover it.
      settledRef.current = false;
      updateBalance(data.balance);
      setMatchBuyIn(data.stack);
      dispatch({ type: 'START_GAME', difficulty: d, personality: p, buyIn: data.stack });
    } catch {
      setMenuError('网络错误，无法入场');
    } finally {
      setStarting(false);
    }
  }, [loggedIn]);

  // ————— Handed off from quick match: the house took the seat —————
  // /pvp sends us here as `/?table=<tierKey>` when the waiting line turned up nobody. The
  // stake was already chosen there, so there is nothing left to ask: deal.
  //
  // The temperament is drawn at random and never shown. Letting a player pick their
  // opponent's personality quietly dismantles the entire game — the whole point is to read
  // someone you don't know yet, and a menu that tells you "this one bluffs" hands over the
  // answer before the first card.
  // Read once and park it in STATE, not a ref, and consume it in a second effect.
  //
  // The obvious single-effect version is broken in dev and it fails in the worst possible
  // way — silently. StrictMode mounts, unmounts and remounts: the first pass strips the
  // query string and arms the glide, the unmount cancels the glide, and the remount finds
  // both the ref set and the URL already clean, so it bails. The camera is left parked in
  // the seat with the hub faded out and no cards ever dealt.
  //
  // Holding it in state fixes that by construction: the remount re-runs the consumer
  // effect, which re-arms its own timeout, and the handoff is only cleared once the cards
  // are actually on the table.
  const [handoff, setHandoff] = useState<{ tier: (typeof STAKES_TIERS)[number]; temperament: (typeof AI_TEMPERAMENTS)[number] } | null>(null);
  const handoffRead = useRef(false);
  useEffect(() => {
    if (handoffRead.current) return;
    handoffRead.current = true;
    const key = new URLSearchParams(window.location.search).get('table');
    if (!key) return;
    window.history.replaceState(null, '', '/'); // a refresh must not re-deal
    const tier = STAKES_TIERS.find((s) => s.key === key);
    if (!tier) return;
    // Rolled once, here, so a re-render can't reshuffle the opponent mid-glide.
    setHandoff({ tier, temperament: AI_TEMPERAMENTS[Math.floor(Math.random() * AI_TEMPERAMENTS.length)] });
  }, []);

  useEffect(() => {
    if (!handoff) return;
    // Wait for the session to resolve before dealing. `loggedIn` is false while it loads,
    // and handleStart's guest path skips the buy-in entirely — firing early would hand out
    // a free match at whatever tier the URL named.
    if (sessionStatus === 'loading') return;
    setSitting(true);
    audio.sfx('click');
    const t = setTimeout(async () => {
      // Stay seated through the await: handleStart is a network round-trip, and dropping
      // `sitting` first would flash the hub back up between the glide and the deal.
      await handleStart(handoff.tier.difficulty, handoff.temperament, handoff.tier.buyIn);
      setHandoff(null);
      setSitting(false);
    }, 2000); // SIT_SECONDS(1.9s) + a settling beat
    return () => clearTimeout(t);
  }, [handoff, sessionStatus, handleStart]);

  // Report each resolved round to the tendency log — the raw material for the
  // future "read your opponent" PvP feature. Once per round, logged-in users only.
  const reportedRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'round-end' || !loggedIn || tutorial) return; // scripted rounds must not pollute tendencies
    const last = state.roundHistory[state.roundHistory.length - 1];
    if (!last) return;
    const key = state.roundNumber + '-' + state.setHistory.length;
    if (reportedRoundRef.current === key) return;
    reportedRoundRef.current = key;
    fetch('/api/stats/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: state.playerSide,
        card: last.playerCard,
        // "round" is the card ordinal (1..5). roundNumber overshoots (it counts folds,
        // and was bumped at resolution), and history length counts folds too — so
        // count showdowns. For a fold, log the slot it would have resolved.
        round: Math.min(
          state.roundHistory.filter((r) => !r.folded).length + (last.folded ? 1 : 0),
          5,
        ),
        betMultiplier: state.multiplier,
        won: last.playerScored > 0 || last.folded === 'opponent',
        folded: !!last.folded,
        foldedSelf: last.folded === 'player',
      }),
    }).catch(() => {});
  }, [state.phase, loggedIn, tutorial, state.roundHistory, state.roundNumber, state.setHistory.length, state.playerSide, state.multiplier]);

  // Settle exactly once when the match ends: remaining table chips → account balance.
  useEffect(() => {
    if (state.phase === 'match-end' && loggedIn && !settledRef.current) {
      settledRef.current = true;
      // Regicides across the whole match, for the seal payout. resolveSet moves a set's
      // rounds into setHistory, but a bankruptcy ending skips it — so the current set can
      // still be sitting in roundHistory alone (same array reference when both exist).
      const rounds = state.setHistory.some((s) => s.rounds === state.roundHistory)
        ? state.setHistory.flatMap((s) => s.rounds)
        : [...state.setHistory.flatMap((s) => s.rounds), ...state.roundHistory];
      const regicides = rounds.filter(
        (r) => !r.folded && r.playerCard === 'slave' && r.opponentCard === 'emperor',
      ).length;
      fetch('/api/match/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalChips: state.playerChips, regicides }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.balance === 'number') updateBalance(data.balance);
          if (data && typeof data.sealsEarned === 'number') setSealsEarned(data.sealsEarned);
        })
        .catch(() => {
          // Settlement failure is money-losing — flag it instead of swallowing silently.
          console.error('结算失败：筹码未能回存账户');
        });
    }
  }, [state.phase, loggedIn, state.playerChips]);

  useEffect(() => {
    if (state.phase === 'first-play' && state.roundNumber === 1) setDealKey((k) => k + 1);
  }, [state.phase, state.roundNumber, state.playerSide]);

  // AI as first player
  useEffect(() => {
    if (state.phase === 'first-play' && state.initiative === 'opponent') {
      const t = setTimeout(() => {
        const card = aiSelectCard(state);
        const bet = aiSetOpeningBet(state, card);
        setPendingAiCard(card);
        dispatch({ type: 'FIRST_PLAY', card, bet });
      }, 800 + Math.random() * 800);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.initiative]);

  // AI as second player — in the tutorial the response is scripted, not chosen.
  useEffect(() => {
    if (state.phase === 'second-play' && state.initiative === 'player') {
      const t = setTimeout(() => {
        if (tutorial) {
          const resp = TUTORIAL_SCENES[tutorial.scene].opponentResponse;
          setPendingAiCard(resp.card);
          dispatch({ type: 'SECOND_PLAY', card: resp.card, action: resp.action });
          return;
        }
        const card = aiSelectCard(state);
        const { action } = aiRespondToBet(state, card);
        setPendingAiCard(card);
        dispatch({ type: 'SECOND_PLAY', card, action });
      }, 1000 + Math.random() * 800);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.initiative, tutorial]);

  // AI in betting loop
  useEffect(() => {
    if (state.phase === 'betting' && state.bettingTurn === 'opponent' && pendingAiCard) {
      const t = setTimeout(() => {
        const action = aiBetResponse(state, pendingAiCard);
        dispatch({ type: 'BET_RESPONSE', action });
      }, 800 + Math.random() * 1000);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.bettingTurn, pendingAiCard]);

  // Auto-reveal — long enough for the full showdown ceremony (hover → rise → slam → beat).
  useEffect(() => {
    if (state.phase === 'reveal') {
      const t = setTimeout(() => dispatch({ type: 'REVEAL_DONE' }), 3200);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  // Result effects
  useEffect(() => {
    if (state.phase === 'round-end' && state.roundHistory.length > 0) {
      const last = state.roundHistory[state.roundHistory.length - 1];
      const isRegicide = !last.folded &&
        ((last.playerCard === 'slave' && last.opponentCard === 'emperor') ||
          (last.playerCard === 'emperor' && last.opponentCard === 'slave'));
      if (last.folded) { setFlashType('fold'); audio.sfx('fold'); }
      else if (isRegicide) {
        setFlashType('slave-kill'); setScreenShake(true);
        audio.sfx('regicide');
        setTimeout(() => setScreenShake(false), 500);
      } else if (last.playerScored > 0) { setFlashType('emperor-win'); audio.sfx('winRound'); }
      else if (last.opponentScored > 0) { setFlashType('emperor-win'); audio.sfx('loseRound'); }
      const t2 = setTimeout(() => setFlashType(null), 800);
      return () => clearTimeout(t2);
    }
  }, [state.phase, state.roundHistory]);

  // Side switch overlay
  useEffect(() => {
    if (state.phase === 'first-play' && state.roundNumber === 1 && state.setHistory.length > 0) {
      setShowSideSwitch(true);
      const t = setTimeout(() => setShowSideSwitch(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.roundNumber, state.setHistory.length]);

  // Derive a reset key — selections reset whenever round changes
  const roundKey = state.roundNumber + '-' + state.setHistory.length;
  const [lastRoundKey, setLastRoundKey] = useState(roundKey);
  if (roundKey !== lastRoundKey) {
    setFirstPlayCard(null);
    setSecondPlayCard(null);
    setSelectedFanIndex(null);
    setPendingAiCard(null);
    setLastRoundKey(roundKey);
  }

  const handleFirstPlayConfirm = useCallback((bet: number) => {
    if (!firstPlayCard) return;
    audio.sfx('cardPlay');
    dispatch({ type: 'FIRST_PLAY', card: firstPlayCard, bet });
    if (tutStep?.waitFor === 'confirm-play') advanceTutorialStep();
  }, [firstPlayCard, tutStep, advanceTutorialStep]);

  const handleSecondPlayAction = useCallback((action: BetAction) => {
    if (!secondPlayCard) return;
    audio.sfx('cardPlay');
    dispatch({ type: 'SECOND_PLAY', card: secondPlayCard, action });
  }, [secondPlayCard]);

  const handleBetResponse = useCallback((action: BetAction) => {
    // During the tutorial's fold lesson, only the guided action goes through.
    if (tutStep?.waitFor === 'fold' && action !== 'fold') return;
    dispatch({ type: 'BET_RESPONSE', action });
    if (tutStep?.waitFor === 'fold' && action === 'fold') advanceTutorialStep();
  }, [tutStep, advanceTutorialStep]);

  if (state.phase === 'menu') {
    // Settings live behind a gear on every menu screen — quality + volumes.
    const menuChrome = (
      <>
        <button
          type="button"
          onClick={() => { audio.sfx('click'); setSettingsOpen(true); }}
          className="fixed bottom-5 left-5 z-40 px-4 py-2 border border-border hover:border-amber text-text-muted hover:text-amber text-xs tracking-[4px] font-display uppercase transition-colors bg-black/40 backdrop-blur-sm"
          style={{ clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)' }}
        >
          ⚙ 设 置
        </button>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} quality={quality} onQualityChange={changeQuality} />
      </>
    );

    // The lobby IS the casino: the real table scene at a doorway camera, the host
    // waiting. Entering a mode that plays at THIS table glides the camera into the
    // seat first.
    const menuCam: ViewMode = sitting ? 'transition' : 'lobby';
    const menuScene = (
      <div className="fixed inset-0">
        <TableScene
          personality="deceptive"
          viewMode={menuCam}
          dealerAction={hubDealer}
          hand={[]}
          showOpponent
          playerChips={0}
          opponentChips={0}
          pot={0}
          quality={quality}
          look={look}
        />
      </div>
    );

    return (
      <>
        {menuScene}
        <HubScreen
          tutorialDone={tutorialDone}
          sitting={sitting}
          onEnter={(key) => {
            if (key === 'tutorial') sitDown(() => startTutorialScene(0));
            else if (key === 'duel') router.push('/pvp');
            else if (key === 'dossier') router.push('/dossier');
            else if (key === 'shop') router.push('/shop');
            else router.push('/ledger');
          }}
        />

        {/* The buy-in can still fail on the way in (the balance moved, the network died).
            With the setup screen gone the hub is the only place left to say so — silently
            landing back here would read as the button simply not working. */}
        {(starting || menuError) && (
          <div className="fixed top-28 inset-x-0 z-20 flex justify-center px-6 pointer-events-none">
            <div
              className={
                'px-6 py-3 text-center backdrop-blur-md fade-in ' +
                (menuError ? 'border-t border-b border-blood/60 bg-blood-surface/80' : 'border border-border/60 bg-black/70')
              }
            >
              <p className={'text-sm tracking-[3px] font-display ' + (menuError ? 'text-blood-glow' : 'text-text-secondary')}>
                {menuError ?? '入 场 中 …'}
              </p>
            </div>
          </div>
        )}

        {/* Interrupted-match rescue — the stake is already on the table, offer the seat back */}
        {resumable && (
          <div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-5 px-6 py-3.5 border border-amber/60 bg-black/80 backdrop-blur-md fade-in"
            style={{ boxShadow: '0 0 30px rgba(196,154,48,0.18), inset 0 0 16px rgba(0,0,0,0.5)' }}
          >
            <div>
              <p className="text-sm tracking-[3px] font-display text-amber-bright">检测到未完成的对局</p>
              <p className="text-[11px] tracking-[2px] text-text-secondary font-display mt-1">
                桌面 {resumable.state.playerChips} 筹码 · 比分 {resumable.state.playerSetsWon}—{resumable.state.opponentSetsWon} · 离场即弃权，买入不退
              </p>
            </div>
            <div className="flex gap-2.5">
              <DecoButton onClick={resumeMatch} color="amber" size="sm">重 返 牌 桌</DecoButton>
              <DecoButton onClick={abandonMatch} color="neutral" size="sm">弃 权</DecoButton>
            </div>
          </div>
        )}
        {menuChrome}
      </>
    );
  }

  // match-end no longer returns a flat text screen here — the scene stays mounted and
  // the finale (computed above) plays out in it: cinema → cut → the MatchReport plate.

  // Ambient tension — how far the bankrolls have diverged from the match buy-in,
  // drives the screen-wide oppressive glow instead of a thin side gauge doing all the work.
  const chipSwing = Math.max(Math.abs(state.playerChips - matchBuyIn), Math.abs(state.opponentChips - matchBuyIn));
  const intensity = Math.min(chipSwing / (matchBuyIn * 0.6), 1);
  const aiThinking = (state.phase === 'first-play' && state.initiative === 'opponent') || (state.phase === 'second-play' && state.initiative === 'player') || (state.phase === 'betting' && state.bettingTurn === 'opponent');
  // match-end included: the fatal showdown's cards stay face-up under the finale.
  const isReveal = state.phase === 'reveal' || state.phase === 'round-end' || state.phase === 'match-end';
  const playerCanSelectFirst = state.phase === 'first-play' && state.initiative === 'player';
  const playerCanSelectSecond = state.phase === 'second-play' && state.initiative === 'opponent';
  const playerCanSelect = playerCanSelectFirst || playerCanSelectSecond;

  // The engine removes a played card from playerHand only at round resolution, so while a
  // card sits on the table (playerSelectedCard) it must be filtered out of the 3D fan.
  let fanCards = state.playerHand;
  if (state.playerSelectedCard) {
    const idx = state.playerHand.indexOf(state.playerSelectedCard);
    if (idx !== -1) fanCards = [...state.playerHand.slice(0, idx), ...state.playerHand.slice(idx + 1)];
  }

  const lastRound = state.roundHistory.length > 0 ? state.roundHistory[state.roundHistory.length - 1] : null;

  // The dealer's body language. Every beat here is information the player reads —
  // or misreads. A taunt on his raise is exactly the tell that makes you doubt.
  let dealerAction: DealerAction = 'idle';
  if (state.phase === 'round-end' && lastRound) {
    const regicided =
      !lastRound.folded &&
      ((lastRound.playerCard === 'slave' && lastRound.opponentCard === 'emperor') ||
        (lastRound.playerCard === 'emperor' && lastRound.opponentCard === 'slave'));
    if (lastRound.opponentScored > 0 || lastRound.folded === 'player') dealerAction = 'win';
    else if (regicided) dealerAction = 'hit'; // he just got knifed
    else if (lastRound.playerScored > 0) dealerAction = 'angry';
  } else if (state.phase === 'betting' && state.bettingTurn === 'player') {
    dealerAction = 'taunt'; // he raised, now he's leaning on you
  } else if (aiThinking) {
    dealerAction = 'think';
  } else if (playerCanSelect) {
    // While you agonise, he can afford to look bored — that itself is pressure.
    dealerAction = 'doze';
  }
  let msgColor = 'text-text-secondary';
  if (state.phase === 'round-end' && lastRound) {
    if (lastRound.playerScored > 0) msgColor = 'text-blood-glow';
    else if (lastRound.opponentScored > 0) msgColor = 'text-teal-bright';
  }

  // Routine prompts live in the top status strip; the table stays clear of floating text.
  let statusText: string | null = null;
  let statusTone: 'teal' | 'amber' | 'blood' | 'neutral' = 'neutral';
  let statusThinking = false;
  if (state.phase === 'first-play' && state.initiative === 'player') {
    statusText = firstPlayCard ? '设定注额，然后出牌' : '你的先手 — 从手牌选择一张';
    statusTone = 'amber';
  } else if (state.phase === 'first-play') {
    statusText = '对手先手，思考中';
    statusTone = 'teal';
    statusThinking = true;
  } else if (state.phase === 'second-play' && state.initiative === 'opponent') {
    statusText = secondPlayCard ? '选择跟注、加注或弃牌' : '对手已出牌并下注 — 选择你的牌';
    statusTone = 'amber';
  } else if (state.phase === 'second-play') {
    statusText = '对手考虑中';
    statusTone = 'teal';
    statusThinking = true;
  } else if (state.phase === 'betting') {
    if (state.bettingTurn === 'player') {
      statusText = state.message || '轮到你响应下注';
      statusTone = 'blood';
    } else {
      statusText = '对手思考中';
      statusTone = 'teal';
      statusThinking = true;
    }
  } else if (state.phase === 'reveal') {
    statusText = '开 牌';
    statusTone = 'blood';
  }

  // The showdown ceremony + winner highlights, driven off game state.
  const pot = state.playerContribution + state.opponentContribution;
  const revealCeremony = state.phase === 'reveal';
  let playerGlow: 'gold' | 'blood' | null = null;
  let opponentGlow: 'gold' | 'blood' | null = null;
  if (state.phase === 'round-end' && lastRound && !lastRound.folded) {
    const isRegicide =
      (lastRound.playerCard === 'slave' && lastRound.opponentCard === 'emperor') ||
      (lastRound.playerCard === 'emperor' && lastRound.opponentCard === 'slave');
    if (lastRound.playerScored > 0) playerGlow = isRegicide ? 'blood' : 'gold';
    else if (lastRound.opponentScored > 0) opponentGlow = isRegicide ? 'blood' : 'gold';
  }

  // During the finale the scene is the whole story: chrome off, and in both of the
  // endings where he outlives you he applauds — slow, seated, unhurried. Watching him
  // clap while your own drill winds up is the point.
  if (finaleKind === 'broke' || finaleKind === 'execution') dealerAction = 'win';

  // Report material — every showdown of the match. resolveSet stores the final set's
  // rounds in setHistory but a bankruptcy match-end skips resolveSet, leaving the
  // current set only in roundHistory (same array reference when both exist).
  const allRounds = state.setHistory.some((s) => s.rounds === state.roundHistory)
    ? state.setHistory.flatMap((s) => s.rounds)
    : [...state.setHistory.flatMap((s) => s.rounds), ...state.roundHistory];
  const myRegicides = allRounds.filter((r) => !r.folded && r.playerCard === 'slave' && r.opponentCard === 'emperor').length;
  const myFolds = allRounds.filter((r) => r.folded === 'player').length;

  return (
    <div className={screenShake ? 'h-full flex flex-col relative shake' : 'h-full flex flex-col relative'}>
      {/* Menus reflow fine upright; the table doesn't — ask for landscape only in a match */}
      <RotatePrompt />
      {/* Chip totals live on the table now — real stacks beside each player, no side gauges */}
      <ScreenFlash type={flashType} />
      <SideSwitchOverlay side={state.playerSide} show={showSideSwitch} />

      {/* Full-screen ambient dread — scales with how lopsided the match currently is */}
      {intensity > 0.08 && (
        <div
          className="fixed inset-0 pointer-events-none z-[45] border-2 transition-all duration-700"
          style={{
            borderColor: `rgba(170,17,17,${0.08 + intensity * 0.35})`,
            boxShadow: `inset 0 0 ${40 + intensity * 160}px rgba(170,17,17,${0.05 + intensity * 0.25})`,
            animation: intensity > 0.6 ? 'blood-breathe 2.4s ease-in-out infinite' : undefined,
          }}
        />
      )}

      {/* The verdict beam — full-bleed tribunal header. Your side, the round,
          and each side's lit (lost) diamonds bleeding toward the drills below.
          Gone during the finale: the cinema plays clean. */}
      {!finaleKind && (
        <VerdictBar
          side={state.playerSide}
          // Card ordinal, not the raw counter — folds replay a slot without consuming a
          // card, so roundNumber overshoots and would pin the banner at 5/5.
          roundNumber={Math.min(state.roundHistory.filter((r) => !r.folded).length + 1, 5)}
          initiative={state.initiative}
          playerLost={state.opponentSetsWon}
          opponentLost={state.playerSetsWon}
          playerChips={state.playerChips}
          opponentChips={state.opponentChips}
        />
      )}

      <div className="flex-1 min-h-0 flex flex-col mx-3 sm:mx-6">
        {/* In the tutorial the coach is the only voice — the status strip stays quiet */}
        <div className="pb-2">
          <StatusStrip text={tutorial || finaleKind ? null : statusText} tone={statusTone} thinking={statusThinking} />
        </div>

        {/* 3D Stage — opponent + table backdrop, cards/UI layered on top */}
        <div className="relative flex-1 flex flex-col min-h-0">
          <TableScene
            personality={state.aiPersonality}
            isThinking={aiThinking}
            dealerAction={dealerAction}
            intensity={intensity}
            // On a fold the cards return to the hand, so nothing should sit on the
            // table during the round-end afterglow — the folder never revealed, and
            // the winner takes their card back too.
            opponentCard={state.phase === 'round-end' && lastRound?.folded ? null : state.opponentSelectedCard}
            opponentFaceDown={!isReveal}
            // Only the actually-played card goes on the table; a tentative selection
            // stays raised in the 3D hand fan until confirmed.
            playerCard={state.phase === 'round-end' && lastRound?.folded ? null : state.playerSelectedCard}
            roundKey={roundKey}
            hand={fanCards}
            selectedIndex={playerCanSelect ? selectedFanIndex : null}
            canSelect={playerCanSelect}
            onSelectCard={(card, index) => {
              // Tutorial: selection is only open on its guided step, and only for the hinted card.
              if (tutorial) {
                if (tutStep?.waitFor !== 'select-card') return;
                if (tutStep.hintCard && card !== tutStep.hintCard) return;
              }
              if (playerCanSelectFirst) setFirstPlayCard(card);
              else if (playerCanSelectSecond) setSecondPlayCard(card);
              else return;
              audio.sfx('click');
              setSelectedFanIndex(index);
              if (tutStep?.waitFor === 'select-card') advanceTutorialStep();
            }}
            hintCard={tutStep?.waitFor === 'select-card' ? tutStep.hintCard ?? null : null}
            playerChips={state.playerChips}
            opponentChips={state.opponentChips}
            pot={pot}
            revealCeremony={revealCeremony}
            playerGlow={playerGlow}
            opponentGlow={opponentGlow}
            quality={quality}
            playerSetsWon={state.playerSetsWon}
            opponentSetsWon={state.opponentSetsWon}
            finale={finaleKind}
            look={look}
          />

          {/* Focus vignette — pulls attention back to the opponent + table, away
              from the columns/spectators now that they're actually visible */}
          <div
            className="absolute inset-0 pointer-events-none z-[5]"
            style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 38%, transparent 45%, rgba(2,2,5,0.55) 100%)' }}
          />

          {/* Opponent hand (2D, over 3D backdrop) — irrelevant once the finale runs */}
          {!finaleKind && (
            <div className="relative z-10 flex justify-center gap-1 pt-2 pb-1 pointer-events-none">
              {state.opponentHand.map((_, i) => (
                <div key={i} className="w-[36px] h-[50px] opacity-40 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" style={dealKey > 0 && state.roundNumber === 1 ? { opacity: 0, animation: `deal-from-top 0.4s cubic-bezier(0.23,1,0.32,1) ${i * 100}ms forwards` } : undefined}>
                  <CardArt type="back" />
                </div>
              ))}
            </div>
          )}

          {/* Center stage — reserved for the big cinematic moments only.
              Everything routine has moved to the status strip / action dock. */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 px-4 min-h-0 pointer-events-none">
            {state.phase === 'round-end' && (
              <>
                <p
                  className={
                    'font-gothic text-cracked text-2xl sm:text-3xl tracking-wider text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] ' +
                    msgColor
                  }
                  style={{ animation: 'fade-in-up 0.7s 0.3s both' }}
                >
                  {state.message}
                </p>
                {/* In the tutorial the coach owns the flow — no next-round button */}
                {!tutorial && (
                  <div className="pointer-events-auto" style={{ animation: 'fade-in-up 0.6s 0.6s both' }}>
                    <DecoButton onClick={() => dispatch({ type: 'NEXT_ROUND' })} color="blood" size="lg" className="min-w-[240px]">
                      {lastRound?.keyCardPlayed || state.playerHand.length === 0 ? '结 算 本 局' : '下 一 回 合'}
                    </DecoButton>
                  </div>
                )}
              </>
            )}
            {state.phase === 'set-end' && (
              <div className="flex flex-col items-center gap-4 fade-in-up pointer-events-auto">
                <div className={state.playerSetScore > state.opponentSetScore ? 'px-6 py-3 border rounded-sm text-center border-blood bg-blood-surface text-blood-glow' : state.playerSetScore < state.opponentSetScore ? 'px-6 py-3 border rounded-sm text-center border-teal bg-teal-surface text-teal-bright' : 'px-6 py-3 border rounded-sm text-center border-border bg-surface text-text-secondary'}>
                  <p className="font-gothic text-cracked text-lg tracking-wider">{state.message}</p>
                </div>
                <DecoButton onClick={() => dispatch({ type: 'NEXT_SET' })} color="blood" size="md">下一局</DecoButton>
              </div>
            )}
          </div>

          {/* Action dock — the player's control panel, floating by the right hand */}
          <div className="absolute bottom-5 right-4 sm:right-6 z-20 pointer-events-auto flex flex-col items-end">
            {state.phase === 'first-play' && state.initiative === 'player' && firstPlayCard && (
              <BetPicker onConfirm={handleFirstPlayConfirm} lockBet={tutScene?.lockBet} />
            )}
            {state.phase === 'second-play' && state.initiative === 'opponent' && secondPlayCard && <BetActions onAction={handleSecondPlayAction} />}
            {state.phase === 'betting' && state.bettingTurn === 'player' && (
              <BetActions
                onAction={handleBetResponse}
                allowedAction={tutorial ? (tutStep?.waitFor === 'fold' ? 'fold' : null) : null}
              />
            )}
          </div>

          {/* Tutorial coach — the guide's plaque, lower-left, opposite the dock */}
          {tutorial && tutScene && tutStep && (
            <TutorialCoach
              sceneTitle={tutScene.title}
              text={tutStep.text}
              showButton={tutStep.waitFor === 'continue' || tutStep.waitFor === 'finish'}
              buttonLabel={tutStep.waitFor === 'finish' ? '完 成 引 导' : '继 续'}
              onButton={handleCoachButton}
            />
          )}
        </div>

        {/* Player hand lives in the 3D scene now — a fan held in the first-person view */}

        {/* Round History — engraved judgment ledger */}
        {state.roundHistory.length > 0 && (
          <div className="border-t border-border-subtle bg-abyss px-4 py-2.5">
            <div className="flex justify-center gap-2.5 sm:gap-3">
              {state.roundHistory.map((r, i) => {
                const playerWon = r.folded === 'opponent' || r.playerScored > 0;
                const opponentWon = r.folded === 'player' || r.opponentScored > 0;
                const isKill = !r.folded &&
                  ((r.playerCard === 'slave' && r.opponentCard === 'emperor') ||
                    (r.playerCard === 'emperor' && r.opponentCard === 'slave'));
                let glyph = '—';
                let value = '';
                let edgeColor = 'border-border-subtle';
                let glowColor = 'rgba(0,0,0,0)';
                let textColor = 'text-text-muted';
                if (playerWon) {
                  glyph = '▲';
                  value = '+' + r.playerScored;
                  edgeColor = 'border-blood-dim';
                  glowColor = 'rgba(170,17,17,0.35)';
                  textColor = 'text-blood-glow';
                } else if (opponentWon) {
                  glyph = '▼';
                  value = '−' + r.opponentScored;
                  edgeColor = 'border-teal-dim';
                  glowColor = 'rgba(42,138,138,0.35)';
                  textColor = 'text-teal-bright';
                }
                return (
                  <div
                    key={i}
                    className={'relative flex flex-col items-center justify-center w-11 h-14 sm:w-12 sm:h-16 border-t-2 border-x border-b ' + edgeColor}
                    style={{
                      background: 'linear-gradient(to bottom, rgba(255,255,255,0.02), transparent 40%), #0a0a12',
                      boxShadow: isKill ? `0 0 14px ${glowColor}, inset 0 0 8px ${glowColor}` : `inset 0 1px 0 rgba(255,255,255,0.03)`,
                    }}
                  >
                    <span className="absolute top-1 text-[8px] tracking-[1px] text-text-dim font-display">{i + 1}</span>
                    <span className={'text-sm leading-none ' + textColor} style={{ textShadow: isKill ? `0 0 8px ${glowColor}` : 'none' }}>{glyph}</span>
                    <span className={'text-[11px] font-display font-bold leading-none mt-0.5 ' + textColor}>{value || '0'}</span>
                    {r.keyCardPlayed && (
                      <div className={'absolute -bottom-px left-1/2 -translate-x-1/2 w-3 h-px ' + (playerWon ? 'bg-blood' : 'bg-teal')} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ————— Finale overlays: input freeze → (red closes in) → blackout → report ————— */}
      {finaleKind && (
        <>
          {/* Swallow every click for the duration — the cinema is not interactive */}
          <div className="fixed inset-0 z-[70]" />
          {/* 处刑: the red closes in around your vision as the needle winds up */}
          {finaleKind === 'execution' && (
            <div
              className="fixed inset-0 z-[80] pointer-events-none"
              style={{ animation: `finale-red ${FINALE_TIMINGS.execution.cut}s ease-in forwards` }}
            />
          )}
          {/* The cut. Hard (no transition) for the execution; a slow exhale otherwise. */}
          <div
            className={'fixed inset-0 z-[85] bg-black ' + (finaleStage === 'cut' || finaleStage === 'report' ? 'opacity-100' : 'opacity-0 pointer-events-none')}
            style={{ transition: FINALE_TIMINGS[finaleKind].hardCut ? 'none' : 'opacity 1100ms ease' }}
          />
          <style>{`@keyframes finale-red {
            0% { box-shadow: inset 0 0 0 0 rgba(120,0,0,0); }
            55% { box-shadow: inset 0 0 120px 30px rgba(150,0,0,0.3); }
            100% { box-shadow: inset 0 0 45vw 18vw rgba(180,10,10,0.85); }
          }`}</style>
        </>
      )}
      {finaleKind && finaleStage === 'report' && (
        <MatchReport
          kind={finaleKind}
          sets={[state.playerSetsWon, state.opponentSetsWon]}
          chipDelta={state.playerChips - matchBuyIn}
          finalChips={state.playerChips}
          regicides={myRegicides}
          folds={myFolds}
          durationSec={matchStartRef.current ? (Date.now() - matchStartRef.current) / 1000 : null}
          settled={loggedIn}
          sealsEarned={sealsEarned}
          onExit={() => { dispatch({ type: 'BACK_TO_MENU' }); }}
        />
      )}
    </div>
  );
}

// ————————————————————————————— Menu screens —————————————————————————————

// One 对战 door, not two. Whether the seat opposite holds a person or the house is a
// detail of who happens to be awake — it isn't a mode the player should have to choose,
// and making them choose it advertised "you are playing a bot" before a card was dealt.
type HubEntryKey = 'tutorial' | 'duel' | 'dossier' | 'ledger' | 'shop';

const HUB_INK = {
  teal: { text: '#3fb3b3', rgb: '63,179,179' },
  blood: { text: '#e83a3a', rgb: '232,58,58' },
  amber: { text: '#d8ab3c', rgb: '216,171,60' },
} as const;

// Art Deco corner-cut, the same chamfer the in-match dock and buttons use.
const HUB_CLIP =
  'polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px)';

function HubScreen({ tutorialDone, sitting, onEnter }: {
  tutorialDone: boolean;
  sitting: boolean;
  onEnter: (key: HubEntryKey) => void;
}) {
  const entries: { key: HubEntryKey; glyph: string; title: string; sub: string; ink: keyof typeof HUB_INK; flag?: boolean }[] = [
    { key: 'tutorial', glyph: '习', title: '新手引导', sub: '三幕入局 · 五分钟', ink: 'teal', flag: !tutorialDone },
    { key: 'duel', glyph: '决', title: '对 战', sub: '匹配入座 · 约人开桌', ink: 'blood' },
    { key: 'dossier', glyph: '档', title: '密 档', sub: '你的出牌倾向', ink: 'amber' },
    { key: 'ledger', glyph: '榜', title: '血 榜', sub: '谁主宰这座大厅', ink: 'amber' },
    { key: 'shop', glyph: '铺', title: '当 铺', sub: '给这间房换个排面', ink: 'amber' },
  ];

  return (
    // `fixed`, not `absolute`: the scene layer beneath is fixed and the tree has no
    // positioned ancestor, so the two would otherwise resolve against different
    // containing blocks — which is what threw the first dock off-centre.
    <div className={'fixed inset-0 z-10 pointer-events-none transition-opacity duration-700 ' + (sitting ? 'opacity-0' : 'opacity-100')}>
      {/* Masthead. Sized to be the sign over the door, not a caption — but it still
          yields to the room: it stops short of the chandelier and, being centred, stays
          clear of the account bar in the top-right corner. */}
      <div className="absolute top-6 inset-x-0 text-center slide-up">
        <h1
          className="font-gothic text-cracked text-6xl sm:text-7xl md:text-8xl tracking-[10px] sm:tracking-[14px] leading-none inline-block"
          style={{
            backgroundImage: 'linear-gradient(180deg, #f0ece4 0%, #c49a30 35%, #aa1111 75%, #4a0808 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 3px 14px rgba(0,0,0,0.9))',
          }}
        >
          REGICIDE
        </h1>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Flourish />
          <p className="font-gothic text-cracked text-3xl sm:text-4xl tracking-[12px] text-blood uppercase">弑 君</p>
          <Flourish flip />
        </div>
      </div>

      {/* Floor haze — gives the cards something to sit against without a hard band */}
      <div className="absolute bottom-0 inset-x-0 h-56 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      {/* The dock. Centring lives on THIS flex row, never on a child's max-w + mx-auto —
          the containing-block mismatch above defeats the latter. pt-4 leaves room for the
          "从这里开始" flag to sit above the first card instead of being clipped, and the
          fixed max width keeps the row clear of the settings gear in the corner. */}
      <div className="absolute bottom-12 inset-x-0 flex justify-center px-6 pt-4 pointer-events-auto">
        <div className="flex justify-center gap-3 sm:gap-5 w-full max-w-[860px]">
          {entries.map((e, i) => {
            const ink = HUB_INK[e.ink];
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => { if (!sitting) onEnter(e.key); }}
                className="group relative flex-1 text-center px-2 pt-7 pb-5 transition-all duration-300 hover:-translate-y-1.5 active:translate-y-0 fade-in-up"
                style={{
                  clipPath: HUB_CLIP,
                  background: 'linear-gradient(180deg, rgba(20,18,14,0.88) 0%, rgba(6,6,10,0.92) 100%)',
                  boxShadow: `inset 0 0 0 1px rgba(${ink.rgb},0.22), 0 14px 30px rgba(0,0,0,0.6)`,
                  backdropFilter: 'blur(4px)',
                  animationDelay: `${200 + i * 80}ms`,
                }}
              >
                {/* Colour rule across the top — the card's identity, brightening on hover */}
                <span
                  className="absolute top-0 inset-x-0 h-[2px] transition-all duration-300 pointer-events-none"
                  style={{
                    background: `linear-gradient(to right, transparent, rgba(${ink.rgb},0.9), transparent)`,
                    boxShadow: `0 0 10px rgba(${ink.rgb},0.5)`,
                  }}
                />
                {/* Warm wash rising on hover */}
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `linear-gradient(to top, rgba(${ink.rgb},0.14) 0%, transparent 65%)` }}
                />
                {/* Hairline inner frame, revealed on hover */}
                <span
                  className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ inset: '5px', clipPath: HUB_CLIP, border: `1px solid rgba(${ink.rgb},0.35)` }}
                />

                {e.flag && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] tracking-[3px] font-display px-2.5 py-[3px] whitespace-nowrap z-20"
                    style={{
                      color: ink.text,
                      border: `1px solid rgba(${ink.rgb},0.6)`,
                      background: '#07070c',
                      animation: 'pulse-glow 2s ease-in-out infinite',
                    }}
                  >
                    从这里开始
                  </span>
                )}

                <p
                  className="relative font-gothic text-[2.6rem] sm:text-5xl leading-none mb-3.5 transition-transform duration-300 group-hover:scale-110"
                  style={{ color: ink.text, textShadow: `0 0 24px rgba(${ink.rgb},0.55)` }}
                >
                  {e.glyph}
                </p>
                <p className="relative font-display font-bold text-sm tracking-[3px] text-text-bright whitespace-nowrap">{e.title}</p>
                <p className="relative text-[10px] tracking-[2px] text-text-muted font-display mt-1.5 whitespace-nowrap hidden sm:block">{e.sub}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ————————————————————————————— Settings —————————————————————————————

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm tracking-[4px] text-text-secondary uppercase font-display">{label}</p>
        <p className="text-xs tracking-[2px] text-amber font-display">{Math.round(value * 100)}%</p>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full h-1 cursor-pointer"
        style={{ accentColor: '#c49a30' }}
      />
    </div>
  );
}

function SettingsModal({ open, onClose, quality, onQualityChange }: {
  open: boolean; onClose: () => void; quality: Quality; onQualityChange: (q: Quality) => void;
}) {
  const [musicVol, setMusicVol] = useState(() => audio.getMusicVolume());
  const [sfxVol, setSfxVol] = useState(() => audio.getSfxVolume());
  if (!open) return null;

  const qualities = [
    { key: 'low' as const, label: '低', hint: '性能优先' },
    { key: 'medium' as const, label: '中', hint: '关闭地面反射' },
    { key: 'high' as const, label: '高', hint: '全部特效' },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-void/85 backdrop-blur-sm fade-in" onClick={onClose}>
      <div
        className="relative w-full max-w-md mx-4 border border-border/70 bg-abyss/95 px-8 py-9"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute top-2 left-2 w-5 h-5 border-t border-l border-amber/70" />
        <span className="absolute top-2 right-2 w-5 h-5 border-t border-r border-amber/70" />
        <span className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-amber/70" />
        <span className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-amber/70" />

        <p className="text-center font-gothic text-cracked text-2xl tracking-[8px] text-text-bright mb-8">设 置</p>

        <div className="flex flex-col gap-7">
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm tracking-[4px] text-text-secondary uppercase font-display">画质</p>
              <p className="text-xs tracking-[2px] text-text-dim font-display">{qualities.find((q) => q.key === quality)?.hint}</p>
            </div>
            <div className="flex gap-3">
              {qualities.map((q) => (
                <DecoButton key={q.key} onClick={() => onQualityChange(q.key)} color="neutral" size="sm" selected={quality === q.key} fullWidth>{q.label}</DecoButton>
              ))}
            </div>
          </div>

          <VolumeSlider
            label="音乐"
            value={musicVol}
            onChange={(v) => { setMusicVol(v); audio.setMusicVolume(v); }}
          />
          <VolumeSlider
            label="音效"
            value={sfxVol}
            onChange={(v) => { setSfxVol(v); audio.setSfxVolume(v); audio.sfx('chip'); }}
          />
        </div>

        <div className="mt-9">
          <DecoButton fullWidth color="neutral" size="md" onClick={onClose}>关 闭</DecoButton>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————— Tutorial coach —————————————————————————————

// The guide's voice: a smoked-glass plaque in the lower-left, opposite the action dock.
function TutorialCoach({ sceneTitle, text, showButton, buttonLabel, onButton }: {
  sceneTitle: string;
  text: string;
  showButton: boolean;
  buttonLabel: string;
  onButton: () => void;
}) {
  return (
    <div key={text} className="absolute bottom-5 left-4 sm:left-6 z-30 pointer-events-auto max-w-md fade-in-up">
      <div
        className="relative bg-black/60 backdrop-blur-md border border-amber/25 px-6 py-5"
        style={{ boxShadow: 'inset 0 0 22px rgba(0,0,0,0.5), 0 6px 30px rgba(0,0,0,0.6)' }}
      >
        <span className="absolute top-1.5 left-1.5 w-3.5 h-3.5 border-t border-l border-amber/60" />
        <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 border-t border-r border-amber/60" />
        <span className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 border-b border-l border-amber/60" />
        <span className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 border-b border-r border-amber/60" />
        <p className="text-[10px] tracking-[4px] text-amber/80 uppercase font-display mb-2.5">引路人 · {sceneTitle}</p>
        <p className="text-sm sm:text-base text-text-bright leading-relaxed tracking-wide font-display">{text}</p>
        {showButton && (
          <div className="mt-4 flex justify-end">
            <DecoButton size="sm" color="amber" onClick={onButton}>{buttonLabel}</DecoButton>
          </div>
        )}
      </div>
    </div>
  );
}
