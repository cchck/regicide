import { CardType } from './types';

const EMPEROR_SVG = `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="120" height="168" fill="#0e0e18" />
<rect x="5" y="5" width="110" height="158" fill="none" stroke="#8a6a20" stroke-width="1" />
<rect x="8" y="8" width="104" height="152" fill="none" stroke="#8a6a20" stroke-width="0.3" opacity="0.5" />
<path d="M40,14 L60,8 L80,14" fill="none" stroke="#c49a30" stroke-width="0.8" />
<path d="M45,17 L60,12 L75,17" fill="none" stroke="#8a6a20" stroke-width="0.5" />
<polygon points="38,58 44,38 50,50 56,30 60,46 64,30 70,50 76,38 82,58" fill="none" stroke="#c49a30" stroke-width="1.8" stroke-linejoin="miter" />
<line x1="36" y1="59" x2="84" y2="59" stroke="#c49a30" stroke-width="1.2" />
<circle cx="56" cy="34" r="1.5" fill="#c49a30" />
<circle cx="64" cy="34" r="1.5" fill="#c49a30" />
<circle cx="60" cy="46" r="1" fill="#8a6a20" />
<circle cx="60" cy="72" r="8" fill="#151520" stroke="#d4d0c8" stroke-width="1.2" />
<path d="M40,90 Q50,80 60,82 Q70,80 80,90" fill="#151520" stroke="#d4d0c8" stroke-width="1" />
<path d="M42,90 L38,125 L82,125 L78,90" fill="#151520" stroke="#908880" stroke-width="0.8" />
<line x1="60" y1="82" x2="60" y2="125" stroke="#8a6a20" stroke-width="0.5" opacity="0.5" />
<path d="M40,154 L60,160 L80,154" fill="none" stroke="#8a6a20" stroke-width="0.5" />
<text x="60" y="142" text-anchor="middle" fill="#c49a30" font-size="10" font-family="Georgia, serif" letter-spacing="6">皇帝</text>
</svg>`;

const CITIZEN_SVG = `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="120" height="168" fill="#0e0e18" />
<rect x="5" y="5" width="110" height="158" fill="none" stroke="#2a2a3a" stroke-width="0.8" />
<rect x="8" y="8" width="104" height="152" fill="none" stroke="#2a2a3a" stroke-width="0.3" opacity="0.4" />
<g opacity="0.35"><circle cx="35" cy="60" r="5" fill="#151520" stroke="#908880" stroke-width="0.8" /><path d="M35,66 L35,90" stroke="#908880" stroke-width="0.8" /><path d="M35,90 L29,110 M35,90 L41,110" stroke="#908880" stroke-width="0.8" /><line x1="35" y1="70" x2="32" y2="78" stroke="#555048" stroke-width="0.6" /><line x1="35" y1="70" x2="38" y2="78" stroke="#555048" stroke-width="0.6" /></g>
<g opacity="0.55"><circle cx="50" cy="55" r="5" fill="#151520" stroke="#908880" stroke-width="0.8" /><path d="M50,61 L50,85" stroke="#908880" stroke-width="0.8" /><path d="M50,85 L44,105 M50,85 L56,105" stroke="#908880" stroke-width="0.8" /><line x1="50" y1="65" x2="47" y2="73" stroke="#555048" stroke-width="0.6" /><line x1="50" y1="65" x2="53" y2="73" stroke="#555048" stroke-width="0.6" /></g>
<g opacity="0.7"><circle cx="65" cy="52" r="5" fill="#151520" stroke="#908880" stroke-width="0.8" /><path d="M65,58 L65,82" stroke="#908880" stroke-width="0.8" /><path d="M65,82 L59,102 M65,82 L71,102" stroke="#908880" stroke-width="0.8" /><line x1="65" y1="62" x2="62" y2="70" stroke="#555048" stroke-width="0.6" /><line x1="65" y1="62" x2="68" y2="70" stroke="#555048" stroke-width="0.6" /></g>
<g opacity="0.5"><circle cx="80" cy="57" r="5" fill="#151520" stroke="#908880" stroke-width="0.8" /><path d="M80,63 L80,87" stroke="#908880" stroke-width="0.8" /><path d="M80,87 L74,107 M80,87 L86,107" stroke="#908880" stroke-width="0.8" /><line x1="80" y1="67" x2="77" y2="75" stroke="#555048" stroke-width="0.6" /><line x1="80" y1="67" x2="83" y2="75" stroke="#555048" stroke-width="0.6" /></g>
<rect x="15" y="8" width="8" height="25" fill="#111118" stroke="#2a2a3a" stroke-width="0.3" />
<rect x="28" y="8" width="10" height="35" fill="#111118" stroke="#2a2a3a" stroke-width="0.3" />
<rect x="95" y="8" width="9" height="30" fill="#111118" stroke="#2a2a3a" stroke-width="0.3" />
<text x="60" y="142" text-anchor="middle" fill="#555048" font-size="10" font-family="Georgia, serif" letter-spacing="6">市民</text>
</svg>`;

