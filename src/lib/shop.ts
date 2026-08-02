// The room you play in is a loadout: one item per slot. Everything here is cosmetic —
// nothing sold changes a single card, odds, or payout. That line is deliberate and should
// stay that way.
//
// The starting room is deliberately shabby (a scarred wooden table under a bare bulb).
// Everything that currently ships as "the scene" — the Deco chandelier, the throne, the
// whiskey and cigar — is an unlockable. The arc is the point: you start in a basement and
// win your way into a palace.

export type SlotKey = 'table' | 'light' | 'seat' | 'props' | 'room' | 'dealer' | 'cardBack' | 'drill';

export interface Slot {
  key: SlotKey;
  name: string;
  blurb: string;
}

export const SLOTS: Slot[] = [
  { key: 'table', name: '牌 桌', blurb: '你趴在上面输赢的那张' },
  { key: 'light', name: '灯 具', blurb: '照亮这场对赌的东西' },
  { key: 'seat', name: '座 椅', blurb: '对面那位坐的' },
  { key: 'props', name: '桌 面 陈 设', blurb: '烟、酒、钱' },
  { key: 'room', name: '房 间', blurb: '墙、柱、幕布' },
  { key: 'dealer', name: '庄 家', blurb: '他穿什么' },
  { key: 'cardBack', name: '牌 背', blurb: '你手里那五张的背面' },
  { key: 'drill', name: '耳 钻', blurb: '抵着你耳朵的那台机器' },
];

export type Rarity = 'common' | 'fine' | 'rare' | 'legend';

export const RARITY: Record<Rarity, { name: string; color: string }> = {
  common: { name: '寻常', color: '#8a8078' },
  fine: { name: '精制', color: '#3fb3b3' },
  rare: { name: '珍稀', color: '#a382d4' },
  legend: { name: '传世', color: '#d8a838' },
};

export interface ShopItem {
  id: string;
  slot: SlotKey;
  name: string;
  blurb: string;
  rarity: Rarity;
  /** 金印 price. 0 = the free default for that slot. */
  price: number;
  /**
   * False while the art doesn't exist yet — the item still lists (so the shop reads as a
   * real place with a roadmap) but can't be bought or previewed.
   */
  ready: boolean;
}

