// The 16 card-playing personas — static definitions shared by the private dossier badge
// and the public /type/[latin] page. No player data lives here; the numbers are computed
// separately in persona.ts.
//
// Code composition (fixed axis order): 血性 · 时机 · 止损 · 虚实.
// Latin id (URL-safe, MBTI-style): 血性 A猛/C稳 · 时机 R疾/H忍 · 止损 D抗/E避 · 虚实 B诈/T直.

export type FactionKey = 'tyrant' | 'juggernaut' | 'schemer' | 'bedrock';

export interface Faction {
  key: FactionKey;
  name: string;      // 暴君流
  en: string;        // TYRANT
  blurb: string;     // one-line temperament
  color: string;     // accent (bright)
  colorDim: string;  // darker rail
}

export const FACTIONS: Record<FactionKey, Faction> = {
  tyrant: { key: 'tyrant', name: '暴君流', en: 'TYRANT', blurb: '大注施压，手里多半是空的', color: '#e83a3a', colorDim: '#7a0d0d' },
  juggernaut: { key: 'juggernaut', name: '猛将流', en: 'JUGGERNAUT', blurb: '大注，但真有牌，你躲不开', color: '#d8a838', colorDim: '#7a5810' },
  schemer: { key: 'schemer', name: '谋士流', en: 'SCHEMER', blurb: '小注，全靠算计和骗', color: '#a382d4', colorDim: '#4a3070' },
  bedrock: { key: 'bedrock', name: '磐石流', en: 'BEDROCK', blurb: '小注，诚实，一堵墙', color: '#3fb3b3', colorDim: '#175c5c' },
};

// The four axes and their poles. Pole index 0 is the letter shown on the LEFT of a bar.
export const AXES = [
  { key: 'blood', label: '血性', poles: ['猛', '稳'] as const, letters: ['A', 'C'] as const },
  { key: 'timing', label: '时机', poles: ['疾', '忍'] as const, letters: ['R', 'H'] as const },
  { key: 'stop', label: '止损', poles: ['抗', '避'] as const, letters: ['D', 'E'] as const },
  { key: 'bluff', label: '虚实', poles: ['诈', '直'] as const, letters: ['B', 'T'] as const },
] as const;

export type AxisKey = (typeof AXES)[number]['key'];

export interface Persona {
  latin: string;      // ARDB — URL id
  code: string;       // 猛疾抗诈 — Chinese four-char handle
  bigName: string;    // 疯血赌王
  smallName: string;  // 开局梭哈
  oneLiner: string;   // short punchy line (used on OG + card tagline)
  description: string; // the 2nd-person "dealer judging you" paragraph
  faction: FactionKey;
  nemesis: string;    // latin id of the天敌
}

