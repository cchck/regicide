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
import Matchmaking, { SeatPhase } from '@/components/Matchmaking';
import DecoButton from '@/components/DecoButton';
import Flourish from '@/components/Flourish';
import BackButton from '@/components/BackButton';
import { MATCH_EVENT } from '@/components/AccountBar';

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

/**
 * How long the house waits for a human before sitting down itself.
 *
 * Long enough that a real opponent arriving in the same minute still gets matched, short
 * enough that a lone player isn't punished for the lobby being empty. The wait is real —
 * there's an actual server-side queue behind it — so this is a give-up threshold, not a
 * scripted delay pretending to be a search.
 */
const HOUSE_SITS_AFTER_MS = 12_000;

export default function PvpPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
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

  // ————— Quick match —————
  // `seatPhase` drives the ceremony overlay; `houseTimer` is the give-up clock that seats
  // the house when the queue turns up nobody.
  // The PvP server is unreachable (not running locally, or down in production). This must
  // NOT take the whole game with it: the AI opponent runs entirely in the browser, so a
  // dead socket should cost you real opponents and nothing else.
  const [pvpDown, setPvpDown] = useState(false);
  const [seatPhase, setSeatPhase] = useState<SeatPhase | null>(null);
  const [seatOpp, setSeatOpp] = useState<{ name: string; isHouse: boolean } | null>(null);
  const houseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);

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
          setPvpDown(false);

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
        socket.on('connect_error', () => {
          // Deliberately not surfaced as an error banner — you can still play, just not
          // against people. The lobby explains it in place instead.
          setConnected(false);
          setPvpDown(true);
        });
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
        // Picked up out of the quick-match line by someone who arrived after us. The
        // 'view' event is already in flight; this just tells us who sat down.
        socket.on('matched', (m: { oppName: string }) => {
          if (houseTimer.current) { clearTimeout(houseTimer.current); houseTimer.current = null; }
          setSeatOpp({ name: m.oppName || '对家', isHouse: false });
          setSeatPhase('seated');
        });
        socket.on('view', (v: PvpView) => {
          setView(v);
          setStage('playing');
        });
      })
      .catch(() => setPvpDown(true)); // ticket fetch or handshake failed — same story

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (emoteTimer.current) clearTimeout(emoteTimer.current);
    };
  }, [status]);

  // Decide "down" rather than waiting forever on it.
  //
  // A refused connection reports back instantly, but a dropped packet (firewall, dead
  // host) leaves socket.io retrying for ~20s with no error. Without a bound, the seat
  // button would sit disabled that whole time on a page whose main action doesn't even
  // need the socket. 3.5s is longer than any real handshake and short enough not to read
  // as a hang.
  useEffect(() => {
    if (stage !== 'lobby' || connected || pvpDown) return;
    const t = setTimeout(() => setPvpDown(true), 3500);
    return () => clearTimeout(t);
  }, [stage, connected, pvpDown]);

  // BGM per stage.
  useEffect(() => {
    audio.playMusic(stage === 'playing' ? 'table' : 'lobby');
  }, [stage]);

  // Hide the global account bar while a match is live. Only GameBoard was ever sending
  // this, so a PvP match ran with the wallet — and a sign-out button — parked over the
  // verdict beam the whole time.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(MATCH_EVENT, { detail: stage === 'playing' }));
    return () => { window.dispatchEvent(new CustomEvent(MATCH_EVENT, { detail: false })); };
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

  // ————————————————————————— Quick match —————————————————————————

  const clearSeatTimers = useCallback(() => {
    if (houseTimer.current) { clearTimeout(houseTimer.current); houseTimer.current = null; }
    if (handoffTimer.current) { clearTimeout(handoffTimer.current); handoffTimer.current = null; }
  }, []);

  /**
   * The house takes the seat, and the overlay says so rather than dressing an AI up in a
   * fake player name. The AI match lives on the hub route, so hold the "庄家入座" plate on
   * screen long enough to read, then hand off.
   *
   * Declared before seatTheHouse on purpose: a useCallback dependency array is evaluated
   * during render, so referencing a `const` declared further down throws on first paint.
   */
  const seatHouseDirectly = useCallback(() => {
    setSeatOpp({ name: '庄 家', isHouse: true });
    setSeatPhase('seated');
    audio.sfx('click');
    handoffTimer.current = setTimeout(() => router.push(`/?table=${tier}`), 2200);
  }, [router, tier]);

  /** Nobody answered within the give-up window — check it's safe, then seat the house. */
  const seatTheHouse = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) {
      setSeatPhase(null);
      setError('与对战服务器断开，请重试');
      return;
    }
    // Leaving the queue is what makes this safe, so we wait for the server to confirm it
    // rather than assuming. A human could have been matched to us in the same instant the
    // give-up timer fired; in that case a room already holds our buy-in, and dealing an AI
    // hand here would abandon it. The server answers from the queue itself, so the two
    // outcomes can never both be true.
    socket.timeout(4000).emit('cancel-quick', (err: unknown, res: { wasQueued?: boolean }) => {
      if (err) {
        // No answer — we don't know which way it went, so we don't gamble the buy-in.
        // Dropping to the lobby is safe: a live match reasserts itself on reconnect.
        setSeatPhase(null);
        setError('匹配超时，请重试');
        return;
      }
      if (!res?.wasQueued) return; // already seated with a human — that flow owns us now
      seatHouseDirectly();
    });
  }, [seatHouseDirectly]);

  const quickMatch = useCallback(() => {
    setError(null);
    // No PvP server means there is no queue to stand in, so don't mime a search — the
    // house takes the seat straight away. This path is what keeps the game playable when
    // `npm run ws` isn't running, and what stops a production outage from taking the
    // single-player game down with it.
    if (!socketRef.current || pvpDown || !connected) {
      seatHouseDirectly();
      return;
    }
    setBusy(true);
    socketRef.current.emit(
      'quick-match',
      { tierKey: tier },
      (res: { queued?: boolean; matched?: boolean; oppName?: string; error?: string }) => {
        setBusy(false);
        if (res?.error) return setError(res.error);
        if (res?.matched) {
          // Someone was already waiting — the 'view' event is already on its way.
          setSeatOpp({ name: res.oppName ?? '对家', isHouse: false });
          setSeatPhase('seated');
          return;
        }
        setSeatPhase('searching');
        setSeatOpp(null);
        houseTimer.current = setTimeout(seatTheHouse, HOUSE_SITS_AFTER_MS);
      },
    );
  }, [tier, seatTheHouse, seatHouseDirectly, pvpDown, connected]);

  // Bankruptcy relief. It belongs here now: this is the screen where you choose a buy-in,
  // so it's the only place where "I can't afford any table" is actionable.
  const [reliefBusy, setReliefBusy] = useState(false);
  const claimRelief = useCallback(async () => {
    setReliefBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/relief', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || `领取失败（HTTP ${res.status}）`);
      setBalance(data.balance);
    } catch {
      setError('网络错误，领取失败');
    } finally {
      setReliefBusy(false);
    }
  }, []);

  const cancelQuick = useCallback(() => {
    clearSeatTimers();
    socketRef.current?.emit('cancel-quick', () => {});
    setSeatPhase(null);
    setSeatOpp(null);
  }, [clearSeatTimers]);

  useEffect(() => () => clearSeatTimers(), [clearSeatTimers]);

  // A real opponent sat down: hold the two nameplates long enough to read a name, then
  // drop the overlay onto the table underneath — which by now is already dealt and live.
  // (The house branch doesn't come through here; it navigates away instead.)
  useEffect(() => {
    if (seatPhase !== 'seated' || seatOpp?.isHouse) return;
    const t = setTimeout(() => setSeatPhase(null), 2000);
    return () => clearTimeout(t);
  }, [seatPhase, seatOpp]);

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

  // The seating ceremony floats over whatever stage we're in: it starts in the lobby and
  // is still on screen when the dealt table appears underneath it.
  const seatOverlay = seatPhase ? (
    <Matchmaking
      tier={STAKES_TIERS.find((t) => t.key === tier)!}
      phase={seatPhase}
      opponent={seatOpp}
      myName={session?.user?.name || '你'}
      onCancel={cancelQuick}
    />
  ) : null;

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
        {/* Still showing the two nameplates for a beat — the table below is already dealt. */}
        {seatOverlay}
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
  // One screen, one dominant action. The old split ("开设赌局" | "凭码入座") made two
  // co-equal panels out of what is really a primary and a fallback: almost everyone wants
  // to just sit down and play, and only a minority is arranging a table with a friend.

  const chosen = STAKES_TIERS.find((t) => t.key === tier)!;
  const canAfford = balance === null || balance >= chosen.buyIn;
  const broke = balance !== null && balance < STAKES_TIERS[0].buyIn;
  // Neither up nor confirmed down yet — the handshake is still in flight.
  const settling = !connected && !pvpDown;

  return (
    <main className="h-screen bg-void relative overflow-hidden">
      {/* The lobby IS the room: the real table, with the seat opposite still empty. Sitting
          down should feel like walking to a table you can already see. */}
      <div className="absolute inset-0 pointer-events-none">
        <TableScene
          personality="cautious"
          showOpponent={false}
          hand={[]}
          playerChips={chosen.buyIn}
          opponentChips={0}
          pot={0}
          quality={quality}
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 75% 65% at 50% 40%, rgba(2,2,6,0.32) 0%, rgba(2,2,6,0.9) 100%)' }}
      />

      <BackButton onClick={() => router.push('/')} />

      {/* Centring lives on the INNER box, not the scroller. `justify-center` on an element
          that also scrolls pushes overflow past its own top edge, where it can't be
          reached — on a short landscape phone that would bury the masthead. */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center gap-7 px-4 py-12">
        {/* ————— Masthead ————— */}
        <div className="text-center slide-up shrink-0">
          <div className="flex items-center justify-center gap-4">
            <Flourish />
            <p className="font-gothic text-cracked text-5xl sm:text-6xl tracking-[10px] text-blood leading-none">决</p>
            <Flourish flip />
          </div>
          <p className="text-sm tracking-[7px] text-text-secondary font-display mt-4 uppercase">对 战</p>
          <p className="text-[11px] tracking-[3px] text-text-muted font-display mt-2.5">
            两个座位 · 一副牌 · 只有一个人站着离开
          </p>
          {balance !== null && (
            <p className="text-xs tracking-[2px] text-text-dim font-display mt-3">
              账户余额 <span className="text-amber-bright font-bold text-sm">{balance}</span> 筹码 · 全额买入制
            </p>
          )}
          {settling && !error && (
            <p className="text-xs tracking-[2px] text-text-dim font-display mt-2">连接对战服务器中…</p>
          )}
          {invite && connected && !error && (
            <p className="text-xs tracking-[3px] text-amber font-display mt-2">正在落座 {invite} …</p>
          )}
        </div>

        {/* A match that ended while we were away — say so, or the player reads it as a bug */}
        {notice && (
          <div
            className="flex items-center gap-5 px-6 py-3.5 border border-amber/60 bg-black/80 backdrop-blur-md fade-in shrink-0"
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

        {/* ————— Pick your table ————— */}
        <div className="w-full max-w-3xl fade-in-up shrink-0" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-[10px] tracking-[5px] text-text-dim uppercase font-display whitespace-nowrap">选 择 台 位</span>
            <div className="deco-line flex-1" />
          </div>
          <div className="flex gap-2.5 sm:gap-4">
            {STAKES_TIERS.map((t) => (
              <TierCard
                key={t.key}
                tier={t}
                selected={tier === t.key}
                affordable={balance === null || balance >= t.buyIn}
                onClick={() => setTier(t.key)}
              />
            ))}
          </div>
        </div>

        {/* Broke? The house extends a hand — only below the cheapest buy-in. */}
        {broke && (
          <div
            className="w-full max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-amber/25 bg-black/55 px-5 py-3.5 fade-in shrink-0"
            style={{ boxShadow: 'inset 0 0 14px rgba(0,0,0,0.4)' }}
          >
            <div className="text-center sm:text-left">
              <p className="text-sm text-text-secondary tracking-[2px] font-display">余额不足最低买入（{STAKES_TIERS[0].buyIn}）</p>
              <p className="text-[11px] text-text-dim tracking-[2px] font-display mt-1">山穷水尽时，赌场愿意借你一把火</p>
            </div>
            <DecoButton color="amber" size="sm" onClick={claimRelief} disabled={reliefBusy}>
              {reliefBusy ? '领 取 中 …' : '领取救济金 +200'}
            </DecoButton>
          </div>
        )}

        {/* ————— The one big button ————— */}
        <div className="w-full max-w-3xl fade-in-up shrink-0" style={{ animationDelay: '240ms' }}>
          <button
            type="button"
            onClick={quickMatch}
            // Gated on `settling`, NOT on `connected`: once we know the server is down
            // this button still works (the house doesn't need it), but while the handshake
            // is mid-flight we must not jump the queue on a server that's about to answer.
            disabled={busy || !canAfford || settling}
            className="group relative w-full py-6 sm:py-7 transition-all duration-300 enabled:hover:-translate-y-1 enabled:active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              clipPath: CLIP_10,
              background: 'linear-gradient(180deg, rgba(60,10,10,0.9) 0%, rgba(12,4,6,0.96) 100%)',
              boxShadow:
                'inset 0 0 0 1px rgba(221,34,34,0.65), inset 0 0 34px rgba(170,17,17,0.2), 0 0 40px rgba(170,17,17,0.28), 0 16px 36px rgba(0,0,0,0.7)',
            }}
          >
            <span
              className="absolute top-0 inset-x-0 h-[2px] pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, #dd2222, transparent)', boxShadow: '0 0 14px rgba(221,34,34,0.8)' }}
            />
            <span
              className="absolute inset-0 opacity-0 group-enabled:group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ clipPath: CLIP_10, background: 'radial-gradient(ellipse 60% 100% at 50% 120%, rgba(221,34,34,0.28), transparent 70%)' }}
            />
            <span
              className="absolute pointer-events-none"
              style={{ inset: '6px', clipPath: CLIP_10, border: '1px solid rgba(221,34,34,0.28)' }}
            />
            <span className="relative block font-display font-black text-xl sm:text-2xl tracking-[10px] text-text-bright"
              style={{ textShadow: '0 0 22px rgba(221,34,34,0.7), 0 2px 6px rgba(0,0,0,0.9)' }}>
              {busy ? '入 场 中 …' : settling ? '连 接 中 …' : '快 速 入 座'}
            </span>
            <span className="relative block text-[10px] tracking-[3px] text-text-muted font-display mt-2.5">
              {pvpDown ? '联机服务未启动 · 由庄家亲自陪你打' : '系统为你寻找同台位的对家 · 无人应答时由庄家接手'}
            </span>
          </button>
        </div>

        {/* ————— The fallback: arrange a table yourself ————— */}
        <div className="w-full max-w-3xl fade-in-up shrink-0" style={{ animationDelay: '340ms' }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="deco-line flex-1" />
            <span className="text-[10px] tracking-[5px] text-text-dim uppercase font-display whitespace-nowrap">或 者 · 约 人 开 桌</span>
            <div className="deco-line flex-1" />
          </div>

          {/* These two DO need the server — say why they're dark instead of leaving the
              player poking at dead buttons. */}
          {pvpDown && (
            <p className="text-center text-[11px] tracking-[2px] text-text-dim font-display mb-3.5">
              联机服务当前不可用，暂时只能和庄家对赌
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <DecoButton color="amber" size="md" fullWidth disabled={busy || !connected || !canAfford} onClick={createRoom}>
              {busy ? '开 桌 中 …' : '开 桌 · 发 暗 号'}
            </DecoButton>
            <DecoButton
              color="teal"
              size="md"
              fullWidth
              selected={showCodePanel}
              onClick={() => setShowCodePanel((v) => !v)}
            >
              凭 码 入 座
            </DecoButton>
          </div>

          {showCodePanel && (
            <div className="flex flex-col sm:flex-row gap-3 mt-3 fade-in">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(); }}
                maxLength={6}
                autoFocus
                placeholder="······"
                className="flex-1 bg-black/60 border border-border text-text-bright px-5 py-4 text-xl tracking-[12px] font-display font-black outline-none text-center uppercase focus:border-teal transition-colors"
                style={{ boxShadow: 'inset 0 0 14px rgba(0,0,0,0.5)' }}
              />
              <DecoButton color="teal" size="md" disabled={busy || !connected} onClick={joinRoom} className="sm:min-w-[150px]">
                入 座
              </DecoButton>
            </div>
          )}
        </div>

          {error && (
            <div className="border-t border-b border-blood/60 bg-blood-surface/70 px-6 py-2.5 text-center fade-in shrink-0">
              <p className="text-blood-glow text-sm tracking-[3px] font-display">{error}</p>
            </div>
          )}
        </div>
      </div>

      {seatOverlay}
    </main>
  );
}
