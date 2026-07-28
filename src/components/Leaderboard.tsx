'use client';

import { useEffect, useState } from 'react';
import { audio } from '@/lib/audio';

type Board = 'chips' | 'winrate' | 'wins' | 'weekly' | 'regicide';

const TABS: { key: Board; label: string; valueLabel: string }[] = [
  { key: 'chips', label: '总筹码', valueLabel: '筹码' },
  { key: 'winrate', label: '胜率', valueLabel: '回合胜率' },
  { key: 'wins', label: '总胜场', valueLabel: '胜场' },
  { key: 'weekly', label: '周榜', valueLabel: '本周胜场' },
  { key: 'regicide', label: '弑君榜', valueLabel: '弑君次数' },
];

interface Row {
  rank: number;
  name: string;
  value: number;
  sub: string | null;
  isMe: boolean;
}

interface BoardData {
  rows: Row[];
  me: { rank: number; value: number; sub: string | null } | null;
}

// Metal treatments for the podium ranks.
const PODIUM: Record<number, { color: string; glow: string; wash: string; bar: string }> = {
  1: { color: '#e8c860', glow: 'rgba(232,200,96,0.65)', wash: 'rgba(232,200,96,0.07)', bar: '#e8c860' },
  2: { color: '#c8c8d0', glow: 'rgba(200,200,208,0.5)', wash: 'rgba(200,200,208,0.05)', bar: '#c8c8d0' },
  3: { color: '#c08850', glow: 'rgba(192,136,80,0.5)', wash: 'rgba(192,136,80,0.05)', bar: '#c08850' },
};

const TAB_CLIP = 'polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)';

function formatValue(board: Board, value: number) {
  if (board === 'winrate') return Math.round(value * 100) + '%';
  return String(value);
}

export default function Leaderboard() {
  const [board, setBoard] = useState<Board>('chips');
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?board=${board}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board]);

  const tab = TABS.find((t) => t.key === board)!;
  const shown = data?.rows.slice(0, 20) ?? [];
  const meOffBoard = data?.me && !shown.some((r) => r.isMe) ? data.me : null;

  return (
    <div className="w-full">
      {/* Board tabs — proper deco chips, not naked text */}
      <div className="flex flex-wrap justify-center gap-3 mb-8">
        {TABS.map((t) => {
          const active = board === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { audio.sfx('click'); setBoard(t.key); }}
              className={
                'px-6 py-2.5 text-sm sm:text-base tracking-[4px] font-display font-bold transition-all duration-200 border ' +
                (active
                  ? 'text-amber-bright border-amber/70 bg-black/60'
                  : 'text-text-muted border-border-subtle bg-black/25 hover:text-text-secondary hover:border-border hover:-translate-y-0.5')
              }
              style={{
                clipPath: TAB_CLIP,
                boxShadow: active ? '0 0 22px rgba(196,154,48,0.3), inset 0 0 12px rgba(0,0,0,0.5)' : 'inset 0 0 8px rgba(0,0,0,0.35)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="text-center text-text-dim text-base tracking-[6px] font-display py-20">结 算 中 …</p>
      )}

      {!loading && shown.length === 0 && (
        <div className="text-center py-20">
          <p className="font-gothic text-cracked text-2xl text-text-secondary tracking-[6px] mb-3">虚 位 以 待</p>
          <p className="text-sm text-text-dim tracking-[3px] font-display">这一榜还没有名字 — 去牌桌上刻下第一个</p>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div className="flex flex-col">
          {shown.map((row) => {
            const podium = PODIUM[row.rank];
            return (
              <div
                key={row.rank}
                className={
                  'relative flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-4 border-b border-border-subtle/40 last:border-b-0 transition-colors ' +
                  (row.isMe ? 'bg-black/50' : 'hover:bg-black/25')
                }
                style={{
                  background: podium && !row.isMe ? `linear-gradient(90deg, ${podium.wash}, transparent 65%)` : undefined,
                  boxShadow: row.isMe ? 'inset 3px 0 0 #c49a30' : podium ? `inset 3px 0 0 ${podium.bar}` : undefined,
                }}
              >
                <span
                  className="w-12 sm:w-14 text-center font-display font-black text-2xl sm:text-3xl shrink-0"
                  style={podium ? { color: podium.color, textShadow: `0 0 14px ${podium.glow}` } : { color: '#4a4a56' }}
                >
                  {row.rank}
                </span>
                <span
                  className={
                    'flex-1 truncate font-display tracking-[3px] text-lg sm:text-xl ' +
                    (row.isMe ? 'text-amber-bright font-bold' : row.rank === 1 ? 'text-text-bright font-bold' : 'text-text-secondary')
                  }
                >
                  {row.name}
                  {row.isMe && <span className="text-xs tracking-[2px] text-text-dim ml-3">（你）</span>}
                </span>
                {row.sub && <span className="text-xs text-text-dim font-display tracking-wider shrink-0 hidden sm:block">{row.sub}</span>}
                <span
                  className="font-display font-black text-xl sm:text-2xl shrink-0"
                  style={{ color: podium ? podium.color : '#f0ece4', textShadow: podium ? `0 0 12px ${podium.glow}` : 'none' }}
                >
                  {formatValue(board, row.value)}
                </span>
              </div>
            );
          })}

          {/* You, wherever you actually are */}
          {meOffBoard && (
            <div
              className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-4 mt-3 border-t border-amber/30 bg-black/45"
              style={{ boxShadow: 'inset 3px 0 0 #c49a30' }}
            >
              <span className="w-12 sm:w-14 text-center font-display font-black text-2xl text-amber shrink-0">{meOffBoard.rank}</span>
              <span className="flex-1 font-display tracking-[3px] text-lg text-amber-bright font-bold">你的位置</span>
              {meOffBoard.sub && <span className="text-xs text-text-dim font-display tracking-wider shrink-0">{meOffBoard.sub}</span>}
              <span className="font-display font-black text-xl text-text-bright shrink-0">{formatValue(board, meOffBoard.value)}</span>
            </div>
          )}

          <p className="text-center text-xs tracking-[3px] text-text-dim font-display mt-6">{tab.valueLabel} · 前 20 名</p>
        </div>
      )}
    </div>
  );
}