const SLAVE_SVG = `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="slaveGlow"><stop offset="0%" stop-color="#aa1111" stop-opacity="0.08" /><stop offset="100%" stop-color="#aa1111" stop-opacity="0" /></radialGradient></defs>
<rect x="0" y="0" width="120" height="168" fill="#0e0e18" />
<rect x="5" y="5" width="110" height="158" fill="none" stroke="#aa1111" stroke-width="1" />
<rect x="8" y="8" width="104" height="152" fill="none" stroke="#771010" stroke-width="0.3" opacity="0.5" />
<path d="M20,85 L28,82 Q30,78 34,80 L38,76 Q40,72 44,74" fill="none" stroke="#aa1111" stroke-width="1.5" stroke-linecap="round" />
<line x1="44" y1="74" x2="48" y2="70" stroke="#dd2222" stroke-width="0.8" opacity="0.6" />
<line x1="44" y1="74" x2="46" y2="68" stroke="#dd2222" stroke-width="0.5" opacity="0.4" />
<path d="M100,85 L92,82 Q90,78 86,80 L82,76 Q80,72 76,74" fill="none" stroke="#aa1111" stroke-width="1.5" stroke-linecap="round" />
<line x1="76" y1="74" x2="72" y2="70" stroke="#dd2222" stroke-width="0.8" opacity="0.6" />
<line x1="76" y1="74" x2="74" y2="68" stroke="#dd2222" stroke-width="0.5" opacity="0.4" />
<circle cx="60" cy="55" r="8" fill="#151520" stroke="#d4d0c8" stroke-width="1.2" />
<path d="M46,74 L38,60 M74,74 L82,60" stroke="#d4d0c8" stroke-width="1.5" stroke-linecap="round" />
<path d="M60,64 L60,100" stroke="#d4d0c8" stroke-width="1.5" stroke-linecap="round" />
<path d="M60,74 L46,74 M60,74 L74,74" stroke="#d4d0c8" stroke-width="1.2" stroke-linecap="round" />
<path d="M60,100 L48,125 M60,100 L72,125" stroke="#908880" stroke-width="1" stroke-linecap="round" />
<circle cx="56" cy="53" r="1.8" fill="#aa1111" />
<circle cx="64" cy="53" r="1.8" fill="#aa1111" />
<circle cx="60" cy="70" r="30" fill="url(#slaveGlow)" />
<text x="60" y="142" text-anchor="middle" fill="#aa1111" font-size="10" font-family="Georgia, serif" letter-spacing="6">奴隶</text>
</svg>`;

const BACK_SVG = `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="120" height="168" fill="#0e0e18" />
<rect x="5" y="5" width="110" height="158" fill="none" stroke="#2a2a3a" stroke-width="0.5" />
<path d="M60,20 L100,84 L60,148 L20,84 Z" fill="none" stroke="#771010" stroke-width="0.8" />
<path d="M60,35 L90,84 L60,133 L30,84 Z" fill="none" stroke="#771010" stroke-width="0.4" opacity="0.5" />
<path d="M60,50 L80,84 L60,118 L40,84 Z" fill="none" stroke="#771010" stroke-width="0.3" opacity="0.3" />
<line x1="60" y1="20" x2="60" y2="148" stroke="#771010" stroke-width="0.3" opacity="0.3" />
<line x1="20" y1="84" x2="100" y2="84" stroke="#771010" stroke-width="0.3" opacity="0.3" />
<path d="M12,12 L24,12 L12,24" fill="none" stroke="#2a2a3a" stroke-width="0.5" />
<path d="M108,12 L96,12 L108,24" fill="none" stroke="#2a2a3a" stroke-width="0.5" />
<path d="M12,156 L24,156 L12,144" fill="none" stroke="#2a2a3a" stroke-width="0.5" />
<path d="M108,156 L96,156 L108,144" fill="none" stroke="#2a2a3a" stroke-width="0.5" />
</svg>`;

