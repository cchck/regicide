'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, MeshReflectorMaterial, useGLTF, useTexture, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ToneMapping, N8AO, Noise } from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction } from 'postprocessing';
import { ReactNode, Suspense, createContext, useContext, useRef, useMemo, useState, useEffect } from 'react';
import { createPortal } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { CardType } from '@/lib/types';
import { useIsTouch } from '@/lib/device';
import { normalizeLoadout, type Loadout } from '@/lib/shop';
import { audio } from '@/lib/audio';
import PlayedCard, { CardMesh, MenuCardMesh, CardBackContext } from './Card3D';
import { MENU_ORDER, MenuCardId } from '@/lib/menuCards';
import type { CardBackId } from '@/lib/cardArt';
import ChipEconomy from './Chips3D';

type Personality = 'aggressive' | 'cautious' | 'deceptive';

const PERSONALITY_COLOR: Record<Personality, string> = {
  aggressive: '#cc2222',
  cautious: '#2a8a8a',
  deceptive: '#c49a30',
};

const FLOOR_Y = -0.55;
const WALL_H = 7;
const CEILING_Y = FLOOR_Y + WALL_H;

// How low the chandelier is allowed to hang. Bracketed by eye, not derived — at 2.175
// its finial hid the dealer's head, at 3.575 it was off the top of the frame entirely.
// 2.575 clears the top of his hood (2.262). This is the constraint that actually
// matters, so everything about the chandelier is derived from it rather than from the
// model's centre: swapping in a different model or resizing it can't break the framing.
const CHANDELIER_BOTTOM = 2.575;
// Meshy normalises every export into a ~1.9 box, so the raw model size means nothing.
// The scene runs at 1m ≈ 1.85 units (the 1.8m dealer is 3.33 tall), so 1.1 makes this a
// 2.09-unit / 1.13m chandelier — grand, but not a wrecking ball.
const CHANDELIER_SCALE = 1.1;
const CHANDELIER_HALF = 0.948 * CHANDELIER_SCALE; // model bbox is y ∈ [-0.948, 0.948]
const CHANDELIER_Y = CHANDELIER_BOTTOM + CHANDELIER_HALF;

// The table used to sit at y=-0.03 — only 0.52 units above the floor, which at this
// scene's scale (the 1.8m dealer is 3.33 units) is a 28cm footstool. It reached his
// shins. The surface now sits just below his seated hips (y=0.82), so the slab reads
// as a table he's leaning over rather than a counter he's peering across.
const TABLE_GROUP_POS: [number, number, number] = [0, 0.72, -0.3];
const TABLE_R_TOP = 2.55;
const TABLE_R_BOTTOM = 2.7;
const TABLE_HEIGHT = 0.24;
const TABLE_SURFACE_Y = TABLE_GROUP_POS[1] + TABLE_HEIGHT / 2;
// How far the column must reach from the slab's underside down to the floor.
const PEDESTAL_LEN = TABLE_GROUP_POS[1] - TABLE_HEIGHT / 2 - FLOOR_Y;

const SPOT_POS: [number, number, number] = [0.3, 3.6, 0.6];
const SPOT_TARGET: [number, number, number] = [0, TABLE_SURFACE_Y, TABLE_GROUP_POS[2]];

// The dealer model is 1.8 units tall standing with its feet at y=0, but this room is
// stylised (the table is only ~0.5 units thick), so he needs scaling up to match.
// Seated clips drop the hips ~0.45 of his own height, which lands his chest over the rim.
const DEALER_POS: [number, number, number] = [0, FLOOR_Y, -3.15];
const DEALER_SCALE = 1.85;

// Seated first-person eye position — across the table from the opponent.
// Slightly higher than true eye level so the played cards at mid-table clear the hand fan.
const CAM_BASE: [number, number, number] = [0, 2.3, 3.0];

// ————————————————————————————— Finale (终局演出) —————————————————————————————
// When the match ends, the scene doesn't cut away — it finishes the story the drills
// have been telling all match. The DOM layer (blackout, report plate, audio cues) and
// the scene layer act on one shared timeline; all times are seconds from finale start.
export type FinaleKind =
  | 'execution' // you lost 4 sets — your drill finally arrives (hard cut to black)
  | 'regicide'  // you won 4 sets — the dealer's drill fires, he slumps
  | 'broke'     // your chips hit zero mid-match — lights die one by one, he applauds
  | 'drained'   // opponent's chips hit zero — his pile avalanches to you, he folds up
  | 'deserted'; // PvP: the opponent fled — the seat is simply empty

export const FINALE_TIMINGS: Record<FinaleKind, { cut: number; hardCut: boolean; plate: number }> = {
  execution: { cut: 2.3, hardCut: true, plate: 4.2 },
  regicide: { cut: 4.2, hardCut: false, plate: 5.0 },
  broke: { cut: 4.6, hardCut: false, plate: 5.8 },
  drained: { cut: 3.8, hardCut: false, plate: 4.6 },
  deserted: { cut: 2.2, hardCut: false, plate: 3.0 },
};

// Mutable, frame-rate state shared by every scene component with a part in the finale.
// The context is provided INSIDE the Canvas — R3F runs its own React root and does not
// bridge outer providers across the renderer boundary.
interface FinaleState { kind: FinaleKind | null; start: number | null }
const FinaleContext = createContext<React.MutableRefObject<FinaleState>>({
  current: { kind: null, start: null },
});

// Elapsed seconds since the finale began, or -1 when idle / a different finale.
function finaleElapsed(f: FinaleState, clockT: number, kind?: FinaleKind): number {
  if (!f.kind || f.start === null) return -1;
  if (kind && f.kind !== kind) return -1;
  return clockT - f.start;
}

// Stamps the shared start time on the frame the finale begins. Mounted before every
// consumer so the same frame that raises `kind` already carries a valid clock origin.
function FinaleDirector({ kind, ctx }: { kind: FinaleKind | null; ctx: React.MutableRefObject<FinaleState> }) {
  useFrame(({ clock }) => {
    const c = ctx.current;
    if (kind && c.kind !== kind) {
      c.kind = kind;
      c.start = clock.getElapsedTime();
    } else if (!kind && c.kind) {
      c.kind = null;
      c.start = null;
    }
  });
  return null;
}

// ————————————————————————————— Quality presets —————————————————————————————

export type Quality = 'high' | 'medium' | 'low';

// The two big GPU eaters are the reflective floor (renders the scene twice) and the
// post-processing chain. Medium drops the reflection; low drops post + shadows + dpr.
const QUALITY_PRESETS: Record<Quality, {
  dpr: number | [number, number];
  shadows: boolean;
  shadowMap: number;
  reflectiveFloor: boolean;
  post: boolean;
  msaa: number;
  dust: number;
  antialias: boolean;
  ao: boolean;          // N8AO screen-space ambient occlusion
  grain: boolean;       // film grain
  shadowBlur: number;   // PCF blur radius on the key light
}> = {
  high: { dpr: [1, 1.5], shadows: true, shadowMap: 2048, reflectiveFloor: true, post: true, msaa: 8, dust: 55, antialias: false, ao: true, grain: true, shadowBlur: 6 },
  medium: { dpr: [1, 1.25], shadows: true, shadowMap: 1024, reflectiveFloor: false, post: true, msaa: 0, dust: 36, antialias: false, ao: false, grain: true, shadowBlur: 4 },
  low: { dpr: 1, shadows: false, shadowMap: 512, reflectiveFloor: false, post: false, msaa: 0, dust: 20, antialias: true, ao: false, grain: false, shadowBlur: 0 },
};

// ————————————————————————————— PBR textures —————————————————————————————
// CC0 sets from Poly Haven live in /public/textures/<name>/. Textures are cached by
// URL, so each consumer clones before setting its own tiling.
function usePbr(name: string, repeatX: number, repeatY: number) {
  const raw = useTexture([
    `/textures/${name}/${name}_diff_1k.jpg`,
    `/textures/${name}/${name}_nor_gl_1k.jpg`,
    `/textures/${name}/${name}_rough_1k.jpg`,
  ]);
  return useMemo(() => {
    const [diff, nor, rough] = raw.map((t) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeatX, repeatY);
      // Without anisotropy, surfaces seen at a grazing angle (the floor especially)
      // smear into mush and the detail may as well not be there.
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    });
    // Colour data is sRGB; normal/roughness are raw linear data and must not be decoded.
    diff.colorSpace = THREE.SRGBColorSpace;
    nor.colorSpace = THREE.NoColorSpace;
    rough.colorSpace = THREE.NoColorSpace;
    return { map: diff, normalMap: nor, roughnessMap: rough };
  }, [raw, repeatX, repeatY]);
}

// ————————————————————————————— First-person rig —————————————————————————————

// How the camera inhabits the room.
//   seated     — the match view: eye-level at the table, mouse parallax, finale motion.
//   lobby      — the hub: standing at the doorway, slow breathing drift, light parallax.
//   transition — the sit-down: one C²-continuous glide from wherever the lobby camera
//                is right now into the seated pose.
export type ViewMode = 'seated' | 'lobby' | 'transition';

// The doorway pose. Verified numerically (scripts/campath) before hand-tuning was even
// attempted: the straight sit-down path never enters the table's upper cylinder (its
// endpoint is already 3.3 from the axis vs the 2.55 rim), crosses the railing ring with
// 1.84 of headroom, and passes no closer than 3.9 to the chandelier.
const LOBBY_POS = new THREE.Vector3(3.6, 2.62, 4.9);
const LOBBY_LOOK = new THREE.Vector3(-0.2, 1.35, -1.7);
const SIT_SECONDS = 1.9; // path is 4.08 units → mid-glide peak 4.0 u/s ≈ walking pace

