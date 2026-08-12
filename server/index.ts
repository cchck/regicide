// Regicide PvP server — authoritative game state over Socket.IO.
// Runs beside Next.js as its own process:  npm run ws
// Clients authenticate with short-lived HMAC tickets issued by /api/pvp/ticket.
// Opponents' hands never leave this process.

try {
  process.loadEnvFile('.env');
} catch {
  // .env optional if the vars are already in the environment
}

import { Server } from 'socket.io';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { gameReducer, initialState, GameAction } from '../src/lib/game-engine';
import { GameState, CardType, Side } from '../src/lib/types';
import { verifyTicket } from '../src/lib/ws-ticket';
import { SEALS_PER_WIN, SEALS_PER_REGICIDE } from '../src/lib/shop';
import { PvpAction, PvpView, InsightData, TurnKind } from '../src/lib/pvp-types';

// Railway/most PaaS inject PORT; WS_PORT is the local-dev override; 3801 the fallback.
const PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? 3801);
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error('缺少 AUTH_SECRET，无法校验入场券');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Kept in sync with src/components/TierCard.tsx (server has no business importing UI files).
const TIERS = {
  flicker: { buyIn: 100 },
  pact: { buyIn: 300 },
  regicide: { buyIn: 1000 },
} as const;
type TierKey = keyof typeof TIERS;

const DECISION_MS = 45_000;
const REVEAL_MS = 3_600;
const INTERMISSION_MS = 5_000;
const FORFEIT_MS = 60_000;
const ROOM_LINGER_MS = 60_000;

// Bump this whenever GameState's shape changes. A persisted room whose version differs
// from the running server is unrestorable — only THAT room falls back to refund, never
// the others. This is what keeps a schema-changing deploy from corrupting live matches.
const STATE_VERSION = 1;

// Lock Socket.IO CORS to the web origin in production; open in dev when unset.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

// Refuse to boot rather than quietly serving every origin on the internet. The CORS option
// below falls back to `true`, which reflects whatever Origin asked — fine on a laptop,
// wrong in production, and exactly the kind of default that is never noticed until it
// matters. Ticket auth still stands in the way of anything useful, but defence in depth is
// only depth if each layer is actually on.
if (process.env.NODE_ENV === 'production' && !ALLOWED_ORIGIN) {
  console.error('[ws] 生产环境必须设置 ALLOWED_ORIGIN（网站的来源，例如 https://your.app）');
  process.exit(1);
}
// Emotes are pure psychological warfare — allowed, but not as a spam weapon.
const EMOTE_COOLDOWN_MS = 2500;
const EMOTES = new Set(['taunt', 'clap', 'doze', 'angry', 'think']);

type RoleKey = 'host' | 'guest';

interface Seat {
  userId: string;
  name: string;
  socketId: string | null;
  /** Last emote timestamp — emotes are a taunt vector, so they're rate limited. */
  lastEmote?: number;
}

interface Room {
  code: string;
  tierKey: TierKey;
  buyIn: number;
  host: Seat;
  guest: Seat | null;
  state: GameState | null; // null while waiting for an opponent
  decisionTimer: ReturnType<typeof setTimeout> | null;
  advanceTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimers: Partial<Record<RoleKey, ReturnType<typeof setTimeout>>>;
  deadline: number | null;
  finished: boolean;
  endInfo: Partial<Record<RoleKey, { iWon: boolean; reason: 'sets' | 'bankrupt' | 'forfeit'; finalChips: number }>>;
  /** Purchased mind-reads, keyed by the buyer's role. One per player per match. */
  insights: Partial<Record<RoleKey, InsightData>>;
}

const rooms = new Map<string, Room>();
const roomByUser = new Map<string, string>();

// ————— Quick-match waiting lines, one per buy-in tier —————
// Purely in-memory and deliberately so: nobody in a line has posted a stake yet, so a
// restart costs them nothing but a re-queue.
interface Waiting { userId: string; name: string; socketId: string; since: number }
const queues = new Map<string, Waiting[]>();
const queuedUsers = new Map<string, string>(); // userId → tierKey, so leaving is O(1)

function dequeue(userId: string) {
  const tier = queuedUsers.get(userId);
  if (!tier) return;
  queuedUsers.delete(userId);
  const line = queues.get(tier);
  if (line) queues.set(tier, line.filter((w) => w.userId !== userId));
}

// Unambiguous room codes (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getOpponentSide(side: Side): Side {
  return side === 'emperor' ? 'slave' : 'emperor';
}

function currentActor(state: GameState): 'player' | 'opponent' | null {
  if (state.phase === 'first-play') return state.initiative;
  if (state.phase === 'second-play') return state.initiative === 'player' ? 'opponent' : 'player';
  if (state.phase === 'betting') return state.bettingTurn;
  return null;
}

function roleOf(room: Room, userId: string): RoleKey | null {
  if (room.host.userId === userId) return 'host';
  if (room.guest?.userId === userId) return 'guest';
  return null;
}

// Host is the engine's "player"; guest is the engine's "opponent".
function engineSideOf(role: RoleKey): 'player' | 'opponent' {
  return role === 'host' ? 'player' : 'opponent';
}

// Reading a mind costs 20% of the table's buy-in, paid from the ACCOUNT balance
// (not the table stack) — intel is bought with outside money, the duel stays pure.
function insightCostOf(room: Room): number {
  return Math.round(room.buyIn * 0.2);
}