// ————————————————————————— Purchasable card backs —————————————————————————
//
// Everything here is hand-written SVG for the same reason the faces are: it stays sharp at
// any texture size, weighs nothing, and can be edited without a round-trip through an
// image tool. It is rasterised through `<img>` → canvas (see Card3D), which runs SVG in a
// restricted mode — no scripts, no external refs. Gradients and patterns are fine there;
// **filters are the thing to be careful with**, so neither of these uses one. An earlier
// handprint design leaned on feTurbulence for ragged edges and was dropped partly for that.

// 烫金几何 — Deco sunburst. Radial and warm, so it reads as the opposite of the crown.
const BACK_GILT_SVG = `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#e8c76a"/><stop offset="50%" stop-color="#c49a30"/><stop offset="100%" stop-color="#7a5c18"/>
</linearGradient></defs>
<rect width="120" height="168" fill="#08080f"/>
<rect x="5" y="5" width="110" height="158" fill="none" stroke="url(#gg)" stroke-width="1"/>
<rect x="8.5" y="8.5" width="103" height="151" fill="none" stroke="#c49a30" stroke-width="0.3" opacity="0.45"/>
<g stroke="url(#gg)" fill="none" stroke-linecap="square"><g stroke-width="1.15">
<g transform="rotate(0 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(30 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(60 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(90 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(120 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(150 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(180 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(210 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(240 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(270 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(300 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
<g transform="rotate(330 60 84)"><line x1="60" y1="69" x2="60" y2="39"/></g>
</g><g stroke-width="0.5" opacity="0.62">
<g transform="rotate(15 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(45 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(75 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(105 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(135 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(165 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(195 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(225 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(255 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(285 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(315 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
<g transform="rotate(345 60 84)"><line x1="60" y1="70" x2="60" y2="50"/></g>
</g></g>
<circle cx="60" cy="84" r="34" fill="none" stroke="#c49a30" stroke-width="0.35" opacity="0.4"/>
<circle cx="60" cy="84" r="37" fill="none" stroke="#c49a30" stroke-width="0.6" opacity="0.7"/>
<path d="M60,70 L74,84 L60,98 L46,84 Z" fill="#08080f" stroke="url(#gg)" stroke-width="1.1"/>
<path d="M60,77 L67,84 L60,91 L53,84 Z" fill="none" stroke="#c49a30" stroke-width="0.5" opacity="0.8"/>
<circle cx="60" cy="84" r="1.4" fill="#e8c76a"/>
<g stroke="url(#gg)" stroke-width="0.7" fill="none">
<path d="M12,28 L12,22 L16,22 L16,18 L20,18 L20,14 L26,14"/>
<path d="M108,28 L108,22 L104,22 L104,18 L100,18 L100,14 L94,14"/>
<path d="M12,140 L12,146 L16,146 L16,150 L20,150 L20,154 L26,154"/>
<path d="M108,140 L108,146 L104,146 L104,150 L100,150 L100,154 L94,154"/>
</g></svg>`;