// Item ids are stable strings: they're written into the DB and can't be renamed casually.
export const ITEMS: ShopItem[] = [
  // ——— 牌桌 ———
  { id: 'table.plain', slot: 'table', name: '掉漆木桌', blurb: '绿绒磨破了边，烫痕数不清。它见过太多人输光。', rarity: 'common', price: 0, ready: true },
  { id: 'table.deco', slot: 'table', name: '装饰艺术赌桌', blurb: '雕花桌沿，皮革包边，独脚基座撑起整张台面。', rarity: 'fine', price: 350, ready: true },
  { id: 'table.obsidian', slot: 'table', name: '黑曜石台', blurb: '一整块磨光的黑石。牌落上去没有声音。', rarity: 'rare', price: 900, ready: false },
  { id: 'table.jade', slot: 'table', name: '血玉牌桌', blurb: '玉里的红丝像凝住的血。据说它记得每一个死在这的人。', rarity: 'legend', price: 2200, ready: false },

  // ——— 灯具 ———
  { id: 'light.bulb', slot: 'light', name: '裸灯泡', blurb: '一根线吊着，风一过就晃。地下赌局的标准配置。', rarity: 'common', price: 0, ready: true },
  { id: 'light.deco', slot: 'light', name: '黄铜吊灯', blurb: '十二支烛台，装饰艺术的黄金骨架。', rarity: 'fine', price: 400, ready: true },
  { id: 'light.skull', slot: 'light', name: '骨灯', blurb: '烛火从眼窝里透出来。没人问过那是谁的头骨。', rarity: 'rare', price: 1000, ready: false },

  // ——— 座椅 ———
  { id: 'seat.plain', slot: 'seat', name: '折叠铁椅', blurb: '冷、硬、吱呀作响。坐着的人不在乎。', rarity: 'common', price: 0, ready: true },
  { id: 'seat.throne', slot: 'seat', name: '鎏金王座', blurb: '猩红丝绒配鎏金雕花。他坐上去像在审判你。', rarity: 'fine', price: 400, ready: true },
  { id: 'seat.bone', slot: 'seat', name: '骨王座', blurb: '用输家的东西堆起来的。别问是什么骨头。', rarity: 'legend', price: 1800, ready: false },

  // ——— 桌面陈设 ———
  { id: 'props.tin', slot: 'props', name: '铁皮烟灰缸', blurb: '瘪了一角，积着灰。桌上就这么一件东西。', rarity: 'common', price: 0, ready: true },
  { id: 'props.vice', slot: 'props', name: '绅士的恶习', blurb: '燃着的雪茄、水晶醒酒器、一捆扎好的钞票——一整套派头。', rarity: 'fine', price: 300, ready: true },

  // ——— 房间 ———
  { id: 'room.concrete', slot: 'room', name: '水泥地下室', blurb: '裸墙，霉斑，一扇焊死的窗。没人会来找你。', rarity: 'common', price: 0, ready: true },
  { id: 'room.deco', slot: 'room', name: '午夜沙龙', blurb: '深蓝墙面、猩红壁柱、垂到地板的天鹅绒幕布，还有一圈立柱。', rarity: 'rare', price: 750, ready: true },

  // ——— 庄家 ———
  { id: 'dealer.hood', slot: 'dealer', name: '兜帽庄家', blurb: '看不见脸，只看得见那两点红光。', rarity: 'common', price: 0, ready: true },
  { id: 'dealer.priest', slot: 'dealer', name: '赌场祭司', blurb: '他管这叫仪式，不叫赌局。', rarity: 'rare', price: 900, ready: false },
  { id: 'dealer.general', slot: 'dealer', name: '败军之将', blurb: '勋章还挂着，军队早没了。', rarity: 'rare', price: 900, ready: false },
  { id: 'dealer.child', slot: 'dealer', name: '穿西装的孩子', blurb: '最让人不安的那种对手。', rarity: 'legend', price: 1600, ready: false },

  // ——— 牌背 ———
  { id: 'cardBack.house', slot: 'cardBack', name: '庄家纹章', blurb: '标准牌背。所有人都是从这副牌开始的。', rarity: 'common', price: 0, ready: true },
  { id: 'cardBack.gilt', slot: 'cardBack', name: '烫金几何', blurb: '装饰艺术的放射纹，边缘压金。', rarity: 'fine', price: 180, ready: false },
  { id: 'cardBack.blood', slot: 'cardBack', name: '血手印', blurb: '一枚按在牌背上的掌印。你希望那是印上去的。', rarity: 'rare', price: 600, ready: false },

  // ——— 耳钻 ———
  { id: 'drill.iron', slot: 'drill', name: '锈铁钻', blurb: '出厂那台。锈是真的，声音也是真的。', rarity: 'common', price: 0, ready: true },
  { id: 'drill.brass', slot: 'drill', name: '黄铜钻', blurb: '擦得锃亮。让处刑显得体面一点。', rarity: 'fine', price: 380, ready: false },
];

// ————————————————————————— How seals are earned —————————————————————————
// Roughly 150–250 an hour at a normal win rate, which puts the cheap items inside one
// session and the legendaries at a genuine grind. Regicide pays big on purpose: it's the
// moment the whole game is built around, so it should also be the moment you get paid.
export const SEALS_PER_WIN = 30;
export const SEALS_PER_REGICIDE = 100;

// A Bo7 can't contain more than 7 regicides (one per set at most), so any client-reported
// count above that is a lie and gets clamped rather than trusted.
export const MAX_REGICIDES_PER_MATCH = 7;

export const ITEM_BY_ID: Record<string, ShopItem> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): ShopItem | null {
  return ITEM_BY_ID[id] ?? null;
}

export function itemsInSlot(slot: SlotKey): ShopItem[] {
  return ITEMS.filter((i) => i.slot === slot);
}

/** What every account starts wearing — the free item in each slot. */
export const DEFAULT_LOADOUT: Record<SlotKey, string> = Object.fromEntries(
  SLOTS.map((s) => [s.key, ITEMS.find((i) => i.slot === s.key && i.price === 0)!.id]),
) as Record<SlotKey, string>;

export type Loadout = Record<SlotKey, string>;

/**
 * Fill in any missing/unknown slots from the defaults, so a stored loadout written by an
 * older build (or naming an item that has since been removed) can never render a hole.
 */
export function normalizeLoadout(stored: Partial<Record<string, string>> | null | undefined): Loadout {
  const out = { ...DEFAULT_LOADOUT };
  if (!stored) return out;
  for (const slot of SLOTS) {
    const id = stored[slot.key];
    const item = id ? itemById(id) : null;
    if (item && item.slot === slot.key) out[slot.key] = item.id;
  }
  return out;
}
