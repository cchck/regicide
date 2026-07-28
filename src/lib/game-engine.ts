import {
  GameState,
  CardType,
  Side,
  BetAction,
  RoundResult,
  SetResult,
  createInitialHand,
  resolveCards,
  isKeyCard,
  STARTING_CHIPS,
  ANTE,
  BET_UNIT,
  RAISE_INCREMENT,
  REGICIDE_MULTIPLIER,
} from './types';

export type GameAction =
  | { type: 'START_GAME'; difficulty: GameState['aiDifficulty']; personality: GameState['aiPersonality']; buyIn?: number; side?: Side }
  // Rehydrate a snapshot (crash/refresh recovery). The state was produced by this same
  // reducer, so it re-enters wholesale — no per-field fixup.
  | { type: 'RESTORE'; state: GameState }
  | { type: 'FIRST_PLAY'; card: CardType; bet: number }
  | { type: 'SECOND_PLAY'; card: CardType; action: BetAction }
  | { type: 'BET_RESPONSE'; action: BetAction }
  | { type: 'REVEAL_DONE' }
  | { type: 'NEXT_ROUND' }
  | { type: 'NEXT_SET' }
  | { type: 'BACK_TO_MENU' };

export const initialState: GameState = {
  phase: 'menu',
  playerSetsWon: 0,
  opponentSetsWon: 0,
  setHistory: [],
  playerSide: 'emperor',
  roundNumber: 1,
  playerHand: [],
  opponentHand: [],
  playerSetScore: 0,
  opponentSetScore: 0,
  roundHistory: [],
  playerChips: STARTING_CHIPS,
  opponentChips: STARTING_CHIPS,
  playerFoldsThisSet: 0,
  opponentFoldsThisSet: 0,
  initiative: 'player',
  playerSelectedCard: null,
  opponentSelectedCard: null,
  multiplier: 1,
  bettingTurn: 'player',
  playerContribution: 0,
  opponentContribution: 0,
  aiDifficulty: 'normal',
  aiPersonality: 'cautious',
  message: '',
};