// Quintic smootherstep: first AND second derivatives vanish at both ends, so the
// sit-down neither jerks on departure nor thumps on arrival (plain smoothstep is only
// C¹ — its acceleration steps at the endpoints, and the eye reads that as a bump).
function smootherstep(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Moves the camera per viewMode, and anchors its children (the player's hands + card
// fan) to the camera so they ride along like an FPS viewmodel.
// `shakeRef` is an impulse (0..1) written by scene events (the reveal slam) and decayed here.
function FirstPersonRig({ children, shakeRef, viewMode = 'seated' }: {
  children: ReactNode;
  shakeRef: React.MutableRefObject<number>;
  viewMode?: ViewMode;
}) {
  const anchor = useRef<THREE.Group>(null);
  const look = useRef(new THREE.Vector3(0, 0.58, -1.8));
  const finale = useContext(FinaleContext);
  const prevMode = useRef<ViewMode | null>(null);
  const sitStart = useRef(0);
  const fromPos = useRef(new THREE.Vector3());
  const fromLook = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  useFrame(({ camera, pointer, clock }, delta) => {
    const t = clock.getElapsedTime();

    if (viewMode === 'lobby') {
      if (prevMode.current === null) {
        // First frame of a lobby scene: start AT the doorway, no fly-in from the seat.
        camera.position.copy(LOBBY_POS);
        look.current.copy(LOBBY_LOOK);
      }
      // Breathing drift (peak velocity ~2 cm/s — slow enough that abandoning it at the
      // moment of transition truncates nothing the eye can register) + shallow parallax.
      target.current.set(
        LOBBY_POS.x + Math.sin(t * 0.11) * 0.2 + pointer.x * 0.3,
        LOBBY_POS.y + Math.sin(t * 0.07) * 0.08 + pointer.y * 0.12,
        LOBBY_POS.z + Math.sin(t * 0.09 + 1.7) * 0.14,
      );
      lookTarget.current.set(LOBBY_LOOK.x + pointer.x * 0.5, LOBBY_LOOK.y + pointer.y * 0.3, LOBBY_LOOK.z);
      const kk = 1 - Math.exp(-delta * 2.2);
      camera.position.lerp(target.current, kk);
      look.current.lerp(lookTarget.current, kk);
      camera.lookAt(look.current);
    } else if (viewMode === 'transition') {
      if (prevMode.current !== 'transition') {
        // Depart from wherever the drift actually put us, not the canonical pose —
        // snapping to a canonical start is exactly the kind of pop this rig exists to avoid.
        sitStart.current = t;
        fromPos.current.copy(camera.position);
        fromLook.current.copy(look.current);
      }
      const p = smootherstep((t - sitStart.current) / SIT_SECONDS);
      // Blend toward the CANONICAL seated pose — deliberately without pointer parallax.
      // The glide usually ends in a scene swap (menu TableScene unmounts, the match's
      // mounts), and the new Canvas births its camera at exactly CAM_BASE looking at
      // (0, 0.58, -1.8). Landing anywhere else (e.g. with a ±0.55 parallax offset)
      // would make the swap visibly jump. Parallax instead fades back in on the other
      // side, through the seated branch's own k=4 exponential.
      target.current.set(CAM_BASE[0], CAM_BASE[1], CAM_BASE[2]);
      lookTarget.current.set(0, 0.58, -1.8);
      camera.position.lerpVectors(fromPos.current, target.current, p);
      look.current.lerpVectors(fromLook.current, lookTarget.current, p);
      camera.lookAt(look.current);
    } else {
      const k = 1 - Math.exp(-delta * 4);
      const f = finale.current;
      // The finale takes the camera away from the player — free look would let them pan
      // casually through their own execution.
      const px = f.kind ? 0 : pointer.x;
      const py = f.kind ? 0 : pointer.y;

      // 败北·处刑: the machine at your ear winds up — the whole world judders with it.
      const tEx = finaleElapsed(f, t, 'execution');
      if (tEx > 1.4) shakeRef.current = Math.max(shakeRef.current, Math.min((tEx - 1.4) / 0.9, 1) * 1.5);

      // 败北·身无分文: dragged back from the table, slowly, still facing it.
      const tBk = finaleElapsed(f, t, 'broke');
      const drift = tBk > 2.6 ? Math.min((tBk - 2.6) * 0.35, 1.6) : 0;

      // Wide look-around: enough swing to take in the room walls and the ear drill.
      camera.position.x += (CAM_BASE[0] + px * 0.55 - camera.position.x) * k;
      camera.position.y += (CAM_BASE[1] + py * 0.22 + drift * 0.12 - camera.position.y) * k;
      camera.position.z = CAM_BASE[2] + drift;
      look.current.x += (px * 2.0 - look.current.x) * k;
      look.current.y += (0.58 + py * 0.9 - look.current.y) * k;
      camera.lookAt(look.current);
      if (shakeRef.current > 0.002) {
        const s = shakeRef.current;
        camera.position.x += (Math.random() - 0.5) * 0.06 * s;
        camera.position.y += (Math.random() - 0.5) * 0.05 * s;
        shakeRef.current = s * Math.exp(-delta * 5);
      }
    }

    prevMode.current = viewMode;
    if (anchor.current) {
      anchor.current.position.copy(camera.position);
      anchor.current.quaternion.copy(camera.quaternion);
    }
  });
  return <group ref={anchor}>{children}</group>;
}

// Dims the room while the showdown plays out — one tight beam on the table, rest falls away.
function CeremonyLights({ active, spotRef, ambientRef }: {
  active: boolean;
  spotRef: React.RefObject<THREE.SpotLight | null>;
  ambientRef: React.RefObject<THREE.AmbientLight | null>;
}) {
  const finale = useContext(FinaleContext);
  useFrame((_, delta) => {
    // The finale owns the lights once it starts — this restorer would fight it,
    // dragging everything back to house levels every frame.
    if (finale.current.kind) return;
    const k = 1 - Math.exp(-delta * 3);
    if (spotRef.current) spotRef.current.intensity += ((active ? 7 : 12) - spotRef.current.intensity) * k;
    if (ambientRef.current) ambientRef.current.intensity += ((active ? 0.2 : 0.62) - ambientRef.current.intensity) * k;
  });
  return null;
}

// The finale's grip on the house lights. Values are assigned, not lerped from current —
// the timeline is the single source of truth, so whatever another controller did last
// frame is simply overwritten.
function FinaleLights({ spotRef, ambientRef, hemiRef }: {
  spotRef: React.RefObject<THREE.SpotLight | null>;
  ambientRef: React.RefObject<THREE.AmbientLight | null>;
  hemiRef: React.RefObject<THREE.HemisphereLight | null>;
}) {
  const finale = useContext(FinaleContext);
  useFrame(({ clock }) => {
    const f = finale.current;
    if (!f.kind) return;
    const t = finaleElapsed(f, clock.getElapsedTime());
    const ease = (from: number, to: number) => Math.min(Math.max((t - from) / (to - from), 0), 1);

    if (f.kind === 'execution') {
      // Everything dies together, fast — 1 second from house light to void. What's left
      // is the drill's red lamp and his eyes (toneMapped=false survives the dark).
      const p = ease(0.3, 1.3);
      if (spotRef.current) spotRef.current.intensity = 12 * (1 - p);
      if (ambientRef.current) ambientRef.current.intensity = 0.62 * (1 - p) + 0.02 * p;
      if (hemiRef.current) hemiRef.current.intensity = 0.55 * (1 - p);
    } else if (f.kind === 'regicide') {
      // The room falls away but the spotlight stays — a stage, and he's on it.
      const p = ease(0.3, 1.0);
      if (ambientRef.current) ambientRef.current.intensity = 0.62 * (1 - p) + 0.1 * p;
      if (hemiRef.current) hemiRef.current.intensity = 0.55 * (1 - p) + 0.08 * p;
      if (spotRef.current) spotRef.current.angle = 0.58 - 0.14 * p;
    } else if (f.kind === 'broke') {
      // Breakers, not dimmers: sconces at 1.0s, chandelier at 1.6s (those trip in their
      // own components) — here the main spot slams off at 2.2s and the ambience drains.
      if (spotRef.current) spotRef.current.intensity = t > 2.2 ? 0 : 12;
      const p = ease(2.2, 3.0);
      if (ambientRef.current) ambientRef.current.intensity = 0.62 * (1 - p) + 0.04 * p;
      if (hemiRef.current) hemiRef.current.intensity = 0.55 * (1 - p) + 0.03 * p;
    }
    // drained / deserted keep the house lights — their story is told elsewhere.
  });
  return null;
}

// One card in the held fan. Coordinates are camera-local (z- is forward).
function FanCard({ card, index, count, selected, canSelect, hinted, onSelect }: {
  card: CardType; index: number; count: number; selected: boolean; canSelect: boolean;
  hinted: boolean;
  onSelect: (card: CardType, index: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const touch = useIsTouch();
  // If the card unmounts mid-hover (it just got played), don't leave a stuck pointer cursor.
  useEffect(() => () => { document.body.style.cursor = 'auto'; }, []);
  // Hidden until its deal beat. Set here rather than as a JSX `visible={false}`, which the
  // reconciler could stamp back over the animation on an incidental re-render.
  useEffect(() => { if (group.current) group.current.visible = false; }, []);

  const off = index - (count - 1) / 2;
  // A finger needs more room than a cursor: spread the fan wider on touch so neighbouring
  // cards don't share a tap target.
  const spread = touch ? 0.15 : 0.105;

  useFrame((state, delta) => {
    if (!group.current) return;
    const k = 1 - Math.exp(-delta * 10);
    // Tutorial hint: the guided card breathes upward until the player takes it.
    const hintLift = hinted && !selected ? 0.04 + Math.sin(state.clock.getElapsedTime() * 3) * 0.018 : 0;
    const lift = (selected ? 0.075 : hovered && canSelect ? 0.045 : 0) + hintLift;
    const tx = off * spread;
    const ty = -0.35 + lift - Math.abs(off) * 0.011;
    const tz = -0.78 + index * 0.007 + (selected ? 0.04 : 0);
    group.current.position.x += (tx - group.current.position.x) * k;
    group.current.position.y += (ty - group.current.position.y) * k;
    group.current.position.z += (tz - group.current.position.z) * k;
    const rz = -off * 0.1;
    group.current.rotation.z += (rz - group.current.rotation.z) * k;
  });

  return (
    <group
      ref={group}
      position={[off * spread, -0.55, -0.78]}
      rotation={[-0.18, 0, 0]}
      scale={0.23}
      onClick={canSelect ? (e) => { e.stopPropagation(); onSelect(card, index); } : undefined}
      onPointerOver={canSelect ? (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; } : undefined}
      onPointerOut={canSelect ? () => { setHovered(false); document.body.style.cursor = 'auto'; } : undefined}
    >
      <CardMesh type={card} castShadow={false} />
      {/* Invisible touch pad — a fingertip is far coarser than the card's own silhouette,
          and misses here read as "the game ignored me". Only on touch, so it can never
          steal a mouse hover from a neighbouring card. */}
      {touch && canSelect && (
        <mesh position={[0, 0, 0.02]} visible={false}>
          <planeGeometry args={[1.35, 1.9]} />
        </mesh>
      )}
    </group>
  );
}

// ————————————————————————— The hub's menu, as a hand —————————————————————————
//
// Replaces the old dock of five buttons. That dock was five identical tiles of equal
// weight pasted across the bottom of the render: no hierarchy (对战 looked exactly as
// important as 血榜, though it's what nearly every visit is for) and it cut the table's
// gold rim in half. Rearranging it didn't help, because a strip of buttons over a 3D room
// is the problem.
//
// So: the dealer deals you five. Taking one is how you go somewhere — the same gesture as
// playing a card, learned before the first chip is down, with no UI chrome at all.
//
// Dealt FACE DOWN and flipped on hover. That shows off the card back the player bought,
// and it makes the hub an act rather than a list.

const MENU_DEAL_STAGGER = 0.085;

// Camera-local rest pose for the fan. -0.34 cut the bottom third of every card off the
// frame; -0.2 overshot and left them floating. Split the difference.
const FAN_Y = -0.27;
const FAN_Z = -0.86;
// Separation between neighbours along the view axis. This was 0.006, barely more than a
// card's own thickness (0.022 × 0.26 scale ≈ 0.0057), so overlapping faces sat inside each
// other's depth slice and the sort order between them was a coin flip every frame.
const FAN_GAP = 0.022;

/** The featured card's ember, keyed to that card's own ink. */
const FEATURE_LIGHT: Partial<Record<MenuCardId, string>> = {
  duel: '#ff2a2a',
  tutorial: '#3fb3b3',
};

function MenuFanCard({ id, index, count, featured, onPick }: {
  id: MenuCardId;
  index: number;
  count: number;
  /**
   * The one card the eye should land on: normally 对战, but 新手引导 until it's done.
   * It sits higher, comes forward, and is the only card with any light on it — the rest
   * stay dark, which is what makes it read as a pointer rather than as decoration.
   */
  featured: boolean;
  onPick: (id: MenuCardId) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const touch = useIsTouch();
  const born = useRef<number | null>(null);
  const hero = featured;

  useEffect(() => () => { document.body.style.cursor = 'auto'; }, []);

  const off = index - (count - 1) / 2;
  // Wider than the in-match fan: these carry readable names, and on touch each one needs
  // its own comfortable target.
  const spread = touch ? 0.21 : 0.178;
  // The duel card is dealt last, so it lands on top of the others.
  const dealAt = (hero ? count - 1 : index < count / 2 ? index : index - 1) * MENU_DEAL_STAGGER;
  // Where this card comes to rest. The hit target below is pinned here and never moves,
  // which is the whole point — see the comment on it.
  const restX = off * spread;
  const restY = FAN_Y - Math.abs(off) * 0.016;
  const restZ = FAN_Z + index * FAN_GAP;

  // Touch has no hover, so a face-down fan would be unreadable and a tap-to-flip-then-tap
  // -again scheme makes every destination cost two taps. Instead the deal plays out face
  // down (the card back still gets its moment) and the whole hand turns over on landing.
  const [autoFaceUp, setAutoFaceUp] = useState(false);
  useEffect(() => {
    if (!touch) return;
    const t = setTimeout(() => setAutoFaceUp(true), (dealAt + 0.5) * 1000);
    return () => clearTimeout(t);
  }, [touch, dealAt]);
  const faceUp = touch ? autoFaceUp : hovered;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const now = state.clock.getElapsedTime();
    if (born.current === null) born.current = now;
    const age = now - born.current - dealAt;

    const k = 1 - Math.exp(-delta * 9);
    const lift = (hovered ? 0.055 : 0) + (hero ? 0.062 : 0);
    const tz = restZ + (hero ? 0.05 : 0) + (hovered ? 0.06 : 0);

    if (age < 0) {
      // Still in the dealer's hand: parked off the top of the frame, unseen.
      g.visible = false;
      g.position.set(0, 0.55, -1.5);
      return;
    }
    g.visible = true;
    g.position.x += (restX - g.position.x) * k;
    g.position.y += (restY + lift - g.position.y) * k;
    g.position.z += (tz - g.position.z) * k;

    const rz = -off * 0.13;
    g.rotation.z += (rz - g.rotation.z) * k;
    // Face down until you look at it. π → 0.
    const ry = faceUp ? 0 : Math.PI;
    g.rotation.y += (ry - g.rotation.y) * (1 - Math.exp(-delta * 11));
    // Tips up toward the camera as it turns over.
    g.rotation.x += ((-0.18 - (faceUp ? 0.1 : 0)) - g.rotation.x) * k;
  });

  // Hover state stays LOCAL to the card. Lifting it into GameBoard so a DOM label could
  // read it re-rendered the whole scene on every mouse move — and the label was redundant
  // anyway, because the card face has its own name printed on it.
  const enter = () => { setHovered(true); document.body.style.cursor = 'pointer'; };
  const leave = () => { setHovered(false); document.body.style.cursor = 'auto'; };

  return (
    <>
      {/*
        The hit target, and it is deliberately NOT part of the animated card.

        Putting the handlers on the card itself made it flicker: hovering rotates the card
        (π → 0) and lifts it, which drags its geometry out from under the cursor, which
        fires onPointerOut, which rotates it back under the cursor, which fires
        onPointerOver — an oscillation that reads as strobing. This plane sits at the
        card's rest pose and never moves, so the hover state can't chase its own tail.
        Slightly oversized, which also gives a fingertip somewhere forgiving to land.
      */}
      <mesh
        position={[restX, restY, restZ + 0.09]}
        rotation={[-0.18, 0, -off * 0.13]}
        scale={0.26}
        visible={false}
        onClick={(e) => { e.stopPropagation(); onPick(id); }}
        onPointerOver={touch ? undefined : (e) => { e.stopPropagation(); enter(); }}
        onPointerOut={touch ? undefined : leave}
      >
        <planeGeometry args={[touch ? 1.6 : 1.15, touch ? 2.1 : 1.6]} />
      </mesh>

      <group
        ref={group}
        position={[0, 0.55, -1.5]}
        rotation={[-0.18, Math.PI, 0]}
        scale={0.26}
        // No pointer handlers here — see above.
        raycast={() => null}
      >
        <MenuCardMesh faceId={id} />
        {/* The only light in the fan. Everything else stays dark, so this is the card the
            eye finds first — even face-down, even before the deal has finished. */}
        {hero && (
          <pointLight
            position={[0, 0, 0.5]}
            color={FEATURE_LIGHT[id] ?? '#ff2a2a'}
            intensity={hovered ? 1.9 : 1.0}
            distance={1.5}
            decay={2}
          />
        )}
      </group>
    </>
  );
}

function MenuFan({ tutorialDone, onPick }: {
  tutorialDone: boolean;
  onPick: (id: MenuCardId) => void;
}) {
  // Until the tutorial is done it is the card being pointed at; after that the spotlight
  // goes back to 对战, which is what nearly every later visit is for. The old dock had a
  // "从这里开始" tag doing this job; a lit card does it without any UI.
  const featuredId: MenuCardId = tutorialDone ? 'duel' : 'tutorial';
  return (
    <group>
      {MENU_ORDER.map((id, i) => (
        <MenuFanCard
          key={id}
          id={id}
          index={i}
          count={MENU_ORDER.length}
          featured={id === featuredId}
          onPick={onPick}
        />
      ))}
    </group>
  );
}

function HandFan({ cards, selectedIndex, canSelect, hintCard, onSelect }: {
  cards: CardType[]; selectedIndex: number | null; canSelect: boolean;
  hintCard: CardType | null;
  onSelect: (card: CardType, index: number) => void;
}) {
  const hintIndex = hintCard ? cards.indexOf(hintCard) : -1;
  return (
    <group>
      {cards.map((card, i) => (
        <FanCard
          key={card + '-' + i + '-' + cards.length}
          card={card}
          index={i}
          count={cards.length}
          selected={i === selectedIndex}
          canSelect={canSelect}
          hinted={i === hintIndex && canSelect}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}


// The player's own gloved hand, gripping the fan from below. Camera-local coordinates.
// The player's own gloved fist, generated via Meshy (see scripts/meshy.mjs).
// One left-hand model, mirrored on X for the right — hence the negative scale.
function GloveHand({ position, mirror = false }: { position: [number, number, number]; mirror?: boolean }) {
  const { scene } = useGLTF('/models/hand.glb');
  const m = mirror ? -1 : 1;

  // Clone per instance (two hands share one cached source), and pull the generated
  // material into the room's palette: the raw asset is a glossy near-black.
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false; // viewmodel: it hovers by the camera, its shadow means nothing
      mesh.receiveShadow = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = src.clone();
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set('#3a3a44');
      mat.roughness = 0.92; // kill the latex sheen the generator baked in
      mat.metalness = 0.05;
      mat.emissive.set('#0a0a12');
      mat.emissiveIntensity = 0.35;
    });
    return root;
  }, [scene]);

  return (
    <group position={position} rotation={[-0.4, m * 0.3, m * -0.1]} scale={[m * 0.09, 0.09, 0.09]}>
      <primitive object={model} />
    </group>
  );
}
useGLTF.preload('/models/hand.glb');

// ————————————————————————————— Environment —————————————————————————————

// Polished stone floor — the reflection is what sells "grand hall" instead of "void".
// The reflective material renders the whole scene a second time, so lower quality
// tiers swap in a plain dark material instead.
function Floor({ reflective }: { reflective: boolean }) {
  // Real marble — the tint multiplies the light-gray diffuse down into the room's palette.
  const marble = usePbr('marble_01', 12, 12);
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, -2]}>
      <planeGeometry args={[40, 40]} />
      {reflective ? (
        <MeshReflectorMaterial
          {...marble}
          normalScale={[0.6, 0.6]}
          blur={[400, 100]}
          resolution={512}
          mixBlur={1}
          mixStrength={5}
          roughness={0.6}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#3a3a46"
          metalness={0.35}
          mirror={0.4}
        />
      ) : (
        <meshStandardMaterial {...marble} normalScale={new THREE.Vector2(0.6, 0.6)} color="#3a3a46" roughness={0.5} metalness={0.3} emissive="#0c0c14" emissiveIntensity={0.4} />
      )}
    </mesh>
  );
}

// Blood-red carpet under the table, ringed with a gold border.
function Carpet() {
  const pile = usePbr('dirty_carpet', 8, 8);
  return (
    <group position={[0, FLOOR_Y + 0.005, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <circleGeometry args={[3.4, 64]} />
        <meshStandardMaterial {...pile} normalScale={new THREE.Vector2(0.9, 0.9)} color="#4a1216" roughness={1} metalness={0} emissive="#0e0305" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[3.28, 3.4, 96]} />
        <meshStandardMaterial color="#8a6a20" emissive="#8a6a20" emissiveIntensity={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

// Load a Meshy prop and pull its baked material into the room's palette. Every one of
// them ships glossier and lighter than this room wants, and they all share a cached
// scene — so clone before touching anything or one prop's tweaks hit all of them.
function useProp(url: string, tune: (m: THREE.MeshStandardMaterial) => void) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
      tune(mesh.material as THREE.MeshStandardMaterial);
    });
    return root;
  }, [scene, tune]);
}

// ————————————————————————— The shabby defaults —————————————————————————
// What a new player starts with. Built from primitives on purpose: crude geometry reads
// as cheap, which is exactly right for a basement game, and it means the shop has a real
// before/after on day one without waiting on any asset pipeline.

