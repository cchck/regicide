'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Flourish from '@/components/Flourish';
import DecoButton from '@/components/DecoButton';
import BackButton from '@/components/BackButton';
import PersonaBadge from '@/components/PersonaBadge';
import type { PersonaResult } from '@/lib/persona';
import { personaByLatin } from '@/lib/persona-data';

interface RoundCell {
  round: number;
  plays: number;
  keyCardPlays: number;
  rate: number | null;
}

interface BetBucket {
  label: string;
  plays: number;
  keyRate: number | null;
  winRate: number | null;
}

interface DossierData {
  totalEvents: number;
  wins: number;
  folds: number;
  grid: { emperor: RoundCell[]; slave: RoundCell[] };
  betBuckets: BetBucket[];
  persona: PersonaResult;
}

const pct = (v: number | null) => (v === null ? '—' : Math.round(v * 100) + '%');
const raw = (v: number | null) => (v === null ? 0 : Math.round(v * 100));

// Tilted red rubber-stamp chip. Used above the player's name to make the
// dossier feel like a file the house keeps on you, not a personal dashboard.
function Stamp({ children, tone = 'blood' }: { children: React.ReactNode; tone?: 'blood' | 'amber' }) {
  const color = tone === 'amber' ? '#c49a30' : '#c62828';
  return (
    <span
      className="inline-block px-3.5 py-1.5 border-2 font-display font-bold text-[11px] tracking-[5px] uppercase whitespace-nowrap"
      style={{ color, borderColor: color, transform: 'rotate(-2deg)', boxShadow: `inset 0 0 0 1px ${color}22` }}
    >
      {children}
    </span>
  );
}

// A single round in the timing chart. Number stacked on top of a vertical
// bar filled from the baseline, then the round tag and sample size beneath.
// Empty slots keep their frame so a 0% reads as data rather than missing data.
function TimingColumn({ cell, tone }: { cell: RoundCell; tone: 'amber' | 'blood' }) {
  const paint = tone === 'amber'
    ? { fill: '#c49a30', glow: 'rgba(196,154,48,0.55)', numClass: 'text-amber-bright' }
    : { fill: '#c62828', glow: 'rgba(198,40,40,0.55)', numClass: 'text-blood-glow' };
  const percent = raw(cell.rate);
  const hasData = cell.plays > 0;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* The number — this is the star of the whole page */}
      <div className="h-16 sm:h-20 flex items-end">
        {hasData ? (
          <span
            className={'font-display font-bold leading-none text-5xl sm:text-6xl ' + paint.numClass}
            style={percent > 0 ? { textShadow: `0 0 22px ${paint.glow}` } : undefined}
          >
            {percent}
            <span className="text-xl sm:text-2xl align-top ml-1 opacity-80">%</span>
          </span>
        ) : (
          <span className="font-display font-bold text-4xl sm:text-5xl text-text-muted/50 leading-none">—</span>
        )}
      </div>

      {/* Bar slot — outline always visible, fill grows to the percentage */}
      <div className="relative w-full h-28 sm:h-36 border border-border-subtle/50 bg-black/30">
        {/* Fill from the bottom */}
        <div
          className="absolute inset-x-0 bottom-0 transition-all duration-1000 ease-out"
          style={{
            height: `${percent}%`,
            background: `linear-gradient(180deg, ${paint.fill}ee 0%, ${paint.fill}55 100%)`,
            boxShadow: hasData && percent > 0
              ? `0 0 24px ${paint.glow}, inset 0 -6px 14px ${paint.glow}`
              : 'none',
          }}
        />
        {/* Tick marks at 25/50/75 on the right edge */}
        {[25, 50, 75].map((y) => (
          <span
            key={y}
            className="absolute right-0 w-1.5 h-px bg-border/70"
            style={{ bottom: `${y}%` }}
          />
        ))}
      </div>

      {/* Round tag + sample count */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[11px] tracking-[4px] font-display font-bold text-text-secondary uppercase">
          回 合 {cell.round}
        </p>
        <p className="text-[10px] tracking-[2px] text-text-muted font-mono">n = {cell.plays}</p>
      </div>
    </div>
  );
}

