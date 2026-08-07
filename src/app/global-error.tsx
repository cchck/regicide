'use client';

// Last resort: the root layout itself failed, so this replaces the entire document and has
// to supply its own <html> and <body>.
//
// Everything is inline. Tailwind, the fonts and globals.css all load through that layout —
// if it broke, a className here would resolve to nothing, and the fallback would be
// unstyled black text on white. Whatever went wrong, this page has to render.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05050a',
          color: '#d4d0c8',
          fontFamily: 'Georgia, "Songti SC", serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ fontSize: 26, letterSpacing: 8, color: '#aa1111', margin: 0 }}>全 盘 皆 覆</p>
          <div
            style={{
              height: 1,
              margin: '22px 0',
              background: 'linear-gradient(90deg, transparent, #2a2a3a, transparent)',
            }}
          />
          <p style={{ fontSize: 14, letterSpacing: 2, color: '#908880', lineHeight: 1.8, margin: 0 }}>
            页面整体加载失败。刷新通常就能回来 —— 你的筹码和进度都在服务器上。
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 32,
              padding: '10px 26px',
              fontSize: 14,
              letterSpacing: 4,
              fontFamily: 'inherit',
              color: '#f0ece4',
              background: 'transparent',
              border: '1px solid rgba(196,154,48,0.5)',
              cursor: 'pointer',
            }}
          >
            重 试
          </button>
          {error.digest && (
            <p style={{ fontSize: 10, letterSpacing: 2, color: '#555048', marginTop: 26 }}>
              错误编号 {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
