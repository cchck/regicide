import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { personaByLatin, PERSONAS } from '@/lib/persona-data';
import type { AxisResult } from '@/lib/persona';
import { AXES } from '@/lib/persona-data';
import PersonaBadge from '@/components/PersonaBadge';
import Flourish from '@/components/Flourish';

// Prebuild all 16 archetype pages; personalised query params render at request time.
export function generateStaticParams() {
  return PERSONAS.map((p) => ({ latin: p.latin }));
}

type SearchParams = { u?: string; a?: string; h?: string; r?: string };

export async function generateMetadata(
  { params }: { params: Promise<{ latin: string }> },
): Promise<Metadata> {
  const { latin } = await params;
  const p = personaByLatin(latin);
  if (!p) return { title: '弑君 · 打牌人格' };
  const title = `${p.bigName}（${p.smallName}）· 弑君打牌人格`;
  return {
    title,
    description: p.oneLiner,
    openGraph: { title, description: p.oneLiner, images: [`/type/${p.latin}/opengraph-image`] },
    twitter: { card: 'summary_large_image', title, description: p.oneLiner },
  };
}

// Personal share links carry the real axis leans as ?a=72,58,81,69 — decode back to the
// AxisResult shape the badge expects; fall back to the archetype view when absent. The
// pole is implied by the archetype's own code letter, so decoding needs the latin id.
function decodeAxes(latin: string, a?: string): AxisResult[] | undefined {
  if (!a) return undefined;
  const nums = a.split(',').map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return undefined;
  return AXES.map((ax, i) => {
    const pct = Math.min(100, Math.max(50, Math.round(nums[i])));
    const pole = (ax.letters[0] === latin[i] ? 0 : 1) as 0 | 1;
    return { key: ax.key, pole, pct, confident: true };
  });
}

export default async function TypePage(
  { params, searchParams }: { params: Promise<{ latin: string }>; searchParams: Promise<SearchParams> },
) {
  const { latin } = await params;
  const sp = await searchParams;
  const p = personaByLatin(latin);
  if (!p) notFound();

  const axes = decodeAxes(p.latin, sp.a);
  const hitRate = sp.h != null && sp.h !== '' ? Number(sp.h) / 100 : null;
  const regicides = sp.r != null && sp.r !== '' ? Number(sp.r) : null;

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-14 relative overflow-hidden">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(196,154,48,0.06) 0%, transparent 60%),' +
            'radial-gradient(ellipse 70% 45% at 50% 100%, rgba(170,17,17,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-md flex flex-col items-center gap-8">
        <div className="text-center slide-up">
          <div className="flex items-center justify-center gap-3">
            <Flourish />
            <p className="font-gothic text-cracked text-3xl tracking-[8px] text-blood">弑 君</p>
            <Flourish flip />
          </div>
          <p className="text-[10px] tracking-[6px] text-text-dim font-display mt-2 uppercase">打 牌 人 格 · Persona</p>
        </div>

        <PersonaBadge
          latin={p.latin}
          axes={axes}
          handle={sp.u}
          hitRate={hitRate}
          regicides={regicides}
        />

        {/* Viral loop — the whole point of the public page */}
        <div className="text-center flex flex-col items-center gap-3">
          <p className="text-sm tracking-[3px] text-text-secondary font-display">你，又是哪一种赌徒?</p>
          <Link
            href="/"
            className="px-7 py-3 border border-amber/60 text-amber-bright hover:bg-amber/10 hover:border-amber transition-colors text-sm tracking-[4px] font-display uppercase"
            style={{ clipPath: 'polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)' }}
          >
            测 测 你 自 己 →
          </Link>
        </div>
      </div>
    </div>
  );
}