// One bulb on a cord — the whole iconography of an underground card game.
function BareBulb() {
  const bulb = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const finale = useContext(FinaleContext);
  const y = CHANDELIER_BOTTOM + 0.2;
  const cordLen = CEILING_Y - y;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const f = finale.current;
    // Mains hum: a slight, irregular flicker. Dies with the room in the dark endings.
    let mul = 0.92 + Math.sin(t * 9.3) * 0.04 + Math.sin(t * 23.7) * 0.03;
    if (f.kind === 'execution') mul *= 1 - Math.min(Math.max((finaleElapsed(f, t) - 0.3) / 1.0, 0), 1);
    else if (f.kind === 'broke') mul = finaleElapsed(f, t) > 1.6 ? 0 : mul;
    if (light.current) light.current.intensity = 2.6 * mul;
    const m = bulb.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 2.8 * mul;
  });
  return (
    <group position={[0, y, -0.9]}>
      <mesh position={[0, cordLen / 2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, cordLen, 6]} />
        <meshStandardMaterial color="#14141a" roughness={0.9} />
      </mesh>
      {/* Brass socket */}
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.035, 0.04, 0.09, 10]} />
        <meshStandardMaterial color="#5a4a28" metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh ref={bulb}>
        <sphereGeometry args={[0.07, 14, 12]} />
        <meshStandardMaterial color="#ffe0a0" emissive="#ffca70" emissiveIntensity={2.8} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#ffca80" intensity={2.6} distance={8} decay={1.7} />
    </group>
  );
}

// A folding steel chair. Cold, hard, and entirely without ceremony.
function PlainChair() {
  const z = DEALER_POS[2] - 0.34 * DEALER_SCALE;
  const seatY = FLOOR_Y + 0.92;
  const mat = { color: '#2a2a32', metalness: 0.7, roughness: 0.55 };
  return (
    <group position={[DEALER_POS[0], 0, z]}>
      <mesh position={[0, seatY, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.05, 0.9]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Backrest, tipped back a touch */}
      <mesh position={[0, seatY + 0.52, -0.42]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.9, 1.0, 0.05]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {[[-0.4, -0.38], [0.4, -0.38], [-0.4, 0.38], [0.4, 0.38]].map(([x, dz], i) => (
        <mesh key={i} position={[x, (seatY + FLOOR_Y) / 2, dz]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, seatY - FLOOR_Y, 8]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
    </group>
  );
}

// A dented tin ashtray — the only thing on a cheap table.
function TinAshtray() {
  return (
    <group position={[-1.35, TABLE_SURFACE_Y, -0.75]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.1, 0.035, 20]} />
        <meshStandardMaterial color="#4a4a4e" metalness={0.65} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.019, 0]}>
        <cylinderGeometry args={[0.105, 0.105, 0.004, 20]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.95} />
      </mesh>
      {/* Two stubbed-out butts */}
      {[[0.05, 0.03, 0.6], [-0.04, -0.05, -1.1]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.028, z]} rotation={[Math.PI / 2, 0, r]}>
          <cylinderGeometry args={[0.011, 0.011, 0.07, 8]} />
          <meshStandardMaterial color="#d8cdb4" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// Art Deco chandelier over the table — a visible source for the room's warm light.
// The rod's length is derived from the model's own top, so it meets the ceiling no
// matter how CHANDELIER_BOTTOM or the scale is retuned.
const ROD_LEN = CEILING_Y - (CHANDELIER_Y + CHANDELIER_HALF);
const tuneChandelier = (m: THREE.MeshStandardMaterial) => {
  m.roughness = 0.35;
  m.metalness = 0.85;
  // It IS the room's light source, so it has to look lit rather than merely gold.
  m.emissive.set('#f0c070');
  m.emissiveIntensity = 0.28;
};
function Chandelier({ url, accent }: { url: string; accent: string }) {
  const model = useProp(url, tuneChandelier);
  const light = useRef<THREE.PointLight>(null);
  const hotspot = useRef<THREE.Mesh>(null);
  const finale = useContext(FinaleContext);
  // Hung from its measured underside. CHANDELIER_BOTTOM is the real constraint (below it
  // the fixture covers the dealer's head), so it's the number the fit is solved against —
  // swapping in a differently-proportioned model can't break the framing.
  const fit = useFit(model, { height: 2.09, bottomY: CHANDELIER_BOTTOM });
  const topY = fit.position[1] + new THREE.Box3().setFromObject(model).max.y * fit.scale[1];
  useFrame(({ clock }) => {
    const f = finale.current;
    if (!f.kind) return;
    const t = finaleElapsed(f, clock.getElapsedTime());
    let mul = 1;
    if (f.kind === 'execution') mul = 1 - Math.min(Math.max((t - 0.3) / 1.0, 0), 1);
    else if (f.kind === 'broke') mul = t > 1.6 ? 0 : 1;
    else return;
    if (light.current) light.current.intensity = 1.3 * mul;
    if (hotspot.current) hotspot.current.visible = mul > 0.15;
  });
  const rodLen = Math.max(CEILING_Y - topY, 0.05);
  return (
    <group position={[0, 0, -0.9]}>
      {/* Rod from the fixture's crown up into the ceiling, length derived so it always meets */}
      <mesh position={[0, topY + rodLen / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, rodLen, 8]} />
        <meshStandardMaterial color="#3a2c10" metalness={0.8} roughness={0.4} />
      </mesh>
      <primitive object={model} position={fit.position} scale={fit.scale} />
      {/* The blown-out core. A model can't emit light, and without this the fixture reads
          as an ornament rather than the thing lighting the room. */}
      <mesh ref={hotspot} position={[0, CHANDELIER_BOTTOM + 1.0, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color={accent} intensity={1.3} distance={7} decay={1.8} position={[0, CHANDELIER_BOTTOM + 1.2, 0]} />
    </group>
  );
}
useGLTF.preload('/models/chandelier.glb');
useGLTF.preload('/models/chandelier_skull.glb');

const LIGHT_MODEL: Record<string, { url: string; accent: string }> = {
  'light.deco': { url: '/models/chandelier.glb', accent: '#ffb850' },
  'light.skull': { url: '/models/chandelier_skull.glb', accent: '#ffd08a' },
};

// ————————————————————————————— The room —————————————————————————————
// A sealed private gambling den: midnight-blue walls, deep-red pilasters, gold fan
// sconces, and tall barred windows onto a night city (palette from the Dark Deco refs).

const WALL_MAT = { color: '#0d1226', roughness: 0.85, metalness: 0.05, emissive: '#0a0e1c', emissiveIntensity: 0.5 };
const PILASTER_MAT = { color: '#3a0d16', roughness: 0.8, metalness: 0.05, emissive: '#1c060a', emissiveIntensity: 0.55 };

// Art Deco fan sconce — gold blades spreading from a base, the signature wall light.
// The blades are toneMapped=false, so in a finale blackout they'd keep glowing like
// neon unless the finale dims their emissive along with the point light.
function FanSconce({ position, rotationY, withLight }: {
  position: [number, number, number]; rotationY: number; withLight: boolean;
}) {
  const blades = 9;
  const root = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const finale = useContext(FinaleContext);
  useFrame(({ clock }) => {
    const f = finale.current;
    if (!f.kind) return;
    const t = finaleElapsed(f, clock.getElapsedTime());
    let mul = 1;
    if (f.kind === 'execution') mul = 1 - Math.min(Math.max((t - 0.3) / 1.0, 0), 1);
    else if (f.kind === 'broke') mul = t > 1.0 ? 0 : 1; // first breaker to trip
    else return;
    if (light.current) light.current.intensity = 0.9 * mul;
    root.current?.traverse((o) => {
      const m = (o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material as THREE.MeshStandardMaterial) : null;
      if (m && m.emissiveIntensity > 0) m.emissiveIntensity = 1.15 * mul;
    });
  });
  return (
    <group ref={root} position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, -0.28, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 0.22, 8]} />
        <meshStandardMaterial color="#5a451a" metalness={0.9} roughness={0.3} />
      </mesh>
      {Array.from({ length: blades }).map((_, i) => {
        const a = (i / (blades - 1) - 0.5) * Math.PI * 0.85;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.16, Math.cos(a) * 0.16 - 0.1, 0]} rotation={[0, 0, -a]}>
            <boxGeometry args={[0.055, 0.34, 0.02]} />
            <meshStandardMaterial color="#c49a30" metalness={0.7} roughness={0.35} emissive="#e8c060" emissiveIntensity={1.15} toneMapped={false} />
          </mesh>
        );
      })}
      {withLight && <pointLight ref={light} color="#e8c060" intensity={0.9} distance={4.5} decay={2} position={[0, 0.1, 0.35]} />}
    </group>
  );
}

// Night city seen through the windows — moonlit blue sky, black towers, warm window dots.
function useCityTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 640;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 640);
    grad.addColorStop(0, '#1a2a5e');
    grad.addColorStop(0.55, '#101a40');
    grad.addColorStop(1, '#0a1028');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 640);
    ctx.fillStyle = 'rgba(232,220,180,0.16)';
    ctx.beginPath();
    ctx.arc(360, 130, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,220,180,0.9)';
    ctx.beginPath();
    ctx.arc(360, 130, 58, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 26; i++) {
      const w = 30 + Math.random() * 60;
      const x = Math.random() * (512 - w);
      const h = 160 + Math.random() * 340;
      ctx.fillStyle = i % 3 === 0 ? '#0c1330' : '#091026';
      ctx.fillRect(x, 640 - h, w, h);
      ctx.fillStyle = '#e8c060';
      for (let wx = x + 5; wx < x + w - 6; wx += 12) {
        for (let wy = 640 - h + 8; wy < 620; wy += 16) {
          if (Math.random() < 0.28) ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

// Tall barred window — gold frame, iron bars, city glow behind.
function ArchWindow({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const city = useCityTexture();
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, -0.06]}>
        <planeGeometry args={[2.2, 3.4]} />
        <meshBasicMaterial map={city} toneMapped={false} />
      </mesh>
      {/* Gold frame */}
      {[-1.14, 1.14].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.09, 3.55, 0.09]} />
          <meshStandardMaterial color="#8a6a20" metalness={0.85} roughness={0.35} emissive="#4a3810" emissiveIntensity={0.5} />
        </mesh>
      ))}
      {[1.78, -1.78].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[2.36, 0.1, 0.1]} />
          <meshStandardMaterial color="#8a6a20" metalness={0.85} roughness={0.35} emissive="#4a3810" emissiveIntensity={0.5} />
        </mesh>
      ))}
      {/* Iron bars — you're locked in here with the game */}
      {[-0.55, 0, 0.55].map((x) => (
        <mesh key={'b' + x} position={[x, 0, 0.02]}>
          <boxGeometry args={[0.035, 3.4, 0.035]} />
          <meshStandardMaterial color="#1a1a20" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.6, 0.02]}>
        <boxGeometry args={[2.2, 0.035, 0.035]} />
        <meshStandardMaterial color="#1a1a20" metalness={0.8} roughness={0.4} />
      </mesh>
    </group>
  );
}

// ————————————————————————— 沉船宴会厅 —————————————————————————
//
// A liner's dining saloon, gone down and settled on its side. Almost none of this is
// modelled: the room slot is already ~85% procedural (walls, drapes, banners, railing,
// carpet and ceiling are all code — only the column, the sconce and the ceiling rose are
// GLBs), and what actually sells a flooded room is light and motion, which no amount of
// model generation can give you.
//
// The whole effect rests on one contrast: the ARCHITECTURE is tilted and the WATER IS NOT.
// A level waterline cutting across a canted room is what the eye reads as "this ship is
// going down", and it costs one rotation on a group.

/** How far the wreck leans. Small on purpose — enough to unsettle, not enough to notice. */
const WRECK_TILT = 0.042;
/** Waterline, in world Y. Floor is -0.55, felt is 0.84: shin-deep, well clear of the cards. */
const WATER_Y = 0.12;

/**
 * Caustics, as a canvas texture. Summed sine bands raised to a high power leave thin
 * bright filaments — the same trick a shader would use, baked once at 256² and then just
 * scrolled, so it costs one texture and no per-frame maths.
 */
function makeCausticTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Wrapping frequencies (whole multiples of 2π across the texture) so it tiles.
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const s =
        Math.sin(u * 3 + Math.cos(v * 2) * 1.4) +
        Math.sin(v * 4 - Math.cos(u * 3) * 1.1) +
        Math.sin((u + v) * 2.5);
      const b = Math.pow(Math.max(0, s / 3), 6);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 252;
      img.data[i + 2] = 226;
      img.data[i + 3] = Math.min(255, b * 900);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let causticCache: THREE.CanvasTexture | null = null;
const causticTexture = () => (causticCache ??= makeCausticTexture());

/**
 * Light dancing on the ceiling, refracted up off the water. Two additive sheets at
 * different scales drifting in different directions — one alone reads as a moving pattern,
 * two crossing read as water.
 */
function Caustics() {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => causticTexture(), []);
  const matA = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex.clone(), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), [tex]);
  const matB = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex.clone(), transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), [tex]);
  useEffect(() => {
    (matA.map as THREE.Texture).repeat.set(3, 3);
    (matB.map as THREE.Texture).repeat.set(1.7, 1.7);
    return () => { matA.map?.dispose(); matB.map?.dispose(); matA.dispose(); matB.dispose(); };
  }, [matA, matB]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const ma = matA.map, mb = matB.map;
    if (ma) ma.offset.set(t * 0.021, t * 0.013);
    if (mb) mb.offset.set(-t * 0.014, t * 0.019);
    // A slow swell in brightness, as if the surface above were rolling.
    matA.opacity = 0.38 + Math.sin(t * 0.5) * 0.12;
    matB.opacity = 0.26 + Math.sin(t * 0.37 + 2) * 0.09;
  });

  const y = WALL_H + FLOOR_Y - 0.06;
  return (
    <>
      <mesh ref={a} position={[0, y, -0.5]} rotation={[Math.PI / 2, 0, 0]} material={matA} renderOrder={1}>
        <planeGeometry args={[16, 17]} />
      </mesh>
      <mesh ref={b} position={[0, y - 0.02, -0.5]} rotation={[Math.PI / 2, 0, 0.7]} material={matB} renderOrder={1}>
        <planeGeometry args={[16, 17]} />
      </mesh>
    </>
  );
}

/**
 * The flood. Level, while everything around it is not.
 *
 * On the top tier this is a real reflector, because the room upside-down in black water is
 * the whole picture. It renders the scene a second time, so the lower tiers get a plain
 * dark surface with the same drifting caustic sheen on top — which still reads, because
 * the caustics carry the motion.
 */
function FloodWater({ reflective }: { reflective: boolean }) {
  const sheen = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => causticTexture().clone(), []);
  const sheenMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), [tex]);
  useEffect(() => {
    tex.repeat.set(5, 5);
    return () => { tex.dispose(); sheenMat.dispose(); };
  }, [tex, sheenMat]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    tex.offset.set(t * 0.008, -t * 0.011);
    // The surface itself breathes a few millimetres. Enough that the waterline against the
    // walls is never perfectly still.
    if (sheen.current) sheen.current.position.y = WATER_Y + 0.004 + Math.sin(t * 0.6) * 0.006;
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, -1]}>
        <planeGeometry args={[30, 30]} />
        {reflective ? (
          <MeshReflectorMaterial
            blur={[300, 90]}
            resolution={512}
            mixBlur={1.1}
            mixStrength={7}
            depthScale={1.2}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.5}
            color="#0b1416"
            roughness={0.35}
            metalness={0.5}
            mirror={0.62}
          />
        ) : (
          <meshStandardMaterial color="#0b1416" roughness={0.28} metalness={0.55} transparent opacity={0.94} />
        )}
      </mesh>
      <mesh ref={sheen} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y + 0.004, -1]} material={sheenMat} renderOrder={1}>
        <planeGeometry args={[30, 30]} />
      </mesh>
    </>
  );
}

