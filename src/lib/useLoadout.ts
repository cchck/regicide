'use client';

import { useEffect, useState } from 'react';
import { normalizeLoadout, type Loadout } from './shop';

/**
 * What the player is currently wearing. Falls back to the free defaults for guests and
 * while the fetch is in flight, so the scene always has a complete look to render.
 */
export function useLoadout(enabled = true): Loadout {
  const [look, setLook] = useState<Loadout>(() => normalizeLoadout(null));
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/shop')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.loadout) setLook(normalizeLoadout(d.loadout));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);
  return look;
}
