'use client';

import { CardType } from '@/lib/types';
import { CARD_SVG, CARD_BACK_SVG, CardBackId } from '@/lib/cardArt';

interface CardArtProps {
  /** A face, or a card-back shop id — backs are per-loadout now, not one fixed 'back'. */
  type: CardType | CardBackId;
  className?: string;
}

export default function CardArt({ type, className = '' }: CardArtProps) {
  const svg = type in CARD_BACK_SVG
    ? CARD_BACK_SVG[type as CardBackId]
    : CARD_SVG[type as CardType];
  return (
    <div
      className={'w-full h-full [&>svg]:w-full [&>svg]:h-full ' + className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
