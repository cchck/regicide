import { BetAction, CardType, Side } from './types';

// ————— Wire protocol between the PvP client and the Socket.IO server —————
// The server is authoritative: clients only ever see their own hand, and the
// opponent's played card stays hidden until the reveal.

export type TurnKind = 'first-play' | 'second-play' | 'bet-response' | 'none';

export interface PvpView {
  roomCode: string;
  tierKey: 'flicker' | 'pact' | 'regicide';
  buyIn: number;
  phase: string; // engine phase name
  roundNumber: number;
  /** Card ordinal 1..5 for the round banner — folds replay a slot, so this ≠ roundNumber. */
  displayRound: number;
  mySide: Side;
  myHand: CardType[];
  oppHandCount: number;
  myChips: number;
  oppChips: number;
  pot: number;
  multiplier: number;
  myTurn: boolean;
  turnKind: TurnKind;
  iHaveInitiative: boolean;
  /** Epoch ms deadline for the current actor's decision, null when no timer runs. */
  deadline: number | null;
  myPlayed: CardType | null;
  /** Opponent's card once revealed; null while hidden. */
  oppPlayed: CardType | null;
  oppPlayedPresent: boolean;
  revealed: boolean;
  message: string;
  mySetsWon: number;
  oppSetsWon: number;
  lastResult: {
    iWon: boolean;
    oppWon: boolean;
    folded: boolean;
    foldedByMe: boolean;
    regicide: boolean;
  } | null;
  oppName: string;
  oppConnected: boolean;
  matchEnd: {
    iWon: boolean;
    reason: 'sets' | 'bankrupt' | 'forfeit';
    finalChips: number;
  } | null;
  insightCost: number;
  /** My purchased intel about the opponent — persists for the whole match. */
  insight: InsightData | null;
  /** The opponent has read MY mind: their figure's eyes burn red in my view. */
  oppHasReadMe: boolean;
}

// Client → server actions
export type PvpAction =
  | { kind: 'first-play'; card: CardType; bet: number }
  | { kind: 'second-play'; card: CardType; action: BetAction }
  | { kind: 'bet-response'; action: BetAction };

export interface InsightRow {
  round: number;
  plays: number;
  keyCardPlays: number;
  rate: number | null;
}

// Bought once per match; covers BOTH sides so it stays valid after the set switch.
export interface InsightData {
  oppName: string;
  emperor: InsightRow[];
  slave: InsightRow[];
  cost: number;
}