function removeCard(hand: CardType[], card: CardType): CardType[] {
  const idx = hand.indexOf(card);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function getOpponentSide(side: Side): Side {
  return side === 'emperor' ? 'slave' : 'emperor';
}

function getInitiative(roundNumber: number): 'player' | 'opponent' {
  return roundNumber % 2 === 1 ? 'player' : 'opponent';
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      // A forced side is used by the tutorial's scripted scenes.
      const startSide: Side = action.side ?? (Math.random() < 0.5 ? 'emperor' : 'slave');
      const init = getInitiative(1);
      return {
        ...initialState,
        phase: 'first-play',
        playerSide: startSide,
        playerHand: createInitialHand(startSide),
        opponentHand: createInitialHand(getOpponentSide(startSide)),
        initiative: init,
        // Both sides sit down with the same regulated buy-in (table stakes).
        playerChips: action.buyIn ?? STARTING_CHIPS,
        opponentChips: action.buyIn ?? STARTING_CHIPS,
        playerFoldsThisSet: 0,
        opponentFoldsThisSet: 0,
        playerContribution: ANTE,
        opponentContribution: ANTE,
        aiDifficulty: action.difficulty,
        aiPersonality: action.personality,
        message: init === 'player'
          ? '你的先手 — 选牌并下注'
          : '对手先手 — 等待对手出牌...',
      };
    }

    // Initiative player places card + sets opening bet
    case 'FIRST_PLAY': {
      if (state.phase !== 'first-play') return state;

      const isPlayerFirst = state.initiative === 'player';
      const betChips = action.bet * BET_UNIT;

      if (isPlayerFirst) {
        return {
          ...state,
          phase: 'second-play',
          playerSelectedCard: action.card,
          playerContribution: state.playerContribution + betChips,
          multiplier: action.bet,
          message: `你下注 ×${action.bet}（${state.playerContribution + betChips} 筹码）— 等待对手回应`,
        };
      } else {
        return {
          ...state,
          phase: 'second-play',
          opponentSelectedCard: action.card,
          opponentContribution: state.opponentContribution + betChips,
          multiplier: action.bet,
          message: `对手出牌并下注 ×${action.bet} — 选牌回应`,
        };
      }
    }

    // Second player places card + responds to bet
    case 'SECOND_PLAY': {
      if (state.phase !== 'second-play') return state;

      const isPlayerSecond = state.initiative === 'opponent';

      let newState: GameState;
      if (isPlayerSecond) {
        newState = { ...state, playerSelectedCard: action.card };
      } else {
        newState = { ...state, opponentSelectedCard: action.card };
      }

      if (action.action === 'fold') {
        const folded = isPlayerSecond ? 'player' : 'opponent';
        const result = makeFoldResult(newState, folded);
        return applyRoundResult(newState, result);
      }

      if (action.action === 'raise') {
        const askAmount = isPlayerSecond ? newState.opponentContribution : newState.playerContribution;
        const raised = askAmount + RAISE_INCREMENT;
        return {
          ...newState,
          ...(isPlayerSecond ? { playerContribution: raised } : { opponentContribution: raised }),
          phase: 'betting',
          multiplier: newState.multiplier + 1,
          bettingTurn: state.initiative,
          message: isPlayerSecond
            ? `你加注 — 底池 ${raised + askAmount} 筹码`
            : `对手加注 — 底池 ${raised + askAmount} 筹码`,
        };
      }

      // call — match the other side's contribution exactly, then reveal
      const matched = isPlayerSecond ? newState.opponentContribution : newState.playerContribution;
      return {
        ...newState,
        ...(isPlayerSecond ? { playerContribution: matched } : { opponentContribution: matched }),
        phase: 'reveal',
        message: '亮牌 ——',
      };
    }

    // Continued betting (raise loop)
    case 'BET_RESPONSE': {
      if (state.phase !== 'betting') return state;

      const act = action.action;
      const isPlayerTurn = state.bettingTurn === 'player';

      if (act === 'fold') {
        const folded = isPlayerTurn ? 'player' : 'opponent';
        const result = makeFoldResult(state, folded);
        return applyRoundResult(state, result);
      }

      if (act === 'raise') {
        const askAmount = isPlayerTurn ? state.opponentContribution : state.playerContribution;
        const raised = askAmount + RAISE_INCREMENT;
        return {
          ...state,
          ...(isPlayerTurn ? { playerContribution: raised } : { opponentContribution: raised }),
          multiplier: state.multiplier + 1,
          bettingTurn: isPlayerTurn ? 'opponent' : 'player',
          message: isPlayerTurn
            ? `你加注 — 底池 ${raised + askAmount} 筹码`
            : `对手加注 — 底池 ${raised + askAmount} 筹码`,
        };
      }

      // call — match, then reveal
      const matched = isPlayerTurn ? state.opponentContribution : state.playerContribution;
      return {
        ...state,
        ...(isPlayerTurn ? { playerContribution: matched } : { opponentContribution: matched }),
        phase: 'reveal',
        message: isPlayerTurn ? '你跟注 — 亮牌' : '对手跟注 — 亮牌',
      };
    }

    case 'REVEAL_DONE': {
      if (state.phase !== 'reveal') return state;
      const pCard = state.playerSelectedCard!;
      const oCard = state.opponentSelectedCard!;
      const { winner } = resolveCards(pCard, oCard);
      const keyPlayed = isKeyCard(pCard) || isKeyCard(oCard);
      const isRegicide =
        (pCard === 'slave' && oCard === 'emperor') || (pCard === 'emperor' && oCard === 'slave');

      // Contributions are equal by construction — reaching reveal only happens via a call.
      const c = state.playerContribution;
      const pot = state.playerContribution + state.opponentContribution;

      let playerNet = 0;
      if (winner === 'a') {
        const rawGain = c + regicideBonus(isRegicide, c, state.opponentChips - c);
        playerNet = Math.min(rawGain, state.opponentChips); // can never take more than the loser actually has
      } else if (winner === 'b') {
        const rawGain = c + regicideBonus(isRegicide, c, state.playerChips - c);
        playerNet = -Math.min(rawGain, state.playerChips);
      }

      const result: RoundResult = {
        playerCard: pCard,
        opponentCard: oCard,
        multiplier: state.multiplier,
        pot,
        playerScored: playerNet,
        opponentScored: -playerNet,
        folded: null,
        keyCardPlayed: keyPlayed,
      };

      return applyRoundResult(state, result);
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'round-end') return state;

      // Check if set should end (no cards left OR key card was played)
      const lastRound = state.roundHistory[state.roundHistory.length - 1];
      if (state.playerHand.length === 0 || lastRound?.keyCardPlayed) {
        return resolveSet(state);
      }

      const newInit = getInitiative(state.roundNumber);
      // The announced ordinal is the card slot (1..5), not the raw round counter —
      // a fold replays the same slot, so after one the banner must repeat, not advance.
      const ordinal = Math.min(state.roundHistory.filter((r) => !r.folded).length + 1, 5);
      return {
        ...state,
        phase: 'first-play',
        playerSelectedCard: null,
        opponentSelectedCard: null,
        multiplier: 1,
        playerContribution: ANTE,
        opponentContribution: ANTE,
        initiative: newInit,
        message: newInit === 'player'
          ? `第 ${ordinal} 回合 — 你的先手，选牌并下注`
          : `第 ${ordinal} 回合 — 对手先手`,
      };
    }

    case 'NEXT_SET': {
      if (state.phase !== 'set-end') return state;
      if (state.playerSetsWon >= 4 || state.opponentSetsWon >= 4) {
        return {
          ...state,
          phase: 'match-end',
          message: state.playerSetsWon >= 4 ? '你赢得了整场比赛！' : '比赛结束 — 你输了。',
        };
      }
      const newSide = getOpponentSide(state.playerSide);
      const newInit = getInitiative(1);
      return {
        ...state,
        phase: 'first-play',
        playerSide: newSide,
        roundNumber: 1,
        playerHand: createInitialHand(newSide),
        opponentHand: createInitialHand(getOpponentSide(newSide)),
        playerSetScore: 0,
        opponentSetScore: 0,
        roundHistory: [],
        playerSelectedCard: null,
        opponentSelectedCard: null,
        multiplier: 1,
        playerContribution: ANTE,
        opponentContribution: ANTE,
        // Fold penalties escalate WITHIN a set; a new set resets that ratchet.
        playerFoldsThisSet: 0,
        opponentFoldsThisSet: 0,
        initiative: newInit,
        message: newSide === 'emperor'
          ? '换边 — 你现在是皇帝方'
          : '换边 — 你现在是奴隶方',
      };
    }

    case 'RESTORE':
      return action.state;

    case 'BACK_TO_MENU':
      return { ...initialState };

    default:
      return state;
  }
}

