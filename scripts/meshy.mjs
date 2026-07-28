// Meshy 资产生成流水线。
//
//   node scripts/meshy.mjs list                  列出所有已登记的资产和它们的 prompt
//   node scripts/meshy.mjs plan <name...>        只报价和显示参数，不花额度
//   node scripts/meshy.mjs gen  <name...>        真正生成（烧额度）：preview → refine → 下载
//   node scripts/meshy.mjs rig  <name>           给已生成的角色绑骨
//   node scripts/meshy.mjs anim <name> <id...>   套动画（action_id 见 ANIMATIONS）
//
// API key 从 .env 的 MESHY_API_KEY 读，脚本从不打印它。
// 产物：public/models/<name>.glb  +  public/models/_preview/<name>.png（缩略图，供人眼过目）

import { writeFile, mkdir } from 'node:fs/promises';
import process from 'node:process';

try {
  process.loadEnvFile('.env');
} catch {
  /* env 可能已在环境里 */
}

const API = 'https://api.meshy.ai';
const KEY = process.env.MESHY_API_KEY;
const OUT = 'public/models';
const THUMBS = 'public/models/_preview';

// 所有 prompt 共用的风格后缀，保证全套资产调性统一。
const STYLE = 'Game-ready, clean topology, PBR materials, low poly. Dark Art Deco, 1920s underground casino. Muted colors: matte black, deep blood red, antique gold.';

// 资产登记表 —— 与 ASSETS.md 保持一致。
// pose: 'a-pose' 只给人形角色（绑骨需要）；道具留 null。
const ASSETS = {
  // 迭代记录：
  //  v1 "fingers curled as if holding cards" → 生成五指张开的平摊手，抓不住东西
  //  v2 让它连牌一起生成    → 手指糊成连指手套，且牌焊死在网格里、和我们自己的牌美术冲突
  //  v3 纯握拳、不要牌，把"手指分明"写进正面词、"连指手套"写进负面词。牌扇由代码插进拳心。
  hand: {
    polycount: 20000,
    pose: null,
    negative: 'shiny, glossy, latex, wet look, plastic, bow, ribbon, decoration, open palm, splayed fingers, flat hand, mitten, fused fingers, smooth blob, playing cards, arm, body',
    prompt: `A left hand in a black leather glove, closed into a firm fist, seen from the side. Individual fingers clearly defined and separated, distinct knuckles, visible creases between each finger segment. Fingers curled tightly against the palm, thumb folded across the front. Matte worn leather with fabric wrinkles, completely non-reflective. A dark red cuff band around the wrist, plain and simple. Only the hand, cut off at the wrist.`,
  },
  // 要绑骨的角色必须用四边面：边环顺着形体走，骨头一弯褶皱才自然折叠；
  // 三角面在关节处会挤压破面。静态道具不涉及形变，三角面即可。
  dealer: {
    polycount: 30000,
    pose: 'a-pose',
    topology: 'quad',
    rig: true,
    prompt: `A tall menacing hooded card dealer, full body, standing, symmetrical. Long black hooded cloak with deep cowl completely shadowing the face, floor-length robe with heavy cloth folds, dark red sash across the chest, gold chain with a small red medallion, black gloves. Elegant and sinister occult casino dealer.`,
  },
  eardrill: {
    polycount: 30000,
    pose: null,
    prompt: `A menacing antique torture machine: a long sharp steel spike on a threaded screw feed rail, mounted on a heavy iron gallows post bolted to the floor. Brass ratchet gear, pressure gauge dial, small red warning lamp, a restraint ring at the tip. Rusted iron and tarnished brass, old bloodstains near the needle. Industrial horror execution device.`,
  },
  spectator: {
    polycount: 15000,
    pose: 'a-pose',
    topology: 'quad',
    prompt: `A man in a 1920s black three-piece suit standing still, hands clasped in front, head slightly lowered, face completely in shadow and featureless. Motionless ominous observer.`,
  },
  chair: {
    polycount: 20000,
    pose: null,
    prompt: `An ornate Art Deco high-back armchair, dark wood frame with gold inlay, deep red velvet upholstery, fan-shaped back. Throne-like, sinister elegance.`,
  },
  chandelier: {
    polycount: 25000,
    pose: null,
    prompt: `An Art Deco chandelier: a brass ring with eight candle holders, stepped geometric finial below, hanging rod above. Tarnished gold, crystal accents.`,
  },
  column: {
    polycount: 15000,
    pose: null,
    prompt: `A fluted Art Deco column with a stepped capital, dark stone with vertical gold inlay strips.`,
  },
  cigar: {
    polycount: 10000,
    pose: null,
    prompt: `A lit cigar resting on an ornate brass ashtray, glowing ash tip, thin trail of smoke.`,
  },
  whiskey: {
    polycount: 12000,
    pose: null,
    prompt: `A crystal whiskey decanter and a half-full tumbler, amber liquid, cut glass.`,
  },
  cash: {
    polycount: 10000,
    pose: null,
    prompt: `Stacks of banded 1920s banknotes, tied paper money bundles piled together.`,
  },
};