/** What's left floating. A handful of slabs turning slowly — the room's own wreckage. */
function Flotsam() {
  const group = useRef<THREE.Group>(null);
  const bits = useMemo(() => (
    Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + i * 0.7;
      const r = 3.2 + ((i * 37) % 100) / 100 * 2.6;
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r - 1,
        w: 0.18 + ((i * 53) % 100) / 100 * 0.5,
        d: 0.12 + ((i * 91) % 100) / 100 * 0.3,
        spin: (i % 2 ? 1 : -1) * (0.03 + ((i * 17) % 50) / 1000),
        phase: i * 1.1,
      };
    })
  ), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.children.forEach((c, i) => {
      const b = bits[i];
      c.rotation.y = t * b.spin + b.phase;
      c.position.y = WATER_Y + 0.012 + Math.sin(t * 0.5 + b.phase) * 0.012;
      c.rotation.z = Math.sin(t * 0.4 + b.phase) * 0.05;
    });
  });

  return (
    <group ref={group}>
      {bits.map((b, i) => (
        <mesh key={i} position={[b.x, WATER_Y + 0.012, b.z]} castShadow={false}>
          <boxGeometry args={[b.w, 0.018, b.d]} />
          <meshStandardMaterial color="#241a12" roughness={0.95} metalness={0} emissive="#0a0806" emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Room({ sconceLights, decoSconce }: { sconceLights: boolean; decoSconce: boolean }) {
  const wallH = WALL_H;
  const wallY = wallH / 2 + FLOOR_Y;
  return (
    <group>
      {/* Walls: left / right / back (behind drapes) / front (behind the player) */}
      <mesh position={[-7.2, wallY, -2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[18, wallH]} />
        <meshStandardMaterial {...WALL_MAT} />
      </mesh>
      <mesh position={[7.2, wallY, -2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[18, wallH]} />
        <meshStandardMaterial {...WALL_MAT} />
      </mesh>
      <mesh position={[0, wallY, -8.2]}>
        <planeGeometry args={[16, wallH]} />
        <meshStandardMaterial {...WALL_MAT} />
      </mesh>
      <mesh position={[0, wallY, 7.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[16, wallH]} />
        <meshStandardMaterial {...WALL_MAT} />
      </mesh>

      {/* Ceiling + coffered beams */}
      <mesh position={[0, wallH + FLOOR_Y, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 17]} />
        <meshStandardMaterial color="#0a0e1a" roughness={0.9} emissive="#080b16" emissiveIntensity={0.4} />
      </mesh>
      {[-4, 0, 4].map((x) => (
        <mesh key={'beam' + x} position={[x, wallH + FLOOR_Y - 0.18, -0.5]}>
          <boxGeometry args={[0.25, 0.32, 17]} />
          <meshStandardMaterial color="#141a30" roughness={0.7} metalness={0.2} emissive="#0c1020" emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Red pilasters with gold hairlines + fan sconces along the side walls */}
      {([-1, 1] as const).map((side) =>
        [-5.5, -1.5, 2.5].map((z) => (
          <group key={side + '/' + z} position={[side * 7.05, 0, z]}>
            <mesh position={[0, 2.2, 0]}>
              <boxGeometry args={[0.28, 5.6, 1.0]} />
              <meshStandardMaterial {...PILASTER_MAT} />
            </mesh>
            <mesh position={[side * -0.16, 2.2, 0]} rotation={[0, side * -Math.PI / 2, 0]}>
              <planeGeometry args={[0.06, 5.4]} />
              <meshStandardMaterial color="#8a6a20" emissive="#8a6a20" emissiveIntensity={0.6} roughness={0.4} />
            </mesh>
            {/* Only the pilasters near the table carry real lights — the rest just glow */}
            {decoSconce
              ? <DecoSconce position={[side * -0.38, 3.2, 0]} rotationY={side * -Math.PI / 2} withLight={sconceLights && z === -1.5} />
              : <FanSconce position={[side * -0.38, 3.2, 0]} rotationY={side * -Math.PI / 2} withLight={sconceLights && z === -1.5} />}
          </group>
        )),
      )}

      {/* Barred city windows between the pilasters */}
      <ArchWindow position={[-7.15, 2.1, -3.5]} rotationY={Math.PI / 2} />
      <ArchWindow position={[7.15, 2.1, 0.5]} rotationY={-Math.PI / 2} />

      {/* Behind the player: a sealed double door flanked by sconces — the way out, shut */}
      <group position={[0, 0, 7.4]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[2.4, 4.1, 0.15]} />
          <meshStandardMaterial color="#160a0e" roughness={0.7} metalness={0.15} emissive="#0e060a" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 1.5, -0.09]}>
          <boxGeometry args={[0.06, 4.1, 0.06]} />
          <meshStandardMaterial color="#8a6a20" metalness={0.85} roughness={0.35} emissive="#4a3810" emissiveIntensity={0.5} />
        </mesh>
        {([-1.9, 1.9] as const).map((x) => (decoSconce
          ? <DecoSconce key={x} position={[x, 3.0, -0.25]} rotationY={0} withLight={sconceLights} />
          : <FanSconce key={x} position={[x, 3.0, -0.25]} rotationY={0} withLight={sconceLights} />))}
      </group>
    </group>
  );
}

// ————————————————————————————— The ear drill —————————————————————————————
// The Kaiji pile driver (Meshy → see ASSETS.md). The asset is one fused mesh authored
// along X. Measured off the GLB rather than eyeballed (scripts profile the radius per
// X slice): the needle is the thin section, x ∈ [-0.953, -0.50], radius 0.041 at the
// root tapering to 0.010 at the tip. Everything at x > -0.50 jumps to radius 0.39+ —
// that's the machine body. We split by triangle centroid at that boundary so the body
// stays bolted down while ONLY the needle screws outward, with a threaded rod growing
// behind it to fill the gap.
//
// This used to be -0.62, which is 0.12 INSIDE the needle — so the needle was cut in
// half and the tip crawled away from its own stub. That's the "裂开".
const SPIKE_SPLIT_X = -0.5;
const NOTCH = 0.12; // how far the needle advances per set lost

// The needle is not on the model's X axis — its cross-section is centred here. Spinning
// it about the origin instead would swing it around in an orbit rather than roll it.
const NEEDLE_AXIS_Y = -0.09;
const NEEDLE_AXIS_Z = -0.002;
const NEEDLE_TIP_X = -0.953;

// Solve a drill's transform so its needle genuinely converges on an ear, given where we
// want the machine to stand (in XZ). Placing these by hand is how the last one ended up
// aimed at the dealer's jaw: the needle travels horizontally, so if the tip's height is
// off by even a little it can never arrive, no matter how long it grinds.
//
// The tip starts `standoff` from the ear and closes to standoff - 4·NOTCH·scale.
function aimDrill(ear: readonly [number, number, number], stand: readonly [number, number], scale: number, standoff: number) {
  const len = Math.hypot(ear[0] - stand[0], ear[2] - stand[1]);
  const dx = (ear[0] - stand[0]) / len;
  const dz = (ear[2] - stand[1]) / len;
  // The needle points down local -X, which R_y(θ) sends to (-cos θ, 0, sin θ).
  const rotationY = Math.atan2(dz, -dx);
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const lx = NEEDLE_TIP_X * scale;
  const lz = NEEDLE_AXIS_Z * scale;
  const position: [number, number, number] = [
    ear[0] - dx * standoff - (lx * c + lz * s),
    ear[1] - NEEDLE_AXIS_Y * scale, // lift so the tip's height IS the ear's height
    ear[2] - dz * standoff - (-lx * s + lz * c),
  ];
  return { position, rotationY, scale };
}

// Split the drill into [needle, body].
//
// Two hard-won constraints live here:
//
// 1. The optimize pipeline quantizes positions (normalized int16 + a dequantize
//    scale on the glTF node). Testing metre-space thresholds against the RAW
//    attribute silently moves the cut: normalized -0.5 is metre -0.477, and the
//    machine parts in that 0.023 gap got dragged into the spinning needle group —
//    they were the loose nuggets orbiting the machine. So the caller must bake the
//    node transform into real metres FIRST (bakeToMetres), and this function only
//    ever sees honest coordinates.
// 2. X range alone is not enough. Simplification can grow bridge triangles whose
//    centroid crosses the plane while their far vertices sit on the body, and the
//    model may carry loose fragments inside the needle's X range. So membership
//    also requires hugging the needle's axis: fully-hugging → needle, partly →
//    body (stays welded, static), fully detached → dropped entirely.
const NEEDLE_MAX_R = 0.16; // needle's true axis radius is ≤0.067; body starts at ~0.3

function bakeToMetres(mesh: THREE.Mesh): THREE.BufferGeometry {
  const srcGeo = mesh.geometry;
  const posAttr = srcGeo.attributes.position as THREE.BufferAttribute;
  mesh.updateMatrix();
  const v = new THREE.Vector3();
  const baked = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    // fromBufferAttribute denormalizes int16 → [-1,1]; the mesh's local matrix holds
    // the glTF dequantize scale/offset that lifting the geometry out of the scene loses.
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrix);
    baked[i * 3] = v.x;
    baked[i * 3 + 1] = v.y;
    baked[i * 3 + 2] = v.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(baked, 3));
  // Normals/UVs stay as the (possibly quantized) originals — the GPU denormalizes
  // those correctly on its own; only position needed the node transform baked in.
  for (const name of Object.keys(srcGeo.attributes)) {
    if (name !== 'position') geo.setAttribute(name, srcGeo.attributes[name]);
  }
  geo.setIndex(srcGeo.index);
  return geo;
}

function splitNeedle(geo: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const idx = geo.index;
  if (!idx) return [geo, geo];
  const needle: number[] = [];
  const body: number[] = [];
  const rOf = (vi: number) => Math.hypot(pos.getY(vi) - NEEDLE_AXIS_Y, pos.getZ(vi) - NEEDLE_AXIS_Z);
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    if (cx >= SPIKE_SPLIT_X) {
      body.push(a, b, c);
      continue;
    }
    const rs = [rOf(a), rOf(b), rOf(c)];
    if (Math.max(...rs) < NEEDLE_MAX_R) needle.push(a, b, c);
    else if (Math.min(...rs) < NEEDLE_MAX_R) body.push(a, b, c);
    // else: detached fragment in the needle's lane — dropped, it belongs to nothing
  }
  const make = (list: number[]) => {
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
    g.setIndex(list);
    g.computeBoundingSphere();
    return g;
  };
  return [make(needle), make(body)];
}

function EarDrill({ position, rotationY, progress, matchPoint, scale = 1, audible = false, role }: {
  position: [number, number, number]; rotationY: number; progress: number; matchPoint: boolean;
  scale?: number;
  /** Only the machine at your own ear drives the motor sound — two would just phase. */
  audible?: boolean;
  /** Whose ear this machine wants: yours or the dealer's. Decides which finale fires it. */
  role: 'player' | 'dealer';
}) {
  const { scene } = useGLTF('/models/eardrill.glb');
  const spike = useRef<THREE.Group>(null);
  const bit = useRef<THREE.Group>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const shake = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const finale = useContext(FinaleContext);
  const advance = Math.min(progress, 4) * NOTCH;
  // 0 at the start, 1 when the next set kills you.
  const strain = Math.min(progress, 4) / 4;

  // The finale plunge: cover the whole remaining standoff plus a little extra, so the
  // tip unambiguously arrives. In local units the standoff is 0.42/scale.
  const KILL_AT = role === 'player' ? 1.4 : 1.0; // execution winds up longer than regicide
  const killKind: FinaleKind = role === 'player' ? 'execution' : 'regicide';
  const plungeTarget = 0.42 / scale + 0.08;

  useEffect(() => {
    if (!audible) return;
    // Idling from the first deal, never silent — the threat is that it's already on.
    audio.setDrillRumble(0.12 + strain * 0.88);
    if (progress > 0) audio.sfx('drillAdvance');
  }, [audible, strain, progress]);

  useEffect(() => () => { if (audible) audio.stopDrillRumble(); }, [audible]);

  const { spikeGeo, bodyGeo, material } = useMemo(() => {
    let src: THREE.Mesh | null = null;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !src) src = mesh;
    });
    const mesh = src as THREE.Mesh | null;
    if (!mesh) return { spikeGeo: null, bodyGeo: null, material: null };

    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mat.roughness = 0.75; // pitted iron, not chrome
    mat.metalness = 0.85;
    mat.emissive.set('#0a0a0e');
    mat.emissiveIntensity = 0.3;

    const [s, b] = splitNeedle(bakeToMetres(mesh));
    return { spikeGeo: s, bodyGeo: b, material: mat };
  }, [scene]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    // Once this machine's finale fires, the needle stops creeping and goes.
    const killT = finaleElapsed(finale.current, t, killKind);
    const killing = killT > KILL_AT;

    if (spike.current) {
      // The needle creeps out; it never retreats fast, it grinds. Slow enough that you
      // watch it happen — it takes a couple of seconds to settle into the new notch.
      // In the finale it covers the whole remaining distance in under half a second.
      const target = killing ? -plungeTarget : -advance;
      const gap = target - spike.current.position.x;
      spike.current.position.x += gap * (1 - Math.exp(-delta * (killing ? 14 : 1.1)));

      // It's a screw, so it turns. Fast while it's travelling, idling the rest of the
      // time — a bit that never moves is scenery, one that always turns is a threat.
      if (bit.current) bit.current.rotation.x += (killing ? 42 : Math.abs(gap) > 0.002 ? 9 : 1.1 + strain * 2.6) * delta;

      // The exposed screw stretches to cover whatever gap the needle opened up.
      const out = -spike.current.position.x;
      if (shaft.current) {
        // scale.Y, not X: the cylinder's axis is its own local Y and the mesh is rotated
        // PI/2 about Z, so scaling X only fattened the radius — the rod stayed a full
        // unit long and hung there as a permanent pale spear across the whole table.
        shaft.current.scale.y = Math.max(out + 0.05, 0.001);
        shaft.current.position.set(SPIKE_SPLIT_X + 0.02 - out / 2, NEEDLE_AXIS_Y, NEEDLE_AXIS_Z);
        shaft.current.visible = out > 0.01;
      }
    }
    if (shake.current) {
      // Vibration is a curve, not a switch: the rig already trembles at idle and every
      // set lost cranks both the amplitude and the frequency. Match point is just the
      // top of that curve, so the player feels it coming instead of being surprised.
      const amp = killing ? 0.018 : 0.0014 + strain * 0.0055 + (matchPoint ? 0.0035 : 0);
      const hz = killing ? 60 : 26 + strain * 20;
      shake.current.position.y = Math.sin(t * hz) * amp;
      shake.current.position.z = Math.sin(t * hz * 0.83 + 1) * amp * 0.7;
      shake.current.rotation.z = Math.sin(t * hz * 1.17 + 2) * amp * 1.6;
    }
    if (lamp.current) {
      const pulse = killing
        ? 3.5 + Math.sin(t * 30) * 2.5 // strobing — the only light left in an execution
        : matchPoint ? 1.6 + Math.sin(t * 8) * 1.4 : Math.sin(t * 2.4) * 0.25 * strain;
      lamp.current.intensity = 0.3 + strain * 1.5 + pulse;
    }
  });

  if (!spikeGeo || !bodyGeo || !material) return null;

  // The asset is just the machine head — it has no leg. Without a post it hangs in
  // mid-air, so we drop a procedural stand from its body down to the floor.
  const postLen = (position[1] - FLOOR_Y) / scale;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Stand: post + base plate, planted under the machine's body end */}
      <group position={[0.42, 0, 0]}>
        <mesh position={[0, -postLen / 2, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, postLen, 10]} />
          <meshStandardMaterial color="#23232a" metalness={0.75} roughness={0.5} />
        </mesh>
        <mesh position={[0, -postLen + 0.02, 0]} receiveShadow>
          <cylinderGeometry args={[0.32, 0.38, 0.05, 16]} />
          <meshStandardMaterial color="#1c1c24" metalness={0.7} roughness={0.55} />
        </mesh>
      </group>

      <group ref={shake}>
        {/* Machine body — bolted down, never moves */}
        <mesh geometry={bodyGeo} material={material} castShadow />

        {/* The needle — the only part that advances. Nested so it can spin about its
            OWN axis while the outer group slides it out along X. */}
        <group ref={spike}>
          <group position={[0, NEEDLE_AXIS_Y, NEEDLE_AXIS_Z]}>
            <group ref={bit}>
              <mesh geometry={spikeGeo} material={material} position={[0, -NEEDLE_AXIS_Y, -NEEDLE_AXIS_Z]} castShadow />
            </group>
          </group>
        </group>

        {/* Threaded feed rod, revealed as the needle screws out. Unit-length along its
            own Y, scaled to bridge the gap; sits on the needle's axis, not the model's. */}
        <mesh ref={shaft} rotation={[0, 0, Math.PI / 2]} position={[SPIKE_SPLIT_X, NEEDLE_AXIS_Y, NEEDLE_AXIS_Z]} visible={false} castShadow>
          <cylinderGeometry args={[0.036, 0.036, 1, 10]} />
          <meshStandardMaterial color="#6a6558" metalness={0.9} roughness={0.45} />
        </mesh>

        {/* Warning lamp glow — reads even when the mesh is deep in shadow */}
        <pointLight ref={lamp} color="#ff2020" intensity={0.25} distance={1.4} decay={2} position={[0.25, 0.3, 0.1]} />
      </group>
    </group>
  );
}
useGLTF.preload('/models/eardrill.glb');

