'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '@/lib/audio';

// One rendered coin represents this many chip units.
const COIN_VALUE = 5;
const COIN_R = 0.055;
const COIN_H = 0.016;
const STACK_H = 10; // coins per stack
const MAX_COINS = 120; // display cap per pile (the plaque always shows the exact number)
const FLIGHT_POOL = 12;

type PileKey = 'player' | 'opp' | 'pot';

interface PileDef {
  origin: THREE.Vector3;
  rowDir: 1 | -1; // which way extra stack rows grow along z
}

function coinTransform(i: number, pile: PileDef, dummy: THREE.Object3D) {
  const stack = Math.floor(i / STACK_H);
  const level = i % STACK_H;
  const col = stack % 4;
  const row = Math.floor(stack / 4);
  // Deterministic jitter so stacks look hand-placed, not machine-perfect.
  const jx = Math.sin(i * 12.9898) * 0.004;
  const jz = Math.sin(i * 78.233) * 0.004;
  dummy.position.set(
    pile.origin.x + (col - 1.5) * (COIN_R * 2.35) + jx,
    pile.origin.y + COIN_H / 2 + level * COIN_H,
    pile.origin.z + pile.rowDir * row * (COIN_R * 2.35) + jz,
  );
  dummy.rotation.set(0, Math.sin(i * 3.7) * 0.5, 0);
  dummy.updateMatrix();
}

function CoinMaterials() {
  return (
    <>
      {/* side = gold band, faces = lacquered blood red */}
      <meshStandardMaterial attach="material-0" color="#8a6a20" metalness={0.85} roughness={0.35} emissive="#4a3810" emissiveIntensity={0.4} />
      <meshStandardMaterial attach="material-1" color="#5a1015" roughness={0.5} metalness={0.25} emissive="#3a0a0e" emissiveIntensity={0.5} />
      <meshStandardMaterial attach="material-2" color="#5a1015" roughness={0.5} metalness={0.25} emissive="#3a0a0e" emissiveIntensity={0.5} />
    </>
  );
}

function CoinInstances({ getCount, pile }: { getCount: () => number; pile: PileDef }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const n = Math.max(0, Math.min(getCount(), MAX_COINS));
    for (let i = 0; i < n; i++) {
      coinTransform(i, pile, dummy);
      m.setMatrixAt(i, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_COINS]} castShadow receiveShadow frustumCulled={false}>
      <cylinderGeometry args={[COIN_R, COIN_R, COIN_H, 20]} />
      <CoinMaterials />
    </instancedMesh>
  );
}

// Exact chip count engraved in gold beside each pile (canvas texture — no font fetch).
function NumberPlaque({ value, position, width = 0.5 }: { value: number; position: [number, number, number]; width?: number }) {
  const { texture, canvas } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, canvas };
  }, []);

  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 80);
    ctx.font = '900 54px Cinzel, "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(196,154,48,0.65)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#c49a30';
    ctx.fillText(String(value), 128, 42);
    texture.needsUpdate = true;
  }, [value, canvas, texture]);

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, width * (80 / 256)]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} opacity={0.92} depthWrite={false} />
    </mesh>
  );
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  delay: number;
  dest: PileKey;
  active: boolean;
}

interface ChipEconomyProps {
  playerChips: number;
  opponentChips: number;
  pot: number;
  surfaceY: number;
}