// The engine writes messages from the host's perspective; mirror 你/对手 for the guest.
function mirrorMessage(msg: string): string {
  // The sentinel is written as an escape, not a literal NUL byte: a raw NUL makes grep,
  // file(1) and every other text tool treat this whole source file as binary.
  return msg.replace(/你/g, '\u0000').replace(/对手/g, '你').replace(/\u0000/g, '对手');
}

function clearTimers(room: Room) {
  if (room.decisionTimer) clearTimeout(room.decisionTimer);
  if (room.advanceTimer) clearTimeout(room.advanceTimer);
  room.decisionTimer = null;
  room.advanceTimer = null;
  room.deadline = null;
}

function destroyRoom(room: Room) {
  clearTimers(room);
  for (const t of Object.values(room.forfeitTimers)) if (t) clearTimeout(t);
  deleteRoomRow(room.code);
  rooms.delete(room.code);
  if (roomByUser.get(room.host.userId) === room.code) roomByUser.delete(room.host.userId);
  if (room.guest && roomByUser.get(room.guest.userId) === room.code) roomByUser.delete(room.guest.userId);
}

/**
 * Seat a guest opposite the host and deal the opening state. Both buy-ins are taken in a
 * single transaction at exactly this moment — the one instant where the money moves.
 *
 * Shared by `join-room` (by code) and `quick-match` (by tier). It has to be one function:
 * the pvpStake bookkeeping here is what guarantees a refund if the process dies mid-match,
 * and two copies of that would eventually disagree.
 */
async function seatGuest(
  room: Room,
  guest: { userId: string; name: string; socketId: string },
): Promise<{ error?: string }> {
  const result = await prisma.$transaction(async (tx) => {
    const [hostUser, guestUser] = await Promise.all([
      tx.user.findUnique({ where: { id: room.host.userId }, select: { chips: true } }),
      tx.user.findUnique({ where: { id: guest.userId }, select: { chips: true } }),
    ]);
    if (!guestUser || guestUser.chips < room.buyIn) return { error: `筹码不足 — 需要全额买入 ${room.buyIn}` } as const;
    if (!hostUser || hostUser.chips < room.buyIn) return { error: '对家筹码已不足，此桌作废' } as const;
    // Deduct the buy-in AND mark pvpStake — the safety net that guarantees a refund
    // if this room ever fails to restore after a restart.
    await tx.user.update({ where: { id: room.host.userId }, data: { chips: { decrement: room.buyIn }, pvpStake: room.buyIn } });
    await tx.user.update({ where: { id: guest.userId }, data: { chips: { decrement: room.buyIn }, pvpStake: room.buyIn } });
    return { ok: true } as const;
  });
  if ('error' in result) return { error: result.error };

  room.guest = { ...guest };
  roomByUser.set(guest.userId, room.code);
  room.state = gameReducer(initialState, {
    type: 'START_GAME',
    difficulty: 'normal',
    personality: 'cautious',
    buyIn: room.buyIn,
  });
  return {};
}

// ————————————————————————— views —————————————————————————

function buildView(room: Room, role: RoleKey): PvpView {
  const state = room.state!;
  const me = engineSideOf(role);
  const isHost = me === 'player';

  const myHand = isHost ? state.playerHand : state.opponentHand;
  const myPlayed = isHost ? state.playerSelectedCard : state.opponentSelectedCard;
  const oppSelected = isHost ? state.opponentSelectedCard : state.playerSelectedCard;

  const lastRound = state.roundHistory.length > 0 ? state.roundHistory[state.roundHistory.length - 1] : null;
  const inAftermath = state.phase === 'round-end' || state.phase === 'set-end' || state.phase === 'match-end';
  const revealed = state.phase === 'reveal' || (inAftermath && !!lastRound && !lastRound.folded);
  // A fold returns both cards to their hands, so during its aftermath nothing sits on
  // the table — not even your own card. (The hand array is already intact, so nulling
  // myPlayed also puts the card back into the fan on the client.)
  const foldAftermath = inAftermath && !!lastRound?.folded;

  const actor = currentActor(state);
  const myTurn = actor !== null && actor === me;
  let turnKind: TurnKind = 'none';
  if (state.phase === 'first-play') turnKind = 'first-play';
  else if (state.phase === 'second-play') turnKind = 'second-play';
  else if (state.phase === 'betting') turnKind = 'bet-response';

  const lastResult = inAftermath && lastRound
    ? {
        iWon: isHost ? lastRound.playerScored > 0 || lastRound.folded === 'opponent' : lastRound.opponentScored > 0 || lastRound.folded === 'player',
        oppWon: isHost ? lastRound.opponentScored > 0 || lastRound.folded === 'player' : lastRound.playerScored > 0 || lastRound.folded === 'opponent',
        folded: !!lastRound.folded,
        foldedByMe: isHost ? lastRound.folded === 'player' : lastRound.folded === 'opponent',
        regicide:
          !lastRound.folded &&
          ((lastRound.playerCard === 'slave' && lastRound.opponentCard === 'emperor') ||
            (lastRound.playerCard === 'emperor' && lastRound.opponentCard === 'slave')),
      }
    : null;

  const opp = role === 'host' ? room.guest! : room.host;
  const oppSeatConnected = opp.socketId !== null;

  return {
    roomCode: room.code,
    tierKey: room.tierKey,
    buyIn: room.buyIn,
    phase: state.phase,
    roundNumber: state.roundNumber,
    // What the round banner shows. roundNumber counts every round including folds, but
    // a fold replays the same card slot — so the ordinal players see is showdowns + 1.
    displayRound: Math.min(5, state.roundHistory.filter((r) => !r.folded).length + 1),
    mySide: isHost ? state.playerSide : getOpponentSide(state.playerSide),
    myHand,
    oppHandCount: (isHost ? state.opponentHand : state.playerHand).length,
    myChips: isHost ? state.playerChips : state.opponentChips,
    oppChips: isHost ? state.opponentChips : state.playerChips,
    pot: state.playerContribution + state.opponentContribution,
    multiplier: state.multiplier,
    myTurn,
    turnKind,
    iHaveInitiative: state.initiative === me,
    deadline: room.deadline,
    myPlayed: foldAftermath ? null : (myPlayed ?? null),
    oppPlayed: revealed ? (oppSelected ?? null) : null,
    oppPlayedPresent: oppSelected !== null,
    revealed,
    message: isHost ? state.message : mirrorMessage(state.message),
    mySetsWon: isHost ? state.playerSetsWon : state.opponentSetsWon,
    oppSetsWon: isHost ? state.opponentSetsWon : state.playerSetsWon,
    lastResult,
    oppName: opp.name,
    oppConnected: oppSeatConnected,
    matchEnd: room.endInfo[role] ?? null,
    insightCost: insightCostOf(room),
    insight: room.insights[role] ?? null,
    oppHasReadMe: !!room.insights[role === 'host' ? 'guest' : 'host'],
  };
}

