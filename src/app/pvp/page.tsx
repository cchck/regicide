'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { Socket } from 'socket.io-client';
import { connectPvp } from '@/lib/pvp-client';
import { PvpView, PvpAction } from '@/lib/pvp-types';
import { CardType, BetAction } from '@/lib/types';
import { audio } from '@/lib/audio';
import TableScene, { DealerAction, FinaleKind, FINALE_TIMINGS } from '@/components/TableScene';
import MatchReport, { useFinaleStage } from '@/components/MatchReport';
import { useQuality } from '@/lib/device';
import RotatePrompt from '@/components/RotatePrompt';
import EmoteDock, { Emote, EMOTE_ACTION } from '@/components/EmoteDock';
import { BetPicker, BetActions, StatusStrip, VerdictBar } from '@/components/GameBoard';
import TierCard, { STAKES_TIERS, StakesTier } from '@/components/TierCard';
import DecoButton from '@/components/DecoButton';
import Flourish from '@/components/Flourish';
import BackButton from '@/components/BackButton';

type Stage = 'lobby' | 'waiting' | 'playing';

const CLIP_10 = 'polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px),0 10px)';

// Live countdown for the current decision, fed by the server's deadline.
function TimerPill({ deadline }: { deadline: number | null }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (left === null) return null;
  const urgent = left <= 10;
  return (
    <div className="flex justify-center mt-2 pointer-events-none">
      <span
        className={'px-4 py-1 text-sm font-display font-bold tracking-[3px] border rounded-full ' + (urgent ? 'text-blood-glow border-blood/60' : 'text-text-secondary border-border-subtle')}
        style={urgent ? { animation: 'pulse-glow 1s ease-in-out infinite' } : undefined}
      >
        {left}s
      </span>
    </div>
  );
}

