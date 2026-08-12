'use client';

// What the player sees when the 3D room cannot be shown.
//
// Be honest about the ceiling here: this game IS the room. The hand, the felt, the dealer
// and every tell are rendered in WebGL, so there is no 2D mode to fall back to — a
// "lite version" would be a second game, not a fallback. All this can do is say plainly
// why nothing appeared and what is worth trying, which is still infinitely better than the
// blank black rectangle that used to be the answer.

import { Component, ReactNode } from 'react';

/** Cheap, synchronous probe. Runs once before the Canvas is ever mounted. */
export function hasWebGL(): boolean {
  if (typeof document === 'undefined') return true; // SSR: assume yes, the client re-checks
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const CLIP =
  'polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px)';

export function SceneFallback({ reason }: { reason: 'unsupported' | 'crashed' | 'lost' }) {
  const copy = {
    unsupported: {
      title: '这张桌子摆不出来',
      body: '你的浏览器没有开启 3D 加速（WebGL），牌桌无法显示。',
      tips: ['换用 Chrome 或 Edge 的最新版本', '在浏览器设置里打开「使用硬件加速」', '更新显卡驱动，或换一台设备'],
    },
    crashed: {
      title: '牌桌塌了',
      body: '渲染时出了岔子。重新载入通常就好。',
      tips: ['刷新页面', '若反复出现，到设置里把画质调到「低」'],
    },
    lost: {
      title: '显示驱动重置了',
      body: '显卡把这一页的画面回收了 —— 手机切后台太久、或驱动崩过一次都会这样。',
      tips: ['刷新页面即可继续', '你的筹码和对局进度都在服务器上，不会丢'],
    },
  }[reason];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-6 bg-void">
      <div
        className="max-w-md w-full px-8 py-9 text-center"
        style={{
          clipPath: CLIP,
          background: 'linear-gradient(180deg, rgba(20,18,14,0.9) 0%, rgba(6,6,10,0.95) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(170,17,17,0.35), 0 18px 40px rgba(0,0,0,0.7)',
        }}
      >
        <p className="font-gothic text-cracked text-3xl tracking-[8px] text-blood leading-none">
          {copy.title}
        </p>
        <div className="deco-line my-6" />
        <p className="text-sm text-text-secondary tracking-[2px] font-display leading-relaxed">{copy.body}</p>
        <ul className="mt-6 space-y-2 text-left inline-block">
          {copy.tips.map((t) => (
            <li key={t} className="text-xs text-text-muted tracking-[2px] font-display flex gap-2.5">
              <span className="text-amber shrink-0">◆</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        {reason !== 'unsupported' && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 text-sm tracking-[4px] font-display text-text-bright transition-colors hover:text-amber-bright"
              style={{ clipPath: CLIP, boxShadow: 'inset 0 0 0 1px rgba(196,154,48,0.5)' }}
            >
              重 新 载 入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Catches throws from anywhere inside the R3F tree — a malformed GLB, a shader that won't
 * compile, a null deref in a useFrame. Without one, React unmounts the whole subtree and
 * the player is left looking at nothing at all, with the reason only in the console.
 *
 * Has to be a class: componentDidCatch has no hook equivalent.
 */
export class SceneBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[scene] 渲染失败', error);
  }

  render() {
    if (this.state.crashed) return <SceneFallback reason="crashed" />;
    return this.props.children;
  }
}