// Extra payout on top of the base pot when the slave kills the emperor,
// capped so the loser's chip stack never goes negative.
function regicideBonus(isRegicide: boolean, baseContribution: number, loserRemainingAfterBase: number): number {
  if (!isRegicide) return 0;
  const bonusRaw = baseContribution * (REGICIDE_MULTIPLIER - 1);
  return Math.min(bonusRaw, Math.max(0, loserRemainingAfterBase));
}

function makeFoldResult(state: GameState, folded: 'player' | 'opponent'): RoundResult {
  const folderContribution = folded === 'player' ? state.playerContribution : state.opponentContribution;
  const folderChips = folded === 'player' ? state.playerChips : state.opponentChips;
  // Escalating penalty: the Nth fold in a set costs at least N × ANTE, so a folder
  // who keeps ducking out ends up paying real chips even without any raises on the
  // table. Whichever is bigger applies — if they already raised past the penalty,
  // that self-inflicted cost stands; the penalty only kicks in for cheap folds.
  const priorFolds = folded === 'player' ? state.playerFoldsThisSet : state.opponentFoldsThisSet;
  const penalty = (priorFolds + 1) * ANTE;
  const targetLoss = Math.max(folderContribution, penalty);
  const actualLoss = Math.min(targetLoss, folderChips); // never take more than the folder actually has
  const pot = state.playerContribution + state.opponentContribution;
  const playerNet = folded === 'player' ? -actualLoss : actualLoss;
  return {
    // Cards are NOT consumed on a fold (see applyRoundResult), so what we record here
    // is just what each side had committed at the moment of fold — for the transcript
    // and the intent tell. 'citizen' is the fallback for a fold with no card selected.
    playerCard: state.playerSelectedCard || 'citizen',
    opponentCard: state.opponentSelectedCard || 'citizen',
    multiplier: state.multiplier,
    pot,
    playerScored: playerNet,
    opponentScored: -playerNet,
    folded,
    keyCardPlayed: false,
  };
}