// Ordered by faction so a picker reads coherently.
export const PERSONAS: Persona[] = [
  // ——— 暴君流 (猛·诈) ———
  {
    latin: 'ARDB', code: '猛疾抗诈', bigName: '疯血赌王', smallName: '开局梭哈',
    oneLiner: '第一手就掀满池，从不退，牌还是空的。',
    description: '你从不等待。第一手就把池子顶到天花板——押的却是一张撑不起这个数的牌。被跟你不怕，弃牌你没想过。你赢在让所有人先眨眼。成了，你像个神；不成，你就是你本来的样子。',
    faction: 'tyrant', nemesis: 'CHDT',
  },
  {
    latin: 'AREB', code: '猛疾避诈', bigName: '虚张浪子', smallName: '唬完就跑',
    oneLiner: '上来就诈，一被跟立刻溜。',
    description: '你进场很吵，早早砸下大注，全是雷声。可一旦有人叫你的牌，你和筹码早就没影了。这不是怂，是编排——威胁本身才是目的，摊牌从来不是。',
    faction: 'tyrant', nemesis: 'ARDT',
  },
  {
    latin: 'AHDB', code: '猛忍抗诈', bigName: '深渊诈徒', smallName: '空手掀桌',
    oneLiner: '把池子堆成深渊，底牌是虚的，死不松手。',
    description: '你让池子越堆越深，深到对面开始怀疑自己手里的每一张牌——而这一切，建在一手空牌上。你从不弃牌，因为弃牌等于承认深渊是假的，你宁可淹死也不认。',
    faction: 'tyrant', nemesis: 'CRET',
  },
  {
    latin: 'AHEB', code: '猛忍避诈', bigName: '暗巷骗徒', smallName: '见好就收',
    oneLiner: '耐心设局，不对劲马上抽身。',
    description: '安静、耐心，然后突然变得很贵。你花几个回合布好局，用一记大注收网——但你是专业的，专业的人知道鱼不咬钩时该走。你在亏损露头前就消失了。',
    faction: 'tyrant', nemesis: 'CRDT',
  },
  // ——— 猛将流 (猛·直) ———
  {
    latin: 'ARDT', code: '猛疾抗直', bigName: '破阵先锋', smallName: '莽就完了',
    oneLiner: '早早亮杀招，一往无前，不留退路。',
    description: '你早早亮出獠牙，而且是真的。没有虚晃，没有花招——你下大注是因为你真有，然后一路推到底。所有人都看得见你冲过来。没用。莽，但莽得有本钱。',
    faction: 'juggernaut', nemesis: 'CHEB',
  },
  {
    latin: 'ARET', code: '猛疾避直', bigName: '烈刃猎手', smallName: '快刀斩乱',
    oneLiner: '出手又快又真，但知道何时收刀。',
    description: '快、真、有纪律。你用真牌和十足的攻势早早出手，但你不蠢——局势一变，你收刀入鞘，留着命下次再猎。',
    faction: 'juggernaut', nemesis: 'AHDB',
  },
  {
    latin: 'AHDT', code: '猛忍抗直', bigName: '隐雷霸主', smallName: '憋大招的',
    oneLiner: '按兵不动，一击必杀，落刀绝不回头。',
    description: '你静坐好几个回合，什么都不露，然后惊雷落下——一记真实的、碾压性的注，砸下去绝不收回。耐心 + 诚实 + 不退，你一动手，基本就结束了。',
    faction: 'juggernaut', nemesis: 'CHET',
  },
  {
    latin: 'AHET', code: '猛忍避直', bigName: '蓄势枭雄', smallName: '后发制人',
    oneLiner: '蓄力等真机会，带着止损线出手。',
    description: '你等的是真机会，不是任何机会。它来了你就重拳出击、招招见真；但你带着止损线来，机会没来，你揣着筹码全身而退。是蓄力，不是莽撞。',
    faction: 'juggernaut', nemesis: 'ARDB',
  },
  // ——— 谋士流 (稳·诈) ———
  {
    latin: 'CRDB', code: '稳疾抗诈', bigName: '冷面棋手', smallName: '面瘫老千',
    oneLiner: '早早布虚子，面不改色，从不弃局。',
    description: '小注、早早的虚招、一张关得死死的脸。你从第一步就布下假子，而且一次都不弃——不是因为你强，是因为你的整盘棋就在于“没人看得出”。诈牌很便宜，那张扑克脸才是全部。',
    faction: 'schemer', nemesis: 'CRDT',
  },
  {
    latin: 'CREB', code: '稳疾避诈', bigName: '影子掮客', smallName: '摸鱼戏精',
    oneLiner: '廉价试探，不对就撤，不留痕迹。',
    description: '你早早地、廉价地试探，用小小的欺骗探水深，不值当就悄无声息地溜。你从不投入，从不多付——你只是来看看大家手里都握着什么。',
    faction: 'schemer', nemesis: 'AHDT',
  },
  {
    latin: 'CHDB', code: '稳忍抗诈', bigName: '深谋刺客', smallName: '专业阴人',
    oneLiner: '长线做局，又耐心又致命。',
    description: '一场长局。你把池子按住，把牌憋到天荒地老，用一个又一个耐心而狡诈的回合放对面的血——而你从不弃牌，因为整把刀就是你死不出戏。又耐心，又致命。',
    faction: 'schemer', nemesis: 'CHDT',
  },
  {
    latin: 'CHEB', code: '稳忍避诈', bigName: '幕后军师', smallName: '算完就撤',
    oneLiner: '纯计算者，骗你一手然后全身而退。',
    description: '你不是在赌，是在算。每一次欺骗都标好了价，每个回合都做了预算；你为一个干净的优势诓一手，数字一翻脸就立刻撤。没有自尊，没有死守——只有出口。',
    faction: 'schemer', nemesis: 'ARDT',
  },
  // ——— 磐石流 (稳·直) ———
  {
    latin: 'CRDT', code: '稳疾抗直', bigName: '持正判官', smallName: '实诚硬汉',
    oneLiner: '诚实、果断、不可撼动。',
    description: '诚实、果断、不可撼动。你的牌值多少你就下多少——不多不少，早早投入，从不弃牌。没什么可读的，因为根本没有花招；你只是不会崩。对手觉得无聊，诈你的人觉得恐怖。',
    faction: 'bedrock', nemesis: 'CHDB',
  },
  {
    latin: 'CRET', code: '稳疾避直', bigName: '铁律赌徒', smallName: '守规矩的',
    oneLiner: '诚实果断，止损如铁律。',
    description: '你按一本只有你看得见的规则手册打牌。真牌、果断的早期动作、刻在铁上的止损线——赔率说弃，你就在那一瞬间弃，不掺一点感情。纪律，是你的全部优势。',
    faction: 'bedrock', nemesis: 'ARDB',
  },
  {
    latin: 'CHDT', code: '稳忍抗直', bigName: '中流砥柱', smallName: '铁头一根筋',
    oneLiner: '一堵不动的墙，耐心又实在。',
    description: '一堵不动的墙。小额诚实的注，牌握到最后，以及对弃牌绝对的拒绝——你就是单纯地耗过所有人。不聪明，也不好看，但河水总是撞碎在你身上，不是反过来。',
    faction: 'bedrock', nemesis: 'CHEB',
  },
  {
    latin: 'CHET', code: '稳忍避直', bigName: '止损宗师', smallName: '稳如老狗',
    oneLiner: '稳、忍、诚、退——怂，但活得最久。',
    description: '稳。忍。诚。不值了就走。你从不超额下注，从不多留一秒，从不诈牌，从不上头——你怂，但你活得比所有人都久。赌场恨你，因为你是那个磨不垮的人。',
    faction: 'bedrock', nemesis: 'AHDB',
  },
];

export const PERSONA_BY_LATIN: Record<string, Persona> = Object.fromEntries(
  PERSONAS.map((p) => [p.latin, p]),
);

export function personaByLatin(latin: string): Persona | null {
  return PERSONA_BY_LATIN[latin?.toUpperCase?.() ?? ''] ?? null;
}
