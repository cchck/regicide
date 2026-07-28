// Four line-art faction sigils, drawn in currentColor so each inherits its faction accent.
// Deliberately austere Art Deco linework — no fills, so they read at any size (badge → OG).

import { FactionKey } from '@/lib/persona-data';

export default function FactionSigil({ faction, size = 40, className }: {
  faction: FactionKey;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 100 100',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (faction) {
    case 'tyrant': // a toppled / cracked crown — power that bluffs
      return (
        <svg {...common}>
          <path d="M20 68 L26 34 L40 52 L50 28 L60 52 L74 34 L80 68 Z" />
          <line x1="20" y1="68" x2="80" y2="68" />
          <line x1="30" y1="76" x2="70" y2="76" />
          <circle cx="50" cy="20" r="3.5" />
        </svg>
      );
    case 'juggernaut': // crossed blades — force you can see coming
      return (
        <svg {...common}>
          <path d="M28 24 L72 78" />
          <path d="M72 24 L28 78" />
          <path d="M24 20 L34 24 L28 32 Z" />
          <path d="M76 20 L66 24 L72 32 Z" />
          <circle cx="50" cy="51" r="5" />
        </svg>
      );
    case 'schemer': // a masked eye — deception, patience
      return (
        <svg {...common}>
          <path d="M18 50 Q50 26 82 50 Q50 74 18 50 Z" />
          <circle cx="50" cy="50" r="10" />
          <line x1="50" y1="46" x2="50" y2="54" strokeWidth="6" />
          <path d="M24 34 L34 40 M76 34 L66 40" />
        </svg>
      );
    case 'bedrock': // a shield / immovable stone
      return (
        <svg {...common}>
          <path d="M50 18 L78 30 L78 54 Q78 76 50 86 Q22 76 22 54 L22 30 Z" />
          <line x1="50" y1="18" x2="50" y2="86" />
          <line x1="22" y1="46" x2="78" y2="46" />
        </svg>
      );
  }
}
