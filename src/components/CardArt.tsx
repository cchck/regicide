'use client';

import { CardType } from '@/lib/types';
import { CARD_SVG } from '@/lib/cardArt';

interface CardArtProps {
  type: CardType | 'back';
  className?: string;
}

export default function CardArt({ type, className = '' }: CardArtProps) {
  return (
    <div
      className={'w-full h-full [&>svg]:w-full [&>svg]:h-full ' + className}
      dangerouslySetInnerHTML={{ __html: CARD_SVG[type] }}
    />
  );
}