function TimingSection({ label, subtitle, keyName, cells, tone }: {
  label: string;
  subtitle: string;
  keyName: string;
  cells: RoundCell[];
  tone: 'amber' | 'blood';
}) {
  const titleColor = tone === 'amber' ? 'text-amber-bright' : 'text-blood-glow';
  const totalPlays = cells.reduce((s, c) => s + c.plays, 0);

  return (
    <section>
      {/* Section header: big role tag on the left, meta on the right */}
      <header className="flex items-end justify-between mb-8 pb-4 border-b border-border-subtle/60 gap-4">
        <div className="flex items-baseline gap-4 sm:gap-6 flex-wrap">
          <h3 className={'font-gothic text-2xl sm:text-3xl tracking-[8px] leading-none ' + titleColor}>
            {label}
          </h3>
          <span className="text-[11px] sm:text-xs tracking-[4px] text-text-secondary font-display uppercase">
            {subtitle}
          </span>
        </div>
        <div className="text-right whitespace-nowrap">
          <p className="text-[11px] tracking-[3px] text-text-secondary font-display uppercase">
            第 N 回合亮出<span className={titleColor + ' font-bold'}>{keyName}</span>的比例
          </p>
          <p className="text-[10px] tracking-[2px] text-text-muted font-mono mt-1">
            n<sub>total</sub> = {totalPlays}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-5 gap-3 sm:gap-8">
        {cells.map((cell) => (
          <TimingColumn key={cell.round} cell={cell} tone={tone} />
        ))}
      </div>
    </section>
  );
}

function BetHabitsRow({ b }: { b: BetBucket }) {
  const keyPct = raw(b.keyRate);
  const winPct = raw(b.winRate);
  const hasData = b.plays > 0;
  return (
    <div className="grid grid-cols-[80px_1fr_1fr] sm:grid-cols-[120px_1fr_1fr_auto] gap-4 sm:gap-10 items-center py-6 border-b border-border-subtle/40 last:border-b-0">
      {/* Multiplier stamp */}
      <div className="flex items-center justify-start">
        <span
          className="font-gothic text-3xl sm:text-4xl leading-none text-blood-glow"
          style={{ textShadow: '0 0 18px rgba(198,40,40,0.5)' }}
        >
          {b.label}
        </span>
      </div>

      {/* 关键牌率 */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] tracking-[4px] text-text-secondary font-display font-bold uppercase">
            关 键 牌 率
          </span>
          <span
            className="font-display font-bold text-2xl sm:text-3xl text-amber-bright leading-none"
            style={hasData && keyPct > 0 ? { textShadow: '0 0 14px rgba(196,154,48,0.5)' } : undefined}
          >
            {hasData ? keyPct : '—'}
            {hasData && <span className="text-sm sm:text-base align-top ml-0.5 opacity-80">%</span>}
          </span>
        </div>
        <div className="h-2 bg-black/60 border border-border-subtle/40">
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${keyPct}%`,
              background: 'linear-gradient(90deg, #c49a30 0%, #e8b850 100%)',
              boxShadow: keyPct > 0 ? '0 0 12px rgba(196,154,48,0.5)' : 'none',
            }}
          />
        </div>
      </div>

      {/* 胜率 */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] tracking-[4px] text-text-secondary font-display font-bold uppercase">
            胜 率
          </span>
          <span
            className="font-display font-bold text-2xl sm:text-3xl text-teal-bright leading-none"
            style={hasData && winPct > 0 ? { textShadow: '0 0 14px rgba(80,180,180,0.55)' } : undefined}
          >
            {hasData ? winPct : '—'}
            {hasData && <span className="text-sm sm:text-base align-top ml-0.5 opacity-80">%</span>}
          </span>
        </div>
        <div className="h-2 bg-black/60 border border-border-subtle/40">
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${winPct}%`,
              background: 'linear-gradient(90deg, #2a8a8a 0%, #4bc7c7 100%)',
              boxShadow: winPct > 0 ? '0 0 12px rgba(80,180,180,0.4)' : 'none',
            }}
          />
        </div>
      </div>

      {/* Sample count — desktop only, keeps mobile rows compact */}
      <span className="hidden sm:block text-[11px] tracking-[3px] text-text-muted font-mono whitespace-nowrap text-right">
        n = {b.plays}
      </span>
    </div>
  );
}

function BetHabitsSection({ buckets }: { buckets: BetBucket[] }) {
  return (
    <section>
      <header className="flex items-end justify-between mb-8 pb-4 border-b border-border-subtle/60 gap-4">
        <div className="flex items-baseline gap-4 sm:gap-6 flex-wrap">
          <h3 className="font-gothic text-2xl sm:text-3xl tracking-[8px] leading-none text-text-bright">
            注 码 习 惯
          </h3>
          <span className="text-[11px] sm:text-xs tracking-[4px] text-text-secondary font-display uppercase">
            Bluff or Bite
          </span>
        </div>
        <p className="text-[11px] tracking-[3px] text-text-secondary font-display uppercase text-right whitespace-nowrap">
          下重注时，你手里到底<span className="text-text-bright font-bold">有没有货</span>
        </p>
      </header>
      <div className="flex flex-col">
        {buckets.map((b) => (
          <BetHabitsRow key={b.label} b={b} />
        ))}
      </div>
    </section>
  );
}

