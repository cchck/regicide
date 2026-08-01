'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import TableScene from '@/components/TableScene';
import BackButton from '@/components/BackButton';
import DecoButton from '@/components/DecoButton';
import Flourish from '@/components/Flourish';
import { useQuality } from '@/lib/device';
import { audio } from '@/lib/audio';
import {
  SLOTS, RARITY, itemsInSlot, itemById, normalizeLoadout,
  type SlotKey, type Loadout, type ShopItem,
} from '@/lib/shop';

// The shop is the room. You browse by standing in it and swapping things out — an item
// card can't tell you what a chandelier does to the light, so the scene does the selling.
export default function ShopPage() {
  const router = useRouter();
  const { status } = useSession();
  const [quality] = useQuality();

  const [seals, setSeals] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Loadout>(() => normalizeLoadout(null));
  /** What the room is showing right now — equipped, plus whatever is being tried on. */
  const [preview, setPreview] = useState<Loadout>(() => normalizeLoadout(null));
  const [slot, setSlot] = useState<SlotKey>('light');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetch('/api/shop')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSeals(d.seals ?? 0);
        setOwned(new Set<string>(d.owned ?? []));
        const look = normalizeLoadout(d.loadout);
        setEquipped(look);
        setPreview(look);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (status === 'authenticated') load();
    else if (status === 'unauthenticated') setLoaded(true);
  }, [status, load]);

  useEffect(() => { audio.playMusic('lobby'); }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  // Trying something on is local and instant — no round-trip, nothing spent.
  const tryOn = (item: ShopItem) => {
    if (!item.ready) return;
    audio.sfx('click');
    setPreview((p) => ({ ...p, [item.slot]: item.id }));
  };

  const buy = async (item: ShopItem) => {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    }).then((r) => r.json().then((d) => ({ ok: r.ok, d }))).catch(() => ({ ok: false, d: { error: '网络错误' } }));
    setBusy(false);
    if (!res.ok) return setError(res.d?.error ?? '购买失败');
    audio.sfx('chip');
    setSeals(res.d.seals);
    setOwned((o) => new Set(o).add(item.id));
  };

  const equip = async (item: ShopItem) => {
    setBusy(true);
    const res = await fetch('/api/shop/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    }).then((r) => r.json().then((d) => ({ ok: r.ok, d }))).catch(() => ({ ok: false, d: { error: '网络错误' } }));
    setBusy(false);
    if (!res.ok) return setError(res.d?.error ?? '装备失败');
    audio.sfx('click');
    const look = normalizeLoadout(res.d.loadout);
    setEquipped(look);
    setPreview(look);
  };

  if (status === 'unauthenticated') {
    return (
      <main className="h-screen bg-void flex flex-col items-center justify-center gap-8 px-4">
        <BackButton onClick={() => router.push('/')} />
        <p className="font-gothic text-cracked text-3xl tracking-[8px] text-amber-bright">当 铺</p>
        <p className="text-text-secondary tracking-[3px] font-display">要有账号，才有家当</p>
        <DecoButton color="amber" size="md" onClick={() => router.push('/login?next=%2Fshop')}>登 录 / 注 册</DecoButton>
      </main>
    );
  }

  const items = itemsInSlot(slot);
  const dirty = JSON.stringify(preview) !== JSON.stringify(equipped);

  return (
    <main className="h-screen bg-void relative overflow-hidden">
      {/* The room, wearing whatever is being previewed */}
      <div className="absolute inset-0">
        <TableScene
          personality="deceptive"
          viewMode="lobby"
          hand={[]}
          showOpponent
          playerChips={0}
          opponentChips={0}
          pot={0}
          quality={quality}
          look={preview}
        />
      </div>
      {/* Darken the right side so the panel stays readable over a bright scene */}
      <div className="absolute inset-y-0 right-0 w-full sm:w-[520px] pointer-events-none"
        style={{ background: 'linear-gradient(to left, rgba(3,3,7,0.94) 55%, transparent)' }} />

      <BackButton onClick={() => router.push('/')} />

      {/* Wallet */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-2.5 px-4 py-2 border border-amber/40 bg-black/70 backdrop-blur-sm"
        style={{ clipPath: 'polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)' }}>
        <span className="text-amber text-lg leading-none">◈</span>
        <span className="font-display font-black text-xl text-amber-bright tabular-nums">{seals}</span>
        <span className="text-[10px] tracking-[2px] text-text-muted font-display">金印</span>
      </div>

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 z-10 w-full sm:w-[520px] flex flex-col px-5 sm:px-8 pt-20 pb-5">
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-3">
            <Flourish />
            <h1 className="font-gothic text-cracked text-3xl tracking-[8px] text-amber-bright leading-none">当 铺</h1>
            <Flourish flip />
          </div>
          <p className="text-[10px] tracking-[4px] text-text-muted font-display mt-2.5">
            这里卖的都是排面 · 一张牌的输赢都不会变
          </p>
        </div>

        {/* Slot tabs */}
        <div className="flex flex-wrap gap-1.5 justify-center mb-5">
          {SLOTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { audio.sfx('click'); setSlot(s.key); }}
              className={
                'px-2.5 py-1.5 text-[11px] tracking-[2px] font-display border transition-colors ' +
                (slot === s.key
                  ? 'border-amber text-amber-bright bg-amber/10'
                  : 'border-border-subtle text-text-muted hover:text-text-secondary hover:border-border')
              }
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Items */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pr-1">
          {!loaded && <p className="text-center text-text-muted text-sm tracking-[3px] font-display py-10">清 点 中 …</p>}
          {loaded && items.map((item) => {
            const isOwned = owned.has(item.id) || item.price === 0;
            const isEquipped = equipped[item.slot] === item.id;
            const isPreviewing = preview[item.slot] === item.id && !isEquipped;
            const r = RARITY[item.rarity];
            return (
              <div
                key={item.id}
                onClick={() => tryOn(item)}
                className={
                  'relative px-4 py-3.5 border transition-all cursor-pointer ' +
                  (!item.ready ? 'opacity-45 cursor-not-allowed ' : '') +
                  (isPreviewing ? 'border-amber bg-amber/[0.07]' : isEquipped ? 'border-teal/60 bg-teal/[0.05]' : 'border-border-subtle bg-black/40 hover:border-border')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-[15px] text-text-bright">{item.name}</span>
                      <span className="text-[9px] tracking-[2px] font-display px-1.5 py-0.5 border" style={{ color: r.color, borderColor: r.color + '66' }}>
                        {r.name}
                      </span>
                      {isEquipped && <span className="text-[9px] tracking-[2px] text-teal-bright font-display">使用中</span>}
                      {!item.ready && <span className="text-[9px] tracking-[2px] text-text-dim font-display">待 上 架</span>}
                    </div>
                    <p className="text-[11px] leading-relaxed text-text-muted font-display mt-1.5">{item.blurb}</p>
                  </div>

                  <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                    {!isOwned && (
                      <span className="flex items-center gap-1 text-amber-bright font-display font-bold text-sm">
                        <span className="text-xs">◈</span>{item.price}
                      </span>
                    )}
                    {item.ready && !isOwned && (
                      <DecoButton color="amber" size="sm" disabled={busy || seals < item.price} onClick={() => buy(item)}>
                        买 下
                      </DecoButton>
                    )}
                    {item.ready && isOwned && !isEquipped && (
                      <DecoButton color="neutral" size="sm" disabled={busy} onClick={() => equip(item)}>
                        换 上
                      </DecoButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Preview footer — a try-on is local until you commit it */}
        <div className="pt-3 mt-2 border-t border-border-subtle/60 min-h-[52px] flex items-center justify-between gap-3">
          {error ? (
            <p className="text-blood-glow text-xs tracking-[2px] font-display">{error}</p>
          ) : dirty ? (
            <>
              <p className="text-[11px] tracking-[2px] text-amber font-display">试穿中 · 尚未换上</p>
              <div className="flex gap-2">
                <DecoButton color="neutral" size="sm" onClick={() => setPreview(equipped)}>还 原</DecoButton>
                {(() => {
                  const tryingId = SLOTS.map((s) => preview[s.key]).find((id, i) => id !== equipped[SLOTS[i].key]);
                  const tryingItem = tryingId ? itemById(tryingId) : null;
                  const canEquip = tryingItem && (owned.has(tryingItem.id) || tryingItem.price === 0);
                  if (!tryingItem) return null;
                  return canEquip ? (
                    <DecoButton color="amber" size="sm" disabled={busy} onClick={() => equip(tryingItem)}>换 上</DecoButton>
                  ) : (
                    <DecoButton color="amber" size="sm" disabled={busy || seals < tryingItem.price} onClick={() => buy(tryingItem)}>
                      买 下 ◈{tryingItem.price}
                    </DecoButton>
                  );
                })()}
              </div>
            </>
          ) : (
            <p className="text-[11px] tracking-[2px] text-text-dim font-display">点一件东西，房间会立刻换上给你看</p>
          )}
        </div>
      </div>
    </main>
  );
}
