'use client';

import { useEffect, useState } from 'react';
import type { Quality } from '@/components/TableScene';

// Coarse pointer = finger. Used to decide touch affordances and the default quality tier;
// it's about the input device, not the screen size, so a touch laptop counts as touch.
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

// A phone's GPU can't carry the desktop post chain (AO + bloom + grain at 1.5× DPR) —
// it renders at a few fps and cooks the battery. Anything on a coarse pointer with a
// small screen starts at 'low'; the settings panel can still override, and that choice
// is what persists.
function defaultQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) <= 820;
  return isTouchDevice() && smallScreen ? 'low' : 'high';
}

/**
 * Graphics quality: an explicit saved choice always wins; otherwise the device decides.
 * Shared by the AI board and the PvP page so they can't drift apart.
 */
export function useQuality(): [Quality, (q: Quality) => void] {
  const [quality, setQuality] = useState<Quality>('high');

  useEffect(() => {
    const saved = localStorage.getItem('regicide-quality');
    if (saved === 'high' || saved === 'medium' || saved === 'low') setQuality(saved);
    else setQuality(defaultQuality());
  }, []);

  const change = (q: Quality) => {
    setQuality(q);
    localStorage.setItem('regicide-quality', q);
  };

  return [quality, change];
}

/** Live touch flag for rendering decisions (re-evaluates if the pointer type changes). */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setTouch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return touch;
}

/** True while the viewport is portrait AND small — the layout that needs a nudge. */
export function useIsPortraitPhone(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 820px)');
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return portrait;
}
