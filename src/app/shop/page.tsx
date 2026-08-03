'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import TableScene from '@/components/TableScene';
import { SealIcon } from '@/components/CurrencyIcon';
import BackButton from '@/components/BackButton';
import DecoButton from '@/components/DecoButton';
import { useQuality } from '@/lib/device';
import { audio } from '@/lib/audio';
import {
  SLOTS, RARITY, itemsInSlot, normalizeLoadout,
  type SlotKey, type Loadout, type ShopItem,
} from '@/lib/shop';

// The shop is the room: navigation lives on the edges so the preview owns the middle.
// Slots run down the left (a rail on desktop, a scrolling strip up top on phones), the
// slot's items run along the bottom, and the description + buy sit bottom-right where the
// eye lands last. Nothing floats over the table itself.
export default function ShopPage() {
  const router = useRouter();
  const { status } = useSession();
  const [quality] = useQuality();

  const [seals, setSeals] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Loadout>(() => normalizeLoadout(null));
  /** What the room is showing — equipped, plus whatever is being tried on. */
  const [preview, setPreview] = useState<Loadout>(() => normalizeLoadout(null));
  const [slot, setSlot] = useState<SlotKey>('seat');
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

  // Trying something on is local and instant — nothing spent, no round-trip.
  const tryOn = (item: ShopItem) => {
    if (!item.ready) return;
    audio.sfx('click');
    setPreview((p) => ({ ...p, [item.slot]: item.id }));
  };

  const buy = async (item: ShopItem) => {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/shop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
  // The one thing being tried on but not yet worn — drives the detail strip.
  const focusId = preview[slot] !== equipped[slot] ? preview[slot] : equipped[slot];
  const focus = items.find((i) => i.id === focusId) ?? null;
  const focusOwned = !!focus && (owned.has(focus.id) || focus.price === 0);
  const focusEquipped = !!focus && equipped[slot] === focus.id;
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
          // Nothing is on the felt in this room, which is fine for a table or a chandelier
          // but makes the card-back slot unbuyable-blind: you'd be paying for art you
          // cannot see. Deal one face-down card while that slot is open — the same view
          // the back actually gets in a match, across the table from the opponent.
          opponentCard={slot === 'cardBack' ? 'citizen' : null}
          opponentFaceDown={slot === 'cardBack'}
        />
      </div>

      <BackButton onClick={() => router.push('/')} />

      {/* Wallet — the only one on this page (the global bar hides itself here) */}
      <div className="absolute top-5 right-5 z-30 flex items-center gap-2 px-4 py-2 border border-amber/50 bg-black/75 backdrop-blur-sm"
        style={{ clipPath: 'polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)' }}>
        <SealIcon size={18} className="text-amber shrink-0" />
        <span className="font-display font-black text-xl text-amber-bright tabular-nums leading-none">{seals}</span>
        <span className="text-[10px] tracking-[2px] text-text-muted font-display">金印</span>
      </div>

      {/* Title, tucked top-centre so it never fights the wallet */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none hidden sm:block">
        <h1 className="font-gothic text-cracked text-2xl tracking-[10px] text-amber-bright leading-none">当 铺</h1>
        <p className="text-[9px] tracking-[3px] text-text-muted font-display mt-1.5">卖的都是排面 · 输赢分毫不变</p>
      </div>

      {/* ——— Slots: a rail down the left on desktop ——— */}
      <div className="hidden sm:flex absolute left-5 top-24 bottom-52 z-20 w-40 flex-col gap-2">
        <p className="text-[10px] tracking-[4px] text-text-dim font-display mb-2 pl-3">换 什 么</p>
        {SLOTS.map((s) => {
          const active = slot === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { audio.sfx('click'); setSlot(s.key); }}
              className={
                'text-left px-3 py-3.5 text-[17px] tracking-[3px] font-display transition-all border-l-2 ' +
                (active
                  ? 'border-amber text-amber-bright'
                  : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border')
              }
              style={active ? { background: 'linear-gradient(90deg, rgba(196,154,48,0.14), transparent)' } : undefined}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {/* ——— Slots: a scrolling strip up top on phones ——— */}
      <div className="sm:hidden absolute top-16 inset-x-0 z-20 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 px-4 w-max">
          {SLOTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { audio.sfx('click'); setSlot(s.key); }}
              className={
                'px-3 py-2 text-[12px] tracking-[2px] font-display border whitespace-nowrap transition-colors ' +
                (slot === s.key
                  ? 'border-amber text-amber-bright bg-amber/10'
                  : 'border-border-subtle text-text-muted bg-black/50')
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* ——— Items along the bottom ——— */}
      <div className="absolute bottom-0 inset-x-0 z-20"
        style={{ background: 'linear-gradient(to top, rgba(3,3,7,0.99) 62%, rgba(3,3,7,0.93) 86%, rgba(3,3,7,0.55) 100%)' }}>
        {/* A hairline that gives the tray an actual edge instead of dissolving into the room */}
        <div className="h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(196,154,48,0.45) 20%, rgba(196,154,48,0.45) 80%, transparent)' }} />
        <div className="px-4 sm:px-8 pt-6 pb-5 flex flex-col gap-4">

          {/* Cards */}
          <div className="overflow-x-auto no-scrollbar pt-2.5 pb-1">
            <div className="flex gap-3 w-max items-end">
              {!loaded && <p className="text-text-muted text-sm tracking-[3px] font-display py-8 px-2">清 点 中 …</p>}
              {loaded && items.map((item) => {
                const isOwned = owned.has(item.id) || item.price === 0;
                const isEquipped = equipped[item.slot] === item.id;
                const isFocus = preview[item.slot] === item.id;
                const r = RARITY[item.rarity];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => tryOn(item)}
                    disabled={!item.ready}
                    className={
                      'relative shrink-0 w-[172px] sm:w-[188px] px-4 pt-5 pb-4 border text-left transition-all duration-200 ' +
                      (!item.ready ? 'opacity-40 cursor-not-allowed ' : 'hover:-translate-y-1 ') +
                      (isFocus && item.ready ? '-translate-y-2' : '')
                    }
                    style={{
                      borderColor: isFocus && item.ready ? '#c49a30' : isEquipped ? 'rgba(63,179,179,0.5)' : 'rgba(120,120,130,0.25)',
                      background: isFocus && item.ready ? 'rgba(196,154,48,0.09)' : 'rgba(0,0,0,0.55)',
                      boxShadow: isFocus && item.ready ? '0 8px 24px rgba(0,0,0,0.6)' : 'none',
                    }}
                  >
                    {/* Rarity rule across the top */}
                    <span className="absolute top-0 inset-x-0 h-[2px]"
                      style={{ background: r.color, boxShadow: isFocus ? `0 0 10px ${r.color}` : 'none' }} />

                    {/* The name IS the art — gothic, rarity-coloured */}
                    <div className="h-[74px] flex items-center justify-center">
                      <span
                        className="font-gothic text-center leading-tight"
                        style={{
                          color: r.color,
                          fontSize: item.name.length > 4 ? '25px' : '32px',
                          textShadow: `0 0 22px ${r.color}66`,
                        }}
                      >
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-3.5">
                      <span className="text-[11px] tracking-[1px] font-display px-2 py-0.5 border"
                        style={{ color: r.color, borderColor: r.color + '55' }}>
                        {r.name}
                      </span>
                      {isEquipped ? (
                        <span className="text-[11px] tracking-[1px] text-teal-bright font-display">使用中</span>
                      ) : !item.ready ? (
                        <span className="text-[11px] tracking-[1px] text-text-dim font-display">待上架</span>
                      ) : isOwned ? (
                        <span className="text-[11px] tracking-[1px] text-text-muted font-display">已拥有</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-bright font-display font-bold text-[14px]">
                          <SealIcon size={12} className="shrink-0" />{item.price}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail + actions — one set, tied to whatever is focused */}
          <div className="flex items-center justify-between gap-4 min-h-[38px] border-t border-border-subtle/50 pt-3">
            <p className="text-[13px] sm:text-[15px] leading-relaxed text-text-secondary font-display flex-1 min-w-0 tracking-[1px]">
              {error ? <span className="text-blood-glow">{error}</span> : focus?.blurb ?? ''}
            </p>
            <div className="flex gap-2 shrink-0">
              {dirty && (
                <DecoButton color="neutral" size="md" onClick={() => setPreview(equipped)}>还 原</DecoButton>
              )}
              {focus && focus.ready && !focusOwned && (
                <DecoButton color="amber" size="md" disabled={busy || seals < focus.price} onClick={() => buy(focus)}>
                  <span className="inline-flex items-center gap-1.5">买 下 <SealIcon size={13} className="shrink-0" />{focus.price}</span>
                </DecoButton>
              )}
              {focus && focus.ready && focusOwned && !focusEquipped && (
                <DecoButton color="amber" size="md" disabled={busy} onClick={() => equip(focus)}>换 上</DecoButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