function broadcastViews(io: Server, room: Room) {
  if (!room.state || !room.guest) return;
  if (room.host.socketId) io.to(room.host.socketId).emit('view', buildView(room, 'host'));
  if (room.guest.socketId) io.to(room.guest.socketId).emit('view', buildView(room, 'guest'));
}

// ————————————————————————— stats —————————————————————————

const ROLE_ENUM = { emperor: 'EMPEROR', slave: 'SLAVE' } as const;
const CARD_ENUM = { emperor: 'EMPEROR', citizen: 'CITIZEN', slave: 'SLAVE' } as const;

// Server-authoritative tendency logging for BOTH players at round resolution.
function recordRound(room: Room, prev: GameState, next: GameState) {
  const result = next.roundHistory[next.roundHistory.length - 1];
  // "round" in the tendency log means the card ordinal (1..5), NOT the raw round
  // counter — folds replay a slot without consuming a card, so roundNumber overshoots.
  // For a showdown, the slot is the count of showdowns so far (this one included);
  // for a fold, it's the slot the round WOULD have resolved (next showdown ordinal).
  const showdowns = next.roundHistory.filter((r) => !r.folded).length;
  const round = Math.min(result.folded ? showdowns + 1 : showdowns, 5);
  const entries: { userId: string; side: Side; card: CardType; won: boolean; foldedSelf: boolean }[] = [
    {
      userId: room.host.userId,
      side: prev.playerSide,
      card: result.playerCard,
      won: result.playerScored > 0 || result.folded === 'opponent',
      foldedSelf: result.folded === 'player',
    },
    {
      userId: room.guest!.userId,
      side: getOpponentSide(prev.playerSide),
      card: result.opponentCard,
      won: result.opponentScored > 0 || result.folded === 'player',
      foldedSelf: result.folded === 'opponent',
    },
  ];
  const folded = !!result.folded;
  Promise.all(
    entries.map((e) =>
      prisma.$transaction(async (tx) => {
        await tx.cardPlayEvent.create({
          data: {
            userId: e.userId,
            role: ROLE_ENUM[e.side],
            card: CARD_ENUM[e.card],
            round,
            betMultiplier: result.multiplier,
            won: e.won,
            folded,
            foldedSelf: e.foldedSelf,
            // Written from the server's own state — the client never had a say, so this
            // half of the log is the half a competitive board can be built on.
            source: 'PVP',
          },
        });
        if (!folded) {
          await tx.cardPlayStat.upsert({
            where: { userId_role_cardKind_round: { userId: e.userId, role: ROLE_ENUM[e.side], cardKind: CARD_ENUM[e.card], round } },
            create: { userId: e.userId, role: ROLE_ENUM[e.side], cardKind: CARD_ENUM[e.card], round, count: 1 },
            update: { count: { increment: 1 } },
          });
        }
      }),
    ),
  ).catch((err) => console.error('战绩写入失败', err));
}

// ————————————————————————— match flow —————————————————————————

function defaultActionFor(state: GameState): GameAction {
  const actor = currentActor(state)!;
  const hand = actor === 'player' ? state.playerHand : state.opponentHand;
  if (state.phase === 'first-play') return { type: 'FIRST_PLAY', card: hand[0], bet: 1 };
  if (state.phase === 'second-play') return { type: 'SECOND_PLAY', card: hand[0], action: 'fold' };
  return { type: 'BET_RESPONSE', action: 'fold' };
}

