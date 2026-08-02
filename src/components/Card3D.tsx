'use client';

import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CardType } from '@/lib/types';
import { cardSvgDataUrl, cardBackSvgDataUrl, CardBackId } from '@/lib/cardArt';

const CARD_W = 0.72;
const CARD_H = 1.0;
const CARD_T = 0.022;
const CORNER_R = 0.045;

const TEX_W = 480;
const TEX_H = 672;

const textureCache = new Map<string, THREE.CanvasTexture>();

function traceRoundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

// Card art with rounded-corner alpha, matching the rounded body geometry below.
//
// The cache key is the full art id, not the card type. It used to be just the type, which
// was fine while there was exactly one back in existence — the moment backs became
// purchasable, every variant would have collided on the key `back` and the shop's live
// preview would have handed back whichever one happened to be rendered first, forever.
function getTexture(key: string, svgUrl: () => string): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    ctx.save();
    traceRoundedRect(ctx, TEX_W, TEX_H, (CORNER_R / CARD_W) * TEX_W);
    ctx.clip();
    ctx.drawImage(img, 0, 0, TEX_W, TEX_H);
    ctx.restore();
    texture.needsUpdate = true;
  };
  img.src = svgUrl();

  textureCache.set(key, texture);
  return texture;
}

const faceTexture = (type: CardType) => getTexture('face:' + type, () => cardSvgDataUrl(type));
const backTexture = (id: CardBackId) => getTexture('back:' + id, () => cardBackSvgDataUrl(id));

/**
 * Which back the player is holding. A context rather than a prop because the cards are
 * scattered across the scene graph — two played cards plus every card in the hand fan,
 * which sits several components deep inside the first-person rig.
 *
 * It has to be PROVIDED INSIDE the R3F Canvas: react-three-fiber runs its own React root,
 * so a provider mounted outside it does not reach anything in here.
 */
export const CardBackContext = createContext<CardBackId>('cardBack.house');

/**
 * The surface treatment that comes with each back. This is the part the player is actually
 * buying — a flat texture swap looks cheap next to the room's 3D props, whereas gilt that
 * catches the chandelier reads as a different object.
 *
 * The edge is the card's extruded body, shared by both faces, so it follows the back.
 * One material per variant, created once: they stay shared across every card, so this
 * costs no extra draw calls.
 */
interface BackFinish { roughness: number; metalness: number; edge: string }

const BACK_FINISH: Record<CardBackId, BackFinish> = {
  'cardBack.house': { roughness: 0.45, metalness: 0.05, edge: '#221a28' },
  // Polished leaf: low roughness, high metalness, so the overhead light rakes across it.
  'cardBack.gilt': { roughness: 0.24, metalness: 0.58, edge: '#4a3810' },
  // Gold crown over a matte ground — halfway, so the metal glints without the field shining.
  'cardBack.crown': { roughness: 0.44, metalness: 0.34, edge: '#3a2a12' },
};

const edgeMaterials = new Map<CardBackId, THREE.MeshStandardMaterial>();
function getEdgeMaterial(id: CardBackId): THREE.MeshStandardMaterial {
  const cached = edgeMaterials.get(id);
  if (cached) return cached;
  const finish = BACK_FINISH[id] ?? BACK_FINISH['cardBack.house'];
  const mat = new THREE.MeshStandardMaterial({
    color: finish.edge,
    roughness: 0.55,
    metalness: 0.2 + finish.metalness * 0.4,
    emissive: '#140f1c',
    emissiveIntensity: 0.5,
  });
  edgeMaterials.set(id, mat);
  return mat;
}

// Rounded-rect extruded body — shared across all cards. The dark edge material covers
// the whole body; the printed faces are separate planes floating a hair above it.
let bodyGeometryCache: THREE.ExtrudeGeometry | null = null;
function getBodyGeometry(): THREE.ExtrudeGeometry {
  if (bodyGeometryCache) return bodyGeometryCache;
  const w = CARD_W / 2;
  const h = CARD_H / 2;
  const r = CORNER_R;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: CARD_T, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -CARD_T / 2);
  bodyGeometryCache = geo;
  return geo;
}