// 倒冠 — the game's title, drawn.
//
// The crown is inverted by `rotate(180 60 84) translate(0 7)`: the group is authored
// upright (band at the bottom, finial at the top) because that is far easier to reason
// about, and the rotation is what turns it over. The translate is applied FIRST (inner
// transform), so it shifts the crown down 7 pre-flip, which centres it after the flip.
//
// The spike is drawn after the crown so it reads as driven through rather than behind it.
const BACK_CROWN_SVG = `<svg width="120" height="168" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f0d488"/><stop offset="38%" stop-color="#c49a30"/><stop offset="100%" stop-color="#6a4e12"/></linearGradient>
<linearGradient id="cg2" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#f0d488"/><stop offset="45%" stop-color="#c49a30"/><stop offset="100%" stop-color="#6a4e12"/></linearGradient>
<linearGradient id="cs" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4a4e56"/><stop offset="30%" stop-color="#c2c8d2"/><stop offset="58%" stop-color="#7e848e"/><stop offset="100%" stop-color="#383c42"/></linearGradient>
<linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e01a20"/><stop offset="55%" stop-color="#8c1014"/><stop offset="100%" stop-color="#43070a"/></linearGradient>
<pattern id="cl" width="11" height="11" patternUnits="userSpaceOnUse"><path d="M0,11 L11,0 M0,0 L11,11" stroke="#241d33" stroke-width="0.4" fill="none"/></pattern>
</defs>
<rect width="120" height="168" fill="#08070d"/>
<rect x="9" y="9" width="102" height="150" fill="url(#cl)" opacity="0.55"/>
<rect x="5" y="5" width="110" height="158" fill="none" stroke="url(#cg)" stroke-width="0.9"/>
<rect x="9" y="9" width="102" height="150" fill="none" stroke="#6a4e12" stroke-width="0.3" opacity="0.7"/>
<rect x="12" y="12" width="96" height="144" fill="none" stroke="#4a4e56" stroke-width="0.25" opacity="0.5"/>
<g transform="rotate(180 60 84) translate(0 7)">
<path d="M37,78 Q46,53 60,47 Q74,53 83,78 Q60,86 37,78 Z" fill="#4a0a10" opacity="0.75"/>
<path d="M33,100 L37,78 L43,92 L51,68 L57,86 L60,64 L63,86 L69,68 L77,92 L83,78 L87,100 Z" fill="url(#cg2)" stroke="#5a4110" stroke-width="0.5" stroke-linejoin="miter"/>
<path d="M37,78 Q46,54 60,48" fill="none" stroke="url(#cg)" stroke-width="1.7"/>
<path d="M83,78 Q74,54 60,48" fill="none" stroke="url(#cg)" stroke-width="1.7"/>
<path d="M45,71 Q52,58 60,54" fill="none" stroke="#e0bc60" stroke-width="0.5" opacity="0.55"/>
<g fill="url(#cg)" stroke="#5a4110" stroke-width="0.35"><circle cx="37" cy="77" r="2"/><circle cx="51" cy="67" r="2"/><circle cx="60" cy="62.5" r="2.3"/><circle cx="69" cy="67" r="2"/><circle cx="83" cy="77" r="2"/></g>
<circle cx="60" cy="46" r="3.4" fill="url(#cg)" stroke="#5a4110" stroke-width="0.4"/>
<circle cx="59.2" cy="45" r="1" fill="#f6e3a8" opacity="0.8"/>
<path d="M60,35 L62.6,41 L60,43.4 L57.4,41 Z" fill="url(#cg)" stroke="#5a4110" stroke-width="0.35"/>
<path d="M31,118 L89,118 L87,100 L33,100 Z" fill="url(#cg)" stroke="#5a4110" stroke-width="0.55"/>
<line x1="33.4" y1="104" x2="86.6" y2="104" stroke="#5a4110" stroke-width="0.45" opacity="0.85"/>
<line x1="32" y1="114" x2="88" y2="114" stroke="#5a4110" stroke-width="0.45" opacity="0.85"/>
<path d="M60,103.5 L65.5,109 L60,114.5 L54.5,109 Z" fill="#c0161c" stroke="#5a4110" stroke-width="0.4"/>
<path d="M60,106 L63,109 L60,112 L57,109 Z" fill="#e8262c" opacity="0.55"/>
<g stroke="#5a4110" stroke-width="0.3"><path d="M44,105.5 L47.6,109 L44,112.5 L40.4,109 Z" fill="#1d6a68"/><path d="M76,105.5 L79.6,109 L76,112.5 L72.4,109 Z" fill="#1d6a68"/></g>
<g fill="#e0bc60" opacity="0.85"><circle cx="35" cy="118" r="1.1"/><circle cx="41" cy="118" r="1.1"/><circle cx="47" cy="118" r="1.1"/><circle cx="53" cy="118" r="1.1"/><circle cx="60" cy="118" r="1.1"/><circle cx="67" cy="118" r="1.1"/><circle cx="73" cy="118" r="1.1"/><circle cx="79" cy="118" r="1.1"/><circle cx="85" cy="118" r="1.1"/></g>
</g>
<path d="M51,10 L69,10 L71.5,14 L69,18.5 L51,18.5 L48.5,14 Z" fill="url(#cs)" stroke="#23262b" stroke-width="0.4"/>
<line x1="51" y1="13" x2="69" y2="13" stroke="#dde2e8" stroke-width="0.5" opacity="0.45"/>
<line x1="52" y1="16.5" x2="68" y2="16.5" stroke="#23262b" stroke-width="0.4" opacity="0.6"/>
<path d="M57.2,18.5 L62.8,18.5 L61.3,127 L58.7,127 Z" fill="url(#cs)"/>
<path d="M58.7,127 L61.3,127 L60,142 Z" fill="url(#cs)"/>
<line x1="58.5" y1="20" x2="59.4" y2="125" stroke="#dde2e8" stroke-width="0.45" opacity="0.3"/>
<g stroke="#23262b" stroke-width="0.4" opacity="0.65"><line x1="57.1" y1="23" x2="62.9" y2="23.7"/><line x1="57.15" y1="27" x2="62.85" y2="27.7"/><line x1="57.2" y1="31" x2="62.8" y2="31.7"/><line x1="57.25" y1="35" x2="62.75" y2="35.7"/></g>
<path d="M52.6,40 Q55,35.5 60,36.4 Q65.6,35.4 67.6,41 Q69,47.6 63.4,50 Q56.6,52.2 53.4,48 Q50.6,44.4 52.6,40 Z" fill="url(#cb)"/>
<path d="M56,41 Q58.6,38.6 61.6,40 Q63.4,43 61,45.2 Q57.6,46.6 56,44 Z" fill="#e8262c" opacity="0.5"/>
<path d="M56.6,47 Q55.2,72 56.4,96 Q57.2,114 56.8,126 L58.6,126 Q59,110 58.2,94 Q57.2,70 58.6,47 Z" fill="#8c1014" opacity="0.9"/>
<path d="M37,84.5 Q35.5,89.5 37,93.5 Q38.5,89.5 37,84.5 Z" fill="#8c1014"/>
<path d="M83,84.5 Q81.7,88.6 83,92 Q84.3,88.6 83,84.5 Z" fill="#8c1014"/>
<path d="M51,94.5 Q49.8,98.6 51,102 Q52.2,98.6 51,94.5 Z" fill="#8c1014" opacity="0.85"/>
<ellipse cx="57.4" cy="138" rx="1.7" ry="2.5" fill="#8c1014"/>
<g opacity="0.9">
<path d="M27,140 L30,143 L27,146 L24,143 Z" fill="#1d6a68" stroke="#5a4110" stroke-width="0.3" transform="rotate(18 27 143)"/>
<path d="M94,133 L96.4,135.4 L94,137.8 L91.6,135.4 Z" fill="#c0161c" stroke="#5a4110" stroke-width="0.3" transform="rotate(-24 94 135.4)"/>
</g>
<g stroke="url(#cg)" stroke-width="0.7" fill="none">
<path d="M12,32 L12,18 L16,18 L16,14 L20,14 L20,12 L32,12"/>
<path d="M108,32 L108,18 L104,18 L104,14 L100,14 L100,12 L88,12"/>
<path d="M12,136 L12,150 L16,150 L16,154 L20,154 L20,156 L32,156"/>
<path d="M108,136 L108,150 L104,150 L104,154 L100,154 L100,156 L88,156"/>
</g>
<g fill="#c0161c"><circle cx="16.5" cy="16.5" r="1"/><circle cx="103.5" cy="16.5" r="1"/><circle cx="16.5" cy="151.5" r="1"/><circle cx="103.5" cy="151.5" r="1"/></g>
</svg>`;

/** Shop item ids, so the loadout can be handed straight to the renderer. */
export type CardBackId = 'cardBack.house' | 'cardBack.gilt' | 'cardBack.crown';

export const CARD_BACK_SVG: Record<CardBackId, string> = {
  'cardBack.house': BACK_SVG,
  'cardBack.gilt': BACK_GILT_SVG,
  'cardBack.crown': BACK_CROWN_SVG,
};

export const CARD_SVG: Record<CardType, string> = {
  emperor: EMPEROR_SVG,
  citizen: CITIZEN_SVG,
  slave: SLAVE_SVG,
};

function toDataUrl(svg: string): string {
  const encoded = typeof window === 'undefined'
    ? Buffer.from(svg).toString('base64')
    : window.btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

export function cardSvgDataUrl(type: CardType): string {
  return toDataUrl(CARD_SVG[type]);
}

export function cardBackSvgDataUrl(id: CardBackId): string {
  return toDataUrl(CARD_BACK_SVG[id] ?? CARD_BACK_SVG['cardBack.house']);
}
