'use client';

// Fixed top-left exit — clipped-corner chip, shared across menu screens.
export default function BackButton({ onClick, label = '返 回 大 厅' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed top-5 left-5 z-50 flex items-center gap-2 px-4 py-2 border border-border hover:border-blood text-text-secondary hover:text-blood-glow text-xs tracking-[3px] font-display uppercase transition-all duration-200 bg-black/40 backdrop-blur-sm"
      style={{ clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)' }}
    >
      <span className="text-base leading-none">←</span>
      {label}
    </button>
  );
}