// Arm the right timer for whatever phase the room is in, then deal fresh views.
function armTimers(io: Server, room: Room) {
  const state = room.state;
  if (!state || room.finished) return;
  clearTimers(room);
  if (state.phase === 'first-play' || state.phase === 'second-play' || state.phase === 'betting') {
    room.deadline = Date.now() + DECISION_MS;
    room.decisionTimer = setTimeout(() => {
      if (room.state && !room.finished) dispatchAndAdvance(io, room, defaultActionFor(room.state));
    }, DECISION_MS);
  } else if (state.phase === 'reveal') {
    room.advanceTimer = setTimeout(() => dispatchAndAdvance(io, room, { type: 'REVEAL_DONE' }), REVEAL_MS);
  } else if (state.phase === 'round-end') {
    room.advanceTimer = setTimeout(() => dispatchAndAdvance(io, room, { type: 'NEXT_ROUND' }), INTERMISSION_MS);
  } else if (state.phase === 'set-end') {
    room.advanceTimer = setTimeout(() => dispatchAndAdvance(io, room, { type: 'NEXT_SET' }), INTERMISSION_MS);
  }
  // armTimers fires after seating and after every live dispatch — the single choke point
  // through which every mid-match state change passes, so mirror the room here.
  persistRoom(room);
  broadcastViews(io, room);
}

function dispatchAndAdvance(io: Server, room: Room, action: GameAction) {
  if (!room.state || room.finished) return;
  const prev = room.state;
  const next = gameReducer(prev, action);
  if (next === prev) return; // illegal for current phase — engine refused it
  room.state = next;

  if (next.roundHistory.length > prev.roundHistory.length) recordRound(room, prev, next);

  if (next.phase === 'match-end') {
    clearTimers(room);
    finishMatch(room, next);
    broadcastViews(io, room);
    return;
  }
  armTimers(io, room);
}

// Natural end: sets or bankruptcy. Final table stacks go back to the accounts.
function finishMatch(room: Room, state: GameState) {
  room.finished = true;
  const hostWon = state.opponentChips <= 0 ? true : state.playerChips <= 0 ? false : state.playerSetsWon >= 4;
  const reason: 'sets' | 'bankrupt' = state.playerChips <= 0 || state.opponentChips <= 0 ? 'bankrupt' : 'sets';
  room.endInfo.host = { iWon: hostWon, reason, finalChips: state.playerChips };
  room.endInfo.guest = { iWon: !hostWon, reason, finalChips: state.opponentChips };
  // Drop the row FIRST (a settled match is never restored), then settle atomically. A
  // crash in the ~ms between would leave both stakes for the boot orphan-refund — buy-in
  // back to both, never a double-pay.
  // Seals, decided here rather than reported: this server watched every hand, so the
  // win bonus and the regicide count are simply facts.
  const allRounds = [...state.setHistory.flatMap((s) => s.rounds), ...state.roundHistory];
  const hostRegicides = allRounds.filter((r) => !r.folded && r.playerCard === 'slave' && r.opponentCard === 'emperor').length;
  const guestRegicides = allRounds.filter((r) => !r.folded && r.opponentCard === 'slave' && r.playerCard === 'emperor').length;

  deleteRoomRow(room.code);
  settlePair(
    { userId: room.host.userId, amount: state.playerChips, seals: (hostWon ? SEALS_PER_WIN : 0) + hostRegicides * SEALS_PER_REGICIDE },
    { userId: room.guest!.userId, amount: state.opponentChips, seals: (!hostWon ? SEALS_PER_WIN : 0) + guestRegicides * SEALS_PER_REGICIDE },
  );
  setTimeout(() => destroyRoom(room), ROOM_LINGER_MS);
}

// Desertion: the deserter's live pledge (contribution this round) goes to the
// survivor; both remaining stacks settle back to their accounts.
function forfeit(io: Server, room: Room, deserter: RoleKey) {
  if (!room.state || room.finished || !room.guest) return;
  room.finished = true;
  clearTimers(room);
  const state = room.state;
  const midRound =
    state.phase === 'first-play' || state.phase === 'second-play' || state.phase === 'betting' || state.phase === 'reveal';
  const deserterIsHost = deserter === 'host';
  const deserterChips = deserterIsHost ? state.playerChips : state.opponentChips;
  const deserterContribution = deserterIsHost ? state.playerContribution : state.opponentContribution;
  const transfer = midRound ? Math.min(deserterContribution, deserterChips) : 0;

  const hostFinal = deserterIsHost ? state.playerChips - transfer : state.playerChips + transfer;
  const guestFinal = deserterIsHost ? state.opponentChips + transfer : state.opponentChips - transfer;

  room.endInfo.host = { iWon: !deserterIsHost, reason: 'forfeit', finalChips: hostFinal };
  room.endInfo.guest = { iWon: deserterIsHost, reason: 'forfeit', finalChips: guestFinal };
  deleteRoomRow(room.code);
  settlePair(
    { userId: room.host.userId, amount: hostFinal, seals: deserterIsHost ? 0 : SEALS_PER_WIN },
    { userId: room.guest.userId, amount: guestFinal, seals: deserterIsHost ? SEALS_PER_WIN : 0 },
  );
  broadcastViews(io, room);
  setTimeout(() => destroyRoom(room), ROOM_LINGER_MS);
}

