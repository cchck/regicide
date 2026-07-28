import { CardType, BetAction, GameState } from './types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getKeyCard(hand: CardType[]): CardType | null {
  if (hand.includes('emperor')) return 'emperor';
  if (hand.includes('slave')) return 'slave';
  return null;
}

// AI selects a card to play
export function aiSelectCard(state: GameState): CardType {
  const hand = state.opponentHand;
  const key = getKeyCard(hand);
  const roundsLeft = hand.length;

  if (state.aiDifficulty === 'easy') return pickRandom(hand);

  if (!key) return 'citizen';
  if (roundsLeft === 1) return hand[0];

  const isEmperorSide = state.playerSide === 'slave'; // opponent is emperor side
  const scoreDiff = state.opponentSetScore - state.playerSetScore;

  if (state.aiDifficulty === 'normal') {
    if (roundsLeft <= 2) return Math.random() < 0.5 ? key : 'citizen';
    return Math.random() < 0.25 ? key : 'citizen';
  }

  // Hard difficulty
  if (isEmperorSide) {
    // AI is emperor — play emperor when likely safe
    if (roundsLeft <= 2 || scoreDiff > 2) return key;
    return Math.random() < 0.3 ? key : 'citizen';
  } else {
    // AI is slave — snipe emperor late
    if (roundsLeft <= 2 || scoreDiff < -3) return key;
    return Math.random() < 0.15 ? key : 'citizen';
  }
}

// AI sets opening bet when it has initiative
export function aiSetOpeningBet(state: GameState, aiCard: CardType): number {
  const isKey = aiCard === 'emperor' || aiCard === 'slave';

  switch (state.aiPersonality) {
    case 'aggressive':
      if (isKey) return Math.random() < 0.5 ? 2 : 3;
      return Math.random() < 0.4 ? 2 : 1; // bluff with citizens too
    case 'cautious':
      if (isKey) return Math.random() < 0.3 ? 2 : 1;
      return 1;
    case 'deceptive':
      // Reverse psychology: low bet with key, high bet with citizen
      if (isKey) return 1;
      return Math.random() < 0.5 ? 2 : 1;
    default:
      return 1;
  }
}

// AI responds to opponent's opening bet (second player)
export function aiRespondToBet(
  state: GameState,
  aiCard: CardType,
): { card: CardType; action: BetAction } {
  const card = aiCard;
  const isKey = card === 'emperor' || card === 'slave';
  const opponentBet = state.multiplier;

  switch (state.aiPersonality) {
    case 'aggressive': {
      if (isKey) {
        if (card === 'slave') {
          // Slave — want opponent to stay, be cautious with raises
          return { card, action: opponentBet >= 3 ? 'call' : (Math.random() < 0.5 ? 'raise' : 'call') };
        }
        // Emperor — raise to scare
        return { card, action: opponentBet >= 3 ? 'call' : 'raise' };
      }
      // Citizen — bluff raise sometimes
      if (opponentBet >= 3) return { card, action: Math.random() < 0.4 ? 'fold' : 'call' };
      return { card, action: Math.random() < 0.4 ? 'raise' : 'call' };
    }
    case 'cautious': {
      if (isKey) {
        return { card, action: opponentBet >= 2 ? 'call' : (Math.random() < 0.3 ? 'raise' : 'call') };
      }
      if (opponentBet >= 2) return { card, action: Math.random() < 0.3 ? 'fold' : 'call' };
      return { card, action: 'call' };
    }
    case 'deceptive': {
      if (isKey) {
        // Slow-play: just call even with key card
        return { card, action: 'call' };
      }
      // Bluff hard with citizens
      if (opponentBet >= 3) return { card, action: Math.random() < 0.5 ? 'fold' : 'call' };
      return { card, action: Math.random() < 0.5 ? 'raise' : 'call' };
    }
    default:
      return { card, action: 'call' };
  }
}

// AI responds during continued betting loop
export function aiBetResponse(state: GameState, aiCard: CardType): BetAction {
  const isKey = aiCard === 'emperor' || aiCard === 'slave';

  switch (state.aiPersonality) {
    case 'aggressive':
      if (isKey) return state.multiplier >= 4 ? 'call' : 'raise';
      if (state.multiplier >= 3) return Math.random() < 0.5 ? 'fold' : 'call';
      return Math.random() < 0.3 ? 'raise' : 'call';
    case 'cautious':
      if (isKey) return state.multiplier >= 3 ? 'call' : (Math.random() < 0.4 ? 'raise' : 'call');
      if (state.multiplier >= 2) return Math.random() < 0.4 ? 'fold' : 'call';
      return 'call';
    case 'deceptive':
      if (isKey) return 'call'; // always slow-play
      if (state.multiplier >= 4) return Math.random() < 0.6 ? 'fold' : 'call';
      return Math.random() < 0.4 ? 'raise' : 'call';
    default:
      return 'call';
  }
}
