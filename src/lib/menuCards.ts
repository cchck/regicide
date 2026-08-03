// The hub's menu, drawn as a hand of cards.
//
// There is no button dock any more. You are a card player standing at a table, so the way
// you choose where to go is the way you choose everything else in this game: you take a
// card out of a fan. That means the entry screen teaches the core interaction before a
// single chip is on the table, and the room is left completely unobstructed — no panel, no
// bar, nothing pasted over the render.
//
// Same 120×168 as the playing cards and the same hand-written SVG pipeline, so these sit
// in the fan next to a real hand without looking like a different object.

export type MenuCardId = 'duel' | 'tutorial' | 'dossier' | 'ledger' | 'shop';

interface MenuCard {
  id: MenuCardId;
  /** Spoken aloud by the hover label and by the hidden DOM nav. */
  name: string;
  sub: string;
  svg: string;
}

/** Shared frame so the five read as one deck. `hero` gets the fuller treatment. */
function frame(stroke: string, accent: string, hero = false): string {
  const corners = hero
    ? `<path d="M13,29 L13,13 L29,13" fill="none" stroke="${accent}" stroke-width="0.9"/>
<path d="M107,29 L107,13 L91,13" fill="none" stroke="${accent}" stroke-width="0.9"/>
<path d="M13,139 L13,155 L29,155" fill="none" stroke="${accent}" stroke-width="0.9"/>
<path d="M107,139 L107,155 L91,155" fill="none" stroke="${accent}" stroke-width="0.9"/>`
    : `<path d="M14,26 L14,14 L26,14" fill="none" stroke="${accent}" stroke-width="0.7"/>
<path d="M106,142 L106,154 L94,154" fill="none" stroke="${accent}" stroke-width="0.7"/>`;
  return `<rect x="5" y="5" width="110" height="158" fill="none" stroke="${stroke}" stroke-width="${hero ? 1.3 : 1}"/>
<rect x="8.5" y="8.5" width="103" height="151" fill="none" stroke="${stroke}" stroke-width="0.3" opacity="${hero ? 0.6 : 0.45}"/>
${corners}`;
}

function card(opts: {
  bg: string; stroke: string; accent: string; ink: string; label: string;
  glyph: string; name: string; motif: string; hero?: boolean;
}): string {
  const { bg, stroke, accent, ink, label, glyph, name, motif, hero } = opts;
  return `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<rect width="120" height="168" fill="${bg}"/>
${motif}
${frame(stroke, accent, hero)}
<text x="60" y="${hero ? 99 : 97}" text-anchor="middle" fill="${accent}" font-size="${hero ? 58 : 50}" font-family="Georgia, serif">${glyph}</text>
<line x1="${hero ? 36 : 40}" y1="${hero ? 118 : 116}" x2="${hero ? 84 : 80}" y2="${hero ? 118 : 116}" stroke="${stroke}" stroke-width="${hero ? 0.8 : 0.6}"/>
<text x="60" y="${hero ? 138 : 136}" text-anchor="middle" fill="${ink}" font-size="${hero ? 13 : 12}" letter-spacing="${hero ? 4 : 3}" font-family="Georgia, serif">${name}</text>
<text x="60" y="152" text-anchor="middle" fill="${stroke}" font-size="6.5" letter-spacing="1.5" font-family="Georgia, serif">${label}</text>
</svg>`;
}

// 对战 — the hero. Everything else on this screen is a side trip.
const DUEL = card({
  bg: '#12080c', stroke: '#c0161c', accent: '#e8262c', ink: '#f0ece4',
  glyph: '决', name: '对 战', label: '匹配入座 · 约人开桌', hero: true,
  motif: `<defs><radialGradient id="mDuel"><stop offset="0%" stop-color="#4a0e0e"/><stop offset="100%" stop-color="#12080c"/></radialGradient></defs>
<rect width="120" height="168" fill="url(#mDuel)"/>
<g stroke="#c0161c" stroke-width="0.4" opacity="0.32" fill="none">
<path d="M60,30 L92,84 L60,138 L28,84 Z"/><path d="M60,44 L82,84 L60,124 L38,84 Z"/></g>`,
});

const TUTORIAL = card({
  bg: '#0a1216', stroke: '#1a5c5c', accent: '#2a8a8a', ink: '#3fb3b3',
  glyph: '习', name: '新手引导', label: '三幕入局 · 五分钟',
  motif: `<g stroke="#1a5c5c" stroke-width="0.35" opacity="0.3" fill="none">
<path d="M22,40 L98,40 M22,52 L98,52 M22,128 L98,128"/></g>`,
});

const DOSSIER = card({
  bg: '#0e0c08', stroke: '#8a6a20', accent: '#c49a30', ink: '#d8ab3c',
  glyph: '档', name: '密 档', label: '你的出牌倾向',
  motif: `<g stroke="#8a6a20" stroke-width="0.35" opacity="0.28" fill="none">
<rect x="26" y="34" width="68" height="14"/><rect x="26" y="34" width="22" height="14"/></g>`,
});

const LEDGER = card({
  bg: '#0e0c08', stroke: '#8a6a20', accent: '#c49a30', ink: '#d8ab3c',
  glyph: '榜', name: '血 榜', label: '谁主宰这座大厅',
  motif: `<g stroke="#8a6a20" stroke-width="0.35" opacity="0.28" fill="none">
<path d="M40,46 L40,34 M60,46 L60,26 M80,46 L80,38"/><path d="M32,46 L88,46"/></g>`,
});

const SHOP = card({
  bg: '#0e0c08', stroke: '#8a6a20', accent: '#c49a30', ink: '#d8ab3c',
  glyph: '铺', name: '当 铺', label: '给这间房换个排面',
  motif: `<g stroke="#8a6a20" stroke-width="0.35" opacity="0.28" fill="none">
<circle cx="60" cy="40" r="9"/><path d="M60,31 L60,49 M51,40 L69,40"/></g>`,
});

export const MENU_CARDS: Record<MenuCardId, MenuCard> = {
  duel: { id: 'duel', name: '对 战', sub: '匹配入座 · 约人开桌', svg: DUEL },
  tutorial: { id: 'tutorial', name: '新手引导', sub: '三幕入局 · 五分钟', svg: TUTORIAL },
  dossier: { id: 'dossier', name: '密 档', sub: '你的出牌倾向', svg: DOSSIER },
  ledger: { id: 'ledger', name: '血 榜', sub: '谁主宰这座大厅', svg: LEDGER },
  shop: { id: 'shop', name: '当 铺', sub: '给这间房换个排面', svg: SHOP },
};

/** Fan order, left to right. `duel` sits dead centre and is dealt last. */
export const MENU_ORDER: MenuCardId[] = ['tutorial', 'dossier', 'duel', 'ledger', 'shop'];

export function menuCardSvgDataUrl(id: MenuCardId): string {
  const svg = MENU_CARDS[id].svg;
  const encoded = typeof window === 'undefined'
    ? Buffer.from(svg).toString('base64')
    : window.btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}