function DrapePanel({ position, width }: { position: [number, number, number]; width: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, 7.5, 32, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(x * 5.2) * 0.14 + Math.sin(x * 11 + 2) * 0.06);
    }
    g.computeVertexNormals();
    return g;
  }, [width]);
  // Satin weave catches the chandelier light along the fold ridges.
  const satin = usePbr('crepe_satin', 2.5, 5);
  return (
    <mesh geometry={geometry} position={position}>
      <meshStandardMaterial
        {...satin}
        normalScale={new THREE.Vector2(0.8, 0.8)}
        color="#5a1016"
        roughness={0.75}
        metalness={0.05}
        emissive="#160507"
        emissiveIntensity={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Drapes() {
  return (
    <group>
      <DrapePanel position={[-2.7, 3.2, -6.9]} width={2.6} />
      <DrapePanel position={[0, 3.2, -7.1]} width={3.2} />
      <DrapePanel position={[2.7, 3.2, -6.9]} width={2.6} />
    </group>
  );
}

// Royal banners flanking the opponent — swallowtail cut, gold trim and emblem.
function RoyalBanner({ x }: { x: number }) {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.4, 0);
    s.lineTo(0.4, 0);
    s.lineTo(0.4, -2.3);
    s.lineTo(0, -1.95);
    s.lineTo(-0.4, -2.3);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  return (
    <group position={[x, 3.35, -3.5]}>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 1.1, 8]} />
        <meshStandardMaterial color="#5a451a" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#4a0d12" roughness={0.9} emissive="#1c0508" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.14, 0.005]}>
        <planeGeometry args={[0.8, 0.035]} />
        <meshStandardMaterial color="#c49a30" emissive="#c49a30" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, -1.05, 0.005]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.2, 0.2]} />
        <meshStandardMaterial color="#c49a30" emissive="#c49a30" emissiveIntensity={1.2} roughness={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Railing arc separating the pit from the spectators behind the opponent.
const RAIL_POST_ANGLES = [200, 235, 270, 305, 340];

function Railing() {
  return (
    <group position={[0, 0, -0.3]}>
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0.262]}>
        <torusGeometry args={[4.2, 0.03, 10, 96, 2.618]} />
        <meshStandardMaterial color="#5a451a" metalness={0.85} roughness={0.35} emissive="#2c2008" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0.262]}>
        <torusGeometry args={[4.2, 0.018, 8, 96, 2.618]} />
        <meshStandardMaterial color="#4a3814" metalness={0.85} roughness={0.4} emissive="#241a08" emissiveIntensity={0.4} />
      </mesh>
      {RAIL_POST_ANGLES.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <mesh key={i} position={[Math.cos(rad) * 4.2, -0.03, Math.sin(rad) * 4.2]}>
            <cylinderGeometry args={[0.035, 0.045, 1.04, 10]} />
            <meshStandardMaterial color="#4a3814" metalness={0.85} roughness={0.4} emissive="#241a08" emissiveIntensity={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}

// ————————————————————————— Bought upgrades —————————————————————————
// Meshy normalises every export into a ~1.9 box, so these are all placed from measured
// bbox numbers rather than eyeballed scales (see ASSETS.md).

// The Deco table replaces the BODY only — slab, pedestal and base. The felt and the gold
// betting rings stay procedural on top of it, because they're where cards and chips are
// positioned and their radii are load-bearing. What you gain is the carved rim and the
// real pedestal showing around and beneath them.
//
// Scaled non-uniformly on purpose. The model is proportioned like a small café table
// (1.9 wide × 1.24 tall); our table is 5.1 across but only 1.39 from floor to felt.
// Scaling uniformly to the right radius would make it 3.3 units tall — a podium. The
// squash is invisible from a seated camera looking down at the surface.
// Fit a Meshy prop into the scene from its ACTUAL loaded bounds. Every model here is
// meshopt-quantized, so its real extent is (normalized ints × a node scale) — a constant
// measured offline is a different number, and that mismatch is exactly what once left the
// Deco table floating above its own felt. Box3 sees whatever really got loaded.
//
// `parentY` is the Y of the group this will be mounted in, so the returned position can be
// group-relative (the other half of that same bug).
function useFit(model: THREE.Object3D, opts: {
  radius?: number;      // target XZ radius; omit to scale by height alone
  bottomY?: number;     // world Y its underside should rest on
  topY?: number;        // world Y its top should reach
  height?: number;      // explicit world height, when not derived from bottom+top
  parentY?: number;
  parentZ?: number;
  centreZ?: boolean;    // also centre it in Z (props that must sit on the table axis)
}) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const py = opts.parentY ?? 0;

    const wantH = opts.height ?? (opts.topY !== undefined && opts.bottomY !== undefined ? opts.topY - opts.bottomY : undefined);
    const scaleY = wantH !== undefined ? wantH / size.y : 1;
    const scaleXZ = opts.radius !== undefined ? opts.radius / (Math.max(size.x, size.z) / 2) : scaleY;

    const baseY = opts.bottomY !== undefined
      ? opts.bottomY - box.min.y * scaleY
      : (opts.topY ?? 0) - box.max.y * scaleY;

    return {
      scale: [scaleXZ, scaleY, scaleXZ] as [number, number, number],
      position: [
        -centre.x * scaleXZ,
        baseY - py,
        opts.centreZ ? -centre.z * scaleXZ : -(opts.parentZ ?? 0) * 0,
      ] as [number, number, number],
    };
  }, [model, opts.radius, opts.bottomY, opts.topY, opts.height, opts.parentY, opts.parentZ, opts.centreZ]);
}

const tuneDecoTable = (m: THREE.MeshStandardMaterial) => {
  m.roughness = 0.5;
  m.metalness = 0.35;
  m.emissive.set('#0d0d16');
  m.emissiveIntensity = 0.3;
};
// Non-uniform on purpose: Meshy proportions these like small café tables (~1.9 wide ×
// 1.24 tall) while ours is 5.1 across but only 1.39 from floor to felt. Matching the
// radius uniformly would stand one 3.3 units tall — a podium.
function TableBody({ url }: { url: string }) {
  const model = useProp(url, tuneDecoTable);
  const fit = useFit(model, {
    radius: TABLE_R_TOP,
    bottomY: FLOOR_Y,
    topY: TABLE_SURFACE_Y,
    parentY: TABLE_GROUP_POS[1],
    centreZ: true,
  });
  return <primitive object={model} position={fit.position} scale={fit.scale} />;
}
useGLTF.preload('/models/table_deco.glb');
useGLTF.preload('/models/table_obsidian.glb');
useGLTF.preload('/models/table_jade.glb');

// Which GLB each paid table uses. The plain default stays procedural.
const TABLE_MODEL: Record<string, string> = {
  'table.deco': '/models/table_deco.glb',
  'table.obsidian': '/models/table_obsidian.glb',
  'table.jade': '/models/table_jade.glb',
};

// The model's flat, wide side is at -Z and it narrows toward +Z, which matches the
// procedural sconce's convention: +Z points out of the wall.
const tuneSconce = (m: THREE.MeshStandardMaterial) => {
  m.roughness = 0.35;
  m.metalness = 0.85;
  m.emissive.set('#e8c060');
  m.emissiveIntensity = 0.5;
};
function DecoSconce({ position, rotationY, withLight }: {
  position: [number, number, number]; rotationY: number; withLight: boolean;
}) {
  const model = useProp('/models/sconce_deco.glb', tuneSconce);
  const light = useRef<THREE.PointLight>(null);
  const finale = useContext(FinaleContext);
  useFrame(({ clock }) => {
    const f = finale.current;
    if (!f.kind || !light.current) return;
    const t = finaleElapsed(f, clock.getElapsedTime());
    if (f.kind === 'execution') light.current.intensity = 0.9 * (1 - Math.min(Math.max((t - 0.3) / 1.0, 0), 1));
    else if (f.kind === 'broke') light.current.intensity = t > 1.0 ? 0 : 0.9;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 1.906 tall in the box → 0.42 puts it at 0.8 units ≈ 43cm, a real sconce */}
      <primitive object={model} scale={0.42} />
      {withLight && <pointLight ref={light} color="#e8c060" intensity={0.9} distance={4.5} decay={2} position={[0, 0.1, 0.35]} />}
    </group>
  );
}
useGLTF.preload('/models/sconce_deco.glb');

// A rosette around the chandelier's mount. The disc lies in the model's XY plane with Z
// as depth, so rotateX(+90°) sends its face (+Z) to -Y — pointing down at the room.
const tuneRose = (m: THREE.MeshStandardMaterial) => {
  m.roughness = 0.45;
  m.metalness = 0.8;
  m.emissive.set('#3a2c10');
  m.emissiveIntensity = 0.45;
};
function CeilingRose() {
  const model = useProp('/models/ceiling_rose.glb', tuneRose);
  const scale = 1.5; // 1.898 across → 2.85 units ≈ 1.5m, in scale with a 7-unit ceiling
  return (
    <primitive
      object={model}
      position={[0, CEILING_Y - 0.19 * scale, -0.9]}
      rotation={[Math.PI / 2, 0, 0]}
      scale={scale}
    />
  );
}
useGLTF.preload('/models/ceiling_rose.glb');