// ————————————————————————— persistence & recovery —————————————————————————
// The rooms Map lives in this one process's memory, so a restart (deploy / crash /
// machine migration) would lose every live match. Mirror each room to the DB on every
// state change; on boot, rebuild them and re-arm timers so matches simply continue.

// Only the durable fields — sockets and timers are process-local and rebuilt on restore.
function serializeRoom(room: Room) {
  return {
    tierKey: room.tierKey,
    buyIn: room.buyIn,
    host: { userId: room.host.userId, name: room.host.name },
    guest: room.guest ? { userId: room.guest.userId, name: room.guest.name } : null,
    state: room.state,
    deadline: room.deadline,
    finished: room.finished,
    endInfo: room.endInfo,
    insights: room.insights,
  };
}

function persistRoom(room: Room) {
  if (!room.state) return; // waiting rooms hold no stake and nothing worth restoring
  const data = serializeRoom(room) as object;
  prisma.pvpRoom
    .upsert({
      where: { code: room.code },
      create: { code: room.code, version: STATE_VERSION, data },
      update: { version: STATE_VERSION, data },
    })
    .catch((err) => console.error('房间落库失败', room.code, err));
}

function deleteRoomRow(code: string) {
  prisma.pvpRoom.deleteMany({ where: { code } }).catch(() => {});
}

// Every settlement currently in flight. The boot orphan-scan awaits these before deciding
// what's an orphan: a settlement clears pvpStake asynchronously, and a match that ends
// DURING recovery (a restored turn whose deadline had already passed can finish the match
// synchronously) would otherwise still look stake-marked and get refunded a second time.
const inFlightSettlements = new Set<Promise<unknown>>();

// Settle both stacks back to their accounts in ONE transaction, each update also clearing
// pvpStake — so a crash can't leave one settled and the other's safety-net still armed.
function settlePair(
  a: { userId: string; amount: number; seals?: number },
  b: { userId: string; amount: number; seals?: number },
) {
  const p = prisma
    .$transaction([
      prisma.user.update({ where: { id: a.userId }, data: { chips: a.amount > 0 ? { increment: Math.floor(a.amount) } : undefined, pvpStake: null, seals: a.seals ? { increment: a.seals } : undefined } }),
      prisma.user.update({ where: { id: b.userId }, data: { chips: b.amount > 0 ? { increment: Math.floor(b.amount) } : undefined, pvpStake: null, seals: b.seals ? { increment: b.seals } : undefined } }),
    ])
    .catch((err) => console.error('结算失败', a.userId, b.userId, err))
    .finally(() => inFlightSettlements.delete(p));
  inFlightSettlements.add(p);
  return p;
}

// Restore all persisted rooms into memory and re-arm their timers. Any room that can't be
// restored (version mismatch after a shape change, or a parse failure) is voided and its
// two players refunded — and ONLY that room, never the others.
async function bootRecover() {
  let rows: { code: string; version: number; data: unknown }[] = [];
  try {
    rows = await prisma.pvpRoom.findMany();
  } catch (err) {
    console.error('读取残留房间失败', err);
    return;
  }
  for (const row of rows) {
    const d = row.data as ReturnType<typeof serializeRoom> | null;
    if (row.version !== STATE_VERSION || !d || !d.state) {
      await voidRoomRow(row.code, d);
      continue;
    }
    try {
      const room: Room = {
        code: row.code,
        tierKey: d.tierKey,
        buyIn: d.buyIn,
        host: { userId: d.host.userId, name: d.host.name, socketId: null },
        guest: d.guest ? { userId: d.guest.userId, name: d.guest.name, socketId: null } : null,
        state: d.state,
        decisionTimer: null,
        advanceTimer: null,
        forfeitTimers: {},
        deadline: d.deadline,
        finished: d.finished,
        endInfo: d.endInfo,
        insights: d.insights,
      };
      // A finished room was already settled before the restart — just drop its row.
      if (room.finished) {
        deleteRoomRow(room.code);
        continue;
      }
      rooms.set(room.code, room);
      roomByUser.set(room.host.userId, room.code);
      if (room.guest) roomByUser.set(room.guest.userId, room.code);
      rearmOnRestore(room);
      console.log('恢复对局', room.code);
    } catch (err) {
      console.error('恢复失败，作废退款', row.code, err);
      await voidRoomRow(row.code, d);
    }
  }
  // Let any settlement kicked off by recovery itself land first, or its cleared stake
  // wouldn't be visible yet and the scan below would refund it a second time.
  await Promise.allSettled([...inFlightSettlements]);
  await refundOrphans();
}

