import Link from 'next/link';

const CLIP =
  'polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px)';

export default function NotFound() {
  return (
    <main className="h-screen bg-void flex items-center justify-center px-6">
      <div
        className="max-w-md w-full px-8 py-10 text-center"
        style={{
          clipPath: CLIP,
          background: 'linear-gradient(180deg, rgba(20,18,14,0.9) 0%, rgba(6,6,10,0.95) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(170,17,17,0.3), 0 18px 40px rgba(0,0,0,0.7)',
        }}
      >
        <p className="font-display font-black text-6xl text-blood-dim leading-none tabular-nums">404</p>
        <p className="font-gothic text-cracked text-2xl tracking-[8px] text-blood leading-none mt-5">
          查 无 此 桌
        </p>
        <div className="deco-line my-6" />
        <p className="text-sm text-text-secondary tracking-[2px] font-display leading-relaxed">
          这张牌不在这副牌里。
        </p>
        <Link
          href="/"
          className="inline-block mt-8 px-6 py-2.5 text-sm tracking-[4px] font-display text-text-bright transition-colors hover:text-amber-bright"
          style={{ clipPath: CLIP, boxShadow: 'inset 0 0 0 1px rgba(196,154,48,0.5)' }}
        >
          返 回 大 厅
        </Link>
      </div>
    </main>
  );
}