// ————————————————————————— How each card plays —————————————————————————
//
// Three cards, three tempers. Until now all three flew identically, so the only thing
// distinguishing the emperor from a citizen was the picture on it — the card you dread
// and the card you shrug at landed exactly the same way.
//
// Everything here is a tweak to motion that already existed plus an emissive pulse on the
// card's own material. Deliberately no particles and no extra lights: the scene already
// carries N8AO, DOF and volumetric beams, and a new light per played card would mean a
// shader recompile at the exact moment the player is watching.
//
// The impact used to be an emissive pulse across the whole card face. That was wrong twice
// over: brightening a large rectangle in a very dark room is glare by construction, and
// cards do not glow. It is now something the card *displaces* — liquid on the felt, which
// is local, physical, and reads without touching the scene's exposure.
//
// The two liquids follow the two tempers already established above:
//   emperor — molten gold WELLS UP from under the card and spreads slowly. Weight.
//   slave   — blood SPRAYS outward, fast and scattered. Violence.
//   citizen — nothing, still. If every card is special, none is.
interface Splat {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  /** Final pool radius in world units. The card is 0.72 × 1.0, so >0.5 peeks out. */
  poolR: number;
  /** Seconds to reach full radius, then to hold, then to fade out. */
  spread: number;
  hold: number;
  fade: number;
  drops: number;
  dropSpeed: number;
  dropUp: number;
  dropSize: number;
}

interface CardFeel {
  /** Approach speed. Low = heavy and deliberate, high = thrown. */
  posRate: number;
  /** Height of the mid-flight arc. A loft reads ceremonial; flat reads like a knife. */
  arc: number;
  /** Mid-flight tilt wobble. */
  wobble: number;
  /** Fraction the card squashes on impact, recovering over PRESS_RECOVER. */
  press: number;
  splat: Splat | null;
}

/** How long the landing squash takes to come back out. */
const PRESS_RECOVER = 0.18;

const CARD_FEEL: Record<CardType, CardFeel> = {
  emperor: {
    posRate: 4.6, arc: 0.23, wobble: 0.05, press: 0.045,
    splat: {
      color: '#c9a23c', emissive: '#7a5410', emissiveIntensity: 0.85,
      metalness: 0.92, roughness: 0.16,
      poolR: 0.58, spread: 0.55, hold: 0.5, fade: 1.0,
      // Few, fat and low: molten gold is heavy, so it lobs rather than sprays.
      drops: 5, dropSpeed: 0.34, dropUp: 0.6, dropSize: 0.019,
    },
  },
  citizen: { posRate: 7.0, arc: 0.16, wobble: 0.10, press: 0, splat: null },
  slave: {
    posRate: 11.0, arc: 0.06, wobble: 0.17, press: 0.02,
    splat: {
      color: '#7a0f13', emissive: '#2a0406', emissiveIntensity: 0.3,
      metalness: 0.1, roughness: 0.26,
      poolR: 0.40, spread: 0.16, hold: 0.25, fade: 0.7,
      drops: 14, dropSpeed: 1.15, dropUp: 0.78, dropSize: 0.011,
    },
  },
};

/**
 * An irregular disc lying in the XZ plane. A true circle reads as a decal; lobed edges
 * read as liquid. Built once per kind and shared — the animation is all in the transform
 * and the material, never the geometry.
 */
