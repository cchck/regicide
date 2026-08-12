// 东方局三件套的一次性几何修正。
//
//   node scripts/fix-eastern-props.mjs
//
// 必须在 optimize-models.mjs 之前跑，而且只跑一次（脚本自己防重入）。原因是 meshopt 压缩
// 会把顶点位置量化成归一化 int16 + 一个节点级的反量化缩放，压完之后读到的坐标就不再是
// 模型空间的米制数值了 —— 耳钻那次分裂 bug 就是栽在这上面。所以几何修正一律在压缩前、
// 在还是普通 float 的原始文件上做。
//
// 两处修正，都是从 GLB 里量出来的，不是猜的：
//
// 1. prop_coins 是立着的。Z 只有 ±0.20（最薄），Y 有 ±0.95（最高）—— 整串铜钱是一块
//    面朝 ±Z 的薄板，像贴在墙上的牌子。绕 X 转 -90° 让它躺平。
//
// 2. prop_incense 带一块悬空碎片。沿 Y 切片：炉身在 [-0.93, -0.19]（X±0.95 的宽腹），
//    中间六个 bin 完全是空的，然后 [0.46, 0.93] 有 342 个顶点缩在 X[0.34,0.48]
//    Z[0.36,0.46] 一个角落里。香如果真插在灰床上，应该在中心且从灰床连续向上，不会
//    悬在半空的一角。切掉，香我们自己用两根圆柱画（顺带拿到准确的烟源点）。

import { NodeIO } from '@gltf-transform/core';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const DIR = 'public/models';
const RAW = `${DIR}/_raw`;
const io = new NodeIO();

/** 炉身顶面。切片显示 -0.19 那一格只剩 8 个退化顶点，取 -0.15 干净利落。 */
const INCENSE_CROP_Y = -0.15;

mkdirSync(RAW, { recursive: true });

/**
 * 备份 Meshy 的原件，返回要写入的路径。
 *
 * 修正后的几何必须同时写进 live 和 _raw/：optimize-models.mjs 每次都从 _raw/ 重新压缩
 * （避免反复有损），如果 _raw/ 里躺的是没修正的原件，压一次就把方向和碎片全带回来了。
 * Meshy 原件另存为 _orig_ 前缀，只作留档，不参与流水线。
 */
function claim(name) {
  const live = `${DIR}/${name}.glb`;
  const raw = `${RAW}/${name}.glb`;
  const orig = `${RAW}/_orig_${name}.glb`;
  if (existsSync(orig)) {
    console.log(`· ${name} — 已处理过（${orig} 存在），跳过`);
    return null;
  }
  copyFileSync(live, orig);
  return { live, raw, orig };
}

/** 把 (x,y,z) → (x, z, -y)：绕 X 轴 -90°。位置和法线都要转。 */
function layFlat(doc) {
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const key of ['POSITION', 'NORMAL']) {
        const attr = prim.getAttribute(key);
        if (!attr) continue;
        const v = [0, 0, 0];
        for (let i = 0; i < attr.getCount(); i++) {
          attr.getElement(i, v);
          attr.setElement(i, [v[0], v[2], -v[1]]);
        }
      }
}

/** 丢掉重心高于 maxY 的三角形。只重写索引，孤立顶点交给 prune。 */
function cropAbove(doc, maxY) {
  let dropped = 0;
  let kept = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      if (!pos || !idx) continue;
      const src = idx.getArray();
      const out = [];
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const c = [0, 0, 0];
      for (let t = 0; t < src.length; t += 3) {
        pos.getElement(src[t], a);
        pos.getElement(src[t + 1], b);
        pos.getElement(src[t + 2], c);
        if ((a[1] + b[1] + c[1]) / 3 > maxY) { dropped++; continue; }
        out.push(src[t], src[t + 1], src[t + 2]);
        kept++;
      }
      idx.setArray(new Uint32Array(out));
    }
  return { dropped, kept };
}

function bbox(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const seen = idx ? new Set(idx.getArray()) : null; // 只看还被引用的顶点
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        if (seen && !seen.has(i)) continue;
        pos.getElement(i, v);
        for (let k = 0; k < 3; k++) {
          if (v[k] < min[k]) min[k] = v[k];
          if (v[k] > max[k]) max[k] = v[k];
        }
      }
    }
  return { min, max };
}

const report = (name, doc) => {
  const { min, max } = bbox(doc);
  const size = max.map((v, i) => (v - min[i]).toFixed(3));
  console.log(`  → 尺寸 [${size.join(', ')}]  minY=${min[1].toFixed(3)}`);
};

// ————— 1. 铜钱串躺平 —————
const coins = claim('prop_coins');
if (coins) {
  const doc = await io.read(coins.orig);
  layFlat(doc);
  console.log('✓ prop_coins  绕 X 转 -90°，从立牌改成平摊');
  report('prop_coins', doc);
  await io.write(coins.live, doc);
  await io.write(coins.raw, doc);
}

// ————— 2. 香炉切掉悬空碎片 —————
const incense = claim('prop_incense');
if (incense) {
  const doc = await io.read(incense.orig);
  const { dropped, kept } = cropAbove(doc, INCENSE_CROP_Y);
  console.log(`✓ prop_incense  切掉 Y > ${INCENSE_CROP_Y} 的悬空碎片：丢弃 ${dropped} 面，保留 ${kept} 面`);
  report('prop_incense', doc);
  await io.write(incense.live, doc);
  await io.write(incense.raw, doc);
}

// ————— 3. 紫砂壶几何没问题（Y-up，托盘平摊），只留档 —————
const teapot = claim('prop_teapot');
if (teapot) {
  copyFileSync(teapot.orig, teapot.raw);
  console.log('✓ prop_teapot  几何正常，原样留档');
}

console.log('\n完成。接着跑 node scripts/optimize-models.mjs');
