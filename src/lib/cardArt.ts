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

export const CARD_SVG: Record<CardType | 'back', string> = {
  emperor: EMPEROR_SVG,
  citizen: CITIZEN_SVG,
  slave: SLAVE_SVG,
  back: BACK_SVG,
};

export function cardSvgDataUrl(type: CardType | 'back'): string {
  const encoded = typeof window === 'undefined'
    ? Buffer.from(CARD_SVG[type]).toString('base64')
    : window.btoa(unescape(encodeURIComponent(CARD_SVG[type])));
  return `data:image/svg+xml;base64,${encoded}`;
}