function makeSplatGeometry(seed: number, segments = 44): THREE.BufferGeometry {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const raw = Array.from({ length: segments }, () => 0.74 + rnd() * 0.5);
  // One smoothing pass, or the rim comes out spiky rather than lobed.
  const rim = raw.map((v, i) => (raw[(i - 1 + segments) % segments] + v * 2 + raw[(i + 1) % segments]) / 4);

  const pos: number[] = [0, 0, 0];
  const norm: number[] = [0, 1, 0];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pos.push(Math.cos(a) * rim[i], 0, Math.sin(a) * rim[i]);
    norm.push(0, 1, 0);
  }
  const idx: number[] = [];
  for (let i = 0; i < segments; i++) idx.push(0, 1 + i, 1 + ((i + 1) % segments));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

let poolGeoCache: THREE.BufferGeometry | null = null;
const poolGeometry = () => (poolGeoCache ??= makeSplatGeometry(20260802));

let dropGeoCache: THREE.SphereGeometry | null = null;
const dropGeometry = () => (dropGeoCache ??= new THREE.SphereGeometry(1, 6, 4));

const DUMMY = new THREE.Object3D();

/**
 * The liquid. Driven by a clock the parent advances — negative until the card lands, then
 * seconds since. Kept outside the card's animated group so it stays put on the felt while
 * the card settles above it.
 */