// Re-arm timers for a restored room. Both seats are "disconnected" until their clients
// reconnect, so both get a forfeit clock (reconnect clears it — same as a live drop). The
// decision timer resumes from the STORED deadline, not a fresh 45s.
function rearmOnRestore(room: Room) {
  (['host', 'guest'] as RoleKey[]).forEach((role) => {
    const seat = role === 'host' ? room.host : room.guest;
    if (seat) room.forfeitTimers[role] = setTimeout(() => forfeit(io, room, role), FORFEIT_MS);
  });
  const state = room.state;
  if (!state || room.finished) return;
  if (state.phase === 'first-play' || state.phase === 'second-play' || state.phase === 'betting') {
    const remaining = (room.deadline ?? Date.now()) - Date.now();
    if (remaining <= 0) {
      // The turn timed out during the downtime — resolve it now.
      dispatchAndAdvance(io, room, defaultActionFor(state));
      return;
    }
    room.decisionTimer = setTimeout(() => {
      if (room.state && !room.finished) dispatchAndAdvance(io, room, defaultActionFor(room.state));
    }, remaining);
  } else if (state.phase === 'reveal') {
    room.advanceTimer = setTimeout(() => dispatchAndAdvance(io, room, { type: 'REVEAL_DONE' }), REVEAL_MS);
  } else if (state.phase === 'round-end') {
    room.advanceTimer = setTimeout(() => dispatchAndAdvance(io, room, { type: 'NEXT_ROUND' }), INTERMISSION_MS);
  } else if (state.phase === 'set-end') {
    room.advanceTimer = setTimeout(() => dispatchAndAdvance(io, room, { type: 'NEXT_SET' }), INTERMISSION_MS);
  }
}

// An unrestorable room: hand both players their buy-in back and drop the row.
async function voidRoomRow(code: string, d: ReturnType<typeof serializeRoom> | null) {
  const buyIn = d?.buyIn ?? 0;
  const seats = [d?.host, d?.guest].filter(Boolean) as { userId: string }[];
  for (const seat of seats) {
    // Gated on pvpStake still being set, so a room that was actually settled before the
    // restart (or is voided twice for any reason) can't pay the buy-in out again.
    const res = await prisma.user
      .updateMany({ where: { id: seat.userId, pvpStake: { not: null } }, data: { chips: buyIn > 0 ? { increment: buyIn } : undefined, pvpStake: null } })
      .catch((err) => {
        console.error('作废退款失败', seat.userId, err);
        return { count: 0 };
      });
    if (res.count > 0) await queueNotice(seat.userId, buyIn);
  }
  deleteRoomRow(code);
}

// Leave word for a player who was offline when their match was voided, so their next
// connect explains it instead of silently dropping them at an empty lobby.
async function queueNotice(userId: string, refund: number) {
  await prisma.pvpNotice
    .upsert({
      where: { userId },
      create: { userId, kind: 'voided', refund },
      update: { kind: 'voided', refund },
    })
    .catch((err) => console.error('回执写入失败', userId, err));
}

// The final safety net: any stake still marked on an account that DIDN'T end up in a
// restored live room is a true orphan — refund it. (Restored players keep their stake.)
async function refundOrphans() {
  try {
    const staked = await prisma.user.findMany({ where: { pvpStake: { not: null } }, select: { id: true, pvpStake: true } });
    for (const u of staked) {
      if (roomByUser.has(u.id)) continue; // seated in a restored match — legitimate
      // Conditional on pvpStake STILL being set: an unconditional increment would pay a
      // second time if anything else cleared the stake between the read and this write.
      const res = await prisma.user
        .updateMany({ where: { id: u.id, pvpStake: { not: null } }, data: { chips: { increment: u.pvpStake! }, pvpStake: null } })
        .catch(() => ({ count: 0 }));
      if (res.count === 0) continue; // someone else settled it — not an orphan after all
      await queueNotice(u.id, u.pvpStake!);
      console.log('退还孤儿买入', u.id, u.pvpStake);
    }
  } catch (err) {
    console.error('孤儿退款扫描失败', err);
  }
}

// ————————————————————————— server —————————————————————————

const io = new Server(PORT, {
  cors: { origin: ALLOWED_ORIGIN || true, credentials: true },
});