// 动画库 action_id（Meshy Animation Library）。名字是我们游戏里的轨道名。
export const ANIMATIONS = {
  idle: 33, // Chair_Sit_Idle_M —— 坐姿待机
  idle_alt: 364, // Sit_on_Chair_Arms_Crossed
  think: 36, // Confused_Scratch
  taunt: 88, // Chest_Pound_Taunt
  angry: 311, // Stand_Talking_Angry
  win: 59, // Victory_Cheer
  hit: 7, // BeHit_FlyUp
};

function need(cond, msg) {
  if (!cond) {
    console.error(`\x1b[31m${msg}\x1b[0m`);
    process.exit(1);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
  }
  return body;
}

// 轮询直到任务结束，回显进度。
async function poll(path, label) {
  let last = -1;
  for (;;) {
    const t = await api(path);
    if (t.progress !== last) {
      process.stdout.write(`\r  ${label}: ${t.status} ${t.progress ?? 0}%   `);
      last = t.progress;
    }
    if (t.status === 'SUCCEEDED') {
      process.stdout.write('\n');
      return t;
    }
    if (t.status === 'FAILED' || t.status === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`${label} ${t.status}: ${JSON.stringify(t.task_error ?? {}, null, 2)}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${dest}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function generate(name) {
  const a = ASSETS[name];
  need(a, `未登记的资产: ${name}（可选: ${Object.keys(ASSETS).join(', ')}）`);
  console.log(`\n\x1b[36m▸ ${name}\x1b[0m  ${a.polycount} 面${a.pose ? ` · ${a.pose}` : ''}`);

  // ① preview：出几何体
  const prev = await api('/openapi/v2/text-to-3d', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'preview',
      prompt: `${a.prompt} ${STYLE}`,
      should_remesh: true,
      target_polycount: a.polycount,
      topology: a.topology ?? 'triangle',
      target_formats: ['glb'],
      ...(a.pose ? { pose_mode: a.pose } : {}),
      ...(a.negative ? { negative_prompt: a.negative } : {}),
    }),
  });
  const previewId = prev.result ?? prev.id;
  const pt = await poll(`/openapi/v2/text-to-3d/${previewId}`, '几何体');

  // ② refine：上 PBR 贴图
  const ref = await api('/openapi/v2/text-to-3d', {
    method: 'POST',
    body: JSON.stringify({ mode: 'refine', preview_task_id: previewId, enable_pbr: true }),
  });
  const refineId = ref.result ?? ref.id;
  const rt = await poll(`/openapi/v2/text-to-3d/${refineId}`, '贴图  ');

  // ③ 落盘
  await mkdir(OUT, { recursive: true });
  await mkdir(THUMBS, { recursive: true });
  const glb = rt.model_urls?.glb;
  need(glb, `没拿到 GLB 下载地址：${JSON.stringify(rt.model_urls)}`);
  await download(glb, `${OUT}/${name}.glb`);
  if (rt.thumbnail_url) await download(rt.thumbnail_url, `${THUMBS}/${name}.png`);

  const credits = (pt.consumed_credits ?? 0) + (rt.consumed_credits ?? 0);
  console.log(`  ✓ ${OUT}/${name}.glb   缩略图 ${THUMBS}/${name}.png   额度 -${credits}`);
  return { taskId: refineId, credits };
}

async function rig(name) {
  const glbPath = `${OUT}/${name}.glb`;
  console.log(`\n\x1b[36m▸ 绑骨 ${name}\x1b[0m`);
  const r = await api('/openapi/v1/rigging', {
    method: 'POST',
    body: JSON.stringify({ model_url: glbPath, height_meters: 1.8 }),
  });
  const id = r.result ?? r.id;
  const t = await poll(`/openapi/v1/rigging/${id}`, '绑骨  ');
  const url = t.result?.rigged_character_glb_url;
  need(url, '绑骨没返回 GLB');
  await download(url, `${OUT}/${name}_rigged.glb`);
  console.log(`  ✓ ${OUT}/${name}_rigged.glb   额度 -${t.consumed_credits ?? '?'}   任务ID ${id}`);
  console.log(`  ↳ 接着套动画：node scripts/meshy.mjs anim ${id} idle taunt angry`);
  return id;
}

async function animate(rigTaskId, clips) {
  for (const clip of clips) {
    const actionId = ANIMATIONS[clip] ?? Number(clip);
    need(Number.isFinite(actionId), `未知动作: ${clip}（可选: ${Object.keys(ANIMATIONS).join(', ')} 或直接给数字 action_id）`);
    console.log(`\n\x1b[36m▸ 动画 ${clip} (action_id=${actionId})\x1b[0m`);
    const r = await api('/openapi/v1/animations', {
      method: 'POST',
      body: JSON.stringify({ rig_task_id: rigTaskId, action_id: actionId, target_formats: ['glb'] }),
    });
    const id = r.result ?? r.id;
    const t = await poll(`/openapi/v1/animations/${id}`, '动画  ');
    const url = t.result?.animated_character_glb_url ?? t.model_urls?.glb;
    if (url) {
      await download(url, `${OUT}/dealer_${clip}.glb`);
      console.log(`  ✓ ${OUT}/dealer_${clip}.glb   额度 -${t.consumed_credits ?? '?'}`);
    } else {
      console.log(`  ! 没找到下载地址，原始返回：${JSON.stringify(t.result ?? t).slice(0, 300)}`);
    }
  }
}

// ————— CLI —————
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'list') {
  console.log('\n已登记的资产：\n');
  for (const [k, v] of Object.entries(ASSETS)) {
    console.log(`\x1b[36m${k}\x1b[0m  ${v.polycount} 面${v.pose ? ` · ${v.pose}` : ''}${v.rig ? ' · 需绑骨' : ''}`);
    console.log(`  ${v.prompt.slice(0, 100)}…\n`);
  }
  console.log(`动画轨道: ${Object.entries(ANIMATIONS).map(([k, v]) => `${k}=${v}`).join('  ')}\n`);
} else if (cmd === 'plan') {
  need(args.length, '用法: node scripts/meshy.mjs plan <name...>');
  console.log('\n\x1b[33m这批要生成的东西（不花额度，仅预览参数）：\x1b[0m\n');
  for (const n of args) {
    const a = ASSETS[n];
    need(a, `未登记的资产: ${n}`);
    console.log(`\x1b[36m${n}\x1b[0m  ${a.polycount} 面${a.pose ? ` · ${a.pose}` : ''}`);
    console.log(`  ${a.prompt} ${STYLE}\n`);
  }
  console.log(`共 ${args.length} 个，每个走 preview + refine 两阶段。\n`);
} else if (cmd === 'gen') {
  need(KEY, '缺少 MESHY_API_KEY —— 在 .env 里加一行 MESHY_API_KEY=你的key');
  need(args.length, '用法: node scripts/meshy.mjs gen <name...>');
  let total = 0;
  for (const n of args) {
    const { credits } = await generate(n);
    total += credits;
  }
  console.log(`\n\x1b[32m全部完成，本批共消耗额度 ${total}\x1b[0m\n`);
} else if (cmd === 'rig') {
  need(KEY, '缺少 MESHY_API_KEY');
  need(args[0], '用法: node scripts/meshy.mjs rig <name>');
  await rig(args[0]);
} else if (cmd === 'anim') {
  need(KEY, '缺少 MESHY_API_KEY');
  need(args.length >= 2, '用法: node scripts/meshy.mjs anim <rig_task_id> <clip...>');
  await animate(args[0], args.slice(1));
} else {
  console.log(`
弑君 · Meshy 资产流水线

  node scripts/meshy.mjs list                    列出已登记资产
  node scripts/meshy.mjs plan <name...>          报价/预览参数（不花额度）
  node scripts/meshy.mjs gen  <name...>          生成（烧额度）
  node scripts/meshy.mjs rig  <name>             绑骨
  node scripts/meshy.mjs anim <rigTaskId> <clip...>   套动画
`);
}