function applyRoundResult(state: GameState, result: RoundResult): GameState {
  // A fold never reveals either card, so neither hand shrinks. This is the rule fix
  // for the emperor-fold bug: previously the winner's key card was consumed silently
  // but keyCardPlayed stayed false, so the set continued with the emperor gone from
  // your hand. Now cards only leave the hand at showdown.
  const newPlayerHand = result.folded ? state.playerHand : removeCard(state.playerHand, result.playerCard);
  const newOpponentHand = result.folded ? state.opponentHand : removeCard(state.opponentHand, result.opponentCard);
  const newHistory = [...state.roundHistory, result];
  // Bump the folder's ratchet for the escalating fold penalty next time.
  const newPlayerFolds = state.playerFoldsThisSet + (result.folded === 'player' ? 1 : 0);
  const newOpponentFolds = state.opponentFoldsThisSet + (result.folded === 'opponent' ? 1 : 0);

  const newPlayerScore = state.playerSetScore + result.playerScored;
  const newOpponentScore = state.opponentSetScore + result.opponentScored;
  const newPlayerChips = state.playerChips + result.playerScored;
  const newOpponentChips = state.opponentChips + result.opponentScored;

  const isRegicide =
    (result.playerCard === 'slave' && result.opponentCard === 'emperor') ||
    (result.playerCard === 'emperor' && result.opponentCard === 'slave');

  let message = '';
  if (result.folded === 'player') {
    // Cards return to the hand; the transcript needs to make that visible so the
    // player understands "why do I still have my emperor?" — and understands the
    // escalating penalty rather than seeing it as a bug next round.
    const cardsBack = state.playerSelectedCard ? '，双方手牌收回' : '';
    message = `你弃牌了 — 对手赢得 ${-result.playerScored} 筹码${cardsBack}`;
    if (newPlayerFolds >= 2) message += `（下次弃牌至少 ${(newPlayerFolds + 1) * ANTE} 筹码）`;
  } else if (result.folded === 'opponent') {
    const cardsBack = state.opponentSelectedCard ? '，双方手牌收回' : '';
    message = `对手弃牌 — 你赢得 ${result.playerScored} 筹码${cardsBack}`;
  } else if (result.playerScored > 0) {
    message = `你赢了！+${result.playerScored} 筹码`;
    if (isRegicide) message += ' — 弑君！';
  } else if (result.opponentScored > 0) {
    message = `你输了。对手 +${result.opponentScored} 筹码`;
    if (isRegicide) message += ' — 弑君！';
  } else {
    message = '平局 — 双方都是市民，筹码退回';
  }

  if (result.keyCardPlayed && !result.folded) {
    message += ' — 关键牌已出，本局即将结束';
  }

  // Bankruptcy ends the match immediately — chips are the shared bankroll for the
  // whole Bo7, so being wiped out mid-set means there's nothing left to ante with.
  if (newPlayerChips <= 0 || newOpponentChips <= 0) {
    const playerBankrupt = newPlayerChips <= 0;
    return {
      ...state,
      phase: 'match-end',
      playerHand: newPlayerHand,
      opponentHand: newOpponentHand,
      playerSetScore: newPlayerScore,
      opponentSetScore: newOpponentScore,
      playerChips: Math.max(0, newPlayerChips),
      opponentChips: Math.max(0, newOpponentChips),
      playerFoldsThisSet: newPlayerFolds,
      opponentFoldsThisSet: newOpponentFolds,
      roundHistory: newHistory,
      message: playerBankrupt
        ? '你输光了所有筹码 — 比赛结束，你输了。'
        : '对手输光了所有筹码 — 你赢得了整场比赛！',
    };
  }

  return {
    ...state,
    phase: 'round-end',
    playerHand: newPlayerHand,
    opponentHand: newOpponentHand,
    playerSetScore: newPlayerScore,
    opponentSetScore: newOpponentScore,
    playerChips: newPlayerChips,
    opponentChips: newOpponentChips,
    playerFoldsThisSet: newPlayerFolds,
    opponentFoldsThisSet: newOpponentFolds,
    roundNumber: state.roundNumber + 1,
    roundHistory: newHistory,
    message,
  };
}

function resolveSet(state: GameState): GameState {
  const winner: SetResult['winner'] =
    state.playerSetScore > state.opponentSetScore
      ? 'player'
      : state.playerSetScore < state.opponentSetScore
        ? 'opponent'
        : 'draw';

  const setResult: SetResult = {
    playerScore: state.playerSetScore,
    opponentScore: state.opponentSetScore,
    playerSide: state.playerSide,
    rounds: state.roundHistory,
    winner,
  };

  const newPlayerSets = state.playerSetsWon + (winner === 'player' ? 1 : 0);
  const newOpponentSets = state.opponentSetsWon + (winner === 'opponent' ? 1 : 0);

  let message = '';
  if (winner === 'player') message = `本局胜利！筹码 ${state.playerChips} : ${state.opponentChips}`;
  else if (winner === 'opponent') message = `本局失败。筹码 ${state.playerChips} : ${state.opponentChips}`;
  else message = `本局平局。筹码 ${state.playerChips} : ${state.opponentChips}`;

  return {
    ...state,
    phase: newPlayerSets >= 4 || newOpponentSets >= 4 ? 'match-end' : 'set-end',
    playerSetsWon: newPlayerSets,
    opponentSetsWon: newOpponentSets,
    setHistory: [...state.setHistory, setResult],
    message: newPlayerSets >= 4
      ? '你赢得了整场比赛！'
      : newOpponentSets >= 4
        ? '比赛结束 — 你输了。'
        : message,
  };
}
