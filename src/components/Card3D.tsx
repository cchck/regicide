'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CardType } from '@/lib/types';
import { cardSvgDataUrl } from '@/lib/cardArt';

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
function getTexture(type: CardType | 'back'): THREE.CanvasTexture {
  const cached = textureCache.get(type);
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
  img.src = cardSvgDataUrl(type);

  textureCache.set(type, texture);
  return texture;
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

const edgeMaterial = new THREE.MeshStandardMaterial({
  color: '#221a28',
  roughness: 0.55,
  metalness: 0.2,
  emissive: '#140f1c',
  emissiveIntensity: 0.5,
});

// The bare card visual (rounded body + printed faces) — shared by the played-card
// animation and the first-person hand fan. Orientation is the parent's job.
export function CardMesh({ type, castShadow = true }: { type: CardType; castShadow?: boolean }) {
  const frontMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: getTexture(type), transparent: true, roughness: 0.45, metalness: 0.05,
    emissive: '#0a0812', emissiveIntensity: 0.35,
  }), [type]);
  const backMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: getTexture('back'), transparent: true, roughness: 0.45, metalness: 0.05,
    emissive: '#0a0812', emissiveIntensity: 0.35,
  }), []);

  useEffect(() => {
    return () => {
      frontMat.dispose();
      backMat.dispose();
    };
  }, [frontMat, backMat]);

  return (
    <group>
      <mesh castShadow={castShadow} receiveShadow geometry={getBodyGeometry()}>
        <primitive object={edgeMaterial} attach="material" />
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

  const targetVec = useMemo(() => new THREE.Vector3(...target), [target]);
  const layFlat = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const now = state.clock.getElapsedTime();

    // Defaults: normal play — glide to target, flip per prop.
    let flipTarget = faceDown ? Math.PI : 0;
    let flipRate = 6;
    let posRate = 7;
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
    if (!ceremony) group.current.position.y += Math.sin(progress * Math.PI) * 0.16;

    const scaleSpeed = 1 - Math.exp(-delta * 6);
    scale.current += (1 - scale.current) * scaleSpeed;
    group.current.scale.setScalar(scale.current);

    flip.current += (flipTarget - flip.current) * (1 - Math.exp(-delta * flipRate));

    const flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flip.current);
    // A touch of extra tilt mid-flight so the card wobbles as it lands.
    const tiltQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      tilt + Math.sin(progress * Math.PI) * 0.1,
    );
    const finalQ = layFlat.clone().multiply(tiltQ).multiply(flipQ);
    group.current.quaternion.copy(finalQ);
  });

  return (
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
  );
}