function Splatter({ spec, at, clock }: {
  spec: Splat;
  at: [number, number, number];
  clock: { current: number };
}) {
  const poolRef = useRef<THREE.Mesh>(null);
  const dropsRef = useRef<THREE.InstancedMesh>(null);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    metalness: spec.metalness,
    roughness: spec.roughness,
    transparent: true,
    opacity: 0,
    // The pool sits a hair above the felt; without this it z-fights, and writing depth
    // would also make the droplets punch holes in each other.
    depthWrite: false,
  }), [spec]);
  useEffect(() => () => material.dispose(), [material]);

  // Fixed per-droplet ballistics, rolled once so a re-render can't reshuffle mid-flight.
  const seeds = useMemo(() => Array.from({ length: spec.drops }, (_, i) => {
    const a = (i / spec.drops) * Math.PI * 2 + Math.random() * 0.8;
    return {
      a,
      speed: spec.dropSpeed * (0.55 + Math.random() * 0.75),
      up: spec.dropUp * (0.6 + Math.random() * 0.7),
      size: spec.dropSize * (0.6 + Math.random() * 0.8),
    };
  }), [spec]);

  const total = spec.spread + spec.hold + spec.fade;

  useFrame(() => {
    const t = clock.current;
    const pool = poolRef.current;
    const drops = dropsRef.current;
    if (!pool || !drops) return;

    if (t < 0 || t > total) {
      pool.visible = false;
      drops.visible = false;
      return;
    }
    pool.visible = true;

    // Pool: ease-out spread, hold, then fade. Gold eases far more slowly than blood.
    const grow = Math.min(t / spec.spread, 1);
    const eased = 1 - Math.pow(1 - grow, 3);
    const r = spec.poolR * eased;
    pool.scale.set(r, 1, r);

    const fadeStart = spec.spread + spec.hold;
    const alpha = t < fadeStart ? Math.min(grow * 1.4, 1) : 1 - (t - fadeStart) / spec.fade;
    material.opacity = Math.max(0, alpha) * 0.92;

    // Droplets: thrown outward, pulled down, flattened and shrunk once they land.
    const G = 6;
    let anyAlive = false;
    for (let i = 0; i < seeds.length; i++) {
      const d = seeds[i];
      let y = d.up * t - 0.5 * G * t * t;
      let squash = 1;
      if (y <= 0) {
        y = 0;
        // Landed: spread into a speck and disappear, rather than vanishing mid-air.
        const sinceLand = t - (2 * d.up) / G;
        squash = Math.max(0, 1 - sinceLand / 0.35);
      }
      const travel = y > 0 ? t : (2 * d.up) / G;
      const scale = d.size * squash * (y > 0 ? 1 : 1.4);
      if (scale > 0.0001) anyAlive = true;
      DUMMY.position.set(Math.cos(d.a) * d.speed * travel, y, Math.sin(d.a) * d.speed * travel);
      DUMMY.scale.set(scale, scale * (y > 0 ? 1 : 0.35), scale);
      DUMMY.updateMatrix();
      drops.setMatrixAt(i, DUMMY.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
    drops.visible = anyAlive;
  });

  return (
    <group position={at}>
      <mesh ref={poolRef} geometry={poolGeometry()} material={material} visible={false} renderOrder={2} />
      <instancedMesh
        ref={dropsRef}
        args={[dropGeometry(), material, spec.drops]}
        visible={false}
        renderOrder={3}
      />
    </group>
  );
}

// The bare card visual (rounded body + printed faces) — shared by the played-card
// animation and the first-person hand fan. Orientation is the parent's job.
const IDLE_EMISSIVE = '#0a0812';
const IDLE_EMISSIVE_INTENSITY = 0.35;

export function CardMesh({ type, castShadow = true }: {
  type: CardType;
  castShadow?: boolean;
}) {
  const backId = useContext(CardBackContext);
  const finish = BACK_FINISH[backId] ?? BACK_FINISH['cardBack.house'];

  const frontMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: faceTexture(type), transparent: true, roughness: 0.45, metalness: 0.05,
    emissive: IDLE_EMISSIVE, emissiveIntensity: IDLE_EMISSIVE_INTENSITY,
  }), [type]);
  const backMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: backTexture(backId), transparent: true,
    roughness: finish.roughness, metalness: finish.metalness,
    emissive: IDLE_EMISSIVE, emissiveIntensity: IDLE_EMISSIVE_INTENSITY,
  }), [backId, finish]);

  useEffect(() => {
    return () => {
      frontMat.dispose();
      backMat.dispose();
    };
  }, [frontMat, backMat]);

  return (
    <group>
      <mesh castShadow={castShadow} receiveShadow geometry={getBodyGeometry()}>
        <primitive object={getEdgeMaterial(backId)} attach="material" />
      </mesh>
      <mesh position={[0, 0, CARD_T / 2 + 0.0012]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <primitive object={frontMat} attach="material" />
      </mesh>
      <mesh position={[0, 0, -CARD_T / 2 - 0.0012]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <primitive object={backMat} attach="material" />
      </mesh>
    </group>
  );
}

interface PlayedCardProps {
  type: CardType;
  faceDown: boolean;
  target: [number, number, number];
  from: [number, number, number];
  tilt?: number;
  /** Staged showdown: hover toward center → rise slowly → slam down face-up. */
  ceremony?: boolean;
  /** Winner highlight after the showdown resolves. */
  resultGlow?: 'gold' | 'blood' | null;
  /** Fired once, the instant the ceremony slam hits the table. */
  onSlam?: () => void;
}

export default function PlayedCard({
  type, faceDown, target, from, tilt = 0,
  ceremony = false, resultGlow = null, onSlam,
}: PlayedCardProps) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(...from));
  const scale = useRef(0.55);
  const flip = useRef(faceDown ? Math.PI : 0);
  const initialDist = useRef<number | null>(null);
  const ceremonyStart = useRef<number | null>(null);
  const slammed = useRef(false);
  const dest = useRef(new THREE.Vector3());
  const feel = CARD_FEEL[type];
  // Seconds since the card hit the felt; negative until it does. Drives both the landing
  // squash and the liquid. `landed` makes it fire exactly once — without it the tail of
  // the glide would retrigger every frame.
  const impactT = useRef(-1);
  const landed = useRef(false);

  const targetVec = useMemo(() => new THREE.Vector3(...target), [target]);
  const layFlat = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const now = state.clock.getElapsedTime();

    // Defaults: normal play — glide to target, flip per prop, at this card's own tempo.
    let flipTarget = faceDown ? Math.PI : 0;
    let flipRate = 6;
    let posRate = feel.posRate;
    let hoverLift = 0;
    let slideX = 0;

    if (ceremony) {
      // Showdown timeline, driven by seconds since the ceremony began.
      if (ceremonyStart.current === null) ceremonyStart.current = now;
      const tc = now - ceremonyStart.current;
      if (tc < 1.0) {
        // Hover up and drift toward the table center — still hidden.
        flipTarget = Math.PI;
        hoverLift = Math.min(tc / 0.5, 1) * 0.24;
        slideX = Math.min(tc / 0.8, 1) * 0.18;
      } else if (tc < 1.55) {
        // Rise slowly to vertical: the longest half-second of the round.
        flipTarget = Math.PI / 2;
        flipRate = 3.2;
        hoverLift = 0.24;
        slideX = 0.18;
      } else {
        // Slam down face-up.
        flipTarget = 0;
        flipRate = 18;
        posRate = 14;
        slideX = 0.18;
        if (!slammed.current && flip.current < 0.35) {
          slammed.current = true;
          // The showdown slam IS this card's impact — and for the opponent's card it is
          // the FIRST one, because a face-down landing deliberately produces nothing.
          landed.current = true;
          impactT.current = 0;
          onSlam?.();
        }
      }
    }

    dest.current.set(targetVec.x + slideX, targetVec.y + hoverLift, targetVec.z);
    const posSpeed = 1 - Math.exp(-delta * posRate);
    pos.current.lerp(dest.current, posSpeed);
    group.current.position.copy(pos.current);

    // Arc — the card rises mid-flight and settles down, instead of sliding in flat.
    // (Suppressed during the ceremony, which drives its own vertical motion.)
    const dist = pos.current.distanceTo(targetVec);
    if (initialDist.current === null) initialDist.current = Math.max(dist, 0.0001);
    const progress = 1 - Math.min(dist / initialDist.current, 1);
    if (!ceremony) group.current.position.y += Math.sin(progress * Math.PI) * feel.arc;

    // Touchdown on a normal play. 0.96 rather than 1: the lerp approaches asymptotically
    // and would never reach the target exactly.
    //
    // A FACE-DOWN landing fires nothing. This is not a polish decision — gold welling out
    // from under the opponent's hidden card would announce that they played the emperor,
    // and the entire game is built on not knowing that until the reveal.
    if (!ceremony && !landed.current && !faceDown && progress > 0.96) {
      landed.current = true;
      impactT.current = 0;
    }
    if (impactT.current >= 0) impactT.current += delta;

    const scaleSpeed = 1 - Math.exp(-delta * 6);
    scale.current += (1 - scale.current) * scaleSpeed;
    // Squash into the felt on impact, easing back out — the weight cue.
    const pressT = impactT.current < 0 ? 1 : Math.min(impactT.current / PRESS_RECOVER, 1);
    group.current.scale.setScalar(scale.current * (1 - feel.press * (1 - pressT)));

    flip.current += (flipTarget - flip.current) * (1 - Math.exp(-delta * flipRate));

    const flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flip.current);
    // A touch of extra tilt mid-flight so the card wobbles as it lands.
    const tiltQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      tilt + Math.sin(progress * Math.PI) * feel.wobble,
    );
    const finalQ = layFlat.clone().multiply(tiltQ).multiply(flipQ);
    group.current.quaternion.copy(finalQ);
  });

  return (
    <>
      {/* Outside the animated group on purpose: the liquid belongs to the felt, and must
          not ride along as the card settles, wobbles or gets picked up for the showdown. */}
      {feel.splat && (
        <Splatter
          spec={feel.splat}
          at={[target[0], target[1] - 0.008, target[2]]}
          clock={impactT}
        />
      )}
      <group ref={group}>
        <CardMesh type={type} />
        {/* Winner highlight — local +z is world-up once the card lies flat */}
        {resultGlow && (
          <pointLight
            position={[0, 0, 0.35]}
            color={resultGlow === 'gold' ? '#d4a838' : '#ff2a2a'}
            intensity={2.4}
            distance={1.8}
            decay={2}
          />
        )}
      </group>
    </>
  );
}
