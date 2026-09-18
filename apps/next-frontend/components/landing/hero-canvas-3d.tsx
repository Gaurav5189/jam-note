"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Mesh, MeshBasicMaterial } from "three";

import { silenceR3fClockDeprecation } from "./silence-r3f-clock";

// Runs when this lazy chunk is evaluated — before <Canvas> ever renders — so
// the filter is in place before R3F v9 constructs the deprecated
// THREE.Clock inside its store. Delete together with silence-r3f-clock.ts
// once @react-three/fiber v10 stable ships.
silenceR3fClockDeprecation();

const GROUND = "#222831";
const PANEL = "#393E46";
const GRID = "#4A5160";
const ACCENT = "#FFD369";
const TEXT = "#EEEEEE";

const FLOOR_Y = -2.8;
const CAMERA_Y = 3.2;
const LANE_SPAN = 36;

// Deterministic pseudo-random (mulberry32) so composition is stable across
// re-mounts instead of reshuffling on every visit.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(v: number, span: number): number {
  return ((v % span) + span) % span;
}

type Vec3 = [number, number, number];

// Lanes for the amber "signal" streaks. Motion is confined to the floor band
// at the bottom of the hero — nothing ever enters the text zone above.
const LANES: Array<{ z: number; speed: number; offset: number }> = [
  { z: -8, speed: 2.6, offset: 3 },
  { z: -12, speed: -1.8, offset: 14 },
  { z: -16, speed: 1.3, offset: 8 },
  { z: -20, speed: -2.2, offset: 20 },
  { z: -24, speed: 1.7, offset: 5 },
  { z: -28, speed: -1.1, offset: 26 },
];

// Distant static rack units — a faint skyline along the horizon. No float,
// no spin: the far band reads as architecture, not clutter.
const SKYLINE: Array<{
  x: number;
  z: number;
  w: number;
  h: number;
  opacity: number;
  accent?: boolean;
}> = [
  { x: -12, z: -22, w: 2.4, h: 1.1, opacity: 0.55 },
  { x: -8, z: -27, w: 1.7, h: 0.7, opacity: 0.5 },
  { x: -3.5, z: -31, w: 3.0, h: 1.5, opacity: 0.42 },
  { x: -0.5, z: -24, w: 2.0, h: 0.9, opacity: 0.52 },
  { x: 3, z: -29, w: 2.6, h: 1.2, opacity: 0.45 },
  { x: 7.5, z: -23, w: 1.5, h: 0.6, opacity: 0.5 },
  { x: 11, z: -26, w: 2.2, h: 1.0, opacity: 0.48 },
  { x: 13.5, z: -34, w: 2.8, h: 1.7, opacity: 0.34, accent: true },
];

// Sparse specks along the horizon band for depth. Kept low and far so the
// pixels never compete with the headline.
function Dust({ count }: { count: number }) {
  const positions = useMemo(() => {
    const rand = mulberry32(42);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (rand() - 0.5) * 40; // x ±20
      arr[i * 3 + 1] = rand() * 3.2 - 2.6; // y ∈ [-2.6, 0.6]
      arr[i * 3 + 2] = (rand() - 0.5) * 16 - 14; // z ∈ [-22, -6]
    }
    return arr;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={TEXT}
        size={0.04}
        transparent
        opacity={0.3}
        sizeAttenuation
      />
    </points>
  );
}

// Amber streaks sliding along floor lanes — data moving through the rack.
// The only motion in the scene besides the beacon, and it lives strictly
// below the text zone.
function SignalPulses() {
  const pulses = useRef<Array<Mesh | null>>([]);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;
    for (let i = 0; i < LANES.length; i += 1) {
      const m = pulses.current[i];
      if (!m) continue;
      const lane = LANES[i];
      m.position.x = wrap(lane.offset + t * lane.speed, LANE_SPAN) - LANE_SPAN / 2;
    }
  });

  return (
    <>
      {LANES.map((lane, i) => (
        <group key={lane.z}>
          {/* rail: hair-thin lane marker the pulse runs along */}
          <mesh position={[0, FLOOR_Y + 0.02, lane.z]}>
            <boxGeometry args={[LANE_SPAN, 0.016, 0.016]} />
            <meshBasicMaterial color={GRID} transparent opacity={0.18} />
          </mesh>
          {/* pulse */}
          <mesh
            ref={(m) => {
              pulses.current[i] = m;
            }}
            position={[0, FLOOR_Y + 0.06, lane.z]}
          >
            <boxGeometry args={[1.6, 0.05, 0.05]} />
            <meshBasicMaterial
              color={ACCENT}
              transparent
              opacity={0.9}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// A single distant light breathing on the skyline — quiet proof the scene is
// alive without demanding attention.
function Beacon({ position }: { position: Vec3 }) {
  const mat = useRef<MeshBasicMaterial>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (mat.current) {
      mat.current.opacity = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t.current * 0.8));
    }
  });

  return (
    <mesh position={position}>
      <boxGeometry args={[0.14, 0.14, 0.14]} />
      <meshBasicMaterial
        ref={mat}
        color={ACCENT}
        transparent
        opacity={0.4}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// Subtle pointer parallax — drifts the camera a fraction of a unit instead
// of rotating the whole scene, so the composition never sweeps under the
// text. Listened on window since the canvas never hit-tests.
function Rig() {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const cam = state.camera;
    const k = 1 - Math.exp(-2.5 * delta); // frame-rate independent smoothing
    cam.position.x += (pointer.current.x * 0.5 - cam.position.x) * k;
    cam.position.y += (CAMERA_Y - pointer.current.y * 0.25 - cam.position.y) * k;
  });

  return null;
}

// The whole composition: a calm wireframe horizon under a clean, dark text
// zone. The camera is pitched up a touch so the visible floor band sits in
// the bottom quarter of the frame; the headline area above stays empty
// ground-color space with maximum text contrast.
function SignalHorizon() {
  return (
    <>
      <color attach="background" args={[GROUND]} />
      <fog attach="fog" args={[GROUND, 12, 50]} />

      {/* Sequencer floor: identical line colors avoid the bright center
          cross a default grid helper would draw. */}
      <gridHelper args={[80, 80, GRID, GRID]} position={[0, FLOOR_Y, -10]} />

      {/* Distant rack skyline on the horizon */}
      {SKYLINE.map((unit) => (
        <mesh
          key={`${unit.x}-${unit.z}`}
          position={[unit.x, FLOOR_Y + unit.h / 2, unit.z]}
        >
          <boxGeometry args={[unit.w, unit.h, unit.w * 0.8]} />
          <meshBasicMaterial
            color={unit.accent ? ACCENT : PANEL}
            wireframe
            transparent
            opacity={unit.opacity}
          />
        </mesh>
      ))}
      <Beacon position={[7.5, FLOOR_Y + 0.6 + 0.3, -23]} />

      <Dust count={90} />
      <SignalPulses />
      <Rig />
    </>
  );
}

export default function HeroCanvas3D() {
  return (
    <Canvas
      camera={{ position: [0, CAMERA_Y, 10], fov: 52, rotation: [0.06, 0, 0] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <SignalHorizon />
    </Canvas>
  );
}
