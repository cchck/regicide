'use client';

// The two currencies had the same ◆/◈ lozenge, which made them read as one thing shown
// twice. They are not interchangeable and the difference matters: chips are the stake you
// can lose at the table, seals only ever buy cosmetics. Give each a shape you can tell
// apart at a glance, at 16px, in peripheral vision.
//
// Both draw in `currentColor` so the caller owns the palette.

/** 筹码 — a casino chip seen face-on: milled edge, inner ring. */
export function ChipIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.85" />
      {/* Eight milled notches around the rim — the detail that says "chip" and not "coin". */}
      <g stroke="currentColor" strokeWidth="1.5" opacity="0.95">
        <line x1="8" y1="0.8" x2="8" y2="3" />
        <line x1="8" y1="13" x2="8" y2="15.2" />
        <line x1="0.8" y1="8" x2="3" y2="8" />
        <line x1="13" y1="8" x2="15.2" y2="8" />
      </g>
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.7">
        <line x1="2.9" y1="2.9" x2="4.5" y2="4.5" />
        <line x1="11.5" y1="11.5" x2="13.1" y2="13.1" />
        <line x1="13.1" y1="2.9" x2="11.5" y2="4.5" />
        <line x1="4.5" y1="11.5" x2="2.9" y2="13.1" />
      </g>
    </svg>
  );
}

/** 金印 — a carved seal: knob on top, and a face cut into four blocks. */
export function SealIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
      {/* Handle */}
      <path d="M6.1,1 h3.8 v1.3 h-3.8 z" fill="currentColor" />
      <path d="M7.2,2.3 h1.6 v1.5 h-1.6 z" fill="currentColor" opacity="0.85" />
      {/* Body */}
      <rect x="2.3" y="3.8" width="11.4" height="10.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* The cut face. Four blocks read as carved seal script and stay legible when the
          whole icon is 16px; a single filled square just looks like a blob. */}
      <g fill="currentColor" opacity="0.9">
        <rect x="4.7" y="6.3" width="2.6" height="2.2" />
        <rect x="8.7" y="6.3" width="2.6" height="2.2" />
        <rect x="4.7" y="9.5" width="2.6" height="2.2" />
        <rect x="8.7" y="9.5" width="2.6" height="2.2" />
      </g>
    </svg>
  );
}
