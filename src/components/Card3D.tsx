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
// `flashMs` is the whole budget for the impact. Short — the card is on screen for a long
// time afterwards and a lingering effect would turn into wallpaper.
interface CardFeel {
  /** Approach speed. Low = heavy and deliberate, high = thrown. */
  posRate: number;
  /** Height of the mid-flight arc. A loft reads ceremonial; flat reads like a knife. */
  arc: number;
  /** Mid-flight tilt wobble. */
  wobble: number;
  /** Fraction the card squashes on impact, recovering as the flash decays. */
  press: number;
  flashColor: string;
  flashPeak: number;
  flashMs: number;
}

const CARD_FEEL: Record<CardType, CardFeel> = {
  // Heavy. Comes in slow and high, presses into the felt, and the gold swells rather than
  // snaps — the longest of the three, because weight is the whole idea.
  emperor: { posRate: 4.6, arc: 0.23, wobble: 0.05, press: 0.045, flashColor: '#d4a838', flashPeak: 1.5, flashMs: 240 },
  // The baseline, and it stays plain on purpose. If every card is special, none is.
  citizen: { posRate: 7.0, arc: 0.16, wobble: 0.10, press: 0, flashColor: '#000000', flashPeak: 0, flashMs: 0 },
  // Fast, flat and mean. Arrives before you've finished reading it, with one red snap.
  slave: { posRate: 11.0, arc: 0.06, wobble: 0.17, press: 0.02, flashColor: '#ff2a2a', flashPeak: 1.9, flashMs: 140 },
};

// The bare card visual (rounded body + printed faces) — shared by the played-card
// animation and the first-person hand fan. Orientation is the parent's job.
const IDLE_EMISSIVE = '#0a0812';
const IDLE_EMISSIVE_INTENSITY = 0.35;

export function CardMesh({ type, castShadow = true, flash }: {
  type: CardType;
  castShadow?: boolean;
  /**
   * Impact pulse, 1 → 0, owned and decayed by the parent. Driving the card's own emissive
   * costs nothing: no new light in the scene, so no light-count change and no shader
   * recompile mid-play. Omit it and this stays a plain card.
   *
   * Read a frame late — R3F runs a child's useFrame before its parent's — which is
   * invisible at these durations and not worth a priority argument to fix.
   */
  flash?: { current: number };
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

  const feel = CARD_FEEL[type];
  const idleColor = useMemo(() => new THREE.Color(IDLE_EMISSIVE), []);
  const hotColor = useMemo(() => new THREE.Color(feel.flashColor), [feel.flashColor]);
  const lit = useRef(false);

  useFrame(() => {
    // The citizen opts out entirely: no ref work, no material writes, nothing to undo.
    // (It also sidesteps the frame-late read briefly showing it a stale pulse.)
    if (!flash || feel.flashPeak <= 0) return;
    const v = flash.current;
    // Skip the work entirely once it has burned out, but run one last frame to put the
    // material back exactly where it started — otherwise the card keeps a faint tint.
    if (v <= 0.001) {
      if (lit.current) {
        frontMat.emissive.copy(idleColor);
        frontMat.emissiveIntensity = IDLE_EMISSIVE_INTENSITY;
        lit.current = false;
      }
      return;
    }
    lit.current = true;
    frontMat.emissive.copy(idleColor).lerp(hotColor, v);
    frontMat.emissiveIntensity = IDLE_EMISSIVE_INTENSITY + feel.flashPeak * v;
  });

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
  // Impact pulse, decayed here and read by CardMesh. `landed` makes it fire exactly once
  // per card: without it the glide's tail end would retrigger it every frame.
  const flash = useRef(0);
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
          landed.current = true;
          flash.current = 1; // the showdown slam IS this card's impact
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
    if (!ceremony && !landed.current && progress > 0.96) {
      landed.current = true;
      flash.current = 1;
    }

    // Burn down the pulse. Linear over flashMs — an exponential tail would leave a faint
    // glow hanging around long after the hit, which is the opposite of what's wanted.
    if (flash.current > 0 && feel.flashMs > 0) {
      flash.current = Math.max(0, flash.current - (delta * 1000) / feel.flashMs);
    } else if (feel.flashMs === 0) {
      flash.current = 0;
    }

    const scaleSpeed = 1 - Math.exp(-delta * 6);
    scale.current += (1 - scale.current) * scaleSpeed;
    // Squash into the felt on impact and recover as the pulse fades — the weight cue.
    group.current.scale.setScalar(scale.current * (1 - feel.press * flash.current));

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
    <group ref={group}>
      <CardMesh type={type} flash={flash} />
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
  );
}
