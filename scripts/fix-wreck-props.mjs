// 沉船道具的一次性几何修正。
//
//   node scripts/fix-wreck-props.mjs
//
// 和 fix-eastern-props.mjs 同样的规矩：必须在 optimize-models.mjs 之前跑，因为 meshopt
// 压缩会把顶点位置量化成归一化 int16 + 节点级反量化缩放，压完之后读到的坐标不再是模型
// 空间的数值。修正后的几何同时写进 live 和 _raw/，Meshy 原件另存 _orig_ 前缀留档 ——
// optimize 每次都从 _raw/ 重压，raw 里躺着没修的原件就等于白修。
//
// wreck_bottle：瓶子断成两截。
//   沿 X 每 1/24 切片，瓶颈在 [-0.95, -0.40]（半径 0.13→0.28），瓶身在 [0.55, 0.95]
//   （半径 0.26→0.29），中间 [-0.32, 0.55] 整整 0.87 单位完全是空的，占全长 46%。
//   直接用会渲染成两块悬空的碎片。
//
//   不用重新生成：瓶肩末端半径 0.276、瓶身起始半径 0.259，两个断面几乎一样粗，
//   把瓶身整体沿 -X 推 0.87 就能接上，接缝落在半径连续的地方。

import { NodeIO } from '@gltf-transform/core';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const DIR = 'public/models';
const RAW = `${DIR}/_raw`;
const io = new NodeIO();

/** 空隙靠瓶身那一侧的分界；空隙内没有任何顶点，取中间任意值都安全。 */
const BOTTLE_SPLIT_X = 0.1;
/** 空隙宽度：瓶身起点 0.55 减去瓶肩终点 -0.32。 */
const BOTTLE_GAP = 0.87;

mkdirSync(RAW, { recursive: true });

function claim(name) {
  const live = `${DIR}/${name}.glb`;
  const raw = `${RAW}/${name}.glb`;
  const orig = `${RAW}/_orig_${name}.glb`;
  if (existsSync(orig)) {
    console.log(`· ${name} — 已处理过，跳过`);
    return null;
  }
  copyFileSync(live, orig);
  return { live, raw, orig };
}

function bbox(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        for (let k = 0; k < 3; k++) {
          if (v[k] < min[k]) min[k] = v[k];
          if (v[k] > max[k]) max[k] = v[k];
        }
      }
    }
  return { min, max };
}

const bottle = claim('wreck_bottle');
if (bottle) {
  const doc = await io.read(bottle.orig);
  let moved = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        if (v[0] > BOTTLE_SPLIT_X) {
          v[0] -= BOTTLE_GAP;
          pos.setElement(i, v);
          moved++;
        }
      }
    }
  const { min, max } = bbox(doc);
  console.log(`✓ wreck_bottle  瓶身沿 -X 推 ${BOTTLE_GAP}，接回瓶肩：移动 ${moved} 个顶点`);
  console.log(`  → 尺寸 [${max.map((v, i) => (v - min[i]).toFixed(3)).join(', ')}]  minY=${min[1].toFixed(3)}`);
  await io.write(bottle.live, doc);
  await io.write(bottle.raw, doc);
}

// 其余四件几何正常（钟/铭牌/救生圈都是朝 ±Z 的薄板，礼帽质量在底部、侧躺），只留档。
for (const name of ['wreck_clock', 'wreck_plaque', 'wreck_lifering', 'wreck_hat']) {
  const p = claim(name);
  if (p) {
    copyFileSync(p.orig, p.raw);
    console.log(`✓ ${name}  几何正常，原样留档`);
  }
}

console.log('\n完成。接着跑 node scripts/optimize-models.mjs');