io.use((socket, next) => {
  const ticket = socket.handshake.auth?.ticket;
  const identity = typeof ticket === 'string' ? verifyTicket(ticket, AUTH_SECRET) : null;
  if (!identity) return next(new Error('入场券无效或已过期'));
  socket.data.userId = identity.userId;
  socket.data.name = identity.name;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  const name = socket.data.name as string;

  // Deliver any word left for this player while they were away (a voided match), then
  // clear it. Fire-and-forget: a failure here must never block getting them to the table.
  prisma.pvpNotice
    .findUnique({ where: { userId } })
    .then((notice) => {
      if (!notice) return;
      socket.emit('notice', { kind: notice.kind, refund: notice.refund });
      return prisma.pvpNotice.delete({ where: { userId } }).then(() => undefined);
    })
    .catch(() => {});

  // Reconnect into a live match if one exists.
  const existingCode = roomByUser.get(userId);
  if (existingCode) {
    const room = rooms.get(existingCode);
    if (room && room.state && !room.finished) {
      const role = roleOf(room, userId)!;
      const seat = role === 'host' ? room.host : room.guest!;
      seat.socketId = socket.id;
      const ft = room.forfeitTimers[role];
      if (ft) {
        clearTimeout(ft);
        delete room.forfeitTimers[role];
      }
      broadcastViews(io, room);
    } else if (room && !room.state) {
      // Stale waiting room from a previous session — clear it.
      destroyRoom(room);
    }
  }

  socket.on('create-room', async (payload, cb) => {
    try {
      const tierKey = payload?.tierKey as TierKey;
      if (!TIERS[tierKey]) return cb?.({ error: '未知档位' });
      const active = roomByUser.get(userId) && rooms.get(roomByUser.get(userId)!);
      if (active && active.state && !active.finished) return cb?.({ error: '你已有进行中的对局' });
      if (active) destroyRoom(active);

      const buyIn = TIERS[tierKey].buyIn;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { chips: true } });
      if (!user || user.chips < buyIn) return cb?.({ error: `筹码不足 — 该档位需要全额买入 ${buyIn}` });

      const room: Room = {
        code: newCode(),
        tierKey,
        buyIn,
        host: { userId, name, socketId: socket.id },
        guest: null,
        state: null,
        decisionTimer: null,
        advanceTimer: null,
        forfeitTimers: {},
        deadline: null,
        finished: false,
        endInfo: {},
        insights: {},
      };
      rooms.set(room.code, room);
      roomByUser.set(userId, room.code);
      cb?.({ code: room.code });
    } catch (err) {
      console.error('create-room', err);
      cb?.({ error: '创建房间失败' });
    }
  });

  // "Is my room still here?" — a client sitting in the waiting screen asks this after a
  // reconnect. A waiting room holds no stake so it isn't persisted, which means a server
  // restart silently erases it; without this the host waits forever at a dead code.
  socket.on('room-alive', (payload, cb) => {
    const code = String(payload?.code ?? '').toUpperCase().trim();
    const room = rooms.get(code);
    cb?.({ alive: !!room && roleOf(room, userId) !== null });
  });

  socket.on('cancel-room', (cb) => {
    const code = roomByUser.get(userId);
    const room = code ? rooms.get(code) : null;
    if (room && !room.state) destroyRoom(room);
    cb?.({ ok: true });
  });

  socket.on('join-room', async (payload, cb) => {
    try {
      const code = String(payload?.code ?? '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.finished) return cb?.({ error: '房间不存在或已结束' });
      if (room.state) return cb?.({ error: '这桌已经开打了' });
      if (room.host.userId === userId) return cb?.({ error: '不能加入自己的房间' });

      dequeue(userId); // taking a seat by code leaves the quick-match line
      const seated = await seatGuest(room, { userId, name, socketId: socket.id });
      if (seated.error) return cb?.({ error: seated.error });

      cb?.({ ok: true });
      // The host has been staring at a waiting screen — tell them who just sat down so
      // they get the same seating plate the quick-match flow shows.
      if (room.host.socketId) io.to(room.host.socketId).emit('matched', { oppName: name });
      // Kick off the first decision timer and deal opening views.
      armTimers(io, room);
    } catch (err) {
      console.error('join-room', err);
      cb?.({ error: '加入房间失败' });
    }
  });

  // ————————————————————————— Quick match —————————————————————————
  // One waiting line per buy-in tier. Discrete tiers are the whole point: a free-form
  // "bring what you like" amount would shatter the pool into singletons and nobody would
  // ever match, since a zero-sum table requires both seats to post the SAME stake.
  socket.on('quick-match', async (payload, cb) => {
    try {
      const tierKey = payload?.tierKey as TierKey;
      if (!TIERS[tierKey]) return cb?.({ error: '未知档位' });

      const activeCode = roomByUser.get(userId);
      const active = activeCode ? rooms.get(activeCode) : null;
      if (active && active.state && !active.finished) return cb?.({ error: '你已有进行中的对局' });
      if (active) destroyRoom(active);
      dequeue(userId); // re-queuing at a different tier must not leave a ghost behind

      const buyIn = TIERS[tierKey].buyIn;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { chips: true } });
      if (!user || user.chips < buyIn) return cb?.({ error: `筹码不足 — 该档位需要全额买入 ${buyIn}` });

      // Pull the longest-waiting live opponent off this tier's line.
      const line = queues.get(tierKey) ?? [];
      let opp: Waiting | null = null;
      while (line.length) {
        const cand = line.shift()!;
        queuedUsers.delete(cand.userId);
        if (cand.userId === userId) continue;
        if (!io.sockets.sockets.has(cand.socketId)) continue; // left without telling us
        opp = cand;
        break;
      }
      queues.set(tierKey, line);

      if (!opp) {
        line.push({ userId, name, socketId: socket.id, since: Date.now() });
        queuedUsers.set(userId, tierKey);
        return cb?.({ queued: true });
      }

      // The one who waited longer gets the host seat — they posted first.
      const room: Room = {
        code: newCode(),
        tierKey,
        buyIn,
        host: { userId: opp.userId, name: opp.name, socketId: opp.socketId },
        guest: null,
        state: null,
        decisionTimer: null,
        advanceTimer: null,
        forfeitTimers: {},
        deadline: null,
        finished: false,
        endInfo: {},
        insights: {},
      };
      rooms.set(room.code, room);
      roomByUser.set(opp.userId, room.code);

      const seated = await seatGuest(room, { userId, name, socketId: socket.id });
      if (seated.error) {
        destroyRoom(room);
        // The waiter did nothing wrong — put them back at the head of their line rather
        // than dropping them silently back to the lobby.
        line.unshift(opp);
        queues.set(tierKey, line);
        queuedUsers.set(opp.userId, tierKey);
        return cb?.({ error: seated.error });
      }

      cb?.({ matched: true, oppName: opp.name });
      io.to(opp.socketId).emit('matched', { oppName: name });
      armTimers(io, room);
    } catch (err) {
      console.error('quick-match', err);
      cb?.({ error: '匹配失败' });
    }
  });

  // `wasQueued` is the client's proof that it is safe to fall back to the house AI. Read
  // and cleared in one synchronous step, so it can't disagree with quick-match: if we were
  // still in line, nobody matched us; if we weren't, a room already holds our buy-in and
  // walking off to play the AI would abandon (and forfeit) real money.
  socket.on('cancel-quick', (cb) => {
    const wasQueued = queuedUsers.has(userId);
    dequeue(userId);
    cb?.({ ok: true, wasQueued });
  });

  socket.on('act', (action: PvpAction) => {
    const code = roomByUser.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room || !room.state || room.finished) return;
    const role = roleOf(room, userId);
    if (!role) return;
    const state = room.state;
    const actor = currentActor(state);
    if (!actor || actor !== engineSideOf(role)) return; // not your turn

    const hand = actor === 'player' ? state.playerHand : state.opponentHand;
    if (action.kind === 'first-play' && state.phase === 'first-play') {
      if (!hand.includes(action.card)) return;
      const bet = Math.min(5, Math.max(1, Math.round(action.bet)));
      dispatchAndAdvance(io, room, { type: 'FIRST_PLAY', card: action.card, bet });
    } else if (action.kind === 'second-play' && state.phase === 'second-play') {
      if (!hand.includes(action.card)) return;
      dispatchAndAdvance(io, room, { type: 'SECOND_PLAY', card: action.card, action: action.action });
    } else if (action.kind === 'bet-response' && state.phase === 'betting') {
      dispatchAndAdvance(io, room, { type: 'BET_RESPONSE', action: action.action });
    }
  });

  // Emotes: relayed straight to the opponent, never persisted. They carry no game
  // state — which is the point. A taunt with nothing behind it is still a taunt.
  socket.on('emote', (name: string) => {
    if (!EMOTES.has(name)) return;
    const code = roomByUser.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room || !room.state || room.finished || !room.guest) return;
    const role = roleOf(room, userId);
    if (!role) return;

    const seat = role === 'host' ? room.host : room.guest;
    const now = Date.now();
    if (now - (seat.lastEmote ?? 0) < EMOTE_COOLDOWN_MS) return;
    seat.lastEmote = now;

    const opp = role === 'host' ? room.guest : room.host;
    if (opp.socketId) io.to(opp.socketId).emit('opponent-emote', name);
  });

  socket.on('insight', async (cb) => {
    try {
      const code = roomByUser.get(userId);
      const room = code ? rooms.get(code) : null;
      if (!room || !room.state || room.finished || !room.guest) return cb?.({ error: '不在对局中' });
      const role = roleOf(room, userId)!;
      if (room.insights[role]) return cb?.({ ok: true }); // already bought — the view carries it

      // Paid from the ACCOUNT, atomically — the table stack is untouched.
      const cost = insightCostOf(room);
      const paid = await prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId }, select: { chips: true } });
        if (!u || u.chips < cost) return false;
        await tx.user.update({ where: { id: userId }, data: { chips: { decrement: cost } } });
        return true;
      });
      if (!paid) return cb?.({ error: `账户余额不足 — 读心需要 ${cost}（买入的 20%）` });

      // Both sides at once, so the intel survives the mid-match side switch.
      const opp = role === 'host' ? room.guest : room.host;
      const stats = await prisma.cardPlayStat.findMany({ where: { userId: opp.userId } });
      const buildRows = (roleEnum: 'EMPEROR' | 'SLAVE') =>
        [1, 2, 3, 4, 5].map((round) => {
          const rs = stats.filter((s) => s.role === roleEnum && s.round === round);
          const total = rs.reduce((sum, r) => sum + r.count, 0);
          const key = rs.find((r) => r.cardKind === roleEnum)?.count ?? 0;
          return { round, plays: total, keyCardPlays: key, rate: total > 0 ? key / total : null };
        });
      room.insights[role] = {
        oppName: opp.name,
        emperor: buildRows('EMPEROR'),
        slave: buildRows('SLAVE'),
        cost,
      };
      // Both players learn something: the buyer gets the dossier, the target's
      // next view shows the buyer's eyes burning red.
      persistRoom(room); // a purchased read-mind must survive a restart too
      broadcastViews(io, room);
      cb?.({ ok: true });
    } catch (err) {
      console.error('insight', err);
      cb?.({ error: '读心失败' });
    }
  });

  socket.on('disconnect', () => {
    // Leave the waiting line first, and unconditionally: a stale entry would hand the
    // next arrival a dead socket to be matched against.
    dequeue(userId);

    const code = roomByUser.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room) return;
    const role = roleOf(room, userId);
    if (!role) return;
    const seat = role === 'host' ? room.host : room.guest;
    if (!seat || seat.socketId !== socket.id) return; // an older socket of a reconnected user

    seat.socketId = null;
    if (!room.state) {
      // Waiting room with no opponent — just tear it down.
      destroyRoom(room);
      return;
    }
    if (room.finished) return;
    broadcastViews(io, room);
    room.forfeitTimers[role] = setTimeout(() => forfeit(io, room, role), FORFEIT_MS);
  });
});

console.log(`Regicide PvP server listening on :${PORT}`);

// Rebuild any matches interrupted by the last restart. Runs once at boot; connections
// that arrive meanwhile find their room already restored (or already refunded).
bootRecover()
  .then(() => console.log('对局恢复扫描完成'))
  .catch((err) => console.error('对局恢复扫描出错', err));