// Regicides aren't derivable from the tendency log (it records your card, not the
// opponent's), so we don't fabricate a count here — the badge omits it when null.
function countRegicides(_data: DossierData): number | null {
  return null;
}

// The persona hero. Locked (with a progress gate) until enough showdowns; then it
// breaks its seal and reveals the card, with a share link that carries the real numbers.
function PersonaHero({ persona, handle, hitRate, regicides }: {
  persona: PersonaResult;
  handle?: string;
  hitRate: number | null;
  regicides: number | null;
}) {
  if (!persona.settled) {
    return (
      <section className="text-center border border-border-subtle/50 bg-black/30 px-6 py-9">
        <p className="font-gothic text-cracked text-2xl sm:text-3xl tracking-[8px] text-text-secondary mb-4">人 格 待 定</p>
        <p className="text-sm text-text-muted tracking-[2px] font-display">
          还需 <span className="text-amber-bright font-bold">{persona.needMore}</span> 个摊牌回合，你的打牌人格才会成形
        </p>
        <p className="text-[11px] text-text-dim tracking-[2px] font-display mt-2">弃牌不算——只有摊牌才暴露你是谁</p>
      </section>
    );
  }

  const p = personaByLatin(persona.latin);
  const shareUrl = (() => {
    const a = persona.axes.map((x) => x.pct).join(',');
    const params = new URLSearchParams({ a });
    if (handle) params.set('u', handle);
    if (hitRate != null) params.set('h', String(Math.round(hitRate * 100)));
    if (regicides != null) params.set('r', String(regicides));
    return `/type/${persona.latin}?${params.toString()}`;
  })();

  const copyShare = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard?.writeText(window.location.origin + shareUrl).catch(() => {});
  };

  return (
    <section className="flex flex-col items-center gap-5 persona-reveal">
      <PersonaBadge
        latin={persona.latin}
        axes={persona.axes}
        handle={handle}
        hitRate={hitRate}
        regicides={regicides}
      />
      <div className="flex gap-3">
        <a href={shareUrl} target="_blank" rel="noreferrer">
          <DecoButton color="amber" size="sm" onClick={() => {}}>公 开 页</DecoButton>
        </a>
        <DecoButton color="neutral" size="sm" onClick={copyShare}>复 制 链 接</DecoButton>
      </div>
      {p && (
        <p className="text-[11px] text-text-dim tracking-[2px] font-display text-center max-w-md">
          你的天敌是「{personaByLatin(p.nemesis)?.bigName}」—— 在真人对战里遇到他，小心
        </p>
      )}
    </section>
  );
}

function SummarySection({ data }: { data: DossierData }) {
  const winRate = data.totalEvents > 0 ? data.wins / data.totalEvents : null;
  const stats = [
    { value: String(data.totalEvents), label: '已 记 录 回 合', sub: 'Rounds Logged', tone: 'bright' as const },
    { value: pct(winRate), label: '胜 率', sub: 'Win Rate', tone: 'amber' as const },
    { value: String(data.folds), label: '主 动 弃 牌', sub: 'Folds', tone: 'blood' as const },
  ];
  const toneClass = {
    bright: 'text-text-bright',
    amber: 'text-amber-bright',
    blood: 'text-blood-glow',
  };
  const toneShadow = {
    bright: '0 0 22px rgba(240,220,180,0.3)',
    amber: '0 0 22px rgba(196,154,48,0.5)',
    blood: '0 0 22px rgba(198,40,40,0.5)',
  };
  return (
    <section className="grid grid-cols-3 gap-2 sm:gap-6">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={
            'text-center py-2 ' +
            (i > 0 ? 'border-l border-border-subtle/50' : '')
          }
        >
          <div
            className={'font-display font-bold leading-none text-5xl sm:text-6xl md:text-7xl ' + toneClass[s.tone]}
            style={{ textShadow: toneShadow[s.tone] }}
          >
            {s.value}
          </div>
          <p className="text-[11px] sm:text-xs tracking-[6px] text-text-secondary font-display font-bold mt-5 uppercase">
            {s.label}
          </p>
          <p className="text-[10px] tracking-[3px] text-text-muted font-mono uppercase mt-1.5">{s.sub}</p>
        </div>
      ))}
    </section>
  );
}

