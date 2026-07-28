'use client';

// The persona card — one component, two homes: the private dossier hero (with the
// player's real axis percentages + stats + a share button) and the public /type page
// (archetype view, no personal numbers unless passed via the share link).

import { AXES } from '@/lib/persona-data';
import { FACTIONS, personaByLatin } from '@/lib/persona-data';
import type { AxisResult } from '@/lib/persona';
import FactionSigil from './FactionSigil';

export interface PersonaBadgeProps {
  latin: string;
  /** Real per-axis lean from the player's data. Omit for the archetype (public) view. */
  axes?: AxisResult[];
  /** Shown under the bars when present. */
  handle?: string;
  hitRate?: number | null;   // 0..1
  regicides?: number | null;
  nemesisLine?: boolean;     // show the 天敌 row (default true)
  compact?: boolean;         // tighter paddings for embedding
}

export default function PersonaBadge({
  latin, axes, handle, hitRate, regicides, nemesisLine = true, compact = false,
}: PersonaBadgeProps) {
  const p = personaByLatin(latin);
  if (!p) return null;
  const f = FACTIONS[p.faction];
  const nemesis = personaByLatin(p.nemesis);
  const c = f.color;
  const rgba = (a: number) => hexA(c, a);

  return (
    <div
      className="relative w-full max-w-md mx-auto overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${hexA(f.colorDim, 0.28)} 0%, #0a0a12 46%, #060609 100%)`,
        border: `1px solid ${rgba(0.34)}`,
        boxShadow: `0 24px 60px rgba(0,0,0,0.65), inset 0 0 40px rgba(0,0,0,0.55)`,
      }}
    >
      {/* Faction colour rail */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, transparent, ${c}, ${f.colorDim}, ${c}, transparent)`, boxShadow: `0 0 14px ${rgba(0.6)}` }} />

      {/* Corner brackets */}
      <span className="absolute top-3 left-3 w-5 h-5 border-t border-l" style={{ borderColor: rgba(0.6) }} />
      <span className="absolute top-3 right-3 w-5 h-5 border-t border-r" style={{ borderColor: rgba(0.6) }} />
      <span className="absolute bottom-3 left-3 w-5 h-5 border-b border-l border-amber/40" />
      <span className="absolute bottom-3 right-3 w-5 h-5 border-b border-r border-amber/40" />

      <div className={compact ? 'px-6 py-6' : 'px-7 sm:px-9 py-7'}>
        <p className="text-center text-[10px] tracking-[6px] text-amber/70 font-display uppercase">REGICIDE · 弑 君</p>

        {/* Faction line + sigil */}
        <div className="flex items-center justify-center gap-3 mt-5" style={{ color: c }}>
          <span className="h-px w-8" style={{ background: `linear-gradient(to right, transparent, ${rgba(0.5)})` }} />
          <FactionSigil faction={p.faction} size={22} />
          <span className="text-xs tracking-[5px] font-display font-bold">{f.name}</span>
          <span className="h-px w-8" style={{ background: `linear-gradient(to left, transparent, ${rgba(0.5)})` }} />
        </div>

        {/* Big name */}
        <h2
          className="text-center font-gothic text-cracked mt-4 leading-none tracking-[8px]"
          style={{ color: c, fontSize: compact ? '2.6rem' : '3.2rem', textShadow: `0 0 30px ${rgba(0.5)}, 0 2px 6px rgba(0,0,0,0.9)`, paddingLeft: '8px' }}
        >
          {p.bigName}
        </h2>
        <p className="text-center text-[15px] tracking-[4px] text-text-secondary mt-3 font-display">{p.smallName}</p>
        <p className="text-center text-[11px] tracking-[3px] text-text-muted mt-2 font-display">{p.latin} · {p.code}</p>

        <div className="h-px my-5" style={{ background: `linear-gradient(to right, transparent, ${hexA('#c49a30', 0.4)}, transparent)` }} />

        {/* Description */}
        <p className="text-[12.5px] leading-[1.9] text-text-primary/90 text-justify tracking-[0.5px] font-display">
          {p.description}
        </p>

        {/* Axis bars */}
        <div className="mt-6 flex flex-col gap-3">
          {AXES.map((ax, i) => {
            const r = axes?.[i];
            const pole = r ? r.pole : archetypePole(p.latin, i);
            const pct = r ? r.pct : 68; // archetype view has no data → a representative lean
            const leftActive = pole === 0;
            return (
              <div key={ax.key} className="flex items-center gap-2.5 text-[11px] tracking-[2px]">
                <span className="w-[26px] text-text-muted font-display">{ax.label}</span>
                <span className="w-4 text-center font-bold" style={{ color: leftActive ? c : '#4a4a52' }}>{ax.poles[0]}</span>
                <span className="flex-1 relative h-1 rounded-sm" style={{ background: '#1a1a22' }}>
                  <span
                    className="absolute top-0 h-full rounded-sm"
                    style={{
                      [leftActive ? 'left' : 'right']: 0,
                      width: `${pct}%`,
                      background: leftActive ? `linear-gradient(90deg, ${c}, ${rgba(0.4)})` : `linear-gradient(270deg, ${c}, ${rgba(0.4)})`,
                      boxShadow: `0 0 8px ${rgba(0.5)}`,
                    } as React.CSSProperties}
                  />
                  <span
                    className="absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${leftActive ? pct : 100 - pct}%`, background: c, boxShadow: `0 0 8px ${c}` }}
                  />
                </span>
                <span className="w-4 text-center font-bold" style={{ color: leftActive ? '#4a4a52' : c }}>{ax.poles[1]}</span>
                {axes ? <span className="w-7 text-right font-bold font-display" style={{ color: c }}>{pct}</span> : <span className="w-7" />}
              </div>
            );
          })}
        </div>

        {/* Nemesis */}
        {nemesisLine && nemesis && (
          <div className="mt-5 flex items-center justify-between px-3.5 py-2.5 border border-amber/20" style={{ background: 'rgba(0,0,0,0.35)' }}>
            <span className="text-[10px] tracking-[3px] text-text-muted font-display">天 敌</span>
            <span className="text-[13px] tracking-[2px] font-display font-bold text-amber">{nemesis.bigName}</span>
          </div>
        )}

        {/* Handle + stats */}
        {(handle || hitRate != null || regicides != null) && (
          <p className="mt-4 text-center text-[11px] tracking-[2px] text-text-muted font-display">
            {handle && <span className="text-text-secondary">{handle}</span>}
            {hitRate != null && <> · 命中 <span className="text-text-bright font-bold">{Math.round(hitRate * 100)}%</span></>}
            {regicides != null && <> · 弑君 <span className="font-bold" style={{ color: c }}>×{regicides}</span></>}
          </p>
        )}
      </div>
    </div>
  );
}

// Public/archetype view: which pole this type leans, straight from its own latin code.
function archetypePole(latin: string, axisIndex: number): 0 | 1 {
  return AXES[axisIndex].letters[0] === latin[axisIndex] ? 0 : 1;
}

// #rrggbb + alpha → rgba() string.
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