function Table({ variant }: { variant: string }) {
  const wood = usePbr('dark_wood', 3, 3);
  const felt = usePbr('dirty_carpet', 6, 6);
  const ringColor = '#d4a838';
  return (
    <group position={TABLE_GROUP_POS}>
      {TABLE_MODEL[variant] ? <TableBody url={TABLE_MODEL[variant]} /> : (
      <>
      {/* Lacquered wood slab — real grain under a clearcoat polish */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[TABLE_R_TOP, TABLE_R_BOTTOM, TABLE_HEIGHT, 96]} />
        <meshPhysicalMaterial
          {...wood}
          normalScale={new THREE.Vector2(0.7, 0.7)}
          color="#6a564a"
          roughness={0.45}
          metalness={0.1}
          clearcoat={0.8}
          clearcoatRoughness={0.25}
          emissive="#0d0d16"
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Pedestal + base. Length is derived, not hard-coded: the column has to span from
          the slab's underside all the way down to the floor, whatever height the table sits at. */}
      <mesh castShadow position={[0, -(TABLE_HEIGHT / 2 + PEDESTAL_LEN / 2), 0]}>
        <cylinderGeometry args={[0.42, 0.58, PEDESTAL_LEN, 32]} />
        <meshStandardMaterial color="#16161f" roughness={0.5} metalness={0.4} emissive="#0a0a12" emissiveIntensity={0.4} />
      </mesh>
      <mesh receiveShadow position={[0, -(TABLE_HEIGHT / 2 + PEDESTAL_LEN) + 0.05, 0]}>
        <cylinderGeometry args={[1.25, 1.45, 0.1, 64]} />
        <meshStandardMaterial color="#14141d" roughness={0.45} metalness={0.4} emissive="#0a0a12" emissiveIntensity={0.4} />
      </mesh>
      </>
      )}

      {/* Felt playing surface — carpet-pile normals read as brushed felt up close.
          The Deco table brings its own green baize, so ours would just hide the upgrade;
          the gold rings below it stay either way, because they're table markings. */}
      {!TABLE_MODEL[variant] && (
      <mesh receiveShadow position={[0, TABLE_HEIGHT / 2 + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.34, 96]} />
        <meshStandardMaterial
          normalMap={felt.normalMap}
          roughnessMap={felt.roughnessMap}
          normalScale={new THREE.Vector2(0.7, 0.7)}
          color="#1e1e2c"
          roughness={0.95}
          metalness={0}
          emissive="#0c0c16"
          emissiveIntensity={0.45}
        />
      </mesh>
      )}

      {/* Rounded gold bevel at the rim — real geometry, not a painted stripe */}
      <mesh position={[0, TABLE_HEIGHT / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[TABLE_R_TOP - 0.015, 0.03, 12, 128]} />
        <meshStandardMaterial color="#7a5c1c" metalness={0.95} roughness={0.28} emissive="#4a3810" emissiveIntensity={0.5} />
      </mesh>

      {/* Art deco inlay rings — hot enough to catch bloom */}
      {[1.85, 2.05].map((r, i) => (
        <mesh key={i} position={[0, TABLE_HEIGHT / 2 + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r, r + 0.03, 128]} />
          <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={1.25} roughness={0.35} toneMapped={false} />
        </mesh>
      ))}

      {/* Sunburst spokes */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const r = 1.55;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, TABLE_HEIGHT / 2 + 0.011, Math.sin(angle) * r]}
            rotation={[-Math.PI / 2, 0, -angle]}
          >
            <planeGeometry args={[0.025, 0.7]} />
            <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.6} transparent opacity={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

// ————————————————————————————— Opponent —————————————————————————————

const BODY_MAT = { color: '#20202e', roughness: 0.85, metalness: 0.05, emissive: '#0c0c16', emissiveIntensity: 0.5 };
const ACCENT_MAT = { color: '#6a1015', roughness: 0.7, metalness: 0.2, emissive: '#aa1111', emissiveIntensity: 0.55 };

// Thin gold strut between two points — used for the medallion chains.
function Chain({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const { position, quaternion, length } = useMemo(() => {
    const s = new THREE.Vector3(...from);
    const e = new THREE.Vector3(...to);
    const d = e.clone().sub(s);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return { position: s.clone().add(e).multiplyScalar(0.5), quaternion: q, length: len };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[0.008, 0.008, length, 6]} />
      <meshStandardMaterial color="#c49a30" metalness={0.9} roughness={0.35} emissive="#8a6a20" emissiveIntensity={0.4} />
    </mesh>
  );
}

// ————————————————————————————— The opponent —————————————————————————————
// A real rigged model (Meshy → see ASSETS.md), driven by an animation state machine.
// The GLB ships 9 clips; these are the ones the game actually drives.
export type DealerAction = 'idle' | 'think' | 'taunt' | 'angry' | 'win' | 'hit' | 'doze';

// He never leaves the chair. Read straight from the GLB, the standing clips put the
// hips at y≈1.0 and Chest_Pound_Taunt lunges 0.63 forward — which is exactly how he
// ended up standing on the table. Only the three seated clips are usable:
//   Chair_Sit_Idle_M  hips y=0.74  z=-0.34   (sits back)
//   Sitting_Clap      hips y=0.64  z=+0.13
//   Sit_and_Doze_Off  hips y=0.59  z=+0.07
const CLIP: Record<DealerAction, string> = {
  idle: 'Chair_Sit_Idle_M',
  think: 'Chair_Sit_Idle_M', // no seated "think" exists — stillness reads as unreadable anyway
  taunt: 'Sitting_Clap', // slow seated applause IS the taunt, and needs no legs
  angry: 'Chair_Sit_Idle_M', // stone-faced after a loss is more menacing than flailing
  win: 'Sitting_Clap',
  hit: 'Chair_Sit_Idle_M',
  doze: 'Sit_and_Doze_Off',
};

// Every clip was authored around its own imaginary chair, and they disagree on all
// three axes — read straight from the GLB's Hips channel (cm):
//   Chair_Sit_Idle_M  X=+27  Y=74  Z=-34   (sits off to one side, leaning back)
//   Sitting_Clap      X= +1  Y=64  Z=+13
//   Sit_and_Doze_Off  X= +1  Y=59  Z= +7
// Uncorrected he slides half a unit sideways and nearly a unit back when the clip
// changes — straight through the chair. Normalise every seat onto one spot.
const SEAT_REF = { x: 0.01, y: 0.74, z: 0.1 };
const SEAT_FIX: Record<string, [number, number, number]> = {
  Chair_Sit_Idle_M: [SEAT_REF.x - 0.27, SEAT_REF.y - 0.74, SEAT_REF.z - -0.34],
  Sitting_Clap: [SEAT_REF.x - 0.01, SEAT_REF.y - 0.64, SEAT_REF.z - 0.13],
  Sit_and_Doze_Off: [SEAT_REF.x - 0.01, SEAT_REF.y - 0.59, SEAT_REF.z - 0.07],
};

// One-shot reactions play once then fall back to idle; the rest loop.
const ONCE: DealerAction[] = ['taunt', 'win'];

// Where the two needles are actually going. Both solved, neither placed by eye.
//
// The dealer's ear is not a guess: the 414 vertices skinned to his Head bone were run
// through Chair_Sit_Idle_M's own skinning matrix, which puts his head at model-space
// X[0.162, 0.375] Y[1.231, 1.520] Z[-0.481, -0.142] while seated. His right ear is the
// -X face of that box, a little above centre. Everything below rides DEALER_POS and the
// seat correction, so moving him can't strand the machine again.
const SIT = SEAT_FIX.Chair_Sit_Idle_M;
const DEALER_EAR = [
  DEALER_POS[0] + DEALER_SCALE * (0.162 + SIT[0]),
  DEALER_POS[1] + DEALER_SCALE * (1.39 + SIT[1]),
  DEALER_POS[2] + DEALER_SCALE * (-0.311 + SIT[2]),
] as const;
// Yours is wherever the camera's head is; the eyes are CAM_BASE, so the ear is just
// beside and a touch below them.
const PLAYER_EAR = [CAM_BASE[0] + 0.12, CAM_BASE[1] - 0.04, CAM_BASE[2] + 0.02] as const;

// The second argument is only where the machine stands — the aim is derived from it.
// Standing it almost level with the ear in Z (rather than well behind it) is what keeps
// the needle looking flat: an approach angle of 23° meant the needle pointed partly at
// the camera, and perspective renders that as a steep diagonal across the screen no
// matter how level the needle actually is. 7° still shows the machine side-on.
const DEALER_DRILL = aimDrill(DEALER_EAR, [-1.15, DEALER_EAR[2] - 0.12], 0.7, 0.42);
const PLAYER_DRILL = aimDrill(PLAYER_EAR, [0.95, 2.2], 0.75, 0.42);

function OpponentFigure({ personality, isThinking, intensity, flare, eyeColorOverride, action = 'idle' }: {
  personality: Personality; isThinking: boolean; intensity: number; flare?: boolean;
  /** Forces the eye color (e.g. red when this figure has read the viewer's mind). */
  eyeColorOverride?: string | null;
  /** Which emotional beat to play. One-shots auto-return to idle. */
  action?: DealerAction;
}) {
  const { scene, animations } = useGLTF('/models/dealer.glb');
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);
  const rimLight = useRef<THREE.PointLight>(null);
  const eyeLight = useRef<THREE.PointLight>(null);
  const upLight = useRef<THREE.PointLight>(null);
  const finale = useContext(FinaleContext);
  const color = PERSONALITY_COLOR[personality];
  const eyeColor = eyeColorOverride ?? color;

  // Clone the rig so multiple mounts never fight over one skeleton, and pull the
  // generated material into the room's palette (it ships glossy and a touch light).
  const model = useMemo(() => {
    const root = SkeletonUtils.clone(scene);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned bounds go stale mid-animation
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = src.clone();
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.roughness = 0.95; // the export bakes in a sheen we don't want
      mat.metalness = 0.05;
      mat.emissive.set('#0a0a12');
      mat.emissiveIntensity = 0.3;
    });
    return root;
  }, [scene]);

  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of animations) map.set(clip.name, mixer.clipAction(clip, model));
    return map;
  }, [animations, mixer, model]);

  // The head bone drives the eye glow — parenting to it means the eyes track every nod.
  const headBone = useMemo(() => model.getObjectByName('Head') ?? null, [model]);

  // Tracked by CLIP NAME, not by action: seven actions share three clips, so two
  // different actions in a row are usually the same animation.
  const currentClip = useRef<string | null>(null);
  const seatRig = useRef<THREE.Group>(null);
  const seatTarget = useRef(new THREE.Vector3());
  useEffect(() => {
    const name = CLIP[action];
    const next = actions.get(name);
    if (!next) return;
    seatTarget.current.fromArray(SEAT_FIX[name] ?? [0, 0, 0]);

    // Same clip as we're already playing (idle→think, angry→idle, taunt→win …): leave
    // it running. Restarting it would fade the only live action in from weight 0, and
    // with nothing else weighted the mixer falls back to the bind pose — which is him
    // standing in an A-pose. That flash is the "站起来一瞬间", and it fired every round.
    if (currentClip.current === name) {
      // A one-shot re-triggered on its own clip still needs to replay from the top,
      // but reset() keeps the current weight, so there's no gap.
      if (ONCE.includes(action)) {
        next.reset().setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
        next.setEffectiveWeight(1).play();
      }
      return;
    }

    const prev = currentClip.current ? actions.get(currentClip.current) : null;
    currentClip.current = name;

    next.reset();
    if (ONCE.includes(action)) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    // The very first clip snaps on at full weight: fading in from the bind pose means
    // 0.35s of him standing in an A-pose before he sits down.
    if (prev) {
      next.fadeIn(0.35).play();
      prev.fadeOut(0.35);
    } else {
      next.setEffectiveWeight(1).play();
      seatRig.current?.position.fromArray(SEAT_FIX[name] ?? [0, 0, 0]);
    }
  }, [action, actions]);

  // A one-shot that has run its course hands the stage back to idle.
  useEffect(() => {
    const onFinish = (e: { action: THREE.AnimationAction }) => {
      const idle = actions.get(CLIP.idle);
      if (!idle || idle === e.action) return;
      e.action.fadeOut(0.4);
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.4).play();
      currentClip.current = CLIP.idle;
      seatTarget.current.fromArray(SEAT_FIX[CLIP.idle] ?? [0, 0, 0]);
    };
    mixer.addEventListener('finished', onFinish as never);
    return () => mixer.removeEventListener('finished', onFinish as never);
  }, [mixer, actions]);

  // Stopping every action silently invalidates the currentClip guard above, so the two
  // have to be cleared together. Miss this and StrictMode's mount→unmount→mount is
  // fatal: the cleanup stops the clip, the remounted effect sees a ref that survived
  // (refs aren't reset on a simulated unmount), takes the "already playing" early
  // return, and plays nothing at all. A mixer with no weighted action falls back to the
  // bind pose — which is exactly the A-pose he was standing in at the start of a match.
  useEffect(() => () => {
    mixer.stopAllAction();
    currentClip.current = null;
  }, [mixer]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // ——— Finale: the dealer's death, or his moment of triumph ———
    // regicide = his drill fired; drained = he's been bled dry. Same physical grammar
    // (jerk → eyes gutter out → collapse back into the throne), different pacing.
    const f = finale.current;
    const tReg = finaleElapsed(f, t, 'regicide');
    const tDrn = finaleElapsed(f, t, 'drained');
    const tDes = finaleElapsed(f, t, 'deserted');
    // `jerk` must land when the needle actually arrives, not when the motor starts:
    // his drill fires at KILL_AT=1.0 and the plunge takes ~0.35s to close the standoff.
    const death = tReg >= 0
      ? { t: tReg, jerk: 1.35, eyesOut: 2.3, slumpEnd: 3.8 }
      : tDrn >= 0
        ? { t: tDrn, jerk: 0.8, eyesOut: 1.8, slumpEnd: 3.2 }
        : null;
    const struck = !!death && death.t > death.jerk;

    // Freeze the pose at the moment of impact — a dead man doesn't keep idling.
    mixer.update(struck ? 0 : delta);
    // Glide the seat correction so the crossfade doesn't teleport him.
    if (seatRig.current) {
      seatRig.current.position.lerp(seatTarget.current, 1 - Math.exp(-delta * 5));
      if (death && struck) {
        // Head-snap on impact, then the collapse BACKWARD into the throne.
        //
        // Direction matters and the signs are counterintuitive: he faces +Z (the camera),
        // and a +X rotation carries +Y toward +Z — so a positive rotation.x tips his head
        // at the player. Falling toward the person who just killed you is lunging, not
        // dying. Negative X (head back over the throne) plus negative Z (sinking into the
        // seat, away from the table) is a body giving out where it sits.
        const snap = Math.min((death.t - death.jerk) * 6, 1);
        const slump = death.t < death.eyesOut ? 0 : Math.min((death.t - death.eyesOut) / (death.slumpEnd - death.eyesOut), 1);
        const s = slump * slump * (3 - 2 * slump); // smoothstep — bodies don't move linearly
        seatRig.current.rotation.z = snap * 0.14;
        seatRig.current.rotation.x = -s * 0.46;
        seatRig.current.position.y += -s * 0.13;
        seatRig.current.position.z += -s * 0.16;
      } else if (!death) {
        seatRig.current.rotation.x = 0;
        seatRig.current.rotation.z = 0;
      }
    }

    let pulse = flare
      ? 1.15 + Math.sin(t * 7) * 0.35
      : isThinking
        ? 0.7 + Math.sin(t * 5) * 0.5
        : 0.55 + intensity * 0.4;
    if (death && struck) {
      // Gutter, then out. Random flicker reads as a dying filament.
      pulse = death.t < death.eyesOut ? (Math.random() < 0.45 ? 1.6 : 0.12) : 0;
    } else if (tDes >= 0.5) {
      // Deserted: a nervous stutter before the figure vanishes.
      pulse = Math.random() < 0.55 ? 0.15 : 1.3;
    }
    const m1 = eyeL.current?.material as THREE.MeshStandardMaterial | undefined;
    const m2 = eyeR.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m1) m1.emissiveIntensity = pulse * 4.5;
    if (m2) m2.emissiveIntensity = pulse * 4.5;
    if (eyeLight.current) eyeLight.current.intensity = pulse <= 0 ? 0 : isThinking ? 1.4 : 0.7;
    const deadness = death && death.t > death.eyesOut ? Math.min((death.t - death.eyesOut) / 1.0, 1) : 0;
    if (rimLight.current) rimLight.current.intensity = (3.2 + intensity * 2.4 + (isThinking ? Math.sin(t * 5) * 0.5 : 0)) * (1 - deadness);
    if (upLight.current) upLight.current.intensity = 1.8 * (1 - deadness);
  });

  // The eyes live inside the hood's void, riding the head bone.
  const eyes = (
    <>
      <mesh ref={eyeL} position={[-0.045, 0.02, 0.11]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <mesh ref={eyeR} position={[0.045, 0.02, 0.11]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <pointLight ref={eyeLight} color={eyeColor} intensity={isThinking ? 1.4 : 0.7} decay={0} distance={1.6} position={[0, 0.02, 0.16]} />
    </>
  );

  // No Y rotation: Meshy rigs characters facing +Z, and the camera sits at +Z looking
  // back — so he already faces the player. Rotating him PI turned his back to us.
  return (
    <group position={DEALER_POS} scale={DEALER_SCALE}>
      <group ref={seatRig}>
        <primitive object={model} />
      </group>
      {headBone ? createPortal(eyes, headBone) : null}
      {/* Warm uplight off the table — pulls the robe front out of the dark */}
      <pointLight ref={upLight} position={[0, 0.9, 0.8]} color="#d4a838" intensity={1.8} distance={2.6} decay={1.6} />
      {/* Rim / backlight in personality color — carries the silhouette since the face won't */}
      <pointLight ref={rimLight} position={[0, 1.2, -0.5]} color={color} intensity={3.2} decay={0} />
    </group>
  );
}
useGLTF.preload('/models/dealer.glb');


// Drifting dust/ash motes — a single Points draw call.
function DustMotes({ count = 55 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const velocitiesRef = useRef<Float32Array>(new Float32Array(count));

  const [positions, texture] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2.2;
      pos[i * 3 + 1] = Math.random() * 4;
      pos[i * 3 + 2] = -1 + Math.random() * 2.5;
      velocitiesRef.current[i] = 0.04 + Math.random() * 0.07;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,240,210,0.9)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    return [pos, tex];
  }, [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = posAttr.getY(i) + velocitiesRef.current[i] * delta;
      let x = posAttr.getX(i);
      if (y > 4) y = 0;
      x += Math.sin((y + i) * 1.4) * 0.001;
      posAttr.setY(i, y);
      posAttr.setX(i, x);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} position={[0.3, 0, 0.6]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={texture} size={0.05} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

// Distant Art Deco columns — static geometry, no per-frame cost.
//
// The model is a real column: base (y -0.95..-0.69), fluted shaft at a constant radius
// 0.223, capital flaring to 0.307. Scaled uniformly to span floor→ceiling (7.0 units),
// which lands the shaft at 0.89m across and the base at 1.1m — monumental, but that's
// what a 7-unit ceiling asks for.
const COLUMN_SCALE = (CEILING_Y - FLOOR_Y) / 1.9;
const COLUMN_Y = FLOOR_Y + 0.951 * COLUMN_SCALE; // model bbox is y ∈ [-0.951, 0.951]
// The old procedural layout had columns 1.2 apart, which was fine for 0.9-wide boxes but
// would interpenetrate at this base diameter (2.05). Spaced to clear it, and kept off
// the dealer: at x=±3.2 the nearest shaft face is 2.4 away from him.
const COLUMN_LAYOUT: [number, number][] = [
  [-3.2, -5.4],
  [3.2, -5.4],
  [-6.0, -5.4],
  [6.0, -5.4],
];
const tuneColumn = (m: THREE.MeshStandardMaterial) => {
  m.roughness = 0.85;
  m.metalness = 0.05;
  // Sunk right back into the dark so they read as depth, not as objects.
  m.emissive.set('#141420');
  m.emissiveIntensity = 0.5;
};

function DistantColumns() {
  const model = useProp('/models/column.glb', tuneColumn);
  return (
    <group>
      {COLUMN_LAYOUT.map(([x, z], i) => (
        <primitive
          key={i}
          object={i === 0 ? model : model.clone(true)}
          position={[x, COLUMN_Y, z]}
          scale={COLUMN_SCALE}
          // A colonnade of identical columns reads as a copy-paste. The flutes are
          // radial, so spinning each one is free variety.
          rotation={[0, i * 0.7, 0]}
        />
      ))}
    </group>
  );
}
useGLTF.preload('/models/column.glb');

// ————————————————————————————— Table props —————————————————————————————
// The den's inhabitants left things on the table. None of these do anything — they're
// here so the table looks lived-in rather than staged.
//
// Every one of these is sized from what the object actually IS, because a Meshy export's
// own dimensions are meaningless: they all come back normalised into a ~1.9 box. The
// scene runs at 1m ≈ 1.85 units (the 1.8m dealer is 3.33 tall), so a 14cm ashtray is
// 0.26 units and the scale factor is 0.26 / (that model's 1.899 width).
//
// Y is never typed in — it's derived from each model's own bbox floor, so the prop rests
// exactly on the felt instead of hovering over it or sinking into it.
const M = 1.85; // units per metre

type PropDef = {
  url: string;
  scale: number;
  /** The model's own bbox minimum on Y, measured off the GLB. */
  minY: number;
  /** Where it sits on the felt, in XZ. */
  at: [number, number];
  spin: number;
  tune: (m: THREE.MeshStandardMaterial) => void;
  /** Optional local-space point where smoke should be born. */
  smokeTip?: [number, number, number];
  /**
   * Two upright incense sticks, drawn procedurally rather than modelled.
   *
   * Meshy's censer shipped its sticks as a detached lump floating off in one corner
   * (Y ∈ [0.46, 0.93], 342 verts at X[0.34,0.48] Z[0.36,0.46], with six empty slices
   * between it and the bowl). That got cropped in scripts/fix-eastern-props.mjs. Two
   * cylinders cost nothing, sit where they actually belong, and hand us an exact ember
   * position for the smoke to rise from.
   *
   * `baseY` is model-space (the ash bed); `height` is in world units above it.
   */
  sticks?: { baseY: number; height: number };
};

// Prop sets, keyed by shop item. Each set reuses the same three anchor points on the
// felt — they were cleared once against the chip piles, the pot and the dealer's hands
// (0.46 to the nearest, 2.38 from the table's 2.55 rim), so a new set inherits that
// clearance instead of needing its own audit.
const PROP_ANCHORS = {
  left: [-1.9, -1.05] as [number, number],
  right: [1.9, -1.0] as [number, number],
  far: [-1.3, -1.95] as [number, number],
};

const VICE_PROPS: PropDef[] = [
  {
    // Cigar in an ashtray. Was 14cm across — genuinely too small; a real ashtray is
    // 20–30cm. This is now 30cm, so the cigar itself is a believable ~14cm long.
    // The tip location was solved off the raw GLB: heightmap-binned along X/Z shows a
    // diagonal ridge of "high" verts running top-left to bottom-right (the cigar), and
    // the 3cm-tall peak at model-space (-0.75, 0.336, -0.67) is the burning end lifted
    // onto the ashtray's rim. Smoke rises from exactly there.
    url: '/models/cigar.glb',
    scale: (0.3 * M) / 1.899,
    minY: -0.34,
    at: PROP_ANCHORS.left,
    spin: 0.6,
    tune: (m) => { m.roughness = 0.7; m.metalness = 0.15; },
    smokeTip: [-0.75, 0.336, -0.67],
  },
  {
    // Decanter + glass. The X profile has a hole at x ∈ [-0.09, 0.26] — they're two
    // separate objects side by side, so the model's 1.899 width is the PAIR, and it's
    // the 25cm decanter that sets the scale off the 1.804 height.
    url: '/models/whiskey.glb',
    scale: (0.25 * M) / 1.804,
    minY: -0.903,
    at: PROP_ANCHORS.right,
    spin: -0.5,
    tune: (m) => { m.roughness = 0.12; m.metalness = 0.3; }, // crystal, not frosted glass
  },
  {
    // Banded cash, a 30cm pile.
    url: '/models/cash.glb',
    scale: (0.3 * M) / 1.899,
    minY: -0.482,
    at: PROP_ANCHORS.far,
    spin: 0.35,
    tune: (m) => { m.roughness = 0.9; m.metalness = 0.0; },
  },
];

// 抵押物 — what people put up to keep playing. Placed by solving for clearance rather
// than reusing the vice set's anchors: these are 16–20cm personal effects, not a 30cm
// ashtray, and the solver was constrained to the far half because anything at +z sits
// between the camera and the felt, behind the card fan.
// Verified: ≥0.55 from the nearest busy zone (played cards, chip piles, pot, dealer's
// hands), ≥0.40 inside the 2.55 rim, ≥0.65 between pieces.
const COLLATERAL_PROPS: PropDef[] = [
  {
    // 20cm pewter dish; the model is a flat tray so it barely rises off the felt
    url: '/models/prop_ring.glb',
    scale: (0.20 * M) / 1.91,
    minY: -0.288,
    at: [-1.55, -0.86],
    spin: 0.4,
    tune: (m) => { m.roughness = 0.42; m.metalness = 0.65; },
  },
  {
    // 16cm across, but 22cm tall once the brass spike is counted
    url: '/models/prop_ticket.glb',
    scale: (0.16 * M) / 1.41,
    minY: -0.953,
    at: [-1.14, -1.76],
    spin: -0.55,
    tune: (m) => { m.roughness = 0.9; m.metalness = 0.05; },
  },
  {
    url: '/models/prop_teeth.glb',
    scale: (0.16 * M) / 1.69,
    minY: -0.953,
    at: [1.92, -0.85],
    spin: -0.35,
    tune: (m) => { m.roughness = 0.6; m.metalness = 0.3; },
  },
];

// 东方局 — the same vices, different implements. Sizes and minY were measured off the
// GLBs after scripts/fix-eastern-props.mjs corrected them; the three positions are the
// collateral set's, reused deliberately (these are 16–22cm pieces, same class as the
// 16–20cm effects that audit was run against, so the clearances carry over).
const EASTERN_PROPS: PropDef[] = [
  {
    // Yixing teapot, cup and tray. 22cm is the TRAY — the pot alone is ~14cm, but the
    // model's 1.906 span is the whole arrangement, so the tray is what sets the scale.
    url: '/models/prop_teapot.glb',
    scale: (0.22 * M) / 1.906,
    minY: -0.566,
    at: [-1.55, -0.86],
    spin: 0.5,
    tune: (m) => { m.roughness = 0.88; m.metalness = 0.05; }, // unglazed clay: matte, stony
  },
  {
    // Coiled string of coins. Arrived standing upright like a signboard (Z was its
    // thinnest axis at ±0.20 while Y ran ±0.95); laid flat offline, so its long axis is
    // now Z at 1.906.
    url: '/models/prop_coins.glb',
    scale: (0.18 * M) / 1.906,
    minY: -0.202,
    at: [1.92, -0.85],
    spin: -0.4,
    tune: (m) => { m.roughness = 0.55; m.metalness = 0.7; }, // patinated bronze
  },
  {
    // Bronze censer, 16cm across the loop handles. Squat after the crop (0.744 tall),
    // which is right — it's a bowl, and the sticks are ours.
    url: '/models/prop_incense.glb',
    scale: (0.16 * M) / 1.906,
    minY: -0.926,
    at: [-1.14, -1.76],
    spin: 0.3,
    tune: (m) => { m.roughness = 0.5; m.metalness = 0.75; },
    sticks: { baseY: -0.30, height: 0.26 }, // ash bed → ~14cm of stick above it
  },
];

const PROP_SETS: Record<string, PropDef[]> = {
  'props.vice': VICE_PROPS,
  'props.collateral': COLLATERAL_PROPS,
  'props.eastern': EASTERN_PROPS,
};

function TableProp({ url, scale, minY, at, spin, tune, smokeTip, sticks }: PropDef) {
  const model = useProp(url, tune);
  // The prop stands at (at.x, table_surface + how far minY dips below the origin, at.z),
  // spun by `spin` about Y. Compute the smoke source in world space so the smoke plume
  // itself lives at world scale — otherwise a 0.15-scale prop would shrink the plume
  // to the size of a match head.
  const c = Math.cos(spin), s = Math.sin(spin);
  // The ash bed sits on the prop's own axis, so `spin` doesn't move it in XZ.
  const ashY = sticks ? TABLE_SURFACE_Y + scale * (sticks.baseY - minY) : 0;
  const tipWorld = sticks
    // Smoke comes off the embers, which are ours and not in model space at all.
    ? [at[0], ashY + sticks.height, at[1]] as [number, number, number]
    : smokeTip ? [
        at[0] + scale * (c * smokeTip[0] + s * smokeTip[2]),
        TABLE_SURFACE_Y + scale * (smokeTip[1] - minY),
        at[1] + scale * (-s * smokeTip[0] + c * smokeTip[2]),
      ] as [number, number, number] : null;
  return (
    <>
      <primitive
        object={model}
        position={[at[0], TABLE_SURFACE_Y - minY * scale, at[1]]}
        scale={scale}
        rotation={[0, spin, 0]}
      />
      {sticks && (
        <group position={[at[0], ashY, at[1]]}>
          {[-1, 1].map((side) => (
            // Leaned apart a couple of degrees each way — two perfectly parallel sticks
            // read as a machined object rather than something a hand pushed into ash.
            <group key={side} position={[side * 0.017, 0, side * 0.011]} rotation={[side * 0.06, 0, side * -0.09]}>
              <mesh position={[0, sticks.height / 2, 0]} castShadow>
                <cylinderGeometry args={[0.0035, 0.0035, sticks.height, 5]} />
                <meshStandardMaterial color="#4a3524" roughness={0.95} metalness={0} />
              </mesh>
              {/* The ember. toneMapped off so it stays a hot point in a very dark room. */}
              <mesh position={[0, sticks.height, 0]}>
                <sphereGeometry args={[0.0075, 8, 6]} />
                <meshStandardMaterial color="#ff7a2a" emissive="#ff4400" emissiveIntensity={4} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {tipWorld && <Smoke at={tipWorld} />}
    </>
  );
}
for (const set of Object.values(PROP_SETS)) for (const p of set) useGLTF.preload(p.url);

// A slow cigar plume. Rises, drifts, expands, fades. Kept lightweight: 14 sphere
// billboards animated in a single useFrame, no shaders, no particle system.
//
// Non-additive on purpose — additive smoke reads as fire or magic. Real smoke is a
// grey diffuser: it OCCLUDES what's behind it, doesn't add to it. depthWrite off so
// the puffs blend into each other instead of clipping through in Z-fighting bands.
function Smoke({ at }: { at: [number, number, number] }) {
  const N = 14;
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({
    // Stagger phases so puffs are always in flight at different ages, not pulsing.
    phase: i / N + (Math.random() - 0.5) * 0.05,
    swayX: (Math.random() - 0.5) * 0.35,
    swayZ: (Math.random() - 0.5) * 0.35,
    spin: Math.random() * Math.PI * 2,
  })), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < N; i++) {
      const m = refs.current[i];
      if (!m) continue;
      // life ∈ [0, 1) — one full cycle per ~4s, per particle.
      const life = ((t * 0.25 + seeds[i].phase) % 1);
      const wobble = 0.03 * Math.sin(t * 0.9 + i * 1.7);
      m.position.set(
        at[0] + seeds[i].swayX * life + wobble,
        at[1] + 0.05 + life * 0.55,
        at[2] + seeds[i].swayZ * life + wobble * 0.7,
      );
      // Grow from a tight ember-sized puff into a 12cm-ish cloud.
      m.scale.setScalar(0.02 + life * 0.14);
      m.rotation.z = seeds[i].spin + life * 1.2;
      const mat = m.material as THREE.MeshBasicMaterial;
      // Fade in over first 15% (born from ember), fade out over remaining 85%.
      const a = life < 0.15 ? life / 0.15 : (1 - life) / 0.85;
      mat.opacity = a * 0.42;
    }
  });

  return (
    <group>
      {Array.from({ length: N }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          renderOrder={5} // draw after opaque geometry so alpha sorts against the room
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial
            color="#c8bcae"
            transparent
            depthWrite={false}
            fog
          />
        </mesh>
      ))}
      {/* A dim ember at the tip — a cigar without a glowing coal reads as a stick */}
      <mesh position={at}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshBasicMaterial color="#ff6820" toneMapped={false} />
      </mesh>
      <pointLight color="#ff5010" intensity={0.35} distance={0.35} decay={2} position={at} />
    </group>
  );
}

// ————————————————————————————— Ceiling & volumetric light —————————————————————————————

// Coffered ceiling with gold trim — the room finally has a top instead of a void.
function Ceiling() {
  return (
    <group position={[0, 7.4, -0.9]}>
      {/* Main slab, facing down */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[17, 48]} />
        <meshStandardMaterial color="#14121c" roughness={0.9} metalness={0.05} emissive="#0c0a12" emissiveIntensity={0.5} />
      </mesh>
      {/* Concentric gold trim rings */}
      {[2.6, 5.4, 8.4].map((r) => (
        <mesh key={r} position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.045, 8, 72]} />
          <meshStandardMaterial color="#5a451a" metalness={0.85} roughness={0.4} emissive="#2c2008" emissiveIntensity={0.5} />
        </mesh>
      ))}
      {/* Radial coffer beams */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 5.5, -0.05, Math.sin(a) * 5.5]} rotation={[0, -a, 0]}>
            <boxGeometry args={[5.8, 0.12, 0.18]} />
            <meshStandardMaterial color="#1a1826" roughness={0.85} metalness={0.1} emissive="#100e18" emissiveIntensity={0.5} />
          </mesh>
        );
      })}
      {/* Center rose above the chandelier rod */}
      <mesh position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.06, 8, 32]} />
        <meshStandardMaterial color="#6a521c" metalness={0.9} roughness={0.35} emissive="#3a2c10" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// A soft additive light cone — the dust motes finally have something to swim in.
function useBeamTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    // Canvas y=0 maps to the cylinder's TOP (v=1): bright at the source, fading to the floor.
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(c);
  }, []);
}

function VolumetricBeam({ position, radiusTop, radiusBottom, height, color, opacity }: {
  position: [number, number, number];
  radiusTop: number;
  radiusBottom: number;
  height: number;
  color: string;
  opacity: number;
}) {
  const tex = useBeamTexture();
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const finale = useContext(FinaleContext);
  useFrame(({ clock }) => {
    const f = finale.current;
    if (!f.kind || !mat.current) return;
    // Additive cones are self-lit — in a blackout they'd hang there like ghosts.
    const t = finaleElapsed(f, clock.getElapsedTime());
    if (f.kind === 'execution') mat.current.opacity = opacity * (1 - Math.min(Math.max((t - 0.3) / 1.0, 0), 1));
    else if (f.kind === 'broke') mat.current.opacity = t > 2.2 ? 0 : opacity;
  });
  return (
    <mesh position={position}>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, 24, 1, true]} />
      <meshBasicMaterial
        ref={mat}
        map={tex}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}


// The dealer's throne. Sits behind him; the table hides everything below the seat.
const tuneSeat = (m: THREE.MeshStandardMaterial) => {
  m.roughness = 0.85;
  m.metalness = 0.15;
  m.emissive.set('#0a0a12');
  m.emissiveIntensity = 0.3;
};

// Solved against the real animation data rather than guessed: Chair_Sit_Idle_M puts his
// hips at model y=0.74, z=-0.34 — world y=0.82, z=-3.08, comfortably beyond the table's
// far edge (-2.85). Both thrones are fitted to the same total height so a swap can't
// change where he appears to be sitting; feet land on the floor either way.
const THRONE_HEIGHT = 3.61;

function Chair({ url }: { url: string }) {
  const model = useProp(url, tuneSeat);
  const hipZ = DEALER_POS[2] - 0.34 * DEALER_SCALE;
  const fit = useFit(model, { height: THRONE_HEIGHT, bottomY: FLOOR_Y });
  return (
    <group position={[DEALER_POS[0], 0, hipZ]}>
      <primitive object={model} position={fit.position} scale={fit.scale} />
    </group>
  );
}
useGLTF.preload('/models/chair.glb');
useGLTF.preload('/models/throne_bone.glb');

const SEAT_MODEL: Record<string, string> = {
  'seat.throne': '/models/chair.glb',
  'seat.bone': '/models/throne_bone.glb',
};

// ————————————————————————————— Scene —————————————————————————————

interface SceneProps {
  personality: Personality;
  isThinking: boolean;
  intensity: number;
  opponentCard?: CardType | null;
  opponentFaceDown?: boolean;
  playerCard?: CardType | null;
  roundKey: string | number;
  hand: CardType[];
  selectedIndex: number | null;
  canSelect: boolean;
  onSelectCard: (card: CardType, index: number) => void;
  playerChips: number;
  opponentChips: number;
  pot: number;
  revealCeremony: boolean;
  playerGlow: 'gold' | 'blood' | null;
  opponentGlow: 'gold' | 'blood' | null;
  quality: Quality;
  playerSetsWon: number;
  opponentSetsWon: number;
  hintCard: CardType | null;
  showOpponent: boolean;
  opponentEyeColor: string | null;
  dealerAction: DealerAction;
  finale: FinaleKind | null;
  viewMode: ViewMode;
  look: Loadout;
  onMenuPick: ((id: MenuCardId) => void) | null;
  menuTutorialDone: boolean;
}