export default function PvpPage() {
  const router = useRouter();
  const { status } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const [stage, setStage] = useState<Stage>('lobby');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<StakesTier['key']>('flicker');
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PvpView | null>(null);
  const [quality] = useQuality();
  // The opponent's emote takes over their figure for a beat, then hands it back.
  const [oppEmote, setOppEmote] = useState<DealerAction | null>(null);
  const emoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Word left by the server about a match that ended while we were away (a restart voided
  // it and refunded the buy-in). Shown as a dismissible plaque in the lobby.
  const [notice, setNotice] = useState<{ kind: string; refund: number } | null>(null);
  // The room code we're currently waiting in, readable from the socket's 'connect' handler
  // (which is registered once and would otherwise close over a stale roomCode).
  const waitingCodeRef = useRef<string | null>(null);
  // A room code carried in by a share link (/pvp?room=XXXXXX). Joined automatically once
  // the socket is up; consumed once so a later disconnect doesn't re-trigger it.
  const inviteRef = useRef<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  // Local per-round selection (mirrors GameBoard's tentative pick).
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const lastRoundKeyRef = useRef('');

  // ————— Finale: the match-end cinematic, same grammar as the AI board —————
  // Forfeit-loss (you left) maps to null: your own walkout doesn't earn a ceremony,
  // it falls through to a plain plate below.
  const pvpFinale: FinaleKind | null = view?.matchEnd
    ? view.matchEnd.reason === 'forfeit'
      ? (view.matchEnd.iWon ? 'deserted' : null)
      : view.matchEnd.reason === 'bankrupt'
        ? (view.matchEnd.iWon ? 'drained' : 'broke')
        : (view.matchEnd.iWon ? 'regicide' : 'execution')
    : null;
  const finaleStage = useFinaleStage(pvpFinale);


  // Pick up an invite code from the share link, then strip it from the address bar so a
  // refresh (or a back-navigation after the match) doesn't try to re-join a dead room.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room')?.toUpperCase().trim();
    if (!code || code.length !== 6) return;
    inviteRef.current = code;
    setInvite(code);
    window.history.replaceState(null, '', '/pvp');
  }, []);

  // Connect once authenticated.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!cancelled && d) setBalance(d.chips);
    }).catch(() => {});

    connectPvp()
      .then((socket) => {
        if (cancelled) {
          socket.disconnect();
          return;
        }
        socketRef.current = socket;
        socket.on('connect', () => {
          setConnected(true);

          // Arrived via a share link — take the seat straight away. Consumed once, so a
          // later reconnect doesn't try to re-join a room we've already left.
          const code = inviteRef.current;
          if (code) {
            inviteRef.current = null;
            socket.emit('join-room', { code }, (res: { ok?: boolean; error?: string }) => {
              // Either way the invite is spent — clearing it stops "正在落座…" lingering
              // in the lobby if the player comes back here after the match.
              setInvite(null);
              if (res?.error) setError(res.error);
            });
            return;
          }

          // A waiting room isn't persisted (it holds no stake), so a server restart erases
          // it. Re-verify on every (re)connect or the host waits forever at a dead code.
          const waiting = waitingCodeRef.current;
          if (!waiting) return;
          socket.emit('room-alive', { code: waiting }, (res: { alive?: boolean }) => {
            if (res?.alive) return;
            setStage('lobby');
            setRoomCode(null);
            setError('房间已失效（服务器重启），请重新开设');
          });
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', (err) => setError(err.message || '无法连接对战服务器'));
        socket.on('opponent-emote', (name: Emote) => {
          const action = EMOTE_ACTION[name];
          if (!action) return;
          setOppEmote(action);
          if (emoteTimer.current) clearTimeout(emoteTimer.current);
          emoteTimer.current = setTimeout(() => setOppEmote(null), 4000);
        });
        socket.on('notice', (n: { kind: string; refund: number }) => {
          setNotice(n);
          // The refund already landed server-side; pull the fresh balance so the badge agrees.
          fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((d) => {
            if (d && typeof d.chips === 'number') setBalance(d.chips);
          }).catch(() => {});
        });
        socket.on('view', (v: PvpView) => {
          setView(v);
          setStage('playing');
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : '连接失败'));

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (emoteTimer.current) clearTimeout(emoteTimer.current);
    };
  }, [status]);

  // BGM per stage.
  useEffect(() => {
    audio.playMusic(stage === 'playing' ? 'table' : 'lobby');
  }, [stage]);

  // Keep the ref in step with the waiting stage so the 'connect' handler always sees the
  // live code (null the moment we leave the waiting screen).
  useEffect(() => {
    waitingCodeRef.current = stage === 'waiting' ? roomCode : null;
  }, [stage, roomCode]);

  // In-match errors show as a transient toast; auto-clear.
  useEffect(() => {
    if (stage !== 'playing' || !error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [stage, error]);

  // Reset the tentative selection whenever a new round begins.
  useEffect(() => {
    if (!view) return;
    const key = view.roundNumber + '-' + view.mySetsWon + '-' + view.oppSetsWon;
    if (key !== lastRoundKeyRef.current) {
      lastRoundKeyRef.current = key;
      setSelectedCard(null);
      setSelectedIndex(null);
    }
  }, [view]);

  // Result sting.
  const lastPhaseRef = useRef('');
  useEffect(() => {
    if (!view) return;
    if (view.phase === 'round-end' && lastPhaseRef.current !== 'round-end' && view.lastResult) {
      const r = view.lastResult;
      if (r.folded) audio.sfx('fold');
      else if (r.regicide) audio.sfx('regicide');
      else if (r.iWon) audio.sfx('winRound');
      else if (r.oppWon) audio.sfx('loseRound');
    }
    lastPhaseRef.current = view.phase;
  }, [view]);

  const emitAct = useCallback((action: PvpAction) => {
    socketRef.current?.emit('act', action);
  }, []);

  const createRoom = useCallback(() => {
    setError(null);
    setBusy(true);
    socketRef.current?.emit('create-room', { tierKey: tier }, (res: { code?: string; error?: string }) => {
      setBusy(false);
      if (res?.error) return setError(res.error);
      if (res?.code) {
        setRoomCode(res.code);
        setStage('waiting');
      }
    });
  }, [tier]);

  const joinRoom = useCallback(() => {
    setError(null);
    const code = joinCode.toUpperCase().trim();
    if (code.length !== 6) return setError('房间码是 6 位字符');
    setBusy(true);
    socketRef.current?.emit('join-room', { code }, (res: { ok?: boolean; error?: string }) => {
      setBusy(false);
      if (res?.error) setError(res.error);
    });
  }, [joinCode]);

  const cancelRoom = useCallback(() => {
    socketRef.current?.emit('cancel-room', () => {
      setRoomCode(null);
      setStage('lobby');
    });
  }, []);

  // clipboard.writeText needs a secure context; fall back to the old textarea trick so
  // copying still works over plain http (a LAN IP during testing, say).
  const writeClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }, []);

  const copyCode = useCallback(async () => {
    if (!roomCode) return;
    await writeClipboard(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode, writeClipboard]);

  const copyLink = useCallback(async () => {
    if (!roomCode) return;
    await writeClipboard(`${window.location.origin}/pvp?room=${roomCode}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [roomCode, writeClipboard]);

  const sendEmote = useCallback((e: Emote) => {
    socketRef.current?.emit('emote', e);
  }, []);

  const buyInsight = useCallback(() => {
    audio.sfx('click');
    socketRef.current?.emit('insight', (res: { ok?: boolean; error?: string }) => {
      if (res?.error) setError(res.error);
    });
  }, []);

  // ————— gates —————

  if (status === 'loading') {
    return <main className="h-screen bg-void flex items-center justify-center"><p className="text-text-muted tracking-[4px] font-display">连 接 中 …</p></main>;
  }

  if (status === 'unauthenticated') {
    // An invited guest lands here first. Carry the room code through the login round-trip
    // so they come back to the table instead of a blank lobby wondering where it went.
    const back = invite ? `/pvp?room=${invite}` : '/pvp';
    return (
      <main className="h-screen bg-void flex flex-col items-center justify-center gap-8 px-4">
        <BackButton onClick={() => router.push('/')} />
        <p className="font-gothic text-cracked text-3xl tracking-[8px] text-blood">真 人 对 战</p>
        {invite ? (
          <div className="text-center">
            <p className="text-text-bright tracking-[3px] font-display">有人邀你入局</p>
            <p className="text-amber-bright tracking-[8px] font-display font-bold text-2xl mt-3">{invite}</p>
            <p className="text-text-muted text-xs tracking-[2px] font-display mt-3">登录后自动落座</p>
          </div>
        ) : (
          <p className="text-text-secondary tracking-[3px] font-display">对赌要有名字 — 请先登录</p>
        )}
        <DecoButton color="blood" size="md" onClick={() => router.push(`/login?next=${encodeURIComponent(back)}`)}>
          登 录 / 注 册
        </DecoButton>
      </main>
    );
  }

  // ————— playing —————

  if (stage === 'playing' && view) {
    const fanCards = (() => {
      if (!view.myPlayed) return view.myHand;
      const idx = view.myHand.indexOf(view.myPlayed);
      if (idx === -1) return view.myHand;
      return [...view.myHand.slice(0, idx), ...view.myHand.slice(idx + 1)];
    })();

    const canSelect = view.myTurn && (view.turnKind === 'first-play' || view.turnKind === 'second-play') && !view.myPlayed;
    const chipSwing = Math.max(Math.abs(view.myChips - view.buyIn), Math.abs(view.oppChips - view.buyIn));
    const intensity = Math.min(chipSwing / (view.buyIn * 0.6), 1);

    let playerGlow: 'gold' | 'blood' | null = null;
    let opponentGlow: 'gold' | 'blood' | null = null;
    if ((view.phase === 'round-end' || view.phase === 'set-end') && view.lastResult && !view.lastResult.folded) {
      if (view.lastResult.iWon) playerGlow = view.lastResult.regicide ? 'blood' : 'gold';
      else if (view.lastResult.oppWon) opponentGlow = view.lastResult.regicide ? 'blood' : 'gold';
    }

    let statusText: string | null = null;
    let statusTone: 'teal' | 'amber' | 'blood' | 'neutral' = 'neutral';
    let thinking = false;
    if (view.matchEnd) statusText = null;
    else if (view.myTurn && view.turnKind === 'first-play') { statusText = selectedCard ? '设定注额，然后出牌' : '你的先手 — 从手牌选择一张'; statusTone = 'amber'; }
    else if (view.myTurn && view.turnKind === 'second-play') { statusText = selectedCard ? '选择跟注、加注或弃牌' : '对方已出牌并下注 — 选择你的牌'; statusTone = 'amber'; }
    else if (view.myTurn && view.turnKind === 'bet-response') { statusText = view.message || '轮到你响应下注'; statusTone = 'blood'; }
    else if (view.turnKind !== 'none') { statusText = `等待 ${view.oppName} …`; statusTone = 'teal'; thinking = true; }
    else if (view.phase === 'reveal') { statusText = '开 牌'; statusTone = 'blood'; }

    // The opponent's figure: their emote wins, otherwise their state of play shows.
    let dealerAction: DealerAction = 'idle';
    // The two endings they survive: slow, seated applause over your corpse.
    if (pvpFinale === 'broke' || pvpFinale === 'execution') dealerAction = 'win';
    else if (pvpFinale) dealerAction = 'idle';
    else if (oppEmote) dealerAction = oppEmote;
    else if (view.phase === 'round-end' && view.lastResult) {
      const r = view.lastResult;
      if (r.oppWon) dealerAction = 'win';
      else if (r.regicide) dealerAction = 'hit';
      else if (r.iWon) dealerAction = 'angry';
    } else if (!view.myTurn && view.turnKind !== 'none') dealerAction = 'think';
    else if (view.myTurn && view.turnKind !== 'none') dealerAction = 'doze';

    const oppShort = view.oppName.length > 8 ? view.oppName.slice(0, 8) + '…' : view.oppName;
    const oppSide = view.mySide === 'emperor' ? 'slave' : 'emperor';
    const insightRows = view.insight ? view.insight[oppSide] : null;
    const keyName = oppSide === 'emperor' ? '皇帝牌' : '奴隶牌';

    return (
      <main className="h-screen bg-void">
        <RotatePrompt />
        <div className="h-full flex flex-col relative">
          {!pvpFinale && (
            <VerdictBar
              side={view.mySide}
              roundNumber={view.displayRound}
              initiative={view.iHaveInitiative ? 'player' : 'opponent'}
              playerLost={view.oppSetsWon}
              opponentLost={view.mySetsWon}
              oppLabel={oppShort}
              playerChips={view.myChips}
              opponentChips={view.oppChips}
            />
          )}

          <div className="flex-1 min-h-0 flex flex-col mx-3 sm:mx-6">
            <div className="pb-2">
              <StatusStrip text={pvpFinale ? null : statusText} tone={statusTone} thinking={thinking} />
              <TimerPill deadline={view.myTurn && !pvpFinale ? view.deadline : null} />
            </div>

            <div className="relative flex-1 flex flex-col min-h-0">
              <TableScene
                personality="deceptive"
                dealerAction={dealerAction}
                isThinking={!view.myTurn && view.turnKind !== 'none'}
                intensity={intensity}
                opponentCard={view.oppPlayed ?? (view.oppPlayedPresent ? 'citizen' : null)}
                opponentFaceDown={!view.revealed}
                playerCard={view.myPlayed}
                roundKey={view.roundNumber + '-' + view.mySetsWon + '-' + view.oppSetsWon}
                hand={fanCards}
                selectedIndex={canSelect ? selectedIndex : null}
                canSelect={canSelect}
                onSelectCard={(card, index) => {
                  audio.sfx('click');
                  setSelectedCard(card);
                  setSelectedIndex(index);
                }}
                playerChips={view.myChips}
                opponentChips={view.oppChips}
                pot={view.pot}
                revealCeremony={view.phase === 'reveal'}
                playerGlow={playerGlow}
                opponentGlow={opponentGlow}
                quality={quality}
                playerSetsWon={view.mySetsWon}
                opponentSetsWon={view.oppSetsWon}
                opponentEyeColor={view.oppHasReadMe ? '#ff2222' : null}
                finale={pvpFinale}
              />

              <div
                className="absolute inset-0 pointer-events-none z-[5]"
                style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 38%, transparent 45%, rgba(2,2,5,0.55) 100%)' }}
              />

              {/* Center stage — big moments only */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 px-4 min-h-0 pointer-events-none">
                {(view.phase === 'round-end' || view.phase === 'set-end') && (
                  <p
                    className="font-gothic text-cracked text-2xl sm:text-3xl tracking-wider text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] text-text-bright"
                    style={{ animation: 'fade-in-up 0.7s 0.3s both' }}
                  >
                    {view.message}
                  </p>
                )}
              </div>

              {/* 读心 — pinned beside the opponent's head. Buy once; then the dossier stays. */}
              {!view.matchEnd && !pvpFinale && !view.insight && (
                <button
                  type="button"
                  onClick={buyInsight}
                  className="absolute z-20 pointer-events-auto text-center px-6 py-4 border border-amber/50 bg-black/55 backdrop-blur-sm hover:border-amber hover:-translate-y-0.5 transition-all duration-200"
                  style={{
                    top: '17%',
                    left: 'calc(50% + 9rem)',
                    clipPath: CLIP_10,
                    boxShadow: '0 0 26px rgba(196,154,48,0.22), inset 0 0 14px rgba(0,0,0,0.45)',
                  }}
                >
                  <span className="block font-gothic text-cracked text-2xl sm:text-3xl tracking-[6px] text-amber-bright mb-1.5">读 心</span>
                  <span className="block text-[10px] tracking-[3px] text-text-dim font-display">窥视他的底牌习惯</span>
                  <span className="block text-xs tracking-[2px] text-amber font-display mt-1.5">账户 −{view.insightCost}</span>
                </button>
              )}
              {view.insight && insightRows && !pvpFinale && (
                <div
                  className="absolute z-20 pointer-events-none w-56 border border-amber/40 bg-black/65 backdrop-blur-md px-4 py-3.5 fade-in"
                  style={{
                    top: '13%',
                    left: 'calc(50% + 8.5rem)',
                    clipPath: CLIP_10,
                    boxShadow: 'inset 0 0 16px rgba(0,0,0,0.5), 0 0 20px rgba(196,154,48,0.12)',
                  }}
                >
                  <p className="text-[10px] tracking-[3px] text-amber/80 font-display uppercase mb-0.5">读心 · {view.insight.oppName}</p>
                  <p className="text-[10px] tracking-[2px] text-text-dim font-display mb-2.5">
                    {oppSide === 'emperor' ? '皇帝方' : '奴隶方'} · 第 N 回合亮{keyName}
                  </p>
                  {insightRows.map((r) => {
                    // A rate off one or two hands is noise, not a tell — a single slave
                    // shown in round 1 is not "100% every game". Below the threshold the
                    // row is greyed and shows the sample count instead of a false number.
                    const thin = r.plays < 3;
                    const shown = r.rate === null || thin ? 0 : r.rate;
                    return (
                      <div key={r.round} className="flex items-center gap-2 py-[3px]">
                        <span className="text-[10px] text-text-dim font-display w-7 shrink-0">回 {r.round}</span>
                        <div className="flex-1 h-1 bg-black/60 overflow-hidden">
                          <div className="h-full" style={{ width: `${shown * 100}%`, background: '#dd2222', boxShadow: '0 0 5px rgba(221,34,34,0.5)' }} />
                        </div>
                        {thin ? (
                          <span className="text-[10px] font-display w-9 text-right shrink-0 text-text-dim" title="情报不足">
                            {r.plays === 0 ? '—' : `n=${r.plays}`}
                          </span>
                        ) : (
                          <span className="text-[11px] font-display font-bold w-9 text-right shrink-0 text-blood-glow">
                            {Math.round((r.rate ?? 0) * 100) + '%'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[9px] tracking-[1px] text-text-dim/70 font-display mt-2">n&lt;3 的回合样本不足，仅供参考</p>
                </div>
              )}

              {/* Opponent connection warning */}
              {!view.oppConnected && !view.matchEnd && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-5 py-2 border border-blood/60 bg-blood-surface/80 backdrop-blur-sm">
                  <p className="text-blood-glow text-sm tracking-[3px] font-display" style={{ animation: 'pulse-glow 1.5s ease-in-out infinite' }}>
                    {view.oppName} 已掉线 — 60 秒内未归即判负
                  </p>
                </div>
              )}

              {/* In-match error toast */}
              {error && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 border border-blood/60 bg-blood-surface/85 backdrop-blur-sm fade-in pointer-events-none">
                  <p className="text-blood-glow text-sm tracking-[3px] font-display">{error}</p>
                </div>
              )}

              {/* Emotes — the other half of the mind game. Left, opposite the action dock. */}
              {!view.matchEnd && !pvpFinale && <EmoteDock onEmote={sendEmote} />}

              {/* Action dock */}
              <div className="absolute bottom-5 right-4 sm:right-6 z-20 pointer-events-auto flex flex-col items-end gap-3">
                {view.myTurn && view.turnKind === 'first-play' && selectedCard && (
                  <BetPicker onConfirm={(bet) => { audio.sfx('cardPlay'); emitAct({ kind: 'first-play', card: selectedCard, bet }); }} />
                )}
                {view.myTurn && view.turnKind === 'second-play' && selectedCard && (
                  <BetActions onAction={(a: BetAction) => { audio.sfx('cardPlay'); emitAct({ kind: 'second-play', card: selectedCard, action: a }); }} />
                )}
                {view.myTurn && view.turnKind === 'bet-response' && (
                  <BetActions onAction={(a: BetAction) => emitAct({ kind: 'bet-response', action: a })} />
                )}
              </div>

              {/* ————— Finale: input freeze → cinematic → blackout → report ————— */}
              {pvpFinale && (
                <>
                  <div className="absolute inset-0 z-[70] pointer-events-auto" />
                  {pvpFinale === 'execution' && (
                    <div
                      className="fixed inset-0 z-[80] pointer-events-none"
                      style={{ animation: `finale-red ${FINALE_TIMINGS.execution.cut}s ease-in forwards` }}
                    />
                  )}
                  <div
                    className={'fixed inset-0 z-[85] bg-black ' + (finaleStage === 'cut' || finaleStage === 'report' ? 'opacity-100' : 'opacity-0 pointer-events-none')}
                    style={{ transition: FINALE_TIMINGS[pvpFinale].hardCut ? 'none' : 'opacity 1100ms ease' }}
                  />
                  <style>{`@keyframes finale-red {
                    0% { box-shadow: inset 0 0 0 0 rgba(120,0,0,0); }
                    55% { box-shadow: inset 0 0 120px 30px rgba(150,0,0,0.3); }
                    100% { box-shadow: inset 0 0 45vw 18vw rgba(180,10,10,0.85); }
                  }`}</style>
                </>
              )}
              {pvpFinale && finaleStage === 'report' && view.matchEnd && (
                <MatchReport
                  kind={pvpFinale}
                  sets={[view.mySetsWon, view.oppSetsWon]}
                  chipDelta={view.matchEnd.finalChips - view.buyIn}
                  finalChips={view.matchEnd.finalChips}
                  oppName={view.oppName}
                  settled
                  onExit={() => router.push('/')}
                />
              )}

              {/* Your own walkout: no ceremony, just the receipt. */}
              {view.matchEnd && !pvpFinale && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/85 backdrop-blur-sm fade-in pointer-events-auto">
                  <div className="text-center px-6">
                    <div className="w-24 h-px mx-auto mb-8 bg-teal" />
                    <p className="text-teal font-gothic text-cracked text-3xl tracking-[10px] uppercase mb-6">败 北</p>
                    <p className="text-text-secondary tracking-[3px] font-display mb-2">你离开了赌桌</p>
                    <p className="text-text-muted text-sm tracking-[3px] font-display mb-10">
                      带出 {view.matchEnd.finalChips} 筹码 · 已结算至账户
                    </p>
                    <DecoButton color="neutral" size="lg" onClick={() => router.push('/')}>返 回 大 厅</DecoButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ————— waiting —————

  if (stage === 'waiting' && roomCode) {
    const buyIn = STAKES_TIERS.find((t) => t.key === tier)!.buyIn;
    return (
      <main className="h-screen bg-void relative overflow-hidden">
        {/* The table waits with you — the seat across is still empty */}
        <div className="absolute inset-0 pointer-events-none">
          <TableScene
            personality="cautious"
            showOpponent={false}
            hand={[]}
            playerChips={buyIn}
            opponentChips={0}
            pot={0}
            quality={quality}
          />
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 42%, rgba(2,2,6,0.25) 0%, rgba(2,2,6,0.82) 100%)' }}
        />

        <BackButton onClick={cancelRoom} label="撤 桌" />

        <div className="relative z-10 h-full flex flex-col items-center justify-center gap-9 px-4">
          <p className="text-sm sm:text-base tracking-[6px] text-text-secondary font-display uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            对面的座位还空着 — 把暗号交给你的对手
          </p>

          <button type="button" onClick={copyCode} className="flex gap-3 group" title="点击复制">
            {roomCode.split('').map((ch, i) => (
              <span
                key={i}
                className="w-14 h-16 sm:w-16 sm:h-20 flex items-center justify-center border border-amber/50 bg-black/60 text-amber-bright font-display font-black text-3xl sm:text-4xl transition-transform duration-200 group-hover:-translate-y-0.5"
                style={{ clipPath: 'polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)', boxShadow: '0 0 20px rgba(196,154,48,0.15)' }}
              >
                {ch}
              </span>
            ))}
          </button>

          {/* Two ways to invite: the code (typed in by hand) or the link (one tap for the
              guest — it lands them straight in the seat, through login if they need it). */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <DecoButton color="amber" size="md" onClick={copyCode} className="min-w-[190px]">
              {copied ? '已 复 制 ✓' : '复 制 暗 号'}
            </DecoButton>
            <DecoButton color="blood" size="md" onClick={copyLink} className="min-w-[190px]">
              {linkCopied ? '链 接 已 复 制 ✓' : '复 制 邀 请 链 接'}
            </DecoButton>
          </div>

          <div className="flex items-center gap-3 text-text-muted">
            <div className="flex gap-1.5">
              {[0, 200, 400].map((d) => (
                <div key={d} className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" style={{ animationDelay: d + 'ms' }} />
              ))}
            </div>
            <p className="text-sm tracking-[4px] font-display">等待对手入座 · 入座即刻扣除双方买入 {buyIn}</p>
          </div>
        </div>
      </main>
    );
  }

  // ————— lobby —————

  return (
    <main className="min-h-screen bg-void relative overflow-hidden flex flex-col items-center justify-center gap-10 px-4 py-14">
      <BackButton onClick={() => router.push('/')} />
      {/* Ambient wash — blood above, teal below, echoing the two panels */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(170,17,17,0.09) 0%, transparent 60%),' +
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(42,138,138,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative text-center slide-up">
        <div className="flex items-center justify-center gap-4 mb-2">
          <Flourish />
          <p className="font-gothic text-cracked text-5xl sm:text-6xl tracking-[10px] text-blood leading-none">决</p>
          <Flourish flip />
        </div>
        <p className="text-sm tracking-[6px] text-text-secondary font-display mt-4 uppercase">真 人 对 战 · 房 间 码</p>
        {balance !== null && (
          <p className="text-xs tracking-[2px] text-text-dim font-display mt-3">
            账户余额 <span className="text-amber-bright font-bold text-sm">{balance}</span> 筹码 · 全额买入制
          </p>
        )}
        {!connected && !error && <p className="text-xs tracking-[2px] text-text-dim font-display mt-2">连接对战服务器中…</p>}
        {invite && connected && !error && (
          <p className="text-xs tracking-[3px] text-amber font-display mt-2">正在落座 {invite} …</p>
        )}
      </div>

      {/* A match that ended while we were away — say so, or the player reads it as a bug */}
      {notice && (
        <div
          className="relative flex items-center gap-5 px-6 py-3.5 border border-amber/60 bg-black/80 backdrop-blur-md fade-in"
          style={{ boxShadow: '0 0 30px rgba(196,154,48,0.18), inset 0 0 16px rgba(0,0,0,0.5)' }}
        >
          <div>
            <p className="text-sm tracking-[3px] font-display text-amber-bright">上一场对局已作废</p>
            <p className="text-[11px] tracking-[2px] text-text-secondary font-display mt-1">
              服务器重启导致该局中断
              {notice.refund > 0 && <> · 买入 <span className="text-amber-bright font-bold">{notice.refund}</span> 筹码已全额退回</>}
            </p>
          </div>
          <DecoButton color="neutral" size="sm" onClick={() => setNotice(null)}>知 道 了</DecoButton>
        </div>
      )}

      <div className="relative grid lg:grid-cols-5 gap-6 w-full max-w-5xl fade-in-up" style={{ animationDelay: '150ms' }}>
        {/* 开设赌局 — the main act */}
        <section className="lg:col-span-3 relative border border-border/70 bg-abyss/70 backdrop-blur-sm px-6 sm:px-8 pt-9 pb-8">
          <span className="absolute top-2 left-2 w-5 h-5 border-t border-l border-blood/80" />
          <span className="absolute top-2 right-2 w-5 h-5 border-t border-r border-blood/80" />
          <span className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-blood/80" />
          <span className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-blood/80" />
          <span className="absolute -top-3 left-7 px-3 bg-void text-xs tracking-[5px] text-blood uppercase font-display">开 设 赌 局</span>

          <div className="flex gap-3 sm:gap-4 mb-7">
            {STAKES_TIERS.map((t) => (
              <TierCard key={t.key} tier={t} selected={tier === t.key} onClick={() => setTier(t.key)} />
            ))}
          </div>
          <div style={{ filter: connected ? 'drop-shadow(0 0 16px rgba(170,17,17,0.35))' : 'none' }}>
            <DecoButton color="blood" size="lg" fullWidth disabled={busy || !connected} onClick={createRoom}>
              {busy ? '开 桌 中 …' : '创 建 房 间'}
            </DecoButton>
          </div>
          <p className="text-center text-[10px] tracking-[3px] text-text-dim font-display mt-3">
            创建后获得六位暗号 · 对手入座即开局
          </p>
        </section>

        {/* 凭码入座 */}
        <section className="lg:col-span-2 relative border border-border/70 bg-abyss/70 backdrop-blur-sm px-6 sm:px-8 pt-9 pb-8 flex flex-col">
          <span className="absolute top-2 left-2 w-5 h-5 border-t border-l border-teal/80" />
          <span className="absolute top-2 right-2 w-5 h-5 border-t border-r border-teal/80" />
          <span className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-teal/80" />
          <span className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-teal/80" />
          <span className="absolute -top-3 left-7 px-3 bg-void text-xs tracking-[5px] text-teal uppercase font-display">凭 码 入 座</span>

          <p className="text-xs tracking-[2px] text-text-dim font-display mb-5">向房主索要六位暗号，入座即视为接受该桌买入。</p>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="······"
            className="w-full bg-black/55 border border-border text-text-bright px-5 py-5 text-2xl tracking-[14px] font-display font-black outline-none text-center uppercase focus:border-teal transition-colors mb-5"
            style={{ boxShadow: 'inset 0 0 14px rgba(0,0,0,0.5)' }}
          />
          <div className="mt-auto">
            <DecoButton color="teal" size="lg" fullWidth disabled={busy || !connected} onClick={joinRoom}>
              入 座
            </DecoButton>
          </div>
        </section>
      </div>

      {error && (
        <div className="relative border-t border-b border-blood/60 bg-blood-surface/70 px-6 py-2.5 text-center fade-in">
          <p className="text-blood-glow text-sm tracking-[3px] font-display">{error}</p>
        </div>
      )}
    </main>
  );
}
