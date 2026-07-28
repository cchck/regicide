export type CardType = 'emperor' | 'citizen' | 'slave';
export type Side = 'emperor' | 'slave';
export type BetAction = 'call' | 'raise' | 'fold';

// Chip economy — real pot-based stakes rather than an abstract score multiplier.
// Persists across the whole match (and, later, across matches for a leaderboard).
export const STARTING_CHIPS = 200;
export const ANTE = 5; // paid by both sides at the start of every round — folding is never free
export const BET_UNIT = 10; // 1 "level" in the existing ×1-×5 bet UI = this many chips
export const RAISE_INCREMENT = 10; // chips added on top when raising
export const REGICIDE_MULTIPLIER = 5; // slave-kills-emperor pays out this many times the pot

export type GamePhase =
  | 'menu'
  | 'first-play'     // Initiative player: select card + set opening bet
  | 'second-play'    // Other player: sees bet, selects card + responds
  | 'betting'        // Continued raise loop
  | 'reveal'
  | 'round-end'
  | 'set-end'
  | 'match-end';

export interface RoundResult {
  playerCard: CardType;
  opponentCard: CardType;
  multiplier: number;
  pot: number;
  // Net chip change this round — zero-sum, one positive and the other its negation.
  playerScored: number;
  opponentScored: number;
  folded: 'player' | 'opponent' | null;
  keyCardPlayed: boolean;
}

export interface SetResult {
  playerScore: number;
  opponentScore: number;
  playerSide: Side;
  rounds: RoundResult[];
  winner: 'player' | 'opponent' | 'draw';
}

export interface GameState {
  phase: GamePhase;

  // Match (Bo7)
  playerSetsWon: number;
  opponentSetsWon: number;
  setHistory: SetResult[];

  // Current set
  playerSide: Side;
  roundNumber: number;
  playerHand: CardType[];
  opponentHand: CardType[];
  playerSetScore: number;
  opponentSetScore: number;
  roundHistory: RoundResult[];

  // Persistent chip bankroll — carries across sets within the match
  playerChips: number;
  opponentChips: number;

  // How many times each side has folded THIS set. Fold penalty scales with this so
  // folding gets progressively more expensive — the release valve is calling. Reset
  // at every set change.
  playerFoldsThisSet: number;
  opponentFoldsThisSet: number;

  // Current round
  initiative: 'player' | 'opponent';
  playerSelectedCard: CardType | null;
  opponentSelectedCard: CardType | null;
  multiplier: number;
  bettingTurn: 'player' | 'opponent';
  // Chips each side has pledged into this round's pot so far
  playerContribution: number;
  opponentContribution: number;

  // AI
  aiDifficulty: 'easy' | 'normal' | 'hard';
  aiPersonality: 'aggressive' | 'cautious' | 'deceptive';

  // UI
  message: string;
}

export function createInitialHand(side: Side): CardType[] {
  const key: CardType = side === 'emperor' ? 'emperor' : 'slave';
  return [key, 'citizen', 'citizen', 'citizen', 'citizen'];
}

export function resolveCards(
  a: CardType,
  b: CardType
): { winner: 'a' | 'b' | 'draw'; baseScore: number } {
  if (a === b) return { winner: 'draw', baseScore: 0 };
  if (a === 'emperor' && b === 'citizen') return { winner: 'a', baseScore: 1 };
  if (a === 'citizen' && b === 'emperor') return { winner: 'b', baseScore: 1 };
  if (a === 'citizen' && b === 'slave') return { winner: 'a', baseScore: 1 };
  if (a === 'slave' && b === 'citizen') return { winner: 'b', baseScore: 1 };
  if (a === 'slave' && b === 'emperor') return { winner: 'a', baseScore: 5 };
  if (a === 'emperor' && b === 'slave') return { winner: 'b', baseScore: 5 };
  return { winner: 'draw', baseScore: 0 };
}

export function isKeyCard(card: CardType): boolean {
  return card === 'emperor' || card === 'slave';
}
