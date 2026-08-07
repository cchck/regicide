'use client';

// Route-segment error boundary. Anything thrown while rendering a page under the root
// layout lands here instead of Next's default white page.
//
// `digest` is the only detail shown: Next hashes the real error and logs the pair on the
// server, so the player gets something they can quote and the stack stays private.

import Link from 'next/link';
import { useEffect } from 'react';

const CLIP =
  'polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px)';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route]', error);
  }, [error]);

  return (
    <main className="h-screen bg-void flex items-center justify-center px-6">
      <div
        className="max-w-md w-full px-8 py-10 text-center"
        style={{
          clipPath: CLIP,
          background: 'linear-gradient(180deg, rgba(20,18,14,0.9) 0%, rgba(6,6,10,0.95) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(170,17,17,0.35), 0 18px 40px rgba(0,0,0,0.7)',
        }}
      >
        <p className="font-gothic text-cracked text-3xl tracking-[8px] text-blood leading-none">
          出 了 岔 子
        </p>
        <div className="deco-line my-6" />
        <p className="text-sm text-text-secondary tracking-[2px] font-display leading-relaxed">
          这一页没能摆出来。你的筹码和对局进度都在服务器上，不会因为这个丢。
        </p>

        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            type="button"
            onClick={reset}
            className="px-6 py-2.5 text-sm tracking-[4px] font-display text-text-bright transition-colors hover:text-blood-glow"
            style={{ clipPath: CLIP, boxShadow: 'inset 0 0 0 1px rgba(221,34,34,0.5)' }}
          >
            重 试
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 text-sm tracking-[4px] font-display text-text-secondary transition-colors hover:text-amber-bright"
            style={{ clipPath: CLIP, boxShadow: 'inset 0 0 0 1px rgba(196,154,48,0.4)' }}
          >
            返 回 大 厅
          </Link>
        </div>

        {error.digest && (
          <p className="text-[10px] tracking-[2px] text-text-dim font-display mt-7">
            错误编号 <span className="text-text-muted">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  );
}