export default function DossierPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<DossierData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/stats/me')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'));
  }, [status]);

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-4 py-16 sm:py-20 relative overflow-hidden">
      <BackButton onClick={() => router.push('/')} />

      {/* Ambient — gold in the upper left where the eye lands, blood in the lower right */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 20% 12%, rgba(196,154,48,0.09) 0%, transparent 55%),' +
            'radial-gradient(ellipse 60% 40% at 80% 100%, rgba(170,17,17,0.09) 0%, transparent 55%)',
        }}
      />

      <div className="relative w-full max-w-5xl">
        {/* Header plate */}
        <header className="text-center mb-14 slide-up">
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="w-16 sm:w-32 h-px bg-gradient-to-r from-transparent to-amber/60" />
            <Flourish />
          </div>
          <h1 className="font-gothic text-cracked text-6xl sm:text-7xl md:text-8xl tracking-[12px] text-amber-bright leading-none">
            密 档
          </h1>
          <p className="text-[11px] tracking-[10px] text-text-secondary font-display mt-5 uppercase">
            Dossier · Case File
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Flourish flip />
            <div className="w-16 sm:w-32 h-px bg-gradient-to-l from-transparent to-amber/60" />
          </div>

          {session?.user && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Stamp>标 记 对 象</Stamp>
              <span className="text-lg sm:text-xl font-display font-bold tracking-[4px] text-text-bright uppercase">
                {session.user.name || session.user.email}
              </span>
            </div>
          )}
        </header>

        {/* File folder body */}
        <div
          className="relative border border-border/70 bg-abyss/85 backdrop-blur-sm px-5 sm:px-14 py-10 sm:py-14 fade-in-up"
          style={{ animationDelay: '150ms' }}
        >
          {/* Bold corner brackets — this is a classified file, not a card */}
          <span className="absolute -top-px -left-px w-10 h-10 border-t-2 border-l-2 border-amber/70" />
          <span className="absolute -top-px -right-px w-10 h-10 border-t-2 border-r-2 border-amber/70" />
          <span className="absolute -bottom-px -left-px w-10 h-10 border-b-2 border-l-2 border-amber/70" />
          <span className="absolute -bottom-px -right-px w-10 h-10 border-b-2 border-r-2 border-amber/70" />

          {status === 'loading' && (
            <p className="text-center text-text-secondary text-lg tracking-[6px] font-display py-24">
              调 取 中 …
            </p>
          )}

          {status === 'unauthenticated' && (
            <div className="text-center py-20">
              <p className="text-text-bright text-lg sm:text-xl tracking-[4px] font-display mb-3">
                密档只为有名字的赌徒建立。
              </p>
              <p className="text-sm text-text-secondary tracking-[3px] font-display mb-10">
                登录后，每一次摊牌都会被记录在案
              </p>
              <DecoButton color="amber" size="md" onClick={() => router.push('/login')}>
                登 录 / 注 册
              </DecoButton>
            </div>
          )}

          {status === 'authenticated' && error && (
            <p className="text-center text-blood-glow text-lg tracking-[4px] font-display py-24">
              调 取 失 败 · {error}
            </p>
          )}

          {status === 'authenticated' && !error && data && data.totalEvents < 5 && (
            <div className="text-center py-20">
              <p className="font-gothic text-cracked text-3xl sm:text-4xl text-text-secondary tracking-[8px] mb-6">
                档 案 尚 薄
              </p>
              <p className="text-base text-text-secondary tracking-[3px] font-display">
                已记录 <span className="text-text-bright font-bold">{data.totalEvents}</span> 个回合 · 至少 5 个回合后生成倾向分析
              </p>
              <p className="text-sm text-text-muted tracking-[3px] font-display mt-3">
                去牌桌上留下更多痕迹吧
              </p>
            </div>
          )}

          {status === 'authenticated' && !error && data && data.totalEvents >= 5 && (
            <div className="flex flex-col gap-14 sm:gap-16">
              <PersonaHero
                persona={data.persona}
                handle={session?.user?.name || session?.user?.email || undefined}
                hitRate={data.totalEvents > 0 ? data.wins / data.totalEvents : null}
                regicides={countRegicides(data)}
              />

              <SummarySection data={data} />

              <TimingSection
                label="皇 帝 方"
                subtitle="Emperor · when you show your hand"
                keyName="皇帝牌"
                cells={data.grid.emperor}
                tone="amber"
              />
              <TimingSection
                label="奴 隶 方"
                subtitle="Slave · when you strike"
                keyName="奴隶牌"
                cells={data.grid.slave}
                tone="blood"
              />

              <BetHabitsSection buckets={data.betBuckets} />

              <p className="text-center text-xs tracking-[4px] text-text-muted font-display pt-6 border-t border-border-subtle/40 leading-relaxed">
                密档由每一次摊牌累积而成
                <span className="mx-3 text-text-dim">·</span>
                将来，你的对手可以出价窥视它
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
