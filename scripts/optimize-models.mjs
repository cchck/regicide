// 把 Meshy 生成的模型压到网页能用的体积。
//
//   node scripts/optimize-models.mjs
//
// Meshy 导出的东西对网页来说太重了（实测钞票 154 万面 / 64MB）。这个脚本对每个模型：
//   1. 减面（可选，按下面的 ratio；蒙皮动画模型跳过——减面会毁掉蒙皮权重）
//   2. 贴图缩到 tex
//   3. 贴图转 WebP
//   4. meshopt 压缩顶点数据（EXT_meshopt_compression）
// 原始文件备份到 public/models/_raw/，可重复运行。
//
// 关于第 4 步：有些模型（cash 就是）减面会卡在某个面数下不去——它是几百张各自独立的
// 钞票，每张一个 UV 岛，meshoptimizer 不跨接缝合并，所以几乎每条边都是不可折叠的边界。
// 面数减不动就压缩传输体积，meshopt 实测能再砍 4 倍。
// 前端不用改：drei 的 useGLTF 默认 useMeshopt=true，解码器来自 three-stdlib（打包在本地）。
// 特意没用 Draco——它的解码器默认从 gstatic CDN 拉，国内访问会挂。

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, copyFileSync, statSync, readdirSync } from 'node:fs';

const DIR = 'public/models';
const RAW = `${DIR}/_raw`;

// ratio: 保留的面数比例；null = 不减面（蒙皮模型必须 null）
// tex:   贴图边长上限。桌上的小道具在屏幕上只占几十像素，1K 贴图纯属浪费。
// error: 减面允许的几何误差（网格尺寸的比例）。ratio 只是目标，误差超了就会提前停，
//        所以狠减的模型必须同时放宽 error，否则跑完面数根本降不下去。
const PLAN = {
  dealer: { ratio: null, tex: 1024, note: '有骨骼动画，减面会毁蒙皮权重' },
  hand: { ratio: 0.5, tex: 1024, note: '静态道具，2万面用不上' },
  eardrill: { ratio: 0.7, tex: 1024, note: '结构细节要留一些' },
  spectator: { ratio: 0.35, tex: 1024, note: '背景剪影，复制 9 份，越轻越好' },
  chair: { ratio: 0.04, tex: 1024, note: '标准模式生成的 62 万面，狠减' },

  chandelier: { ratio: 0.03, error: 0.01, tex: 1024, note: '111 万面。头顶中景，轮廓要留' },
  column: { ratio: 0.04, error: 0.01, tex: 1024, note: '27 万面。远景，但复制 4 份且占满整个画面高度' },
  cigar: { ratio: 0.02, error: 0.02, tex: 512, note: '99 万面的烟灰缸，桌上只有 5cm' },
  cash: { ratio: 0.015, error: 0.02, tex: 512, note: '154 万面。整个项目最重的一个，而它只是桌上一摞钱' },
  whiskey: { ratio: 0.03, error: 0.015, tex: 512, note: '67 万面。玻璃靠反射不靠面数' },

  // 智能拓扑生成的，本来就只有 5k 面 —— 不用减面，体积全在贴图上。
  table_deco: { ratio: null, tex: 1024, note: '画面主体，贴图留 1K' },
  sconce_deco: { ratio: null, tex: 512, note: '4 个实例但都在中景，512 够' },
  ceiling_rose: { ratio: null, tex: 512, note: '抬头才看得到' },

  // 抵押物套装 —— 桌上只占十几厘米，512 贴图绰绰有余。
  prop_ring: { ratio: null, tex: 512, note: '婚戒与怀表' },
  prop_ticket: { ratio: null, tex: 512, note: '当票与火漆' },
  prop_teeth: { ratio: null, tex: 512, note: '义眼与金牙' },
  // 东方局 —— 智能拓扑生成的，面数本来就低（5k/5k/8.7k），体积全在 4 张 2048 贴图上。
  // 几何已由 scripts/fix-eastern-props.mjs 预先修正过（铜钱躺平、香炉去碎片）。
  prop_teapot: { ratio: null, tex: 512, note: '紫砂壶与杯，桌上 14cm' },
  prop_coins: { ratio: null, tex: 512, note: '铜钱串，桌上 18cm' },
  prop_incense: { ratio: null, tex: 512, note: '铜香炉，桌上 12cm' },

  // 沉船宴会厅 —— 智能拓扑，面数本来就低。舷窗和栏板要复制多份，贴图压狠一点。
  ship_porthole: { ratio: null, tex: 512, note: '侧墙 6 个实例，中景' },
  ship_hatch: { ratio: null, tex: 1024, note: '玩家身后，近景，细节要留' },
  ship_chandelier_sunk: { ratio: null, tex: 1024, note: '泡在水里，中近景' },
  ship_balustrade: { ratio: null, tex: 512, note: '背景 5 段，远景' },

  table_obsidian: { ratio: null, tex: 1024, note: '画面主体' },
  table_jade: { ratio: null, tex: 1024, note: '画面主体，玉的纹理要留' },
  chandelier_skull: { ratio: null, tex: 1024, note: '头顶中景，骷髅细节要认得出' },
  throne_bone: { ratio: null, tex: 1024, note: '庄家身后，中景' },
};

const mb = (p) => (statSync(p).size / 1e6).toFixed(2) + 'MB';
const gltf = (args) => execFileSync('npx', ['gltf-transform', ...args], { stdio: 'pipe' });

mkdirSync(RAW, { recursive: true });

const models = readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => f.replace('.glb', ''));
let before = 0;
let after = 0;

for (const name of models) {
  const plan = PLAN[name];
  if (!plan) {
    console.log(`· ${name} — 没有优化计划，跳过`);
    continue;
  }
  const live = `${DIR}/${name}.glb`;
  const raw = `${RAW}/${name}.glb`;

  // 第一次跑的时候把原始文件存起来；之后每次都从原始文件重新压，避免反复有损。
  if (!existsSync(raw)) copyFileSync(live, raw);

  const sizeBefore = statSync(raw).size;
  before += sizeBefore;

  let src = raw;
  const tmp = [];
  try {
    if (plan.ratio !== null) {
      const out = `/tmp/_opt_${name}_s.glb`;
      gltf(['simplify', src, out, '--ratio', String(plan.ratio), '--error', String(plan.error ?? 0.002)]);
      src = out;
      tmp.push(out);
    }
    const tex = String(plan.tex ?? 1024);
    const resized = `/tmp/_opt_${name}_r.glb`;
    gltf(['resize', src, resized, '--width', tex, '--height', tex]);
    tmp.push(resized);

    const webp = `/tmp/_opt_${name}_w.glb`;
    gltf(['webp', resized, webp]);
    tmp.push(webp);

    gltf(['meshopt', webp, live]);

    after += statSync(live).size;
    console.log(`✓ ${name.padEnd(10)} ${mb(raw).padStart(8)} → ${mb(live).padStart(8)}   (${plan.note})`);
  } catch (err) {
    console.error(`✗ ${name} 优化失败:`, err.stderr?.toString().slice(0, 200) ?? err.message);
    copyFileSync(raw, live); // 失败就还原
    after += statSync(live).size;
  }
}

console.log(`\n总计: ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB  (原始文件备份在 ${RAW}/)`);