// The whole table economy: three coin piles whose counts track the game state,
// with coins visibly flying between piles whenever money moves.
export default function ChipEconomy({ playerChips, opponentChips, pot, surfaceY }: ChipEconomyProps) {
  // Diagonal layout: player bank front-left (clear of the hand fan, which sits
  // center-right of the view), opponent bank back-right, pot in the middle.
  const piles = useMemo<Record<PileKey, PileDef>>(() => ({
    player: { origin: new THREE.Vector3(-1.15, surfaceY, 0.15), rowDir: 1 },
    opp: { origin: new THREE.Vector3(1.05, surfaceY, -1.5), rowDir: -1 },
    pot: { origin: new THREE.Vector3(0, surfaceY, -1.05), rowDir: -1 },
  }), [surfaceY]);

  const shown = useRef({
    player: Math.round(playerChips / COIN_VALUE),
    opp: Math.round(opponentChips / COIN_VALUE),
    pot: Math.round(pot / COIN_VALUE),
  });
  const prev = useRef({ playerChips, opponentChips, pot });
  const flights = useRef<Flight[]>([]);
  const flightMesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const p = prev.current;
    const deltas: Record<PileKey, number> = {
      player: Math.round(playerChips / COIN_VALUE) - Math.round(p.playerChips / COIN_VALUE),
      opp: Math.round(opponentChips / COIN_VALUE) - Math.round(p.opponentChips / COIN_VALUE),
      pot: Math.round(pot / COIN_VALUE) - Math.round(p.pot / COIN_VALUE),
    };
    prev.current = { playerChips, opponentChips, pot };

    const spawnFlights = (from: THREE.Vector3, to: THREE.Vector3, n: number, dest: PileKey) => {
      audio.sfx('chip');
      const animated = Math.min(n, 8);
      if (n > animated) shown.current[dest] += n - animated; // overflow lands instantly
      for (let i = 0; i < animated; i++) {
        flights.current.push({
          from: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.02, (Math.random() - 0.5) * 0.15)),
          to: to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.02, (Math.random() - 0.5) * 0.12)),
          t: 0,
          dur: 0.45 + Math.random() * 0.2,
          delay: i * 0.07,
          dest,
          active: true,
        });
      }
    };

    const keys = Object.keys(deltas) as PileKey[];
    const sources = keys.filter((k) => deltas[k] < 0);
    const dests = keys.filter((k) => deltas[k] > 0);

    // Coins leave their pile immediately; arrivals are credited when a flight lands.
    for (const s of sources) shown.current[s] += deltas[s];

    let di = 0;
    for (const s of sources) {
      let need = -deltas[s];
      while (need > 0 && di < dests.length) {
        const d = dests[di];
        const take = Math.min(need, deltas[d]);
        spawnFlights(piles[s].origin, piles[d].origin, take, d);
        deltas[d] -= take;
        need -= take;
        if (deltas[d] === 0) di++;
      }
    }
    // Gains with no visible source (buy-in top-ups etc.) appear instantly.
    for (const d of dests) if (deltas[d] > 0) shown.current[d] += deltas[d];
  }, [playerChips, opponentChips, pot, piles]);

  useFrame((_, delta) => {
    const m = flightMesh.current;
    let count = 0;
    for (const f of flights.current) {
      if (!f.active) continue;
      if (f.delay > 0) f.delay -= delta;
      else f.t += delta / f.dur;
      if (f.t >= 1) {
        f.active = false;
        shown.current[f.dest] += 1;
        continue;
      }
      if (m && count < FLIGHT_POOL) {
        const e = Math.max(f.t, 0);
        const ease = e * e * (3 - 2 * e);
        dummy.position.lerpVectors(f.from, f.to, ease);
        dummy.position.y += Math.sin(ease * Math.PI) * 0.35;
        dummy.rotation.set(ease * Math.PI * 2, 0, 0);
        dummy.updateMatrix();
        m.setMatrixAt(count, dummy.matrix);
        count++;
      }
    }
    if (flights.current.length > 40) flights.current = flights.current.filter((f) => f.active);
    if (m) {
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <CoinInstances getCount={() => shown.current.player} pile={piles.player} />
      <CoinInstances getCount={() => shown.current.opp} pile={piles.opp} />
      <CoinInstances getCount={() => shown.current.pot} pile={piles.pot} />
      {/* In-flight coins */}
      <instancedMesh ref={flightMesh} args={[undefined, undefined, FLIGHT_POOL]} frustumCulled={false}>
        <cylinderGeometry args={[COIN_R, COIN_R, COIN_H, 20]} />
        <CoinMaterials />
      </instancedMesh>
      {/* Player/opponent totals moved to the persistent HUD (VerdictBar) — the felt keeps
          only the physical stacks. The POT number stays: it's the round's stakes and lives
          nowhere else. */}
      {pot > 0 && <NumberPlaque value={pot} position={[0.12, surfaceY + 0.002, -0.72]} width={0.4} />}
    </group>
  );
}
