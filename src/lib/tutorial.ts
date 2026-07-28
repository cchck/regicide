import { BetAction, CardType, Side } from './types';

// ————————————————————————————————————————————————————————————————
// The tutorial: three scripted one-round scenes. The opponent's moves are
// predetermined; the coach panel walks the player through each beat.
// The goal is not to teach rules (one sentence covers them) — it's to make
// the player FEEL the three core experiences: folding as a weapon, the
// slave's regicide, and reading an opponent through their actions.
// ————————————————————————————————————————————————————————————————

export interface TutorialStep {
  text: string;
  /**
   * What unlocks progression to the next step:
   * - 'continue'          player clicks the coach's continue button
   * - 'select-card'       player selects the hinted card in the fan
   * - 'confirm-play'      player confirms the opening play (BetPicker)
   * - 'fold'              player folds via BetActions
   * - 'opponent-response' auto: the scripted opponent has responded (betting turn reached)
   * - 'round-end'         auto: the round resolved
   * - 'finish'            player clicks the final button — tutorial complete
   */
  waitFor: 'continue' | 'select-card' | 'confirm-play' | 'fold' | 'opponent-response' | 'round-end' | 'finish';
  /** The only card the player may select while this step is active (also visually hinted). */
  hintCard?: CardType;
}

export interface TutorialScene {
  title: string;
  side: Side;
  /** Bet multiplier the BetPicker is locked to in this scene. */
  lockBet: number;
  /** The scripted opponent's second play (card stays hidden unless revealed). */
  opponentResponse: { card: CardType; action: BetAction };
  steps: TutorialStep[];
}

export const TUTORIAL_SCENES: TutorialScene[] = [
  {
    title: '第一幕 · 止损',
    side: 'emperor',
    lockBet: 1,
    opponentResponse: { card: 'citizen', action: 'raise' },
    steps: [
      {
        text: '坐下吧。规则只有一句：皇帝赢市民，市民赢奴隶，而奴隶——弑君。你现在是皇帝方：一张皇帝，四张市民。',
        waitFor: 'continue',
      },
      {
        text: '先别急着亮王牌。出一张市民试探——点手里发亮的那张。',
        waitFor: 'select-card',
        hintCard: 'citizen',
      },
      {
        text: '注保持 ×1，点「出牌」。轻注试探，别把身家押在问号上。',
        waitFor: 'confirm-play',
      },
      {
        text: '牌已入局。看他怎么接。',
        waitFor: 'opponent-response',
      },
      {
        text: '他加注了。想一想：如果他捏着奴隶牌在等你的皇帝，你每跟一注都是在给他送钱。这一局，我们弃。弃牌不是认输——是止损。',
        waitFor: 'fold',
      },
      {
        text: '你永远不会知道他刚才手里有没有奴隶牌，这正是重点：你只花了小钱，买走了整个不确定性。下一幕，换你吓人。',
        waitFor: 'continue',
      },
    ],
  },
  {
    title: '第二幕 · 弑君',
    side: 'slave',
    lockBet: 3,
    opponentResponse: { card: 'emperor', action: 'call' },
    steps: [
      {
        text: '现在你是奴隶方。四张市民，一张奴隶——整局唯一的胜机，就是让这张奴隶牌撞上他的皇帝。',
        waitFor: 'continue',
      },
      {
        text: '大多数人会把奴隶牌憋到最后一刻。人人都知道这一点——所以第一回合就甩出去，反而最出其不意。点那张奴隶牌。',
        waitFor: 'select-card',
        hintCard: 'slave',
      },
      {
        text: '注已推到 ×3。既然要赌，就赌到他不敢相信。出牌。',
        waitFor: 'confirm-play',
      },
      {
        text: '他跟注了。开牌——',
        waitFor: 'round-end',
      },
      {
        text: '弑君。奴隶杀死皇帝，赔率五倍。记住这种感觉——这个游戏里最弱的牌，握着最锋利的刀。',
        waitFor: 'continue',
      },
    ],
  },
  {
    title: '第三幕 · 读人',
    side: 'emperor',
    lockBet: 1,
    opponentResponse: { card: 'citizen', action: 'fold' },
    steps: [
      {
        text: '最后一课。你又是皇帝方，但这次不教你出什么——教你看。出一张市民。',
        waitFor: 'select-card',
        hintCard: 'citizen',
      },
      {
        text: '注 ×1，出牌。',
        waitFor: 'confirm-play',
      },
      {
        text: '等他。',
        waitFor: 'round-end',
      },
      {
        text: '看到没——他秒弃了。他在护什么？多半是那张还没出手的奴隶牌。你没花一个筹码，就摸到了他手牌的形状。这种信息，才是这张桌子上真正的货币。',
        waitFor: 'continue',
      },
      {
        text: '以后，每一个坐到你对面的人，他们的习惯都会被记进「密档」。学会读别人——也记得，别人也在读你。去吧。',
        waitFor: 'finish',
      },
    ],
  },
];