function Scene({
  personality, isThinking, intensity, opponentCard, opponentFaceDown, playerCard, roundKey,
  hand, selectedIndex, canSelect, onSelectCard,
  playerChips, opponentChips, pot, revealCeremony, playerGlow, opponentGlow, quality,
  playerSetsWon, opponentSetsWon, hintCard, showOpponent, opponentEyeColor, dealerAction, finale, viewMode,
  look, onMenuPick, menuTutorialDone,
}: SceneProps) {
  const preset = QUALITY_PRESETS[quality];
  const drowned = look.room === 'room.drowned';
  const spot = useRef<THREE.SpotLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const shakeRef = useRef(0);
  const finaleRef = useRef<FinaleState>({ kind: null, start: null });
  // 不战而胜: after the eye-stutter, the seat is simply empty.
  const [desertedGone, setDesertedGone] = useState(false);
  useEffect(() => {
    if (finale !== 'deserted') { setDesertedGone(false); return; }
    const t = setTimeout(() => setDesertedGone(true), 1200);
    return () => clearTimeout(t);
  }, [finale]);
  useMemo(() => {
    if (spot.current) spot.current.target.position.set(...SPOT_TARGET);
  }, []);

  // Both played cards land near mid-table so they clear the hand fan and read side by side.
  const opponentTarget: [number, number, number] = [-0.5, TABLE_SURFACE_Y + 0.011, -0.85];
  const opponentFrom: [number, number, number] = [-0.4, 0.35, -1.35];
  const playerTarget: [number, number, number] = [0.5, TABLE_SURFACE_Y + 0.011, -0.45];
  // Played card launches from where the fan sits in front of the camera.
  const playerFrom: [number, number, number] = [0.15, 1.75, 2.3];

  return (
    <FinaleContext.Provider value={finaleRef}>
      {/* Provided in here, not around the Canvas: R3F runs its own React root, so an outer
          provider never reaches the cards. Same reason FinaleContext lives at this level. */}
      <CardBackContext.Provider value={(look.cardBack as CardBackId) ?? 'cardBack.house'}>
      {/* Stamps the shared clock origin — must sit before every finale consumer */}
      <FinaleDirector kind={finale} ctx={finaleRef} />
      {/* Midnight-blue base with warm gold accents — palette from the Dark Deco refs */}
      <color attach="background" args={['#070a16']} />
      <fog attach="fog" args={['#070a16', 5.5, 16]} />
      <ambientLight ref={ambient} intensity={0.62} color="#4a3a22" />
      <CeremonyLights active={revealCeremony} spotRef={spot} ambientRef={ambient} />
      <FinaleLights spotRef={spot} ambientRef={ambient} hemiRef={hemi} />
      <hemisphereLight ref={hemi} args={['#3a4570', '#140a10', 0.55]} />
      <spotLight
        ref={spot}
        position={SPOT_POS}
        angle={0.58}
        penumbra={0.5}
        intensity={12}
        decay={0}
        color="#f0e4c0"
        castShadow={preset.shadows}
        shadow-mapSize={[preset.shadowMap, preset.shadowMap]}
        shadow-bias={-0.0002}
        // Native PCF blur — drei's SoftShadows (PCSS) patches a shader chunk that
        // three r185 no longer has (unpackRGBAToDepth), which breaks every material.
        shadow-radius={preset.shadowBlur}
      />

      {/* Image-based lighting — gives the metals and clearcoat something to reflect.
          Built from Lightformers, no external HDR fetch (works offline / domestic hosting). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="ring" intensity={5} color="#f0d8a0" scale={4} position={[0.5, 5, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.2} color="#aa2211" scale={[6, 2, 1]} position={[0, 1.2, -6]} />
        <Lightformer form="rect" intensity={0.6} color="#2a3a6a" scale={[8, 2, 1]} position={[0, 1, 6]} rotation-y={Math.PI} />
        {/* Window glow from the sides */}
        <Lightformer form="rect" intensity={0.5} color="#1a2a5e" scale={[2, 4, 1]} position={[-7, 2, -1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#1a2a5e" scale={[2, 4, 1]} position={[7, 2, -1]} rotation-y={-Math.PI / 2} />
      </Environment>

      <DustMotes count={preset.dust} />

      {/* The shell. Tilted as one piece for the wreck — the table, the cards and the
          waterline all stay level, and that mismatch is the entire effect. Everything the
          player interacts with keeps its original coordinates, so none of the placement
          maths downstream has to know this room exists. */}
      <group rotation={drowned ? [0, 0, WRECK_TILT] : [0, 0, 0]}>
        <Room sconceLights={quality !== 'low'} decoSconce={look.room === 'room.deco'} />
        <Ceiling />
        {/* Cosmetics. Each slot picks its cast; the shabby defaults are procedural so a new
            account still gets a coherent room without any of the bought art. */}
        {look.room === 'room.deco' && (
          <>
            <CeilingRose />
            <DistantColumns />
            <Drapes />
            <RoyalBanner x={-1.95} />
            <RoyalBanner x={1.95} />
          </>
        )}
        {drowned && <DistantColumns />}
        <Railing />
        {/* Two reflectors would mean rendering the whole scene three times a frame, and
            the floor is under the water here anyway — nobody can see it. */}
        <Floor reflective={preset.reflectiveFloor && !drowned} />
        <Carpet />
      </group>

      {drowned && (
        <>
          <FloodWater reflective={preset.reflectiveFloor} />
          <Flotsam />
          {quality !== 'low' && <Caustics />}
          {/* Bounce off the surface — a cold uplight nothing else in the room provides. */}
          <pointLight position={[0, WATER_Y + 0.3, -1]} color="#2e6f78" intensity={2.2} distance={9} decay={2} />
        </>
      )}

      {/* Light cones: one under the chandelier, one broad wash over the table */}
      {/* Hangs off the chandelier, so its top tracks CHANDELIER_Y down to the table */}
      <VolumetricBeam position={[0, (CHANDELIER_Y + TABLE_SURFACE_Y) / 2, -0.9]} radiusTop={0.9} radiusBottom={2.1} height={CHANDELIER_Y - TABLE_SURFACE_Y} color="#f0d8a0" opacity={0.05} />
      <VolumetricBeam position={[0, 1.9, -0.3]} radiusTop={1.1} radiusBottom={2.7} height={3.6} color="#e8d0a0" opacity={0.03} />
      {LIGHT_MODEL[look.light]
        ? <Chandelier url={LIGHT_MODEL[look.light].url} accent={LIGHT_MODEL[look.light].accent} />
        : <BareBulb />}

      {/* The pile drivers. Each set lost advances a needle one notch toward an ear;
          both transforms come out of aimDrill, so neither can drift off target. */}
      <EarDrill
        {...PLAYER_DRILL}
        progress={opponentSetsWon}
        matchPoint={opponentSetsWon >= 3}
        audible
        role="player"
      />
      <EarDrill
        {...DEALER_DRILL}
        progress={playerSetsWon}
        matchPoint={playerSetsWon >= 3}
        role="dealer"
      />
      <Table variant={look.table} />
      {PROP_SETS[look.props]
        ? PROP_SETS[look.props].map((p) => <TableProp key={p.url} {...p} />)
        : <TinAshtray />}
      {showOpponent && (SEAT_MODEL[look.seat]
        ? <Chair url={SEAT_MODEL[look.seat]} />
        : <PlainChair />)}
      {showOpponent && !desertedGone && (
        <OpponentFigure
          personality={personality}
          isThinking={isThinking}
          intensity={intensity}
          flare={revealCeremony}
          eyeColorOverride={opponentEyeColor}
          action={dealerAction}
        />
      )}

      {/* The table economy — banks, pot, and coins in flight between them */}
      <ChipEconomy playerChips={playerChips} opponentChips={opponentChips} pot={pot} surfaceY={TABLE_SURFACE_Y} />

      {/* First-person viewmodel: card fan + the player's own hands */}
      <FirstPersonRig shakeRef={shakeRef} viewMode={viewMode}>
        {hand.length > 0 && (
          <>
            <HandFan cards={hand} selectedIndex={selectedIndex} canSelect={canSelect} hintCard={hintCard} onSelect={onSelectCard} />
            <GloveHand position={[-0.21, -0.4, -0.73]} />
            <GloveHand position={[0.21, -0.39, -0.71]} mirror />
            {/* Soft key light for the viewmodel — the room spot barely reaches here */}
            <pointLight position={[0, 0.15, -0.35]} intensity={1.1} distance={2} decay={2} color="#e8d8b0" />
          </>
        )}
        {/* The hub menu rides the same rig as a real hand, so it sits in front of the
            viewer at whatever angle the lobby camera is at. */}
        {onMenuPick && (
          <>
            <MenuFan tutorialDone={menuTutorialDone} onPick={onMenuPick} />
            <pointLight position={[0, 0.1, -0.4]} intensity={1.3} distance={2.2} decay={2} color="#e8d8b0" />
          </>
        )}
      </FirstPersonRig>

      {opponentCard && (
        <PlayedCard
          key={roundKey + '-opp'}
          type={opponentCard}
          faceDown={!!opponentFaceDown}
          target={opponentTarget}
          from={opponentFrom}
          tilt={-0.05}
          ceremony={revealCeremony}
          resultGlow={opponentGlow}
          onSlam={() => { shakeRef.current = 1; audio.sfx('cardSlam'); }}
        />
      )}
      {playerCard && (
        <PlayedCard
          key={roundKey + '-ply'}
          type={playerCard}
          faceDown={false}
          target={playerTarget}
          from={playerFrom}
          tilt={0.06}
          resultGlow={playerGlow}
        />
      )}

      {/* Post — bloom turns emissives (eyes, gold inlay, candle flames) into actual glow;
          ACES filmic tone mapping restores highlight rolloff lost with NoToneMapping.
          On low quality the whole chain is skipped (the renderer tone-maps instead). */}
      {preset.post && (
        <EffectComposer multisampling={preset.msaa}>
          {preset.ao ? <N8AO aoRadius={0.8} intensity={2.6} distanceFalloff={0.6} quality="performance" /> : <></>}
          <Bloom mipmapBlur intensity={0.7} luminanceThreshold={1} luminanceSmoothing={0.3} />
          {/* Film grain only — barely-there. Depth of field was removed: at this fixed
              seated framing it blurred the whole table without buying any drama. */}
          {preset.grain ? <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} /> : <></>}
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
      </CardBackContext.Provider>
    </FinaleContext.Provider>
  );
}

interface TableSceneProps {
  personality: Personality;
  isThinking?: boolean;
  intensity?: number;
  opponentCard?: CardType | null;
  opponentFaceDown?: boolean;
  playerCard?: CardType | null;
  roundKey?: string | number;
  hand?: CardType[];
  selectedIndex?: number | null;
  canSelect?: boolean;
  onSelectCard?: (card: CardType, index: number) => void;
  playerChips?: number;
  opponentChips?: number;
  pot?: number;
  revealCeremony?: boolean;
  playerGlow?: 'gold' | 'blood' | null;
  opponentGlow?: 'gold' | 'blood' | null;
  quality?: Quality;
  playerSetsWon?: number;
  opponentSetsWon?: number;
  hintCard?: CardType | null;
  /** Hide the opponent figure (e.g. the PvP waiting room's empty seat). */
  showOpponent?: boolean;
  /** Force the opponent's eye color (PvP: red when they've read your mind). */
  opponentEyeColor?: string | null;
  dealerAction?: DealerAction;
  /** Non-null starts the match-end cinematic; the scene runs its own shared timeline. */
  finale?: FinaleKind | null;
  /** Camera behaviour: seated at the table (default), lobby doorway, or the sit-down glide. */
  viewMode?: ViewMode;
  /** Equipped cosmetics. Partial is fine — missing slots fall back to the free defaults. */
  look?: Partial<Loadout>;
  /** Non-null deals the hub's menu hand. The hub has no button dock; this is it. */
  onMenuPick?: ((id: MenuCardId) => void) | null;
  /** Drives which menu card is lit. Ignored unless `onMenuPick` is set. */
  menuTutorialDone?: boolean;
}

const noop = () => {};

// The house curtain. ~4MB of models and textures ride the first load, and the old
// behaviour was Suspense fallback={null} — a silent black screen as the first thing a
// new player ever saw. This shows the door instead: name, a filling gold line, a count.
function LoadingVeil() {
  const { active, progress } = useProgress();
  const [gone, setGone] = useState(false);
  const everActive = useRef(false);
  if (active) everActive.current = true;
  useEffect(() => {
    // Cached loads never flip `active` — drop the veil after a grace tick so quality
    // remounts and back-navigation don't flash the curtain over an already-warm scene.
    const grace = setTimeout(() => { if (!everActive.current) setGone(true); }, 200);
    return () => clearTimeout(grace);
  }, []);
  useEffect(() => {
    if (everActive.current && !active && progress >= 100) {
      const t = setTimeout(() => setGone(true), 700); // let the bar be seen finishing
      return () => clearTimeout(t);
    }
  }, [active, progress]);
  if (gone) return null;
  const settled = everActive.current && !active && progress >= 100;
  return (
    <div
      className={'absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#05050a] transition-opacity duration-700 ' + (settled ? 'opacity-0 pointer-events-none' : 'opacity-100')}
    >
      <p className="font-gothic text-cracked text-4xl sm:text-5xl tracking-[10px] text-blood mb-3">弑 君</p>
      <p className="text-[10px] tracking-[8px] text-text-dim font-display uppercase mb-10">Regicide</p>
      <div className="w-56 h-px bg-border-subtle/60 relative overflow-visible">
        <div
          className="absolute inset-y-0 left-0 bg-amber transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%`, boxShadow: '0 0 8px rgba(196,154,48,0.7)' }}
        />
      </div>
      <p className="text-[10px] tracking-[4px] text-text-muted font-mono mt-4">{Math.round(progress)}%</p>
      <p className="text-[10px] tracking-[4px] text-text-dim font-display mt-8">正 在 布 置 赌 桌 …</p>
    </div>
  );
}

export default function TableScene({
  personality,
  isThinking = false,
  intensity = 0,
  opponentCard = null,
  opponentFaceDown = true,
  playerCard = null,
  roundKey = 0,
  hand = [],
  selectedIndex = null,
  canSelect = false,
  onSelectCard = noop,
  playerChips = 0,
  opponentChips = 0,
  pot = 0,
  revealCeremony = false,
  playerGlow = null,
  opponentGlow = null,
  quality = 'high',
  playerSetsWon = 0,
  opponentSetsWon = 0,
  hintCard = null,
  showOpponent = true,
  opponentEyeColor = null,
  dealerAction = 'idle',
  finale = null,
  viewMode = 'seated',
  look,
  onMenuPick = null,
  menuTutorialDone = true,
}: TableSceneProps) {
  const preset = QUALITY_PRESETS[quality];
  return (
    // Pointer events stay ON — the 3D hand fan is clickable. Overlaid UI sits above (z-10+)
    // and still receives its own clicks first.
    <div className="absolute inset-0">
      <Canvas
        // Remount when quality changes — gl options (AA, tone mapping) are creation-time only.
        key={quality}
        shadows={preset.shadows}
        dpr={preset.dpr}
        // With the post chain, tone mapping happens there (ACES) and the renderer stays linear;
        // without it (low quality), the renderer tone-maps directly.
        gl={{ antialias: preset.antialias, toneMapping: preset.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping }}
        camera={{ position: CAM_BASE, fov: 52 }}
      >
        <Suspense fallback={null}>
        <Scene
          personality={personality}
          isThinking={isThinking}
          intensity={intensity}
          opponentCard={opponentCard}
          opponentFaceDown={opponentFaceDown}
          playerCard={playerCard}
          roundKey={roundKey}
          hand={hand}
          selectedIndex={selectedIndex}
          canSelect={canSelect}
          onSelectCard={onSelectCard}
          playerChips={playerChips}
          opponentChips={opponentChips}
          pot={pot}
          revealCeremony={revealCeremony}
          playerGlow={playerGlow}
          opponentGlow={opponentGlow}
          quality={quality}
          playerSetsWon={playerSetsWon}
          opponentSetsWon={opponentSetsWon}
          hintCard={hintCard}
          showOpponent={showOpponent}
          opponentEyeColor={opponentEyeColor}
          dealerAction={dealerAction}
          finale={finale}
          viewMode={viewMode}
          look={normalizeLoadout(look)}
          onMenuPick={onMenuPick ?? null}
          menuTutorialDone={menuTutorialDone}
        />
        </Suspense>
      </Canvas>
      <LoadingVeil />
    </div>
  );
}
