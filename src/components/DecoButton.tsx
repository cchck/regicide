'use client';

import { CSSProperties, ReactNode, useRef, useState } from 'react';
import { audio } from '@/lib/audio';

type DecoButtonColor = 'blood' | 'teal' | 'amber' | 'neutral';
type DecoButtonSize = 'sm' | 'md' | 'lg';

interface DecoButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: DecoButtonColor;
  size?: DecoButtonSize;
  selected?: boolean;
  fullWidth?: boolean;
  className?: string;
}

const COLOR_VARS: Record<DecoButtonColor, { text: string; border: string; glow: string }> = {
  blood: { text: '#dd2222', border: '#aa1111', glow: 'rgba(170,17,17,' },
  teal: { text: '#2a8a8a', border: '#1a5c5c', glow: 'rgba(42,138,138,' },
  amber: { text: '#c49a30', border: '#8a6a20', glow: 'rgba(196,154,48,' },
  neutral: { text: '#908880', border: '#2a2a3a', glow: 'rgba(144,136,128,' },
};

const SIZE_CLASS: Record<DecoButtonSize, string> = {
  sm: 'px-6 py-3 text-base tracking-[2px]',
  md: 'px-10 py-4 text-lg tracking-[4px]',
  lg: 'px-14 py-6 text-xl sm:text-2xl tracking-[6px]',
};

const CORNER: Record<DecoButtonSize, number> = { sm: 7, md: 12, lg: 15 };

function clipFor(cut: number) {
  return `polygon(${cut}px 0,calc(100% - ${cut}px) 0,100% ${cut}px,100% calc(100% - ${cut}px),calc(100% - ${cut}px) 100%,${cut}px 100%,0 calc(100% - ${cut}px),0 ${cut}px)`;
}

export default function DecoButton({
  children,
  onClick,
  disabled = false,
  color = 'neutral',
  size = 'md',
  selected = false,
  fullWidth = false,
  className = '',
}: DecoButtonProps) {
  const c = COLOR_VARS[color];
  const cut = CORNER[size];
  const clip = clipFor(cut);
  const [impact, setImpact] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowing = (hovered || focused) && !disabled;

  const handleClick = () => {
    if (disabled) return;
    audio.sfx('click');
    setImpact(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setImpact(false), 280);
    onClick?.();
  };

  const borderColor = selected ? c.text : glowing ? c.text : c.border;
  const boxShadow = impact
    ? `0 0 34px ${c.glow}0.7), inset 0 0 14px rgba(0,0,0,0.25)`
    : selected
      ? `0 0 24px ${c.glow}0.4), inset 0 0 12px rgba(0,0,0,0.3)`
      : glowing
        ? `0 0 26px ${c.glow}0.35), inset 0 0 10px rgba(0,0,0,0.2)`
        : 'none';

  // Rivet accent positions — just inside each clipped corner
  const rivetOffset = Math.max(cut - 3, 2);
  const rivetPositions: CSSProperties[] = [
    { top: rivetOffset, left: rivetOffset },
    { top: rivetOffset, right: rivetOffset },
    { bottom: rivetOffset, left: rivetOffset },
    { bottom: rivetOffset, right: rivetOffset },
  ];

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      className={[
        'relative font-display uppercase transition-all duration-150 ease-out backdrop-blur-sm',
        'active:scale-[0.96]',
        SIZE_CLASS[size],
        fullWidth ? 'w-full' : '',
        disabled ? 'opacity-30 cursor-default' : 'cursor-pointer',
        impact ? 'scale-[1.04]' : '',
        className,
      ].join(' ')}
      style={{
        clipPath: clip,
        color: selected ? '#f0ece4' : c.text,
        background: selected ? c.border : 'rgba(4,4,8,0.88)',
        border: `1px solid ${borderColor}`,
        boxShadow,
        outline: 'none',
        transitionProperty: 'box-shadow, background, color, border-color, transform',
      }}
    >
      {/* Inset engraved line — echoes the card-frame double border */}
      <span
        className="absolute pointer-events-none"
        style={{ inset: '3px', clipPath: clipFor(Math.max(cut - 3, 1)), border: `1px solid ${selected ? 'rgba(240,236,228,0.35)' : c.glow + '0.3)'}` }}
      />
      {/* Corner rivets — small Art Deco hardware accents */}
      {rivetPositions.map((pos, i) => (
        <span
          key={i}
          className="absolute pointer-events-none rotate-45"
          style={{
            ...pos,
            width: '3px',
            height: '3px',
            background: selected ? 'rgba(240,236,228,0.55)' : c.text,
            opacity: disabled ? 0.2 : 0.6,
          }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
