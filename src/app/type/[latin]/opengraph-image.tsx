import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { personaByLatin, FACTIONS, AXES } from '@/lib/persona-data';

// Social-preview card (WeChat / 朋友圈 / Twitter). Chinese renders via a subsetted Noto
// Serif SC (Google `&text=` subset, ~84KB — the only glyphs the 16 names use).
//
// Hard-won satori note: the earlier "reading '258'" crashes were NOT the font — they were
// 8-digit #RRGGBBAA hex colours and dynamic computed style keys, which satori's parser
// rejects. So: every colour here is rgba(), every div declares display:flex, no textShadow.
export const runtime = 'nodejs';
export const alt = '弑君 · 打牌人格';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// #rrggbb → rgba() so satori never sees hex-with-alpha.
function rgba(hex: string, a = 1): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
function pole(latin: string, i: number): 0 | 1 {
  return AXES[i].letters[0] === latin[i] ? 0 : 1;
}

export default async function OG({ params }: { params: Promise<{ latin: string }> }) {
  const { latin } = await params;
  const p = personaByLatin(latin);
  if (!p) return new Response('Not found', { status: 404 });
  const f = FACTIONS[p.faction];
  const sc = await readFile(join(process.cwd(), 'public/fonts/persona-sc.ttf'));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', position: 'relative',
          background: '#08080e', fontFamily: 'sc',
        }}
      >
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: f.color }} />

        {/* Left column — identity */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 8, color: rgba('#8a6a20') }}>REGICIDE · 弑君</div>
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: 8, color: f.color, marginTop: 22 }}>{f.name}</div>
          <div style={{ display: 'flex', fontSize: 130, letterSpacing: 10, color: f.color, marginTop: 4 }}>{p.bigName}</div>
          <div style={{ display: 'flex', fontSize: 40, letterSpacing: 10, color: rgba('#c8bca8'), marginTop: 16 }}>{p.smallName}</div>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 4, color: rgba('#6a6a74'), marginTop: 16 }}>{p.latin} · {p.code}</div>
          <div style={{ display: 'flex', fontSize: 27, color: rgba('#b0a898'), marginTop: 26, maxWidth: 640 }}>{p.oneLiner}</div>
        </div>

        {/* Right column — axis bars */}
        <div style={{ width: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30, padding: '0 54px 0 30px', borderLeft: `1px solid ${rgba('#c49a30', 0.15)}` }}>
          {AXES.map((ax, i) => {
            const left = pole(p.latin, i) === 0;
            return (
              <div key={ax.key} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', width: 44, fontSize: 34, color: f.color }}>{ax.poles[left ? 0 : 1]}</div>
                <div style={{ display: 'flex', flex: 1, height: 8, background: rgba('#1c1c26'), position: 'relative' }}>
                  <div style={{ display: 'flex', position: 'absolute', top: 0, left: left ? 0 : 84, height: 8, width: 140, background: f.color }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3, color: rgba('#5a5a64'), marginTop: 8 }}>type · {p.latin}</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'sc', data: sc, weight: 700, style: 'normal' }] },
  );
}
